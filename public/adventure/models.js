/*
 * Dogfight Aventure — modèles 3D (formes lisses, matériaux PBR, ombres).
 */
import * as THREE from '../vendor/three.module.min.js';

const matCache = new Map();
/** Matériau standard mis en cache. opts : roughness, metalness, emissive… */
export function mat(color, opts) {
  opts = Object.assign({ roughness: 0.75, metalness: 0 }, opts || {});
  const key = color + JSON.stringify(opts);
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial(Object.assign({ color }, opts));
  matCache.set(key, m);
  return m;
}
// Compatibilité avec l'ancien nom
export const toon = mat;

function mesh(geo, color, opts) {
  const m = new THREE.Mesh(geo, typeof color === 'object' ? color : mat(color, opts));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
const S = (r, w, h) => new THREE.SphereGeometry(r, w || 24, h || 18);
const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

/** Géométrie à facettes plates (rochers). */
export function flat(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.computeVertexNormals();
  return g;
}

/** Grand œil cartoon : blanc, pupille, reflet. */
function eye(r, iris) {
  const g = new THREE.Group();
  const white = at(mesh(S(r, 16, 12), 0xffffff, { roughness: 0.25 }), 0, 0, 0);
  white.scale.set(1, 1.15, 0.7);
  g.add(white);
  const pupil = at(mesh(S(r * 0.62, 16, 12), iris || 0x1a1008, { roughness: 0.15 }), 0, -r * 0.08, r * 0.45);
  pupil.scale.set(1, 1.15, 0.6);
  g.add(pupil);
  g.add(at(mesh(S(r * 0.2, 8, 6), 0xffffff, { roughness: 0.1, emissive: 0xffffff, emissiveIntensity: 0.6 }), r * 0.22, r * 0.25, r * 0.72));
  return g;
}

// ---------------------------------------------------------------------------
// Le duo : Ainu (eurasier roux) avec Matcha (pinscher) sur le dos
// Repère : avant = +z, pattes au sol en y = 0
// ---------------------------------------------------------------------------
export function buildDuo() {
  const root = new THREE.Group();
  const ainu = new THREE.Group();
  root.add(ainu);
  const OR = 0xd8642a, OR2 = 0xe8803c, CR = 0xf8e2c0, DK = 0x241612;
  const fur = mat(OR, { roughness: 0.85 });

  const body = at(mesh(S(0.55), fur), 0, 0.88, 0);
  body.scale.set(0.95, 0.85, 1.35);
  ainu.add(body);
  // Touffes de pelage le long du dos et des flancs
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI;
    ainu.add(at(mesh(S(0.22, 14, 10), fur), Math.cos(a) * 0.42, 1.05 + Math.sin(a) * 0.12, -0.45 + (i % 3) * 0.3));
  }
  const belly = at(mesh(S(0.45), CR), 0, 0.7, 0.1); belly.scale.set(0.8, 0.6, 1.3); ainu.add(belly);
  // Collerette touffue
  const ruff = at(mesh(S(0.52), fur), 0, 1.1, 0.5); ainu.add(ruff);
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i / 5) * Math.PI;
    ainu.add(at(mesh(S(0.18, 12, 8), i % 2 ? OR2 : OR), Math.cos(a) * 0.5, 0.95 + Math.sin(a + Math.PI / 2) * 0.05, 0.55 + Math.sin(a) * 0.1));
  }
  const chest = at(mesh(S(0.36), CR), 0, 0.95, 0.8); ainu.add(chest);
  // Bandana bleu
  const band = at(mesh(new THREE.ConeGeometry(0.34, 0.42, 24, 1, true), 0x2d66d0, { side: THREE.DoubleSide }), 0, 1.08, 0.92);
  band.rotation.x = Math.PI; band.scale.z = 0.5; ainu.add(band);
  const knot = at(mesh(new THREE.TorusGeometry(0.4, 0.06, 10, 30), 0x2d66d0), 0, 1.22, 0.55);
  knot.rotation.x = Math.PI / 2 - 0.35; ainu.add(knot);

  // Tête
  const head = new THREE.Group(); at(head, 0, 1.47, 0.85); ainu.add(head);
  head.add(mesh(S(0.42), fur));
  for (const sx of [-1, 1]) head.add(at(mesh(S(0.2, 14, 10), fur), sx * 0.32, -0.08, 0.05)); // joues touffues
  const cheeks = at(mesh(S(0.3), CR), 0, -0.13, 0.22); cheeks.scale.set(1.2, 0.8, 0.9); head.add(cheeks);
  const muzzle = at(mesh(S(0.2), CR), 0, -0.1, 0.44); muzzle.scale.set(0.95, 0.8, 1.25); head.add(muzzle);
  head.add(at(mesh(S(0.08, 14, 10), DK, { roughness: 0.2 }), 0, -0.04, 0.68));
  for (const sx of [-1, 1]) {
    const e = at(eye(0.09), sx * 0.17, 0.11, 0.33); e.rotation.y = sx * 0.25; head.add(e);
    const ear = at(mesh(new THREE.ConeGeometry(0.16, 0.34, 16), fur), sx * 0.24, 0.38, -0.02);
    ear.rotation.z = -sx * 0.35; head.add(ear);
    const inner = at(mesh(new THREE.ConeGeometry(0.09, 0.22, 12), 0xf0a890), sx * 0.24, 0.35, 0.07);
    inner.rotation.z = -sx * 0.35; head.add(inner);
  }
  const tongue = at(mesh(S(0.07, 12, 8), 0xf06a80, { roughness: 0.4 }), 0, -0.25, 0.53); tongue.scale.set(1, 0.5, 1.2); head.add(tongue);

  // Queue en tire-bouchon (pivot à la base, sert d'hélice pour planer)
  const tail = new THREE.Group(); at(tail, 0, 1.15, -0.72); ainu.add(tail);
  const tailMesh = at(mesh(new THREE.TorusGeometry(0.3, 0.16, 14, 28, Math.PI * 1.6), fur), 0, 0.3, 0);
  tailMesh.rotation.y = Math.PI / 2; tailMesh.rotation.z = -0.4;
  tail.add(tailMesh);
  tail.add(at(mesh(S(0.18), CR), 0, 0.58, 0.18));

  // Pattes (pivot à la hanche)
  const legs = [];
  for (const [lx, lz] of [[-0.3, 0.48], [0.3, 0.48], [-0.3, -0.42], [0.3, -0.42]]) {
    const g = at(new THREE.Group(), lx, 0.62, lz);
    g.add(at(mesh(new THREE.CapsuleGeometry(0.13, 0.32, 6, 14), fur), 0, -0.26, 0));
    const paw = at(mesh(S(0.15, 14, 10), CR), 0, -0.55, 0.05); paw.scale.set(1, 0.75, 1.2); g.add(paw);
    ainu.add(g);
    legs.push(g);
  }

  // Matcha, perché sur le dos
  const matcha = new THREE.Group(); at(matcha, 0, 1.4, -0.08); ainu.add(matcha);
  const BK = 0x1e1a24, TAN = 0xc8702e;
  const sleek = mat(BK, { roughness: 0.35 });
  const mb = at(mesh(S(0.3), sleek), 0, 0.12, 0); mb.scale.set(0.85, 0.75, 1.25); matcha.add(mb);
  const mchest = at(mesh(S(0.16), TAN), 0, 0.12, 0.3); matcha.add(mchest);
  const mhead = new THREE.Group(); at(mhead, 0, 0.55, 0.32); matcha.add(mhead);
  const neck = at(mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.4, 16), sleek), 0, -0.2, -0.06); neck.rotation.x = 0.4; mhead.add(neck);
  mhead.add(mesh(S(0.2), sleek));
  const mmuz = at(mesh(new THREE.CapsuleGeometry(0.085, 0.2, 6, 14), TAN), 0, -0.06, 0.26);
  mmuz.rotation.x = Math.PI / 2; mhead.add(mmuz);
  mhead.add(at(mesh(S(0.055, 12, 8), 0x0a0808, { roughness: 0.2 }), 0, -0.04, 0.42));
  for (const sx of [-1, 1]) {
    const e = at(eye(0.06, 0x6a3008), sx * 0.11, 0.06, 0.14); e.rotation.y = sx * 0.3; mhead.add(e);
    mhead.add(at(mesh(S(0.04, 10, 8), TAN), sx * 0.1, 0.16, 0.13));
    const ear = at(mesh(new THREE.ConeGeometry(0.085, 0.38, 14), sleek), sx * 0.11, 0.3, -0.02);
    ear.rotation.z = -sx * 0.18; mhead.add(ear);
    const inner = at(mesh(new THREE.ConeGeometry(0.045, 0.24, 10), 0xd88a8a), sx * 0.11, 0.28, 0.03);
    inner.rotation.z = -sx * 0.18; mhead.add(inner);
  }
  const collar = at(mesh(new THREE.TorusGeometry(0.14, 0.04, 10, 24), 0x7cc040, { roughness: 0.5 }), 0, 0.33, 0.24);
  collar.rotation.x = Math.PI / 2 - 0.4; matcha.add(collar);
  matcha.add(at(mesh(S(0.045, 10, 8), 0xffd34d, { metalness: 0.8, roughness: 0.25 }), 0, 0.24, 0.38));
  const mtail = at(mesh(new THREE.CapsuleGeometry(0.035, 0.32, 4, 10), sleek), 0, 0.35, -0.38); mtail.rotation.x = -0.5; matcha.add(mtail);
  const mlegs = [];
  for (const sx of [-1, 1]) for (const lz of [0.2, -0.2]) {
    const g = at(new THREE.Group(), sx * 0.2, 0.05, lz);
    g.add(at(mesh(new THREE.CapsuleGeometry(0.05, 0.2, 4, 10), sleek), 0, -0.15, 0));
    g.add(at(mesh(S(0.06, 10, 8), TAN), 0, -0.3, 0.02));
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
  const GR = 0x8c8ca0, DK = 0x2a2a36, ST = 0x5c5c70, WH = 0xe8e8f0;
  const body = at(mesh(S(0.42), GR), 0, 0.55, 0); body.scale.set(0.8, 0.8, 1.25); g.add(body);
  const bel = at(mesh(S(0.3), WH), 0, 0.48, 0.12); bel.scale.set(0.8, 0.7, 1.1); g.add(bel);
  const head = new THREE.Group(); at(head, 0, 1.0, 0.45); g.add(head);
  head.add(mesh(S(0.34), GR));
  const mask = at(mesh(new THREE.CapsuleGeometry(0.09, 0.42, 6, 14), DK), 0, 0.06, 0.24); mask.rotation.z = Math.PI / 2; head.add(mask);
  head.add(at(mesh(S(0.14), WH), 0, -0.12, 0.25));
  for (const sx of [-1, 1]) {
    const e = at(eye(0.07, 0xc8a010), sx * 0.13, 0.07, 0.27); e.rotation.y = sx * 0.3; head.add(e);
    const ear = at(mesh(new THREE.ConeGeometry(0.13, 0.28, 14), GR), sx * 0.2, 0.32, 0); ear.rotation.z = -sx * 0.25; head.add(ear);
    // Moustaches
    for (const dy of [-0.02, 0.03]) {
      const w = at(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.4, 4), 0xffffff), sx * 0.2, -0.1 + dy, 0.3);
      w.rotation.z = Math.PI / 2 + sx * dy * 4; head.add(w);
    }
  }
  head.add(at(mesh(S(0.05, 10, 8), 0xff8aa0), 0, -0.05, 0.34));
  // Petit bandana de pirate rouge
  const bandana = at(mesh(new THREE.SphereGeometry(0.35, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0xc83030), 0, 0.08, -0.02);
  bandana.scale.set(1.02, 0.7, 1.02); head.add(bandana);
  const tail = new THREE.Group(); at(tail, 0, 0.7, -0.5); g.add(tail);
  for (let i = 0; i < 5; i++) tail.add(at(mesh(S(0.085, 12, 8), i % 2 ? DK : ST), 0, i * 0.12, -i * 0.05));
  const legs = [];
  for (const [lx, lz] of [[-0.2, 0.3], [0.2, 0.3], [-0.2, -0.3], [0.2, -0.3]]) {
    const l = at(new THREE.Group(), lx, 0.4, lz);
    l.add(at(mesh(new THREE.CapsuleGeometry(0.075, 0.25, 4, 10), GR), 0, -0.2, 0));
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
  const Y = 0xe8c070, LT = 0xf6e4bc;
  const body = at(mesh(S(0.6), Y), 0, 0.85, 0); body.scale.set(0.9, 1.15, 0.9); g.add(body);
  g.add(at(mesh(S(0.4), LT), 0, 0.85, 0.32));
  const head = new THREE.Group(); at(head, 0, 1.75, 0.2); g.add(head);
  head.add(mesh(S(0.42), Y));
  const muz = at(mesh(S(0.24), LT), 0, -0.12, 0.36); muz.scale.set(1, 0.8, 1.1); head.add(muz);
  head.add(at(mesh(S(0.08, 12, 8), 0x3a2010, { roughness: 0.2 }), 0, -0.05, 0.6));
  for (const sx of [-1, 1]) {
    const e = at(eye(0.07, 0x3a1a08), sx * 0.15, 0.1, 0.32); head.add(e);
    const glass = at(mesh(new THREE.TorusGeometry(0.11, 0.015, 8, 24), 0xc8a050, { metalness: 0.8, roughness: 0.3 }), sx * 0.15, 0.1, 0.4); head.add(glass);
    const ear = at(mesh(S(0.18), 0xd0a050), sx * 0.4, -0.05, -0.02); ear.scale.set(0.5, 1.2, 0.8); head.add(ear);
  }
  const bridge = at(mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 4), 0xc8a050, { metalness: 0.8 }), 0, 0.1, 0.42);
  bridge.rotation.z = Math.PI / 2; head.add(bridge);
  const scarf = at(mesh(new THREE.TorusGeometry(0.36, 0.11, 12, 28), 0xd03434), 0, 1.38, 0.1); scarf.rotation.x = Math.PI / 2; g.add(scarf);
  for (const sx of [-1, 1]) {
    g.add(at(mesh(new THREE.CapsuleGeometry(0.13, 0.4, 6, 14), Y), sx * 0.25, 0.32, 0.35));
    const hind = at(mesh(S(0.28), Y), sx * 0.42, 0.3, -0.15); hind.scale.set(0.8, 0.9, 1.3); g.add(hind);
  }
  const tail = new THREE.Group(); at(tail, 0, 0.35, -0.55); g.add(tail);
  const t = at(mesh(new THREE.CapsuleGeometry(0.07, 0.45, 6, 12), Y), 0, 0, -0.25); t.rotation.x = Math.PI / 2.2; tail.add(t);
  g.userData = { head, tail };
  return g;
}

