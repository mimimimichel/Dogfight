/*
 * Matcha & Ainu — matières « vraies » de la Station des Neiges (niveau 5) :
 *  - le sol : neige photographiée (relief), roche qui affleure sur les pentes raides
 *    (projection sur 3 axes, pas d'étirement), paillettes de neige qui scintillent au soleil ;
 *  - une chaîne de montagnes lointaine (crêtes, falaises, forêts au pied) qui se perd dans
 *    la brume (perspective aérienne) ;
 *  - une matière « riche » pour les objets peints (couleur par sommet) : ce qui est blanc
 *    devient neige (relief, paillettes, lumière qui traverse), ce qui est bleu clair devient
 *    glace (reflets, lueur intérieure, fissures), le brun devient bois, le jaune or, le noir
 *    charbon brillant. Aucun UV nécessaire : convient aux maillages instanciés de life.js.
 * Tout dépend des photos Poly Haven (CC0) chargées par realtex.js ; sans elles (style
 * « dessin animé »), ready() est faux et le niveau garde ses matières simples.
 */
import * as THREE from '../vendor/three.module.min.js';
import * as RT from './realtex.js';

const isTouch = () => typeof document !== 'undefined' && document.documentElement.classList.contains('touch');
/** Les photos de la neige sont là (style réaliste). */
export const ready = () => !!(RT.photoImage('snow_02_n') && RT.photoImage('rock_face_03_d') && RT.photoImage('rock_face_03_n'));

const texCache = {};
/** Texture photo (mise en cache : une seule copie en mémoire graphique par image). */
export function tex(key, srgb) {
  if (texCache[key]) return texCache[key];
  const im = RT.photoImage(key); if (!im) return null;
  const t = new THREE.Texture(im);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = isTouch() ? 4 : 8; t.needsUpdate = true;
  return (texCache[key] = t);
}

/** Uniformes communs (le soleil : la direction du niveau, mise à jour par game.js). */
const SUN = { value: new THREE.Vector3(0.4, 0.6, 0.5).normalize() };
export function setSun(v) { SUN.value = v; }

// ---------------------------------------------------------------------------
// GLSL partagé
// ---------------------------------------------------------------------------
const GLSL_COMMON = `
uniform vec3 uSaSun;
varying vec3 vSaPos;
float saHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 saTriW(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)); return w / (w.x + w.y + w.z); }
vec3 saTriD(sampler2D t, vec3 p, vec3 w) { return texture2D(t, p.zy).rgb * w.x + texture2D(t, p.xz).rgb * w.y + texture2D(t, p.xy).rgb * w.z; }
// normales projetées sur 3 axes (mélange « whiteout »), en repère monde
vec3 saTriN(sampler2D t, vec3 p, vec3 n, vec3 w) {
  vec3 tx = texture2D(t, p.zy).xyz * 2.0 - 1.0, ty = texture2D(t, p.xz).xyz * 2.0 - 1.0, tz = texture2D(t, p.xy).xyz * 2.0 - 1.0;
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x); ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y); tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  return normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
}
// paillettes : de petits points qui s'allument selon l'angle de vue (comme de vrais cristaux)
float saSparkle(vec3 p, vec3 n, vec3 V, float dens) {
  vec3 q = p * dens, cell = floor(q);
  float h = saHash(cell);
  float tw = fract(h * 113.7 + dot(V, vec3(5.3, 3.1, 4.7)) * 1.6);
  float g = smoothstep(0.975, 0.995, tw) * step(0.55, h);
  g *= smoothstep(0.42, 0.12, length(fract(q) - 0.5));
  return g * smoothstep(0.0, 0.35, dot(n, uSaSun));
}
`;
const VERT_POS = `
{
  vec4 saW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    saW = instanceMatrix * saW;
  #endif
  vSaPos = (modelMatrix * saW).xyz;
}`;

function patchVertex(sh) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vSaPos;')
    .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_POS);
}
const isPBR = (sh) => sh.fragmentShader.includes('#include <roughnessmap_fragment>');

// ---------------------------------------------------------------------------
// Le sol (et les montagnes lointaines)
// ---------------------------------------------------------------------------
/**
 * Ajoute à un MeshStandardMaterial (couleur par sommet = teinte de la neige) : roche sur les
 * pentes raides, paillettes, et (o.haze) la brume des lointains.
 * o = { rockScale, slope: [début, plein], height: [début, plein], sparkle, haze: { color, near, far, max } }
 */
