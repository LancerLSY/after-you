import test from 'node:test';
import assert from 'node:assert/strict';
import { BIDDER_IDS, REQUEST_TIMEOUT_MS, createAuction, chooseTarget, beginAuction, auctionRequest, validateAuctionResponse, applyAuctionResult, failAuction, retryAuction, acceptAuction, auctionShareText, fetchAuction, mountAuction } from '../dist/lab/auction.js';

function response({ source = 'deepseek', bids = [90, 120, 60], tag = null, roundTotal = 999999 } = {}) {
  return { source, bids: BIDDER_IDS.map((id, index) => ({ id, bid: bids[index], reason: `${id}：这个用途还有改写空间。` })), twist: { title: '买家的新念头', description: '下一件会带来新的取舍。', tag }, roundTotal };
}
function bidding(state = createAuction('odd-lot'), pitch = '把这件旧物放在窗边，和你一起等晚霞。', target = 'robot') {
  return beginAuction(chooseTarget(state, target), pitch);
}
function decision(state, options) { return applyAuctionResult(bidding(state), response(options)); }

test('seed creates stable, distinct lots with actual traits', () => {
  const first = createAuction('same seed');
  assert.deepEqual(first, createAuction('same seed'));
  assert.notDeepEqual(first.lots, createAuction('another seed').lots);
  assert.equal(new Set(first.lots.map((lot) => lot.id.split('-')[0])).size, 3);
  assert.ok(first.lots.every((lot) => lot.traits.length === 2 && lot.traits.every((trait) => trait.length > 3)));
  assert.equal(createAuction(0).seed, 0);
  assert.equal(createAuction(-1).seed, 4294967295);
  assert.deepEqual(createAuction(1.8), createAuction(1));
});

test('target and pitch are explicit choices and transitions preserve previous state', () => {
  const initial = createAuction(10);
  assert.throws(() => beginAuction(initial, '很棒'), /主攻/);
  assert.throws(() => chooseTarget(initial, 'invented'), /Unknown/);
  const chosen = chooseTarget(initial, 'detective');
  assert.equal(initial.target, null);
  assert.equal(chosen.target, 'detective');
  assert.throws(() => beginAuction(chosen, ' '), /1–300/);
  assert.throws(() => beginAuction(chosen, '字'.repeat(301)), /1–300/);
  const pending = beginAuction(chosen, '字'.repeat(300));
  assert.equal(pending.phase, 'bidding');
  assert.equal(chosen.phase, 'pitch');
  assert.equal(pending.pending.pitch.length, 300);
  assert.throws(() => beginAuction(pending, '重复请求'), /phase/);
  assert.throws(() => chooseTarget(pending, 'robot'), /phase/);
});

test('request contains fixed item facts, focus, and accepted history without trusting totals', () => {
  const state = bidding(createAuction(20), '具体的推销词', 'detective');
  const payload = auctionRequest(state);
  assert.deepEqual(payload.bidders, BIDDER_IDS);
  assert.equal(payload.pitch, '具体的推销词');
  assert.equal(payload.target, 'detective');
  assert.equal(payload.item.id, state.lots[0].id);
  assert.deepEqual(payload.item.traits, state.lots[0].traits);
  assert.equal(payload.item.icon, undefined);
  payload.item.traits[0] = '篡改副本';
  assert.notEqual(state.lots[0].traits[0], '篡改副本');
  const next = acceptAuction(applyAuctionResult(state, response({ tag: 'collector_double' })));
  const nextPayload = auctionRequest(bidding(next));
  assert.equal(nextPayload.round, 2);
  assert.equal(nextPayload.history.length, 1);
  assert.equal(nextPayload.history[0].winnerId, 'collector');
  assert.equal(nextPayload.history[0].winningBid, 120);
  assert.equal(nextPayload.activeRule.tag, 'collector_double');
});

