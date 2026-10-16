/*
 * Matcha & Ainu — Niveau 5 « La Station des Neiges » : décor et règles du niveau
 * (sol enneigé, sapins, village de chalets, patinoire et course contre Pingo, jardin des
 * bonshommes de neige, rivière et lac gelés, pingouins, renard, Crevasse de Cristal,
 * Cascade Gelée, télésiège, Grande Glissade en luge pilotable, Fort Moustache et sa
 * bataille de boules de neige, Bernard le sauveteur et Myrtille, l'amie de Mamie).
 * Le moteur commun est dans game.js.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as M from './models.js';
import * as W from './world.js';
import * as N from './npcs.js';
import * as RT from './realtex.js';
import { buildCaptain } from './forest.js';
import { buildLife } from './life.js';
import * as FOL from './foliage.js';
import * as LIFE from './level5life.js';
import * as SA from './snowart.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
const wrapA = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Flocon doré (les 100 objets à ramasser du niveau). */
export function flakeGeometry() {
  const s = new THREE.Shape();
  const P = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 2, b = a + Math.PI / 6;
    P.push([Math.cos(a) * 0.3, Math.sin(a) * 0.3], [Math.cos(a + 0.22) * 0.13, Math.sin(a + 0.22) * 0.13], [Math.cos(b) * 0.17, Math.sin(b) * 0.17], [Math.cos(b + 0.3) * 0.13, Math.sin(b + 0.3) * 0.13]);
  }
  P.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 1 });
  g.center();
  return g;
}

/** Couleur uniforme (ou calculée) par sommet. */
function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    if (typeof color === 'function') color(c, g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i));
    else c.set(color);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
/** Fusionne des géométries (position, normale, couleur et uv quand toutes en ont). */
function merge(list) {
  const geos = list.map(({ geo, x, y, z, rx, ry, rz, sx, sy, sz }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')), new THREE.Vector3(sx || 1, sy || sx || 1, sz || sx || 1)));
    return g;
  });
  const out = new THREE.BufferGeometry();
  for (const [name, k] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2]]) {
    if (!geos.every(g => g.attributes[name])) continue;
    let n = 0; for (const g of geos) n += g.attributes[name].count;
    const a = new Float32Array(n * k); let o = 0;
    for (const g of geos) { a.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(a, k));
  }
  return out;
}
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}
/** Grain de la neige : douces bosses et quelques paillettes. */
function snowTexture() {
  return canvasTex(256, 256, (x, w, h) => {
    const r = rng(17);
    x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 520; i++) {
      const px = r() * w, py = r() * h, rad = 4 + r() * 16, v = 222 + Math.floor(r() * 33);
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, `rgba(${v},${v},${Math.min(255, v + 6)},0.55)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill();
    }
    for (let i = 0; i < 260; i++) { x.fillStyle = r() < 0.5 ? '#ffffff' : '#dfe6f2'; x.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
  }, 1);
}
/** Rondins de bois (murs des chalets). */
function logTexture() {
  return canvasTex(128, 128, (x, w, h) => {
    const r = rng(5);
    x.fillStyle = '#e8d2b4'; x.fillRect(0, 0, w, h);
    for (let j = 0; j < 8; j++) {
      const y = j * 16;
      const g = x.createLinearGradient(0, y, 0, y + 16);
      g.addColorStop(0, '#f4e2c8'); g.addColorStop(0.55, '#e0c8a4'); g.addColorStop(1, '#a88a68');
      x.fillStyle = g; x.fillRect(0, y, w, 16);
      for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(120,90,60,0.25)'; x.fillRect(r() * w, y + 4 + r() * 8, 10 + r() * 30, 1); }
    }
  }, 1);
}
/** Glace rayée par les patins. */
function iceTexture() {
  return canvasTex(512, 512, (x, w, h) => {
    const r = rng(41);
    x.fillStyle = '#dfeffa'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const px = r() * w, py = r() * h, rad = 30 + r() * 90; const g = x.createRadialGradient(px, py, 0, px, py, rad); g.addColorStop(0, 'rgba(160,205,235,0.35)'); g.addColorStop(1, 'rgba(160,205,235,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
    x.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      x.strokeStyle = `rgba(255,255,255,${0.35 + r() * 0.4})`; x.lineWidth = 1 + r() * 1.5;
      const cx = r() * w, cy = r() * h, rad = 40 + r() * 160, a0 = r() * 6.3;
      x.beginPath(); x.arc(cx, cy, rad, a0, a0 + 0.4 + r() * 1.2); x.stroke();
    }
    for (let i = 0; i < 14; i++) {
      x.strokeStyle = 'rgba(120,170,210,0.4)'; x.lineWidth = 1;
      let px = r() * w, py = r() * h; x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 5; k++) { px += (r() - 0.5) * 60; py += (r() - 0.5) * 60; x.lineTo(px, py); }
      x.stroke();
    }
  }, 1);
}
function textTex(lines, opts) {
  opts = opts || {};
  return canvasTex(512, 160, (x, w, h) => {
    x.fillStyle = opts.bg || '#7a3a22'; x.beginPath(); x.roundRect(6, 6, w - 12, h - 12, 26); x.fill();
    x.strokeStyle = opts.edge || '#fff2d8'; x.lineWidth = 8; x.stroke();
    if (opts.checker) { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(16 + i * 30, j === 0 ? 14 : h - 34, 30, 20); } }
    x.fillStyle = opts.color || '#fff6e0'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 ${opts.size || 64}px Fredoka, "Arial Rounded MT Bold", Arial, sans-serif`;
    x.fillText(lines, w / 2, h / 2 + 4);
  });
}

// ---------------------------------------------------------------------------
// Petits modèles
// ---------------------------------------------------------------------------
/** Sapin enneigé : tronc, trois étages de branches, neige sur chaque étage. */
function pineGeometry(lite) {
  const seg = lite ? 7 : 10, parts = [];
  parts.push({ geo: paint(new THREE.CylinderGeometry(0.16, 0.26, 1.6, 6), 0x5a3a24), y: 0.8 });
  const greens = [0x24503a, 0x2a5c40, 0x316848];
  for (let i = 0; i < 3; i++) {
    const r = 2.1 - i * 0.55, h = 2.5 - i * 0.3, y0 = 1.1 + i * 1.45;
    parts.push({ geo: paint(new THREE.ConeGeometry(r, h, seg), greens[i]), y: y0 + h / 2 });
    const sh = h * 0.5;
    parts.push({ geo: paint(new THREE.ConeGeometry(r * 0.5 * 1.08, sh, seg), 0xf2f6fc), y: y0 + h + 0.03 - sh / 2 });
    // neige au bord des branches (une couronne irrégulière)
    const rim = new THREE.CylinderGeometry(r * 0.98, r * 1.02, 0.12, seg, 1, true);
    parts.push({ geo: paint(rim, 0xe8eef8), y: y0 + 0.06 });
  }
  return merge(parts);
}
/** Luge en bois rouge. */
function buildSled() {
  const g = new THREE.Group();
  const wood = M.mat(0xd8402e, { roughness: 0.6 }), dark = M.mat(0x3a2a24, { roughness: 0.5, metalness: 0.4 });
  for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 0.3), wood); s.position.set(0, 0.28, -0.6 + i * 0.36); g.add(s); }
  for (const sx of [-1, 1]) {
    const run = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.7), dark); run.position.set(sx * 0.36, 0.04, 0); g.add(run);
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 6, 10, Math.PI), dark); curl.rotation.y = Math.PI / 2; curl.position.set(sx * 0.36, 0.21, 0.85); g.add(curl);
    for (const z of [-0.5, 0.4]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), wood); leg.position.set(sx * 0.36, 0.16, z); g.add(leg); }
  }
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 4, 12, Math.PI), M.mat(0xe8d8a0)); rope.rotation.x = -Math.PI / 2 + 0.4; rope.position.set(0, 0.3, 0.92); g.add(rope);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
/** Bonnet à pompon. */
function buildBonnet(color) {
  const g = new THREE.Group();
  const knit = M.mat(color, { roughness: 0.95 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), knit); cap.scale.set(1, 1.15, 1); g.add(cap);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.07, 8, 20), M.mat(0xffffff, { roughness: 1 })); band.rotation.x = Math.PI / 2; band.position.y = 0.03; g.add(band);
  const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), M.mat(0xffffff, { roughness: 1 })); pom.position.y = 0.38; g.add(pom);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
/** Petit accessoire posé devant le poitrail d'un personnage (d'après sa forme). */
function chestOf(m) {
  m.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(m);
  return { y: b.min.y + (b.max.y - b.min.y) * 0.48, z: b.max.z * 0.62, h: b.max.y - b.min.y };
}
/** Bernard, le Saint-Bernard sauveteur (avec son tonnelet). */
function buildBernard() {
  let m;
  if (W.LOOK.real && N.hasNpc('shiba')) { m = N.buildNpc('shiba', { tint: 0xfff4ec, scale: 1.55 }); const u = m.userData; u.mhead = u.head; u.mtail = u.tail; }
  else m = M.buildPug({ fur: 0xf6eee2, mask: 0x9a4a1e, belly: 0xffffff, collar: 0xd83a3a, scale: 1.95 });
  const c = chestOf(m);
  const keg = new THREE.Group();
  const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 14), M.mat(0xb07840, { roughness: 0.8 })); wood.rotation.z = Math.PI / 2; keg.add(wood);
  for (const x of [-0.1, 0.1]) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.018, 6, 16), M.mat(0x4a4a50, { metalness: 0.6, roughness: 0.4 })); band.rotation.y = Math.PI / 2; band.position.x = x; keg.add(band); }
  keg.position.set(0, c.y - c.h * 0.06, c.z + 0.05);
  m.add(keg);
  // brassard de sauveteur (croix rouge)
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (x) => { x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#e02a2a'; x.fillRect(24, 8, 16, 48); x.fillRect(8, 24, 48, 16); }) }));
  cross.position.set(0.02, c.y + c.h * 0.05, c.z + 0.2); m.add(cross);
  m.userData.height = m.userData.height || c.h;
  return m;
}
/** Myrtille, la vieille amie de Mamie (écharpe tricotée). */
function buildMyrtille() {
  let m;
  if (W.LOOK.real && N.hasNpc('bouledogue')) { m = N.buildNpc('bouledogue', { tint: 0xf4e4ec }); const u = m.userData; u.mhead = u.head; u.mtail = u.tail; }
  else m = M.buildYorkie({ bow: 0xd04a8a, steel: 0x9a8a9a, tan: 0xf2d6b8, scale: 1.7 });
  const c = chestOf(m);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(c.h * 0.17, c.h * 0.05, 8, 20), M.mat(0x8a4ac8, { roughness: 1 }));
  scarf.rotation.x = Math.PI / 2 - 0.4; scarf.position.set(0, c.y + c.h * 0.18, c.z * 0.55); m.add(scarf);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(c.h * 0.08, c.h * 0.28, c.h * 0.03), M.mat(0x8a4ac8, { roughness: 1 }));
  tail.position.set(c.h * 0.08, c.y, c.z * 0.55 + c.h * 0.1); tail.rotation.z = 0.2; m.add(tail);
  m.userData.height = m.userData.height || c.h;
  return m;
}
function glowSprite(color, size, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTexture(), color, transparent: true, opacity: opacity === undefined ? 0.7 : opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1); s.userData.noOutline = true;
  return s;
}
function flagTexture() {
  return canvasTex(128, 64, (x) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#3a8ae0'; x.fillRect(0, 0, 128, 10); x.fillRect(0, 54, 128, 10);
    x.fillStyle = '#3a8ae0';
    // un flocon
    x.strokeStyle = '#3a8ae0'; x.lineWidth = 5; x.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; x.beginPath(); x.moveTo(64 - Math.cos(a) * 18, 32 - Math.sin(a) * 18); x.lineTo(64 + Math.cos(a) * 18, 32 + Math.sin(a) * 18); x.stroke(); }
  });
}

/** Pingouin : corps noir, ventre blanc, bec et pattes orange. */
function buildPenguin(scale, extra) {
  const g = new THREE.Group();
  const black = M.mat(0x23262e, { roughness: 0.6 }), white = M.mat(0xf6f6f2, { roughness: 0.7 }), orange = M.mat(0xf0962a, { roughness: 0.5 });
  const body = new THREE.Group(); g.add(body);
  const back = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), black); back.scale.set(1, 1.35, 0.9); back.position.y = 0.6; body.add(back);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12), white); belly.scale.set(0.95, 1.25, 0.7); belly.position.set(0, 0.56, 0.14); body.add(belly);
  const head = new THREE.Group(); head.position.y = 1.15; body.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), black); head.add(skull);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), white); face.scale.set(1, 0.85, 0.6); face.position.set(0, -0.03, 0.12); head.add(face);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.22, 8), orange); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.04, 0.32); head.add(beak);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M.mat(0x111111, { roughness: 0.2 })); eye.position.set(sx * 0.1, 0.05, 0.24); head.add(eye);
    const shine = new THREE.Mesh(new THREE.SphereGeometry(0.015, 6, 4), M.mat(0xffffff)); shine.position.set(sx * 0.1 + 0.015, 0.07, 0.28); head.add(shine);
  }
  const wings = [-1, 1].map(sx => {
    const w = new THREE.Group(); w.position.set(sx * 0.4, 0.82, 0); body.add(w);
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), black); f.scale.set(0.35, 1.6, 0.8); f.position.y = -0.22; w.add(f);
    return w;
  });
  const feet = [-1, 1].map(sx => { const f = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), orange); f.scale.set(1, 0.4, 1.6); f.position.set(sx * 0.15, 0.03, 0.08); g.add(f); return f; });
  if (extra === 'scarf') { const s = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.07, 8, 18), M.mat(0xe0303a, { roughness: 1 })); s.rotation.x = Math.PI / 2; s.position.y = 0.92; body.add(s); }
  if (extra === 'bow') { const b = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.035, 6, 12), M.mat(0xff6ab0)); b.position.set(0.12, 0.24, 0.05); b.rotation.y = Math.PI / 2; head.add(b); }
  g.scale.setScalar(scale);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { body, head, wings, feet, height: 1.45 * scale, mhead: head };
  return g;
}
/** Renard roux : museau pointu, oreilles noires, grosse queue au bout blanc. */
function buildFox() {
  const g = new THREE.Group();
  const red = M.mat(0xd8641e, { roughness: 0.8 }), white = M.mat(0xfaf2e6, { roughness: 0.8 }), dark = M.mat(0x2a1a14, { roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.6, 6, 12), red); body.rotation.x = Math.PI / 2; body.position.y = 0.55; g.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), white); chest.position.set(0, 0.52, 0.34); chest.scale.set(1, 1.1, 0.8); g.add(chest);
  const head = new THREE.Group(); head.position.set(0, 0.86, 0.5); g.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), red); head.add(skull);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.34, 10), white); snout.rotation.x = Math.PI / 2; snout.position.set(0, -0.05, 0.26); head.add(snout);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), dark); nose.position.set(0, -0.05, 0.43); head.add(nose);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.24, 6), dark); ear.position.set(sx * 0.12, 0.22, -0.02); ear.rotation.z = -sx * 0.25; head.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), dark); eye.position.set(sx * 0.09, 0.05, 0.17); head.add(eye);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.62, -0.5); g.add(tail);
  const brush = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), red); brush.scale.set(1, 1, 2.6); brush.position.set(0, 0.08, -0.42); tail.add(brush);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), white); tip.position.set(0, 0.1, -0.92); tail.add(tip);
  const legs = [[-0.13, 0.3], [0.13, 0.3], [-0.13, -0.3], [0.13, -0.3]].map(([x, z]) => {
    const l = new THREE.Group(); l.position.set(x, 0.42, z); g.add(l);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.28, 4, 8), dark); m.position.y = -0.2; l.add(m);
    return l;
  });
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.userData = { head, tail, legs, height: 1.1 };
  return g;
}
/** Boule de neige (bonhomme) : une sphère un peu bosselée. */
function snowballGeo() {
  const g = new THREE.IcosahedronGeometry(1, 3), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 1 + Math.sin(p.getX(i) * 7 + p.getY(i) * 5) * 0.03; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
  g.computeVertexNormals();
  return g;
}

