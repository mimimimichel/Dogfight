/*
 * Matcha & Ainu — textures « réalistes » fabriquées à la volée (aucun fichier) :
 * chaque texture dessine sa couleur ET son relief (carte de hauteur), d'où l'on
 * tire une carte de normales : briques, pavés, fissures… accrochent la lumière.
 */
import * as THREE from '../vendor/three.module.min.js';

function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

/** Carte de normales à partir d'un canevas de hauteur (gris : clair = haut). */
function normalFromHeight(hc, strength) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const ox = out.getContext('2d'), img = ox.createImageData(w, h), d = img.data;
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ox.putImageData(img, 0, 0);
  return out;
}

/** Fabrique { map, normalMap } : draw(ctxCouleur, ctxHauteur, w, h, rnd). */
export function realTex(w, h, seed, draw, opts) {
  opts = opts || {};
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const hc = document.createElement('canvas'); hc.width = w; hc.height = h;
  const x = c.getContext('2d'), y = hc.getContext('2d');
  y.fillStyle = '#808080'; y.fillRect(0, 0, w, h);
  draw(x, y, w, h, rng(seed));
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(normalFromHeight(hc, opts.strength || 3));
  for (const t of [map, normalMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; }
  return { map, normalMap };
}

const grain = (x, w, h, r, n, a) => { for (let i = 0; i < n; i++) { const v = Math.floor(r() * 255); x.fillStyle = `rgba(${v},${v},${v},${a})`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); } };

