import test from 'node:test';
import assert from 'node:assert/strict';
import { createRush, stepRush, stepRushReplay, chooseRushUpgrade, clearRushInput, exportRushReplay, runRushReplay, previewDash, RUSH_RULES, RUSH_UPGRADES } from '../dist/rush.js';
import { playRushProbe } from '../scripts/rush-probe.mjs';

const DT = 1 / 60;
function frames(game, count, input = {}) { for (let index = 0; index < count; index += 1) stepRush(game, typeof input === 'function' ? input(game, index) : input); return game; }
function clean(upgrades = []) { const game = createRush('isolated'); game.targets = []; game.upgrades = [...upgrades]; game._nextWaveTick = 9999; return game; }
function target(id, x, y, hp = 1, kind = 'echo', sourceTraceId = null) {
  return { id, kind, x, y, hp, maxHp: hp, radius: kind === 'nemesis' ? 28 : 20,
    path: null, sourceTraceId, bornAt: 0, warningUntil: 0, invulnerableUntil: 0, motionDuration: 0, alive: true };
}
function dash(game, aimX = 1000, aimY = 290) { stepRush(game, { aimX, aimY, fire: true }); frames(game, 11, { aimX, aimY }); }

test('Rush starts with three hittable targets, and the first aimed shot shatters one', () => {
  const game = createRush('opening');
  assert.equal(game.mode, 'rush'); assert.equal(game.duration, 36);
  assert.equal(game.targets.length, 3);
  assert.ok(game.targets.every((enemy) => enemy.warningUntil === 0 && enemy.radius === 20));
  const first = game.targets[0];
  dash(game, first.x, first.y);
  assert.ok(game.stats.kills >= 1);
  assert.ok(game.score > 0);
  assert.equal(game.player.dashCooldown, 0);
  assert.equal(game.traces.length, 1);
  assert.equal(game.player.hp, 3);
});

test('a miss costs cooldown, while a hit refunds it without ending the current dash', () => {
  const missed = clean(); dash(missed);
  assert.equal(missed.stats.dashes, 1);
  assert.ok(missed.player.dashCooldown > 0.6);
  assert.equal(missed.combo, 0);
  stepRush(missed, { aimX: 0, aimY: 290, fire: true });
  assert.equal(missed.stats.dashes, 1);
  const hit = clean(); hit.targets.push(target('hit', 480, 290));
  stepRush(hit, { aimX: 650, aimY: 290, fire: true }); frames(hit, 3);
  assert.equal(hit.player.dashCooldown, 0);
  assert.ok(hit.player.dashTime > 0);
  frames(hit, 8);
  stepRush(hit, { aimX: 200, aimY: 290, fire: true });
  assert.equal(hit.stats.dashes, 2);
});

test('subframe fire is queued with its aim, and clearInput cancels it', () => {
  const game = clean();
  stepRush(game, { aimX: 400, aimY: 100, fire: true }, DT / 2);
  assert.equal(game.timeTicks, 0);
  stepRush(game, { aimX: 700, aimY: 290 }, DT / 2);
  assert.equal(game.stats.dashes, 1);
  assert.equal(game.player.x, 400);
  assert.ok(game.player.y < 290, 'queued release retains the aim at release time');
  const canceled = clean();
  stepRush(canceled, { fire: true }, DT / 2);
  clearRushInput(canceled);
  stepRush(canceled, {}, DT / 2);
  assert.equal(canceled.stats.dashes, 0);
});

test('fire is a pulse, not a held-key edge: consecutive recorded pulses are preserved', () => {
  const game = clean();
  frames(game, 60, { aimX: 650, aimY: 290, fire: true });
  assert.equal(game.stats.dashes, 2, 'the second ready pulse must not be swallowed by a held flag');
  assert.ok(game.inputs.every((input) => input.fire));
});

