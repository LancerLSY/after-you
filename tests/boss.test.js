import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, step, stepReplay, getEchoPosition, getEchoState, exportReplay, runReplay } from '../dist/engine.js';
import { encodeBoss, decodeBoss, validateBoss } from '../dist/boss-codec.js';

function staticBoss(x = 400, y = 288) {
  return validateBoss({ version: 1, paths: Array.from({ length: 3 }, () => Array.from({ length: 41 }, () => ({ x, y }))) });
}

function recordedRun(seconds = 30) {
  const game = createGame('codec-fixture');
  game.timeTicks = seconds * 60;
  game.time = seconds;
  game.history = Array.from({ length: game.timeTicks + 1 }, (_, tick) => ({
    x: 400 + Math.sin(tick / 90) * 180,
    y: 290 + Math.sin(tick / 130) * 130,
  }));
  game.stats.lightsCollected = 3;
  game.stats.distance = game.history.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - game.history[index].x, point.y - game.history[index].y), 0);
  return game;
}

function rewritePacket(code, change) {
  const bytes = Uint8Array.from(Buffer.from(code, 'base64url'));
  change(bytes);
  let hash = 2166136261;
  for (const byte of bytes.subarray(0, bytes.length - 4)) hash = Math.imul(hash ^ byte, 16777619);
  new DataView(bytes.buffer).setUint32(bytes.length - 4, hash >>> 0);
  return Buffer.from(bytes).toString('base64url');
}

function defeatBoss() {
  const game = createGame('ignored-for-boss', { boss: staticBoss() });
  const events = [];
  for (let tick = 0; tick < 1800 && game.phase === 'playing'; tick += 1) {
    const echo = game.echoes[0];
    const target = getEchoPosition(echo, game.time);
    const dx = target.x - game.player.x;
    const dy = target.y - game.player.y;
    const distance = Math.hypot(dx, dy);
    let x = 0; let y = 0; let dash = false;
    if (game.player.dashTime <= 0) {
      const direction = distance < 38 ? -1 : distance > 42 ? 1 : 0;
      x = dx / Math.max(1, distance) * direction;
      y = dy / Math.max(1, distance) * direction;
      if (getEchoState(echo, game.time + 1 / 60) === 'active' && game.player.dashCooldown <= 1 / 60 + 1e-8 && distance < 65) {
        x = dx / Math.max(1, distance);
        y = dy / Math.max(1, distance);
        dash = true;
      }
    }
    step(game, { x, y, dash });
    events.push(...game.events);
  }
  return { game, events };
}

test('boss code is compact, deterministic, quantized and derived from actual history', () => {
  const game = recordedRun();
  const code = encodeBoss(game);
  assert.ok(code && /^[A-Za-z0-9_-]+$/.test(code));
  assert.equal(code.length, 339);
  assert.ok(code.length <= 600);
  assert.equal(encodeBoss(game), code);
  const boss = decodeBoss(code);
  assert.equal(boss.version, 1);
  assert.equal(boss.paths.length, 3);
  assert.equal(boss.seed, `boss-${boss.id}`);
  for (let stage = 0; stage < 3; stage += 1) {
    assert.equal(boss.paths[stage].length, 41);
    for (let index = 0; index <= 40; index += 1) {
      const actual = game.history[stage * 600 + index * 15];
      assert.deepEqual(boss.paths[stage][index], { x: Math.round(actual.x / 4) * 4, y: Math.round(actual.y / 4) * 4 });
    }
  }
  assert.deepEqual(validateBoss(boss), boss);
  game.history[15].x += 8;
  assert.notEqual(decodeBoss(encodeBoss(game)).seed, boss.seed);
});

test('short runs stretch three equal segments, while long runs use only their first 30 seconds', () => {
  const short = recordedRun(8);
  const shortBoss = decodeBoss(encodeBoss(short));
  for (let stage = 0; stage < 3; stage += 1) {
    const source = short.history[stage * 160];
    assert.deepEqual(shortBoss.paths[stage][0], { x: Math.round(source.x / 4) * 4, y: Math.round(source.y / 4) * 4 });
  }
  assert.equal(encodeBoss(recordedRun(30)), encodeBoss(recordedRun(60)));
});

test('boss creation requires eight seconds, three lights and 600 pixels of travel', () => {
  const eligible = recordedRun(8);
  assert.ok(encodeBoss(eligible));
  assert.equal(encodeBoss({ ...eligible, timeTicks: 479 }), null);
  assert.equal(encodeBoss({ ...eligible, stats: { ...eligible.stats, lightsCollected: 2 } }), null);
  assert.equal(encodeBoss({ ...eligible, stats: { ...eligible.stats, distance: 599.99 } }), null);
  assert.equal(encodeBoss({ ...eligible, history: [] }), null);
  assert.equal(encodeBoss(createGame()), null);
});