// ---------------------------------------------------------------------------
// Façades : une travée de 3 m × 3 m (une fenêtre), en enduit ou en briques
// ---------------------------------------------------------------------------
function windowOn(x, y, w, h, r, brick) {
  const fx = w * 0.25, fy = h * 0.16, fw = w * 0.5, fh = h * 0.6;
  // encadrement en pierre
  x.fillStyle = brick ? '#e2d8c8' : '#f4eee4'; x.fillRect(fx - 10, fy - 10, fw + 20, fh + 16);
  y.fillStyle = '#a0a0a0'; y.fillRect(fx - 10, fy - 10, fw + 20, fh + 16);
  // linteau
  x.fillStyle = brick ? '#d4c8b4' : '#e8e0d2'; x.fillRect(fx - 16, fy - 22, fw + 32, 14);
  y.fillStyle = '#c0c0c0'; y.fillRect(fx - 16, fy - 22, fw + 32, 14);
  // vitre : reflet du ciel en dégradé
  const g = x.createLinearGradient(0, fy, 0, fy + fh);
  g.addColorStop(0, '#9ac0dc'); g.addColorStop(0.45, '#3a5a78'); g.addColorStop(1, '#1e2e40');
  x.fillStyle = g; x.fillRect(fx, fy, fw, fh);
  y.fillStyle = '#404040'; y.fillRect(fx, fy, fw, fh);
  // rideaux (couleur au hasard)
  const cur = ['#f0d8d8', '#e8dcc0', '#d8e0f0', '#f4e8d0', '#e8c8d0'][Math.floor(r() * 5)];
  if (r() < 0.75) {
    x.fillStyle = cur;
    x.beginPath(); x.moveTo(fx + 4, fy + 4); x.lineTo(fx + fw * 0.32, fy + 4); x.quadraticCurveTo(fx + fw * 0.2, fy + fh * 0.5, fx + fw * 0.12, fy + fh - 4); x.lineTo(fx + 4, fy + fh - 4); x.fill();
    x.beginPath(); x.moveTo(fx + fw - 4, fy + 4); x.lineTo(fx + fw * 0.68, fy + 4); x.quadraticCurveTo(fx + fw * 0.8, fy + fh * 0.5, fx + fw * 0.88, fy + fh - 4); x.lineTo(fx + fw - 4, fy + fh - 4); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 5; i++) x.fillRect(fx + 8 + i * 6, fy + 6, 2, fh - 12);
  }
  // reflet
  x.fillStyle = 'rgba(255,255,255,0.22)';
  x.beginPath(); x.moveTo(fx + fw * 0.15, fy + fh); x.lineTo(fx + fw * 0.55, fy); x.lineTo(fx + fw * 0.7, fy); x.lineTo(fx + fw * 0.3, fy + fh); x.fill();
  // croisillons
  x.fillStyle = '#f6f2ea'; x.fillRect(fx + fw / 2 - 3, fy, 6, fh); x.fillRect(fx, fy + fh * 0.42, fw, 5);
  y.fillStyle = '#b0b0b0'; y.fillRect(fx + fw / 2 - 3, fy, 6, fh); y.fillRect(fx, fy + fh * 0.42, fw, 5);
  // appui de fenêtre
  x.fillStyle = '#d8d0c2'; x.fillRect(fx - 18, fy + fh + 4, fw + 36, 10);
  x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(fx - 18, fy + fh + 14, fw + 36, 5);
  y.fillStyle = '#e0e0e0'; y.fillRect(fx - 18, fy + fh + 4, fw + 36, 10);
  // jardinière fleurie (parfois)
  if (r() < 0.4) {
    x.fillStyle = '#6a4a32'; x.fillRect(fx - 4, fy + fh - 8, fw + 8, 14);
    for (let i = 0; i < 26; i++) {
      x.fillStyle = r() < 0.5 ? '#3a7a2a' : ['#e84a6a', '#f0a0c0', '#ffffff', '#f06040'][Math.floor(r() * 4)];
      x.beginPath(); x.arc(fx + r() * fw, fy + fh - 8 - r() * 12, 3 + r() * 3, 0, 7); x.fill();
    }
    y.fillStyle = '#d0d0d0'; y.fillRect(fx - 4, fy + fh - 20, fw + 8, 26);
  }
  // corniche d'étage
  x.fillStyle = brick ? '#cfc4b2' : '#e6ded0'; x.fillRect(0, h - 14, w, 10);
  x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(0, h - 4, w, 4);
  y.fillStyle = '#d0d0d0'; y.fillRect(0, h - 14, w, 10);
}
function bricks(x, y, w, h, r) {
  x.fillStyle = '#8a7a6a'; x.fillRect(0, 0, w, h);          // mortier
  y.fillStyle = '#505050'; y.fillRect(0, 0, w, h);
  const bh = 16, bw = 44;
  for (let row = 0; row * bh < h; row++) for (let i = -1; i * bw < w; i++) {
    const px = i * bw + (row % 2) * (bw / 2), py = row * bh;
    const t = r();
    const cr = 150 + t * 50, cg = 70 + t * 30 + r() * 10, cb = 50 + t * 20;
    x.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`; x.fillRect(px + 2, py + 2, bw - 3, bh - 3);
    if (r() < 0.25) { x.fillStyle = 'rgba(40,20,10,0.25)'; x.fillRect(px + 2, py + 2, bw - 3, bh - 3); }
    const v = 150 + Math.floor(r() * 50);
    y.fillStyle = `rgb(${v},${v},${v})`; y.fillRect(px + 2, py + 2, bw - 3, bh - 3);
  }
  grain(x, w, h, r, 2500, 0.08);
}
function plaster(x, y, w, h, r) {
  x.fillStyle = '#f2ece2'; x.fillRect(0, 0, w, h);
  grain(x, w, h, r, 5000, 0.05);
  for (let i = 0; i < 30; i++) { x.fillStyle = 'rgba(120,100,80,0.05)'; x.beginPath(); x.ellipse(r() * w, r() * h, 20 + r() * 50, 10 + r() * 30, 0, 0, 7); x.fill(); }
  // traînées sous les appuis (patine)
  const g = x.createLinearGradient(0, h * 0.85, 0, h); g.addColorStop(0, 'rgba(90,80,70,0)'); g.addColorStop(1, 'rgba(90,80,70,0.12)');
  x.fillStyle = g; x.fillRect(0, h * 0.85, w, h * 0.15);
  grain(y, w, h, r, 4000, 0.1);
}
export function facadeTex(brick, seed) {
  return realTex(512, 512, seed || (brick ? 31 : 17), (x, y, w, h, r) => {
    if (brick) bricks(x, y, w, h, r); else plaster(x, y, w, h, r);
    windowOn(x, y, w, h, r, brick);
  }, { strength: 4 });
}

/** Rez-de-chaussée : vitrine, porte, soubassement en pierre. */
export function shopFrontTex() {
  return realTex(512, 512, 23, (x, y, w, h, r) => {
    plaster(x, y, w, h, r);
    x.fillStyle = '#b8b0a4'; x.fillRect(0, h - 60, w, 60);  y.fillStyle = '#a0a0a0'; y.fillRect(0, h - 60, w, 60);
    for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(i * 64, h - 60, 2, 60); }
    // vitrine
    const vx = 36, vy = 90, vw = 270, vh = 330;
    x.fillStyle = '#3a2a22'; x.fillRect(vx - 12, vy - 12, vw + 24, vh + 24);
    const g = x.createLinearGradient(0, vy, 0, vy + vh); g.addColorStop(0, '#8ab0c8'); g.addColorStop(0.5, '#2e4458'); g.addColorStop(1, '#3a3020');
    x.fillStyle = g; x.fillRect(vx, vy, vw, vh);
    // étagères éclairées
    x.fillStyle = 'rgba(255,230,170,0.55)'; x.fillRect(vx + 10, vy + vh * 0.55, vw - 20, vh * 0.4);
    for (let i = 0; i < 30; i++) { x.fillStyle = ['#e84a4a', '#f0c040', '#4a8ae0', '#ffffff', '#8ad05a'][i % 5]; x.fillRect(vx + 20 + r() * (vw - 50), vy + vh * 0.58 + Math.floor(r() * 3) * 40, 14, 22); }
    x.fillStyle = 'rgba(255,255,255,0.22)'; x.beginPath(); x.moveTo(vx + 30, vy + vh); x.lineTo(vx + 160, vy); x.lineTo(vx + 210, vy); x.lineTo(vx + 80, vy + vh); x.fill();
    y.fillStyle = '#404040'; y.fillRect(vx, vy, vw, vh);
    // porte en bois
    const dx = 340, dy = 120, dw = 130, dh = 330;
    x.fillStyle = '#5a3422'; x.fillRect(dx, dy, dw, dh); y.fillStyle = '#909090'; y.fillRect(dx, dy, dw, dh);
    x.fillStyle = '#6e4430'; x.fillRect(dx + 14, dy + 16, dw - 28, 120); x.fillRect(dx + 14, dy + 160, dw - 28, 150);
    y.fillStyle = '#b0b0b0'; y.fillRect(dx + 14, dy + 16, dw - 28, 120); y.fillRect(dx + 14, dy + 160, dw - 28, 150);
    x.fillStyle = '#2e4458'; x.fillRect(dx + 24, dy + 26, dw - 48, 100);
    x.fillStyle = '#e0b040'; x.beginPath(); x.arc(dx + dw - 22, dy + 190, 6, 0, 7); x.fill();
    // enseigne
    x.fillStyle = '#2a3a2a'; x.fillRect(20, 30, w - 40, 44); y.fillStyle = '#b0b0b0'; y.fillRect(20, 30, w - 40, 44);
    x.fillStyle = '#e8d8a8'; x.font = '700 30px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(['BOULANGERIE', 'ÉPICERIE', 'FLEURS', 'LIBRAIRIE', 'CAFÉ', 'JOUETS'][Math.floor(r() * 6)], w / 2, 53);
  }, { strength: 4 });
}

/** Pavés de granit gris, mousse dans les joints. */
export function cobbleTex() {
  return realTex(512, 512, 41, (x, y, w, h, r) => {
    x.fillStyle = '#5a5a4a'; x.fillRect(0, 0, w, h);
    y.fillStyle = '#303030'; y.fillRect(0, 0, w, h);
    // mousse dans les joints
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${70 + r() * 40 | 0},${100 + r() * 40 | 0},${40 + r() * 20 | 0},0.5)`; x.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3); }
    const rows = 14, rh = h / rows;
    for (let j = 0; j < rows; j++) {
      let px = -r() * 20;
      while (px < w) {
        const cw = rh * (0.9 + r() * 0.6);
        const v = 120 + r() * 70, warm = r() * 14;
        x.fillStyle = `rgb(${v + warm | 0},${v + warm * 0.6 | 0},${v - 4 | 0})`;
        x.beginPath(); x.roundRect(px + 2, j * rh + 2, cw - 4, rh - 4, 6); x.fill();
        // facettes et usure
        x.fillStyle = 'rgba(255,255,255,0.08)'; x.beginPath(); x.roundRect(px + 4, j * rh + 4, cw * 0.6, rh * 0.4, 5); x.fill();
        x.fillStyle = 'rgba(0,0,0,0.1)'; x.fillRect(px + 2, j * rh + rh - 8, cw - 4, 5);
        const hv = 170 + r() * 60 | 0;
        const gr = y.createRadialGradient(px + cw / 2, j * rh + rh / 2, 2, px + cw / 2, j * rh + rh / 2, cw * 0.6);
        gr.addColorStop(0, `rgb(${hv},${hv},${hv})`); gr.addColorStop(1, 'rgb(110,110,110)');
        y.fillStyle = gr; y.beginPath(); y.roundRect(px + 2, j * rh + 2, cw - 4, rh - 4, 6); y.fill();
        px += cw;
      }
    }
    grain(x, w, h, r, 4000, 0.07);
  }, { strength: 5 });
}

