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
import { PointGrid } from './lifeplan.js';
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
  if (g.attributes.uv) g.deleteAttribute('uv');
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
  for (const [name, k] of [['position', 3], ['normal', 3], ['color', 3]]) {
    let n = 0; for (const g of list) n += g.attributes[name].count;
    const a = new Float32Array(n * k); let o = 0;
    for (const g of list) { a.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
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
      h: 1.0, r: 0.35,
    };
  },
  bird(c) {
    const back = c.back || 0x6a7080, breast = c.breast || 0xe8503a, cap = c.cap || 0x1a1a20;
    return {
      body: merge([P(sph(0.11), back, { y: 0.15, sz: 1.3, sy: 0.95 }), P(sph(0.1), breast, { y: 0.13, z: 0.05, sx: 0.92 }), P(sph(0.078), cap, { y: 0.27, z: 0.1 }),
        P(cone(0.03, 0.08, 5), 0x2a2a2a, { y: 0.26, z: 0.2, rx: Math.PI / 2 }), P(box(0.1, 0.02, 0.14), cap, { y: 0.17, z: -0.18, rx: 0.3 }),
        ...eyes(0.05, 0.29, 0.16, 0.014)]),
      flap: wingGeo(0.22, 0.13, back), pivots: [0.08, 0.18, 0.0], h: 0.35, r: 0.15,
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
    return { body: merge([P(sph(0.13), f, { sx: 0.5, sz: 2.2 }), P(cone(0.12, 0.18, 4), f, { z: -0.32, rx: -Math.PI / 2, sx: 0.3 }), ...eyes(0.05, 0.03, 0.18, 0.02)]), h: 0.3, r: 0.2 };
  },
  sprite(c) { return { body: merge([P(new THREE.IcosahedronGeometry(0.12, 0), c.fur || 0xbfeaff)]), h: 0.3, r: 0.2, unlit: true }; },
  puppy(c) {
    const f = 0xffffff, dark = 0x1a1414;
    const parts = [P(sph(0.22), f, { y: 0.32, sz: 1.4, sy: 0.9 }), P(sph(0.19), f, { y: 0.56, z: 0.28 }), P(sph(0.09), 0xffffff, { y: 0.51, z: 0.44, sz: 0.9 }),
      P(sph(0.035), dark, { y: 0.55, z: 0.52 }), ...eyes(0.08, 0.61, 0.43, 0.03), P(sph(0.07), f, { x: 0.16, y: 0.55, z: 0.22, sy: 1.8 }), P(sph(0.07), f, { x: -0.16, y: 0.55, z: 0.22, sy: 1.8 }),
      P(sph(0.05), f, { y: 0.45, z: -0.32, sz: 1.8, rx: 0.8 })];
    for (const [x, z] of [[0.1, 0.18], [-0.1, 0.18], [0.1, -0.18], [-0.1, -0.18]]) parts.push(P(cyl(0.05, 0.05, 0.22, 5), f, { x, y: 0.11, z }));
    if (c.bonnet) parts.push(P(sph(0.17, 8, 5, 0, TAU, 0, Math.PI / 2), c.bonnet, { y: 0.68, z: 0.26 }), P(sph(0.06), 0xfff0f0, { y: 0.86, z: 0.26 }));
    return { body: merge(parts), h: 0.9, r: 0.3, tint: true };
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
  hole() { return { geo: merge([P(cyl(0.55, 0.55, 0.02, 14), 0x16303e, { y: 0.03 }), P(tor(0.58, 0.08, 4, 16), 0xeef6ff, { y: 0.05, rx: Math.PI / 2, sz: 0.4 })]), h: 0.1, r: 0.6 }; },
  marker() { return { geo: merge([P(tor(1.15, 0.1, 5, 24), 0xffd23a, { y: 0.08, rx: Math.PI / 2, sz: 0.5 }), P(cyl(1.0, 1.0, 0.03, 20), 0xfff2a8, { y: 0.03 })]), h: 0.1, r: 1.2 }; },
  star() { return { geo: merge([P(new THREE.OctahedronGeometry(0.32), 0xffe24a, { sy: 1.3 })]), h: 0.4, r: 0.3, unlit: true }; },
  coin() { return { geo: merge([P(new THREE.OctahedronGeometry(0.3), 0xff3a4a, { sz: 0.35, sy: 1.25 })]), h: 0.4, r: 0.3, unlit: true }; },
  ring() { return { geo: merge([P(tor(1.25, 0.13, 6, 22), 0xffc830, {})]), h: 2.5, r: 1.3 }; },
  sparkle() { return { geo: merge([P(new THREE.OctahedronGeometry(0.2), 0xd8f4ff, { sz: 0.4, sy: 1.3 })]), h: 0.3, r: 0.2, unlit: true }; },
  finish() {
    const parts = [P(cyl(0.06, 0.06, 3.0, 5), 0xf4f4f4, { y: 1.5 })];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) parts.push(P(box(0.02, 0.22, 0.22), (i + j) % 2 ? 0x111111 : 0xffffff, { y: 2.75 - j * 0.22, z: 0.12 + i * 0.22 }));
    return { geo: merge(parts), h: 3, r: 0.2 };
  },
};

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

  // --- matériaux et couches -----------------------------------------------------------------
  const litMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  const unlitMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const wingMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshBasicMaterial({ map: M.glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), color: 0x0a1a28, transparent: true, opacity: 0.26, depthWrite: false });
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
  for (const d of plan.defis) { const c = d.critter || (d.type === 'whack' ? 'marmot' : d.type === 'fish' ? 'fish' : null); if (c) defiCritters[c] = (defiCritters[c] || 0) + (d.chicks ? d.chicks.length : 1) + 2; }
  for (const k in pal.fauna) {
    const f = pal.fauna[k], mdl = MODELS[f.model](f.colors || {});
    const n = countKind(plan.fauna, k) + (defiCritters[k] || 0) + (f.extra || 0);
    faunaModel[k] = { f, mdl, body: layer('f_' + k, mdl.body, mdl.unlit ? unlitMat : litMat, n + 2, !!mdl.tint), flap: mdl.flap ? layer('w_' + k, mdl.flap, wingMat, (n + 2) * 2, false) : null };
  }
  const propModel = {};
  const propCount = {};
  for (const p of plan.props) propCount[p.kind] = (propCount[p.kind] || 0) + 1;
  const propKinds = new Set([...Object.keys(propCount), 'marker', 'star', 'coin', 'ring', 'sparkle', 'chest', 'lid', 'hole', 'finish']);
  const extraProp = { marker: plan.defis.length, star: plan.defis.length, coin: 12, ring: 12, sparkle: 0, chest: plan.secrets.length, lid: plan.secrets.length, hole: 0, finish: 2 };
  for (const t of plan.trails) extraProp.sparkle += t.pts.length;
  extraProp.sparkle += 40;   // paillettes qui tombent des sapins, des coffres…
  for (const e of plan.fauna) if (pal.fauna[e.kind] && pal.fauna[e.kind].hole) extraProp.hole++;
  for (const d of plan.defis) if (d.holes) extraProp.hole += d.holes.length;
  for (const k of propKinds) {
    const pk = pal.props[k] || {};
    const mdl = PROPS[pk.model || k](pk.colors || {});
    const n = (propCount[k] || 0) + (extraProp[k] || 0);
    propModel[k] = { pk, mdl, l: layer('p_' + k, mdl.geo, mdl.mat || (mdl.unlit ? unlitMat : litMat), n + 2, k === 'hat' || !!pk.tint) };
    if (mdl.shadow) propModel[k].l.mesh.castShadow = true;
  }
  // chapeaux des bonshommes (teintés)
  const hatL = layer('p_hat', VILLAGER.hat(), litMat, (propCount.snowman || 0) + 6, true);
  // habitants
  const vill = { body: layer('v_dog', VILLAGER.dog(), litMat, 24, true), cloth: layer('v_cloth', VILLAGER.dogCloth(), litMat, 24, true), arm: layer('v_arm', VILLAGER.arm(), litMat, 48, true),
    snow: layer('v_snow', VILLAGER.snowman(), litMat, 3, false), snowArm: layer('v_snowarm', VILLAGER.snowArm(), litMat, 6, false), yeti: layer('v_yeti', VILLAGER.yeti(), litMat, 2, false), yetiArm: layer('v_yetiarm', VILLAGER.yetiArm(), litMat, 4, false) };
  const tools = {};
  for (const v of plan.villagers) if (v.tool && !tools[v.tool]) tools[v.tool] = layer('t_' + v.tool, VILLAGER[v.tool](), litMat, plan.villagers.filter(q => q.tool === v.tool).length + 1, false);

  // --- entités -------------------------------------------------------------------------------
  const C = new THREE.Color();
  const creatures = [];
  for (const def of plan.fauna) {
    const fm = faunaModel[def.kind]; if (!fm) continue;
    const f = fm.f, n = def.n || f.group || 1;
    const flock = { def, cx: def.x, cz: def.z, t: 0, up: false };
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (def.rot || 0), rr = n > 1 ? 1 + (i % 3) * 0.9 : 0;
      const x = def.x + Math.cos(a) * rr, z = def.z + Math.sin(a) * rr;
      creatures.push({ def, kind: def.kind, fm, f, flock: n > 1 ? flock : null, i, hx: def.x, hz: def.z, x, z, y: def.perch !== undefined ? def.perch : ground(x, z), yaw: a + 1.6, s: 'idle', t: R() * 3, ph: R() * 10,
        hop: 0, vy: 0, fly: 0, tint: f.tints ? f.tints[(i + Math.round(def.x)) % f.tints.length] : null, scale: (f.scale || 1) * (0.9 + ((i * 7 + Math.round(def.z)) % 5) * 0.05), petT: -9, followT: 0, under: f.ai === 'burrow' ? 1 : 0 });
    }
  }
  const cGrid = new PointGrid(16);
  for (const c of creatures) cGrid.add({ x: c.hx, z: c.hz, c });
  const props = plan.props.map((def, i) => ({ def, i, kind: def.kind, x: def.x, y: def.y, z: def.z, yaw: def.rot || 0, wob: -9, sq: -9, broken: 0, ring: -9, r: def.kind === 'ball' ? 0.5 : 0, rot: 0, bx: def.x, bz: def.z, on: false }));
  const propById = new Map(props.map(p => [p.def.id, p]));
  const pGrid = new PointGrid(16);
  for (const p of props) pGrid.add({ x: p.def.x, z: p.def.z, p });
  const villagers = plan.villagers.map((def, i) => ({ def, i, x: def.x, y: def.y, z: def.z, yaw: def.yaw || 0, ph: i * 1.7, awake: !def.sleepy, wave: -9, run: null }));
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
  const st = { D: null, drops: [], ev: [], seq: 0, seen: 0, near: { c: [], p: [], v: [], s: [] }, nearT: 0, barkSeen: new Map(), hudT: 0, wasDone: null };
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
  }
  /** Rejoue un effet (chez l'hôte tout de suite, chez les amis à la réception). */
  function playEvent(type, a, b) {
    const p = props[a];
    if (type === 'pad') { if (p) p.sq = game.t; chirp('ting'); note(72 + PENTA[b % PENTA.length], 'mallet', 0.1); }
    else if (type === 'wob') { if (p) p.wob = game.t; }
    else if (type === 'ring') { if (p) p.ring = game.t; note((p && p.def.note) || 79, 'bell', 0.14); }
    else if (type === 'note') note(a, 'bell', 0.12);
    else if (type === 'chest') { const c = chests[a]; if (c) c.open = game.t; }
    else if (type === 'press') { if (p) { p.sq = game.t; p.on = !!b; } }
    else if (type === 'wave') { const v = villagers[a]; if (v) v.wave = game.t; }
    else if (type === 'chirp') chirp(['chirp', 'squeak', 'hoot', 'honk', 'whistle', 'grunt', 'ting', 'splash', 'yip'][a] || 'ting');
  }
  const CHIRPS = ['chirp', 'squeak', 'hoot', 'honk', 'whistle', 'grunt', 'ting', 'splash', 'yip'];

  // --- paillettes (récompenses qui tombent, traînées) -------------------------------------------
  function gone(id) { const g = sv().gone[id]; if (!g) return false; if (Date.now() - g > REGROW_MS) { delete sv().gone[id]; return false; } return true; }
  function dropSparkles(x, y, z, n, value) {
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, sp = 1.5 + R() * 2;
      st.drops.push({ x, y: y + 0.3, z, vx: Math.cos(a) * sp, vy: 5 + R() * 3, vz: Math.sin(a) * sp, t: 0, v: value || 1 });
    }
    if (st.drops.length > 40) st.drops.splice(0, st.drops.length - 40);
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
  const KIND_NAMES = { coins: 'Les pièces rouges', rings: 'Les anneaux', race: 'La course', chase: 'Attrape-le !', pads: 'Les trampolines', whack: 'Tape-taupe', fish: 'La pêche', tag: 'Chat perché', xylo: 'La mélodie de glace', herd: 'Les petits perdus' };
  function defiTime(d) { return game.easy ? Infinity : (d.time || 45); }
  function startDefi(def, P) {
    if (st.D) return;
    const D = { def, id: def.id, t: defiTime(def), cd: def.type === 'race' ? 3 : 0, got: [], i: 0, who: P.id || 0, crit: [], phase: 'play', seqT: 0, seq: [], k: 0, last: 0 };
    if (def.type === 'race') { const p = def.path[0]; D.crit = [{ x: p[0], z: p[1], y: ground(p[0], p[1]), yaw: 0, s: 0, a: 0 }]; }
    if (def.type === 'chase') { const a = R() * TAU; D.crit = [{ x: def.x + Math.cos(a) * 6, z: def.z + Math.sin(a) * 6, y: 0, yaw: 0, a: 0 }]; }
    if (def.type === 'tag') D.crit = def.kids.map((id) => { const v = villById.get(id); return { x: v.x, z: v.z, y: v.y, yaw: 0, a: 0, id, tagged: false }; });
    if (def.type === 'herd') D.crit = def.chicks.map(([x, z]) => ({ x, z, y: ground(x, z), yaw: R() * TAU, a: 0, st: 'lost', who: -1 }));
    if (def.type === 'whack' || def.type === 'fish') { D.crit = def.holes.map(([x, z]) => ({ x, z, y: ground(x, z), up: 0, t: 0, yaw: R() * TAU, hit: 0 })); D.next = 1; }
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
        if (free.length) { const c = free[Math.floor(R() * free.length)]; c.up = T === 'fish' ? 1.5 : (game.easy ? 2.2 : 1.4); c.t = 0; c.hit = 0; c.yaw = R() * TAU; if (T === 'fish') event('chirp', 7); }
        D.next = T === 'fish' ? 1.0 + R() * 0.8 : 0.6 + R() * 0.6;
      }
      for (const c of D.crit) {
        if (c.up <= 0) continue;
        c.t += dt; c.up -= dt;
        if (c.hit) continue;
        // position du poisson en l'air (un arc au-dessus du trou)
        const k = clamp(c.t / 1.5, 0, 1), fy = c.y + (T === 'fish' ? Math.sin(k * Math.PI) * 2.6 : 0.5), fx = c.x + (T === 'fish' ? Math.sin(c.yaw) * (k - 0.5) * 2 : 0), fz = c.z + (T === 'fish' ? Math.cos(c.yaw) * (k - 0.5) * 2 : 0);
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
    } else if (T === 'herd') {
      for (const c of D.crit) {
        if (c.st === 'home') { c.a += dt * 3; continue; }
        if (c.st === 'lost') {
          c.a += dt * 2;
          for (const P of players) if (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 1.8) { c.st = 'follow'; c.who = P.id || 0; event('chirp', 8); game.bubble({ pos: new THREE.Vector3(c.x, c.y + 0.8, c.z), small: true }, 'Waf !'); break; }
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
            P.padChain = game.t - (P.padAt || -9) < 2.2 ? (P.padChain || 0) + 1 : 0; P.padAt = game.t;
            event('pad', p.i, P.padChain);
            game.sound('boing'); game.burst(p.x, top + 0.2, p.z, 10, 0xbfeaff, 3, 0.4);
            if (P.padChain === 4 && P === game.me) game.localBanner('Rebonds en chaîne !', '', 1000);
          }
        } else if (act === 'shake' || act === 'break' || act === 'chime' || act === 'hat' || act === 'press') {
          const r = (pk.r || propModel[p.kind].mdl.r || 0.8);
          // (un carillon sonne quand on arrive contre lui, pas tant qu'on y reste collé)
          const touch = act === 'chime' && d < r + 0.9 && Math.abs(dy) < 2;
          const fresh = touch && !p.touching; if (touch) p.touchT = game.t;
          const bump = (attacking(P) && d < r + 1.8 && Math.abs(dy) < 2.5) || (sp > 5 && d < r + 0.8 && Math.abs(dy) < 1.5 && act !== 'chime') || (act === 'press' && d < r + 0.3 && dy > 0.2 && dy < 1.2 && P.vel.y <= 0) || fresh;
          if (touch) p.touching = true;
          if (bump) hitProp(p, P, pk);
        }
      }
      for (const P2 of barks) if (P2 === P) for (const q of pGrid.within(P.pos.x, P.pos.z, 7)) { const pk = pal.props[q.p.kind] || {}; if (['shake', 'chime', 'hat'].includes(pk.act) && q.p.broken <= game.t) hitProp(q.p, P, pk, true); }
      // boules de neige qu'on pousse : elles roulent et grossissent
      if (P.grounded) for (const q of pGrid.within(P.pos.x, P.pos.z, 6)) {
        const b = q.p; if (b.kind !== 'ball' || b.broken > game.t) continue;
        const dx = b.x - P.pos.x, dz = b.z - P.pos.z, d = Math.hypot(dx, dz);
        if (d > b.r + 0.75 || sp < 1) continue;
        const nx = dx / (d || 1), nz = dz / (d || 1), push = Math.max(0, P.vel.x * nx + P.vel.z * nz);
        const tx = P.pos.x + nx * (b.r + 0.76) + nx * push * dt, tz = P.pos.z + nz * (b.r + 0.76) + nz * push * dt;
        if (L.blockedAt && L.blockedAt(tx, tz)) continue;
        if (Math.abs(ground(tx, tz) - ground(b.x, b.z)) > 0.5) continue;
        const moved = Math.hypot(tx - b.x, tz - b.z);
        b.x = tx; b.z = tz; b.rot += moved / b.r; b.y = ground(b.x, b.z); b.r = Math.min(1.5, b.r + moved * 0.035);
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
    // une boule abandonnée revient à sa place
    for (const p of props) if (p.kind === 'ball' && p.moved && game.t - p.moved > 40 && game.players.every(P => Math.hypot(P.pos.x - p.x, P.pos.z - p.z) > 30)) { p.x = p.bx; p.z = p.bz; p.r = 0.5; p.y = ground(p.x, p.z); p.moved = 0; }
  }
  function hitProp(p, P, pk, byBark) {
    const act = pk.act;
    if (game.t - (p.hitT || -9) < (act === 'chime' ? 0.35 : 0.9)) return;
    p.hitT = game.t;
    if (act === 'shake' || act === 'hat') {
      event('wob', p.i);
      game.burst(p.x, p.y + (propModel[p.kind].mdl.h || 2) * 0.8, p.z, act === 'hat' ? 10 : 22, 0xffffff, 3, 0.9);
      game.sound(act === 'hat' ? 'boing' : 'poof');
      const id = 'p:' + p.def.id;
      if (pk.drop && !gone(id)) { sv().gone[id] = Date.now(); dropSparkles(p.x, p.y + 1.5, p.z, pk.drop, 1); if (P === game.me && !st.shakeTold) { st.shakeTold = true; game.localBanner('Des paillettes !', 'Secouez les sapins, cassez les tas de neige : il y a des trésors partout', 2600); } }
    } else if (act === 'break') {
      if (byBark) return;
      p.broken = game.t + (pk.respawn || 45);
      game.sound('crate'); game.burst(p.x, p.y + 0.6, p.z, 26, pk.color || 0xf4f8ff, 5, 0.7);
      if (R() < (pk.chance === undefined ? 0.6 : pk.chance)) dropSparkles(p.x, p.y + 0.6, p.z, 1 + Math.floor(R() * (pk.drop || 2)), 1);
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
      if (p.def.effect === 'geyser') st.geyser = { x: p.def.gx || p.x, z: p.def.gz || p.z, t: game.t + 6 };
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
    if ((L.blockedAt && L.blockedAt(nx, nz)) || (c.f.ai !== 'slide' && c.f.onIce === false && L.iceAt && L.iceAt(nx, nz))) { c.t = 0; return true; }
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
    const th = threat(c);
    const barkNear = barks.some(P => Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < (f.hear || 12));
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
        c.y = ground(c.x, c.z); c.pitch = Math.max(0, Math.sin(c.ph * 6 + c.i)) * 0.5; c.flapA = 0;
      } else {
        // en vol : on tourne au-dessus de la maison, puis on se repose
        c.fly -= dt;
        const cx = c.hx, cz = c.hz, dx = c.x - cx, dz = c.z - cz, d = Math.hypot(dx, dz) || 1, R0 = 6 + (c.i % 3) * 2;
        const tx = -dz / d * c.circ, tz = dx / d * c.circ;
        c.vx += (tx * 6 - c.vx + (-dx / d) * (d - R0) * 0.6) * dt * 1.5; c.vz += (tz * 6 - c.vz + (-dz / d) * (d - R0) * 0.6) * dt * 1.5;
        const gy = ground(c.x, c.z), want = c.fly > 1.2 ? gy + 6 + (c.i % 4) : gy;
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
        c.flapA = 0; c.pitch = 0; c.head = Math.sin(c.ph * 0.7) * 0.3;
        if (th.d < 22 && (c.hootT = (c.hootT || 3 + R() * 8) - dt) <= 0) { c.hootT = 8 + R() * 10; if (th.P === game.me) chirp('hoot'); }
        if (barkNear || (th.d < 3 && Math.abs(th.P.pos.y - c.y) < 3)) { c.fly = 7; c.circ = R() < 0.5 ? -1 : 1; c.vx = 0; c.vz = 0; c.vy = 3; game.bubble({ pos: new THREE.Vector3(c.x, c.y + 1, c.z), small: true }, 'Hou-hou !'); }
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
        c.x = c.hx + Math.sin(c.yaw) * (k - 0.5) * 1.6; c.z = c.hz + Math.cos(c.yaw) * (k - 0.5) * 1.6; c.y = ground(c.hx, c.hz) - 0.3 + Math.sin(k * Math.PI) * 1.8; c.pitch = (k - 0.5) * 2.2;
        if (c.j >= 1) { c.j = undefined; c.t = 2 + R() * 4; c.y = -500; if (th.d < 30) game.burst(c.hx, ground(c.hx, c.hz) + 0.1, c.hz, 6, 0x9ad8ff, 2, 0.4); }
      } else c.y = -500;
      return;
    }
    if (ai === 'hover') {
      const a = c.ph * (0.6 + (c.i % 3) * 0.2) + c.i;
      let tx = c.hx + Math.cos(a) * 2.5, tz = c.hz + Math.sin(a * 1.3) * 2.5;
      if (th.d < 3) { tx += (c.x - th.P.pos.x) * 2; tz += (c.z - th.P.pos.z) * 2; }
      if (barkNear && !c.sc) { c.sc = 1.5; }
      if (c.sc > 0) { c.sc -= dt; tx = c.hx + Math.cos(c.i * 2.4) * 6; tz = c.hz + Math.sin(c.i * 2.4) * 6; }
      c.x += (tx - c.x) * dt * 1.5; c.z += (tz - c.z) * dt * 1.5; c.y = ground(c.x, c.z) + 1.2 + Math.sin(c.ph * 2 + c.i) * 0.5 + (c.sc > 0 ? 2 : 0); c.yaw = c.ph;
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
    const shy = f.shy !== false && !f.pet;
    if (barkNear && c.s !== 'flee') { flee(c, th.P, th.d, true); c.hopY = f.hopper !== false ? 0.9 : 0.3; if (th.d < 12 && R() < 0.5 && f.say) game.bubble({ pos: new THREE.Vector3(c.x, c.y + (c.fm.mdl.h || 1) * c.scale, c.z), small: true }, f.say[0]); }
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
    v.act = def.act || 'idle';
    const home = def.yaw || 0;
    v.yaw = lerpAngle(v.yaw, dd < 7 && v.awake && v.act !== 'shovel' && v.act !== 'fish' ? Math.atan2(me.pos.x - v.x, me.pos.z - v.z) : home, Math.min(1, dt * 3));
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
  function drawCreature(fm, x, y, z, yaw, pitch, roll, sc, sqy, flapA, tint) {
    compose(x, y, z, yaw, pitch, roll, sc, sc * (sqy || 1), sc);
    fm.body.push(m4, tint);
    if (fm.flap) {
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
      if (k >= 0.4 && (v.lastK === undefined || v.lastK < 0.4) && Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 45) game.spawnParticle(v.x + Math.sin(v.yaw) * 0.4, v.y + 1.3 * (def.scale || 1), v.z + Math.cos(v.yaw) * 0.4, Math.sin(v.yaw) * 7, 4.5, Math.cos(v.yaw) * 7, 0xffffff, 0.32, 1.1, 9);
      v.lastK = k;
    }
    else if (act === 'chisel') { const k = Math.sin(ph * 7); armR = -1.0 + k * 0.4; armL = -1.2; lean = 0.2; }
    else if (act === 'stir') { armR = -1.1; armRz = Math.sin(ph * 3) * 0.3; armL = -0.5; }
    else if (act === 'flag') { armR = -2.5 + Math.sin(ph * 2) * 0.3; armL = -0.2; }
    else if (act === 'cheer') { armR = -2.8; armL = -2.8; bob = Math.abs(Math.sin(ph * 8)) * 0.3; toolOn = false; }
    else { armR = Math.sin(ph * 1.2) * 0.08; armL = -Math.sin(ph * 1.2) * 0.08; bob = Math.sin(ph * 2) * 0.02; }
    if (waving) { armR = -2.7 + Math.sin(ph * 12) * 0.3; armRz = 0.3; }
    const sc = def.scale || 1;
    if (def.body === 'penguin') {
      const fm = faunaModel[def.model || 'skater'] || faunaModel.penguin;
      if (fm) drawCreature(fm, v.x, v.y + bob, v.z, v.yaw, 0, act === 'skate' ? Math.sin(ph * 2.2) * 0.15 : 0, sc, 1, act === 'skate' ? 0.6 + Math.sin(ph * 2.2) * 0.4 : waving ? 1.2 : 0.1);
      shadow(v.x, v.z, 0.5 * sc);
      return;
    }
    if (def.body === 'snowman' || def.body === 'yeti') {
      const big = def.body === 'yeti', L1 = big ? vill.yeti : vill.snow, LA = big ? vill.yetiArm : vill.snowArm;
      const wake = v.awake ? 1 : 0;
      compose(v.x, v.y + (wake ? Math.abs(Math.sin(ph * (waving ? 9 : 1.5))) * 0.06 : 0), v.z, v.yaw, 0, wake ? Math.sin(ph * 1.3) * 0.05 : 0, sc);
      L1.push(m4);
      const base = mB.copy(m4);
      for (const sd of [-1, 1]) {
        const ang = sd > 0 ? (waving ? 2.4 + Math.sin(ph * 12) * 0.3 : 0.9 + wake * Math.sin(ph * 2) * 0.2) : 0.9;
        m5.copy(base).multiply(m6.compose(v4.set(sd * (big ? 0.85 : 0.42), big ? 2.0 : 1.42, 0), q4.setFromEuler(e4.set(0, 0, sd * ang)), one));
        LA.push(m5);
      }
      if (!big) { m5.copy(base).multiply(m6.makeTranslation(0, 2.22, 0)); hatL.push(m5, C.setHex(def.hat || 0x2a2430)); }
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
      if (c.f.hole) { compose(c.hx, ground(c.hx, c.hz), c.hz, 0, 0, 0, 1); propModel.hole.l.push(m4); }
      if (c.y < -100) continue;
      const fm = c.fm, ai = c.f.ai;
      let pitch = c.pitch || 0, roll = 0, sqy = 1;
      if (ai === 'slide' && c.slide > 0) { pitch = 1.35; }
      if (ai === 'slide' && !(c.slide > 0)) roll = c.s === 'walk' ? Math.sin(c.ph * 9) * 0.12 : Math.sin(c.ph * 2) * 0.04;
      if (c.s === 'pet') sqy = 1 + Math.sin(c.ph * 12) * 0.08;
      if (ai === 'burrow' && c.under > 0.98) continue;
      drawCreature(fm, c.x, c.y + (c.hop || 0), c.z, c.yaw, pitch, roll, c.scale, sqy, ai === 'slide' ? (c.s === 'walk' ? Math.sin(c.ph * 8) * 0.6 : 0) : c.flapA, c.tint !== null && c.tint !== undefined ? C.setHex(c.tint) : undefined);
      if (ai === 'hover') glow(c.x, c.y, c.z, 1.2, c.f.glow || 0x9ad8ff, 0.8);
      else if (ai !== 'jump' && ai !== 'perch' && !(c.fly > 0 && c.y - ground(c.x, c.z) > 4)) shadow(c.x, c.z, (c.fm.mdl.r || 0.3) * c.scale);
    }
    // objets
    for (const p of st.near.p) {
      const pm = propModel[p.kind]; if (!pm) continue;
      const pk = pm.pk;
      if (p.broken > game.t) { if (p.kind === 'ball' && p.def) { /* elle revient bientôt */ } continue; }
      let pitch = 0, roll = 0, sy = 1, sx = 1, y = p.y;
      const w = game.t - p.wob; if (w < 1.2) { roll = Math.sin(w * 22) * 0.18 * (1 - w / 1.2); pitch = Math.cos(w * 19) * 0.08 * (1 - w / 1.2); }
      const s = game.t - p.sq; if (s < 0.6) { const k = Math.sin(s / 0.6 * Math.PI * 3) * (1 - s / 0.6); sy = 1 - k * 0.35; sx = 1 + k * 0.2; }
      const rg = game.t - p.ring; if (rg < 0.8) roll += Math.sin(rg * 30) * 0.05 * (1 - rg / 0.8);
      if (p.kind === 'ball') { compose(p.x, y + p.r, p.z, p.yaw, p.rot, 0, p.r); pm.l.push(m4); shadow(p.x, p.z, p.r); continue; }
      if (p.kind === 'button' && p.on) sy *= 0.7;
      compose(p.x, y, p.z, p.yaw, pitch, roll, sx * (p.def.s || 1), sy * (p.def.s || 1), sx * (p.def.s || 1));
      pm.l.push(m4, p.def.tint !== undefined ? C.setHex(p.def.tint) : undefined);
      if (p.kind === 'snowman') {
        const hw = game.t - p.wob, hop = hw < 1.0 ? Math.sin(hw / 1.0 * Math.PI) * 1.2 : 0, spin = hw < 1 ? hw * 9 : 0;
        m5.copy(m4).multiply(m6.compose(v4.set(0, 2.0 + hop, 0), q4.setFromEuler(e4.set(0, spin, 0)), one));
        hatL.push(m5, C.setHex(p.def.hat || 0x2a2430));
      }
      if (p.kind === 'chime' && rg < 0.8) glow(p.x, p.y + 2.0, p.z, 2.4, 0xbfeaff, 1 - rg / 0.8);
      if (p.kind === 'lantern' && p.on) glow(p.x, p.y + 2.35, p.z, 2.2, 0xffd890, 0.9);
      if (p.kind === 'drift' && st.D && st.D.def.type === 'pads' && st.D.def.pads.includes(p.def.id) && !st.D.got.includes(p.def.id)) glow(p.x, p.y + 0.8, p.z, 3.5, 0x8af0ff, 0.6 + Math.sin(t * 8) * 0.3);
      if (pk.shadow) shadow(p.x, p.z, pk.shadow);
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
    if (st.geyser && st.geyser.t > game.t && R() < dt * 40) { const g = st.geyser; game.spawnParticle(g.x + (R() - 0.5) * 0.6, ground(g.x, g.z) + 0.3, g.z + (R() - 0.5) * 0.6, (R() - 0.5) * 2.5, 9 + R() * 4, (R() - 0.5) * 2.5, R() < 0.3 ? 0xbfeaff : 0xffffff, 0.35, 1.6, 9); }
    if (cfg.renderExtra) cfg.renderExtra(dt, t, { glow, layer: (n) => layers.get(n) });
    for (const l of layers.values()) l.end();
    // le bandeau de quête suit le défi (chrono)
    if ((st.hudT -= dt) <= 0) { st.hudT = 0.25; const q = questText(); if (q !== st.hudQ) { st.hudQ = q; game.updateHud(); } }
  }
  function drawDefi(D, t) {
    const def = D.def, T = def.type;
    if (T === 'coins') def.items.forEach((it, i) => { if (D.got.includes(i)) return; compose(it.x, it.y + Math.sin(t * 3 + i) * 0.15, it.z, t * 3 + i, 0, 0, 1.2); propModel.coin.l.push(m4); glow(it.x, it.y, it.z, 2.0, 0xff4a5a, 0.8); });
    if (T === 'rings') def.rings.forEach((r, i) => { if (i < D.i) return; compose(r.x, r.y, r.z, r.yaw || 0, 0, 0, i === D.i ? 1 + Math.sin(t * 6) * 0.06 : 0.85); propModel.ring.l.push(m4); if (i === D.i) glow(r.x, r.y, r.z, 3.5, 0xffd23a, 0.5); });
    if (T === 'race') {
      const e = def.path[def.path.length - 1];
      compose(e[0], ground(e[0], e[1]), e[1], 0, 0, 0, 1); propModel.finish.l.push(m4); glow(e[0], ground(e[0], e[1]) + 3, e[1], 3, 0xffffff, 0.6);
    }
    if (T === 'race' || T === 'chase' || T === 'herd') {
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
      const fm = faunaModel[T === 'fish' ? (def.critter || 'fish') : (def.critter || 'marmot')];
      for (const c of D.crit) {
        compose(c.x, c.y, c.z, 0, 0, 0, 1); propModel.hole.l.push(m4);
        if (c.up <= 0 || !fm) continue;
        if (T === 'whack') { const k = c.hit ? clamp(c.up / 0.35, 0, 1) : clamp(c.t / 0.15, 0, 1); drawCreature(fm, c.x, c.y - 0.9 + k * 0.9, c.z, c.yaw, 0, 0, fm.f.scale || 1, c.hit ? 0.6 : 1, 0); glow(c.x, c.y + 0.9, c.z, 1.2, 0xffe070, 0.4); }
        else { const k = clamp(c.t / 1.5, 0, 1); if (c.hit) continue; drawCreature(fm, c.x + Math.sin(c.yaw) * (k - 0.5) * 2, c.y + Math.sin(k * Math.PI) * 2.6, c.z + Math.cos(c.yaw) * (k - 0.5) * 2, c.yaw, (k - 0.5) * 2.4, 0, 1.6, 1, 0); }
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
      : T === 'whack' || T === 'fish' ? `${D.got.length}/${def.need}` : T === 'tag' || T === 'chase' ? `${D.crit.filter(c => c.tagged).length}/${D.crit.length}` : T === 'herd' ? `${D.crit.filter(c => c.st === 'home').length}/${D.crit.length}`
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
      if (!b) { if (p.broken > game.t) p.broken = 0; if (p.kind === 'ball') { p.x = p.bx; p.z = p.bz; p.r = 0.5; p.y = ground(p.x, p.z); } p.on = false; continue; }
      p.broken = b[1] > 0 ? game.t + b[1] : 0;
      if (p.kind === 'ball') { p.rot += Math.hypot(b[2] - p.x, b[3] - p.z) / (p.r || 1); p.x = b[2]; p.z = b[3]; p.r = b[4]; p.y = ground(p.x, p.z); }
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