test('response validation rejects forged IDs, missing bids, non-integer and oversized amounts', () => {
  const changes = [
    (payload) => { payload.source = 'ai'; },
    (payload) => { payload.bids.pop(); },
    (payload) => { payload.bids[0].id = 'other'; },
    (payload) => { payload.bids[0].id = 'robot'; },
    (payload) => { payload.bids[0].bid = -1; },
    (payload) => { payload.bids[0].bid = 501; },
    (payload) => { payload.bids[0].bid = 1.5; },
    (payload) => { payload.bids[0].bid = '100'; },
    (payload) => { payload.bids[0].bid = NaN; },
    (payload) => { payload.bids[0].reason = ''; },
    (payload) => { payload.bids[0].reason = '字'.repeat(601); },
    (payload) => { delete payload.twist; },
    (payload) => { payload.twist.description = ''; },
    (payload) => { payload.twist.title = '字'.repeat(81); },
  ];
  for (const change of changes) {
    const payload = response(); change(payload);
    assert.throws(() => validateAuctionResponse(payload));
  }
  assert.throws(() => validateAuctionResponse(null));
  assert.equal(validateAuctionResponse(response({ bids: [0, 500, 2] })).bids[1].bid, 500);
});

test('a lot sells once: wallet uses the winning bid, ignores roundTotal, and settles ties consistently', () => {
  const initial = bidding();
  const payload = response({ bids: [100, 100, 90] });
  payload.bids.reverse();
  const result = applyAuctionResult(initial, payload);
  assert.equal(result.wallet, 0);
  assert.equal(result.result.highestBid, 100);
  assert.equal(result.result.winnerId, 'detective');
  const accepted = acceptAuction(result);
  assert.equal(accepted.wallet, 100);
  assert.equal(accepted.round, 2);
  assert.equal(accepted.history.length, 1);
  assert.throws(() => acceptAuction(accepted), /phase/);
  assert.equal(initial.result, null);
  const passed = acceptAuction(decision(createAuction(4), { bids: [0, 0, 0] }));
  assert.equal(passed.history[0].winnerId, null);
  assert.equal(passed.wallet, 0);
});

test('repitch consumes the single voucher, keeps the lot and draft, and scores only its accepted result', () => {
  const original = decision(createAuction(4), { bids: [30, 40, 50] });
  const retry = retryAuction(original);
  assert.equal(retry.vouchers, 0);
  assert.equal(retry.round, 1);
  assert.equal(retry.wallet, 0);
  assert.equal(retry.pitch, original.pitch);
  assert.equal(retry.lots[0].id, original.lots[0].id);
  const improved = applyAuctionResult(beginAuction(chooseTarget(retry, 'detective'), '给侦探一个具体用途。'), response({ bids: [200, 10, 20] }));
  assert.throws(() => retryAuction(improved), /用完/);
  const next = acceptAuction(improved);
  assert.equal(next.wallet, 200);
  assert.equal(next.history[0].pitch, '给侦探一个具体用途。');
  assert.equal(next.history.length, 1);
});

test('supported next-lot rules are bounded, deterministic, and last exactly one lot', () => {
  let state = acceptAuction(decision(createAuction(7), { tag: 'collector_double' }));
  const result = decision(state, { bids: [300, 300, 200] });
  assert.equal(result.result.bids[1].rawBid, 300);
  assert.equal(result.result.bids[1].bid, 500);
  assert.equal(result.result.highestBid, 500);
  assert.match(result.result.bids[1].ruleNote, /翻倍/);
  assert.equal(decision(retryAuction(result), { bids: [1, 100, 1] }).result.bids[1].bid, 200, 'same-lot repitch retains its rule');
  state = acceptAuction(result);
  assert.equal(state.activeRule, null);
  assert.equal(decision(state, { bids: [1, 100, 1] }).result.bids[1].bid, 100);

  const robotWon = acceptAuction(decision(createAuction(9), { bids: [1, 2, 400], tag: 'robot_cooldown' }));
  const cooling = decision(robotWon, { bids: [20, 30, 500] });
  assert.equal(cooling.result.bids[2].bid, 0);
  assert.equal(cooling.result.bids[2].rawBid, 500);
  assert.equal(cooling.result.winnerId, 'collector');
  const collectorWon = acceptAuction(decision(createAuction(9), { bids: [1, 400, 2], tag: 'robot_cooldown' }));
  assert.equal(decision(collectorWon, { bids: [20, 30, 500] }).result.bids[2].bid, 500);
  assert.equal(acceptAuction(decision(createAuction(2), { tag: 'give_everyone_99999' })).activeRule, null);
});

