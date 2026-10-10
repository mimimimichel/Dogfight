/*
 * Dogfight — moteur de combat partagé (serveur + navigateur).
 * Simulation à pas fixe (60 ticks/s), autoritaire côté serveur en ligne,
 * exécutée localement pour les modes « 2 joueurs local » et « contre l'ordi ».
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DogGame = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TICK_RATE = 60;
  const STAGE_W = 960;
  const STAGE_H = 540;
  const GROUND_Y = 470; // ordonnée écran du sol
  const WALL_MARGIN = 20;
  const ROUND_TIME = 99;
  const WINS_NEEDED = 2;
  const METER_MAX = 100;

  // Bits d'entrée
  const IN = {
    LEFT: 1, RIGHT: 2, UP: 4, DOWN: 8,
    LIGHT: 16, HEAVY: 32, SPECIAL: 64, SUPER: 128,
  };

  /*
   * Boîtes : { x, y, w, h } en pixels, relatives au personnage.
   *   x : distance vers l'avant depuis le centre jusqu'au bord proche
   *   y : hauteur du bas de la boîte au-dessus des pattes (peut être négatif)
   * Niveaux : 'mid' (bloquable debout/accroupi), 'low' (accroupi), 'overhead' (debout).
   */
  const CHARACTERS = {
    ainu: {
      id: 'ainu',
      name: 'Ainu',
      breed: "Eurasier roux",
      desc: 'Boule de poils puissante. Lente mais encaisse et frappe fort, contrôle la distance avec ses boules de poils.',
      maxHp: 1100,
      walkSpeed: 3.0,
      backSpeed: 2.3,
      jumpVel: 15.5,
      jumpSpeedX: 3.6,
      gravity: 0.78,
      width: 112,
      height: 112,
      crouchHeight: 72,
      moves: {
        light: { name: 'Morsure', startup: 5, active: 3, recovery: 9, damage: 42, hitstun: 15, blockstun: 10, kb: 3.5, level: 'mid', hitbox: { x: 44, y: 62, w: 64, h: 50 } },
        heavy: { name: 'Coup de patte', startup: 11, active: 4, recovery: 18, damage: 92, hitstun: 21, blockstun: 14, kb: 8, level: 'mid', hitbox: { x: 38, y: 40, w: 74, h: 62 }, hitstop: 10 },
        crouchLight: { name: 'Mordillage', startup: 5, active: 3, recovery: 8, damage: 30, hitstun: 14, blockstun: 9, kb: 3, level: 'low', hitbox: { x: 42, y: 0, w: 58, h: 36 } },
        crouchHeavy: { name: 'Balayage de queue', startup: 10, active: 5, recovery: 22, damage: 74, hitstun: 20, blockstun: 13, kb: 5, level: 'low', knockdown: true, hitbox: { x: 20, y: 0, w: 96, h: 26 } },
        airLight: { name: 'Croc plongeant', air: true, startup: 5, active: 8, recovery: 6, damage: 46, hitstun: 16, blockstun: 10, kb: 3, level: 'overhead', hitbox: { x: 22, y: -14, w: 64, h: 56 } },
        airHeavy: { name: 'Bombe à poils', air: true, startup: 8, active: 8, recovery: 10, damage: 86, hitstun: 20, blockstun: 13, kb: 6, level: 'overhead', hitbox: { x: 0, y: -24, w: 86, h: 70 }, hitstop: 10 },
        special: {
          name: 'Boule de poils rousse', special: true, startup: 13, active: 1, recovery: 26,
          projectile: { kind: 'furball', speed: 7.5, w: 46, h: 40, y: 48, life: 140, damage: 72, chip: 12, hitstun: 19, blockstun: 15, kb: 5, level: 'mid', hits: 1 },
        },
        super: {
          name: 'Hurlement du Loup Roux', super: true, startup: 18, active: 1, recovery: 30, invuln: 22,
          projectile: { kind: 'howl', speed: 8.5, w: 90, h: 130, y: 0, life: 140, damage: 46, chip: 8, hitstun: 26, blockstun: 12, kb: 1.2, level: 'mid', hits: 6, hitInterval: 5, launch: 12, power: 3 },
        },
      },
    },
    matcha: {
      id: 'matcha',
      name: 'Matcha',
      breed: 'Pinscher',
      desc: 'Petit, nerveux et ultra rapide. Fonce dans le tas avec sa Charge Pinscher et enchaîne les morsures.',
      maxHp: 950,
      walkSpeed: 4.4,
      backSpeed: 3.4,
      jumpVel: 16.5,
      jumpSpeedX: 4.6,
      gravity: 0.86,
      width: 96,
      height: 116,
      crouchHeight: 70,
      moves: {
        light: { name: 'Morsure éclair', startup: 4, active: 2, recovery: 7, damage: 34, hitstun: 14, blockstun: 9, kb: 3, level: 'mid', hitbox: { x: 40, y: 66, w: 62, h: 50 } },
        heavy: { name: 'Coup de boule', startup: 9, active: 4, recovery: 15, damage: 80, hitstun: 20, blockstun: 13, kb: 7, level: 'mid', hitbox: { x: 34, y: 52, w: 70, h: 50 }, hitstop: 9, moveVx: 3 },
        crouchLight: { name: 'Pincement', startup: 4, active: 2, recovery: 7, damage: 26, hitstun: 13, blockstun: 8, kb: 2.5, level: 'low', hitbox: { x: 38, y: 0, w: 56, h: 34 } },
        crouchHeavy: { name: 'Glissade', startup: 8, active: 8, recovery: 20, damage: 68, hitstun: 20, blockstun: 12, kb: 5, level: 'low', knockdown: true, moveVx: 7, hitbox: { x: 24, y: 0, w: 74, h: 28 } },
        airLight: { name: 'Pique', air: true, startup: 4, active: 8, recovery: 5, damage: 40, hitstun: 15, blockstun: 9, kb: 3, level: 'overhead', hitbox: { x: 24, y: -10, w: 56, h: 52 } },
        airHeavy: { name: 'Ruade', air: true, startup: 7, active: 7, recovery: 10, damage: 78, hitstun: 19, blockstun: 12, kb: 6, level: 'overhead', hitbox: { x: 10, y: -20, w: 80, h: 60 }, hitstop: 9 },
        special: {
          name: 'Charge Pinscher', special: true, startup: 8, active: 16, recovery: 17, damage: 84, chip: 12, hitstun: 22, blockstun: 16, kb: 6, level: 'mid',
          knockdown: true, moveVx: 11, onHitVx: 0, hitbox: { x: 10, y: 30, w: 70, h: 62 }, hitstop: 10,
        },
        super: {
          name: 'Rafale Matcha', super: true, startup: 10, active: 34, recovery: 20, invuln: 14, damage: 30, chip: 6, hitstun: 30, blockstun: 10, kb: 1, level: 'mid',
          moveVx: 13, onHitVx: 4.2, hits: 7, hitInterval: 4, launch: 13, hitbox: { x: 0, y: 10, w: 84, h: 96 }, hitstop: 4,
        },
      },
    },
  };

  const CHAR_IDS = Object.keys(CHARACTERS);

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rectsOverlap(a, b) {
    return a.l < b.l + b.w && b.l < a.l + a.w && a.b < b.b + b.h && b.b < a.b + a.h;
  }

  function makeFighter(charId, slot) {
    const ch = CHARACTERS[charId];
    return {
      char: charId,
      slot,
      x: slot === 0 ? 300 : STAGE_W - 300,
      y: 0,
      vx: 0,
      vy: 0,
      push: 0,
      facing: slot === 0 ? 1 : -1,
      hp: ch.maxHp,
      meter: 0,
      state: 'idle',
      stateTimer: 0,
      move: null,
      frame: 0,
      hitsDone: 0,
      lastHitFrame: -99,
      moveVx: 0,
      onGround: true,
      crouching: false,
      airAttackUsed: false,
      invuln: 0,
      comboTaken: 0,
      buffer: 0,
      bufferT: 0,
      anim: 0,
    };
  }

  class Game {
    constructor(charIds) {
      this.chars = charIds.slice();
      this.fighters = [makeFighter(charIds[0], 0), makeFighter(charIds[1], 1)];
      this.inputs = [0, 0];
      this.prevInputs = [0, 0];
      this.latched = [0, 0];
      this.projectiles = [];
      this.events = [];
      this.round = 1;
      this.wins = [0, 0];
      this.timer = ROUND_TIME;
      this.timerTicks = 0;
      this.phase = 'intro';
      this.phaseTimer = 0;
      this.hitstop = 0;
      this.freeze = 0;
      this.freezeOwner = -1;
      this.frameCount = 0;
      this.roundWinner = -1;
      this.matchWinner = -1;
      this.timeOver = false;
      this.projId = 0;
    }

    // Les appuis sont « verrouillés » pour ne jamais rater un appui bref
    // arrivé entre deux ticks.
    setInput(slot, bits) {
      const prev = this.inputs[slot];
      this.latched[slot] |= bits & ~prev;
      this.inputs[slot] = bits;
    }

    tick() {
      this.frameCount++;
      this.events = [];

      if (this.phase === 'matchover') {
        this.phaseTimer++;
        for (const f of this.fighters) this._physics(f), f.anim++;
        this._consumeInputs();
        return;
      }

      if (this.freeze > 0) { this.freeze--; this._bufferOnly(); return; }
      if (this.hitstop > 0) { this.hitstop--; this._bufferOnly(); return; }

      // Ralenti au K.O.
      if (this.phase === 'ko' && this.phaseTimer < 50 && this.frameCount % 2 === 0) {
        this.phaseTimer++;
        return;
      }

      this._updatePhase();

      for (let i = 0; i < 2; i++) this._updateFighter(i);
      this._pushApart();
      this._autoFace();
      this._checkHits();
      this._updateProjectiles();
      this._checkKO();
      this._consumeInputs();
    }

    _bufferOnly() {
      for (let i = 0; i < 2; i++) this._readBuffer(i);
      this._consumeInputs();
    }

    _consumeInputs() {
      this.prevInputs[0] = this.inputs[0];
      this.prevInputs[1] = this.inputs[1];
      this.latched[0] = 0;
      this.latched[1] = 0;
    }

    _pressed(i) {
      return this.latched[i] | (this.inputs[i] & ~this.prevInputs[i]);
    }

    _readBuffer(i) {
      const f = this.fighters[i];
      const p = this.phase === 'fight' ? this._pressed(i) : 0;
      const order = [IN.SUPER, IN.SPECIAL, IN.HEAVY, IN.LIGHT];
      for (const b of order) {
        if (p & b) { f.buffer = b; f.bufferT = 8; break; }
      }
    }

    _updatePhase() {
      this.phaseTimer++;
      if (this.phase === 'intro') {
        if (this.phaseTimer === 1) this.events.push({ type: 'round', round: this.round });
        if (this.phaseTimer === 70) this.events.push({ type: 'fight' });
        if (this.phaseTimer >= 100) { this.phase = 'fight'; this.phaseTimer = 0; }
      } else if (this.phase === 'fight') {
        this.timerTicks++;
        if (this.timerTicks >= TICK_RATE) {
          this.timerTicks = 0;
          this.timer = Math.max(0, this.timer - 1);
          if (this.timer === 0) this._endRound(true);
        }
      } else if (this.phase === 'ko') {
        if (this.phaseTimer === 110) {
          for (const f of this.fighters) {
            if (f.slot === this.roundWinner && f.state !== 'ko') {
              f.state = 'win'; f.move = null; f.vx = 0;
            }
          }
        }
        if (this.phaseTimer >= 200) this._afterRound();
      }
    }

    _endRound(timeOver) {
      const [a, b] = this.fighters;
      this.timeOver = !!timeOver;
      const ra = a.hp / CHARACTERS[a.char].maxHp;
      const rb = b.hp / CHARACTERS[b.char].maxHp;
      if (timeOver) this.roundWinner = ra > rb ? 0 : rb > ra ? 1 : -1;
      else if (a.hp <= 0 && b.hp <= 0) this.roundWinner = -1;
      else this.roundWinner = a.hp <= 0 ? 1 : 0;
      this.phase = 'ko';
      this.phaseTimer = 0;
      this.events.push({ type: timeOver ? 'timeover' : 'ko', winner: this.roundWinner });
    }

    _afterRound() {
      if (this.roundWinner === -1) { this.wins[0]++; this.wins[1]++; }
      else this.wins[this.roundWinner]++;
      const w0 = this.wins[0] >= WINS_NEEDED;
      const w1 = this.wins[1] >= WINS_NEEDED;
      if (w0 || w1) {
        this.phase = 'matchover';
        this.phaseTimer = 0;
        this.matchWinner = w0 && w1 ? -1 : w0 ? 0 : 1;
        for (const f of this.fighters) {
          if (f.slot === this.matchWinner) { f.state = 'win'; f.move = null; }
        }
        this.events.push({ type: 'matchover', winner: this.matchWinner });
        return;
      }
      this.round++;
      this._resetRound();
    }

    _resetRound() {
      for (let i = 0; i < 2; i++) {
        const old = this.fighters[i];
        const f = makeFighter(old.char, i);
        f.meter = old.meter;
        this.fighters[i] = f;
      }
      this.projectiles = [];
      this.timer = ROUND_TIME;
      this.timerTicks = 0;
      this.phase = 'intro';
      this.phaseTimer = 0;
      this.roundWinner = -1;
      this.timeOver = false;
    }

    _updateFighter(i) {
      const f = this.fighters[i];
      const ch = CHARACTERS[f.char];
      const fighting = this.phase === 'fight';
      const inp = fighting ? this.inputs[i] : 0;
      f.anim++;
      if (f.invuln > 0) f.invuln--;

      this._readBuffer(i);
      if (f.bufferT > 0) f.bufferT--; else f.buffer = 0;

      switch (f.state) {
        case 'hitstun':
        case 'blockstun':
          if (--f.stateTimer <= 0) this._toNeutral(f);
          break;
        case 'knockdown':
          f.vx = 0;
          if (--f.stateTimer <= 0) { f.state = 'getup'; f.stateTimer = 22; f.invuln = 24; }
          break;
        case 'getup':
          if (--f.stateTimer <= 0) { f.comboTaken = 0; this._toNeutral(f); }
          break;
        case 'attack':
          this._updateAttack(f, ch);
          break;
      }

      const grounded = f.onGround;
      const canAct = fighting && grounded && (f.state === 'idle' || f.state === 'walk' || f.state === 'crouch');
      const canAirAct = fighting && !grounded && f.state === 'jump' && !f.airAttackUsed;

      if ((canAct || canAirAct) && f.buffer) {
        if (this._tryAttack(f, ch, inp, grounded)) {
          f.buffer = 0; f.bufferT = 0;
        }
      }

      if (fighting && grounded && (f.state === 'idle' || f.state === 'walk' || f.state === 'crouch')) {
        const fwd = f.facing === 1 ? IN.RIGHT : IN.LEFT;
        const back = f.facing === 1 ? IN.LEFT : IN.RIGHT;
        if (inp & IN.UP) {
          let dir = 0;
          if (inp & IN.RIGHT) dir = 1; else if (inp & IN.LEFT) dir = -1;
          f.state = 'jump';
          f.vy = ch.jumpVel;
          f.vx = dir * ch.jumpSpeedX;
          f.onGround = false;
          f.airAttackUsed = false;
          f.crouching = false;
          this.events.push({ type: 'jump', slot: i });
        } else if (inp & IN.DOWN) {
          f.state = 'crouch'; f.crouching = true; f.vx = 0;
        } else if (inp & fwd) {
          f.state = 'walk'; f.crouching = false; f.vx = ch.walkSpeed * f.facing;
        } else if (inp & back) {
          f.state = 'walk'; f.crouching = false; f.vx = -ch.backSpeed * f.facing;
        } else {
          f.state = 'idle'; f.crouching = false; f.vx = 0;
        }
      } else if (!fighting && grounded && (f.state === 'walk' || f.state === 'crouch')) {
        f.state = 'idle'; f.vx = 0; f.crouching = false;
      }

      this._physics(f);
    }

    _tryAttack(f, ch, inp, grounded) {
      let key = null;
      const b = f.buffer;
      if (b === IN.SUPER) {
        if (!grounded || f.meter < METER_MAX) return false;
        key = 'super';
      } else if (b === IN.SPECIAL) {
        if (!grounded) return false;
        const mv = ch.moves.special;
        if (mv.projectile && this.projectiles.some(p => p.owner === f.slot)) return false;
        key = 'special';
      } else if (b === IN.HEAVY) {
        key = !grounded ? 'airHeavy' : (inp & IN.DOWN) ? 'crouchHeavy' : 'heavy';
      } else if (b === IN.LIGHT) {
        key = !grounded ? 'airLight' : (inp & IN.DOWN) ? 'crouchLight' : 'light';
      }
      if (!key) return false;
      const mv = ch.moves[key];
      f.state = 'attack';
      f.move = key;
      f.frame = 0;
      f.hitsDone = 0;
      f.lastHitFrame = -99;
      f.moveVx = mv.moveVx || 0;
      f.crouching = key === 'crouchLight' || key === 'crouchHeavy';
      if (grounded) f.vx = 0;
      if (!grounded) f.airAttackUsed = true;
      if (mv.invuln) f.invuln = mv.invuln;
      if (mv.super) {
        f.meter = 0;
        this.freeze = 40;
        this.freezeOwner = f.slot;
        this.events.push({ type: 'super', slot: f.slot, name: mv.name });
      } else if (mv.special) {
        this.events.push({ type: 'special', slot: f.slot, name: mv.name });
      } else {
        this.events.push({ type: 'swing', slot: f.slot, heavy: key.toLowerCase().includes('heavy') });
      }
      return true;
    }

    _updateAttack(f, ch) {
      const mv = ch.moves[f.move];
      f.frame++;
      const activeStart = mv.startup;
      const activeEnd = mv.startup + mv.active;
      if (mv.projectile && f.frame === activeStart) this._spawnProjectile(f, mv.projectile);
      if (f.onGround) {
        if (mv.moveVx && f.frame >= activeStart - 2 && f.frame < activeEnd) f.vx = f.moveVx * f.facing;
        else f.vx *= 0.6;
      }
      if (f.frame >= activeStart + mv.active + mv.recovery) {
        this._toNeutral(f);
      }
    }

    _spawnProjectile(f, p) {
      this.projectiles.push({
        id: ++this.projId,
        owner: f.slot,
        kind: p.kind,
        x: f.x + f.facing * (CHARACTERS[f.char].width * 0.5 + p.w * 0.3),
        y: f.y + p.y,
        vx: p.speed * f.facing,
        w: p.w,
        h: p.h,
        life: p.life,
        age: 0,
        hitsDone: 0,
        lastHit: -99,
        data: p,
      });
    }

    _toNeutral(f) {
      f.move = null;
      f.frame = 0;
      f.moveVx = 0;
      if (f.state === 'hitstun' || f.state === 'getup') f.comboTaken = 0;
      if (f.onGround) { f.state = 'idle'; f.vx = 0; }
      else f.state = 'jump';
      f.crouching = false;
    }

    _physics(f) {
      const ch = CHARACTERS[f.char];
      if (!f.onGround) {
        f.vy -= ch.gravity;
        f.y += f.vy;
        if (f.y <= 0) {
          f.y = 0;
          f.vy = 0;
          f.onGround = true;
          this._land(f);
        }
      }
      f.x += f.vx + f.push;
      f.push *= 0.82;
      if (Math.abs(f.push) < 0.1) f.push = 0;
      // Un chien à terre (sur le dos) prend plus de place : on l'écarte du bord
      const lying = f.state === 'ko' || f.state === 'airhit' || f.state === 'knockdown';
      const half = ch.width * (lying ? 0.8 : 0.3);
      f.x = clamp(f.x, WALL_MARGIN + half, STAGE_W - WALL_MARGIN - half);
    }

    _land(f) {
      this.events.push({ type: 'land', slot: f.slot, x: f.x });
      if (f.state === 'jump') { f.state = 'idle'; f.vx = 0; }
      else if (f.state === 'attack') {
        const mv = CHARACTERS[f.char].moves[f.move];
        if (mv && mv.air) this._toNeutral(f);
        f.vx = 0;
      } else if (f.state === 'airhit') {
        f.state = 'knockdown'; f.stateTimer = 40; f.vx = 0; f.invuln = 64;
        this.events.push({ type: 'thud', x: f.x });
      } else if (f.state === 'ko') {
        f.vx = 0;
        this.events.push({ type: 'thud', x: f.x });
      } else if (f.state === 'hitstun' || f.state === 'blockstun') {
        f.vx = 0;
      } else if (f.state === 'win') {
        f.vx = 0;
      }
    }

    _pushApart() {
      const [a, b] = this.fighters;
      if (a.state === 'ko' || b.state === 'ko') return;
      const ca = CHARACTERS[a.char], cb = CHARACTERS[b.char];
      const minDist = (ca.width + cb.width) * 0.5 * 0.88;
      const dx = b.x - a.x;
      const vertOverlap = Math.abs(a.y - b.y) < 70;
      if (!vertOverlap || Math.abs(dx) >= minDist) return;
      const overlap = minDist - Math.abs(dx);
      let dir = Math.sign(dx);
      if (dir === 0) dir = a.facing;
      a.x -= dir * overlap * 0.5;
      b.x += dir * overlap * 0.5;
      // Corrige contre les murs
      for (const f of this.fighters) {
        const half = CHARACTERS[f.char].width * 0.5;
        f.x = clamp(f.x, WALL_MARGIN + half * 0.6, STAGE_W - WALL_MARGIN - half * 0.6);
      }
      const ndx = b.x - a.x;
      if (Math.abs(ndx) < minDist - 0.5) {
        const fix = minDist - Math.abs(ndx);
        // L'un est collé au mur : on pousse l'autre
        const minA = WALL_MARGIN + ca.width * 0.3;
        const maxA = STAGE_W - WALL_MARGIN - ca.width * 0.3;
        if (a.x <= minA + 0.5 || a.x >= maxA - 0.5) b.x += dir * fix;
        else a.x -= dir * fix;
      }
    }

    _autoFace() {
      const [a, b] = this.fighters;
      for (const [f, o] of [[a, b], [b, a]]) {
        if (!f.onGround) continue;
        if (f.state !== 'idle' && f.state !== 'walk' && f.state !== 'crouch' && f.state !== 'getup') continue;
        const d = o.x - f.x;
        if (Math.abs(d) > 2) {
          const nf = d > 0 ? 1 : -1;
          if (nf !== f.facing && f.state === 'walk') f.vx = -f.vx;
          f.facing = nf;
        }
      }
    }

    hurtbox(f) {
      const ch = CHARACTERS[f.char];
      const h = f.crouching ? ch.crouchHeight : ch.height;
      // Décalée vers l'avant : la tête dépasse du corps
      return { l: f.x - ch.width * 0.5 + f.facing * ch.width * 0.14, b: f.y, w: ch.width, h };
    }

    hitboxOf(f) {
      if (f.state !== 'attack') return null;
      const mv = CHARACTERS[f.char].moves[f.move];
      if (!mv.hitbox) return null;
      if (f.frame < mv.startup || f.frame >= mv.startup + mv.active) return null;
      const hb = mv.hitbox;
      const l = f.facing === 1 ? f.x + hb.x : f.x - hb.x - hb.w;
      return { l, b: f.y + hb.y, w: hb.w, h: hb.h };
    }

    _vulnerable(f) {
      return f.invuln <= 0 && f.state !== 'knockdown' && f.state !== 'getup' && f.state !== 'ko' && f.state !== 'airhit' && f.state !== 'win';
    }

    _checkHits() {
      const pending = [];
      for (let i = 0; i < 2; i++) {
        const att = this.fighters[i];
        const def = this.fighters[1 - i];
        const box = this.hitboxOf(att);
        if (!box) continue;
        const mv = CHARACTERS[att.char].moves[att.move];
        const maxHits = mv.hits || 1;
        if (att.hitsDone >= maxHits) continue;
        if (att.hitsDone > 0 && att.frame - att.lastHitFrame < (mv.hitInterval || 99)) continue;
        if (!this._vulnerable(def)) continue;
        const hurt = this.hurtbox(def);
        if (rectsOverlap(box, hurt)) pending.push({ att, def, mv, box, hurt });
      }
      for (const h of pending) {
        const { att, def, mv, box, hurt } = h;
        att.hitsDone++;
        att.lastHitFrame = att.frame;
        const last = att.hitsDone >= (mv.hits || 1);
        const dir = def.x >= att.x ? 1 : -1;
        const cx = (Math.max(box.l, hurt.l) + Math.min(box.l + box.w, hurt.l + hurt.w)) / 2;
        const cy = (Math.max(box.b, hurt.b) + Math.min(box.b + box.h, hurt.b + hurt.h)) / 2;
        this._applyHit(att, def, mv, dir, att.x, last, cx, cy, false);
        if (mv.onHitVx !== undefined) att.moveVx = mv.onHitVx;
      }
    }

    _isBlocking(def, mv, srcX) {
      if (!def.onGround) return false;
      if (def.state !== 'idle' && def.state !== 'walk' && def.state !== 'crouch' && def.state !== 'blockstun') return false;
      if (this.phase !== 'fight') return false;
      const inp = this.inputs[def.slot];
      const away = srcX > def.x ? IN.LEFT : IN.RIGHT;
      if (!(inp & away)) return false;
      const crouch = !!(inp & IN.DOWN);
      if (mv.level === 'low' && !crouch) return false;
      if (mv.level === 'overhead' && crouch) return false;
      return true;
    }

    _applyHit(att, def, mv, dir, srcX, last, hx, hy, isProj) {
      const blocked = this._isBlocking(def, mv, srcX);
      const ch = CHARACTERS[def.char];
      def.move = null;
      def.frame = 0;
      if (blocked) {
        def.hp = Math.max(0, def.hp - (mv.chip || 0));
        def.state = 'blockstun';
        def.stateTimer = mv.blockstun;
        def.crouching = !!(this.inputs[def.slot] & IN.DOWN);
        def.vx = 0;
        def.push = dir * mv.kb * 0.9;
        att.meter = Math.min(METER_MAX, att.meter + mv.damage * 0.06);
        def.meter = Math.min(METER_MAX, def.meter + mv.damage * 0.04);
        this.hitstop = Math.max(this.hitstop, 5);
        this.events.push({ type: 'block', x: hx, y: hy, slot: def.slot });
        if (def.hp <= 0) this._koFighter(def, dir);
      } else {
        const scale = Math.max(0.3, 1 - 0.1 * def.comboTaken);
        const dmg = Math.max(1, Math.round(mv.damage * scale));
        def.hp = Math.max(0, def.hp - dmg);
        def.comboTaken++;
        att.meter = Math.min(METER_MAX, att.meter + mv.damage * 0.14);
        def.meter = Math.min(METER_MAX, def.meter + mv.damage * 0.07);
        if (def.hp <= 0) {
          this._koFighter(def, dir);
        } else if (!def.onGround || (last && (mv.knockdown || mv.launch))) {
          def.state = 'airhit';
          def.vy = mv.launch || (def.onGround ? 8 : Math.max(6, def.vy + 4));
          def.vx = dir * (mv.launch ? 3.5 : 4);
          def.onGround = false;
          def.crouching = false;
        } else {
          def.state = 'hitstun';
          def.stateTimer = mv.hitstun;
          def.vx = 0;
          def.push = dir * mv.kb;
        }
        this.hitstop = Math.max(this.hitstop, mv.hitstop || (dmg >= 70 ? 9 : 6));
        this.events.push({
          type: 'hit', x: hx, y: hy, slot: def.slot, dmg,
          heavy: dmg >= 65 || !!mv.super, combo: def.comboTaken,
        });
      }
      // Contre un mur, c'est l'attaquant qui recule
      if (!isProj) {
        const half = ch.width * 0.5;
        const nearWall = def.x <= WALL_MARGIN + half * 0.6 + 4 || def.x >= STAGE_W - WALL_MARGIN - half * 0.6 - 4;
        if (nearWall && att.onGround) att.push = -dir * mv.kb * 0.7;
      }
    }

    _koFighter(def, dir) {
      def.hp = 0;
      def.state = 'ko';
      def.vy = 10;
      def.vx = dir * 4.5;
      def.onGround = false;
      def.crouching = false;
      def.move = null;
      this.hitstop = 16;
    }

    _updateProjectiles() {
      const ps = this.projectiles;
      for (const p of ps) {
        p.x += p.vx;
        p.age++;
        p.life--;
      }
      // Choc entre projectiles adverses
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i], b = ps[j];
          if (a.owner === b.owner || a.life <= 0 || b.life <= 0) continue;
          if (rectsOverlap(this._projRect(a), this._projRect(b))) {
            const pa = a.data.power || 1, pb = b.data.power || 1;
            if (pa <= pb) a.life = 0;
            if (pb <= pa) b.life = 0;
            if (pa > pb) a.data = Object.assign({}, a.data, { power: pa - pb });
            if (pb > pa) b.data = Object.assign({}, b.data, { power: pb - pa });
            this.events.push({ type: 'clash', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 20 });
          }
        }
      }
      for (const p of ps) {
        if (p.life <= 0) continue;
        const def = this.fighters[1 - p.owner];
        const att = this.fighters[p.owner];
        const d = p.data;
        if (!this._vulnerable(def)) continue;
        if (p.hitsDone > 0 && p.age - p.lastHit < (d.hitInterval || 99)) continue;
        const r = this._projRect(p);
        const hurt = this.hurtbox(def);
        if (rectsOverlap(r, hurt)) {
          p.hitsDone++;
          p.lastHit = p.age;
          const last = p.hitsDone >= (d.hits || 1);
          const dir = p.vx >= 0 ? 1 : -1;
          const hx = def.x - dir * CHARACTERS[def.char].width * 0.3;
          const hy = Math.min(def.y + 60, r.b + r.h / 2);
          this._applyHit(att, def, d, dir, p.x - dir * 1000, last, hx, hy, true);
          if (last) p.life = 0;
          else if (d.hits > 1) p.vx = dir * d.speed * 0.25; // le souffle « accroche » sa cible
        }
      }
      this.projectiles = ps.filter(p => p.life > 0 && p.x > -150 && p.x < STAGE_W + 150);
    }

    _projRect(p) {
      return { l: p.x - p.w / 2, b: p.y, w: p.w, h: p.h };
    }

    _checkKO() {
      if (this.phase !== 'fight') return;
      if (this.fighters[0].hp <= 0 || this.fighters[1].hp <= 0) this._endRound(false);
    }

    // État compact envoyé aux clients / lu par le rendu
    snapshot() {
      return {
        f: this.frameCount,
        phase: this.phase,
        pt: this.phaseTimer,
        round: this.round,
        timer: this.timer,
        wins: this.wins.slice(),
        hitstop: this.hitstop,
        freeze: this.freeze,
        freezeOwner: this.freezeOwner,
        rw: this.roundWinner,
        mw: this.matchWinner,
        to: this.timeOver,
        fighters: this.fighters.map(f => ({
          char: f.char,
          x: Math.round(f.x * 10) / 10,
          y: Math.round(f.y * 10) / 10,
          vx: Math.round(f.vx * 10) / 10,
          vy: Math.round(f.vy * 10) / 10,
          facing: f.facing,
          hp: f.hp,
          meter: Math.round(f.meter * 10) / 10,
          state: f.state,
          move: f.move,
          frame: f.frame,
          st: f.stateTimer,
          crouch: f.crouching,
          combo: f.comboTaken,
          inv: f.invuln > 0,
          anim: f.anim,
          onGround: f.onGround,
        })),
        projectiles: this.projectiles.map(p => ({
          id: p.id, owner: p.owner, kind: p.kind, x: Math.round(p.x), y: Math.round(p.y),
          vx: p.vx, w: p.w, h: p.h, age: p.age,
        })),
        events: this.events.slice(),
      };
    }
  }

  /*
   * IA simple pour le mode « contre l'ordi ».
   */
  class CpuBrain {
    constructor(level) {
      this.level = level || 0.6; // 0..1
      this.bits = 0;
      this.holdTicks = 0;
      this.reactDelay = 0;
      this.lastDecision = 0;
    }

    think(game, slot) {
      const me = game.fighters[slot];
      const op = game.fighters[1 - slot];
      const ch = CHARACTERS[me.char];
      if (game.phase !== 'fight') { this.bits = 0; return 0; }

      const dx = op.x - me.x;
      const dist = Math.abs(dx);
      const toward = dx > 0 ? IN.RIGHT : IN.LEFT;
      const away = dx > 0 ? IN.LEFT : IN.RIGHT;
      const r = Math.random;
      const lvl = this.level;

      // Les boutons d'attaque doivent être relâchés pour être réappuyés
      const attackBits = IN.LIGHT | IN.HEAVY | IN.SPECIAL | IN.SUPER;
      if (this.bits & attackBits) { this.bits &= ~attackBits; return this.bits; }

      if (this.holdTicks > 0) { this.holdTicks--; return this.bits; }

      // Menaces : projectile qui arrive, adversaire qui attaque de près
      const incoming = game.projectiles.find(p => p.owner !== slot && Math.sign(p.vx) === Math.sign(me.x - p.x) && Math.abs(p.x - me.x) < 260);
      const opAttacking = op.state === 'attack' && dist < 190;

      if (me.state === 'blockstun') { return this.bits; }

      if (incoming && r() < 0.55 * lvl + 0.1) {
        if (r() < 0.5 && me.onGround) { this.bits = IN.UP | toward; this.holdTicks = 4; }
        else { this.bits = away; this.holdTicks = 14; }
        return this.bits;
      }
      if (opAttacking && r() < 0.5 * lvl) {
        const mv = CHARACTERS[op.char].moves[op.move];
        this.bits = away | (mv && mv.level === 'low' ? IN.DOWN : 0);
        this.holdTicks = 10;
        return this.bits;
      }

      if (!(me.state === 'idle' || me.state === 'walk' || me.state === 'crouch')) {
        // Attaque aérienne en descente
        if (me.state === 'jump' && me.vy < 2 && dist < 150 && r() < 0.3) {
          this.bits = r() < 0.5 ? IN.HEAVY : IN.LIGHT;
        }
        return this.bits;
      }

      // Rythme de décision
      if (game.frameCount - this.lastDecision < 6 + Math.floor((1 - lvl) * 14)) return this.bits;
      this.lastDecision = game.frameCount;

      if (me.meter >= METER_MAX && dist < (me.char === 'matcha' ? 320 : 520) && r() < 0.35) {
        this.bits = IN.SUPER; return this.bits;
      }

      if (dist > 340) {
        if (ch.moves.special.projectile && r() < 0.35) { this.bits = IN.SPECIAL; return this.bits; }
        if (me.char === 'matcha' && dist < 420 && r() < 0.15) { this.bits = IN.SPECIAL; return this.bits; }
        this.bits = toward; this.holdTicks = 10 + Math.floor(r() * 15); return this.bits;
      }
      if (dist > 150) {
        const roll = r();
        if (roll < 0.15) { this.bits = IN.UP | toward; this.holdTicks = 3; }
        else if (roll < 0.25 && me.char === 'matcha') { this.bits = IN.SPECIAL; }
        else if (roll < 0.25 && ch.moves.special.projectile) { this.bits = IN.SPECIAL; }
        else if (roll < 0.85) { this.bits = toward; this.holdTicks = 6 + Math.floor(r() * 10); }
        else { this.bits = away; this.holdTicks = 8; }
        return this.bits;
      }
      // Corps à corps
      const roll = r();
      if (roll < 0.3) this.bits = IN.LIGHT;
      else if (roll < 0.48) this.bits = IN.HEAVY;
      else if (roll < 0.62) this.bits = IN.DOWN | IN.LIGHT;
      else if (roll < 0.72) this.bits = IN.DOWN | IN.HEAVY;
      else if (roll < 0.86) { this.bits = away | (r() < 0.5 ? IN.DOWN : 0); this.holdTicks = 12; }
      else { this.bits = IN.UP | (r() < 0.5 ? toward : 0); this.holdTicks = 3; }
      return this.bits;
    }
  }

  return {
    TICK_RATE, STAGE_W, STAGE_H, GROUND_Y, ROUND_TIME, WINS_NEEDED, METER_MAX,
    IN, CHARACTERS, CHAR_IDS, Game, CpuBrain,
  };
});
