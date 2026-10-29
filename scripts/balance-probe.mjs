import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { createGame, step, getEchoPosition, getEchoState, exportReplay, runReplay, RULES } from '../dist/engine.js';
import { encodeBoss, decodeBoss } from '../dist/boss-codec.js';

// Bounded software probe, not a model of human play. These controllers only emit
// normal step() inputs: no changes to coordinates, health, scoring or cooldowns.
const COUNT = 20;
const TICK = 1 / RULES.tickRate;
const PREFIX = 'balance-2026-10-27-';

function direction(x, y) {
  const length = Math.hypot(x, y);
  return length > 1 ? { x: x / length, y: y / length } : { x, y };
}

function nearestLight(game, origin = game.player) {
  let best = null;
  let cost = Infinity;
  for (const light of game.lights) {
    const distance = Math.hypot(light.x - origin.x, light.y - origin.y);
    if (distance / RULES.speed > light.expiresAt - game.time) continue;
    if (distance < cost) { best = light; cost = distance; }
  }
  return best;
}

function activeEchoes(game, lookAhead = 0) {
  return game.echoes.filter((echo) => getEchoState(echo, game.time + lookAhead) === 'active')
    .map((echo) => ({ echo, ...getEchoPosition(echo, game.time + lookAhead) }));
}

function steerAway(game, vector, enemies, strength = 2.4) {
  let { x, y } = vector;
  for (const enemy of enemies) {
    const dx = game.player.x - enemy.x;
    const dy = game.player.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 105) {
      const weight = (105 - distance) / 105 * strength;
      x += dx / Math.max(1, distance) * weight;
      y += dy / Math.max(1, distance) * weight;
    }
  }
  // Weak wall steering avoids pinning a normal-speed escape to a corner.
  x += Math.max(0, 55 - game.player.x) / 24 - Math.max(0, game.player.x - 745) / 24;
  y += Math.max(0, 95 - game.player.y) / 24 - Math.max(0, game.player.y - 485) / 24;
  return direction(x, y);
}

function classicInput(game) {
  const player = game.player;
  const light = nearestLight(game);
  const target = light || { x: 400 + Math.cos(game.time * 0.61) * 230, y: 290 + Math.sin(game.time * 0.83) * 155 };
  const seek = direction(target.x - player.x, target.y - player.y);
  const enemies = activeEchoes(game, 0.08);
  const nearest = enemies.reduce((best, enemy) => {
    const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
    return !best || distance < best.distance ? { ...enemy, distance } : best;
  }, null);
  if (player.dashTime > 0) return { x: 0, y: 0, dash: false };
  const ready = player.dashCooldown <= TICK + 1e-8;
  if (ready && nearest && nearest.distance < 85) {
    return { ...direction(nearest.x - player.x, nearest.y - player.y), dash: true };
  }
  if (ready && light && game.time < 10 && Math.hypot(light.x - player.x, light.y - player.y) > 200) {
    return { ...seek, dash: true };
  }
  return { ...steerAway(game, seek, enemies), dash: false };
}

function bossInput(game) {
  const player = game.player;
  const echo = game.echoes[0];
  if (player.dashTime > 0) return { x: 0, y: 0, dash: false };
  const now = getEchoPosition(echo, game.time);
  const distance = Math.hypot(now.x - player.x, now.y - player.y);
  const ready = player.dashCooldown <= TICK + 1e-8;
  const active = getEchoState(echo, game.time + TICK) === 'active';
  // The rendered path gives a short preview; use the same 150 ms information.
  const ahead = getEchoPosition(echo, game.time + 0.15);
  if (ready && active && distance < 135) {
    return { ...direction(ahead.x - player.x, ahead.y - player.y), dash: true };
  }
  const light = nearestLight(game);
  if (!ready && light && Math.hypot(light.x - player.x, light.y - player.y) < 190) {
    return { ...steerAway(game, direction(light.x - player.x, light.y - player.y), activeEchoes(game, 0.08)), dash: false };
  }
  // Wait just outside the collision radius while charging, otherwise intercept.
  const pursuit = direction(ahead.x - player.x, ahead.y - player.y);
  if (active && !ready && distance < 85) {
    return { ...steerAway(game, pursuit, [{ x: now.x, y: now.y }], 3.6), dash: false };
  }
  return { ...pursuit, dash: false };
}

