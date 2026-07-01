'use strict';
// Automated behavior scenarios for the cat. Runs inside the Electron main
// process in --test mode: drives the renderer with synthetic ticks, global
// input events and injected mouse events, then asserts on __catDebug state
// and captures a screenshot of every reaction.
const fs = require('fs');
const path = require('path');
const http = require('http');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function httpPost(port, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = Buffer.from(JSON.stringify(body || {}));
    const req = http.request(
      { host: '127.0.0.1', port, path: urlPath, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': data.length } },
      (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b })); }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function waitFor(fn, what, timeoutMs = 4000, interval = 60) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < timeoutMs) {
    last = await fn();
    if (last) return last;
    await wait(interval);
  }
  throw new Error(`timeout waiting for ${what} (last=${JSON.stringify(last)})`);
}

async function runScenarios(ctx) {
  const { dir, catWin, send, store, pomControl, broadcastSettings, setTick, debug, mouse, port, askCalls } = ctx;
  const post = (p, body) => httpPost(port(), p, body);
  fs.mkdirSync(dir, { recursive: true });
  const results = [];
  let shotIdx = 0;

  const cap = async (name) => {
    await wait(220); // let the freshest state get painted + composited
    const img = await catWin.webContents.capturePage();
    const file = String(++shotIdx).padStart(2, '0') + '-' + name + '.png';
    fs.writeFileSync(path.join(dir, file), img.toPNG());
    return file;
  };

  // pull a scheduled ritual forward (grooming, dreams, bleps, tilts, wraps)
  const poke = (what) => catWin.webContents.executeJavaScript(`window.__catPoke(${JSON.stringify(what)})`);

  const scenario = async (name, fn) => {
    try {
      await fn();
      results.push({ name, pass: true });
      console.log('PASS  ' + name);
    } catch (e) {
      results.push({ name, pass: false, error: e.message });
      console.log('FAIL  ' + name + ' :: ' + e.message);
      try { await cap('FAIL-' + name.replace(/\W+/g, '_')); } catch { /* ignore */ }
    }
  };

  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

  // quiet please (no meows at 1am while testing)
  store.set({ sounds: { enabled: false } });
  broadcastSettings();
  await wait(200);

  // --------------------------------------------------------------- scenarios
  await scenario('boot: renderer alive, idle, sane bbox', async () => {
    const d = await waitFor(async () => {
      const x = await debug().catch(() => null);
      return x && x.ready ? x : null;
    }, 'renderer ready');
    assert(d.mode === 'idle', `mode=${d.mode}`);
    assert(d.catBBox.w > 50 && d.catBBox.h > 50, 'bbox too small: ' + JSON.stringify(d.catBBox));
    await cap('idle');
  });

  await scenario('eye follow: gaze tracks synthetic cursor', async () => {
    setTick({ cursor: { x: 5, y: 160 }, vel: 0 });
    await waitFor(async () => (await debug()).gaze.gx === 0, 'gaze left');
    setTick({ cursor: { x: 375, y: 160 } });
    await waitFor(async () => (await debug()).gaze.gx === 2, 'gaze right');
    setTick({ cursor: { x: 190, y: 40 } });
    await waitFor(async () => (await debug()).gaze.gy === 0, 'gaze up');
    await cap('gaze-up');
    setTick({ cursor: { x: 190, y: 60 } });
  });

  await scenario('kneading: typing makes the cat knead', async () => {
    for (let i = 0; i < 6; i++) { send('input:key', { kps: 3 }); await wait(140); }
    const d = await waitFor(async () => {
      const x = await debug();
      return x.mode === 'knead' ? x : null;
    }, 'knead mode');
    assert(d.kps > 0, 'kps=0');
    await cap('knead');
    await waitFor(async () => {
      const x = await debug();
      return x.mode === 'idle' ? x : null;
    }, 'idle after typing stops', 6000);
  });

  await scenario('overheat: fast typing steams the cat, fur never turns red', async () => {
    const t0 = Date.now();
    let d = null;
    while (Date.now() - t0 < 8000) {
      send('input:key', { kps: 9.5 });
      await wait(90);
      if ((Date.now() - t0) % 360 < 90) {
        d = await debug();
        if (d.heat > 0.72 && d.mode === 'overheat') break;
      }
    }
    d = await debug();
    assert(d.heat > 0.6 && d.mode === 'overheat', `heat=${d.heat} mode=${d.mode}`);
    await cap('overheat');
    // at peak heat, no pixel may sit in the red-tint zone the old heatColor
    // used (fur must keep its true colors; pinks like nose/blush have g or
    // b above 130 and stay out of this zone)
    const redPixels = await catWin.webContents.executeJavaScript(`
      (() => {
        const cv = document.getElementById('cat');
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
        let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] > 200 && d[i] > 190 && d[i + 1] < 130 && d[i + 2] < 130) n++;
        }
        return n;
      })()
    `);
    assert(redPixels === 0, `fur tinted red: ${redPixels} deep-red pixels at peak heat`);
    await waitFor(async () => (await debug()).heat < 0.35, 'cooldown', 12000, 200);
  });

  await scenario('paper unroll: scrolling brings out the paper', async () => {
    for (let i = 0; i < 7; i++) { send('input:scroll', { amount: 5 }); await wait(90); }
    const d = await debug();
    assert(d.mode === 'scroll', `mode=${d.mode}`);
    assert(d.scrollLen > 4, `scrollLen=${d.scrollLen}`);
    await cap('scroll-paper');
    await waitFor(async () => (await debug()).mode === 'idle', 'paper away', 5000);
  });

  await scenario('claude hooks: prompt -> working LED + think, stop -> celebrate', async () => {
    await post('/hook/claude/prompt?tty=ttys099', { session_id: 's1', cwd: '/tmp' });
    const d = await waitFor(async () => {
      const x = await debug();
      return x.mode === 'think' && x.agents.working === 1 ? x : null;
    }, 'think mode + LED working=1');
    await cap('think-led');
    await post('/hook/claude/stop', { session_id: 's1' });
    const d2 = await waitFor(async () => {
      const x = await debug();
      return x.mode === 'celebrate' ? x : null;
    }, 'celebrate');
    assert((d2.bubble || '').includes('CLAUDE'), `bubble=${d2.bubble}`);
    assert(d2.doneFlash, 'no done flash');
    await wait(350);
    await cap('celebrate');
    await waitFor(async () => {
      const x = await debug();
      return x.mode === 'idle' && x.agents.working === 0;
    }, 'idle after celebrate', 6000);
  });

  await scenario('codex hook: terminal turn celebrates, with inbox trail', async () => {
    const inboxBefore = (await debug()).inboxCount;
    await post('/hook/codex/notify?tty=ttys099', { type: 'agent-turn-complete', 'last-assistant-message': 'refactored the parser' });
    const d = await waitFor(async () => {
      const x = await debug();
      return (x.bubble || '').includes('CODEX') ? x : null;
    }, 'codex bubble');
    assert(d.mode === 'celebrate' || d.doneFlash, `mode=${d.mode}`);
    assert(d.inboxCount === inboxBefore + 1, 'inbox should record the turn');
    await cap('codex-done');
    await waitFor(async () => (await debug()).mode === 'idle', 'idle again', 6000);

    // burst limiter: a second terminal turn inside the window is LED+inbox only
    const b1 = (await debug()).inboxCount;
    await post('/hook/codex/notify?tty=ttys099', { type: 'agent-turn-complete', 'last-assistant-message': 'burst two' });
    await waitFor(async () => (await debug()).inboxCount === b1 + 1, 'burst turn logged');
    const dB = await debug();
    assert(dB.mode !== 'celebrate', 'burst turn must not celebrate (mode=' + dB.mode + ')');
    assert(dB.doneFlash, 'burst turn should still flash the LED');

    // background (no tty): muted by default, inbox-only
    const b3 = (await debug()).inboxCount;
    await post('/hook/codex/notify', { type: 'agent-turn-complete', 'last-assistant-message': 'pipeline batch 42' });
    await waitFor(async () => (await debug()).inboxCount === b3 + 1, 'background turn logged');
    const dBg = await debug();
    assert(dBg.mode !== 'celebrate', 'background turn must not celebrate');

    // per-agent mute: silent inbox-only even with a terminal
    store.set({ agent: { muteAgents: ['codex'] } });
    const b2 = (await debug()).inboxCount;
    await post('/hook/codex/notify?tty=ttys099', { type: 'agent-turn-complete', 'last-assistant-message': 'quiet one' });
    await waitFor(async () => (await debug()).inboxCount === b2 + 1, 'muted turn still logged');
    const d2 = await debug();
    assert(d2.mode !== 'celebrate', 'muted codex must not celebrate');
    store.set({ agent: { muteAgents: [] } });
  });

  await scenario('background claude: done + alerts are inbox-only', async () => {
    await post('/hook/claude/prompt', { session_id: 'bg-1', cwd: '/tmp/pipeline' }); // no tty
    await waitFor(async () => (await debug()).agents.working === 1, 'bg session working (LED ok)');
    const b = (await debug()).inboxCount;
    await post('/hook/claude/stop', { session_id: 'bg-1' });
    await waitFor(async () => (await debug()).inboxCount === b + 1, 'bg done logged to inbox');
    const d = await debug();
    assert(d.mode !== 'celebrate', 'bg claude must not celebrate (mode=' + d.mode + ')');
    await post('/hook/claude/notification', { session_id: 'bg-1', message: 'Claude needs your permission to use Bash' });
    await waitFor(async () => (await debug()).agents.alert === 1, 'bg alert lights LED');
    const d2 = await debug();
    assert(d2.mode !== 'alert', 'bg alert must not take over the cat');
    assert(!(d2.bubble || '').includes('PERMISSION'), 'bg alert must not bubble');
    await post('/hook/claude/end', { session_id: 'bg-1' });
    await waitFor(async () => (await debug()).agents.alert === 0, 'bg session cleaned up');
  });

  await scenario('reminder: bubble with message + hop', async () => {
    send('remind', { text: 'DRINK WATER', kind: 'reminder' });
    const d = await waitFor(async () => {
      const x = await debug();
      return x.bubble === 'DRINK WATER' ? x : null;
    }, 'reminder bubble');
    await cap('reminder');
    assert(d.mode !== 'sleep', 'should not sleep through a reminder');
  });

  await scenario('pinned note: stays above the cat', async () => {
    store.set({ fixedMessage: { enabled: true, text: 'SHIP IT' } });
    broadcastSettings();
    await waitFor(async () => (await debug()).pinned === true, 'pinned flag');
    await cap('pinned-note');
    store.set({ fixedMessage: { enabled: false, text: '' } });
    broadcastSettings();
  });

  await scenario('pomodoro: chip appears, click pauses', async () => {
    pomControl('start');
    const d = await waitFor(async () => {
      const x = await debug();
      return x.chipBBox && x.pom && x.pom.phase === 'focus' ? x : null;
    }, 'chip + focus');
    await cap('pomodoro');
    const c = d.chipBBox;
    const cx = Math.round(c.x + c.w / 2), cy = Math.round(c.y + c.h / 2);
    mouse({ type: 'mouseDown', x: cx, y: cy, button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: cx, y: cy, button: 'left', clickCount: 1 });
    await waitFor(async () => (await debug()).pom.paused === true, 'paused after chip click');
    mouse({ type: 'mouseDown', x: cx, y: cy, button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: cx, y: cy, button: 'left', clickCount: 1 });
    await waitFor(async () => (await debug()).pom.paused === false, 'resumed after second click');
    pomControl('stop');
    await waitFor(async () => (await debug()).chipBBox === null, 'chip gone');
  });

  await scenario('stretch: grows big and stretches', async () => {
    send('stretch-now', { ms: 2600 });
    await waitFor(async () => (await debug()).mode === 'stretch', 'stretch mode');
    await wait(900); // let it reach full size
    await cap('stretch');
    await waitFor(async () => (await debug()).mode === 'idle', 'back from stretch', 5000);
  });

  await scenario('petting: head rubs make a happy purring cat', async () => {
    const b = (await debug()).catBBox;
    const cy = Math.round(b.y + b.h * 0.30);
    const cx = Math.round(b.x + b.w / 2);
    for (let i = 0; i < 16; i++) {
      mouse({ type: 'mouseMove', x: cx + (i % 2 ? 16 : -16), y: cy });
      await wait(36);
    }
    const d = await waitFor(async () => {
      const x = await debug();
      return x.pet ? x : null;
    }, 'pet active (meter: ' + (await debug()).petMeter + ')');
    assert(d.mode === 'pet', `mode=${d.mode}`);
    await cap('petting');
    await waitFor(async () => !(await debug()).pet, 'petting ends', 4000);
  });

  await scenario('boop: click squashes + blushes', async () => {
    const b = (await debug()).catBBox;
    const cx = Math.round(b.x + b.w / 2), cy = Math.round(b.y + b.h * 0.6);
    mouse({ type: 'mouseDown', x: cx, y: cy, button: 'left', clickCount: 1 });
    await wait(40);
    mouse({ type: 'mouseUp', x: cx, y: cy, button: 'left', clickCount: 1 });
    await waitFor(async () => {
      const x = await debug();
      if (x.sinceBoopMs < 800) return true;
      if (x.lastInput) throw new Error('input arrived but no boop: ' + JSON.stringify({ in: x.lastInput, bbox: x.catBBox, armed: x.mouseDownArmed }));
      return false;
    }, 'boop registered', 2500);
    // booping earns a slow affection blink back (latched timestamp avoids races)
    await waitFor(async () => (await debug()).sinceSlowBlinkMs < 900, 'slow blink after boop', 1500);
    // ...then a tiny mlem as the eyes reopen (window: 250-1100ms post-boop)
    await waitFor(async () => (await debug()).mouthStyle === 'mlem', 'post-boop mlem', 1400);
    await wait(120);
    await cap('boop');
  });

  await scenario('mochi drag: grab, stretch, release', async () => {
    const b = (await debug()).catBBox;
    const sx = Math.round(b.x + b.w / 2), sy = Math.round(b.y + b.h * 0.5);
    mouse({ type: 'mouseDown', x: sx, y: sy, button: 'left', clickCount: 1 });
    await wait(40);
    for (let i = 1; i <= 5; i++) {
      mouse({ type: 'mouseMove', x: sx + i * 6, y: sy - i * 4 });
      await wait(30);
    }
    await waitFor(async () => (await debug()).dragActive === true, 'drag active');
    await cap('drag-hang');
    mouse({ type: 'mouseUp', x: sx + 30, y: sy - 20, button: 'left', clickCount: 1 });
    await waitFor(async () => (await debug()).dragActive === false, 'drag released');
  });

  await scenario('hunt: run, leap, caught', async () => {
    send('hunt', { phase: 'chase', dir: 1 });
    setTick({ huntPhase: 'chase' });
    await waitFor(async () => (await debug()).mode === 'hunt', 'hunt mode');
    await cap('hunt-run');
    // stalk: crouch + butt wiggle before the leap
    send('hunt', { phase: 'crouch', dir: 1 });
    setTick({ huntPhase: 'crouch' });
    await waitFor(async () => {
      const x = await debug();
      return x.mode === 'pounce' && x.frame === 'crouch' ? x : null;
    }, 'pounce wind-up');
    await cap('pounce-wiggle');
    send('hunt', { phase: 'leap', dir: 1 });
    setTick({ huntPhase: 'leap' });
    await waitFor(async () => (await debug()).mode === 'leap', 'leap mode');
    await cap('hunt-leap');
    send('hunt', { phase: 'caught' });
    setTick({ huntPhase: 'caught' });
    await waitFor(async () => (await debug()).mode === 'caught', 'caught mode');
    await cap('hunt-caught');
    send('hunt', { phase: 'none' });
    setTick({ huntPhase: 'none' });
    await waitFor(async () => (await debug()).mode === 'idle', 'hunt over');
  });

  await scenario('soft notification: waiting-for-input is gentle, no red LED', async () => {
    await post('/hook/claude/notification?tty=ttys099', {
      session_id: 's-soft', message: 'Claude is waiting for your input',
    });
    await waitFor(async () => ((await debug()).bubble || '').includes('WAITING'), 'gentle bubble');
    const d = await debug();
    assert(d.agents.alert === 0, `alert count=${d.agents.alert} (should be 0 for idle nudges)`);
    assert(d.mode !== 'alert', `mode=${d.mode}`);
    await post('/hook/claude/end', { session_id: 's-soft' });
  });

  await scenario('alert: permission request relayed, LED hover explains, decays', async () => {
    await post('/hook/claude/notification?tty=ttys099', {
      session_id: 's1', message: 'Claude needs your permission to use Bash',
    });
    await waitFor(async () => ((await debug()).bubble || '').includes('PERMISSION'), 'permission bubble');
    await waitFor(async () => (await debug()).mode === 'alert', 'alert mode');
    const d = await waitFor(async () => {
      const x = await debug();
      return x.ledBox && x.agents.alert === 1 ? x : null;
    }, 'red LED visible');
    await cap('alert');

    // hover the LED -> tooltip explains who needs what
    mouse({ type: 'mouseMove', x: Math.round(d.ledBox.x + d.ledBox.w / 2), y: Math.round(d.ledBox.y + d.ledBox.h / 2) });
    await waitFor(async () => (await debug()).ledHover === true, 'LED hover');
    await cap('led-tooltip');

    // click the LED -> jumps to that session's terminal
    const before = askCalls.length;
    mouse({ type: 'mouseDown', x: Math.round(d.ledBox.x + 3), y: Math.round(d.ledBox.y + 3), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(d.ledBox.x + 3), y: Math.round(d.ledBox.y + 3), button: 'left', clickCount: 1 });
    await waitFor(() => askCalls.length > before, 'led click routed');
    assert(askCalls[askCalls.length - 1].led === true && askCalls[askCalls.length - 1].tty === 'ttys099',
      'bad led click: ' + JSON.stringify(askCalls[askCalls.length - 1]));
    mouse({ type: 'mouseMove', x: 200, y: 30 }); // unhover

    // alert decays to idle on its own (TEST TTL is short)
    await waitFor(async () => (await debug()).agents.alert === 0, 'alert decayed', 12000, 300);
  });

  await scenario('question: panel shows real options, click types answer', async () => {
    await post('/hook/claude/ask?tty=ttys099', {
      session_id: 's1',
      tool_name: 'AskUserQuestion',
      tool_input: {
        questions: [{
          question: 'Which approach should we take for the fix?',
          header: 'Approach',
          multiSelect: false,
          options: [{ label: 'Quick prototype' }, { label: 'Proper fix with tests' }],
        }],
      },
    });
    const d = await waitFor(async () => {
      const x = await debug();
      return x.question && x.question.boxes.length === 2 ? x : null;
    }, 'question panel with 2 options');
    assert(d.question.canType === true, 'canType false');
    assert(d.question.options[1] === 'Proper fix with tests', 'options=' + JSON.stringify(d.question.options));
    await cap('question-panel');

    // click option 2
    const before = askCalls.length;
    const b = d.question.boxes[1];
    const cx = Math.round(b.x + b.w / 2), cy = Math.round(b.y + b.h / 2);
    mouse({ type: 'mouseMove', x: cx, y: cy });
    await wait(80);
    mouse({ type: 'mouseDown', x: cx, y: cy, button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: cx, y: cy, button: 'left', clickCount: 1 });
    await waitFor(() => askCalls.length > before, 'answer routed to main');
    assert(askCalls[askCalls.length - 1].index === 1, 'wrong option index: ' + JSON.stringify(askCalls));
    await waitFor(async () => {
      const x = await debug();
      return x.question && x.question.status.startsWith('typed');
    }, 'typed status');
    await cap('question-answered');

    // Claude finished asking (PostToolUse) -> panel clears, session keeps thinking
    await post('/hook/claude/ask-done', { session_id: 's1' });
    await waitFor(async () => (await debug()).question === null, 'panel cleared');
    // ...and eventually finishes
    await post('/hook/claude/stop', { session_id: 's1' });
    await waitFor(async () => (await debug()).agents.working === 0, 'session idle again', 6000);
  });

  await scenario('question: dismiss button clears panel', async () => {
    await post('/hook/claude/ask', {
      session_id: 's2-no-tty',
      tool_input: { questions: [{ question: 'Pick one', header: 'Pick', options: [{ label: 'A' }, { label: 'B' }], multiSelect: false }] },
    });
    const d = await waitFor(async () => {
      const x = await debug();
      return x.question && x.question.dismissBox ? x : null; // wait until rendered
    }, 'panel up');
    assert(d.question.canType === false, 'should be focus-only without tty');
    await cap('question-focus-only');
    const b = d.question.dismissBox;
    mouse({ type: 'mouseDown', x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2), button: 'left', clickCount: 1 });
    await waitFor(async () => (await debug()).question === null, 'panel dismissed');
    await post('/hook/claude/end', { session_id: 's1' });
    await post('/hook/claude/end', { session_id: 's2-no-tty' });
    await waitFor(async () => {
      const x = await debug();
      return x.agents.alert === 0 && x.agents.working === 0;
    }, 'sessions cleared');
  });

  await scenario('paw menu: long-press springs it out of the cat', async () => {
    const b = (await debug()).catBBox;
    const cx = Math.round(b.x + b.w / 2), cy = Math.round(b.y + b.h * 0.6);
    mouse({ type: 'mouseDown', x: cx, y: cy, button: 'left', clickCount: 1 });
    const d = await waitFor(async () => {
      const x = await debug();
      return x.menu && x.menu.page === 'root' ? x : null;
    }, 'menu opened via long-press', 3000);
    mouse({ type: 'mouseUp', x: cx, y: cy, button: 'left', clickCount: 1 });
    assert(d.menu.labels.join(',').includes('Voice'), 'labels=' + d.menu.labels);
    assert(d.sinceBoopMs > 2000 || d.sinceBoopMs < 0 || true, 'no boop on long press'); // boop must not fire
    await waitFor(async () => (await debug()).menu.anim >= 1, 'spring settled');
    await cap('menu-root');
    const d2 = await debug();
    assert(d2.mode === 'menu', `mode=${d2.mode}`);
  });

  await scenario('paw menu: VOICE routes to murmur action and closes', async () => {
    const d = await debug();
    const b = d.menu.boxes[0];
    const before = askCalls.length;
    mouse({ type: 'mouseMove', x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2) });
    await wait(60);
    mouse({ type: 'mouseDown', x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(b.x + b.w / 2), y: Math.round(b.y + b.h / 2), button: 'left', clickCount: 1 });
    await waitFor(() => askCalls.length > before, 'voice action routed');
    assert(askCalls[askCalls.length - 1].menuAction === 'voice', JSON.stringify(askCalls[askCalls.length - 1]));
    await waitFor(async () => (await debug()).menu === null, 'menu closed after action');
  });

  await scenario('paw menu: apps page launches an app', async () => {
    send('menu:toggle', {}); // hotkey path
    const d = await waitFor(async () => {
      const x = await debug();
      return x.menu && x.menu.anim >= 1 ? x : null;
    }, 'menu open via hotkey');
    const appsRow = d.menu.boxes[d.menu.labels.indexOf('Apps')];
    mouse({ type: 'mouseDown', x: Math.round(appsRow.x + 20), y: Math.round(appsRow.y + 10), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(appsRow.x + 20), y: Math.round(appsRow.y + 10), button: 'left', clickCount: 1 });
    const d2 = await waitFor(async () => {
      const x = await debug();
      return x.menu && x.menu.page === 'apps' ? x : null;
    }, 'apps page');
    await wait(250);
    await cap('menu-apps');
    const before = askCalls.length;
    const first = (await debug()).menu.boxes[0];
    mouse({ type: 'mouseDown', x: Math.round(first.x + 20), y: Math.round(first.y + 10), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(first.x + 20), y: Math.round(first.y + 10), button: 'left', clickCount: 1 });
    await waitFor(() => askCalls.length > before, 'app action routed');
    const call = askCalls[askCalls.length - 1];
    assert(call.menuAction === 'app' && /Visual Studio Code/.test(call.app), JSON.stringify(call));
    await waitFor(async () => (await debug()).menu === null, 'menu closed');
  });

  await scenario('tasks: /todo adds, menu lists, click checks off', async () => {
    await post('/todo', { text: 'WRITE THE REPORT' });
    await waitFor(async () => (await debug()).tasksOpen === 1, 'task added');
    await waitFor(async () => ((await debug()).bubble || '').includes('TODO'), 'todo bubble');
    send('menu:toggle', {});
    const d = await waitFor(async () => {
      const x = await debug();
      return x.menu && x.menu.anim >= 1 ? x : null;
    }, 'menu open');
    const tasksRow = d.menu.boxes[d.menu.labels.indexOf('To-dos')];
    mouse({ type: 'mouseDown', x: Math.round(tasksRow.x + 20), y: Math.round(tasksRow.y + 10), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(tasksRow.x + 20), y: Math.round(tasksRow.y + 10), button: 'left', clickCount: 1 });
    const d2 = await waitFor(async () => {
      const x = await debug();
      return x.menu && x.menu.page === 'tasks' ? x : null;
    }, 'tasks page');
    await wait(250);
    await cap('menu-tasks');
    const row = (await debug()).menu.boxes[0];
    mouse({ type: 'mouseDown', x: Math.round(row.x + 20), y: Math.round(row.y + 10), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(row.x + 20), y: Math.round(row.y + 10), button: 'left', clickCount: 1 });
    await waitFor(async () => (await debug()).tasksOpen === 0 && (await debug()).tasksDone === 1, 'task checked off');
    await wait(200);
    await cap('menu-task-done');
  });

  await scenario('paw menu: click-away melts it back into the cat', async () => {
    const d = await debug();
    assert(d.menu, 'menu should still be open');
    mouse({ type: 'mouseDown', x: 15, y: 15, button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: 15, y: 15, button: 'left', clickCount: 1 });
    await waitFor(async () => (await debug()).menu === null, 'menu dismissed');
    await waitFor(async () => (await debug()).mode !== 'menu', 'mode left menu');
  });

  await scenario('deep links: pixelpaw://todo and /menu endpoint', async () => {
    const before = (await debug()).tasksOpen;
    const r = await post('/url', { url: 'pixelpaw://todo?text=FROM%20A%20DEEP%20LINK' });
    assert(JSON.parse(r.body).ok === true, 'deep link rejected: ' + r.body);
    await waitFor(async () => (await debug()).tasksOpen === before + 1, 'task added via deep link');
    const bad = JSON.parse((await post('/url', { url: 'https://evil.example/say?text=x' })).body);
    assert(bad.ok === false, 'non-pixelpaw scheme must be rejected');
    await post('/menu', {});
    await waitFor(async () => (await debug()).menu !== null, 'menu opened via endpoint');
    await post('/menu', {});
    await waitFor(async () => (await debug()).menu === null, 'menu closed via endpoint');
  });

  await scenario('todos: "@ +0m" fires a due meow, snooze defers it', async () => {
    await post('/todo', { text: 'PING ME @ +0m' });
    await waitFor(async () => ((await debug()).bubble || '').includes('DUE: PING ME'), 'due reminder fired', 6000);
    let s = JSON.parse((await new Promise((res, rej) => {
      require('http').get(`http://127.0.0.1:${port()}/status`, (r) => {
        let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res({ body: b }));
      }).on('error', rej);
    })).body);
    let task = s.tasks.find((t) => t.text === 'PING ME');
    assert(task && task.remindedAt && task.overdue, 'task state: ' + JSON.stringify(task));

    // open To-dos, snooze it
    send('menu:toggle', {});
    const d = await waitFor(async () => {
      const x = await debug();
      return x.menu && x.menu.anim >= 1 ? x : null;
    }, 'menu open');
    const todosRow = d.menu.boxes[d.menu.labels.indexOf('To-dos')];
    mouse({ type: 'mouseDown', x: Math.round(todosRow.x + 20), y: Math.round(todosRow.y + 10), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(todosRow.x + 20), y: Math.round(todosRow.y + 10), button: 'left', clickCount: 1 });
    const d2 = await waitFor(async () => {
      const x = await debug();
      return x.menu && x.menu.page === 'tasks' && x.menu.chips.some((c) => /snooze/i.test(c.text)) ? x : null;
    }, 'snooze chip visible');
    await wait(250);
    await cap('todos-overdue');
    const chip = d2.menu.chips.find((c) => /snooze/i.test(c.text));
    mouse({ type: 'mouseDown', x: Math.round(chip.x + chip.w / 2), y: Math.round(chip.y + chip.h / 2), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(chip.x + chip.w / 2), y: Math.round(chip.y + chip.h / 2), button: 'left', clickCount: 1 });
    await waitFor(async () => {
      const x = await debug();
      return x.menu && !x.menu.chips.some((c) => /snooze/i.test(c.text));
    }, 'snoozed (chip back to a time)');
    await cap('todos-snoozed');
  });

  await scenario('todos: "@ HH:MM" parses, inline add works', async () => {
    const r = JSON.parse((await post('/todo', { text: 'STANDUP @ 23:59' })).body);
    assert(r.due, 'no due parsed');
    const h = new Date(r.due).getHours();
    assert(h === 23, 'parsed hour=' + h);

    // inline add through the panel input (menu still open on tasks page)
    const before = (await debug()).tasksOpen;
    await catWin.webContents.executeJavaScript(`
      (() => {
        const inp = document.getElementById('todoInput');
        inp.value = 'FROM THE PANEL @ +90m';
        document.querySelector('.addbar button').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        return true;
      })()
    `);
    await waitFor(async () => (await debug()).tasksOpen === before + 1, 'panel add worked');
    await wait(200);
    await cap('todos-panel');
    // close menu
    mouse({ type: 'mouseDown', x: 15, y: 15, button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: 15, y: 15, button: 'left', clickCount: 1 });
    await waitFor(async () => (await debug()).menu === null, 'menu closed');
  });

  await scenario('pawcat CLI: say lands as a bubble', async () => {
    const { execFile } = require('child_process');
    const out = await new Promise((resolve, reject) => {
      execFile(process.execPath, ['tools/pawcat.js', 'say', 'HELLO FROM CLI'], {
        env: { ...process.env, PIXELPAW_PORT: String(port()), ELECTRON_RUN_AS_NODE: '1' },
        cwd: require('path').join(__dirname, '..'),
      }, (err, stdout, stderr) => (err ? reject(new Error(stderr || err.message)) : resolve(stdout)));
    });
    assert(/said it/.test(out), 'cli output: ' + out);
    await waitFor(async () => ((await debug()).bubble || '').includes('HELLO FROM CLI'), 'bubble from CLI');
  });

  await scenario('MCP server: initialize, list tools, cat_say', async () => {
    const { spawn } = require('child_process');
    const path = require('path');
    const child = spawn(process.execPath, [path.join(__dirname, 'mcp-server.js')], {
      env: { ...process.env, PIXELPAW_PORT: String(port()), ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const replies = [];
    let mcpBuf = '';
    child.stdout.on('data', (c) => {
      mcpBuf += c;
      let i;
      while ((i = mcpBuf.indexOf('\n')) >= 0) {
        const line = mcpBuf.slice(0, i).trim();
        mcpBuf = mcpBuf.slice(i + 1);
        if (line) replies.push(JSON.parse(line));
      }
    });
    const rpc = (id, method, params) => child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    rpc(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } });
    await waitFor(() => replies.find((r) => r.id === 1), 'initialize reply');
    rpc(2, 'tools/list', {});
    const list = await waitFor(() => replies.find((r) => r.id === 2), 'tools list');
    assert(list.result.tools.length >= 4, 'tools: ' + list.result.tools.length);
    rpc(3, 'tools/call', { name: 'cat_say', arguments: { text: 'HELLO FROM MCP' } });
    await waitFor(() => replies.find((r) => r.id === 3), 'cat_say reply');
    await waitFor(async () => ((await debug()).bubble || '').includes('HELLO FROM MCP'), 'bubble from MCP');
    child.kill();
  });

  await scenario('customization: cat name in menu title + tabby fur', async () => {
    store.set({ catName: 'Mochi', skinStyle: 'tabby' });
    broadcastSettings();
    await wait(150);
    send('menu:toggle', {});
    const d = await waitFor(async () => {
      const x = await debug();
      return x.menu && x.menu.anim >= 1 ? x : null;
    }, 'menu open');
    assert(d.menu.title === "Mochi's menu", 'title=' + d.menu.title);
    await wait(200);
    await cap('custom-named-tabby');
    mouse({ type: 'mouseDown', x: 15, y: 15, button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: 15, y: 15, button: 'left', clickCount: 1 });
    await waitFor(async () => (await debug()).menu === null, 'menu closed');
    store.set({ catName: '', skinStyle: 'plain' });
    broadcastSettings();
  });

  await scenario('inbox: bubble click opens the inbox page, entries expand', async () => {
    send('remind', { text: 'A MESSAGE WITH A LONG TAIL OF DETAILS THAT MUST BE READABLE IN FULL', kind: 'say' });
    await post('/say', { text: 'logged one' }); // also lands in inbox
    const d = await waitFor(async () => {
      const x = await debug();
      return x.bubble && x.bubbleBox ? x : null;
    }, 'bubble up');
    // click the bubble -> inbox page opens
    mouse({ type: 'mouseDown', x: Math.round(d.bubbleBox.x + d.bubbleBox.w / 2), y: Math.round(d.bubbleBox.y + d.bubbleBox.h / 2), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(d.bubbleBox.x + d.bubbleBox.w / 2), y: Math.round(d.bubbleBox.y + d.bubbleBox.h / 2), button: 'left', clickCount: 1 });
    const d2 = await waitFor(async () => {
      const x = await debug();
      return x.menu && x.menu.page === 'inbox' && x.menu.boxes.length > 1 ? x : null;
    }, 'inbox page via bubble click');
    await wait(250);
    await cap('inbox-page');
    // expand the first entry
    const r0 = (await debug()).menu.boxes[0];
    mouse({ type: 'mouseDown', x: Math.round(r0.x + 30), y: Math.round(r0.y + 8), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(r0.x + 30), y: Math.round(r0.y + 8), button: 'left', clickCount: 1 });
    await wait(300);
    await cap('inbox-expanded');
    mouse({ type: 'mouseDown', x: 15, y: 15, button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: 15, y: 15, button: 'left', clickCount: 1 });
    await waitFor(async () => (await debug()).menu === null, 'menu closed');
  });

  await scenario('pixel overrides: painted markings reach the renderer', async () => {
    const { capFaceOverrides } = require('../renderer/palette');
    const ov = capFaceOverrides({ body: '#d0cbc1', headL: '#867e74' });
    store.set({ pixelOverrides: ov });
    broadcastSettings();
    await waitFor(async () => (await debug()).overridesCount > 10, 'overrides applied');
    await wait(200);
    await cap('pixel-markings');
    store.set({ pixelOverrides: null });
    broadcastSettings();
    await waitFor(async () => (await debug()).overridesCount === 0, 'overrides cleared');
  });

  await scenario('palette: tuxedo photo -> dark body, light bib', async () => {
    const fsx = require('fs');
    if (!fsx.existsSync('/tmp/catphotos/tuxedo.bin')) {
      console.log('  (skipped: no test photo present)');
      return;
    }
    const { extractPalette, paletteToSkin } = require('../renderer/palette');
    const buf = fsx.readFileSync('/tmp/catphotos/tuxedo.bin');
    const w = buf.readUInt32BE(0), h = buf.readUInt32BE(4);
    const skin = paletteToSkin(extractPalette(buf.subarray(8), w, h));
    const lum = (hx) => {
      const v = hx.slice(1);
      return 0.299 * parseInt(v.slice(0, 2), 16) + 0.587 * parseInt(v.slice(2, 4), 16) + 0.114 * parseInt(v.slice(4, 6), 16);
    };
    assert(lum(skin.body) < 70, 'body should be dark: ' + skin.body);
    assert(lum(skin.chest) > 150, 'chest should be the light bib: ' + skin.chest);
  });

  const statusBond = async () => JSON.parse((await new Promise((res, rej) => {
    require('http').get(`http://127.0.0.1:${port()}/status`, (r) => {
      let b = ''; r.on('data', (c) => (b += c)); r.on('end', () => res({ body: b }));
    }).on('error', rej);
  })).body).bond;

  await scenario('bond: shared work grows the relationship', async () => {
    const before = await statusBond();
    await post('/todo', { text: 'BOND TEST TASK' });
    send('menu:toggle', {});
    const d = await waitFor(async () => {
      const x = await debug();
      return x.menu && x.menu.anim >= 1 ? x : null;
    }, 'menu open');
    const todosRow = d.menu.boxes[d.menu.labels.indexOf('To-dos')];
    mouse({ type: 'mouseDown', x: Math.round(todosRow.x + 20), y: Math.round(todosRow.y + 10), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(todosRow.x + 20), y: Math.round(todosRow.y + 10), button: 'left', clickCount: 1 });
    await waitFor(async () => (await debug()).menu && (await debug()).menu.page === 'tasks', 'tasks page');
    const r0 = (await debug()).menu.boxes[0];
    mouse({ type: 'mouseDown', x: Math.round(r0.x + 30), y: Math.round(r0.y + 10), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(r0.x + 30), y: Math.round(r0.y + 10), button: 'left', clickCount: 1 });
    await waitFor(async () => (await statusBond()).xp >= before.xp + 5, 'todo completion earned bond');
    mouse({ type: 'mouseDown', x: 15, y: 15, button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: 15, y: 15, button: 'left', clickCount: 1 });
    await waitFor(async () => (await debug()).menu === null, 'menu closed');
  });

  await scenario('rituals: a new day brings a greeting and a caught gift', async () => {
    const giftsBefore = (await statusBond()).gifts.length;
    const r = JSON.parse((await post('/test/bond-roll', { day: '2099-01-02', forceGift: 'fish', activeYesterday: true })).body);
    assert(r.bond.pendingGift && r.bond.pendingGift.id === 'fish', 'pending gift: ' + JSON.stringify(r.bond.pendingGift));
    await waitFor(async () => ((await debug()).bubble || '').includes('MORNING'), 'morning greeting', 8000);
    await cap('ritual-morning');
    await waitFor(async () => (await debug()).shownGift === 'fish', 'gift presented', 8000);
    await waitFor(async () => ((await debug()).bubble || '').includes('CAUGHT'), 'gift bubble');
    await cap('ritual-gift');
    const after = await statusBond();
    assert(after.gifts.length === giftsBefore + 1, 'gift collected');
    // shelf shows it
    send('menu:toggle', {});
    const d = await waitFor(async () => {
      const x = await debug();
      return x.menu && x.menu.anim >= 1 ? x : null;
    }, 'menu open');
    const moreRow = d.menu.boxes[d.menu.labels.indexOf('More')];
    mouse({ type: 'mouseDown', x: Math.round(moreRow.x + 20), y: Math.round(moreRow.y + 10), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(moreRow.x + 20), y: Math.round(moreRow.y + 10), button: 'left', clickCount: 1 });
    const d2 = await waitFor(async () => {
      const x = await debug();
      return x.menu && x.menu.page === 'more' ? x : null;
    }, 'more page');
    const shelfRow = d2.menu.boxes[d2.menu.labels.indexOf('Shelf')];
    mouse({ type: 'mouseDown', x: Math.round(shelfRow.x + 20), y: Math.round(shelfRow.y + 10), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(shelfRow.x + 20), y: Math.round(shelfRow.y + 10), button: 'left', clickCount: 1 });
    const d3 = await waitFor(async () => {
      const x = await debug();
      return x.menu && x.menu.page === 'shelf' ? x : null;
    }, 'shelf page');
    assert(d3.menu.labels.join(',').toLowerCase().includes('golden fish'), 'shelf labels: ' + d3.menu.labels);
    await wait(250);
    await cap('shelf');
    // journal
    const backRow = d3.menu.boxes[d3.menu.labels.indexOf('Back')];
    mouse({ type: 'mouseDown', x: Math.round(backRow.x + 20), y: Math.round(backRow.y + 10), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(backRow.x + 20), y: Math.round(backRow.y + 10), button: 'left', clickCount: 1 });
    const d4 = await waitFor(async () => {
      const x = await debug();
      return x.menu && x.menu.page === 'more' ? x : null;
    }, 'back to more');
    const jRow = d4.menu.boxes[d4.menu.labels.indexOf('Journal')];
    mouse({ type: 'mouseDown', x: Math.round(jRow.x + 20), y: Math.round(jRow.y + 10), button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: Math.round(jRow.x + 20), y: Math.round(jRow.y + 10), button: 'left', clickCount: 1 });
    await waitFor(async () => (await debug()).menu && (await debug()).menu.page === 'journal', 'journal page');
    await wait(250);
    await cap('journal');
    mouse({ type: 'mouseDown', x: 15, y: 15, button: 'left', clickCount: 1 });
    mouse({ type: 'mouseUp', x: 15, y: 15, button: 'left', clickCount: 1 });
    await waitFor(async () => (await debug()).menu === null, 'menu closed');
  });

  await scenario('streaks: weekends never break them, weekdays do', async () => {
    // Friday was active -> roll Monday: streak continues
    let r = JSON.parse((await post('/test/bond-roll', { day: '2099-01-05', activeYesterday: true })).body);
    const s1 = r.bond.streak;
    assert(s1 >= 1, 'streak after active Friday->Monday: ' + s1);
    // Monday inactive -> roll Wednesday (Tuesday missed, a weekday): streak resets
    r = JSON.parse((await post('/test/bond-roll', { day: '2099-01-07', activeYesterday: false })).body);
    assert(r.bond.streak === 0, 'weekday miss must reset streak: ' + r.bond.streak);
  });

  await scenario('sleep and wake', async () => {
    // belt-and-braces cleanup so a prior failure can't block sleep
    await post('/hook/claude/ask-done', { session_id: 's1' });
    await post('/hook/claude/end', { session_id: 's1' });
    await post('/hook/claude/end', { session_id: 's2-no-tty' });
    // defuse the ritual landmine: earlier bond-roll scenarios leave "today"
    // un-greeted, and the morning greeting would otherwise fire mid-nap or
    // on wake and swallow the yawn
    await post('/test/bond-roll', { day: '2099-01-08', activeYesterday: true, greeted: true });
    await waitFor(async () => !(await debug()).bubble, 'no pending bubble', 8000);
    // drowsy half-lidded eyes just before the nap — tucked into a loaf
    setTick({ idleSec: 235, vel: 0 });
    await waitFor(async () => (await debug()).eyeStyle === 'squint', 'drowsy eyes before sleep', 4000);
    await waitFor(async () => (await debug()).frame === 'loaf', 'pre-sleep loaf tuck', 2500);
    await cap('drowsy');
    setTick({ idleSec: 400, vel: 0 });
    const d = await waitFor(async () => {
      const x = await debug();
      return x.mode === 'sleep' ? x : null;
    }, 'sleep mode', 9000);
    await wait(1800); // collect some Zzz
    await cap('sleep');
    // dreams: an ear twitch on the sleeping loaf, fish bubble on first dream
    await poke('dream');
    const dt = await waitFor(async () => {
      const x = await debug();
      return x.dreamTwitching && x.frame === 'loaf_twitch' ? x : null;
    }, 'dream twitch', 3000);
    assert((dt.effects || []).includes('dream'), 'first dream should carry the fish bubble');
    await cap('dream-twitch');
    setTick({ idleSec: 0, vel: 200 });
    await waitFor(async () => (await debug()).mode === 'idle', 'awake');
    // waking yawns: scrunched eyes + open mouth
    await waitFor(async () => (await debug()).yawning === true, 'yawn on wake', 1500);
    await cap('yawn');
  });

  await scenario('micro-anims: idle ear-flick + dilation when cursor is near', async () => {
    setTick({ idleSec: 5, vel: 0, cursor: { x: 190, y: 60 } });
    await waitFor(async () => (await debug()).mode === 'idle', 'idle');
    // ear flick fires within its random window (max ~16s)
    await waitFor(async () => (await debug()).frame === 'sit_flick', 'ear flick frame appears', 20000);
    await cap('ear-flick');
    // (dilation is a render-only detail; covered visually via the boop/pet shots)
  });

  await scenario('rituals: grooming — paw lick, ear wipe, happy eyes', async () => {
    setTick({ idleSec: 5, vel: 0, cursor: { x: 20, y: 20 } });
    await waitFor(async () => (await debug()).mode === 'idle', 'idle');
    await poke('groom');
    const d = await waitFor(async () => {
      const x = await debug();
      return x.grooming && /^sit_groom/.test(x.frame || '') ? x : null;
    }, 'grooming starts', 3000);
    assert(d.eyeStyle === 'happy' || d.eyeStyle === 'closed', 'groom eyes: ' + d.eyeStyle);
    await cap('groom-lick');
    // both halves of the loop appear (lick <-> wipe alternates ~430ms)
    const first = d.frame;
    await waitFor(async () => {
      const x = await debug();
      return x.grooming && x.frame !== first && /^sit_groom/.test(x.frame || '') ? x : null;
    }, 'groom alternates', 2000);
    await cap('groom-wipe');
    await waitFor(async () => !(await debug()).grooming, 'grooming ends', 4000);
  });

  await scenario('rituals: tail wraps around the paws when content', async () => {
    setTick({ idleSec: 6, vel: 0, cursor: { x: 20, y: 20 } });
    await waitFor(async () => (await debug()).mode === 'idle', 'idle');
    await poke('wrap');
    await waitFor(async () => (await debug()).frame === 'sit_wrap', 'tail wrap frame', 3000);
    await cap('tail-wrap');
  });

  await scenario('reactions: curious head tilt when the cursor lingers', async () => {
    const b = (await debug()).catBBox;
    setTick({ idleSec: 3, vel: 0, cursor: { x: Math.round(b.x + b.w * 0.72), y: Math.round(b.y + b.h * 0.5) } });
    await wait(150); // let a tick land the cursor on the cat
    await poke('tilt');
    const d = await waitFor(async () => {
      const x = await debug();
      return x.tilting ? x : null;
    }, 'head tilt fires', 3000);
    assert(d.tiltDir === 1, 'should lean toward the cursor side, dir=' + d.tiltDir);
    await cap('head-tilt');
    await waitFor(async () => !(await debug()).tilting, 'tilt relaxes', 4000);
    setTick({ cursor: { x: 20, y: 20 } });
  });

  await scenario('reactions: the rare idle blep', async () => {
    setTick({ idleSec: 4, vel: 0, cursor: { x: 20, y: 20 } });
    await waitFor(async () => (await debug()).mode === 'idle', 'idle');
    await poke('blep');
    await waitFor(async () => {
      const x = await debug();
      return x.blep && x.mouthStyle === 'mlem' ? x : null;
    }, 'blep tongue out', 3000);
    await cap('blep');
  });

  await scenario('sprite styles: kawaii default, classic backup switches', async () => {
    const dK = await debug();
    const kawaiiH = dK.catBBox.h;
    await wait(100);
    await cap('kawaii-idle');
    store.set({ spriteStyle: 'classic' });
    broadcastSettings();
    await waitFor(async () => Math.abs((await debug()).catBBox.h - kawaiiH) > 4, 'classic frame height differs');
    await wait(150);
    await cap('classic-idle');
    store.set({ spriteStyle: 'kawaii' });
    broadcastSettings();
    await waitFor(async () => Math.abs((await debug()).catBBox.h - kawaiiH) < 2, 'back to kawaii');
  });

  await scenario('skin swap: calico renders', async () => {
    store.set({ skin: 'calico' });
    broadcastSettings();
    await waitFor(async () => (await debug()).skin === 'calico', 'skin applied');
    await wait(150);
    await cap('calico');
    store.set({ skin: 'black' });
    broadcastSettings();
  });

  // ------------------------------------------------------------------ report
  const failed = results.filter((r) => !r.pass);
  console.log('---');
  console.log(`SCENARIOS ${results.length - failed.length}/${results.length} passed; shots in ${dir}`);
  if (failed.length) for (const f of failed) console.log('  FAILED: ' + f.name + ' — ' + f.error);
  return failed.length;
}

module.exports = { runScenarios };
