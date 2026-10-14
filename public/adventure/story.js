/*
 * Matcha & Ainu — le scénario : la grande introduction (chapitre 1) et
 * l'ouverture de chaque chapitre, tournées dans le vrai décor du niveau.
 *
 * L'histoire : la Capitaine Moustache et ses chats bandits volent les cinq
 * Médailles Patounes du Parc des Toutous. Ainu et Matcha la poursuivent dans
 * la Forêt des Moustaches, puis à Port-Croquette, et jusqu'aux Îles du Ciel.
 * Puis, devenue copine (mais toujours farceuse), elle les attend pour jouer à
 * la Station des Neiges.
 */
import * as THREE from '../vendor/three.module.min.js';
import * as M from './models.js';
import { buildCaptain } from './forest.js';

const lerp = (a, b, k) => a + (b - a) * k;
const seg = (k, a, b) => Math.min(1, Math.max(0, (k - a) / (b - a)));

/** Fait trotter un chat (ou la Capitaine) d'un point à un autre. */
function trot(cat, x0, z0, x1, z1, k, y, t) {
  cat.position.set(lerp(x0, x1, k), y(lerp(x0, x1, k), lerp(z0, z1, k)), lerp(z0, z1, k));
  if (Math.hypot(x1 - x0, z1 - z0) > 0.01) cat.rotation.y = Math.atan2(x1 - x0, z1 - z0);
  const u = cat.userData, moving = k > 0 && k < 1;
  if (u.legs) u.legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(t * 16 + (i % 2 ? Math.PI : 0)) * 0.8 : 0; });
  if (u.tail) u.tail.rotation.x = Math.sin(t * 9) * 0.3;
}

/** Montgolfière de la Capitaine (chapitre 4). */
export function balloon() {
  const g = new THREE.Group();
  const stripes = new THREE.CanvasTexture((() => { const c = document.createElement('canvas'); c.width = 256; c.height = 8; const x = c.getContext('2d'); for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#2a2a3a' : '#e8c040'; x.fillRect(i * 32, 0, 32, 8); } return c; })());
  stripes.colorSpace = THREE.SRGBColorSpace;
  const env = new THREE.Mesh(new THREE.SphereGeometry(3, 32, 24), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 }));
  env.scale.set(1, 1.2, 1); env.position.y = 6.2; g.add(env);
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.75, 0.9, 16), M.mat(0x9a6a3a, { roughness: 0.9 }));
  basket.position.y = 0.45; g.add(basket);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.8; const r = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3.4, 4), M.mat(0x3a2a1a)); r.position.set(Math.cos(a) * 1.0, 2.4, Math.sin(a) * 1.0); r.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35); g.add(r); }
  const cap = buildCaptain(); cap.scale.setScalar(1.6); cap.position.y = 0.6; g.add(cap);
  g.userData.cap = cap;
  return g;
}

