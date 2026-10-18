/*
 * Matcha & Ainu — la Fleur Merveille (idée « Super Mario Bros. Wonder »).
 *
 * Une fleur magique se cache dans chaque monde (wonderdata.js). Elle brille doucement,
 * ses pétales se balancent, et quand on approche elle fredonne une petite mélodie
 * scintillante. On la touche : tourbillon arc-en-ciel sur tout l'écran, « Merveille ! »,
 * la musique change… et pendant 30 secondes le monde se transforme (wonderfx.js : une
 * merveille différente par monde). Des graines merveille apparaissent tout autour ;
 * ramasser la dernière, c'est trouver la Fleur Merveille du monde. À la fin, un voile
 * d'étincelles et tout redevient comme avant. La fleur repousse : on peut rejouer.
 *
 * Monde partagé : l'hôte déclenche et fait vivre la merveille (physique des chiens,
 * graines) ; l'état part dans l'instantané (snapshot / apply), les amis voient tout.
 * Sauvegarde : save.wonder = { found, seeds, plays } dans la sauvegarde du monde
 * (fusionnée par mergeSave comme le reste) + la collection du joueur (WONDER_KEY).
 *
 * Coût : la fleur = 4 appels de dessin ; les graines = 2 ; chaque merveille ajoute
 * quelques maillages instanciés seulement pendant ses 30 secondes.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import { WONDER_TIME, SEEDS, WONDERS, wonderOf } from './wonderdata.js';
import { makeFx } from './wonderfx.js';

const TAU = Math.PI * 2;
const INTRO = 1.5, OUTRO = 2.0, REGROW = 3.5;
const ST = ['idle', 'intro', 'on', 'outro'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (c, t, k) => c + (t - c) * k;
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; };

/** La collection du joueur (tous mondes confondus), rangée dans son tiroir de profil. */
export const WONDER_KEY = 'dogfight.aventure.merveilles';
export function foundWorlds() {
  try { const a = JSON.parse(localStorage.getItem(WONDER_KEY) || '[]'); return Array.isArray(a) ? a.filter(n => WONDERS.some(w => w.lv === n)) : []; } catch (e) { return []; }
}
function addFound(lv) {
  const have = new Set(foundWorlds());
  if (have.has(lv)) return false;
  have.add(lv);
  try { localStorage.setItem(WONDER_KEY, JSON.stringify([...have].sort())); } catch (e) { /* ignore */ }
  return true;
}

// ---------------------------------------------------------------------------
// La fleur : une vraie fleur sculptée (pétales veloutés qui brillent de l'intérieur,
// tige courbée, feuilles nervurées, cœur doré avec deux petits yeux)
// ---------------------------------------------------------------------------
const _c = new THREE.Color(), _c2 = new THREE.Color(), _v = new THREE.Vector3();

