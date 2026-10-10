/*
 * Dogfight — rendu pixel art.
 *
 * Tout est dessiné en résolution native 480×270 (agrandie sans lissage).
 * Les chiens passent par un rasteriseur maison sans anticrénelage qui produit
 * une carte « matière + calque », puis par un ombrage automatique façon pixel
 * artist : rampes de couleurs limitées, lumière en haut à gauche, tramage,
 * contours colorés (sel-out) et lignes de séparation entre les membres.
 */
(function () {
  'use strict';
  const C = window.DogGame;
  const { STAGE_W, GROUND_Y, CHARACTERS } = C;
  const TAU = Math.PI * 2;

  const PS = 0.5;                       // monde → pixels
  const W = Math.round(STAGE_W * PS);   // 480
  const H = 270;
  const GY = Math.round(GROUND_Y * PS); // ligne du sol (235)
  const px = (x) => Math.round(x * PS);
  const py = (y) => Math.round((GROUND_Y - y) * PS);

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
  const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

  function hex2u32(h) {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return (255 << 24 | (n & 255) << 16 | ((n >> 8) & 255) << 8 | (n >> 16)) >>> 0;
  }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // ---------------------------------------------------------------------------
  // Rasteriseur sans anticrénelage (API proche de Canvas 2D)
  // ---------------------------------------------------------------------------
  class PixRaster {
    constructor(w, h, resolve) {
      this.w = w; this.h = h;
      this.idx = new Uint8Array(w * h);
      this.grp = new Uint8Array(w * h);
      this.resolve = resolve;
      this.reset();
    }
    reset() {
      this.idx.fill(0); this.grp.fill(0);
      this.m = [1, 0, 0, 1, 0, 0];
      this.st = [];
      this.fi = 1; this.si = 1;
      this.group = 1;
      this.lineWidth = 1;
      this.stamps = [];
      this.paths = []; this.cur = null; this.last = [0, 0];
    }
    set fillStyle(v) { this.fi = this.resolve(v); }
    set strokeStyle(v) { this.si = this.resolve(v); }
    save() { this.st.push(this.m.slice()); }
    restore() { if (this.st.length) this.m = this.st.pop(); }
    translate(x, y) { const m = this.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; }
    rotate(a) {
      const m = this.m, c = Math.cos(a), s = Math.sin(a);
      const a0 = m[0], b0 = m[1], c0 = m[2], d0 = m[3];
      m[0] = a0 * c + c0 * s; m[1] = b0 * c + d0 * s;
      m[2] = -a0 * s + c0 * c; m[3] = -b0 * s + d0 * c;
    }
    scale(x, y) { const m = this.m; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; }
    T(x, y) { const m = this.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
    sf() { const m = this.m; return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])); }
    flipped() { const m = this.m; return (m[0] * m[3] - m[1] * m[2]) < 0; }

    beginPath() { this.paths = []; this.cur = null; }
    moveTo(x, y) { this.cur = [this.T(x, y)]; this.paths.push(this.cur); this.last = [x, y]; }
    lineTo(x, y) {
      if (!this.cur) { this.moveTo(x, y); return; }
      this.cur.push(this.T(x, y)); this.last = [x, y];
    }
    closePath() { if (this.cur) this.cur.closed = true; }
    quadraticCurveTo(cx, cy, x, y) {
      const [x0, y0] = this.last, n = 10;
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        this.lineTo(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y);
      }
    }
    bezierCurveTo(c1x, c1y, c2x, c2y, x, y) {
      const [x0, y0] = this.last, n = 14;
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        this.lineTo(
          u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x,
          u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y);
      }
    }
    arc(x, y, r, a0, a1, ccw) { this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
    ellipse(x, y, rx, ry, rot, a0, a1, ccw) {
      let span = a1 - a0;
      if (ccw) { if (span > 0) span -= TAU * Math.ceil(span / TAU); }
      else if (span < 0) span += TAU * Math.ceil(-span / TAU);
      if (Math.abs(span) > TAU) span = Math.sign(span) * TAU;
      const rp = Math.max(rx, ry) * this.sf();
      const n = Math.max(6, Math.min(72, Math.ceil(rp * 2.6 * Math.abs(span) / TAU + 4)));
      const cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
      for (let i = 0; i <= n; i++) {
        const a = a0 + span * i / n;
        const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
        const qx = x + ex * cr - ey * sr, qy = y + ex * sr + ey * cr;
        if (i === 0 && !this.cur) this.moveTo(qx, qy);
        else this.lineTo(qx, qy);
      }
    }
    rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
    fillRect(x, y, w, h) { const p = this.paths, c = this.cur; this.beginPath(); this.rect(x, y, w, h); this.fill(); this.paths = p; this.cur = c; }

    plot(x, y, v) {
      if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
      const i = y * this.w + x;
      this.idx[i] = v; this.grp[i] = this.group;
    }

    fill() {
      const polys = this.paths.filter(p => p.length >= 3);
      if (!polys.length) return;
      let minY = Infinity, maxY = -Infinity;
      for (const p of polys) for (const q of p) { if (q[1] < minY) minY = q[1]; if (q[1] > maxY) maxY = q[1]; }
      const y0 = Math.max(0, Math.floor(minY)), y1 = Math.min(this.h - 1, Math.ceil(maxY));
      const xs = [];
      for (let y = y0; y <= y1; y++) {
        const yc = y + 0.5;
        xs.length = 0;
        for (const p of polys) {
          for (let i = 0; i < p.length; i++) {
            const a = p[i], b = p[(i + 1) % p.length];
            if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
              xs.push(a[0] + (yc - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
            }
          }
        }
        xs.sort((a, b) => a - b);
        for (let k = 0; k + 1 < xs.length; k += 2) {
          const xa = Math.max(0, Math.ceil(xs[k] - 0.5)), xb = Math.min(this.w - 1, Math.floor(xs[k + 1] - 0.5));
          for (let x = xa; x <= xb; x++) this.plot(x, y, this.fi);
        }
      }
    }

    stroke() {
      const r = Math.max(0.5, this.lineWidth * 0.5 * this.sf());
      for (const p of this.paths) {
        const n = p.closed ? p.length : p.length - 1;
        for (let i = 0; i < n; i++) this.capsule(p[i], p[(i + 1) % p.length], r);
        if (p.length === 1) this.capsule(p[0], p[0], r);
      }
    }

    capsule(a, b, r) {
      const minX = Math.max(0, Math.floor(Math.min(a[0], b[0]) - r)), maxX = Math.min(this.w - 1, Math.ceil(Math.max(a[0], b[0]) + r));
      const minY = Math.max(0, Math.floor(Math.min(a[1], b[1]) - r)), maxY = Math.min(this.h - 1, Math.ceil(Math.max(a[1], b[1]) + r));
      const dx = b[0] - a[0], dy = b[1] - a[1], ll = dx * dx + dy * dy || 1e-9;
      const r2 = r * r;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const cx = x + 0.5, cy = y + 0.5;
          let t = ((cx - a[0]) * dx + (cy - a[1]) * dy) / ll;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = cx - (a[0] + t * dx), ey = cy - (a[1] + t * dy);
          if (ex * ex + ey * ey <= r2) this.plot(x, y, this.si);
        }
      }
    }

    stamp(type, x, y, extra) {
      const p = this.T(x, y);
      this.stamps.push({ type, x: Math.floor(p[0]), y: Math.floor(p[1]), flip: this.flipped(), extra });
    }
  }

  // ---------------------------------------------------------------------------
  // Ombrage automatique + contours → pixels 32 bits
  // ---------------------------------------------------------------------------
  function compose(r, ramps, out32, opts) {
    opts = opts || {};
    const { w, h, idx, grp } = r;
    const n = w * h;
    // Tampons réutilisés d'une image à l'autre (pas d'allocation par image)
    if (!r._d || r._d.n !== n) r._d = { n, dt: new Int16Array(n), db: new Int16Array(n), dl: new Int16Array(n), dr: new Int16Array(n) };
    const { dt, db, dl, dr } = r._d;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!idx[i]) continue;
      dt[i] = (y > 0 && idx[i - w] && grp[i - w] === grp[i]) ? dt[i - w] + 1 : 0;
      dl[i] = (x > 0 && idx[i - 1] && grp[i - 1] === grp[i]) ? dl[i - 1] + 1 : 0;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; if (!idx[i]) continue;
      db[i] = (y < h - 1 && idx[i + w] && grp[i + w] === grp[i]) ? db[i + w] + 1 : 0;
      dr[i] = (x < w - 1 && idx[i + 1] && grp[i + 1] === grp[i]) ? dr[i + 1] + 1 : 0;
    }
    const outline = opts.outline;
    const fromBelow = !!opts.lightFromBelow;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const m = idx[i];
        if (!m) {
          if (opts.noOutline) { out32[i] = 0; continue; }
          let nm = 0, below = false;
          if (y < h - 1 && idx[i + w]) { nm = idx[i + w]; below = true; }
          else if (y > 0 && idx[i - w]) nm = idx[i - w];
          else if (x > 0 && idx[i - 1]) nm = idx[i - 1];
          else if (x < w - 1 && idx[i + 1]) nm = idx[i + 1];
          out32[i] = nm ? (outline || ramps[nm][below && !fromBelow ? 1 : 0]) : 0;
          continue;
        }
        const ramp = ramps[m];
        let top = dt[i], bot = db[i];
        if (fromBelow) { const t = top; top = bot; bot = t; }
        const tH = dt[i] + db[i] + 1, tW = dl[i] + dr[i] + 1;
        let tone = 2;
        // Volume : bas du calque dans l'ombre (bande tramée), haut éclairé
        const band = Math.max(1, Math.round(tH * 0.3));
        if (bot < band) tone = 1;
        else if (bot === band && ((x + y) & 1)) tone = 1;
        if (top === 0) tone = 3;
        else if (tH > 10 && top === 1 && ((x + y) & 1) === 0) tone = 3;
        // Membres fins verticaux : lumière à gauche
        if (tW <= 7 && tH > tW * 1.4) {
          tone = dl[i] === 0 ? 3 : dr[i] === 0 ? 1 : (dr[i] === 1 && ((x + y) & 1)) ? 1 : 2;
          if (top === 0) tone = 3;
        }
        // Reflet sur les grandes masses
        if (tH > 14 && tW > 14 && top >= 2 && top <= 3 && dl[i] >= 2 && dl[i] < tW * 0.45) tone = 3;
        if (tH > 16 && tW > 16 && top === 2 && dl[i] >= 3 && dl[i] < tW * 0.3 && ((x + y) & 1) === 0) tone = 4;
        // Séparation entre calques : ligne sombre sur le calque arrière
        const g = grp[i];
        let sep = 0;
        const chk = (j) => { if (idx[j] && grp[j] !== g) { if (grp[j] > g) sep = -1; else if (sep === 0) sep = 1; } };
        if (y > 0) chk(i - w);
        if (y < h - 1) chk(i + w);
        if (x > 0) chk(i - 1);
        if (x < w - 1) chk(i + 1);
        if (sep === -1) tone = 0;
        else if (sep === 1 && tone < 3 && opts.rim) tone = 3;
        out32[i] = ramp[tone];
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Palettes (rampes de 5 tons : contour, ombre, base, lumière, reflet)
  // ---------------------------------------------------------------------------
  const COMMON_RAMPS = {
    mouth: ['#1a0406', '#33080c', '#5a0f14', '#7a1a20', '#9a2a2e'],
    white: ['#5a5068', '#b8b0c8', '#f4f0ff', '#ffffff', '#ffffff'],
    tongue: ['#4a0c1a', '#a8324a', '#f06a80', '#ff98a8', '#ffc8d0'],
    gold: ['#4a2a00', '#a07010', '#f2c230', '#ffe070', '#fff6c0'],
    nose: ['#0a0606', '#140c0c', '#22171a', '#3e2e30', '#6e5a5c'],
  };

  const DOG_RAMPS = {
    ainu: {
      main: ['#42180a', '#8c3510', '#c4561c', '#e47e34', '#f6a85a'],
      shade: ['#2e1006', '#5e230c', '#843414', '#a24a20', '#b8602c'],
      light: ['#5e3c22', '#bf9466', '#ecd0a2', '#faeacb', '#fffaf0'],
      inner: ['#4a2018', '#a8584e', '#e48e78', '#f6b29c', '#ffd2c2'],
      accent: ['#0e1636', '#1c3584', '#2d66d0', '#5a96ff', '#a6c8ff'],
      accent2: ['#8090b0', '#d0d8f0', '#ffffff', '#ffffff', '#ffffff'],
    },
    ainuAlt: {
      main: ['#4a3016', '#a8824e', '#dcbc88', '#f2dcb0', '#fff4dc'],
      shade: ['#3a2410', '#7c5c34', '#a8865a', '#c4a272', '#d4b688'],
      light: ['#6a5040', '#d0bca0', '#faf2e2', '#ffffff', '#ffffff'],
      inner: ['#4a2018', '#a8584e', '#e8a08a', '#f6baa4', '#ffd8c8'],
      accent: ['#3a0808', '#8a1818', '#d03434', '#f26464', '#ffa8a8'],
      accent2: ['#a08080', '#f0d8d8', '#ffffff', '#ffffff', '#ffffff'],
    },
    matcha: {
      main: ['#030203', '#0d0a0f', '#1c1720', '#3a3346', '#625a72'],
      shade: ['#020102', '#060408', '#100c12', '#1c1822', '#28222e'],
      light: ['#2e1204', '#6e300e', '#b25e24', '#d68840', '#f0b06a'],
      inner: ['#3a1414', '#8a3e3e', '#cc6c6c', '#e89090', '#f8b8b8'],
      accent: ['#14280a', '#365e16', '#64982e', '#94c84a', '#ccf08a'],
      accent2: ['#14280a', '#365e16', '#64982e', '#94c84a', '#ccf08a'],
    },
    matchaAlt: {
      main: ['#1c0e06', '#3e200e', '#62361a', '#80502c', '#a06c44'],
      shade: ['#140904', '#2a1608', '#42240e', '#583418', '#6c4424'],
      light: ['#3a2008', '#80501e', '#c88e48', '#e4b26a', '#f6d496'],
      inner: ['#3a1414', '#8a3e3e', '#cc6c6c', '#e89090', '#f8b8b8'],
      accent: ['#3a2a00', '#8a6a08', '#e2b420', '#f8d860', '#fff0a8'],
      accent2: ['#3a2a00', '#8a6a08', '#e2b420', '#f8d860', '#fff0a8'],
    },
  };

  const EYE_COL = { ainu: '#1c0c06', matcha: '#000000' };

  const MATS = ['none', 'main', 'shade', 'light', 'belly', 'muzzle', 'legLow', 'nose', 'inner', 'accent', 'accent2', 'mouth', 'white', 'tongue', 'gold'];
  const MAT_ID = Object.fromEntries(MATS.map((m, i) => [m, i]));
  const ALIAS = { belly: 'light', muzzle: 'light', legLow: 'light' };
  const resolveDogMat = (v) => MAT_ID[v] || 1;

  const rampCache = {};
  function dogRamps(charId, alt) {
    const key = charId + (alt ? 'Alt' : '');
    if (rampCache[key]) return rampCache[key];
    const R = DOG_RAMPS[key];
    const table = MATS.map((m) => {
      if (m === 'none') return null;
      const src = R[ALIAS[m] || m] || COMMON_RAMPS[m] || R.main;
      return src.map(hex2u32);
    });
    // Matcha est noir : truffe avec un reflet un peu plus marqué
    if (charId === 'matcha') table[MAT_ID.nose] = ['#000000', '#060404', '#0a0707', '#2a2224', '#5a4c50'].map(hex2u32);
    rampCache[key] = table;
    return table;
  }

  // Les « couleurs » du dessin sont des noms de matières
  const P = { main: 'main', shade: 'shade', light: 'light', belly: 'belly', muzzle: 'muzzle', nose: 'nose', inner: 'inner', legLow: 'legLow', accent: 'accent', accent2: 'accent2' };

  const BUILD = {
    ainu: { bodyW: 102, bodyH: 54, legLen: 28, legW: 16, headR: 29, muzzleL: 19, muzzleH: 17, earH: 18, earW: 19, round: true, fluffy: true, tail: 'curl', neck: 0 },
    matcha: { bodyW: 86, bodyH: 36, legLen: 46, legW: 11, headR: 20, muzzleL: 25, muzzleH: 12, earH: 31, earW: 13, round: false, fluffy: false, tail: 'thin', neck: 1 },
  };

  // ---------------------------------------------------------------------------
  // Poses
  // ---------------------------------------------------------------------------
  function moveProgress(f, mv) {
    const s = mv.startup, a = mv.active, r = mv.recovery;
    if (f.frame < s) return { ext: Math.min(1, (f.frame + 1) / s), phase: 'startup', t: f.frame / (s + a + r) };
    if (f.frame < s + a) return { ext: 1, phase: 'active', t: f.frame / (s + a + r) };
    return { ext: Math.max(0, 1 - (f.frame - s - a) / r), phase: 'recovery', t: f.frame / (s + a + r) };
  }

  function basePose() {
    return {
      crouch: 0, tilt: 0, lift: 0, headX: 0, headY: 0, headTilt: 0, mouth: 0,
      legs: [0, 0, 0, 0], legK: 1, rot: 0, lieK: 0, spinX: 1, stretch: 1, tailWag: 0.2, tailSpeed: 0.2,
      eyes: 'normal', earsBack: 0, shield: false, tongue: false,
    };
  }

  function computePose(f) {
    const p = basePose();
    const ch = CHARACTERS[f.char];
    const t = f.anim;
    switch (f.state) {
      case 'idle':
        p.lift = Math.round(Math.sin(t * 0.09) * 1.6);
        p.tailWag = 0.25; p.tailSpeed = 0.18;
        p.mouth = 0.15; p.tongue = f.char === 'ainu';
        if (t % 190 > 180) p.eyes = 'closed';
        break;
      case 'walk': {
        const dir = Math.sign(f.vx) * f.facing;
        const ph = t * (f.char === 'matcha' ? 0.42 : 0.32) * (dir || 1);
        const sw = 0.5;
        p.legs = [Math.sin(ph) * sw, Math.sin(ph + Math.PI) * sw, Math.sin(ph + Math.PI) * sw, Math.sin(ph) * sw];
        p.lift = Math.abs(Math.sin(ph)) * 2.5;
        p.tailWag = 0.35; p.tailSpeed = 0.3;
        p.headY = Math.sin(ph * 2) * 1.2;
        break;
      }
      case 'crouch':
        p.crouch = 1; p.legs = [0.35, 0.3, -0.35, -0.3]; p.earsBack = 0.5; p.eyes = 'angry'; p.tailWag = 0.1;
        break;
      case 'jump': {
        const up = f.vy > 0;
        p.legK = 0.85;
        p.legs = up ? [0.9, 0.7, -0.9, -0.7] : [0.5, 0.35, -0.3, -0.2];
        p.rot = up ? -0.12 : 0.1;
        p.earsBack = up ? 0.8 : 0.2;
        p.tailWag = 0.05;
        break;
      }
      case 'attack': poseAttack(p, f, ch); break;
      case 'hitstun':
        p.tilt = 0.18; p.headX = -10; p.headY = 4; p.eyes = 'hurt'; p.earsBack = 1; p.mouth = 0.4;
        p.legs = [-0.3, -0.25, 0.2, 0.25]; p.tailWag = 0;
        break;
      case 'blockstun':
        p.crouch = f.crouch ? 1 : 0.3; p.headX = -8; p.headY = 4; p.eyes = 'angry'; p.earsBack = 1;
        p.legs = [0.4, 0.35, -0.2, -0.25]; p.shield = true; p.tailWag = 0;
        break;
      case 'airhit':
        p.rot = -t * 0.28; p.eyes = 'x'; p.earsBack = 1; p.legs = [0.8, 0.6, -0.8, -0.6]; p.mouth = 0.5;
        break;
      case 'knockdown':
        p.rot = Math.PI; p.lieK = 1; p.eyes = 'x'; p.mouth = 0.3; p.tongue = true;
        p.legs = [Math.sin(t * 0.5) * 0.3, Math.cos(t * 0.5) * 0.3, Math.sin(t * 0.5 + 1) * 0.3, Math.cos(t * 0.5 + 1) * 0.3];
        p.legK = 0.8;
        break;
      case 'getup': {
        const k = Math.max(0, f.st / 22);
        p.rot = Math.PI * k; p.lieK = k; p.eyes = k > 0.5 ? 'x' : 'angry';
        break;
      }
      case 'ko':
        p.rot = Math.PI; p.lieK = f.onGround ? 1 : 0.5; p.eyes = 'x'; p.mouth = 0.5; p.tongue = true;
        p.legs = [0.15, -0.1, 0.1, -0.15]; p.legK = 0.9; p.tailWag = 0;
        if (!f.onGround) p.rot = Math.PI * Math.min(1, t * 0.05);
        break;
      case 'win':
        p.lift = Math.abs(Math.sin(t * 0.16)) * 16;
        p.legs = p.lift > 4 ? [0.6, 0.5, -0.6, -0.5] : [0, 0, 0, 0];
        p.tailWag = 0.7; p.tailSpeed = 0.7; p.mouth = 0.7; p.tongue = true; p.eyes = 'happy';
        p.headTilt = -0.15;
        break;
    }
    return p;
  }

  function poseAttack(p, f, ch) {
    const mv = ch.moves[f.move];
    if (!mv) return;
    const { ext, phase, t } = moveProgress(f, mv);
    const isA = f.char === 'ainu';
    p.eyes = 'angry'; p.earsBack = 0.6; p.tailWag = 0.05;
    switch (f.move) {
      case 'light':
        p.headX = 22 * ext; p.mouth = ext; p.legs = [0.3 * ext, 0.2 * ext, -0.3 * ext, -0.2 * ext]; p.tilt = -0.05 * ext;
        break;
      case 'crouchLight':
        p.crouch = 1; p.headX = 22 * ext; p.headY = 12 * ext; p.mouth = ext; p.legs = [0.5, 0.4, -0.4, -0.3];
        break;
      case 'airLight':
        p.legK = 0.85; p.headX = 14 * ext; p.headY = 14 * ext; p.headTilt = 0.5 * ext; p.mouth = ext;
        p.legs = [0.9, 0.7, -0.6, -0.5]; p.rot = 0.25 * ext;
        break;
      case 'heavy':
        if (isA) { p.tilt = -0.5 * ext; p.legs = [1.5 * ext, 0.8 * ext, -0.15, -0.1]; p.mouth = 0.5 * ext; p.headX = 6 * ext; }
        else {
          p.headX = 28 * ext; p.headY = 8 * ext; p.headTilt = 0.35 * ext; p.legs = [0.6 * ext, 0.5 * ext, -0.8 * ext, -0.7 * ext];
          p.stretch = 1 + 0.12 * ext; p.earsBack = 1;
        }
        break;
      case 'crouchHeavy':
        if (isA) { p.crouch = 1; p.spinX = Math.cos(Math.min(1, t * 1.6) * TAU); p.legs = [0.4, 0.3, -0.4, -0.3]; p.tailWag = 0; }
        else {
          p.crouch = 0.8; p.legs = [1.4 * ext, 1.2 * ext, -1.3 * ext, -1.1 * ext]; p.tilt = 0.05; p.stretch = 1 + 0.15 * ext;
          p.headX = 10 * ext; p.headY = 10 * ext; p.mouth = 0.6 * ext;
        }
        break;
      case 'airHeavy':
        if (isA) { p.legK = 0.55; p.legs = [1.2, 1.0, -1.2, -1.0]; p.rot = ext * t * TAU * 1.6; p.earsBack = 1; }
        else { p.legK = 0.9; p.rot = 0.6 * ext; p.legs = [1.3 * ext, 1.1 * ext, -1.0 * ext, -0.8 * ext]; p.mouth = 0.7 * ext; }
        break;
      case 'special':
        if (isA) {
          p.headX = 12 * ext; p.mouth = ext; p.tilt = -0.18 * ext; p.legs = [0.5 * ext, 0.35 * ext, -0.3, -0.25]; p.headTilt = -0.2 * ext;
        } else {
          const gal = f.anim * 0.9;
          p.legs = phase === 'active'
            ? [1.1 + Math.sin(gal) * 0.3, 0.9 + Math.sin(gal + 1) * 0.3, -1.1 + Math.sin(gal + 2) * 0.3, -0.9 + Math.sin(gal + 3) * 0.3]
            : [0.4 * ext, 0.3 * ext, -0.6 * ext, -0.5 * ext];
          p.stretch = 1 + 0.18 * ext; p.headX = 14 * ext; p.headY = 6 * ext; p.mouth = 0.8 * ext; p.earsBack = 1; p.crouch = 0.3 * ext;
        }
        break;
      case 'super':
        if (isA) {
          p.headTilt = -1.05 * ext; p.mouth = ext; p.tilt = -0.3 * ext; p.headY = -6 * ext; p.eyes = 'closed';
          p.legs = [0.3, 0.2, -0.2, -0.15]; p.tailWag = 0.4; p.tailSpeed = 0.9;
        } else {
          const gal = f.anim * 1.1;
          p.legs = [1.1 + Math.sin(gal) * 0.4, 0.9 + Math.sin(gal + 1) * 0.4, -1.1 + Math.sin(gal + 2) * 0.4, -0.9 + Math.sin(gal + 3) * 0.4];
          p.stretch = 1 + 0.2 * ext; p.headX = 16 * ext; p.mouth = Math.abs(Math.sin(f.anim * 0.8)); p.earsBack = 1; p.crouch = 0.25;
        }
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Dessin du chien (unités monde), rasterisé sans anticrénelage.
  // ctx.group = calque (ordre de profondeur) pour l'ombrage et les séparations.
  // ---------------------------------------------------------------------------
  function ellipse(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); ctx.fill(); }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); ctx.fill(); }
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    ctx.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    ctx.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    ctx.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    ctx.closePath();
  }

  function drawLeg(ctx, x, y, angle, len, w, colTop, colLow, pawCol) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-angle);
    ctx.fillStyle = colTop;
    roundRect(ctx, -w / 2, -w * 0.4, w, len + w * 0.4, w / 2);
    ctx.fill();
    if (colLow !== colTop) {
      ctx.fillStyle = colLow;
      roundRect(ctx, -w / 2, len * 0.58, w, len * 0.42, w / 2.2);
      ctx.fill();
    }
    ctx.fillStyle = pawCol;
    ellipse(ctx, w * 0.22, len - w * 0.12, w * 0.7, w * 0.44);
    ctx.restore();
  }

  function bez(a, b, c, d, t) { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; }

  function drawTail(ctx, B, bodyCY, pose, time) {
    const baseX = -B.bodyW * 0.44, baseY = bodyCY - B.bodyH * 0.2;
    const wag = Math.sin(time * pose.tailSpeed * 2) * pose.tailWag;
    ctx.save();
    ctx.translate(baseX, baseY);
    ctx.rotate(wag * 0.6);
    if (B.tail === 'curl') {
      const w = B.bodyW, h = B.bodyH;
      ctx.strokeStyle = P.main;
      ctx.lineWidth = 24;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.bezierCurveTo(-w * 0.28, -h * 0.7, -w * 0.05, -h * 1.25, w * 0.28, -h * 0.95);
      ctx.stroke();
      ctx.fillStyle = P.main;
      for (let i = 0; i < 6; i++) {
        const a = i / 5;
        circle(ctx, bez(0, -w * 0.28, -w * 0.05, w * 0.28, a) - 4, bez(0, -h * 0.7, -h * 1.25, -h * 0.95, a) - 8, 9);
      }
      ctx.strokeStyle = P.light;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(-w * 0.06, -h * 0.55);
      ctx.bezierCurveTo(-w * 0.16, -h * 0.86, 0.02 * w, -h * 1.08, w * 0.22, -h * 0.92);
      ctx.stroke();
    } else {
      ctx.strokeStyle = P.main;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-B.bodyW * 0.22, -B.bodyH * 0.4, -B.bodyW * 0.2, -B.bodyH * 1.15);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawEar(ctx, B, x, y, back, far) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-0.15 - back * 0.7);
    const h = B.earH, w = B.earW;
    ctx.beginPath();
    if (B.round) {
      ctx.moveTo(-w / 2, 4);
      ctx.quadraticCurveTo(-w * 0.35, -h * 0.9, 0, -h);
      ctx.quadraticCurveTo(w * 0.4, -h * 0.9, w / 2, 4);
    } else {
      ctx.moveTo(-w / 2, 4);
      ctx.lineTo(-w * 0.05, -h);
      ctx.lineTo(w / 2, 4);
    }
    ctx.closePath();
    ctx.fill();
    if (!far) {
      ctx.fillStyle = P.inner;
      ctx.beginPath();
      if (B.round) {
        ctx.moveTo(-w * 0.22, 2);
        ctx.quadraticCurveTo(-w * 0.12, -h * 0.6, 0, -h * 0.66);
        ctx.quadraticCurveTo(w * 0.18, -h * 0.6, w * 0.24, 2);
      } else {
        ctx.moveTo(-w * 0.2, 2);
        ctx.lineTo(-w * 0.04, -h * 0.7);
        ctx.lineTo(w * 0.24, 2);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHead(ctx, B, pose, charId) {
    const R = B.headR;
    const earBack = pose.earsBack;
    ctx.group = 6;
    ctx.fillStyle = P.shade;
    drawEar(ctx, B, -R * 0.38, -R * 0.62, earBack, true);
    ctx.group = 7;
    ctx.fillStyle = P.main;
    circle(ctx, 0, 0, R);
    if (B.fluffy) {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * 0.55 + i * 0.32;
        circle(ctx, Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92, R * 0.28);
      }
    }
    ctx.fillStyle = P.muzzle;
    if (charId === 'ainu') ellipse(ctx, R * 0.42, R * 0.38, R * 0.62, R * 0.45);
    else ellipse(ctx, R * 0.5, R * 0.42, R * 0.5, R * 0.36);
    const jx = R * 0.45, jy = R * 0.38;
    const mouth = pose.mouth;
    if (mouth > 0.08) {
      ctx.save();
      ctx.translate(jx, jy);
      ctx.fillStyle = 'mouth';
      ctx.beginPath();
      ctx.moveTo(0, -3);
      ctx.lineTo(B.muzzleL * 1.25 + R * 0.25, -3);
      ctx.lineTo(Math.cos(mouth * 0.6) * (B.muzzleL + R * 0.25), Math.sin(mouth * 0.6) * (B.muzzleL + R * 0.25));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(jx, jy);
    ctx.rotate(mouth * 0.6);
    ctx.fillStyle = P.muzzle;
    ellipse(ctx, B.muzzleL * 0.55 + R * 0.1, B.muzzleH * 0.18, B.muzzleL * 0.62, B.muzzleH * 0.38);
    if (pose.tongue && mouth > 0.1) {
      ctx.fillStyle = 'tongue';
      ellipse(ctx, B.muzzleL * 0.7 + R * 0.1, B.muzzleH * 0.05 + mouth * 4, B.muzzleL * 0.32, B.muzzleH * 0.32);
    }
    if (mouth > 0.3) ctx.stamp('fang', B.muzzleL * 1.0 + R * 0.1, -1);
    ctx.restore();
    ctx.fillStyle = P.muzzle;
    ellipse(ctx, R * 0.55 + B.muzzleL * 0.45, R * 0.16, B.muzzleL * 0.8, B.muzzleH * 0.55);
    if (mouth > 0.3) ctx.stamp('fangUp', R * 0.6 + B.muzzleL * 0.95, R * 0.16 + B.muzzleH * 0.5);
    ctx.fillStyle = P.nose;
    ellipse(ctx, R * 0.55 + B.muzzleL * 1.18, R * 0.05, 6.5, 5.2);
    ctx.stamp('noseShine', R * 0.55 + B.muzzleL * 1.18 + 1, R * 0.05 - 2.5);
    ctx.stamp('eye', R * 0.36, -R * 0.1, { style: pose.eyes, big: charId === 'ainu' });
    ctx.group = 8;
    ctx.fillStyle = P.main;
    drawEar(ctx, B, -R * 0.12, -R * 0.68, earBack, false);
  }

  function drawDogLocal(ctx, charId, pose, time) {
    const B = BUILD[charId];
    const crouchK = 1 - 0.42 * pose.crouch;
    const legLen = B.legLen * pose.legK * crouchK;
    const cy = legLen + B.bodyH * 0.5 + pose.lift;
    const legTotal = legLen + B.bodyH * 0.32;

    ctx.save();
    const h = cy + (B.bodyH * 0.5 + 2 - cy) * pose.lieK;
    ctx.translate(0, -h);
    ctx.rotate(pose.rot);
    ctx.scale(pose.spinX * pose.stretch, 1 / Math.sqrt(pose.stretch));
    ctx.translate(0, cy);

    const bodyCY = -cy;
    const hipY = bodyCY + B.bodyH * 0.18;
    const backX = -B.bodyW * 0.32, frontX = B.bodyW * 0.3;

    ctx.group = 1;
    drawLeg(ctx, backX + 6, hipY, pose.legs[3], legTotal, B.legW, P.shade, P.shade, P.shade);

    ctx.save();
    ctx.translate(backX, hipY);
    ctx.rotate(pose.tilt);
    ctx.translate(-backX, -hipY);

    ctx.group = 2;
    drawLeg(ctx, frontX + 6, hipY, pose.legs[1], legTotal, B.legW, P.shade, P.shade, P.shade);
    ctx.group = 3;
    drawTail(ctx, B, bodyCY, pose, time);
    ctx.group = 4;
    const headX = B.bodyW * 0.47 + pose.headX;
    const headY = bodyCY - B.bodyH * 0.45 - B.headR * (B.neck ? 0.95 : 0.5) + pose.headY;
    if (B.neck) {
      ctx.strokeStyle = P.main;
      ctx.lineWidth = B.headR * 1.15;
      ctx.beginPath();
      ctx.moveTo(B.bodyW * 0.28, bodyCY - B.bodyH * 0.05);
      ctx.lineTo(headX - B.headR * 0.2, headY + B.headR * 0.3);
      ctx.stroke();
    }
    ctx.fillStyle = P.main;
    ellipse(ctx, 0, bodyCY, B.bodyW / 2, B.bodyH / 2);
    if (B.fluffy) {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * 1.05 + i * (Math.PI * 0.9 / 8);
        circle(ctx, Math.cos(a) * B.bodyW * 0.47, bodyCY + Math.sin(a) * B.bodyH * 0.45, 9);
      }
      circle(ctx, -B.bodyW * 0.4, bodyCY + B.bodyH * 0.12, 15);
      ctx.fillStyle = P.belly;
      ellipse(ctx, B.bodyW * 0.04, bodyCY + B.bodyH * 0.3, B.bodyW * 0.36, B.bodyH * 0.2);
      // Collerette
      ctx.fillStyle = P.main;
      circle(ctx, B.bodyW * 0.36, bodyCY - B.bodyH * 0.12, 27);
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI * 0.2 + i * 0.45;
        circle(ctx, B.bodyW * 0.36 + Math.cos(a) * 24, bodyCY - B.bodyH * 0.12 + Math.sin(a) * 24, 9);
      }
      ctx.fillStyle = P.light;
      ellipse(ctx, B.bodyW * 0.45, bodyCY + B.bodyH * 0.12, 15, 20);
      // Bandana
      ctx.fillStyle = P.accent;
      ctx.beginPath();
      ctx.moveTo(B.bodyW * 0.2, bodyCY - B.bodyH * 0.34);
      ctx.lineTo(B.bodyW * 0.64, bodyCY - B.bodyH * 0.4);
      ctx.lineTo(B.bodyW * 0.48, bodyCY + B.bodyH * 0.14);
      ctx.closePath();
      ctx.fill();
      ctx.stamp('dot', B.bodyW * 0.42, bodyCY - B.bodyH * 0.22);
      ctx.stamp('dot', B.bodyW * 0.5, bodyCY - B.bodyH * 0.08);
      ctx.stamp('dot', B.bodyW * 0.34, bodyCY - B.bodyH * 0.3);
    } else {
      ctx.fillStyle = P.light;
      ellipse(ctx, B.bodyW * 0.4, bodyCY + B.bodyH * 0.05, 11, 13);
      // Collier vert matcha
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 7;
      ctx.beginPath();
      const nx = (B.bodyW * 0.28 + headX - B.headR * 0.2) / 2;
      const ny = (bodyCY - B.bodyH * 0.05 + headY + B.headR * 0.3) / 2;
      ctx.moveTo(nx - 11, ny - 10);
      ctx.lineTo(nx + 11, ny + 10);
      ctx.stroke();
      ctx.fillStyle = 'gold';
      circle(ctx, nx + 8, ny + 15, 4.5);
    }
    ctx.group = 5;
    drawLeg(ctx, frontX, hipY, pose.legs[0], legTotal, B.legW, P.main, P.legLow, P.legLow);
    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(pose.headTilt);
    drawHead(ctx, B, pose, charId);
    ctx.restore();

    ctx.restore(); // inclinaison

    ctx.group = 9;
    if (B.fluffy) { ctx.fillStyle = P.main; circle(ctx, backX - 2, hipY - 2, 16); }
    drawLeg(ctx, backX, hipY, pose.legs[2], legTotal, B.legW + 1, P.main, P.legLow, P.legLow);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Détails posés pixel par pixel (yeux, truffe, crocs…)
  // ---------------------------------------------------------------------------
  const EYE_SHAPES = {
    normal: [[0, -1, 'k'], [1, -1, 'w'], [0, 0, 'k'], [1, 0, 'k'], [0, 1, 'k'], [1, 1, 'k']],
    normalSmall: [[0, -1, 'k'], [1, -1, 'w'], [0, 0, 'k'], [1, 0, 'k']],
    closed: [[-1, 0, 'k'], [0, 1, 'k'], [1, 1, 'k'], [2, 0, 'k']],
    happy: [[-1, 1, 'k'], [0, 0, 'k'], [1, 0, 'k'], [2, 1, 'k']],
    x: [[-1, -1, 'k'], [1, -1, 'k'], [0, 0, 'k'], [-1, 1, 'k'], [1, 1, 'k']],
    hurt: [[-1, -2, 'k'], [0, -1, 'k'], [1, 0, 'k'], [0, 1, 'k'], [-1, 2, 'k']],
  };
  const BROW = [[-2, -3, 'k'], [-1, -3, 'k'], [0, -2, 'k'], [1, -2, 'k']];
  // Œil du pinscher : iris ambré + sourcil feu pour rester lisible sur le pelage noir
  const MATCHA_EYES = {
    normal: [[-1, -1, 'a'], [0, -1, 'a'], [1, -1, 'w'], [-1, 0, 'a'], [0, 0, 'k'], [1, 0, 'a'], [-1, -3, 't'], [0, -3, 't'], [1, -3, 't']],
    angry: [[-1, -1, 'a'], [0, -1, 'a'], [1, -1, 'w'], [-1, 0, 'a'], [0, 0, 'k'], [1, 0, 'a'], [-2, -3, 't'], [-1, -3, 't'], [0, -2, 't'], [1, -2, 't']],
  };
  const WHITE32 = hex2u32('#ffffff');
  const SHINE32 = hex2u32('#9a8a8c');

  function applyStamps(r, out32, charId) {
    const cols = { k: hex2u32(EYE_COL[charId] || '#1a0c06'), w: WHITE32, a: hex2u32('#e8962e'), t: hex2u32('#c26a2c') };
    const put = (x, y, c) => { if (x >= 0 && y >= 0 && x < r.w && y < r.h) out32[y * r.w + x] = c; };
    for (const s of r.stamps) {
      const fx = s.flip ? -1 : 1;
      if (s.type === 'eye') {
        const st = s.extra.style;
        let shape = EYE_SHAPES[st] || EYE_SHAPES.normal;
        const base = s.extra.big ? EYE_SHAPES.normal : EYE_SHAPES.normalSmall;
        if (st === 'normal') shape = base;
        if (st === 'angry') shape = base.concat(BROW);
        if (charId === 'matcha' && MATCHA_EYES[st]) shape = MATCHA_EYES[st];
        for (const [dx, dy, c] of shape) put(s.x + dx * fx - (s.flip ? 1 : 0), s.y + dy, cols[c]);
      } else if (s.type === 'noseShine') {
        put(s.x, s.y, SHINE32);
      } else if (s.type === 'dot') {
        put(s.x, s.y, WHITE32);
      } else if (s.type === 'fang') {
        put(s.x, s.y, WHITE32); put(s.x, s.y - 1, WHITE32);
      } else if (s.type === 'fangUp') {
        put(s.x, s.y, WHITE32); put(s.x, s.y + 1, WHITE32);
        put(s.x - 3 * fx, s.y, WHITE32);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Sprite d'un chien
  // ---------------------------------------------------------------------------
  const SPR_W = 200, SPR_H = 170, SPR_OX = 100, SPR_OY = 146;
  const dogRaster = new PixRaster(SPR_W, SPR_H, resolveDogMat);
  const sprCanvas = makeCanvas(SPR_W, SPR_H);
  const sprCtx = sprCanvas.getContext('2d');
  const sprImg = sprCtx.createImageData(SPR_W, SPR_H);
  const spr32 = new Uint32Array(sprImg.data.buffer);
  const tintCanvas = makeCanvas(SPR_W, SPR_H);
  const tintCtx = tintCanvas.getContext('2d');

  function renderDogSprite(charId, alt, pose, facing, time, opts) {
    const r = dogRaster;
    r.reset();
    r.translate(SPR_OX, SPR_OY);
    r.scale(PS * facing, PS);
    drawDogLocal(r, charId, pose, time);
    compose(r, dogRamps(charId, alt), spr32, { rim: true, outline: opts && opts.outline ? hex2u32(opts.outline) : 0 });
    applyStamps(r, spr32, charId);
    sprCtx.putImageData(sprImg, 0, 0);
    return sprCanvas;
  }

  function tinted(src, color) {
    tintCtx.globalCompositeOperation = 'source-over';
    tintCtx.clearRect(0, 0, SPR_W, SPR_H);
    tintCtx.drawImage(src, 0, 0);
    tintCtx.globalCompositeOperation = 'source-in';
    tintCtx.fillStyle = color;
    tintCtx.fillRect(0, 0, SPR_W, SPR_H);
    tintCtx.globalCompositeOperation = 'source-over';
    return tintCanvas;
  }

  // (x, y) = position des pattes à l'écran, en pixels
  function blitSprite(ctx, img, x, y, alpha) {
    if (alpha !== undefined) ctx.globalAlpha = alpha;
    ctx.drawImage(img, x - SPR_OX, y - SPR_OY);
    ctx.globalAlpha = 1;
  }

  function drawDogPreview(ctx, charId, alt, x, y, scale, facing, time, poseName) {
    const fake = { char: charId, state: poseName || 'idle', anim: time, vx: 0, vy: 0, facing, frame: 0, st: 0, crouch: false, onGround: true };
    const img = renderDogSprite(charId, alt, computePose(fake), facing, time);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, Math.round(x - SPR_OX * scale), Math.round(y - SPR_OY * scale), SPR_W * scale, SPR_H * scale);
  }

  function headCrop(charId) {
    const B = BUILD[charId];
    const cy = B.legLen + B.bodyH * 0.5;
    const hx = (B.bodyW * 0.47 + B.headR * 0.4) * PS;
    const hy = (-cy - B.bodyH * 0.45 - B.headR * (B.neck ? 0.95 : 0.5) - B.earH * 0.15) * PS;
    const size = 32;
    return { x: Math.round(SPR_OX + hx - size / 2), y: Math.round(SPR_OY + hy - size / 2), size };
  }

  const portraitCache = new Map();
  function drawPortrait(ctx, charId, alt, x, y, facing, mood) {
    const key = charId + (alt ? 'A' : '') + mood;
    let c = portraitCache.get(key);
    if (!c) {
      c = makeCanvas(32, 32);
      renderPortrait(c.getContext('2d'), charId, alt, 0, 0, 1, mood);
      portraitCache.set(key, c);
    }
    ctx.save();
    ctx.translate(x + (facing < 0 ? 32 : 0), y);
    ctx.scale(facing, 1);
    ctx.drawImage(c, 0, 0);
    ctx.restore();
  }

  function renderPortrait(ctx, charId, alt, x, y, facing, mood) {
    const pose = basePose();
    pose.mouth = mood === 'hurt' ? 0.45 : 0.2;
    pose.tongue = mood !== 'hurt';
    pose.eyes = mood === 'hurt' ? 'hurt' : mood === 'ko' ? 'x' : 'normal';
    pose.earsBack = mood === 'hurt' ? 1 : 0;
    const img = renderDogSprite(charId, alt, pose, 1, 0);
    const c = headCrop(charId);
    ctx.save();
    ctx.translate(x + (facing < 0 ? c.size : 0), y);
    ctx.scale(facing, 1);
    ctx.drawImage(img, c.x, c.y, c.size, c.size, 0, 0, c.size, c.size);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Primitives pixel (contexte basse résolution)
  // ---------------------------------------------------------------------------
  function prect(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
  function pset(ctx, x, y, col) { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), 1, 1); }
  function pline(ctx, x0, y0, x1, y1, col) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    ctx.fillStyle = col;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let guard = 0; guard < 400; guard++) {
      ctx.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function pcircle(ctx, cx, cy, r, col, density) {
    cx = Math.round(cx); cy = Math.round(cy); r = Math.round(r);
    ctx.fillStyle = col;
    let x = r, y = 0, err = 1 - r;
    const plot = (a, b) => { if (density === undefined || bayer(a, b) < density) ctx.fillRect(a, b, 1, 1); };
    while (x >= y) {
      plot(cx + x, cy + y); plot(cx + y, cy + x); plot(cx - y, cy + x); plot(cx - x, cy + y);
      plot(cx - x, cy - y); plot(cx - y, cy - x); plot(cx + y, cy - x); plot(cx + x, cy - y);
      y++;
      if (err < 0) err += 2 * y + 1; else { x--; err += 2 * (y - x) + 1; }
    }
  }
  function pdisc(ctx, cx, cy, r, col, density) {
    cx = Math.round(cx); cy = Math.round(cy);
    ctx.fillStyle = col;
    const rr = r * r;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
      const dx = Math.floor(Math.sqrt(Math.max(0, rr - dy * dy)));
      if (density === undefined) ctx.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1);
      else for (let x = -dx; x <= dx; x++) if (bayer(cx + x, cy + dy) < density) ctx.fillRect(cx + x, cy + dy, 1, 1);
    }
  }
  function pellipse(ctx, cx, cy, rx, ry, col, density) {
    cx = Math.round(cx); cy = Math.round(cy);
    ctx.fillStyle = col;
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
      const k = 1 - (dy * dy) / (ry * ry);
      if (k < 0) continue;
      const dx = Math.floor(rx * Math.sqrt(k));
      for (let x = -dx; x <= dx; x++) if (density === undefined || bayer(cx + x, cy + dy) < density) ctx.fillRect(cx + x, cy + dy, 1, 1);
    }
  }

  // ---------------------------------------------------------------------------
  // Texte pixel : Press Start 2P à sa taille native (8 px), seuillé + contour
  // ---------------------------------------------------------------------------
  const FONT = '8px "Press Start 2P", monospace';
  const textCache = new Map();
  const measureCtx = makeCanvas(4, 4).getContext('2d');
  if (document.fonts && document.fonts.load) {
    document.fonts.load(FONT).then(() => textCache.clear()).catch(() => {});
  }

  function textSprite(str, o) {
    const key = str + '|' + o.color + '|' + (o.color2 || '') + '|' + (o.outline || '') + '|' + (o.shadow || '');
    let c = textCache.get(key);
    if (c) return c;
    measureCtx.font = FONT;
    const tw = Math.max(1, Math.ceil(measureCtx.measureText(str).width));
    const pad = 2;
    const w = tw + pad * 2 + 1, h = 8 + pad * 2 + 1;
    const src = makeCanvas(w, h);
    const s = src.getContext('2d');
    s.font = FONT;
    s.textBaseline = 'top';
    s.fillStyle = '#fff';
    s.fillText(str, pad, pad);
    const d = s.getImageData(0, 0, w, h).data;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) mask[i] = d[i * 4 + 3] > 110 ? 1 : 0;
    c = makeCanvas(w, h);
    const cx = c.getContext('2d');
    const img = cx.createImageData(w, h);
    const o32 = new Uint32Array(img.data.buffer);
    const col = hex2u32(o.color), col2 = o.color2 ? hex2u32(o.color2) : col;
    const ol = o.outline ? hex2u32(o.outline) : 0;
    const sh = o.shadow ? hex2u32(o.shadow) : 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i]) { o32[i] = (y - pad) < 4 ? col : col2; continue; }
      if (sh && x > 1 && y > 1 && mask[i - 2 * w - 2]) o32[i] = sh;
      if (ol) {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && mask[yy * w + xx]) o32[i] = ol;
        }
      }
    }
    cx.putImageData(img, 0, 0);
    c.tw = tw; c.pad = pad;
    textCache.set(key, c);
    if (textCache.size > 400) textCache.delete(textCache.keys().next().value);
    return c;
  }

  // align : 'left' | 'center' | 'right' ; y = haut du texte
  function ptext(ctx, str, x, y, o) {
    o = Object.assign({ color: '#ffffff', outline: '#1a0c24', scale: 1, align: 'left' }, o || {});
    const c = textSprite(String(str), o);
    const s = o.scale;
    let left = x;
    if (o.align === 'center') left = x - (c.tw * s) / 2;
    else if (o.align === 'right') left = x - c.tw * s;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(c, Math.round(left - c.pad * s), Math.round(y - c.pad * s), c.width * s, c.height * s);
  }

  // Texte centré verticalement (taille en multiples de 8)
  function textOutlined(ctx, text, x, y, size, fill) {
    const scale = Math.max(1, Math.round(size / 8));
    ptext(ctx, text, x, y - 4 * scale, { color: fill || '#fff', scale, align: 'center' });
  }

  // ---------------------------------------------------------------------------
  // Dégradés tramés (Bayer 4×4)
  // ---------------------------------------------------------------------------
  function ditherBand(o32, w, x0, y0, bw, bh, cols) {
    const u = cols.map(hex2u32);
    const n = u.length - 1;
    for (let y = y0; y < y0 + bh; y++) for (let x = x0; x < x0 + bw; x++) {
      const t = (y - y0) / Math.max(1, bh - 1);
      const f = Math.min(n, Math.max(0, t * n));
      const i0 = Math.floor(f), fr = f - i0;
      o32[y * w + x] = (fr > bayer(x, y) && i0 < n) ? u[i0 + 1] : u[i0];
    }
  }

  function cardBackground(ctx, w, h) {
    const img = ctx.createImageData(w, h);
    const o = new Uint32Array(img.data.buffer);
    ditherBand(o, w, 0, 0, w, h - 10, ['#2e1d52', '#4a2766', '#73306f', '#a03d6e', '#cf5268', '#ec7660', '#f79a5e']);
    ditherBand(o, w, 0, h - 10, w, 10, ['#c08a58', '#8a5a38']);
    ctx.putImageData(img, 0, 0);
  }

  // Sprite ombré à partir d'un dessin (rampes nommées)
  function shadedSprite(w, h, ramps, draw, opts) {
    const names = Object.keys(ramps);
    const id = Object.fromEntries(names.map((n, i) => [n, i + 1]));
    const r = new PixRaster(w, h, (v) => id[v] || 1);
    draw(r);
    const table = [null].concat(names.map(n => ramps[n].map(hex2u32)));
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    const img = g.createImageData(w, h);
    const o = new Uint32Array(img.data.buffer);
    compose(r, table, o, opts);
    g.putImageData(img, 0, 0);
    return c;
  }

  // ---------------------------------------------------------------------------
  // Décor « Parc des Toutous » au crépuscule (4 couches)
  // ---------------------------------------------------------------------------
  const LEAF = ['#170e26', '#251538', '#36204a', '#4c2c5c', '#6a3e6c'];
  const WOOD = ['#22100f', '#40201f', '#5e302e', '#7c4440', '#98605a'];
  const CLOUD = ['#3a1f4f', '#6e3a6e', '#a8567a', '#e88a7a', '#ffc49a'];
  let stage = null;

  function buildStage() {
    let seed = 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    // Ciel, étoiles, soleil
    const sky = makeCanvas(W, H);
    const sg = sky.getContext('2d');
    const simg = sg.createImageData(W, H);
    const s32 = new Uint32Array(simg.data.buffer);
    ditherBand(s32, W, 0, 0, W, 200, ['#170f30', '#24184a', '#3a2262', '#5a2a6e', '#82346f', '#ac406c', '#d25666', '#ec7a5e', '#f8a060', '#fcc472']);
    const star = hex2u32('#fff4d8'), star2 = hex2u32('#b8a4e0');
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(rnd() * W), y = Math.floor(rnd() * 80);
      s32[y * W + x] = rnd() < 0.3 ? star : star2;
      if (rnd() < 0.08 && x > 1 && y > 1 && x < W - 1) {
        s32[(y - 1) * W + x] = star2; s32[(y + 1) * W + x] = star2; s32[y * W + x - 1] = star2; s32[y * W + x + 1] = star2;
      }
    }
    const sunX = 240, sunY = 158, sunR = 26;
    const halo = [hex2u32('#ffd08a'), hex2u32('#ffb47a')];
    for (let y = 100; y < 200; y++) for (let x = 160; x < 320; x++) {
      const d = Math.hypot(x - sunX, (y - sunY) * 1.1);
      if (d < sunR + 34 && d > sunR) {
        const k = 1 - (d - sunR) / 34;
        if (k * k * 0.9 > bayer(x, y)) s32[y * W + x] = k > 0.55 ? halo[0] : halo[1];
      }
    }
    const sunCols = ['#fff8d8', '#fff0b0', '#ffe08a'].map(hex2u32);
    for (let y = sunY - sunR; y <= sunY + sunR; y++) for (let x = sunX - sunR; x <= sunX + sunR; x++) {
      const d = Math.hypot(x - sunX, y - sunY);
      if (d > sunR) continue;
      const rel = (y - sunY) / sunR;
      if (rel > 0.25 && ((y - sunY) % 5 === 0 || ((y - sunY) % 5 === 1 && rel > 0.6))) continue;
      s32[y * W + x] = d < sunR * 0.55 ? sunCols[0] : d < sunR * 0.85 ? sunCols[1] : sunCols[2];
    }
    sg.putImageData(simg, 0, 0);

    // Nuages (défilent lentement)
    const clouds = makeCanvas(W, 120);
    const cg = clouds.getContext('2d');
    for (const [cx, cy, s] of [[40, 60, 1], [170, 38, 0.8], [300, 70, 1.2], [420, 45, 0.9]]) {
      const spr = shadedSprite(Math.round(90 * s), Math.round(40 * s), { c: CLOUD }, (r) => {
        r.fillStyle = 'c';
        r.beginPath(); r.ellipse(45 * s, 26 * s, 40 * s, 9 * s, 0, 0, TAU); r.fill();
        r.beginPath(); r.arc(30 * s, 22 * s, 11 * s, 0, TAU); r.fill();
        r.beginPath(); r.arc(50 * s, 17 * s, 14 * s, 0, TAU); r.fill();
        r.beginPath(); r.arc(66 * s, 23 * s, 9 * s, 0, TAU); r.fill();
      }, { lightFromBelow: true, noOutline: true });
      cg.drawImage(spr, Math.round(cx - 45 * s), Math.round(cy - 26 * s));
    }

    // Collines, arbres, lampadaires
    const back = makeCanvas(W, H);
    const bg = back.getContext('2d');
    const hill = (ramp, base, f1, p1, a1, f2, p2, a2) => shadedSprite(W, H, { h: ramp }, (r) => {
      r.fillStyle = 'h';
      r.beginPath(); r.moveTo(0, 210);
      for (let x = 0; x <= W; x += 4) r.lineTo(x, base - Math.sin(x * f1 + p1) * a1 - Math.sin(x * f2 + p2) * a2);
      r.lineTo(W, 210); r.closePath(); r.fill();
    }, { noOutline: true });
    bg.drawImage(hill(['#2a1640', '#43234f', '#5c2e5e', '#7a3c6a', '#9a4c74'], 166, 0.012, 1.3, 16, 0.031, 0, 6), 0, 0);
    bg.drawImage(hill(['#1c1030', '#2e1a42', '#3e2250', '#542e60', '#6a3a6c'], 182, 0.02, 4, 9, 0.05, 1, 3), 0, 0);
    const treeXs = [18, 70, 128, 352, 404, 462];
    for (let i = 0; i < treeXs.length; i++) {
      const s = 0.9 + (i % 3) * 0.12;
      const t = shadedSprite(70, 90, { trunk: WOOD, leaf: LEAF }, (r) => {
        r.group = 1; r.fillStyle = 'trunk';
        r.fillRect(32, 50, 6, 40);
        r.group = 2; r.fillStyle = 'leaf';
        for (const [x, y, rr] of [[35, 30, 20], [20, 42, 14], [50, 42, 14], [28, 18, 12], [44, 20, 12], [35, 48, 12]]) {
          r.beginPath(); r.arc(x, y * s + (1 - s) * 40, rr * s, 0, TAU); r.fill();
        }
      });
      bg.drawImage(t, treeXs[i] - 35, 110);
    }
    for (const lx of [176, 304]) {
      for (let y = 148; y < 205; y++) for (let x = lx - 16; x < lx + 17; x++) {
        const d = Math.hypot(x - lx, (y - 161) * 1.2);
        if (d < 16 && (1 - d / 16) * 0.7 > bayer(x, y)) prect(bg, x, y, 1, 1, '#ffd890');
      }
      prect(bg, lx - 1, 163, 3, 40, '#1c1030');
      prect(bg, lx, 163, 1, 40, '#3a2450');
      prect(bg, lx - 4, 158, 9, 2, '#1c1030');
      prect(bg, lx - 3, 160, 7, 3, '#fff0b8');
      prect(bg, lx - 2, 161, 5, 1, '#ffffff');
    }

    // Devant le public : clôture + sol
    const front = makeCanvas(W, H);
    const fg = front.getContext('2d');
    const fence = shadedSprite(W, 50, { wood: WOOD, rail: ['#1e0c0c', '#3a1a1c', '#52262a', '#6c3438', '#844448'] }, (r) => {
      r.group = 1; r.fillStyle = 'rail';
      r.fillRect(0, 12, W, 4);
      r.fillRect(0, 24, W, 4);
      r.group = 2; r.fillStyle = 'wood';
      for (let x = 4; x < W; x += 17) {
        r.beginPath();
        r.moveTo(x, 8); r.lineTo(x + 4, 3); r.lineTo(x + 8, 8); r.lineTo(x + 8, 40); r.lineTo(x, 40); r.closePath();
        r.fill();
      }
    }, { rim: true });
    fg.drawImage(fence, 0, 188);
    const fimg = fg.getImageData(0, 0, W, H);
    const f32 = new Uint32Array(fimg.data.buffer);
    ditherBand(f32, W, 0, 214, W, 10, ['#5e9a3a', '#4a8030', '#3a6a28']);
    ditherBand(f32, W, 0, 224, W, H - 224, ['#dca870', '#c89260', '#b07a4c', '#92603a', '#74482c', '#5a3622']);
    const g1 = hex2u32('#3a6a28'), g2 = hex2u32('#6eaa44'), g3 = hex2u32('#4a8030');
    for (let x = 0; x < W; x++) {
      const k = Math.floor(rnd() * 3);
      for (let j = 0; j < k; j++) f32[(224 + j) * W + x] = g3;
      if (rnd() < 0.35) { f32[213 * W + x] = g2; if (rnd() < 0.5) f32[212 * W + x] = g2; }
      if (rnd() < 0.1) { f32[211 * W + x] = g1; f32[212 * W + x] = g1; f32[213 * W + x] = g1; }
    }
    const p1 = hex2u32('#7a4e30'), p2 = hex2u32('#e8bc84'), p3 = hex2u32('#5a3622');
    for (let i = 0; i < 260; i++) {
      const x = Math.floor(rnd() * W), y = 228 + Math.floor(rnd() * (H - 230));
      f32[y * W + x] = rnd() < 0.5 ? p1 : p3;
      if (rnd() < 0.4) f32[(y - 1) * W + x] = p2;
    }
    const line = hex2u32('#ecc898');
    for (let a = 0; a < TAU; a += 0.004) {
      const x = Math.round(240 + Math.cos(a) * 62), y = Math.round(GY + 10 + Math.sin(a) * 11);
      if (y > 226 && y < H) f32[y * W + x] = line;
    }
    for (let y = 228; y < H; y++) if (y % 4 !== 0) f32[y * W + 240] = line;
    fg.putImageData(fimg, 0, 0);
    const hyd = shadedSprite(26, 32, { red: ['#3a0808', '#8a1a18', '#c8302a', '#ee5a44', '#ff9a7a'], gold: COMMON_RAMPS.gold }, (r) => {
      r.group = 1; r.fillStyle = 'red';
      r.fillRect(8, 8, 10, 22);
      r.beginPath(); r.arc(13, 9, 5, Math.PI, 0); r.fill();
      r.group = 2; r.fillRect(4, 14, 18, 4);
      r.fillRect(6, 28, 14, 3);
      r.group = 3; r.fillStyle = 'gold'; r.fillRect(12, 2, 2, 3);
    }, { rim: true });
    fg.drawImage(hyd, 14, 197);
    const boneSpr = shadedSprite(22, 12, { b: ['#6a5a48', '#bcae94', '#efe6d2', '#fffaf0', '#ffffff'] }, (r) => {
      r.fillStyle = 'b';
      r.fillRect(5, 4, 12, 4);
      for (const [x, y] of [[4, 4], [4, 8], [18, 4], [18, 8]]) { r.beginPath(); r.arc(x, y, 2.6, 0, TAU); r.fill(); }
    });
    fg.drawImage(boneSpr, 430, 248);
    fg.drawImage(boneSpr, 60, 256);

    stage = { sky, clouds, back, front };
  }

  // Public canin animé (entre les arbres et la clôture)
  const CROWD_SHAPES = [
    ['..X.....X..', '.XoX...XoX.', '.XooXXXooX.', 'XoooooooooX', 'XooEoooEooX', 'XoooooooooX', 'XooooNooooX', '.XoooooooX.', '..XXXXXXX..'],
    ['...XXXXX...', '.XXoooooXX.', 'XoXoooooXoX', 'XoXEoooEXoX', 'XoXoooooXoX', '.XXoooooXX.', '..XooNooX..', '..XoooooX..', '...XXXXX...'],
    ['.XX.....XX.', 'XooX...XooX', 'XoooXXXoooX', '.XoooooooX.', '.XoEoooEoX.', '.XoooooooX.', '.XoooNoooX.', '..XoooooX..', '...XXXXX...'],
  ];
  const CROWD_FUR = [
    ['#1a0c08', '#5a3420'], ['#120c0c', '#2a2224'], ['#2a1a08', '#a07040'], ['#1a1010', '#e0c8a0'],
    ['#200c06', '#c06030'], ['#101018', '#606878'], ['#1a1206', '#d8b070'],
  ];
  let crowd = null;
  function buildCrowd() {
    let seed = 5;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    crowd = [];
    for (let x = 6; x < W - 6; x += 13 + Math.floor(rnd() * 5)) {
      if (rnd() < 0.12) continue;
      crowd.push({
        x, y: 183 + Math.floor(rnd() * 4), shape: Math.floor(rnd() * CROWD_SHAPES.length),
        fur: CROWD_FUR[Math.floor(rnd() * CROWD_FUR.length)], phase: rnd() * TAU, hop: 0.6 + rnd() * 0.8,
      });
    }
  }
  function crowdSprite(c) {
    const shape = CROWD_SHAPES[c.shape];
    const cv = makeCanvas(shape[0].length, shape.length);
    const g = cv.getContext('2d');
    for (let j = 0; j < shape.length; j++) {
      for (let i = 0; i < shape[j].length; i++) {
        const ch = shape[j][i];
        if (ch === '.') continue;
        pset(g, i, j, ch === 'X' ? c.fur[0] : ch === 'o' ? c.fur[1] : ch === 'E' ? '#fff4d0' : '#0a0606');
      }
    }
    return cv;
  }

  function drawCrowd(ctx, frame, excite) {
    if (!crowd) buildCrowd();
    for (const c of crowd) {
      if (!c.img) c.img = crowdSprite(c);
      let dy = Math.sin(frame * 0.05 + c.phase) > 0.92 ? -1 : 0;
      if (excite > 0) dy = -Math.round(Math.abs(Math.sin(frame * 0.25 * c.hop + c.phase)) * Math.min(5, excite * 5));
      ctx.drawImage(c.img, c.x, c.y + dy);
    }
  }

  // ---------------------------------------------------------------------------
  // Effets (coordonnées en pixels écran)
  // ---------------------------------------------------------------------------
  class Effects {
    constructor() {
      this.parts = [];
      this.shake = 0;
      this.flash = 0;
      this.banners = [];
      this.trails = [[], []];
      this.hitFlash = [0, 0];
      this.comboShow = [{ n: 0, t: 0 }, { n: 0, t: 0 }];
      this.ghostHp = [null, null];
      this.excite = 0;
    }

    add(p) { this.parts.push(p); }

    burst(x, y, n, o) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const sp = (o.speed || 3) * (0.4 + Math.random() * 0.8);
        this.parts.push({
          type: o.type || 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0),
          life: o.life || 16, max: o.life || 16, cols: o.cols, grav: o.grav || 0,
        });
      }
    }

    banner(text, sub, color, life) { this.banners.push({ text, sub, color: color || '#ffd34d', life: life || 90, max: life || 90 }); }

    dust(x, y, n) {
      for (let i = 0; i < n; i++) {
        const dir = i % 2 ? 1 : -1;
        this.parts.push({ type: 'dust', x: x + dir * (2 + Math.random() * 6), y: y - 1, vx: dir * (0.4 + Math.random() * 0.8), vy: -0.2 - Math.random() * 0.3, life: 22, max: 22, size: 2 + Math.random() * 2.5 });
      }
    }

    handleEvents(events, snap, names, sfx) {
      for (const e of events) {
        switch (e.type) {
          case 'hit': {
            const sx = px(e.x), sy = py(e.y);
            const heavy = e.heavy;
            this.add({ type: 'hitspark', x: sx, y: sy, life: heavy ? 16 : 11, max: heavy ? 16 : 11, heavy });
            this.burst(sx, sy, heavy ? 14 : 7, { cols: ['#ffffff', '#fff0a0', '#ffc040', '#ff7a30'], speed: heavy ? 4 : 3, life: heavy ? 18 : 12 });
            const fur = snap.fighters[e.slot].char === 'matcha' ? ['#1a1416', '#b25e24'] : ['#c4561c', '#ecd0a2'];
            this.burst(sx, sy, heavy ? 6 : 3, { type: 'fur', cols: fur, speed: 1.8, life: 34, grav: 0.08 });
            this.shake = Math.max(this.shake, heavy ? 5 : 2);
            this.hitFlash[e.slot] = 5;
            this.excite = Math.min(1.5, this.excite + (heavy ? 0.6 : 0.3));
            if (e.combo >= 2) this.comboShow[1 - e.slot] = { n: e.combo, t: 90 };
            sfx && sfx.hit(heavy);
            break;
          }
          case 'block': {
            const sx = px(e.x), sy = py(e.y);
            this.add({ type: 'blockspark', x: sx, y: sy, life: 10, max: 10 });
            this.burst(sx, sy, 6, { cols: ['#ffffff', '#a8e0ff', '#4aa8ff'], speed: 2.5, life: 10 });
            this.shake = Math.max(this.shake, 1);
            sfx && sfx.block();
            break;
          }
          case 'clash':
            this.add({ type: 'hitspark', x: px(e.x), y: py(e.y), life: 14, max: 14, heavy: true });
            sfx && sfx.block();
            break;
          case 'land': this.dust(px(e.x), GY, 3); break;
          case 'thud':
            this.dust(px(e.x), GY, 7);
            this.shake = Math.max(this.shake, 3);
            sfx && sfx.thud();
            break;
          case 'jump': sfx && sfx.jump(); break;
          case 'swing': sfx && sfx.swing(e.heavy); break;
          case 'special': sfx && sfx.bark(snap.fighters[e.slot].char); break;
          case 'super': {
            const f = snap.fighters[e.slot];
            this.flash = 1;
            this.excite = 1.5;
            this.banner(e.name.toUpperCase(), 'SUPER !', '#ffd34d', 70);
            this.burst(px(f.x), py(f.y + 60), 20, { cols: ['#ffffff', '#ffe070', '#ff9a40'], speed: 4, life: 26 });
            sfx && sfx.superMove(f.char);
            break;
          }
          case 'round': sfx && sfx.announce('round'); break;
          case 'fight': sfx && sfx.announce('fight'); break;
          case 'ko':
            this.flash = 1; this.shake = 9; this.excite = 1.5;
            sfx && sfx.ko();
            break;
          case 'timeover': sfx && sfx.announce('time'); break;
          case 'matchover': this.excite = 1.5; sfx && sfx.win(); break;
        }
      }
    }

    update() {
      for (const p of this.parts) {
        p.x += p.vx || 0; p.y += p.vy || 0;
        p.vy = (p.vy || 0) + (p.grav || 0);
        if (p.type === 'spark') { p.vx *= 0.86; p.vy *= 0.86; }
        if (p.type === 'dust') { p.vx *= 0.9; p.vy *= 0.92; }
        p.life--;
      }
      this.parts = this.parts.filter(p => p.life > 0);
      this.shake *= 0.82;
      if (this.shake < 0.5) this.shake = 0;
      this.flash *= 0.85;
      if (this.flash < 0.04) this.flash = 0;
      this.excite = Math.max(0, this.excite - 0.012);
      for (const b of this.banners) b.life--;
      this.banners = this.banners.filter(b => b.life > 0);
      for (let i = 0; i < 2; i++) {
        if (this.hitFlash[i] > 0) this.hitFlash[i]--;
        if (this.comboShow[i].t > 0) this.comboShow[i].t--;
      }
    }

    draw(ctx) {
      for (const p of this.parts) {
        const k = p.life / p.max;
        switch (p.type) {
          case 'hitspark': drawHitSpark(ctx, p.x, p.y, 1 - k, p.heavy); break;
          case 'blockspark': drawBlockSpark(ctx, p.x, p.y, 1 - k); break;
          case 'spark': {
            const col = p.cols[Math.min(p.cols.length - 1, Math.floor((1 - k) * p.cols.length))];
            const s = k > 0.5 ? 2 : 1;
            prect(ctx, p.x, p.y, s, s, col);
            break;
          }
          case 'fur': prect(ctx, p.x, p.y, 2, 1, p.cols[p.life % 8 < 4 ? 0 : 1] || p.cols[0]); break;
          case 'dust': {
            const r = p.size * (0.6 + (1 - k) * 0.8);
            const dens = k > 0.6 ? undefined : k * 1.6;
            pdisc(ctx, p.x, p.y, r, '#c89a6a', dens);
            if (r > 1.5) pdisc(ctx, p.x - 0.5, p.y - 0.8, r * 0.55, '#ecc898', dens);
            break;
          }
        }
      }
    }
  }

  function drawHitSpark(ctx, x, y, t, heavy) {
    const L = (heavy ? 22 : 14) * Math.min(1, t * 2.2);
    const start = L * Math.max(0, t - 0.35) * 1.4;
    const rays = heavy ? 10 : 8;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU + 0.2;
      const len = i % 2 ? L * 0.6 : L;
      const x0 = x + Math.cos(a) * start, y0 = y + Math.sin(a) * start * 0.8;
      const x1 = x + Math.cos(a) * len, y1 = y + Math.sin(a) * len * 0.8;
      pline(ctx, x0, y0, x1, y1, t < 0.5 ? '#fff0a0' : '#ff9a40');
      if (t < 0.4) pline(ctx, x0, y0, (x0 + x1) / 2, (y0 + y1) / 2, '#ffffff');
    }
    if (t < 0.55) {
      const r = (heavy ? 7 : 5) * (1 - t * 1.4);
      for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
        const w = Math.max(0, Math.round(r - Math.abs(dy)));
        prect(ctx, x - w, y + dy, w * 2 + 1, 1, Math.abs(dy) < r * 0.5 ? '#ffffff' : '#fff0a0');
      }
    }
    if (heavy && t > 0.15) pcircle(ctx, x, y, 6 + t * 18, t < 0.6 ? '#ffe070' : '#ff7a30', 1 - t);
  }

  function drawBlockSpark(ctx, x, y, t) {
    pcircle(ctx, x, y, 3 + t * 9, t < 0.5 ? '#ffffff' : '#7fd0ff', 1 - t * 0.8);
    if (t < 0.5) {
      for (let dy = -3; dy <= 3; dy++) {
        const w = 3 - Math.abs(dy);
        prect(ctx, x - w, y + dy, w * 2 + 1, 1, Math.abs(dy) < 2 ? '#ffffff' : '#a8e0ff');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Projectiles
  // ---------------------------------------------------------------------------
  const ballRaster = new PixRaster(36, 36, resolveDogMat);
  const ballCanvas = makeCanvas(36, 36);
  const ballCtx = ballCanvas.getContext('2d');
  const ballImg = ballCtx.createImageData(36, 36);
  const ball32 = new Uint32Array(ballImg.data.buffer);

  function drawFurball(ctx, cx, cy, age, dir, alt) {
    const r = ballRaster;
    r.reset();
    r.translate(18, 18);
    r.rotate(Math.round(age * 0.3 * dir * 4) / 4);
    r.group = 1;
    r.fillStyle = 'main';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      r.beginPath(); r.arc(Math.cos(a) * 8, Math.sin(a) * 8, 5, 0, TAU); r.fill();
    }
    r.beginPath(); r.arc(0, 0, 10, 0, TAU); r.fill();
    r.group = 2;
    r.strokeStyle = 'light';
    r.lineWidth = 2;
    r.beginPath(); r.arc(0, 0, 5.5, 0, Math.PI * 1.3); r.stroke();
    r.beginPath(); r.arc(0, 0, 2, Math.PI, Math.PI * 2.2); r.stroke();
    compose(r, dogRamps('ainu', alt), ball32, {});
    ballCtx.putImageData(ballImg, 0, 0);
    ctx.drawImage(ballCanvas, Math.round(cx - 18), Math.round(cy - 18));
  }

  function drawProjectile(ctx, p, fx, time, alts) {
    const cx = px(p.x), cy = py(p.y + p.h / 2);
    const dir = Math.sign(p.vx) || 1;
    if (p.kind === 'furball') {
      if (fx && time % 3 === 0) {
        fx.add({ type: 'fur', x: cx - dir * 9, y: cy + (Math.random() - 0.5) * 10, vx: -dir * 0.8, vy: (Math.random() - 0.5) * 0.4, life: 16, max: 16, cols: alts[p.owner] ? ['#dcbc88', '#faf2e2'] : ['#c4561c', '#ecd0a2'] });
      }
      drawFurball(ctx, cx, cy, p.age, dir, alts[p.owner]);
    } else if (p.kind === 'howl') {
      pellipse(ctx, cx, cy, p.w * PS * 0.5, p.h * PS * 0.5, '#ff9a5a', 0.25);
      for (let i = 0; i < 4; i++) {
        const k = ((p.age * 0.08 + i * 0.25) % 1);
        const rr = 14 + k * 26;
        const xo = cx - dir * (20 - k * 20);
        for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 0.03) {
          const x = Math.round(xo + dir * Math.cos(a) * rr * 0.45), y = Math.round(cy + Math.sin(a) * rr * 1.15);
          if (bayer(x, y) < 1 - k * 0.85) {
            prect(ctx, x, y, 1, 1, i % 2 ? '#ffe070' : '#ffffff');
            prect(ctx, x - dir, y, 1, 1, i % 2 ? '#ff9a40' : '#ffd890');
          }
        }
      }
      const wob = Math.round(Math.sin(p.age * 0.5) * 2);
      ptext(ctx, 'AOUUU!', cx, cy - Math.round(p.h * PS * 0.5) - 10 + wob, { color: '#ffffff', color2: '#ffd34d', outline: '#5a1a00', align: 'center' });
    }
  }

  // ---------------------------------------------------------------------------
  // Interface de combat
  // ---------------------------------------------------------------------------
  function drawPawIcon(ctx, x, y, on) {
    const ol = on ? '#5a2a00' : '#0e0816', f = on ? '#ffd34d' : '#2e1c40', hi = on ? '#fff6c0' : '#44305a';
    for (const [dx, dy] of [[1, 0], [3, -1], [5, 0]]) { prect(ctx, x + dx - 1, y + dy - 1, 3, 3, ol); pset(ctx, x + dx, y + dy, f); }
    prect(ctx, x + 1, y + 2, 5, 4, ol); prect(ctx, x + 2, y + 3, 3, 2, f); pset(ctx, x + 2, y + 3, hi);
  }

  function drawBar(ctx, x, y, w, h, ratio, ghost, flip, low, t) {
    prect(ctx, x - 2, y - 2, w + 4, h + 4, '#0e0816');
    prect(ctx, x - 1, y - 1, w + 2, 1, '#e8d08a');
    prect(ctx, x - 1, y + h, w + 2, 1, '#6a5020');
    prect(ctx, x - 1, y, 1, h, '#a08848');
    prect(ctx, x + w, y, 1, h, '#a08848');
    prect(ctx, x, y, w, h, '#3a0e1a');
    const gw = Math.round(w * ghost), fw = Math.round(w * ratio);
    prect(ctx, flip ? x + w - gw : x, y, gw, h, '#e8442e');
    if (fw > 0) {
      const fx0 = flip ? x + w - fw : x;
      const c = low && (t % 20 < 10) ? ['#ffd0a0', '#ff8a3a', '#d84a1a', '#8a2a0a'] : ['#fffbd0', '#ffe25a', '#f0b020', '#a86a08'];
      prect(ctx, fx0, y, fw, h, c[2]);
      prect(ctx, fx0, y, fw, 1, c[0]);
      prect(ctx, fx0, y + 1, fw, 2, c[1]);
      prect(ctx, fx0, y + h - 1, fw, 1, c[3]);
      for (let i = fx0 + (fx0 & 1); i < fx0 + fw; i += 2) pset(ctx, i, y + 3, c[1]);
      for (let i = fx0 + 1 - (fx0 & 1); i < fx0 + fw; i += 2) pset(ctx, i, y + h - 2, c[3]);
    }
  }

  function drawHud(ctx, snap, names, fx, alts, extra, touch) {
    const barW = 168, barH = 9, top = 9;
    for (let i = 0; i < 2; i++) {
      const f = snap.fighters[i];
      const ch = CHARACTERS[f.char];
      const ratio = Math.max(0, f.hp / ch.maxHp);
      if (fx.ghostHp[i] === null || fx.ghostHp[i] < ratio) fx.ghostHp[i] = ratio;
      if (snap.hitstop === 0) fx.ghostHp[i] += (ratio - fx.ghostHp[i]) * 0.05;
      const x0 = i === 0 ? 46 : W - 46 - barW;
      drawBar(ctx, x0, top, barW, barH, ratio, fx.ghostHp[i], i === 0, ratio < 0.25, snap.f);
      // Portrait
      const pp = i === 0 ? 6 : W - 6 - 34;
      prect(ctx, pp - 1, 4, 36, 36, '#0e0816');
      prect(ctx, pp, 5, 34, 34, '#e8d08a');
      prect(ctx, pp + 1, 6, 32, 32, i === 0 ? '#2a4a9a' : '#9a2a2a');
      for (let yy = 0; yy < 32; yy += 2) prect(ctx, pp + 1, 6 + yy, 32, 1, i === 0 ? '#3458b0' : '#b03434');
      const mood = f.state === 'ko' ? 'ko' : (f.state === 'hitstun' || f.state === 'airhit') ? 'hurt' : 'ok';
      ctx.save();
      ctx.beginPath(); ctx.rect(pp + 1, 6, 32, 32); ctx.clip();
      drawPortrait(ctx, f.char, alts[i], pp + 1, 7, i === 0 ? 1 : -1, mood);
      ctx.restore();
      // Nom
      const label = (names[i] || ch.name).toUpperCase().slice(0, 14);
      ptext(ctx, label, i === 0 ? x0 : x0 + barW, top + barH + 5, { align: i === 0 ? 'left' : 'right', color: '#ffffff', color2: '#ffe0a0' });
      // Manches gagnées
      for (let k = 0; k < C.WINS_NEEDED; k++) {
        const wx = i === 0 ? x0 + barW - 9 - k * 11 : x0 + 2 + k * 11;
        drawPawIcon(ctx, wx, top + barH + 7, snap.wins[i] > k);
      }
      // Jauge de super
      // Sur tactile, les boutons occupent le bas de l'écran : jauge sous la barre de vie
      const mW = 96, mH = 5, my = touch ? top + barH + 18 : H - 11;
      const mx = touch ? (i === 0 ? x0 : x0 + barW - mW) : (i === 0 ? 10 : W - 10 - mW);
      const full = f.meter >= C.METER_MAX;
      prect(ctx, mx - 2, my - 2, mW + 4, mH + 4, '#0e0816');
      prect(ctx, mx - 1, my - 1, mW + 2, mH + 2, '#3a5a8a');
      prect(ctx, mx, my, mW, mH, '#101830');
      const mw = Math.round(mW * Math.min(1, f.meter / C.METER_MAX));
      const mx0 = i === 0 ? mx : mx + mW - mw;
      const pulse = full && snap.f % 16 < 8;
      prect(ctx, mx0, my, mw, mH, pulse ? '#a8f8ff' : '#2a8ae0');
      prect(ctx, mx0, my, mw, 1, pulse ? '#ffffff' : '#7ac8ff');
      prect(ctx, mx0, my + mH - 1, mw, 1, pulse ? '#5ad8f0' : '#1a5aa8');
      for (let s = 1; s < 4; s++) prect(ctx, mx + (mW * s) / 4, my, 1, mH, '#0e0816');
      if (!touch) ptext(ctx, full ? 'SUPER OK!' : 'SUPER', i === 0 ? mx : mx + mW, my - 12, { align: i === 0 ? 'left' : 'right', color: full ? (pulse ? '#ffffff' : '#a8f8ff') : '#9ac0ff', color2: full ? '#5ad8f0' : '#6a90d0' });
      // Combo
      const cs = fx.comboShow[i];
      if (cs.t > 0 && cs.n >= 2 && (cs.t > 20 || cs.t % 4 < 2)) {
        const cx = i === 0 ? 70 : W - 70;
        const pop = cs.t > 84 ? 3 : 2;
        ptext(ctx, cs.n + ' COUPS', cx, 66, { align: 'center', scale: pop, color: '#ffffff', color2: '#ffc030', outline: '#4a1200' });
        ptext(ctx, 'COMBO!', cx, 66 + pop * 9 + 2, { align: 'center', color: '#ffe070', outline: '#4a1200' });
      }
    }
    // Chrono
    prect(ctx, W / 2 - 17, 3, 34, 26, '#0e0816');
    prect(ctx, W / 2 - 16, 4, 32, 24, '#e8d08a');
    prect(ctx, W / 2 - 15, 5, 30, 22, '#24184a');
    prect(ctx, W / 2 - 15, 5, 30, 1, '#3a2a6a');
    const low = snap.timer <= 10 && snap.f % 30 < 15;
    ptext(ctx, String(snap.timer).padStart(2, '0'), W / 2 + 1, 8, { align: 'center', scale: 2, color: low ? '#ff6a4a' : '#ffffff', color2: low ? '#c83020' : '#ffd890', outline: '#0e0816' });
    if (extra && extra.ping !== undefined) {
      ptext(ctx, extra.ping + 'MS', W / 2, 32, { align: 'center', color: '#c0b0e0', outline: '#0e0816' });
    }
  }

  function drawAnnouncements(ctx, snap, names, fx) {
    const ph = snap.phase, t = snap.pt;
    const nameOf = (i) => (names[i] || CHARACTERS[snap.fighters[i].char].name);
    let big = null, sub = null, c1 = '#fff6c0', c2 = '#ffb020';
    if (ph === 'intro') {
      if (t < 70) {
        const final = snap.wins[0] === C.WINS_NEEDED - 1 && snap.wins[1] === C.WINS_NEEDED - 1;
        big = final ? 'MANCHE FINALE' : 'MANCHE ' + snap.round;
      } else { big = 'COMBAT !'; c1 = '#ffe0a0'; c2 = '#ff5a2a'; }
    } else if (ph === 'fight' && t < 30) {
      big = 'COMBAT !'; c1 = '#ffe0a0'; c2 = '#ff5a2a';
    } else if (ph === 'ko') {
      if (t < 110) { big = snap.to ? 'TEMPS !' : 'K.O.'; c1 = snap.to ? '#fff6c0' : '#ffd0c0'; c2 = snap.to ? '#ffb020' : '#e8202a'; }
      else {
        big = snap.rw === -1 ? 'ÉGALITÉ !' : nameOf(snap.rw).toUpperCase();
        sub = snap.rw === -1 ? '' : 'GAGNE LA MANCHE !';
      }
    } else if (ph === 'matchover') {
      big = snap.mw === -1 ? 'MATCH NUL !' : nameOf(snap.mw).toUpperCase();
      sub = snap.mw === -1 ? '' : 'REMPORTE LE COMBAT !';
    }
    if (big) {
      let scale = big.length <= 6 ? 5 : big.length <= 9 ? 4 : big.length <= 13 ? 3 : 2;
      if (ph === 'intro' && (t % 70) < 6) scale += 1;
      if (ph === 'ko' && t < 8 && !snap.to) scale += 2;
      const y = ph === 'matchover' ? 80 : 100;
      ptext(ctx, big, W / 2, y - scale * 4, { align: 'center', scale, color: c1, color2: c2, outline: '#1a0610', shadow: '#000000' });
      if (sub) ptext(ctx, sub, W / 2, y + scale * 4 + 6, { align: 'center', color: '#ffffff', color2: '#ffe0a0', outline: '#1a0610' });
    }
    for (const b of fx.banners) {
      const slide = Math.min(1, (b.max - b.life) / 6);
      const fade = b.life < 10 ? b.life / 10 : 1;
      const y0 = 58;
      ctx.globalAlpha = 0.8 * fade;
      prect(ctx, 0, y0, W, 30, '#140820');
      ctx.globalAlpha = fade;
      prect(ctx, 0, y0, W, 1, b.color);
      prect(ctx, 0, y0 + 29, W, 1, b.color);
      ptext(ctx, b.sub, W / 2 - 140 + slide * 140, y0 + 4, { align: 'center', color: '#a8f8ff', color2: '#5ad8f0', outline: '#000000' });
      ptext(ctx, b.text, W / 2, y0 + 16, { align: 'center', color: '#fff6c0', color2: b.color, outline: '#3a0a00' });
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------------------
  // Image complète
  // ---------------------------------------------------------------------------
  function drawScene(ctx, snap, opts) {
    const fx = opts.fx;
    const names = opts.names || ['', ''];
    const alts = opts.alts || [false, false];
    if (!stage) buildStage();
    ctx.imageSmoothingEnabled = false;

    ctx.save();
    if (fx.shake > 0) ctx.translate(Math.round((Math.random() - 0.5) * fx.shake), Math.round((Math.random() - 0.5) * fx.shake));
    ctx.drawImage(stage.sky, 0, 0);
    const cOff = Math.floor(snap.f * 0.04) % W;
    ctx.drawImage(stage.clouds, -cOff, 0);
    ctx.drawImage(stage.clouds, W - cOff, 0);
    ctx.drawImage(stage.back, 0, 0);
    drawCrowd(ctx, snap.f, fx.excite);
    ctx.drawImage(stage.front, 0, 0);

    const frozen = snap.freeze > 0;
    if (frozen) {
      ctx.fillStyle = 'rgba(12,2,30,0.6)';
      ctx.fillRect(0, 0, W, H);
    }

    // Ombres tramées
    for (const f of snap.fighters) {
      const k = Math.max(0.4, 1 - f.y / 260);
      pellipse(ctx, px(f.x), GY + 1, 26 * k, 4 * k, '#3a1e10', 0.5 + 0.2 * k);
    }

    // Images rémanentes (charges, supers)
    for (let i = 0; i < 2; i++) {
      const f = snap.fighters[i];
      const tr = fx.trails[i];
      const dashing = f.state === 'attack' && (f.move === 'super' || (f.char === 'matcha' && f.move === 'special'));
      if (dashing && !opts.paused && snap.f % 2 === 0) tr.push({ x: f.x, y: f.y, pose: computePose(f), facing: f.facing, life: 10 });
      for (const g of tr) {
        const img = renderDogSprite(f.char, alts[i], g.pose, g.facing, f.anim);
        blitSprite(ctx, tinted(img, f.char === 'matcha' ? '#8bd04a' : '#ffb15a'), px(g.x), py(g.y), (g.life / 10) * 0.5);
        if (!opts.paused) g.life--;
      }
      fx.trails[i] = tr.filter(g => g.life > 0);
    }

    // Combattants : celui qui attaque passe devant
    const order = [0, 1];
    if (snap.fighters[0].state === 'attack' && snap.fighters[1].state !== 'attack') order.reverse();
    for (const i of order) {
      const f = snap.fighters[i];
      const pose = computePose(f);
      const isSuper = frozen && snap.freezeOwner === i;
      const img = renderDogSprite(f.char, alts[i], pose, f.facing, f.anim, { outline: isSuper ? (snap.f % 4 < 2 ? '#ffe070' : '#ffffff') : null });
      const blink = f.inv && f.state !== 'ko' && (snap.f % 6 < 3);
      const x = px(f.x), y = py(f.y);
      blitSprite(ctx, img, x, y, blink ? 0.5 : 1);
      if (fx.hitFlash[i] > 0) blitSprite(ctx, tinted(img, fx.hitFlash[i] > 2 ? '#ffffff' : '#ffd0b0'), x, y, 0.8);
      if (pose.shield) drawShield(ctx, f, snap.f);
      if (opts.debug && opts.game) drawDebug(ctx, i, opts.game);
    }

    for (const p of snap.projectiles) drawProjectile(ctx, p, opts.paused ? null : fx, snap.f, alts);
    fx.draw(ctx);
    ctx.restore();

    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${(fx.flash * 0.7).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }

    if (!opts.noHud) {
      drawHud(ctx, snap, names, fx, alts, opts.extra, opts.touch);
      drawAnnouncements(ctx, snap, names, fx);
    }
  }

  function drawShield(ctx, f, t) {
    const cx = px(f.x) + f.facing * 26, cy = py(f.y) - (f.crouch ? 17 : 27);
    const ry = f.crouch ? 17 : 25;
    for (let a = -Math.PI / 2; a <= Math.PI / 2; a += 0.04) {
      const x = Math.round(cx + f.facing * Math.cos(a) * 7), y = Math.round(cy + Math.sin(a) * ry);
      prect(ctx, x, y, 1, 1, (y + t) % 4 < 2 ? '#ffffff' : '#7fd0ff');
      if (bayer(x, y) < 0.5) prect(ctx, x - f.facing, y, 1, 1, '#4aa8ff');
    }
  }

  function drawDebug(ctx, i, game) {
    const real = game.fighters[i];
    const hb = game.hurtbox(real);
    ctx.strokeStyle = 'lime';
    ctx.strokeRect(px(hb.l) + 0.5, py(hb.b + hb.h) + 0.5, px(hb.w), px(hb.h));
    const ab = game.hitboxOf(real);
    if (ab) { ctx.strokeStyle = 'red'; ctx.strokeRect(px(ab.l) + 0.5, py(ab.b + ab.h) + 0.5, px(ab.w), px(ab.h)); }
  }

  window.DogRender = {
    W, H, drawScene, drawDogPreview, drawPortrait, Effects, buildStage, textOutlined, ptext, cardBackground,
    computePose, BUILD,
  };
})();
