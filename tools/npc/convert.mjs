// Personnages non joueurs : convertit un modèle GLB (Objaverse / Sketchfab, licence CC-BY)
// au format compact du jeu, une « partie » par matériau :
//   <nom>.bin  : pour chaque partie, positions f32, normales i8, uv f32, indices u16/u32
//   <nom>.json : parties (décalages, texture ou couleur), taille
//   <nom>_<k>.webp : textures
// Le modèle est tourné (avant = +z), posé au sol (y = 0), centré, mis à la hauteur voulue,
// et simplifié (meshoptimizer) s'il a trop de triangles.
// Usage : node convert.mjs <entrée.glb> <nom> <hauteur_m> <rotY_degrés> <triangles_max> [taille_texture=1024]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [src, name, hArg, rotArg, maxArg, texArg] = process.argv.slice(2);
const HEIGHT = +hArg, ROT = (+rotArg || 0) * Math.PI / 180, MAXTRI = +maxArg || 30000, TEX = +texArg || 1024;
const OUT = process.env.OUT || path.join(path.dirname(new URL(import.meta.url).pathname), '../../public/adventure/assets/npc');
fs.mkdirSync(OUT, { recursive: true });
await MeshoptSimplifier.ready;
const doc = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(src);
const root = doc.getRoot();

// matrices du monde
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]; return o; };
const parts = new Map();   // matériau -> { pos, nor, uv, idx }
function visit(node, parent) {
  const M = mul(parent, node.getMatrix());
  const mesh = node.getMesh();
  if (mesh && !node.getSkin()) addMesh(mesh, M);
  else if (mesh) addMesh(mesh, M);   // (maillage avec squelette : pose de repos)
  for (const ch of node.listChildren()) visit(ch, M);
}
function addMesh(mesh, M) {
  for (const p of mesh.listPrimitives()) {
    if (p.getMode() !== 4) continue;
    const P = p.getAttribute('POSITION'), N = p.getAttribute('NORMAL'), T = p.getAttribute('TEXCOORD_0'), I = p.getIndices();
    const mat = p.getMaterial();
    if (!parts.has(mat)) parts.set(mat, { pos: [], nor: [], uv: [], idx: [], hasUV: !!T });
    const q = parts.get(mat), base = q.pos.length / 3;
    const v = [0, 0, 0], n = [0, 0, 0];
    for (let i = 0; i < P.getCount(); i++) {
      P.getElement(i, v);
      const x = M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12], y = M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13], z = M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14];
      q.pos.push(x, y, z);
      if (N) { N.getElement(i, n); const nx = M[0] * n[0] + M[4] * n[1] + M[8] * n[2], ny = M[1] * n[0] + M[5] * n[1] + M[9] * n[2], nz = M[2] * n[0] + M[6] * n[1] + M[10] * n[2], l = Math.hypot(nx, ny, nz) || 1; q.nor.push(nx / l, ny / l, nz / l); } else q.nor.push(0, 1, 0);
      if (T) { const t = [0, 0]; T.getElement(i, t); q.uv.push(t[0], t[1]); } else q.uv.push(0, 0);
    }
    if (I) for (let i = 0; i < I.getCount(); i++) q.idx.push(base + I.getScalar(i));
    else for (let i = 0; i < P.getCount(); i++) q.idx.push(base + i);
  }
}
const scene = root.getDefaultScene() || root.listScenes()[0];
for (const n of scene.listChildren()) visit(n, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

// rotation, mise au sol, centrage, échelle
const c = Math.cos(ROT), s = Math.sin(ROT);
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (const q of parts.values()) {
  for (let i = 0; i < q.pos.length; i += 3) {
    const x = q.pos[i], z = q.pos[i + 2];
    q.pos[i] = c * x + s * z; q.pos[i + 2] = -s * x + c * z;
    const nx = q.nor[i], nz = q.nor[i + 2];
    q.nor[i] = c * nx + s * nz; q.nor[i + 2] = -s * nx + c * nz;
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q.pos[i + k]); mx[k] = Math.max(mx[k], q.pos[i + k]); }
  }
}
const k = HEIGHT / (mx[1] - mn[1]), cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
for (const q of parts.values()) for (let i = 0; i < q.pos.length; i += 3) { q.pos[i] = (q.pos[i] - cx) * k; q.pos[i + 1] = (q.pos[i + 1] - mn[1]) * k; q.pos[i + 2] = (q.pos[i + 2] - cz) * k; }

// simplification (proportionnelle) et compactage
let total = 0; for (const q of parts.values()) total += q.idx.length / 3;
const ratio = Math.min(1, MAXTRI / total);
function compact(q, idx) {
  const map = new Map(), pos = [], nor = [], uv = [], out = new Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    const v = idx[i]; let w = map.get(v);
    if (w === undefined) { w = map.size; map.set(v, w); pos.push(q.pos[v * 3], q.pos[v * 3 + 1], q.pos[v * 3 + 2]); nor.push(q.nor[v * 3], q.nor[v * 3 + 1], q.nor[v * 3 + 2]); uv.push(q.uv[v * 2], q.uv[v * 2 + 1]); }
    out[i] = w;
  }
  return { pos, nor, uv, idx: out };
}
const bufs = [], meta = [];
let off = 0, ti = 0;
const push = (b) => { const buf = Buffer.from(b.buffer, b.byteOffset, b.byteLength); const pad = (4 - (off % 4)) % 4; if (pad) { bufs.push(Buffer.alloc(pad)); off += pad; } const o = off; bufs.push(buf); off += buf.length; return o; };
let tris = 0;
for (const [mat, q] of parts) {
  let idx = q.idx;
  if (ratio < 0.999 && idx.length > 300) {
    const target = Math.max(3, Math.floor(idx.length * ratio / 3) * 3);
    const [res] = MeshoptSimplifier.simplify(new Uint32Array(idx), new Float32Array(q.pos), 3, target, 0.02, ['LockBorder']);
    idx = Array.from(res);
  }
  const g = compact(q, idx);
  const n = g.pos.length / 3, big = n > 65535;
  const entry = { vertices: n, indices: g.idx.length, big, offsets: [] };
  entry.offsets.push(push(new Float32Array(g.pos)));
  entry.offsets.push(push(new Int8Array(g.nor.map(v => Math.round(Math.max(-1, Math.min(1, v)) * 127)))));
  entry.offsets.push(push(new Float32Array(g.uv)));
  entry.offsets.push(push(big ? new Uint32Array(g.idx) : new Uint16Array(g.idx)));
  const bc = mat ? mat.getBaseColorFactor() : [1, 1, 1, 1];
  entry.color = bc.slice(0, 3).map(v => +v.toFixed(3));
  entry.rough = mat ? +mat.getRoughnessFactor().toFixed(2) : 0.8;
  const tex = mat && mat.getBaseColorTexture();
  if (tex && q.hasUV) {
    const file = `${name}_${ti++}.webp`;
    await sharp(Buffer.from(tex.getImage())).resize(TEX, TEX, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(path.join(OUT, file));
    entry.tex = file;
  }
  meta.push(entry); tris += g.idx.length / 3;
}
fs.writeFileSync(path.join(OUT, name + '.bin'), Buffer.concat(bufs));
const size = [(mx[0] - mn[0]) * k, HEIGHT, (mx[2] - mn[2]) * k].map(v => +v.toFixed(3));
fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({ parts: meta, size }));
console.log(name, parts.size, 'parties', Math.round(tris), 'triangles', (off / 1024 | 0) + ' Ko', 'taille', size.join(' x '));
