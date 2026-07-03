'use strict';
// Installs/uninstalls Miru hooks into ~/.claude/settings.json.
// v2 hooks forward the full hook JSON (stdin) to the cat and capture the
// session's tty so the cat can focus the exact terminal tab later.
const fs = require('fs');
const os = require('os');
const path = require('path');

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');

function cmd(port, route) {
  // tty: try our own shell first; hook shells can be detached, so fall back
  // to the parent (the claude process), which owns the terminal
  return (
    `TTY=$(ps -o tty= -p $$ 2>/dev/null | tr -d ' '); ` +
    `case "$TTY" in tty*) ;; *) TTY=$(ps -o tty= -p $PPID 2>/dev/null | tr -d ' ');; esac; ` +
    `curl -s -m 2 -X POST "http://127.0.0.1:${port}/hook/claude/${route}?tty=$TTY" ` +
    `-H "Content-Type: application/json" --data-binary @- >/dev/null 2>&1 || true`
  );
}

// event -> { route, matcher? }
const HOOKS = {
  UserPromptSubmit: { route: 'prompt' },
  Stop: { route: 'stop' },
  Notification: { route: 'notification' },
  SessionEnd: { route: 'end' },
  PreToolUse: { route: 'ask', matcher: 'AskUserQuestion' },
  PostToolUse: { route: 'ask-done', matcher: 'AskUserQuestion' },
};

function isOurs(c) {
  return typeof c === 'string' &&
    (/127\.0\.0\.1:\d+\/hook\/claude\//.test(c) ||
     (/127\.0\.0\.1:\d+\/agent/.test(c) && c.includes('"agent":"claude-code"'))); // legacy v1
}

function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')); } catch { return {}; }
}

function status(port) {
  const s = readSettings();
  const hooks = s.hooks || {};
  let v2 = 0, legacy = 0, stalePort = false;
  for (const groups of Object.values(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const g of groups) {
      for (const h of g.hooks || []) {
        if (!isOurs(h.command)) continue;
        if (h.command.includes('/hook/claude/')) {
          v2++;
          if (!h.command.includes(`127.0.0.1:${port}/`)) stalePort = true;
        } else legacy++;
      }
    }
  }
  return {
    settingsPath: SETTINGS_PATH,
    installed: v2 >= Object.keys(HOOKS).length && !stalePort && legacy === 0,
    partial: v2 > 0 || legacy > 0,
    legacy: legacy > 0,
    stalePort,
  };
}

function stripOurs(s) {
  if (!s.hooks) return s;
  for (const event of Object.keys(s.hooks)) {
    if (!Array.isArray(s.hooks[event])) continue;
    s.hooks[event] = s.hooks[event]
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h.command)) }))
      .filter((g) => (g.hooks || []).length > 0);
    if (s.hooks[event].length === 0) delete s.hooks[event];
  }
  return s;
}

function install(port) {
  let s = readSettings();
  s = stripOurs(s);
  if (!s.hooks) s.hooks = {};
  for (const [event, def] of Object.entries(HOOKS)) {
    const groups = Array.isArray(s.hooks[event]) ? s.hooks[event] : [];
    const group = { hooks: [{ type: 'command', command: cmd(port, def.route) }] };
    if (def.matcher) group.matcher = def.matcher;
    groups.push(group);
    s.hooks[event] = groups;
  }
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  if (fs.existsSync(SETTINGS_PATH)) {
    fs.copyFileSync(SETTINGS_PATH, SETTINGS_PATH + '.miru-backup');
  }
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2));
  return status(port);
}

function uninstall(port) {
  const s = stripOurs(readSettings());
  if (fs.existsSync(SETTINGS_PATH)) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(s, null, 2));
  }
  return status(port);
}

function snippet(port) {
  const hooks = {};
  for (const [event, def] of Object.entries(HOOKS)) {
    const group = { hooks: [{ type: 'command', command: cmd(port, def.route) }] };
    if (def.matcher) group.matcher = def.matcher;
    hooks[event] = [group];
  }
  return JSON.stringify({ hooks }, null, 2);
}

module.exports = { status, install, uninstall, snippet, SETTINGS_PATH };