test('errors preserve wallet, round, target and draft for a new attempt', () => {
  const pending = bidding(createAuction(100));
  const failed = failAuction(pending, '网络中断');
  assert.equal(failed.phase, 'pitch');
  assert.equal(failed.round, 1);
  assert.equal(failed.wallet, 0);
  assert.equal(failed.vouchers, 1);
  assert.equal(failed.target, 'robot');
  assert.equal(failed.pitch, pending.pitch);
  assert.equal(failed.pending, null);
  const resumed = beginAuction(failed);
  assert.equal(resumed.attempts, 2);
  assert.equal(resumed.error, null);
  assert.throws(() => failAuction(failed), /phase/);
  assert.throws(() => applyAuctionResult(failed, response()), /phase/);
});

test('three accepted lots finish the run and share an accurate item/pitch/bids/source receipt', () => {
  let state = createAuction(101);
  for (let round = 1; round <= 3; round += 1) {
    state = acceptAuction(applyAuctionResult(bidding(state, `第${round}句推销词`), response({ source: round === 2 ? 'local' : 'deepseek', bids: [round * 20, 10, 5], tag: 'collector_double' })));
  }
  assert.equal(state.phase, 'complete');
  assert.equal(state.round, 3);
  assert.equal(state.history.length, 3);
  assert.equal(state.wallet, 120);
  assert.equal(state.activeRule, null);
  assert.throws(() => beginAuction(state, '第四轮'), /phase/);
  const receipt = auctionShareText(state);
  assert.match(receipt, /成交收入 120/);
  assert.match(receipt, /DeepSeek 实时生成/);
  assert.match(receipt, /本地规则试场/);
  assert.match(receipt, /第2句推销词/);
  assert.ok(receipt.includes(state.lots[0].name));
  assert.ok(receipt.includes('实用派侦探 60'));
});

test('HTTP request uses the local proxy and surfaces upstream failures without fabricating fallback bids', async () => {
  const payload = auctionRequest(bidding());
  let captured;
  const data = await fetchAuction(payload, { fetchImpl: async (url, options) => {
    captured = { url, options };
    return { ok: true, json: async () => response() };
  } });
  assert.equal(captured.url, '/api/auction');
  assert.equal(captured.options.method, 'POST');
  assert.deepEqual(JSON.parse(captured.options.body), payload);
  assert.equal(captured.options.headers.Authorization, undefined);
  assert.equal(data.source, 'deepseek');
  await assert.rejects(fetchAuction(payload, { fetchImpl: async () => ({ ok: false, status: 502, json: async () => ({ error: '上游模型暂时不可用' }) }) }), /上游模型/);
  await assert.rejects(fetchAuction(payload, { fetchImpl: async () => ({ ok: true, json: async () => { throw new Error('invalid JSON'); } }) }), /有效报价/);
});

test('HTTP timeout and cancellation settle even if a transport ignores abort', async () => {
  assert.equal(REQUEST_TIMEOUT_MS, 20000);
  let requestSignal;
  await assert.rejects(fetchAuction({}, { timeoutMs: 5, fetchImpl: async (_, options) => { requestSignal = options.signal; return new Promise(() => {}); } }), /20 秒/);
  assert.equal(requestSignal.aborted, true);
  const controller = new AbortController();
  const cancelled = fetchAuction({}, { signal: controller.signal, fetchImpl: async () => new Promise(() => {}) });
  controller.abort();
  await assert.rejects(cancelled, /取消/);
  let called = false;
  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  await assert.rejects(fetchAuction({}, { signal: alreadyAborted.signal, fetchImpl: async () => { called = true; } }), /取消/);
  assert.equal(called, false);
});