test('30/60/120 Hz render rates produce the same fixed-tick movement and focus', () => {
  const games = [createRush('fps'), createRush('fps'), createRush('fps')];
  for (let index = 0; index < 30; index += 1) stepRush(games[0], { aiming: true, moveX: 0.2, moveY: -0.3 }, 1 / 30);
  for (let index = 0; index < 60; index += 1) stepRush(games[1], { aiming: true, moveX: 0.2, moveY: -0.3 }, 1 / 60);
  for (let index = 0; index < 120; index += 1) stepRush(games[2], { aiming: true, moveX: 0.2, moveY: -0.3 }, 1 / 120);
  for (const game of games.slice(1)) {
    assert.deepEqual(game.player, games[0].player);
    assert.deepEqual(game.history, games[0].history);
    assert.equal(game.worldTime, games[0].worldTime);
    assert.equal(game.focus, games[0].focus);
  }
});

test('focus slows world time, never the battle clock, and cannot recharge while held', () => {
  const game = createRush('focus');
  frames(game, 60, { aiming: true });
  assert.equal(game.time, 1);
  assert.ok(Math.abs(game.worldTime - 0.24) < 1e-8);
  assert.ok(Math.abs(game.focus - 0.2) < 1e-8);
  frames(game, 60, { aiming: true });
  assert.equal(game.time, 2);
  assert.equal(game.focus, 0);
  assert.ok(Math.abs(game.worldTime - 1.088) < 1e-8);
  frames(game, 60, { aiming: true });
  assert.ok(Math.abs(game.worldTime - 2.088) < 1e-8);
  assert.equal(game.focus, 0);
  frames(game, 60, {});
  assert.ok(Math.abs(game.focus - 0.45) < 1e-8);
  assert.equal(game.time, 4);
});

test('choices freeze both clocks at ticks 360 and 960 and record exact selected ticks', () => {
  const game = createRush('choices'); frames(game, 360);
  assert.equal(game.phase, 'choosing'); assert.equal(game.timeTicks, 360);
  assert.deepEqual(game.offers, ['relay', 'ricochet', 'burst']);
  const world = game.worldTime, position = { ...game.player };
  frames(game, 100, { moveX: 1, fire: true, aiming: true });
  assert.equal(game.timeTicks, 360); assert.equal(game.worldTime, world); assert.deepEqual(game.player, position);
  assert.equal(chooseRushUpgrade(game, 'prune'), false);
  assert.equal(chooseRushUpgrade(game, 'relay'), true);
  assert.deepEqual(game.choices, [{ tick: 360, id: 'relay' }]);
  frames(game, 600);
  assert.equal(game.phase, 'choosing'); assert.equal(game.time, 16);
  assert.deepEqual(game.offers, ['ricochet', 'burst', 'prune']);
  assert.equal(chooseRushUpgrade(game, 'relay'), false);
  assert.equal(chooseRushUpgrade(game, 'prune'), true);
  assert.deepEqual(game.choices, [{ tick: 360, id: 'relay' }, { tick: 960, id: 'prune' }]);
  assert.ok(Object.values(RUSH_UPGRADES).every((upgrade) => upgrade.en.title && upgrade.zh.description));
});

test('actual dash geometry becomes a hostile trace after a one-second warning', () => {
  const game = clean(); dash(game);
  const trace = game.traces[0], enemy = game.targets[0];
  assert.equal(trace.points.length, 13);
  assert.deepEqual(trace.points.map(({ x, y }) => ({ x, y })), game.history);
  assert.equal(enemy.sourceTraceId, trace.id);
  assert.deepEqual(enemy.path, trace.points);
  assert.ok(Math.abs(enemy.warningUntil - trace.bornAt - 1) < 1e-8);
  assert.ok(Object.isFrozen(trace.points));
  assert.ok(Object.isFrozen(trace.points[0]));
});

