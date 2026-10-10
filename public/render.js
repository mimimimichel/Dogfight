/*
 * Dogfight — rendu canvas : chiens procéduraux, décor, effets, interface de combat.
 */
(function () {
  'use strict';
  const C = window.DogGame;
  const { STAGE_W, STAGE_H, GROUND_Y, CHARACTERS } = C;
  const TAU = Math.PI * 2;

  // ---------------------------------------------------------------------------
  // Apparence des chiens
  // ---------------------------------------------------------------------------
  const PALETTES = {
    ainu: {
      main: '#d0662a', shade: '#9c4718', light: '#f7e1bd', belly: '#fbecd2', muzzle: '#f3d6ab',
      nose: '#2a1a14', eye: '#2b1608', inner: '#e8987a', legLow: '#f0cf9e',
      accent: '#2f6fd6', accent2: '#ffffff', outline: '#2a1206',
    },
    ainuAlt: {
      main: '#efd3a6', shade: '#c9a271', light: '#fffaf0', belly: '#fffaf0', muzzle: '#fff3dc',
      nose: '#2a1a14', eye: '#2b1608', inner: '#efa58c', legLow: '#fff3dc',
      accent: '#d23b3b', accent2: '#ffffff', outline: '#3a2410',
    },
    matcha: {
      main: '#221c1c', shade: '#0f0c0c', light: '#c26a2c', belly: '#c26a2c', muzzle: '#c26a2c',
      nose: '#0b0909', eye: '#3a1a08', inner: '#d98282', legLow: '#c26a2c',
      accent: '#8bc34a', accent2: '#e8ffd0', outline: '#000000',
    },
    matchaAlt: {
      main: '#6b4128', shade: '#4a2a17', light: '#d99a55', belly: '#d99a55', muzzle: '#d99a55',
      nose: '#1a0f09', eye: '#2a1206', inner: '#d98282', legLow: '#d99a55',
      accent: '#f2c230', accent2: '#fff6c8', outline: '#1a0c04',
    },
  };

  const BUILD = {
    ainu: { bodyW: 102, bodyH: 54, legLen: 28, legW: 16, headR: 29, muzzleL: 19, muzzleH: 17, earH: 18, earW: 19, round: true, fluffy: true, tail: 'curl', neck: 0 },
    matcha: { bodyW: 86, bodyH: 36, legLen: 46, legW: 10, headR: 20, muzzleL: 25, muzzleH: 12, earH: 31, earW: 13, round: false, fluffy: false, tail: 'thin', neck: 1 },
  };

  function paletteFor(charId, alt) { return PALETTES[charId + (alt ? 'Alt' : '')]; }

  function moveProgress(f, mv) {
    const s = mv.startup, a = mv.active, r = mv.recovery;
    if (f.frame < s) return { ext: Math.min(1, (f.frame + 1) / s), phase: 'startup', t: f.frame / (s + a + r) };
    if (f.frame < s + a) return { ext: 1, phase: 'active', t: f.frame / (s + a + r) };
    return { ext: Math.max(0, 1 - (f.frame - s - a) / r), phase: 'recovery', t: f.frame / (s + a + r) };
  }

  function basePose() {
    return {
      crouch: 0, tilt: 0, lift: 0, headX: 0, headY: 0, headTilt: 0, mouth: 0,
      legs: [0, 0, 0, 0], // avant proche, avant loin, arrière proche, arrière loin
      legK: 1, rot: 0, lieK: 0, spinX: 1, stretch: 1, tailWag: 0.2, tailSpeed: 0.2,
      eyes: 'normal', earsBack: 0, shield: false, tongue: false,
    };
  }

  function computePose(f) {
    const p = basePose();
    const ch = CHARACTERS[f.char];
    const t = f.anim;
    switch (f.state) {
      case 'idle':
        p.lift = Math.sin(t * 0.09) * 1.6;
        p.tailWag = 0.25; p.tailSpeed = 0.18;
        p.mouth = 0.15; p.tongue = f.char === 'ainu';
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
        p.crouch = 1; p.legs = [0.35, 0.3, -0.35, -0.3]; p.earsBack = 0.5; p.eyes = 'angry';
        p.tailWag = 0.1;
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
    p.eyes = 'angry';
    p.earsBack = 0.6;
    p.tailWag = 0.05;
    switch (f.move) {
      case 'light':
        p.headX = 22 * ext; p.mouth = phase === 'startup' ? ext : 1 * ext; p.legs = [0.3 * ext, 0.2 * ext, -0.3 * ext, -0.2 * ext];
        p.tilt = -0.05 * ext;
        break;
      case 'crouchLight':
        p.crouch = 1; p.headX = 22 * ext; p.headY = 12 * ext; p.mouth = ext; p.legs = [0.5, 0.4, -0.4, -0.3];
        break;
      case 'airLight':
        p.legK = 0.85; p.headX = 14 * ext; p.headY = 14 * ext; p.headTilt = 0.5 * ext; p.mouth = ext;
        p.legs = [0.9, 0.7, -0.6, -0.5]; p.rot = 0.25 * ext;
        break;
      case 'heavy':
        if (isA) { // se cabre et frappe de la patte
          p.tilt = -0.5 * ext; p.legs = [1.5 * ext, 0.8 * ext, -0.15, -0.1]; p.mouth = 0.5 * ext; p.headX = 6 * ext;
        } else { // coup de boule
          p.headX = 28 * ext; p.headY = 8 * ext; p.headTilt = 0.35 * ext; p.legs = [0.6 * ext, 0.5 * ext, -0.8 * ext, -0.7 * ext];
          p.stretch = 1 + 0.12 * ext; p.earsBack = 1;
        }
        break;
      case 'crouchHeavy':
        if (isA) { // toupie avec la queue
          p.crouch = 1; p.spinX = Math.cos(Math.min(1, t * 1.6) * TAU); p.legs = [0.4, 0.3, -0.4, -0.3]; p.tailWag = 0;
        } else { // glissade
          p.crouch = 0.8; p.legs = [1.4 * ext, 1.2 * ext, -1.3 * ext, -1.1 * ext]; p.tilt = 0.05; p.stretch = 1 + 0.15 * ext;
          p.headX = 10 * ext; p.headY = 10 * ext; p.mouth = 0.6 * ext;
        }
        break;
      case 'airHeavy':
        if (isA) { // boule qui tourne
          p.legK = 0.55; p.legs = [1.2, 1.0, -1.2, -1.0]; p.rot = ext * t * TAU * 1.6; p.earsBack = 1;
        } else { // ruade : piqué, pattes en avant
          p.legK = 0.9; p.rot = 0.6 * ext; p.legs = [1.3 * ext, 1.1 * ext, -1.0 * ext, -0.8 * ext]; p.mouth = 0.7 * ext;
        }
        break;
      case 'special':
        if (isA) { // aboiement-boule de poils
          p.headX = 12 * ext; p.mouth = ext; p.tilt = -0.18 * ext; p.legs = [0.5 * ext, 0.35 * ext, -0.3, -0.25];
          p.headTilt = -0.2 * ext;
        } else { // charge
          const gal = f.anim * 0.9;
          p.legs = phase === 'active'
            ? [1.1 + Math.sin(gal) * 0.3, 0.9 + Math.sin(gal + 1) * 0.3, -1.1 + Math.sin(gal + 2) * 0.3, -0.9 + Math.sin(gal + 3) * 0.3]
            : [0.4 * ext, 0.3 * ext, -0.6 * ext, -0.5 * ext];
          p.stretch = 1 + 0.18 * ext; p.headX = 14 * ext; p.headY = 6 * ext; p.mouth = 0.8 * ext; p.earsBack = 1;
          p.crouch = 0.3 * ext;
        }
        break;
      case 'super':
        if (isA) { // hurlement
          p.headTilt = -1.05 * ext; p.mouth = ext; p.tilt = -0.3 * ext; p.headY = -6 * ext; p.eyes = 'closed';
          p.legs = [0.3, 0.2, -0.2, -0.15]; p.tailWag = 0.4; p.tailSpeed = 0.9;
        } else {
          const gal = f.anim * 1.1;
          p.legs = [1.1 + Math.sin(gal) * 0.4, 0.9 + Math.sin(gal + 1) * 0.4, -1.1 + Math.sin(gal + 2) * 0.4, -0.9 + Math.sin(gal + 3) * 0.4];
          p.stretch = 1 + 0.2 * ext; p.headX = 16 * ext; p.mouth = Math.abs(Math.sin(f.anim * 0.8)); p.earsBack = 1;
          p.crouch = 0.25;
        }
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Dessin d'un chien (repère local : pattes à l'origine, tourné vers la droite)
  // ---------------------------------------------------------------------------
  function ellipse(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU);
    ctx.fill();
  }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0.1, r), 0, TAU); ctx.fill(); }

  function drawLeg(ctx, x, y, angle, len, w, colTop, colLow, pawCol) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(-angle);
    ctx.fillStyle = colTop;
    roundRect(ctx, -w / 2, -w * 0.4, w, len + w * 0.4, w / 2);
    ctx.fill();
    if (colLow !== colTop) {
      ctx.fillStyle = colLow;
      roundRect(ctx, -w / 2 + 0.5, len * 0.55, w - 1, len * 0.45, w / 2.2);
      ctx.fill();
    }
    ctx.fillStyle = pawCol;
    ellipse(ctx, w * 0.22, len - w * 0.12, w * 0.68, w * 0.42);
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawEye(ctx, x, y, r, style, P) {
    ctx.save();
    ctx.lineCap = 'round';
    switch (style) {
      case 'x':
        ctx.strokeStyle = P.eye; ctx.lineWidth = r * 0.5;
        ctx.beginPath();
        ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
        ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
        ctx.stroke();
        break;
      case 'closed':
      case 'happy':
        ctx.strokeStyle = P.eye; ctx.lineWidth = r * 0.5;
        ctx.beginPath();
        if (style === 'happy') ctx.arc(x, y + r * 0.4, r, Math.PI * 1.15, Math.PI * 1.85);
        else ctx.arc(x, y - r * 0.3, r, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        break;
      case 'hurt':
        ctx.strokeStyle = P.eye; ctx.lineWidth = r * 0.5;
        ctx.beginPath();
        ctx.moveTo(x - r, y - r * 0.6); ctx.lineTo(x + r * 0.8, y); ctx.lineTo(x - r, y + r * 0.6);
        ctx.stroke();
        break;
      default:
        ctx.fillStyle = P.eye;
        ellipse(ctx, x, y, r * 0.85, r);
        ctx.fillStyle = '#fff';
        circle(ctx, x + r * 0.3, y - r * 0.35, r * 0.32);
        if (style === 'angry') {
          ctx.strokeStyle = P.eye; ctx.lineWidth = r * 0.45;
          ctx.beginPath();
          ctx.moveTo(x - r * 1.3, y - r * 1.7); ctx.lineTo(x + r * 1.1, y - r * 0.9);
          ctx.stroke();
        }
    }
    ctx.restore();
  }

  function drawTail(ctx, B, P, bodyCY, pose, time) {
    const baseX = -B.bodyW * 0.44, baseY = bodyCY - B.bodyH * 0.2;
    const wag = Math.sin(time * pose.tailSpeed * 2) * pose.tailWag;
    ctx.save();
    ctx.translate(baseX, baseY);
    ctx.rotate(wag * 0.6);
    ctx.lineCap = 'round';
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
        const bx = bez(0, -w * 0.28, -w * 0.05, w * 0.28, a);
        const by = bez(0, -h * 0.7, -h * 1.25, -h * 0.95, a);
        circle(ctx, bx - 4, by - 8, 9);
      }
      ctx.strokeStyle = P.light;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(-w * 0.08, -h * 0.5);
      ctx.bezierCurveTo(-w * 0.18, -h * 0.85, 0, -h * 1.1, w * 0.24, -h * 0.92);
      ctx.stroke();
    } else {
      ctx.strokeStyle = P.main;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-B.bodyW * 0.22, -B.bodyH * 0.4, -B.bodyW * 0.2, -B.bodyH * 1.15);
      ctx.stroke();
    }
    ctx.restore();
  }

  function bez(a, b, c, d, t) {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  }

  function drawHead(ctx, B, P, pose, charId) {
    const R = B.headR;
    const earBack = pose.earsBack;
    // Oreille éloignée
    ctx.fillStyle = P.shade;
    drawEar(ctx, B, -R * 0.38, -R * 0.62, earBack, true);
    // Tête
    ctx.fillStyle = P.main;
    circle(ctx, 0, 0, R);
    if (B.fluffy) {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * 0.55 + i * 0.32;
        circle(ctx, Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92, R * 0.28);
      }
    }
    // Joues / masque
    ctx.fillStyle = P.muzzle;
    if (charId === 'ainu') ellipse(ctx, R * 0.42, R * 0.38, R * 0.62, R * 0.45);
    else ellipse(ctx, R * 0.5, R * 0.42, R * 0.5, R * 0.36);
    // Mâchoire inférieure + intérieur de la gueule
    const jawPivotX = R * 0.45, jawPivotY = R * 0.38;
    const mouth = pose.mouth;
    if (mouth > 0.05) {
      ctx.save();
      ctx.translate(jawPivotX, jawPivotY);
      ctx.fillStyle = '#5a0f12';
      ctx.beginPath();
      ctx.moveTo(0, -2);
      ctx.lineTo(B.muzzleL * 1.25 + R * 0.25, -2);
      ctx.lineTo(Math.cos(mouth * 0.6) * (B.muzzleL + R * 0.2), Math.sin(mouth * 0.6) * (B.muzzleL + R * 0.2));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(jawPivotX, jawPivotY);
    ctx.rotate(mouth * 0.6);
    ctx.fillStyle = P.muzzle;
    ellipse(ctx, B.muzzleL * 0.55 + R * 0.1, B.muzzleH * 0.18, B.muzzleL * 0.62, B.muzzleH * 0.36);
    if (pose.tongue && mouth > 0.1) {
      ctx.fillStyle = '#ff7a8a';
      ellipse(ctx, B.muzzleL * 0.75 + R * 0.1, B.muzzleH * 0.05 + mouth * 4, B.muzzleL * 0.3, B.muzzleH * 0.3);
    }
    if (mouth > 0.3) {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 2; i++) {
        const tx = B.muzzleL * (0.5 + i * 0.5) + R * 0.1;
        ctx.beginPath(); ctx.moveTo(tx - 3, 0); ctx.lineTo(tx + 3, 0); ctx.lineTo(tx, -5); ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
    // Museau supérieur
    ctx.fillStyle = P.muzzle;
    ellipse(ctx, R * 0.55 + B.muzzleL * 0.45, R * 0.16, B.muzzleL * 0.8, B.muzzleH * 0.55);
    if (mouth > 0.3) {
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) {
        const tx = R * 0.6 + B.muzzleL * (0.35 + i * 0.4);
        const ty = R * 0.16 + B.muzzleH * 0.48;
        ctx.beginPath(); ctx.moveTo(tx - 3, ty - 2); ctx.lineTo(tx + 3, ty - 2); ctx.lineTo(tx, ty + 5); ctx.closePath(); ctx.fill();
      }
    }
    // Truffe
    ctx.fillStyle = P.nose;
    ellipse(ctx, R * 0.55 + B.muzzleL * 1.18, R * 0.05, 6, 4.8);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    circle(ctx, R * 0.55 + B.muzzleL * 1.18 + 1.5, R * 0.05 - 2, 1.6);
    // Sourcils (taches feu du pinscher)
    if (charId === 'matcha') {
      ctx.fillStyle = P.light;
      ellipse(ctx, R * 0.32, -R * 0.42, R * 0.17, R * 0.12);
    }
    // Œil
    drawEye(ctx, R * 0.36, -R * 0.1, R * 0.15, pose.eyes, P);
    // Oreille proche
    ctx.fillStyle = P.main;
    drawEar(ctx, B, -R * 0.12, -R * 0.68, earBack, false, P);
  }

  function drawEar(ctx, B, x, y, back, far, P) {
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
    if (!far && P) {
      ctx.fillStyle = P.inner;
      ctx.beginPath();
      if (B.round) {
        ctx.moveTo(-w * 0.25, 2);
        ctx.quadraticCurveTo(-w * 0.15, -h * 0.6, 0, -h * 0.68);
        ctx.quadraticCurveTo(w * 0.2, -h * 0.6, w * 0.25, 2);
      } else {
        ctx.moveTo(-w * 0.22, 2);
        ctx.lineTo(-w * 0.04, -h * 0.72);
        ctx.lineTo(w * 0.25, 2);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDogLocal(ctx, charId, P, pose, time) {
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

    // Patte arrière éloignée
    drawLeg(ctx, backX + 6, hipY, pose.legs[3], legTotal, B.legW, P.shade, P.shade, P.shade);

    ctx.save();
    ctx.translate(backX, hipY);
    ctx.rotate(pose.tilt);
    ctx.translate(-backX, -hipY);

    // Patte avant éloignée
    drawLeg(ctx, frontX + 6, hipY, pose.legs[1], legTotal, B.legW, P.shade, P.shade, P.shade);
    // Queue
    drawTail(ctx, B, P, bodyCY, pose, time);
    // Cou (pinscher élancé)
    const headX = B.bodyW * 0.47 + pose.headX;
    const headY = bodyCY - B.bodyH * 0.45 - B.headR * (B.neck ? 0.95 : 0.5) + pose.headY;
    if (B.neck) {
      ctx.strokeStyle = P.main;
      ctx.lineCap = 'round';
      ctx.lineWidth = B.headR * 1.15;
      ctx.beginPath();
      ctx.moveTo(B.bodyW * 0.28, bodyCY - B.bodyH * 0.05);
      ctx.lineTo(headX - B.headR * 0.2, headY + B.headR * 0.3);
      ctx.stroke();
    }
    // Corps
    ctx.fillStyle = P.main;
    ellipse(ctx, 0, bodyCY, B.bodyW / 2, B.bodyH / 2);
    if (B.fluffy) {
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * 1.05 + i * (Math.PI * 0.9 / 8);
        circle(ctx, Math.cos(a) * B.bodyW * 0.47, bodyCY + Math.sin(a) * B.bodyH * 0.45, 9);
      }
      circle(ctx, -B.bodyW * 0.4, bodyCY + B.bodyH * 0.12, 15); // culotte
    }
    // Ventre
    ctx.fillStyle = P.belly;
    if (charId === 'ainu') ellipse(ctx, B.bodyW * 0.04, bodyCY + B.bodyH * 0.28, B.bodyW * 0.36, B.bodyH * 0.22);
    // Collerette / poitrail
    if (charId === 'ainu') {
      ctx.fillStyle = P.main;
      circle(ctx, B.bodyW * 0.36, bodyCY - B.bodyH * 0.12, 27);
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI * 0.2 + i * 0.45;
        circle(ctx, B.bodyW * 0.36 + Math.cos(a) * 24, bodyCY - B.bodyH * 0.12 + Math.sin(a) * 24, 9);
      }
      ctx.fillStyle = P.light;
      ellipse(ctx, B.bodyW * 0.44, bodyCY + B.bodyH * 0.12, 15, 20);
      // Bandana
      ctx.fillStyle = P.accent;
      ctx.beginPath();
      ctx.moveTo(B.bodyW * 0.22, bodyCY - B.bodyH * 0.32);
      ctx.lineTo(B.bodyW * 0.62, bodyCY - B.bodyH * 0.38);
      ctx.lineTo(B.bodyW * 0.48, bodyCY + B.bodyH * 0.12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = P.accent2;
      circle(ctx, B.bodyW * 0.42, bodyCY - B.bodyH * 0.22, 2.2);
      circle(ctx, B.bodyW * 0.5, bodyCY - B.bodyH * 0.12, 2.2);
      circle(ctx, B.bodyW * 0.47, bodyCY - B.bodyH * 0.0, 2);
      circle(ctx, B.bodyW * 0.36, bodyCY - B.bodyH * 0.3, 2);
    } else {
      ctx.fillStyle = P.light;
      ellipse(ctx, B.bodyW * 0.4, bodyCY + B.bodyH * 0.05, 11, 13);
      // Collier vert matcha
      ctx.strokeStyle = P.accent;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      const nx = (B.bodyW * 0.28 + headX - B.headR * 0.2) / 2;
      const ny = (bodyCY - B.bodyH * 0.05 + headY + B.headR * 0.3) / 2;
      ctx.moveTo(nx - 10, ny - 9);
      ctx.lineTo(nx + 10, ny + 9);
      ctx.stroke();
      ctx.fillStyle = '#ffd34d';
      circle(ctx, nx + 8, ny + 13, 4);
    }
    // Patte avant proche
    drawLeg(ctx, frontX, hipY, pose.legs[0], legTotal, B.legW, P.main, P.legLow, P.legLow);
    // Tête
    ctx.save();
    ctx.translate(headX, headY);
    ctx.rotate(pose.headTilt);
    drawHead(ctx, B, P, pose, charId);
    ctx.restore();

    ctx.restore(); // tilt

    // Patte arrière proche
    if (B.fluffy) {
      ctx.fillStyle = P.main;
      circle(ctx, backX - 2, hipY - 2, 16);
    }
    drawLeg(ctx, backX, hipY, pose.legs[2], legTotal, B.legW + 1, P.main, P.legLow, P.legLow);

    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Toile hors-écran pour le contour (silhouette) et les flashs
  // ---------------------------------------------------------------------------
  const OFF_W = 380, OFF_H = 330, OX = 190, OY = 275;
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  const offDog = makeCanvas(OFF_W, OFF_H);
  const offSil = makeCanvas(OFF_W, OFF_H);
  const offFlash = makeCanvas(OFF_W, OFF_H);
  const dctx = offDog.getContext('2d');
  const sctx = offSil.getContext('2d');
  const fctx = offFlash.getContext('2d');

  function renderDogToOff(charId, alt, pose, facing, time) {
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    dctx.clearRect(0, 0, OFF_W, OFF_H);
    dctx.translate(OX, OY);
    dctx.scale(facing, 1);
    drawDogLocal(dctx, charId, paletteFor(charId, alt), pose, time);
    dctx.setTransform(1, 0, 0, 1, 0, 0);
    // Silhouette
    sctx.globalCompositeOperation = 'source-over';
    sctx.clearRect(0, 0, OFF_W, OFF_H);
    sctx.drawImage(offDog, 0, 0);
    sctx.globalCompositeOperation = 'source-in';
    sctx.fillStyle = paletteFor(charId, alt).outline;
    sctx.fillRect(0, 0, OFF_W, OFF_H);
    sctx.globalCompositeOperation = 'source-over';
  }

  function blitDog(ctx, x, yScreen, opts) {
    opts = opts || {};
    const dx = Math.round(x - OX), dy = Math.round(yScreen - OY);
    ctx.save();
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    if (!opts.noOutline) {
      const r = opts.outline || 3;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        ctx.drawImage(offSil, dx + Math.cos(a) * r, dy + Math.sin(a) * r);
      }
    }
    if (opts.glow) {
      ctx.shadowColor = opts.glow;
      ctx.shadowBlur = 25;
    }
    ctx.drawImage(offDog, dx, dy);
    ctx.shadowBlur = 0;
    if (opts.flash) {
      fctx.globalCompositeOperation = 'source-over';
      fctx.clearRect(0, 0, OFF_W, OFF_H);
      fctx.drawImage(offDog, 0, 0);
      fctx.globalCompositeOperation = 'source-in';
      fctx.fillStyle = opts.flashColor || '#ffffff';
      fctx.fillRect(0, 0, OFF_W, OFF_H);
      ctx.globalAlpha = (opts.alpha !== undefined ? opts.alpha : 1) * opts.flash;
      ctx.drawImage(offFlash, dx, dy);
    }
    ctx.restore();
  }

  // Dessine un chien « vitrine » (menus, sélection)
  function drawDogPreview(ctx, charId, alt, x, y, scale, facing, time, poseName) {
    const fake = { char: charId, state: poseName || 'idle', anim: time, vx: 0, vy: 0, facing, frame: 0, st: 0, crouch: false, onGround: true };
    if (poseName === 'walk') fake.vx = facing;
    const pose = computePose(fake);
    renderDogToOff(charId, alt, pose, facing, time);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    blitDog(ctx, 0, 0, {});
    ctx.restore();
  }

  function headCrop(charId) {
    const B = BUILD[charId];
    const cy = B.legLen + B.bodyH * 0.5;
    const hx = B.bodyW * 0.47 + B.headR * 0.35;
    const hy = -cy - B.bodyH * 0.45 - B.headR * (B.neck ? 0.95 : 0.5) - B.earH * 0.2;
    const size = B.headR * 3.0 + B.earH * 0.5;
    return { x: OX + hx - size / 2, y: OY + hy - size / 2, size };
  }

  function drawPortrait(ctx, charId, alt, x, y, size, facing, mood) {
    const pose = basePose();
    pose.mouth = mood === 'hurt' ? 0.4 : 0.2;
    pose.tongue = mood !== 'hurt';
    pose.eyes = mood === 'hurt' ? 'hurt' : mood === 'ko' ? 'x' : 'normal';
    renderDogToOff(charId, alt, pose, 1, 0);
    const c = headCrop(charId);
    ctx.save();
    ctx.translate(x + size / 2, y + size / 2);
    ctx.scale(facing, 1);
    ctx.drawImage(offDog, c.x, c.y, c.size, c.size, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Décor : « Parc des Toutous » au coucher du soleil (pré-rendu)
  // ---------------------------------------------------------------------------
  let stageCanvas = null;
  function buildStage() {
    const c = makeCanvas(STAGE_W, STAGE_H);
    const g = c.getContext('2d');
    // Ciel
    const sky = g.createLinearGradient(0, 0, 0, GROUND_Y);
    sky.addColorStop(0, '#3b2a6b');
    sky.addColorStop(0.45, '#c9587a');
    sky.addColorStop(0.8, '#f6a85a');
    sky.addColorStop(1, '#ffd38a');
    g.fillStyle = sky;
    g.fillRect(0, 0, STAGE_W, GROUND_Y);
    // Étoiles
    g.fillStyle = 'rgba(255,255,255,0.7)';
    let seed = 7;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) circle(g, rnd() * STAGE_W, rnd() * 140, rnd() * 1.4 + 0.3);
    // Soleil
    const sun = g.createRadialGradient(480, 300, 10, 480, 300, 140);
    sun.addColorStop(0, 'rgba(255,240,180,1)');
    sun.addColorStop(0.35, 'rgba(255,200,120,0.9)');
    sun.addColorStop(1, 'rgba(255,160,90,0)');
    g.fillStyle = sun;
    g.fillRect(300, 150, 360, 300);
    g.fillStyle = '#fff1c4';
    circle(g, 480, 300, 52);
    // Collines lointaines
    g.fillStyle = '#9a4f78';
    hills(g, 330, 40, 0.004, 1.3);
    g.fillStyle = '#6e3a68';
    hills(g, 365, 30, 0.007, 2.1);
    // Arbres
    for (let i = 0; i < 9; i++) {
      const tx = 30 + i * 115 + (i % 2) * 30;
      if (tx > 380 && tx < 580) continue;
      tree(g, tx, 400, 0.8 + (i % 3) * 0.15);
    }
    // Clôture
    g.fillStyle = '#5b2f3a';
    g.fillRect(0, 392, STAGE_W, 7);
    g.fillRect(0, 414, STAGE_W, 7);
    for (let x = 6; x < STAGE_W; x += 34) {
      g.fillStyle = '#6b3844';
      roundRect(g, x, 378, 16, 62, 4);
      g.fill();
      g.fillStyle = '#7d4552';
      g.beginPath(); g.moveTo(x, 382); g.lineTo(x + 8, 372); g.lineTo(x + 16, 382); g.closePath(); g.fill();
    }
    // Public canin derrière la clôture
    const colors = ['#3e2a2a', '#5a3b2a', '#2e2525', '#6a4a35', '#463232'];
    for (let i = 0; i < 26; i++) {
      const x = 20 + i * 36 + (rnd() * 12 - 6);
      const y = 382 + rnd() * 10;
      const col = colors[i % colors.length];
      g.fillStyle = col;
      circle(g, x, y, 13);
      const pointy = rnd() > 0.5;
      g.beginPath();
      if (pointy) {
        g.moveTo(x - 11, y - 4); g.lineTo(x - 8, y - 22); g.lineTo(x - 2, y - 9);
        g.moveTo(x + 11, y - 4); g.lineTo(x + 8, y - 22); g.lineTo(x + 2, y - 9);
      } else {
        g.ellipse(x - 12, y - 2, 5, 10, 0.3, 0, TAU);
        g.ellipse(x + 12, y - 2, 5, 10, -0.3, 0, TAU);
      }
      g.fill();
      g.fillStyle = 'rgba(255,230,190,0.85)';
      circle(g, x - 4, y - 2, 1.8);
      circle(g, x + 4, y - 2, 1.8);
    }
    // Sol
    const grass = g.createLinearGradient(0, 430, 0, STAGE_H);
    grass.addColorStop(0, '#5e8c3a');
    grass.addColorStop(1, '#3b6127');
    g.fillStyle = grass;
    g.fillRect(0, 430, STAGE_W, STAGE_H - 430);
    // Arène en terre battue
    const dirt = g.createLinearGradient(0, GROUND_Y - 22, 0, STAGE_H);
    dirt.addColorStop(0, '#c89160');
    dirt.addColorStop(1, '#8a5a35');
    g.fillStyle = dirt;
    g.beginPath();
    g.moveTo(0, GROUND_Y - 14);
    g.lineTo(STAGE_W, GROUND_Y - 14);
    g.lineTo(STAGE_W, STAGE_H);
    g.lineTo(0, STAGE_H);
    g.closePath();
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(STAGE_W / 2, GROUND_Y + 20, 120, 22, 0, 0, TAU);
    g.stroke();
    g.beginPath(); g.moveTo(STAGE_W / 2, GROUND_Y - 10); g.lineTo(STAGE_W / 2, STAGE_H); g.stroke();
    // Touffes d'herbe
    g.fillStyle = '#4f7a30';
    for (let i = 0; i < 60; i++) {
      const x = rnd() * STAGE_W;
      const y = GROUND_Y - 16 + rnd() * 4;
      g.beginPath(); g.moveTo(x - 4, y + 4); g.lineTo(x, y - 6); g.lineTo(x + 4, y + 4); g.fill();
    }
    // Petits cailloux
    g.fillStyle = 'rgba(90,55,30,0.5)';
    for (let i = 0; i < 50; i++) ellipse(g, rnd() * STAGE_W, GROUND_Y + rnd() * 70, 2 + rnd() * 3, 1 + rnd() * 2);
    // Bouche d'incendie et os
    hydrant(g, 52, GROUND_Y - 12);
    bone(g, 880, GROUND_Y + 30, 0.4);
    bone(g, 140, GROUND_Y + 50, -0.3);
    stageCanvas = c;
  }

  function hills(g, base, amp, freq, phase) {
    g.beginPath();
    g.moveTo(0, GROUND_Y);
    for (let x = 0; x <= STAGE_W; x += 8) {
      g.lineTo(x, base - Math.sin(x * freq + phase) * amp - Math.sin(x * freq * 2.7 + phase * 3) * amp * 0.4);
    }
    g.lineTo(STAGE_W, GROUND_Y);
    g.closePath();
    g.fill();
  }

  function tree(g, x, y, s) {
    g.fillStyle = '#3d2233';
    g.fillRect(x - 5 * s, y - 70 * s, 10 * s, 70 * s);
    g.fillStyle = '#4a2a48';
    circle(g, x, y - 90 * s, 34 * s);
    circle(g, x - 24 * s, y - 72 * s, 26 * s);
    circle(g, x + 24 * s, y - 74 * s, 26 * s);
    g.fillStyle = 'rgba(255,170,120,0.18)';
    circle(g, x + 10 * s, y - 100 * s, 18 * s);
  }

  function hydrant(g, x, y) {
    g.fillStyle = '#c7322f';
    roundRect(g, x - 12, y - 46, 24, 46, 5); g.fill();
    g.fillStyle = '#a82522';
    roundRect(g, x - 18, y - 32, 36, 8, 3); g.fill();
    g.fillStyle = '#d94541';
    g.beginPath(); g.arc(x, y - 46, 12, Math.PI, 0); g.fill();
    g.fillStyle = '#ffd34d';
    circle(g, x, y - 60, 3);
  }

  function bone(g, x, y, rot) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = '#f5ecd8';
    roundRect(g, -16, -4, 32, 8, 4); g.fill();
    circle(g, -16, -4, 5); circle(g, -16, 4, 5); circle(g, 16, -4, 5); circle(g, 16, 4, 5);
    g.restore();
  }

  // ---------------------------------------------------------------------------
  // Particules et effets
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
    }

    clear() {
      this.parts = [];
      this.shake = 0;
      this.flash = 0;
      this.banners = [];
      this.trails = [[], []];
      this.comboShow = [{ n: 0, t: 0 }, { n: 0, t: 0 }];
    }

    burst(x, y, n, opts) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const sp = (opts.speed || 6) * (0.4 + Math.random() * 0.8);
        this.parts.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opts.up || 0),
          life: opts.life || 20, max: opts.life || 20, size: opts.size || 4,
          color: opts.colors ? opts.colors[i % opts.colors.length] : '#fff',
          type: opts.type || 'spark', grav: opts.grav || 0, rot: Math.random() * TAU,
        });
      }
    }

    ring(x, y, color, r) {
      this.parts.push({ x, y, vx: 0, vy: 0, life: 14, max: 14, size: r || 40, color, type: 'ring' });
    }

    banner(text, sub, color, life) {
      this.banners.push({ text, sub, color: color || '#ffd34d', life: life || 90, max: life || 90 });
    }

    handleEvents(events, snap, names, sfx) {
      for (const e of events) {
        switch (e.type) {
          case 'hit': {
            const sy = GROUND_Y - e.y;
            const heavy = e.heavy;
            this.burst(e.x, sy, heavy ? 22 : 12, { colors: ['#fff6b0', '#ffd34d', '#ff8a3d', '#ffffff'], speed: heavy ? 9 : 6, life: heavy ? 22 : 15, size: heavy ? 6 : 4, type: 'spark' });
            this.burst(e.x, sy, heavy ? 8 : 4, { colors: ['#d0662a', '#f7e1bd', '#221c1c'], speed: 4, life: 40, size: 5, type: 'fur', grav: 0.15 });
            this.ring(e.x, sy, heavy ? '#ffd34d' : '#ffffff', heavy ? 60 : 36);
            this.shake = Math.max(this.shake, heavy ? 10 : 4);
            this.hitFlash[e.slot] = 6;
            if (e.combo >= 2) this.comboShow[1 - e.slot] = { n: e.combo, t: 90 };
            sfx && sfx.hit(heavy);
            break;
          }
          case 'block': {
            const sy = GROUND_Y - e.y;
            this.burst(e.x, sy, 10, { colors: ['#9fdcff', '#ffffff', '#4aa8ff'], speed: 5, life: 14, size: 3 });
            this.ring(e.x, sy, '#7fd0ff', 30);
            this.shake = Math.max(this.shake, 2);
            sfx && sfx.block();
            break;
          }
          case 'clash':
            this.burst(e.x, GROUND_Y - e.y, 18, { colors: ['#ffffff', '#ffd34d'], speed: 8, life: 18, size: 4 });
            this.ring(e.x, GROUND_Y - e.y, '#ffffff', 50);
            sfx && sfx.block();
            break;
          case 'land':
            this.burst(e.x, GROUND_Y - 2, 6, { colors: ['rgba(200,160,110,0.8)'], speed: 2.5, life: 22, size: 6, type: 'dust', up: 1 });
            break;
          case 'thud':
            this.burst(e.x, GROUND_Y - 4, 14, { colors: ['rgba(200,160,110,0.85)'], speed: 4, life: 30, size: 9, type: 'dust', up: 1.5 });
            this.shake = Math.max(this.shake, 6);
            sfx && sfx.thud();
            break;
          case 'jump':
            sfx && sfx.jump();
            break;
          case 'swing':
            sfx && sfx.swing(e.heavy);
            break;
          case 'special':
            sfx && sfx.bark(snap.fighters[e.slot].char);
            break;
          case 'super': {
            const f = snap.fighters[e.slot];
            this.flash = 1;
            this.banner(e.name.toUpperCase(), 'SUPER !', '#ffd34d', 70);
            this.burst(f.x, GROUND_Y - f.y - 60, 30, { colors: ['#ffd34d', '#ffffff', '#ff8a3d'], speed: 10, life: 30, size: 5 });
            sfx && sfx.superMove(f.char);
            break;
          }
          case 'round':
            sfx && sfx.announce('round');
            break;
          case 'fight':
            sfx && sfx.announce('fight');
            break;
          case 'ko':
            this.flash = 1;
            this.shake = 18;
            sfx && sfx.ko();
            break;
          case 'timeover':
            sfx && sfx.announce('time');
            break;
          case 'matchover':
            sfx && sfx.win();
            break;
        }
      }
    }

    update() {
      for (const p of this.parts) {
        p.x += p.vx; p.y += p.vy;
        p.vy += p.grav || 0;
        if (p.type === 'spark') { p.vx *= 0.88; p.vy *= 0.88; }
        if (p.type === 'dust') { p.vx *= 0.92; p.vy *= 0.92; p.size *= 1.02; }
        p.rot += 0.2;
        p.life--;
      }
      this.parts = this.parts.filter(p => p.life > 0);
      this.shake *= 0.85;
      if (this.shake < 0.3) this.shake = 0;
      this.flash *= 0.88;
      if (this.flash < 0.02) this.flash = 0;
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
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 1.5);
        if (p.type === 'ring') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 5 * k;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.2 - k), 0, TAU);
          ctx.stroke();
        } else if (p.type === 'spark') {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size * k + 1;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 2.5, p.y - p.vy * 2.5);
          ctx.stroke();
        } else if (p.type === 'fur') {
          ctx.fillStyle = p.color;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ellipse(ctx, 0, 0, p.size, p.size * 0.35);
        } else if (p.type === 'star') {
          ctx.fillStyle = p.color;
          star(ctx, p.x, p.y, p.size, p.rot);
        } else {
          ctx.fillStyle = p.color;
          circle(ctx, p.x, p.y, p.size * (0.5 + (1 - k)));
        }
        ctx.restore();
      }
    }
  }

  function star(ctx, x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + (i / 10) * TAU;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // Projectiles
  // ---------------------------------------------------------------------------
  function drawProjectile(ctx, p, fx, time) {
    const cx = p.x, cy = GROUND_Y - p.y - p.h / 2;
    const dir = Math.sign(p.vx) || 1;
    if (p.kind === 'furball') {
      if (fx && time % 2 === 0) {
        fx.parts.push({ x: cx - dir * 18, y: cy + (Math.random() - 0.5) * 20, vx: -dir * 1.5, vy: (Math.random() - 0.5), life: 18, max: 18, size: 6, color: Math.random() < 0.5 ? '#d0662a' : '#f7e1bd', type: 'fur', rot: Math.random() * TAU });
      }
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(p.age * 0.3 * dir);
      ctx.fillStyle = '#2a1206';
      circle(ctx, 0, 0, 25);
      ctx.fillStyle = '#d0662a';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        circle(ctx, Math.cos(a) * 15, Math.sin(a) * 15, 9);
      }
      circle(ctx, 0, 0, 17);
      ctx.strokeStyle = '#f7e1bd';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 1.3);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 4, Math.PI, Math.PI * 2.2);
      ctx.stroke();
      ctx.restore();
    } else if (p.kind === 'howl') {
      ctx.save();
      ctx.translate(cx, cy);
      for (let i = 0; i < 4; i++) {
        const k = ((p.age * 0.08 + i * 0.25) % 1);
        ctx.strokeStyle = i % 2 ? 'rgba(255,211,77,' + (1 - k) + ')' : 'rgba(255,255,255,' + (1 - k) * 0.9 + ')';
        ctx.lineWidth = 10 - i * 1.5;
        ctx.beginPath();
        const r = 30 + k * 50;
        ctx.ellipse(-dir * (40 - k * 40), 0, r * 0.5, r * 1.2, 0, dir > 0 ? -Math.PI / 2 : Math.PI / 2, dir > 0 ? Math.PI / 2 : Math.PI * 1.5);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,170,90,0.25)';
      ellipse(ctx, 0, 0, p.w * 0.55, p.h * 0.55);
      ctx.font = '16px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#7a2a00';
      ctx.lineWidth = 4;
      const wob = Math.sin(p.age * 0.5) * 4;
      ctx.strokeText('AOUUU!', 0, -p.h * 0.55 + wob);
      ctx.fillText('AOUUU!', 0, -p.h * 0.55 + wob);
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Interface de combat
  // ---------------------------------------------------------------------------
  const FONT = '"Press Start 2P", monospace';

  function textOutlined(ctx, text, x, y, size, fill, stroke, align, lw) {
    ctx.font = size + 'px ' + FONT;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = stroke || '#1a0d20';
    ctx.lineWidth = lw || Math.max(3, size * 0.28);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill || '#fff';
    ctx.fillText(text, x, y);
  }

  function drawHud(ctx, snap, names, fx, alts, extra) {
    const barW = 340, barH = 22, top = 30;
    for (let i = 0; i < 2; i++) {
      const f = snap.fighters[i];
      const ch = CHARACTERS[f.char];
      const ratio = Math.max(0, f.hp / ch.maxHp);
      if (fx.ghostHp[i] === null || fx.ghostHp[i] < ratio) fx.ghostHp[i] = ratio;
      if (snap.hitstop === 0) fx.ghostHp[i] += (ratio - fx.ghostHp[i]) * 0.06;
      const x0 = i === 0 ? 90 : STAGE_W - 90 - barW;
      // Cadre
      ctx.fillStyle = '#1a0d20';
      roundRect(ctx, x0 - 4, top - 4, barW + 8, barH + 8, 6);
      ctx.fill();
      ctx.fillStyle = '#4a1f2a';
      ctx.fillRect(x0, top, barW, barH);
      // Barre fantôme (dégâts récents)
      const gw = barW * fx.ghostHp[i];
      ctx.fillStyle = '#ff5a4a';
      if (i === 0) ctx.fillRect(x0 + barW - gw, top, gw, barH);
      else ctx.fillRect(x0, top, gw, barH);
      // Vie
      const w = barW * ratio;
      const grad = ctx.createLinearGradient(0, top, 0, top + barH);
      const low = ratio < 0.25;
      grad.addColorStop(0, low ? '#ff9a4a' : '#fff27a');
      grad.addColorStop(1, low ? '#e8562a' : '#f2b71f');
      ctx.fillStyle = grad;
      if (i === 0) ctx.fillRect(x0 + barW - w, top, w, barH);
      else ctx.fillRect(x0, top, w, barH);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      if (i === 0) ctx.fillRect(x0 + barW - w, top + 2, w, 4);
      else ctx.fillRect(x0, top + 2, w, 4);
      // Portrait
      const px = i === 0 ? 14 : STAGE_W - 14 - 68;
      ctx.fillStyle = '#1a0d20';
      roundRect(ctx, px - 3, 14, 74, 74, 12);
      ctx.fill();
      ctx.fillStyle = i === 0 ? '#3a6fd6' : '#d6453a';
      roundRect(ctx, px, 17, 68, 68, 10);
      ctx.fill();
      const mood = f.state === 'ko' ? 'ko' : (f.state === 'hitstun' || f.state === 'airhit') ? 'hurt' : 'ok';
      ctx.save();
      roundRect(ctx, px, 17, 68, 68, 10);
      ctx.clip();
      drawPortrait(ctx, f.char, alts[i], px - 4, 17, 76, i === 0 ? 1 : -1, mood);
      ctx.restore();
      // Nom
      const label = (names[i] || ch.name).toUpperCase();
      textOutlined(ctx, label, i === 0 ? x0 : x0 + barW, top + barH + 18, 12, '#fff', '#1a0d20', i === 0 ? 'left' : 'right');
      ctx.font = '8px ' + FONT;
      const sub = ch.name + ' · ' + ch.breed;
      textOutlined(ctx, names[i] && names[i] !== ch.name ? sub : ch.breed, i === 0 ? x0 : x0 + barW, top + barH + 36, 8, '#ffe3b0', '#1a0d20', i === 0 ? 'left' : 'right');
      // Manches gagnées (pattes)
      for (let k = 0; k < C.WINS_NEEDED; k++) {
        const wx = i === 0 ? x0 + barW - 14 - k * 26 : x0 + 14 + k * 26;
        const won = snap.wins[i] > k;
        drawPaw(ctx, wx, top + barH + 20, 9, won ? '#ffd34d' : 'rgba(0,0,0,0.45)', won ? '#7a4a00' : 'rgba(255,255,255,0.35)');
      }
      // Jauge de super
      const mW = 200, mH = 12, my = STAGE_H - 30;
      const mx = i === 0 ? 24 : STAGE_W - 24 - mW;
      const full = f.meter >= C.METER_MAX;
      ctx.fillStyle = '#1a0d20';
      roundRect(ctx, mx - 3, my - 3, mW + 6, mH + 6, 5);
      ctx.fill();
      ctx.fillStyle = '#2a2140';
      ctx.fillRect(mx, my, mW, mH);
      const mw = mW * Math.min(1, f.meter / C.METER_MAX);
      const pulse = full ? 0.6 + 0.4 * Math.sin(snap.f * 0.25) : 1;
      ctx.fillStyle = full ? `rgba(80,220,255,${pulse})` : '#3aa0ff';
      if (i === 0) ctx.fillRect(mx, my, mw, mH);
      else ctx.fillRect(mx + mW - mw, my, mw, mH);
      textOutlined(ctx, full ? 'SUPER PRÊT !' : 'SUPER', i === 0 ? mx : mx + mW, my - 12, 8, full ? '#7ff0ff' : '#cfe3ff', '#1a0d20', i === 0 ? 'left' : 'right');
      // Combo
      const cs = fx.comboShow[i];
      if (cs.t > 0 && cs.n >= 2) {
        const pop = 1 + Math.max(0, (cs.t - 80) / 10) * 0.4;
        ctx.save();
        ctx.globalAlpha = Math.min(1, cs.t / 20);
        const cx = i === 0 ? 120 : STAGE_W - 120;
        ctx.translate(cx, 170);
        ctx.scale(pop, pop);
        textOutlined(ctx, cs.n + ' COUPS', 0, 0, 18, '#ffd34d', '#5a1a00');
        textOutlined(ctx, 'COMBO !', 0, 26, 10, '#fff', '#5a1a00');
        ctx.restore();
      }
    }
    // Chrono
    ctx.fillStyle = '#1a0d20';
    roundRect(ctx, STAGE_W / 2 - 38, 16, 76, 54, 10);
    ctx.fill();
    ctx.fillStyle = '#3b2a6b';
    roundRect(ctx, STAGE_W / 2 - 34, 20, 68, 46, 8);
    ctx.fill();
    const tcol = snap.timer <= 10 ? (snap.f % 30 < 15 ? '#ff5a4a' : '#fff') : '#fff';
    textOutlined(ctx, String(snap.timer).padStart(2, '0'), STAGE_W / 2, 44, 24, tcol, '#1a0d20');
    if (extra && extra.ping !== undefined) {
      ctx.font = '8px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(extra.ping + ' ms', STAGE_W / 2, 82);
    }
  }

  function drawPaw(ctx, x, y, r, fill, stroke) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    const pads = [[0, 3, r * 0.75], [-r * 0.85, -r * 0.4, r * 0.35], [-r * 0.3, -r * 0.95, r * 0.35], [r * 0.3, -r * 0.95, r * 0.35], [r * 0.85, -r * 0.4, r * 0.35]];
    for (const [px, py, pr] of pads) {
      ctx.beginPath();
      ctx.arc(x + px, y + py, pr, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawAnnouncements(ctx, snap, names, fx) {
    const ph = snap.phase, t = snap.pt;
    const nameOf = (i) => (names[i] || CHARACTERS[snap.fighters[i].char].name);
    let big = null, sub = null, col = '#ffd34d';
    if (ph === 'intro') {
      if (t < 70) {
        const final = snap.wins[0] === C.WINS_NEEDED - 1 && snap.wins[1] === C.WINS_NEEDED - 1;
        big = final ? 'MANCHE FINALE' : 'MANCHE ' + snap.round;
      } else { big = 'COMBAT !'; col = '#ff6a3d'; }
    } else if (ph === 'fight' && t < 30) {
      big = 'COMBAT !'; col = '#ff6a3d';
    } else if (ph === 'ko') {
      if (t < 110) { big = snap.to ? 'TEMPS ÉCOULÉ !' : 'K.O. !'; col = snap.to ? '#ffd34d' : '#ff4a3a'; }
      else {
        big = snap.rw === -1 ? 'ÉGALITÉ !' : nameOf(snap.rw).toUpperCase() + ' GAGNE';
        sub = snap.rw === -1 ? '' : 'la manche !';
        col = '#ffd34d';
      }
    } else if (ph === 'matchover') {
      big = snap.mw === -1 ? 'MATCH NUL !' : nameOf(snap.mw).toUpperCase();
      sub = snap.mw === -1 ? '' : 'REMPORTE LE COMBAT !';
    }
    if (big) {
      let scale = 1;
      if (ph === 'intro') scale = 1 + Math.max(0, 1 - (t % 70) / 10) * 0.8;
      if (ph === 'ko' && t < 110 && !snap.to) scale = 1 + Math.max(0, 1 - t / 12) * 1.5;
      ctx.save();
      ctx.translate(STAGE_W / 2, ph === 'matchover' ? 190 : 230);
      ctx.scale(scale, scale);
      const size = big.length > 12 ? 30 : 44;
      textOutlined(ctx, big, 3, 4, size, 'rgba(0,0,0,0.4)', 'rgba(0,0,0,0)', 'center', 1);
      textOutlined(ctx, big, 0, 0, size, col, '#2a0a10', 'center', 10);
      if (sub) textOutlined(ctx, sub, 0, size * 0.95, 16, '#fff', '#2a0a10', 'center', 6);
      ctx.restore();
    }
    for (const b of fx.banners) {
      const k = b.life / b.max;
      const slide = Math.min(1, (b.max - b.life) / 8);
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.fillStyle = 'rgba(20,8,30,0.75)';
      ctx.fillRect(0, 120, STAGE_W, 62);
      ctx.fillStyle = b.color;
      ctx.fillRect(0, 120, STAGE_W, 3);
      ctx.fillRect(0, 179, STAGE_W, 3);
      textOutlined(ctx, b.sub, STAGE_W / 2 - 300 + slide * 300 - (1 - slide) * 200, 138, 12, '#7ff0ff', '#000');
      textOutlined(ctx, b.text, STAGE_W / 2, 162, 20, b.color, '#3a0a00');
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Rendu d'une image complète
  // ---------------------------------------------------------------------------
  function drawScene(ctx, snap, opts) {
    const fx = opts.fx;
    const names = opts.names || ['', ''];
    const alts = opts.alts || [false, false];
    if (!stageCanvas) buildStage();

    ctx.save();
    if (fx.shake > 0) ctx.translate((Math.random() - 0.5) * fx.shake, (Math.random() - 0.5) * fx.shake);
    ctx.drawImage(stageCanvas, 0, 0);

    const frozen = snap.freeze > 0;
    if (frozen) {
      ctx.fillStyle = `rgba(10,0,30,${Math.min(0.65, snap.freeze / 40 + 0.25)})`;
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    }

    // Ombres
    for (const f of snap.fighters) {
      const k = Math.max(0.35, 1 - f.y / 260);
      ctx.fillStyle = `rgba(40,15,10,${0.35 * k})`;
      ellipse(ctx, f.x, GROUND_Y + 2, 56 * k, 10 * k);
    }

    // Traînées (charges)
    for (let i = 0; i < 2; i++) {
      const f = snap.fighters[i];
      const tr = fx.trails[i];
      const dashing = f.state === 'attack' && (f.move === 'super' || (f.char === 'matcha' && f.move === 'special'));
      if (dashing && !opts.paused) tr.push({ x: f.x, y: f.y, pose: computePose(f), facing: f.facing, life: 10 });
      for (const g of tr) {
        renderDogToOff(f.char, alts[i], g.pose, g.facing, f.anim);
        blitDog(ctx, g.x, GROUND_Y - g.y, { alpha: (g.life / 10) * 0.35, noOutline: true, flash: 0.8, flashColor: f.char === 'matcha' ? '#8bc34a' : '#ffb15a' });
        if (!opts.paused) g.life--;
      }
      fx.trails[i] = tr.filter(g => g.life > 0);
    }

    // Combattants : celui qui attaque passe devant
    const order = [0, 1];
    const a0 = snap.fighters[0].state === 'attack', a1 = snap.fighters[1].state === 'attack';
    if (a0 && !a1) order.reverse();
    for (const i of order) {
      const f = snap.fighters[i];
      const pose = computePose(f);
      renderDogToOff(f.char, alts[i], pose, f.facing, f.anim);
      const blink = f.inv && f.state !== 'ko' && (snap.f % 6 < 3);
      const isSuper = frozen && snap.freezeOwner === i;
      blitDog(ctx, f.x, GROUND_Y - f.y, {
        alpha: blink ? 0.55 : 1,
        flash: fx.hitFlash[i] > 0 ? 0.75 : (isSuper ? 0.25 + 0.2 * Math.sin(snap.f) : 0),
        flashColor: isSuper ? '#ffd34d' : '#ffffff',
        glow: isSuper ? '#ffd34d' : null,
      });
      if (pose.shield) drawShield(ctx, f, snap.f);
      if (opts.debug) drawDebug(ctx, i, opts.game);
    }

    // Projectiles
    for (const p of snap.projectiles) drawProjectile(ctx, p, opts.paused ? null : fx, snap.f);

    fx.draw(ctx);
    ctx.restore();

    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${fx.flash * 0.7})`;
      ctx.fillRect(0, 0, STAGE_W, STAGE_H);
    }

    if (!opts.noHud) {
      drawHud(ctx, snap, names, fx, alts, opts.extra);
      drawAnnouncements(ctx, snap, names, fx);
    }
  }

  function drawShield(ctx, f, t) {
    const cx = f.x + f.facing * 50, cy = GROUND_Y - f.y - (f.crouch ? 35 : 55);
    ctx.save();
    ctx.strokeStyle = `rgba(127,208,255,${0.6 + 0.3 * Math.sin(t * 0.6)})`;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 16, f.crouch ? 34 : 50, 0, f.facing > 0 ? -Math.PI / 2 : Math.PI / 2, f.facing > 0 ? Math.PI / 2 : Math.PI * 1.5);
    ctx.stroke();
    ctx.restore();
  }

  function drawDebug(ctx, i, game) {
    if (!game) return;
    const real = game.fighters[i];
    const hb = game.hurtbox(real);
    ctx.strokeStyle = 'rgba(0,255,0,0.8)';
    ctx.strokeRect(hb.l, GROUND_Y - hb.b - hb.h, hb.w, hb.h);
    const ab = game.hitboxOf(real);
    if (ab) {
      ctx.strokeStyle = 'rgba(255,0,0,0.9)';
      ctx.strokeRect(ab.l, GROUND_Y - ab.b - ab.h, ab.w, ab.h);
    }
  }

  window.DogRender = {
    drawScene, drawDogPreview, drawPortrait, drawPaw, Effects, buildStage, textOutlined,
    PALETTES, BUILD, computePose,
  };
})();
