/*
 * Matcha & Ainu — personnages non joueurs réalistes (modèles 3D gratuits, licence CC-BY,
 * voir assets/npc/CREDITS.md), convertis par tools/npc/convert.mjs.
 *
 * Les modèles sont des statues : on leur pose un petit squelette automatique
 * (tête, queue, quatre pattes) d'après la forme du corps, pour qu'ils bougent
 * comme les autres personnages (userData : head, tail, legs).
 */
import * as THREE from '../vendor/three.module.min.js';

const BASE = new URL('./assets/npc/', import.meta.url);
const cache = {};

/** Charge les modèles (une seule fois). */
export function preloadNpcs(names) {
  return Promise.all(names.map(async (name) => {
    if (cache[name]) return;
    const meta = await (await fetch(new URL(name + '.json', BASE))).json();
    const bin = await (await fetch(new URL(name + '.bin', BASE))).arrayBuffer();
    const texs = {};
    const parts = meta.parts.map((p) => {
      const n = p.vertices, o = p.offsets;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(bin, o[0], n * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(bin, o[1], n * 3), 3, true));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(bin, o[2], n * 2), 2));
      g.setIndex(new THREE.BufferAttribute(p.big ? new Uint32Array(bin, o[3], p.indices) : new Uint16Array(bin, o[3], p.indices), 1));
      g.computeBoundingSphere();
      let map = null;
      if (p.tex) {
        if (!texs[p.tex]) {
          const t = new THREE.TextureLoader().load(new URL(p.tex, BASE).href);
          t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4;
          texs[p.tex] = t;
        }
        map = texs[p.tex];
      }
      return { g, map, color: new THREE.Color(...p.color), rough: Math.max(0.55, p.rough) };
    });
    cache[name] = { meta, parts };
  })).catch(() => {});
}
export const hasNpc = (name) => !!cache[name];

/**
 * Le personnage, avec son squelette.
 * opts : tint (couleur qui teinte le pelage), legs (pattes animées ?), scale.
 */
