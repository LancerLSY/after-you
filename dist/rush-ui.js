import {createRush,stepRush,chooseRushUpgrade,clearRushInput,exportRushReplay,stepRushReplay,RUSH_UPGRADES} from './rush.js';
import {Renderer} from './renderer.js';

const WORDS={
  zh:{title:'把过去，<br>变成杀招。',lead:'按住瞄准，松手冲刺。<br>选出你的组合，让旧轨迹替你出手。',play:'开始暴走',resume:'继续暴走',pause:'暂停',again:'再来一局',same:'同一局再试',legacy:'经典 / 好友 BOSS',help:'玩法',soundOff:'声音关',soundOn:'声音开',keys:'按住鼠标或空格瞄准 · 松开冲刺 · WASD 可移动',touch:'按住场地瞄准，松手冲刺',score:'得分',time:'剩余',focus:'专注',life:'生命',loadout:'本局组合',empty:'6 秒与 16 秒，选择会改变打法的能力',aim:'按住瞄准，松手冲刺',first:'先击碎眼前的回声。命中就能继续冲刺。',phase:'过去开始回击',nemesis:'终局回声出现。击败它，才能获胜。',choose:'让过去换一种用法',chooseHint:'战斗已暂停。选一个会改变下一招的能力。',paused:'想好下一步。',pausedHint:'时间为你停下。',won:'这次，过去为你所用。',lost:'下一局，换一种组合。',details:g=>`${g.stats.kills} 次击碎 · ${g.stats.dashes} 次出手 · 最高 ×${g.bestCombo} · ${g.time.toFixed(1)} 秒`,share:'发出挑战',replay:'看回放',save:'保存回放',close:'关闭',replaying:'回放中',copied:'挑战链接已复制。朋友可以选择不同的能力组合。',copyLink:'复制挑战链接',best:'个人最佳',friend:s=>`朋友的挑战：${s} 分（自报成绩）`,pick:'选择',change:'组合已改变',howTitle:'每一次出手，都会回来。',howBody:'<p><strong>按住场地或空格</strong>进入短暂慢动作，调整瞄准；<strong>松开</strong>向落点冲刺。WASD / 方向键可移动。</p><p>冲刺命中会返还冷却。每次冲刺都会留下真实轨迹，随后变成回声。你可以让它替你攻击，也可以把它剪掉。</p><p>第 6 秒和第 16 秒，战斗暂停，选择能力。接力复制旧路线，折射让冲刺反弹，爆裂改变击杀范围，剪枝清除最旧的危险。</p><p>第 26 秒出现终局回声。<strong>36 秒内击败它</strong>才算获胜。专注用尽后不会继续慢放；Esc 随时暂停。</p>',ready:'明白，回到花园',footer:'36 秒战斗。四种能力。下一局会怎样？',nudge:'试试保留一条好路线，让接力再次命中。',challengeFail:'挑战链接无效，已准备新的回环。'},
  en:{title:'Your past.<br>Your next weapon.',lead:'Hold to aim. Release to dash.<br>Build a combination. Make your old moves fight for you.',play:'Enter the rush',resume:'Back to the rush',pause:'Pause',again:'One more run',same:'Retry this seed',legacy:'Classic / Friend bosses',help:'How to play',soundOff:'Sound off',soundOn:'Sound on',keys:'Hold mouse / Space to aim · Release to dash · WASD to move',touch:'Hold in the arena to aim. Release to dash.',score:'SCORE',time:'LEFT',focus:'FOCUS',life:'LIVES',loadout:'YOUR BUILD',empty:'Choose game-changing abilities at 6 and 16 seconds',aim:'Hold to aim. Release to dash.',first:'Break the echoes in front of you. Hits refund your next dash.',phase:'Your past fights back',nemesis:'Your final echo has arrived. Defeat it to win.',choose:'Give your past a new purpose',chooseHint:'Combat is paused. Pick how your next move will work.',paused:'Plan your next move.',pausedHint:'Time is standing still.',won:'Your past worked for you.',lost:'Next run. A different build.',details:g=>`${g.stats.kills} shatters · ${g.stats.dashes} dashes · best ×${g.bestCombo} · ${g.time.toFixed(1)}s`,share:'Send a challenge',replay:'Watch replay',save:'Save replay',close:'Close',replaying:'REPLAY',copied:'Challenge copied. Your friend can try a different build.',copyLink:'Copy this challenge link',best:'YOUR BEST',friend:s=>`Friend’s challenge: ${s} points (self-reported)`,pick:'Choose',change:'Your build has changed',howTitle:'Every move comes back.',howBody:'<p><strong>Hold in the arena or hold Space</strong> for brief slow motion. Aim, then <strong>release to dash</strong>. WASD / arrows also move.</p><p>A hit refunds your dash. Every dash leaves a real path that becomes an echo. Put those paths to work or prune them away.</p><p>At 6 and 16 seconds, combat pauses for an ability choice. Relay repeats your route, Ricochet reflects at walls, Burst changes kill geometry, and Prune removes your oldest danger.</p><p>The final echo arrives at 26 seconds. <strong>Defeat it before 36 seconds</strong> to win. Focus is limited. Esc pauses whenever you need a breath.</p>',ready:'Got it. Back to the garden.',footer:'36 seconds of combat. Four abilities. What will you build next?',nudge:'Keep a useful route and let Relay hit it again.',challengeFail:'That challenge was invalid. A fresh rush is ready.'}
};
const ICONS={relay:'↻',ricochet:'⌁',burst:'✳',prune:'╱'};

