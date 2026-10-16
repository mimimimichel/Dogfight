/*
 * Matcha & Ainu — Niveau 7 « La Ferme de Papi Berger » : décor et règles
 * (moutons à mener à l'enclos, poules et panier d'œufs, Caramel le cochonnet,
 * flaque de boue, tracteur, pommiers, moulin à réparer, drapeaux).
 * Le moteur commun est dans game.js ; les modèles dans farmkit.js.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as M from './models.js';
import * as W from './world.js';
import * as K from './farmkit.js';
import { buildLife, skinMaterial } from './life.js';
import * as LIFE from './level7life.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
const angDiff = (a, b) => ((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const svg = (body) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a8"/><stop offset=".55" stop-color="#ffcf3a"/><stop offset="1" stop-color="#e89a10"/></linearGradient></defs>${body}</svg>`);
const ICON_BONE = svg('<g transform="rotate(-35 32 32)"><g fill="#8a5200" stroke="#8a5200" stroke-width="6"><rect x="15" y="26" width="34" height="12" rx="4"/><circle cx="15" cy="25" r="7.5"/><circle cx="15" cy="39" r="7.5"/><circle cx="49" cy="25" r="7.5"/><circle cx="49" cy="39" r="7.5"/></g><g fill="url(#g)"><rect x="15" y="26" width="34" height="12" rx="4"/><circle cx="15" cy="25" r="7.5"/><circle cx="15" cy="39" r="7.5"/><circle cx="49" cy="25" r="7.5"/><circle cx="49" cy="39" r="7.5"/></g></g>');
const ICON_SHEEP = svg('<g stroke="#3a2a1e" stroke-width="3"><rect x="20" y="40" width="5" height="14" rx="2" fill="#3a2e28"/><rect x="38" y="40" width="5" height="14" rx="2" fill="#3a2e28"/><path d="M14 36a9 9 0 0 1 6-14 10 10 0 0 1 16-6 9 9 0 0 1 14 7 8 8 0 0 1-1 16H20a8 8 0 0 1-6-3z" fill="#fbf7ee"/><ellipse cx="50" cy="30" rx="8" ry="10" fill="#3a2e28"/></g><circle cx="52" cy="28" r="2" fill="#fff"/>');
const ICON_EGG = svg('<ellipse cx="32" cy="35" rx="17" ry="22" fill="#fff4dc" stroke="#8a6a3a" stroke-width="3"/><ellipse cx="25" cy="25" rx="5" ry="7" fill="#fff" opacity=".8"/>');

/** Petits bruits de la ferme, joués au synthé du jeu (bêlement, caquet, meuh, groin, coin-coin, flic-flac). */
function farmSounds(game) {
  const go = (fn) => { const s = game.sfx; if (!s || !s.ok) return; try { fn(s); } catch (e) { /* pas de son */ } };
  return {
    baa: (k) => go((s) => { const f = 300 * (k || 1); for (let i = 0; i < 5; i++) s.tone(f + (i % 2) * 28, 0.075, { type: 'sawtooth', to: f - 20, vol: 0.045, delay: i * 0.065 }); s.tone(f * 2, 0.3, { type: 'triangle', to: f * 1.8, vol: 0.02 }); }),
    cluck: () => go((s) => { s.tone(880, 0.05, { type: 'square', to: 640, vol: 0.04 }); s.tone(980, 0.05, { type: 'square', to: 700, vol: 0.04, delay: 0.11 }); s.tone(1200, 0.09, { type: 'square', to: 760, vol: 0.035, delay: 0.24 }); }),
    moo: () => go((s) => { s.tone(150, 0.8, { type: 'sawtooth', to: 112, vol: 0.07 }); s.tone(300, 0.7, { type: 'triangle', to: 225, vol: 0.035 }); }),
    oink: () => go((s) => { s.noise(0.16, { filter: 'bandpass', freq: 520, freqTo: 300, vol: 0.22 }); s.tone(230, 0.13, { type: 'square', to: 160, vol: 0.05 }); }),
    quack: () => go((s) => { s.tone(620, 0.09, { type: 'sawtooth', to: 430, vol: 0.04 }); s.tone(600, 0.09, { type: 'sawtooth', to: 420, vol: 0.035, delay: 0.14 }); }),
    squelch: () => go((s) => { s.noise(0.35, { filter: 'lowpass', freq: 700, freqTo: 120, vol: 0.35 }); s.tone(90, 0.2, { type: 'sine', to: 50, vol: 0.15 }); }),
    shake: () => go((s) => { s.noise(0.5, { filter: 'bandpass', freq: 1800, freqTo: 900, vol: 0.18 }); }),
    crunch: () => go((s) => { s.noise(0.1, { filter: 'bandpass', freq: 2400, vol: 0.25 }); s.noise(0.08, { filter: 'bandpass', freq: 1800, vol: 0.2 }); }),
    rustle: () => go((s) => { s.noise(0.45, { filter: 'bandpass', freq: 3000, freqTo: 1500, vol: 0.16 }); }),
    creak: () => go((s) => { s.tone(140, 0.5, { type: 'sawtooth', to: 190, vol: 0.05 }); s.tone(210, 0.4, { type: 'sawtooth', to: 160, vol: 0.04, delay: 0.3 }); }),
  };
}

