/*
 * Matcha & Ainu — Niveau 2 « La Forêt des Moustaches » : décor et règles propres
 * au niveau (arbres par quartiers, champignons, lanternes, patte géante, radeau
 * de Gaston, cabanes dans les arbres, Vieux Tronc Creux, cascade, Village des
 * Hérissons, bébés hiboux, baies, repaire et combat contre la Capitaine Moustache).
 * Le moteur commun est dans game.js ; les habitants de la forêt dans forestkit.js.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as M from './models.js';
import * as W from './world.js';
import * as RT from './realtex.js';
import * as K from './farmkit.js';
import * as FK from './forestkit.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };

/** Croquette dorée (remplace l'os du niveau 1). */
export function kibbleGeometry() {
  const g = new THREE.TorusGeometry(0.2, 0.13, 10, 20);
  return g;
}

// ---------------------------------------------------------------------------
// Petits constructeurs de décor
// ---------------------------------------------------------------------------
function spotsTexture(base, spot) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 256, 64);
  x.fillStyle = spot;
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) { x.beginPath(); x.ellipse(r() * 256, 6 + r() * 34, 5 + r() * 7, 4 + r() * 5, 0, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Chapeau de champignon à dessus plat (on voit bien où se poser). */
function capGeometry(r) {
  const pts = [];
  pts.push(new THREE.Vector2(0.001, 0));
  pts.push(new THREE.Vector2(r * 0.8, 0));
  for (let i = 1; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push(new THREE.Vector2(r * 0.8 + Math.sin(a) * r * 0.2, -(1 - Math.cos(a)) * r * 0.22)); }
  pts.push(new THREE.Vector2(r * 0.95, -r * 0.34));
  pts.push(new THREE.Vector2(r * 0.25, -r * 0.4));
  pts.push(new THREE.Vector2(0.001, -r * 0.4));
  const g = new THREE.LatheGeometry(pts.reverse(), 32);
  return g;
}

/** Écorce : photo en rendu réaliste, sinon couleur unie. */
function barkMat(col, rx, ry) {
  const ph = W.LOOK.real && RT.hasPhotos() ? RT.photo('bark_willow_02', rx, ry) : null;
  return ph ? new THREE.MeshStandardMaterial({ map: ph.map, normalMap: ph.normalMap, color: 0xd8c8b8, roughness: 0.95 }) : M.mat(col, { roughness: 0.95 });
}
function stalkGeometry(rTop, rBot, h) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 18, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = 1 + Math.sin(y * 1.3 + Math.atan2(p.getZ(i), p.getX(i)) * 3) * 0.04;
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function ringsTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#e8c08a'; x.fillRect(0, 0, 128, 128);
  for (let r = 6; r < 64; r += 6 + (r % 4)) { x.strokeStyle = r % 12 ? '#c89a60' : '#b0844c'; x.lineWidth = 2; x.beginPath(); x.arc(64, 64, r, 0, 7); x.stroke(); }
  x.strokeStyle = '#8a5a30'; x.lineWidth = 6; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stripesTexture(a, b) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 8;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? b : a; x.fillRect(i * 16, 0, 16, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

function glowSprite(color, size, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTexture(), color, transparent: true, opacity: opacity === undefined ? 0.7 : opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
}

const shadowy = (o) => { o.traverse(k => { if (k.isMesh) { k.castShadow = true; k.receiveShadow = true; } }); return o; };

// ---------------------------------------------------------------------------
// La Capitaine Moustache : grand chat gris, bicorne, cache-œil et grosse moustache
// ---------------------------------------------------------------------------
export function buildCaptain() {
  const cat = M.buildCat();
  const u = cat.userData;
  const hatMat = M.mat(0x23202c, { roughness: 0.6 });
  const gold = M.mat(0xffc830, { metalness: 0.8, roughness: 0.3 });
  const hat = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 28, 1, false, 0, Math.PI), hatMat);
  brim.rotation.set(Math.PI / 2, 0, Math.PI / 2); brim.scale.set(1, 1, 0.45);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), hatMat);
  crown.scale.set(1.25, 0.9, 0.7);
  const badge = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), gold);
  badge.position.set(0, 0.18, 0.28);
  const feather = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), M.mat(0xe04a6a, { roughness: 0.7 }));
  feather.scale.set(0.25, 0.9, 0.12); feather.position.set(-0.32, 0.42, -0.05); feather.rotation.z = 0.5;
  hat.add(brim, crown, badge, feather);
  hat.position.set(0, 0.32, -0.02);
  u.head.add(hat);
  // moustache en guidon
  const mus = M.mat(0x2a2430, { roughness: 0.8 });
  for (const sx of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.08, 0.42), new THREE.Vector3(sx * 0.18, -0.1, 0.42), new THREE.Vector3(sx * 0.34, -0.02, 0.36), new THREE.Vector3(sx * 0.36, 0.08, 0.32),
    ]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.045, 8), mus);
    u.head.add(m);
  }
  // cache-œil
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), M.mat(0x111111, { roughness: 0.9 }));
  patch.position.set(0.15, 0.07, 0.425); patch.rotation.y = 0.35; u.head.add(patch);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.015, 6, 30), M.mat(0x111111));
  strap.rotation.set(0, Math.PI / 2, 0.5); strap.position.y = 0.07; u.head.add(strap);
  cat.scale.setScalar(2.1);
  // étoiles quand elle est étourdie
  const stars = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), M.mat(0xffe040, { emissive: 0xffc000, emissiveIntensity: 0.8 }));
    s.userData.noOutline = true;
    stars.add(s);
  }
  stars.position.y = 1.45; stars.visible = false;
  cat.add(stars);
  u.stars = stars;
  return cat;
}

export function buildYarn() {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 14), M.mat(0xff6ab0, { roughness: 0.9 }));
  g.add(ball);
  const thread = M.mat(0xd8407e, { roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.035, 6, 28), thread);
    r.rotation.set(i * 1.1, i * 0.7, 0);
    g.add(r);
  }
  return g;
}

