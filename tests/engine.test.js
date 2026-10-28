import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES, createGame, step, stepReplay, clearInput, getEchoPosition, getEchoState, seedFromDate, exportReplay, runReplay } from '../dist/engine.js';

const TICK = 1 / 60;
function frames(game, count, input = {}) {
  for (let i = 0; i < count; i += 1) step(game, typeof input === 'function' ? input(i) : input);
  return game;
}

function stationaryEcho(x = 400, y = 290, lightCount = 2) {
  return {
    id: 'test-echo', path: Array.from({ length: 601 }, () => ({ x, y })),
    startTime: 0, radius: RULES.echoRadius, lightCount, lastScoredCycle: -1,
    warningUntil: 0, disabledUntil: 0,
  };
}

function snapshot(game) {
  return {
    time: game.time, timeTicks: game.timeTicks, phase: game.phase,
    player: game.player, lights: game.lights, echoes: game.echoes,
    score: game.score, combo: game.combo, bestCombo: game.bestCombo,
    stats: game.stats, recording: game.recording, segmentLights: game.segmentLights,
    inputs: game.inputs,
  };
}

test('the same seed and inputs produce exactly the same simulation', () => {
  const a = createGame('deterministic');
  const b = createGame('deterministic');
  const input = (i) => ({ x: Math.cos(i / 80), y: Math.sin(i / 80), dash: i % 160 === 0 });
  frames(a, 2400, input);
  frames(b, 2400, input);
  assert.deepEqual(snapshot(a), snapshot(b));
});

test('a completed run stops at exactly 60 seconds and remains immutable', () => {
  const game = createGame('finish');
  game.player.invulnerable = 61;
  frames(game, 3600);
  assert.equal(game.time, 60);
  assert.equal(game.timeTicks, 3600);
  assert.equal(game.phase, 'won');
  assert.equal(game.echoes.length, 5);
  assert.ok(game.events.some((event) => event.type === 'won'));
  const completed = structuredClone(snapshot(game));
  frames(game, 120, { x: 1, dash: true });
  assert.deepEqual(snapshot(game), completed);
  assert.deepEqual(game.events, []);
});

test('fixed tick accumulator produces identical movement at 30, 60 and 120 fps', () => {
  const games = [createGame('fps'), createGame('fps'), createGame('fps')];
  for (let i = 0; i < 30; i += 1) step(games[0], { x: 0.3, y: -0.2 }, 1 / 30);
  for (let i = 0; i < 60; i += 1) step(games[1], { x: 0.3, y: -0.2 }, 1 / 60);
  for (let i = 0; i < 120; i += 1) step(games[2], { x: 0.3, y: -0.2 }, 1 / 120);
  assert.deepEqual(snapshot(games[0]), snapshot(games[1]));
  assert.deepEqual(snapshot(games[1]), snapshot(games[2]));
});

test('movement is normalized, bounded, and a dash travels for exactly 0.18 seconds', () => {
  const game = createGame('movement');
  step(game, { x: 1, y: 1 });
  assert.ok(Math.abs(Math.hypot(game.player.x - 400, game.player.y - 290) - 4) < 1e-8);
  frames(game, 300, { x: 1, y: -1 });
  assert.equal(game.player.x, RULES.maxX);
  assert.equal(game.player.y, RULES.minY);
  const dash = createGame('dash-distance');
  step(dash, { x: 1, dash: true });
  frames(dash, 10, {});
  assert.ok(Math.abs(dash.player.x - 400 - 144) < 1e-8);
  assert.equal(dash.player.dashTime, 0);
  assert.equal(dash.stats.dashes, 1);
});

test('dash is an edge action: holding, cooldown presses, and subframe presses are handled', () => {
  const game = createGame('dash-edges');
  frames(game, 180, { x: 1, dash: true });
  assert.equal(game.stats.dashes, 1);
  step(game, { x: -1, dash: false });
  step(game, { x: -1, dash: true });
  assert.equal(game.stats.dashes, 2);
  step(game, { dash: false });
  frames(game, 180, { dash: true });
  assert.equal(game.stats.dashes, 2, 'a blocked press is not delayed until cooldown ends');
  step(game, { dash: false });
  step(game, { dash: true }, TICK / 2);
  step(game, { dash: false }, TICK / 2);
  assert.equal(game.stats.dashes, 3, 'a press between ticks is not lost');
});

