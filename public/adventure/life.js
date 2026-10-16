/*
 * Matcha & Ainu — la « couche de vie » d'un monde (réutilisable par tous les niveaux).
 *
 * Un monde qui fourmille, façon Nintendo : des bêtes qui se promènent, fuient, s'envolent
 * quand on aboie, se laissent caresser ; des objets à secouer, à casser, à faire sonner,
 * à pousser ; des trampolines ; des défis éclair (pièces rouges, anneaux, courses…) ;
 * des traînées de paillettes ; des habitants occupés ; des coffres cachés.
 *
 * Tout est décrit par des données (un plan fait par lifeplan.js + une palette par monde) et
 * dessiné par maillages instanciés (un seul appel de dessin par sorte d'objet) ; seuls les
 * objets proches du chien sont animés, les lointains dorment.
 *
 * Utilisation (dans le constructeur d'un niveau, voir snow.js) :
 *   const life = buildLife(game, { L, plan, palette, lines, hooks });
 *   logic.step(dt)   → life.step(dt)            (hôte : défis, objets, récompenses)
 *   logic.render(dt) → life.render(dt, t)       (tout le monde : bêtes, habitants, animations)
 *   extraCandidates  → ...life.candidates(Q) ; interact(n) → if (n.life) life.interact(n, P)
 *   snapshot / apply → life.snapshot() / life.apply(x) ; applySave → life.applySave()
 *   questText        → life.questText() || … ; minimapMarks → ...life.marks()
 * Sauvegarde : game.save.life = { defis: [], chests: [], gone: {}, talk: {}, pets }.
 */
import * as THREE from '../vendor/three.module.min.js';
import * as FOL from './foliage.js';
import * as M from './models.js';
import * as RT from './realtex.js';
import { PointGrid } from './lifeplan.js';
import * as KIT from './lifekit.js';
let firMatCache = null;
const firMat = () => firMatCache || (firMatCache = FOL.firMaterials({ snow: 0.7 }));

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
const REGROW_MS = 8 * 60 * 1000;
const TAU = Math.PI * 2;

// ===========================================================================
// Petit kit de géométrie : formes peintes (couleur par sommet), fusionnées
// ===========================================================================
function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(color);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
/** P(géométrie, couleur, { x, y, z, sx, sy, sz, rx, ry, rz }) : une pièce peinte et placée. */
function P(geo, color, o) {
  o = o || {};
  const g = paint(geo, color);
  _m.compose(_v.set(o.x || 0, o.y || 0, o.z || 0), _q.setFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ')), _s.set(o.sx || o.s || 1, o.sy || o.s || 1, o.sz || o.s || 1));
  g.applyMatrix4(_m);
  return g;
}
function merge(list) {
  const out = new THREE.BufferGeometry();
  // (les UV sont gardées : les matières « réelles » — pelage, plumes, paille, bois — s'y accrochent)
  for (const [name, k] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2]]) {
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const a = new Float32Array(n * k); let o = 0;
    for (const g of list) { const at = g.attributes[name]; if (at) a.set(at.array, o); o += g.attributes.position.count * k; }
    out.setAttribute(name, new THREE.BufferAttribute(a, k));
  }
  out.computeBoundingSphere();
  return out;
}
const sph = (r, w, h, ...a) => new THREE.SphereGeometry(r, w || 8, h || 6, ...a);
const cyl = (a, b, h, n, ...o) => new THREE.CylinderGeometry(a, b, h, n || 6, ...o);
const cone = (r, h, n) => new THREE.ConeGeometry(r, h, n || 6);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const tor = (r, t, a, b, arc) => new THREE.TorusGeometry(r, t, a || 6, b || 16, arc);

/** Une paire d'yeux noirs (et un reflet) sur une tête. */
const eyes = (x, y, z, r) => [P(sph(r, 6, 4), 0x141414, { x, y, z }), P(sph(r, 6, 4), 0x141414, { x: -x, y, z })];

// ---------------------------------------------------------------------------
// Bestiaire : chaque modèle renvoie { body, flap?, pivots?, h, r } (pieds en y = 0, regard vers +z).
// « flap » : une aile / nageoire / bras (une seule moitié, pivot à l'origine, vers +x),
// dessinée deux fois (miroir) et animée.
// ---------------------------------------------------------------------------
const wingGeo = (len, w, col) => merge([P(sph(0.5, 8, 4), col, { x: len * 0.5, sx: len, sy: 0.18 * w, sz: w })]);
export const MODELS = {
  hare(c) {
    const fur = c.fur || 0xffffff, tip = c.tip || 0x2a2a2e;
    return {
      body: merge([P(sph(0.28), fur, { y: 0.3, sz: 1.25, sy: 0.92 }), P(sph(0.18), fur, { y: 0.55, z: 0.26 }),
        P(sph(0.06), fur, { x: 0.07, y: 0.8, z: 0.18, sy: 3.4, rx: -0.35, rz: -0.15 }), P(sph(0.06), fur, { x: -0.07, y: 0.8, z: 0.18, sy: 3.4, rx: -0.35, rz: 0.15 }),
        P(sph(0.035), tip, { x: 0.1, y: 0.99, z: 0.1 }), P(sph(0.035), tip, { x: -0.1, y: 0.99, z: 0.1 }),
        ...eyes(0.1, 0.59, 0.38, 0.032), P(sph(0.028), 0xf09aa8, { y: 0.53, z: 0.44 }),
        P(sph(0.09), 0xffffff, { y: 0.36, z: -0.34 }), P(sph(0.08), fur, { x: 0.13, y: 0.06, z: -0.06, sz: 2.2 }), P(sph(0.08), fur, { x: -0.13, y: 0.06, z: -0.06, sz: 2.2 })]),
      h: 1.0, r: 0.35, skin: 'fur',
    };
  },
  bird(c) {
    const back = c.back || 0x6a7080, breast = c.breast || 0xe8503a, cap = c.cap || 0x1a1a20;
    return {
      body: merge([P(sph(0.11), back, { y: 0.15, sz: 1.3, sy: 0.95 }), P(sph(0.1), breast, { y: 0.13, z: 0.05, sx: 0.92 }), P(sph(0.078), cap, { y: 0.27, z: 0.1 }),
        P(cone(0.03, 0.08, 5), 0x2a2a2a, { y: 0.26, z: 0.2, rx: Math.PI / 2 }), P(box(0.1, 0.02, 0.14), cap, { y: 0.17, z: -0.18, rx: 0.3 }),
        ...eyes(0.05, 0.29, 0.16, 0.014)]),
      flap: wingGeo(0.22, 0.13, back), pivots: [0.08, 0.18, 0.0], h: 0.35, r: 0.15, skin: 'feather',
    };
  },
  owl(c) {
    const f = c.fur || 0xf2f0ea, fleck = c.fleck || 0x5a5048;
    const fl = []; for (let i = 0; i < 9; i++) fl.push(P(sph(0.035, 5, 3), fleck, { x: Math.sin(i * 2.4) * 0.22, y: 0.3 + (i % 3) * 0.12, z: Math.cos(i * 2.4) * 0.22 - 0.02, sy: 0.6 }));
    return {
      body: merge([P(sph(0.3), f, { y: 0.38, sy: 1.25, sz: 0.95 }), P(sph(0.24), f, { y: 0.82 }), ...fl,
        P(sph(0.08), 0xffd23a, { x: 0.1, y: 0.85, z: 0.18, sz: 0.4 }), P(sph(0.08), 0xffd23a, { x: -0.1, y: 0.85, z: 0.18, sz: 0.4 }),
        P(sph(0.04), 0x111111, { x: 0.1, y: 0.85, z: 0.21 }), P(sph(0.04), 0x111111, { x: -0.1, y: 0.85, z: 0.21 }),
        P(cone(0.035, 0.1, 4), 0x3a3030, { y: 0.77, z: 0.24, rx: Math.PI * 0.6 }),
        P(cone(0.05, 0.14, 4), f, { x: 0.14, y: 1.04, z: 0.02, rz: -0.3 }), P(cone(0.05, 0.14, 4), f, { x: -0.14, y: 1.04, z: 0.02, rz: 0.3 }),
        P(sph(0.05), 0x5a4a3a, { x: 0.1, y: 0.02, z: 0.08, sz: 1.5 }), P(sph(0.05), 0x5a4a3a, { x: -0.1, y: 0.02, z: 0.08, sz: 1.5 })]),
      flap: wingGeo(0.5, 0.3, f), pivots: [0.24, 0.55, -0.02], h: 1.15, r: 0.35,
    };
  },
  penguin(c) {
    const black = c.back || 0x23262e, white = 0xf6f6f2, orange = 0xf0962a;
    const extra = [];
    if (c.scarf) extra.push(P(tor(0.27, 0.07, 6, 14), c.scarf, { y: 0.92, rx: Math.PI / 2 }));
    if (c.bonnet) extra.push(P(sph(0.29, 10, 6, 0, TAU, 0, Math.PI / 2), c.bonnet, { y: 1.2 }), P(sph(0.09), 0xffffff, { y: 1.5 }));
    return {
      body: merge([P(sph(0.42, 10, 8), black, { y: 0.6, sy: 1.35, sz: 0.9 }), P(sph(0.36, 10, 8), white, { y: 0.56, z: 0.14, sx: 0.95, sy: 1.25, sz: 0.7 }),
        P(sph(0.28), black, { y: 1.15 }), P(sph(0.22), white, { y: 1.12, z: 0.12, sy: 0.85, sz: 0.6 }), P(cone(0.07, 0.22, 6), orange, { y: 1.11, z: 0.32, rx: Math.PI / 2 }),
        ...eyes(0.1, 1.2, 0.24, 0.045), P(sph(0.1), orange, { x: 0.15, y: 0.03, z: 0.08, sy: 0.4, sz: 1.6 }), P(sph(0.1), orange, { x: -0.15, y: 0.03, z: 0.08, sy: 0.4, sz: 1.6 }), ...extra]),
      flap: merge([P(sph(0.16), black, { x: 0.02, y: -0.22, sx: 0.35, sy: 1.6, sz: 0.8 })]), pivots: [0.4, 0.82, 0], flapAxis: 'z', h: 1.45, r: 0.45,
    };
  },
  marmot(c) {
    const f = c.fur || 0xa07048, belly = c.belly || 0xe8d0a8;
    return {
      body: merge([P(sph(0.26), f, { y: 0.32, sy: 1.35, sz: 1.0 }), P(sph(0.2), belly, { y: 0.32, z: 0.1, sy: 1.3, sz: 0.8 }), P(sph(0.17), f, { y: 0.72 }),
        P(sph(0.09), belly, { y: 0.68, z: 0.13, sz: 0.8 }), P(sph(0.03), 0x241a14, { y: 0.71, z: 0.22 }), P(box(0.05, 0.05, 0.02), 0xffffff, { y: 0.62, z: 0.2 }),
        P(sph(0.05), f, { x: 0.12, y: 0.86, sy: 0.7 }), P(sph(0.05), f, { x: -0.12, y: 0.86, sy: 0.7 }), ...eyes(0.07, 0.77, 0.14, 0.025),
        P(sph(0.05), f, { x: 0.13, y: 0.45, z: 0.17, sy: 1.4 }), P(sph(0.05), f, { x: -0.13, y: 0.45, z: 0.17, sy: 1.4 })]),
      h: 0.95, r: 0.3,
    };
  },
  reindeer(c) {
    const f = c.fur || 0x8a5a3a, light = 0xf2e8d8, ant = 0xd8c4a0, leg = 0x5a3a24;
    const parts = [P(sph(0.5, 10, 8), f, { y: 1.15, sx: 0.8, sy: 0.82, sz: 1.55 }), P(sph(0.3), light, { y: 1.18, z: 0.55, sx: 1.05, sy: 1.1 }),
      P(cyl(0.16, 0.22, 0.7, 7), f, { y: 1.6, z: 0.7, rx: 0.5 }), P(sph(0.24), f, { y: 1.92, z: 0.95, sz: 1.3 }), P(sph(0.13), light, { y: 1.86, z: 1.2, sz: 1.2 }),
      P(sph(0.07), c.nose || 0x2a1a14, { y: 1.88, z: 1.33 }), ...eyes(0.13, 2.0, 1.06, 0.035), P(sph(0.1), 0xffffff, { y: 1.3, z: -0.75 })];
    for (const [x, z] of [[0.24, 0.5], [-0.24, 0.5], [0.24, -0.5], [-0.24, -0.5]]) parts.push(P(cyl(0.07, 0.06, 0.95, 5), leg, { x, y: 0.5, z }), P(sph(0.08), 0x2a1a14, { x, y: 0.04, z: z + 0.03 }));
    for (const s of [-1, 1]) {
      parts.push(P(cyl(0.035, 0.05, 0.6, 4), ant, { x: s * 0.16, y: 2.35, z: 0.85, rz: -s * 0.4, rx: -0.3 }));
      parts.push(P(cyl(0.03, 0.035, 0.35, 4), ant, { x: s * 0.36, y: 2.55, z: 0.75, rz: -s * 1.1 }));
      parts.push(P(cyl(0.03, 0.035, 0.3, 4), ant, { x: s * 0.24, y: 2.55, z: 0.95, rx: 0.8 }));
      parts.push(P(sph(0.09), f, { x: s * 0.2, y: 2.08, z: 0.82, sx: 1.6, sy: 0.6 }));
    }
    return { body: merge(parts), h: 2.6, r: 0.8 };
  },
  ermine(c) {
    const f = c.fur || 0xfafbff;
    return {
      body: merge([P(sph(0.1), f, { y: 0.15, sz: 3.0 }), P(sph(0.09), f, { y: 0.24, z: 0.32 }), P(sph(0.03), 0x111111, { y: 0.24, z: 0.41 }),
        ...eyes(0.045, 0.28, 0.38, 0.018), P(sph(0.035), f, { x: 0.06, y: 0.33, z: 0.3 }), P(sph(0.035), f, { x: -0.06, y: 0.33, z: 0.3 }),
        P(sph(0.045), f, { y: 0.2, z: -0.38, sz: 2.4, rx: -0.4 }), P(sph(0.05), 0x141414, { y: 0.28, z: -0.52 })]),
      h: 0.45, r: 0.3,
    };
  },
  squirrel(c) {
    const f = c.fur || 0xc0602a, belly = 0xf2dcc0;
    return {
      body: merge([P(sph(0.14), f, { y: 0.2, sy: 1.25 }), P(sph(0.1), belly, { y: 0.2, z: 0.07, sy: 1.2, sz: 0.8 }), P(sph(0.1), f, { y: 0.42, z: 0.05 }),
        P(cone(0.035, 0.1, 4), f, { x: 0.06, y: 0.54, z: 0.03 }), P(cone(0.035, 0.1, 4), f, { x: -0.06, y: 0.54, z: 0.03 }), ...eyes(0.05, 0.45, 0.13, 0.02),
        P(sph(0.13), f, { y: 0.36, z: -0.2, sy: 2.1, sz: 0.9, rx: -0.25 }), P(sph(0.1), f, { y: 0.66, z: -0.12, sz: 1.3 })]),
      h: 0.7, r: 0.2,
    };
  },
  fox(c) {
    const red = c.fur || 0xd8641e, white = 0xfaf2e6, dark = 0x2a1a14;
    const parts = [P(sph(0.26), red, { y: 0.55, sz: 1.9, sy: 0.9 }), P(sph(0.2), white, { y: 0.5, z: 0.32, sy: 1.0, sz: 0.8 }), P(sph(0.22), red, { y: 0.86, z: 0.5 }),
      P(cone(0.11, 0.32, 6), white, { y: 0.81, z: 0.75, rx: Math.PI / 2 }), P(sph(0.04), dark, { y: 0.81, z: 0.92 }), ...eyes(0.09, 0.91, 0.67, 0.035),
      P(cone(0.08, 0.22, 4), dark, { x: 0.12, y: 1.08, z: 0.48, rz: -0.25 }), P(cone(0.08, 0.22, 4), dark, { x: -0.12, y: 1.08, z: 0.48, rz: 0.25 }),
      P(sph(0.18), red, { y: 0.66, z: -0.72, sz: 2.6, rx: -0.3 }), P(sph(0.12), white, { y: 0.8, z: -1.12 })];
    for (const [x, z] of [[0.13, 0.3], [-0.13, 0.3], [0.13, -0.3], [-0.13, -0.3]]) parts.push(P(cyl(0.05, 0.05, 0.42, 5), dark, { x, y: 0.21, z }));
    if (c.scarf) parts.push(P(tor(0.2, 0.06, 6, 12), c.scarf, { y: 0.72, z: 0.45, rx: Math.PI / 2 + 0.5 }), P(box(0.1, 0.35, 0.04), c.scarf, { x: 0.1, y: 0.55, z: 0.25, rz: 0.4 }));
    return { body: merge(parts), h: 1.1, r: 0.45 };
  },
  fish(c) {
    const f = c.fur || 0xff8a3a;
    return { body: merge([P(sph(0.13), f, { sx: 0.5, sz: 2.2 }), P(cone(0.12, 0.18, 4), f, { z: -0.32, rx: -Math.PI / 2, sx: 0.3 }), ...eyes(0.05, 0.03, 0.18, 0.02)]), h: 0.3, r: 0.2, skin: 'skin' };
  },
  sprite(c) { return { body: merge([P(new THREE.IcosahedronGeometry(0.12, 0), c.fur || 0xbfeaff)]), h: 0.3, r: 0.2, unlit: true }; },
  puppy(c) {
    const f = 0xffffff, dark = 0x1a1414;
    const parts = [P(sph(0.22), f, { y: 0.32, sz: 1.4, sy: 0.9 }), P(sph(0.19), f, { y: 0.56, z: 0.28 }), P(sph(0.09), 0xffffff, { y: 0.51, z: 0.44, sz: 0.9 }),
      P(sph(0.035), dark, { y: 0.55, z: 0.52 }), ...eyes(0.08, 0.61, 0.43, 0.03), P(sph(0.07), f, { x: 0.16, y: 0.55, z: 0.22, sy: 1.8 }), P(sph(0.07), f, { x: -0.16, y: 0.55, z: 0.22, sy: 1.8 }),
      P(sph(0.05), f, { y: 0.45, z: -0.32, sz: 1.8, rx: 0.8 })];
    for (const [x, z] of [[0.1, 0.18], [-0.1, 0.18], [0.1, -0.18], [-0.1, -0.18]]) parts.push(P(cyl(0.05, 0.05, 0.22, 5), f, { x, y: 0.11, z }));
    if (c.bonnet) parts.push(P(sph(0.17, 8, 5, 0, TAU, 0, Math.PI / 2), c.bonnet, { y: 0.68, z: 0.26 }), P(sph(0.06), 0xfff0f0, { y: 0.86, z: 0.26 }));
    return { body: merge(parts), h: 0.9, r: 0.3, tint: true, skin: 'fur' };
  },
  // --- la ferme (niveau 7) : poules, poussins, chèvres, âne, porcelets, chat, souris, abeille (canards, grenouilles, papillons : lifekit.js)
  // « skin » : la matière posée sur le modèle quand le monde est « réel » (pelage, plumes, peau) : jamais du plastique uni
  /** Petit passereau (moineau, corbeau…) : corps fuselé, queue en éventail, ailes en plumes étagées (pas une planche). */
  songbird(c) {
    const back = c.back || 0x8a6a4a, breast = c.breast || 0xe8d8c0, cap = c.cap || 0x6a4a34, beak = c.beak || 0x3a3028;
    const parts = [P(sph(0.1, 10, 8), back, { y: 0.14, sz: 1.45, sy: 0.9 }), P(sph(0.085, 10, 8), breast, { y: 0.12, z: 0.04, sx: 0.9, sy: 0.85, sz: 1.2 }),
      P(sph(0.07, 10, 8), cap, { y: 0.24, z: 0.11 }), P(sph(0.045, 6, 4), breast, { y: 0.215, z: 0.15, sx: 0.9, sy: 0.7 }),
      P(cone(0.022, 0.07, 5), beak, { y: 0.235, z: 0.19, rx: Math.PI / 2 }), ...eyes(0.042, 0.255, 0.155, 0.012)];
    for (let i = 0; i < 5; i++) parts.push(P(sph(0.5, 6, 3), back, { x: (i - 2) * 0.018, y: 0.15 - Math.abs(i - 2) * 0.004, z: -0.2, sx: 0.035, sy: 0.012, sz: 0.16, ry: (i - 2) * 0.16, rx: -0.25 }));
    for (const s of [-1, 1]) parts.push(P(cyl(0.007, 0.006, 0.08, 4), 0x8a6a50, { x: s * 0.03, y: 0.04 }));
    // l'aile : trois rangs de plumes (couvertures, secondaires, rémiges), de plus en plus fines au bout
    const wc = c.wing || back, wd = c.wingDark || cap;
    const wingP = [P(sph(0.5, 8, 4), wc, { x: 0.07, sx: 0.15, sy: 0.022, sz: 0.11 }), P(sph(0.5, 8, 4), wc, { x: 0.12, z: -0.02, sx: 0.16, sy: 0.016, sz: 0.085 })];
    for (let i = 0; i < 4; i++) wingP.push(P(sph(0.5, 6, 3), wd, { x: 0.15 + i * 0.03, z: -0.035 - i * 0.01, sx: 0.12 - i * 0.012, sy: 0.01, sz: 0.04, ry: -0.25 - i * 0.12 }));
    return { body: merge(parts), flap: merge(wingP), pivots: [0.06, 0.17, 0.0], h: 0.32, r: 0.13, skin: 'feather' };
  },
  hen(c) {
    const f = c.fur || 0xffffff, red = 0xd8302a, y = 0xe8a830;
    const parts = [P(sph(0.27, 12, 9), f, { y: 0.44, sz: 1.25, sy: 0.92 }), P(sph(0.17, 10, 8), f, { y: 0.74, z: 0.24 }),
      P(sph(0.2, 8, 6), f, { y: 0.62, z: -0.3, sx: 0.55, sy: 1.3, rx: -0.6 }),
      P(sph(0.12, 8, 6), f, { x: 0.22, y: 0.46, z: -0.02, sx: 0.4, sy: 0.8, sz: 1.6 }), P(sph(0.12, 8, 6), f, { x: -0.22, y: 0.46, z: -0.02, sx: 0.4, sy: 0.8, sz: 1.6 }),
      P(sph(0.05, 6, 4), red, { y: 0.93, z: 0.25, sx: 0.5, sz: 1.6 }), P(sph(0.04, 6, 4), red, { y: 0.92, z: 0.16, sx: 0.5 }), P(sph(0.04, 6, 4), red, { y: 0.63, z: 0.36, sx: 0.6, sy: 1.5 }),
      P(cone(0.045, 0.11, 5), y, { y: 0.73, z: 0.42, rx: Math.PI / 2 }), ...eyes(0.09, 0.79, 0.34, 0.024)];
    for (const s of [-1, 1]) parts.push(P(cyl(0.022, 0.022, 0.26, 4), y, { x: s * 0.08, y: 0.13 }), P(box(0.09, 0.02, 0.13), y, { x: s * 0.08, y: 0.01, z: 0.04 }));
    return { body: merge(parts), h: 0.95, r: 0.3, tint: true, skin: 'feather' };
  },
  chick(c) {
    const f = c.fur || 0xffe060, o = 0xf09a20;
    return {
      body: merge([P(sph(0.14, 10, 8), f, { y: 0.16, sz: 1.1 }), P(sph(0.1, 10, 8), f, { y: 0.33, z: 0.07 }), P(cone(0.03, 0.06, 4), o, { y: 0.32, z: 0.18, rx: Math.PI / 2 }),
        ...eyes(0.05, 0.36, 0.14, 0.016), P(sph(0.05, 6, 4), f, { x: 0.12, y: 0.18, sx: 0.4, sz: 1.4 }), P(sph(0.05, 6, 4), f, { x: -0.12, y: 0.18, sx: 0.4, sz: 1.4 }),
        P(cyl(0.012, 0.012, 0.06, 4), o, { x: 0.05, y: 0.02 }), P(cyl(0.012, 0.012, 0.06, 4), o, { x: -0.05, y: 0.02 })]),
      h: 0.45, r: 0.15, skin: 'feather',
    };
  },
  goat(c) {
    const f = c.fur || 0xffffff, horn = 0xb8a890, hoof = 0x3a3028, pink = 0xe8b0a0;
    const parts = [P(sph(0.42, 12, 9), f, { y: 0.88, sx: 0.72, sy: 0.75, sz: 1.35 }), P(cyl(0.12, 0.17, 0.5, 8), f, { y: 1.2, z: 0.45, rx: 0.55 }),
      P(sph(0.19, 10, 8), f, { y: 1.42, z: 0.62, sz: 1.35, rx: 0.3 }), P(sph(0.1, 8, 6), pink, { y: 1.33, z: 0.84, sx: 0.9, sy: 0.7 }), P(sph(0.025), 0x2a1a14, { x: 0.035, y: 1.36, z: 0.92 }), P(sph(0.025), 0x2a1a14, { x: -0.035, y: 1.36, z: 0.92 }),
      P(cone(0.06, 0.2, 5), f, { y: 1.16, z: 0.74, rx: Math.PI }), ...eyes(0.12, 1.5, 0.7, 0.03), P(sph(0.07, 6, 4), f, { y: 1.08, z: -0.58, sy: 1.6, rx: -0.6 })];
    for (const s of [-1, 1]) {
      parts.push(P(cone(0.045, 0.32, 5), horn, { x: s * 0.08, y: 1.66, z: 0.5, rx: -0.9, rz: -s * 0.15 }));
      parts.push(P(sph(0.06, 6, 4), f, { x: s * 0.2, y: 1.48, z: 0.55, sx: 2.2, sy: 0.5, rz: s * 0.3 }));
    }
    for (const [x, z] of [[0.18, 0.4], [-0.18, 0.4], [0.18, -0.38], [-0.18, -0.38]]) parts.push(P(cyl(0.06, 0.05, 0.62, 6), f, { x, y: 0.34, z }), P(cyl(0.055, 0.06, 0.08, 6), hoof, { x, y: 0.04, z }));
    return { body: merge(parts), h: 1.8, r: 0.55, tint: true, skin: 'fur' };
  },
  donkey(c) {
    const f = c.fur || 0x9a948c, light = 0xe8e2d8, dark = 0x3a3430;
    const parts = [P(sph(0.5, 12, 9), f, { y: 1.2, sx: 0.75, sy: 0.78, sz: 1.5 }), P(sph(0.36, 10, 8), light, { y: 1.02, sx: 0.85, sy: 0.6, sz: 1.3 }),
      P(cyl(0.18, 0.26, 0.75, 8), f, { y: 1.62, z: 0.66, rx: 0.6 }), P(sph(0.26, 10, 8), f, { y: 1.95, z: 0.92, sz: 1.5, rx: 0.4 }), P(sph(0.18, 10, 8), light, { y: 1.82, z: 1.22, sz: 1.1 }),
      P(sph(0.03), dark, { x: 0.07, y: 1.84, z: 1.38 }), P(sph(0.03), dark, { x: -0.07, y: 1.84, z: 1.38 }), ...eyes(0.15, 2.05, 1.0, 0.04),
      P(box(0.06, 0.18, 0.7), dark, { y: 1.95, z: 0.6, rx: 0.6 }), P(cyl(0.035, 0.02, 0.6, 5), f, { y: 1.05, z: -0.85, rx: 0.35 }), P(sph(0.07, 6, 4), dark, { y: 0.78, z: -0.95, sy: 1.6 })];
    for (const s of [-1, 1]) parts.push(P(sph(0.08, 8, 6), f, { x: s * 0.16, y: 2.35, z: 0.78, sy: 3.2, sx: 0.9, rz: -s * 0.25, rx: -0.3 }), P(sph(0.05, 6, 4), dark, { x: s * 0.2, y: 2.58, z: 0.72, sy: 1.5 }));
    for (const [x, z] of [[0.22, 0.5], [-0.22, 0.5], [0.22, -0.52], [-0.22, -0.52]]) parts.push(P(cyl(0.08, 0.07, 0.9, 6), f, { x, y: 0.48, z }), P(cyl(0.08, 0.085, 0.1, 6), dark, { x, y: 0.05, z }));
    return { body: merge(parts), h: 2.7, r: 0.8, skin: 'fur' };
  },
  piglet(c) {
    const f = c.fur || 0xf4b0a8, dark = 0x5a2a28, mud = c.mud || 0x7a5232;
    const parts = [P(sph(0.3, 12, 9), f, { y: 0.36, sz: 1.35, sy: 0.92 }), P(sph(0.21, 10, 8), f, { y: 0.44, z: 0.36 }), P(cyl(0.09, 0.1, 0.1, 10), 0xf09a98, { y: 0.4, z: 0.57, rx: Math.PI / 2 }),
      P(sph(0.02), dark, { x: 0.035, y: 0.41, z: 0.63 }), P(sph(0.02), dark, { x: -0.035, y: 0.41, z: 0.63 }), ...eyes(0.09, 0.52, 0.5, 0.026),
      P(cone(0.08, 0.14, 4), f, { x: 0.12, y: 0.64, z: 0.3, rz: -0.4, rx: 0.4 }), P(cone(0.08, 0.14, 4), f, { x: -0.12, y: 0.64, z: 0.3, rz: 0.4, rx: 0.4 }),
      P(tor(0.05, 0.015, 4, 8), f, { y: 0.44, z: -0.42, ry: Math.PI / 2 }), P(sph(0.17, 8, 6), mud, { x: 0.12, y: 0.22, z: -0.1, sx: 1.3, sy: 0.6, sz: 1.6 })];
    for (const [x, z] of [[0.14, 0.22], [-0.14, 0.22], [0.14, -0.22], [-0.14, -0.22]]) parts.push(P(cyl(0.055, 0.05, 0.2, 6), f, { x, y: 0.1, z }));
    return { body: merge(parts), h: 0.75, r: 0.35, skin: 'skin' };
  },
  cat(c) {
    const f = c.fur || 0xffffff, w = 0xfaf4ea, pink = 0xf0a0a8;
    const parts = [P(sph(0.2, 10, 8), f, { y: 0.32, sz: 1.7, sy: 0.95 }), P(sph(0.13, 8, 6), w, { y: 0.27, z: 0.12, sy: 0.8, sz: 1.4 }), P(sph(0.16, 10, 8), f, { y: 0.55, z: 0.32 }),
      P(sph(0.07, 8, 6), w, { y: 0.51, z: 0.44, sx: 1.3, sy: 0.8 }), P(sph(0.02), pink, { y: 0.54, z: 0.5 }), ...eyes(0.065, 0.59, 0.44, 0.03),
      P(cone(0.06, 0.13, 4), f, { x: 0.09, y: 0.72, z: 0.3, rz: -0.25 }), P(cone(0.06, 0.13, 4), f, { x: -0.09, y: 0.72, z: 0.3, rz: 0.25 }),
      P(cyl(0.035, 0.03, 0.45, 5), f, { y: 0.48, z: -0.42, rx: -0.7 }), P(cyl(0.03, 0.025, 0.3, 5), f, { y: 0.78, z: -0.52, rx: 0.3 })];
    for (const [x, z] of [[0.08, 0.2], [-0.08, 0.2], [0.08, -0.2], [-0.08, -0.2]]) parts.push(P(cyl(0.04, 0.035, 0.24, 5), f, { x, y: 0.12, z }), P(sph(0.04, 6, 4), w, { x, y: 0.02, z: z + 0.02 }));
    return { body: merge(parts), h: 0.85, r: 0.3, tint: true, skin: 'fur' };
  },
  mouse(c) {
    const f = c.fur || 0x9a8a80, pink = 0xf0a8b0;
    return {
      body: merge([P(sph(0.08, 8, 6), f, { y: 0.08, sz: 1.5 }), P(sph(0.055, 8, 6), f, { y: 0.1, z: 0.12, sz: 1.3 }), P(sph(0.015), pink, { y: 0.1, z: 0.19 }), ...eyes(0.03, 0.13, 0.15, 0.012),
        P(sph(0.035, 6, 4), pink, { x: 0.04, y: 0.17, z: 0.08, sz: 0.3 }), P(sph(0.035, 6, 4), pink, { x: -0.04, y: 0.17, z: 0.08, sz: 0.3 }), P(cyl(0.008, 0.004, 0.25, 3), pink, { y: 0.05, z: -0.22, rx: 1.4 })]),
      h: 0.22, r: 0.12, skin: 'fur',
    };
  },
  bee() {
    const y = 0xf2c020, k = 0x2a2420;
    return {
      body: merge([P(sph(0.08, 8, 6), y, { sz: 1.35 }), P(cyl(0.079, 0.079, 0.03, 8), k, { z: -0.02, rx: Math.PI / 2 }), P(cyl(0.07, 0.07, 0.03, 8), k, { z: -0.07, rx: Math.PI / 2 }),
        P(sph(0.05, 6, 4), k, { z: 0.1 }), ...eyes(0.03, 0.02, 0.13, 0.012)]),
      flap: wingGeo(0.12, 0.07, 0xf4f8ff), pivots: [0.02, 0.06, 0], h: 0.2, r: 0.1, skin: 'skin',
    };
  },
};

