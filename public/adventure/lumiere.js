/*
 * Matcha & Ainu — la lumière de chaque monde (« l'ambiance »).
 *
 * Chaque niveau a son humeur : la Plage à l'heure dorée, la Forêt et ses rayons de soleil
 * entre les arbres, la Ferme dans la brume du matin, la Neige cristalline et ses paillettes
 * de givre, la Ville vive et nette, le Ciel pastel et lumineux, le Parc frais comme un
 * matin de printemps, le Château dans le soleil couchant. Le soir (de 18 h à 23 h, ou
 * ?ambiance=soir), le monde passe au coucher de soleil.
 *
 * Tout est léger :
 *  - le ciel photographié est seulement « étalonné » dans son shader (teinte, brume
 *    d'horizon, halo du soleil ; le soleil de la photo est descendu à la bonne hauteur) ;
 *  - lumières, brume et étalonnage final (post.js) : de simples réglages ;
 *  - poussières, pollen, givre, étoiles : UN nuage de points, animé dans le shader
 *    (aucun calcul par image côté processeur) ;
 *  - rayons de soleil entre les arbres : UN seul objet (cartes lumineuses instanciées) ;
 *  - paillettes sur l'eau : UN nuage de points qui ne brille que dans le reflet du soleil ;
 *  - liseré de lumière sur les chiens (contre-jour) : trois lignes dans leur shader.
 * Sur téléphone, moins de particules et de rayons, et rien d'autre ne change.
 */
import * as THREE from '../vendor/three.module.min.js';
import { moment } from './seasons.js';

const C = (h) => new THREE.Color(h);

