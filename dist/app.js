import { createGame, step, stepReplay, clearInput, seedFromDate, exportReplay, runReplay, RULES } from './engine.js';
import { Renderer } from './renderer.js';
import { encodeBoss, decodeBoss } from './boss-codec.js';
import { ReplayClip } from './clip.js';
import { demoReplay, demoBossCode } from './demo-replay.js';
import {mountRush} from './rush-ui.js';

const routeURL = new URL(location.href);
const legacyRoute = routeURL.searchParams.get('classic') === '1'
  || routeURL.searchParams.get('v') === '1'
  || new URLSearchParams(location.hash.slice(1)).has('boss')
  || (routeURL.searchParams.has('seed') && routeURL.searchParams.get('rush') !== '1' && routeURL.searchParams.get('v') !== '2');
// Boss fragments are complete challenge routes, including when entered from Rush.
window.addEventListener('hashchange',()=>{
  const hadBoss=new URLSearchParams(routeURL.hash.slice(1)).has('boss');
  const hasBoss=new URLSearchParams(location.hash.slice(1)).has('boss');
  if(hadBoss||hasBoss)location.reload();
});
if (!legacyRoute) {
  await mountRush();
} else {
const $ = (id) => document.getElementById(id);
const safeStorage = {
  get(key) { try { return localStorage.getItem(`after-you:${key}`); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(`after-you:${key}`, String(value)); } catch { /* Private browsing still plays. */ } },
};
const copy = {
  en: {
    demo:'Watch a demo ↗', demoNote:'SCRIPTED DEMO · NOT A PERSONAL SCORE', demoTitle:'Your moves could be next.', saveClip:'Save a clip', clipPreparing:'Preparing your replay…', clipRecording:'RECORDING CLIP', clipSaved:'Clip ready. Preview it and choose Download video.', clipTitle:'Your replay, ready to share.', downloadClip:'Download video', clipPrivacy:'The video stays on your device until you choose to share it.', clipCanceled:'Clip canceled.', clipFailed:'This browser could not record the clip. Replay and score-card export still work.', how:'How to play', source:'GitHub ↗', headline:'Your past is<br>coming for you.',
    lede:'Collect light. Break your echoes.<br>Turn your run into a boss.', daily:'Daily loop', free:'Free play', bossLab:'Boss lab', enter:'Enter the loop',
    keys:'WASD / arrows to move · Space to dash', touch:'Drag in the arena to move · Tap DASH', best:'YOUR BEST', score:'SCORE', loop:'LOOP',
    arenaHint:'Every 10 seconds, your path becomes an echo.', breath:'Take a breath.', paused:'Time stands still.', resume:'Back to the loop', restart:'Start again',
    again:'One more loop ↗', challenge:'Challenge a friend', watch:'Watch replay', saveReplay:'Save replay', saveCard:'Save score card', replay:'REPLAY', close:'Close',
    touchHelp:'Move anywhere in the arena', step1:'Collect the light', step1body:'Keep moving. Chain luminous fragments to grow your score.',
    step2:'Break your echoes', step2body:'Your path returns every 10 seconds. Dash through it for a bonus.',
    step3:'Challenge a friend', step3body:'Turn your moves into a boss. Beat it, then send it to a friend.',
    footer:'60 seconds. You versus every version of you.', helpTitle:'Make peace with your past.<br>Or dash through it.', gotIt:"Got it. Let’s play ↗",
    sourceBody:'A tiny, dependency-free arcade engine. Deterministic replays, seeded challenges, and all the game rules in one readable module.', sourcePending:'The public repository is being prepared. The game is fully playable here.',
    soundOn:'Sound on', soundOff:'Sound off', pause:'Pause the loop', ready:'SPACE · DASH', recharge:'DASH IN', survive:'You broke the loop.', lost:'Your past caught up.',
    newBest:'A NEW PERSONAL BEST', complete:'60 SECONDS. ALL YOURS.', bossComplete:'NINE STRIKES. ONE NEW STORY.', end:'EVERY LOOP TEACHES YOU SOMETHING.',
    detail:(g)=>`${g.stats.lightsCollected} lights · ${g.stats.echoesShattered} echoes broken · ${g.time.toFixed(1)}s`,
    echo:'YOUR PAST HAS ARRIVED', shatter:'ECHO SHATTERED', noPoints:'ECHO CLEARED', hit:'KEEP GOING. YOU HAVE THIS.',
    startTip:'Collect mint lights. Your first echo arrives in 10 seconds.', dashTip:'Space / DASH makes you invincible. Aim through a purple echo.',
    countdown:'ONE LAST LOOP', copied:'Challenge link copied. Same lights, new rival.', shared:'Your challenge is ready.', fallback:'Copy this challenge link:',
    challengeLabel:(score)=>`Friend’s challenge: ${score} points · self-reported`, invalid:'That challenge link was invalid. Today’s loop is ready.',
    playingTip:'You can pause with Esc. There is no penalty for taking a break.',
    help:'<p><strong>Move</strong> with WASD / arrow keys, or press and drag inside the arena. On a phone, drag like a joystick.</p><p><strong>Collect mint lights.</strong> Keep collecting within 4 seconds to build a multiplier up to ×5. Lights fade after 8 seconds.</p><p><strong>Every 10 seconds, an echo repeats your exact path.</strong> Purple echoes cost one of your 3 lives on contact. Faint echoes are waking up and cannot hurt you yet.</p><p><strong>Press Space or tap DASH</strong> to burst through an echo. Dashing makes you invincible. A shattered echo returns after 2 seconds; your dash recharges in 2.4 seconds.</p><p>Each echo pays a bonus once per loop, only if you collected light while recording it. Survive all 60 seconds for a bonus. <strong>Esc pauses</strong>; switching tabs pauses automatically.</p><p>Daily loops use the same UTC date worldwide. Scores stay on your device. Challenge scores are self-reported; replays can be recomputed.</p>',
  },
  zh: {
    demo:'先看一局示范 ↗', demoNote:'脚本示范 · 不计入个人成绩', demoTitle:'下一位 BOSS，可以是你。', saveClip:'导出短片', clipPreparing:'正在准备回放…', clipRecording:'正在录制短片', clipSaved:'短片已生成，请预览并点击下载视频。', clipTitle:'你的回放，可以带走了。', downloadClip:'下载视频', clipPrivacy:'视频保留在你的设备上，由你决定是否分享。', clipCanceled:'已取消短片录制。', clipFailed:'此浏览器无法录制短片，仍可导出回放和成绩卡。', how:'玩法', source:'GitHub ↗', headline:'身后是你。<br>冲破过去。', lede:'收集光点，冲破回声。<br>把你的走位，变成朋友的 BOSS。', daily:'每日回环', free:'自由练习', bossLab:'BOSS 练习', enter:'进入回环',
    keys:'WASD / 方向键移动 · 空格冲刺', touch:'在场内拖动来移动 · 点击 DASH 冲刺', best:'个人最佳', score:'得分', loop:'回环',
    arenaHint:'每过 10 秒，你的轨迹就会变成回声。', breath:'缓一口气。', paused:'时间为你停下。', resume:'回到这一刻', restart:'重新开始',
    again:'再来一局 ↗', challenge:'挑战朋友', watch:'观看回放', saveReplay:'导出回放', saveCard:'保存成绩卡', replay:'回放中', close:'关闭', touchHelp:'在场内拖动来移动',
    step1:'把光收进手心', step1body:'保持移动。连续收集光点，倍率最高升至 ×5。', step2:'冲破自己的回声', step2body:'每 10 秒，旧轨迹回来。用冲刺穿过它，赚取额外分数。',
    step3:'把这一局交给朋友', step3body:'把你的走位变成 BOSS。先击败它，再发给朋友挑战。', footer:'60 秒。对手是每一个过去的你。',
    helpTitle:'与过去和解。<br>或者，冲过去。', gotIt:'懂了，开始吧 ↗', sourceBody:'一个无运行时依赖的小型街机引擎。包含确定性回放、种子挑战和可直接修改的游戏规则。', sourcePending:'公开仓库正在准备中。这里的游戏已可完整游玩。',
    soundOn:'声音开', soundOff:'声音关', pause:'暂停回环', ready:'空格 · 冲刺', recharge:'冲刺冷却', survive:'你冲破了回环。', lost:'过去，追上了你。',
    newBest:'新的个人纪录', complete:'这 60 秒属于你。', bossComplete:'九次命中。改写这段过去。', end:'每一局，都更懂过去一点。', detail:(g)=>`${g.stats.lightsCollected} 颗光点 · 击碎 ${g.stats.echoesShattered} 次回声 · ${g.time.toFixed(1)} 秒`,
    echo:'过去的你，回来了', shatter:'回声已击碎', noPoints:'回声已清除', hit:'还有机会。继续。', startTip:'先收集薄荷色光点。10 秒后，第一道回声会出现。', dashTip:'空格 / DASH 冲刺时无敌。试着穿过紫色回声。',
    countdown:'最后一道回环', copied:'挑战链接已复制。相同光点，换个对手。', shared:'挑战已准备好。', fallback:'复制这个挑战链接：',
    challengeLabel:(score)=>`朋友的挑战：${score} 分 · 自报成绩`, invalid:'这个挑战链接无效，已切换到每日回环。', playingTip:'Esc 随时暂停。休息不会受到惩罚。',
    help:'<p><strong>移动：</strong>WASD / 方向键，或按住场地拖动。手机上像摇杆一样拖动。</p><p><strong>收集薄荷色光点。</strong>每 4 秒内连续收集可提高倍率，最高 ×5。光点 8 秒后消失。</p><p><strong>每 10 秒，一道回声精确重复你的旧轨迹。</strong>接触紫色回声会损失 1 条生命，共有 3 条。半透明回声正在苏醒，暂时没有伤害。</p><p><strong>空格或 DASH 发动冲刺。</strong>冲刺期间无敌，可以击碎回声。回声 2 秒后回来，冲刺需冷却 2.4 秒。</p><p>每道回声每轮只奖励一次，而且你在录制那段轨迹时必须收集过光点。活过 60 秒可得生存奖励。<strong>Esc 暂停</strong>，切换标签页也会自动暂停。</p><p>每日回环按 UTC 日期统一，成绩保存在本机。挑战链接的成绩为玩家自报，回放可以重新计算验证。</p>',
  },
};
let language = safeStorage.get('language') === 'zh' ? 'zh' : 'en';
let soundEnabled = safeStorage.get('sound') === 'true';
let audio;
let mode = 'daily';
let seed = seedFromDate();
const url = new URL(location.href);
const incomingSeed = url.searchParams.get('seed');
const incomingScore = url.searchParams.get('score');
const supportedVersion = !url.searchParams.has('v') || url.searchParams.get('v') === '1';
let challenge = false;
if (supportedVersion && incomingSeed && incomingSeed.length <= 128 && /^[a-zA-Z0-9._-]+$/.test(incomingSeed)) { seed = incomingSeed; challenge = true; mode = 'challenge'; }
let game = createGame(seed);
let state = 'idle';
let resultGame = null;
let resultIsDemo = false;
let clipPhase = null;
let clipURL = null;
const replayClip = new ReplayClip();
let replayData = null;
let replayIndex = 0;
let replayFrame = 0;
let replayAccumulator = 0;
let lastFrame = 0;
let messageUntil = 0;
let stoppedByHelp = false;
let lastSecond = -1;
const keys = new Set();
const pointer = { active:false, id:null, x:0, y:0, originX:0, originY:0, touch:false };
let touchDash = false;
let dashPulse = false;
let activeBoss = null;
let activeBossCode = '';
let ownBoss = false;
let bossWon = false;
let invalidBoss = false;
const STARTER_BOSS_CODE = 'QVlCAWRJc0qBTY5VbF9dYk5lQGgxayJuFHEfcS5wRG5kbHNrgmqRaZ5nkWCEWpJViVBnRVU-RzpDO0xHVVNeX1tQZU5sWnNnemeFaI1sjm2AaH9ojmqOap1onWKIUXNHZEVVQkdAOD0pOxo4ITowPT5ATEVZTWhOd1CGUp1toGKjU6pGsDi0LaYzmTqLQH5IclBNWVhhZmR1aINrkm-hcq92pnSYcnRidGJlYVZhR2A4YC5aMEsvPS4wKzgnSDZKRU1QUUxgWl1pWnVcel2OX5dmiGN5YWpfW11oZXVsbmtgaFVHR0M5QStCIk4pSzZDMjg9M0wyWzNlQlToYiA';
const bossParam = new URLSearchParams(location.hash.slice(1)).get('boss');
if(bossParam){try{activeBoss=decodeBoss(bossParam);activeBossCode=bossParam;seed=activeBoss.seed;mode='boss';challenge=false;game=createGame(seed,{boss:activeBoss});}catch{invalidBoss=true;}}
const renderer = new Renderer($('game-canvas'));
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const t = (key) => copy[language][key];

function applyLanguage() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n); });
  $('language-button').textContent = language === 'zh' ? 'EN' : '中文';
  $('language-button').setAttribute('aria-label', language === 'zh' ? 'Switch to English' : '切换到中文');
  $('help-content').innerHTML = t('help') + (language==='zh'?'<p><strong>制造 BOSS：</strong>游玩至少 8 秒、收集 3 颗光点并移动足够距离后，结算可把轨迹变成 3 阶段 BOSS。先打赢它，再分享。挑战中要在 30 秒内冲刺命中 9 次，收光可缩短冲刺冷却。</p>':'<p><strong>Make a boss:</strong> play at least 8 seconds, collect 3 lights and keep moving. Turn the run into a 3-phase boss from the results screen. Beat it to unlock sharing. Land 9 dashes in 30 seconds; lights recharge your dash.</p>');
  $('sound-button').textContent = t(soundEnabled ? 'soundOn' : 'soundOff');
  $('sound-button').setAttribute('aria-pressed', String(soundEnabled));
  $('clip-button').hidden=!ReplayClip.isSupported();
  updatePlayLabel(); updateSeed(); updateHUD();
  if (resultGame && state === 'result') renderResults(false);
}
function updatePlayLabel() { $('play-button').querySelector('span').textContent = (state==='idle'&&mode==='boss')?(language==='zh'?'挑战这个 BOSS':'Challenge this boss'):t(state === 'playing' ? 'pause' : state === 'paused' ? 'resume' : state === 'result' ? 'again' : 'enter'); }
function bestKey() { if(mode==='boss')return 'best:boss:'+activeBoss.id; return mode === 'free' ? 'best:free' : `best:${seed}`; }
function updateSeed() {
  $('seed-label').textContent = mode === 'boss' ? (activeBossCode===STARTER_BOSS_CODE?(language==='zh'?'练习 BOSS':'STARTER BOSS'):(language==='zh'?'轨迹 BOSS':'TRAJECTORY BOSS')) : mode === 'daily' ? seed.replace('after-you-','') + ' UTC' : mode === 'challenge' ? (language==='zh'?'朋友的回环':'FRIEND’S LOOP') : (language==='zh'?'随机种子':'RANDOM SEED');
  const best = Number(safeStorage.get(bestKey())) || 0;
  $('best-score').textContent = best > 0 ? best.toLocaleString() : '—';
  $('challenge-label').hidden = !(challenge && incomingScore && /^\d{1,7}$/.test(incomingScore));
  $('challenge-label').textContent = t('challengeLabel')(Number(incomingScore)||0);
  $('daily-mode').classList.toggle('selected', mode === 'daily'||mode === 'challenge'); $('free-mode').classList.toggle('selected', mode === 'free');
  $('daily-mode').setAttribute('aria-pressed', String(mode === 'daily'||mode === 'challenge'));
  $('boss-mode').classList.toggle('selected',mode==='boss');$('boss-mode').setAttribute('aria-pressed',String(mode==='boss'));
  document.querySelector('footer p').textContent=mode==='boss'?(language==='zh'?'30 秒。把一段走位，打成你的胜利。':'30 seconds. Someone’s moves. Your boss fight.'):t('footer');
  document.querySelector('[data-i18n=step1body]').textContent=mode==='boss'?(language==='zh'?'收集光点为冲刺加速充能。眼睛盯紧 BOSS 的预告路线。':'Lights recharge your dash. Watch the boss’s next move.'):t('step1body');
  document.querySelector('[data-i18n=step2body]').textContent=mode==='boss'?(language==='zh'?'3 阶段，各有 3 点生命。30 秒内用冲刺命中 9 次。':'Three phases. Three hits each. Land nine dashes in 30 seconds.'):t('step2body'); $('free-mode').setAttribute('aria-pressed', String(mode === 'free'));
}
function randomSeed() { const n = new Uint32Array(2); crypto.getRandomValues(n); return 'free-'+Array.from(n,x=>x.toString(36)).join('-'); }
function changeMode(next) {
  if (state === 'playing' || state === 'paused') return;
  cancelRecording(); resultIsDemo=false;
  mode = next; challenge = false; activeBoss=null;activeBossCode='';ownBoss=false;bossWon=false;seed = next === 'daily' ? seedFromDate() : randomSeed();
  if(next==='boss'){activeBossCode=STARTER_BOSS_CODE;activeBoss=decodeBoss(activeBossCode);seed=activeBoss.seed;}
  state='idle'; game=createGame(seed,activeBoss?{boss:activeBoss}:{}); resultGame=null; $('result-overlay').hidden=true; $('replay-tag').hidden=true;
  document.body.classList.remove('playing','replaying'); updateSeed(); updateHUD(); updatePlayLabel();
}
function ensureAudio() {
  if (!soundEnabled) return;
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if(audio.state === 'suspended') audio.resume().catch(()=>{}); } catch { soundEnabled=false; }
}
function tone(frequency, duration=.12, type='sine', volume=.035) {
  if (!soundEnabled || !audio || audio.state!=='running') return;
  try { const o=audio.createOscillator(),gain=audio.createGain();o.type=type;o.frequency.setValueAtTime(frequency,audio.currentTime);o.frequency.exponentialRampToValueAtTime(frequency*.8,audio.currentTime+duration);gain.gain.setValueAtTime(volume,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(gain);gain.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);o.onended=()=>{o.disconnect();gain.disconnect();}; } catch { /* Audio never blocks play. */ }
}
function resetInput() { keys.clear(); pointer.active=false; touchDash=false; dashPulse=false; clearInput(game); }
function start() {
  cancelRecording(); resultIsDemo=false;
  ensureAudio(); resetInput();
  if(mode==='free') seed=randomSeed();
  if(mode==='daily') seed=seedFromDate();
  game=createGame(seed,activeBoss?{boss:activeBoss}:{}); state='playing'; resultGame=null; replayData=null; lastSecond=-1;
  renderer.reset?.();
  $('pause-overlay').hidden=true; $('result-overlay').hidden=true; $('replay-tag').hidden=true; $('share-status').textContent='';
  document.body.classList.add('playing'); document.body.classList.remove('replaying');
  $('status').textContent=t('playingTip'); updateSeed();updatePlayLabel();updateHUD();
  flash(activeBoss?(language==='zh'?'3 阶段，9 次命中。收集光点加快冲刺。':'3 phases. 9 strikes. Lights recharge your dash.'):t('startTip'),3.3); $('game-canvas').focus({preventScroll:true});
  if(matchMedia('(max-width:860px)').matches) $('arena').scrollIntoView({block:'center',behavior:reducedMotion?'instant':'smooth'});
}
function pause() {
  if(state!=='playing')return;
  state='paused';resetInput();$('pause-overlay').hidden=false;updatePlayLabel();$('resume-button').focus({preventScroll:true});
}
function resume() { if(state!=='paused')return;state='playing';$('pause-overlay').hidden=true;resetInput();updatePlayLabel();$('game-canvas').focus({preventScroll:true}); }
function flash(text,duration=1.6) { $('arena-message').textContent=text;$('arena-message').classList.add('visible');messageUntil=performance.now()+duration*1000; }
function updateHUD() {
  $('score').textContent=String(game.score).padStart(4,'0');$('loop').textContent=String(game.mode==='boss'?game.boss.stage+1:Math.min(6,Math.floor(game.time/10)+1)).padStart(2,'0');
  $('timer').textContent=Math.max(0,game.duration-game.time).toFixed(1);$('health').textContent='◆ '.repeat(game.player.hp)+'◇ '.repeat(3-game.player.hp);
  $('health').setAttribute('aria-label',`${game.player.hp} ${language==='zh'?'条生命':'lives'}`);
  $('combo').textContent=game.mode==='boss'?('BOSS '+('◆'.repeat(game.boss.hp))+'◇'.repeat(3-game.boss.hp)):game.combo>1?`×${game.combo} ${language==='zh'?'连击':'COMBO'}`:'';
  $('loop-progress').style.width=`${game.time>=60?100:(game.time%10)*10}%`;
  const cooldown=game.player.dashCooldown;
  $('dash-ready').hidden=state==='idle';$('dash-ready').textContent=cooldown>.05?`${t('recharge')} ${cooldown.toFixed(1)}`:t('ready');
  $('dash-button').textContent=cooldown>.05?cooldown.toFixed(1)+'s':'DASH ↗';$('dash-button').disabled=state!=='playing';$('dash-button').style.opacity=state!=='playing'||cooldown>.05?'.55':'1';
  document.querySelector('.loop span').textContent=mode==='boss'?(language==='zh'?'阶段':'PHASE'):t('loop');
  $('arena-hint').textContent=t('arenaHint');$('arena-hint').hidden=state==='playing'||state==='replay';if(state==='idle'&&mode==='boss')$('arena-hint').textContent=language==='zh'?'30 秒 · 3 阶段 · 9 次冲刺命中':'30 seconds · 3 phases · 9 dash hits';
}
function handleEvents(events) {
  renderer.onEvents(events);
  for(const e of events){
    if(e.type==='light') tone(500+e.combo*120,.11);
    if(e.type==='dash') tone(180,.16,'triangle',.03);
    if(e.type==='shatter'){tone(850,.24,'triangle',.045);flash(e.points>0?`${t('shatter')} +${e.points}`:t('noPoints'));}
    if(e.type==='damage'){tone(95,.25,'triangle',.04);flash(t('hit'));}
    if(e.type==='boss-stage'){tone(240,.4);flash((language==='zh'?'第 ':'PHASE ')+(e.stage+1)+' / 3',1.7);}
    if(e.type==='echo'){tone(240,.4);flash(game.time<11?t('dashTip'):t('echo'),2.4);}
    if(e.type==='won'){tone(1046,.45);}
  }
}
function finish() {
  state='result'; resultGame=game; replayData=exportReplay(game); if(game.mode==='boss'&&game.phase==='won')bossWon=true; resetInput();
  document.body.classList.remove('playing');$('arena-message').classList.remove('visible');
  const old=Number(safeStorage.get(bestKey()))||0; const isBest=game.score>old;
  if(isBest)safeStorage.set(bestKey(),game.score);
  safeStorage.set('runs',Number(safeStorage.get('runs')||0)+1);
  renderResults(isBest);updateSeed();updatePlayLabel();$('again-button').focus({preventScroll:true});
  $('status').textContent='';
}
function renderResults(isBest) {
  if(!resultGame)return;
  const won=resultGame.phase==='won';
  $('result-overlay').hidden=false;$('result-note').textContent=t(isBest?'newBest':won?(resultGame.mode==='boss'?'bossComplete':'complete'):'end');
  $('result-title').textContent=resultGame.mode==='boss'?(won?(language==='zh'?'你击败了这段过去。':'You beat their past.'):(language==='zh'?'这段过去，还没结束。':'This past fights back.')):t(won?'survive':'lost');$('result-score').textContent=resultGame.score.toLocaleString();$('result-detail').textContent=t('detail')(resultGame);
  if(resultIsDemo){$('result-note').textContent=t('demoNote');$('result-title').textContent=t('demoTitle');}
  $('clip-button').disabled=Boolean(clipPhase);
  const forgeable=!resultIsDemo&&encodeBoss(resultGame);$('forge-button').hidden=!forgeable;$('forge-button').textContent=language==='zh'?'把我的轨迹变成 BOSS ↗':'Turn my run into a boss ↗';
  $('share-button').disabled=mode==='boss'&&ownBoss&&!bossWon;
  $('share-button').textContent=mode==='boss'?(ownBoss&&!bossWon?(language==='zh'?'先击败自己，再分享':'Beat it before sharing'):(language==='zh'?'发送 BOSS 挑战':'Send boss challenge')):t('challenge');
}
function inputVector(){
  let x=Number(keys.has('ArrowRight')||keys.has('KeyD'))-Number(keys.has('ArrowLeft')||keys.has('KeyA'));
  let y=Number(keys.has('ArrowDown')||keys.has('KeyS'))-Number(keys.has('ArrowUp')||keys.has('KeyW'));
  if(pointer.active && x===0 && y===0){
    const dx=pointer.touch?pointer.x-pointer.originX:pointer.x-game.player.x;
    const dy=pointer.touch?pointer.y-pointer.originY:pointer.y-game.player.y;
    const distance=Math.hypot(dx,dy), scale=pointer.touch?55:20;
    if(distance>3){const power=Math.min(1,distance/scale);x=dx/distance*power;y=dy/distance*power;}
  }
  return {x,y,dash:dashPulse||keys.has('Space')||touchDash};
}
function playReplay({seekTicks=0}={}){
  if(!replayData)return;
  game=createGame(replayData.seed,replayData.boss?{boss:replayData.boss}:{});state='replay';replayIndex=0;replayFrame=0;replayAccumulator=0;resetInput();renderer.reset?.();
  let skipped=0;
  while(skipped<seekTicks&&replayIndex<replayData.inputs.length){const input=replayData.inputs[replayIndex];stepReplay(game,input);skipped++;replayFrame++;if(replayFrame>=input.frames){replayIndex++;replayFrame=0;}}
  renderer.reset?.();
  $('replay-tag').querySelector('span').textContent=clipPhase?t('clipRecording'):resultIsDemo?(language==='zh'?'脚本示范':'SCRIPTED DEMO'):t('replay');
  $('result-overlay').hidden=true;$('replay-tag').hidden=false;document.body.classList.add('replaying');$('status').textContent='';
}
function stopReplay(cancelClip=true){
  if(clipPhase){
    if(cancelClip){cancelRecording();$('share-status').textContent=t('clipCanceled');}
    else if(clipPhase==='recording'){renderer.render(game,{reducedMotion});replayClip.draw($('game-canvas'),game);replayClip.stop();}
  }
  state='result';game=resultGame;$('replay-tag').hidden=true;document.body.classList.remove('replaying');renderResults(false);updateHUD();
}
function cancelRecording(){replayClip.cancel();clipPhase=null;if(clipURL){$('clip-preview').pause();$('clip-preview').removeAttribute('src');URL.revokeObjectURL(clipURL);clipURL=null;}if($('clip-dialog').open)$('clip-dialog').close();}
function watchDemo(){
  if(state==='playing'||state==='paused')return;
  cancelRecording();$('share-status').textContent='';resultGame=runReplay(demoReplay);replayData=demoReplay;resultIsDemo=true;
  activeBoss=demoReplay.boss;activeBossCode=demoBossCode;seed=activeBoss.seed;mode='boss';challenge=false;ownBoss=false;bossWon=false;
  updateSeed();playReplay();
}
async function recordClip(){
  if(!replayData||clipPhase||!ReplayClip.isSupported())return;
  clipPhase='preparing';$('clip-button').disabled=true;$('share-status').textContent=t('clipPreparing');
  const ready=await replayClip.start({language,scriptedDemo:resultIsDemo,onComplete:(blob,extension)=>{
    clipPhase=null;if(state==='replay')stopReplay(false);$('clip-button').disabled=false;
    if(clipURL)URL.revokeObjectURL(clipURL);clipURL=URL.createObjectURL(blob);
    $('clip-preview').src=clipURL;$('clip-download').href=clipURL;$('clip-download').download=`after-you-${resultIsDemo?'scripted-demo':'replay'}.${extension}`;
    $('share-status').textContent=t('clipSaved');$('clip-dialog').showModal();
  },onError:()=>{clipPhase=null;if(state==='replay')stopReplay(false);$('clip-button').disabled=false;$('share-status').textContent=t('clipFailed');}});
  if(!ready||clipPhase!=='preparing')return;
  playReplay({seekTicks:Math.max(0,replayData.ticks-840)});clipPhase='recording';
}

