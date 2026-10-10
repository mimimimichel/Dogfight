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
  }

  window.DogSfx = Sfx;
})();
