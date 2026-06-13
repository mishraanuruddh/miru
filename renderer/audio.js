'use strict';
// Synthesized chiptune cat sounds — no audio assets needed.
(function (global) {
  let ctx = null;
  let master = null;
  let purrNodes = null;
  let volume = 0.5;
  let enabled = true;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function setVolume(v) { volume = v; if (master) master.gain.value = v; }
  function setEnabled(v) { enabled = v; if (!v) stopPurr(); }

  // one square-wave note with pitch glide and quick decay
  function note(freqA, freqB, t0, dur, vol = 0.25, type = 'square') {
    const c = ensure();
    const o = c.createOscillator();
    const g = c.createGain();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2400;
    o.type = type;
    o.frequency.setValueAtTime(freqA, c.currentTime + t0);
    o.frequency.exponentialRampToValueAtTime(Math.max(40, freqB), c.currentTime + t0 + dur);
    g.gain.setValueAtTime(0, c.currentTime + t0);
    g.gain.linearRampToValueAtTime(vol, c.currentTime + t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + t0 + dur);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(c.currentTime + t0);
    o.stop(c.currentTime + t0 + dur + 0.05);
  }

  function meow() {
    if (!enabled) return;
    ensure();
    // "me-" rising, "-ow" falling
    note(520, 880, 0, 0.18, 0.18);
    note(860, 420, 0.16, 0.3, 0.2);
  }

  function meowShort() {
    if (!enabled) return;
    ensure();
    note(620, 900, 0, 0.12, 0.16);
  }

  function tada() {
    if (!enabled) return;
    ensure();
    note(523, 523, 0, 0.09, 0.16);
    note(659, 659, 0.09, 0.09, 0.16);
    note(784, 784, 0.18, 0.16, 0.18);
    note(1046, 1046, 0.3, 0.22, 0.16);
  }

  function alert() {
    if (!enabled) return;
    ensure();
    note(880, 880, 0, 0.08, 0.15);
    note(880, 880, 0.14, 0.08, 0.15);
  }

  function pop() {
    if (!enabled) return;
    ensure();
    note(300, 720, 0, 0.07, 0.1, 'triangle');
  }

  function startPurr() {
    if (!enabled || purrNodes) return;
    const c = ensure();
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 42;
    const tremolo = c.createOscillator();
    tremolo.frequency.value = 24;
    const tremGain = c.createGain();
    tremGain.gain.value = 0.5;
    const g = c.createGain();
    g.gain.value = 0.0001;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 220;
    tremolo.connect(tremGain);
    tremGain.connect(g.gain);
    o.connect(f); f.connect(g); g.connect(master);
    o.start(); tremolo.start();
    g.gain.linearRampToValueAtTime(0.5, c.currentTime + 0.25);
    purrNodes = { o, tremolo, g };
  }

  function stopPurr() {
    if (!purrNodes || !ctx) return;
    const { o, tremolo, g } = purrNodes;
    purrNodes = null;
    try {
      g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      o.stop(ctx.currentTime + 0.3);
      tremolo.stop(ctx.currentTime + 0.3);
    } catch { /* already stopped */ }
  }

  const API = { meow, meowShort, tada, alert, pop, startPurr, stopPurr, setVolume, setEnabled };
  global.CatAudio = API;
})(window);