export function buildNpc(name, opts) {
  opts = opts || {};
  const C = cache[name];
  const root = new THREE.Group();
  const size = C.meta.size, H = size[1];
  // ---- analyse de la forme : pattes, tête, queue ----
  let zmin = 1e9, zmax = -1e9;
  for (const p of C.parts) { const a = p.g.attributes.position.array; for (let i = 2; i < a.length; i += 3) { zmin = Math.min(zmin, a[i]); zmax = Math.max(zmax, a[i]); } }
  const L = zmax - zmin;
  const legTop = H * (opts.legTop || 0.42);
  const headZ = zmax - L * (opts.head || 0.28), tailZ = zmin + L * (opts.tail || 0.14);
  // pattes : barycentre des sommets bas, par quart (avant/arrière, gauche/droite)
  const acc = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];
  let zl = 0, nl = 0;
  for (const p of C.parts) { const a = p.g.attributes.position.array; for (let i = 0; i < a.length; i += 3) if (a[i + 1] < legTop * 0.6) { zl += a[i + 2]; nl++; } }
  const zMid = nl ? zl / nl : (zmin + zmax) / 2;
  const legOf = (x, z) => (z > zMid ? 0 : 2) + (x > 0 ? 1 : 0);   // 0 avant-gauche… 3 arrière-droite
  let hy = 0, hz = 0, hn = 0, ty = 0, tn = 0;
  for (const p of C.parts) {
    const a = p.g.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      const x = a[i], y = a[i + 1], z = a[i + 2];
      if (y < legTop) { const q = acc[legOf(x, z)]; q[0] += x; q[1] += z; q[2]++; }
      if (opts.headTop ? y > H * opts.headTop : (z > headZ && y > legTop)) { hy += y; hz += z; hn++; }
      if (z < tailZ && (opts.tailMaxY ? y < H * opts.tailMaxY : y > legTop * 0.6)) { ty += y; tn++; }
    }
  }
  // ---- os ----
  const bones = [], rootBone = new THREE.Bone(); bones.push(rootBone);
  const mk = (x, y, z) => { const b = new THREE.Bone(); b.position.set(x, y, z); rootBone.add(b); bones.push(b); return b; };
  const legs = acc.map((q) => mk(q[2] ? q[0] / q[2] : 0, legTop, q[2] ? q[1] / q[2] : zMid));
  const headY = hn ? hy / hn : H * 0.8;
  const head = opts.headTop ? mk(0, H * opts.headTop, hn ? hz / hn - L * 0.05 : 0) : mk(0, headY - H * 0.08, headZ);
  const tail = mk(0, tn ? ty / tn : H * 0.5, tailZ);
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // ---- poids : chaque sommet suit au plus un os (et le corps pour le reste) ----
  const meshes = [];
  for (const p of C.parts) {
    const a = p.g.attributes.position.array, n = a.length / 3;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
      let bi = 0, w = 0;
      if (opts.legs !== false && y < legTop) { bi = 1 + legOf(x, z); w = sm(legTop, legTop - H * 0.12, y); }
      else if (opts.headTop ? y > H * opts.headTop : z > headZ) { bi = 5; w = opts.headTop ? sm(H * opts.headTop, H * (opts.headTop + 0.05), y) : sm(headZ, headZ + L * 0.06, z); }
      else if (z < tailZ && (!opts.tailMaxY || y < H * opts.tailMaxY)) { bi = 6; w = sm(tailZ, tailZ - L * 0.05, z) * (opts.tailMaxY ? sm(H * opts.tailMaxY, H * opts.tailMaxY * 0.6, y) : 1); }
      si[i * 4] = bi; sw[i * 4] = w; si[i * 4 + 1] = 0; sw[i * 4 + 1] = 1 - w;
    }
    const g = p.g.clone();
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const col = p.color.clone(); if (opts.tint) col.multiply(new THREE.Color(opts.tint));
    const mat = new THREE.MeshStandardMaterial({ map: p.map, color: col, roughness: p.rough });
    mat.userData.keepPBR = true;
    const m = new THREE.SkinnedMesh(g, mat);
    m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
    meshes.push(m);
  }
  const body = new THREE.Group(); root.add(body);
  const skeleton = new THREE.Skeleton(bones);
  meshes[0].add(rootBone);
  for (const m of meshes) { body.add(m); m.bind(skeleton); }
  // repères pour les accessoires : sommet de la tête, museau, cou
  const headTop = new THREE.Object3D(); headTop.position.set(0, H * 0.13, L * 0.06); head.add(headTop);
  const face = new THREE.Object3D(); face.position.set(0, H * 0.06, zmax - headZ); head.add(face);
  const neck = new THREE.Object3D(); neck.position.set(0, -H * 0.02, -L * 0.03); head.add(neck);
  if (opts.scale) root.scale.setScalar(opts.scale);
  root.userData = { head, tail, legs: opts.legs === false ? [] : legs, body, headTop, face, neck, height: H * (opts.scale || 1), realistic: true };
  return root;
}

/**
 * Mamie Labrador : le labrador assis fourni par la famille (modèle STL, converti par
 * tools/npc/stl2npc.mjs), pelage doré peint par sommet et bandana rouge ajusté au cou.
 * Elle est bien droite, les quatre pattes posées.
 */
