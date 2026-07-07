#!/usr/bin/env node
'use strict';
// Miru MCP server (stdio): lets Claude Code & friends drive the cat as
// native tools. Pure JSON-RPC over stdin/stdout, proxying the local HTTP API.
const PORT = process.env.MIRU_PORT || 41999;
const BASE = `http://127.0.0.1:${PORT}`;

const TOOLS = [
  {
    name: 'cat_say',
    description: 'Make the desktop cat show a speech bubble with a short message (also lands in its inbox). Use for notifying the user of progress or results.',
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'Message, max ~120 chars' } }, required: ['text'] },
  },
  {
    name: 'cat_todo',
    description: "Add a task to the desktop cat's task list (user sees it in the cat menu and checks it off there).",
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'Task text' } }, required: ['text'] },
  },
  {
    name: 'cat_list_tasks',
    description: "Read the user's task list held by the desktop cat.",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'cat_status',
    description: 'Full state of the desktop cat: agent sessions, tasks, pomodoro, pending question.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'ask_user',
    description: 'Ask the user a question via the desktop cat and wait for their answer. Blocks until they click an option (or dismiss). Returns the chosen option. Use for decisions only the user can make.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question. Line breaks allowed (~500 chars); keep it scannable.' },
        options: {
          type: 'array',
          description: '1-4 choices',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Stable id returned to you (defaults to the option number)' },
              label: { type: 'string', description: 'Short chip label (~60 chars)' },
              description: { type: 'string', description: 'Optional one-line detail shown under the label' },
            },
            required: ['label'],
          },
        },
        agent: { type: 'string', description: 'Short name shown to the user as the asker (default: mcp)' },
        timeoutS: { type: 'number', description: 'Optional deadline in seconds. Default: wait indefinitely.' },
      },
      required: ['question', 'options'],
    },
  },
  {
    name: 'cat_voice',
    description: "Route a natural-language command through the desktop cat's brain: to-dos ('remind me to X at 4pm'), notes ('note: ...'), open apps, or captures. The user confirms via chips on the cat before anything happens.",
    inputSchema: { type: 'object', properties: { text: { type: 'string', description: 'One short utterance' } }, required: ['text'] },
  },
];

async function callTool(name, args) {
  const post = async (p, body) => {
    const r = await fetch(BASE + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    return r.json();
  };
  switch (name) {
    case 'cat_say': {
      await post('/say', { text: String(args.text || '') });
      return 'The cat said it (bubble + inbox).';
    }
    case 'cat_todo': {
      const r = await post('/todo', { text: String(args.text || '') });
      return `Task added. The cat now holds ${r.tasks} task(s).`;
    }
    case 'cat_list_tasks': {
      const s = await (await fetch(BASE + '/status')).json();
      if (!s.tasks.length) return 'No tasks on the cat.';
      return s.tasks.map((t) => `${t.done ? '[x]' : '[ ]'} ${t.text}`).join('\n');
    }
    case 'cat_status': {
      const s = await (await fetch(BASE + '/status')).json();
      return JSON.stringify(s, null, 2);
    }
    case 'ask_user': {
      const body = { agent: String(args.agent || 'mcp'), question: String(args.question || ''), options: args.options };
      if (Number(args.timeoutS) > 0) body.timeoutMs = Math.round(Number(args.timeoutS) * 1000);
      const r = await post('/ask', body);
      if (!r.ok) return 'The cat could not ask: ' + (r.error || 'unknown error');
      if (!r.answered) return `No answer from the user (${r.reason} after ${Math.round((r.elapsedMs || 0) / 1000)}s). Re-ask later or proceed conservatively.`;
      return `The user chose: "${r.label}" (id: ${r.id}, answered after ${Math.round((r.elapsedMs || 0) / 1000)}s).`;
    }
    case 'cat_voice': {
      const r = await post('/voice', { text: String(args.text || '') });
      if (!r.ok) return 'The cat is busy (' + (r.error || 'try again') + ').';
      return `Routed as ${r.intent}. The user confirms on the cat.`;
    }
  }
  throw new Error('unknown tool ' + name);
}

// ------------------------------------------------------------ JSON-RPC stdio
let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) handle(line);
  }
});

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function replyError(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

async function handle(line) {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  try {
    if (method === 'initialize') {
      reply(id, {
        protocolVersion: (params && params.protocolVersion) || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'miru', version: '1.0.0' },
      });
    } else if (method === 'notifications/initialized') {
      // notification: no response
    } else if (method === 'tools/list') {
      reply(id, { tools: TOOLS });
    } else if (method === 'tools/call') {
      const text = await callTool(params.name, params.arguments || {});
      reply(id, { content: [{ type: 'text', text }] });
    } else if (id != null) {
      replyError(id, -32601, 'method not found: ' + method);
    }
  } catch (e) {
    if (id != null) replyError(id, -32000, e.message);
  }
}
