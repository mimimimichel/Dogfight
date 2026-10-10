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
    // Musique de fond : petits morceaux synthétisés, joués en boucle
    // -----------------------------------------------------------------------
    /** Choisit le morceau ('menu', 'adventure', 'fight' ou null pour couper). */
    music(theme) {
      this.wantTheme = theme;
      if (!this.ctx) return; // démarrera au premier contact (unlock)
      if (this.theme === theme) return;
      this.theme = theme;
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
      if (this.musicBus) {
        const old = this.musicBus, t = this.ctx.currentTime;
        old.gain.setTargetAtTime(0.0001, t, 0.15);
        setTimeout(() => old.disconnect(), 800);
        this.musicBus = null;
      }
      const song = theme && SONGS[theme];
      if (!song) return;
      const bus = this.ctx.createGain();
      bus.gain.value = 0.0001; bus.gain.setTargetAtTime(song.vol, this.ctx.currentTime, 0.4);
      bus.connect(this.master);
      this.musicBus = bus;
      const step = 60 / song.bpm / 2; // croches
      let i = 0, next = this.ctx.currentTime + 0.1;
      const total = song.steps;
      const tick = () => {
        if (!this.ctx) return;
        while (next < this.ctx.currentTime + 0.25) {
          song.play(this, bus, i % total, next, step);
          i++; next += step;
        }
      };
      tick();
      this.musicTimer = setInterval(tick, 60);
    }

    note(bus, freq, t, dur, type, vol, opts) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (opts && opts.detune) o.detune.value = opts.detune;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + (opts && opts.attack || 0.01));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let out = g;
      if (opts && opts.lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; g.connect(f); out = f; }
      o.connect(g); out.connect(bus);
      o.start(t); o.stop(t + dur + 0.02);
    }
    drum(bus, kind, t) {
      const c = this.ctx;
      if (kind === 'k') { // grosse caisse douce
        const o = c.createOscillator(), g = c.createGain();
        o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.2);
        return;
      }
      if (!this.hatBuf) {
        const len = Math.floor(c.sampleRate * 0.08), b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        this.hatBuf = b;
      }
      const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      src.buffer = this.hatBuf; f.type = kind === 's' ? 'bandpass' : 'highpass'; f.frequency.value = kind === 's' ? 1800 : 7000;
      g.gain.value = kind === 's' ? 0.28 : 0.09;
      src.connect(f); f.connect(g); g.connect(bus); src.start(t);
    }
  }

  // ---------------------------------------------------------------------------
  // Partitions (notes MIDI ; 0 = silence), en croches
  // ---------------------------------------------------------------------------
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function makeSong(o) {
    // o.chords : [fondamentale MIDI, tierce, quinte] par mesure (8 croches)
    return {
      bpm: o.bpm, vol: o.vol, steps: o.chords.length * 8,
      play(sfx, bus, i, t, step) {
        const bar = Math.floor(i / 8), b = i % 8, ch = o.chords[bar];
        // basse : fondamentale sur 1 et 5, quinte sur la 7e croche
        if (b === 0 || b === 4) sfx.note(bus, hz(ch[0] - 12), t, step * 1.8, 'triangle', 0.32);
        if (b === 6) sfx.note(bus, hz(ch[2] - 12), t, step * 0.9, 'triangle', 0.22);
        // accords arpégés, doux
        if (o.arp) { const n = ch[[0, 1, 2, 1][b % 4]] + 12; sfx.note(bus, hz(n), t, step * 0.9, 'square', 0.035, { lp: 1800 }); }
        else if (b === 2 || b === 6) ch.forEach((n) => sfx.note(bus, hz(n + 12), t, step * 0.7, 'square', 0.03, { lp: 1600 }));
        // mélodie
        const m = o.melody[i % o.melody.length];
        if (m) {
          let len = 1; while (o.melody[(i + len) % o.melody.length] === -1 && len < 8) len++;
          if (m > 0) {
            sfx.note(bus, hz(m), t, step * len * 0.95, o.lead || 'triangle', 0.17, { attack: 0.015 });
            sfx.note(bus, hz(m + 12), t, step * len * 0.6, 'sine', 0.05, { detune: 6 });
          }
        }
        // percussions
        if (o.drums) {
          const d = o.drums[b];
          if (d === 'k' || d === 'K') sfx.drum(bus, 'k', t);
          if (d === 's') sfx.drum(bus, 's', t);
          if (d !== 's') sfx.drum(bus, 'h', t);
        }
      },
    };
  }
  const C = [60, 64, 67], Am = [57, 60, 64], F = [53, 57, 60], G = [55, 59, 62], Em = [52, 55, 59], Dm = [50, 53, 57];
  const _ = 0, H = -1; // silence ; « tenue » (prolonge la note précédente)
  const SONGS = {
    // Accueil : guilleret, tranquille
    menu: makeSong({
      bpm: 104, vol: 0.5, arp: true, drums: ['k', _, 'h', _, 's', _, 'h', _],
      chords: [C, Am, F, G, C, Am, Dm, G],
      melody: [
        72, H, 76, H, 79, H, 76, 74, 72, H, 69, H, 72, H, _, _,
        69, H, 72, H, 77, H, 76, 74, 74, H, H, H, _, _, 71, 74,
        72, H, 76, H, 79, H, 81, 79, 76, H, 72, H, 76, 79, _, _,
        77, H, 76, 74, 72, H, 74, H, 71, H, H, H, _, _, _, _,
      ],
    }),
    // Aventure : sautillant, façon jeu de plates-formes
    adventure: makeSong({
      bpm: 132, vol: 0.45, lead: 'square', drums: ['k', 'h', 's', 'h', 'k', 'k', 's', 'h'],
      chords: [C, G, Am, F, C, G, F, G],
      melody: [
        76, 79, 84, H, 83, 79, 76, H, 74, 77, 83, H, 81, 79, 74, H,
        72, 76, 81, H, 79, 76, 72, H, 77, H, 76, H, 74, H, 72, H,
        76, 79, 84, H, 86, 84, 83, 79, 74, 77, 83, H, 81, 83, 86, H,
        84, H, 81, H, 77, 79, 81, H, 79, H, H, H, _, _, _, _,
      ],
    }),
    // Combat : plus nerveux
    fight: makeSong({
      bpm: 150, vol: 0.4, lead: 'square', arp: true, drums: ['k', 'h', 's', 'k', 'k', 'h', 's', 'h'],
      chords: [Am, F, C, G, Am, F, G, Em],
      melody: [
        69, H, 72, 69, 76, H, 74, 72, 72, H, 69, H, 65, H, _, 69,
        72, H, 76, 72, 79, H, 77, 76, 74, H, 71, H, 67, H, _, _,
        69, H, 72, 69, 76, H, 79, 81, 77, H, 76, H, 74, H, 72, 74,
        76, H, 74, H, 71, H, 72, H, 71, H, H, H, _, _, _, _,
      ],
    }),
  };
  Sfx.prototype.songs = SONGS;

  window.DogSfx = Sfx;
})();