test('Ricochet changes actual reach and records the exact wall corner used by preview', () => {
  const straight = clean(); straight.player.x = 740;
  const bouncing = clean(['ricochet']); bouncing.player.x = 740;
  assert.equal(previewDash(straight, 1000, 290).at(-1).x, 776);
  const preview = previewDash(bouncing, 1000, 290);
  assert.ok(Math.abs(preview.at(-1).x - 562) < 1e-8);
  assert.equal(preview[1].x, 776);
  dash(straight); dash(bouncing);
  assert.equal(straight.player.x, 776);
  assert.ok(Math.abs(bouncing.player.x - 562) < 1e-8);
  assert.ok(Math.abs(bouncing.stats.distance - 250) < 1e-8);
  assert.equal(bouncing.stats.ricochets, 1);
  assert.ok(bouncing.traces[0].points.some((point) => point.x === 776 && Math.abs(point.t - preview[1].t) < 1e-8));
  assert.deepEqual(bouncing.traces[0].points.at(-1), { ...preview.at(-1) });
});

test('Relay kills on the actual reflected route; replacing that path changes the result', () => {
  const actual = clean(['relay', 'ricochet']); actual.player.x = 740; dash(actual);
  const wrong = clean(['relay', 'ricochet']); wrong.player.x = 740; dash(wrong);
  assert.deepEqual(actual.relays[0].points, actual.traces[0].points);
  assert.notEqual(actual.relays[0].points, actual.traces[0].points);
  for (const game of [actual, wrong]) game.targets.push(target('relay-only', 760, 290));
  wrong.relays[0].points = [{ x: 100, y: 100, t: 0 }, { x: 200, y: 100, t: 0.2 }];
  frames(actual, 32); frames(wrong, 32);
  assert.equal(actual.stats.relayHits, 1);
  assert.equal(actual.stats.kills, 1);
  assert.equal(wrong.stats.relayHits, 0);
  assert.equal(wrong.stats.kills, 0);
  assert.equal(actual.stats.dashes, 1, 'Relay never recursively creates a new player dash');
  assert.equal(actual.traces.length, 1, 'Relay never records another trace or spawns another Relay');
  assert.ok(actual.bestCombo > wrong.bestCombo);
});

test('Burst changes off-axis kills and combo, without recursively detonating its victims', () => {
  const plain = clean(), burst = clean(['burst']);
  for (const game of [plain, burst]) game.targets.push(target('direct', 450, 290), target('splash', 500, 330), target('outside', 610, 330));
  dash(plain); dash(burst);
  assert.equal(plain.stats.kills, 1);
  assert.equal(burst.stats.kills, 2);
  assert.equal(burst.stats.burstHits, 1);
  assert.ok(burst.targets.some((enemy) => enemy.id === 'outside'));
  assert.equal(plain.bestCombo, 1); assert.equal(burst.bestCombo, 2);
  assert.ok(burst.score > plain.score);
});

test('Prune erases old hostile copies, preserves the Nemesis and leaves active Relay snapshots intact', () => {
  const game = clean(['relay', 'prune']);
  const points = [{ x: 100, y: 100, t: 0 }, { x: 200, y: 100, t: 0.2 }];
  game.traces.push({ id: 'old', points, duration: 0.2, bornAt: -5 });
  game.targets.push(target('old-hostile', 100, 200, 1, 'echo', 'old'));
  const boss = target('boss', 100, 100, 6, 'nemesis', 'old'); game.nemesis = boss; game.targets.push(boss);
  const snapshot = points.map((point) => ({ ...point }));
  game.relays.push({ id: 'old-relay', points: snapshot, sourceTraceId: 'old', startAt: 10, duration: 0.2, progress: 0, x: 100, y: 100, attack: { owner: 'relay', hitIds: new Set() } });
  dash(game);
  assert.equal(game.stats.pruned, 1);
  assert.ok(!game.traces.some((trace) => trace.id === 'old'));
  assert.ok(!game.targets.some((enemy) => enemy.id === 'old-hostile'));
  assert.ok(game.targets.includes(boss)); assert.equal(boss.hp, 6);
  assert.deepEqual(game.relays.find((relay) => relay.id === 'old-relay').points, snapshot);
});

