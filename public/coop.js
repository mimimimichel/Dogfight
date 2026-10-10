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
    constructor(peer, conn, isHost, ownsPeer) {
      this.peer = peer; this.conn = conn; this.isHost = isHost; this.ownsPeer = ownsPeer;
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
      if (this.ownsPeer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
      if (this.onclose) { const f = this.onclose; this.onclose = null; f(); }
    }
  }

  let pending = null; // pair en cours de mise en relation (annulable)

  function cancel() {
    if (pending) { try { pending.destroy(); } catch (e) { /* ignore */ } }
    pending = null;
  }

  /**
   * Crée une partie ouverte : l'hôte peut jouer tout de suite, l'autre joueur
   * rejoint (ou revient) quand il veut avec le code.
   * cb : onCode(code, session), onError(texte).
   * session : { code, role, link, onJoin(link), close() }
   */
  function host(role, cb, tries) {
    cancel();
    if (!window.Peer) { cb.onError('Le jeu en ligne n\'est pas disponible.'); return; }
    const code = newCode();
    const peer = new window.Peer(PREFIX + code, PEER_OPTS);
    pending = peer;
    const session = {
      code, role, link: null, onJoin: null, closed: false,
      close() {
        this.closed = true;
        if (this.link) this.link.close();
        try { peer.destroy(); } catch (e) { /* ignore */ }
        if (pending === peer) pending = null;
      },
      detach() { if (pending === peer) pending = null; },
    };
    let opened = false;
    peer.on('open', () => { if (!opened) { opened = true; cb.onCode(code, session); } });
    // reste joignable si le serveur de mise en relation coupe la connexion
    peer.on('disconnected', () => { if (!session.closed) setTimeout(() => { if (!session.closed && peer.disconnected) peer.reconnect(); }, 1500); });
    peer.on('error', (e) => {
      if (!opened && e.type === 'unavailable-id' && (tries || 0) < 4) { try { peer.destroy(); } catch (err) { /* ignore */ } host(role, cb, (tries || 0) + 1); return; }
      if (!opened) cb.onError('Connexion impossible (' + e.type + ').');
    });
    peer.on('connection', (conn) => {
      if (session.link && !session.link.closed) { conn.on('open', () => conn.close()); return; }
      conn.on('open', () => {
        if (session.closed) { conn.close(); return; }
        const link = new Link(peer, conn, true, false);
        session.link = link;
        link.send({ t: 'hello', role: other(role) });
        if (session.onJoin) session.onJoin(link);
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
        const link = new Link(peer, conn, false, true);
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
