'use strict';
// Wires Codex CLI's `notify` hook (~/.codex/config.toml) to the cat.
// Codex appends the event JSON as the final argv; our sh shim posts it on.
// Note: Codex's external notify only fires on agent-turn-complete (done).
const fs = require('fs');
const os = require('os');
const path = require('path');

const CONFIG_PATH = path.join(os.homedir(), '.codex', 'config.toml');
const MARKER = 'pixelpaw';

function curlPart(port) {
  // $PPID inside the shim = the codex process that fired the notify -> report
  // WHICH codex every event came from (CLI tty, headless exec, desktop app)
  return (
    `TTY=$(ps -o tty= -p $PPID 2>/dev/null | tr -d ' '); ` +
    `CMD=$(ps -o command= -p $PPID 2>/dev/null | cut -c1-160); ` +
    `curl -s -m 2 -X POST "http://127.0.0.1:${port}/hook/codex/notify?tty=$TTY&pid=$PPID" ` +
    `-H "X-Codex-Cmd: $CMD" ` +
    `-H 'Content-Type: application/json' --data-binary "$1" >/dev/null 2>&1 || true`
  );
}

function notifyLine(port) {
  return `notify = ["sh", "-c", ${JSON.stringify(curlPart(port))}, "${MARKER}"]`;
}

function read() {
  try { return fs.readFileSync(CONFIG_PATH, 'utf8'); } catch { return null; }
}

function findNotify(text) {
  if (text == null) return { exists: false };
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^notify\s*=/.test(t)) {
      return { exists: true, index: i, ours: t.includes(MARKER), line: t };
    }
  }
  return { exists: false };
}

function status(port) {
  const text = read();
  const n = findNotify(text);
  return {
    configPath: CONFIG_PATH,
    configExists: text != null,
    installed: n.exists && n.ours && (text || '').includes(`127.0.0.1:${port}/`),
    foreignNotify: n.exists && !n.ours,
    stalePort: n.exists && n.ours && !(text || '').includes(`127.0.0.1:${port}/`),
  };
}

function install(port) {
  const text = read();
  const line = notifyLine(port);
  if (text == null) {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, line + '\n');
    return status(port);
  }
  const n = findNotify(text);
  if (n.exists && !n.ours) {
    // don't clobber a user-defined notify hook
    return { ...status(port), error: 'A custom notify hook already exists in config.toml — merge manually.' };
  }
  fs.copyFileSync(CONFIG_PATH, CONFIG_PATH + '.pixelpaw-backup');
  const lines = text.split('\n');
  if (n.exists) {
    lines[n.index] = line;
  } else {
    // root keys must appear before any [table] section
    lines.unshift(line);
  }
  fs.writeFileSync(CONFIG_PATH, lines.join('\n'));
  return status(port);
}

function uninstall(port) {
  const text = read();
  if (text == null) return status(port);
  const n = findNotify(text);
  if (n.exists && n.ours) {
    const lines = text.split('\n');
    lines.splice(n.index, 1);
    fs.writeFileSync(CONFIG_PATH, lines.join('\n'));
  }
  return status(port);
}

module.exports = { status, install, uninstall, curlPart, CONFIG_PATH };