// ===========================================================================
const svg = (body) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`);
const ICON_BERRY = svg('<g stroke="#3a1830" stroke-width="3"><path d="M32 14c4-8 14-9 18-6-4 1-9 4-12 9" fill="#5cb840"/><circle cx="22" cy="38" r="11" fill="#e0304a"/><circle cx="42" cy="38" r="11" fill="#5a4ad8"/><circle cx="32" cy="24" r="10" fill="#8a3ab8"/></g><circle cx="19" cy="34" r="3" fill="#fff" opacity=".7"/><circle cx="39" cy="34" r="3" fill="#fff" opacity=".7"/><circle cx="29" cy="20" r="2.6" fill="#fff" opacity=".7"/>');
const ICON_OWL = svg('<g stroke="#3a2410" stroke-width="3"><ellipse cx="32" cy="38" rx="20" ry="22" fill="#cfc4b4"/><ellipse cx="32" cy="44" rx="12" ry="13" fill="#f4ece0"/><circle cx="23" cy="28" r="8" fill="#fff"/><circle cx="41" cy="28" r="8" fill="#fff"/></g><circle cx="24" cy="29" r="4" fill="#1a120e"/><circle cx="42" cy="29" r="4" fill="#1a120e"/><path d="M29 34l3 6 3-6z" fill="#e8a030"/>');

/** Petits bruits de la forêt, joués au synthé du jeu. */
function forestSounds(game) {
  const go = (fn) => { const s = game.sfx; if (!s || !s.ok) return; try { fn(s); } catch (e) { /* pas de son */ } };
  return {
    hoot: () => go((s) => { s.tone(420, 0.25, { type: 'sine', to: 380, vol: 0.08 }); s.tone(400, 0.45, { type: 'sine', to: 330, vol: 0.08, delay: 0.32 }); }),
    peep: () => go((s) => { s.tone(1500, 0.06, { type: 'sine', to: 1900, vol: 0.05 }); s.tone(1600, 0.07, { type: 'sine', to: 2100, vol: 0.05, delay: 0.1 }); }),
    croak: () => go((s) => { s.noise(0.12, { filter: 'bandpass', freq: 380, vol: 0.25 }); s.tone(140, 0.18, { type: 'square', to: 110, vol: 0.06 }); s.noise(0.12, { filter: 'bandpass', freq: 360, vol: 0.2, delay: 0.2 }); }),
    pick: () => go((s) => { s.noise(0.2, { filter: 'bandpass', freq: 2600, freqTo: 1400, vol: 0.14 }); s.note && s.note('mallet', 81, 0.08, 0.06, 0.2); s.note && s.note('mallet', 86, 0.08, 0.14, 0.25); }),
    plop: () => go((s) => { s.tone(300, 0.12, { type: 'sine', to: 700, vol: 0.12 }); s.noise(0.15, { filter: 'lowpass', freq: 900, vol: 0.15, delay: 0.05 }); }),
    chime: () => go((s) => { if (s.note) [84, 88, 91, 96, 100].forEach((m, i) => s.note('bell', m, 0.12, i * 0.09, 0.5)); }),
  };
}

export function buildForest(game) {
  const sc = game.scene;
  const lite = game.lite;
  const S = L; // données du niveau 2
  const real = W.LOOK.real;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3(), e = new THREE.Euler();
  const moving = [];
  const chars = [];
  const snd = forestSounds(game);
  const stalkMat0 = M.mat(0xf2e6cc, { roughness: 0.8 });
  // décor par quartier : on le cache quand il est loin de la caméra (la forêt est grande)
  const cull = [];
  const place = (obj, x, z, r) => { sc.add(obj); cull.push({ obj, x, z, r: r || 12 }); return obj; };
  const area = (x, z, r) => place(new THREE.Group(), x, z, r);
  const save = () => game.save;
  const forest = () => {
    const s = game.save;
    if (!s.forest) s.forest = {};
    const f = s.forest;
    for (const [k, d] of [['owlets', []], ['pot', []], ['fairy', false], ['met', []], ['feast', false]]) if (f[k] === undefined) f[k] = Array.isArray(d) ? d.slice() : d;
    return f;
  };
  const players = () => game.players;
  const meF = () => game.me;

  // --- interface : compteurs de baies et de bébés hiboux -------------------------
  const hud = {};
  {
    const box = game.dom.root.querySelector('.adv-counts');
    const chip = (icon, max) => {
      const d = document.createElement('div');
      d.className = 'adv-count hidden';
      d.innerHTML = `<img src="${icon}" alt=""><span>0</span><small>/${max}</small>`;
      if (box) box.appendChild(d);
      return d;
    };
    hud.berries = chip(ICON_BERRY, S.BERRIES_NEEDED);
    hud.owlets = chip(ICON_OWL, S.OWLETS.length);
  }

  // =============================================================================
  // Les arbres de la forêt (par quartiers ; près de la caméra : feuillage détaillé)
  // =============================================================================
  const treeChunks = [];
  {
    const r = (() => { let s = 5; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const trunkGeo = new THREE.CylinderGeometry(0.32, 0.55, 5.2, lite ? 7 : 10, 4);
    const tp = trunkGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); if (y < -2) { const k = 1 + (-2 - y) * 0.35; tp.setX(i, tp.getX(i) * k); tp.setZ(i, tp.getZ(i) * k); } }
    trunkGeo.computeVertexNormals();
    const phb = real && RT.hasPhotos() ? RT.photo('bark_willow_02', 1.5, 2) : null;
    const trunkMat = phb ? new THREE.MeshStandardMaterial({ map: phb.map, normalMap: phb.normalMap, roughness: 0.95 }) : M.mat(0x7a4e2c, { roughness: 0.95 });
    const geoHi = W.leafClusterGeo(lite ? 10 : 16), geoLo = W.leafClusterGeo(6);
    const leafMat = W.leafMaterial();
    const ST = S.TREE_STYLE, greens = S.PALETTE.leaves;
    const CH = 56, chunks = new Map();
    for (const t of S.trees) { const k = Math.floor(t.x / CH) + ',' + Math.floor(t.z / CH); if (!chunks.has(k)) chunks.set(k, []); chunks.get(k).push(t); }
    const c = new THREE.Color();
    let bi = 0;
    for (const list of chunks.values()) {
      const blobs = [];
      list.forEach((t, ti) => {
        t._ck = treeChunks.length; t._ti = ti; t._b0 = blobs.length;
        const top = t.y + t.h, k = ST.min + Math.floor(r() * ST.extra);
        for (let i = 0; i < k; i++) {
          const a = (i / k) * Math.PI * 2 + r(), rad = i === 0 ? 0 : ST.rad * t.s;
          blobs.push({ x: t.x + Math.cos(a) * rad, y: top + (i === 0 ? 0.9 : r() * 0.8) * t.s, z: t.z + Math.sin(a) * rad, s: (i === 0 ? ST.big : ST.small + r() * 0.4) * t.s });
        }
        for (let i = 0; i < ST.bushes; i++) {
          const a = r() * Math.PI * 2, bx = t.x + Math.cos(a) * 1.6, bz = t.z + Math.sin(a) * 1.6;
          blobs.push({ x: bx, y: S.heightAt(bx, bz) + 0.25, z: bz, s: 0.55 + r() * 0.3, bush: true });
        }
        t._b1 = blobs.length;
      });
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
      list.forEach((t, i) => {
        m4.compose(v.set(t.x, t.y + 2.4 * t.h / 5, t.z), q.setFromEuler(e.set(0, r() * 6, (r() - 0.5) * 0.08)), sv.set(t.s, t.h / 5, t.s));
        trunks.setMatrixAt(i, m4);
      });
      const mk = (geo) => {
        const inst = new THREE.InstancedMesh(geo, leafMat, blobs.length);
        inst.customDepthMaterial = W.leafDepthMaterial();
        return inst;
      };
      const hi = mk(geoHi), lo = mk(geoLo);
      blobs.forEach((b, i) => {
        m4.compose(v.set(b.x, b.y, b.z), q.setFromEuler(e.set(r(), r(), r())), sv.set(b.s, b.s * 0.9, b.s));
        hi.setMatrixAt(i, m4); lo.setMatrixAt(i, m4);
        c.set(greens[(bi++) % greens.length]).offsetHSL(0, real ? -0.14 : 0, b.bush ? -0.04 : (r() - 0.5) * 0.06);
        hi.setColorAt(i, c); lo.setColorAt(i, c);
      });
      const g = new THREE.Group();
      for (const o of [trunks, hi, lo]) { o.computeBoundingSphere(); o.castShadow = true; o.receiveShadow = true; o.userData.noOutline = true; g.add(o); }
      lo.castShadow = !lite;
      sc.add(g);
      let cx = 0, cz = 0; for (const t of list) { cx += t.x; cz += t.z; } cx /= list.length; cz /= list.length;
      treeChunks.push({ g, hi, lo, trunks, blobs, fringe: null, x: cx, z: cz });
    }
    // qualité « ultra » : les arbres les plus proches du départ deviennent de vrais arbres scannés
    const T = real && RT.isUltra() ? RT.scanTree() : null;
    if (T) {
      const zero = new THREE.Matrix4().makeScale(0, 0, 0), parts = { trunk: [], branches: [], leaves: [] };
      const order = S.trees.slice().sort((a, b) => Math.hypot(a.x - S.START.x, a.z - S.START.z) - Math.hypot(b.x - S.START.x, b.z - S.START.z)).slice(0, 8);
      for (const t of order) {
        const ch = treeChunks[t._ck];
        ch.trunks.setMatrixAt(t._ti, zero);
        for (let k = t._b0; k < t._b1; k++) if (!ch.blobs[k].bush) { ch.hi.setMatrixAt(k, zero); ch.lo.setMatrixAt(k, zero); }
        ch.trunks.instanceMatrix.needsUpdate = ch.hi.instanceMatrix.needsUpdate = ch.lo.instanceMatrix.needsUpdate = true;
        const k = t.h / 19 * 1.15;
        m4.compose(v.set(t.x, t.y - 0.1, t.z), q.setFromEuler(e.set(0, (t.x * 13 + t.z * 7) % 6.28, 0)), sv.set(k, k, k));
        for (const p in parts) parts[p].push(m4.clone());
      }
      for (const p of ['trunk', 'branches', 'leaves']) {
        const leaf = p === 'leaves';
        const mat = new THREE.MeshStandardMaterial({ map: T[p].tex, roughness: leaf ? 0.75 : 0.9, side: THREE.DoubleSide, alphaTest: leaf ? 0.5 : 0 });
        const inst = new THREE.InstancedMesh(T[p].geo, mat, parts[p].length);
        parts[p].forEach((mm, j) => inst.setMatrixAt(j, mm));
        if (leaf) inst.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: T[p].tex, alphaTest: 0.5 });
        inst.castShadow = true; inst.receiveShadow = true; inst.userData.noOutline = true;
        place(inst, S.START.x, S.START.z - 20, 60);
      }
    }
    // rendu réaliste : une frange de feuilles autour des couronnes proches (ordinateur)
    if (real && !lite) for (const ch of treeChunks) {
      const fg = new THREE.Group();
      W.buildLeafFringe(fg, ch.hi, ch.blobs, { lite }, 6);
      if (fg.children.length) { ch.fringe = fg; ch.g.add(fg); fg.traverse(o => { o.userData.noOutline = true; }); }
    }
    // rendu réaliste : des fougères au pied de quelques arbres
    const F = real ? RT.plant('fern_02') : null;
    if (F) {
      const spots = [], max = lite ? 40 : 160;
      for (const t of S.trees) {
        if (spots.length >= max) break;
        if (r() < 0.4) continue;
        const a = r() * Math.PI * 2, d = 1.2 + r() * 1.4, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
        if (W.onPath(x, z) || S.inWater(x, z, 0.5)) continue;
        spots.push([x, z, 0.6 + r() * 0.6]);
      }
      const mat = new THREE.MeshStandardMaterial({ map: F.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
      const inst = new THREE.InstancedMesh(F.geo, mat, spots.length);
      inst.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: F.tex, alphaTest: 0.5 });
      spots.forEach(([x, z, k], i) => { m4.compose(v.set(x, S.heightAt(x, z) - 0.02, z), q.setFromEuler(e.set(0, r() * 6.28, 0)), sv.set(k, k, k)); inst.setMatrixAt(i, m4); });
      inst.castShadow = !lite; inst.receiveShadow = true; inst.userData.noOutline = true; inst.computeBoundingSphere();
      sc.add(inst);
    }
  }

  // --- Petits champignons au pied des arbres (sous-bois enchanté) --------------------
  {
    const r = (() => { let s2 = 77; return () => (s2 = (s2 * 16807) % 2147483647) / 2147483647; })();
    const spots = [];
    for (const t of S.trees) {
      if (r() < 0.45) continue;
      const n = 2 + Math.floor(r() * 3), a0 = r() * 6.28, d0 = 1.4 + r() * 1.4;
      for (let i = 0; i < n; i++) {
        const a = a0 + (r() - 0.5) * 1.2, d = d0 + (r() - 0.5) * 0.9, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
        if (W.onPath(x, z)) continue;
        spots.push([x, S.heightAt(x, z), z, 0.55 + r() * 0.6, r() < 0.62 ? 0 : 1]);
      }
    }
    const capR = new THREE.MeshStandardMaterial({ map: spotsTexture('#e0453a', '#fff4e8'), roughness: 0.6 });
    const capB = new THREE.MeshStandardMaterial({ map: spotsTexture('#c8823a', '#f6dcb0'), roughness: 0.7 });
    for (const [k, mat] of [[0, capR], [1, capB]]) {
      const list = spots.filter(p => p[4] === k);
      const caps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.75, 1), mat, list.length);
      const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.1, 0.36, 7), stalkMat0, list.length);
      list.forEach(([x, y, z, sc2], i) => {
        m4.compose(v.set(x, y + 0.3 * sc2, z), q.setFromEuler(e.set((r() - 0.5) * 0.3, r() * 6, (r() - 0.5) * 0.3)), sv.setScalar(sc2)); caps.setMatrixAt(i, m4);
        m4.compose(v.set(x, y + 0.18 * sc2, z), q.identity(), sv.setScalar(sc2)); stems.setMatrixAt(i, m4);
      });
      for (const o of [caps, stems]) { o.castShadow = !lite; o.receiveShadow = true; o.computeBoundingSphere(); sc.add(o); }
    }
  }

  // --- Tour des Champignons ---------------------------------------------------
  const stalkMat = stalkMat0;
  const TW = S.TOWER;
  const towerG = area(TW.x, TW.z, 16);
  const stalk = new THREE.Mesh(stalkGeometry(TW.stalkR * 0.85, TW.stalkR * 1.25, S.TOWER_TOP - TW.base + 1.5), stalkMat);
  stalk.position.set(TW.x, TW.base - 1.5 + (S.TOWER_TOP - TW.base + 1.5) / 2, TW.z);
  towerG.add(shadowy(stalk));
  const capCols = [['#e0453a', '#fff4e8'], ['#f08a2a', '#fff2cc'], ['#a066e0', '#f4e8ff'], ['#e85a9a', '#fff0f6']];
  const capMats = capCols.map(([a, b]) => new THREE.MeshStandardMaterial({ map: spotsTexture(a, b), roughness: 0.6 }));
  const underMat = M.mat(0xf6e2c0, { roughness: 0.9 });
  const addCap = (parent, x, top, z, r, matI) => {
    const g = capGeometry(r);
    const m = new THREE.Mesh(g, capMats[matI % capMats.length]);
    m.position.set(x, top, z);
    parent.add(shadowy(m));
    const under = new THREE.Mesh(new THREE.CircleGeometry(r * 0.93, 28), underMat);
    under.rotation.x = Math.PI / 2; under.position.set(x, top - r * 0.38, z);
    parent.add(under);
    return m;
  };
  S.towerCaps.forEach((c, i) => {
    addCap(towerG, c.x, c.top, c.z, c.r * 1.08, i);
    const len = 3.2;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, len, 10), stalkMat);
    arm.position.set((c.x + TW.x) / 2, c.top - 0.9, (c.z + TW.z) / 2);
    arm.rotation.set(0, -c.a, 0); arm.rotateZ(Math.PI / 2 + 0.45);
    towerG.add(shadowy(arm));
  });
  addCap(towerG, TW.x, S.TOWER_TOP, TW.z, S.TOWER_TOP_R + 0.2, 0);

  // --- Champignons rebondissants ---------------------------------------------
  const bounceMat = new THREE.MeshStandardMaterial({ map: spotsTexture('#ff5ab8', '#ffe8f6'), roughness: 0.5, emissive: 0x401030, emissiveIntensity: 0.3 });
  const bouncers = S.bouncers.map((b) => {
    const g = new THREE.Group();
    const h = b.top - b.base;
    const st = new THREE.Mesh(stalkGeometry(b.r * 0.35, b.r * 0.5, h + 0.4), stalkMat);
    st.position.y = (h + 0.4) / 2 - 0.4;
    const cap = new THREE.Mesh(capGeometry(b.r * 1.12), bounceMat);
    cap.position.y = h;
    g.add(st, cap);
    g.position.set(b.x, b.base, b.z);
    place(shadowy(g), b.x, b.z, 4);
    return { def: b, g, cap, h };
  });

  // --- Le lac du hibou : souche-tremplin, Mère Hulotte et son nid --------------------
  const lakeG = area(S.SPOTS.lake.x, S.SPOTS.lake.z, 26);
  {
    const ST = S.STUMP, h = ST.top - ST.base + 1;
    const bark = barkMat(0x7a5030, 4, 2);
    const trunk = new THREE.Mesh(stalkGeometry(ST.r, ST.r * 1.2, h), bark);
    trunk.position.set(ST.x, ST.base - 1 + h / 2, ST.z);
    lakeG.add(shadowy(trunk));
    const top = new THREE.Mesh(new THREE.CircleGeometry(ST.r * 0.98, 32), new THREE.MeshStandardMaterial({ map: ringsTexture(), roughness: 0.9 }));
    top.rotation.x = -Math.PI / 2; top.position.set(ST.x, ST.top + 0.02, ST.z);
    lakeG.add(top);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + 0.4;
      const root = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 2, 4, 10), bark);
      root.position.set(ST.x + Math.cos(a) * 2.5, ST.base + 0.2, ST.z + Math.sin(a) * 2.5);
      root.rotation.set(0, -a, 0); root.rotateZ(Math.PI / 2 - 0.4);
      lakeG.add(shadowy(root));
    }
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), M.mat(0xf4f4f4));
    pole.position.set(ST.x - 1.4, ST.top + 1.1, ST.z - 1); lakeG.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), M.mat(0x3a9ae0, { side: THREE.DoubleSide }));
    flag.position.set(ST.x - 0.9, ST.top + 1.9, ST.z - 1); lakeG.add(flag);
  }
  // le nid (une couronne de brindilles) et Mère Hulotte
  const nest = new THREE.Group();
  {
    const twig = M.mat(0x8a6038, { roughness: 1 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.32, 8, 20), twig);
    ring.rotation.x = Math.PI / 2; ring.scale.set(1, 1, 0.7); ring.position.y = 0.2; nest.add(ring);
    const bed = new THREE.Mesh(new THREE.CircleGeometry(0.9, 18), M.mat(0xc8a070, { roughness: 1 }));
    bed.rotation.x = -Math.PI / 2; bed.position.y = 0.12; nest.add(bed);
    for (let i = 0; i < 10; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5), twig);
      const a = i * 0.63;
      s.position.set(Math.cos(a) * 0.95, 0.3, Math.sin(a) * 0.95); s.rotation.set(0.3, a, 1.2 + (i % 3) * 0.2); nest.add(s);
    }
    nest.position.set(S.NEST.x, S.NEST.y, S.NEST.z);
    lakeG.add(shadowy(nest));
  }
  const hulotte = FK.buildOwl({ shawl: true });
  hulotte.position.set(S.HULOTTE.x, S.HULOTTE.y, S.HULOTTE.z);
  hulotte.rotation.y = Math.atan2(S.STUMP.x - S.HULOTTE.x, S.STUMP.z - S.HULOTTE.z);
  lakeG.add(hulotte); chars.push(hulotte);

  // --- Patte géante (interrupteur) et feuilles magiques -----------------------
  const SW = S.SWITCH;
  const pawMat = new THREE.MeshStandardMaterial({ color: 0x6ad84a, emissive: 0x2a8a1a, emissiveIntensity: 0.4, roughness: 0.5 });
  const pawPlate = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(SW.r, SW.r * 1.1, 0.3, 28), M.mat(0x8a6a4a, { roughness: 0.9 }));
  plate.position.y = 0.1;
  pawPlate.add(plate);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 20), pawMat);
  pad.position.set(0, 0.28, 0.15); pad.scale.set(1.1, 1, 0.9); pawPlate.add(pad);
  for (const [tx, tz] of [[-0.55, -0.35], [-0.2, -0.65], [0.2, -0.65], [0.55, -0.35]]) {
    const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 14), pawMat);
    toe.position.set(tx, 0.28, tz); pawPlate.add(toe);
  }
  pawPlate.position.set(SW.x, SW.y, SW.z);
  lakeG.add(shadowy(pawPlate));
  const pawGlow = glowSprite(0x8aff6a, 3.5, 0.0);
  pawGlow.position.set(SW.x, SW.y + 0.6, SW.z); lakeG.add(pawGlow);

  const leafMat = new THREE.MeshStandardMaterial({ color: 0x5ad040, emissive: 0x1a6a10, emissiveIntensity: 0.35, roughness: 0.6, transparent: true, opacity: 1 });
  const leafGeo = (() => {
    const sh = new THREE.Shape();
    sh.moveTo(0, -1.9);
    sh.bezierCurveTo(1.5, -1.2, 1.7, 0.8, 0, 1.9);
    sh.bezierCurveTo(-1.7, 0.8, -1.5, -1.2, 0, -1.9);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.18, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -0.24, 0);
    return g;
  })();
  const veinMat = M.mat(0x3a9a2a);
  const leaves = S.leaves.map((l, i) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(leafGeo, leafMat);
    const vein = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 3.4), veinMat); vein.position.y = 0.02;
    g.add(m, vein);
    g.position.set(l.x, l.top, l.z);
    g.rotation.y = 0.9 + i * 0.4;
    g.scale.setScalar(0.001);
    g.visible = false;
    sc.add(shadowy(g));
    moving.push(g);
    return { def: l, g, k: 0 };
  });

  // --- Campement des chats ---------------------------------------------------
  const campG = area(S.CAMPFIRE.x, S.CAMPFIRE.z, 18);
  const tentMat = new THREE.MeshStandardMaterial({ map: stripesTexture('#d83a3a', '#f6efe0'), roughness: 0.8 });
  for (const t of S.tents) {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(2, 2.6, 6, 1, true), tentMat);
    tent.material.side = THREE.DoubleSide;
    tent.position.set(t.x, t.y + 1.3, t.z); tent.rotation.y = t.rot;
    campG.add(shadowy(tent));
    const door = new THREE.Mesh(new THREE.CircleGeometry(0.55, 3), M.mat(0x2a1608));
    door.position.set(t.x + Math.sin(t.rot) * 1.55, t.y + 0.45, t.z + Math.cos(t.rot) * 1.55);
    door.rotation.y = t.rot; door.rotation.z = Math.PI / 2;
    campG.add(door);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), M.mat(0xffc830, { metalness: 0.6, roughness: 0.3 }));
    tip.position.set(t.x, t.y + 2.65, t.z); campG.add(tip);
  }
  const CF = S.CAMPFIRE;
  const makeFire = (scale) => {
    const fire = new THREE.Group();
    const logMat = barkMat(0x6a4024, 0.5, 1);
    for (let i = 0; i < 4; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.6, 8), logMat);
      log.rotation.set(Math.PI / 2 - 0.35, i * Math.PI / 2, 0); log.position.y = 0.3;
      fire.add(log);
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), M.mat(0x8a847a, { roughness: 0.9 }));
      st.position.set(Math.cos(a) * 1.05, 0.12, Math.sin(a) * 1.05); fire.add(st);
    }
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.9 });
    const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffe060, transparent: true, opacity: 0.95 });
    const flames = [];
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.35 - i * 0.08, 1.1 - i * 0.2, 8), i ? flameMat2 : flameMat);
      f.position.set((i - 1) * 0.15, 0.85, (i % 2) * 0.12); f.userData.noOutline = true;
      fire.add(f); flames.push(f);
    }
    const glow = glowSprite(0xff9a30, 5, 0.6);
    glow.position.y = 1.1; fire.add(glow);
    fire.scale.setScalar(scale || 1);
    return { fire, flames, glow };
  };
  const campFire = makeFire(1);
  campFire.fire.position.set(CF.x, CF.y, CF.z);
  campG.add(campFire.fire);
  {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 8), M.mat(0x6a4024));
    pole.position.set(CF.x + 3.5, CF.y + 2.5, CF.z - 8.5); campG.add(shadowy(pole));
    const c = document.createElement('canvas'); c.width = 128; c.height = 80;
    const x = c.getContext('2d');
    x.fillStyle = '#20202a'; x.fillRect(0, 0, 128, 80);
    x.fillStyle = '#fff'; x.beginPath(); x.arc(64, 38, 18, 0, 7); x.fill();
    x.beginPath(); x.moveTo(48, 26); x.lineTo(44, 8); x.lineTo(58, 22); x.fill();
    x.beginPath(); x.moveTo(80, 26); x.lineTo(84, 8); x.lineTo(70, 22); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(30, 50); x.quadraticCurveTo(64, 70, 98, 50); x.stroke();
    x.fillStyle = '#20202a'; x.beginPath(); x.arc(57, 36, 4, 0, 7); x.arc(71, 36, 4, 0, 7); x.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.25), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(CF.x + 4.5, CF.y + 4.3, CF.z - 8.5);
    campG.add(flag);
  }

  // --- Arbres géants (et les 4 arbres des cabanes) -------------------------------
  {
    const bark = barkMat(0x6a4428, 3, 5);
    const blobGeo = W.leafClusterGeo(lite ? 6 : 10);
    const blobs = [], trunkM = [], rootM = [];
    const list = S.giants.concat(S.TREEHOUSES.map(t => ({ x: t.x, z: t.z, y: t.y, s: 1.1 })));
    for (const g of list) {
      const h = 16 * g.s + 1;
      trunkM.push([g.x, g.y - 1 + h / 2, g.z, g.s, h]);
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + g.x;
        rootM.push([g.x + Math.cos(a) * 1.9 * g.s, g.y + 0.15, g.z + Math.sin(a) * 1.9 * g.s, a, g.s]);
      }
      const top = g.y + 15 * g.s;
      blobs.push([g.x, top + 1.5 * g.s, g.z, 4.2 * g.s]);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + g.z;
        blobs.push([g.x + Math.cos(a) * 4 * g.s, top - 0.5 + (i % 2) * 1.2, g.z + Math.sin(a) * 4 * g.s, 3 * g.s]);
      }
    }
    const tI = new THREE.InstancedMesh(stalkGeometry(1.1, 1.8, 1), bark, trunkM.length);
    trunkM.forEach(([x, y, z, s, h], i) => { m4.compose(v.set(x, y, z), q.identity(), sv.set(s, h, s)); tI.setMatrixAt(i, m4); });
    const rI = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.4, 1.8, 4, 8), bark, rootM.length);
    rootM.forEach(([x, y, z, a, s], i) => {
      const o = new THREE.Object3D(); o.position.set(x, y, z); o.rotation.set(0, -a, 0); o.rotateZ(Math.PI / 2 - 0.4); o.scale.setScalar(s); o.updateMatrix();
      rI.setMatrixAt(i, o.matrix);
    });
    const inst = new THREE.InstancedMesh(blobGeo, W.leafMaterial(), blobs.length);
    inst.customDepthMaterial = W.leafDepthMaterial();
    const c = new THREE.Color();
    const cols = S.PALETTE.leaves;
    blobs.forEach(([x, y, z, s], i) => {
      m4.compose(v.set(x, y, z), q.setFromEuler(e.set(i, i * 1.7, 0)), sv.set(s, s * 0.8, s));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, c.set(cols[(i * 3) % cols.length]).offsetHSL(0, real ? -0.14 : 0, 0));
    });
    for (const o of [tI, rI, inst]) { o.castShadow = o.receiveShadow = true; o.computeBoundingSphere(); sc.add(o); }
    inst.userData.noOutline = true;
    if (real && !lite) W.buildLeafFringe(sc, inst, blobs.map(([x, y, z, s]) => ({ x, y, z, s })), { lite }, 12);
  }

  // --- Rochers à grimper (lanterne de la plage, croquettes) ---------------
  {
    const rm = W.rockMat();
    S.rocks.forEach((r, i) => {
      const hgt = r.top - r.y + 1.2;
      const m = new THREE.Mesh(W.rockGeometry(500 + i, r.r * 1.3, hgt / 2, r.r * 1.3), rm);
      const top = W.flattenRockTop(m.geometry, hgt / 2 * 0.4);
      m.position.set(r.x, r.top - top + 0.03, r.z);
      place(shadowy(m), r.x, r.z, 5);
    });
  }

  // --- Repaire : rochers, porte, bannière ----------------------------------------
  const arenaG = area(S.ARENA.x, S.ARENA.z, 18);
  {
    const rm = W.rockMat();
    S.arenaRocks.forEach((r, i) => {
      const m = new THREE.Mesh(W.rockGeometry(300 + i, 1.8, r.h / 2 + 0.6, 1.8), rm);
      m.position.set(r.x, r.y + r.h / 2 - 0.5, r.z);
      arenaG.add(shadowy(m));
    });
  }
  const G = S.GATE;
  const woodMap = M.buildCrate().material.map;
  const plankMat = M.mat(0xb07840, { roughness: 0.85 }).clone();
  if (woodMap) { plankMat.map = woodMap; plankMat.color.set(0xd8a070); }
  const gate = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.62, 3.6, 0.35), plankMat);
    p.position.set((i - 2) * 0.66, 1.8, 0);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.5, 4), plankMat);
    tip.position.set((i - 2) * 0.66, 3.85, 0); tip.rotation.y = Math.PI / 4;
    gate.add(p, tip);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 0.2), M.mat(0x5a3a20));
  bar.position.set(0, 2.4, 0.25); gate.add(bar);
  gate.position.set(G.x, S.ARENA.y, G.z);
  sc.add(shadowy(gate));
  moving.push(gate);
  {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#5a3a20'; x.fillRect(0, 0, 256, 64);
    x.fillStyle = '#ffd860'; x.font = 'bold 30px Fredoka, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('REPAIRE', 128, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 0.15), [plankMat, plankMat, plankMat, plankMat, new THREE.MeshStandardMaterial({ map: t }), plankMat]);
    board.position.set(G.x, S.ARENA.y + 5.2, G.z + 0.3);
    arenaG.add(board);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5.6, 8), plankMat);
      post.position.set(G.x + sx * 2.1, S.ARENA.y + 2.8, G.z + 0.3); arenaG.add(shadowy(post));
    }
  }

  // --- Bois : pont, rondins, pontons, cabanes ---------------------------------------
  const woodMat = new THREE.MeshStandardMaterial({ map: K.plankTex(0xc89a66, 1, 1), roughness: 0.85 });
  const darkWood = M.mat(0x6a4426, { roughness: 0.9 });
  const ropeMat = M.mat(0xd8c08a, { roughness: 1 });
  // le grand pont
  {
    const B = S.BRIDGE, len = B.z1 - B.z0, g = area(B.x, (B.z0 + B.z1) / 2, len / 2 + 4);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(B.w, 0.4, len), woodMat);
    deck.position.set(B.x, B.top - 0.2, (B.z0 + B.z1) / 2); g.add(shadowy(deck));
    const posts = [], rails = [];
    for (const sx of [-1, 1]) {
      for (let z = B.z0 + 0.6; z <= B.z1 - 0.5; z += 2.2) posts.push([B.x + sx * (B.w / 2 - 0.12), z]);
      rails.push(sx);
    }
    const pI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.12, 1.2, 8), darkWood, posts.length);
    posts.forEach(([x, z], i) => { m4.compose(v.set(x, B.top + 0.5, z), q.identity(), sv.set(1, 1, 1)); pI.setMatrixAt(i, m4); });
    g.add(shadowy(pI));
    for (const sx of rails) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, len - 0.6), darkWood);
      r.position.set(B.x + sx * (B.w / 2 - 0.12), B.top + 1.05, (B.z0 + B.z1) / 2); g.add(shadowy(r));
    }
    for (const z of [B.z0 + 1, B.z1 - 1, (B.z0 + B.z1) / 2]) for (const sx of [-1, 1]) {
      const pile = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 5, 8), darkWood);
      pile.position.set(B.x + sx * (B.w / 2 - 0.2), B.top - 2.6, z); g.add(pile);
    }
  }
  // les rondins (ils dansent un peu sur l'eau)
  const logMeshes = S.LOGS.map((l, i) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(l.r, l.r * 1.05, 2.2, 14), barkMat(0x7a5030, 1, 1));
    const top = new THREE.Mesh(new THREE.CircleGeometry(l.r * 0.96, 18), new THREE.MeshStandardMaterial({ map: ringsTexture(), roughness: 0.9 }));
    top.rotation.x = -Math.PI / 2; top.position.y = 1.11;
    m.add(top);
    m.position.set(l.x, l.top - 1.1, l.z);
    place(shadowy(m), l.x, l.z, 3);
    return { m, l, ph: i * 1.3 };
  });
  // les pontons
  for (const D of S.DOCKS) {
    const g = area(D.x, D.z, 8);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.3, D.len + 1.6), woodMat);
    deck.position.set(D.x, D.top - 0.15, D.z); deck.rotation.y = D.yaw; g.add(shadowy(deck));
    for (const o of [-D.len / 2, 0, D.len / 2]) for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 3.4, 8), darkWood);
      p.position.set(D.x + D.nx * o - D.nz * sx * 1.0, D.top - 1.2, D.z + D.nz * o + D.nx * sx * 1.0); g.add(p);
    }
    // une cloche sur un poteau (pour appeler le radeau)
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.4, 8), darkWood);
    const px = D.x + D.nx * (D.len / 2 - 0.3) + D.nz * 0.85, pz = D.z + D.nz * (D.len / 2 - 0.3) - D.nx * 0.85;
    post.position.set(px, D.top + 1.2, pz); g.add(post);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.26, 0.34, 12, 1, true), M.mat(0xffc830, { metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide }));
    bell.position.set(px, D.top + 2.25, pz); g.add(bell);
  }
  // le radeau de Gaston
  const raftMesh = FK.buildRaft(S.RAFT.r);
  sc.add(raftMesh); moving.push(raftMesh);
  const gaston = FK.buildFrog();
  gaston.position.set(0, 0.32, -S.RAFT.r * 0.62);
  raftMesh.add(gaston);
  const raftShadow = game.makeShadow(S.RAFT.r);
  // les cabanes dans les arbres
  const thG = area(S.SPOTS.treehouses.x, S.SPOTS.treehouses.z, 36);
  {
    const T = S.TH_TOP;
    for (const t of S.TREEHOUSES) {
      const deck = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, 0.35, 28), woodMat);
      deck.position.set(t.x, T - 0.175, t.z); thG.add(shadowy(deck));
      // garde-corps (on laisse des ouvertures vers les ponts)
      const open = [];
      S.ROPE_BRIDGES.forEach(b => {
        if (Math.hypot(b.x0 - t.x, b.z0 - t.z) < t.r + 0.5) open.push(Math.atan2(b.z0 - t.z, b.x0 - t.x));
        if (Math.hypot(b.x1 - t.x, b.z1 - t.z) < t.r + 0.5) open.push(Math.atan2(b.z1 - t.z, b.x1 - t.x));
      });
      if (t.id === 0) { const s = S.TH_STEPS[S.TH_STEPS.length - 1]; open.push(Math.atan2(s.z - t.z, s.x - t.x)); }
      const n = 22, posts = [];
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        if (open.some(o => Math.abs(((a - o + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.42)) continue;
        posts.push(a);
      }
      const pI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.08, 1.0, 6), darkWood, posts.length);
      posts.forEach((a, i) => { m4.compose(v.set(t.x + Math.cos(a) * (t.r - 0.15), T + 0.5, t.z + Math.sin(a) * (t.r - 0.15)), q.identity(), sv.set(1, 1, 1)); pI.setMatrixAt(i, m4); });
      thG.add(pI);
      for (let i = 1; i < posts.length; i++) {
        const a0 = posts[i - 1], a1 = posts[i];
        if (a1 - a0 > (Math.PI * 2 / n) * 1.5) continue;
        const x0 = t.x + Math.cos(a0) * (t.r - 0.15), z0 = t.z + Math.sin(a0) * (t.r - 0.15), x1 = t.x + Math.cos(a1) * (t.r - 0.15), z1 = t.z + Math.sin(a1) * (t.r - 0.15);
        const rl = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, Math.hypot(x1 - x0, z1 - z0), 5), ropeMat);
        rl.position.set((x0 + x1) / 2, T + 0.95, (z0 + z1) / 2);
        rl.lookAt(x1, T + 0.95, z1); rl.rotateX(Math.PI / 2);
        thG.add(rl);
      }
      // un toit de cabane, en feuilles, sur 3 poteaux
      if (t.id % 2 === 1 || t.id === 0) {
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 8), M.mat(t.id === 0 ? 0xd06a3a : 0x5a9a3c, { roughness: 0.9 }));
        const ra = t.id * 1.7 + 0.5, rx = t.x + Math.cos(ra) * 2.0, rz = t.z + Math.sin(ra) * 2.0;
        roof.position.set(rx, T + 3.4, rz); thG.add(shadowy(roof));
        for (let k = 0; k < 3; k++) {
          const a = k * 2.09 + ra;
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.8, 6), darkWood);
          p.position.set(rx + Math.cos(a) * 1.6, T + 1.4, rz + Math.sin(a) * 1.6); thG.add(p);
        }
      }
    }
    // l'escalier qui tourne autour du premier arbre
    const sI = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 0.3, 14), woodMat, S.TH_STEPS.length);
    S.TH_STEPS.forEach((s, i) => { m4.compose(v.set(s.x, s.top - 0.15, s.z), q.identity(), sv.set(s.r, 1, s.r)); sI.setMatrixAt(i, m4); });
    thG.add(shadowy(sI));
    const sp = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 6), darkWood, S.TH_STEPS.length);
    S.TH_STEPS.forEach((s, i) => { const h = s.top - S.TREEHOUSES[0].y; m4.compose(v.set(s.x, S.TREEHOUSES[0].y + h / 2 - 0.2, s.z), q.identity(), sv.set(1, h, 1)); sp.setMatrixAt(i, m4); });
    thG.add(sp);
    // les ponts de cordes : planches et deux cordes de chaque côté (un peu en creux)
    let nPl = 0; for (const b of S.ROPE_BRIDGES) nPl += Math.ceil(b.len / 0.55);
    const plI = new THREE.InstancedMesh(new THREE.BoxGeometry(2.0, 0.12, 0.42), woodMat, nPl);
    let j = 0;
    for (const b of S.ROPE_BRIDGES) {
      const n = Math.ceil(b.len / 0.55);
      for (let k = 0; k < n; k++) {
        const u = (k + 0.5) / n, x = b.x0 + (b.x1 - b.x0) * u, z = b.z0 + (b.z1 - b.z0) * u;
        m4.compose(v.set(x, T - 0.08 - Math.sin(u * Math.PI) * 0.12, z), q.setFromEuler(e.set(0, b.yaw, (k % 3 - 1) * 0.03)), sv.set(1, 1, 1));
        plI.setMatrixAt(j++, m4);
      }
      for (const sx of [-1, 1]) {
        const nx = Math.cos(b.yaw) * sx, nz = -Math.sin(b.yaw) * sx;
        const pts = [];
        for (let k = 0; k <= 10; k++) { const u = k / 10; pts.push(new THREE.Vector3(b.x0 + (b.x1 - b.x0) * u + nx * 1.05, T + 1.0 - Math.sin(u * Math.PI) * 0.35, b.z0 + (b.z1 - b.z0) * u + nz * 1.05)); }
        thG.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.05, 5), ropeMat));
        for (let k = 1; k < 10; k += 2) {
          const p = pts[k];
          const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0 - Math.sin(k / 10 * Math.PI) * 0.35, 4), ropeMat);
          st.position.set(p.x, (p.y + T - Math.sin(k / 10 * Math.PI) * 0.12) / 2, p.z); thG.add(st);
        }
      }
    }
    thG.add(shadowy(plI));
  }
  // Pistache l'écureuil, sur la première cabane
  const pistache = FK.buildSquirrel();
  {
    const P = S.FRIENDS.pistache;
    pistache.position.set(P.x, P.y, P.z); pistache.rotation.y = P.yaw;
    thG.add(pistache); chars.push(pistache);
  }

  // --- Le Vieux Tronc Creux (cristaux qui brillent) -------------------------------
  const HO = S.HOLLOW;
  const hollowG = area(HO.x, HO.z, 12);
  const crystalMats = [];
  {
    const bark = barkMat(0x6a4a30, 6, 2);
    const half = (HO.door / 2 + 0.9) / HO.r;   // demi-ouverture de la porte (radians)
    const wall = (r, h) => {
      const g = new THREE.CylinderGeometry(r, r * 1.08, h, 44, 4, true, half, Math.PI * 2 - half * 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), a = Math.atan2(p.getX(i), p.getZ(i));
        if (y > h / 2 - 0.01) p.setY(i, y + Math.sin(a * 7) * 0.5 + Math.sin(a * 13 + 1) * 0.3);   // bord déchiqueté
        const k = 1 + Math.sin(a * 9 + y) * 0.03; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
      }
      g.computeVertexNormals();
      return g;
    };
    const outer = new THREE.Mesh(wall(HO.r + 0.85, HO.h + 1), bark);
    outer.position.set(HO.x, HO.y + (HO.h + 1) / 2 - 1, HO.z);
    const inner = new THREE.Mesh(wall(HO.r - 0.8, HO.h + 1), new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 1, side: THREE.BackSide }));
    inner.position.copy(outer.position);
    hollowG.add(shadowy(outer), inner);
    // le dessus du bord, déchiqueté comme le haut des murs
    {
      const g = new THREE.RingGeometry(HO.r - 0.8, HO.r * 1.08 + 0.85 * 1.08, 44, 1, -Math.PI / 2 + half, Math.PI * 2 - half * 2);
      g.rotateX(-Math.PI / 2);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getX(i), p.getZ(i)); p.setY(i, Math.sin(a * 7) * 0.5 + Math.sin(a * 13 + 1) * 0.3); }
      g.computeVertexNormals();
      const rim = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x7a5434, roughness: 1, side: THREE.DoubleSide }));
      rim.position.set(HO.x, HO.y + HO.h + 0.02, HO.z);
      hollowG.add(rim);
    }
    const floor = new THREE.Mesh(new THREE.CircleGeometry(HO.r - 0.6, 32), M.mat(0x4a3424, { roughness: 1 }));
    floor.rotation.x = -Math.PI / 2; floor.position.set(HO.x, HO.y + 0.04, HO.z); floor.receiveShadow = true;
    hollowG.add(floor);
    // des racines sur les côtés
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + 0.3;
      if (Math.sin(a) > 0.7) continue;
      const root = new THREE.Mesh(new THREE.CapsuleGeometry(0.55, 2.4, 4, 8), bark);
      root.position.set(HO.x + Math.cos(a) * (HO.r + 1.4), HO.y + 0.2, HO.z + Math.sin(a) * (HO.r + 1.4));
      root.rotation.set(0, -a, 0); root.rotateZ(Math.PI / 2 - 0.35);
      hollowG.add(shadowy(root));
    }
    // les cristaux
    const geo = new THREE.OctahedronGeometry(1, 0);
    const byCol = new Map();
    for (const c of S.HOLLOW_CRYSTALS) { if (!byCol.has(c.c)) byCol.set(c.c, []); byCol.get(c.c).push(c); }
    for (const [col, list] of byCol) {
      const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, roughness: 0.15, transparent: true, opacity: 0.9 });
      crystalMats.push(mat);
      const inst = new THREE.InstancedMesh(geo, mat, list.length * 3);
      let k = 0;
      list.forEach((c, i) => {
        for (let j = 0; j < 3; j++) {
          const h = c.h * (j === 0 ? 1 : 0.6), ox = (j - 1) * 0.35, oz = (j % 2) * 0.3;
          m4.compose(v.set(c.x + ox, HO.y + h * 0.55, c.z + oz), q.setFromEuler(e.set((j - 1) * 0.35, i + j, (j - 1) * 0.25)), sv.set(0.22, h, 0.22));
          inst.setMatrixAt(k++, m4);
        }
      });
      inst.userData.noOutline = true;
      hollowG.add(inst);
      if (!lite || list.length > 2) for (const c of list.slice(0, lite ? 1 : 3)) { const s = glowSprite(col, 3.2, 0.5); s.position.set(c.x, HO.y + 1, c.z); hollowG.add(s); }
    }
    // de la mousse et des petits champignons lumineux sur le bord de la porte
    for (const sx of [-1, 1]) {
      const a = sx * (half + 0.05), x = HO.x + Math.sin(a) * (HO.r + 0.2), z = HO.z + Math.cos(a) * (HO.r + 0.2);
      for (let k = 0; k < 3; k++) {
        const mm = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8af0ff, emissive: 0x40c0e0, emissiveIntensity: 0.8 }));
        mm.position.set(x + sx * 0.2, HO.y + 0.6 + k * 0.9, z + 0.4); mm.rotation.z = -sx * 1.2; mm.userData.noOutline = true; hollowG.add(mm);
      }
    }
  }

  // --- Le Plateau Moussu : escalier de rochers, source, cascade ------------------------
  const PL = S.PLATEAU;
  const plateauG = area(PL.x, PL.z, PL.r + 14);
  const fallParts = {};
  {
    const rm = W.rockMat();
    S.PLATEAU_STEPS.forEach((k, i) => {
      const hgt = k.top - k.y + 1;
      const m = new THREE.Mesh(W.rockGeometry(700 + i, k.r * 1.25, hgt / 2, k.r * 1.25), rm);
      const top = W.flattenRockTop(m.geometry, hgt / 2 * 0.3);
      m.position.set(k.x, k.top - top + 0.03, k.z);
      plateauG.add(shadowy(m));
    });
    // la cascade : un rideau d'eau, une mare d'écume, de la brume
    const F = S.FALLS, fallTex = game.fallTex;
    const waterMat = (map, op) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide });
    // le rideau d'eau : il déborde du plateau en s'arrondissant, puis tombe tout droit dans la mare
    {
      const prof = [[-3.4, F.top + 0.06, 0.62], [-2.2, F.top + 0.02, 0.7], [-1.1, F.top - 0.5, 0.8], [-0.35, F.top - 1.6, 0.92], [0, F.top - 3.2, 1], [0, -0.3, 1]];
      const tx = -F.nz, tz = F.nx, pos = [], uv = [], idx = [];
      let len = 0;
      prof.forEach(([o, y, k], i) => {
        if (i) len += Math.hypot(o - prof[i - 1][0], y - prof[i - 1][1]);
        for (const sd of [-1, 1]) { pos.push(F.x + F.nx * o + tx * sd * F.w / 2 * k, y, F.z + F.nz * o + tz * sd * F.w / 2 * k); uv.push((sd + 1) / 2, -len / 7); }
        if (i) { const a2 = (i - 1) * 2; idx.push(a2, a2 + 1, a2 + 2, a2 + 1, a2 + 3, a2 + 2); }
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
      const sheet = new THREE.Mesh(g, waterMat(fallTex, 0.82));
      sheet.renderOrder = 2; sheet.userData.noOutline = true;
      plateauG.add(sheet);
    }
    // le ruisseau sur le plateau, de la source jusqu'au bord
    const streamTex = fallTex.clone(); streamTex.needsUpdate = true; streamTex.repeat.set(1, 4);
    fallParts.streamTex = streamTex;
    const sx = S.SPRING.x, sz = S.SPRING.z, ex = PL.x + F.nx * (PL.r + 0.6), ez = PL.z + F.nz * (PL.r + 0.6), sl = Math.hypot(ex - sx, ez - sz);
    const stream = new THREE.Mesh(new THREE.PlaneGeometry(2.6, sl), waterMat(streamTex, 0.85));
    stream.rotation.set(-Math.PI / 2, 0, 0, 'YXZ'); stream.rotation.y = F.yaw + Math.PI; stream.rotation.order = 'YXZ';
    stream.position.set((sx + ex) / 2, PL.top + 0.06, (sz + ez) / 2); stream.renderOrder = 2; stream.userData.noOutline = true;
    plateauG.add(stream);
    const spring = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshStandardMaterial({ color: 0x5ac8e8, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 }));
    spring.rotation.x = -Math.PI / 2; spring.position.set(sx, PL.top + 0.07, sz); plateauG.add(spring);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      if (Math.cos(a - Math.atan2(F.nz, F.nx)) > 0.8) continue;
      const st = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32 + (i % 3) * 0.1, 1), M.mat(0x9a948a, { roughness: 0.9 })); st.scale.y = 0.6;
      st.position.set(sx + Math.cos(a) * 2.5, PL.top + 0.15, sz + Math.sin(a) * 2.5); st.rotation.set(i, i * 2, 0); plateauG.add(shadowy(st));
    }
    const foam = new THREE.Mesh(new THREE.RingGeometry(0.6, 4.5, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
    foam.rotation.x = -Math.PI / 2; foam.position.set(F.x + F.nx * 2.5, 0.05, F.z + F.nz * 2.5); foam.userData.noOutline = true;
    plateauG.add(foam); fallParts.foam = foam;
    const mist = glowSprite(0xffffff, 9, 0.35); mist.material.blending = THREE.NormalBlending;
    mist.position.set(F.x + F.nx * 2, 1.6, F.z + F.nz * 2); plateauG.add(mist); fallParts.mist = mist;
  }

  // --- Le Village des Hérissons ---------------------------------------------------
  const VG = S.SPOTS.village;
  const villageG = area(VG.x, VG.z, 22);
  for (const h of S.MUSH_HOUSES) { const m = FK.buildMushHouse(h); m.position.set(h.x, h.y, h.z); villageG.add(m); }
  // la grande marmite, sur son feu
  const PT = S.POT;
  const potFire = makeFire(0.9);
  potFire.fire.position.set(PT.x, PT.y, PT.z); villageG.add(potFire.fire);
  const soupMat = new THREE.MeshStandardMaterial({ color: 0x8a5ad0, emissive: 0x2a1040, emissiveIntensity: 0.3, roughness: 0.4 });
  const soup = new THREE.Mesh(new THREE.CircleGeometry(PT.r * 0.9, 24), soupMat);
  {
    const pot = new THREE.Mesh(new THREE.LatheGeometry([[0.001, 0], [0.9, 0.05], [1.25, 0.45], [1.3, 0.95], [1.18, 1.2], [1.28, 1.25]].map(([x, y]) => new THREE.Vector2(x * PT.r, y)), 24),
      M.mat(0x3a3a44, { metalness: 0.5, roughness: 0.5, side: THREE.DoubleSide }));
    pot.position.set(PT.x, PT.y + 0.35, PT.z); villageG.add(shadowy(pot));
    soup.rotation.x = -Math.PI / 2; soup.position.set(PT.x, PT.y + 0.6, PT.z); villageG.add(soup);
  }
  const noisette = FK.buildHedgehog({ apron: true, spoon: true, bow: true });
  noisette.position.set(S.FRIENDS.noisette.x, S.FRIENDS.noisette.y, S.FRIENDS.noisette.z);
  noisette.rotation.y = Math.atan2(PT.x - S.FRIENDS.noisette.x, PT.z - S.FRIENDS.noisette.z) + 1.2;
  villageG.add(noisette); chars.push(noisette);
  const hedgehogs = [];
  for (const [a, R, col] of [[2.6, 6.5, 0x8a6040], [4.9, 7, 0xa07850], [0.9, 7.5, 0x7a5236]]) {
    const hh = FK.buildHedgehog({ color: col, scale: 1.0 });
    const x = VG.x + Math.cos(a) * R, z = VG.z + Math.sin(a) * R;
    hh.position.set(x, S.heightAt(x, z), z); hh.rotation.y = Math.atan2(PT.x - x, PT.z - z);
    villageG.add(hh); hedgehogs.push(hh);
  }
  // petites guirlandes de lampions entre les maisons
  {
    const cols = [0xffd040, 0xff7a5a, 0x7ad0ff, 0xb08aff];
    const pts = [];
    S.MUSH_HOUSES.forEach((h, i) => {
      const n = S.MUSH_HOUSES[(i + 1) % S.MUSH_HOUSES.length];
      for (let k = 1; k < 6; k++) { const u = k / 6; pts.push([h.x + (n.x - h.x) * u, h.y + h.h + 0.2 - Math.sin(u * Math.PI) * 1.0, h.z + (n.z - h.z) * u, cols[(i + k) % 4]]); }
    });
    const li = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.4 }), pts.length);
    const c = new THREE.Color();
    pts.forEach(([x, y, z, col], i) => { m4.compose(v.set(x, y, z), q.identity(), sv.set(1, 1.2, 1)); li.setMatrixAt(i, m4); li.setColorAt(i, c.set(col)); });
    li.userData.noOutline = true; villageG.add(li);
  }

  // --- Buissons à baies --------------------------------------------------------------
  const bushI = new THREE.InstancedMesh(FK.bushGeometry(), FK.vmat(0.85), S.BUSHES.length);
  S.BUSHES.forEach((b, i) => { m4.compose(v.set(b.x, b.y - 0.1, b.z), q.setFromEuler(e.set(0, i * 1.3, 0)), sv.set(1.25, 1.1, 1.25)); bushI.setMatrixAt(i, m4); });
  bushI.castShadow = bushI.receiveShadow = true; bushI.computeBoundingSphere();
  sc.add(bushI);
  const BPB = 7, BMAX = S.BUSHES.length * BPB + 24;   // baies dessinées par buisson (et dans les paniers)
  const berryI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3, emissive: 0x200810, emissiveIntensity: 0.4 }), BMAX);
  {
    const c = new THREE.Color();
    for (let i = 0; i < BMAX; i++) berryI.setColorAt(i, c.set(i < S.BUSHES.length * BPB ? S.BUSHES[Math.floor(i / BPB)].col : [0x3a5ad8, 0xe0304a, 0x8a3ab8][i % 3]));
    berryI.frustumCulled = false; berryI.userData.noOutline = true;
    sc.add(berryI); moving.push(berryI);
  }

  // --- Le Bosquet des Lucioles : champignons lumineux et fleurs qui brillent ----------
  const GL = S.GLADE;
  const gladeG = area(GL.x, GL.z, 18);
  const glowMush = [];
  {
    const n = 26, list = [];
    for (let i = 0; i < n; i++) {
      const a = i * 2.39996, d = 4 + (i % 7) * 1.4;
      const x = GL.x + Math.cos(a) * d, z = GL.z + Math.sin(a) * d;
      list.push([x, S.heightAt(x, z), z, 0.6 + (i % 4) * 0.25, [0x6af0ff, 0xb08aff, 0x8aff9a, 0xffa0e0][i % 4]]);
    }
    const stemI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 1, 8), new THREE.MeshStandardMaterial({ color: 0xf0f0ff, emissive: 0x606080, emissiveIntensity: 0.5 }), n);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.3 });
    const capI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.4, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat, n);
    const c = new THREE.Color();
    list.forEach(([x, y, z, s, col], i) => {
      m4.compose(v.set(x, y + s * 0.5, z), q.identity(), sv.set(s, s, s)); stemI.setMatrixAt(i, m4);
      m4.compose(v.set(x, y + s * 0.95, z), q.identity(), sv.set(s, s * 0.8, s)); capI.setMatrixAt(i, m4);
      capI.setColorAt(i, c.set(col));
    });
    stemI.userData.noOutline = capI.userData.noOutline = true;
    gladeG.add(stemI, capI);
    glowMush.push(capMat);
    for (let i = 0; i < (lite ? 3 : 6); i++) { const [x, y, z, , col] = list[i * 4]; const s = glowSprite(col, 3, 0.4); s.position.set(x, y + 1, z); gladeG.add(s); }
  }

  // --- Le rond de fées (secret) -----------------------------------------------------
  const FY = S.FAIRY;
  const fairyG = area(FY.x, FY.z, 8);
  const fairyMat = new THREE.MeshStandardMaterial({ map: spotsTexture('#e0453a', '#fff4e8'), roughness: 0.6, emissive: 0x000000 });
  {
    const n = 14;
    const capI = new THREE.InstancedMesh(capGeometry(0.42), fairyMat, n);
    const stI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.14, 0.5, 8), stalkMat, n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, x = FY.x + Math.cos(a) * FY.r, z = FY.z + Math.sin(a) * FY.r, y = S.heightAt(x, z), s = 0.8 + (i % 3) * 0.2;
      m4.compose(v.set(x, y + 0.5 * s, z), q.identity(), sv.set(s, s, s)); capI.setMatrixAt(i, m4);
      m4.compose(v.set(x, y + 0.25 * s, z), q.identity(), sv.set(s, s, s)); stI.setMatrixAt(i, m4);
    }
    fairyG.add(shadowy(capI), stI);
  }
  const fairyGlow = glowSprite(0xffe0ff, 7, 0);
  fairyGlow.position.set(FY.x, FY.y + 1, FY.z); fairyG.add(fairyGlow);

  // --- Bébés hiboux ------------------------------------------------------------------
  const owlets = S.OWLETS.map((o, i) => {
    const m = FK.buildOwl({ baby: true });
    m.position.set(o.x, o.y, o.z);
    sc.add(m); chars.push(m); moving.push(m);
    const mark = game.makeMark('?', 0x8ad0ff); mark.scale.set(0.8, 0.8, 1); sc.add(mark);
    return { def: o, m, mark, state: 'lost', follow: -1, x: o.x, y: o.y, z: o.z, yaw: 0, ph: i * 2.1 };
  });

  // --- Lanternes ---------------------------------------------------------------
  const lanterns = S.lanterns.map((l) => {
    const g = new THREE.Group();
    const postH = 1.6;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, postH, 8), M.mat(0x4a3420, { roughness: 0.9 }));
    post.position.y = postH / 2; g.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.08), post.material);
    arm.position.set(0.25, postH - 0.05, 0); g.add(arm);
    const glass = new THREE.MeshStandardMaterial({ color: 0x5a5040, emissive: 0xffc040, emissiveIntensity: 0, roughness: 0.3 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 6), glass);
    lamp.position.set(0.5, postH - 0.4, 0); g.add(lamp);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.25, 6), M.mat(0x2a2a30));
    roof.position.set(0.5, postH - 0.05, 0); g.add(roof);
    const glow = glowSprite(0xffc860, 3.2, 0);
    glow.position.set(0.5, postH - 0.4, 0); g.add(glow);
    // une petite flamme bleue qui danse au-dessus des lanternes éteintes : on les voit de loin
    const hint = glowSprite(0x8ad0ff, 1.6, 0.0);
    hint.position.set(0.5, postH + 0.6, 0); g.add(hint);
    g.position.set(l.x, l.y, l.z);
    g.rotation.y = l.x * 0.7;
    sc.add(shadowy(g));
    return { def: l, g, glass, glow, hint, lit: false, litT: -9 };
  });

  // --- Autel des lucioles ----------------------------------------------------------
  const ALT = S.SPOTS.altar, altY = S.heightAt(ALT.x, ALT.z);
  const altar = new THREE.Group();
  const stoneM = W.stoneMat();
  const base1 = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.5, 24), stoneM); base1.position.y = 0.25;
  const base2 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.9, 20), stoneM); base2.position.y = 0.9;
  const runeMat = new THREE.MeshStandardMaterial({ color: 0x80fff0, emissive: 0x40e0d0, emissiveIntensity: 0.2, roughness: 0.4 });
  const rune = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.07, 6, 40), runeMat); rune.rotation.x = Math.PI / 2; rune.position.y = 0.52;
  altar.add(base1, base2, rune);
  // six petites flammes autour de l'autel : une par lanterne allumée
  const altarDots = [];
  for (let i = 0; i < S.lanterns.length; i++) {
    const a = (i / S.lanterns.length) * Math.PI * 2;
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0x5a5040, emissive: 0xffc040, emissiveIntensity: 0, roughness: 0.3 }));
    d.position.set(Math.cos(a) * 1.9, 0.62, Math.sin(a) * 1.9); d.userData.noOutline = true;
    altar.add(d); altarDots.push(d);
  }
  const altarGlow = glowSprite(0x80fff0, 6, 0.1); altarGlow.position.y = 1.6; altar.add(altarGlow);
  altar.position.set(ALT.x, altY, ALT.z);
  sc.add(shadowy(altar));

  // --- Lucioles : un nuage autour de la caméra, et un grand essaim au bosquet -------
  const NF = lite ? 80 : 160, NG = lite ? 50 : 110, NT = NF + NG, FB = 44;
  const fpos = new Float32Array(NT * 3), fbase = [];
  for (let i = 0; i < NT; i++) {
    if (i < NF) fbase.push([(Math.random() - 0.5) * 2 * FB, 0, (Math.random() - 0.5) * 2 * FB, Math.random() * 10, 0.8 + Math.random() * 2.5]);
    else { const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * GL.r; fbase.push([GL.x + Math.cos(a) * d, 0, GL.z + Math.sin(a) * d, Math.random() * 10, 0.6 + Math.random() * 3.5]); }
  }
  for (let i = NF; i < NT; i++) fbase[i][1] = S.heightAt(fbase[i][0], fbase[i][2]);
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  const flies = new THREE.Points(fgeo, new THREE.PointsMaterial({ map: M.glowTexture(), color: 0xfff27a, size: 0.55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  flies.frustumCulled = false;
  sc.add(flies);

  // --- Capitaine Moustache et pelotes ------------------------------------------------
  const AR = S.ARENA;
  const cap = buildCaptain();
  cap.position.set(AR.x, AR.y, AR.z - 3);
  sc.add(cap);
  chars.push(cap);
  moving.push(cap);
  const yarnMeshes = [];
  for (let i = 0; i < 6; i++) { const y = buildYarn(); y.visible = false; sc.add(y); yarnMeshes.push(y); moving.push(y); }
  const bossShadow = game.makeShadow(1.2);

  // =============================================================================
  // État et règles
  // =============================================================================
  const RF = S.RAFT, RS = RF.stops;
  const st = {
    leafUntil: -1, leafWarned: false, gateOpen: false, gateK: 0, gateHintT: -9,
    boss: { phase: 'idle', x: AR.x, y: AR.y, z: AR.z - 3, yaw: 0, hp: 3, t: 0, throws: 0, inv: 0, hop: null, anim: 0 },
    yarns: [],
    raft: { s: RS.A, at: 'A', moving: false, to: null, wait: 1, dir: 1, aboard: 0, call: 0 },
    hint: {}, catsDone: false, quest: '', potT: -9, fairyT: -9,
  };
  const leafCols = S.leaves.map(l => l.col);
  const campCatsLeft = () => S.cats.filter(c => c.group === 'clearing' && !c.lookout && !save().cats.includes(c.id)).length;
  const lookoutsLeft = () => S.cats.filter(c => c.lookout && !save().cats.includes(c.id)).length;
  const catsLeft = () => campCatsLeft() + lookoutsLeft();
  const carried = () => { const out = new Set(); for (const P of players()) for (const id of (P.berries || [])) out.add(id); return out; };
  const bushFull = (b) => !forest().pot.includes(b.id) && !carried().has(b.id);
  const potCount = () => forest().pot.length;

  function updateChips() {
    const f = forest(), me = meF(), on = save().intro;
    const nB = potCount() + ((me && me.berries) ? me.berries.length : 0);
    hud.berries.classList.toggle('hidden', !on || f.feast || !(nB > 0 || f.met.includes('noisette')));
    hud.owlets.classList.toggle('hidden', !on || save().medals.includes('m_owl') || !(f.owlets.length > 0 || owlets.some(o => o.state === 'follow') || f.met.includes('hulotte')));
    const set = (el, n) => { const sp = el.querySelector('span'); if (sp.textContent !== String(n)) { sp.textContent = n; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } };
    set(hud.berries, Math.min(S.BERRIES_NEEDED, nB)); set(hud.owlets, f.owlets.length);
  }

  function refreshLanterns() {
    for (const l of lanterns) {
      const lit = save().lanterns.includes(l.def.id);
      if (lit && !l.lit) l.litT = game.t;
      l.lit = lit;
      l.glass.emissiveIntensity = lit ? 1.4 : 0;
      l.glass.color.set(lit ? 0xffe8a0 : 0x5a5040);
      l.glow.material.opacity = lit ? 0.75 : 0;
    }
    const n = save().lanterns.length;
    runeMat.emissiveIntensity = 0.2 + n * 0.22;
    altarGlow.material.opacity = 0.1 + n * 0.1;
    altarDots.forEach((d, i) => { d.material.emissiveIntensity = i < n ? 1.6 : 0; d.material.color.set(i < n ? 0xffe8a0 : 0x5a5040); });
  }

  function lightLantern(l) {
    const s = save();
    s.lanterns.push(l.def.id);
    game.persist();
    game.sound('lantern');
    game.burst(l.def.x, l.def.y + 1.3, l.def.z, 16, 0xffe070, 3, 0.7);
    refreshLanterns();
    if (s.lanterns.length >= S.lanterns.length) {
      game.updateMedalVisibility();
      game.banner('Les lucioles s\'illuminent !', 'Une médaille brille sur l\'autel, au milieu de la forêt !', 3200);
      game.sound('reveal');
    } else {
      const next = S.lanterns.find(o => !s.lanterns.includes(o.id));
      game.banner(`Lanterne ${s.lanterns.length}/${S.lanterns.length}`, next ? `Il y en a encore une ${next.where} !` : '', 2200);
    }
  }

  function setLeaves(on) { for (const c of leafCols) c.off = !on; }

  function openGate(silent) {
    st.gateOpen = true;
    S.GATE.off = true;
    if (!silent) { game.banner('Le repaire est ouvert !', 'La Capitaine Moustache vous attend tout au nord…', 3000); game.sound('reveal'); }
  }

  // --- les amis de la forêt -----------------------------------------------------
  function met(id) { const f = forest(); if (!f.met.includes(id)) { f.met.push(id); game.persist(); } }
  function talkNoisette() {
    const f = forest(), n = S.BERRIES_NEEDED - potCount();
    if (f.feast) {
      game.say([
        { who: 'Noisette la hérissonne', text: 'Miam ! La soupe aux baies mijote. Merci encore, mes petits toutous !' },
        ...(save().medals.includes('m_mush') ? [] : [{ who: 'Noisette la hérissonne', text: 'Votre médaille vous attend tout en haut de la Tour des Champignons !' }]),
      ]);
      return;
    }
    if (!f.met.includes('noisette')) {
      game.say([
        { who: 'Noisette la hérissonne', text: 'Bonjour, les toutous ! Je suis Noisette. Ce soir, c\'est le grand festin des hérissons !' },
        { who: 'Noisette la hérissonne', text: 'Mais les chats farceurs ont renversé mes paniers… Il me faut 12 poignées de baies pour la soupe.' },
        { who: 'Noisette la hérissonne', text: 'Il y a des buissons à baies dans trois coins de la forêt : à l\'est près de la plage, tout à l\'ouest, et au nord, de l\'autre côté de la rivière.' },
        { who: 'Noisette la hérissonne', text: 'Touchez un buisson pour cueillir ses baies, puis rapportez-les dans ma marmite !' },
        { who: 'Matcha', text: 'Compte sur nous, Noisette !' },
      ], () => { met('noisette'); updateChips(); game.updateHud(); });
      return;
    }
    const left = S.BERRY_PATCHES.find(p => S.BUSHES.some(b => b.patch === p.id && bushFull(b)));
    game.say([
      { who: 'Noisette la hérissonne', text: `Encore ${n} poignée${n > 1 ? 's' : ''} de baies, et la soupe sera parfaite !` },
      ...(left ? [{ who: 'Noisette la hérissonne', text: `Il reste des buissons pleins de baies ${left.name}.` }] : []),
    ]);
  }
  function talkHulotte() {
    const f = forest(), n = S.OWLETS.length - f.owlets.length;
    snd.hoot();
    if (!f.met.includes('hulotte')) {
      game.say([
        { who: 'Mère Hulotte', text: 'Hou-hou… Bonjour, petits chiens. Je suis Mère Hulotte.' },
        { who: 'Mère Hulotte', text: 'Mes trois bébés, Plume, Pompon et Myrtille, sont partis jouer… et ils ne savent pas encore assez bien voler pour rentrer.' },
        { who: 'Mère Hulotte', text: 'Plume adore les hauteurs, Pompon adore l\'eau, et Myrtille rêve de cabanes… Vous me les ramenez ?' },
        { who: 'Matcha', text: 'Promis, Mère Hulotte !' },
      ], () => { met('hulotte'); updateChips(); game.updateHud(); });
      return;
    }
    if (n <= 0) { game.say([{ who: 'Mère Hulotte', text: 'Hou-hou ! Toute ma petite famille est au nid. Vous êtes de vrais amis de la forêt.' }]); return; }
    const o = owlets.find(w => w.state === 'lost');
    game.say([
      { who: 'Mère Hulotte', text: `Il me manque encore ${n} bébé${n > 1 ? 's' : ''}…` },
      ...(o ? [{ who: 'Mère Hulotte', text: `${o.def.name} doit être ${o.def.where}.` }] : []),
    ]);
  }
  function talkPistache() {
    const n = lookoutsLeft();
    met('pistache');
    if (n > 0) {
      game.say([
        { who: 'Pistache l\'écureuil', text: 'Salut ! Moi, c\'est Pistache. Bienvenue dans les cabanes des écureuils !' },
        { who: 'Pistache l\'écureuil', text: `${n === 3 ? 'Trois chats guetteurs se sont installés' : `Il reste ${n} chat${n > 1 ? 's' : ''} guetteur${n > 1 ? 's' : ''}`} sur nos cabanes. Ils nous lancent des glands sur la tête !` },
        { who: 'Pistache l\'écureuil', text: 'Suivez les ponts de cordes et chassez-les… Et ne regardez pas trop en bas !' },
      ]);
    } else {
      game.say([{ who: 'Pistache l\'écureuil', text: 'Merci ! Les cabanes sont de nouveau à nous. Il y a une lanterne tout au bout, sur la dernière cabane !' }]);
    }
  }
  function talkGaston() {
    snd.croak();
    met('gaston');
    game.say([
      { who: 'Gaston la grenouille', text: 'Croâ ! Je suis Gaston, le passeur de la rivière.' },
      { who: 'Gaston la grenouille', text: 'Montez sur mon radeau : je descends la rivière jusqu\'au ponton du nord, avec un arrêt à l\'Îlot aux Roseaux.' },
      { who: 'Gaston la grenouille', text: 'Pendant l\'arrêt, sautez sur l\'îlot ! Je repasse vous chercher.' },
    ]);
  }

  // --- bébés hiboux ---------------------------------------------------------------
  const OWLET_LINES = {
    o1: [{ who: 'Plume', text: 'Piou ! Je suis monté tout en haut… mais je n\'ose plus redescendre !' }, { who: 'Ainu', text: 'Accroche-toi à nous, Plume ! On te ramène chez ta maman.' }],
    o2: [{ who: 'Pompon', text: 'Piou piou ! J\'ai pris le radeau pour voir les poissons… et il est reparti sans moi !' }, { who: 'Matcha', text: 'Viens, Pompon ! Ta maman t\'attend sur son rocher.' }],
    o3: [{ who: 'Myrtille', text: 'Piou ? Les chats disent que c\'est leur cabane… Moi, je voulais juste regarder les étoiles.' }, { who: 'Ainu', text: 'Viens avec nous, Myrtille !' }],
  };
  function findOwlet(o, P) {
    o.state = 'follow'; o.follow = P.id;
    snd.peep();
    game.burst(o.x, o.y + 0.8, o.z, 14, 0xfff0c0, 3, 0.5);
    game.say(OWLET_LINES[o.def.id], () => {
      game.banner('Bébé hibou trouvé !', 'Ramène-le sur le Rocher du Hibou, au milieu du lac', 2800);
      updateChips(); game.updateHud();
    });
  }
  function owletHome(o) {
    const f = forest();
    o.state = 'home'; o.follow = -1;
    if (!f.owlets.includes(o.def.id)) f.owlets.push(o.def.id);
    met('hulotte');
    game.persist();
    snd.hoot();
    game.burst(S.NEST.x, S.NEST.y + 1, S.NEST.z, 20, 0xffe8b0, 3.5, 0.6);
    const n = S.OWLETS.length - f.owlets.length;
    if (n <= 0) {
      game.say([
        { who: 'Mère Hulotte', text: `Hou-hou ! ${o.def.name}, mon trésor !` },
        { who: 'Mère Hulotte', text: 'Mes trois bébés sont rentrés au nid ! Hou-hou-hou, quel bonheur !' },
        { who: 'Mère Hulotte', text: 'Prenez cette Médaille Patoune : elle brillait au fond de mon nid.' },
      ], () => {
        game.updateMedalVisibility();
        game.banner('Toute la famille Hulotte est réunie !', 'Une médaille est apparue sur le Rocher du Hibou !', 3000);
        game.sound('reveal');
        updateChips(); game.updateHud();
      });
    } else {
      game.say([
        { who: 'Mère Hulotte', text: `Hou-hou ! ${o.def.name}, mon trésor ! Merci, les toutous !` },
        { who: 'Mère Hulotte', text: `Plus que ${n} bébé${n > 1 ? 's' : ''} à retrouver.` },
      ], () => { updateChips(); game.updateHud(); });
    }
  }
  function stepOwlets(dt) {
    for (const o of owlets) {
      if (o.state === 'lost') {
        if (!save().intro || game.dialog) continue;
        for (const P of players()) {
          if (Math.hypot(P.pos.x - o.x, P.pos.z - o.z) < 1.9 && Math.abs(P.pos.y - o.y) < 2) { findOwlet(o, P); break; }
        }
      } else if (o.state === 'follow') {
        const P = game.party.get(o.follow) || meF();
        if (!game.party.has(o.follow)) o.follow = P.id;
        // il volette derrière le chien, à hauteur de tête
        const back = P.yaw + Math.PI, idx = owlets.filter(w => w.state === 'follow' && w.follow === o.follow).indexOf(o);
        const tx = P.pos.x + Math.sin(back + (idx - 0.5) * 0.9) * 1.3, tz = P.pos.z + Math.cos(back + (idx - 0.5) * 0.9) * 1.3, ty = P.pos.y + 2.1 + Math.sin(game.t * 3 + o.ph) * 0.15;
        const d = Math.hypot(tx - o.x, tz - o.z);
        if (d > 14) { o.x = tx; o.y = ty; o.z = tz; }
        const k = Math.min(1, dt * 4);
        o.x += (tx - o.x) * k; o.y += (ty - o.y) * k; o.z += (tz - o.z) * k;
        o.yaw = lerpAngle(o.yaw, Math.atan2(P.pos.x - o.x, P.pos.z - o.z), Math.min(1, dt * 5));
        // arrivé au nid ?
        if (!game.dialog && Math.hypot(P.pos.x - S.NEST.x, P.pos.z - S.NEST.z) < 4.6 && Math.abs(P.pos.y - S.NEST.y) < 2.5) owletHome(o);
      } else {
        // au nid, avec maman
        const i = S.OWLETS.indexOf(o.def), a = i * 2.1 + 0.4;
        o.x = S.NEST.x + Math.cos(a) * 0.45; o.z = S.NEST.z + Math.sin(a) * 0.45; o.y = S.NEST.y + 0.22;
        o.yaw = Math.atan2(S.STUMP.x - o.x, S.STUMP.z - o.z);
      }
    }
  }

  // --- baies ---------------------------------------------------------------------
  function stepBerries() {
    const f = forest();
    if (f.feast || !save().intro) return;
    for (const P of players()) {
      if (!P.berries) P.berries = [];
      for (let i = 0; i < S.BUSHES.length; i++) {
        const b = S.BUSHES[i];
        if (!bushFull(b)) continue;
        if (Math.hypot(P.pos.x - b.x, P.pos.z - b.z) < 2.0 && Math.abs(P.pos.y - b.y) < 2.2) {
          P.berries.push(b.id);
          snd.pick();
          game.burst(b.x, b.y + 1.2, b.z, 14, b.col, 3, 0.5);
          const tot = potCount() + P.berries.length;
          if (P === meF()) {
            if (!st.hint.berry) { st.hint.berry = true; game.banner('Des baies !', `Porte-les à la marmite de Noisette, au village (${tot}/${S.BERRIES_NEEDED})`, 2600); }
            else game.banner('Miam, des baies !', `${tot}/${S.BERRIES_NEEDED}`, 1300);
          }
          updateChips(); game.updateHud();
        }
      }
      // à la marmite
      if (P.berries.length && Math.hypot(P.pos.x - S.POT.x, P.pos.z - S.POT.z) < 4.4 && Math.abs(P.pos.y - S.POT.y) < 2.5 && !game.dialog) {
        for (const id of P.berries) if (!f.pot.includes(id)) f.pot.push(id);
        P.berries = [];
        game.persist();
        snd.plop();
        st.potT = game.t;
        game.burst(S.POT.x, S.POT.y + 1.6, S.POT.z, 20, 0xb070ff, 3, 0.6);
        met('noisette');
        if (f.pot.length >= S.BERRIES_NEEDED) {
          game.say([
            { who: 'Noisette la hérissonne', text: 'Douze poignées ! La marmite est pleine, ça sent bon dans tout le village !' },
            { who: 'Noisette la hérissonne', text: 'Pour vous remercier, les hérissons ont caché une Médaille Patoune tout en haut de la Tour des Champignons.' },
            { who: 'Ainu', text: 'Ouaf ! On grimpe de chapeau en chapeau !' },
          ], () => {
            f.feast = true; game.persist();
            game.updateMedalVisibility();
            game.banner('Le festin des hérissons !', 'Une médaille brille en haut de la Tour des Champignons !', 3200);
            game.sound('reveal');
            updateChips(); game.updateHud();
          });
        } else {
          game.banner('Dans la marmite !', `Baies : ${f.pot.length}/${S.BERRIES_NEEDED}`, 1800);
          game.bubble({ pos: new THREE.Vector3(S.FRIENDS.noisette.x, S.FRIENDS.noisette.y + 1.2, S.FRIENDS.noisette.z) }, 'Merci !');
        }
        updateChips(); game.updateHud();
      }
    }
  }

  // --- le radeau de Gaston ---------------------------------------------------------
  const RAFT_STOPS = ['A', 'I', 'B'];
  const R = st.raft, RC = S.RAFT_COL;
  const onRaft = (P) => P.grounded && P.onCol === RC;
  function stepRaft(dt) {
    const riders = players().filter(onRaft);
    const ox = RC.x, oz = RC.z;
    if (!R.moving) {
      R.wait -= dt;
      let go = null;
      if (riders.length && R.wait <= 0) {
        go = R.at === 'A' ? 'I' : R.at === 'B' ? 'I' : (R.dir > 0 ? 'B' : 'A');
        if (R.at === 'A') R.dir = 1; else if (R.at === 'B') R.dir = -1;
        if (game.t - (st.hint.gastonT || -9) > 4) { st.hint.gastonT = game.t; game.bubble({ pos: gaston.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.3, 0)) }, 'En route !'); snd.croak(); }
      } else if (!riders.length && R.wait <= 0) {
        // quelqu'un attend au bout d'un ponton, ou sur l'îlot : on va le chercher
        for (const P of players()) {
          for (const D of S.DOCKS) if (D.id !== R.at && Math.hypot(P.pos.x - D.end.x, P.pos.z - D.end.z) < 3.4 && Math.abs(P.pos.y - D.top) < 1.5) go = D.id;
          if (R.at !== 'I' && Math.hypot(P.pos.x - S.ISLET.x, P.pos.z - S.ISLET.z) < S.ISLET.r + 0.5 && P.pos.y < 3) go = 'I';
        }
        if (go) { R.dir = RS[go] > R.s ? 1 : -1; R.call = 1; }
      }
      if (go) { R.moving = true; R.to = go; }
    }
    if (R.moving) {
      const target = RS[R.to], dir = Math.sign(target - R.s);
      R.s += dir * RF.speed * dt;
      if (Math.sign(target - R.s) !== dir) {
        R.s = target; R.moving = false; R.at = R.to; R.to = null; R.wait = R.at === 'I' ? 5 : 4;
        if (riders.length) {
          const gp = gaston.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.3, 0));
          if (R.at === 'I') { game.bubble({ pos: gp }, 'Arrêt à l\'îlot !'); if (riders.includes(meF())) game.banner('L\'Îlot aux Roseaux !', 'Saute sur l\'îlot… ou reste sur le radeau !', 2400); }
          else game.bubble({ pos: gp }, 'Terminus !');
          snd.croak();
        }
      }
    }
    const p = S.riverAt(R.s);
    RC.x = p.x; RC.z = p.z; RC.dx = RC.x - ox; RC.dz = RC.z - oz;
    R.yaw = Math.atan2(p.tx, p.tz);
    // on reste sur le radeau tant qu'il avance (on peut sauter, bien sûr)
    if (R.moving) for (const P of riders) {
      const dx = P.pos.x - RC.x, dz = P.pos.z - RC.z, d = Math.hypot(dx, dz), m = RC.r - 0.45;
      if (d > m) { P.pos.x = RC.x + dx / d * m; P.pos.z = RC.z + dz / d * m; }
    }
    if (riders.length && !st.hint.raft && riders.includes(meF())) { st.hint.raft = true; game.banner('À bord !', 'Le radeau descend la rivière tout seul', 2200); }
  }

  // --- combat --------------------------------------------------------------------
  const B = st.boss;
  const near = (x, z) => game.nearestPlayer({ x, z });
  function bossReset() {
    Object.assign(B, { phase: 'idle', x: AR.x, z: AR.z - 3, y: AR.y, hp: 3, t: 0, throws: 0, inv: 0, hop: null });
    st.yarns.length = 0;
  }
  function throwYarn() {
    const p = near(B.x, B.z);
    const tx = p.pos.x + p.vel.x * 0.5, tz = p.pos.z + p.vel.z * 0.5;
    const dx = tx - B.x, dz = tz - B.z, d = Math.hypot(dx, dz) || 1;
    st.yarns.push({ x: B.x, y: B.y + 2.4, z: B.z, sx: B.x, sz: B.z, tx, tz, ty: AR.y + 0.45, t: 0, T: clamp(d / 11, 0.6, 1.2), roll: 0, dx: dx / d, dz: dz / d });
    game.sound('throw');
  }
  function stepBoss(dt) {
    const p = near(B.x, B.z);
    const dA = (q) => Math.hypot(q.pos.x - AR.x, q.pos.z - AR.z);
    const inArena = game.players.some(q => dA(q) < AR.r - 1);
    const far = game.players.every(q => dA(q) > AR.r + 8);
    B.inv = Math.max(0, B.inv - dt);
    B.anim += dt;
    if (B.phase === 'idle') {
      B.yaw = lerpAngle(B.yaw, Math.atan2(p.pos.x - B.x, p.pos.z - B.z), dt * 3);
      if (inArena && st.gateOpen && !game.dialog) {
        B.phase = 'intro';
        game.say([
          { who: 'Capitaine Moustache', text: 'Miaou-ha-ha ! Ainu et Matcha… Vous m\'avez suivie jusqu\'ici ?' },
          { who: 'Capitaine Moustache', text: 'Goûtez donc à mes pelotes de laine !' },
          { who: 'Matcha', text: 'Ainu, évite ses pelotes ! Quand elle sera fatiguée, on attaque !' },
        ], () => { B.phase = 'throw'; B.t = 0.8; B.throws = 0; });
      }
      return;
    }
    if (B.phase === 'intro' || B.phase === 'gone') return;
    if (far && B.phase !== 'defeated') { bossReset(); return; }
    B.t -= dt;
    if (B.phase === 'throw') {
      B.yaw = lerpAngle(B.yaw, Math.atan2(p.pos.x - B.x, p.pos.z - B.z), dt * 6);
      if (B.t <= 0) {
        throwYarn();
        B.throws++;
        const per = 2 + (B.hp < 2 ? 1 : 0);   // 2, 2 puis 3 pelotes
        B.t = B.throws >= per ? 0.9 : 1.5 - (3 - B.hp) * 0.1;
        if (B.throws >= per) { B.phase = 'wait'; }
      }
    } else if (B.phase === 'wait') {
      if (B.t <= 0) { B.phase = 'tired'; B.t = 4.5; game.banner('Elle est fatiguée !', 'Vite, une attaque !', 1500); }
    } else if (B.phase === 'tired') {
      if (B.t <= 0) { B.phase = 'throw'; B.t = 0.6; B.throws = 0; }
    } else if (B.phase === 'hop') {
      const h = B.hop;
      h.t += dt;
      const k = Math.min(1, h.t / h.T);
      B.x = h.x0 + (h.x1 - h.x0) * k; B.z = h.z0 + (h.z1 - h.z0) * k;
      B.y = AR.y + Math.sin(k * Math.PI) * 4;
      if (k >= 1) { B.y = AR.y; B.phase = 'throw'; B.t = 0.7; B.throws = 0; }
    } else if (B.phase === 'defeated') {
      const h = B.hop;
      h.t += dt;
      B.y = AR.y + h.t * 9 - h.t * h.t * 2.5;
      B.x += Math.sin(B.yaw + Math.PI) * dt * 6; B.z += Math.cos(B.yaw + Math.PI) * dt * 6;
      if (h.t > 3.2) { B.phase = 'gone'; }
    }
    for (const q of game.players) {
      if (B.phase === 'defeated' || B.phase === 'gone' || B.phase === 'hop') break;
      const dx = q.pos.x - B.x, dz = q.pos.z - B.z, d = Math.hypot(dx, dz), dy = q.pos.y - B.y;
      if (d < 2.3 && dy > -1 && dy < 3) {
        const attacking = q.attackT > 0 || q.dashT > 0 || (q.vel.y < -1 && dy > 1.2);
        if (B.phase === 'tired' && attacking && B.inv <= 0) hitBoss(q);
        else if (B.phase !== 'tired') game.hurtPlayer({ x: B.x, z: B.z }, q);
      }
    }
  }
  function hitBoss(q) {
    B.hp--; B.inv = 1;
    game.sound('bossHit');
    game.burst(B.x, B.y + 1.8, B.z, 22, 0xffffff, 5, 0.7);
    if (q.vel.y < 0) q.vel.y = 10;
    if (B.hp <= 0) {
      B.phase = 'defeated'; B.hop = { t: 0 };
      st.yarns.length = 0;
      game.say([
        { who: 'Capitaine Moustache', text: 'Grrr ! Vous m\'avez eue, sales cabots !' },
        { who: 'Capitaine Moustache', text: 'Les chiens ont toujours un parc pour jouer… et moi, rien ! Gardez votre médaille… mais on se reverra !' },
        { who: 'Matcha', text: 'Elle avait l\'air… un peu triste, non ?' },
        { who: 'Ainu', text: 'Ouaf… Oui. Un peu.' },
      ], () => {
        save().boss = true;
        game.persist();
        game.updateMedalVisibility();
        game.banner('La Capitaine Moustache s\'enfuit !', 'Une Médaille Patoune est tombée dans le repaire !', 3000);
        game.sound('reveal');
      });
      return;
    }
    game.banner(B.hp === 2 ? 'Bien joué !' : 'Encore une fois !', `Il reste ${B.hp} coup${B.hp > 1 ? 's' : ''}`, 1400);
    if (game.players.some(o => o.hearts < 3)) game.spawnHeart(AR.x + (Math.random() - 0.5) * 6, AR.y + 0.9, AR.z + (Math.random() - 0.5) * 6);
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 3.5;
    B.phase = 'hop'; B.hop = { t: 0, T: 0.9, x0: B.x, z0: B.z, x1: AR.x + Math.cos(a) * r, z1: AR.z + Math.sin(a) * r };
  }
  function stepYarns(dt) {
    for (const y of st.yarns) {
      if (y.t < y.T) {
        y.t += dt;
        const k = Math.min(1, y.t / y.T);
        y.x = y.sx + (y.tx - y.sx) * k; y.z = y.sz + (y.tz - y.sz) * k;
        y.y = (B.y + 2.4) * (1 - k) + y.ty * k + Math.sin(k * Math.PI) * 3;
        if (k >= 1) game.burst(y.x, y.ty, y.z, 6, 0xff9ad0, 2, 0.3);
      } else {
        y.roll += dt;
        y.x += y.dx * dt * 4.5; y.z += y.dz * dt * 4.5; y.y = y.ty;
      }
      for (const p of game.players) {
        const d = Math.hypot(p.pos.x - y.x, p.pos.z - y.z), dy = p.pos.y + 0.6 - y.y;
        if (d < 1.15 && Math.abs(dy) < 1.3 && y.t > y.T * 0.5) { game.hurtPlayer({ x: y.x, z: y.z }, p); y.roll = 99; break; }
      }
    }
    st.yarns = st.yarns.filter(y => y.roll < 1.1 && Math.hypot(y.x - AR.x, y.z - AR.z) < AR.r + 1);
  }

  /** Où aller maintenant ? (le plus proche de ce qui reste à faire) */
  function nextGoals(me) {
    const f = forest(), s = save(), out = [];
    for (const l of S.lanterns) if (!s.lanterns.includes(l.id)) out.push(l);
    if (!f.met.includes('noisette') && !f.feast) out.push({ x: S.FRIENDS.noisette.x, y: S.FRIENDS.noisette.y, z: S.FRIENDS.noisette.z });
    else if (!f.feast) for (const b of S.BUSHES) if (bushFull(b)) out.push(b);
    for (const o of owlets) if (o.state === 'lost') out.push(o.def);
    for (const c of game.cats) if (!c.dead && c.def.group === 'clearing') out.push(c.pos);
    if (st.gateOpen && !s.boss) out.push({ x: S.GATE.x, y: S.ARENA.y, z: S.GATE.z + 3 });
    void me;
    return out;
  }

  // =============================================================================
  const logic = {
    moving, chars,
    forest: { owlets, raft: R, lanterns, state: forest },   // (pour les tests)
    extraCandidates(Q) {
      const out = [
        { kind: 'lv', act: 'noisette', label: 'PARLER', x: S.FRIENDS.noisette.x, z: S.FRIENDS.noisette.z, y: S.FRIENDS.noisette.y },
        { kind: 'lv', act: 'pistache', label: 'PARLER', x: S.FRIENDS.pistache.x, z: S.FRIENDS.pistache.z, y: S.FRIENDS.pistache.y },
        { kind: 'lv', act: 'hulotte', label: 'PARLER', x: S.HULOTTE.x, z: S.HULOTTE.z, y: S.HULOTTE.y },
      ];
      if (!onRaft(Q)) { const gp = gaston.getWorldPosition(new THREE.Vector3()); out.push({ kind: 'lv', act: 'gaston', label: 'PARLER', x: gp.x, z: gp.z, y: gp.y }); }
      return out;
    },
    interact(n) {
      if (n.act === 'noisette') talkNoisette();
      else if (n.act === 'pistache') talkPistache();
      else if (n.act === 'hulotte') talkHulotte();
      else if (n.act === 'gaston') talkGaston();
    },
    step(dt) {
      const s = save(), t = game.t;
      const PL = players();
      // lanternes : coup de queue tournoyant à côté
      for (const p of PL) {
        if (p.attackT <= 0) continue;
        for (const l of lanterns) {
          if (l.lit) continue;
          const d = Math.hypot(l.def.x - p.pos.x, l.def.z - p.pos.z);
          if (d < 2.8 && Math.abs(l.def.y - p.pos.y) < 2.2) lightLantern(l);
        }
      }
      // patte géante
      if (PL.some(p => p.grounded && p.onCol && p.onCol.kind === 'switch') && t > st.leafUntil - LEAF_REARM) {
        const first = st.leafUntil < 0;
        st.leafUntil = t + S.LEAF_TIME; st.leafWarned = false;
        setLeaves(true);
        game.sound('switch');
        game.burst(S.SWITCH.x, S.SWITCH.y + 0.5, S.SWITCH.z, 14, 0x8aff6a, 3, 0.6);
        if (first) game.banner('Des feuilles magiques !', 'Elles poussent sur le lac… mais pas pour longtemps !', 2600);
      }
      if (st.leafUntil > 0 && t > st.leafUntil) { setLeaves(false); st.leafUntil = 0; }
      // porte du repaire
      if (!st.gateOpen && s.medals.length >= S.GATE_MEDALS) openGate(false);
      if (!st.gateOpen && PL.some(p => Math.hypot(p.pos.x - S.GATE.x, p.pos.z - S.GATE.z) < 3.2) && t - st.gateHintT > 6) {
        st.gateHintT = t;
        game.banner('La porte est fermée', `Il faut ${S.GATE_MEDALS} médailles pour entrer (tu en as ${s.medals.length})`, 2400);
      }
      // les chats : tous partis → la médaille au campement
      if (!st.catsDone && catsLeft() === 0) {
        st.catsDone = true;
        if (game.t > 1) { game.banner('Tous les chats bandits ont filé !', 'Une Médaille Patoune est apparue au campement, près du feu !', 3200); }
      }
      stepRaft(dt);
      stepOwlets(dt);
      stepBerries();
      // le rond de fées
      if (!forest().fairy && PL.some(P => Math.hypot(P.pos.x - S.FAIRY.x, P.pos.z - S.FAIRY.z) < 1.4 && P.grounded)) {
        forest().fairy = true; game.persist(); st.fairyT = t;
        snd.chime();
        game.burst(S.FAIRY.x, S.FAIRY.y + 1, S.FAIRY.z, 40, 0xffd0ff, 5, 0.9);
        game.banner('Un rond de fées !', 'Fais un vœu… Chut, c\'est un secret !', 3000);
      }
      // combat
      if (!s.boss) { stepBoss(dt); stepYarns(dt); }
      if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
        updateChips();
        const qt = logic.questText();
        if (qt !== st.quest) { st.quest = qt; game.updateHud(); }
      }
    },
    reveal() {
      const s = save(), f = forest();
      return {
        m_mush: !!f.feast,
        m_cats: S.cats.filter(c => c.group === 'clearing').every(c => s.cats.includes(c.id)),
        m_lanterns: s.lanterns.length >= S.lanterns.length,
        m_owl: f.owlets.length >= S.OWLETS.length,
        m_boss: !!s.boss,
      };
    },
    applySave() {
      const f = forest();
      refreshLanterns();
      if (save().boss) B.phase = 'gone';
      for (const o of owlets) if (f.owlets.includes(o.def.id)) { o.state = 'home'; o.follow = -1; }
      st.catsDone = catsLeft() === 0;
      updateChips();
    },
    /** Après une chute de cœurs pendant le combat, on repart devant la porte du repaire. */
    respawn() {
      if (B.phase === 'idle' || B.phase === 'gone') return null;
      bossReset();
      return { x: S.GATE.x, y: S.heightAt(S.GATE.x, S.GATE.z + 4), z: S.GATE.z + 4 };
    },
    guideTarget(me) {
      const f = forest();
      const mine = owlets.find(o => o.state === 'follow' && o.follow === me.id);
      if (mine) {
        // vers le rocher : d'abord la patte magique (ou la souche), puis le nid
        if (me.pos.y > S.OWL_TOP - 1.5 || st.leafUntil > game.t) return Object.assign({}, S.NEST);
        return { x: S.SWITCH.x, y: S.SWITCH.y, z: S.SWITCH.z };
      }
      if (me.berries && me.berries.length && (me.berries.length + potCount() >= S.BERRIES_NEEDED || !S.BUSHES.some(bushFull))) return { x: S.POT.x, y: S.POT.y, z: S.POT.z };
      if (game.medals.some(m => m.mesh.visible)) return null;
      let best = null, bd = Infinity;
      for (const g of nextGoals(me)) {
        const d = Math.hypot(g.x - me.pos.x, g.z - me.pos.z);
        if (d < bd) { bd = d; best = g; }
      }
      if (best && f) return { x: best.x, y: best.y, z: best.z };
      return null;
    },
    questText() {
      const s = save(), f = forest(), me = meF();
      if (!s.intro) return 'Parle à Mamie Labrador';
      const mine = me && owlets.find(o => o.state === 'follow' && o.follow === me.id);
      if (mine) return `Ramène ${mine.def.name} sur le Rocher du Hibou`;
      if (me && me.berries && me.berries.length) return `Porte les baies à la marmite de Noisette (${potCount() + me.berries.length}/${S.BERRIES_NEEDED})`;
      if (s.medals.length >= 5) return 'La forêt est libérée, bravo !';
      const nearTo = (o, r) => me && Math.hypot(me.pos.x - o.x, me.pos.z - o.z) < r;
      if (campCatsLeft() > 0 && nearTo(S.SPOTS.camp, 22)) return `Chasse les chats du campement (${campCatsLeft()})`;
      if (lookoutsLeft() > 0 && nearTo(S.SPOTS.treehouses, 32)) return `Chasse les chats guetteurs des cabanes (${lookoutsLeft()})`;
      if (!f.feast && nearTo(S.POT, 20)) return f.met.includes('noisette') ? `Baies pour Noisette : ${potCount()}/${S.BERRIES_NEEDED}` : 'Parle à Noisette la hérissonne';
      if (f.owlets.length < S.OWLETS.length && nearTo(S.OWL, 22)) return `Bébés hiboux : ${f.owlets.length}/${S.OWLETS.length}`;
      if (st.gateOpen && !s.boss) return 'Va au repaire de la Capitaine Moustache, tout au nord';
      return `Médailles ${s.medals.length}/5 · Lanternes ${s.lanterns.length}/${S.lanterns.length}`;
    },
    minimapMarks() {
      const out = [], s = save(), f = forest();
      for (const l of S.lanterns) if (!s.lanterns.includes(l.id)) out.push([l.x, l.z, '#ff9a3a', 2.8]);
      for (const o of owlets) if (o.state !== 'home') out.push([o.x, o.z, '#ffffff', 2.6]);
      if (!f.feast && f.met.includes('noisette')) for (const b of S.BUSHES) if (bushFull(b)) out.push([b.x, b.z, '#c05ad8', 2.2]);
      out.push([RC.x, RC.z, '#a0703e', 2.4]);
      if (!f.met.includes('noisette')) out.push([S.FRIENDS.noisette.x, S.FRIENDS.noisette.z, '#8ad0ff', 3.2]);
      if (!f.met.includes('hulotte')) out.push([S.HULOTTE.x, S.HULOTTE.z, '#8ad0ff', 3.2]);
      return out;
    },
    snapshot() {
      const r = (x) => Math.round(x * 100) / 100;
      return {
        l: st.leafUntil > 0 ? r(st.leafUntil - game.t) : 0,
        g: st.gateOpen ? 1 : 0,
        b: [B.phase, r(B.x), r(B.y), r(B.z), r(B.yaw), B.hp],
        y: st.yarns.map(y => [r(y.x), r(y.y), r(y.z)]),
        r: [r(R.s), R.moving ? 1 : 0],
        o: owlets.map(o => [o.state, o.follow, r(o.x), r(o.y), r(o.z), r(o.yaw)]),
        pb: players().map(P => [P.id, (P.berries || []).slice()]),
      };
    },
    apply(x) {
      st.leafUntil = x.l > 0 ? game.t + x.l : 0;
      setLeaves(x.l > 0);
      if (x.g && !st.gateOpen) openGate(true);
      const [ph, bx, by, bz, yaw, hp] = x.b;
      B.phase = ph; B.hp = hp; B.yaw = yaw;
      B.x += (bx - B.x) * 0.5; B.y += (by - B.y) * 0.5; B.z += (bz - B.z) * 0.5;
      st.yarns = x.y.map(([a, b, c]) => ({ x: a, y: b, z: c }));
      if (x.r) { R.s += (x.r[0] - R.s) * 0.5; if (Math.abs(x.r[0] - R.s) > 4) R.s = x.r[0]; R.moving = !!x.r[1]; const p = S.riverAt(R.s); RC.x = p.x; RC.z = p.z; R.yaw = Math.atan2(p.tx, p.tz); }
      if (x.o) x.o.forEach(([state, fol, ox, oy, oz, oyaw], i) => { const o = owlets[i]; if (!o) return; o.state = state; o.follow = fol; o.x += (ox - o.x) * 0.5; o.y += (oy - o.y) * 0.5; o.z += (oz - o.z) * 0.5; o.yaw = oyaw; });
      if (x.pb) for (const [id, list] of x.pb) { const P = game.party.get(id); if (P) P.berries = list; }
    },
    talkMamie(first) {
      const s = save(), f = forest();
      const k = game.controlsHelp();
      if (first || !s.intro) {
        game.say([
          { who: 'Mamie Labrador', text: 'Nous y voilà : la Forêt des Moustaches ! C\'est ici que la Capitaine s\'est cachée.' },
          { who: 'Biscotte', text: 'Ouaf ! J\'ai voulu venir aussi !' },
          { who: 'Mamie Labrador', text: 'La forêt est immense. Son repaire est tout au nord, de l\'autre côté de la rivière… mais la porte ne s\'ouvre qu\'avec 4 Médailles Patounes.' },
          { who: 'Mamie Labrador', text: 'Les habitants de la forêt ont besoin d\'aide : Noisette la hérissonne, au village de l\'ouest, et Mère Hulotte, sur le Rocher du Hibou.' },
          { who: 'Mamie Labrador', text: `Et les 6 lanternes de la forêt sont éteintes : allumez-les avec un coup de queue (${k.attack}).` },
          { who: 'Ainu', text: 'Ouaf ! On y va, Matcha !' },
          { who: 'Matcha', text: 'Et on ramasse toutes les croquettes dorées au passage !' },
        ], () => { s.intro = true; game.persist(); game.banner(S.NAME, 'Aidez les amis de la forêt et trouvez 4 médailles !', 2800); game.updateHud(); updateChips(); });
        return;
      }
      if (s.medals.length >= 5) { game.say([{ who: 'Mamie Labrador', text: 'Bravo, mes toutous ! La forêt est libérée. Il reste peut-être des croquettes à trouver…' }]); return; }
      const litLeft = S.lanterns.filter(l => !s.lanterns.includes(l.id));
      const lost = owlets.find(o => o.state === 'lost');
      const patch = S.BERRY_PATCHES.find(p => S.BUSHES.some(b => b.patch === p.id && bushFull(b)));
      const nOwl = S.OWLETS.length - f.owlets.length, nBer = S.BERRIES_NEEDED - potCount();
      const hints = {
        m_lanterns: litLeft.length ? `Encore ${litLeft.length} lanterne${litLeft.length > 1 ? 's' : ''} à allumer. Il y en a une ${litLeft[0].where}.` : 'Toutes les lanternes sont allumées : la médaille brille sur l\'autel !',
        m_owl: f.owlets.length >= S.OWLETS.length ? 'La médaille de Mère Hulotte vous attend sur le Rocher du Hibou !'
          : !f.met.includes('hulotte') && !owlets.some(o => o.state !== 'lost') ? 'Mère Hulotte, sur le Rocher du Hibou, a perdu ses trois bébés. Montez sur la souche et planez jusqu\'au rocher !'
            : lost ? `Il reste ${nOwl} bébé${nOwl > 1 ? 's' : ''} hibou à ramener. ${lost.def.name} est ${lost.def.where}.` : 'Ramenez les bébés hiboux sur le Rocher du Hibou, au milieu du lac !',
        m_mush: f.feast ? 'La médaille des hérissons brille en haut de la Tour des Champignons !'
          : !f.met.includes('noisette') ? 'Noisette la hérissonne prépare un festin, au village de l\'ouest. Allez la voir !'
            : `Il manque ${nBer} poignée${nBer > 1 ? 's' : ''} de baies pour la marmite de Noisette.${patch ? ` Il reste des buissons ${patch.name}.` : ''}`,
        m_cats: campCatsLeft() > 0 ? 'Les chats bandits ont un campement à l\'est. Chassez-les tous !'
          : lookoutsLeft() > 0 ? 'Des chats guetteurs se cachent en haut des cabanes dans les arbres, au nord-est !' : 'Les chats ont fui : leur médaille est au campement, près du feu.',
        m_boss: s.medals.length >= S.GATE_MEDALS ? 'Le repaire est ouvert, tout au nord. Évitez les pelotes et attaquez quand elle est fatiguée !' : null,
      };
      const left = S.medals.filter(m => !s.medals.includes(m.id)).map(m => hints[m.id]).filter(Boolean);
      game.say([{ who: 'Mamie Labrador', text: `Vous avez ${s.medals.length} médaille${s.medals.length > 1 ? 's' : ''} sur 5.` }, ...left.slice(0, 2).map(t => ({ who: 'Mamie Labrador', text: t }))]);
    },
    endLines() {
      return [
        { who: 'Mamie Labrador', text: 'Les 5 Médailles de la forêt ! La Capitaine Moustache a pris la fuite !' },
        { who: 'Noisette la hérissonne', text: 'Et ce soir, festin pour tout le monde, au village !' },
        { who: 'Mère Hulotte', text: 'Hou-hou ! Mes bébés vous chanteront une berceuse.' },
        { who: 'Biscotte', text: 'Vous êtes les meilleurs !' },
        { who: 'Matcha', text: 'Elle n\'a qu\'à bien se tenir !' },
        { who: 'Ainu', text: 'Ouaf ! À la prochaine aventure !' },
      ];
    },
    render(dt, t) {
      const cam = game.camera.position, s = save();
      // décor lointain caché (la forêt est grande)
      const far = lite ? 175 : 235;
      for (const c of cull) c.obj.visible = Math.hypot(c.x - cam.x, c.z - cam.z) < far + c.r;
      const hiR = lite ? 55 : 80;
      for (const ch of treeChunks) {
        const d = Math.hypot(ch.x - cam.x, ch.z - cam.z);
        ch.g.visible = d < far + 40;
        const hi = d < hiR;
        ch.hi.visible = hi; ch.lo.visible = !hi;
        if (ch.fringe) ch.fringe.visible = hi;
      }
      // les chats très loin ne sont pas dessinés (ils sont détaillés : ça coûte cher)
      for (const c of game.cats) if (!c.dead || c.fly) c.mesh.visible = Math.hypot(c.pos.x - cam.x, c.pos.z - cam.z) < (lite ? 90 : 140);
      // lucioles : un nuage qui suit la caméra, et l'essaim du bosquet
      const n = s.lanterns.length;
      const ux = Math.floor(t * 4) !== Math.floor((t - dt) * 4);
      for (let i = 0; i < NT; i++) {
        const b = fbase[i];
        let x = b[0], z = b[2];
        if (i < NF) {
          x = cam.x + ((((b[0] - cam.x) % (2 * FB)) + 3 * FB) % (2 * FB)) - FB;
          z = cam.z + ((((b[2] - cam.z) % (2 * FB)) + 3 * FB) % (2 * FB)) - FB;
          if (ux || b[5] === undefined || Math.abs(b[5] - x) > 1 || Math.abs(b[6] - z) > 1) { b[1] = Math.max(0.3, S.heightAt(x, z)); b[5] = x; b[6] = z; }
        }
        fpos[i * 3] = x + Math.sin(t * 0.5 + b[3]) * 1.5;
        fpos[i * 3 + 1] = b[1] + b[4] + Math.sin(t * 1.3 + b[3] * 2) * 0.5;
        fpos[i * 3 + 2] = z + Math.cos(t * 0.4 + b[3]) * 1.5;
      }
      fgeo.attributes.position.needsUpdate = true;
      flies.material.opacity = 0.55 + Math.sin(t * 3) * 0.15 + n * 0.04;
      // feux
      for (const F of [campFire, potFire]) {
        F.flames.forEach((f, i) => { const k = 1 + Math.sin(t * (9 + i * 3) + i) * 0.15; f.scale.set(k, 1 + Math.sin(t * 7 + i * 2) * 0.2, k); });
        F.glow.material.opacity = 0.5 + Math.sin(t * 11) * 0.1;
      }
      // la soupe de Noisette : elle monte avec les baies, et bouillonne
      {
        const k = Math.min(1, potCount() / S.BERRIES_NEEDED);
        soup.position.y = S.POT.y + 0.55 + k * 0.85 + Math.sin(t * 5) * 0.02;
        soup.scale.setScalar(0.85 + k * 0.25);
        soupMat.emissiveIntensity = 0.3 + (t - st.potT < 1 ? (1 - (t - st.potT)) * 1.2 : 0);
        if (k > 0 && Math.random() < dt * 6 && Math.hypot(cam.x - S.POT.x, cam.z - S.POT.z) < 40) game.spawnParticle(S.POT.x + (Math.random() - 0.5) * 1.6, soup.position.y + 0.1, S.POT.z + (Math.random() - 0.5) * 1.6, 0, 1.2, 0, 0xd8b0ff, 0.18, 0.6, 0);
      }
      // Noisette remue la soupe, les hérissons dansent quand c'est la fête
      noisette.rotation.y += Math.sin(t * 2) * dt * 0.6;
      noisette.userData.head.rotation.x = Math.sin(t * 2.4) * 0.12;
      hedgehogs.forEach((h, i) => { h.position.y = S.heightAt(h.position.x, h.position.z) + (forest().feast ? Math.abs(Math.sin(t * 6 + i)) * 0.35 : 0); h.userData.head.rotation.y = Math.sin(t * 0.8 + i) * 0.4; });
      // Pistache agite la queue, Mère Hulotte tourne la tête
      pistache.userData.tail.rotation.x = Math.sin(t * 5) * 0.2;
      pistache.userData.head.rotation.y = Math.sin(t * 0.9) * 0.5;
      hulotte.userData.head.rotation.y = Math.sin(t * 0.6) * 0.9;
      if (Math.random() < dt * 0.08 && Math.hypot(cam.x - S.OWL.x, cam.z - S.OWL.z) < 40) snd.hoot();
      // champignons qui s'écrasent
      for (const b of bouncers) {
        const since = t - (b.def.col.squashT || -9);
        const k = since < 0.5 ? 1 - Math.sin(since / 0.5 * Math.PI) * 0.3 * (1 - since / 0.5) : 1;
        b.cap.scale.set(2 - k, k, 2 - k);
      }
      // feuilles magiques
      const left = st.leafUntil > 0 ? st.leafUntil - t : -1;
      for (const l of leaves) {
        const target = left > 0 ? 1 : 0;
        l.k += (target - l.k) * Math.min(1, dt * 6);
        l.g.visible = l.k > 0.02;
        const blink = left > 0 && left < 3 && Math.floor(t * 6) % 2 === 0;
        l.g.scale.setScalar(Math.max(0.001, l.k));
        leafMat.opacity = blink ? 0.45 : 1;
        l.g.position.y = l.def.top + Math.sin(t * 2 + l.def.x) * 0.03;
      }
      pawMat.emissiveIntensity = left > 0 ? 1.2 : 0.4 + Math.sin(t * 3) * 0.15;
      pawGlow.material.opacity = left > 0 ? 0.6 : 0.15 + Math.sin(t * 3) * 0.08;
      // lanternes
      for (const l of lanterns) {
        if (l.lit) l.glow.material.opacity = 0.65 + Math.sin(t * 4 + l.def.x) * 0.1 + Math.max(0, 1 - (t - l.litT)) * 0.6;
        l.hint.material.opacity = l.lit || !s.intro ? 0 : 0.45 + Math.sin(t * 5 + l.def.z) * 0.25;
        l.hint.position.y = 2.2 + Math.sin(t * 2 + l.def.x) * 0.15;
      }
      rune.rotation.z = t * 0.3;
      // cristaux et champignons lumineux qui respirent
      crystalMats.forEach((m, i) => { m.emissiveIntensity = 0.75 + Math.sin(t * 1.6 + i * 1.4) * 0.3; });
      for (const m of glowMush) m.emissiveIntensity = 0.65 + Math.sin(t * 1.2) * 0.25;
      // la cascade
      if (fallParts.streamTex) fallParts.streamTex.offset.y = -(t * 0.9) % 1;
      fallParts.foam.rotation.z = t * 0.2; fallParts.foam.material.opacity = 0.35 + Math.sin(t * 3) * 0.08;
      fallParts.mist.material.opacity = 0.28 + Math.sin(t * 1.7) * 0.06;
      // rondins qui dansent
      for (const lg of logMeshes) { lg.m.position.y = lg.l.top - 1.1 + Math.sin(t * 1.8 + lg.ph) * 0.04; lg.m.rotation.z = Math.sin(t * 1.3 + lg.ph) * 0.03; }
      // le radeau et Gaston
      raftMesh.position.set(RC.x, RF.top - 0.42 + Math.sin(t * 1.6) * 0.04, RC.z);
      raftMesh.rotation.set(Math.sin(t * 1.1) * 0.02, R.yaw || 0, Math.sin(t * 1.4) * 0.025);
      gaston.rotation.y = R.moving ? 0 : Math.PI + Math.sin(t * 0.7) * 0.4;
      gaston.position.y = 0.32 + (R.moving ? Math.abs(Math.sin(t * 3)) * 0.05 : 0);
      game.placeShadow(raftShadow, raftMesh.position, RF.r * 0.9);
      raftShadow.visible = false;
      // baies sur les buissons, et dans les paniers des chiens
      {
        let j = 0;
        const full = S.BUSHES.map(bushFull);
        S.BUSHES.forEach((b, i) => {
          for (let k = 0; k < BPB; k++) {
            const a = k * 2.4 + i, up = 0.45 + (k % 3) * 0.3, rr = 0.95 - (k % 3) * 0.15;
            const sc2 = full[i] ? 1 + Math.sin(t * 3 + k + i) * 0.05 : 0.0001;
            m4.compose(v.set(b.x + Math.cos(a) * rr * 1.25, b.y + up * 1.1, b.z + Math.sin(a) * rr * 1.25), q.identity(), sv.setScalar(sc2));
            berryI.setMatrixAt(j++, m4);
          }
        });
        for (const P of players()) {
          if (!P.berries || !P.berries.length || !P.mesh) continue;
          const top = P.mesh.userData.ainu ? 2.3 : (P.mesh.userData.height || 1.1) + 0.4;
          const nB = Math.min(P.berries.length * 2, 12);
          for (let k = 0; k < nB && j < BMAX; k++) {
            const a = t * 2 + k * (Math.PI * 2 / nB);
            m4.compose(v.set(P.pos.x + Math.cos(a) * 0.4, P.pos.y + top + (k % 2) * 0.18 + Math.sin(t * 4 + k) * 0.05, P.pos.z + Math.sin(a) * 0.4), q.identity(), sv.setScalar(1.1));
            berryI.setMatrixAt(j++, m4);
          }
        }
        berryI.count = j;
        berryI.instanceMatrix.needsUpdate = true;
      }
      // bébés hiboux
      owlets.forEach((o, i) => {
        o.m.position.set(o.x, o.y + (o.state === 'lost' ? Math.abs(Math.sin(t * 2 + i)) * 0.08 : 0), o.z);
        o.m.rotation.y = o.state === 'lost' ? Math.sin(t * 0.8 + i) * 0.8 : o.yaw;
        const flap = o.state === 'follow' ? Math.sin(t * 18 + i) * 0.9 : o.state === 'home' ? Math.sin(t * 3 + i) * 0.15 : Math.max(0, Math.sin(t * 2.5 + i * 2)) * 0.6;
        o.m.userData.wings.forEach((w, k) => { w.rotation.z = (k ? -1 : 1) * flap; });
        o.m.userData.head.rotation.z = Math.sin(t * 1.5 + i) * 0.2;
        o.mark.visible = o.state === 'lost' && s.intro;
        o.mark.position.set(o.x, o.y + 1.8 + Math.sin(t * 4 + i) * 0.08, o.z);
      });
      // le rond de fées s'illumine une fois trouvé
      fairyMat.emissive.setHex(forest().fairy ? 0x401020 : 0x000000);
      fairyGlow.material.opacity = forest().fairy ? 0.25 + Math.sin(t * 2) * 0.1 : (t - st.fairyT < 3 ? 0.8 : 0);
      // porte qui s'enfonce
      st.gateK += ((st.gateOpen ? 1 : 0) - st.gateK) * Math.min(1, dt * 2);
      gate.position.y = S.ARENA.y - st.gateK * 4.2;
      gate.visible = st.gateK < 0.98;
      // Capitaine
      const gone = B.phase === 'gone' || s.boss && B.phase !== 'defeated';
      cap.visible = !gone && !(B.inv > 0 && Math.floor(t * 14) % 2 === 0);
      bossShadow.visible = cap.visible;
      if (cap.visible) {
        cap.position.set(B.x, B.y, B.z);
        cap.rotation.y = B.yaw;
        const u = cap.userData;
        const tired = B.phase === 'tired';
        u.stars.visible = tired;
        if (tired) { u.stars.children.forEach((s2, i) => { const a = t * 4 + i * Math.PI / 2; s2.position.set(Math.cos(a) * 0.45, Math.sin(t * 6 + i) * 0.05, Math.sin(a) * 0.45); }); }
        u.head.rotation.z = tired ? Math.sin(t * 3) * 0.25 : 0;
        u.head.rotation.x = B.phase === 'throw' && B.t < 0.3 ? -0.3 : 0;
        u.tail.rotation.x = -0.3 + Math.sin(t * 5) * 0.3;
        const walk = B.phase === 'hop' || B.phase === 'defeated';
        u.legs.forEach((l, i) => { l.rotation.x = walk ? (i < 2 ? -0.8 : 0.8) : tired ? 0.5 : Math.sin(t * 2 + i) * 0.05; });
        cap.position.y = B.y - (tired ? 0.15 : 0);
        game.placeShadow(bossShadow, cap.position, 1.2);
      }
      yarnMeshes.forEach((m, i) => {
        const y = st.yarns[i];
        m.visible = !!y;
        if (y) { m.position.set(y.x, y.y, y.z); m.rotation.x += dt * 8; m.rotation.y += dt * 3; }
      });
    },
  };
  const LEAF_REARM = 3; // on peut relancer les feuilles quand il reste moins de 3 s

  // état initial d'après la sauvegarde
  refreshLanterns();
  if (game.save.medals.length >= S.GATE_MEDALS) openGate(true);
  if (game.save.boss) B.phase = 'gone';
  for (const o of owlets) if (forest().owlets.includes(o.def.id)) o.state = 'home';
  st.catsDone = catsLeft() === 0;
  setLeaves(false);
  updateChips();
  return logic;
}
