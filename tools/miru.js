#!/usr/bin/env node
'use strict';
// miru — talk to your desktop cat from any script or terminal.
//   miru say "deploy finished"
//   miru todo "review the PR"
//   miru tasks
//   miru ask "question" -o "option a" -o "option b"
//   miru done <task-id-prefix>
//   miru agent thinking|done|alert [--agent codex]
//   miru menu | show | hide | status
const PORT = process.env.MIRU_PORT || extractFlag('--port') || 41999;

function extractFlag(name) {
  const i = process.argv.indexOf(name);
  if (i >= 0) { const v = process.argv[i + 1]; process.argv.splice(i, 2); return v; }
  return null;
}

const base = `http://127.0.0.1:${PORT}`;
const [, , cmd, ...rest] = process.argv;

async function post(path, body) {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return res.json();
}

async function main() {
  switch (cmd) {
    case 'say': {
      const text = rest.join(' ');
      if (!text) die('usage: miru say "message"');
      await post('/say', { text });
      console.log('the cat said it.');
      break;
    }
    case 'todo': {
      const text = rest.join(' ');
      if (!text) die('usage: miru todo "task"');
      const r = await post('/todo', { text });
      console.log(`added. ${r.tasks} task(s) on the cat.`);
      break;
    }
    case 'tasks': {
      const s = await (await fetch(base + '/status')).json();
      if (!s.tasks.length) return console.log('no tasks. (miru todo "...")');
      for (const t of s.tasks) console.log(`${t.done ? '[x]' : '[ ]'} ${t.id.slice(-5)}  ${t.text}`);
      break;
    }
    case 'agent': {
      const state = rest[0];
      if (!['thinking', 'done', 'alert', 'idle'].includes(state)) die('usage: miru agent thinking|done|alert|idle [--agent name]');
      const agentIdx = rest.indexOf('--agent');
      const agent = agentIdx >= 0 ? rest[agentIdx + 1] : 'script';
      // run from a real terminal = interactive; piped/cron = background (muted)
      await post('/agent', { agent, state, interactive: !!process.stdout.isTTY });
      console.log(`agent ${agent}: ${state}.`);
      break;
    }
    case 'ask': {
      // miru ask "Cancel the 3pm?" -o "Yes: decline + notify" -o "Keep it" [--timeout 300] [--agent name]
      // blocks until the user answers on the cat; prints the chosen label
      const opts = [];
      const words = [];
      let agent = 'script', timeoutMs = 0;
      for (let i = 0; i < rest.length; i++) {
        if (rest[i] === '-o') {
          const v = String(rest[++i] || '');
          const ci = v.indexOf(':');
          const label = (ci >= 0 ? v.slice(0, ci) : v).trim();
          const description = ci >= 0 ? v.slice(ci + 1).trim() : '';
          if (label) opts.push({ label, description });
        } else if (rest[i] === '--agent') agent = rest[++i] || agent;
        else if (rest[i] === '--timeout') timeoutMs = (Number(rest[++i]) || 0) * 1000;
        else words.push(rest[i]);
      }
      const question = words.join(' ');
      if (!question || !opts.length) {
        die('usage: miru ask "question" -o "label[: description]" [-o ...] [--timeout seconds] [--agent name]');
      }
      const body = { agent, question, options: opts };
      if (timeoutMs > 0) body.timeoutMs = timeoutMs;
      const r = await post('/ask', body);
      if (!r.ok) die('the cat could not ask: ' + (r.error || 'unknown error'));
      if (!r.answered) die('no answer: ' + r.reason);
      console.log(r.label);
      break;
    }
    case 'talk': {
      // with text: route it through the cat's brain; without: toggle listening
      const text = rest.join(' ').trim();
      const r = await post('/voice', text ? { text } : {});
      console.log(JSON.stringify(r));
      break;
    }
    case 'menu': await post('/menu'); console.log('menu toggled.'); break;
    case 'show': await post('/show'); console.log('cat is out.'); break;
    case 'hide': await post('/hide'); console.log('cat is hiding.'); break;
    case 'url': {
      if (!rest[0]) die('usage: miru url "miru://say?text=hi"');
      console.log(JSON.stringify(await post('/url', { url: rest[0] })));
      break;
    }
    case 'status': {
      const s = await (await fetch(base + '/status')).json();
      console.log(JSON.stringify(s, null, 2));
      break;
    }
    default:
      die(`miru — your desktop cat, scriptable
usage:
  miru say "message"            speech bubble + inbox
  miru todo "task"              add to the cat's task list
  miru tasks                    list tasks
  miru ask "q" -o "a" -o "b"    ask via the cat, wait, print the answer
  miru agent <state> [--agent n]  thinking|done|alert|idle
  miru talk ["utterance"]       route through the cat's brain (no text = listen)
  miru menu|show|hide           control the cat
  miru status                   full JSON state
  miru url "miru://..."     exercise a deep link
env: MIRU_PORT (default 41999)`);
  }
}

function die(msg) { console.error(msg); process.exit(1); }

main().catch((e) => die('cat unreachable at ' + base + ' — is Miru running? (' + e.message + ')'));