test('a reflected dash and a reflected Relay each hit Nemesis at most once after its short immunity expires', () => {
  const game = clean(['ricochet', 'relay']); game.player.x = 650;
  const boss = target('boss', 650, 290, 6, 'nemesis'); game.nemesis = boss; game.targets.push(boss);
  dash(game);
  assert.equal(boss.hp, 5);
  assert.ok(boss.invulnerableUntil < game.worldTime, 'the dash returns after the 0.15 s immunity; the hit set must still protect it');
  assert.ok(game.targets.includes(boss));
  assert.equal(boss.warningUntil, 0, 'Boss hits do not hide it for two seconds');
  frames(game, 32);
  assert.equal(boss.hp, 4);
  assert.equal(game.stats.relayHits, 1);
  assert.equal(game.stats.nemesisHits, 2);
});

test('Burst and the originating dash share a Nemesis hit set', () => {
  const game = clean(['ricochet', 'burst']); game.player.x = 650;
  game.targets.push(target('splash-source', 680, 290));
  const boss = target('boss', 650, 290, 6, 'nemesis'); game.nemesis = boss; game.targets.push(boss);
  dash(game);
  assert.equal(boss.hp, 5);
  assert.equal(game.stats.nemesisHits, 1);
});

test('three lives, one-second damage immunity and terminal freeze are enforced', () => {
  const game = clean(); game.targets.push(target('contact', 400, 290));
  stepRush(game); assert.equal(game.player.hp, 2);
  frames(game, 59); assert.equal(game.player.hp, 2);
  stepRush(game); assert.equal(game.player.hp, 1);
  frames(game, 60); assert.equal(game.phase, 'lost'); assert.equal(game.player.hp, 0);
  const ended = exportRushReplay(game); frames(game, 100, { fire: true });
  assert.deepEqual(exportRushReplay(game), ended);
});

test('waves reuse actual trace objects and the live target cap protects the final enemy', () => {
  const game = clean();
  const boss = target('boss', 40, 80, 6, 'nemesis'); game.nemesis = boss; game.targets.push(boss);
  for (let index = 0; index < 23; index += 1) game.targets.push(target(`old-${index}`, 40, 80));
  dash(game);
  assert.equal(game.targets.length, 24);
  assert.ok(game.targets.includes(boss));
  assert.ok(game.targets.some((enemy) => enemy.path === game.traces[0].points));
  assert.ok(!game.targets.some((enemy) => enemy.id === 'old-0'));
});

test('standing still or following a movement-only rectangle cannot win the 36-second battle', () => {
  for (const moving of [false, true]) {
    const game = createRush(`no-attacks-${moving}`);
    const corners = [[700, 100], [700, 480], [100, 480], [100, 100]];
    let corner = 0;
    for (let tick = 0; tick < 2160 && game.phase !== 'lost'; tick += 1) {
      if (game.phase === 'choosing') chooseRushUpgrade(game, game.offers[0]);
      let moveX = 0, moveY = 0;
      if (moving) {
        const [x, y] = corners[corner], distance = Math.hypot(x - game.player.x, y - game.player.y);
        if (distance < 4) corner = (corner + 1) % corners.length;
        moveX = (x - game.player.x) / Math.max(1, distance); moveY = (y - game.player.y) / Math.max(1, distance);
      }
      stepRush(game, { moveX, moveY });
      if (game.timeTicks === 1560) assert.equal(game.nemesis.hp, 6);
    }
    assert.equal(game.phase, 'lost'); assert.equal(game.stats.hits, 0);
    if (!moving) { assert.equal(game.time, 36); assert.equal(game.events.at(-1).reason, 'timeout'); }
  }
});

