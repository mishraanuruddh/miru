'use strict';
const {
  app, BrowserWindow, Tray, Menu, screen, ipcMain, shell,
  systemPreferences, nativeImage, globalShortcut, Notification, clipboard,
} = require('electron');
const path = require('path');
const http = require('http');
const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const { Store } = require('./lib/store');
const { buildTrayIcon } = require('./lib/trayIcon');
const claudeHooks = require('./lib/claudeHooks');
const codexHooks = require('./lib/codexHooks');
const { focusTty, typeKeys, typeText } = require('./lib/focusTty');
const brain = require('./lib/brain');
const transcribeLib = require('./lib/transcribe');

const SMOKE = process.argv.includes('--smoke');
const SHOT = (() => {
  const i = process.argv.indexOf('--shot');
  return i >= 0 ? (process.argv[i + 1] || '/tmp/pixelpaw-shots') : null;
})();
const TEST = (() => {
  const i = process.argv.indexOf('--test');
  return i >= 0 ? (process.argv[i + 1] || '/tmp/pixelpaw-test') : null;
})();
const HARNESS = SMOKE || SHOT || TEST;
const WIN_W = 380;
const WIN_H = 430;

// harness runs use an isolated profile: fresh settings + separate single-instance
// lock, so they never disturb (or get blocked by) the user's running cat
if (HARNESS) {
  app.setPath('userData', require('path').join(
    require('os').tmpdir(), 'pixelpaw-harness-' + process.pid
  ));
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  // running `npm start` again rescues a hidden cat instead of opening a duplicate
  app.on('second-instance', () => {
    if (!catWin || catWin.isDestroyed()) {
      if (app.isReady()) createCatWindow();
    } else if (!catWin.isVisible()) {
      catWin.show();
    } else {
      openSettings();
    }
    if (tray) updateTray();
  });
}

let store;
let catWin = null;
let setWin = null;
let tray = null;
let agentServer = null;
let agentPort = null;
let uiohookOk = false;

// ---------------------------------------------------------------- helpers
function send(channel, payload) {
  if (catWin && !catWin.isDestroyed()) catWin.webContents.send(channel, payload);
}
function sendSettingsWin(channel, payload) {
  if (setWin && !setWin.isDestroyed()) setWin.webContents.send(channel, payload);
}
function broadcastSettings() {
  send('settings', store.get());
  sendSettingsWin('settings', store.get());
}

function clampToWorkArea(x, y) {
  const disp = screen.getDisplayNearestPoint({ x: x + WIN_W / 2, y: y + WIN_H / 2 });
  const wa = disp.workArea;
  return {
    x: Math.round(Math.min(Math.max(x, wa.x - WIN_W * 0.35), wa.x + wa.width - WIN_W * 0.65)),
    y: Math.round(Math.min(Math.max(y, wa.y - 40), wa.y + wa.height - WIN_H)),
  };
}

function defaultPosition() {
  const wa = screen.getPrimaryDisplay().workArea;
  return { x: wa.x + wa.width - WIN_W - 30, y: wa.y + wa.height - WIN_H };
}

// ------------------------------------------------------------- cat window
function createCatWindow() {
  const pos = store.get().position || defaultPosition();
  const clamped = clampToWorkArea(pos.x, pos.y);
  catWin = new BrowserWindow({
    x: clamped.x, y: clamped.y, width: WIN_W, height: WIN_H,
    transparent: true, frame: false, resizable: false, movable: false,
    minimizable: false, maximizable: false, fullscreenable: false,
    skipTaskbar: true, hasShadow: false, roundedCorners: false,
    focusable: false, acceptFirstMouse: true, show: !SMOKE,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  catWin.setAlwaysOnTop(true, 'screen-saver');
  catWin.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  catWin.setIgnoreMouseEvents(true, { forward: true });
  catWin.loadFile(path.join(__dirname, 'renderer', 'cat.html'));
  catWin.on('closed', () => { catWin = null; });
}

function openSettings() {
  if (setWin && !setWin.isDestroyed()) { setWin.show(); setWin.focus(); return; }
  setWin = new BrowserWindow({
    width: 840, height: 620, minWidth: 720, minHeight: 520,
    title: 'PixelPaw Settings', show: !SMOKE,
    backgroundColor: '#101014',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  setWin.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  setWin.on('closed', () => { setWin = null; });
}

// --------------------------------------------------------- cursor engine
// One 60Hz loop drives drag + hunt + renderer ticks (renderer tick at ~30Hz).
let lastCursor = null;
let lastPollT = 0;
let vel = 0;
let fastStreak = 0;
let lastActivityT = Date.now();
let tickAccum = 0;

let drag = null; // {ox, oy, lastX, lastY, lastT}
const hunt = { phase: 'none', t: 0, slowFor: 0, cooldownUntil: 0, dir: 1 };

function catCenter() {
  const b = catWin.getBounds();
  return { x: b.x + WIN_W / 2, y: b.y + WIN_H - 70 };
}

function startHunt() {
  hunt.phase = 'chase';
  hunt.t = 0;
  hunt.slowFor = 0;
  send('hunt', { phase: 'chase' });
}

function endHunt(caught) {
  if (caught) {
    hunt.phase = 'caught';
    send('hunt', { phase: 'caught' });
    setTimeout(() => {
      if (hunt.phase === 'caught') { hunt.phase = 'none'; send('hunt', { phase: 'none' }); }
    }, 1600);
  } else {
    hunt.phase = 'none';
    send('hunt', { phase: 'none' });
  }
  hunt.cooldownUntil = Date.now() + 25000;
  persistPosition();
}

let persistTimer = null;
function persistPosition() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    if (!catWin || catWin.isDestroyed()) return;
    const b = catWin.getBounds();
    store.set({ position: { x: b.x, y: b.y } });
  }, 400);
}

function pollLoop() {
  if (!catWin || catWin.isDestroyed()) return;
  const now = Date.now();
  const dt = lastPollT ? Math.min((now - lastPollT) / 1000, 0.1) : 0.016;
  lastPollT = now;

  let cur;
  try { cur = screen.getCursorScreenPoint(); } catch { return; }
  if (lastCursor) {
    const dx = cur.x - lastCursor.x, dy = cur.y - lastCursor.y;
    const d = Math.hypot(dx, dy);
    const instVel = d / dt;
    vel = vel * 0.75 + instVel * 0.25;
    if (d > 2) lastActivityT = now;
    if (cur.x !== lastCursor.x) hunt.dirHint = cur.x > lastCursor.x ? 1 : -1;
  }
  lastCursor = cur;

  const s = store.get();

  // drag
  if (drag) {
    const nx = cur.x - drag.ox, ny = cur.y - drag.oy;
    catWin.setPosition(Math.round(nx), Math.round(ny));
    const vdx = (cur.x - drag.lastX) / dt, vdy = (cur.y - drag.lastY) / dt;
    drag.lastX = cur.x; drag.lastY = cur.y;
    send('drag', { phase: 'move', vx: vdx, vy: vdy });
  }

  // hunt
  if (hunt.phase === 'none' && s.reactions.hunt && !drag && catWin.isVisible()) {
    const dist = Math.hypot(cur.x - catCenter().x, cur.y - catCenter().y);
    if (vel > 1500 && dist > 200) fastStreak += dt; else fastStreak = Math.max(0, fastStreak - dt * 2);
    if (fastStreak > 0.4 && now > hunt.cooldownUntil) { fastStreak = 0; startHunt(); }
  } else if (hunt.phase === 'chase' || hunt.phase === 'crouch' || hunt.phase === 'leap') {
    hunt.t += dt;
    const c = catCenter();
    const dist = Math.hypot(cur.x - c.x, cur.y - c.y);
    hunt.dir = cur.x >= c.x ? 1 : -1;
    if (vel < 80) hunt.slowFor += dt; else hunt.slowFor = 0;

    // during the crouch she holds still — the wiggle is all renderer
    const speed = hunt.phase === 'leap' ? 980 : 640;
    const step = Math.min(speed * dt, dist);
    if (hunt.phase !== 'crouch' && dist > 1) {
      const nx = c.x + ((cur.x - c.x) / dist) * step;
      const ny = c.y + ((cur.y - c.y) / dist) * step;
      const p = clampToWorkArea(nx - WIN_W / 2, ny - (WIN_H - 70));
      catWin.setPosition(p.x, p.y);
    }
    send('hunt', { phase: hunt.phase, dir: hunt.dir });

    if (hunt.phase === 'chase' && dist < 85) { hunt.phase = 'crouch'; hunt.crouchT = 0; }
    else if (hunt.phase === 'crouch') {
      hunt.crouchT += dt;
      if (dist > 190) hunt.phase = 'chase'; // prey bolted — back to the chase
      else if (hunt.crouchT > 0.65) { hunt.phase = 'leap'; hunt.leapT = 0; }
    } else if (hunt.phase === 'leap') {
      hunt.leapT = (hunt.leapT || 0) + dt;
      if (dist < 14 || hunt.leapT > 0.6) endHunt(true);
    }
    if (hunt.phase === 'chase' && (hunt.t > 8 || hunt.slowFor > 2)) endHunt(false);
  }

  // renderer tick at ~30Hz
  tickAccum += dt;
  if (tickAccum >= 0.032) {
    tickAccum = 0;
    const b = catWin.getBounds();
    send('tick', {
      cursor: { x: cur.x - b.x, y: cur.y - b.y },
      vel: Math.round(vel),
      idleSec: Math.round((now - lastActivityT) / 1000),
      dragging: !!drag,
      huntPhase: hunt.phase,
    });
  }
}

// ------------------------------------------------------------ global input
function setupUiohook() {
  if (HARNESS) return;
  if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
    // poll until the user grants permission, then attach
    const t = setInterval(() => {
      if (systemPreferences.isTrustedAccessibilityClient(false)) {
        clearInterval(t);
        attachUiohook();
      }
    }, 5000);
    return;
  }
  attachUiohook();
}

function attachUiohook() {
  if (uiohookOk) return;
  let uIOhook;
  try {
    ({ uIOhook } = require('uiohook-napi'));
  } catch (e) {
    console.error('[uiohook] module unavailable:', e.message);
    return;
  }
  try {
    let keyCount = 0;
    const keyTimes = [];
    let scrollAcc = 0;

    uIOhook.on('keydown', () => {
      keyCount++;
      keyTimes.push(Date.now());
      lastActivityT = Date.now();
    });
    uIOhook.on('wheel', (e) => {
      scrollAcc += Math.abs(e.rotation || 1);
      lastActivityT = Date.now();
    });

    setInterval(() => {
      const now = Date.now();
      while (keyTimes.length && now - keyTimes[0] > 2000) keyTimes.shift();
      if (keyCount > 0) {
        send('input:key', { kps: keyTimes.length / 2 });
        keyCount = 0;
      }
      if (scrollAcc > 0) {
        send('input:scroll', { amount: scrollAcc });
        scrollAcc = 0;
      }
    }, 120);

    uIOhook.start();
    uiohookOk = true;
    console.log('[uiohook] started');
  } catch (e) {
    console.error('[uiohook] failed to start:', e.message);
  }
}