/** Asphalte : grain, fissures, rapiéçages. */
export function asphaltTex(withLines) {
  return realTex(512, 512, 53, (x, y, w, h, r) => {
    x.fillStyle = '#4a4c52'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 16000; i++) { const v = 50 + r() * 50 | 0; x.fillStyle = `rgba(${v},${v},${v + 4},0.6)`; x.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    grain(y, w, h, r, 9000, 0.25);
    // rapiéçages plus sombres
    for (let i = 0; i < 3; i++) { x.fillStyle = 'rgba(20,20,24,0.25)'; x.fillRect(r() * w, r() * h, 60 + r() * 120, 40 + r() * 80); }
    // fissures
    x.strokeStyle = 'rgba(15,15,18,0.75)'; y.strokeStyle = '#303030';
    for (let i = 0; i < 9; i++) {
      let px = r() * w, py = r() * h;
      x.lineWidth = y.lineWidth = 1 + r() * 1.5;
      x.beginPath(); y.beginPath(); x.moveTo(px, py); y.moveTo(px, py);
      for (let k = 0; k < 12; k++) { px += (r() - 0.5) * 40; py += (r() - 0.3) * 30; x.lineTo(px, py); y.lineTo(px, py); }
      x.stroke(); y.stroke();
    }
    if (withLines) {
      // bords blancs et ligne jaune (route : 1 travée = la largeur)
      x.fillStyle = 'rgba(236,236,226,0.92)'; x.fillRect(14, 0, 12, h); x.fillRect(w - 26, 0, 12, h);
      x.fillStyle = 'rgba(240,206,70,0.95)'; x.fillRect(w / 2 - 8, 0, 16, h * 0.55);
      grain(x, w, h, r, 3000, 0.12);
    }
  }, { strength: 2 });
}

