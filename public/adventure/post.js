/*
 * Matcha & Ainu — post-traitement « cinéma » (sans dépendance).
 *
 * La scène est rendue dans une image HDR (lumière non écrêtée), puis :
 *  - halo lumineux (bloom) : les zones très claires (soleil, cristaux, pièces,
 *    lanternes) « débordent » doucement, par une chaîne de flous réduits ;
 *  - courbe de tons douce (la même que le rendu d'origine, Khronos Neutral) ;
 *  - étalonnage : contraste, saturation, teinte chaude dans les ombres ;
 *  - vignettage léger et un grain imperceptible (évite les bandes de couleur).
 *
 * Deux niveaux : 'high' (ordinateur) et 'lite' (téléphone : bloom plus petit).
 */
import * as THREE from '../vendor/three.module.min.js';

const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// seuil doux : ne garde que ce qui dépasse la lumière « normale »
const BRIGHT = `precision highp float; varying vec2 vUv; uniform sampler2D tMap; uniform vec2 texel; uniform float threshold, knee;
void main() {
  vec3 c = texture2D(tMap, vUv + texel * vec2(-0.5, -0.5)).rgb + texture2D(tMap, vUv + texel * vec2(0.5, -0.5)).rgb
         + texture2D(tMap, vUv + texel * vec2(-0.5, 0.5)).rgb + texture2D(tMap, vUv + texel * vec2(0.5, 0.5)).rgb;
  c *= 0.25;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - threshold + knee, 0.0, 2.0 * knee); soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(soft, br - threshold) / max(br, 1e-4);
  gl_FragColor = vec4(min(c * w, vec3(24.0)), 1.0);
}`;

// filtre « dual Kawase » : réduction
const DOWN = `precision highp float; varying vec2 vUv; uniform sampler2D tMap; uniform vec2 texel;
void main() {
  vec3 s = texture2D(tMap, vUv).rgb * 4.0;
  s += texture2D(tMap, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(tMap, vUv + texel * vec2(1.0, -1.0)).rgb;
  s += texture2D(tMap, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(tMap, vUv + texel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0);
}`;

// agrandissement + ajout du niveau plus fin
const UP = `precision highp float; varying vec2 vUv; uniform sampler2D tMap, tAdd; uniform vec2 texel; uniform float mixAdd;
void main() {
  vec3 s = texture2D(tMap, vUv + texel * vec2(-2.0, 0.0)).rgb + texture2D(tMap, vUv + texel * vec2(2.0, 0.0)).rgb;
  s += texture2D(tMap, vUv + texel * vec2(0.0, -2.0)).rgb + texture2D(tMap, vUv + texel * vec2(0.0, 2.0)).rgb;
  s += (texture2D(tMap, vUv + texel * vec2(-1.0, -1.0)).rgb + texture2D(tMap, vUv + texel * vec2(1.0, -1.0)).rgb
      + texture2D(tMap, vUv + texel * vec2(-1.0, 1.0)).rgb + texture2D(tMap, vUv + texel * vec2(1.0, 1.0)).rgb) * 2.0;
  gl_FragColor = vec4(s / 12.0 + texture2D(tAdd, vUv).rgb * mixAdd, 1.0);
}`;

const FINAL = `precision highp float; varying vec2 vUv;
uniform sampler2D tScene, tBloom; uniform float bloom, exposure, contrast, saturation, vignette, time, grain;
uniform vec3 shadowTint, highTint; uniform vec2 res;
// courbe de tons Khronos PBR Neutral (comme le rendu d'origine du jeu)
vec3 neutral(vec3 c) {
  const float startC = 0.8 - 0.04, desat = 0.15;
  float x = min(c.r, min(c.g, c.b)); float off = x < 0.08 ? x - 6.25 * x * x : 0.04; c -= off;
  float peak = max(c.r, max(c.g, c.b)); if (peak < startC) return c;
  float d = 1.0 - startC; float np = 1.0 - d * d / (peak + d - startC); c *= np / peak;
  float g = 1.0 - 1.0 / (desat * (peak - np) + 1.0); return mix(c, vec3(np), g);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tScene, vUv).rgb;
  c += texture2D(tBloom, vUv).rgb * bloom;
  c = neutral(c * exposure);
  // étalonnage (dans un espace perceptif)
  vec3 s = toSRGB(clamp(c, 0.0, 1.0));
  float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
  s = mix(vec3(l), s, saturation);
  s = (s - 0.5) * contrast + 0.5;
  s += shadowTint * (1.0 - smoothstep(0.0, 0.55, l)) + highTint * smoothstep(0.5, 1.0, l);
  // vignettage doux
  vec2 q = vUv - 0.5; q.x *= res.x / res.y * 0.75;
  s *= 1.0 - vignette * smoothstep(0.35, 0.95, length(q));
  s += (hash(vUv * res + time) - 0.5) * grain;
  gl_FragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
}`;

