'use strict';
// The cat's brain: one short utterance in → a validated route object out.
// The LLM path shells out to `claude -p` (headless, --bare, haiku); a
// deterministic regex router covers TEST mode, offline, timeouts and the
// daily cost cap — the cat keeps working without a brain, just dumber.
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');

const CLAUDE_BIN = '/opt/homebrew/bin/claude';
const INTENTS = ['todo', 'note', 'quick_answer', 'open_app', 'ask_agent', 'other'];

const SYSTEM_PROMPT = [
  'You are the intent router for a desktop voice assistant. The user spoke one short',
  'utterance, transcribed by speech-to-text (it may contain small errors). Reply with',
  'ONLY a single JSON object, no markdown fences, no prose:',
  '{"intent":"todo|note|quick_answer|open_app|ask_agent|other","text":"...",',
  ' "due":null,"app":null,"agent":null,"answer":null,"confidence":0.0}',
  'Rules:',
  '- todo: the user wants to remember/do something ("remind me...", "I need to...",',
  '  "add a task..."). text = the task, imperative, max 80 chars. due = ONLY if a',
  '  time was spoken, as exactly one of these token forms: "4pm", "16:30", "9:30am",',
  '  "+30m", "+2h". If the time is not today-representable (e.g. "tomorrow", "next',
  '  week"), append it to text in words and set due to null. Never invent times.',
  '- note: the user wants to write something down ("note that...", "note: ...").',
  '  text = the note body.',
  '- quick_answer: a question wanting a short factual answer. Put a max-140-char',
  '  answer in "answer". If unsure, answer briefly and lower the confidence.',
  '- open_app: open/launch/start an application. app = the proper macOS app name',
  '  ("vs code" -> "Visual Studio Code", "safari" -> "Safari").',
  '- ask_agent: the user addresses the coding agent ("tell claude to...", "ask the',
  '  agent to..."). agent = the instruction verbatim minus the address prefix,',
  '  max 200 chars.',
  '- other: anything else. text = the utterance, cleaned of filler words.',
  'Set unused fields to null. confidence in [0,1] reflects both transcription and',
  'intent certainty.',
].join('\n');

function clampStr(v, n) {
  if (v == null) return null;
  const s = String(v).slice(0, n).trim();
  return s || null;
}

function validateRoute(obj, transcript) {
  if (!obj || typeof obj !== 'object') return null;
  const intent = String(obj.intent || '').toLowerCase();
  if (!INTENTS.includes(intent)) return null;
  const due = clampStr(obj.due, 12);
  return {
    intent,
    text: clampStr(obj.text, 200) || String(transcript).slice(0, 200),
    due: due && /^(\+\d+\s*[mh]?|\d{1,2}(:\d{2})?\s*(am|pm)?)$/i.test(due) ? due.replace(/\s+/g, '') : null,
    app: clampStr(obj.app, 80),
    agent: clampStr(obj.agent, 200),
    answer: clampStr(obj.answer, 200),
    confidence: Math.max(0, Math.min(1, Number(obj.confidence) || 0.5)),
    source: 'llm',
  };
}

// spoken-English time → parseDue token ("at 4 pm" → "4pm", "in 30 minutes" → "+30m")
function extractDue(s) {
  let m = s.match(/(.+?)\s+(?:at|@)\s+(\d{1,2}(?::\d{2})?)\s*(am|pm)?\s*$/i);
  if (m) return { text: m[1].trim(), due: m[2] + (m[3] || '').toLowerCase() };
  m = s.match(/(.+?)\s+in\s+(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours)\s*$/i);
  if (m) return { text: m[1].trim(), due: '+' + m[2] + (/^h/i.test(m[3]) ? 'h' : 'm') };
  return { text: s.trim(), due: null };
}

function classifyFallback(transcript) {
  // speech-to-text writes "5 p.m." — normalize to "5pm" for the due grammar
  const s = String(transcript || '').trim()
    .replace(/\b([ap])\.\s?m\.?/gi, '$1m')
    .replace(/[.!]+\s*$/, '');
  const base = {
    intent: 'other', text: s.slice(0, 200), due: null, app: null, agent: null,
    answer: null, confidence: 0.7, source: 'fallback',
  };
  let m;
  if ((m = s.match(/^(?:remind me(?: to)?|todo|to[- ]do|add (?:a )?(?:task|todo)(?: to)?)[,:]?\s+(.+)/i))) {
    const { text, due } = extractDue(m[1]);
    return { ...base, intent: 'todo', text: text.slice(0, 80), due };
  }
  if ((m = s.match(/^(?:note(?: that)?|note:|write (?:this |that )?down)[,:]?\s+(.+)/i))) {
    return { ...base, intent: 'note', text: m[1].trim().slice(0, 200) };
  }
  if ((m = s.match(/^(?:open|launch|start)\s+(.+?)$/i))) {
    return { ...base, intent: 'open_app', app: m[1].trim().slice(0, 80) };
  }
  if ((m = s.match(/^(?:tell|ask|have)\s+(?:claude|codex|the agent|agent)\s*(?:to\s+)?(.+)/i))) {
    return { ...base, intent: 'ask_agent', agent: m[1].trim().slice(0, 200) };
  }
  if (/\?\s*$/.test(String(transcript))) {
    // a question with no brain online: capture it honestly, don't guess
    return { ...base, degraded: true, confidence: 0.4 };
  }
  return { ...base, confidence: 0.4 };
}

let claudeOk = null;
function availability() {
  if (claudeOk === null) claudeOk = fs.existsSync(CLAUDE_BIN);
  return { claude: claudeOk };
}

function userPrompt(transcript) {
  return 'Now: ' + new Date().toString().slice(0, 21) +
    '\nUtterance: "' + String(transcript).slice(0, 400) + '"';
}

function classify(transcript, { timeout = 15000, test = false, capped = false } = {}) {
  if (test || capped || !availability().claude) {
    return Promise.resolve(classifyFallback(transcript));
  }
  return new Promise((resolve) => {
    // note: --bare would shrink the prompt but strips credentials ("Not
    // logged in") — a neutral cwd already avoids project context
    execFile(CLAUDE_BIN, [
      '-p', userPrompt(transcript),
      '--output-format', 'json', '--model', 'haiku',
      '--system-prompt', SYSTEM_PROMPT, '--max-turns', '1',
    ], { cwd: os.tmpdir(), timeout, maxBuffer: 1 << 20 }, (err, stdout) => {
      const degraded = () => resolve({ ...classifyFallback(transcript), degradedLlm: true });
      if (err) return degraded();
      try {
        const env = JSON.parse(stdout);
        if (env.is_error) return degraded();
        const raw = String(env.result || '')
          .replace(/^\s*```(?:json)?\s*/i, '')
          .replace(/\s*```\s*$/, '');
        let obj;
        try { obj = JSON.parse(raw); }
        catch { const mm = raw.match(/\{[\s\S]*\}/); obj = mm ? JSON.parse(mm[0]) : null; }
        const route = validateRoute(obj, transcript);
        if (!route) return degraded();
        route._cost = env.total_cost_usd || 0;
        resolve(route);
      } catch { degraded(); }
    });
  });
}

module.exports = { classify, classifyFallback, validateRoute, availability, SYSTEM_PROMPT };
