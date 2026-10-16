/*
 * Matcha & Ainu — « couche de vie » : le plan (données pures, sans Three.js).
 *
 * Un monde vivant, façon Nintendo : partout où l'on marche, quelque chose bouge ou se
 * laisse toucher à moins de ~12 m. Ce module place, de façon déterministe (graine fixe :
 * deux amis en coop voient exactement le même monde), les bêtes, les objets à secouer,
 * les défis éclair, les traînées de paillettes, les habitants et les cachettes.
 *
 *  - les « temps forts » posés à la main (highlights) passent d'abord ;
 *  - un réseau hexagonal (un peu secoué) comble ensuite les vides, avec des règles par
 *    milieu (glace, forêt, pente…) : planLife(spec).fill ;
 *  - une dernière passe de réparation garantit qu'aucun point marchable (grille de 3 m)
 *    n'est à plus de `cover` mètres de quelque chose.
 *
 * Utilisé par le jeu (life.js) et par les tests (Node).
 */

/** Générateur pseudo-aléatoire déterministe (Park–Miller). */
export function rng(seed) { let s = (seed >>> 0) % 2147483647 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

/** Petite grille de hachage pour trouver vite le voisin le plus proche. */
export class PointGrid {
  constructor(cell) { this.cell = cell || 12; this.map = new Map(); this.n = 0; }
  key(i, j) { return i * 65536 + j; }
  add(p) { const i = Math.floor(p.x / this.cell), j = Math.floor(p.z / this.cell), k = this.key(i, j); if (!this.map.has(k)) this.map.set(k, []); this.map.get(k).push(p); this.n++; }
  /** Distance au point le plus proche (jusqu'à `max`), filtre facultatif. */
  nearest(x, z, max, filter) {
    const c = this.cell, r = Math.ceil(max / c);
    const i0 = Math.floor(x / c), j0 = Math.floor(z / c);
    let best = Infinity, bp = null;
    for (let i = i0 - r; i <= i0 + r; i++) for (let j = j0 - r; j <= j0 + r; j++) {
      const list = this.map.get(this.key(i, j));
      if (!list) continue;
      for (const p of list) {
        if (filter && !filter(p)) continue;
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < best) { best = d; bp = p; }
      }
    }
    return { d: Math.sqrt(best), p: bp };
  }
  /** Tous les points à moins de r. */
  within(x, z, r) {
    const c = this.cell, n = Math.ceil(r / c), i0 = Math.floor(x / c), j0 = Math.floor(z / c), out = [];
    for (let i = i0 - n; i <= i0 + n; i++) for (let j = j0 - n; j <= j0 + n; j++) {
      const list = this.map.get(this.key(i, j));
      if (list) for (const p of list) if ((p.x - x) ** 2 + (p.z - z) ** 2 <= r * r) out.push(p);
    }
    return out;
  }
}

const GROUPS = ['fauna', 'props', 'villagers', 'defis', 'secrets', 'trails'];

/**
 * Prépare le plan de vie d'un monde.
 * spec = {
 *   seed, extent (demi-côté du carré à couvrir), spacing (pas du réseau, ~17 m), cover (~12 m), grid (3 m),
 *   walkable(x, z) → bool, ground(x, z) → y,
 *   info(x, z) → { ice, forest, slope, … } (le « milieu », passé aux règles),
 *   highlights: { fauna: [], props: [], villagers: [], defis: [], secrets: [], trails: [] },
 *   fill: [{ type: 'fauna' | 'props', kind, w, when(x, z, info), min (écart mini entre deux du même genre), data }],
 *   avoid(x, z, type, kind) → bool (zones interdites : pistes, chemins de quête…),
 *   anchors: [{ x, z, kind }] (ce que le niveau anime déjà lui-même : comptés pour la densité, pas dessinés)
 *   place(e) (retouche d'une entrée posée), init() (appelé au début de chaque calcul)
 * }
 * Renvoie { fauna, props, villagers, defis, secrets, trails, stats }.
 */
