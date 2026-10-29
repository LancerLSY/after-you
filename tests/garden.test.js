import test from 'node:test';
import assert from 'node:assert/strict';
import { createGarden, gardenOffers, placeGarden, gardenPreview, chooseGardenPerk, GARDEN_RULES, GARDEN_PERKS } from '../dist/lab/garden.js';

function fixture(cells = {}, { turn = 0, perks = [], seed = 'fixture', coins = 0 } = {}) {
  const game = createGarden(seed); game.turn = turn; game.perks = [...perks]; game.coins = coins;
  for (const [index, value] of Object.entries(cells)) game.board[index] = { kind: typeof value === 'string' ? value : value.kind, ticks: typeof value === 'string' ? 0 : value.ticks, id: game.nextId++ };
  return game;
}
function placeKind(game, kind, x, y) {
  const index = gardenOffers(game).indexOf(kind); assert.ok(index >= 0, `offer contains ${kind}`); return placeGarden(game, index, x, y);
}
function follow(seed, moves, perks) {
  let game = createGarden(seed), choice = 0;
  for (const [kind, x, y] of moves) {
    if (game.phase === 'perk') game = chooseGardenPerk(game, perks[choice++]);
    game = placeKind(game, kind, x, y);
  }
  return game;
}

test('the opening exposes Flower, Bee and Rain, and spatial placement changes Bee income', () => {
  let g = createGarden('opening'); assert.equal(g.board.length, 16); assert.equal(g.turn, 0);
  assert.equal(gardenOffers(g)[0], 'flower'); g = placeGarden(g, 0, 0, 0);
  assert.equal(g.lastGain, 1); assert.equal(gardenOffers(g)[0], 'bee');
  const near = placeGarden(g, 0, 1, 0), far = placeGarden(g, 0, 3, 3), corner = placeGarden(g, 0, 1, 1);
  assert.equal(near.lastGain, 4); assert.equal(far.lastGain, 2); assert.equal(corner.lastGain, 2);
  assert.equal(gardenOffers(near)[0], 'rain');
  const wet = placeGarden(near, 0, 0, 1); assert.equal(wet.lastGain, 5); assert.equal(wet.stats.repeats, 1);
});

test('Cat eats exactly one Fish after normal payouts and leaves that cell empty', () => {
  const game = fixture({ 0: 'fish', 2: 'fish' }, { turn: 1 });
  const next = placeKind(game, 'cat', 1, 0);
  assert.equal(next.lastGain, 12); assert.equal(next.stats.eaten, 1);
  assert.equal(next.board[0], null); assert.equal(next.board[2].kind, 'fish'); assert.equal(next.board[1].kind, 'cat');
  assert.equal(game.board[0].kind, 'fish', 'the old snapshot is unchanged');
  const remote = placeKind(game, 'cat', 3, 3); assert.equal(remote.lastGain, 4); assert.equal(remote.stats.eaten, 0);
});

test('Hens lay every three activations and newborn Eggs wait before their two-resolution hatch', () => {
  const game = fixture({ 0: { kind: 'hen', ticks: 2 } });
  const next = placeKind(game, 'flower', 3, 3), eggIndex = next.board.findIndex((c) => c?.kind === 'egg');
  assert.equal(next.lastGain, 2); assert.equal(next.stats.eggs, 1); assert.equal(next.board[eggIndex].ticks, 0);
  const second = placeKind(next, 'bee', 3, 2); assert.equal(second.board[eggIndex].kind, 'egg'); assert.equal(second.board[eggIndex].ticks, 1);
  const third = placeKind(second, 'rain', 2, 3); assert.equal(third.board[eggIndex].kind, 'hen'); assert.equal(third.stats.hatched, 1);
  assert.equal(third.events.filter((e) => e.kind === 'pay' && e.token === 'hen').length, 1, 'the newly hatched Hen starts paying next turn');
});

