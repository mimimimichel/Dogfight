'use strict';
/*
 * Dogfight — serveur de jeu en ligne.
 * - Sert les fichiers statiques de /public
 * - WebSocket : salons privés (code), matchmaking rapide, simulation autoritaire 60 Hz
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const Core = require('./public/game-core.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: wss.clients.size }));
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end('Introuvable'); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });

/** @type {Map<string, Room>} */
const rooms = new Map();
let quickWaiting = null; // salon en attente pour le match rapide

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  } while (rooms.has(code));
  return code;
}

function send(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function cleanName(n) {
  n = String(n || '').replace(/[^\p{L}\p{N} _\-'.]/gu, '').trim().slice(0, 16);
  return n || 'Anonyme';
}

class Room {
  constructor(code, isQuick) {
    this.code = code;
    this.isQuick = isQuick;
    this.players = [null, null];
    this.names = ['', ''];
    this.picks = [null, null];
    this.ready = [false, false];
    this.rematch = [false, false];
    this.game = null;
    this.loop = null;
  }

  get count() { return this.players.filter(Boolean).length; }

  add(ws, name) {
    const slot = this.players[0] ? 1 : 0;
    this.players[slot] = ws;
    this.names[slot] = name;
    ws.room = this;
    ws.slot = slot;
    send(ws, { t: 'joined', code: this.code, slot, quick: this.isQuick });
    this.broadcastLobby();
    return slot;
  }

  remove(ws) {
    const slot = this.players.indexOf(ws);
    if (slot < 0) return;
    this.players[slot] = null;
    this.names[slot] = '';
    this.picks = [null, null];
    this.ready = [false, false];
    this.rematch = [false, false];
    ws.room = null;
    this.stopGame();
    const other = this.players[1 - slot];
    if (other) send(other, { t: 'opponentLeft' });
    if (this.count === 0) {
      rooms.delete(this.code);
      if (quickWaiting === this) quickWaiting = null;
    } else {
      // Le joueur restant devient le joueur 1
      if (slot === 0) {
        this.players = [this.players[1], null];
        this.names = [this.names[1], ''];
        this.players[0].slot = 0;
      }
      send(this.players[0], { t: 'joined', code: this.code, slot: 0, quick: this.isQuick });
      if (this.isQuick && !quickWaiting) quickWaiting = this;
      this.broadcastLobby();
    }
  }

  broadcastLobby() {
    const msg = {
      t: 'lobby',
      code: this.code,
      players: [0, 1].map(i => this.players[i] ? { name: this.names[i], pick: this.picks[i], ready: this.ready[i] } : null),
    };
    for (const ws of this.players) send(ws, msg);
  }

  pick(slot, charId, ready) {
    if (this.game) return;
    if (!Core.CHARACTERS[charId]) return;
    this.picks[slot] = charId;
    this.ready[slot] = !!ready;
    this.broadcastLobby();
    if (this.count === 2 && this.ready[0] && this.ready[1]) this.startGame();
  }

  startGame() {
    this.game = new Core.Game(this.picks);
    this.rematch = [false, false];
    for (const ws of this.players) {
      send(ws, { t: 'start', chars: this.picks, names: this.names, slot: ws.slot });
    }
    const stepMs = 1000 / Core.TICK_RATE;
    let next = performance.now();
    const run = () => {
      if (!this.game) return;
      const now = performance.now();
      let steps = 0;
      while (now >= next && steps < 5) {
        this.game.tick();
        const snap = JSON.stringify({ t: 's', s: this.game.snapshot() });
        for (const ws of this.players) if (ws && ws.readyState === 1) ws.send(snap);
        next += stepMs;
        steps++;
      }
      if (now - next > 250) next = now; // rattrapage après un gros lag
      this.loop = setTimeout(run, Math.max(0, next - performance.now()));
    };
    this.loop = setTimeout(run, stepMs);
  }

  stopGame() {
    if (this.loop) clearTimeout(this.loop);
    this.loop = null;
    this.game = null;
  }

  input(slot, bits) {
    if (this.game) this.game.setInput(slot, bits & 0xff);
  }

  voteRematch(slot) {
    if (!this.game || this.game.phase !== 'matchover') return;
    this.rematch[slot] = true;
    for (const ws of this.players) send(ws, { t: 'rematch', votes: this.rematch });
    if (this.rematch[0] && this.rematch[1]) {
      this.stopGame();
      this.startGame();
    }
  }

  backToSelect() {
    this.stopGame();
    this.ready = [false, false];
    this.rematch = [false, false];
    for (const ws of this.players) send(ws, { t: 'select' });
    this.broadcastLobby();
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    const room = ws.room;

    switch (msg.t) {
      case 'create': {
        if (room) room.remove(ws);
        const r = new Room(makeCode(), false);
        rooms.set(r.code, r);
        r.add(ws, cleanName(msg.name));
        break;
      }
      case 'join': {
        if (room) room.remove(ws);
        const code = String(msg.code || '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) return send(ws, { t: 'error', msg: `Salon « ${code} » introuvable.` });
        if (r.count >= 2) return send(ws, { t: 'error', msg: 'Ce salon est déjà complet.' });
        r.add(ws, cleanName(msg.name));
        if (quickWaiting === r && r.count === 2) quickWaiting = null;
        break;
      }
      case 'quick': {
        if (room) room.remove(ws);
        if (quickWaiting && quickWaiting.count === 1) {
          const r = quickWaiting;
          quickWaiting = null;
          r.add(ws, cleanName(msg.name));
        } else {
          const r = new Room(makeCode(), true);
          rooms.set(r.code, r);
          quickWaiting = r;
          r.add(ws, cleanName(msg.name));
        }
        break;
      }
      case 'pick':
        if (room) room.pick(ws.slot, msg.char, msg.ready);
        break;
      case 'i':
        if (room) room.input(ws.slot, msg.b | 0);
        break;
      case 'rematch':
        if (room) room.voteRematch(ws.slot);
        break;
      case 'reselect':
        if (room && room.game && room.game.phase === 'matchover') room.backToSelect();
        break;
      case 'leave':
        if (room) room.remove(ws);
        break;
      case 'ping':
        send(ws, { t: 'pong', ts: msg.ts });
        break;
    }
  });

  ws.on('close', () => {
    if (ws.room) ws.room.remove(ws);
  });
});

// Détection des connexions mortes
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);

server.listen(PORT, () => {
  console.log(`🐕 Dogfight prêt sur http://localhost:${PORT}`);
});
