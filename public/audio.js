/*
 * Dogfight — effets sonores synthétisés avec WebAudio (aucun fichier externe).
 */
(function () {
  'use strict';

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
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.5;
        this.master.connect(this.ctx.destination);
        if (this.wantTheme) { const w = this.wantTheme; this.theme = undefined; this.music(w); }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    }

    toggleMute() {
      this.muted = !this.muted;
      try { localStorage.setItem('dogfight.muted', this.muted ? '1' : '0'); } catch (e) { /* ignore */ }
      if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
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
      g.connect(this.master);
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
      g.connect(this.master);
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
      o.connect(bp); o2.connect(g2); g2.connect(bp); bp.connect(g); g.connect(this.master);
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
      // réverbération (salle douce) : réponse impulsionnelle fabriquée une fois
      if (!this.reverbIR) {
        const len = Math.floor(c.sampleRate * 2.4), ir = c.createBuffer(2, len, c.sampleRate);
        for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let n = 0; n < len; n++) d[n] = (Math.random() * 2 - 1) * Math.pow(1 - n / len, 3.2); }
        this.reverbIR = ir;
      }
      const rev = c.createConvolver(); rev.buffer = this.reverbIR;
      const wet = c.createGain(); wet.gain.value = style.wet || 0.32;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
      rev.connect(wet); wet.connect(comp); comp.connect(bus);
      bus.connect(this.master);
      this.musicBus = bus;
      const out = { dry: comp, wet: rev };
      const comp0 = new Composer(this, out, style);
      let next = c.currentTime + 0.15;
      const tick = () => {
        if (!this.ctx || this.musicBus !== bus) return;
        while (next < this.ctx.currentTime + 0.6) next = comp0.bar(next);
      };
      tick();
      this.musicTimer = setInterval(tick, 150);
    }

    /** Une note d'instrument. inst : 'piano', 'mallet', 'flute', 'bass', 'pad', 'pluck', 'bell'. */
    inst(out, inst, midi, t, dur, vol, rev) {
      const c = this.ctx, f = 440 * Math.pow(2, (midi - 69) / 12);
      const g = c.createGain(), dest = c.createGain();
      dest.gain.value = 1;
      g.connect(dest); dest.connect(out.dry);
      if (rev) { const r = c.createGain(); r.gain.value = rev; dest.connect(r); r.connect(out.wet); }
      const osc = (type, freq, v, detune) => { const o = c.createOscillator(), og = c.createGain(); o.type = type; o.frequency.value = freq; if (detune) o.detune.value = detune; og.gain.value = v; o.connect(og); og.connect(g); o.start(t); o.stop(t + dur + 1.6); return o; };
      const env = (a, peak, dec, sus, rel) => {
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(peak, t + a);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sus), t + a + dec);
        g.gain.setValueAtTime(Math.max(0.0001, peak * sus), t + Math.max(a + dec, dur));
        g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(a + dec, dur) + rel);
      };
      if (inst === 'piano') {        // piano électrique doux
        osc('sine', f, 1); osc('sine', f * 2, 0.22); osc('triangle', f, 0.18, 4);
        env(0.006, vol, 0.9, 0.25, 0.5);
      } else if (inst === 'mallet') { // marimba
        osc('sine', f, 1); osc('sine', f * 4, 0.12);
        env(0.004, vol, 0.45, 0.05, 0.25);
      } else if (inst === 'bell') {   // petites cloches (scintillement)
        osc('sine', f, 1); osc('sine', f * 2.76, 0.25);
        env(0.003, vol, 1.2, 0.05, 0.6);
      } else if (inst === 'flute') {
        const o = osc('triangle', f, 1); osc('sine', f * 2, 0.08);
        const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 5; lg.gain.value = f * 0.006; lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 1);
        env(0.06, vol, 0.2, 0.75, 0.25);
      } else if (inst === 'bass') {
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
        g.disconnect(); g.connect(lp); lp.connect(dest);
        osc('triangle', f, 1); osc('sine', f, 0.6);
        env(0.01, vol, 0.5, 0.45, 0.18);
      } else if (inst === 'pluck') {  // guitare / pizzicato
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3200, t); lp.frequency.exponentialRampToValueAtTime(500, t + 0.4);
        g.disconnect(); g.connect(lp); lp.connect(dest);
        osc('sawtooth', f, 0.35); osc('triangle', f, 0.6);
        env(0.004, vol, 0.35, 0.08, 0.2);
      } else {                        // 'pad' : nappe chaude
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
        g.disconnect(); g.connect(lp); lp.connect(dest);
        osc('sawtooth', f, 0.35, -7); osc('sawtooth', f, 0.35, 7); osc('sine', f / 2, 0.3);
        env(Math.min(0.8, dur * 0.4), vol, 0.5, 0.8, 1.2);
      }
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
      if (kind === 'snare') { const r = c.createGain(); r.gain.value = 0.4; g.connect(r); r.connect(out.wet); }
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
    menu: { bpm: 84, keys: [65, 62, 67], mode: 'major', vol: 0.55, wet: 0.38, lead: 'piano', comp: 'piano', bassInst: 'bass', swing: 0.12, drums: 'soft', sevenths: true,
      progs: [[0, 5, 3, 4], [0, 2, 5, 3], [3, 4, 2, 5], [0, 4, 5, 3]] },
    adv1: { bpm: 100, keys: [60, 62, 65], mode: 'major', vol: 0.52, wet: 0.3, lead: 'mallet', comp: 'pluck', bassInst: 'bass', swing: 0.1, drums: 'light', sevenths: false, sparkle: true,
      progs: [[0, 4, 5, 3], [0, 3, 4, 4], [5, 3, 0, 4], [0, 5, 1, 4]] },
    adv2: { bpm: 86, keys: [62, 57, 64], mode: 'dorian', vol: 0.55, wet: 0.45, lead: 'flute', comp: 'pluck', bassInst: 'bass', swing: 0, drums: 'brush', sevenths: true, sparkle: true,
      progs: [[0, 3, 0, 6], [0, 6, 3, 4], [3, 0, 6, 0], [0, 2, 3, 6]] },
    adv3: { bpm: 96, keys: [58, 63, 60], mode: 'major', vol: 0.52, wet: 0.3, lead: 'piano', comp: 'piano', bassInst: 'bass', swing: 0.18, drums: 'groove', sevenths: true,
      progs: [[1, 4, 0, 5], [0, 5, 1, 4], [3, 2, 1, 4], [0, 3, 2, 5]] },
    fight: { bpm: 138, keys: [57, 64, 62], mode: 'minor', vol: 0.47, wet: 0.2, lead: 'mallet', comp: 'pluck', bassInst: 'bass', swing: 0, drums: 'drive', sevenths: false,
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
      if (L.pad) for (const n of ch) sfx.inst(out, 'pad', n - 12 + (n - 12 < this.key - 7 ? 12 : 0), t, barLen * 0.98, 0.05 * fade * (L.soft ? 1.3 : 1), 0.6);
      // accompagnement (accords piqués, sur les contretemps)
      if (L.comp) {
        const pat = st.drums === 'drive' ? [0, 3, 6, 8, 11, 14] : [2, 6, 10, 14];
        for (const i of pat) for (const n of ch.slice(0, 3)) sfx.inst(out, st.comp, n, sw(i), s16 * 1.6, 0.045 * fade, 0.35);
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
          if (D === 'drive') { if (i % 4 === 0) sfx.perc(out, 'kick', tt, 0.45); if (i === 4 || i === 12) sfx.perc(out, 'snare', tt, 0.22); if (i % 2 === 0) sfx.perc(out, 'shaker', tt, 0.06); }
          else if (D === 'groove') { if (i === 0 || i === 10) sfx.perc(out, 'kick', tt, 0.4); if (i === 4 || i === 12) sfx.perc(out, 'snare', tt, 0.16); if (i % 2 === 0) sfx.perc(out, 'shaker', tt, 0.05); }
          else if (D === 'brush') { if (i === 0 || i === 8) sfx.perc(out, 'kick', tt, 0.22); if (i % 4 === 2) sfx.perc(out, 'brush', tt, 0.05); }
          else if (D === 'light') { if (i === 0 || i === 8) sfx.perc(out, 'kick', tt, 0.32); if (i === 4 || i === 12) sfx.perc(out, 'snare', tt, 0.1); if (i % 2 === 0) sfx.perc(out, 'shaker', tt, 0.035); }
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