export function patchGround(mat, o) {
  o = Object.assign({ rockScale: 0.11, slope: [0.3, 0.5], height: [4, 9], sparkle: 9, macro: 0.006, snowN: 0 }, o || {});
  const U = {
    uSaSun: SUN, tSnowN: { value: tex('snow_02_n') }, uSaSnowK: { value: o.snowN }, tRockD: { value: tex('rock_face_03_d', true) }, tRockN: { value: tex('rock_face_03_n') },
    uSaRock: { value: new THREE.Vector4(o.rockScale, o.slope[0], o.slope[1], o.sparkle) },
    uSaRockH: { value: new THREE.Vector2(o.height[0], o.height[1]) },
    uSaHaze: { value: o.haze ? new THREE.Vector3(o.haze.near, o.haze.far, o.haze.max) : new THREE.Vector3(0, 1, 0) },
    uSaHazeCol: { value: o.haze ? o.haze.color : new THREE.Color(1, 1, 1) },
    uSaMacro: { value: o.macro },
  };
  mat.userData.saUniforms = U;
  mat.onBeforeCompile = (sh) => {
    if (!isPBR(sh)) return;
    Object.assign(sh.uniforms, U);
    patchVertex(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_COMMON + `
        uniform sampler2D tRockD, tRockN, tSnowN; uniform float uSaSnowK; uniform vec4 uSaRock; uniform vec2 uSaRockH; uniform vec3 uSaHaze; uniform vec3 uSaHazeCol; uniform float uSaMacro;`)
      .replace('#include <normal_fragment_maps>', `
        vec3 saGN = inverseTransformDirection(normal, viewMatrix);
        #include <normal_fragment_maps>
        {
          vec3 saV = normalize(cameraPosition - vSaPos);
          float saDist = length(cameraPosition - vSaPos);
          // grandes ondulations de teinte (la neige n'est jamais d'un blanc uniforme)
          float saM = texture2D(tRockD, vSaPos.xz * uSaMacro).g;
          diffuseColor.rgb *= 0.93 + saM * 0.16;
          // relief de la neige photographiée, à deux échelles (pas de motif répété visible)
          if (uSaSnowK > 0.0) {
            vec3 sa1 = texture2D(tSnowN, vSaPos.xz * 0.15).xyz * 2.0 - 1.0;
            vec3 sa2 = texture2D(tSnowN, mat2(0.8, -0.6, 0.6, 0.8) * vSaPos.xz * 0.043 + 0.37).xyz * 2.0 - 1.0;
            vec2 saD2 = (sa1.xy * 0.55 + sa2.xy * 0.9) * uSaSnowK * (1.0 - 0.6 * smoothstep(20.0, 70.0, saDist));
            vec3 saNW = normalize(vec3(saGN.x + saD2.x, saGN.y, saGN.z - saD2.y));
            normal = normalize((viewMatrix * vec4(saNW, 0.0)).xyz);
          }
          // roche sur les pentes raides (et pas dans les creux du village)
          float saSlope = 1.0 - saGN.y + (saM - 0.45) * 0.18;
          float saRk = smoothstep(uSaRock.y, uSaRock.z, saSlope) * smoothstep(uSaRockH.x, uSaRockH.y, vSaPos.y);
          if (saRk > 0.003) {
            vec3 saW3 = saTriW(saGN);
            vec3 saP = vSaPos * uSaRock.x;
            vec3 saRc = saTriD(tRockD, saP, saW3);
            // roche alpine : grise et froide, un peu de la teinte d'origine
            float saL = dot(saRc, vec3(0.3, 0.59, 0.11));
            saRc = mix(vec3(saL), saRc, 0.3) * vec3(0.86, 0.9, 1.0) * 1.55;
            vec3 saRn = saTriN(tRockN, saP, saGN, saW3);
            // la neige reste accrochée aux replats de la roche
            float saHold = smoothstep(0.45, 0.75, saRn.y + saL * 0.3 + (saM - 0.45) * 0.6) * (1.0 - smoothstep(0.6, 0.95, saSlope));
            float saK = saRk * (1.0 - saHold * 0.85);
            diffuseColor.rgb = mix(diffuseColor.rgb, saRc, saK);
            normal = normalize(mix(normal, normalize((viewMatrix * vec4(saRn, 0.0)).xyz), saRk));
            roughnessFactor = mix(roughnessFactor, 0.92, saK);
            saRk = saK;
          }
          // paillettes au soleil
          if (uSaRock.w > 0.0 && saDist < 30.0) {
            float g = saSparkle(vSaPos, saGN, saV, uSaRock.w) * (1.0 - saRk) * (1.0 - smoothstep(12.0, 30.0, saDist));
            totalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * g * 3.0;
          }
          // la neige à contre-jour garde un peu de lumière bleutée (elle diffuse la lumière)
          totalEmissiveRadiance += vec3(0.30, 0.42, 0.62) * 0.05 * (1.0 - saRk) * pow(1.0 - max(dot(saGN, saV), 0.0), 2.0);
          // pentes dos au soleil : la lumière du ciel bleu (jamais un mur sombre)
          totalEmissiveRadiance += vec3(0.32, 0.44, 0.64) * 0.16 * (1.0 - 0.6 * saRk) * (1.0 - smoothstep(-0.15, 0.45, dot(saGN, uSaSun)));
        }`);
    if (o.haze) {
      sh.fragmentShader = sh.fragmentShader.replace('#include <fog_fragment>', `
        {
          float saD = length(vSaPos - cameraPosition);
          float saHz = clamp((saD - uSaHaze.x) / (uSaHaze.y - uSaHaze.x), 0.0, 1.0);
          saHz = uSaHaze.z * (1.0 - exp(-2.6 * saHz)) / (1.0 - exp(-2.6));
          saHz *= 1.0 - 0.15 * smoothstep(60.0, 300.0, vSaPos.y);
          // (le ciel éclaire aussi les faces à l'ombre : les lointains ne sont jamais noirs)
          gl_FragColor.rgb = mix(max(gl_FragColor.rgb, uSaHazeCol * 0.55), uSaHazeCol, saHz);
        }`);
    }
  };
  mat.customProgramCacheKey = () => 'sa-ground' + (o.haze ? 'h' : '') + (o.sparkle > 0 ? 's' : '');
  return mat;
}