// Habitants : chien debout (pelage teinté), habits teintés, bras animés, outils
const VILLAGER = {
  dog() {
    const f = 0xffffff, dark = 0x1a1414;
    return merge([P(cyl(0.11, 0.12, 0.45, 6), f, { x: 0.16, y: 0.22 }), P(cyl(0.11, 0.12, 0.45, 6), f, { x: -0.16, y: 0.22 }),
      P(sph(0.13), f, { x: 0.16, y: 0.04, z: 0.08, sz: 1.4, sy: 0.6 }), P(sph(0.13), f, { x: -0.16, y: 0.04, z: 0.08, sz: 1.4, sy: 0.6 }),
      P(sph(0.36, 10, 8), f, { y: 0.78, sy: 1.25, sz: 0.9 }), P(sph(0.3, 10, 8), f, { y: 1.46 }), P(sph(0.16), f, { y: 1.38, z: 0.26, sz: 1.2, sy: 0.8 }),
      P(sph(0.06), dark, { y: 1.44, z: 0.44 }), ...eyes(0.12, 1.54, 0.24, 0.04), P(sph(0.1), f, { x: 0.27, y: 1.4, z: -0.02, sy: 2.0, sz: 0.7, rz: 0.3 }),
      P(sph(0.1), f, { x: -0.27, y: 1.4, z: -0.02, sy: 2.0, sz: 0.7, rz: -0.3 }), P(sph(0.07), f, { y: 0.55, z: -0.36, sz: 2.2, rx: 0.9 })]);
  },
  dogCloth() {
    const w = 0xffffff;
    return merge([P(cyl(0.34, 0.42, 0.55, 10), w, { y: 0.66 }), P(tor(0.25, 0.08, 6, 14), w, { y: 1.13, rx: Math.PI / 2 }), P(box(0.12, 0.34, 0.06), w, { x: 0.12, y: 0.95, z: 0.3, rz: 0.15 }),
      P(sph(0.31, 10, 6, 0, TAU, 0, Math.PI / 2), w, { y: 1.55, sy: 0.9 }), P(sph(0.1), w, { y: 1.9 })]);
  },
  arm() { return merge([P(sph(0.09), 0xffffff, { y: -0.22, sy: 3.0 }), P(sph(0.08), 0xf4f4f4, { y: -0.46 })]); },
  snowman() {
    const s = 0xf6f9ff;
    return merge([P(sph(0.6, 10, 8), s, { y: 0.55 }), P(sph(0.44, 10, 8), s, { y: 1.35 }), P(sph(0.32, 10, 8), s, { y: 1.96 }),
      ...eyes(0.11, 2.04, 0.27, 0.045), P(cone(0.06, 0.4, 6), 0xf07a1a, { y: 1.96, z: 0.45, rx: Math.PI / 2 }),
      P(sph(0.04), 0x1a1a1e, { y: 1.5, z: 0.42 }), P(sph(0.04), 0x1a1a1e, { y: 1.3, z: 0.44 }), P(tor(0.3, 0.07, 6, 14), 0xe0303a, { y: 1.68, rx: Math.PI / 2 })]);
  },
  snowArm() { return merge([P(cyl(0.025, 0.035, 0.75, 4), 0x5a3a24, { y: -0.36 }), P(cyl(0.02, 0.02, 0.2, 4), 0x5a3a24, { x: 0.05, y: -0.66, rz: 0.6 })]); },
  hat() { return merge([P(cyl(0.22, 0.22, 0.34, 10), 0xffffff, { y: 0.17 }), P(cyl(0.34, 0.34, 0.04, 12), 0xffffff, { y: 0.02 }), P(cyl(0.225, 0.225, 0.06, 10), 0xd04040, { y: 0.06 })]); },
  yeti() {
    const f = 0xf4f8ff, face = 0x9ab8d8;
    const parts = [P(sph(0.8, 10, 8), f, { y: 1.5, sy: 1.25, sz: 0.85 }), P(sph(0.55, 10, 8), f, { y: 2.6 }), P(sph(0.36), face, { y: 2.52, z: 0.32, sy: 0.9, sz: 0.6 }),
      ...eyes(0.13, 2.62, 0.52, 0.06), P(box(0.3, 0.08, 0.05), 0x2a3a5a, { y: 2.36, z: 0.53 }),
      P(cone(0.08, 0.3, 5), 0xd8dde8, { x: 0.32, y: 3.08, rz: -0.4 }), P(cone(0.08, 0.3, 5), 0xd8dde8, { x: -0.32, y: 3.08, rz: 0.4 }),
      P(cyl(0.22, 0.26, 0.7, 6), f, { x: 0.32, y: 0.35 }), P(cyl(0.22, 0.26, 0.7, 6), f, { x: -0.32, y: 0.35 }),
      P(sph(0.26), face, { x: 0.32, y: 0.06, z: 0.12, sz: 1.5, sy: 0.4 }), P(sph(0.26), face, { x: -0.32, y: 0.06, z: 0.12, sz: 1.5, sy: 0.4 })];
    return merge(parts);
  },
  yetiArm() { return merge([P(sph(0.2), 0xf4f8ff, { y: -0.5, sy: 3.0 }), P(sph(0.17), 0x9ab8d8, { y: -1.05 })]); },
  // outils (dans la patte droite ; origine = bout du bras)
  shovel() { return merge([P(cyl(0.03, 0.03, 1.1, 5), 0x8a5a30, { y: 0.1, rx: 0.2 }), P(box(0.36, 0.04, 0.42), 0xd84a3a, { y: -0.45, z: -0.1, rx: 0.4 })]); },
  rod() { return merge([P(cyl(0.02, 0.03, 2.0, 5), 0x6a4a2a, { y: 0.3, z: 0.7, rx: 1.0 }), P(cyl(0.004, 0.004, 1.6, 3), 0xe8e8e8, { y: 0.2, z: 1.55, rx: 0.12 }), P(sph(0.05), 0xff3a3a, { y: -0.58, z: 1.6 })]); },
  mallet() { return merge([P(cyl(0.025, 0.025, 0.6, 5), 0x8a5a30, { y: -0.1 }), P(cyl(0.09, 0.09, 0.26, 8), 0xa07048, { y: -0.4, rz: Math.PI / 2 })]); },
  pan() { return merge([P(cyl(0.025, 0.025, 0.5, 5), 0x3a3a3a, { y: -0.05, rx: 1.2 }), P(cyl(0.28, 0.22, 0.1, 10), 0x2a2a30, { y: -0.18, z: 0.45 }), P(sph(0.06), 0x7a3a1a, { x: 0.08, y: -0.11, z: 0.45 }), P(sph(0.06), 0x7a3a1a, { x: -0.08, y: -0.11, z: 0.5 })]); },
  flag() { return merge([P(cyl(0.02, 0.02, 1.2, 4), 0xdddddd, { y: 0.35 }), P(box(0.02, 0.32, 0.46), 0x3a8ae0, { y: 0.8, z: 0.24 })]); },
  snowball() { return merge([P(sph(0.16), 0xffffff, { y: -0.5 })]); },
  // outils de la ferme
  pitchfork() { return merge([P(cyl(0.025, 0.025, 1.6, 5), 0x9a6a3a, { y: 0.1 }), P(box(0.3, 0.04, 0.04), 0x707078, { y: -0.72 }), ...[-0.13, 0, 0.13].map(x => P(cyl(0.012, 0.006, 0.36, 4), 0x707078, { x, y: -0.92 }))]); },
  can() { return merge([P(cyl(0.16, 0.18, 0.3, 10), 0x5a9a6a, { y: -0.55, z: 0.15 }), P(cyl(0.025, 0.03, 0.4, 5), 0x5a9a6a, { y: -0.48, z: 0.4, rx: -1.0 }), P(cyl(0.05, 0.03, 0.06, 8), 0x4a8a5a, { y: -0.38, z: 0.56, rx: -1.0 }), P(tor(0.1, 0.02, 4, 10, Math.PI), 0x4a8a5a, { y: -0.38, z: 0.15 })]); },
  basket() { return merge([P(cyl(0.22, 0.16, 0.22, 10, 1, true), 0xb88a50, { y: -0.6, z: 0.12 }), P(cyl(0.16, 0.16, 0.02, 10), 0xa07a40, { y: -0.7, z: 0.12 }), P(tor(0.2, 0.02, 4, 12, Math.PI), 0xa07a40, { y: -0.5, z: 0.12 }), P(sph(0.06), 0xf8f0dc, { x: 0.05, y: -0.52, z: 0.12, sy: 1.25 }), P(sph(0.06), 0xf0e0c0, { x: -0.06, y: -0.53, z: 0.16, sy: 1.25 })]); },
  crook() { return merge([P(cyl(0.025, 0.025, 1.8, 5), 0x8a5a30, { y: 0.2 }), P(tor(0.12, 0.025, 4, 10, Math.PI * 1.2), 0x8a5a30, { y: 1.15, x: 0.12 })]); },
  sack() { return merge([P(sph(0.28, 9, 7), 0xd8c49a, { y: -0.2, z: -0.1, sy: 1.3 }), P(cyl(0.06, 0.1, 0.12, 6), 0xc8b48a, { y: 0.17, z: -0.1 })]); },
  scarecrow() {
    const straw = 0xe8c860, shirt = 0xc84838, jeans = 0x4a6a9a;
    const parts = [P(cyl(0.06, 0.07, 2.0, 6), 0x8a6040, { y: 1.0 }), P(cyl(0.3, 0.36, 0.7, 8), shirt, { y: 1.45 }), P(cyl(0.24, 0.3, 0.45, 8), jeans, { y: 0.95 }),
      P(sph(0.27, 10, 8), 0xf0dca0, { y: 2.05 }), ...eyes(0.09, 2.1, 0.23, 0.04), P(tor(0.06, 0.012, 4, 8, Math.PI), 0x3a2a1a, { y: 1.98, z: 0.25, rz: Math.PI }),
      P(cone(0.05, 0.14, 5), 0xf07a1a, { y: 2.03, z: 0.32, rx: Math.PI / 2 })];
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; parts.push(P(cone(0.04, 0.22, 4), straw, { x: Math.cos(a) * 0.3, y: 0.75, z: Math.sin(a) * 0.3, rx: Math.PI + Math.sin(a) * 0.3, rz: Math.cos(a) * 0.3 })); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; parts.push(P(cone(0.04, 0.2, 4), straw, { x: Math.cos(a) * 0.2, y: 1.8, z: Math.sin(a) * 0.2, rx: Math.PI })); }
    return merge(parts);
  },
  scarecrowArm() { return merge([P(cyl(0.09, 0.08, 0.75, 6), 0xc84838, { y: -0.36 }), P(cone(0.08, 0.22, 5), 0xe8c860, { y: -0.82, rx: Math.PI })]); },
};