// ---------------------------------------------------------------------------
// Les humeurs du jour
//  sunEl : hauteur du soleil (radians) — plus bas = ombres longues, lumière rasante
//  sky   : étalonnage du ciel photo (tint, sat, haze = couleur de l'horizon, hazeK, hazeH, glow, glowK)
//  fog   : couleur de la brume (null : on garde celle du niveau) ; fogK : distance (×)
//  hemi  : [ciel, sol, ×intensité] ; sun : [couleur, ×intensité] ; env : ×lumière du ciel
//  grade : étalonnage final (post.js) ; shaft : teinte des rayons d'écran
//  rim   : [couleur, force] du liseré sur les personnages
//  motes / rays / glints : particules d'ambiance, rayons entre les arbres, paillettes sur l'eau
// ---------------------------------------------------------------------------
const DAY = {
  // Parc : printemps frais, lumière claire, aigrettes de pissenlit qui flottent
  1: {
    sunEl: 0.72,
    sky: { tint: [0.98, 1.0, 1.02], sat: 1.08, haze: 0xe2eee6, hazeK: 0.35, hazeH: 0.22, glow: 0xfff2d6, glowK: 0.3 },
    fog: 0xc6dae4, fogK: 1.0,
    hemi: [0xeaf6ff, 0x7c9050, 1.05], sun: [0xfff3de, 1.04], env: 1.0,
    grade: { exposure: 1.04, contrast: 1.07, saturation: 1.1, vignette: 0.24, bloom: 0.5, shadowTint: [-0.004, 0.012, 0.03], highTint: [0.022, 0.02, 0.0] },
    shaft: 0xfff0c8, rim: [0xfff6e0, 0.3],
    motes: { kind: 'fluff', n: 110, nLite: 50, color: 0xffffff, size: 0.16, R: 22, H: 7, drift: [0.35, 0.05, 0.18], wobble: 0.6, bright: 1.3, glint: 1.2, blend: 'normal', opacity: 0.85 },
    rays: { n: 26, nLite: 12, k: 0.75, color: 0xfff2c8, near: 3.5 },
    glints: { n: 220, nLite: 90, R: 40, k: 4.0 },
  },
  // Forêt : rayons de soleil entre les arbres, pollen doré, brume verte et chaude
  2: {
    sunEl: 0.6,
    sky: { tint: [1.03, 1.0, 0.9], sat: 1.0, haze: 0xdde2b4, hazeK: 0.5, hazeH: 0.26, glow: 0xffdc98, glowK: 0.6 },
    fog: 0xb4c494, fogK: 0.82,
    hemi: [0xfff0cc, 0x5a6a30, 1.05], sun: [0xffd696, 1.16], env: 1.0,
    grade: { exposure: 1.08, contrast: 1.1, saturation: 1.07, vignette: 0.34, bloom: 0.66, shafts: 0.95, shadowTint: [-0.004, 0.02, 0.018], highTint: [0.045, 0.028, -0.012] },
    shaft: 0xffd890, rim: [0xffe0a0, 0.34],
    motes: { kind: 'pollen', n: 240, nLite: 100, color: 0xffd878, size: 0.1, R: 20, H: 8, drift: [0.1, 0.06, 0.05], wobble: 0.7, bright: 2.2, glint: 4.0, blend: 'add' },
    rays: { n: 40, nLite: 20, k: 1.4, color: 0xffe2a0, near: 3.0 },
    glints: { n: 160, nLite: 70, R: 34, k: 3.0 },
  },
  // Ville : grand beau temps, couleurs franches, reflets dans le port
  3: {
    sunEl: 0.8,
    sky: { tint: [0.98, 1.0, 1.04], sat: 1.12, haze: 0xdcecf8, hazeK: 0.3, hazeH: 0.2, glow: 0xfff0d0, glowK: 0.28 },
    fog: 0xbed6ec, fogK: 1.0,
    hemi: [0xeaf4ff, 0x9a8670, 1.02], sun: [0xfff0d8, 1.06], env: 1.0,
    grade: { exposure: 1.03, contrast: 1.09, saturation: 1.12, vignette: 0.26, bloom: 0.5, shadowTint: [0.0, 0.008, 0.032], highTint: [0.03, 0.018, 0.0] },
    shaft: 0xfff0d0, rim: [0xfff2e0, 0.28],
    motes: null, rays: null,
    glints: { n: 360, nLite: 150, R: 60, k: 5.0 },
  },
  // Îles du Ciel : ciel pastel, horizon rose pêche, mer de nuages lumineuse, poussière d'étoiles
  4: {
    sunEl: 0.7,
    sky: { tint: [1.05, 0.99, 1.05], sat: 0.9, haze: 0xffdce4, hazeK: 0.55, hazeH: 0.34, glow: 0xfff0e2, glowK: 0.6 },
    fog: 0xecdcec, fogK: 1.0,
    hemi: [0xf8f0ff, 0xd0aed0, 1.12], sun: [0xfff2e4, 1.0], env: 1.05,
    grade: { exposure: 1.06, contrast: 1.03, saturation: 1.05, vignette: 0.2, bloom: 0.85, shadowTint: [0.02, 0.0, 0.045], highTint: [0.03, 0.012, 0.022] },
    shaft: 0xffe8f0, rim: [0xffe2f2, 0.44],
    motes: { kind: 'stars', n: 170, nLite: 70, color: 0xfff0c0, color2: 0xc8d8ff, size: 0.1, R: 26, H: 12, drift: [0.12, 0.1, 0.06], wobble: 0.8, bright: 1.8, glint: 4.5, blend: 'add' },
    rays: null, glints: null,
  },
  // Station des Neiges : lumière cristalline, ombres bleues, poussière de diamant qui scintille
  5: {
    sunEl: 0.6,
    sky: { tint: [0.96, 1.0, 1.06], sat: 1.12, haze: 0xdce8f6, hazeK: 0.4, hazeH: 0.22, glow: 0xffffff, glowK: 0.4 },
    fog: null, fogK: 1.0,
    hemi: null, sun: [0xfff4e6, 1.08], env: 1.0,
    grade: { exposure: 1.0, contrast: 1.1, saturation: 1.07, vignette: 0.26, bloom: 0.55, shadowTint: [-0.004, 0.012, 0.052], highTint: [0.012, 0.008, 0.0] },
    shaft: 0xf0f6ff, rim: [0xd8ecff, 0.32],
    motes: { kind: 'diamond', n: 260, nLite: 110, color: 0xeef6ff, size: 0.09, R: 18, H: 8, drift: [0.06, -0.08, 0.04], wobble: 0.35, bright: 0.6, glint: 9.0, sharp: 10, blend: 'add' },
    rays: null, glints: null,
  },
  // Plage : l'heure dorée — soleil bas et chaud, ombres longues, la mer qui scintille
  6: {
    sunEl: 0.5,
    sky: { tint: [1.06, 0.98, 0.88], sat: 1.05, haze: 0xffdcac, hazeK: 0.55, hazeH: 0.3, glow: 0xffc27a, glowK: 0.9 },
    fog: 0xe8d2b4, fogK: 1.0,
    hemi: [0xffe8d2, 0xe0b880, 0.95], sun: [0xffcb8e, 1.3], env: 0.95,
    grade: { exposure: 1.04, contrast: 1.08, saturation: 1.04, vignette: 0.3, bloom: 0.7, shafts: 0.6, shadowTint: [0.0, 0.01, 0.048], highTint: [0.05, 0.025, -0.012] },
    shaft: 0xffc080, rim: [0xffc890, 0.44],
    motes: null, rays: null,
    glints: { n: 520, nLite: 200, R: 70, k: 7.0 },
  },
  // Ferme : brume douce du matin, soleil bas et tiède, poussière dorée dans l'air
  7: {
    sunEl: 0.52,
    sky: { tint: [1.02, 1.0, 0.95], sat: 0.9, haze: 0xf4ead8, hazeK: 0.62, hazeH: 0.4, glow: 0xffe6bc, glowK: 0.65 },
    fog: 0xdcd8c8, fogK: 0.8,
    hemi: [0xfff4e0, 0x7a6a40, 1.0], sun: [0xffe2b6, 1.16], env: 1.0,
    grade: { exposure: 1.04, contrast: 1.02, saturation: 1.03, vignette: 0.26, bloom: 0.75, threshold: 0.92, shafts: 0.8, shadowTint: [0.01, 0.01, 0.03], highTint: [0.035, 0.025, 0.004] },
    shaft: 0xffe2b0, rim: [0xfff0d0, 0.32],
    motes: { kind: 'dust', n: 170, nLite: 70, color: 0xffe8b8, size: 0.07, R: 20, H: 7, drift: [0.12, 0.03, 0.08], wobble: 0.6, bright: 1.6, glint: 3.0, blend: 'add' },
    rays: { n: 34, nLite: 14, k: 0.85, color: 0xffe6b8, near: 3.5 },
    glints: { n: 160, nLite: 70, R: 34, k: 3.0 },
  },
  // Château : soleil couchant dehors (ombres longues, ciel orangé), torches chaudes dedans
  8: {
    sunEl: 0.46,
    sky: { tint: [1.07, 0.95, 0.86], sat: 1.04, haze: 0xffcc9c, hazeK: 0.6, hazeH: 0.32, glow: 0xffaa62, glowK: 1.0 },
    fog: 0xe8c4a4, fogK: 1.0,
    hemi: [0xffe4cc, 0x8a6048, 0.92], sun: [0xffbc7c, 1.32], env: 0.95,
    grade: { exposure: 1.03, contrast: 1.1, saturation: 1.1, vignette: 0.34, bloom: 0.8, shadowTint: [0.016, 0.0, 0.05], highTint: [0.05, 0.022, -0.01] },
    shaft: 0xffb070, rim: [0xffb478, 0.44],
    motes: { kind: 'embers', n: 120, nLite: 50, color: 0xffc070, size: 0.07, R: 18, H: 7, drift: [0.05, 0.12, 0.04], wobble: 0.5, bright: 1.8, glint: 3.5, blend: 'add' },
    rays: null,
    glints: { n: 200, nLite: 80, R: 40, k: 4.0 },
  },
};