// ----------------------------------------------------------- agent sessions
// key -> {agent, label, tty, cwd, state: thinking|alert|idle, thinkingSince, lastSeen, hasQuestion}
const sessions = new Map();
let pendingQuestion = null; // {qid, sessionKey, agent, header, question, options, multiSelect, canType, tty}
const askCalls = []; // TEST-mode introspection

function agentLabel(name) {
  const n = String(name || 'agent').toLowerCase();
  if (n.includes('claude')) return 'CLAUDE';
  if (n.includes('codex')) return 'CODEX';
  return n.replace(/[-_].*$/, '').toUpperCase().slice(0, 10) || 'AGENT';
}

function emitAgents() {
  let working = 0, alert = 0;
  const details = [];
  for (const [key, s] of sessions) {
    const state = s.hasQuestion ? 'question' : s.state;
    if (state === 'question' || state === 'alert') alert++;
    else if (state === 'thinking') working++;
    else continue;
    details.push({
      key,
      agent: agentLabel(s.agent),
      state,
      sinceMin: Math.max(0, Math.round((Date.now() - (s.stateSince || s.lastSeen)) / 60000)),
      msg: s.lastMsg ? String(s.lastMsg).slice(0, 70) : null,
      project: s.cwd ? String(s.cwd).split('/').pop() : null,
    });
  }
  send('agents', { working, alert, details });
}

function sessionUpsert(key, patch) {
  const s = sessions.get(key) || { agent: 'agent', state: 'idle', thinkingSince: 0, stateSince: Date.now() };
  const prevState = s.state;
  Object.assign(s, patch, { lastSeen: Date.now() });
  if (patch.state && patch.state !== prevState) s.stateSince = Date.now();
  sessions.set(key, s);
  emitAgents();
  return s;
}

function clearQuestion(qid) {
  if (!pendingQuestion) return;
  if (qid && pendingQuestion.qid !== qid) return;
  const s = sessions.get(pendingQuestion.sessionKey);
  if (s) s.hasQuestion = false;
  pendingQuestion = null;
  send('ask-clear', {});
  emitAgents();
}

// celebration rate limiter: bursty agents (batch pipelines!) collapse to a
// single celebration per window — the rest land silently in the inbox + LED
const lastCelebrateAt = new Map(); // label -> ts
const BURST_WINDOW = TEST ? 15000 : 90000;

// background automation (no terminal attached) is muted by default:
// it still leaves an inbox trail + LED flash, but no meow/jump/bubble
function backgroundMuted(interactive) {
  return !interactive && store.get().agent.muteBackground !== false;
}

function sendAgentDone(label, quiet, interactive = true) {
  if (backgroundMuted(interactive)) {
    send('agent-done', { agent: label, quiet: true, silent: true }); // LED only
    return;
  }
  const now = Date.now();
  const silent = now - (lastCelebrateAt.get(label) || 0) < BURST_WINDOW;
  if (!silent) lastCelebrateAt.set(label, now);
  bondEvent('agentRun');
  send('agent-done', { agent: label, quiet, silent });
}

function agentDone(key, label) {
  const s = sessions.get(key);
  const min = TEST ? 0 : (store.get().agent.minCelebrateMs ?? 5000);
  const dur = s && s.thinkingSince ? Date.now() - s.thinkingSince : 0;
  const wasBusy = s && (s.state === 'thinking' || s.state === 'alert');
  const interactive = !!(s && (s.tty || s.interactive));
  if (s) { s.state = 'idle'; s.thinkingSince = 0; }
  if (pendingQuestion && pendingQuestion.sessionKey === key) clearQuestion();
  if (wasBusy) {
    if (backgroundMuted(interactive)) {
      const proj = s && s.cwd ? ' · ' + String(s.cwd).split('/').pop() : '';
      pushInbox(`${label.toLowerCase()} (bg${proj}) done`, 'agent');
    }
    sendAgentDone(label, dur < min, interactive);
  }
  emitAgents();
}

// lifecycle sweep: alerts decay after a while, dead sessions melt away
const ALERT_TTL = TEST ? 4000 : 10 * 60 * 1000;
setIntervalSafe(() => {
  let changed = false;
  for (const [k, s] of sessions) {
    if (s.state === 'alert' && !s.hasQuestion && Date.now() - (s.stateSince || 0) > ALERT_TTL) {
      s.state = 'idle';
      s.stateSince = Date.now();
      changed = true;
    }
    if (Date.now() - s.lastSeen > 30 * 60 * 1000) { sessions.delete(k); changed = true; }
  }
  if (changed) { if (pendingQuestion && !sessions.has(pendingQuestion.sessionKey)) clearQuestion(); emitAgents(); }
}, TEST ? 2500 : 30000);

function sanitizeTty(v) {
  return /^tty[a-zA-Z0-9]{1,12}$/.test(String(v || '')) ? v : null;
}

function handleClaudeHook(route, data, tty) {
  if (!store.get().agent.enabled) return;
  const sid = 'claude:' + String(data.session_id || 'unknown');
  switch (route) {
    case 'prompt':
      sessionUpsert(sid, {
        agent: 'claude', state: 'thinking', thinkingSince: Date.now(),
        tty: tty || (sessions.get(sid) || {}).tty, cwd: data.cwd, hasQuestion: false,
      });
      if (pendingQuestion && pendingQuestion.sessionKey === sid) clearQuestion();
      break;
    case 'stop':
      sessionUpsert(sid, { tty: tty || (sessions.get(sid) || {}).tty });
      agentDone(sid, 'CLAUDE');
      break;
    case 'notification': {
      const msg = String(data.message || 'CLAUDE NEEDS YOU!').slice(0, 110);
      const sTty2 = tty || (sessions.get(sid) || {}).tty;
      // idle "waiting for input" nudges are not urgent: gentle bubble, no red LED
      const soft = /waiting for .*(input|you)|idle/i.test(msg);
      if (soft) {
        sessionUpsert(sid, { tty: sTty2 });
        if (!backgroundMuted(!!sTty2)) send('remind', { text: msg.toUpperCase(), kind: 'say' });
      } else {
        sessionUpsert(sid, { state: 'alert', lastMsg: msg, tty: sTty2 });
        if (backgroundMuted(!!sTty2)) {
          pushInbox('claude (bg) needs attention: ' + msg, 'agent'); // red LED via session state
        } else {
          send('agent-alert', { agent: 'CLAUDE', message: msg, tty });
        }
      }
      break;
    }
    case 'ask': {
      const questions = (data.tool_input && data.tool_input.questions) || [];
      if (!questions.length) break;
      const q = questions[0];
      const options = (q.options || []).map((o) => String(o.label || '')).filter(Boolean).slice(0, 4);
      const sTty = tty || (sessions.get(sid) || {}).tty || null;
      sessionUpsert(sid, { lastMsg: String(q.question || '').slice(0, 70) });
      pendingQuestion = {
        qid: sid + ':' + Date.now(),
        sessionKey: sid,
        agent: 'CLAUDE',
        header: String(q.header || '').slice(0, 16),
        question: String(q.question || '').slice(0, 200),
        options,
        multiSelect: !!q.multiSelect,
        extraQuestions: questions.length - 1,
        canType: !!sTty && options.length > 0 && !q.multiSelect && questions.length === 1,
        tty: sTty,
      };
      sessionUpsert(sid, { state: 'alert', hasQuestion: true, tty: sTty });
      // a live agent question outranks ambient nudges
      if (activeConfirm && AMBIENT_CONFIRM[activeConfirm.kind]) clearConfirm('preempted');
      pushInbox('claude asks: ' + String(q.question || '').slice(0, 80), 'ask');
      send('ask', { ...pendingQuestion });
      break;
    }
    case 'ask-done':
      clearQuestion();
      sessionUpsert(sid, { state: 'thinking', thinkingSince: (sessions.get(sid) || {}).thinkingSince || Date.now() });
      break;
    case 'end':
      sessions.delete(sid);
      if (pendingQuestion && pendingQuestion.sessionKey === sid) clearQuestion();
      emitAgents();
      break;
  }
}

