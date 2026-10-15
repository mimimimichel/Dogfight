// Relève toutes les répliques de l'aventure (qui parle, quel texte) pour leur
// générer une voix. Analyse le code (acorn) : les objets { who, text }, les
// répliques des habitants de Port-Croquette (talkGiver), les plans des
// cinématiques. Les textes à trous (${…}) sont évalués quand c'est possible :
// constantes des niveaux, touches (clavier et tactile). Ceux qui dépendent de
// la partie en cours (scores, records…) sont ignorés : ils gardent le petit
// « charabia » habituel.
// Usage : node extract.mjs > lignes.json
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(process.env.ACORN_FROM || import.meta.url);
const acorn = require('acorn');
const walk = require('acorn-walk');

const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), '../../public/adventure');
const levels = {};
for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) levels[n] = await import(path.join(DIR, `level${n}.js`));
const FILES = { 'game.js': 1, 'level1.js': 1, 'park.js': 1, 'parkkit.js': 1, 'level2.js': 2, 'forest.js': 2, 'level3.js': 3, 'cityplay.js': 3, 'city.js': 3, 'level4.js': 4, 'sky.js': 4, 'sky_boss.js': 4, 'level5.js': 5, 'snow.js': 5, 'level6.js': 6, 'beach.js': 6, 'beachplay.js': 6, 'level7.js': 7, 'farm.js': 7, 'farmkit.js': 7, 'level8.js': 8, 'castle.js': 8, 'story.js': 0 };
const KEYS = [{ jump: 'ESPACE', attack: 'J', dash: 'K' }, { jump: 'SAUT', attack: 'ATTAQUE', dash: 'CHARGE' }];
const NARRATOR = '';

const out = new Map();
const add = (who, text, file) => {
  if (typeof who !== 'string' || typeof text !== 'string' || !text.trim() || who === 'Panneau') return;
  const key = who + '|' + text;
  if (!out.has(key)) out.set(key, { who, text, file });
};

// valeurs plausibles des variables de la partie (compteurs) : chaque réplique
// est générée pour chacune, tant que ça reste raisonnable
const arr = (n) => Array.from({ length: n }, (_, i) => 'x' + i);
const ENUM = {
  stars: [0, 1, 2, 3, 4, 5],
  left: [1, 2, 3, 4, 5].map(arr),
  n: [0, 1, 2, 3, 4, 5, 6, 7],
  q: [],
  st: [],
  s: (env) => Array.from({ length: env.S.medals.length + 1 }, (_, i) => ({ medals: arr(i), bones: [], intro: true })),
};
function evalSrc(src, env) {
  const names = Object.keys(env);
  return new Function(...names, `"use strict"; return (${src});`)(...names.map(n => env[n]));
}
/** Toutes les valeurs possibles d'une expression (les deux branches d'un « ? : »). */
function variants(node, code, env) {
  if (!node) return [];
  if (node.type === 'ConditionalExpression') return [...variants(node.consequent, code, env), ...variants(node.alternate, code, env)];
  if (node.type === 'SpreadElement') return [];
  try {
    const v = evalSrc(code.slice(node.start, node.end), env);
    return typeof v === 'string' ? [v] : [];
  } catch (e) {
    const m = /^(\w+) is not defined/.exec(e.message);
    if (m && ENUM[m[1]] && !(m[1] in env)) return (typeof ENUM[m[1]] === 'function' ? ENUM[m[1]](env) : ENUM[m[1]]).flatMap(val => variants(node, code, { ...env, [m[1]]: val }));
    return [];
  }
}
const prop = (obj, name) => obj.properties && obj.properties.find(p => p.type === 'Property' && !p.computed && (p.key.name === name || p.key.value === name));