// ---------------------------------------------------------------------------
// Le soir : coucher de soleil (ciel dessiné : dégradé du niveau, nuages roses), lucioles
// (seasons.js), lampadaires et fenêtres qui s'allument.
// ---------------------------------------------------------------------------
const DUSK_COMMON = {
  sunEl: 0.3, env: 0.75, fogK: 0.9,
  grade: { exposure: 1.1, contrast: 1.06, saturation: 1.1, vignette: 0.34, bloom: 0.9, shafts: 1.0, shadowTint: [0.012, 0.0, 0.04], highTint: [0.05, 0.022, -0.01] },
};
const DUSK = {
  1: { proc: { top: 0x3c5ca8, horizon: 0xffb890, bottom: 0xffd8b8, glow: 0xffa868 }, fog: 0xc8a8a8, hemi: [0xf4d4c4, 0x7a5a48, 0.95], sun: [0xffbc84, 1.35], rim: [0xffb070, 0.5] },
  2: { proc: { top: 0x34508a, horizon: 0xffb070, bottom: 0xffd0a0, glow: 0xff9a50 }, fog: 0x9a9a7a, hemi: [0xf4d4c4, 0x4a4a30, 0.95], sun: [0xffb878, 1.35], rim: [0xffa860, 0.5] },
  3: { proc: { top: 0x24346e, horizon: 0xff9c6a, bottom: 0xffc8a0, glow: 0xff8a4a }, fog: 0xb0909a, hemi: [0xf4d4c4, 0x6a5048, 0.95], sun: [0xffb47c, 1.35], rim: [0xffa070, 0.5], lamps: 1 },
  4: { proc: { top: 0x5a5ab0, horizon: 0xffa8bc, bottom: 0xffd0d8, glow: 0xffa080 }, fog: 0xe0b4c8, hemi: [0xf4d4c4, 0xc890a8, 1.0], sun: [0xffb488, 1.35], rim: [0xffb0c8, 0.55] },
  5: { proc: { top: 0x2a3a7a, horizon: 0xf4a8b4, bottom: 0xffd4d8, glow: 0xffa898 }, fog: 0xc8b4cc, hemi: null, sun: [0xffb4a0, 1.0], rim: [0xffc0c8, 0.45], aurora: 1 },
  6: { proc: { top: 0x3a4a9a, horizon: 0xff9a5a, bottom: 0xffc890, glow: 0xff8a40 }, fog: 0xe4b48c, hemi: [0xf4d4c4, 0xc08a68, 1.0], sun: [0xffb478, 1.35], rim: [0xffa060, 0.55] },
  7: { proc: { top: 0x4060a0, horizon: 0xffb880, bottom: 0xffdcb0, glow: 0xffa060 }, fog: 0xc8b0a0, hemi: [0xf4d4c4, 0x6a5038, 0.95], sun: [0xffbc80, 1.35], rim: [0xffb070, 0.5] },
  8: { proc: { top: 0x3a3a8a, horizon: 0xff8a50, bottom: 0xffb888, glow: 0xff7a3a }, fog: 0xc89080, hemi: [0xf4d4c4, 0x6a4038, 0.95], sun: [0xffac70, 1.35], rim: [0xff9a60, 0.55], torches: 1 },
};

