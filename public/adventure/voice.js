/*
 * Matcha & Ainu — chat vocal du monde partagé (jusqu'à 6 joueurs).
 *
 * Chaque joueur appelle directement les autres (pair-à-pair, via PeerJS) quand
 * il allume son micro : son appel ne transporte que sa voix. Tout le monde
 * entend tout le monde, même sans micro. Un même objet sert pour toute la
 * session (il survit aux changements de niveau).
 */
const voices = new Map();

/** Le chat vocal attaché à un pair PeerJS (créé au premier appel). */
export function voiceFor(peer) {
  if (!peer) return null;
  if (!voices.has(peer)) voices.set(peer, new Voice(peer));
  return voices.get(peer);
}

class Voice {
  constructor(peer) {
    this.peer = peer;
    this.out = new Map();      // pid -> appel sortant (ma voix vers lui)
    this.in = new Map();       // pid -> { call, audio, analyser, buf }
    this.stream = null;        // mon micro
    this.on = false;
    this.roster = [];
    this.ctx = null;
    this.blocked = new Set();  // sons bloqués par le navigateur : relancés au prochain geste
    this.onCall = (call) => this.incoming(call);
    peer.on('call', this.onCall);
    this.retry = () => { for (const a of this.blocked) a.play().then(() => this.blocked.delete(a)).catch(() => {}); if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); };
    window.addEventListener('pointerdown', this.retry);
    window.addEventListener('keydown', this.retry);
  }

  get myId() { return this.peer.id; }

  audioCtx() {
    if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) this.ctx = new C(); }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  analyser(stream) {
    const ctx = this.audioCtx();
    if (!ctx) return null;
    try {
      const src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
      an.fftSize = 512; src.connect(an);
      return { an, buf: new Uint8Array(an.fftSize) };
    } catch (e) { return null; }
  }
  level(a) {
    if (!a) return 0;
    a.an.getByteTimeDomainData(a.buf);
    let s = 0;
    for (let i = 0; i < a.buf.length; i++) { const v = (a.buf[i] - 128) / 128; s += v * v; }
    return Math.sqrt(s / a.buf.length);
  }

  /** Allume ou coupe mon micro. Renvoie 'on', 'off' ou un message d'erreur. */
  async toggle() {
    if (!this.stream) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'Ce navigateur ne permet pas d\'utiliser le micro.';
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      } catch (e) {
        return e && e.name === 'NotAllowedError' ? 'Le micro a été refusé. Autorise-le dans le navigateur pour parler.' : 'Pas de micro trouvé.';
      }
      this.mine = this.analyser(this.stream);
      this.on = true;
      this.callAll();
      return 'on';
    }
    this.on = !this.on;
    for (const t of this.stream.getAudioTracks()) t.enabled = this.on;
    return this.on ? 'on' : 'off';
  }

  /** Liste des joueurs présents : [{ pid, id }] (pid = identifiant PeerJS). */
  setRoster(list) {
    this.roster = list.filter(r => r.pid && r.pid !== this.myId);
    const keep = new Set(this.roster.map(r => r.pid));
    for (const [pid, call] of this.out) if (!keep.has(pid)) { try { call.close(); } catch (e) { /* ignore */ } this.out.delete(pid); }
    for (const pid of [...this.in.keys()]) if (!keep.has(pid)) this.drop(pid);
    if (this.stream) this.callAll();
  }

  callAll() {
    if (!this.stream || this.peer.destroyed) return;
    for (const r of this.roster) {
      if (this.out.has(r.pid)) continue;
      let call;
      try { call = this.peer.call(r.pid, this.stream, { metadata: { voice: 1 } }); } catch (e) { continue; }
      if (!call) continue;
      this.out.set(r.pid, call);
      const gone = () => { if (this.out.get(r.pid) === call) this.out.delete(r.pid); };
      call.on('close', gone);
      call.on('error', gone);
    }
  }

  incoming(call) {
    call.answer();                               // on écoute (notre voix part dans nos propres appels)
    call.on('stream', (stream) => {
      this.drop(call.peer);
      const audio = document.createElement('audio');
      audio.autoplay = true; audio.playsInline = true; audio.srcObject = stream;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      audio.play().catch(() => this.blocked.add(audio));
      this.in.set(call.peer, Object.assign({ call, audio }, this.analyser(stream) || {}));
    });
    const end = () => { const e = this.in.get(call.peer); if (e && e.call === call) this.drop(call.peer); };
    call.on('close', end);
    call.on('error', end);
  }

  drop(pid) {
    const e = this.in.get(pid);
    if (!e) return;
    this.in.delete(pid);
    try { e.audio.srcObject = null; e.audio.remove(); } catch (err) { /* ignore */ }
    try { e.call.close(); } catch (err) { /* ignore */ }
  }

  /** Est-ce que ce joueur parle en ce moment ? */
  speaking(pid) {
    if (pid === this.myId) return this.on && this.level(this.mine) > 0.035;
    const e = this.in.get(pid);
    if (!e) return false;
    // niveau sonore donné par WebRTC (fiable partout), sinon par l'analyseur audio
    try {
      const pc = e.call.peerConnection;
      for (const r of pc ? pc.getReceivers() : []) {
        if (!r.track || r.track.kind !== 'audio' || !r.getSynchronizationSources) continue;
        const src = r.getSynchronizationSources()[0];
        if (src && typeof src.audioLevel === 'number') return src.audioLevel > 0.03;
      }
    } catch (err) { /* ignore */ }
    return !!(e.an && this.level(e) > 0.035);
  }
  hears(pid) { return this.in.has(pid); }

  close() {
    try { this.peer.off('call', this.onCall); } catch (e) { /* ignore */ }
    window.removeEventListener('pointerdown', this.retry);
    window.removeEventListener('keydown', this.retry);
    for (const c of this.out.values()) { try { c.close(); } catch (e) { /* ignore */ } }
    for (const pid of [...this.in.keys()]) this.drop(pid);
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    if (this.ctx) { try { this.ctx.close(); } catch (e) { /* ignore */ } }
    this.out.clear(); this.stream = null; this.on = false;
    voices.delete(this.peer);
  }
}
