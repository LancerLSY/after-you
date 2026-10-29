import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createRush, stepRush, chooseRushUpgrade, exportRushReplay, runRushReplay } from '../dist/rush.js';

/** One bounded, ordinary-input interception policy; not a proxy for human fun. */
export function rushProbeInput(game) {
  const player = game.player;
  const active = game.targets.filter((target) => target.warningUntil <= game.worldTime);
  const ordered = [...active].sort((a, b) => Math.hypot(a.x - player.x, a.y - player.y) - Math.hypot(b.x - player.x, b.y - player.y));
  const target = game.nemesis?.alive && game.worldTime >= game.nemesis.warningUntil ? game.nemesis : ordered[0];
  let x = 0, y = 0, fire = false, aimX = game.aim.x, aimY = game.aim.y;
  if (target) {
    const vx = target._previous ? (target.x - target._previous.x) * 60 : 0;
    const vy = target._previous ? (target.y - target._previous.y) * 60 : 0;
    const distance = Math.hypot(target.x - player.x, target.y - player.y);
    const lead = Math.min(0.12, distance / 1250);
    aimX = target.x + vx * lead; aimY = target.y + vy * lead;
    const aimedDistance = Math.hypot(aimX - player.x, aimY - player.y);
    x = (aimX - player.x) / Math.max(1, aimedDistance); y = (aimY - player.y) / Math.max(1, aimedDistance);
    fire = !game._dash && player.dashCooldown <= 1 / 60 && aimedDistance < 245;
  }
  if (game._dash) { x = 0; y = 0; fire = false; }
  else if (!fire) {
    for (const enemy of active) {
      const dx = player.x - enemy.x, dy = player.y - enemy.y, distance = Math.hypot(dx, dy);
      if (distance < 110) { x += dx / Math.max(1, distance) * (110 - distance) / 25; y += dy / Math.max(1, distance) * (110 - distance) / 25; }
    }
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
  }
  return { aimX, aimY, moveX: x, moveY: y, fire };
}

export function playRushProbe(seed, upgrades = ['relay', 'burst']) {
  const game = createRush(seed);
  let maxTargets = game.targets.length;
  for (let tick = 0; tick < 2160 && game.phase !== 'won' && game.phase !== 'lost'; tick += 1) {
    if (game.phase === 'choosing') chooseRushUpgrade(game, upgrades[game.upgrades.length]);
    stepRush(game, rushProbeInput(game));
    maxTargets = Math.max(maxTargets, game.targets.length);
  }
  return { game, maxTargets };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const rows = [];
  for (const upgrades of [['relay', 'burst'], ['ricochet', 'burst'], ['relay', 'prune']]) {
    for (let seed = 0; seed < 3; seed += 1) {
      const { game, maxTargets } = playRushProbe(`rush-probe-${seed}`, upgrades);
      const replay = exportRushReplay(game), checked = runRushReplay(replay);
      if (JSON.stringify(exportRushReplay(checked)) !== JSON.stringify(replay)) throw new Error('Rush probe replay differs.');
      rows.push({ seed: game.seed, upgrades, phase: game.phase, seconds: game.time, hp: game.player.hp,
        kills: game.stats.kills, dashes: game.stats.dashes, combo: game.bestCombo, relayHits: game.stats.relayHits,
        burstHits: game.stats.burstHits, pruned: game.stats.pruned, nemesisHp: game.nemesis?.hp, maxTargets, replayVerified: true });
    }
  }
  console.log(JSON.stringify({ note: 'Nine fixed bot runs, no policy sweep; software feasibility only.', rows }, null, 2));
}
