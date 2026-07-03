'use strict';
/* global Sprites, CatPalette, miru */
(async function () {
  const { framesFor, SKINS, drawCat } = Sprites;
  let FRAMES = framesFor('kawaii');
  const { skinFromImageData, paletteToSkin, capFaceOverrides } = CatPalette;
  let settings = await miru.getSettings();
  FRAMES = framesFor(settings.spriteStyle);
  let info = await miru.appInfo();

  const $ = (id) => document.getElementById(id);
  const save = (partial) => miru.setSettings(partial).then((s) => { settings = s; });

  // ------------------------------------------------------------------ tabs
  document.querySelectorAll('#nav button').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#nav button').forEach((x) => x.classList.remove('active'));
      document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      document.getElementById('tab-' + b.dataset.tab).classList.add('active');
    });
  });

  // ---------------------------------------------------------------- helpers
  function currentSkin() {
    if (settings.skin === 'custom' && settings.customColors) {
      return { ...SKINS.black, ...settings.customColors };
    }
    return SKINS[settings.skin] || SKINS.black;
  }

  function drawCatOn(canvas, skin, frame, px, blink, withOverrides = true) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    const ox = Math.floor((canvas.width - frame.w * px) / 2);
    const oy = canvas.height - frame.h * px - 4;
    drawCat(ctx, frame, skin, px, ox, oy, {
      eye: { style: blink ? 'closed' : 'open', gx: 1, gy: 1 },
      mouth: 'none',
      style: settings.skinStyle || 'plain',
      overrides: withOverrides ? settings.pixelOverrides || null : null,
    });
  }

  // ---------------------------------------------------------------- preview
  const prevCanvas = $('preview');
  let frameIdx = 0;
  setInterval(() => {
    const idleFrames = [FRAMES.sit, FRAMES.sit_tail_mid, FRAMES.sit_tail_up, FRAMES.sit_tail_mid];
    frameIdx = (frameIdx + 1) % idleFrames.length;
    const blink = Math.random() < 0.12;
    drawCatOn(prevCanvas, currentSkin(), idleFrames[frameIdx], 8, blink);
  }, 480);
  drawCatOn(prevCanvas, currentSkin(), FRAMES.sit, 8, false);

  // ------------------------------------------------------------------- cat
  $('name').value = settings.name || '';
  $('name').addEventListener('input', () => save({ name: $('name').value }));
  $('catName').value = settings.catName || '';
  $('catName').addEventListener('input', () => save({ catName: $('catName').value }));

  document.querySelectorAll('#lookSeg button').forEach((b) => {
    b.classList.toggle('active', b.dataset.v === (settings.spriteStyle || 'kawaii'));
    b.addEventListener('click', () => {
      document.querySelectorAll('#lookSeg button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      settings.spriteStyle = b.dataset.v;
      FRAMES = framesFor(settings.spriteStyle);
      save({ spriteStyle: b.dataset.v });
      drawCatOn(prevCanvas, currentSkin(), FRAMES.sit, 8, false);
      drawEditor();
      renderPresets();
    });
  });

  document.querySelectorAll('#styleSeg button').forEach((b) => {
    b.classList.toggle('active', b.dataset.v === (settings.skinStyle || 'plain'));
    b.addEventListener('click', () => {
      document.querySelectorAll('#styleSeg button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      save({ skinStyle: b.dataset.v });
    });
  });

  // ---------------------------------------------------------- photo match
  let lastClusters = null;
  function applyClusters(clusters, forceBodyHex) {
    const skin = paletteToSkin(clusters, { forceBodyHex });
    if (!skin) return;
    const ov = skin._mode === 'cap' ? capFaceOverrides(skin) : null;
    delete skin._mode;
    settings.skin = 'custom';
    settings.customColors = skin;
    settings.pixelOverrides = ov;
    save({ skin: 'custom', customColors: skin, pixelOverrides: ov });
    renderPresets();
    refreshColors();
    renderSwatches(clusters, skin.body);
    renderBrushes();
    drawEditor();
  }
  function renderSwatches(clusters, bodyHex) {
    const el = $('swatches');
    el.innerHTML = '';
    $('swatchHint').style.display = 'block';
    clusters.slice(0, 6).forEach((c) => {
      const d = document.createElement('div');
      d.className = 'preset' + (c.hex === bodyHex ? ' active' : '');
      d.style.padding = '4px';
      const sw = document.createElement('div');
      sw.style.cssText = `width:46px;height:34px;background:${c.hex};border:2px solid #000`;
      d.appendChild(sw);
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = Math.round(c.weight * 100) + '%';
      d.appendChild(nm);
      d.addEventListener('click', () => applyClusters(clusters, c.hex));
      el.appendChild(d);
    });
  }
  $('photoFile').addEventListener('change', () => {
    const f = $('photoFile').files[0];
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(64 / img.width, 64 / img.height, 1);
      const cw = Math.max(8, Math.round(img.width * scale));
      const ch = Math.max(8, Math.round(img.height * scale));
      const cv = document.createElement('canvas');
      cv.width = cw; cv.height = ch;
      const cx = cv.getContext('2d');
      cx.drawImage(img, 0, 0, cw, ch);
      const { clusters } = skinFromImageData(cx.getImageData(0, 0, cw, ch));
      lastClusters = clusters;
      applyClusters(clusters);
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(f);
  });

  document.querySelectorAll('#sizeSeg button').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.v) === settings.scale);
    b.addEventListener('click', () => {
      document.querySelectorAll('#sizeSeg button').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      save({ scale: Number(b.dataset.v) });
    });
  });

  // presets
  const presetsEl = $('presets');
  const presetIds = [...Object.keys(SKINS), 'custom'];
  function renderPresets() {
    presetsEl.innerHTML = '';
    for (const id of presetIds) {
      const div = document.createElement('div');
      div.className = 'preset' + (settings.skin === id ? ' active' : '');
      const cv = document.createElement('canvas');
      cv.width = 66; cv.height = 60;
      div.appendChild(cv);
      const nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = id === 'custom' ? 'CUSTOM' : SKINS[id].label.toUpperCase();
      div.appendChild(nm);
      const skin = id === 'custom'
        ? { ...SKINS.black, ...(settings.customColors || SKINS[settings.skin === 'custom' ? 'black' : settings.skin]) }
        : SKINS[id];
      drawCatOn(cv, skin, FRAMES.sit, 2.5, false, false);
      div.addEventListener('click', () => {
        if (id === 'custom' && !settings.customColors) {
          save({ skin: 'custom', customColors: { ...currentSkin() } }).then(refreshColors);
        } else {
          save({ skin: id }).then(refreshColors);
        }
        settings.skin = id;
        renderPresets();
      });
      presetsEl.appendChild(div);
    }
  }
  renderPresets();

  // custom colors
  const REGION_LABELS = {
    body: 'BODY', headL: 'HEAD LEFT', headR: 'HEAD RIGHT', muzzle: 'MUZZLE',
    chest: 'CHEST', paws: 'PAWS', tail: 'TAIL', tailTip: 'TAIL TIP',
    innerEar: 'INNER EAR', nose: 'NOSE', iris: 'EYES', pupil: 'PUPILS', outline: 'OUTLINE',
    patternColor: 'PATTERN',
  };
  const colorsEl = $('customColors');
  function refreshColors() {
    colorsEl.innerHTML = '';
    const skin = currentSkin();
    for (const [region, label] of Object.entries(REGION_LABELS)) {
      const wrap = document.createElement('label');
      wrap.className = 'color-field';
      const inp = document.createElement('input');
      inp.type = 'color';
      inp.value = skin[region] || '#888888';
      inp.addEventListener('input', () => {
        const colors = { ...currentSkin(), [region]: inp.value };
        delete colors.label;
        settings.skin = 'custom';
        settings.customColors = colors;
        save({ skin: 'custom', customColors: colors });
        renderPresets();
      });
      const sp = document.createElement('span');
      sp.textContent = label;
      wrap.appendChild(inp);
      wrap.appendChild(sp);
      colorsEl.appendChild(wrap);
    }
  }
  refreshColors();

  // ------------------------------------------------------------ pixel editor
  const PIX = 13; // editor cell size
  const editCanvas = $('pixedit');
  const editCtx = editCanvas.getContext('2d');
  let brush = '#867e74';
  let eraser = false;

  function overrides() { return settings.pixelOverrides || {}; }

  function drawEditor() {
    editCtx.clearRect(0, 0, editCanvas.width, editCanvas.height);
    editCtx.imageSmoothingEnabled = false;
    // checker backdrop for transparent cells
    for (let y = 0; y < FRAMES.sit.h; y++) {
      for (let x = 0; x < FRAMES.sit.w; x++) {
        editCtx.fillStyle = (x + y) % 2 ? '#26252e' : '#22212a';
        editCtx.fillRect(x * PIX, y * PIX, PIX, PIX);
      }
    }
    drawCat(editCtx, FRAMES.sit, currentSkin(), PIX, 0, 0, {
      skipFace: true,
      style: settings.skinStyle || 'plain',
      overrides: overrides(),
    });
    // eye sockets marked faintly so markings can be planned around them
    const e = FRAMES.sit.eyes;
    editCtx.strokeStyle = 'rgba(255,212,0,0.5)';
    editCtx.lineWidth = 1;
    for (const k of ['l', 'r']) {
      editCtx.strokeRect(e[k][0] * PIX + 0.5, e[k][1] * PIX + 0.5, e.size * PIX - 1, e.size * PIX - 1);
    }
  }

  function paintAt(ev, erase) {
    const r = editCanvas.getBoundingClientRect();
    const x = Math.floor((ev.clientX - r.left) / PIX);
    const y = Math.floor((ev.clientY - r.top) / PIX);
    if (x < 0 || y < 0 || x >= FRAMES.sit.w || y >= FRAMES.sit.h) return;
    const ch = FRAMES.sit.rows[y][x];
    if (!ch || ch === '.' || ch === 'w') return; // only solid cat pixels
    const ov = { ...overrides() };
    if (erase || eraser) delete ov[`${x},${y}`];
    else ov[`${x},${y}`] = brush;
    settings.pixelOverrides = ov;
    save({ pixelOverrides: ov });
    drawEditor();
    drawCatOn(prevCanvas, currentSkin(), FRAMES.sit, 8, false);
  }

  let painting = false;
  editCanvas.addEventListener('mousedown', (e) => { painting = true; paintAt(e, e.button === 2); });
  editCanvas.addEventListener('mousemove', (e) => { if (painting) paintAt(e, e.buttons === 2); });
  window.addEventListener('mouseup', () => { painting = false; });
  editCanvas.addEventListener('contextmenu', (e) => { e.preventDefault(); paintAt(e, true); });

  function renderBrushes() {
    const el = $('brushSwatches');
    el.innerHTML = '';
    const skin = currentSkin();
    const colors = [...new Set([skin.body, skin.headL, skin.headR, skin.chest, skin.tail, skin.patternColor || '#5a5248', '#fdf8ec', '#2a2731'])];
    for (const c of colors.filter(Boolean)) {
      const d = document.createElement('div');
      d.className = 'preset' + (c === brush ? ' active' : '');
      d.style.padding = '3px';
      const sw = document.createElement('div');
      sw.style.cssText = `width:30px;height:24px;background:${c};border:2px solid #000`;
      d.appendChild(sw);
      d.addEventListener('click', () => { brush = c; eraser = false; $('eraserBtn').textContent = 'ERASER OFF'; renderBrushes(); });
      el.appendChild(d);
    }
  }
  $('brushColor').addEventListener('input', () => { brush = $('brushColor').value; eraser = false; $('eraserBtn').textContent = 'ERASER OFF'; renderBrushes(); });
  $('eraserBtn').addEventListener('click', () => { eraser = !eraser; $('eraserBtn').textContent = eraser ? 'ERASER ON' : 'ERASER OFF'; });
  $('clearPixels').addEventListener('click', () => {
    settings.pixelOverrides = null;
    save({ pixelOverrides: null });
    drawEditor();
    drawCatOn(prevCanvas, currentSkin(), FRAMES.sit, 8, false);
  });
  renderBrushes();
  drawEditor();

  // -------------------------------------------------------------- reactions
  document.querySelectorAll('#reactionToggles input').forEach((inp) => {
    inp.checked = !!settings.reactions[inp.dataset.k];
    inp.addEventListener('change', () => save({ reactions: { [inp.dataset.k]: inp.checked } }));
  });

  $('soundsEnabled').checked = settings.sounds.enabled;
  $('soundsEnabled').addEventListener('change', () => save({ sounds: { enabled: $('soundsEnabled').checked } }));
  $('volume').value = Math.round((settings.sounds.volume ?? 0.5) * 100);
  $('volume').addEventListener('input', () => save({ sounds: { volume: $('volume').value / 100 } }));

  async function refreshPerm() {
    info = await miru.appInfo();
    const el = $('permStatus');
    if (info.platform !== 'darwin' || (info.accessibility && info.uiohookOk)) {
      el.textContent = 'KEYBOARD & SCROLL: OK';
      el.className = 'status good';
    } else if (info.accessibility) {
      el.textContent = 'GRANTED — RESTART APP';
      el.className = 'status warn';
    } else {
      el.textContent = 'NOT GRANTED';
      el.className = 'status bad';
    }
  }
  refreshPerm();
  setInterval(refreshPerm, 4000);
  $('grantBtn').addEventListener('click', () => miru.requestAccessibility().then(refreshPerm));

  // ----------------------------------------------------------------- breaks
  $('stretchEnabled').checked = settings.stretch.enabled;
  $('stretchEnabled').addEventListener('change', () => save({ stretch: { enabled: $('stretchEnabled').checked } }));
  $('stretchMin').value = settings.stretch.intervalMin;
  $('stretchMinLabel').textContent = settings.stretch.intervalMin;
  $('stretchMin').addEventListener('input', () => {
    $('stretchMinLabel').textContent = $('stretchMin').value;
    save({ stretch: { intervalMin: Number($('stretchMin').value) } });
  });

  const pomFields = { pomFocus: 'focusMin', pomBreak: 'breakMin', pomLong: 'longBreakMin', pomEvery: 'longEvery' };
  for (const [id, key] of Object.entries(pomFields)) {
    $(id).value = settings.pomodoro[key];
    $(id).addEventListener('change', () => save({ pomodoro: { [key]: Number($(id).value) } }));
  }
  $('pomLoop').checked = settings.pomodoro.loop;
  $('pomLoop').addEventListener('change', () => save({ pomodoro: { loop: $('pomLoop').checked } }));

  $('pomStart').addEventListener('click', () => miru.pomControl('start'));
  $('pomPause').addEventListener('click', () => miru.pomControl('toggle-pause'));
  $('pomSkip').addEventListener('click', () => miru.pomControl('skip'));
  $('pomStop').addEventListener('click', () => miru.pomControl('stop'));

  miru.onPom((p) => {
    const el = $('pomStatus');
    if (p.phase === 'off') {
      el.textContent = 'OFF';
      el.className = 'status';
    } else {
      const label = p.phase === 'focus' ? 'FOCUS' : p.phase === 'long' ? 'LONG BREAK' : 'BREAK';
      el.textContent = `${label} ${Math.floor(p.remaining / 60)}:${String(p.remaining % 60).padStart(2, '0')}${p.paused ? ' ⏸' : ''}`;
      el.className = 'status ' + (p.phase === 'focus' ? 'bad' : 'good');
    }
  });

  // -------------------------------------------------------------- reminders
  $('fixedEnabled').checked = settings.fixedMessage.enabled;
  $('fixedEnabled').addEventListener('change', () => save({ fixedMessage: { enabled: $('fixedEnabled').checked } }));
  $('fixedText').value = settings.fixedMessage.text || '';
  $('fixedText').addEventListener('input', () => save({ fixedMessage: { text: $('fixedText').value } }));

  function renderReminders() {
    const list = $('reminderList');
    list.innerHTML = '';
    if (!settings.reminders.length) {
      list.innerHTML = '<p class="hint" style="margin:0">No reminders yet. The cat will meow your message at the time you pick, every day.</p>';
      return;
    }
    for (const r of settings.reminders) {
      const div = document.createElement('div');
      div.className = 'reminder';
      const tog = document.createElement('button');
      tog.textContent = r.enabled ? '◼' : '◻';
      tog.title = 'enable/disable';
      tog.addEventListener('click', () => {
        r.enabled = !r.enabled;
        save({ reminders: settings.reminders });
        renderReminders();
      });
      const t = document.createElement('span');
      t.className = 't' + (r.enabled ? '' : ' off');
      t.textContent = r.time;
      const x = document.createElement('span');
      x.className = 'x' + (r.enabled ? '' : ' off');
      x.textContent = r.text;
      const del = document.createElement('button');
      del.textContent = '✕';
      del.addEventListener('click', () => {
        settings.reminders = settings.reminders.filter((q) => q.id !== r.id);
        save({ reminders: settings.reminders });
        renderReminders();
      });
      div.append(tog, t, x, del);
      list.appendChild(div);
    }
  }
  renderReminders();

  $('remAdd').addEventListener('click', () => {
    const time = $('remTime').value;
    const text = $('remText').value.trim();
    if (!time || !text) return;
    settings.reminders.push({ id: 'r' + Date.now(), time, text, enabled: true });
    save({ reminders: settings.reminders });
    $('remText').value = '';
    renderReminders();
  });

  // ----------------------------------------------------------------- agents
  function apiExample(port) {
    return `# agent started thinking
curl -X POST http://127.0.0.1:${port}/agent \\
  -H "Content-Type: application/json" \\
  -d '{"agent":"codex","state":"thinking"}'

# agent finished -> happy jump + meow
curl -X POST http://127.0.0.1:${port}/agent \\
  -H "Content-Type: application/json" \\
  -d '{"agent":"codex","state":"done"}'`;
  }

  function setPort(port) {
    $('portLabel').textContent = '127.0.0.1:' + port;
    $('apiExample').textContent = apiExample(port);
  }
  setPort(info.agentPort || settings.agent.port);
  miru.onAgentPort((p) => setPort(p));

  async function refreshHooks() {
    const s = await miru.hooksStatus();
    const el = $('hooksStatus');
    if (s.installed) {
      el.textContent = 'HOOKS INSTALLED';
      el.className = 'status good';
    } else if (s.partial) {
      el.textContent = s.stalePort ? 'PORT CHANGED — REINSTALL' : 'PARTIALLY INSTALLED';
      el.className = 'status warn';
    } else {
      el.textContent = 'NOT INSTALLED';
      el.className = 'status bad';
    }
  }
  refreshHooks();
  $('hooksInstall').addEventListener('click', async () => {
    const r = await miru.hooksInstall();
    if (!r.ok) alert('Install failed: ' + r.error);
    refreshHooks();
  });
  $('hooksUninstall').addEventListener('click', async () => {
    await miru.hooksUninstall();
    refreshHooks();
  });

  async function refreshCodex() {
    const s = await miru.codexStatus();
    const el = $('codexStatus');
    if (s.installed) {
      el.textContent = 'NOTIFY INSTALLED';
      el.className = 'status good';
    } else if (s.foreignNotify) {
      el.textContent = 'CUSTOM NOTIFY EXISTS';
      el.className = 'status warn';
    } else if (s.stalePort) {
      el.textContent = 'PORT CHANGED — REINSTALL';
      el.className = 'status warn';
    } else {
      el.textContent = s.configExists ? 'NOT INSTALLED' : 'NO CODEX CONFIG YET';
      el.className = 'status bad';
    }
  }
  refreshCodex();
  $('codexInstall').addEventListener('click', async () => {
    const r = await miru.codexInstall();
    if (r.error) alert(r.error);
    refreshCodex();
  });
  $('codexUninstall').addEventListener('click', async () => {
    await miru.codexUninstall();
    refreshCodex();
  });

  $('muteBackground').checked = settings.agent.muteBackground !== false;
  $('muteBackground').addEventListener('change', () => save({ agent: { muteBackground: $('muteBackground').checked } }));

  $('codexCelebrate').checked = !(settings.agent.muteAgents || []).includes('codex');
  $('codexCelebrate').addEventListener('change', () => {
    const muted = $('codexCelebrate').checked ? [] : ['codex'];
    save({ agent: { muteAgents: muted } });
  });

  $('autoType').checked = settings.agent.autoType !== false;
  $('autoType').addEventListener('change', () => save({ agent: { autoType: $('autoType').checked } }));
  $('askTestBtn').addEventListener('click', () => miru.askTest());

  // --------------------------------------------------------------- launcher
  $('hotkeyEnabled').checked = settings.launcher.hotkey !== false;
  $('hotkeyEnabled').addEventListener('change', () => save({ launcher: { hotkey: $('hotkeyEnabled').checked } }));
  $('murmurPath').value = settings.launcher.murmurApp || '';
  $('murmurPath').addEventListener('input', () => save({ launcher: { murmurApp: $('murmurPath').value } }));

  // ------------------------------------------------------------------ voice
  const v = settings.voice || {};
  $('voiceEnabled').checked = v.enabled !== false;
  $('voiceEnabled').addEventListener('change', () => save({ voice: { enabled: $('voiceEnabled').checked } }));
  $('voiceHotkey').checked = v.hotkey !== false;
  $('voiceHotkey').addEventListener('change', () => save({ voice: { hotkey: $('voiceHotkey').checked } }));
  $('voiceNotesDir').value = v.notesDir || '~/notes';
  $('voiceNotesDir').addEventListener('input', () => save({ voice: { notesDir: $('voiceNotesDir').value } }));
  $('voiceMurmurCli').value = v.murmurCli || '';
  $('voiceMurmurCli').addEventListener('input', () => {
    save({ voice: { murmurCli: $('voiceMurmurCli').value.trim() } });
    refreshVoiceStatus();
  });
  $('voiceWhisperModel').value = v.whisperModel || '';
  $('voiceWhisperModel').addEventListener('input', () => {
    save({ voice: { whisperModel: $('voiceWhisperModel').value.trim() } });
    refreshVoiceStatus();
  });
  $('voiceAutoConfirm').value = ((v.autoConfirmMs == null ? 3000 : v.autoConfirmMs) / 1000);
  $('voiceAutoConfirm').addEventListener('change', () => {
    const s = Math.max(0, Math.min(10, Number($('voiceAutoConfirm').value) || 0));
    save({ voice: { autoConfirmMs: Math.round(s * 1000) } });
  });
  $('voiceMaxRecord').value = v.maxRecordS || 15;
  $('voiceMaxRecord').addEventListener('change', () => {
    const s = Math.max(5, Math.min(30, Number($('voiceMaxRecord').value) || 15));
    save({ voice: { maxRecordS: s } });
  });
  $('voiceAgentCommands').checked = v.agentCommands !== false;
  $('voiceAgentCommands').addEventListener('change', () => save({ voice: { agentCommands: $('voiceAgentCommands').checked } }));
  $('voiceAgentEnter').checked = v.agentEnter === true;
  $('voiceAgentEnter').addEventListener('change', () => save({ voice: { agentEnter: $('voiceAgentEnter').checked } }));
  $('voiceBrainCap').value = v.dailyBrainCap == null ? 150 : v.dailyBrainCap;
  $('voiceBrainCap').addEventListener('change', () => {
    save({ voice: { dailyBrainCap: Math.max(0, Number($('voiceBrainCap').value) || 0) } });
  });
  async function refreshVoiceStatus() {
    try {
      const s = await miru.voiceStatus();
      const a = s.availability || {};
      $('voiceAvail').textContent =
        `transcriber: ${a.murmur ? 'murmur ✓' : a.whisper ? 'whisper ✓' : 'MISSING'} · brain: ${a.claude ? 'claude ✓' : 'offline (fallback router)'}`;
      const u = s.usage || {};
      $('voiceUsageLine').textContent = `today: ${u.calls || 0} brain calls · $${(u.costUsd || 0).toFixed(2)}`;
    } catch (e) {
      $('voiceAvail').textContent = 'status unavailable';
    }
  }
  refreshVoiceStatus();

  // -------------------------------------------------- follow-ups + wind-down
  const fu = settings.followUp || {};
  $('fuEnabled').checked = fu.enabled !== false;
  $('fuEnabled').addEventListener('change', () => save({ followUp: { enabled: $('fuEnabled').checked } }));
  $('fuMinutes').value = fu.minutes || 30;
  $('fuMinutes').addEventListener('change', () => {
    save({ followUp: { minutes: Math.max(5, Math.min(120, Number($('fuMinutes').value) || 30)) } });
  });
  const wd = settings.windDown || {};
  $('wdEnabled').checked = wd.enabled !== false;
  $('wdEnabled').addEventListener('change', () => save({ windDown: { enabled: $('wdEnabled').checked } }));
  $('wdTime').value = wd.time || '18:30';
  $('wdTime').addEventListener('change', () => {
    let t = $('wdTime').value || '18:30';
    if (t > '22:30') { t = '22:30'; $('wdTime').value = t; } // window must end by 23:00
    save({ windDown: { time: t } });
  });

  function renderApps() {
    const list = $('appList');
    list.innerHTML = '';
    const apps = settings.launcher.apps || [];
    if (!apps.length) list.innerHTML = '<p class="hint" style="margin:0">No apps yet.</p>';
    apps.forEach((a, i) => {
      const div = document.createElement('div');
      div.className = 'reminder';
      const t = document.createElement('span');
      t.className = 't';
      t.textContent = a.label;
      const x = document.createElement('span');
      x.className = 'x';
      x.textContent = a.app;
      const del = document.createElement('button');
      del.textContent = '✕';
      del.addEventListener('click', () => {
        const next = apps.filter((_, j) => j !== i);
        settings.launcher.apps = next;
        save({ launcher: { apps: next } });
        renderApps();
      });
      div.append(t, x, del);
      list.appendChild(div);
    });
  }
  renderApps();
  $('appAdd').addEventListener('click', () => {
    const label = $('appLabel').value.trim().toUpperCase();
    const appName = $('appName').value.trim();
    if (!label || !appName) return;
    const next = [...(settings.launcher.apps || []), { label, app: appName }];
    settings.launcher.apps = next;
    save({ launcher: { apps: next } });
    $('appLabel').value = ''; $('appName').value = '';
    renderApps();
  });

  // ------------------------------------------------------------------ inbox
  function renderInbox(items) {
    const list = $('inboxList');
    list.innerHTML = '';
    if (!items.length) {
      list.innerHTML = '<p class="hint" style="margin:0">Empty. Reminders, agent turns and /say messages land here.</p>';
      return;
    }
    for (const m of items) {
      const div = document.createElement('div');
      div.className = 'reminder';
      const when = new Date(m.t);
      const t = document.createElement('span');
      t.className = 't';
      t.style.whiteSpace = 'nowrap';
      t.textContent = String(when.getHours()).padStart(2, '0') + ':' + String(when.getMinutes()).padStart(2, '0');
      const k = document.createElement('span');
      k.style.cssText = 'color:var(--dim);font-size:10px;letter-spacing:1px;flex:0 0 auto';
      k.textContent = (m.kind || 'msg').toUpperCase();
      const x = document.createElement('span');
      x.className = 'x';
      x.style.cssText = 'user-select:text;-webkit-user-select:text;white-space:normal;line-height:1.5';
      x.textContent = m.text;
      div.append(t, k, x);
      list.appendChild(div);
    }
  }
  miru.getInbox().then(renderInbox);
  miru.onInbox(renderInbox);
  $('inboxClearBtn').addEventListener('click', () => { miru.inboxClear(); renderInbox([]); });

  // ------------------------------------------------------------------ about
  $('versionLine').textContent = 'v' + (info.version || '1.0.0');
  $('openAtLogin').checked = !!settings.openAtLogin;
  $('openAtLogin').addEventListener('change', () => save({ openAtLogin: $('openAtLogin').checked }));
  $('comnyangLink').addEventListener('click', (e) => e.preventDefault());

  miru.onSettings((s) => { settings = s; });

  window.__settingsReady = true;
})();
