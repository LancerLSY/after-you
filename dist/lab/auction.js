export const BIDDER_IDS = Object.freeze(['detective', 'collector', 'robot']);
export const BIDDERS = Object.freeze([
  { id: 'detective', name: '实用派侦探', icon: '🕵️', motive: '只为说得通的用途付钱。', hint: '指出一个具体场景，再解释物品特性如何派上用场。' },
  { id: 'collector', name: '悖论收藏家', icon: '🧐', motive: '寻找独一份的来历与矛盾。', hint: '给它一个无法替代的故事；离奇也要自圆其说。' },
  { id: 'robot', name: '孤独机器人', icon: '🤖', motive: '想买一个能一起生活的伙伴。', hint: '说清你们会一起做什么，让缺点成为相处的理由。' },
]);
export const REQUEST_TIMEOUT_MS = 20000;

const LOTS = [
  { id: 'brick', name: '半块砖', icon: '🧱', traits: [['恰好能垫平一张摇晃的桌子', '重量恰好压住一张纸', '每次落地都会立起来'], ['会记住上一次靠着它的温度', '表面刻着一个未写完的地址', '轻敲时发出门铃声']] },
  { id: 'sock', name: '倒着走的袜子', icon: '🧦', traits: [['每天只倒退三步', '只会沿着昨天的路线倒退', '听见道歉就会倒退一步'], ['永远找不到另一只', '袜口藏着一粒不会融化的雪', '晒干后会叹一口气']] },
  { id: 'umbrella', name: '怕下雨的伞', icon: '☂️', traits: [['下雨前十分钟会发抖', '碰到雨滴就会自动收拢', '只肯在室内撑开'], ['能牢牢记住一个人的影子', '伞内总是晴天的气味', '伞柄会在紧张时变暖']] },
  { id: 'clock', name: '只报过去的闹钟', icon: '⏰', traits: [['每天提醒昨天的一件小事', '永远比你后悔的时刻慢一分钟', '只会在错过之后响铃'], ['按下按钮会安静地陪你一分钟', '声音听起来像老朋友', '表盘少了一个数字但照常转动']] },
  { id: 'cup', name: '盛不住秘密的杯子', icon: '☕', traits: [['装热水就会小声复述最后一句话', '只会把秘密说给植物听', '满杯时会发出诚实的叹息'], ['从不洒出最后一滴水', '杯底有一张小小的地图', '杯柄刚好能握住一根手指']] },
  { id: 'key', name: '没有门的钥匙', icon: '🗝️', traits: [['只能转动，打不开任何锁', '靠近失物时会轻轻发热', '每周会改变一次齿形'], ['总指向你想回去的方向', '握着它就会想起一种气味', '背面写着“欢迎回来”']] },
  { id: 'mirror', name: '慢半拍的镜子', icon: '🪞', traits: [['映像比现实慢三秒', '只保留一天里的最后一个微笑', '倒影会比你先打哈欠'], ['镜框里有一张空白合影', '离开后仍会保留一小块光', '从不映出孤零零的空房间']] },
  { id: 'spoon', name: '不肯搅匀的勺子', icon: '🥄', traits: [['每搅三圈就反着搅一圈', '只愿意把苦味留在杯底', '一碰到甜食就会打结'], ['敲一下能唱出一个音', '柄上刻着一道没写完的菜谱', '温度总和握着它的人一样']] },
  { id: 'lamp', name: '需要鼓励的台灯', icon: '💡', traits: [['听到夸奖才会亮一分钟', '越小声的鼓励越亮', '只照亮别人忽略的角落'], ['灯光能刚好围住两个人', '底座保存着一张旧车票', '熄灭前会轻轻眨一下']] },
  { id: 'pillow', name: '不会做梦的枕头', icon: '🛏️', traits: [['能接住一句没说出口的话', '只在白天变得柔软', '每晚把梦折成一条直线'], ['总有刚晒过太阳的温度', '一角绣着一个问号', '拍一下会发出很轻的笑声']] },
];
const RULES = {
  collector_double: { title: '收藏热潮', description: '本轮收藏家的原始出价翻倍，最高 500。' },
  robot_cooldown: { title: '陪伴需要消化', description: '如果机器人买下了上一件，本轮它休息，出价为 0。' },
};