function advanceReplay(dt){
  replayAccumulator+=dt;
  while(replayAccumulator>=1/60 && state==='replay'){
    const input=replayData.inputs[replayIndex];
    if(!input){stopReplay(false);break;}
    // Recorded dash values are one-frame edges. The engine handles their release.
    stepReplay(game,input);handleEvents(game.events);replayFrame++;replayAccumulator-=1/60;
    if(replayFrame>=input.frames){replayIndex++;replayFrame=0;}
    if(game.phase!=='playing'||replayIndex>=replayData.inputs.length)stopReplay(false);
  }
}
function frame(now){
  const dt=Math.min((now-lastFrame)/1000||0,1/15);lastFrame=now;
  if(state==='playing'){
    if(dashPulse)clearInput(game);step(game,inputVector(),dt);dashPulse=false;handleEvents(game.events);
    if(game.phase!=='playing')finish();
    else if(Math.floor(game.time)!==lastSecond){lastSecond=Math.floor(game.time);if(lastSecond===50)flash(t('countdown'),2);}
  }else if(state==='replay')advanceReplay(dt);
  renderer.render(game,{demo:state==='idle',reducedMotion,now:now/1000});if(clipPhase==='recording'&&replayClip.active)replayClip.draw($('game-canvas'),game);updateHUD();
  if(now>messageUntil)$('arena-message').classList.remove('visible');
  requestAnimationFrame(frame);
}
function challengeURL(){const link=new URL(location.protocol==='file:'?'https://after-you-echo-arcade.lanceryou.chatgpt.site/':location.href);link.search='';link.hash='';if(mode==='boss'){link.hash='boss='+activeBossCode;return link.href;}link.searchParams.set('seed',resultGame.seed);link.searchParams.set('score',String(resultGame.score));link.searchParams.set('v','1');return link.href;}
async function share(){
  if(!resultGame||(mode==='boss'&&ownBoss&&!bossWon))return;
  const link=challengeURL();const text=mode==='boss'?(language==='zh'?'这段走位变成了一个 BOSS。30 秒，9 次冲刺，你能打败它吗？':'These moves became a boss. 30 seconds. 9 strikes. Can you beat it?'):language==='zh'?`AFTER YOU 身后是你｜我拿了 ${resultGame.score} 分。相同光点，你能冲破自己的过去吗？`:`AFTER YOU · ${resultGame.score} points. Same lights. Can you outrun — and shatter — your past?`;
  try{
    if(navigator.share && matchMedia('(pointer:coarse)').matches){await navigator.share({title:'AFTER YOU',text,url:link});$('share-status').textContent=t('shared');}
    else {await navigator.clipboard.writeText(text+'\n'+link);$('share-status').textContent=t('copied');}
  }catch(error){if(error.name==='AbortError')return;const box=document.createElement('input');box.value=link;box.readOnly=true;box.setAttribute('aria-label',t('fallback'));box.style.cssText='width:95%;font-size:11px;padding:5px;background:#14212b;color:#c9ff85;border:1px solid #536177;';$('share-status').replaceChildren(document.createTextNode(t('fallback')),box);box.select();}
}
function download(blob,name){const objectURL=URL.createObjectURL(blob);const a=document.createElement('a');a.href=objectURL;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(objectURL),1000);}
async function saveCard(){
  if(!resultGame)return;
  const canvas=document.createElement('canvas');canvas.width=1200;canvas.height=630;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#080e15';ctx.fillRect(0,0,1200,630);
  ctx.strokeStyle='#bca6ff';ctx.lineWidth=2;for(const x of [89,119]){ctx.beginPath();ctx.arc(x,67,22,0,Math.PI*2);ctx.stroke();}
  ctx.fillStyle='#f4f1db';ctx.font='22px sans-serif';ctx.fillText('A F T E R  Y O U',165,76);
  if(resultIsDemo){ctx.fillStyle='#ffce9b';ctx.font='18px sans-serif';ctx.fillText(language==='zh'?'脚本示范 · 不计入个人成绩':'SCRIPTED DEMO · NOT A PERSONAL SCORE',650,76);}
  ctx.font='bold 72px sans-serif';ctx.fillText(language==='zh'?'身后是你。冲破过去。':'Your past is coming.',70,195);
  ctx.fillStyle='#c9ff85';ctx.font='bold 170px monospace';ctx.fillText(String(resultGame.score),65,390);
  ctx.fillStyle='#bca6ff';ctx.font='25px sans-serif';ctx.fillText(t('detail')(resultGame),74,455);
  ctx.fillStyle='#8e9bb4';ctx.font='18px monospace';ctx.fillText(resultGame.seed,74,515);
  ctx.font='18px sans-serif';ctx.fillText(language==='zh'?'同一片光点。下一个对手是你。':'Same lights. Your turn.',74,562);
  ctx.fillText(location.host,730,562);
  canvas.toBlob(blob=>{if(blob)download(blob,'after-you-'+resultGame.score+'.png');});
}

