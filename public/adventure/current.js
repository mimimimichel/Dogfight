/*
 * Niveau actif de l'aventure. Les autres modules importent `L` : c'est une
 * liaison vivante, elle suit le niveau choisi par setLevel().
 */
import * as L1 from './level1.js';
import * as L2 from './level2.js';
import * as L3 from './level3.js';
import * as L4 from './level4.js';
import * as L5 from './level5.js';
import * as L6 from './level6.js';

export const LEVELS = { 1: L1, 2: L2, 3: L3, 4: L4, 5: L5, 6: L6 };
export let L = L1;
export function setLevel(id) { L = LEVELS[id] || L1; return L; }