function seedNumber(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return Math.trunc(seed) >>> 0;
  let hash = 2166136261;
  for (const character of String(seed)) hash = Math.imul(hash ^ character.codePointAt(0), 16777619);
  return hash >>> 0;
}
function randomFor(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) | 0;
    let result = Math.imul(value ^ value >>> 15, 1 | value);
    result ^= result + Math.imul(result ^ result >>> 7, 61 | result);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}
function record(state, message) { return [...state.events, message].slice(-12); }
function requirePhase(state, phase) {
  if (state.phase !== phase) throw new Error(`Expected ${phase} phase.`);
}
function bidderName(id) { return BIDDERS.find((bidder) => bidder.id === id)?.name || '流拍'; }
function sourceName(source) { return source === 'deepseek' ? 'DeepSeek 实时生成' : '本地规则试场'; }
function validText(value, limit) { return typeof value === 'string' && value.trim().length > 0 && [...value].length <= limit; }

export function createAuction(seed = 1) {
  const numericSeed = seedNumber(seed);
  const random = randomFor(numericSeed);
  const pool = LOTS.map((lot) => lot);
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  const lots = pool.slice(0, 3).map((lot, index) => ({
    id: `${lot.id}-${numericSeed}-${index + 1}`,
    name: lot.name,
    icon: lot.icon,
    traits: lot.traits.map((choices) => choices[Math.floor(random() * choices.length)]),
  }));
  return { seed: numericSeed, round: 1, phase: 'pitch', lots, wallet: 0, vouchers: 1, target: null, pitch: '', pending: null, result: null, activeRule: null, history: [], events: ['开场：三件旧物，一张重拍券。'], attempts: 0, error: null };
}

export function chooseTarget(state, id) {
  requirePhase(state, 'pitch');
  if (!BIDDER_IDS.includes(id)) throw new Error('Unknown bidder.');
  return { ...state, target: id, error: null };
}

export function beginAuction(state, pitch = state.pitch) {
  requirePhase(state, 'pitch');
  if (!BIDDER_IDS.includes(state.target)) throw new Error('先选一位主攻买家。');
  if (!validText(pitch, 300)) throw new Error('推销词需要 1–300 个字。');
  const cleanPitch = pitch.trim();
  const attempts = state.attempts + 1;
  return { ...state, phase: 'bidding', pitch: cleanPitch, attempts, pending: { pitch: cleanPitch, target: state.target, attempt: attempts }, error: null, events: record(state, `第 ${state.round} 件：向${bidderName(state.target)}发起竞价。`) };
}

export function auctionRequest(state) {
  requirePhase(state, 'bidding');
  const { id, name, traits } = state.lots[state.round - 1];
  return {
    round: state.round,
    seed: state.seed,
    item: { id, name, traits: [...traits] },
    pitch: state.pending.pitch,
    bidders: [...BIDDER_IDS],
    target: state.pending.target,
    history: state.history.map(({ round, item, winnerId, pitch, winningBid, source }) => ({ round, itemId: item.id, winnerId, pitch, winningBid, source })),
    activeRule: state.activeRule ? { ...state.activeRule } : null,
  };
}

export function validateAuctionResponse(payload) {
  if (!payload || !['deepseek', 'local'].includes(payload.source)) throw new Error('竞价来源无效，请重试。');
  if (!Array.isArray(payload.bids) || payload.bids.length !== 3) throw new Error('报价不完整，请重试。');
  const byId = new Map();
  for (const bid of payload.bids) {
    if (!bid || !BIDDER_IDS.includes(bid.id) || byId.has(bid.id) || !Number.isInteger(bid.bid) || bid.bid < 0 || bid.bid > 500 || !validText(bid.reason, 600)) throw new Error('报价格式无效，请重试。');
    byId.set(bid.id, { id: bid.id, bid: bid.bid, reason: bid.reason.trim() });
  }
  const twist = payload.twist;
  if (!twist || !validText(twist.title, 80) || !validText(twist.description, 500)) throw new Error('拍卖插曲格式无效，请重试。');
  return { source: payload.source, bids: BIDDER_IDS.map((id) => byId.get(id)), twist: { title: twist.title.trim(), description: twist.description.trim(), tag: Object.hasOwn(RULES, twist.tag) ? twist.tag : null } };
}

