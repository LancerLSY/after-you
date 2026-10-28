import { RULES, getEchoState } from './engine.js';

const WIDTH = RULES.width;
const HEIGHT = RULES.height;
const TAU = Math.PI * 2;
const MINT = '#caffb9';
const LILAC = '#bca6ff';
const LIGHT = '#eaff9a';
const ROSE = '#ff9dba';
const TRAIL_CAPACITY = 80;
const EFFECT_CAPACITY = 144;
const HISTORY_DASH = [2, 7];
const FUTURE_DASH = [1, 5];
const BOSS_FUTURE_DASH = [4, 4];
const BOSS_COLORS = [LILAC, '#ffbd87', '#ff8eac'];
const NO_DASH = [];
const DEMO_LIGHTS = new Float32Array([125, 192, 665, 175, 595, 420, 246, 418, 405, 154]);
const SPRITE_ANCHOR_X = [0.591, 0.535, 0.478];
const SPRITE_ANCHOR_Y = [0.529, 0.522, 0.526];

function clockSeconds() {
  return performance.now() / 1000;
}

/** Sample a recorded path into reusable storage; never modify simulation state. */
function sampleEcho(echo, time, out) {
  const elapsed = Math.max(0, time - echo.startTime);
  const cycle = Math.floor((elapsed + 1e-8) / RULES.loopDuration);
  const local = Math.max(0, elapsed - cycle * RULES.loopDuration);
  const frame = Math.min(local * RULES.tickRate, echo.path.length - 1);
  const index = Math.floor(frame);
  const a = echo.path[index];
  const b = echo.path[Math.min(index + 1, echo.path.length - 1)];
  const mix = frame - index;
  out.x = a.x + (b.x - a.x) * mix;
  out.y = a.y + (b.y - a.y) * mix;
  out.cycle = cycle;
}

