/*
 * Dogfight Aventure — modèles 3D construits à partir de formes simples,
 * en ombrage « cartoon » (toon) avec contours inversés pour les personnages.
 */
import * as THREE from '../vendor/three.module.min.js';

// Rampe d'ombrage à 3 paliers (rendu cel-shading)
const gradient = (() => {
  const data = new Uint8Array([90, 170, 255]);
  const t = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
})();

const matCache = new Map();
export function toon(color, opts) {
  opts = Object.assign({}, opts || {});
  delete opts.flatShading; // les facettes viennent de la géométrie (voir flat())
  const key = color + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial(Object.assign({ color, gradientMap: gradient }, opts));
  matCache.set(key, m);
  return m;
}
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x1a0c10, side: THREE.BackSide });

function mesh(geo, color, opts) {
  const m = new THREE.Mesh(geo, typeof color === 'object' ? color : toon(color));
  if (opts && opts.outline) {
    const o = new THREE.Mesh(geo, OUTLINE);
    o.scale.setScalar(1 + opts.outline);
    m.add(o);
  }
  return m;
}

const S = (r, w, h) => new THREE.SphereGeometry(r, w || 12, h || 10);

/** Géométrie à facettes plates (look low-poly). */
export function flat(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

// ---------------------------------------------------------------------------
// Le duo : Ainu (eurasier roux) avec Matcha (pinscher) sur le dos
// Repère : avant = +z, pattes au sol en y = 0
// ---------------------------------------------------------------------------
export function buildDuo() {
  const root = new THREE.Group();
  const ainu = new THREE.Group();
  root.add(ainu);
  const OR = 0xd0662a, CR = 0xf5dcb4, DK = 0x2a1810;

  const body = at(mesh(S(0.55, 14, 12), OR, { outline: 0.06 }), 0, 0.88, 0);
  body.scale.set(0.95, 0.85, 1.35);
  ainu.add(body);
  const belly = at(mesh(S(0.45), CR), 0, 0.72, 0.1); belly.scale.set(0.8, 0.6, 1.3); ainu.add(belly);
  // Collerette touffue
  const ruff = at(mesh(S(0.52, 12, 10), OR, { outline: 0.05 }), 0, 1.1, 0.5); ainu.add(ruff);
  const chest = at(mesh(S(0.36), CR), 0, 0.95, 0.78); ainu.add(chest);
  // Bandana bleu
  const band = at(mesh(new THREE.ConeGeometry(0.32, 0.4, 3), 0x2d66d0), 0, 1.08, 0.9);
  band.rotation.x = Math.PI; band.rotation.y = Math.PI; ainu.add(band);

  // Tête
  const head = new THREE.Group(); at(head, 0, 1.45, 0.82); ainu.add(head);
  head.add(mesh(S(0.42, 14, 12), OR, { outline: 0.06 }));
  const cheeks = at(mesh(S(0.3), CR), 0, -0.12, 0.2); cheeks.scale.set(1.15, 0.8, 0.9); head.add(cheeks);
  const muzzle = at(mesh(S(0.2), CR, { outline: 0.08 }), 0, -0.1, 0.42); muzzle.scale.set(0.95, 0.8, 1.25); head.add(muzzle);
  head.add(at(mesh(S(0.075, 8, 6), DK), 0, -0.04, 0.66));
  for (const sx of [-1, 1]) {
    head.add(at(mesh(S(0.065, 8, 6), DK), sx * 0.17, 0.1, 0.34));
    head.add(at(mesh(S(0.022, 6, 4), 0xffffff), sx * 0.17 + 0.02, 0.13, 0.39));
    const ear = at(mesh(new THREE.ConeGeometry(0.15, 0.32, 4), OR, { outline: 0.08 }), sx * 0.24, 0.38, -0.02);
    ear.rotation.z = -sx * 0.35; head.add(ear);
    const inner = at(mesh(new THREE.ConeGeometry(0.08, 0.2, 4), 0xe8987a), sx * 0.24, 0.36, 0.06);
    inner.rotation.z = -sx * 0.35; head.add(inner);
  }
  const tongue = at(mesh(S(0.07, 8, 6), 0xf06a80), 0, -0.24, 0.52); tongue.scale.set(1, 0.5, 1.2); head.add(tongue);

  // Queue en tire-bouchon (pivot à la base, sert d'hélice pour planer)
  const tail = new THREE.Group(); at(tail, 0, 1.15, -0.72); ainu.add(tail);
  const tailMesh = at(mesh(new THREE.TorusGeometry(0.3, 0.15, 8, 14, Math.PI * 1.6), OR, { outline: 0.1 }), 0, 0.3, 0);
  tailMesh.rotation.y = Math.PI / 2; tailMesh.rotation.z = -0.4;
  tail.add(tailMesh);
  tail.add(at(mesh(S(0.16), CR), 0, 0.58, 0.18));

  // Pattes (pivot à la hanche)
  const legs = [];
  for (const [lx, lz] of [[-0.3, 0.48], [0.3, 0.48], [-0.3, -0.42], [0.3, -0.42]]) {
    const g = at(new THREE.Group(), lx, 0.62, lz);
    g.add(at(mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.55, 8), OR, { outline: 0.08 }), 0, -0.28, 0));
    g.add(at(mesh(S(0.15, 8, 6), CR), 0, -0.55, 0.05));
    ainu.add(g);
    legs.push(g);
  }

  // Matcha, perché sur le dos
  const matcha = new THREE.Group(); at(matcha, 0, 1.38, -0.08); ainu.add(matcha);
  const BK = 0x1c1720, TAN = 0xc26a2c;
  const mb = at(mesh(S(0.3, 12, 10), BK, { outline: 0.07 }), 0, 0.12, 0); mb.scale.set(0.85, 0.75, 1.25); matcha.add(mb);
  const mchest = at(mesh(S(0.16), TAN), 0, 0.12, 0.3); matcha.add(mchest);
  const mhead = new THREE.Group(); at(mhead, 0, 0.55, 0.32); matcha.add(mhead);
  const neck = at(mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.4, 8), BK), 0, -0.2, -0.06); neck.rotation.x = 0.4; mhead.add(neck);
  mhead.add(mesh(S(0.2, 12, 10), BK, { outline: 0.07 }));
  const mmuz = at(mesh(new THREE.CylinderGeometry(0.07, 0.11, 0.3, 8), TAN, { outline: 0.08 }), 0, -0.05, 0.24);
  mmuz.rotation.x = Math.PI / 2; mhead.add(mmuz);
  mhead.add(at(mesh(S(0.05, 8, 6), 0x0a0808), 0, -0.04, 0.4));
  for (const sx of [-1, 1]) {
    mhead.add(at(mesh(S(0.045, 8, 6), 0xe8962e), sx * 0.11, 0.06, 0.14));
    mhead.add(at(mesh(S(0.04, 6, 4), TAN), sx * 0.1, 0.15, 0.12));
    const ear = at(mesh(new THREE.ConeGeometry(0.08, 0.36, 4), BK, { outline: 0.1 }), sx * 0.11, 0.3, -0.02);
    ear.rotation.z = -sx * 0.18; mhead.add(ear);
  }
  const collar = at(mesh(new THREE.TorusGeometry(0.14, 0.04, 6, 12), 0x8bc34a), 0, 0.33, 0.24);
  collar.rotation.x = Math.PI / 2 - 0.4; matcha.add(collar);
  const mtail = at(mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.4, 6), BK), 0, 0.35, -0.38); mtail.rotation.x = -0.5; matcha.add(mtail);
  const mlegs = [];
  for (const sx of [-1, 1]) for (const lz of [0.2, -0.2]) {
    const g = at(new THREE.Group(), sx * 0.2, 0.05, lz);
    g.add(at(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 6), BK), 0, -0.15, 0));
    g.add(at(mesh(S(0.06, 6, 4), TAN), 0, -0.3, 0.02));
    g.rotation.z = sx * 0.5;
    matcha.add(g);
    mlegs.push(g);
  }

  root.userData = { ainu, head, tail, legs, matcha, mhead, mlegs, body };
  return root;
}

