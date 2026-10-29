/** Echo Rush: a separate deterministic ruleset; Classic/Boss replays stay intact. */
export const RUSH_RULES = Object.freeze({
  width: 800, height: 560, minX: 24, maxX: 776, minY: 64, maxY: 516,
  tickRate: 60, duration: 36, moveSpeed: 180, dashSpeed: 1250, dashDuration: 0.2,
  dashDistance: 250, missCooldown: 0.8, playerRadius: 11, targetRadius: 20,
  invulnerability: 1, focusMax: 1.2, focusScale: 0.24, focusRegen: 0.45,
  traceDelay: 1, relayDelay: 0.32, burstRadius: 88, maxTargets: 24, maxTraces: 24,
  choiceTimes: Object.freeze([6, 16]), nemesisTime: 26, nemesisHp: 6,
  nemesisInvulnerability: 0.15, comboWindow: 1.6,
});

export const RUSH_UPGRADES = Object.freeze({
  relay: Object.freeze({ id: 'relay', en: Object.freeze({ title: 'Relay', description: 'A friendly afterimage repeats your exact dash and attacks again.' }), zh: Object.freeze({ title: '接力', description: '友军残影精确重复你的冲刺路线，再攻击一次。' }) }),
  ricochet: Object.freeze({ id: 'ricochet', en: Object.freeze({ title: 'Ricochet', description: 'Reflect off up to two walls. Your echoes inherit every turn.' }), zh: Object.freeze({ title: '折返', description: '冲刺最多碰墙反弹两次；你的回声也会继承折线。' }) }),
  burst: Object.freeze({ id: 'burst', en: Object.freeze({ title: 'Burst', description: 'Destroyed echoes explode nearby. Group your targets together.' }), zh: Object.freeze({ title: '爆裂', description: '击碎回声会引爆周围目标。试着把敌人聚在一起。' }) }),
  prune: Object.freeze({ id: 'prune', en: Object.freeze({ title: 'Prune', description: 'Each landing erases your oldest trace and its hostile copies.' }), zh: Object.freeze({ title: '剪枝', description: '每次落地，删除最旧的轨迹及它生成的敌人。' }) }),
});

const DT = 1 / RUSH_RULES.tickRate;
const MAX_TICKS = RUSH_RULES.duration * RUSH_RULES.tickRate;
const EPS = 1e-8;
const MAX_REPLAY_SIZE = 700_000;

function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
function seedHash(seed) { let hash = 2166136261; for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619); return hash >>> 0; }
function random(game) { let value = game._rng += 0x6d2b79f5; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; }
function emit(game, type, data = {}) { game.events.push({ type, time: game.time, worldTime: game.worldTime, ...data }); }
function copyPoints(points) { return Object.freeze(points.map((point) => Object.freeze({ x: point.x, y: point.y, t: point.t }))); }
function lerp(a, b, fraction) { return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction }; }

function positionOnPath(points, elapsed) {
  if (elapsed <= 0 || points.length === 1) return { x: points[0].x, y: points[0].y };
  for (let index = 1; index < points.length; index += 1) {
    if (elapsed <= points[index].t + EPS) {
      const a = points[index - 1], b = points[index];
      return lerp(a, b, clamp((elapsed - a.t) / Math.max(EPS, b.t - a.t), 0, 1));
    }
  }
  const end = points[points.length - 1];
  return { x: end.x, y: end.y };
}

function pathSegments(points, fromTime, toTime) {
  const result = [];
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1], b = points[index];
    const start = Math.max(fromTime, a.t), end = Math.min(toTime, b.t);
    if (end <= start + EPS) continue;
    const duration = Math.max(EPS, b.t - a.t);
    result.push({ from: lerp(a, b, (start - a.t) / duration), to: lerp(a, b, (end - a.t) / duration), start, end });
  }
  return result;
}

