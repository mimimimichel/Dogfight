/*
 * Dogfight Aventure — rendu « cel shading » : aplats de lumière en quelques
 * tons nets (matériaux toon) et contours sombres (coque inversée).
 */
import * as THREE from '../vendor/three.module.min.js';

/** Dégradé à 3 tons : ombre, demi-teinte, lumière. */
let grad = null;
export function gradientMap() {
  if (grad) return grad;
  grad = new THREE.DataTexture(new Uint8Array([128, 200, 255]), 3, 1, THREE.RedFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter;
  grad.generateMipmaps = false;
  grad.needsUpdate = true;
  return grad;
}

/** Remplace les matériaux éclairés (standard, lambert) par des matériaux toon. */
export function toonify(root) {
  const cache = new Map();
  root.traverse(o => {
    if (!(o.isMesh || o.isInstancedMesh)) return;
    const m = o.material;
    if (!m || !(m.isMeshStandardMaterial || m.isMeshLambertMaterial)) return;
    if (!cache.has(m)) {
      const metal = m.metalness > 0.5;
      const t = new THREE.MeshToonMaterial({
        color: m.color, map: m.map, vertexColors: m.vertexColors, gradientMap: gradientMap(),
        emissive: metal ? new THREE.Color(m.color).multiplyScalar(0.25).add(m.emissive || new THREE.Color(0)) : m.emissive,
        emissiveIntensity: metal ? 1 : m.emissiveIntensity,
        side: m.side, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, fog: m.fog,
        polygonOffset: m.polygonOffset, polygonOffsetFactor: m.polygonOffsetFactor, polygonOffsetUnits: m.polygonOffsetUnits,
        depthWrite: m.depthWrite,
      });
      if (Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile')) { t.onBeforeCompile = m.onBeforeCompile; t.customProgramCacheKey = m.customProgramCacheKey; }
      t.userData = m.userData;
      cache.set(m, t);
    }
    o.material = cache.get(m);
  });
}

// ---------------------------------------------------------------------------
// Contours : la même forme, gonflée le long de normales lissées, vue de dos
// ---------------------------------------------------------------------------
const outlineMats = new Map();
function outlineMaterial(thick, color) {
  const key = thick + ':' + color;
  if (outlineMats.has(key)) return outlineMats.get(key);
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute vec3 oNormal;\n' + sh.vertexShader.replace('#include <begin_vertex>', `vec3 transformed = position + oNormal * ${thick.toFixed(4)};`);
  };
  m.customProgramCacheKey = () => 'outline' + key;
  outlineMats.set(key, m);
  return m;
}

/** Normales lissées (moyenne des sommets confondus) pour un contour sans trous. */
function smoothNormals(geo) {
  if (geo.attributes.oNormal) return;
  const p = geo.attributes.position, n = geo.attributes.normal;
  const acc = new Map(), keys = new Array(p.count);
  for (let i = 0; i < p.count; i++) {
    const k = Math.round(p.getX(i) * 1000) + ',' + Math.round(p.getY(i) * 1000) + ',' + Math.round(p.getZ(i) * 1000);
    keys[i] = k;
    const a = acc.get(k) || [0, 0, 0];
    a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i);
    acc.set(k, a);
  }
  const out = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const a = acc.get(keys[i]), l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l; out[i * 3 + 1] = a[1] / l; out[i * 3 + 2] = a[2] / l;
  }
  geo.setAttribute('oNormal', new THREE.BufferAttribute(out, 3));
}

/** Ajoute un contour à un maillage (enfant du maillage : suit ses animations). */
export function addOutline(mesh, thick, color) {
  if (mesh.userData.outlined || !mesh.geometry || !mesh.geometry.attributes.normal) return;
  mesh.userData.outlined = true;
  smoothNormals(mesh.geometry);
  const fur = mesh.userData.fur;
  if (mesh.userData.outlineThick) thick = mesh.userData.outlineThick;
  const mat = outlineMaterial(fur ? fur.length * 0.75 + thick : thick, color || 0x2a1810);
  let o;
  if (mesh.isInstancedMesh && !fur) {
    o = new THREE.InstancedMesh(mesh.geometry, mat, mesh.count);
    o.instanceMatrix = mesh.instanceMatrix;
  } else {
    o = new THREE.Mesh(mesh.geometry, mat);
  }
  o.userData.outlined = true;
  o.userData.isOutline = true;
  o.castShadow = false; o.receiveShadow = false;
  o.renderOrder = mesh.renderOrder;
  mesh.add(o);
}

/** Contourne tout ce qui s'y prête dans un groupe. */
export function outlineTree(root, thick, color, test) {
  const list = [];
  root.traverse(o => {
    if (!(o.isMesh) || o.userData.isOutline || o.userData.noOutline || o.isSprite) return;
    const m = o.material;
    if (!m || m.transparent || m.alphaTest > 0 || !(m.isMeshToonMaterial || m.isMeshStandardMaterial || m.isMeshLambertMaterial)) return;
    if (m.userData && m.userData.gloss) return;
    if (test && !test(o)) return;
    list.push(o);
  });
  for (const o of list) addOutline(o, thick, color);
}
