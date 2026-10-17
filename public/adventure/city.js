/*
 * Matcha & Ainu — Niveau 3 « Port-Croquette » : construction du décor de la
 * grande ville (rues, immeubles, port, docks, collines, foire, plage, stade).
 * La géométrie est fusionnée par tuiles de 64 m : les tuiles lointaines sont
 * masquées. Les règles du jeu (karts, missions, circulation) sont dans cityplay.js.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as M from './models.js';
import * as K from './citykit.js';
import * as SC from './sculpt.js';
import * as RT from './realtex.js';
import { LOOK } from './world.js';
import { buildPlay } from './cityplay.js';

export { coinGeometry } from './citykit.js';

const TILE = 64;

/** Géométrie colorée (pour fusionner des pièces de couleurs différentes). */
function tinted(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, c = new THREE.Color(color), a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const part = (geo, color, x, y, z, rx, ry, rz) => ({ geo: tinted(geo, color), x, y, z, rx, ry, rz });

/**
 * Relief des façades (rendu réaliste) : appuis de fenêtre en saillie, linteaux,
 * bandeaux d'étage, balcons en fer forgé, cheminées. Calé sur les fenêtres de la
 * texture (une travée de 3 m, fenêtre entre 25 % et 75 % de la largeur).
 */
function facadeRelief(T, b, sides, cx, cz, y0, y1, lite) {
  const g = T.geo('plain', cx, cz), stone = 0xe6dccb, iron = 0x2a2e30;
  const floors = Math.floor((y1 - y0) / 3 + 0.01);
  const big = b.h >= 10 && !b.house && !b.villa;
  let k = 0;
  for (const [ax, az, bx, bz] of sides) {
    const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len, nx = -dz, nz = dx;
    const cells = Math.floor(len / 3);
    const at = (u, out) => [ax + dx * u + nx * out, az + dz * u + nz * out];
    const slab = (u0, u1, ya, yb, o0, o1, col) => {
      const [x0, z0] = at(u0, o0), [x1, z1] = at(u1, o1);
      g.box(Math.min(x0, x1), Math.max(x0, x1), ya, yb, Math.min(z0, z1), Math.max(z0, z1), col, 1);
    };
    // soubassement et chaînes d'angle en pierre de taille
    if (!lite) {
      slab(0, len, y0 - 0.22, y0 + 0.12, 0, 0.16, stone);
      if (big) for (let yq = y0 + 0.12, i = 0; yq < y1 - 0.5; yq += 0.55, i++) {
        const w = i % 2 ? 0.45 : 0.75;
        slab(0, w, yq, yq + 0.5, 0, 0.07, 0xd8ccb6);
        slab(len - w, len, yq, yq + 0.5, 0, 0.07, 0xd8ccb6);
      }
    }
    for (let f = 0; f < floors; f++) {
      const fy = y0 + f * 3;
      // bandeau d'étage
      if (f > 0 && !lite) slab(0, len, fy - 0.08, fy + 0.06, 0, 0.12, stone);
      for (let c = 0; c < cells; c++) {
        const u = c * 3;
        slab(u + 0.62, u + 2.38, fy + 0.58, fy + 0.7, 0, 0.2, stone);                       // appui
        if (!lite) slab(u + 0.66, u + 2.34, fy + 2.56, fy + 2.68, 0, 0.1, stone);           // linteau
        if (!lite && big) {                                                                  // encadrement mouluré
          slab(u + 0.56, u + 0.68, fy + 0.7, fy + 2.56, 0, 0.09, stone);
          slab(u + 2.32, u + 2.44, fy + 0.7, fy + 2.56, 0, 0.09, stone);
          slab(u + 0.56, u + 2.44, fy + 2.68, fy + 2.86, 0, 0.16, stone);                     // fronton plat
        }
        // balcon : un sur deux, au milieu de la façade, à partir du 2e étage
        if (big && !lite && f >= 1 && f % 2 === 1 && c === Math.floor(cells / 2) && (k++ % 2 === 0)) {
          slab(u + 0.3, u + 2.7, fy + 0.25, fy + 0.4, 0, 0.9, 0xd8d0c4);
          slab(u + 0.3, u + 2.7, fy + 1.3, fy + 1.36, 0.84, 0.9, iron);                     // main courante
          for (let i = 0; i <= 8; i++) slab(u + 0.3 + i * 0.3 - 0.02, u + 0.3 + i * 0.3 + 0.02, fy + 0.4, fy + 1.3, 0.85, 0.89, iron);
          for (const e of [0.3, 2.66]) slab(u + e, u + e + 0.04, fy + 0.4, fy + 1.3, 0, 0.9, iron);
        }
      }
    }
  }
  // cheminées sur les maisons
  if ((b.house || b.villa) && !lite) {
    const top = b.top + 0.05;
    for (const [px, pz] of [[b.x0 + 1.2, b.z0 + 1.2], [b.x1 - 1.4, b.z1 - 1.6]]) {
      g.box(px - 0.35, px + 0.35, top, top + 1.4, pz - 0.35, pz + 0.35, 0xa8603e, 1);
      g.box(px - 0.42, px + 0.42, top + 1.4, top + 1.55, pz - 0.42, pz + 0.42, 0x8a8a8a, 1);
    }
  }
}

/** Mobilier urbain détaillé, instancié : on l'ajoute au fil de l'eau puis done() le pose. */
function streetProps(sc, S, G, spots, lite) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 });
  const iron = 0x2a2e30, wood = 0x9a6a42;
  const kinds = {
    bench: M.mergeGeos([
      ...[0, 1, 2, 3].map(i => part(new THREE.BoxGeometry(1.9, 0.05, 0.11), wood, 0, 0.47, -0.2 + i * 0.13)),
      ...[0, 1, 2].map(i => part(new THREE.BoxGeometry(1.9, 0.11, 0.04), wood, 0, 0.66 + i * 0.14, 0.26 + i * 0.015, -0.12)),
      ...[-0.85, 0.85].flatMap(sx => [
        part(new THREE.BoxGeometry(0.06, 0.47, 0.06), iron, sx, 0.235, -0.22), part(new THREE.BoxGeometry(0.06, 0.95, 0.06), iron, sx, 0.47, 0.25, -0.12),
        part(new THREE.BoxGeometry(0.06, 0.05, 0.55), iron, sx, 0.44, 0.02), part(new THREE.BoxGeometry(0.06, 0.05, 0.4), iron, sx, 0.68, -0.05, 0.4),
      ]),
    ]),
    hydrant: M.mergeGeos([
      part(new THREE.CylinderGeometry(0.16, 0.18, 0.08, 14), 0xb02a20, 0, 0.04, 0),
      part(new THREE.CylinderGeometry(0.13, 0.14, 0.55, 14), 0xc8382a, 0, 0.35, 0),
      part(new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xc8382a, 0, 0.62, 0),
      part(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14), 0xa82a20, 0, 0.6, 0),
      part(new THREE.CylinderGeometry(0.04, 0.04, 0.08, 8), 0xd8c070, 0, 0.78, 0),
      part(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10), 0xc8382a, 0.15, 0.42, 0, 0, 0, Math.PI / 2),
      part(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 10), 0xc8382a, -0.15, 0.42, 0, 0, 0, Math.PI / 2),
      part(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 10), 0xc8382a, 0, 0.42, 0.15, Math.PI / 2, 0, 0),
    ]),
    bin: M.mergeGeos([
      part(new THREE.CylinderGeometry(0.28, 0.24, 0.85, 16, 1), 0x2e5a3a, 0, 0.43, 0),
      part(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), 0x22442c, 0, 0.88, 0),
      part(new THREE.SphereGeometry(0.27, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x22442c, 0, 0.9, 0),
      ...[0, 1, 2, 3, 4, 5].map(i => part(new THREE.BoxGeometry(0.03, 0.75, 0.02), 0x3e6e4a, Math.cos(i * 1.05) * 0.27, 0.43, Math.sin(i * 1.05) * 0.27, 0, -i * 1.05, 0)),
    ]),
    rack: M.mergeGeos([0, 1, 2, 3].map(i => part(new THREE.TorusGeometry(0.38, 0.03, 6, 16, Math.PI), 0x9aa0a8, 0, 0, i * 0.5))),
    kiosk: M.mergeGeos([
      part(new THREE.BoxGeometry(1.4, 1.5, 0.8), 0x2e4a38, 0, 0.85, 0),
      part(new THREE.BoxGeometry(1.6, 0.08, 1.0), 0x223a2a, 0, 1.64, 0),
      part(new THREE.BoxGeometry(1.25, 0.9, 0.04), 0xe8e0d0, 0, 0.95, 0.42),
      ...[0, 1, 2, 3, 4, 5].map(i => part(new THREE.BoxGeometry(0.34, 0.24, 0.03), [0xd84a4a, 0x4a8ad8, 0xf0c040, 0x7ac05a, 0xe0e0e0, 0xc87ad8][i], -0.42 + (i % 3) * 0.42, 0.8 + Math.floor(i / 3) * 0.32, 0.45)),
    ]),
  };
  const list = { bench: [], hydrant: [], bin: [], rack: [], kiosk: [] };
  spots.forEach(([x, z], i) => {
    if (i % 4 === 0) list.hydrant.push([x + 1.4, z, 0]);
    else if (i % 4 === 1) list.bin.push([x - 1.2, z, 0]);
  });
  const P = S.PLAZA;
  list.rack.push([P.x0 + 1.4, (P.z0 + P.z1) / 2, 0]);
  list.kiosk.push([P.x0 + 1.5, P.z0 + 7, Math.PI / 2]);
  list.bin.push([P.x0 + 6.2, P.z0 + 3, 0], [P.x1 - 6.2, P.z1 - 6, 0]);
  return {
    bench(x, z, along) { list.bench.push([x, z, along ? 0 : Math.PI / 2]); },
    done() {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1), e = new THREE.Euler();
      for (const [k, items] of Object.entries(list)) {
        if (!items.length) continue;
        const inst = new THREE.InstancedMesh(kinds[k], mat, items.length);
        items.forEach(([x, z, a], i) => { m4.compose(v.set(x, G + 0.02, z), q.setFromEuler(e.set(0, a, 0)), one); inst.setMatrixAt(i, m4); });
        inst.castShadow = !lite; inst.receiveShadow = true;
        inst.userData.noOutline = true;
        sc.add(inst);
      }
    },
  };
}