/** Canvas-only view. Events are consumed once by onEvents, after each step(). */
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    if (!this.ctx) throw new Error('This browser cannot create the game canvas.');
    this._spriteSheet = null;
    this._loadPromise = null;
    this._width = 0;
    this._height = 0;
    this._dpr = 0;
    this._lastClock = clockSeconds();
    this._startedAt = this._lastClock;
    this._lastGame = null;
    this._lastGameTime = -1;
    this._wasDemo = true;
    this._hitRemaining = 0;
    this._trail = new Float32Array(TRAIL_CAPACITY * 3);
    this._trailHead = 0;
    this._trailCount = 0;
    this._lastTrailTime = -1;
    this._point = { x: 0, y: 0, cycle: 0 };
    this._demoPoint = { x: 0, y: 0 };
    this._effects = Array.from({ length: EFFECT_CAPACITY }, () => ({
      active: false, kind: 'spark', x: 0, y: 0, vx: 0, vy: 0,
      age: 0, life: 1, size: 1, color: MINT, label: '',
    }));
    this._effectHead = 0;
    this._dust = new Float32Array(48 * 5);
    for (let index = 0; index < 48; index += 1) {
      const offset = index * 5;
      this._dust[offset] = 35 + ((index * 179.31) % 730);
      this._dust[offset + 1] = 80 + ((index * 97.17) % 425);
      this._dust[offset + 2] = 0.45 + ((index * 0.37) % 0.85);
      this._dust[offset + 3] = index * 2.39996;
      this._dust[offset + 4] = 0.15 + (index % 5) * 0.04;
    }
    this._observer = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => this.resize()) : null;
    this._observer?.observe(canvas);
    this.resize();
  }

  /** A missing image falls back to readable vector bodies, without blocking play. */
  load() {
    if (this._loadPromise) return this._loadPromise;
    this._loadPromise = new Promise((resolve) => {
      const sheet = new Image();
      sheet.decoding = 'async';
      sheet.onload = () => {
        this._spriteSheet = sheet;
        resolve(true);
      };
      sheet.onerror = () => resolve(false);
      sheet.src = new URL('./assets/sprites.png', import.meta.url).href;
    });
    return this._loadPromise;
  }

  /** CSS owns the displayed size; rendering always uses the 800 × 560 world. */
  resize() {
    const dpr = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    const width = Math.max(1, Math.round((this.canvas.clientWidth || WIDTH) * dpr));
    const height = Math.max(1, Math.round((this.canvas.clientHeight || HEIGHT) * dpr));
    if (width === this._width && height === this._height && dpr === this._dpr) return;
    this._width = width;
    this._height = height;
    this._dpr = dpr;
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = 'high';
  }

  reset() {
    this._trailHead = 0;
    this._trailCount = 0;
    this._lastTrailTime = -1;
    this._lastGameTime = -1;
    this._hitRemaining = 0;
    for (const effect of this._effects) effect.active = false;
  }

  destroy() {
    this._observer?.disconnect();
  }

  _effect(kind, x, y, life, color, size = 1, label = '') {
    const effect = this._effects[this._effectHead];
    this._effectHead = (this._effectHead + 1) % EFFECT_CAPACITY;
    effect.active = true;
    effect.kind = kind;
    effect.x = x;
    effect.y = y;
    effect.vx = 0;
    effect.vy = 0;
    effect.age = 0;
    effect.life = life;
    effect.color = color;
    effect.size = size;
    effect.label = label;
    return effect;
  }

  _sparks(x, y, count, color, strength = 1) {
    for (let index = 0; index < count; index += 1) {
      const angle = index * TAU / count + this._effectHead * 0.37;
      const speed = (28 + (index % 4) * 17) * strength;
      const effect = this._effect('spark', x, y, 0.42 + (index % 3) * 0.12, color, 1.2 + index % 2);
      effect.vx = Math.cos(angle) * speed;
      effect.vy = Math.sin(angle) * speed;
    }
  }

  onEvents(events) {
    for (const event of events || []) {
      if (!Number.isFinite(event.x) || !Number.isFinite(event.y)) continue;
      if (event.type === 'light') {
        this._sparks(event.x, event.y, 9, LIGHT);
        this._effect('ring', event.x, event.y, 0.4, LIGHT, 24);
        this._effect('text', event.x, event.y - 16, 0.85, LIGHT, 14, `+${event.points}`);
      } else if (event.type === 'shatter') {
        const color = event.reason === 'boss-hit' ? BOSS_COLORS[event.stage] || LILAC : LILAC;
        this._sparks(event.x, event.y, 18, color, 1.6);
        this._effect('ring', event.x, event.y, 0.5, color, 42);
        if (event.points > 0) this._effect('text', event.x, event.y - 19, 1, color, 17, `+${event.points}`);
      } else if (event.type === 'boss-stage') {
        this._effect('ring', event.x, event.y, RULES.bossStageWarning, BOSS_COLORS[event.stage] || LILAC, 52);
      } else if (event.type === 'dash') {
        this._effect('ring', event.x, event.y, 0.32, MINT, 38);
        this._sparks(event.x, event.y, 6, MINT, 0.7);
      } else if (event.type === 'damage') {
        this._hitRemaining = 0.3;
        this._effect('ring', event.x, event.y, 0.48, ROSE, 48);
        this._sparks(event.x, event.y, 13, ROSE, 1.1);
      } else if (event.type === 'echo') {
        this._effect('ring', event.x, event.y, RULES.warningDuration, LILAC, 46);
      } else if (event.type === 'spawn') {
        this._effect('ring', event.x, event.y, 0.42, LIGHT, 20);
      }
    }
  }

  render(game, { demo = false, reducedMotion = false } = {}) {
    const now = clockSeconds();
    const dt = Math.min(0.05, Math.max(0, now - this._lastClock));
    this._lastClock = now;
    if (this._dpr !== Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1)) || !this._observer) this.resize();
    const ctx = this.ctx;
    ctx.setTransform(this._width / WIDTH, 0, 0, this._height / HEIGHT, 0, 0);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    this._hitRemaining = Math.max(0, this._hitRemaining - dt);
    if (!reducedMotion && !demo && this._hitRemaining > 0) {
      const shake = this._hitRemaining / 0.3 * 3;
      ctx.translate(Math.sin(now * 71) * shake, Math.cos(now * 89) * shake);
    }
    const visualTime = reducedMotion ? 0 : now - this._startedAt;
    this._drawBackground(visualTime);
    if (demo || !game) {
      if (game?.mode === 'boss' && game.echoes[0]?.path?.length) this._drawBossDemo(game, visualTime, reducedMotion);
      else this._drawDemo(visualTime, reducedMotion);
      this._wasDemo = true;
    } else {
      if (game !== this._lastGame || game.time < this._lastGameTime || this._wasDemo) {
        this._trailCount = 0;
        this._trailHead = 0;
        this._lastTrailTime = -1;
      }
      this._lastGame = game;
      this._lastGameTime = game.time;
      this._wasDemo = false;
      for (const light of game.lights) this._drawLight(light.x, light.y, visualTime, light.expiresAt - game.time);
      for (let index = 0; index < game.echoes.length; index += 1) {
        this._drawEcho(game.echoes[index], game.time, reducedMotion, game.mode === 'boss' && index === 0 ? game.boss : null);
      }
      this._recordTrail(game.player, game.time);
      if (!reducedMotion) this._drawPlayerTrail(game.time);
      this._drawPlayer(game.player, visualTime, reducedMotion);
    }
    this._drawEffects(dt, reducedMotion, demo);
    if (!demo && !reducedMotion && this._hitRemaining > 0.17) {
      ctx.globalAlpha = (this._hitRemaining - 0.17) * 0.2;
      ctx.fillStyle = ROSE;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }
    ctx.restore();
  }

  _drawBackground(time) {
    const ctx = this.ctx;
    ctx.globalAlpha = 0.075;
    ctx.strokeStyle = '#91afc5';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let x = 25; x < WIDTH; x += 50) { ctx.moveTo(x, 68); ctx.lineTo(x, 514); }
    for (let y = 65; y < 520; y += 50) { ctx.moveTo(22, y); ctx.lineTo(778, y); }
    ctx.stroke();
    ctx.fillStyle = '#cce2ec';
    for (let index = 0; index < this._dust.length; index += 5) {
      const phase = this._dust[index + 3];
      const drift = time * this._dust[index + 4];
      const x = this._dust[index] + Math.sin(drift + phase) * 3;
      const y = this._dust[index + 1] + Math.cos(drift * 0.7 + phase) * 4;
      ctx.globalAlpha = 0.12 + (Math.sin(drift + phase) + 1) * 0.09;
      ctx.beginPath();
      ctx.arc(x, y, this._dust[index + 2], 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawSprite(index, x, y, height, alpha = 1) {
    const ctx = this.ctx;
    ctx.globalAlpha = alpha;
    if (this._spriteSheet) {
      // Original 1776 × 888 sheet: three columns, transparent margin above/below.
      // Anchors are the center of each bright body, rather than its trailing halo.
      const sheet = this._spriteSheet;
      const column = sheet.naturalWidth / 3;
      const sourceY = sheet.naturalHeight * 110 / 888;
      const sourceHeight = sheet.naturalHeight * 680 / 888;
      const width = height * column / sourceHeight;
      ctx.drawImage(sheet, index * column, sourceY, column, sourceHeight,
        x - width * SPRITE_ANCHOR_X[index], y - height * SPRITE_ANCHOR_Y[index], width, height);
    } else if (index === 2) {
      const radius = height * 0.22;
      ctx.fillStyle = LIGHT;
      ctx.beginPath();
      ctx.moveTo(x, y - radius);
      ctx.quadraticCurveTo(x + 2, y - 2, x + radius, y);
      ctx.quadraticCurveTo(x + 2, y + 2, x, y + radius);
      ctx.quadraticCurveTo(x - 2, y + 2, x - radius, y);
      ctx.quadraticCurveTo(x - 2, y - 2, x, y - radius);
      ctx.fill();
    } else {
      const radius = index === 0 ? RULES.playerRadius : RULES.echoRadius;
      ctx.fillStyle = index === 0 ? MINT : LILAC;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#18243c';
      ctx.beginPath();
      ctx.ellipse(x - 4, y - 1, 1.8, 3, 0, 0, TAU);
      ctx.ellipse(x + 4, y - 1, 1.8, 3, 0, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawLight(x, y, time, remaining = 8) {
    const ctx = this.ctx;
    const pulse = 1 + Math.sin(time * 2.6 + x * 0.019) * 0.055;
    const alpha = remaining < 1 ? Math.max(0.25, remaining) : 1;
    ctx.strokeStyle = LIGHT;
    ctx.lineWidth = 0.75;
    ctx.globalAlpha = alpha * 0.12;
    ctx.beginPath();
    ctx.arc(x, y, 13 * pulse, 0, TAU);
    ctx.stroke();
    this._drawSprite(2, x, y, 36 * pulse, alpha);
  }

  _drawEchoPath(echo, from, to, alpha, future, color = LILAC, boss = false) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = future ? (boss ? 2 : 1.5) : 1;
    ctx.lineCap = 'round';
    ctx.setLineDash(future ? (boss ? BOSS_FUTURE_DASH : FUTURE_DASH) : HISTORY_DASH);
    ctx.beginPath();
    const steps = Math.max(1, Math.ceil((to - from) * 30));
    const sampleStep = (to - from) / steps;
    const maxDistance = RULES.dashSpeed * sampleStep * 1.1 + 4;
    let previousCycle = -1;
    let previousX = 0;
    let previousY = 0;
    for (let step = 0; step <= steps; step += 1) {
      sampleEcho(echo, from + (to - from) * step / steps, this._point);
      // A recording can end far from its start. Neither its loop reset nor a
      // discontinuous imported sample is a traversed (or damaging) line.
      const jump = Math.hypot(this._point.x - previousX, this._point.y - previousY) > maxDistance;
      if (step === 0 || previousCycle !== this._point.cycle || jump) ctx.moveTo(this._point.x, this._point.y);
      else ctx.lineTo(this._point.x, this._point.y);
      previousCycle = this._point.cycle;
      previousX = this._point.x;
      previousY = this._point.y;
    }
    ctx.stroke();
    ctx.setLineDash(NO_DASH);
    ctx.globalAlpha = 1;
  }

  _drawEcho(echo, time, reducedMotion, boss = null, preview = false) {
    if (!echo.path?.length) return;
    const ctx = this.ctx;
    const color = boss ? BOSS_COLORS[boss.stage] || LILAC : LILAC;
    const state = preview ? 'active' : getEchoState(echo, time);
    const defeated = Boolean(boss?.defeated);
    const dormant = state === 'dormant' || defeated;
    const respawnRemaining = preview ? 0 : Math.max(0, echo.disabledUntil - time);
    this._drawEchoPath(echo, Math.max(echo.startTime, time - 1.5), time, dormant ? 0.045 : boss ? 0.3 : 0.17, false, color);
    if (!dormant) this._drawEchoPath(echo, time, time + 0.75, boss ? 0.72 : 0.42, true, color, Boolean(boss));
    sampleEcho(echo, time, this._point);
    const { x, y } = this._point;
    if (state === 'warning') {
      ctx.globalAlpha = reducedMotion ? 0.45 : 0.3 + 0.2 * (1 + Math.sin(time * 9)) / 2;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, 21, 0, TAU);
      ctx.stroke();
    }
    // The bright body is about 24 px; the softer outer flame has no collision.
    const alpha = dormant ? 0.12 : respawnRemaining > 0 ? 0.25 + (1 - respawnRemaining / RULES.warningDuration) * 0.3 : state === 'warning' ? 0.5 : 0.95;
    this._drawSprite(1, x, y, 54, alpha);
    if (!dormant) {
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, echo.radius, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (boss) this._drawBossHealth(x, y, boss, color, dormant, respawnRemaining);
  }

  _drawBossHealth(x, y, boss, color, dormant, respawnRemaining) {
    const ctx = this.ctx;
    // This information ring deliberately sits outside the unchanged radius-13
    // body. Its scale adds presence without implying a larger collision box.
    const radius = 29;
    const count = Math.max(1, boss.maxHp);
    const arc = TAU / count;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    for (let index = 0; index < count; index += 1) {
      const filled = index < boss.hp && !boss.defeated;
      ctx.globalAlpha = filled ? (dormant ? 0.4 : 0.92) : 0.14;
      ctx.lineWidth = filled ? 3 : 1.5;
      ctx.beginPath();
      const start = -Math.PI / 2 + index * arc + 0.14;
      ctx.arc(x, y, radius, start, start + arc - 0.28);
      ctx.stroke();
    }
    if (respawnRemaining > 0) {
      const progress = 1 - Math.min(1, respawnRemaining / RULES.shatterDuration);
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(x, y, radius - 5, -Math.PI / 2, -Math.PI / 2 + TAU * progress);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _recordTrail(player, time) {
    if (time - this._lastTrailTime < 1 / 60 - 1e-8) return;
    const index = this._trailHead * 3;
    this._trail[index] = player.x;
    this._trail[index + 1] = player.y;
    this._trail[index + 2] = time;
    this._trailHead = (this._trailHead + 1) % TRAIL_CAPACITY;
    this._trailCount = Math.min(TRAIL_CAPACITY, this._trailCount + 1);
    this._lastTrailTime = time;
  }

  _drawPlayerTrail(time) {
    const ctx = this.ctx;
    ctx.strokeStyle = MINT;
    ctx.lineCap = 'round';
    for (let index = 1; index < this._trailCount; index += 1) {
      const a = ((this._trailHead - this._trailCount + index - 1 + TRAIL_CAPACITY) % TRAIL_CAPACITY) * 3;
      const b = ((this._trailHead - this._trailCount + index + TRAIL_CAPACITY) % TRAIL_CAPACITY) * 3;
      const age = time - this._trail[b + 2];
      if (age > 0.65) continue;
      const fade = 1 - age / 0.65;
      ctx.globalAlpha = fade * fade * 0.32;
      ctx.lineWidth = 1 + fade * 6;
      ctx.beginPath();
      ctx.moveTo(this._trail[a], this._trail[a + 1]);
      ctx.lineTo(this._trail[b], this._trail[b + 1]);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  _drawPlayer(player, time, reducedMotion) {
    const ctx = this.ctx;
    const dashing = player.dashTime > 0;
    if (dashing) {
      ctx.strokeStyle = MINT;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 20, 0, TAU);
      ctx.stroke();
      if (!reducedMotion) {
        const dx = player.dashX;
        const dy = player.dashY;
        ctx.globalAlpha = 0.42;
        ctx.beginPath();
        for (let lane = -1; lane <= 1; lane += 1) {
          const offset = lane * 7;
          ctx.moveTo(player.x - dx * 17 - dy * offset, player.y - dy * 17 + dx * offset);
          ctx.lineTo(player.x - dx * (42 - Math.abs(lane) * 7) - dy * offset, player.y - dy * (42 - Math.abs(lane) * 7) + dx * offset);
        }
        ctx.stroke();
      }
    }
    if (player.invulnerable > 0) {
      ctx.globalAlpha = reducedMotion ? 0.5 : 0.4 + Math.sin(time * 7) * 0.15;
      ctx.strokeStyle = MINT;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(player.x, player.y, 18, 0, TAU);
      ctx.stroke();
    }
    this._drawSprite(0, player.x, player.y, 52, 1);
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = MINT;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.arc(player.x, player.y, player.radius, 0, TAU);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  _demoPosition(time, out) {
    out.x = 420 + Math.sin(time * 0.33 + 0.3) * 184 + Math.sin(time * 0.81) * 25;
    out.y = 290 + Math.sin(time * 0.52 + 0.55) * 102;
  }

  _drawDemo(time, reducedMotion) {
    const ctx = this.ctx;
    for (let index = 0; index < DEMO_LIGHTS.length; index += 2) {
      this._drawLight(DEMO_LIGHTS[index], DEMO_LIGHTS[index + 1], time);
    }
    for (let ghost = 2; ghost >= 0; ghost -= 1) {
      const localTime = time - ghost * 5.4;
      ctx.strokeStyle = ghost === 0 ? MINT : LILAC;
      ctx.globalAlpha = ghost === 0 ? 0.23 : 0.25;
      ctx.lineWidth = ghost === 0 ? 2 : 1.2;
      ctx.lineCap = 'round';
      ctx.setLineDash(ghost === 0 ? NO_DASH : HISTORY_DASH);
      ctx.beginPath();
      for (let step = 0; step <= 36; step += 1) {
        this._demoPosition(localTime - 3 + step / 12, this._demoPoint);
        if (step === 0) ctx.moveTo(this._demoPoint.x, this._demoPoint.y);
        else ctx.lineTo(this._demoPoint.x, this._demoPoint.y);
      }
      ctx.stroke();
      ctx.setLineDash(NO_DASH);
      this._demoPosition(localTime, this._demoPoint);
      const x = this._demoPoint.x;
      const y = this._demoPoint.y;
      this._drawSprite(ghost === 0 ? 0 : 1, x, y, ghost === 0 ? 54 : 52, ghost === 0 ? 1 : 0.78);
      if (ghost === 0) {
        ctx.strokeStyle = MINT;
        ctx.lineWidth = 0.7;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(x, y, 25 + (reducedMotion ? 0 : Math.sin(time * 1.2) * 2), 0, TAU);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawBossDemo(game, time, reducedMotion) {
    const echo = game.echoes[0];
    const color = BOSS_COLORS[game.boss.stage] || LILAC;
    // Keep the imported recording intact. Preview time belongs to the view;
    // game.time, scores, health, paths, and the player's location stay untouched.
    const previewTime = echo.startTime + RULES.bossStageWarning + time * 0.7;
    this._drawEchoPath(echo, echo.startTime, echo.startTime + RULES.loopDuration, 0.13, false, color);
    this._drawEcho(echo, previewTime, reducedMotion, game.boss, true);
    this._drawPlayer(game.player, time, reducedMotion);
  }

  _drawEffects(dt, reducedMotion, demo) {
    const ctx = this.ctx;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const effect of this._effects) {
      if (!effect.active) continue;
      effect.age += dt;
      if (effect.age >= effect.life) { effect.active = false; continue; }
      if (demo) continue;
      const progress = effect.age / effect.life;
      const fade = 1 - progress;
      ctx.fillStyle = effect.color;
      ctx.strokeStyle = effect.color;
      ctx.globalAlpha = fade * (reducedMotion ? 0.65 : 1);
      if (effect.kind === 'text') {
        ctx.font = `600 ${effect.size}px ui-monospace, SFMono-Regular, Consolas, monospace`;
        ctx.fillText(effect.label, effect.x, effect.y - (reducedMotion ? 0 : progress * 28));
      } else if (effect.kind === 'ring') {
        ctx.globalAlpha *= 0.5;
        ctx.lineWidth = 1.25 * fade + 0.3;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, reducedMotion ? 18 : 8 + progress * effect.size, 0, TAU);
        ctx.stroke();
      } else if (!reducedMotion) {
        const travel = effect.age * (1 - progress * 0.3);
        const x = effect.x + effect.vx * travel;
        const y = effect.y + effect.vy * travel;
        ctx.beginPath();
        ctx.arc(x, y, effect.size * fade, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}
