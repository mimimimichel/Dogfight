// Allège un arbre scanné Poly Haven pour le mode « ultra » :
//  - tronc et branches simplifiés (meshoptimizer) ;
//  - feuilles : on garde une petite partie des feuilles, agrandies (la couronne reste pleine).
// Sortie : <nom>_<partie>.bin/.json (format de plants.mjs) + textures webp.
// Usage : node tools/polyhaven/tree.mjs <dossier_gltf> <nom> [fraction_feuilles=0.03]
import { NodeIO } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [dir, name, keepArg] = process.argv.slice(2);
const KEEP = +(keepArg || 0.03);
const OUT = process.env.OUT || path.join(path.dirname(new URL(import.meta.url).pathname), '../../public/adventure/assets/ph');
await MeshoptSimplifier.ready;
const doc = await new NodeIO().read(path.join(dir, name + '.gltf'));
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

function write(part, pos, nor, uv, idx) {
  const n = pos.length / 3, big = n > 65535;
  const bufs = [new Float32Array(pos), new Int8Array(Array.from(nor, v => Math.round(Math.max(-1, Math.min(1, v)) * 127))), new Float32Array(uv), big ? new Uint32Array(idx) : new Uint16Array(idx)];
  const parts = []; let off = 0; const offsets = [];
  for (const b of bufs) { const buf = Buffer.from(b.buffer, b.byteOffset, b.byteLength); const pad = (4 - (off % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; } offsets.push(off); parts.push(buf); off += buf.length; }
  fs.writeFileSync(path.join(OUT, `${name}_${part}.bin`), Buffer.concat(parts));
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
  fs.writeFileSync(path.join(OUT, `${name}_${part}.json`), JSON.stringify({ vertices: n, indices: idx.length, big, offsets, min: mn, max: mx }));
  console.log(part, n, 'sommets', idx.length / 3, 'triangles', (off / 1024 | 0) + ' Ko');
}
/** Garde seulement les sommets utilisés, renumérote. */
function compact(P, N, T, idx) {
  const map = new Map(), pos = [], nor = [], uv = [], out = new Array(idx.length);
  for (let i = 0; i < idx.length; i++) {
    const v = idx[i];
    let w = map.get(v);
    if (w === undefined) { w = map.size; map.set(v, w); pos.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); nor.push(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]); uv.push(T[v * 2], T[v * 2 + 1]); }
    out[i] = w;
  }
  return { pos, nor, uv, idx: out };
}
for (const prim of doc.getRoot().listMeshes()[0].listPrimitives()) {
  const mat = prim.getMaterial().getName(), part = /leaves/.test(mat) ? 'leaves' : /trunk/.test(mat) ? 'trunk' : 'branches';
  const P = prim.getAttribute('POSITION').getArray(), N = prim.getAttribute('NORMAL').getArray(), T = prim.getAttribute('TEXCOORD_0').getArray();
  const I = prim.getIndices().getArray();
  if (part === 'trunk') {
    const target = Math.floor(I.length * 0.06 / 3) * 3;
    // le tronc est découpé par les coutures de texture : on soude d'abord les sommets confondus
    const weld = new Map(), remap = new Uint32Array(P.length / 3);
    for (let v = 0; v < remap.length; v++) { const k = `${Math.round(P[v * 3] * 500)},${Math.round(P[v * 3 + 1] * 500)},${Math.round(P[v * 3 + 2] * 500)}`; let w = weld.get(k); if (w === undefined) { w = v; weld.set(k, v); } remap[v] = w; }
    const welded = new Uint32Array(I.length); for (let i = 0; i < I.length; i++) welded[i] = remap[I[i]];
    const [simp] = MeshoptSimplifier.simplify(welded, new Float32Array(P), 3, target, 0.3, []);
    const c = compact(P, N, T, simp);
    write(part, c.pos, c.nor, c.uv, c.idx);
    continue;
  }
  if (part === 'branches') {
    // brindilles : composantes connexes ; on garde les grosses, et quelques petites ; puis simplification
    const nv = P.length / 3, par = new Int32Array(nv); for (let i = 0; i < nv; i++) par[i] = i;
    const f = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (let t = 0; t < I.length; t += 3) { const a = f(I[t]); par[f(I[t + 1])] = a; par[f(I[t + 2])] = a; }
    const box = new Map();
    for (let v = 0; v < nv; v++) { const r = f(v); const b = box.get(r) || [1e9, -1e9]; const y = P[v * 3 + 1] + P[v * 3] + P[v * 3 + 2]; b[0] = Math.min(b[0], y); b[1] = Math.max(b[1], y); box.set(r, b); }
    const keepC = new Map(); const tris = [];
    for (let t = 0; t < I.length; t += 3) {
      const r = f(I[t]); let k = keepC.get(r);
      if (k === undefined) { const b = box.get(r); k = (b[1] - b[0]) > 2.5 || rnd() < 0.04; keepC.set(r, k); }
      if (k) tris.push(I[t], I[t + 1], I[t + 2]);
    }
    const target = Math.min(tris.length, 60000 * 3);
    const [simp] = MeshoptSimplifier.simplify(new Uint32Array(tris), new Float32Array(P), 3, target, 0.3, []);
    const c = compact(P, N, T, simp);
    write(part, c.pos, c.nor, c.uv, c.idx);
    continue;
  }
  // feuilles : composantes connexes (une feuille = quelques triangles reliés)
  const nv = P.length / 3, parent = new Int32Array(nv); for (let i = 0; i < nv; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < I.length; t += 3) { const a = find(I[t]), b = find(I[t + 1]), c = find(I[t + 2]); parent[b] = a; parent[find(c)] = a; }
  const keep = new Map();   // racine -> garder ?
  const tris = [];
  for (let t = 0; t < I.length; t += 3) {
    const r = find(I[t]);
    let k = keep.get(r); if (k === undefined) { k = rnd() < KEEP; keep.set(r, k); }
    if (k) tris.push(I[t], I[t + 1], I[t + 2]);
  }
  const c = compact(P, N, T, tris);
  // on agrandit chaque feuille gardée autour de son centre
  const par2 = new Map(); const cnt = new Map(), cen = new Map();
  const comp = []; const inv = new Map();
  // retrouve la composante de chaque nouveau sommet via l'ancien indice
  const oldOf = new Array(c.pos.length / 3);
  { const seen = new Map(); let w = 0; for (const v of tris) if (!seen.has(v)) { seen.set(v, w); oldOf[w++] = v; } }
  for (let i = 0; i < oldOf.length; i++) { const r = find(oldOf[i]); comp[i] = r; const a = cen.get(r) || [0, 0, 0]; a[0] += c.pos[i * 3]; a[1] += c.pos[i * 3 + 1]; a[2] += c.pos[i * 3 + 2]; cen.set(r, a); cnt.set(r, (cnt.get(r) || 0) + 1); }
  const S = 1 / Math.sqrt(KEEP) * 0.55;
  for (let i = 0; i < oldOf.length; i++) { const r = comp[i], a = cen.get(r), n = cnt.get(r); for (let k = 0; k < 3; k++) { const m = a[k] / n; c.pos[i * 3 + k] = m + (c.pos[i * 3 + k] - m) * S; } }
  void par2; void inv;
  write('leaves', c.pos, c.nor, c.uv, c.idx);
}
// textures (512 px ; feuilles avec transparence)
const tex = path.join(dir, 'textures');
const files = fs.readdirSync(tex);
for (const part of ['trunk', 'branches', 'leaves']) {
  const diff = files.find(f => f.includes(part) && /diff/.test(f) && f.endsWith('.png')) || files.find(f => f.includes(part) && /diff/.test(f));
  const alpha = files.find(f => f.includes(part) && /alpha/.test(f));
  let img = sharp(path.join(tex, diff)).resize(512, 512).removeAlpha();
  if (alpha) { const a = await sharp(path.join(tex, alpha)).resize(512, 512).greyscale().raw().toBuffer(); img = img.joinChannel(a, { raw: { width: 512, height: 512, channels: 1 } }); }
  await img.webp({ quality: 82, alphaQuality: 90 }).toFile(path.join(OUT, `${name}_${part}.webp`));
}
console.log('ok');