export function buildFarm(game) {
  const sc = game.scene, lite = game.lite, real = game.realistic;
  const S = L;                     // données du niveau 7
  const moving = [], chars = [];
  const snd = farmSounds(game);
  const save = () => game.save;
  const farm = () => {
    const s = game.save;
    if (!s.farm) s.farm = {};
    const f = s.farm;
    for (const [k, v] of [['pen', []], ['eggs', 0], ['piglet', false], ['parts', []], ['flags', [0]], ['tipped', false], ['fixed', []]]) if (f[k] === undefined) f[k] = Array.isArray(v) ? v.slice() : v;
    return f;
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sv = new THREE.Vector3(), e = new THREE.Euler();
  const ZERO = new THREE.Vector3(0, 0, 0);
  const add = (o, cast) => { if (cast !== false) o.traverse(k => { if (k.isMesh) { k.castShadow = true; k.receiveShadow = true; } }); sc.add(o); return o; };

  // --- interface : l'os doré (et pas une pièce), compteurs moutons / œufs ------------
  const hud = {};
  {
    const img = game.dom.root.querySelector('.adv-count img');
    if (img) img.src = ICON_BONE;
    const box = game.dom.root.querySelector('.adv-counts');
    const chip = (icon, max) => {
      const d = document.createElement('div');
      d.className = 'adv-count hidden';
      d.innerHTML = `<img src="${icon}" alt=""><span>0</span><small>/${max}</small>`;
      if (box) box.appendChild(d);
      return d;
    };
    hud.sheep = chip(ICON_SHEEP, S.SHEEP.length);
    hud.eggs = chip(ICON_EGG, S.EGGS_NEEDED);
  }
  function updateChips() {
    const f = farm(), me = game.me;
    const on = save().intro;
    const nS = f.pen.length, nE = f.eggs + ((me && me.eggs) || 0);
    hud.sheep.classList.toggle('hidden', !on || nS >= S.SHEEP.length && save().medals.includes('m_sheep'));
    hud.eggs.classList.toggle('hidden', !on || !(nE > 0 && !save().medals.includes('m_eggs')));
    const set = (el, n) => { const sp = el.querySelector('span'); if (sp.textContent !== String(n)) { sp.textContent = n; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } };
    set(hud.sheep, nS); set(hud.eggs, Math.min(S.EGGS_NEEDED, nE));
  }

  // =============================================================================
  // Décor
  // =============================================================================
  const barn = add(K.buildBarn(S.BARN, S.LOFT));
  const house = add(K.buildHouse(S.HOUSE, real));
  const henhouse = add(K.buildHenhouse(S.HENHOUSE));
  const mill = add(K.buildMill(Object.assign({}, S.MILL, { hubY: S.SAIL_HUB.y, R: S.SAIL_HUB.R }), S.MILL_STEPS, S.BALCONY));
  mill.rotation.y = 0;
  void barn; void house; void henhouse;

  // Clôtures (poteaux et traverses instanciés : 2 dessins pour toutes les barrières)
  {
    const posts = [], rails = [];
    for (const f of S.FENCES) {
      const len = Math.hypot(f.x2 - f.x1, f.z2 - f.z1), n = Math.max(1, Math.ceil(len / 2));
      const yaw = Math.atan2(f.x2 - f.x1, f.z2 - f.z1);
      for (let i = 0; i <= n; i++) {
        const x = f.x1 + (f.x2 - f.x1) * i / n, z = f.z1 + (f.z2 - f.z1) * i / n;
        posts.push({ x, z, y: S.heightAt(x, z), h: f.low ? 0.95 : 1.3 });
        if (i < n) {
          const x2 = f.x1 + (f.x2 - f.x1) * (i + 1) / n, z2 = f.z1 + (f.z2 - f.z1) * (i + 1) / n;
          const gy = (S.heightAt(x, z) + S.heightAt(x2, z2)) / 2;
          for (const hh of (f.low ? [0.35, 0.7] : [0.45, 0.95])) rails.push({ x: (x + x2) / 2, z: (z + z2) / 2, y: gy + hh, yaw, len: len / n + 0.15 });
        }
      }
    }
    const wood = new THREE.MeshStandardMaterial({ map: K.plankTex(0xd8b888, 0.5, 0.5), roughness: 0.85 });
    const postI = new THREE.InstancedMesh(new THREE.BoxGeometry(0.17, 1, 0.17), wood, posts.length);
    posts.forEach((p, i) => { m4.compose(v3.set(p.x, p.y + p.h / 2 - 0.1, p.z), q.identity(), sv.set(1, p.h + 0.2, 1)); postI.setMatrixAt(i, m4); });
    const railI = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 0.14, 1), wood, rails.length);
    rails.forEach((r, i) => { m4.compose(v3.set(r.x, r.y, r.z), q.setFromEuler(e.set(0, r.yaw, 0)), sv.set(1, 1, r.len)); railI.setMatrixAt(i, m4); });
    postI.castShadow = railI.castShadow = true; postI.receiveShadow = railI.receiveShadow = true;
    sc.add(postI, railI);
    // la porte de l'enclos, grande ouverte (un battant de chaque côté)
    const gk = new K.Kit();
    for (const sx of [-1, 1]) {
      const hx = S.GATE.x + sx * S.GATE.w / 2, hz = S.GATE_Z;
      gk.add(new THREE.BoxGeometry(0.22, 1.7, 0.22), 0xf4f0e6, { x: hx, y: S.heightAt(hx, hz) + 0.75, z: hz });
      const ang = sx * 0.55;
      for (const hh of [0.4, 0.95]) gk.add(new THREE.BoxGeometry(0.1, 0.14, 2.6), 0xf4f0e6, { x: hx + Math.sin(ang) * 1.3 * sx, y: S.heightAt(hx, hz) + hh, z: hz + Math.cos(ang) * 1.3, ry: ang * sx });
      gk.add(new THREE.BoxGeometry(0.1, 0.14, 2.8), 0xf4f0e6, { x: hx + Math.sin(ang) * 1.3 * sx, y: S.heightAt(hx, hz) + 0.68, z: hz + Math.cos(ang) * 1.3, ry: ang * sx, rx: 0.4 });
    }
    // une pancarte « Moutons » au-dessus de la porte
    gk.add(new THREE.BoxGeometry(S.GATE.w + 0.3, 0.2, 0.2), 0xf4f0e6, { x: S.GATE.x, y: S.heightAt(S.GATE.x, S.GATE_Z) + 1.75, z: S.GATE_Z });
    sc.add(gk.mesh(K.vmat(0.8)));
  }

  // Foin : bottes carrées (escaliers) et grosses bottes rondes
  {
    const baleGeo = K.paint(new THREE.BoxGeometry(1, 1, 1), (x, y, z, c) => {
      const n = Math.sin(x * 40 + y * 13) * 0.5 + Math.sin(z * 37 - y * 17) * 0.5;
      c.set(0xe8c868).multiplyScalar(0.86 + n * 0.08);
      if (Math.abs(Math.abs(x) - 0.25) < 0.04 && Math.abs(y) < 0.49) c.set(0x9a7a3a);
    });
    const bales = [];
    for (const b of S.LOFT_BALES.concat(S.HAY_STACK)) {
      const H = b.top - b.y, n = Math.max(1, Math.round(H / 1.1)), hh = H / n;
      for (let i = 0; i < n; i++) bales.push({ x: b.x, z: b.z, y: b.y + hh * (i + 0.5) - 0.02 * i, w: b.w, d: b.d, h: hh, r: (i % 2) * 0.04 });
    }
    // quelques bottes posées sur le grenier (les chats s'y cachent)
    for (const [dx, dz] of [[-2.2, -0.9], [0.6, -1.0], [3.0, -0.9]]) bales.push({ x: S.LOFT.x + dx, z: S.LOFT.z + dz - 0.3, y: S.LOFT.top + 0.45, w: 1.6, d: 1.0, h: 0.9, r: 0 });
    const bi = new THREE.InstancedMesh(baleGeo, K.vmat(0.95), bales.length);
    bales.forEach((b, i) => { m4.compose(v3.set(b.x, b.y, b.z), q.setFromEuler(e.set(0, b.r, 0)), sv.set(b.w, b.h, b.d)); bi.setMatrixAt(i, m4); });
    bi.castShadow = bi.receiveShadow = true; sc.add(bi);
    const rk = new K.Kit();
    rk.add(new THREE.CylinderGeometry(0.8, 0.8, 1.3, 22, 1), (x, y, z, c) => {
      const r = Math.hypot(x, z);
      c.set(0xe0bc58).multiplyScalar(0.84 + (Math.abs(y) > 0.64 ? Math.sin(r * 30) * 0.08 : Math.sin(Math.atan2(z, x) * 30 + y * 6) * 0.06));
    }, { rz: Math.PI / 2 });
    const ri = new THREE.InstancedMesh(rk.geo(), K.vmat(0.95), S.ROUND_BALES.length);
    S.ROUND_BALES.forEach((b, i) => { m4.compose(v3.set(b.x, b.y + 0.78, b.z), q.setFromEuler(e.set(0, b.rot, 0)), sv.set(1, 1, 1)); ri.setMatrixAt(i, m4); });
    ri.castShadow = ri.receiveShadow = true; sc.add(ri);
  }

  // La flaque de boue des cochons
  const MUDY = S.heightAt(S.MUD.x, S.MUD.z) + 0.05;
  {
    const g = new THREE.CircleGeometry(S.MUD.r, 40, 0, Math.PI * 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), a = Math.atan2(y, x), k = 1 + Math.sin(a * 5 + 1) * 0.08 + Math.sin(a * 3) * 0.06; if (Math.hypot(x, y) > 0.1) { p.setX(i, x * k); p.setY(i, y * k); } }
    g.rotateX(-Math.PI / 2);
    const gm = K.paint(g, (x, y, z, c) => c.set(0x9a6a3e).lerp(new THREE.Color(0x6a4426), Math.max(0, Math.sin(x * 3) * Math.sin(z * 2.6)) * 0.7));
    const mud = new THREE.Mesh(gm, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    mud.position.set(S.MUD.x, MUDY, S.MUD.z); mud.receiveShadow = true; mud.userData.noOutline = true;
    sc.add(mud);
    // petites mottes autour
    const mk = new K.Kit();
    for (let i = 0; i < 10; i++) { const a = i * 0.63, r = S.MUD.r * (1.02 + (i % 3) * 0.08); mk.add(new THREE.SphereGeometry(0.22 + (i % 2) * 0.1, 8, 6), 0x5a3a1c, { x: S.MUD.x + Math.cos(a) * r, y: MUDY, z: S.MUD.z + Math.sin(a) * r, sy: 0.35 }); }
    // l'auge des cochons
    mk.add(new THREE.BoxGeometry(1.8, 0.4, 0.6), 0x8a6a4a, { x: S.PIGPEN.x + 3, y: S.heightAt(S.PIGPEN.x + 3, S.PIGPEN.z - 2.5) + 0.2, z: S.PIGPEN.z - 2.5 });
    sc.add(mk.mesh(K.vmat(0.6)));
  }

  // La mare : ponton, pierres de gué, îlot, roseaux, nénuphars
  {
    const k = new K.Kit();
    const J = S.JETTY, len = J.z0 - J.z1;
    for (let i = 0; i < Math.round(len / 0.5); i++) k.add(new THREE.BoxGeometry(J.w, 0.12, 0.44), i % 2 ? 0xa87a4a : 0x9a6e40, { x: J.x, y: J.top - 0.06, z: J.z1 + 0.25 + i * 0.5 });
    for (const sx of [-1, 1]) for (const z of [J.z1 + 0.3, (J.z0 + J.z1) / 2, J.z0 - 0.3]) k.add(new THREE.CylinderGeometry(0.1, 0.1, 2.6, 8), 0x6a4a2a, { x: J.x + sx * (J.w / 2 - 0.1), y: J.top - 1.2, z });
    const isl = new THREE.CylinderGeometry(S.ISLET.r * 0.98, S.ISLET.r * 1.25, 3, 20, 2);
    k.add(isl, (x, y, z, c) => c.set(y > 1.3 ? 0x6ab840 : 0xd8c088), { x: S.ISLET.x, y: S.ISLET.top - 1.5, z: S.ISLET.z });
    sc.add(k.mesh(K.vmat(0.85)));
    const rm = W.rockMat();
    S.STONES.forEach((s, i) => {
      const m = new THREE.Mesh(W.rockGeometry(70 + i, s.r * 1.25, 1.4, s.r * 1.25), rm);
      const top = W.flattenRockTop(m.geometry, 0.5);
      m.position.set(s.x, s.top - top + 0.03, s.z);
      m.castShadow = m.receiveShadow = true; sc.add(m);
    });
    // roseaux et nénuphars
    const r = rng(41), reeds = [], lilies = [];
    for (let i = 0; i < 400 && reeds.length < (lite ? 10 : 18); i++) {
      const a = r() * Math.PI * 2, d = S.POND.r * (0.75 + r() * 0.5);
      const x = S.POND.x + Math.cos(a) * d, z = S.POND.z + Math.sin(a) * d, h = S.heightAt(x, z);
      if (h < -0.3 || h > 0.9 || Math.abs(x - S.JETTY.x) < 2 && z > S.JETTY.z1 - 1) continue;
      reeds.push([x, Math.max(h, -0.2), z, r() * 6]);
    }
    for (let i = 0; i < 12; i++) { const a = i * 0.9 + 0.3, d = 2 + (i % 4) * 1.3; lilies.push([S.POND.x + Math.cos(a) * d, S.POND.z + Math.sin(a) * d, r() * 6, 0.7 + r() * 0.6]); }
    const ri = new THREE.InstancedMesh(K.reedGeo(), K.vmat(0.8), reeds.length);
    reeds.forEach(([x, y, z, a], i) => { m4.compose(v3.set(x, y, z), q.setFromEuler(e.set(0, a, 0)), sv.set(1, 1, 1)); ri.setMatrixAt(i, m4); });
    const li = new THREE.InstancedMesh(K.lilyGeo(), K.vmat(0.5), lilies.length);
    lilies.forEach(([x, z, a, s], i) => { m4.compose(v3.set(x, S.WATER_Y + 0.04, z), q.setFromEuler(e.set(0, a, 0)), sv.set(s, 1, s)); li.setMatrixAt(i, m4); });
    li.userData.noOutline = true;
    ri.castShadow = true;
    sc.add(ri, li);
  }

  // Le Rocher aux Corbeaux (blocs à grimper) et le belvédère (banc et longue-vue)
  {
    const rm = W.rockMat();
    S.CROW_ROCKS.forEach((k, i) => {
      const hgt = k.top - k.y + 1.2;
      const m = new THREE.Mesh(W.rockGeometry(90 + i, k.r * 1.25, hgt / 2, k.r * 1.25), rm);
      const top = W.flattenRockTop(m.geometry, hgt / 2 * 0.4);
      m.position.set(k.x, k.top - top + 0.03, k.z);
      m.castShadow = m.receiveShadow = true; sc.add(m);
    });
    const k = new K.Kit(), B = S.LOOKOUT;
    k.add(new THREE.BoxGeometry(2, 0.12, 0.6), 0x9a6a3a, { x: B.x - 2.5, y: B.y + 0.5, z: B.z - 1 });
    for (const sx of [-1, 1]) k.add(new THREE.BoxGeometry(0.12, 0.5, 0.5), 0x7a4a2a, { x: B.x - 2.5 + sx * 0.85, y: B.y + 0.22, z: B.z - 1 });
    k.add(new THREE.CylinderGeometry(0.06, 0.08, 1.3, 8), 0x3a3a40, { x: B.x + 2, y: B.y + 0.65, z: B.z - 2 });
    k.add(new THREE.CylinderGeometry(0.1, 0.14, 0.8, 12), 0xc89a30, { x: B.x + 2, y: B.y + 1.4, z: B.z - 2.1, rx: Math.PI / 2 - 0.2 });
    sc.add(k.mesh(K.vmat(0.6)));
  }

  // Le champ de tournesols (tiges et fleurs instanciées, tournées vers le soleil)
  const SF = S.SUNFLOWERS;
  const flowers = [];
  {
    const r = rng(77), g = K.sunflowerGeos();
    const step = lite ? 1.75 : 1.3;
    for (let x = SF.x - SF.w / 2 + 0.6; x < SF.x + SF.w / 2; x += step) {
      for (let z = SF.z - SF.d / 2 + 0.6; z < SF.z + SF.d / 2; z += step) {
        const fx = x + (r() - 0.5) * 0.5, fz = z + (r() - 0.5) * 0.5;
        if (Math.abs(fz - SF.z) < 1.3) continue;                                   // l'allée du milieu
        if (Math.hypot(fx - S.PIGLET.x, fz - S.PIGLET.z) < 2.0) continue;             // la petite clairière de Caramel
        flowers.push({ x: fx, z: fz, y: S.heightAt(fx, fz), h: 0.85 + r() * 0.3, a: 0.6 + (r() - 0.5) * 0.5, ph: r() * 6 });
      }
    }
    const stems = new THREE.InstancedMesh(g.stem, K.vmat(0.8), flowers.length);
    const heads = new THREE.InstancedMesh(g.head, K.vmat(0.7), flowers.length);
    flowers.forEach((f, i) => {
      m4.compose(v3.set(f.x, f.y, f.z), q.setFromEuler(e.set(0, f.ph, 0)), sv.set(1, f.h, 1)); stems.setMatrixAt(i, m4);
    });
    stems.castShadow = heads.castShadow = true;
    sc.add(stems, heads);
    flowers.heads = heads;
    flowers.place = (t) => {
      flowers.forEach((f, i) => {
        const sway = Math.sin(t * 1.3 + f.ph) * 0.05;
        m4.compose(v3.set(f.x + Math.sin(f.a) * 0.08, f.y + 2.0 * f.h + 0.05, f.z + Math.cos(f.a) * 0.08), q.setFromEuler(e.set(-0.25 + sway, f.a, sway * 0.6)), sv.set(1.1, 1.1, 1.1));
        heads.setMatrixAt(i, m4);
      });
      heads.instanceMatrix.needsUpdate = true;
    };
    flowers.place(0);
  }

  // Le potager devant la maison
  {
    const PX = S.GARDEN.x, PZ = S.GARDEN.z;
    const k = new K.Kit();
    for (let row = 0; row < 3; row++) k.add(new THREE.BoxGeometry(6, 0.18, 0.8), 0x6a4a2a, { x: PX, y: S.heightAt(PX, PZ) + 0.04, z: PZ - 1.4 + row * 1.4 });
    sc.add(k.mesh(K.vmat(0.95)));
    const cab = [];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) cab.push([PX - 2.5 + i, PZ - 1.4 + row * 1.4]);
    const ci = new THREE.InstancedMesh(K.cabbageGeo(), K.vmat(0.7), cab.length);
    cab.forEach(([x, z], i) => { m4.compose(v3.set(x, S.heightAt(x, z) + 0.08, z), q.setFromEuler(e.set(0, i, 0)), sv.setScalar(0.8 + (i % 3) * 0.12)); ci.setMatrixAt(i, m4); });
    ci.castShadow = true; sc.add(ci);
  }

  // Le panier à œufs, près du poulailler
  const basket = K.buildBasket();
  basket.position.set(S.BASKET.x, S.heightAt(S.BASKET.x, S.BASKET.z), S.BASKET.z);
  add(basket);

  // Drapeaux de passage
  const flags = S.CHECKPOINTS.map((c, i) => {
    const f = K.buildFlag();
    f.position.set(c.x, c.y, c.z);
    f.rotation.y = -0.6;
    add(f);
    return { def: c, g: f, u: f.userData, raise: 0, raisedAt: -9, i };
  });

  // Les ailes perdues du moulin
  const partGeo = K.sailPartGeo();
  const partMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide, emissive: 0x403010, emissiveIntensity: 0.3 });
  const parts = S.SAIL_PARTS.map((p) => {
    const m = new THREE.Mesh(partGeo, partMat);
    m.position.set(p.x, p.y, p.z); m.castShadow = true;
    sc.add(m); moving.push(m);
    const glow = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 10, 14, 1, true), game.beamMaterial());
    glow.position.set(p.x, p.y + 4.5, p.z); glow.userData.noOutline = true; glow.renderOrder = 3; sc.add(glow);
    return { def: p, m, glow };
  });

  // =============================================================================
  // Les animaux
  // =============================================================================
  // ombres rondes (une seule image pour tous les animaux)
  const shadowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.5, 'rgba(0,0,0,0.6)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const NSH = S.SHEEP.length + S.HENS.length + 3;
  const blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, color: 0x0a1a08, transparent: true, opacity: 0.32, depthWrite: false }), NSH);
  blobs.renderOrder = 1; blobs.userData.noOutline = true; blobs.frustumCulled = false;
  sc.add(blobs);
  let blobN = 0;
  const blob = (x, y, z, r) => { m4.compose(v3.set(x, y + 0.04, z), q.identity(), sv.set(r * 2.4, 1, r * 2.4)); blobs.setMatrixAt(blobN++, m4); };

  // --- moutons -------------------------------------------------------------------
  const sg = K.sheepGeos(lite);
  const woolI = new THREE.InstancedMesh(sg.wool, K.vmat(0.95), S.SHEEP.length);
  const headI = new THREE.InstancedMesh(sg.head, K.vmat(0.7), S.SHEEP.length);
  const legI = new THREE.InstancedMesh(sg.leg, K.vmat(0.8), S.SHEEP.length * 4);
  for (const o of [woolI, headI, legI]) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; sc.add(o); moving.push(o); }
  const penSpot = (i) => {
    const P = S.PEN_INSIDE, cols = 4;
    return { x: P.x0 + 1.4 + (i % cols) * ((P.x1 - P.x0 - 2.8) / (cols - 1)), z: P.z0 + 1.4 + Math.floor(i / cols) * 3 };
  };
  const sheep = S.SHEEP.map((d, i) => {
    const s = { def: d, i, x: d.x, z: d.z, y: d.y, yaw: Math.random() * 6, vx: 0, vz: 0, pen: farm().pen.includes(d.id), phase: Math.random() * 6, graze: Math.random() * 3, wander: null, wanderT: Math.random() * 3, scare: 0, sx: d.x, sz: d.z, tx: d.x, tz: d.z, speed: 0, hop: 0 };
    if (s.pen) { const p = penSpot(i); s.x = p.x; s.z = p.z; s.y = S.heightAt(p.x, p.z); }
    s.tx = s.x; s.tz = s.z;
    s.lamb = d.lamb; s.state = s.pen ? 'pen' : d.lamb ? 'lost' : 'free';
    if (d.lamb) { s.mark = game.makeMark('?', 0xffffff); s.mark.scale.set(0.7, 0.7, 1); }
    return s;
  });

  // --- poules ----------------------------------------------------------------------
  const henI = new THREE.InstancedMesh(K.henGeo(), K.vmat(0.85), S.HENS.length);
  henI.castShadow = true; henI.frustumCulled = false; sc.add(henI); moving.push(henI);
  const hens = S.HENS.map((d, i) => ({ def: d, i, x: d.x, z: d.z, y: d.y, yaw: i, egg: i >= farm().eggs, run: 0, t: Math.random() * 2, tx: d.x, tz: d.z, hop: 0, peck: Math.random() * 4, gx: d.x, gz: d.z }));
  hens.forEach((h, i) => henI.setColorAt(i, new THREE.Color(i % 3 === 1 ? 0xd88a50 : i % 3 === 2 ? 0xf0d8b0 : 0xffffff)));

  // --- œufs (dans le panier et sur le dos des chiens) ---------------------------------
  const EGG_MAX = 48;
  const eggI = new THREE.InstancedMesh(K.eggGeo(), K.vmat(0.45), EGG_MAX);
  eggI.castShadow = true; eggI.frustumCulled = false; sc.add(eggI); moving.push(eggI);

  // --- canards sur la mare ------------------------------------------------------------
  const DUCKS = 7;
  const duckI = new THREE.InstancedMesh(K.duckGeo(), K.vmat(0.6), DUCKS);
  for (let i = 0; i < DUCKS; i++) duckI.setColorAt(i, new THREE.Color(i < 3 ? 0xffffff : 0xffe25a));
  duckI.frustumCulled = false; sc.add(duckI); moving.push(duckI);

  // --- pommes ------------------------------------------------------------------------
  const APP_PER = 7;
  const apples = [];
  S.APPLE_TREES.forEach((t, ti) => {
    const top = t.y + t.h, r = rng(300 + ti);
    for (let k = 0; k < APP_PER; k++) {
      const a = (k / APP_PER) * Math.PI * 2 + r() * 0.6, el = -0.35 + r() * 0.75, R = 2.45 * t.s;
      const hx = t.x + Math.cos(a) * Math.cos(el) * R, hz = t.z + Math.sin(a) * Math.cos(el) * R, hy = top + 0.8 * t.s + Math.sin(el) * R * 0.85;
      apples.push({ tree: ti, hx, hy, hz, x: hx, y: hy, z: hz, vx: 0, vy: 0, vz: 0, s: 0, t: 0 });
    }
  });
  const appleI = new THREE.InstancedMesh(K.appleGeo(), K.vmat(0.35), apples.length);
  appleI.castShadow = true; appleI.frustumCulled = false; sc.add(appleI); moving.push(appleI);
  const treeBump = S.APPLE_TREES.map(() => -9);

  // --- vaches, cochons, Papi -------------------------------------------------------------
  const cows = S.COWS.map((c, i) => {
    const m = K.buildCow({ flowers: c.id === 'margot', bell: c.id === 'margot', brown: i === 2, seed: i * 3 });
    m.position.set(c.x, c.y, c.z); m.rotation.y = c.yaw;
    add(m); chars.push(m);
    return { def: c, m, u: m.userData, yaw: c.yaw, ph: i * 1.7, moo: -9 };
  });
  const margot = cows[0];
  const pigs = [[S.MUD.x + 0.6, S.MUD.z + 0.3, 2.2], [S.PIGPEN.x + 3, S.PIGPEN.z + 1.5, -2.4]].map(([x, z, yaw], i) => {
    const m = K.buildPig({ scale: 1.05 - i * 0.1 });
    m.position.set(x, S.heightAt(x, z) - (i === 0 ? 0.12 : 0), z); m.rotation.y = yaw;
    add(m); chars.push(m);
    return { m, u: m.userData, ph: i * 2, x, z, yaw };
  });
  const papi = K.buildPapi();
  papi.position.set(S.npcs.papi.x, S.npcs.papi.y, S.npcs.papi.z);
  papi.rotation.y = 0.35;
  add(papi); chars.push(papi);
  // Caramel le cochonnet
  const piglet = { mesh: K.buildPig({ scale: 0.5, spot: true, bow: true, color: 0xf8c0b8 }), state: farm().piglet ? 'home' : 'lost', x: S.PIGLET.x, z: S.PIGLET.z, y: S.PIGLET.y, yaw: 0.8, phase: 0, follow: null, happy: 0, tx: 0, tz: 0 };
  if (piglet.state === 'home') { piglet.x = S.PIGLET_HOME.x; piglet.z = S.PIGLET_HOME.z; piglet.y = S.PIGLET_HOME.y; }
  add(piglet.mesh); chars.push(piglet.mesh); moving.push(piglet.mesh);
  const pigMark = game.makeMark('?', 0xff8ab0);
  pigMark.scale.set(0.7, 0.7, 1);

  // --- le tracteur de Papi ----------------------------------------------------------------
  const TR = { x: S.TRACTOR.x, z: S.TRACTOR.z, y: S.heightAt(S.TRACTOR.x, S.TRACTOR.z), yaw: S.TRACTOR.yaw, speed: 0, vy: 0, grounded: true, driver: -1, wheelA: 0, bumpT: 0, honkT: -9, steer: 0, tractor: true };
  const tractor = K.buildTractor();
  add(tractor); moving.push(tractor);
  const trShadow = game.makeShadow(1.6);

  // --- la boue sur les chiens ------------------------------------------------------------
  const mudFor = new Map();
  function mudMesh(P) {
    const mesh = P.mesh;
    if (!mesh) return null;
    let m = mudFor.get(mesh);
    if (!m) {
      // des points pris sur le pelage lui-même (plutôt en bas : pattes, ventre, flancs)
      mesh.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert(), pts = [], v = new THREE.Vector3();
      const r = rng(5);
      mesh.traverse((o) => {
        if (!o.isMesh || o.userData.isOutline || !o.geometry || !o.geometry.attributes.position || !o.visible) return;
        const pa = o.geometry.attributes.position, step = Math.max(1, Math.floor(pa.count / 300));
        for (let i = Math.floor(r() * step); i < pa.count; i += step) { v.fromBufferAttribute(pa, i).applyMatrix4(o.matrixWorld).applyMatrix4(inv); pts.push(v.x, v.y, v.z); }
      });
      let top = 0; for (let i = 1; i < pts.length; i += 3) top = Math.max(top, pts[i]);
      const low = [];
      for (let i = 0; i < pts.length; i += 3) if (pts[i + 1] < top * 0.62) low.push([pts[i], pts[i + 1], pts[i + 2]]);
      const pick = [];
      let cx = 0, cy = 0, cz = 0;
      for (const q of low) { cx += q[0]; cy += q[1]; cz += q[2]; }
      cx /= low.length || 1; cy /= low.length || 1; cz /= low.length || 1;
      for (let i = 0; i < 50 && low.length; i++) {
        // un peu en dehors du pelage (sinon les poils les cachent)
        const q = low[Math.floor(r() * low.length)], dx = q[0] - cx, dy = (q[1] - cy) * 0.5, dz = (q[2] - cz) * 0.35, l = Math.hypot(dx, dy, dz) || 1;
        pick.push([q[0] + dx / l * 0.07, q[1] + dy / l * 0.07, q[2] + dz / l * 0.07]);
      }
      m = K.mudSpots(pick.length > 8 ? pick : null);
      m.visible = false; m.userData.noOutline = true;
      mesh.add(m); mudFor.set(mesh, m);
    }
    return m;
  }

  const MUDC = new THREE.Color(0x7a5434), MUDE = new THREE.Color(0x3a2614);
  /** Teinte boue sur le pelage (seulement les chiens joueurs texturés : leurs matériaux sont à eux). */
  function tintMud(P, k) {
    P.mudTint = k;
    P.mesh.traverse((o) => {
      if (!o.isSkinnedMesh || !o.material || !o.material.color) return;
      const m = o.material;
      if (!m.userData.mud0) m.userData.mud0 = { c: m.color.clone(), e: m.emissive ? m.emissive.clone() : null };
      m.color.copy(m.userData.mud0.c).lerp(MUDC, k * 0.75);
      if (m.emissive && m.userData.mud0.e) m.emissive.copy(m.userData.mud0.e).lerp(MUDE, k * 0.75);
    });
  }

  // =============================================================================
  // État et règles
  // =============================================================================
  // --- la couche de vie : bêtes, objets, défis éclair, habitants, cachettes (life.js) ---------
  // (avant les obstacles des animaux : moutons et poules contournent aussi les arbres fruitiers, ruches, épouvantails…)
  const life = buildLife(game, {
    L: { heightAt: S.heightAt, blockedAt: S.lifeBlockedAt, addColliders: S.addColliders, WATER_Y: S.WATER_Y },
    plan: LIFE.PLAN, palette: LIFE.PALETTE, lines: LIFE.LINES, ground: LIFE.ground, surface: LIFE.ground, isWater: LIFE.wet, real: true, grain: true,
    mats: { fur: skinMaterial('fur'), cloth: skinMaterial('fabric'), tool: skinMaterial('wood'), hat: skinMaterial('fabric') },
    view: lite ? 78 : 130, active: lite ? 55 : 80,
    shakeText: 'Secouez les buissons, les arbres et les ruches, cassez les bottes de paille : il y a des trésors partout',
    allDoneText: 'Toute la ferme fait la fête : les animaux dansent !',
    hooks: {
      // une flaque de boue : on en ressort tout crotté (et la mare lave tout, comme d'habitude)
      onSplash(P) { if (P.kart) return; if (!(P.mudT > 0)) snd.squelch(); P.mudT = 14; P.shakeT = 0; },
    },
  });
  const st = { lastBark: new Map(), cp: 0, millSpin: 0, millK: farm().fixed.length >= S.SAIL_PARTS.length ? 1 : 0, hint: {}, guestLerp: false };
  const players = () => game.players;
  const meFarm = () => game.me;
  const dist2 = (ax, az, bx, bz) => (ax - bx) ** 2 + (az - bz) ** 2;

  function reveal(msg, sub) {
    game.updateMedalVisibility();
    game.sound('reveal');
    if (msg) game.banner(msg, sub, 3200);
  }

  // --- drapeaux ----------------------------------------------------------------------
  function raiseFlag(c, P) {
    const f = farm();
    if (f.flags.includes(c.id)) return;
    f.flags.push(c.id); game.persist();
    flags[c.id].raisedAt = game.t;
    game.sound('cp');
    game.burst(c.x, c.y + 3, c.z, 18, 0xffe070, 3.5, 0.7);
    game.banner('Drapeau !', `${c.name} : si vous tombez, vous repartez d'ici.`, 2000);
    void P;
  }

  // --- moutons ---------------------------------------------------------------------
  // obstacles des animaux (barrières, bâtiments, arbres, rochers…), triés une fois pour toutes
  const SOLIDS = S.colliders.filter(c => c.solid || c.kind === 'tree' || c.kind === 'rock');
  /** Repousse un cercle hors des obstacles (sans rien allouer : appelé souvent). */
  function pushOut(p, y, r) {
    for (const c of SOLIDS) {
      if (c.off || c.y1 <= y + 0.35 || c.y0 >= y + 1.5) continue;
      if (c.type === 'cyl') {
        const dx = p.x - c.x, dz = p.z - c.z, min = c.r + r;
        if (dx > min || dx < -min || dz > min || dz < -min) continue;
        const d = Math.hypot(dx, dz);
        if (d < min && d > 1e-6) { p.x = c.x + dx / d * min; p.z = c.z + dz / d * min; }
      } else {
        const hx = c.w / 2, hz = c.d / 2;
        if (p.x > c.x + hx + r || p.x < c.x - hx - r || p.z > c.z + hz + r || p.z < c.z - hz - r) continue;
        const qx = clamp(p.x, c.x - hx, c.x + hx), qz = clamp(p.z, c.z - hz, c.z + hz);
        const dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz);
        if (d < r) {
          if (d > 1e-6) { p.x = qx + dx / d * r; p.z = qz + dz / d * r; }
          else { const ox = hx - Math.abs(p.x - c.x) + r, oz = hz - Math.abs(p.z - c.z) + r; if (ox < oz) p.x += Math.sign(p.x - c.x || 1) * ox; else p.z += Math.sign(p.z - c.z || 1) * oz; }
        }
      }
    }
  }
  /** Agneau perdu : il attend qu'on le trouve, puis il suit son chien jusqu'à l'enclos. */
  function stepLamb(s, dt) {
    s.phase += dt * (1 + s.speed * 4);
    if (s.state === 'lost') {
      s.speed = 0;
      const P = players().find(Q => Math.hypot(Q.pos.x - s.x, Q.pos.z - s.z) < 3.2 && Math.abs(Q.pos.y - s.y) < 2.5);
      if (P) {
        s.state = 'follow'; s.follow = P; s.hop = 0.45;
        snd.baa(1.4);
        game.bubble({ pos: new THREE.Vector3(s.x, s.y, s.z), small: true }, 'Bêê !');
        game.banner('Un agneau perdu !', 'Il vous suit : ramenez-le à l\'enclos des moutons', 2800);
        game.updateHud();
      } else if (Math.random() < dt * 0.15 && Math.hypot(game.camera.position.x - s.x, game.camera.position.z - s.z) < 25) snd.baa(1.4);
      return;
    }
    const G = S.GATE, gx = G.x, gz = S.GATE_Z;
    let P = s.follow && game.party.get(s.follow.id) === s.follow ? s.follow : null;
    if (!P) P = s.follow = game.nearestPlayer(s);
    let tx = P.pos.x - Math.sin(P.yaw) * 2.2, tz = P.pos.z - Math.cos(P.yaw) * 2.2;
    // près de la porte : il rentre tout seul retrouver les autres
    if (Math.hypot(s.x - gx, s.z - gz) < 9 || Math.hypot(P.pos.x - gx, P.pos.z - gz) < 6) { s.state = 'home'; }
    if (s.state === 'home') {
      // d'abord devant la porte, puis tout droit dans l'enclos
      const front = s.z > gz + 1.5 && Math.abs(s.x - gx) < 2.5;
      if (front || S.inPen(s.x, s.z) || (s.z > gz - 0.8 && Math.abs(s.x - gx) < G.w / 2 - 0.8)) { tx = gx; tz = S.PEN.z; } else { tx = gx; tz = gz + 3; }
    }
    const dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
    if (s.state === 'follow' && d > 28) { s.x = tx; s.z = tz; s.vx = s.vz = 0; }
    else if (d > 0.5) {
      const sp = s.state === 'home' ? 3 : Math.min(d * 2.5, 9.5);
      s.vx = dx / d * sp; s.vz = dz / d * sp;
      const next = { x: s.x + s.vx * dt, z: s.z + s.vz * dt };
      if (S.heightAt(next.x, next.z) > 0.8) { pushOut(next, s.y, 0.4); s.x = next.x; s.z = next.z; }
      s.yaw = lerpAngle(s.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8));
    } else { s.vx = s.vz = 0; }
    s.speed = Math.hypot(s.vx, s.vz);
    s.y = S.heightAt(s.x, s.z);
    if (S.inPen(s.x, s.z)) { s.state = 'pen'; penSheep(s); }
  }
  function penSheep(s) {
    s.pen = true; s.state = 'pen'; s.follow = null;
    const f = farm();
    if (!f.pen.includes(s.def.id)) f.pen.push(s.def.id);
    game.persist();
    snd.baa(1.1);
    game.burst(s.x, s.y + 1.2, s.z, 14, 0xfffbe8, 3, 0.6);
    game.bubble({ pos: new THREE.Vector3(s.x, s.y + 0.4, s.z), small: true }, 'Bêê !');
    const n = f.pen.length, N = S.SHEEP.length;
    if (n >= N) reveal('Tous les moutons sont rentrés !', 'Une Médaille Patoune brille dans l\'enclos !');
    else game.banner(`Moutons : ${n}/${N}`, n === 1 ? 'Bravo ! Encore les autres…' : n === N - 1 ? 'Plus qu\'un !' : 'Continuez !', 1500);
    for (const Q of players()) if (Math.hypot(Q.pos.x - s.x, Q.pos.z - s.z) < 14) Q.cheerT = Math.max(Q.cheerT, 0.6);
    updateChips();
  }
  function stepSheep(dt) {
    const easy = game.easy;
    const PL = players();
    const G = S.GATE, gz = S.GATE_Z, PI = S.PEN_INSIDE;
    const penned = farm().pen.length;
    for (const s of sheep) {
      if (s.lamb && !s.pen) { stepLamb(s, dt); continue; }
      s.scare = Math.max(0, s.scare - dt);
      s.phase += dt * (1 + s.speed * 3.2);
      if (s.pen) {
        // à l'enclos : on broute, on se promène un peu, on ne ressort jamais
        s.wanderT -= dt;
        if (!s.wander || s.wanderT <= 0) { s.wander = { x: PI.x0 + 0.8 + Math.random() * (PI.x1 - PI.x0 - 1.6), z: PI.z0 + 0.8 + Math.random() * (PI.z1 - PI.z0 - 1.6) }; s.wanderT = 3 + Math.random() * 5; }
        const dx = s.wander.x - s.x, dz = s.wander.z - s.z, d = Math.hypot(dx, dz);
        const want = d > 0.4 ? 0.7 : 0;
        s.vx += ((want ? dx / d * want : 0) - s.vx) * Math.min(1, dt * 3); s.vz += ((want ? dz / d * want : 0) - s.vz) * Math.min(1, dt * 3);
        s.z = clamp(s.z + s.vz * dt, PI.z0, gz - 1.2);
        const hw = s.z > S.PEN_FRONT ? S.vHalf(s.z) - 0.7 : 99;
        s.x = clamp(s.x + s.vx * dt, Math.max(PI.x0, G.x - hw), Math.min(PI.x1, G.x + hw));
        s.y = S.heightAt(s.x, s.z);
        s.speed = Math.hypot(s.vx, s.vz);
        if (s.speed > 0.15) s.yaw = lerpAngle(s.yaw, Math.atan2(s.vx, s.vz), Math.min(1, dt * 4));
        continue;
      }
      // les chiens (et le tracteur) font peur ; un « Ouaf ! » fait courir plus loin
      let fx = 0, fz = 0, threat = 0;
      for (const P of PL) {
        const dx = s.x - P.pos.x, dz = s.z - P.pos.z, d = Math.hypot(dx, dz) || 0.01;
        if (Math.abs(P.pos.y - s.y) > 4) continue;
        const R = (P.kart ? 9.5 : 7.5) + (easy ? 1.5 : 0);
        if (d < R) { const w = 1 - d / R; fx += dx / d * w; fz += dz / d * w; threat = Math.max(threat, w); }
      }
      // le troupeau reste groupé (cohésion, séparation, même direction)
      let cx = 0, cz = 0, ax = 0, az = 0, n = 0, px = 0, pz = 0;
      for (const o of sheep) {
        if (o === s || o.pen || o.lamb) continue;
        const dx = o.x - s.x, dz = o.z - s.z, d = Math.hypot(dx, dz);
        if (d < 6) { cx += o.x; cz += o.z; ax += o.vx; az += o.vz; n++; }
        if (d < 1.35 && d > 0.001) { px -= dx / d * (1.35 - d); pz -= dz / d * (1.35 - d); }
      }
      let dirx = fx * 2.2, dirz = fz * 2.2;
      if (n) { dirx += ((cx / n - s.x) * 0.08 + ax / n * 0.12) * (threat > 0 ? 0.6 : 0.25); dirz += ((cz / n - s.z) * 0.08 + az / n * 0.12) * (threat > 0 ? 0.6 : 0.25); }
      dirx += px * 2.5; dirz += pz * 2.5;
      // près de la porte : l'herbe fraîche de l'enclos (et les copains déjà rentrés) les attirent : porte « généreuse »
      const gdx = G.x - s.x, gdz = gz - 3 - s.z, gd = Math.hypot(gdx, gdz) || 0.01;
      const pullR = (easy ? 14 : 11) + penned * 0.4;
      const funnel = s.z > gz - 0.5 && s.z < gz + 5 && Math.abs(s.x - G.x) < G.w / 2 + 1.5 + (s.z - gz) * 0.7;
      let lure = 0;
      if (funnel) { const w = 2.4; dirx += gdx / gd * w; dirz += gdz / gd * w; lure = 1.6; }
      else if (s.z > gz - 0.5 && gd < pullR) { const w = (1 - gd / pullR) * (threat > 0 ? 1.6 : 1.0) * (1 + penned * 0.08); dirx += gdx / gd * w; dirz += gdz / gd * w; lure = gd < pullR * 0.6 ? 0.9 : 0; }
      // à côté ou derrière l'enclos : on longe la barrière vers l'avant (là où est la porte)
      if (s.z < S.PEN_FRONT + 0.3 && Math.abs(s.x - S.PEN.x) < S.PEN.w / 2 + 4) {
        const out = s.x < S.PEN.x ? -1 : 1;
        dirz += threat > 0 ? 1.4 : 0.6;
        if (Math.abs(s.x - S.PEN.x) < S.PEN.w / 2 + 1.5) dirx += out * 0.7;
        lure = Math.max(lure, 0.6);
      }
      // pas trop près du bord de l'île
      const rr = Math.hypot(s.x, s.z);
      if (rr > S.ISLAND_R - 12) { dirx -= s.x / rr * 0.8; dirz -= s.z / rr * 0.8; }
      let want = 0;
      if (s.scare > 0) want = 6.2;
      else if (threat > 0) want = Math.max(lure, 2.2 + threat * 3.8);
      else if (lure > 0) want = lure;
      else {
        // personne autour : on broute, et parfois on fait quelques pas
        s.wanderT -= dt;
        if (s.wanderT <= 0) { s.wanderT = 2.5 + Math.random() * 4; s.wander = Math.random() < 0.45 ? { x: s.x + (Math.random() - 0.5) * 4, z: s.z + (Math.random() - 0.5) * 4 } : null; }
        if (s.wander) { const dx = s.wander.x - s.x, dz = s.wander.z - s.z, d = Math.hypot(dx, dz); if (d > 0.4) { dirx += dx / d; dirz += dz / d; want = 0.7; } else s.wander = null; }
        else if (n) want = Math.hypot(dirx, dirz) > 0.3 ? 0.5 : 0;
      }
      if (s.scare > 0) { dirx += s.sx * 2; dirz += s.sz * 2; }
      const dl = Math.hypot(dirx, dirz);
      const tvx = dl > 0.01 ? dirx / dl * want : 0, tvz = dl > 0.01 ? dirz / dl * want : 0;
      const acc = Math.min(1, dt * (threat > 0 || s.scare > 0 ? 5 : 2.5));
      s.vx += (tvx - s.vx) * acc; s.vz += (tvz - s.vz) * acc;
      // on avance : pas dans l'eau, pas dans les murs ni les barrières
      const next = { x: s.x + s.vx * dt, z: s.z + s.vz * dt };
      const h = S.heightAt(next.x, next.z);
      if (h < 1.0 || h - s.y > 0.7) { s.vx *= -0.4; s.vz *= -0.4; next.x = s.x; next.z = s.z; }
      pushOut(next, s.y, 0.55);
      s.x = next.x; s.z = next.z; s.y = S.heightAt(s.x, s.z);
      s.speed = Math.hypot(s.vx, s.vz);
      if (s.speed > 0.2) s.yaw = lerpAngle(s.yaw, Math.atan2(s.vx, s.vz), Math.min(1, dt * 6));
      if (S.inPen(s.x, s.z)) penSheep(s);
    }
  }
  /** « Ouaf ! » : les moutons détalent, les poules s'envolent, les chats du grenier filent. */
  function onBark(P) {
    let baa = false;
    for (const s of sheep) {
      if (s.pen || s.lamb) continue;
      const dx = s.x - P.pos.x, dz = s.z - P.pos.z, d = Math.hypot(dx, dz) || 0.01;
      if (d > 13) continue;
      s.scare = 1.4 + (1 - d / 13) * 1.2; s.sx = dx / d; s.sz = dz / d; s.hop = 0.45;
      baa = true;
    }
    if (baa) { snd.baa(); const s = sheep.find(o => o.scare > 0); if (s) game.bubble({ pos: new THREE.Vector3(s.x, s.y + 0.4, s.z), small: true }, 'Bêê !'); }
    for (const h of hens) {
      const d = Math.hypot(h.x - P.pos.x, h.z - P.pos.z);
      if (d < 9) { h.run = 1.2; h.hop = 0.5; }
    }
    if (hens.some(h => h.hop > 0)) snd.cluck();
    if (piglet.state === 'lost' && Math.hypot(piglet.x - P.pos.x, piglet.z - P.pos.z) < 12) { piglet.happy = 1; snd.oink(); }
  }

  // --- poules et œufs --------------------------------------------------------------
  function stepHens(dt) {
    const PL = players();
    for (const h of hens) {
      const Y = h.def.home;
      h.hop = Math.max(0, h.hop - dt); h.run = Math.max(0, h.run - dt); h.peck += dt;
      let near = null, nd = 99;
      for (const P of PL) { const d = Math.hypot(P.pos.x - h.x, P.pos.z - h.z); if (d < nd && Math.abs(P.pos.y - h.y) < 2.5) { nd = d; near = P; } }
      let vx = 0, vz = 0, sp = 0;
      if (near && nd < 4.2) {
        // elle se sauve en zigzag
        const dx = h.x - near.pos.x, dz = h.z - near.pos.z, d = nd || 0.01, zig = Math.sin(game.t * 7 + h.i * 2) * 0.7;
        vx = dx / d + -dz / d * zig; vz = dz / d + dx / d * zig; sp = 3.4; h.run = Math.max(h.run, 0.3);
      } else if (h.run > 0) { vx = Math.cos(h.yaw); vz = Math.sin(h.yaw); sp = 2.5; }
      else {
        h.t -= dt;
        if (h.t <= 0) { const a = Math.random() * Math.PI * 2, r = Math.random() * (Y.r - 2); h.gx = Y.x + Math.cos(a) * r; h.gz = Y.z + Math.sin(a) * r; h.t = 1.5 + Math.random() * 3; }
        const dx = h.gx - h.x, dz = h.gz - h.z, d = Math.hypot(dx, dz);
        if (d > 0.3) { vx = dx / d; vz = dz / d; sp = 0.9; }
      }
      const l = Math.hypot(vx, vz);
      if (l > 0.01) {
        const nx = h.x + vx / l * sp * dt, nz = h.z + vz / l * sp * dt;
        const dc = Math.hypot(nx - Y.x, nz - Y.z);
        if (dc < Y.r - 1.0) { h.x = nx; h.z = nz; } else { h.x = Y.x + (nx - Y.x) / dc * (Y.r - 1.0); h.z = Y.z + (nz - Y.z) / dc * (Y.r - 1.0); }
        const hd = { x: h.x, z: h.z }; pushOut(hd, h.y, 0.3); h.x = hd.x; h.z = hd.z;
        h.yaw = lerpAngle(h.yaw, Math.atan2(vx, vz), Math.min(1, dt * 10));
      }
      h.y = S.heightAt(h.x, h.z);
      h.moving = sp > 0.5;
      // attrapée !
      for (const P of PL) {
        if (P.kart) continue;
        const d = Math.hypot(P.pos.x - h.x, P.pos.z - h.z), reach = P.dashT > 0 || P.attackT > 0 ? 1.7 : 1.15;
        if (d < reach && Math.abs(P.pos.y - h.y) < 1.4) {
          if (h.egg) {
            h.egg = false; h.hop = 0.6; h.run = 1;
            P.eggs = (P.eggs || 0) + 1;
            snd.cluck();
            game.burst(h.x, h.y + 0.6, h.z, 12, 0xffffff, 3, 0.5);
            game.bubble({ pos: new THREE.Vector3(h.x, h.y + 0.1, h.z), small: true }, 'Cot cot !');
            const total = farm().eggs + players().reduce((a, Q) => a + (Q.eggs || 0), 0);
            game.banner(`Un œuf ! (${Math.min(total, S.EGGS_NEEDED)}/${S.EGGS_NEEDED})`, 'Posez-le dans le panier, près du poulailler', 1800);
            updateChips(); game.updateHud();
          } else if (h.hop <= 0) { h.hop = 0.4; h.run = 0.8; if (Math.random() < 0.5) snd.cluck(); }
        }
      }
    }
    // déposer les œufs dans le panier
    for (const P of PL) {
      if (!P.eggs) continue;
      if (Math.hypot(P.pos.x - S.BASKET.x, P.pos.z - S.BASKET.z) < 2.3) {
        const f = farm();
        f.eggs = Math.min(S.EGGS_NEEDED, f.eggs + P.eggs);
        P.eggs = 0;
        game.persist();
        game.sound('heart');
        game.burst(S.BASKET.x, basket.position.y + 0.7, S.BASKET.z, 14, 0xfff4dc, 3, 0.6);
        if (f.eggs >= S.EGGS_NEEDED) reveal('Le panier est plein !', 'Une Médaille Patoune est apparue près du poulailler !');
        else game.banner(`Œufs dans le panier : ${f.eggs}/${S.EGGS_NEEDED}`, 'Il y en a encore chez les poules !', 1800);
        updateChips(); game.updateHud();
      }
    }
  }

  // --- Caramel le cochonnet ------------------------------------------------------------
  function stepPiglet(dt) {
    const pg = piglet;
    pg.happy = Math.max(0, pg.happy - dt);
    if (pg.state === 'follow') {
      let P = pg.follow && game.party.get(pg.follow.id) === pg.follow ? pg.follow : null;
      if (!P) P = pg.follow = game.nearestPlayer(pg);
      const tx = P.pos.x - Math.sin(P.yaw) * 1.6, tz = P.pos.z - Math.cos(P.yaw) * 1.6;
      const dx = tx - pg.x, dz = tz - pg.z, d = Math.hypot(dx, dz);
      if (d > 18) { pg.x = tx; pg.z = tz; }
      else if (d > 0.4) { const sp = Math.min(d * 3, 9.5) * dt; pg.x += dx / d * sp; pg.z += dz / d * sp; pg.yaw = lerpAngle(pg.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10)); pg.phase += sp * 6; }
      const sup = game.support(pg.x, pg.z, Math.max(pg.y, P.pos.y) + 0.5);
      pg.y += (sup.y - pg.y) * Math.min(1, dt * 12);
      if (pg.y < 0.2) { pg.x = P.pos.x; pg.z = P.pos.z; pg.y = P.pos.y; }
      if (Math.hypot(pg.x - S.PIGLET_HOME.x, pg.z - S.PIGLET_HOME.z) < 5 || Math.hypot(P.pos.x - S.PIGLET_HOME.x, P.pos.z - S.PIGLET_HOME.z) < 4) {
        if (!game.dialog) pigletHome();
      }
    } else if (pg.state === 'home') {
      // il joue dans la boue
      pg.x = S.PIGLET_HOME.x + Math.sin(game.t * 0.6) * 1.2; pg.z = S.PIGLET_HOME.z + 1.6 + Math.cos(game.t * 0.6) * 1.0;
      pg.yaw = game.t * 0.6 + Math.PI / 2; pg.phase += dt * 6; pg.y = S.heightAt(pg.x, pg.z);
    } else {
      pg.yaw = 0.8 + Math.sin(game.t * 0.7) * 0.9;
    }
  }
  function pigletHome() {
    const pg = piglet;
    pg.state = 'home'; pg.follow = null;
    farm().piglet = true; game.persist();
    game.say([
      { who: 'Caramel', text: 'Groin groin ! Ma flaque de boue ! Je suis rentré !' },
      { who: 'Papi Berger', text: 'Caramel ! Le voilà ! Merci, les jeunes : vous avez du flair.' },
    ], () => { reveal('Caramel est rentré !', 'Une Médaille Patoune brille dans l\'enclos des cochons !'); snd.oink(); });
  }

  // --- la boue -------------------------------------------------------------------------
  function stepMud(dt) {
    for (const P of players()) {
      const inMud = P.grounded && !P.kart && Math.hypot(P.pos.x - S.MUD.x, P.pos.z - S.MUD.z) < S.MUD.r + 0.2 && P.pos.y < MUDY + 0.5;
      if (inMud) {
        const landed = !P.fWasGround;
        if (!P.mudT || P.mudT < 11 || landed) {
          if (!P.mudT) { snd.squelch(); if (P === meFarm() && !st.hint.mud) { st.hint.mud = true; game.banner('Tout boueux !', 'Ça sèche, et puis… on s\'ébroue !', 2200); } }
          P.mudT = 14; P.shakeT = 0;
        }
        if (landed) {
          snd.squelch();
          for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2; game.spawnParticle(P.pos.x + Math.cos(a) * 0.5, MUDY + 0.2, P.pos.z + Math.sin(a) * 0.5, Math.cos(a) * 4, 3 + Math.random() * 3, Math.sin(a) * 4, i % 2 ? 0x6a4426 : 0x4a2e14, 0.3, 0.7, 12); }
        }
        if (Math.hypot(P.vel.x, P.vel.z) > 2 && Math.random() < dt * 12) game.spawnParticle(P.pos.x, MUDY + 0.15, P.pos.z, (Math.random() - 0.5) * 2, 1.5 + Math.random(), (Math.random() - 0.5) * 2, 0x5a3a1c, 0.22, 0.5, 10);
      } else if (P.mudT > 0) {
        // la mare lave tout
        if (S.inWater(P.pos.x, P.pos.z) && P.pos.y < 0.6) { P.mudT = 0; P.shakeT = 0; game.burst(P.pos.x, 0.3, P.pos.z, 10, 0x9ae0ff, 3, 0.5); continue; }
        P.mudT -= dt;
        // traces de pattes
        if (P.grounded && Math.hypot(P.vel.x, P.vel.z) > 3 && Math.random() < dt * 4) game.spawnParticle(P.pos.x, P.pos.y + 0.1, P.pos.z, 0, 0.3, 0, 0x5a3a1c, 0.18, 0.6, 2);
        if (P.mudT <= 1.3 && !P.shakeT) {
          // on s'ébroue !
          P.shakeT = 1.3;
          snd.shake();
          game.bubble(P, 'Brrr !');
        }
        if (P.mudT <= 0) P.mudT = 0;
      }
      if (P.shakeT > 0) {
        P.shakeT = Math.max(0, P.shakeT - dt);
        if (Math.random() < dt * 40) {
          const a = Math.random() * Math.PI * 2;
          game.spawnParticle(P.pos.x + Math.cos(a) * 0.5, P.pos.y + 0.6 + Math.random() * 0.6, P.pos.z + Math.sin(a) * 0.5, Math.cos(a) * 5, 2 + Math.random() * 2, Math.sin(a) * 5, Math.random() < 0.5 ? 0x6a4426 : 0x8a6440, 0.2, 0.6, 12);
        }
      }
      P.fWasGround = P.grounded;
    }
  }

  // --- pommes ---------------------------------------------------------------------------
  function stepApples(dt) {
    const PL = players();
    S.APPLE_TREES.forEach((t, ti) => {
      if (game.t - treeBump[ti] < 1.6) return;
      for (const P of PL) {
        const d = Math.hypot(P.pos.x - t.x, P.pos.z - t.z);
        const sp = Math.hypot(P.vel.x, P.vel.z);
        const bump = P.kart ? d < 2.4 && Math.abs(P.kart.speed) > 2 : (d < 2.4 && (P.attackT > 0 || P.dashT > 0)) || (d < 1.35 && sp > 4.5);
        if (!bump || P.pos.y > t.y + 2) continue;
        treeBump[ti] = game.t;
        snd.rustle();
        for (let i = 0; i < 14; i++) game.spawnParticle(t.x + (Math.random() - 0.5) * 3, t.y + t.h + Math.random() * 1.5, t.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, -1, (Math.random() - 0.5) * 2, 0x5cb840, 0.2, 1.2, 3);
        const on = apples.filter(a => a.tree === ti && a.s === 0);
        for (let k = 0; k < Math.min(2, on.length); k++) {
          const a = on[(Math.random() * on.length) | 0];
          if (a.s !== 0) continue;
          a.s = 1; a.vx = (Math.random() - 0.5) * 1.5; a.vy = 0.5; a.vz = (Math.random() - 0.5) * 1.5; a.bounce = 0;
        }
        if (!st.hint.apple && P === meFarm()) { st.hint.apple = true; game.banner('Des pommes !', 'Croquez-les : ça redonne un cœur', 2000); }
        break;
      }
    });
    for (const a of apples) {
      if (a.s === 1) {
        a.vy -= 20 * dt; a.x += a.vx * dt; a.y += a.vy * dt; a.z += a.vz * dt;
        const g = S.heightAt(a.x, a.z) + 0.14;
        if (a.y <= g) {
          a.y = g;
          if (a.bounce < 1 && a.vy < -3) { a.vy = -a.vy * 0.35; a.bounce++; }
          else { a.s = 2; a.t = 30; a.vy = 0; }
        }
      } else if (a.s === 2) {
        a.t -= dt;
        // elle roule un tout petit peu
        if (a.t > 29) { a.x += a.vx * dt * 0.5; a.z += a.vz * dt * 0.5; a.y = S.heightAt(a.x, a.z) + 0.14; }
        // Margot adore les pommes
        if (dist2(a.x, a.z, margot.def.x, margot.def.z) < 3.2 * 3.2) { a.s = 3; a.t = 35; margot.eat = 1.5; snd.crunch(); game.bubble({ pos: new THREE.Vector3(margot.def.x, margot.def.y + 1.4, margot.def.z) }, 'Miam !'); continue; }
        for (const P of PL) {
          if (dist2(P.pos.x, P.pos.z, a.x, a.z) < 1.3 * 1.3 && Math.abs(P.pos.y - a.y) < 1.6) {
            a.s = 3; a.t = 40;
            snd.crunch();
            const max = game.mode === 'defi' ? 2 : 3;
            if (P.hearts < max) { P.hearts++; game.sound('heart'); game.updateHud(); }
            game.bubble(P, 'Miam !');
            break;
          }
        }
        if (a.t <= 0) { a.s = 3; a.t = 20; }
      } else if (a.s === 3) {
        a.t -= dt;
        if (a.t <= 0) { a.s = 0; a.x = a.hx; a.y = a.hy; a.z = a.hz; }
      }
    }
  }

  // --- les ailes du moulin -----------------------------------------------------------------
  function stepParts() {
    const f = farm();
    // en haut du moulin, on remet en place les ailes trouvées
    const B = S.BALCONY;
    if (f.parts.length > f.fixed.length && players().some(P => P.pos.y > B.top - 0.6 && Math.hypot(P.pos.x - B.x, P.pos.z - B.z) < B.r + 0.4)) {
      for (const id of f.parts) if (!f.fixed.includes(id)) f.fixed.push(id);
      game.persist();
      snd.creak();
      game.burst(S.SAIL_HUB.x, S.SAIL_HUB.y, S.SAIL_HUB.z, 26, 0xfff0c0, 4, 0.8);
      if (f.fixed.length >= S.SAIL_PARTS.length) reveal('Le moulin est réparé !', 'Ses ailes tournent… et une médaille brille sur le balcon !');
      else game.banner(`Ailes remises : ${f.fixed.length}/${S.SAIL_PARTS.length}`, 'Il en manque encore : cherchez partout !', 2400);
    }
    for (const p of parts) {
      if (f.parts.includes(p.def.id)) continue;
      for (const P of players()) {
        if (dist2(P.pos.x, P.pos.z, p.def.x, p.def.z) < 1.6 * 1.6 && Math.abs(P.pos.y + 0.8 - p.def.y) < 1.8) {
          f.parts.push(p.def.id); game.persist();
          game.sound('ball');
          game.burst(p.def.x, p.def.y, p.def.z, 18, 0xfff0c0, 3.5, 0.6);
          const n = f.parts.length, N = S.SAIL_PARTS.length;
          game.banner(`Aile du moulin : ${n}/${N}`, n >= N ? 'Toutes trouvées ! Montez-les en haut du moulin.' : 'Rapportez-la en haut du moulin, sur le balcon !', 2600);
          break;
        }
      }
    }
  }

  // --- le tracteur ------------------------------------------------------------------------
  const TP = { MAX: 10.5, REV: 4, ACC: 9, BRAKE: 16, TURN: 1.9, R: 1.35 };
  function enterTractor(P) {
    if (TR.driver >= 0 || P.kart) return;
    TR.driver = P.id; P.kart = TR;
    P.attackT = 0; P.dashT = 0; P.vel.set(0, 0, 0);
    P.pos.set(TR.x, TR.y, TR.z); P.yaw = TR.yaw;
    game.sound('engine');
    if (!farm().tipped) {
      farm().tipped = true;
      const c = game.controlsHelp();
      game.banner('En route, tracteur !', `${c.attack} : klaxon · parler : descendre`, 3600);
    }
  }
  function exitTractor(P) {
    if (!P.kart) return;
    TR.driver = -1; P.kart = null; TR.speed = 0;
    const sx = Math.cos(TR.yaw), sz = -Math.sin(TR.yaw);
    const p = { x: TR.x + sx * 2.1, z: TR.z + sz * 2.1 };
    game.pushOut(p, TR.y);
    P.pos.set(p.x, game.support(p.x, p.z, TR.y + 0.6).y, p.z);
    P.vel.set(0, 4, 0); P.grounded = false; P.jumps = 1;
  }
  function honk() {
    if (game.t - TR.honkT < 0.6) return;
    TR.honkT = game.t;
    game.sound('horn');
    for (const c of game.cats) if (!c.dead && Math.hypot(c.pos.x - TR.x, c.pos.z - TR.z) < 7) c.stun = 1.5;
    for (const h of hens) if (Math.hypot(h.x - TR.x, h.z - TR.z) < 8) { h.run = 1; h.hop = 0.4; }
    for (const s of sheep) if (!s.pen && Math.hypot(s.x - TR.x, s.z - TR.z) < 9) { const dx = s.x - TR.x, dz = s.z - TR.z, d = Math.hypot(dx, dz) || 1; s.scare = 1.2; s.sx = dx / d; s.sz = dz / d; s.hop = 0.4; }
  }
  function driveTractor(P, wx, wz, jumpHeld, pr, dt) {
    const k = TR;
    const frozen = game.dialog || game.freeze > 0;
    if (frozen) { wx = 0; wz = 0; }
    k.bumpT = Math.max(0, k.bumpT - dt);
    if (!frozen && (pr.has('attack') || pr.has('bark'))) honk();
    if (!frozen && pr.has('jump') && k.grounded) { k.vy = 5; k.grounded = false; game.sound('jump'); }
    // conduite comme les karts : on retrouve le joystick (avant / arrière, gauche / droite) d'après la caméra
    // du conducteur (derrière le tracteur), et on tourne le tracteur lui-même : droite = il tourne à droite
    const cy = P === game.player && !game.guest ? game.camYaw : k.yaw + Math.PI;
    const stickX = wx * Math.cos(cy) - wz * Math.sin(cy), stickF = -wx * Math.sin(cy) - wz * Math.cos(cy);
    const fwd = Math.abs(stickF) > 0.15 ? stickF : 0, turn = Math.abs(stickX) > 0.15 ? clamp(stickX, -1, 1) : 0;
    let target = fwd > 0 ? TP.MAX * fwd : fwd < 0 ? (k.speed > 1 ? 0 : TP.REV * fwd) : 0;
    const acc = (target > k.speed && k.speed >= 0) || (target < k.speed && k.speed <= 0 && target < 0) ? TP.ACC : TP.BRAKE;
    k.speed += clamp(target - k.speed, -acc * dt, acc * dt);
    k.steer += (turn - k.steer) * Math.min(1, dt * 6);
    // (à l'arrêt, le volant tourne quand même un peu : on peut se dégager)
    k.yaw -= turn * TP.TURN * clamp(Math.abs(k.speed) / 4, 0.3, 1) * (k.speed < -0.2 ? -1 : 1) * dt;
    // la caméra se range derrière le tracteur
    if (P === game.player && !game.guest && game.t - game.lastCamManual > 0.8) game.camYaw = lerpAngle(game.camYaw, k.yaw + Math.PI, Math.min(1, dt * 4));
    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
    const next = { x: k.x + fx * k.speed * dt, z: k.z + fz * k.speed * dt };
    const h = S.heightAt(next.x, next.z);
    if (h < 0.6 || h > k.y + 0.8) { next.x = k.x; next.z = k.z; k.speed *= 0.2; }
    const nx0 = next.x, nz0 = next.z;
    game.pushOut(next, k.y, TP.R);
    // les animaux s'écartent, Papi aussi a un rayon de sécurité
    for (const s of sheep) { const dx = next.x - s.x, dz = next.z - s.z, d = Math.hypot(dx, dz); if (d < 1.8 && d > 0.01) { next.x = s.x + dx / d * 1.8; next.z = s.z + dz / d * 1.8; } }
    for (const cw of cows) { const dx = next.x - cw.def.x, dz = next.z - cw.def.z, d = Math.hypot(dx, dz); if (d < 2.6 && d > 0.01) { next.x = cw.def.x + dx / d * 2.6; next.z = cw.def.z + dz / d * 2.6; } }
    const corr = Math.hypot(next.x - nx0, next.z - nz0);
    if (corr > 0.02 && Math.abs(k.speed) > 5 && k.bumpT <= 0) { game.sound('bump'); k.bumpT = 0.5; k.speed *= 0.4; }
    else if (corr > 0.02) k.speed *= 0.96;
    k.x = next.x; k.z = next.z;
    if (Math.abs(k.x) > S.ISLAND_R || Math.abs(k.z) > S.ISLAND_R) { k.x = clamp(k.x, -S.ISLAND_R, S.ISLAND_R); k.z = clamp(k.z, -S.ISLAND_R, S.ISLAND_R); }
    const sup = game.support(k.x, k.z, k.y + 0.6);
    if (k.grounded) { if (sup.y < k.y - 0.6) { k.grounded = false; k.vy = 0; } else k.y += (sup.y - k.y) * Math.min(1, dt * 14); }
    if (!k.grounded) { k.vy -= 28 * dt; k.y += k.vy * dt; if (k.y <= sup.y && k.vy <= 0) { if (k.vy < -8) game.burst(k.x, sup.y + 0.1, k.z, 10, 0xf0e0c0, 3, 0.4); k.y = sup.y; k.vy = 0; k.grounded = true; } }
    // fumée du pot d'échappement et poussière
    if (Math.random() < dt * (3 + Math.abs(k.speed))) game.spawnParticle(k.x + Math.cos(k.yaw) * -0.32 + fx * 1.1, k.y + 2.5, k.z - Math.sin(k.yaw) * -0.32 + fz * 1.1, -fx * 0.5, 1.2, -fz * 0.5, 0xd8d8d8, 0.25, 0.9, -1);
    if (Math.abs(k.speed) > 5 && Math.random() < dt * 10) game.spawnParticle(k.x - fx * 1.2, k.y + 0.2, k.z - fz * 1.2, (Math.random() - 0.5), 0.8, (Math.random() - 0.5), 0xd8ccb4, 0.3, 0.5, 2);
    P.pos.set(k.x, k.y, k.z);
    P.vel.set(fx * k.speed, k.vy, fz * k.speed);
    P.yaw = k.yaw; P.grounded = k.grounded; P.gliding = false; P.attackT = 0; P.dashT = 0;
    if (k.grounded && k.y > 0.4 && game.t - P.lastSafeT > 0.4) { P.lastSafe.set(k.x, k.y, k.z); P.lastSafeT = game.t; }
  }

  // --- conversations ----------------------------------------------------------------------
  const catsLeft = () => S.cats.filter(c => c.group === 'clearing' && !save().cats.includes(c.id)).length;
  function hints() {
    const f = farm(), s = save(), out = [];
    if (!s.medals.includes('m_sheep') && f.pen.length < S.SHEEP.length) out.push(`Mes moutons d'abord : ${f.pen.length} sur ${S.SHEEP.length} sont à l'enclos. Passez derrière eux pour les pousser vers la porte, au nord !`);
    const lost = sheep.filter(o => o.state === 'lost');
    if (lost.length) out.push(lost.length > 1 ? 'Et deux agneaux se sont perdus très loin : un près du belvédère, tout au nord, et un sur la côte, tout à l\'ouest.' : `Il reste un agneau perdu ${lost[0].z < 0 ? 'près du belvédère, tout au nord' : 'sur la côte, tout à l\'ouest'}.`);
    if (!s.medals.includes('m_eggs') && f.eggs < S.EGGS_NEEDED) out.push('Les poules ont gardé leurs œufs : attrapez-les, puis posez les œufs dans le panier. Trois poules se sont sauvées : une au verger, une près des tournesols, une au pied de la colline du moulin.');
    if (!s.medals.includes('m_piglet') && piglet.state !== 'home') out.push(piglet.state === 'follow' ? 'Caramel vous suit ! Ramenez-le à l\'enclos des cochons, près de la mare.' : 'Caramel, mon cochonnet, s\'est perdu dans le champ de tournesols, à l\'ouest.');
    if (!s.medals.includes('m_cats') && catsLeft() > 0) out.push(`${catsLeft()} chats font les fous dans mon grenier à foin. Montez par les bottes de foin et faites-leur peur : un gros « Ouaf ! » suffit !`);
    if (!s.medals.includes('m_mill') && f.parts.length > f.fixed.length) out.push('Vous avez trouvé des ailes de mon moulin ! Montez l\'escalier jusqu\'au balcon : on les remettra en place.');
    if (!s.medals.includes('m_mill') && f.parts.length < S.SAIL_PARTS.length) {
      const left = S.SAIL_PARTS.filter(p => !f.parts.includes(p.id));
      out.push(`Le vent a emporté ${left.length > 1 ? left.length + ' ailes' : 'une aile'} de mon moulin. Regardez ${left[0].where}.`);
    }
    return out;
  }
  function talkPapi(P) {
    const s = save(), f = farm();
    if (!f.metPapi) {
      f.metPapi = true; game.persist();
      game.say([
        { who: 'Papi Berger', text: 'Ouaf ! Bonjour les jeunes ! Je suis Papi Berger, le vieux chien de berger de cette ferme.' },
        { who: 'Papi Berger', text: 'Les chats de la Capitaine Moustache sont venus faire des farces : ils ont ouvert l\'enclos, et mes moutons se sont éparpillés dans le pré !' },
        { who: 'Matcha', text: 'Des moutons ? On va les ramener, Papi !' },
        { who: 'Papi Berger', text: 'Les moutons s\'écartent quand on s\'approche. Passez derrière eux et poussez-les doucement vers la porte de l\'enclos, au nord.' },
        { who: 'Papi Berger', text: 'Un gros « Ouaf ! » les fait courir plus loin… mais attention à ne pas les disperser !' },
        { who: 'Papi Berger', text: 'Et si le cœur vous en dit, mon tracteur rouge est garé dans la cour. Je vous le prête !' },
        { who: 'Ainu', text: 'Ouaf ! Un vrai tracteur !' },
      ], () => { game.banner('5 missions à la ferme', 'Moutons, œufs, Caramel, grenier, moulin', 2800); game.updateHud(); });
      return;
    }
    if (s.medals.length >= 5) { game.say([{ who: 'Papi Berger', text: 'Ma ferme n\'a jamais été aussi belle ! Revenez quand vous voulez, et n\'oubliez pas les os dorés.' }]); return; }
    const h = hints();
    game.say([{ who: 'Papi Berger', text: `Vous avez ${s.medals.length} médaille${s.medals.length > 1 ? 's' : ''} sur 5. Merci, les jeunes !` }, ...h.slice(0, 2).map(t => ({ who: 'Papi Berger', text: t }))]);
    void P;
  }
  function talkMargot() {
    const f = farm();
    margot.moo = game.t; snd.moo();
    if (!f.metMargot) {
      f.metMargot = true; game.persist();
      game.say([
        { who: 'Margot la vache', text: 'Meuuuh ! Bonjour, les toutous ! Moi, c\'est Margot.' },
        { who: 'Margot la vache', text: 'Les poules ont gardé leurs œufs dans leur cour. Attrapez-les : elles vous en donneront un chacune ! Il faut les poser dans le panier.' },
        { who: 'Margot la vache', text: 'Et moi, j\'adore les pommes… Si vous bousculez un pommier du verger, il en tombe. Croquez-en, ou lancez-les-moi !' },
        { who: 'Biscotte', text: 'Une vache qui parle ! Trop bien !' },
      ]);
      return;
    }
    const lines = [];
    if (piglet.state === 'lost') lines.push({ who: 'Margot la vache', text: 'Caramel, le petit cochon, est parti jouer dans les tournesols… Ils sont si grands qu\'il ne retrouve plus son chemin.' });
    else if (farm().eggs < S.EGGS_NEEDED) lines.push({ who: 'Margot la vache', text: `Il manque encore ${S.EGGS_NEEDED - farm().eggs} œuf${S.EGGS_NEEDED - farm().eggs > 1 ? 's' : ''} dans le panier. Les poules courent vite, mais vous êtes plus rapides !` });
    lines.push({ who: 'Margot la vache', text: 'Meuh ! Et si vous voyez un pommier… pensez à moi !' });
    game.say(lines);
  }
  function talkPiglet(P) {
    piglet.happy = 1; snd.oink();
    game.say([
      { who: 'Caramel', text: 'Groin… Je suis perdu… Les tournesols sont trop grands, je ne vois plus ma maison…' },
      { who: 'Ainu', text: 'Viens avec nous, Caramel ! On te ramène chez toi.' },
      { who: 'Caramel', text: 'Groin groin ! Je vous suis !' },
    ], () => { piglet.state = 'follow'; piglet.follow = P; game.updateHud(); });
  }

  // =============================================================================
  // Interface avec le moteur
  // =============================================================================
  const logic = {
    moving, chars, life,
    farm: { sheep, hens, piglet, tractor: TR, apples, parts, state: farm },   // (pour les tests)
    playerStep(P, wx, wz, jumpHeld, pr, dt) {
      if (!P.kart) return false;
      P.invuln = Math.max(0, P.invuln - dt);
      P.cheerT = Math.max(0, P.cheerT - dt);
      P.flipT = 0;
      if (pr.has('talk') && !game.dialog && game.freeze <= 0) { pr.delete('talk'); exitTractor(P); return true; }
      driveTractor(P, wx, wz, jumpHeld, pr, dt);
      return true;
    },
    nearFor(Q) {
      if (!Q.kart) return undefined;
      return { kind: 'lv', act: 'exit', label: 'DESCENDRE', x: Q.pos.x, z: Q.pos.z, y: Q.pos.y };
    },
    extraCandidates(Q) {
      const out = Q && !Q.kart ? life.candidates(Q) : [];
      out.push(
        { kind: 'lv', act: 'papi', label: 'PARLER', x: S.npcs.papi.x, z: S.npcs.papi.z + 0.6, y: S.npcs.papi.y },
        { kind: 'lv', act: 'margot', label: 'PARLER', x: margot.def.x, z: margot.def.z, y: margot.def.y });
      for (const c of cows) if (c !== margot) out.push({ kind: 'lv', act: 'cow', label: 'CARESSER', i: cows.indexOf(c), x: c.def.x, z: c.def.z, y: c.def.y });
      if (TR.driver < 0 && !Q.kart) out.push({ kind: 'lv', act: 'tractor', label: 'MONTER', x: TR.x, z: TR.z, y: TR.y });
      if (piglet.state === 'lost') out.push({ kind: 'lv', act: 'piglet', label: 'PARLER', x: piglet.x, z: piglet.z, y: piglet.y });
      return out;
    },
    interact(n, P) {
      if (n.life) { life.interact(n, P); return; }
      if (n.act === 'papi') talkPapi(P);
      else if (n.act === 'margot') talkMargot();
      else if (n.act === 'cow') { const c = cows[n.i]; c.moo = game.t; snd.moo(); game.bubble({ pos: new THREE.Vector3(c.def.x, c.def.y + 1.4, c.def.z) }, 'Meuh !'); P.cheerT = 0.6; }
      else if (n.act === 'tractor') enterTractor(P);
      else if (n.act === 'exit') exitTractor(P);
      else if (n.act === 'piglet') talkPiglet(P);
    },
    step(dt) {
      const t = game.t, PL = players();
      // aboiements (le moteur gère les chats ; ici : moutons, poules, cochonnet)
      for (const P of PL) {
        const b = P.barkT || 0, was = st.lastBark.get(P) || 0;
        if (b > was + 0.3) onBark(P);
        st.lastBark.set(P, b);
      }
      // chats du grenier : un « Ouaf ! » les fait déguerpir pour de bon
      for (const c of game.cats) {
        if (c.dead || c.def.group !== 'clearing' || !(c.flee > 0)) continue;
        game.defeatCat(c);
      }
      // drapeaux
      for (const P of PL) for (const c of S.CHECKPOINTS) if (!farm().flags.includes(c.id) && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 3.2 && Math.abs(P.pos.y - c.y) < 3) raiseFlag(c, P);
      if (save().intro) {
        stepSheep(dt);
        stepHens(dt);
        stepPiglet(dt);
        stepApples(dt);
        stepParts();
      }
      stepMud(dt);
      life.step(dt);
      // tracteur sans chauffeur : il s'arrête doucement
      if (TR.driver >= 0 && !game.party.has(TR.driver)) TR.driver = -1;
      if (TR.driver < 0 && Math.abs(TR.speed) > 0.01) { TR.speed -= Math.sign(TR.speed) * Math.min(Math.abs(TR.speed), 12 * dt); TR.x += Math.sin(TR.yaw) * TR.speed * dt; TR.z += Math.cos(TR.yaw) * TR.speed * dt; TR.y = game.support(TR.x, TR.z, TR.y + 0.5).y; }
      // boutons tactiles en tracteur
      const me = game.me, onT = !!(me && me.kart);
      if (onT !== st.btnT) {
        st.btnT = onT;
        const lab = (b, tx) => { const el = game.dom.root.querySelector(`.adv-btn.${b} span:last-child`); if (el) el.textContent = tx; };
        lab('attack', onT ? 'Klaxon' : 'Attaque'); lab('jump', onT ? 'Hop' : 'Saut');
      }
      // le moulin se remet à tourner
      st.millK += ((farm().fixed.length >= S.SAIL_PARTS.length ? 1 : 0) - st.millK) * Math.min(1, dt * 0.5);
      if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
        updateChips();
        // la quête suit ce qui se passe (moutons rentrés, chats partis…)
        const qt = logic.questText();
        if (qt !== st.quest) { st.quest = qt; game.updateHud(); }
      }
    },
    reveal() {
      const f = farm(), s = save();
      return {
        m_sheep: f.pen.length >= S.SHEEP.length,
        m_eggs: f.eggs >= S.EGGS_NEEDED,
        m_piglet: !!f.piglet,
        m_cats: S.cats.filter(c => c.group === 'clearing').every(c => s.cats.includes(c.id)),
        m_mill: f.fixed.length >= S.SAIL_PARTS.length,
      };
    },
    applySave() {
      const f = farm();
      for (const s of sheep) if (!s.pen && f.pen.includes(s.def.id)) s.pen = true;
      if (f.piglet && piglet.state !== 'home') { piglet.state = 'home'; piglet.follow = null; }
      updateChips();
    },
    /** Après un K.O. : on repart du drapeau levé le plus proche. */
    respawn(P) {
      if (P.kart) exitTractor(P);
      const f = farm();
      let best = null, bd = Infinity;
      for (const c of S.CHECKPOINTS) {
        if (!f.flags.includes(c.id)) continue;
        const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
        if (d < bd) { bd = d; best = c; }
      }
      if (!best || game.mode !== 'defi' && P.checkpoint && Math.hypot(P.checkpoint.x - P.pos.x, P.checkpoint.z - P.pos.z) < bd) return null;
      return { x: best.x + 1.5, y: best.y + 0.3, z: best.z + 1.5, yaw: Math.PI };
    },
    guideTarget(me) {
      const f = farm(), s = save();
      if (piglet.state === 'follow') return S.PIGLET_HOME;
      if (sheep.some(o => o.state === 'follow')) return { x: S.GATE.x, y: S.heightAt(S.GATE.x, S.GATE_Z), z: S.GATE_Z + 2 };
      if (me.eggs > 0) return { x: S.BASKET.x, y: basket.position.y, z: S.BASKET.z };
      if (game.medals.some(m => m.mesh.visible)) return null;
      if (!f.metPapi) return S.npcs.papi;
      const free = sheep.filter(o => !o.pen && !o.lamb);
      if (free.length && !s.medals.includes('m_sheep')) {
        // se placer derrière le mouton le plus proche (du côté opposé à la porte)
        let b = null, bd = Infinity;
        for (const o of free) { const d = Math.hypot(o.x - me.pos.x, o.z - me.pos.z); if (d < bd) { bd = d; b = o; } }
        const dx = b.x - S.GATE.x, dz = b.z - (S.GATE_Z - 2), d = Math.hypot(dx, dz) || 1;
        return { x: b.x + dx / d * 3.5, y: b.y, z: b.z + dz / d * 3.5 };
      }
      const lost = sheep.find(o => o.state === 'lost');
      if (lost) return lost;
      const h = hens.find(o => o.egg);
      if (h && f.eggs < S.EGGS_NEEDED) return h;
      if (piglet.state === 'lost') return piglet;
      if (f.parts.length > f.fixed.length) return S.MILL_STEPS[0];
      const p = parts.find(o => !f.parts.includes(o.def.id));
      if (p) return p.def;
      if (catsLeft() > 0) return S.LOFT_BALES[0];
      return null;
    },
    questText() {
      const s = save(), f = farm(), me = game.me;
      if (!s.intro) return 'Parle à Mamie Labrador';
      const lq = life.questText(); if (lq) return lq;
      if (!f.metPapi) return 'Va voir Papi Berger devant sa maison';
      if (piglet.state === 'follow') return 'Ramène Caramel à l\'enclos des cochons';
      if (sheep.some(o => o.state === 'follow')) return 'Ramène l\'agneau à l\'enclos des moutons';
      if (me && me.eggs > 0) return `Pose les œufs dans le panier (${f.eggs + me.eggs}/${S.EGGS_NEEDED})`;
      if (s.medals.length >= 5) return 'La ferme est sauvée, bravo !';
      const near = (o, r) => me && Math.hypot(me.pos.x - o.x, me.pos.z - o.z) < r;
      if (f.pen.length < S.SHEEP.length && (near(S.PEN, 26) || near(S.SHEEP[0], 18))) return `Moutons : ${f.pen.length}/${S.SHEEP.length} · pousse-les dans l'enclos`;
      if (f.eggs < S.EGGS_NEEDED && near(S.HENS_YARD, 14)) return `Œufs : ${f.eggs}/${S.EGGS_NEEDED} · attrape les poules`;
      if (catsLeft() > 0 && near(S.LOFT, 12)) return `Chasse les chats du grenier (${catsLeft()})`;
      if (f.parts.length > f.fixed.length) return `Monte les ailes en haut du moulin (${f.parts.length}/${S.SAIL_PARTS.length})`;
      if (f.fixed.length < S.SAIL_PARTS.length && near(S.MILL, 14)) return `Ailes du moulin : ${f.parts.length}/${S.SAIL_PARTS.length}`;
      return `Aide Papi Berger · Médailles ${s.medals.length}/5`;
    },
    minimapMarks() {
      const f = farm(), out = [];
      for (const s of sheep) if (!s.pen) out.push([s.x, s.z, '#ffffff', 2.2]);
      if (piglet.state !== 'home') out.push([piglet.x, piglet.z, '#ff9ab8', 3]);
      for (const p of parts) if (!f.parts.includes(p.def.id)) out.push([p.def.x, p.def.z, '#ffd23a', 2.6]);
      if (!f.metPapi) out.push([S.npcs.papi.x, S.npcs.papi.z, '#8ad0ff', 3.2]);
      out.push([TR.x, TR.z, '#e0302a', 2.6]);
      for (const m of life.marks()) out.push(m);
      return out;
    },
    snapshot() {
      const r = (x) => Math.round(x * 100) / 100;
      return {
        sh: sheep.map(s => [r(s.x), r(s.z), r(s.yaw), s.pen ? 1 : 0, r(s.speed), s.hop > 0 ? 1 : 0, s.state === 'lost' ? 0 : 1]),
        hn: hens.map(h => [r(h.x), r(h.z), r(h.yaw), h.egg ? 1 : 0, h.moving ? 1 : 0, h.hop > 0 ? 1 : 0]),
        tr: [r(TR.x), r(TR.y), r(TR.z), r(TR.yaw), TR.driver, r(TR.speed)],
        pg: [piglet.state, r(piglet.x), r(piglet.y), r(piglet.z), r(piglet.yaw)],
        ap: apples.map(a => (a.s === 0 ? 0 : [a.s, r(a.x), r(a.y), r(a.z)])),
        pl: players().map(P => [P.id, P.eggs || 0, r(P.mudT || 0), r(P.shakeT || 0)]),
        mk: [margot.eat > 0 ? 1 : 0],
        lf: life.snapshot(),
      };
    },
    apply(x) {
      st.guestLerp = true;
      x.sh.forEach((d, i) => { const s = sheep[i]; if (!s) return; s.tx = d[0]; s.tz = d[1]; s.tyaw = d[2]; if (d[3] && !s.pen) { s.pen = true; } s.state = d[3] ? 'pen' : s.lamb && !d[6] ? 'lost' : s.lamb ? 'follow' : 'free'; s.speed = d[4]; if (d[5]) s.hop = 0.3; if (Math.hypot(s.x - s.tx, s.z - s.tz) > 6) { s.x = s.tx; s.z = s.tz; } });
      x.hn.forEach((d, i) => { const h = hens[i]; if (!h) return; h.tx = d[0]; h.tz = d[1]; h.tyaw = d[2]; h.egg = !!d[3]; h.moving = !!d[4]; if (d[5]) h.hop = 0.3; });
      const [tx, ty, tz, tyaw, drv, tsp] = x.tr;
      TR.x = tx; TR.y = ty; TR.z = tz; TR.yaw = tyaw; TR.driver = drv; TR.speed = tsp;
      for (const P of players()) if (P.kart === TR && P.id !== drv) P.kart = null;
      if (drv >= 0 && game.party.has(drv)) game.party.get(drv).kart = TR;
      const [ps, px, py, pz, pyaw] = x.pg;
      piglet.state = ps; piglet.tx = px; piglet.ty = py; piglet.tz = pz; piglet.tyaw = pyaw;
      if (Math.hypot(piglet.x - px, piglet.z - pz) > 6) { piglet.x = px; piglet.y = py; piglet.z = pz; }
      x.ap.forEach((d, i) => { const a = apples[i]; if (!a) return; if (!d) { a.s = 0; a.x = a.hx; a.y = a.hy; a.z = a.hz; } else { a.s = d[0]; a.x = d[1]; a.y = d[2]; a.z = d[3]; } });
      for (const [id, eg, md, sk] of x.pl) { const P = game.party.get(id); if (P) { P.eggs = eg; if (md > 0 && !(P.mudT > 0)) snd.squelch(); P.mudT = md; P.shakeT = sk; } }
      if (x.mk && x.mk[0]) margot.eat = 0.5;
      life.apply(x.lf);
    },
    talkMamie(first) {
      const s = save();
      if (first || !s.intro) {
        game.say([
          { who: 'Mamie Labrador', text: 'Bienvenue à la ferme de Papi Berger ! C\'est un vieil ami : il gardait déjà ses moutons quand j\'étais toute jeune.' },
          { who: 'Biscotte', text: 'Ouaf ! Il y a des moutons, des poules et même des cochons !' },
          { who: 'Mamie Labrador', text: 'Mais la Capitaine Moustache et ses chats sont passés par ici… pour faire des farces, cette fois.' },
          { who: 'Mamie Labrador', text: 'Allez voir Papi Berger devant sa maison, au bout du chemin : il a besoin de vous pour cinq missions.' },
          { who: 'Matcha', text: 'Une ferme ! J\'espère qu\'il y a une flaque de boue…' },
          { who: 'Ainu', text: 'Ouaf ! Au travail, Matcha !' },
        ], () => { s.intro = true; game.persist(); game.banner(S.NAME, 'Va voir Papi Berger devant sa maison !', 2800); game.updateHud(); updateChips(); });
        return;
      }
      if (s.medals.length >= 5) { game.say([{ who: 'Mamie Labrador', text: 'Toute la ferme est en fête grâce à vous ! Il reste peut-être quelques os dorés dans les prés…' }]); return; }
      const h = hints();
      game.say([{ who: 'Mamie Labrador', text: `Vous avez ${s.medals.length} médaille${s.medals.length > 1 ? 's' : ''} sur 5. Papi Berger compte sur vous !` }, ...h.slice(0, 1).map(t => ({ who: 'Mamie Labrador', text: t.replace(/^Mes moutons d'abord : /, 'Les moutons : ').replace(/mon cochonnet/, 'son cochonnet').replace(/mon grenier/, 'son grenier').replace(/mon moulin/, 'son moulin') }))]);
    },
    endLines() {
      const kid = window.kidName ? window.kidName() : '';
      return [
        { who: 'Papi Berger', text: 'Les moutons à l\'enclos, les œufs au panier, Caramel dans sa boue et mon moulin qui tourne ! Merci, les jeunes !' },
        { who: 'Capitaine Moustache', text: 'Miaou… C\'est nous qui avions ouvert l\'enclos et emporté les ailes du moulin. C\'était pour rire…' },
        { who: 'Capitaine Moustache', text: 'Mais vous avez tout réparé. Alors… est-ce qu\'on peut aider, nous aussi ?' },
        { who: 'Papi Berger', text: 'Bien sûr ! À la ferme, il y a toujours du travail… et du lait tout frais pour les chats gentils.' },
        { who: 'Mamie Labrador', text: 'Tu vois, Capitaine : avec des amis, même le travail devient un jeu.' },
        { who: 'Biscotte', text: 'Et maintenant, tout le monde saute dans la flaque de boue !' },
        { who: 'Matcha', text: 'Ah non, pas moi ! … Bon, d\'accord, juste une fois !' },
        { who: 'Ainu', text: 'Ouaf ! Merci Papi Berger !' },
        ...(kid ? [{ who: '', text: `Et tout ça, grâce à ${kid}.` }] : []),
      ];
    },
    render(dt, t) {
      life.render(dt, t);
      const guest = game.guest;
      const k = guest ? 1 - Math.exp(-dt * 10) : 1;
      blobN = 0;
      // moutons
      sheep.forEach((s, i) => {
        if (guest) { s.x += (s.tx - s.x) * k; s.z += (s.tz - s.z) * k; s.y = S.heightAt(s.x, s.z); if (s.tyaw !== undefined) s.yaw = lerpAngle(s.yaw, s.tyaw, k); s.phase += dt * (1 + s.speed * 3.2); s.hop = Math.max(0, s.hop - dt); }
        else s.hop = Math.max(0, s.hop - dt);
        const run = Math.min(1, s.speed / 3);
        const hop = s.hop > 0 ? Math.sin((0.45 - s.hop) / 0.45 * Math.PI) * 0.5 : 0;
        const bob = Math.abs(Math.sin(s.phase * 2)) * 0.08 * run + hop;
        const L0 = s.lamb ? 0.62 : 1, breathe = (1 + Math.sin(t * 2 + i) * 0.015) * L0;
        m4.compose(v3.set(s.x, s.y + bob, s.z), q.setFromEuler(e.set(Math.sin(s.phase * 2) * 0.05 * run, s.yaw, 0)), sv.set(breathe, breathe, breathe));
        woolI.setMatrixAt(i, m4);
        // la tête broute (en bas) quand le mouton est calme
        const grazing = s.speed < 0.25 && Math.sin(t * 0.4 + i * 1.7) > -0.2;
        s.graze += ((grazing ? 1 : 0) - s.graze) * Math.min(1, dt * 3);
        const hx = 0, hy = (0.98 - s.graze * 0.35) * L0, hz = (0.66 + s.graze * 0.08) * L0;
        const cy = Math.cos(s.yaw), sy = Math.sin(s.yaw);
        m4.compose(v3.set(s.x + hx * cy + hz * sy, s.y + bob + hy, s.z - hx * sy + hz * cy), q.setFromEuler(e.set(0.2 + s.graze * 0.9 + Math.sin(t * 6 + i) * 0.05 * s.graze, s.yaw + Math.sin(t * 0.7 + i) * 0.3 * (1 - s.graze), 0)), sv.setScalar(s.lamb ? 0.8 : 1));
        headI.setMatrixAt(i, m4);
        [[-0.2, 0.32], [0.2, 0.32], [-0.2, -0.3], [0.2, -0.3]].forEach(([lx, lz], j) => {
          const sw = Math.sin(s.phase * 2 + (j === 0 || j === 3 ? 0 : Math.PI)) * 0.7 * run;
          m4.compose(v3.set(s.x + (lx * cy + lz * sy) * L0, s.y + bob + 0.52 * L0, s.z + (-lx * sy + lz * cy) * L0), q.setFromEuler(e.set(sw, s.yaw, 0, 'YXZ')), sv.setScalar(L0));
          legI.setMatrixAt(i * 4 + j, m4);
        });
        blob(s.x, s.y, s.z, 0.75 * L0);
        if (s.mark) { s.mark.visible = s.state === 'lost' && save().intro; s.mark.position.set(s.x, s.y + 1.5 + Math.sin(t * 4 + i) * 0.08, s.z); }
      });
      woolI.instanceMatrix.needsUpdate = headI.instanceMatrix.needsUpdate = legI.instanceMatrix.needsUpdate = true;
      // poules
      hens.forEach((h, i) => {
        if (guest) { h.x += (h.tx - h.x) * k; h.z += (h.tz - h.z) * k; h.y = S.heightAt(h.x, h.z); if (h.tyaw !== undefined) h.yaw = lerpAngle(h.yaw, h.tyaw, k); h.hop = Math.max(0, h.hop - dt); }
        const hop = h.hop > 0 ? Math.sin(h.hop / 0.6 * Math.PI) * 0.6 : h.moving ? Math.abs(Math.sin(t * 16 + i)) * 0.08 : 0;
        const peck = !h.moving && Math.sin(h.peck * 3 + i) > 0.6 ? 0.55 : 0;
        m4.compose(v3.set(h.x, h.y + hop, h.z), q.setFromEuler(e.set(peck, h.yaw, h.moving ? Math.sin(t * 16 + i) * 0.1 : 0, 'YXZ')), sv.setScalar(1.1));
        henI.setMatrixAt(i, m4);
        blob(h.x, h.y, h.z, 0.3);
      });
      henI.instanceMatrix.needsUpdate = true;
      // œufs : dans le panier, et sur le dos des chiens qui en portent
      let ne = 0;
      const f = farm();
      const by = basket.position.y;
      for (let i = 0; i < Math.min(S.EGGS_NEEDED, f.eggs) && ne < EGG_MAX; i++) {
        const a = i * 2.1, r = i === 0 ? 0 : 0.22;
        m4.compose(v3.set(S.BASKET.x + Math.cos(a) * r, by + 0.42 + (i > 3 ? 0.1 : 0), S.BASKET.z + Math.sin(a) * r), q.setFromEuler(e.set(0.3 * Math.sin(a), 0, 0.3 * Math.cos(a))), sv.set(1, 1, 1));
        eggI.setMatrixAt(ne++, m4);
      }
      for (const P of players()) {
        if (!P.eggs || !P.mesh) continue;
        const top = P.mesh.userData.ainu ? 2.3 : (P.mesh.userData.height || 1.1) + 0.4;
        for (let i = 0; i < P.eggs && ne < EGG_MAX; i++) {
          const a = t * 2 + i * (Math.PI * 2 / P.eggs);
          m4.compose(v3.set(P.pos.x + Math.cos(a) * 0.35, P.pos.y + top + Math.sin(t * 4 + i) * 0.06, P.pos.z + Math.sin(a) * 0.35), q.setFromEuler(e.set(0, a, 0.2)), sv.setScalar(1.15));
          eggI.setMatrixAt(ne++, m4);
        }
      }
      eggI.count = ne;
      eggI.instanceMatrix.needsUpdate = true;
      // canards : une maman, deux amies et quatre canetons qui la suivent
      for (let i = 0; i < DUCKS; i++) {
        const mom = i === 0 || i >= 3, R = i === 1 ? 3.2 : i === 2 ? 5.2 : 4.4;
        const w = i === 1 ? -0.22 : i === 2 ? 0.16 : 0.2;
        const a = t * w + (i >= 3 ? -(i - 2) * 0.22 : i * 2.1);
        const x = S.POND.x + Math.cos(a) * R, z = S.POND.z + Math.sin(a) * R;
        const yaw = Math.atan2(-Math.sin(a) * Math.sign(w), Math.cos(a) * Math.sign(w));
        const s = i >= 3 ? 0.55 : 1;
        m4.compose(v3.set(x, S.WATER_Y - 0.02 + Math.sin(t * 2 + i) * 0.03, z), q.setFromEuler(e.set(0, yaw, Math.sin(t * 1.5 + i) * 0.06)), sv.setScalar(s));
        duckI.setMatrixAt(i, m4);
        void mom;
      }
      duckI.instanceMatrix.needsUpdate = true;
      if (Math.random() < dt * 0.15 && Math.hypot(game.camera.position.x - S.POND.x, game.camera.position.z - S.POND.z) < 30) snd.quack();
      // pommes
      apples.forEach((a, i) => {
        const vis = a.s !== 3;
        m4.compose(v3.set(a.x, a.y, a.z), q.setFromEuler(e.set(a.s === 1 ? t * 8 : 0, i, 0)), vis ? sv.set(1, 1, 1) : ZERO);
        appleI.setMatrixAt(i, m4);
      });
      appleI.instanceMatrix.needsUpdate = true;
      // tournesols qui se balancent (ordinateur)
      if (!lite && Math.floor(t * 20) !== Math.floor((t - dt) * 20)) flowers.place(t);
      blobs.count = blobN;
      blobs.instanceMatrix.needsUpdate = true;
      // les ailes perdues tournent sur elles-mêmes
      for (const p of parts) {
        const got = f.parts.includes(p.def.id);
        p.m.visible = !got; p.glow.visible = !got;
        if (!got) { p.m.rotation.y = t * 1.6; p.m.position.y = p.def.y + Math.sin(t * 2.5) * 0.15; }
      }
      // le moulin : une aile au départ, puis une de plus par aile rapportée ; tout tourne une fois réparé
      const mu = mill.userData;
      mu.blades.forEach((b, i) => { b.visible = i <= f.fixed.length; });
      st.millSpin += dt * (0.08 + st.millK * 1.1);
      mu.sails.rotation.z = st.millSpin;
      // drapeaux
      flags.forEach((fl, i) => {
        const up = f.flags.includes(fl.def.id) ? 1 : 0;
        fl.raise += (up - fl.raise) * Math.min(1, dt * 3);
        fl.u.cloth.position.y = 1.0 + fl.raise * 2.25;
        const arr = fl.u.cloth.geometry.attributes.position.array, base = fl.u.base;
        for (let j = 0; j < arr.length; j += 3) arr[j + 2] = Math.sin(base[j] * 3 - t * 6 + i) * 0.12 * base[j];
        fl.u.cloth.geometry.attributes.position.needsUpdate = true;
        const since = t - fl.raisedAt;
        fl.u.halo.material.opacity = since < 1.5 ? (1 - since / 1.5) * 0.8 : 0;
        fl.u.halo.scale.setScalar(since < 1.5 ? 1 + since * 2 : 1);
      });
      // Papi Berger regarde les chiens, sa queue bat la mesure
      {
        const me = game.me, pu = papi.userData;
        const want = Math.atan2(me.pos.x - papi.position.x, me.pos.z - papi.position.z) - papi.rotation.y;
        const rel = clamp(angDiff(want, 0), -1, 1), close = Math.hypot(me.pos.x - papi.position.x, me.pos.z - papi.position.z) < 12;
        pu.head.rotation.y += ((close ? rel : 0) - pu.head.rotation.y) * Math.min(1, dt * 3);
        const talking = game.dialog && game.dom.dname.textContent === 'Papi Berger';
        pu.head.rotation.x = talking ? Math.sin(t * 9) * 0.06 : Math.sin(t * 1.1) * 0.04;
        pu.head.rotation.z = Math.sin(t * 0.8) * 0.06;
        pu.tail.rotation.y = Math.sin(t * (close ? 9 : 4)) * 0.45;
      }
      // vaches : elles broutent, la queue chasse les mouches
      for (const c of cows) {
        c.eat = Math.max(0, (c.eat || 0) - dt);
        const u = c.u, talking = c === margot && game.dialog && game.dom.dname.textContent === 'Margot la vache';
        const me = game.me, close = Math.hypot(me.pos.x - c.def.x, me.pos.z - c.def.z) < 7;
        const graze = !close && !talking && Math.sin(t * 0.3 + c.ph) > -0.3;
        u.head.rotation.x += ((graze ? 0.75 : talking ? Math.sin(t * 7) * 0.08 : -0.05) - u.head.rotation.x) * Math.min(1, dt * 2);
        const want = close ? clamp(angDiff(Math.atan2(me.pos.x - c.def.x, me.pos.z - c.def.z), c.m.rotation.y), -0.8, 0.8) : 0;
        u.head.rotation.y += (want - u.head.rotation.y) * Math.min(1, dt * 2.5);
        if (c.eat > 0) u.head.rotation.x = 0.2 + Math.sin(t * 14) * 0.1;
        u.tail.rotation.z = Math.sin(t * 2.2 + c.ph) * 0.35;
        if (t - c.moo < 0.8) u.head.rotation.x = -0.3;
      }
      if (Math.random() < dt * 0.05 && Math.hypot(game.camera.position.x - margot.def.x, game.camera.position.z - margot.def.z) < 28) { snd.moo(); margot.moo = t; }
      // cochons dans la boue
      pigs.forEach((p, i) => {
        p.u.tail.rotation.z = Math.sin(t * 8 + i) * 0.4;
        p.u.head.rotation.x = Math.sin(t * 1.4 + p.ph) * 0.15;
        if (i === 0) p.m.rotation.z = Math.sin(t * 0.7) * 0.25;
      });
      if (Math.random() < dt * 0.08 && Math.hypot(game.camera.position.x - S.PIGPEN.x, game.camera.position.z - S.PIGPEN.z) < 22) snd.oink();
      // Caramel
      {
        const pg = piglet, pm = pg.mesh, pu = pm.userData;
        if (guest && pg.tx !== undefined) { pg.x += (pg.tx - pg.x) * k; pg.z += (pg.tz - pg.z) * k; pg.y += (pg.ty - pg.y) * k; pg.yaw = lerpAngle(pg.yaw, pg.tyaw, k); pg.phase += dt * 8; }
        pm.position.set(pg.x, pg.y + (pg.happy > 0 ? Math.abs(Math.sin(pg.happy * 10)) * 0.3 : pg.state === 'home' ? Math.abs(Math.sin(t * 5)) * 0.05 : 0), pg.z);
        pm.rotation.y = pg.yaw;
        const walk = pg.state !== 'lost';
        pu.legs.forEach((l, i) => { l.rotation.x = walk ? Math.sin(pg.phase + (i % 3 ? Math.PI : 0)) * 0.7 : 0; });
        pu.tail.rotation.z = Math.sin(t * (pg.state === 'lost' ? 3 : 14)) * 0.5;
        pu.head.rotation.x = pg.state === 'lost' ? 0.25 + Math.sin(t * 2) * 0.1 : 0;
        pigMark.visible = pg.state === 'lost' && save().intro;
        pigMark.position.set(pg.x, pg.y + 1.15 + Math.sin(t * 4) * 0.08, pg.z);
        blob(pg.x, pg.y, pg.z, 0.4);
      }
      // tracteur (et le chien au volant)
      {
        const drv = TR.driver >= 0 ? game.party.get(TR.driver) : null;
        const x = drv ? drv.pos.x : TR.x, y = drv ? drv.pos.y : TR.y, z = drv ? drv.pos.z : TR.z, yaw = drv ? drv.yaw : TR.yaw;
        tractor.position.set(x, y, z); tractor.rotation.y = yaw;
        const u = tractor.userData;
        TR.wheelA += TR.speed * dt;
        for (const w of u.wheels) { w.m.rotation.x = TR.wheelA / w.r; if (w.front) w.m.rotation.y = (TR.steer || 0) * 0.4; }
        u.body.position.y = Math.abs(TR.speed) > 0.5 || TR.driver >= 0 ? Math.sin(t * 30) * 0.015 : 0;
        game.placeShadow(trShadow, tractor.position, 1.6);
        if (drv && drv.mesh) {
          const sy = u.seatY, sz = u.seatZ;
          drv.mesh.position.set(x + Math.sin(yaw) * sz, y + sy - 0.2, z + Math.cos(yaw) * sz);
          drv.mesh.rotation.y = yaw;
          const pu = drv.mesh.userData;
          if (pu.legs) pu.legs.forEach((l) => { l.rotation.x = 0; });
          if (pu.ainu) { pu.ainu.position.y = 0; pu.ainu.rotation.x = 0; }
          if (drv.shadow) drv.shadow.visible = false;
        }
      }
      // la boue sur les chiens, et l'ébrouement
      for (const P of players()) {
        if (!P.mesh) continue;
        const mm = (P.mudT > 0 || mudFor.has(P.mesh)) ? mudMesh(P) : null;
        if (mm) {
          const kk = clamp(P.mudT / 1.3, 0, 1) * clamp((14 - P.mudT) * 4 + 0.6, 0, 1);
          mm.visible = P.mudT > 0 && P.mesh.visible !== false;
          mm.scale.setScalar(0.4 + kk * 0.6);
        }
        // le pelage lui-même devient tout marron, puis redevient propre après l'ébrouement
        const want = clamp((P.mudT || 0) / 1.3, 0, 1);
        if (Math.abs(want - (P.mudTint || 0)) > 0.03 || (want === 0 && P.mudTint)) tintMud(P, want);
        if (P.shakeT > 0) { P.mesh.rotation.z = Math.sin(t * 40) * 0.22 * Math.min(1, P.shakeT * 2); P.shook = true; }
        else if (P.shook) { P.mesh.rotation.z = 0; P.shook = false; }
      }
    },
  };

  // état initial d'après la sauvegarde
  updateChips();
  return logic;
}
