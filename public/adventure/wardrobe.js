/*
 * Matcha & Ainu — la garde-robe : chapeaux et colliers, dans tous les mondes.
 * Ils se débloquent avec les récompenses gagnées (médailles, trophées, étoiles de tous
 * les niveaux) ; ceux de la boutique de Port-Croquette s'achètent avec les pièces.
 * Ce que porte chaque joueur est rangé dans sa sauvegarde (voir profiles.js).
 */
import * as THREE from '../vendor/three.module.min.js';
import * as M from './models.js';
import { buildShopHat } from './citykit.js';

const KEY = 'dogfight.wardrobe';
const LEVEL_KEYS = ['dogfight.aventure.niveau1', 'dogfight.aventure.niveau2', 'dogfight.aventure.niveau3b', 'dogfight.aventure.niveau4', 'dogfight.aventure.niveau5'];

/** need : nombre de récompenses pour débloquer ; shop : s'achète à Port-Croquette. */
export const ITEMS = [
  { id: 'c_bandana', kind: 'collar', name: 'Bandana rouge', icon: '🧣', need: 0 },
  { id: 'h_bow', kind: 'hat', name: 'Gros nœud', icon: '🎀', need: 1 },
  { id: 'h_party', kind: 'hat', name: 'Chapeau de fête', icon: '🥳', need: 3 },
  { id: 'c_bell', kind: 'collar', name: 'Collier à clochette', icon: '🔔', need: 5 },
  { id: 'h_flower', kind: 'hat', name: 'Couronne de fleurs', icon: '🌼', need: 8 },
  { id: 'c_gold', kind: 'collar', name: 'Collier d\'or', icon: '📿', need: 12 },
  { id: 'c_scarf', kind: 'collar', name: 'Écharpe des farceurs', icon: '🧣', stamps: 6 },
  { id: 'h_cap', kind: 'hat', name: 'Casquette', icon: '🧢', shop: true },
  { id: 'h_sun', kind: 'hat', name: 'Lunettes de soleil', icon: '🕶️', shop: true },
  { id: 'h_cowboy', kind: 'hat', name: 'Chapeau de cowboy', icon: '🤠', shop: true },
  { id: 'h_pirate', kind: 'hat', name: 'Chapeau de pirate', icon: '🏴‍☠️', shop: true },
  { id: 'h_crown', kind: 'hat', name: 'Couronne', icon: '👑', shop: true },
];

const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };

/** Ce que porte le joueur : { hat, collar }. */
export function outfit() { return Object.assign({ hat: null, collar: null }, read(KEY) || {}); }
export function setOutfit(o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* ignore */ } }

/** Nombre total de récompenses (tous niveaux). */
export function rewards() {
  let n = 0;
  for (const k of LEVEL_KEYS) { const s = read(k); if (s && s.medals) n += s.medals.length; }
  return n;
}
/** Objets achetés à la boutique de la ville. */
function bought() { const s = read('dogfight.aventure.niveau3b'); return (s && s.city && s.city.owned) || []; }
export function unlocked(it) {
  if (it.stamps) return !!(window.Carnet && window.Carnet.stamps() >= it.stamps);   // tampons du Carnet des bêtises
  return it.shop ? bought().includes(it.id) : rewards() >= it.need;
}

/** Porter / enlever un objet. */
export function toggle(id) {
  const it = ITEMS.find(q => q.id === id), o = outfit();
  if (!it || !unlocked(it)) return o;
  o[it.kind] = o[it.kind] === id ? null : id;
  setOutfit(o);
  return o;
}