export function applyAuctionResult(state, payload) {
  requirePhase(state, 'bidding');
  const validated = validateAuctionResponse(payload);
  const previousWinner = state.history.at(-1)?.winnerId;
  const bids = validated.bids.map((bid) => {
    let amount = bid.bid;
    let ruleNote = '';
    if (state.activeRule?.tag === 'collector_double' && bid.id === 'collector') {
      amount = Math.min(500, amount * 2);
      ruleNote = '收藏热潮：原始出价翻倍，最高 500。';
    }
    if (state.activeRule?.tag === 'robot_cooldown' && previousWinner === 'robot' && bid.id === 'robot') {
      amount = 0;
      ruleNote = '陪伴需要消化：上一件由机器人买下，本轮休息。';
    }
    return { ...bid, rawBid: bid.bid, bid: amount, ruleNote };
  });
  const highestBid = Math.max(...bids.map((bid) => bid.bid));
  // Fixed profile order settles ties. A zero bid is a pass, not a sale.
  const winnerId = highestBid > 0 ? bids.find((bid) => bid.bid === highestBid).id : null;
  return { ...state, phase: 'decision', pending: null, result: { ...validated, bids, highestBid, winnerId, pitch: state.pitch, target: state.target }, error: null, events: record(state, `第 ${state.round} 件：收到${sourceName(validated.source)}报价，最高 ${highestBid}。`) };
}

export function failAuction(state, message = '竞价暂时失败，请重试。') {
  requirePhase(state, 'bidding');
  return { ...state, phase: 'pitch', pending: null, error: String(message).slice(0, 240), events: record(state, `第 ${state.round} 件：竞价未完成，钱包和轮次保留。`) };
}

export function retryAuction(state) {
  requirePhase(state, 'decision');
  if (state.vouchers < 1) throw new Error('重拍券已经用完。');
  return { ...state, phase: 'pitch', vouchers: state.vouchers - 1, result: null, error: null, events: record(state, `第 ${state.round} 件：保留物品，花一张重拍券。改写推销词再试。`) };
}

export function acceptAuction(state) {
  requirePhase(state, 'decision');
  const result = state.result;
  const entry = { round: state.round, item: { ...state.lots[state.round - 1], traits: [...state.lots[state.round - 1].traits] }, pitch: result.pitch, target: result.target, bids: result.bids.map((bid) => ({ ...bid })), winnerId: result.winnerId, winningBid: result.highestBid, source: result.source };
  const complete = state.round === 3;
  const activeRule = result.twist.tag && !complete ? { tag: result.twist.tag, ...RULES[result.twist.tag] } : null;
  return { ...state, round: complete ? 3 : state.round + 1, phase: complete ? 'complete' : 'pitch', wallet: state.wallet + result.highestBid, history: [...state.history, entry], activeRule, target: null, pitch: '', pending: null, result: null, error: null, events: record(state, result.winnerId ? `${bidderName(result.winnerId)}以 ${result.highestBid} 买下${entry.item.name}。` : `${entry.item.name}流拍；未收入金币。`) };
}

export function auctionShareText(state) {
  const lines = [`万物拍卖所 / Odd Lot · 种子 ${state.seed}`, `成交收入 ${state.wallet}（每件仅计一次最高成交价）`];
  for (const entry of state.history) {
    lines.push('', `${entry.round}. ${entry.item.name}｜${entry.item.traits.join('；')}`, `主攻：${bidderName(entry.target)}｜推销词：${entry.pitch}`, `报价：${entry.bids.map((bid) => `${bidderName(bid.id)} ${bid.bid}`).join(' / ')}`, `成交：${bidderName(entry.winnerId)} ${entry.winningBid}｜来源：${sourceName(entry.source)}`);
  }
  return lines.join('\n');
}