// Objets
export const PROPS = {
  drift(c) {
    const top = c.top || 0x8ad8ff;
    const parts = [P(sph(1.4, 14, 6, 0, TAU, 0, Math.PI / 2), 0xf6f9ff, { sy: 0.36 }), P(tor(0.85, 0.09, 5, 20), top, { y: 0.4, rx: Math.PI / 2, sy: 1 }),
      P(cyl(0.5, 0.55, 0.04, 14), c.mid || 0xbfeaff, { y: 0.47 })];
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; parts.push(P(sph(0.08), c.dots || 0xff7ab0, { x: Math.cos(a) * 1.15, y: 0.25, z: Math.sin(a) * 1.15 })); }
    return { geo: merge(parts), h: 0.5, r: 1.3 };
  },
  pine() {
    // vrai sapin (branches scannées, neige dessus) quand les textures sont chargées
    if (FOL.hasFir()) return { geo: FOL.firGeometry(7, { height: 3.4, radius: 1.2, levels: 7 }), mat: firMat(), h: 3.3, r: 0.5, shadow: true };
    const parts = [P(cyl(0.12, 0.18, 0.9), 0x5a3a24, { y: 0.45 })];
    for (let i = 0; i < 3; i++) { const r = 1.1 - i * 0.3, h = 1.3 - i * 0.15, y0 = 0.6 + i * 0.8; parts.push(P(cone(r, h, 8), [0x24503a, 0x2a5c40, 0x316848][i], { y: y0 + h / 2 }), P(cone(r * 0.55, h * 0.45, 8), 0xf2f6fc, { y: y0 + h - h * 0.22 + 0.02 })); }
    return { geo: merge(parts), h: 3.3, r: 0.5 };
  },
  pile() {
    return { geo: merge([P(sph(0.7, 9, 6), 0xf2f6fc, { y: 0.1, sy: 0.75 }), P(sph(0.5, 8, 6), 0xeaf0fa, { x: 0.45, y: 0.05, z: 0.2, sy: 0.7 }), P(sph(0.45, 8, 6), 0xf6f9ff, { x: -0.35, y: 0.08, z: -0.3, sy: 0.8 }),
      P(new THREE.OctahedronGeometry(0.09), 0xbfeaff, { x: 0.2, y: 0.62, z: 0.1 }), P(new THREE.OctahedronGeometry(0.07), 0xffffff, { x: -0.3, y: 0.5, z: 0.25 })]), h: 0.7, r: 0.8 };
  },
  iceblock() {
    return { geo: merge([P(box(1.0, 0.9, 1.0), 0x9ad8f4, { y: 0.45, ry: 0.4 }), P(box(1.05, 0.12, 1.05), 0xf4f8ff, { y: 0.93, ry: 0.4 }), P(new THREE.OctahedronGeometry(0.2), 0xd8f4ff, { y: 0.55, z: 0.5, sy: 1.5 })]), h: 1.0, r: 0.7 };
  },
  snowman() {
    return { geo: merge([P(sph(0.55, 10, 8), 0xf6f9ff, { y: 0.5 }), P(sph(0.4, 10, 8), 0xf6f9ff, { y: 1.2 }), P(sph(0.29, 10, 8), 0xf6f9ff, { y: 1.75 }),
      ...eyes(0.1, 1.83, 0.24, 0.04), P(cone(0.05, 0.32, 6), 0xf07a1a, { y: 1.75, z: 0.4, rx: Math.PI / 2 }), P(sph(0.04), 0x1a1a1e, { y: 1.3, z: 0.39 }),
      P(cyl(0.02, 0.03, 0.7, 4), 0x5a3a24, { x: 0.6, y: 1.35, rz: -1.0 }), P(cyl(0.02, 0.03, 0.7, 4), 0x5a3a24, { x: -0.6, y: 1.35, rz: 1.0 })]), h: 2.0, r: 0.6 };
  },
  ball() { return { geo: merge([P(new THREE.IcosahedronGeometry(1, 2), 0xf6f9ff)]), h: 1, r: 1 }; },
  chime() {
    const ice = 0xb8e8ff, parts = [P(cyl(0.09, 0.12, 2.3, 6), ice, { x: 0.9, y: 1.15 }), P(cyl(0.09, 0.12, 2.3, 6), ice, { x: -0.9, y: 1.15 }), P(box(2.1, 0.16, 0.22), 0xf4f8ff, { y: 2.32 })];
    for (let i = 0; i < 5; i++) { const len = 0.55 + (i % 3) * 0.22 + i * 0.05; parts.push(P(cone(0.07, len, 5), [0x9ae0ff, 0xc8b8ff, 0x9affe0, 0xffe09a, 0xffb0d8][i], { x: -0.64 + i * 0.32, y: 2.22 - len / 2, rx: Math.PI })); }
    return { geo: merge(parts), h: 2.4, r: 0.4 };
  },
  chest() {
    return { geo: merge([P(box(1.0, 0.55, 0.7), 0x8a5230, { y: 0.28 }), P(box(1.04, 0.08, 0.74), 0xe8b83a, { y: 0.1 }), P(box(1.04, 0.08, 0.74), 0xe8b83a, { y: 0.48 }), P(box(0.16, 0.2, 0.05), 0xe8c84a, { y: 0.48, z: 0.37 })]), h: 0.6, r: 0.6 };
  },
  lid() { return { geo: merge([P(cyl(0.35, 0.35, 1.0, 8, 1, false, 0, Math.PI), 0x9a6238, { y: 0, z: 0.35, rz: Math.PI / 2 }), P(box(1.04, 0.06, 0.08), 0xe8b83a, { y: 0.2, z: 0.35 })]), h: 0.4, r: 0.6 }; },
  lantern() {
    return { geo: merge([P(cyl(0.05, 0.07, 2.2, 5), 0x2a2a32, { y: 1.1 }), P(box(0.34, 0.4, 0.34), 0xffe0a0, { y: 2.35 }), P(cone(0.3, 0.24, 4), 0x2a2a32, { y: 2.67, ry: Math.PI / 4 }), P(cone(0.28, 0.12, 4), 0xf4f8ff, { y: 2.82, ry: Math.PI / 4 })]), h: 2.9, r: 0.2 };
  },
  button() {
    return { geo: merge([P(cyl(0.6, 0.7, 0.35, 12), 0xf2f6fc, { y: 0.17 }), P(cyl(0.38, 0.42, 0.22, 12), 0xe8403a, { y: 0.42 }), P(cyl(0.2, 0.2, 0.04, 10), 0xffffff, { y: 0.54 })]), h: 0.55, r: 0.6 };
  },
  hole(c) { return { geo: merge([P(cyl(0.55, 0.55, 0.02, 14), c.dark || 0x16303e, { y: 0.03 }), P(tor(0.58, 0.08, 4, 16), c.rim || 0xeef6ff, { y: 0.05, rx: Math.PI / 2, sz: 0.4 })]), h: 0.1, r: 0.6, skin: c.skin }; },
  marker() { return { geo: merge([P(tor(1.15, 0.1, 5, 24), 0xffd23a, { y: 0.08, rx: Math.PI / 2, sz: 0.5 }), P(cyl(1.0, 1.0, 0.03, 20), 0xfff2a8, { y: 0.03 })]), h: 0.1, r: 1.2 }; },
  star() { return { geo: merge([P(new THREE.OctahedronGeometry(0.32), 0xffe24a, { sy: 1.3 })]), h: 0.4, r: 0.3, unlit: true }; },
  coin() { return { geo: merge([P(new THREE.OctahedronGeometry(0.3), 0xff3a4a, { sz: 0.35, sy: 1.25 })]), h: 0.4, r: 0.3, unlit: true }; },
  ring() { return { geo: merge([P(tor(1.25, 0.13, 6, 22), 0xffc830, {})]), h: 2.5, r: 1.3 }; },
  // --- la ferme : meules, bottes, citrouilles, carottes, buissons, arbres fruitiers, épouvantails, ruches, puits,
  // girouettes, cloches, flaques, fleurs, œufs et pommes dorés (chaque objet porte sa matière : paille, bois, pierre…)
  haystack() {
    const s = 0xf0d070, parts = [P(sph(1.35, 16, 8, 0, TAU, 0, Math.PI / 2), s, { sy: 0.78 }), P(cyl(1.32, 1.4, 0.3, 16), 0xe0bc58, { y: 0.1 }),
      P(cone(0.5, 0.55, 10), 0xf4dc80, { y: 1.15 }), P(tor(1.0, 0.05, 4, 20), 0xb08a40, { y: 0.62, rx: Math.PI / 2 })];
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; parts.push(P(cone(0.1, 0.45, 4), 0xf4dc80, { x: Math.cos(a) * 1.35, y: 0.12, z: Math.sin(a) * 1.35, rz: -Math.cos(a) * 1.2, rx: Math.sin(a) * 1.2 })); }
    return { geo: merge(parts), h: 1.1, r: 1.3, skin: 'straw' };
  },
  bale() {
    return { geo: merge([P(box(1.2, 0.6, 0.65), 0xf0d478, { y: 0.3 }), P(box(0.05, 0.62, 0.67), 0x9a7838, { x: 0.32, y: 0.3 }), P(box(0.05, 0.62, 0.67), 0x9a7838, { x: -0.32, y: 0.3 }),
      P(cone(0.08, 0.3, 4), 0xf4dc80, { x: 0.62, y: 0.4, rz: -1.4 }), P(cone(0.08, 0.25, 4), 0xf4dc80, { x: -0.6, y: 0.2, rz: 1.3 })]), h: 0.65, r: 0.7, skin: 'straw' };
  },
  pumpkin() {
    const o = 0xf08a28, parts = [];
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; parts.push(P(sph(0.3, 10, 8), o, { x: Math.cos(a) * 0.16, y: 0.3, z: Math.sin(a) * 0.16, sy: 0.85 })); }
    parts.push(P(sph(0.3, 10, 8), 0xf89a38, { y: 0.32, sy: 0.9 }), P(cyl(0.04, 0.06, 0.18, 5), 0x6a7a30, { y: 0.62, rz: 0.3 }), P(sph(0.15, 6, 4), 0x4a8a30, { x: 0.22, y: 0.5, z: 0.15, sy: 0.15 }));
    return { geo: merge(parts), h: 0.7, r: 0.5, skin: 'pumpkin' };
  },
  carrots() {
    const parts = [P(sph(0.55, 12, 6, 0, TAU, 0, Math.PI / 2), 0x7a5232, { sy: 0.32 })];
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4, r = i ? 0.3 : 0, x = Math.cos(a) * r, z = Math.sin(a) * r;
      parts.push(P(cone(0.06, 0.16, 6), 0xf07a20, { x, y: 0.2, z }));
      for (let k = 0; k < 3; k++) parts.push(P(cone(0.035, 0.38, 4), 0x4a9a34, { x: x + Math.cos(k * 2.1) * 0.04, y: 0.42, z: z + Math.sin(k * 2.1) * 0.04, rx: Math.cos(k * 2.1) * 0.35, rz: Math.sin(k * 2.1) * 0.35 }));
    }
    return { geo: merge(parts), h: 0.6, r: 0.55, skin: 'leaf' };
  },
  fruittree() {
    const parts = [P(cyl(0.16, 0.24, 1.9, 8), 0x7a5a3a, { y: 0.95 }), P(cyl(0.07, 0.1, 0.9, 6), 0x7a5a3a, { x: 0.3, y: 1.9, rz: -0.6 })];
    const g = [0x5aa842, 0x4c9a3a, 0x68b84a];
    for (let i = 0; i < 7; i++) { const a = i * 2.3, r = i ? 0.8 : 0; parts.push(P(sph(0.9 - (i ? 0.25 : 0), 12, 9), g[i % 3], { x: Math.cos(a) * r, y: 2.6 + (i ? Math.sin(i * 1.7) * 0.35 : 0.3), z: Math.sin(a) * r })); }
    for (let i = 0; i < 12; i++) { const a = i * 2.4, e = Math.sin(i * 1.3) * 0.5; parts.push(P(sph(0.1, 8, 6), 0xe0302a, { x: Math.cos(a) * 1.05, y: 2.5 + e, z: Math.sin(a) * 1.05 })); }
    return { geo: merge(parts), h: 3.6, r: 0.4, skin: 'leaf' };
  },
  scarecrow() {
    const straw = 0xf0d070, parts = [P(cyl(0.07, 0.08, 2.5, 6), 0x8a6a48, { y: 1.25 }), P(box(2.2, 0.1, 0.1), 0x8a6a48, { y: 1.7 }),
      P(cyl(0.32, 0.4, 0.8, 8), 0xc84838, { y: 1.45 }), P(box(2.0, 0.24, 0.26), 0xc84838, { y: 1.7 }), P(sph(0.3, 10, 8), 0xf2dca0, { y: 2.2 }),
      ...eyes(0.1, 2.25, 0.26, 0.045), P(cone(0.05, 0.16, 5), 0xf07a1a, { y: 2.18, z: 0.36, rx: Math.PI / 2 })];
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) parts.push(P(cone(0.05, 0.3, 4), straw, { x: s * 1.1, y: 1.66 + (i - 1) * 0.08, z: (i - 1) * 0.08, rz: s * Math.PI / 2 }));
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; parts.push(P(cone(0.05, 0.3, 4), straw, { x: Math.cos(a) * 0.3, y: 0.98, z: Math.sin(a) * 0.3, rx: Math.PI })); }
    return { geo: merge(parts), h: 2.6, r: 0.4, skin: 'cloth' };
  },
  hive() {
    const parts = [P(box(1.0, 0.1, 1.0), 0x8a6a48, { y: 0.55 }), ...[[0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]].map(([x, z]) => P(box(0.1, 0.55, 0.1), 0x7a5a38, { x, y: 0.27, z }))];
    for (let i = 0; i < 5; i++) parts.push(P(tor(0.45 - i * 0.07, 0.12, 6, 16), 0xe8c060, { y: 0.72 + i * 0.17, rx: Math.PI / 2 }));
    parts.push(P(sph(0.2, 8, 6), 0xe8c060, { y: 1.42, sy: 0.6 }), P(box(0.2, 0.12, 0.1), 0x2a1a10, { y: 0.72, z: 0.45 }));
    return { geo: merge(parts), h: 1.5, r: 0.6, skin: 'straw' };
  },
  well() {
    const st = 0xd8d0c4, wd = 0x8a6040, parts = [P(cyl(1.0, 1.08, 0.9, 16, 1, true), st, { y: 0.45 }), P(cyl(0.82, 0.82, 0.9, 16, 1, true), 0xb0a89c, { y: 0.45 }),
      P(tor(0.92, 0.12, 6, 18), st, { y: 0.92, rx: Math.PI / 2 }), P(cyl(0.82, 0.82, 0.04, 16), 0x2a4a5a, { y: 0.3 })];
    for (const s of [-1, 1]) parts.push(P(box(0.14, 2.0, 0.14), wd, { x: s * 0.95, y: 1.6 }));
    parts.push(P(cyl(0.06, 0.06, 2.0, 6), wd, { y: 2.2, rz: Math.PI / 2 }), P(box(2.4, 0.08, 0.95), 0x9a4a32, { y: 2.85, z: 0.38, rx: 0.55 }), P(box(2.4, 0.08, 0.95), 0x9a4a32, { y: 2.85, z: -0.38, rx: -0.55 }),
      P(cyl(0.18, 0.14, 0.26, 8), 0x8a7a68, { y: 1.55 }), P(cyl(0.01, 0.01, 0.6, 3), 0xd8c49a, { y: 1.95 }));
    return { geo: merge(parts), h: 3.1, r: 1.1, skin: 'stone' };
  },
  vane() {
    const k = 0x2a2a30, parts = [P(cyl(0.05, 0.07, 3.2, 6), 0x7a5a3a, { y: 1.6 }), P(cyl(0.025, 0.025, 0.6, 5), k, { y: 3.4 }),
      P(box(1.0, 0.04, 0.04), k, { y: 3.3 }), P(box(0.04, 0.04, 1.0), k, { y: 3.3 }), P(sph(0.06), 0xd8a030, { y: 3.72 })];
    // le coq (vers +z) et la flèche
    parts.push(P(box(0.04, 0.32, 0.5), 0xd8a030, { y: 3.95, z: 0.05 }), P(sph(0.13, 8, 6), 0xd8a030, { y: 4.15, z: 0.25, sx: 0.3 }), P(box(0.03, 0.12, 0.08), 0xd83a2a, { y: 4.3, z: 0.25 }),
      P(box(0.04, 0.4, 0.3), 0xd8a030, { y: 4.05, z: -0.3, rx: 0.4 }), P(box(0.02, 0.02, 1.4), k, { y: 3.72 }), P(cone(0.08, 0.2, 4), k, { y: 3.72, z: 0.75, rx: Math.PI / 2 }));
    return { geo: merge(parts), h: 4.4, r: 0.2, skin: 'wood' };
  },
  cowbell() {
    const wd = 0x8a6040, parts = [P(box(0.12, 2.0, 0.12), wd, { x: 0.65, y: 1.0 }), P(box(0.12, 2.0, 0.12), wd, { x: -0.65, y: 1.0 }), P(box(1.55, 0.14, 0.16), wd, { y: 2.0 }),
      P(cyl(0.16, 0.3, 0.5, 10, 1, true), 0xc8a040, { y: 1.55 }), P(cyl(0.16, 0.16, 0.04, 10), 0xc8a040, { y: 1.8 }), P(sph(0.07, 6, 4), 0x5a4a30, { y: 1.28 }),
      P(box(0.06, 0.12, 0.06), 0xd83a2a, { y: 1.88 }), P(box(0.5, 0.3, 0.04), 0xf4ecd8, { y: 0.55, z: 0.08 })];
    return { geo: merge(parts), h: 2.1, r: 0.4, skin: 'wood' };
  },
  /** Flaque de boue (on la traverse : on en ressort tout crotté). */
  mudpuddle() {
    const parts = [P(cyl(1.4, 1.5, 0.04, 20), 0x6a4a2c, { y: 0.02 }), P(cyl(1.1, 1.1, 0.02, 18), 0x4e3620, { y: 0.045 })];
    for (let i = 0; i < 8; i++) { const a = i * 0.8; parts.push(P(sph(0.18 + (i % 3) * 0.06, 8, 6), 0x5a3c22, { x: Math.cos(a) * 1.45, y: 0.02, z: Math.sin(a) * 1.45, sy: 0.35 })); }
    return { geo: merge(parts), h: 0.1, r: 1.4, skin: 'mud' };
  },
  /** Fleurs des champs (une touffe, à secouer). */
  wildflowers() {
    const parts = [], col = [0xff5a7a, 0xffd23a, 0xffffff, 0x9a7aff, 0xff8a3a];
    for (let i = 0; i < 11; i++) {
      const a = i * 2.4, r = 0.15 + (i % 4) * 0.15, x = Math.cos(a) * r, z = Math.sin(a) * r, h = 0.35 + (i % 3) * 0.12;
      parts.push(P(cyl(0.012, 0.015, h, 4), 0x4a8a30, { x, y: h / 2, z }), P(sph(0.07, 6, 4), col[i % 5], { x, y: h, z, sy: 0.5 }), P(sph(0.03, 5, 3), 0xf0b020, { x, y: h + 0.03, z }));
    }
    for (let i = 0; i < 6; i++) parts.push(P(sph(0.12, 6, 4), 0x5aa040, { x: Math.cos(i) * 0.35, y: 0.06, z: Math.sin(i) * 0.35, sy: 0.35 }));
    return { geo: merge(parts), h: 0.6, r: 0.6, skin: 'leaf' };
  },
  egg(c) { return { geo: merge([P(sph(0.26, 12, 9), c.col || 0xffd84a, { sy: 1.3 }), P(tor(0.25, 0.03, 4, 14), c.band || 0xff6a8a, { rx: Math.PI / 2 })]), h: 0.4, r: 0.3, unlit: true }; },
  apple(c) { return { geo: merge([P(sph(0.26, 12, 9), c.col || 0xffcc30, { sy: 0.92 }), P(cyl(0.02, 0.025, 0.16, 4), 0x6a4a2a, { y: 0.28 }), P(sph(0.09, 6, 4), 0x5ab040, { x: 0.08, y: 0.3, sy: 0.25, sz: 1.8 })]), h: 0.4, r: 0.3, unlit: true }; },
  sparkle() { return { geo: merge([P(new THREE.OctahedronGeometry(0.2), 0xd8f4ff, { sz: 0.4, sy: 1.3 })]), h: 0.3, r: 0.2, unlit: true }; },
  finish() {
    const parts = [P(cyl(0.06, 0.06, 3.0, 5), 0xf4f4f4, { y: 1.5 })];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) parts.push(P(box(0.02, 0.22, 0.22), (i + j) % 2 ? 0x111111 : 0xffffff, { y: 2.75 - j * 0.22, z: 0.12 + i * 0.22 }));
    return { geo: merge(parts), h: 3, r: 0.2 };
  },
};