// ---- modèles 3D ----------------------------------------------------------------
function buildExtra(id) {
  const g = new THREE.Group();
  if (id === 'h_bow') {
    const m = M.mat(0xff5aa8, { roughness: 0.5 });
    for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), m); l.scale.set(1.3, 0.8, 0.5); l.position.set(sx * 0.12, 0.06, 0.02); l.rotation.z = sx * 0.4; g.add(l); }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 8), m); knot.position.set(0, 0.06, 0.04); g.add(knot);
    g.position.x = 0.12;
  } else if (id === 'h_party') {
    const tex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d'); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#ffd23a' : '#5ab4ff'; x.fillRect(0, i * 8, 64, 8); } return c; })());
    tex.colorSpace = THREE.SRGBColorSpace;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.38, 20), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })); cone.position.y = 0.19; cone.rotation.z = -0.2; g.add(cone);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M.mat(0xff5a6a)); pom.position.set(0.075, 0.37, 0); g.add(pom);
  } else if (id === 'h_flower') {
    const leaf = M.mat(0x5ab040, { roughness: 0.7 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 24), leaf); ring.rotation.x = Math.PI / 2; g.add(ring);
    const cols = [0xffffff, 0xffd23a, 0xff8ad8, 0x8ac8ff];
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, f = new THREE.Group();
      for (let k = 0; k < 5; k++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 4), M.mat(cols[i % 4])); const b = k / 5 * Math.PI * 2; p.position.set(Math.cos(b) * 0.03, 0, Math.sin(b) * 0.03); p.scale.set(1, 0.5, 1); f.add(p); }
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 4), M.mat(0xffb020)); c.position.y = 0.01; f.add(c);
      f.position.set(Math.cos(a) * 0.2, 0.02, Math.sin(a) * 0.2); g.add(f);
    }
  } else if (id === 'c_bandana') {
    const red = new THREE.MeshStandardMaterial({ color: 0xd8202a, roughness: 0.7, side: THREE.DoubleSide });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 8, 28), red); band.rotation.x = Math.PI / 2; g.add(band);
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.2, 3), red); tri.rotation.x = Math.PI; tri.scale.z = 0.3; tri.position.set(0, -0.08, 0.25); g.add(tri);
  } else if (id === 'c_scarf') {
    // écharpe à rayures (tricotée par Mamie, évidemment)
    const tex = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 64; c.height = 16; const x = c.getContext('2d'); for (let i = 0; i < 8; i++) { x.fillStyle = ['#e0402a', '#ffd23a', '#3a8ae0', '#ffffff'][i % 4]; x.fillRect(i * 8, 0, 8, 16); } return c; })());
    tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(3, 1);
    const wool = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.06, 10, 28), wool); band.rotation.x = Math.PI / 2; g.add(band);
    for (const sx of [-1, 1]) { const tail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.32, 0.04), wool); tail.position.set(sx * 0.07, -0.16, 0.27); tail.rotation.z = sx * 0.25; g.add(tail); }
  } else if (id === 'c_bell' || id === 'c_gold') {
    const gold = id === 'c_gold';
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.04, 8, 28), gold ? M.mat(0xffc830, { metalness: 0.85, roughness: 0.25 }) : M.mat(0x3a8ae0, { roughness: 0.5 }));
    band.rotation.x = Math.PI / 2; g.add(band);
    const bell = new THREE.Mesh(new THREE.SphereGeometry(gold ? 0.06 : 0.07, 12, 10), M.mat(0xffd23a, { metalness: 0.8, roughness: 0.25 }));
    bell.position.set(0, -0.07, 0.27); g.add(bell);
    if (gold) { const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), M.mat(0x3ad0ff, { emissive: 0x1a6080, emissiveIntensity: 0.5 })); gem.position.set(0, -0.07, 0.32); g.add(gem); }
  }
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.userData.noOutline = true; } });
  return g;
}
export function buildItem(id) {
  const it = ITEMS.find(q => q.id === id);
  if (!it) return null;
  return it.shop ? buildShopHat(id) : buildExtra(id);
}

// où poser chapeau et collier sur chaque chien (repère du visage) : x, y, z, échelle
const HAT_AT = { duo: [0, 0.3, -0.36, 1.55], matcha: [0, 0.04, -0.1, 0.72], pug: [0, 0.32, -0.24, 1.2], yorkie: [0, 0.24, -0.2, 0.92] };
const COLLAR_AT = { duo: [0, -0.42, -0.42, 1.25, 0.5], matcha: [0, -0.15, -0.14, 0.5, 0.45], pug: [0, -0.3, -0.2, 0.8, 0.4], yorkie: [0, -0.24, -0.16, 0.65, 0.4] };
const kindOf = (P) => { const u = P.mesh.userData; return u.ainu ? 'duo' : P.kind === 'matcha' ? 'matcha' : (P.kind === 'giorgio' || P.kind === 'django') ? 'pug' : 'yorkie'; };

/** Habille un chien (refait seulement si la tenue change). */
export function dress(P, o) {
  if (!P || !P.mesh) return;
  const key = (o.hat || '') + '|' + (o.collar || '') + '|' + P.mesh.uuid;
  if (P.outfitKey === key) return;
  P.outfitKey = key;
  for (const m of P.outfitMeshes || []) if (m.parent) m.parent.remove(m);
  P.outfitMeshes = [];
  const u = P.mesh.userData, anchor = u.ainu ? u.headFace : u.mheadFace;
  if (!anchor) return;
  const k = kindOf(P);
  const put = (id, at) => {
    if (!id) return;
    const m = buildItem(id); if (!m) return;
    m.position.set(at[0], at[1], at[2]); m.scale.setScalar(at[3]); if (at[4]) m.rotation.x = at[4];
    anchor.add(m); P.outfitMeshes.push(m);
  };
  put(o.hat, HAT_AT[k]);
  put(o.collar, COLLAR_AT[k]);
}
