/*
 * Matcha & Ainu — le vrai calendrier dans le jeu : la saison du moment (flocons en
 * hiver, feuilles en automne, pétales au printemps), des lucioles le soir, et les fêtes
 * (citrouille d'Halloween, bonnet de Noël pour Mamie). Tout se décide sur l'appareil,
 * avec sa date et son heure. Pour essayer : ?saison=hiver|automne|printemps|ete&heure=20
 */
import * as THREE from '../vendor/three.module.min.js';
import * as M from './models.js';

/** Saison et moment de la journée d'après la date (ou l'adresse, pour tester). */
export function moment(now) {
  const d = now || new Date(), q = new URLSearchParams(location.search);
  const m = d.getMonth() + 1, day = d.getDate();
  let season = m === 12 || m <= 2 ? 'hiver' : m <= 5 ? 'printemps' : m <= 8 ? 'ete' : 'automne';
  if (q.get('saison')) season = q.get('saison');
  const h = q.get('heure') !== null ? +q.get('heure') : d.getHours();
  const fete = (m === 10 && day >= 20) || (m === 11 && day <= 2) ? 'halloween' : (m === 12 && day >= 10) || (m === 1 && day <= 6) ? 'noel' : null;
  return { season, evening: h >= 18 && h < 23, night: h >= 21 || h < 7, fete: q.get('fete') || fete };
}

