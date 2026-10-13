// STL (binaire) -> format PNJ du jeu (voir tools/npc/convert.mjs) : soudure, simplification, normales lisses.
// Usage : node stl2npc.mjs in.stl outDir nom hauteur_m tris_max
import fs from 'node:fs';
import { MeshoptSimplifier } from 'meshoptimizer';
const [src, outDir, name, hArg, maxArg] = process.argv.slice(2);
await MeshoptSimplifier.ready;
const f = fs.readFileSync(src), n = f.readUInt32LE(80);
// soudure des sommets identiques
const map = new Map(), pos = [], idx = new Uint32Array(n * 3);
for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
  const o = 84 + t * 50 + 12 + k * 12, x = f.readFloatLE(o), y = f.readFloatLE(o + 4), z = f.readFloatLE(o + 8);
  const key = Math.round(x * 1e4) + ',' + Math.round(y * 1e4) + ',' + Math.round(z * 1e4);
  let i = map.get(key); if (i === undefined) { i = pos.length / 3; map.set(key, i); pos.push(x, y, z); }
  idx[t * 3 + k] = i;
}
let P = new Float32Array(pos);
console.log('sommets soudés', P.length / 3, 'triangles', n);
const target = Math.min(n * 3, (+maxArg || 24000) * 3);
const [simp, err] = MeshoptSimplifier.simplify(idx, P, 3, target, 0.02, ['LockBorder']);
console.log('après simplification', simp.length / 3, 'erreur', err);
// sommets utilisés uniquement
const remap = new Int32Array(P.length / 3).fill(-1), np = [];
const I = new Uint32Array(simp.length);
for (let i = 0; i < simp.length; i++) { const v = simp[i]; if (remap[v] < 0) { remap[v] = np.length / 3; np.push(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } I[i] = remap[v]; }
P = new Float32Array(np);
// repère du jeu : y en haut (z de l'STL), avant = +z (tête = bout le plus haut de l'axe y de l'STL)
const N = P.length / 3;
let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i * 3 + k]); mx[k] = Math.max(mx[k], P[i * 3 + k]); }
const L = mx[1] - mn[1];
let hiA = -1e9, hiB = -1e9;
for (let i = 0; i < N; i++) { const y = P[i * 3 + 1], z = P[i * 3 + 2]; if (y < mn[1] + L * 0.2) hiA = Math.max(hiA, z); if (y > mx[1] - L * 0.2) hiB = Math.max(hiB, z); }
const sign = hiB > hiA ? 1 : -1;   // la tête est du côté le plus haut
const cx = (mn[0] + mx[0]) / 2, cy = (mn[1] + mx[1]) / 2, H0 = mx[2] - mn[2], s = (+hArg) / H0;
const Q = new Float32Array(N * 3);
for (let i = 0; i < N; i++) {
  Q[i * 3] = (P[i * 3] - cx) * s * sign;            // (miroir si on retourne l'avant, pour garder l'orientation des faces)
  Q[i * 3 + 1] = (P[i * 3 + 2] - mn[2]) * s;
  Q[i * 3 + 2] = (P[i * 3 + 1] - cy) * s * sign;
}
// normales lisses
const nor = new Float32Array(N * 3);
for (let t = 0; t < I.length; t += 3) {
  const a = I[t], b = I[t + 1], c = I[t + 2];
  const ux = Q[b * 3] - Q[a * 3], uy = Q[b * 3 + 1] - Q[a * 3 + 1], uz = Q[b * 3 + 2] - Q[a * 3 + 2];
  const vx = Q[c * 3] - Q[a * 3], vy = Q[c * 3 + 1] - Q[a * 3 + 1], vz = Q[c * 3 + 2] - Q[a * 3 + 2];
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  for (const v of [a, b, c]) { nor[v * 3] += nx; nor[v * 3 + 1] += ny; nor[v * 3 + 2] += nz; }
}
const n8 = new Int8Array(N * 3);
for (let i = 0; i < N; i++) { const l = Math.hypot(nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2]) || 1; for (let k = 0; k < 3; k++) n8[i * 3 + k] = Math.round(nor[i * 3 + k] / l * 127); }
// uv : projection cylindrique (pour une éventuelle texture de pelage)
const uv = new Float32Array(N * 2);
for (let i = 0; i < N; i++) { uv[i * 2] = Math.atan2(Q[i * 3], Q[i * 3 + 1] - (+hArg) * 0.5) / Math.PI * 0.5 + 0.5; uv[i * 2 + 1] = Q[i * 3 + 2]; }
// fichier .bin (alignements sur 4 octets)
const big = N > 65535, chunks = [], offs = [];
let off = 0;
const push = (buf) => { offs.push(off); chunks.push(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)); off += buf.byteLength; const pad = (4 - off % 4) % 4; if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; } };
push(Q); push(n8); push(uv); push(big ? I : Uint16Array.from(I));
fs.writeFileSync(`${outDir}/${name}.bin`, Buffer.concat(chunks));
let W = 0, D = 0, HH = 0; for (let i = 0; i < N; i++) { W = Math.max(W, Math.abs(Q[i * 3])); HH = Math.max(HH, Q[i * 3 + 1]); D = Math.max(D, Math.abs(Q[i * 3 + 2])); }
const meta = { size: [W * 2, HH, D * 2], parts: [{ vertices: N, indices: I.length, offsets: offs, big, color: [0.86, 0.66, 0.4], rough: 0.85 }] };
fs.writeFileSync(`${outDir}/${name}.json`, JSON.stringify(meta));
console.log('écrit', name, 'sommets', N, 'triangles', I.length / 3, 'taille', meta.size.map(v => v.toFixed(2)), 'avant=', sign);
