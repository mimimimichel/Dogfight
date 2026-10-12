// Convertit des plantes scannées Poly Haven (glTF) en un format compact pour le jeu :
//   public/adventure/assets/ph/<nom>.bin  (positions f32, normales i8, uv f32, indices u16/u32)
//   public/adventure/assets/ph/<nom>.json (tailles, boîte englobante)
//   public/adventure/assets/ph/<nom>.webp (couleur + transparence, 512 px)
// Usage : node tools/polyhaven/plants.mjs <dossier_gltf> <nom> [taille_texture]
// (dépendances : @gltf-transform/core, sharp — installées à part, voir README)
import { NodeIO } from '@gltf-transform/core';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const [dir, name, texSize = '512'] = process.argv.slice(2);
const OUT = process.env.OUT || path.join(path.dirname(new URL(import.meta.url).pathname), '../../public/adventure/assets/ph');
const doc = await new NodeIO().read(path.join(dir, name + '.gltf'));
const pos = [], nor = [], uv = [], idx = [];
let base = 0;
const mul = (m, v) => [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]];
const mulN = (m, v) => { const r = [m[0] * v[0] + m[4] * v[1] + m[8] * v[2], m[1] * v[0] + m[5] * v[1] + m[9] * v[2], m[2] * v[0] + m[6] * v[1] + m[10] * v[2]]; const l = Math.hypot(...r) || 1; return r.map(x => x / l); };
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const M = node.getWorldMatrix();
  for (const p of mesh.listPrimitives()) {
    const P = p.getAttribute('POSITION'), N = p.getAttribute('NORMAL'), T = p.getAttribute('TEXCOORD_0'), I = p.getIndices();
    const n = P.getCount(), a = [], b = [], c = [];
    for (let i = 0; i < n; i++) {
      pos.push(...mul(M, P.getElement(i, a)));
      nor.push(...mulN(M, N.getElement(i, b)));
      uv.push(...T.getElement(i, c));
    }
    for (let i = 0; i < I.getCount(); i++) idx.push(base + I.getScalar(i));
    base += n;
  }
}
// boîte englobante, puis on pose la plante au sol (y min = 0) et centrée en x/z
let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]); }
const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
for (let i = 0; i < pos.length; i += 3) { pos[i] -= cx; pos[i + 1] -= min[1]; pos[i + 2] -= cz; }
const big = base > 65535;
const bufs = [new Float32Array(pos), new Int8Array(nor.map(v => Math.round(v * 127))), new Float32Array(uv), big ? new Uint32Array(idx) : new Uint16Array(idx)];
const bytes = bufs.map(b => Buffer.from(b.buffer));
// alignement sur 4 octets entre les blocs
const parts = []; let off = 0; const offsets = [];
for (const b of bytes) { const pad = (4 - (off % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; } offsets.push(off); parts.push(b); off += b.length; }
fs.writeFileSync(path.join(OUT, name + '.bin'), Buffer.concat(parts));
fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({ vertices: base, indices: idx.length, big, offsets, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] }));
// texture couleur + transparence
const files = fs.readdirSync(path.join(dir, 'textures'));
const diff = files.find(f => /diffuse.*png/.test(f)) || files.find(f => /diff/.test(f)), alpha = files.find(f => /alpha/i.test(f));
const S = +texSize;
let img = sharp(path.join(dir, 'textures', diff)).resize(S, S).removeAlpha();
if (alpha) {
  const a = await sharp(path.join(dir, 'textures', alpha)).resize(S, S).greyscale().raw().toBuffer();
  img = img.joinChannel(a, { raw: { width: S, height: S, channels: 1 } });
}
await img.webp({ quality: 85, alphaQuality: 90 }).toFile(path.join(OUT, name + '.webp'));
console.log(name, base, 'sommets', idx.length / 3, 'triangles', 'taille', min.map((v, k) => (max[k] - v).toFixed(2)).join(' × '));
