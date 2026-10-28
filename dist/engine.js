/** AFTER YOU — deterministic, DOM-free simulation. All times are seconds. */
import { validateBoss } from './boss-codec.js';

export const RULES = Object.freeze({
  width: 800,
  height: 560,
  tickRate: 60,
  duration: 60,
  loopDuration: 10,
  minX: 24,
  maxX: 776,
  minY: 64,
  maxY: 516,
  speed: 240,
  dashSpeed: 800,
  dashDuration: 0.18,
  dashCooldown: 2.4,
  invulnerability: 1.25,
  shatterDuration: 2,
  warningDuration: 0.7,
  comboWindow: 4,
  maxCombo: 5,
  playerRadius: 11,
  echoRadius: 13,
  lightRadius: 7,
  bossDuration: 30,
  bossStageWarning: 0.9,
  bossLightCooldown: 0.35,
});

const TICK = 1 / RULES.tickRate;
const TOTAL_TICKS = RULES.duration * RULES.tickRate;
const LOOP_TICKS = RULES.loopDuration * RULES.tickRate;
const MAX_SEED_LENGTH = 128;
const MAX_REPLAY_BYTES = 512_000;
const EPSILON = 1e-8;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function validateSeed(seed) {
  if (typeof seed !== 'string' || seed.length === 0 || seed.length > MAX_SEED_LENGTH) {
    throw new TypeError('Seed must contain 1–128 characters.');
  }
  return seed;
}

