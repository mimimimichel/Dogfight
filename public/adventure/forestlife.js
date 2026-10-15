/*
 * Matcha & Ainu — Niveau 2 « La Forêt des Moustaches » : la vie de la forêt.
 * Des bêtes partout qui réagissent au chien (les écureuils grimpent aux arbres,
 * les oiseaux s'envolent, les lapins détalent, les hérissons se roulent en boule,
 * les grenouilles plongent), des tas de feuilles à fouiller, des buissons à
 * secouer, des fleurs qui s'ouvrent quand on aboie, des glands cachés pour
 * Pistache, la course contre Lapinou et les carillons de Mélodie la mésange.
 * Tout est instancié (quelques dessins pour des centaines de bêtes) ; les bêtes
 * lointaines ne sont ni animées ni dessinées.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as M from './models.js';
import { Kit, vmat } from './farmkit.js';

const Sph = (r, w, h) => new THREE.SphereGeometry(r, Math.min(w || 8, 8), Math.min(h || 6, 6));
const E = (rx, ry, rz, w, h) => { const g = new THREE.SphereGeometry(1, w || 10, h || 7); g.scale(rx, ry, rz); return g; };
const Cone = (r, h, s) => new THREE.ConeGeometry(r, h, s || 8);
const Cyl = (r0, r1, h, s) => new THREE.CylinderGeometry(r0, r1, h, s || 8);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const svg = (body) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`);
export const ICON_ACORN = svg('<g stroke="#3a2210" stroke-width="3"><ellipse cx="32" cy="40" rx="14" ry="17" fill="#c8843a"/><path d="M14 30c2-10 34-10 36 0z" fill="#7a5028"/><path d="M32 18v-8" fill="none"/></g><ellipse cx="27" cy="38" rx="4" ry="7" fill="#fff" opacity=".35"/>');

// ---------------------------------------------------------------------------
// Géométries (une seule par espèce : on les instancie)
// ---------------------------------------------------------------------------
function eyes(k, x, y, z, r) { for (const sx of [-1, 1]) { k.add(Sph(r, 8, 6), 0x1a120e, { x: sx * x, y, z }); k.add(Sph(r * 0.38, 6, 4), 0xffffff, { x: sx * x + r * 0.3, y: y + r * 0.4, z: z + r * 0.5 }); } }
function squirrelGeo() {
  const k = new Kit(), RED = 0xd8702a, CREAM = 0xf6e2c4;
  k.add(E(0.2, 0.26, 0.19), (x, y, z, c) => c.set(z > 0.07 ? CREAM : RED), { y: 0.3 });
  k.add(E(0.15, 0.13, 0.14), RED, { y: 0.58, z: 0.05 });
  k.add(E(0.08, 0.06, 0.07), CREAM, { y: 0.55, z: 0.15 });
  for (const sx of [-1, 1]) k.add(Cone(0.045, 0.11, 6), RED, { x: sx * 0.08, y: 0.72, z: 0.03 });
  for (let i = 0; i < 5; i++) { const a = i / 4; k.add(Sph(0.11 + Math.sin(a * Math.PI) * 0.06, 8, 6), i === 4 ? 0xf0a060 : RED, { y: 0.15 + a * 0.55, z: -0.22 - Math.sin(a * 2.4) * 0.16 + a * a * 0.22 }); }
  eyes(k, 0.065, 0.61, 0.13, 0.03);
  return k.geo();
}
function birdGeo() {
  const k = new Kit();
  k.add(E(0.12, 0.11, 0.16), (x, y, z, c) => c.set(y < -0.03 ? 0xf4ecd8 : 0xffffff), { y: 0.14 });
  k.add(Sph(0.085, 10, 8), 0xffffff, { y: 0.24, z: 0.1 });
  k.add(Cone(0.03, 0.08, 6), 0xf0a030, { y: 0.23, z: 0.2, rx: Math.PI / 2 });
  k.add(E(0.05, 0.02, 0.1), 0xdddddd, { y: 0.15, z: -0.17, rx: -0.4 });
  eyes(k, 0.05, 0.27, 0.15, 0.018);
  return k.geo();
}
function wingGeo() { const k = new Kit(); for (const sx of [-1, 1]) k.add(E(0.13, 0.02, 0.08), 0xe8e8e8, { x: sx * 0.13 }); return k.geo(); }
function rabbitGeo() {
  const k = new Kit();
  k.add(E(0.22, 0.2, 0.28), (x, y, z, c) => c.set(z > 0.12 && y < 0 ? 0xf6f0e8 : 0xffffff), { y: 0.24 });
  k.add(Sph(0.15, 12, 10), 0xffffff, { y: 0.45, z: 0.2 });
  for (const sx of [-1, 1]) { k.add(E(0.045, 0.17, 0.03), 0xffffff, { x: sx * 0.06, y: 0.68, z: 0.15, rz: sx * -0.15 }); k.add(E(0.025, 0.12, 0.01), 0xffb0c0, { x: sx * 0.06, y: 0.68, z: 0.175, rz: sx * -0.15 }); }
  k.add(Sph(0.07, 8, 6), 0xffffff, { y: 0.28, z: -0.28 });
  k.add(Sph(0.025, 6, 4), 0xff8aa0, { y: 0.45, z: 0.35 });
  eyes(k, 0.07, 0.5, 0.31, 0.03);
  return k.geo();
}
function hedgehogGeo() {
  const k = new Kit(), r = rng(9);
  k.add(E(0.3, 0.26, 0.34), 0xf0d4a8, { y: 0.26 });
  for (let i = 0; i < 26; i++) {
    const th = r() * Math.PI * 0.6, ph = (r() - 0.5) * Math.PI * 1.5 + Math.PI;
    const nx = Math.sin(th) * Math.sin(ph), ny = Math.cos(th), nz = Math.sin(th) * Math.cos(ph);
    if (nz > 0.4) continue;
    const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, ny, nz)));
    k.add(Cone(0.05, 0.2, 5), 0x5a3a22, { x: nx * 0.3, y: 0.28 + ny * 0.27, z: nz * 0.33, rx: e.x, ry: e.y, rz: e.z });
  }
  k.add(E(0.31, 0.28, 0.32), 0x8a5a36, { y: 0.29, z: -0.06 });
  k.add(Cone(0.12, 0.26, 10), 0xf0d4a8, { y: 0.27, z: 0.36, rx: Math.PI / 2 });
  k.add(Sph(0.04, 6, 4), 0x2a1a14, { y: 0.27, z: 0.5 });
  eyes(k, 0.07, 0.34, 0.33, 0.025);
  return k.geo();
}
function frogGeo() {
  const k = new Kit(), GR = 0x5abf3a;
  k.add(E(0.22, 0.16, 0.22), (x, y, z, c) => c.set(z > 0.08 && y < 0 ? 0xe8f0a0 : GR), { y: 0.16 });
  for (const sx of [-1, 1]) { k.add(E(0.09, 0.05, 0.15), GR, { x: sx * 0.18, y: 0.06, z: -0.03 }); k.add(Sph(0.065, 8, 6), 0xf4f4e8, { x: sx * 0.1, y: 0.3, z: 0.1 }); k.add(Sph(0.035, 6, 4), 0x1a120e, { x: sx * 0.1, y: 0.31, z: 0.16 }); }
  k.add(new THREE.TorusGeometry(0.11, 0.012, 4, 10, Math.PI), 0x8a2a2a, { y: 0.17, z: 0.2, rz: Math.PI });
  return k.geo();
}
function pileGeo() {
  const k = new Kit(), r = rng(5), cols = [0xd8902a, 0xc0602a, 0xe0b030, 0xb04a28, 0x9a6a2a];
  for (let i = 0; i < 12; i++) {
    const a = r() * 6.28, d = r() * 0.8;
    k.add(E(0.3, 0.05, 0.18, 6, 3), cols[i % cols.length], { x: Math.cos(a) * d, y: 0.08 + (0.8 - d) * 0.45 * r(), z: Math.sin(a) * d, ry: r() * 6.28, rx: (r() - 0.5) * 0.6 });
  }
  k.add(E(0.9, 0.35, 0.9), 0xb07028, { y: 0.05 });
  return k.geo();
}
function shrubGeo() {
  const k = new Kit(), r = rng(13);
  k.add(new THREE.IcosahedronGeometry(0.7, 1), 0x4a9a3c, { y: 0.55, sy: 0.85 });
  for (let i = 0; i < 5; i++) { const a = i * 1.26 + r(); k.add(new THREE.IcosahedronGeometry(0.42 + r() * 0.12, 1), i % 2 ? 0x5aa844 : 0x3e8a34, { x: Math.cos(a) * 0.5, y: 0.4 + r() * 0.25, z: Math.sin(a) * 0.5 }); }
  for (let i = 0; i < 7; i++) { const a = i * 0.9, u = 0.3 + r() * 0.5; k.add(Sph(0.07, 6, 4), [0xffffff, 0xffd0e0, 0xfff0a0][i % 3], { x: Math.cos(a) * 0.62, y: 0.4 + u * 0.6, z: Math.sin(a) * 0.62 }); }
  return k.geo();
}
function flowerHeadGeo() {
  const k = new Kit();
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.add(E(0.12, 0.025, 0.06, 6, 3), 0xffffff, { x: Math.cos(a) * 0.1, z: Math.sin(a) * 0.1, ry: -a }); }
  k.add(Sph(0.06, 8, 6), 0xffd040, { y: 0.02 });
  return k.geo();
}
function acornGeo() {
  const k = new Kit();
  k.add(E(0.12, 0.15, 0.12), 0xc8843a, { y: 0.0 });
  k.add(E(0.135, 0.07, 0.135), 0x7a5028, { y: 0.1 });
  k.add(Cyl(0.015, 0.02, 0.08, 5), 0x5a3a18, { y: 0.19 });
  return k.geo();
}

// ===========================================================================
export function buildLife(game, ctx) {
  const S = L, sc = game.scene, lite = game.lite;
  const { snd, forest, area, met } = ctx;
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3(), e = new THREE.Euler();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const players = () => game.players;
  const save = () => game.save;
  const inst = (geo, n, opts) => {
    const im = new THREE.InstancedMesh(geo, (opts && opts.mat) || vmat(0.8), Math.max(1, n));
    im.castShadow = !lite && !(opts && opts.noShadow); im.receiveShadow = true; im.frustumCulled = false;
    im.userData.noOutline = !!(opts && opts.noOutline);
    for (let i = 0; i < im.count; i++) im.setMatrixAt(i, ZERO);
    sc.add(im);
    return im;
  };
  const far2 = (lite ? 70 : 105) ** 2;
  const camNear = (x, z, cam) => (x - cam.x) ** 2 + (z - cam.z) ** 2 < far2;
  const nearestP = (x, z) => { let best = null, bd = 1e9; for (const P of players()) { const d = Math.hypot(P.pos.x - x, P.pos.z - z); if (d < bd) { bd = d; best = P; } } return [best, bd]; };
  // arbres proches de chaque écureuil (pour y grimper)
  const treeNear = (x, z) => { let b = null, bd = 14; for (const t of S.trees) { const d = Math.hypot(t.x - x, t.z - z); if (d < bd && d > 1.5) { bd = d; b = t; } } return b; };

  // --- les bêtes ---------------------------------------------------------------
  const mk = (list, extra) => list.map((p, i) => Object.assign({ def: p, x: p.x, y: p.y, z: p.z, yaw: (i * 2.4) % 6.28, st: 'idle', t: 0, ph: i * 1.7, hx: p.x, hz: p.z }, extra ? extra(p, i) : {}));
  const squirrels = mk(S.LIFE.squirrel, (p) => ({ tree: treeNear(p.x, p.z) }));
  const flocks = mk(S.LIFE.birds, (p, i) => ({ n: 3 + (i % 2), col: [0x5aa0e8, 0xe85a4a, 0xf0c040, 0x8ad06a, 0xb080e0][i % 5] }));
  const rabbits = mk(S.LIFE.rabbit, (p, i) => ({ col: [0xffffff, 0xc8a07a, 0xa8a0a0][i % 3] }));
  const hogs = mk(S.LIFE.hedgehog);
  const frogs = mk(S.LIFE.frog);
  const sqI = inst(squirrelGeo(), squirrels.length);
  const NB = flocks.reduce((t, f) => t + f.n, 0);
  const birdI = inst(birdGeo(), NB), wingI = inst(wingGeo(), NB);
  for (const f of flocks) { f.c3 = []; f.c3w = []; for (let k = 0; k < f.n; k++) { const c = new THREE.Color(f.col).offsetHSL(0, 0, (k - 1) * 0.04); f.c3.push(c); f.c3w.push(c.clone().multiplyScalar(0.85)); } }
  { const c = new THREE.Color(1, 1, 1); for (let i = 0; i < NB; i++) { birdI.setColorAt(i, c); wingI.setColorAt(i, c); } }
  const rabI = inst(rabbitGeo(), rabbits.length);
  rabbits.forEach((r, i) => { r.c3 = new THREE.Color(r.col); rabI.setColorAt(i, r.c3); });
  const hogI = inst(hedgehogGeo(), hogs.length);
  const frogI = inst(frogGeo(), frogs.length);

  // --- tas de feuilles, buissons, fleurs, glands -----------------------------------------
  const piles = S.LIFE.pile.map(p => ({ def: p, gone: -99, shake: -99 }));
  const shrubs = S.LIFE.shrub.map(p => ({ def: p, shake: -99, cd: -99 }));
  const pileI = inst(pileGeo(), piles.length, { noShadow: true });
  const shrubI = inst(shrubGeo(), shrubs.length);
  const FPB = 5;
  const beds = S.LIFE.flowers.map((p, i) => ({ def: p, open: 0, until: -99, col: [0xff7ab0, 0xffd040, 0x8ab0ff, 0xffffff, 0xd080ff][i % 5] }));
  const stemI = inst(new THREE.CylinderGeometry(0.02, 0.025, 0.5, 4).translate(0, 0.25, 0), beds.length * FPB, { mat: M.mat(0x4a9a3a), noShadow: true, noOutline: true });
  const headMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0 });
  const headI = inst(flowerHeadGeo(), beds.length * FPB, { mat: headMat, noShadow: true, noOutline: true });
  beds.forEach((b, i) => { b.c5 = []; for (let k = 0; k < FPB; k++) { b.c5.push(new THREE.Color(b.col).offsetHSL((k - 2) * 0.02, 0, 0)); headI.setColorAt(i * FPB + k, b.c5[k]); } });
  const flowerOff = []; { const r = rng(17); for (let k = 0; k < FPB; k++) flowerOff.push([Math.cos(k * 1.26 + r()) * (0.3 + r() * 0.4), Math.sin(k * 1.26 + r()) * (0.3 + r() * 0.4), 0.8 + r() * 0.4]); }
  const acornI = inst(acornGeo(), 6 + 12, { noShadow: true });
  const flying = [];   // glands qui sautent hors d'un tas de feuilles, puis tournent au-dessus du chien

  // --- coins de jeu : nénuphars, troncs couchés, carillons, Lapinou, Mélodie -------------------
  {
    const lilyMat = new THREE.MeshStandardMaterial({ color: 0x4ab040, roughness: 0.6 });
    for (const l of S.LILIES) {
      const sh = new THREE.Shape(); sh.absarc(0, 0, l.r, 0.35, Math.PI * 2 - 0.05, false); sh.lineTo(0, 0);
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: false }); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, lilyMat); m.position.set(l.x, l.top - 0.08, l.z); m.rotation.y = l.x * 3; m.receiveShadow = true;
      const ga = area(l.x, l.z, 4); ga.add(m);
      if (l.big) { const fl = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.mat(0xffb0d0, { emissive: 0x602040, emissiveIntensity: 0.3 })); fl.position.set(l.x + 0.8, l.top, l.z - 0.6); ga.add(fl); }
    }
    const bark = M.mat(0x7a5434, { roughness: 1 });
    for (const t of S.LOG_TUNNELS) {
      const g = new THREE.CylinderGeometry(t.r + 0.55, t.r + 0.55, t.len, 18, 1, true); g.rotateX(Math.PI / 2);
      const inner = new THREE.CylinderGeometry(t.r + 0.05, t.r + 0.05, t.len, 18, 1, true); inner.rotateX(Math.PI / 2);
      const ga = area(t.x, t.z, 6);
      const m = new THREE.Mesh(g, bark); m.position.set(t.x, t.y + t.r - 0.05, t.z); m.rotation.y = t.yaw; m.castShadow = m.receiveShadow = true; ga.add(m);
      const m2 = new THREE.Mesh(inner, M.mat(0x4a3020, { roughness: 1, side: THREE.BackSide })); m2.position.copy(m.position); m2.rotation.y = t.yaw; ga.add(m2);
      for (const sd of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(t.r + 0.05, t.r + 0.55, 18), M.mat(0xe0b878, { side: THREE.DoubleSide }));
        ring.position.set(t.x + t.dx * sd * t.len / 2, t.y + t.r - 0.05, t.z + t.dz * sd * t.len / 2); ring.rotation.y = t.yaw; ga.add(ring);
      }
      const moss = new THREE.Mesh(new THREE.SphereGeometry(t.r + 0.6, 12, 6, 0, Math.PI * 2, 0, 0.7), M.mat(0x5a9a3a, { roughness: 1 }));
      moss.position.set(t.x, t.y + 0.05, t.z); moss.scale.set(1, 0.9, t.len / 2 / (t.r + 0.6)); moss.rotation.y = t.yaw; ga.add(moss);
    }
  }
  const chimes = S.CHIMES.map((c) => {
    const g = area(c.x, c.z, 4);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 2.8, 8), M.mat(0x6a4426)); post.position.set(c.x, c.y + 1.4, c.z); g.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.1), post.material); arm.position.set(c.x + 0.45, c.y + 2.7, c.z); g.add(arm);
    const tubes = new THREE.Group(); tubes.position.set(c.x + 0.8, c.y + 2.65, c.z); tubes.userData.dyn = true;
    const tm = M.mat([0x8ad0ff, 0xffd040, 0xff8ab0, 0x9aff8a][S.CHIMES.indexOf(c)], { metalness: 0.6, roughness: 0.25, emissive: 0x202020 });
    for (let k = 0; k < 4; k++) { const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5 + k * 0.12, 6), tm); tb.position.set((k - 1.5) * 0.12, -0.3 - k * 0.06, 0); tubes.add(tb); }
    g.add(tubes);
    return { def: c, tubes, mat: tm, rang: -99 };
  });
  const lapinou = (() => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(rabbitGeo(), vmat(0.8)); body.scale.setScalar(1.7); g.add(body);
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 6, 14), M.mat(0xe03a3a)); scarf.rotation.x = Math.PI / 2; scarf.position.set(0, 0.62, 0.3); g.add(scarf);
    g.position.set(S.RACE.start.x, S.RACE.start.y, S.RACE.start.z); g.rotation.y = Math.PI;
    sc.add(g); g.traverse(o => { if (o.isMesh) o.castShadow = true; });
    return g;
  })();
  {
    const F = S.RACE.finish, g = area(F.x, F.z, 6);
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3, 8), M.mat(0xffffff)); p.position.set(F.x + sx * 2.4, F.y + 1.5, F.z); g.add(p); }
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#222' : '#fff'; x.fillRect(i * 16, j * 16, 16, 16); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 0.8), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide })); ban.position.set(F.x, F.y + 2.7, F.z); g.add(ban);
  }
  const melodie = (() => {
    const g = new THREE.Group();
    const perch = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 8), M.mat(0x6a4426)); perch.position.y = 0.8; g.add(perch);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 6), perch.material); bar.rotation.z = Math.PI / 2; bar.position.y = 1.6; g.add(bar);
    const b = new THREE.Mesh(birdGeo(), vmat(0.7)); b.scale.setScalar(2.4); b.position.y = 1.62; g.add(b);
    b.material = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0x6ab0ff, roughness: 0.6 });
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M.mat(0xffe040)); cap.position.set(0, 2.25, 0.2); g.add(cap);
    g.position.set(S.MELODIE.x, S.MELODIE.y, S.MELODIE.z); g.rotation.y = Math.atan2(S.GLADE.x - S.MELODIE.x, S.GLADE.z - S.MELODIE.z) + Math.PI;
    sc.add(g);
    g.userData.bird = b;
    return g;
  })();

  // =============================================================================
  // État
  // =============================================================================
  const f = () => {
    const F = forest();
    for (const [k, d] of [['acorns', []], ['chimes', []], ['race', false], ['melodie', false], ['pistache', false]]) if (F[k] === undefined) F[k] = Array.isArray(d) ? d.slice() : d;
    return F;
  };
  const race = { st: 'idle', t: 0, x: S.RACE.start.x, z: S.RACE.start.z, y: S.RACE.start.y, who: -1, hop: 0 };
  const lastBark = new Map();
  const acornsFound = () => f().acorns.length;
  function findAcorn(a, P) {
    const F = f();
    if (F.acorns.includes(a.id)) return;
    F.acorns.push(a.id); game.persist();
    snd.pick();
    flying.push({ x: a.x, y: S.heightAt(a.x, a.z) + 0.6, z: a.z, vy: 6, t: 0, P });
    const n = F.acorns.length;
    if (P === game.me) game.banner(n === 1 ? 'Un gland !' : 'Encore un gland !', F.pistache ? `${n} glands trouvés` : n >= S.ACORNS_NEEDED ? 'Pistache l\'écureuil va être content !' : `Glands pour Pistache : ${Math.min(n, S.ACORNS_NEEDED)}/${S.ACORNS_NEEDED}`, 1700);
    ctx.updateChips();
  }

  function onBark(P) {
    // les fleurs s'ouvrent, les oiseaux s'envolent, les carillons tintent
    for (const b of beds) if (Math.hypot(b.def.x - P.pos.x, b.def.z - P.pos.z) < 9) { if (b.until < game.t) game.burst(b.def.x, b.def.y + 0.6, b.def.z, 8, b.col, 2, 0.5); b.until = game.t + 25; }
    for (const s of shrubs) if (Math.hypot(s.def.x - P.pos.x, s.def.z - P.pos.z) < 4) shakeShrub(s, P);
    for (const c of chimes) if (Math.hypot(c.def.x - P.pos.x, c.def.z - P.pos.z) < 5) ringChime(c, P);
  }
  function shakeShrub(s, P) {
    if (game.t - s.cd < 1.2) return;
    s.cd = game.t; s.shake = game.t;
    snd.rustle();
    game.burst(s.def.x, s.def.y + 1, s.def.z, 10, 0x6ac84a, 2.5, 0.5);
    const a = S.ACORNS.find(o => o.ref === s.def.id);
    if (a && !f().acorns.includes(a.id)) findAcorn(a, P);
    else if (P.hearts < 3 && Math.random() < 0.25) game.spawnHeart(s.def.x, s.def.y + 1.2, s.def.z);
  }
  function scatterPile(p, P) {
    if (game.t - p.gone < 30) return;
    p.gone = game.t;
    snd.rustle();
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * 6.28, sp = 2 + Math.random() * 3;
      game.spawnParticle(p.def.x + Math.cos(a) * 0.5, p.def.y + 0.4, p.def.z + Math.sin(a) * 0.5, Math.cos(a) * sp, 3 + Math.random() * 3, Math.sin(a) * sp, [0xd8902a, 0xc0602a, 0xe0b030][i % 3], 0.22, 1.4, 8);
    }
    const a = S.ACORNS.find(o => o.ref === p.def.id);
    if (a) findAcorn(a, P);
  }
  function ringChime(c, P) {
    if (game.t - c.rang < 0.8) return;
    c.rang = game.t;
    const s = game.sfx;
    if (s && s.ok && s.note) { try { [0, 4, 7].forEach((k, i) => s.note('bell', c.def.note + k, 0.12, i * 0.09, 0.6)); } catch (err) { /* pas de son */ } }
    game.burst(c.def.x + 0.8, c.def.y + 2.4, c.def.z, 12, 0xfff0a0, 2.5, 0.6);
    const F = f();
    if (!F.chimes.includes(c.def.id)) {
      F.chimes.push(c.def.id); game.persist();
      if (P === game.me) game.banner(`Carillon ${F.chimes.length}/${S.CHIMES.length}`, F.chimes.length < S.CHIMES.length ? 'Mélodie la mésange écoute…' : 'Tous les carillons chantent !', 1800);
      if (F.chimes.length >= S.CHIMES.length && !F.melodie) {
        F.melodie = true; game.persist();
        setTimeout(() => {
          if (game.disposed) return;
          melodySong();
          game.say([
            { who: 'Mélodie la mésange', text: 'Cui-cui ! Les quatre carillons chantent de nouveau ! Écoutez comme le bosquet est joyeux !' },
            { who: 'Mélodie la mésange', text: 'Tenez, un gland doré pour vous. Je l\'avais trouvé dans mon nid !' },
          ], () => { const a = S.ACORNS.find(o => o.in === 'melodie'); if (a) findAcorn(a, game.me); });
        }, 900);
      }
    }
  }
  function melodySong() {
    const s = game.sfx;
    if (s && s.ok && s.note) { try { [72, 76, 79, 84, 79, 76, 81, 84].forEach((m, i) => s.note('bell', m, 0.14, i * 0.16, 0.5)); } catch (err) { /* pas de son */ } }
    for (const c of chimes) game.burst(c.def.x + 0.8, c.def.y + 2.4, c.def.z, 20, 0xfff0a0, 3, 0.8);
    game.burst(S.GLADE.x, S.GLADE.y + 2, S.GLADE.z, 50, 0xfff27a, 6, 1.2);
  }

  // --- la course contre Lapinou ----------------------------------------------------
  function talkLapinou(P) {
    if (race.st !== 'idle') return;
    met('lapinou');
    const F = f();
    game.say(F.race ? [
      { who: 'Lapinou', text: 'Tu veux ta revanche ? Ou plutôt… c\'est moi qui veux ma revanche ! On recommence ?' },
    ] : [
      { who: 'Lapinou', text: 'Salut ! Je suis Lapinou, le lapin le plus rapide de toute la forêt !' },
      { who: 'Lapinou', text: 'Une course jusqu\'au drapeau, là-bas, près de l\'autel ? Prêts ?' },
    ], () => {
      race.st = 'count'; race.t = 3; race.who = P.id; race.x = S.RACE.start.x; race.z = S.RACE.start.z;
      game.banner('3…', 'Cours jusqu\'au drapeau à damier !', 900);
    });
  }
  function stepRace(dt) {
    const F = S.RACE.finish;
    if (race.st === 'count') {
      const was = Math.ceil(race.t);
      race.t -= dt;
      if (Math.ceil(race.t) !== was && race.t > 0) game.banner(`${Math.ceil(race.t)}…`, '', 800);
      if (race.t <= 0) { race.st = 'run'; game.banner('Partez !', 'Plus vite que Lapinou !', 1200); game.sound('switch'); }
      return;
    }
    if (race.st === 'run') {
      const sp = game.easy ? S.RACE.easySpeed : S.RACE.speed;
      const dx = F.x - race.x, dz = F.z - race.z, d = Math.hypot(dx, dz);
      race.x += dx / d * Math.min(d, sp * dt); race.z += dz / d * Math.min(d, sp * dt);
      race.hop += dt * 9;
      const P = game.party.get(race.who) || game.me;
      const pd = Math.hypot(P.pos.x - F.x, P.pos.z - F.z);
      if (pd < 2.8) { race.st = 'won'; raceEnd(true, P); }
      else if (d < 0.5) { race.st = 'lost'; raceEnd(false, P); }
      if (Math.hypot(P.pos.x - race.x, P.pos.z - race.z) > 80) { race.st = 'idle'; race.x = S.RACE.start.x; race.z = S.RACE.start.z; }
    }
  }
  function raceEnd(won, P) {
    const Fd = f();
    if (won) {
      game.sound('reveal');
      game.burst(S.RACE.finish.x, S.RACE.finish.y + 2, S.RACE.finish.z, 40, 0xffe070, 5, 0.9);
      P.hearts = 3; game.updateHud();
      game.say([
        { who: 'Lapinou', text: 'Ouh là là ! Tu cours encore plus vite que moi !' },
        ...(Fd.race ? [] : [{ who: 'Lapinou', text: 'Bravo, champion ! Voilà un gland tout brillant, je l\'avais caché sous mon oreille.' }]),
      ], () => { if (!Fd.race) { Fd.race = true; game.persist(); const a = S.ACORNS.find(o => o.in === 'race'); if (a) findAcorn(a, P); } race.st = 'home'; });
    } else {
      game.say([{ who: 'Lapinou', text: 'Hi hi ! Gagné ! Mais tu étais tout près… On recommence quand tu veux !' }], () => { race.st = 'home'; });
    }
  }

  // =============================================================================
  const api = {
    candidates() {
      const out = [];
      if (race.st === 'idle') out.push({ kind: 'lv', act: 'lapinou', label: 'PARLER', x: race.x, z: race.z, y: race.y });
      out.push({ kind: 'lv', act: 'melodie', label: 'PARLER', x: S.MELODIE.x, z: S.MELODIE.z, y: S.MELODIE.y });
      return out;
    },
    interact(n, P) {
      if (n.act === 'lapinou') { talkLapinou(P); return true; }
      if (n.act === 'melodie') {
        met('melodie');
        const F = f(), left = S.CHIMES.length - F.chimes.length;
        snd.peep();
        game.say(F.melodie ? [{ who: 'Mélodie la mésange', text: 'Cui-cui ! Merci, les toutous. Écoutez… même les lucioles dansent !' }] : [
          { who: 'Mélodie la mésange', text: 'Cui-cui ! Je suis Mélodie. Les carillons du bosquet se sont tus, et la forêt est toute triste…' },
          { who: 'Mélodie la mésange', text: `Faites-les sonner ! Un coup de queue, ou un grand « Ouaf ! » tout près. Il en reste ${left} à faire chanter.` },
        ]);
        return true;
      }
      return false;
    },
    /** Pistache : il veut des glands (et il chasse les chats de ses cabanes). */
    pistacheLines() {
      const F = f(), n = acornsFound();
      if (F.pistache) return [{ who: 'Pistache l\'écureuil', text: 'Mes réserves sont pleines pour tout l\'hiver ! Merci, les copains !' }];
      if (n >= S.ACORNS_NEEDED) return [
        { who: 'Pistache l\'écureuil', text: `Waouh ! ${n} glands ! C'est assez pour tout l'hiver !` },
        { who: 'Pistache l\'écureuil', text: 'Pour vous remercier, je vous dis un secret : il y a un trésor sur le grand nénuphar de la mare, à l\'ouest de l\'autel !' },
      ];
      return [{ who: 'Pistache l\'écureuil', text: `Et si vous trouvez des glands (dans les tas de feuilles, les buissons, les troncs couchés…), rapportez-m'en ${S.ACORNS_NEEDED} ! J'en ai ${Math.min(n, S.ACORNS_NEEDED)} pour l'instant.` }];
    },
    pistacheDone() { const F = f(); if (!F.pistache && acornsFound() >= S.ACORNS_NEEDED) { F.pistache = true; game.persist(); game.sound('reveal'); game.banner('Pistache est ravi !', 'Ses réserves sont pleines pour l\'hiver', 2600); P0Hearts(); } },
    step(dt) {
      const PL = players();
      // aboiements
      for (const P of PL) {
        const b = P.barkT || 0, was = lastBark.get(P) || 0;
        if (b > was + 0.3) onBark(P);
        lastBark.set(P, b);
      }
      for (const P of PL) {
        const att = P.attackT > 0 || P.dashT > 0, sp = Math.hypot(P.vel.x, P.vel.z);
        for (const p of piles) {
          const d = Math.hypot(p.def.x - P.pos.x, p.def.z - P.pos.z);
          if (d < 2.4 && Math.abs(P.pos.y - p.def.y) < 1.5 && (att || (sp > 4 && d < 1.3) || !P.grounded && P.vel.y < -4 && d < 1.4)) scatterPile(p, P);
        }
        if (att) {
          for (const s of shrubs) if (Math.hypot(s.def.x - P.pos.x, s.def.z - P.pos.z) < 2.5) shakeShrub(s, P);
          for (const c of chimes) if (Math.hypot(c.def.x + 0.8 - P.pos.x, c.def.z - P.pos.z) < 2.6) ringChime(c, P);
        }
        // glands cachés dans les troncs couchés et sur le grand nénuphar
        for (const a of S.ACORNS) {
          if (a.in !== 'log' && a.in !== 'lily') continue;
          if (f().acorns.includes(a.id)) continue;
          if (Math.hypot(a.x - P.pos.x, a.z - P.pos.z) < (a.in === 'lily' ? 1.6 : 1.4) && Math.abs(P.pos.y - (a.in === 'lily' ? S.LILY_TREASURE.y : S.heightAt(a.x, a.z))) < 1.2) {
            findAcorn(a, P);
            if (a.in === 'lily' && P === game.me && !S.ACORNS.some(o => o.in === 'lily' && !f().acorns.includes(o.id))) { game.banner('Le trésor du grand nénuphar !', 'Trois glands d\'un coup !', 2400); game.sound('reveal'); }
          }
        }
      }
      stepRace(dt);
    },
    render(dt, t) {
      const cam = game.camera.position;
      // --- écureuils : ils filent vers un arbre et grimpent
      let nS = 0;
      squirrels.forEach((s) => {
        if (!camNear(s.hx, s.hz, cam)) return;
        const [P, d] = nearestP(s.x, s.z);
        if (s.st === 'idle') {
          s.y = S.heightAt(s.x, s.z);
          if (d < 6.5) { s.st = 'flee'; s.t = 0; snd.peep(); }
        } else if (s.st === 'flee') {
          s.t += dt;
          const T = s.tree;
          if (T) {
            const dx = T.x - s.x, dz = T.z - s.z, dd = Math.hypot(dx, dz);
            if (dd > 0.7) { s.x += dx / dd * Math.min(dd, 8 * dt); s.z += dz / dd * Math.min(dd, 8 * dt); s.yaw = Math.atan2(dx, dz); s.y = S.heightAt(s.x, s.z) + Math.abs(Math.sin(t * 20)) * 0.15; }
            else { s.y += 5 * dt; s.yaw = Math.atan2(-dx, -dz); if (s.y > T.y + T.h * 0.8) { s.st = 'gone'; s.t = 0; } }
          } else {
            const ax = s.x - P.pos.x, az = s.z - P.pos.z, l = Math.hypot(ax, az) || 1;
            s.x += ax / l * 8 * dt; s.z += az / l * 8 * dt; s.yaw = Math.atan2(ax, az); s.y = S.heightAt(s.x, s.z);
            if (s.t > 1.5) { s.st = 'gone'; s.t = 0; }
          }
        } else if (s.st === 'gone') {
          s.t += dt;
          if (s.t > 20 && d > 12) { s.st = 'idle'; s.x = s.hx; s.z = s.hz; s.y = S.heightAt(s.x, s.z); }
        }
        if (s.st === 'gone') return;
        const climbing = s.st === 'flee' && s.tree && Math.hypot(s.tree.x - s.x, s.tree.z - s.z) <= 0.7;
        const hop = s.st === 'idle' ? Math.max(0, Math.sin(t * 3 + s.ph)) * 0.12 : 0;
        m4.compose(v.set(s.x, s.y + hop, s.z), q.setFromEuler(e.set(climbing ? -1.4 : 0, s.yaw + (s.st === 'idle' ? Math.sin(t * 0.7 + s.ph) * 0.8 : 0), 0, 'YXZ')), sv.setScalar(1.6));
        sqI.setMatrixAt(nS++, m4);
      });
      sqI.count = nS; sqI.instanceMatrix.needsUpdate = true;
      // --- oiseaux : ils picorent, puis s'envolent quand on approche
      let j = 0, nB = 0;
      for (const fl of flocks) {
        const vis = camNear(fl.hx, fl.hz, cam);
        const [P, d] = vis ? nearestP(fl.hx, fl.hz) : [null, 99];
        if (fl.st === 'idle' && d < 6) { fl.st = 'fly'; fl.t = 0; snd.peep(); fl.ax = fl.hx - P.pos.x; fl.az = fl.hz - P.pos.z; const l = Math.hypot(fl.ax, fl.az) || 1; fl.ax /= l; fl.az /= l; }
        else if (fl.st === 'fly') { fl.t += dt; if (fl.t > 3.5) { fl.st = 'gone'; fl.t = 0; } }
        else if (fl.st === 'gone') { fl.t += dt; if (fl.t > 16 && d > 14) { fl.st = 'idle'; } }
        for (let k = 0; k < fl.n; k++, j++) {
          if (!vis || fl.st === 'gone') continue;
          const a = k * 2.1 + fl.ph, ox = Math.cos(a) * (0.6 + k * 0.25), oz = Math.sin(a) * (0.6 + k * 0.25);
          let x = fl.hx + ox, z = fl.hz + oz, y = S.heightAt(x, z), yaw = a + Math.sin(t * 0.8 + k) * 1.2, pitch = 0, flap = 0;
          if (fl.st === 'idle') { pitch = Math.max(0, Math.sin(t * 5 + k * 1.3 + fl.ph)) * 0.6; y += Math.max(0, Math.sin(t * 2.3 + k * 2 + fl.ph) - 0.85) * 1.2; }
          else { const tt = fl.t; x += fl.ax * tt * (6 + k); z += fl.az * tt * (6 + k); y += tt * (3 + k * 0.7) + tt * tt * 0.6; yaw = Math.atan2(fl.ax, fl.az); flap = Math.sin(t * 30 + k) * 0.9; pitch = -0.3; }
          m4.compose(v.set(x, y, z), q.setFromEuler(e.set(pitch, yaw, 0, 'YXZ')), sv.setScalar(1.7)); birdI.setMatrixAt(nB, m4); birdI.setColorAt(nB, fl.c3[k]); wingI.setColorAt(nB, fl.c3w[k]);
          m4.compose(v.set(x, y + 0.18 * 1.7, z), q.setFromEuler(e.set(0, yaw, 0, 'YXZ')), sv.set(1.7, 1.7, 1.7));
          if (flap) { const qq = new THREE.Quaternion().setFromEuler(e.set(0, yaw, 0, 'YXZ')); m4.compose(v, qq, sv.set(1.7 * (0.4 + Math.abs(Math.cos(t * 30 + k))), 1.7, 1.7)); }
          wingI.setMatrixAt(nB++, m4);
        }
      }
      birdI.count = wingI.count = nB;
      birdI.instanceMatrix.needsUpdate = wingI.instanceMatrix.needsUpdate = true;
      if (birdI.instanceColor) birdI.instanceColor.needsUpdate = wingI.instanceColor.needsUpdate = true;
      // --- lapins : ils sautillent, puis filent dans leur terrier
      let nR = 0;
      rabbits.forEach((r) => {
        if (!camNear(r.hx, r.hz, cam)) return;
        const [P, d] = nearestP(r.x, r.z);
        r.t += dt;
        if (r.st === 'idle') {
          if (d < 7) { r.st = 'flee'; r.t = 0; const ax = r.x - P.pos.x, az = r.z - P.pos.z, l = Math.hypot(ax, az) || 1; r.ax = ax / l; r.az = az / l; }
          else if (!r.tx || Math.hypot(r.tx - r.x, r.tz - r.z) < 0.2) { const a = Math.random() * 6.28; r.tx = r.hx + Math.cos(a) * 2; r.tz = r.hz + Math.sin(a) * 2; r.wait = 1 + Math.random() * 2; }
          else if ((r.wait -= dt) < 0) { const dx = r.tx - r.x, dz = r.tz - r.z, l = Math.hypot(dx, dz); r.x += dx / l * Math.min(l, 1.6 * dt); r.z += dz / l * Math.min(l, 1.6 * dt); r.yaw = lerpAngle(r.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8)); r.hop += dt * 10; }
        } else if (r.st === 'flee') {
          r.x += r.ax * 8.5 * dt; r.z += r.az * 8.5 * dt; r.yaw = Math.atan2(r.ax, r.az); r.hop = (r.hop || 0) + dt * 14;
          if (r.t > 1.3) { r.st = 'gone'; r.t = 0; game.burst(r.x, S.heightAt(r.x, r.z) + 0.2, r.z, 6, 0xa08060, 2, 0.4); }
        } else if (r.st === 'gone' && r.t > 15 && d > 12) { r.st = 'idle'; r.x = r.hx; r.z = r.hz; r.tx = null; }
        if (r.st === 'gone') return;
        const hop = Math.abs(Math.sin(r.hop || 0)) * (r.st === 'flee' ? 0.5 : 0.18);
        m4.compose(v.set(r.x, S.heightAt(r.x, r.z) + hop, r.z), q.setFromEuler(e.set(0, r.yaw, 0)), sv.setScalar(1.45));
        rabI.setColorAt(nR, r.c3); rabI.setMatrixAt(nR++, m4);
      });
      rabI.count = nR; rabI.instanceMatrix.needsUpdate = true; if (rabI.instanceColor) rabI.instanceColor.needsUpdate = true;
      // --- hérissons : ils trottinent, et se roulent en boule quand le chien est tout près
      let nH = 0;
      hogs.forEach((h) => {
        if (!camNear(h.hx, h.hz, cam)) return;
        const [P, d] = nearestP(h.x, h.z);
        h.t += dt;
        if (h.st === 'idle') {
          if (d < 3.5) { h.st = 'ball'; h.t = 0; snd.peep(); }
          else { h.yaw += Math.sin(t * 0.3 + h.ph) * dt * 0.8; const nx = h.x + Math.sin(h.yaw) * 0.5 * dt, nz = h.z + Math.cos(h.yaw) * 0.5 * dt; if (Math.hypot(nx - h.hx, nz - h.hz) < 3) { h.x = nx; h.z = nz; } else h.yaw += Math.PI * dt; }
        } else if (h.st === 'ball') {
          if ((P.attackT > 0 || P.dashT > 0) && d < 2.2 && !h.roll) { const ax = h.x - P.pos.x, az = h.z - P.pos.z, l = Math.hypot(ax, az) || 1; h.roll = { x: ax / l, z: az / l, t: 0 }; game.sound('boing'); }
          if (h.roll) { h.roll.t += dt; const k = Math.max(0, 1 - h.roll.t / 1.2); h.x += h.roll.x * 6 * k * dt; h.z += h.roll.z * 6 * k * dt; if (h.roll.t > 1.2) h.roll = null; }
          if (h.t > 4 && d > 4) { h.st = 'idle'; h.roll = null; }
        }
        const ball = h.st === 'ball', spin = ball && h.roll ? h.roll.t * 14 : 0;
        m4.compose(v.set(h.x, S.heightAt(h.x, h.z) + (ball ? 0.08 : 0), h.z), q.setFromEuler(e.set(ball ? 1.3 + spin : Math.sin(t * 8 + h.ph) * 0.04, h.yaw, 0, 'YXZ')), sv.set(1.5, ball ? 1.25 : 1.5, ball ? 1.2 : 1.5));
        hogI.setMatrixAt(nH++, m4);
      });
      hogI.count = nH; hogI.instanceMatrix.needsUpdate = true;
      // --- grenouilles : plouf dans l'eau quand on approche
      let nF = 0;
      frogs.forEach((g) => {
        if (!camNear(g.hx, g.hz, cam)) return;
        const [, d] = nearestP(g.hx, g.hz);
        g.t += dt;
        if (g.st === 'idle' && d < 4.5) { g.st = 'jump'; g.t = 0; }
        else if (g.st === 'jump' && g.t > 0.6) { g.st = 'gone'; g.t = 0; snd.plop(); game.burst(g.def.wx, 0.1, g.def.wz, 10, 0x9ae0ff, 2.5, 0.4); }
        else if (g.st === 'gone' && g.t > 12 && d > 8) g.st = 'idle';
        if (g.st === 'gone') return;
        let x = g.def.x, z = g.def.z, y = g.def.y, yaw = Math.atan2(g.def.wx - g.def.x, g.def.wz - g.def.z);
        if (g.st === 'jump') { const k = g.t / 0.6; x += (g.def.wx - x) * k; z += (g.def.wz - z) * k; y = y * (1 - k) + Math.sin(k * Math.PI) * 1.4; }
        else y += Math.max(0, Math.sin(t * 1.3 + g.ph) - 0.9) * 2;
        const throat = g.st === 'idle' ? 1 + Math.max(0, Math.sin(t * 4 + g.ph)) * 0.08 : 1;
        m4.compose(v.set(x, y, z), q.setFromEuler(e.set(g.st === 'jump' ? -0.5 : 0, yaw, 0)), sv.set(1.8 * throat, 1.8, 1.8));
        frogI.setMatrixAt(nF++, m4);
      });
      frogI.count = nF; frogI.instanceMatrix.needsUpdate = true;
      // --- tas de feuilles, buissons, fleurs
      let nP = 0;
      piles.forEach((p, i) => {
        if (!camNear(p.def.x, p.def.z, cam) || game.t - p.gone < 25) return;
        const since = game.t - p.gone, k = since < 30 ? Math.max(0.001, (since - 25) / 5) : 1;
        m4.compose(v.set(p.def.x, p.def.y - 0.05, p.def.z), q.setFromEuler(e.set(0, i * 1.3, 0)), sv.set(k, k, k)); pileI.setMatrixAt(nP++, m4);
      });
      pileI.count = nP; pileI.instanceMatrix.needsUpdate = true;
      let nU = 0;
      shrubs.forEach((s, i) => {
        if (!camNear(s.def.x, s.def.z, cam)) return;
        const since = game.t - s.shake, w = since < 0.7 ? Math.sin(since * 40) * 0.15 * (1 - since / 0.7) : 0;
        m4.compose(v.set(s.def.x, s.def.y - 0.05, s.def.z), q.setFromEuler(e.set(w, i * 1.1, w * 0.7)), sv.set(1.2, 1.1 + Math.abs(w), 1.2)); shrubI.setMatrixAt(nU++, m4);
      });
      shrubI.count = nU; shrubI.instanceMatrix.needsUpdate = true;
      let nW = 0;
      beds.forEach((b, i) => {
        const vis = camNear(b.def.x, b.def.z, cam);
        b.open += ((b.until > game.t ? 1 : 0) - b.open) * Math.min(1, dt * 3);
        for (let k = 0; k < FPB; k++) {
          const n = i * FPB + k;
          if (!vis) continue;
          const [ox, oz, hs] = flowerOff[k], x = b.def.x + ox, z = b.def.z + oz, y = b.def.y;
          const sway = Math.sin(t * 1.5 + n) * 0.08;
          m4.compose(v.set(x, y, z), q.setFromEuler(e.set(sway, 0, sway * 0.5)), sv.set(1, hs, 1)); stemI.setMatrixAt(nW, m4);
          const o = b.open, s2 = 0.35 + o * 0.9;
          m4.compose(v.set(x + sway * 0.4, y + 0.5 * hs, z), q.setFromEuler(e.set(sway, t * o * 0.5 + n, 0)), sv.set(s2, 0.6 + o * 0.5 + (1 - o) * 0.8, s2)); headI.setColorAt(nW, b.c5[k]); headI.setMatrixAt(nW++, m4);
        }
      });
      stemI.count = headI.count = nW;
      stemI.instanceMatrix.needsUpdate = headI.instanceMatrix.needsUpdate = true; if (headI.instanceColor) headI.instanceColor.needsUpdate = true;
      headMat.emissiveIntensity = 0.12;
      // --- glands : dans les troncs, sur le nénuphar, et ceux qu'on vient de trouver
      let a = 0;
      for (const ac of S.ACORNS) {
        if ((ac.in !== 'log' && ac.in !== 'lily') || f().acorns.includes(ac.id) || a >= 6) continue;
        const y = ac.in === 'lily' ? S.LILY_TREASURE.y + 0.25 : S.heightAt(ac.x, ac.z) + 0.25;
        m4.compose(v.set(ac.x + (ac.in === 'lily' ? (a % 3 - 1) * 0.3 : 0), y + Math.sin(t * 3 + a) * 0.05, ac.z), q.setFromEuler(e.set(0, t * 1.5 + a, 0.2)), sv.setScalar(1.6)); acornI.setMatrixAt(a++, m4);
      }
      for (let k = flying.length - 1; k >= 0; k--) {
        const fl = flying[k]; fl.t += dt;
        if (fl.t < 0.9) { fl.y += fl.vy * dt; fl.vy -= 12 * dt; }
        else { const P = fl.P || game.me; fl.x += (P.pos.x - fl.x) * Math.min(1, dt * 6); fl.z += (P.pos.z - fl.z) * Math.min(1, dt * 6); fl.y += (P.pos.y + 1.6 - fl.y) * Math.min(1, dt * 6); }
        if (fl.t > 1.6) { flying.splice(k, 1); continue; }
        if (a < 18) { m4.compose(v.set(fl.x, fl.y, fl.z), q.setFromEuler(e.set(0, fl.t * 10, 0)), sv.setScalar(1.8)); acornI.setMatrixAt(a++, m4); }
      }
      acornI.count = a;
      acornI.instanceMatrix.needsUpdate = true;
      // --- carillons, Lapinou, Mélodie
      for (const c of chimes) { const since = t - c.rang; c.tubes.rotation.z = since < 2 ? Math.sin(since * 14) * 0.35 * (1 - since / 2) : Math.sin(t * 1.2 + c.def.x) * 0.04; c.mat.emissiveIntensity = since < 1.5 ? 1.2 * (1 - since / 1.5) : 0.1; }
      {
        const rr = race, home = rr.st === 'home';
        if (home) { rr.x += (S.RACE.start.x - rr.x) * Math.min(1, dt * 1.5); rr.z += (S.RACE.start.z - rr.z) * Math.min(1, dt * 1.5); if (Math.hypot(S.RACE.start.x - rr.x, S.RACE.start.z - rr.z) < 0.3) rr.st = 'idle'; }
        const moving = rr.st === 'run' || home;
        lapinou.position.set(rr.x, S.heightAt(rr.x, rr.z) + (moving ? Math.abs(Math.sin(t * 14)) * 0.5 : Math.max(0, Math.sin(t * 2.5)) * 0.15), rr.z);
        lapinou.rotation.y = rr.st === 'run' ? Math.atan2(S.RACE.finish.x - rr.x, S.RACE.finish.z - rr.z) : home ? Math.atan2(S.RACE.start.x - rr.x, S.RACE.start.z - rr.z) : Math.PI + Math.sin(t * 0.8) * 0.6;
        lapinou.visible = camNear(rr.x, rr.z, cam);
      }
      melodie.userData.bird.rotation.x = Math.max(0, Math.sin(t * 2.2)) * 0.25;
      melodie.userData.bird.position.y = 1.62 + (f().melodie ? Math.abs(Math.sin(t * 6)) * 0.12 : 0);
      melodie.visible = camNear(S.MELODIE.x, S.MELODIE.z, cam);
    },
    marks() {
      const out = [], F = f();
      if (!F.race) out.push([S.RACE.start.x, S.RACE.start.z, '#ffffff', 2.6]);
      if (!F.melodie) out.push([S.MELODIE.x, S.MELODIE.z, '#6ab0ff', 2.6]);
      return out;
    },
    snapshot() { return [race.st, Math.round(race.x * 100) / 100, Math.round(race.z * 100) / 100]; },
    apply(x) { if (!x) return; race.st = x[0]; race.x = x[1]; race.z = x[2]; },
    acorns: acornsFound,
    race,
  };
  function P0Hearts() { for (const P of players()) P.hearts = 3; game.updateHud(); }
  return api;
}