export async function fetchAuction(payload, { signal, fetchImpl = globalThis.fetch, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  let timeout;
  let rejectAbort;
  const abort = () => { controller.abort(); rejectAbort?.(new Error('已取消等待；可以保留原稿重试。')); };
  const interrupted = new Promise((_, reject) => {
    rejectAbort = reject;
    timeout = setTimeout(() => { controller.abort(); reject(new Error('竞价超过 20 秒，请重试。')); }, timeoutMs);
  });
  signal?.addEventListener('abort', abort, { once: true });
  try {
    if (signal?.aborted) abort();
    const request = Promise.resolve().then(async () => {
      if (controller.signal.aborted) throw new Error('已取消等待；可以保留原稿重试。');
      const response = await fetchImpl('/api/auction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal });
      let data;
      try { data = await response.json(); } catch { throw new Error('服务没有返回有效报价，请重试。'); }
      if (!response.ok) throw new Error(validText(data?.message, 500) ? data.message : validText(data?.error, 240) ? data.error : `竞价服务暂不可用（${response.status}），请重试。`);
      return data;
    });
    return await Promise.race([request, interrupted]);
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

const mounts = new WeakMap();
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character])); }
function newSeed() { return globalThis.crypto?.getRandomValues ? crypto.getRandomValues(new Uint32Array(1))[0] : Date.now() >>> 0; }