/** Regroupe la géométrie par tuile et par matériau, puis crée un maillage par paire. */
class Tiles {
  constructor() { this.map = new Map(); }
  geo(mat, x, z) {
    const i = Math.floor(x / TILE), j = Math.floor(z / TILE), k = i + ',' + j + '|' + mat;
    if (!this.map.has(k)) this.map.set(k, { i, j, mat, geo: new K.Geo() });
    return this.map.get(k).geo;
  }
  build(scene, mats, lite) {
    const out = [];
    for (const { i, j, mat, geo } of this.map.values()) {
      if (!geo.p.length) continue;
      const m = new THREE.Mesh(geo.build(), mats[mat]);
      m.receiveShadow = true;
      m.castShadow = !lite && !/ground|road|zebra|cross/.test(mat);
      scene.add(m);
      out.push({ obj: m, x: (i + 0.5) * TILE, z: (j + 0.5) * TILE, r: TILE * 0.75 });
    }
    return out;
  }
}

export function buildCity(game) {
  const decor = buildDecor(game);
  return buildPlay(game, decor);
}

function buildDecor(game) {
  const sc = game.scene, lite = game.lite;
  const S = L, G = S.GROUND;
  const T = new Tiles();
  const cull = [], moving = [], chars = [], anim = {};
  const shadowy = (o) => { o.traverse(k => { if (k.isMesh) { k.castShadow = !lite; k.receiveShadow = true; } }); return o; };
  const place = (o, x, z, r) => { sc.add(o); cull.push({ obj: o, x, z, r: r || 10 }); return o; };
  if (lite) { sc.fog.near = 70; sc.fog.far = 240; }

  // --- Matériaux partagés -------------------------------------------------------
  const mats = {
    ground: new THREE.MeshStandardMaterial({ map: K.tileTex('#dcd6cc', 'rgba(120,110,100,0.35)'), vertexColors: true, roughness: 0.9 }),
    groundCobble: new THREE.MeshStandardMaterial({ map: K.cobbleTex(), vertexColors: true, roughness: 0.9 }),
    groundConcrete: new THREE.MeshStandardMaterial({ map: K.tileTex('#c8c8cc', 'rgba(90,90,100,0.3)'), vertexColors: true, roughness: 0.85 }),
    groundWood: new THREE.MeshStandardMaterial({ map: K.woodTex(), vertexColors: true, roughness: 0.85 }),
    road: new THREE.MeshStandardMaterial({ map: K.roadTex(), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    cross: new THREE.MeshStandardMaterial({ map: K.asphaltTex(), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    zebra: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    shop: new THREE.MeshStandardMaterial({ map: K.shopTex(), vertexColors: true, roughness: 0.85 }),
    windows: new THREE.MeshStandardMaterial({ map: K.windowsTex(), vertexColors: true, roughness: 0.85 }),
    glass: new THREE.MeshStandardMaterial({ map: K.glassTex(), vertexColors: true, roughness: 0.35, metalness: 0.3 }),
    metal: new THREE.MeshStandardMaterial({ map: K.metalTex(), vertexColors: true, roughness: 0.6, metalness: 0.2 }),
    roof: new THREE.MeshStandardMaterial({ map: K.roofTex(), vertexColors: true, roughness: 0.95 }),
    plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }),
    shiny: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.4 }),
    container: new THREE.MeshStandardMaterial({ map: K.metalTex(), vertexColors: true, roughness: 0.55, metalness: 0.2 }),
  };
  // rendu réaliste : textures détaillées avec relief (briques, pavés, fissures…)
  if (LOOK.real && RT.hasPhotos()) {
    const real = (name, tex, extra) => { const m = mats[name] || (mats[name] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })); m.map = tex.map; m.normalMap = tex.normalMap; Object.assign(m, extra || {}); m.needsUpdate = true; };
    real('windows', RT.photoFacade('painted_plaster_wall', false));
    real('windowsBrick', RT.photoFacade('red_brick', true), { roughness: 0.9 });
    real('shop', RT.photoShop());
    real('groundCobble', RT.photo('cobblestone_floor_04', 1), { roughness: 0.85 });
    real('ground', RT.photo('rectangular_paving', 1));
    real('groundConcrete', RT.photo('rectangular_paving', 1));
    real('road', RT.photoRoad(), { roughness: 0.9 });
    real('cross', RT.photo('asphalt_02', 1), { roughness: 0.9 });
    const rf = RT.photo('clay_roof_tiles', 1); real('roof', rf);
  } else if (LOOK.real) {
    const real = (name, tex, extra) => { const m = mats[name] || (mats[name] = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })); m.map = tex.map; m.normalMap = tex.normalMap; Object.assign(m, extra || {}); m.needsUpdate = true; };
    real('windows', RT.facadeTex(false));
    real('windowsBrick', RT.facadeTex(true), { roughness: 0.9 });
    real('shop', RT.shopFrontTex());
    real('groundCobble', RT.cobbleTex(), { roughness: 0.8 });
    real('ground', RT.slabTex('#d4cec4'));
    real('groundConcrete', RT.slabTex('#c4c4c6'));
    real('road', RT.asphaltTex(true), { roughness: 0.9 });
    real('cross', RT.asphaltTex(false), { roughness: 0.9 });
    mats.cobbleGrey = mats.groundCobble;
  }
  const brickish = (b) => LOOK.real && !b.tower && !b.warehouse && ((Math.round(b.x0 * 7 + b.z0 * 13) % 5 + 5) % 5 < 3);
  const slab = (mat, x0, x1, z0, z1, col, y) => {
    const g = T.geo(mat, (x0 + x1) / 2, (z0 + z1) / 2), top = y === undefined ? G + 0.06 : y;
    g.top(x0, x1, z0, z1, top, col, 4);
    g.wall(x0, z1, x1, z1, top - 0.4, top, col, 4, 1); g.wall(x1, z1, x1, z0, top - 0.4, top, col, 4, 1);
    g.wall(x1, z0, x0, z0, top - 0.4, top, col, 4, 1); g.wall(x0, z0, x0, z1, top - 0.4, top, col, 4, 1);
  };
  const boxG = (mat, x0, x1, y0, y1, z0, z1, col, s) => T.geo(mat, (x0 + x1) / 2, (z0 + z1) / 2).box(x0, x1, y0, y1, z0, z1, col, s);
  const boxC = (mat, c, col, s) => boxG(mat, c.x - c.w / 2, c.x + c.w / 2, c.y0, c.y1, c.z - c.d / 2, c.z + c.d / 2, col, s);

  // --- Sols : trottoirs, place, quais, cour des docks, foire, promenade de la plage -
  for (const b of S.BLOCKS) {
    if (b.type === 'houses') {
      const w = 1.6;
      slab('ground', b.x0, b.x1, b.z0, b.z0 + w, 0xffffff); slab('ground', b.x0, b.x1, b.z1 - w, b.z1, 0xffffff);
      slab('ground', b.x0, b.x0 + w, b.z0 + w, b.z1 - w, 0xffffff); slab('ground', b.x1 - w, b.x1, b.z0 + w, b.z1 - w, 0xffffff);
    } else if (b.type === 'plaza' || b.type === 'market') slab('groundCobble', b.x0, b.x1, b.z0, b.z1, 0xffffff);
    else if (b.type === 'warehouse') slab('groundConcrete', b.x0, b.x1, b.z0, b.z1, 0xc8c4bc);
    else if (b.type === 'garage') slab('groundConcrete', b.x0, b.x1, b.z0, b.z1, 0xb0aca8);
    else slab('ground', b.x0, b.x1, b.z0, b.z1, b.district === 'ouest' ? 0xe8e0d4 : 0xffffff);
  }
  const PR = S.PROMENADE, YD = S.YARD, FR = S.FAIR;
  slab('ground', PR.x0, PR.x1, PR.z0, PR.z1, 0xf4ece0);
  slab('groundConcrete', YD.x0, YD.x1, YD.z0, YD.z1, 0xb8b4ac);
  slab('groundCobble', FR.x0, FR.x1, FR.z0, FR.z1, 0xf0e0c8);
  slab('groundWood', S.BEACH_X, 196, S.COAST + S.ROAD_HW, S.COAST + S.ROAD_HW + 4, 0xffffff);
  slab('groundConcrete', S.SKATE.x0, S.SKATE.x1, S.SKATE.z0, S.SKATE.z1, 0xd8d8dc);
  slab('groundConcrete', S.RINK.x0, S.RINK.x1, S.RINK.z0, S.RINK.z1, 0x7a8ad8, G + 0.08);

  // --- Rues : tronçons droits (marquage), carrefours, passages piétons, route des collines
  {
    const flatR = S.ROADS.filter(r => r.flat), Y = G + 0.03;
    const vert = flatR.filter(r => r.ax === r.bx), hori = flatR.filter(r => r.az === r.bz);
    const crossings = [];
    for (const v of vert) for (const h of hori) {
      const z0 = Math.min(v.az, v.bz), z1 = Math.max(v.az, v.bz), x0 = Math.min(h.ax, h.bx), x1 = Math.max(h.ax, h.bx);
      if (v.ax >= x0 - 0.1 && v.ax <= x1 + 0.1 && h.az >= z0 - 0.1 && h.az <= z1 + 0.1) crossings.push({ x: v.ax, z: h.az, v, h });
    }
    const pieces = (lo, hi, cuts) => {
      const cs = cuts.filter(c => c.at + c.hw > lo && c.at - c.hw < hi).sort((a, b) => a.at - b.at);
      const out = []; let p = lo;
      for (const c of cs) { if (c.at - c.hw > p + 0.1) out.push([p, c.at - c.hw]); p = Math.max(p, c.at + c.hw); }
      if (hi > p + 0.1) out.push([p, hi]);
      return out;
    };
    for (const v of vert) {
      const z0 = Math.min(v.az, v.bz), z1 = Math.max(v.az, v.bz), x = v.ax, hw = v.hw;
      for (const [a, b] of pieces(z0, z1, crossings.filter(c => c.v === v).map(c => ({ at: c.z, hw: c.h.hw })))) {
        T.geo('road', x, (a + b) / 2).quad([x - hw, Y, b], [x + hw, Y, b], [x + hw, Y, a], [x - hw, Y, a], [0, 1, 0], [0, b / 8, 1, b / 8, 1, a / 8, 0, a / 8], 0xffffff);
      }
    }
    for (const h of hori) {
      const x0 = Math.min(h.ax, h.bx), x1 = Math.max(h.ax, h.bx), z = h.az, hw = h.hw;
      for (const [a, b] of pieces(x0, x1, crossings.filter(c => c.h === h).map(c => ({ at: c.x, hw: c.v.hw })))) {
        T.geo('road', (a + b) / 2, z).quad([a, Y, z + hw], [b, Y, z + hw], [b, Y, z - hw], [a, Y, z - hw], [0, 1, 0], [1, a / 8, 1, b / 8, 0, b / 8, 0, a / 8], 0xffffff);
      }
    }
    const downtown = (x, z) => x > -112 && x < 28 && z > -70 && z < 94;
    for (const c of crossings) {
      const hx = c.v.hw, hz = c.h.hw;
      T.geo('cross', c.x, c.z).top(c.x - hx, c.x + hx, c.z - hz, c.z + hz, Y + 0.004, 0xffffff, 4);
      if (!downtown(c.x, c.z)) continue;
      const zg = T.geo('zebra', c.x, c.z);
      for (let i = -3; i <= 3; i++) {
        const o = i * 1.1;
        if (c.z - hz - 2.6 > Math.min(c.v.az, c.v.bz)) zg.top(c.x + o - 0.35, c.x + o + 0.35, c.z - hz - 2.6, c.z - hz - 0.4, Y + 0.008, 0xf4f4f0, 4);
        if (c.z + hz + 2.6 < Math.max(c.v.az, c.v.bz)) zg.top(c.x + o - 0.35, c.x + o + 0.35, c.z + hz + 0.4, c.z + hz + 2.6, Y + 0.008, 0xf4f4f0, 4);
        if (c.x - hx - 2.6 > Math.min(c.h.ax, c.h.bx)) zg.top(c.x - hx - 2.6, c.x - hx - 0.4, c.z + o - 0.35, c.z + o + 0.35, Y + 0.008, 0xf4f4f0, 4);
        if (c.x + hx + 2.6 < Math.max(c.h.ax, c.h.bx)) zg.top(c.x + hx + 0.4, c.x + hx + 2.6, c.z + o - 0.35, c.z + o + 0.35, Y + 0.008, 0xf4f4f0, 4);
      }
    }
    // route des collines : ruban qui épouse le relief
    for (const r of S.ROADS.filter(q => !q.flat)) {
      const len = Math.hypot(r.bx - r.ax, r.bz - r.az), n = Math.ceil(len / 2), dx = (r.bx - r.ax) / len, dz = (r.bz - r.az) / len, nx = -dz, nz = dx;
      const g = T.geo('road', (r.ax + r.bx) / 2, (r.az + r.bz) / 2);
      const ext = r.hw;   // prolongé pour couvrir les virages
      for (let i = 0; i < n; i++) {
        const t0 = -ext + (len + 2 * ext) * i / n, t1 = -ext + (len + 2 * ext) * (i + 1) / n;
        const P = (t, s) => { const x = r.ax + dx * t + nx * r.hw * s, z = r.az + dz * t + nz * r.hw * s; return [x, S.heightAt(x, z) + 0.09, z]; };
        g.quad(P(t0, -1), P(t0, 1), P(t1, 1), P(t1, -1), [0, 1, 0], [0, t0 / 8, 1, t0 / 8, 1, t1 / 8, 0, t1 / 8], 0xffffff);
      }
    }
  }

  // --- Immeubles -----------------------------------------------------------------
  const GF = 3.4;
  for (const b of S.buildings) {
    const { x0, x1, z0, z1 } = b, top = b.top, g0 = b.ground, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const sides = [[x0, z1, x1, z1], [x1, z1, x1, z0], [x1, z0, x0, z0], [x0, z0, x0, z1]];
    // rendu réaliste : couleurs de pierre calcaire et d'enduit plutôt que pastel
    const fcol = LOOK.real && !b.tower ? new THREE.Color(b.color).lerp(new THREE.Color(0xdccfb8), 0.62).getHex() : b.color;
    const tc = new THREE.Color(LOOK.real ? 0xd6cab4 : b.color).multiplyScalar(0.82).getHex();
    const upper = b.tower ? 'glass' : 'windows';
    for (const [ax, az, bx, bz] of sides) {
      if (b.base < g0 - 0.05) T.geo('plain', cx, cz).wall(ax, az, bx, bz, b.base - 0.5, g0, 0xb8ae9e, 2, 2);   // soubassement (pente)
      if (b.warehouse) T.geo('metal', cx, cz).wall(ax, az, bx, bz, g0, top - 0.4, b.color, 2, 4);
      else if (b.house || b.villa) T.geo(brickish(b) ? 'windowsBrick' : 'windows', cx, cz).wall(ax, az, bx, bz, g0, top - 0.4, brickish(b) ? 0xf4ece4 : fcol, 3, 3);
      else {
        T.geo('shop', cx, cz).wall(ax, az, bx, bz, g0, g0 + GF, fcol, 3.4, GF);
        const brick = brickish(b);
        T.geo(brick ? 'windowsBrick' : upper, cx, cz).wall(ax, az, bx, bz, g0 + GF, top - 0.4, b.tower ? 0xffffff : brick ? new THREE.Color(0xffffff).lerp(new THREE.Color(b.color), 0.15).getHex() : fcol, 3, 3);
      }
    }
    if (LOOK.real && !b.tower && !b.warehouse) facadeRelief(T, b, sides, cx, cz, b.house || b.villa ? g0 : g0 + GF, top - 0.4, lite);
    const o = 0.25, tg = T.geo('plain', cx, cz);
    tg.box(x0 - o, x1 + o, top - 0.4, top + 0.05, z0 - o, z1 + o, b.tower ? 0xd8dce4 : tc, 2);
    if (LOOK.real && !b.tower && !b.warehouse && !lite) {
      // corniche moulurée : deux ressauts sous l'avancée du toit
      tg.box(x0 - 0.16, x1 + 0.16, top - 0.62, top - 0.4, z0 - 0.16, z1 + 0.16, 0xe2d8c6, 2);
      tg.box(x0 - 0.08, x1 + 0.08, top - 0.82, top - 0.62, z0 - 0.08, z1 + 0.08, 0xd6cab6, 2);
    }
    T.geo('roof', cx, cz).top(x0 - o, x1 + o, z0 - o, z1 + o, top + 0.05, b.roof, 4);
    if (!b.house && !b.villa && !b.warehouse) tg.box(x0 - 0.12, x1 + 0.12, g0 + GF - 0.15, g0 + GF + 0.1, z0 - 0.12, z1 + 0.12, tc, 2);
    if (b.h >= 13 && !b.tower) tg.box(cx + 1, cx + 2.6, top, top + 1.1, cz - 1, cz + 0.6, 0xb8bcc4, 1);   // climatiseur
    if (b.villa) {
      const p = b.pool;
      T.geo('plain', p.x, p.z).box(p.x - 3.4, p.x + 3.4, p.y - 0.3, p.y + 0.12, p.z - 2.4, p.z + 2.4, 0xe8e0d0, 2);
      T.geo('shiny', p.x, p.z).top(p.x - 2.8, p.x + 2.8, p.z - 1.8, p.z + 1.8, p.y + 0.14, 0x3ac0f0, 4);
    }
  }
  // beffroi de l'hôtel de ville
  {
    const HT = S.HALL.tower, x0 = HT.x - HT.w / 2, x1 = HT.x + HT.w / 2, z0 = HT.z - HT.d / 2, z1 = HT.z + HT.d / 2;
    const g = T.geo('windows', HT.x, HT.z);
    for (const [ax, az, bx, bz] of [[x0, z1, x1, z1], [x1, z1, x1, z0], [x1, z0, x0, z0], [x0, z0, x0, z1]]) g.wall(ax, az, bx, bz, S.HALL.b.top, HT.y1, 0xf2e6d0, 3, 3);
    boxG('plain', x0 - 0.3, x1 + 0.3, HT.y1, HT.y1 + 0.3, z0 - 0.3, z1 + 0.3, 0x5a6a80, 2);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.1, 4, 4), M.mat(0x4a5a78, { roughness: 0.7 }));
    cone.rotation.y = Math.PI / 4; cone.position.set(HT.x, HT.y1 + 2.3, HT.z);
    place(shadowy(cone), HT.x, HT.z, 6);
    const clock = K.canvasTex(128, 128, (x) => {
      x.fillStyle = '#fff8e8'; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill();
      x.strokeStyle = '#3a3a48'; x.lineWidth = 6; x.stroke();
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; x.fillStyle = '#3a3a48'; x.fillRect(64 + Math.cos(a) * 48 - 3, 64 + Math.sin(a) * 48 - 3, 6, 6); }
    }, false);
    for (let i = 0; i < 4; i++) { const p = K.plane(clock, 2.6, 2.6), a = i * Math.PI / 2; p.position.set(HT.x + Math.sin(a) * 2.03, HT.y1 - 2, HT.z + Math.cos(a) * 2.03); p.rotation.y = a; place(p, HT.x, HT.z, 4); }
    anim.hands = [];
    for (let i = 0; i < 2; i++) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.12, i ? 1.0 : 0.7, 0.05), M.mat(0x2a2a34)); h.geometry.translate(0, (i ? 1.0 : 0.7) / 2, 0); h.position.set(HT.x, HT.y1 - 2, HT.z + 2.1); place(h, HT.x, HT.z, 3); anim.hands.push(h); }
  }
  // balcons
  for (const b of S.balconies) {
    const g = T.geo('plain', b.x, b.z);
    g.box(b.x - b.w / 2, b.x + b.w / 2, b.top - 0.25, b.top, b.z - b.d / 2, b.z + b.d / 2, 0xf4f0ea, 2);
    g.box(b.x - 0.15, b.x + 0.15, b.top - 0.75, b.top - 0.25, b.z - 0.15, b.z + 0.15, 0xc8c0b4, 2);
  }
  // auvents rebondissants
  anim.awnings = S.awnings.map(a => {
    const g = new THREE.Group();
    const along = a.nx === 0;
    const len = along ? a.w : a.d, dep = along ? a.d : a.w;
    // (sculpt.js : toile rayée tendue en pente, lambrequin à festons, bras de fer forgé)
    const aw = SC.shopAwning(len, dep, a.color, { lite });
    aw.rotation.y = Math.atan2(a.nx, a.nz);
    g.add(aw);
    g.position.set(a.x, a.top, a.z);
    place(shadowy(g), a.x, a.z, 3);
    return { def: a, g };
  });
  // enseignes
  const sign = (text, b, opts, y, side) => {
    const p = K.plane(K.textTexture(text, opts), 5.2, 1.3);
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const n = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[side || b.side];
    p.position.set(cx + n[0] * ((b.x1 - b.x0) / 2 + 0.06), y || b.ground + GF + 0.9, cz + n[1] * ((b.z1 - b.z0) / 2 + 0.06));
    p.rotation.y = Math.atan2(n[0], n[1]);
    place(p, cx, cz, 6);
  };
  sign('BOULANGERIE', S.BAKERY, { bg: '#8a4a2a', border: '#f8d890' }, G + 4.4);
  sign('GARAGE DE RITA', S.GARAGE, { bg: '#c83a3a', font: 54 }, G + 4.4);
  sign('POLICE', S.POLICE, { bg: '#2a4ab0', border: '#ffffff' }, S.POLICE.top + 0.75);
  sign('HÔTEL DE VILLE', S.HALL.b, { bg: '#f2e6d0', fg: '#3a4a68', border: '#3a4a68', font: 56 }, S.HALL.b.top + 0.75);
  sign('CHEZ MIMI', S.SHOP, { bg: '#c84a8a', border: '#ffe0f0' }, G + 4.4);
  S.TOWERS.forEach((b) => sign(b.name.toUpperCase(), b, { bg: '#1a2a40', fg: '#ffd060', border: '#ffd060', font: 56 }, b.top + 0.75, 's'));

  // --- Ascenseurs vitrés ------------------------------------------------------------
  anim.elevators = S.elevators.map(c => {
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.2, 2.4), M.mat(0x8a96a8, { metalness: 0.5, roughness: 0.4 })); floor.position.y = -0.1;
    const glassM = new THREE.MeshStandardMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.25, roughness: 0.1 });
    for (const [x, z, w, d] of [[0, 1.15, 2.4, 0.1], [-1.15, 0, 0.1, 2.4], [1.15, 0, 0.1, 2.4]]) { const p = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), glassM); p.position.set(x, 1.2, z); p.userData.noOutline = true; g.add(p); }
    const roofE = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.15, 2.5), M.mat(0x8a96a8)); roofE.position.y = 2.45; g.add(roofE);
    g.add(floor);
    const shaft = new THREE.Group();
    for (const sx of [-1.25, 1.25]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.12, c.y1e - c.y0e + 3, 0.12), M.mat(0x5a6070, { metalness: 0.5 })); r.position.set(c.x + sx, (c.y0e + c.y1e + 3) / 2, c.z + 1.25); shaft.add(r); }
    place(shaft, c.x, c.z, 30);
    place(g, c.x, c.z, 30); moving.push(g);
    return { c, g };
  });

  // --- Marché, fontaine, kiosque, champignons, trampolines -------------------------
  // (sculpt.js : comptoir en planches, poteaux tournés, toile rayée bombée à festons, cagettes de fruits)
  let stallSeed = 0;
  const stall = (s) => {
    const g = SC.marketStall({ w: s.w, d: s.d, top: s.top - G, canopy: s.canopy - G, color: s.color }, { lite, seed: ++stallSeed });
    g.position.set(s.x, G, s.z);
    place(shadowy(g), s.x, s.z, 4);
  };
  for (const s of S.stalls) stall(s);
  for (const s of S.fairStalls) stall(s);
  const FO = S.FOUNTAIN;
  {
    let stone = M.mat(0xe8dcc8, { roughness: 0.8 }), basinMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 0.8, side: THREE.DoubleSide });
    if (LOOK.real) {
      const st = RT.stoneTex();
      st.map.repeat.set(4, 1); st.normalMap.repeat.set(4, 1);
      stone = new THREE.MeshStandardMaterial({ map: st.map, normalMap: st.normalMap, color: 0xd8d2c8, roughness: 0.85 });
      basinMat = new THREE.MeshStandardMaterial({ map: st.map, normalMap: st.normalMap, color: 0xd8d2c8, roughness: 0.85, side: THREE.DoubleSide });
    }
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(FO.r, FO.r + 0.2, FO.top - G + 0.3, 40, 1, true), basinMat);
    basin.position.set(FO.x, (FO.top + G - 0.3) / 2, FO.z);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(FO.r - 0.15, 0.25, 8, 40), stone); rim.rotation.x = Math.PI / 2; rim.position.set(FO.x, FO.top - 0.05, FO.z);
    anim.fountainWater = new THREE.Mesh(new THREE.CircleGeometry(FO.r - 0.35, 40), new THREE.MeshStandardMaterial({ color: 0x5ad0f0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }));
    anim.fountainWater.rotation.x = -Math.PI / 2; anim.fountainWater.position.set(FO.x, FO.top - 0.2, FO.z);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(FO.col * 0.8, FO.col, FO.colTop - G, 16), stone); col.position.set(FO.x, (FO.colTop + G) / 2, FO.z);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.5, 0.5, 24), stone); bowl.position.set(FO.x, FO.colTop - 1.4, FO.z);
    for (const o of [shadowy(basin), shadowy(rim), anim.fountainWater, shadowy(col), shadowy(bowl)]) place(o, FO.x, FO.z, 6);
    if (LOOK.real) {
      // vasque sculptée (profil tourné) et vraie eau : bassin à vaguelettes, rideau qui déborde, jet
      bowl.geometry = new THREE.LatheGeometry([[0.45, -0.35], [0.7, -0.3], [1.2, -0.12], [1.55, 0.08], [1.72, 0.22], [1.74, 0.3], [1.6, 0.3], [1.5, 0.12], [0.5, 0.02]].map(([r, y]) => new THREE.Vector2(r, y)), 40);
      const nc = document.createElement('canvas'); nc.width = nc.height = 128;
      const nx = nc.getContext('2d'); nx.fillStyle = '#808080'; nx.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 260; i++) { const v = 90 + Math.floor(Math.random() * 90); nx.fillStyle = `rgba(${v},${v},${v},0.5)`; nx.beginPath(); nx.arc(Math.random() * 128, Math.random() * 128, 3 + Math.random() * 9, 0, 7); nx.fill(); }
      const ht = new THREE.CanvasTexture(nc); ht.wrapS = ht.wrapT = THREE.RepeatWrapping;
      const wn = RT.normalFor(ht, 2.5); wn.wrapS = wn.wrapT = THREE.RepeatWrapping; wn.repeat.set(3, 3);
      anim.fountainWater.material = new THREE.MeshStandardMaterial({ color: 0x3a7a88, roughness: 0.04, metalness: 0.05, normalMap: wn, normalScale: new THREE.Vector2(0.6, 0.6), transparent: true, opacity: 0.86 });
      const curtainMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uTime; varying vec2 vUv;
          float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
          void main(){
            vec2 q = vec2(vUv.x * 90.0, vUv.y * 5.0 + uTime * 3.2);
            float st = n(q) * 0.6 + n(q * vec2(2.3, 1.7) + 4.0) * 0.4;
            float a = smoothstep(0.5, 0.85, st) * (0.12 + 0.38 * (1.0 - vUv.y)) + 0.05;
            float foam = smoothstep(0.14, 0.0, vUv.y) * (0.5 + 0.5 * st);
            vec3 col = mix(vec3(0.62, 0.78, 0.86), vec3(1.0), st * 0.5 + foam);
            gl_FragColor = vec4(col * 1.15, clamp(a + foam * 0.45, 0.0, 0.7));
          }`,
      });
      const lipY = FO.colTop - 1.4 + 0.3, waterY = FO.top - 0.2;
      const curtain = new THREE.Mesh(new THREE.CylinderGeometry(1.76, 2.15, lipY - waterY, 48, 1, true), curtainMat);
      curtain.position.set(FO.x, (lipY + waterY) / 2, FO.z); curtain.userData.noOutline = true; curtain.renderOrder = 2;
      const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.14, FO.colTop + 0.4 - lipY, 12, 1, true), curtainMat);
      jet.position.set(FO.x, (FO.colTop + 0.4 + lipY) / 2, FO.z); jet.userData.noOutline = true;
      const upper = new THREE.Mesh(new THREE.CircleGeometry(1.52, 32), anim.fountainWater.material);
      upper.rotation.x = -Math.PI / 2; upper.position.set(FO.x, lipY - 0.04, FO.z);
      for (const o of [curtain, jet, upper]) place(o, FO.x, FO.z, 6);
      anim.fountainCurtain = curtainMat;
    }
    anim.statue = new THREE.Mesh(M.boneGeometry(), M.GOLD());
    anim.statue.scale.setScalar(2.6); anim.statue.position.set(FO.x, FO.colTop + 0.5, FO.z);
    place(anim.statue, FO.x, FO.z, 4); moving.push(anim.statue);
  }
  const KI = S.KIOSK;
  {
    const wood = M.mat(0xf4ecdc, { roughness: 0.7 });
    const g = new THREE.Group();
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(KI.r, KI.r + 0.2, KI.floor - G + 0.3, 8), M.mat(0xc8b8a0, { roughness: 0.9 })); floor.position.y = (KI.floor - G - 0.3) / 2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(KI.roofR + 0.4, 2.2, 8), new THREE.MeshStandardMaterial({ map: K.stripeTex('#d84848', '#ffffff', 16), roughness: 0.6 })); roof.position.y = KI.roof + 0.9 - G;
    const slabK = new THREE.Mesh(new THREE.CylinderGeometry(KI.roofR, KI.roofR, 0.4, 8), wood); slabK.position.y = KI.roof - 0.2 - G;
    g.add(floor, roof, slabK);
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, KI.roof - KI.floor, 8), wood); p.position.set(Math.cos(a) * 2.6, (KI.roof + KI.floor) / 2 - 0.2 - G, Math.sin(a) * 2.6); g.add(p); }
    g.position.set(KI.x, G, KI.z);
    place(shadowy(g), KI.x, KI.z, 6);
  }
  anim.mushrooms = S.bouncers.filter(b => b.mushroom).map((b, i) => {
    // (sculpt.js : champignon charnu à pois en relief et lamelles, pied crépi ; trampoline à boudin rayé)
    const g = new THREE.Group();
    const tramp = b.bounce >= 20, H = b.top - b.base;
    const MM = SC.mushHouseMaterials(lite);
    let cap;
    if (tramp) {
      const T = SC.trampolineParts(b.r, H, { lite, a: [0x3a8ae0, 0xe04848, 0x40b060][i % 3], b: 0xffd23a });
      g.add(new THREE.Mesh(T.frame, SC.velvetMaterial(lite)));
      cap = new THREE.Mesh(T.mat, MM[2]);
    } else {
      g.add(new THREE.Mesh(SC.mushroomStemGeometry(0.42, H - 0.05, { lite }), MM[0]));
      const cg = SC.mushroomCapGeometry(b.r * 1.1, 0xff5ab8, { lite, seed: i + 1 }); cg.scale(1, 1 / 0.6, 1);   // (au repos, le chapeau est à l'échelle 0,6 en hauteur)
      cap = new THREE.Mesh(cg, MM[1]);
    }
    cap.position.y = H - (tramp ? 0 : 0.1); if (!tramp) cap.scale.y = 0.6;
    g.add(cap); g.position.set(b.x, b.base, b.z);
    place(shadowy(g), b.x, b.z, 4);
    return { def: b, cap, tramp };
  });

  // --- Rampes ----------------------------------------------------------------------
  {
    const stripes = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, map: K.stripeTex('#ffffff', '#ffe0a0', 8), side: THREE.DoubleSide });
    for (const c of S.ramps) {
      const rg = new K.Geo();
      const x0 = c.x - c.w / 2, x1 = c.x + c.w / 2, z0 = c.z - c.d / 2, z1 = c.z + c.d / 2, y0 = c.base - 0.2;
      const yAt = (x, z) => S.rampTop(c, x, z) + 0.04;
      const A = [x0, yAt(x0, z1), z1], B = [x1, yAt(x1, z1), z1], C = [x1, yAt(x1, z0), z0], D = [x0, yAt(x0, z0), z0];
      const col = c.d > 12 ? 0x9a9aa8 : 0xf0a030, side = c.d > 12 ? 0x7a7a88 : 0xd88a20;
      rg.tri(A, B, C, col); rg.tri(A, C, D, col);
      for (const [p, q] of [[A, B], [B, C], [C, D], [D, A]]) { rg.tri([p[0], y0, p[2]], [q[0], y0, q[2]], q, side); rg.tri([p[0], y0, p[2]], q, p, side); }
      const m = new THREE.Mesh(rg.build(), stripes); m.castShadow = !lite; m.receiveShadow = true;
      place(m, c.x, c.z, 10);
    }
    const F = S.FENCE;
    const graf = K.canvasTex(256, 64, (x, w, h) => {
      x.fillStyle = '#3a6ad0'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 16; i++) { x.fillStyle = 'rgba(0,0,0,0.15)'; x.fillRect(i * 16, 0, 2, h); }
      x.font = 'bold 34px Fredoka, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 6; x.strokeStyle = '#2a1408'; x.strokeText('SKATE !', w / 2, h / 2); x.fillStyle = '#ffd23a'; x.fillText('SKATE !', w / 2, h / 2);
    });
    const fg = new K.Geo(); fg.box(F.x0, F.x1, G, F.top, F.z0, F.z1, 0xffffff, F.top - G);
    place(shadowy(new THREE.Mesh(fg.build(), new THREE.MeshStandardMaterial({ map: graf, vertexColors: true, roughness: 0.8 }))), F.x0, (F.z0 + F.z1) / 2, 12);
  }

  // --- Port : quais, garde-corps, jetée, pontons, phare, bateaux ---------------------
  {
    for (let x = -125; x < S.BEACH_X; x += 40) boxG('plain', x, Math.min(S.BEACH_X, x + 40), -4, G + 0.08, S.PORT_QUAY, S.PORT_QUAY + 0.9, 0xb8ae9e, 2);
    for (let x = -203; x < -125; x += 40) boxG('plain', x, Math.min(-125, x + 40), -4, G + 0.08, S.DOCK_QUAY, S.DOCK_QUAY + 0.9, 0xa8a094, 2);
    boxG('plain', -125.5, -124.5, -4, G + 0.08, S.PORT_QUAY, S.DOCK_QUAY, 0xb8ae9e, 2);
    for (const r of S.RAILS) {
      if (r.z0 !== undefined) {
        const g = T.geo('shiny', r.x, (r.z0 + r.z1) / 2);
        for (let z = r.z0 + 0.5; z <= r.z1; z += 2.2) g.box(r.x - 0.07, r.x + 0.07, G, G + 1.0, z - 0.07, z + 0.07, 0x3a5a6a, 1);
        g.box(r.x - 0.06, r.x + 0.06, G + 0.88, G + 1.0, r.z0, r.z1, 0x3a5a6a, 1);
        g.box(r.x - 0.04, r.x + 0.04, G + 0.45, G + 0.52, r.z0, r.z1, 0x3a5a6a, 1);
        continue;
      }
      for (let x0 = r.x0; x0 < r.x1; x0 += 32) {
        const x1 = Math.min(r.x1, x0 + 32), g = T.geo('shiny', (x0 + x1) / 2, r.z);
        for (let x = x0 + 0.5; x <= x1; x += 2.2) g.box(x - 0.07, x + 0.07, G, G + 1.0, r.z - 0.07, r.z + 0.07, 0x3a5a6a, 1);
        g.box(x0, x1, G + 0.88, G + 1.0, r.z - 0.06, r.z + 0.06, 0x3a5a6a, 1);
        g.box(x0, x1, G + 0.45, G + 0.52, r.z - 0.04, r.z + 0.04, 0x3a5a6a, 1);
      }
    }
    const P = S.PIER;
    for (let z = P.z0; z < P.z1; z += 24) boxG('groundWood', P.x0, P.x1, G - 0.5, G + 0.02, z, Math.min(P.z1, z + 24), 0xffffff, 3);
    boxG('groundWood', P.px0, P.px1, G - 0.5, G + 0.02, P.pz0, P.pz1, 0xffffff, 3);
    for (const p of S.PONTOONS) boxG('groundWood', p.x - 1.5, p.x + 1.5, G - 0.7, G - 0.28, p.z0, p.z1, 0xe0d0b8, 3);
    const posts = [];
    for (let z = P.z0 + 2; z < P.z1; z += 4) posts.push([P.x0 + 0.3, z], [P.x1 - 0.3, z]);
    for (let x = P.px0 + 0.4; x < P.px1; x += 4) posts.push([x, P.pz0 + 0.3], [x, P.pz1 - 0.3]);
    for (const p of S.PONTOONS) for (let z = p.z0 + 3; z < p.z1; z += 5) posts.push([p.x - 1.3, z], [p.x + 1.3, z]);
    const pi = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.25, 7, 8), M.mat(0x6a4a30, { roughness: 0.9 }), posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach(([x, z], i) => { m4.makeTranslation(x, G - 3.6, z); pi.setMatrixAt(i, m4); });
    place(pi, -40, 140, 80);
    const LH = S.LIGHTHOUSE;
    const bands = K.canvasTex(16, 128, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#d83a3a' : '#fafafa'; x.fillRect(0, i * 16, 16, 16); } }, false);
    const lg = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(LH.r * 0.82, LH.r, LH.top - G - 0.6, 24), new THREE.MeshStandardMaterial({ map: bands, roughness: 0.6 })); body.position.y = (LH.top - 0.6 - G) / 2;
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(LH.capR, LH.capR, 0.6, 28), M.mat(0x3a3a48, { roughness: 0.5 })); gallery.position.y = LH.top - 0.3 - G;
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 16), new THREE.MeshStandardMaterial({ color: 0xfff4c0, emissive: 0xffd060, emissiveIntensity: 0.9, roughness: 0.2 })); lantern.position.y = LH.top + 0.8 - G;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.2, 16), M.mat(0xd83a3a, { roughness: 0.5 })); cap.position.y = LH.top + 2.2 - G;
    lg.add(body, gallery, lantern, cap);
    const stepMat = M.mat(0xa87a50, { roughness: 0.85 });
    for (const s of S.lighthouseSteps) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, 0.35, 16), stepMat); d.position.set(s.x - LH.x, s.top - 0.175 - G, s.z - LH.z); lg.add(d);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 2.2), M.mat(0x3a3a48)); arm.position.set((s.x - LH.x) / 2, s.top - 0.45 - G, (s.z - LH.z) / 2); arm.rotation.y = Math.atan2(s.x - LH.x, s.z - LH.z); lg.add(arm);
    }
    lg.position.set(LH.x, G, LH.z);
    sc.add(shadowy(lg));          // toujours visible : on le voit de loin
    anim.beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTexture(), color: 0xfff0a0, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    anim.beam.scale.set(8, 8, 1); anim.beam.position.set(LH.x, LH.top + 0.8, LH.z); sc.add(anim.beam);
  }
  anim.boats = S.BOATS.map((b, i) => {
    const m = K.buildBoat(b.color);
    m.position.set(b.x, 0, b.z); m.rotation.y = b.yaw;
    place(m, b.x, b.z, 6); moving.push(m);
    return { def: b, m, ph: i * 1.7 };
  });

  // --- Docks : conteneurs, grues, cargo ----------------------------------------------
  {
    for (const c of S.containers) boxG('container', c.x - 3.05, c.x + 3.05, c.y0, c.y0 + 2.6, c.z - 1.25, c.z + 1.25, c.color, 1.3);
    for (const cr of S.CRANES) {
      const g = T.geo('plain', cr.x, (cr.z0 + cr.z1) / 2);
      for (const [lx, lz] of [[cr.x - 5, cr.z0], [cr.x + 5, cr.z0], [cr.x - 5, cr.z1], [cr.x + 5, cr.z1]]) g.box(lx - 0.6, lx + 0.6, G - 0.5, cr.top - 1, lz - 0.6, lz + 0.6, 0xf0b020, 2);
      g.box(cr.x - 6, cr.x + 6, cr.top - 1, cr.top, cr.z0 - 1, cr.z1 + 1, 0xf0b020, 2);
      g.box(cr.x - 1.5, cr.x + 1.5, cr.top - 3.5, cr.top - 1, cr.z1 - 6, cr.z1 - 3, 0xe8e8e8, 1);
      g.box(cr.x - 0.6, cr.x + 0.6, cr.top - 1, cr.top - 0.6, cr.z1 + 1, cr.z1 + 24, 0xf0b020, 2);
      for (const s of cr.steps) g.box(s.x - 1.1, s.x + 1.1, s.top - 0.25, s.top, s.z - 1.1, s.z + 1.1, 0x8a8a94, 1);
    }
    const SH = S.SHIP;
    for (let x = SH.x0; x < SH.x1; x += 30) {
      const x1 = Math.min(SH.x1, x + 30), hull = T.geo('plain', (x + x1) / 2, (SH.z0 + SH.z1) / 2);
      hull.box(x, x1, -1, SH.deck - 0.1, SH.z0, SH.z1, 0x2a3a5a, 3);
      hull.box(x - 0.05, x1 + 0.05, -1.2, 0.8, SH.z0 - 0.05, SH.z1 + 0.05, 0xc83a3a, 3);
      T.geo('groundConcrete', (x + x1) / 2, (SH.z0 + SH.z1) / 2).top(x, x1, SH.z0, SH.z1, SH.deck, 0x8a6a5a, 4);
    }
    const cab = S.SHIP_CABIN;
    T.geo('windows', cab.x, cab.z).box(cab.x - cab.w / 2, cab.x + cab.w / 2, cab.y0, cab.y1, cab.z - cab.d / 2, cab.z + cab.d / 2, 0xf8f8f8, 3);
    const funnel = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 6, 16), M.mat(0xe8a020)); funnel.position.set(cab.x, cab.y1 + 3, cab.z);
    place(shadowy(funnel), cab.x, cab.z, 6);
    const name = K.plane(K.textTexture('LA BELLE CROQUETTE', { bg: 'rgba(0,0,0,0)', border: null, fg: '#ffffff', font: 46 }), 14, 3.5);
    name.position.set((SH.x0 + SH.x1) / 2, SH.deck - 2.5, SH.z1 + 0.06);
    place(name, name.position.x, SH.z1, 20);
  }

  // --- Collines : observatoire, château d'eau, lettres géantes ----------------------
  {
    const O = S.OBSERVATORY;
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(O.r, O.r + 0.3, O.top - O.y + 2, 32), M.mat(0xf4f0e8, { roughness: 0.7 })); body.position.y = (O.top - O.y + 2) / 2 - 2;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(O.r * 0.75, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.mat(0xc8ccd8, { metalness: 0.6, roughness: 0.3 })); dome.position.y = O.top - O.y;
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4, 12), M.mat(0x3a3a4a, { metalness: 0.5 })); scope.position.set(0, O.top - O.y + 2.4, 1.2); scope.rotation.x = -0.6;
    g.add(body, dome, scope);
    for (const s of S.obsSteps) { const d = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.3, 14), M.mat(0xb8b0a4)); d.position.set(s.x - O.x, s.top - 0.15 - O.y, s.z - O.z); g.add(d); }
    g.position.set(O.x, O.y, O.z);
    sc.add(shadowy(g));
    const W2 = S.WATER_TOWER, wt = new THREE.Group();
    for (const [dx, dz] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, W2.top - 3 - W2.g + 1, 8), M.mat(0x8a8a94)); l.position.set(dx, (W2.top - 3 - W2.g + 1) / 2 - 1, dz); wt.add(l); }
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 3, 24), M.mat(0x6ab0d8, { roughness: 0.5 })); tank.position.y = W2.top - 1.5 - W2.g;
    const tankTop = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.6, 24), M.mat(0x4a8ab0)); tankTop.position.y = W2.top + 0.8 - W2.g;
    wt.add(tank, tankTop);
    for (const s of W2.steps) { const d = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.25, 12), M.mat(0xa87a50)); d.position.set(s.x - W2.x, s.top - 0.12 - W2.g, s.z - W2.z); wt.add(d); }
    wt.position.set(W2.x, W2.g, W2.z);
    sc.add(shadowy(wt));
    for (const Lt of S.LETTERS) for (const c of Lt.boxes) boxC('plain', c, 0xfaf8f2, 2);
  }

  // --- Fête foraine ----------------------------------------------------------------
  {
    const WH = S.WHEEL;
    const wheel = new THREE.Group();
    const rimM = M.mat(0xf0f0f4, { metalness: 0.4, roughness: 0.4 });
    for (const dz of [-1.6, 1.6]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(WH.R + 0.4, 0.22, 8, 64), rimM); rim.position.z = dz; wheel.add(rim);
      for (let i = 0; i < WH.n; i++) { const a = i / WH.n * Math.PI * 2; const sp = new THREE.Mesh(new THREE.BoxGeometry(WH.R, 0.14, 0.14), rimM); sp.position.set(Math.cos(a) * WH.R / 2, Math.sin(a) * WH.R / 2, dz); sp.rotation.z = a; wheel.add(sp); }
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 3.6, 16), M.mat(0xe03a3a)); hub.rotation.x = Math.PI / 2; wheel.add(hub);
    const bulbs = new THREE.Mesh(new THREE.TorusGeometry(WH.R + 0.4, 0.12, 6, 64), new THREE.MeshStandardMaterial({ color: 0xffe080, emissive: 0xffc040, emissiveIntensity: 0.9 })); bulbs.position.z = 1.8; wheel.add(bulbs);
    wheel.position.set(WH.x, WH.hub, WH.z);
    sc.add(shadowy(wheel)); moving.push(wheel);
    anim.wheel = wheel;
    for (const sx of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.9, WH.hub - G + 1, 0.9), M.mat(0xd8dce4, { metalness: 0.4 })); leg.position.set(WH.x + sx * 6, (WH.hub + G) / 2, WH.z + 2.8); leg.rotation.z = -sx * 0.3;
      sc.add(shadowy(leg));
    }
    const gColors = [0xe04848, 0x3a8ae0, 0xf0b020, 0x40b060, 0xc050c0, 0xff7ab0];
    anim.gondolas = WH.gondolas.map((c, i) => {
      const g = new THREE.Group();
      const floor = new THREE.Mesh(new THREE.BoxGeometry(WH.size, 0.3, WH.size), M.mat(gColors[i % gColors.length])); floor.position.y = -0.15;
      const roofG = new THREE.Mesh(new THREE.ConeGeometry(WH.size * 0.75, 0.9, 4), M.mat(gColors[i % gColors.length])); roofG.position.y = 2.6; roofG.rotation.y = Math.PI / 4;
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.4, 6), M.mat(0x6a6a74)); bar.position.y = 1.2;
      g.add(floor, roofG, bar);
      sc.add(shadowy(g)); moving.push(g);
      return g;
    });
    const CA = S.CAROUSEL;
    const car = new THREE.Group();
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(CA.r, CA.r, CA.top - G, 28), new THREE.MeshStandardMaterial({ map: K.stripeTex('#f0d040', '#e04848', 16), roughness: 0.6 })); plat.position.y = (CA.top - G) / 2;
    const top = new THREE.Mesh(new THREE.ConeGeometry(CA.r + 0.6, 2.4, 20), new THREE.MeshStandardMaterial({ map: K.stripeTex('#ffffff', '#3a8ae0', 20), roughness: 0.6 })); top.position.y = 7.4;
    car.add(plat, top);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2, x = Math.cos(a) * (CA.r - 1.4), z = Math.sin(a) * (CA.r - 1.4);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 5.6, 6), M.GOLD()); pole.position.set(x, 3.6, z);
      const horse = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.8, 4, 8), M.mat([0xffffff, 0xf4c8a8, 0x9ad0f0, 0xf0b8c0][i % 4])); horse.rotation.set(Math.PI / 2, 0, -a); horse.position.set(x, 2.4, z);
      car.add(pole, horse);
    }
    car.position.set(CA.x, G, CA.z);
    place(shadowy(car), CA.x, CA.z, 10); moving.push(car);
    anim.carousel = car;
    const arch = K.plane(K.textTexture('FÊTE FORAINE', { bg: '#e04848', fg: '#fff6c0', border: '#ffd040', font: 60 }), 10, 2.5);
    arch.position.set(64, G + 6, S.FAIR.z0 - 0.5); arch.rotation.y = Math.PI;
    place(arch, 64, S.FAIR.z0, 8);
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 7, 10), M.mat(0xe04848)); p.position.set(64 + sx * 5.2, G + 3.5, S.FAIR.z0 - 0.5); place(shadowy(p), 64, S.FAIR.z0, 8); }
  }

  // --- Plage : cabines, parasols, poste de secours ----------------------------------
  {
    for (const h of S.huts) {
      const g = T.geo('plain', h.x, h.z);
      g.box(h.x - 2, h.x + 2, G - 0.5, G + 3, h.z - 1.6, h.z + 1.6, h.color, 1);
      g.box(h.x - 2.2, h.x + 2.2, G + 3, G + 3.25, h.z - 1.8, h.z + 1.8, 0xffffff, 1);
    }
    const n = S.PARASOLS.length;
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), M.mat(0xf0f0f0), n);
    const tops = new THREE.InstancedMesh(new THREE.ConeGeometry(1.4, 0.6, 12), new THREE.MeshStandardMaterial({ roughness: 0.6 }), n);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    S.PARASOLS.forEach((p, i) => {
      const y = S.heightAt(p.x, p.z);
      m4.makeTranslation(p.x, y + 1.2, p.z); poles.setMatrixAt(i, m4);
      m4.makeTranslation(p.x, y + 2.5, p.z); tops.setMatrixAt(i, m4); tops.setColorAt(i, c.set(p.color));
    });
    tops.castShadow = !lite;
    place(poles, 110, 114, 90); place(tops, 110, 114, 90);
    const LG = S.LIFEGUARD, lg = new THREE.Group(), y0 = S.heightAt(LG.x, LG.z);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, LG.top - y0, 6), M.mat(0xffffff)); p.position.set(dx, (LG.top - y0) / 2, dz); lg.add(p); }
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.3, 12), M.mat(0xe04848)); deck.position.y = LG.top - y0 - 0.15;
    const roofL = new THREE.Mesh(new THREE.ConeGeometry(2, 1.2, 4), M.mat(0xffffff)); roofL.position.y = LG.top - y0 + 2.6; roofL.rotation.y = Math.PI / 4;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), M.mat(0x40c060, { side: THREE.DoubleSide })); flag.position.set(0.5, LG.top - y0 + 3.6, 0);
    lg.add(deck, roofL, flag);
    for (const s of S.lifeguardSteps) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.25, 10), M.mat(0xa87a50)); d.position.set(s.x - LG.x, s.top - 0.12 - y0, s.z - LG.z); lg.add(d); }
    lg.position.set(LG.x, y0, LG.z);
    place(shadowy(lg), LG.x, LG.z, 6);
  }

  // --- Stade : piste, murets, tribunes ------------------------------------------------
  {
    const ST = S.STADIUM, tr = S.TRACK, n = tr.length, g = T.geo('road', ST.x, ST.z);
    for (let i = 0; i < n; i++) {
      const a = tr[i], b = tr[(i + 1) % n], c0 = tr[(i - 1 + n) % n], b2 = tr[(i + 2) % n];
      const na = Math.atan2(b.x - c0.x, b.z - c0.z), nb = Math.atan2(b2.x - a.x, b2.z - a.z);
      const off = (p, ang, s) => [p.x + Math.cos(ang) * ST.w / 2 * s, G + 0.04, p.z - Math.sin(ang) * ST.w / 2 * s];
      const A0 = off(a, na, -1), B0 = off(a, na, 1), C0 = off(b, nb, 1), D0 = off(b, nb, -1);
      const up = (B0[2] - A0[2]) * (C0[0] - A0[0]) - (B0[0] - A0[0]) * (C0[2] - A0[2]);   // composante verticale du produit vectoriel
      if (up >= 0) g.quad(A0, B0, C0, D0, [0, 1, 0], [0, i * 0.6, 1, i * 0.6, 1, (i + 1) * 0.6, 0, (i + 1) * 0.6], 0xffffff);
      else g.quad(D0, C0, B0, A0, [0, 1, 0], [0, (i + 1) * 0.6, 1, (i + 1) * 0.6, 1, i * 0.6, 0, i * 0.6], 0xffffff);
    }
    S.TRACK_WALLS.forEach((w, i) => {
      const x0 = Math.min(w.ax, w.bx) - 0.25, x1 = Math.max(w.ax, w.bx) + 0.25, z0 = Math.min(w.az, w.bz) - 0.25, z1 = Math.max(w.az, w.bz) + 0.25;
      boxG('plain', x0, x1, G, G + 1.1, z0, z1, i % 2 ? 0xe04848 : 0xffffff, 1);
    });
    for (const s of S.STANDS) boxG('plain', ST.x - 22, ST.x + 22, G - 0.5, s.top, s.z - 0.7, s.z + 0.7, 0x5a7ab0, 2);
    const start = S.TRACK[4];
    const line = new THREE.Mesh(new THREE.PlaneGeometry(1.2, ST.w), new THREE.MeshStandardMaterial({ map: K.checkerTex(), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4 }));
    line.rotation.x = -Math.PI / 2; line.position.set(start.x, G + 0.06, start.z); line.userData.noOutline = true;
    place(line, start.x, start.z, 8);
    for (const [x, z] of [[ST.x - 40, ST.z - 32], [ST.x + 40, ST.z - 32], [ST.x - 40, ST.z + 30], [ST.x + 40, ST.z + 30]]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 16, 8), M.mat(0x8a8a94)); pole.position.set(x, G + 8, z);
      const lamps = new THREE.Mesh(new THREE.BoxGeometry(3, 1.4, 0.6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4c0, emissiveIntensity: 0.7 })); lamps.position.set(x, G + 16.5, z);
      place(shadowy(pole), x, z, 10); place(lamps, x, z, 10);
    }
  }

  // --- Lampadaires et bancs -----------------------------------------------------------
  {
    const spots = [];
    for (const b of S.BLOCKS) if (b.district === 'centre' || b.district === 'ouest') for (const [x, z] of [[b.x0 + 0.9, b.z0 + 0.9], [b.x1 - 0.9, b.z0 + 0.9], [b.x0 + 0.9, b.z1 - 0.9], [b.x1 - 0.9, b.z1 - 0.9]]) spots.push([x, z]);
    for (let x = -118; x <= 190; x += 14) spots.push([x, S.COAST + S.ROAD_HW + 0.8]);
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 4.2, 8), M.mat(0x2a3a4a, { roughness: 0.5, metalness: 0.4 }), spots.length);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe8a0, emissiveIntensity: 0.6 }), spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach(([x, z], i) => { m4.makeTranslation(x, G + 2.1, z); pole.setMatrixAt(i, m4); m4.makeTranslation(x, G + 4.3, z); head.setMatrixAt(i, m4); });
    pole.castShadow = !lite;
    sc.add(pole, head);
    // mobilier urbain détaillé (rendu réaliste) : bancs à lattes, bouches d'incendie, poubelles, arceaux, kiosque
    const props = LOOK.real ? streetProps(sc, S, G, spots, lite) : null;
    const benchAt = (x, z, along) => {
      if (props) { props.bench(x, z, along); return; }
      const w = along ? 2 : 0.6, d = along ? 0.6 : 2, g = T.geo('plain', x, z);
      g.box(x - w / 2, x + w / 2, G + 0.45, G + 0.55, z - d / 2, z + d / 2, 0xa87a50, 1);
      for (const s of [-1, 1]) g.box(x + (along ? s * 0.8 : 0) - 0.06, x + (along ? s * 0.8 : 0) + 0.06, G, G + 0.45, z + (along ? 0 : s * 0.8) - 0.06, z + (along ? 0 : s * 0.8) + 0.06, 0x2a3a4a, 1);
    };
    for (let x = -112; x <= 16; x += 12) benchAt(x + 6, S.PORT_QUAY - 1.4, true);
    const P = S.PLAZA;
    benchAt(P.x0 + 4, P.z0 + 3, true); benchAt(P.x1 - 4, P.z1 - 6, true); benchAt(S.KIOSK.x - 3.5, S.KIOSK.z + 4.5, true);
    if (props) { benchAt(P.x1 - 4, P.z0 + 3, true); props.done(); }
  }

  const tiles = T.build(sc, mats, lite);
  return { tiles, cull, moving, chars, anim, mats };
}