test('egg growth and Rain triggers are bounded, with no recursive rain or newborn activation', () => {
  const game = fixture({ 0: 'flower', 1: 'rain', 4: 'rain', 5: { kind: 'egg', ticks: 1 }, 10: 'rain' }, { turn: 2 });
  const next = placeKind(game, 'rain', 3, 3);
  assert.equal(next.stats.repeats, 2); assert.equal(next.lastGain, 3); assert.equal(next.board[5].kind, 'hen');
  assert.equal(next.events.filter((e) => e.kind === 'repeat').length, 2);
  assert.ok(next.events.length < 20);
  const dense = fixture(Object.fromEntries(Array.from({ length: 15 }, (_, i) => [i, i % 2 ? 'rain' : 'flower'])), { turn: 2, perks: ['diagonals', 'rain_bees'] });
  const crowded = placeKind(dense, 'rain', 3, 3);
  assert.ok(crowded.stats.repeats <= 16 * 8); assert.ok(crowded.events.length <= 16 * 9);
});

test('Hens reserve cells for all remaining placements instead of filling the board', () => {
  const cells = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [i, { kind: 'hen', ticks: 2 }]));
  const game = fixture(cells);
  const next = placeKind(game, 'flower', 3, 3);
  assert.equal(next.board.filter((c) => !c).length, 10);
  assert.equal(next.stats.eggs, 0); assert.equal(next.events.filter((e) => e.kind === 'nest_full').length, 5);
});

test('Fire pays for consumed Trees, leaves Ash, and neighboring Rain turns Ash into next-turn Flowers', () => {
  const game = fixture({ 0: 'tree', 2: 'tree', 4: 'rain', 1: 'fire' });
  const next = placeKind(game, 'flower', 3, 3);
  assert.equal(next.lastGain, 15); assert.equal(next.stats.burned, 1);
  assert.equal(next.board[0].kind, 'flower'); assert.equal(next.board[2].kind, 'tree');
  assert.equal(next.events.filter((e) => e.kind === 'repeat').length, 0, 'new Flowers do not receive a same-turn Rain payout');
  const dry = fixture({ 0: 'tree', 1: 'fire' });
  assert.equal(placeKind(dry, 'flower', 3, 3).board[0].kind, 'ash');
});

test('all five rule perks materially alter board behavior or resolution output', () => {
  assert.equal(Object.keys(GARDEN_PERKS).length, 5);
  const corner = fixture({ 0: 'flower' }, { turn: 1 });
  assert.equal(placeKind({ ...corner, perks: ['diagonals'] }, 'bee', 1, 1).lastGain - placeKind(corner, 'bee', 1, 1).lastGain, 2);
  const bees = fixture({ 0: 'flower', 1: 'bee' }, { turn: 2 });
  const dry = placeKind(bees, 'rain', 1, 1), wet = placeKind({ ...bees, perks: ['rain_bees'] }, 'rain', 1, 1);
  assert.equal(wet.lastGain - dry.lastGain, 3);
  const food = fixture({ 0: 'fish' }, { turn: 1 });
  assert.equal(placeKind(food, 'cat', 1, 0).board[0], null);
  const compost = placeKind({ ...food, perks: ['scraps'] }, 'cat', 1, 0);
  assert.ok(['flower', 'tree'].includes(compost.board[0].kind)); assert.equal(compost.lastGain, 10);
  assert.deepEqual(compost, placeKind({ ...food, perks: ['scraps'] }, 'cat', 1, 0));
  const wood = fixture({ 0: 'tree', 1: 'fire', 2: 'tree' });
  assert.equal(placeKind({ ...wood, perks: ['wildfire'] }, 'flower', 3, 3).lastGain - placeKind(wood, 'flower', 3, 3).lastGain, 12);
  const eggs = fixture({ 0: 'egg' });
  assert.equal(placeKind(eggs, 'flower', 3, 3).board[0].kind, 'egg');
  assert.equal(placeKind({ ...eggs, perks: ['warm_nest'] }, 'flower', 3, 3).board[0].kind, 'hen');
});