function play(seed, controller, boss) {
  const game = createGame(seed, boss ? { boss } : undefined);
  let lastReason = null;
  for (let tick = 0; tick < game.duration * RULES.tickRate && game.phase === 'playing'; tick += 1) {
    step(game, controller(game));
    for (const event of game.events) if (event.type === 'won' || event.type === 'lost') lastReason = event.reason;
  }
  assert.notEqual(game.phase, 'playing', 'every bounded run must reach a terminal state');
  const replay = exportReplay(game);
  const checked = runReplay(replay);
  assert.deepEqual(exportReplay(checked), replay, 'full replay result must match the live simulation');
  assert.deepEqual(checked.history, game.history, 'replay must reproduce the actual trajectory');
  return { game, replay, reason: lastReason, replayHash: createHash('sha256').update(JSON.stringify(replay)).digest('hex') };
}

function record(run) {
  const { game } = run;
  return { seed: game.seed, phase: game.phase, seconds: Number(game.time.toFixed(2)),
    score: game.score, hp: game.player.hp, lights: game.stats.lightsCollected,
    shatters: game.stats.echoesShattered, bossHits: game.stats.bossHits,
    damage: game.stats.damageTaken, dashes: game.stats.dashes,
    distance: Math.round(game.stats.distance), reason: run.reason,
    replayVerified: true, replayHash: run.replayHash };
}

const rows = [];
let sample = null;
let demoReplay = null;
for (let index = 1; index <= COUNT; index += 1) {
  const source = play(`${PREFIX}${String(index).padStart(2, '0')}`, classicInput);
  const code = encodeBoss(source.game);
  let bossRun = null;
  if (code) bossRun = play(decodeBoss(code).seed, bossInput, decodeBoss(code));
  const row = { classic: record(source), forge: Boolean(code), boss: bossRun ? record(bossRun) : null };
  rows.push(row);
  if (code && !sample) { demoReplay = bossRun.replay; sample = { code, source: row.classic, sourceReplayResult: source.replay.result,
    sourceReplayTicks: source.replay.ticks, boss: row.boss, bossReplayResult: bossRun.replay.result,
    bossReplayTicks: bossRun.replay.ticks }; }
}