export function buildSeasons(game, opts) {
  const mo = moment();
  const scene = game.scene, lite = !!(opts && opts.lite);
  const parts = [];

  // --- ce qui tombe du ciel, dans une boîte qui suit la caméra -------------------------
  const kind = mo.season === 'hiver' ? 'snow' : mo.season === 'automne' ? 'leaves' : mo.season === 'printemps' ? 'petals' : null;
  let fall = null;
  if (kind && !(opts && opts.noFall)) {
    const N = lite ? (kind === 'snow' ? 260 : 70) : (kind === 'snow' ? 600 : 160), R = 26, H = 18;
    const pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 2 * R; pos[i * 3 + 1] = Math.random() * H; pos[i * 3 + 2] = (Math.random() - 0.5) * 2 * R; seed[i] = Math.random() * 100; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
    if (kind === 'snow') { const gr = x.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); }
    else { x.fillStyle = kind === 'leaves' ? '#d8742a' : '#ffb3cf'; x.beginPath(); x.ellipse(32, 32, 26, kind === 'leaves' ? 14 : 18, 0.6, 0, Math.PI * 2); x.fill(); if (kind === 'leaves') { x.strokeStyle = '#8a3a10'; x.lineWidth = 3; x.beginPath(); x.moveTo(10, 46); x.lineTo(54, 18); x.stroke(); } }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.PointsMaterial({ map: tex, size: kind === 'snow' ? 0.3 : 0.55, transparent: true, depthWrite: false, alphaTest: 0.02, sizeAttenuation: true, color: kind === 'leaves' ? 0xffffff : 0xffffff });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.userData.noOutline = true;
    scene.add(pts);
    fall = { pts, pos, seed, N, R, H, speed: kind === 'snow' ? 1.3 : 1.0 };
    parts.push(pts);
  }

  // --- lucioles du soir ----------------------------------------------------------------
  let flies = null;
  if (mo.evening && !(opts && opts.noFlies)) {
    const N = lite ? 24 : 50, pos = new Float32Array(N * 3), home = new Float32Array(N * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,190,1)'); gr.addColorStop(0.3, 'rgba(220,255,120,0.6)'); gr.addColorStop(1, 'rgba(180,255,80,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(cv);
    const mat = new THREE.PointsMaterial({ map: tex, size: 0.45, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.userData.noOutline = true;
    scene.add(pts);
    for (let i = 0; i < N; i++) { home[i * 3] = (Math.random() - 0.5) * 30; home[i * 3 + 1] = 0.6 + Math.random() * 2.2; home[i * 3 + 2] = (Math.random() - 0.5) * 30; }
    flies = { pts, pos, home, N, cx: 0, cz: 0, anchored: false };
    parts.push(pts);
  }

  // --- fêtes : citrouille près de Mamie, bonnet de Noël ---------------------------------
  const L = opts && opts.L, mamie = game.mamie;
  if (mo.fete === 'halloween' && L && L.npcs && L.npcs.mamie) {
    const p = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 18, 12), M.mat(0xff8a1a, { roughness: 0.6 })); body.scale.set(1.15, 0.85, 1.15); p.add(body);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.25, 8), M.mat(0x4a6a20)); stem.position.y = 0.48; p.add(stem);
    const glow = new THREE.PointLight(0xffa040, 1.2, 4); glow.position.y = 0.1; p.add(glow);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.18, 3), new THREE.MeshBasicMaterial({ color: 0xffe080 })); face.position.set(0, 0.05, 0.56); p.add(face);
    p.position.set(L.npcs.mamie.x - 1.7, L.npcs.mamie.y + 0.4, L.npcs.mamie.z + 0.9);
    p.traverse(o => { if (o.isMesh) o.castShadow = true; });
    scene.add(p); parts.push(p);
  }
  if (mo.fete === 'noel' && mamie && mamie.userData && mamie.userData.rig && mamie.userData.rig.head) {
    const hat = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.55, 18), M.mat(0xd8202a, { roughness: 0.7 })); cone.position.y = 0.3; cone.rotation.z = -0.25; hat.add(cone);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.07, 8, 20), M.mat(0xffffff, { roughness: 0.9 })); rim.rotation.x = Math.PI / 2; rim.position.y = 0.04; hat.add(rim);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), M.mat(0xffffff)); pom.position.set(0.14, 0.56, 0); hat.add(pom);
    hat.position.set(0, 0.32, 0.02);
    mamie.userData.rig.head.add(hat);
    parts.push(hat);
  }

  const v = new THREE.Vector3();
  return {
    moment: mo,
    step(dt, t) {
      const cam = game.camera;
      if (fall) {
        const { pos, seed, N, R, H, speed } = fall, cx = cam.position.x, cz = cam.position.z, cy = cam.position.y;
        for (let i = 0; i < N; i++) {
          const k = i * 3, s = seed[i];
          pos[k + 1] -= dt * speed * (0.7 + (s % 1) * 0.6);
          pos[k] += Math.sin(t * 0.9 + s) * dt * (kind === 'snow' ? 0.4 : 1.1);
          pos[k + 2] += Math.cos(t * 0.7 + s * 1.3) * dt * (kind === 'snow' ? 0.3 : 0.9);
          // la boîte suit la caméra : on recycle ce qui sort
          let dx = pos[k] - cx, dz = pos[k + 2] - cz;
          if (dx > R) pos[k] -= 2 * R; else if (dx < -R) pos[k] += 2 * R;
          if (dz > R) pos[k + 2] -= 2 * R; else if (dz < -R) pos[k + 2] += 2 * R;
          if (pos[k + 1] < cy - 8) pos[k + 1] += H;
          else if (pos[k + 1] > cy + H) pos[k + 1] -= H;
        }
        fall.pts.geometry.attributes.position.needsUpdate = true;
      }
      if (flies) {
        const me = game.me;
        if (me) {
          // l'essaim suit doucement le duo (et se reforme s'il est loin)
          if (!flies.anchored || Math.hypot(me.pos.x - flies.cx, me.pos.z - flies.cz) > 20) { flies.cx = me.pos.x; flies.cz = me.pos.z; flies.cy = me.pos.y; flies.anchored = true; }
          flies.cx += (me.pos.x - flies.cx) * dt * 0.2; flies.cz += (me.pos.z - flies.cz) * dt * 0.2; flies.cy += (me.pos.y - flies.cy) * dt * 0.5;
        }
        const { pos, home, N } = flies;
        for (let i = 0; i < N; i++) {
          const k = i * 3;
          pos[k] = flies.cx + home[k] + Math.sin(t * 0.5 + i) * 1.2;
          pos[k + 1] = (flies.cy || 0) + home[k + 1] + Math.sin(t * 1.3 + i * 2.1) * 0.35;
          pos[k + 2] = flies.cz + home[k + 2] + Math.cos(t * 0.4 + i * 1.7) * 1.2;
        }
        flies.pts.geometry.attributes.position.needsUpdate = true;
        flies.pts.material.opacity = 0.65 + Math.sin(t * 3) * 0.2;
      }
      v.set(0, 0, 0);
    },
    dispose() { for (const p of parts) { if (p.parent) p.parent.remove(p); } },
  };
}