ENUM.q = levels[3].MISSIONS.filter(q => q.id !== 'boss');
ENUM.st = levels[3].MISSIONS.map(q => ({ m: { id: q.id } }));
for (const [file, lv] of Object.entries(FILES)) {
  const code = fs.readFileSync(path.join(DIR, file), 'utf8');
  const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module' });
  const S = levels[lv] || levels[1];
  for (const k of KEYS) {
    const baseEnv = { S, L: S, k, game: { controlsHelp: () => k, easy: false, party: { size: 1 } }, ID: S.ID };
    if (S.MISSIONS) {
      baseEnv.missionDef = (id) => S.MISSIONS.find(q => q.id === id);
    }
    const givers = S.GIVERS ? Object.entries(S.GIVERS) : [];
    walk.ancestor(ast, {
      ObjectExpression(node, anc) {
        const w = prop(node, 'who'), t = prop(node, 'text');
        if (!t) return;
        const parentProp = anc[anc.length - 2];
        // plan de cinématique sans « who » : le conteur
        if (!w) {
          if (parentProp && parentProp.type === 'Property' && parentProp.key.name === 'say') for (const tx of variants(t.value, code, baseEnv)) add(NARRATOR, tx, file);
          return;
        }
        const whoSrc = code.slice(w.value.start, w.value.end);
        const envs = /\bg\.name\b/.test(whoSrc) ? givers.map(([, g]) => ({ ...baseEnv, g })) : [baseEnv];
        // dans talkGiver, une case 'id' fixe le personnage
        const sc = [...anc].reverse().find(a => a.type === 'SwitchCase' && a.test && a.test.type === 'Literal');
        const useEnvs = sc && S.GIVERS && S.GIVERS[sc.test.value] && /\bg\.name\b/.test(whoSrc) ? [{ ...baseEnv, g: S.GIVERS[sc.test.value] }] : envs;
        for (const env of useEnvs) for (const who of variants(w.value, code, env)) for (const tx of variants(t.value, code, env)) add(who, tx, file);
      },
      CallExpression(node, anc) {
        // say([...]) et thanks('...') des habitants (cityplay.js : talkGiver)
        if (node.callee.type !== 'Identifier' || !['say', 'thanks'].includes(node.callee.name) || !S.GIVERS) return;
        const sc = [...anc].reverse().find(a => a.type === 'SwitchCase' && a.test && a.test.type === 'Literal');
        if (!sc || !S.GIVERS[sc.test.value]) return;
        const env = { ...baseEnv, g: S.GIVERS[sc.test.value], n: 0 };
        const arg = node.arguments[0];
        const items = arg && arg.type === 'ArrayExpression' ? arg.elements : [arg];
        for (const it of items) for (const tx of variants(it, code, env)) add(env.g.name, tx, file);
      },
      VariableDeclarator(node) {
        // story.js : const chapters = { 2: { fly, cap, duo }, … }
        if (node.id.name !== 'chapters' || !node.init || node.init.type !== 'ObjectExpression') return;
        for (const p of node.init.properties) {
          const o = p.value, fly = prop(o, 'fly'), cap = prop(o, 'cap'), duo = prop(o, 'duo');
          if (fly) for (const tx of variants(fly.value, code, baseEnv)) add(NARRATOR, tx, file);
          if (cap) for (const tx of variants(cap.value, code, baseEnv)) add('Capitaine Moustache', tx, file);
          if (duo && duo.value.type === 'ArrayExpression') {
            const [a, b] = duo.value.elements;
            for (const who of variants(a, code, baseEnv)) for (const tx of variants(b, code, baseEnv)) add(who, tx, file);
          }
        }
      },
    });
  }
}
// Parc (park.js) : indices et longue-vue construits à partir des lieux de level1.js
{
  const L1 = levels[1], M = 'Mamie Labrador', f = 'park.js', pl = (n, w) => w + (n > 1 ? 's' : '');
  for (const k of [...out.keys()]) if (/\bx\d/.test(out.get(k).text)) out.delete(k);
  for (let n = 1; n <= 5; n++) add(M, `Il vous reste ${n} ${pl(n, 'médaille')} à trouver.`, f);
  for (const t of ['Mon Biscotte voulait voir les canards de la mare, à l\'ouest. Cherchez près de l\'eau !',
    'Son collier ! Alors suivez ses traces jusqu\'au bac à sable de l\'aire de jeux. Creusez là où ça sent le chiot !',
    'Son doudou ! Biscotte n\'est pas loin… Allez voir au manège, au nord-est du Grand Chêne.', 'Ramenez-le-moi vite !',
    'Biscotte est dans le labyrinthe fleuri, au nord-ouest ! Trouvez le chemin jusqu\'au milieu.',
    'Les chats ont soufflé les six lanternes magiques du parc. Approchez-vous d\'une lanterne pour la rallumer ! Quand elles brilleront toutes, le Grand Chêne s\'illuminera.',
    'Gaston, l\'entraîneur d\'agility, vous attend sur son terrain, à l\'est du Grand Chêne.',
    'Cinq balles de tennis se sont perdues loin des chemins. Elles reviennent toutes seules sur le piédestal, à côté de la fontaine !',
    'Si vous êtes perdus, montez au belvédère, tout au nord : la longue-vue montre tout le parc !']) add(M, t, f);
  for (let n = 1; n <= 5; n++) for (const l of L1.LANTERNS) add(M, `Il reste ${n} ${pl(n, 'lanterne')} à rallumer. Il y en a une ${l.where}.`, f);
  for (let n = 1; n <= 6; n++) add(M, `Encore ${n} ${pl(n, 'chat')} ${pl(n, 'farceur')} dans le parc. Un gros « Ouaf ! » les fait déguerpir !`, f);
  const balls = L1.BALLS || L1.balls || [];
  for (let n = 1; n <= 4; n++) for (const b of balls) add(M, `Encore ${n} ${pl(n, 'balle')} de tennis à trouver. Il y en a une ${b.where}.`, f);
  for (const t of ['Là-bas, près de la mare : quelque chose de rouge brille dans l\'herbe…', 'Dans le bac à sable de l\'aire de jeux : des petites traces de pattes !', 'Sur le manège : un drôle de jouet rose…', 'Au milieu du labyrinthe fleuri… c\'est Biscotte !']) add('Matcha', t, f);
  for (const l of L1.LANTERNS) add('Matcha', `Une lanterne éteinte, ${l.where} !`, f);
  for (const b of balls) add('Matcha', `Une balle de tennis, ${b.where} !`, f);
  for (const c of (L1.CATS || L1.cats || []).filter(c => c.group === 'clearing')) add('Matcha', `Un chat farceur, ${c.where} !`, f);
  for (const n of [90, 60]) add('Gaston', `Vous avez ${n} secondes. À vos marques… Prêts ?`, f);
  if (!balls.length) process.stderr.write('ATTENTION : balles du parc introuvables\n');
}
const list = [...out.values()];
process.stdout.write(JSON.stringify(list, null, 1));
const by = {};
for (const l of list) by[l.who || '(conteur)'] = (by[l.who || '(conteur)'] || 0) + 1;
process.stderr.write(`${list.length} répliques\n${JSON.stringify(by, null, 1)}\n`);