// ---------------------------------------------------------------------------
// Chat bandit (masque noir, queue rayée)
// ---------------------------------------------------------------------------
export function buildCat() {
  const g = new THREE.Group();
  const GR = 0x8a8a9a, DK = 0x2a2a34, ST = 0x5a5a6a;
  const body = at(mesh(S(0.42, 12, 10), GR, { outline: 0.06 }), 0, 0.55, 0); body.scale.set(0.8, 0.8, 1.25); g.add(body);
  const head = new THREE.Group(); at(head, 0, 1.0, 0.45); g.add(head);
  head.add(mesh(S(0.34, 12, 10), GR, { outline: 0.06 }));
  const mask = at(mesh(new THREE.BoxGeometry(0.62, 0.14, 0.2), DK), 0, 0.05, 0.22); head.add(mask);
  for (const sx of [-1, 1]) {
    head.add(at(mesh(S(0.06, 8, 6), 0xffe040), sx * 0.13, 0.06, 0.3));
    head.add(at(mesh(S(0.03, 6, 4), 0x000000), sx * 0.13, 0.06, 0.35));
    const ear = at(mesh(new THREE.ConeGeometry(0.12, 0.26, 3), GR, { outline: 0.1 }), sx * 0.2, 0.32, 0); ear.rotation.z = -sx * 0.25; head.add(ear);
  }
  head.add(at(mesh(S(0.05, 6, 4), 0xff8aa0), 0, -0.06, 0.33));
  const tail = new THREE.Group(); at(tail, 0, 0.7, -0.5); g.add(tail);
  for (let i = 0; i < 4; i++) {
    tail.add(at(mesh(S(0.09, 8, 6), i % 2 ? DK : ST), 0, i * 0.14, -i * 0.06));
  }
  const legs = [];
  for (const [lx, lz] of [[-0.2, 0.3], [0.2, 0.3], [-0.2, -0.3], [0.2, -0.3]]) {
    const l = at(new THREE.Group(), lx, 0.4, lz);
    l.add(at(mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.4, 6), GR), 0, -0.2, 0));
    g.add(l); legs.push(l);
  }
  g.userData = { head, tail, legs };
  return g;
}