// ---------------------------------------------------------------------------
// Matière riche des objets peints (neige, glace, bois, or, charbon)
// ---------------------------------------------------------------------------
/**
 * o = { snow: true, ice: true, wood: true, gold: true, sparkle: 14, roughness }
 * Sans les photos, une matière standard ordinaire (même aspect qu'avant).
 */
export function richMaterial(o) {
  o = Object.assign({ snow: true, ice: true, wood: true, gold: true, dark: true, lamp: false, sparkle: 14, roughness: 0.8 }, o || {});
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: o.roughness, side: o.side || THREE.FrontSide });
  if (!ready()) return mat;
  const U = {
    uSaSun: SUN, tSnowN: { value: tex('snow_02_n') }, tRockD: { value: tex('rock_face_03_d', true) },
    tWoodD: { value: tex('brown_planks_03_d', true) || tex('rock_face_03_d', true) }, tWoodN: { value: tex('brown_planks_03_n') || tex('rock_face_03_n') },
    uSaSpk: { value: o.sparkle },
  };
  const D = (k) => (o[k] ? `#define SA_${k.toUpperCase()}\n` : '');
  mat.userData.saUniforms = U;
  mat.onBeforeCompile = (sh) => {
    if (!isPBR(sh)) return;
    Object.assign(sh.uniforms, U);
    patchVertex(sh);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + D('snow') + D('ice') + D('wood') + D('gold') + D('dark') + D('lamp') + GLSL_COMMON + `
        uniform sampler2D tSnowN, tRockD, tWoodD, tWoodN; uniform float uSaSpk;`)
      .replace('#include <normal_fragment_maps>', `
        vec3 saGN = inverseTransformDirection(normal, viewMatrix);
        #include <normal_fragment_maps>
        {
          vec3 saC = diffuseColor.rgb;
          float saMx = max(saC.r, max(saC.g, saC.b)), saMn = min(saC.r, min(saC.g, saC.b));
          float saSat = (saMx - saMn) / max(saMx, 0.001);
          float saL = dot(saC, vec3(0.299, 0.587, 0.114));
          vec3 saV = normalize(cameraPosition - vSaPos);
          float saNV = max(dot(saGN, saV), 0.0);
          float saDist = length(cameraPosition - vSaPos);
          vec3 saW3 = saTriW(saGN);
          #ifdef SA_SNOW
          float wS = smoothstep(0.55, 0.78, saMn) * (1.0 - smoothstep(0.18, 0.32, saSat));
          if (wS > 0.01) {
            vec3 n2 = saTriN(tSnowN, vSaPos * 0.9, saGN, saW3);
            normal = normalize(mix(normal, normalize((viewMatrix * vec4(n2, 0.0)).xyz), wS * 0.8));
            roughnessFactor = mix(roughnessFactor, 0.7, wS);
            // lumière qui traverse la neige : bords lumineux bleutés, jamais d'ombre grise
            totalEmissiveRadiance += wS * (vec3(0.42, 0.58, 0.85) * 0.07 + vec3(0.75, 0.86, 1.0) * 0.16 * pow(1.0 - saNV, 3.0));
            if (uSaSpk > 0.0 && saDist < 25.0) totalEmissiveRadiance += wS * vec3(1.0, 0.97, 0.9) * 3.0 * saSparkle(vSaPos, saGN, saV, uSaSpk) * (1.0 - smoothstep(10.0, 25.0, saDist));
          }
          #endif
          #ifdef SA_ICE
          float wI = smoothstep(0.25, 0.45, saSat) * step(saC.r, saC.b) * step(saC.r, saC.g + 0.05) * smoothstep(0.18, 0.45, saC.b) * step(0.08, saMn + 0.1 * step(0.6, saC.b));
          if (wI > 0.01) {
            // fissures et bulles (la roche photographiée, en négatif) : la glace a de la profondeur
            float cr = saTriD(tRockD, vSaPos * 0.9, saW3).g;
            vec3 deep = saC * vec3(0.55, 0.75, 0.95);
            diffuseColor.rgb = mix(diffuseColor.rgb, deep, wI * 0.6);
            roughnessFactor = mix(roughnessFactor, 0.06, wI);
            metalnessFactor = mix(metalnessFactor, 0.0, wI);
            totalEmissiveRadiance += wI * (saC * (0.16 + 0.32 * pow(saNV, 1.5)) * (0.7 + cr * 0.9) + vec3(0.8, 0.95, 1.0) * 0.45 * pow(1.0 - saNV, 4.0));
          }
          #endif
          #ifdef SA_WOOD
          float wW = step(saC.b, saC.g) * step(saC.g, saC.r) * smoothstep(0.45, 0.6, saSat) * (1.0 - smoothstep(0.18, 0.3, saL)) * step(0.012, saL);
          if (wW > 0.01) {
            vec3 wp = vSaPos * 0.55;
            vec3 g = saTriD(tWoodD, wp, saW3);
            diffuseColor.rgb = mix(diffuseColor.rgb, saC * g * 3.0, wW);
            vec3 n3 = saTriN(tWoodN, wp, saGN, saW3);
            normal = normalize(mix(normal, normalize((viewMatrix * vec4(n3, 0.0)).xyz), wW * 0.8));
            roughnessFactor = mix(roughnessFactor, 0.78, wW);
          }
          #endif
          #ifdef SA_GOLD
          float wG = step(0.45, saC.r) * step(0.22, saC.g) * step(saC.b, saC.g * 0.35) * smoothstep(0.6, 0.8, saSat);
          if (wG > 0.01) { metalnessFactor = mix(metalnessFactor, 1.0, wG); roughnessFactor = mix(roughnessFactor, 0.28, wG); diffuseColor.rgb *= 1.0 + wG * 0.3; }
          #endif
          #ifdef SA_DARK
          float wK = 1.0 - smoothstep(0.012, 0.03, saMx);
          roughnessFactor = mix(roughnessFactor, 0.22, wK);
          #endif
          #ifdef SA_LAMP
          // vitre de lanterne (jaune pâle) : elle luit
          float wLp = step(0.9, saC.r) * step(0.55, saC.g) * step(0.15, saC.b) * step(saC.b, 0.55);
          totalEmissiveRadiance += saC * wLp * 0.9;
          #endif
        }`);
  };
  mat.customProgramCacheKey = () => 'sa-rich' + D('snow') + D('ice') + D('wood') + D('gold') + D('dark') + D('lamp');
  return mat;
}

