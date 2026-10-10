/*
 * Dogfight — transport pair-à-pair (WebRTC via PeerJS) pour l'hébergement statique.
 *
 * Imite l'interface d'un WebSocket (onopen / onmessage / onclose / send) pour que
 * le client n'ait pas à savoir s'il parle au serveur Node ou à un autre navigateur.
 *
 * - Créer un salon : ce navigateur devient l'hôte et fait tourner la partie
 *   (même code de salon que le serveur Node : public/room.js).
 * - Rejoindre : connexion directe au navigateur de l'hôte.
 * - Match rapide : on tente les salons publics Q1…Q6, sinon on en ouvre un.
 *
 * La mise en relation passe par le service public gratuit de PeerJS ; les données
 * de jeu circulent ensuite directement entre les deux joueurs.
 */
(function () {
  'use strict';

  const PREFIX = 'dogfight-mimimimichel-';
  const QUICK_SLOTS = 6;
  const PEER_OPTS = { debug: 1 };
  // Test : ?peer=hote:port pour utiliser un serveur PeerJS local au lieu du service public
  const custom = new URLSearchParams(location.search).get('peer');
  if (custom) {
    const [host, port] = custom.split(':');
    Object.assign(PEER_OPTS, { host, port: Number(port) || 9000, path: '/', secure: false });
  }
  const CONN_OPTS = { reliable: true, serialization: 'raw' };

  class P2PSocket {
    constructor() {
      this.readyState = 0;
      this.peer = null;
      this.conn = null;   // côté invité : connexion vers l'hôte
      this.room = null;   // côté hôte : le salon
      this.self = null;   // côté hôte : le joueur local
      this.onopen = null; this.onmessage = null; this.onclose = null;
      // Ferme proprement la connexion quand on quitte la page
      window.addEventListener('pagehide', () => this.reset());
      setTimeout(() => {
        if (!window.Peer) {
          this.readyState = 3;
          if (this.onclose) this.onclose();
          return;
        }
        this.readyState = 1;
        if (this.onopen) this.onopen();
      }, 0);
    }

    deliver(txt) { if (this.onmessage && this.readyState === 1) this.onmessage({ data: txt }); }
    emit(obj) { this.deliver(JSON.stringify(obj)); }

    send(txt) {
      let msg;
      try { msg = JSON.parse(txt); } catch (e) { return; }
      switch (msg.t) {
        case 'create': this.reset(); this.host(null, false, msg.name); break;
        case 'join': this.reset(); this.join(String(msg.code || '').toUpperCase().trim(), msg.name); break;
        case 'quick': this.reset(); this.quick(msg.name, 1); break;
        case 'leave': this.reset(); break;
        case 'ping':
          if (this.conn) this.conn.send(txt);
          else this.emit({ t: 'pong', ts: msg.ts });
          break;
        default:
          if (this.room && this.self) this.room.handle(this.self, msg);
          else if (this.conn && this.conn.open) this.conn.send(txt);
      }
    }

    close() {
      this.reset();
      this.readyState = 3;
    }

    reset() {
      if (this.room) this.room.stopGame();
      this.room = null;
      this.self = null;
      const conn = this.conn;
      this.conn = null;
      if (conn) try { conn.close(); } catch (e) { /* ignore */ }
      if (this.peer) try { this.peer.destroy(); } catch (e) { /* ignore */ }
      this.peer = null;
    }

    lost(reason) {
      this.reset();
      this.readyState = 3;
      this.lostReason = reason;
      if (this.onclose) this.onclose();
    }

    // ----- Hôte ---------------------------------------------------------------
    host(code, isQuick, name, onTaken) {
      const R = window.DogRoom;
      code = code || R.makeCode();
      const peer = new window.Peer(PREFIX + code, PEER_OPTS);
      this.peer = peer;
      peer.on('open', () => {
        if (this.peer !== peer) return;
        this.room = new R.Room(code, isQuick, {});
        // Livraison asynchrone, comme un vrai réseau
        this.self = { send: (txt) => setTimeout(() => this.deliver(txt), 0) };
        this.room.add(this.self, name);
      });
      peer.on('connection', (conn) => this.acceptGuest(conn));
      peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) peer.reconnect(); });
      peer.on('error', (err) => {
        if (this.peer !== peer) return;
        if (err.type === 'unavailable-id') {
          if (onTaken) { this.reset(); onTaken(); }
          else { this.reset(); this.host(null, isQuick, name); }
          return;
        }
        if (err.type === 'peer-unavailable') return; // sans importance côté hôte
        this.emit({ t: 'error', msg: 'Connexion impossible (' + err.type + ').' });
      });
    }

    acceptGuest(conn) {
      let guest = null;
      let lastSeen = Date.now();
      // L'invité envoie un ping toutes les 2 s : sans nouvelles depuis 8 s, il est parti
      const watchdog = setInterval(() => {
        if (Date.now() - lastSeen > 8000) { clearInterval(watchdog); try { conn.close(); } catch (e) { /* ignore */ } gone(); }
      }, 2000);
      conn.on('data', (data) => {
        lastSeen = Date.now();
        const txt = typeof data === 'string' ? data : JSON.stringify(data);
        let msg;
        try { msg = JSON.parse(txt); } catch (e) { return; }
        if (!guest) {
          if (msg.t !== 'hello' || !this.room) return;
          if (this.room.count >= 2) {
            conn.send(JSON.stringify({ t: 'full' }));
            setTimeout(() => conn.close(), 200);
            return;
          }
          guest = { send: (t) => { if (conn.open) conn.send(t); } };
          this.room.add(guest, msg.name);
          return;
        }
        if (this.room) this.room.handle(guest, msg);
      });
      const gone = () => { clearInterval(watchdog); if (guest && this.room) this.room.remove(guest); guest = null; };
      conn.on('close', gone);
      conn.on('error', gone);
    }

    // ----- Invité -------------------------------------------------------------
    join(code, name, onFail) {
      const peer = new window.Peer(undefined, PEER_OPTS);
      this.peer = peer;
      let settled = false;
      const fail = (why) => {
        if (settled || this.peer !== peer) return;
        settled = true;
        this.reset();
        if (onFail) onFail(why);
        else this.emit({
          t: 'error',
          msg: why === 'notfound' ? `Salon « ${code} » introuvable.`
            : why === 'full' ? 'Ce salon est déjà complet.'
            : 'Connexion impossible avec ce salon.',
        });
      };
      peer.on('open', () => {
        if (this.peer !== peer) return;
        const conn = peer.connect(PREFIX + code, CONN_OPTS);
        const timer = setTimeout(() => fail('timeout'), 12000);
        conn.on('open', () => {
          clearTimeout(timer);
          if (this.peer !== peer) return;
          this.conn = conn;
          conn.send(JSON.stringify({ t: 'hello', name }));
          // L'hôte répond aux pings (toutes les 2 s) et envoie la partie : 8 s de silence = parti
          let lastSeen = Date.now();
          conn.on('data', () => { lastSeen = Date.now(); });
          const watchdog = setInterval(() => {
            if (this.conn !== conn) { clearInterval(watchdog); return; }
            if (Date.now() - lastSeen > 8000) { clearInterval(watchdog); this.lost('host-left'); }
          }, 2000);
        });
        conn.on('data', (data) => {
          const txt = typeof data === 'string' ? data : JSON.stringify(data);
          if (!settled) {
            if (txt.indexOf('"full"') >= 0) { fail('full'); return; }
            settled = true;
          }
          this.deliver(txt);
        });
        conn.on('close', () => {
          clearTimeout(timer);
          if (this.conn === conn) this.lost('host-left');
        });
      });
      peer.on('disconnected', () => { if (this.peer === peer && !peer.destroyed) peer.reconnect(); });
      peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') fail('notfound');
        else if (!this.conn) fail(err.type);
      });
    }

    // ----- Match rapide -------------------------------------------------------
    quick(name, i) {
      if (i > QUICK_SLOTS) {
        this.emit({ t: 'error', msg: 'Tous les salons rapides sont pleins, crée un salon privé.' });
        return;
      }
      const code = 'Q' + i;
      this.join(code, name, (why) => {
        if (why === 'notfound') this.host(code, true, name, () => this.quick(name, i + 1));
        else this.quick(name, i + 1);
      });
    }
  }

  window.DogP2P = { connect: () => new P2PSocket() };
})();
