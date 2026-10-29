import test from 'node:test';
import assert from 'node:assert/strict';
import {runReplay} from '../dist/engine.js';
import {decodeBoss} from '../dist/boss-codec.js';
import {demoReplay,demoBossCode} from '../dist/demo-replay.js';

test('scripted demo is a genuine winning input replay for the displayed boss',()=>{
  const game=runReplay(demoReplay);
  assert.equal(game.mode,'boss');
  assert.equal(game.phase,'won');
  assert.equal(game.stats.bossHits,9);
  assert.ok(game.time<=30);
  assert.equal(game.score,demoReplay.result.score);
  assert.equal(game.player.hp,demoReplay.result.hp);
  assert.equal(game.seed,decodeBoss(demoBossCode).seed);
});
