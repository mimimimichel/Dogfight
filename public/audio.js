/*
 * Dogfight — effets sonores synthétisés avec WebAudio (aucun fichier externe).
 */
(function () {
  'use strict';

  const MASTER = 0.9;

  class Sfx {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.muted = false;
      try { this.muted = localStorage.getItem('dogfight.muted') === '1'; } catch (e) { /* ignore */ }
    }

    unlock() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        // iPhone : le son du jeu suit le volume « média » (et pas le bouton silencieux)
        try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
        this.master = this.output(this.ctx);
        this.master.gain.value = this.muted ? 0 : MASTER;
        // bruitages et ambiances passent par leur propre bus : on peut les baisser quand quelqu'un parle
        this.fx = this.ctx.createGain(); this.fx.connect(this.master);
        this.loadBarks();
        // iOS/Android peuvent « interrompre » le son (appel, mise en veille, surcharge) : on le relance
        this.ctx.onstatechange = () => {
          if (this.ctx.state !== 'running' && !document.hidden) this.ctx.resume().catch(() => {});
        };
        document.addEventListener('visibilitychange', () => {
          if (!this.ctx) return;
          if (document.hidden) { this.ctx.suspend().catch(() => {}); }
          else { this.ctx.resume().catch(() => {}); this.musicResync = true; }
        });
        if (this.wantTheme) { const w = this.wantTheme; this.theme = undefined; this.music(w); }
      }
      if (this.ctx.state !== 'running' && !document.hidden) this.ctx.resume().catch(() => {});
    }

    /**
     * Sortie : compresseur + gain de rattrapage. Les sons sont synthétisés très
     * doucement ; on les remonte ici pour que le jeu s'entende bien sur un
     * téléphone, sans saturer (crépitements) quand tout joue en même temps.
     */
    output(c) {
      const master = c.createGain(), comp = c.createDynamicsCompressor(), makeup = c.createGain();
      comp.threshold.value = -20; comp.knee.value = 10; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.25;
      makeup.gain.value = 1.15;
      master.connect(comp); comp.connect(makeup); makeup.connect(c.destination);
      this.makeup = makeup;
      return master;
    }

    /**
     * Micro allumé sur Chrome / Android : l'anti-écho de Chrome n'entend pas le son
     * joué par WebAudio (musique, bruitages, voix des personnages) — il partait dans le
     * micro et hachait la voix chez l'ami. Comme les applis de visio, on fait passer le
     * son du jeu par une petite boucle WebRTC locale lue par un élément <audio> : l'anti-écho
     * le connaît alors et l'enlève du micro. (Safari et Firefox le font déjà tout seuls.)
     */
    echoSafe(on) {
      const ua = navigator.userAgent;
      if (!this.ctx || !this.makeup || !/Chrome\//.test(ua) || /CriOS|EdgiOS|FxiOS/.test(ua) || !window.RTCPeerConnection || !this.ctx.createMediaStreamDestination) return;
      if (!!on === !!this.loop) return;
      const back = () => { try { this.makeup.disconnect(); } catch (e) { /* ignore */ } this.makeup.connect(this.ctx.destination); };
      if (!on) {
        const L = this.loop; this.loop = null;
        if (L.live) back();
        try { L.a.close(); L.b.close(); } catch (e) { /* ignore */ }
        L.el.srcObject = null; L.el.remove();
        return;
      }
      const L = this.loop = { live: false };
      try {
        const dest = this.ctx.createMediaStreamDestination();
        const a = L.a = new RTCPeerConnection(), b = L.b = new RTCPeerConnection();
        a.onicecandidate = (e) => { if (e.candidate) b.addIceCandidate(e.candidate).catch(() => {}); };
        b.onicecandidate = (e) => { if (e.candidate) a.addIceCandidate(e.candidate).catch(() => {}); };
        const el = L.el = document.createElement('audio');
        el.autoplay = true; el.playsInline = true; el.style.display = 'none';
        document.body.appendChild(el);
        b.ontrack = (e) => {
          try { if ('jitterBufferTarget' in e.receiver) e.receiver.jitterBufferTarget = 0; } catch (err) { /* ignore */ }
          el.srcObject = e.streams[0] || new MediaStream([e.track]);
          el.play().catch(() => {});
        };
        // on bascule seulement quand la boucle joue vraiment (sinon : plus aucun son)
        el.addEventListener('playing', () => {
          if (this.loop !== L || L.live) return;
          L.live = true;
          try { this.makeup.disconnect(); } catch (err) { /* ignore */ }
          this.makeup.connect(dest);
        });
        for (const t of dest.stream.getAudioTracks()) a.addTrack(t, dest.stream);
        // musique en stéréo et bon débit (ce n'est pas une voix)
        const hifi = (sdp) => sdp.replace(/a=fmtp:(\d+) (.*useinbandfec=1.*)/g, (m, pt, p) => `a=fmtp:${pt} ${p};stereo=1;sprop-stereo=1;maxaveragebitrate=256000;usedtx=0`);
        (async () => {
          const o = await a.createOffer(); o.sdp = hifi(o.sdp);
          await a.setLocalDescription(o); await b.setRemoteDescription(o);
          const r = await b.createAnswer(); r.sdp = hifi(r.sdp);
          await b.setLocalDescription(r); await a.setRemoteDescription(r);
        })().catch(() => {});
      } catch (e) { /* on garde la sortie directe */ }
    }

    toggleMute() {
      this.muted = !this.muted;
      try { localStorage.setItem('dogfight.muted', this.muted ? '1' : '0'); } catch (e) { /* ignore */ }
      if (this.master) this.master.gain.value = this.muted ? 0 : MASTER;
      return this.muted;
    }

    get ok() { return this.ctx && !this.muted; }

    tone(freq, dur, opts) {
      if (!this.ok) return;
      opts = opts || {};
      const c = this.ctx, t = c.currentTime + (opts.delay || 0);
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = opts.type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
      const v = opts.vol || 0.2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      // (les ondes carrées ou en dents de scie sont adoucies : pas de son « jeu vidéo 8 bits »)
      if (o.type === 'square' || o.type === 'sawtooth') {
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800; lp.Q.value = 0.3;
        o.connect(lp); lp.connect(g);
      } else o.connect(g);
      g.connect(this.fx || this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
    }

    /** Une note d'un vrai instrument (si chargé) pour les bruitages mélodiques ; sinon une note de synthèse douce. */
    note(inst, midi, vol, delay, dur) {
      if (!this.ok) return;
      this.loadInst();
      const t = this.ctx.currentTime + (delay || 0);
      if (this.instSample({ dry: this.fx || this.master }, inst, midi, t, dur || 0.3, vol, 0)) return;
      this.pluck(440 * Math.pow(2, (midi - 69) / 12), (dur || 0.3) + 0.15, vol, delay, true);
    }

    /** Une note douce, façon marimba / boîte à musique : son pur + une harmonique qui s'éteint vite. */
    pluck(freq, dur, vol, delay, synthOnly) {
      if (!this.ok) return;
      const c = this.ctx, t = c.currentTime + (delay || 0);
      // le vrai marimba enregistré quand il est chargé
      if (!synthOnly && this.instSample({ dry: this.fx || this.master }, 'mallet', 69 + 12 * Math.log2(freq / 440), t, dur, vol * 0.9, 0)) return;
      for (const [mul, v, d] of [[1, 1, dur], [4, 0.18, dur * 0.35], [2, 0.12, dur * 0.6]]) {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = freq * mul;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol * v, t + 0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g); g.connect(this.fx || this.master);
        o.start(t); o.stop(t + d + 0.02);
      }
    }

    noise(dur, opts) {
      if (!this.ok) return;
      opts = opts || {};
      const c = this.ctx, t = c.currentTime + (opts.delay || 0);
      const len = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = c.createBufferSource();
      src.buffer = buf;
      const f = c.createBiquadFilter();
      f.type = opts.filter || 'lowpass';
      f.frequency.setValueAtTime(opts.freq || 1200, t);
      if (opts.freqTo) f.frequency.exponentialRampToValueAtTime(opts.freqTo, t + dur);
      const g = c.createGain();
      const v = opts.vol || 0.3;
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f);
      f.connect(g);
      g.connect(this.fx || this.master);
      src.start(t);
    }

    /** Bruit de patte selon le sol : 'grass', 'dirt', 'stone', 'wood', 'water', 'snow'. */
    paw(surface, vol) {
      if (!this.ok) return;
      const c = this.ctx, t = c.currentTime;
      if (!this.pawBuf) {
        const len = Math.floor(c.sampleRate * 0.12), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
        this.pawBuf = b;
      }
      const S = { grass: ['bandpass', 2600, 0.05, 0.07], dirt: ['lowpass', 900, 0.06, 0.09], stone: ['highpass', 2400, 0.035, 0.08], wood: ['bandpass', 520, 0.07, 0.12], water: ['bandpass', 1400, 0.12, 0.1], snow: ['lowpass', 1600, 0.09, 0.08] }[surface] || ['bandpass', 2600, 0.05, 0.07];
      const src = c.createBufferSource(); src.buffer = this.pawBuf; src.playbackRate.value = 0.85 + Math.random() * 0.3;
      const f = c.createBiquadFilter(); f.type = S[0]; f.frequency.value = S[1] * (0.9 + Math.random() * 0.2); f.Q.value = surface === 'wood' ? 3 : 0.8;
      const g = c.createGain(); const v = S[3] * (vol || 1);
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + S[2]);
      src.connect(f); f.connect(g); g.connect(this.fx || this.master);
      src.start(t); src.stop(t + S[2] + 0.02);
      if (surface === 'wood') this.tone(160 + Math.random() * 30, 0.05, { type: 'sine', vol: 0.05 * (vol || 1) });
    }

    hit(heavy) {
      this.noise(heavy ? 0.16 : 0.08, { freq: heavy ? 900 : 1800, vol: heavy ? 0.5 : 0.35 });
      this.tone(heavy ? 140 : 220, heavy ? 0.18 : 0.1, { type: 'sine', to: heavy ? 50 : 90, vol: heavy ? 0.5 : 0.3 });
    }

    block() {
      this.pluck(1320, 0.12, 0.1);
      this.noise(0.05, { filter: 'highpass', freq: 3000, vol: 0.15 });
    }

    thud() { this.noise(0.25, { freq: 300, vol: 0.45 }); this.tone(70, 0.2, { type: 'sine', to: 40, vol: 0.4 }); }

    swing(heavy) { this.noise(heavy ? 0.14 : 0.08, { filter: 'bandpass', freq: heavy ? 900 : 1600, freqTo: heavy ? 300 : 800, vol: 0.18 }); }

    jump() { this.tone(260, 0.1, { type: 'triangle', to: 520, vol: 0.1 }); }

    /** Vrais aboiements enregistrés (adventure/assets/sfx, voir CREDITS.md), chargés au premier appel. */
    loadBarks() {
      if (this.barkBufs || !this.ctx) return;
      this.barkBufs = {};
      for (const n of ['bark_big', 'bark_small', 'meow']) {
        fetch(new URL('adventure/assets/sfx/' + n + '.mp3', document.baseURI)).then(r => r.arrayBuffer())
          .then(b => new Promise((res, rej) => this.ctx.decodeAudioData(b, res, rej))).then((buf) => { this.barkBufs[n] = buf; }).catch(() => {});
      }
    }
    sample(name, rate, vol) {
      const buf = this.barkBufs && this.barkBufs[name];
      if (!buf || !this.ok) return false;
      const c = this.ctx, src = c.createBufferSource(), g = c.createGain();
      src.buffer = buf; src.playbackRate.value = rate * (0.96 + Math.random() * 0.08);
      g.gain.value = vol;
      src.connect(g); g.connect(this.fx || this.master);
      src.start();
      return true;
    }

    bark(charId) {
      this.loadBarks();
      // un vrai aboiement : grave et fort pour Ainu, plus aigu pour Matcha
      if (charId === 'matcha' ? this.sample('bark_small', 1.25, 0.9) : this.sample('bark_big', 0.9, 1.25)) return;
      if (charId === 'matcha') {
        this.tone(820, 0.07, { type: 'sawtooth', to: 520, vol: 0.2 });
        this.tone(900, 0.06, { type: 'sawtooth', to: 600, vol: 0.18, delay: 0.09 });
      } else {
        this.tone(380, 0.13, { type: 'sawtooth', to: 200, vol: 0.25 });
        this.noise(0.1, { filter: 'bandpass', freq: 700, vol: 0.15 });
      }
    }

    superMove(charId) {
      const base = charId === 'matcha' ? 520 : 330;
      [0, 4, 7, 12].forEach((s, i) => this.pluck(base * Math.pow(2, s / 12), 0.35, 0.14, i * 0.06));
      if (charId === 'ainu') this.tone(300, 1.1, { type: 'sawtooth', to: 620, vol: 0.18, delay: 0.3 });
      else this.noise(0.6, { filter: 'bandpass', freq: 1200, freqTo: 4000, vol: 0.2, delay: 0.25 });
    }

    ko() {
      this.tone(500, 0.9, { type: 'triangle', to: 80, vol: 0.22 });
      this.noise(0.5, { freq: 500, vol: 0.4 });
    }

    announce(kind) {
      if (kind === 'round') { this.pluck(523, 0.4, 0.16); this.pluck(784, 0.5, 0.16, 0.12); }
      else if (kind === 'fight') { [523, 659, 784].forEach((f, i) => this.pluck(f, 0.6, 0.12, i * 0.03)); }
      else if (kind === 'time') { this.pluck(784, 0.4, 0.15); this.pluck(587, 0.5, 0.15, 0.2); }
    }

    win() {
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.pluck(f, i === 5 ? 0.9 : 0.4, 0.15, i * 0.13));
    }

    // un petit « toc » doux et rond (bulle + note de marimba), pas un bip
    click() {
      this.tone(420, 0.07, { type: 'sine', to: 760, vol: 0.12 });
      this.pluck(988, 0.16, 0.07, 0.01);
    }

    // ---------------------------------------------------------------------
    // Ambiances continues (eau, vent, vagues, ville, moteur) : quelques nœuds
    // créés une seule fois, dont on règle juste le volume à chaque image.
    // ---------------------------------------------------------------------
    noiseLoop() {
      if (!this.nbuf) {
        const c = this.ctx, len = c.sampleRate * 3, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
        let b = 0;
        for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.55 + b * 3; }  // un peu « rose »
        this.nbuf = buf;
      }
      const s = this.ctx.createBufferSource();
      s.buffer = this.nbuf; s.loop = true; s.loopStart = 0; s.loopEnd = this.nbuf.duration;
      s.start(this.ctx.currentTime, Math.random() * 2.5);
      return s;
    }

    lfo(freq, depth, target) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.frequency.value = freq; g.gain.value = depth; o.connect(g); g.connect(target); o.start();
      return o;
    }

    makeAmb(name) {
      const c = this.ctx, g = c.createGain();
      g.gain.value = 0.0001; g.connect(this.fx || this.master);
      const a = { g, base: 0.2, v: 0, p: -1 };
      const filt = (type, f, q) => { const n = c.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q) n.Q.value = q; return n; };
      if (name === 'water') {          // fontaine, cascade : bruissement clair qui bouillonne
        // (doux : plus de sifflement aigu, surtout un murmure grave)
        const src = this.noiseLoop(), hi = filt('bandpass', 900, 0.8), lo = filt('lowpass', 380), gh = c.createGain(), gl = c.createGain();
        gh.gain.value = 0.25; gl.gain.value = 0.6;
        src.connect(hi); hi.connect(gh); gh.connect(g); src.connect(lo); lo.connect(gl); gl.connect(g);
        this.lfo(0.37, 200, hi.frequency); this.lfo(2.1, 0.08, gh.gain);
        a.base = 0.16;
      } else if (name === 'wind') {    // souffle qui monte et retombe ; p (0..1) : plus fort, plus aigu
        const src = this.noiseLoop(), f = filt('lowpass', 420, 1.2), m = c.createGain();
        m.gain.value = 0.75; src.connect(f); f.connect(m); m.connect(g);
        this.lfo(0.09, 180, f.frequency); this.lfo(0.13, 0.35, m.gain);
        a.base = 0.42;
        a.set = (p, t) => f.frequency.setTargetAtTime(330 + p * 900, t, 0.5);
      } else if (name === 'waves') {   // ressac lent
        const src = this.noiseLoop(), f = filt('lowpass', 650), m = c.createGain();
        m.gain.value = 0.55; src.connect(f); f.connect(m); m.connect(g);
        this.lfo(0.11, 0.5, m.gain); this.lfo(0.11, 260, f.frequency);
        a.base = 0.36;
      } else if (name === 'city') {    // rumeur lointaine de la ville
        const src = this.noiseLoop(), f = filt('lowpass', 260); src.connect(f); f.connect(g);
        a.base = 0.2;
      } else if (name === 'engine') {  // moteur à hélice ; p (0..1) : régime
        const o1 = c.createOscillator(), o2 = c.createOscillator(), f = filt('lowpass', 700, 2), m = c.createGain(), flutter = c.createGain();
        o1.type = 'sawtooth'; o2.type = 'square'; o2.detune.value = 9;
        const g2 = c.createGain(); g2.gain.value = 0.45;
        o1.connect(f); o2.connect(g2); g2.connect(f); f.connect(m); m.connect(g);
        const src = this.noiseLoop(), nf = filt('bandpass', 900, 0.8), ng = c.createGain();
        ng.gain.value = 0.35; src.connect(nf); nf.connect(ng); ng.connect(flutter); flutter.connect(g);
        flutter.gain.value = 0.5;
        const prop = c.createOscillator(), pg = c.createGain(); prop.frequency.value = 14; pg.gain.value = 0.45;
        prop.connect(pg); pg.connect(flutter.gain); prop.start();
        o1.start(); o2.start();
        a.base = 0.16;
        a.set = (p, t) => {
          const f0 = 48 + p * 62;
          o1.frequency.setTargetAtTime(f0, t, 0.15); o2.frequency.setTargetAtTime(f0 * 0.5, t, 0.15);
          f.frequency.setTargetAtTime(500 + p * 1100, t, 0.2);
          prop.frequency.setTargetAtTime(9 + p * 26, t, 0.15);
        };
      }
      (this.ambs || (this.ambs = {}))[name] = a;
      return a;
    }

    /** Volume (0..1) et réglage p d'une ambiance ; appelé à chaque image. */
    amb(name, vol, p) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      let a = this.ambs && this.ambs[name];
      if (!a) { if (vol < 0.01) return; a = this.makeAmb(name); }
      const t = this.ctx.currentTime;
      if (Math.abs(vol - a.v) > 0.015 || (vol === 0 && a.v !== 0)) { a.v = vol; a.g.gain.setTargetAtTime(Math.max(0.0001, vol * a.base), t, 0.3); }
      if (a.set && p !== undefined && Math.abs(p - a.p) > 0.02) { a.p = p; a.set(p, t); }
    }

    /** Coupe toutes les ambiances (fin de partie, pause). */
    ambStop() { if (this.ambs) for (const k in this.ambs) this.amb(k, 0); }

    /** Petit chant d'oiseau (kind : 'bird', 'gull', 'owl'). */
    bird(kind, vol) {
      if (!this.ok) return;
      vol = vol || 1;
      if (kind === 'gull') {
        for (let i = 0; i < 2 + (Math.random() * 2 | 0); i++) {
          const f = 1100 + Math.random() * 300;
          this.tone(f, 0.22, { type: 'triangle', to: f * 0.62, vol: 0.05 * vol, delay: i * 0.26 });
        }
      } else if (kind === 'owl') {
        this.tone(390, 0.32, { type: 'sine', to: 350, vol: 0.05 * vol });
        this.tone(380, 0.5, { type: 'sine', to: 330, vol: 0.05 * vol, delay: 0.45 });
      } else {
        const f0 = 2600 + Math.random() * 1800, n = 2 + (Math.random() * 4 | 0), up = Math.random() < 0.5;
        for (let i = 0; i < n; i++) {
          const f = f0 * (1 + (Math.random() - 0.5) * 0.15);
          this.tone(f, 0.06 + Math.random() * 0.05, { type: 'sine', to: f * (up ? 1.35 : 0.7), vol: 0.045 * vol, delay: i * (0.09 + Math.random() * 0.05) });
        }
      }
    }

    /** Miaulement : voix nasillarde dont la hauteur et le timbre s'ouvrent puis retombent (« mi-a-ou »). */
    meow(pitch) {
      if (!this.ok) return;
      const k = pitch || (0.9 + Math.random() * 0.3);
      // un vrai miaulement enregistré (chat siamois, CC0), un peu accéléré : plus mignon, plus court
      if (this.sample('meow', 1.15 * k, 0.35)) return;
      const c = this.ctx, t = c.currentTime, dur = 0.55;
      const o = c.createOscillator(), o2 = c.createOscillator();
      o.type = 'sawtooth'; o2.type = 'triangle';
      const f = (v, at) => { o.frequency.linearRampToValueAtTime(v * k, t + at); o2.frequency.linearRampToValueAtTime(v * k * 2.01, t + at); };
      o.frequency.setValueAtTime(520 * k, t); o2.frequency.setValueAtTime(1040 * k, t);
      f(780, 0.12); f(720, 0.3); f(430, dur);
      const vib = c.createOscillator(), vg = c.createGain();
      vib.frequency.value = 7; vg.gain.value = 14 * k; vib.connect(vg); vg.connect(o.frequency);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
      bp.frequency.setValueAtTime(700, t); bp.frequency.linearRampToValueAtTime(2200, t + 0.15);
      bp.frequency.linearRampToValueAtTime(1500, t + 0.32); bp.frequency.linearRampToValueAtTime(600, t + dur);
      const g = c.createGain(), g2 = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
      g.gain.setValueAtTime(0.5, t + 0.32); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      g2.gain.value = 0.25;
      o.connect(bp); o2.connect(g2); g2.connect(bp); bp.connect(g); g.connect(this.fx || this.master);
      [o, o2, vib].forEach((x) => { x.start(t); x.stop(t + dur + 0.05); });
    }

    // -----------------------------------------------------------------------
    // Musique de fond : le thème d'Ainu & Matcha (écrit à la main) décliné pour
    // chaque lieu, entouré de parties composées par un petit compositeur (graine
    // fixe : un lieu sonne toujours pareil), joué par des instruments doux avec
    // de la réverbération. La musique suit l'action (setIntensity, stinger).
    // -----------------------------------------------------------------------
    get musicOn() { try { return localStorage.getItem('dogfight.music') !== '0'; } catch (e) { return true; } }
    setMusic(on) {
      try { localStorage.setItem('dogfight.music', on ? '1' : '0'); } catch (e) { /* ignore */ }
      if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(on ? (this.musicVol || 0.5) : 0.0001, this.ctx.currentTime, 0.3);
      return on;
    }
    /** Baisse la musique pendant qu'un personnage parle. */
    /** (level : volume gardé, 0.3 par défaut ; le plus bas des baisses en cours l'emporte) */
    duck(on, why, level) {
      if (!this.ctx) return;
      const k = why || 'voice';
      this.ducks = this.ducks || {};
      const was = this.ducks[k] || 0, lv = on ? (level || 0.3) : 0;
      if (was === lv) return;
      this.ducks[k] = lv;
      const g = Math.min(1, ...Object.values(this.ducks).filter(Boolean));
      const t = this.ctx.currentTime, tc = g < (this.duckG || 1) ? 0.1 : 0.6;
      this.duckG = g;
      if (this.fx) this.fx.gain.setTargetAtTime(g, t, tc);
      if (this.musicBus && this.musicOn) this.musicBus.gain.setTargetAtTime((this.musicVol || 0.5) * g, t, tc);
    }

    /**
     * Intensité de l'action, de 0 (calme) à 1 (combat de boss) : ajoute ou retire la basse
     * et la batterie. Peut être appelé à chaque image : la musique ne change qu'à la
     * prochaine barre de mesure (jamais au milieu). null : la musique décide seule.
     */
    setIntensity(x) {
      this.intensity = x === null || x === undefined ? null : Math.max(0, Math.min(1, +x || 0));
      return this.intensity;
    }

    /**
     * Courte phrase musicale calée sur le prochain temps de la musique en cours :
     * 'medal' (victoire), 'found' (découverte), 'danger' (un chat repère le chien),
     * 'ainu', 'matcha' (le motif du chien). La mélodie se tait le temps de la phrase.
     * Ignorée si la musique est coupée ou si la même phrase vient d'être jouée.
     */
    stinger(name) {
      const S = STINGERS[name], cm = this.composer;
      if (!S || !this.ok || !cm || !this.musicBus || !this.musicOn || this.ctx.state !== 'running') return false;
      const now = this.ctx.currentTime, seen = this.stingAt || (this.stingAt = {});
      if (seen[name] !== undefined && now - seen[name] < S.gap) return false;
      seen[name] = now;
      const s16 = cm.s16, beat = s16 * 4, from = now + (S.after || 0.05);
      const t0 = cm.tBar + Math.ceil((from - cm.tBar) / beat) * beat;
      const base = S.low ? cm.key - 12 : cm.hi(), pitch = (d) => base + (S.semi ? d : cm.deg(d));
      let end = t0;
      for (const [p, d, l] of S.notes) {
        const tt = t0 + p * s16, len = l * s16 * (S.legato || 0.9);
        this.inst(cm.out, S.inst, pitch(d), tt, len, S.vol, 0.4);
        end = Math.max(end, tt + len);
      }
      const lastP = S.notes[S.notes.length - 1][0];
      if (S.bell) for (const d of S.bell) this.inst(cm.out, 'bell', pitch(d) + 12, t0 + lastP * s16, s16 * 6, 0.04, 0.8);
      cm.sting = [t0, end];
      return true;
    }

    /** Choisit l'ambiance ('menu', 'adventure', 'adv1'…'adv8', 'boss', 'fight' ou null pour couper). */
    music(theme) {
      if (theme === 'adventure' && this.theme && /^adv\d/.test(this.theme)) return;   // l'ambiance du niveau est déjà là
      this.wantTheme = theme;
      if (!this.ctx) return; // démarrera au premier contact (unlock)
      this.loadInst();
      if (this.theme === theme) return;
      this.theme = theme;
      this.intensity = null; this.composer = null;
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
      if (this.musicBus) {
        const old = this.musicBus, t = this.ctx.currentTime;
        old.gain.setTargetAtTime(0.0001, t, 0.5);
        setTimeout(() => old.disconnect(), 2500);
        this.musicBus = null;
      }
      const style = theme && STYLES[theme === 'adventure' ? 'adv1' : theme];
      if (!style) return;
      const c = this.ctx;
      const bus = c.createGain();
      this.musicVol = style.vol;
      bus.gain.value = 0.0001; bus.gain.setTargetAtTime(this.musicOn ? style.vol : 0.0001, c.currentTime, 0.8);
      // réverbération légère : un écho filtré (deux lignes de retard), construit une seule fois
      if (!this.musicFx) {
        const fx = c.createGain(), lp = c.createBiquadFilter(), d1 = c.createDelay(1), d2 = c.createDelay(1), fb1 = c.createGain(), fb2 = c.createGain(), wet = c.createGain();
        lp.type = 'lowpass'; lp.frequency.value = 2400;
        d1.delayTime.value = 0.137; d2.delayTime.value = 0.211; fb1.gain.value = 0.42; fb2.gain.value = 0.36; wet.gain.value = 0.5;
        fx.connect(lp); lp.connect(d1); lp.connect(d2);
        d1.connect(fb1); fb1.connect(d2); d2.connect(fb2); fb2.connect(d1);
        d1.connect(wet); d2.connect(wet);
        this.musicFx = { in: fx, out: wet };
      }
      if (this.musicFxOut) { try { this.musicFx.out.disconnect(this.musicFxOut); } catch (e) { /* ignore */ } }
      const dry = c.createGain(), rev = c.createGain();
      rev.gain.value = (style.wet || 0.3) * 1.2;
      dry.connect(bus); rev.connect(this.musicFx.in); this.musicFx.out.connect(bus); this.musicFxOut = bus;
      bus.connect(this.master);
      this.musicBus = bus;
      const out = { dry, wet: rev };
      const comp0 = this.composer = new Composer(this, out, style, theme === 'adventure' ? 'adv1' : theme);
      let next = c.currentTime + 0.15;
      const tick = () => {
        if (!this.ctx || this.musicBus !== bus || this.ctx.state !== 'running') return;
        const now = this.ctx.currentTime;
        // si le jeu a été bloqué (chargement d'un niveau, onglet en arrière-plan) on saute les mesures
        // manquées au lieu de toutes les jouer d'un coup
        if (this.musicResync || next < now) { next = now + 0.1; this.musicResync = false; }
        let n = 0;
        while (next < now + 0.5 && n++ < 2) next = comp0.bar(next);
      };
      tick();
      this.musicTimer = setInterval(tick, 200);
    }

    /**
     * Vrais instruments enregistrés (banque FluidR3_GM, CC BY 3.0, voir CREDITS.md) :
     * un fichier par instrument, une note toutes les 3 demi-tons, 2 s chacune.
     * Chargés en douceur au lancement de la musique ; en attendant, on joue les sons de synthèse.
     */
    loadInst() {
      if (this.instBufs || !this.ctx) return;
      this.instBufs = {};
      for (const k of Object.keys(INST_SPRITES)) {
        fetch(new URL('adventure/assets/sfx/inst/' + k + '.mp3', document.baseURI)).then(r => r.arrayBuffer())
          .then(b => new Promise((res, rej) => this.ctx.decodeAudioData(b, res, rej))).then((buf) => { this.instBufs[k] = buf; }).catch(() => {});
      }
    }
    instSample(out, inst, midi, t, dur, vol, rev) {
      const sp = INST_SPRITES[inst], buf = this.instBufs && this.instBufs[inst];
      if (!sp || !buf) return false;
      const c = this.ctx;
      const i = Math.max(0, Math.min(sp.n - 1, Math.round((midi - sp.lo) / 3)));
      const src = c.createBufferSource(), g = c.createGain();
      src.buffer = buf; src.playbackRate.value = Math.pow(2, (midi - (sp.lo + i * 3)) / 12);
      g.connect(out.dry);
      if (rev) { const r = c.createGain(); r.gain.value = rev; g.connect(r); r.connect(out.wet); }
      src.connect(g);
      const peak = vol * sp.k, held = sp.held ? Math.min(dur, 1.7) : Math.min(1.8, Math.max(dur, 0.25));
      const end = t + held + sp.rel;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + sp.a);
      g.gain.setValueAtTime(peak, t + held);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      src.start(t, i * 2.0, Math.min(1.98, (end - t) * src.playbackRate.value + 0.02));
      src.onended = () => { try { g.disconnect(); } catch (e) { /* ignore */ } };
      return true;
    }

    /** Une note d'instrument (échantillon enregistré, ou 1 à 2 oscillateurs). inst : 'piano', 'mallet', 'flute', 'bass', 'pad', 'pluck', 'bell'. */
    inst(out, inst, midi, t, dur, vol, rev) {
      if (this.instSample(out, inst, midi, t, dur, vol, rev)) return;
      const c = this.ctx, f = 440 * Math.pow(2, (midi - 69) / 12);
      const g = c.createGain();
      g.connect(out.dry);
      if (rev) { const r = c.createGain(); r.gain.value = rev; g.connect(r); r.connect(out.wet); }
      let end = t + dur;
      const env = (a, peak, dec, sus, rel) => {
        const hold = t + Math.max(a + dec, dur);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + a);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + dec);
        g.gain.setValueAtTime(Math.max(0.0001, peak * sus), hold);
        g.gain.exponentialRampToValueAtTime(0.0001, hold + rel);
        end = hold + rel + 0.02;
      };
      const oscs = [];
      const osc = (type, freq, v, to) => {
        const o = c.createOscillator(); o.type = type; o.frequency.value = freq;
        if (v === 1) o.connect(to || g); else { const og = c.createGain(); og.gain.value = v; o.connect(og); og.connect(to || g); }
        oscs.push(o); return o;
      };
      if (inst === 'piano') {        // piano électrique doux
        osc('sine', f, 1); osc('sine', f * 2, 0.2);
        env(0.006, vol, 0.8, 0.22, 0.35);
      } else if (inst === 'mallet') { // marimba
        osc('sine', f, 1);
        env(0.004, vol, 0.4, 0.05, 0.2);
      } else if (inst === 'bell') {   // petites cloches (scintillement)
        osc('sine', f, 1); osc('sine', f * 2.76, 0.25);
        env(0.003, vol, 1.0, 0.05, 0.4);
      } else if (inst === 'flute') {
        osc('triangle', f, 1);
        env(0.06, vol, 0.2, 0.75, 0.2);
      } else if (inst === 'bass') {
        osc('triangle', f, 1);
        env(0.01, vol, 0.45, 0.45, 0.12);
      } else if (inst === 'pluck') {  // guitare / pizzicato
        osc('triangle', f, 1); osc('sine', f * 2, 0.15);
        env(0.004, vol, 0.3, 0.08, 0.15);
      } else {                        // 'pad' : nappe chaude
        osc('triangle', f, 1); osc('sine', f * 1.003, 0.7);
        env(Math.min(0.6, dur * 0.35), vol, 0.5, 0.8, 0.6);
      }
      for (const o of oscs) { o.start(t); o.stop(end); }
      oscs[0].onended = () => { try { g.disconnect(); } catch (e) { /* ignore */ } };
    }
    perc(out, kind, t, vol) {
      const c = this.ctx;
      if (kind === 'kick') {
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
        g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g); g.connect(out.dry); o.start(t); o.stop(t + 0.25);
        return;
      }
      if (!this.noiseBuf) {
        const len = Math.floor(c.sampleRate * 0.3), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = b;
      }
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.noiseBuf;
      const len = kind === 'snare' ? 0.16 : kind === 'brush' ? 0.22 : 0.05;
      f.type = kind === 'shaker' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'shaker' ? 6500 : kind === 'brush' ? 2600 : 1900; f.Q.value = 0.8;
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(f); f.connect(g); g.connect(out.dry);
            src.start(t); src.stop(t + len + 0.02);
    }
  }

  // ---------------------------------------------------------------------------
  // Le compositeur
  // ---------------------------------------------------------------------------
  // instruments enregistrés : première note (midi), nombre de notes, gain, attaque, relâche, tenu (flûte, basse)
  const INST_SPRITES = {
    piano: { lo: 36, n: 21, k: 1.8, a: 0.004, rel: 0.35 },
    mallet: { lo: 48, n: 17, k: 1.6, a: 0.003, rel: 0.2 },
    bell: { lo: 60, n: 14, k: 1.5, a: 0.003, rel: 0.4 },
    flute: { lo: 57, n: 14, k: 4.5, a: 0.05, rel: 0.25, held: true },
    bass: { lo: 28, n: 13, k: 1.6, a: 0.01, rel: 0.15, held: true },
    pluck: { lo: 40, n: 15, k: 1.8, a: 0.003, rel: 0.2 },
  };
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], minor: [0, 2, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11] };

  /**
   * Le thème d'Ainu & Matcha (leitmotiv), écrit à la main : 8 mesures à 4 temps,
   * facile à chanter (une octave, des pas conjoints, une question puis une réponse).
   * Écrit en degrés de la gamme (0 = tonique, 7 = tonique à l'octave) : il prend
   * tout seul la couleur du mode de chaque lieu (majeur, dorien, lydien, mineur).
   * Une note = [position en doubles croches, degré, durée en doubles croches].
   *   « Ai-nu, Mat-cha, | tous les deux, | on court, on joue, | par-tout !
   *     Do  Do  Mi  Sol  | La  Sol Mi    | Fa  Fa   Mi  Ré   | Mi  Ré
   *     Ai-nu, Mat-cha, | chiens si heu-reux, | on joue en-co- | re ! »
   *     Do  Do  Mi  Sol  | La  Sol Mi  Do'    | La  Sol Fa  Ré  | Do
   */
  const LEITMOTIV = [
    [[0, 0, 4], [4, 0, 4], [8, 2, 4], [12, 4, 4]],
    [[0, 5, 4], [4, 4, 4], [8, 2, 8]],
    [[0, 3, 4], [4, 3, 4], [8, 2, 4], [12, 1, 4]],
    [[0, 2, 8], [8, 1, 8]],
    [[0, 0, 4], [4, 0, 4], [8, 2, 4], [12, 4, 4]],
    [[0, 5, 4], [4, 4, 4], [8, 2, 4], [12, 7, 4]],
    [[0, 5, 4], [4, 4, 4], [8, 3, 4], [12, 1, 4]],
    [[0, 0, 16]],
  ];
  /**
   * Le petit motif de chaque chien (1 mesure, sur l'accord de la mesure).
   * Ainu : grave et doux (Sol — Mi Do —, legato). Matcha : aigu et sautillant (Sol Mi Sol Do' · Sol Do', piqué).
   */
  const DOGS = {
    ainu: { notes: [[0, 4, 6], [6, 2, 2], [8, 0, 8]], low: true, inst: 'flute', vol: 0.13, legato: 1 },
    matcha: { notes: [[0, 4, 1], [2, 2, 1], [3, 4, 1], [4, 7, 2], [8, 4, 1], [10, 7, 3]], inst: 'mallet', vol: 0.12, legato: 0.8 },
  };
  /**
   * Courtes phrases jouées par-dessus la musique, calées sur le prochain temps.
   * semi : écart en demi-tons (sinon degrés de la gamme) ; after : pas avant (s) ; gap : délai mini entre deux fois (s).
   */
  const STINGERS = {
    medal: { notes: [[0, 4, 1], [1, 5, 1], [2, 6, 1], [3, 7, 3], [6, 4, 1], [7, 7, 6]], inst: 'mallet', vol: 0.14, after: 0.75, gap: 2, bell: [7, 9] },
    found: { notes: [[0, 2, 1], [1, 4, 1], [2, 7, 1], [3, 9, 5]], inst: 'bell', vol: 0.09, gap: 1.5 },
    danger: { notes: [[0, 0, 1], [1, 1, 1], [2, 0, 1], [3, 1, 1], [4, 6, 4]], semi: true, low: true, inst: 'pluck', vol: 0.12, gap: 5 },
    ainu: Object.assign({ gap: 2 }, DOGS.ainu),
    matcha: Object.assign({ gap: 2 }, DOGS.matcha),
  };
  /**
   * Ambiances. leit : le leitmotiv décliné pour le lieu (prog : un accord par mesure,
   * oct : registre de la mélodie, legato, swing8 : croches swinguées, push : croches
   * anticipées, pont : accords du dialogue des chiens). progs : enchaînements de degrés
   * (0 = I) pour les parties composées par la machine. Tout est tiré d'une graine fixe
   * par ambiance : un même lieu sonne toujours pareil.
   */
  const STYLES = {
    menu: { bpm: 84, keys: [65, 62, 67], mode: 'major', vol: 0.44, wet: 0.38, lead: 'piano', comp: 'piano', bassInst: 'bass', swing: 0.12, drums: 'soft', sevenths: true,
      leit: { prog: [0, 5, 3, 4, 0, 5, 4, 0], oct: 0 },
      progs: [[0, 5, 3, 4], [0, 2, 5, 3], [3, 4, 2, 5], [0, 4, 5, 3]] },
    // niveau 1 : le thème tel quel, clair et joyeux (marimba)
    adv1: { bpm: 100, keys: [60, 62, 65], mode: 'major', vol: 0.42, wet: 0.3, lead: 'mallet', comp: 'pluck', bassInst: 'bass', swing: 0.1, drums: 'light', sevenths: false, sparkle: true,
      leit: { prog: [0, 5, 3, 4, 0, 5, 4, 0], oct: 12 },
      progs: [[0, 4, 5, 3], [0, 3, 4, 4], [5, 3, 0, 4], [0, 5, 1, 4]] },
    // forêt : plus mystérieuse, dorien, à la flûte, plus grave et lié
    adv2: { bpm: 86, keys: [62, 57, 64], mode: 'dorian', vol: 0.44, wet: 0.45, lead: 'flute', comp: 'pluck', bassInst: 'bass', swing: 0, drums: 'brush', sevenths: true, sparkle: true,
      leit: { prog: [0, 3, 3, 4, 0, 0, 3, 0], oct: 0, legato: 1 },
      progs: [[0, 3, 0, 6], [0, 6, 3, 4], [3, 0, 6, 0], [0, 2, 3, 6]] },
    // ville : swing (croches inégales et anticipées), accords de septième, ii-V
    adv3: { bpm: 96, keys: [58, 63, 60], mode: 'major', vol: 0.42, wet: 0.3, lead: 'piano', comp: 'piano', bassInst: 'bass', swing: 0.18, drums: 'groove', sevenths: true,
      leit: { prog: [0, 5, 1, 4, 0, 5, 4, 0], oct: 12, swing8: 0.6, push: true, legato: 0.85 },
      progs: [[1, 4, 0, 5], [0, 5, 1, 4], [3, 2, 1, 4], [0, 3, 2, 5]] },
    // boss : en mineur, rapide et piqué
    boss: { bpm: 138, keys: [57, 55, 60], mode: 'minor', vol: 0.44, wet: 0.25, lead: 'mallet', comp: 'piano', bassInst: 'bass', swing: 0, drums: 'drive', sevenths: false,
      leit: { prog: [0, 5, 3, 4, 0, 5, 4, 0], oct: 12, legato: 0.6 },
      progs: [[0, 5, 3, 4], [0, 3, 4, 4], [5, 3, 0, 4], [0, 6, 5, 4]] },
    // ciel : lydien aérien (le Fa# des mesures 3 et 7), flûte haute, accord II majeur
    adv4: { bpm: 92, keys: [64, 62, 67], mode: 'lydian', vol: 0.42, wet: 0.5, lead: 'flute', comp: 'pluck', bassInst: 'bass', swing: 0.08, drums: 'light', sevenths: true, sparkle: true,
      leit: { prog: [0, 5, 1, 4, 0, 5, 1, 0], oct: 12, legato: 1, pont: [0, 0, 1, 4] },
      progs: [[0, 1, 4, 0], [0, 3, 1, 4], [5, 1, 0, 4], [0, 1, 5, 3]] },
    // neige : clochettes et marimba, un petit air de traîneau qui sautille
    adv5: { bpm: 108, keys: [65, 67, 62], mode: 'major', vol: 0.42, wet: 0.42, lead: 'mallet', comp: 'pluck', bassInst: 'bass', swing: 0.14, drums: 'light', sevenths: true, sparkle: true,
      leit: { prog: [0, 3, 4, 0, 5, 1, 4, 0], oct: 12, legato: 0.8 },
      progs: [[0, 3, 4, 0], [5, 1, 4, 0], [0, 5, 3, 4], [3, 4, 0, 5]] },
    // plage : guitare nylon qui balance, façon calypso, beaucoup d'air
    adv6: { bpm: 104, keys: [67, 65, 62], mode: 'major', vol: 0.42, wet: 0.36, lead: 'pluck', comp: 'mallet', bassInst: 'bass', swing: 0.2, drums: 'groove', sevenths: true, sparkle: true,
      leit: { prog: [0, 4, 3, 4, 0, 5, 4, 0], oct: 12, swing8: 0.5, legato: 0.7 },
      progs: [[0, 3, 4, 0], [0, 4, 5, 4], [3, 4, 0, 5], [0, 5, 3, 4]] },
    // ferme : air de campagne, flûte et guitare, ça trotte
    adv7: { bpm: 116, keys: [62, 67, 64], mode: 'major', vol: 0.42, wet: 0.3, lead: 'flute', comp: 'pluck', bassInst: 'bass', swing: 0.06, drums: 'light', sevenths: false, sparkle: false,
      leit: { prog: [0, 3, 4, 0, 0, 3, 4, 0], oct: 12, legato: 0.75 },
      progs: [[0, 3, 4, 0], [0, 4, 0, 4], [3, 0, 4, 0], [0, 5, 3, 4]] },
    // château des chats : piano malicieux en dorien, pas qui se faufilent
    adv8: { bpm: 94, keys: [62, 64, 57], mode: 'dorian', vol: 0.42, wet: 0.4, lead: 'piano', comp: 'pluck', bassInst: 'bass', swing: 0.16, drums: 'brush', sevenths: true, sparkle: true,
      leit: { prog: [0, 3, 6, 4, 0, 3, 4, 0], oct: 12, swing8: 0.4, legato: 0.6 },
      progs: [[0, 3, 0, 6], [0, 6, 3, 4], [3, 6, 0, 4], [0, 2, 3, 6]] },
    // combat 1 contre 1 : entièrement composé par la machine (graine fixe)
    fight: { bpm: 138, keys: [57, 64, 62], mode: 'minor', vol: 0.38, wet: 0.2, lead: 'mallet', comp: 'pluck', bassInst: 'bass', swing: 0, drums: 'drive', sevenths: false,
      progs: [[0, 5, 2, 6], [0, 3, 6, 4], [5, 6, 0, 0], [0, 6, 5, 6]] },
  };
  function rng(seed) { let x = seed >>> 0 || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }
  /** Graine fixe tirée du nom de l'ambiance (FNV-1a). */
  function seedOf(name) { let h = 2166136261; const s = String(name || 'menu'); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  /** Version « swing » d'une mesure du thème : les notes des temps 2 et 4 arrivent une croche plus tôt. */
  function pushBar(bar) {
    const ps = bar.map(([p, , l]) => ((p === 4 || p === 12) && l === 4 ? p - 2 : p));
    return bar.map(([p, d, l], i) => [ps[i], d, Math.min(l + p - ps[i], (i + 1 < bar.length ? ps[i + 1] : 16) - ps[i])]);
  }

  class Composer {
    constructor(sfx, out, style, name) {
      this.sfx = sfx; this.out = out; this.st = style;
      this.seed = seedOf(name);   // graine FIXE par ambiance (plus de hasard d'une partie à l'autre)
      this.loop = 0;
      this.s16 = 60 / style.bpm / 4;
      this.tBar = 0;
      this.sting = null;
      this.newSong();
    }
    newSong() {
      const st = this.st, r = this.r = rng(this.seed + this.loop * 7919);
      this.rm = rng((this.seed ^ 0x5bd1e995) + this.loop);   // petites variations de la mélodie (ne dépendent pas de l'intensité)
      this.key = st.leit ? st.keys[0] : st.keys[Math.floor(r() * st.keys.length)];
      this.scale = SCALES[st.mode];
      const pick = () => st.progs[Math.floor(r() * st.progs.length)];
      const S = (name, prog, motif, bars, layers) => ({ name, prog, motif, bars, layers });
      if (st.leit) {
        // le thème, puis une partie composée (qui change à chaque tour, toujours dans le même ordre),
        // le dialogue des deux chiens, et le thème encore
        const lp = st.leit.prog, B = pick(), mb = this.motif();
        this.sections = [
          S('intro', [0, 0], 'dogs', 2, { pad: 1, comp: 0, bass: 0, drums: 0, lead: 1 }),
          S('A', lp, 'leit', 8, { pad: 1, comp: 1, bass: 1, drums: 0, lead: 1 }),
          S('B', B, mb, 8, { pad: 1, comp: 1, bass: 1, drums: 1, lead: 1 }),
          S('pont', st.leit.pont || [0, 0, 3, 4], 'dogs', 4, { pad: 1, comp: 0, bass: 1, drums: 0, lead: 1, soft: 1 }),
          S('A2', lp, 'leit', 8, { pad: 0, comp: 1, bass: 1, drums: 1, lead: 1 }),
          S('fin', [0, 0], 'dogs', 2, { pad: 1, comp: 1, bass: 1, drums: 0, lead: 1 }),
        ];
      } else {
        const A = pick(), B = pick(), C = pick();
        // une phrase = 4 accords (1 par mesure) ; un thème mélodique par section, répété avec variations
        const ma = this.motif(), mb = this.motif(), mc = this.motif();
        this.sections = [
          S('intro', A, null, 4, { pad: 1, comp: 0, bass: 0, drums: 0, lead: 0 }),
          S('A', A, ma, 8, { pad: 1, comp: 1, bass: 1, drums: 0, lead: 1 }),
          S('B', B, mb, 8, { pad: 1, comp: 1, bass: 1, drums: 1, lead: 1 }),
          S('A2', A, ma, 8, { pad: 0, comp: 1, bass: 1, drums: 1, lead: 1, vary: 1 }),
          S('pont', C, mc, 8, { pad: 1, comp: 0, bass: 1, drums: 0, lead: 1, soft: 1 }),
          S('B2', B, mb, 8, { pad: 1, comp: 1, bass: 1, drums: 1, lead: 1, vary: 1, up: 1 }),
          S('fin', A, null, 4, { pad: 1, comp: 1, bass: 1, drums: 0, lead: 0 }),
        ];
      }
      this.loop++;
      this.si = 0; this.bi = 0; this.last = this.key + (st.leit ? st.leit.oct || 0 : 12);
    }
    /** Motif rythmique et mélodique de 2 mesures (positions en doubles croches, degrés relatifs). */
    motif() {
      const r = this.r, rhythms = [
        [0, 4, 6, 8, 12], [0, 3, 6, 8, 10, 12], [0, 2, 4, 8, 14], [0, 6, 8, 11, 12], [2, 4, 6, 8, 12, 14], [0, 4, 8, 10, 12],
      ];
      const bars = [rhythms[Math.floor(r() * rhythms.length)], rhythms[Math.floor(r() * rhythms.length)]];
      const steps = [];
      for (const bar of bars) steps.push(bar.map(() => [0, 1, -1, 2, -2, 1, 0, 3][Math.floor(r() * 8)]));
      return { bars, steps, lens: bars.map(b => b.map((p, i) => (i + 1 < b.length ? b[i + 1] : 16) - p)) };
    }
    /** Degré de la gamme → demi-tons au-dessus de la tonique. */
    deg(d) { const sc = this.scale; return sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7); }
    /** Registre aigu (Matcha, petites phrases). */
    hi() { return this.key < 63 ? this.key + 12 : this.key; }
    chordOf(deg) {
      const n = (d) => this.key + this.deg(d);
      const ch = [n(deg), n(deg + 2), n(deg + 4)];
      if (this.st.sevenths) ch.push(n(deg + 6));
      return ch;
    }
    scaleNear(midi, step) {
      // descend ou monte de « step » degrés dans la gamme, en partant de la note la plus proche
      const sc = this.scale, rel = ((midi - this.key) % 12 + 12) % 12;
      let idx = 0, best = 99; sc.forEach((s, i) => { const d = Math.abs(s - rel); if (d < best) { best = d; idx = i; } });
      const oct = Math.floor((midi - this.key) / 12), d = oct * 7 + idx + step;
      return this.key + sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    }
    /**
     * Couches réellement jouées : la section décide, et l'intensité demandée par le jeu
     * (sfx.setIntensity) ajoute ou retire basse et batterie. Lu au début de chaque mesure :
     * le changement tombe toujours sur une barre de mesure.
     */
    layers(base) {
      const x = this.sfx.intensity;
      if (x === null || x === undefined) return base;
      return Object.assign({}, base, { bass: x >= 0.5 ? 1 : x >= 0.2 ? base.bass : 0, drums: x >= 0.9 ? 2 : x >= 0.45 ? 1 : 0 });
    }
    /** Une note de mélodie (se tait le temps qu'une petite phrase passe devant). */
    note(inst, midi, tt, len, vol, rev) {
      const s = this.sting;
      if (s && tt > s[0] - 0.05 && tt < s[1]) return;
      this.sfx.inst(this.out, inst, midi, tt, len, vol, rev);
    }
    /** Écrit et programme une mesure à partir de t ; renvoie le début de la mesure suivante. */
    bar(t) {
      let sec = this.sections[this.si];
      if (this.bi >= sec.bars) { this.si++; this.bi = 0; if (this.si >= this.sections.length) this.newSong(); sec = this.sections[this.si]; }
      const st = this.st, L = this.layers(sec.layers), sfx = this.sfx, out = this.out, r = this.r;
      const s16 = this.s16, barLen = s16 * 16;
      this.tBar = t;
      const deg = sec.prog[this.bi % sec.prog.length];
      const ch = this.chordOf(deg);
      const sw = (i) => t + i * s16 + (i % 2 ? st.swing * s16 : 0);
      const fade = sec.name === 'fin' ? 1 - this.bi / sec.bars : sec.name === 'intro' ? 0.6 + 0.4 * this.bi / sec.bars : 1;
      // nappe
      if (L.pad) for (const n of ch.slice(0, 3)) sfx.inst(out, 'pad', n - 12 + (n - 12 < this.key - 7 ? 12 : 0), t, barLen * 0.98, 0.05 * fade * (L.soft ? 1.3 : 1), 0.6);
      // accompagnement (accords piqués, sur les contretemps)
      if (L.comp) {
        const pat = st.drums === 'drive' ? [0, 3, 6, 8, 11, 14] : [2, 6, 10, 14];
        const top = ch.length > 3 ? [ch[1], ch[3]] : [ch[1], ch[2]];
        for (const i of pat) for (const n of top) sfx.inst(out, st.comp, n, sw(i), s16 * 1.6, 0.055 * fade, 0.3);
      }
      // basse : fondamentale, quinte, note de passage vers l'accord suivant
      if (L.bass) {
        const root = ch[0] - 24 + (ch[0] - 24 < 34 ? 12 : 0), nextDeg = sec.prog[(this.bi + 1) % sec.prog.length];
        const nxt = this.chordOf(nextDeg)[0] - 24 + (this.chordOf(nextDeg)[0] - 24 < 34 ? 12 : 0);
        const line = st.drums === 'groove' ? [[0, root], [6, root + 7], [8, root + 12], [12, root + 7], [14, nxt + (nxt > root ? -1 : 1)]]
          : st.drums === 'drive' ? [[0, root], [4, root], [8, root + 7], [12, root], [14, root + 12]]
            : [[0, root], [8, root + 7], [12, root + (r() < 0.5 ? 12 : 4)]];
        for (const [i, n] of line) sfx.inst(out, st.bassInst, n, sw(i), s16 * 3, 0.16 * fade, 0);
      }
      // batterie feutrée (L.drums = 2 : l'action bat son plein, un peu plus de charleston — sauf 'drive', déjà plein)
      if (L.drums && st.drums) {
        const D = st.drums;
        for (let i = 0; i < 16; i++) {
          const tt = sw(i);
          if (D === 'drive') { if (i % 4 === 0) sfx.perc(out, 'kick', tt, 0.45); if (i === 4 || i === 12) sfx.perc(out, 'snare', tt, 0.22); if (i % 4 === 2) sfx.perc(out, 'shaker', tt, 0.07); }
          else if (D === 'groove') { if (i === 0 || i === 10) sfx.perc(out, 'kick', tt, 0.4); if (i === 4 || i === 12) sfx.perc(out, 'snare', tt, 0.16); if (i % 4 === 2) sfx.perc(out, 'shaker', tt, 0.06); }
          else if (D === 'brush') { if (i === 0 || i === 8) sfx.perc(out, 'kick', tt, 0.22); if (i % 4 === 2) sfx.perc(out, 'brush', tt, 0.05); }
          else if (D === 'light') { if (i === 0 || i === 8) sfx.perc(out, 'kick', tt, 0.32); if (i === 4 || i === 12) sfx.perc(out, 'snare', tt, 0.1); if (i % 4 === 2) sfx.perc(out, 'shaker', tt, 0.045); }
          else { if (i === 0 || i === 8) sfx.perc(out, 'kick', tt, 0.25); if (i % 4 === 2) sfx.perc(out, 'shaker', tt, 0.03); }
          if (L.drums > 1 && D !== 'drive' && i % 4 === 0 && i) sfx.perc(out, 'shaker', tt, 0.035);
        }
      }
      // mélodie
      if (L.lead && sec.motif === 'leit') this.leit(t, fade);
      else if (L.lead && sec.motif === 'dogs') this.dog(this.bi % 2 ? 'matcha' : 'ainu', t, deg, fade * (L.soft ? 0.85 : 1));
      else if (L.lead && sec.motif) {
        // le thème de la section, collé aux accords, avec variations
        const m = sec.motif, half = this.bi % 2, phrase = Math.floor(this.bi / 2) % 4;
        const rhythm = m.bars[half], steps = m.steps[half], lens = m.lens[half];
        let note = this.last;
        // en début de mesure : une note de l'accord, proche de la précédente
        const target = ch.map(n => { let x = n; while (x < this.key + 7) x += 12; while (x > this.key + 26) x -= 12; return x; });
        rhythm.forEach((pos, k) => {
          if (k === 0) note = target.reduce((a, b) => (Math.abs(b - note) < Math.abs(a - note) ? b : a));
          else note = this.scaleNear(note, steps[k] + (phrase === 3 && k === rhythm.length - 1 ? -1 : 0));
          if (note > this.key + 28) note -= 12; if (note < this.key + 5) note += 12;
          if (L.vary && r() < 0.25) note = this.scaleNear(note, r() < 0.5 ? 1 : -1);
          if (phrase === 3 && half === 1 && k === rhythm.length - 1) note = target[0];   // fin de phrase : on se pose
          const len = lens[k] * s16 * (phrase === 3 && half === 1 && k === rhythm.length - 1 ? 1.8 : 0.92);
          this.note(st.lead, note, sw(pos), len, (L.soft ? 0.09 : 0.12) * fade, 0.45);
        });
        this.last = note;
        this.sparkle(target, sw(14));
      }
      this.bi++;
      return t + barLen;
    }
    /** Petites cloches qui scintillent de temps en temps. */
    sparkle(notes, tt) {
      if (this.st.sparkle && this.rm() < 0.3) this.note('bell', notes[Math.floor(this.rm() * notes.length)] + 12, tt, this.s16 * 4, 0.035, 0.8);
    }
    /** Une mesure du leitmotiv, à la manière du lieu. */
    leit(t, fade) {
      const st = this.st, lt = st.leit, s16 = this.s16, i = this.bi % LEITMOTIV.length;
      const bar = lt.push ? pushBar(LEITMOTIV[i]) : LEITMOTIV[i];
      const base = this.key + (lt.oct || 0), at = (p) => t + p * s16 + (p % 4 === 2 ? (lt.swing8 || 0) * s16 : 0) + (p % 2 ? st.swing * s16 : 0);
      for (const [p, d, l] of bar) this.note(st.lead, base + this.deg(d), at(p), l * s16 * (i === 7 ? 1 : lt.legato || 0.92), 0.12 * fade, 0.45);
      this.last = base + this.deg(bar[bar.length - 1][1]);
      this.sparkle(this.chordOf(lt.prog[i]).map(n => n + (lt.oct || 0)), t + 14 * s16);
    }
    /** Le motif d'un chien, posé sur l'accord de degré « shift ». */
    dog(who, t, shift, fade) {
      const D = DOGS[who], base = D.low ? this.key - 12 : this.hi(), s16 = this.s16;
      for (const [p, d, l] of D.notes) this.note(D.inst, base + this.deg(d + shift), t + p * s16, l * s16 * D.legato, D.vol * fade, 0.5);
    }
  }
  Sfx.prototype.styles = STYLES;
  window.DogComposer = Composer;   // (pour les tests)

  window.DogSfx = Sfx;
})();
