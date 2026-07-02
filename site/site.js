'use strict';
/* PixelPaw landing v2 — one resident cat lives fixed at the bottom edge of
   the viewport (where she lives on a real desktop) and performs each chapter
   as it scrolls past: settling in, running a voice capture, watching agents,
   waking up with a gift, falling asleep at the footer. Every cat on this
   page is drawn by the real engine (vendor/sprites.js, verbatim). */
(function () {
  const { KFRAMES, SKINS, drawCat } = window.Sprites;
  const drawGift = window.CatGifts && window.CatGifts.drawGift;
  const SKIN = SKINS.black;
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const now = () => performance.now();
  const rand = (a, b) => a + Math.random() * (b - a);

  const HEART = ['01010', '11111', '11111', '01110', '00100'];
  const ZED = ['1111', '0010', '0100', '1111'];

  function drawPattern(ctx, rows, x, y, s, color) {
    ctx.fillStyle = color;
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        if (rows[r][c] === '1') ctx.fillRect(x + c * s, y + r * s, s, s);
      }
    }
  }

  function drawDreamBubble(ctx, x, y, s) {
    ctx.fillStyle = 'rgba(20,19,26,0.9)';
    ctx.fillRect(x - 9 * s, y - 7 * s, 18 * s, 14 * s);
    ctx.fillStyle = '#fffef8';
    ctx.fillRect(x - 8 * s, y - 6 * s, 16 * s, 12 * s);
    ctx.fillRect(x - 11 * s, y + 8 * s, 3 * s, 3 * s);
    ctx.fillStyle = '#7fa8d8';
    ctx.fillRect(x - 4 * s, y - 2 * s, 6 * s, 4 * s);
    ctx.fillRect(x + 2 * s, y - 3 * s, 2 * s, 3 * s);
    ctx.fillRect(x + 2 * s, y + 1 * s, 2 * s, 3 * s);
    ctx.fillStyle = '#14131a';
    ctx.fillRect(x - 3 * s, y - 1 * s, 2 * s, 2 * s);
  }

  const pointer = { x: -9999, y: -9999 };
  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
  }, { passive: true });

  /* ------------------------------------------------------- base cat */

  class LiveCat {
    constructor(canvas, mode) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.mode = mode;
      this.visible = true;
      const t = now();
      this.s = {
        tailIdx: 0, nextTailT: t,
        blinkUntil: 0, nextBlinkT: t + rand(1200, 4000),
        flickUntil: 0, nextFlickT: t + rand(8000, 16000),
        groomUntil: 0, nextGroomT: t + rand(9000, 22000),
        twitchUntil: 0, nextTwitchT: t + rand(3500, 7000),
        slowBlinkUntil: 0, nextSlowBlinkT: t + rand(5000, 10000),
        boopT: -1e9, boops: 0,
        nextZT: t + rand(800, 2000),
        giftIdx: 0, nextGiftT: t + 8000,
        gift: null, // morning scene: a found treasure at her feet
        led: null,  // 'amber' | 'green'
        hopUntil: 0,
        effects: [],
      };
      this.resize();
    }

    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = this.cv.clientWidth || this.cv.width;
      const h = this.cv.clientHeight || this.cv.height;
      if (!w || !h) return;
      this.cv.width = Math.round(w * dpr);
      this.cv.height = Math.round(h * dpr);
      const pad = this.mode === 'resident' || this.mode === 'mark' ? [26, 21] : [31, 25];
      this.px = Math.max(1, Math.floor(Math.min(this.cv.width / pad[0], this.cv.height / pad[1])));
    }

    baseY() { return this.cv.height - this.px * 1.5; }

    frame(t) {
      const s = this.s;
      const F = KFRAMES;
      switch (this.mode) {
        case 'groom': return Math.floor(t / 560) % 2 ? F.sit_groom2 : F.sit_groom1;
        case 'dream': return t < s.twitchUntil ? F.loaf_twitch : F.loaf;
        case 'gift': return F.sit_wrap;
        case 'mark': return F.sit;
        default: return F.sit;
      }
    }

    eye(t) {
      const s = this.s;
      if (this.mode === 'dream') return { style: 'closed' };
      if (this.mode === 'groom') return { style: 'happy' };
      if (t < s.slowBlinkUntil || t < s.blinkUntil) return { style: 'closed' };
      return this.gaze();
    }

    gaze() {
      let gx = 1, gy = 1, dilate = false;
      if (pointer.x > -999) {
        const r = this.cv.getBoundingClientRect();
        const ex = r.left + r.width / 2;
        const ey = r.top + r.height * 0.4;
        const dx = pointer.x - ex, dy = pointer.y - ey;
        const d = Math.hypot(dx, dy);
        if (d > 14) {
          const h = dx / d, v = dy / d;
          gx = h < -0.38 ? 0 : h > 0.38 ? 2 : 1;
          gy = v < -0.45 ? 0 : v > 0.45 ? 2 : 1;
        }
        dilate = d < r.width * 0.9;
      }
      if (now() - this.s.boopT < 900) dilate = true;
      return { style: 'open', gx, gy, dilate };
    }

    mouth(t) {
      const since = t - this.s.boopT;
      if (since > 250 && since < 1100) return 'mlem';
      return 'none';
    }

    update(t) {
      const s = this.s;
      if (t > s.nextTailT) { s.tailIdx = (s.tailIdx + 1) % 4; s.nextTailT = t + 560; }
      if (t > s.nextBlinkT) { s.blinkUntil = t + 130; s.nextBlinkT = t + rand(2800, 6500); }
      if (this.mode === 'dream' && !REDUCED && t > s.nextTwitchT) {
        s.twitchUntil = t + 460;
        s.nextTwitchT = t + rand(4500, 9000);
      }
      if (this.mode === 'gift') {
        if (t > s.nextSlowBlinkT) { s.slowBlinkUntil = t + 460; s.nextSlowBlinkT = t + rand(6000, 11000); }
        if (t > s.nextGiftT) { s.giftIdx = (s.giftIdx + 1) % 3; s.nextGiftT = t + 8000; }
      }
      if (this.mode === 'dream' && t > s.nextZT) {
        s.effects.push({ kind: 'z', x: this.cv.width * 0.66, y: this.baseY() - 12 * this.px, vy: -14, life: 2.2, max: 2.2 });
        s.nextZT = t + rand(1600, 2600);
      }
      const dt = 1 / 60;
      for (const p of s.effects) {
        p.life -= dt;
        p.y += (p.vy || 0) * dt * this.px * 0.5;
        p.x += (p.vx || 0) * dt * this.px * 0.5;
      }
      s.effects = s.effects.filter((p) => p.life > 0);
    }

    boop() {
      const t = now();
      const s = this.s;
      s.boopT = t;
      s.boops++;
      s.slowBlinkUntil = t + 460;
      const w = this.cv.width;
      const fh = this.frame(t).h;
      for (let i = 0; i < 3; i++) {
        s.effects.push({
          kind: 'heart',
          x: w / 2 + rand(-w * 0.16, w * 0.16),
          y: this.baseY() - fh * this.px + this.px * rand(0, 3),
          vx: rand(-4, 4), vy: rand(-11, -7),
          life: 2.0, max: 2.0,
        });
      }
    }

    draw(t) {
      const ctx = this.ctx;
      const W = this.cv.width, H = this.cv.height;
      const px = this.px;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = false;

      const frame = this.frame(t);
      let sy = 1, sx = 1;
      const sleeping = this.mode === 'dream' || (this.scene === 'sleep');
      if (sleeping) sy += Math.sin(t / 3400 * Math.PI * 2) * 0.018;
      else if (!REDUCED) sy += Math.sin(t / 1900 * Math.PI * 2) * 0.011;

      const sinceBoop = t - this.s.boopT;
      if (sinceBoop < 260) {
        const k = Math.sin((sinceBoop / 260) * Math.PI);
        sy *= 1 - 0.12 * k;
        sx *= 1 + 0.08 * k;
      }

      let hop = 0;
      if (t < this.s.hopUntil) {
        hop = Math.abs(Math.sin((this.s.hopUntil - t) / 500 * Math.PI * 2)) * px * 2.2;
      }

      ctx.save();
      ctx.translate(W / 2, this.baseY() - hop);
      ctx.scale(sx, sy);
      drawCat(ctx, frame, SKIN, px, -(frame.w * px) / 2, -(frame.h * px), {
        eye: this.eye(t),
        mouth: this.mouth(t),
        blush: sinceBoop > 0 && sinceBoop < 900,
        freckles: true,
      });
      ctx.restore();

      if (this.mode === 'gift' && drawGift) {
        const ids = ['leaf', 'bottlecap', 'beetle'];
        const gpx = Math.max(2, Math.round(px * 0.7));
        drawGift(ctx, ids[this.s.giftIdx], W / 2 + frame.w * px * 0.34, this.baseY() - gpx * 7, gpx);
      }
      if (this.s.gift && drawGift) {
        const gpx = Math.max(2, Math.round(px * 0.75));
        drawGift(ctx, this.s.gift, W / 2 + frame.w * px * 0.36, this.baseY() - gpx * 7, gpx);
      }

      if (this.s.led) {
        // she's wall-to-wall in her canvas, so the LED floats above her
        // brow-line instead of beside her (same read: it's hers)
        const lx = W / 2 - frame.w * px * 0.34;
        const ly = this.baseY() - frame.h * px - px * 3.2;
        ctx.fillStyle = '#14131a';
        ctx.fillRect(lx - px * 0.5, ly - px * 0.5, px * 2.6, px * 2.6);
        ctx.globalAlpha = REDUCED ? 1 : 0.55 + 0.45 * Math.sin(t / 480);
        ctx.fillStyle = this.s.led === 'green' ? '#52d273' : '#ffb83d';
        ctx.fillRect(lx, ly, px * 1.6, px * 1.6);
        ctx.globalAlpha = 1;
      }

      if (this.mode === 'dream' && this.s.twitchUntil > 0 && t < this.s.twitchUntil + 2100) {
        drawDreamBubble(ctx, W * 0.74, this.baseY() - 13 * px - px * 4, Math.max(1, Math.round(px * 0.5)));
      }

      for (const p of this.s.effects) {
        const a = Math.max(0, Math.min(1, p.life / (p.max * 0.6)));
        ctx.globalAlpha = a;
        if (p.kind === 'heart') drawPattern(ctx, HEART, p.x, p.y, Math.max(2, Math.round(px * 0.42)), '#f4728c');
        else drawPattern(ctx, ZED, p.x, p.y, Math.max(2, Math.round(px * 0.4)), '#9fb4d8');
        ctx.globalAlpha = 1;
      }
    }
  }

  /* ------------------------------------------------------ resident */
  /* The one cat who lives on the page. Scenes map to chapters. */

  class Resident extends LiveCat {
    constructor(canvas) {
      super(canvas, 'resident');
      this.scene = 'hero';
      this.timers = [];
      this.voicePlayed = false;
      this.say = document.getElementById('dockSay');
      this.panel = document.getElementById('dockPanel');
      this.panel.setAttribute('aria-hidden', 'true');
      this.sayTimer = null;
    }

    later(ms, fn) {
      this.timers.push(setTimeout(fn, ms));
    }
    clearTimers() {
      this.timers.forEach(clearTimeout);
      this.timers = [];
      clearTimeout(this.sayTimer);
    }

    speak(html, ms) {
      this.say.innerHTML = html;
      this.say.hidden = false;
      clearTimeout(this.sayTimer);
      if (ms) this.sayTimer = setTimeout(() => { this.say.hidden = true; }, ms);
    }
    hush() {
      this.say.hidden = true;
      clearTimeout(this.sayTimer);
    }

    // she listens: REC dot + your words arriving character by character
    listenLine(text, done) {
      if (REDUCED) {
        this.speak('<span class="rec-dot"></span>' + text);
        this.later(900, done);
        return;
      }
      let i = 0;
      const tick = () => {
        i++;
        this.speak('<span class="rec-dot"></span>' + text.slice(0, i));
        if (i < text.length) this.later(30, tick);
        else this.later(550, done);
      };
      tick();
    }

    showPanel() {
      this.panel.hidden = false;
      this.panel.classList.add('in');
      // force reflow so the drain restarts cleanly on repeat visits
      void this.panel.offsetWidth;
      this.panel.classList.add('run');
    }
    hidePanel() {
      this.panel.hidden = true;
      this.panel.classList.remove('in', 'run');
    }

    setScene(scene) {
      if (scene === this.scene) return;
      this.scene = scene;
      this.clearTimers();
      this.hidePanel();
      this.hush();
      this.s.led = null;
      this.s.gift = null;
      if (!REDUCED) this.s.hopUntil = now() + 380; // a little hop between scenes

      if (scene === 'voice') {
        this.later(700, () => {
          this.listenLine('REMIND ME TO SEND THE INVOICE AT FOUR', () => {
            this.hush();
            this.showPanel();
            this.later(REDUCED ? 2600 : 3350, () => {
              this.hidePanel();
              this.speak('ADDED — TAP TO UNDO', 2600);
            });
          });
        });
      } else if (scene === 'agents') {
        this.s.led = 'amber';
        this.later(2400, () => {
          this.s.led = 'green';
          if (!REDUCED) this.s.hopUntil = now() + 900;
          this.speak('CLAUDE DONE!', 2200);
          this.later(2600, () => { this.s.led = 'amber'; });
        });
      } else if (scene === 'morning') {
        this.s.gift = 'bottlecap';
        this.later(600, () => this.speak('MORNING! 2 DUE TODAY.', 3000));
      }
    }

    frame(t) {
      const s = this.s;
      const F = KFRAMES;
      switch (this.scene) {
        case 'sleep': return t < s.twitchUntil ? F.loaf_twitch : F.loaf;
        case 'settle': {
          if (t < s.groomUntil) return Math.floor(t / 480) % 2 ? F.sit_groom2 : F.sit_groom1;
          return F.sit_wrap; // tail around paws: settled
        }
        case 'voice': return F.sit_tail_up; // ears up, all attention
        default: {
          if (t < s.groomUntil) return Math.floor(t / 480) % 2 ? F.sit_groom2 : F.sit_groom1;
          if (t < s.flickUntil) return F.sit_flick;
          const tails = [F.sit, F.sit_tail_mid, F.sit_tail_up, F.sit_tail_mid];
          return tails[s.tailIdx];
        }
      }
    }

    eye(t) {
      const s = this.s;
      if (this.scene === 'sleep') return { style: 'closed' };
      if (t < s.groomUntil && (this.scene === 'settle' || this.scene === 'hero')) return { style: 'happy' };
      if (t < s.slowBlinkUntil || t < s.blinkUntil) return { style: 'closed' };
      if (this.scene === 'voice') {
        const g = this.gaze();
        return { ...g, gy: 0, dilate: true }; // looking up, listening hard
      }
      return this.gaze();
    }

    update(t) {
      super.update(t);
      const s = this.s;
      if (REDUCED) return;
      if (this.scene === 'hero' || this.scene === 'settle') {
        if (t > s.nextFlickT) { s.flickUntil = t + 240; s.nextFlickT = t + rand(8000, 16000); }
        const groomEvery = this.scene === 'settle' ? [7000, 14000] : [20000, 40000];
        if (t > s.nextGroomT) { s.groomUntil = t + 2800; s.nextGroomT = t + rand(groomEvery[0], groomEvery[1]); }
        if (this.scene === 'settle' && t > s.nextSlowBlinkT) {
          s.slowBlinkUntil = t + 460;
          s.nextSlowBlinkT = t + rand(6000, 11000);
        }
      }
      if (this.scene === 'sleep') {
        if (t > s.nextTwitchT) { s.twitchUntil = t + 460; s.nextTwitchT = t + rand(4500, 9000); }
        if (t > s.nextZT) {
          s.effects.push({ kind: 'z', x: this.cv.width * 0.66, y: this.baseY() - 12 * this.px, vy: -12, life: 2.4, max: 2.4 });
          s.nextZT = t + rand(1800, 2800);
        }
      }
    }
  }

  /* --------------------------------------------------------- mount */

  const cats = [];
  const resident = new Resident(document.getElementById('resident'));
  cats.push(resident);

  const mark = document.getElementById('markCat');
  if (mark) cats.push(new LiveCat(mark, 'mark'));
  document.querySelectorAll('.poseCat').forEach((cv) => cats.push(new LiveCat(cv, cv.dataset.pose)));

  const vis = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const cat = cats.find((c) => c.cv === e.target);
      if (cat && cat !== resident) cat.visible = e.isIntersecting;
    }
  }, { rootMargin: '80px' });
  cats.forEach((c) => { if (c !== resident) vis.observe(c.cv); });

  let resizeT = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => cats.forEach((c) => c.resize()), 120);
  });

  function loop() {
    const t = now();
    for (const c of cats) {
      if (!c.visible) continue;
      c.update(t);
      c.draw(t);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  /* ----------------------------------------------- scenes & ambience */

  // the night, hour by hour (body background eases between scenes)
  const AMBIENT = {
    hero: 'oklch(18% 0.013 300)',
    settle: 'oklch(17% 0.013 288)',
    voice: 'oklch(16.2% 0.014 274)',
    agents: 'oklch(15.2% 0.015 262)',
    morning: 'oklch(18.4% 0.016 322)',
    rules: 'oklch(17.6% 0.012 308)',
    sleep: 'oklch(14.8% 0.013 280)',
  };

  function enterScene(scene) {
    resident.setScene(scene);
    document.body.style.backgroundColor = AMBIENT[scene] || AMBIENT.hero;
  }

  const sceneSections = [...document.querySelectorAll('[data-scene]')];
  const sceneIO = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) enterScene(e.target.dataset.scene);
    }
  }, { rootMargin: '-42% 0px -42% 0px' });
  sceneSections.forEach((el) => sceneIO.observe(el));

  // the footer is too short to cross the mid-viewport band: when the page
  // bottoms out, the night is over and she goes to sleep
  let atBottom = false;
  window.addEventListener('scroll', () => {
    const nowBottom = window.scrollY + window.innerHeight >= document.body.scrollHeight - 60;
    if (nowBottom && !atBottom) enterScene('sleep');
    else if (!nowBottom && atBottom && resident.scene === 'sleep') {
      // stir gently: the mid-band observer re-declares the real scene
      const mid = sceneSections.find((el) => {
        const r = el.getBoundingClientRect();
        return r.top < window.innerHeight * 0.58 && r.bottom > window.innerHeight * 0.42;
      });
      if (mid) enterScene(mid.dataset.scene);
    }
    atBottom = nowBottom;
  }, { passive: true });

  /* ------------------------------------------------------ her charm */

  resident.cv.addEventListener('click', () => {
    resident.boop();
    if (resident.scene !== 'sleep') {
      resident.speak(resident.s.boops >= 3 ? 'OKAY. I LIKE YOU.' : 'MLEM.', 2200);
    } else {
      resident.speak('...ZZZ.', 1800); // she is not waking up for this
    }
  });
  resident.cv.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      resident.cv.click();
    }
  });

  // petting: stroke back and forth across her and hearts follow
  let petAccum = 0, petLastX = null, petCoolUntil = 0;
  resident.cv.addEventListener('pointermove', (e) => {
    if (petLastX != null) petAccum += Math.abs(e.clientX - petLastX);
    petLastX = e.clientX;
    if (petAccum > 140 && now() > petCoolUntil && resident.scene !== 'sleep') {
      petAccum = 0;
      petCoolUntil = now() + 900;
      const s = resident.s;
      s.slowBlinkUntil = now() + 460;
      for (let i = 0; i < 2; i++) {
        s.effects.push({
          kind: 'heart',
          x: resident.cv.width / 2 + rand(-30, 30),
          y: resident.baseY() - 15 * resident.px,
          vx: rand(-4, 4), vy: rand(-10, -7),
          life: 1.8, max: 1.8,
        });
      }
    }
  });
  resident.cv.addEventListener('pointerleave', () => { petLastX = null; petAccum = 0; });

  // hello, once she's settled on the page
  if (!REDUCED) {
    setTimeout(() => {
      if (resident.scene === 'hero' && resident.say.hidden) {
        resident.speak('HELLO. I LIVE HERE NOW.', 3200);
      }
    }, 1400);
  }

  /* -------------------------------------------------------- reveals */

  if (!REDUCED) {
    const root = document.documentElement;
    root.classList.add('reveal-armed');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('hero-in')));

    const targets = document.querySelectorAll(
      '.chapter > h2, .chapter-lede, .vow-line, .pose, .quiet-list > li, ' +
      '.dev-inner > h2, .dev-inner > .chapter-lede, .dev-list > li, ' +
      '.principles > div, .install-step, .install .fineprint, .gestures, .foot > p'
    );
    targets.forEach((el) => el.classList.add('reveal'));
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('revealed');
          io.unobserve(e.target);
        }
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    targets.forEach((el) => io.observe(el));
  }
})();