export function buildMamieStanding() {
  const C = cache.mamie2, H = C.meta.size[1];
  // chienne assise : la tête est tout en haut, la queue au sol derrière ; les pattes ne bougent pas
  const m = buildNpc('mamie2', { headTop: 0.68, tail: 0.1, tailMaxY: 0.25, legs: false });
  const u = m.userData;
  // repères du visage (mesurés sur le modèle, en proportion de la hauteur) : truffe et yeux
  const nosePt = points('mamie2', (x, y) => y > 0.7 * H).reduce((b, p) => (!b || p[2] > b[2] ? p : b), null);
  const eyeY = nosePt[1] + H * 0.09, eyeZ = nosePt[2] - H * 0.15;
  // pelage doré, plus clair sur le poitrail et le museau (couleurs par sommet : le modèle n'a pas de texture)
  m.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const a = o.geometry.attributes.position.array, n = a.length / 3, col = new Float32Array(n * 3);
    const base = new THREE.Color(0xdcaa62), light = new THREE.Color(0xf7e6c4), dark = new THREE.Color(0xc0904c), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const y = a[i * 3 + 1] / H, z = a[i * 3 + 2];
      const front = Math.max(0, Math.min(1, (z + 0.05) * 3));          // poitrail, devant
      const high = Math.max(0, Math.min(1, (y - 0.55) * 3));           // dos et oreilles un peu plus foncés
      const n1 = Math.sin(a[i * 3] * 41 + a[i * 3 + 1] * 37) * Math.sin(a[i * 3 + 2] * 29) * 0.5 + 0.5;
      c.copy(base).lerp(light, front * (1 - high) * 0.6).lerp(dark, high * (1 - front) * 0.5);
      c.multiplyScalar(0.94 + n1 * 0.1);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    o.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    o.material.vertexColors = true; o.material.color.set(0xffffff); o.material.roughness = 0.92; o.material.metalness = 0;
    o.material.needsUpdate = true;
  });
  // pelage : petites mèches (texture dessinée) projetées sur trois axes, le modèle n'ayant pas d'UV utilisables
  const fur = furTexture();
  m.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    o.material.onBeforeCompile = (sh) => {
      sh.uniforms.uFur = { value: fur };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vFurP; varying vec3 vFurN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFurP = position * 5.0; vFurN = normal;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uFur; varying vec3 vFurP; varying vec3 vFurN;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec3 fw = abs(normalize(vFurN)); fw = pow(fw, vec3(4.0)); fw /= (fw.x + fw.y + fw.z);
          float f = texture2D(uFur, vFurP.yz).r * fw.x + texture2D(uFur, vFurP.xz).r * fw.y + texture2D(uFur, vFurP.xy).r * fw.z;
          diffuseColor.rgb *= 0.7 + f * 0.55;`);
    };
    o.material.customProgramCacheKey = () => 'mamieFur';
  });
  // yeux : grands, brun chaud, deux reflets (un regard doux) ; attachés à la tête pour suivre ses mouvements.
  // Par-dessus, des lunettes rondes de mamie.
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x3a200c, roughness: 0.08, metalness: 0.05 });
  const glint = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b04a, roughness: 0.3, metalness: 0.8 });
  const hp = u.head.position, eyes = [], rims = [];
  const hc = new THREE.Vector3(0, eyeY - H * 0.02, eyeZ - H * 0.12);   // (centre du crâne, pour savoir où « regarde » chaque œil)
  for (const sx of [-1, 1]) {
    const cand = points('mamie2', (x, y, z) => Math.abs(y - eyeY) < H * 0.02 && Math.abs(z - eyeZ) < H * 0.04 && x * sx > 0);
    const surf = cand.reduce((b, p) => (!b || p[2] * 0.8 + Math.abs(p[0]) * 0.6 > b[2] * 0.8 + Math.abs(b[0]) * 0.6 ? p : b), null);
    if (!surf) continue;
    const at = new THREE.Vector3(surf[0], surf[1], surf[2]);
    const out = at.clone().sub(hc); out.y = 0; out.normalize();
    out.lerp(new THREE.Vector3(0, 0, 1), 0.35).normalize();             // (un peu plus vers l'avant : elle nous regarde)
    const eg = new THREE.Group();
    eg.position.copy(at).addScaledVector(out, -H * 0.012).sub(hp);
    eg.lookAt(eg.position.clone().add(out));
    const e = new THREE.Mesh(new THREE.SphereGeometry(H * 0.03, 18, 12), eyeMat); e.scale.z = 0.75; eg.add(e);
    const g1 = new THREE.Mesh(new THREE.SphereGeometry(H * 0.009, 8, 6), glint); g1.position.set(-sx * H * 0.009, H * 0.011, H * 0.02); eg.add(g1);
    const g2 = new THREE.Mesh(new THREE.SphereGeometry(H * 0.0045, 6, 4), glint); g2.position.set(sx * H * 0.008, -H * 0.009, H * 0.021); eg.add(g2);
    u.head.add(eg); eyes.push(eg);
    // monture ronde dorée devant l'œil
    const rim = new THREE.Mesh(new THREE.TorusGeometry(H * 0.046, H * 0.0055, 8, 28), gold);
    rim.position.copy(eg.position).addScaledVector(out, H * 0.022);
    rim.lookAt(rim.position.clone().add(out));
    const lens = new THREE.Mesh(new THREE.CircleGeometry(H * 0.044, 24), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, roughness: 0.05, metalness: 0.2, depthWrite: false }));
    rim.add(lens);
    u.head.add(rim); rims.push(rim);
  }
  if (rims.length === 2) {
    // le pont entre les deux verres, posé sur le haut du museau
    const a = rims[0].position, b = rims[1].position;
    const mid = a.clone().add(b).multiplyScalar(0.5); mid.z += H * 0.01; mid.y += H * 0.012;
    const curve = new THREE.QuadraticBezierCurve3(a.clone().lerp(b, 0.12), mid, b.clone().lerp(a, 0.12));
    u.head.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 10, H * 0.004, 5), gold));
  }
  // la truffe : juste un petit point noir brillant au bout du museau
  const truffe = new THREE.Mesh(new THREE.SphereGeometry(H * 0.022, 14, 10), new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.25 }));
  truffe.scale.set(1.3, 0.9, 0.7);
  truffe.position.set(nosePt[0], nosePt[1], nosePt[2] - H * 0.004).sub(hp);
  u.head.add(truffe);
  u.eyes = eyes;
  // bandana rouge au cou : là où le corps est le plus fin, sous la tête
  let best = null;
  for (let y = 0.52; y <= 0.66; y += 0.02) {   // (sous la mâchoire)
    const pts = points('mamie2', (px, py) => Math.abs(py / H - y) < 0.012);
    if (pts.length < 20) continue;
    let cx = 0, cz = 0; for (const p of pts) { cx += p[0]; cz += p[2]; } cx /= pts.length; cz /= pts.length;
    let r = 0; for (const p of pts) r += Math.hypot(p[0] - cx, p[2] - cz); r /= pts.length;   // (rayon moyen : les oreilles pendantes ne comptent pas)
    if (!best || r < best.r) best = { y: y * H, x: cx, z: cz, r };
  }
  if (best) {
    // un foulard en triangle posé sur le poitrail (un anneau ne suivait pas bien le cou penché)
    const red = new THREE.MeshStandardMaterial({ color: 0xd8202a, roughness: 0.75, side: THREE.DoubleSide });
    const band = new THREE.Group();
    const front = points('mamie2', (px, py) => Math.abs(py - best.y) < H * 0.015).reduce((b, p) => (!b || p[2] > b[2] ? p : b), null);
    const tri = new THREE.Mesh(new THREE.ConeGeometry(H * 0.1, H * 0.16, 3), red);
    tri.rotation.set(Math.PI + 0.35, 0, 0); tri.scale.z = 0.25; tri.position.set(0, -H * 0.04, 0);
    const knot = new THREE.Mesh(new THREE.TorusGeometry(H * 0.075, H * 0.014, 6, 16, Math.PI), red); knot.rotation.set(-0.35, 0, Math.PI); knot.position.set(0, H * 0.02, -H * 0.01);
    band.add(tri); band.add(knot);
    band.traverse(o => { if (o.isMesh) o.castShadow = true; });
    band.position.set(best.x, best.y, front ? front[2] - H * 0.008 : best.z + best.r);
    u.body.add(band);
  }
  u.mamie = true;
  return m;
}

/** Petites mèches de poils (texture qui se répète) pour le pelage de Mamie. */
let furTex = null;
function furTexture() {
  if (furTex) return furTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 2600; i++) {
    const px = rnd() * 256, py = rnd() * 256, len = 6 + rnd() * 14, ang = Math.PI / 2 + (rnd() - 0.5) * 0.7, v = Math.floor(70 + rnd() * 120);
    x.strokeStyle = `rgba(${v},${v},${v},0.55)`; x.lineWidth = 1 + rnd() * 1.5;
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      x.beginPath(); x.moveTo(px + ox, py + oy); x.quadraticCurveTo(px + ox + Math.cos(ang) * len * 0.5 + (rnd() - 0.5) * 3, py + oy + Math.sin(ang) * len * 0.5, px + ox + Math.cos(ang) * len, py + oy + Math.sin(ang) * len); x.stroke();
    }
  }
  furTex = new THREE.CanvasTexture(c);
  furTex.wrapS = furTex.wrapT = THREE.RepeatWrapping; furTex.anisotropy = 4;
  return furTex;
}

/** Tous les sommets d'un modèle (pour placer des accessoires). */
function points(name, test) {
  const out = [];
  for (const p of cache[name].parts) { const a = p.g.attributes.position.array; for (let i = 0; i < a.length; i += 3) if (test(a[i], a[i + 1], a[i + 2])) out.push([a[i], a[i + 1], a[i + 2]]); }
  return out;
}
const mean = (pts) => pts.reduce((m, p) => [m[0] + p[0] / pts.length, m[1] + p[1] / pts.length, m[2] + p[2] / pts.length], [0, 0, 0]);

/**
 * Mamie Labrador : golden retriever assis, lunettes rondes et bandana rouge.
 * Squelette complet posé d'après la forme du modèle (chiffres relevés sur le scan,
 * assis, avant = +z, hauteur 1,75) : hanches → poitrine → cou → tête, deux pattes
 * avant, queue. Chaque sommet suit un ou deux os, avec des transitions douces.
 */
export function buildMamieReal() {
  const C = cache.mamie, H = C.meta.size[1], k = H / 1.75;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const root = new THREE.Group();
  // ---- os (repère du modèle) ----
  const B = {};
  const bone = (name, parent, x, y, z) => {
    const b = new THREE.Bone(); b.name = name;
    const pw = parent ? parent.userData.w : [0, 0, 0];
    b.position.set(x * k - pw[0], y * k - pw[1], z * k - pw[2]); b.userData.w = [x * k, y * k, z * k];
    if (parent) parent.add(b);
    B[name] = b; return b;
  };
  const rootB = bone('root', null, 0, 0, 0);
  const hips = bone('hips', rootB, 0.05, 0.25, -0.1);
  const chest = bone('chest', hips, 0.05, 0.6, 0.25);
  const neck = bone('neck', chest, 0.08, 1.05, 0.38);
  const head = bone('head', neck, 0.1, 1.3, 0.52);
  // (pattes accrochées aux hanches : quand elle se tourne, les pattes restent au sol)
  const legL = bone('legL', hips, -0.12, 0.74, 0.55);
  const legR = bone('legR', hips, 0.2, 0.74, 0.55);
  const pawL = bone('pawL', legL, -0.12, 0.3, 0.6);
  const pawR = bone('pawR', legR, 0.2, 0.3, 0.6);
  const tail = bone('tail', hips, 0.04, 0.15, -0.42);
  const list = [rootB, hips, chest, neck, head, legL, legR, tail, pawL, pawR];
  const id = (b) => list.indexOf(b);
  // ---- poids ----
  const spine = (y) => {
    y /= k;
    if (y < 0.35) return [[hips, 1]];
    if (y < 0.55) { const t = sm(0.35, 0.55, y); return [[hips, 1 - t], [chest, t]]; }
    if (y < 0.95) return [[chest, 1]];
    if (y < 1.1) { const t = sm(0.95, 1.1, y); return [[chest, 1 - t], [neck, t]]; }
    if (y < 1.24) return [[neck, 1]];
    if (y < 1.36) { const t = sm(1.24, 1.36, y); return [[neck, 1 - t], [head, t]]; }
    return [[head, 1]];
  };
  const meshes = [];
  for (const p of C.parts) {
    const a = p.g.attributes.position.array, n = a.length / 3;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const x = a[i * 3] / k, y = a[i * 3 + 1] / k, z = a[i * 3 + 2] / k;
      let w = spine(a[i * 3 + 1]);
      const legW = sm(0.42, 0.52, z) * sm(0.8, 0.62, y);
      const tailW = sm(-0.42, -0.6, z) * sm(0.38, 0.25, y);
      if (legW > 0) {
        // bas de la patte (poignet) : suit l'os du poignet, pour plier la patte quand elle la lève
        const left = x < 0.05, pw = sm(0.4, 0.28, y);
        w = [[left ? legL : legR, legW * (1 - pw)], [hips, 1 - legW], [left ? pawL : pawR, legW * pw]];
      }
      else if (tailW > 0) w = [[tail, tailW], [hips, 1 - tailW]];
      si[i * 4] = id(w[0][0]); sw[i * 4] = w[0][1];
      if (w[1]) { si[i * 4 + 1] = id(w[1][0]); sw[i * 4 + 1] = w[1][1]; }
      if (w[2]) { si[i * 4 + 2] = id(w[2][0]); sw[i * 4 + 2] = w[2][1]; }
    }
    const g = p.g.clone();
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    const col = p.color.clone().multiply(new THREE.Color(0xffe2b0));      // pelage doré de labrador
    const mat = new THREE.MeshStandardMaterial({ map: p.map, color: col, roughness: p.rough });
    mat.userData.keepPBR = true;
    const m = new THREE.SkinnedMesh(g, mat);
    m.castShadow = m.receiveShadow = true; m.frustumCulled = false;
    meshes.push(m);
  }
  const body = new THREE.Group(); root.add(body);
  const skeleton = new THREE.Skeleton(list);
  meshes[0].add(rootB);
  for (const m of meshes) { body.add(m); m.bind(skeleton); }
  root.updateMatrixWorld(true);
  // ---- lunettes (sur la tête) et bandana (sur le cou) ----
  const HT = 0.72;
  const headPts = points('mamie', (x, y) => y > H * (HT + 0.04));
  const c = mean(headPts);
  const snout = headPts.reduce((b, p) => (p[2] + p[1] * 0.4 > b[2] + b[1] * 0.4 ? p : b), headPts[0]);
  const dir = new THREE.Vector3(snout[0] - c[0], snout[1] - c[1], snout[2] - c[2]).normalize();
  const eyes = new THREE.Vector3(c[0], c[1], c[2]).lerp(new THREE.Vector3(...snout), 0.22).add(new THREE.Vector3(0, H * 0.045, 0));
  const neckPts = points('mamie', (x, y) => y > H * (HT - 0.07) && y < H * (HT - 0.02));
  const nc = mean(neckPts);
  const nr = neckPts.reduce((m, p) => m + Math.hypot(p[0] - nc[0], p[2] - nc[2]) / neckPts.length, 0);
  const gold = new THREE.MeshStandardMaterial({ color: 0xd8b048, metalness: 0.9, roughness: 0.25 });
  const glasses = new THREE.Group();
  const gs = H * 0.03;
  for (const sx of [-1, 1]) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(gs, gs * 0.14, 8, 24), gold); r.position.set(sx * gs * 1.3, 0, 0); glasses.add(r);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(gs * 0.95, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, roughness: 0.05 }));
    lens.position.set(sx * gs * 1.3, 0, 0.001); glasses.add(lens);
  }
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(gs * 0.1, gs * 0.1, gs * 0.7, 6), gold); bridge.rotation.z = Math.PI / 2; glasses.add(bridge);
  const ep = eyes.clone().addScaledVector(dir, H * 0.02);
  // (os encore au repos : repère du modèle = repère du corps)
  const toBone = (b, v) => v.clone().sub(new THREE.Vector3(...b.userData.w));
  glasses.position.copy(toBone(head, ep));
  glasses.lookAt(new THREE.Vector3().copy(glasses.position).add(dir));
  // (les lunettes flottaient devant l'œil selon l'angle : on s'en passe)
  glasses.visible = false;
  head.add(glasses);
  const red = new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.75, side: THREE.DoubleSide });
  const band = new THREE.Mesh(new THREE.TorusGeometry(nr * 0.98, H * 0.018, 8, 32), red); band.rotation.x = Math.PI / 2;
  const tri = new THREE.Mesh(new THREE.ConeGeometry(nr * 0.42, H * 0.08, 3), red); tri.rotation.set(Math.PI, 0, 0); tri.scale.z = 0.35; tri.position.set(0, -H * 0.035, nr * 0.98);
  const bandana = new THREE.Group(); bandana.add(band, tri); bandana.position.copy(toBone(neck, new THREE.Vector3(nc[0], nc[1], nc[2])));
  neck.add(bandana);
  // pattes avant posées au sol (le modèle scanné est un peu penché en arrière)
  const zs = points('mamie', () => true).map(p => p[2]), zmax = Math.max(...zs), zmin = Math.min(...zs);
  const paws = points('mamie', (x, y, z) => z > zmax - (zmax - zmin) * 0.3 && y < H * 0.3);
  if (paws.length) body.position.y = -Math.min(...paws.map(p => p[1]));
  const face = new THREE.Object3D(); face.position.copy(toBone(head, new THREE.Vector3(...snout))); head.add(face);
  root.userData = { head, tail, legs: [], body, neck: neck, face, height: H, realistic: true, rig: { hips, chest, neck, head, legL, legR, pawL, pawR, tail } };
  return root;
}