/** Trottoir : dalles de béton tachées. */
export function slabTex(base) {
  return realTex(512, 512, 61, (x, y, w, h, r) => {
    x.fillStyle = base || '#c8c4bc'; x.fillRect(0, 0, w, h);
    y.fillStyle = '#909090'; y.fillRect(0, 0, w, h);
    const n = 4, s = w / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = (r() - 0.5) * 24;
      x.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 120})`;
      x.fillRect(i * s + 2, j * s + 2, s - 4, s - 4);
      x.strokeStyle = 'rgba(60,56,50,0.55)'; x.lineWidth = 3; x.strokeRect(i * s, j * s, s, s);
      y.strokeStyle = '#404040'; y.lineWidth = 4; y.strokeRect(i * s, j * s, s, s);
    }
    grain(x, w, h, r, 9000, 0.06);
    for (let i = 0; i < 14; i++) { x.fillStyle = 'rgba(70,60,50,0.07)'; x.beginPath(); x.ellipse(r() * w, r() * h, 8 + r() * 30, 6 + r() * 20, 0, 0, 7); x.fill(); }
    grain(y, w, h, r, 6000, 0.12);
  }, { strength: 2.5 });
}

/** Pierre claire (fontaine, ruines, socles). */
export function stoneTex() {
  return realTex(256, 256, 71, (x, y, w, h, r) => {
    x.fillStyle = '#c8c0b4'; x.fillRect(0, 0, w, h);
    grain(x, w, h, r, 6000, 0.1);
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '90,100,70' : '255,255,255'},0.06)`; x.beginPath(); x.ellipse(r() * w, r() * h, 10 + r() * 30, 6 + r() * 20, 0, 0, 7); x.fill(); }
    grain(y, w, h, r, 6000, 0.3);
  }, { strength: 3 });
}