test('echoes contain the actual previous 600 ticks and replay it without pursuing', () => {
  const game = createGame('echo-path');
  const actual = [{ x: game.player.x, y: game.player.y }];
  for (let i = 0; i < 600; i += 1) {
    step(game, { x: Math.cos(i / 35) * 0.5, y: Math.sin(i / 35) * 0.5 });
    actual.push({ x: game.player.x, y: game.player.y });
  }
  const echo = game.echoes[0];
  assert.equal(echo.path.length, 601);
  assert.deepEqual(echo.path, actual);
  assert.deepEqual(getEchoPosition(echo, 10), actual[0]);
  assert.deepEqual(getEchoPosition(echo, 15), actual[300]);
  assert.deepEqual(getEchoPosition(echo, 25), actual[300]);
  const position = getEchoPosition(echo, 15);
  game.player.x = 25;
  assert.deepEqual(getEchoPosition(echo, 15), position);
  assert.equal(getEchoState(echo, 10.1), 'warning');
  assert.equal(getEchoState(echo, 10.7), 'active');
});

test('swept relative-motion collisions catch an echo crossing between samples', () => {
  const game = createGame('swept');
  const echo = stationaryEcho(500, 290);
  echo.path[0] = { x: 300, y: 290 };
  game.echoes.push(echo);
  step(game, {});
  assert.equal(game.player.hp, 2);
  assert.equal(game.events.filter((event) => event.type === 'damage').length, 1);

  const dashing = createGame('swept-dash');
  const crossing = stationaryEcho(500, 290);
  crossing.path[0] = { x: 300, y: 290 };
  dashing.echoes.push(crossing);
  step(dashing, { y: 1, dash: true });
  assert.equal(dashing.player.hp, 3);
  assert.equal(dashing.stats.echoesShattered, 1);
  assert.equal(dashing.score, 70);
});

test('loop teleportation never creates a phantom swept hit across the world', () => {
  const game = createGame('wrap');
  game.timeTicks = 599;
  game.time = 599 * TICK;
  const echo = stationaryEcho(700, 290);
  echo.path[0] = { x: 100, y: 290 };
  game.echoes.push(echo);
  step(game, {});
  assert.equal(game.player.hp, 3);
});

test('damage has a 1.25-second immunity window and consumes at most one HP per tick', () => {
  const game = createGame('damage');
  game.echoes.push(stationaryEcho(), { ...stationaryEcho(), id: 'second' });
  step(game, {});
  assert.equal(game.player.hp, 2);
  frames(game, 74);
  assert.equal(game.player.hp, 2);
  step(game, {});
  assert.equal(game.player.hp, 1);
  frames(game, 75);
  assert.equal(game.player.hp, 0);
  assert.equal(game.phase, 'lost');
  assert.equal(game.stats.damageTaken, 3);
});

test('shattered echoes rest two seconds; the final 0.7 seconds warn without damage', () => {
  const game = createGame('shatter');
  const echo = stationaryEcho();
  game.echoes.push(echo);
  step(game, { x: 1, dash: true });
  const hitTime = game.time;
  assert.equal(getEchoState(echo, hitTime + 0.5), 'dormant');
  assert.equal(getEchoState(echo, hitTime + 1.3), 'warning');
  assert.equal(getEchoState(echo, hitTime + 1.99), 'warning');
  assert.equal(getEchoState(echo, hitTime + 2), 'active');
  game.player.x = 400;
  game.player.y = 290;
  game.player.dashTime = 0;
  frames(game, 119);
  assert.equal(game.player.hp, 3);
  step(game, {});
  assert.equal(game.player.hp, 2);
});

test('one echo pays once per loop, and empty recordings never pay', () => {
  for (const lightCount of [0, 2, 20]) {
    const game = createGame(`reward-${lightCount}`);
    const echo = stationaryEcho(400, 290, lightCount);
    game.echoes.push(echo);
    step(game, { x: 1, dash: true });
    const points = lightCount === 0 ? 0 : 50 + 10 * Math.min(lightCount, 8);
    assert.equal(game.score, points);
    game.player.x = 400;
    game.player.y = 290;
    game.player.dashTime = 0;
    game.player.dashCooldown = 0;
    echo.disabledUntil = 0;
    step(game, { dash: false });
    step(game, { x: 1, dash: true });
    assert.equal(game.score, points, 'a repeat shatter scores zero');
    assert.equal(game.stats.echoesShattered, 2);
    game.timeTicks = 600;
    game.time = 10;
    game.player.x = 400;
    game.player.y = 290;
    game.player.dashTime = 0;
    game.player.dashCooldown = 0;
    echo.disabledUntil = 0;
    step(game, { dash: false });
    step(game, { x: 1, dash: true });
    assert.equal(game.score, points * 2);
  }
});

test('light schedules are seeded and independent of movement or collection', () => {
  const idle = createGame('same-targets');
  const moving = createGame('same-targets');
  const different = createGame('different-targets');
  const schedule = structuredClone(idle.lightSchedule);
  frames(idle, 600);
  frames(moving, 600, (i) => ({ x: Math.cos(i / 30), y: Math.sin(i / 30), dash: i % 150 === 0 }));
  assert.deepEqual(idle.lightSchedule, schedule);
  assert.deepEqual(moving.lightSchedule, schedule);
  assert.notDeepEqual(different.lightSchedule, schedule);
  assert.equal(idle._nextLight, moving._nextLight);
  assert.ok(idle.lights.length <= 6);
  assert.ok(moving.lights.length <= 6);
});