export function buildPuppy() {
  const g = new THREE.Group();
  const C = 0xf4e0c0, B = 0xbc8c5c;
  const body = at(mesh(S(0.3), C), 0, 0.42, 0); body.scale.set(0.9, 0.85, 1.2); g.add(body);
  const head = new THREE.Group(); at(head, 0, 0.82, 0.25); g.add(head);
  head.add(mesh(S(0.3), C));
  head.add(at(mesh(S(0.13), 0xfff6e8), 0, -0.09, 0.24));
  head.add(at(mesh(S(0.05, 10, 8), 0x2a1408, { roughness: 0.2 }), 0, -0.05, 0.36));
  for (const sx of [-1, 1]) {
    const e = at(eye(0.075, 0x2a1408), sx * 0.12, 0.06, 0.22); head.add(e);
    const ear = at(mesh(S(0.13), B), sx * 0.26, 0.05, -0.02); ear.scale.set(0.5, 1.2, 0.8); head.add(ear);
  }
  const tail = new THREE.Group(); at(tail, 0, 0.5, -0.32); g.add(tail);
  tail.add(at(mesh(new THREE.CapsuleGeometry(0.04, 0.2, 4, 8), C), 0, 0.12, -0.05));
  const legs = [];
  for (const [lx, lz] of [[-0.15, 0.18], [0.15, 0.18], [-0.15, -0.18], [0.15, -0.18]]) {
    const l = at(new THREE.Group(), lx, 0.3, lz);
    l.add(at(mesh(new THREE.CapsuleGeometry(0.06, 0.16, 4, 8), C), 0, -0.15, 0));
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
  const hasColor = geos.every(g => g.attributes.color);
  const col = hasColor ? new Float32Array(n * 3) : null;
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3);
    nor.set(g.attributes.normal.array, o * 3);
    if (col) col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

export function boneGeometry() {
  return mergeGeos([
    { geo: new THREE.CapsuleGeometry(0.09, 0.62, 6, 14), rz: Math.PI / 2 },
    { geo: S(0.13, 14, 10), x: -0.36, y: 0.08 }, { geo: S(0.13, 14, 10), x: -0.36, y: -0.08 },
    { geo: S(0.13, 14, 10), x: 0.36, y: 0.08 }, { geo: S(0.13, 14, 10), x: 0.36, y: -0.08 },
  ]);
}

export const GOLD = () => mat(0xffc830, { metalness: 0.85, roughness: 0.22, emissive: 0x5a3a00, emissiveIntensity: 0.6 });

export function buildMedal() {
  const g = new THREE.Group();
  const gold = GOLD();
  const coin = mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.14, 40), gold);
  coin.rotation.x = Math.PI / 2;
  g.add(coin);
  const rim = mesh(new THREE.TorusGeometry(0.6, 0.06, 12, 40), gold); g.add(rim);
  // Empreinte de patte en relief sur les deux faces
  const paw = mat(0xd89a10, { metalness: 0.7, roughness: 0.35 });
  for (const side of [-1, 1]) {
    const add = (x, y, r) => { const p = at(mesh(new THREE.CylinderGeometry(r, r, 0.05, 20), paw), x, y, side * 0.08); p.rotation.x = Math.PI / 2; g.add(p); };
    add(0, -0.1, 0.2);
    add(-0.22, 0.14, 0.08); add(-0.08, 0.26, 0.08); add(0.08, 0.26, 0.08); add(0.22, 0.14, 0.08);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(3.4, 3.4, 1);
  g.add(glow);
  return g;
}