// ---------------------------------------------------------------------------
// Mamie Labrador (assise, foulard rouge et lunettes) et Biscotte le chiot
// ---------------------------------------------------------------------------
export function buildMamie() {
  const g = new THREE.Group();
  const Y = 0xe8c070, LT = 0xf6e0b0;
  const body = at(mesh(S(0.6, 14, 12), Y, { outline: 0.05 }), 0, 0.85, 0); body.scale.set(0.9, 1.15, 0.9); g.add(body);
  g.add(at(mesh(S(0.4), LT), 0, 0.85, 0.3));
  const head = new THREE.Group(); at(head, 0, 1.75, 0.2); g.add(head);
  head.add(mesh(S(0.42, 14, 12), Y, { outline: 0.05 }));
  const muz = at(mesh(S(0.24), LT, { outline: 0.06 }), 0, -0.12, 0.36); muz.scale.set(1, 0.8, 1.1); head.add(muz);
  head.add(at(mesh(S(0.08, 8, 6), 0x3a2010), 0, -0.05, 0.6));
  for (const sx of [-1, 1]) {
    head.add(at(mesh(S(0.06, 8, 6), 0x2a1408), sx * 0.15, 0.1, 0.34));
    const glass = at(mesh(new THREE.TorusGeometry(0.1, 0.02, 6, 12), 0x6a4a2a), sx * 0.15, 0.1, 0.38); head.add(glass);
    const ear = at(mesh(S(0.18, 10, 8), 0xd0a050, { outline: 0.06 }), sx * 0.4, -0.05, -0.02); ear.scale.set(0.5, 1.2, 0.8); head.add(ear);
  }
  const scarf = at(mesh(new THREE.TorusGeometry(0.36, 0.1, 8, 14), 0xd03434), 0, 1.38, 0.1); scarf.rotation.x = Math.PI / 2; g.add(scarf);
  for (const sx of [-1, 1]) {
    g.add(at(mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.6, 8), Y), sx * 0.25, 0.3, 0.35));
    const hind = at(mesh(S(0.28), Y), sx * 0.42, 0.3, -0.15); hind.scale.set(0.8, 0.9, 1.3); g.add(hind);
  }
  const tail = new THREE.Group(); at(tail, 0, 0.35, -0.55); g.add(tail);
  const t = at(mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.6, 6), Y), 0, 0, -0.25); t.rotation.x = Math.PI / 2.2; tail.add(t);
  g.userData = { head, tail };
  return g;
}