/** Exact aim geometry shared with the renderer; t is world seconds into dash. */
export function previewDash(game, aimX, aimY) {
  const p = game.player;
  let dx = Number.isFinite(aimX) ? aimX - p.x : p.dirX;
  let dy = Number.isFinite(aimY) ? aimY - p.y : p.dirY;
  const length = Math.hypot(dx, dy);
  if (length > EPS) { dx /= length; dy /= length; } else { dx = p.dirX; dy = p.dirY; }
  let x = p.x, y = p.y, time = 0, bounces = 0;
  const points = [{ x, y, t: 0 }];
  const canBounce = game.upgrades.includes('ricochet');
  for (let guard = 0; guard < 5 && time < RUSH_RULES.dashDuration - EPS; guard += 1) {
    const tx = Math.abs(dx) < EPS ? Infinity : (dx > 0 ? RUSH_RULES.maxX - x : RUSH_RULES.minX - x) / (dx * RUSH_RULES.dashSpeed);
    const ty = Math.abs(dy) < EPS ? Infinity : (dy > 0 ? RUSH_RULES.maxY - y : RUSH_RULES.minY - y) / (dy * RUSH_RULES.dashSpeed);
    const wall = Math.max(0, Math.min(tx, ty));
    const remaining = RUSH_RULES.dashDuration - time;
    const duration = Math.min(wall, remaining);
    x = clamp(x + dx * RUSH_RULES.dashSpeed * duration, RUSH_RULES.minX, RUSH_RULES.maxX);
    y = clamp(y + dy * RUSH_RULES.dashSpeed * duration, RUSH_RULES.minY, RUSH_RULES.maxY);
    time += duration;
    if (duration > EPS) points.push({ x, y, t: time });
    if (wall >= remaining - EPS || !canBounce || bounces >= 2) break;
    if (Math.abs(tx - wall) < EPS) dx = -dx;
    if (Math.abs(ty - wall) < EPS) dy = -dy;
    bounces += 1;
  }
  return points;
}

function spawnTarget(game, path = null, sourceTraceId = null, warning = 0, kind = 'echo', x = 0, y = 0) {
  if (game.targets.length >= RUSH_RULES.maxTargets) {
    const oldest = game.targets.findIndex((target) => target.kind !== 'nemesis');
    if (oldest >= 0) game.targets.splice(oldest, 1); else return null;
  }
  const start = path?.[0] || { x, y };
  const target = {
    id: `target-${++game._targetId}`, kind, x: start.x, y: start.y,
    radius: kind === 'nemesis' ? 28 : RUSH_RULES.targetRadius,
    hp: kind === 'nemesis' ? RUSH_RULES.nemesisHp : 1,
    maxHp: kind === 'nemesis' ? RUSH_RULES.nemesisHp : 1,
    path, sourceTraceId, bornAt: game.worldTime,
    warningUntil: game.worldTime + warning, invulnerableUntil: 0,
    motionDuration: path ? Math.max(0.6, path[path.length - 1].t * (kind === 'nemesis' ? 8 : 5)) : 0,
    alive: true, phase: random(game) * 0.2,
  };
  game.targets.push(target);
  return target;
}

export function createRush(seed = 'echo-rush') {
  if (typeof seed !== 'string' || !seed.length || seed.length > 128) throw new TypeError('Rush seed must contain 1–128 characters.');
  const game = {
    version: 1, kind: 'rush', mode: 'rush', seed, duration: 36, time: 0, timeTicks: 0, worldTime: 0, phase: 'playing',
    player: { x: 400, y: 290, hp: 3, radius: 11, dashTime: 0, dashCooldown: 0, angle: 0, dirX: 1, dirY: 0, invulnerable: 0 },
    aim: { x: 650, y: 290 }, aiming: false, targets: [], traces: [], relays: [], offers: [], upgrades: [], nemesis: null,
    focus: 1.2, score: 0, combo: 0, bestCombo: 0, comboUntil: 0, lights: [], echoes: [], events: [],
    history: [{ x: 400, y: 290 }], inputs: [], choices: [],
    stats: { kills: 0, dashes: 0, hits: 0, damageTaken: 0, distance: 0, lightsCollected: 0, echoesShattered: 0, relayHits: 0, burstHits: 0, ricochets: 0, pruned: 0, nemesisHits: 0 },
    _rng: seedHash(seed), _targetId: 0, _traceId: 0, _relayId: 0, _accumulator: 0, _fireQueued: false, _fireAim: null,
    _dash: null, _choiceIndex: 0, _nextWaveTick: 180,
  };
  for (let index = 0; index < 3; index += 1) {
    const angle = index * Math.PI * 2 / 3 + (random(game) - 0.5) * 0.14;
    const distance = 160 + random(game) * 20;
    spawnTarget(game, null, null, 0, 'echo', 400 + Math.cos(angle) * distance, 290 + Math.sin(angle) * distance);
  }
  return game;
}

