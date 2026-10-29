// Every move returns a new snapshot. Invalid moves return the original snapshot.
export const GARDEN_RULES = Object.freeze({ size: 4, turns: 12, rents: [12, 35, 70] });
export const GARDEN_TOKENS = Object.freeze({
  flower: { icon: '🌼', en: 'Flower', zh: '花', effect: ['Pays 1 coin every resolution.', '每次结算获得 1 金币。'] },
  bee: { icon: '🐝', en: 'Bee', zh: '蜜蜂', effect: ['Pays 1 + 2 per adjacent Flower.', '获得 1 金币，每朵相邻的花再加 2。'] },
  rain: { icon: '🌧️', en: 'Rain', zh: '雨', effect: ['Repeats each adjacent Flower once. Rain never repeats Rain.', '每朵相邻的花额外结算一次。雨不会触发雨。'] },
  cat: { icon: '🐈', en: 'Cat', zh: '猫', effect: ['Eats one adjacent Fish for 8 coins, leaving its cell empty.', '吃掉一条相邻的鱼，获得 8 金币，鱼的位置空出。'] },
  fish: { icon: '🐟', en: 'Fish', zh: '鱼', effect: ['Pays 2 coins; food for a neighboring Cat.', '每次获得 2 金币，也能被相邻的猫吃掉。'] },
  hen: { icon: '🐔', en: 'Hen', zh: '母鸡', effect: ['Pays 1. Every 3 resolutions, lays an Egg in a free neighboring cell.', '每次获得 1 金币；每结算 3 次，在相邻空格产一枚蛋。'] },
  egg: { icon: '🥚', en: 'Egg', zh: '蛋', effect: ['Hatches into a Hen after 2 resolutions. Newly laid Eggs wait until next turn.', '经过 2 次结算变成母鸡。新产的蛋从下回合开始计时。'] },
  fire: { icon: '🔥', en: 'Fire', zh: '火', effect: ['Burns one adjacent Tree for 12 coins and leaves Ash.', '烧掉一棵相邻的树，获得 12 金币，并留下灰烬。'] },
  tree: { icon: '🌳', en: 'Tree', zh: '树', effect: ['Pays 1 coin; a neighboring Fire can burn it.', '每次获得 1 金币；相邻的火能烧掉它。'] },
  ash: { icon: '🌱', en: 'Ash', zh: '灰烬', effect: ['Next to Rain, becomes a Flower after payouts.', '与雨相邻时，在收入结算后变成花。'] },
});
export const GARDEN_PERKS = Object.freeze({
  diagonals: { icon: '↗', en: 'Corner paths', zh: '斜角小径', effect: ['All effects also reach diagonal neighbors.', '所有相邻效果也能到达对角格。'] },
  rain_bees: { icon: '🐝', en: 'Dancing rain', zh: '雨中蜜舞', effect: ['Rain also repeats adjacent Bees once, including their Flower bonus.', '雨也会让相邻蜜蜂额外结算一次，包含花朵加成。'] },
  scraps: { icon: '🌱', en: 'Seed scraps', zh: '鱼骨育苗', effect: ['Each eaten Fish leaves a seeded Flower or Tree in its cell after payouts.', '鱼被吃掉后，该格在收入结算后长出由种子决定的花或树。'] },
  wildfire: { icon: '🔥', en: 'Twin flame', zh: '双生火焰', effect: ['Each Fire can burn two neighboring Trees per resolution.', '每团火每次最多烧掉两棵相邻的树。'] },
  warm_nest: { icon: '🥚', en: 'Warm nest', zh: '温暖小窝', effect: ['Eggs hatch after 1 resolution instead of 2.', '蛋经过 1 次结算就能孵化。'] },
});
const OPENING = [['flower', 'fish', 'tree'], ['bee', 'cat', 'hen'], ['rain', 'fish', 'egg']];
const EARLY = ['flower', 'bee', 'rain', 'cat', 'fish', 'hen', 'egg'];
const ALL = Object.keys(GARDEN_TOKENS);
const hash = (value) => { let n = 2166136261; for (const c of String(value)) { n ^= c.charCodeAt(0); n = Math.imul(n, 16777619); } return n >>> 0; };
function seededOrder(items, seed) {
  let n = hash(seed); const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { n = (Math.imul(n, 1664525) + 1013904223) >>> 0; const j = n % (i + 1); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function gardenOffers(game) {
  if (game.phase !== 'playing') return [];
  return game.turn < 3 ? [...OPENING[game.turn]] : seededOrder(game.turn < 4 ? EARLY : ALL, `${game.seed}:offer:${game.turn}`).slice(0, 3);
}
export function createGarden(seed = 'mint-1') {
  const game = { seed: String(seed).slice(0, 80) || 'mint-1', turn: 0, round: 1, coins: 0, totalEarned: 0,
    board: Array(16).fill(null), nextId: 1, phase: 'playing', perks: [], perkChoices: [], events: [], highlights: [], history: [],
    lastGain: 0, lastRent: null, stats: { placed: {}, eaten: 0, burned: 0, eggs: 0, hatched: 0, repeats: 0 } };
  game.offers = gardenOffers(game); return game;
}
function neighbors(game, index) {
  const x = index % 4, y = Math.floor(index / 4), diagonal = game.perks.includes('diagonals');
  return game.board.map((_, i) => i).filter((i) => {
    const dx = Math.abs(i % 4 - x), dy = Math.abs(Math.floor(i / 4) - y);
    return i !== index && (diagonal ? Math.max(dx, dy) === 1 : dx + dy === 1);
  });
}
function copyGame(game) {
  return { ...game, board: game.board.map((cell) => cell && { ...cell }), perks: [...game.perks], history: [...game.history],
    stats: { ...game.stats, placed: { ...game.stats.placed } }, events: [], highlights: [], lastRent: null };
}
function token(game, kind) { return { kind, ticks: 0, id: game.nextId++ }; }
function resolve(game) {
  const starters = game.board.map((cell, i) => cell && { ...cell, i }).filter(Boolean), scraps = [];
  const event = (kind, cells, amount = 0, extra = {}) => {
    game.coins += amount; game.lastGain += amount;
    game.events.push({ kind, cells, amount, ...extra }); game.highlights.push(...cells);
  };
  const payout = (i, repeated = false, source = null) => {
    const cell = game.board[i]; if (!cell) return;
    let amount = { flower: 1, bee: 1, fish: 2, hen: 1, tree: 1 }[cell.kind] || 0;
    const flowers = cell.kind === 'bee' ? neighbors(game, i).filter((j) => game.board[j]?.kind === 'flower') : [];
    amount += flowers.length * 2;
    if (amount) event(repeated ? 'repeat' : 'pay', [i, ...flowers, ...(source === null ? [] : [source])], amount, { token: cell.kind, flowers: flowers.length });
  };
  // Everyone receives their normal payout before consumers change the board.
  for (const cell of starters) payout(cell.i);
  for (const cell of starters) {
    if (cell.kind === 'cat') {
      const food = neighbors(game, cell.i).find((i) => game.board[i]?.kind === 'fish');
      if (food !== undefined) { game.board[food] = null; event('eat', [cell.i, food], 8); game.stats.eaten++; scraps.push(food); }
    }
    if (cell.kind === 'fire') {
      const trees = neighbors(game, cell.i).filter((i) => game.board[i]?.kind === 'tree').slice(0, game.perks.includes('wildfire') ? 2 : 1);
      for (const i of trees) { game.board[i] = token(game, 'ash'); event('burn', [cell.i, i], 12); game.stats.burned++; }
    }
  }
  for (const cell of starters.filter((c) => c.kind === 'rain')) {
    for (const i of neighbors(game, cell.i)) {
      if (game.board[i]?.kind === 'flower' || (game.perks.includes('rain_bees') && game.board[i]?.kind === 'bee')) {
        payout(i, true, cell.i); game.stats.repeats++;
      }
    }
  }
  for (let i = 0; i < 16; i++) {
    if (game.board[i]?.kind === 'ash' && neighbors(game, i).some((j) => game.board[j]?.kind === 'rain')) {
      game.board[i] = token(game, 'flower'); event('bloom', [i]);
    }
  }
  if (game.perks.includes('scraps')) for (const i of scraps) {
    const kind = hash(`${game.seed}:scrap:${game.turn}:${i}`) % 2 ? 'flower' : 'tree';
    game.board[i] = token(game, kind); event('scrap', [i], 0, { token: kind });
  }
  for (const cell of starters) {
    if (game.board[cell.i]?.id !== cell.id) continue;
    const current = game.board[cell.i];
    if (cell.kind === 'egg') {
      current.ticks++;
      if (current.ticks >= (game.perks.includes('warm_nest') ? 1 : 2)) {
        game.board[cell.i] = token(game, 'hen'); event('hatch', [cell.i]); game.stats.hatched++;
      }
    }
    if (cell.kind === 'hen') {
      current.ticks++;
      if (current.ticks % 3 === 0) {
        const free = game.board.filter((c) => !c).length;
        const target = neighbors(game, cell.i).find((i) => !game.board[i]);
        // Keep enough cells for every remaining draft, including a Hen-heavy build.
        if (target !== undefined && free > GARDEN_RULES.turns - game.turn) {
          game.board[target] = token(game, 'egg'); event('lay', [cell.i, target]); game.stats.eggs++;
        } else event('nest_full', [cell.i]);
      }
    }
  }
  game.highlights = [...new Set(game.highlights)]; game.totalEarned += game.lastGain;
}
export function placeGarden(game, offerIndex, x, y) {
  if (game.phase !== 'playing' || !Number.isInteger(offerIndex) || offerIndex < 0 || offerIndex > 2 ||
    !Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 3 || y < 0 || y > 3 || game.board[y * 4 + x]) return game;
  const kind = gardenOffers(game)[offerIndex]; if (!kind || game.turn >= 12) return game;
  const next = copyGame(game), index = y * 4 + x;
  next.turn++; next.lastGain = 0; next.board[index] = token(next, kind); next.stats.placed[kind] = (next.stats.placed[kind] || 0) + 1;
  resolve(next);
  if (next.turn % 4 === 0) {
    const round = next.turn / 4, due = GARDEN_RULES.rents[round - 1], paid = next.coins >= due;
    next.lastRent = { round, due, paid };
    next.events.push({ kind: paid ? 'rent' : 'short', amount: due, cells: [] });
    if (!paid) next.phase = 'lost';
    else { next.coins -= due; next.phase = next.turn === 12 ? 'won' : 'perk'; }
    if (next.phase === 'perk') next.perkChoices = seededOrder(Object.keys(GARDEN_PERKS).filter((id) => !next.perks.includes(id)), `${next.seed}:perk:${round}`).slice(0, 3);
  }
  next.round = Math.min(3, Math.floor(next.turn / 4) + 1);
  next.history.push({ turn: next.turn, kind, x, y, gained: next.lastGain, rent: next.lastRent, coins: next.coins });
  next.offers = gardenOffers(next); return next;
}
export function gardenPreview(game, offerIndex, x, y) {
  const next = placeGarden(game, offerIndex, x, y);
  return next === game ? { valid: false } : { valid: true, coins: next.coins, gained: next.lastGain, rent: next.lastRent,
    phase: next.phase, board: next.board, events: next.events, highlights: next.highlights };
}
export function chooseGardenPerk(game, id) {
  if (game.phase !== 'perk' || !game.perkChoices.includes(id) || game.perks.includes(id)) return game;
  const next = { ...game, perks: [...game.perks, id], phase: 'playing', perkChoices: [] };
  next.offers = gardenOffers(next); return next;
}

const COPY = {
  en: { title: 'Pocket Garden', sub: '12 pieces. One growing money machine.', exit: 'Back to the lab', language: '中文',
    how: 'Pick a piece → tap an empty cell. The whole garden pays after every placement.', orthogonal: 'Neighbors share an edge.', diagonal: 'Neighbors share an edge or corner.',
    order: 'Order: normal income → Cat / Fire → Rain → growth. Pieces and tied targets resolve from top left to bottom right. Each Rain repeats each eligible neighbor once. New plants and babies pay from the next turn.',
    reserve: 'Hens keep enough empty cells for your remaining placements. If a nest is full, that laying is skipped.',
    round: 'Round', turn: 'Placed', bank: 'Bank', due: 'Rent due', in: 'in', moves: 'placements', earned: 'Total earned', local: 'Local best',
    choose: '1 · Choose a piece', place: '2 · Place it', selected: 'Selected', hover: 'Hover or focus an empty cell to preview its income. Tap a cell to place.',
    preview: 'Preview', gain: 'income', after: 'bank after rent', full: 'Occupied', empty: 'Empty cell', progress: 'growth',
    log: 'Last resolution', first: 'Flowers pay every turn. Put a Bee beside a Flower, then add Rain beside that Flower.',
    perk: 'Rent paid. Change the rules.', perkSub: 'Choose one lasting rule for the rest of this garden.',
    won: 'Your garden paid every rent.', lost: 'This garden missed the rent.', needed: 'Needed', result: 'Exact build',
    restart: 'Same seed', random: 'New seed', seed: 'Seed', load: 'Play seed', share: 'Copy seed link', copied: 'Link copied',
    rules: 'Piece guide & resolution rules', perks: 'Your rules', none: 'No rule changes yet', summary: 'Placed pieces',
    pay: 'pays', repeat: 'Rain repeats', eat: 'Cat eats Fish', burn: 'Fire burns Tree → Ash', bloom: 'Ash + Rain → Flower',
    scrap: 'Fish scraps grow', hatch: 'Egg → Hen', lay: 'Hen lays Egg', nest_full: 'Hen: no safe nest space', rent: 'Rent paid', short: 'Rent not paid',
  },
  zh: { title: '组合花园', sub: '12 次放置，搭出你的金币生态。', exit: '返回实验室', language: 'English',
    how: '选棋子 → 点空格。每放一枚，整座花园结算一次。', orthogonal: '相邻指上下左右。', diagonal: '相邻包括上下左右和对角。',
    order: '结算顺序：基础收入 → 猫 / 火 → 雨 → 生长。棋子及多个可选目标按从上到下、从左到右的顺序结算。每团雨对每个可触发邻居只触发一次。新长出的植物和幼崽从下回合开始产出。',
    reserve: '母鸡会为剩余放置保留空格。没有安全空位时，跳过本次产蛋。',
    round: '阶段', turn: '已放置', bank: '金币', due: '本阶段租金', in: '还剩', moves: '次放置', earned: '累计收入', local: '本机最佳',
    choose: '1 · 选一枚棋子', place: '2 · 放入花园', selected: '已选', hover: '鼠标移到空格或用键盘聚焦可预览收入；点击格子即放置。',
    preview: '预览', gain: '收入', after: '付租后剩余', full: '已占用', empty: '空格', progress: '生长',
    log: '本次结算', first: '花每回合都会产出。把蜜蜂放在花旁边，再把雨放在同一朵花旁边。',
    perk: '租金已付，选一条新规则。', perkSub: '选一项，效果持续到这局结束。',
    won: '花园付清了全部租金。', lost: '这座花园没能付出租金。', needed: '所需租金', result: '本局构筑',
    restart: '重试同一种子', random: '换个种子', seed: '种子', load: '使用种子', share: '复制种子链接', copied: '链接已复制',
    rules: '棋子图鉴与结算规则', perks: '已选规则', none: '尚未改变规则', summary: '放置记录',
    pay: '产出', repeat: '雨再次触发', eat: '猫吃掉鱼', burn: '火烧树 → 灰烬', bloom: '灰烬 + 雨 → 花',
    scrap: '鱼骨长出', hatch: '蛋 → 母鸡', lay: '母鸡产蛋', nest_full: '母鸡：无安全产蛋空位', rent: '支付租金', short: '租金不足',
  },
};
const storageGet = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const storageSet = (key, value) => { try { localStorage.setItem(key, value); } catch { /* A private browser can still play. */ } };
export function mountGarden(root, { onExit } = {}) {
  const locale = storageGet('afteryou-garden-lang');
  let lang = locale === 'zh' || locale === 'en' ? locale : (globalThis.navigator?.language?.startsWith('zh') ? 'zh' : 'en');
  const url = new URL(globalThis.location?.href || 'https://local.invalid/');
  let game = createGarden(url.searchParams.get('gardenSeed') || url.searchParams.get('seed') || new URLSearchParams(url.hash.slice(1)).get('garden') || 'mint-1');
  let selected = 0, preview = null, disposed = false;
  const text = (key) => COPY[lang][key], name = (kind) => GARDEN_TOKENS[kind][lang];
  const description = (item) => item.effect[lang === 'zh' ? 1 : 0];
  const el = (tag, cls, value) => { const node = document.createElement(tag); if (cls) node.className = cls; if (value !== undefined) node.textContent = value; return node; };
  const button = (label, cls, action) => { const node = el('button', cls, label); node.type = 'button'; node.addEventListener('click', action); return node; };
  function seedUrl() { const next = new URL(globalThis.location?.href || 'https://local.invalid/'); next.searchParams.set('gardenSeed', game.seed); return next; }
  function rememberSeed() { try { history.replaceState(null, '', seedUrl()); } catch { /* Embedded demos may disallow address edits. */ } }
  function restart(seed) { game = createGarden(seed); selected = 0; preview = null; rememberSeed(); render(); }
  function randomSeed() { return globalThis.crypto?.randomUUID?.().slice(0, 8) || Math.random().toString(36).slice(2, 10); }
  function formatEvent(event) {
    const amount = event.amount ? ` ${event.kind === 'rent' || event.kind === 'short' ? '−' : '+'}${event.amount}` : '';
    if (event.kind === 'pay') return `${GARDEN_TOKENS[event.token].icon} ${name(event.token)} ${text('pay')}${amount}${event.flowers ? ` (${GARDEN_TOKENS.flower.icon}×${event.flowers})` : ''}`;
    if (event.kind === 'repeat') return `${text('repeat')} ${GARDEN_TOKENS[event.token].icon}${amount}`;
    return `${text(event.kind)}${event.token ? ` ${GARDEN_TOKENS[event.token].icon}` : ''}${amount}`;
  }
  function renderPreview() {
    const node = root.querySelector('.garden-preview'); if (!node) return;
    node.textContent = preview?.valid ? `${text('preview')}: +${preview.gained} ${text('gain')}${preview.rent ? ` · ${preview.rent.paid ? '✓' : '✕'} ${text('due')} ${preview.rent.due} · ${text('after')} ${preview.coins}` : ''}` : text('hover');
    for (const cell of root.querySelectorAll('.garden-cell')) {
      const index = Number(cell.dataset.index); cell.classList.toggle('garden-cell-preview', Boolean(preview?.highlights?.includes(index)));
    }
  }
  function render() {
    if (disposed) return;
    const best = Math.max(Number(storageGet('afteryou-garden-best')) || 0, game.totalEarned);
    if (game.phase === 'won' || game.phase === 'lost') storageSet('afteryou-garden-best', String(best));
    root.replaceChildren(); root.classList.add('garden-root');
    const wrap = el('section', 'garden-game'), header = el('header', 'garden-header'), title = el('div');
    title.append(el('h1', '', `🌱 ${text('title')}`), el('p', 'garden-subtitle', text('sub')));
    const nav = el('div', 'garden-nav'); if (onExit) nav.append(button(text('exit'), 'garden-button garden-quiet', onExit));
    nav.append(button(text('language'), 'garden-button garden-quiet', () => { lang = lang === 'en' ? 'zh' : 'en'; storageSet('afteryou-garden-lang', lang); render(); }));
    header.append(title, nav); wrap.append(header, el('p', 'garden-instructions', text('how')));
    const stats = el('div', 'garden-stats');
    for (const [label, value] of [[text('round'), `${game.round}/3`], [text('turn'), `${game.turn}/12`], [text('bank'), `🪙 ${game.coins}`], [text('due'), `${GARDEN_RULES.rents[game.round - 1]}`]]) {
      const stat = el('div', 'garden-stat'); stat.append(el('span', '', label), el('strong', '', value)); stats.append(stat);
    }
    wrap.append(stats);
    if (game.phase === 'playing') wrap.append(el('p', 'garden-rent-line', `${text('due')}: 🪙 ${GARDEN_RULES.rents[game.round - 1]} · ${text('in')} ${4 - game.turn % 4} ${text('moves')}`));
    const layout = el('div', 'garden-layout'), play = el('div', game.phase === 'playing' ? 'garden-play' : 'garden-play garden-no-draft'), aside = el('aside', 'garden-aside');
    const draft = el('section', 'garden-draft'), table = el('section', 'garden-table');
    if (game.phase === 'playing') {
      draft.append(el('h2', '', text('choose'))); const offers = el('div', 'garden-offers');
      gardenOffers(game).forEach((kind, index) => {
        const offer = button('', `garden-offer${index === selected ? ' garden-selected' : ''}`, () => { selected = index; preview = null; render(); });
        offer.setAttribute('aria-pressed', String(index === selected)); offer.append(el('span', 'garden-offer-icon', GARDEN_TOKENS[kind].icon), el('strong', '', name(kind)), el('span', 'garden-offer-effect', description(GARDEN_TOKENS[kind]))); offers.append(offer);
      }); draft.append(offers);
      const chosen = gardenOffers(game)[selected];
      draft.append(el('p', 'garden-selected-help', `${text('selected')}: ${GARDEN_TOKENS[chosen].icon} ${name(chosen)} — ${description(GARDEN_TOKENS[chosen])}`));
    }
    table.append(el('h2', '', text('place')), el('p', 'garden-adjacency', text(game.perks.includes('diagonals') ? 'diagonal' : 'orthogonal')));
    const board = el('div', 'garden-board'); board.setAttribute('role', 'group'); board.setAttribute('aria-label', text('title'));
    game.board.forEach((cell, index) => {
      const combo = game.events.some((event) => !['pay', 'rent', 'short', 'nest_full'].includes(event.kind) && event.cells.includes(index));
      const b = button('', `garden-cell${cell ? ' garden-occupied' : ''}${game.highlights.includes(index) ? ' garden-cell-active' : ''}${combo ? ' garden-cell-combo' : ''}`, () => {
        const next = placeGarden(game, selected, index % 4, Math.floor(index / 4));
        if (next !== game) { game = next; selected = 0; preview = null; render(); }
      });
      b.dataset.index = String(index); b.append(el('span', 'garden-cell-token', cell ? GARDEN_TOKENS[cell.kind].icon : '+'));
      if (cell) b.append(el('small', 'garden-cell-name', name(cell.kind)));
      const earned = game.events.filter((event) => event.cells[0] === index && !['rent', 'short'].includes(event.kind)).reduce((sum, event) => sum + event.amount, 0);
      if (earned) b.append(el('small', 'garden-cell-income', `+${earned}`));
      if (cell && (cell.kind === 'hen' || cell.kind === 'egg')) b.append(el('small', 'garden-cell-growth', `${cell.ticks % (cell.kind === 'hen' ? 3 : 2)}/${cell.kind === 'hen' ? 3 : game.perks.includes('warm_nest') ? 1 : 2}`));
      b.setAttribute('aria-label', `${index % 4 + 1}, ${Math.floor(index / 4) + 1}: ${cell ? `${name(cell.kind)}; ${description(GARDEN_TOKENS[cell.kind])}` : text('empty')}`);
      if (cell) b.title = description(GARDEN_TOKENS[cell.kind]);
      b.setAttribute('aria-disabled', String(Boolean(cell) || game.phase !== 'playing'));
      if (!cell && game.phase === 'playing') {
        const show = () => { preview = gardenPreview(game, selected, index % 4, Math.floor(index / 4)); renderPreview(); };
        const hide = () => { preview = null; renderPreview(); };
        b.addEventListener('mouseenter', show); b.addEventListener('focus', show); b.addEventListener('mouseleave', hide); b.addEventListener('blur', hide);
      }
      board.append(b);
    }); table.append(board);
    const previewNode = el('p', 'garden-preview', game.phase === 'playing' ? text('hover') : `+${game.lastGain} ${text('gain')}`); previewNode.setAttribute('aria-live', 'polite'); table.append(previewNode); play.append(draft, table);
    if (game.phase === 'perk') {
      const panel = el('section', 'garden-perk-panel'); panel.append(el('h2', '', text('perk')), el('p', '', text('perkSub')));
      for (const id of game.perkChoices) {
        const item = GARDEN_PERKS[id], choice = button('', 'garden-perk garden-button', () => { game = chooseGardenPerk(game, id); render(); });
        choice.append(el('strong', '', `${item.icon} ${item[lang]}`), el('span', '', description(item))); panel.append(choice);
      } play.append(panel);
    }
    if (game.phase === 'won' || game.phase === 'lost') {
      const end = el('section', `garden-end garden-${game.phase}`); end.setAttribute('aria-live', 'polite'); end.append(el('h2', '', text(game.phase)), el('p', '', `${text('earned')}: ${game.totalEarned} · ${text('bank')}: ${game.coins} · ${text('turn')}: ${game.turn}/12`));
      if (game.phase === 'lost') end.append(el('p', '', `${text('needed')}: ${game.lastRent.due} · ${text('bank')}: ${game.coins}`));
      end.append(button(text('restart'), 'garden-button', () => restart(game.seed)), button(text('random'), 'garden-button', () => restart(randomSeed())));
      end.append(el('h3', '', text('result')), el('p', '', `${text('seed')}: ${game.seed}`), el('p', '', `${text('summary')}: ${Object.entries(game.stats.placed).map(([kind, count]) => `${GARDEN_TOKENS[kind].icon} ${name(kind)} ×${count}`).join(' · ')}`));
      end.append(el('p', '', `${text('perks')}: ${game.perks.map((id) => GARDEN_PERKS[id][lang]).join(' · ') || text('none')}`));
      const cells = game.board.map((cell, i) => cell ? `${i % 4 + 1},${Math.floor(i / 4) + 1} ${name(cell.kind)}${['hen', 'egg'].includes(cell.kind) ? ` (${text('progress')}: ${cell.ticks})` : ''}` : null).filter(Boolean);
      end.append(el('p', 'garden-build-cells', cells.join(' · '))); play.append(end);
    }
    aside.append(el('h2', '', text('log')));
    const log = el('ol', 'garden-log'); log.setAttribute('aria-live', 'polite');
    if (!game.events.length) log.append(el('li', '', text('first')));
    game.events.forEach((event) => { const row = el('li', `garden-event garden-event-${event.kind}`, formatEvent(event));
      row.addEventListener('mouseenter', () => { preview = { highlights: event.cells }; renderPreview(); }); row.addEventListener('mouseleave', () => { preview = null; renderPreview(); }); log.append(row); });
    aside.append(log, el('h3', '', text('perks')));
    if (!game.perks.length) aside.append(el('p', '', text('none')));
    for (const id of game.perks) aside.append(el('p', 'garden-owned-perk', `${GARDEN_PERKS[id].icon} ${GARDEN_PERKS[id][lang]}: ${description(GARDEN_PERKS[id])}`));
    aside.append(el('p', 'garden-local-score', `${text('earned')}: ${game.totalEarned} · ${text('local')}: ${best}`));
    layout.append(play, aside); wrap.append(layout);
    const guide = el('details', 'garden-guide'); guide.append(el('summary', '', text('rules')), el('p', '', text('order')), el('p', '', text('reserve')));
    for (const [kind, item] of Object.entries(GARDEN_TOKENS)) guide.append(el('p', '', `${item.icon} ${name(kind)}: ${description(item)}`)); wrap.append(guide);
    const footer = el('form', 'garden-seeds'), input = el('input', 'garden-seed-input'); input.value = game.seed; input.maxLength = 80; input.setAttribute('aria-label', text('seed'));
    footer.addEventListener('submit', (event) => { event.preventDefault(); restart(input.value.trim() || 'mint-1'); });
    const load = el('button', 'garden-button garden-quiet', text('load')); load.type = 'submit';
    const share = button(text('share'), 'garden-button garden-quiet', async () => { try { await navigator.clipboard.writeText(seedUrl().href); share.textContent = text('copied'); } catch { input.focus(); input.select(); } });
    footer.append(el('label', '', `${text('seed')}: `), input, load, button(text('restart'), 'garden-button garden-quiet', () => restart(game.seed)), button(text('random'), 'garden-button garden-quiet', () => restart(randomSeed())), share);
    wrap.append(footer); root.append(wrap);
  }
  rememberSeed(); render();
  return () => { disposed = true; root.replaceChildren(); root.classList.remove('garden-root'); };
}