export function buildPuppy() {
  const g = new THREE.Group();
  const C = 0xf2dcb8, B = 0xb88a5a;
  const body = at(mesh(S(0.3, 12, 10), C, { outline: 0.07 }), 0, 0.42, 0); body.scale.set(0.9, 0.85, 1.2); g.add(body);
  const head = new THREE.Group(); at(head, 0, 0.82, 0.25); g.add(head);
  head.add(mesh(S(0.28, 12, 10), C, { outline: 0.07 }));
  head.add(at(mesh(S(0.12), 0xfff4e4), 0, -0.08, 0.22));
  head.add(at(mesh(S(0.05, 6, 4), 0x2a1408), 0, -0.04, 0.34));
  for (const sx of [-1, 1]) {
    head.add(at(mesh(S(0.05, 8, 6), 0x2a1408), sx * 0.11, 0.06, 0.22));
    const ear = at(mesh(S(0.12, 8, 6), B, { outline: 0.08 }), sx * 0.24, 0.05, -0.02); ear.scale.set(0.5, 1.2, 0.8); head.add(ear);
  }
  const tail = new THREE.Group(); at(tail, 0, 0.5, -0.32); g.add(tail);
  tail.add(at(mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.3, 6), C), 0, 0.12, -0.05));
  const legs = [];
  for (const [lx, lz] of [[-0.15, 0.18], [0.15, 0.18], [-0.15, -0.18], [0.15, -0.18]]) {
    const l = at(new THREE.Group(), lx, 0.3, lz);
    l.add(at(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 6), C), 0, -0.15, 0));
    g.add(l); legs.push(l);
  }
  g.userData = { head, tail, legs };
  return g;
}

// ---------------------------------------------------------------------------
// Objets
// ---------------------------------------------------------------------------
/** Fusionne des géométries (non indexées) en une seule (pour l'instanciation). */
export function mergeGeos(list) {
  const geos = list.map(({ geo, x, y, z, rx, ry, rz, sx, sy, sz }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x || 0, y || 0, z || 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)),
      new THREE.Vector3(sx || 1, sy || sx || 1, sz || sx || 1));
    g.applyMatrix4(m);
    return g;
  });
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}

export function boneGeometry() {
  return mergeGeos([
    { geo: new THREE.CylinderGeometry(0.09, 0.09, 0.7, 8), rz: Math.PI / 2 },
    { geo: S(0.13, 8, 6), x: -0.36, y: 0.08 }, { geo: S(0.13, 8, 6), x: -0.36, y: -0.08 },
    { geo: S(0.13, 8, 6), x: 0.36, y: 0.08 }, { geo: S(0.13, 8, 6), x: 0.36, y: -0.08 },
  ]);
}