function normalizeInput(game, input = {}) {
  let moveX = Number.isFinite(input.moveX) ? clamp(input.moveX, -1, 1) : 0;
  let moveY = Number.isFinite(input.moveY) ? clamp(input.moveY, -1, 1) : 0;
  moveX = Math.round(moveX * 1e6) / 1e6; moveY = Math.round(moveY * 1e6) / 1e6;
  const length = Math.hypot(moveX, moveY);
  if (length > 1) { moveX /= length; moveY /= length; }
  return {
    aimX: Math.round(clamp(Number.isFinite(input.aimX) ? input.aimX : game.aim.x, -800, 1600) * 1000) / 1000,
    aimY: Math.round(clamp(Number.isFinite(input.aimY) ? input.aimY : game.aim.y, -560, 1120) * 1000) / 1000,
    aiming: Boolean(input.aiming), fire: Boolean(input.fire), moveX, moveY,
  };
}

function validateInput(input) {
  if (!input || !Number.isFinite(input.aimX) || input.aimX < -800 || input.aimX > 1600
    || !Number.isFinite(input.aimY) || input.aimY < -560 || input.aimY > 1120
    || !Number.isFinite(input.moveX) || !Number.isFinite(input.moveY) || Math.hypot(input.moveX, input.moveY) > 1 + EPS
    || typeof input.aiming !== 'boolean' || typeof input.fire !== 'boolean') throw new TypeError('Invalid Rush replay input.');
}

function recordInput(game, input) {
  const previous = game.inputs[game.inputs.length - 1];
  if (previous && ['aimX', 'aimY', 'aiming', 'fire', 'moveX', 'moveY'].every((key) => previous[key] === input[key])) previous.frames += 1;
  else game.inputs.push({ ...input, frames: 1 });
}

function sweptHit(a0, a1, b0, b1, radius) {
  const x = a0.x - b0.x, y = a0.y - b0.y;
  const dx = a1.x - a0.x - b1.x + b0.x, dy = a1.y - a0.y - b1.y + b0.y;
  const length = dx * dx + dy * dy;
  const fraction = length > EPS ? clamp(-(x * dx + y * dy) / length, 0, 1) : 0;
  return (x + dx * fraction) ** 2 + (y + dy * fraction) ** 2 <= radius ** 2;
}

function targetActive(game, target) { return target.alive && game.worldTime + EPS >= target.warningUntil; }

function damageTarget(game, target, attack, source, canBurst = true) {
  if (!targetActive(game, target) || attack.hitIds.has(target.id) || target.invulnerableUntil > game.worldTime + EPS) return false;
  attack.hitIds.add(target.id); attack.hit = true;
  target.hp = Math.max(0, target.hp - 1);
  if (attack.owner === 'player') game.player.dashCooldown = 0;
  game.stats.hits += 1;
  if (source === 'relay') game.stats.relayHits += 1;
  if (source === 'burst') game.stats.burstHits += 1;
  game.combo = game.comboUntil + EPS >= game.worldTime ? game.combo + 1 : 1;
  game.bestCombo = Math.max(game.bestCombo, game.combo);
  game.comboUntil = game.worldTime + RUSH_RULES.comboWindow;
  const nemesis = target.kind === 'nemesis';
  const points = (nemesis ? 50 : 25) + 5 * Math.min(game.combo - 1, 19);
  game.score += points;
  if (nemesis) { target.invulnerableUntil = game.worldTime + RUSH_RULES.nemesisInvulnerability; game.stats.nemesisHits += 1; }
  if (target.hp === 0) { target.alive = false; game.stats.kills += 1; game.stats.echoesShattered += 1; }
  emit(game, 'shatter', { id: target.id, x: target.x, y: target.y, points, combo: game.combo, hp: target.hp, maxHp: target.maxHp, source, nemesis, reason: nemesis ? 'nemesis-hit' : 'echo-hit' });
  if (nemesis && target.hp === 0) {
    game.phase = 'won';
    game.score += 100 + game.player.hp * 50;
    emit(game, 'won', { x: target.x, y: target.y, score: game.score, points: 100 + game.player.hp * 50, reason: 'nemesis-defeated' });
    return true;
  }
  if (!nemesis && target.hp === 0 && canBurst && game.upgrades.includes('burst')) {
    emit(game, 'burst', { x: target.x, y: target.y, radius: RUSH_RULES.burstRadius, points: 0 });
    for (const nearby of game.targets) {
      if (nearby.alive && Math.hypot(nearby.x - target.x, nearby.y - target.y) <= RUSH_RULES.burstRadius + nearby.radius) damageTarget(game, nearby, attack, 'burst', false);
    }
  }
  return true;
}

