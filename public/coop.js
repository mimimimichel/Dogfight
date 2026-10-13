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
  // Plusieurs serveurs STUN : la connexion directe (rapide) réussit plus souvent ; le
  // relais TURN gratuit de PeerJS ne sert qu'en dernier recours (il est souvent saturé).
  const PEER_OPTS = {
    debug: 1,
    config: {
      iceServers: [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
      ],
      iceCandidatePoolSize: 2,
      sdpSemantics: 'unified-plan',
    },
  };
  // Test : ?peer=hote:port pour utiliser un serveur PeerJS local
  const custom = new URLSearchParams(location.search).get('peer');
  if (custom) {
    const [host, port] = custom.split(':');
    Object.assign(PEER_OPTS, { host, port: Number(port) || 9000, path: '/', secure: false });
  }
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('');
  const other = (role) => (role === 'ainu' ? 'matcha' : 'ainu');

  /**
   * Lien établi entre les deux joueurs : send(objet), onmessage(objet), onclose().
   * Chaque côté donne des nouvelles au moins toutes les secondes : un lien muet depuis
   * 10 s est considéré comme coupé (sinon un ami parti en rechargeant la page restait là).
   */
  const QUIET_MS = 10000;
  class Link {
    constructor(peer, conn, isHost, ownsPeer) {
      this.peer = peer; this.conn = conn; this.isHost = isHost; this.ownsPeer = ownsPeer;
      this.handler = null; this.queue = []; this.onclose = null; this.closed = false;
      this.heardAt = this.sentAt = Date.now();
      conn.on('data', (d) => {
        this.heardAt = Date.now();
        let m; try { m = JSON.parse(d); } catch (e) { return; }
        if (m.t === 'ka') return;
        if (this.handler) this.handler(m);
        else if (this.queue.length < 50) this.queue.push(m);   // gardés jusqu'à ce que le jeu soit prêt
      });
      const end = () => { if (this.closed) return; this.closed = true; clearInterval(this.beat); if (this.onclose) this.onclose(); };
      this.end = end;
      conn.on('close', end);
      conn.on('error', end);
      peer.on('disconnected', () => { /* le lien direct peut survivre au serveur de mise en relation */ });
      this.beat = setInterval(() => {
        if (this.closed) { clearInterval(this.beat); return; }
        const now = Date.now();
        if (now - this.heardAt > QUIET_MS) { this.dropped = true; try { conn.close(); } catch (e) { /* ignore */ } end(); return; }
        if (now - this.sentAt > 900) this.send({ t: 'ka' });
      }, 1000);
    }
    /** Octets en attente d'envoi (réseau encombré). */
    get backlog() {
      const dc = this.conn.dataChannel;
      return (dc ? dc.bufferedAmount : 0) + (this.conn.bufferSize || 0) * 1024;
    }
    get onmessage() { return this.handler; }
    set onmessage(f) {
      this.handler = f;
      while (f && this.handler === f && this.queue.length) f(this.queue.shift());
    }
    send(obj) {
      if (this.closed || !this.conn.open) return;
      try { this.conn.send(JSON.stringify(obj)); this.sentAt = Date.now(); } catch (e) { /* ignore */ }
    }
    close() {
      this.closed = true;
      clearInterval(this.beat);
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

  // Copie locale des mondes visités (pour pouvoir les rouvrir quand leur gardien est parti)
  const worldKey = (code, lv) => 'dogfight.w.' + code + '.' + lv;
  function worldLevel(code) { try { return +localStorage.getItem(worldKey(code, 'lv')) || 0; } catch (e) { return 0; } }
  function hasCopy(code) { return code === savedCode() || worldLevel(code) > 0; }

  /**
   * Ouvre (ou garde) un monde. Sans opts.code c'est le monde du joueur : il garde
   * toujours le même code. Avec opts.code, on devient le gardien du monde d'un
   * ami (il est parti, ou personne n'y était).
   * cb : onCode(code, session), onError(texte), onTaken(code) si quelqu'un garde déjà ce monde.
   * session : { code, profile, links:Set, onJoin(link), close() }
   */
  function host(profile, cb, opts) {
    cancel();
    if (!window.Peer) { cb.onError('Le jeu en ligne n\'est pas disponible.'); return; }
    opts = opts || {};
    const tries = opts.tries || 0;
    const own = !opts.code;
    const code = opts.code || savedCode() || newCode();
    const peer = new window.Peer(PREFIX + code, PEER_OPTS);
    pending = peer;
    const session = {
      code, profile, peer, own, links: new Set(), onJoin: null, closed: false, level: 1,
      get link() { for (const l of this.links) if (!l.closed) return l; return null; },
      /** Prévient les amis (ils se passent le monde) puis ferme. */
      close() {
        if (this.closed) return;
        this.closed = true;
        for (const l of this.links) { l.send({ t: 'bye' }); }
        const links = [...this.links];
        setTimeout(() => {
          for (const l of links) l.close();
          try { peer.destroy(); } catch (e) { /* ignore */ }
        }, links.length ? 250 : 0);
        if (pending === peer) pending = null;
      },
      detach() { if (pending === peer) pending = null; },
    };
    let opened = false;
    peer.on('open', () => { if (!opened) { opened = true; if (own) keepCode(code); cb.onCode(code, session); } });
    // reste joignable si le serveur de mise en relation coupe la connexion
    peer.on('disconnected', () => { if (!session.closed) setTimeout(() => { if (!session.closed && !peer.destroyed && peer.disconnected) peer.reconnect(); }, 1500); });
    peer.on('error', (e) => {
      if (!opened && e.type === 'unavailable-id') {
        try { peer.destroy(); } catch (err) { /* ignore */ }
        if (pending === peer) pending = null;
        // quelqu'un garde déjà ce monde : on le rejoint
        if (cb.onTaken && !opts.noTaken) { cb.onTaken(code); return; }
        // l'ancien gardien vient de partir (le serveur libère son nom) : on patiente
        if (tries < (opts.maxTries || 6)) { setTimeout(() => host(profile, cb, Object.assign({}, opts, { tries: tries + 1 })), 1500); return; }
        cb.onError('Ce monde est déjà ouvert ailleurs. Réessaie dans un instant !');
        return;
      }
      if (!opened) cb.onError('Connexion impossible (' + e.type + ').');
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => {
        if (conn.linked) return;   // (PeerJS signale parfois deux fois la même ouverture)
        conn.linked = true;
        for (const l of [...session.links]) if (l.closed) session.links.delete(l);
        if (session.closed || session.links.size >= MAX_GUESTS) {
          try { conn.send(JSON.stringify({ t: session.closed ? 'gone' : 'full' })); } catch (e) { /* ignore */ }
          setTimeout(() => conn.close(), 300);
          return;
        }
        const link = new Link(peer, conn, true, false);
        session.links.add(link);
        link.send({ t: 'hello', level: session.level || 1 });
        if (session.onJoin) session.onJoin(link);
      });
    });
    // fermeture de l'onglet : on prévient les amis tout de suite
    window.addEventListener('pagehide', () => { if (!session.closed) for (const l of session.links) l.send({ t: 'bye' }); });
  }

  /**
   * Rejoint un monde. cb : onReady(link, level), onError(texte), onEmpty(code) si
   * personne ne garde ce monde. opts.retryFor : on réessaie pendant ce temps (ms)
   * tant que le monde est vide (un ami est en train d'en devenir le gardien).
   */
  function join(code, cb, opts) {
    cancel();
    if (!window.Peer) { cb.onError('Le jeu en ligne n\'est pas disponible.'); return; }
    opts = opts || {};
    code = String(code || '').toUpperCase().trim();
    const until = opts.until || (Date.now() + (opts.retryFor || 0));
    const peer = new window.Peer(PEER_OPTS);
    pending = peer;
    let done = false;
    const fail = (msg) => { if (done) return; done = true; clearTimeout(timer); cancel(); cb.onError(msg); };
    // pendant un passage de relais, on retente vite (l'ancien gardien peut encore répondre à moitié)
    const retrying = Date.now() < until;
    const timer = setTimeout(() => {
      if (done) return;
      // pas de réponse : on retente (la connexion directe rate parfois du premier coup)
      const attempt = opts.attempt || 0;
      if (Date.now() < until || attempt < 2) { done = true; cancel(); join(code, cb, Object.assign({}, opts, { until, attempt: attempt + 1 })); return; }
      fail('Pas de réponse de ce monde. Vérifie le code, puis réessaie !');
    }, retrying ? 6000 : 10000);
    peer.on('error', (e) => {
      if (done) return;
      if (e.type === 'peer-unavailable') {
        done = true; clearTimeout(timer); cancel();
        if (Date.now() < until) { setTimeout(() => join(code, cb, Object.assign({}, opts, { until })), 1500); return; }
        if (cb.onEmpty) cb.onEmpty(code); else cb.onError('Partie introuvable. Vérifie le code !');
        return;
      }
      fail('Connexion impossible (' + e.type + ').');
    });
    peer.on('open', () => {
      const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'raw' });
      conn.on('open', () => {
        if (conn.linked) return;
        conn.linked = true;
        const link = new Link(peer, conn, false, true);
        link.code = code;
        // on recharge ou on ferme la page : l'hôte retire notre chien tout de suite
        const leave = () => link.send({ t: 'leave' });
        window.addEventListener('pagehide', leave);
        const off = link.close.bind(link);
        link.close = () => { window.removeEventListener('pagehide', leave); off(); };
        link.onmessage = (m) => {
          if (done) return;
          if (m.t === 'full') { fail('Ce monde est complet : il y a déjà 6 joueurs !'); link.close(); return; }
          if (m.t === 'gone') {   // son gardien est en train de partir : on réessaie
            done = true; clearTimeout(timer); link.close(); pending = null;
            setTimeout(() => join(code, cb, Object.assign({}, opts, { until: Math.max(until, Date.now() + 8000) })), 1500);
            return;
          }
          if (m.t !== 'hello') return;
          done = true; clearTimeout(timer); pending = null;
          link.onmessage = null;
          cb.onReady(link, m.level || 1);
        };
      });
    });
  }

  window.AdvCoop = { host, join, cancel, savedCode, worldKey, worldLevel, hasCopy, PREFIX, MAX_PLAYERS: MAX_GUESTS + 1 };
})();
