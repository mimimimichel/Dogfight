/*
 * Matcha & Ainu — personnages non joueurs réalistes (modèles 3D gratuits, licence CC-BY,
 * voir assets/npc/CREDITS.md), convertis par tools/npc/convert.mjs.
 *
 * Les modèles sont des statues : on leur pose un petit squelette automatique
 * (tête, queue, quatre pattes) d'après la forme du corps, pour qu'ils bougent
 * comme les autres personnages (userData : head, tail, legs).
 */
import * as THREE from '../vendor/three.module.min.js';

const BASE = new URL('./assets/npc/', import.meta.url);
const cache = {};

/** Charge les modèles (une seule fois). */
export function preloadNpcs(names) {
  return Promise.all(names.map(async (name) => {
    if (cache[name]) return;
    const meta = await (await fetch(new URL(name + '.json', BASE))).json();
    const bin = await (await fetch(new URL(name + '.bin', BASE))).arrayBuffer();
    const texs = {};
    const parts = meta.parts.map((p) => {
      const n = p.vertices, o = p.offsets;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, o[0], n * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(bin, o[1], n * 3), 3, true));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, o[2], n * 2), 2));
      g.setIndex(new THREE.BufferAttribute(p.big ? new Uint32Array(bin, o[3], p.indices) : new Uint16Array(bin, o[3], p.indices), 1));
      g.computeBoundingSphere();
      let map = null;
      if (p.tex) {
        if (!texs[p.tex]) {
          const t = new THREE.TextureLoader().load(new URL(p.tex, BASE).href);
          t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4;
          texs[p.tex] = t;
        }
        map = texs[p.tex];
      }
      return { g, map, color: new THREE.Color(...p.color), rough: Math.max(0.55, p.rough) };
    });
    cache[name] = { meta, parts };
  })).catch(() => {});
}
export const hasNpc = (name) => !!cache[name];

/**
 * Le personnage, avec son squelette.
 * opts : tint (couleur qui teinte le pelage), legs (pattes animées ?), scale.
 */
export function buildNpc(name, opts) {
  opts = opts || {};
  const C = cache[name];
  const root = new THREE.Group();
  const size = C.meta.size, H = size[1];
  // ---- analyse de la forme : pattes, tête, queue ----
  let zmin = 1e9, zmax = -1e9;
  for (const p of C.parts) { const a = p.g.attributes.position.array; for (let i = 2; i < a.length; i += 3) { zmin = Math.min(zmin, a[i]); zmax = Math.max(zmax, a[i]); } }
  const L = zmax - zmin;
  const legTop = H * (opts.legTop || 0.42);
  const headZ = zmax - L * (opts.head || 0.28), tailZ = zmin + L * (opts.tail || 0.14);
  // pattes : barycentre des sommets bas, par quart (avant/arrière, gauche/droite)
  const acc = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let zl = 0, nl = 0;
  for (const p of C.parts) { const a = p.g.attributes.position.array; for (let i = 0; i < a.length; i += 3) if (a[i + 1] < legTop * 0.6) { zl += a[i + 2]; nl++; } }
  const zMid = nl ? zl / nl : (zmin + zmax) / 2;
  const legOf = (x, z) => (z > zMid ? 0 : 2) + (x > 0 ? 1 : 0);   // 0 avant-gauche… 3 arrière-droite
  let hy = 0, hz = 0, hn = 0, ty = 0, tn = 0;
  for (const p of C.parts) {
    const a = p.g.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      const x = a[i], y = a[i + 1], z = a[i + 2];
      if (y < legTop) { const q = acc[legOf(x, z)]; q[0] += x; q[1] += z; q[2]++; }
      if (opts.headTop ? y > H * opts.headTop : (z > headZ && y > legTop)) { hy += y; hz += z; hn++; }
      if (z < tailZ && (opts.tailMaxY ? y < H * opts.tailMaxY : y > legTop * 0.6)) { ty += y; tn++; }
    }
  }
  // ---- os ----
  const bones = [], rootBone = new THREE.Bone(); bones.push(rootBone);
  const mk = (x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); rootBone.add(b); bones.push(b); return b; };
  const legs = acc.map((q) => mk(q[2] ? q[0] / q[2] : 0, legTop, q[2] ? q[1] / q[2] : zMid));
  const headY = hn ? hy / hn : H * 0.8;
  const head = opts.headTop ? mk(0, H * opts.headTop, hn ? hz / hn - L * 0.05 : 0) : mk(0, headY - H * 0.08, headZ);
  const tail = mk(0, tn ? ty / tn : H * 0.5, tailZ);
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // ---- poids : chaque sommet suit au plus un os (et le corps pour le reste) ----
  const meshes = [];
  for (const p of C.parts) {
    const a = p.g.attributes.position.array, n = a.length / 3;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
      let bi = 0, w = 0;
      if (opts.legs !== false && y < legTop) { bi = 1 + legOf(x, z); w = sm(legTop, legTop - H * 0.12, y); }
      else if (opts.headTop ? y > H * opts.headTop : z > headZ) { bi = 5; w = opts.headTop ? sm(H * opts.headTop, H * (opts.headTop + 0.05), y) : sm(headZ, headZ + L * 0.06, z); }
      else if (z < tailZ && (!opts.tailMaxY || y < H * opts.tailMaxY)) { bi = 6; w = sm(tailZ, tailZ - L * 0.05, z) * (opts.tailMaxY ? sm(H * opts.tailMaxY, H * opts.tailMaxY * 0.6, y) : 1); }
      si[i * 4] = bi; sw[i * 4] = w; si[i * 4 + 1] = 0; sw[i * 4 + 1] = 1 - w;
    }
    const g = p.g.clone();
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const col = p.color.clone(); if (opts.tint) col.multiply(new THREE.Color(opts.tint));
    const mat = new THREE.MeshStandardMaterial({ map: p.map, color: col, roughness: p.rough });
    mat.userData.keepPBR = true;
    const m = new THREE.SkinnedMesh(g, mat);
    m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
    meshes.push(m);
  }
  const body = new THREE.Group(); root.add(body);
  const skeleton = new THREE.Skeleton(bones);
  meshes[0].add(rootBone);
  for (const m of meshes) { body.add(m); m.bind(skeleton); }
  // repères pour les accessoires : sommet de la tête, museau, cou
  const headTop = new THREE.Object3D(); headTop.position.set(0, H * 0.13, L * 0.06); head.add(headTop);
  const face = new THREE.Object3D(); face.position.set(0, H * 0.06, zmax - headZ); head.add(face);
  const neck = new THREE.Object3D(); neck.position.set(0, -H * 0.02, -L * 0.03); head.add(neck);
  if (opts.scale) root.scale.setScalar(opts.scale);
  root.userData = { head, tail, legs: opts.legs === false ? [] : legs, body, headTop, face, neck, height: H * (opts.scale || 1), realistic: true };
  return root;
}