class FakeRoot {
  constructor(seed = 10) { this.dataset = { seed }; this.listeners = new Map(); this.nodes = new Map(); this.innerHTML = ''; }
  addEventListener(name, listener) { const listeners = this.listeners.get(name) || new Set(); listeners.add(listener); this.listeners.set(name, listeners); }
  removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
  contains() { return true; }
  querySelector(selector) { if (!this.nodes.has(selector)) this.nodes.set(selector, { textContent: '', disabled: false, focus() {} }); return this.nodes.get(selector); }
  dispatch(name, target) { for (const listener of this.listeners.get(name) || []) listener({ target, preventDefault() {} }); }
  click(action, id) { const button = { dataset: { action, id }, disabled: false, closest() { return this; } }; this.dispatch('click', button); }
  input(value) { this.dispatch('input', { id: 'auction-pitch', value }); }
  submit() { this.dispatch('submit', { matches: () => true }); }
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
function serviceStatus(source = 'deepseek') { return { ok: true, json: async () => ({ source, model: source === 'deepseek' ? 'deepseek-chat' : null }) }; }

test('UI checks source first, submits one active request, and makes quick drafts editable', async () => {
  const originalFetch = globalThis.fetch;
  const root = new FakeRoot();
  let resolvePost;
  let posts = 0;
  let posted;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/status')) return serviceStatus();
    posts += 1; posted = JSON.parse(options.body);
    return new Promise((resolve) => { resolvePost = resolve; });
  };
  const ui = mountAuction(root);
  try {
    assert.match(root.innerHTML, /正在检查竞价来源/);
    root.submit();
    assert.equal(posts, 0);
    await tick();
    assert.match(root.innerHTML, /推销词将发给 DeepSeek/);
    root.click('target', 'collector');
    root.click('quick', 'story');
    assert.ok(ui.getState().pitch.length > 20);
    assert.ok(!ui.getState().pitch.includes('____'));
    root.input('收藏家，这是我的改写。');
    root.submit(); root.submit();
    await tick();
    assert.equal(posts, 1);
    assert.equal(posted.target, 'collector');
    assert.equal(posted.pitch, '收藏家，这是我的改写。');
    assert.equal(ui.getState().phase, 'bidding');
    assert.match(root.innerHTML, /取消等待/);
    resolvePost({ ok: true, json: async () => response({ bids: [10, 200, 30] }) });
    await tick();
    assert.equal(ui.getState().wallet, 0);
    assert.equal(ui.getState().phase, 'decision');
    assert.match(root.innerHTML, /DeepSeek 实时生成/);
    root.click('accept');
    assert.equal(ui.getState().round, 2);
    assert.equal(ui.getState().wallet, 200);
    root.click('accept');
    assert.equal(ui.getState().wallet, 200);
  } finally { ui.destroy(); globalThis.fetch = originalFetch; }
});

test('UI cancellation ignores stale responses; failures retry without consuming round or voucher', async () => {
  const originalFetch = globalThis.fetch;
  const root = new FakeRoot();
  const requests = [];
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/status')) return serviceStatus('local');
    return new Promise((resolve) => requests.push({ resolve, signal: options.signal }));
  };
  const ui = mountAuction(root);
  try {
    await tick();
    assert.match(root.innerHTML, /当前未接入模型/);
    root.click('target', 'robot'); root.input('一起吃晚饭。'); root.submit();
    await tick();
    root.click('cancel');
    assert.equal(requests[0].signal.aborted, true);
    assert.equal(ui.getState().phase, 'pitch');
    assert.equal(ui.getState().pitch, '一起吃晚饭。');
    root.submit(); await tick();
    requests[0].resolve({ ok: true, json: async () => response({ bids: [500, 500, 500] }) });
    await tick();
    assert.equal(ui.getState().phase, 'bidding');
    assert.equal(ui.getState().wallet, 0);
    requests[1].resolve({ ok: false, status: 502, json: async () => ({ error: '模型过忙' }) });
    await tick();
    assert.equal(ui.getState().phase, 'pitch');
    assert.equal(ui.getState().round, 1);
    assert.equal(ui.getState().vouchers, 1);
    assert.match(root.innerHTML, /模型过忙/);
    root.submit(); await tick();
    requests[2].resolve({ ok: true, json: async () => response({ source: 'local' }) });
    await tick();
    assert.equal(ui.getState().phase, 'decision');
    assert.match(root.innerHTML, /本地规则试场/);
    root.click('repitch');
    assert.equal(ui.getState().vouchers, 0);
    assert.equal(ui.getState().round, 1);
  } finally { ui.destroy(); globalThis.fetch = originalFetch; }
});

