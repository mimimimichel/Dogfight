/*
 * Niveau actif de l'aventure. Les autres modules importent `L` : c'est une
 * liaison vivante, elle suit le niveau choisi par setLevel().
 */
import * as L1 from './level1.js';
import * as L2 from './level2.js';

export const LEVELS = { 1: L1, 2: L2 };
export let L = L1;
export function setLevel(id) { L = LEVELS[id] || L1; return L; }
