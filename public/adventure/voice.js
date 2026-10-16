/*
 * Matcha & Ainu — chat vocal du monde partagé (jusqu'à 6 joueurs).
 *
 * Chaque joueur appelle directement les autres (pair-à-pair, via PeerJS) quand
 * il allume son micro : son appel ne transporte que sa voix. Tout le monde
 * entend tout le monde, même sans micro. Un même objet sert pour toute la
 * session (il survit aux changements de niveau).
 *
 * Les voix passent par un simple élément <audio> (c'est lui que l'anti-écho du
 * téléphone connaît : par le mixeur WebAudio, l'écho revenait et hachait la voix),
 * avec un tampon un peu plus long pour encaisser les à-coups du réseau. Un appel
 * qui tombe est relancé tout seul.
 */
const JITTER_MS = 180;   // tampon de réception : un peu de retard, mais plus de voix hachée

/**
 * Réglages de la voix dans la négociation : chaque paquet emporte aussi une copie du
 * précédent (RED) et de quoi reconstruire un paquet perdu (FEC) ; débit confortable.
 * Un paquet perdu sur le wifi ne fait plus de trou dans la phrase.
 */
function tuneSdp(sdp) {
  try {
    const opus = /a=rtpmap:(\d+) opus\/48000/i.exec(sdp), red = /a=rtpmap:(\d+) red\/48000/i.exec(sdp);
    if (opus) {
      const pt = opus[1];
      sdp = sdp.replace(new RegExp('a=fmtp:' + pt + ' ([^\\r\\n]*)'), (m, p) => {
        const set = {};
        for (const kv of p.split(';')) { const [k, v] = kv.split('='); if (k) set[k.trim()] = v; }
        Object.assign(set, { useinbandfec: '1', usedtx: '0', stereo: '0', maxaveragebitrate: '40000' });
        return 'a=fmtp:' + pt + ' ' + Object.entries(set).map(([k, v]) => k + '=' + v).join(';');
      });
    }
    if (red) {
      sdp = sdp.replace(/^(m=audio \S+ \S+)((?: \d+)+)/m, (m, head, pts) => {
        const l = pts.trim().split(' ').filter(x => x !== red[1]);
        return head + ' ' + [red[1]].concat(l).join(' ');
      });
    }
  } catch (e) { /* on garde la négociation telle quelle */ }
  return sdp;
}

