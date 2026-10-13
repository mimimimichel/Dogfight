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
      o.type = opts.type || 'square';
      o.frequency.setValueAtTime(freq, t);
      if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
      const v = opts.vol || 0.2;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(this.fx || this.master);
      o.start(t);
      o.stop(t + dur + 0.02);
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

    hit(heavy) {
      this.noise(heavy ? 0.16 : 0.08, { freq: heavy ? 900 : 1800, vol: heavy ? 0.5 : 0.35 });
      this.tone(heavy ? 140 : 220, heavy ? 0.18 : 0.1, { type: 'sine', to: heavy ? 50 : 90, vol: heavy ? 0.5 : 0.3 });
    }

    block() {
      this.tone(1100, 0.05, { type: 'square', vol: 0.12, to: 700 });
      this.noise(0.05, { filter: 'highpass', freq: 3000, vol: 0.15 });
    }

    thud() { this.noise(0.25, { freq: 300, vol: 0.45 }); this.tone(70, 0.2, { type: 'sine', to: 40, vol: 0.4 }); }

    swing(heavy) { this.noise(heavy ? 0.14 : 0.08, { filter: 'bandpass', freq: heavy ? 900 : 1600, freqTo: heavy ? 300 : 800, vol: 0.18 }); }

    jump() { this.tone(260, 0.1, { type: 'triangle', to: 520, vol: 0.1 }); }

    bark(charId) {
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
      [0, 4, 7, 12].forEach((s, i) => this.tone(base * Math.pow(2, s / 12), 0.15, { type: 'square', vol: 0.12, delay: i * 0.06 }));
      if (charId === 'ainu') this.tone(300, 1.1, { type: 'sawtooth', to: 620, vol: 0.18, delay: 0.3 });
      else this.noise(0.6, { filter: 'bandpass', freq: 1200, freqTo: 4000, vol: 0.2, delay: 0.25 });
    }

    ko() {
      this.tone(600, 0.9, { type: 'square', to: 60, vol: 0.25 });
      this.noise(0.5, { freq: 500, vol: 0.4 });
    }

    announce(kind) {
      if (kind === 'round') { this.tone(440, 0.12, { vol: 0.15 }); this.tone(660, 0.18, { vol: 0.15, delay: 0.12 }); }
      else if (kind === 'fight') { [523, 659, 784].forEach((f) => this.tone(f, 0.3, { vol: 0.12, type: 'square' })); }
      else if (kind === 'time') { this.tone(700, 0.2, { vol: 0.15 }); this.tone(500, 0.3, { vol: 0.15, delay: 0.2 }); }
    }

    win() {
      [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.18, { vol: 0.13, type: 'square', delay: i * 0.13 }));
    }

    click() { this.tone(880, 0.04, { type: 'square', vol: 0.08 }); }

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
        const src = this.noiseLoop(), hi = filt('bandpass', 1500, 0.6), lo = filt('lowpass', 420), gh = c.createGain(), gl = c.createGain();
        gh.gain.value = 0.7; gl.gain.value = 0.5;
        src.connect(hi); hi.connect(gh); gh.connect(g); src.connect(lo); lo.connect(gl); gl.connect(g);
        this.lfo(0.37, 380, hi.frequency); this.lfo(5.3, 0.18, gh.gain);
        a.base = 0.32;
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
      const c = this.ctx, t = c.currentTime, k = pitch || (0.9 + Math.random() * 0.3), dur = 0.55;
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
    // Musique de fond : un petit compositeur écrit des morceaux toujours
    // nouveaux (intro, couplets, refrain, pont…), joués par des instruments doux
    // avec de la réverbération. Une ambiance par lieu.
    // -----------------------------------------------------------------------
    get musicOn() { try { return localStorage.getItem('dogfight.music') !== '0'; } catch (e) { return true; } }
    setMusic(on) {
      try { localStorage.setItem('dogfight.music', on ? '1' : '0'); } catch (e) { /* ignore */ }
      if (this.musicBus && this.ctx) this.musicBus.gain.setTargetAtTime(on ? (this.musicVol || 0.5) : 0.0001, this.ctx.currentTime, 0.3);
      return on;
    }
    /** Choisit l'ambiance ('menu', 'adventure', 'adv1', 'adv2', 'adv3', 'fight' ou null pour couper). */
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

    music(theme) {
      if (theme === 'adventure' && this.theme && /^adv\d/.test(this.theme)) return;   // l'ambiance du niveau est déjà là
      this.wantTheme = theme;
      if (!this.ctx) return; // démarrera au premier contact (unlock)
      if (this.theme === theme) return;
      this.theme = theme;
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
      const comp0 = new Composer(this, out, style);
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

    /** Une note d'instrument (1 à 2 oscillateurs). inst : 'piano', 'mallet', 'flute', 'bass', 'pad', 'pluck', 'bell'. */
    inst(out, inst, midi, t, dur, vol, rev) {
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
        osc('triangle', f, 1); osc('square', f, 0.12);
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
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], minor: [0, 2, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11] };
  /**
   * Ambiances. progs : enchaînements de degrés (0 = I). Les morceaux durent
   * 1 min 30 à 2 min 30 puis un nouveau est composé (autre tonalité, autres thèmes).
   */
  const STYLES = {
    menu: { bpm: 84, keys: [65, 62, 67], mode: 'major', vol: 0.44, wet: 0.38, lead: 'piano', comp: 'piano', bassInst: 'bass', swing: 0.12, drums: 'soft', sevenths: true,
      progs: [[0, 5, 3, 4], [0, 2, 5, 3], [3, 4, 2, 5], [0, 4, 5, 3]] },
    adv1: { bpm: 100, keys: [60, 62, 65], mode: 'major', vol: 0.42, wet: 0.3, lead: 'mallet', comp: 'pluck', bassInst: 'bass', swing: 0.1, drums: 'light', sevenths: false, sparkle: true,
      progs: [[0, 4, 5, 3], [0, 3, 4, 4], [5, 3, 0, 4], [0, 5, 1, 4]] },
    adv2: { bpm: 86, keys: [62, 57, 64], mode: 'dorian', vol: 0.44, wet: 0.45, lead: 'flute', comp: 'pluck', bassInst: 'bass', swing: 0, drums: 'brush', sevenths: true, sparkle: true,
      progs: [[0, 3, 0, 6], [0, 6, 3, 4], [3, 0, 6, 0], [0, 2, 3, 6]] },
    adv3: { bpm: 96, keys: [58, 63, 60], mode: 'major', vol: 0.42, wet: 0.3, lead: 'piano', comp: 'piano', bassInst: 'bass', swing: 0.18, drums: 'groove', sevenths: true,
      progs: [[1, 4, 0, 5], [0, 5, 1, 4], [3, 2, 1, 4], [0, 3, 2, 5]] },
    boss: { bpm: 138, keys: [57, 55, 60], mode: 'minor', vol: 0.44, wet: 0.25, lead: 'mallet', comp: 'piano', bassInst: 'bass', swing: 0, drums: 'drive', sevenths: false,
      progs: [[0, 5, 3, 4], [0, 3, 4, 4], [5, 3, 0, 4], [0, 6, 5, 4]] },
    adv4: { bpm: 92, keys: [64, 62, 67], mode: 'lydian', vol: 0.42, wet: 0.5, lead: 'flute', comp: 'pluck', bassInst: 'bass', swing: 0.08, drums: 'light', sevenths: true, sparkle: true,
      progs: [[0, 1, 4, 0], [0, 3, 1, 4], [5, 1, 0, 4], [0, 1, 5, 3]] },
    fight: { bpm: 138, keys: [57, 64, 62], mode: 'minor', vol: 0.38, wet: 0.2, lead: 'mallet', comp: 'pluck', bassInst: 'bass', swing: 0, drums: 'drive', sevenths: false,
      progs: [[0, 5, 2, 6], [0, 3, 6, 4], [5, 6, 0, 0], [0, 6, 5, 6]] },
  };
  function rng(seed) { let x = seed >>> 0 || 1; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296); }

  class Composer {
    constructor(sfx, out, style) {
      this.sfx = sfx; this.out = out; this.st = style;
      this.seed = Math.floor(Math.random() * 1e9);
      this.newSong();
    }
    newSong() {
      const st = this.st, r = this.r = rng(this.seed++);
      this.key = st.keys[Math.floor(r() * st.keys.length)];
      this.scale = SCALES[st.mode];
      const pick = () => st.progs[Math.floor(r() * st.progs.length)];
      const A = pick(), B = pick(), C = pick();
      // une phrase = 4 accords (1 par mesure) ; un thème mélodique par section, répété avec variations
      const ma = this.motif(), mb = this.motif(), mc = this.motif();
      const S = (name, prog, motif, bars, layers) => ({ name, prog, motif, bars, layers });
      this.sections = [
        S('intro', A, null, 4, { pad: 1, comp: 0, bass: 0, drums: 0, lead: 0 }),
        S('A', A, ma, 8, { pad: 1, comp: 1, bass: 1, drums: 0, lead: 1 }),
        S('B', B, mb, 8, { pad: 1, comp: 1, bass: 1, drums: 1, lead: 1 }),
        S('A2', A, ma, 8, { pad: 0, comp: 1, bass: 1, drums: 1, lead: 1, vary: 1 }),
        S('pont', C, mc, 8, { pad: 1, comp: 0, bass: 1, drums: 0, lead: 1, soft: 1 }),
        S('B2', B, mb, 8, { pad: 1, comp: 1, bass: 1, drums: 1, lead: 1, vary: 1, up: 1 }),
        S('fin', A, null, 4, { pad: 1, comp: 1, bass: 1, drums: 0, lead: 0 }),
      ];
      this.si = 0; this.bi = 0; this.last = this.key + 12;
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
    chordOf(deg) {
      const sc = this.scale, n = (d) => this.key + sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
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
    /** Écrit et programme une mesure à partir de t ; renvoie le début de la mesure suivante. */
    bar(t) {
      let sec = this.sections[this.si];
      if (this.bi >= sec.bars) { this.si++; this.bi = 0; if (this.si >= this.sections.length) this.newSong(); sec = this.sections[this.si]; }
      const st = this.st, L = sec.layers, sfx = this.sfx, out = this.out, r = this.r;
      const s16 = 60 / st.bpm / 4, barLen = s16 * 16;
      const deg = sec.prog[this.bi % sec.prog.length] + (L.up && this.bi >= 4 ? 0 : 0);
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
      // batterie feutrée
      if (L.drums && st.drums) {
        const D = st.drums;
        for (let i = 0; i < 16; i++) {
          const tt = sw(i);
          if (D === 'drive') { if (i % 4 === 0) sfx.perc(out, 'kick', tt, 0.45); if (i === 4 || i === 12) sfx.perc(out, 'snare', tt, 0.22); if (i % 4 === 2) sfx.perc(out, 'shaker', tt, 0.07); }
          else if (D === 'groove') { if (i === 0 || i === 10) sfx.perc(out, 'kick', tt, 0.4); if (i === 4 || i === 12) sfx.perc(out, 'snare', tt, 0.16); if (i % 4 === 2) sfx.perc(out, 'shaker', tt, 0.06); }
          else if (D === 'brush') { if (i === 0 || i === 8) sfx.perc(out, 'kick', tt, 0.22); if (i % 4 === 2) sfx.perc(out, 'brush', tt, 0.05); }
          else if (D === 'light') { if (i === 0 || i === 8) sfx.perc(out, 'kick', tt, 0.32); if (i === 4 || i === 12) sfx.perc(out, 'snare', tt, 0.1); if (i % 4 === 2) sfx.perc(out, 'shaker', tt, 0.045); }
          else { if (i === 0 || i === 8) sfx.perc(out, 'kick', tt, 0.25); if (i % 4 === 2) sfx.perc(out, 'shaker', tt, 0.03); }
        }
      }
      // mélodie : le thème de la section, collé aux accords, avec variations
      if (L.lead && sec.motif) {
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
          sfx.inst(out, st.lead, note + (L.up ? 0 : 0), sw(pos), len, (L.soft ? 0.09 : 0.12) * fade, 0.45);
        });
        this.last = note;
        // petites cloches qui scintillent de temps en temps
        if (st.sparkle && r() < 0.3) sfx.inst(out, 'bell', target[Math.floor(r() * target.length)] + 12, sw(14), s16 * 4, 0.035, 0.8);
      }
      this.bi++;
      return t + barLen;
    }
  }
  Sfx.prototype.styles = STYLES;
  window.DogComposer = Composer;   // (pour les tests)

  window.DogSfx = Sfx;
})();
