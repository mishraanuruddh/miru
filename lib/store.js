'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  version: 4,
  name: '',
  catName: '',
  skinStyle: 'plain', // plain | tabby | spots
  spriteStyle: 'kawaii', // kawaii | classic
  skin: 'white',
  customColors: null, // {headL,headR,muzzle,innerEar,nose,body,chest,paws,tail,tailTip,iris,pupil}
  pixelOverrides: null, // sparse {"x,y": "#hex"} painted on the front frames
  scale: 4,
  openAtLogin: false,
  reactions: {
    eyeFollow: true,
    hunt: true,
    knead: true,
    overheat: true,
    pet: true,
    scrollPaper: true,
    sleep: true,
  },
  sounds: { enabled: true, volume: 0.5 },
  stretch: { enabled: true, intervalMin: 50 },
  pomodoro: { focusMin: 25, breakMin: 5, longBreakMin: 15, longEvery: 4, loop: true },
  reminders: [], // {id, time:'HH:MM', text, enabled}
  fixedMessage: { enabled: false, text: '' },
  agent: { enabled: true, port: 41999, autoType: true, minCelebrateMs: 5000, muteAgents: [], muteBackground: true },
  launcher: {
    hotkey: true, // Control+Option+C summons the menu
    murmurApp: '', // path to a dictation app to toggle from the menu (optional)
    apps: [
      { label: 'VS CODE', app: 'Visual Studio Code' },
      { label: 'ITERM', app: 'iTerm' },
    ],
  },
  voice: {
    enabled: true,
    hotkey: true, // Control+Option+Space: talk to the cat
    notesDir: '~/notes', // daily files YYYY-MM-DD.md
    autoConfirmMs: 3000,
    maxRecordS: 15,
    murmurCli: '',     // path to a Murmur-style transcription CLI (optional)
    whisperBin: '',    // path to whisper.cpp's whisper-cli (optional; PATH is probed too)
    whisperModel: '',  // path to a ggml whisper model (required for the whisper path)
    engine: 'parakeet-v2',
    agentCommands: true, // allow "tell claude ..." typed commands (always asks first)
    agentEnter: false,   // press Enter after typing into the terminal
    dailyBrainCap: 150,  // claude -p calls per day before falling back
  },
  voiceUsage: { day: null, calls: 0, costUsd: 0 },
  followUp: { enabled: true, minutes: 30 },
  windDown: { enabled: true, time: '18:30' },
  tasks: [], // {id, text, done, due, remindedAt, followUps, lastFollowUpAt}
  inboxLog: [], // {text, t, kind} — recent messages, newest first
  bond: {
    xp: 0,
    adoptedAt: null,
    daysTogether: 0,
    streak: 0,
    bestStreak: 0,
    lastActiveDay: null,
    greetedDay: null,
    windDownDay: null,
    lastSeenAt: null,
    counters: { pets: 0, boops: 0, todosDone: 0, pomodoros: 0, agentRuns: 0, gifts: 0 },
    records: { todosInDay: 0, pomodorosInDay: 0 },
    today: { day: null, todosDone: 0, pomodoros: 0, engagement: 0 },
    gifts: [], // [{id, t}]
    pendingGift: null,
  },
  position: null, // {x,y}
};

function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }

function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  if (!isObj(over) && !Array.isArray(over)) return out;
  for (const k of Object.keys(over)) {
    if (isObj(over[k]) && isObj(base[k])) out[k] = deepMerge(base[k], over[k]);
    else out[k] = over[k];
  }
  return out;
}

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'settings.json');
    this.data = deepMerge(DEFAULTS, {});
    try {
      if (fs.existsSync(this.file)) {
        const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        // v2 briefly doubled the render scale; v3 walks that back — the
        // sticker cat got finer, not bigger
        if (saved.version === 2 && saved.scale >= 6) {
          saved.scale = Math.round(saved.scale / 2);
        }
        // v4: white is the default coat now — carry never-changed profiles over
        if ((saved.version || 1) < 4 && saved.skin === 'black') {
          saved.skin = 'white';
        }
        saved.version = 4;
        this.data = deepMerge(DEFAULTS, saved);
      }
    } catch (e) {
      console.error('[store] failed to load settings, using defaults:', e.message);
    }
    this._saveTimer = null;
  }
  get() { return this.data; }
  set(partial) {
    this.data = deepMerge(this.data, partial);
    // arrays and null-able keys replace wholesale
    if (partial.reminders) this.data.reminders = partial.reminders;
    if ('customColors' in partial) this.data.customColors = partial.customColors;
    if ('pixelOverrides' in partial) this.data.pixelOverrides = partial.pixelOverrides;
    if ('position' in partial) this.data.position = partial.position;
    this.save();
    return this.data;
  }
  save() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
      } catch (e) {
        console.error('[store] save failed:', e.message);
      }
    }, 150);
  }
}

module.exports = { Store, DEFAULTS };