export function planLife(spec) {
  const R = rng(spec.seed || 1);
  if (spec.init) spec.init();   // (remise à zéro de l'état du monde : perchoirs pris…)
  const ground = spec.ground || (() => 0);
  const info = spec.info || (() => ({}));
  const avoid = spec.avoid || (() => false);
  const plan = { fauna: [], props: [], villagers: [], defis: [], secrets: [], trails: [], stats: { hand: 0, lattice: 0, repair: 0 } };
  const all = new PointGrid(12), byKind = new Map();
  const kindGrid = (k) => { if (!byKind.has(k)) byKind.set(k, new PointGrid(16)); return byKind.get(k); };
  const put = (group, e) => {
    if (e.y === undefined) e.y = ground(e.x, e.z);
    plan[group].push(e);
    all.add(e);
    if (e.kind) kindGrid(e.kind).add(e);
  };
  // 1. les temps forts, posés à la main
  const H = spec.highlights || {};
  for (const g of GROUPS) for (const e of H[g] || []) {
    if (g === 'trails') {
      plan.trails.push(e);
      for (const p of e.pts) { if (p.y === undefined) p.y = ground(p.x, p.z) + 1; all.add(p); }
      continue;
    }
    put(g, Object.assign({ hand: true }, e));
    plan.stats.hand++;
  }
  // les « ancres » : ce que le niveau fait déjà vivre lui-même (personnages, chats…) ; comptées, pas dessinées
  plan.anchors = (spec.anchors || []).map(a => ({ x: a.x, z: a.z, kind: a.kind || 'anchor' }));
  for (const a of plan.anchors) all.add(a);
  // les défis comptent aussi leurs objets (pièces, anneaux…) comme « quelque chose d'intéressant »
  // (ils n'y sont que pendant le défi : on ne compte que le point de départ)

  const rules = spec.fill || [];
  const counts = new Map();
  const choose = (x, z) => {
    const inf = info(x, z);
    let tot = 0;
    const ok = [];
    for (const r of rules) {
      if (r.when && !r.when(x, z, inf)) continue;
      if (avoid(x, z, r.type, r.kind)) continue;
      if (r.min && kindGrid(r.kind).nearest(x, z, r.min).d < r.min) continue;
      if (r.max && (counts.get(r.kind) || 0) >= r.max) continue;
      ok.push(r); tot += r.w;
    }
    if (!ok.length) return null;
    let k = R() * tot;
    for (const r of ok) { k -= r.w; if (k <= 0) return r; }
    return ok[ok.length - 1];
  };
  const add = (r, x, z, why) => {
    const n = (counts.get(r.kind) || 0) + 1; counts.set(r.kind, n);
    const e = Object.assign({ id: `${r.kind}_${why[0]}${n}`, kind: r.kind, x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, rot: Math.round(R() * 628) / 100 }, r.data || {});
    if (spec.place) spec.place(e);
    put(r.type, e);
    plan.stats[why]++;
    return e;
  };
  const E = spec.extent || 180, S = spec.spacing || 17, cover = spec.cover || 12, gstep = spec.grid || 3;
  const walk = spec.walkable;
  // 2. réseau hexagonal secoué
  const rowH = S * Math.sqrt(3) / 2;
  for (let row = 0, z = -E; z <= E; row++, z += rowH) {
    for (let x = -E + (row % 2) * S / 2; x <= E; x += S) {
      let px = x + (R() - 0.5) * S * 0.3, pz = z + (R() - 0.5) * S * 0.3;
      if (!walk(px, pz)) {
        let found = false;
        for (let k = 0; k < 10 && !found; k++) { const a = R() * Math.PI * 2, d = 2 + R() * S * 0.35; if (walk(px + Math.cos(a) * d, pz + Math.sin(a) * d)) { px += Math.cos(a) * d; pz += Math.sin(a) * d; found = true; } }
        if (!found) continue;
      }
      if (all.nearest(px, pz, S).d < S * 0.55) continue;
      const r = choose(px, pz);
      if (r) add(r, px, pz, 'lattice');
    }
  }
  // 3. réparation : plus aucun trou de plus de `cover` mètres
  let open = [];
  for (let z = -E; z <= E; z += gstep) for (let x = -E; x <= E; x += gstep) if (all.nearest(x, z, cover).d > cover - 1 && walk(x, z)) open.push([x, z]);
  for (let pass = 0; pass < 3; pass++) {
    let added = 0;
    for (const [x, z] of open) {
      if (all.nearest(x, z, cover).d <= cover - 1) continue;
      // on se pose un peu plus loin dans le trou (vers le centre du vide), si c'est marchable
      const r = choose(x, z) || (pass === 2 ? rules.find(q => !q.when && !avoid(x, z, q.type, q.kind)) : null);
      if (r) { add(r, x, z, 'repair'); added++; }
    }
    if (!added) break;
    open = open.filter(([x, z]) => all.nearest(x, z, cover).d > cover - 1);
  }
  return plan;
}

/** Tous les points « vivants ou interactifs » d'un plan (pour la mesure de densité). */
export function planPoints(plan) {
  const out = [];
  for (const g of ['fauna', 'props', 'villagers', 'defis', 'secrets']) for (const e of plan[g]) out.push({ x: e.x, z: e.z, g, kind: e.kind });
  for (const t of plan.trails) for (const p of t.pts) out.push({ x: p.x, z: p.z, g: 'trails' });
  for (const a of plan.anchors || []) out.push({ x: a.x, z: a.z, g: 'anchors', kind: a.kind });
  return out;
}

/**
 * Mesure de densité : part des points tirés au hasard (marchables) qui ont quelque chose
 * de vivant ou d'interactif à moins de `radius` mètres.
 */
export function densityProbe(plan, opts) {
  const R = rng(opts.seed || 7), E = opts.extent || 180, n = opts.samples || 500, radius = opts.radius || 12;
  const grid = new PointGrid(12);
  for (const p of planPoints(plan)) grid.add(p);
  let ok = 0, tried = 0, worst = 0;
  const holes = [];
  while (tried < n) {
    const x = (R() * 2 - 1) * E, z = (R() * 2 - 1) * E;
    if (!opts.walkable(x, z)) continue;
    tried++;
    const d = grid.nearest(x, z, radius + 30).d;
    worst = Math.max(worst, Math.min(d, 99));
    if (d <= radius) ok++; else if (holes.length < 12) holes.push([Math.round(x), Math.round(z), Math.round(d)]);
  }
  return { ratio: ok / tried, samples: tried, worst, holes };
}