/** L'humeur du niveau : celle du jour, ou celle du soir. (?ambiance=jour|soir pour essayer, ?ambiance=0 pour couper) */
export function pickMood(L) {
  const q = new URLSearchParams(location.search).get('ambiance');
  if (q === '0' || q === 'off') return null;
  const day = DAY[L.ID];
  if (!day) return null;
  let evening = false;
  try { evening = moment().evening; } catch (e) { /* ignore */ }
  if (q === 'soir') evening = true; else if (q === 'jour') evening = false;
  const m = JSON.parse(JSON.stringify(day));
  if (evening && DUSK[L.ID]) {
    const d = DUSK[L.ID];
    Object.assign(m, DUSK_COMMON, d);
    m.grade = Object.assign({}, day.grade, DUSK_COMMON.grade);
    m.dusk = true;
    m.sky = null;                                     // ciel dessiné (le ciel photo est un ciel de midi)
    if (m.motes) { m.motes.bright *= 0.8; }
    m.glints = day.glints ? Object.assign({}, day.glints, { k: day.glints.k * 1.2 }) : null;
    if (m.rays) m.rays.k *= 0.8;
  }
  return m;
}

/** Abaisse (ou monte) le soleil à la hauteur voulue, sans changer sa direction. */
export function setSunElevation(dir, el) {
  const az = Math.atan2(dir.z, dir.x);
  dir.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
}

/** Les couleurs du ciel dessiné (soir, ou rendu dessin animé). */
export function procSky(SKY, mood) {
  const p = mood && mood.proc;
  if (!p) return;
  SKY.top.set(p.top); SKY.horizon.set(p.horizon); SKY.bottom.set(p.bottom);
  if (SKY.glow) SKY.glow.set(p.glow);
  if (SKY.dusk) SKY.dusk.value = 1;
}

// ---------------------------------------------------------------------------
// Ciel photographié : étalonnage dans son shader
// ---------------------------------------------------------------------------
/**
 * material : le MeshBasicMaterial du dôme (carte = photo équirectangulaire).
 * photoEl : hauteur du soleil sur la photo ; wantEl : hauteur voulue (la photo est
 * étirée verticalement sous le soleil, comprimée au-dessus : le soleil descend).
 * fogColor : la couleur de la brume (l'horizon s'y fond).
 */
export function patchPhotoSky(material, mood, photoEl, wantEl, fogColor, sunDir) {
  const s = mood && mood.sky;
  if (!s) return;
  const u = {
    uSkTint: { value: new THREE.Vector3(...s.tint) }, uSkSat: { value: s.sat },
    uSkHaze: { value: fogColor && s.useFog !== false ? fogColor : C(s.haze) }, uSkHazeK: { value: s.hazeK }, uSkHazeH: { value: s.hazeH },
    uSkGlow: { value: C(s.glow) }, uSkGlowK: { value: s.glowK }, uSkSun: { value: sunDir },
    uSkPe: { value: photoEl }, uSkWe: { value: wantEl },
  };
  material.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vSkW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vSkW = (modelMatrix * vec4(position, 0.0)).xyz;');
    sh.fragmentShader = `varying vec3 vSkW;
uniform vec3 uSkTint, uSkHaze, uSkGlow, uSkSun; uniform float uSkSat, uSkHazeK, uSkHazeH, uSkGlowK, uSkPe, uSkWe;
` + sh.fragmentShader.replace('#include <map_fragment>', `
  {
    // hauteur dans la photo : le soleil (photo) se retrouve à la hauteur voulue
    float e = (vMapUv.y - 0.5) * 3.14159265;
    float g = e;
    if (e > 0.0) g = e < uSkWe ? e * uSkPe / uSkWe : uSkPe + (e - uSkWe) * (1.5707963 - uSkPe) / (1.5707963 - uSkWe);
    vec2 suv = vec2(vMapUv.x, 0.5 + g / 3.14159265);
    vec4 sampledDiffuseColor = texture2D(map, suv);
    diffuseColor *= sampledDiffuseColor;
    vec3 c = diffuseColor.rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, uSkSat) * uSkTint;
    vec3 d = normalize(vSkW);
    // brume d'horizon (même couleur que la brume du monde : pas de couture)
    float hz = 1.0 - smoothstep(-0.05, uSkHazeH, d.y);
    c = mix(c, uSkHaze * (0.85 + 0.3 * l), hz * uSkHazeK);
    // halo chaud autour du soleil
    float sd = max(dot(d, normalize(uSkSun)), 0.0);
    c += uSkGlow * uSkGlowK * (pow(sd, 6.0) * 0.35 + pow(sd, 48.0) * 0.6);
    diffuseColor.rgb = c;
  }`);
  };
  material.customProgramCacheKey = () => 'photoSkyMood';
  material.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// Liseré de lumière (contre-jour) sur les personnages : on les détache du décor