// ===========================================================================
export function buildSnow(game) {
  const sc = game.scene, S = L, lite = game.lite;
  const moving = [], chars = [];
  const save = () => game.save;
  const snow = () => {
    const s = save(); if (!s.snow) s.snow = {}; const k = s.snow;
    if (!k.bonnets) k.bonnets = []; if (!k.flags) k.flags = []; if (!k.placed) k.placed = []; if (k.cp === undefined) k.cp = 0;
    return k;
  };
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9 }, o || {}));
  const real = W.LOOK.real;
  // matières photographiées de la neige et de la roche (style réaliste) : sinon, l'ancien rendu
  const art = real && SA.ready();
  if (art) {
    SA.setSun(W.SKY.sunDir);
    // lumière d'hiver : brume froide et claire, soleil blanc doré, ombres bleues (le ciel et la
    // neige éclairent les ombres)
    if (sc.fog) sc.fog.color.setRGB(0.79, 0.86, 0.95, THREE.SRGBColorSpace);
    const hemi = sc.children.find(o => o.isHemisphereLight);
    if (hemi) { hemi.color.set(0xd4e4ff); hemi.groundColor.set(0xbccbe6); hemi.intensity *= 1.2; }
    if (game.sun) game.sun.color.set(0xfff0dc);
    if (sc.environment) sc.environmentIntensity = 0.72;
  }
  const snowTex = snowTexture();
  const snowNormal = real ? RT.normalFor(snowTex, 1.2) : null;
  // décor par quartier : on le cache quand on est loin (le monde est grand)
  const cull = [];
  const area = (x, z, r) => { const g = new THREE.Group(); sc.add(g); cull.push({ obj: g, x, z, r: r || 30 }); return g; };

  // --- le sol enneigé ------------------------------------------------------------------
  {
    const size = S.WORLD, seg = lite ? 210 : 320;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, S.heightAt(x, z) - (S.iceAt(x, z) ? 0.4 : 0));
      // au-delà de la corniche (hors d'atteinte) : de vraies arêtes, rien qu'à l'image
      if (art) { const e = Math.pow(x ** 4 + z ** 4, 0.25); if (e > 195) pos.setY(i, pos.getY(i) + Math.pow(SA.ridged(x * 0.028 + 7, z * 0.028, 5), 1.5) * 34 * smooth(195, 212, e)); }
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    const SNOW = new THREE.Color(0.93, 0.955, 0.99), SHADE = new THREE.Color(0.76, 0.84, 0.96), ROCK = new THREE.Color(0.42, 0.42, 0.47), ROCK2 = new THREE.Color(0.55, 0.53, 0.55);
    const PATH = new THREE.Color(0.84, 0.86, 0.9), RUNC = new THREE.Color(0.82, 0.9, 1.0), DEEP = new THREE.Color(0.3, 0.44, 0.58);
    const pathD = (x, z) => {
      let best = 1e9;
      for (const [[ax, az], [bx, bz]] of S.SNOW_PATHS) { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = clamp(((x - ax) * dx + (z - az) * dz) / l, 0, 1); best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz)); }
      return best;
    };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), ny = nrm.getY(i);
      const n = Math.sin(x * 0.31 + Math.sin(z * 0.17) * 2) * 0.5 + Math.sin(z * 0.23 + Math.cos(x * 0.13) * 2) * 0.5;
      c.copy(SNOW).lerp(SHADE, smooth(0.985, 0.88, ny) * 0.75 + (n * 0.5 + 0.5) * 0.08);
      c.lerp(PATH, (1 - smooth(1.2, 2.6, pathD(x, z))) * 0.7);
      const ri = S.runInfo(x, z);
      c.lerp(RUNC, (1 - smooth(1.5, S.RUN_W, ri.d)) * 0.6);
      if (!art) c.lerp(n > 0 ? ROCK : ROCK2, smooth(0.66, 0.42, ny) * smooth(9, 18, pos.getY(i) - 2) * (0.65 + 0.35 * n));   // (sinon : la roche est dans le shader)
      if (S.iceAt(x, z)) c.copy(DEEP);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const tex = snowTex.clone(); tex.needsUpdate = true; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(size / 5, size / 5);
    let nm = null;
    if (snowNormal) { nm = snowNormal.clone(); nm.needsUpdate = true; nm.wrapS = nm.wrapT = THREE.RepeatWrapping; nm.repeat.set(size / 5, size / 5); }
    let gm;
    if (art) {
      // neige photographiée (relief seulement : la couleur reste celle, propre, des sommets)
      gm = SA.patchGround(std({ vertexColors: true, roughness: 0.78 }), { rockScale: 0.09, slope: [0.3, 0.5], height: [5.5, 10], sparkle: 9, snowN: 0.7 });
    } else gm = std({ vertexColors: true, map: tex, normalMap: nm, roughness: 0.82 });
    const m = new THREE.Mesh(geo, gm);
    m.name = 'terrain'; m.receiveShadow = true;
    sc.add(m);
  }

  // --- les chaînes de montagnes lointaines (remplacent le panorama commun) ---------------------
  const ranges = art ? SA.buildRanges(sc, { lite, hazeColor: sc.fog.color }) : [];
  /** Une fois le monde complet (game.js ajoute ciel et panorama après nous) : on l'habille pour l'hiver. */
  function dressSky() {
    if (!ranges.length) return;
    // le panorama commun (cônes bleutés) laisse la place aux vraies montagnes ; les nuages
    // peints aussi quand le ciel est photographié (il a déjà ses nuages)
    const vg = game.vista && game.vista.group;
    if (vg) vg.visible = false;
    if (game.photoSky && game.clouds) for (const c of game.clouds) c.visible = false;
  }

  // --- la glace : lac, rivière, patinoire, mare de la cascade ---------------------------------
  const iceMat = std({ map: iceTexture(), color: 0xd4ecfa, roughness: 0.12, metalness: 0.05 });
  const flatUV = (g, k) => { const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / k, p.getZ(i) / k); return g; };
  {
    const LK = S.LAKE;
    const lake = new THREE.Mesh(flatUV(new THREE.RingGeometry(LK.islet - 0.2, LK.r + 0.6, 72, 2).rotateX(-Math.PI / 2), 18), iceMat);
    lake.position.set(LK.x, LK.y + 0.015, LK.z); lake.receiveShadow = true; sc.add(lake);
    const FP = S.FALLS_POOL;
    const pool = new THREE.Mesh(flatUV(new THREE.CircleGeometry(FP.r + 0.3, 32).rotateX(-Math.PI / 2), 18), iceMat);
    pool.position.set(FP.x, S.heightAt(FP.x, FP.z) + 0.02, FP.z); pool.receiveShadow = true; sc.add(pool);
    const RK = S.RINK;
    const rink = new THREE.Mesh(flatUV(new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2), 1 / 18), iceMat);
    rink.scale.set(RK.rx + 0.3, 1, RK.rz + 0.3); rink.position.set(RK.x, RK.y + 0.02, RK.z); rink.receiveShadow = true; sc.add(rink);
    // la rivière gelée : un ruban de glace qui suit son lit
    const R = S.RIVER, pos = [], uvs = [], idx = [];
    R.pts.forEach((p, i) => {
      const q = R.pts[Math.min(i + 1, R.pts.length - 1)], o = R.pts[Math.max(i - 1, 0)];
      let dx = q.x - o.x, dz = q.z - o.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      const y = S.riverY(p.s) + 0.03, w = S.RIVER_W + 0.4;
      pos.push(p.x + dz * w, y, p.z - dx * w, p.x - dz * w, y, p.z + dx * w);
      uvs.push(0, p.s / 9, 1, p.s / 9);
      if (i) { const a = (i - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rg.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); rg.setIndex(idx); rg.computeVertexNormals();
    const river = new THREE.Mesh(rg, iceMat); river.receiveShadow = true; sc.add(river);
    // ponts de bois
    const parts = [], bSnow = [];
    for (const b of S.BRIDGES) {
      const sx = Math.cos(b.yaw), sz = -Math.sin(b.yaw), fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
      if (art) {
        // vraies planches (un peu de jeu entre elles), longerons, poteaux et main courante enneigés
        const r = rng(Math.round(Math.abs(b.x * 7 + b.z)) + 1);
        for (let k = -b.len / 2 + 0.17; k < b.len / 2; k += 0.34) {
          const g = new THREE.BoxGeometry(0.3, 0.1, 3.3), a = g.attributes.uv, du = r();
          for (let i = 0; i < a.count; i++) a.setXY(i, a.getX(i) * 0.15 + du, a.getY(i) * 1.6);
          parts.push({ geo: paint(g, new THREE.Color(0xc89a6a).multiplyScalar(0.85 + r() * 0.3)), x: b.x + sx * k, y: b.y - 0.05 + (r() - 0.5) * 0.03, z: b.z + sz * k, ry: b.yaw, rx: (r() - 0.5) * 0.03 });
        }
        for (const sd of [-1, 1]) {
          parts.push({ geo: paint(new THREE.BoxGeometry(b.len + 0.4, 0.3, 0.22), 0x8a6040), x: b.x + fx * sd * 1.45, y: b.y - 0.25, z: b.z + fz * sd * 1.45, ry: b.yaw });
          for (let k = -b.len / 2 + 0.3; k <= b.len / 2 - 0.2; k += 2.2) {
            parts.push({ geo: paint(new THREE.BoxGeometry(0.16, 1.15, 0.16), 0x9a6a44), x: b.x + sx * k + fx * sd * 1.5, y: b.y + 0.5, z: b.z + sz * k + fz * sd * 1.5, ry: b.yaw });
            bSnow.push({ geo: paint(new THREE.SphereGeometry(0.13, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), 0xf6f9ff), x: b.x + sx * k + fx * sd * 1.5, y: b.y + 1.07, z: b.z + sz * k + fz * sd * 1.5, sy: 0.9 });
          }
          parts.push({ geo: paint(new THREE.BoxGeometry(b.len, 0.1, 0.14), 0x9a6a44), x: b.x + fx * sd * 1.5, y: b.y + 1.0, z: b.z + fz * sd * 1.5, ry: b.yaw });
          bSnow.push({ geo: paint(new THREE.CapsuleGeometry(0.07, b.len - 0.3, 2, 6).rotateZ(Math.PI / 2), 0xf6f9ff), x: b.x + fx * sd * 1.5, y: b.y + 1.07, z: b.z + fz * sd * 1.5, ry: b.yaw, sz: 1.2, sy: 0.7 });
          // un peu de neige contre les bords du tablier
          bSnow.push({ geo: paint(new THREE.CapsuleGeometry(0.16, b.len - 1.0, 2, 6).rotateZ(Math.PI / 2), 0xf4f8ff), x: b.x + fx * sd * 1.25, y: b.y + 0.02, z: b.z + fz * sd * 1.25, ry: b.yaw, sy: 0.45 });
        }
        continue;
      }
      const g = area(b.x, b.z, 12);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(b.len, 0.3, 3.2), M.mat(0xa0703e, { roughness: 0.85 }));
      deck.position.set(b.x, b.y - 0.15, b.z); deck.rotation.y = b.yaw; deck.castShadow = deck.receiveShadow = true; g.add(deck);
      const snowTop = new THREE.Mesh(new THREE.BoxGeometry(b.len - 0.4, 0.06, 2.6), M.mat(0xf4f8ff, { roughness: 0.9 }));
      snowTop.position.set(b.x, b.y + 0.02, b.z); snowTop.rotation.y = b.yaw; g.add(snowTop);
      for (const sd of [-1, 1]) for (let k = -b.len / 2 + 0.5; k <= b.len / 2 - 0.4; k += 2.2) parts.push({ geo: paint(new THREE.CylinderGeometry(0.08, 0.1, 1.1, 6), 0x7a5030), x: b.x + sx * k + fx * sd * 1.5, y: b.y + 0.5, z: b.z + sz * k + fz * sd * 1.5 });
      for (const sd of [-1, 1]) parts.push({ geo: paint(new THREE.BoxGeometry(b.len, 0.12, 0.12), 0x7a5030), x: b.x + fx * sd * 1.5, y: b.y + 1.0, z: b.z + fz * sd * 1.5, ry: b.yaw });
    }
    if (art && parts.length) {
      const m = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, map: SA.tex('brown_planks_03_d', true), normalMap: SA.tex('brown_planks_03_n') }));
      m.castShadow = m.receiveShadow = true; sc.add(m);
      const sm = new THREE.Mesh(merge(bSnow), SA.richMaterial({ wood: false, ice: false, gold: false, dark: false })); sm.receiveShadow = true; sc.add(sm);
      parts.length = 0;
    }
    if (parts.length) { const m = new THREE.Mesh(merge(parts), std({ vertexColors: true })); m.castShadow = true; sc.add(m); }
  }

  // --- sapins (par quartiers : les quartiers hors de l'écran ne sont pas dessinés) ------------
  {
    // vrais sapins (branches d'un sapin scanné, neige posée dessus) quand les photos sont là
    const real = FOL.hasFir();
    const firGeos = real ? [1, 2, 3].map(sd => FOL.firGeometry(sd, { levels: lite ? 8 : 11 })) : null;
    const geo = real ? null : pineGeometry(lite);
    const mat = real ? FOL.firMaterials({ snow: 0.7, lite }) : std({ vertexColors: true, roughness: 0.92 });
    const r = rng(9), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    const deco = [];
    let guard = 0;
    const want = lite ? 110 : 260;
    while (deco.length < want && guard++ < 9000) {
      const x = (r() - 0.5) * 416, z = (r() - 0.5) * 416;
      const e4 = Math.pow(x ** 4 + z ** 4, 0.25);
      if (e4 < 193 || e4 > 208) continue;
      const h = S.heightAt(x, z);
      if (Math.abs(S.heightAt(x + 1.5, z) - h) + Math.abs(S.heightAt(x, z + 1.5) - h) > 3.2) continue;
      deco.push({ x, z, y: h, s: 0.9 + r() * 0.8, k: 1 });
    }
    const all = S.trees.map(t => ({ x: t.x, z: t.z, y: t.y, s: t.s, k: t.h / 7 / t.s })).concat(deco);
    const CH = 70, chunks = new Map();
    for (const t of all) { const key = Math.floor(t.x / CH) + ',' + Math.floor(t.z / CH); if (!chunks.has(key)) chunks.set(key, []); chunks.get(key).push(t); }
    let ci = 0;
    for (const list of chunks.values()) {
      // une forme de sapin par quartier (2 appels de dessin : tronc + branches)
      const inst = new THREE.InstancedMesh(real ? firGeos[ci++ % 3] : geo, mat, list.length);
      list.forEach((t, i) => {
        m4.compose(v.set(t.x, t.y - 0.25, t.z), q.setFromEuler(e.set(0, r() * 6.28, (r() - 0.5) * 0.06)), s.set(t.s, t.s * (t.k || 1) * (0.9 + r() * 0.25), t.s));
        inst.setMatrixAt(i, m4);
        inst.setColorAt(i, c.setScalar(0.9 + r() * 0.15));
      });
      inst.computeBoundingSphere();
      inst.castShadow = true; inst.receiveShadow = true;
      if (lite) inst.userData.noOutline = true;
      sc.add(inst);
    }
  }

  /**
   * Les chalets « vrais » : murs en rondins croisés aux angles, pignons en planches, toit de
   * bardeaux sous un épais coussin de neige (bourrelets, glaçons), fenêtres à volets qui
   * brillent d'une lumière chaude, cheminée en pierre, soubassement de pierre.
   */
  function buildChaletsArt() {
    const wood = [], roof = [], snowP = [], ice = [], glass = [], stone = [];
    const uvs = (g, su, sv, swap) => { const a = g.attributes.uv; for (let i = 0; i < a.count; i++) { const u = a.getX(i) * su, v = a.getY(i) * sv; a.setXY(i, swap ? v : u, swap ? u : v); } return g; };
    const tint = (hex, k) => { const c = new THREE.Color(hex).multiplyScalar(k); return new THREE.Color(Math.min(1, c.r), Math.min(1, c.g), Math.min(1, c.b)); };
    const R = rng(808), LOG = 0.18, STEP = 0.34;
    for (const c of S.CHALETS) {
      const logCol = tint(c.col, 1.45), dark = tint(c.col, 0.35), paint2 = tint(c.roof, 1.5);
      // âme sombre (entre les rondins) et soubassement de pierre
      wood.push({ geo: paint(new THREE.BoxGeometry(c.w - 0.2, c.h, c.d - 0.2), dark), x: c.x, y: c.y + c.h / 2, z: c.z });
      stone.push({ geo: paint(uvs(new THREE.BoxGeometry(c.w + 0.55, 0.5, c.d + 0.55), (c.w + 0.5) / 2.5, 0.2), 0xd8d4cc), x: c.x, y: c.y + 0.1, z: c.z });
      // rondins : en long sur les façades avant/arrière, en travers sur les côtés (décalés d'un demi)
      const n = Math.round(c.h / STEP);
      for (let k = 0; k < n; k++) {
        for (const sd of [-1, 1]) {
          const lx = c.w + 0.75, lz = c.d + 0.75, jit = () => tint(0xffffff, 0.88 + R() * 0.2);
          const gx = uvs(new THREE.CylinderGeometry(LOG, LOG, lx, 8, 1), 0.14, lx / 2.4);
          wood.push({ geo: paint(gx, logCol.clone().multiply(jit())), x: c.x + (R() - 0.5) * 0.08, y: c.y + 0.42 + k * STEP, z: c.z + sd * (c.d / 2), rz: Math.PI / 2 });
          const gz = uvs(new THREE.CylinderGeometry(LOG, LOG, lz, 8, 1), 0.14, lz / 2.4);
          wood.push({ geo: paint(gz, logCol.clone().multiply(jit())), x: c.x + sd * (c.w / 2), y: c.y + 0.42 + STEP / 2 + k * STEP, z: c.z + (R() - 0.5) * 0.08, rx: Math.PI / 2 });
        }
      }
      // toit : deux pans (bardeaux), faîte parallèle à la façade qui porte la porte
      const ridgeX = c.door !== 0;
      const span = ridgeX ? c.d : c.w, len = ridgeX ? c.w : c.d;
      const pitch = 0.62, half = span / 2, rise = Math.tan(pitch) * half, slope = half / Math.cos(pitch) + 0.7;
      const ry = ridgeX ? 0 : Math.PI / 2;
      const top = c.y + c.h + 0.2;
      // un point (a : en travers du faîte ; b : le long du faîte) dans le monde
      const at = (a, b) => (ridgeX ? { x: c.x + b, z: c.z + a } : { x: c.x + a, z: c.z + b });
      for (const sd of [-1, 1]) {
        const cx = sd * (half / 2 + 0.12), cy = top + rise / 2 - 0.25;
        const p = at(cx, 0);
        const rg = uvs(new THREE.BoxGeometry(len + 1.2, 0.2, slope), (len + 1.2) / 2.2, slope / 2.2);
        roof.push({ geo: paint(rg, tint(c.roof, 1.0).lerp(new THREE.Color(1, 1, 1), 0.45)), x: p.x, y: cy, z: p.z, rx: sd * pitch, ry });
        // neige : un coussin épais posé sur le pan, avec un bourrelet arrondi au bord du toit
        const nx = Math.sin(pitch) * 0.24, ny = Math.cos(pitch) * 0.24;
        const ps = at(cx + sd * nx, 0);
        snowP.push({ geo: paint(new THREE.BoxGeometry(len + 1.0, 0.3, slope - 0.15), 0xf6f9ff), x: ps.x, y: cy + ny, z: ps.z, rx: sd * pitch, ry });
        const ex = cx + sd * Math.cos(pitch) * (slope / 2 - 0.08), ey = cy - Math.sin(pitch) * (slope / 2 - 0.08);
        const pe = at(ex + sd * nx * 0.6, 0);
        const roll = new THREE.CapsuleGeometry(0.2, len + 0.7, 3, 8); roll.rotateZ(Math.PI / 2);
        snowP.push({ geo: paint(roll, 0xf2f6ff), x: pe.x, y: ey + ny * 0.7, z: pe.z, ry, sy: 0.8 });
        // glaçons sous le bord du toit
        for (let b = -len / 2 - 0.3; b <= len / 2 + 0.3; b += 0.32 + R() * 0.25) {
          if (R() < 0.35) continue;
          const l = 0.18 + R() * R() * 0.75, q = at(ex + sd * 0.05, b);
          ice.push({ geo: paint(new THREE.ConeGeometry(0.045 + R() * 0.03, l, 5), 0x9ad6f2), x: q.x, y: ey - 0.12 - l / 2, z: q.z, rx: Math.PI });
        }
      }
      // faîte enneigé
      { const p = at(0, 0); const rr = new THREE.CapsuleGeometry(0.22, len + 0.9, 3, 8); rr.rotateZ(Math.PI / 2); snowP.push({ geo: paint(rr, 0xf8fbff), x: p.x, y: top + rise - 0.02, z: p.z, ry, sy: 0.75 }); }
      // pignons en planches verticales
      const sh = new THREE.Shape(); sh.moveTo(-half - 0.1, 0); sh.lineTo(half + 0.1, 0); sh.lineTo(0, rise + 0.05); sh.closePath();
      for (const e of [-1, 1]) {
        const g = uvs(new THREE.ExtrudeGeometry(sh, { depth: 0.16, bevelEnabled: false }), 1 / 1.6, 1 / 1.6);
        const p = at(0, e * (len / 2 + 0.02) - (e > 0 ? 0.16 : 0));
        wood.push({ geo: paint(g, tint(c.col, 1.6)), x: p.x, y: c.y + c.h + 0.05, z: p.z, ry: ridgeX ? Math.PI / 2 : 0 });
      }
      // façade de la porte (côté place)
      const fx = c.door ? c.door : 0, fz = c.door ? 0 : 1;
      const fd = (c.door ? c.w : c.d) / 2 + LOG + 0.04;
      const along = (k, out) => (c.door ? { x: c.x + fx * (fd + (out || 0)), z: c.z + k } : { x: c.x + k, z: c.z + fz * (fd + (out || 0)) });
      const ryF = c.door ? Math.PI / 2 * fx : 0;
      const face = (geo, col, k, y, out, list) => { const p = along(k, out); (list || wood).push({ geo: paint(geo, col), x: p.x, y, z: p.z, ry: ryF }); };
      // porte : planches sombres, encadrement, marche de pierre, petit auvent enneigé
      face(uvs(new THREE.BoxGeometry(1.15, 2.05, 0.1), 0.7, 1.3), tint(c.col, 0.75), 0, c.y + 1.15, 0);
      face(uvs(new THREE.BoxGeometry(1.4, 0.14, 0.16), 0.9, 0.1), tint(c.roof, 1.3), 0, c.y + 2.24, 0.04);
      face(new THREE.BoxGeometry(1.5, 0.22, 0.7), 0xc8c4bc, 0, c.y + 0.11, 0.3, stone);
      face(new THREE.SphereGeometry(0.06, 8, 6), 0xe8b83a, 0.38, c.y + 1.1, 0.08);
      face(new THREE.BoxGeometry(1.7, 0.12, 0.8), tint(c.roof, 1.0), 0, c.y + 2.55, 0.35);
      face(new THREE.BoxGeometry(1.8, 0.16, 0.85), 0xf6f9ff, 0, c.y + 2.67, 0.36, snowP);
      // fenêtres : vitre éclairée, encadrement blanc, volets peints, rebord enneigé
      for (const k of [-2.1, 2.1]) {
        face(new THREE.BoxGeometry(0.95, 0.95, 0.06), 0xffffff, k, c.y + 1.9, 0.02, glass);
        face(new THREE.BoxGeometry(1.15, 1.15, 0.05), 0xf4ede2, k, c.y + 1.9, -0.01);
        for (const sd of [-1, 1]) face(uvs(new THREE.BoxGeometry(0.5, 1.12, 0.06), 0.35, 0.8), paint2, k + sd * 0.86, c.y + 1.9, 0.03);
        face(new THREE.BoxGeometry(1.3, 0.08, 0.3), 0xf4ede2, k, c.y + 1.3, 0.12);
        face(new THREE.BoxGeometry(1.25, 0.12, 0.28), 0xf6f9ff, k, c.y + 1.39, 0.13, snowP);
      }
      // fenêtre du pignon
      face(new THREE.BoxGeometry(0.7, 0.7, 0.06), 0xffffff, 0, c.y + c.h + rise * 0.42, -0.1, glass);
      face(new THREE.BoxGeometry(0.88, 0.88, 0.05), 0xf4ede2, 0, c.y + c.h + rise * 0.42, -0.13);
      // cheminée en pierre (fumée : chimneys)
      const chp = at(-half * 0.45, len * 0.22);
      const chY = top + rise * 0.55;
      stone.push({ geo: paint(uvs(new THREE.BoxGeometry(0.7, 2.0, 0.7), 0.35, 1.0), 0xe0dcd4), x: chp.x, y: chY, z: chp.z });
      wood.push({ geo: paint(new THREE.BoxGeometry(0.86, 0.1, 0.86), 0x3a3634), x: chp.x, y: chY + 1.0, z: chp.z });
      snowP.push({ geo: paint(new THREE.BoxGeometry(0.8, 0.14, 0.8), 0xf6f9ff), x: chp.x, y: chY + 1.12, z: chp.z });
      chimneys.push({ x: chp.x, y: chY + 1.25, z: chp.z });
      // neige soufflée contre le mur de derrière
      const bp = along((R() - 0.5) * 2, -(c.door ? c.w : c.d) - 0.5);
      snowP.push({ geo: paint(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xf4f8ff), x: bp.x, y: c.y - 0.05, z: bp.z, sx: 1.8, sy: 0.55, sz: 0.9, ry: ryF });
    }
    const photoMat = (name, o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.85, map: SA.tex(name + '_d', true), normalMap: SA.tex(name + '_n') }, o || {}));
    const woodM = new THREE.Mesh(merge(wood), photoMat('brown_planks_03'));
    const roofM = new THREE.Mesh(merge(roof), photoMat('roof_slates_02', { roughness: 0.8 }));
    const stoneM = new THREE.Mesh(merge(stone), photoMat(RT.photoImage('mossy_stone_wall_d') ? 'mossy_stone_wall' : 'brown_planks_03', { roughness: 0.92 }));
    const snowM = new THREE.Mesh(merge(snowP), SA.richMaterial({ wood: false, gold: false, ice: false, dark: false, roughness: 0.8 }));
    const iceM = new THREE.Mesh(merge(ice), SA.richMaterial({ snow: false, wood: false, gold: false, dark: false }));
    // vitres : intérieur chaud (rideaux, croisillons)
    const winTex = canvasTex(128, 128, (x, w, h) => {
      const g = x.createRadialGradient(64, 70, 6, 64, 64, 90); g.addColorStop(0, '#fff2c0'); g.addColorStop(0.5, '#ffbe5a'); g.addColorStop(1, '#b0602a');
      x.fillStyle = g; x.fillRect(0, 0, w, h);
      x.fillStyle = 'rgba(200,40,40,0.85)'; x.fillRect(0, 0, 26, h); x.fillRect(w - 26, 0, 26, h);
      x.fillStyle = 'rgba(255,255,255,0.35)'; for (let i = 0; i < 6; i++) { x.fillRect(0, i * 22 + 4, 26, 6); x.fillRect(w - 26, i * 22 + 4, 26, 6); }
      x.fillStyle = '#f4ede2'; x.fillRect(60, 0, 8, h); x.fillRect(0, 58, w, 8); x.strokeStyle = '#f4ede2'; x.lineWidth = 8; x.strokeRect(0, 0, w, h);
    });
    const glassM = new THREE.Mesh(merge(glass), new THREE.MeshStandardMaterial({ vertexColors: true, map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0.85, roughness: 0.25, metalness: 0.1 }));
    for (const m of [woodM, roofM, stoneM, snowM]) { m.castShadow = true; m.receiveShadow = true; }
    iceM.userData.noOutline = true;
    sc.add(woodM, roofM, stoneM, snowM, iceM, glassM);
  }

  // --- le village : chalets, grand sapin, lampadaires ---------------------------------------
  const winMat = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffa040, emissiveIntensity: 0.75, roughness: 0.4 });
  const chimneys = [];
  if (art) buildChaletsArt();
  else {
    const walls = [], roofs = [], snowy = [], wins = [], frames = [];
    const logs = logTexture();
    const roofSlab = (c, ridgeX, span, len, h) => {
      // deux pans de toit (couleur), recouverts de neige
      const pitch = 0.62, half = span / 2, rise = Math.tan(pitch) * half, slope = half / Math.cos(pitch) + 0.55;
      for (const sd of [-1, 1]) {
        const off = sd * (half / 2 + 0.1);
        const where = ridgeX ? { x: c.x, z: c.z + off, rx: sd * pitch } : { x: c.x + off, z: c.z, rz: -sd * pitch };
        const panel = (th, ext, shrink, color) => (ridgeX ? new THREE.BoxGeometry(len + ext, th, slope - shrink) : new THREE.BoxGeometry(slope - shrink, th, len + ext));
        roofs.push(Object.assign({ geo: paint(panel(0.24, 0.9, 0), c.roof), y: c.y + h + rise / 2 + 0.05 }, where));
        snowy.push(Object.assign({ geo: paint(panel(0.2, 0.7, 0.25), 0xf4f8ff), y: c.y + h + rise / 2 + 0.24 }, where));
      }
      // pignons (triangles)
      const sh = new THREE.Shape(); sh.moveTo(-half, 0); sh.lineTo(half, 0); sh.lineTo(0, rise); sh.closePath();
      for (const e of [-1, 1]) {
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false });
        if (ridgeX) walls.push({ geo: paint(g, c.col), x: c.x + e * (len / 2) - (e > 0 ? 0.2 : 0), y: c.y + h, z: c.z, ry: Math.PI / 2 });
        else walls.push({ geo: paint(g, c.col), x: c.x, y: c.y + h, z: c.z + e * (len / 2) - (e > 0 ? 0.2 : 0) });
      }
      return rise;
    };
    for (const c of S.CHALETS) {
      walls.push({ geo: paint(new THREE.BoxGeometry(c.w, c.h, c.d), c.col), x: c.x, y: c.y + c.h / 2, z: c.z });
      const ridgeX = c.door !== 0;   // le pignon regarde la place
      const rise = ridgeX ? roofSlab(c, true, c.d, c.w, c.h) : roofSlab(c, false, c.w, c.d, c.h);
      // porte et fenêtres (côté place)
      const fx = c.door ? c.door : 0, fz = c.door ? 0 : 1;
      const fd = (c.door ? c.w : c.d) / 2 + 0.03;
      const along = (k) => (c.door ? { x: c.x + fx * fd, z: c.z + k } : { x: c.x + k, z: c.z + fz * fd });
      const doorP = along(0);
      frames.push({ geo: paint(new THREE.BoxGeometry(c.door ? 0.08 : 1.1, 1.9, c.door ? 1.1 : 0.08), 0x5a3420), x: doorP.x, y: c.y + 0.95, z: doorP.z });
      for (const k of [-2.0, 2.0]) {
        const p = along(k);
        wins.push({ geo: new THREE.BoxGeometry(c.door ? 0.08 : 0.9, 0.8, c.door ? 0.9 : 0.08), x: p.x, y: c.y + 1.9, z: p.z });
        frames.push({ geo: paint(new THREE.BoxGeometry(c.door ? 0.1 : 1.1, 1.0, c.door ? 1.1 : 0.1), 0xfff4e4), x: p.x - fx * 0.01, y: c.y + 1.9, z: p.z - fz * 0.01 });
      }
      // fenêtre ronde dans le pignon
      const gp = along(0);
      wins.push({ geo: new THREE.CylinderGeometry(0.35, 0.35, 0.08, 14), x: gp.x, y: c.y + c.h + rise * 0.4, z: gp.z, rx: c.door ? 0 : Math.PI / 2, rz: c.door ? Math.PI / 2 : 0 });
      // cheminée
      const chx = c.x + (c.door ? -fx * c.w * 0.22 : c.w * 0.25), chz = c.z + (c.door ? c.d * 0.22 : -c.d * 0.2);
      frames.push({ geo: paint(new THREE.BoxGeometry(0.6, 1.6, 0.6), 0x8a6a5a), x: chx, y: c.y + c.h + rise * 0.55 + 0.4, z: chz });
      snowy.push({ geo: paint(new THREE.BoxGeometry(0.72, 0.16, 0.72), 0xf4f8ff), x: chx, y: c.y + c.h + rise * 0.55 + 1.25, z: chz });
      chimneys.push({ x: chx, y: c.y + c.h + rise * 0.55 + 1.4, z: chz });
      // neige au pied des murs
      snowy.push({ geo: paint(new THREE.CylinderGeometry(0.5, 0.7, 0.4, 8), 0xf0f4fc), x: c.x + (c.door ? -fx * (c.w / 2) : c.w / 2 - 0.3), y: c.y + 0.1, z: c.z + (c.door ? c.d / 2 - 0.4 : -fz * c.d / 2), sx: 1.4 });
    }
    const wallM = new THREE.Mesh(merge(walls), std({ vertexColors: true, map: logs, roughness: 0.85 }));
    wallM.castShadow = wallM.receiveShadow = true;
    // (les pignons n'ont pas d'uv cohérents avec les rondins : peu importe, ils sont lisses)
    const roofM = new THREE.Mesh(merge(roofs), std({ vertexColors: true, roughness: 0.7 }));
    const snowM = new THREE.Mesh(merge(snowy), std({ vertexColors: true, roughness: 0.85, map: snowTex }));
    const frameM = new THREE.Mesh(merge(frames), std({ vertexColors: true, roughness: 0.8 }));
    const winM = new THREE.Mesh(merge(wins), winMat);
    for (const m of [roofM, snowM, frameM]) { m.castShadow = true; m.receiveShadow = true; }
    sc.add(wallM, roofM, snowM, frameM, winM);
  }
  {
    // enseigne du chalet-chocolat de Myrtille
    const ch = S.CHALETS.find(c => c.choco);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), new THREE.MeshStandardMaterial({ map: textTex('Chocolat chaud', { bg: '#6a3a22', size: 58 }), roughness: 0.7 }));
    sign.position.set(ch.x - ch.w / 2 - (art ? 0.42 : 0.06), ch.y + ch.h + (art ? 0.45 : 0.2), ch.z); sign.rotation.y = -Math.PI / 2;
    sc.add(sign);
    // comptoir et tasses
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 2.4), M.mat(0x8a5a3a, { roughness: 0.8 }));
    counter.position.set(ch.x - ch.w / 2 - 0.8, ch.y + 0.5, ch.z + 2.1); counter.castShadow = true; sc.add(counter);
    for (let i = 0; i < 3; i++) { const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.2, 10), M.mat([0xe84a4a, 0x4a8ae8, 0xf0c030][i])); mug.position.set(ch.x - ch.w / 2 - 0.8, ch.y + 1.1, ch.z + 1.4 + i * 0.6); sc.add(mug); chimneys.push({ x: mug.position.x, y: mug.position.y + 0.15, z: mug.position.z, mug: true }); }
  }
  // grand sapin décoré au milieu de la place
  const treeLights = [];
  let bulbs = null;
  if (art && FOL.hasFir()) {
    // un vrai grand sapin (branches scannées), boules de verre, guirlande lumineuse, étoile, cadeaux
    const T = S.BIG_TREE, y0 = S.VILLAGE_Y, H = 9.8, R0 = 3.4, r = rng(4242);
    const tm = new THREE.Mesh(FOL.firGeometry(42, { height: H, radius: R0, levels: lite ? 12 : 16 }), FOL.firMaterials({ snow: 0.4, lite }));
    tm.position.set(T.x, y0 - 0.15, T.z); tm.castShadow = true; tm.receiveShadow = true; sc.add(tm);
    // (rayon des branches à la hauteur f, comme dans foliage.js)
    const radAt = (f) => (R0 * Math.pow(1 - f, 0.85) + 0.35) * 0.86;
    const NO = lite ? 46 : 70, orn = new THREE.InstancedMesh(new THREE.SphereGeometry(0.19, 16, 12), new THREE.MeshStandardMaterial({ metalness: 0.9, roughness: 0.16, color: 0xffffff }), NO);
    const PAL = [0xe0202a, 0xf2c030, 0x2a7ae0, 0xe8e8f0, 0xe050a0, 0xd02040], m4 = new THREE.Matrix4(), c = new THREE.Color();
    for (let i = 0; i < NO; i++) {
      const f = 0.06 + Math.pow(r(), 0.8) * 0.8, a = i * 2.39996 + r() * 0.5, rr = radAt(f), y = y0 + H * (0.16 + 0.76 * f) - 0.25;
      const s = 0.75 + r() * 0.6;
      m4.compose(new THREE.Vector3(T.x + Math.cos(a) * rr, y, T.z + Math.sin(a) * rr), new THREE.Quaternion(), new THREE.Vector3(s, s, s));
      orn.setMatrixAt(i, m4); orn.setColorAt(i, c.set(PAL[i % PAL.length]));
    }
    orn.castShadow = true; orn.userData.noOutline = true; sc.add(orn);
    // guirlande : petites ampoules en spirale (couleurs vives : le halo lumineux les fait briller)
    const NB = lite ? 90 : 150;
    bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), NB);
    const BC = [[2.6, 2.0, 1.1], [2.6, 1.0, 0.6], [1.2, 1.9, 2.8], [2.4, 2.2, 0.5]];
    for (let i = 0; i < NB; i++) {
      const f = 0.04 + (i / NB) * 0.84, a = f * Math.PI * 2 * 6.5, rr = radAt(f) * 1.02, y = y0 + H * (0.16 + 0.76 * f) - 0.1 + Math.sin(a * 3) * 0.08;
      m4.makeTranslation(T.x + Math.cos(a) * rr, y, T.z + Math.sin(a) * rr);
      bulbs.setMatrixAt(i, m4); const b = BC[i % 4]; bulbs.setColorAt(i, c.setRGB(b[0], b[1], b[2]));
    }
    bulbs.userData.noOutline = true; sc.add(bulbs);
    // l'étoile (cinq branches, dorée)
    const sh = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? 0.26 : 0.62; i ? sh.lineTo(Math.cos(a) * rad, Math.sin(a) * rad) : sh.moveTo(Math.cos(a) * rad, Math.sin(a) * rad); }
    const sg0 = new THREE.ExtrudeGeometry(sh, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.06, bevelSegments: 2 }); sg0.center();
    const star = new THREE.Mesh(sg0, M.mat(0xffd23a, { metalness: 0.7, roughness: 0.25, emissive: 0xffa000, emissiveIntensity: 0.9 }));
    star.position.set(T.x, y0 + H * 1.04 + 0.35, T.z); sc.add(star);
    const sg = glowSprite(0xffe080, 3.4, 0.6); sg.position.copy(star.position); sc.add(sg);
    treeLights.push(star);
    // cadeaux au pied du sapin, sur un coussin de neige
    const gifts = [];
    for (let i = 0; i < 7; i++) {
      const a = 0.4 + i * 0.9 + r() * 0.3, d = 2.3 + r() * 0.8, w = 0.45 + r() * 0.35, h = 0.35 + r() * 0.35, x = T.x + Math.cos(a) * d, z = T.z + Math.sin(a) * d;
      const col = [0xd82a3a, 0x2a8a4a, 0x2a6ad8, 0xf0f0f4, 0x8a3ad0, 0xf0a020, 0xe04080][i];
      gifts.push({ geo: paint(new THREE.BoxGeometry(w, h, w * 0.9), col), x, y: y0 + h / 2, z, ry: a });
      for (const rot of [0, Math.PI / 2]) gifts.push({ geo: paint(new THREE.BoxGeometry(w + 0.02, h + 0.02, 0.07), 0xe8b83a), x, y: y0 + h / 2, z, ry: a + rot });
      gifts.push({ geo: paint(new THREE.TorusGeometry(0.09, 0.035, 6, 12), 0xe8b83a), x, y: y0 + h + 0.06, z, ry: a });
    }
    gifts.push({ geo: paint(new THREE.SphereGeometry(1, 20, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0xf6f9ff), x: T.x, y: y0 - 0.1, z: T.z, sx: 3.0, sy: 0.32, sz: 3.0 });
    const gm = new THREE.Mesh(merge(gifts), SA.richMaterial({ ice: false, roughness: 0.55 })); gm.castShadow = true; gm.receiveShadow = true; sc.add(gm);
  } else {
    const T = S.BIG_TREE, y0 = S.VILLAGE_Y, parts = [], balls = [];
    parts.push({ geo: paint(new THREE.CylinderGeometry(0.3, 0.45, 1.6, 8), 0x5a3a24), y: y0 + 0.8 });
    for (let i = 0; i < 5; i++) {
      const r = 3.3 - i * 0.6, h = 2.6 - i * 0.2, yb = y0 + 1.2 + i * 1.35;
      parts.push({ geo: paint(new THREE.ConeGeometry(r, h, 12), [0x245a3a, 0x2a6442, 0x2e6c46, 0x34744c, 0x387c50][i]), y: yb + h / 2 });
      parts.push({ geo: paint(new THREE.ConeGeometry(r * 0.42, h * 0.42, 12), 0xf2f6fc), y: yb + h - h * 0.21 + 0.03 });
      for (let k = 0; k < 7 - i; k++) {
        const a = k / (7 - i) * Math.PI * 2 + i, rr = r * 0.82;
        balls.push({ geo: paint(new THREE.SphereGeometry(0.17, 8, 6), [0xff3a4a, 0xffd23a, 0x4ab0ff, 0xff7ad8][(k + i) % 4]), x: T.x + Math.cos(a) * rr, y: yb + 0.35, z: T.z + Math.sin(a) * rr });
      }
    }
    const tm = new THREE.Mesh(merge(parts), std({ vertexColors: true }));
    tm.position.set(T.x, 0, T.z); tm.castShadow = true; sc.add(tm);
    const bm = new THREE.Mesh(merge(balls), new THREE.MeshBasicMaterial({ vertexColors: true }));
    bm.userData.noOutline = true; sc.add(bm); treeLights.push(bm);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), M.mat(0xffd23a, { metalness: 0.6, roughness: 0.3, emissive: 0xffa000, emissiveIntensity: 0.9 }));
    star.position.set(T.x, y0 + 1.2 + 5 * 1.35 + 0.6, T.z); sc.add(star);
    const sg = glowSprite(0xffe080, 3.2, 0.55); sg.position.copy(star.position); sc.add(sg);
    treeLights.push(star);
  }
  // lampadaires
  {
    const posts = [], lan = [];
    // fût tourné (socle, colliers), lanterne à quatre vitres, toit pointu enneigé
    const lathe = art ? new THREE.LatheGeometry([[0.2, 0], [0.2, 0.12], [0.14, 0.2], [0.1, 0.32], [0.075, 0.5], [0.06, 2.55], [0.1, 2.62], [0.1, 2.7], [0.07, 2.76], [0.07, 2.88], [0, 2.9]].map(([x, y]) => new THREE.Vector2(x, y)), 10) : null;
    for (const l of S.LAMPS) {
      if (art) {
        posts.push({ geo: paint(lathe.clone(), 0x23262c), x: l.x, y: l.y, z: l.z });
        for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) posts.push({ geo: paint(new THREE.BoxGeometry(0.035, 0.46, 0.035), 0x23262c), x: l.x + dx * 0.16, y: l.y + 3.12, z: l.z + dz * 0.16 });
        posts.push({ geo: paint(new THREE.BoxGeometry(0.4, 0.05, 0.4), 0x23262c), x: l.x, y: l.y + 2.88, z: l.z });
        posts.push({ geo: paint(new THREE.ConeGeometry(0.34, 0.32, 4), 0x23262c), x: l.x, y: l.y + 3.5, z: l.z, ry: Math.PI / 4 });
        posts.push({ geo: paint(new THREE.SphereGeometry(0.05, 8, 6), 0xd8b040), x: l.x, y: l.y + 3.7, z: l.z });
        posts.push({ geo: paint(new THREE.ConeGeometry(0.3, 0.17, 4), 0xf6f9ff), x: l.x, y: l.y + 3.6, z: l.z, ry: Math.PI / 4 });
        lan.push({ geo: new THREE.CylinderGeometry(0.15, 0.13, 0.42, 4, 1, false, Math.PI / 4), x: l.x, y: l.y + 3.12, z: l.z });
      } else {
        posts.push({ geo: paint(new THREE.CylinderGeometry(0.07, 0.1, 3, 6), 0x2a2a32), x: l.x, y: l.y + 1.5, z: l.z });
        posts.push({ geo: paint(new THREE.ConeGeometry(0.32, 0.3, 4), 0x2a2a32), x: l.x, y: l.y + 3.45, z: l.z, ry: Math.PI / 4 });
        posts.push({ geo: paint(new THREE.ConeGeometry(0.3, 0.14, 4), 0xf4f8ff), x: l.x, y: l.y + 3.62, z: l.z, ry: Math.PI / 4 });
        lan.push({ geo: new THREE.BoxGeometry(0.3, 0.38, 0.3), x: l.x, y: l.y + 3.1, z: l.z });
      }
      const s = glowSprite(0xffd890, art ? 2.0 : 1.6, 0.45); s.position.set(l.x, l.y + 3.1, l.z); sc.add(s);
    }
    const pm = new THREE.Mesh(merge(posts), std({ vertexColors: true, roughness: 0.5, metalness: 0.4 })); pm.castShadow = true; sc.add(pm);
    sc.add(new THREE.Mesh(merge(lan), winMat));
  }

  // --- télésiège ----------------------------------------------------------------------------
  const LIFT = S.LIFT;
  const liftDir = { x: LIFT.top.x - LIFT.base.x, z: LIFT.top.z - LIFT.base.z };
  { const l = Math.hypot(liftDir.x, liftDir.z); liftDir.x /= l; liftDir.z /= l; }
  const side = { x: liftDir.z, z: -liftDir.x };     // vers la droite en montant
  const LANE = 1.25;                                 // écart entre la montée et la descente
  const liftYaw = Math.atan2(liftDir.x, liftDir.z);
  {
    const metal = std({ vertexColors: true, roughness: 0.5, metalness: 0.5 });
    const parts = [];
    for (const p of S.PYLONS) {
      parts.push({ geo: paint(new THREE.CylinderGeometry(0.22, 0.32, p.top - p.y + 0.3, 8), 0x5a6678), x: p.x, y: p.y + (p.top - p.y + 0.3) / 2, z: p.z });
      parts.push({ geo: paint(new THREE.BoxGeometry(LANE * 2 + 0.6, 0.22, 0.3), 0xe8b020), x: p.x, y: p.top + 0.25, z: p.z, ry: liftYaw + Math.PI / 2 });
      for (const sd of [-1, 1]) parts.push({ geo: paint(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10), 0x2a2a30), x: p.x + side.x * LANE * sd, y: p.top + 0.08, z: p.z + side.z * LANE * sd, rx: Math.PI / 2, ry: liftYaw });
    }
    // gares : poteaux et grande roue horizontale
    for (const st of [LIFT.base, LIFT.top]) {
      const top = st.y + 4.6;
      for (const sd of [-1, 1]) parts.push({ geo: paint(new THREE.CylinderGeometry(0.2, 0.28, 4.8, 8), 0x5a6678), x: st.x + side.x * sd * 0.8 - liftDir.x * 0.6, y: st.y + 2.4, z: st.z + side.z * sd * 0.8 - liftDir.z * 0.6 });
      parts.push({ geo: paint(new THREE.TorusGeometry(LANE, 0.12, 6, 24), 0xe8b020), x: st.x, y: top, z: st.z, rx: Math.PI / 2 });
      parts.push({ geo: paint(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 12), 0x3a3a44), x: st.x, y: top + 0.1, z: st.z });
      parts.push({ geo: paint(new THREE.BoxGeometry(2.4, 0.18, 2.4), 0xd84a3a), x: st.x, y: top + 0.55, z: st.z, ry: liftYaw });
      parts.push({ geo: paint(new THREE.BoxGeometry(2.5, 0.12, 2.5), 0xf4f8ff), x: st.x, y: top + 0.7, z: st.z, ry: liftYaw });
    }
    const pm = new THREE.Mesh(merge(parts), metal); pm.castShadow = true; pm.receiveShadow = true; sc.add(pm);
    // câbles
    const cab = [];
    for (const sd of [-1, 1]) for (let i = 0; i + 1 < S.LIFT_PTS.length; i++) {
      const a = S.LIFT_PTS[i], b = S.LIFT_PTS[i + 1];
      const ax = a.x + side.x * LANE * sd, az = a.z + side.z * LANE * sd, bx = b.x + side.x * LANE * sd, bz = b.z + side.z * LANE * sd;
      const len = Math.hypot(bx - ax, b.y - a.y, bz - az);
      const g = new THREE.CylinderGeometry(0.035, 0.035, len, 4, 1, true);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx - ax, b.y - a.y, bz - az).normalize()));
      g.translate((ax + bx) / 2, (a.y + b.y) / 2, (az + bz) / 2);
      cab.push({ geo: g });
    }
    const cm = new THREE.Mesh(merge(cab), M.mat(0x2a2a30, { roughness: 0.5, metalness: 0.6 })); cm.userData.noOutline = true; sc.add(cm);
    // gare du bas (cabane) et plate-forme du haut
    const STN = S.STATION;
    const stParts = [
      { geo: paint(new THREE.BoxGeometry(STN.w, STN.h, STN.d), 0x9a6a44), x: STN.x, y: STN.y + STN.h / 2, z: STN.z },
      { geo: paint(new THREE.BoxGeometry(STN.w + 0.5, 0.25, STN.d + 0.5), 0x6a4a34), x: STN.x, y: STN.y + STN.h + 0.05, z: STN.z },
      { geo: paint(new THREE.BoxGeometry(STN.w + 0.3, 0.22, STN.d + 0.3), 0xf4f8ff), x: STN.x, y: STN.y + STN.h + 0.25, z: STN.z },
      { geo: paint(new THREE.BoxGeometry(1.2, 0.9, 0.08), 0xffe0a0), x: STN.x + 0.6, y: STN.y + 2, z: STN.z + STN.d / 2 + 0.03 },
      { geo: paint(new THREE.BoxGeometry(0.9, 1.9, 0.08), 0x4a2a1a), x: STN.x - 1, y: STN.y + 0.95, z: STN.z + STN.d / 2 + 0.03 },
    ];
    const WP = S.WOODPILE;
    for (let i = 0; i < 9; i++) { const row = Math.floor(i / 3), k = i % 3; stParts.push({ geo: paint(new THREE.CylinderGeometry(0.28, 0.28, WP.d, 8), 0xa07048), x: WP.x - 0.56 + k * 0.56, y: WP.y + 0.28 + row * 0.5, z: WP.z, rx: Math.PI / 2 }); }
    stParts.push({ geo: paint(new THREE.BoxGeometry(WP.w + 0.1, 0.16, WP.d + 0.1), 0xf4f8ff), x: WP.x, y: WP.y + WP.h - 0.02, z: WP.z });
    const D = S.TOP_DECK;
    stParts.push({ geo: paint(new THREE.BoxGeometry(4, 0.3, 4), 0x9a6a44), x: D.x, y: S.heightAt(D.x, D.z) + 0.05, z: D.z, ry: liftYaw });
    // poste de secours de Bernard
    const H = S.HUT;
    stParts.push({ geo: paint(new THREE.BoxGeometry(H.w, H.h + 1.5, H.d), 0xc84a3a), x: H.x, y: H.y + (H.h - 1.5) / 2, z: H.z });
    stParts.push({ geo: paint(new THREE.BoxGeometry(H.w + 0.6, 0.3, H.d + 0.6), 0x6a3a2a), x: H.x, y: H.y + H.h + 0.1, z: H.z });
    stParts.push({ geo: paint(new THREE.BoxGeometry(H.w + 0.4, 0.3, H.d + 0.4), 0xf4f8ff), x: H.x, y: H.y + H.h + 0.35, z: H.z });
    stParts.push({ geo: paint(new THREE.BoxGeometry(1, 1.9, 0.08), 0x4a2a1a), x: H.x - 1, y: H.y + 0.95, z: H.z + H.d / 2 + 0.03 });
    const stM = new THREE.Mesh(merge(stParts), std({ vertexColors: true, roughness: 0.8 })); stM.castShadow = true; stM.receiveShadow = true; sc.add(stM);
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (x) => { x.fillStyle = '#fff'; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill(); x.fillStyle = '#e02a2a'; x.fillRect(25, 10, 14, 44); x.fillRect(10, 25, 44, 14); }), transparent: true, roughness: 0.6 }));
    cross.position.set(H.x + 0.9, H.y + H.h - 0.9, H.z + H.d / 2 + 0.05); sc.add(cross);
  }
  // sièges (tous dans un seul maillage instancié) : ceux qui tournent, puis ceux des joueurs
  const CHAIRS = lite ? 12 : 18, RIDERS = 6;
  const chairGeo = merge([
    { geo: paint(new THREE.CylinderGeometry(0.035, 0.035, S.SEAT_DROP, 5), 0x3a3a44), y: -S.SEAT_DROP / 2 },
    { geo: paint(new THREE.BoxGeometry(1.3, 0.1, 0.6), 0xd8402e), y: -S.SEAT_DROP, z: 0.1 },
    { geo: paint(new THREE.BoxGeometry(1.3, 0.6, 0.08), 0xd8402e), y: -S.SEAT_DROP + 0.32, z: -0.18 },
    { geo: paint(new THREE.BoxGeometry(1.4, 0.06, 0.06), 0x3a3a44), y: -S.SEAT_DROP + 0.65, z: 0.42 },
    { geo: paint(new THREE.BoxGeometry(0.06, 0.6, 0.06), 0x3a3a44), x: 0.68, y: -S.SEAT_DROP + 0.35, z: 0.42 },
  ]);
  const chairs = new THREE.InstancedMesh(chairGeo, std({ vertexColors: true, roughness: 0.6 }), CHAIRS + RIDERS);
  chairs.castShadow = true; chairs.frustumCulled = false;
  sc.add(chairs); moving.push(chairs);

  // --- la Grande Glissade : portes, tunnel, départ, arrivée, luges ------------------------------------
  {
    const parts = [];
    S.GATES.forEach((gt, i) => {
      const sx = gt.dz, sz = -gt.dx;
      const col = i % 2 ? 0xe83a3a : 0x3a7ae8;
      for (const sd of [-1, 1]) {
        const ox = gt.x + sx * sd * gt.half, oz = gt.z + sz * sd * gt.half, y = S.heightAt(ox, oz);
        parts.push({ geo: paint(new THREE.CylinderGeometry(0.07, 0.07, 2.4, 6), 0xf4f4f4), x: ox, y: y + 1.2, z: oz });
        parts.push({ geo: paint(new THREE.BoxGeometry(1.0, 0.7, 0.05), col), x: ox - sx * sd * 0.5, y: y + 2.0, z: oz - sz * sd * 0.5, ry: Math.atan2(sx, sz) + Math.PI / 2 });
      }
    });
    // petits fanions orange le long des bords (on voit bien la piste de loin)
    for (const r of S.RUNS) for (let s = 6; s < r.total; s += 9) {
      const p = r.at(s);
      for (const sd of [-1, 1]) { const ox = p.x + p.dz * sd * (S.RUN_W + 2.2), oz = p.z - p.dx * sd * (S.RUN_W + 2.2); parts.push({ geo: paint(new THREE.ConeGeometry(0.12, 0.9, 5), 0xff8a2a), x: ox, y: S.heightAt(ox, oz) + 0.4, z: oz }); }
    }
    const pm = new THREE.Mesh(merge(parts), std({ vertexColors: true, roughness: 0.6 })); pm.castShadow = true; sc.add(pm);
    // le tunnel de neige
    {
      const T = S.TUNNEL, Rr = S.RUN_W + 2.2, pos = [], idx = [], cols = [];
      const N = 12, steps = Math.ceil((T.s1 - T.s0) / 1.2);
      for (let i = 0; i <= steps; i++) {
        const p = S.RUN.at(T.s0 + (T.s1 - T.s0) * i / steps), nx = p.dz, nz = -p.dx, y0 = S.heightAt(p.x, p.z) - 1;
        for (let j = 0; j <= N; j++) {
          const a = Math.PI * j / N;
          pos.push(p.x + nx * Math.cos(a) * Rr, y0 + Math.sin(a) * 5.4, p.z + nz * Math.cos(a) * Rr);
          const k = 0.92 + 0.08 * Math.sin(j * 1.7 + i);
          cols.push(0.9 * k, 0.94 * k, 1.0 * k);
          if (i && j) { const a0 = (i - 1) * (N + 1) + j - 1, a1 = i * (N + 1) + j - 1; idx.push(a0, a1, a0 + 1, a0 + 1, a1, a1 + 1); }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals();
      const tm = new THREE.Mesh(g, std({ vertexColors: true, side: THREE.DoubleSide, map: snowTex }));
      tm.castShadow = true; tm.receiveShadow = true; sc.add(tm);
      // des glaçons à l'entrée et à la sortie
      const ic = [];
      for (const s of [T.s0, T.s1]) { const p = S.RUN.at(s); for (let j = 1; j < 8; j++) { const a = Math.PI * j / 8, len = 0.5 + (j % 3) * 0.3; ic.push({ geo: new THREE.ConeGeometry(0.12, len, 5), x: p.x + p.dz * Math.cos(a) * (Rr - 0.2), y: S.heightAt(p.x, p.z) - 1 + Math.sin(a) * 5.2 - len / 2, z: p.z - p.dx * Math.cos(a) * (Rr - 0.2), rx: Math.PI }); } }
      sc.add(new THREE.Mesh(merge(ic), new THREE.MeshStandardMaterial({ color: 0xc8ecff, roughness: 0.1, emissive: 0x3a7ab0, emissiveIntensity: 0.2 })));
    }
    const arch = (x, z, yaw, label, opts) => {
      const g = new THREE.Group(), y = S.heightAt(x, z);
      for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 4, 8), M.mat(0x3a7ae8, { roughness: 0.5 })); p.position.set(sd * (S.RUN_W + 0.5), 2, 0); p.castShadow = true; g.add(p); }
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(S.RUN_W * 2 + 1.4, 1.3), new THREE.MeshStandardMaterial({ map: textTex(label, opts), side: THREE.DoubleSide, roughness: 0.6 }));
      ban.position.y = 3.6; g.add(ban);
      g.position.set(x, y, z); g.rotation.y = yaw + Math.PI;   // (le texte se lit en arrivant d'en haut)
      sc.add(g);
      return g;
    };
    const d0 = S.RUN.at(S.SLED_START.s + 4);
    arch(d0.x, d0.z, Math.atan2(d0.dx, d0.dz), 'DÉPART', { bg: '#2a6ad0' });
    const dl = S.RUN.at(S.RUN.total - 3);
    arch(dl.x, dl.z, Math.atan2(dl.dx, dl.dz), 'ARRIVÉE', { bg: '#d03a3a', checker: true, size: 56 });
    // les luges du sommet, appuyées contre un râtelier
    const R = S.SLED_RACK;
    const rack = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.12), M.mat(0x7a5030)); rack.position.set(R.x, R.y + 1.1, R.z); sc.add(rack);
    for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 6), M.mat(0x7a5030)); p.position.set(R.x + sd * 1.2, R.y + 0.6, R.z); sc.add(p); }
    for (let i = 0; i < 3; i++) { const s = buildSled(); s.position.set(R.x - 0.8 + i * 0.8, R.y + 0.05, R.z + 0.55); s.rotation.set(-1.15, 0, 0); s.scale.setScalar(0.85); sc.add(s); }
  }
  // une luge par joueur en train de descendre
  const sledPool = [];
  for (let i = 0; i < 6; i++) { const s = buildSled(); s.visible = false; sc.add(s); moving.push(s); sledPool.push(s); }
  const sledFor = (i) => sledPool[Math.min(i, sledPool.length - 1)];

  // --- la Cascade Gelée ------------------------------------------------------------------------
  {
    const ice = new THREE.MeshStandardMaterial({ color: 0xb8e2f8, roughness: 0.18, metalness: 0.05, emissive: 0x2a6aa0, emissiveIntensity: 0.18, flatShading: true });
    const parts = [], caps = [];
    for (const s of S.ICE_STEPS) {
      const g0 = S.heightAt(s.x, s.z) - 0.6, h = s.top - g0;
      parts.push({ geo: new THREE.CylinderGeometry(s.r, s.r * 1.08, h, 6), x: s.x, y: g0 + h / 2, z: s.z, ry: s.x * 0.7 });
      caps.push({ geo: paint(new THREE.CylinderGeometry(s.r * 0.92, s.r * 0.98, 0.16, 6), 0xf4f8ff), x: s.x, y: s.top + 0.04, z: s.z, ry: s.x * 0.7 });
    }
    const IF = S.ICEFALL, Lg = S.LEDGE;
    // le rideau de glace : une cascade figée, avec ses stalactites
    const fall = new THREE.PlaneGeometry(IF.w, Lg.top - 1.5, 14, 14);
    const fp = fall.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const u = fp.getX(i), v = fp.getY(i);
      fp.setZ(i, 0.35 + Math.sin(u * 2.3) * 0.25 + Math.sin(v * 1.3 + u) * 0.15 + (v < -(Lg.top - 1.5) / 2 + 1.5 ? 0.6 : 0));
    }
    fall.computeVertexNormals();
    const fallM = new THREE.Mesh(fall, new THREE.MeshStandardMaterial({ color: 0xd8f2ff, roughness: 0.08, metalness: 0.1, emissive: 0x4a9ad0, emissiveIntensity: 0.22, transparent: true, opacity: 0.88, side: THREE.DoubleSide }));
    fallM.position.set(Lg.x1 + 0.1, S.VILLAGE_Y + (Lg.top - 1.5) / 2 + 0.4, IF.z); fallM.rotation.y = Math.PI / 2;
    sc.add(fallM);
    const icicles = [];
    const r = rng(31);
    for (let z = Lg.z0 + 0.6; z < Lg.z1 - 0.4; z += 0.7) {
      const len = 0.5 + r() * 1.4;
      icicles.push({ geo: new THREE.ConeGeometry(0.12 + r() * 0.08, len, 5), x: Lg.x1 + 0.35, y: Lg.top - len / 2 - 0.05, z, rx: Math.PI });
    }
    const im = new THREE.Mesh(merge(parts.concat(icicles)), ice); im.castShadow = true; im.receiveShadow = true; sc.add(im);
    const cm = new THREE.Mesh(merge(caps), std({ vertexColors: true })); cm.receiveShadow = true; sc.add(cm);
    // rochers enneigés sur la corniche
    const rocks = [];
    for (let i = 0; i < 6; i++) { const x = Lg.x0 + 6 + r() * 10, z = Lg.z0 + 3 + r() * 24; if (Math.hypot(x + 86, z + 30) < 3) continue; rocks.push({ geo: paint(new THREE.IcosahedronGeometry(0.8 + r() * 0.8, 0), 0x8a8a94), x, y: Lg.top + 0.2, z, sy: 0.6 }); }
    if (rocks.length) { const rm = new THREE.Mesh(merge(rocks), std({ vertexColors: true, flatShading: true })); rm.castShadow = true; sc.add(rm); }
  }

  // --- la Crevasse de Cristal ---------------------------------------------------------------------
  {
    const g = area(S.CREVASSE.x, S.CREVASSE.z, 30);
    const walls = [], caps = [];
    for (const c of S.CREVASSE_WALLS) {
      const h = c.y1 - c.y0;
      walls.push({ geo: new THREE.BoxGeometry(c.w, h, c.d, 2, 3, 2), x: c.x, y: c.y0 + h / 2, z: c.z });
      caps.push({ geo: paint(new THREE.BoxGeometry(c.w + 0.3, 0.3, c.d + 0.3), 0xf4f8ff), x: c.x, y: c.y1 + 0.1, z: c.z });
    }
    const ice = new THREE.MeshStandardMaterial({ color: 0x9ad4f4, roughness: 0.15, metalness: 0.05, emissive: 0x1a5a90, emissiveIntensity: 0.25 });
    const wm = new THREE.Mesh(merge(walls), ice); wm.castShadow = wm.receiveShadow = true; g.add(wm);
    g.add(new THREE.Mesh(merge(caps), std({ vertexColors: true })));
    const cr = [], r = rng(61);
    for (let i = 0; i < 14; i++) {
      const c = S.CREVASSE_WALLS[i % S.CREVASSE_WALLS.length], sd = r() < 0.5 ? -1 : 1;
      const x = c.x + (c.w > c.d ? (r() - 0.5) * c.w : sd * (c.w / 2 + 0.3)), z = c.z + (c.w > c.d ? sd * (c.d / 2 + 0.3) : (r() - 0.5) * c.d);
      cr.push({ geo: paint(new THREE.OctahedronGeometry(0.35, 0), [0x8af0ff, 0xc08aff, 0x8affd8][i % 3]), x, y: S.CREVASSE.y + 0.8 + r() * 3, z, sy: 2, rz: (r() - 0.5) });
    }
    const cm = new THREE.Mesh(merge(cr), new THREE.MeshBasicMaterial({ vertexColors: true }));
    cm.userData.noOutline = true; g.add(cm);
    for (let i = 0; i < 4; i++) { const s = glowSprite([0x8af0ff, 0xc08aff][i % 2], 4, 0.4); s.position.set(S.CREVASSE.x + [0, 10, 10, 2][i], S.CREVASSE.y + 2, S.CREVASSE.z + [8, 2, -9, -17][i]); g.add(s); }
  }
  // --- le Fort Moustache ----------------------------------------------------------------------
  const FORT = S.FORT;
  let fortFlag = null;
  {
    const parts = [];
    for (const b of S.fortBlocks) {
      parts.push({ geo: paint(new THREE.BoxGeometry(2.9, b.h, 1.6, 2, 2, 1), 0xf0f4fc), x: b.x, y: b.y + b.h / 2 - 0.1, z: b.z, ry: -b.a + Math.PI / 2 });
      for (const k of [-0.8, 0.8]) parts.push({ geo: paint(new THREE.BoxGeometry(0.7, 0.45, 1.5), 0xe6eef8), x: b.x + Math.sin(b.a) * k, y: b.y + b.h + 0.12, z: b.z - Math.cos(b.a) * k, ry: -b.a + Math.PI / 2 });
    }
    for (const t of S.FORT_TOWERS) {
      parts.push({ geo: paint(new THREE.CylinderGeometry(t.r, t.r * 1.1, t.h, 12), 0xf0f4fc), x: t.x, y: FORT.y + t.h / 2, z: t.z });
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; parts.push({ geo: paint(new THREE.BoxGeometry(0.55, 0.5, 0.55), 0xe6eef8), x: t.x + Math.cos(a) * t.r * 0.8, y: FORT.y + t.h + 0.2, z: t.z + Math.sin(a) * t.r * 0.8 }); }
    }
    // piles de boules de neige
    const r = rng(77);
    for (const [px, pz] of [[FORT.x - 5, FORT.z - 3], [FORT.x + 5, FORT.z - 4], [FORT.x - 2, FORT.z - 6.5]]) {
      for (const [dx, dy, dz] of [[-0.3, 0.22, 0], [0.3, 0.22, 0], [0, 0.22, 0.4], [0, 0.55, 0.15]]) parts.push({ geo: paint(new THREE.SphereGeometry(0.24, 10, 8), 0xf8fbff), x: px + dx, y: FORT.y + dy, z: pz + dz });
      void r;
    }
    const fm = new THREE.Mesh(merge(parts), std({ vertexColors: true, map: snowTex, roughness: 0.85 })); fm.castShadow = true; fm.receiveShadow = true; sc.add(fm);
    // drapeau de la Capitaine sur une tour
    const t = S.FORT_TOWERS[0];
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), M.mat(0x3a2a24)); pole.position.set(t.x, FORT.y + t.h + 1.2, t.z); sc.add(pole);
    const ftex = canvasTex(128, 80, (x) => {
      x.fillStyle = '#ff6ab0'; x.fillRect(0, 0, 128, 80);
      x.fillStyle = '#2a2430'; x.beginPath(); x.arc(64, 44, 20, 0, 7); x.fill();
      x.beginPath(); x.moveTo(46, 34); x.lineTo(50, 14); x.lineTo(60, 28); x.fill(); x.beginPath(); x.moveTo(82, 34); x.lineTo(78, 14); x.lineTo(68, 28); x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 3; x.beginPath(); x.moveTo(48, 50); x.quadraticCurveTo(64, 44, 80, 50); x.stroke();
      x.fillStyle = '#ffd23a'; x.beginPath(); x.arc(56, 40, 3.5, 0, 7); x.arc(72, 40, 3.5, 0, 7); x.fill();
    });
    const fg = new THREE.PlaneGeometry(1.5, 0.95, 8, 2); fg.translate(0.78, 0, 0);
    fortFlag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: ftex, side: THREE.DoubleSide, roughness: 0.8 }));
    fortFlag.position.set(t.x, FORT.y + t.h + 1.9, t.z); sc.add(fortFlag);
    fortFlag.userData.base = fg.attributes.position.array.slice();
  }

  // la porte de neige du fort (elle s'enfonce quand on a assez de médailles)
  const gateMesh = new THREE.Group();
  {
    const G = S.FORT_GATE;
    const door = new THREE.Mesh(new THREE.BoxGeometry(G.w + 0.2, G.y1 - G.y0, G.d), std({ color: 0xe8f0fa, map: snowTex }));
    door.position.y = (G.y1 - G.y0) / 2; door.castShadow = true; gateMesh.add(door);
    const paw = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, (x) => { x.fillStyle = '#ff6ab0'; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.fill(); x.fillStyle = '#fff'; x.font = '700 64px Fredoka, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(S.FORT_MEDALS), 64, 70); }), transparent: true }));
    paw.position.set(0, 2.6, G.d / 2 + 0.02); gateMesh.add(paw);
    gateMesh.position.set(G.x, G.y0 + 1, G.z);
    sc.add(gateMesh);
  }
  // --- drapeaux (points de reprise) -------------------------------------------------------------
  const flagTex = flagTexture();
  const flags = S.CHECKPOINTS.map((c) => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 8), M.mat(0xf0e6d0, { metalness: 0.3, roughness: 0.4 }));
    pole.position.y = 1.8; g.add(pole);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), M.mat(0xffd23a, { metalness: 0.6, roughness: 0.3, emissive: 0x6a4800, emissiveIntensity: 0.5 }));
    knob.position.y = 3.65; g.add(knob);
    const clothGeo = new THREE.PlaneGeometry(1.4, 0.75, 8, 3); clothGeo.translate(0.72, 0, 0);
    const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8, color: 0x9a9a9a }));
    cloth.position.y = 1.0; g.add(cloth);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.4, 32), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05; halo.userData.noOutline = true; g.add(halo);
    g.position.set(c.x, c.y, c.z);
    sc.add(g);
    const up = snow().flags.includes(c.id) || c.id === 0;
    return { def: c, g, cloth, halo, base: clothGeo.attributes.position.array.slice(), raise: up ? 1 : 0, raisedAt: -9 };
  });

  // --- les habitants -----------------------------------------------------------------------------
  const folks = {};
  for (const id in S.FOLKS) {
    const f = S.FOLKS[id];
    const m = id === 'bernard' ? buildBernard() : id === 'myrtille' ? buildMyrtille() : id === 'pingo' ? buildPenguin(1.15, 'scarf') : buildPenguin(1.35, 'bow');
    m.position.set(f.x, f.y, f.z); m.rotation.y = f.yaw;
    sc.add(m); chars.push(m);
    folks[id] = { m, def: f, mark: game.makeMark(id === 'bernard' ? '!' : '?', id === 'bernard' ? 0xff9a2a : 0x8ad0ff) };
  }
  // le village des pingouins : igloos, petits pingouins
  const penguins = [];
  {
    const g = area(S.SPOTS.igloos.x, S.SPOTS.igloos.z, 26);
    const blocks = canvasTex(256, 128, (x, w, h) => { x.fillStyle = '#f4f8ff'; x.fillRect(0, 0, w, h); x.strokeStyle = '#b8cce4'; x.lineWidth = 3; for (let j = 0; j < 4; j++) { x.beginPath(); x.moveTo(0, j * 32); x.lineTo(w, j * 32); x.stroke(); for (let i = 0; i < 8; i++) { const px = i * 32 + (j % 2) * 16; x.beginPath(); x.moveTo(px, j * 32); x.lineTo(px, j * 32 + 32); x.stroke(); } } });
    blocks.wrapS = THREE.RepeatWrapping; blocks.repeat.set(3, 1);
    const im = std({ map: blocks, roughness: 0.8 });
    for (const ig of S.IGLOOS) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(ig.r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), im);
      dome.scale.y = 0.85; dome.position.set(ig.x, ig.y - 0.05, ig.z); dome.castShadow = dome.receiveShadow = true; g.add(dome);
      const door = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 12, 1, false, 0, Math.PI), im); door.rotation.set(0, 0, Math.PI / 2); door.rotation.order = 'ZYX';
      const tun = new THREE.Mesh(new THREE.SphereGeometry(0.95, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), im); tun.scale.set(1, 1, 1.5);
      const a = Math.atan2(S.LAKE.x - ig.x, S.LAKE.z - ig.z);
      tun.position.set(ig.x + Math.sin(a) * ig.r * 0.92, ig.y, ig.z + Math.cos(a) * ig.r * 0.92); tun.rotation.y = a; g.add(tun);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16, 0, Math.PI), new THREE.MeshBasicMaterial({ color: 0x1a2a3a }));
      hole.position.set(ig.x + Math.sin(a) * (ig.r * 0.92 + 1.38), ig.y + 0.02, ig.z + Math.cos(a) * (ig.r * 0.92 + 1.38)); hole.rotation.y = a; g.add(hole);
      void door;
    }
    for (let i = 0; i < 3; i++) {
      const p = buildPenguin(0.65 + i * 0.08);
      const x = S.SPOTS.igloos.x - 6 + i * 4, z = S.SPOTS.igloos.z - 9 + (i % 2) * 2;
      p.position.set(x, S.heightAt(x, z), z); sc.add(p); chars.push(p); moving.push(p);
      penguins.push({ m: p, x, z, ph: i * 2.1 });
    }
  }
  // le bébé pingouin (perdu sur le lac gelé)
  const baby = buildPenguin(0.5);
  sc.add(baby); chars.push(baby); moving.push(baby);
  const babyMark = game.makeMark('!', 0xff9a2a);
  // le renard et sa tanière
  const fox = buildFox();
  sc.add(fox); chars.push(fox); moving.push(fox);
  {
    const D = S.DEN, g = area(D.x, D.z, 16);
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), std({ color: 0x8a8a94, flatShading: true }));
    rock.scale.set(1, 0.8, 1); rock.position.set(D.x - 3, D.y + 0.6, D.z - 2.5); rock.castShadow = true; g.add(rock);
    const cap2 = new THREE.Mesh(new THREE.SphereGeometry(2.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3), std({ color: 0xf4f8ff })); cap2.position.set(D.x - 3, D.y + 1.2, D.z - 2.5); g.add(cap2);
    const holeD = new THREE.Mesh(new THREE.CircleGeometry(0.7, 16), new THREE.MeshBasicMaterial({ color: 0x1a1410 })); holeD.position.set(D.x - 1.3, D.y + 0.5, D.z - 1.2); holeD.rotation.y = 0.8; g.add(holeD);
  }
  // la Capitaine Moustache, en écharpe et bonnet, dans son fort
  const cap = buildCaptain();
  {
    const u = cap.userData;
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 8, 20), M.mat(0x3ab0e8, { roughness: 1 }));
    scarf.rotation.x = Math.PI / 2; scarf.position.set(0, -0.32, 0.05);
    if (u.head) u.head.add(scarf);
  }
  cap.scale.setScalar(1.25);
  sc.add(cap); chars.push(cap); moving.push(cap);
  const capShadow = game.makeShadow(1.0);

  // --- le jardin des bonshommes de neige ---------------------------------------------------------------
  const ballGeo = snowballGeo();
  const ballMat = std({ color: 0xf6f9ff, map: snowTex, roughness: 0.85 });
  const rollers = S.SNOWBALLS.map(b => { const m = new THREE.Mesh(ballGeo, ballMat); m.castShadow = true; sc.add(m); moving.push(m); return { def: b, m }; });
  const snowman = new THREE.Group();
  {
    const G = S.GARDEN;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(G.r, G.r + 0.4, 0.3, 24), std({ color: 0xdfe8f4 })); base.position.y = 0.1; snowman.add(base);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(G.r, 0.08, 6, 32), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.6 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.3; snowman.add(ring);
    snowman.userData.ring = ring;
    const parts = [];
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(ballGeo, ballMat); m.castShadow = true; m.visible = false; snowman.add(m); parts.push(m); }
    snowman.userData.parts = parts;
    const face = new THREE.Group(); face.visible = false; snowman.add(face);
    const coal = M.mat(0x1a1a1e);
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), coal); e.position.set(sx * 0.22, 0.15, 0.6); face.add(e); }
    for (let i = 0; i < 5; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), coal); const a = -0.6 + i * 0.3; b.position.set(Math.sin(a) * 0.38, -0.2 - Math.cos(a) * 0.08, 0.55); face.add(b); }
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.6, 16), M.mat(0x2a2430)); hat.position.y = 0.85; face.add(hat);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 18), M.mat(0x2a2430)); brim.position.y = 0.56; face.add(brim);
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.12, 8, 20), M.mat(0xe0303a, { roughness: 1 })); scarf.rotation.x = Math.PI / 2; scarf.position.y = -0.62; face.add(scarf);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 8), M.mat(0xf07a1a)); nose.rotation.x = Math.PI / 2; nose.position.set(0, 0, 0.9); nose.visible = false; face.add(nose);
    for (const sx of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.5, 5), M.mat(0x5a3a24)); arm.position.set(sx * 1.4, -1.0, 0); arm.rotation.z = sx * 1.0; face.add(arm); }
    snowman.userData.face = face; snowman.userData.nose = nose;
    snowman.position.set(G.x, S.heightAt(G.x, G.z), G.z);
    sc.add(snowman);
  }
  // --- la patinoire : bancs de neige, plots, podium ------------------------------------------------------
  const cones = [];
  {
    const RK = S.RINK, g = area(RK.x, RK.z, 26);
    const bank = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 6, 48), std({ color: 0xf4f8ff, map: snowTex }));
    bank.rotation.x = Math.PI / 2; bank.scale.set(RK.rx + 0.8, RK.rz + 0.8, 8); bank.position.set(RK.x, RK.y + 0.05, RK.z); g.add(bank);
    for (const c of S.RINK_CONES) {
      const m = new THREE.Group();
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 10), M.mat(0xff7a1a, { roughness: 0.5 })); cone.position.y = 0.4; m.add(cone);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.23, 0.14, 10), M.mat(0xffffff)); band.position.y = 0.42; m.add(band);
      const glow = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.0, 24), new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0, depthWrite: false }));
      glow.rotation.x = -Math.PI / 2; glow.position.y = 0.04; glow.userData.noOutline = true; m.add(glow);
      m.position.set(c.x, RK.y, c.z); g.add(m);
      cones.push({ def: c, m, glow });
    }
    const P = S.RINK_PODIUM;
    const pod = new THREE.Mesh(new THREE.BoxGeometry(2.4, P.h, 1.8), M.mat(0xffc830, { metalness: 0.4, roughness: 0.4 })); pod.position.set(P.x, P.y + P.h / 2, P.z); pod.castShadow = true; g.add(pod);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.2), new THREE.MeshStandardMaterial({ map: textTex('Patinoire', { bg: '#2a6ad0', size: 64 }), side: THREE.DoubleSide }));
    sign.position.set(RK.x, RK.y + 3.4, RK.z - RK.rz - 1.5); g.add(sign);
    for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 3.4, 6), M.mat(0x3a3a44)); p.position.set(RK.x + sd * 2.4, RK.y + 1.7, RK.z - RK.rz - 1.5); g.add(p); }
  }

  // --- bonnets, boules de neige --------------------------------------------------------------------
  const bonnets = S.BONNETS.map(b => {
    const g = buildBonnet(b.col);
    const glow = glowSprite(b.col, 1.6, 0.5); g.add(glow); glow.position.y = 0.15;
    g.position.set(b.x, b.y + 0.8, b.z);
    sc.add(g); moving.push(g);
    return { def: b, g };
  });
  const SB_MAX = 28;
  const balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 1), std({ color: 0xffffff, roughness: 0.8, map: snowTex }), SB_MAX);
  balls.frustumCulled = false; balls.castShadow = true; sc.add(balls); moving.push(balls);

  // --- la couche de vie : bêtes, objets, défis éclair, habitants, cachettes (life.js) ---------
  const life = buildLife(game, { L: S, plan: LIFE.PLAN, palette: LIFE.PALETTE, lines: LIFE.LINES, allDoneText: 'Une aurore boréale danse au-dessus du sommet !',
    propMat: art ? SA.richMaterial({ lamp: true }) : null, villagerModels: { snowman: 'snowmanHD' } });
  // l'aurore boréale au-dessus du sommet (plus vive quand tous les défis éclair sont réussis)
  const aurora = (() => {
    const geo = new THREE.PlaneGeometry(180, 34, 48, 1), p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 0.045) * 22 + Math.sin(x * 0.11) * 6); }
    const mat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uK: { value: 0.5 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uT, uK; varying vec2 vUv;
        void main() {
          float w = sin(vUv.x * 18.0 + uT * 0.7) * 0.5 + 0.5, w2 = sin(vUv.x * 41.0 - uT * 1.3) * 0.5 + 0.5;
          float band = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.45, vUv.y) * (0.55 + 0.45 * w * w2);
          vec3 col = mix(vec3(0.2, 1.0, 0.6), vec3(0.7, 0.4, 1.0), smoothstep(0.35, 0.95, vUv.y) + 0.2 * w);
          gl_FragColor = vec4(col * band * uK, band * uK);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(S.MOUNTAIN.x, S.SUMMIT_Y + 34, S.MOUNTAIN.z - 52); m.rotation.x = 0.12;
    m.userData.noOutline = true; m.frustumCulled = false;
    sc.add(m);
    return m;
  })();

  // =============================================================================================
  // État et règles
  // =============================================================================================
  const st = {
    cp: snow().cp, sb: [], lastThrow: 0, iceTold: false, liftTold: false, gateHintT: -9, ballHintT: -9,
    boss: { phase: 'idle', x: FORT.x, y: FORT.y, z: FORT.z - 4, yaw: 0, hp: 3, t: 0, throws: 0, inv: 0, hop: null },
    fox: { s: 'sit', x: S.DEN.x, z: S.DEN.z, y: S.DEN.y, yaw: 0, tx: 0, tz: 0, ph: 0 },
    baby: { s: 'lost', x: S.BABY.x, z: S.BABY.z, y: S.BABY.y, yaw: 0, ph: 0, who: -1 },
    rolls: [],
    race: null,
    gateK: 0,
  };
  const B = st.boss;
  const near = (x, z) => game.nearestPlayer({ x, z });
  const headY = (P) => P.pos.y + (P.mesh && P.mesh.userData.ainu ? 1.2 : 0.8);
  const medalsWithout = (id) => save().medals.filter(m => m !== id).length;
  function resetRolls() {
    const k = snow();
    st.rolls = S.SNOWBALLS.filter(b => !k.placed.includes(b.id)).map(b => ({ id: b.id, x: b.x, z: b.z, r: 0.45, y: S.heightAt(b.x, b.z) + 0.45, rot: 0 }));
  }
  resetRolls();
  /** Où est le bonnet (celui du renard tombe là où le renard l'a lâché). */
  function bonnetAt(b) {
    const k = snow();
    if (b.fox && k.foxAt) return { x: k.foxAt[0], z: k.foxAt[1], y: S.heightAt(k.foxAt[0], k.foxAt[1]) };
    return b;
  }
  const bonnetAvail = (b) => { const k = snow(); return b.fox ? !!k.foxDrop : b.race ? !!k.raceWon : true; };

  function reachFlag(c) {
    const k = snow();
    if (!k.flags.includes(c.id)) { k.flags.push(c.id); const f = flags[c.id]; f.raisedAt = game.t; game.sound('cp'); game.burst(c.x, c.y + 3.6, c.z, 20, 0xffe070, 4, 0.8); game.banner('Drapeau !', `${c.name} : on repartira d'ici.`, 1800); }
    if (k.cp !== c.id) { k.cp = c.id; st.cp = c.id; game.persist(); }
  }

  // --- luge : une vraie glisse, qu'on dirige comme un kart ---------------------------------------
  const SLED = { G: 22, TURN: 1.9, GRIP: 5.5, MAXV: 12 };
  function startSled(P) {
    if (P.ride) return;
    const s0 = S.SLED_START;
    P.attackT = 0; P.dashT = 0;
    P.pos.set(s0.x, S.heightAt(s0.x, s0.z), s0.z); P.yaw = s0.yaw; P.vel.set(0, 0, 0);
    P.ride = { kind: 'sled', vx: Math.sin(s0.yaw) * 3, vz: Math.cos(s0.yaw) * 3, vy: 0, air: false, yaw: s0.yaw, speed: 3, t0: game.t, gates: new Set(), side: {}, stuck: 0, camRate: 7, fromTop: true };
    game.sound('dash');
    if (!snow().sledTip) { snow().sledTip = 1; game.persist(); const k = game.controlsHelp(); game.banner('Attention… Glissade !', `Gauche / droite : tourner · en arrière : freiner · ${k.jump} : petit saut`, 4000); }
  }
  function endRide(P, vy) {
    const R = P.ride;
    if (!R) return;
    P.ride = null;
    const sp = Math.min(R.speed || 0, 6);
    P.vel.set(Math.sin(P.yaw) * sp, vy === undefined ? 3 : vy, Math.cos(P.yaw) * sp);
    P.grounded = false; P.jumps = 1;
    if (P.mesh) { P.mesh.rotation.x = 0; P.mesh.rotation.z = 0; }
  }
  function finishSled(P) {
    const R = P.ride, k = snow(), tm = game.t - R.t0, n = R.gates.size;
    endRide(P, 4);
    game.sound('win');
    for (let i = 0; i < 3; i++) game.burst(S.FINISH.x + (i - 1) * 3, S.heightAt(S.FINISH.x, S.FINISH.z) + 3.5, S.FINISH.z, 16, [0xff5a6a, 0xffd23a, 0x5ac8ff][i], 4.5, 0.9);
    const t = (Math.round(tm * 10) / 10).toFixed(1).replace('.', ',');
    k.runs = (k.runs | 0) + 1;
    P.cheerT = 1.4;
    if (n >= S.GATES_NEEDED) {
      const best = !k.best || tm < k.best;
      if (best) k.best = Math.round(tm * 10) / 10;
      const first = !k.sled;
      k.sled = true; game.persist();
      if (first) { game.updateMedalVisibility(); game.banner('Bravo, quelle glissade !', `${n} portes en ${t} s : une médaille brille sous l'arche d'arrivée !`, 3600); game.sound('reveal'); }
      else game.banner(`Descente : ${t} s · ${n} portes`, best ? 'Nouveau record !' : `Record : ${String(k.best).replace('.', ',')} s`, 2600);
    } else {
      game.persist();
      game.banner(`Arrivée ! ${n} porte${n > 1 ? 's' : ''} sur ${S.GATES_NEEDED}`, `Pour la médaille, passez entre au moins ${S.GATES_NEEDED} paires de fanions. Le télésiège vous remonte !`, 4200);
    }
  }
  /** sx : -1 gauche … +1 droite ; sy : -1 en avant … +1 en arrière (relatif à la luge). */
  function stepSled(P, R, sx, sy, pr, dt) {
    const frozen = game.dialog || game.freeze > 0;
    if (frozen) { sx = 0; sy = 0; }
    const x = P.pos.x, z = P.pos.z, e = 0.6;
    // Promenade : pilotage assisté (comme la direction assistée de Mario Kart) — quand on ne tourne pas,
    // la luge suit doucement la piste ; dès qu'on tourne soi-même, c'est l'enfant qui pilote
    if (game.easy && !frozen && Math.abs(sx) < 0.15) {
      const ri = S.runInfo(x, z);
      if (ri && ri.line && ri.d < S.RUN_W + 6) {
        const t = ri.line.at(ri.along + 9), want = Math.atan2(t.x - x, t.z - z);
        const dyaw = ((want - P.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        sx = clamp(-dyaw * 1.6, -0.8, 0.8);
      }
      if (Math.hypot(R.vx, R.vz) < 3 && sy > -0.4) sy = -1;   // et elle repart toute seule si elle ralentit
    }
    const gx = (S.heightAt(x + e, z) - S.heightAt(x - e, z)) / (2 * e), gz = (S.heightAt(x, z + e) - S.heightAt(x, z - e)) / (2 * e);
    // tourner (même à l'arrêt, un peu)
    const sp0 = Math.hypot(R.vx, R.vz);
    P.yaw -= clamp(sx, -1, 1) * SLED.TURN * (sp0 > 2 ? 1 : 0.6) * dt;
    const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    let vF = R.vx * fx + R.vz * fz, vS = R.vx * rx + R.vz * rz;
    if (!R.air) {
      // la pente tire la luge
      vF += -(gx * fx + gz * fz) * SLED.G * dt;
      vS += -(gx * rx + gz * rz) * SLED.G * dt;
      // les patins accrochent : la glissade de côté se change (en partie) en vitesse vers l'avant
      const vS2 = vS * Math.exp(-SLED.GRIP * dt);
      vF += Math.sign(vF || 1) * (Math.abs(vS) - Math.abs(vS2)) * 0.6;
      vS = vS2;
      // frottements : peu sur la piste damée, beaucoup dans la poudreuse
      const off = smooth(S.RUN_W + 0.5, S.RUN_W + 4, S.runInfo(x, z).d);
      const fr = (0.3 + off * 4.5) + 0.009 * vF * vF;
      vF -= Math.sign(vF) * Math.min(Math.abs(vF), fr * dt);
      if (sy > 0.4) vF -= Math.sign(vF) * Math.min(Math.abs(vF), 8 * sy * dt);       // freiner
      if (sy < -0.4 && vF < 3.5) vF += 3 * dt;                                          // pousser avec les pattes
    }
    vF = clamp(vF, -3, SLED.MAXV);
    R.vx = fx * vF + rx * vS; R.vz = fz * vF + rz * vS;
    R.speed = Math.hypot(R.vx, R.vz); R.yaw = P.yaw;
    // déplacement et chocs
    const next = { x: x + R.vx * dt, z: z + R.vz * dt };
    if (S.heightAt(next.x, next.z) > P.pos.y + 1.2) { R.vx *= -0.3; R.vz *= -0.3; next.x = x; next.z = z; game.sound('bump'); }
    const bx = next.x, bz = next.z;
    game.pushOut(next, P.pos.y, 0.6);
    const ox = next.x - bx, oz = next.z - bz, ol = Math.hypot(ox, oz);
    if (ol > 0.01) {
      const nx = ox / ol, nz = oz / ol, vn = R.vx * nx + R.vz * nz;
      if (vn < 0) { R.vx -= 1.4 * vn * nx; R.vz -= 1.4 * vn * nz; }
      if (R.speed > 3) { R.vx *= 0.6; R.vz *= 0.6; game.sound('bump'); game.burst(next.x, P.pos.y + 0.5, next.z, 8, 0xffffff, 3, 0.4); }
    }
    P.pos.x = next.x; P.pos.z = next.z;
    // vertical : on colle à la neige, sauf si elle tombe plus vite que nous (bosse, tremplin)
    const ground = game.support(P.pos.x, P.pos.z, P.pos.y + 0.6).y;
    if (pr.has('jump') && !R.air && !frozen) { R.vy = 7.5; R.air = true; game.sound('jump'); }
    else if (!R.air) {
      const free = P.pos.y + R.vy * dt - 15 * dt * dt;
      if (ground < free - 0.06 && R.speed > 6) R.air = true;
      else { R.vy = clamp((ground - P.pos.y) / dt, -14, 14); P.pos.y = ground; }
    }
    if (R.air) {
      R.vy -= 30 * dt; P.pos.y += R.vy * dt;
      if (P.pos.y <= ground) { P.pos.y = ground; R.air = false; R.vy = 0; game.burst(P.pos.x, ground + 0.2, P.pos.z, 8, 0xffffff, 2.5, 0.4); if (R.speed > 9) game.sound('poof'); }
    }
    P.vel.set(R.vx, R.air ? R.vy : 0, R.vz);
    P.grounded = !R.air;
    // portes : on compte celles qu'on traverse entre les fanions
    for (const g of S.GATES) {
      if (Math.abs(g.x - P.pos.x) > 14 || Math.abs(g.z - P.pos.z) > 14 || R.gates.has(g.id)) continue;
      const along = (P.pos.x - g.x) * g.dx + (P.pos.z - g.z) * g.dz, lat = (P.pos.x - g.x) * g.dz - (P.pos.z - g.z) * g.dx;
      const prev = R.side[g.id];
      R.side[g.id] = along;
      if (prev !== undefined && prev < 0 && along >= 0 && Math.abs(lat) <= g.half) {
        R.gates.add(g.id);
        game.sound('cp');
        game.burst(g.x, P.pos.y + 1.5, g.z, 14, 0xffe070, 3.5, 0.6);
        if (P === game.me) game.localBanner(`Porte ${R.gates.size}`, R.gates.size === S.GATES_NEEDED ? 'Assez pour la médaille : jusqu\'en bas !' : '', 900);
      }
    }
    // arrivée
    if (R.fromTop && Math.hypot(P.pos.x - S.FINISH.x, P.pos.z - S.FINISH.z) < S.FINISH.r) { finishSled(P); return; }
    // coincé (dans la poudreuse, contre un sapin…) : on descend de la luge
    R.stuck = R.speed < 0.7 && !R.air && Math.abs(sy) < 0.4 ? R.stuck + dt : 0;
    if (R.stuck > 3.5) { endRide(P, 2); if (P === game.me) game.localBanner('La luge s\'est arrêtée', 'Remontez au sommet par le télésiège pour une nouvelle descente', 2400); }
  }

  // --- télésiège -----------------------------------------------------------------------------------
  function startLift(P) {
    if (P.ride) return;
    const taken = game.players.filter(Q => Q.ride && Q.ride.kind === 'lift').map(Q => Q.ride.slot);
    let slot = 0; while (taken.includes(slot)) slot++;
    P.attackT = 0; P.dashT = 0; P.vel.set(0, 0, 0);
    P.ride = { kind: 'lift', s: 0, speed: S.LIFT_SPEED, yaw: liftYaw, slot: Math.min(slot, RIDERS - 1) };
    P.yaw = liftYaw;
    game.sound('switch');
    if (!st.liftTold) { st.liftTold = true; game.banner('En route vers le sommet !', 'Le télésiège vous dépose tout en haut', 2200); }
  }
  function liftPos(s) { const p = S.liftAt(s); return { x: p.x + side.x * LANE, y: p.y - S.SEAT_DROP, z: p.z + side.z * LANE }; }
  function stepLift(P, R, dt) {
    R.s += S.LIFT_SPEED * dt;
    const p = liftPos(R.s);
    P.pos.set(p.x, p.y + 0.1, p.z); P.yaw = liftYaw; R.yaw = liftYaw;
    P.vel.set(liftDir.x * S.LIFT_SPEED, 0, liftDir.z * S.LIFT_SPEED);
    P.grounded = true;
    if (R.s >= S.LIFT_LEN) {
      const D = S.TOP_DECK;
      P.ride = null;
      const i = P.id || 0;
      P.pos.set(D.x + Math.cos(i * 1.3) * 0.8, S.heightAt(D.x, D.z) + 0.25, D.z + Math.sin(i * 1.3) * 0.8);
      P.vel.set(liftDir.x * 2, 3, liftDir.z * 2); P.grounded = false; P.jumps = 1;
      game.sound('reveal');
      game.burst(P.pos.x, P.pos.y + 1, P.pos.z, 16, 0xffffff, 3, 0.6);
      if (!snow().summit) { snow().summit = 1; game.persist(); game.banner('Le sommet !', 'Bernard le sauveteur vous attend · la Grande Glissade aussi !', 3000); }
    }
  }

  // --- boules de neige -------------------------------------------------------------------------------
  function throwBall(fx, fy, fz, P, big) {
    if (st.sb.length >= SB_MAX) return;
    const lead = big ? 0.35 : 0.5;
    const tx = P.pos.x + P.vel.x * lead, tz = P.pos.z + P.vel.z * lead, ty = P.pos.y + 0.8;
    const d = Math.hypot(tx - fx, tz - fz), T = clamp(d / (big ? 10 : 12), 0.45, 1.3), g = 14;
    st.sb.push({ x: fx, y: fy, z: fz, vx: (tx - fx) / T, vz: (tz - fz) / T, vy: (ty - fy + 0.5 * g * T * T) / T, t: 0, big: !!big });
    game.sound('throw');
  }
  function stepBalls(dt) {
    const g = 14;
    st.sb = st.sb.filter((b) => {
      b.t += dt; b.vy -= g * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      for (const P of game.players) {
        const r = b.big ? 1.15 : 0.85;
        if ((P.pos.x - b.x) ** 2 + (headY(P) - 0.3 - b.y) ** 2 + (P.pos.z - b.z) ** 2 < r * r) {
          // ça ne fait pas mal : juste « pouf », et ça pousse un peu
          game.burst(b.x, b.y, b.z, b.big ? 18 : 10, 0xffffff, 3.5, 0.5);
          game.sound('poof');
          if (!P.ride) {
            const l = Math.hypot(b.vx, b.vz) || 1;
            P.vel.x += b.vx / l * (b.big ? 6 : 3.5); P.vel.z += b.vz / l * (b.big ? 6 : 3.5);
            if (P.grounded) { P.vel.y = b.big ? 4.5 : 2.5; P.grounded = false; }
          }
          if (game.t - (P.brrT || -9) > 2.5) { P.brrT = game.t; game.bubble(P, Math.random() < 0.5 ? 'Brrr !' : 'Pouf !'); }
          if (!snow().ballTold) { snow().ballTold = 1; game.persist(); game.banner('Pouf ! Une boule de neige !', 'Ça ne fait pas mal… mais ça chatouille ! Un « Ouaf ! » fait fuir les chats.', 3200); }
          return false;
        }
      }
      if (b.y < S.heightAt(b.x, b.z) || b.t > 3) { game.burst(b.x, Math.max(b.y, S.heightAt(b.x, b.z)) + 0.1, b.z, 6, 0xffffff, 2, 0.35); return false; }
      return true;
    });
  }
  function catThrows() {
    if (game.t - st.lastThrow < 0.7) return;
    for (const c of game.cats) {
      if (c.dead || c.flee > 0 || c.chasing) continue;
      if ((c.sbT = (c.sbT === undefined ? 1 + Math.random() * 3 : c.sbT)) > game.t) continue;
      const P = near(c.pos.x, c.pos.z);
      const d = Math.hypot(P.pos.x - c.pos.x, P.pos.z - c.pos.z);
      if (d < 6 || d > 16 || Math.abs(P.pos.y - c.pos.y) > 5 || (P.ride && P.ride.kind === 'lift')) { c.sbT = game.t + 0.6; continue; }
      c.yaw = Math.atan2(P.pos.x - c.pos.x, P.pos.z - c.pos.z);
      c.throwAnim = game.t;
      throwBall(c.pos.x + Math.sin(c.yaw) * 0.4, c.pos.y + 0.9, c.pos.z + Math.cos(c.yaw) * 0.4, P, false);
      c.sbT = game.t + (game.easy ? 4.5 : 3) + Math.random() * 2.5;
      st.lastThrow = game.t;
      return;
    }
  }

  // --- la bataille du Fort Moustache ---------------------------------------------------------------------
  function bossReset() { Object.assign(B, { phase: 'idle', x: FORT.x, z: FORT.z - 4, y: FORT.y, hp: 3, t: 0, throws: 0, inv: 0, hop: null }); }
  function setGate(open) { S.FORT_GATE.off = !!open; }
  setGate(snow().fort || medalsWithout('m_fort') >= S.FORT_MEDALS);
  function stepBoss(dt) {
    if (snow().fort) { if (B.phase !== 'friend' && B.phase !== 'won') { B.phase = 'friend'; B.x = FORT.x + 2.5; B.z = FORT.z - 4; B.y = FORT.y; } }
    const p = near(B.x, B.z);
    const dA = (q) => Math.hypot(q.pos.x - FORT.x, q.pos.z - FORT.z);
    const inFort = game.players.some(q => dA(q) < FORT.r - 1.2 && Math.abs(q.pos.y - FORT.y) < 3 && !q.ride);
    const far = game.players.every(q => dA(q) > FORT.r + 10);
    B.inv = Math.max(0, B.inv - dt);
    if (B.phase === 'friend' || B.phase === 'won') { B.yaw = lerpAngle(B.yaw, Math.atan2(p.pos.x - B.x, p.pos.z - B.z), dt * 3); return; }
    if (B.phase === 'idle') {
      B.yaw = lerpAngle(B.yaw, Math.atan2(p.pos.x - B.x, p.pos.z - B.z), dt * 3);
      if (inFort && !game.dialog && save().intro && S.FORT_GATE.off) {
        B.phase = 'intro';
        game.say([
          { who: 'Capitaine Moustache', text: 'Miaou-ha-ha ! Les voilà, mes chiens préférés ! Bienvenue au Fort Moustache !' },
          { who: 'Capitaine Moustache', text: 'Le jeu est simple : je vous lance des boules de neige… et vous essayez de m\'attraper !' },
          { who: 'Matcha', text: 'Quand elle est essoufflée, on fonce, Ainu !' },
        ], () => { B.phase = 'throw'; B.t = 0.8; B.throws = 0; });
      }
      return;
    }
    if (B.phase === 'intro') return;
    if (far) { bossReset(); return; }
    B.t -= dt;
    if (B.phase === 'throw') {
      B.yaw = lerpAngle(B.yaw, Math.atan2(p.pos.x - B.x, p.pos.z - B.z), dt * 6);
      if (B.t <= 0) {
        throwBall(B.x + Math.sin(B.yaw) * 0.6, B.y + 1.6, B.z + Math.cos(B.yaw) * 0.6, p, true);
        B.throws++;
        B.t = B.throws >= 3 ? 0.8 : 1.25;
        if (B.throws >= 3) B.phase = 'wait';
      }
    } else if (B.phase === 'wait') {
      if (B.t <= 0) { B.phase = 'tired'; B.t = game.easy ? 6 : 4.5; game.banner('Elle est essoufflée !', 'Vite, attrapez-la !', 1500); }
    } else if (B.phase === 'tired') {
      if (B.t <= 0) { B.phase = 'throw'; B.t = 0.6; B.throws = 0; }
    } else if (B.phase === 'hop') {
      const h = B.hop; h.t += dt;
      const k = Math.min(1, h.t / h.T);
      B.x = h.x0 + (h.x1 - h.x0) * k; B.z = h.z0 + (h.z1 - h.z0) * k; B.y = FORT.y + Math.sin(k * Math.PI) * 3.5;
      if (k >= 1) { B.y = FORT.y; B.phase = 'throw'; B.t = 0.8; B.throws = 0; }
    }
    for (const q of game.players) {
      if (B.phase === 'hop') break;
      const d = Math.hypot(q.pos.x - B.x, q.pos.z - B.z), dy = q.pos.y - B.y;
      if (d < 2.3 && dy > -1 && dy < 3) {
        const attacking = q.attackT > 0 || q.dashT > 0 || (q.vel.y < -1 && dy > 1.0) || (q.barkT || 0) > 0.55;
        if (B.phase === 'tired' && attacking && B.inv <= 0) { hitBoss(q); break; }
        if (d < 1.4 && B.phase !== 'tired') { const l = d || 1; q.vel.x += (q.pos.x - B.x) / l * 3; q.vel.z += (q.pos.z - B.z) / l * 3; }
      }
    }
  }
  function hitBoss(q) {
    B.hp--; B.inv = 1;
    game.sound('bossHit');
    game.burst(B.x, B.y + 1.6, B.z, 26, 0xffffff, 5, 0.7);
    if (q.vel.y < 0) q.vel.y = 9;
    if (B.hp <= 0) {
      B.phase = 'won';
      st.sb.length = 0;
      game.say([
        { who: 'Capitaine Moustache', text: 'Pouce ! Pouce ! Vous m\'avez attrapée trois fois !' },
        { who: 'Capitaine Moustache', text: 'C\'était la meilleure bataille de boules de neige de toute ma vie. Tenez, voilà votre médaille.' },
        { who: 'Ainu', text: 'Ouaf ! On refait une partie quand tu veux !' },
      ], () => {
        snow().fort = true; game.persist();
        B.phase = 'friend';
        game.updateMedalVisibility();
        game.banner('Bataille gagnée !', 'Une Médaille des Neiges brille dans le fort !', 3000);
        game.sound('reveal');
      });
      return;
    }
    game.banner(B.hp === 2 ? 'Attrapée !' : 'Encore une fois !', `Il reste ${B.hp} fois`, 1400);
    const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 3.5;
    B.phase = 'hop'; B.hop = { t: 0, T: 0.9, x0: B.x, z0: B.z, x1: FORT.x + Math.cos(a) * r, z1: FORT.z + Math.sin(a) * r };
  }

  // --- le renard ---------------------------------------------------------------------------------------
  function stepFox(dt) {
    const F = st.fox, k = snow(), D = S.DEN;
    F.ph += dt;
    if (k.foxDrop) { F.s = 'calm'; }
    const p = near(F.x, F.z), d = Math.hypot(p.pos.x - F.x, p.pos.z - F.z);
    // un gros « Ouaf ! » tout près : il sursaute et lâche le bonnet
    if (!k.foxDrop) for (const q of game.players) {
      if ((q.barkT || 0) > 0.6 && Math.hypot(q.pos.x - F.x, q.pos.z - F.z) < 11) {
        k.foxDrop = true; k.foxAt = [Math.round(F.x * 10) / 10, Math.round(F.z * 10) / 10]; game.persist();
        F.s = 'calm';
        game.sound('reveal'); game.burst(F.x, F.y + 1, F.z, 18, 0x40c060, 4, 0.7);
        game.banner('Le renard a eu peur !', 'Il a lâché le bonnet vert : ramassez-le !', 3000);
        break;
      }
    }
    if (F.s === 'calm') { F.yaw = lerpAngle(F.yaw, Math.atan2(p.pos.x - F.x, p.pos.z - F.z), dt * 3); return; }
    if (F.s === 'sit' && d < 8) {
      // il file plus loin dans la forêt (en gardant son bonnet)
      const a = Math.atan2(F.x - p.pos.x, F.z - p.pos.z) + (Math.random() - 0.5) * 1.6, r = 12 + Math.random() * 8;
      F.tx = D.x + Math.sin(a) * r; F.tz = D.z + Math.cos(a) * r; F.s = 'run';
      if (!st.foxTold && p === game.me) { st.foxTold = true; game.banner('Un renard !', 'Il a un bonnet vert dans la gueule… et il est rapide !', 2600); }
    }
    if (F.s === 'run') {
      const dx = F.tx - F.x, dz = F.tz - F.z, l = Math.hypot(dx, dz);
      if (l < 0.6) { F.s = 'sit'; return; }
      const sp = 7.5 * dt, nx = F.x + dx / l * sp, nz = F.z + dz / l * sp;
      if (S.blockedAt(nx, nz) || Math.abs(S.heightAt(nx, nz) - F.y) > 1) { F.s = 'sit'; return; }
      F.x = nx; F.z = nz; F.y = S.heightAt(nx, nz); F.yaw = Math.atan2(dx, dz);
    }
  }
  // --- le bébé pingouin ----------------------------------------------------------------------------------
  function stepBaby(dt) {
    const Bb = st.baby, k = snow(), mom = S.FOLKS.maman;
    Bb.ph += dt;
    if (k.baby === 'home') { Bb.s = 'home'; Bb.x = mom.x + 1.4; Bb.z = mom.z + 1.6; Bb.y = mom.y; return; }
    const free = logic.reveal().m_lake;
    if (Bb.s === 'lost' && free) { Bb.s = 'free'; game.banner('Le bébé pingouin est libre !', 'Allez le chercher sur l\'îlot, au milieu du lac', 2800); game.sound('reveal'); }
    if (Bb.s === 'free') {
      const p = near(Bb.x, Bb.z);
      if (Math.hypot(p.pos.x - Bb.x, p.pos.z - Bb.z) < 2.6 && Math.abs(p.pos.y - Bb.y) < 2) { Bb.s = 'follow'; Bb.who = p.id || 0; game.banner('Piou piou !', 'Le bébé pingouin vous suit : ramenez-le à sa maman, au village des pingouins', 3000); }
    }
    if (Bb.s === 'follow') {
      const P = game.party.get(Bb.who) || game.player;
      const tx = P.pos.x - Math.sin(P.yaw) * 1.6, tz = P.pos.z - Math.cos(P.yaw) * 1.6;
      const dx = tx - Bb.x, dz = tz - Bb.z, d = Math.hypot(dx, dz);
      if (d > 25) { Bb.x = tx; Bb.z = tz; }
      else if (d > 0.4) { const sp = Math.min(d * 3, 11) * dt; Bb.x += dx / d * sp; Bb.z += dz / d * sp; Bb.yaw = lerpAngle(Bb.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10)); }
      Bb.y += (game.support(Bb.x, Bb.z, Math.max(Bb.y, P.pos.y) + 0.5).y - Bb.y) * Math.min(1, dt * 12);
      if (Math.hypot(Bb.x - mom.x, Bb.z - mom.z) < 7) {
        k.baby = 'home'; game.persist(); Bb.s = 'home';
        game.updateMedalVisibility(); game.sound('reveal');
        game.say([
          { who: 'Maman Pingouin', text: 'Mon petit Pipo ! Tu es revenu ! Merci, merci, les toutous !' },
          { who: 'Maman Pingouin', text: 'Prenez cette médaille : on l\'avait trouvée dans la neige. Elle est à vous !' },
        ], () => game.banner('Le bébé pingouin est rentré !', 'Une Médaille des Neiges brille devant les igloos', 2800));
      }
    }
  }
  // --- les boules du bonhomme de neige ---------------------------------------------------------------------
  function stepRolls(dt) {
    const k = snow(), G = S.GARDEN;
    for (const b of st.rolls) {
      for (const P of game.players) {
        if (P.ride || !P.grounded) continue;
        const dx = b.x - P.pos.x, dz = b.z - P.pos.z, d = Math.hypot(dx, dz), sp = Math.hypot(P.vel.x, P.vel.z);
        if (d > b.r + 0.75 || sp < 1 || Math.abs(P.pos.y - (b.y - b.r)) > 1.5) continue;
        // on la pousse dans le sens de la course : elle roule et grossit
        const nx = dx / (d || 1), nz = dz / (d || 1), push = Math.max(0, P.vel.x * nx + P.vel.z * nz);
        const p = { x: P.pos.x + nx * (b.r + 0.76) + nx * push * dt, z: P.pos.z + nz * (b.r + 0.76) + nz * push * dt };
        game.pushOut(p, b.y - b.r, b.r * 0.8);
        if (S.heightAt(p.x, p.z) > b.y - b.r + 0.9) continue;
        const moved = Math.hypot(p.x - b.x, p.z - b.z);
        b.x = p.x; b.z = p.z; b.rot += moved / b.r;
        b.r = Math.min(1.35, b.r + moved * 0.016);
        b.y = S.heightAt(b.x, b.z) + b.r;
        if (!st.rollTold && P === game.me) { st.rollTold = true; game.banner('Elle roule… et elle grossit !', 'Poussez-la jusqu\'au jardin des bonshommes', 2400); }
      }
      // arrivée au jardin
      if (Math.hypot(b.x - G.x, b.z - G.z) < G.r + b.r * 0.6) {
        if (b.r < 0.8) { if (game.t - st.ballHintT > 4) { st.ballHintT = game.t; game.banner('Encore trop petite !', 'Faites-la rouler un peu plus loin dans la neige pour qu\'elle grossisse', 2400); } }
        else {
          k.placed.push(b.id); game.persist();
          b.done = true;
          game.sound('reveal'); game.burst(G.x, S.heightAt(G.x, G.z) + 2, G.z, 22, 0xffffff, 4, 0.7);
          game.banner(`Bonhomme de neige : ${k.placed.length}/3`, k.placed.length < 3 ? 'Encore une boule !' : 'Il lui manque un nez… Myrtille a peut-être une carotte !', 3000);
        }
      }
    }
    st.rolls = st.rolls.filter(b => !b.done);
    // une boule égarée revient à sa place quand personne n'est près
    if ((st.rollT = (st.rollT || 0) + dt) > 5) {
      st.rollT = 0;
      for (const b of st.rolls) { const d0 = S.SNOWBALLS.find(q => q.id === b.id); if (game.players.every(P => Math.hypot(P.pos.x - b.x, P.pos.z - b.z) > 70) && Math.hypot(b.x - d0.x, b.z - d0.z) > 3) Object.assign(b, { x: d0.x, z: d0.z, r: 0.45, y: S.heightAt(d0.x, d0.z) + 0.45 }); }
    }
    // la carotte
    if (k.placed.length >= 3 && k.carrot === 'have' && game.players.some(P => Math.hypot(P.pos.x - G.x, P.pos.z - G.z) < 4.5)) {
      k.carrot = 'placed'; k.snowman = true; game.persist();
      game.updateMedalVisibility(); game.sound('reveal');
      game.burst(G.x, S.heightAt(G.x, G.z) + 3.5, G.z, 30, 0xffa040, 4, 0.8);
      game.banner('Le bonhomme de neige est fini !', 'Avec son nez en carotte. Une médaille brille à côté de lui !', 3200);
    }
  }
  // --- la course de patinage contre Pingo ----------------------------------------------------------------
  const PINGO_PATH = (u) => { const a = Math.PI / 2 + (u % 1) * Math.PI * 2; return { x: S.RINK.x + Math.cos(a) * (S.RINK.rx - 5), z: S.RINK.z + Math.sin(a) * (S.RINK.rz - 3.6), a }; };
  const PERIM = (() => { let l = 0; for (let i = 0; i < 64; i++) { const a = PINGO_PATH(i / 64), b = PINGO_PATH((i + 1) / 64); l += Math.hypot(b.x - a.x, b.z - a.z); } return l; })();
  function startRace(P) {
    if (st.race) return;
    st.race = { racer: P.id || 0, cd: 3, t: 0, next: 0, pu: 0, last: 3 };
    game.banner('3…', 'Passez près de chaque plot orange, dans l\'ordre, deux tours !', 1200);
  }
  function stepRace(dt) {
    const R = st.race;
    if (!R) return;
    const P = game.party.get(R.racer) || game.player, k = snow(), N = S.RINK_CONES.length, total = N * S.RINK_LAPS;
    if (R.cd > 0) {
      R.cd -= dt;
      const c = Math.ceil(R.cd);
      if (c !== R.last && c > 0) { R.last = c; game.banner(c + '…', '', 800); game.sound('switch'); }
      if (R.cd <= 0) { game.banner('Partez !', 'Plot après plot, deux tours', 1200); game.sound('reveal'); }
      return;
    }
    R.t += dt;
    const v = game.easy ? 3.5 : game.mode === 'defi' ? 5.2 : 4.0;
    R.pu += v * dt / PERIM;
    const c = S.RINK_CONES[R.next % N];
    if (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 3.2) { R.next++; game.sound('cp'); cones[c.i].hit = game.t; }
    if (R.next >= total) {
      const tm = Math.round(R.t * 10) / 10, first = !k.raceWon, best = !k.raceBest || tm < k.raceBest;
      k.raceWon = true; if (best) k.raceBest = tm; game.persist();
      st.race = null;
      game.sound('win'); P.cheerT = 1.4;
      game.banner(first ? 'Vous avez battu Pingo !' : `Victoire en ${String(tm).replace('.', ',')} s`, first ? 'Il vous offre un bonnet violet, sur le podium !' : best ? 'Nouveau record !' : `Record : ${String(k.raceBest).replace('.', ',')} s`, 3200);
      return;
    }
    if (R.pu >= S.RINK_LAPS || Math.hypot(P.pos.x - S.RINK.x, P.pos.z - S.RINK.z) > 40) {
      st.race = null;
      game.banner('Pingo a gagné !', 'Parlez-lui pour une revanche. Astuce : prenez de l\'élan, et lâchez tout dans les virages !', 3600);
    }
  }

  // --- dialogues ------------------------------------------------------------------------------------
  function talkBernard() {
    const k = snow(), n = k.bonnets.length, total = S.BONNETS.length;
    if (!k.metBernard) {
      game.say([
        { who: 'Bernard', text: 'Wouf ! Bonjour, les petits ! Je suis Bernard, le sauveteur de la montagne.' },
        { who: 'Bernard', text: 'Si quelqu\'un a froid ou se perd dans la neige, j\'arrive avec mon tonnelet de chocolat chaud !' },
        { who: 'Matcha', text: 'Du chocolat ? Moi, j\'ai un peu froid aux pattes…' },
        { who: 'Bernard', text: 'Ha ha ! Dites, vous pourriez m\'aider ? La tempête a emporté les cinq bonnets à pompon des chiots de l\'école de ski.' },
        { who: 'Bernard', text: 'Ils sont éparpillés dans toute la station : en haut de la Cascade Gelée, au fond de la Crevasse de Cristal, sur la gare du télésiège…' },
        { who: 'Bernard', text: 'Et on raconte qu\'un renard en a chipé un, et que Pingo, à la patinoire, en garde un pour le champion de patinage !' },
        { who: 'Ainu', text: 'Ouaf ! On les retrouve, promis !' },
        { who: 'Bernard', text: 'Et pour redescendre, prenez une luge, juste là : c\'est la Grande Glissade ! Passez entre les fanions, il y a une médaille à gagner.' },
      ], () => { k.metBernard = true; game.persist(); game.updateHud(); });
      return;
    }
    if (n >= total && !k.bonnetsGiven) {
      game.say([
        { who: 'Bernard', text: 'Les cinq bonnets ! Les chiots de l\'école de ski vont être tout contents. Tenez, cette médaille est pour vous !' },
      ], () => { k.bonnetsGiven = true; game.persist(); game.updateMedalVisibility(); game.sound('reveal'); game.banner('Merci, Bernard !', 'Une Médaille des Neiges brille à côté de lui', 2600); });
      return;
    }
    if (k.bonnetsGiven) { game.say([{ who: 'Bernard', text: 'Merci, les petits ! Et n\'oubliez pas : une bonne glissade, ça réchauffe !' }]); return; }
    const left = S.BONNETS.filter(b => !k.bonnets.includes(b.id));
    game.say([
      { who: 'Bernard', text: `Encore ${left.length} bonnet${left.length > 1 ? 's' : ''} à retrouver. Courage, les petits !` },
      { who: 'Bernard', text: `Il y en a un ${left[0].where}.` },
    ]);
  }
  function talkMyrtille() {
    const k = snow(), s = save();
    if (!k.metMyrtille) {
      game.say([
        { who: 'Myrtille', text: 'Oh ! Vous devez être Ainu et Matcha ! Votre Mamie m\'a tellement parlé de vous.' },
        { who: 'Myrtille', text: 'Je suis Myrtille. Mamie et moi, on se connaît depuis qu\'on est toutes petites !' },
        { who: 'Myrtille', text: 'Ici, c\'est mon chalet-chocolat. Quand vous aurez trouvé les cinq médailles, je vous prépare une grande fête avec du chocolat chaud !' },
        { who: 'Biscotte', text: 'Avec de la crème fouettée ?' },
        { who: 'Myrtille', text: 'Avec plein de crème fouettée !' },
        { who: 'Myrtille', text: 'Et si vous passez au jardin des bonshommes, juste à côté : poussez les grosses boules de neige, elles grossissent en roulant !' },
      ], () => { k.metMyrtille = true; game.persist(); });
      return;
    }
    if (k.placed.length >= 3 && !k.carrot) {
      game.say([
        { who: 'Myrtille', text: 'Votre bonhomme de neige n\'a pas de nez ? Tenez, une belle carotte toute fraîche !' },
        { who: 'Matcha', text: 'Merci Myrtille ! On court la lui mettre !' },
      ], () => { k.carrot = 'have'; game.persist(); game.banner('Une carotte !', 'Apportez-la au bonhomme de neige, au jardin', 2400); });
      return;
    }
    if (s.medals.length >= S.medals.length) { game.say([{ who: 'Myrtille', text: 'Le chocolat est prêt ! Merci d\'avoir rendu la joie à toute la station.' }]); return; }
    const tips = [
      'Un petit conseil : sur la glace, on ne freine pas facilement. Prenez votre élan… et glissez !',
      'Les blocs de la Cascade Gelée sont hauts : sautez deux fois pour monter !',
      'Le télésiège part de la gare au toit plat, au nord du village. Tout là-haut, il y a des luges !',
      'La Capitaine adore les boules de neige. Quand elle est essoufflée, c\'est le moment de l\'attraper !',
      'Le renard de la forêt a peur des gros « Ouaf ! ». Mais il faut l\'approcher sans qu\'il file…',
      'La rivière gelée traverse toute la station : on peut la descendre en glissant, jusqu\'au lac !',
    ];
    k.tip = ((k.tip | 0) + 1) % tips.length;
    game.say([{ who: 'Myrtille', text: tips[k.tip] }]);
  }
  function talkPingo(P) {
    const k = snow();
    if (st.race) return;
    if (!k.metPingo) {
      game.say([
        { who: 'Pingo', text: 'Coin coin ! Moi, c\'est Pingo, le roi de la patinoire !' },
        { who: 'Pingo', text: 'Une course ? Deux tours, en passant près de chaque plot orange. Si vous me battez, je vous donne mon bonnet violet !' },
        { who: 'Ainu', text: 'Ouaf ! Prêts !' },
      ], () => { k.metPingo = true; game.persist(); startRace(P); });
      return;
    }
    game.say([{ who: 'Pingo', text: k.raceWon ? 'Coin ! Une revanche ? Cette fois, je vais plus vite !' : 'Coin coin ! On recommence ? Prenez bien vos virages !' }], () => startRace(P));
  }
  function talkMaman() {
    const k = snow();
    if (k.baby === 'home') { game.say([{ who: 'Maman Pingouin', text: 'Pipo ne quitte plus les igloos. Merci encore, les toutous !' }]); return; }
    game.say([
      { who: 'Maman Pingouin', text: 'Oh, des chiens ! Aidez-moi, je vous en prie : mon bébé Pipo s\'est perdu sur le lac gelé.' },
      { who: 'Maman Pingouin', text: 'Les chats farceurs patinent tout autour de lui, et il n\'ose plus bouger ! Faites-les partir, et ramenez-le-moi.' },
    ], () => { k.metMaman = true; game.persist(); });
  }

  // =============================================================================================
  const logic = {
    moving, chars, life,
    playerStep(P, wx, wz, jumpHeld, pr, dt, input) {
      const R = P.ride;
      if (!R) return false;
      P.invuln = Math.max(0, P.invuln - dt);
      P.cheerT = Math.max(0, P.cheerT - dt);
      P.flipT = 0; P.attackT = 0; P.dashT = 0;
      if (R.kind === 'sled') {
        if (pr.has('talk') && !game.dialog) { pr.delete('talk'); endRide(P, 3); return true; }
        // la manette, telle quelle (gauche / droite par rapport à la luge) ; sinon, d'après la direction
        let sx, sy;
        if (input && input.x !== undefined && input.wx === undefined) { sx = input.x; sy = input.y; }
        else if (input && input.sx !== undefined) { sx = input.sx; sy = input.sy; }
        else { sx = wx * -Math.cos(P.yaw) + wz * Math.sin(P.yaw); sy = -(wx * Math.sin(P.yaw) + wz * Math.cos(P.yaw)); }
        stepSled(P, R, sx || 0, sy || 0, pr, dt);
      } else stepLift(P, R, dt);
      return true;
    },
    nearFor(Q) {
      if (!Q.ride) return undefined;
      return Q.ride.kind === 'sled' ? { kind: 'lv', act: 'exit', label: 'DESCENDRE', x: Q.pos.x, z: Q.pos.z, y: Q.pos.y } : null;
    },
    extraCandidates(Q) {
      const out = Q ? life.candidates(Q) : [];
      const R = S.SLED_RACK, B0 = LIFT.base;
      out.push({ kind: 'lv', act: 'sled', label: 'LUGE', x: R.x, z: R.z, y: R.y });
      out.push({ kind: 'lv', act: 'sled', label: 'LUGE', x: S.SLED_START.x, z: S.SLED_START.z, y: S.heightAt(S.SLED_START.x, S.SLED_START.z) });
      out.push({ kind: 'lv', act: 'lift', label: 'TÉLÉSIÈGE', x: B0.x, z: B0.z, y: B0.y });
      for (const id in folks) { const f = folks[id].def; out.push({ kind: 'lv', act: 'talk', id, label: id === 'pingo' && !st.race ? 'COURSE' : 'PARLER', x: f.x, z: f.z, y: f.y }); }
      if (B.phase === 'friend') out.push({ kind: 'lv', act: 'talk', id: 'cap', label: 'PARLER', x: B.x, z: B.z, y: B.y });
      return out;
    },
    interact(n, P) {
      if (n.life) { life.interact(n, P); return; }
      if (n.act === 'sled') startSled(P);
      else if (n.act === 'lift') startLift(P);
      else if (n.act === 'exit') endRide(P, 3);
      else if (n.id === 'bernard') talkBernard();
      else if (n.id === 'myrtille') talkMyrtille();
      else if (n.id === 'pingo') talkPingo(P);
      else if (n.id === 'maman') talkMaman();
      else if (n.id === 'cap') game.say([{ who: 'Capitaine Moustache', text: 'Je rends tout, promis. Bon… presque tout. Je garde une boule de neige, pour plus tard !' }]);
    },
    step(dt) {
      const players = game.players, k = snow();
      for (const P of players) {
        for (const c of S.CHECKPOINTS) if (Math.abs(P.pos.x - c.x) < 4 && Math.abs(P.pos.z - c.z) < 4 && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 3.5 && Math.abs(P.pos.y - c.y) < 3 && (k.cp !== c.id || !k.flags.includes(c.id))) reachFlag(c);
        for (const b of S.BONNETS) {
          if (k.bonnets.includes(b.id) || !bonnetAvail(b)) continue;
          const at = bonnetAt(b);
          if (Math.hypot(P.pos.x - at.x, P.pos.z - at.z) < 1.6 && Math.abs(P.pos.y + 0.6 - (at.y + 0.8)) < 1.6) {
            k.bonnets.push(b.id); game.persist();
            game.burst(at.x, at.y + 0.8, at.z, 20, b.col, 4, 0.7);
            game.sound('ball');
            if (k.bonnets.length >= S.BONNETS.length) { game.sound('reveal'); game.banner('Les 5 bonnets !', 'Rapportez-les à Bernard, au sommet de la montagne', 3200); }
            else game.banner(`Bonnet à pompon ${k.bonnets.length}/${S.BONNETS.length}`, k.metBernard ? 'Bernard sera content !' : 'C\'est à l\'école de ski : Bernard le cherche, au sommet !', 2000);
          }
        }
        if (!st.iceTold && P === game.me && P.grounded && S.iceAt(P.pos.x, P.pos.z, P.pos.y)) { st.iceTold = true; game.banner('Ça glisse !', 'Sur la glace, on patine : prenez de l\'élan et glissez !', 2600); }
      }
      // la porte du fort
      const open = !!k.fort || medalsWithout('m_fort') >= S.FORT_MEDALS;
      if (open !== S.FORT_GATE.off) { setGate(open); if (open) { game.banner('Le Fort Moustache est ouvert !', 'La Capitaine vous attend pour la bataille, tout au nord-est', 3000); game.sound('reveal'); } }
      if (!open && players.some(P => Math.hypot(P.pos.x - S.FORT_GATE.x, P.pos.z - S.FORT_GATE.z) < 4) && game.t - st.gateHintT > 6) {
        st.gateHintT = game.t;
        game.banner('La porte est fermée', `Il faut ${S.FORT_MEDALS} Médailles des Neiges pour entrer (vous en avez ${medalsWithout('m_fort')})`, 2600);
      }
      catThrows();
      stepBalls(dt);
      stepBoss(dt);
      stepFox(dt);
      stepBaby(dt);
      stepRolls(dt);
      stepRace(dt);
      life.step(dt);
    },
    reveal() {
      const s = save(), k = snow();
      return {
        m_lake: S.cats.filter(c => c.group === 'clearing').every(c => s.cats.includes(c.id)),
        m_bonnets: !!k.bonnetsGiven,
        m_sled: !!k.sled,
        m_penguins: k.baby === 'home',
        m_snowman: !!k.snowman,
        m_fort: !!k.fort,
      };
    },
    applySave() {
      const k = snow();
      st.cp = k.cp;
      flags.forEach((f) => { f.raise = k.flags.includes(f.def.id) || f.def.id === 0 ? 1 : 0; });
      if (k.fort && B.phase !== 'won') { B.phase = 'friend'; }
      st.rolls = st.rolls.filter(b => !k.placed.includes(b.id));
    },
    respawn(P) {
      if (P.ride) endRide(P, 0);
      if (B.phase !== 'idle' && B.phase !== 'friend' && B.phase !== 'won' && Math.hypot(P.pos.x - FORT.x, P.pos.z - FORT.z) < FORT.r + 6) {
        bossReset();
        return { x: FORT.x, y: S.heightAt(FORT.x, FORT.z + FORT.r + 7), z: FORT.z + FORT.r + 7, yaw: Math.PI };
      }
      if (game.mode === 'defi') { const c = S.CHECKPOINTS[st.cp] || S.CHECKPOINTS[0]; return { x: c.x, y: c.y + 0.2, z: c.z + 1.5 }; }
      return null;
    },
    guideTarget(me) {
      const s = save(), k = snow(), cands = [];
      const has = (id) => s.medals.includes(id);
      for (const m of game.medals) if (m.mesh.visible) cands.push(m.def);
      if (!has('m_penguins')) {
        if (st.baby.s === 'follow') return { x: S.FOLKS.maman.x, y: S.FOLKS.maman.y, z: S.FOLKS.maman.z };
        if (st.baby.s === 'free') cands.push(st.baby);
        else for (const c of game.cats) if (!c.dead && c.def.group === 'clearing') cands.push({ x: c.pos.x, y: c.pos.y, z: c.pos.z });
      }
      if (!has('m_bonnets')) {
        if (!k.metBernard || k.bonnets.length >= S.BONNETS.length) cands.push(S.FOLKS.bernard);
        else for (const b of S.BONNETS) if (!k.bonnets.includes(b.id)) cands.push(b.fox && !k.foxDrop ? st.fox : b.race && !k.raceWon ? S.FOLKS.pingo : bonnetAt(b));
      }
      if (!has('m_snowman')) {
        if (k.placed.length >= 3) cands.push(k.carrot === 'have' ? S.GARDEN : S.FOLKS.myrtille);
        else for (const b of st.rolls) cands.push(b);
      }
      if (!k.sled) cands.push(me.pos.y > 40 ? { x: S.SLED_RACK.x, y: S.SLED_RACK.y, z: S.SLED_RACK.z } : LIFT.base);
      if (!k.fort) cands.push(S.FORT_GATE.off ? { x: FORT.x, y: FORT.y, z: FORT.z } : null);
      let best = null, bd = Infinity;
      for (const c of cands) { if (!c) continue; const d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z); if (d < bd) { bd = d; best = c; } }
      return best ? { x: best.x, y: best.y === undefined ? S.heightAt(best.x, best.z) : best.y, z: best.z } : null;
    },
    camFocus() { return ['throw', 'wait', 'tired', 'hop'].includes(B.phase) ? { x: B.x, y: B.y + 1, z: B.z } : null; },
    questText() {
      const s = save(), k = snow();
      if (!s.intro) return 'Parle à Mamie Labrador';
      if (['throw', 'wait', 'tired', 'hop'].includes(B.phase)) return `Bataille de boules de neige ! Attrapez la Capitaine (${B.hp} fois)`;
      const lq = life.questText(); if (lq) return lq;
      if (st.race) return st.race.cd > 0 ? 'Course contre Pingo : attention…' : `Course contre Pingo : plot ${Math.min(st.race.next + 1, S.RINK_CONES.length * S.RINK_LAPS)}/${S.RINK_CONES.length * S.RINK_LAPS}`;
      const me = game.me;
      if (me && me.ride && me.ride.kind === 'sled') { const g = me.ride.gates ? me.ride.gates.size : 0; return `Grande Glissade : portes ${g}/${S.GATES_NEEDED} · ⏱ ${Math.floor(game.t - (me.ride.t0 || game.t))} s`; }
      if (st.baby.s === 'follow') return 'Ramenez le bébé pingouin à sa maman (village des pingouins)';
      const n = s.medals.length, tot = S.medals.length;
      if (n >= tot) return `Station en fête ! Médailles ${n}/${tot}`;
      const extra = k.metBernard && !k.bonnetsGiven ? ` · Bonnets ${k.bonnets.length}/${S.BONNETS.length}` : '';
      return `Médailles des Neiges ${n}/${tot}${extra}`;
    },
    minimapMarks() {
      const out = [], k = snow();
      S.CHECKPOINTS.forEach((c) => out.push([c.x, c.z, k.flags.includes(c.id) || c.id === 0 ? '#ffd23a' : '#ffffff', 2.4]));
      out.push([LIFT.base.x, LIFT.base.z, '#3a8ae0', 3]);
      out.push([S.SLED_RACK.x, S.SLED_RACK.z, '#e8402e', 3]);
      for (const id in folks) out.push([folks[id].def.x, folks[id].def.z, '#ff9a2a', 3.2, id === 'bernard' && !k.metBernard]);
      if (k.metBernard) for (const b of S.BONNETS) if (!k.bonnets.includes(b.id) && bonnetAvail(b)) { const at = bonnetAt(b); out.push([at.x, at.z, '#' + b.col.toString(16).padStart(6, '0'), 3, true]); }
      if (!k.fort) out.push([FORT.x, FORT.z, '#ff6ab0', 3.6]);
      if (st.baby.s !== 'home') out.push([st.baby.x, st.baby.z, '#2a2a3a', 2.6]);
      for (const b of st.rolls) out.push([b.x, b.z, '#ffffff', 2.4]);
      out.push([S.GARDEN.x, S.GARDEN.z, '#9ad0ff', 3]);
      for (const m of life.marks()) out.push(m);
      return out;
    },
    snapshot() {
      const r = (v) => Math.round(v * 100) / 100, F = st.fox, Bb = st.baby, R = st.race;
      return {
        cp: st.cp,
        rd: game.players.filter(P => P.ride).map(P => [P.id, P.ride.kind === 'sled' ? 1 : 2, r(P.ride.speed || 0), P.ride.slot || 0, P.ride.air ? 1 : 0, P.ride.gates ? P.ride.gates.size : 0]),
        sb: st.sb.map(b => [r(b.x), r(b.y), r(b.z), r(b.vx), r(b.vy), r(b.vz), b.big ? 1 : 0]),
        b: [B.phase, r(B.x), r(B.y), r(B.z), r(B.yaw), B.hp, r(B.inv)],
        fx: [F.s, r(F.x), r(F.y), r(F.z), r(F.yaw)],
        by: [Bb.s, r(Bb.x), r(Bb.y), r(Bb.z), r(Bb.yaw)],
        rl: st.rolls.map(b => [b.id, r(b.x), r(b.y), r(b.z), r(b.r), r(b.rot)]),
        rc: R ? [r(R.cd), r(R.t), R.next, r(R.pu), R.racer] : 0,
        lf: life.snapshot(),
      };
    },
    apply(x) {
      st.cp = x.cp;
      const rides = new Map(x.rd.map(d => [d[0], d]));
      for (const P of game.players) {
        const d = rides.get(P.id);
        if (!d) { if (P.ride) { P.ride = null; if (P.mesh) { P.mesh.rotation.x = 0; P.mesh.rotation.z = 0; } } continue; }
        const kind = d[1] === 1 ? 'sled' : 'lift';
        P.ride = P.ride && P.ride.kind === kind ? P.ride : { kind, gates: new Set(), t0: game.t, camRate: 7 };
        P.ride.speed = d[2]; P.ride.slot = d[3]; P.ride.air = !!d[4]; P.ride.yaw = P.yaw;
        if (kind === 'sled') { while (P.ride.gates.size < d[5]) P.ride.gates.add(P.ride.gates.size); }
      }
      st.sb = x.sb.map(d => ({ x: d[0], y: d[1], z: d[2], vx: d[3], vy: d[4], vz: d[5], big: !!d[6], t: 0 }));
      const [ph, bx, by, bz, yaw, hp, inv] = x.b;
      B.phase = ph; B.hp = hp; B.yaw = yaw; B.inv = inv;
      B.x += (bx - B.x) * 0.5; B.y += (by - B.y) * 0.5; B.z += (bz - B.z) * 0.5;
      if (x.fx) { const F = st.fox; F.s = x.fx[0]; F.x = x.fx[1]; F.y = x.fx[2]; F.z = x.fx[3]; F.yaw = x.fx[4]; }
      if (x.by) { const Bb = st.baby; Bb.s = x.by[0]; Bb.x = x.by[1]; Bb.y = x.by[2]; Bb.z = x.by[3]; Bb.yaw = x.by[4]; }
      if (x.rl) st.rolls = x.rl.map(d => ({ id: d[0], x: d[1], y: d[2], z: d[3], r: d[4], rot: d[5] }));
      st.race = x.rc ? { cd: x.rc[0], t: x.rc[1], next: x.rc[2], pu: x.rc[3], racer: x.rc[4], last: 0 } : null;
      life.apply(x.lf);
      const open = !!snow().fort || medalsWithout('m_fort') >= S.FORT_MEDALS;
      if (open !== S.FORT_GATE.off) setGate(open);
    },
    talkMamie(first) {
      const s = save();
      if (first || !s.intro) {
        game.say([
          { who: 'Mamie Labrador', text: 'Bienvenue à la Station des Neiges, mes toutous ! Regardez-moi toute cette neige !' },
          { who: 'Biscotte', text: 'De la neige ! Je peux faire des roulades dedans ?' },
          { who: 'Mamie Labrador', text: 'Mon amie Myrtille tient le chalet-chocolat, sur la place. Et là-haut, sur la montagne, il y a Bernard, le sauveteur.' },
          { who: 'Mamie Labrador', text: 'Mais la Capitaine Moustache n\'a pas pu s\'en empêcher : avec ses chats farceurs, elle a caché les cinq Médailles des Neiges de la station !' },
          { who: 'Matcha', text: 'Encore elle ! Je croyais qu\'elle était notre copine, maintenant ?' },
          { who: 'Mamie Labrador', text: 'Oh, elle n\'est pas méchante : elle veut jouer. Elle vous attend dans son fort de neige, pour une grande bataille de boules de neige !' },
          { who: 'Mamie Labrador', text: 'La station est grande : la patinoire, le jardin des bonshommes, la rivière gelée, le lac et les pingouins, la forêt… Allez parler à tout le monde !' },
          { who: 'Mamie Labrador', text: `Le télésiège monte au sommet : approchez-vous et appuyez sur ${game.isTouch ? 'TÉLÉSIÈGE' : 'F'}. De là-haut, une luge, et c'est la Grande Glissade !` },
          { who: 'Ainu', text: 'Ouaf ! De la luge ! On y va, Matcha !' },
        ], () => { s.intro = true; game.persist(); game.banner(S.NAME, 'Explorez la station et trouvez les 5 Médailles des Neiges !', 3000); game.updateHud(); });
        return;
      }
      if (s.medals.length >= S.medals.length) { game.say([{ who: 'Mamie Labrador', text: 'Bravo, mes toutous ! Toute la station est en fête. Il reste peut-être des flocons dorés à trouver…' }]); return; }
      const kk = snow();
      const hints = {
        m_penguins: st.baby.s === 'follow' ? 'Le bébé pingouin vous suit : ramenez-le au village des pingouins, près du lac !' : 'Au village des pingouins, à l\'est, une maman pingouin a perdu son bébé. Allez la voir !',
        m_bonnets: kk.metBernard ? `Bernard cherche ses bonnets à pompon : vous en avez ${kk.bonnets.length} sur 5. Regardez sur la carte !` : 'Bernard, le sauveteur, attend au sommet de la montagne. Il a besoin d\'aide !',
        m_sled: 'Prenez une luge au sommet, et descendez la Grande Glissade en passant entre les fanions !',
        m_snowman: kk.placed.length >= 3 ? 'Votre bonhomme de neige n\'a pas de nez : demandez une carotte à Myrtille !' : 'Au jardin des bonshommes, à l\'est du village, poussez les grosses boules de neige : elles grossissent en roulant !',
        m_fort: S.FORT_GATE.off ? 'Le Fort Moustache est ouvert, tout au nord-est. La Capitaine vous attend pour la bataille !' : `Le Fort Moustache, tout au nord-est, ne s'ouvre qu'avec ${S.FORT_MEDALS} médailles.`,
      };
      const left = S.medals.filter(m => !s.medals.includes(m.id)).map(m => hints[m.id]).filter(Boolean);
      game.say([{ who: 'Mamie Labrador', text: `Vous avez ${s.medals.length} médaille${s.medals.length > 1 ? 's' : ''} sur 5.` }, ...left.slice(0, 2).map(t => ({ who: 'Mamie Labrador', text: t }))]);
    },
    endLines() {
      const kid = window.kidName ? window.kidName() : '';
      return [
        { who: 'Mamie Labrador', text: 'Les cinq Médailles des Neiges ! La station est en fête grâce à vous !' },
        { who: 'Myrtille', text: 'Le chocolat chaud est servi ! Avec plein de crème fouettée, comme promis.' },
        { who: 'Bernard', text: 'Et un tonnelet de plus pour les héros de la montagne ! Wouf !' },
        { who: 'Pingo', text: 'Coin coin ! Et une course de patinage pour fêter ça !' },
        { who: 'Capitaine Moustache', text: '…Je peux en avoir aussi ? Moi aussi, j\'ai froid aux moustaches.' },
        { who: 'Mamie Labrador', text: 'Bien sûr ! Ici, tout le monde a sa tasse. Même les chats farceurs.' },
        { who: 'Biscotte', text: 'Demain, on refait la Grande Glissade tous ensemble !' },
        { who: 'Matcha', text: 'Et cette fois, c\'est moi qui conduis la luge !' },
        { who: 'Ainu', text: 'Ouaf ! Le plus bel hiver de toute ma vie.' },
        ...(kid ? [{ who: '', text: `Et tout ça, grâce à ${kid}.` }] : []),
      ];
    },
    render(dt, t) {
      FOL.tickFoliage(t);
      if (!st.skyDone) { st.skyDone = true; dressSky(); }
      const me = game.me, k = snow(), cam = game.camera.position;
      // le bandeau de quête suit la descente (portes, chrono) : on le rafraîchit quand il change
      if ((st.hudT = (st.hudT || 0) + dt) > 0.25) { st.hudT = 0; const q = logic.questText(); if (q !== st.hudQ) { st.hudQ = q; game.updateHud(); } }
      for (const c of cull) c.obj.visible = Math.hypot(c.x - cam.x, c.z - cam.z) < (lite ? 200 : 260) + c.r;
      // sièges du télésiège qui tournent en boucle
      const m4 = this._m4 || (this._m4 = new THREE.Matrix4()), q = this._q || (this._q = new THREE.Quaternion()), v = this._v || (this._v = new THREE.Vector3()), one = this._one || (this._one = new THREE.Vector3(1, 1, 1)), zero = new THREE.Vector3(0, 0, 0), e = this._e || (this._e = new THREE.Euler());
      const loop = S.LIFT_LEN * 2;
      for (let i = 0; i < CHAIRS; i++) {
        const u = ((t * S.LIFT_SPEED + i * loop / CHAIRS) % loop);
        const up = u < S.LIFT_LEN, s = up ? u : loop - u, p = S.liftAt(s), sd = up ? 1 : -1;
        const swing = Math.sin(t * 1.3 + i) * 0.05;
        m4.compose(v.set(p.x + side.x * LANE * sd, p.y, p.z + side.z * LANE * sd), q.setFromEuler(e.set(swing, liftYaw + (up ? 0 : Math.PI), 0, 'YXZ')), one);
        chairs.setMatrixAt(i, m4);
      }
      const used = new Set();
      for (const P of game.players) {
        const R = P.ride;
        if (!R) continue;
        const u = P.mesh && P.mesh.userData;
        if (R.kind === 'lift') {
          const slot = Math.min(R.slot || 0, RIDERS - 1); used.add(slot);
          m4.compose(v.set(P.pos.x, P.pos.y - 0.1 + S.SEAT_DROP, P.pos.z), q.setFromEuler(e.set(0, liftYaw, 0)), one);
          chairs.setMatrixAt(CHAIRS + slot, m4);
          if (P.mesh) {
            P.mesh.position.set(P.pos.x, P.pos.y - 0.05, P.pos.z); P.mesh.rotation.set(0, liftYaw, 0);
            if (u.legs) u.legs.forEach((l, i) => { l.rotation.x = (i < 2 ? -1.1 : 1.0) + Math.sin(t * 3 + i) * 0.15; });
            if (u.ainu) { u.ainu.position.y = -0.25; u.ainu.rotation.x = 0; }
            if (P.shadow) P.shadow.visible = false;
          }
        }
      }
      for (let i = 0; i < RIDERS; i++) if (!used.has(i)) { m4.compose(v.set(0, -500, 0), q.identity(), zero); chairs.setMatrixAt(CHAIRS + i, m4); }
      chairs.instanceMatrix.needsUpdate = true;
      // luges
      let si = 0;
      for (const P of game.players) {
        const R = P.ride;
        if (!R || R.kind !== 'sled') continue;
        const sl = sledFor(si++);
        const e2 = 0.6, gf = (S.heightAt(P.pos.x + Math.sin(P.yaw) * e2, P.pos.z + Math.cos(P.yaw) * e2) - S.heightAt(P.pos.x - Math.sin(P.yaw) * e2, P.pos.z - Math.cos(P.yaw) * e2)) / (2 * e2);
        const gs = (S.heightAt(P.pos.x + Math.cos(P.yaw) * e2, P.pos.z - Math.sin(P.yaw) * e2) - S.heightAt(P.pos.x - Math.cos(P.yaw) * e2, P.pos.z + Math.sin(P.yaw) * e2)) / (2 * e2);
        const pitch = R.air ? -0.1 : -Math.atan(gf), roll = R.air ? 0 : Math.atan(gs) * 0.8;
        // la luge se penche dans les virages
        R.lean = (R.lean || 0) + ((((R.yaw || P.yaw) - (R.prevYaw === undefined ? P.yaw : R.prevYaw)) / Math.max(dt, 1e-3)) * -0.12 - (R.lean || 0)) * Math.min(1, dt * 8);
        R.prevYaw = P.yaw;
        sl.visible = true; sl.position.set(P.pos.x, P.pos.y + 0.02, P.pos.z); sl.rotation.set(pitch, P.yaw, roll + clamp(R.lean, -0.3, 0.3), 'YXZ');
        if (P.mesh) {
          const u = P.mesh.userData;
          P.mesh.position.set(P.pos.x, P.pos.y + 0.3, P.pos.z); P.mesh.rotation.set(pitch, P.yaw, roll + clamp(R.lean, -0.3, 0.3) * 1.4, 'YXZ');
          if (u.legs) u.legs.forEach((l, i) => { l.rotation.x = i < 2 ? -1.0 : 1.2; });
          if (u.ainu) { u.ainu.position.y = -0.1; u.ainu.rotation.x = 0; u.ainu.rotation.z = 0; }
          if (u.tail) u.tail.rotation.set(-0.6, Math.sin(t * 10) * 0.3, 0);
        }
        if ((R.speed || 0) > 4 && !R.air && Math.random() < dt * (R.speed * 2.5)) {
          const b = -0.9;
          game.spawnParticle(P.pos.x + Math.sin(P.yaw) * b + (Math.random() - 0.5) * 0.8, P.pos.y + 0.15, P.pos.z + Math.cos(P.yaw) * b + (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 2, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2, 0xffffff, 0.3 + Math.random() * 0.2, 0.6, 5);
        }
      }
      for (let i = si; i < sledPool.length; i++) sledPool[i].visible = false;
      for (const P of game.players) {
        if (P.ride || !P.grounded) continue;
        const sp = Math.hypot(P.vel.x, P.vel.z);
        if (sp > 3 && S.iceAt(P.pos.x, P.pos.z, P.pos.y) && Math.random() < dt * 12) game.spawnParticle(P.pos.x, P.pos.y + 0.1, P.pos.z, -P.vel.x * 0.1, 0.8, -P.vel.z * 0.1, 0xe0f4ff, 0.18, 0.4, 3);
        else if (sp > 6 && Math.random() < dt * 5) game.spawnParticle(P.pos.x - Math.sin(P.yaw) * 0.5, P.pos.y + 0.1, P.pos.z - Math.cos(P.yaw) * 0.5, (Math.random() - 0.5), 0.9, (Math.random() - 0.5), 0xffffff, 0.3, 0.5, 2);
      }
      if (game.guest) for (const b of st.sb) { b.vy -= 14 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; }
      for (let i = 0; i < SB_MAX; i++) {
        const b = st.sb[i];
        if (b) { const k2 = b.big ? 2 : 1; m4.compose(v.set(b.x, b.y, b.z), q.identity(), (this._sv || (this._sv = new THREE.Vector3())).set(k2, k2, k2)); }
        else m4.compose(v.set(0, -500, 0), q.identity(), zero);
        balls.setMatrixAt(i, m4);
      }
      balls.instanceMatrix.needsUpdate = true;
      for (const c of game.cats) if (!c.dead && c.throwAnim && t - c.throwAnim < 0.35) { const a = (t - c.throwAnim) / 0.35; c.mesh.position.y += Math.sin(a * Math.PI) * 0.35; c.mesh.userData.head.rotation.x = -Math.sin(a * Math.PI) * 0.4; }
      // bonnets
      for (const b of bonnets) {
        const got = k.bonnets.includes(b.def.id), av = bonnetAvail(b.def);
        b.g.visible = !got && av;
        if (b.g.visible) { const at = bonnetAt(b.def); b.g.position.set(at.x, at.y + 0.8 + Math.sin(t * 2.5 + at.x) * 0.15, at.z); b.g.rotation.y = t * 1.6; }
      }
      // habitants
      for (const id in folks) {
        const f = folks[id], u = f.m.userData, d = f.def;
        const dd = Math.hypot(me.pos.x - d.x, me.pos.z - d.z);
        f.m.visible = dd < 200;
        const look = dd < 8 ? Math.atan2(me.pos.x - d.x, me.pos.z - d.z) : d.yaw;
        f.m.rotation.y = lerpAngle(f.m.rotation.y, look, Math.min(1, dt * 3));
        if (u.mtail) u.mtail.rotation.y = Math.sin(t * 7 + d.x) * 0.5;
        if (u.mhead) u.mhead.rotation.x = Math.sin(t * 2 + d.z) * 0.06;
        if (u.wings) u.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.15 + Math.max(0, Math.sin(t * 6)) * (dd < 6 ? 0.5 : 0.1)); });
        const want = id === 'bernard' ? !k.metBernard || (k.bonnets.length >= S.BONNETS.length && !k.bonnetsGiven) : id === 'myrtille' ? !k.metMyrtille || (k.placed.length >= 3 && !k.carrot) : id === 'pingo' ? !k.raceWon && !st.race : k.baby !== 'home' && !k.metMaman;
        f.mark.visible = save().intro && want && dd < 200;
        f.mark.position.set(d.x, d.y + (u.height || 1.6) + 1.2 + Math.sin(t * 4) * 0.1, d.z);
      }
      // Pingo : à sa place, ou en pleine course
      {
        const pf = folks.pingo, R = st.race;
        if (R && R.cd <= 0) { const p = PINGO_PATH(R.pu), p2 = PINGO_PATH(R.pu + 0.01); pf.m.position.set(p.x, S.RINK.y, p.z); pf.m.rotation.y = Math.atan2(p2.x - p.x, p2.z - p.z); pf.m.rotation.z = Math.sin(t * 8) * 0.12; }
        else { pf.m.position.set(pf.def.x, pf.def.y, pf.def.z); pf.m.rotation.z = 0; }
        for (const c of cones) {
          const next = R && R.cd <= 0 && S.RINK_CONES[R.next % S.RINK_CONES.length] === c.def;
          c.glow.material.opacity = next ? 0.5 + Math.sin(t * 8) * 0.25 : c.hit && t - c.hit < 0.6 ? 0.8 * (1 - (t - c.hit) / 0.6) : 0;
        }
      }
      // petits pingouins qui se dandinent
      for (const p of penguins) { const u = p.m.userData; p.m.rotation.z = Math.sin(t * 3 + p.ph) * 0.12; p.m.rotation.y = Math.sin(t * 0.4 + p.ph) * 1.2; u.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.2 + Math.max(0, Math.sin(t * 5 + p.ph)) * 0.4); }); }
      // le bébé pingouin
      {
        const Bb = st.baby, u = baby.userData;
        baby.position.set(Bb.x, Bb.y, Bb.z); baby.rotation.y = Bb.s === 'lost' ? Math.sin(t * 0.8) * 0.6 : Bb.yaw;
        baby.rotation.z = Bb.s === 'lost' ? Math.sin(t * 20) * 0.05 : Bb.s === 'follow' ? Math.sin(t * 9) * 0.15 : Math.sin(t * 3) * 0.08;
        u.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (Bb.s === 'free' ? 0.3 + Math.abs(Math.sin(t * 10)) * 0.8 : 0.15); });
        babyMark.visible = Bb.s === 'free' && Math.hypot(Bb.x - cam.x, Bb.z - cam.z) < 160;
        babyMark.position.set(Bb.x, Bb.y + 1.6 + Math.sin(t * 4) * 0.1, Bb.z);
        if (Bb.s === 'lost' && Math.random() < dt * 0.6 && Math.hypot(Bb.x - cam.x, Bb.z - cam.z) < 40) game.spawnParticle(Bb.x, Bb.y + 0.9, Bb.z, 0, 0.6, 0, 0xbfe8ff, 0.2, 0.8, 0);
      }
      // le renard
      {
        const F = st.fox, u = fox.userData, running = F.s === 'run';
        fox.position.set(F.x, F.y, F.z); fox.rotation.y = F.yaw;
        u.legs.forEach((l, i) => { l.rotation.x = running ? Math.sin(t * 16 + (i % 3 ? Math.PI : 0)) * 0.9 : 0; });
        u.tail.rotation.y = Math.sin(t * (F.s === 'calm' ? 8 : 3)) * (F.s === 'calm' ? 0.6 : 0.25);
        u.head.rotation.x = F.s === 'sit' ? Math.sin(t * 1.5) * 0.08 : 0;
        if (!k.foxDrop) { if (!fox.userData.carry) { const c = buildBonnet(0x40c060); c.scale.setScalar(0.6); c.position.set(0, -0.1, 0.42); c.rotation.x = 1.2; u.head.add(c); fox.userData.carry = c; } }
        else if (fox.userData.carry) { u.head.remove(fox.userData.carry); fox.userData.carry = null; }
      }
      // les boules du bonhomme qui roulent, et le bonhomme qui se construit
      {
        const vis = new Set();
        st.rolls.forEach((b) => { const r = rollers.find(q => q.def.id === b.id); if (!r) return; vis.add(r); r.m.visible = true; r.m.position.set(b.x, b.y, b.z); r.m.scale.setScalar(b.r); r.m.rotation.x = b.rot; });
        for (const r of rollers) if (!vis.has(r)) r.m.visible = false;
        const u = snowman.userData, n = Math.min(3, k.placed.length);
        let y = 0.2;
        u.parts.forEach((m, i) => {
          m.visible = i < n;
          const R = S.SNOWMAN_SIZES[i];
          if (m.visible) { m.scale.setScalar(R); m.position.y = y + R * 0.9; y += R * 1.75; }
        });
        u.face.visible = n >= 3;
        if (n >= 3) { const R = S.SNOWMAN_SIZES[2]; u.face.position.y = u.parts[2].position.y; u.face.scale.setScalar(R / 0.7); }
        u.nose.visible = !!k.snowman;
        u.ring.material.opacity = n < 3 ? 0.4 + Math.sin(t * 4) * 0.25 : k.snowman ? 0 : 0.3;
      }
      // la porte du fort s'enfonce
      st.gateK += ((S.FORT_GATE.off ? 1 : 0) - st.gateK) * Math.min(1, dt * 1.5);
      gateMesh.position.y = S.FORT_GATE.y0 + 1 - st.gateK * 5.5; gateMesh.visible = st.gateK < 0.98;
      // cheminées qui fument, tasses qui fument
      if (Math.random() < dt * 6) {
        const c = chimneys[Math.floor(Math.random() * chimneys.length)];
        if (Math.hypot(c.x - cam.x, c.z - cam.z) < 90) game.spawnParticle(c.x + (Math.random() - 0.5) * 0.2, c.y, c.z + (Math.random() - 0.5) * 0.2, 0.3 + Math.random() * 0.3, c.mug ? 0.5 : 1.0, (Math.random() - 0.5) * 0.3, c.mug ? 0xffffff : 0xd8dce4, c.mug ? 0.14 : 0.55, c.mug ? 1.2 : 2.6, -0.15);
      }
      for (const l of treeLights) if (l.isMesh && l.material.emissiveIntensity !== undefined) l.material.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.25;
      if (bulbs) bulbs.material.color.setScalar(0.75 + 0.3 * Math.sin(t * 2.3) + 0.15 * Math.sin(t * 7.1));
      // drapeaux
      flags.forEach((f, i) => {
        const up = k.flags.includes(f.def.id) || f.def.id === 0 ? 1 : 0;
        f.raise += (up - f.raise) * Math.min(1, dt * 3);
        f.cloth.position.y = 1.0 + f.raise * 2.3;
        f.cloth.material.color.setHex(up ? 0xffffff : 0x9a9a9a);
        if (Math.hypot(f.def.x - cam.x, f.def.z - cam.z) < 60) {
          const arr = f.cloth.geometry.attributes.position.array;
          for (let j = 0; j < arr.length; j += 3) { const x = f.base[j]; arr[j + 2] = Math.sin(x * 3 - t * 6 + i) * 0.12 * x; }
          f.cloth.geometry.attributes.position.needsUpdate = true;
        }
        const since = t - f.raisedAt;
        f.halo.material.opacity = since < 1.5 ? (1 - since / 1.5) * 0.8 : (f.def.id === st.cp ? 0.22 + Math.sin(t * 3) * 0.08 : 0);
        f.halo.scale.setScalar(since < 1.5 ? 1 + since * 2 : 1);
      });
      life.render(dt, t);
      {
        const done = save().life && save().life.defis ? save().life.defis.length : 0;
        aurora.material.uniforms.uT.value = t;
        const dS = Math.hypot(cam.x - S.MOUNTAIN.x, cam.z - S.MOUNTAIN.z);
        aurora.material.uniforms.uK.value = (done >= LIFE.PLAN.defis.length ? 1.1 : 0.4 + 0.4 * done / LIFE.PLAN.defis.length) * (0.55 + 0.45 * smooth(170, 50, dS));
      }
      if (fortFlag) { const arr = fortFlag.geometry.attributes.position.array, base = fortFlag.userData.base; for (let j = 0; j < arr.length; j += 3) arr[j + 2] = Math.sin(base[j] * 3 - t * 5) * 0.12 * base[j]; fortFlag.geometry.attributes.position.needsUpdate = true; }
      // la Capitaine
      cap.visible = !(B.inv > 0 && Math.floor(t * 14) % 2 === 0);
      cap.position.set(B.x, B.y, B.z); cap.rotation.y = B.yaw;
      const cu = cap.userData, tired = B.phase === 'tired';
      if (cu.stars) { cu.stars.visible = tired; if (tired) cu.stars.children.forEach((s, i) => { const a = t * 4 + i * Math.PI / 2; s.position.set(Math.cos(a) * 0.45, Math.sin(t * 6 + i) * 0.05, Math.sin(a) * 0.45); }); }
      if (cu.head) { cu.head.rotation.z = tired ? Math.sin(t * 3) * 0.25 : B.phase === 'friend' ? Math.sin(t * 1.5) * 0.1 : 0; cu.head.rotation.x = B.phase === 'throw' && B.t < 0.3 ? -0.3 : 0; }
      if (cu.tail) cu.tail.rotation.x = -0.3 + Math.sin(t * 5) * 0.3;
      if (cu.legs) cu.legs.forEach((l, i) => { l.rotation.x = B.phase === 'hop' ? (i < 2 ? -0.8 : 0.8) : tired ? 0.5 : Math.sin(t * 2 + i) * 0.05; });
      if (tired) cap.position.y -= 0.15;
      game.placeShadow(capShadow, cap.position, 1.0); capShadow.visible = cap.visible;
    },
  };

  // état initial d'après la sauvegarde
  {
    const k = snow();
    if (k.baby === 'home') st.baby.s = 'home';
    else if (logic.reveal().m_lake) st.baby.s = 'free';
    if (k.foxDrop) st.fox.s = 'calm';
  }
  logic.applySave();
  return logic;
}