test('three distinct permanent perk choices appear only after rent, and cannot be selected twice', () => {
  let game = createGarden('mint-1');
  for (const [kind, x, y] of [['flower', 0, 0], ['bee', 1, 0], ['rain', 0, 1], ['hen', 3, 3]]) game = placeKind(game, kind, x, y);
  assert.equal(game.phase, 'perk'); assert.equal(game.lastRent.paid, true); assert.equal(game.perkChoices.length, 3);
  assert.equal(new Set(game.perkChoices).size, 3); assert.deepEqual(gardenOffers(game), []);
  assert.strictEqual(chooseGardenPerk(game, 'unknown'), game);
  const id = game.perkChoices[0], next = chooseGardenPerk(game, id);
  assert.equal(next.phase, 'playing'); assert.deepEqual(next.perks, [id]); assert.equal(gardenOffers(next).length, 3);
  assert.deepEqual(game.perks, []); assert.strictEqual(chooseGardenPerk(next, id), next);
});

test('seeded drafts vary after the guided opening and the same seed reproduces every result', () => {
  const a = fixture({}, { turn: 5, seed: 'a' }), b = fixture({}, { turn: 5, seed: 'b' });
  assert.deepEqual(gardenOffers(a), gardenOffers({ ...createGarden('a'), turn: 5 }));
  assert.notDeepEqual(gardenOffers(a), gardenOffers(b));
  for (let turn = 4; turn < 12; turn++) {
    const offers = gardenOffers({ ...a, turn }); assert.equal(offers.length, 3); assert.equal(new Set(offers).size, 3);
  }
  const moves = [['flower',0,0],['bee',1,0],['fish',2,0],['hen',3,3],['cat',2,1],['fish',1,1],['bee',0,1],['flower',0,2],['bee',1,2],['bee',0,3],['flower',1,3],['fish',2,2]];
  const first = follow('mint-1', moves, ['scraps', 'warm_nest']), second = follow('mint-1', moves, ['scraps', 'warm_nest']);
  assert.deepEqual(first, second); assert.equal(first.totalEarned, 217);
});

test('a valid build wins exactly on placement 12, pays all rents, and cannot make a thirteenth move', () => {
  const moves = [['flower',0,0],['bee',1,0],['fish',2,0],['hen',3,3],['cat',2,1],['fish',1,1],['bee',0,1],['flower',0,2],['bee',1,2],['bee',0,3],['flower',1,3],['fish',2,2]];
  const game = follow('mint-1', moves, ['scraps', 'warm_nest']);
  assert.equal(game.turn, GARDEN_RULES.turns); assert.equal(game.phase, 'won'); assert.equal(game.history.length, 12);
  assert.deepEqual(game.history.filter((h) => h.rent).map((h) => h.rent.due), [12, 35, 70]);
  assert.equal(game.coins, game.totalEarned - 12 - 35 - 70); assert.strictEqual(placeGarden(game, 0, 3, 0), game);
});

test('missing a rent loses immediately and insufficient final rent never produces a win', () => {
  const early = fixture({}, { turn: 3, seed: 'rent' });
  const first = placeGarden(early, 0, 0, 0); assert.equal(first.turn, 4); assert.equal(first.phase, 'lost'); assert.equal(first.lastRent.paid, false);
  assert.strictEqual(placeGarden(first, 0, 1, 0), first);
  const final = fixture({}, { turn: 11, coins: 0, seed: 'rent' });
  const last = placeGarden(final, 0, 0, 0); assert.equal(last.turn, 12); assert.equal(last.phase, 'lost'); assert.equal(last.lastRent.due, 70);
});

test('previews exactly match commits without mutation; invalid inputs return the original object', () => {
  const game = fixture({ 0: 'flower' }, { turn: 1 }); const before = JSON.stringify(game);
  const preview = gardenPreview(game, 0, 1, 0), next = placeGarden(game, 0, 1, 0);
  assert.equal(preview.valid, true); assert.equal(preview.gained, next.lastGain); assert.equal(preview.coins, next.coins);
  assert.deepEqual(preview.board, next.board); assert.deepEqual(preview.events, next.events); assert.equal(JSON.stringify(game), before);
  for (const args of [[0,0,0],[-1,1,1],[3,1,1],[0,-1,1],[0,4,1],[0,1,4],[0,0.5,1],[0,NaN,1],['0',1,1]]) {
    assert.strictEqual(placeGarden(game, ...args), game); assert.deepEqual(gardenPreview(game, ...args), { valid: false });
  }
  assert.equal(JSON.stringify(game), before);
});