// ---------------------------------------------------------------------------
export const RIM = { color: { value: new THREE.Color(0, 0, 0) }, dir: { value: new THREE.Vector3(0, 1, 0) } };
const RIM_FRAG = `
  {
    vec3 rimV = normalize(vViewPosition);
    float rimF = 1.0 - max(dot(normal, rimV), 0.0);
    rimF = smoothstep(0.42, 0.95, rimF);
    float rimL = 0.35 + 0.65 * smoothstep(-0.3, 0.7, dot(normal, uRimDir));
    outgoingLight += uRimColor * rimF * rimL;
  }
`;
/** Ajoute le liseré aux matériaux éclairés d'un personnage (chaîné avec leurs propres retouches). */
export function rimify(root) {
  const done = new Set();
  root.traverse(o => {
    if (!(o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) || !o.material || o.userData.outline) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (done.has(m) || m.userData.rim || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshToonMaterial || m.isMeshPhongMaterial)) continue;
      done.add(m); m.userData.rim = true;
      const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
      m.onBeforeCompile = function (sh, r) {
        if (prev) prev.call(this, sh, r);
        sh.uniforms.uRimColor = RIM.color; sh.uniforms.uRimDir = RIM.dir;
        const anchor = sh.fragmentShader.includes('#include <opaque_fragment>') ? '#include <opaque_fragment>' : '#include <output_fragment>';
        sh.fragmentShader = 'uniform vec3 uRimColor, uRimDir;\n' + sh.fragmentShader.replace(anchor, RIM_FRAG + anchor);
      };
      m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|rim'; };
      m.needsUpdate = true;
    }
  });
}

// ---------------------------------------------------------------------------
// Particules d'ambiance (pollen, poussière, givre, étoiles, aigrettes)
// Positions fixes dans le monde, repliées dans une boîte autour de la caméra par le shader.
// ---------------------------------------------------------------------------
const MOTE_VERT = `
attribute vec4 aSeed;
uniform float uTime, uR, uH, uSize, uScale, uWobble, uBright, uGlint, uSharp;
uniform vec3 uCam, uDrift, uSun;
varying float vI; varying float vMix;
void main() {
  vec3 box = vec3(2.0 * uR, uH, 2.0 * uR);
  float w = aSeed.w;
  vec3 p = aSeed.xyz * box + uDrift * uTime * (0.6 + 0.8 * w)
    + vec3(sin(uTime * 0.7 + w * 40.0), sin(uTime * 0.9 + w * 23.0) * 0.6, cos(uTime * 0.6 + w * 31.0)) * uWobble;
  vec3 base = uCam - vec3(uR, uH * 0.35, uR);
  p = base + mod(p - base, box);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float d = -mv.z;
  float fade = smoothstep(1.5, 4.5, d) * (1.0 - smoothstep(uR * 0.55, uR * 0.98, length(p.xz - uCam.xz)))
    * smoothstep(0.0, 1.0, p.y - base.y) * (1.0 - smoothstep(uH - 1.5, uH, p.y - base.y));
  float tw = 0.5 + 0.5 * sin(uTime * (1.5 + 3.0 * w) + w * 60.0);
  vec3 dir = normalize(p - uCam);
  float fwd = pow(max(dot(dir, uSun), 0.0), 3.0);          // dans la lumière du soleil : ça scintille
  vI = fade * (uBright * (0.55 + 0.45 * tw) + uGlint * pow(tw, uSharp) * (0.25 + fwd));
  vMix = fract(w * 7.13);
  gl_PointSize = clamp(uSize * uScale / max(d, 0.1) * (0.6 + 0.6 * fract(w * 3.7)), 1.5, 16.0);
  gl_Position = projectionMatrix * mv;
  if (vI < 0.004) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const MOTE_FRAG = `