$('play-button').addEventListener('click',()=>state==='playing'?pause():state==='paused'?resume():start());
$('again-button').addEventListener('click',start);$('abandon-button').addEventListener('click',start);$('resume-button').addEventListener('click',resume);
$('pause-button').addEventListener('click',pause);$('daily-mode').addEventListener('click',()=>changeMode('daily'));$('free-mode').addEventListener('click',()=>changeMode('free'));$('boss-mode').addEventListener('click',()=>changeMode('boss'));
$('language-button').addEventListener('click',()=>{language=language==='en'?'zh':'en';safeStorage.set('language',language);applyLanguage();});
$('sound-button').addEventListener('click',()=>{soundEnabled=!soundEnabled;safeStorage.set('sound',soundEnabled);ensureAudio();applyLanguage();if(soundEnabled)tone(650);});
$('help-button').addEventListener('click',()=>{stoppedByHelp=state==='playing';if(stoppedByHelp)pause();$('help-dialog').showModal();});
$('help-play').addEventListener('click',()=>{$('help-dialog').close();if(state==='paused')resume();else start();});
$('clip-dialog').addEventListener('close',()=>{$('clip-preview').pause();});
document.querySelectorAll('.dialog-close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$('help-dialog').addEventListener('close',()=>{if(stoppedByHelp&&state==='paused'){$('resume-button').focus();}stoppedByHelp=false;});
$('source-link').addEventListener('click',event=>{if($('source-link').getAttribute('href')==='#source'){event.preventDefault();if(state==='playing')pause();$('source-dialog').showModal();}});
$('share-button').addEventListener('click',share);$('replay-button').addEventListener('click',playReplay);$('stop-replay').addEventListener('click',stopReplay);
$('download-button').addEventListener('click',()=>{if(replayData)download(new Blob([JSON.stringify(replayData)],{type:'application/json'}),'after-you-replay.json');});
$('card-button').addEventListener('click',saveCard);$('clip-button').addEventListener('click',recordClip);$('demo-button').addEventListener('click',watchDemo);
$('forge-button').addEventListener('click',()=>{const code=encodeBoss(resultGame);if(!code)return;activeBoss=decodeBoss(code);activeBossCode=code;seed=activeBoss.seed;mode='boss';ownBoss=true;bossWon=false;challenge=false;start();flash(language==='zh'?'这是你的轨迹。先打败它，再挑战朋友。':'These are your moves. Beat your boss to unlock sharing.',4);});
document.addEventListener('keydown',event=>{
  if(document.querySelector('dialog[open]'))return;
  if(event.code==='Escape'){if(state==='playing')pause();else if(state==='paused')resume();else if(state==='replay')stopReplay();return;}
  if(state!=='playing')return;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','Space'].includes(event.code)){event.preventDefault();if(event.code==='Space'&&!event.repeat)dashPulse=true;keys.add(event.code);}
});
document.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',()=>{resetInput();pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInput();pause();if(state==='replay')stopReplay();}});
function pointerPosition(event){const rect=$('game-canvas').getBoundingClientRect();return{x:(event.clientX-rect.left)/rect.width*800,y:(event.clientY-rect.top)/rect.height*560};}
$('game-canvas').addEventListener('pointerdown',event=>{
  if(state!=='playing'||pointer.active)return;event.preventDefault();const p=pointerPosition(event);Object.assign(pointer,p,{active:true,id:event.pointerId,originX:p.x,originY:p.y,touch:event.pointerType!=='mouse'});$('game-canvas').setPointerCapture(event.pointerId);
});
$('game-canvas').addEventListener('pointermove',event=>{if(pointer.active&&event.pointerId===pointer.id)Object.assign(pointer,pointerPosition(event));});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('game-canvas').addEventListener(name,event=>{if(event.pointerId===pointer.id)pointer.active=false;});
$('dash-button').addEventListener('pointerdown',event=>{event.preventDefault();if(state==='playing'){dashPulse=true;touchDash=true;$('dash-button').setPointerCapture(event.pointerId);}});
$('dash-button').addEventListener('click',event=>{if(event.detail===0&&state==='playing')dashPulse=true;});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('dash-button').addEventListener(name,()=>{touchDash=false;});

applyLanguage();
if(mode==='boss'){$('status').textContent=language==='zh'?'朋友的走位已经变成 BOSS。3 阶段，30 秒。':'Someone’s moves became your boss. 3 phases. 30 seconds.';}
if((incomingSeed&&!challenge&&mode!=='boss')||invalidBoss)$('status').textContent=t('invalid');
try{if(!await renderer.load())throw new Error('Sprite loading failed');}catch{$('status').textContent=language==='zh'?'部分美术资源加载失败，请刷新重试。':'Some artwork could not load. Please refresh to retry.';}
requestAnimationFrame(frame);


window.addEventListener('pagehide',cancelRecording);
}