// ---------------------------------------------------------------------------
// Bruit (relief des montagnes lointaines)
// ---------------------------------------------------------------------------
function h2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
/** Bruit « en crêtes » : arêtes vives et ravines. */
export function ridged(x, y, oct) {
  let s = 0, amp = 1, f = 1, sum = 0, w = 1;
  for (let k = 0; k < (oct || 5); k++) {
    let n = 1 - Math.abs(vnoise(x * f + k * 17.3, y * f - k * 9.1) * 2 - 1);
    n = n * n * w; w = Math.min(1, n * 1.6);
    s += n * amp; sum += amp; amp *= 0.5; f *= 2.03;
  }
  return s / sum;
}

/**
 * Chaînes de montagnes autour du monde (hors d'atteinte) : un anneau de relief qui part du
 * bord (forme carrée arrondie du monde) et s'éloigne en cercle. Deux rangs : le premier,
 * proche et net ; le second, immense et bleuté. Un seul maillage par rang.
 */
export function buildRanges(sc, o) {
  const lite = !!o.lite, haze = o.hazeColor;
  const out = [];
  const RANKS = [
    { e0: o.inner || 200, e1: 560, segA: lite ? 240 : 400, segR: lite ? 24 : 40, h0: 10, h1: 240, f: 0.0105, seed: 3, near: 40, far: 650, max: 0.62 },
    { e0: 600, e1: 1080, segA: lite ? 170 : 260, segR: lite ? 12 : 18, h0: 40, h1: 420, f: 0.0052, seed: 11, near: 400, far: 1150, max: 0.8 },
  ];
  for (const R of RANKS) {
    const nA = R.segA, nR = R.segR, pos = new Float32Array((nA + 1) * (nR + 1) * 3), idx = [];
    const col = new Float32Array((nA + 1) * (nR + 1) * 3);
    for (let j = 0; j <= nR; j++) {
      const t = j / nR, e = R.e0 + (R.e1 - R.e0) * Math.pow(t, 1.2);
      for (let i = 0; i <= nA; i++) {
        const a = (i / nA) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        const se = 1 / Math.pow(Math.pow(Math.abs(ca), 4) + Math.pow(Math.abs(sa), 4), 0.25);   // bord carré arrondi
        const k = R === RANKS[0] ? 1 + (se - 1) * (1 - smooth01(t * 1.6)) : 1;
        const x = ca * e * k, z = sa * e * k;
        // profil : on monte depuis le bord, de grands sommets au milieu, on redescend au loin
        const prof = smooth01((t - 0.06) / 0.3) * (1 - 0.6 * smooth01((t - 0.72) / 0.28));
        // massifs (bruit lent) et arêtes (bruit en crêtes, accentué : pics pointus, ravines)
        const big = vnoise(x * R.f * 0.32 + R.seed, z * R.f * 0.32 - R.seed);
        const fine = Math.pow(ridged(x * R.f + R.seed * 3, z * R.f, lite ? 4 : 6), 1.6);
        let h = R.h0 + (R.h1 - R.h0) * prof * (0.3 + 0.7 * big) * (0.25 + 0.95 * fine);
        if (j === 0) h = R.h0 * 0.6;
        const n = (j * (nA + 1) + i) * 3;
        pos[n] = x; pos[n + 1] = h - 4; pos[n + 2] = z;
        col[n] = col[n + 1] = col[n + 2] = 1;
      }
    }
    for (let j = 0; j < nR; j++) for (let i = 0; i < nA; i++) { const a = j * (nA + 1) + i, b = a + nA + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    // forêts sombres au pied, neige au-dessus (la roche des pentes raides vient du shader)
    const nr = g.attributes.normal, c = new THREE.Color(), SNOW = new THREE.Color(0.95, 0.97, 1.0), FOREST = new THREE.Color(0.2, 0.27, 0.25);
    for (let v = 0; v < pos.length / 3; v++) {
      const y = pos[v * 3 + 1], ny = nr.getY(v);
      const nz = h2(Math.floor(pos[v * 3] * 0.05), Math.floor(pos[v * 3 + 2] * 0.05));
      const forest = (1 - smooth01((y - R.h0 * 0.9 - nz * 22) / 26)) * smooth01((ny - 0.55) / 0.2) * (R === RANKS[0] ? 1 : 0.7);
      c.copy(SNOW).lerp(FOREST, forest * 0.85);
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = patchGround(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, fog: false }),
      { rockScale: R === RANKS[0] ? 0.03 : 0.012, slope: [0.36, 0.58], height: [-50, -40], sparkle: 0, macro: 0.002, haze: { color: haze, near: R.near, far: R.far, max: R.max } });
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false; m.userData.noOutline = true; m.renderOrder = -2;
    m.name = 'ranges';
    sc.add(m); out.push(m);
  }
  return out;
}
function smooth01(t) { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