uniform vec3 uColor, uColor2; uniform float uOpacity;
varying float vI; varying float vMix;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  float a = smoothstep(1.0, 0.0, r); a *= a;
#ifdef FLUFF
  // aigrette : un cœur et de fins rayons
  float ang = atan(q.y, q.x);
  a = max(a * 0.7, smoothstep(0.25, 0.0, abs(sin(ang * 4.0)) * r) * (1.0 - r) * 0.8);
  gl_FragColor = vec4(uColor * min(vI, 1.4), a * uOpacity * min(vI, 1.0));
#else
  gl_FragColor = vec4(mix(uColor, uColor2, vMix) * vI, a);
#endif
}`;
function buildMotes(scene, o, lite, sunDir) {
  const n = lite ? o.nLite : o.n;
  const seed = new Float32Array(n * 4);
  let s = 1234567;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n * 4; i++) seed[i] = r();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const fluff = o.blend === 'normal';
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uR: { value: o.R }, uH: { value: o.H }, uSize: { value: o.size }, uScale: { value: 500 },
      uWobble: { value: o.wobble }, uBright: { value: o.bright }, uGlint: { value: o.glint || 0 }, uSharp: { value: o.sharp || 6 },
      uCam: { value: new THREE.Vector3() }, uDrift: { value: new THREE.Vector3(...o.drift) }, uSun: { value: sunDir },
      uColor: { value: C(o.color) }, uColor2: { value: C(o.color2 || o.color) }, uOpacity: { value: o.opacity || 1 },
    },
    vertexShader: MOTE_VERT, fragmentShader: MOTE_FRAG,
    transparent: true, depthWrite: false, blending: fluff ? THREE.NormalBlending : THREE.AdditiveBlending,
    defines: fluff ? { FLUFF: 1 } : {},
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false; pts.renderOrder = 5; pts.userData.noOutline = true;
  scene.add(pts);
  return pts;
}

// ---------------------------------------------------------------------------
// Rayons de soleil entre les arbres : cartes lumineuses tournées vers la caméra autour
// de l'axe du soleil (un seul objet instancié)
// ---------------------------------------------------------------------------
const RAY_VERT = `
attribute vec4 aRay; attribute vec2 aRay2;
uniform vec3 uSun, uCam; uniform float uTime, uFar, uNear;
varying vec2 vUv; varying float vK; varying float vSeed;
void main() {
  vec3 A = normalize(uSun);
  vec3 b = aRay.xyz; float w = aRay.w, len = aRay2.x;
  vec3 mid = b + A * len * 0.35;
  vec3 toCam = uCam - mid;
  vec3 side = normalize(cross(A, toCam));
  vec3 p = b + A * (uv.y * len) + side * ((uv.x - 0.5) * w * (1.0 + uv.y * 0.7));
  float dc = length(toCam);
  vK = smoothstep(uNear, uNear + 4.0, dc) * (1.0 - smoothstep(uFar * 0.6, uFar, dc));
  // plus forts quand on regarde vers le soleil, et ils « respirent » doucement
  vK *= (0.45 + 0.55 * max(dot(normalize(mid - uCam), A), 0.0)) * (0.65 + 0.35 * sin(uTime * 0.5 + aRay2.y * 20.0));
  vUv = uv; vSeed = aRay2.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  if (vK < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const RAY_FRAG = `
uniform vec3 uColor; uniform float uK, uTime;
varying vec2 vUv; varying float vK; varying float vSeed;
void main() {
  float e = sin(vUv.x * 3.14159265); e *= e;
  float streak = 0.7 + 0.3 * sin(vUv.x * 19.0 + vSeed * 40.0 + uTime * 0.3);
  float l = smoothstep(0.0, 0.1, vUv.y) * pow(1.0 - vUv.y, 1.4);
  gl_FragColor = vec4(uColor * (e * streak * l * vK * uK), 1.0);
}`;
function buildRays(scene, L, o, lite, sunDir) {
  const trees = (L.trees || []).filter(t => t && isFinite(t.x) && isFinite(t.z));
  if (!trees.length) return null;
  const n = Math.min(lite ? o.nLite : o.n, trees.length * 3);
  let s = 424242;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const ray = new Float32Array(n * 4), ray2 = new Float32Array(n * 2);
  const hAt = (x, z) => (L.groundY ? L.groundY(x, z) : L.heightAt ? L.heightAt(x, z) : 0);
  // de préférence là où les arbres sont serrés (sous les frondaisons)
  const dense = trees.filter(t => trees.some(u => u !== t && Math.abs(u.x - t.x) < 9 && Math.abs(u.z - t.z) < 9));
  const pool = dense.length > 12 ? dense : trees;
  const place = (i, t) => {
    const a = r() * Math.PI * 2, d = 2 + r() * 4.5 * (t.s || 1);
    const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
    let y = hAt(x, z); if (!isFinite(y)) y = t.y || 0;
    ray[i * 4] = x; ray[i * 4 + 1] = y - 0.3; ray[i * 4 + 2] = z; ray[i * 4 + 3] = 0.9 + r() * 2.2;
    ray2[i * 2] = 13 + r() * 9; ray2[i * 2 + 1] = r();
  };
  for (let i = 0; i < n; i++) place(i, pool[Math.floor(r() * pool.length)]);
  const base = new THREE.PlaneGeometry(1, 1, 1, 1);
  const g = new THREE.InstancedBufferGeometry();
  g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
  g.setAttribute('aRay', new THREE.InstancedBufferAttribute(ray, 4));
  g.setAttribute('aRay2', new THREE.InstancedBufferAttribute(ray2, 2));
  g.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir }, uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uFar: { value: lite ? 34 : 48 }, uNear: { value: o.near || 3 }, uColor: { value: C(o.color) }, uK: { value: o.k } },
    vertexShader: RAY_VERT, fragmentShader: RAY_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false; m.renderOrder = 6; m.userData.noOutline = true;
  scene.add(m);
  // les rayons trop loin de la caméra reviennent près d'elle (sous les arbres les plus proches)
  const R = lite ? 26 : 34, near = [];
  m.userData.relocate = (cx, cz) => {
    near.length = 0;
    for (const t of pool) if (Math.abs(t.x - cx) < R && Math.abs(t.z - cz) < R) near.push(t);
    if (!near.length) return;
    let moved = false;
    for (let i = 0; i < n; i++) {
      if (Math.abs(ray[i * 4] - cx) < R && Math.abs(ray[i * 4 + 2] - cz) < R) continue;
      place(i, near[Math.floor(r() * near.length)]); moved = true;
    }
    if (moved) { g.attributes.aRay.needsUpdate = true; g.attributes.aRay2.needsUpdate = true; }
  };
  return m;
}

