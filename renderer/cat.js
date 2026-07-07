'use strict';
/* global Sprites, PixelFont, PixelIcons, CatGifts, CatAudio, miru */
(async function () {
  const { framesFor, SKINS, drawCat } = Sprites;
  let FRAMES = framesFor('kawaii');
  const { drawIcon } = PixelIcons;
  const { GIFTS, drawGift } = CatGifts;

  const canvas = document.getElementById('cat');
  const ctx = canvas.getContext('2d');
  let W = window.innerWidth, H = window.innerHeight;
  const DPR = window.devicePixelRatio || 1;

  function sizeCanvas() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  }
  sizeCanvas();
  window.addEventListener('resize', sizeCanvas);

  // ------------------------------------------------------------- settings
  let settings = await miru.getSettings();
  let skin = resolveSkin();
  FRAMES = framesFor(settings.spriteStyle);

  function resolveSkin() {
    if (settings.skin === 'custom' && settings.customColors) {
      return { ...SKINS.black, ...settings.customColors };
    }
    return SKINS[settings.skin] || SKINS.black;
  }

  function applySound() {
    CatAudio.setEnabled(!!settings.sounds.enabled);
    CatAudio.setVolume(settings.sounds.volume ?? 0.5);
  }
  applySound();

  miru.onSettings((s) => {
    settings = s;
    skin = resolveSkin();
    FRAMES = framesFor(settings.spriteStyle);
    applySound();
    if (st.menu.open && panelEl) renderMenuDom(); // live task/app updates
  });

  // ---------------------------------------------------------------- state
  const now = () => performance.now();
  const st = {
    mode: 'idle',
    modeT: 0,
    cursor: { x: -999, y: -999 },   // window-relative, from main tick
    vel: 0,
    idleSec: 0,
    kps: 0,
    lastKeyT: -1e9,
    lastScrollT: -1e9,
    scrollLen: 0,
    heat: 0,
    pet: { meter: 0, lastStrokeT: -1e9, lastX: 0, active: false },
    agents: { working: 0, alert: 0, details: [] },
    ledBox: null,
    ledHover: false,
    menu: { open: false, page: 'root', hover: -1, anim: 0, closing: false, rows: [], boxes: [], panelBox: null, lastTouchT: 0 },
    inbox: [],
    bond: { xp: 0, level: 1, gifts: [], counters: {}, records: {}, daysTogether: 0, streak: 0, bestStreak: 0 },
    shownGift: null, // {id, until} — presented at the cat's feet
    zoomiesUntil: -1e9,
    nextZoomiesT: now() + 60000,
    longPressTimer: null,
    question: null, // {qid, agent, header, question, options, canType, status, hover, boxes, openBox, dismissBox, panelBox}
    confirm: null,  // shared chip panel: {cid, kind, title, text, chips, autoAt, boxes, dismissBox, panelBox}
    voice: { phase: 'idle', vid: null, recStartT: 0, maxMs: 15000, cancelBox: null },
    doneFlashUntil: -1e9,
    celebrateUntil: -1e9,
    celebrateText: null,
    alertUntil: -1e9,
    stretchUntil: -1e9,
    hopUntil: -1e9,
    wakeUntil: -1e9,    // surprise "!" on wake
    sleepingSince: 0,
    hunt: { phase: 'none', dir: 1 },
    drag: { active: false, vx: 0, vy: 0, vxS: 0, prevVxS: 0, sy: 1, springV: 0, shear: 0, wobble: 0, swing: 0, swingV: 0, releasedT: -1e9 },
    bubble: null,       // {text, until, kind}
    pom: null,
    blinkUntil: -1e9,
    nextBlinkT: now() + 3000,
    slowBlinkUntil: -1e9,      // affection "cat kiss"
    slowBlinkAt: -1e9,
    nextSlowBlinkT: now() + 15000,
    earFlickUntil: -1e9,
    nextEarFlickT: now() + 8000,
    yawnUntil: -1e9,
    idleEnterMode: null,       // what we were doing before settling into idle
    wander: { active: false, gaze: { gx: 1, gy: 1 }, nextAt: 0, stillSince: 0 },
    tailIdx: 0,
    tailT: 0,
    effects: [],
    boopT: -1e9,
    groomUntil: -1e9,
    nextGroomT: now() + 30000 + Math.random() * 45000,
    blepUntil: -1e9,
    nextBlepT: now() + 120000 + Math.random() * 240000,
    dreamTwitchUntil: -1e9,
    nextDreamT: 0,
    tiltUntil: -1e9,
    tiltDir: 1,
    nextTiltT: 0,
    hoverStartT: 0,
    catBBox: { x: 0, y: 0, w: 0, h: 0 },
    chipBBox: null,
    interactive: false,
    mouseDown: null,
    draggingEngaged: false,
  };

  // ----------------------------------------------------------- ipc wiring
  miru.onTick((t) => {
    st.cursor = t.cursor;
    st.vel = t.vel;
    st.idleSec = t.idleSec;
    if (t.test) st.testMode = true; // harness run: ambient rituals wait for pokes
    if (t.huntPhase) st.hunt.phase = t.huntPhase;
    updateInteractive(t.cursor.x, t.cursor.y);
  });

  miru.onKey(({ kps }) => {
    st.kps = kps;
    st.lastKeyT = now();
  });

  miru.onScroll(({ amount }) => {
    st.lastScrollT = now();
    st.scrollLen = Math.min(70, st.scrollLen + amount * 2);
  });

  miru.onHunt(({ phase, dir }) => {
    st.hunt.phase = phase;
    if (dir) st.hunt.dir = dir;
    if (phase === 'caught') {
      spawnHearts(3);
      CatAudio.meowShort();
    }
  });

  miru.onDrag((d) => {
    if (d.phase === 'start') {
      st.drag.active = true;
      st.drag.releasedT = -1e9;
    } else if (d.phase === 'move') {
      st.drag.vx = d.vx; st.drag.vy = d.vy;
    } else if (d.phase === 'end') {
      st.drag.active = false;
      st.drag.releasedT = now();
      st.drag.vx = 0; st.drag.vy = 0; // the hold point stops with the hand
    }
  });

  miru.onAgents((a) => { st.agents = a || { working: 0, alert: 0, details: [] }; });

  miru.onAgentDone(({ agent, quiet, silent }) => {
    st.doneFlashUntil = now() + 2500;
    if (silent) return; // burst-limited: LED flash + inbox only
    if (quiet) {
      st.hopUntil = now() + 900;
      CatAudio.meowShort();
    } else {
      celebrate(`${agent} DONE!`, 3000);
    }
  });

  miru.onAgentAlert(({ agent, message }) => {
    st.alertUntil = now() + 8000;
    showBubble(String(message || `${agent} NEEDS YOU!`).toUpperCase(), 8000);
    CatAudio.alert();
  });

  miru.onAsk((q) => {
    st.question = { ...q, status: 'idle', hover: -1, boxes: [], openBox: null, dismissBox: null, panelBox: null };
    st.bubble = null;
    st.alertUntil = -1e9;
    st.hopUntil = now() + 700;
    CatAudio.alert();
  });

  miru.onAskClear(() => { st.question = null; });

  miru.onConfirm((c) => {
    st.confirm = {
      ...c,
      autoAt: c.autoConfirmMs ? now() + c.autoConfirmMs : null,
      autoTotalMs: c.autoConfirmMs || 0,
      autoFired: false,
      hover: -1, boxes: [], dismissBox: null, panelBox: null,
    };
    st.bubble = null;
    CatAudio.pop();
  });
  miru.onConfirmClear(({ cid }) => {
    if (st.confirm && st.confirm.cid === cid) st.confirm = null;
  });

  miru.onVoiceState((v) => {
    st.voice.phase = v.phase;
    if (v.vid) st.voice.vid = v.vid;
    if (v.maxMs) st.voice.maxMs = v.maxMs;
    if (v.phase === 'listening') st.voice.recStartT = now();
    if (v.phase === 'idle') st.voice.cancelBox = null;
  });

  miru.onVoiceCapture(async (c) => {
    if (c.cmd === 'start') {
      if (st.menu.open) closeMenu();
      st.voice.vid = c.vid;
      st.voice.maxMs = c.maxMs || 15000;
      try {
        await VoiceCapture.start({
          maxMs: c.maxMs,
          silenceMs: c.silenceMs,
          onAutoStop: () => finishCapture(c.vid),
        });
        miru.voiceCaptureState({ vid: c.vid, ok: true });
      } catch (e) {
        miru.voiceCaptureState({ vid: c.vid, ok: false, error: e.name || e.message });
      }
    } else if (c.cmd === 'stop') {
      finishCapture(c.vid);
    } else if (c.cmd === 'cancel') {
      VoiceCapture.cancel();
    }
  });

  let finishingCapture = false;
  function finishCapture(vid) {
    if (!VoiceCapture.active() || finishingCapture) return;
    finishingCapture = true;
    try {
      const r = VoiceCapture.stop();
      miru.voiceAudio(vid, r.wav, { durationS: r.durationS, speechSeen: r.speechSeen });
    } finally {
      finishingCapture = false;
    }
  }
  miru.onVoiceDone(({ message, undoToken, undoMs }) => {
    showBubble(String(message || 'DONE'), undoMs || 5000, undoToken ? 'undo' : 'say');
    if (undoToken && st.bubble) st.bubble.undoToken = undoToken;
    st.hopUntil = now() + 700;
  });

  miru.onInbox((items) => {
    st.inbox = items || [];
    if (st.menu.open && panelEl && st.menu.page === 'inbox') renderMenuDom();
  });

  miru.onBond((b) => { st.bond = b; });
  miru.getBond().then((b) => { st.bond = b; });

  miru.onRitual(({ kind, name, dueToday, daysTogether, milestone }) => {
    const nm = name ? ', ' + name.toUpperCase() : '';
    if (milestone) {
      celebrate(`${milestone} DAYS TOGETHER${nm}!`, 4000);
    } else if (kind === 'reunion') {
      celebrate(`MISSED YOU${nm}!`, 3000);
      spawnHearts(4);
    } else {
      st.stretchUntil = now() + 3500; // morning stretch
      const due = dueToday > 0 ? ` ${dueToday} DUE TODAY.` : '';
      showBubble(`MORNING${nm}!${due}`, 7000);
      CatAudio.meowShort();
    }
  });

  miru.onGift(({ id, name, rarity }) => {
    st.shownGift = { id, until: now() + 120000 };
    showBubble(`I CAUGHT THIS FOR YOU! ${name.toUpperCase()}${rarity === 'rare' ? ' (RARE!)' : ''}`, 9000);
    CatAudio.tada();
    spawnSparkles(rarity === 'rare' ? 14 : 6);
    st.hopUntil = now() + 1200;
  });
  miru.getInbox().then((items) => { st.inbox = items || []; });
  miru.onMenuToggle(() => toggleMenu());

  miru.onAskResult((r) => {
    if (!st.question || st.question.qid !== r.qid) return;
    if (r.typed) st.question.status = 'typed:' + (r.app || '');
    else if (r.located) st.question.status = 'focused:' + (r.app || '');
    else st.question.status = 'notfound';
  });

  miru.onPom((p) => { st.pom = p; });
  miru.onPomPhase(({ phase }) => {
    const nm = nameSuffix();
    if (phase === 'break' || phase === 'long') {
      celebrate(`BREAK TIME${nm}!`, 3200);
    } else if (phase === 'focus') {
      showBubble('FOCUS TIME!', 4000);
      CatAudio.meowShort();
    }
  });

  miru.onRemind(({ text }) => {
    showBubble(String(text || '').toUpperCase(), 9000);
    CatAudio.meow();
    st.hopUntil = now() + 900;
  });

  miru.onStretchNow((p) => {
    const ms = (p && p.ms) || 11000;
    st.stretchUntil = now() + ms;
    showBubble(`STRETCH TIME${nameSuffix()}!`, Math.min(8000, ms));
    CatAudio.meow();
  });

  function nameSuffix() {
    const n = (settings.name || '').trim();
    return n ? ', ' + n.toUpperCase() : '';
  }

  function celebrate(text, ms) {
    st.celebrateUntil = now() + ms;
    if (text) showBubble(text, ms + 1500);
    CatAudio.tada();
    setTimeout(() => CatAudio.meow(), 320);
    spawnSparkles(8);
  }

  function showBubble(text, ms, kind = 'say') {
    st.bubble = { text, until: now() + ms, kind };
  }

  // ------------------------------------------------------------- effects
  function spawn(type, x, y, vx, vy, life, data = {}) {
    st.effects.push({ type, x, y, vx, vy, life, maxLife: life, ...data });
  }
  function spawnHearts(n) {
    const { x, y, w } = st.catBBox;
    for (let i = 0; i < n; i++) {
      spawn('heart', x + w * (0.2 + Math.random() * 0.6), y - 4, (Math.random() - 0.5) * 18, -22 - Math.random() * 14, 1.4);
    }
  }
  function spawnSparkles(n) {
    const { x, y, w, h } = st.catBBox;
    for (let i = 0; i < n; i++) {
      spawn('sparkle', x + w * Math.random(), y + h * Math.random() * 0.7, (Math.random() - 0.5) * 50, -30 - Math.random() * 40, 0.9);
    }
  }

  // --------------------------------------------------------- interactivity
  function inBox(x, y, b) {
    return !!b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
  }

  function pointInteractive(x, y) {
    const b = st.catBBox;
    if (x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 4 && y <= b.y + b.h + 4) return true;
    if (inBox(x, y, st.chipBBox)) return true;
    if (inBox(x, y, st.ledBox)) return true;
    if (st.bubble && inBox(x, y, st.bubbleBox)) return true;
    if (st.question && inBox(x, y, st.question.panelBox)) return true;
    if (st.confirm && inBox(x, y, st.confirm.panelBox)) return true;
    if (st.voice.phase === 'listening' && inBox(x, y, st.voice.cancelBox)) return true;
    if (st.menu.open && panelEl) {
      const r = panelEl.getBoundingClientRect();
      if (x >= r.left - 4 && x <= r.right + 4 && y >= r.top - 4 && y <= r.bottom + 10) return true;
    }
    return false;
  }

  function updateInteractive(x, y) {
    const want = st.drag.active || st.draggingEngaged || pointInteractive(x, y);
    if (want !== st.interactive) {
      st.interactive = want;
      miru.setInteractive(want);
    }
  }

  window.addEventListener('mousemove', (e) => {
    updateInteractive(e.clientX, e.clientY);

    // question / confirm panel hover
    if (st.question) {
      st.question.hover = st.question.boxes.findIndex((b) => inBox(e.clientX, e.clientY, b));
    }
    if (st.confirm) {
      st.confirm.hover = st.confirm.boxes.findIndex((b) => inBox(e.clientX, e.clientY, b));
    }
    st.ledHover = inBox(e.clientX, e.clientY, st.ledBox);
    if (st.menu.open && e.target && e.target.closest && e.target.closest('.panel')) {
      st.menu.lastTouchT = now();
    }

    // drag engage after small movement (any movement cancels the long-press menu)
    if (st.mouseDown && !st.draggingEngaged) {
      const d = Math.hypot(e.clientX - st.mouseDown.x, e.clientY - st.mouseDown.y);
      if (d > 4) clearTimeout(st.longPressTimer);
      if (d > 7) {
        st.draggingEngaged = true;
        miru.dragStart(st.mouseDown.x, st.mouseDown.y);
      }
    }

    // petting: horizontal strokes over the head area
    if (settings.reactions.pet && !st.drag.active && headHit(e.clientX, e.clientY)) {
      const dx = e.clientX - st.pet.lastX;
      if (Math.abs(dx) > 1.5) {
        st.pet.meter = Math.min(100, st.pet.meter + Math.abs(dx));
        st.pet.lastStrokeT = now();
      }
    }
    st.pet.lastX = e.clientX;
  });

  function headHit(x, y) {
    const b = st.catBBox;
    return x >= b.x && x <= b.x + b.w && y >= b.y - 6 && y <= b.y + b.h * 0.55;
  }

  window.addEventListener('mousedown', (e) => {
    st.lastInput = { type: 'down', x: e.clientX, y: e.clientY, button: e.button, t: Math.round(now()) };
    if (e.button === 2) return;
    const X = e.clientX, Y = e.clientY;

    // paw menu first: rows handle their own clicks; click-away dismisses
    if (st.menu.open) {
      if (e.target && e.target.closest && e.target.closest('.panel')) {
        st.menu.lastTouchT = now();
      } else {
        closeMenu();
      }
      return;
    }

    // confirm chips take top priority (they're the freshest ask)
    const cf = st.confirm;
    if (cf && inBox(X, Y, cf.panelBox)) {
      const hit = cf.boxes.find((b) => inBox(X, Y, b));
      if (hit) {
        miru.confirmAction(cf.cid, hit.id);
        st.confirm = null; // optimistic; main echoes confirm-clear
        CatAudio.pop();
      } else if (inBox(X, Y, cf.dismissBox)) {
        miru.confirmDismiss(cf.cid, 'click');
        st.confirm = null;
        CatAudio.pop();
      }
      return;
    }

    // question panel clicks take priority
    const q = st.question;
    if (q && inBox(X, Y, q.panelBox)) {
      const opt = q.boxes.findIndex((b) => inBox(X, Y, b));
      if (opt >= 0 && q.canType && !q.status.startsWith('typed')) {
        q.status = 'sending';
        miru.askAnswer(q.qid, opt);
        CatAudio.pop();
      } else if (inBox(X, Y, q.openBox)) {
        miru.askOpen(q.qid);
        CatAudio.pop();
      } else if (inBox(X, Y, q.dismissBox)) {
        miru.askDismiss(q.qid);
        st.question = null;
        CatAudio.pop();
      }
      return;
    }

    if (inBox(X, Y, st.ledBox)) {
      miru.ledClick();
      CatAudio.pop();
      return;
    }
    if (st.bubble && inBox(X, Y, st.bubbleBox)) {
      if (st.bubble.kind === 'undo' && st.bubble.undoToken) {
        miru.voiceUndo(st.bubble.undoToken);
        st.bubble = null;
        CatAudio.pop();
        return;
      }
      // a message is a doorway to the inbox, not a dead end
      st.bubble = null;
      openMenu('inbox');
      return;
    }
    if (inBox(X, Y, st.chipBBox)) {
      miru.pomControl('toggle-pause');
      CatAudio.pop();
      return;
    }
    if (st.voice.phase === 'listening') {
      if (inBox(X, Y, st.voice.cancelBox)) {
        miru.voiceCancel(st.voice.vid);
        VoiceCapture.cancel();
        CatAudio.pop();
        return;
      }
      // a click on the cat means "done talking"
      finishCapture(st.voice.vid);
      return;
    }
    if (pointInteractive(X, Y)) {
      st.mouseDown = { x: X, y: Y };
      // hold still on the cat to open the paw menu
      clearTimeout(st.longPressTimer);
      st.longPressTimer = setTimeout(() => {
        if (st.mouseDown && !st.draggingEngaged && !st.drag.active) {
          st.mouseDown = null;
          openMenu();
        }
      }, 320);
    }
  });

  window.addEventListener('mouseup', () => {
    clearTimeout(st.longPressTimer);
    if (st.draggingEngaged) {
      miru.dragEnd();
      st.draggingEngaged = false;
    } else if (st.mouseDown) {
      // boop!
      st.boopT = now();
      st.slowBlinkUntil = now() + 460; // a slow, content blink back at you
      st.slowBlinkAt = now();
      CatAudio.pop();
      spawnHearts(1);
      miru.bondEvent('boop');
    }
    st.mouseDown = null;
  });

  window.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (st.menu.open || pointInteractive(e.clientX, e.clientY)) toggleMenu();
  });

  window.addEventListener('dblclick', (e) => {
    if (pointInteractive(e.clientX, e.clientY)) miru.openSettings();
  });

  document.addEventListener('mouseleave', () => updateInteractive(-99, -99));

  // ------------------------------------------------------------ mode logic
  function resolveMode() {
    const t = now();
    if (st.drag.active) return 'drag';
    if (st.hunt.phase === 'chase') return 'hunt';
    if (st.hunt.phase === 'crouch') return 'pounce';
    if (st.hunt.phase === 'leap') return 'leap';
    if (st.hunt.phase === 'caught') return 'caught';
    if (st.menu.open) return 'menu'; // summoning the menu wins over festivities
    if (st.voice.phase !== 'idle') return 'listen'; // talking to the cat
    if (t < st.celebrateUntil) return 'celebrate';
    if (t < st.stretchUntil) return 'stretch';
    if (t < st.alertUntil) return 'alert';
    if (st.pet.active) return 'pet';
    const typing = t - st.lastKeyT < 1000 && settings.reactions.knead;
    if (st.heat > 0.7 && settings.reactions.overheat) return 'overheat';
    if (typing) return 'knead';
    if (t - st.lastScrollT < 1300 && settings.reactions.scrollPaper) return 'scroll';
    if (st.question) return 'question';
    if (st.agents.working > 0) return 'think';
    if (t < st.zoomiesUntil) return 'zoomies';
    if (settings.reactions.sleep && st.idleSec > 240) return 'sleep';
    return 'idle';
  }

  function update(dt) {
    const t = now();

    // overheat accumulation — heat drives steam + panting only; it must
    // never tint the fur (drawCat takes no heat)
    if (settings.reactions.overheat && t - st.lastKeyT < 800 && st.kps > 5.5) {
      st.heat = Math.min(1, st.heat + dt * 0.22 * (st.kps / 8));
    } else {
      st.heat = Math.max(0, st.heat - dt * 0.16);
    }

    // petting state
    st.pet.meter = Math.max(0, st.pet.meter - dt * 55);
    const wasPetting = st.pet.active;
    st.pet.active = settings.reactions.pet && st.pet.meter > 45 && t - st.pet.lastStrokeT < 700;
    if (st.pet.active && !wasPetting) { CatAudio.startPurr(); miru.bondEvent('pet'); }
    if (!st.pet.active && wasPetting) CatAudio.stopPurr();
    // deeper bond = more hearts when petting
    if (st.pet.active && Math.random() < dt * (1.6 + (st.bond.level || 1) * 0.6)) spawnHearts(1);

    // L5 zoomies: old friends get the occasional burst of joy
    if ((st.bond.level || 1) >= 5 && st.mode === 'idle' && t > st.nextZoomiesT) {
      st.zoomiesUntil = t + 1800;
      st.nextZoomiesT = t + 1800000 + Math.random() * 1800000; // every 30-60 min
      spawnSparkles(4);
    }

    // scroll paper retracts
    if (t - st.lastScrollT > 400) st.scrollLen = Math.max(0, st.scrollLen - dt * 60);

    // mode transitions
    const m = resolveMode();
    if (m !== st.mode) {
      const prev = st.mode;
      st.mode = m;
      st.modeT = 0;
      if (prev === 'sleep' && m !== 'sleep') {
        st.wakeUntil = t + 700;
        st.yawnUntil = t + 850; // a big yawn on waking
      }
      if (m === 'idle') st.idleEnterMode = prev;
      if (m === 'sleep') { st.sleepingSince = t; st.dreamN = 0; }
    } else {
      st.modeT += dt;
    }

    // drag physics: the head rides the hand as-is; the body below the neck
    // is a real pendulum hanging from a moving pivot — gravity restores,
    // damping settles, and the pivot's acceleration is what kicks it (jerk
    // the window left and the body genuinely gets left behind)
    const d = st.drag;
    if (d.active || Math.abs(d.swing) > 0.004 || Math.abs(d.swingV) > 0.02) {
      const px4 = settings.scale || 4;
      const armPx = Math.max(20, 24 * px4);            // pendulum arm length
      d.vxS += (d.vx - d.vxS) * Math.min(1, dt * 18);  // smoothed hold velocity
      const ax = (d.vxS - d.prevVxS) / Math.max(dt, 0.001);
      d.prevVxS = d.vxS;
      const G = 2400; // px/s^2 — tuned for a ~0.8Hz natural sway
      // gravity restores on the true arm; the hand's acceleration drives on
      // a 4x longer effective arm so ordinary drags sway instead of whipping
      const acc = -G * Math.sin(d.swing) / armPx
        - ax * Math.cos(d.swing) / (armPx * 4)
        - d.swingV * 4;
      d.swingV += acc * dt;
      d.swing = Math.max(-0.45, Math.min(0.45, d.swing + d.swingV * dt));
    } else {
      d.swing = 0; d.swingV = 0; d.vxS = 0; d.prevVxS = 0;
    }
    d.sy = 1; d.shear = 0;

    // confirm auto-countdown: pauses while pondered (hover / menu open),
    // fires the primary chip once when it runs out
    const cf = st.confirm;
    if (cf && cf.autoAt && !cf.autoFired) {
      const pondering = st.menu.open || (cf.panelBox && inBox(st.cursor.x, st.cursor.y, cf.panelBox));
      if (pondering) cf.autoAt += dt * 1000;
      else if (t > cf.autoAt) {
        cf.autoFired = true;
        if (cf.chips.some((ch) => ch.id === 'confirm')) miru.confirmAction(cf.cid, 'confirm');
      }
    }

    // blink scheduling
    if (t > st.nextBlinkT) {
      st.blinkUntil = t + 130;
      st.nextBlinkT = t + 2600 + Math.random() * 3500;
    }
    // affection slow-blinks: friends (bond ≥ 2) "cat-kiss" now and then when calm
    if (st.mode === 'idle' && (st.bond.level || 1) >= 2 && t > st.nextSlowBlinkT) {
      st.slowBlinkUntil = t + 520;
      st.slowBlinkAt = t;
      st.nextSlowBlinkT = t + 12000 + Math.random() * 11000;
    }
    // ear flick: a little involuntary twitch while idle
    if (st.mode === 'idle' && t > st.nextEarFlickT) {
      st.earFlickUntil = t + 240;
      st.nextEarFlickT = t + 7000 + Math.random() * 9000;
    }
    // grooming ritual: idle cats keep themselves clean (harness runs poke
    // st.groomUntil directly — ambient fires would eat frame-assert windows)
    if (!st.testMode && st.mode === 'idle' && t > st.nextGroomT && FRAMES.sit_groom1) {
      st.groomUntil = t + 2800;
      st.nextGroomT = t + 45000 + Math.random() * 75000;
    }
    if (st.mode !== 'idle') st.groomUntil = Math.min(st.groomUntil, t); // interrupted
    // a very rare blep: the tongue comes out and she forgets about it
    if (!st.testMode && st.mode === 'idle' && t > st.nextBlepT) {
      st.blepUntil = t + 2600;
      st.nextBlepT = t + 240000 + Math.random() * 360000;
    }
    // curious head tilt: linger the cursor on her and she leans toward it
    const bb = st.catBBox;
    const overCat = bb.w > 0 && st.cursor.x >= bb.x && st.cursor.x <= bb.x + bb.w &&
      st.cursor.y >= bb.y && st.cursor.y <= bb.y + bb.h;
    if (overCat && (st.mode === 'idle' || st.mode === 'think') && !st.pet.active && !st.drag.active) {
      if (!st.hoverStartT) st.hoverStartT = t;
      if (t - st.hoverStartT > 700 && t > st.nextTiltT && t > st.tiltUntil) {
        st.tiltUntil = t + 1700;
        st.tiltDir = st.cursor.x < bb.x + bb.w / 2 ? -1 : 1;
        st.nextTiltT = t + 8000;
      }
    } else st.hoverStartT = 0;
    // dreams: tiny ear twitches (and sometimes a fish) while asleep
    if (st.mode === 'sleep') {
      if (st.nextDreamT < st.sleepingSince) st.nextDreamT = t + 4000 + Math.random() * 7000;
      if (t > st.nextDreamT) {
        st.dreamTwitchUntil = t + 460;
        st.nextDreamT = t + 6000 + Math.random() * 12000;
        st.dreamN = (st.dreamN || 0) + 1;
        // every nap dreams of fish at least once
        if (st.dreamN === 1 || Math.random() < 0.45) {
          const b = st.catBBox;
          spawn('dream', b.x + b.w * 0.82, b.y - 2, 4, -8, 3.4);
        }
      }
    }

    // paw menu animation + auto-fade when ignored
    const mn = st.menu;
    if (mn.open) {
      if (mn.closing) {
        mn.anim -= dt * 9;
        if (mn.anim <= 0) { mn.open = false; mn.closing = false; mn.anim = 0; mn.panelBox = null; }
      } else {
        mn.anim = Math.min(1, mn.anim + dt * 7);
        const typing = document.activeElement && document.activeElement.id === 'todoInput';
        if (!typing && now() - mn.lastTouchT > 10000) closeMenu();
      }
    }
    syncMenuDom();

    // gaze wander when the mouse has been still for a while
    const w = st.wander;
    if (st.vel > 30) {
      w.stillSince = t;
      w.active = false;
    } else if (t - w.stillSince > 6000) {
      w.active = true;
      if (t > w.nextAt) {
        w.nextAt = t + 1600 + Math.random() * 2400;
        const opts = [[0, 1], [2, 1], [1, 0], [1, 1], [1, 1], [0, 0], [2, 0], [1, 2]];
        const pick = opts[Math.floor(Math.random() * opts.length)];
        w.gaze = { gx: pick[0], gy: pick[1] };
      }
    }

    // tail sway (a happy quiver while being petted)
    st.tailT += dt * (st.mode === 'pet' ? 2.6 : st.mode === 'knead' || st.mode === 'overheat' ? 2.2 : st.mode === 'think' ? 1.6 : 1);
    if (st.tailT > 0.55) {
      st.tailT = 0;
      st.tailIdx = (st.tailIdx + 1) % 4;
    }

    // ambient effects
    if (st.mode === 'sleep' && Math.random() < dt * 0.7) {
      const b = st.catBBox;
      spawn('z', b.x + b.w * 0.75, b.y + 6, 8, -14, 2.2);
    }
    if (st.heat > 0.65 && Math.random() < dt * (st.heat * 5)) {
      const b = st.catBBox;
      spawn('steam', b.x + b.w * (0.25 + Math.random() * 0.5), b.y - 2, (Math.random() - 0.5) * 10, -26, 1.1);
    }

    // particles
    for (const p of st.effects) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.type === 'steam') p.vy *= 0.99;
      if (p.type === 'heart') p.vx *= 0.98;
    }
    st.effects = st.effects.filter((p) => p.life > 0);
  }

  // ---------------------------------------------------------------- render
  function pickFrame() {
    const t = now();
    switch (st.mode) {
      case 'drag': return { f: FRAMES.hang };
      case 'listen': return { f: FRAMES.sit_tail_up }; // ears-up attentive pose
      case 'hunt': return { f: Math.floor(t / 90) % 2 ? FRAMES.run_a : FRAMES.run_b, flip: st.hunt.dir < 0 };
      case 'pounce': return { f: FRAMES.crouch || FRAMES.sit, flip: st.hunt.dir < 0 };
      case 'leap': return { f: FRAMES.leap, flip: st.hunt.dir < 0 };
      case 'caught': return { f: FRAMES.knead_l };
      case 'celebrate': return { f: FRAMES.celebrate };
      case 'stretch': return { f: FRAMES.stretch_up };
      case 'sleep': return { f: t < st.dreamTwitchUntil && FRAMES.loaf_twitch ? FRAMES.loaf_twitch : FRAMES.loaf };
      case 'overheat':
      case 'knead': return { f: Math.floor(t / 320) % 2 ? FRAMES.knead_l : FRAMES.knead_r };
      case 'zoomies': return { f: Math.floor(t / 80) % 2 ? FRAMES.run_a : FRAMES.run_b, flip: Math.floor(t / 700) % 2 === 0 };
      case 'scroll': return { f: Math.floor(t / 380) % 2 ? FRAMES.knead_l : FRAMES.knead_r };
      default: {
        if (t < st.groomUntil && FRAMES.sit_groom1) {
          return { f: Math.floor(t / 430) % 2 ? FRAMES.sit_groom2 : FRAMES.sit_groom1 };
        }
        if (t < st.earFlickUntil && FRAMES.sit_flick) return { f: FRAMES.sit_flick };
        // nodding off: tuck into a loaf before sleep proper
        if (settings.reactions.sleep && st.idleSec > 232) return { f: FRAMES.loaf };
        // long calm idle: the tail wraps around the front paws, content
        if (st.modeT > 25 && FRAMES.sit_wrap) return { f: FRAMES.sit_wrap };
        const tails = [FRAMES.sit, FRAMES.sit_tail_mid, FRAMES.sit_tail_up, FRAMES.sit_tail_mid];
        return { f: tails[st.tailIdx] };
      }
    }
  }

  function eyeStyle() {
    const t = now();
    if (st.mode === 'sleep') return 'closed';
    if (t < st.yawnUntil) return 'squint';     // scrunched mid-yawn
    if (t < st.slowBlinkUntil) return 'closed'; // affection cat-kiss
    if (t < st.blinkUntil) return 'closed';
    if (t < st.groomUntil && st.mode === 'idle') return 'happy'; // grooming bliss
    if (st.mode === 'pet' || st.mode === 'caught') return 'happy';
    if (st.mode === 'celebrate') return st.modeT > 0.5 ? 'happy' : 'open';
    if (st.mode === 'overheat' && st.heat > 0.85) return 'squint';
    // drowsy: heavy half-lidded eyes in the seconds before a nap
    if (st.mode === 'idle' && settings.reactions.sleep && st.idleSec > 232) return 'squint';
    return 'open';
  }

  function computeGaze() {
    // pupil slot 0..2 on each axis inside the 4x4 socket
    if (st.mode === 'think') return { gx: 0, gy: 0 };
    if (st.mode === 'listen') return { gx: 1, gy: 0 }; // all ears, looking up
    if (st.confirm) return { gx: 1, gy: 0 }; // looking up at the chip panel
    if (st.mode === 'question' || st.mode === 'menu') return { gx: 1, gy: 0 }; // looking up at the panel
    if (st.mode === 'celebrate') return { gx: 1, gy: 1 };
    if (!settings.reactions.eyeFollow) return { gx: 1, gy: 1 };
    if (st.wander.active) return st.wander.gaze;
    const b = st.catBBox; // window-space, from previous frame
    const ex = b.x + b.w / 2, ey = b.y + b.h * 0.32;
    const dx = st.cursor.x - ex, dy = st.cursor.y - ey;
    if (Math.hypot(dx, dy) < 14) return { gx: 1, gy: 1 };
    const ang = Math.atan2(dy, dx);
    const h = Math.cos(ang), v = Math.sin(ang);
    const gx = h < -0.38 ? 0 : h > 0.38 ? 2 : 1;
    const gy = v < -0.45 ? 0 : v > 0.45 ? 2 : 1;
    return { gx, gy };
  }

  function lum(hex) {
    const h = String(hex).replace('#', '');
    return 0.299 * parseInt(h.slice(0, 2), 16) + 0.587 * parseInt(h.slice(2, 4), 16) + 0.114 * parseInt(h.slice(4, 6), 16);
  }
  // marks drawn on the face (closed eyes, mouth) need contrast against the fur
  function faceInk() {
    return Math.abs(lum(skin.pupil) - lum(skin.headL)) > 50 ? skin.pupil : skin.iris;
  }

  // Kawaii resting face is mouthless (Hello Kitty rule) \u2014 the nose carries
  // it. A mouth appears only when it means something.
  function mouthStyle() {
    const t = now();
    if (t < st.yawnUntil) return 'open'; // wide yawn
    if (st.mode === 'celebrate' || (st.mode === 'overheat' && st.heat > 0.8)) return 'open';
    const sinceBoop = t - st.boopT;
    if (sinceBoop > 250 && sinceBoop < 1100) return 'mlem'; // boop \u2192 mlem
    if (t < st.blepUntil) return 'mlem';                    // the forgotten blep
    return 'none';
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = false;

    const px = settings.scale || 4;
    const { f: frame, flip } = pickFrame();
    const t = now();

    // gentle swell for the play-bow stretch — the pose itself carries it
    let anim = 1;
    if (st.mode === 'stretch') {
      const k = Math.min(1, st.modeT / 0.8);
      const remain = (st.stretchUntil - t) / 1000;
      const out = remain < 0.8 ? Math.max(0, remain / 0.8) : 1;
      anim = 1 + 0.08 * Math.min(k, out) + Math.sin(t / 300) * 0.015;
    }

    // hop offset (celebrate / quick hops / leap)
    let hop = 0;
    let landSquash = 0;
    if (st.mode === 'celebrate') {
      const cyc = Math.abs(Math.sin(st.modeT * 7));
      hop = cyc * 16;
      landSquash = Math.max(0, 1 - cyc * 3); // squash near the ground
    } else if (t < st.hopUntil) {
      hop = Math.abs(Math.sin((st.hopUntil - t) / 900 * Math.PI * 2)) * 10;
    }
    if (st.mode === 'leap') hop = 18;

    const d = st.drag;
    let sy = d.sy, sx = 1 / Math.sqrt(Math.max(0.6, d.sy));

    // idle breathing
    if (['idle', 'knead', 'scroll', 'think', 'pet'].includes(st.mode)) {
      sy *= 1 + Math.sin(t / 1900 * Math.PI * 2) * 0.012;
    } else if (st.mode === 'sleep') {
      sy *= 1 + Math.sin(t / 3400 * Math.PI * 2) * 0.018;
    }
    // boop squash (springy dip)
    const sinceBoop = t - st.boopT;
    if (sinceBoop < 260) {
      const k = Math.sin((sinceBoop / 260) * Math.PI);
      sy *= 1 - 0.12 * k;
      sx *= 1 + 0.08 * k;
    }
    // hop landing squash
    if (landSquash > 0) {
      sy *= 1 - 0.1 * landSquash;
      sx *= 1 + 0.07 * landSquash;
    }
    // jelly resettle: a quick decaying wobble when calming down from excitement
    if (st.mode === 'idle' && st.modeT < 0.7 &&
        ['celebrate', 'hunt', 'leap', 'caught', 'stretch', 'zoomies', 'drag'].includes(st.idleEnterMode)) {
      const k = Math.exp(-st.modeT * 6) * Math.sin(st.modeT * 34);
      sy *= 1 + 0.07 * k;
      sx *= 1 - 0.05 * k;
    }

    const baseY = H - 12 - hop;
    const cx = W / 2;

    // pounce wind-up: the butt wiggle before the leap
    let wiggleX = 0;
    if (st.mode === 'pounce') wiggleX = Math.round(Math.sin(t * 0.044) * px * 0.5);

    ctx.save();
    ctx.translate(cx + wiggleX, baseY);
    if (d.shear) ctx.transform(1, 0, d.shear, 1, 0, 0);
    ctx.scale(sx * anim, sy * anim);

    const ox = -(frame.w * px) / 2;
    const oy = -(frame.h * px);
    const gaze = computeGaze();
    // pupils dilate with interest: when the cursor is near, while adored,
    // locked onto prey mid-pounce, or listening intently
    let dilate = st.mode === 'pet' || st.mode === 'pounce' || st.mode === 'listen' || sinceBoop < 900;
    if (!dilate && settings.reactions.eyeFollow && st.catBBox.w) {
      const b = st.catBBox;
      const near = Math.hypot(st.cursor.x - (b.x + b.w / 2), st.cursor.y - (b.y + b.h / 2)) < b.w * 0.85;
      dilate = near;
    }
    drawCat(ctx, frame, skin, px, ox, oy, {
      flip,
      eye: { style: eyeStyle(), gx: gaze.gx, gy: gaze.gy, dilate },
      mouth: mouthStyle(),
      blush: st.mode === 'pet' || sinceBoop < 900,
      faceInk: faceInk(),
      freckles: settings.spriteStyle !== 'classic',
      tilt: t < st.tiltUntil ? st.tiltDir : 0,
      // pendulum angle -> sideways cells at the bottom row of the frame
      swing: frame.pivot != null ? Math.tan(d.swing) * (frame.h - 1 - frame.pivot) : 0,
      style: settings.skinStyle || 'plain',
      overrides: settings.pixelOverrides || null,
    });
    ctx.restore();

    // cat bbox in CSS px (for hit testing)
    const bw = frame.w * px * sx * anim, bh = frame.h * px * sy * anim;
    st.catBBox = { x: cx - bw / 2, y: baseY - bh, w: bw, h: bh };

    // scroll paper
    if (st.mode === 'scroll' && st.scrollLen > 2) drawPaper(px);

    // a freshly-caught gift sits proudly at the cat's feet
    if (st.shownGift) {
      if (t > st.shownGift.until) st.shownGift = null;
      else drawGift(ctx, st.shownGift.id, st.catBBox.x - 30, H - 12 - 27, 3);
    }

    // wake surprise
    if (t < st.wakeUntil) drawMark('!', cx + st.catBBox.w / 2 + 6, st.catBBox.y - 14, '#ffd400');

    // curious "?" beside the head tilt, on the side she leans toward
    if (t < st.tiltUntil) {
      const qx = st.tiltDir > 0 ? cx + st.catBBox.w / 2 + 8 : cx - st.catBBox.w / 2 - 18;
      drawMark('?', qx, st.catBBox.y - 14, '#9fb4d8');
    }

    // alert mark
    if (st.mode === 'alert' && Math.floor(t / 350) % 2) {
      drawMark('!', cx + st.catBBox.w / 2 + 8, st.catBBox.y - 16, '#ffd400');
    }

    // thinking dots
    if (st.mode === 'think') drawThinkDots();

    // question mark while a question is pending
    if (st.mode === 'question' && Math.floor(t / 600) % 2) {
      drawMark('?', cx + st.catBBox.w / 2 + 8, st.catBBox.y - 14, '#ffd400');
    }

    drawEffects();
    drawChip();
    drawLED();
    if (st.voice.phase !== 'idle') drawVoiceStatus();
    if (!st.menu.open) drawBubbles();
    // topmost: the "why is this light on" tooltip
    if (st.ledHover && st.ledBox) drawLEDTooltip(st.ledBox.x + 5, st.ledBox.y + 5);
  }

  // REC pill while listening (right of the head — the LED owns the left);
  // think-dots while the transcript is being chewed on
  function drawVoiceStatus() {
    const t = now();
    const b = st.catBBox;
    const x = b.x + b.w + 8, y = b.y + 4;
    if (st.voice.phase === 'listening') {
      const recS = Math.floor((t - st.voice.recStartT) / 1000);
      const remainS = Math.max(0, Math.ceil((st.voice.maxMs - (t - st.voice.recStartT)) / 1000));
      const blink = Math.floor(t / 400) % 2;
      ctx.fillStyle = '#14131a';
      ctx.fillRect(x - 2, y - 2, 10, 10);
      ctx.globalAlpha = blink ? 1 : 0.35;
      ctx.fillStyle = '#ff5d52';
      ctx.fillRect(x, y, 6, 6);
      ctx.globalAlpha = 1;
      const ending = remainS <= 5;
      const label = ending ? '0:0' + remainS : 'REC 0:' + String(Math.min(recS, 59)).padStart(2, '0');
      PixelFont.draw(ctx, label, x + 12, y, 1.5, ending ? '#ffb83d' : '#fdf8ec');
      const cxX = x + 12 + PixelFont.measure(label, 1.5) + 8;
      ctx.fillStyle = '#14131a';
      ctx.fillRect(cxX - 3, y - 3, 13, 13);
      PixelFont.draw(ctx, 'X', cxX, y, 1.5, '#fdf8ec');
      st.voice.cancelBox = { x: cxX - 3, y: y - 3, w: 13, h: 13 };
    } else if (st.voice.phase === 'transcribing' || st.voice.phase === 'routing') {
      st.voice.cancelBox = null;
      const cyc = Math.floor(t / 380) % 4;
      bubbleRect(x - 4, y - 6, 44, 16);
      PixelFont.draw(ctx, 'HMM', x, y, 1.5, '#2a2731');
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < cyc ? '#2a2731' : 'rgba(42,39,49,0.25)';
        ctx.fillRect(x + 26 + i * 5, y + 4, 3, 3);
      }
    }
  }

  // subtle agent status LED, floating left of the cat's head; hover explains it
  function drawLED() {
    const t = now();
    const { working, alert } = st.agents;
    const doneFlash = t < st.doneFlashUntil;
    if (!working && !alert && !doneFlash) { st.ledBox = null; st.ledHover = false; return; }
    const b = st.catBBox;
    const x = b.x - 13, y = b.y + 4;
    let color, pulse;
    if (alert > 0) {
      color = '#ff5d52';
      pulse = Math.floor(t / 300) % 2 ? 1 : 0.35; // urgent blink
    } else if (working > 0) {
      color = '#ffb83d';
      pulse = 0.55 + 0.45 * Math.sin(t / 480); // soft breathing pulse
    } else {
      color = '#52d273';
      pulse = 1;
    }
    ctx.fillStyle = '#14131a';
    ctx.fillRect(x - 2, y - 2, 10, 10);
    ctx.globalAlpha = Math.max(0.15, pulse);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 6, 6);
    ctx.globalAlpha = 1;
    const n = working + alert;
    if (n > 1) PixelFont.draw(ctx, String(Math.min(n, 9)), x + 1, y + 10, 1, '#fdf8ec');
    st.ledBox = { x: x - 5, y: y - 5, w: 16, h: 16 }; // generous hit area
  }

  function ledLine(d) {
    const what = d.state === 'question' ? 'ASKING YOU'
      : d.state === 'alert' ? 'NEEDS YOU'
      : 'WORKING';
    const age = d.sinceMin >= 1 ? ` ${d.sinceMin}M` : '';
    return `${d.agent}${d.project ? ' (' + d.project.toUpperCase() + ')' : ''}: ${what}${age}`;
  }

  function drawLEDTooltip(lx, ly) {
    const details = st.agents.details || [];
    const lines = [];
    for (const d of details.slice(0, 4)) {
      lines.push(ledLine(d));
      if (d.msg && d.state !== 'thinking') lines.push('  ' + truncate(d.msg.toUpperCase(), 38));
    }
    if (now() < st.doneFlashUntil && !lines.length) lines.push('JUST FINISHED!');
    if (!lines.length) return;
    lines.push('CLICK TO JUMP THERE');
    const px = 1.5;
    const lh = 7 * px;
    const w = Math.max(...lines.map((l) => PixelFont.measure(l, px))) + 12;
    const h = lines.length * lh + 8;
    const x = Math.max(4, Math.min(W - w - 4, lx - 4));
    const y = Math.max(4, ly - h - 8);
    ctx.fillStyle = '#14131a';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#262430';
    ctx.fillRect(x, y, w, h);
    lines.forEach((l, i) => {
      const last = i === lines.length - 1;
      PixelFont.draw(ctx, l, x + 6, y + 5 + i * lh, px, last ? '#8a8794' : i % 2 === 0 || !l.startsWith(' ') ? '#fdf8ec' : '#b9b4c4');
    });
  }

  function drawMark(chr, x, y, color) {
    PixelFont.draw(ctx, chr, x, y, 3, color);
  }

  function drawPaper(px) {
    const b = st.catBBox;
    const y = H - 12 - px * 2;
    const len = st.scrollLen * px * 0.8;
    const x0 = b.x - len;
    ctx.fillStyle = '#fffdf5';
    ctx.fillRect(x0, y, len + b.w * 0.35, px * 1.6);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(x0 + 8 + i * (len / 4 + 6), y + px * 0.5, Math.max(4, len / 7), px * 0.4);
    }
    // the roll
    ctx.fillStyle = '#fffdf5';
    ctx.fillRect(x0 - px * 1.5, y - px * 1.2, px * 2.4, px * 2.4 + px * 1.2);
    ctx.fillStyle = '#d8d2c2';
    ctx.fillRect(x0 - px * 0.8, y - px * 0.5, px, px);
  }

  function drawThinkDots() {
    const b = st.catBBox;
    const x = b.x + b.w + 8, y = b.y - 6;
    const cyc = Math.floor(now() / 380) % 4;
    bubbleRect(x - 4, y - 6, 34, 16);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i < cyc ? '#2a2731' : 'rgba(42,39,49,0.25)';
      ctx.fillRect(x + i * 10, y, 5, 5);
    }
  }

  function drawEffects() {
    for (const p of st.effects) {
      const a = Math.max(0, Math.min(1, p.life / (p.maxLife * 0.6)));
      ctx.globalAlpha = a;
      if (p.type === 'heart') {
        PixelFont.draw(ctx, '♥', p.x, p.y, 2, '#f4728c');
      } else if (p.type === 'z') {
        PixelFont.draw(ctx, 'Z', p.x, p.y, 2, '#9fb4d8');
      } else if (p.type === 'steam') {
        ctx.fillStyle = '#cfd6e4';
        const s = 4 + (1 - a) * 5;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      } else if (p.type === 'sparkle') {
        ctx.fillStyle = '#ffd400';
        ctx.fillRect(p.x - 1, p.y - 4, 2, 10);
        ctx.fillRect(p.x - 4, p.y - 1, 10, 2);
      } else if (p.type === 'dream') {
        // a thought bubble with a little fish inside
        ctx.fillStyle = 'rgba(20,19,26,0.9)';
        ctx.fillRect(p.x - 9, p.y - 7, 18, 14);
        ctx.fillStyle = '#fffef8';
        ctx.fillRect(p.x - 8, p.y - 6, 16, 12);
        ctx.fillRect(p.x - 11, p.y + 8, 3, 3); // trailing dot
        ctx.fillStyle = '#7fa8d8';
        ctx.fillRect(p.x - 4, p.y - 2, 6, 4);  // fish body
        ctx.fillRect(p.x + 2, p.y - 3, 2, 3);  // tail fin up
        ctx.fillRect(p.x + 2, p.y + 1, 2, 3);  // tail fin down
        ctx.fillStyle = '#14131a';
        ctx.fillRect(p.x - 3, p.y - 1, 2, 2);  // eye
      }
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------ UI pieces
  function bubbleRect(x, y, w, h) {
    ctx.fillStyle = '#14131a';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#fffef8';
    ctx.fillRect(x, y, w, h);
  }

  function wrapText(text, maxPx, px) {
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const cand = cur ? cur + ' ' + w : w;
      if (PixelFont.measure(cand, px) > maxPx && cur) {
        lines.push(cur);
        cur = w;
      } else cur = cand;
    }
    if (cur) lines.push(cur);
    return lines.slice(0, 4);
  }

  function drawBubbles() {
    const t = now();
    let topY = st.catBBox.y - 10;

    if (st.bubble && t > st.bubble.until) st.bubble = null;
    if (!st.bubble) st.bubbleBox = null;

    if (st.confirm) {
      // freshest ask wins; a pending agent question reappears afterwards
      const sitTop = H - 12 - FRAMES.sit.h * (settings.scale || 4);
      topY = drawConfirmPanel(sitTop - 6) - 8;
    } else if (st.question) {
      // stable anchor: the panel must not bounce while the cat hops/celebrates
      const sitTop = H - 12 - FRAMES.sit.h * (settings.scale || 4);
      topY = drawQuestionPanel(sitTop - 6) - 8;
    } else if (st.bubble) {
      topY = drawSpeech(st.bubble.text, topY, '#fffef8', '#14131a') - 8;
    }

    // pinned note
    if (settings.fixedMessage && settings.fixedMessage.enabled && settings.fixedMessage.text) {
      drawPinned(settings.fixedMessage.text.toUpperCase(), topY);
    }
  }

  // interactive question panel: actual options from AskUserQuestion
  function drawQuestionPanel(bottomY) {
    const q = st.question;
    const px = 2;
    const w = Math.min(W - 16, 330);
    const x = W / 2 - w / 2;
    const lh = 7 * px;
    const qLines = wrapText(q.question.toUpperCase(), w - 20, px).slice(0, 3);
    const optH = 16;
    const showOptions = q.options.length > 0;
    const footH = 16;
    const noteH = q.canType ? 0 : 12;
    const h = 16 + qLines.length * lh + 4 + (showOptions ? q.options.length * (optH + 3) : 0) + noteH + footH + 8;
    const y = bottomY - h - 8;

    // frame
    ctx.fillStyle = '#14131a';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#fffef8';
    ctx.fillRect(x, y, w, h);
    // tail to the cat
    ctx.fillStyle = '#14131a';
    ctx.fillRect(W / 2 - 4, y + h + 2, 8, 4);
    ctx.fillStyle = '#fffef8';
    ctx.fillRect(W / 2 - 2, y + h, 4, 4);

    // title strip
    ctx.fillStyle = '#ffd400';
    ctx.fillRect(x, y, w, 12);
    const title = `${q.agent} ASKS${q.header ? ' · ' + q.header.toUpperCase() : ''}`;
    PixelFont.draw(ctx, title, x + 6, y + 3, px, '#14131a');

    let cy = y + 16;
    for (const line of qLines) {
      PixelFont.draw(ctx, line, x + 8, cy, px, '#14131a');
      cy += lh;
    }
    cy += 4;

    q.boxes = [];
    if (showOptions) {
      q.options.forEach((label, i) => {
        const bx = x + 8, bw = w - 16, by = cy;
        const hovered = q.hover === i && q.canType;
        ctx.fillStyle = '#14131a';
        ctx.fillRect(bx - 1, by - 1, bw + 2, optH + 2);
        ctx.fillStyle = hovered ? '#ffd400' : q.canType ? '#2a2933' : '#3a3942';
        ctx.fillRect(bx, by, bw, optH);
        const fg = hovered ? '#14131a' : '#fdf8ec';
        PixelFont.draw(ctx, String(i + 1), bx + 5, by + 5, px, hovered ? '#14131a' : '#ffd400');
        PixelFont.draw(ctx, truncate(label.toUpperCase(), 30), bx + 16, by + 5, px, fg);
        q.boxes.push({ x: bx, y: by, w: bw, h: optH });
        cy += optH + 3;
      });
    }

    if (!q.canType) {
      PixelFont.draw(ctx, q.multiSelect ? 'MULTI-SELECT: ANSWER IN TERMINAL' : 'ANSWER IN TERMINAL', x + 8, cy + 1, 1.5, '#8a8794');
      cy += noteH;
    }

    // footer: status or buttons
    const fy = cy + 2;
    let statusText = null;
    if (q.status.startsWith('typed:')) statusText = 'TYPED INTO ' + q.status.slice(6).toUpperCase();
    else if (q.status.startsWith('focused:')) statusText = 'OPENED ' + q.status.slice(8).toUpperCase();
    else if (q.status === 'notfound') statusText = 'WINDOW NOT FOUND';
    if (statusText) {
      PixelFont.draw(ctx, statusText, x + 8, fy + 3, 1.5, '#8a8794');
    }
    const mkBtn = (label, bx) => {
      const bw = PixelFont.measure(label, 1.5) + 10;
      ctx.fillStyle = '#14131a';
      ctx.fillRect(bx - bw, fy, bw, 12);
      PixelFont.draw(ctx, label, bx - bw + 5, fy + 3, 1.5, '#fdf8ec');
      return { x: bx - bw, y: fy, w: bw, h: 12 };
    };
    q.dismissBox = mkBtn('DISMISS', x + w - 6);
    q.openBox = q.tty ? mkBtn('OPEN', q.dismissBox.x - 5) : null;

    q.panelBox = { x: x - 2, y: y - 2, w: w + 4, h: h + 6 };
    return y;
  }

  function truncate(s, n) {
    return s.length > n ? s.slice(0, n) : s;
  }

  // shared confirm-chip panel: voice intents, todo follow-ups, wind-down.
  // Same visual language as the question panel; chips flow left to right.
  function drawConfirmPanel(bottomY) {
    const c = st.confirm;
    const px = 2;
    const w = Math.min(W - 16, 330);
    const x = W / 2 - w / 2;
    const lh = 7 * px;
    const lines = wrapText(String(c.text || '').toUpperCase(), w - 20, px).slice(0, 3);
    const chipH = 16;

    // flow chips into rows
    const rows = [];
    let row = [], rowW = 0;
    for (const ch of c.chips) {
      const cw = Math.max(34, PixelFont.measure(String(ch.label).toUpperCase(), 1.5) + 14);
      if (rowW + cw + 4 > w - 16 && row.length) { rows.push(row); row = []; rowW = 0; }
      row.push({ ...ch, w: cw });
      rowW += cw + 4;
    }
    if (row.length) rows.push(row);

    const footH = 14;
    const h = 16 + lines.length * lh + 4 + rows.length * (chipH + 4) + footH + 6;
    const y = bottomY - h - 8;

    // frame + tail to the cat
    ctx.fillStyle = '#14131a';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#fffef8';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#14131a';
    ctx.fillRect(W / 2 - 4, y + h + 2, 8, 4);
    ctx.fillStyle = '#fffef8';
    ctx.fillRect(W / 2 - 2, y + h, 4, 4);

    // title strip
    ctx.fillStyle = '#ffd400';
    ctx.fillRect(x, y, w, 12);
    PixelFont.draw(ctx, String(c.title || '').toUpperCase(), x + 6, y + 3, px, '#14131a');

    let cy = y + 16;
    for (const line of lines) {
      PixelFont.draw(ctx, line, x + 8, cy, px, '#14131a');
      cy += lh;
    }
    cy += 4;

    c.boxes = [];
    let bi = 0;
    for (const r of rows) {
      let bx = x + 8;
      for (const ch of r) {
        const hovered = c.hover === bi;
        const primary = ch.id === 'confirm' || ch.id === 'done';
        ctx.fillStyle = '#14131a';
        ctx.fillRect(bx - 1, cy - 1, ch.w + 2, chipH + 2);
        ctx.fillStyle = hovered ? '#ffd400' : '#2a2933';
        ctx.fillRect(bx, cy, ch.w, chipH);
        PixelFont.draw(ctx, String(ch.label).toUpperCase(), bx + 7, cy + 5, 1.5,
          hovered ? '#14131a' : primary ? '#ffd400' : '#fdf8ec');
        if (c.autoAt && ch.id === 'confirm' && !c.autoFired) {
          // countdown bar drains under the chip that will fire
          const rem = Math.max(0, c.autoAt - now());
          ctx.fillStyle = '#ffd400';
          ctx.fillRect(bx, cy + chipH - 3, ch.w * Math.min(1, rem / c.autoTotalMs), 3);
        }
        c.boxes.push({ x: bx, y: cy, w: ch.w, h: chipH, id: ch.id });
        bx += ch.w + 4;
        bi++;
      }
      cy += chipH + 4;
    }

    // footer: hint + dismiss
    const fy = cy;
    let hint = null;
    if (c.autoAt && !c.autoFired) hint = 'AUTO IN ' + Math.max(0, Math.ceil((c.autoAt - now()) / 1000)) + 'S';
    else if (c.kind === 'voice') hint = 'NEEDS A CLICK';
    if (hint) PixelFont.draw(ctx, hint, x + 8, fy + 3, 1.5, '#8a8794');
    const bw = PixelFont.measure('DISMISS', 1.5) + 10;
    ctx.fillStyle = '#14131a';
    ctx.fillRect(x + w - 6 - bw, fy, bw, 12);
    PixelFont.draw(ctx, 'DISMISS', x + w - 6 - bw + 5, fy + 3, 1.5, '#fdf8ec');
    c.dismissBox = { x: x + w - 6 - bw, y: fy, w: bw, h: 12 };

    c.panelBox = { x: x - 2, y: y - 2, w: w + 4, h: h + 6 };
    return y;
  }

  // ------------------------------------------------------------- paw menu
  function toggleMenu() {
    if (st.menu.open && !st.menu.closing) closeMenu();
    else openMenu();
  }
  function openMenu(page = 'root') {
    st.menu.open = true;
    st.menu.closing = false;
    st.menu.page = page;
    st.menu.hover = -1;
    st.menu.anim = Math.max(st.menu.anim, 0.0001);
    st.menu.lastTouchT = now();
    st.bubble = null;
    CatAudio.pop();
  }
  function closeMenu() {
    if (!st.menu.open) return;
    st.menu.closing = true;
  }


  // ------------------------------------------- modern DOM panel for the menu
  const ui = document.getElementById('ui');
  let panelEl = null;

  function mkIcon(name, color = '#ffd400') {
    const cv = document.createElement('canvas');
    cv.width = 18; cv.height = 18;
    cv.className = 'ic';
    drawIcon(cv.getContext('2d'), name, 0, 0, 2, color);
    return cv;
  }

  function fmtDue(due) {
    const d = new Date(due);
    const today = new Date();
    const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === today.toDateString()) return hh;
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hh;
  }

  function menuTitle() {
    const p = st.menu.page;
    const nm = (settings.catName || '').trim();
    return p === 'root' ? (nm ? nm + "'s menu" : 'Cat menu')
      : p === 'apps' ? 'Apps' : p === 'tasks' ? 'To-dos' : p === 'inbox' ? 'Inbox'
      : p === 'journal' ? 'Journal' : p === 'shelf' ? 'Shelf' : 'More';
  }

  function row(opts) {
    const el = document.createElement('div');
    el.className = 'row' + (opts.cls ? ' ' + opts.cls : '');
    if (opts.check != null) {
      const c = document.createElement('div');
      c.className = 'check' + (opts.check ? ' on' : '');
      el.appendChild(c);
    } else if (opts.giftId) {
      const cv = document.createElement('canvas');
      // 9x9 art + the sticker keyline/rim rings (2 cells each side) at px 2
      cv.width = 26; cv.height = 26;
      cv.className = 'ic';
      cv.style.width = '26px'; cv.style.height = '26px'; // rings need the room
      drawGift(cv.getContext('2d'), opts.giftId, 4, 4, 2);
      el.appendChild(cv);
    } else {
      el.appendChild(mkIcon(opts.icon || 'dot', opts.iconColor));
    }
    const tx = document.createElement('div');
    tx.className = 'tx';
    const lb = document.createElement('div');
    lb.className = 'lb' + (opts.done ? ' done' : '');
    lb.textContent = opts.label;
    tx.appendChild(lb);
    if (opts.hint) {
      const h = document.createElement('div');
      h.className = 'hint';
      h.textContent = opts.hint;
      tx.appendChild(h);
    }
    el.appendChild(tx);
    if (opts.chip) {
      const chip = document.createElement('div');
      chip.className = 'due' + (opts.chipCls ? ' ' + opts.chipCls : '');
      chip.textContent = opts.chip;
      if (opts.onChip) chip.addEventListener('mousedown', (e) => { e.stopPropagation(); CatAudio.pop(); opts.onChip(); });
      el.appendChild(chip);
    }
    if (opts.onClick) {
      el.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        st.menu.lastTouchT = now();
        CatAudio.pop();
        opts.onClick();
      });
    }
    return el;
  }

  function renderMenuDom() {
    if (!panelEl) return;
    panelEl.innerHTML = '';
    const title = document.createElement('div');
    title.className = 'panel-title';
    title.innerHTML = `<span>${menuTitle()}</span><span class="esc">click away to close</span>`;
    panelEl.appendChild(title);

    const goto = (page) => () => { st.menu.page = page; renderMenuDom(); };
    const act = (a, close = true) => () => { miru.menuAction(a); if (close) closeMenu(); };
    const tasks = settings.tasks || [];
    const open = tasks.filter((t) => !t.done);

    if (st.menu.page === 'root') {
      const appsHint = (settings.launcher.apps || []).map((a) => a.label).join(' · ') || 'none set';
      panelEl.appendChild(row({ icon: 'mic', label: 'Talk', hint: 'ask · todo · note · agent', onClick: act({ type: 'talk' }) }));
      panelEl.appendChild(row({ icon: 'mic', label: 'Dictate', hint: 'type with your voice (Murmur)', onClick: act({ type: 'voice' }) }));
      panelEl.appendChild(row({ icon: 'rocket', label: 'Apps', hint: appsHint.toLowerCase(), onClick: goto('apps') }));
      const dueSoon = open.filter((t) => t.due && t.due - Date.now() < 3600000).length;
      panelEl.appendChild(row({
        icon: 'tasks', label: 'To-dos',
        hint: `${open.length} open${dueSoon ? ` · ${dueSoon} due soon` : ''}`,
        onClick: goto('tasks'),
      }));
      panelEl.appendChild(row({ icon: 'msg', label: 'Inbox', hint: `${st.inbox.length} message${st.inbox.length === 1 ? '' : 's'}`, onClick: goto('inbox') }));
      panelEl.appendChild(row({ icon: 'gear', label: 'More', hint: 'journal · shelf · settings', onClick: goto('more') }));
    } else if (st.menu.page === 'apps') {
      for (const a of settings.launcher.apps || []) {
        panelEl.appendChild(row({ icon: 'app', label: a.label, hint: a.app, onClick: act({ type: 'app', app: a.app }) }));
      }
      if (!(settings.launcher.apps || []).length) {
        const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'No apps yet — add them in Settings → Launcher.';
        panelEl.appendChild(e);
      }
      panelEl.appendChild(sep());
      panelEl.appendChild(row({ icon: 'back', label: 'Back', onClick: goto('root') }));
    } else if (st.menu.page === 'tasks') {
      const shown = [...tasks.filter((t) => !t.done), ...tasks.filter((t) => t.done)].slice(0, 6);
      for (const t of shown) {
        const overdue = t.due && !t.done && t.due < Date.now();
        panelEl.appendChild(row({
          cls: 'task', check: !!t.done, done: t.done, label: t.text,
          chip: t.due ? (overdue ? 'snooze +10m' : fmtDue(t.due)) : null,
          chipCls: overdue ? 'overdue snooze' : '',
          onChip: overdue ? () => miru.tasksSnooze(t.id) : null,
          onClick: () => miru.tasksToggle(t.id),
        }));
      }
      if (!shown.length) {
        const e = document.createElement('div'); e.className = 'empty';
        e.textContent = 'Nothing yet. Try: "standup @ 9:30" or "call mom @ +30m"';
        panelEl.appendChild(e);
      }
      // inline add
      const bar = document.createElement('div');
      bar.className = 'addbar';
      const input = document.createElement('input');
      input.id = 'todoInput';
      input.placeholder = 'Add… e.g. review PR @ 16:30';
      input.addEventListener('mousedown', (e) => { e.stopPropagation(); miru.setFocusable(true); setTimeout(() => input.focus(), 60); });
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        st.menu.lastTouchT = now();
        if (e.key === 'Enter') submit();
      });
      const btn = document.createElement('button');
      btn.textContent = 'Add';
      const submit = () => {
        const v = input.value.trim();
        if (!v) return;
        miru.tasksAdd(v);
        input.value = '';
        CatAudio.pop();
      };
      btn.addEventListener('mousedown', (e) => { e.stopPropagation(); submit(); });
      bar.appendChild(input);
      bar.appendChild(btn);
      panelEl.appendChild(bar);
      if (tasks.some((t) => t.done)) {
        panelEl.appendChild(row({ icon: 'check', label: 'Clear done', onClick: () => miru.tasksClearDone() }));
      }
      panelEl.appendChild(sep());
      panelEl.appendChild(row({ icon: 'back', label: 'Back', onClick: goto('root') }));
    } else if (st.menu.page === 'inbox') {
      const items = st.inbox || [];
      items.slice(0, 8).forEach((m, i) => {
        const expanded = st.menu.inboxExpanded === i;
        const age = Math.max(0, Math.round((Date.now() - m.t) / 60000));
        const when = new Date(m.t);
        const hh = String(when.getHours()).padStart(2, '0') + ':' + String(when.getMinutes()).padStart(2, '0');
        panelEl.appendChild(row({
          cls: expanded ? 'wrap' : 'msgrow',
          icon: 'msg', label: m.text,
          hint: expanded ? `${m.kind || 'message'} · ${hh} · ${age < 60 ? age + 'm ago' : Math.round(age / 60) + 'h ago'}` : null,
          chip: expanded ? null : age < 60 ? age + 'm' : Math.round(age / 60) + 'h',
          onClick: () => { st.menu.inboxExpanded = expanded ? null : i; renderMenuDom(); },
        }));
      });
      if (!items.length) {
        const e = document.createElement('div'); e.className = 'empty'; e.textContent = 'Reminders, agent turns and /say messages land here.';
        panelEl.appendChild(e);
      }
      if (items.length) {
        panelEl.appendChild(row({ icon: 'check', label: 'Clear inbox', onClick: () => { miru.inboxClear(); st.menu.inboxExpanded = null; } }));
      }
      panelEl.appendChild(sep());
      panelEl.appendChild(row({ icon: 'back', label: 'Back', onClick: goto('root') }));
    } else if (st.menu.page === 'journal') {
      const b = st.bond || {};
      const hearts = '♥'.repeat(b.level || 1) + '♡'.repeat(Math.max(0, 5 - (b.level || 1)));
      const levelNames = ['', 'New friends', 'Warming up', 'Buddies', 'Close', 'Soulmates'];
      const c = b.counters || {};
      const r = b.records || {};
      panelEl.appendChild(row({ icon: 'dot', label: `${hearts}  ${levelNames[b.level || 1]}`, hint: 'grows with pets, to-dos, focus, agent runs' }));
      panelEl.appendChild(row({ icon: 'dot', label: `${b.daysTogether || 0} days together`, hint: b.adoptedAt ? 'since ' + new Date(b.adoptedAt).toLocaleDateString() : null }));
      panelEl.appendChild(row({ icon: 'dot', label: `Streak: ${b.streak || 0} (best ${b.bestStreak || 0})`, hint: 'weekends never break it' }));
      panelEl.appendChild(row({ icon: 'tasks', label: `${c.todosDone || 0} to-dos · ${c.pomodoros || 0} pomodoros`, hint: `best day: ${r.todosInDay || 0} to-dos, ${r.pomodorosInDay || 0} pomodoros` }));
      panelEl.appendChild(row({ icon: 'mic', label: `${c.pets || 0} pets · ${c.boops || 0} boops`, hint: `${c.agentRuns || 0} agent runs watched together` }));
      panelEl.appendChild(sep());
      panelEl.appendChild(row({ icon: 'back', label: 'Back', onClick: goto('more') }));
    } else if (st.menu.page === 'shelf') {
      const giftsOwned = (st.bond && st.bond.gifts) || [];
      const counts = {};
      for (const g of giftsOwned) counts[g.id] = (counts[g.id] || 0) + 1;
      const ids = Object.keys(counts);
      ids.slice(0, 6).forEach((id) => {
        const g = GIFTS[id] || { name: id, rarity: '?' };
        panelEl.appendChild(row({
          giftId: id, label: g.name + (counts[id] > 1 ? ` ×${counts[id]}` : ''),
          hint: g.rarity, cls: 'msgrow',
        }));
      });
      if (!ids.length) {
        const e = document.createElement('div'); e.className = 'empty';
        e.textContent = 'Nothing yet — it hunts at night, after good days together.';
        panelEl.appendChild(e);
      } else {
        const e = document.createElement('div'); e.className = 'empty';
        e.textContent = `${ids.length}/${Object.keys(GIFTS).length} kinds collected`;
        panelEl.appendChild(e);
      }
      panelEl.appendChild(sep());
      panelEl.appendChild(row({ icon: 'back', label: 'Back', onClick: goto('more') }));
    } else {
      panelEl.appendChild(row({ icon: 'dot', label: 'Journal', hint: 'your story so far', onClick: goto('journal') }));
      panelEl.appendChild(row({ icon: 'dot', label: 'Shelf', hint: 'gifts it caught for you', onClick: goto('shelf') }));
      panelEl.appendChild(row({ icon: 'gear', label: 'Settings', onClick: act({ type: 'settings' }) }));
      panelEl.appendChild(row({ icon: 'rocket', label: 'Stretch now', onClick: act({ type: 'stretch' }) }));
      panelEl.appendChild(row({ icon: 'dot', label: 'Hide cat', onClick: act({ type: 'hide' }) }));
      panelEl.appendChild(row({ icon: 'dot', label: 'Quit Miru', onClick: act({ type: 'quit' }, false) }));
      panelEl.appendChild(sep());
      panelEl.appendChild(row({ icon: 'back', label: 'Back', onClick: goto('root') }));
    }
  }

  function sep() {
    const s = document.createElement('div');
    s.className = 'sep';
    return s;
  }

  function syncMenuDom() {
    const m = st.menu;
    if (m.open && !panelEl) {
      panelEl = document.createElement('div');
      panelEl.className = 'panel';
      const sitTop = H - 12 - FRAMES.sit.h * (settings.scale || 4);
      panelEl.style.bottom = (H - sitTop + 14) + 'px';
      ui.appendChild(panelEl);
      renderMenuDom();
      requestAnimationFrame(() => panelEl && panelEl.classList.add('open'));
    } else if (!m.open && panelEl) {
      panelEl.remove();
      panelEl = null;
      miru.setFocusable(false);
    } else if (m.open && panelEl) {
      panelEl.classList.toggle('open', !m.closing);
    }
  }

  function drawSpeech(text, bottomY, bg, fg) {
    const px = 2;
    const maxW = W - 30;
    const lines = wrapText(text, maxW, px);
    const lh = 7 * px;
    const w = Math.min(maxW, Math.max(...lines.map((l) => PixelFont.measure(l, px)))) + 16;
    const h = lines.length * lh + 10;
    const x = Math.max(4, Math.min(W - w - 4, W / 2 - w / 2));
    const y = bottomY - h - 8;
    st.bubbleBox = { x: x - 2, y: y - 2, w: w + 4, h: h + 12 }; // clickable -> inbox
    ctx.fillStyle = '#14131a';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = bg;
    ctx.fillRect(x, y, w, h);
    // tail
    ctx.fillStyle = '#14131a';
    ctx.fillRect(W / 2 - 4, y + h + 2, 8, 4);
    ctx.fillStyle = bg;
    ctx.fillRect(W / 2 - 2, y + h, 4, 4);
    lines.forEach((l, i) => {
      const lw = PixelFont.measure(l, px);
      PixelFont.draw(ctx, l, x + (w - lw) / 2, y + 6 + i * lh, px, fg);
    });
    return y;
  }

  function drawPinned(text, bottomY) {
    const px = 2;
    const maxW = W - 40;
    const lines = wrapText(text, maxW, px);
    const lh = 7 * px;
    const w = Math.min(maxW, Math.max(...lines.map((l) => PixelFont.measure(l, px)))) + 18;
    const h = lines.length * lh + 10;
    const x = W / 2 - w / 2;
    const y = bottomY - h - 6;
    ctx.fillStyle = '#14131a';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = '#ffe98a';
    ctx.fillRect(x, y, w, h);
    // pin
    ctx.fillStyle = '#e0483e';
    ctx.fillRect(x + w / 2 - 2, y - 5, 5, 5);
    lines.forEach((l, i) => {
      const lw = PixelFont.measure(l, px);
      PixelFont.draw(ctx, l, x + (w - lw) / 2, y + 6 + i * lh, px, '#14131a');
    });
  }

  function drawChip() {
    st.chipBBox = null;
    const p = st.pom;
    if (!p || p.phase === 'off') return;
    const px = 2;
    const label = p.phase === 'focus' ? 'FOCUS' : p.phase === 'long' ? 'CHILL' : 'BREAK';
    const time = fmt(p.remaining);
    const tw = Math.max(PixelFont.measure(label, px), PixelFont.measure(time, px + 1));
    const w = tw + 16, h = 30;
    let x = st.catBBox.x + st.catBBox.w + 8;
    if (x + w > W - 4) x = st.catBBox.x - w - 8;
    const y = st.catBBox.y + st.catBBox.h - h - 4;
    ctx.fillStyle = '#14131a';
    ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
    ctx.fillStyle = p.paused ? '#6a6a74' : p.phase === 'focus' ? '#e0483e' : '#3ba55d';
    ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = '#1f1e26';
    ctx.fillRect(x, y + 4, w, h - 4);
    PixelFont.draw(ctx, label, x + 8, y + 8, px, '#9a98a6');
    PixelFont.draw(ctx, p.paused ? 'II ' + time : time, x + 8, y + 8 + 8, px + 1, '#fffef8');
    st.chipBBox = { x, y, w, h };
  }

  function fmt(sec) {
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  // -------------------------------------------------------------- main loop
  let lastT = now();
  function loop() {
    const t = now();
    const dt = Math.min(0.1, (t - lastT) / 1000);
    lastT = t;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  loop();

  // test hook: trigger a ritual directly so scenarios don't wait minutes
  // (ambient groom/blep schedulers are inert under the harness — st.testMode)
  window.__catPoke = (what) => {
    const t = now();
    if (what === 'groom') st.groomUntil = t + 2800;
    else if (what === 'blep') st.blepUntil = t + 2600;
    else if (what === 'dream') st.nextDreamT = t - 1;
    else if (what === 'tilt') { st.nextTiltT = t - 1; st.hoverStartT = t - 800; }
    else if (what === 'wrap') st.modeT = 26; // long-calm-idle shortcut
    return what;
  };

  window.__catDebug = () => ({
    ready: true,
    mode: st.mode,
    heat: +st.heat.toFixed(3),
    kps: st.kps,
    scrollLen: Math.round(st.scrollLen),
    bubble: st.bubble ? st.bubble.text : null,
    bubbleBox: st.bubbleBox || null,
    pinned: !!(settings.fixedMessage && settings.fixedMessage.enabled && settings.fixedMessage.text),
    pom: st.pom ? { phase: st.pom.phase, paused: !!st.pom.paused, remaining: st.pom.remaining } : null,
    pet: st.pet.active,
    petMeter: Math.round(st.pet.meter),
    dragActive: st.drag.active,
    draggingEngaged: st.draggingEngaged,
    hunt: st.hunt.phase,
    gaze: computeGaze(),
    eyeStyle: eyeStyle(),
    mouthStyle: mouthStyle(),
    voicePhase: st.voice.phase,
    bubbleKind: st.bubble ? st.bubble.kind : null,
    confirm: st.confirm ? {
      cid: st.confirm.cid, kind: st.confirm.kind, title: st.confirm.title,
      text: st.confirm.text, chips: st.confirm.chips.map((ch) => ch.label),
      chipIds: st.confirm.chips.map((ch) => ch.id),
      boxes: st.confirm.boxes, dismissBox: st.confirm.dismissBox, panelBox: st.confirm.panelBox,
      autoRemainMs: st.confirm.autoAt && !st.confirm.autoFired
        ? Math.max(0, Math.round(st.confirm.autoAt - now())) : null,
    } : null,
    frame: (() => { const f = pickFrame().f; for (const k in FRAMES) if (FRAMES[k] === f) return k; return null; })(),
    grooming: now() < st.groomUntil,
    tilting: now() < st.tiltUntil,
    tiltDir: st.tiltDir,
    dreamTwitching: now() < st.dreamTwitchUntil,
    blep: now() < st.blepUntil,
    effects: st.effects.map((p) => p.type),
    yawning: now() < st.yawnUntil,
    slowBlinking: now() < st.slowBlinkUntil,
    sinceSlowBlinkMs: Math.round(now() - st.slowBlinkAt),
    sinceBoopMs: Math.round(now() - st.boopT),
    catBBox: st.catBBox,
    chipBBox: st.chipBBox,
    interactive: st.interactive,
    idleSec: st.idleSec,
    agents: st.agents,
    ledBox: st.ledBox,
    ledHover: st.ledHover,
    doneFlash: now() < st.doneFlashUntil,
    lastInput: st.lastInput || null,
    mouseDownArmed: !!st.mouseDown,
    menu: st.menu.open && panelEl ? (() => {
      const rows = [...panelEl.querySelectorAll('.row')];
      const rect = (r) => ({ x: r.left, y: r.top, w: r.width, h: r.height });
      const pr = panelEl.getBoundingClientRect();
      return {
        page: st.menu.page,
        title: (panelEl.querySelector('.panel-title span') || {}).textContent || '',
        anim: +st.menu.anim.toFixed(2),
        labels: rows.map((r) => (r.querySelector('.lb') || {}).textContent || ''),
        boxes: rows.map((r) => rect(r.getBoundingClientRect())),
        chips: [...panelEl.querySelectorAll('.due')].map((c) => ({ text: c.textContent, ...rect(c.getBoundingClientRect()) })),
        hasInput: !!panelEl.querySelector('#todoInput'),
        panelBox: rect(pr),
      };
    })() : null,
    overridesCount: settings.pixelOverrides ? Object.keys(settings.pixelOverrides).length : 0,
    bond: { xp: st.bond.xp, level: st.bond.level, gifts: (st.bond.gifts || []).length, streak: st.bond.streak, daysTogether: st.bond.daysTogether },
    shownGift: st.shownGift ? st.shownGift.id : null,
    tasksOpen: (settings.tasks || []).filter((t) => !t.done).length,
    tasksDone: (settings.tasks || []).filter((t) => t.done).length,
    inboxCount: st.inbox.length,
    question: st.question ? {
      qid: st.question.qid,
      options: st.question.options,
      canType: st.question.canType,
      status: st.question.status,
      boxes: st.question.boxes,
      openBox: st.question.openBox,
      dismissBox: st.question.dismissBox,
      panelBox: st.question.panelBox,
    } : null,
    skin: settings.skin,
  });

  // a named cat introduces itself once per launch
  setTimeout(() => {
    const nm = (settings.catName || '').trim();
    if (nm) showBubble(`HI, I'M ${nm.toUpperCase()}!`, 4500);
  }, 1600);

  window.__catReady = true;
})();