test('ordinary inputs can beat Nemesis and replay choices and full geometry exactly', () => {
  const { game, maxTargets } = playRushProbe('rush-probe-0', ['relay', 'burst']);
  assert.equal(game.phase, 'won'); assert.equal(game.nemesis.hp, 0);
  assert.ok(game.time >= 26 && game.time < 36); assert.ok(maxTargets <= 24);
  assert.ok(game.stats.relayHits > 0 && game.stats.burstHits > 0);
  assert.deepEqual(game.choices, [{ tick: 360, id: 'relay' }, { tick: 960, id: 'burst' }]);
  const replay = exportRushReplay(game); replay.result.score = 999999;
  const checked = runRushReplay(JSON.stringify(replay));
  assert.equal(checked.score, game.score); assert.deepEqual(checked.player, game.player);
  assert.deepEqual(checked.history, game.history); assert.deepEqual(checked.traces, game.traces);
  assert.deepEqual(checked.targets, game.targets); assert.deepEqual(checked.relays, game.relays);
  const visual = createRush(replay.seed);
  for (const input of replay.inputs) for (let frame = 0; frame < input.frames; frame += 1) {
    if (visual.phase === 'choosing') chooseRushUpgrade(visual, replay.choices.find((choice) => choice.tick === visual.timeTicks).id);
    stepRushReplay(visual, input);
  }
  assert.deepEqual(exportRushReplay(visual), exportRushReplay(game));
});

test('different builds change actual combat outcomes and histories for the same seed', () => {
  const relay = playRushProbe('rush-probe-0', ['relay', 'burst']).game;
  const bounce = playRushProbe('rush-probe-0', ['ricochet', 'burst']).game;
  const prune = playRushProbe('rush-probe-0', ['relay', 'prune']).game;
  assert.ok(relay.stats.relayHits > 0 && bounce.stats.relayHits === 0);
  assert.ok(bounce.stats.ricochets > 0 && relay.stats.ricochets === 0);
  assert.ok(prune.stats.pruned > 0 && prune.stats.burstHits === 0);
  assert.notDeepEqual(relay.history, bounce.history);
  assert.notEqual(relay.bestCombo, bounce.bestCombo);
});

test('recorded analog inputs are not normalized again and choice pauses must be applied explicitly', () => {
  const live = createRush('analog'); frames(live, 40, { moveX: 1, moveY: 0.72 });
  const replay = exportRushReplay(live), visual = createRush(replay.seed);
  for (const input of replay.inputs) for (let frame = 0; frame < input.frames; frame += 1) stepRushReplay(visual, input);
  assert.deepEqual(visual.player, live.player);
  const choice = createRush('paused-replay'); frames(choice, 360);
  const paused = exportRushReplay(choice);
  assert.equal(runRushReplay(paused).phase, 'choosing');
  assert.throws(() => stepRushReplay(choice, paused.inputs[0]), /choice/);
  chooseRushUpgrade(choice, 'relay');
  assert.equal(runRushReplay(exportRushReplay(choice)).phase, 'playing');
});

test('Rush replay validation rejects oversized, malformed, impossible or foreign formats', () => {
  const game = createRush('limits'); frames(game, 360); chooseRushUpgrade(game, 'relay'); frames(game, 2);
  const replay = exportRushReplay(game);
  assert.throws(() => runRushReplay('x'.repeat(700001)), /too large/);
  assert.throws(() => runRushReplay({ ...replay, kind: 'classic' }), /Invalid/);
  assert.throws(() => runRushReplay({ ...replay, version: 2 }), /Invalid/);
  assert.throws(() => runRushReplay({ ...replay, seed: undefined }), /seed/);
  assert.throws(() => runRushReplay({ ...replay, ticks: 2161 }), /duration/);
  assert.throws(() => runRushReplay({ ...replay, choices: [] }), /stopped/);
  assert.throws(() => runRushReplay({ ...replay, choices: [{ tick: 360, id: 'prune' }] }), /offered/);
  assert.throws(() => runRushReplay({ ...replay, choices: [{ tick: 359, id: 'relay' }] }), /choice/);
  assert.throws(() => runRushReplay({ ...replay, choices: [{ tick: 360, id: '__proto__' }] }), /choice/);
  const bad = structuredClone(replay); bad.inputs[0].moveX = Infinity;
  assert.throws(() => runRushReplay(bad), /input/);
  const overflow = structuredClone(replay); overflow.inputs[0].frames = 2161;
  assert.throws(() => runRushReplay(overflow), /frame count/);
  assert.throws(() => createRush('x'.repeat(129)), /seed/);
  assert.throws(() => stepRush(createRush(), {}, -1), /frame time/);
});