// ---------------------------------------------------------------------------
// Paillettes sur l'eau : de minuscules facettes qui ne brillent que dans le reflet du soleil
// ---------------------------------------------------------------------------
const GLINT_VERT = `
attribute vec4 aSeed;
uniform float uTime, uR, uY, uSize, uScale, uK, uHalf;
uniform vec3 uCam, uSun;
uniform sampler2D uHeight;
varying float vI;
void main() {
  vec2 box = vec2(2.0 * uR);
  vec2 base = uCam.xz - uR;
  vec2 xz = base + mod(aSeed.xy * box + vec2(uTime * 0.15, uTime * 0.05) - base, box);
  float y = uY + 0.04 + sin(xz.x * 0.35 + uTime * 1.3) * 0.05 + sin(xz.y * 0.3 + uTime * 1.1) * 0.05;
  vec3 p = vec3(xz.x, y, xz.y);
  // facette : petite vague inclinée au hasard, qui tourne avec le temps
  float ph = uTime * (1.2 + aSeed.w * 2.0) + aSeed.z * 30.0;
  vec3 n = normalize(vec3(sin(ph) * 0.16, 1.0, cos(ph * 1.3) * 0.16));
  vec3 v = normalize(uCam - p);
  float spec = pow(max(dot(reflect(-normalize(uSun), n), v), 0.0), 60.0);
  float d = length(uCam - p);
  float fade = smoothstep(1.5, 4.0, d) * (1.0 - smoothstep(uR * 0.6, uR * 0.98, length(xz - uCam.xz)));
  // seulement là où il y a vraiment de l'eau (même carte des fonds que l'eau elle-même)
  vec2 huv = (xz + uHalf) / (2.0 * uHalf);
  float ground = texture2D(uHeight, huv).r * 16.0 - 8.0;
  if (huv.x < 0.0 || huv.x > 1.0 || huv.y < 0.0 || huv.y > 1.0) ground = -8.0;
  fade *= smoothstep(0.25, 0.9, uY - ground);
  vI = spec * fade * uK * (0.5 + 0.5 * sin(ph * 2.7));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(uSize * uScale / max(-mv.z, 0.1) * (0.6 + 0.8 * min(vI, 1.0)), 2.0, 10.0);
  gl_Position = projectionMatrix * mv;
  if (vI < 0.01) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}`;