function randomFromSeed(seed) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 16777619);
  }
  return () => {
    hash += 0x6d2b79f5;
    let result = hash;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function lightSchedule(seed, duration) {
  const random = randomFromSeed(seed);
  const schedule = [];
  // These times and positions never depend on player movement or collection.
  for (let tick = 48; tick < duration * RULES.tickRate; tick += 84) {
    schedule.push({
      id: `light-${schedule.length}`,
      x: 54 + random() * 692,
      y: 94 + random() * 392,
      radius: RULES.lightRadius,
      spawnTick: tick,
      spawnTime: tick * TICK,
      expiresAt: (tick + 480) * TICK,
    });
  }
  return schedule;
}

/** Daily challenge IDs use UTC so players in different time zones share a board. */
export function seedFromDate(date = new Date()) {
  const parsed = date instanceof Date ? date : new Date(date);
  if (!Number.isFinite(parsed.getTime())) throw new TypeError('Invalid daily challenge date.');
  return `after-you-${parsed.toISOString().slice(0, 10)}`;
}

export function createGame(seed = 'after-you', { boss } = {}) {
  validateSeed(seed);
  const bossConfig = boss ? validateBoss(boss) : null;
  if (bossConfig) seed = bossConfig.seed;
  const duration = bossConfig ? RULES.bossDuration : RULES.duration;
  const game = {
    version: 1,
    seed,
    mode: bossConfig ? 'boss' : 'classic',
    duration,
    boss: bossConfig ? { stage: 0, hp: 3, totalStages: 3, maxHp: 3, defeated: false } : null,
    time: 0,
    timeTicks: 0,
    phase: 'playing',
    segment: 0,
    player: {
      x: 400, y: 290, hp: 3, radius: RULES.playerRadius,
      angle: -Math.PI / 2, dirX: 0, dirY: -1,
      dashX: 0, dashY: -1, dashTime: 0, dashCooldown: 0, invulnerable: 0,
    },
    echoes: [],
    lights: [],
    score: 0,
    combo: 1,
    bestCombo: 1,
    comboUntil: 0,
    events: [],
    stats: {
      lightsCollected: 0,
      echoesShattered: 0,
      rewardedShatters: 0,
      damageTaken: 0,
      dashes: 0,
      distance: 0,
      survivalBonus: 0,
      bossHits: 0,
    },
    lightSchedule: lightSchedule(seed, duration),
    history: [{ x: 400, y: 290 }],
    recording: [{ x: 400, y: 290 }],
    segmentLights: 0,
    inputs: [],
    _nextLight: 0,
    _accumulator: 0,
    _dashHeld: false,
    _dashQueued: false,
    _bossConfig: bossConfig,
  };
  if (bossConfig) game.echoes.push(createBossEcho(game));
  return game;
}

function createBossEcho(game) {
  const samples = game._bossConfig.paths[game.boss.stage];
  const path = Array.from({ length: LOOP_TICKS + 1 }, (_, frame) => {
    const sample = frame * (samples.length - 1) / LOOP_TICKS;
    const index = Math.floor(sample);
    return interpolate(samples[index], samples[Math.min(index + 1, samples.length - 1)], sample - index);
  });
  return {
    id: `boss-${game.boss.stage + 1}`, boss: true, path, startTime: game.time,
    radius: RULES.echoRadius, lightCount: 0, lastScoredCycle: -1,
    warningUntil: game.time + RULES.bossStageWarning, disabledUntil: 0,
    state: 'warning', warning: true,
  };
}

function hitBoss(game, echo) {
  game.boss.hp -= 1;
  game.stats.bossHits += 1;
  game.stats.echoesShattered += 1;
  game.stats.rewardedShatters += 1;
  game.score += 100;
  emit(game, 'shatter', { id: echo.id, ...getEchoPosition(echo, game.time), points: 100,
    hp: game.boss.hp, stage: game.boss.stage, reason: 'boss-hit' });
  if (game.boss.hp > 0) return;
  if (game.boss.stage + 1 === game.boss.totalStages) {
    game.boss.defeated = true;
    game.phase = 'won';
    game.stats.survivalBonus = 150 + 50 * game.player.hp;
    game.score += game.stats.survivalBonus;
    emit(game, 'won', { score: game.score, bonus: game.stats.survivalBonus, reason: 'boss-defeated' });
  } else {
    game.boss.stage += 1;
    game.boss.hp = game.boss.maxHp;
    game.segment = game.boss.stage;
    const next = createBossEcho(game);
    game.echoes = [next];
    emit(game, 'boss-stage', { stage: game.boss.stage, hp: game.boss.hp,
      ...getEchoPosition(next, game.time), reason: 'stage-cleared' });
  }
}

function pointAt(echo, localTime) {
  const frame = clamp(localTime * RULES.tickRate, 0, echo.path.length - 1);
  const index = Math.min(Math.floor(frame + EPSILON), echo.path.length - 1);
  const next = echo.path[Math.min(index + 1, echo.path.length - 1)];
  const point = echo.path[index];
  const mix = Math.max(0, frame - index);
  return { x: point.x + (next.x - point.x) * mix, y: point.y + (next.y - point.y) * mix };
}

/** Pure interpolation of an actual recorded path; echoes never seek the player. */
export function getEchoPosition(echo, time) {
  const elapsed = Math.max(0, time - echo.startTime);
  const cycle = Math.floor((elapsed + EPSILON) / RULES.loopDuration);
  const localTime = Math.max(0, elapsed - cycle * RULES.loopDuration);
  return pointAt(echo, localTime);
}

export function getEchoState(echo, time) {
  if (time < echo.warningUntil - EPSILON) return 'warning';
  if (time < echo.disabledUntil - EPSILON) {
    return time >= echo.disabledUntil - RULES.warningDuration - EPSILON ? 'warning' : 'dormant';
  }
  return 'active';
}

function normalizeInput(input = {}) {
  let x = Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0;
  let y = Number.isFinite(input.y) ? clamp(input.y, -1, 1) : 0;
  // Quantization is part of the simulation contract, not just replay compression.
  x = Math.round(x * 1e6) / 1e6;
  y = Math.round(y * 1e6) / 1e6;
  const length = Math.hypot(x, y);
  if (length > 1) { x /= length; y /= length; }
  return { x, y, dash: Boolean(input.dash) };
}

function validateRecordedInput(input) {
  if (!input || !Number.isFinite(input.x) || !Number.isFinite(input.y) || Math.hypot(input.x, input.y) > 1 + EPSILON || typeof input.dash !== 'boolean') {
    throw new TypeError('Invalid replay input.');
  }
}

function recordInput(game, input) {
  const last = game.inputs[game.inputs.length - 1];
  if (last && last.x === input.x && last.y === input.y && last.dash === input.dash) {
    last.frames += 1;
  } else {
    game.inputs.push({ x: input.x, y: input.y, dash: input.dash, frames: 1 });
  }
}

function emit(game, type, data = {}) {
  game.events.push({ type, time: game.time, ...data });
}

function movePlayer(game, input) {
  const player = game.player;
  player.dashCooldown = Math.max(0, player.dashCooldown - TICK);
  player.invulnerable = Math.max(0, player.invulnerable - TICK);
  const inputLength = Math.hypot(input.x, input.y);
  if (inputLength > 0) {
    player.dirX = input.x / inputLength;
    player.dirY = input.y / inputLength;
    player.angle = Math.atan2(player.dirY, player.dirX);
  }
  if (input.dash && player.dashCooldown <= EPSILON) {
    player.dashTime = RULES.dashDuration;
    player.dashCooldown = RULES.dashCooldown;
    player.dashX = player.dirX;
    player.dashY = player.dirY;
    game.stats.dashes += 1;
    emit(game, 'dash', { x: player.x, y: player.y });
  }

  const segments = [];
  function move(seconds, x, y, speed, dashing, start) {
    if (seconds <= EPSILON) return;
    const from = { x: player.x, y: player.y };
    player.x = clamp(player.x + x * speed * seconds, RULES.minX, RULES.maxX);
    player.y = clamp(player.y + y * speed * seconds, RULES.minY, RULES.maxY);
    const to = { x: player.x, y: player.y };
    game.stats.distance += Math.hypot(to.x - from.x, to.y - from.y);
    segments.push({ from, to, dashing, start, end: start + seconds / TICK });
  }
  const dashSeconds = Math.min(TICK, player.dashTime);
  move(dashSeconds, player.dashX, player.dashY, RULES.dashSpeed, true, 0);
  player.dashTime = Math.max(0, player.dashTime - TICK);
  move(TICK - dashSeconds, input.x, input.y, RULES.speed, false, dashSeconds / TICK);
  return segments;
}

function interpolate(from, to, fraction) {
  return { x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction };
}

// Closest point on the relative-motion segment prevents tunneling during dashes.
function sweptHit(a0, a1, b0, b1, radius) {
  const x = a0.x - b0.x;
  const y = a0.y - b0.y;
  const dx = a1.x - a0.x - (b1.x - b0.x);
  const dy = a1.y - a0.y - (b1.y - b0.y);
  const lengthSquared = dx * dx + dy * dy;
  const fraction = lengthSquared > 0 ? clamp(-(x * dx + y * dy) / lengthSquared, 0, 1) : 0;
  return (x + dx * fraction) ** 2 + (y + dy * fraction) ** 2 <= radius ** 2;
}

function echoHitsSegment(echo, segment, frameStart) {
  const start = frameStart + segment.start * TICK;
  const end = frameStart + segment.end * TICK;
  const elapsed = Math.max(0, start - echo.startTime);
  const cycle = Math.floor((elapsed + EPSILON) / RULES.loopDuration);
  const boundary = echo.startTime + (cycle + 1) * RULES.loopDuration;
  const radius = RULES.playerRadius + echo.radius;
  if (end < boundary - EPSILON) {
    return sweptHit(segment.from, segment.to, getEchoPosition(echo, start), getEchoPosition(echo, end), radius);
  }
  // A loop reset teleports the echo. Never sweep a damaging line across the arena.
  const fraction = clamp((boundary - start) / (end - start), 0, 1);
  const crossing = interpolate(segment.from, segment.to, fraction);
  const hitBefore = sweptHit(segment.from, crossing, getEchoPosition(echo, start), pointAt(echo, RULES.loopDuration), radius);
  const hitAfter = sweptHit(crossing, segment.to, pointAt(echo, 0), getEchoPosition(echo, end), radius);
  return hitBefore || hitAfter;
}

function collideEchoes(game, segments, frameStart) {
  for (const segment of segments) {
    for (const echo of game.echoes) {
      if (getEchoState(echo, game.time) !== 'active' || !echoHitsSegment(echo, segment, frameStart)) continue;
      if (segment.dashing) {
        echo.disabledUntil = game.time + RULES.shatterDuration;
        if (echo.boss) {
          hitBoss(game, echo);
          if (game.phase !== 'playing') return;
          continue;
        }
        const cycle = Math.floor((game.time - echo.startTime + EPSILON) / RULES.loopDuration);
        const eligible = echo.lastScoredCycle !== cycle && echo.lightCount > 0;
        const points = eligible ? 50 + 10 * Math.min(echo.lightCount, 8) : 0;
        if (eligible) {
          echo.lastScoredCycle = cycle;
          game.stats.rewardedShatters += 1;
          game.score += points;
        }
        game.stats.echoesShattered += 1;
        emit(game, 'shatter', { id: echo.id, ...getEchoPosition(echo, game.time), points, cycle, reason: 'echo-hit' });
      } else if (game.player.invulnerable <= EPSILON) {
        game.player.hp = Math.max(0, game.player.hp - 1);
        game.player.invulnerable = RULES.invulnerability;
        game.combo = 1;
        game.comboUntil = 0;
        game.stats.damageTaken += 1;
        emit(game, 'damage', { x: game.player.x, y: game.player.y, hp: game.player.hp });
        if (game.player.hp === 0) {
          game.phase = 'lost';
          emit(game, 'lost', { score: game.score, reason: 'collision' });
          return;
        }
      }
    }
  }
}

function collectLights(game, segments) {
  game.lights = game.lights.filter((light) => {
    if (!segments.some((segment) => sweptHit(segment.from, segment.to, light, light, game.player.radius + light.radius))) return true;
    if (game.comboUntil > 0 && game.time <= game.comboUntil + EPSILON) {
      game.combo = Math.min(RULES.maxCombo, game.combo + 1);
    } else {
      game.combo = 1;
    }
    game.comboUntil = game.time + RULES.comboWindow;
    game.bestCombo = Math.max(game.bestCombo, game.combo);
    const points = 10 * game.combo;
    game.score += points;
    game.stats.lightsCollected += 1;
    game.segmentLights += 1;
    const cooldownReduction = game.mode === 'boss' ? Math.min(game.player.dashCooldown, RULES.bossLightCooldown) : 0;
    game.player.dashCooldown -= cooldownReduction;
    emit(game, 'light', { id: light.id, x: light.x, y: light.y, points, combo: game.combo, cooldownReduction });
    return false;
  });
}

function advanceTick(game, input) {
  if (game.phase !== 'playing') return;
  recordInput(game, input);
  const frameStart = game.time;
  game.timeTicks += 1;
  game.time = game.timeTicks * TICK;
  const segments = movePlayer(game, input);
  if (game.time > game.comboUntil + EPSILON) game.combo = 1;
  game.lights = game.lights.filter((light) => game.time < light.expiresAt - EPSILON);
  while (game._nextLight < game.lightSchedule.length && game.lightSchedule[game._nextLight].spawnTick <= game.timeTicks) {
    const light = { ...game.lightSchedule[game._nextLight++] };
    game.lights.push(light);
    emit(game, 'spawn', { id: light.id, x: light.x, y: light.y });
  }
  collideEchoes(game, segments, frameStart);
  if (game.phase === 'playing') collectLights(game, segments);
  game.recording.push({ x: game.player.x, y: game.player.y });
  game.history.push({ x: game.player.x, y: game.player.y });

  if (game.phase === 'playing' && game.timeTicks === game.duration * RULES.tickRate) {
    if (game.mode === 'boss') {
      game.phase = 'lost';
      emit(game, 'lost', { score: game.score, reason: 'timeout' });
    } else {
      game.phase = 'won';
      game.stats.survivalBonus = game.stats.lightsCollected > 0 ? 150 + 50 * game.player.hp : 0;
      game.score += game.stats.survivalBonus;
      emit(game, 'won', { score: game.score, bonus: game.stats.survivalBonus, reason: 'survived' });
    }
  } else if (game.mode === 'classic' && game.phase === 'playing' && game.timeTicks % LOOP_TICKS === 0) {
    const echo = {
      id: `echo-${game.segment + 1}`,
      path: game.recording,
      startTime: game.time,
      radius: RULES.echoRadius,
      lightCount: game.segmentLights,
      lastScoredCycle: -1,
      warningUntil: game.time + RULES.warningDuration,
      disabledUntil: 0,
    };
    game.echoes.push(echo);
    game.segment += 1;
    game.recording = [{ x: game.player.x, y: game.player.y }];
    game.segmentLights = 0;
    emit(game, 'echo', { id: echo.id, lightCount: echo.lightCount, ...getEchoPosition(echo, game.time) });
  }
  for (const echo of game.echoes) {
    echo.state = getEchoState(echo, game.time);
    echo.warning = echo.state === 'warning';
  }
}

/**
 * Advance real elapsed time using 60 Hz simulation ticks. A frame is capped at
 * 250 ms so background tabs cannot fast-forward the game. Dash uses rising edges.
 * Returns the same mutable game object; events are cleared once per call.
 */
export function step(game, input = {}, dt = TICK) {
  game.events.length = 0;
  if (game.phase !== 'playing') return game;
  if (!Number.isFinite(dt) || dt < 0) throw new TypeError('Frame time must be a finite non-negative number.');
  const normalized = normalizeInput(input);
  if (normalized.dash && !game._dashHeld) game._dashQueued = true;
  game._dashHeld = normalized.dash;
  game._accumulator += Math.min(dt, 0.25);
  while (game._accumulator + EPSILON >= TICK && game.phase === 'playing') {
    advanceTick(game, { x: normalized.x, y: normalized.y, dash: game._dashQueued });
    game._dashQueued = false;
    game._accumulator = Math.max(0, game._accumulator - TICK);
  }
  return game;
}

/** Discard live held/queued controls when pausing, without losing elapsed time. */
export function clearInput(game) {
  game._dashHeld = false;
  game._dashQueued = false;
  return game;
}

/**
 * Advance one recorded tick for visual replay. Recorded vectors and dash edges
 * are simulation inputs already: never normalize or detect their edges again.
 * Call once per frame in an RLE entry; this function does not expand `frames`.
 */
export function stepReplay(game, input) {
  game.events.length = 0;
  if (game.phase !== 'playing') return game;
  validateRecordedInput(input);
  advanceTick(game, { x: input.x, y: input.y, dash: input.dash });
  return game;
}

/** A bounded input-only replay. Result metadata is advisory, never trusted. */
export function exportReplay(game) {
  return {
    version: 1,
    seed: game.seed,
    mode: game.mode,
    duration: game.duration,
    boss: game._bossConfig ? validateBoss(game._bossConfig) : null,
    ticks: game.timeTicks,
    inputs: game.inputs.map((input) => ({ ...input })),
    result: { phase: game.phase, score: game.score, hp: game.player.hp, lights: game.stats.lightsCollected },
  };
}

/** Recompute a replay from its seed and inputs. Reject malformed/unbounded data. */
export function runReplay(replay) {
  if (typeof replay === 'string') {
    if (replay.length > MAX_REPLAY_BYTES) throw new RangeError('Replay is too large.');
    replay = JSON.parse(replay);
  }
  if (!replay || replay.version !== 1 || !Array.isArray(replay.inputs) || replay.inputs.length > TOTAL_TICKS) {
    throw new TypeError('Invalid replay format.');
  }
  if (JSON.stringify(replay).length > MAX_REPLAY_BYTES) throw new RangeError('Replay is too large.');
  validateSeed(replay.seed);
  if (!Number.isInteger(replay.ticks) || replay.ticks < 0 || replay.ticks > TOTAL_TICKS) throw new RangeError('Invalid replay duration.');
  let ticks = 0;
  for (const input of replay.inputs) {
    validateRecordedInput(input);
    if (!Number.isInteger(input.frames) || input.frames < 1 || input.frames > TOTAL_TICKS) throw new RangeError('Invalid replay frame count.');
    ticks += input.frames;
    if (ticks > TOTAL_TICKS) throw new RangeError('Replay exceeds 60 seconds.');
  }
  if (ticks !== replay.ticks) throw new RangeError('Replay tick count does not match its inputs.');
  const game = createGame(replay.seed, { boss: replay.boss });
  if (replay.seed !== game.seed || (replay.mode !== undefined && replay.mode !== game.mode)
    || (replay.duration !== undefined && replay.duration !== game.duration)
    || replay.ticks > game.duration * RULES.tickRate) throw new RangeError('Replay rules do not match the challenge.');
  for (const input of replay.inputs) {
    for (let index = 0; index < input.frames; index += 1) {
      if (game.phase !== 'playing') throw new RangeError('Replay continues after the run has ended.');
      stepReplay(game, input);
    }
  }
  return game;
}