export function buildMedal() {
  const g = new THREE.Group();
  const coin = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.14, 20), toon(0xf2c230, { emissive: 0x6a4a00 }), { outline: 0.06 });
  coin.rotation.x = Math.PI / 2;
  g.add(coin);
  // Empreinte de patte sur les deux faces
  for (const side of [-1, 1]) {
    const paw = toon(0x8a5a10);
    const add = (x, y, r) => { const p = at(mesh(new THREE.CylinderGeometry(r, r, 0.04, 10), paw), x, y, side * 0.08); p.rotation.x = Math.PI / 2; g.add(p); };
    add(0, -0.1, 0.2);
    add(-0.22, 0.14, 0.08); add(-0.08, 0.26, 0.08); add(0.08, 0.26, 0.08); add(0.22, 0.14, 0.08);
  }
  // Halo lumineux
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(3, 3, 1);
  g.add(glow);
  return g;
}

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

export function buildBall() {
  const g = new THREE.Group();
  g.add(mesh(S(0.32, 14, 12), 0xd8f040, { outline: 0.06 }));
  const seam = mesh(new THREE.TorusGeometry(0.32, 0.03, 6, 20), 0xffffff); seam.rotation.x = 1.1; g.add(seam);
  return g;
}

export function buildHeart() {
  const g = new THREE.Group();
  const m = toon(0xe8303a, { emissive: 0x400008 });
  g.add(at(mesh(S(0.22, 10, 8), m), -0.15, 0.08, 0));
  g.add(at(mesh(S(0.22, 10, 8), m), 0.15, 0.08, 0));
  const c = at(mesh(new THREE.ConeGeometry(0.31, 0.42, 12), m), 0, -0.2, 0); c.rotation.z = Math.PI; g.add(c);
  return g;
}

/** Texture pixel de bois pour les caisses. */
function crateTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const x = c.getContext('2d');
  x.fillStyle = '#b07a3a'; x.fillRect(0, 0, 16, 16);
  x.fillStyle = '#8a5a26';
  for (let i = 0; i < 16; i += 5) x.fillRect(0, i, 16, 1);
  x.fillStyle = '#5a3612'; x.fillRect(0, 0, 16, 2); x.fillRect(0, 14, 16, 2); x.fillRect(0, 0, 2, 16); x.fillRect(14, 0, 2, 16);
  x.fillStyle = '#d09a52'; x.fillRect(2, 2, 12, 1);
  x.fillStyle = '#5a3612';
  for (let i = 2; i < 14; i++) x.fillRect(i, i, 1, 1), x.fillRect(15 - i, i, 1, 1);
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let crateMat = null;
export function buildCrate() {
  if (!crateMat) crateMat = new THREE.MeshToonMaterial({ map: crateTexture(), gradientMap: gradient });
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), crateMat);
  const o = new THREE.Mesh(m.geometry, OUTLINE); o.scale.setScalar(1.05); m.add(o);
  return m;
}

export function buildSign(text) {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.6, 6), 0x7a4a24), 0, 0.8, 0));
  const board = at(mesh(new THREE.BoxGeometry(1.4, 0.8, 0.12), 0xb88450, { outline: 0.05 }), 0, 1.5, 0);
  g.add(board);
  g.add(at(mesh(new THREE.BoxGeometry(1.0, 0.08, 0.02), 0x5a3418), 0, 1.6, 0.07));
  g.add(at(mesh(new THREE.BoxGeometry(0.8, 0.08, 0.02), 0x5a3418), 0, 1.42, 0.07));
  g.userData.text = text;
  return g;
}

export function buildPedestal() {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.6, 8), 0xc8c0b0, { outline: 0.04 }), 0, 0.3, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.0, 8), 0xe0d8c8, { outline: 0.04 }), 0, 1.0, 0));
  // 5 encoches pour les balles
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(at(mesh(S(0.14, 8, 6), 0x6a6458), Math.cos(a) * 0.95, 0.62, Math.sin(a) * 0.95));
  }
  return g;
}

export { gradient };