const classicWins = rows.filter((row) => row.classic.phase === 'won').length;
const forged = rows.filter((row) => row.forge).length;
const bossWins = rows.filter((row) => row.boss?.phase === 'won').length;
const bossTimeouts = rows.filter((row) => row.boss?.reason === 'timeout').length;
const mean = (values) => Number((values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(2));
const summary = {
  runs: COUNT, classicWins, forgeEligible: forged, bossRuns: forged, bossWins, bossTimeouts,
  classicMeanSeconds: mean(rows.map((row) => row.classic.seconds)),
  classicMeanLights: mean(rows.map((row) => row.classic.lights)),
  classicMeanShatters: mean(rows.map((row) => row.classic.shatters)),
  bossMeanHits: mean(rows.filter((row) => row.boss).map((row) => row.boss.bossHits)),
  allReplaysVerified: true,
};

const notes = [
  `Classic survival: ${classicWins}/${COUNT}; forging eligibility: ${forged}/${COUNT}.`,
  `Boss success: ${bossWins}/${forged}; timeout losses: ${bossTimeouts}; other losses are collisions.`,
  bossWins === 0 && forged > 0
    ? 'The simple pursuit controller beat no generated Boss. Treat the 30-second budget, interception, and recovery window as a difficulty flag for human testing; this is not proof that any challenge is impossible.'
    : bossWins === forged && forged > 0
      ? 'Every generated Boss was beaten by this controller. This supports mechanical solvability for this sample, but may also indicate that interception is easy once the trajectory is known.'
      : 'The mixed Boss results warrant testing interception and recovery with people; one controller attempt cannot distinguish hard geometry from a weak strategy.',
  forged === COUNT
    ? 'All runs produced a shareable trajectory, so the current forge threshold is reachable by this collection policy.'
    : 'Some runs missed the forge threshold. Inspect their lights/time/distance before changing eligibility.',
  'No simulation state was patched. No controller tuning sweep or repeated attempts per seed was performed.',
];

const markdown = `# Bounded software balance probe

Generated: ${new Date().toISOString()}

Run with \`node scripts/balance-probe.mjs\`. This fixed probe plays 20 deterministic classic seeds once each, then makes one attempt against each Boss that those actual runs can forge. It uses only ordinary \`step(game, {x, y, dash})\` inputs. Every completed run is recomputed with \`runReplay\`, including an exact trajectory comparison.

These results are software balance signals. The controllers have exact positions, fixed 60 Hz decisions and short trajectory lookahead. They do not measure human enjoyment, control usability, retention or viral potential. Browser frame rate, rendering and network behaviour are outside this probe.

## Fixed policies

Classic: pursue the nearest reachable light; steer away from nearby echoes and walls; dash toward a close echo when ready; use early-game dashes to close large gaps to lights.

Boss: pursue a 150 ms future position; dash when the target is within 135 px; collect nearby lights during cooldown; steer away while recharging. This is a single basic pursuit policy, not a solver. No core balance values were changed.

## Summary

${notes.map((note) => `- ${note}`).join('\n')}

\`\`\`json
${JSON.stringify(summary, null, 2)}
\`\`\`

## Per-seed results

| Source seed suffix | Classic result | Seconds | Lights | Shatters | Score | Forge | Boss result | Boss hits / 9 | Boss seconds |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | ---: | ---: |
${rows.map(({ classic: c, forge, boss: b }) => `| ${c.seed.replace(PREFIX, '')} | ${c.phase} | ${c.seconds.toFixed(2)} | ${c.lights} | ${c.shatters} | ${c.score} | ${forge ? 'yes' : 'no'} | ${b ? `${b.phase} (${b.reason})` : '—'} | ${b?.bossHits ?? '—'} | ${b ? b.seconds.toFixed(2) : '—'} |`).join('\n')}

Full source seed prefix: \`${PREFIX}\`.

## Reproducible browser-flow sample

${sample ? `Source seed: \`${sample.source.seed}\`. Forge code comes from the actual live run, not a fabricated path. Both the source and Boss results below were recomputed from their recorded inputs. Append \`?boss=<code>\` to the game URL if that is the UI's challenge parameter.

\`\`\`text
${sample.code}
\`\`\`

\`\`\`json
${JSON.stringify(sample, null, 2)}
\`\`\`` : 'No eligible source run was produced.'}

## All verification records

Hashes are SHA-256 of the exact exported replay JSON, so rerunning the fixed script can check reproducibility without storing large companion files. Replay result metadata alone is not trusted: the script verifies it through the engine first.

\`\`\`json
${JSON.stringify(rows, null, 2)}
\`\`\`
`;
if (process.argv.includes('--write-demo') && demoReplay) {
  const module = '// Generated by scripts/balance-probe.mjs --write-demo from real step inputs. Scripted demo; not a human score.\nexport const demoReplay = ' + JSON.stringify(demoReplay) + ';\nexport const demoBossCode = ' + JSON.stringify(sample.code) + ';\n';
  await writeFile(new URL('../dist/demo-replay.js', import.meta.url), module);
} else {
  await writeFile(new URL('../docs/balance-probe.md', import.meta.url), markdown);
}
console.log(JSON.stringify({ summary, sample }, null, 2));