// ---------------------------------------------------------------------------
// Matières « réelles » (cfg.real) : pelage, plumes, paille, bois, pierre, feuillage, tissu, boue, peau.
// Dessinées une fois sur un canevas (couleur presque blanche + relief) : la couleur des sommets les teinte,
// la carte de relief accroche la lumière. Aucun fichier à charger.
// ---------------------------------------------------------------------------
const SKIN_ROUGH = { fur: 0.95, feather: 0.8, straw: 0.95, wood: 0.85, stone: 0.92, leaf: 0.8, cloth: 0.95, mud: 0.35, skin: 0.6, pumpkin: 0.55 };
const SKIN_REPEAT = { fur: [3, 2], feather: [4, 3], straw: [2, 2], wood: [1, 2], stone: [2, 1], leaf: [3, 2], cloth: [5, 5], mud: [2, 2], skin: [2, 2], pumpkin: [1, 1] };
const skinCache = {};
function strokes(x, y, n, r, w, h, len, ang, spread, lo, lw) {
  for (let i = 0; i < n; i++) {
    const px = r() * w, py = r() * h, l = len[0] + r() * (len[1] - len[0]), a = ang + (r() - 0.5) * spread, v = (lo + r() * (255 - lo)) | 0;
    for (const c of [x, y]) { c.strokeStyle = `rgb(${v},${v},${v})`; c.lineWidth = lw[0] + r() * (lw[1] - lw[0]); c.beginPath(); c.moveTo(px, py); c.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); c.stroke(); }
  }
}
const SKIN_DRAW = {
  fur: (x, y, w, h, r) => { x.fillStyle = '#dedede'; x.fillRect(0, 0, w, h); strokes(x, y, 2600, r, w, h, [3, 7], Math.PI / 2, 0.8, 150, [0.8, 1.6]); },
  feather: (x, y, w, h, r) => {
    x.fillStyle = '#e6e6e6'; x.fillRect(0, 0, w, h);
    for (let j = -1; j < h / 10 + 1; j++) for (let i = -1; i < w / 12 + 1; i++) {
      const cx = i * 12 + (j % 2) * 6, cy = j * 10, v = (205 + r() * 50) | 0;
      for (const c of [x, y]) { const g = c.createRadialGradient(cx, cy, 1, cx, cy, 9); g.addColorStop(0, `rgb(${v},${v},${v})`); g.addColorStop(0.8, `rgb(${v - 40},${v - 40},${v - 40})`); g.addColorStop(1, `rgb(${v - 70},${v - 70},${v - 70})`); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, 8.5, 0, Math.PI); c.fill(); }
    }
  },
  straw: (x, y, w, h, r) => { x.fillStyle = '#e2d8c0'; x.fillRect(0, 0, w, h); y.fillStyle = '#606060'; y.fillRect(0, 0, w, h); strokes(x, y, 1400, r, w, h, [14, 46], 0.2, 0.7, 140, [1, 2.6]); },
  wood: (x, y, w, h, r) => {
    x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, w, h);
    for (let k = 0; k < h; k += 2 + r() * 3) { const v = (150 + r() * 90) | 0, ph = r() * 6; for (const c of [x, y]) { c.strokeStyle = `rgb(${v},${v},${v})`; c.lineWidth = 0.6 + r() * 1.4; c.beginPath(); for (let i = 0; i <= w; i += 8) c.lineTo(i, k + Math.sin(i * 0.05 + ph) * 2.5); c.stroke(); } }
    for (let i = 0; i < 3; i++) { const cx = r() * w, cy = r() * h; for (const c of [x, y]) { c.strokeStyle = 'rgb(120,120,120)'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(cx, cy, 6, 3, 0, 0, TAU); c.stroke(); } }
  },
  stone: (x, y, w, h, r) => {
    x.fillStyle = '#cfcfcf'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const cx = r() * w, cy = r() * h, rr = 8 + r() * 22, v = (150 + r() * 100) | 0;
      for (const c of [x, y]) { const g = c.createRadialGradient(cx, cy, 1, cx, cy, rr); g.addColorStop(0, `rgba(${v},${v},${v},0.9)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`); c.fillStyle = g; c.fillRect(cx - rr, cy - rr, rr * 2, rr * 2); }
    }
    // joints entre les pierres
    for (let j = 0; j < h; j += 16) for (let i = (j / 16) % 2 * 14; i < w; i += 28) for (const c of [x, y]) { c.strokeStyle = 'rgb(110,110,110)'; c.lineWidth = 1.5; c.strokeRect(i, j, 28, 16); }
  },
  leaf: (x, y, w, h, r) => {
    x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const cx = r() * w, cy = r() * h, a = r() * TAU, v = (130 + r() * 125) | 0;
      for (const c of [x, y]) { c.fillStyle = `rgb(${v},${v},${v})`; c.beginPath(); c.ellipse(cx, cy, 4 + r() * 3, 2 + r() * 1.5, a, 0, TAU); c.fill(); }
    }
  },
  cloth: (x, y, w, h, r) => {
    x.fillStyle = '#e0e0e0'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 2) for (const c of [x, y]) { c.fillStyle = i % 4 ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.16)'; c.fillRect(i, 0, 1, h); c.fillRect(0, i, w, 1); }
    for (let i = 0; i < 400; i++) { const v = (180 + r() * 75) | 0; x.fillStyle = `rgba(${v},${v},${v},0.5)`; x.fillRect(r() * w, r() * h, 2, 2); }
  },
  mud: (x, y, w, h, r) => {
    x.fillStyle = '#c8c8c8'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const cx = r() * w, cy = r() * h, rr = 4 + r() * 18, v = (120 + r() * 135) | 0; for (const c of [x, y]) { c.fillStyle = `rgba(${v},${v},${v},0.55)`; c.beginPath(); c.ellipse(cx, cy, rr, rr * (0.5 + r() * 0.5), r() * 3, 0, TAU); c.fill(); } }
  },
  skin: (x, y, w, h, r) => { x.fillStyle = '#e8e8e8'; x.fillRect(0, 0, w, h); for (let i = 0; i < 1600; i++) { const v = (190 + r() * 65) | 0; for (const c of [x, y]) { c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); } } },
  pumpkin: (x, y, w, h, r) => {
    for (let i = 0; i < w; i++) { const k = Math.abs(Math.sin(i / w * Math.PI * 8)), v = (150 + k * 105) | 0; for (const c of [x, y]) { c.fillStyle = `rgb(${v},${v},${v})`; c.fillRect(i, 0, 1, h); } }
    for (let i = 0; i < 500; i++) { x.fillStyle = 'rgba(255,240,200,0.25)'; x.fillRect(r() * w, r() * h, 2, 1); }
  },
};
export function skinTexture(name) {
  if (skinCache[name]) return skinCache[name];
  const sz = name === 'cloth' || name === 'feather' ? 128 : 256;
  const t = RT.realTex(sz, sz, 7 + name.length * 13, SKIN_DRAW[name] || SKIN_DRAW.skin, { strength: name === 'stone' || name === 'straw' ? 4 : 2.5 });
  const rp = SKIN_REPEAT[name] || [2, 2];
  for (const k of ['map', 'normalMap']) t[k].repeat.set(rp[0], rp[1]);
  return (skinCache[name] = t);
}
// les modèles du kit (parc, jardins, mares…) s'ajoutent à ceux de la neige
for (const k in KIT.MODELS) if (!MODELS[k]) MODELS[k] = KIT.MODELS[k];
for (const k in KIT.PROPS) if (!PROPS[k]) PROPS[k] = KIT.PROPS[k];
for (const k in KIT.TOOLS) if (!VILLAGER[k]) VILLAGER[k] = KIT.TOOLS[k];

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Un maillage instancié qu'on remplit à chaque image (seulement les objets visibles). */
const WHITE = new THREE.Color(1, 1, 1);
class Layer {
  constructor(scene, geo, material, max, tint) {
    this.mesh = new THREE.InstancedMesh(geo, material, Math.max(1, max));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.userData.noOutline = true;
    this.mesh.count = 0; this.mesh.visible = false;
    this.max = Math.max(1, max); this.n = 0; this.tint = !!tint;
    if (tint) { const w = new THREE.Color(1, 1, 1); for (let i = 0; i < this.max; i++) this.mesh.setColorAt(i, w); }
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  push(m, color) {
    if (this.n >= this.max) return;
    this.mesh.setMatrixAt(this.n, m);
    if (this.tint) this.mesh.setColorAt(this.n, color || WHITE);
    this.n++;
  }
  end() {
    this.mesh.count = this.n; this.mesh.visible = this.n > 0;
    if (this.n) { this.mesh.instanceMatrix.needsUpdate = true; if (this.tint) this.mesh.instanceColor.needsUpdate = true; }
  }
}

// ===========================================================================
// La couche de vie
// ===========================================================================
/**
 * cfg = {
 *   L,                 // les données du niveau (heightAt, iceAt, blockedAt, addColliders…)
 *   plan,              // lifeplan.planLife(…)
 *   palette: { fauna: { kind: { model, colors, ai, … } }, props: { kind: { model, act, … } } },
 *   lines: { villagerId: { who, talk: [[{who, text}]], ask, thanks } },
 *   hooks: { onDefiDone(def), onSwitch(def), onChest(def) },
 *   ground(x, z), view, active
 * }
 */
export function buildLife(game, cfg) {
  const L = cfg.L, plan = cfg.plan, pal = cfg.palette, lines = cfg.lines || {}, hooks = cfg.hooks || {};
  const sc = game.scene, lite = game.lite;
  const ground = cfg.ground || ((x, z) => L.heightAt(x, z));
  const VIEW = cfg.view || (lite ? 95 : 140), ACTIVE = cfg.active || (lite ? 60 : 85);
  const sv = () => { const s = game.save; if (!s.life) s.life = {}; const k = s.life; if (!k.defis) k.defis = []; if (!k.chests) k.chests = []; if (!k.gone) k.gone = {}; if (!k.talk) k.talk = {}; return k; };
  const sfx = () => (game.sfx && game.sfx.ok ? game.sfx : null);
  const R = Math.random;

  // surface (eau comprise) et eau : par défaut, le sol et pas d'eau
  const surface = cfg.surface || ground;
  const isWater = cfg.isWater || (() => false);
  // --- matériaux et couches -----------------------------------------------------------------
  // (cfg.grain : un léger grain sur les couleurs, plus de surfaces lisses « plastique »)
  const litMat = cfg.grain ? KIT.grainMaterial() : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  const unlitMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const wingMat = cfg.grain ? KIT.grainMaterial({ side: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshBasicMaterial({ map: M.glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), color: 0x0a1a28, transparent: true, opacity: 0.26, depthWrite: false });
  const real = !!cfg.real, skinMats = {};
  /** La matière « réelle » d'un modèle (cfg.real), sinon null (couleurs des sommets seules, comme avant). */
  const skinMat = (name, side) => {
    if (!real || !name || typeof document === 'undefined') return null;
    const k = name + (side ? ':2' : '');
    if (!skinMats[k]) {
      const t = skinTexture(name);
      const m = new THREE.MeshStandardMaterial({ vertexColors: true, map: t.map, normalMap: lite ? null : t.normalMap, roughness: SKIN_ROUGH[name] || 0.85, side: side ? THREE.DoubleSide : THREE.FrontSide });
      m.color.setScalar(name === 'leaf' ? 1.35 : 1.18);   // la matière est un peu plus sombre que le blanc : on compense
      if (m.normalMap) m.normalScale = new THREE.Vector2(0.7, 0.7);
      skinMats[k] = m;
    }
    return skinMats[k];
  };
  const layers = new Map();
  const layer = (name, geo, mat, max, tint) => { if (!layers.has(name)) layers.set(name, new Layer(sc, geo, mat, max, tint)); return layers.get(name); };
  const quad = new THREE.PlaneGeometry(1, 1);
  const glowL = layer('glow', quad, glowMat, 260, true);
  const shadowGeo = new THREE.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
  const shadowL = layer('shadow', shadowGeo, shadowMat, 260, false);
  shadowL.mesh.renderOrder = 1;

  // modèles de bêtes (une couche par sorte, une pour les ailes)
  const faunaModel = {};
  const countKind = (list, k) => list.filter(e => e.kind === k).reduce((a, e) => a + (e.n || (pal.fauna[k] && pal.fauna[k].group) || 1), 0);
  const defiCritters = {};
  for (const d of plan.defis) { const c = d.critter || (d.type === 'whack' ? 'marmot' : d.type === 'fish' ? 'fish' : null); if (c) defiCritters[c] = (defiCritters[c] || 0) + (d.chicks ? d.chicks.length : d.spots ? d.spots.length : d.holes ? d.holes.length : 1) + 2; }
  // les compagnons des promeneurs (un chien en laisse…) et les habitants-bêtes
  for (const e of plan.fauna) { const f = pal.fauna[e.kind]; if (f && f.line && f.young) defiCritters[f.young] = (defiCritters[f.young] || 0) + (e.n || f.group || 1) - 1; }
  for (const v of plan.villagers) { if (v.pet) defiCritters[v.pet.kind] = (defiCritters[v.pet.kind] || 0) + 1; if (v.body === 'critter' && v.model) defiCritters[v.model] = (defiCritters[v.model] || 0) + 1; }
  for (const k in pal.fauna) {
    const f = pal.fauna[k], mdl = MODELS[f.model](f.colors || {});
    const n = countKind(plan.fauna, k) + (defiCritters[k] || 0) + (f.extra || 0);
    faunaModel[k] = { f, mdl, body: layer('f_' + k, mdl.body, mdl.unlit ? unlitMat : skinMat(f.skin || mdl.skin) || litMat, n + 2, !!mdl.tint),
      flap: mdl.flap ? layer('w_' + k, mdl.flap, (mdl.skin === 'feather' && skinMat('feather', true)) || wingMat, (n + 2) * 2, !!mdl.flapTint) : null };
  }
  const propModel = {};
  const propCount = {};
  for (const p of plan.props) propCount[p.kind] = (propCount[p.kind] || 0) + 1;
  const propKinds = new Set([...Object.keys(propCount), 'marker', 'star', 'coin', 'ring', 'sparkle', 'chest', 'lid', 'hole', 'finish']);
  const extraProp = { marker: plan.defis.length, star: plan.defis.length, coin: 12, ring: 12, sparkle: 0, chest: plan.secrets.length, lid: plan.secrets.length, hole: 0, finish: 2 };
  for (const t of plan.trails) extraProp.sparkle += t.pts.length;
  extraProp.sparkle += 40;   // paillettes qui tombent des sapins, des coffres…
  const holeKind = (f) => (typeof f.hole === 'string' ? f.hole : 'hole');
  const addExtra = (k, n) => { propKinds.add(k); extraProp[k] = (extraProp[k] || 0) + n; };
  for (const e of plan.fauna) { const f = pal.fauna[e.kind]; if (f && f.hole) addExtra(holeKind(f), 1); }
  for (const d of plan.defis) {
    if (d.holes) addExtra(d.hole || 'hole', d.holes.length);
    // objets d'un défi : ballons, bulles, frisbees… à la place des pièces rouges ou des petits perdus
    if (d.item) addExtra(d.item, (d.items || d.chicks || []).length + 1);
    if (d.jack) addExtra(d.jack, 1);
  }
  for (const k of propKinds) {
    const pk = pal.props[k] || {};
    const mdl = PROPS[pk.model || k](pk.colors || {});
    const n = (propCount[k] || 0) + (extraProp[k] || 0);
    propModel[k] = { pk, mdl, l: layer('p_' + k, mdl.geo, mdl.mat || (mdl.unlit ? unlitMat : skinMat(pk.skin || mdl.skin) || litMat), n + 2, k === 'hat' || !!pk.tint) };
    if (mdl.shadow) propModel[k].l.mesh.castShadow = true;
  }
  // chapeaux des bonshommes (teintés)
  let hatN = 6; for (const k in propCount) if (k === 'snowman' || (pal.props[k] && pal.props[k].hatY)) hatN += propCount[k];
  const hatL = layer('p_hat', VILLAGER.hat(), skinMat('cloth') || litMat, hatN, true);
  // habitants
  const nVill = Math.max(24, plan.villagers.length + 4);
  const vill = { body: layer('v_dog', VILLAGER.dog(), skinMat('fur') || litMat, nVill, true), cloth: layer('v_cloth', VILLAGER.dogCloth(), skinMat('cloth') || litMat, nVill, true), arm: layer('v_arm', VILLAGER.arm(), skinMat('cloth') || litMat, nVill * 2, true),
    scare: layer('v_scare', VILLAGER.scarecrow(), skinMat('cloth') || litMat, 3, false), scareArm: layer('v_scarearm', VILLAGER.scarecrowArm(), skinMat('cloth') || litMat, 6, false),
    snow: layer('v_snow', VILLAGER.snowman(), litMat, 3, false), snowArm: layer('v_snowarm', VILLAGER.snowArm(), litMat, 6, false), yeti: layer('v_yeti', VILLAGER.yeti(), litMat, 2, false), yetiArm: layer('v_yetiarm', VILLAGER.yetiArm(), litMat, 4, false) };
  const tools = {};
  for (const v of plan.villagers) if (v.tool && !tools[v.tool]) tools[v.tool] = layer('t_' + v.tool, VILLAGER[v.tool](), skinMat('wood') || litMat, plan.villagers.filter(q => q.tool === v.tool).length + 1, false);

  // --- entités -------------------------------------------------------------------------------
  const C = new THREE.Color();
  const creatures = [];
  for (const def of plan.fauna) {
    const fm = faunaModel[def.kind]; if (!fm) continue;
    const f = fm.f, n = def.n || f.group || 1;
    const flock = { def, cx: def.x, cz: def.z, t: 0, up: false, members: [] };
    for (let i = 0; i < n; i++) {
      // (une file : la maman devant, les petits derrière, en rang)
      const a = (i / n) * TAU + (def.rot || 0), rr = f.line ? i * (f.gap || 0.8) : n > 1 ? 1 + (i % 3) * 0.9 : 0;
      const x = def.x + (f.line ? -Math.sin(def.rot || 0) * rr : Math.cos(a) * rr), z = def.z + (f.line ? -Math.cos(def.rot || 0) * rr : Math.sin(a) * rr);
      const lineF = f.line && i > 0 ? (pal.fauna[f.young] || f) : f, lineM = f.line && i > 0 && f.young && faunaModel[f.young] ? faunaModel[f.young] : fm;
      const c = { def, kind: def.kind, fm: lineM, f, ff: lineF, flock: n > 1 ? flock : null, i, hx: def.x, hz: def.z, x, z, y: def.perch !== undefined ? def.perch : f.water ? surface(x, z) : ground(x, z), yaw: f.line ? (def.rot || 0) : a + 1.6, s: 'idle', t: R() * 3, ph: R() * 10,
        hop: 0, vy: 0, fly: 0, tint: f.tints ? f.tints[(i + Math.round(def.x)) % f.tints.length] : null, scale: (lineM === fm ? (f.scale || 1) : (lineF.scale || 1)) * (0.9 + ((i * 7 + Math.round(def.z)) % 5) * 0.05), petT: -9, followT: 0, under: f.ai === 'burrow' ? 1 : 0 };
      creatures.push(c); flock.members.push(c);
    }
  }
  const cGrid = new PointGrid(16);
  for (const c of creatures) cGrid.add({ x: c.hx, z: c.hz, c });
  const isPush = (k) => (pal.props[k] || {}).act === 'push';
  const r0 = (k) => (isPush(k) ? (pal.props[k].r0 || 0.5) : 0);
  const props = plan.props.map((def, i) => ({ def, i, kind: def.kind, x: def.x, y: def.y, z: def.z, yaw: def.rot || 0, wob: -9, sq: -9, broken: 0, ring: -9, r: r0(def.kind), r0: r0(def.kind), rot: 0, bx: def.x, bz: def.z, on: false }));
  const propById = new Map(props.map(p => [p.def.id, p]));
  const pushers = props.filter(p => p.r0);
  const pGrid = new PointGrid(16);
  for (const p of props) pGrid.add({ x: p.def.x, z: p.def.z, p });
  const villagers = plan.villagers.map((def, i) => ({ def, i, x: def.x, y: def.y, z: def.z, yaw: def.yaw || 0, ph: i * 1.7, awake: !def.sleepy, wave: -9, run: null, s: def.phase || 0, loop: def.loop ? loopOf(def.loop) : null, hold: -9 }));
  /** Un circuit fermé (promeneurs, joggeurs) : longueurs cumulées. */
  function loopOf(pts) {
    const cum = [0];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    return { pts, cum, total: cum[pts.length] };
  }
  function loopAt(lp, s) {
    s = ((s % lp.total) + lp.total) % lp.total;
    let i = 0; while (i < lp.pts.length - 1 && lp.cum[i + 1] < s) i++;
    const a = lp.pts[i], b = lp.pts[(i + 1) % lp.pts.length], l = lp.cum[i + 1] - lp.cum[i] || 1, k = (s - lp.cum[i]) / l;
    return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  }
  const villById = new Map(villagers.map(v => [v.def.id, v]));
  const defis = plan.defis.map((def, i) => ({ def, i }));
  const chests = plan.secrets.map((def, i) => ({ def, i, open: -9 }));
  const sparkles = [];
  for (const t of plan.trails) t.pts.forEach((p, i) => sparkles.push({ id: `${t.id}_${i}`, trail: t, x: p.x, y: p.y, z: p.z, k: i }));
  const sGrid = new PointGrid(16);
  for (const s of sparkles) sGrid.add({ x: s.x, z: s.z, s });
  // obstacles des objets solides (sapins, bonshommes, habitants immobiles, coffres)
  if (L.addColliders) {
    const cols = [];
    for (const p of props) { const pk = pal.props[p.kind] || {}; if (pk.solid) cols.push({ type: 'cyl', x: p.x, z: p.z, r: pk.solid, y0: p.y - 1, y1: p.y + (propModel[p.kind].mdl.h || 1), kind: 'rock', life: p.def.id }); }
    for (const v of villagers) if (!v.def.moves) cols.push({ type: 'cyl', x: v.x, z: v.z, r: v.def.body === 'yeti' ? 1.0 : 0.45, y0: v.y - 1, y1: v.y + (v.def.body === 'yeti' ? 3 : 1.7), kind: 'rock', life: v.def.id });
    for (const c of chests) cols.push({ type: 'box', x: c.def.x, z: c.def.z, w: 1.0, d: 0.7, y0: c.def.y - 1, y1: c.def.y + 0.6, kind: 'rock', life: c.def.id });
    L.addColliders(cols);
  }

  // --- état partagé (l'hôte décide, les amis suivent) -------------------------------------------
  const st = { D: null, drops: [], floats: [], ev: [], seq: 0, seen: 0, near: { c: [], p: [], v: [], s: [] }, nearT: 0, barkSeen: new Map(), hudT: 0, wasDone: null };
  const event = (type, a, b) => { st.ev.push([++st.seq, type, a, b === undefined ? 0 : b]); if (st.ev.length > 16) st.ev.shift(); playEvent(type, a, b); };
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  function note(midi, inst, vol) { const s = sfx(); if (s) s.note(inst || 'bell', midi, vol || 0.12, 0, 0.5); }
  function chirp(kind) {
    const s = sfx(); if (!s) return;
    if (kind === 'chirp') { s.tone(2600 + R() * 600, 0.06, { type: 'sine', to: 3400, vol: 0.035 }); s.tone(2900, 0.05, { type: 'sine', to: 3800, vol: 0.03, delay: 0.08 }); }
    else if (kind === 'squeak') s.tone(1300 + R() * 300, 0.08, { type: 'triangle', to: 1900, vol: 0.05 });
    else if (kind === 'hoot') { s.tone(430, 0.22, { type: 'sine', to: 390, vol: 0.08 }); s.tone(400, 0.3, { type: 'sine', to: 360, vol: 0.07, delay: 0.32 }); }
    else if (kind === 'honk') s.tone(520, 0.12, { type: 'square', to: 430, vol: 0.04 });
    else if (kind === 'whistle') s.tone(2300, 0.2, { type: 'sine', to: 2700, vol: 0.05 });
    else if (kind === 'grunt') s.tone(150, 0.25, { type: 'sawtooth', to: 110, vol: 0.05 });
    else if (kind === 'ting') s.note('bell', 96 + Math.floor(R() * 5), 0.06, 0, 0.3);
    else if (kind === 'splash') s.noise(0.2, { filter: 'bandpass', freq: 1400, freqTo: 400, vol: 0.12 });
    else if (kind === 'yip') s.tone(900, 0.06, { type: 'sawtooth', to: 1300, vol: 0.06 });
    else if (kind === 'quack') { s.tone(620, 0.09, { type: 'sawtooth', to: 430, vol: 0.04 }); s.tone(600, 0.09, { type: 'sawtooth', to: 420, vol: 0.035, delay: 0.14 }); }
    else if (kind === 'peep') { s.tone(2400, 0.05, { type: 'sine', to: 2900, vol: 0.03 }); s.tone(2500, 0.05, { type: 'sine', to: 3000, vol: 0.03, delay: 0.09 }); }
    else if (kind === 'croak') { s.tone(180, 0.09, { type: 'square', to: 140, vol: 0.05 }); s.tone(170, 0.12, { type: 'square', to: 120, vol: 0.05, delay: 0.13 }); }
    else if (kind === 'coo') { s.tone(520, 0.18, { type: 'sine', to: 440, vol: 0.05 }); s.tone(480, 0.25, { type: 'sine', to: 420, vol: 0.04, delay: 0.22 }); }
    else if (kind === 'woof') { s.tone(330, 0.09, { type: 'sawtooth', to: 220, vol: 0.06 }); s.tone(320, 0.1, { type: 'sawtooth', to: 210, vol: 0.05, delay: 0.16 }); }
    else if (kind === 'sniff') s.noise(0.12, { filter: 'bandpass', freq: 2200, vol: 0.05 });
    else if (kind === 'cluck') { s.tone(880, 0.05, { type: 'square', to: 640, vol: 0.035 }); s.tone(980, 0.05, { type: 'square', to: 700, vol: 0.035, delay: 0.11 }); s.tone(1200, 0.08, { type: 'square', to: 760, vol: 0.03, delay: 0.23 }); }
    else if (kind === 'bleat') { const f = 420 + R() * 80; for (let i = 0; i < 5; i++) s.tone(f + (i % 2) * 30, 0.07, { type: 'sawtooth', to: f - 25, vol: 0.04, delay: i * 0.06 }); }
    else if (kind === 'bray') { s.tone(520, 0.35, { type: 'sawtooth', to: 760, vol: 0.05 }); s.tone(300, 0.45, { type: 'sawtooth', to: 220, vol: 0.06, delay: 0.38 }); }
    else if (kind === 'oink') { s.noise(0.14, { filter: 'bandpass', freq: 560, freqTo: 320, vol: 0.18 }); s.tone(240, 0.12, { type: 'square', to: 170, vol: 0.045 }); }
    else if (kind === 'meow') s.tone(700, 0.35, { type: 'triangle', to: 520, vol: 0.05 });
    else if (kind === 'buzz') s.tone(220, 0.4, { type: 'sawtooth', to: 240, vol: 0.02 });
    else if (kind === 'caw') { s.tone(380, 0.16, { type: 'sawtooth', to: 300, vol: 0.05 }); s.tone(370, 0.16, { type: 'sawtooth', to: 290, vol: 0.045, delay: 0.22 }); }
  }
  /** Rejoue un effet (chez l'hôte tout de suite, chez les amis à la réception). */
  function playEvent(type, a, b) {
    const p = props[a];
    if (type === 'pad') { if (p) p.sq = game.t; chirp('ting'); note(72 + PENTA[b % PENTA.length], 'mallet', 0.1); }
    else if (type === 'wob') { if (p) p.wob = game.t; }
    else if (type === 'ring') { if (p) p.ring = game.t; note((p && p.def.note) || 79, 'bell', 0.14); }
    else if (type === 'note') note(a, 'bell', 0.12);
    else if (type === 'chest') { const c = chests[a]; if (c) c.open = game.t; }
    else if (type === 'splash') {
      if (p) { p.sq = game.t; const col = (pal.props[p.kind] || {}).color || 0xbfe4ff; for (let i = 0; i < 14; i++) { const an = R() * TAU, sp = 1.5 + R() * 2.5; game.spawnParticle(p.x, p.y + 0.2, p.z, Math.cos(an) * sp, 3 + R() * 3, Math.sin(an) * sp, col, 0.12 + R() * 0.08, 0.7, 12); } }
      game.sound('splash'); chirp('splash');
    }
    else if (type === 'press') { if (p) { p.sq = game.t; p.on = !!b; } }
    else if (type === 'wave') { const v = villagers[a]; if (v) v.wave = game.t; }
    else if (type === 'chirp') chirp(CHIRPS[a] || 'ting');
    else if (type === 'spin') { if (p) p.spin0 = game.t; }
  }
  const CHIRPS = ['chirp', 'squeak', 'hoot', 'honk', 'whistle', 'grunt', 'ting', 'splash', 'yip', 'quack', 'peep', 'croak', 'coo', 'woof', 'sniff', 'cluck', 'bleat', 'bray', 'oink', 'meow', 'buzz', 'caw'];

  // --- paillettes (récompenses qui tombent, traînées) -------------------------------------------
  function gone(id) { const g = sv().gone[id]; if (!g) return false; if (Date.now() - g > REGROW_MS) { delete sv().gone[id]; return false; } return true; }
  function dropSparkles(x, y, z, n, value) {
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, sp = 1.5 + R() * 2;
      st.drops.push({ x, y: y + 0.3, z, vx: Math.cos(a) * sp, vy: 5 + R() * 3, vz: Math.sin(a) * sp, t: 0, v: value || 1 });
    }
    if (st.drops.length > 40) st.drops.splice(0, st.drops.length - 40);
  }
  /** Bulles de savon (machine à bulles, enfant qui souffle) : elles montent, dérivent, éclatent si on les touche. */
  function addFloat(x, y, z, vx, vz) {
    st.floats.push({ x, y, z, vx: vx || 0, vz: vz || 0, t: 0, life: 5 + R() * 3, s: 0.35 + R() * 0.45, ph: R() * TAU });
    if (st.floats.length > (lite ? 24 : 48)) st.floats.shift();
  }
  function gain(P, n, x, y, z) {
    P.score = (P.score || 0) + n;
    P.lifeChain = game.t - (P.lifeAt || -9) < 0.8 ? (P.lifeChain || 0) + 1 : 0; P.lifeAt = game.t;
    game.sound('bone', Math.min(9, P.lifeChain));
    game.burst(x, y, z, 5, 0xd8f4ff, 2.2, 0.35);
  }
  function stepDrops(dt) {
    st.drops = st.drops.filter((d) => {
      d.t += dt;
      const g = ground(d.x, d.z) + 0.35;
      // aimantées vers le chien le plus proche
      const P = game.nearestPlayer(d);
      const dx = P.pos.x - d.x, dy = P.pos.y + 0.7 - d.y, dz = P.pos.z - d.z, dd = Math.hypot(dx, dy, dz);
      if (d.t > 0.45 && dd < 3.2) { const k = Math.min(1, dt * 9); d.x += dx * k; d.y += dy * k; d.z += dz * k; }
      else { d.vy -= 18 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; if (d.y < g) { d.y = g; d.vy = Math.abs(d.vy) * 0.35; d.vx *= 0.6; d.vz *= 0.6; } }
      if (d.t > 0.3 && dd < 1.1) { gain(P, d.v, d.x, d.y, d.z); return false; }
      return d.t < 25;
    });
  }

  // --- défis éclair -----------------------------------------------------------------------------
  const defiDone = (id) => sv().defis.includes(id);
  const KIND_NAMES = { hits: 'Touche-tout', goal: 'Dans le rond', coins: 'Les pièces rouges', rings: 'Les anneaux', race: 'La course', chase: 'Attrape-le !', pads: 'Les trampolines', whack: 'Tape-taupe', fish: 'La pêche', tag: 'Chat perché', xylo: 'La mélodie de glace', herd: 'Les petits perdus', scare: 'Ouste !' };
  function defiTime(d) { return game.easy ? Infinity : (d.time || 45); }
  function startDefi(def, P) {
    if (st.D) return;
    const D = { def, id: def.id, t: defiTime(def), cd: def.type === 'race' ? 3 : 0, got: [], i: 0, who: P.id || 0, crit: [], phase: 'play', seqT: 0, seq: [], k: 0, last: 0 };
    if (def.type === 'race') { const p = def.path[0]; D.crit = [{ x: p[0], z: p[1], y: ground(p[0], p[1]), yaw: 0, s: 0, a: 0 }]; }
    if (def.type === 'chase') { const a = R() * TAU; D.crit = [{ x: def.x + Math.cos(a) * 6, z: def.z + Math.sin(a) * 6, y: 0, yaw: 0, a: 0 }]; }
    if (def.type === 'tag') D.crit = def.kids.map((id) => { const v = villById.get(id); return { x: v.x, z: v.z, y: v.y, yaw: 0, a: 0, id, tagged: false }; });
    if (def.type === 'herd') D.crit = def.chicks.map((ch) => {
      // [x, z] ou { x, z, y, stuck } (coincé dans un objet tant qu'on ne l'a pas secoué)
      const o = Array.isArray(ch) ? { x: ch[0], z: ch[1] } : ch;
      return { x: o.x, z: o.z, y: o.stuck ? o.y : ground(o.x, o.z), yaw: R() * TAU, a: 0, st: o.stuck ? 'stuck' : 'lost', stuck: o.stuck, who: -1 };
    });
    if (def.type === 'whack' || def.type === 'fish') {
      D.crit = def.holes.map(([x, z]) => ({ x, z, y: def.type === 'fish' ? surface(x, z) : ground(x, z), up: 0, t: 0, yaw: R() * TAU, hit: 0 }));
      D.next = 1;
    }
    if (def.type === 'goal') for (const id of def.balls) { const b = propById.get(id); if (b) { b.keep = true; if (Math.hypot(b.x - def.pen.x, b.z - def.pen.z) < def.pen.r) { b.x = b.bx; b.z = b.bz; b.y = ground(b.x, b.z); } b.vx = b.vz = 0; } }
    if (def.type === 'scare') D.crit = def.spots.map(([x, z]) => ({ x, z, y: ground(x, z), yaw: R() * TAU, a: R() * 6, st: 'sit', t: 0 }));
    if (def.type === 'xylo') { D.phase = 'show'; D.seq = def.seq.slice(); D.seqT = -0.8; D.k = 0; }
    st.D = D;
    const easyNote = game.easy ? ' (Promenade : pas de chrono)' : '';
    game.banner('⚡ Défi éclair : ' + def.name, (def.hint || '') + easyNote, 3200);
    game.sound('switch');
    if (P.cheerT !== undefined) P.cheerT = 0.6;
  }
  function endDefi(win) {
    const D = st.D; if (!D) return;
    st.D = null;
    const def = D.def, P = game.party.get(D.who) || game.player;
    if (!win) { game.banner('Temps écoulé !', 'Le défi « ' + def.name + ' » attend au signal doré : on réessaie ?', 2800); game.sound('bump'); return; }
    const k = sv(), first = !k.defis.includes(def.id);
    if (first) k.defis.push(def.id);
    const sec = Math.round(((def.time || 45) - (D.t === Infinity ? 0 : D.t)) * 10) / 10;
    if (D.t !== Infinity && (!k.best || !k.best[def.id] || sec < k.best[def.id])) { k.best = k.best || {}; k.best[def.id] = sec; }
    game.persist();
    game.sound('win'); P.cheerT = 1.4;
    for (let i = 0; i < 3; i++) game.burst(P.pos.x + (i - 1), P.pos.y + 2.4, P.pos.z, 14, [0xff5a6a, 0xffd23a, 0x5ac8ff][i], 4.5, 0.8);
    dropSparkles(P.pos.x, P.pos.y + 1.2, P.pos.z, first ? 10 : 4, 1);
    if (first && P.hearts !== undefined) game.spawnHeart(P.pos.x + Math.sin(P.yaw) * 1.5, P.pos.y + 1, P.pos.z + Math.cos(P.yaw) * 1.5);
    const n = k.defis.length, tot = plan.defis.length;
    if (first && n === tot) game.banner('TOUS LES DÉFIS ÉCLAIR !', cfg.allDoneText || 'Champions des défis : bravo !', 4200);
    else game.banner(first ? 'Défi réussi ! ' + n + '/' + tot : 'Encore réussi !', def.name + (D.t !== Infinity ? ' en ' + String(sec).replace('.', ',') + ' s' : ''), 3000);
    if (hooks.onDefiDone) hooks.onDefiDone(def, first);
  }
  const hit = (P, x, y, z, r) => (P.pos.x - x) ** 2 + (P.pos.y + 0.6 - y) ** 2 + (P.pos.z - z) ** 2 < r * r;
  const attacking = (P) => P.attackT > 0 || P.dashT > 0;
  function stepDefi(dt) {
    const D = st.D; if (!D) return;
    const def = D.def, players = game.players;
    if (D.cd > 0) { D.cd -= dt; const c = Math.ceil(D.cd); if (c !== D.last && c > 0) { D.last = c; game.banner(c + '…', '', 700); game.sound('switch'); } if (D.cd <= 0) { game.banner('Partez !', '', 900); game.sound('reveal'); } return; }
    if (D.t !== Infinity) D.t -= dt;
    if (D.t <= 0 || players.every(P => Math.hypot(P.pos.x - def.x, P.pos.z - def.z) > (def.leave || 90))) { endDefi(false); return; }
    const T = def.type;
    if (T === 'coins') {
      def.items.forEach((it, i) => {
        if (D.got.includes(i)) return;
        for (const P of players) if (hit(P, it.x, it.y, it.z, 1.6)) { D.got.push(i); P.lifeChain = D.got.length - 1; P.lifeAt = game.t; game.sound('bone', D.got.length); game.burst(it.x, it.y, it.z, 12, 0xff4a5a, 3.5, 0.5); game.localBanner(`${D.got.length}/${def.items.length}`, '', 700); break; }
      });
      if (D.got.length >= def.items.length) endDefi(true);
    } else if (T === 'rings') {
      const r = def.rings[D.i];
      for (const P of players) if (hit(P, r.x, r.y, r.z, 1.9)) { D.i++; game.sound('cp'); game.burst(r.x, r.y, r.z, 16, 0xffd23a, 4, 0.5); note(76 + PENTA[D.i % PENTA.length], 'bell'); break; }
      if (D.i >= def.rings.length) endDefi(true);
    } else if (T === 'pads') {
      if (D.got.length >= def.pads.length) endDefi(true);
    } else if (T === 'hits') {
      if (D.got.length >= def.props.length) endDefi(true);
    } else if (T === 'goal') {
      // pousser (ou lancer d'un coup de toupie) les boules dans le rond, près du but
      const pen = def.pen;
      const inn = def.balls.filter(id => { const b = propById.get(id); return b && Math.hypot(b.x - pen.x, b.z - pen.z) < pen.r; });
      for (const id of inn) if (!D.got.includes(id)) { D.got.push(id); const b = propById.get(id); game.sound('cp'); game.burst(b.x, b.y + 0.6, b.z, 14, 0xffd23a, 3, 0.5); game.localBanner(`${D.got.length}/${def.balls.length}`, '', 800); }
      D.got = D.got.filter(id => inn.includes(id));
      if (D.got.length >= def.balls.length) { for (const id of def.balls) { const b = propById.get(id); if (b) b.keep = false; } endDefi(true); }
    } else if (T === 'race') {
      const c = D.crit[0], path = def.path, v = (def.speed || 7) * (game.easy ? 0.72 : 1);
      c.s += v * dt;
      let s = c.s, i = 0;
      while (i + 1 < path.length) { const l = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); if (s <= l) break; s -= l; i++; }
      const end = path[path.length - 1];
      if (i + 1 >= path.length) { c.x = end[0]; c.z = end[1]; endDefi(false); game.banner('Il a gagné !', 'Parlez au signal doré pour une revanche', 2400); return; }
      const a = path[i], b = path[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, k = s / l;
      c.x = a[0] + (b[0] - a[0]) * k; c.z = a[1] + (b[1] - a[1]) * k; c.y = ground(c.x, c.z); c.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]); c.a += dt * 14;
      for (const P of players) if (Math.hypot(P.pos.x - end[0], P.pos.z - end[1]) < 2.8) { endDefi(true); return; }
    } else if (T === 'chase' || T === 'tag') {
      let left = 0;
      for (const c of D.crit) {
        if (c.tagged) continue;
        left++;
        let best = null, bd = 1e9;
        for (const P of players) { const d = Math.hypot(P.pos.x - c.x, P.pos.z - c.z); if (d < bd) { bd = d; best = P; } }
        const v = (def.speed || 6.2) * (game.easy ? 0.7 : 1) * (bd < 7 ? 1 : 0.45);
        let ax = c.x - best.pos.x, az = c.z - best.pos.z; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
        // il reste dans son coin : au bord, il longe le cercle
        const ox = c.x - def.x, oz = c.z - def.z, od = Math.hypot(ox, oz);
        if (od > (def.leash || 16) * 0.75) { const tx = -oz / od, tz = ox / od, sgn = tx * ax + tz * az >= 0 ? 1 : -1; ax = ax * 0.3 + tx * sgn - ox / od * 0.6; az = az * 0.3 + tz * sgn - oz / od * 0.6; const l2 = Math.hypot(ax, az) || 1; ax /= l2; az /= l2; }
        const nx = c.x + ax * v * dt, nz = c.z + az * v * dt;
        if (!(L.blockedAt && L.blockedAt(nx, nz))) { c.x = nx; c.z = nz; }
        c.y = ground(c.x, c.z); c.yaw = lerpAngle(c.yaw, Math.atan2(ax, az), Math.min(1, dt * 8)); c.a += dt * (v > 3 ? 14 : 6);
        if (bd < (attacking(best) ? 2.2 : 1.5) && Math.abs(best.pos.y - c.y) < 2) {
          c.tagged = true;
          game.burst(c.x, c.y + 1, c.z, 16, 0xffffff, 4, 0.6); game.sound('poof');
          if (T === 'tag') { game.bubble({ pos: new THREE.Vector3(c.x, c.y + 1.2, c.z), small: true }, 'Touché !'); game.localBanner(`Touché ! ${D.crit.filter(q => q.tagged).length}/${D.crit.length}`, '', 900); }
          else game.bubble({ pos: new THREE.Vector3(c.x, c.y + 0.6, c.z), small: true }, 'Kaï !');
        }
      }
      if (!left) endDefi(true);
    } else if (T === 'whack' || T === 'fish') {
      D.next -= dt;
      if (D.next <= 0) {
        const free = D.crit.filter(c => c.up <= 0);
        if (free.length) { const c = free[Math.floor(R() * free.length)]; c.up = T === 'fish' ? 1.5 : (game.easy ? 2.2 : 1.4); c.t = 0; c.hit = 0; c.yaw = def.toward ? Math.atan2(def.x - c.x, def.z - c.z) + (R() - 0.5) * 0.8 : R() * TAU; if (T === 'fish') event('chirp', 7); }
        D.next = T === 'fish' ? 1.0 + R() * 0.8 : 0.6 + R() * 0.6;
      }
      for (const c of D.crit) {
        if (c.up <= 0) continue;
        c.t += dt; c.up -= dt;
        if (c.hit) continue;
        // position du poisson en l'air (un arc au-dessus du trou)
        const k = clamp(c.t / 1.5, 0, 1), fy = c.y + (T === 'fish' ? Math.sin(k * Math.PI) * 2.6 : 0.5), fx = c.x + (T === 'fish' ? Math.sin(c.yaw) * fishOff(def, k) : 0), fz = c.z + (T === 'fish' ? Math.cos(c.yaw) * fishOff(def, k) : 0);
        for (const P of players) {
          const ok = T === 'fish' ? hit(P, fx, fy, fz, 1.5) : (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < (attacking(P) ? 2.2 : 1.3) && (attacking(P) || P.vel.y < -2 || (P.barkT || 0) > 0.55)) || ((P.barkT || 0) > 0.6 && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 3.5);
          if (ok) {
            c.hit = 1; c.up = Math.min(c.up, 0.35); D.got.push(1);
            game.sound(T === 'fish' ? 'ball' : 'boing'); game.burst(fx, fy + 0.4, fz, 12, T === 'fish' ? 0x9ae0ff : 0xffe070, 3.5, 0.5);
            game.localBanner(`${D.got.length}/${def.need}`, '', 700);
            break;
          }
        }
      }
      if (D.got.length >= def.need) endDefi(true);
    } else if (T === 'xylo') {
      if (D.phase === 'show') {
        D.seqT += dt;
        const idx = Math.floor(D.seqT / 0.62);
        if (D.seqT > 0 && idx < D.seq.length && D.lastShown !== idx) { D.lastShown = idx; const p = propById.get(def.chimes[D.seq[idx]]); if (p) event('ring', p.i); }
        if (idx >= D.seq.length + 1) { D.phase = 'play'; D.k = 0; D.lastShown = -1; game.localBanner('À vous !', 'Faites sonner les glaçons dans le même ordre', 1600); }
      }
    } else if (T === 'scare') {
      // des oiseaux gourmands posés dans le champ : on les fait s'envoler (on approche, ou « Ouaf ! »)
      for (const c of D.crit) {
        if (c.st === 'gone') continue;
        if (c.st === 'fly') { c.t += dt; c.y += dt * (3 + c.t * 4); c.x += Math.sin(c.yaw) * dt * 7; c.z += Math.cos(c.yaw) * dt * 7; if (c.t > 2.5) c.st = 'gone'; continue; }
        c.a += dt;
        for (const P of players) {
          const d = Math.hypot(P.pos.x - c.x, P.pos.z - c.z);
          if (d < 1.8 || ((P.barkT || 0) > 0.55 && d < (def.hear || 7))) {
            c.st = 'fly'; c.t = 0; c.yaw = Math.atan2(c.x - P.pos.x, c.z - P.pos.z);
            event('chirp', CHIRPS.indexOf(def.sound || 'caw')); game.burst(c.x, c.y + 0.4, c.z, 10, 0x3a3a3a, 3, 0.5);
            game.localBanner(`${D.crit.filter(q => q.st !== 'sit').length}/${D.crit.length}`, '', 700);
            break;
          }
        }
      }
      if (D.crit.every(c => c.st !== 'sit')) endDefi(true);
    } else if (T === 'herd') {
      for (const c of D.crit) {
        if (c.st === 'home' || c.st === 'stuck') { c.a += dt * 3; continue; }
        if (c.st === 'lost') {
          c.a += dt * 2;
          for (const P of players) if (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 1.8 && Math.abs(P.pos.y - c.y) < 2.5) { c.st = 'follow'; c.who = P.id || 0; if (def.item) game.sound('ball'); else { event('chirp', CHIRPS.indexOf((pal.fauna[def.critter] || {}).sound || 'yip')); game.bubble({ pos: new THREE.Vector3(c.x, c.y + 0.8, c.z), small: true }, def.say || 'Waf !'); } break; }
        } else {
          const P = game.party.get(c.who) || game.player;
          const idx = D.crit.filter(q => q.st === 'follow').indexOf(c);
          const back = 1.4 + idx * 1.1, tx = P.pos.x - Math.sin(P.yaw) * back, tz = P.pos.z - Math.cos(P.yaw) * back;
          const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
          if (d > 30) { c.x = tx; c.z = tz; } else if (d > 0.3) { const sp = Math.min(d * 3, 11) * dt; c.x += dx / d * sp; c.z += dz / d * sp; c.yaw = Math.atan2(dx, dz); c.a += dt * 14; }
          c.y = ground(c.x, c.z);
          const pen = def.pen;
          if (Math.hypot(c.x - pen.x, c.z - pen.z) < pen.r) { c.st = 'home'; game.sound('cp'); game.burst(c.x, c.y + 0.8, c.z, 12, 0xffd23a, 3, 0.5); game.localBanner(`${D.crit.filter(q => q.st === 'home').length}/${D.crit.length}`, '', 800); }
        }
      }
      if (D.crit.every(c => c.st === 'home')) endDefi(true);
    }
  }
  /** Le poisson saute : centré sur son trou, ou (def.toward) du trou vers la rive, sur def.reach × 2 m. */
  function fishOff(def, k) { return def.toward ? k * 2 * (def.reach || 1) : (k - 0.5) * 2; }
  /** Un glaçon sonne : la mélodie de glace avance (ou on recommence). */
  function xyloRing(p) {
    const D = st.D; if (!D || D.def.type !== 'xylo' || D.phase !== 'play') return;
    const want = D.def.chimes[D.seq[D.k]];
    if (p.def.id === want) { D.k++; if (D.k >= D.seq.length) endDefi(true); }
    else { D.phase = 'show'; D.seqT = -1.2; D.lastShown = -1; game.localBanner('Presque !', 'Écoutez encore la mélodie…', 1400); }
  }

  // --- objets : coups, aboiements, rebonds (hôte) -------------------------------------------------
  function barked(P) { const prev = st.barkSeen.get(P) || 0, b = P.barkT || 0; st.barkSeen.set(P, b); return b > prev + 0.3; }
  function stepProps(dt) {
    const players = game.players;
    const barks = players.filter(barked);
    for (const P of players) {
      if (P.ride) continue;
      const sp = Math.hypot(P.vel.x, P.vel.z);
      for (const q of pGrid.within(P.pos.x, P.pos.z, 4.5)) {
        const p = q.p, pk = pal.props[p.kind] || {}, act = pk.act, d = Math.hypot(P.pos.x - p.x, P.pos.z - p.z), dy = P.pos.y - p.y;
        if (p.broken > game.t) continue;
        if (act === 'bounce') {
          const r = (pk.r || 1.25), top = p.y + 0.35;
          if (d < r && dy < 1.0 && dy > -0.6 && P.vel.y <= 0.5 && (P.grounded || dy < 0.6)) {
            P.vel.y = (pk.power || 17) * (game.easy ? 1.05 : 1); P.grounded = false; P.jumps = 1; P.coyote = 0;
            P.pos.y = Math.max(P.pos.y, top);
            const D = st.D;
            if (D && D.def.type === 'pads' && D.def.pads.includes(p.def.id) && !D.got.includes(p.def.id)) { D.got.push(p.def.id); game.localBanner(`${D.got.length}/${D.def.pads.length}`, '', 700); }
            defiTouch(p);
            P.padChain = game.t - (P.padAt || -9) < 2.2 ? (P.padChain || 0) + 1 : 0; P.padAt = game.t;
            event('pad', p.i, P.padChain);
            game.sound('boing'); game.burst(p.x, top + 0.2, p.z, 10, 0xbfeaff, 3, 0.4);
            if (P.padChain === 4 && P === game.me) game.localBanner('Rebonds en chaîne !', '', 1000);
          }
        } else if (act === 'splash') {
          // flaques, arroseurs, bains d'oiseaux : on entre dedans (ou on y retombe, ou on tape) → plouf
          const r = pk.r || propModel[p.kind].mdl.r || 1;
          const touch = d < r && dy < (pk.top || 1.4) && dy > -0.6;
          if (touch) { const fresh = !p.touching || (P.vel.y < -5 && game.t - (p.hitT || -9) > 0.5); p.touchT = game.t; p.touching = true; if (fresh) splashProp(p, P, pk); }
          else if (attacking(P) && d < r + 1.4 && Math.abs(dy) < 2) splashProp(p, P, pk);
        } else if (act === 'shake' || act === 'break' || act === 'chime' || act === 'hat' || act === 'press' || act === 'spin') {
          const r = (pk.r || propModel[p.kind].mdl.r || 0.8);
          // (un carillon sonne quand on arrive contre lui, pas tant qu'on y reste collé)
          const touch = act === 'chime' && d < r + 0.9 && Math.abs(dy) < 2;
          const fresh = touch && !p.touching; if (touch) p.touchT = game.t;
          const bump = (attacking(P) && d < r + 1.8 && Math.abs(dy) < 2.5) || (sp > 5 && d < r + 0.8 && Math.abs(dy) < 1.5 && act !== 'chime') || (act === 'press' && d < r + 0.3 && dy > 0.2 && dy < 1.2 && P.vel.y <= 0) || fresh;
          if (touch) p.touching = true;
          if (bump) hitProp(p, P, pk);
        }
      }
      for (const P2 of barks) if (P2 === P) for (const q of pGrid.within(P.pos.x, P.pos.z, 7)) { const pk = pal.props[q.p.kind] || {}; if (['shake', 'chime', 'hat', 'spin'].includes(pk.act) && q.p.broken <= game.t) hitProp(q.p, P, pk, true); }
      // boules de neige qu'on pousse : elles roulent et grossissent
      if (P.grounded) for (const b of pushers) {
        if (b.broken > game.t || Math.abs(b.x - P.pos.x) > 4 || Math.abs(b.z - P.pos.z) > 4) continue;
        const bk = pal.props[b.kind];
        const dx = b.x - P.pos.x, dz = b.z - P.pos.z, d = Math.hypot(dx, dz);
        // (un coup de toupie ou une charge : on tire dedans, elle roule toute seule)
        if (bk.kick && attacking(P) && d < b.r + 1.6 && game.t - (b.kickT || -9) > 0.4) { b.kickT = game.t; const k = bk.kick * (0.8 + Math.min(1, sp / 8) * 0.4); b.vx = dx / (d || 1) * k; b.vz = dz / (d || 1) * k; b.moved = game.t; game.sound('ball'); continue; }
        if (d > b.r + 0.75 || sp < 1) continue;
        const nx = dx / (d || 1), nz = dz / (d || 1), push = Math.max(0, P.vel.x * nx + P.vel.z * nz);
        const tx = P.pos.x + nx * (b.r + 0.76) + nx * push * dt, tz = P.pos.z + nz * (b.r + 0.76) + nz * push * dt;
        if (L.blockedAt && L.blockedAt(tx, tz)) continue;
        if (isWater(tx, tz)) continue;
        if (Math.abs(ground(tx, tz) - ground(b.x, b.z)) > 0.5) continue;
        const moved = Math.hypot(tx - b.x, tz - b.z);
        b.x = tx; b.z = tz; b.rot += moved / b.r; b.y = ground(b.x, b.z); if (bk.grow !== false) b.r = Math.min(1.5, b.r + moved * 0.035);
        b.moved = game.t;
        if (b.r >= 1.5) {
          // trop grosse : pouf ! elle éclate en paillettes
          game.sound('poof'); game.burst(b.x, b.y + 1.2, b.z, 30, 0xffffff, 6, 0.9);
          dropSparkles(b.x, b.y + 1.2, b.z, 3, 1);
          b.broken = game.t + 20; b.x = b.bx; b.z = b.bz; b.r = 0.5; b.y = ground(b.x, b.z);
          if (P === game.me) game.localBanner('Pouf !', 'Elle était trop grosse !', 1200);
        }
      }
    }
    for (const p of props) if (p.touching && game.t - p.touchT > 0.1) p.touching = false;
    // boules lancées : elles roulent, ralentissent, rebondissent sur les obstacles
    for (const b of props) {
      if (!b.vx && !b.vz) continue;
      const nx = b.x + b.vx * dt, nz = b.z + b.vz * dt;
      if ((L.blockedAt && L.blockedAt(nx, nz)) || isWater(nx, nz) || Math.abs(ground(nx, nz) - ground(b.x, b.z)) > 0.5) { b.vx *= -0.4; b.vz *= -0.4; }
      else { b.rot += Math.hypot(nx - b.x, nz - b.z) / (b.r || 1); b.x = nx; b.z = nz; b.y = ground(b.x, b.z); }
      const f = Math.max(0, 1 - dt * ((pal.props[b.kind] || {}).friction || 1.6));
      b.vx *= f; b.vz *= f; b.moved = game.t;
      if (Math.hypot(b.vx, b.vz) < 0.15) { b.vx = 0; b.vz = 0; }
    }
    // une boule abandonnée revient à sa place
    for (const p of props) if (isPush(p.kind) && p.moved && !p.keep && game.t - p.moved > 40 && game.players.every(P => Math.hypot(P.pos.x - p.x, P.pos.z - p.z) > 30)) { p.x = p.bx; p.z = p.bz; p.r = p.r0; p.y = ground(p.x, p.z); p.moved = 0; }
  }
  /** Un objet du défi « hits » (flaques, buissons…) vient d'être touché. */
  function defiTouch(p) {
    const D = st.D;
    if (!D || D.def.type !== 'hits' || !D.def.props.includes(p.def.id) || D.got.includes(p.def.id)) return;
    D.got.push(p.def.id); game.sound('cp');
    game.burst(p.x, p.y + 1, p.z, 14, 0xffd23a, 3.5, 0.6);
    game.localBanner(`${D.got.length}/${D.def.props.length}`, '', 700);
  }
  function splashProp(p, P, pk) {
    if (game.t - (p.hitT || -9) < 0.35) return;
    p.hitT = game.t;
    event('splash', p.i);
    const id = 'p:' + p.def.id;
    if (pk.drop && !gone(id)) { sv().gone[id] = Date.now(); dropSparkles(p.x, p.y + 1, p.z, pk.drop, 1); }
    defiTouch(p);
    // une flaque de boue (pk.mud) : le niveau décide (la ferme : le chien ressort tout crotté)
    if (pk.mud && hooks.onSplash) hooks.onSplash(P, p.def);
  }
  function hitProp(p, P, pk, byBark) {
    const act = pk.act;
    if (game.t - (p.hitT || -9) < (act === 'chime' ? 0.35 : 0.9)) return;
    p.hitT = game.t;
    defiTouch(p);
    // un objet de défi coincé dedans (le frisbee dans l'arbre…) tombe
    const D = st.D;
    if (D && D.def.type === 'herd') for (const c of D.crit) if (c.st === 'stuck' && c.stuck === p.def.id) { c.st = 'lost'; c.y = ground(c.x, c.z); game.burst(c.x, c.y + 1.5, c.z, 16, 0xffd23a, 3, 0.6); if (P === game.me) game.localBanner('Il est tombé !', 'Ramassez-le', 1200); }
    if (act === 'shake' || act === 'hat') {
      event('wob', p.i);
      game.burst(p.x, p.y + (propModel[p.kind].mdl.h || 2) * 0.8, p.z, act === 'hat' ? 10 : 22, pk.burst || 0xffffff, 3, 0.9);
      if (pk.chirp) chirp(pk.chirp); else game.sound(act === 'hat' ? 'boing' : 'poof');
      const id = 'p:' + p.def.id;
      if (pk.drop && !gone(id)) { sv().gone[id] = Date.now(); dropSparkles(p.x, p.y + 1.5, p.z, pk.drop, 1); if (P === game.me && !st.shakeTold) { st.shakeTold = true; game.localBanner('Des paillettes !', cfg.shakeText || 'Secouez les sapins, cassez les tas de neige : il y a des trésors partout', 2600); } }
    } else if (act === 'break') {
      if (byBark) return;
      p.broken = game.t + (pk.respawn || 45);
      game.sound('crate'); game.burst(p.x, p.y + 0.6, p.z, 26, pk.color || 0xf4f8ff, 5, 0.7);
      if (R() < (pk.chance === undefined ? 0.6 : pk.chance)) dropSparkles(p.x, p.y + 0.6, p.z, 1 + Math.floor(R() * (pk.drop || 2)), 1);
    } else if (act === 'spin') {
      event('spin', p.i); game.sound('switch');
      game.burst(p.x, p.y + (propModel[p.kind].mdl.h || 3) * 0.85, p.z, 8, pk.burst || 0xffe070, 2.5, 0.5);
    } else if (act === 'chime') {
      event('ring', p.i);
      game.burst(p.x, p.y + 2.1, p.z, 6, 0xbfeaff, 2, 0.5);
      xyloRing(p);
    } else if (act === 'press') {
      p.on = !p.on;
      event('press', p.i, p.on ? 1 : 0);
      game.sound('switch');
      const t = pk.target || p.def.target;
      if (hooks.onSwitch) hooks.onSwitch(p.def, p.on, P);
      if (p.def.effect === 'geyser' || p.def.effect === 'fountain') { st.geyser = { x: p.def.gx || p.x, z: p.def.gz || p.z, t: game.t + 6, cols: p.def.effect === 'fountain' ? [0x8ad0ff, 0xd8f4ff] : [0xbfeaff, 0xffffff] }; if (p.def.effect === 'fountain') chirp('splash'); }
      if (p.def.effect === 'bubbles') { st.bubbles = { x: p.def.gx || p.x, z: p.def.gz || p.z, y: p.y + 1.0, t: game.t + 10 }; if (P === game.me) game.localBanner('Des bulles !', 'Attrapez-les avant qu\'elles s\'envolent', 1600); }
      if (p.def.effect === 'lights') { for (const q of props) if (q.kind === 'lantern' && q.def.group === (p.def.group || t)) q.on = p.on; }
    }
  }

  // --- interactions (bouton PARLER / CARESSER / DÉFI / OUVRIR) ----------------------------------
  function candidates(Q) {
    const out = [];
    for (const d of defis) if (!st.D && Math.abs(d.def.x - Q.pos.x) < 4 && Math.abs(d.def.z - Q.pos.z) < 4) out.push({ kind: 'lv', life: 'defi', i: d.i, label: defiDone(d.def.id) ? 'REJOUER' : 'DÉFI !', x: d.def.x, z: d.def.z, y: d.def.y });
    for (const v of villagers) if (v.awake && !v.run && Math.abs(v.x - Q.pos.x) < 4 && Math.abs(v.z - Q.pos.z) < 4) out.push({ kind: 'lv', life: 'talk', i: v.i, label: 'PARLER', x: v.x, z: v.z, y: v.y });
    for (const c of chests) if (!sv().chests.includes(c.def.id) && Math.abs(c.def.x - Q.pos.x) < 3.5 && Math.abs(c.def.z - Q.pos.z) < 3.5) out.push({ kind: 'lv', life: 'chest', i: c.i, label: 'OUVRIR', x: c.def.x, z: c.def.z, y: c.def.y });
    for (const q of cGrid.within(Q.pos.x, Q.pos.z, 12)) {
      const c = q.c;
      if (!c.f.pet || c.fly > 0 || c.s === 'flee' || Math.abs(c.x - Q.pos.x) > 3 || Math.abs(c.z - Q.pos.z) > 3) continue;
      out.push({ kind: 'lv', life: 'pet', ci: creatures.indexOf(c), label: 'CARESSER', x: c.x, z: c.z, y: c.y });
    }
    return out;
  }
  function interact(n, P) {
    if (n.life === 'defi') { startDefi(defis[n.i].def, P); return true; }
    if (n.life === 'chest') { openChest(chests[n.i], P); return true; }
    if (n.life === 'talk') { talk(villagers[n.i], P); return true; }
    if (n.life === 'pet') { pet(creatures[n.ci], P); return true; }
    return false;
  }
  function openChest(c, P) {
    const k = sv();
    if (k.chests.includes(c.def.id)) return;
    k.chests.push(c.def.id); game.persist();
    event('chest', c.i);
    game.sound('reveal');
    dropSparkles(c.def.x, c.def.y + 0.8, c.def.z, 8, 2);
    game.spawnHeart(c.def.x, c.def.y + 1.6, c.def.z + 0.3);
    game.burst(c.def.x, c.def.y + 1, c.def.z, 30, 0xffd23a, 5, 0.9);
    const n = k.chests.length, tot = plan.secrets.length;
    game.banner(`Une cachette secrète ! (${n}/${tot})`, c.def.found || 'Un coffre plein de paillettes !', 3000);
    if (hooks.onChest) hooks.onChest(c.def, P);
  }
  function pet(c, P) {
    if (!c) return;
    c.s = 'pet'; c.t = 1.4; c.petT = game.t;
    c.yaw = Math.atan2(P.pos.x - c.x, P.pos.z - c.z);
    game.burst(c.x, c.y + (c.fm.mdl.h || 1) * c.scale + 0.2, c.z, 8, 0xff8ab8, 2, 0.8);
    event('chirp', CHIRPS.indexOf(c.f.sound || 'squeak'));
    const say = c.f.say || ['♥'];
    game.bubble({ pos: new THREE.Vector3(c.x, c.y + (c.fm.mdl.h || 1) * c.scale * 0.8, c.z), small: true }, say[Math.floor(R() * say.length)]);
    const k = sv(); k.pets = (k.pets | 0) + 1;
    if (!c.gift && R() < 0.5) { c.gift = true; dropSparkles(c.x, c.y + 0.8, c.z, 1 + Math.floor(R() * 2), 1); }
    if (c.f.follow) { c.followT = c.f.follow; c.followWho = P.id || 0; }
    if (k.pets === 1) game.banner('Il est tout content !', 'Caressez les animaux : certains vous suivent, d\'autres ont un petit cadeau', 2800);
    game.persist();
  }
  function talk(v, P) {
    const def = v.def, ln = lines[def.id] || {}, k = sv();
    event('wave', v.i);
    v.hold = game.t + 8;   // (un promeneur s'arrête pour parler)
    const who = ln.who || def.name;
    const req = def.defi && plan.defis.find(d => d.id === def.defi);
    if (req && !defiDone(req.id) && ln.ask) { game.say(ln.ask, () => { k.talk[def.id + ':asked'] = 1; game.persist(); }); return; }
    if (req && defiDone(req.id) && ln.thanks && !k.talk[def.id + ':thanked']) { game.say(ln.thanks, () => { k.talk[def.id + ':thanked'] = 1; dropSparkles(v.x, v.y + 1.5, v.z, 5, 1); game.persist(); }); return; }
    const list = ln.talk || [[{ who, text: '…' }]];
    const i = (k.talk[def.id] | 0) % list.length;
    k.talk[def.id] = i + 1;
    game.say(list[i]);
    void P;
  }

  // --- animation des bêtes (en local : chacun voit les siennes bouger) ----------------------------
  function threat(c) {
    let best = null, bd = 1e9;
    for (const P of game.players) { const d = Math.hypot(P.pos.x - c.x, P.pos.z - c.z); if (d < bd) { bd = d; best = P; } }
    return { P: best, d: bd };
  }
  function moveTo(c, tx, tz, v, dt) {
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    if (d < 0.2) return true;
    const st2 = Math.min(d, v * dt), nx = c.x + dx / d * st2, nz = c.z + dz / d * st2;
    if ((L.blockedAt && L.blockedAt(nx, nz)) || (c.f.ai !== 'slide' && c.f.onIce === false && L.iceAt && L.iceAt(nx, nz)) || (c.f.water ? !isWater(nx, nz) : isWater(nx, nz))) { c.t = 0; return true; }
    c.x = nx; c.z = nz;
    c.yaw = lerpAngle(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
    return false;
  }
  function flee(c, P, dist, long) {
    const a = Math.atan2(c.x - P.pos.x, c.z - P.pos.z) + (R() - 0.5) * 1.2;
    const r = Math.min(c.f.home || 10, 6 + R() * 5);
    c.tx = c.x + Math.sin(a) * (long ? r * 1.3 : r); c.tz = c.z + Math.cos(a) * (long ? r * 1.3 : r);
    // (on ne s'éloigne pas trop de sa maison)
    const hd = Math.hypot(c.tx - c.hx, c.tz - c.hz), lim = (c.f.home || 10) * 1.6;
    if (hd > lim) { c.tx = c.hx + (c.tx - c.hx) / hd * lim; c.tz = c.hz + (c.tz - c.hz) / hd * lim; }
    c.s = 'flee'; c.t = 1.2 + R();
    void dist;
  }
  function stepCreature(c, dt, t, barks) {
    const f = c.f, ai = f.ai;
    c.ph += dt;
    // en file indienne (canetons derrière leur maman) : on suit celui de devant
    if (f.line && c.flock && c.i > 0) {
      const lead = c.flock.members[c.i - 1], gap = f.gap || 0.8;
      const dx = lead.x - c.x, dz = lead.z - c.z, d = Math.hypot(dx, dz);
      if (d > 14) { c.x = lead.x - Math.sin(lead.yaw) * gap; c.z = lead.z - Math.cos(lead.yaw) * gap; }
      else if (d > gap) { const sp = Math.min((d - gap) * 5, 10) * dt; c.x += dx / d * sp; c.z += dz / d * sp; c.yaw = lerpAngle(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8)); c.hop = f.water ? 0 : Math.abs(Math.sin(c.ph * 16)) * 0.05; c.ph += dt * 2; }
      else c.hop = 0;
      c.y = f.water ? surface(c.x, c.z) + Math.sin(c.ph * 2.2) * 0.02 : ground(c.x, c.z);
      c.pitch = 0; c.flapA = lead.s === 'flee' ? Math.sin(c.ph * 30) * 0.5 : 0;
      return;
    }
    const th = threat(c);
    const barkNear = barks.some(P => Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < (f.hear || 12));
    if (ai === 'swim') {
      // canards : ils se promènent sur l'eau, s'écartent (en cancanant) si on approche ou si on aboie
      const scare = barkNear || th.d < (f.flee || 4);
      if (scare && c.s !== 'flee') {
        const a = Math.atan2(c.x - th.P.pos.x, c.z - th.P.pos.z);
        for (let k = 0; k < 8; k++) { const b = a + (R() - 0.5) * (1 + k * 0.4), r = 4 + R() * 4, tx = c.x + Math.sin(b) * r, tz = c.z + Math.cos(b) * r; if (isWater(tx, tz) && Math.hypot(tx - c.hx, tz - c.hz) < (f.home || 10) * 1.5) { c.tx = tx; c.tz = tz; break; } }
        c.s = 'flee'; c.t = 2.5; if (th.d < 30 && R() < 0.7) chirp(f.sound || 'quack');
      }
      c.t -= dt;
      if (c.s === 'flee' || c.s === 'walk') {
        const done = c.tx === undefined || moveTo(c, c.tx, c.tz, c.s === 'flee' ? (f.run || 3.5) : (f.speed || 0.8), dt);
        if (done || c.t <= 0) { c.s = 'idle'; c.t = 1.5 + R() * 3; }
      } else if (c.t <= 0) {
        for (let k = 0; k < 6; k++) { const a = R() * TAU, r = R() * (f.home || 10), tx = c.hx + Math.cos(a) * r, tz = c.hz + Math.sin(a) * r; if (isWater(tx, tz)) { c.tx = tx; c.tz = tz; c.s = 'walk'; c.t = 6 + R() * 4; break; } }
        if (c.s !== 'walk') c.t = 1;
        if (th.d < 18 && R() < 0.25) chirp(f.sound || 'quack');
      }
      c.hop = 0; c.pitch = c.s === 'idle' ? Math.max(0, Math.sin(c.ph * 0.9 + c.i * 2)) ** 8 * 1.2 : 0;   // (de temps en temps : la tête sous l'eau !)
      c.flapA = c.s === 'flee' ? Math.sin(c.ph * 28) * 0.7 : 0;
      c.y = surface(c.x, c.z) + Math.sin(c.ph * 2 + c.i) * 0.025;
      return;
    }
    if (ai === 'hop') {
      // grenouille : elle coasse (la gorge gonfle) et saute plus loin quand on approche
      if (c.j !== undefined) {
        c.j += dt / 0.55;
        const k = clamp(c.j, 0, 1);
        c.x = c.jx + (c.tx - c.jx) * k; c.z = c.jz + (c.tz - c.jz) * k;
        c.y = surface(c.x, c.z) + Math.sin(k * Math.PI) * 0.9; c.pitch = -0.6 + k * 0.9;
        if (c.j >= 1) { c.j = undefined; c.pitch = 0; if (isWater(c.x, c.z) && th.d < 30) game.burst(c.x, c.y + 0.05, c.z, 6, 0xbfe4ff, 1.5, 0.4); }
        return;
      }
      c.t -= dt; c.puff = Math.max(0, (c.puff || 0) - dt);
      const scare = barkNear || th.d < (f.flee || 3.5);
      if (c.t <= 0 || scare) {
        c.t = 2 + R() * 5;
        if (!scare && th.d < 25 && R() < 0.7) { c.puff = 0.6; chirp(f.sound || 'croak'); }
        if (scare || R() < 0.25) {
          const a = scare ? Math.atan2(c.x - th.P.pos.x, c.z - th.P.pos.z) + (R() - 0.5) : R() * TAU, r = 1.5 + R() * 2;
          let tx = c.x + Math.sin(a) * r, tz = c.z + Math.cos(a) * r;
          const hd = Math.hypot(tx - c.hx, tz - c.hz), lim = f.home || 4;
          if (hd > lim) { tx = c.hx + (tx - c.hx) / hd * lim; tz = c.hz + (tz - c.hz) / hd * lim; }
          if (!(L.blockedAt && L.blockedAt(tx, tz))) { c.jx = c.x; c.jz = c.z; c.tx = tx; c.tz = tz; c.j = 0; c.yaw = Math.atan2(tx - c.x, tz - c.z); }
        }
      }
      c.y = surface(c.x, c.z); c.hop = 0;
      return;
    }
    if (ai === 'flock') {
      const fl = c.flock;
      if (c.fly <= 0) {
        // au sol : on picore, on sautille
        const scare = barkNear || (th.d < (f.flee || 5) && Math.hypot(th.P.vel.x, th.P.vel.z) > 3.5) || th.d < 2.2;
        if (scare) {
          const a = Math.atan2(c.x - th.P.pos.x, c.z - th.P.pos.z) + (R() - 0.5);
          c.fly = 6 + R() * 4; c.vx = Math.sin(a) * 5; c.vz = Math.cos(a) * 5; c.vy = 5 + R() * 3; c.circ = R() < 0.5 ? -1 : 1;
          if (fl && !fl.up) { fl.up = true; fl.t = game.t; if (th.d < 30) chirp(f.sound || 'chirp'); for (const o of creatures) if (o.flock === fl && o.fly <= 0 && o !== c) { o.fly = 6 + R() * 4; const b = a + (R() - 0.5) * 1.5; o.vx = Math.sin(b) * 5; o.vz = Math.cos(b) * 5; o.vy = 4 + R() * 4; o.circ = c.circ; } }
          return;
        }
        if (fl) fl.up = false;
        c.t -= dt;
        if (c.t <= 0) { c.t = 0.4 + R() * 1.6; const a = R() * TAU; c.tx = c.hx + Math.cos(a) * (1 + R() * 2.5); c.tz = c.hz + Math.sin(a) * (1 + R() * 2.5); c.hop = 0; }
        if (c.tx !== undefined && !moveTo(c, c.tx, c.tz, 2.2, dt)) c.hop = Math.abs(Math.sin(c.ph * 14)) * 0.08;
        else c.hop = 0;
        c.y = ground(c.x, c.z); c.pitch = Math.max(0, Math.sin(c.ph * 6 + c.i)) * 0.5; c.flapA = -(f.fold || 0);   // (f.fold : ailes repliées au sol)
      } else {
        // en vol : on tourne au-dessus de la maison, puis on se repose
        c.fly -= dt;
        const cx = c.hx, cz = c.hz, dx = c.x - cx, dz = c.z - cz, d = Math.hypot(dx, dz) || 1, R0 = 6 + (c.i % 3) * 2;
        const tx = -dz / d * c.circ, tz = dx / d * c.circ;
        c.vx += (tx * 6 - c.vx + (-dx / d) * (d - R0) * 0.6) * dt * 1.5; c.vz += (tz * 6 - c.vz + (-dz / d) * (d - R0) * 0.6) * dt * 1.5;
        const gy = ground(c.x, c.z), want = c.fly > 1.2 ? gy + (f.flyH || 6) + (c.i % 4) : gy;
        c.vy += (want - c.y) * dt * 2 - c.vy * dt;
        c.x += c.vx * dt; c.z += c.vz * dt; c.y = Math.max(gy, c.y + c.vy * dt);
        c.yaw = Math.atan2(c.vx, c.vz); c.pitch = -0.2; c.flapA = Math.sin(c.ph * 30) * 0.9;
        if (c.fly <= 0) { c.y = gy; c.fly = 0; }
      }
      return;
    }
    if (ai === 'perch') {
      if (c.fly <= 0) {
        c.y = c.def.perch;
        c.yaw = lerpAngle(c.yaw, th.d < 25 ? Math.atan2(th.P.pos.x - c.x, th.P.pos.z - c.z) : c.yaw + Math.sin(c.ph * 0.5) * 0.02, dt * 2);
        c.flapA = -(f.fold || 0); c.pitch = 0; c.head = Math.sin(c.ph * 0.7) * 0.3;
        if (th.d < 22 && (c.hootT = (c.hootT || 3 + R() * 8) - dt) <= 0) { c.hootT = 8 + R() * 10; if (th.P === game.me) chirp(f.sound || 'hoot'); }
        if (barkNear || (th.d < 3 && Math.abs(th.P.pos.y - c.y) < 3)) { c.fly = 7; c.circ = R() < 0.5 ? -1 : 1; c.vx = 0; c.vz = 0; c.vy = 3; game.bubble({ pos: new THREE.Vector3(c.x, c.y + 1, c.z), small: true }, (f.say && f.say[0]) || 'Hou-hou !'); }
      } else {
        c.fly -= dt;
        const a = c.ph * 0.9 * c.circ, r = 9;
        const tx = c.hx + Math.cos(a) * r, tz = c.hz + Math.sin(a) * r, ty = c.fly > 1.5 ? c.def.perch + 4 : c.def.perch;
        const k = c.fly > 1.5 ? dt * 2 : dt * 4;
        if (c.fly <= 1.5) { c.x += (c.hx - c.x) * k; c.z += (c.hz - c.z) * k; } else { c.x += (tx - c.x) * k; c.z += (tz - c.z) * k; }
        c.y += (ty - c.y) * k * 1.5; c.yaw = Math.atan2(tx - c.x, tz - c.z); c.flapA = Math.sin(c.ph * 14) * 1.0; c.pitch = 0.1;
        if (c.fly <= 0) { c.fly = 0; c.x = c.hx; c.z = c.hz; }
      }
      return;
    }
    if (ai === 'burrow') {
      // marmotte : sort de son trou quand tout est calme, siffle et rentre si on approche
      const scared = th.d < (f.flee || 7) || barkNear;
      if (scared && c.under < 0.5 && !c.whis) { c.whis = true; if (th.d < 25) chirp('whistle'); }
      if (!scared) c.whis = false;
      c.under += ((scared ? 1 : 0) - c.under) * Math.min(1, dt * (scared ? 10 : 1.2));
      c.y = ground(c.x, c.z) - c.under * 0.95; c.yaw = lerpAngle(c.yaw, Math.atan2(th.P.pos.x - c.x, th.P.pos.z - c.z), dt * 2);
      c.head = Math.sin(c.ph * 2) * 0.15; c.hop = 0;
      return;
    }
    if (ai === 'jump') {
      // poisson : saute hors de son trou de temps en temps
      c.t -= dt;
      if (c.t <= 0 && c.j === undefined && th.d < 45) { c.j = 0; c.yaw = R() * TAU; if (th.d < 20) chirp('splash'); }
      if (c.t <= 0 && c.j === undefined) c.t = 1;
      if (c.j !== undefined) {
        c.j += dt / 1.1;
        const k = clamp(c.j, 0, 1);
        const base = f.water ? surface(c.hx, c.hz) : ground(c.hx, c.hz);
        c.x = c.hx + Math.sin(c.yaw) * (k - 0.5) * 1.6; c.z = c.hz + Math.cos(c.yaw) * (k - 0.5) * 1.6; c.y = base - 0.3 + Math.sin(k * Math.PI) * 1.8; c.pitch = (k - 0.5) * 2.2;
        if (c.j >= 1) { c.j = undefined; c.t = 2 + R() * 4; c.y = -500; if (th.d < 30) game.burst(c.hx, base + 0.1, c.hz, 6, 0x9ad8ff, 2, 0.4); }
      } else c.y = -500;
      return;
    }
    if (ai === 'hover') {
      const a = c.ph * (0.6 + (c.i % 3) * 0.2) + c.i, rg = f.range || 2.5;
      let tx = c.hx + Math.cos(a) * rg, tz = c.hz + Math.sin(a * 1.3) * rg;
      if (c.fm.flap) { c.flapA = 0.15 + Math.abs(Math.sin(c.ph * (f.flapRate || 16))) * 1.1; c.pitch = -0.3; }
      if (th.d < 3) { tx += (c.x - th.P.pos.x) * 2; tz += (c.z - th.P.pos.z) * 2; }
      if (barkNear && !c.sc) { c.sc = 1.5; }
      if (c.sc > 0) { c.sc -= dt; tx = c.hx + Math.cos(c.i * 2.4) * 6; tz = c.hz + Math.sin(c.i * 2.4) * 6; }
      const px = c.x, pz = c.z;
      c.x += (tx - c.x) * dt * 1.5; c.z += (tz - c.z) * dt * 1.5; c.y = ground(c.x, c.z) + (f.alt === undefined ? 1.2 : f.alt) + Math.sin(c.ph * 2 + c.i) * (f.bob || 0.5) + (c.sc > 0 ? 2 : 0);
      c.yaw = c.fm.flap ? Math.atan2(c.x - px, c.z - pz) : c.ph;
      return;
    }
    // promeneurs (lièvre, hermine, renne, écureuil, pingouin, chiot…)
    const run = f.run || 7, walk = f.speed || 1.6;
    if (c.s === 'pet') {
      c.t -= dt; c.hop = Math.abs(Math.sin(c.ph * 12)) * 0.25; c.y = ground(c.x, c.z);
      if (c.t <= 0) c.s = 'idle';
      return;
    }
    if (c.followT > 0) {
      c.followT -= dt;
      const P = game.party.get(c.followWho) || game.player;
      const tx = P.pos.x - Math.sin(P.yaw) * 2, tz = P.pos.z - Math.cos(P.yaw) * 2, d = Math.hypot(tx - c.x, tz - c.z);
      if (d > 1) { moveTo(c, tx, tz, Math.min(10, d * 2.5), dt); c.hop = f.hopper ? Math.abs(Math.sin(c.ph * 11)) * 0.3 : 0; } else c.hop = 0;
      c.y = ground(c.x, c.z);
      if (c.followT <= 0) { c.s = 'idle'; c.t = 0; }
      return;
    }
    // les chèvres : un petit coup de tête pour jouer (seulement son propre chien, chez soi)
    if (f.butt && c.s !== 'charge' && c.s !== 'flee' && (c.buttT = (c.buttT === undefined ? 3 + R() * 4 : c.buttT) - dt) <= 0 && th.P === game.me && th.d < f.butt && th.d > 1.6 && !game.me.kart && game.me.grounded) {
      c.s = 'charge'; c.t = 1.5; c.buttT = 8 + R() * 6; chirp(f.sound || 'bleat');
      if (f.say) game.bubble({ pos: new THREE.Vector3(c.x, c.y + (c.fm.mdl.h || 1) * c.scale, c.z), small: true }, f.say[0]);
    }
    if (c.s === 'charge') {
      const P = game.me; c.t -= dt;
      const done = moveTo(c, P.pos.x, P.pos.z, f.run || 5, dt);
      c.pitch = 0.35; c.hop = Math.abs(Math.sin(c.ph * 14)) * 0.06; c.y = ground(c.x, c.z);
      if (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 1.2 + (c.fm.mdl.r || 0.5) * c.scale * 0.6 && Math.abs(P.pos.y - c.y) < 1.5) {
        const a = Math.atan2(P.pos.x - c.x, P.pos.z - c.z);
        P.vel.x += Math.sin(a) * 8; P.vel.z += Math.cos(a) * 8; P.vel.y = Math.max(P.vel.y, 7); P.grounded = false;
        game.burst(P.pos.x, P.pos.y + 0.8, P.pos.z, 10, 0xffffff, 3, 0.5); game.sound('boing');
        if (!st.buttTold && f.buttText) { st.buttTold = true; game.localBanner(f.buttText[0], f.buttText[1], 2200); }
        c.s = 'idle'; c.t = 2; c.pitch = 0;
      } else if (c.t <= 0 || done) { c.s = 'idle'; c.t = 1.5; c.pitch = 0; }
      return;
    }
    const shy = f.shy !== false && !f.pet;
    // hérisson : il se roule en boule au lieu de fuir
    if (f.curl && c.s !== 'curl' && (barkNear || th.d < (f.flee || 3))) { c.s = 'curl'; c.t = 2.5 + R() * 2; if (th.d < 20) chirp('sniff'); }
    if (c.s === 'curl') { c.t -= dt; c.hop = 0; c.y = ground(c.x, c.z); if (c.t <= 0 && th.d > (f.flee || 3)) { c.s = 'idle'; c.t = 1; } return; }
    // chien joueur : un « Ouaf ! » et il fait la fofolle autour de vous
    if (f.playful && barkNear && c.s !== 'zoom') { c.s = 'zoom'; c.t = 2.6; c.zp = th.P; c.za = Math.atan2(c.x - th.P.pos.x, c.z - th.P.pos.z); chirp('woof'); }
    if (c.s === 'zoom') {
      c.t -= dt; c.za += dt * 3.2;
      const Pz = c.zp || th.P; moveTo(c, Pz.pos.x + Math.sin(c.za) * 3, Pz.pos.z + Math.cos(c.za) * 3, run, dt);
      c.hop = Math.abs(Math.sin(c.ph * 14)) * 0.3; c.y = ground(c.x, c.z);
      if (c.t <= 0) { c.s = 'idle'; c.t = 1; }
      return;
    }
    if (barkNear && c.s !== 'flee' && !f.playful) { flee(c, th.P, th.d, true); c.hopY = f.hopper !== false ? 0.9 : 0.3; if (th.d < 12 && R() < 0.5 && f.say) game.bubble({ pos: new THREE.Vector3(c.x, c.y + (c.fm.mdl.h || 1) * c.scale, c.z), small: true }, f.say[0]); }
    else if (shy && th.d < (f.flee || 6) && c.s !== 'flee') flee(c, th.P, th.d);
    c.t -= dt;
    if (c.s === 'flee') {
      const done = moveTo(c, c.tx, c.tz, run, dt);
      c.hop = f.hopper !== false ? Math.abs(Math.sin(c.ph * 13)) * 0.45 : Math.abs(Math.sin(c.ph * 16)) * 0.08;
      if (done || c.t <= 0) { c.s = 'idle'; c.t = 1 + R() * 2; }
    } else if (c.s === 'walk') {
      const done = moveTo(c, c.tx, c.tz, walk, dt);
      c.hop = f.hopper ? Math.abs(Math.sin(c.ph * 9)) * 0.18 : 0;
      if (ai === 'slide' && c.slide > 0) { c.slide -= dt; moveTo(c, c.tx, c.tz, 5, dt); c.hop = 0; }
      if (done || c.t <= 0) { c.s = 'idle'; c.t = 1 + R() * 3; }
    } else {
      c.hop = 0;
      c.head = Math.sin(c.ph * 1.3) * 0.4;
      if (c.t <= 0) {
        const a = R() * TAU, r = R() * (f.home || 8);
        c.tx = c.hx + Math.cos(a) * r; c.tz = c.hz + Math.sin(a) * r; c.s = 'walk'; c.t = 4 + R() * 3;
        if (ai === 'slide' && R() < 0.45) c.slide = 1.8;
        if (th.d < 18 && R() < 0.15) chirp(f.sound || 'squeak');
      }
    }
    c.y = ground(c.x, c.z);
  }

  // --- habitants ------------------------------------------------------------------------------------
  function stepVillager(v, dt, t) {
    const def = v.def;
    v.ph += dt;
    const me = game.me, dd = Math.hypot(me.pos.x - v.x, me.pos.z - v.z);
    const D = st.D;
    const run = D && D.def.type === 'tag' ? D.crit.find(c => c.id === def.id) : null;
    v.run = run && !run.tagged ? run : null;
    if (run) { v.x = run.x; v.z = run.z; v.y = run.y; v.yaw = run.yaw; v.act = run.tagged ? 'cheer' : 'run'; return; }
    if (v.loop) {
      // promeneurs et joggeurs : un tour du circuit (ils s'arrêtent pour parler)
      const held = v.hold > game.t;
      if (!held) v.s += (def.speed || 1.2) * dt;
      const p = loopAt(v.loop, v.s);
      v.x = p.x; v.z = p.z; v.y = ground(p.x, p.z);
      v.yaw = lerpAngle(v.yaw, held ? Math.atan2(me.pos.x - v.x, me.pos.z - v.z) : p.yaw, Math.min(1, dt * 5));
      v.act = held ? 'idle' : (def.act || 'walk');
      if (def.pet) {
        const q = loopAt(v.loop, v.s - (def.pet.back || 1.8));
        if (v.petX === undefined || Math.hypot(q.x - v.petX, q.z - v.petZ) > 6) { v.petX = q.x; v.petZ = q.z; }
        const dx = q.x - v.petX, dz = q.z - v.petZ, d = Math.hypot(dx, dz);
        if (d > 0.1) { v.petX += dx * Math.min(1, dt * 4); v.petZ += dz * Math.min(1, dt * 4); v.petYaw = Math.atan2(dx, dz); v.petRun = Math.min(1, d * 2); } else v.petRun = 0;
        if (held) v.petYaw = lerpAngle(v.petYaw || 0, Math.atan2(me.pos.x - v.petX, me.pos.z - v.petZ), dt * 3);
      }
      return;
    }
    if (def.path === 'ellipse') {
      // patineurs : un grand tour de piste, en se balançant
      const sp = def.speed || 0.35, a = (game.t * sp + def.phase) % TAU, e = def.ellipse, sg = Math.sign(sp);
      v.x = e.x + Math.cos(a) * e.rx; v.z = e.z + Math.sin(a) * e.rz; v.y = e.y;
      v.yaw = Math.atan2(-Math.sin(a) * e.rx * sg, Math.cos(a) * e.rz * sg);
      v.act = 'skate';
      return;
    }
    if (def.sleepy && !v.awake) {
      for (const P of game.players) if ((P.barkT || 0) > 0.55 && Math.hypot(P.pos.x - v.x, P.pos.z - v.z) < 8) {
        v.awake = true; v.wave = game.t; game.bubble({ pos: new THREE.Vector3(v.x, v.y + 2.6, v.z), small: true }, 'Hein ?!');
        game.burst(v.x, v.y + 2, v.z, 20, 0xffffff, 4, 0.8);
        if (P === game.me) game.localBanner(def.name + ' s\'est réveillé !', 'Allez lui parler', 2200);
      }
    }
    v.act = (def.actDone && def.defi && defiDone(def.defi) ? def.actDone : def.act) || 'idle';
    const home = def.yaw || 0;
    v.yaw = lerpAngle(v.yaw, dd < 7 && v.awake && v.act !== 'shovel' && v.act !== 'fish' && !def.busy ? Math.atan2(me.pos.x - v.x, me.pos.z - v.z) : home, Math.min(1, dt * 3));
    void t;
  }

  // --- rendu ------------------------------------------------------------------------------------------
  const m4 = new THREE.Matrix4(), m5 = new THREE.Matrix4(), m6 = new THREE.Matrix4(), mB = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const camQ = new THREE.Quaternion();
  const compose = (x, y, z, yaw, pitch, roll, sx, sy, sz) => m4.compose(v4.set(x, y, z), q4.setFromEuler(e4.set(pitch || 0, yaw || 0, roll || 0, 'YXZ')), s4.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz));
  function glow(x, y, z, size, color, k) {
    m5.compose(v4.set(x, y, z), camQ, s4.set(size, size, size));
    glowL.push(m5, C.setHex(color).multiplyScalar(k === undefined ? 1 : k));
  }
  function shadow(x, z, r) {
    if (lite && r < 0.35) return;
    m5.compose(v4.set(x, ground(x, z) + 0.06, z), q4.identity(), s4.set(r * 2.4, 1, r * 2.4));
    shadowL.push(m5);
  }
  /** Une bête (corps + deux ailes). */
  function drawCreature(fm, x, y, z, yaw, pitch, roll, sc, sqy, flapA, tint, noWings) {
    compose(x, y, z, yaw, pitch, roll, sc, sc * (sqy || 1), sc);
    fm.body.push(m4, tint);
    if (fm.flap && !noWings) {
      const pv = fm.mdl.pivots, ax = fm.mdl.flapAxis === 'z';
      for (const sd of [-1, 1]) {
        m5.copy(m4).multiply(m6.compose(v4.set(pv[0] * sd, pv[1], pv[2]), q4.setFromEuler(e4.set(0, 0, ax ? -sd * (0.15 + Math.abs(flapA || 0) * 0.6) : sd * (flapA || 0), 'XYZ')), s4.set(sd, 1, 1)));
        fm.flap.push(m5);
      }
    }
  }
  const furTint = new THREE.Color();
  function drawVillager(v, t) {
    const def = v.def, act = v.act, ph = v.ph;
    let bob = 0, lean = 0, armR = 0, armL = 0, armRz = 0, toolOn = true, sy = 1;
    const waving = game.t - v.wave < 1.6;
    if (act === 'shovel') { const k = Math.sin(ph * 3); lean = 0.25 + k * 0.15; armR = -0.6 + k * 0.5; armL = -0.6 + k * 0.5; bob = Math.abs(k) * 0.03; if (k > 0.97 && (v.puffT = (v.puffT || 0) - 1) < 0 && Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 40) { v.puffT = 1; game.spawnParticle(v.x + Math.sin(v.yaw + 0.8) * 1.2, v.y + 0.8, v.z + Math.cos(v.yaw + 0.8) * 1.2, Math.sin(v.yaw + 1.2) * 2, 3, Math.cos(v.yaw + 1.2) * 2, 0xffffff, 0.35, 0.8, 8); } }
    else if (act === 'fish') { armR = -1.1 + Math.sin(ph * 1.5) * 0.08; armL = -0.9; sy = 0.82; bob = -0.25; if ((v.fishT = (v.fishT === undefined ? 4 + (v.i % 5) : v.fishT) - 1 / 60) < 0) { v.fishT = 6 + (v.i % 4) * 2; v.wave = game.t; } }
    else if (act === 'skate') { const k = Math.sin(ph * 2.2); lean = 0.15; armR = -0.4 + k * 0.6; armL = -0.4 - k * 0.6; bob = Math.abs(k) * 0.06; armRz = 0.5; }
    else if (act === 'run') { const k = Math.sin(ph * 14); armR = k * 0.9; armL = -k * 0.9; bob = Math.abs(k) * 0.12; lean = 0.2; toolOn = false; }
    else if (act === 'throw') {
      const k = (ph * 0.8) % 2; armR = k < 0.3 ? -2.6 * (k / 0.3) : k < 0.5 ? -2.6 + (k - 0.3) * 13 : 0; armL = -0.3;
      // la boule part (une vraie petite boule de neige qui vole)
      if (k >= 0.4 && (v.lastK === undefined || v.lastK < 0.4) && Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 45) game.spawnParticle(v.x + Math.sin(v.yaw) * 0.4, v.y + 1.3 * (def.scale || 1), v.z + Math.cos(v.yaw) * 0.4, Math.sin(v.yaw) * (def.throwV || 7), 4.5, Math.cos(v.yaw) * (def.throwV || 7), def.ball || 0xffffff, def.ballSize || 0.32, 1.1, 9);
      v.lastK = k;
    }
    else if (act === 'water') { armR = -1.25 + Math.sin(ph * 1.3) * 0.1; armL = -0.3; lean = 0.1; if (R() < 0.25 && Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 30) game.spawnParticle(v.x + Math.sin(v.yaw) * 1.05, v.y + 0.55, v.z + Math.cos(v.yaw) * 1.05, Math.sin(v.yaw) * 0.6, -0.5, Math.cos(v.yaw) * 0.6, 0x8ad0ff, 0.09, 0.5, 9); }
    else if (act === 'scatter') {
      const k = (ph * 0.9) % 2; armR = k < 0.5 ? -1.5 * (k / 0.5) : k < 0.8 ? -1.5 + (k - 0.5) * 4.5 : -0.15; armL = -0.9;
      if (k >= 0.55 && (v.lastK === undefined || v.lastK < 0.55) && Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 35) for (let i = 0; i < 6; i++) game.spawnParticle(v.x + Math.sin(v.yaw) * 0.5, v.y + 1.1, v.z + Math.cos(v.yaw) * 0.5, Math.sin(v.yaw + (R() - 0.5)) * 3, 2 + R() * 1.5, Math.cos(v.yaw + (R() - 0.5)) * 3, def.throwColor || 0xf0d070, 0.1, 1.0, 9);
      v.lastK = k;
    }
    else if (act === 'chisel') { const k = Math.sin(ph * 7); armR = -1.0 + k * 0.4; armL = -1.2; lean = 0.2; }
    else if (act === 'stir') { armR = -1.1; armRz = Math.sin(ph * 3) * 0.3; armL = -0.5; }
    else if (act === 'flag') { armR = -2.5 + Math.sin(ph * 2) * 0.3; armL = -0.2; }
    else if (act === 'cheer') { armR = -2.8; armL = -2.8; bob = Math.abs(Math.sin(ph * 8)) * 0.3; toolOn = false; }
    else if (act === 'walk') { const k = Math.sin(ph * 7); armR = k * 0.5; armL = -k * 0.5; bob = Math.abs(k) * 0.04; }
    else if (act === 'jog') { const k = Math.sin(ph * 11); armR = -0.7 + k * 0.9; armL = -0.7 - k * 0.9; bob = Math.abs(k) * 0.1; lean = 0.15; }
    else if (act === 'kite') { armR = -2.55 + Math.sin(ph * 1.3) * 0.15; armRz = 0.15 + Math.sin(ph * 0.9) * 0.1; armL = -0.4; }
    else if (act === 'balloons') { armR = -2.75 + Math.sin(ph * 1.1) * 0.06; armL = -0.2; }
    else if (act === 'sit') { sy = 0.68; bob = -0.32; armR = -0.8 + Math.max(0, Math.sin(ph * 1.6)) * 0.6; armL = -0.5; }
    else if (act === 'sad') { armR = -2.0 + Math.sin(ph * 6) * 0.08; armL = -2.0 - Math.sin(ph * 6) * 0.08; sy = 0.96; toolOn = false; }
    else if (act === 'look') { armR = -1.65; armL = -1.65; armRz = -0.1; bob = Math.sin(ph * 0.6) * 0.02; }
    else if (act === 'scoop') { armR = -1.2 + Math.sin(ph * 2.5) * 0.35; armL = -0.5; lean = 0.1; }
    else if (act === 'feed' || act === 'blow') {
      const k = (ph * 0.7) % 2; armR = act === 'blow' ? -1.6 + Math.sin(ph * 1.5) * 0.3 : k < 0.3 ? -1.6 * (k / 0.3) : k < 0.5 ? -1.6 + (k - 0.3) * 8 : 0; armL = -0.5;
      const near = Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 40;
      if (act === 'feed' && k >= 0.42 && (v.lastK === undefined || v.lastK < 0.42) && near) for (let i = 0; i < 5; i++) game.spawnParticle(v.x + Math.sin(v.yaw) * 0.5, v.y + 1.2, v.z + Math.cos(v.yaw) * 0.5, Math.sin(v.yaw + (R() - 0.5)) * 3, 2.5, Math.cos(v.yaw + (R() - 0.5)) * 3, 0xe0c080, 0.07, 0.8, 9);
      if (act === 'blow' && near && R() < (lite ? 1.2 : 2.2) / 60) addFloat(v.x + Math.sin(v.yaw) * 0.7, v.y + 1.5 * (def.scale || 1), v.z + Math.cos(v.yaw) * 0.7, Math.sin(v.yaw) * 1.2, Math.cos(v.yaw) * 1.2);
      v.lastK = k;
    }
    else if (act === 'play') {
      const k = Math.sin(ph * 3); armR = -1.3; armL = -1.3; armRz = 0.35 + k * 0.25; bob = Math.abs(Math.sin(ph * 3)) * 0.03;
      const d = Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z), beat = Math.floor(ph * 2.6);
      if (beat !== v.beat) { v.beat = beat; if (d < 18 && !st.D) { const tune = def.tune || [67, 71, 74, 71, 72, 76, 74, 72, 71, 74, 79, 74, 72, 69, 67, 67]; const s = sfx(); if (s) s.note('mallet', tune[beat % tune.length], 0.05 * (1 - d / 18)); } if (d < 30 && beat % 2 === 0) game.spawnParticle(v.x, v.y + 2.1, v.z, (R() - 0.5) * 0.6, 1.2, (R() - 0.5) * 0.6, [0xffd23a, 0xff6ab0, 0x5ac8ff][beat % 3], 0.16, 1.4, -0.3); }
    }
    else if (act === 'rake') { const k = Math.sin(ph * 2.4); lean = 0.2; armR = -0.7 + k * 0.4; armL = -0.7 + k * 0.4; }
    else if (act === 'jumpy') {
      const k = Math.abs(Math.sin(ph * 4.5)); bob = k * 0.55; armR = -2.0 * k; armL = -2.0 * k; sy = 1 - (1 - k) * 0.08;
      if (def.splash && k < 0.08 && game.t - (v.splT || 0) > 0.4 && Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 35) { v.splT = game.t; for (let i = 0; i < 8; i++) { const a = R() * TAU; game.spawnParticle(v.x + Math.cos(a) * 0.4, v.y + 0.1, v.z + Math.sin(a) * 0.4, Math.cos(a) * 2, 2.5 + R() * 2, Math.sin(a) * 2, 0xbfe4ff, 0.1, 0.6, 12); } }
    }
    else { armR = Math.sin(ph * 1.2) * 0.08; armL = -Math.sin(ph * 1.2) * 0.08; bob = Math.sin(ph * 2) * 0.02; }
    if (waving) { armR = -2.7 + Math.sin(ph * 12) * 0.3; armRz = 0.3; }
    const sc = def.scale || 1;
    if (def.pet && v.petX !== undefined) {
      const fm = faunaModel[def.pet.kind];
      if (fm) { const hop = Math.abs(Math.sin(ph * 12)) * 0.12 * (v.petRun || 0); drawCreature(fm, v.petX, ground(v.petX, v.petZ) + hop, v.petZ, v.petYaw || 0, 0, 0, def.pet.scale || fm.f.scale || 1, 1, 0, fm.mdl.tint ? C.setHex(def.pet.tint || 0xe8c49a) : undefined); shadow(v.petX, v.petZ, 0.4); }
    }
    if (def.body === 'penguin' || def.body === 'critter') {
      const fm = faunaModel[def.model || 'skater'] || faunaModel.penguin;
      if (fm) drawCreature(fm, v.x, v.y + bob, v.z, v.yaw, 0, act === 'skate' ? Math.sin(ph * 2.2) * 0.15 : 0, sc, 1, act === 'skate' ? 0.6 + Math.sin(ph * 2.2) * 0.4 : waving ? 1.2 : 0.1);
      shadow(v.x, v.z, 0.5 * sc);
      return;
    }
    if (def.body === 'snowman' || def.body === 'yeti' || def.body === 'scarecrow') {
      const big = def.body === 'yeti', scr = def.body === 'scarecrow', L1 = big ? vill.yeti : scr ? vill.scare : vill.snow, LA = big ? vill.yetiArm : scr ? vill.scareArm : vill.snowArm;
      const wake = v.awake ? 1 : 0;
      compose(v.x, v.y + (wake ? Math.abs(Math.sin(ph * (waving ? 9 : 1.5))) * 0.06 : 0), v.z, v.yaw, 0, wake ? Math.sin(ph * 1.3) * 0.05 : 0, sc);
      L1.push(m4);
      const base = mB.copy(m4);
      for (const sd of [-1, 1]) {
        const ang = scr ? (sd > 0 && waving ? 2.6 + Math.sin(ph * 12) * 0.3 : 1.55 + wake * Math.sin(ph * 1.7 + sd) * 0.12) : sd > 0 ? (waving ? 2.4 + Math.sin(ph * 12) * 0.3 : 0.9 + wake * Math.sin(ph * 2) * 0.2) : 0.9;
        m5.copy(base).multiply(m6.compose(v4.set(sd * (big ? 0.85 : scr ? 0.36 : 0.42), big ? 2.0 : scr ? 1.68 : 1.42, 0), q4.setFromEuler(e4.set(0, 0, sd * ang)), one));
        LA.push(m5);
      }
      if (!big) { m5.copy(base).multiply(m6.makeTranslation(0, scr ? 2.25 : 2.22, 0)); hatL.push(m5, C.setHex(def.hat || 0x2a2430)); }
      shadow(v.x, v.z, big ? 1.1 : 0.7);
      return;
    }
    furTint.setHex(def.fur || 0xe8c49a);
    compose(v.x, v.y + bob, v.z, v.yaw, lean, 0, sc, sc * sy, sc);
    vill.body.push(m4, furTint);
    vill.cloth.push(m4, C.setHex(def.cloth || 0xd84a3a));
    const base = mB.copy(m4);
    for (const sd of [1, -1]) {
      const a = sd > 0 ? armR : armL;
      m5.copy(base).multiply(m6.compose(v4.set(sd * 0.36, 1.12, 0.04), q4.setFromEuler(e4.set(a, 0, sd * (0.18 + (sd > 0 ? armRz : 0)), 'ZYX')), one));
      vill.arm.push(m5, C.setHex(def.cloth || 0xd84a3a));
      if (sd > 0 && toolOn && def.tool && tools[def.tool]) { m5.multiply(m6.makeTranslation(0, -0.5, 0.02)); tools[def.tool].push(m5); }
    }
    shadow(v.x, v.z, 0.5 * sc);
  }

  function refreshNear() {
    const me = game.me, x = me.pos.x, z = me.pos.z;
    st.near.c = cGrid.within(x, z, VIEW).map(q => q.c);
    st.near.p = pGrid.within(x, z, VIEW).map(q => q.p);
    st.near.s = sGrid.within(x, z, VIEW * 0.8).map(q => q.s);
  }

  function render(dt, t) {
    const me = game.me; if (!me) return;
    camQ.copy(game.camera.quaternion);
    // le voisinage (recalculé quatre fois par seconde)
    if ((st.nearT -= dt) <= 0) { st.nearT = 0.25; refreshNear(); }
    // événements de l'hôte (chez un ami)
    for (const l of layers.values()) l.begin();
    const barks = game.players.filter((P) => { const prev = P._lifeBark || 0, b = P.barkT || 0; P._lifeBark = b; return b > prev + 0.3; });
    // bêtes
    const act2 = ACTIVE * ACTIVE;
    for (const c of st.near.c) {
      const d2 = (c.x - me.pos.x) ** 2 + (c.z - me.pos.z) ** 2;
      if (d2 < act2) stepCreature(c, dt, t, barks);
      if (c.f.hole && c.i === 0) { compose(c.hx, surface(c.hx, c.hz), c.hz, c.hx * 7.3, 0, 0, 1); propModel[holeKind(c.f)].l.push(m4); }
      if (c.y < -100) continue;
      const fm = c.fm, ai = c.f.ai;
      let pitch = c.pitch || 0, roll = 0, sqy = 1;
      if (ai === 'slide' && c.slide > 0) { pitch = 1.35; }
      if (ai === 'slide' && !(c.slide > 0)) roll = c.s === 'walk' ? Math.sin(c.ph * 9) * 0.12 : Math.sin(c.ph * 2) * 0.04;
      if (c.s === 'pet') sqy = 1 + Math.sin(c.ph * 12) * 0.08;
      if (c.s === 'curl') { sqy = 0.72; pitch = 0.5; }
      if (c.puff > 0) sqy = 1 + Math.sin(c.puff / 0.6 * Math.PI * 3) * 0.12;
      if (ai === 'burrow' && c.under > 0.98) continue;
      drawCreature(fm, c.x, c.y + (c.hop || 0), c.z, c.yaw, pitch, roll, c.scale, sqy, ai === 'slide' ? (c.s === 'walk' ? Math.sin(c.ph * 8) * 0.6 : 0) : c.flapA, c.tint !== null && c.tint !== undefined ? C.setHex(c.tint) : undefined,
        lite && ai === 'flock' && !(c.fly > 0));   // (téléphone : un oiseau posé replie ses ailes — un dessin de moins)
      if (ai === 'hover') { if (c.f.glow !== false) glow(c.x, c.y, c.z, 1.2, c.f.glow || 0x9ad8ff, 0.8); }
      else if (ai !== 'jump' && ai !== 'perch' && !c.f.water && !(c.fly > 0 && c.y - ground(c.x, c.z) > 4)) shadow(c.x, c.z, (c.fm.mdl.r || 0.3) * c.scale);
    }
    // objets
    for (const p of st.near.p) {
      const pm = propModel[p.kind]; if (!pm) continue;
      const pk = pm.pk;
      if (p.broken > game.t) continue;
      let pitch = 0, roll = 0, sy = 1, sx = 1, y = p.y;
      const w = game.t - p.wob; if (w < 1.2) { roll = Math.sin(w * 22) * 0.18 * (1 - w / 1.2); pitch = Math.cos(w * 19) * 0.08 * (1 - w / 1.2); }
      const s = game.t - p.sq; if (s < 0.6) { const k = Math.sin(s / 0.6 * Math.PI * 3) * (1 - s / 0.6); sy = 1 - k * 0.35; sx = 1 + k * 0.2; }
      const rg = game.t - p.ring; if (rg < 0.8) roll += Math.sin(rg * 30) * 0.05 * (1 - rg / 0.8);
      if (p.r0) { compose(p.x, y + p.r, p.z, p.yaw, p.rot, 0, p.r); pm.l.push(m4, p.def.tint !== undefined ? C.setHex(p.def.tint) : undefined); shadow(p.x, p.z, p.r); continue; }
      if (p.kind === 'button' && p.on) sy *= 0.7;
      if (pk.act === 'spin') { const ss = game.t - (p.spin0 || -99); p.ang = ((p.ang || 0) + dt * (0.25 + Math.sin(t * 0.3 + p.i) * 0.2 + (ss < 3 ? 14 * (1 - ss / 3) : 0))) % TAU; }
      compose(p.x, y, p.z, p.yaw + (p.ang || 0), pitch, roll, sx * (p.def.s || 1), sy * (p.def.s || 1), sx * (p.def.s || 1));
      pm.l.push(m4, p.def.tint !== undefined ? C.setHex(p.def.tint) : undefined);
      if (p.kind === 'snowman' || pk.hatY) {
        const hw = game.t - p.wob, hop = hw < 1.0 ? Math.sin(hw / 1.0 * Math.PI) * 1.2 : 0, spin = hw < 1 ? hw * 9 : 0;
        m5.copy(m4).multiply(m6.compose(v4.set(0, (pk.hatY || 2.0) + hop, 0), q4.setFromEuler(e4.set(0, spin, 0)), one));
        hatL.push(m5, C.setHex(p.def.hat || 0x2a2430));
      }
      if (p.kind === 'chime' && rg < 0.8) glow(p.x, p.y + 2.0, p.z, 2.4, 0xbfeaff, 1 - rg / 0.8);
      if (p.kind === 'lantern' && p.on) glow(p.x, p.y + 2.35, p.z, 2.2, 0xffd890, 0.9);
      if (p.kind === 'drift' && st.D && st.D.def.type === 'pads' && st.D.def.pads.includes(p.def.id) && !st.D.got.includes(p.def.id)) glow(p.x, p.y + 0.8, p.z, 3.5, 0x8af0ff, 0.6 + Math.sin(t * 8) * 0.3);
      if (pk.shadow) shadow(p.x, p.z, pk.shadow);
      if (pk.spray && R() < dt * (lite ? 14 : 30) && (p.x - me.pos.x) ** 2 + (p.z - me.pos.z) ** 2 < 2000) {
        // arroseur : deux jets qui tournent
        const a = t * (pk.spin || 1.6) + (R() < 0.5 ? 0 : Math.PI), v = 2.6 + R() * 1.2;
        game.spawnParticle(p.x + Math.cos(a) * 0.35, p.y + 0.5, p.z + Math.sin(a) * 0.35, Math.cos(a) * v, 4.2 + R(), Math.sin(a) * v, 0xd8f0ff, 0.11, 0.95, 9);
      }
    }
    // habitants
    for (const v of villagers) {
      const d = Math.hypot(v.x - me.pos.x, v.z - me.pos.z);
      if (d > VIEW + 10) continue;
      if (d < ACTIVE + 20) stepVillager(v, dt, t);
      if (v.def.hidden && d > (v.def.hidden || 16) && !v.awake) continue;
      drawVillager(v, t);
    }
    // les signaux des défis
    const D = st.D;
    for (const dd of defis) {
      const def = dd.def, d = Math.hypot(def.x - me.pos.x, def.z - me.pos.z);
      if (d > VIEW) continue;
      const done = defiDone(def.id), active = D && D.def === def;
      compose(def.x, def.y, def.z, t * 0.5, 0, 0, 1 + (active ? 0 : Math.sin(t * 3) * 0.05));
      propModel.marker.l.push(m4);
      if (!active) {
        compose(def.x, def.y + 1.8 + Math.sin(t * 2.5 + dd.i) * 0.2, def.z, t * 2, 0, 0, done ? 0.7 : 1);
        propModel.star.l.push(m4);
        glow(def.x, def.y + 1.8, def.z, done ? 1.6 : 2.6, done ? 0x9affc8 : 0xffd23a, 0.9);
        if (!lite && d < 40 && R() < dt * 4) game.spawnParticle(def.x + (R() - 0.5) * 2, def.y + 0.2, def.z + (R() - 0.5) * 2, 0, 1.6, 0, done ? 0x9affc8 : 0xffe680, 0.2, 1.0, 0);
      }
    }
    if (D) drawDefi(D, t);
    // traînées de paillettes
    for (const s of st.near.s) {
      if (gone(s.id)) continue;
      const bob = Math.sin(t * 3 + s.k * 0.6) * 0.12;
      compose(s.x, s.y + bob, s.z, t * 2 + s.k, 0, 0, 1);
      propModel.sparkle.l.push(m4);
      if (!lite) glow(s.x, s.y + bob, s.z, 0.9, 0xbfeaff, 0.5);
    }
    for (const d of st.drops) { compose(d.x, d.y, d.z, t * 6, 0, 0, 1.2); propModel.sparkle.l.push(m4); glow(d.x, d.y, d.z, 1.1, 0xd8f4ff, 0.7); }
    // coffres
    const k = sv();
    for (const c of chests) {
      const def = c.def, d = Math.hypot(def.x - me.pos.x, def.z - me.pos.z);
      if (d > VIEW * 0.7) continue;
      const opened = k.chests.includes(def.id);
      compose(def.x, def.y, def.z, def.rot || 0, 0, 0, 1);
      propModel.chest.l.push(m4);
      const oa = opened ? clamp((game.t - c.open) / 0.6, 0, 1) : 0, lidA = opened ? (c.open < 0 ? 1 : oa) * 1.9 : (d < 6 ? Math.abs(Math.sin(t * 6)) * 0.08 : 0);
      m5.copy(m4).multiply(m6.compose(v4.set(0, 0.56, -0.35), q4.setFromEuler(e4.set(-lidA, 0, 0)), one));
      propModel.lid.l.push(m5);
      if (!opened && d < 18) glow(def.x, def.y + 0.9, def.z, 1.6 + Math.sin(t * 4) * 0.3, 0xffd23a, 0.55);
      shadow(def.x, def.z, 0.6);
    }
    // geyser de neige (interrupteur)
    if (st.geyser && st.geyser.t > game.t && R() < dt * 40) { const g = st.geyser, cc = g.cols || [0xbfeaff, 0xffffff]; game.spawnParticle(g.x + (R() - 0.5) * 0.6, ground(g.x, g.z) + 0.3, g.z + (R() - 0.5) * 0.6, (R() - 0.5) * 2.5, 9 + R() * 4, (R() - 0.5) * 2.5, R() < 0.3 ? cc[0] : cc[1], 0.35, 1.6, 9); }
    // machine à bulles en marche
    if (st.bubbles && st.bubbles.t > game.t && R() < dt * (lite ? 5 : 9)) { const b = st.bubbles; addFloat(b.x + (R() - 0.5) * 0.4, b.y, b.z + (R() - 0.5) * 0.4, (R() - 0.5) * 2.4, (R() - 0.5) * 2.4); }
    // bulles de savon
    const bm = propModel.bubble;
    st.floats = st.floats.filter((b) => {
      b.t += dt; b.ph += dt;
      b.x += (b.vx + Math.sin(b.ph * 1.3) * 0.4) * dt; b.z += (b.vz + Math.cos(b.ph * 1.1) * 0.4) * dt; b.y += 0.45 * dt; b.vx *= 1 - dt * 0.5; b.vz *= 1 - dt * 0.5;
      for (const P of game.players) if (hit(P, b.x, b.y, b.z, 0.9 + b.s * 0.5)) { game.burst(b.x, b.y, b.z, 6, 0xe8f6ff, 2, 0.35); if (P === game.me) chirp('ting'); return false; }
      if (b.t > b.life) { game.burst(b.x, b.y, b.z, 4, 0xe8f6ff, 1.5, 0.3); return false; }
      const k = Math.min(1, b.t * 3) * b.s;
      if (bm) { compose(b.x, b.y, b.z, b.ph, 0, 0, k, k * (1 + Math.sin(b.ph * 7) * 0.05), k); bm.l.push(m4); } else glow(b.x, b.y, b.z, k * 2, 0xd8f0ff, 0.6);
      return true;
    });
    if (cfg.renderExtra) cfg.renderExtra(dt, t, { glow, layer: (n) => layers.get(n) });
    for (const l of layers.values()) l.end();
    // le bandeau de quête suit le défi (chrono)
    if ((st.hudT -= dt) <= 0) { st.hudT = 0.25; const q = questText(); if (q !== st.hudQ) { st.hudQ = q; game.updateHud(); } }
  }
  function drawDefi(D, t) {
    const def = D.def, T = def.type;
    if (T === 'coins') {
      const im = propModel[def.item || 'coin'] || propModel.coin;
      def.items.forEach((it, i) => {
        if (D.got.includes(i)) return;
        const col = def.colors ? def.colors[i % def.colors.length] : 0xff4a5a;
        compose(it.x, it.y + Math.sin(t * (def.item ? 1.6 : 3) + i) * (def.item ? 0.25 : 0.15), it.z, def.item ? Math.sin(t + i) * 0.3 : t * 3 + i, 0, def.item ? Math.sin(t * 1.3 + i) * 0.12 : 0, def.item ? 1 : 1.2);
        im.l.push(m4, def.colors ? C.setHex(col) : undefined); glow(it.x, it.y, it.z, def.item ? 1.6 : 2.0, col, def.item ? 0.35 : 0.8);
      });
    }
    if (T === 'herd' && def.item) {
      const im = propModel[def.item];
      for (const c of D.crit) {
        if (c.st === 'home') { compose(def.pen.x + Math.cos(D.crit.indexOf(c) * 2.1) * 1.2, ground(def.pen.x, def.pen.z) + 0.05, def.pen.z + Math.sin(D.crit.indexOf(c) * 2.1) * 1.2, c.a, 0, 0, 1); im.l.push(m4, def.colors ? C.setHex(def.colors[D.crit.indexOf(c) % def.colors.length]) : undefined); continue; }
        const fl = c.st === 'follow', y = c.st === 'stuck' ? c.y : c.y + (fl ? 1.0 + Math.sin(t * 4) * 0.1 : 0.05);
        compose(c.x, y, c.z, fl ? t * 4 : c.yaw, c.st === 'stuck' ? 0.5 : 0, 0, 1); im.l.push(m4, def.colors ? C.setHex(def.colors[D.crit.indexOf(c) % def.colors.length]) : undefined);
        if (c.st !== 'follow') glow(c.x, y + 0.4, c.z, 1.6, 0xffd23a, 0.6 + Math.sin(t * 6) * 0.3);
      }
      const pen = def.pen; glow(pen.x, ground(pen.x, pen.z) + 0.4, pen.z, pen.r * 2.4, 0xffd23a, 0.35);
    }
    if (T === 'hits') for (const id of def.props) { if (D.got.includes(id)) continue; const p = propById.get(id); if (p) glow(p.x, p.y + 1.2, p.z, 2.6, 0xffd23a, 0.5 + Math.sin(t * 6) * 0.25); }
    if (T === 'goal') {
      const pen = def.pen, gy = ground(pen.x, pen.z);
      glow(pen.x, gy + 0.3, pen.z, pen.r * 2.6, 0xffd23a, 0.4 + Math.sin(t * 4) * 0.15);
      for (const id of def.balls) { const b = propById.get(id); if (b && !D.got.includes(id)) glow(b.x, b.y + b.r * 2 + 0.5, b.z, 1.2, 0xffffff, 0.5); }
    }
    if (T === 'rings') def.rings.forEach((r, i) => { if (i < D.i) return; compose(r.x, r.y, r.z, r.yaw || 0, 0, 0, i === D.i ? 1 + Math.sin(t * 6) * 0.06 : 0.85); propModel.ring.l.push(m4); if (i === D.i) glow(r.x, r.y, r.z, 3.5, 0xffd23a, 0.5); });
    if (T === 'race') {
      const e = def.path[def.path.length - 1];
      compose(e[0], ground(e[0], e[1]), e[1], 0, 0, 0, 1); propModel.finish.l.push(m4); glow(e[0], ground(e[0], e[1]) + 3, e[1], 3, 0xffffff, 0.6);
    }
    if (T === 'race' || T === 'chase' || (T === 'herd' && !def.item)) {
      const fm = faunaModel[def.critter]; if (!fm) return;
      for (const c of D.crit) {
        const hop = fm.f.hopper !== false ? Math.abs(Math.sin(c.a)) * 0.35 : 0;
        drawCreature(fm, c.x, c.y + hop, c.z, c.yaw, fm.f.ai === 'slide' && T === 'race' ? 1.35 : 0, 0, (fm.f.scale || 1) * (T === 'chase' ? 1.1 : 1), 1, 0, fm.mdl.tint ? C.setHex(c.tint || 0xe8c49a) : undefined);
        shadow(c.x, c.z, fm.mdl.r);
        if (T === 'herd' && c.st === 'lost') glow(c.x, c.y + 1.3, c.z, 1.4, 0xffd23a, 0.6 + Math.sin(t * 6) * 0.3);
        if (T === 'chase') glow(c.x, c.y + 1.2, c.z, 1.2, 0x40c060, 0.6);
      }
      if (T === 'herd') { const pen = def.pen; glow(pen.x, ground(pen.x, pen.z) + 0.4, pen.z, pen.r * 2.4, 0xffd23a, 0.35); }
    }
    if (T === 'whack' || T === 'fish') {
      const fm = faunaModel[T === 'fish' ? (def.critter || 'fish') : (def.critter || 'marmot')], hm = propModel[def.hole || 'hole'];
      for (const c of D.crit) {
        compose(c.x, c.y, c.z, c.x * 3.1, 0, 0, 1); hm.l.push(m4);
        if (c.up <= 0 || !fm) continue;
        if (T === 'whack') { const k = c.hit ? clamp(c.up / 0.35, 0, 1) : clamp(c.t / 0.15, 0, 1); drawCreature(fm, c.x, c.y - 0.9 + k * 0.9, c.z, c.yaw, 0, 0, fm.f.scale || 1, c.hit ? 0.6 : 1, 0); glow(c.x, c.y + 0.9, c.z, 1.2, 0xffe070, 0.4); }
        else { const k = clamp(c.t / 1.5, 0, 1); if (c.hit) continue; drawCreature(fm, c.x + Math.sin(c.yaw) * fishOff(def, k), c.y + Math.sin(k * Math.PI) * 2.6, c.z + Math.cos(c.yaw) * fishOff(def, k), c.yaw, (k - 0.5) * 2.4, 0, 1.6, 1, 0); }
      }
    }
    if (T === 'scare') {
      const fm = faunaModel[def.critter]; if (!fm) return;
      for (const c of D.crit) {
        if (c.st === 'gone') continue;
        const sit = c.st === 'sit';
        drawCreature(fm, c.x, c.y + (sit ? Math.abs(Math.sin(c.a * 5)) * 0.04 : 0), c.z, c.yaw + (sit ? Math.sin(c.a * 0.8) * 0.6 : 0), sit ? Math.max(0, Math.sin(c.a * 4)) * 0.6 : -0.2, 0, (fm.f.scale || 1) * 1.1, 1, sit ? -(fm.f.fold || 0) : Math.sin(t * 30) * 0.9);
        if (sit) { shadow(c.x, c.z, 0.25); glow(c.x, c.y + 1.0, c.z, 0.9, 0xffd23a, 0.4 + Math.sin(t * 6 + c.a) * 0.2); }
      }
    }
    if (T === 'xylo') for (const id of def.chimes) { const p = propById.get(id); if (p && D.phase === 'play') glow(p.x, p.y + 2.6, p.z, 0.9, 0xffffff, 0.4); }
  }

  // --- texte de quête, carte ------------------------------------------------------------------------
  function questText() {
    const D = st.D; if (!D) return null;
    const def = D.def, tm = D.t === Infinity ? '' : ` · ⏱ ${Math.max(0, Math.ceil(D.t))} s`;
    if (D.cd > 0) return `⚡ ${def.name} : attention…`;
    const T = def.type;
    const prog = T === 'coins' ? `${D.got.length}/${def.items.length}` : T === 'rings' ? `anneau ${Math.min(D.i + 1, def.rings.length)}/${def.rings.length}` : T === 'pads' ? `${D.got.length}/${def.pads.length}`
      : T === 'hits' ? `${D.got.length}/${def.props.length}` : T === 'goal' ? `${D.got.length}/${def.balls.length}`
      : T === 'whack' || T === 'fish' ? `${D.got.length}/${def.need}` : T === 'tag' || T === 'chase' ? `${D.crit.filter(c => c.tagged).length}/${D.crit.length}` : T === 'herd' ? `${D.crit.filter(c => c.st === 'home').length}/${D.crit.length}` : T === 'scare' ? `${D.crit.filter(c => c.st !== 'sit').length}/${D.crit.length}`
        : T === 'xylo' ? (D.phase === 'show' ? 'écoutez…' : `${D.k}/${D.seq.length}`) : 'vite !';
    return `⚡ ${def.name} : ${prog}${tm}`;
  }
  function marks() {
    const out = [], k = sv();
    for (const d of plan.defis) out.push([d.x, d.z, k.defis.includes(d.id) ? '#9affc8' : '#ffd23a', 2.6]);
    return out;
  }

  // --- réseau -----------------------------------------------------------------------------------------
  const r2 = (v) => Math.round(v * 100) / 100;
  function snapshot() {
    const D = st.D;
    return {
      d: D ? [D.i, r2(D.t === Infinity ? -1 : D.t), r2(D.cd), D.got, D.phase, D.k, D.def === undefined ? 0 : plan.defis.indexOf(D.def), D.crit.map(c => [r2(c.x), r2(c.y), r2(c.z), r2(c.yaw), c.tagged ? 1 : 0, c.st || 0, r2(c.up || 0), r2(c.t || 0), c.hit || 0])] : 0,
      ev: st.ev,
      dr: st.drops.map(d => [r2(d.x), r2(d.y), r2(d.z)]),
      br: props.filter(p => p.broken > game.t || p.moved || p.on).map(p => [p.i, r2(p.broken - game.t), r2(p.x), r2(p.z), r2(p.r), p.on ? 1 : 0]),
    };
  }
  function apply(x) {
    if (!x) return;
    if (x.d) {
      const [i, t, cd, got, phase, kk, di, crit] = x.d;
      const def = plan.defis[di];
      if (!st.D || st.D.def !== def) st.D = { def, crit: [], got: [], seq: def.seq || [] };
      Object.assign(st.D, { i, t: t < 0 ? Infinity : t, cd, got, phase, k: kk });
      st.D.crit = crit.map(c => ({ x: c[0], y: c[1], z: c[2], yaw: c[3], tagged: !!c[4], st: c[5], up: c[6], t: c[7], hit: c[8], a: game.t * 14, id: def.kids ? def.kids[crit.indexOf(c)] : undefined }));
    } else st.D = null;
    for (const [seq, type, a, b] of x.ev || []) if (seq > st.seen) { st.seen = seq; playEvent(type, a, b); }
    st.drops = (x.dr || []).map(d => ({ x: d[0], y: d[1], z: d[2], vx: 0, vy: 0, vz: 0, t: 0 }));
    const br = new Map((x.br || []).map(b => [b[0], b]));
    for (const p of props) {
      const b = br.get(p.i);
      if (!b) { if (p.broken > game.t) p.broken = 0; if (p.r0) { p.x = p.bx; p.z = p.bz; p.r = p.r0; p.y = ground(p.x, p.z); } p.on = false; continue; }
      p.broken = b[1] > 0 ? game.t + b[1] : 0;
      if (p.r0) { p.rot += Math.hypot(b[2] - p.x, b[3] - p.z) / (p.r || 1); p.x = b[2]; p.z = b[3]; p.r = b[4]; p.y = ground(p.x, p.z); }
      p.on = !!b[5];
    }
    for (const q of props) if (q.kind === 'lantern') q.on = props.some(p => p.kind === 'button' && p.on && p.def.effect === 'lights' && p.def.group === q.def.group);
  }

  // --- pas de jeu (hôte) ------------------------------------------------------------------------------
  function step(dt) {
    // traînées : on ramasse les paillettes
    for (const P of game.players) for (const q of sGrid.within(P.pos.x, P.pos.z, 2.2)) {
      const s = q.s; if (gone(s.id)) continue;
      if (hit(P, s.x, s.y, s.z, 1.6)) {
        sv().gone[s.id] = Date.now();
        gain(P, 1, s.x, s.y, s.z);
        const left = s.trail.pts.filter((_, i) => !gone(`${s.trail.id}_${i}`)).length;
        if (!left) { game.sound('chain'); game.burst(s.x, s.y + 0.5, s.z, 24, 0xbfeaff, 5, 0.8); dropSparkles(s.x, s.y, s.z, 3, 1); if (s.trail.say) game.localBanner(s.trail.say, '', 1600); }
        game.persist();
      }
    }
    stepProps(dt);
    stepDefi(dt);
    stepDrops(dt);
  }
  function applySave() { /* l'état vient de game.save.life : rien à recopier */ }

  return {
    step, render, candidates, interact, snapshot, apply, applySave, questText, marks,
    get active() { return st.D; },
    /** Arrête le défi en cours sans récompense (changement de niveau, réapparition…). */
    stopDefi: () => { st.D = null; },
    startDefi: (id, P) => { const d = plan.defis.find(q => q.id === id); if (d) startDefi(d, P || game.player); },
    stats: () => ({ creatures: creatures.length, props: props.length, villagers: villagers.length, defis: defis.length, secrets: chests.length, sparkles: sparkles.length, layers: layers.size }),
    creatures, props, villagers, chests, plan, layers,
  };
}