test('decoder rejects oversized, corrupt, noncanonical, versioned and out-of-bounds packets', () => {
  const code = encodeBoss(recordedRun());
  assert.throws(() => decodeBoss('x'.repeat(601)), /boss code/);
  assert.throws(() => decodeBoss('javascript:alert(1)'), /boss code/);
  assert.throws(() => decodeBoss(''), /boss code/);
  assert.throws(() => decodeBoss('AAAA'), /length/);
  assert.throws(() => decodeBoss(`${code}=`), /boss code/);
  const corrupt = code.slice(0, 20) + (code[20] === 'A' ? 'B' : 'A') + code.slice(21);
  assert.throws(() => decodeBoss(corrupt), /checksum/);
  assert.throws(() => decodeBoss(rewritePacket(code, (bytes) => { bytes[3] = 2; })), /version/);
  assert.throws(() => decodeBoss(rewritePacket(code, (bytes) => { bytes[4] = 0; })), /coordinates/);
  assert.throws(() => decodeBoss(rewritePacket(code, (bytes) => { bytes[5] = 255; })), /coordinates/);
  assert.throws(() => decodeBoss(rewritePacket(code, (bytes) => { bytes[4] = 6; bytes[6] = 194; })), /speed/);
});

test('direct boss configurations reject nonfinite, wrong-size and forged identity data', () => {
  const boss = staticBoss();
  assert.throws(() => validateBoss({ ...boss, paths: boss.paths.slice(1) }), /three paths/);
  const short = structuredClone(boss); short.paths[0].pop();
  assert.throws(() => validateBoss(short), /41 samples/);
  const nonfinite = structuredClone(boss); nonfinite.paths[0][0].x = Infinity;
  assert.throws(() => createGame('x', { boss: nonfinite }), /coordinates/);
  const unquantized = structuredClone(boss); unquantized.paths[0][0].y = 290;
  assert.throws(() => validateBoss(unquantized), /coordinates/);
  assert.throws(() => validateBoss({ ...boss, seed: 'forged' }), /identity/);
  assert.throws(() => validateBoss({ ...boss, id: 'forged' }), /identity/);
});

test('boss paths interpolate to exact 60Hz echoes and seeds determine the same lights', () => {
  const boss = decodeBoss(encodeBoss(recordedRun()));
  const game = createGame('ignored', { boss });
  assert.equal(game.mode, 'boss');
  assert.equal(game.duration, 30);
  assert.equal(game.seed, boss.seed);
  assert.equal(game.echoes.length, 1);
  assert.equal(game.echoes[0].path.length, 601);
  assert.equal(getEchoState(game.echoes[0], 0), 'warning');
  for (let sample = 0; sample < 40; sample += 1) {
    assert.deepEqual(getEchoPosition(game.echoes[0], sample / 4), boss.paths[0][sample]);
  }
  const classic = createGame(boss.seed);
  assert.deepEqual(game.lightSchedule, classic.lightSchedule.filter((light) => light.spawnTime < 30));
  const configBefore = structuredClone(game._bossConfig);
  boss.paths[0][0].x = 24;
  assert.deepEqual(game._bossConfig, configBefore, 'external mutation cannot alter a challenge');
});

test('nine legitimate dash hits defeat three stages before the 30-second deadline', () => {
  const { game, events } = defeatBoss();
  assert.equal(game.phase, 'won');
  assert.equal(game.boss.defeated, true);
  assert.equal(game.boss.stage, 2);
  assert.equal(game.boss.hp, 0);
  assert.equal(game.stats.bossHits, 9);
  assert.equal(game.player.hp, 3);
  assert.ok(game.time < 30);
  assert.equal(game.echoes.length, 1);
  assert.equal(events.filter((event) => event.type === 'shatter').length, 9);
  assert.deepEqual(events.filter((event) => event.type === 'boss-stage').map((event) => event.stage), [1, 2]);
  assert.equal(events.at(-1).reason, 'boss-defeated');
  assert.equal(game.history.length, game.timeTicks + 1);
  assert.ok(game.score >= 1200);
});

test('a cleared boss stage changes path and gets exactly 0.9 seconds of harmless warning', () => {
  const boss = staticBoss();
  boss.paths[1] = boss.paths[1].map(() => ({ x: 600, y: 400 }));
  delete boss.seed; delete boss.id;
  const game = createGame('stage', { boss });
  game.boss.hp = 1;
  game.echoes[0].warningUntil = 0;
  step(game, { x: 1, dash: true });
  assert.equal(game.boss.stage, 1);
  assert.equal(game.boss.hp, 3);
  assert.deepEqual(getEchoPosition(game.echoes[0], game.time), { x: 600, y: 400 });
  assert.equal(getEchoState(game.echoes[0], game.time + 0.899), 'warning');
  assert.equal(getEchoState(game.echoes[0], game.time + 0.9), 'active');
  assert.ok(game.events.some((event) => event.type === 'boss-stage' && event.reason === 'stage-cleared'));
});

