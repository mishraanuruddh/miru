'use strict';
// Validates a user sprite pack (pure data, no code) before it may register.
// The id comes from the pack's directory name, never from the file. Returns
// { pack, errors }: pack is null whenever errors is non-empty, and the pack
// object is rebuilt key-by-key onto null prototypes — nothing from the raw
// JSON (prototype pollution, surprise keys, oversized values) survives into
// the registry or the settings store.
const { REGION_OF } = require('../renderer/sprites');

const ID_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_]{0,23}$/;
const FRAME_ID_RE = /^[a-z][a-z0-9_]{0,31}$/;
const HEX_RE = /^#[0-9a-f]{3,8}$/i;
const BUILTIN = ['classic', 'kawaii', 'sticker'];
const MAX_DIM = 48;
const MAX_FRAMES = 64;
const MIN_CYCLE_MS = 30;
const CYCLE_KEYS = ['run', 'zoomies', 'knead', 'groom', 'scroll'];
// these read as broken mid-cycle if only half the pair exists
const PAIRS = [['knead_l', 'knead_r'], ['run_a', 'run_b'], ['sit_groom1', 'sit_groom2']];

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const ownKeys = (o) => Object.keys(o).filter((k) => k !== '__proto__' && k !== 'constructor' && k !== 'prototype');