let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}

export function buildBall() {
  const g = new THREE.Group();
  g.add(mesh(S(0.32), 0xd8f040, { roughness: 0.9 }));
  const seam = mesh(new THREE.TorusGeometry(0.32, 0.025, 8, 40), 0xffffff); seam.rotation.x = 1.1; g.add(seam);
  return g;
}

export function buildHeart() {
  const g = new THREE.Group();
  const m = mat(0xf03848, { roughness: 0.3, emissive: 0x500010, emissiveIntensity: 0.6 });
  g.add(at(mesh(S(0.22), m), -0.15, 0.08, 0));
  g.add(at(mesh(S(0.22), m), 0.15, 0.08, 0));
  const c = at(mesh(new THREE.ConeGeometry(0.31, 0.42, 24), m), 0, -0.2, 0); c.rotation.z = Math.PI; g.add(c);
  return g;
}

/** Texture de bois pour les caisses (dessinée). */
function crateTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#c08848'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(90,50,20,${Math.random() * 0.12})`; x.fillRect(Math.random() * 128, Math.random() * 128, 30 + Math.random() * 40, 1.5); }
  x.fillStyle = '#7a4a1e';
  for (let i = 32; i < 128; i += 32) x.fillRect(0, i - 1, 128, 3);
  x.fillStyle = '#6a3c14'; x.fillRect(0, 0, 128, 12); x.fillRect(0, 116, 128, 12); x.fillRect(0, 0, 12, 128); x.fillRect(116, 0, 12, 128);
  x.save(); x.translate(64, 64); x.rotate(Math.PI / 4); x.fillRect(-80, -6, 160, 12); x.restore();
  x.fillStyle = '#c8c0b0';
  for (const [a, b] of [[6, 6], [122, 6], [6, 122], [122, 122]]) { x.beginPath(); x.arc(a, b, 3, 0, Math.PI * 2); x.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
let crateMat = null;
export function buildCrate() {
  if (!crateMat) crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.85 });
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), crateMat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