export class Post {
  /** renderer : THREE.WebGLRenderer ; quality : 'high' | 'lite' ; grade : réglages d'étalonnage du niveau. */
  constructor(renderer, quality, grade) {
    this.r = renderer;
    this.quality = quality;
    this.enabled = true;
    const caps = renderer.capabilities, ext = renderer.extensions;
    const half = caps.isWebGL2 && (ext.has('EXT_color_buffer_half_float') || ext.has('EXT_color_buffer_float'));
    this.type = half ? THREE.HalfFloatType : THREE.UnsignedByteType;
    const g = Object.assign({ bloom: 0.55, threshold: 1.0, knee: 0.5, exposure: 1.0, contrast: 1.06, saturation: 1.06, vignette: 0.3,
      shadowTint: [0.012, 0.004, 0.02], highTint: [0.02, 0.012, -0.01] }, grade || {});
    if (!half) { g.threshold = Math.min(g.threshold, 0.82); g.knee = 0.25; }   // image sans HDR : seuil plus bas
    this.grade = g;
    this.levels = quality === 'high' ? 5 : 4;
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    const mk = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    this.mBright = mk(BRIGHT, { tMap: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: g.threshold }, knee: { value: g.knee } });
    this.mDown = mk(DOWN, { tMap: { value: null }, texel: { value: new THREE.Vector2() } });
    this.mUp = mk(UP, { tMap: { value: null }, tAdd: { value: null }, texel: { value: new THREE.Vector2() }, mixAdd: { value: 1 } });
    this.mFinal = mk(FINAL, {
      tScene: { value: null }, tBloom: { value: null }, bloom: { value: g.bloom }, exposure: { value: g.exposure },
      contrast: { value: g.contrast }, saturation: { value: g.saturation }, vignette: { value: g.vignette },
      shadowTint: { value: new THREE.Vector3(...g.shadowTint) }, highTint: { value: new THREE.Vector3(...g.highTint) },
      res: { value: new THREE.Vector2(1, 1) }, time: { value: 0 }, grain: { value: half ? 0.012 : 0.02 },
    });
    this.w = 0; this.h = 0;
  }

  rt(w, h, samples, depth) {
    return new THREE.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), {
      type: this.type, depthBuffer: !!depth, samples: samples || 0,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
    });
  }

  setSize(w, h) {
    w = Math.floor(w); h = Math.floor(h);
    if (w === this.w && h === this.h) return;
    this.dispose();
    this.w = w; this.h = h;
    // l'image de la scène garde l'anticrénelage (MSAA) du rendu d'origine
    this.sceneRT = this.rt(w, h, this.r.capabilities.isWebGL2 ? (this.quality === 'high' ? 4 : 2) : 0, true);
    this.down = []; this.up = [];
    let bw = w >> 1, bh = h >> 1;
    if (this.quality !== 'high') { bw = w >> 2; bh = h >> 2; }
    for (let i = 0; i < this.levels; i++) {
      this.down.push(this.rt(bw, bh));
      this.up.push(this.rt(bw, bh));
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
    }
    this.mFinal.uniforms.res.value.set(w, h);
  }

  pass(mat, target) {
    this.quad.material = mat;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }

  render(scene, camera, time) {
    const r = this.r;
    if (!this.enabled) { r.setRenderTarget(null); r.render(scene, camera); return; }
    const size = r.getDrawingBufferSize(this._v || (this._v = new THREE.Vector2()));
    this.setSize(size.x, size.y);
    const ac = r.autoClear;
    r.autoClear = true;
    r.setRenderTarget(this.sceneRT);
    r.render(scene, camera);
    // halo : seuil, puis chaîne de flous
    const b = this.mBright.uniforms;
    b.tMap.value = this.sceneRT.texture; b.texel.value.set(1 / this.w, 1 / this.h);
    this.pass(this.mBright, this.down[0]);
    for (let i = 1; i < this.levels; i++) {
      const s = this.down[i - 1];
      this.mDown.uniforms.tMap.value = s.texture; this.mDown.uniforms.texel.value.set(0.5 / s.width, 0.5 / s.height);
      this.pass(this.mDown, this.down[i]);
    }
    let src = this.down[this.levels - 1];
    for (let i = this.levels - 2; i >= 0; i--) {
      const u = this.mUp.uniforms;
      u.tMap.value = src.texture; u.tAdd.value = this.down[i].texture; u.texel.value.set(0.5 / src.width, 0.5 / src.height);
      this.pass(this.mUp, this.up[i]);
      src = this.up[i];
    }
    const f = this.mFinal.uniforms;
    f.tScene.value = this.sceneRT.texture; f.tBloom.value = src.texture; f.time.value = (time || 0) % 100;
    f.bloom.value = this.grade.bloom / this.levels * 1.6;
    this.pass(this.mFinal, null);
    r.autoClear = ac;
  }

  dispose() {
    if (this.sceneRT) this.sceneRT.dispose();
    for (const t of [...(this.down || []), ...(this.up || [])]) t.dispose();
    this.sceneRT = null; this.down = []; this.up = [];
    this.w = this.h = 0;
  }
}
