/*
 * Matcha & Ainu — service worker : jeu installable et jouable hors-ligne.
 *
 * - Au premier lancement, on précharge le « cœur » du jeu (HTML, CSS, JS, vendor/).
 * - HTML / CSS / JS (et les .json d'index) : réseau d'abord, pour avoir tout de suite la
 *   dernière version du jeu ; si le réseau ne répond pas en 2,5 s (ou hors-ligne), le cache.
 * - adventure/assets/** (photos, voix, modèles) : « cache-first », mis en cache au
 *   moment où ils sont demandés → chaque niveau déjà joué devient disponible hors-ligne.
 * - Jamais de cache pour /api/* ni pour les autres domaines (PeerJS, polices, TURN…).
 *
 * Pour publier une nouvelle version du cœur : changer VERSION (les anciens caches sont
 * supprimés à l'activation). ASSETS_VERSION ne change que si des fichiers de
 * adventure/assets/ sont modifiés sans changer de nom (sinon on garderait les anciens).
 */
'use strict';

const VERSION = 'v7';
const ASSETS_VERSION = 'v1';
const PREFIX = 'matcha-';
const CORE = PREFIX + 'core-' + VERSION;
const ASSETS = PREFIX + 'assets-' + ASSETS_VERSION;
// iOS limite le stockage d'une appli web (~50 Mo) : on plafonne le cache des assets
const MAX_ASSETS = 300;

const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'img/duo.webp',
  // public/
  'audio.js', 'coop.js', 'game-core.js', 'loader.js', 'main.js', 'p2p.js', 'profiles.js',
  'memories.js', 'carnet.js', 'niche.js',
  'render.js', 'room.js', 'touch.js',
  'brand.css', 'home.css', 'style.css',
  // public/vendor/
  'vendor/peerjs.min.js', 'vendor/qrcode.js', 'vendor/three.module.min.js',
  // public/adventure/ (sans les assets lourds)
  'adventure/adventure.css',
  'adventure/cinema.js', 'adventure/city.js', 'adventure/citykit.js', 'adventure/cityplay.js',
  'adventure/current.js', 'adventure/farm.js', 'adventure/farmkit.js', 'adventure/forest.js', 'adventure/game.js', 'adventure/level1.js',
  'adventure/level2.js', 'adventure/level3.js', 'adventure/level4.js', 'adventure/level5.js', 'adventure/models.js',
  'adventure/level6.js', 'adventure/beach.js', 'adventure/beachplay.js', 'adventure/level7.js', 'adventure/level8.js', 'adventure/castle.js',
  'adventure/npcs.js', 'adventure/post.js', 'adventure/realtex.js', 'adventure/sky.js',
  'adventure/sky_boss.js', 'adventure/snow.js', 'adventure/story.js', 'adventure/seasons.js', 'adventure/toon.js', 'adventure/voice.js',
  'adventure/voices.js', 'adventure/wardrobe.js', 'adventure/world.js',
  'adventure/forestkit.js',
];

const SCOPE = new URL(self.registration ? self.registration.scope : './', self.location.href);
const ASSETS_PATH = new URL('adventure/assets/', SCOPE).pathname;
const API_PATH = new URL('api/', SCOPE).pathname;
const INDEX_URL = new URL('index.html', SCOPE).href;

// ---------------------------------------------------------------------------
// Installation : précache du cœur (un fichier manquant ne bloque pas le reste)
// ---------------------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE);
    await Promise.all(PRECACHE.map(async (path) => {
      const url = new URL(path, SCOPE).href;
      try {
        const res = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
        if (res.ok) await cache.put(url, res);
      } catch (e) { /* hors-ligne pendant l'installation : on réessaiera */ }
    }));
    await self.skipWaiting();
  })());
});

