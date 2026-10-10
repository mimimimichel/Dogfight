/*
 * Dogfight — logique d'un salon (choix des chiens, partie, revanche).
 * Partagée entre le serveur Node (WebSocket) et le navigateur de l'hôte
 * en mode pair-à-pair (WebRTC).
 *
 * Un « joueur » est un objet { send(texte), slot } ; send reçoit du JSON déjà sérialisé.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./game-core.js'));
  else root.DogRoom = factory(root.DogGame);
})(typeof self !== 'undefined' ? self : this, function (Core) {
  'use strict';

  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function cleanName(n) {
    n = String(n || '').replace(/[^\p{L}\p{N} _\-'.]/gu, '').trim().slice(0, 16);
    return n || 'Anonyme';
  }

  function send(p, msg) { if (p) p.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); }

  class Room {
    constructor(code, isQuick, hooks) {
      this.code = code;
      this.isQuick = isQuick;
      this.hooks = hooks || {};
      this.players = [null, null];
      this.names = ['', ''];
      this.picks = [null, null];
      this.ready = [false, false];
      this.rematch = [false, false];
      this.game = null;
      this.loop = null;
    }

    get count() { return this.players.filter(Boolean).length; }

    add(p, name) {
      const slot = this.players[0] ? 1 : 0;
      this.players[slot] = p;
      this.names[slot] = cleanName(name);
      p.room = this;
      p.slot = slot;
      send(p, { t: 'joined', code: this.code, slot, quick: this.isQuick });
      this.broadcastLobby();
      return slot;
    }

    remove(p) {
      const slot = this.players.indexOf(p);
      if (slot < 0) return;
      this.players[slot] = null;
      this.names[slot] = '';
      this.picks = [null, null];
      this.ready = [false, false];
      this.rematch = [false, false];
      p.room = null;
      this.stopGame();
      const other = this.players[1 - slot];
      if (other) send(other, { t: 'opponentLeft' });
      if (this.count === 0) {
        if (this.hooks.onEmpty) this.hooks.onEmpty(this);
        return;
      }
      // Le joueur restant devient le joueur 1
      if (slot === 0) {
        this.players = [this.players[1], null];
        this.names = [this.names[1], ''];
        this.players[0].slot = 0;
      }
      send(this.players[0], { t: 'joined', code: this.code, slot: 0, quick: this.isQuick });
      if (this.hooks.onWaiting) this.hooks.onWaiting(this);
      this.broadcastLobby();
    }

    broadcastLobby() {
      const msg = JSON.stringify({
        t: 'lobby',
        code: this.code,
        players: [0, 1].map(i => this.players[i] ? { name: this.names[i], pick: this.picks[i], ready: this.ready[i] } : null),
      });
      for (const p of this.players) send(p, msg);
    }

    // Messages venant d'un joueur (déjà décodés)
    handle(p, msg) {
      switch (msg.t) {
        case 'pick': this.pick(p.slot, msg.char, msg.ready); break;
        case 'i': if (this.game) this.game.setInput(p.slot, (msg.b | 0) & 0xff); break;
        case 'rematch': this.voteRematch(p.slot); break;
        case 'reselect': if (this.game && this.game.phase === 'matchover') this.backToSelect(); break;
        case 'leave': this.remove(p); break;
        case 'ping': send(p, { t: 'pong', ts: msg.ts }); break;
      }
    }

    pick(slot, charId, ready) {
      if (this.game || !Core.CHARACTERS[charId]) return;
      this.picks[slot] = charId;
      this.ready[slot] = !!ready;
      this.broadcastLobby();
      if (this.count === 2 && this.ready[0] && this.ready[1]) this.startGame();
    }

    startGame() {
      this.game = new Core.Game(this.picks);
      this.rematch = [false, false];
      for (const p of this.players) send(p, { t: 'start', chars: this.picks, names: this.names, slot: p.slot });
      const stepMs = 1000 / Core.TICK_RATE;
      let next = now();
      const run = () => {
        if (!this.game) return;
        const t = now();
        let steps = 0;
        while (t >= next && steps < 5) {
          this.game.tick();
          const snap = JSON.stringify({ t: 's', s: this.game.snapshot() });
          for (const p of this.players) send(p, snap);
          next += stepMs;
          steps++;
        }
        if (t - next > 250) next = t; // rattrapage après un gros ralentissement
        this.loop = setTimeout(run, Math.max(0, next - now()));
      };
      this.loop = setTimeout(run, stepMs);
    }

    stopGame() {
      if (this.loop) clearTimeout(this.loop);
      this.loop = null;
      this.game = null;
    }

    voteRematch(slot) {
      if (!this.game || this.game.phase !== 'matchover') return;
      this.rematch[slot] = true;
      for (const p of this.players) send(p, { t: 'rematch', votes: this.rematch });
      if (this.rematch[0] && this.rematch[1]) {
        this.stopGame();
        this.startGame();
      }
    }

    backToSelect() {
      this.stopGame();
      this.ready = [false, false];
      this.rematch = [false, false];
      for (const p of this.players) send(p, { t: 'select' });
      this.broadcastLobby();
    }
  }

  function makeCode(taken) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
      code = '';
      for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    } while (taken && taken(code));
    return code;
  }

  return { Room, makeCode, cleanName };
});
