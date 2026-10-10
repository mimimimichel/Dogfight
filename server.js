'use strict';
/*
 * Dogfight — serveur de jeu (optionnel).
 * - Sert les fichiers statiques de /public
 * - WebSocket : salons privés (code), matchmaking rapide, simulation autoritaire 60 Hz
 *
 * Sans ce serveur (hébergement statique), le client bascule en pair-à-pair WebRTC.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Room, makeCode } = require('./public/room.js');

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

/** @type {Map<string, Room>} */
const rooms = new Map();
let quickWaiting = null; // salon en attente pour le match rapide

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, transport: 'ws', rooms: rooms.size, players: wss.clients.size }));
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

function newRoom(isQuick) {
  const r = new Room(makeCode(c => rooms.has(c)), isQuick, {
    onEmpty: (room) => {
      rooms.delete(room.code);
      if (quickWaiting === room) quickWaiting = null;
    },
    onWaiting: (room) => { if (room.isQuick && !quickWaiting) quickWaiting = room; },
  });
  rooms.set(r.code, r);
  return r;
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // Le « joueur » vu par le salon
  const player = {
    send: (txt) => { if (ws.readyState === 1) ws.send(txt); },
    room: null,
    slot: 0,
  };
  const reply = (msg) => player.send(JSON.stringify(msg));

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg.t !== 'string') return;
    const room = player.room;

    switch (msg.t) {
      case 'create': {
        if (room) room.remove(player);
        newRoom(false).add(player, msg.name);
        break;
      }
      case 'join': {
        if (room) room.remove(player);
        const code = String(msg.code || '').toUpperCase().trim();
        const r = rooms.get(code);
        if (!r) return reply({ t: 'error', msg: `Salon « ${code} » introuvable.` });
        if (r.count >= 2) return reply({ t: 'error', msg: 'Ce salon est déjà complet.' });
        r.add(player, msg.name);
        if (quickWaiting === r && r.count === 2) quickWaiting = null;
        break;
      }
      case 'quick': {
        if (room) room.remove(player);
        if (quickWaiting && quickWaiting.count === 1) {
          const r = quickWaiting;
          quickWaiting = null;
          r.add(player, msg.name);
        } else {
          quickWaiting = newRoom(true);
          quickWaiting.add(player, msg.name);
        }
        break;
      }
      case 'ping':
        reply({ t: 'pong', ts: msg.ts });
        break;
      default:
        if (room) room.handle(player, msg);
    }
  });

  ws.on('close', () => {
    if (player.room) player.room.remove(player);
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