/** Les plans de la cinématique du niveau, ou null. */
export function storyShots(game, L) {
  const S = L.START, P = game.player, y = (x, z) => L.heightAt(x, z);
  const fx = Math.sin(S.yaw), fz = Math.cos(S.yaw);           // devant le duo au départ
  const at = (dx, dy, dz) => [S.x + dx, S.y + dy, S.z + dz];
  const duoAt = (yaw) => { P.pos.set(S.x, S.y, S.z); P.vel.set(0, 0, 0); P.yaw = yaw; P.grounded = true; P.cheerT = 0; P.flipT = 0; };

  if (L.ID === 1) {
    // le trésor, sur son socle près de Mamie
    const px = 6, pz = 39, py = y(px, pz);
    let ped, medals = [], cap, cats = [];
    const setup = (c) => {
      if (ped) return;
      ped = c.add(M.buildPedestal()); ped.position.set(px, py, pz);
      for (let i = 0; i < 5; i++) { const m = c.add(M.buildMedal()); m.scale.setScalar(0.55); medals.push(m); }
      cap = c.add(buildCaptain()); cap.visible = false;
      for (let i = 0; i < 3; i++) { const k = c.add(M.buildCat()); k.scale.setScalar(1.1); k.visible = false; cats.push(k); }
    };
    const placeMedals = (t, grab) => medals.forEach((m, i) => {
      const a = i / 5 * Math.PI * 2 + t * 0.6;
      const hx = px + Math.cos(a) * 0.9, hz = pz + Math.sin(a) * 0.9, hy = py + 2.3 + Math.sin(t * 2 + i) * 0.1;
      const g = grab || 0;
      m.position.set(lerp(hx, cap.position.x, g), lerp(hy, cap.position.y + 1.6, g), lerp(hz, cap.position.z, g));
      m.rotation.y = t * 2 + i; m.scale.setScalar(0.55 * (1 - g * 0.9)); m.visible = g < 0.98;
    });
    const gang = [[-1.6, -1.2], [1.7, -1.0], [0.2, -2.4]];
    return [
      { d: 7.5, from: at(52, 40, 34), to: at(-34, 32, 48), look: at(0, 2, -18), lookTo: at(2, 2, -22), fadeIn: true,
        title: ['Matcha & Ainu', 'Le mystère des Médailles Patounes'],
        say: { text: 'Au bord de la mer, il y a un parc pas comme les autres : le Parc des Toutous.' },
        enter: (c) => { setup(c); duoAt(S.yaw); placeMedals(0); } },
      { d: 7, from: [S.x + fx * 4.6 + 2.6, S.y + 3.0, S.z + fz * 4.6], to: [S.x + fx * 3.6 + 1.6, S.y + 2.6, S.z + fz * 3.6], look: at(0, 1.4, 0),
        say: { text: 'Là vivent Ainu, un grand eurasier tout roux, et Matcha, un petit pinscher plein d\'énergie.' },
        enter: () => duoAt(S.yaw),
        update: (c, k) => { P.flipT = k > 0.55 && k < 0.7 ? 0.45 * (1 - seg(k, 0.55, 0.7)) : 0; } },
      { d: 7, from: [px + 6, py + 3.2, pz + 4], to: [px - 5, py + 3.4, pz + 5], look: [px, py + 1.9, pz],
        say: { text: 'Sur la colline brillent les cinq Médailles Patounes, le trésor de tous les toutous du parc.' },
        update: (c) => placeMedals(c.t) },
      { d: 7, night: 1, from: [px + 8, py + 1.3, pz + 6], to: [px + 6.5, py + 1.7, pz + 3.5], look: [px, py + 1.2, pz - 5], lookTo: [px, py + 1.4, pz - 1],
        say: { text: 'Mais une nuit, sans un bruit, des moustaches s\'approchent…' },
        enter: () => { cap.visible = true; cats.forEach(k => { k.visible = true; }); },
        update: (c, k) => {
          placeMedals(c.t + 7);
          trot(cap, px, pz - 18, px, pz - 2.4, seg(k, 0, 0.85), y, c.t);
          cats.forEach((cat, i) => trot(cat, px + gang[i][0] * 2, pz - 19 + gang[i][1], px + gang[i][0], pz - 2.6 + gang[i][1], seg(k, 0.08 * i, 0.9), y, c.t + i));
        } },
      { d: 6, night: 1, from: [px + 5.5, py + 2.6, pz + 3.5], to: [px + 4.6, py + 2.8, pz + 2.6], look: [px, py + 1.9, pz - 2.0],
        say: { who: 'Capitaine Moustache', text: 'Miaou-ha-ha ! Ces médailles sont à moi, maintenant !' },
        update: (c, k) => { placeMedals(c.t + 14, seg(k, 0.45, 0.95)); cap.userData.head.rotation.z = Math.sin(c.t * 6) * 0.15; } },
      { d: 6, night: 1, from: [px + 4, py + 9, pz + 12], to: [px + 3, py + 11, pz + 9], look: [px, py, pz - 6], lookTo: [px, py, pz - 14],
        say: { text: 'La Capitaine Moustache et ses chats bandits filent dans la nuit avec le trésor !' },
        update: (c, k) => {
          trot(cap, px, pz - 2.4, px - 3, pz - 30, seg(k, 0.05, 1), y, c.t);
          cats.forEach((cat, i) => trot(cat, px + gang[i][0], pz - 2.6 + gang[i][1], px + gang[i][0] * 6, pz - 30 + gang[i][1], seg(k, 0.03 * i, 0.9), y, c.t + i));
        } },
      { d: 6, from: [L.npcs.mamie.x + 3.2, L.npcs.mamie.y + 2.1, L.npcs.mamie.z + 3.2], to: [L.npcs.mamie.x + 2.4, L.npcs.mamie.y + 1.9, L.npcs.mamie.z + 2.4], look: [L.npcs.mamie.x, L.npcs.mamie.y + 1.4, L.npcs.mamie.z],
        say: { who: 'Mamie Labrador', text: 'Mes médailles ! Envolées ! Et mon petit Biscotte qui n\'est pas rentré…' },
        enter: () => { cap.visible = false; cats.forEach(k => { k.visible = false; }); } },
      { d: 5, from: [S.x + fx * 4 + 1.4, S.y + 2.8, S.z + fz * 4], to: [S.x + fx * 3.2 + 1, S.y + 2.5, S.z + fz * 3.2], look: at(0, 1.5, 0),
        say: { who: 'Matcha', text: 'On va tout retrouver, Mamie ! Hein, Ainu ?' },
        enter: () => duoAt(S.yaw),
        update: (c) => { P.cheerT = 0.5 + c.t; } },
      { d: 4.5, from: [S.x + fx * 6 - 2, S.y + 2.4, S.z + fz * 6], to: [S.x + fx * 7 - 3, S.y + 3.2, S.z + fz * 7], look: at(0, 1.2, 0),
        say: { who: 'Ainu', text: 'Ouaf ! En route !' }, title: ['Chapitre 1', 'Le Parc des Toutous'],
        update: (c) => { P.cheerT = 0; P.flipT = c.t < 0.45 ? 0.45 - c.t : 0; } },
    ];
  }

  // ouverture des autres chapitres : survol du décor, la Capitaine qui file, le duo qui repart
  const chapters = {
    2: { title: 'La Forêt des Moustaches', fly: 'La Capitaine s\'est réfugiée dans la Forêt des Moustaches, où les arbres touchent les nuages et les champignons rebondissent.',
      cap: 'Miaou ! Jamais vous ne me trouverez dans ma forêt !', duo: ['Matcha', 'Il fait tout noir là-dedans… Tu restes près de moi, Ainu ?'] },
    3: { title: 'Port-Croquette', fly: 'Chassée de la forêt, la Capitaine a filé à Port-Croquette, la grande ville au bord de la mer. Son gang y sème la pagaille !',
      cap: 'Miaou-ha-ha ! En ville, personne ne rattrape mon bolide !', duo: ['Ainu', 'Ouaf ! Des karts… et même des avions ?!'] },
    4: { title: 'Les Îles du Ciel', fly: 'Pour leur échapper une dernière fois, la Capitaine s\'est envolée en montgolfière vers les Îles du Ciel.',
      cap: 'Bonne chance pour me suivre là-haut, les cabots !', duo: ['Matcha', 'Accroche-toi, Ainu : on va sauter de nuage en nuage !'] },
    5: { title: 'La Station des Neiges', fly: 'Pour les vacances, Mamie emmène toute la bande à la Station des Neiges, chez sa vieille amie Myrtille. Mais devinez qui est arrivé avant eux…',
      cap: 'Miaou-ha-ha ! J\'ai caché les médailles de la station. Venez me les reprendre… en jouant !', duo: ['Matcha', 'De la neige partout ! Ainu, on fait une bataille de boules de neige ?'] },
    6: { title: 'La Plage aux Coquillages', fly: 'Pour fêter l\'été, toute la bande file à la Plage aux Coquillages. Mais les chats de la Capitaine Moustache y ont bâti un fort de sable… et ils ont plein de farces en tête !',
      cap: 'Miaou-ha-ha ! Cette plage est à nous : le sable, les vagues et tous les coquillages !', duo: ['Matcha', 'Des vagues, du sable et des trésors à creuser… Ainu, à nous la plage !'] },
  };
  const ch = chapters[L.ID];
  if (!ch) return null;
  const big = L.ID === 3 ? 2.2 : 1;
  let cap = null;
  const capRun = (c, k) => {
    if (L.ID === 4) { cap.position.set(S.x + fx * lerp(14, 40, k), S.y + lerp(1, 26, k), S.z + fz * lerp(14, 40, k)); cap.rotation.y = c.t * 0.3; return; }
    const rx = Math.cos(S.yaw), rz = -Math.sin(S.yaw);          // vers la droite : elle file en diagonale
    trot(cap, S.x + fx * 9 + rx * 3, S.z + fz * 9 + rz * 3, S.x + fx * 22 + rx * 16, S.z + fz * 22 + rz * 16, seg(k, 0.25, 1), y, c.t);
  };
  return [
    { d: 7.5, from: at(-45 * big, 34 * big, 38 * big), to: at(40 * big, 28 * big, 42 * big), look: at(fx * 30, 0, fz * 30), lookTo: at(fx * 40, 2, fz * 40),
      title: [`Chapitre ${L.ID}`, ch.title], say: { text: ch.fly },
      enter: () => duoAt(S.yaw) },
    { d: 6, from: [S.x - fx * 3.5 + 1.5, S.y + 2.6, S.z - fz * 3.5], to: [S.x - fx * 2.5 + 0.8, S.y + 2.2, S.z - fz * 2.5], look: at(fx * 12 + Math.cos(S.yaw) * 3, 1.5, fz * 12 - Math.sin(S.yaw) * 3), lookTo: at(fx * 18 + Math.cos(S.yaw) * (L.ID === 4 ? 0 : 9), L.ID === 4 ? 8 : 1.5, fz * 18 - Math.sin(S.yaw) * (L.ID === 4 ? 0 : 9)),
      say: { who: 'Capitaine Moustache', text: ch.cap },
      enter: (c) => { cap = c.add(L.ID === 4 ? balloon() : buildCaptain()); capRun(c, 0); },
      update: (c, k) => capRun(c, k) },
    { d: 4.5, from: [S.x + fx * 4.4 + 1.4, S.y + 1.5, S.z + fz * 4.4], to: [S.x + fx * 3.4 + 0.8, S.y + 1.35, S.z + fz * 3.4], look: at(0, 1.2, 0),
      say: { who: ch.duo[0], text: ch.duo[1] },
      enter: (c) => { if (cap) cap.visible = false; },
      update: (c) => { P.cheerT = 0.4 + c.t; } },
  ];
}
