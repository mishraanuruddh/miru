'use strict';
// WAV → text through a local CLI: nothing ever leaves the machine.
// Primary: any Murmur-style CLI configured in settings (voice.murmurCli).
// Fallback: whisper.cpp's `whisper-cli` (configured, on PATH, or in the
// usual homebrew spots) with a configured ggml model.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function expandHome(p) {
  return String(p || '').replace(/^~/, os.homedir());
}

function firstExisting(candidates) {
  for (const p of candidates) {
    if (!p) continue;
    try { if (fs.existsSync(p)) return p; } catch (e) { /* unreadable */ }
  }
  return null;
}

function whisperBin(cfg = {}) {
  return firstExisting([
    expandHome(cfg.whisperBin),
    ...(process.env.PATH || '').split(path.delimiter).filter(Boolean)
      .map((dir) => path.join(dir, 'whisper-cli')),
    '/opt/homebrew/bin/whisper-cli',
    '/usr/local/bin/whisper-cli',
  ]);
}

function whisperModel(cfg = {}) {
  return firstExisting([expandHome(cfg.whisperModel)]);
}

function availability(cfg = {}) {
  return {
    murmur: !!cfg.murmurCli && fs.existsSync(expandHome(cfg.murmurCli)),
    whisper: !!whisperBin(cfg) && !!whisperModel(cfg),
  };
}

function runMurmur(cli, engine, wavPath) {
  return new Promise((resolve) => {
    execFile(cli, ['transcribe', '--engine', engine, '--json', wavPath],
      { timeout: 30000, maxBuffer: 1 << 20 }, (err, stdout) => {
        if (err) return resolve({ ok: false, error: String(err.message || err) });
        // one JSON record per input file; take the last parseable line
        const lines = String(stdout).trim().split('\n').reverse();
        for (const line of lines) {
          try {
            const j = JSON.parse(line);
            const text = String(j.text || '').trim();
            return resolve({ ok: true, text, noSpeech: !!j.no_speech || !text, engine: 'murmur' });
          } catch (e) { /* keep scanning */ }
        }
        resolve({ ok: false, error: 'unparseable murmur output' });
      });
  });
}

function runWhisper(bin, model, wavPath) {
  return new Promise((resolve) => {
    execFile(bin, ['-m', model, '-f', wavPath, '-nt', '-np'],
      { timeout: 60000, maxBuffer: 1 << 22 }, (err, stdout) => {
        if (err) return resolve({ ok: false, error: String(err.message || err) });
        const text = String(stdout).split('\n')
          .map((l) => l.replace(/\[[^\]]*\]/g, '').trim())
          .filter(Boolean).join(' ').trim();
        resolve({ ok: true, text, noSpeech: !text, engine: 'whisper' });
      });
  });
}

async function transcribe(wavBuffer, cfg = {}) {
  const wavPath = path.join(os.tmpdir(),
    'pixelpaw-voice-' + Date.now() + '-' + Math.floor(Math.random() * 9999) + '.wav');
  try {
    fs.writeFileSync(wavPath, wavBuffer);
    const avail = availability(cfg);
    if (avail.murmur) {
      const r = await runMurmur(expandHome(cfg.murmurCli), cfg.engine || 'parakeet-v2', wavPath);
      if (r.ok) return r;
    }
    if (avail.whisper) {
      const r = await runWhisper(whisperBin(cfg), whisperModel(cfg), wavPath);
      if (r.ok) return r;
    }
    return { ok: false, error: 'no transcriber available' };
  } finally {
    try { fs.unlinkSync(wavPath); } catch (e) { /* already gone */ }
  }
}

// best-effort sweep of stale recordings (crashes, kills)
function cleanupStale() {
  try {
    const dir = os.tmpdir();
    for (const f of fs.readdirSync(dir)) {
      if (!/^pixelpaw-voice-.*\.wav$/.test(f)) continue;
      const p = path.join(dir, f);
      try {
        if (Date.now() - fs.statSync(p).mtimeMs > 3600000) fs.unlinkSync(p);
      } catch (e) { /* racing */ }
    }
  } catch (e) { /* tmpdir unreadable */ }
}

module.exports = { transcribe, availability, cleanupStale };