// ------------------------------------------------------------ agent server
function startAgentServer() {
  const basePort = store.get().agent.port || 41999;
  let attempt = 0;

  const tryListen = (port) => {
    const server = http.createServer((req, res) => {
      const done = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      };
      const u = new URL(req.url, 'http://127.0.0.1');
      const p = u.pathname;
      if (req.method === 'GET' && p === '/health') {
        return done(200, { ok: true, app: 'pixelpaw', version: app.getVersion() });
      }
      if (req.method === 'GET' && p === '/status') {
        return done(200, {
          ok: true,
          sessions: [...sessions.entries()].map(([key, s]) => ({
            key, agent: s.agent, state: s.state, hasQuestion: !!s.hasQuestion,
            tty: s.tty || null, cwd: s.cwd || null, lastMsg: s.lastMsg || null,
            stateAgeSec: Math.round((Date.now() - (s.stateSince || s.lastSeen)) / 1000),
          })),
          question: pendingQuestion ? { qid: pendingQuestion.qid, question: pendingQuestion.question } : null,
          bond: { ...bond(), level: bondLevel(bond().xp) },
          tasks: (store.get().tasks || []).map((t) => ({
            id: t.id, text: t.text, done: !!t.done,
            due: t.due || null, remindedAt: t.remindedAt || null,
            followUps: t.followUps || 0, lastFollowUpAt: t.lastFollowUpAt || null,
            overdue: !!(t.due && !t.done && t.due < Date.now()),
          })),
          confirm: activeConfirm
            ? { cid: activeConfirm.cid, kind: activeConfirm.kind, taskIds: activeConfirm.taskIds }
            : null,
          inboxCount: inbox.length,
          pomodoro: pom.phase === 'off' ? null : { phase: pom.phase, remaining: pom.remaining, paused: pom.paused },
          voice: { phase: voice.phase, availability: brain.availability(), usage: voiceUsageRoll() },
          windDownDay: bond().windDownDay || null,
        });
      }
      if (req.method !== 'POST') return done(404, { ok: false });
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 65536) req.destroy();
      });
      req.on('end', () => {
        let data = {};
        try { data = JSON.parse(body || '{}'); } catch { data = {}; }

        if (p === '/show') {
          if (!catWin || catWin.isDestroyed()) createCatWindow(); else catWin.show();
          updateTray();
          return done(200, { ok: true });
        }
        if (p === '/hide') {
          if (catWin && !catWin.isDestroyed()) catWin.hide();
          updateTray();
          return done(200, { ok: true });
        }
        if (p === '/say') {
          const text = String(data.text || '').slice(0, 120);
          if (text) { send('remind', { text, kind: 'say' }); pushInbox(text, 'say'); }
          return done(200, { ok: true });
        }
        if (p === '/menu') {
          if (catWin && !catWin.isDestroyed() && !catWin.isVisible()) catWin.show();
          send('menu:toggle', {});
          return done(200, { ok: true });
        }
        if (p === '/url') {
          return done(200, handleDeepLink(data.url));
        }
        if (p === '/voice') {
          const text = String(data.text || '').slice(0, 400).trim();
          if (!text) {
            if (TEST) return done(400, { ok: false, error: 'no text' });
            voiceToggle('api').then((r) => done(r.ok ? 200 : 409, r));
            return;
          }
          if (voice.phase !== 'idle') return done(409, { ok: false, error: 'busy' });
          handleVoiceTranscript(text, 'api')
            .then((r) => done(200, { ok: true, ...r }))
            .catch((err) => { voiceReset(); done(500, { ok: false, error: err.message }); });
          return;
        }
        if (TEST && p === '/test/task-clock') {
          // rewind task clocks so 30-minute follow-ups happen inside a test
          const rewindMs = Number(data.rewindMs) || 0;
          const tasks = (store.get().tasks || []).map((t) => {
            if (data.id && t.id !== data.id) return t;
            const patched = { ...t };
            for (const k of ['due', 'remindedAt', 'lastFollowUpAt']) {
              if (patched[k]) patched[k] -= rewindMs;
            }
            return patched;
          });
          store.set({ tasks });
          broadcastSettings();
          if (process.env.FU_DEBUG) console.error('[fu] task-clock', JSON.stringify({ id: data.id, rewindMs, after: tasks.map((t) => ({ id: t.id, due: t.due, remindedAt: t.remindedAt })) }));
          return done(200, { ok: true, tasks });
        }
        if (TEST && p === '/test/away') {
          // pretend the last activity before now happened `minutes` ago
          awayPrevActivityT = Date.now() - (Number(data.minutes) || 0) * 60000;
          return done(200, { ok: true });
        }
        if (TEST && p === '/test/sessions-clear') {
          sessions.clear();
          clearQuestion();
          emitAgents();
          return done(200, { ok: true });
        }
        if (TEST && p === '/test/voice-classify') {
          // classify-only: no pipeline side effects (brain unit scenarios)
          brain.classify(String(data.text || ''), { test: true })
            .then((route) => done(200, { ok: true, route }));
          return;
        }
        if (TEST && p === '/test/voice-phase') {
          // drive the renderer's listening visuals without a real mic
          send('voice:state', { phase: String(data.phase || 'idle'), vid: 'vtest', maxMs: 15000 });
          return done(200, { ok: true });
        }
        if (TEST && p === '/test/voice-route') {
          // inject a post-classify route straight into the dispatcher
          if (voice.phase !== 'idle') return done(409, { ok: false, error: 'busy' });
          const route = { confidence: 0.9, source: 'test', ...(data.route || {}) };
          const r = dispatchRoute(route, String(route.text || route.agent || ''));
          return done(200, { ok: true, ...r });
        }
        if (p === '/todo') {
          const raw = String(data.text || '').slice(0, 110);
          if (!raw) return done(400, { ok: false, error: 'no text' });
          const { text, due } = addTask(raw);
          send('remind', { text: 'TODO: ' + text.toUpperCase(), kind: 'say' });
          return done(200, { ok: true, tasks: (store.get().tasks || []).length, due });
        }
        if (TEST && p === '/test/bond-roll') {
          // deterministic relationship testing: roll to a given day
          const b = bond();
          if (data.engagement != null) { b.today.engagement = data.engagement; store.set({ bond: b }); }
          if (data.activeYesterday) { b.today.todosDone = 1; store.set({ bond: b }); }
          testDayOverride = String(data.day);
          // the wind-down hour override resets on EVERY roll: a scenario must
          // opt in each time, so no hour leaks into later scenarios
          testHourOverride = null;
          if (data.hour != null) {
            const [hh, mm] = String(data.hour).split(':').map(Number);
            testHourOverride = (hh || 0) * 60 + (mm || 0);
          }
          bondDailyRoll(testDayOverride, { forceGift: data.forceGift });
          if (data.greeted) {
            // mark the rolled day as already greeted + wound-down (and drop
            // the queued gift) so no ritual fires into later scenarios;
            // windDown:false keeps the evening armed for wind-down scenarios
            const b3 = bond();
            b3.greetedDay = testDayOverride;
            if (data.windDown !== false) b3.windDownDay = testDayOverride;
            b3.pendingGift = null;
            store.set({ bond: b3 });
          }
          return done(200, { ok: true, bond: { ...bond(), level: bondLevel(bond().xp) } });
        }
        if (TEST && p === '/test/confirm') {
          // drive the shared chip panel directly; chip/dismiss land in askCalls
          const cid = showConfirm({
            kind: data.kind || 'voice',
            title: data.title || 'TEST',
            text: data.text || '',
            chips: data.chips || [{ id: 'confirm', label: 'OK' }, { id: 'cancel', label: 'CANCEL' }],
            autoConfirmMs: data.autoConfirmMs || null,
            onChip: (id) => askCalls.push({ confirmChip: id }),
            onDismiss: (reason) => askCalls.push({ confirmDismiss: reason }),
          });
          return done(200, { ok: !!cid, cid });
        }
        if (p.startsWith('/hook/claude/')) {
          const route = p.slice('/hook/claude/'.length);
          if (!['prompt', 'stop', 'notification', 'ask', 'ask-done', 'end'].includes(route)) {
            return done(404, { ok: false });
          }
          try { handleClaudeHook(route, data, sanitizeTty(u.searchParams.get('tty'))); }
          catch (e) { console.error('[hook]', e); }
          return done(200, { ok: true });
        }
        if (p === '/hook/codex/notify') {
          const type = String(data.type || '');
          if (type === 'agent-turn-complete' && store.get().agent.enabled) {
            const msg = String(data['last-assistant-message'] || data.last_assistant_message || '')
              .replace(/\s+/g, ' ').trim().slice(0, 110);
            const srcTty = sanitizeTty(u.searchParams.get('tty'));
            const cmd = String(req.headers['x-codex-cmd'] || '');
            const project = (cmd.match(/projects\/([^/\s"]+)/) || [])[1];
            let src = srcTty || (/(^|\/)codex exec|codex.*\bexec\b/.test(cmd) ? 'exec' : cmd.includes('app-server') ? 'desktop app' : 'headless');
            if (project) src += ' · ' + project;
            pushInbox(`codex (${src}) done` + (msg ? ': ' + msg : ''), 'agent');
            const muted = (store.get().agent.muteAgents || []).includes('codex');
            if (!muted) sendAgentDone('CODEX', false, !!srcTty);
          }
          return done(200, { ok: true });
        }
        if (p === '/agent') {
          // generic API for any tool
          const state = String(data.state || '');
          if (!['thinking', 'working', 'done', 'alert', 'idle'].includes(state)) {
            return done(400, { ok: false, error: 'bad state' });
          }
          if (store.get().agent.enabled) {
            const label = agentLabel(data.agent);
            const key = 'x:' + label;
            if (state === 'thinking' || state === 'working') {
              sessionUpsert(key, { agent: label, state: 'thinking', interactive: !!data.interactive, thinkingSince: (sessions.get(key) || {}).thinkingSince || Date.now() });
            } else if (state === 'done') {
              if (data.interactive) sessionUpsert(key, { interactive: true });
              agentDone(key, label);
            } else if (state === 'alert') {
              const msgA = String(data.message || `${label} NEEDS YOU!`).slice(0, 110);
              sessionUpsert(key, { agent: label, state: 'alert', lastMsg: msgA, interactive: !!data.interactive });
              if (backgroundMuted(!!data.interactive)) pushInbox(`${label.toLowerCase()} (bg) needs attention: ${msgA}`, 'agent');
              else send('agent-alert', { agent: label, message: msgA });
            } else {
              sessions.delete(key);
              emitAgents();
            }
          }
          return done(200, { ok: true });
        }
        done(404, { ok: false });
      });
    });
    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE' && attempt < 10) {
        attempt++;
        tryListen(basePort + attempt);
      } else {
        console.error('[agent] server error:', e.message);
      }
    });
    server.listen(port, '127.0.0.1', () => {
      agentServer = server;
      agentPort = port;
      console.log('[agent] listening on 127.0.0.1:' + port);
      sendSettingsWin('agent:port', port);
    });
  };
  tryListen(basePort);
}

// --------------------------------------------------------------- pomodoro
const pom = { phase: 'off', remaining: 0, paused: false, count: 0 };

function pomBroadcast() {
  const payload = { ...pom, cfg: store.get().pomodoro };
  send('pom', payload);
  sendSettingsWin('pom', payload);
  updateTray();
}

function pomAdvance() {
  const cfg = store.get().pomodoro;
  if (pom.phase === 'focus') {
    pom.count++;
    bondEvent('pomodoro'); // a focus block survived together
    const long = cfg.longEvery > 0 && pom.count % cfg.longEvery === 0;
    pom.phase = long ? 'long' : 'break';
    pom.remaining = (long ? cfg.longBreakMin : cfg.breakMin) * 60;
    send('pom:phase', { phase: pom.phase });
  } else {
    if (cfg.loop) {
      pom.phase = 'focus';
      pom.remaining = cfg.focusMin * 60;
      send('pom:phase', { phase: 'focus' });
    } else {
      pom.phase = 'off';
      pom.remaining = 0;
    }
  }
  pomBroadcast();
}

function pomControl(action) {
  const cfg = store.get().pomodoro;
  switch (action) {
    case 'start':
      pom.phase = 'focus'; pom.remaining = cfg.focusMin * 60; pom.paused = false; pom.count = 0;
      send('pom:phase', { phase: 'focus' });
      break;
    case 'toggle-pause':
      if (pom.phase !== 'off') pom.paused = !pom.paused;
      break;
    case 'skip':
      if (pom.phase !== 'off') pomAdvance();
      return;
    case 'stop':
      pom.phase = 'off'; pom.remaining = 0; pom.paused = false;
      break;
  }
  pomBroadcast();
}

setIntervalSafe(() => {
  if (!store || pom.phase === 'off' || pom.paused) return;
  pom.remaining--;
  if (pom.remaining <= 0) pomAdvance();
  else pomBroadcast();
}, 1000);

function setIntervalSafe(fn, ms) {
  setInterval(() => { try { fn(); } catch (e) { console.error(e); } }, ms);
}

// ------------------------------------------------- stretch + reminders
let lastStretchT = Date.now();
setIntervalSafe(() => {
  if (!store) return;
  const s = store.get();
  if (!s.stretch.enabled) { lastStretchT = Date.now(); return; }
  if (Date.now() - lastStretchT >= s.stretch.intervalMin * 60 * 1000) {
    lastStretchT = Date.now();
    send('stretch-now', {});
  }
}, 20000);

const firedReminders = new Map(); // id -> 'YYYY-MM-DD'
setIntervalSafe(() => {
  if (!store) return;
  const s = store.get();
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
  const today = now.toISOString().slice(0, 10);
  for (const r of s.reminders || []) {
    if (!r.enabled || r.time !== hhmm) continue;
    if (firedReminders.get(r.id) === today) continue;
    firedReminders.set(r.id, today);
    send('remind', { text: r.text, kind: 'reminder' });
    pushInbox(r.text, 'reminder');
  }
}, 15000);

// ------------------------------------------------------------ bond (the relationship)
const { GIFTS, RARITY_WEIGHT } = require('./renderer/gifts');
const BOND_LEVELS = [0, 50, 150, 350, 700]; // xp thresholds for levels 1..5
const BOND_XP = { pet: 3, boop: 1, checkin: 10, todoDone: 5, pomodoro: 8, agentRun: 2 };