function beginDash(game, startAt) {
  const points = previewDash(game, game.aim.x, game.aim.y);
  const duration = points[points.length - 1].t;
  game._dash = { points, startAt, duration, recorded: [{ x: game.player.x, y: game.player.y, t: 0 }], hitIds: new Set(), hit: false, owner: 'player' };
  game.player.dashTime = duration;
  game.player.dashCooldown = RUSH_RULES.missCooldown;
  game.stats.dashes += 1;
  emit(game, 'dash', { x: game.player.x, y: game.player.y, points: 0 });
}

function finishDash(game) {
  const dash = game._dash;
  const points = copyPoints(dash.recorded);
  if (points.length > 1 && dash.duration > EPS) {
    const trace = { id: `trace-${++game._traceId}`, points, bornAt: game.worldTime, duration: dash.duration };
    game.traces.push(trace);
    if (game.traces.length > RUSH_RULES.maxTraces) game.traces.shift();
    const enemy = spawnTarget(game, points, trace.id, RUSH_RULES.traceDelay);
    if (enemy) emit(game, 'echo', { id: enemy.id, x: enemy.x, y: enemy.y, sourceTraceId: trace.id, points: 0 });
    if (game.upgrades.includes('relay')) {
      const relayPoints = copyPoints(points);
      const relay = { id: `relay-${++game._relayId}`, points: relayPoints, sourceTraceId: trace.id,
        startAt: game.worldTime + RUSH_RULES.relayDelay, bornAt: game.worldTime, duration: dash.duration,
        progress: 0, x: relayPoints[0].x, y: relayPoints[0].y, attack: { owner: 'relay', hitIds: new Set(), hit: false } };
      game.relays.push(relay);
      emit(game, 'relay-start', { x: relay.x, y: relay.y, points: 0 });
    }
    if (game.upgrades.includes('prune')) {
      const oldest = game.traces.shift();
      if (oldest) {
        game.targets = game.targets.filter((target) => target.kind === 'nemesis' || target.sourceTraceId !== oldest.id);
        game.stats.pruned += 1;
        emit(game, 'prune', { x: game.player.x, y: game.player.y, sourceTraceId: oldest.id, points: 0 });
      }
    }
  }
  if (!dash.hit) { game.combo = 0; game.comboUntil = 0; }
  game._dash = null;
  game.player.dashTime = 0;
}

function updateTargets(game) {
  for (const target of game.targets) {
    target._previous = { x: target.x, y: target.y };
    if (!target.path || game.worldTime < target.warningUntil) continue;
    const elapsed = Math.max(0, game.worldTime - target.warningUntil);
    const period = target.motionDuration * 2;
    const cycleTime = elapsed % period;
    const progress = cycleTime <= target.motionDuration ? cycleTime / target.motionDuration : 2 - cycleTime / target.motionDuration;
    const position = positionOnPath(target.path, progress * target.path[target.path.length - 1].t);
    target.x = position.x; target.y = position.y;
  }
}