export function buildSign(text) {
  const g = new THREE.Group();
  g.add(at(mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 10), 0x7a4a24), 0, 0.8, 0));
  const board = at(mesh(new THREE.BoxGeometry(1.4, 0.8, 0.12), 0xc08c58), 0, 1.5, 0);
  g.add(board);
  g.add(at(mesh(new THREE.BoxGeometry(1.0, 0.07, 0.02), 0x5a3418), 0, 1.6, 0.07));
  g.add(at(mesh(new THREE.BoxGeometry(0.8, 0.07, 0.02), 0x5a3418), 0, 1.42, 0.07));
  g.userData.text = text;
  return g;
}

export function buildPedestal() {
  const g = new THREE.Group();
  const stone = mat(0xd8d0c0, { roughness: 0.6 });
  g.add(at(mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.6, 24), stone), 0, 0.3, 0));
  g.add(at(mesh(new THREE.CylinderGeometry(0.7, 0.9, 1.0, 24), stone), 0, 1.0, 0));
  const ring = at(mesh(new THREE.TorusGeometry(0.75, 0.06, 8, 32), GOLD()), 0, 1.5, 0);
  ring.rotation.x = Math.PI / 2; g.add(ring);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    g.add(at(mesh(S(0.14, 12, 8), 0x8a8270), Math.cos(a) * 0.95, 0.62, Math.sin(a) * 0.95));
  }
  return g;
}
