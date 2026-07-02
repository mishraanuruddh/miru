'use strict';
// WAV → text. Primary: MurmurCLI (the user's local transcription pipeline,
// parakeet on ANE, ~0.5s). Fallback: the vendored whisper-cli + its models.
// Never the Murmur *app* — it pastes at the cursor and returns no data.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const WHISPER_BIN = path.join(os.homedir(),
  'projects/your-transcription-cli/third_party/whisper.cpp/build/bin/whisper-cli');
const WHISPER_MODEL = path.join(os.homedir(),
  'Library/Application Support/Murmur/models/ggml-large-v3-turbo-q5_0.bin');

function expandHome(p) {
  return String(p || '').replace(/^~/, os.homedir());
}

function availability(cfg = {}) {
  return {
    murmur: !!cfg.murmurCli && fs.existsSync(expandHome(cfg.murmurCli)),
    whisper: fs.existsSync(WHISPER_BIN) && fs.existsSync(WHISPER_MODEL),
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

function runWhisper(wavPath) {
  return new Promise((resolve) => {
    execFile(WHISPER_BIN, ['-m', WHISPER_MODEL, '-f', wavPath, '-nt', '-np'],
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
      const r = await runWhisper(wavPath);
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