test('light combos reach x5, expire after four seconds, and reset on damage', () => {
  const game = createGame('combo');
  game.lightSchedule = [];
  for (let i = 0; i < 6; i += 1) {
    game.lights.push({ id: `combo-${i}`, x: 400, y: 290, radius: 7, expiresAt: 100 });
    step(game, {});
  }
  assert.equal(game.combo, 5);
  assert.equal(game.bestCombo, 5);
  assert.equal(game.score, 10 + 20 + 30 + 40 + 50 + 50);
  frames(game, 241);
  assert.equal(game.combo, 1);
  game.lights.push({ id: 'after-gap', x: 400, y: 290, radius: 7, expiresAt: 100 });
  step(game, {});
  assert.equal(game.score, 210);
  game.combo = 4;
  game.comboUntil = game.time + 4;
  game.echoes.push(stationaryEcho());
  step(game, {});
  assert.equal(game.combo, 1);
});

test('idle players cannot farm points or receive a survival bonus', () => {
  const idle = createGame('idle');
  frames(idle, 3600);
  assert.equal(idle.phase, 'lost');
  assert.equal(idle.score, 0);
  assert.equal(idle.stats.lightsCollected, 0);
  const immuneIdle = createGame('idle');
  immuneIdle.player.invulnerable = 61;
  frames(immuneIdle, 3600);
  assert.equal(immuneIdle.phase, 'won');
  assert.equal(immuneIdle.stats.survivalBonus, 0);
  assert.equal(immuneIdle.score, 0);
  const active = createGame('survival-reward');
  active.player.invulnerable = 61;
  active.stats.lightsCollected = 1;
  frames(active, 3600);
  assert.equal(active.stats.survivalBonus, 300);
});

test('replay recomputes the same result and ignores a forged reported score', () => {
  const game = createGame('survive-0');
  // An actual full-length run: steer toward a changing orbit and away from echoes.
  // This verifies that winning and replaying do not depend on modified game state.
  frames(game, 3600, (i) => {
    const player = game.player;
    const time = i / 60;
    let x = 400 + 260 * Math.cos(time * 0.56) - player.x;
    let y = 290 + 170 * Math.sin(time * 0.91) - player.y;
    const distance = Math.hypot(x, y);
    x /= Math.max(1, distance);
    y /= Math.max(1, distance);
    let nearest = Infinity;
    for (const echo of game.echoes) {
      if (getEchoState(echo, game.time) !== 'active') continue;
      const position = getEchoPosition(echo, game.time + 0.1);
      const dx = player.x - position.x;
      const dy = player.y - position.y;
      const separation = Math.hypot(dx, dy);
      nearest = Math.min(nearest, separation);
      if (separation < 90) {
        x += dx / Math.max(1, separation) * (90 - separation) / 25;
        y += dy / Math.max(1, separation) * (90 - separation) / 25;
      }
    }
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    return { x, y, dash: nearest < 50 && i % 2 === 0 };
  });
  assert.equal(game.phase, 'won');
  assert.equal(game.time, 60);
  assert.ok(game.score > 0);
  const replay = exportReplay(game);
  replay.result.score = 1_000_000;
  const verified = runReplay(JSON.stringify(replay));
  assert.deepEqual(snapshot(verified), snapshot(game));
  assert.notEqual(verified.score, replay.result.score);
  assert.equal(replay.inputs.reduce((sum, input) => sum + input.frames, 0), game.timeTicks);
  assert.deepEqual(exportReplay(runReplay(exportReplay(game))), exportReplay(game));
});

test('RLE compresses held inputs and replay does not re-trigger held dash', () => {
  const game = createGame('rle');
  frames(game, 300, { x: 1, dash: true });
  const replay = exportReplay(game);
  assert.equal(replay.inputs.length, 2);
  assert.equal(replay.inputs[0].dash, true);
  assert.equal(replay.inputs[1].dash, false);
  assert.equal(replay.inputs[1].frames, 299);
  assert.equal(runReplay(replay).stats.dashes, 1);
});