test('invalid responses and HTML in model text never mutate score or become markup', async () => {
  const originalFetch = globalThis.fetch;
  const root = new FakeRoot();
  let postNumber = 0;
  globalThis.fetch = async (url) => {
    if (url.endsWith('/status')) return serviceStatus();
    const data = response();
    if (postNumber++ === 0) data.bids[0].bid = 999999;
    else data.bids[0].reason = '<img src=x onerror="evil()">';
    return { ok: true, json: async () => data };
  };
  const ui = mountAuction(root);
  try {
    await tick(); root.click('target', 'detective'); root.input('<script>draft</script>'); root.submit(); await tick();
    assert.equal(ui.getState().phase, 'pitch');
    assert.equal(ui.getState().wallet, 0);
    assert.match(root.innerHTML, /报价格式无效/);
    root.submit(); await tick();
    assert.equal(ui.getState().phase, 'decision');
    assert.ok(root.innerHTML.includes('&lt;img src=x onerror=&quot;evil()&quot;&gt;'));
    assert.ok(!root.innerHTML.includes('<script>draft</script>'));
  } finally { ui.destroy(); globalThis.fetch = originalFetch; }
});

test('status failure stays disconnected and reentry aborts the previous mount and removes handlers', async () => {
  const originalFetch = globalThis.fetch;
  const root = new FakeRoot();
  let statusCalls = 0;
  let postSignal;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/status')) {
      if (statusCalls++ === 0) throw new Error('offline');
      return serviceStatus();
    }
    postSignal = options.signal;
    return new Promise(() => {});
  };
  const first = mountAuction(root);
  let second;
  try {
    await tick();
    assert.match(root.innerHTML, /竞价服务未连接/);
    assert.ok(!root.innerHTML.includes('data-source="deepseek"'));
    root.click('status'); await tick();
    root.click('target', 'robot'); root.input('一起看窗外。'); root.submit(); await tick();
    assert.equal(postSignal.aborted, false);
    second = mountAuction(root);
    assert.equal(postSignal.aborted, true);
    await tick();
    assert.equal(root.listeners.get('click').size, 1);
    assert.equal(root.listeners.get('submit').size, 1);
    assert.equal(second.getState().wallet, 0);
    assert.equal(second.getState().phase, 'pitch');
    first.destroy();
    assert.equal(root.listeners.get('click').size, 1);
  } finally { first.destroy(); second?.destroy(); globalThis.fetch = originalFetch; }
});

test('UI exit aborts in-flight work, calls onExit once per click, and leaves no listeners', async () => {
  const originalFetch = globalThis.fetch;
  const root = new FakeRoot();
  let signal;
  let exits = 0;
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/status')) return serviceStatus();
    signal = options.signal; return new Promise(() => {});
  };
  const ui = mountAuction(root, { onExit: () => { exits += 1; } });
  try {
    await tick(); root.click('target', 'robot'); root.click('quick', 'company'); root.submit(); await tick();
    root.click('exit'); root.click('exit');
    assert.equal(exits, 1);
    assert.equal(signal.aborted, true);
    assert.equal(root.listeners.get('click').size, 0);
    assert.equal(root.listeners.get('input').size, 0);
    assert.equal(root.listeners.get('submit').size, 0);
  } finally { ui.destroy(); globalThis.fetch = originalFetch; }
});

test('readable service errors take precedence over machine codes',async()=>{await assert.rejects(fetchAuction({}, {fetchImpl:async()=>({ok:false,status:429,json:async()=>({error:'prototype_limit',message:'请稍候再试'})})}),/请稍候/);});
