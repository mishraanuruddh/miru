#!/usr/bin/env node
'use strict';
// pawcat — talk to your desktop cat from any script or terminal.
//   pawcat say "deploy finished"
//   pawcat todo "review the PR"
//   pawcat tasks
//   pawcat done <task-id-prefix>
//   pawcat agent thinking|done|alert [--agent codex]
//   pawcat menu | show | hide | status
const PORT = process.env.PIXELPAW_PORT || extractFlag('--port') || 41999;

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
      if (!text) die('usage: pawcat say "message"');
      await post('/say', { text });
      console.log('the cat said it.');
      break;
    }
    case 'todo': {
      const text = rest.join(' ');
      if (!text) die('usage: pawcat todo "task"');
      const r = await post('/todo', { text });
      console.log(`added. ${r.tasks} task(s) on the cat.`);
      break;
    }
    case 'tasks': {
      const s = await (await fetch(base + '/status')).json();
      if (!s.tasks.length) return console.log('no tasks. (pawcat todo "...")');
      for (const t of s.tasks) console.log(`${t.done ? '[x]' : '[ ]'} ${t.id.slice(-5)}  ${t.text}`);
      break;
    }
    case 'agent': {
      const state = rest[0];
      if (!['thinking', 'done', 'alert', 'idle'].includes(state)) die('usage: pawcat agent thinking|done|alert|idle [--agent name]');
      const agentIdx = rest.indexOf('--agent');
      const agent = agentIdx >= 0 ? rest[agentIdx + 1] : 'script';
      // run from a real terminal = interactive; piped/cron = background (muted)
      await post('/agent', { agent, state, interactive: !!process.stdout.isTTY });
      console.log(`agent ${agent}: ${state}.`);
      break;
    }
    case 'menu': await post('/menu'); console.log('menu toggled.'); break;
    case 'show': await post('/show'); console.log('cat is out.'); break;
    case 'hide': await post('/hide'); console.log('cat is hiding.'); break;
    case 'url': {
      if (!rest[0]) die('usage: pawcat url "pixelpaw://say?text=hi"');
      console.log(JSON.stringify(await post('/url', { url: rest[0] })));
      break;
    }
    case 'status': {
      const s = await (await fetch(base + '/status')).json();
      console.log(JSON.stringify(s, null, 2));
      break;
    }
    default:
      die(`pawcat — your desktop cat, scriptable
usage:
  pawcat say "message"            speech bubble + inbox
  pawcat todo "task"              add to the cat's task list
  pawcat tasks                    list tasks
  pawcat agent <state> [--agent n]  thinking|done|alert|idle
  pawcat menu|show|hide           control the cat
  pawcat status                   full JSON state
  pawcat url "pixelpaw://..."     exercise a deep link
env: PIXELPAW_PORT (default 41999)`);
  }
}

function die(msg) { console.error(msg); process.exit(1); }

main().catch((e) => die('cat unreachable at ' + base + ' — is PixelPaw running? (' + e.message + ')'));