export function mountAuction(root, { onExit } = {}) {
  mounts.get(root)?.destroy();
  let state = createAuction(root.dataset?.seed ?? newSeed());
  let destroyed = false;
  let activeRequest = null;
  let statusRequest = null;
  let status = { phase: 'loading', source: null, model: null };
  let copyMessage = '';

  function sourceNotice() {
    if (status.phase === 'loading') return '<p class="auction-source" role="status">正在检查竞价来源…</p>';
    if (status.phase === 'error') return '<p class="auction-source" role="status">竞价服务未连接。<button type="button" class="lab-button secondary" data-action="status">重新检查</button></p>';
    return status.source === 'deepseek'
      ? '<p class="auction-source" data-source="deepseek">● DeepSeek 实时竞价 · 推销词将发给 DeepSeek 生成报价。</p>'
      : '<p class="auction-source" data-source="local">◇ 本地规则试场 · 当前未接入模型，报价由本地规则生成。</p>';
  }

  function recap(entry) {
    return `<article class="auction-recap"><h3>${entry.round}. ${escapeHTML(entry.item.name)} <span>₡${entry.winningBid}</span></h3><p>${escapeHTML(entry.item.traits.join(' · '))}</p><p>“${escapeHTML(entry.pitch)}”</p><p>主攻${bidderName(entry.target)} · ${entry.winnerId ? `${bidderName(entry.winnerId)}买下` : '流拍'}</p><p>${entry.bids.map((bid) => `${bidderName(bid.id)} ₡${bid.bid}`).join(' / ')}</p><small>来源：${sourceName(entry.source)}</small></article>`;
  }

  function render() {
    if (destroyed) return;
    const lot = state.lots[state.round - 1];
    const busy = state.phase === 'bidding';
    const canEdit = state.phase === 'pitch';
    const profiles = BIDDERS.map((bidder) => `<button type="button" class="auction-bidder ${state.target === bidder.id ? 'selected' : ''}" data-action="target" data-id="${bidder.id}" aria-pressed="${state.target === bidder.id}" ${canEdit ? '' : 'disabled'}><span class="auction-bidder-icon">${bidder.icon}</span><strong>${bidder.name}</strong><span>${bidder.motive}</span><small>${bidder.hint}</small>${state.target === bidder.id ? '<b>本轮主攻 ✓</b>' : ''}</button>`).join('');
    let body;
    if (state.phase === 'complete') {
      body = `<section class="auction-panel auction-ending"><p class="eyebrow">拍卖结束 / SOLD & TOLD</p><h2>旧物有了新主人。</h2><p class="auction-total">₡${state.wallet}</p><p>三件拍品，${state.history.filter((entry) => entry.winnerId).length} 件成交。最贵的一句故事，值 ${Math.max(...state.history.map((entry) => entry.winningBid))}。</p><p>本场来源：${[...new Set(state.history.map((entry) => sourceName(entry.source)))].join('、')}。</p><div class="auction-actions"><button class="lab-button" data-action="new">再开一场</button><button class="lab-button secondary" data-action="copy">复制本场小票</button></div><p class="auction-status" role="status">${escapeHTML(copyMessage)}</p><details><summary>展开三件拍品与推销词</summary>${state.history.map(recap).join('')}</details><details><summary>可复制的小票全文</summary><textarea class="auction-share" readonly aria-label="本场小票">${escapeHTML(auctionShareText(state))}</textarea></details></section>`;
    } else {
      const bids = state.result ? `<section class="auction-panel auction-results" aria-live="polite"><p class="eyebrow">${sourceName(state.result.source)}</p><h2>${state.result.winnerId ? `${bidderName(state.result.winnerId)}出价最高` : '三位都暂时放下了号牌'}</h2><div class="auction-bids">${state.result.bids.map((bid) => `<article class="auction-bid ${bid.id === state.result.winnerId ? 'winning' : ''}"><strong>${BIDDERS.find((bidder) => bidder.id === bid.id).icon} ${bidderName(bid.id)}</strong><b>₡${bid.bid}</b><p>${escapeHTML(bid.reason)}</p>${bid.ruleNote ? `<small>原始报价 ₡${bid.rawBid} · ${escapeHTML(bid.ruleNote)}</small>` : ''}</article>`).join('')}</div><p class="auction-status">同价时按侦探 → 收藏家 → 机器人顺序成交。只收最高一笔。</p><aside class="auction-twist"><strong>🎟 ${escapeHTML(state.result.twist.title)}</strong><p>${escapeHTML(state.result.twist.description)}</p><small>${state.round === 3 ? '这是最后一件，本场不再触发后续规则。' : state.result.twist.tag ? `下一件规则：${RULES[state.result.twist.tag].description}` : '叙事插曲 · 下一件没有额外出价规则。'}</small></aside><div class="auction-actions"><button class="lab-button" data-action="accept">${state.result.winnerId ? `落槌收下 ₡${state.result.highestBid}` : '接受流拍'}${state.round < 3 ? ' · 下一件 →' : ' · 查看小票'}</button><button class="lab-button secondary" data-action="repitch" ${state.vouchers ? '' : 'disabled'}>${state.vouchers ? '保留物品，改词重拍 · 用 1 张券' : '重拍券已用完'}</button></div></section>` : '';
      body = `<div class="auction-grid"><section class="auction-panel auction-lot"><p class="eyebrow">LOT 0${state.round} / 03</p><div class="auction-object" aria-hidden="true">${lot.icon}</div><h2>${escapeHTML(lot.name)}</h2><ul>${lot.traits.map((trait) => `<li>${escapeHTML(trait)}</li>`).join('')}</ul><p>物品特性固定。你决定从哪个角度，让它值得被买走。</p>${state.activeRule ? `<aside class="auction-rule"><strong>本轮规则：${escapeHTML(state.activeRule.title)}</strong><p>${escapeHTML(state.activeRule.description)}</p></aside>` : ''}</section><section class="auction-panel auction-pitch"><h2>先选一位，你想打动谁？</h2><div class="auction-bidders">${profiles}</div><form data-auction-form><label for="auction-pitch">你的推销词 <small>最多 300 字 · 可改写下方草稿</small></label><textarea id="auction-pitch" name="pitch" maxlength="600" placeholder="这不只是${escapeHTML(lot.name)}……" ${canEdit ? '' : 'disabled'}>${escapeHTML(state.pitch)}</textarea><div class="auction-quick">${[['utility', '🛠 讲一个用途'], ['story', '🌀 编一个来历'], ['company', '💛 邀它作伴']].map(([id, label]) => `<button type="button" class="lab-button secondary" data-action="quick" data-id="${id}" ${canEdit ? '' : 'disabled'}>${label}</button>`).join('')}</div><small class="auction-count" aria-live="off">${[...state.pitch].length}/300 · 草稿可以编辑；三位买家都会出价。</small>${sourceNotice()}${state.error ? `<p class="auction-error" role="alert">${escapeHTML(state.error)} 钱包和本轮拍品已保留。</p>` : ''}${state.phase === 'decision' ? '' : `<div class="auction-actions"><button class="lab-button" type="submit" ${busy || status.phase !== 'ready' || !state.target || !state.pitch.trim() ? 'disabled' : ''}>${busy ? '正在等待三位买家…' : state.error ? '按当前稿重试竞价' : '举牌，请三位出价 →'}</button>${busy ? '<button class="lab-button secondary" type="button" data-action="cancel">取消等待</button>' : ''}</div>`}${busy ? '<p class="auction-status" role="status">最多等待 20 秒。收到完整报价前，不会推进轮次或计分。</p>' : ''}</form></section></div>${bids}`;
    }
    root.innerHTML = `<section class="auction"><header class="auction-header"><div><p class="eyebrow">ODD LOT / 语言拍卖实验</p><h1>万物拍卖所<span>一句话，让废物翻身。</span></h1><p>三件离谱旧物，三位挑剔买家。你的说法会改变他们的出价。</p></div><div class="auction-wallet"><strong>₡${state.wallet}</strong><span>成交收入 · 重拍券 ${state.vouchers}/1</span><small>种子 ${state.seed}</small></div><button class="lab-button secondary" data-action="exit">返回实验室</button></header><div class="auction-progress" aria-label="第 ${state.round} 件，共三件">${state.lots.map((_, index) => `<span class="${index + 1 < state.round || state.phase === 'complete' ? 'done' : index + 1 === state.round ? 'active' : ''}">${index + 1 < state.round || state.phase === 'complete' ? '✓' : `0${index + 1}`}</span>`).join('')}</div>${body}<details class="auction-log"><summary>拍卖日志 · ${state.events.length} 条</summary><ol>${state.events.map((message) => `<li>${escapeHTML(message)}</li>`).join('')}</ol></details></section>`;
  }

  async function loadStatus() {
    statusRequest?.abort();
    const controller = new AbortController();
    statusRequest = controller;
    status = { phase: 'loading', source: null, model: null };
    render();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch('/api/auction/status', { signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !['deepseek', 'local'].includes(data.source)) throw new Error('Invalid service status.');
      if (destroyed || statusRequest !== controller) return;
      status = { phase: 'ready', source: data.source, model: typeof data.model === 'string' ? data.model : null };
    } catch {
      if (destroyed || statusRequest !== controller) return;
      status = { phase: 'error', source: null, model: null };
    } finally {
      clearTimeout(timeout);
      if (!destroyed && statusRequest === controller) { statusRequest = null; render(); }
    }
  }

  async function submit() {
    if (destroyed || activeRequest || state.phase !== 'pitch' || status.phase !== 'ready') return;
    try { state = beginAuction(state); } catch (error) { state = { ...state, error: error.message }; render(); return; }
    const controller = new AbortController();
    activeRequest = controller;
    const attempt = state.attempts;
    render();
    try {
      const response = await fetchAuction(auctionRequest(state), { signal: controller.signal });
      if (destroyed || activeRequest !== controller || state.attempts !== attempt) return;
      state = applyAuctionResult(state, response);
      status = { ...status, phase: 'ready', source: state.result.source };
    } catch (error) {
      if (destroyed || activeRequest !== controller || state.attempts !== attempt) return;
      state = failAuction(state, error.message || '竞价暂时失败，请重试。');
    } finally {
      if (!destroyed && activeRequest === controller) {
        activeRequest = null;
        render();
        if (state.phase === 'decision') root.querySelector('.auction-results')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
      }
    }
  }

  function quickPitch(kind) {
    const lot = state.lots[state.round - 1];
    const uses = {
      brick: '把它垫在摇晃的工作台下，让一张旧桌继续工作',
      sock: '把它放在门口，沿着它的倒退路线检查昨天遗漏的小物件',
      umbrella: '把它放在玄关，出门前观察它的反应，给天气记录添一条线索',
      clock: '把它放在复盘桌边，每次响起就补记一件错过的小事',
      cup: '把它放在谈话桌上，用它的反应提醒自己少说一句、认真听完',
      key: '把它做成随身的寻物标记，每次摸到它就检查一次钥匙和钱包',
      mirror: '把它摆在排练角，观察动作与映像的差别，练习慢下来',
      spoon: '把它留给厨房实验，比较同一杯饮料上下层的味道',
      lamp: '把它放在书桌上，每开工一次就说一句鼓励，把点灯变成习惯',
      pillow: '把它放在午休椅上，给那些睡不着的十分钟一个固定位置',
    };
    const use = uses[lot.id.split('-')[0]];
    const drafts = {
      utility: `请${use}。这件${lot.name}的限制很清楚：${lot.traits[0]}；${lot.traits[1]}。按这些特性使用，它就有一个具体位置。`,
      story: `这件${lot.name}曾属于一位专门收集告别的邮差。它${lot.traits[0]}，是因为最后一封信始终没有送到；${lot.traits[1]}，就是那位收件人留下的回信。`,
      company: `你不用把${lot.name}修成正常的样子。每天晚饭后，把它放在窗边一起等五分钟；它${lot.traits[0]}，你就陪它照自己的节奏来。它还会${lot.traits[1]}，安静的家也会多一件值得分享的小事。`,
    };
    state = { ...state, pitch: drafts[kind] || '', error: null };
    render();
    root.querySelector('#auction-pitch')?.focus();
  }

  function click(event) {
    const button = event.target.closest?.('[data-action]');
    if (!button || !root.contains(button) || button.disabled) return;
    const action = button.dataset.action;
    if (action === 'exit') { destroy(); onExit?.(); return; }
    if (action === 'cancel') {
      const controller = activeRequest;
      activeRequest = null;
      controller?.abort();
      if (state.phase === 'bidding') state = failAuction(state, '已取消等待，可以修改原稿再试。');
      render(); return;
    }
    if (action === 'status') { loadStatus(); return; }
    if (action === 'target' && state.phase === 'pitch') { state = chooseTarget(state, button.dataset.id); render(); }
    if (action === 'quick' && state.phase === 'pitch') quickPitch(button.dataset.id);
    if (action === 'accept' && state.phase === 'decision') { state = acceptAuction(state); render(); root.scrollIntoView?.({ block: 'start' }); }
    if (action === 'repitch' && state.phase === 'decision' && state.vouchers) { state = retryAuction(state); render(); root.querySelector('#auction-pitch')?.focus(); }
    if (action === 'new' && state.phase === 'complete') { state = createAuction(newSeed()); copyMessage = ''; render(); root.scrollIntoView?.({ block: 'start' }); loadStatus(); }
    if (action === 'copy' && state.phase === 'complete') {
      const text = auctionShareText(state);
      if (!globalThis.navigator?.clipboard?.writeText) { copyMessage = '可展开“小票全文”，长按或选中复制。'; render(); return; }
      navigator.clipboard.writeText(text).then(() => { if (!destroyed) { copyMessage = '本场小票已复制，包含真实报价来源。'; render(); } }, () => { if (!destroyed) { copyMessage = '复制未完成，可展开“小票全文”手动复制。'; render(); } });
    }
  }
  function input(event) {
    if (state.phase !== 'pitch' || event.target.id !== 'auction-pitch') return;
    state = { ...state, pitch: [...event.target.value].slice(0, 300).join('') };
    if (event.target.value !== state.pitch) event.target.value = state.pitch;
    const counter = root.querySelector('.auction-count');
    if (counter) counter.textContent = `${[...state.pitch].length}/300 · 草稿可以编辑；三位买家都会出价。`;
    const submitButton = root.querySelector('button[type="submit"]');
    if (submitButton) submitButton.disabled = status.phase !== 'ready' || !state.target || !state.pitch.trim();
  }
  function formSubmit(event) { if (event.target.matches?.('[data-auction-form]')) { event.preventDefault(); submit(); } }
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    activeRequest?.abort();
    statusRequest?.abort();
    activeRequest = null;
    statusRequest = null;
    root.removeEventListener('click', click);
    root.removeEventListener('input', input);
    root.removeEventListener('submit', formSubmit);
    if (mounts.get(root)?.destroy === destroy) mounts.delete(root);
  }
  const controller = { destroy, getState: () => JSON.parse(JSON.stringify(state)) };
  mounts.set(root, controller);
  root.addEventListener('click', click);
  root.addEventListener('input', input);
  root.addEventListener('submit', formSubmit);
  render();
  loadStatus();
  return controller;
}
