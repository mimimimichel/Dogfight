/*
 * Matcha & Ainu — le combat final contre la Capitaine Moustache, sur l'Île du
 * Trophée (niveau 4). Elle tourne au-dessus de l'île dans sa montgolfière, le
 * Trophée accroché sous la nacelle :
 *   1. elle lâche des pelotes de laine (une ombre rouge prévient où elles tombent) ;
 *   2. essoufflée, elle descend : la nacelle est basse, il faut sauter et faire
 *      la toupie dessus (ou lui retomber dessus) ;
 *   3. à chaque coup elle s'énerve : plus de pelotes, puis des vagues de laine
 *      qui roulent sur l'île et qu'il faut sauter.
 * Trois coups et la montgolfière se dégonfle : le Trophée est libre.
 */
import * as THREE from '../vendor/three.module.min.js';
import * as M from './models.js';
import { buildYarn } from './forest.js';
import { balloon } from './story.js';
import { Cinema } from './cinema.js';

const HP = 3;
const PHASES = ['wait', 'drop', 'ring', 'tired', 'hit', 'fall', 'done'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function buildSkyBoss(game, S, sky) {
  const sc = game.scene;
  const GI = S.ISLANDS.find(q => q.id === 'goal');
  const top = GI.top + 0.35, ORBIT = 7.2, HIGH = top + 8.5, LOW = top + 2.3;
  const ground = (x, z) => Math.max(S.heightAt(x, z), top - 1);

  // --- décor du combat ----------------------------------------------------------------
  const ship = balloon();
  const env = ship.children.find(o => o.geometry && o.geometry.type === 'SphereGeometry');
  const cap = ship.userData.cap;
  const basket = ship.children[1];
  if (basket && basket.material) basket.material = basket.material.clone();
  const trophy = M.buildMedal(); trophy.scale.setScalar(0.9); trophy.position.set(0, -0.9, 0); ship.add(trophy);
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 4), M.mat(0x3a2a1a)); rope.position.y = -0.45; ship.add(rope);
  const stars = [];
  for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), M.mat(0xffe050, { emissive: 0xffa000, emissiveIntensity: 0.8 })); s.visible = false; ship.add(s); stars.push(s); }
  ship.visible = false;
  sc.add(ship);
  const yarnMeshes = [], marks = [];
  const markMat = new THREE.MeshBasicMaterial({ color: 0xff3050, transparent: true, opacity: 0.5, depthWrite: false });
  for (let i = 0; i < 8; i++) {
    const y = buildYarn(); y.visible = false; sc.add(y); yarnMeshes.push(y);
    const m = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.35, 32), markMat.clone());
    m.rotation.x = -Math.PI / 2; m.visible = false; m.userData.noOutline = true; m.renderOrder = 2; sc.add(m); marks.push(m);
  }
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xff8ac0, emissive: 0xff3a8a, emissiveIntensity: 0.6, roughness: 0.8 });
  const ringMeshes = [0, 1].map(() => { const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.22, 8, 64), ringMat); r.rotation.x = Math.PI / 2; r.visible = false; sc.add(r); return r; });

  // --- état (simulé par l'hôte, recopié chez les amis) ---------------------------------
  const B = { ph: sky().boss ? 'done' : 'wait', hp: HP, t: 0, a: Math.PI / 2, x: GI.x, y: HIGH, z: GI.z + ORBIT, drops: 0, nextDrop: 1, yarns: [], rings: [], deflate: sky().boss ? 1 : 0, away: 0, told: {}, introDone: false, spin: 0 };
  const onIsland = (P) => !P.ko && Math.hypot(P.pos.x - GI.x, P.pos.z - GI.z) < GI.r + 0.5 && P.pos.y > top - 3;
  const fighters = () => game.players.filter(onIsland);
  const tell = (k, a, b, ms) => { if (B.told[k]) return; B.told[k] = true; game.banner(a, b, ms || 2600); };
  const hpLost = () => HP - B.hp;

  function setPhase(ph) { B.ph = ph; B.t = 0; }

  function start() {
    if (game.sfx) game.sfx.music('boss');
    const go = () => { setPhase('drop'); B.drops = 0; B.nextDrop = 1.2; game.updateHud(); tell('start', 'La Capitaine Moustache !', 'Évitez les pelotes : regardez les ombres rouges !'); };
    if (game.party.size > 1 || game.guest || B.introDone) { B.introDone = true; go(); return; }
    B.introDone = true;
    // petite scène d'entrée : la montgolfière surgit avec le Trophée
    const P = game.player;
    const shots = [
      { d: 4.5, from: [GI.x + 9, top + 3, GI.z + 9], to: [GI.x + 7, top + 4.5, GI.z + 6], look: [GI.x, top + 4, GI.z], lookTo: [GI.x, HIGH + 2, GI.z],
        say: { who: 'Capitaine Moustache', text: 'Halte-là, les cabots ! Le Trophée du Ciel est à MOI !' },
        update: (c, k) => { B.x = GI.x; B.z = GI.z; B.y = top - 6 + k * (HIGH - top + 6); ship.visible = true; } },
      { d: 4, from: [P.pos.x + 3.5, P.pos.y + 2.2, P.pos.z + 3.5], to: [P.pos.x + 2.8, P.pos.y + 2, P.pos.z + 2.8], look: [P.pos.x, P.pos.y + 1.4, P.pos.z],
        say: { who: 'Matcha', text: 'Attention aux pelotes ! Et quand sa nacelle descend… on saute dessus !' },
        update: (c) => { P.cheerT = 0.4 + c.t * 0.1; } },
    ];
    game.dialog = null;
    if (game.sfx && game.sfx.duck) game.sfx.duck(false, 'dialog');
    game.cine = new Cinema(game, shots, () => { game.cine = null; B.a = Math.atan2(GI.z + ORBIT - GI.z, 0); go(); });
  }

  function dropYarn(target) {
    const tx = clamp(target.x + (Math.random() - 0.5) * 1.6, GI.x - GI.r + 1, GI.x + GI.r - 1);
    const tz = clamp(target.z + (Math.random() - 0.5) * 1.6, GI.z - GI.r + 1, GI.z + GI.r - 1);
    const T = 1.25 - hpLost() * 0.12 + (game.easy ? 0.35 : 0);
    B.yarns.push({ sx: B.x, sy: B.y + 0.3, sz: B.z, tx, tz, ty: ground(tx, tz) + 0.45, t: 0, T });
  }

  function hitBoss(P) {
    B.hp--;
    game.sound('bossHit');
    game.burst(B.x, B.y + 1, B.z, 26, 0xffffff, 5, 0.7);
    game.burst(B.x, B.y + 1, B.z, 12, 0xff8ac0, 4, 0.6);
    P.vel.y = 11; P.grounded = false; P.jumps = 1;
    for (const Q of game.players) Q.cheerT = 0.6;
    B.yarns.length = 0; B.rings.length = 0;
    game.updateHud();
    if (B.hp <= 0) { setPhase('fall'); game.banner('PSCHIIIIT !', 'La montgolfière se dégonfle !', 2200); return; }
    setPhase('hit');
    game.banner(B.hp === 2 ? 'Touché !' : 'Encore touché !', B.hp === 2 ? 'Elle s\'énerve : encore 2 coups !' : 'Plus qu\'un coup ! Attention aux vagues de laine : sautez !', 2400);
  }

  function finish() {
    setPhase('done');
    const k = sky(); k.boss = true; game.persist();
    game.updateMedalVisibility();
    game.updateHud();
    if (game.sfx) game.sfx.music('adv4');
    game.sound('win');
    for (const P of game.players) P.cheerT = 1.6;
    game.burst(GI.x, top + 3, GI.z - 2, 40, 0xffe070, 6, 1.0);
    game.say([
      { who: 'Capitaine Moustache', text: 'Miaaaou… Ma belle montgolfière… Bon, bon. Vous avez gagné, les toutous.' },
      { who: 'Matcha', text: 'Le Trophée du Ciel ! Vite, Ainu, attrape-le !' },
    ]);
  }

  function step(dt) {
    if (B.ph === 'done') return;
    B.t += dt;
    const F = fighters();
    if (B.ph === 'wait') {
      if (F.length && !game.cine) start();
      return;
    }
    // tout le monde est tombé : elle remonte et attend (les coups déjà donnés restent)
    if (!F.length && B.ph !== 'fall') {
      B.away += dt;
      if (B.away > 4) { B.away = 0; B.yarns.length = 0; B.rings.length = 0; setPhase('wait'); B.introDone = true; }
    } else B.away = 0;
    const speed = 0.38 + hpLost() * 0.12;
    if (B.ph === 'drop' || B.ph === 'hit') {
      B.a += dt * speed;
      const tx = GI.x + Math.cos(B.a) * ORBIT, tz = GI.z + Math.sin(B.a) * ORBIT;
      const k = 1 - Math.exp(-dt * 2);
      B.x += (tx - B.x) * k; B.z += (tz - B.z) * k; B.y += (HIGH + Math.sin(B.t * 1.3) * 0.4 - B.y) * k;
    }
    if (B.ph === 'hit' && B.t > 1.6) { setPhase('drop'); B.drops = 0; B.nextDrop = 0.8; }
    if (B.ph === 'drop') {
      B.nextDrop -= dt;
      const per = hpLost() + 1, total = 3 + hpLost() * 2;
      if (B.nextDrop <= 0 && F.length && B.drops < total) {
        for (let i = 0; i < Math.min(per, 2 + (F.length > 1 ? 1 : 0)); i++) dropYarn(F[(B.drops + i) % F.length].pos);
        B.drops++;
        game.sound('throw');
        B.nextDrop = (game.easy ? 2.4 : 1.9) - hpLost() * 0.3;
      }
      if (B.drops >= total && !B.yarns.length) setPhase(hpLost() >= 2 ? 'ring' : 'tired');
    }
    if (B.ph === 'ring') {
      // elle se pose au centre et envoie deux vagues de laine
      const k = 1 - Math.exp(-dt * 2.5);
      B.x += (GI.x - B.x) * k; B.z += (GI.z - B.z) * k; B.y += (top + 4.5 - B.y) * k;
      if (B.t > 1.2 && B.rings.length === 0) { B.rings.push({ r: 0.5 }); game.sound('boing'); tell('ring', 'Une vague de laine !', 'Sautez par-dessus !', 1800); }
      if (B.t > 3.0 && B.rings.length === 1) { B.rings.push({ r: 0.5 }); game.sound('boing'); }
      if (B.t > 6.2) setPhase('tired');
    }
    if (B.ph === 'tired') {
      const k = 1 - Math.exp(-dt * 1.6);
      const ex = GI.x + Math.cos(B.a) * ORBIT * 0.75, ez = GI.z + Math.sin(B.a) * ORBIT * 0.75;
      B.x += (ex - B.x) * k; B.z += (ez - B.z) * k; B.y += (LOW + Math.sin(B.t * 2) * 0.15 - B.y) * k;
      if (B.t > 1) tell('tired' + B.hp, 'Elle est essoufflée !', `La nacelle est basse : sautez, puis toupie (${game.controlsHelp().attack}) dessus !`, 3000);
      if (B.t > (game.easy ? 9 : 6.5)) { setPhase('drop'); B.drops = 0; B.nextDrop = 1; }
      // coups : toupie / élan près de la nacelle, ou retomber dessus
      const by = B.y + 0.45;
      for (const P of game.players) {
        if (P.ko) continue;
        const d = Math.hypot(P.pos.x - B.x, P.pos.z - B.z);
        const spin = (P.attackT > 0 || P.dashT > 0) && d < 2.4 && Math.abs(P.pos.y + 0.9 - by) < 1.6;
        const stomp = P.vel.y < 0 && d < 1.4 && P.pos.y > by - 0.2 && P.pos.y < by + 1.6;
        if ((spin || stomp) && B.t > 0.8) { hitBoss(P); break; }
      }
    }
    if (B.ph === 'fall') {
      B.deflate = Math.min(1, B.t / 2.2);
      const k = 1 - Math.exp(-dt * 1.5);
      const lx = GI.x + 4, lz = GI.z - 1;
      B.x += (lx - B.x) * k; B.z += (lz - B.z) * k;
      B.y = Math.max(ground(B.x, B.z), B.y - dt * (1 + B.t * 3));
      B.spin += dt * (6 - B.deflate * 5);
      if (Math.random() < dt * 30) game.spawnParticle(B.x, B.y + 6 * (1 - B.deflate * 0.6), B.z, (Math.random() - 0.5) * 4, 2, (Math.random() - 0.5) * 4, 0xf0f0ff, 0.3, 0.6, 1);
      if (B.t > 3.2) finish();
    }
    // pelotes qui tombent
    for (const y of B.yarns) {
      y.t += dt;
      if (y.t >= y.T && !y.landed) {
        y.landed = true;
        game.burst(y.tx, y.ty, y.tz, 14, 0xff6ab0, 4, 0.5);
        game.sound('bump');
        for (const P of game.players) if (!P.ko && Math.hypot(P.pos.x - y.tx, P.pos.z - y.tz) < 1.5 && P.pos.y < y.ty + 1.2) game.hurtPlayer({ x: y.tx, z: y.tz }, P);
      }
    }
    B.yarns = B.yarns.filter(y => y.t < y.T + 0.35);
    // vagues de laine
    for (const r of B.rings) {
      const prev = r.r;
      r.r += dt * (game.easy ? 5 : 6.5);
      for (const P of game.players) {
        if (P.ko || !P.grounded) continue;
        const d = Math.hypot(P.pos.x - GI.x, P.pos.z - GI.z);
        if (d > prev - 0.5 && d < r.r + 0.5 && P.pos.y < ground(P.pos.x, P.pos.z) + 0.6) game.hurtPlayer({ x: GI.x, z: GI.z }, P);
      }
    }
    B.rings = B.rings.filter(r => r.r < GI.r + 1);
  }

  function render(dt, t) {
    const shown = B.ph !== 'wait' || game.cine;
    ship.visible = !!shown || B.ph === 'done';
    if (ship.visible) {
      ship.position.set(B.x, B.y, B.z);
      ship.rotation.y = B.ph === 'fall' ? B.spin : Math.sin(t * 0.7) * 0.25 + B.a + Math.PI / 2;
      ship.rotation.z = B.ph === 'done' ? 0.25 : Math.sin(t * 1.1) * 0.04;
      const d = B.deflate;
      if (env) { env.scale.set(1 + d * 0.3 + Math.sin(t * 9) * 0.04 * d * (1 - d), 1.2 * (1 - d * 0.82), 1 + d * 0.3); env.position.y = 6.2 - d * 4.6; }
      trophy.visible = B.ph !== 'done' && B.ph !== 'fall';
      rope.visible = trophy.visible;
      trophy.rotation.y = t * 1.5;
      if (cap.userData.head) cap.userData.head.rotation.z = (B.ph === 'tired' || B.ph === 'done') ? Math.sin(t * 3) * 0.25 : Math.sin(t * 5) * 0.1;
      cap.rotation.y = B.ph === 'drop' || B.ph === 'hit' ? Math.sin(t * 2) * 0.6 : 0;
      cap.position.y = 0.6 + (B.ph === 'hit' ? Math.abs(Math.sin(B.t * 12)) * 0.3 : 0);
      const dizzy = B.ph === 'tired' || B.ph === 'done';
      stars.forEach((s, i) => { s.visible = dizzy; const a = t * 3 + i * Math.PI / 2; s.position.set(Math.cos(a) * 0.55, 3.0 + Math.sin(t * 6 + i) * 0.08, Math.sin(a) * 0.55); s.rotation.y = t * 4; });
      // la nacelle brille quand on peut la frapper
      const glow = B.ph === 'tired' ? 0.35 + Math.sin(t * 8) * 0.25 : 0;
      if (basket && basket.material.emissive) basket.material.emissive.setRGB(glow, glow * 0.8, glow * 0.2);
    }
    yarnMeshes.forEach((m, i) => {
      const y = B.yarns[i];
      m.visible = !!y && y.t < y.T;
      marks[i].visible = !!y && !y.landed;
      if (!y) return;
      const k = Math.min(1, y.t / y.T);
      m.position.set(y.sx + (y.tx - y.sx) * k, y.sy + (y.ty - y.sy) * k * k, y.sz + (y.tz - y.sz) * k);
      m.rotation.x += dt * 8;
      marks[i].position.set(y.tx, y.ty - 0.4, y.tz);
      const s = 0.5 + k * 0.6;
      marks[i].scale.setScalar(s);
      marks[i].material.opacity = 0.25 + k * 0.5 + Math.sin(t * 20) * 0.08;
    });
    ringMeshes.forEach((m, i) => {
      const r = B.rings[i];
      m.visible = !!r;
      if (!r) return;
      m.scale.set(r.r, r.r, 1);
      m.position.set(GI.x, top + 0.15 + Math.sin(r.r * 2) * 0.05, GI.z);
    });
  }

  function sync() { if (sky().boss && B.ph !== 'done') B.ph = 'done'; if (B.ph === 'done') { B.deflate = 1; B.x = GI.x + 4; B.z = GI.z - 1; B.y = ground(B.x, B.z); } }
  sync();

  return {
    get active() { return B.ph !== 'wait' && B.ph !== 'done'; },
    get done() { return B.ph === 'done'; },
    step, render,
    snapshot() {
      const r = (v) => Math.round(v * 100) / 100;
      return [PHASES.indexOf(B.ph), B.hp, r(B.x), r(B.y), r(B.z), r(B.a), r(B.deflate), r(B.spin), r(B.t),
        B.yarns.map(y => [r(y.sx), r(y.sy), r(y.sz), r(y.tx), r(y.ty), r(y.tz), r(y.t), r(y.T), y.landed ? 1 : 0]), B.rings.map(q => r(q.r))];
    },
    apply(x) {
      if (!x) return;
      const ph = PHASES[x[0]];
      if (ph !== B.ph) {
        if (ph === 'drop' && B.ph === 'wait' && game.sfx) game.sfx.music('boss');
        if (ph === 'done') { sky().boss = true; game.updateMedalVisibility(); if (game.sfx) game.sfx.music('adv4'); }
      }
      [, B.hp, B.x, B.y, B.z, B.a, B.deflate, B.spin, B.t] = x;
      B.ph = ph;
      B.yarns = x[9].map(q => ({ sx: q[0], sy: q[1], sz: q[2], tx: q[3], ty: q[4], tz: q[5], t: q[6], T: q[7], landed: !!q[8] }));
      B.rings = x[10].map(v => ({ r: v }));
    },
    /** Après une partie chargée : la Capitaine a-t-elle déjà été battue ? */
    sync,
    focus() { return B.ph === 'wait' || B.ph === 'done' ? null : { x: B.x, y: B.y + 1, z: B.z }; },
    get hp() { return B.hp; },
  };
}