test('incremental playback preserves consecutive dash edges at the cooldown boundary', () => {
  const live = createGame('consecutive-dash-edges');
  step(live, { dash: true });
  frames(live, 142, { dash: false });
  step(live, { dash: true });
  step(live, { dash: false }, 0);
  step(live, { dash: true });
  const replay = exportReplay(live);
  assert.equal(replay.inputs.at(-1).dash, true);
  assert.equal(replay.inputs.at(-1).frames, 2);
  assert.equal(live.stats.dashes, 2);
  const playback = createGame(replay.seed);
  for (const input of replay.inputs) {
    for (let frame = 0; frame < input.frames; frame += 1) stepReplay(playback, input);
  }
  assert.deepEqual(snapshot(playback), snapshot(live));
  assert.deepEqual(snapshot(playback), snapshot(runReplay(replay)));
});

test('incremental playback never quantizes an already normalized analog vector again', () => {
  const live = createGame('analog-playback');
  frames(live, 45, { x: 1, y: 0.72 });
  const replay = exportReplay(live);
  const playback = createGame(replay.seed);
  for (const input of replay.inputs) {
    for (let frame = 0; frame < input.frames; frame += 1) stepReplay(playback, input);
  }
  assert.deepEqual(snapshot(playback), snapshot(live));
  stepReplay(playback, { x: 0, y: 0, dash: true });
  assert.ok(playback.events.some((event) => event.type === 'dash'));
  stepReplay(playback, { x: 0, y: 0, dash: false });
  assert.ok(playback.events.every((event) => event.type !== 'dash'), 'events belong to one playback tick');
});

test('clearing paused input discards pending dash and lets a newly pressed dash fire', () => {
  const pending = createGame('paused-pending');
  step(pending, { dash: true }, TICK / 2);
  assert.equal(pending.timeTicks, 0);
  assert.equal(pending._dashQueued, true);
  const accumulated = pending._accumulator;
  assert.equal(clearInput(pending), pending);
  assert.equal(pending._accumulator, accumulated, 'pausing preserves elapsed simulation time');
  step(pending, { dash: false }, TICK / 2);
  assert.equal(pending.timeTicks, 1);
  assert.equal(pending.stats.dashes, 0);

  const held = createGame('paused-held');
  frames(held, 145, { dash: true });
  assert.equal(held.stats.dashes, 1);
  clearInput(held);
  step(held, { dash: true });
  assert.equal(held.stats.dashes, 2, 'release during pause cannot leave a stale held state');
});

test('incremental replay validates recorded input and does not advance an ended run', () => {
  const game = createGame('bad-playback');
  assert.throws(() => stepReplay(game, { x: 2, y: 0, dash: false }), /replay input/);
  assert.throws(() => stepReplay(game, { x: 0, y: NaN, dash: false }), /replay input/);
  assert.throws(() => stepReplay(game, { x: 0, y: 0, dash: 'true' }), /replay input/);
  assert.throws(() => stepReplay(game, null), /replay input/);
  assert.equal(game.timeTicks, 0);
  frames(game, 3600);
  const ended = structuredClone(snapshot(game));
  stepReplay(game, { x: 1, y: 0, dash: true });
  assert.deepEqual(snapshot(game), ended);
  assert.deepEqual(game.events, []);
});

test('seed, frame-time, and replay bounds reject malformed or oversized inputs', () => {
  assert.throws(() => createGame(''), /Seed/);
  assert.throws(() => createGame('x'.repeat(129)), /Seed/);
  assert.throws(() => step(createGame(), {}, NaN), /Frame time/);
  assert.throws(() => step(createGame(), {}, -1), /Frame time/);
  assert.throws(() => runReplay(' '.repeat(512_001)), /too large/);
  assert.throws(() => runReplay({ version: 1, seed: 'x', ticks: 3601, inputs: [] }), /duration/);
  assert.throws(() => runReplay({ version: 1, seed: 'x', ticks: 1, inputs: [{ x: 2, y: 0, dash: false, frames: 1 }] }), /input/);
  assert.throws(() => runReplay({ version: 1, seed: 'x', ticks: 1, inputs: [{ x: 0, y: 0, dash: false, frames: 2 }] }), /count/);
  assert.throws(() => runReplay({ version: 1, seed: 'x', ticks: 1, inputs: [{ x: 0, y: 0, dash: false, frames: 0 }] }), /count/);
  assert.throws(() => runReplay({ version: 1, seed: 'x', ticks: 1, inputs: [{ x: 0, y: 0, dash: false, frames: 1.5 }] }), /count/);
  assert.throws(() => runReplay({ version: 1, seed: 'x', ticks: 3600, inputs: [{ x: 0, y: 0, dash: false, frames: 3600 }] }), /ended/);
});

test('daily seeds use a shared UTC date and validate dates', () => {
  assert.equal(seedFromDate('2026-10-27T23:30:00-05:00'), 'after-you-2026-10-28');
  assert.equal(seedFromDate(new Date('2026-10-28T04:30:00Z')), 'after-you-2026-10-28');
  assert.throws(() => seedFromDate('not-a-date'), /Invalid/);
});
