'use strict';
// Locate the Terminal.app / iTerm2 tab hosting a given tty, bring it to the
// front, and optionally type an answer keystroke. Never launches apps.
const { execFile } = require('child_process');

function osa(script) {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: 5000 }, (err, stdout, stderr) => {
      if (err) resolve({ ok: false, out: String(stderr || err.message).trim() });
      else resolve({ ok: true, out: String(stdout).trim() });
    });
  });
}

async function runningApps() {
  const r = await osa('tell application "System Events" to get name of every application process');
  if (!r.ok) return [];
  return r.out.split(', ');
}

function itermScript(ttyPath) {
  return `
tell application "iTerm2"
  repeat with w in windows
    repeat with t in tabs of w
      repeat with s in sessions of t
        try
          if tty of s is "${ttyPath}" then
            select t
            select w
            activate
            return "found"
          end if
        end try
      end repeat
    end repeat
  end repeat
end tell
return "no"`;
}

function terminalScript(ttyPath) {
  return `
tell application "Terminal"
  repeat with w in windows
    repeat with t in tabs of w
      try
        if tty of t is "${ttyPath}" then
          set selected of t to true
          set index of w to 1
          activate
          return "found"
        end if
      end try
    end repeat
  end repeat
end tell
return "no"`;
}

// Focus the window/tab that owns `tty` (e.g. "ttys004").
// Returns { located: bool, app: 'iTerm2'|'Terminal'|null, error? }
async function focusTty(tty) {
  if (!/^tty[a-zA-Z0-9]{1,12}$/.test(String(tty || ''))) {
    return { located: false, app: null, error: 'bad tty' };
  }
  const ttyPath = '/dev/' + tty;
  const apps = await runningApps();
  if (apps.length === 0) {
    return { located: false, app: null, error: 'automation permission?' };
  }
  if (apps.includes('iTerm2')) {
    const r = await osa(itermScript(ttyPath));
    if (r.ok && r.out === 'found') return { located: true, app: 'iTerm2' };
  }
  if (apps.includes('Terminal')) {
    const r = await osa(terminalScript(ttyPath));
    if (r.ok && r.out === 'found') return { located: true, app: 'Terminal' };
  }
  return { located: false, app: null };
}

// Type text into the frontmost app (digits/short answers only).
async function typeKeys(text) {
  const safe = String(text).replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 8);
  if (!safe) return { ok: false };
  const r = await osa(`delay 0.3\ntell application "System Events" to keystroke "${safe}"`);
  return { ok: r.ok, error: r.ok ? undefined : r.out };
}

module.exports = { focusTty, typeKeys };