/** Tous les sommets d'un modèle (pour placer des accessoires). */
function points(name, test) {
  const out = [];
  for (const p of cache[name].parts) { const a = p.g.attributes.position.array; for (let i = 0; i < a.length; i += 3) if (test(a[i], a[i + 1], a[i + 2])) out.push([a[i], a[i + 1], a[i + 2]]); }
  return out;
}
const mean = (pts) => pts.reduce((m, p) => [m[0] + p[0] / pts.length, m[1] + p[1] / pts.length, m[2] + p[2] / pts.length], [0, 0, 0]);

/** Mamie Labrador : golden retriever assis, lunettes rondes et bandana rouge. */
export function buildMamieReal() {
  const HT = 0.72;
  // la queue est posée au sol derrière elle : seule la queue remue (pas l'arrière-train) ; pelage doré de labrador
  const g = buildNpc('mamie', { legs: false, headTop: HT, tail: 0.1, tailMaxY: 0.1, legTop: 0.3, tint: 0xffe2b0 });
  const u = g.userData, H = cache.mamie.meta.size[1];
  // repères tirés de la forme : bout du museau, centre de la tête, cou
  const headPts = points('mamie', (x, y) => y > H * (HT + 0.04));
  const c = mean(headPts);
  const snout = headPts.reduce((b, p) => (p[2] + p[1] * 0.4 > b[2] + b[1] * 0.4 ? p : b), headPts[0]);
  const dir = new THREE.Vector3(snout[0] - c[0], snout[1] - c[1], snout[2] - c[2]).normalize();
  const eyes = new THREE.Vector3(c[0], c[1], c[2]).lerp(new THREE.Vector3(...snout), 0.22).add(new THREE.Vector3(0, H * 0.045, 0));
  const neckPts = points('mamie', (x, y, z) => y > H * (HT - 0.07) && y < H * (HT - 0.02));
  const nc = mean(neckPts);
  const nr = neckPts.reduce((m, p) => m + Math.hypot(p[0] - nc[0], p[2] - nc[2]) / neckPts.length, 0);
  const local = (v) => u.head.worldToLocal(v.clone());     // le squelette est au repos : repère du modèle
  g.updateMatrixWorld(true);
  // lunettes dorées, posées devant les yeux, face au museau
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b048, metalness: 0.9, roughness: 0.25 });
  const glasses = new THREE.Group();
  const s = H * 0.03;
  for (const sx of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(s, s * 0.14, 8, 24), gold); r.position.set(sx * s * 1.3, 0, 0); glasses.add(r);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(s * 0.95, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.05 }));
    lens.position.set(sx * s * 1.3, 0, 0.001); glasses.add(lens);
  }
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.1, s * 0.1, s * 0.7, 6), gold); bridge.rotation.z = Math.PI / 2; glasses.add(bridge);
  const ep = eyes.clone().addScaledVector(dir, H * 0.02);
  glasses.position.copy(local(ep));
  glasses.lookAt(new THREE.Vector3().copy(glasses.position).add(dir));
  u.head.add(glasses);
  // bandana rouge autour du cou
  const red = new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.75, side: THREE.DoubleSide });
  const band = new THREE.Mesh(new THREE.TorusGeometry(nr * 0.98, H * 0.018, 8, 32), red); band.rotation.x = Math.PI / 2;
  const tri = new THREE.Mesh(new THREE.ConeGeometry(nr * 0.42, H * 0.08, 3), red); tri.rotation.set(Math.PI, 0, 0); tri.scale.z = 0.35; tri.position.set(0, -H * 0.035, nr * 0.98);
  const bandana = new THREE.Group(); bandana.add(band, tri); bandana.position.set(nc[0], nc[1], nc[2]);
  u.body.add(bandana);
  // elle baisse la tête vers les chiens au lieu de regarder le ciel
  u.head.rotation.x = 0;
  u.headRestX = 0;
  // pattes avant posées au sol (le modèle scanné est un peu penché en arrière : le derrière s'enfonce dans l'herbe)
  const zs = points('mamie', () => true).map(p => p[2]), zmax = Math.max(...zs), zmin = Math.min(...zs);
  const paws = points('mamie', (x, y, z) => z > zmax - (zmax - zmin) * 0.3 && y < H * 0.3);
  if (paws.length) u.body.position.y = -Math.min(...paws.map(p => p[1]));
  return g;
}
