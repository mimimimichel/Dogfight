/*
 * Matcha & Ainu — aventure à deux en ligne (pair-à-pair via PeerJS).
 *
 * Un joueur crée la partie et choisit son chien ; son navigateur fait tourner
 * l'aventure. L'autre rejoint avec le code (ou le lien) et joue l'autre chien :
 * il envoie ses commandes et reçoit l'état du jeu.
 */
(function () {
  'use strict';

  const PREFIX = 'dogfight-mimimimichel-adv-';
  const PEER_OPTS = { debug: 1 };
  // Test : ?peer=hote:port pour utiliser un serveur PeerJS local
  const custom = new URLSearchParams(location.search).get('peer');
  if (custom) {
    const [host, port] = custom.split(':');
    Object.assign(PEER_OPTS, { host, port: Number(port) || 9000, path: '/', secure: false });
  }
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  const other = (role) => (role === 'ainu' ? 'matcha' : 'ainu');

  /** Lien établi entre les deux joueurs : send(objet), onmessage(objet), onclose(). */
  class Link {
    constructor(peer, conn, isHost) {
      this.peer = peer; this.conn = conn; this.isHost = isHost;
      this.onmessage = null; this.onclose = null; this.closed = false;
      conn.on('data', (d) => {
        let m; try { m = JSON.parse(d); } catch (e) { return; }
        if (this.onmessage) this.onmessage(m);
      });
      const end = () => { if (this.closed) return; this.closed = true; if (this.onclose) this.onclose(); };
      conn.on('close', end);
      conn.on('error', end);
      peer.on('disconnected', () => { /* le lien direct peut survivre au serveur de mise en relation */ });
    }
    send(obj) { if (!this.closed && this.conn.open) this.conn.send(JSON.stringify(obj)); }
    close() {
      this.closed = true;
      try { this.conn.close(); } catch (e) { /* ignore */ }
      try { this.peer.destroy(); } catch (e) { /* ignore */ }
    }
  }

  let pending = null; // pair en cours de mise en relation (annulable)

  function cancel() {
    if (pending) { try { pending.destroy(); } catch (e) { /* ignore */ } }
    pending = null;
  }

  /** Crée une partie. cb : onCode(code), onReady(link, role), onError(texte). */
  function host(role, cb, tries) {
    cancel();
    if (!window.Peer) { cb.onError('Le jeu en ligne n\'est pas disponible.'); return; }
    const code = newCode();
    const peer = new window.Peer(PREFIX + code, PEER_OPTS);
    pending = peer;
    let linked = false;
    peer.on('open', () => cb.onCode(code));
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id' && (tries || 0) < 4) { host(role, cb, (tries || 0) + 1); return; }
      if (!linked) cb.onError('Connexion impossible (' + e.type + ').');
    });
    peer.on('connection', (conn) => {
      if (linked) { conn.on('open', () => conn.close()); return; }
      conn.on('open', () => {
        linked = true;
        pending = null;
        const link = new Link(peer, conn, true);
        link.send({ t: 'hello', role: other(role) });
        cb.onReady(link, role);
      });
    });
  }

  /** Rejoint une partie. cb : onReady(link, role), onError(texte). */
  function join(code, cb) {
    cancel();
    if (!window.Peer) { cb.onError('Le jeu en ligne n\'est pas disponible.'); return; }
    code = String(code || '').toUpperCase().trim();
    const peer = new window.Peer(PEER_OPTS);
    pending = peer;
    let done = false;
    const fail = (msg) => { if (done) return; done = true; cancel(); cb.onError(msg); };
    const timer = setTimeout(() => fail('Partie introuvable. Vérifie le code !'), 15000);
    peer.on('error', (e) => fail(e.type === 'peer-unavailable' ? 'Partie introuvable. Vérifie le code !' : 'Connexion impossible (' + e.type + ').'));
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
      conn.on('open', () => {
        const link = new Link(peer, conn, false);
        link.onmessage = (m) => {
          if (m.t !== 'hello' || done) return;
          done = true; clearTimeout(timer); pending = null;
          link.onmessage = null;
          cb.onReady(link, m.role);
        };
      });
    });
  }

  window.AdvCoop = { host, join, cancel };
})();