export async function mountRush(){
  const $=id=>document.getElementById(id);
  const read=(key)=>{try{return localStorage.getItem('after-you:'+key);}catch{return null;}};
  const save=(key,value)=>{try{localStorage.setItem('after-you:'+key,String(value));}catch{}};
  let language=read('language')==='zh'?'zh':read('language')==='en'?'en':(navigator.language||'en').toLowerCase().startsWith('zh')?'zh':'en';
  let sound=read('sound')==='true';
  let audio;
  const t=key=>WORDS[language][key];
  const url=new URL(location.href);
  const requestedSeed=url.searchParams.get('seed');
  const validSeed=requestedSeed&&/^[a-zA-Z0-9._-]{1,128}$/.test(requestedSeed);
  const newSeed=()=>{const n=new Uint32Array(2);crypto.getRandomValues(n);return 'rush-'+Array.from(n,x=>x.toString(36)).join('-');};
  let seed=validSeed?requestedSeed:newSeed();
  let game=createRush(seed);
  let state='idle';
  let result=null;
  let replay=null;
  let replayIndex=0,replayFrame=0,replayAccumulator=0,replayChoice=0;
  let lastFrame=0,messageUntil=0;
  let pointerHeld=false,spaceHeld=false,firePulse=false,pendingShot=null;
  let aimX=game.targets[0]?.x??560,aimY=game.targets[0]?.y??290;
  let pointerId=null;
  const keys=new Set();
  const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const legacyLocation=new URL(location.href);legacyLocation.search='?classic=1';legacyLocation.hash='';
  const legacyURL=location.protocol==='file:'?legacyLocation.href:'./?classic=1';
  document.body.className='rush-body';
  document.body.innerHTML=`<div class="shell rush-shell">
    <header class="site-header"><a id="r-home" class="brand" href="./"><svg viewBox="0 0 52 30" aria-hidden="true"><circle cx="17" cy="15" r="13"/><circle cx="35" cy="15" r="13"/></svg><span>AFTER YOU</span></a><nav aria-label="Main navigation"><button id="r-help"></button><button id="r-sound" aria-pressed="false"></button><button id="r-language"></button><a href="https://github.com/LancerLSY/after-you" target="_blank" rel="noopener noreferrer">GitHub ↗</a></nav></header>
    <main class="rush-layout"><aside class="rush-intro"><h1 id="r-title"></h1><p id="r-lead" class="lede"></p><button id="r-play" class="primary"></button><p id="r-controls" class="rush-controls"></p><p class="rush-best"><span id="r-best-label"></span> <strong id="r-best">—</strong></p><p id="r-friend" class="challenge-label" hidden></p><a id="r-legacy" class="rush-legacy" href="${legacyURL}"></a><p id="r-status" class="status" role="status" aria-live="polite"></p></aside>
    <section class="rush-stage" aria-label="Echo Rush game"><div class="arena rush-arena"><canvas id="r-canvas" width="800" height="560" tabindex="0" aria-label="Hold in the arena to aim. Release to dash. WASD to move. Escape to pause."></canvas><div class="rush-hud" aria-hidden="true"><div><span id="r-score-label"></span><strong id="r-score">0000</strong></div><span id="r-phase"></span><div><strong id="r-timer">36.0</strong><span id="r-time-label"></span></div></div><div class="rush-vitals"><span id="r-health"></span><span id="r-combo"></span><label><span id="r-focus-label"></span><meter id="r-focus" min="0" max="1.2" value="1.2"></meter></label><button id="r-pause" aria-label="Pause">Ⅱ</button></div><p id="r-message" class="rush-message" aria-hidden="true"></p><div id="r-replay-tag" class="replay-tag" hidden><span id="r-replay-label"></span><button id="r-stop"></button></div><p id="r-arena-hint" class="rush-arena-hint"></p></div><div class="rush-loadout"><span id="r-loadout-label"></span><div id="r-build"></div></div></section></main><footer><span></span><p id="r-footer"></p><span></span></footer>
  </div>
  <dialog id="r-upgrades" class="rush-upgrade-dialog"><h2 id="r-choice-title"></h2><p id="r-choice-hint"></p><div id="r-cards" class="rush-cards"></div></dialog>
  <dialog id="r-paused"><h2 id="r-pause-title"></h2><p id="r-pause-hint"></p><button id="r-resume" class="primary"></button></dialog>
  <dialog id="r-result" class="rush-result"><h2 id="r-result-title"></h2><strong id="r-result-score"></strong><p id="r-result-detail"></p><div id="r-result-build" class="rush-result-build"></div><div class="rush-result-actions"><button id="r-again" class="primary"></button><button id="r-same" class="secondary"></button><button id="r-share" class="secondary"></button></div><div class="result-links"><button id="r-watch"></button><button id="r-save"></button><button id="r-back"></button></div><p id="r-share-status" role="status"></p></dialog>
  <dialog id="r-help-dialog"><button id="r-help-close" class="dialog-close" aria-label="Close">×</button><h2 id="r-help-title"></h2><div id="r-help-body"></div><button id="r-help-done" class="primary"></button></dialog>`;
  $('r-home').href=location.protocol==='file:'?location.href:'./';
  document.title=language==='zh'?'AFTER YOU — 回声暴走':'AFTER YOU — Echo Rush';
  const renderer=new Renderer($('r-canvas'));
  function ability(id){const a=RUSH_UPGRADES[id]??RUSH_UPGRADES.find?.(item=>item.id===id);return a?.[language]??{title:id,description:''};}
  function buildMarkup(container,upgrades){const key=language+':'+upgrades.join(',');if(container.dataset.buildKey===key)return;container.dataset.buildKey=key;container.replaceChildren();for(const id of upgrades){const span=document.createElement('span');span.textContent=`${ICONS[id]??'◇'} ${ability(id).title}`;container.append(span);}if(!upgrades.length)container.textContent=t('empty');}
  function applyLanguage(){
    document.title=language==='zh'?'AFTER YOU — 回声暴走':'AFTER YOU — Echo Rush';
    document.documentElement.lang=language==='zh'?'zh-CN':'en';
    $('r-title').innerHTML=t('title');$('r-lead').innerHTML=t('lead');$('r-help').textContent=t('help');$('r-sound').textContent=t(sound?'soundOn':'soundOff');$('r-sound').setAttribute('aria-pressed',String(sound));$('r-language').textContent=language==='zh'?'EN':'中文';
    $('r-controls').textContent=(matchMedia('(pointer:coarse)').matches||matchMedia('(max-width:540px)').matches)?t('touch'):t('keys');$('r-best-label').textContent=t('best');$('r-legacy').textContent=t('legacy');$('r-footer').textContent=t('footer');$('r-score-label').textContent=t('score');$('r-time-label').textContent=t('time');$('r-focus-label').textContent=t('focus');$('r-loadout-label').textContent=t('loadout');$('r-arena-hint').textContent=t('aim');$('r-replay-label').textContent=t('replaying');$('r-stop').textContent=t('close');$('r-pause-title').textContent=t('paused');$('r-pause-hint').textContent=t('pausedHint');$('r-resume').textContent=t('resume');$('r-help-title').textContent=t('howTitle');$('r-help-body').innerHTML=t('howBody');$('r-help-done').textContent=t('ready');$('r-again').textContent=t('again');$('r-same').textContent=t('same');$('r-share').textContent=t('share');$('r-watch').textContent=t('replay');$('r-save').textContent=t('save');$('r-back').textContent=t('close');
    updateChallengeLabel();
    $('r-best').textContent=read('rush-best')??'—';updateHUD();if(state==='choosing')showChoices();if(state==='result')showResult();
  }
  function updateChallengeLabel(){const score=url.searchParams.get('score');$('r-friend').hidden=!(validSeed&&seed===requestedSeed&&/^\d{1,8}$/.test(score??''));$('r-friend').textContent=t('friend')(score??0);}
  function queueShot(){pendingShot={aimX,aimY};firePulse=true;}
  function resetInput(){pointerHeld=false;spaceHeld=false;firePulse=false;pendingShot=null;keys.clear();clearRushInput(game);}
  function tone(frequency,duration=.1){if(!sound)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();if(audio.state==='suspended')audio.resume().catch(()=>{});const o=audio.createOscillator(),v=audio.createGain();o.frequency.setValueAtTime(frequency,audio.currentTime);v.gain.setValueAtTime(.035,audio.currentTime);v.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(v);v.connect(audio.destination);o.start();o.stop(audio.currentTime+duration);o.onended=()=>{o.disconnect();v.disconnect();};}catch{}}
  function flash(text,seconds=1.6){$('r-message').textContent=text;$('r-message').classList.add('visible');messageUntil=performance.now()+seconds*1000;}
  function updateHUD(){
    $('r-score').textContent=String(game.score).padStart(4,'0');$('r-timer').textContent=Math.max(0,game.duration-game.time).toFixed(1);$('r-phase').textContent=game.time>=26?(language==='zh'?'终局回声':'FINAL ECHO'):game.time>=16?(language==='zh'?'组合成形':'BUILD ONLINE'):game.time>=6?(language==='zh'?'过去为你所用':'PUT YOUR PAST TO WORK'):'';
    $('r-health').textContent='◆ '.repeat(Math.max(0,game.player.hp))+'◇ '.repeat(Math.max(0,3-game.player.hp));$('r-health').setAttribute('aria-label',`${game.player.hp} ${t('life')}`);$('r-combo').textContent=game.combo>1?'×'+game.combo:'';$('r-focus').value=game.focus;$('r-focus').setAttribute('aria-label',t('focus'));
    if(state==='playing'||state==='paused'){const text=language==='zh'?`出手 ${game.stats.dashes} · 命中 ${game.stats.hits}`:`${game.stats.dashes} dashes · ${game.stats.hits} hits`;if($('r-status').textContent!==text)$('r-status').textContent=text;}
    $('r-play').textContent=state==='playing'?t('pause'):state==='paused'?t('resume'):state==='choosing'?t('pick'):t('play');$('r-play').disabled=state==='choosing'||state==='replay';$('r-pause').hidden=state!=='playing';$('r-arena-hint').hidden=state!=='idle';buildMarkup($('r-build'),game.upgrades);
  }
  function events(){renderer.onEvents(game.events);for(const e of game.events){if(e.type==='dash')tone(180,.06);if(e.type==='shatter'){tone(520+Math.min(8,game.combo)*75);if(e.points>0)flash(`+${e.points}  ×${game.combo}`,.6);}if(e.type==='damage'){tone(90,.25);}if(e.type==='boss')flash(t('nemesis'),2.2);if(e.type==='upgrade')flash(`${t('change')} · ${ability(e.id).title}`,2);}}
  function start(fresh=true){
    if(fresh)seed=newSeed();updateChallengeLabel();game=createRush(seed);state='playing';result=null;replay=null;resetInput();renderer.reset();for(const id of ['r-result','r-paused','r-upgrades'])if($(id).open)$(id).close();$('r-share-status').textContent='';document.body.classList.add('rush-playing');aimX=game.targets[0]?.x??560;aimY=game.targets[0]?.y??290;flash(t('first'),3);updateHUD();$('r-canvas').focus({preventScroll:true});tone(500,.07);
    if(matchMedia('(max-width:860px)').matches)$('r-canvas').scrollIntoView({block:'center',behavior:reducedMotion?'instant':'smooth'});
  }
  function pause(){if(state!=='playing')return;state='paused';resetInput();$('r-paused').showModal();updateHUD();}
  function resume(){if(state!=='paused')return;state='playing';$('r-paused').close();resetInput();updateHUD();$('r-canvas').focus({preventScroll:true});}
  function showChoices(){
    $('r-choice-title').textContent=t('choose');$('r-choice-hint').textContent=t('chooseHint');const cards=$('r-cards');cards.replaceChildren();
    for(const [i,id] of game.offers.entries()){const button=document.createElement('button');button.className='rush-card';const icon=document.createElement('span');icon.className='rush-card-icon';icon.textContent=ICONS[id]??'◇';const title=document.createElement('strong');title.textContent=`${i+1}. ${ability(id).title}`;const description=document.createElement('span');description.textContent=ability(id).description;button.append(icon,title,description);button.addEventListener('click',()=>pick(id));cards.append(button);}
    if(!$('r-upgrades').open)$('r-upgrades').showModal();
  }
  function pick(id){if(state!=='choosing')return;chooseRushUpgrade(game,id);$('r-upgrades').close();state='playing';resetInput();events();updateHUD();$('r-canvas').focus({preventScroll:true});}
  function finish(){state='result';result=game;replay=exportRushReplay(game);resetInput();document.body.classList.remove('rush-playing');const best=Number(read('rush-best'))||0;if(game.score>best)save('rush-best',game.score);$('r-best').textContent=read('rush-best')??'—';showResult();}
  function showResult(){if(!result)return;$('r-result-title').textContent=t(result.phase==='won'?'won':'lost');$('r-result-score').textContent=result.score.toLocaleString();$('r-result-detail').textContent=t('details')(result);buildMarkup($('r-result-build'),result.upgrades);if(!$('r-result').open)$('r-result').showModal();}
  function watch(){if(!replay)return;document.body.classList.add('rush-playing');game=createRush(replay.seed);state='replay';replayIndex=0;replayFrame=0;replayAccumulator=0;replayChoice=0;resetInput();renderer.reset();$('r-result').close();$('r-replay-tag').hidden=false;}
  function stopReplay(){document.body.classList.remove('rush-playing');state='result';game=result;$('r-replay-tag').hidden=true;showResult();updateHUD();}
  function replayStep(dt){replayAccumulator+=dt;while(replayAccumulator>=1/60&&state==='replay'){
    while(game.phase==='choosing'){const choice=replay.choices[replayChoice++];if(!choice||choice.tick!==game.timeTicks){stopReplay();return;}chooseRushUpgrade(game,choice.id);}
    const input=replay.inputs[replayIndex];if(!input){stopReplay();return;}stepRushReplay(game,input);events();replayFrame++;replayAccumulator-=1/60;if(replayFrame>=input.frames){replayFrame=0;replayIndex++;}if(game.phase==='won'||game.phase==='lost'||replayIndex>=replay.inputs.length)stopReplay();
  }}
  function frame(now){const dt=Math.min(.08,Math.max(0,(now-lastFrame)/1000||0));lastFrame=now;
    if(state==='playing'){stepRush(game,{aimX:pendingShot?.aimX??aimX,aimY:pendingShot?.aimY??aimY,aiming:pointerHeld||spaceHeld,fire:firePulse,...movementInput()},dt);firePulse=false;pendingShot=null;events();if(game.phase==='choosing'){state='choosing';resetInput();showChoices();}else if(game.phase==='won'||game.phase==='lost')finish();}
    else if(state==='replay')replayStep(dt);
    renderer.render(game,{demo:state==='idle',reducedMotion});updateHUD();if(now>messageUntil)$('r-message').classList.remove('visible');requestAnimationFrame(frame);
  }
  function portrait(){return matchMedia('(max-width:540px)').matches&&document.body.classList.contains('rush-playing');}
  function movementInput(){const x=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));const y=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));return portrait()?{moveX:y,moveY:-x}:{moveX:x,moveY:y};}
  function position(e){const r=$('r-canvas').getBoundingClientRect();const u=(e.clientX-r.left)/r.width,v=(e.clientY-r.top)/r.height;aimX=Math.max(24,Math.min(776,(portrait()?v:u)*800));aimY=Math.max(64,Math.min(516,(portrait()?1-u:v)*560));}

  $('r-canvas').addEventListener('pointerdown',e=>{if(state!=='playing'||pointerHeld)return;e.preventDefault();pointerHeld=true;pointerId=e.pointerId;position(e);$('r-canvas').setPointerCapture(e.pointerId);});
  $('r-canvas').addEventListener('pointermove',e=>{if(state==='playing'&&(!pointerHeld||pointerId===e.pointerId))position(e);});
  $('r-canvas').addEventListener('pointerup',e=>{if(pointerHeld&&pointerId===e.pointerId){position(e);pointerHeld=false;if(state==='playing')queueShot();}});
  for(const type of ['pointercancel','lostpointercapture'])$('r-canvas').addEventListener(type,e=>{if(e.pointerId===pointerId)pointerHeld=false;});
  document.addEventListener('keydown',e=>{if($('r-help-dialog').open)return;if(e.code==='Escape'){e.preventDefault();if(state==='playing')pause();else if(state==='paused')resume();else if(state==='replay')stopReplay();return;}if(state==='choosing'&&/^Digit[123]$/.test(e.code)){e.preventDefault();const id=game.offers[Number(e.code.slice(-1))-1];if(id)pick(id);return;}if(state!=='playing')return;if(e.code==='Space'){e.preventDefault();if(!e.repeat)spaceHeld=true;}if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();keys.add(e.code);}});
  document.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Space'&&spaceHeld){spaceHeld=false;if(state==='playing')queueShot();}});
  window.addEventListener('blur',()=>{resetInput();pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){resetInput();pause();if(state==='replay')stopReplay();}});
  $('r-play').addEventListener('click',()=>{if(state==='playing')pause();else if(state==='paused')resume();else if(state==='idle'||state==='result')start(state==='result');});$('r-pause').addEventListener('click',pause);$('r-resume').addEventListener('click',resume);$('r-again').addEventListener('click',()=>start(true));$('r-same').addEventListener('click',()=>start(false));$('r-watch').addEventListener('click',watch);$('r-stop').addEventListener('click',stopReplay);
  $('r-back').addEventListener('click',()=>{$('r-result').close();game=createRush(seed);state='idle';renderer.reset();updateHUD();});
  $('r-language').addEventListener('click',()=>{language=language==='zh'?'en':'zh';save('language',language);applyLanguage();});$('r-sound').addEventListener('click',()=>{sound=!sound;save('sound',sound);applyLanguage();if(sound)tone(650);});
  $('r-help').addEventListener('click',()=>{pause();$('r-help-dialog').showModal();});for(const id of ['r-help-close','r-help-done'])$(id).addEventListener('click',()=>$('r-help-dialog').close());$('r-upgrades').addEventListener('cancel',e=>e.preventDefault());$('r-paused').addEventListener('cancel',e=>{e.preventDefault();resume();});
  $('r-result').addEventListener('cancel',e=>{e.preventDefault();$('r-back').click();});
  $('r-share').addEventListener('click',async()=>{if(!result)return;const link=new URL(location.protocol==='file:'?'https://after-you-echo-arcade.lanceryou.chatgpt.site/':location.href);link.search='';link.hash='';link.searchParams.set('rush','1');link.searchParams.set('v','2');link.searchParams.set('seed',result.seed);link.searchParams.set('score',String(result.score));const names=result.upgrades.map(id=>ability(id).title).join(' + ');const text=language==='zh'?`AFTER YOU｜${names}，${result.score} 分。换个组合，挑战我的过去。`:`AFTER YOU · ${names} · ${result.score} points. Try a different build.`;try{await navigator.clipboard.writeText(text+'\n'+link.href);$('r-share-status').textContent=t('copied');}catch{const field=document.createElement('input');field.value=link.href;field.readOnly=true;field.setAttribute('aria-label',t('copyLink'));$('r-share-status').replaceChildren(field);field.select();}});
  $('r-save').addEventListener('click',()=>{if(!replay)return;const link=document.createElement('a');const objectURL=URL.createObjectURL(new Blob([JSON.stringify(replay)],{type:'application/json'}));link.href=objectURL;link.download='after-you-rush-replay.json';link.click();setTimeout(()=>URL.revokeObjectURL(objectURL),1000);});
  applyLanguage();if(requestedSeed&&!validSeed)$('r-status').textContent=t('challengeFail');
  await renderer.load();requestAnimationFrame(frame);
}