function validatePack(id, raw) {
  const errors = [];
  const err = (m) => { errors.push(m); };

  if (!ID_RE.test(String(id))) return { pack: null, errors: [`pack id "${id}" must be lowercase letters/digits/-/_ (max 32)`] };
  if (BUILTIN.includes(id)) return { pack: null, errors: [`"${id}" is a built-in pack id`] };
  if (!isObj(raw)) return { pack: null, errors: ['pack.json must be a JSON object'] };

  // ---- custom regions: single NEW chars naming NEW regions
  const regions = Object.create(null);
  if (raw.regions != null) {
    if (!isObj(raw.regions)) err('regions must be an object of {char: regionName}');
    else for (const ch of ownKeys(raw.regions)) {
      const name = raw.regions[ch];
      if (ch.length !== 1 || ch === '.' || ch === 'w') { err(`region char "${ch}" must be one char, not "." or "w"`); continue; }
      if (REGION_OF[ch]) { err(`region char "${ch}" is a base region and can't be redefined`); continue; }
      if (typeof name !== 'string' || !NAME_RE.test(name)) { err(`region "${ch}" has a bad name`); continue; }
      if (Object.prototype.hasOwnProperty.call(REGION_OF, name)) { /* char is new, name may echo a base name */ }
      regions[ch] = name;
    }
  }
  const known = Object.assign(Object.create(null), REGION_OF, regions);
  const customNames = new Set(Object.keys(regions).map((ch) => regions[ch]));

  // ---- frames
  if (!isObj(raw.frames)) return { pack: null, errors: errors.concat('frames must be an object') };
  const frameIds = ownKeys(raw.frames);
  if (!frameIds.includes('sit')) err('a pack must define at least a "sit" frame');
  if (frameIds.length > MAX_FRAMES) err(`too many frames (${frameIds.length} > ${MAX_FRAMES})`);
  const frames = Object.create(null);
  for (const fid of frameIds) {
    const f = raw.frames[fid];
    const at = `frame "${fid}"`;
    if (!FRAME_ID_RE.test(fid)) { err(`${at}: bad frame id`); continue; }
    if (!isObj(f)) { err(`${at}: must be an object`); continue; }
    const w = f.w, h = f.h;
    if (!Number.isInteger(w) || w < 1 || w > MAX_DIM) { err(`${at}: w must be 1..${MAX_DIM}`); continue; }
    if (!Number.isInteger(h) || h < 1 || h > MAX_DIM) { err(`${at}: h must be 1..${MAX_DIM}`); continue; }
    if (!Array.isArray(f.rows) || f.rows.length !== h) { err(`${at}: rows must be an array of ${h} strings`); continue; }
    let rowsOk = true;
    for (let y = 0; y < h; y++) {
      const row = f.rows[y];
      if (typeof row !== 'string' || row.length !== w) { err(`${at}: row ${y} must be a ${w}-char string`); rowsOk = false; break; }
      for (const ch of row) {
        if (ch !== '.' && !known[ch]) { err(`${at}: row ${y} uses unknown char "${ch}"`); rowsOk = false; break; }
      }
      if (!rowsOk) break;
    }
    if (!rowsOk) continue;
    const out = { w, h, rows: f.rows.map(String) };
    if (f.eyes != null) {
      if (!isObj(f.eyes)) { err(`${at}: eyes must be an object`); continue; }
      const eyes = {};
      let eyesOk = true;
      const size = f.eyes.size != null ? f.eyes.size : 4;
      const eh = f.eyes.h != null ? f.eyes.h : size;
      if (!Number.isInteger(size) || size < 1 || size > 8) { err(`${at}: eyes.size must be 1..8`); eyesOk = false; }
      if (!Number.isInteger(eh) || eh < 1 || eh > 8) { err(`${at}: eyes.h must be 1..8`); eyesOk = false; }
      for (const k of ['l', 'r']) {
        const e = f.eyes[k];
        if (e == null) continue;
        if (!Array.isArray(e) || e.length !== 2 || !Number.isInteger(e[0]) || !Number.isInteger(e[1])
          || e[0] < 0 || e[1] < 0 || e[0] + size > w || e[1] + eh > h) {
          err(`${at}: eyes.${k} out of bounds`); eyesOk = false; continue;
        }
        eyes[k] = [e[0], e[1]];
      }
      if (!eyesOk) continue;
      eyes.size = size;
      if (f.eyes.h != null) eyes.h = eh;
      for (const pk of ['pw', 'ph']) {
        if (f.eyes[pk] != null) {
          if (!Number.isInteger(f.eyes[pk]) || f.eyes[pk] < 1 || f.eyes[pk] > 8) { err(`${at}: eyes.${pk} must be 1..8`); eyesOk = false; }
          else eyes[pk] = f.eyes[pk];
        }
      }
      if (!eyesOk) continue;
      out.eyes = eyes;
    }
    if (f.mouth != null) {
      const m = f.mouth;
      if (!Array.isArray(m) || m.length !== 2 || !Number.isInteger(m[0]) || !Number.isInteger(m[1])
        || m[0] < 0 || m[1] < 0 || m[0] >= w || m[1] >= h) { err(`${at}: mouth out of bounds`); continue; }
      out.mouth = [m[0], m[1]];
    }
    if (f.pivot != null) {
      if (!Number.isInteger(f.pivot) || f.pivot < 0 || f.pivot >= h) { err(`${at}: pivot must be 0..${h - 1}`); continue; }
      out.pivot = f.pivot;
    }
    if (f.rim != null) out.rim = !!f.rim;
    if (f.side != null) out.side = !!f.side;
    frames[fid] = out;
  }

  // the editor and the live face need real eye sockets on sit
  const sit = frames.sit;
  if (sit && !(sit.eyes && sit.eyes.l && sit.eyes.r)) {
    err('sit must have live eyes (eyes.l and eyes.r) — the editor and face render need them');
  }
  for (const [a, b] of PAIRS) {
    if (!!frames[a] !== !!frames[b]) err(`frames "${a}" and "${b}" must be defined together`);
  }

  // ---- colors: regionDefaults + per-skin palettes may only color the
  // pack's own custom regions; base regions always come from the skin
  const checkColors = (obj, where) => {
    const out = Object.create(null);
    for (const name of ownKeys(obj)) {
      if (!customNames.has(name)) { err(`${where}: "${name}" is not one of this pack's custom regions`); continue; }
      if (typeof obj[name] !== 'string' || !HEX_RE.test(obj[name])) { err(`${where}: "${name}" must be a hex color`); continue; }
      out[name] = obj[name];
    }
    return out;
  };
  let regionDefaults = null;
  if (raw.regionDefaults != null) {
    if (!isObj(raw.regionDefaults)) err('regionDefaults must be an object');
    else regionDefaults = checkColors(raw.regionDefaults, 'regionDefaults');
  }
  let palettes = null;
  if (raw.palettes != null) {
    if (!isObj(raw.palettes)) err('palettes must be an object of {skinId: {region: hex}}');
    else {
      palettes = Object.create(null);
      for (const skinId of ownKeys(raw.palettes)) {
        if (!/^[a-z]{1,16}$/.test(skinId)) { err(`palettes: bad skin id "${skinId}"`); continue; }
        if (!isObj(raw.palettes[skinId])) { err(`palettes.${skinId} must be an object`); continue; }
        palettes[skinId] = checkColors(raw.palettes[skinId], `palettes.${skinId}`);
      }
    }
  }

  // ---- cadences
  let cycles = null;
  if (raw.cycles != null) {
    if (!isObj(raw.cycles)) err('cycles must be an object of {name: ms}');
    else {
      cycles = Object.create(null);
      for (const k of ownKeys(raw.cycles)) {
        if (!CYCLE_KEYS.includes(k)) { err(`cycles: unknown cycle "${k}"`); continue; }
        const v = raw.cycles[k];
        if (!Number.isInteger(v) || v < MIN_CYCLE_MS || v > 5000) { err(`cycles.${k} must be ${MIN_CYCLE_MS}..5000 ms`); continue; }
        cycles[k] = v;
      }
    }
  }

  // ---- named action responses
  let anims = null;
  if (raw.anims != null) {
    if (!isObj(raw.anims)) err('anims must be an object');
    else if (raw.anims.giftPresent != null) {
      const g = raw.anims.giftPresent;
      if (!isObj(g) || typeof g.frame !== 'string' || !frames[g.frame]) {
        err('anims.giftPresent.frame must name a frame in this pack');
      } else {
        anims = Object.create(null);
        anims.giftPresent = { frame: g.frame, sparkle: !!g.sparkle };
      }
    }
  }

  // ---- meta (display strings are always rendered via textContent)
  const rawMeta = isObj(raw.meta) ? raw.meta : {};
  const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
  const meta = {
    id,
    name: str(rawMeta.name, 24) || id,
    author: str(rawMeta.author, 32),
    version: str(rawMeta.version, 16),
    freckles: !!rawMeta.freckles,
  };

  if (errors.length) return { pack: null, errors };
  return {
    pack: {
      meta,
      frames,
      regions: Object.keys(regions).length ? regions : null,
      regionDefaults: regionDefaults && Object.keys(regionDefaults).length ? regionDefaults : null,
      palettes: palettes && Object.keys(palettes).length ? palettes : null,
      cycles: cycles && Object.keys(cycles).length ? cycles : null,
      anims,
    },
    errors: [],
  };
}

module.exports = { validatePack };