function bond() { return store.get().bond; }
function bondLevel(xp) {
  let lvl = 1;
  for (let i = 0; i < BOND_LEVELS.length; i++) if (xp >= BOND_LEVELS[i]) lvl = i + 1;
  return lvl;
}
function bondSave(b) {
  store.set({ bond: b });
  send('bond', { ...b, level: bondLevel(b.xp) });
}

const bondThrottle = new Map(); // type -> ts
function bondEvent(type, opts = {}) {
  if (!store) return;
  const throttleMs = { pet: 60000, boop: 15000 }[type] || 0;
  if (throttleMs && Date.now() - (bondThrottle.get(type) || 0) < throttleMs) return;
  bondThrottle.set(type, Date.now());
  const b = bond();
  b.xp += BOND_XP[type] || 0;
  if (type === 'pet') b.counters.pets++;
  if (type === 'boop') b.counters.boops++;
  if (type === 'todoDone') { b.counters.todosDone++; b.today.todosDone++; b.records.todosInDay = Math.max(b.records.todosInDay, b.today.todosDone); }
  if (type === 'pomodoro') { b.counters.pomodoros++; b.today.pomodoros++; b.records.pomodorosInDay = Math.max(b.records.pomodorosInDay, b.today.pomodoros); }
  if (type === 'agentRun') b.counters.agentRuns++;
  b.today.engagement = Math.min(30, (b.today.engagement || 0) + 1);
  bondSave(b);
}

function pickGift(forceId) {
  if (forceId && GIFTS[forceId]) return forceId;
  const pool = Object.entries(GIFTS).flatMap(([id, g]) => Array(RARITY_WEIGHT[g.rarity] || 1).fill(id));
  return pool[Math.floor(Math.random() * pool.length)];
}

function isWeekend(dayStr) {
  const d = new Date(dayStr + 'T12:00:00').getDay();
  return d === 0 || d === 6;
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000);
}

// roll the relationship forward to `today` — streaks, milestones, overnight gift
function bondDailyRoll(today, opts = {}) {
  const b = bond();
  if (!b.adoptedAt) b.adoptedAt = Date.now();
  if (b.today.day === today) { bondSave(b); return; }

  const prev = b.today.day;
  const yesterdayEngagement = b.today.engagement || 0;
  const yesterdayActive = (b.today.todosDone || 0) > 0 || (b.today.pomodoros || 0) > 0 || yesterdayEngagement >= 3;

  if (prev) {
    b.daysTogether++;
    if (yesterdayActive) {
      b.streak++;
    } else {
      // weekend grace: quiet Sat/Sun never breaks a streak
      const gap = daysBetween(prev, today);
      let graced = true;
      for (let i = 0; i < gap; i++) {
        const d = new Date(new Date(prev + 'T12:00:00').getTime() + i * 86400000);
        const ds = d.toISOString().slice(0, 10);
        if (!isWeekend(ds)) { graced = false; break; }
      }
      if (!graced) b.streak = 0;
    }
    b.bestStreak = Math.max(b.bestStreak, b.streak);
  } else {
    b.daysTogether = Math.max(1, b.daysTogether);
  }

  b.today = { day: today, todosDone: 0, pomodoros: 0, engagement: 0 };
  b.greetedDay = null;
  b.windDownDay = null;

  // overnight gift: chance scales with yesterday's shared work; milestones guarantee one
  const milestone = [7, 30, 100, 365].includes(b.daysTogether) || (b.streak > 0 && [7, 30, 100].includes(b.streak));
  const chance = Math.min(0.55, 0.12 + yesterdayEngagement * 0.025);
  if (opts.forceGift || milestone || Math.random() < chance) {
    b.pendingGift = { id: pickGift(opts.forceGift), milestone };
  }
  bondSave(b);
}

// morning ritual: first activity of a new day -> greeting (+ gift presentation)
let lastRitualCheck = 0;
let testDayOverride = null;  // TEST only: pin "today" to the rolled day
let testHourOverride = null; // TEST only: minutes since midnight for wind-down
function checkRituals() {
  if (!store || !catWin || catWin.isDestroyed() || !catWin.isVisible()) return;
  const now = Date.now();
  if (now - lastRitualCheck < 5000) return;
  lastRitualCheck = now;
  const d = new Date(now);
  const localToday = (TEST && testDayOverride) ? testDayOverride : localDayStr(d);
  const b = bond();
  if (b.today.day !== localToday) bondDailyRoll(localToday);
  const active = now - lastActivityT < 15000;
  if (!active) return;
  const b2 = bond();
  if (b2.greetedDay === localToday) { b2.lastSeenAt = now; store.set({ bond: b2 }); return; }

  // adoption day: the name introduction is the hello — first MORNING comes tomorrow
  if (now - (b2.adoptedAt || 0) < (TEST ? 5000 : 90000)) {
    b2.greetedDay = localToday;
    b2.lastSeenAt = now;
    store.set({ bond: b2 });
    return;
  }

  const awayDays = b2.lastSeenAt ? Math.floor((now - b2.lastSeenAt) / 86400000) : 0;
  b2.greetedDay = localToday;
  b2.lastSeenAt = now;

  const dueToday = (store.get().tasks || []).filter((t) => !t.done && t.due &&
    new Date(t.due).toDateString() === new Date().toDateString()).length;
  send('ritual', {
    kind: awayDays >= 2 ? 'reunion' : 'morning',
    name: (store.get().name || '').trim(),
    dueToday,
    daysTogether: b2.daysTogether,
    milestone: [7, 30, 100, 365].includes(b2.daysTogether) ? b2.daysTogether : null,
  });
  if (b2.pendingGift) {
    const g = b2.pendingGift;
    b2.pendingGift = null;
    b2.gifts.unshift({ id: g.id, t: now });
    b2.counters.gifts++;
    b2.xp += 4;
    setTimeout(() => send('gift', { id: g.id, name: GIFTS[g.id].name, rarity: GIFTS[g.id].rarity, milestone: g.milestone }), TEST ? 700 : 4200);
  }
  bondSave(b2);
}
setIntervalSafe(checkRituals, TEST ? 1200 : 6000);

// evening wind-down: once per evening, if something is still due today,
// offer to sweep it to tomorrow. Never a guilt trip; silence on clean days.
function checkWindDown() {
  if (!store || !catWin || catWin.isDestroyed() || !catWin.isVisible()) return;
  const s = store.get();
  if (!s.windDown || s.windDown.enabled === false) return;
  if (TEST && testHourOverride == null) return; // inert under the harness unless opted in
  const now = Date.now();
  const d = new Date(now);
  const localToday = (TEST && testDayOverride) ? testDayOverride : localDayStr(d);
  const b = bond();
  if (b.windDownDay === localToday) return;   // once per day
  if (b.greetedDay !== localToday) return;    // the greeting ritual goes first
  const [h, m] = String(s.windDown.time || '18:30').split(':').map(Number);
  const nowMin = TEST ? testHourOverride : d.getHours() * 60 + d.getMinutes();
  if (nowMin < (h || 18) * 60 + (m || 0) || nowMin >= 23 * 60) return; // window: time → 23:00
  if (now - lastActivityT > 15000) return;    // carries to the first activity inside the window
  if (activeConfirm || pendingQuestion) return;
  const eod = new Date(d);
  eod.setHours(23, 59, 59, 999);
  const open = (s.tasks || []).filter((t) => !t.done && t.due && t.due <= eod.getTime());
  const b2 = bond();
  b2.windDownDay = localToday; // marked at decision time — never re-fires today
  store.set({ bond: b2 });
  if (!open.length) return;    // clean evening: the ritual is silence
  sendWindDown(open);
}
setIntervalSafe(checkWindDown, TEST ? 1200 : 30000);

function sendWindDown(open) {
  showConfirm({
    kind: 'winddown',
    title: 'WIND-DOWN',
    text: open.length + ' LEFT TODAY — TOMORROW?',
    chips: [
      { id: 'sweep', label: 'TOMORROW 9AM' },
      { id: 'keep', label: 'KEEP TONIGHT' },
    ],
    autoConfirmMs: null,
    taskIds: open.map((t) => t.id),
    onChip: (id) => {
      if (id === 'sweep') {
        for (const t of open) rescheduleTask(t.id, tomorrowAt(9, 0));
        pushInbox('swept ' + open.length + ' to tomorrow 9am', 'todo');
        send('remind', { text: 'SEE THEM AT 9AM!', kind: 'say' });
      } else {
        send('remind', { text: 'CHEERING FOR YOU!', kind: 'say' });
      }
    },
    onDismiss: () => {}, // day already marked; the evening stays quiet
  });
}

// while-you-were-away digest: come back after 2+ hours and get one bubble
// summarizing what happened; click leads to the inbox. Greeting goes first.
const AWAY_MIN_MS = 2 * 3600000;
let awayPrevActivityT = Date.now();
let digestTimer = null;
function checkAwayReturn() {
  const a = lastActivityT;
  if (a === awayPrevActivityT) return; // still away, or nothing new
  const gap = a - awayPrevActivityT;
  awayPrevActivityT = a;
  if (gap < AWAY_MIN_MS) return;
  clearTimeout(digestTimer); // one pending digest max
  digestTimer = setTimeout(() => sendAwayDigest(a - gap), TEST ? 6000 : 10000); // TEST: outlast the 5s ritual throttle so the greeting stays first
}
setIntervalSafe(checkAwayReturn, TEST ? 400 : 5000);

function sendAwayDigest(awayStartT) {
  if (!catWin || catWin.isDestroyed() || !catWin.isVisible()) return;
  if (pendingQuestion || activeConfirm) return; // a live ask IS the headline
  const since = inbox.filter((e) => e.t >= awayStartT);
  const runs = since.filter((e) => e.kind === 'agent').length;
  const asks = since.filter((e) => e.kind === 'ask').length;
  const due = (store.get().tasks || []).filter((t) => !t.done && t.due && t.due <= Date.now()).length;
  const notes = since.filter((e) => ['say', 'reminder', 'todo'].includes(e.kind)).length;
  const parts = [];
  if (runs) parts.push(runs + (runs === 1 ? ' AGENT RUN' : ' AGENT RUNS'));
  if (asks) parts.push(asks + (asks === 1 ? ' ASK' : ' ASKS'));
  if (due) parts.push(due + ' DUE');
  if (!parts.length && notes) parts.push(notes + (notes === 1 ? ' NOTE' : ' NOTES'));
  if (!parts.length) return; // nothing happened: no bubble
  send('remind', { text: 'WHILE YOU WERE OUT: ' + parts.join(' · '), kind: 'say' });
}

// ------------------------------------------------------- launcher / gateway
const inbox = []; // {text, t, kind} — persisted via store.inboxLog
function pushInbox(text, kind) {
  inbox.unshift({ text: String(text).slice(0, 160), t: Date.now(), kind });
  if (inbox.length > 30) inbox.length = 30;
  send('inbox', inbox);
  sendSettingsWin('inbox', inbox);
  if (store) store.set({ inboxLog: inbox });
}
function clearInbox() {
  inbox.length = 0;
  send('inbox', inbox);
  sendSettingsWin('inbox', inbox);
  if (store) store.set({ inboxLog: [] });
}

