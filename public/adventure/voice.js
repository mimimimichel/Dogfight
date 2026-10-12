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
    this.retry = () => {
      for (const a of this.blocked) a.play().then(() => this.blocked.delete(a)).catch(() => {});
      if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().then(() => this.boostAll()).catch(() => {});
    };
    window.addEventListener('pointerdown', this.retry);
    window.addEventListener('keydown', this.retry);
  }

  get myId() { return this.peer.id; }

  /** Volume des voix des amis (1 = normal ; on peut monter jusqu'à 4). */
  get volume() { try { const v = parseFloat(localStorage.getItem('dogfight.voicevol')); return v > 0 ? v : 2.5; } catch (e) { return 2.5; } }
  setVolume(v) {
    try { localStorage.setItem('dogfight.voicevol', String(v)); } catch (e) { /* ignore */ }
    if (this.gain) this.gain.gain.value = v;
    for (const e of this.in.values()) if (!e.boost) e.audio.volume = Math.min(1, v);
  }
  /** Sortie des voix : amplifiée (un élément <audio> plafonne au volume normal). */
  voiceOut() {
    const ctx = this.audioCtx();
    if (!ctx || ctx.state !== 'running') return null;
    if (!this.gain) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -24; comp.knee.value = 12; comp.ratio.value = 4;
      this.gain = ctx.createGain(); this.gain.gain.value = this.volume;
      this.gain.connect(comp); comp.connect(ctx.destination);
    }
    return this.gain;
  }
  /** Fait passer la voix d'un ami par l'amplificateur (si l'audio est débloqué). */
  boost(e) {
    if (e.boost) return;
    const out = this.voiceOut();
    if (!out) return;
    try {
      const src = this.ctx.createMediaStreamSource(e.audio.srcObject);
      src.connect(out);
      e.boost = src;
      e.audio.muted = true;   // (l'élément continue de tourner : Chrome en a besoin pour recevoir le son)
    } catch (err) { /* on garde l'élément <audio> */ }
  }
  boostAll() { for (const e of this.in.values()) this.boost(e); }

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
      // iPhone : le micro a besoin d'une session « lecture et enregistrement »
      try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) { /* ignore */ }
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      } catch (e) {
        try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (err) { /* ignore */ }
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
      audio.volume = Math.min(1, this.volume);
      audio.play().catch(() => this.blocked.add(audio));
      const e = Object.assign({ call, audio }, this.analyser(stream) || {});
      this.in.set(call.peer, e);
      this.boost(e);
    });
    const end = () => { const e = this.in.get(call.peer); if (e && e.call === call) this.drop(call.peer); };
    call.on('close', end);
    call.on('error', end);
  }

  drop(pid) {
    const e = this.in.get(pid);
    if (!e) return;
    this.in.delete(pid);
    try { if (e.boost) e.boost.disconnect(); } catch (err) { /* ignore */ }
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
    this.ctx = null; this.gain = null;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
    this.out.clear(); this.stream = null; this.on = false;
    voices.delete(this.peer);
  }
}