// ---------------------------------------------------------------------------
// Activation : on supprime les caches des anciennes versions
// ---------------------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([CORE, ASSETS]);
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith(PREFIX) && !keep.has(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// ---------------------------------------------------------------------------
// Requêtes
// ---------------------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // PeerJS, polices, TURN… : réseau direct
  if (url.pathname.startsWith(API_PATH)) return;             // /api/* : jamais en cache
  if (url.pathname === '/health' || url.pathname.endsWith('/sw.js')) return;
  if (req.headers.has('range')) return;                      // lecture audio partielle : réseau direct

  if (url.pathname.startsWith(ASSETS_PATH) && !url.pathname.endsWith('.json')) {
    event.respondWith(cacheFirst(req, url));
    return;
  }
  // Une seule page HTML : toutes les navigations (?coop=…, ?menu=coop…) servent index.html
  const isPage = req.mode === 'navigate' && (url.pathname === SCOPE.pathname || url.pathname.endsWith('/index.html'));
  if (req.mode === 'navigate' && !isPage) return;
  event.respondWith(networkFirst(isPage ? INDEX_URL : stripSearch(url)));
});

function stripSearch(url) {
  return url.origin + url.pathname;
}

/** Cœur du jeu : la dernière version par le réseau, le cache si le réseau traîne ou manque. */
async function networkFirst(key) {
  const cache = await caches.open(CORE);
  const update = fetch(key, { cache: 'no-cache', credentials: 'same-origin' })
    .then(async (res) => {
      if (res.ok && res.type === 'basic') await cache.put(key, res.clone());
      return res;
    });
  const slow = new Promise((resolve) => setTimeout(resolve, 2500, null));
  try {
    const res = await Promise.race([update, slow]);
    if (res) return res;
    const cached = await cache.match(key);
    if (cached) { update.catch(() => {}); return cached; }
    return await update;
  } catch (e) {
    const cached = await cache.match(key);
    if (cached) return cached;
    // hors-ligne et jamais vu : pour une page, on retombe sur l'accueil
    if (key === INDEX_URL) {
      const home = await cache.match(new URL('./', SCOPE).href);
      if (home) return home;
    }
    return new Response('Hors-ligne', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

/** Photos, voix, modèles : une fois téléchargés, ils restent disponibles hors-ligne. */
async function cacheFirst(req, url) {
  const key = stripSearch(url);
  const cache = await caches.open(ASSETS);
  const cached = await cache.match(key);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res.ok && res.status === 200 && res.type === 'basic') {
      putAsset(cache, key, res.clone());
    }
    return res;
  } catch (e) {
    // Hors-ligne : une photo peut être remplacée par sa variante allégée (_s.jpg) déjà en cache,
    // ou l'inverse.
    const alt = altPhoto(key);
    if (alt) {
      const other = await cache.match(alt);
      if (other) return other;
    }
    return new Response('', { status: 504, statusText: 'Hors-ligne' });
  }
}

function altPhoto(key) {
  if (!/\.jpg$/i.test(key)) return null;
  return /_s\.jpg$/i.test(key) ? key.replace(/_s\.jpg$/i, '.jpg') : key.replace(/\.jpg$/i, '_s.jpg');
}

// Écritures en série : évite de recompter le cache en parallèle à chaque photo
let assetQueue = Promise.resolve();
function putAsset(cache, key, res) {
  assetQueue = assetQueue.then(async () => {
    try {
      await cache.put(key, res);
    } catch (e) {
      // quota dépassé (iOS) : on libère de la place et on abandonne ce fichier
      await trimAssets(cache, Math.floor(MAX_ASSETS * 0.7));
      return;
    }
    await trimAssets(cache, MAX_ASSETS);
  }).catch(() => {});
  return assetQueue;
}

/** Supprime les plus anciennes entrées au-delà de `max`. */
async function trimAssets(cache, max) {
  const keys = await cache.keys(); // ordre d'insertion : les plus anciennes en premier
  let excess = keys.length - max;
  if (excess <= 0) return;
  // Parmi les photos dont la variante allégée (_s.jpg) est aussi en cache, on retire d'abord
  // la grande version : la petite suffit pour jouer hors-ligne.
  const have = new Set(keys.map((r) => r.url));
  const doomed = [];
  for (const r of keys) {
    if (excess - doomed.length <= 0) break;
    if (/\.jpg$/i.test(r.url) && !/_s\.jpg$/i.test(r.url) && have.has(altPhoto(r.url))) doomed.push(r);
  }
  for (const r of keys) {
    if (doomed.length >= excess) break;
    if (!doomed.includes(r)) doomed.push(r);
  }
  await Promise.all(doomed.slice(0, excess).map((r) => cache.delete(r)));
}