// "review PR @ 16:30" / "standup @ 9:30am" / "call mom @ +30m" -> due time
function parseDue(raw) {
  const m = String(raw).match(/^(.*?)\s+@\s*(\S.*?)\s*$/);
  if (!m) return { text: String(raw).trim(), due: null };
  const [, body, token] = m;
  const t = token.toLowerCase();
  let due = null;
  let r;
  if ((r = t.match(/^\+(\d+)\s*(m|min|mins|h|hr|hrs)?$/))) {
    due = Date.now() + Number(r[1]) * (r[2] && r[2][0] === 'h' ? 3600000 : 60000);
  } else if ((r = t.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/))) {
    let h = Number(r[1]);
    const min = Number(r[2] || 0);
    if (r[3] === 'pm' && h < 12) h += 12;
    if (r[3] === 'am' && h === 12) h = 0;
    if (h < 24 && min < 60) {
      const d = new Date();
      d.setHours(h, min, 0, 0);
      if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); // next occurrence
      due = d.getTime();
    }
  }
  return due ? { text: body.trim(), due } : { text: String(raw).trim(), due: null };
}

function addTask(rawText) {
  const { text, due } = parseDue(String(rawText).slice(0, 110));
  const tasks = store.get().tasks || [];
  const id = 't' + Date.now() + Math.floor(Math.random() * 999);
  tasks.unshift({
    id, text: text.slice(0, 80), done: false, due, remindedAt: null,
    followUps: 0, lastFollowUpAt: null,
  });
  store.set({ tasks: tasks.slice(0, 30) });
  broadcastSettings();
  return { id, text, due };
}

// shared task mutations: menu IPC, HTTP, and chip panels all route through
// these so side effects (bond XP, inbox trails) stay consistent
function patchTask(id, patch) {
  const tasks = (store.get().tasks || []).map((t) => (t.id === id ? { ...t, ...patch } : t));
  store.set({ tasks });
  broadcastSettings();
}
function toggleTask(id) {
  const before = (store.get().tasks || []).find((t) => t.id === id);
  if (!before) return;
  patchTask(id, { done: !before.done });
  if (!before.done) bondEvent('todoDone'); // checked off together
  // completing a task melts any chip panel that was nagging about it
  if (activeConfirm && (activeConfirm.taskIds || []).includes(id)) clearConfirm('resolved');
}
function snoozeTask(id, ms) {
  // a deliberate snooze restarts a fresh, gentle follow-up cycle
  patchTask(id, { due: Date.now() + ms, remindedAt: null, followUps: 0, lastFollowUpAt: null });
}
function rescheduleTask(id, dueTs) {
  patchTask(id, { due: dueTs, remindedAt: null, followUps: 0, lastFollowUpAt: null });
}
function dropTask(id) {
  const t = (store.get().tasks || []).find((x) => x.id === id);
  if (!t) return;
  store.set({ tasks: (store.get().tasks || []).filter((x) => x.id !== id) });
  broadcastSettings();
  pushInbox('dropped: ' + t.text, 'todo');
  if (activeConfirm && (activeConfirm.taskIds || []).includes(id)) clearConfirm('resolved');
}
function todayAt(h, m) {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime();
}
function tomorrowAt(h, m) {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}
function localDayStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

// due-time watcher: meow when a to-do comes due, then close the loop —
// a reminder that goes unanswered comes back as chips, twice, then rests
function taskWatcherTick() {
  if (!store) return;
  const now = Date.now();
  const tasks = store.get().tasks || [];
  let changed = false;
  for (const t of tasks) {
    if (t.due && !t.done && !t.remindedAt && t.due <= now) {
      t.remindedAt = now;
      changed = true;
      if (TEST && process.env.FU_DEBUG) console.error('[fu] due-fired', JSON.stringify({ id: t.id, due: t.due }));
      send('remind', { text: 'DUE: ' + t.text.toUpperCase(), kind: 'reminder' });
      pushInbox('due: ' + t.text, 'todo');
    }
  }
  if (changed) { store.set({ tasks }); broadcastSettings(); }
  taskFollowUpTick(now);
}
setIntervalSafe(taskWatcherTick, TEST ? 700 : 15000);

function taskFollowUpTick(now) {
  const s = store.get();
  const fuLog = (why, extra) => {
    if (TEST && process.env.FU_DEBUG) console.error('[fu]', why, JSON.stringify(extra || {}));
  };
  if (!s.followUp || s.followUp.enabled === false) return fuLog('disabled');
  if (activeConfirm || pendingQuestion) return fuLog('busy', { confirm: !!activeConfirm, q: !!pendingQuestion });
  if (now - lastConfirmClosedAt < (TEST ? 2000 : 60000)) return fuLog('breathing', { since: now - lastConfirmClosedAt });
  if (now - lastActivityT > 90000) return fuLog('inactive');
  if (!catWin || catWin.isDestroyed() || !catWin.isVisible()) return fuLog('hidden');
  const delay = (s.followUp.minutes || 30) * 60000;                   // never TEST-shortened; tests rewind clocks
  const cand = (s.tasks || [])
    .filter((t) => t.remindedAt && !t.done && (t.followUps || 0) < 2)
    .sort((a, b) => a.remindedAt - b.remindedAt)[0];
  if (!cand) return fuLog('no candidate', { tasks: (s.tasks || []).length });
  const since = now - (cand.lastFollowUpAt || cand.remindedAt);
  if (since < delay) return fuLog('too soon', { id: cand.id, since });
  if (since > 6 * 3600000) {
    // overnight/asleep: retire silently — stays amber in the menu
    patchTask(cand.id, { followUps: 2, lastFollowUpAt: now });
    return;
  }
  sendTaskFollowUp(cand, now);
}

function sendTaskFollowUp(task, now) {
  const n = (task.followUps || 0) + 1;
  const first = n === 1;
  const hour = new Date(now).getHours();
  const chips = first
    ? [
        { id: 'done', label: 'DONE' },
        { id: 'snooze30', label: '+30M' },
        hour < 17 ? { id: 'tonight', label: 'TONIGHT' } : { id: 'tomorrow', label: 'TOMORROW' },
        { id: 'drop', label: 'DROP' },
      ]
    : [
        { id: 'done', label: 'DONE' },
        { id: 'tomorrow', label: 'TOMORROW' },
        { id: 'drop', label: 'DROP' },
      ];
  const cid = showConfirm({
    kind: 'followup',
    title: first ? 'YOUR NOTE' : 'NO RUSH',
    text: first ? task.text : task.text + ' — TOMORROW?',
    chips,
    autoConfirmMs: null,
    taskIds: [task.id],
    onChip: (id) => handleFollowUpChip(task.id, id),
    onDismiss: () => {}, // the nudge was counted; next one (or rest) comes naturally
  });
  if (cid) patchTask(task.id, { followUps: n, lastFollowUpAt: now });
}

function handleFollowUpChip(taskId, chipId) {
  const t = (store.get().tasks || []).find((x) => x.id === taskId);
  if (!t) return;
  if (chipId === 'done') {
    toggleTask(taskId);
    send('remind', { text: 'NICE ONE!', kind: 'say' });
  } else if (chipId === 'snooze30') {
    snoozeTask(taskId, 30 * 60000);
    send('remind', { text: 'BACK IN 30M!', kind: 'say' });
  } else if (chipId === 'tonight') {
    rescheduleTask(taskId, todayAt(18, 0));
    send('remind', { text: 'TONIGHT AT 6PM!', kind: 'say' });
  } else if (chipId === 'tomorrow') {
    rescheduleTask(taskId, tomorrowAt(9, 0));
    send('remind', { text: 'TOMORROW 9AM!', kind: 'say' });
  } else if (chipId === 'drop') {
    dropTask(taskId); // silent melt; the inbox keeps the trail
  }
}

function murmurAppPath() {
  return String(store.get().launcher.murmurApp || '').replace(/^~/, os.homedir());
}

function triggerVoice() {
  if (TEST) { askCalls.push({ menuAction: 'voice' }); return; }
  if (!murmurAppPath()) {
    send('remind', { text: 'NO DICTATION APP SET — SETTINGS → LAUNCHER', kind: 'say' });
    return;
  }
  execFile('pgrep', ['-f', 'MurmurApp|Murmur.app'], (err) => {
    if (err) {
      // not running: launch it, tell the user to retry in a moment
      execFile('open', ['-a', murmurAppPath()], () => {});
      send('remind', { text: 'STARTING MURMUR - TRY AGAIN IN A SEC', kind: 'say' });
    } else {
      // toggle dictation via Murmur's global shortcut (ctrl+option+T)
      execFile('osascript', ['-e',
        'tell application "System Events" to key code 17 using {control down, option down}',
      ], (e) => {
        if (e) send('remind', { text: 'COULD NOT TRIGGER MURMUR', kind: 'say' });
      });
    }
  });
}

function runMenuAction(act) {
  if (!act || typeof act !== 'object') return;
  switch (act.type) {
    case 'talk':
      if (TEST) { askCalls.push({ menuAction: 'talk' }); break; }
      voiceToggle('menu');
      break;
    case 'voice':
      triggerVoice();
      break;
    case 'app': {
      const name = String(act.app || '').slice(0, 80);
      if (!name) return;
      if (TEST) { askCalls.push({ menuAction: 'app', app: name }); return; }
      execFile('open', ['-a', name], (e) => {
        if (e) send('remind', { text: 'COULD NOT OPEN ' + name.toUpperCase(), kind: 'say' });
      });
      break;
    }
    case 'settings': openSettings(); break;
    case 'stretch': send('stretch-now', {}); break;
    case 'hide': toggleCat(); break;
    case 'quit': app.isQuitting = true; app.quit(); break;
  }
}

function setupLauncherIpc() {
  ipcMain.on('menu:action', (e, act) => runMenuAction(act));
  ipcMain.on('tasks:toggle', (e, { id }) => toggleTask(id));
  ipcMain.on('tasks:clear-done', () => {
    store.set({ tasks: (store.get().tasks || []).filter((t) => !t.done) });
    broadcastSettings();
  });
  ipcMain.on('tasks:add', (e, { text }) => { if (text) addTask(text); });
  ipcMain.on('tasks:snooze', (e, { id }) => snoozeTask(id, 10 * 60000));
  ipcMain.on('win:focusable', (e, v) => {
    if (!catWin || catWin.isDestroyed()) return;
    catWin.setFocusable(!!v);
    if (v) catWin.focus();
  });
  ipcMain.handle('inbox:get', () => inbox);
  ipcMain.on('inbox:clear', () => clearInbox());
  ipcMain.handle('bond:get', () => ({ ...bond(), level: bondLevel(bond().xp) }));
  ipcMain.on('bond:event', (e, { type }) => {
    if (['pet', 'boop', 'checkin'].includes(type)) bondEvent(type);
  });
}