test('boss hits do not depend on light recordings, cannot repeat while dormant, and rest two seconds', () => {
  const game = createGame('rest', { boss: staticBoss() });
  game.echoes[0].warningUntil = 0;
  step(game, { x: 1, dash: true });
  assert.equal(game.boss.hp, 2);
  assert.equal(game.score, 100);
  const hit = game.time;
  assert.equal(getEchoState(game.echoes[0], hit + 1), 'dormant');
  assert.equal(getEchoState(game.echoes[0], hit + 1.3), 'warning');
  assert.equal(getEchoState(game.echoes[0], hit + 2), 'active');
  step(game, { x: -1, dash: false });
  assert.equal(game.boss.hp, 2);
});

test('boss timeouts lose at exactly 30 seconds, while collision still costs player HP', () => {
  const game = createGame('timeout', { boss: staticBoss(700, 480) });
  for (let tick = 0; tick < 1800; tick += 1) step(game, {});
  assert.equal(game.time, 30);
  assert.equal(game.phase, 'lost');
  assert.equal(game.player.hp, 3);
  assert.equal(game.echoes.length, 1, 'boss mode does not spawn classic recordings');
  assert.equal(game.events.at(-1).reason, 'timeout');
  const collision = createGame('collision', { boss: staticBoss() });
  for (let tick = 0; tick < 60; tick += 1) step(collision, {});
  assert.equal(collision.player.hp, 2);
  assert.equal(collision.boss.hp, 3);
});

test('boss lights reduce dash cooldown by 0.35 seconds and classic lights do not', () => {
  const boss = createGame('cooldown', { boss: staticBoss(700, 480) });
  const classic = createGame('cooldown');
  for (const game of [boss, classic]) {
    game.player.dashCooldown = 1;
    game.lights.push({ id: 'cooldown', x: 400, y: 290, radius: 7, expiresAt: 10 });
    step(game, {});
  }
  assert.ok(Math.abs(classic.player.dashCooldown - boss.player.dashCooldown - 0.35) < 1e-8);
  assert.equal(boss.events.find((event) => event.type === 'light').cooldownReduction, 0.35);
  boss.player.dashCooldown = 0.1;
  boss.lights.push({ id: 'floor', x: 400, y: 290, radius: 7, expiresAt: 10 });
  step(boss, {});
  assert.equal(boss.player.dashCooldown, 0);
});

test('Boss replay recomputes victory and history, and rejects changed rules or identity', () => {
  const { game } = defeatBoss();
  const replay = exportReplay(game);
  replay.result.score = 999999;
  const checked = runReplay(JSON.stringify(replay));
  assert.equal(checked.phase, 'won');
  assert.equal(checked.score, game.score);
  assert.deepEqual(checked.boss, game.boss);
  assert.deepEqual(checked.history, game.history);
  assert.deepEqual(checked.player, game.player);
  const visual = createGame(replay.seed, { boss: replay.boss });
  for (const input of replay.inputs) for (let frame = 0; frame < input.frames; frame += 1) stepReplay(visual, input);
  assert.deepEqual(exportReplay(visual), exportReplay(game));
  assert.throws(() => runReplay({ ...replay, seed: 'another-seed' }), /rules/);
  assert.throws(() => runReplay({ ...replay, duration: 60 }), /rules/);
  assert.throws(() => runReplay({ ...replay, mode: 'classic' }), /rules/);
  const bad = structuredClone(replay); bad.boss.paths[0][0].x = 24;
  assert.throws(() => runReplay(bad), /identity|speed/);
});

test('a Boss-mode run retains the history needed to generate a new challenge', () => {
  const game = createGame('remix', { boss: staticBoss(700, 480) });
  for (let tick = 0; tick < 600; tick += 1) {
    if (tick % 180 === 0) game.lights.push({ id: `test-${tick}`, x: game.player.x, y: game.player.y, radius: 7, expiresAt: 100 });
    step(game, { x: Math.cos(tick / 40), y: Math.sin(tick / 40) });
  }
  assert.ok(game.stats.lightsCollected >= 3);
  assert.ok(game.stats.distance >= 600);
  const next = decodeBoss(encodeBoss(game));
  assert.notEqual(next.id, game._bossConfig.id);
  assert.equal(next.paths.length, 3);
});