function movePlayer(game, input, frameStart) {
  const player = game.player;
  const segments = [];
  let walkingStart = frameStart;
  if (game._dash) {
    const dash = game._dash;
    const from = Math.max(0, frameStart - dash.startAt);
    const elapsed = game.worldTime - dash.startAt;
    const to = elapsed >= dash.duration - EPS ? dash.duration : Math.min(dash.duration, elapsed);
    for (const segment of pathSegments(dash.points, from, to)) {
      segments.push({ ...segment, start: dash.startAt + segment.start, end: dash.startAt + segment.end, attack: dash });
      player.x = segment.to.x; player.y = segment.to.y;
      dash.recorded.push({ x: player.x, y: player.y, t: segment.end });
      game.stats.distance += Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);
    }
    for (const corner of dash.points.slice(1, -1)) if (corner.t > from + EPS && corner.t <= to + EPS) {
      game.stats.ricochets += 1;
      emit(game, 'ricochet', { x: corner.x, y: corner.y, points: 0 });
    }
    player.dashTime = Math.max(0, dash.duration - (game.worldTime - dash.startAt));
    walkingStart = Math.max(frameStart, dash.startAt + dash.duration);
  }
  if (walkingStart < game.worldTime - EPS) {
    const from = { x: player.x, y: player.y };
    const seconds = game.worldTime - walkingStart;
    player.x = clamp(player.x + input.moveX * RUSH_RULES.moveSpeed * seconds, RUSH_RULES.minX, RUSH_RULES.maxX);
    player.y = clamp(player.y + input.moveY * RUSH_RULES.moveSpeed * seconds, RUSH_RULES.minY, RUSH_RULES.maxY);
    const to = { x: player.x, y: player.y };
    game.stats.distance += Math.hypot(to.x - from.x, to.y - from.y);
    segments.push({ from, to, start: walkingStart, end: game.worldTime, attack: null });
  }
  // A zero-length wall dash still needs a contact check and a landing.
  if (!segments.length) segments.push({ from: { x: player.x, y: player.y }, to: { x: player.x, y: player.y }, start: frameStart, end: game.worldTime, attack: game._dash });
  return segments;
}

function collideSegments(game, segments, frameStart, worldDt, relay = false) {
  for (const segment of segments) {
    for (const target of game.targets) {
      if (!targetActive(game, target)) continue;
      const before = target._previous || target;
      const targetStart = lerp(before, target, clamp((segment.start - frameStart) / worldDt, 0, 1));
      const targetEnd = lerp(before, target, clamp((segment.end - frameStart) / worldDt, 0, 1));
      if (!sweptHit(segment.from, segment.to, targetStart, targetEnd, game.player.radius + target.radius)) continue;
      if (segment.attack) damageTarget(game, target, segment.attack, relay ? 'relay' : 'dash');
      else if (!relay && game.player.invulnerable <= EPS) {
        game.player.hp = Math.max(0, game.player.hp - 1);
        game.player.invulnerable = RUSH_RULES.invulnerability;
        game.stats.damageTaken += 1; game.combo = 0; game.comboUntil = 0;
        emit(game, 'damage', { x: game.player.x, y: game.player.y, hp: game.player.hp, points: 0 });
        if (game.player.hp === 0) { game.phase = 'lost'; emit(game, 'lost', { x: game.player.x, y: game.player.y, reason: 'collision', score: game.score, points: 0 }); }
      }
      if (game.phase !== 'playing') return;
    }
  }
}

function updateRelays(game, frameStart, worldDt) {
  for (const relay of game.relays) {
    if (game.worldTime < relay.startAt) continue;
    const from = Math.max(0, frameStart - relay.startAt), to = Math.min(relay.duration, game.worldTime - relay.startAt);
    const segments = pathSegments(relay.points, from, to).map((segment) => ({ ...segment, start: relay.startAt + segment.start, end: relay.startAt + segment.end, attack: relay.attack }));
    collideSegments(game, segments, frameStart, worldDt, true);
    relay.progress = clamp(to / relay.duration, 0, 1);
    const position = positionOnPath(relay.points, to); relay.x = position.x; relay.y = position.y;
    if (game.phase !== 'playing') break;
  }
  game.relays = game.relays.filter((relay) => game.worldTime < relay.startAt + relay.duration - EPS);
}

function spawnWave(game) {
  if (!game.traces.length) return;
  const count = game.time >= 16 ? 3 : 2;
  for (let index = 0; index < count; index += 1) {
    const trace = game.traces[Math.floor(random(game) * game.traces.length)];
    spawnTarget(game, trace.points, trace.id, 0.55);
  }
  emit(game, 'phase', { x: game.player.x, y: game.player.y, reason: 'wave', points: 0 });
}