/** Une surface (u : 0..1 de la base à la pointe ; v : -1..1 en travers) ; fn(u, v, pos, col). */
function surface(nu, nv, fn, extra) {
  const n = (nu + 1) * (nv + 1), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), au = new Float32Array(n), ap = new Float32Array(n);
  const P = new THREE.Vector3(), C = new THREE.Color();
  let k = 0;
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const u = i / nu, v = j / nv * 2 - 1;
      fn(u, v, P, C);
      pos[k * 3] = P.x; pos[k * 3 + 1] = P.y; pos[k * 3 + 2] = P.z;
      col[k * 3] = C.r; col[k * 3 + 1] = C.g; col[k * 3 + 2] = C.b;
      au[k] = u; ap[k] = extra || 0;
      k++;
    }
  }
  const idx = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aU', new THREE.BufferAttribute(au, 1));
  g.setAttribute('aP', new THREE.BufferAttribute(ap, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** Fusionne des géométries indexées qui ont les mêmes attributs. */
export function mergeIndexed(list) {
  const names = Object.keys(list[0].attributes);
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const out = new THREE.BufferGeometry(), idx = new (nv > 65000 ? Uint32Array : Uint16Array)(ni);
  for (const nm of names) {
    const sz = list[0].attributes[nm].itemSize, arr = new Float32Array(nv * sz);
    let o = 0;
    for (const g of list) { arr.set(g.attributes[nm].array, o * sz); o += g.attributes[nm].count; }
    out.setAttribute(nm, new THREE.BufferAttribute(arr, sz));
  }
  let o = 0, io = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + o;
    else for (let i = 0; i < c; i++) idx[io++] = i + o;
    o += c;
  }
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
/** Ajoute les attributs aU / aP (0) à une géométrie quelconque, peinte d'une couleur ou d'une fonction. */
export function prep(g, paint, aU) {
  if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color'].includes(k)) g.deleteAttribute(k);
  const p = g.attributes.position, n = p.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    if (typeof paint === 'function') paint(p.getX(i), p.getY(i), p.getZ(i), _c); else _c.set(paint);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aU', new THREE.BufferAttribute(new Float32Array(n).fill(aU || 0), 1));
  g.setAttribute('aP', new THREE.BufferAttribute(new Float32Array(n), 1));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Un pétale (ou une feuille) : rayon de départ r0, longueur len, largeur w, cuvette cup, angle de départ pitch, bout qui se recourbe curl. */
export function petal(o) {
  const { r0 = 0.05, len = 0.4, w = 0.16, cup = 0.5, pitch = 0.4, curl = 0.6, yaw = 0, cols, ph = 0, nu = 9, nv = 6, vein = 0.1 } = o;
  const rx = Math.sin(yaw), rz = Math.cos(yaw), tx = Math.cos(yaw), tz = -Math.sin(yaw);
  return surface(nu, nv, (u, v, P, C) => {
    // (jamais tout à fait pointu : un bout arrondi, et pas de triangles écrasés aux normales nulles)
    const width = w * Math.max(0.06, Math.pow(Math.sin(Math.PI * Math.min(0.96, Math.pow(u, 0.75) * 0.94 + 0.04)), 0.75)) * (1 - 0.1 * u);
    const pa = pitch - curl * u * u;                     // la pointe se recourbe vers l'extérieur
    const along = len * u, ca = Math.cos(pa), sa = Math.sin(pa);
    const lift = cup * v * v * width;                     // cuvette en travers
    const r = r0 + along * ca - lift * sa * 0.6, y = along * sa + lift * ca;
    P.set(rx * r + tx * v * width, y, rz * r + tz * v * width);
    // dégradé : cœur crème -> couleur -> pointe ; nervures fines ; bord plus clair
    const c0 = cols[0], c1 = cols[1], c2 = cols[2];
    if (u < 0.45) C.copy(_c.set(c0)).lerp(_c2.set(c1), sst(0.0, 0.45, u)); else C.copy(_c.set(c1)).lerp(_c2.set(c2), sst(0.45, 1.0, u));
    const vn = 1 - vein * (1 - Math.abs(Math.cos(v * Math.PI * 2.5))) * Math.min(1, u * 3);
    C.multiplyScalar(vn);
    if (Math.abs(v) > 0.82) C.lerp(_c.set(0xffffff), 0.18 * u);
  }, ph);
}

function flowerMaterial(kind, lite, U) {
  const P = lite ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial;
  const m = new P({ vertexColors: true, roughness: kind === 'petal' ? 0.55 : kind === 'eye' ? 0.12 : 0.65, metalness: 0, side: kind === 'petal' || kind === 'leaf' ? THREE.DoubleSide : THREE.FrontSide });
  if (!lite && kind === 'petal') { m.sheen = 1; m.sheenRoughness = 0.45; m.sheenColor = new THREE.Color(0xffd8f0); }
  if (!lite && kind === 'heart') { m.sheen = 0.6; m.sheenRoughness = 0.6; m.sheenColor = new THREE.Color(0xfff0b0); }
  m.userData.keepPBR = true;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uTime: U.uTime, uGlow: U.uGlow, uSing: U.uSing });
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aU; attribute float aP; uniform float uTime, uSing; varying float vU;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vU = aU;
        ${kind === 'petal' ? `
        // les pétales respirent et frémissent chacun à leur rythme, et vibrent quand la fleur chante
        float fl = sin(uTime * 2.1 + aP * 6.283) * 0.022 + sin(uTime * 5.3 + aP * 3.1) * 0.006 + uSing * 0.04;
        transformed += objectNormal * fl * aU * aU * 1.6;
        transformed.y += uSing * 0.03 * aU;` : kind === 'leaf' ? `
        transformed += objectNormal * sin(uTime * 1.6 + aP * 4.0) * 0.02 * aU * aU;` : ''}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow, uSing, uTime; varying float vU;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // lueur douce de l'intérieur (plus forte de près et quand elle chante) + liseré lumineux
          float rim = 1.0 - abs(dot(normalize(normal + vec3(1e-5)), normalize(vViewPosition + vec3(1e-5))));
          ${kind === 'petal' ? 'float k = (0.22 + 0.32 * uGlow + 0.45 * uSing) * (1.0 - vU * 0.35) + rim * rim * 0.5 * (0.5 + uGlow);'
    : kind === 'heart' ? 'float k = 0.55 + 0.35 * uGlow + 0.5 * uSing + 0.08 * sin(uTime * 3.0);'
      : kind === 'eye' ? 'float k = 0.0;' : 'float k = 0.08 + 0.1 * uGlow + rim * rim * 0.25;'}
          totalEmissiveRadiance += diffuseColor.rgb * k;
        }`);
  };
  m.customProgramCacheKey = () => 'wonder-' + kind + (lite ? '-l' : '');
  return m;
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,240,250,0.75)'); gr.addColorStop(0.45, 'rgba(255,190,235,0.22)'); gr.addColorStop(1, 'rgba(255,160,230,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let glowTex = null;
export function wonderGlow() { return glowTex || (glowTex = glowTexture()); }

/** La Fleur Merveille. Rend { group, head, eyes, halo, U, height }. */
export function buildFlower(lite) {
  const U = { uTime: { value: 0 }, uGlow: { value: 0 }, uSing: { value: 0 } };
  const g = new THREE.Group();
  const nu = lite ? 7 : 10, nv = lite ? 4 : 6;
  // --- tige (courbe en S douce), feuilles, petites pâquerettes au pied
  const H = 1.12;
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.05, 0.35, -0.03), new THREE.Vector3(-0.04, 0.75, 0.02), new THREE.Vector3(0.02, H, 0.04)]);
  const tube = new THREE.TubeGeometry(curve, lite ? 14 : 24, 1, lite ? 6 : 9, false);
  {
    const p = tube.attributes.position, P = new THREE.Vector3(), seg = lite ? 14 : 24, rad = lite ? 6 : 9;
    for (let i = 0; i <= seg; i++) {
      curve.getPointAt(i / seg, P);
      const r = 0.042 - 0.018 * (i / seg);
      for (let j = 0; j <= rad; j++) { const q = i * (rad + 1) + j; _v.fromBufferAttribute(p, q).sub(P).multiplyScalar(r).add(P); p.setXYZ(q, _v.x, _v.y, _v.z); }
    }
    tube.computeVertexNormals();
  }
  const stemParts = [prep(tube, (x, y, z, c) => c.set(0x2f7a26).lerp(_c2.set(0x8ad850), y / H * 0.85), 0.5)];
  const leafCols = [0x3a8a2a, 0x5cb83a, 0x9ae060];
  for (const [y, yaw, len, ph] of [[0.3, 0.6, 0.42, 0.2], [0.52, 0.6 + Math.PI * 0.95, 0.36, 0.7], [0.08, 2.2, 0.3, 0.45]]) {
    const lf = petal({ r0: 0.02, len, w: len * 0.32, cup: 0.9, pitch: 0.75, curl: 1.3, yaw, cols: leafCols, ph, nu, nv, vein: 0.25 });
    lf.translate(0, y, 0);
    stemParts.push(lf);
  }
  // sépales sous la fleur
  for (let i = 0; i < 5; i++) {
    const s = petal({ r0: 0.02, len: 0.11, w: 0.05, cup: 0.6, pitch: -0.5, curl: -0.4, yaw: i / 5 * TAU, cols: [0x5aa83a, 0x6ac040, 0x8ad850], nu: 4, nv: 3 });
    s.translate(0.02, H - 0.02, 0.04);
    stemParts.push(s);
  }
  // pâquerettes et trèfles autour du pied (on repère la fleur de loin)
  for (let k = 0; k < (lite ? 4 : 7); k++) {
    const a = k / (lite ? 4 : 7) * TAU + 0.4, r = 0.32 + (k % 3) * 0.1;
    for (let i = 0; i < 6; i++) {
      const s = petal({ r0: 0.012, len: 0.055, w: 0.022, cup: 0.4, pitch: 0.15, curl: 0.2, yaw: i / 6 * TAU, cols: [0xfff6c8, 0xffffff, k % 2 ? 0xffd8ec : 0xffffff], nu: 3, nv: 2 });
      s.translate(Math.cos(a) * r, 0.06 + (k % 2) * 0.03, Math.sin(a) * r);
      stemParts.push(s);
    }
    const hd = prep(new THREE.SphereGeometry(0.014, 6, 4), 0xffc83a, 0.2); hd.translate(Math.cos(a) * r, 0.07 + (k % 2) * 0.03, Math.sin(a) * r); stemParts.push(hd);
  }
  const stem = new THREE.Mesh(mergeIndexed(stemParts), flowerMaterial('leaf', lite, U));
  stem.castShadow = true;
  g.add(stem);
  // --- la tête (pétales + cœur + yeux), qui se tourne vers les chiens
  const head = new THREE.Group();
  head.position.set(0.02, H, 0.04);
  g.add(head);
  const tilt = new THREE.Group(); tilt.rotation.x = 0.95; head.add(tilt);
  const pets = [];
  const OUT = [0xfff2c4, 0xff62aa, 0xe890ff], MID = [0xfffbe8, 0xff94cc, 0xff5aa0], IN = [0xffffff, 0xffd6ec, 0xff86c0];
  for (let i = 0; i < 7; i++) pets.push(petal({ r0: 0.07, len: 0.44, w: 0.19, cup: 0.55, pitch: 0.28, curl: 0.75, yaw: i / 7 * TAU, cols: OUT, ph: i * 0.37, nu, nv }));
  for (let i = 0; i < 7; i++) pets.push(petal({ r0: 0.06, len: 0.33, w: 0.15, cup: 0.65, pitch: 0.62, curl: 0.7, yaw: (i + 0.5) / 7 * TAU, cols: MID, ph: 0.5 + i * 0.29, nu, nv }));
  for (let i = 0; i < 5; i++) pets.push(petal({ r0: 0.05, len: 0.2, w: 0.11, cup: 0.8, pitch: 1.05, curl: 0.5, yaw: (i + 0.25) / 5 * TAU, cols: IN, ph: 0.2 + i * 0.41, nu: Math.max(5, nu - 3), nv: Math.max(3, nv - 2) }));
  const petals = new THREE.Mesh(mergeIndexed(pets), flowerMaterial('petal', lite, U));
  petals.castShadow = true;
  tilt.add(petals);
  // cœur doré (dôme granuleux) avec ses deux grands yeux brillants et des joues roses
  const dome = new THREE.SphereGeometry(0.135, lite ? 16 : 24, lite ? 10 : 16, 0, TAU, 0, Math.PI * 0.55);
  {
    const p = dome.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + 0.035 * Math.sin(x * 90) * Math.sin(z * 90); p.setXYZ(i, x * k, y * 0.62 * k, z * k); }
    dome.computeVertexNormals();
  }
  const heart = prep(dome, (x, y, z, c) => { c.set(0xffb21e).lerp(_c2.set(0xfff1a0), clamp(y / 0.08, 0, 1)); if (Math.hypot(Math.abs(x) - 0.075, z - 0.055) < 0.03 && y < 0.07) c.lerp(_c2.set(0xff7a9a), 0.7); });
  const heartM = new THREE.Mesh(heart, flowerMaterial('heart', lite, U));
  tilt.add(heartM);
  const eyeParts = [];
  // (repère du cœur : +y = vers celui qui regarde la fleur, -z = le haut du visage)
  for (const sx of [-1, 1]) {
    const e = prep(new THREE.SphereGeometry(0.03, 12, 10), 0x1a0e14);
    e.scale(0.82, 0.5, 1.3); e.translate(sx * 0.044, 0.078, -0.022);
    const sh = prep(new THREE.SphereGeometry(0.0095, 6, 5), 0xffffff); sh.translate(sx * 0.044 + 0.009, 0.093, -0.036);
    const sh2 = prep(new THREE.SphereGeometry(0.005, 5, 4), 0xffffff); sh2.translate(sx * 0.044 - 0.006, 0.09, -0.006);
    eyeParts.push(e, sh, sh2);
  }
  // petit sourire
  const smile = prep(new THREE.TorusGeometry(0.022, 0.0045, 4, 10, Math.PI), 0x5a1a2a);
  smile.rotateX(-Math.PI / 2); smile.rotateY(Math.PI); smile.translate(0, 0.083, 0.02);
  eyeParts.push(smile);
  const eyes = new THREE.Mesh(mergeIndexed(eyeParts), flowerMaterial('eye', lite, U));
  tilt.add(eyes);
  // halo lumineux (sprite additif) : on voit la fleur briller de loin
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: wonderGlow(), color: 0xffd6f0, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  halo.scale.set(2.4, 2.4, 1); halo.position.set(0, 0.1, 0); halo.renderOrder = 6; halo.userData.noOutline = true;
  head.add(halo);
  for (const o of [stem, petals, heartM, eyes]) o.userData.noOutline = true;
  return { group: g, head, tilt, eyes, halo, petals, U, height: H + 0.35 };
}

/** Graine merveille : une goutte dorée aux reflets arc-en-ciel. */
function seedGeometry() {
  const pts = [];
  for (let i = 0; i <= 12; i++) { const t = i / 12, a = t * Math.PI; pts.push(new THREE.Vector2(Math.sin(a) * 0.16 * (1 - 0.55 * t) * (0.6 + 0.4 * Math.sin(a)), -Math.cos(a) * 0.22 + 0.04 * t)); }
  const g = new THREE.LatheGeometry(pts, 14);
  const p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), a = Math.atan2(p.getZ(i), p.getX(i));
    _c.set(0xffc030).lerp(_c2.set(0xfff4b0), clamp((y + 0.2) / 0.4, 0, 1));
    _c.lerp(_c2.setHSL(((a / TAU + y * 1.5) % 1 + 1) % 1, 0.9, 0.7), 0.28);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------------------
// Écran : tourbillon, voile d'étincelles, titre « Merveille ! », compteur de graines
// ---------------------------------------------------------------------------
let cssDone = false;
function css() {
  if (cssDone) return;
  cssDone = true;
  const st = document.createElement('style');
  st.textContent = `
  .wonder-swirl, .wonder-wash { position: absolute; inset: 0; pointer-events: none; z-index: 8; overflow: hidden; display: none; }
  .wonder-swirl.on, .wonder-wash.on { display: block; }
  .wonder-swirl .sw { position: absolute; left: 50%; top: 50%; width: 160vmax; height: 160vmax; margin: -80vmax 0 0 -80vmax; border-radius: 50%;
    background: radial-gradient(circle, #fff 0 3%, rgba(255,250,255,.85) 7%, rgba(255,255,255,0) 26%),
      repeating-conic-gradient(from 0deg, #ff5aa8 0 15deg, #ff9a3a 15deg 30deg, #ffe45a 30deg 45deg, #6ae08a 45deg 60deg, #4ec2ff 60deg 75deg, #a77aff 75deg 90deg);
    transform: scale(0) rotate(0deg); opacity: 1; will-change: transform, opacity; }
  .wonder-swirl.on .sw { animation: wSwirl ${INTRO}s cubic-bezier(.45,.05,.35,1) forwards; }
  @keyframes wSwirl { 0% { transform: scale(0) rotate(0deg); opacity: 1; } 42% { transform: scale(1) rotate(300deg); opacity: 1; } 58% { transform: scale(1.1) rotate(380deg); opacity: 1; } 100% { transform: scale(1.9) rotate(620deg); opacity: 0; } }
  .wonder-wash { background: radial-gradient(circle at 50% 55%, rgba(255,255,255,.98), rgba(255,236,170,.9) 35%, rgba(255,170,220,.85) 70%, rgba(190,150,255,.8)); opacity: 0; }
  .wonder-wash.on { animation: wWash ${OUTRO}s ease-in-out forwards; }
  @keyframes wWash { 0% { opacity: 0; } 45% { opacity: 1; } 55% { opacity: 1; } 100% { opacity: 0; } }
  .wonder-wash i { position: absolute; width: 30px; height: 30px; margin: -15px 0 0 -15px; opacity: 0;
    background: radial-gradient(circle, #fff 0 14%, rgba(255,236,150,.95) 24%, rgba(255,214,90,0) 62%);
    clip-path: polygon(50% 0, 60% 40%, 100% 50%, 60% 60%, 50% 100%, 40% 60%, 0 50%, 40% 40%); }
  .wonder-wash.on i { animation: wTw 1.2s ease-out both; }
  @keyframes wTw { 0% { opacity: 0; transform: scale(.2) rotate(0); } 35% { opacity: 1; transform: scale(1.4) rotate(50deg); } 100% { opacity: 0; transform: scale(.3) rotate(140deg); } }
  .wonder-title { position: absolute; left: 0; right: 0; top: 13%; text-align: center; pointer-events: none; z-index: 9; display: none; }
  .wonder-title.on { display: block; animation: wTitle 3.4s ease-out forwards; }
  .wonder-title .w1 { display: inline-block; font-family: Fredoka, 'Arial Rounded MT Bold', sans-serif; font-weight: 700; font-size: clamp(46px, 11vw, 104px); line-height: 1; letter-spacing: 1px; }
  .wonder-title .w1 span { display: inline-block; color: var(--c); -webkit-text-stroke: 2px #fff; text-shadow: 0 5px 0 #5a2a7a, 0 0 22px rgba(255,255,255,.9), 0 0 40px var(--c);
    animation: wLetter .6s cubic-bezier(.3,1.8,.5,1) both; animation-delay: calc(var(--i) * 55ms); }
  .wonder-title .w2 { margin-top: 8px; display: inline-block; padding: 6px 18px; border-radius: 999px; background: rgba(255,255,255,.92); border: 3px solid #5a2a7a; box-shadow: 0 4px 0 #5a2a7a;
    font-family: Fredoka, 'Arial Rounded MT Bold', sans-serif; font-weight: 700; font-size: clamp(17px, 3.6vw, 28px); color: #6a2a8a; animation: wSub .5s .45s cubic-bezier(.3,1.6,.5,1) both; }
  .wonder-title small { display: block; margin-top: 6px; font-family: Fredoka, sans-serif; font-weight: 600; font-size: clamp(13px, 2.6vw, 19px); color: #fff; text-shadow: 0 2px 0 #5a2a7a, 0 0 10px #5a2a7a; animation: wSub .5s .7s ease-out both; }
  @keyframes wLetter { 0% { transform: translateY(-60px) scale(.3); opacity: 0; } 100% { transform: none; opacity: 1; } }
  @keyframes wSub { 0% { transform: scale(.4); opacity: 0; } 100% { transform: none; opacity: 1; } }
  @keyframes wTitle { 0%, 82% { opacity: 1; } 100% { opacity: 0; } }
  .wonder-hud { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 8px); left: 50%; transform: translateX(-50%); z-index: 5; pointer-events: none; display: none;
    align-items: center; gap: 8px; padding: 5px 14px 5px 6px; border-radius: 999px; background: rgba(255,255,255,.9); border: 3px solid #5a2a7a; box-shadow: 0 3px 0 #5a2a7a;
    font-family: Fredoka, 'Arial Rounded MT Bold', sans-serif; color: #5a2a7a; }
  .wonder-hud.on { display: flex; animation: wSub .5s cubic-bezier(.3,1.6,.5,1) both; }
  .wonder-hud .ring { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; font-size: 21px;
    background: radial-gradient(circle, #fff 0 56%, transparent 58%), conic-gradient(#ff5aa8 calc(var(--p) * 1%), #e8dcf0 0); }
  .wonder-hud b { font-size: 22px; line-height: 1; }
  .wonder-hud small { font-size: 12px; font-weight: 600; opacity: .8; display: block; }
  .wonder-hud.hurry .ring { animation: wPulse .5s ease-in-out infinite alternate; }
  .wonder-hud.got b { animation: wGot .35s ease-out; }
  @keyframes wPulse { to { transform: scale(1.15); } }
  @keyframes wGot { 0% { transform: scale(1.5); color: #ff5aa8; } 100% { transform: none; } }
  @media (prefers-reduced-motion: reduce) { .wonder-swirl.on .sw { animation-duration: ${INTRO}s; } .wonder-title .w1 span { animation: none; } }`;
  document.head.appendChild(st);
}

// ---------------------------------------------------------------------------
export class Wonder {
  constructor(game) {
    this.g = game;
    this.def = wonderOf(L.ID);
    this.state = 'idle'; this.t = 0; this.regrow = 0; this.armed = true; this.mask = 0; this.n = 0;
    this.lite = !!game.lite;
    if (!this.def) return;
    const s = game.save;
    if (!s.wonder || typeof s.wonder !== 'object') s.wonder = { found: false, seeds: 0, plays: 0 };
    // la fleur
    const d = this.def;
    const sup = game.support(d.x, d.z, d.y + 0.8);
    this.pos = new THREE.Vector3(d.x, sup.y, d.z);
    this.F = buildFlower(this.lite);
    this.F.group.position.copy(this.pos);
    this.size = 1.35;   // bien visible pour les petits
    this.F.group.rotation.y = Math.atan2(L.START.x - d.x, L.START.z - d.z) * 0.3;
    game.scene.add(this.F.group);
    this.headYaw = 0; this.near = 0; this.blinkT = 2; this.songT = 1.5; this.sing = 0; this.pop = 1;
    // les graines (posées au début de chaque merveille)
    this.fx = makeFx(d.kind, { g: game, def: d, lite: this.lite, c: this.pos.clone() });
    this.spots = this.fx.seedSpots();
    this.seedMesh = new THREE.InstancedMesh(seedGeometry(), Object.assign(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.2, emissive: 0xffa020, emissiveIntensity: 0.55 }), { userData: { keepPBR: true } }), SEEDS);
    this.seedMesh.count = 0; this.seedMesh.frustumCulled = false; this.seedMesh.userData.noOutline = true;
    game.scene.add(this.seedMesh);
    const gp = new THREE.BufferGeometry();
    gp.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SEEDS * 3), 3));
    this.seedGlow = new THREE.Points(gp, new THREE.PointsMaterial({ map: wonderGlow(), color: 0xffe6a0, size: 1.5, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false }));
    this.seedGlow.frustumCulled = false; this.seedGlow.visible = false; this.seedGlow.renderOrder = 6;
    game.scene.add(this.seedGlow);
    this.buildDom();
  }

  get active() { return this.state !== 'idle'; }
  get found() { return !!(this.g.save.wonder && this.g.save.wonder.found); }

  buildDom() {
    css();
    const root = this.g.dom.root;
    const el = (cls, html) => { const e = document.createElement('div'); e.className = cls; if (html) e.innerHTML = html; root.appendChild(e); return e; };
    this.dom = {
      swirl: el('wonder-swirl', '<div class="sw"></div>'),
      wash: el('wonder-wash', Array.from({ length: 14 }, (_, i) => `<i style="left:${(8 + (i * 37) % 86)}%;top:${(12 + (i * 53) % 76)}%;animation-delay:${(i % 7) * 0.11}s"></i>`).join('')),
      title: el('wonder-title'),
      hud: el('wonder-hud', '<div class="ring" style="--p:100">🌸</div><div><b>0/8</b><small>Graines merveille</small></div>'),
    };
    this.dom.hudB = this.dom.hud.querySelector('b');
    this.dom.ring = this.dom.hud.querySelector('.ring');
  }
  /** Un grand titre arc-en-ciel (lettres qui tombent une à une). */
  title(big, sub, small) {
    const T = this.dom.title, COLS = ['#ff4f9e', '#ff8a2a', '#ffc81e', '#3ec86a', '#2ea8ff', '#9a5aff'];
    const fs = `font-size:min(${Math.min(12, 150 / Math.max(6, big.length)).toFixed(1)}vw,104px)`;
    T.innerHTML = `<div class="w1" style="${fs}">${[...big].map((ch, i) => (ch === ' ' ? ' ' : `<span style="--i:${i};--c:${COLS[i % COLS.length]}">${ch}</span>`)).join('')}</div>${sub ? `<br><div class="w2">${sub}</div>` : ''}${small ? `<small>${small}</small>` : ''}`;
    T.classList.remove('on'); void T.offsetWidth; T.classList.add('on');
    clearTimeout(this.titleTimer);
    this.titleTimer = setTimeout(() => T.classList.remove('on'), 3500);
  }
  replay(e) { e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); }

  // ----------------------------------------------------------------- hôte / partie seule
  step(dt) {
    if (!this.def) return;
    const g = this.g;
    if (this.state === 'idle') {
      if (this.regrow > 0) { this.regrow -= dt; return; }
      const touching = g.players.find(Q => !Q.down && !Q.kart && Math.hypot(Q.pos.x - this.pos.x, Q.pos.z - this.pos.z) < 1.25 && Math.abs(Q.pos.y - this.pos.y) < 1.9);
      const anyNear = g.players.some(Q => Math.hypot(Q.pos.x - this.pos.x, Q.pos.z - this.pos.z) < 2.4);
      if (!anyNear) this.armed = true;
      if (touching && this.armed && !g.dialog && !g.cine) this.start(touching);
      return;
    }
    this.t += dt;
    this.advance(true);
    if (this.state === 'on' || this.state === 'intro') this.stepSeeds();
    if (this.state !== 'idle') this.fx.step(dt, this.onT(), true);
  }
  /** Ami : la merveille avance entre deux instantanés (les graines et la physique viennent de l'hôte). */
  guestStep(dt) {
    if (!this.def || this.state === 'idle') return;
    this.t += dt;
    this.advance(false);
    if (this.state !== 'idle') this.fx.step(dt, this.onT(), false);
  }
  /** Temps écoulé depuis le début de la merveille (pendant l'intro : négatif). */
  onT() { return this.state === 'intro' ? this.t - INTRO : this.state === 'outro' ? WONDER_TIME + this.t : this.t; }
  /** Passages d'une phase à l'autre (hôte : décide ; ami : suit l'heure locale en attendant l'instantané). */
  advance(host) {
    if (this.state === 'intro' && this.t >= INTRO) { this.state = 'on'; this.t -= INTRO; }
    else if (this.state === 'on' && this.t >= WONDER_TIME && host) this.enter('outro');
    else if (this.state === 'outro' && this.t >= OUTRO && host) this.enter('idle');
    // le monde change derrière le tourbillon / le voile (au moment où l'écran est couvert)
    if (this.state === 'intro' && !this.fxOn && this.t >= INTRO * 0.45) { this.fxOn = true; this.fx.begin(); }
    if (this.state === 'outro' && this.fxOn && this.t >= OUTRO * 0.5) { this.fxOn = false; this.fx.end(); this.afterEnd(); }
  }

  start(Q) {
    const g = this.g, s = g.save.wonder;
    this.n++;
    s.plays = (s.plays || 0) + 1;
    this.mask = 0; this.armed = false;
    this.enter('intro');
    if (Q) Q.cheerT = 1.4;
    g.persist();
  }
  /** Entrée dans une phase (chez tout le monde). */
  enter(st) {
    const g = this.g, prev = this.state;
    this.state = st; this.t = 0;
    if (st === 'intro') {
      this.replay(this.dom.swirl);
      clearTimeout(this.swirlTimer); this.swirlTimer = setTimeout(() => this.dom.swirl.classList.remove('on'), INTRO * 1000 + 100);
      this.sound('start');
      // la musique change (et revient à la fin)
      const S = g.sfx;
      if (S && S.music) { this.prevTheme = S.theme && !/^wonder/.test(S.theme) ? S.theme : (L.MUSIC || 'adv' + L.ID); S.music('wonder' + L.ID); }
      g.burst(this.pos.x, this.pos.y + 1.2, this.pos.z, 30, 0xffd6f0, 5, 1.2);
      if (g.juice) { g.juice.confetti(this.pos.x, this.pos.y + 1.4, this.pos.z, 50, 1.2); g.juice.punch(0.5); }
      this.updateHud(true);
      setTimeout(() => { if (!g.disposed && this.state !== 'idle') { this.title('Merveille !', this.def.name, this.def.sub); this.dom.hud.classList.add('on'); } }, INTRO * 550);
    } else if (st === 'outro') {
      this.replay(this.dom.wash);
      clearTimeout(this.washTimer); this.washTimer = setTimeout(() => this.dom.wash.classList.remove('on'), OUTRO * 1000 + 100);
      this.sound('end');
      this.dom.hud.classList.remove('on', 'hurry');
    } else if (st === 'idle') {
      this.regrow = REGROW; this.pop = 0;
      if (this.fxOn) { this.fxOn = false; this.fx.end(); this.afterEnd(); }
      this.seedMesh.count = 0; this.seedGlow.visible = false;
      this.dom.hud.classList.remove('on', 'hurry');
      void prev;
    }
  }
  /** Tout redevient comme avant : la musique du monde revient, pluie d'étincelles. */
  afterEnd() {
    const g = this.g, S = g.sfx;
    if (S && S.music && (!S.theme || /^wonder/.test(S.theme))) S.music(this.prevTheme || L.MUSIC || 'adv' + L.ID);
    const me = g.me;
    if (g.juice) for (let i = 0; i < 4; i++) g.juice.sparkle(me.pos.x + (Math.random() - 0.5) * 6, me.pos.y + 1.5, me.pos.z + (Math.random() - 0.5) * 6, 14, 0xfff0b0, 2.5);
    const left = SEEDS - this.count();
    if (left === 0) g.localBanner('Merveilleux !', 'Tout redevient comme avant… La fleur repousse déjà.', 2600);
    else g.localBanner('Tout redevient comme avant…', `Graines merveille : ${SEEDS - left}/${SEEDS} — touche encore la fleur pour rejouer !`, 3200);
  }
  count() { let n = 0; for (let i = 0; i < SEEDS; i++) if (this.mask & (1 << i)) n++; return n; }

  stepSeeds() {
    const g = this.g;
    if (this.state === 'intro' && this.t < INTRO * 0.5) return;
    for (let i = 0; i < this.spots.length; i++) {
      if (this.mask & (1 << i)) continue;
      const sp = this.spots[i];
      for (const Q of g.players) {
        if (Q.down) continue;
        const dx = Q.pos.x - sp.x, dz = Q.pos.z - sp.z, dy = sp.y - (Q.pos.y + 0.6);
        if (dx * dx + dz * dz < 1.6 && Math.abs(dy) < 1.5) { this.take(i, Q); break; }
      }
    }
  }
  take(i, Q) {
    const g = this.g, s = g.save.wonder;
    this.mask |= 1 << i;
    const n = this.count();
    s.seeds = Math.max(s.seeds || 0, n);
    this.popSeed(i, n);
    if (Q) Q.cheerT = 0.6;
    if (n === SEEDS) this.complete(Q);
    else g.persist();
  }
  popSeed(i, n) {
    const g = this.g, sp = this.spots[i];
    if (g.juice) { g.juice.pop(sp.x, sp.y, sp.z, 0xffd23a, n); g.juice.sparkle(sp.x, sp.y, sp.z, 8, 0xffb8e8, 0.6); }
    const S = g.sfx;
    if (S && S.ok) { const PENT = [0, 2, 4, 7, 9, 12, 14, 16]; if (S.pickup) S.pickup(76 + PENT[Math.min(7, n - 1)], n); }
    this.updateHud(true);
    this.dom.hud.classList.remove('got'); void this.dom.hud.offsetWidth; this.dom.hud.classList.add('got');
  }
  /** La dernière graine : la Fleur Merveille du monde est trouvée (une seule fois). */
  complete(Q) {
    const g = this.g, s = g.save.wonder;
    const first = !s.found;
    s.found = true;
    addFound(L.ID);
    g.persist();
    this.celebrate(first);
    void Q;
  }
  celebrate(first) {
    const g = this.g, me = g.me;
    this.sound('found');
    if (g.juice) { g.juice.confetti(me.pos.x, me.pos.y + 2, me.pos.z, 70, 1.4); if (g.juice.edge) g.juice.edge(); g.juice.punch(0.6); }
    const n = new Set([...foundWorlds(), ...(this.found ? [L.ID] : [])]).size;
    this.title(first ? 'Fleur Merveille !' : 'Toutes les graines !', first ? `Fleurs Merveille trouvées : ${n}/8` : 'Bravo, chasseurs de merveilles !', first ? 'Elle est rangée dans ton album.' : '');
  }

  updateHud(force) {
    const n = this.count(), left = this.state === 'on' ? Math.max(0, WONDER_TIME - this.t) : this.state === 'intro' ? WONDER_TIME : 0;
    const p = Math.round(left / WONDER_TIME * 100);
    if (force || p !== this.hudP || n !== this.hudN) {
      this.hudP = p; this.hudN = n;
      this.dom.hudB.textContent = `${n}/${SEEDS}`;
      this.dom.ring.style.setProperty('--p', p);
      this.dom.hud.classList.toggle('hurry', this.state === 'on' && left < 6);
    }
  }

  // ----------------------------------------------------------------- physique (hôte), via game.js
  /** Le chien est emporté par la merveille (toboggan arc-en-ciel…) : true = game.js ne le fait pas bouger. */
  playerStep(P, dt) { return this.fxOn && this.fx.playerStep ? this.fx.playerStep(P, dt) : false; }
  /** Plates-formes de la merveille (champignons géants…) sous les pattes. */
  support(x, z, y, s) { if (this.fxOn && this.fx.support) this.fx.support(x, z, y, s); }

  // ----------------------------------------------------------------- monde partagé
  snapshot() { return [ST.indexOf(this.state), Math.round(this.t * 10) / 10, this.mask, this.n]; }
  apply(a) {
    if (!this.def || !Array.isArray(a)) return;
    const st = ST[a[0]] || 'idle', n = a[3] | 0;
    if (n !== this.n) {
      // une nouvelle merveille vient de commencer chez l'hôte
      this.n = n;
      if (st !== 'idle') { if (this.fxOn) { this.fxOn = false; this.fx.end(); } this.mask = 0; this.enter('intro'); }
    }
    if (st !== this.state) {
      if (st === 'idle' || st === 'outro') this.enter(st);
      else if (st === 'on') { if (this.state === 'idle') { this.mask = 0; this.enter('intro'); } this.state = 'on'; }
      else if (this.state === 'idle') { this.mask = 0; this.enter('intro'); }
    }
    // l'heure de l'hôte (on corrige doucement les petits écarts)
    if (Math.abs(a[1] - this.t) > 0.6) this.t = a[1];
    if (this.state === 'on' && !this.fxOn) { this.fxOn = true; this.fx.begin(); }
    const mask = a[2] | 0;
    if (mask !== this.mask) {
      const was = this.mask;
      this.mask = mask;
      for (let i = 0; i < SEEDS; i++) if ((mask & (1 << i)) && !(was & (1 << i))) this.popSeed(i, this.count());
      if (this.count() === SEEDS && was !== mask) {
        // l'ami a vu la dernière graine : la fleur va aussi dans SA collection
        const first = addFound(L.ID);
        this.celebrate(first);
      }
    }
  }

  // ----------------------------------------------------------------- sons
  sound(name) {
    const S = this.g.sfx;
    if (!S || !S.ok) return;
    if (name === 'start') {
      // glissando de harpe qui monte, accord de clochettes, souffle magique
      const PENT = [0, 2, 4, 7, 9];
      for (let i = 0; i < 15; i++) S.note('pluck', 60 + PENT[i % 5] + 12 * Math.floor(i / 5), 0.07, i * 0.035, 0.3);
      [79, 83, 86, 91].forEach((m, i) => S.note('bell', m, 0.09, 0.5 + i * 0.07, 1.2));
      if (S.whoosh) S.whoosh(0.9, { lo: 300, hi: 3200, vol: 0.12, q: 0.8 });
      S.tone(220, 1.1, { type: 'sine', to: 880, vol: 0.05 });
    } else if (name === 'end') {
      const PENT = [24, 21, 19, 16, 14, 12, 9, 7, 4, 2, 0];
      PENT.forEach((d, i) => S.note('bell', 67 + d, 0.06 * (1 - i / 14), i * 0.06, 0.5));
      if (S.whoosh) S.whoosh(1.2, { lo: 2600, hi: 400, vol: 0.08, q: 0.7 });
    } else if (name === 'found') {
      if (S.stinger) S.stinger('medal');
      if (S.fanfare) S.fanfare();
      if (S.sparkle) S.sparkle(84, 9, 0.05);
    }
  }
  /** La petite mélodie scintillante de la fleur (chaque écran, pour son propre chien). */
  melody(d) {
    const S = this.g.sfx;
    if (!S || !S.ok) return;
    const v = clamp(1.25 - d / 16, 0.12, 1);
    const PHR = [[79, 0], [83, 0.18], [86, 0.36], [91, 0.54], [88, 0.9], [86, 1.08]];
    const alt = (this.songN = (this.songN || 0) + 1) % 2;
    for (const [m, at] of PHR) {
      const mm = alt && m === 91 ? 93 : m;
      S.note('bell', mm, 0.06 * v, at, 0.55);
      S.note('flute', mm - 12, 0.025 * v, at + 0.01, 0.3);
    }
    S.tone(2800, 0.5, { type: 'sine', to: 3600, vol: 0.006 * v, delay: 0.9 });
    this.singAt = this.g.t;
  }

  // ----------------------------------------------------------------- rendu (chaque écran)
  render(dt) {
    if (!this.def) return;
    const g = this.g, t = g.t, F = this.F, U = F.U, me = g.me;
    U.uTime.value = t;
    // la fleur : elle se cache pendant la merveille (elle « devient » la merveille), puis repousse
    const hidden = this.state === 'on' || (this.state === 'intro' && this.t > 0.25) || (this.state === 'outro' && this.t < OUTRO * 0.5);
    this.pop = hidden ? Math.max(0, this.pop - dt * 6) : Math.min(1, this.pop + dt * (this.regrow > 0 ? 0.45 : 2.5));
    const k = this.pop, sc = k <= 0 ? 0 : (k < 1 ? 1 + Math.sin(k * Math.PI) * 0.25 : 1) * sst(0, 0.7, k);
    F.group.visible = sc > 0.01 && g.camera.position.distanceTo(this.pos) < 140;
    if (F.group.visible) {
      F.group.scale.setScalar(sc * this.size);
      const d = Math.hypot(me.pos.x - this.pos.x, me.pos.z - this.pos.z);
      this.near = ease(this.near, d < 9 ? 1 : 0, Math.min(1, dt * 2));
      // la mélodie (de plus en plus fort en approchant)
      if (this.state === 'idle' && this.regrow <= 0 && d < 18) {
        this.songT -= dt;
        if (this.songT <= 0) { this.songT = d < 7 ? 2.8 : 3.6; this.melody(d); }
      }
      const since = t - (this.singAt === undefined ? -9 : this.singAt);
      this.sing = since < 1.5 ? Math.max(0, Math.sin(since * Math.PI * 5.5)) * (1 - since / 1.5) : 0;
      U.uSing.value = this.sing; U.uGlow.value = this.near;
      // la tête se tourne vers le chien qui approche, se balance doucement, sautille quand elle chante
      const toMe = Math.atan2(me.pos.x - this.pos.x, me.pos.z - this.pos.z) - F.group.rotation.y;
      this.headYaw = lerpAngle(this.headYaw, this.near > 0.2 ? toMe : Math.sin(t * 0.4) * 0.8, Math.min(1, dt * 2));
      F.head.rotation.set(Math.sin(t * 1.3) * 0.06 - this.near * 0.15, this.headYaw, Math.sin(t * 0.9) * 0.1);
      F.head.position.y = 1.12 + Math.sin(t * 2) * 0.015 + this.sing * 0.04;
      F.group.rotation.z = Math.sin(t * 0.8) * 0.03;
      // clignement des yeux
      this.blinkT -= dt;
      const bl = this.blinkT < 0 ? 0.1 : 1;
      if (this.blinkT < -0.12) this.blinkT = 2 + Math.random() * 3;
      F.eyes.scale.set(1, 1, this.sing > 0.5 ? 0.4 : bl);   // yeux plissés de bonheur quand elle chante
      F.halo.material.opacity = (0.4 + 0.2 * Math.sin(t * 2.2) + this.near * 0.15 + this.sing * 0.3) * sc;
      const hs = 2.2 + this.near * 0.6 + this.sing * 0.6;
      F.halo.scale.set(hs, hs, 1);
      // étincelles qui montent (on la repère de loin) ; petites notes quand elle chante
      if (Math.random() < dt * (3 + this.near * 5)) {
        const a = Math.random() * TAU, r = 0.25 + Math.random() * 0.6;
        g.spawnParticle(this.pos.x + Math.cos(a) * r, this.pos.y + 0.3 + Math.random() * 1.2, this.pos.z + Math.sin(a) * r, 0, 0.5 + Math.random() * 0.6, 0, Math.random() < 0.5 ? 0xffd6f0 : 0xfff0a0, 0.11 + Math.random() * 0.08, 1.4, -0.15, 5);
      }
      if (this.sing > 0.6 && Math.random() < dt * 12) g.spawnParticle(this.pos.x, this.pos.y + 1.3, this.pos.z, (Math.random() - 0.5) * 1.5, 1.4, (Math.random() - 0.5) * 1.5, [0xff7ab8, 0xffd23a, 0x7ad8ff, 0xb48aff][Math.floor(Math.random() * 4)], 0.16, 0.9, 0.5, 1);
    }
    this.renderSeeds(dt, t);
    if (this.state !== 'idle') {
      this.updateHud(false);
      // intensité de la merveille : monte derrière le tourbillon, retombe derrière le voile
      const kk = this.state === 'intro' ? sst(INTRO * 0.35, INTRO * 0.6, this.t) : this.state === 'outro' ? 1 - sst(OUTRO * 0.3, OUTRO * 0.55, this.t) : 1;
      if (this.fxOn) this.fx.render(dt, this.onT(), kk);
    }
  }
  renderSeeds(dt, t) {
    const show = this.fxOn && (this.state === 'on' || this.state === 'intro');
    const M = this.seedMesh;
    if (!show) { M.count = 0; this.seedGlow.visible = false; return; }
    const m4 = this._m4 || (this._m4 = new THREE.Matrix4()), q = this._q || (this._q = new THREE.Quaternion()), s = this._s || (this._s = new THREE.Vector3());
    const gp = this.seedGlow.geometry.attributes.position;
    let n = 0;
    const grow = this.state === 'intro' ? sst(INTRO * 0.5, INTRO, this.t) : 1;
    for (let i = 0; i < this.spots.length; i++) {
      if (this.mask & (1 << i)) continue;
      const sp = this.spots[i], bob = Math.sin(t * 2.4 + i * 1.3) * 0.12;
      q.setFromAxisAngle(_v.set(0, 1, 0), t * 2.2 + i);
      const k = grow * (1 + Math.sin(t * 6 + i) * 0.06) * 1.25;
      m4.compose(_v.set(sp.x, sp.y + bob, sp.z), q, s.set(k, k, k));
      M.setMatrixAt(n, m4);
      gp.setXYZ(n, sp.x, sp.y + bob, sp.z);
      n++;
      if (Math.random() < dt * 2.5) this.g.spawnParticle(sp.x + (Math.random() - 0.5) * 0.4, sp.y + bob, sp.z + (Math.random() - 0.5) * 0.4, 0, 0.9, 0, 0xfff0a0, 0.1, 0.8, -0.2, 5);
    }
    M.count = n; M.instanceMatrix.needsUpdate = true;
    gp.needsUpdate = true; this.seedGlow.geometry.setDrawRange(0, n);
    this.seedGlow.visible = n > 0;
    this.seedGlow.material.size = 1.4 + Math.sin(t * 3) * 0.15;
  }

  // ----------------------------------------------------------------- pause
  pauseLine() {
    if (!this.def) return '';
    const s = this.g.save.wonder || {}, all = new Set([...foundWorlds(), ...(s.found ? [L.ID] : [])]).size;
    return s.found
      ? `🌸 Fleur Merveille trouvée ! (graines ${Math.max(s.seeds || 0, SEEDS)}/${SEEDS}) · Fleurs Merveille : ${all}/8`
      : `🌸 Fleur Merveille : ${s.plays ? `graines ${s.seeds || 0}/${SEEDS} — ramasse-les toutes pendant la merveille !` : 'pas encore trouvée… écoute sa petite mélodie !'} · ${all}/8`;
  }
  dispose() {
    if (!this.def) return;
    if (this.fxOn) { this.fxOn = false; try { this.fx.end(); } catch (e) { /* ignore */ } }
    try { this.fx.dispose(); } catch (e) { /* ignore */ }
    clearTimeout(this.titleTimer); clearTimeout(this.swirlTimer); clearTimeout(this.washTimer);
  }
}