const GLINT_FRAG = `
uniform vec3 uColor; varying float vI;
void main() {
  vec2 q = abs(gl_PointCoord - 0.5) * 2.0;
  // petite étoile à quatre branches
  float a = max(smoothstep(0.35, 0.0, q.x * q.y * 6.0 + max(q.x, q.y) * 0.25), smoothstep(1.0, 0.0, length(q) * 1.6));
  a *= 1.0 - smoothstep(0.7, 1.0, max(q.x, q.y));
  gl_FragColor = vec4(uColor * vI, a);
}`;
function buildGlints(scene, o, lite, sunDir, waterY, color, water) {
  const n = lite ? o.nLite : o.n;
  const seed = new Float32Array(n * 4);
  let s = 777;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < n * 4; i++) seed[i] = r();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uR: { value: o.R }, uY: { value: waterY }, uSize: { value: 0.11 }, uScale: { value: 500 }, uK: { value: o.k }, uCam: { value: new THREE.Vector3() }, uSun: { value: sunDir }, uColor: { value: color },
      uHeight: water.material.uniforms.uHeight, uHalf: water.material.uniforms.uHalf },
    vertexShader: GLINT_VERT, fragmentShader: GLINT_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false; pts.renderOrder = 3; pts.userData.noOutline = true;
  scene.add(pts);
  return pts;
}

// ---------------------------------------------------------------------------
// Halos du soir (lampadaires de la ville)
// ---------------------------------------------------------------------------
function buildHalos(scene, spots, color, size, glowTex) {
  if (!spots || !spots.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(spots.flat(), 3));
  const m = new THREE.PointsMaterial({ map: glowTex, color, size, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const p = new THREE.Points(g, m); p.renderOrder = 4; p.userData.noOutline = true; p.frustumCulled = false;
  scene.add(p);
  return p;
}

/**
 * Habille le monde (après sa construction) : particules, rayons, paillettes, halos.
 * Renvoie { step(dt, t) } (à appeler à chaque image) ou null.
 */
export function buildMood(game, L, mood, opts) {
  if (!mood) return null;
  const sc = game.scene, lite = !!game.lite, sunDir = opts.sunDir;
  const parts = [];
  const motes = mood.motes ? buildMotes(sc, mood.motes, lite, sunDir) : null;
  const rays = mood.rays ? buildRays(sc, L, mood.rays, lite, sunDir) : null;
  const glints = mood.glints && game.water && game.water.material.uniforms && game.water.material.uniforms.uHeight ? buildGlints(sc, mood.glints, lite, sunDir, L.WATER_Y || 0, game.sun ? game.sun.color.clone().multiplyScalar(1.4) : C(0xfff0d0), game.water) : null;
  for (const o of [motes, rays, glints]) if (o) parts.push(o);
  let halos = null;
  if (mood.dusk && mood.lamps && sc.userData.lampSpots) halos = buildHalos(sc, sc.userData.lampSpots, 0xffc070, lite ? 3.2 : 3.6, opts.glowTex);
  if (halos) parts.push(halos);
  // les montagnes du lointain se fondent dans la brume du monde (et plus dans un bleu fixe)
  if (game.vista && game.vista.group && sc.fog) game.vista.group.traverse(o => { const m = o.material; if (m && m.emissive && !m.userData.moodHaze) { m.userData.moodHaze = true; m.emissive.copy(sc.fog.color); } });
  // nuages peints : le ciel photographié a déjà les siens ; le soir, ils prennent les couleurs du couchant
  for (const c of game.clouds || []) {
    if (game.photoSky) c.visible = false;
    else if (mood.dusk && mood.proc && c.material && c.material.color) c.material.color.set(mood.proc.horizon).lerp(C(0xffffff), 0.35);
  }
  // liseré des personnages
  if (mood.rim) { RIM.color.value.set(mood.rim[0]).multiplyScalar(mood.rim[1]); }
  else RIM.color.value.setRGB(0, 0, 0);
  const sunV = new THREE.Vector3();
  return {
    mood, parts,
    step(dt, t) {
      const cam = game.camera;
      const scale = game.renderer.domElement.height / 2 / Math.tan(cam.fov * Math.PI / 360);
      if (motes) { const u = motes.material.uniforms; u.uTime.value = t; u.uCam.value.copy(cam.position); u.uScale.value = scale; }
      if (rays) {
        const u = rays.material.uniforms; u.uTime.value = t; u.uCam.value.copy(cam.position);
        if (!(this._rt > 0)) { rays.userData.relocate(cam.position.x, cam.position.z); this._rt = 0.5; } else this._rt -= dt;
      }
      if (glints) { const u = glints.material.uniforms; u.uTime.value = t; u.uCam.value.copy(cam.position); u.uScale.value = scale; }
      if (halos) halos.material.opacity = 0.78 + Math.sin(t * 2.1) * 0.04;
      // direction du soleil vue de la caméra (pour le liseré)
      sunV.copy(sunDir).transformDirection(cam.matrixWorldInverse);
      RIM.dir.value.copy(sunV);
    },
    dispose() { for (const p of parts) if (p.parent) p.parent.remove(p); },
  };
}