// Journal de qualité (envoyé au serveur toutes les 15 s pendant qu'on se parle)
const IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const LOG = !/^(localhost|127\.)/.test(location.hostname) && !new URLSearchParams(location.search).get('peer');
const DEVICE = (() => { const u = navigator.userAgent; return /iPhone|iPad/.test(u) ? 'iOS' : /Android/.test(u) ? 'Android' + ((/; ([^;)]+) Build/.exec(u) || [])[1] ? ' ' + /; ([^;)]+) Build/.exec(u)[1] : '') : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'autre'; })();
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
    this.in = new Map();       // pid -> { call, audio, at, boost }
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
    this.health = setInterval(() => this.check(), 2000);
    // mon niveau sonore, lu dans les statistiques de l'appel (pas de mixeur audio en plus :
    // sur iPhone, un mixeur ouvert pendant que le micro tourne fait bégayer le son)
    this.myLevel = 0;
    this.meter = setInterval(() => this.readMyLevel(), 300);
    this.prev = new Map();
    if (LOG) this.reporter = setInterval(() => this.report(), 15000);
  }

  get myId() { return this.peer.id; }

  /** Volume des voix des amis (1 = normal ; on peut monter jusqu'à 4). */
  get volume() { try { const v = parseFloat(localStorage.getItem('dogfight.voicevol2')); return v > 0 ? v : 1; } catch (e) { return 1; } }
  setVolume(v) {
    try { localStorage.setItem('dogfight.voicevol2', String(v)); } catch (e) { /* ignore */ }
    if (this.gain) this.gain.gain.value = v;
    for (const e of this.in.values()) {
      if (v > 1.05) this.boost(e);
      else this.unboost(e);
      if (!e.boost) e.audio.volume = Math.min(1, v);
    }
  }
  /** Sortie des voix : amplifiée (un élément <audio> plafonne au volume normal). */
  voiceOut() {
    const ctx = this.audioCtx();
    if (!ctx || ctx.state !== 'running') return null;
    if (!this.gain) {
      const comp = ctx.createDynamicsCompressor();   // (limiteur doux : pas de saturation)
      comp.threshold.value = -10; comp.knee.value = 6; comp.ratio.value = 12; comp.attack.value = 0.003; comp.release.value = 0.15;
      this.gain = ctx.createGain(); this.gain.gain.value = this.volume;
      this.gain.connect(comp); comp.connect(ctx.destination);
    }
    return this.gain;
  }
  /** Fait passer la voix d'un ami par l'amplificateur (seulement si on monte au-delà du volume normal). */
  boost(e) {
    if (e.boost || this.volume <= 1.05 || IOS) return;
    const out = this.voiceOut();
    if (!out) return;
    try {
      const src = this.ctx.createMediaStreamSource(e.audio.srcObject);
      src.connect(out);
      e.boost = src;
      e.audio.muted = true;   // (l'élément continue de tourner : Chrome en a besoin pour recevoir le son)
    } catch (err) { /* on garde l'élément <audio> */ }
  }
  unboost(e) {
    if (!e.boost) return;
    try { e.boost.disconnect(); } catch (err) { /* ignore */ }
    e.boost = null;
    e.audio.muted = false;
  }
  boostAll() { for (const e of this.in.values()) this.boost(e); }

  audioCtx() {
    if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) this.ctx = new C(); }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  /** Écouteurs branchés (réglage) : pas d'écho possible, donc pas d'anti-écho du téléphone. */
  static headset() { try { return localStorage.getItem('dogfight.headset') === '1'; } catch (e) { return false; } }

  async grab() {
    // iPhone : le micro a besoin d'une session « lecture et enregistrement »
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) { /* ignore */ }
    const hs = Voice.headset();
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: !hs, noiseSuppression: true, autoGainControl: true, channelCount: 1 }, video: false });
  }
  /**
   * Coupe vraiment le micro (et pas seulement le son) : tant qu'un micro est ouvert, le
   * téléphone traite tout le son comme un appel (son « téléphone », écouteurs Bluetooth
   * ignorés). Micro coupé : le jeu redevient un média normal.
   */
  release() {
    for (const c of this.out.values()) { try { c.close(); } catch (e) { /* ignore */ } }
    this.out.clear();
    if (this.stream) for (const t of this.stream.getTracks()) t.stop();
    this.stream = null; this.on = false; this.myLevel = 0;
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
  }
  /** Un appareil audio arrive ou part (écouteurs Bluetooth…) : on rouvre le micro dessus. */
  async reroute() {
    if (!this.stream || this.rerouting) return;
    this.rerouting = true;
    try {
      const fresh = await this.grab(), track = fresh.getAudioTracks()[0];
      for (const c of this.out.values()) {
        const pc = c.peerConnection; if (!pc) continue;
        for (const sd of pc.getSenders()) if (sd.track && sd.track.kind === 'audio') await sd.replaceTrack(track).catch(() => {});
      }
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = fresh;
    } catch (e) { /* on garde l'ancien micro */ }
    for (const e of this.in.values()) e.audio.play().catch(() => {});
    this.rerouting = false;
  }
  /** Allume ou coupe mon micro. Renvoie 'on', 'off' ou un message d'erreur. */
  async toggle() {
    if (this.on) { this.release(); return 'off'; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'Ce navigateur ne permet pas d\'utiliser le micro.';
    try {
      this.stream = await this.grab();
    } catch (e) {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (err) { /* ignore */ }
      return e && e.name === 'NotAllowedError' ? 'Le micro a été refusé. Autorise-le dans le navigateur pour parler.' : 'Pas de micro trouvé.';
    }
    if (!this.onDevices && navigator.mediaDevices.addEventListener) {
      this.onDevices = () => { clearTimeout(this.devT); this.devT = setTimeout(() => this.reroute(), 600); };
      navigator.mediaDevices.addEventListener('devicechange', this.onDevices);
    }
    this.on = true;
    this.callAll();
    return 'on';
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
      try { call = this.peer.call(r.pid, this.stream, { metadata: { voice: 1 }, sdpTransform: tuneSdp }); } catch (e) { continue; }
      if (!call) continue;
      call.at = Date.now();
      this.out.set(r.pid, call);
      const gone = () => { if (this.out.get(r.pid) === call) this.out.delete(r.pid); };
      call.on('close', gone);
      call.on('error', gone);
    }
  }

  incoming(call) {
    call.answer(undefined, { sdpTransform: tuneSdp });   // on écoute (notre voix part dans nos propres appels)
    call.on('stream', (stream) => {
      const old = this.in.get(call.peer);
      if (old && old.call === call) return;        // (PeerJS signale parfois deux fois le même flux)
      this.drop(call.peer);
      const audio = document.createElement('audio');
      audio.autoplay = true; audio.playsInline = true; audio.srcObject = stream;
      audio.setAttribute('playsinline', '');
      audio.style.display = 'none';
      document.body.appendChild(audio);
      audio.volume = Math.min(1, this.volume);
      audio.play().catch(() => this.blocked.add(audio));
      this.smooth(call);
      const e = { call, audio, at: Date.now() };
      this.in.set(call.peer, e);
      this.boost(e);
    });
    const end = () => { const e = this.in.get(call.peer); if (e && e.call === call) this.drop(call.peer); };
    call.on('close', end);
    call.on('error', end);
  }

  /** Tampon de réception plus long : la voix arrive un poil plus tard mais d'un seul tenant. */
  smooth(call) {
    try {
      for (const r of call.peerConnection ? call.peerConnection.getReceivers() : []) {
        if (!r.track || r.track.kind !== 'audio') continue;
        if ('jitterBufferTarget' in r) r.jitterBufferTarget = JITTER_MS;
        else if ('playoutDelayHint' in r) r.playoutDelayHint = JITTER_MS / 1000;
      }
    } catch (e) { /* ignore */ }
  }

  /** Toutes les 2 s : relance les appels tombés ou bloqués. */
  check() {
    if (this.peer.destroyed) return;
    const now = Date.now();
    const dead = (call, since) => {
      const pc = call && call.peerConnection;
      if (!pc) return now - since > 12000;            // jamais établi
      const st = pc.iceConnectionState;
      if (st === 'failed' || st === 'closed') return true;
      if (st === 'disconnected') { call.discAt = call.discAt || now; return now - call.discAt > 5000; }
      call.discAt = 0;
      return (st === 'new' || st === 'checking') && now - since > 15000;
    };
    for (const [pid, call] of [...this.out]) {
      if (dead(call, call.at || now)) { this.out.delete(pid); try { call.close(); } catch (e) { /* ignore */ } }
    }
    for (const [pid, e] of [...this.in]) if (dead(e.call, e.at)) this.drop(pid);
    if (this.stream) this.callAll();
  }

  /** Qualité des appels en cours : route (directe ou relais), pertes, retard, trous dans la voix. */
  async stats() {
    const out = [];
    const one = async (call, dir, pid) => {
      const pc = call && call.peerConnection;
      if (!pc) return;
      const r = await pc.getStats();
      const o = { dir, pid: String(pid).slice(0, 6), ice: pc.iceConnectionState };
      let pair = null;
      r.forEach((x) => { if (x.type === 'transport' && x.selectedCandidatePairId) pair = r.get(x.selectedCandidatePairId); });
      if (!pair) r.forEach((x) => { if (x.type === 'candidate-pair' && x.nominated && x.state === 'succeeded') pair = x; });
      if (pair) {
        const lc = r.get(pair.localCandidateId), rc = r.get(pair.remoteCandidateId);
        o.route = (lc ? lc.candidateType : '?') + '/' + (rc ? rc.candidateType : '?');
        if (lc && lc.networkType) o.net = lc.networkType;
        if (pair.currentRoundTripTime !== undefined) o.rtt = Math.round(pair.currentRoundTripTime * 1000);
      }
      const key = dir + pid, p = this.prev.get(key) || {};
      const cur = {};
      r.forEach((x) => {
        if (x.kind !== 'audio' && x.mediaType !== 'audio') return;
        if (x.type === 'inbound-rtp') {
          cur.rx = x.packetsReceived; cur.lost = x.packetsLost; cur.conc = x.concealedSamples; cur.tot = x.totalSamplesReceived;
          o.jit = Math.round((x.jitter || 0) * 1000);
          if (x.jitterBufferEmittedCount) o.jb = Math.round(x.jitterBufferDelay / x.jitterBufferEmittedCount * 1000);
          if (x.audioLevel !== undefined) o.lvl = +x.audioLevel.toFixed(3);
        } else if (x.type === 'remote-inbound-rtp') {
          o.lossOut = +(x.fractionLost || 0).toFixed(3);
          if (x.roundTripTime) o.rtt = Math.round(x.roundTripTime * 1000);
        } else if (x.type === 'outbound-rtp') {
          cur.tx = x.packetsSent;
        } else if (x.type === 'media-source') {
          if (x.audioLevel !== undefined) o.mic = +x.audioLevel.toFixed(3);
        }
      });
      if (cur.rx !== undefined && p.rx !== undefined) {
        const rx = cur.rx - p.rx, lost = cur.lost - p.lost;
        o.lossIn = +(lost / Math.max(1, rx + lost)).toFixed(3);
        o.gaps = +((cur.conc - p.conc) / Math.max(1, cur.tot - p.tot)).toFixed(3);   // part de voix inventée (trous)
      }
      if (cur.tx !== undefined && p.tx !== undefined) o.pps = Math.round((cur.tx - p.tx) / 15);
      this.prev.set(key, cur);
      out.push(o);
    };
    for (const [pid, c] of this.out) await one(c, 'out', pid).catch(() => {});
    for (const [pid, e] of this.in) await one(e.call, 'in', pid).catch(() => {});
    return out;
  }
  async report() {
    if (this.peer.destroyed || (!this.out.size && !this.in.size)) return;
    try {
      const calls = await this.stats();
      const body = JSON.stringify({
        me: String(this.myId).slice(-6), dev: DEVICE, mic: this.on, vol: this.volume, turn: !!window.DogTurn,
        vis: document.visibilityState, calls,
      });
      fetch('/api/netlog', { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => {});
    } catch (e) { /* ignore */ }
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
    if (pid === this.myId) return this.on && this.myLevel > 0.03;
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
    return false;
  }
  async readMyLevel() {
    const call = this.on && this.out.values().next().value;
    const pc = call && call.peerConnection;
    if (!pc || this.reading) { if (!call) this.myLevel = 0; return; }
    this.reading = true;
    try {
      const r = await pc.getStats();
      r.forEach((x) => { if (x.type === 'media-source' && x.kind === 'audio' && typeof x.audioLevel === 'number') this.myLevel = x.audioLevel; });
    } catch (e) { /* ignore */ }
    this.reading = false;
  }
  hears(pid) { return this.in.has(pid); }

  close() {
    try { this.peer.off('call', this.onCall); } catch (e) { /* ignore */ }
    if (this.onDevices) { try { navigator.mediaDevices.removeEventListener('devicechange', this.onDevices); } catch (e) { /* ignore */ } }
    window.removeEventListener('pointerdown', this.retry);
    window.removeEventListener('keydown', this.retry);
    clearInterval(this.health);
    clearInterval(this.reporter);
    clearInterval(this.meter);
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
