'use strict';
// Mic capture for talk-to-the-cat: 16kHz mono PCM via ScriptProcessor, a
// speech/silence gate for auto-stop, and a plain-JS WAV encoder. Recording
// needs no window focus — the transparent cat window can capture unfocused.
(function (global) {
  let stream = null;
  let ac = null;
  let srcNode = null;
  let proc = null;
  let capTimer = null;
  let chunks = [];
  let speechSeen = false;
  let silentMs = 0;
  let active = false;

  async function start({ maxMs = 15000, silenceMs = 1200, onAutoStop = () => {} } = {}) {
    if (active) throw new Error('already recording');
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    ac = new AudioContext({ sampleRate: 16000 }); // Chromium resamples for us
    await ac.resume();
    srcNode = ac.createMediaStreamSource(stream);
    proc = ac.createScriptProcessor(4096, 1, 1); // 256ms blocks @ 16k
    chunks = [];
    speechSeen = false;
    silentMs = 0;
    active = true;
    proc.onaudioprocess = (e) => {
      const b = e.inputBuffer.getChannelData(0);
      chunks.push(new Float32Array(b));
      let sum = 0;
      for (let i = 0; i < b.length; i++) sum += b[i] * b[i];
      const rms = Math.sqrt(sum / b.length);
      const blockMs = (b.length / 16000) * 1000;
      if (rms > 0.015) {
        speechSeen = true;
        silentMs = 0;
      } else if (speechSeen && (silentMs += blockMs) >= silenceMs) {
        onAutoStop('silence');
      }
    };
    srcNode.connect(proc);
    proc.connect(ac.destination);
    capTimer = setTimeout(() => onAutoStop('cap'), maxMs);
  }

  function teardown() {
    clearTimeout(capTimer);
    capTimer = null;
    try { if (proc) { proc.disconnect(); proc.onaudioprocess = null; } } catch (e) { /* torn */ }
    try { if (srcNode) srcNode.disconnect(); } catch (e) { /* torn */ }
    try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch (e) { /* torn */ }
    try { if (ac) ac.close(); } catch (e) { /* torn */ }
    proc = null; srcNode = null; stream = null; ac = null;
    active = false;
  }

  function stop() {
    const collected = chunks;
    const sawSpeech = speechSeen;
    teardown();
    chunks = [];
    const n = collected.reduce((s, c) => s + c.length, 0);
    const f32 = new Float32Array(n);
    let off = 0;
    for (const c of collected) { f32.set(c, off); off += c.length; }
    return { wav: encodeWav(f32, 16000), durationS: n / 16000, speechSeen: sawSpeech };
  }

  function cancel() {
    teardown();
    chunks = [];
  }

  // 44-byte RIFF header + 16-bit little-endian PCM
  function encodeWav(f32, rate) {
    const n = f32.length;
    const buf = new ArrayBuffer(44 + n * 2);
    const v = new DataView(buf);
    const tag = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    tag(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); tag(8, 'WAVE');
    tag(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    tag(36, 'data'); v.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
      const s = Math.max(-1, Math.min(1, f32[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buf;
  }

  global.VoiceCapture = { start, stop, cancel, active: () => active };
})(window);