// pixelpaw:// deep links — Shortcuts, Raycast, browsers, any app
function handleDeepLink(url) {
  let u;
  try { u = new URL(String(url)); } catch { return { ok: false, error: 'bad url' }; }
  if (u.protocol !== 'pixelpaw:') return { ok: false, error: 'wrong scheme' };
  const cmd = (u.hostname || u.pathname.replace(/^\/+/, '')).toLowerCase();
  const text = (u.searchParams.get('text') || '').slice(0, 120);
  switch (cmd) {
    case 'say':
      if (text) { send('remind', { text, kind: 'say' }); pushInbox(text, 'say'); }
      return { ok: true, cmd };
    case 'todo':
      if (text) { addTask(text); send('remind', { text: 'TODO: ' + text.toUpperCase(), kind: 'say' }); }
      return { ok: true, cmd };
    case 'menu':
      if (catWin && !catWin.isDestroyed() && !catWin.isVisible()) catWin.show();
      send('menu:toggle', {});
      return { ok: true, cmd };
    case 'show':
      if (!catWin || catWin.isDestroyed()) createCatWindow(); else catWin.show();
      updateTray();
      return { ok: true, cmd };
    case 'hide':
      if (catWin && !catWin.isDestroyed()) catWin.hide();
      updateTray();
      return { ok: true, cmd };
    case 'agent': {
      const state = (u.searchParams.get('state') || '').toLowerCase();
      if (!['thinking', 'done', 'alert', 'idle'].includes(state)) return { ok: false, error: 'bad state' };
      const label = agentLabel(u.searchParams.get('agent') || 'agent');
      const key = 'x:' + label;
      if (state === 'thinking') sessionUpsert(key, { agent: label, state: 'thinking', thinkingSince: Date.now() });
      else if (state === 'done') agentDone(key, label);
      else if (state === 'alert') { sessionUpsert(key, { agent: label, state: 'alert' }); send('agent-alert', { agent: label, message: text || `${label} NEEDS YOU!` }); }
      else { sessions.delete(key); emitAgents(); }
      return { ok: true, cmd };
    }
    case 'pom': {
      const action = (u.searchParams.get('action') || u.pathname.replace(/^\/+/, '') || '').toLowerCase();
      if (['start', 'toggle-pause', 'skip', 'stop'].includes(action)) { pomControl(action); return { ok: true, cmd }; }
      return { ok: false, error: 'bad action' };
    }
    case 'voice': {
      if (text && voice.phase === 'idle') {
        handleVoiceTranscript(text.slice(0, 400), 'url').catch(() => voiceReset());
        return { ok: true, cmd };
      }
      voiceToggle('url');
      return { ok: true, cmd };
    }
  }
  return { ok: false, error: 'unknown command' };
}

function registerHotkey() {
  globalShortcut.unregisterAll();
  if (HARNESS) return;
  const s = store.get();
  if (s.launcher.hotkey) {
    try {
      globalShortcut.register('Control+Alt+C', () => {
        if (!catWin || catWin.isDestroyed()) createCatWindow();
        else if (!catWin.isVisible()) catWin.show();
        send('menu:toggle', {});
      });
    } catch (e) {
      console.error('[hotkey]', e.message);
    }
  }
  if (s.voice && s.voice.enabled !== false && s.voice.hotkey !== false) {
    try {
      const ok = globalShortcut.register('Control+Alt+Space', () => voiceToggle('hotkey'));
      if (!ok) globalShortcut.register('Control+Alt+V', () => voiceToggle('hotkey'));
    } catch (e) {
      console.error('[hotkey voice]', e.message);
    }
  }
}

// ----------------------------------------------------- answer routing (ask)
async function focusQuestionWindow(q, alsoType, answerIndex) {
  if (TEST) {
    askCalls.push({ qid: q.qid, index: answerIndex, typed: !!alsoType });
    return { located: true, app: 'TEST', typed: !!alsoType };
  }
  const loc = await focusTty(q.tty);
  let typed = false;
  if (loc.located && alsoType && store.get().agent.autoType !== false) {
    const r = await typeKeys(String(answerIndex + 1));
    typed = r.ok;
  }
  return { located: loc.located, app: loc.app, typed };
}

function setupAskIpc() {
  ipcMain.on('ask:answer', async (e, { qid, index }) => {
    const q = pendingQuestion;
    if (!q || q.qid !== qid || !q.canType) return;
    if (index < 0 || index >= q.options.length) return;
    const r = await focusQuestionWindow(q, true, index);
    send('ask-result', { qid, ...r });
  });
  ipcMain.on('ask:open', async (e, { qid }) => {
    const q = pendingQuestion;
    if (!q || q.qid !== qid) return;
    const r = await focusQuestionWindow(q, false, 0);
    send('ask-result', { qid, ...r });
  });
  ipcMain.on('ask:dismiss', (e, { qid }) => clearQuestion(qid));
  ipcMain.on('led:click', async () => {
    // jump to the most relevant session: question > alert > newest working
    let target = null;
    for (const s of sessions.values()) {
      if (s.hasQuestion) { target = s; break; }
      if (s.state === 'alert' && (!target || target.state !== 'alert')) target = s;
      else if (s.state === 'thinking' && !target) target = s;
    }
    if (!target || !target.tty) return;
    if (TEST) { askCalls.push({ led: true, tty: target.tty }); return; }
    await focusTty(target.tty);
  });
  ipcMain.on('ask:test', () => {
    pendingQuestion = {
      qid: 'test:' + Date.now(), sessionKey: 'test', agent: 'CLAUDE',
      header: 'Approach', question: 'Which approach should we take for the demo?',
      options: ['Quick prototype', 'Proper fix with tests'], multiSelect: false,
      extraQuestions: 0, canType: false, tty: null,
    };
    send('ask', { ...pendingQuestion });
  });
}

// ---------------------------------------------------- confirm chips (shared)
// One panel serves voice confirmations, todo follow-ups and wind-down.
// One at a time: ambient kinds refuse while anything else needs the user;
// user-initiated (voice) kinds preempt ambient ones.
let activeConfirm = null; // {cid, kind, taskIds, onChip, onDismiss, expireTimer}
let lastConfirmClosedAt = 0;
const AMBIENT_CONFIRM = { followup: 1, winddown: 1 };

function showConfirm({ kind, title, text, chips, autoConfirmMs = null, taskIds = [], onChip, onDismiss }) {
  if (AMBIENT_CONFIRM[kind] && (activeConfirm || pendingQuestion)) return null;
  if (activeConfirm) clearConfirm('preempted');
  const cid = 'c' + Date.now() + Math.floor(Math.random() * 999);
  activeConfirm = {
    cid, kind, taskIds, onChip, onDismiss,
    expireTimer: setTimeout(() => clearConfirm('expired'), TEST ? 15000 : 60000),
  };
  send('confirm', { cid, kind, title, text, chips, autoConfirmMs });
  return cid;
}

function clearConfirm(reason) {
  if (!activeConfirm) return;
  const c = activeConfirm;
  activeConfirm = null;
  clearTimeout(c.expireTimer);
  lastConfirmClosedAt = Date.now();
  send('confirm-clear', { cid: c.cid });
  if (c.onDismiss) { try { c.onDismiss(reason); } catch (e) { console.error('[confirm]', e); } }
}

function setupConfirmIpc() {
  ipcMain.on('confirm:action', (e, { cid, id }) => {
    if (!activeConfirm || activeConfirm.cid !== cid) return; // idempotent: first wins
    const c = activeConfirm;
    activeConfirm = null;
    clearTimeout(c.expireTimer);
    lastConfirmClosedAt = Date.now();
    send('confirm-clear', { cid });
    if (c.onChip) { try { c.onChip(String(id)); } catch (err) { console.error('[confirm]', err); } }
  });
  ipcMain.on('confirm:dismiss', (e, { cid, reason }) => {
    if (!activeConfirm || activeConfirm.cid !== cid) return;
    clearConfirm(reason || 'dismissed');
  });
}

// --------------------------------------------------------------- voice spine
// utterance → brain route → confirm chips → action. Main owns the phases;
// the renderer records audio and mirrors state for visuals.
const voice = {
  phase: 'idle', // idle | listening | transcribing | routing | confirm
  vid: null, transcript: null, route: null, undo: null, watchdog: null,
};

function voiceUsageRoll() {
  const u = store.get().voiceUsage || { day: null, calls: 0, costUsd: 0 };
  const day = localDayStr(new Date());
  if (u.day !== day) {
    const fresh = { day, calls: 0, costUsd: 0 };
    store.set({ voiceUsage: fresh });
    return fresh;
  }
  return u;
}
function brainCapped() {
  return voiceUsageRoll().calls >= (store.get().voice.dailyBrainCap || 150);
}
function brainSpent(route) {
  if (!route || route.source !== 'llm') return;
  const u = voiceUsageRoll();
  store.set({ voiceUsage: { day: u.day, calls: u.calls + 1, costUsd: +(u.costUsd + (route._cost || 0)).toFixed(4) } });
}

function voiceReset() {
  clearTimeout(voice.watchdog);
  voice.watchdog = null;
  voice.phase = 'idle';
  voice.vid = null;
  voice.transcript = null;
  voice.route = null;
  send('voice:state', { phase: 'idle' });
}

async function handleVoiceTranscript(text, source) {
  voice.phase = 'routing';
  send('voice:state', { phase: 'routing' });
  let route;
  try {
    route = await brain.classify(text, { test: !!TEST, capped: brainCapped() });
  } catch (e) {
    route = brain.classifyFallback(text);
  }
  brainSpent(route);
  voice.transcript = text;
  return dispatchRoute(route, text);
}

function dispatchRoute(route, transcript) {
  voice.route = route;
  if (route.intent === 'quick_answer' && route.answer) {
    send('remind', { text: String(route.answer).toUpperCase().slice(0, 120), kind: 'say' });
    pushInbox('Q: ' + transcript + ' → ' + route.answer, 'answer');
    voiceReset();
    return { intent: route.intent, route };
  }
  if (route.degraded) {
    // a question with no brain online: capture honestly instead of guessing
    if (!TEST) clipboard.writeText(transcript);
    pushInbox(transcript, 'captured');
    send('remind', { text: 'BRAIN OFFLINE — CAPTURED', kind: 'say' });
    voiceReset();
    return { intent: 'captured', route };
  }
  buildConfirm(route);
  return { intent: route.intent, route };
}

function buildConfirm(route) {
  if (route.intent === 'ask_agent') return buildAgentConfirm(route);
  voice.phase = 'confirm';
  send('voice:state', { phase: 'confirm' });
  const auto = store.get().voice.autoConfirmMs;
  const spec = {
    todo: { title: 'ADD TO-DO?', text: route.text + (route.due ? ' @ ' + route.due : ''), ok: 'ADD' },
    note: { title: 'SAVE NOTE?', text: route.text, ok: 'SAVE' },
    open_app: { title: 'OPEN ' + String(route.app || '').toUpperCase() + '?', text: route.app || '', ok: 'OPEN' },
    other: { title: 'CAPTURE?', text: route.text, ok: 'SAVE' },
  }[route.intent] || { title: 'CAPTURE?', text: route.text, ok: 'SAVE' };
  showConfirm({
    kind: 'voice',
    title: spec.title,
    text: spec.text,
    chips: [{ id: 'confirm', label: spec.ok }, { id: 'cancel', label: 'CANCEL' }],
    autoConfirmMs: auto == null ? 3000 : auto,
    onChip: (id) => {
      if (id === 'confirm') executeIntent(route);
      else voiceReset();
    },
    onDismiss: () => { if (voice.phase === 'confirm') voiceReset(); },
  });
}

