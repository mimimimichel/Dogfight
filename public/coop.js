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
  const MAX_GUESTS = 5;   // 6 joueurs en tout avec l'hôte
  const CODE_KEY = 'dogfight.world.code';
  function savedCode() { try { return localStorage.getItem(CODE_KEY); } catch (e) { return null; } }
  function keepCode(c) { try { localStorage.setItem(CODE_KEY, c); } catch (e) { /* ignore */ } }

  /**
   * Ouvre le monde de l'hôte : il garde toujours le même code (le monde est
   * « à lui »), les amis rejoignent ou reviennent quand ils veulent, jusqu'à 5.
   * cb : onCode(code, session), onError(texte).
   * session : { code, profile, links:Set, onJoin(link), close() }
   */
  function host(profile, cb, tries) {
    cancel();
    if (!window.Peer) { cb.onError('Le jeu en ligne n\'est pas disponible.'); return; }
    tries = tries || 0;
    const code = (tries < 2 && savedCode()) || newCode();
    const peer = new window.Peer(PREFIX + code, PEER_OPTS);
    pending = peer;
    const session = {
      code, profile, peer, links: new Set(), onJoin: null, closed: false, level: 1,
      get link() { for (const l of this.links) if (!l.closed) return l; return null; },
      close() {
        this.closed = true;
        for (const l of this.links) l.close();
        try { peer.destroy(); } catch (e) { /* ignore */ }
        if (pending === peer) pending = null;
      },
      detach() { if (pending === peer) pending = null; },
    };
    let opened = false;
    peer.on('open', () => { if (!opened) { opened = true; keepCode(code); cb.onCode(code, session); } });
    // reste joignable si le serveur de mise en relation coupe la connexion
    peer.on('disconnected', () => { if (!session.closed) setTimeout(() => { if (!session.closed && peer.disconnected) peer.reconnect(); }, 1500); });
    peer.on('error', (e) => {
      // le code est encore pris (onglet précédent pas tout à fait fermé) : on réessaie, puis on change de code
      if (!opened && e.type === 'unavailable-id' && tries < 5) {
        try { peer.destroy(); } catch (err) { /* ignore */ }
        setTimeout(() => host(profile, cb, tries + 1), tries < 1 ? 1500 : 0);
        return;
      }
      if (!opened) cb.onError('Connexion impossible (' + e.type + ').');
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        for (const l of [...session.links]) if (l.closed) session.links.delete(l);
        if (session.closed || session.links.size >= MAX_GUESTS) {
          try { conn.send(JSON.stringify({ t: 'full' })); } catch (e) { /* ignore */ }
          setTimeout(() => conn.close(), 300);
          return;
        }
        const link = new Link(peer, conn, true, false);
        session.links.add(link);
        link.send({ t: 'hello', level: session.level || 1 });
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
    const timer = setTimeout(() => fail('Pas de réponse de ce monde. Vérifie le code, ou demande à ton ami d\'ouvrir son monde, puis réessaie !'), 30000);
    peer.on('error', (e) => fail(e.type === 'peer-unavailable' ? 'Partie introuvable. Vérifie le code !' : 'Connexion impossible (' + e.type + ').'));
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
      conn.on('open', () => {
        const link = new Link(peer, conn, false, true);
        link.onmessage = (m) => {
          if (done) return;
          if (m.t === 'full') { fail('Ce monde est complet : il y a déjà 6 joueurs !'); link.close(); return; }
          if (m.t !== 'hello') return;
          done = true; clearTimeout(timer); pending = null;
          link.onmessage = null;
          cb.onReady(link, m.level || 1);
        };
      });
    });
  }

  window.AdvCoop = { host, join, cancel, savedCode, MAX_PLAYERS: MAX_GUESTS + 1 };
})();