function spawnNemesis(game) {
  const trace = game.traces[game.traces.length - 1];
  const fallback = copyPoints([{ x: 450, y: 180, t: 0 }, { x: 580, y: 370, t: 0.2 }]);
  game.nemesis = spawnTarget(game, trace?.points || fallback, trace?.id || null, 0.45, 'nemesis');
  emit(game, 'boss', { x: game.nemesis.x, y: game.nemesis.y, hp: game.nemesis.hp, maxHp: game.nemesis.maxHp, points: 0, reason: 'nemesis-arrived' });
}

function advanceTick(game, input) {
  recordInput(game, input);
  game.timeTicks += 1; game.time = game.timeTicks * DT;
  game.aim = { x: input.aimX, y: input.aimY };
  game.aiming = input.aiming;
  const aimLength = Math.hypot(input.aimX - game.player.x, input.aimY - game.player.y);
  if (aimLength > EPS) {
    game.player.dirX = (input.aimX - game.player.x) / aimLength;
    game.player.dirY = (input.aimY - game.player.y) / aimLength;
    game.player.angle = Math.atan2(game.player.dirY, game.player.dirX);
  }
  const slow = input.aiming && !input.fire && !game._dash && game.focus > EPS;
  const slowSeconds = slow ? Math.min(DT, game.focus) : 0;
  const worldDt = slowSeconds * RUSH_RULES.focusScale + (DT - slowSeconds);
  if (slow) game.focus = Math.max(0, game.focus - DT);
  else if (!input.aiming) game.focus = Math.min(RUSH_RULES.focusMax, game.focus + DT * RUSH_RULES.focusRegen);
  const frameStart = game.worldTime;
  game.worldTime += worldDt;
  game.player.dashCooldown = Math.max(0, game.player.dashCooldown - worldDt);
  game.player.invulnerable = Math.max(0, game.player.invulnerable - worldDt);
  if (game.worldTime > game.comboUntil + EPS) game.combo = 0;
  if (input.fire && !game._dash && game.player.dashCooldown <= EPS) beginDash(game, frameStart);
  if (game.timeTicks === RUSH_RULES.nemesisTime * 60) spawnNemesis(game);
  if (game.timeTicks === game._nextWaveTick) { spawnWave(game); game._nextWaveTick += 180; }
  updateTargets(game);
  const segments = movePlayer(game, input, frameStart);
  collideSegments(game, segments, frameStart, worldDt);
  if (game._dash && game.player.dashTime <= EPS) finishDash(game);
  if (game.phase === 'playing') updateRelays(game, frameStart, worldDt);
  game.targets = game.targets.filter((target) => target.alive);
  game.history.push({ x: game.player.x, y: game.player.y });
  if (game.phase !== 'playing') return;
  if (game.timeTicks === MAX_TICKS) {
    game.phase = 'lost';
    emit(game, 'lost', { x: game.player.x, y: game.player.y, reason: 'timeout', score: game.score, points: 0 });
  } else if (game.timeTicks === RUSH_RULES.choiceTimes[game._choiceIndex] * 60) {
    game.phase = 'choosing';
    game.offers = ['relay', 'ricochet', 'burst'].filter((id) => !game.upgrades.includes(id));
    if (game._choiceIndex === 1) game.offers.push('prune');
    game._choiceIndex += 1;
    game._fireQueued = false; game._fireAim = null; game._accumulator = 0;
    emit(game, 'choice', { x: game.player.x, y: game.player.y, offers: [...game.offers], points: 0 });
  }
}

export function chooseRushUpgrade(game, id) {
  if (game.phase !== 'choosing' || !game.offers.includes(id)) return false;
  game.upgrades.push(id); game.choices.push({ tick: game.timeTicks, id });
  game.offers = []; game.phase = 'playing'; game._fireQueued = false; game._fireAim = null;
  emit(game, 'upgrade', { x: game.player.x, y: game.player.y, id, points: 0 });
  return true;
}