function notesDirPath() {
  return String(store.get().voice.notesDir || '~/notes').replace(/^~/, os.homedir());
}

function appendNote(text) {
  try {
    const dir = notesDirPath();
    fs.mkdirSync(dir, { recursive: true });
    const day = localDayStr(new Date());
    const p = path.join(dir, day + '.md');
    if (!fs.existsSync(p)) fs.writeFileSync(p, '# Notes — ' + day + '\n\n');
    const prevSize = fs.statSync(p).size;
    const d = new Date();
    const stamp = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    fs.appendFileSync(p, '- [' + stamp + '] ' + text + '\n');
    return { ok: true, path: p, prevSize };
  } catch (e) {
    console.error('[notes]', e.message);
    return { ok: false, error: e.message };
  }
}

function executeIntent(route, sessionKey) {
  let undo = null;
  let message = '';
  try {
    if (route.intent === 'todo') {
      const r = addTask(route.due ? route.text + ' @ ' + route.due : route.text);
      undo = { kind: 'todo', payload: { id: r.id } };
      message = 'ADDED — TAP TO UNDO';
    } else if (route.intent === 'note') {
      const r = appendNote(route.text);
      if (r.ok) {
        undo = { kind: 'note', payload: { path: r.path, prevSize: r.prevSize } };
        message = 'NOTED — TAP TO UNDO';
      } else {
        if (!TEST) clipboard.writeText(route.text);
        pushInbox(route.text, 'captured');
        message = 'COULD NOT WRITE NOTE — CAPTURED';
      }
    } else if (route.intent === 'open_app') {
      if (TEST) askCalls.push({ voiceOpen: route.app });
      else {
        execFile('open', ['-a', route.app], (e) => {
          if (e) send('remind', { text: 'COULD NOT OPEN ' + String(route.app).toUpperCase(), kind: 'say' });
        });
      }
      message = 'OPENING ' + String(route.app).toUpperCase();
    } else if (route.intent === 'ask_agent') {
      return executeAgentCommand(route, sessionKey);
    } else {
      const prevClip = TEST ? '' : clipboard.readText();
      if (!TEST) clipboard.writeText(route.text);
      pushInbox(route.text, 'captured');
      undo = { kind: 'clip', payload: { prevClip } };
      message = 'CAPTURED TO CLIPBOARD';
    }
  } catch (e) {
    console.error('[voice]', e);
    pushInbox('voice error: ' + e.message, 'say');
    message = 'SOMETHING SLIPPED — CHECK INBOX';
  }
  finishIntent(message, undo);
}

function finishIntent(message, undo) {
  let undoToken = null;
  if (undo) {
    undoToken = 'u' + Date.now() + Math.floor(Math.random() * 999);
    voice.undo = { token: undoToken, ...undo, expiresAt: Date.now() + 12000 };
  }
  send('voice:done', { message, undoToken, undoMs: 8000 });
  voiceReset();
}

function liveAgentSessions() {
  return [...sessions.entries()]
    .filter(([, s]) => s.tty)
    .map(([key, s]) => ({ key, agent: s.agent || 'agent', tty: s.tty, cwd: s.cwd || '' }));
}

function buildAgentConfirm(route) {
  const capture = (msg) => {
    if (!TEST) clipboard.writeText(route.agent || '');
    pushInbox(route.agent || '', 'captured');
    send('remind', { text: msg, kind: 'say' });
    voiceReset();
  };
  if (!route.agent) return capture('HEARD NO COMMAND — CAPTURED');
  if (store.get().voice.agentCommands === false) return capture('AGENT COMMANDS OFF — CAPTURED');
  const live = liveAgentSessions();
  if (!live.length) return capture('NO LIVE AGENT — CAPTURED');

  voice.phase = 'confirm';
  send('voice:state', { phase: 'confirm' });
  const common = {
    kind: 'voice',
    text: route.agent,
    autoConfirmMs: null, // typing into a terminal ALWAYS needs a click
    onDismiss: () => { if (voice.phase === 'confirm') voiceReset(); },
  };
  if (live.length === 1) {
    const s = live[0];
    showConfirm({
      ...common,
      title: 'TYPE INTO ' + (s.agent + '@' + s.tty).toUpperCase() + '?',
      chips: [{ id: 'confirm', label: 'TYPE IT' }, { id: 'cancel', label: 'CANCEL' }],
      onChip: (id) => { if (id === 'confirm') executeAgentCommand(route, s.key); else voiceReset(); },
    });
  } else {
    showConfirm({
      ...common,
      title: 'WHICH SESSION?',
      chips: [
        ...live.slice(0, 3).map((s) => ({ id: 'session:' + s.key, label: (s.agent + '@' + s.tty).toUpperCase() })),
        { id: 'cancel', label: 'CANCEL' },
      ],
      onChip: (id) => {
        if (id.startsWith('session:')) executeAgentCommand(route, id.slice(8));
        else voiceReset();
      },
    });
  }
}

async function executeAgentCommand(route, sessionKey) {
  const s = sessions.get(sessionKey);
  const capture = (msg) => {
    if (!TEST) clipboard.writeText(route.agent || '');
    pushInbox(route.agent || '', 'captured');
    finishIntent(msg, null);
  };
  if (!s || !s.tty) return capture('SESSION GONE — CAPTURED');
  const enter = store.get().voice.agentEnter === true;
  if (TEST) {
    askCalls.push({ voiceType: { tty: s.tty, text: route.agent, enter } });
    finishIntent('TYPED INTO TEST', null);
    return;
  }
  const loc = await focusTty(s.tty);
  if (!loc.located) return capture('WINDOW NOT FOUND — CAPTURED');
  const r = await typeText(route.agent, { pressEnter: enter });
  finishIntent(r.ok
    ? (enter ? 'SENT TO ' + loc.app.toUpperCase() : 'TYPED — REVIEW & HIT ENTER')
    : 'TYPING FAILED', null);
}

// entry for hotkey / menu / API / deep link — toggle semantics
let lastVoiceToggleT = 0;
async function voiceToggle(source) {
  const s = store.get();
  if (!s.voice || s.voice.enabled === false) return { ok: false, error: 'disabled' };
  const nowT = Date.now();
  if (nowT - lastVoiceToggleT < 250) return { ok: false, error: 'debounce' };
  lastVoiceToggleT = nowT;
  if (voice.phase === 'listening') {
    send('voice:capture', { cmd: 'stop', vid: voice.vid });
    return { ok: true, phase: 'stopping' };
  }
  if (voice.phase === 'confirm') {
    clearConfirm('cancelled');
    voiceReset();
    return { ok: true, phase: 'cancelled' };
  }
  if (voice.phase !== 'idle') return { ok: false, error: 'busy' };
  if (TEST) return { ok: false, error: 'no mic in test' };
  if (!catWin || catWin.isDestroyed()) createCatWindow();
  else if (!catWin.isVisible()) catWin.show();
  try {
    const status = systemPreferences.getMediaAccessStatus('microphone');
    if (status !== 'granted') {
      const granted = await systemPreferences.askForMediaAccess('microphone');
      if (!granted) {
        send('remind', { text: 'MIC BLOCKED — SYSTEM SETTINGS → PRIVACY → MICROPHONE', kind: 'say' });
        return { ok: false, error: 'mic denied' };
      }
    }
  } catch (e) {
    console.error('[voice mic]', e.message);
  }
  voice.phase = 'listening';
  voice.vid = 'v' + Date.now();
  const maxMs = Math.max(5, Math.min(30, s.voice.maxRecordS || 15)) * 1000;
  send('voice:capture', { cmd: 'start', vid: voice.vid, maxMs, silenceMs: 1200 });
  send('voice:state', { phase: 'listening', vid: voice.vid, maxMs });
  clearTimeout(voice.watchdog);
  voice.watchdog = setTimeout(() => {
    if (voice.phase === 'listening') send('voice:capture', { cmd: 'stop', vid: voice.vid });
  }, maxMs + 2000);
  return { ok: true, phase: 'listening' };
}

function setupVoiceIpc() {
  ipcMain.on('voice:toggle', (e, { source }) => { voiceToggle(source || 'renderer'); });
  ipcMain.on('voice:cancel', (e, { vid }) => {
    if (voice.phase === 'listening' && vid === voice.vid) {
      send('voice:capture', { cmd: 'cancel', vid });
      voiceReset();
    }
  });
  ipcMain.on('voice:capture-state', (e, { vid, ok, error }) => {
    if (vid !== voice.vid) return;
    if (!ok) {
      send('remind', {
        text: error === 'NotAllowedError'
          ? 'MIC BLOCKED — SYSTEM SETTINGS → PRIVACY → MICROPHONE'
          : 'NO MICROPHONE FOUND',
        kind: 'say',
      });
      voiceReset();
    }
  });
  ipcMain.handle('voice:audio', async (e, { vid, wav, durationS, speechSeen }) => {
    if (vid !== voice.vid || voice.phase !== 'listening') return { ok: false, error: 'stale' };
    clearTimeout(voice.watchdog);
    if (!speechSeen || !wav || (durationS || 0) < 0.4) {
      send('remind', { text: 'HEARD NOTHING', kind: 'say' });
      voiceReset();
      return { ok: true, heard: false };
    }
    voice.phase = 'transcribing';
    send('voice:state', { phase: 'transcribing' });
    const r = await transcribeLib.transcribe(Buffer.from(wav), store.get().voice);
    if (!r.ok) {
      pushInbox('transcriber offline: ' + (r.error || ''), 'say');
      send('remind', { text: 'TRANSCRIBER OFFLINE', kind: 'say' });
      voiceReset();
      return { ok: false, error: r.error };
    }
    if (r.noSpeech) {
      send('remind', { text: 'HEARD NOTHING', kind: 'say' });
      voiceReset();
      return { ok: true, heard: false };
    }
    await handleVoiceTranscript(r.text, 'mic');
    return { ok: true, heard: true, text: r.text };
  });
  ipcMain.handle('voice:status', () => ({
    availability: { ...brain.availability(), ...transcribeLib.availability(store.get().voice) },
    usage: voiceUsageRoll(),
  }));
  ipcMain.on('voice:undo', (e, { token }) => {
    const u = voice.undo;
    if (!u || u.token !== token || Date.now() > u.expiresAt) return;
    voice.undo = null;
    try {
      if (u.kind === 'todo') {
        store.set({ tasks: (store.get().tasks || []).filter((t) => t.id !== u.payload.id) });
        broadcastSettings();
      } else if (u.kind === 'note') {
        fs.truncateSync(u.payload.path, u.payload.prevSize);
      } else if (u.kind === 'clip') {
        if (!TEST) clipboard.writeText(u.payload.prevClip || '');
      }
      send('remind', { text: 'UNDONE', kind: 'say' });
    } catch (err) {
      console.error('[voice undo]', err);
    }
  });
}

// ------------------------------------------------------------------- tray
function fmtTime(sec) {
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}