/** Relief tiré d'une texture déjà dessinée (clair = haut) : pierres, pavés, écorce, herbe. */
export function normalFor(tex, strength) {
  const img = tex.image;
  if (!img || !img.getContext) return null;
  const n = new THREE.CanvasTexture(normalFromHeight(img, strength || 3));
  n.wrapS = tex.wrapS; n.wrapT = tex.wrapT; n.repeat.copy(tex.repeat); n.anisotropy = tex.anisotropy || 4;
  return n;
}

/** Roche en strates (dessous des îles volantes). */
export function rockTex() {
  return realTex(512, 512, 83, (x, y, w, h, r) => {
    x.fillStyle = '#b09880'; x.fillRect(0, 0, w, h);
    let py = 0;
    while (py < h) {
      const bh = 18 + r() * 40, v = r();
      x.fillStyle = `rgb(${150 + v * 60 | 0},${125 + v * 50 | 0},${105 + v * 40 | 0})`;
      x.fillRect(0, py, w, bh);
      y.fillStyle = `rgb(${110 + v * 90 | 0},${110 + v * 90 | 0},${110 + v * 90 | 0})`; y.fillRect(0, py, w, bh);
      x.fillStyle = 'rgba(40,30,25,0.35)'; x.fillRect(0, py + bh - 3, w, 3);
      y.fillStyle = '#404040'; y.fillRect(0, py + bh - 3, w, 3);
      py += bh;
    }
    for (let i = 0; i < 60; i++) {
      const px = r() * w, len = 20 + r() * 60;
      x.strokeStyle = 'rgba(40,30,25,0.4)'; y.strokeStyle = '#303030'; x.lineWidth = y.lineWidth = 2;
      x.beginPath(); y.beginPath(); x.moveTo(px, r() * h); y.moveTo(px, r() * h);
      x.lineTo(px + (r() - 0.5) * 10, r() * h + len); y.lineTo(px + (r() - 0.5) * 10, r() * h + len); x.stroke(); y.stroke();
    }
    grain(x, w, h, r, 8000, 0.08); grain(y, w, h, r, 8000, 0.2);
  }, { strength: 4 });
}