/** fire is already a press/release pulse; no held-key edge detection is applied. */
export function stepRush(game, input = {}, dt = DT) {
  game.events.length = 0;
  if (game.phase !== 'playing') return game;
  if (!Number.isFinite(dt) || dt < 0) throw new TypeError('Rush frame time must be finite and non-negative.');
  const normalized = normalizeInput(game, input);
  if (normalized.fire) { game._fireQueued = true; game._fireAim = { aimX: normalized.aimX, aimY: normalized.aimY }; }
  game._accumulator += Math.min(dt, 0.25);
  while (game._accumulator + EPS >= DT && game.phase === 'playing') {
    const fire = game._fireQueued, aim = fire ? game._fireAim : null; game._fireQueued = false; game._fireAim = null;
    advanceTick(game, { ...normalized, ...aim, fire });
    game._accumulator = Math.max(0, game._accumulator - DT);
  }
  return game;
}

export function clearRushInput(game) { game._fireQueued = false; game._fireAim = null; game.aiming = false; return game; }

/** Advance exactly one recorded tick; apply its choice before the next tick. */
export function stepRushReplay(game, input) {
  game.events.length = 0;
  if (game.phase === 'choosing') throw new Error('Apply the recorded Rush choice before advancing.');
  if (game.phase !== 'playing') return game;
  validateInput(input); advanceTick(game, { aimX: input.aimX, aimY: input.aimY, aiming: input.aiming, fire: input.fire, moveX: input.moveX, moveY: input.moveY });
  return game;
}

export function exportRushReplay(game) {
  return { version: 1, kind: 'rush', seed: game.seed, ticks: game.timeTicks,
    inputs: game.inputs.map((input) => ({ ...input })), choices: game.choices.map((choice) => ({ ...choice })),
    result: { phase: game.phase, score: game.score, hp: game.player.hp, kills: game.stats.kills, nemesisHp: game.nemesis?.hp ?? null } };
}

export function runRushReplay(replay) {
  if (typeof replay === 'string') {
    if (replay.length > MAX_REPLAY_SIZE) throw new RangeError('Rush replay is too large.');
    replay = JSON.parse(replay);
  }
  if (!replay || replay.kind !== 'rush' || replay.version !== 1 || !Array.isArray(replay.inputs)
    || replay.inputs.length > MAX_TICKS || !Array.isArray(replay.choices) || replay.choices.length > 2) throw new TypeError('Invalid Rush replay.');
  if (typeof replay.seed !== 'string' || !replay.seed.length || replay.seed.length > 128) throw new TypeError('Invalid Rush replay seed.');
  if (JSON.stringify(replay).length > MAX_REPLAY_SIZE) throw new RangeError('Rush replay is too large.');
  if (!Number.isInteger(replay.ticks) || replay.ticks < 0 || replay.ticks > MAX_TICKS) throw new RangeError('Invalid Rush replay duration.');
  let total = 0;
  for (const input of replay.inputs) {
    validateInput(input);
    if (!Number.isInteger(input.frames) || input.frames < 1 || input.frames > MAX_TICKS) throw new RangeError('Invalid Rush replay frame count.');
    total += input.frames;
    if (total > MAX_TICKS) throw new RangeError('Rush replay exceeds 36 seconds.');
  }
  if (total !== replay.ticks) throw new RangeError('Rush replay tick count mismatch.');
  for (let index = 0; index < replay.choices.length; index += 1) {
    const choice = replay.choices[index];
    if (!choice || choice.tick !== RUSH_RULES.choiceTimes[index] * 60 || choice.tick > replay.ticks || !Object.hasOwn(RUSH_UPGRADES, choice.id)) throw new TypeError('Invalid Rush replay choice.');
  }
  const game = createRush(replay.seed);
  let choiceIndex = 0;
  function applyChoice() {
    const choice = replay.choices[choiceIndex];
    if (choice && choice.tick === game.timeTicks) {
      if (!chooseRushUpgrade(game, choice.id)) throw new Error('Rush replay choice is not offered.');
      choiceIndex += 1;
    }
  }
  for (const input of replay.inputs) for (let frame = 0; frame < input.frames; frame += 1) {
    applyChoice();
    if (game.phase !== 'playing') throw new Error('Rush replay continues after the run stopped.');
    stepRushReplay(game, input);
  }
  applyChoice();
  if (choiceIndex !== replay.choices.length) throw new Error('Unused Rush replay choices.');
  return game;
}