function updateTray() {
  if (!tray) return;
  if (process.platform === 'darwin') {
    tray.setTitle(pom.phase === 'off' ? '' : ` ${pom.paused ? '⏸' : ''}${fmtTime(pom.remaining)}`);
  }
  const visible = catWin && !catWin.isDestroyed() && catWin.isVisible();
  const menu = Menu.buildFromTemplate([
    { label: visible ? 'Hide Cat' : 'Show Cat', click: () => toggleCat() },
    { type: 'separator' },
    {
      label: 'Pomodoro',
      submenu: [
        {
          label: pom.phase === 'off' ? 'Not running'
            : `${pom.phase === 'focus' ? 'Focus' : pom.phase === 'long' ? 'Long break' : 'Break'} — ${fmtTime(pom.remaining)}${pom.paused ? ' (paused)' : ''}`,
          enabled: false,
        },
        { type: 'separator' },
        { label: 'Start Focus', enabled: pom.phase === 'off', click: () => pomControl('start') },
        { label: pom.paused ? 'Resume' : 'Pause', enabled: pom.phase !== 'off', click: () => pomControl('toggle-pause') },
        { label: 'Skip Phase', enabled: pom.phase !== 'off', click: () => pomControl('skip') },
        { label: 'Stop', enabled: pom.phase !== 'off', click: () => pomControl('stop') },
      ],
    },
    { label: 'Stretch Now', click: () => send('stretch-now', {}) },
    { label: 'Reset Cat Position', click: () => resetPosition() },
    { type: 'separator' },
    { label: 'Settings…', click: () => openSettings() },
    { type: 'separator' },
    { label: 'Quit PixelPaw', click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

function toggleCat() {
  if (!catWin || catWin.isDestroyed()) { createCatWindow(); updateTray(); return; }
  if (catWin.isVisible()) { catWin.hide(); notifyHidden(); } else catWin.show();
  updateTray();
}

function notifyHidden() {
  if (TEST || HARNESS || !Notification.isSupported()) return;
  const s = store.get();
  const name = s.catName || 'Your cat';
  try {
    new Notification({
      title: `${name} is hiding`,
      body: s.launcher.hotkey
        ? 'Press ⌃⌥C to bring the cat back — or click the cat icon in the menu bar and choose Show Cat.'
        : 'Click the cat icon in the menu bar and choose Show Cat to bring the cat back.',
      silent: true,
    }).show();
  } catch (e) {
    console.error('[notify]', e.message);
  }
}

function resetPosition() {
  const p = defaultPosition();
  if (catWin && !catWin.isDestroyed()) {
    catWin.setPosition(p.x, p.y);
    if (!catWin.isVisible()) catWin.show();
  }
  store.set({ position: p });
  updateTray();
}

// -------------------------------------------------------------------- ipc
function setupIpc() {
  ipcMain.handle('settings:get', () => store.get());
  ipcMain.handle('settings:set', (e, partial) => {
    store.set(partial);
    const s = store.get();
    if ('openAtLogin' in partial) {
      try { app.setLoginItemSettings({ openAtLogin: !!s.openAtLogin }); } catch (err) { console.error(err); }
    }
    if (partial.stretch) lastStretchT = Date.now();
    if (partial.launcher || partial.voice) registerHotkey();
    broadcastSettings();
    return s;
  });
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    agentPort,
    uiohookOk,
    accessibility: process.platform !== 'darwin' || systemPreferences.isTrustedAccessibilityClient(false),
  }));
  ipcMain.handle('perm:request-accessibility', () => {
    if (process.platform === 'darwin') return systemPreferences.isTrustedAccessibilityClient(true);
    return true;
  });
  ipcMain.handle('hooks:status', () => claudeHooks.status(agentPort || store.get().agent.port));
  ipcMain.handle('hooks:install', () => {
    try { return { ok: true, ...claudeHooks.install(agentPort || store.get().agent.port) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('hooks:uninstall', () => {
    try { return { ok: true, ...claudeHooks.uninstall(agentPort || store.get().agent.port) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('hooks:snippet', () => claudeHooks.snippet(agentPort || store.get().agent.port));
  ipcMain.handle('codex:status', () => codexHooks.status(agentPort || store.get().agent.port));
  ipcMain.handle('codex:install', () => {
    try { return { ok: true, ...codexHooks.install(agentPort || store.get().agent.port) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });
  ipcMain.handle('codex:uninstall', () => {
    try { return { ok: true, ...codexHooks.uninstall(agentPort || store.get().agent.port) }; }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.on('cat:set-interactive', (e, interactive) => {
    if (!catWin || catWin.isDestroyed()) return;
    if (interactive) catWin.setIgnoreMouseEvents(false);
    else catWin.setIgnoreMouseEvents(true, { forward: true });
  });
  ipcMain.on('cat:drag-start', (e, { ox, oy }) => {
    if (!catWin) return;
    const cur = screen.getCursorScreenPoint();
    drag = { ox, oy, lastX: cur.x, lastY: cur.y };
    if (hunt.phase !== 'none') { hunt.phase = 'none'; }
    send('drag', { phase: 'start' });
  });
  ipcMain.on('cat:drag-end', () => {
    if (!drag) return;
    drag = null;
    const b = catWin.getBounds();
    const p = clampToWorkArea(b.x, b.y);
    catWin.setPosition(p.x, p.y);
    persistPosition();
    send('drag', { phase: 'end' });
  });
  ipcMain.on('cat:context-menu', () => {
    if (!catWin) return;
    const menu = Menu.buildFromTemplate([
      { label: 'Settings…', click: () => openSettings() },
      { type: 'separator' },
      pom.phase === 'off'
        ? { label: 'Start Pomodoro', click: () => pomControl('start') }
        : { label: pom.paused ? 'Resume Pomodoro' : 'Pause Pomodoro', click: () => pomControl('toggle-pause') },
      { label: 'Stretch Now', click: () => send('stretch-now', {}) },
      { type: 'separator' },
      { label: 'Hide Cat', click: () => toggleCat() },
      { label: 'Quit PixelPaw', click: () => { app.isQuitting = true; app.quit(); } },
    ]);
    menu.popup({ window: catWin });
  });
  ipcMain.on('pom:control', (e, action) => pomControl(action));
  ipcMain.on('open-settings', () => openSettings());
  ipcMain.on('cat:meow-test', () => send('remind', { text: 'MEOW!', kind: 'say' }));
}

// ------------------------------------------------------------------ boot
app.whenReady().then(() => {
  store = new Store(app.getPath('userData'));
  inbox.push(...(store.get().inboxLog || []).slice(0, 30)); // survive restarts
  if (process.platform === 'darwin' && !HARNESS) app.dock.hide();

  setupIpc();
  setupAskIpc();
  setupConfirmIpc();
  setupVoiceIpc();
  setupLauncherIpc();
  createCatWindow();
  startAgentServer();
  setupUiohook();
  registerHotkey();

  tray = new Tray(buildTrayIcon());
  tray.setToolTip('PixelPaw — your desktop cat');
  updateTray();

  // wake-from-sleep: check for a return-from-away promptly (resume itself
  // is not activity; the digest waits for the first real input)
  try {
    require('electron').powerMonitor.on('resume', () => checkAwayReturn());
  } catch (e) { console.error('[powerMonitor]', e.message); }

  if (TEST) {
    // deterministic synthetic ticks instead of real cursor polling
    const testTick = { cursor: { x: WIN_W / 2, y: 60 }, vel: 0, idleSec: 0, dragging: false, huntPhase: 'none', test: true };
    setInterval(() => { lastActivityT = Date.now(); send('tick', testTick); }, 32);
    catWin.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const { runScenarios } = require('./tools/scenarios');
        let failed = 1;
        try {
          failed = await runScenarios({
            dir: TEST,
            catWin,
            send,
            store,
            pomControl,
            broadcastSettings,
            setTick: (partial) => Object.assign(testTick, partial),
            debug: () => catWin.webContents.executeJavaScript('window.__catDebug()'),
            mouse: (ev) => catWin.webContents.sendInputEvent(ev),
            port: () => agentPort,
            askCalls,
          });
        } catch (e) {
          console.error('TEST RUNNER CRASH:', e);
        }
        app.exit(failed ? 1 : 0);
      }, 1000);
    });
  } else {
    setInterval(pollLoop, 16);
  }

  if (SHOT) {
    const fs = require('fs');
    fs.mkdirSync(SHOT, { recursive: true });
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const cap = async (name) => {
      const img = await catWin.webContents.capturePage();
      fs.writeFileSync(path.join(SHOT, name + '.png'), img.toPNG());
    };
    setTimeout(async () => {
      try {
        await cap('1-idle');
        sessionUpsert('shot', { agent: 'claude', state: 'thinking', thinkingSince: Date.now() - 60000 });
        await wait(800); await cap('2-think');
        agentDone('shot', 'CLAUDE');
        await wait(500); await cap('3-celebrate');
        await wait(3500);
        pomControl('start');
        await wait(400); await cap('4-pomodoro');
        send('remind', { text: 'DRINK WATER', kind: 'reminder' });
        await wait(500); await cap('5-bubble');
        pomControl('stop');
        send('stretch-now', {});
        await wait(1500); await cap('6-stretch');
        openSettings();
        await new Promise((r) => setWin.webContents.once('did-finish-load', r));
        await wait(900);
        const simg = await setWin.webContents.capturePage();
        fs.writeFileSync(path.join(SHOT, '7-settings.png'), simg.toPNG());
        console.log('SHOTS DONE ' + SHOT);
      } catch (e) {
        console.error('SHOTS FAIL', e);
      }
      app.exit(0);
    }, 1500);
  }

  if (SMOKE) {
    setTimeout(async () => {
      try {
        const catReady = await catWin.webContents.executeJavaScript('window.__catReady === true');
        openSettings();
        await new Promise((r) => setTimeout(r, 2500));
        const setReady = await setWin.webContents.executeJavaScript('window.__settingsReady === true');
        let health = null;
        if (agentPort) {
          health = await new Promise((resolve) => {
            http.get(`http://127.0.0.1:${agentPort}/health`, (res) => {
              let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve(b));
            }).on('error', () => resolve(null));
          });
        }
        console.log('SMOKE catReady=' + catReady + ' settingsReady=' + setReady + ' health=' + health);
        console.log(catReady && setReady ? 'SMOKE OK' : 'SMOKE FAIL');
      } catch (e) {
        console.log('SMOKE FAIL: ' + e.message);
      }
      app.exit(0);
    }, 3500);
  }
});

app.on('window-all-closed', (e) => {
  // tray app: stay alive
  if (SMOKE) app.quit();
});

app.on('will-quit', () => {
  transcribeLib.cleanupStale(); // stray voice recordings from crashes
});

// pixelpaw:// deep links (registration is a no-op until packaged on some setups)
app.on('open-url', (e, url) => {
  e.preventDefault();
  handleDeepLink(url);
});
try { app.setAsDefaultProtocolClient('pixelpaw'); } catch { /* dev mode */ }

process.on('uncaughtException', (e) => {
  console.error('[uncaught]', e);
  if (SMOKE) { console.log('SMOKE FAIL'); app.exit(1); }
});
