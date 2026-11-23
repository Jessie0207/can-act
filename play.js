(function(){
'use strict';
const B=window.OPENING_BASE;if(!B||!B.audio||B.music?.version==='v53-puzzle-score')return;
const audio=B.audio;
const tracks={bass:{title:'Bass Walker',level:.18},shuffle:{title:'George Street Shuffle',level:.14},noir:{title:'Hard Boiled',level:.14},rag:{title:'Fig Leaf Rag',level:.13},show:{title:'Happy Happy Game Show',level:.12},understudy:{title:'The Understudy',level:.14}};
tracks.fanfare={title:'House Lights Down',level:.45,once:true};
tracks['end-card']={title:'Curtain Call in B-flat',level:.48,once:true,asset:'curtain-call-jazz'};
const ids={bass:'USUAN1200071',shuffle:'USUAN1300035',noir:'USUAN1700076',rag:'USUAN1100701',show:'USUAN1600006'};
const marker=document.getElementById('opening-music-state')||document.createElement('span');marker.id='opening-music-state';marker.hidden=true;if(!marker.isConnected)document.body.append(marker);
const originalUnlock=audio.unlock.bind(audio),originalSetEnabled=audio.setEnabled.bind(audio);
let requested='bass',node=null,gain=null,epoch=0,started=0,offset=0,gesture=false,loadingToken=null;
let scoreFinished=false,finishOnProps=false;
const offsets=new Map(),buffers=new Map(),pending=new Map(),ducks=new Set(),pauses=new Set();
function silenceLegacyScore(){
  // TheatreAudio.music is a procedural background score, not its shared SFX bus.
  // Clearing its scheduler preserves tone/noise/coin/laugh effects.
  if(audio.timer!==null&&audio.timer!==undefined){clearInterval(audio.timer);audio.timer=null;}
}
audio.music=()=>{};silenceLegacyScore();
let observedContext=null;
async function unlockContext(){
  try{
    const result=originalUnlock();silenceLegacyScore();
    const ctx=audio.ctx;
    if(ctx&&ctx!==observedContext){
      observedContext=ctx;
      ctx.addEventListener?.('statechange',()=>{if(ctx.state==='running')resume();});
    }
    if(ctx?.state==='interrupted')await ctx.resume();
    await result;
  }finally{silenceLegacyScore();}
}
function state(value){marker.dataset.state=value;marker.dataset.track=requested||'silence';marker.dataset.title=requested?tracks[requested].title:'';marker.dataset.ducked=String(ducks.size>0);marker.dataset.enabled=String(audio.enabled);marker.dataset.activeSources=node?'1':'0';marker.dataset.paused=String(pauses.size>0);}
function target(){return requested&&audio.enabled&&!pauses.size?tracks[requested].level*(ducks.size?.23:1):0;}
function fade(){if(gain&&audio.ctx){const param=gain.gain,t=audio.ctx.currentTime;param.cancelScheduledValues(t);param.setTargetAtTime(target(),t,.08);}marker.dataset.gain=String(target());marker.dataset.ducked=String(ducks.size>0);}
function stop(){
  epoch++;loadingToken=null;
  if(node){
    const old=node,g=gain,c=audio.ctx;
    offset=(offset+Math.max(0,c.currentTime-started))%old.buffer.duration;offsets.set(old.musicId,offset);
    node=null;gain=null;
    // Hard ownership boundary: disconnect old BGM before any replacement starts.
    // A source with a scheduled fade-out must never overlap the next scene.
    g.gain.cancelScheduledValues(c.currentTime);g.gain.setValueAtTime(0,c.currentTime);
    old.onended=null;try{old.stop();}catch{}old.disconnect();g.disconnect();
  }
  marker.dataset.activeSources='0';marker.dataset.gain='0';
}
async function buffer(id){
  if(buffers.has(id))return buffers.get(id);if(pending.has(id))return pending.get(id);
  const task=(async()=>{
    const stem=tracks[id].asset||id;
    const fallback=id==='end-card'?'audio-v63/'+stem:id==='fanfare'?'music-v53/curtain-fanfare':id==='understudy'?'music-v53/understudy':'music-v27/'+id;
    const sources=[B.assets['assets/audio-v63/'+stem+'.mp3'],B.assets['assets/'+fallback+'.ogg']].filter(Boolean);
    let decoded,failure;
    for(const src of sources){
      try{
        let data;
        if(src.startsWith('data:')){const raw=atob(src.split(',')[1]);data=Uint8Array.from(raw,c=>c.charCodeAt(0)).buffer;}
        else{const response=await fetch(src);if(!response.ok)throw Error('Music HTTP '+response.status);data=await response.arrayBuffer();}
        decoded=await audio.ctx.decodeAudioData(data);break;
      }catch(error){failure=error;}
    }
    if(!decoded)throw failure||Error('Missing local music asset: '+id);
    buffers.set(id,decoded);
    while(buffers.size>2){const key=[...buffers.keys()].find(k=>k!==id&&k!==requested);if(!key)break;buffers.delete(key);}
    return decoded;
  })();
  pending.set(id,task);try{return await task;}finally{pending.delete(id);}
}
async function resume(){
  if(!gesture||!audio.enabled||document.hidden||!requested||pauses.size){state(!requested?'silent':!audio.enabled?'muted':document.hidden?'hidden':pauses.size?'paused':'waiting');return;}
  if(scoreFinished){state('ended');return;}
  if(node||loadingToken!==null)return;
  const id=requested,token=epoch;loadingToken=token;state('loading');
  try{
    await unlockContext();if(!audio.ctx||audio.ctx.state!=='running')return;
    const decoded=await buffer(id);
    if(token!==epoch||id!==requested||!audio.enabled||document.hidden||pauses.size||node)return;
    const c=audio.ctx,s=c.createBufferSource(),g=c.createGain();s.buffer=decoded;s.loop=!tracks[id].once;s.musicId=id;
    offset=(offsets.get(id)||0)%decoded.duration;g.gain.value=0;s.connect(g);g.connect(c.destination);
    // Ownership is assigned before start so re-entrant input cannot start a second loop.
    node=s;gain=g;started=c.currentTime;
    s.onended=()=>{
      s.disconnect();g.disconnect();
      if(node!==s)return;
      node=null;gain=null;scoreFinished=!!tracks[id].once;state('ended');
      if(finishOnProps)choose('shuffle');
    };
    s.start(0,offset);fade();state('playing');marker.dataset.duration=String(decoded.duration);
  }catch(error){if(token===epoch){stop();state('error');}console.warn('[OPENING music] '+id+': '+error.message);}
  finally{if(loadingToken===token)loadingToken=null;}
}
function choose(id){
  silenceLegacyScore();if(id===requested){resume();return;}
  stop();requested=id;offset=0;scoreFinished=false;finishOnProps=false;
  if(id&&tracks[id].once)offsets.delete(id);
  state(id?'waiting':'silent');resume();
}
const comedyCredits=[
  ['Slide whistle','sheepfilms','202753'],['Coin marimba','sgossner','374699'],
  ['Banjo spring','Denis%20Chapon','109435'],['Wooden percussion','sgossner','375641'],
  ['Comedy drum fill','OverlookHotelRecords','271208'],['Brush snare','jannevse','614387'],
  ['Cloth','tilano408','445670'],['Page turn','gynation','82379'],['Applause','soundmary','117592']
].map(([title,author,id])=>'<a href="https://freesound.org/people/'+author+'/sounds/'+id+'/" target="_blank" rel="noopener">'+title+' — '+decodeURIComponent(author)+'</a>').join('; ');
const music=B.music={
  version:'v53-puzzle-score',
  prepareEndCard(){if(gesture&&audio.enabled&&audio.ctx)buffer('end-card').catch(()=>{});},
  endCard(){choose('end-card');},
  original(index){window.OpeningSFX?.stop();choose(index===0?'bass':'shuffle');},
  scene(name){
    const puzzle=['level','run','storybook'].includes(name);
    // Gameplay refreshes its buttons on phase changes, including at the finish.
    // Let the same piano take and the final clap run through those refreshes.
    if(!puzzle||requested!=='understudy')window.OpeningSFX?.stop();
    if(name==='props'&&requested==='fanfare'&&node){finishOnProps=true;return;}
    if(name==='curtain'){
      if(requested==='fanfare')choose(null);
      choose('fanfare');return;
    }
    choose(puzzle?'understudy':['coins','walk','reveal'].includes(name)?null:name==='gacha'?'show':'shuffle');
  },
  duck(value,reason='narration'){if(value)ducks.add(reason);else ducks.delete(reason);fade();},
  pause(value,reason='manual'){if(value){pauses.add(reason);stop();state('paused');}else{pauses.delete(reason);resume();}},
  stop(){choose(null);},
  debug(){return{track:requested,title:requested?tracks[requested].title:null,activeSources:node?1:0,loading:loadingToken!==null,ducks:[...ducks],pauses:[...pauses],legacyTimer:audio.timer};},
  credits:'<details class="opening-music-credits"><summary>Music and sound credits</summary>'+Object.keys(ids).map(id=>'<p>“'+tracks[id].title+'” — Kevin MacLeod (<a href="https://incompetech.com/music/royalty-free/index.html?isrc='+ids[id]+'" target="_blank" rel="noopener">incompetech.com</a>)<br><a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a> · Adapted for looping, scene changes and playback levels</p>').join('')+'<p>“House Lights Down” is the Can Act opening fanfare, produced with Eleven Music.</p><p>“Curtain Call in B-flat” is an original Can Act swing-band end title for brass, reeds, rhythm guitar, double bass and drums.</p><p>“The Understudy” is an original Can Act piano arrangement. Piano samples from <a href="https://versilian-studios.com/vsco-community/" target="_blank" rel="noopener">Versilian Studios Chamber Orchestra 2 CE</a> (CC0 1.0).</p><p>Footwork: <a href="https://freesound.org/people/tim.kahn/sounds/185228/" target="_blank" rel="noopener">irish dancing.wav</a> — tim.kahn · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a><br>Trimmed, converted to mono, equalised, compressed and levelled.</p><p>Voice: <a href="https://freesound.org/people/younoise/sounds/696384/" target="_blank" rel="noopener">Water Voice.wav</a> — younoise. <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener">CC0</a>.</p><p>Silent-comedy sound effects: '+comedyCredits+'. Recordings licensed under <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener">CC0 1.0</a>. Excerpts trimmed, converted to mono, equalised and levelled.</p><p>Audience sigh — Shane Vincent / GameSoundCon. <a href="https://freesound.org/people/ShangusBurger/sounds/764106/" target="_blank" rel="noopener">Field recording</a>, CC0. Edited for length and level.</p></details>'
};
audio.unlock=function(){const result=unlockContext();resume();return result;};
audio.setEnabled=function(on){
  if(!on){stop();window.OpeningSFX?.stop();window.OpeningNarration?.stop('sound-off');}
  originalSetEnabled(on);silenceLegacyScore();if(!on)state('muted');else resume();
};
if(audio.stopLaughs&&audio.laugh){
  const oldStop=audio.stopLaughs.bind(audio),oldLaugh=audio.laugh.bind(audio);
  audio.stopLaughs=function(){oldStop();music.duck(false,'laugh');};
  audio.laugh=function(index){
    const result=oldLaugh(index),epoch=audio.laughEpoch;if(audio.enabled&&Number.isInteger(audio.laughActiveIndex))music.duck(true,'laugh');
    return Promise.resolve(result).then(()=>{
      if(epoch!==audio.laughEpoch)return;
      const laugh=audio.laughNode;if(!laugh){music.duck(false,'laugh');return;}
      music.duck(true,'laugh');laugh.addEventListener('ended',()=>{if(!audio.laughNode||audio.laughNode===laugh)music.duck(false,'laugh');},{once:true});
    },error=>{if(epoch===audio.laughEpoch)music.duck(false,'laugh');throw error;});
  };
}
function activate(event){
  // Touch activation is granted on release on WebKit. Repeat the native resume
  // synchronously in that gesture even if an earlier pointerdown is still pending.
  if(event?.isTrusted===false||document.hidden)return;
  gesture=true;
  if(audio.enabled&&audio.ctx&&audio.ctx.state!=='running')unlockContext().catch(()=>{});
  resume();
}
for(const event of ['pointerdown','touchend','pointerup','click','keydown'])document.addEventListener(event,activate,{capture:true,passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();window.OpeningSFX?.stop();state('hidden');}else resume();});
window.addEventListener('pagehide',()=>{stop();window.OpeningSFX?.stop();silenceLegacyScore();});
window.addEventListener('pageshow',()=>{if(!document.hidden)resume();});
const help=document.getElementById('help-dialog');if(help)help.insertAdjacentHTML('beforeend',music.credits);state('waiting');
const legacyProgramme=document.getElementById('program-dialog');
if(legacyProgramme){
  // Native close, Escape and selecting a scene all remove the same open attribute.
  new MutationObserver(()=>music.pause(legacyProgramme.open,'legacy-programme'))
    .observe(legacyProgramme,{attributes:true,attributeFilter:['open']});
}
})();

;
(function(){
'use strict';
const B=window.OPENING_BASE;if(!B?.audio||window.OpeningSFX?.version==='v44-audio-correction')return;
const debugEnabled=/(?:^\?|&)sfxdebug=1(?:&|$)/.test(window.location?.search||'');
function report(event,data={}){if(debugEnabled)console.info('[SFX]',JSON.stringify({event,...data}));}
const audio=B.audio,samples=new Map(),pending=new Map(),failed=new Set(),last=new Map();
const samplePaths=Object.fromEntries([
  ...['whistle-up','whistle-down','spring','claves','rimshot','brush','cloth','paper','applause'].map(id=>[id,'assets/sfx-v42/'+id+'.mp3']),
  ...['tap','vocal'].map(id=>[id,'assets/sfx-v39/'+id+'.mp3']),
  ['coin-note','assets/sfx-v44/coin-note.mp3'],
  ['film-slate','assets/sfx-v54/film-slate.mp3'],
  ['audience-sigh','assets/audio-v63/audience-disappointed.mp3'],
  ['house-ovation','assets/audio-v63/curtain-ovation.mp3'],
  ['throat-laugh','assets/audio-v63/can-3.mp3']
]);
// A clue or punchline outranks incidental footsteps. Nothing is queued to replay.
const definitions={
  slate:{sample:'film-slate',volume:.62,gap:500,priority:102},
  footstep:{sample:'claves',volume:.30,rate:.9,duration:.065,gap:160,priority:5},
  paper:{sample:'paper',volume:.43,duration:.28,gap:150,priority:20},
  swap:{sample:'brush',volume:.38,duration:.22,gap:100,priority:30},
  ratchet:{sample:'claves',volume:.40,rate:1.05,duration:.065,gap:65,priority:35},
  drumRoll:{sample:'brush',volume:.43,rate:1,duration:.09,gap:70,priority:45},
  latch:{sample:'claves',volume:.43,rate:.78,duration:.10,gap:120,priority:50},
  braceSeat:{sample:'rimshot',volume:.38,rate:.78,duration:.13,gap:220,priority:61},
  pulleyRise:{sample:'whistle-up',volume:.34,rate:.91,duration:.48,gap:350,priority:65},
  pawlCatch:{sample:'claves',volume:.46,rate:1.31,duration:.14,gap:160,priority:66},
  sceneryRelease:{sample:'cloth',volume:.46,rate:.91,duration:.38,gap:300,priority:64},
  safetyPin:{sample:'tap',volume:.35,rate:1.2,offset:.04,duration:.19,gap:200,priority:66},
  lowerChest:{sample:'whistle-down',volume:.31,rate:.76,duration:.42,gap:350,priority:65},
  boxJolt:{sample:'brush',volume:.51,rate:.73,duration:.25,gap:330,priority:68},
  brakeSet:{sample:'claves',volume:.48,rate:.65,duration:.17,gap:200,priority:66},
  coin:{sample:'claves',volume:.48,rate:1.45,duration:.16,gap:140,priority:55},
  land:{sample:'brush',volume:.42,rate:.78,duration:.20,gap:130,priority:60},
  capsule:{sample:'claves',volume:.46,rate:.70,duration:.14,gap:140,priority:60},
  spring:{sample:'spring',volume:.45,duration:.35,gap:300,priority:60},
  jump:{sample:'brush',volume:.40,rate:1.3,duration:.18,gap:220,priority:60},
  carrot:{sample:'paper',volume:.48,duration:.26,gap:180,priority:60},
  ticket:{sample:'whistle-up',volume:.43,rate:1.12,duration:.48,gap:300,priority:65},
  whistleUp:{sample:'whistle-up',volume:.44,duration:.55,gap:400,priority:65},
  whistleDown:{sample:'whistle-down',volume:.44,duration:.55,gap:400,priority:65},
  handoff:{sample:'claves',volume:.38,rate:.85,duration:.09,gap:240,priority:65},
  chest:{sample:'brush',volume:.44,rate:.70,duration:.40,gap:280,priority:65},
  magic:{sample:'whistle-up',volume:.40,rate:1.15,duration:.50,gap:400,priority:65},
  curtain:{sample:'cloth',volume:.65,duration:.57,gap:500,priority:65},
  bell:{sample:'claves',volume:.48,rate:1.65,duration:.15,gap:260,priority:70},
  bow:{sample:'brush',volume:.48,rate:.8,duration:.30,gap:400,priority:70},
  curtainApplause:{sample:'applause',volume:.46,duration:1.7,gap:1200,duck:true,priority:70},
  audienceDisappointed:{sample:'audience-sigh',volume:.50,gap:2600,duck:true,priority:72},
  finalOvation:{sample:'house-ovation',volume:.59,gap:1700,duck:true,priority:95},
  tributeApplause:{sample:'house-ovation',volume:.22,loop:true,gap:400,priority:19},
  performanceTap:{sample:'tap',volume:.65,gap:120,latest:true,duck:true,priority:75},
  performanceVocal:{sample:'vocal',volume:.65,gap:120,latest:true,duck:true,priority:75},
  propTap:{sample:'tap',volume:.60,duration:2.1,gap:120,latest:true,duck:true,priority:80},
  propMechanism:{sample:'claves',volume:.62,rate:.82,duration:.22,gap:120,latest:true,duck:true,priority:80},
  propVocal:{sample:'vocal',volume:.60,duration:2.8,gap:120,latest:true,duck:true,priority:80},
  cloth:{sample:'cloth',volume:.70,duration:.50,gap:120,latest:true,duck:true,priority:85},
  openCapsule:{sample:'paper',volume:.48,rate:1.2,duration:.30,gap:300,priority:85},
  reveal:{sample:'rimshot',volume:.52,duration:.70,gap:400,priority:90},
  success:{sample:'rimshot',volume:.48,duration:.95,gap:350,priority:90},
  puzzleApplause:{sample:'applause',volume:.41,duration:.92,release:.19,gap:950,duck:true,priority:95},
  failure:{sample:'whistle-down',volume:.48,rate:.92,duration:.60,gap:400,priority:90},
  crocodileChomp:{sample:'claves',volume:.30,rate:.69,duration:.085,gap:180,priority:65},
  dragonBite:{sample:'claves',volume:.43,rate:.67,duration:.12,gap:180,priority:65},
  dragonGulp:{sample:'rimshot',volume:.32,rate:.54,duration:.27,gap:240,priority:65},
  crocodileLaugh:{sample:'throat-laugh',volume:.55,rate:1,duration:1.42,gap:800,duck:true,priority:90},
  celebrate:{sample:'rimshot',volume:.48,duration:1.45,gap:400,priority:90},
  applause:{sample:'applause',volume:.52,duration:1.95,gap:1500,duck:true,priority:95},
  note0:{sample:'coin-note',volume:.46,rate:1,duration:.58,gap:90,duck:true,priority:100},
  note1:{sample:'coin-note',volume:.46,rate:4/3,duration:.58,gap:90,duck:true,priority:100},
  note2:{sample:'coin-note',volume:.46,rate:5/3,duration:.58,gap:90,duck:true,priority:100}
};
let current=null,accepted=0,lastSample=null,offlineContext=null,narrationActive=false;
const finite=(value,fallback,min,max)=>Number.isFinite(value)?Math.max(min,Math.min(max,value)):fallback;
function mixForNarration(){
  const scene=document.getElementById?.('comic-app')?.dataset.scene;
  if(narrationActive&&scene==='encore')return .48;
  return narrationActive && (scene==='level'||scene==='storybook') ? .32 : 1;
}
function setNarrationActive(value){
  narrationActive=!!value;
  if(narrationActive&&current?.kind==='audienceDisappointed')stopCurrent();
  if(current)current.mix.gain.setTargetAtTime(mixForNarration(),audio.ctx.currentTime,narrationActive ? .035 : .12);
}
function stopCurrent(){
  if(!current)return;const old=current;current=null;old.source.onended=null;
  try{old.source.stop();}catch{}old.source.disconnect();old.gain.disconnect();old.mix.disconnect();
  if(old.ducked)B.music?.duck(false,'sfx-clue');report('stop',{kind:old.kind,sources:0});
}
function stop(){stopCurrent();last.clear();}
function unlock(){
  if(!audio.enabled||document.hidden)return null;
  try{const result=audio.unlock();result?.catch?.(()=>{});}catch{}
  return audio.ctx?.state==='running'?audio.ctx:null;
}
async function loadSample(id,c){
  if(samples.has(id))return samples.get(id);if(pending.has(id))return pending.get(id);if(failed.has(id))return null;
  const src=B.assets?.[samplePaths[id]];if(!src){failed.add(id);report('unavailable',{sample:id,reason:'asset'});return null;}
  const task=(async()=>{
    try{
      let data;
      if(src.startsWith('data:')){const raw=atob(src.split(',')[1]);data=Uint8Array.from(raw,x=>x.charCodeAt(0)).buffer;}
      else{const response=await fetch(src);if(!response.ok)throw Error('Unavailable sound');data=await response.arrayBuffer();}
      const buffer=await c.decodeAudioData(data);if(!buffer||!Number.isFinite(buffer.duration)||buffer.duration<=0)throw Error('Invalid sound');
      samples.set(id,buffer);report('decoded',{sample:id,duration:buffer.duration});return buffer;
    }catch{if(c!==offlineContext)failed.add(id);report('unavailable',{sample:id,reason:c===offlineContext?'offline-decode':'decode'});return null;}
  })();
  pending.set(id,task);try{return await task;}finally{pending.delete(id);}
}
function prime(c,initial=false){
  if(!c)return Promise.resolve([]);
  // Only cloth is heard on the title. The hat and usher use these five sounds next.
  const inComic=document.body?.classList?.contains('comic-mode');
  const cover=!inComic&&document.body?.classList?.contains('title-active');
  const alley=!inComic&&document.querySelector?.('#scene[data-act="0"]');
  const ids=cover&&initial?['cloth']:cover||alley?['cloth','whistle-down','claves','spring','brush']:Object.keys(samplePaths);
  return Promise.all(ids.map(id=>loadSample(id,c)));
}
function warmOnLoad(){
  // Decode only. OfflineAudioContext has no speaker output and never renders.
  const Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;if(!Offline)return;
  try{const c=new Offline(1,1,44100);if(typeof c.decodeAudioData!=='function')return;offlineContext=c;void prime(c,true);}catch{}
}
function preload(){
  const c=unlock();if(c)return prime(c);
  if(audio.enabled&&!document.hidden&&audio.ctx){
    return Promise.resolve(audio.ctx.resume?.()).then(()=>audio.ctx.state==='running'?prime(audio.ctx):[]).catch(()=>[]);
  }
  return Promise.resolve([]);
}
function start(c,kind,def,buffer,volume,rate){
  stopCurrent();let source,gain,mix;
  try{
    source=c.createBufferSource();gain=c.createGain();source.buffer=buffer;source.loop=false;source.playbackRate.value=rate;
    const offset=Math.min(def.offset||0,buffer.duration*.5),length=Math.min(buffer.duration-offset,def.duration||buffer.duration),seconds=length/rate;
    gain.gain.value=volume;
    // Fade cropped recordings at the edge without generating replacement sound.
    if(def.duration&&gain.gain.linearRampToValueAtTime){
      gain.gain.setValueAtTime(volume,c.currentTime);
      gain.gain.setValueAtTime(volume,c.currentTime+Math.max(0,seconds-(def.release||.008)));
      gain.gain.linearRampToValueAtTime(0,c.currentTime+seconds);
    }
    mix=c.createGain();mix.gain.value=mixForNarration();
    source.connect(gain);gain.connect(mix);mix.connect(c.destination);
    current={source,gain,mix,kind,priority:def.priority,ducked:!!def.duck};
    if(def.duck)B.music?.duck(true,'sfx-clue');
    source.onended=()=>{
      source.disconnect();gain.disconnect();mix.disconnect();
      if(current?.source===source){current=null;if(def.duck)B.music?.duck(false,'sfx-clue');}
      report('ended',{kind,sources:current?1:0});
    };
    if(def.loop){
      source.loop=true;
      source.loopStart=buffer.duration*.16;source.loopEnd=buffer.duration*.83;
      gain.gain.setValueAtTime(0,c.currentTime);
      gain.gain.linearRampToValueAtTime(volume,c.currentTime+.28);
      source.start(0,source.loopStart);
    }else source.start(0,offset,length);
    accepted++;lastSample=def.sample;
    report('play',{kind,sampled:true,sample:def.sample,duration:seconds,rate,sources:1});return true;
  }catch{
    if(current?.source===source)stopCurrent();
    else{try{source?.disconnect();gain?.disconnect();mix?.disconnect();}catch{}}
    report('unavailable',{kind,sample:def.sample,reason:'start',sources:current?1:0});return false;
  }
}
function play(kind,options={}){
  const def=definitions[kind];if(!def||!audio.enabled||document.hidden)return false;
  if(narrationActive&&kind==='audienceDisappointed')return false;
  if(audio.laughNode||Number.isInteger(audio.laughActiveIndex)){report('blocked',{kind,by:'entrance-laugh'});return false;}
  options=options&&typeof options==='object'?options:{};
  const t=performance.now();
  if(current&&def.priority<current.priority){report('blocked',{kind,by:current.kind});return false;}
  if(t-(last.get(kind)??-Infinity)<def.gap&&(!def.latest||current?.kind===kind))return false;
  const c=unlock();if(!c)return false;void prime(c);
  const recorded=samples.get(def.sample);
  if(!recorded){if(def.latest)stopCurrent();report('unavailable',{kind,sample:def.sample,sources:current?1:0});return false;}
  const volume=finite(def.volume*finite(options.volume,1,0,1)*finite(options.force,1,.5,1.3),def.volume,0,1);
  const rate=finite((def.rate||1)*finite(options.rate,1,.5,2),def.rate||1,.5,2);
  if(volume===0)return false;
  if(!start(c,kind,def,recorded,volume,rate))return false;
  last.set(kind,t);return true;
}
function mechanismCue(w,before){
  const f=w.flags,previous=before.flags;
  if((f.cargoShakes||0)>(previous.cargoShakes||0))return 'boxJolt';
  if(f.crate&&!previous.crate)return 'lowerChest';
  if(f.carry&&!previous.carry)return 'chest';
  if(f.secured&&!previous.secured)return 'brakeSet';
  if(f.cued&&!previous.cued)return 'bell';
  if(f.pin&&!previous.pin)return 'sceneryRelease';
  if(f.safe&&!previous.safe)return 'safetyPin';
  if(f.jawLocked&&!previous.jawLocked)return 'pawlCatch';
  if(f.jaw&&!previous.jaw)return 'pulleyRise';
  if(f.wedge&&!previous.wedge)return 'braceSeat';
  if(['latched','bridgeLocked','unlock'].some(key=>!!f[key]!==!!previous[key]))return 'latch';
  return null;
}
window.OpeningSFX={
  version:'v44-audio-correction',
  cue(name,options){return typeof name==='string'&&!name.startsWith('note')?play(name,options):false;},
  note(index){return Number.isInteger(index)&&index>=0&&index<=2?play('note'+index):false;},
  prop(index){const kind=['propTap','propMechanism','propVocal'][index];return kind?play(kind):false;},
  cloth(){return play('cloth');},
  performance(kind){return play(kind===1?'performanceVocal':'performanceTap');},
  ratchet(stepOrForce=1){return play('ratchet',{force:typeof stepOrForce==='object'&&stepOrForce?stepOrForce.force:1});},
  coin(){return play('coin');},
  carrot(hit=1){return play('carrot',{rate:1+(finite(hit,1,1,3)-1)*.06});},
  ticket(){return play('ticket');},
  capsule(){return play('capsule');},
  openCapsule(){return play('openCapsule');},
  celebrate(){return play('celebrate');},
  preload,stop,mechanismCue,setNarrationActive,
  pauseOvation(paused){
    if(current?.kind!=='finalOvation')return;
    const now=audio.ctx.currentTime;
    current.source.playbackRate.setValueAtTime(paused?0:1,now);
    current.gain.gain.setTargetAtTime(paused?0:definitions.finalOvation.volume,now,.012);
  },
  stopCue(kind){if(current?.kind!==kind)return false;stopCurrent();return true;},
  debug(){return{activeSources:current?1:0,sources:current?1:0,kind:current?.kind||null,priority:current?.priority||0,ducked:!!current?.ducked,accepted,lastSample,loaded:[...samples.keys()],pending:[...pending.keys()],failed:[...failed]};}
};
const setEnabled=audio.setEnabled.bind(audio);
audio.setEnabled=function(on){if(!on)stop();return setEnabled(on);};
warmOnLoad();
document.addEventListener('pointerdown',preload,{capture:true});
document.addEventListener('keydown',preload,{capture:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
window.addEventListener('pagehide',stop);
})();

;
(function(){
 'use strict';
 const seen=new WeakSet(),cache=new Map(),leaves=new WeakMap(),pulls=new WeakMap();
 const selector='img.t-backdrop,.t-curtain-half img,img.e-backdrop';
 function screen(img){
  const w=img.naturalWidth,h=img.naturalHeight,key=img.currentSrc||img.src;
  if(cache.has(key))return cache.get(key);
  const source=document.createElement('canvas');source.width=w;source.height=h;
  const input=source.getContext('2d',{willReadFrequently:true});input.drawImage(img,0,0);
  const pixels=input.getImageData(0,0,w,h),mask=input.createImageData(w,h);
  const front=!!img.closest('.t-curtain-half');
  for(let i=0;i<pixels.data.length;i+=4){
   const r=pixels.data[i],g=pixels.data[i+1],b=pixels.data[i+2];
   // Burgundy carries red ink. Paper, wood, cream highlights and black drawing stay untouched.
   const red=Math.max(0,Math.min(1,(r-Math.max(g,b)-16)/36));
   mask.data[i+3]=Math.round(pixels.data[i+3]*red);
   // The older front cloth was printed with a brownish red. Bring only
   // that ink up to the red on the stage painting; keep the paper and pen.
   if(front&&red){
    const dye=red*Math.min(1,Math.max(0,r/Math.max(1,g,b)-1.5));
    pixels.data[i]=r*(1+.5*dye);
    pixels.data[i+1]=g*(1+.32*dye);
    pixels.data[i+2]=b*(1+.67*dye);
   }
  }
  input.putImageData(mask,0,0);
  const ink=document.createElement('canvas');ink.width=w;ink.height=h;
  const ctx=ink.getContext('2d'),step=7;
  ctx.fillStyle='rgba(15,9,9,.76)';ctx.beginPath();
  for(let y=step/2;y<h;y+=step)for(let x=step/2;x<w;x+=step){ctx.moveTo(x+2.05,y);ctx.arc(x,y,2.05,0,Math.PI*2);}
  ctx.fill();ctx.globalCompositeOperation='destination-in';ctx.drawImage(source,0,0);ctx.globalCompositeOperation='source-over';
  if(front){
   input.putImageData(pixels,0,0);
   input.globalCompositeOperation='multiply';input.drawImage(ink,0,0);
   cache.set(key,source);return source;
  }
  cache.set(key,ink);return ink;
 }
 function gather(layer,progress){
  const leaf=leaves.get(layer);
  if(!leaf||leaf.progress===progress)return;
  leaf.progress=progress;
  const {cloth,left}=leaf,ctx=layer.getContext('2d'),w=cloth.width,h=cloth.height,half=w/2;
  ctx.clearRect(0,0,w,h);
  if(progress===0){ctx.drawImage(cloth,0,0);return;}
  // The travelling rail moves first. Fullness gathers just below it while
  // the heavy hem lags on the boards. The painted edge follows the folds.
  const billow=Math.sin(progress*Math.PI);
  for(let y=0;y<h;y+=6){
   const t=y/h;
   const fullness=.055*Math.sin(Math.PI*t)**2+.021*(1-t);
   const width=half-w*(fullness*billow+.042*progress);
   const band=Math.min(6,h-y);
   ctx.drawImage(cloth,left?0:half,y,half,band,left?0:w-width,y,width,band);
  }
 }
 function part(stage,progress){
  const scheduled=pulls.has(stage);
  pulls.set(stage,progress);
  if(scheduled)return;
  requestAnimationFrame(()=>{
   const latest=pulls.get(stage);pulls.delete(stage);
   if(stage.isConnected)stage.querySelectorAll('.t-curtain-half canvas').forEach(layer=>gather(layer,latest));
  });
 }
 function attach(img){
  if(seen.has(img))return;seen.add(img);
  const paint=()=>{
   if(!img.isConnected||!img.naturalWidth)return;
   try{
    const ink=screen(img),layer=document.createElement('canvas');
    layer.width=ink.width;layer.height=ink.height;layer.className=(img.className+' t-halftone').trim();
    layer.setAttribute('aria-hidden','true');layer.dataset.printReady='true';layer.dataset.screenAngle='0';
    const panel=img.closest('.t-curtain-half');
    if(panel){
     leaves.set(layer,{cloth:ink,left:panel.classList.contains('t-curtain-left')});
     gather(layer,Number(panel.closest('.t-stage').style.getPropertyValue('--open'))||0);
     layer.style.mixBlendMode='normal';img.style.visibility='hidden';
    }else{layer.getContext('2d').drawImage(ink,0,0);}
    img.after(layer);
   }catch(error){console.warn('[Can Act print] '+error.message);}
  };
  if(img.complete&&img.naturalWidth)paint();else img.addEventListener('load',paint,{once:true});
 }
 window.OpeningPrint={apply(root){if(!root?.querySelectorAll)return;root.querySelectorAll(selector).forEach(attach);},part};
})();

;
(function(root){
  'use strict';
  // One approved printed can, shared by capsule hand-off, chase and puzzle play.
  // Runtime frames sample the opaque printed wall only. The source PNG is never changed.
  const COUNT=96,TAU=Math.PI*2,HEIGHT=512,instances=new Map();
  const phase=angle=>((Math.round(angle/TAU*COUNT)%COUNT)+COUNT)%COUNT;
  function canvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
  function create(src){
    const image=new Image(),frames=new Map(),projected=new Map();
    let base=null,crop=null,wall=null,mask=null,width=0,height=HEIGHT;
    const skinWidth=1024,skinHeight=384;
    let skin=null,columns=null,scratch=null,packed=null,back=null,projectionFamily='';
    const ready=new Promise((resolve,reject)=>{
      image.onload=()=>{try{prepare();resolve(api);}catch(error){reject(error);}};
      image.onerror=()=>reject(new Error('The approved can artwork could not be loaded.'));
    });
    function prepare(){
      const probe=canvas(image.naturalWidth,image.naturalHeight),p=probe.getContext('2d',{willReadFrequently:true});p.drawImage(image,0,0);
      const data=p.getImageData(0,0,probe.width,probe.height).data;let l=probe.width,r=0,t=probe.height,b=0;
      // Ignore isolated transparent-edge RGB and subpixel dust outside the printed silhouette.
      for(let y=0;y<probe.height;y++)for(let x=0;x<probe.width;x++)if(data[(y*probe.width+x)*4+3]>=40){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
      if(r<=l||b<=t)throw new Error('The can artwork has no visible silhouette.');
      crop={x:l,y:t,w:r-l+1,h:b-t+1};width=Math.round(height*crop.w/crop.h);
      base=canvas(width,height);const ctx=base.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingQuality='high';ctx.drawImage(image,l,t,crop.w,crop.h,0,0,width,height);
      const pixels=ctx.getImageData(0,0,width,height).data;mask=canvas(width,height);const m=mask.getContext('2d');m.fillStyle='#fff';
      let innerLeft=0,innerRight=width-1;
      for(let y=0;y<height;y++){
        let a=width,z=-1;for(let x=0;x<width;x++)if(pixels[(y*width+x)*4+3]>=40){a=Math.min(a,x);z=Math.max(z,x);}
        if(z>=a){m.fillRect(a,y,z-a+1,1);if(y>height*.24&&y<height*.88){innerLeft=Math.max(innerLeft,a);innerRight=Math.min(innerRight,z);}}
      }
      // Alpha grain is still visible in the ink, but a metal can cannot be transparent.
      ctx.globalCompositeOperation='destination-over';ctx.drawImage(mask,0,0);ctx.globalCompositeOperation='source-over';
      // The narrow rolled metal side strips belong to the can, not its paper wrapper.
      wall={left:Math.round(Math.min(innerLeft+7,width*.12)),right:Math.round(Math.max(innerRight-7,width*.88))};
      scratch=ctx.getImageData(0,0,width,height);packed=new Uint32Array(scratch.data.buffer);
      columns=[];
      for(let x=wall.left;x<=wall.right;x++){
        const u=(x-wall.left)/(wall.right-wall.left),cap=edge(u),first=Math.ceil(cap.top),last=Math.floor(cap.bottom);
        const rows=new Uint32Array(last-first+1);
        for(let y=first;y<=last;y++)rows[y-first]=Math.min(skinHeight-1,Math.floor((y-cap.top)/(cap.bottom-cap.top)*skinHeight))*skinWidth;
        columns.push({first:first*width+x,longitude:(Math.asin(2*u-1)/TAU+.5)*skinWidth,rows});
      }
      prepareSkin();
      frames.set(0,base);
    }
    function edge(u){
      const parabola=4*u*(1-u);
      return {top:height*(.155+.0605*parabola),bottom:height*(.891+.045*parabola)};
    }
    function prepareSkin(){
      // Unroll the original curved label once. Front lettering passes around the
      // cylinder in its printed order. The unseen half uses the existing blank back label.
      const atlas=canvas(skinWidth,skinHeight),g=atlas.getContext('2d',{willReadFrequently:true});
      g.fillStyle='#f2f2f2';g.fillRect(0,0,skinWidth,skinHeight);
      g.fillStyle='#171717';g.fillRect(0,0,skinWidth,Math.round(skinHeight*.506));
      for(let i=0;i<skinWidth;i++){
        const longitude=((i+.5)/skinWidth-.5)*TAU,front=Math.cos(longitude)>=0;
        const u=.5+.5*Math.sin(longitude)*(front?1:-1);
        if(front){
          const e=edge(u),sx=wall.left+u*(wall.right-wall.left);
          g.drawImage(base,sx-.65,e.top,1.3,e.bottom-e.top,i,0,1,skinHeight);
        }else if(back?.complete&&back.naturalWidth){
          const bend=4*u*(1-u),sx=(.09+.82*u)*back.naturalWidth;
          const top=(.15+.075*bend)*back.naturalHeight,bottom=(.89+.052*bend)*back.naturalHeight;
          g.drawImage(back,sx-1,top,2,bottom-top,i,0,1,skinHeight);
        }
      }
      const raw=g.getImageData(0,0,skinWidth,skinHeight);
      // Keep the reverse's clean metalwork, but give its unprinted paper and solid
      // ink the same grain values as the front instead of stark RGB black and white.
      for(let y=0;y<skinHeight;y++)for(let x=0;x<skinWidth;x++){
        if(x>=skinWidth/4&&x<skinWidth*.75)continue;
        const p=(y*skinWidth+x)*4,noise=((x*29+y*17+(x*y%11))%7)-3;
        const left=x<skinWidth/4,dist=left?skinWidth/4-x:x-skinWidth*.75+1;
        const blend=Math.min(1,dist/74),weight=blend*blend*(3-2*blend);
        const sample=left?skinWidth/4+Math.min(38,dist):skinWidth*.75-1-Math.min(38,dist);
        const frontTone=raw.data[(y*skinWidth+sample)*4];
        const v=Math.min(255,Math.max(0,weight*(17+raw.data[p]*.89+noise)+(1-weight)*frontTone));
        raw.data[p]=v;raw.data[p+1]=v;raw.data[p+2]=v;
      }
      skin=new Uint32Array(raw.data.buffer);frames.clear();frames.set(0,base);projected.clear();
    }
    function frame(angle=0){
      if(!base)return null;const index=phase(angle);if(frames.has(index))return frames.get(index);
      const out=canvas(width,height),ctx=out.getContext('2d'),offset=index*skinWidth/COUNT;
      for(const column of columns){
        const tx=(column.longitude-offset+skinWidth)%skinWidth,lo=Math.floor(tx),hi=(lo+1)%skinWidth,k=Math.round((tx-lo)*256),j=256-k;
        let dest=column.first;
        for(const row of column.rows){
          const a=skin[row+lo],b=skin[row+hi];
          const rb=(((a&0xff00ff)*j+(b&0xff00ff)*k)>>>8)&0xff00ff;
          const green=(((a&0xff00)*j+(b&0xff00)*k)>>>8)&0xff00;
          packed[dest]=0xff000000|rb|green;dest+=width;
        }
      }
      ctx.putImageData(scratch,0,0);
      frames.set(index,out);return out;
    }
    function projectedFrame(angle,depth,targetHeight=height){
      const d=Math.round(Math.max(0,Math.min(.6,depth))*100)/100,key=phase(angle),family=d+':'+targetHeight;
      if(family!==projectionFamily){projected.clear();projectionFamily=family;}
      if(projected.has(key))return projected.get(key);const original=frame(angle);if(!original)return null;
      if(!d)return original;
      const targetWidth=Math.round(width*targetHeight/height),out=canvas(targetWidth,targetHeight),ctx=out.getContext('2d'),cap=.24+d*.27,bottom=.91+d*.035;
      const rows=[0,.08,.16,.24,.38,.52,.66,.8,.91,1];
      function rowY(v){return v<=.24?v/.24*cap:v<=.91?cap+(v-.24)/.67*(bottom-cap):bottom+(v-.91)/.09*(1-bottom);}
      // Integer-aligned adjoining bands avoid alpha cracks. Cap, wall and base
      // slope independently; nine samples suffice for the subpixel side taper.
      for(let i=0;i<rows.length-1;i++){
        const a=rows[i],b=rows[i+1],sy=Math.round(a*height),dy=Math.round(rowY(a)*targetHeight);
        const sh=Math.round(b*height)-sy,dh=Math.round(rowY(b)*targetHeight)-dy,dw=targetWidth*(1-d*.10*(1-(a+b)*.5));
        ctx.drawImage(original,0,sy,width,sh,(targetWidth-dw)/2,dy,dw,dh);
      }
      // Keep only the active camera's projected set, at its actual display
      // resolution. The complete phase cache is shared with chase and capsule.
      projected.set(key,out);return out;
    }
    function draw(ctx,{x=0,y=0,height:h=86,angle=0,rotation=0,anchor='center',pose=null}={}){
      let f;
      if(pose?.depth){
        const tx=ctx.getTransform?.(),density=tx?Math.hypot(tx.c,tx.d):2;
        const pixels=Math.max(128,h*density*1.12),mip=Math.min(height,2**Math.ceil(Math.log2(pixels)));
        f=projectedFrame(angle,pose.depth,mip);
      }else f=frame(angle);
      if(!f)return false;const w=h*width/height;
      if(pose?.depth){
        const shear=Math.max(-.055,Math.min(.055,(pose.pathAngle||0)*.075));
        ctx.save();ctx.translate(x,anchor==='ground'?y:y+h/2);ctx.transform(1,0,shear,1,0,0);ctx.drawImage(f,-w/2,-h,w,h);ctx.restore();return true;
      }
      const extent=(Math.abs(Math.sin(rotation))*w+Math.abs(Math.cos(rotation))*h)/2;
      ctx.save();ctx.translate(x,anchor==='ground'?y-extent:y);ctx.rotate(rotation);ctx.drawImage(f,-w/2,-h/2,w,h);ctx.restore();return true;
    }
    function inspect({depth=0}={}){
      if(!base)return {ready:false};let checked=0,holes=0;
      for(let i=0;i<COUNT;i++){
        const f=depth?projectedFrame(i*TAU/COUNT,depth):frame(i*TAU/COUNT),d=f.getContext('2d').getImageData(0,0,width,height).data;
        for(let y=Math.ceil(height*.29);y<height*.86;y++)for(let x=Math.ceil(wall.left+3);x<wall.right-3;x++){checked++;if(d[(y*width+x)*4+3]<250)holes++;}
      }
      return {ready:true,frames:COUNT,width,height,crop,wall,depth,checked,transparentInteriorPixels:holes};
    }
    const api={ready,frame,projectedFrame,draw,inspect,get crop(){return crop;},get width(){return width;},get height(){return height;},get count(){return COUNT;},get source(){return src;}};
    const backSrc=root.OPENING_BASE?.assets?.['assets/can-v30/back.png'];
    if(backSrc){back=new Image();back.onload=()=>{if(base)prepareSkin();};back.src=backSrc;}
    image.src=src;return api;
  }
  const api={asset:'theatre-v45/can.png',count:COUNT,phase,get(src){if(!instances.has(src))instances.set(src,create(src));return instances.get(src);}};
  root.OpeningCanRenderer=api;
  if(typeof module==='object'&&module.exports)module.exports={phase,count:COUNT};
})(typeof window!=='undefined'?window:globalThis);

;
(function(root){
 'use strict';
 const source='level-one-v47/rabbit-reaction.png';
 // Clockwise ports, including all four edges. Never return to the same or a
 // neighbouring stretch of frame on the following appearance.
 const ports=[
  {id:'top-left',edge:'top',at:.18,angle:145},{id:'top-centre',edge:'top',at:.50,angle:180},{id:'top-right',edge:'top',at:.82,angle:215},
  {id:'right-high',edge:'right',at:.27,angle:-68},{id:'right-middle',edge:'right',at:.50,angle:-82},{id:'right-low',edge:'right',at:.73,angle:-108},
  {id:'bottom-right',edge:'bottom',at:.79,angle:-22},{id:'bottom-centre',edge:'bottom',at:.50,angle:0},{id:'bottom-left',edge:'bottom',at:.21,angle:22},
  {id:'left-low',edge:'left',at:.73,angle:108},{id:'left-middle',edge:'left',at:.50,angle:82},{id:'left-high',edge:'left',at:.27,angle:68}
 ];
 function pickPort(previous=3,random=Math.random,recent=[]){const eligible=ports.map((_,i)=>i).filter(i=>{const d=Math.abs(i-previous),ring=Math.min(d,ports.length-d);return ring>=3&&!recent.includes(i);});return eligible[Math.min(eligible.length-1,Math.floor(random()*eligible.length))]??(previous+6)%ports.length;}
 // [time, exposure, angle degrees, cel, vertical accent]. Holds belong to the
 // expression cels; only the entry, lean and settling motion is interpolated.
 const clips={
  right:{duration:4600,side:'right',keys:[[0,0,-80,0,0],[180,.16,-77,0,0],[560,1.035,-60,0,-4],[850,1,-66,0,0],[1150,1.02,-63,1,-3],[1400,1,-66,2,0],[1660,1,-71,3,0],[2180,1,-67,3,0],[2420,1,-64,4,0],[2670,1,-64,5,-3],[2870,1,-65,6,-5],[3050,1,-64,5,-2],[3250,1,-65,6,-4],[3460,1,-64,7,0],[3860,1.025,-60,7,-4],[4080,1.015,-66,7,0],[4600,0,-80,7,15]]},
  corner:{duration:3800,side:'corner',keys:[[0,0,168,0,0],[200,.15,164,0,0],[650,1.025,135,1,0],[890,1,145,1,0],[1130,1,140,2,-3],[1460,1,153,3,0],[1860,1,143,7,3],[2140,1.015,139,1,-7],[2310,1,146,7,2],[2480,1.01,140,1,-5],[2680,1,151,7,0],[3020,1.03,145,7,0],[3800,0,171,7,-12]]},
  'reaction-right':{duration:1450,side:'right',keys:[[0,0,-82,0,0],[240,1.025,-62,1,-3],[390,1,-68,3,0],[690,1,-66,4,0],[820,1,-65,5,-2],[980,1,-67,6,-5],[1150,1.01,-63,7,-1],[1450,0,-81,7,8]]},
  'reaction-corner':{duration:1450,side:'corner',keys:[[0,0,168,0,0],[250,1.025,137,1,-2],[430,1,150,3,0],[740,1,143,7,2],[880,1.015,138,1,-5],[1050,1,148,7,0],[1180,1.02,143,7,0],[1450,0,170,7,-10]]}
 };
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
 function sample(name,time){const c=clips[name]||clips.right,k=c.keys;let i=0;while(i<k.length-2&&time>=k[i+1][0])i++;const a=k[i],b=k[i+1],q=smooth((time-a[0])/(b[0]-a[0]));return {side:c.side,exposure:a[1]+(b[1]-a[1])*q,rotation:a[2]+(b[2]-a[2])*q,frame:time>=b[0]?b[3]:a[3],accent:a[4]+(b[4]-a[4])*q};}
 function mount({host,asset,reduced=false,isPaused=()=>false}={}){
  if(!host||!host.isConnected)return {react:()=>0,dispose(){},cancel(){},restart(){},setPaused(){}};
  const layer=document.createElement('canvas');layer.className='t-prop-reaction';layer.setAttribute('aria-hidden','true');layer.setAttribute('role','presentation');host.append(layer);
  const ctx=layer.getContext('2d'),sheet=new Image(),abort=new AbortController(),motion=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
  let dead=false,loaded=false,raf=0,last=0,time=0,wait=600,clip='right',next='right',paused=false,blurred=false,staticRemaining=0,wasBlank=false,portIndex=3,recentPorts=[3];
  function relocate(){portIndex=pickPort(portIndex,Math.random,recentPorts);recentPorts=[portIndex,...recentPorts].slice(0,3);}
  const reducedNow=()=>reduced||!!motion?.matches;
  const alive=()=>host.isConnected&&(!host.dataset.stage||host.dataset.stage==='props');
  function size(){const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight),dpr=Math.min(devicePixelRatio||1,1.75);if(layer.width!==Math.round(w*dpr)||layer.height!==Math.round(h*dpr)){layer.width=Math.round(w*dpr);layer.height=Math.round(h*dpr);}return {w,h,dpr};}
  function clear(){if(wasBlank)return;ctx.clearRect(0,0,layer.width,layer.height);wasBlank=true;layer.dataset.visible='false';}
  function paint(p){
   if(!loaded)return;const {w,h,dpr}=size();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);wasBlank=false;
   const port=ports[portIndex],ch=Math.max(185,Math.min(port.edge==='bottom'?285:360,h*.41,w<600?w*.67:360)),cw=ch*.75;
   const lean=p.rotation-(p.side==='right'?-66:145),rad=(port.angle+lean)*Math.PI/180;
   ctx.save();
   // Place the entire chest cut beyond its chosen edge, even at the overshoot.
   const sideReach=Math.abs(Math.cos(rad))*cw*.5+26+(1-p.exposure)*ch*.8;
   const verticalReach=Math.abs(Math.sin(rad))*cw*.5+26+(1-p.exposure)*ch*.9;
   let x,y;if(port.edge==='right'){x=w+sideReach;y=h*port.at+p.accent;}
   else if(port.edge==='left'){x=-sideReach;y=h*port.at+p.accent;}
   else if(port.edge==='top'){x=w*port.at+p.accent;y=-verticalReach;}
   else{x=w*port.at+p.accent;y=h+verticalReach;}
   ctx.translate(x,y);ctx.rotate(rad);if(port.edge==='left')ctx.scale(-1,1);
   const sw=sheet.naturalWidth/4,sh=sheet.naturalHeight/2;
   ctx.drawImage(sheet,p.frame%4*sw,Math.floor(p.frame/4)*sh,sw,sh,-cw*.5,-ch,cw,ch);ctx.restore();
   layer.dataset.clip=clip;layer.dataset.port=port.id;layer.dataset.frame=String(p.frame);layer.dataset.visible=p.exposure>.05?'true':'false';layer.dataset.elapsed=String(Math.round(time));
  }
  function schedule(){if(!dead&&!raf&&loaded)raf=requestAnimationFrame(tick);}
  function tick(now){
   raf=0;if(dead)return;if(!alive()){dispose();return;}const dt=last?Math.min(40,Math.max(0,now-last)):0;last=now;
   if(document.hidden||blurred||isPaused()){clear();schedule();return;}if(paused){last=0;schedule();return;}
   if(reducedNow()){
    if(staticRemaining>0){staticRemaining=Math.max(0,staticRemaining-dt);paint({side:clip.includes('corner')?'corner':'right',exposure:1,rotation:clip.includes('corner')?145:-66,frame:7,accent:0});if(staticRemaining>0)schedule();else clear();}
    else clear();return;
   }
   if(wait>0){wait=Math.max(0,wait-dt);clear();if(wait===0){clip=next;time=0;}schedule();return;}
   time+=dt;paint(sample(clip,time));
   if(time>=clips[clip].duration){clear();next=clip==='right'?'corner':'right';wait=4200+Math.random()*2800;time=0;relocate();}
   schedule();
  }
  function react(kind='left-duck'){
   if(dead||!alive())return 0;relocate();clip=kind==='right-duck'||kind===1?'reaction-corner':'reaction-right';time=0;wait=0;last=0;
   if(reducedNow()){staticRemaining=500;schedule();return 500;}schedule();return 1450;
  }
  function cancel(){time=0;wait=4000;next='right';staticRemaining=0;clear();last=0;schedule();}
  function restart(){if(dead)return;time=0;wait=600;clip='right';next='right';last=0;staticRemaining=0;portIndex=3;recentPorts=[3];clear();schedule();}
  function dispose(){if(dead)return;dead=true;cancelAnimationFrame(raf);raf=0;abort.abort();watch.disconnect();sheet.onload=null;sheet.onerror=null;layer.remove();}
  const watch=new MutationObserver(()=>{if(!alive())dispose();});watch.observe(document.body,{childList:true,subtree:true});watch.observe(host,{attributes:true,attributeFilter:['data-stage']});
  const on=(target,event,fn)=>target.addEventListener(event,fn,{signal:abort.signal});
  on(window,'resize',()=>{size();if(wait>0)clear();});on(window,'blur',()=>{blurred=true;last=0;clear();});on(window,'focus',()=>{blurred=false;last=0;schedule();});
  on(document,'visibilitychange',()=>{last=0;if(document.hidden)clear();else schedule();});on(window,'pagehide',dispose);
  if(motion)on(motion,'change',()=>{cancelAnimationFrame(raf);raf=0;clear();restart();});
  sheet.onload=()=>{if(dead)return;loaded=true;size();layer.dataset.ready='true';schedule();};sheet.onerror=()=>dispose();sheet.src=asset(source);
  return {react,cancel,restart,dispose,setPaused(value){paused=!!value;last=0;if(!paused)schedule();},get element(){return layer;}};
 }
 root.OpeningPropReaction={mount,sample,clips,source,ports,pickPort};
 if(typeof module==='object'&&module.exports)module.exports={mount,sample,clips,source,ports,pickPort};
})(typeof window!=='undefined'?window:globalThis);

;
(function(){
 'use strict';
 window.OpeningTheatre={create:function(env){
  const {asset,base,listen:rawListen,after:rawAfter,hint,say,cue,open,duck,animateCast,saved,save,reduced}=env;
  const afterNarration=env.afterNarration||((ready)=>ready());
  let epoch=0,root=null,stopCast=null,curtainWelcome=false,propReaction=null,lastWalkWheel=-Infinity;
  function activate(node){propReaction?.dispose();propReaction=null;window.OpeningSFX?.stop?.();if(typeof stopCast==='function')stopCast();stopCast=null;root=node;epoch++;window.OpeningPrint?.apply(node);return node;}
  function current(id,node){return id===epoch&&node?.isConnected;}
  function listen(el,event,fn,options){const id=epoch,node=root;rawListen(el,event,e=>{if(current(id,node)&&!env.isModal?.())fn(e);},options);}
  function after(fn,ms){const id=epoch,node=root;return rawAfter(()=>{if(current(id,node))fn();},ms);}
  const $=s=>env.getBody().querySelector(s),art=n=>asset(n==='stage-background'?'scene-v47/stage-extended.png':'theatre-v33/'+n+'.webp');
  function picture(name,cls,alt=''){return '<img class="'+cls+'" src="'+art(name)+'" alt="'+alt+'" draggable="false">';}
  function rabbitMachine(interactive){
   const ear='<img class="t-ear-print" src="'+asset('rabbit-machine-v67/ear.webp')+'" alt="" draggable="false">';
   const lever=interactive?'<button class="t-ear" id="t-ear" disabled aria-label="Pull the long right ear down to release a capsule">'+ear+'</button>':'<span class="t-ear">'+ear+'</span>';
   const arrow=interactive?'<svg class="t-ear-arrow" viewBox="0 0 92 114" aria-hidden="true" focusable="false"><path fill="#f6efda" stroke="#211d19" stroke-width="3.1" stroke-linejoin="round" d="M7 7C34 11 64 35 67 74L82 68Q75 88 63 106L42 81 55 84C55 53 39 29 7 15Q2 12 7 7Z"/><path fill="#211d19" d="M45 34Q59 48 61 68Q62 48 45 34ZM51 86l10 13-6-12z"/></svg>':'';
   return '<div class="'+(interactive?'t-machine-rig':'t-machine-prop')+'"><i class="t-ear-socket" aria-hidden="true"></i>'+lever+arrow+'<img class="t-machine-body" src="'+asset('rabbit-machine-v67/body.webp')+'" alt="A rabbit-shaped capsule machine with glass globe, pull ear and dispensing hatch" draggable="false"></div>';
  }
  function stage(inner='',kind='props'){
   const c=base('','','');env.getBody().classList.add('t-page');
   c.innerHTML='<div class="t-stage-wrap"><section class="t-stage" data-stage="'+kind+'" aria-label="Theatre stage">'+picture('stage-background','t-backdrop')+'<div class="t-stage-content">'+inner+'</div><div class="t-confetti" aria-hidden="true"></div></section></div><div class="t-stage-footer"><div id="c-caption" class="t-caption" aria-live="polite"></div><div class="t-stage-controls"></div></div>';
   return activate($('.t-stage'));
  }
  function walk(){
   const c=base('','','');env.getBody().classList.add('t-page');
   c.innerHTML='<section class="t-walk" aria-label="Follow the usher into the theatre"><div class="t-aisle-set"><picture><source media="(min-aspect-ratio:3/2)" srcset="'+asset('responsive-print-v67/aisle-widescreen.webp')+'"><img class="t-aisle-painting" alt="" draggable="false"></picture><div class="t-runner"><canvas width="384" height="512" role="img" aria-label="The usher runs to the stage door, pauses and looks back"></canvas></div></div><div class="t-walk-note"><span>Scroll to follow the usher</span><button class="t-text-button" id="c-step">Step forward ↓</button></div></section>';
   $('.t-aisle-painting').src=asset('scenery-v63/red-aisle.webp');
   const field=activate($('.t-walk')),id=epoch,runner=$('.t-runner'),canvas=runner.querySelector('canvas'),ctx=canvas.getContext('2d'),run=new Image(),glance=new Image();run.src=art('rabbit-run');glance.src=art('rabbit-glance');
   let progress=0,target=0,last=performance.now(),stopped=last,wasMoving=false,done=false,drag=null,footTravel=0,lastFoot=0;
   function step(d){if(done)return;target=Math.max(0,Math.min(1,target+d));}
   function loop(now){
    if(!current(id,field))return;
    const paused=document.hidden||env.isModal?.(),dt=paused?0:Math.min(40,now-last);last=now;const distance=target-progress;
    const moving=!paused&&Math.abs(distance)>.001,oldProgress=progress;if(!paused){progress+=distance*Math.min(1,dt/140);if(!moving)progress=target;}
    if(moving){footTravel+=Math.abs(progress-oldProgress);if(footTravel>.035&&now-lastFoot>220){cue('footstep',{volume:.45*(1-progress*.7)});lastFoot=now;footTravel=0;}}
    if(wasMoving&&!moving)stopped=now;wasMoving=moving;
    // The carpet bindings meet at a horizon 42% down the painted set. Project
    // the feet and body at the same depth until the usher reaches the sill.
    const scale=1/(1+4.25*progress),feet=42+47*scale,x=49.5+Math.sin(progress*Math.PI*2.5)*1.6*scale;
    runner.style.left=x+'%';runner.style.top=feet+'%';runner.style.transform='translate(-50%,-100%) scale('+scale+')';runner.style.opacity=String(Math.min(1,(1-progress)*8+.08));
    field.style.setProperty('--distance',progress);field.dataset.motion=moving?'run':'look-back';
    const t=now-stopped;let image=moving?run:glance,n=moving?(reduced?0:Math.floor(now/95)%8):reduced?0:t<350?0:t<1100?Math.min(4,Math.floor((t-350)/150)):t<2300?3:t<2950?Math.min(7,4+Math.floor((t-2300)/160)):0;
    if(image.complete&&image.naturalWidth){const sw=image.naturalWidth/4,sh=image.naturalHeight/2;ctx.clearRect(0,0,384,512);ctx.drawImage(image,n%4*sw,Math.floor(n/4)*sh,sw,sh,0,0,384,512);}
    if(progress>.993&&!done){done=true;field.classList.add('t-departed');after(()=>open('curtain'),550);}
    env.setFrame(requestAnimationFrame(loop));
   }
   listen(field,'wheel',e=>{e.preventDefault();lastWalkWheel=performance.now();step(Math.max(-.09,Math.min(.13,e.deltaY*.00075)));},{passive:false});listen($('#c-step'),'click',()=>step(.16));
   listen(field,'pointerdown',e=>{if(e.target.closest('button')||e.button!==0||e.isPrimary===false||drag)return;e.preventDefault();drag={id:e.pointerId,y:e.clientY};field.setPointerCapture(e.pointerId);});listen(field,'pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;step((drag.y-e.clientY)*.002);drag.y=e.clientY;});const endDrag=e=>{if(drag?.id===e.pointerId)drag=null;};listen(field,'pointerup',endDrag);listen(field,'pointercancel',endDrag);listen(field,'lostpointercapture',endDrag);listen(window,'blur',()=>{drag=null;target=progress;});
   listen(window,'keydown',e=>{if(e.target.closest('button'))return;if(e.key==='ArrowDown'||e.key===' '){e.preventDefault();step(.16);}});env.setFrame(requestAnimationFrame(loop));
  }
  function curtain(){
   const sheets=[21,50,79].map(place=>'<div class="t-covered" style="--place:'+place+'%">'+picture('prop-cloth','t-cloth-image')+'</div>').join('');
   const panels=['left','right'].map(side=>'<div class="t-curtain-half t-curtain-'+side+'">'+picture('curtain-closed','')+'</div>').join('');
   const words=['the','show','will','begin'].map(word=>'<img class="t-show-word t-word-'+word+'" src="'+asset('curtain-type-v40/'+word+'.webp')+'" alt="" draggable="false">').join('');
   const card='<div class="t-curtain-titlecard"><div class="t-show-words" role="img" aria-label="The Show Will Begin">'+words+'</div><button class="t-text-button" id="c-scatter" aria-label="Clear the lettering and light the curtain">Scroll to clear the lettering</button></div>';
   const s=stage('<div class="t-prop-row t-awaiting">'+sheets+'</div>'+panels+card+'<button class="t-rope" hidden aria-label="Pull the rope down or press Enter to raise the curtain"><span class="t-pull-cord" aria-hidden="true"></span><img class="t-pull-tassel" src="'+asset('curtain-pull-v67/tassel.webp')+'" alt="" draggable="false"></button>','curtain');
   const id=epoch,titleCard=$('.t-curtain-titlecard'),rope=$('.t-rope'),clearButton=$('#c-scatter'),controls=$('.t-stage-controls');
   rope.querySelector('.t-pull-cord').style.backgroundImage='url("'+asset('curtain-pull-v67/cord.webp')+'")';
   s.dataset.curtainPhase='lettering';
   let scatter=0,p=0,drag=null,swipe=null,finished=false,curtainHeard=false,returnFocus=false,retryAnnouncement=false,wordsGone=false;
   let previousWheel=lastWalkWheel,carriedWheel=performance.now()-lastWalkWheel<800;
   lastWalkWheel=-Infinity;
   if(matchMedia('(pointer:coarse)').matches)clearButton.textContent='Swipe up to clear the lettering';
   function lightCurtain(){
    if(!current(id,s)||swipe||!wordsGone||s.dataset.curtainPhase!=='lettering')return;
    titleCard.classList.add('t-lights-up');
    s.dataset.curtainPhase='lighting';
    say('curtain-announcement').then(result=>{retryAnnouncement=result?.status==='blocked';});
    Promise.allSettled(titleCard.getAnimations().map(animation=>animation.finished)).then(()=>{
     if(!current(id,s))return;
     titleCard.remove();rope.hidden=false;s.dataset.curtainPhase='ready';
     controls.innerHTML='<button id="t-raise" class="t-text-button">Raise the curtain</button>';
     const raise=$('#t-raise');
     listen(raise,'click',()=>pull(1));
     listen(raise,'pointerup',e=>{if(e.pointerType==='touch'&&e.isPrimary)pull(1);});
     if(returnFocus)rope.focus({preventScroll:true});
    });
   }
   function clear(d){
    if(scatter===1||s.dataset.curtainPhase!=='lettering')return;
    const previous=scatter;
    scatter=Math.max(0,Math.min(1,scatter+d));titleCard.style.setProperty('--scatter',scatter);
    if(Math.floor(scatter*3)>Math.floor(previous*3))cue('paper',{volume:.4});
    if(scatter!==1)return;
    returnFocus=titleCard.contains(document.activeElement);
    clearButton.disabled=true;titleCard.classList.add('t-cleared');
    const strokes=Array.from(titleCard.querySelectorAll('.t-show-word'));
    const exits=strokes.flatMap(word=>word.getAnimations().map(animation=>animation.finished));
    Promise.allSettled(exits).then(()=>{wordsGone=true;lightCurtain();});
   }
   function pull(value){
    if(finished||rope.hidden)return;
    if(retryAnnouncement){retryAnnouncement=false;say('curtain-announcement');}
    p=Math.max(0,Math.min(1,value));s.style.setProperty('--open',p);window.OpeningPrint?.part?.(s,p);s.dataset.curtainPhase='opening';
    if(p>.08&&!curtainHeard){curtainHeard=true;cue('curtain');}
    if(p>.98){finished=true;drag=null;controls.replaceChildren();after(()=>afterNarration(()=>{
     if(!current(id,s))return;
     delete s.dataset.curtainPhase;curtainWelcome=s;try{open('props');}finally{curtainWelcome=false;}
    },true),reduced?0:280);}
   }
   listen(titleCard,'wheel',e=>{
    if(e.ctrlKey)return;
    e.preventDefault();
    const now=performance.now();carriedWheel=carriedWheel&&now-previousWheel<180;previousWheel=now;
    if(carriedWheel)return;
    const unit=e.deltaMode===1?16:e.deltaMode===2?titleCard.clientHeight:1;
    clear(e.deltaY*unit*.0018);
   },{passive:false});
   listen(titleCard,'pointerdown',e=>{
    if(e.target.closest('button')||e.button!==0||!e.isPrimary)return;
    swipe={id:e.pointerId,y:e.clientY};titleCard.setPointerCapture(e.pointerId);
   });
   listen(titleCard,'pointermove',e=>{
    if(swipe?.id!==e.pointerId)return;
    clear((swipe.y-e.clientY)/Math.min(320,titleCard.clientHeight*.4));swipe.y=e.clientY;
   });
   for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(titleCard,type,e=>{
    if(swipe?.id!==e.pointerId)return;
    swipe=null;if(wordsGone)after(lightCurtain,0);
   });
   listen(clearButton,'click',()=>clear(1));
   listen(window,'keydown',e=>{
    if(e.target.closest?.('button')||e.repeat||!['ArrowDown','PageDown',' '].includes(e.key))return;
    e.preventDefault();if(rope.hidden)clear(e.key==='PageDown'?1:.34);else pull(p+.35);
   });
   listen(rope,'pointerdown',e=>{if(e.button!==0||e.isPrimary===false||drag||finished||rope.hidden)return;e.preventDefault();drag={id:e.pointerId,start:e.clientY-p*160};rope.setPointerCapture(e.pointerId);});listen(rope,'pointermove',e=>{if(drag?.id===e.pointerId)pull((e.clientY-drag.start)/160);});const release=e=>{if(drag?.id===e.pointerId)drag=null;};listen(rope,'pointerup',release);listen(rope,'pointercancel',release);listen(rope,'lostpointercapture',release);
   listen(rope,'keydown',e=>{if(['Enter',' ','ArrowDown'].includes(e.key)){e.preventDefault();pull(e.key==='ArrowDown'?p+.2:1);}});
   listen(rope,'click',e=>{if(e.detail===0&&!e.pointerType)pull(1);});
  }
  function props(){
   // Consume only the synchronous curtain handoff. Navigation and base cleanup
   // have finished before the welcome sound; direct programme entry stays quiet.
   const welcome=curtainWelcome;curtainWelcome=false;
   const content='<div class="t-prop-row">'+[0,1,2].map(i=>'<div class="t-covered" data-prop="'+i+'" style="--place:'+([21,50,79][i])+'%"><div class="t-hidden-prop">'+(i===1?rabbitMachine(false):duck(i===2?1:0))+'</div><button class="t-cloth" aria-label="'+['Left','Middle','Right'][i]+' sheet. Tap to listen, then drag up to reveal">'+picture('prop-cloth','t-cloth-image')+'</button></div>').join('')+'</div>';
   // Opening the curtains activates the stage already behind them. Keep the
   // same backdrop and container so there is no second page entrance/wipe.
   const s=welcome?.isConnected?activate(welcome):stage(content);
   if(welcome?.isConnected){s.dataset.stage='props';s.querySelector('.t-stage-content').innerHTML=content;env.setScene('props');}
   $('.t-stage-controls').innerHTML='<span id="t-prop-prompt">Tap a sheet to listen, then lift it</span><button id="t-reveal" class="t-text-button" hidden>Lift the sheet ↑</button>';stopCast=animateCast();
   propReaction=window.OpeningPropReaction?.mount({host:s,asset,reduced,isPaused:()=>!!env.isModal?.()});
   let selected=null,revealing=false;
   function reveal(i){if(revealing)return;revealing=true;window.OpeningSFX?.stop?.();window.OpeningSFX?.cloth?.();const slot=s.querySelector('[data-prop="'+i+'"]');slot.classList.add('t-revealed');slot.querySelector('button').disabled=true;$('.t-stage-controls').innerHTML='';const reactionMs=i!==1?propReaction?.react(i===2?'right-duck':'left-duck')||0:0;if(i===1)propReaction?.cancel();after(()=>{if(i===1){env.setScene('gacha');gacha(s);}else{if(!Array.isArray(saved.seen))saved.seen=[];if(!saved.seen.includes(i))saved.seen.push(i);save();performanceScene(i===2?1:0);}},reduced?50:reactionMs?1650:550);}
   s.querySelectorAll('.t-covered').forEach(slot=>{const i=+slot.dataset.prop,b=slot.querySelector('button');let drag=null,dragged=false;
    listen(b,'pointerdown',e=>{if(e.button!==0||e.isPrimary===false||drag||revealing)return;drag={id:e.pointerId,y:e.clientY};dragged=false;b.setPointerCapture(e.pointerId);});listen(b,'pointermove',e=>{if(drag?.id!==e.pointerId||revealing)return;const d=Math.min(0,e.clientY-drag.y);dragged=dragged||d<-8;b.style.translate='0 '+d+'px';if(d<-75){drag=null;reveal(i);}});const release=e=>{if(drag?.id!==e.pointerId)return;drag=null;b.style.translate='';if(e.type!=='pointerup')dragged=true;};listen(b,'pointerup',release);listen(b,'pointercancel',release);listen(b,'lostpointercapture',release);
    listen(b,'click',e=>{if(revealing)return;const keyboard=e.detail===0&&!e.pointerType;if(dragged&&!keyboard){dragged=false;return;}dragged=false;selected=i;$('#t-reveal').hidden=false;$('#t-prop-prompt').textContent=['Tap shoes. Someone has started early.','A click. Something mechanical.','Someone is still holding a note.'][i];slot.classList.remove('t-heard');void slot.offsetWidth;slot.classList.add('t-heard');window.OpeningSFX?.prop?.(i);});
    listen(b,'keydown',e=>{if(e.key==='ArrowUp'){e.preventDefault();reveal(i);}});
   });listen($('#t-reveal'),'click',()=>{if(selected!==null)reveal(selected);});hint('');if(welcome)cue('curtainApplause');
  }
  function performanceScene(kind){
   stage('<div class="t-performer entering">'+duck(kind,'walk')+'</div>','performance');stopCast=animateCast();
   $('.t-stage-controls').innerHTML='<button id="t-back" class="t-text-button">Back to the three sheets →</button>';say(kind?'One note. No apparent end.':'That wobble was absolutely intentional.');
   after(()=>{const actor=$('[data-cast]');actor.dataset.cast=kind?'right-sing':'left-dance';actor.setAttribute('aria-label',kind?'The singer holds a note':'The dancer tap dances');$('.t-performer').classList.remove('entering');window.OpeningSFX?.performance?.(kind);},1100);
   const back=$('#t-back');listen(back,'click',()=>{back.disabled=true;afterNarration(()=>{window.OpeningSFX?.stop?.();open('props');});});
  }
  function gacha(existing){
   const s=existing?activate(existing):stage('','gacha');s.dataset.stage='gacha';s.classList.add('t-gacha-stage');
   if(existing){s.querySelectorAll('.t-covered').forEach(el=>el.classList.add('t-to-wing'));after(()=>s.querySelector('.t-prop-row')?.remove(),600);}
   const tray=[1,2,3].map(n=>'<button data-insert="'+n+'" aria-label="Insert silver coin '+n+'"><img src="'+asset('coins-v16/coin-'+n+'.png')+'" alt="" draggable="false"></button>').join('');
   s.querySelector('.t-stage-content').insertAdjacentHTML('beforeend',rabbitMachine(true)+'<div class="t-coin-tray">'+tray+'</div><div class="t-capsule-place"></div>');
   $('.t-stage-controls').innerHTML='<span id="t-machine-hint" role="status">Insert a silver coin</span><button id="t-pull-assist" class="t-text-button" hidden>Pull the right ear ↓</button>';
   say('Ladies and gentlemen, your hero for the evening—');
   const ear=$('#t-ear'),assist=$('#t-pull-assist'),rig=$('.t-machine-rig'),message=$('#t-machine-hint'),gachaEpoch=epoch;
   let inserted=false,dispensed=false,drag=null,pull=0;
   function setPull(value){
    const next=Math.max(0,Math.min(1,value));
    if(Math.floor(next*4)>Math.floor(pull*4))window.OpeningSFX?.ratchet?.(Math.floor(next*4));
    pull=next;ear.style.setProperty('--ear-turn',(next*84)+'deg');
   }
   function releaseDrag(){
    if(!drag)return;
    const pointer=drag.id;drag=null;ear.classList.remove('t-ear-held');
    if(ear.hasPointerCapture?.(pointer))ear.releasePointerCapture(pointer);
    if(!dispensed)setPull(0);
   }
   function vend(){
    if(!inserted||dispensed)return;
    dispensed=true;setPull(1);releaseDrag();ear.disabled=true;assist.hidden=true;
    message.hidden=false;message.textContent='';s.dataset.vend='release';
    const pellet=document.createElement('img');
    pellet.src=asset('theatre-v41/capsule-closed.webp');pellet.alt='';pellet.draggable=false;pellet.className='t-vend-ball';rig.append(pellet);
    after(()=>{setPull(0);},reduced?80:220);
    after(()=>{const landing=pellet.getBoundingClientRect();capsule(landing);},reduced?240:870);
   }
   s.querySelectorAll('[data-insert]').forEach(b=>listen(b,'click',()=>{
    if(inserted)return;
    inserted=true;ear.disabled=false;
    const machine=rig.getBoundingClientRect(),coin=b.getBoundingClientRect();
    b.style.setProperty('--coin-x',(machine.left+machine.width*.459-coin.left-coin.width/2)+'px');
    b.style.setProperty('--coin-y',(machine.top+machine.height*.744-coin.top-coin.height/2)+'px');
    b.classList.add('t-inserting');s.querySelectorAll('[data-insert]').forEach(other=>other.disabled=true);
    after(()=>$('.t-coin-tray')?.classList.add('t-tray-empty'),500);
    if(window.OpeningSFX?.coin)window.OpeningSFX.coin();else window.OpeningSFX?.ratchet?.();
    message.hidden=true;assist.hidden=false;ear.focus({preventScroll:true});
   }));
   listen(ear,'pointerdown',e=>{
    if(e.button!==0||e.isPrimary===false||drag||!inserted||dispensed)return;
    e.preventDefault();
    try{ear.setPointerCapture(e.pointerId);}catch{return;}
    drag={id:e.pointerId,y:e.clientY,travel:Math.max(28,rig.getBoundingClientRect().height*.17)};
    ear.classList.add('t-ear-held');
   });
   listen(ear,'pointermove',e=>{
    if(drag?.id!==e.pointerId)return;
    if(e.buttons===0){releaseDrag();return;}
    setPull((e.clientY-drag.y)/drag.travel);if(pull>=1)vend();
   });
   const end=e=>{if(current(gachaEpoch,s)&&drag?.id===e.pointerId)releaseDrag();};
   for(const type of ['pointerup','pointercancel','lostpointercapture'])rawListen(ear,type,end);
   for(const event of ['blur','pagehide'])rawListen(window,event,()=>{if(current(gachaEpoch,s))releaseDrag();});
   rawListen(document,'visibilitychange',()=>{if(document.hidden&&current(gachaEpoch,s))releaseDrag();});
   listen(ear,'keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();vend();}});
   listen(ear,'click',e=>{if(e.detail===0)vend();});
   listen(assist,'click',vend);
   function capsule(landing){
    s.classList.add('t-capsule-focus');s.dataset.vend='close-up';
    const place=$('.t-capsule-place'),target=place.getBoundingClientRect();
    place.style.setProperty('--vend-origin-x',(landing.left+landing.width/2-target.left-target.width/2)+'px');
    place.style.setProperty('--vend-origin-y',(landing.top+landing.height/2-target.top-target.height/2)+'px');
    place.style.setProperty('--vend-scale',Math.min(1,landing.width/Math.max(1,target.width)));
    const closed=asset('theatre-v41/capsule-closed.webp');
    // Both moving edges follow the front bead of the same printed shell.
    const bead='M0 .505 C0 .566 .206 .625 .5 .625 S1 .566 1 .505';
    $('.t-capsule-place').innerHTML=`
     <button class="t-capsule" disabled aria-label="Lift the capsule lid, or tap to open">
      <svg class="t-cap-defs" width="0" height="0" aria-hidden="true"><defs>
       <clipPath id="t-cap-lid-shape" clipPathUnits="objectBoundingBox"><path d="${bead} V0 H0 Z"/></clipPath>
       <clipPath id="t-cap-cup-shape" clipPathUnits="objectBoundingBox"><path d="${bead} V1 H0 Z"/></clipPath>
       <filter id="t-cap-enamel" color-interpolation-filters="sRGB">
        <feMorphology in="SourceAlpha" operator="erode" radius=".65"/>
        <feComponentTransfer result="undercoat"><feFuncA type="linear" slope="8"/></feComponentTransfer>
        <feFlood flood-color="#eee1c9"/><feComposite in2="undercoat" operator="in"/>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
       </filter>
      </defs></svg>
      <img class="t-cap-bottom-back" src="${asset('theatre-v41/capsule-bottom.webp')}" alt="" draggable="false">
      <img class="t-cap-can" src="${asset('theatre-v45/can.png')}" alt="" draggable="false">
      <img class="t-cap-top" src="${closed}" alt="" draggable="false">
      <img class="t-cap-bottom" src="${closed}" alt="" draggable="false">
     </button>`;
    const ball=$('.t-capsule');let drag=null,moved=false,revealed=false,ready=false;
    let rollActive=false,rollStarted=0;
    function stopRoll(){rollActive=false;window.OpeningSFX?.stopCue?.('drumRoll');}
    function beat(){if(!rollActive||revealed||document.hidden||env.isModal?.()||window.OPENING_BASE?.audio?.enabled===false){stopRoll();return;}const elapsed=performance.now()-rollStarted;if(elapsed>=2800){stopRoll();return;}cue('drumRoll',{volume:.45+.45*elapsed/2800});after(beat,Math.max(82,320-elapsed*.095));}
    for(const type of ['blur','pagehide'])rawListen(window,type,stopRoll);rawListen(document,'visibilitychange',()=>{if(document.hidden)stopRoll();});
    $('#t-machine-hint').textContent='Lift the lid, or tap to open';after(()=>{window.OpeningSFX?.capsule();ready=true;ball.disabled=false;ball.classList.add('t-landed');ball.focus({preventScroll:true});rollActive=true;rollStarted=performance.now();after(beat,260);},reduced?0:620);
    function reveal(){if(revealed||!ready)return;revealed=true;stopRoll();drag=null;ball.disabled=true;afterNarration(openShell);}
    function openShell(){if(!current(gachaEpoch,s))return;ball.classList.add('t-open');s.classList.add('t-hero-revealed');env.music('reveal');if(window.OpeningSFX?.openCapsule)window.OpeningSFX.openCapsule();else window.OpeningSFX?.celebrate();
     ball.setAttribute('aria-label','An open capsule holding the I Can Act tin');
     confetti(s,false);say('…A can. Well, the label seems confident.');
     // Let the reveal line land, then the can takes the initiative. No extra action button.
     after(()=>afterNarration(rollOut,true),1300);
     function rollOut(){
      if(!current(gachaEpoch,s))return;
      const renderer=window.OpeningCanRenderer?.get(asset('theatre-v45/can.png'));
      if(reduced||!renderer){open('chase');return;}
      function start(){
       if(!current(gachaEpoch,s))return;
       const hero=ball.querySelector('.t-cap-can'),rect=hero.getBoundingClientRect(),crop=renderer.crop;
       const nw=hero.naturalWidth||crop.w,nh=hero.naturalHeight||crop.h,scale=Math.min(rect.width/nw,rect.height/nh);
       const ox=rect.left+(rect.width-nw*scale)/2,oy=rect.top+(rect.height-nh*scale)/2;
       const sx=ox+(crop.x+crop.w/2)*scale,sy=oy+(crop.y+crop.h/2)*scale,h=crop.h*scale;
       const floorCenter=ball.getBoundingClientRect().bottom-h/2;
       const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');canvas.className='t-can-exit';canvas.setAttribute('aria-hidden','true');env.getBody().append(canvas);hero.style.visibility='hidden';
       let time=0,last=0;const duration=2400;
       function loop(now){
        if(!current(gachaEpoch,s)){canvas.remove();return;}
        const dt=last?Math.min(40,Math.max(0,now-last)):0;last=now;
        if(!document.hidden&&!env.isModal?.())time+=dt;
        const w=window.innerWidth||innerWidth,vh=window.innerHeight||innerHeight,dpr=Math.min(window.devicePixelRatio||1,2);
        if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(vh*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(vh*dpr);}
        ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,vh);
        const p=Math.min(1,time/duration),e=p*p*(2-p),travel=(w+h-sx)*e;
        const hop=Math.min(1,p/.58),y=sy+(floorCenter-sy)*hop*hop-Math.sin(hop*Math.PI)*h*.26;
        renderer.draw(ctx,{x:sx+travel,y,height:h,angle:travel/Math.max(1,h*.29)});
        canvas.dataset.phase=String(window.OpeningCanRenderer.phase(travel/Math.max(1,h*.29)));
        if(p>=1){canvas.remove();open('chase');return;}env.setFrame(requestAnimationFrame(loop));
       }
       env.setFrame(requestAnimationFrame(loop));
      }
      // Lift the base of the tin clear of the near rim before the rolling drawing takes over.
      ball.classList.add('t-leaving');
      after(()=>{if(renderer.width)start();else renderer.ready.then(start,()=>{if(current(gachaEpoch,s))open('chase');});},460);
     }
    }
    listen(ball,'pointerdown',e=>{
     if(e.button!==0||e.isPrimary===false||drag||revealed||!ready)return;
     e.preventDefault();drag={id:e.pointerId,x:e.clientX,y:e.clientY};moved=false;
     try{ball.setPointerCapture(e.pointerId);}catch{drag=null;moved=true;}
    });
    listen(ball,'pointermove',e=>{
     if(drag?.id!==e.pointerId||revealed)return;
     const distance=Math.max(Math.abs(e.clientX-drag.x),drag.y-e.clientY);
     const threshold=Math.min(70,ball.clientWidth*.26);
     if(distance>8)moved=true;
     if(moved)ball.style.setProperty('--twist',Math.min(1,distance/threshold));
     if(distance>=threshold)reveal();
    });
    const release=e=>{if(drag?.id!==e.pointerId)return;drag=null;ball.style.removeProperty('--twist');if(e.type!=='pointerup')moved=true;};
    for(const type of ['pointerup','pointercancel','lostpointercapture'])rawListen(ball,type,e=>{if(current(gachaEpoch,s))release(e);});
    for(const type of ['pointerup','pointercancel'])rawListen(window,type,e=>{if(current(gachaEpoch,s))release(e);});
    rawListen(window,'blur',()=>{if(current(gachaEpoch,s)&&drag)release({pointerId:drag.id,type:'pointercancel'});});
    listen(ball,'click',e=>{const keyboard=e.detail===0&&!e.pointerType;if(!moved||keyboard)reveal();moved=false;});
   }
  }
  function confetti(s,withSound=true){
   const layer=s.querySelector('.t-confetti');if(withSound)window.OpeningSFX?.celebrate();
   for(let corner=0;corner<4;corner++)for(let i=0;i<(reduced?3:15);i++){const bit=document.createElement('i'),left=corner%2===0,top=corner<2;bit.className=i%4===0?'t-ribbon':'';bit.style.cssText='left:'+(left?0:100)+'%;top:'+(top?0:100)+'%;--dx:'+(left?1:-1)*(14+i*2.7)+'vw;--dy:'+(top?1:-1)*(12+(i%7)*5)+'vh;--spin:'+(i%2?1:-1)*(160+i*55)+'deg;--delay:'+(i%4)*.035+'s;--confetti-color:'+(['#a33c3d','#ddd0a6','#191919'][i%3]);layer.append(bit);}after(()=>layer.replaceChildren(),2600);
  }
  return {walk,curtain,props,gacha:()=>gacha()};
 }};
})();

;
(function(){
'use strict';
const B=window.OPENING_BASE;if(!B)return;const defs={"left-walk":{"file":"left-walk.webp","columns":4,"rows":2,"bounds":[69,24,345,426],"fps":8,"source_sha256":"e3c0fd35f71e9e542dc548acdf381959c9230a2b237e9a3db2376a5df42d6a61","width":1774,"height":887,"alpha_extrema":[0,255],"export":"Lossless WebP, fitted vaudeville hat on original cast cels"},"right-walk":{"file":"right-walk.webp","columns":4,"rows":2,"bounds":[89,11,359,415],"fps":8,"source_sha256":"02fc321ab8b72cb8114fa33c09c901aff9a82726193f305fa0a92b7f2aa37c99","width":1774,"height":887,"alpha_extrema":[0,255],"export":"WebP q90; original generated PNG retained"},"left-dance":{"file":"left-dance.webp","columns":4,"rows":2,"bounds":[62,0,353,423],"fps":7,"source_sha256":"93adfc7e658c7e577e41697f56c3b8c847d8aaf32f151b3cd698c8aa7bbf5d1c","width":1774,"height":887,"alpha_extrema":[0,255],"export":"Lossless WebP, fitted vaudeville hat on original cast cels"},"right-sing":{"file":"right-sing.webp","columns":4,"rows":2,"bounds":[95,13,389,424],"fps":4,"source_sha256":"ca82280643238b2de3d366034820811539cf095b16b64f79b3ff285cfb1a45ce","width":1774,"height":887,"alpha_extrema":[0,255],"export":"WebP q90; original generated PNG retained"},"rabbit-lie":{"file":"rabbit-lie.webp","columns":4,"rows":2,"bounds":[87,6,357,436],"fps":2.5,"source_sha256":"1101561d6fa470879a2422754497ba08fdeb28dc8706fbb775fe4f75d7f19d16","width":1774,"height":887,"alpha_extrema":[0,255],"export":"WebP q90; original generated PNG retained"},"rabbit-eyes":{"file":"rabbit-eyes.webp","columns":1,"rows":1,"bounds":[252,22,1000,1230],"fps":8,"source_sha256":"0a1a70af3d67a51eedff5dd97629868b03ef71a633f1fce48c67d70cf50aace7","width":1254,"height":1254,"alpha_extrema":[0,255],"export":"WebP q90; original generated PNG retained"},"left-idle":{"file":"left-idle.webp","columns":1,"rows":1,"bounds":[36,93,689,999],"fps":0,"width":740,"height":1019,"export":"Lossless WebP, fitted vaudeville hat on original cast cels"},"right-idle":{"file":"right-idle.webp","columns":1,"rows":1,"bounds":[53,13,703,959],"fps":0,"width":731,"height":1005,"export":"WebP q90; original generated PNG retained"}},images={};
function sheet(key){
 if(!images[key]&&defs[key]){
  const image=new Image();
  image.src=B.assets['assets/cast-v28/'+defs[key].file];
  images[key]=image;
 }
 return images[key];
}
function paint(ctx,key,n,x,y,width,height,flip=false){const d=defs[key],im=sheet(key);if(!d||!im.complete||!im.naturalWidth)return false;const cw=im.naturalWidth/d.columns,ch=im.naturalHeight/d.rows,b=d.bounds,bw=b[2]-b[0],bh=b[3]-b[1],s=Math.min(width/bw,height/bh),dw=bw*s,dh=bh*s;ctx.save();if(flip){ctx.translate(x+width,y);ctx.scale(-1,1);x=0;y=0;}ctx.drawImage(im,(n%d.columns)*cw+b[0],Math.floor(n/d.columns)*ch+b[1],bw,bh,x+(width-dw)/2,y+height-dh,dw,dh);ctx.restore();return true;}
function mount(root,{signal,reduced=false}={}){const canvases=[...root.querySelectorAll('canvas[data-cast]')];if(!canvases.length||signal?.aborted)return;const start=performance.now(),states=new WeakMap();let raf=0;for(const c of canvases)states.set(c,{last:'',nextBlink:2600+Math.random()*1800,blinkStart:-10000});function tick(now){if(signal?.aborted)return;const t=now-start;for(const c of canvases){if(!c.isConnected)continue;const key=c.dataset.cast,d=defs[key],im=sheet(key);if(!d||!im.complete||!im.naturalWidth)continue;const st=states.get(c),n=reduced||!d.fps?0:Math.floor(t*d.fps/1000)%(d.columns*d.rows);let lid=0,age=10000;if(key==='rabbit-lie'&&!reduced){if(t>=st.nextBlink){st.blinkStart=t;st.nextBlink=t+3200+Math.random()*3000;}age=t-st.blinkStart;if(age>=0&&age<55)lid=age/55;else if(age>=55&&age<135)lid=1;else if(age>=135&&age<225)lid=1-(age-135)/90;}const token=key+':'+n+':'+Math.round(lid*100);if(token===st.last)continue;st.last=token;const ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);if(key==='rabbit-lie'){const cw=im.naturalWidth/4,ch=im.naturalHeight/2;ctx.save();ctx.scale(c.width/512,c.height/512);ctx.drawImage(im,n%4*cw,Math.floor(n/4)*ch,cw,ch,0,0,512,512);const eyes=sheet('rabbit-eyes');if(lid>0&&eyes.complete&&eyes.naturalWidth){ctx.globalAlpha=lid;ctx.drawImage(eyes,530,377,100,83,217,148,40,44);ctx.drawImage(eyes,651,377,110,83,268,148,44,44);ctx.globalAlpha=1;ctx.drawImage(im,n%4*cw+248*cw/512,Math.floor(n/4)*ch+190*ch/512,25*cw/512,25*ch/512,248,190,25,25);}ctx.restore();c.dataset.blink=lid===0?'open':lid===1?'closed':age<55?'closing':'opening';}else paint(ctx,key,n,0,0,c.width,c.height);c.dataset.frame=String(n);c.dataset.motion=key;}raf=requestAnimationFrame(tick);}raf=requestAnimationFrame(tick);signal?.addEventListener('abort',()=>cancelAnimationFrame(raf),{once:true});return()=>cancelAnimationFrame(raf);}
window.OpeningCast={paint,mount,frame(key,t){const d=defs[key];return d&&d.fps?Math.floor(t*d.fps/1000)%(d.columns*d.rows):0;}};
})();

;
(function(root){
  'use strict';
  // Each piece is traced from the supplied two-line title. A narrow overlap at
  // each pen join keeps the complete print continuous at every display size.
  const strokes=[
    [265,37.2,"M502 320C481 316 474 301 480 281 488 247 525 227 581 224 655 220 736 241 800 239 836 240 855 234 861 223","M565.5,218.4 550.5,220.2 540.5,222.2 529.5,225.2 518.5,229.2 506.5,235.1 498.5,240.2 488.5,248.3 480.9,256.5 476.4,262.5 473.1,269.5 471.2,276.5 470.7,286.5 471.3,293.5 474.3,303.5 478.2,310.5 483.5,316.6 488.5,319.8 494.5,321.8 499.5,321.7 502.3,320.5 503,319.5 499.5,317.7 492.5,311.3 490.2,306.5 489,300.5 489.1,292.5 491.2,284.5 495.2,276.5 501.3,268.5 510.5,259.4 517.5,254.2 523.5,250.4 536.5,244.2 552.5,239.2 572.5,235.2 595.5,232.2 614.5,231.1 642.5,231.2 667.5,232.1 682.5,233.3 749.5,241.2 751.5,242 752.5,241 755.5,241 756.5,240 759.5,240 760,241.5 761.5,242.8 793.5,246 812.5,246.9 832.5,247 845.5,244.9 856.5,240.8 860.5,238.1 863.7,234.5 864.7,232.5 865.7,227.5 864.7,223.5 863.5,222.3 861.5,221.3 858.5,220.9 857.5,221 851.5,224.9 846.5,226.8 832.5,229.8 810.5,231.9 787.5,232.7 770.5,232.6 746.5,231.8 720.5,229.9 659.5,222.2 625.5,219.2 597.5,217.6Z"],
    [260,45.8,"M759 239C734 255 710 282 687 315 645 371 607 442 565 483 524 523 480 545 435 545","M757.5,237 756.5,238 754.5,238 753.5,239 750.5,239 749.5,240 746.5,240 746,240.5 746.5,241 750,241.5 733.5,254.3 719.8,266.5 702.5,283.8 685.3,302.5 666,325.5 650.3,345.5 628.2,374.5 599.6,413.5 580.8,437.5 559.7,461.5 530.5,490.7 517.5,502.6 503.5,513.6 491.5,521.7 477.5,529.6 464.5,534.9 453.5,537.8 438.5,539.5 433.5,539.4 433,540.5 433,548.5 433.5,549.4 446.5,549.6 458.5,548.8 467.5,547.7 485.5,543.9 500.5,538.9 517.5,530.8 533.5,520.8 548.5,509.7 564.5,495.7 575.6,484.5 588.7,469.5 604.7,449.5 617.8,431.5 635,405.5 687.1,321.5 697.2,306.5 705.4,295.5 721.5,276.6 739.8,258.5 749.5,250.2 757.5,244.4 759.5,243.1 762.5,243 763,242.5 763,240.5 762,239.5 762,238.5 760.5,237Z"],
    [220,33.8,"M435 545C394 546 373 527 374 497 375 443 435 389 492 367 527 354 560 350 586 354","M543.5,349.5 523.5,351.2 506.5,354.2 488.5,359.2 468.5,367.1 448.5,377.2 429.5,389.3 412.8,402.5 397.5,417.1 386.4,430.5 376.2,446.5 369.3,461.5 365.2,475.5 364.1,482.5 363.8,491.5 364.1,499.5 365.2,505.5 367.1,511.5 370.2,518.5 373.3,523.5 377.5,528.5 382.5,532.8 388.5,536.9 395.5,540.8 401.5,543 402.5,543.8 408.5,545.8 417.5,547.9 434.5,549.5 435,548.5 435,540.5 434.5,539.7 421.5,538.9 415.5,537.8 411.5,536.7 404.5,533.8 398.5,529.5 394.5,525.2 391.2,520.5 388.4,514.5 386.2,505.5 386.3,492.5 388.3,483.5 391.4,473.5 394.1,466.5 399.1,456.5 407.2,443.5 415.2,432.5 424.4,421.5 430.5,415.3 440.5,406.4 454.5,395.4 469.5,385.2 481.5,378.2 495.5,371.2 507.5,366.1 521.5,361.3 533.5,358.1 543.5,356.3 553.5,355.1 569.5,355 582.5,356 585.5,355.7 587.2,354.5 587.2,353.5 584.5,352.1 580.5,351 574.5,350.3 557.5,349.3Z"],
    [280,39.2,"M946 298C924 280 894 285 866 294 811 312 745 368 693 428 658 467 631 509 626 533","M896.5,282.5 880.5,285 861.5,290.3 845.5,296.3 826.5,305.3 809.5,315.2 784.5,332.3 766.5,346.3 745.8,364.5 715.5,393.8 689.3,421.5 663.4,451.5 641,480.5 630.3,497.5 623.2,512.5 621.3,518.5 620.3,525.5 620.9,530.5 622.5,533.4 626.5,535.8 629.5,536 630.5,535.5 631,534.5 628,531.5 629,530.5 629,529.5 630,528.5 630,527.5 631,526.5 631,525.5 633,522.5 633,521.5 635,519.5 636,516.5 638,514.5 639,511.5 641,509.5 641,508.5 643,506.5 643,505.5 646,502.5 646,501.5 648,499.5 648,498.5 654,491.5 654,490.5 657,487.5 657,486.5 661,482.5 661,481.5 666,476.5 666,475.5 671,470.5 671,469.5 678,462.5 678,461.5 690,449.5 690,448.5 714.5,424 715.5,424 727.5,412 728.5,412 737.4,403.5 756.7,383.5 783.8,357.5 801.5,342.3 818.5,329.3 836.5,317.3 854.5,307.2 871.5,299.3 887.5,294.2 898.5,292.1 908.5,291.3 917.5,291.4 926.5,292.3 934.5,294.2 939.5,296.1 946.5,299.9 946.9,299.5 944.5,294.8 941.4,291.5 936.5,288.2 930.5,285.3 922.5,283.3 914.5,282.3 903.5,282Z"],
    [260,49.6,"M626 533C658 487 728 419 788 387 812 374 832 374 832 385 831 398 789 429 761 468 743 492 719 527 729 532 750 542 785 514 821 481","M820.5,373.4 809.5,375.1 798.5,379.2 783.5,387.2 771.5,394.4 759.5,402.3 741.5,415.4 717.5,434.3 694.5,453.9 693.6,453.5 725.4,416.5 751.8,388.5 751.5,388.2 747.5,392.2 746.5,392 741.5,397 740.5,397 735.5,402 734.5,402 726.5,410 725.5,410 713.5,422 712.5,422 688,446.5 688,447.5 676,459.5 676,460.5 669,467.5 669,468.5 664,473.5 664,474.5 659,479.5 659,480.5 655,484.5 655,485.5 652,488.5 652,489.5 646,496.5 646,497.5 644,499.5 644,500.5 641,503.5 641,504.5 637,509.5 636,512.5 634,514.5 633,517.5 631,519.5 631,520.5 630,521.5 630,522.5 629,523.5 629,524.5 627,527.5 627,528.5 625,530.5 625,532.5 628.5,536 630.5,535.5 634.3,528.5 643.2,516.5 656.3,501.5 670.5,486.8 700.5,458.3 720.5,441.2 739.5,426.2 763.5,409.2 786.5,395 796.5,390.3 809.5,385.1 816.5,383.1 824.5,382.2 824.8,382.5 822.5,384.8 786.5,416.8 762.5,439.5 747.3,455.5 735.3,469.5 728.3,478.5 722.2,487.5 714.4,501.5 712.2,506.5 710.1,513.5 709,519.5 709.1,525.5 710.5,529.4 712.5,532.4 715.5,535 719.5,536.9 723.5,537.8 728.5,538.1 736.5,537.9 743.5,536.9 748.5,535.8 757.5,532.8 765.5,529 774.5,523.7 788.5,513.8 808.5,496.6 809.1,497.5 808.9,505.5 809.5,509.9 810,508.5 811,507.5 811,506.5 812,505.5 812,504.5 813,503.5 813,502.5 814,501.5 814,500.5 816,498.5 817,495.5 819,493.5 819,492.5 821,490.5 821,489.5 823,487.5 823,486.5 825,484.5 825,481.5 822.5,479 820.5,479 820,480.5 818.5,481 818,482.5 816.5,483 815.5,484 814.5,484 813.5,483 812.5,482.8 799.5,494.6 783.5,507.8 771.5,516.7 761.5,522.6 754.5,525.7 745.5,527.8 740.5,527.7 738.5,526.8 736.9,524.5 736.7,521.5 737.1,517.5 741.2,507.5 751.2,490.5 765.3,470.5 784.3,447.5 805.5,424.8 831,399.5 834.5,395.4 837.7,390.5 838.9,387.5 839.3,383.5 838.9,380.5 837.1,377.5 834.5,375.5 831.5,374.3 825.5,373.4Z"],
    [160,41.7,"M816 485C834 468 853 458 875 452 923 439 969 413 981 391 989 374 968 372 954 379","M964.5,373.5 951.5,375.4 951,377.5 952,378.5 952,380.5 953,381.5 953,383.5 954.5,384.8 962.5,382.2 967.5,381.8 972.5,382.1 974.5,382.9 976.5,384.8 977.6,387.5 977.6,390.5 975.7,395.5 971.9,400.5 964.5,407.5 952.5,417 943.5,422.9 928.5,430.8 917.5,435.8 896.5,443.8 870.5,452.3 870,451.5 870.5,450.8 880.5,439.8 890.2,430.5 889.5,430 887.5,432.1 886.5,432 885.5,433 884.5,433 881.5,435 880.5,435 878.5,437 877.5,437 876.5,438 875.5,438 872.5,440 871.5,440 869.5,442 866.5,443 864.5,445 861.5,446 859.5,448 858.5,448 856.5,450 855.5,450 852.5,453 851.5,453 848.5,456 847.5,456 842.5,461 841.5,461 835.5,467 833.5,467 826.5,460 824.3,462.5 820.3,468.5 816.3,475.5 813.5,481.5 811,484.5 812.5,486 814.5,486 815.5,487 817.5,487 818,485.5 820,484.5 820.5,483 825.5,483 827,481.5 827,480.5 833,474.5 833,473.5 834.5,473 835.5,472 837,473.5 837,474.5 839.5,477 840.5,477 846.5,483 847.5,483 854.1,470.5 861.5,460.3 884.5,454 903.5,447.6 918.5,441.9 929.5,436.9 945.5,428.8 957.5,421.7 966.5,415.7 976.9,407.5 980.7,403.5 983.6,399.5 985.6,395.5 986.8,391.5 987,385.5 985.7,380.5 984.2,378.5 981.5,376.3 975.5,374.2 969.5,373.4Z"],
    [210,47.7,"M954 379C916 391 868 424 842 459 817 494 813 525 840 532 882 543 914 520 952 484","M951.5,375.4 938.5,379.2 921.5,386.1 903.5,395.2 886.5,405.4 870.5,416.3 856.5,427.3 845.5,437.3 834.2,449.5 825,461.5 825,462.5 832,469.5 832,470.5 831,471.5 831,472.5 825,478.5 825,479.5 823,481.5 823,482.5 821,484.5 821,485.5 819,487.5 819,488.5 817,490.5 817,491.5 815,493.5 814,496.5 812,498.5 812,499.5 811,500.5 811,501.5 809,504.5 809.3,510.5 811.2,517.5 814.4,523.5 819.7,529.5 824.5,532.9 830.5,535.7 837.5,537.7 844.5,538.9 857.5,539.6 858.5,539 859.5,539.6 871.5,538.9 879.5,537.7 887.5,535.8 893.5,533.8 902.5,529.8 918.5,520.6 926.5,514.7 938.5,504.7 953.1,491.5 954.7,488.5 955.1,484.5 954.4,482.5 952.5,482 924.5,506.7 913.5,514.7 902.5,520.9 893.5,524.9 883.5,527.7 873.5,529 865.5,529.3 859.5,528.8 852.5,526.7 848.6,524.5 845.4,521.5 843.2,517.5 841.9,510.5 842.2,500.5 844.2,491.5 848.1,481.5 848,480.5 842.5,475 841.5,475 839,472.5 839,471.5 837,469.5 843.5,463 844.5,463 849.5,458 850.5,458 857.5,452 858.5,452 863.5,448 866.5,447 868.5,445 871.5,444 873.5,442 874.5,442 875.5,441 876.5,441 879.5,439 880.5,439 882.5,437 883.5,436.8 899.5,422.3 924.5,402.3 943.5,390.2 955.5,384.2 956,382.5 955,381.5 955,379.5 954,378.5 954,376.5 952.5,375.1Z"],
    [205,36.9,"M963 602C943 581 921 570 894 571 852 569 832 585 832 616 827 662 857 685 925 697 938 698 950 699 962 699","M880.5,567.3 873.5,568.3 864.5,570.4 855.5,573.2 848.5,576.2 843.5,579.3 838.5,583.4 834.5,587.9 831.2,592.5 828.4,597.5 824.3,607.5 823.2,611.5 822,619.5 822.1,629.5 823.2,636.5 825.4,643.5 828.2,649.5 831.4,654.5 835.3,659.5 838.5,662.8 840,663.5 840.5,664.7 846.5,669.8 858.5,677.8 874.5,685.8 890.5,691.7 908.5,696.7 929.5,700.8 949.5,703 950.5,706 954.5,702 955.5,702 956.5,701 961.5,707 963.5,707 964,706.5 964,693.5 963.5,693 961.5,693 958.5,696 957.5,696 956.5,697 956,695.5 953,692.5 953,691.5 951.5,690 950.5,690.4 950.1,693.5 949.5,694 937.5,692.8 916.5,688.9 904.5,685.8 892.5,681.9 878.5,675.8 866.5,668.8 855.5,659.7 851.5,655.3 848.1,650.5 844.2,642.5 842.1,633.5 842.1,622.5 844.3,612.5 848.3,602.5 853.2,594.5 860.5,587.3 867.5,583.3 879.5,579.3 891.5,577.2 906.5,577 917.5,578.3 928.5,581.3 937.5,585.3 945.5,590.2 959.5,601.7 961.5,602.8 963.5,603 964,602.5 963.9,600.5 962.6,598.5 953,588.5 943.5,581.4 935.5,577 934.5,577 933.5,576 920.5,571.1 908.5,568.2 899.5,567Z"],
    [235,29.9,"M962 699C1022 698 1077 684 1118 657 1152 635 1166 603 1151 589 1137 573 1108 573 1084 579","M1094.5,569.5 1085.5,570.3 1080.5,571.1 1080.1,571.5 1080,572.5 1081,573.5 1081,577.5 1082,578.5 1082,581.5 1083,582.5 1083,586.5 1084.5,588.9 1094.5,586.1 1106.5,584.3 1117.5,584.2 1127.5,585.1 1135.5,587.1 1140.5,589.5 1144.9,593.5 1147.6,597.5 1148.9,601.5 1149,608.5 1146.9,616.5 1143.8,623.5 1139.7,630.5 1131.7,640.5 1125.5,646.6 1115.5,654.7 1099.5,664.9 1090.5,669.6 1076.5,675.8 1062.5,680.9 1049.5,684.9 1028.5,689.9 1010.5,692.9 990.5,694.8 969.5,695.2 968.8,694.5 969.1,693.5 973.5,684.4 970.5,687 969.5,687 967.5,689 966.5,689 962,693.5 962,707.5 962.5,708 963.5,708.2 964.4,704.5 965.5,703.7 993.5,702.8 1019.5,699.8 1030.5,698 1049.5,693.8 1076.5,685.9 1097.5,677.7 1116.5,667.7 1125.5,661.8 1134.5,655 1143.7,646.5 1149.7,639.5 1155.9,630.5 1160.9,620.5 1163.7,612.5 1164.9,606.5 1164.8,599.5 1163.7,594.5 1160.8,588.5 1156.5,583.5 1150.5,579.2 1142.5,575.3 1133.5,572.3 1123.5,570.2 1111.5,569Z"],
    [190,36.9,"M1084 579C1031 590 986 629 966 672 958 689 950 713 961 721 971 731 996 733 1001 728 997 721 978 716 957 716","M1078.5,571.4 1065.5,574.3 1048.5,580 1034.5,586.4 1020.5,594.3 1007.5,603.2 997.5,611.3 985.5,622.8 975.4,634.5 965,649.5 959.2,660.5 954.1,673.5 951.2,685.5 950.2,692.5 951,693.5 951,694.5 954,697.5 954,699.5 952.5,700 950,702.5 951,713.5 955,716.5 955,717.5 954,718.5 953.9,721.5 958.5,726.7 961.5,728.8 967.5,731.7 978.5,733.9 988.5,734.2 995.5,733.8 1001.5,731.7 1004,729.5 1004.7,728.5 1004.8,726.5 1002.5,723.3 999.5,721.2 992.5,718.1 980.5,715.1 969.5,714 962.5,714.1 962.1,713.5 964,705.5 961,702.5 961,701.5 959,699.5 959,698.5 960.5,698 963.5,695 964.5,695 968.5,691 969.5,691 971,689.5 980.3,672.5 993.3,653.5 1005.4,639.5 1019.5,626.3 1037.5,612.3 1053.5,602.2 1067.5,595.2 1085.6,588.5 1086,585.5 1085,584.5 1085,580.5 1084,579.5 1084,576.5 1083,575.5 1083,571.5 1081.5,571Z"],
    [230,46.8,"M957 716C909 724 848 759 815 805 788 843 783 885 808 902 835 923 887 917 929 895","M951.5,711 950.9,711.5 950.9,714.5 950.5,714.9 942.5,715.3 928.5,717.2 915.5,720.2 902.5,724.3 885.5,731.1 865.5,741.2 845.5,754 829.5,766.4 815.5,779.5 803.2,793.5 794.2,806.5 790.3,813.5 786.3,822.5 783.3,831.5 781,841.5 779.4,856.5 780.2,869.5 782.4,878.5 784.2,883.5 787.4,889.5 790.9,894.5 795.5,899.7 799.9,903.5 804.5,906.8 810.5,910 817.5,912.9 823.5,914.7 833.5,916.7 842.5,917.7 861.5,917.8 877.5,915.8 886.5,913.8 897.5,910.7 905.5,908 915.5,903.8 928.5,897.7 932,895.5 931,894.5 931,893.5 929,890.5 929,888.5 928.5,888 917.5,893.6 905.5,898.7 893.5,902.7 880.5,905.7 871.5,906.9 857.5,907.3 846.5,906.8 835.5,904.7 829.5,902.6 823.5,899.1 818.5,894.3 815.2,889.5 813.2,885.5 811.2,878.5 810.6,870.5 811.1,862.5 813.3,848.5 815.3,839.5 819.2,827.5 823.2,818.5 830.2,805.5 837.3,794.5 846.3,782.5 853.3,774.5 867.5,760.2 880.5,749.3 896.5,738.3 910.5,730.4 919.5,726.2 929.5,722.4 940.5,719.2 950.5,717.2 952,717.5 953.2,720.5 954.5,722.5 955.5,723 956,722.5 956,720.5 957,719.5 957,714.5 955.5,713 954.5,713 952.5,711Z"],
    [230,35.5,"M929 895C983 870 1032 817 1038 780 1045 743 1014 740 981 758 935 779 902 819 888 849","M1016.5,744.5 1006.5,745.2 1000.5,746.2 991.5,748.3 982.5,751.3 973.5,755.1 963.5,760.2 947.5,770.2 930.7,783.5 916.3,797.5 902.2,814.5 892.4,829.5 886,842.5 885.9,848.5 887.5,849.9 891,848.5 897.3,835.5 906.4,821.5 915.3,810.5 924.8,800.5 936.8,789.5 948.5,780.3 960.5,772.2 972.6,765.5 979.5,762.3 987.5,759.3 995.5,757.3 1004.5,756.1 1010.5,756.2 1015.5,757.2 1020.1,759.5 1023.8,763.5 1025.9,768.5 1026.2,772.5 1025.7,777.5 1022.9,788.5 1019.7,796.5 1015.8,804.5 1005.7,820.5 998.7,829.5 990.1,839.5 981.4,848.5 970.5,858.7 959.5,867.8 948.5,875.8 926.1,889.5 927,890.5 927,892.5 928,893.5 928,894.5 929,895.5 929.5,897 943.5,889.6 960.5,879 981.5,863.6 998.5,849.6 1013.5,835.7 1026.7,821.5 1034.7,811.5 1042.8,799.5 1048.7,787.5 1051.7,776.5 1051.9,765.5 1049.8,758.5 1045.5,752.5 1041.5,749.2 1037.5,747.2 1029.5,745.1 1020.5,744.4 1019.5,745 1018.5,744.4Z"],
    [180,34.4,"M1166 737C1146 750 1111 785 1080 822 1060 845 1041 875 1037 890","M1163.5,736.3 1151.5,739.1 1142.5,742.3 1136.5,745.3 1130.5,749.3 1124.7,754.5 1107.3,772.5 1081.3,801.5 1066.3,819.5 1051.4,838.5 1045.3,847.5 1038.2,859.5 1033.3,869.5 1031.1,876.5 1030.4,883.5 1031.2,887.5 1032.7,889.5 1034.5,890.8 1037.5,891.8 1039.5,892 1040.6,891.5 1041,890.5 1039,888.5 1040,887.5 1041,884.5 1043,882.5 1044,879.5 1046,877.5 1046,876.5 1048,874.5 1048,873.5 1050,871.5 1050,870.5 1056,863.5 1056,862.5 1058,860.5 1058,859.5 1062,855.5 1062,854.5 1066,850.5 1066,849.5 1071,844.5 1071,843.5 1079,835.5 1079,834.5 1096,817.5 1096,816.5 1102.5,810 1103.5,810 1104,808.5 1105.5,807 1106.5,807 1115,798.5 1166,736.5 1165.5,736Z"],
    [225,47.6,"M1037 890C1068 846 1142 778 1203 749 1228 737 1245 736 1243 746 1239 761 1191 798 1164 835 1147 855 1127 882 1139 887 1164 898 1195 871 1234 838","M1225.5,736.4 1217.5,738.2 1204.5,743.5 1186.5,753.2 1171.5,762.4 1155.5,773.3 1135.5,788.3 1101.5,816.4 1101.1,815.5 1125.6,785.5 1122.5,788 1121.5,788 1104.5,805 1103.5,805 1102,806.5 1101.5,808 1100.5,808 1094,814.5 1094,815.5 1077,832.5 1077,833.5 1069,841.5 1069,842.5 1064,847.5 1064,848.5 1060,852.5 1060,853.5 1056,857.5 1056,858.5 1054,860.5 1054,861.5 1051,864.5 1051,865.5 1048,868.5 1048,869.5 1046,871.5 1046,872.5 1042,877.5 1041,880.5 1039,882.5 1039,883.5 1037,886.5 1037,890.5 1038.5,891.9 1040.5,891.6 1052.5,876.6 1064.2,863.5 1072.8,854.5 1087.5,840.5 1124.5,808.3 1140.5,795.3 1161.5,779.2 1178.5,767.3 1197.5,756.3 1208.5,751.4 1219.5,747.2 1227.5,745.1 1234.5,744.3 1234.8,744.5 1234.2,745.5 1201.5,773 1185.5,787.3 1163.5,807.9 1148.4,823.5 1135.2,839.5 1127.1,851.5 1122.4,861.5 1121.1,865.5 1120,873.5 1121.2,880.5 1122.1,882.5 1123.9,885.5 1126.8,888.5 1130.5,890.8 1133.5,891.8 1143.5,893 1148.5,892.7 1158.5,890.9 1167.5,887.8 1175.5,884 1176.5,883 1181.5,880.7 1194.5,872.6 1202.5,867 1214.5,857.3 1215.2,857.5 1215.1,858.5 1213.3,864.5 1212.3,871.5 1212.5,876.6 1213.5,876 1214,874.5 1215,873.5 1215,872.5 1216,871.5 1216,870.5 1218,868.5 1218,867.5 1220,865.5 1220,864.5 1222,862.5 1222,861.5 1225,858.5 1225,857.5 1229,853.5 1229,852.5 1235,846.5 1235,845.5 1240,840.5 1240,838.5 1241,837.5 1241,826.5 1240,825.5 1240,822.5 1238.5,820.7 1231.3,829.5 1224.3,839.5 1209.5,852.8 1199.5,860.8 1191.5,866.8 1180.5,873.8 1173.5,877.6 1166.5,880.7 1158.5,882.8 1155.5,883 1152.5,882.9 1148,880.5 1146.3,878.5 1145.5,874.5 1146.1,869.5 1150.3,859.5 1158.2,847.5 1168.3,834.5 1184.4,816.5 1196.9,803.5 1241.7,760.5 1247.7,752.5 1248.9,749.5 1249.4,745.5 1248.9,742.5 1246.5,739.2 1242.5,737.1 1238.5,736.2 1231.5,736Z"],
    [240,49.9,"M1408 738C1371 741 1319 769 1282 803 1251 829 1225 858 1227 880 1229 898 1266 880 1285 863 1309 846 1331 825 1347 808","M1426.5,729.9 1404.5,749.4 1388.7,764.5 1389.5,765 1391.5,763 1394.5,762 1396.5,760 1397.5,760 1398.5,759 1399.5,759 1400.5,758 1401.5,758 1402.5,757 1403.5,757 1404.5,756 1405.5,756 1406.5,755 1407.5,755 1410.5,753 1411.5,753 1412.5,752 1413.5,752 1416.5,749 1417.5,749 1419,747.5 1419,746.5 1422,743.5 1422,742.5 1423,741.5 1423,740.5 1425,737.5 1425,735.5 1426,734.5 1426,731.5 1427,730.5ZM1386.5,735.4 1372.5,737.2 1357.5,741.1 1338.5,748.2 1322.5,756 1303.5,767.2 1288.5,777.2 1272.5,789.2 1254.5,804.4 1244.9,813.5 1237,822.5 1237,823.5 1238,824.5 1238,827.5 1239,828.5 1239,835.5 1238,836.5 1238,838.5 1233,843.5 1233,844.5 1227,850.5 1227,851.5 1223,855.5 1223,856.5 1220,859.5 1220,860.5 1218,862.5 1218,863.5 1216,865.5 1216,866.5 1214,868.5 1214,869.5 1213,870.5 1212.2,873.5 1213.2,880.5 1214.2,883.5 1217,887.5 1219.5,889.7 1223.5,891.7 1228.5,892.8 1232.5,893 1242.5,891.8 1249.5,889.8 1254.5,887.7 1266.5,881 1284.5,868.8 1318.5,841.6 1318.7,842.5 1313.1,852.5 1309.2,861.5 1307.2,869.5 1307,871.5 1307.5,872 1308,871.5 1307.9,870.5 1311,867.5 1311,866.5 1318,859.5 1318,858.5 1329,847.5 1329,846.5 1339,836.5 1339,835.5 1348,826.5 1348,825.5 1356,817.5 1356,816.5 1359,813.5 1359,812.5 1361,809.5 1361,807.5 1362,806.5 1362,802.5 1363,801.5 1363,792.5 1362.5,791.9 1345.5,809.6 1324.5,828.7 1299.5,848.8 1275.5,865.7 1261.5,873.9 1254.5,876.7 1249.5,877.9 1246.5,877.9 1243.5,876.5 1242.1,874.5 1242,869.5 1243.2,864.5 1249.2,852.5 1257.3,840.5 1264.3,831.5 1273.5,821.1 1284.5,810 1297.5,798.3 1309.5,788.3 1321.5,779.2 1334.5,770.2 1345.5,763.3 1356.5,757.3 1369.5,751.3 1377.5,748.1 1392.5,743.2 1407.5,739.7 1409.4,738.5 1410,737.5 1409.5,736.1 1405.5,735.1Z"],
    [265,50.6,"M1550 656C1515 675 1462 721 1425 757 1380 800 1343 848 1327 871 1312 898 1353 889 1376 872 1390 862 1403 850 1410 843","M1541.5,656.4 1536.5,657.4 1528.5,660.3 1510.5,669.3 1493.5,679.3 1473.5,693 1450.5,710.3 1424.7,731.5 1423,733.5 1423,735.5 1422,736.5 1422,737.5 1420,740.5 1420,741.5 1417,744.5 1417,745.5 1415.5,747 1414.5,747 1411.5,750 1410.5,750 1409.5,751 1408.5,751 1407.5,752 1406.5,752 1405.5,753 1404.5,753 1403.5,754 1402.5,754 1399.5,756 1398.5,756 1397.5,757 1396.5,757 1382.5,770.7 1361,793.5 1361,799.5 1360,800.5 1360,804.5 1359,805.5 1359,807.5 1358,808.5 1357,811.5 1354,814.5 1354,815.5 1346,823.5 1346,824.5 1337,833.5 1337,834.5 1327,844.5 1327,845.5 1316,856.5 1316,857.5 1309,864.5 1309,865.5 1308,866.5 1307.2,869.5 1307.2,878.5 1309.1,883.5 1312.5,887.7 1315.5,889.8 1320.5,891.7 1331.5,893 1342.5,891.8 1352.5,888.8 1363.5,883.7 1379.5,873.5 1392.5,864 1409.8,849.5 1411.7,845.5 1411.9,842.5 1410.8,840.5 1409.5,840 1397.5,850.7 1382.5,862.7 1372.5,869.7 1361.5,875.9 1353.5,879.7 1345.5,881.7 1340.5,881 1338.4,879.5 1337.3,877.5 1337.1,871.5 1338.2,866.5 1342.3,857.5 1347.1,849.5 1353.3,840.5 1363.4,827.5 1388.3,798.5 1404.3,781.5 1421.5,764.4 1464.5,725.3 1497.5,697.3 1528.5,672.5 1529.5,671 1530.5,671 1550,656.5 1549.5,655.7Z"]
  ];
  let edition=0;
  function markup(){
    const prefix='e-end-ink-'+(++edition)+'-';
    const masks=[],letters=[];
    let delay=100;
    strokes.forEach(([duration,width,center,outline],index)=>{
      const id=prefix+index,ms=Math.round(duration*.87);
      masks.push('<mask id="'+id+'" maskUnits="userSpaceOnUse" x="350" y="204" width="1217" height="729"><path class="e-scribe" pathLength="1" d="'+center+'" fill="none" stroke="white" stroke-width="'+width+'" stroke-linecap="round" stroke-linejoin="round" style="--write-time:'+ms+'ms;--write-delay:'+delay+'ms"/></mask>');
      letters.push('<path class="e-last-letter" fill="currentColor" fill-rule="evenodd" mask="url(#'+id+')" d="'+outline+'"/>');
      delay+=ms-19;
    });
    return '<h2 class="e-end-lettering"><span class="e-end-reading">The End</span><svg viewBox="350 204 1217 729" aria-hidden="true" focusable="false"><defs>'+masks.join('')+'</defs>'+letters.join('')+'</svg></h2>';
  }
  root.OpeningEndTitle={markup};
})(window);

;
(function(){
 'use strict';
 const target=['duck-left','can','rabbit','duck-right'];
 const names={'duck-left':'The dancer',can:'The can',rabbit:'The usher','duck-right':'The singer'};
 const measuredFrames={"left-bow":[{"bounds":[45,44,349,472],"anchor":[202.0,472]},{"bounds":[39,59,349,472],"anchor":[202.5,472]},{"bounds":[35,98,344,473],"anchor":[203.0,472]},{"bounds":[24,188,351,472],"anchor":[202.0,472]},{"bounds":[28,191,352,472],"anchor":[202.0,472]},{"bounds":[34,117,343,472],"anchor":[202.0,472]},{"bounds":[36,66,348,472],"anchor":[202.5,472]},{"bounds":[39,44,349,473],"anchor":[202.0,472]}],"right-bow":[{"bounds":[25,62,360,472],"anchor":[191.5,472]},{"bounds":[26,77,359,472],"anchor":[192.5,472]},{"bounds":[24,128,364,472],"anchor":[192.0,472]},{"bounds":[24,200,360,472],"anchor":[192.5,472]},{"bounds":[24,205,361,472],"anchor":[192.5,472]},{"bounds":[25,138,366,472],"anchor":[193.0,472]},{"bounds":[23,93,366,472],"anchor":[192.5,472]},{"bounds":[24,62,361,472],"anchor":[192.5,472]}],"rabbit-bow":[{"bounds":[11,42,371,482],"anchor":[193.5,482]},{"bounds":[12,65,373,482],"anchor":[193.5,482]},{"bounds":[10,126,373,482],"anchor":[193.5,482]},{"bounds":[5,230,375,482],"anchor":[193.5,482]},{"bounds":[6,232,374,482],"anchor":[194.0,482]},{"bounds":[10,124,373,482],"anchor":[194.0,482]},{"bounds":[11,71,373,482],"anchor":[194.0,482]},{"bounds":[11,42,372,482],"anchor":[193.5,482]}]};
 const defaults={
  'duck-left':{file:'left-bow.webp',frames:measuredFrames['left-bow'],columns:4,rows:2,height:.88},
  rabbit:{file:'rabbit-bow.webp',frames:measuredFrames['rabbit-bow'],columns:4,rows:2,height:1},
  'duck-right':{file:'right-bow.webp',frames:measuredFrames['right-bow'],columns:4,rows:2,height:.83}
 };
 window.OpeningEnsemble={mount:function(env){
  const {base,asset,listen,cue,hint,say,saved,save,home,reduced}=env;
  const content=base('','','');content.classList.add('e-encore-content');
  content.innerHTML='<section class="e-ensemble" aria-label="Arrange the cast to match the group silhouette"><img class="e-backdrop" src="'+asset('scene-v47/stage-extended.png')+'" alt="" draggable="false"><h1 class="e-heading">Curtain Call</h1><canvas class="e-composite-shadow" width="1400" height="520" aria-label="A single group outline: the outer wing and hat, can lid, one long ear and singer’s cheek"></canvas><div class="e-company">'+['rabbit','duck-right','duck-left','can'].map(id=>'<button type="button" class="e-actor" data-actor="'+id+'" aria-label="'+names[id]+'"><canvas width="384" height="512" aria-hidden="true"></canvas></button>').join('')+'</div></section><div class="e-controls"><p class="e-message" role="status" aria-live="polite">The cast is taking its marks…</p><nav aria-label="Curtain call controls"><button type="button" class="e-link" id="e-hint">Study the outline</button><button type="button" class="e-link e-bow" id="e-bow" hidden>Bow again ↻</button><button type="button" class="e-link" id="e-home" hidden>Restart the show ↗</button></nav></div>';
  // Remove only the warm paper tint at display time. A chroma mask retains
  // the original red curtain pixels; source files are never repainted.
  window.OpeningPrint?.apply(content);
  const stage=content.querySelector('.e-ensemble'),shadow=content.querySelector('.e-composite-shadow'),message=content.querySelector('.e-message'),bow=content.querySelector('#e-bow'),help=content.querySelector('#e-hint'),restart=content.querySelector('#e-home');
  shadow.setAttribute('aria-label','One group shadow: a tilted top hat, the tin, the rabbit usher and the singer.');
  stage.insertAdjacentHTML('beforeend','<canvas class="e-paper-burst left" width="528" height="580" aria-hidden="true"></canvas><canvas class="e-paper-burst right" width="528" height="580" aria-hidden="true"></canvas>');
  const bursts=[...stage.querySelectorAll('.e-paper-burst')];
  const endTitle = window.OpeningEndTitle.markup();
  content.insertAdjacentHTML('beforeend','<div class="e-iris" aria-hidden="true" hidden></div><section class="e-end-card" aria-label="The End" hidden>'+endTitle+'<nav aria-label="Replay options"></nav></section>');
  const iris=content.querySelector('.e-iris'),card=content.querySelector('.e-end-card'),cardNav=card.querySelector('nav');
  const cameo=document.createElement('div'),farewell=document.createElement('canvas');
  cameo.className='e-postscript';cameo.hidden=true;cameo.setAttribute('role','img');
  cameo.setAttribute('aria-label','The rabbit usher waves and blows you a kiss.');
  cameo.style.backgroundImage='url("'+asset('theatre-v40/stage-deep-red.webp')+'")';
  farewell.width=farewell.height=440;cameo.append(farewell);card.insertBefore(cameo,cardNav);
  const lastStroke=Math.max(0,...Array.from(card.querySelectorAll('.e-scribe'),path=>
    parseFloat(path.style.getPropertyValue('--write-time'))+parseFloat(path.style.getPropertyValue('--write-delay'))));
  cardNav.append(bow,restart);bow.textContent='Replay the bow';restart.textContent='Restart the show';
  const marks=[.18,.395,.605,.82], initialOrder=['rabbit','duck-right','duck-left','can'];
  // Positions are foot marks in figure heights, measured across the tightly grouped cast.
  // Depth and inclination are shared by the curtain silhouette and the live bow.
  const group={
   'duck-left': {x:-.54,rise:.038, turn:7},
   can:         {x:-.17,rise:0,    turn:-4},
   rabbit:      {x:.095,rise:.036, turn:1, depth:.95},
   'duck-right':{x:.48, rise:.024, turn:-9}
  };
  const walkers={
   'duck-left':{src:'cast-v28/left-walk.webp',height:403,mid:214,feet:[419,416,421,421,422,409,422,422],faces:-1},
   'duck-right':{src:'cast-v28/right-walk.webp',height:393,mid:219,feet:[411,405,410,409,403,405,405,405],faces:-1},
   rabbit:{src:'rabbit-v08/walk.png',height:459,mid:177,feet:[476,478,483,475,469,471,474,471],faces:1}
  };
  const actors=[...content.querySelectorAll('[data-actor]')],images={},specs={},positions={},travel={};
  const signal=env.getSignal?.()||env.signal, canSource=asset('theatre-v45/can.png'), can=window.OpeningCanRenderer?.get(canSource);
  const canBows=new Map();
  can?.ready.catch(()=>{});
  let order=initialOrder.slice(),selected=null,drag=null,state='loading',hintLevel=0,disposed=false,raf=0,lastTick=0,elapsed=0,bowFrame=0;
  let motion=null,assetsReady=false,celebrated=false,spoken=false,ovation=false,roomPaused=false,waiting=false,burstFrame=-1,missedMark=false;
  let arrival=env.arrival,travelLayer=null,travelActor=null,swipeCue=null,idleAge=0,cameoDone=false;
  let pan=0,finger=null,settle=null;
  if(arrival){
   travelLayer=document.createElement('button');travelLayer.type='button';travelLayer.className='e-travel';travelLayer.disabled=true;
   travelLayer.setAttribute('aria-label','Hold and drag left to reveal the company, or press Enter.');
   swipeCue=new Image();swipeCue.className='e-swipe-cue';swipeCue.alt='';swipeCue.draggable=false;
   swipeCue.src=asset('ui-v42/hold-move-left.png');swipeCue.hidden=true;
   travelActor=document.createElement('canvas');travelActor.className='e-traveller';
   travelActor.setAttribute('aria-hidden','true');
   travelActor.width=travelActor.height=640;
   const held=arrival.lastFrame;
   held.className='e-old-boards';
   Object.assign(held.style,{left:arrival.left+'px',top:arrival.top+'px',width:arrival.width+'px',height:arrival.height+'px'});
   travelLayer.append(held,travelActor,swipeCue);content.append(travelLayer);
  }
  const alive=()=>!disposed&&stage.isConnected;
  const ease=p=>p*p*(3-2*p);
  const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
  function tell(text){if(message.textContent!==text)message.textContent=text;}
  function setState(next){
   state=next;stage.dataset.state=next;
   content.dataset.ending=next;
   card.hidden=next!=='finished';iris.hidden=next!=='closing';
   help.disabled=next!=='arranging';help.hidden=next!=='arranging'&&next!=='loading';
   bow.hidden=next!=='finished';bow.disabled=bow.hidden;
   restart.hidden=next!=='finished';
   actors.forEach(el=>{
    el.disabled=next!=='arranging'&&next!=='crossing';
    el.setAttribute('aria-disabled',String(next!=='arranging'));
   });
  }
  function bind(el,event,fn,options){listen(el,event,e=>{if(alive()&&!env.isModal?.())fn(e);},options);}
  function dispose(){
   if(disposed)return;disposed=true;cancelAnimationFrame(raf);drag=null;motion=null;
   for(const im of Object.values(images)){im.onload=null;im.onerror=null;}
   signal?.removeEventListener?.('abort',dispose);
  }
  signal?.addEventListener?.('abort',dispose,{once:true});
  function drawCell(ctx,image,n,anchor,scale){
   const cw=image.naturalWidth/4,ch=image.naturalHeight/2;
   ctx.drawImage(image,n%4*cw,Math.floor(n/4)*ch,cw,ch,-anchor[0]*scale,-anchor[1]*scale,cw*scale,ch*scale);
  }
  function bowingCan(frame){
   if(canBows.has(frame))return canBows.get(frame);
   const crop=can?.crop||{x:87,y:80,w:776,h:1481};
   const angle=[0,6,19,40,48,25,9,0][frame]*Math.PI/180,ratio=crop.w/crop.h;
   const cap=.20,heel=.065,view=Math.asin(cap/ratio);
   // The lid turns towards the audience as the wall recedes. Both are sampled
   // from the original print; the rim stays planted on the same floor mark.
   const lid=ratio*Math.sin(view+angle),body=(1-cap-heel)*Math.cos(view+angle)/Math.cos(view);
   const base=heel*(1-.55*Math.sin(angle)),unit=900;
   const cel=document.createElement('canvas');cel.width=Math.round(unit*ratio);cel.height=Math.round(unit*(lid+body+base));
   const ctx=cel.getContext('2d'),source=[0,cap,1-heel,1],target=[0,lid,lid+body,lid+body+base].map(v=>Math.round(v*unit));
   for(let i=0;i<3;i++){
    const sy=Math.round(source[i]*crop.h),sh=Math.round(source[i+1]*crop.h)-sy;
    ctx.drawImage(images.can,crop.x,crop.y+sy,crop.w,sh,0,target[i],cel.width,target[i+1]-target[i]);
   }
   const out={cel,height:cel.height/unit};canBows.set(frame,out);return out;
  }
  // Foot contacts are measured from the opaque pixels in each cel. The can
  // rolls on its rim, using the original capsule label and the game's rolling phases.
  function paintActor(ctx,id,frame,cx,feet,height,gait,closeness=0){
   const pose=group[id];
   ctx.save();ctx.translate(cx,feet-height*pose.rise*closeness);
   if(closeness)ctx.rotate(pose.turn*Math.PI/180*closeness);
   if(pose.depth)height*=1+(pose.depth-1)*closeness;
   if(id==='can'){
    const h=height*.78,r=gait?gait.lean:0;
    const raw=images.can,animated=gait?can?.frame(gait.spin):null;
    const crop=can?.crop||{x:87,y:80,w:776,h:1481};
    const w=h*crop.w/crop.h;
    if(!gait&&frame>0&&frame<7){
     const bowed=bowingCan(frame);ctx.drawImage(bowed.cel,-w/2,-h*bowed.height,w,h*bowed.height);ctx.restore();return;
    }
    const extent=(Math.abs(Math.sin(r))*w+Math.abs(Math.cos(r))*h)/2;
    ctx.translate(0,-extent);ctx.rotate(r);
    if(animated)ctx.drawImage(animated,-w/2,-h/2,w,h);
    else ctx.drawImage(raw,crop.x,crop.y,crop.w,crop.h,-w/2,-h/2,w,h);
   }else if(gait){
    const step=walkers[id],n=gait.frame;
    if(gait.direction!==step.faces)ctx.scale(-1,1);
    drawCell(ctx,images[id+'-step'],n,[step.mid,step.feet[n]],height*specs[id].height/step.height);
   }else{
    const spec=specs[id],frameData=spec.frames[frame],b=spec.frames[0].bounds;
    if(id==='duck-left')ctx.scale(-1,1);
    drawCell(ctx,images[id],frame,frameData.anchor,height*spec.height/(b[3]-b[1]));
   }
   ctx.restore();
  }
  function drawShadow(){
   // Flatten exactly the opaque cels of the final pose before applying one ink.
   const ctx=shadow.getContext('2d'),height=shadow.height*.91;
   ctx.clearRect(0,0,shadow.width,shadow.height);
   for(const id of target)paintActor(ctx,id,0,shadow.width/2+height*group[id].x,shadow.height*.986,height,null,1);
   ctx.globalCompositeOperation='source-in';ctx.fillStyle='#160f13';ctx.fillRect(0,0,shadow.width,shadow.height);ctx.globalCompositeOperation='source-over';
   const data=ctx.getImageData(0,0,shadow.width,shadow.height);
   let left=shadow.width,right=0,top=shadow.height,bottom=0;
   for(let y=0;y<shadow.height;y++)for(let x=0;x<shadow.width;x++)if(data.data[(y*shadow.width+x)*4+3]>12){
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
   }
   // The element's bottom is the back edge of the boards. Remove the transparent
   // margin so this position belongs to the painted foot, not the canvas padding.
   shadow.width=right-left+3;shadow.height=bottom-top+2;ctx.putImageData(data,1-left,1-top);
  }
  function geometry(){
   const rect=stage.getBoundingClientRect(),height=Math.min(rect.height*.37,rect.width*.315);
   const bowHeight=rect.width<600&&rect.height>rect.width?Math.min(rect.height*.37,rect.width*.49):height;
   return {rect,height,bowHeight,joined:target.map(id=>.5+group[id].x*bowHeight/rect.width)};
  }
  function render(){
   if(!alive()||!assetsReady)return;
   const g=geometry(),dpr=Math.min(window.devicePixelRatio||1,2);
   if(!g.rect.width||!g.height)return;
   const grouped=['bowing','closing','finished','gathering'].includes(state);
   const progress=state==='gathering'&&motion?motion.time/motion.duration:Number(grouped);
   const closeness=ease(clamp((progress-.53)/.45,0,1));
   const height=g.height+(g.bowHeight-g.height)*ease(progress);
   for(const el of actors){
    const id=el.dataset.actor,slot=order.indexOf(id),gait=travel[id],at=positions[id]??marks[slot];
    // Match the button to the figure, allowing the wing tips and the tilted can
    // to extend to the very edge of the drawing without clipping their ink.
    const w=Math.ceil(height*(grouped?1.15:id==='can'?.9:id==='rabbit'?1:.85)),h=Math.ceil(height*(grouped?1.15:1.06))+8;
    el.style.left=at*100+'%';el.style.width=w+'px';el.style.height=h+'px';
    el.classList.toggle('is-selected',id===selected);el.setAttribute('aria-pressed',String(id===selected));
    el.setAttribute('aria-label',names[id]+', position '+(slot+1)+'. Select two actors to swap them, or use the arrow keys.');
    el.dataset.frame=String(bowFrame);el.dataset.motion=gait?(id==='can'?'roll':'walk'):(state==='bowing'?'bow':'stand');el.dataset.step=gait?String(gait.frame):'';
    const canvas=el.querySelector('canvas'),pw=Math.ceil(w*dpr),ph=Math.ceil(h*dpr);
    if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
    paintActor(ctx,id,bowFrame,w/2,h-3,height,gait,closeness);
   }
   stage.dataset.order=order.join(',');stage.dataset.frame=String(bowFrame);
  }
  function beginMotion(to,duration){
   const from={...positions};
   motion={from,to,time:0,duration:reduced?100:duration};
   lastTick=performance.now();
   if(!raf)raf=requestAnimationFrame(tick);
  }
  function advanceMotion(dt){
   const m=motion;m.time=Math.min(m.duration,m.time+dt);
   const progress=m.time/m.duration,p=ease(progress),g=geometry();
   for(const id of order){
    const distance=m.to[id]-m.from[id];positions[id]=m.from[id]+distance*p;
    if(!reduced&&Math.abs(distance)>.003&&progress<.98){
     const dir=Math.sign(distance),pixels=distance*g.rect.width;
     const stride=Math.max(1,Math.ceil(Math.abs(pixels)/(g.height*.43)));
     const turns=Math.max(1,Math.round(Math.abs(pixels)/(g.height*.78)));
     travel[id]={direction:dir,frame:Math.floor(p*stride*8)%8,spin:dir*(Math.PI*2*turns*p),lean:dir*Math.min(1,Math.sin(progress*Math.PI)*2)*.98};
    }else delete travel[id];
   }
   if(progress>=1){motion=null;for(const id of order)delete travel[id];}
  }
  function targets(centers){return Object.fromEntries(order.map((id,slot)=>[id,centers[slot]]));}
  function isCorrect(){return order.every((id,i)=>id===target[i]);}
  function clearDrag(){if(drag)drag.el.classList.remove('is-dragging');drag=null;}
  function drawPaper(elapsed){
   // Hold each ink drawing for a tenth of a second.
   const cel=Math.min(42,Math.floor(elapsed/100));
   if(cel===burstFrame)return;
   burstFrame=cel;
   bursts.forEach((canvas,side)=>{
    const ctx=canvas.getContext('2d');
    ctx.setTransform(2,0,0,2,0,0);ctx.clearRect(0,0,264,290);
    const beat=cel/10-(side?.20:0);
    if(beat<0||beat>(reduced?1.5:3.8))return;
    const age=reduced?1.25:beat;
    if(side)ctx.transform(-1,0,0,1,264,0);
    ctx.lineJoin='round';ctx.lineCap='round';
    for(let n=0;n<18;n++){
     const t=age-(n%4)*.08;if(t<0)continue;
     const seed=n+(side?3:0),ribbon=n%5===0;
     const vx=-17+(seed*47)%177,vy=133+(seed*37)%132;
     const x=58+vx*t+Math.sin(t*3+seed)*t*5,y=244-vy*t+72*t*t;
     if(y>292||x< -16||x>280)continue;
     ctx.save();ctx.translate(x,y);ctx.rotate(seed*.8+t*(seed%2?.95:-1.45));
     ctx.strokeStyle='#26181d';ctx.fillStyle=seed%4===1?'#e68a8a':'#fff5e6';
     ctx.lineWidth=ribbon?2.5:1.8;
     if(ribbon){
      ctx.beginPath();ctx.moveTo(-13,-24);ctx.bezierCurveTo(13,-26,23,-12,7,-4);
      ctx.bezierCurveTo(-10,4,-10,11,7,13);ctx.quadraticCurveTo(17,14,14,23);
      ctx.quadraticCurveTo(8,18,1,19);ctx.bezierCurveTo(-20,17,-22,2,-3,-7);
      ctx.bezierCurveTo(11,-14,5,-18,-11,-17);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(7,-4);ctx.quadraticCurveTo(13,-9,13,-13);ctx.moveTo(1,19);ctx.quadraticCurveTo(-8,15,-9,11);ctx.lineWidth=1.5;ctx.stroke();
     }else{
      const length=5+(seed*7)%10;
      ctx.beginPath();ctx.moveTo(-4,-length);ctx.lineTo(6,-length+3);
      ctx.lineTo(3,length);ctx.lineTo(-5,length-2);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(-5,length-2);ctx.lineTo(3,length);ctx.lineTo(4,1);
      ctx.closePath();ctx.fillStyle='#48252a';ctx.fill();
     }
     ctx.restore();
    }
   });
  }
  function beginBow(){
   const music=window.OPENING_BASE?.music;
   if(celebrated)music?.scene('encore');
   music?.prepareEndCard();
   spoken=false;ovation=false;roomPaused=false;waiting=false;burstFrame=-1;elapsed=0;bowFrame=0;
   setState('bowing');render();
  }
  function perform(){
   clearDrag();selected=null;stage.classList.remove('is-mismatch','is-studying');
   bowFrame=0;tell('Close ranks. Take a bow!');
   if(celebrated){
    stage.classList.remove('is-finished');beginBow();lastTick=performance.now();
    if(!raf)raf=requestAnimationFrame(tick);
    return;
   }
   setState('gathering');
   beginMotion(targets(geometry().joined),660);
  }
  function swap(id,slot){
   if(state!=='arranging'||slot<0||slot>=order.length)return;
   const from=order.indexOf(id);
   if(from===slot){selected=null;beginMotion(targets(marks),180);return;}
   [order[from],order[slot]]=[order[slot],order[from]];selected=null;missedMark=target[slot]!==id;stage.classList.remove('is-mismatch','is-studying');
   setState('crossing');tell('');render();beginMotion(targets(marks),475);
  }
  function select(id){
   if(state!=='arranging')return;
   if(selected&&selected!==id)swap(selected,order.indexOf(id));
   else{selected=selected===id?null:id;tell(selected?'Choose another actor to swap places.':'Match the cast to the silhouette.');render();}
  }
  const nearest=x=>marks.reduce((best,v,i)=>Math.abs(v-x)<Math.abs(marks[best]-x)?i:best,0);
  for(const el of actors){
   bind(el,'pointerdown',e=>{
    if(state!=='arranging'||drag||e.button!==0||e.isPrimary===false)return;
    if(motion){motion=null;positionsReset();render();}
    e.preventDefault();el.focus({preventScroll:true});
    drag={id:el.dataset.actor,el,pointer:e.pointerId,x:e.clientX,y:e.clientY,moved:false,at:positions[el.dataset.actor]};
    el.setPointerCapture(e.pointerId);
   });
   bind(el,'pointermove',e=>{
    if(drag?.el!==el||drag.pointer!==e.pointerId)return;
    const g=geometry(),dx=e.clientX-drag.x;
    if(Math.abs(dx)>6)drag.moved=true;
    if(!drag.moved)return;
    el.classList.add('is-dragging');const id=drag.id,at=clamp(drag.at+dx/g.rect.width,marks[0]-.04,marks[3]+.04);
    const direction=Math.sign(at-positions[id])||travel[id]?.direction||1;
    positions[id]=at;const pixels=(at-drag.at)*g.rect.width;
    if(!reduced)travel[id]={direction,frame:Math.floor(Math.abs(pixels)/(g.height*.048))%8,spin:pixels/(g.height*.15),lean:direction*.98*Math.min(1,Math.abs(pixels)/(g.height*.22))};
    render();
   });
   bind(el,'pointerup',e=>{
    if(drag?.el!==el||drag.pointer!==e.pointerId)return;
    const d=drag;clearDrag();if(!d.moved){select(d.id);return;}
    const r=stage.getBoundingClientRect(),x=d.at+(e.clientX-d.x)/r.width;
    if(x<0||x>1||e.clientY<r.top||e.clientY>r.bottom)beginMotion(targets(marks),240);
    else swap(d.id,nearest(x));
   });
   const cancel=e=>{if(drag?.el===el&&drag.pointer===e.pointerId){clearDrag();beginMotion(targets(marks),200);}};
   bind(el,'pointercancel',cancel);bind(el,'lostpointercapture',cancel);
   bind(el,'click',e=>{if(e.detail===0&&!e.pointerType)select(el.dataset.actor);});
   bind(el,'keydown',e=>{
    if(state!=='arranging'||drag)return;
    if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();swap(el.dataset.actor,order.indexOf(el.dataset.actor)+(e.key==='ArrowRight'?1:-1));}
    if(e.key==='Escape'){selected=null;render();}
   });
  }
  bind(help,'click',()=>{
   if(state!=='arranging')return;
   stage.classList.add('is-studying');hintLevel=Math.min(3,hintLevel+1);
   tell(['Look at the far left and right edges of the silhouette.','Follow the hat brim toward the can lid.','The usher stands between the tin and the singer.'][hintLevel-1]);
  });
  bind(restart,'click',()=>{dispose();home();});
  bind(bow,'click',()=>{if(state==='finished')perform();});
  for(const event of ['pointerdown','pointermove','keydown','wheel','focusin']){
   bind(document,event,()=>{if(state==='finished')idleAge=0;},{passive:true});
  }
  function drawArrival(){
   const {rect,height}=geometry(),backdrop=stage.querySelector('img.e-backdrop');
   const w=rect.width,h=rect.height;
   if(!w||!h)return;
   const mark=actors[0].offsetTop+actors[0].offsetHeight-3;
   const spread=1-pan,close=clamp(h*.60/height,1.45,2.45);
   const zoom=1+(close-1)*spread;
   const stageWidth=Math.max(w,h*backdrop.naturalWidth/backdrop.naturalHeight);
   const stageHeight=stageWidth*backdrop.naturalHeight/backdrop.naturalWidth;
   // Pan over the continuous curtain print. Its real painted edges bound the camera.
   const soloShift=Math.min((.5-marks[0]*close)*w,(stageWidth-w)*close/2);
   const shift=soloShift*spread;
   const rise=mark*(1-zoom)+h*.055*spread;
   // The hanging cloth is behind the footlights: it moves less than the foreground.
   const clothZoom=1+.14*spread;
   const clothShift=Math.min(w*.10,(stageWidth*clothZoom-w)/2)*spread;
   for(const layer of stage.querySelectorAll('.e-backdrop')){
    Object.assign(layer.style,{width:stageWidth+'px',height:stageHeight+'px',left:(w-stageWidth)/2+'px',top:(h-stageHeight)/2+'px',
      transform:'translate('+(clothShift-stageWidth*(clothZoom-1)/2)+'px,'+(-stageHeight*(clothZoom-1)*.72)+'px) scale('+clothZoom+')'});
   }
   const company=stage.querySelector('.e-company');
   // The rest of the company is waiting in the wing at the start of the shot.
   const wing=Math.max(0,w+height*close*.57-(w*marks[1]*close+soloShift));
   company.style.transform='translate('+(shift+wing*spread)+'px,'+rise+'px) scale('+zoom+')';
   const fX=.5*w+(marks[0]-.5)*w*pan,fY=mark*zoom+rise,size=height*zoom;
   const draw=travelActor.getContext('2d');
   draw.setTransform(1,0,0,1,0,0);draw.clearRect(0,0,640,640);
   Object.assign(travelActor.style,{width:size*1.18+'px',height:size*1.18+'px',left:(rect.left+fX)+'px',top:(rect.top+fY)+'px'});
   draw.scale(640/1.18,640/1.18);draw.translate(.59,1.18);
   if(stage.dataset.arrival==='smile'){
    draw.drawImage(images.composure,-.6,-1.08,1.2,1.2);
   }else{
    paintActor(draw,'rabbit',0,0,0,1,null);
   }
   swipeCue.style.opacity=String(clamp(1-pan*5,0,1));
  }
  function finishPan(){
   travelLayer.remove();arrival=null;settle=null;
   for(const el of stage.querySelectorAll('.e-backdrop,.e-company')){
    for(const prop of ['width','height','left','top','transform'])el.style.removeProperty(prop);
   }
   delete stage.dataset.arrival;startArranging();
   actors[0].focus({preventScroll:true});
  }
  function settlePan(commit){
   finger=null;
   travelLayer.classList.remove('is-dragging');
   settle={from:pan,to:commit?1:0,time:0,duration:reduced?1:Math.max(140,Math.abs((commit?1:0)-pan)*430)};
   lastTick=performance.now();
   if(!raf)raf=requestAnimationFrame(tick);
  }
  if(arrival){
   bind(travelLayer,'pointerdown',e=>{
    if(travelLayer.disabled||settle||finger||!e.isPrimary||e.button!==0)return;
    e.preventDefault();travelLayer.setPointerCapture(e.pointerId);
    finger={id:e.pointerId,x:e.clientX,width:stage.clientWidth};travelLayer.classList.add('is-dragging');
   });
   bind(travelLayer,'pointermove',e=>{
    if(!finger||e.pointerId!==finger.id)return;
    pan=clamp((finger.x-e.clientX)/finger.width,0,1);drawArrival();
   });
   bind(travelLayer,'pointerup',e=>{if(finger?.id===e.pointerId)settlePan(pan>=.22);});
   function cancelPan(){if(finger)settlePan(false);}
   listen(travelLayer,'pointercancel',cancelPan);listen(travelLayer,'lostpointercapture',cancelPan);
   listen(window,'blur',cancelPan);
   bind(travelLayer,'keydown',e=>{
    if(!settle&&!e.repeat&&['ArrowLeft','Enter',' '].includes(e.key)){e.preventDefault();settlePan(true);}
   });
   bind(travelLayer,'click',e=>{if(!settle&&e.detail===0)settlePan(true);});
  }
  function postscript(time){
   const ctx=farewell.getContext('2d'),total=4060;
   if(time<0)return;
   if(time>=total){
    if(!cameoDone){cameoDone=true;cameo.hidden=true;card.dataset.postscript='closed';cue('slate');}
    return;
   }
   const radius=ease(clamp(time/500,0,1))*ease(clamp((total-time)/600,0,1));
   cameo.hidden=false;cameo.style.clipPath='circle('+radius*50+'%)';
   const kiss=time>=1900&&time<2700,high=time<1850&&(reduced||Math.floor(time/260)%2===0);
   card.dataset.postscript=kiss?'kiss':time>=2700?'send':'wave';
   const pose=images[kiss?'kiss':high?'waveHigh':'waveLow'];
   ctx.clearRect(0,0,440,440);ctx.drawImage(pose,-57,8,550,550);
   if(time>=2620&&time<3500){
    const f=(time-2620)/880;
    ctx.save();ctx.translate(271+85*f,237-73*f);ctx.rotate(-.22+.2*f);
    const scale=.45+.65*f;ctx.scale(scale,scale);ctx.globalAlpha=Math.min(1,(1-f)*5);
    ctx.fillStyle='#edcbbb';ctx.strokeStyle='#261619';ctx.lineWidth=3;ctx.beginPath();
    ctx.moveTo(0,14);ctx.bezierCurveTo(-29,-1,-18,-25,-2,-12);ctx.bezierCurveTo(12,-33,33,-13,0,14);
    ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
   }
  }
  function finish(){
   elapsed=0;idleAge=0;cameoDone=false;cameo.hidden=true;card.dataset.postscript='waiting';
   bowFrame=0;setState('finished');stage.classList.add('is-finished');render();tell('Curtain.');
   window.OPENING_BASE?.music?.endCard();
   if(!celebrated){celebrated=true;saved.encore=true;save();}
   if(!document.hidden)bow.focus({preventScroll:true});
  }
  function closeIris(){
   if(!alive()||state!=='bowing')return;
   elapsed=0;iris.style.removeProperty('--iris-radius');setState('closing');
  }
  function paintIris(progress){
   if(reduced){iris.style.opacity=String(progress);return;}
   const bounds=stage.getBoundingClientRect(),radius=Math.hypot(bounds.width*.5,bounds.height*.68);
   iris.style.setProperty('--iris-radius',Math.max(0,radius*(1-ease(progress)))+'px');
  }
  function tick(now){
   raf=0;if(!alive()){dispose();return;}
   const paused=Boolean(document.hidden||env.isModal?.());
   if(ovation&&roomPaused!==paused){roomPaused=paused;window.OpeningSFX?.pauseOvation?.(paused);}
   const dt=paused?0:Math.min(60,Math.max(0,now-lastTick));lastTick=now;
   if(motion){
    advanceMotion(dt);
    if(!motion){
     if(state==='crossing'){
      if(isCorrect()){perform();return;}
      setState('arranging');
      if(missedMark){stage.classList.add('is-mismatch');cue('audienceDisappointed');tell('Take another look at the outline.');}
      else tell('Match the rest of the company to the silhouette.');
     }else if(state==='gathering'){beginBow();}
    }
    render();
   }else if(state==='bowing'){
    elapsed+=dt;
    const times=reduced?[0,600,3800]:[0,410,780,1270,1800,3600,4150,4620],frames=reduced?[0,4,7]:[0,1,2,3,4,5,6,7];
    let frame=0;for(let i=1;i<times.length;i++)if(elapsed>=times[i])frame=frames[i];
    if(frame!==bowFrame){bowFrame=frame;render();}
    if(elapsed>=370&&!spoken){spoken=true;say('The cast was finally in order. Fortunately, the applause didn’t have to be.');}
    if(elapsed>=1140&&!ovation){ovation=true;cue('finalOvation');}
    if(ovation)drawPaper(elapsed-1140);
    if(elapsed>=8050&&!waiting){
     waiting=true;if(env.afterNarration)env.afterNarration(closeIris,true);else closeIris();
    }
   }else if(state==='closing'){
    elapsed+=dt;const duration=reduced?380:1400;
    paintIris(Math.min(1,elapsed/duration));
    if(elapsed>=duration+180)finish();
   }else if(state==='arrival'){
    elapsed+=dt;
    if(stage.dataset.arrival==='smile'&&elapsed>=1100){
     stage.dataset.arrival='ready';swipeCue.hidden=false;travelLayer.disabled=false;
     travelLayer.focus({preventScroll:true});
    }
    if(settle){
     settle.time+=dt;
     pan=settle.from+(settle.to-settle.from)*ease(Math.min(1,settle.time/settle.duration));
     if(settle.time>=settle.duration){
      if(settle.to===1){finishPan();return;}settle=null;
     }
    }
    drawArrival();
   }else if(state==='finished'){
    elapsed+=dt;
    if(cameoDone){idleAge+=dt;if(idleAge>=10000){dispose();home();return;}}
    else postscript(elapsed-(reduced?0:lastStroke)-4500);
   }
   if(motion||state==='arrival'&&(settle||stage.dataset.arrival==='smile')||['bowing','closing','finished'].includes(state))raf=requestAnimationFrame(tick);
  }
  bind(window,'resize',()=>{
   if(drag){clearDrag();positionsReset();}
   if(assetsReady&&['finished','bowing','closing'].includes(state))Object.assign(positions,targets(geometry().joined));
   if(motion&&state==='gathering')motion.to=targets(geometry().joined);
   render();if(state==='arrival')drawArrival();
  });
  bind(window,'blur',()=>{if(drag){clearDrag();beginMotion(targets(marks),200);}});
  function positionsReset(){Object.assign(positions,targets(marks));for(const id of target)delete travel[id];}
  function startArranging(){
   setState('arranging');
   tell('Match the silhouette. Tap two actors or drag one to trade places.');render();
  }
  function loaded(){
   if(!alive()||assetsReady||Object.keys(images).length<11||Object.values(images).some(im=>!im.complete||!im.naturalWidth))return;
   if(arrival&&!stage.querySelector('img.e-backdrop').naturalWidth)return;
   assetsReady=true;positionsReset();drawShadow();
   if(arrival){
    arrival.lastFrame.remove();arrival.lastFrame=null;stage.dataset.arrival='smile';
    setState('arrival');render();elapsed=0;lastTick=performance.now();drawArrival();raf=requestAnimationFrame(tick);
   }
   else startArranging();
  }
  function addImage(id,path){const im=new Image();images[id]=im;im.onload=loaded;im.onerror=()=>{if(alive()){tell('The cast could not load. Reopen the curtain call.');content.querySelector('.e-controls nav').append(restart);restart.hidden=false;}};im.src=path;}
  setState('loading');hint('');
  if(arrival)listen(stage.querySelector('img.e-backdrop'),'load',loaded);
  for(const id of target){
   if(id==='can'){addImage(id,canSource);continue;}
   specs[id]={...defaults[id],...env.ensembleManifest?.[id]};
   addImage(id,asset('ensemble-v34/'+specs[id].file));addImage(id+'-step',asset(walkers[id].src));
  }
  for(const [id,file] of Object.entries({composure:'composure',kiss:'kiss',waveHigh:'wave-high',waveLow:'wave-low'}))addImage(id,asset('chest-v56/'+file+'.webp'));
  loaded();return dispose;
 }};
})();

;
(function (root) {
  'use strict';
  const P = 400, H = 470, R = 26;
  const crocodileTiming=Object.freeze({approach:-300,laugh:1750,end:3200});
  const dragonTiming=Object.freeze({bite:280,inside:780,gulp:1040,end:1630});
  const cargoPauseDuration=.66;
  // The short strip has a compact arm so the same half-turn clears its border.
  const bridgeCradles=[null,{left:98,radius:67,runout:77},{left:95,radius:49,runout:82},{left:125,radius:21,runout:72}];
  const cradleTiming={grip:.18,release:1.24,land:1.96};
  const pieces = {
    start: {name:'Stage entrance',input:350,output:350}, startHigh:{name:'Upper platform',input:230,output:230},
    ramp:{name:'Run-up ramp',input:350,output:230}, bridge:{name:'High bridge',input:230,output:230},
    goal:{name:'Stage mark',input:230,output:230}, goalLow:{name:'Center stage',input:350,output:350},
    pressure:{name:'Counterweight',input:350,output:350}, lift:{name:'Lift',input:350,output:230},
    cage:{name:'Dancer’s cage',input:230,output:230},
    down:{name:'Downhill ramp',input:230,output:350}, lowBridge:{name:'Timber bridge',input:350,output:350},
    counter:{name:'Counterweight pedal',input:350,output:350},
    dragon:{name:'Wooden jaws',input:230,output:230},
    upperPin:{name:'Upper pin',input:230,output:350},
    lowerPin:{name:'Lower pin',input:350,output:350},
    reel:{name:'Ratchet winch',input:350,output:350,turnable:true},
    brace:{name:'Bridge wedge',input:230,output:230},
    pawl:{name:'Jaw ratchet',input:350,output:350,turnable:true},
    cue:{name:'Cue bell',input:230,output:230},
    catch:{name:'Safety catch',input:350,output:350},
    brake:{name:'Cart brake',input:350,output:350,turnable:true},
    counterCargo:{name:'Chest hoist',input:350,output:350},
    load:{name:'Loading platform',input:350,output:350},
    cargoBridge:{name:'Freight bridge',input:350,output:350},
    bridgeLock:{name:'Bridge cradle',input:230,output:230},
    ropeBridge:{name:'Suspension bridge',input:230,output:230},
    ropeSlope:{name:'Rope-bound ramp',input:230,output:350},
    cageExit:{name:'Cage landing',input:350,output:350}
  };
  const levels = [
    {chapter:'I',title:'A Very Small Leap',en:'A VERY SMALL LEAP',intro:'Set the ramp before the bridge. Our hero will take it from there.',start:'start',end:'goal',initial:['bridge','ramp'],solution:['ramp','bridge'],after:'One bridge down. A few hands clap.',next:'Follow the tapping →'},
    {chapter:'II',title:'A Dancer in Distress',en:'A DANCER IN DISTRESS',intro:'Lock the bridge, roll down the ramp and open the dancer’s cage.',clue:'Roll into the cradle to lock the bridge, then cross and roll down to the cage.',start:'startHigh',end:'cageExit',initial:['ropeBridge','ropeSlope','bridgeLock'],solution:['bridgeLock','ropeBridge','ropeSlope'],after:'The dancer steps out. First a bow, then a thank-you.',next:'Leave the castle →',rescue:1},
    {chapter:'III',title:'An Unexpected Encore',en:'AN UNEXPECTED ENCORE',intro:'The dancer can steady the bridge. A missing plank is another matter.',clue:'Set the wedge on the upper platform before rolling downhill. Jump the gap in the bridge.',start:'startHigh',end:'goalLow',initial:['lowBridge','down','brace'],solution:['brace','down','lowBridge'],after:'This time the dancer lends a wing.',next:'Follow the song →'},
    {chapter:'IV',title:'Enter the Wooden Dragon',en:'ENTER THE WOODEN DRAGON',intro:'The dancer can open the dragon’s jaws. What will hold them open when the dancer steps off?',clue:'The pedal opens the jaws. Turn the ratchet clockwise to hold the rope, then roll up the ramp.',start:'start',end:'goal',initial:['dragon','pawl','ramp','counter'],solution:['counter','pawl','ramp','dragon'],solutionModes:{pawl:true},after:'A fearsome dragon, right down to its wooden hinges.',next:'Inside the dragon →'},
    {chapter:'V',title:'The Note That Would Not End',en:'THE NOTE THAT WOULD NOT END',intro:'Someone is still singing inside the set. Give the singer a cue before you pull it apart.',clue:'Ring the bell, release the upper pin, then set the safety catch before reaching the lower pin.',start:'startHigh',end:'goalLow',initial:['catch','upperPin','lowerPin','cue'],solution:['cue','upperPin','catch','lowerPin'],after:'Both ducks are back. Take a bow.',next:'Collect the reward →',rescue:2},
    {chapter:'VI',title:'Handle with Unnecessary Care',en:'HANDLE WITH UNNECESSARY CARE',intro:'The chest shifts on its cart. Better secure it before the bridge.',clue:'Lower the chest, load the cart and turn the brake clockwise before crossing.',start:'start',end:'goalLow',initial:['brake','cargoBridge','counterCargo','load'],solution:['counterCargo','load','brake','cargoBridge'],solutionModes:{brake:true},after:'The chest arrives. Something inside clears its throat.',next:'Open the chest →',cargo:true}
  ];
  function create(index, order, modes={}) {
    const level=levels[index], route=[level.start].concat(order || level.initial,level.end);
    const goal={slot:route.length-1,type:level.end,localX:220,x:(route.length-1)*P+220};
    return {index,level,route,goal,width:route.length*P,actor:{x:65,y:pieces[level.start].input-R,vx:0,vy:0,angle:0,grounded:true},crocodileMs:null,dragonBiteMs:null,cargoPause:0,flags:{},modes:{...modes},visits:{},lastPiece:-1,event:0,done:false,failed:false,message:'',issue:null,elapsed:0};
  }
  function surface(w,x) {
    const n=Math.max(0,Math.min(w.route.length-1,Math.floor(x/P))),t=x-n*P,type=w.route[n],f=w.flags;
    if(type==='ramp')return 350-120*Math.max(0,Math.min(1,(t-45)/310));
    if(type==='down'||type==='upperPin')return 230+120*Math.max(0,Math.min(1,(t-90)/240));
    if(type==='ropeSlope')return 230+120*Math.max(0,Math.min(1,(t-70)/260));
    if(type==='lift')return f.latched?350-120*Math.max(0,Math.min(1,(t-70)/250)):350;
    if(type==='bridge'&&t>165&&t<240)return null;
    if(type==='lowBridge'&&((t>140&&t<250&&!f.bridge)||(t>260&&t<325)))return null;
    if(type==='cargoBridge'&&t>130&&t<270&&!f.bridge)return null;
    return pieces[type].input;
  }
  function fail(w,message,related=[]){w.failed=true;w.message=message;w.issue={text:message,pieces:related};return w;}
  const objectives=[
    'Get across the gap and land on the white tape at the bottom right.',
    'Lock the bridge, roll down the ramp and open the cage at the bottom right.',
    'Steady the timber bridge and cross it with the dancer.',
    'Hold the dragon’s jaws open long enough to roll through.',
    'Warn the singer before taking the wooden dragon apart.',
    'Secure the chest on its cart and bring it back to the theatre.'
  ];
  const observations=[
    'Look at the two ends of the ramp. Which one meets the bridge?',
    'The hanging planks sway. Which prop could hold them still?',
    'A plank is missing, and the whole bridge wobbles. Which prop could steady it?',
    'The dancer can open the jaws. What could hold the rope when the dancer steps off?',
    'The singer is still inside. What cue would tell the singer to move?',
    'The chest needs to come down before it can ride the cart. What will keep it there?'
  ];
  const relationships=[
    {before:'ramp',after:'bridge',text:'The high end of the ramp meets the high bridge.'},
    {before:'bridgeLock',after:'ropeBridge',text:'The cradle locks the hanging bridge as it turns.'},
    {before:'brace',after:'down',text:'Set the wedge on the upper platform before going downhill.'},
    {before:'counter',after:'pawl',text:'The pedal lifts the jaws. The ratchet takes the strain.'},
    {before:'cue',after:'upperPin',text:'Ring the bell before releasing the upper pin.'},
    {before:'load',after:'brake',text:'Load the chest before engaging the cart brake.'}
  ];
  // A requested hint reveals one next action, never rewrites the player's route.
  function guidance(w,tier=1){
    const level=w.level,order=w.route.slice(1,-1),relation=relationships[w.index];
    if(tier<=1)return {text:observations[w.index],pieces:[]};
    if(tier===2)return w.issue||{text:relation.text,pieces:[relation.before,relation.after]};
    const mismatch=order.findIndex((type,i)=>type!==level.solution[i]);
    if(mismatch>=0){const type=level.solution[mismatch],before=mismatch?level.solution[mismatch-1]:level.start;return {text:'Place “'+pieces[type].name+'” just after “'+pieces[before].name+'”, then try that stretch.',pieces:[type,before]};}
    const mechanism=Object.keys(level.solutionModes||{}).find(type=>!w.modes[type]);
    if(mechanism)return {text:'Inspect “'+pieces[mechanism].name+'” and turn the crank clockwise until the catch engages.',pieces:[mechanism]};
    return actionHint(w);
  }
  function actionHint(w){
    const current=Math.max(0,Math.min(w.route.length-1,Math.floor(w.actor.x/P))),type=w.route[current],f=w.flags;
    if(w.issue)return w.issue;
    if(type==='bridge'||type==='lowBridge')return {text:'Press Space or tap Jump just before the missing plank.',pieces:[type]};
    const next=[
      ['bridge','Watch for the gap in the middle of the bridge.'],
      !f.bridgeLocked?['bridgeLock','Roll into the cradle from the left.']:!f.crossedSuspension?['ropeBridge','The bridge is locked. Roll across the planks.']:['cageExit','Roll down the ramp, out of the panel and up to the cage door.'],
      !f.wedge?['brace','Roll over the wedge to brace the bridge.']:['lowBridge','The bridge is steady. Jump the missing plank.'],
      !f.jaw?['counter','Let the dancer step on the pedal to lift the jaws.']:!f.jawLocked?['pawl','Roll past the ratchet so it catches the rope.']:['dragon','The jaws are held open. Roll up the ramp and through.'],
      !f.cued?['cue','Ring the cue bell to warn the singer.']:!f.pin?['upperPin','The singer is ready. Roll past the upper pin.']:!f.safe?['catch','Set the safety catch on the lower deck before reaching the exit.']:['lowerPin','The set is secure. Meet the singer at the lower exit.'],
      !f.crate?['counterCargo','Press the hoist pedal to lower the chest.']:!f.carry?['load','Pick up the chest at the loading platform.']:!f.secured?['brake','Pass the cart brake to secure the chest.']:['goalLow','The chest is secure. Take it across the long bridge.']
    ][w.index];
    if(current===w.goal.slot)return {text:w.level.rescue?'Roll up to the duck to finish the rescue.':w.level.cargo?'Wheel the chest into the light.':'Roll onto the white tape mark.',pieces:[w.goal.type]};
    return {text:next[1],pieces:[next[0]]};
  }
  // Fit the complete important silhouette; the caller applies one uniform scale.
  function viewBounds(w,slot){
    const type=w.route[slot],p=pieces[type],floor=Math.max(p.input,p.output);
    const tops={start:40,startHigh:40,cage:0,lift:95,dragon:35,load:0,pressure:65,counter:65,counterCargo:65};
    let top=tops[type]===undefined?Math.min(p.input,p.output)-210:tops[type];
    let bottom=type==='dragon'?465:type==='lift'?435:floor+52;
    // Reserve the normal jump arc up front; jumping must not zoom the whole drawing.
    top=Math.min(top,Math.min(p.input,p.output)-215);
    return {left:0,right:P,top:Math.max(-90,top),bottom};
  }
  function goalReady(w){
    const f=w.flags;
    return [true,!!(f.bridgeLocked&&f.crossedSuspension&&f.descendedToCage),!!f.wedge,!!(f.jaw&&f.jawLocked),!!(f.cued&&f.pin&&f.safe),!!(f.carry&&f.secured&&f.bridge)][w.index];
  }
  function carryInCradle(w,dt){
    const ride=w.cradle,arm=bridgeCradles[ride.slot],a=w.actor;
    const t=ride.time=Math.min(cradleTiming.land,ride.time+dt);
    const turn=Math.min(1,Math.max(0,(t-cradleTiming.grip)/(cradleTiming.release-cradleTiming.grip)));
    ride.angle=Math.PI*turn*turn*(3-2*turn);
    const cx=ride.slot*P+arm.left+arm.radius,deckY=pieces.bridgeLock.input-R;
    a.vx=0;a.vy=0;
    if(t<cradleTiming.release){
      a.x=cx-arm.radius*Math.cos(ride.angle);
      a.y=deckY-arm.radius*Math.sin(ride.angle);
      a.grounded=t<=cradleTiming.grip;
    }else{
      w.flags.bridgeLocked=true;w.flags.latched=true;
      const flight=(t-cradleTiming.release)/(cradleTiming.land-cradleTiming.release);
      const lift=arm.radius*.98;
      a.x=cx+arm.radius+arm.runout*flight;
      a.y=deckY-4*lift*flight*(1-flight);
      a.vy=(8*flight-4)*lift/(cradleTiming.land-cradleTiming.release);
      ride.flip=-2*Math.PI*flight*flight*(3-2*flight);
      a.grounded=t===cradleTiming.land;
      if(a.grounded){a.vx=arm.runout/(cradleTiming.land-cradleTiming.release);a.vy=0;w.cradle=null;}
    }
    return w;
  }
  function step(w,dt,input) {
    if(w.done||w.failed)return w;
    w.message='';w.issue=null;
    dt=Math.min(dt,1/30);w.elapsed+=dt;
    if(w.cradle)return carryInCradle(w,dt);
    if(w.crocodileMs!==null){
      w.crocodileMs=Math.min(crocodileTiming.end,w.crocodileMs+dt*1000);
      if(w.crocodileMs===crocodileTiming.end)return fail(w,'The crocodile got the last laugh. Try again and jump just before the gap.',['bridge']);
      return w;
    }
    if(w.dragonBiteMs!==null){
      w.dragonBiteMs=Math.min(dragonTiming.end,w.dragonBiteMs+dt*1000);
      if(w.dragonBiteMs===dragonTiming.end)return fail(w,'One gulp! Let the dancer lift the jaws, then turn the ratchet clockwise to hold them open.',['counter','pawl']);
      return w;
    }
    if(w.cargoPause>0){
      w.cargoPause=Math.max(0,w.cargoPause-dt);
      return w;
    }
    const a=w.actor,prev={x:a.x,y:a.y,g:a.grounded},f=w.flags;
    const limit=f.carry?172:265;
    a.vx+=Math.max(-1,Math.min(1,input.move||0))*1100*dt;
    if(!input.move)a.vx*=Math.pow(.012,dt);
    a.vx=Math.max(-limit,Math.min(limit,a.vx));
    if(input.jump&&a.grounded){a.vy=-470;a.grounded=false;}
    a.x=Math.max(R,Math.min(w.width-R,a.x+a.vx*dt));
    const n=Math.floor(a.x/P),t=a.x-n*P,type=w.route[n];
    if(n!==w.lastPiece){w.lastPiece=n;w.event++;}
    if(w.index===1){
      if(type==='bridgeLock'&&!f.bridgeLocked&&a.grounded&&a.vx>0&&prev.x<=n*P+bridgeCradles[n].left&&t>=bridgeCradles[n].left){
        w.cradle={slot:n,time:0,angle:0,flip:0};
        return carryInCradle(w,0);
      }
      if(type==='ropeBridge'&&t>85&&!f.bridgeLocked)return fail(w,'The bridge is loose. Roll into the cradle before crossing the planks.',['bridgeLock','ropeBridge']);
      if(type==='ropeBridge'&&f.bridgeLocked&&t>320)f.crossedSuspension=true;
      if(type==='ropeSlope'&&t>330&&f.crossedSuspension)f.descendedToCage=true;
    }
    if((type==='pressure'||type==='counter'||type==='counterCargo')&&t>95&&t<290&&a.y>270){
      if(type==='pressure')f.unlock=true;
      else if(type==='counter'){f.jaw=true;f.helper=true;}
      else {f.crate=true;f.bridge=true;f.helper=true;}
    }
    // Triggers fire on a crossing, never every animation frame. Returning can change state again.
    if(t>120&&t<285&&a.grounded&&w.visits[n]!==w.event){
      w.visits[n]=w.event;
      if(type==='reel'){f.latched=!!(f.unlock&&w.modes.reel);f.unlock=f.latched;}
      if(type==='brace'){f.bridge=true;f.wedge=true;}
      if(type==='pawl'){f.jawLocked=!!(f.jaw&&w.modes.pawl);if(!f.jawLocked)f.jaw=false;}
      if(type==='cue')f.cued=true;
      if(type==='upperPin'){if(!f.cued)return fail(w,'The scenery dropped too soon. Ring the bell to warn the singer first.',['cue','upperPin']);f.pin=true;}
      if(type==='catch'){if(f.pin)f.safe=true;}
      if(type==='brake')f.secured=!!(f.carry&&w.modes.brake);
    }
    if(type==='lowBridge'&&!f.wedge&&t>125)return fail(w,'The bridge still wobbles. In Arrange, place the wedge before the downhill ramp.',['brace','down']);
    if(type==='load'&&t>135&&f.crate&&!f.carry){
      f.carry=true;f.cargoPickupX=a.x;f.cargoShakes=0;
    }
    if(type==='dragon'&&!(f.jaw&&f.jawLocked)&&t>114&&t<260){
      w.dragonBiteMs=0;a.vx=0;a.vy=0;return w;
    }
    if(type==='lowerPin'&&!(f.pin&&f.safe)&&t>145&&t<200)return fail(w,'The exit is loose. Release the upper pin, then set the safety catch.',['upperPin','catch']);
    if(type==='load'&&!f.crate&&t>190)return fail(w,'The chest is still overhead. Lower it with the hoist first.',['counterCargo']);
    if(type==='cargoBridge'&&!f.carry&&t>110)return fail(w,'Here comes the hero. Where’s the prize? Load the chest onto the cart first.',['load']);
    if(type==='cargoBridge'&&f.carry&&!f.secured&&t>110)return fail(w,'The chest slid off. Load it first, then turn the brake clockwise.',['brake']);
    const ground=surface(w,a.x),oldGround=surface(w,prev.x);
    if(prev.g&&ground!==null&&oldGround!==null&&oldGround-ground>52){
      a.x=prev.x;a.vx=0;
      w.message=w.index===1?'The planks meet at different heights. Lock the bridge, cross it, then roll downhill.':w.route.includes('ramp')?'That ledge is too high. In Arrange, place the ramp before it.':'The boards meet at different heights. In Arrange, move the downhill ramp.';
      w.issue={text:w.message,pieces:w.index===1?['bridgeLock','ropeBridge','ropeSlope']:w.route.includes('ramp')?['ramp',type]:['down',type]};
    }else{
      a.vy+=1250*dt;a.y+=a.vy*dt;
      if(ground!==null&&a.vy>=0&&((prev.y+R<=ground+32&&a.y+R>=ground)||(prev.g&&Math.abs((oldGround||ground)-ground)<30))){
        a.y=ground-R;a.vy=0;a.grounded=true;
      }else a.grounded=false;
    }
    a.angle+=a.vx*dt/R;
    // Two catches in the axle on the loaded journey. Milestones use forward
    // distance from pickup, so backing up or re-entering a panel cannot repeat one.
    if(w.index===5&&f.carry&&f.cargoShakes<2&&a.grounded&&input.move>0){
      const distance=a.x-f.cargoPickupX,next=f.cargoShakes===0?450:880;
      if(distance>=next){
        f.cargoShakes++;w.cargoPause=cargoPauseDuration;a.vx=0;
      }
    }
    // Once the can is below the deck's landing tolerance, it cannot regain
    // the planks. Keep the last physical pose for the animated hand-off.
    if(w.index===0&&type==='bridge'&&!a.grounded&&a.vy>0&&t>120&&t<285&&a.y+R>pieces.bridge.input+32){
      w.crocodileMs=crocodileTiming.approach;
      return w;
    }
    if(a.y>H+95)return fail(w,'Through the gap! Try again and press Space or tap Jump just before the missing plank.',[type]);
    if(n===w.goal.slot&&a.x>=w.goal.x&&a.grounded){
      if(!goalReady(w))return fail(w,'At your mark already? Open Hint to see which prop still needs you.',[w.goal.type]);
      a.x=w.goal.x;a.vx=0;a.vy=0;w.done=true;f.arrived=true;f.goalReached=true;
      if(w.level.rescue)f.rescued=true;
      w.message=w.level.rescue?'The duck is free!':w.level.cargo?'The chest is home!':'Made it!';
    }
    return w;
  }
  const api={P,H,R,pieces,levels,objectives,crocodileTiming,dragonTiming,cargoPauseDuration,bridgeCradles,cradleTiming,create,surface,step,guidance,actionHint,viewBounds,goalReady};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ComicWorld=api;
})(typeof window!=='undefined'?window:globalThis);

;
(function(){
 'use strict';
 function drawWinch(c,angle,engaged,brake){
  const ink='#1c1c1c',paper='#fafaf8',iron='#acacaa';
  c.clearRect(0,0,600,600);c.save();c.lineJoin='round';c.lineCap='round';
  function line(points,color=ink,weight=3){
   c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=weight;c.stroke();
  }
  function disc(x,y,r,fill,weight=3){
   c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fillStyle=fill;c.fill();
   if(weight){c.strokeStyle=ink;c.lineWidth=weight;c.stroke();}
  }
  function bolt(x,y,r){disc(x,y,r,paper,2);line([[x-r*.54,y+r*.3],[x+r*.54,y-r*.3]],ink,2);}
  function shape(points,fill,weight=3){
   c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();c.strokeStyle=ink;c.lineWidth=weight;c.stroke();
  }
  // The open mounting shoe lets the reader see where the pawl bears against the drum.
  c.translate(-163,-175);c.scale(1.62,1.62);
  const shoe=[[120,355],[171,345],[210,250],[251,234],[323,246],[366,347],[430,354],[451,383],[445,430],[402,437],[399,417],[153,417],[148,438],[111,433],[106,393]];
  c.save();c.translate(3,8);shape(shoe,ink,3);c.restore();
  shape(shoe,paper,4);
  line([[116,399],[144,398],[159,388]],iron,3);
  for(let i=0;i<9;i++)line([[169+i*8,407],[177+i*8,400]],iron,1.3);
  for(const [x,y] of [[135,378],[419,376],[130,416]])bolt(x,y,8);
  // The rack engages the wheel at its lower tangent. The drum and its rope have
  // the same centre as the crank, so the handle never floats off the axle.
  const gx=278,gy=283;
  c.save();c.translate(gx,gy);c.scale(1,.91);c.rotate(angle*.55);
  const teeth=[];for(let i=0;i<26;i++)for(const [phase,r] of [[0,129],[.12,147],[.48,147],[.64,129]]){
   const a=(i+phase)*Math.PI*2/26;teeth.push([Math.cos(a)*r,Math.sin(a)*r]);
  }
  c.save();c.translate(2,6);shape(teeth,ink,3);c.restore();
  shape(teeth,paper,3.8);disc(0,0,117,ink,2);disc(0,0,111,paper,2);
  for(let i=0;i<5;i++){
   const a=i*Math.PI*2/5;c.save();c.rotate(a);c.beginPath();c.moveTo(39,-10);c.lineTo(85,-25);c.quadraticCurveTo(105,0,85,25);c.lineTo(39,10);c.closePath();c.fillStyle=ink;c.fill();c.restore();
  }
  c.beginPath();c.arc(0,0,99,.31,1.22);c.strokeStyle=iron;c.lineWidth=2;c.stroke();
  disc(0,0,37,paper);disc(0,0,24,iron);c.restore();
  // One asymmetric tooth pivots into the ratchet, with a visible air gap when released.
  const px=425,py=397;c.save();c.translate(px,py);c.rotate(engaged?0:.60);
  shape([[-101,-4],[-55,-28],[-5,-12],[13,-9],[14,9],[-6,16],[-76,5]],paper,4);
  line([[-73,-5],[-51,-16],[-31,-10]],iron,3);c.restore();bolt(px,py,13);
  if(brake){
   line([[126,423],[360,423]],ink,6);for(let i=0;i<12;i++)line([[139+i*17,432],[148+i*17,423]],ink,2);
  }else{
   line([[104,407],[216,407]],ink,7);line([[106,406],[214,406]],paper,3);
   for(let i=0;i<12;i++)line([[106+i*9,410],[112+i*9,404]],ink,1.3);
  }
  const hx=gx+Math.sin(angle)*112,hy=gy-Math.cos(angle)*111;
  line([[gx,gy],[hx,hy]],ink,21);line([[gx,gy-2],[hx,hy-2]],paper,12);
  bolt(gx,gy,11);disc(hx,hy,18,ink,3);disc(hx-2,hy-2,13,'#8e3437',0);disc(hx-6,hy-7,3,paper,0);
  if(engaged){line([[384,353],[394,342]],ink,3);line([[395,362],[409,355]],ink,2);}
  c.restore();
 }
 window.OpeningMechanism={show:function({host,type,name,paintCloseUp,locked,onChange,onClose,listen,cue,reduced,signal}){
  const detail={reel:{object:'the lift cable',hold:'The catch is set. It will hold once the cable is taut.',slip:'The catch is loose. The cable will unwind.'},pawl:{object:'the rope that lifts the dragon’s jaws',hold:'The catch is set. It will hold the jaws once the dancer lifts them.',slip:'The catch is loose. The jaws will close when the dancer steps off.'},brake:{object:'the cart axle',hold:'The brake is set. It will secure the chest once it is loaded.',slip:'The brake is loose. The loaded chest can slide.'}}[type];
  const modal=document.createElement('dialog');
  modal.className='p-inspector prop-book';
  modal.setAttribute('aria-labelledby','prop-book-title');
  modal.innerHTML='<header class="prop-heading"><h2 id="prop-book-title">'+name+'</h2><button type="button" id="p-inspect-close" aria-label="Back to stage">Back to stage</button></header>'+
    '<figure class="prop-location"><canvas class="p-inspect-front" role="img" aria-label="The mechanism on stage"></canvas><figcaption>This crank holds '+detail.object+'.</figcaption></figure>'+
    '<section class="prop-hands"><div class="prop-wheel"><canvas class="p-inspect-dial" width="600" height="600" role="slider" tabindex="0" aria-label="Turn the crank with a drag or the arrow keys" aria-valuemin="0" aria-valuemax="1"></canvas></div><div class="p-inspect-controls"><button type="button" data-direction="-1">↶ Release</button><button type="button" data-direction="1">Wind ↷</button></div></section>'+
    '<footer class="prop-reading"><p class="p-inspect-status" role="status"></p><p class="prop-method">Turn clockwise to engage the catch.</p></footer>';
  host.append(modal);const snapshot=modal.querySelector('.p-inspect-front');snapshot.width=990;snapshot.height=480;
  const dial=modal.querySelector('.p-inspect-dial'),ctx=dial.getContext('2d'),status=modal.querySelector('.p-inspect-status');let angle=locked?1.1:-1.1,pointer=null,closed=false;
  function paint(){
    paintCloseUp(snapshot);drawWinch(ctx,angle,locked,type==='brake');
    dial.setAttribute('aria-valuenow',locked?'1':'0');dial.setAttribute('aria-valuetext',locked?'Catch engaged':'Catch released');
    modal.querySelectorAll('[data-direction]').forEach(b=>b.setAttribute('aria-pressed',String((Number(b.dataset.direction)>0)===locked)));
    dial.dataset.locked=String(locked);status.textContent=locked?detail.hold:detail.slip;
  }
  function setAngle(value){if(closed)return;angle=Math.max(-1.1,Math.min(1.1,value));const next=angle>.12?true:angle<-.12?false:locked,changed=next!==locked;locked=next;if(changed){onChange(locked);cue('latch',{rate:locked?1.1:.85});}paint();}
  function turn(dir){setAngle(dir>0?1.1:-1.1);}
  function endDrag(){if(!pointer)return;pointer=null;angle=locked?1.1:-1.1;paint();}
  modal.querySelectorAll('[data-direction]').forEach(b=>listen(b,'click',()=>turn(+b.dataset.direction)));
  listen(dial,'pointerdown',e=>{if(e.button!==0||e.isPrimary===false||pointer)return;e.preventDefault();dial.focus();const r=dial.getBoundingClientRect();pointer={id:e.pointerId,angle:Math.atan2(e.clientY-r.top-r.height/2,e.clientX-r.left-r.width/2)};dial.setPointerCapture(e.pointerId);});
  listen(dial,'pointermove',e=>{if(!pointer||pointer.id!==e.pointerId)return;const r=dial.getBoundingClientRect(),a=Math.atan2(e.clientY-r.top-r.height/2,e.clientX-r.left-r.width/2);let delta=a-pointer.angle;while(delta>Math.PI)delta-=Math.PI*2;while(delta< -Math.PI)delta+=Math.PI*2;pointer.angle=a;setAngle(angle+delta);});
  listen(dial,'pointerup',e=>{if(pointer?.id===e.pointerId)endDrag();});listen(dial,'pointercancel',endDrag);listen(dial,'lostpointercapture',endDrag);
  listen(dial,'keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();turn(e.key==='ArrowRight'?1:-1);}});
  function close(){
   if(closed)return;closed=true;pointer=null;
   signal?.removeEventListener('abort',close);
   if(modal.open)modal.close();modal.remove();
   window.OPENING_BASE?.music?.duck(false,'mechanism');
   if(!signal?.aborted)onClose();
  }
  const back=modal.querySelector('#p-inspect-close');
  // A recent touch-drag on the wheel can suppress the next synthesized click.
  let backTouch=null;
  listen(back,'touchstart',e=>{backTouch=e.touches.length===1?e.touches[0]:null;},{passive:true});
  listen(back,'touchcancel',()=>{backTouch=null;});
  listen(back,'touchend',e=>{
   const start=backTouch,end=e.changedTouches[0];backTouch=null;
   if(!start||!end||start.identifier!==end.identifier||e.touches.length||Math.hypot(end.clientX-start.clientX,end.clientY-start.clientY)>9)return;
   e.preventDefault();close();
  },{passive:false});
  listen(back,'click',close);listen(modal,'cancel',e=>{e.preventDefault();close();});listen(modal,'close',close);
  paint();modal.showModal();
  window.OPENING_BASE?.music?.duck(true,'mechanism');
  signal?.addEventListener('abort',close,{once:true});
  dial.focus();return modal;
 }};
})();

;
(function(root){
  'use strict';

  // Movement is registered to each original 600×400 illustration. The sheets
  // translate or pivot as units. Stage scenery, outlines and anatomy stay rigid.
  const pieces=[
    {pivot:[442,184],delay:450,travel:1190,poses:[[0,-46,-6,-10],[.26,-24,-13,-8],[.48,-3,-6,-3],[.61,0,-1,5.5],[.78,0,-.5,-3],[.90,0,0,1.1],[1,0,0,0]],cue:'dust',at:[397,181],cueDelay:1030},
    {pivot:[429,374],delay:690,travel:1060,poses:[[0,0,0,0],[.38,0,0,-5.5],[.57,0,0,-5.5],[.86,0,0,1],[1,0,0,0]],cue:'tick',at:[302,123],cueDelay:1040},
    {pivot:[440,249],delay:530,travel:1180,poses:[[0,-15,-1,-4],[.28,-7,-5,-7],[.47,0,-1,0],[.62,0,-1,5],[.79,0,-.5,-2.8],[.91,0,0,1],[1,0,0,0]],cue:'tick',at:[505,224],cueDelay:1100},
    {pivot:[24,244],delay:670,travel:930,poses:[[0,0,0,0],[.38,0,0,-18],[.54,0,0,-18],[.76,0,0,5],[1,0,0,0]],cue:'tick',at:[63,171],cueDelay:1240},
    {pivot:[97,55],delay:620,travel:1000,poses:[[0,0,0,0],[.23,0,0,-13],[.54,0,0,9],[.79,0,0,-4],[1,0,0,0]],cue:'note',at:[472,184],cueDelay:670},
    {pivot:[358,358],delay:740,travel:870,poses:[[0,0,0,0],[.27,0,-3,-.9],[.41,0,0,.35],[.60,0,0,0],[.76,0,-2,.55],[1,0,0,0]],cue:'knock',at:[462,66],cueDelay:940}
  ];

  // Plates I and III already have a separate can. On the other four we lift
  // the original label, rim and body along the inked contour in 600×400 space.
  const tinCuts={
    1:{plate:'scene',foot:[127,374],angle:-4.2,delay:720,
       outline:'M89.5 148C79 114 153 118 196 130Q237 142 226 164L221 174 194 340Q195 348 191 354Q197 363 186 369C161 383 88 378 64 362Q57 357 62 349L62.5 341Z',
       beakOverlap:true},
    3:{plate:'near',foot:[183,366],angle:5.2,delay:660,
       outline:'M143 213C131 180 211 181 236 197Q247 206 239 219L231 347Q231 351 232 357Q233 364 222 367Q172 376 140 364Q132 363 135 355L136 347Z'},
    4:{plate:'scene',foot:[233,359],angle:-4.4,delay:700,
       outline:'M169 166C158 145 196 133 227 132C257 128 281 132 281 146Q282 150 279.5 155L292.3 335Q293.5 340 294.4 343Q295.6 353 283 357C258 367 205 367 185 356Q178 353 181 346L182 337Z'},
    5:{plate:'near',foot:[504,370],angle:5.1,delay:680,
       outline:'M490 203C488 182 531 182 557 194C577 202 591 211 585 223L582 229 550 355Q552 365 542 370C514 381 476 369 460 357Q454 353 455 347L460 339Z'}
  };

  function rockPrintedTin(plate,cut,play){
    const path=new Path2D(cut.outline);
    function print(keepInside){
      const sheet=document.createElement('canvas');
      sheet.className=keepInside?'c-story-cel c-story-tin':'c-story-cel c-story-tin-surround';
      sheet.width=plate.naturalWidth;sheet.height=plate.naturalHeight;
      const ink=sheet.getContext('2d');
      ink.drawImage(plate,0,0);
      ink.scale(sheet.width/600,sheet.height/400);
      ink.globalCompositeOperation=keepInside?'destination-in':'destination-out';
      ink.fill(path);
      if(keepInside&&cut.beakOverlap){
        // The dancer's beak masks a sliver of the original label. Continue its
        // white paper edge underneath before that part of the tin swings free.
        ink.globalCompositeOperation='destination-over';
        ink.strokeStyle='#292929';ink.lineWidth=2.25;
        ink.stroke(new Path2D('M197.8 286.5 193.8 318'));
        ink.fillStyle='#fff';ink.fill(new Path2D('M197.8 286.5 193.8 318 185 316 187 290Z'));
      }
      return sheet;
    }
    const fixed=print(false),tin=print(true);
    plate.after(fixed,tin);plate.style.visibility='hidden';
    tin.style.transformOrigin=(cut.foot[0]/6)+'% '+(cut.foot[1]/4)+'%';
    const frames=[[0,0],[.10,.08],[.31,1],[.43,.81],[.62,-.58],[.79,.24],[.91,-.075],[1,0]]
      .map(([offset,k])=>({offset,transform:'rotate('+(cut.angle*k)+'deg)',easing:'ease-in-out'}));
    const motion=play(tin,frames,{id:'tin-settles',delay:cut.delay,duration:1040});
    const putDown=()=>{plate.style.visibility='';fixed.remove();tin.remove();};
    motion.finished.then(putDown,putDown);
  }

  const cues={
    dust:'<path d="M-19 0q-4-4-1-7t7-1q-1-5 3-6t6 3"/><path d="M-23 2l-5 1m13-15-3-4"/>',
    tick:'<path d="M-6 0l-7-5m10 0-3-9m8 8 3-7"/>',
    knock:'<path d="M-8-2l-7-6m11 2-1-10m7 9 5-6"/>',
    note:'<path fill="currentColor" stroke="none" d="M0 1v-16l10-4v14c0 5-9 7-9 2 0-3 4-5 7-4v-8l-6 2V1c0 5-9 6-9 2 0-3 4-5 7-4z"/>'
  };

  function loadLayer(src,role){
    const img=new Image();img.alt='';img.className='c-story-cel c-story-'+role;img.draggable=false;
    return new Promise((resolve,reject)=>{
      img.onload=()=>resolve(img);img.onerror=reject;img.src=src;
    });
  }

  function cueLayer(beat){
    const ns='http://www.w3.org/2000/svg',ink=document.createElementNS(ns,'svg');
    ink.setAttribute('class','c-story-gesture');ink.setAttribute('viewBox','0 0 600 400');
    const anchor=document.createElementNS(ns,'g');anchor.setAttribute('transform','translate('+beat.at.join(' ')+')');
    const mark=document.createElementNS(ns,'g');mark.setAttribute('fill','none');mark.setAttribute('stroke','currentColor');
    mark.setAttribute('stroke-width','2');mark.setAttribute('stroke-linecap','round');mark.innerHTML=cues[beat.cue];
    anchor.append(mark);ink.append(anchor);return {ink,mark};
  }

  async function mount(host,asset,index,signal,reduced){
    const beat=pieces[index],chapter='chapter-0'+(index+1),base='story-cels-v52/'+chapter+'-';
    const stage=document.createElement('div');stage.className='c-story-theatre';
    try{
      const inkBase='story-ink-v54/'+chapter+'-';
      const backcloth=index===0?'chapter-sets-v55/first-wing.webp':'later-v51/'+chapter+'.webp';
      const settingPrint=index===0?inkBase+'wing-floor.svg':inkBase+'setting.svg';
      const [far,scene,action,near,setting,prop]=await Promise.all([
        loadLayer(asset(backcloth),'distance'),
        ...['scene','action','near'].map(name=>loadLayer(asset(base+name+'.webp'),name)),
        loadLayer(asset(settingPrint),'setting'),loadLayer(asset(inkBase+'prop.svg'),'prop')
      ]);
      if(signal.aborted||!host.isConnected)return;
      setting.className='c-story-ink c-story-setting';
      prop.className='c-story-ink c-story-prop';
      // The brim and the chest hardware belong to their actors. The wedge and
      // broken timbers are in front of the action; the dragon's lip sits behind it.
      const onActor=index===1||index===5, onNear=index===0||index===2;
      if(index===0)far.style.objectPosition='23% center';
      const distanceTone=[.44,.40,.46,.41,.43,.42][index];
      far.style.opacity=String(distanceTone);
      stage.append(far,setting,scene);
      if(!onActor&&!onNear)stage.append(prop);
      stage.append(action);
      if(onActor)stage.append(prop);
      stage.append(near);
      if(onNear)stage.append(prop);
      host.replaceChildren(stage);
      host.classList.add('has-registered-cels');
      if(reduced||!action.animate)return;
      const animations=[];
      const play=(node,frames,options)=>{const motion=node.animate(frames,options);animations.push(motion);return motion;};
      // Keep the printed set registered from the first frame through the hold.
      const cut=tinCuts[index];
      if(cut)rockPrintedTin(cut.plate==='scene'?scene:near,cut,play);
      else action.classList.add('c-story-tin');
      action.style.transformOrigin=(beat.pivot[0]/6)+'% '+(beat.pivot[1]/4)+'%';
      const poses=beat.poses.map(([offset,x,y,rotation])=>({offset,transform:'translate('+(x/6)+'%,'+(y/4)+'%) rotate('+rotation+'deg)'}));
      for(const plate of onActor?[action,prop]:[action]){
        plate.style.transformOrigin=action.style.transformOrigin;
        play(plate,poses,{id:cut?'chapter-action':'tin-settles',delay:beat.delay,duration:beat.travel,fill:'backwards',easing:'linear'});
      }
      const {ink,mark}=cueLayer(beat);stage.append(ink);mark.style.opacity='0';
      const note=beat.cue==='note';
      play(mark,[{opacity:0,transform:'translate(0,0)'},{opacity:1,offset:.16},{opacity:1,offset:.65},
        {opacity:0,transform:note?'translate(18px,-16px)':'translate(0,-2px)'}],{duration:note?780:340,delay:beat.cueDelay});
      signal.addEventListener('abort',()=>animations.forEach(animation=>animation.cancel()),{once:true});
    }catch{
      // A missing plate keeps the complete original illustration on the page.
    }
  }
  root.OpeningStoryMotion={mount};
})(window);

;
(function(){
 'use strict';
 window.OpeningEpilogues={create:function(env){
  const {base,asset,duck,animateCast,listen,after,tone,hint,say,saved,save,open,home,reduced}=env;
  // Creative direction approved by the author on 2026-11-05.
  const chapterTitles=['The First Step','A Bow Before Thanks','One Good Turn','Keep That Mouth Open','Singing on the Way','A Heavy Reward'];
  const stories=[
   "Every hero must take a first step. With no feet to speak of, our hero had to improvise.",
   "The door was open, but the dancer was in no hurry. It was waiting for the right beat to take a bow.",
   "The dancer called it a helping hand. Technically, a wing—but we knew what it meant.",
   "A real dragon would breathe fire at this point. This one was waiting for someone to oil its hinges.",
   "The singer was free at last, but insisted on finishing the note. Everyone agreed it could do that on the way out.",
   "They brought the chest all the way back to the theatre. It was heavier than expected, and occasionally complained about the road."
];
  // Each drawing holds for a beat like a printed cel. The burst stays in one
  // side panel, so the reader can still see the landing and read the narration.
  function paperStreamers(){
   const cut=(d,fill)=>'<path d="'+d+'" fill="'+fill+'" stroke="#232323" stroke-width="2.3" stroke-linejoin="round"/>';
   const glints=d=>'<path d="'+d+'" fill="none" stroke="#232323" stroke-width="2.4" stroke-linecap="round"/>';
   const cels=[
    cut('M14 86l12-19-3 14 10-7-10 15z','#fff')+glints('M14 69l-1-5m17 0 4-4'),
    cut('M16 83q8-24 19-31l6 2q-13 12-18 29z','#fff')+cut('M35 52q5-1 8 4l-6 7-4-5z','#555')+cut('M43 57q7-12 12-15l5 2-14 17z','#fff')+cut('M52 72l8-4 5 2-9 6z','#fff')+glints('M23 45l-2-7m41 20 7-3'),
    cut('M13 77q13-29 27-34l5 3q-18 13-27 35z','#fff')+cut('M40 43q8-2 10 4l-6 9-6-5z','#555')+cut('M46 48q8-17 22-20l4 4q-17 8-22 21z','#fff')+cut('M68 28l8 4-5 8-4-4z','#555')+cut('M72 33q9-12 19-14l3 3-19 15z','#fff')+cut('M69 60l10-5 6 3-11 7z','#fff')+cut('M38 30l-1-8 4 2 1 7z','#555')+glints('M89 50l8-2m-70-12-3-7'),
    cut('M37 49q9-18 26-22l5 4q-16 7-27 22z','#fff')+cut('M63 27l8 4-5 8-4-4z','#555')+cut('M69 32q12-14 25-14l4 3q-13 4-25 15z','#fff')+cut('M94 18l8 5-7 7-4-4z','#555')+cut('M85 64l11-2 4 4-12 3z','#fff')+cut('M48 22l1-9 5 6-2 7z','#555'),
    cut('M76 42q8-14 24-15l3 3q-14 5-24 15z','#fff')+cut('M100 27l7 4-5 6-3-4z','#555')+cut('M97 69l9 1 3 4-10-2z','#fff')+cut('M56 29l4-5 2 6-4 3z','#555')
   ];
   return '<svg class="c-story-streamers" aria-hidden="true" viewBox="0 0 116 92">'+cels.map((cel,i)=>'<g class="c-streamer-pose c-pose-'+(i+1)+'">'+cel+'</g>').join('')+'</svg>';
  }
  function buildSpread(art,index){
   const mount=document.createElement('div'),spread=document.createElement('div');
   mount.className='c-story-mount';spread.className='c-story-spread';
   art.replaceWith(mount);mount.append(spread);
   const wings=['left','right'].map((side,sideIndex)=>{
    const wing=document.createElement('div');wing.className='c-story-wing c-story-wing-'+side;wing.setAttribute('aria-hidden','true');
    for(let row=0;row<2;row++){
     const cell=sideIndex*2+row+1,panel=document.createElement('div'),print=new Image();
     panel.className='c-story-margin c-margin-'+cell;print.alt='';print.draggable=false;
     print.src=asset('story-wings-v55/chapter-0'+(index+1)+'-'+cell+'.webp');panel.append(print);
     if(cell===(index%2?4:2))panel.insertAdjacentHTML('beforeend',paperStreamers());
     wing.append(panel);
    }
    return wing;
   });
   spread.append(wings[0],art,wings[1]);
  }
  function story(index){
   index=Math.max(0,Math.min(5,index|0));const line=stories[index],c=base('','','');
   const count=index===0?0:index<4?1:2,illustration=env.storyArt?.[index];c.closest('.c-body').classList.add('c-story-body');
   c.innerHTML='<section class="c-story-page" aria-label="Chapter '+(index+1)+': '+chapterTitles[index]+'"><div class="c-story-art" role="img"></div><div class="c-story-cast"'+(illustration?' hidden':'')+'>'+(count?duck(0):'')+'<img src="'+asset('can-v30/front.png')+'" alt="The tin-can hero">'+(count>1?duck(1):'')+'</div><div class="c-story-copy"><h1>'+chapterTitles[index]+'</h1><p id="c-caption" class="c-story-transcript">'+line+'</p></div><div class="c-story-caption-slot"></div></section>';
   c.querySelector('.c-story-page').dataset.chapter=String(index+1);
   c.querySelector('.c-story-copy').dataset.folio=['I','II','III','IV','V','VI'][index];
   const art=c.querySelector('.c-story-art');
   art.setAttribute('aria-label',[
     'The can clears the broken stage bridge and lands on a plank beside the hanging ropes.',
     'Beside the open cage, the dancer tips its hat to the can.',
     'The dancer braces the bridge while the can rolls across the boards.',
     'A hand winch holds the wooden dragon’s great jaws open.',
     'The singer steps out, still holding the last note as the little bell swings.',
     'The ducks push the rattling chest back to the theatre beside the can.'
   ][index]);
   // Newly generated illustrations must be explicitly approved before use.
   if(illustration){
     const src=asset(illustration);buildSpread(art,index);
     art.style.backgroundImage='url("'+src+'")';art.classList.add('is-full-illustration');
     window.OpeningStoryMotion.mount(art,asset,index,env.getSignal(),reduced);
   }
   else if(env.approvedStoryAtlas){art.style.backgroundImage='url("'+asset(env.approvedStoryAtlas)+'")';art.style.backgroundPosition=(index%3*50)+'% '+(index<3?0:100)+'%';}
   animateCast();hint('');
   // Narration is a deliberate quiet beat, never spoken over active puzzle input.
   const owner=env.getSignal();
   window.OpeningSubtitles?.placeIn(c.querySelector('.c-story-caption-slot'),owner);
   after(async()=>{
     await say(line);
     if(owner.aborted)return;
     env.afterNarration(()=>{
       window.OpeningPageTurn.story(c.closest('.c-body'),owner,reduced,()=>{
         if(index===5)open('finale');else open('level',index+1);
         env.cue('paper');
       });
     },true);
   },1120);
  }
  function encore(entry){return window.OpeningEnsemble.mount({...env,arrival:entry?.arrival});}
  return {story,encore};
 }};
})();

;
(function(root){
  'use strict';
  const paths=new Map();
  const ink='#272622',ivory='#fbf8ed';
  function print(c,d,fill,stroke,width=1){
    if(!paths.has(d))paths.set(d,new Path2D(d));
    const p=paths.get(d);
    if(fill){c.fillStyle=fill;c.fill(p);}
    if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke(p);}
  }

  // Two strips of torn cotton spike tape, seen in the plane of the boards.
  // The second strip overlaps the first, so its edge passes through the cross.
  function tape(c){
    c.scale(.82,.90);
    print(c,'M-47 -9 L-43 -12 L-40 -12 L-38 -14 L-36 -13 L-34 -14 L45 1 L43 2 L41 2 L40 4 L38 3 L36 5 Z',ivory,'#423f36',1.4);
    print(c,'M-42 0 L28 -15 L31 -15 L37 -16 L39 -14 L42 -14 L41 -13 L44 -12 L42 -10 L-34 6 L-36 4 L-37 5 L-39 3 L-41 3 Z','#fffcf1','#36352f',1.5);
    print(c,'M-34 5 L-16 1 M19 -7 L39 -12 M35 4 L25 2',null,'#79756c',.7);
    print(c,'M-43 -10 L-37 -9 M-42 -12 L-36 -11 M-36 -12 L-31 -11 M-24 -9 L-20 -8 M-35 1 L-30 0 M-34 3 L-26 1 M22 -13 L25 -13 M33 -11 L36 -12 M37 -12 L40 -12',null,'#999589',.65);
  }
  // A hooded shell lamp at the upstage edge; no upright pole above the actor.
  function footlight(c){
    print(c,'M-39 0 Q-13 -9 18 -7 Q43 -6 48 -3 Q20 4 -30 4Z','#302f2a38');
    print(c,'M-32 -6 Q-32 -36 -7 -40 Q13 -44 24 -18 L32 -11 L29 -6 Q1 -13 -29 -3Z','#605e57',ink,2.1);
    print(c,'M-25 -10 Q-23 -33 -7 -35 Q6 -37 15 -22 M-21 -10 Q-17 -23 -12 -26',null,'#dedad1',1.6);
    print(c,'M-30 -5 Q-23 -22 -3 -25 Q19 -28 29 -10 Q15 -1 -22 0Z',ivory,ink,2);
    print(c,'M-15 -6 Q-12 -18 -2 -18 Q7 -18 9 -10 L7 -8 Q-5 -4 -15 -6Z','#fff',ink,1.4);
    print(c,'M-29 -2 L26 -11 L34 -7 L32 -3 L-24 5 L-31 2Z','#928e81',ink,1.8);
    print(c,'M-23 0 L17 -7',null,ivory,1.15);
  }
  // An oval brass number let flush into the stage. Lettering lies on its face.
  function cuePlate(c){
    const rim='M-40 -2 C-38 -13 9 -18 34 -12 Q49 -7 37 -1 Q14 9 -27 7 Q-44 6 -40 -2Z';
    print(c,rim,'#a09b8c',ink,2.15);
    print(c,'M-36 -2 C-31 -12 13 -15 31 -10 Q42 -6 33 -2 Q9 7 -25 4 Q-39 4 -36 -2Z','#dcd7c7',ink,1);
    print(c,'M-14 0 L-8 -5 L-1 -4 L-8 1Z M-2 -1 L4 -6 L11 -5 L4 0Z M10 -2 L17 -7 L24 -6 L17 -1Z',ink);
    print(c,'M-31 0 L-26 -2 M29 -5 L33 -7',null,ink,1.6);
  }
  const drawings={tape,footlight,cuePlate};
  function draw(c,x,y,scale=1,style='tape'){
    c.save();c.translate(x,y);c.scale(scale,scale);
    c.lineCap='round';c.lineJoin='round';drawings[style](c);c.restore();
  }
  root.OpeningStageMarks={draw};
})(typeof window==='undefined'?globalThis:window);

;
(function (root) {
  'use strict';

  // The background plate is printed only once at the resolution of its current
  // frame. The foreground actors, levers and swinging bridges stay on live layers.
  const plates = new Map();
  const screenTiles = new Map();
  const atlasKey = 'assets/print-v32/backdrops.webp';
  let atlas;
  const fieldWidth = 600;

  function surface(width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }

  function getAtlas() {
    if (atlas || !root.OPENING_BASE?.assets?.[atlasKey]) return atlas;
    atlas = new Image();
    atlas.onload = () => plates.clear();
    atlas.src = root.OPENING_BASE.assets[atlasKey];
    return atlas;
  }

  function ink(c, path, fill, stroke, weight = 1) {
    const shape = new Path2D(path);
    if (fill) {
      c.fillStyle = fill;
      c.fill(shape);
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = weight;
      c.stroke(shape);
    }
    return shape;
  }

  function marks(c, path, shade, width = 1) {
    ink(c, path, null, shade, width);
  }

  // One orthogonal black screen, with different dot area for different inks.
  // Supersample a tiny periodic tile so the small circles retain a round edge.
  function screened(c, shape, color, pitch, radius) {
    const key = [color, pitch, radius].join('/');
    let tile = screenTiles.get(key);
    if (!tile) {
      const size = 48;
      tile = surface(size, size);
      const p = tile.getContext('2d');
      p.fillStyle = color;
      p.beginPath();
      p.arc(size / 2, size / 2, size * radius / pitch, 0, Math.PI * 2);
      p.fill();
      screenTiles.set(key, tile);
    }
    const pattern = c.createPattern(tile, 'repeat');
    pattern.setTransform(new DOMMatrix().scale(pitch / tile.width));
    c.fillStyle = pattern;
    c.fill(shape);
  }

  function flat(c, quarter, x, y, width, opacity) {
    const img = getAtlas();
    if (!img?.complete || !img.naturalWidth) return;
    const sw = img.naturalWidth / 2, sh = img.naturalHeight / 2;
    // Trim the printed dividers separating the four drawings in the source.
    c.save();
    c.globalCompositeOperation = 'multiply';
    c.globalAlpha = opacity;
    c.drawImage(img, (quarter % 2) * sw + 5, Math.floor(quarter / 2) * sh + 5,
      sw - 10, sh - 10, x, y, width, width * (sh - 10) / (sw - 10));
    c.restore();
  }

  function cloud(c, x, y, size) {
    c.save();
    c.translate(x, y);
    c.scale(size, size);
    ink(c, 'M0 20 Q14 14 23 16 C21 9 30 5 38 9 C41 -3 59 -2 66 8 C78 3 91 9 91 16 Q110 13 124 20 Q85 18 69 21 Q39 18 0 20Z', '#f4f4f4');
    marks(c, 'M4 22 Q22 19 37 21 M44 23 Q68 21 78 23 M88 19 Q105 18 118 20', '#bebebe', 1.5);
    c.restore();
  }

  function ridge(c, h, skyline, depth) {
    const y = h * skyline;
    c.save();
    c.translate(0, y);
    c.scale(1, depth);
    ink(c, 'M-10 29 Q18 11 49 19 Q78 -13 117 4 Q151 -24 187 0 Q221 -14 246 -1 Q285 -15 308 -6 Q355 -36 395 -15 Q429 -30 464 -8 Q485 -14 501 -7 Q560 -37 616 -12 V680 H-10Z', '#d4d4d4');
    const hills = ink(c, 'M-10 46 Q35 19 67 32 Q116 -2 164 28 Q199 11 224 17 Q269 10 291 30 Q339 7 368 20 Q407 6 439 19 Q487 -4 537 16 Q575 -2 614 8 V680 H-10Z', '#c3c3c3');
    screened(c, hills, '#a4a4a4', 5.3, .77);
    marks(c, 'M8 40 Q41 23 61 28 M133 18 Q144 18 153 23 M388 16 Q404 10 417 13 M513 11 Q530 13 537 16 M543 11 Q568 0 584 3', '#9c9c9c', 1);
    c.restore();
  }

  function pine(c, x, y, size, color) {
    c.save(); c.translate(x, y); c.scale(size, size);
    ink(c, 'M-3 0 L-3 -10 Q-14 -7 -15 -14 Q-11 -15 -9 -20 Q-17 -18 -15 -23 Q-10 -23 -7 -30 Q-12 -27 -12 -33 Q-4 -37 1 -50 Q4 -43 10 -38 Q9 -35 6 -36 Q9 -28 14 -27 Q15 -22 9 -23 Q12 -17 17 -16 Q18 -11 10 -12 Q10 -7 2 -10 L3 0Z', color);
    c.restore();
  }

  function paintedGrove(c, x, y, scale) {
    [[0,-2,.55],[12,0,.8],[30,1,.64],[44,2,1],[57,0,.56],[69,0,.73]].forEach(([dx,dy,s]) =>
      pine(c, x + dx * scale, y + dy * scale, s * scale, '#9c9c9c'));
  }

  function start(c, h) {
    cloud(c, 174, h*.18, .85);
    ridge(c, h, .66, .55);
    flat(c, 3, -104, h*.72-159, 375, .38);
    // Arris and a pair of old flats, just visible behind the red house curtain.
    marks(c, 'M47 3 L51 '+h*.78+' M54 9 L58 '+h*.75, '#777777', 1.4);
    paintedGrove(c, 423, h*.65, .56);
  }

  function ramp(c, h) {
    cloud(c, 365, h*.13, .87);
    ridge(c, h, .57, .9);
    paintedGrove(c, 337, h*.57, .78);
    // Layered painted hedges describe a rising hillside beneath the track.
    c.save(); c.translate(0, h*.63);
    const hedge = ink(c, 'M-6 78 Q18 63 40 69 Q65 45 86 57 Q113 27 141 44 Q169 13 199 23 Q218 0 237 9 Q258 -8 283 2 Q311 -26 338 -14 Q361 -23 387 -16 Q422 -42 443 -30 Q471 -63 500 -47 Q527 -71 545 -59 Q586 -83 606 -70 V490 H-6Z', '#b6b6b6');
    screened(c, hedge, '#929292', 4.7, .69);
    marks(c, 'M63 58 Q77 50 86 54 M128 42 Q144 33 155 36 M255 -1 Q271 -9 280 -3 M427 -31 Q439 -38 449 -34 M520 -58 Q535 -65 540 -62', '#8b8b8b', 1.4);
    c.restore();
  }

  function river(c, h, wharf) {
    const waterY = h * (wharf ? .66 : .69);
    cloud(c, wharf ? 303 : 238, h*.11, .86);
    ridge(c, h, .37, .52);
    paintedGrove(c, wharf ? 358 : 447, h*.40, .60);
    const left = ink(c, 'M-6 '+h*.40+' Q68 '+h*.48+' 111 '+h*.62+' Q139 '+h*.65+' 158 '+h*.73+' L101 '+h*.83+' L-6 '+h*.87+'Z', '#a3a3a3');
    screened(c, left,'#838383',4.6,.76);
    ink(c, 'M605 '+h*.43+' Q547 '+h*.50+' 503 '+h*.58+' L448 '+h*.74+' L606 '+h*.78+'Z', '#a9a9a9');
    ink(c, 'M-6 '+waterY+' Q154 '+(waterY+5)+' 278 '+(waterY-2)+' Q450 '+(waterY-5)+' 607 '+(waterY+1)+' V'+(h+3)+' H-6Z', '#dedede');
    // Broken white reflections leave unprinted space between the two shores.
    c.save(); c.translate(0, waterY); c.scale(1, Math.max(.45, Math.min(1.4,h/300)));
    marks(c, 'M19 11 Q62 8 103 11 M81 16 Q110 13 124 14 M216 8 Q244 6 266 8 M285 13 Q337 9 359 13 M426 6 Q471 3 495 5 M530 14 Q556 12 584 13 M38 37 Q77 34 94 35 M367 44 Q410 40 445 44 M535 53 Q553 50 568 52', '#9d9d9d', 1.2);
    marks(c, 'M100 26 Q151 23 174 25 M208 17 Q234 15 243 16 M268 31 Q309 26 330 28 M404 18 Q447 14 469 16 M76 51 Q109 46 133 47 M275 57 Q292 54 319 54', '#f6f6f6', 2.2);
    c.restore();
  }

  function brokenBridge(c, h, view) {
    river(c, h, false);
    // Project the banks with the bridge, even when its scene trades a wide
    // ellipse for the circular frame. These are the two outside board edges
    // in the 400 x 200 woodcut, whose top is at world y=70.
    const left = Math.min(view.left - 7, -45), right = Math.max(view.right + 7, 436);
    c.save();
    c.scale(fieldWidth / view.width,fieldWidth / view.width);
    c.translate(-view.left,-view.top);
    const leftRock = ink(c, 'M'+left+' 95 Q-25 108 -3 115 L49 100 L4 150 L13 159 L4 176 L-3 180 L-7 199 L-20 207 L-26 225 L'+left+' 253Z', '#929292','#6f6f6f',1.5);
    screened(c,leftRock,'#747474',3.6,.67);
    ink(c,'M'+left+' 92 Q-35 97 -8 100 L17 94 L50 101 L5 146 L-12 142 L-24 146 L'+left+' 148Z','#d5d5d5','#838383',1.45);
    marks(c,'M-28 114 Q-15 110 -6 112 M-18 129 Q-6 122 4 124 M-16 171 L-8 158 M-19 174 L-13 162 M5 157 L-2 168','#818181',1.1);
    const rightRock = ink(c,'M330 228 L398 166 L'+right+' 155 V248 L407 272 Q390 265 385 256 L369 254 L358 244 L343 245Z','#939393','#717171',1.6);
    screened(c,rightRock,'#777777',3.7,.68);
    ink(c,'M328 232 L396 166 Q416 166 429 160 L'+right+' 153 V206 Q427 205 406 216 L382 216 Q363 224 350 223 L339 234Z','#d2d2d2','#848484',1.45);
    marks(c,'M366 222 L379 217 M380 246 L369 240 M402 232 L397 226 M416 244 L402 238','#777777',1.1);
    c.restore();
  }

  function goal(c, h) {
    cloud(c, 195, h*.14, .84);
    ridge(c, h, .63, .68);
    // The finish flag sits in front of tiny painted turrets on the far hill.
    flat(c, 0, 407, h*.63-89, 190, .36);
    paintedGrove(c, 233, h*.63, .65);
    flat(c, 2, -289, h*.74-173, 375, .38);
  }

  function highDeck(c, h) {
    cloud(c, 182, h*.10, .87);
    ridge(c, h, .60, .53);
    flat(c, 0, 255, h*.60-77, 165, .32);
    // Dark braced wing at the left suggests the next set rolling into place.
    const width = Math.min(365,h*1.9);
    flat(c, 3, -42, h*.75-width*.43, width, .45);
  }

  function ropeBridge(c, h) {
    river(c, h, true);
    // The cable returns to the fly rail, visible at the upper edge.
    c.save(); c.translate(0, -9);
    ink(c, 'M-1 0 H602 V19 Q457 20 383 18 Q219 21 93 18 L-1 20Z', '#a8a8a8', '#7e7e7e', 2);
    marks(c, 'M12 12 Q62 8 95 12 M103 13 Q124 6 139 8 M239 13 Q311 9 351 13 M412 8 Q466 6 501 8 M525 13 Q564 8 588 10', '#808080', 1.2);
    c.restore();
  }

  function ropeSlope(c, h) {
    cloud(c, 287, h*.11, .63);
    ridge(c, h, .53, .58);
    // A small set of trees falls away downstage past the suspended ramp.
    paintedGrove(c, 264, h*.60, .70);
    paintedGrove(c, 415, h*.58, .48);
    flat(c, 1, 498, -24, 337, .50);
    const bank = ink(c,'M-10 '+h*.69+' Q125 '+h*.63+' 208 '+h*.74+' Q285 '+h*.87+' 389 '+h*.87+' Q496 '+h*.91+' 611 '+h*.84+' V'+(h+6)+' H-10Z','#b0b0b0');
    screened(c,bank,'#929292',4.9,.71);
  }

  function lock(c, h) {
    // Backstage winch-house. Limit the wood, fastenings and perforated shadow
    // to the left side; the lever and its lettering read against clean paper.
    const wall = ink(c,'M0 0 L'+Math.min(208,h*.93)+' 0 L'+Math.min(98,h*.48)+' '+h+' H0Z','#d1d1d1');
    screened(c, wall, '#b1b1b1', 4.5, .71);
    flat(c, 1, -46, -17, Math.min(252,h*2.2), .55);
    c.save(); c.translate(0,h*.68);
    marks(c, 'M0 -2 L44 -2 M2 0 L34 0 M552 0 Q567 -1 582 0 L600 0 M575 -2 L600 -3', '#acacac', 1);
    c.restore();
  }

  function cage(c,h) {
    // The cage's engraved foot ends at row 710 of the 720-unit drawing.
    // Print one tapered contact shadow directly under that foot.
    const height=h*.93;
    c.save(); c.translate(fieldWidth*259/400,height*710/720);
    c.scale(height/390,height/390);
    const edge=ink(c,'M-85 -7 C-62 -11 4 -9 45 -8 C69 -8 87 -6 100 -1 C95 4 44 7 9 7 C-30 7 -74 4 -91 0 Q-94 -3 -85 -7Z');
    screened(c,edge,'#747473',2.1,.52);
    ink(c,'M-79 -4 Q-29 -8 48 -6 Q73 -6 83 -3 C76 1 28 4 -7 3 Q-66 4 -79 -4Z','#6a6a68');
    c.restore();
  }

  const painters = {start, ramp, bridge:brokenBridge, goal, startHigh:highDeck, ropeBridge, ropeSlope, bridgeLock:lock, cageExit:cage};
  const panoramas=new Map();
  const looks={start:[1,.02,.47],ramp:[1,.24,.51],bridge:[1,.67,.44],goal:[1,1,.54],startHigh:[2,.06,.41],bridgeLock:[2,.31,.34],ropeBridge:[2,.58,.41],ropeSlope:[2,.94,.48]};
  function drawPanorama(c,type,h){
    const look=looks[type];if(!look)return false;
    const [chapter,x,y]=look;
    const key=chapter===1?'assets/chapter-sets-v55/first-wing.webp':'assets/later-v51/chapter-02.webp';
    const src=root.OPENING_BASE?.assets?.[key];if(!src)return false;
    if(!panoramas.has(chapter)){
      const image=new Image();panoramas.set(chapter,image);
      image.onload=()=>plates.clear();image.src=src;
    }
    const image=panoramas.get(chapter);if(!image.naturalWidth)return false;
    const scale=Math.max(fieldWidth/image.naturalWidth,h/image.naturalHeight)*(chapter===1?1.92:1.24);
    const w=image.naturalWidth*scale,tall=image.naturalHeight*scale;
    c.save();c.globalAlpha=type==='bridgeLock'?.58:.72;
    c.drawImage(image,(fieldWidth-w)*x,(h-tall)*y,w,tall);c.restore();
    return true;
  }
  function paint(ctx, type, view) {
    const draw = painters[type];
    if (!draw || !view || !(view.width > 0 && view.height > 0)) return;
    const m = ctx.getTransform(), zoom = Math.hypot(m.a, m.b);
    const bitmapWidth = Math.max(1,Math.round(Math.min(1800,Math.max(320,view.width*zoom))));
    const bitmapHeight = Math.max(1,Math.round(bitmapWidth*view.height/view.width));
    if (!Number.isFinite(bitmapHeight) || bitmapHeight > 4000) return;
    const camera = type === 'bridge' ? '/' + [view.left,view.top,view.width].map(n=>n.toFixed(2)).join('/') : '';
    const id = type + '/' + bitmapWidth + 'x' + bitmapHeight + camera;
    let plate = plates.get(id);
    if (!plate) {
      plate = surface(bitmapWidth,bitmapHeight);
      const c = plate.getContext('2d'), h = fieldWidth*view.height/view.width;
      c.scale(bitmapWidth/fieldWidth,bitmapHeight/h);
      c.lineCap = 'round'; c.lineJoin = 'round';
      if (type !== 'cageExit') {
        c.fillStyle = type === 'bridgeLock' ? '#f2f2f2' : '#eeeeee';
        c.fillRect(0,0,fieldWidth,h);
      }
      if(!drawPanorama(c,type,h)&&!looks[type])draw(c,h,view);
      if (plates.size >= 24) plates.delete(plates.keys().next().value);
      plates.set(id,plate);
    }
    ctx.drawImage(plate,view.left,view.top,view.width,view.height);
  }
  root.OpeningScenicInk = {paint};
})(typeof window === 'undefined' ? globalThis : window);

;
(function(root){
  'use strict';
  // Slot geometry belongs to the page, never to the scene that is exchanged into it.
  const slots=Object.freeze([
    {id:'opening',mask:'trapezoid',rect:[55,62,432,142],clip:'polygon(0 0,100% 0,81% 100%,0 100%)',safe:[.025,.06,.75,.88]},
    {id:'upper',mask:'ellipse',rect:[460,46,500,260],clip:'ellipse(50% 50% at 50% 50%)',safe:[.14,.18,.72,.64]},
    {id:'lower',mask:'circle',rect:[55,227,280,280],clip:'circle(50% at 50% 50%)',safe:[.16,.15,.68,.70]},
    {id:'exit',mask:'cutaway',rect:[296,243,657,264],clip:'polygon(23% 0,100% 0,100% 100%,0 100%)',safe:[.27,.055,.69,.89]}
  ].map(s=>Object.freeze({...s,rect:Object.freeze(s.rect),safe:Object.freeze(s.safe)})));
  const sceneBounds={start:{top:170,bottom:380},ramp:{top:48,bottom:395},bridge:{top:25,bottom:285},goal:{top:-28,bottom:275}};
  // Calibrated independently from collision heights. Update these anchors to the approved
  // bridge artwork; a jump always retains its real height above the physical y=230 deck.
  const bridgeArt={box:{x:0,y:70,w:400,h:200},front:[[0,76,145],[165,147,181],[240,222,192],[400,320,207]],mouth:{x:153,y:202,width:38}};
  const canHeightOnPage=76;
  // Width of a source pixel on the printed page, shared by both views of the sign.
  const signOnPage=slots[0].rect[3]*.62/1040;
  function heroHeight(slot,viewHeight,minHeight=0){return Math.max(viewHeight*canHeightOnPage/slots[slot].rect[3],minHeight);}
  function layout(width,height){
    const scale=Math.max(0,Math.min(width/1000,height/560)),ox=(width-1000*scale)/2,oy=(height-560*scale)/2;
    return slots.map(s=>({id:s.id,mask:s.mask,clip:s.clip,x:ox+s.rect[0]*scale,y:oy+s.rect[1]*scale,w:s.rect[2]*scale,h:s.rect[3]*scale}));
  }
  function camera(slot,type,width,height){
    const s=slots[slot],b=sceneBounds[type],r=s.safe;
    if(type==='bridge'){
      // The intact outer ends continue past the mask. The broken ends stay in shot.
      const scale=width/365;
      return {scale,left:(width-400*scale)/2,top:184-height*.69/scale};
    }
    if(type==='ramp'){
      const scale=Math.min(width*.53/220,height*.39/120);
      return {scale,left:width/2-200*scale,top:290-height*.635/scale};
    }
    if(type==='start'){
      const scale=width*.62/400;
      return {scale,left:width*.145,top:350-height*.82/scale};
    }
    const sx=width*r[0],sy=height*r[1],sw=width*r[2],sh=height*r[3];
    const scale=Math.min(sw/400,sh/(b.bottom-b.top));
    const left=sx+(sw-400*scale)/2,top=b.top-(sy+(sh-(b.bottom-b.top)*scale)/2)/scale;
    return {left,top,scale};
  }
  function contains(slot,x,y){
    if(x<0||y<0||x>1||y>1)return false;
    const mask=slots[slot].mask;
    if(mask==='ellipse'||mask==='circle')return (x-.5)**2+(y-.5)**2<=.25;
    if(mask==='trapezoid')return x<=1-.19*y;
    return x>=.23*(1-y);
  }
  function bridgePoint(x){
    const p=bridgeArt.front;let i=0;while(i<p.length-2&&x>p[i+1][0])i++;
    const a=p[i],b=p[i+1],t=Math.max(0,Math.min(1,(x-a[0])/(b[0]-a[0])));
    return {x:a[1]+(b[1]-a[1])*t,y:a[2]+(b[2]-a[2])*t,pathAngle:Math.atan2(b[2]-a[2],b[1]-a[1])};
  }
  function actorPoint(w,slot,W){
    const x=w.actor.x-slot*W.P,type=w.route[slot],foot=w.actor.y+W.R;
    if(type==='bridge'){const p=bridgePoint(x);return {x:p.x,y:p.y-(230-foot)};}
    if(type==='ramp'){
      const position=rampX(x);
      return {x:position,y:rampY(position)+foot-W.surface(w,w.actor.x)};
    }
    return {x,y:foot};
  }
  function rampX(x){return 200+(x-200)*.48;}
  function rampY(x){return 290-(x-200)*.625;}
  function catchPose(foot,height,elapsed,mouth){
    const startY=foot.y-height/2,entryY=Math.max(startY,mouth.y);
    const entryX=mouth.x-mouth.width*.24,entryHeight=Math.min(height,mouth.width*1.3);
    if(elapsed<0){
      const t=Math.max(0,1+elapsed/300),ease=t*t*(3-2*t);
      return {x:foot.x+(entryX-foot.x)*ease,y:startY+(entryY-startY)*t*t,
        height:height+(entryHeight-height)*ease,roll:-.78*ease};
    }
    const t=Math.min(1,elapsed/240),ease=t*t*(3-2*t);
    return {x:entryX+mouth.width*.79*ease,y:entryY+mouth.width*.84*t,
      height:entryHeight*(1-.42*t),roll:-.78-.40*ease};
  }
  function create({W,asset,reduced=false}){
    function load(name){const image=new Image(),src=asset(name);if(src)image.src=src;return image;}
    const art={sign:load('level-one-v47/sign.png'),bridge:load('level-one-v47/bridge.png'),crocodile:load('level-one-v47/crocodile.png'),rabbit:load('level-one-v47/rabbit-reaction.png'),wood:load('theatre-v33/wood-floor.webp'),curtain:load('theatre-v40/stage-deep-red.webp'),can:load('theatre-v45/can.png')};
    const ready=i=>i.complete&&i.naturalWidth>0;
    let can=null;
    if(root.OpeningCanRenderer&&asset('theatre-v45/can.png')){can=root.OpeningCanRenderer.get(asset('theatre-v45/can.png'));can.ready.catch(()=>{});}
    function contain(ctx,image,x,y,w,h,filter='grayscale(1)'){if(!ready(image))return false;const scale=Math.min(w/image.naturalWidth,h/image.naturalHeight),iw=image.naturalWidth*scale,ih=image.naturalHeight*scale;ctx.save();ctx.filter=filter;ctx.drawImage(image,x+(w-iw)/2,y+(h-ih)/2,iw,ih);ctx.restore();return true;}
    function cover(ctx,image,x,y,w,h){if(!ready(image))return;const scale=Math.max(w/image.naturalWidth,h/image.naturalHeight),sw=w/scale,sh=h/scale;ctx.drawImage(image,(image.naturalWidth-sw)/2,(image.naturalHeight-sh)/2,sw,sh,x,y,w,h);}
    function curtain(ctx,view){
      if(!ready(art.curtain))return;
      const image=art.curtain,wing=view.width*.052,scale=view.height/207;
      // Carry the cropped outer fold into the frame edge with its original hem and tie.
      // Reflect the fabric at its cut edge so the ink contours join the gathered drape.
      ctx.save();ctx.translate(view.left+wing+1,view.top);ctx.scale(-1,1);
      ctx.drawImage(image,0,0,image.naturalWidth*22/400,image.naturalHeight*207/267,
        0,0,wing+1,view.height);ctx.restore();
      ctx.save();ctx.translate(view.left+wing,view.top);ctx.scale(scale,scale);
      ctx.beginPath();ctx.moveTo(-1,0);ctx.lineTo(108,0);ctx.quadraticCurveTo(97,29,62,25);
      ctx.bezierCurveTo(61,64,55,100,30,118);ctx.quadraticCurveTo(30,126,29,132);
      ctx.bezierCurveTo(32,156,41,184,49,197);ctx.quadraticCurveTo(59,202,43,205);
      ctx.quadraticCurveTo(19,215,-1,214);ctx.closePath();ctx.clip();
      ctx.drawImage(art.curtain,0,0,400,267);ctx.restore();
    }
    function floor(ctx,w,slot,view){
      const type=w.route[slot],bottom=view.bottom+20,left=Math.min(0,view.left),right=Math.max(400,view.right);
      if(type==='bridge'||type==='ramp')return;
      const walkLine=W.surface(w,slot*W.P);
      // The start scene has a visible stage plane behind the line the actor walks on.
      const y=walkLine-view.height*(type==='start'?.24:.14);
      ctx.beginPath();ctx.rect(left,y,right-left,bottom-y);
      ctx.fillStyle='#dadada';ctx.fill();ctx.save();ctx.clip();ctx.filter='grayscale(1)';
      if(ready(art.curtain)){
        const iw=art.curtain.naturalWidth,ih=art.curtain.naturalHeight;
        ctx.drawImage(art.curtain,iw*.08,ih*.815,iw*.76,ih*.145,left,y,right-left,bottom-y);
      }else cover(ctx,art.wood,left,y,right-left,bottom-y);
      ctx.restore();ctx.strokeStyle='#191919';ctx.lineWidth=3;ctx.stroke();
    }
    function entranceSign(ctx,view){
      if(!ready(art.sign))return;
      const scale=signOnPage*view.height/slots[0].rect[3];
      const signX=view.left+view.width*.61-735*scale;
      const postY=view.top+view.height*.70,signY=postY-1030*scale;
      // The original posts end at different pixels within their ink contour.
      // Bury their lowest 13 source pixels in narrow sockets in the upstage boards.
      for(const anchor of [404,979]){
        const x=signX+anchor*scale;
        ctx.beginPath();ctx.ellipse(x-5*scale,postY+1*scale,88*scale,15*scale,0,0,Math.PI*2);
        ctx.fillStyle='#29292966';ctx.fill();
        ctx.beginPath();ctx.ellipse(x,postY,67*scale,8*scale,0,0,Math.PI*2);
        ctx.fillStyle='#282828';ctx.fill();
      }
      ctx.save();ctx.globalAlpha=.90;ctx.filter='grayscale(1) brightness(.80)';
      ctx.drawImage(art.sign,0,0,art.sign.naturalWidth,1030,signX,signY,art.sign.naturalWidth*scale,1030*scale);
      ctx.restore();
    }
    // Posts are scenery, so their lower ends are cut by the *current* panel.
    function timber(ctx,x,y,bottom,width,lean=0){
      if(bottom<=y)return;
      ctx.beginPath();ctx.moveTo(x-width/2,y);ctx.lineTo(x+width/2,y);ctx.lineTo(x+lean+width/2,bottom);ctx.lineTo(x+lean-width/2,bottom);ctx.closePath();
      ctx.fillStyle='#bcbab7';ctx.fill();ctx.strokeStyle='#191919';ctx.lineWidth=2.8;ctx.stroke();
      ctx.beginPath();ctx.moveTo(x-width*.23,y+3);ctx.lineTo(x+lean-width*.19,bottom);ctx.strokeStyle='#555';ctx.lineWidth=1;ctx.stroke();
    }
    function bridgeSpan(ctx,view,rightSpan){
      const supports=rightSpan?[[231,235,13,-4],[309,241,12,-4]]:[[39,196,11,3],[102,219,12,3]];
      for(const [x,y,width,lean] of supports)timber(ctx,x,y,view.bottom+10,width,lean);
      if(ready(art.bridge)){
        // The source has a clear vertical gap at columns 793–826 of 1774.
        const b=bridgeArt.box,iw=art.bridge.naturalWidth,ih=art.bridge.naturalHeight;
        const split=Math.round(iw*810/1774),sx=rightSpan?split:0,sw=rightSpan?iw-split:split;
        ctx.drawImage(art.bridge,sx,0,sw,ih,b.x+b.w*sx/iw,b.y,b.w*sw/iw,b.h);
        return;
      }
      const a=rightSpan?240:0,b=rightSpan?400:165,p=bridgePoint(a),q=bridgePoint(b);
      ctx.strokeStyle='#191919';ctx.fillStyle='#dedede';ctx.lineWidth=3;
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.lineTo(q.x,q.y+18);ctx.lineTo(p.x,p.y+18);ctx.closePath();ctx.fill();ctx.stroke();
      for(let x=a+15;x<b;x+=24){const point=bridgePoint(x);ctx.beginPath();ctx.moveTo(point.x,point.y);ctx.lineTo(point.x-7,point.y+18);ctx.stroke();}
    }
    function ease(value){const t=Math.max(0,Math.min(1,value));return t*t*(3-2*t);}
    function crocodilePose(elapsed,ms){
      const beat=elapsed%2.75;
      const p={frame:reduced||beat<1.4?0:beat<1.75?1:beat<2.4?2:3,x:0,y:0,tilt:0,squash:0,torso:0,gulp:null,laugh:0};
      if(!Number.isFinite(ms))return p;
      if(ms<350){
        const dip=ease((ms+300)/140),snap=ease((ms-145)/108),recover=ease((ms-170)/180);
        p.frame=ms< -250?0:ms< -202?1:ms<145?2:ms<197?3:ms<246?1:0;
        p.y=14*dip*(1-recover);p.squash=.075*Math.sin(Math.PI*snap);return p;
      }
      if(ms<1150){
        // Two separate bites. The jaw opens slowly and snaps closed on each downbeat.
        const bite=((ms-350)%400)/400,press=Math.sin(bite*Math.PI*2);
        p.frame=bite>.14&&bite<.47?1:0;
        p.x=2*press;p.y=4*press;p.squash=.1*Math.max(0,-press);p.tilt=.055*press;return p;
      }
      const rise=ease((ms-1150)/480),fold=ease((ms-1650)/360);
      p.torso=rise;p.y=-23*rise-18*fold;p.x=-12*fold;
      p.frame=0;p.tilt=.42*rise*(1-fold)-.14*fold;
      if(ms<1750){p.gulp=(ms-1150)/600;return p;}
      const laughBeat=(ms-1750)/320,accent=(1-Math.cos(2*Math.PI*laughBeat))/2;
      p.laugh=ease((ms-1750)/205);const bob=reduced?0:p.laugh*accent;
      p.frame=p.laugh<.4?0:accent>.44?2:3;
      p.y+=5*bob;p.tilt-=.24*bob;p.squash=.055*bob;return p;
    }
    function crocBelly(ctx){
      ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='#181818';ctx.lineWidth=2.15;
      ctx.fillStyle='#f3f2ef';ctx.beginPath();ctx.moveTo(153,217);
      ctx.bezierCurveTo(157,225,181,223,190,218);ctx.bezierCurveTo(201,228,212,245,207,266);
      ctx.bezierCurveTo(204,288,185,297,158,292);ctx.bezierCurveTo(134,291,121,274,125,256);
      ctx.bezierCurveTo(128,237,144,233,153,217);ctx.closePath();ctx.fill();ctx.stroke();
      ctx.save();ctx.clip();ctx.fillStyle='#545454';
      for(let row=0;row<14;row++){for(let col=0;col<4;col++){
        const y=239+row*3.3,x=202+col*3.4+Math.sin(row*.28)*3;
        ctx.beginPath();ctx.arc(x,y,.35+col*.15,0,Math.PI*2);ctx.fill();}}
      ctx.restore();ctx.lineWidth=1.4;ctx.beginPath();ctx.moveTo(150,233);
      ctx.bezierCurveTo(131,252,135,276,145,284);ctx.moveTo(146,242);ctx.quadraticCurveTo(158,252,180,245);
      ctx.moveTo(138,263);ctx.quadraticCurveTo(158,274,181,266);ctx.stroke();
    }
    function crocForeleg(ctx,x,y,mirror,turn){
      ctx.save();ctx.translate(x,y);ctx.scale(mirror,1);ctx.rotate(turn);
      ctx.lineJoin='round';ctx.lineCap='round';ctx.strokeStyle='#181818';ctx.lineWidth=2.15;ctx.fillStyle='#f4f3f0';
      // The elbow doubles back; the three hooked fingertips rest on the abdomen.
      ctx.beginPath();ctx.moveTo(1,-6);ctx.bezierCurveTo(-8,-6,-15,2,-13,10);
      ctx.bezierCurveTo(-11,18,-1,22,9,20);ctx.bezierCurveTo(13,20,19,19,20,16);
      ctx.quadraticCurveTo(22,13,19,12);ctx.quadraticCurveTo(23,10,21,7);
      ctx.quadraticCurveTo(20,5,17,7);ctx.quadraticCurveTo(18,3,14,5);
      ctx.quadraticCurveTo(10,7,6,10);ctx.quadraticCurveTo(3,10,0,8);
      ctx.quadraticCurveTo(6,4,5,0);ctx.fill();ctx.stroke();
      ctx.lineWidth=1.15;ctx.beginPath();ctx.moveTo(12,14);ctx.quadraticCurveTo(16,11,19,12);
      ctx.moveTo(13,17);ctx.quadraticCurveTo(17,15,20,16);ctx.stroke();ctx.restore();
    }
    function crocHead(ctx,image,p){
      const anchors=[[345,599],[311,599],[337.5,573],[310.5,573]],sw=image.naturalWidth/2,sh=image.naturalHeight/2;
      const [ax,ay]=anchors[p.frame],scale=148/627,dx=177-ax*scale,dy=252-ay*scale;
      const sx=sw*(p.frame%2),sy=sh*Math.floor(p.frame/2),size=627*scale;
      ctx.save();ctx.translate(176,221);ctx.rotate(p.tilt);ctx.scale(1+p.squash,1-p.squash);ctx.translate(-176,-221);
      if(p.torso){
        const edge=255-24*p.torso;ctx.beginPath();ctx.moveTo(64,59);ctx.lineTo(249,59);
        ctx.lineTo(249,edge-15*p.torso);ctx.lineTo(200,edge-15*p.torso);
        ctx.quadraticCurveTo(194,edge-11*p.torso,193,edge);ctx.lineTo(64,edge);ctx.closePath();ctx.clip();
      }
      if(p.gulp!==null&&p.gulp>.09&&p.gulp<.96){
        // Carry a tin-shaped bulge through the *existing* throat outline; the label
        // was already swallowed. The two rounded ends descend across the neck scutes.
        const travel=ease((p.gulp-.09)/.87),centre=207+47*travel,strength=Math.sin(Math.PI*travel);
        const throat=210;ctx.drawImage(image,sx,sy,sw,(throat-dy)*sh/size,dx,dy,size,throat-dy);
        for(let y=throat;y<dy+size;y+=1){
          const h=Math.min(1,dy+size-y),dist=Math.abs(centre-y),widen=15*strength*(1-ease((dist-4)/6));
          ctx.drawImage(image,sx,sy+(y-dy)*sh/size,sw,h*sh/size,dx-widen,y,size+widen,h+.16);
        }
      }else ctx.drawImage(image,sx,sy,sw,sh,dx,dy,size,size);
      if(p.laugh>.6&&p.frame>=2){
        // Ink fresh closed lids inside the two model-sheet sockets, following the
        // different three-quarter angles of the wide and half-open mouth drawings.
        const wide=p.frame===2;ctx.translate(dx+(wide?275:245)*scale,dy+(wide?88:90)*scale);ctx.scale(scale/2,scale/2);
        const eyes=wide?[[164,145,228,196,148,288,98,235],[258,217,318,274,224,366,181,309]]:
          [[146,153,214,201,143,308,85,248],[253,209,318,271,224,368,182,310]];
        ctx.strokeStyle='#151515';ctx.fillStyle='#f4f3f2';ctx.lineWidth=9;ctx.lineCap='round';
        for(const [x,y,r,ry,b,by,l,ly] of eyes){
          ctx.beginPath();ctx.moveTo(x,y);ctx.bezierCurveTo(x+36,y-6,r,ry-27,r,ry);
          ctx.bezierCurveTo(r+1,ry+45,b+35,by+2,b,by);ctx.bezierCurveTo(b-34,by,l-3,ly+30,l,ly);
          ctx.bezierCurveTo(l+1,ly-32,x-28,y+8,x,y);ctx.fill();ctx.stroke();
          ctx.beginPath();ctx.moveTo(l+15,ly+8);ctx.quadraticCurveTo(x-5,y+40,r-19,ry+22);ctx.stroke();
        }
      }
      ctx.restore();
    }
    function crocodile(ctx,elapsed,failMs){
      const image=art.crocodile;if(!ready(image))return;
      const p=crocodilePose(elapsed,failMs);
      ctx.save();ctx.beginPath();ctx.moveTo(72,64);ctx.lineTo(252,64);ctx.lineTo(252,230);
      ctx.quadraticCurveTo(178,250,82,232);ctx.closePath();ctx.clip();
      ctx.translate(p.x,p.y);
      if(p.torso){ctx.save();ctx.translate(0,16*(1-p.torso));crocBelly(ctx);ctx.restore();}
      crocHead(ctx,image,p);
      if(p.gulp!==null){
        const travel=ease(p.gulp),ridge=Math.sin(Math.PI*travel);ctx.save();
        ctx.translate(165,216+38*travel);ctx.rotate(.12*(1-travel));ctx.scale(ridge,1);
        ctx.globalAlpha=.85*ridge;ctx.strokeStyle='#343434';ctx.lineWidth=1.4;ctx.lineCap='round';
        ctx.beginPath();ctx.moveTo(-10,1);ctx.quadraticCurveTo(-4,-2,4,0);
        ctx.moveTo(-11,3);ctx.quadraticCurveTo(-13,6,-10,10);ctx.quadraticCurveTo(-4,14,4,12);ctx.stroke();ctx.restore();
      }
      if(p.torso){
        ctx.save();ctx.translate(0,4+34*(1-p.torso));
        const squeeze=p.laugh*(reduced?0:Math.sin((failMs-1750)*Math.PI/160));
        crocForeleg(ctx,190,234,-1,-.16+.3*(1-p.laugh)-.075*squeeze);
        crocForeleg(ctx,145,235,1,.12-.33*(1-p.laugh)+.07*squeeze);ctx.restore();
      }
      ctx.restore();
      ctx.save();ctx.strokeStyle='#5d5d5d';ctx.lineWidth=1.25;ctx.lineCap='round';ctx.beginPath();
      ctx.moveTo(126,239);ctx.quadraticCurveTo(146,244,158,242);ctx.moveTo(154,244);ctx.quadraticCurveTo(177,248,197,244);ctx.stroke();ctx.restore();
    }
    function ramp(ctx,view,elapsed){
      const left=view.left-4,right=view.right+4,bottom=view.bottom+8;
      function surfacePath(){
        ctx.beginPath();ctx.moveTo(left,rampY(left));ctx.lineTo(right,rampY(right));
      }
      // The shaded space below the ramp is continuous, rather than an isolated rabbit cut-out.
      surfacePath();ctx.lineTo(right,bottom);ctx.lineTo(left,bottom);ctx.closePath();ctx.fillStyle='#525252';ctx.fill();
      ctx.save();ctx.clip();
      for(let x=Math.floor(left/82)*82;x<right+82;x+=82){
        const y=rampY(x)+10;
        ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+82,y+102);ctx.lineWidth=9;ctx.strokeStyle='#343434';ctx.stroke();
        timber(ctx,x,y,bottom,11);
      }
      if(ready(art.rabbit)){
        const rabbit=art.rabbit,sw=rabbit.naturalWidth/4,sh=rabbit.naturalHeight/2;
        const wide=view.width/view.height>1.4,beat=elapsed%6;
        const peek=reduced?1:(1-Math.cos(Math.PI*Math.min(1,beat/.75,(6-beat)/1.1)))/2;
        const eyes=reduced?0:Math.abs(beat-2.65);
        const blink=!reduced&&eyes<.15,closed=blink&&eyes<.06;
        // The body rises vertically from below the aperture. Place the taller
        // ear on the high side of the deck and let the sill hide the lower torso.
        const scale=view.height*(wide?.86:.675)/sh;
        const eyeX=view.left+view.width*(wide?.714:.725)+view.height*.009*peek;
        const eyeY=view.top+view.height*((wide?.749:.772)-.031*peek);
        ctx.save();ctx.translate(eyeX,eyeY);ctx.rotate(.035*peek);ctx.scale(scale,scale);
        ctx.translate(-sw*.5,-sh*.47);
        ctx.drawImage(rabbit,blink&&!closed?2*sw:0,0,sw,sh,0,0,sw,sh);
        if(closed){
          // Only the eyelids are taken from the closed-eye pose. Its raised
          // wing and surprised mouth belong to a different beat.
          // Retouch the open lashes with the paper inside the brow. Copy only
          // the two inked lid lines, leaving the eyebrows and cheek dots intact.
          for(const [x,y,width,height] of [[132,202,50,68],[139,269,24,4],[190,209,63,53],[191,262,52,15]]){
            ctx.drawImage(rabbit,178,193,12,12,x,y,width,height);
          }
          for(const [x,y,width,height] of [[131,235,47,35],[191,236,61,37]]){
            ctx.drawImage(rabbit,2*sw+x,sh+y,width,height,x,y,width,height);
          }
        }
        ctx.restore();
      }
      ctx.restore();
      surfacePath();ctx.lineTo(right,rampY(right)+16);ctx.lineTo(left,rampY(left)+16);ctx.closePath();
      ctx.fillStyle='#dbdbd9';ctx.fill();ctx.strokeStyle='#191919';ctx.lineWidth=3;ctx.stroke();
      for(let x=Math.floor(left/28)*28;x<right;x+=28){
        const y=rampY(x);ctx.beginPath();ctx.moveTo(x,y+1);ctx.lineTo(x+4,rampY(x+4)+15);ctx.strokeStyle='#303030';ctx.lineWidth=1.6;ctx.stroke();
        ctx.beginPath();ctx.moveTo(x+8,rampY(x+8)+7);ctx.quadraticCurveTo(x+14,rampY(x+14)+5,x+22,rampY(x+22)+7);ctx.lineWidth=.9;ctx.stroke();
      }
    }
    function paintCan(ctx,x,y,height,angle,deck){
      if(can?.draw(ctx,{x,y,height,angle,rotation:0,anchor:'ground',pose:deck?{depth:.28,pathAngle:deck.pathAngle}:undefined}))return;
      if(ready(art.can)){
        const width=height*776/1481;ctx.drawImage(art.can,87,80,776,1481,x-width/2,y-height,width,height);
      }
    }
    // Inside edges of the near teeth in the two original mouth poses,
    // traced relative to the fully open mouth in bridge art coordinates.
    const openTeeth=[[-26,-43],[-24,-27],[-22,-26],[-13,-35],[-15,-22],[-13,-19],[-2,-26],[-3,-10],[-1,-7],[7,-14],[9,-1],[12,2],[19,-5],[32,2],[38,-1],[34,10],[29,17],[25,12],[23,11],[19,21],[15,24],[9,17],[7,16],[3,25],[-1,26],[-6,18],[-7,17],[-13,25],[-15,25],[-17,10],[-19,8],[-25,20]];
    const closingTeeth=[[-29,-15],[-28,-5],[-26,-4],[-20,-11],[-17,-2],[-15,1],[-9,-6],[-4,4],[-2,5],[3,-1],[9,8],[11,8],[16,3],[29,6],[34,4],[30,12],[23,15],[19,11],[15,16],[9,18],[5,12],[3,11],[-2,18],[-7,17],[-11,10],[-13,9],[-18,15],[-20,14],[-23,4],[-25,3],[-29,11]];
    function clipSwallow(ctx,mouth,elapsed,view){
      const edge=elapsed<145?openTeeth:closingTeeth;
      ctx.beginPath();ctx.moveTo(mouth.x+edge[0][0],mouth.y+edge[0][1]);
      for(let i=1;i<edge.length;i++)ctx.lineTo(mouth.x+edge[i][0],mouth.y+edge[i][1]);
      ctx.closePath();
      // At first the can is in front of the lip. Its trailing end follows
      // the leading end through it. The original jaw and teeth show over the tin.
      if(elapsed<135){
        const front=mouth.x+mouth.width*(.72-2.05*elapsed/135);
        ctx.moveTo(view.left-4,view.top-4);ctx.lineTo(front+12,view.top-4);
        ctx.lineTo(front-11,view.bottom+4);ctx.lineTo(view.left-4,view.bottom+4);ctx.closePath();
      }
      ctx.clip();
    }
    function belowDeck(w,slot){
      return w.route[slot]==='bridge'&&Math.floor(w.actor.x/W.P)===slot&&!w.actor.grounded&&w.actor.y+W.R>230;
    }
    function drawCaughtCan(ctx,w,slot,view){
      const elapsed=view.failElapsedMs;
      // The lip hides the can as soon as it drops below the deck, including
      // the short physical fall before a miss becomes irreversible.
      if(elapsed>=197||(!Number.isFinite(elapsed)&&!belowDeck(w,slot)))return;
      const foot=actorPoint(w,slot,W),height=heroHeight(slot,view.height,view.minActorHeight),deck=bridgePoint(w.actor.x-slot*W.P);
      if(!Number.isFinite(elapsed)){paintCan(ctx,foot.x,foot.y,height,w.actor.angle,deck);return;}
      const mouth=bridgeArt.mouth,p=catchPose(foot,height,elapsed,mouth);
      ctx.save();
      if(elapsed>=0)clipSwallow(ctx,mouth,elapsed,view);
      ctx.translate(p.x,p.y);ctx.rotate(p.roll);
      paintCan(ctx,0,p.height/2,p.height,w.actor.angle+p.roll,deck);ctx.restore();
    }
    return function(ctx,w,viewCamera,time,slot,view){
      const type=w.route[slot],phase=reduced?0:time/1000;
      ctx.save();ctx.translate(slot*W.P-viewCamera,0);ctx.fillStyle='#b8b8b8';ctx.fillRect(view.left,view.top,view.width,view.height);
      root.OpeningScenicInk?.paint(ctx,type,view);
      floor(ctx,w,slot,view);
      if(type==='start'){entranceSign(ctx,view);curtain(ctx,view);}
      if(type==='ramp'){
        if(ready(art.sign)){
          // Continue the opening's physical board at the same printed scale.
          // The left rim crosses its last word, just ahead of the support.
          const factor=signOnPage*view.height/slots[slot].rect[3];
          const tipY=.37,leftRim=view.left+view.width*(.5-Math.sqrt(.25-(tipY-.5)**2));
          const sourceLeft=690,sourceTop=165,sourceWidth=675,sourceHeight=429;
          const x=leftRim-48*factor,y=view.top+view.height*tipY-(377-sourceTop)*factor;
          ctx.save();ctx.globalAlpha=.65;ctx.filter='grayscale(1) brightness(.72)';
          ctx.drawImage(art.sign,sourceLeft,sourceTop,sourceWidth,sourceHeight,x,y,sourceWidth*factor,sourceHeight*factor);
          ctx.restore();
        }
        ramp(ctx,view,phase);
      }
      if(type==='bridge'){
        bridgeSpan(ctx,view,false);crocodile(ctx,phase,view.failElapsedMs);
        drawCaughtCan(ctx,w,slot,view);bridgeSpan(ctx,view,true);
      }
      if(type==='goal')root.OpeningStageMarks.draw(ctx,w.goal.localX,W.pieces[type].input+2,1.13);
      if(Math.floor(w.actor.x/W.P)===slot&&!Number.isFinite(view.failElapsedMs)&&!belowDeck(w,slot)){
        const localX=w.actor.x-slot*W.P,p=actorPoint(w,slot,W),deck=type==='bridge'?bridgePoint(localX):null,ground=deck?deck.y:type==='ramp'?rampY(p.x):W.surface(w,w.actor.x);
        const minHeight=view.minActorHeight?Math.min(view.minActorHeight,p.y-view.top-2/view.scale):0;
        const height=heroHeight(slot,view.height,minHeight);
        if(ground!==null&&!(deck&&localX>165&&localX<240)){ctx.fillStyle='#19191935';ctx.beginPath();ctx.ellipse(p.x,ground+1,height*.22,height*.035,deck?deck.pathAngle:0,0,Math.PI*2);ctx.fill();}
        paintCan(ctx,p.x,p.y,height,w.actor.angle,deck);
      }
      ctx.restore();
    };
  }
  const api={slots,sceneBounds,bridgeArt,layout,camera,contains,bridgePoint,actorPoint,heroHeight,rampY,catchPose,create};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.OpeningLevelOne=api;
})(typeof window!=='undefined'?window:globalThis);

;
(function(root){
 'use strict';
 const slots=Object.freeze([
  {id:'entrance',mask:'trapezoid',rect:[45,45,410,195],clip:'polygon(0 0,100% 0,73% 100%,0 100%)',safe:[.035,.06,.70,.88]},
  {id:'suspension',mask:'ellipse',rect:[355,55,328,180],clip:'ellipse(50% 50% at 50% 50%)',safe:[.14,.17,.72,.66]},
  {id:'descent',mask:'cutaway',rect:[570,45,410,195],clip:'polygon(28% 0,100% 0,100% 100%,0 100%)',safe:[.29,.07,.68,.86]},
  {id:'lock',mask:'rectangle',rect:[45,398,450,118],clip:'inset(0)',safe:[.035,.07,.93,.86]},
  {id:'free-cage',mask:'open',rect:[545,232,440,310],clip:'none',safe:[.025,.02,.95,.96]}
 ].map(s=>Object.freeze({...s,rect:Object.freeze(s.rect),safe:Object.freeze(s.safe)})));
 function layout(width,height){const scale=Math.max(0,Math.min(width/1000,height/560)),x=(width-scale*1000)/2,y=(height-scale*560)/2;return slots.map(s=>({id:s.id,mask:s.mask,clip:s.clip,x:x+s.rect[0]*scale,y:y+s.rect[1]*scale,w:s.rect[2]*scale,h:s.rect[3]*scale}));}
 function contains(slot,x,y){if(x<0||y<0||x>1||y>1)return false;const mask=slots[slot].mask;if(mask==='ellipse')return (x-.5)**2+(y-.5)**2<=.25;if(mask==='trapezoid')return x<=1-.27*y;if(mask==='cutaway')return x>=.28*(1-y);return true;}
 function decorate(board,B){const url=B.assets['assets/stories-v32/chapter-02.webp'];if(!url)return;const art=document.createElement('div');art.className='p-second-underlay';art.setAttribute('aria-hidden','true');art.style.backgroundImage='url("'+url+'")';board.insertBefore(art,board.firstChild);}
 function resize(board,width,height){const art=board.querySelector('.p-second-underlay');if(!art)return;const s=Math.min(width/1000,height/560),x=(width-1000*s)/2,y=(height-560*s)/2;Object.assign(art.style,{left:x+45*s+'px',top:y+45*s+'px',width:940*s+'px',height:497*s+'px'});}
 // Project each dressing into the same 400-unit panel. The shape is the crop;
 // ropes, boards and scenery continue underneath its edges.
 const panelWidth = 400;
 const travel = [[.10,.65],[.28,.75],[.34,.90],[.075,.925],[.085,.88]];
 function camera(slot,type,width){return {scale:width/panelWidth,left:0,top:0};}
 function stageX(slot,local){
  const [start,end]=travel[slot];
  return panelWidth*start+(end-start)*local;
 }
 function playableLocalX(slot,stage){
  const [start,end]=travel[slot];
  return (stage-panelWidth*start)/(end-start);
 }
 function cradleCanHeight(height,minHeight){
  return Math.min(height*.56,Math.max(height*.54,minHeight||0));
 }

 // These anchors are measured on the top faces of the supplied drawings.
 const bridgeArt={width:1942,height:809,seam:[950,990],walk:535,ropes:[[217,866],[1078,1727]]};
 const slopeArt={width:1774,height:887,walkAtLeft:330,grade:.268,ropes:[92,1687]};
 function deck(slot,type,height,locked=true,phase=0,reduced=false){
  if(type==='ropeBridge'){
   const scale=.266, middle=height*.69;
   // Unlocked boards hang at different heights and their inner ends separate.
   const swing=locked||reduced?0:Math.sin(phase*2.8);
   const gap=locked?-2:Math.min(30,height*.16);
   const halves=[-1,1].map((side,i)=>{
    const seamX=200+side*gap;
    const seamY=middle+(locked?0:side*height*(.052+.019*swing));
    const grade=.045+(locked?0:side*(.085+swing*.07));
    return {seamX,seamY,grade,scale,sourceX:bridgeArt.seam[i]};
   });
   return {halves,point(x){
    const p=halves[x<200?0:1];
    return {x,y:p.seamY+(x-p.seamX)*p.grade,pathAngle:Math.atan(p.grade)};
   }};
  }
  if(type==='ropeSlope'){
   const left=-12,scale=424/slopeArt.width,grade=height*.30/panelWidth;
   const y=height*.58;
   return {left,scale,grade,y,point(x){return {x,y:y+grade*x,pathAngle:Math.atan(grade)};}};
  }
  const y=height*(type==='cageExit'?.93:.79);
  return {point(x){return {x,y,pathAngle:0};}};
 }
 function actorPoint(w,slot,W,viewHeight,geometry,minHeight=0){
  const type=w.route[slot],local=w.actor.x-slot*W.P;
  const profile=geometry??deck(slot,type,viewHeight,!!w.flags.bridgeLocked);
  const floor=profile.point(stageX(slot,local));
  const height=type==='bridgeLock'?cradleCanHeight(viewHeight,minHeight):Math.max(viewHeight*(type==='cageExit'?.37:.54),Math.min(minHeight,floor.y-viewHeight*.06));
  // Active jumps stay legible even when this scene lands in the short strip.
  const rise=Math.max(0,(W.surface(w,w.actor.x)??350)-(w.actor.y+W.R));
  if(w.cradle?.slot===slot){
   const scale=stageX(slot,1)-stageX(slot,0);
   return {...floor,y:floor.y-rise*scale,ground:floor.y,height,flip:w.cradle.flip};
  }
  const mask=slots[slot].mask;
  const left=(floor.x-height*.30)/panelWidth,right=(floor.x+height*.30)/panelWidth;
  let headroom=.045;
  if(mask==='ellipse'){
   const farthest=Math.max(Math.abs(left-.5),Math.abs(right-.5));
   headroom=Math.max(headroom,.515-Math.sqrt(Math.max(0,.25-farthest*farthest)));
  }else if(mask==='cutaway'){
   headroom=Math.max(headroom,1-left/.28+.015);
  }
  const clearance=Math.max(0,floor.y-height-viewHeight*headroom);
  const lift=clearance*Math.min(1,rise/90);
  return {...floor,y:floor.y-lift,ground:floor.y,height};
 }
 function create({W,asset,reduced=false,paintDuck}){
  // The lettering is painted into the panel, so it must use the page's typeface explicitly.
  const labelFamily=root.getComputedStyle?.(root.document.documentElement).getPropertyValue('--house-face').trim() || '"Can Act Subtitle", serif';
  const labelFont=size=>'500 '+size+'px '+labelFamily;
  root.document?.fonts?.load(labelFont(20),'Roll into the cradle.').catch(()=>{});
  function load(name){
   const img=new Image(),src=asset(name);
   if(src)img.src=src;
   return img;
  }
  const wood=load('theatre-v33/wood-floor.webp'),bridge=load('level-two-v47/rope-bridge.png');
  const slope=load('level-two-v47/rope-slope.png');
  const cage=load('theatre-v33/hanging-cage.webp'),canArt=load('theatre-v45/can.png');
  const ready=img=>img.complete&&img.naturalWidth>0;
  const can=root.OpeningCanRenderer?.get(asset('theatre-v45/can.png'));
  can?.ready.catch(()=>{});
  function stroke(ctx,x1,y1,x2,y2,width=2,color='#191919'){
   ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);
   ctx.lineWidth=width;ctx.strokeStyle=color;ctx.stroke();
  }
  const floors=new Map();
  function woodFloor(ctx,top,height){
   const depth=height-top;
   ctx.fillStyle='#dedede';ctx.fillRect(-2,top,404,depth+2);
   if(ready(wood)){
    // Map individual texture rows to a vanishing point; the far planks
    // narrow and their joints align across the full width of the panel.
    const key=Math.round(depth*8);
    let floor=floors.get(key);
    if(!floor){
     floor=document.createElement('canvas');floor.width=1000;
     floor.height=Math.max(1,Math.round(depth*2.5));
     const ink=floor.getContext('2d');
     ink.filter='grayscale(1)';
     for(let row=0;row<floor.height;row++){
      const t=row/floor.height,perspective=.68+t*.69;
      const sourceWidth=Math.min(wood.naturalWidth,wood.naturalWidth*.66/perspective);
      const sourceX=(wood.naturalWidth-sourceWidth)*.54;
      const sourceY=wood.naturalHeight*(.12+.84*t/(.55+.45*t));
      ink.drawImage(wood,sourceX,sourceY,sourceWidth,2,0,row,floor.width,1);
     }
     floors.set(key,floor);
    }
    ctx.drawImage(floor,-2,top,404,depth+2);
   }
   stroke(ctx,-2,top,402,top,2.3);
  }
  // A parallel pair of links keeps the receiving shoe level as it crosses
  // the top of the axle. The folded left lip is flush with the floor on entry.
  const hardwarePaths=new Map();
  function metal(ctx,d,fill,weight=1.5){
   if(!hardwarePaths.has(d))hardwarePaths.set(d,new Path2D(d));
   const path=hardwarePaths.get(d);
   ctx.fillStyle=fill;ctx.fill(path);ctx.lineWidth=weight;ctx.strokeStyle='#242423';ctx.stroke(path);
  }
  function pin(ctx,x,y,r){
   ctx.fillStyle='#252523';ctx.beginPath();ctx.arc(x,y,r,0,2*Math.PI);ctx.fill();
   stroke(ctx,x-r*.42,y+r*.32,x+r*.4,y-r*.38,Math.max(.55,r*.30),'#f8f8f4');
  }
  function lock(ctx,w,slot,h,base,minHeight,front){
   const arm=W.bridgeCradles[slot],ride=w.cradle,latched=!!w.flags.bridgeLocked;
   const angle=ride?.angle??(latched?Math.PI:0);
   const left=stageX(slot,arm.left),cx=stageX(slot,arm.left+arm.radius);
   const radius=cx-left,scale=cradleCanHeight(h,minHeight)/100;
   const shoeX=cx-radius*Math.cos(angle),shoeY=base-radius*Math.sin(angle);
   ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
   if(!front){
    ctx.save();ctx.translate(cx,base);ctx.scale(scale,scale);
    ctx.fillStyle='#3535323e';ctx.beginPath();ctx.ellipse(0,2,26,2.5,0,0,2*Math.PI);ctx.fill();
    metal(ctx,'M-23 -2 L-17 -6 L16 -6 L24 -2 L21 1 L-22 1Z','#b2b1aa');
    metal(ctx,'M-20 -2 L21 -2 L21 1 L-20 1Z','#696964',.85);
    metal(ctx,'M-12 -4 Q-8 -11 -6 -18 Q-5 -23 0 -23 Q5 -23 7 -17 L13 -4Z','#e1e0da');
    for(let i=0;i<4;i++)stroke(ctx,4+i*1.6,-12+i,6+i*1.6,-10+i,.65,'#696962');
    pin(ctx,-17,-3.5,1.3);pin(ctx,17,-3.5,1.3);
    const dx=(shoeX-cx)/scale,dy=(shoeY-base)/scale;
    for(const [lift,thick] of [[9,3],[17,6]]){
     stroke(ctx,0,-lift,dx,dy-lift,thick+2,'#252523');
     stroke(ctx,0,-lift,dx,dy-lift,thick,lift===9?'#999991':'#d7d6cd');
     stroke(ctx,dx*.15,-lift+dy*.15-.7,dx*.75,-lift+dy*.75-.7,.85,'#fafaf6');
     pin(ctx,0,-lift,thick*.68);pin(ctx,dx,dy-lift,thick*.6);
    }
    ctx.restore();
   }
   ctx.translate(shoeX,shoeY);ctx.scale(scale,scale);
   if(!front){
    metal(ctx,'M-30 -2 L-25 -6 L23 -6 L30 -3 L29 0 L-30 0Z','#d3d2cb',1.35);
    metal(ctx,'M-6 -4 L-4 -19 Q-3 -23 1 -22 L4 -20 L6 -4Z','#bebdb6');
    pin(ctx,0,-17,2.8);pin(ctx,0,-9,1.7);
   }else{
    const open=latched?(ride?Math.min(1,(ride.time-W.cradleTiming.release)/.12):1):0;
    const grip=ride?Math.min(1,ride.time/W.cradleTiming.grip)*(1-open):0;
    for(const side of [-1,1]){
     ctx.save();ctx.translate(side*26,-2);ctx.scale(side,1);
     const slant=side<0?1.38*(1-grip):1.38*open;
     ctx.rotate(slant);
     metal(ctx,'M-3 0 Q-1 -5 -1 -11 L-2 -17 Q0 -20 3 -18 L5 -14 L5 -5 L3 1Z','#d9d8d1',1.55);
     stroke(ctx,2.5,-15,3,-7,.75,'#686861');ctx.restore();
    }
    metal(ctx,'M-30 -4 Q-8 -1 1 -2 Q14 -2 29 -5 L30 -1 Q2 5 -30 0Z','#83837b',1.35);
    pin(ctx,-26,-2,1.5);pin(ctx,26,-2.5,1.5);
   }
   ctx.restore();
   if(front||ride||(latched&&Math.floor(w.actor.x/W.P)===slot))return;
   const right=slot===1?360:388,x=Math.min(cx+radius+9,right-54);
   const lines=latched?['Bridge','locked.']:['Roll into','the cradle.'];
   let size=Math.min(24,h*.17);
   ctx.font=labelFont(size);
   const longest=Math.max(...lines.map(line=>ctx.measureText(line).width));
   size=Math.min(size,size*(right-x)/longest);
   ctx.font=labelFont(size);ctx.fillStyle='#191919';
   lines.forEach((line,i)=>ctx.fillText(line,x,base-h*.43+i*size*1.06));
  }
  function suspended(ctx,w,h,profile){
   if(!ready(bridge))return;
   const half=bridgeArt.width/2;
   for(let i=0;i<2;i++){
    const p=profile.halves[i];
    ctx.save();ctx.translate(p.seamX,p.seamY);ctx.transform(1,p.grade,0,1,0,0);
    ctx.scale(p.scale,p.scale);ctx.translate(-p.sourceX,-bridgeArt.walk);
    // Keep rope fibres running through the upper contour in tall slots.
    for(const x of bridgeArt.ropes[i]){
     for(let y=-48;y>-(h/p.scale);y-=48)
      ctx.drawImage(bridge,x-30,3,60,48,x-30,y,60,48);
    }
    ctx.drawImage(bridge,i*half,0,half,bridgeArt.height,i*half,0,half,bridgeArt.height);
    ctx.restore();
   }
  }
  function incline(ctx,h,profile){
   if(!ready(slope))return;
   const {left,scale,grade}=profile;
   ctx.save();ctx.translate(left,profile.point(left).y);
   // Reproject the slope to this particular frame. Vertical hanging ropes
   // stay vertical while the walking line connects the two frame edges.
   ctx.transform(1,grade-slopeArt.grade,0,1,0,0);
   ctx.scale(scale,scale);ctx.translate(0,-slopeArt.walkAtLeft);
   for(const x of slopeArt.ropes){
    for(let y=-48;y>-(h/scale);y-=48)
     ctx.drawImage(slope,x-23,3,46,48,x-23,y,46,48);
   }
   ctx.drawImage(slope,0,0,slopeArt.width,slopeArt.height);
   ctx.restore();
  }
  // Coordinates are on a half-size study of the original 1024 × 1536 ink
  // plate. The leaf turns on the two hinge barrels already drawn at x=135.
  function gateLeaf(){
   const sheet=document.createElement('canvas'),zoom=2.5;
   sheet.width=208*zoom;sheet.height=272*zoom;
   const g=sheet.getContext('2d');
   g.scale(zoom,zoom);g.translate(-133,-388);
   g.lineCap='round';g.lineJoin='round';
   const dark='#1b1b1b',silver='#efefec';
   function draw(d,fill,outline=dark,weight=2){
    const p=new Path2D(d);
    if(fill){g.fillStyle=fill;g.fill(p);}
    if(outline){g.strokeStyle=outline;g.lineWidth=weight;g.stroke(p);}
   }
   // An open gallery around the duck's face, with forged spear tips and
   // unequal paper glints on the blackened round stock.
   for(const [x,cap] of [[169,425],[198,407],[269,403],[298,422]]){
    draw('M'+(x-2.4)+' '+cap+' Q'+(x-1)+' '+(cap+56)+' '+(x-2.5)+' 645 L'+(x+2.5)+' 645 Q'+(x+1.7)+' '+(cap+62)+' '+(x+2.2)+' '+cap+'Z',dark,null);
    draw('M'+(x-.95)+' '+(cap+9)+' Q'+(x-.2)+' 505 '+(x-.85)+' 617',null,'#d9d9d5',1.25);
   }
   // Narrow upper and lower straps are rolled iron, continuous with the
   // engraved trim on the fixed arch; the lattice between stays transparent.
   draw('M146 480 C146 431 184 394 231 393 C277 392 315 425 318 472 L319 644 Q237 653 146 644Z M152 638 Q237 646 312 638 L311 473 C308 431 275 400 231 401 C189 402 154 435 153 481Z',silver);
   draw('M150 638 L149 485 Q149 431 188 410 M245 398 C280 404 307 431 314 461 M315 481 L316 628',null,'#5a5a57',1);
   draw('M152 636 Q235 642 311 635 L313 644 Q229 653 151 643Z','#dededb',dark,2);
   draw('M153 641 Q207 644 238 645 Q277 644 306 640',null,'#fafaf8',1.5);
   // Bent-wire lyres welded to the kick plate echo the scrolls on the crown.
   for(const [origin,dir] of [[154,1],[311,-1]]){
    g.save();g.translate(origin,634);g.scale(dir,1);
    draw('M0 1 Q13 -1 19 -12 C28 -34 33 -46 45 -47 C58 -48 61 -30 49 -26 C41 -23 36 -29 39 -35 C41 -39 45 -39 49 -36 C47 -45 37 -44 30 -32 C20 -15 22 -2 15 2Z',dark,null);
    draw('M21 -15 C29 -34 31 -42 40 -45',null,'#bebeba',1);
    g.restore();
   }
   // A bolted keeper, hasp and rounded key plate sit just below the original
   // cage eye. The can pulls the hasp towards the two existing knuckles.
   draw('M279 511 Q289 508 302 511 L315 509 Q323 508 329 514 L331 520 Q327 526 320 526 L281 528 Q278 523 279 511Z',silver);
   draw('M282 524 L318 522 Q325 522 329 517',null,'#626260',1.2);
   draw('M298 519 C298 512 308 509 311 517 L311 527 L307 529 L307 518 C306 515 302 515 302 520 L302 530 L298 531Z','#dadad7');
   draw('M293 526 Q304 521 316 526 L316 539 Q312 547 306 550 Q299 548 294 542Z','#dfdfdc');
   draw('M295 540 Q305 551 314 538 L314 532',null,'#555552',1.3);
   draw('M303 533 C303 529 310 529 310 533 Q310 535 308 536 L309 540 L304 540 L305 536 Q303 535 303 533Z',dark,null);
   for(const [x,y] of [[150,615],[315,615],[167,641],[298,642],[284,518],[321,517]]){
    g.beginPath();g.ellipse(x,y,2.5,2.8,.15,0,Math.PI*2);g.fillStyle=dark;g.fill();
    g.beginPath();g.ellipse(x-.65,y-.9,.9,.65,-.4,0,Math.PI*2);g.fillStyle=silver;g.fill();
   }
   return sheet;
  }
  let gate;
  function openCage(ctx,w,h,base){
   const rescued=w.done||w.flags.rescued;
   const lastStep=w.flags.descendedToCage?Math.max(0,Math.min(1,(w.actor.x-w.goal.x+48)/48)):0;
   const opening=rescued?1:reduced?0:lastStep*lastStep*(3-2*lastStep);
   const height=h*.93,width=height*2/3,center=259,top=base-height,left=center-width/2;
   if(paintDuck&&!rescued)paintDuck(ctx,center,base-height*.15,height*.34,0,'idle');
   if(ready(cage)){
    ctx.save();ctx.filter='grayscale(1)';ctx.drawImage(cage,left,top,width,height);ctx.restore();
   }
   gate??=gateLeaf();
   ctx.save();ctx.translate(left,top);ctx.scale(width/480,height/720);
   ctx.translate(135,0);
   const angle=opening*1.94;
   ctx.transform(Math.cos(angle),Math.sin(angle)*.12,0,1,0,0);
   ctx.drawImage(gate,-2,388,208,272);
   ctx.restore();
   if(paintDuck&&rescued)paintDuck(ctx,center-width*.71,base,height*.34,0,'dance');
  }
  return function(ctx,w,cameraX,time,slot,view){
   const type=w.route[slot],h=view.height;
   const phase=w.elapsed>0?w.elapsed:time/1000;
   const profile=deck(slot,type,h,!!w.flags.bridgeLocked,phase,reduced);
   const base=profile.point(200).y;
   ctx.save();ctx.translate(slot*W.P-cameraX,0);
   if(type!=='cageExit'){
    ctx.fillStyle='#f2f2f2';ctx.fillRect(view.left,view.top,view.width,h);
   }
   root.OpeningScenicInk?.paint(ctx,type,view);
   if(type==='startHigh'||type==='bridgeLock')woodFloor(ctx,base-h*.11,h);
   if(type==='bridgeLock')lock(ctx,w,slot,h,base,view.minActorHeight,false);
   if(type==='ropeBridge')suspended(ctx,w,h,profile);
   if(type==='ropeSlope')incline(ctx,h,profile);
   if(type==='cageExit'){
    openCage(ctx,w,h,base);
    root.OpeningStageMarks.draw(ctx,stageX(slot,w.goal.localX),base+2,.66);
   }
   if(Math.floor(w.actor.x/W.P)===slot){
    const p=actorPoint(w,slot,W,h,profile,view.minActorHeight);
    ctx.fillStyle='#19191940';ctx.beginPath();
    ctx.ellipse(p.x,p.ground,p.height*.235,p.height*.033,p.pathAngle,0,Math.PI*2);ctx.fill();
    ctx.save();ctx.translate(p.x,p.y-p.height/2);
    if(p.flip&&!reduced)ctx.rotate(p.flip);
    const settings={x:0,y:p.height/2,height:p.height,angle:w.actor.angle,anchor:'ground',
      pose:{depth:type==='ropeBridge'||type==='ropeSlope'?.30:.16,pathAngle:p.pathAngle}};
    if(!can?.draw(ctx,settings)&&ready(canArt)){
     // The approved PNG includes clear margin above and below its seam.
     const width=p.height*881/1488;
     ctx.drawImage(canArt,0,77,881,1488,-width/2,-p.height/2,width,p.height);
    }
    ctx.restore();
   }
   if(type==='bridgeLock')lock(ctx,w,slot,h,base,view.minActorHeight,true);
   ctx.restore();
  };
 }
 const api={slots,layout,camera,contains,deck,actorPoint,playableLocalX,stageX,decorate,resize,create};
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.OpeningLevelTwo=api;
})(typeof window!=='undefined'?window:globalThis);

;
(function(root){
  'use strict';
  const W=root.ComicWorld||(typeof require==='function'?require('./world.js'):null);
  // Each string follows one frame around the 1000 × 560 drawing. Array order
  // is the reading order indicated by the red numbers, independent of the scene.
  const drawings=[
    [
      'M15 34 L167 34 L334 524 L18 524 Z',
      'M209 34 L564 34 L564 226 L262 226 Z',
      'M610 158 C613 88 708 34 831 32 C911 30 967 62 973 116 C978 178 877 243 754 249 C663 253 602 225 610 158 Z',
      'M342 375 C366 307 458 258 562 258 C656 258 696 294 699 356 C700 415 648 491 580 515 C519 537 436 538 394 512 C365 495 330 423 342 375 Z',
      'M765 278 L982 278 L982 523 L663 523 Z'
    ],
    [
      'M14 15 L315 15 L315 276 L14 343 Z',
      'M364 15 L704 15 L704 191 L364 265 Z',
      'M746 15 L984 15 L984 131 L746 182 Z',
      'M14 378 L299 315 L299 542 L14 542 Z',
      'M337 306 L616 245 L616 542 L337 542 Z',
      'M661 235 L984 164 L984 542 L661 542 Z'
    ],
    [
      'M14 17 L294 17 L294 263 L14 263 Z',
      'M315 17 L717 17 L555 263 L315 263 Z',
      'M742 17 L984 17 L984 263 L580 263 Z',
      'M14 290 L417 290 L255 536 L14 536 Z',
      'M442 290 L650 290 L650 536 L280 536 Z',
      'M671 290 L984 290 L984 536 L671 536 Z'
    ],
    [
      'M14 17 L305 17 C335 85 335 195 305 263 L14 263 Z',
      'M329 17 L649 17 L649 263 L329 263 C359 195 359 85 329 17 Z',
      'M671 17 L984 17 L984 263 L671 263 Z',
      'M14 290 L327 290 L327 536 L14 536 Z',
      'M349 290 L694 290 C658 346 637 428 637 536 L349 536 Z',
      'M719 290 L984 290 L984 536 L661 536 C661 428 682 346 719 290 Z'
    ]
  ];
  function shape(path,id){
    const commands=Array.from(path.matchAll(/([MLQCZ])([^MLQCZ]*)/g),match=>({
      op:match[1],values:match[2].trim()?match[2].trim().split(/\s+/).map(Number):[]
    }));
    const xs=[],ys=[];
    for(const {values} of commands)for(let i=0;i<values.length;i+=2){xs.push(values[i]);ys.push(values[i+1]);}
    const left=Math.min(...xs),top=Math.min(...ys),width=Math.max(...xs)-left,height=Math.max(...ys)-top;
    const normalized=commands.map(({op,values})=>({op,values:values.map((value,i)=>i%2?(value-top)/height:(value-left)/width)}));
    const percent=n=>Number((n*100).toFixed(4));
    const outline=normalized.map(({op,values})=>op+values.map(percent).join(' ')).join(' ');
    const edge=[];
    for(const {op,values:v} of normalized){
      if(op==='M'||op==='L')edge.push([v[0],v[1]]);
      if(op==='Q'||op==='C'){
        const [x,y]=edge[edge.length-1];
        for(let n=1;n<=20;n++){
          const t=n/20,s=1-t;
          if(op==='Q')edge.push([s*s*x+2*s*t*v[0]+t*t*v[2],s*s*y+2*s*t*v[1]+t*t*v[3]]);
          else edge.push([s**3*x+3*s*s*t*v[0]+3*s*t*t*v[2]+t**3*v[4],s**3*y+3*s*s*t*v[1]+3*s*t*t*v[3]+t**3*v[5]]);
        }
      }
    }
    const clip='polygon('+edge.map(([x,y])=>percent(x)+'% '+percent(y)+'%').join(',')+')';
    return {id,mask:'polygon',rect:[left,top,width,height],outline,clip,edge};
  }
  function intersections(edge,y){
    const crosses=[];
    for(let i=0,j=edge.length-1;i<edge.length;j=i++){
      const [ax,ay]=edge[j],[bx,by]=edge[i];
      if((ay>y)!==(by>y))crosses.push(ax+(bx-ax)*(y-ay)/(by-ay));
    }
    return crosses.sort((a,b)=>a-b);
  }
  function inside(edge,x,y){
    if(x<0||x>1||y<0||y>1)return false;
    const cuts=intersections(edge,y);
    for(let i=0;i<cuts.length;i+=2)if(x>=cuts[i]&&x<=cuts[i+1])return true;
    return false;
  }
  // The fit uses the actual silhouettes and the stage surface, including the
  // crown of a jump. Decorative ropes and scenery can bleed past the frame.
  const props={
    start:[35,145,145,350],startHigh:[35,54,145,230],brace:[115,106,283,234],
    lowBridge:[55,227,347,350],counter:[97,174,339,353],pawl:[95,178,300,350],
    dragon:[73,74,323,246],cue:[137,64,342,230],upperPin:[108,148,290,322],
    lowerPin:[132,245,338,350],catch:[116,189,288,350],brake:[102,156,309,351],
    counterCargo:[68,136,310,350],load:[60,111,291,350],cargoBridge:[52,237,350,350]
  };
  // The tall wing is a foreground close-up. Keep its actor at one printed
  // scale throughout the shot, including when the player reverses or jumps.
  function playerHeight(level,type){
    return level===2&&type==='startHigh'?425:76;
  }
  function stageBands(level,type){
    const scene={route:[type],flags:{bridge:true}},floor=Math.max(W.pieces[type].input,W.pieces[type].output);
    const portrait=level===2&&type==='startHigh';
    const rows=new Map();
    function span(y,left,right){
      const row=rows.get(y);
      if(row){row[0]=Math.min(row[0],left);row[1]=Math.max(row[1],right);}
      else rows.set(y,[left,right]);
    }
    function box(left,top,right,bottom){
      for(let y=top;y<bottom;y+=10)span(y,left,right);
      span(bottom,left,right);
    }
    for(let x=0;x<=400;x+=20){
      const ground=Math.round(W.surface(scene,Math.min(399.9,x))??floor);
      const height=playerHeight(level,type),half=portrait?height*.35:24;
      box(x-half,ground-height-94,x+half,ground+3);
      if(level===5)box(x+16,ground-98,x+116,ground+6);
    }
    if(props[type])box(...props[type]);
    if(type==='goal'||type==='goalLow')box(242,floor-141,323,floor);
    return {floor,portrait,bands:Array.from(rows,([y,[left,right]])=>[y,left,right])};
  }
  const slices=256;
  function fitCamera(slot,scene,registeredStage){
    const width=slot.rect[2],height=slot.rect[3],inset=2.8;
    // Several printed contours have scallops. Their topmost rows contain two
    // disjoint spans. Keep the entire subject within one connected opening.
    function find(scale){
      for(let k=0;k<=(registeredStage?0:scene.portrait?6:100);k++){
        const baseline=.78+(k%2?1:-1)*Math.ceil(k/2)*.012;
        const origin=registeredStage?registeredStage.deckY-350*scale:baseline*height-scene.floor*scale;
        let low=-Infinity,high=Infinity;
        for(const [y,left,right] of scene.bands){
          const py=origin+y*scale;
          if(py<inset||py>height-inset){high=-Infinity;break;}
          const a=slot.sections[Math.floor((py-inset)/height*slices)];
          const b=slot.sections[Math.min(slices-1,Math.floor((py+inset)/height*slices))];
          low=Math.max(low,Math.max(a[0],b[0])*width+inset-left*scale);
          high=Math.min(high,Math.min(a[1],b[1])*width-inset-right*scale);
          if(low>high)break;
        }
        if(low<=high&&Number.isFinite(high)){
          return {scale,left:Math.max(low,Math.min(high,width/2-200*scale)),top:-origin/scale};
        }
      }
      return null;
    }
    if(registeredStage){
      const fit=find(registeredStage.scale);
      if(fit)return fit;
    }
    let lo=0,hi=registeredStage?.scale??1.35,fit=null;
    for(let i=0;i<18;i++){
      const mid=(lo+hi)/2,tryFit=find(mid);
      if(tryFit){lo=mid;fit=tryFit;}else hi=mid;
    }
    return fit;
  }
  function makePage(paths,level){
    const slots=paths.map((path,i)=>{
      const s=shape(path,'level-'+(level+1)+'-frame-'+(i+1));
      s.sections=Array.from({length:slices},(_,n)=>{
        const x=intersections(s.edge,(n+.5)/slices);let left=1,right=0;
        for(let i=0;i+1<x.length;i+=2)if(x[i+1]-x[i]>right-left){left=x[i];right=x[i+1];}
        return [left,right];
      });
      return s;
    });
    const stages=slots.map(({rect},index)=>{
      if(level===3){
        // The diagonal gutters give each frame a different height. Register
        // the boards to the page itself so a swap cannot move the horizon.
        const upperRow=index<3;
        const scale=upperRow ? .51 : .60;
        return {scale,deckY:(upperRow ? 125 : 518)-rect[1]};
      }
      return level===4||level===5?{scale:.52,deckY:.83*rect[3]}:null;
    });
    const cameras=slots.map(()=>new Map());
    function getCamera(slot,type){
      const cache=cameras[slot];
      if(!cache.has(type))cache.set(type,fitCamera(slots[slot],stageBands(level,type),stages[slot]));
      return cache.get(type);
    }
    return {slots,
      prepareSwaps(types,signal){
        if(!root.requestIdleCallback||!signal)return;
        const pairs=[];
        for(let n=1;n<slots.length-1;n++)for(const type of types)if(!cameras[n].has(type))pairs.push([n,type]);
        let call;
        function fill(deadline){
          if(signal.aborted)return;
          while(pairs.length&&deadline.timeRemaining()>4)getCamera(...pairs.pop());
          if(pairs.length)call=root.requestIdleCallback(fill);
        }
        if(pairs.length){
          call=root.requestIdleCallback(fill);
          signal.addEventListener('abort',()=>root.cancelIdleCallback(call),{once:true});
        }
      },
      layout(width,height){
        const scale=Math.min(width/1000,height/560),left=(width-scale*1000)/2,top=(height-scale*560)/2;
        return slots.map(s=>({id:s.id,mask:s.mask,clip:s.clip,x:left+s.rect[0]*scale,y:top+s.rect[1]*scale,w:s.rect[2]*scale,h:s.rect[3]*scale}));
      },
      contains(slot,x,y){return inside(slots[slot].edge,x,y);},
      camera(slot,type,width,height){
        const s=slots[slot],c=getCamera(slot,type),factor=Math.min(width/s.rect[2],height/s.rect[3]);
        return {scale:c.scale*factor,left:c.left*factor+(width-s.rect[2]*factor)/2,top:c.top-(height-s.rect[3]*factor)/(2*c.scale*factor)};
      },
      playableLocalX(slot,x){return x;}
    };
  }
  const pages=drawings.map((paths,i)=>makePage(paths,i+2));
  const api={forLevel:index=>pages[index-2]??null,playerHeight};
  if(typeof module==='object'&&module.exports)module.exports=api;
  root.OpeningLaterLayouts=api;
})(typeof window!=='undefined'?window:globalThis);

;
(function(root){
  'use strict';
  const ink='#1c1c1c',paper='#f2f2f0',mid='#a6a6a4',red='#852f31',tau=Math.PI*2;
  const clamp=x=>Math.max(0,Math.min(1,x));
  const ease=x=>{const t=clamp(x);return t*t*(3-2*t);};
  const paths=new Map();
  function path(d){let p=paths.get(d);if(!p){p=new Path2D(d);paths.set(d,p);}return p;}
  function shape(c,d,fill=paper,stroke=ink,width=2){
    const p=path(d);if(fill){c.fillStyle=fill;c.fill(p);}
    if(stroke){c.strokeStyle=stroke;c.lineWidth=width;c.stroke(p);}
  }
  function line(c,x,y,u,v,color=ink,width=2){
    c.beginPath();c.moveTo(x,y);c.lineTo(u,v);c.strokeStyle=color;c.lineWidth=width;c.stroke();
  }
  function oval(c,x,y,rx,ry,fill=paper,stroke=ink,w=1.5){
    c.beginPath();c.ellipse(x,y,rx,ry,0,0,tau);
    if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=w;c.stroke();}
  }
  function bolt(c,x,y,r=3){oval(c,x,y,r,r,paper,ink,1);line(c,x-r*.45,y+r*.45,x+r*.45,y-r*.45,ink,.9);}
  // The stage crew paints matching marks directly onto wood and iron.
  const triangleStamp='M-.52 .38 L-.08 -.49 L.01 -.49 L-.25 .15 L.24 .15 L.01 -.28 L.085 -.45 L.54 .38Z';
  const slashStamp='M-.48 .37 L-.24 -.39 L-.04 -.39 L-.28 .37Z M-.12 .37 L.13 -.39 L.34 -.39 L.09 .37Z';
  function paintMark(c,x,y,size,triangle,tilt=0,color=red){
    c.save();c.translate(x,y);c.rotate(tilt);c.scale(size,size);
    shape(c,triangle?triangleStamp:slashStamp,color,null);c.restore();
  }
  function orderSlip(){
    // A thumbtacked slip of rag paper. The black return under the turned
    // corner and its engraved hatching belong to the contour of the sheet.
    return `<svg viewBox="0 0 360 204" aria-hidden="true" focusable="false">
      <defs><pattern id="cue-slip-screen" width="3.4" height="3.4" patternUnits="userSpaceOnUse"><circle cx="1.15" cy="1.1" r=".52" fill="#464646"/></pattern></defs>
      <path fill="#242424" d="M13 19Q75 22 137 18L192 15Q268 12 335 18Q329 72 338 121L343 154Q329 179 306 189Q251 187 195 188L171 188L167 185L160 189L124 188Q70 187 18 195Q11 154 12 109Q17 51 13 19Z"/>
      <path fill="#f7f7f6" stroke="#242424" stroke-width="2" stroke-linejoin="round" d="M10 16Q80 20 138 16L193 13Q258 10 331 16Q325 73 333 119L339 151Q321 173 304 183Q256 181 208 183L172 184L169 181L162 186L139 184Q77 182 15 190Q9 152 9 108Q14 51 10 16Z"/>
      <path fill="url(#cue-slip-screen)" d="M12 16Q72 21 140 16L194 13Q266 11 330 17L330 20Q260 16 198 17Q107 23 16 20Q18 52 13 80Q14 45 12 16ZM17 183Q83 175 146 180L161 181L166 179L162 185L141 183Q78 180 15 189Z"/>
      <g fill="none" stroke="#686868" stroke-linecap="round">
        <path stroke-width=".82" d="M18 22Q55 24 79 22M97 20L120 20M175 18Q207 15 228 16M14 96Q11 114 13 130M19 184Q50 179 65 180M114 181L132 181M186 181Q210 179 225 180"/>
        <path stroke-width=".73" d="M17 167l-3 6m5-3-4 8m6-7-4 9m5-6-2 5m5-4-1 3"/>
      </g>
      <path fill="#a5a5a5" stroke="#242424" stroke-width="1.6" d="M304 183Q315 168 311 158Q325 161 339 151Q328 171 304 183Z"/>
      <path fill="none" stroke="#424242" stroke-width=".95" d="m314 162 5-1m-5 4 10-4m-10 8 15-8m-16 12 14-9m-16 13 9-6"/>
      <path fill="#262626" d="M153 22q7-7 15-4l7 4q6 5-5 8l-14 2q-11-3-3-10Z"/>
      <path fill="#d8d8d7" stroke="#242424" stroke-width="1.6" d="m159 18 7-3 6 7q-5 6-11 5l-4-6Z"/>
      <ellipse cx="160" cy="17" rx="10" ry="6.1" transform="rotate(-17 160 17)" fill="#ededeb" stroke="#242424" stroke-width="2.4"/>
      <path fill="none" stroke="#575757" stroke-width="1.2" stroke-linecap="round" d="m154 17 9-3m-3 5 6-2m-3 7 3-4m0 4 3-3"/>
      <g fill="#212121">
        <path transform="translate(88 107) rotate(-4) scale(70)" d="${triangleStamp}"/>
        <path d="M142 104Q168 107 201 101L192 95Q188 92 191 91Q197 92 209 98L217 102Q207 109 197 118Q192 119 194 115L202 106Q169 113 144 109Q141 108 142 104Z"/>
        <path transform="translate(273 105) rotate(3) scale(76)" d="${slashStamp}"/>
      </g>
    </svg>`;
  }
  function peg(c,x,y,s=1){
    c.save();c.translate(x,y);c.scale(s,s);
    shape(c,'M-6 3 Q-8 -2 -5 -5 L2 -9 Q6 -10 8 -6 L8 -2 L1 3 Q-2 5 -6 3Z','#bbb');
    oval(c,-1,0,5.3,3.8,paper,ink,1.3);line(c,-4,1,2,-2,ink,1);c.restore();
  }
  function beam(c,x1,y1,x2,y2,width,shade='#c8c8c6'){
    const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);if(len<1)return;
    c.save();c.translate(x1,y1);c.rotate(Math.atan2(dy,dx));const r=width/2;
    c.beginPath();c.moveTo(0,-r);c.lineTo(len,-r);c.lineTo(len+1,r-1);c.lineTo(0,r);c.closePath();
    c.fillStyle=shade;c.fill();c.strokeStyle=ink;c.lineWidth=2.1;c.stroke();
    c.strokeStyle='#525252';c.lineWidth=.85;c.beginPath();
    c.moveTo(4,-r*.56);c.bezierCurveTo(len*.24,-r*.13,len*.55,-r*.65,len-5,-r*.44);
    c.moveTo(len*.19,r*.42);c.quadraticCurveTo(len*.48,r*.05,len*.72,r*.40);
    c.moveTo(len*.79,r*.48);c.lineTo(len-4,r*.42);c.stroke();
    if(len>65){oval(c,len*.31,-r*.17,5.5,1.4,null,'#595959',.8);bolt(c,6,0,2.1);bolt(c,len-6,0,2.1);}
    c.restore();
  }
  function rope(c,x1,y1,x2,y2,width=3.3){
    line(c,x1,y1,x2,y2,ink,width+1.4);line(c,x1,y1,x2,y2,'#ebebe9',width-.4);
    const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy);if(!len)return;
    c.save();c.translate(x1,y1);c.rotate(Math.atan2(dy,dx));
    c.strokeStyle='#454545';c.lineWidth=.8;c.beginPath();
    for(let x=2;x<len-1;x+=5){c.moveTo(x,-width*.49);c.lineTo(x+1.9,width*.49);}c.stroke();c.restore();
  }
  function sheave(c,x,y,r,angle=0){
    oval(c,x+2,y+2,r,r,'#454545',ink,2);oval(c,x,y,r,r,paper,ink,2.3);
    oval(c,x,y,r*.76,r*.76,'#71716f',ink,1.2);
    c.save();c.translate(x,y);c.rotate(angle);for(let i=0;i<5;i++){
      c.rotate(tau/5);line(c,r*.20,0,r*.68,0,ink,4);line(c,r*.23,-.6,r*.64,-.6,paper,1.2);}
    c.restore();bolt(c,x,y,r*.20);
  }
  function accents(c,x,y,s=1,dir=1){
    c.save();c.translate(x,y);c.scale(s*dir,s);
    shape(c,'M2 -13 Q7 -22 10 -23 Q12 -20 4 -12Z M8 -7 Q20 -16 22 -14 Q21 -10 9 -5Z M12 0 Q22 -3 25 -1 Q23 2 12 2Z',ink,null);c.restore();
  }
  function nominalFloor(type,x,W){
    const p=W.pieces[type];
    if(type==='ramp')return 350-120*clamp((x-45)/310);
    if(type==='down'||type==='upperPin')return 230+120*clamp((x-90)/240);
    return p.input;
  }
  function trestle(c,x,y,bottom){
    if(bottom<=y+5)return;
    beam(c,x-12,y-1,x-18,bottom+12,10,'#a8a8a6');beam(c,x+24,y+1,x+34,bottom+12,11,'#bababa');
    beam(c,x+31,bottom+1,x-8,y+13,8,'#a6a6a5');beam(c,x-22,y+2,x+32,y+4,11,'#ddd');
  }
  function planks(c,left,right,floor,wood){
    // Each far edge recedes towards the same side of the frame. The physics
    // surface is safely within the top board, slightly behind the near lip.
    const partition=[left];for(let x=Math.ceil((left+1)/42)*42;x<right;x+=42)partition.push(x);partition.push(right);
    for(let i=0;i<partition.length-1;i++){
      const a=partition[i],b=partition[i+1],y=floor(a),z=floor(b),depth=19;
      c.beginPath();c.moveTo(a,y+4);c.lineTo(b,z+4);c.lineTo(b+depth,z-16);c.lineTo(a+depth,y-16);c.closePath();
      c.fillStyle=(Math.abs(Math.floor(a/42))%3===1?'#dededc':'#ececea');c.fill();
      if(wood){
        c.save();c.clip();c.globalAlpha=.5;c.transform(1,(z-y)/(b-a),-.95,1,a,y-16);
        const ix=Math.abs(Math.floor(a*3.9))%(wood.naturalWidth-170);
        c.drawImage(wood,ix,wood.naturalHeight*.36,165,85,0,0,b-a+39,24);c.restore();
      }
      c.lineWidth=1.35;c.strokeStyle=ink;c.stroke();
      c.beginPath();c.moveTo(a,y+4);c.lineTo(b,z+4);c.lineTo(b,z+13);c.lineTo(a,y+13);c.closePath();
      c.fillStyle='#969694';c.fill();c.strokeStyle=ink;c.lineWidth=1.5;c.stroke();
      if(b-a>14){const nx=a+7;oval(c,nx,floor(nx),1.5,.85,ink,null);line(c,a+4,y+9,b-4,z+8,'#5a5a59',.85);}
    }
  }
  function create({W,asset,reduced=false}){
    function load(key){const im=new Image(),src=asset(key);if(src)im.src=src;return im;}
    const ready=im=>im?.complete&&im.naturalWidth>0;
    const backdrops=[3,4,5].map(i=>load('later-v51/chapter-0'+i+'.webp'));
    backdrops.push(load('chapter-sets-v55/loading-gallery.webp'));
    const stageEntrance=load('chapter-sets-v55/stage-entrance.webp');
    const dragonPrint=load('stories-v32/chapter-04.webp');
    const wood=load('theatre-v33/wood-floor.webp');
    const canImage=load('theatre-v45/can.png'),canSrc=asset('theatre-v45/can.png');
    const can=canSrc&&root.OpeningCanRenderer?.get(canSrc);can?.ready.catch(()=>{});
    const ducks=[load('cast-v28/left-idle.webp'),load('cast-v28/right-idle.webp')];
    const duckWalk=load('later-v51/uniform-duck-walk-v67.webp');
    let sceneClockStart;
    let lastWorld=null,events={};
    function elapsedEvent(w,name,on=w.flags[name]){
      if(!on){delete events[name];return -1;}
      if(events[name]===undefined)events[name]=w.elapsed;
      return Math.max(0,w.elapsed-events[name]);
    }
    const plates=new Map();
    // Each subject gets a camera position in the original panoramic painting.
    // [centre x, centre y, maximum source width, maximum source height].
    // A wheel, pipe organ or cargo stack appears in its one establishing shot.
    const shots=[
      {startHigh:[.105,.43,.21,.82],brace:[.285,.43,.25,.82],down:[.47,.43,.25,.82],lowBridge:[.65,.43,.25,.82],goalLow:[.862,.43,.27,.82]},
      {start:[.134,.46,.39,.86],counter:[.579,.28,.31,.65],pawl:[.858,.55,.31,.65],ramp:[.367,.28,.36,.65],dragon:[.505,.48,.34,.68],goal:[.535,.56,.48,.96]},
      null, // The opera stage uses a single registered rear wall across the six panels.
      {start:[.09,.42,.26,.72],counterCargo:[.286,.30,.26,.61],load:[.443,.52,.26,.70],brake:[.622,.48,.24,.75],cargoBridge:[.822,.39,.32,.78],goalLow:[.52,.50,1,1]}
    ];
    function plateFor(w,type){
      return w.index===5&&type==='goalLow'?stageEntrance:backdrops[w.index-2];
    }
    function backdrop(c,w,slot,v){
      c.fillStyle=w.index===2?'#f8f7f4':'#f1f1ef';c.fillRect(v.left,v.top,v.width,v.height);
      const type=w.route[slot];
      const plate=plateFor(w,type);if(!ready(plate))return;
      const iw=plate.naturalWidth,ih=plate.naturalHeight;
      if(w.index===4){
        // One backcloth at one height. Follow the crew's route from the dressing
        // mirrors, across the stage, to the organ. Moving the scene carries its
        // view with it, including when a diagonal frame changes the camera crop.
        const sceneIndex=['startHigh','cue','upperPin','catch','lowerPin','goalLow'].indexOf(type);
        const page=root.OpeningLaterLayouts.forLevel(4),rect=page.slots[sceneIndex].rect;
        const cam=page.camera(sceneIndex,type,rect[2],rect[3]);
        const first=page.slots[0].rect,last=page.slots[5].rect,rowWidth=last[0]+last[2]-first[0];
        const stageX=(sceneIndex<3?0:rowWidth)+rect[0]-first[0]+cam.left;
        const scale=2*rowWidth/(iw*cam.scale),left=-stageX/cam.scale;
        c.save();c.fillStyle='#fafafa';c.fillRect(v.left,v.top,v.width,v.height);
        c.globalAlpha=.37;c.drawImage(plate,left,-290,iw*scale,ih*scale);c.restore();
        return;
      }
      const [cx,cy,fw,fh]=shots[w.index-2][type];
      const factor=Math.max(v.width/(iw*fw),v.height/(ih*fh)),sw=v.width/factor,sh=v.height/factor;
      const sx=Math.min(iw-sw,Math.max(0,iw*cx-sw/2)),sy=Math.min(ih-sh,Math.max(0,ih*cy-sh/2));
      c.save();c.globalAlpha=w.index===2?.36:w.index===5&&type==='goalLow'?.87:.72;c.filter='grayscale(1) contrast(.88) brightness(1.07)';
      c.drawImage(plate,sx,sy,sw,sh,v.left,v.top,v.width,v.height);c.restore();
    }
    function staticPlate(c,w,slot,type,v){
      const hasArt=ready(plateFor(w,type))&&ready(wood);
      const key=[w.index,slot,type,v.left,v.top,v.width,v.height,v.scale].map(n=>typeof n==='number'?n.toFixed(2):n).join('/');
      let plate=plates.get(key);
      if(!plate&&hasArt&&typeof document!=='undefined'){
        const pix=Math.max(.6,Math.min(2, v.scale||1)),canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(v.width*pix));canvas.height=Math.max(1,Math.round(v.height*pix));
        const g=canvas.getContext('2d');g.imageSmoothingQuality='high';g.scale(canvas.width/v.width,canvas.height/v.height);g.translate(-v.left,-v.top);
        paintSet(g,w,slot,type,v);if(plates.size>36)plates.clear();plates.set(key,plate=canvas);
      }
      if(plate)c.drawImage(plate,v.left,v.top,v.width,v.height);else paintSet(c,w,slot,type,v);
    }
    function paintSet(c,w,slot,type,v){
      backdrop(c,w,slot,v);c.lineCap='round';c.lineJoin='round';
      if(type==='lowBridge'||type==='cargoBridge')return;
      const floor=x=>nominalFloor(type,x,W),l=Math.min(v.left-26,0),r=Math.max(v.right,400)+8;
      if(type==='ramp'||type==='down'||type==='upperPin'){
        for(let x=Math.floor(l/140)*140;x<r;x+=140)trestle(c,x,floor(x)+6,v.bottom);
      }else{
        // The boarded theatre apron has real depth below the walking plane.
        // Its keyed joints, footings and dark recess tie the surface to the stage.
        c.beginPath();c.moveTo(l,floor(l)+9);c.lineTo(r,floor(r)+9);
        c.lineTo(r,v.bottom+5);c.lineTo(l,v.bottom+5);c.closePath();c.fillStyle='#696968';c.fill();
        for(let x=Math.floor(l/92)*92;x<r;x+=92){
          const y=floor(x)+16,base=Math.max(y+30,v.bottom+2);
          c.fillStyle=Math.floor(x/92)%2?'#a9a9a7':'#b7b7b5';c.fillRect(x+2,y,89,base-y);
          if(ready(wood)){
            // Sample one board at a time from the original stage engraving.
            // Vary the grain and nail heads at each vertical tongue-and-groove joint.
            const panel=Math.abs(Math.floor(x/92)+29),srcX=8+(panel*187)%(wood.naturalWidth-101);
            const span=Math.max(8,Math.min(wood.naturalHeight-170,(base-y)*2.8));
            const srcY=(panel*107)%Math.max(1,Math.floor(wood.naturalHeight-span));
            c.save();c.globalCompositeOperation='multiply';c.globalAlpha=.57;c.filter='grayscale(1)';
            c.drawImage(wood,srcX,srcY,90,span,x+2,y,89,base-y);c.restore();
          }
          c.fillStyle='#565654';c.fillRect(x+2,y,89,2.8);
          line(c,x+1,y,x+1,base,'#343434',1.7);
          line(c,x+4,y+2,x+4,base,'#d9d9d6',1);
          c.beginPath();c.moveTo(x+24,y+5);c.bezierCurveTo(x+29,y+24,x+16,base-18,x+24,base);
          c.moveTo(x+69,y+13);c.quadraticCurveTo(x+61,base-18,x+67,base-3);c.strokeStyle='#858584';c.lineWidth=.85;c.stroke();
          bolt(c,x+9,y+5,1.7);bolt(c,x+81,y+5,1.7);
        }
      }
      if(type==='ramp'||type==='down'||type==='upperPin'){
        // The hidden knee braces make the height change read as a built stage ramp.
        beam(c,76,floor(76)+14,204,floor(204)+76,10,'#888');
        beam(c,212,floor(212)+80,322,floor(322)+13,10,'#aaa');
      }
      if(w.index===2&&type==='startHigh'){
        // On the near side of the mill stage these boards and their nails
        // share the can's close-up, while the rail stands on the far edge.
        const near=2.7,walk=floor(0);
        c.save();c.translate(0,walk);c.scale(near,near);
        planks(c,l/near,r/near,()=>0,ready(wood)?wood:null);c.restore();
      }else planks(c,l,r,floor,ready(wood)?wood:null);
      const opening=duckPassage(w,slot,type,v);
      if(opening)paintPassage(c,opening);
    }
    function duckPassage(w,slot,type,v){
      if(w.index!==3||!(type==='start'||type==='goal'))return null;
      const rect=root.OpeningLaterLayouts.forLevel(3).slots[slot].rect;
      const units=v.height/rect[3],printedHeight=(slot===5?49:41)*units;
      const h=Math.max(printedHeight,24.5/v.scale);
      const top=v.top+((slot===5?469:175)-rect[1])*units-(h-printedHeight)*.5;
      const foot=top+h;
      return {left:v.left+v.width*.048,right:v.right-v.width*.043,top,foot,h:foot-top,
        section:type==='start'?0:1};
    }
    function paintPassage(c,{left,right,top,foot,h}){
      const width=right-left;
      c.save();c.fillStyle='#292927';c.fillRect(left,top,width,h);
      const depth=h*.17;
      c.fillStyle='#66645f';c.fillRect(left+depth,top+depth,width-2*depth,h-depth);
      for(let x=left+depth+14;x<right-depth;x+=78){
        line(c,x,top+depth,x,foot-2,'#52514d',2.1);
        for(let k=0;k<3;k++)line(c,x-4-k*4,top+depth+2,x-9-k*4,top+depth+9,'#50504c',1);
      }
      c.beginPath();c.moveTo(left+3,foot);c.lineTo(left+depth,foot-depth*.62);
      c.lineTo(right-depth,foot-depth*.62);c.lineTo(right-3,foot);c.closePath();c.fillStyle='#8b8980';c.fill();
      for(let x=left+depth+16;x<right-depth;x+=77)line(c,x,foot-depth*.6,x-depth*.48,foot,'#676660',1.1);
      line(c,left+depth,top+depth,left+depth,foot-depth*.62,'#88857d',1);
      line(c,right-depth,top+depth,right-depth,foot-depth*.62,'#44433e',1.2);
      beam(c,left-4,top-1,right+4,top-1,7,'#b9b7ae');
      beam(c,left+1,top+2,left+1,foot,8,'#a7a59e');
      beam(c,right-1,top+2,right-1,foot,8,'#a7a59e');
      beam(c,left-4,foot+3,right+4,foot+3,8,'#c1bfb7');c.restore();
    }
    function walkingDucks(c,opening,seconds){
      if(!opening||seconds==null||!ready(duckWalk))return;
      const {left,right,top,foot,h,section}=opening;
      const cell=duckWalk.naturalWidth/4,drawH=h*.80,drawW=drawH*cell/duckWalk.naturalHeight;
      // The four birds enter in order only after the demonstration. The
      // stretch under the machinery is hidden before the first one reappears.
      const stride=reduced?.64:(seconds*.18)%3.49-.12;
      c.save();c.beginPath();c.rect(left+5,top+3,right-left-10,h-3);c.clip();
      for(let bird=0;bird<4;bird++){
        const position=stride-bird*.155-section*1.74;
        if(position<-.10||position>1.10)continue;
        const x=left+(right-left)*position;
        const frame=reduced?0:Math.floor(seconds*6.8+bird*1.42)%4;
        oval(c,x,foot-.7,drawW*.29,drawH*.029,'#343431',null);
        c.drawImage(duckWalk,frame*cell,0,cell,duckWalk.naturalHeight,x-drawW/2,foot-drawH+drawH*.03,drawW,drawH);
      }
      c.restore();
    }
    function duck(c,x,foot,height,kind,motion,t,flip=false){
      const key=(kind?'right':'left')+'-'+motion;
      const frame=root.OpeningCast?.frame(key,reduced?0:t*1000)||0;
      if(root.OpeningCast?.paint(c,key,frame,x-height*.51,foot-height,height*1.02,height,flip))return;
      const im=ducks[kind];if(!ready(im))return;
      const ratio=im.naturalWidth/im.naturalHeight;c.save();c.translate(x,foot);if(flip)c.scale(-1,1);
      c.drawImage(im,-height*ratio*.5,-height,height*ratio,height);c.restore();
    }
    function shadow(c,x,y,r){oval(c,x,y+1,r,Math.max(2,r*.12),'#26262642',null);}
    function riverFish(c,v,seconds){
      const water=Math.min(419,v.bottom-11),phase=(seconds+.35)%4.4;
      if(water<363)return;
      c.save();c.translate(292,water);
      shape(c,'M-33 3 Q-24 0 -15 3 T1 3 M5 4 Q13 1 20 3 M22 1 L31 0',null,'#706e67',1.6);
      if(reduced){
        shape(c,'M-1 2 Q2 -5 8 -8 L7 2Z','#77766f',ink,1.2);
      }else if(phase<1.28){
        const t=phase/1.28,arc=4*t*(1-t),height=water-294;
        const size=Math.min(2.6,Math.max(1.12,25/(44*v.scale)));
        c.save();c.beginPath();c.rect(-72,-height-25*size,144,height+25*size+2);c.clip();
        c.translate(-18+36*t,15-height*arc);
        c.rotate(-1.13+2.26*t);c.scale(size,size);
        shape(c,'M-13 -2 L-23 -10 L-21 -1 L-25 6 L-14 3Z','#88877e');
        shape(c,'M-11 -6 L-6 -15 L-2 -11 L2 -15 L4 -6Z','#797870');
        shape(c,'M-15 0 Q-10 -12 4 -11 Q15 -10 19 -4 L10 -1 L20 0 Q15 10 3 11 Q-9 11 -15 3Z','#d8d5c9');
        shape(c,'M7 0 L18 -4 L16 -1 L14 -2 L12 1 L10 0 L8 3Z',paper,ink,.8);
        oval(c,9,-6,3.3,3.1,paper,ink,1.1);oval(c,10,-5.8,1.6,1.8,ink,null);
        shape(c,'M2 -6 Q-2 -2 2 5 M-1 4 Q-7 8 -10 6',null,'#57564f',1.2);
        c.restore();
      }
      if(!reduced&&(phase<.23||(phase>1.12&&phase<1.49))){
        const exit=phase>1,age=exit?(phase-1.12)/.37:phase/.23;
        c.save();c.translate(exit?18:-18,0);c.globalAlpha=1-age;
        for(const [dx,dy] of [[-9,-7],[-3,-11],[8,-6]])line(c,dx*(1+age),dy-6*age,dx*1.18*(1+age),dy-3-6*age,'#52514a',1.4);
        c.restore();
      }
      c.restore();
    }
    function beamBridge(c,w,type,v,t,wedgeAge){
      const low=type==='lowBridge',f=w.flags,locked=low?f.wedge:f.bridge,y=350;
      const start=low?140:130,end=low?250:270,pivot=start;
      const l=Math.min(v.left-25,0),r=Math.max(v.right+5,400),flat=()=>y;
      for(const x of [60,low?240:286,369])trestle(c,x,y+6,v.bottom+12);
      // Safety ropes stand on the rear edge. The real jump gap interrupts both rails.
      function handrail(a,b){
        const startY=y-16;
        for(const x of [a,b]){beam(c,x+15,startY+2,x+16,startY-50,5.4,paper);bolt(c,x+16,startY-48,2.2);}
        c.beginPath();c.moveTo(a+16,startY-47);c.quadraticCurveTo((a+b)/2+16,startY-30,b+16,startY-47);
        c.lineWidth=3.5;c.strokeStyle=ink;c.stroke();c.lineWidth=1.2;c.strokeStyle=paper;c.stroke();
      }
      handrail(l+8,start-10);handrail(low?326:end+2,r-17);
      planks(c,l,start,flat,ready(wood)?wood:null);planks(c,end,low?260:r,flat,ready(wood)?wood:null);
      if(low)planks(c,325,r,flat,ready(wood)?wood:null);
      const settle=locked&&wedgeAge>=0&&wedgeAge<.65&&!reduced?.084*Math.sin(wedgeAge*22)*Math.exp(-6*wedgeAge):0;
      const swing=locked?settle:(reduced?.22:.22+.12*Math.sin(t*4.6));
      c.save();c.translate(pivot,y+5);c.rotate(swing);c.translate(-pivot,-y-5);
      beam(c,start+1,y+10,end-1,y+10,14,mid);planks(c,start,end,flat,ready(wood)?wood:null);c.restore();
      bolt(c,start,y+9,4.6);
      if(low&&locked){c.save();c.translate(start+13,y+16);shape(c,'M-12 2 L17 3 L13 -9 L-11 -1Z','#b9b9b8');c.restore();}
    }
    function woodWedge(c,w,t,age){
      const y=230,pos=age<0?0:ease(age/.51),spring=age>=0&&age<.51&&!reduced?Math.sin(Math.PI*pos):0;
      beam(c,128,y-10,232,y-43,14,'#9e9e9d');
      shape(c,'M118 227 L126 219 L247 219 L239 228 L239 233 L118 233Z','#bababa');
      bolt(c,130,225,2.4);bolt(c,228,225,2.4);
      c.save();c.translate(150+25*pos,y-9-26*spring);c.rotate(spring*.21);
      shape(c,'M-13 1 L47 -27 L55 -24 L-4 6Z','#ededeb');
      shape(c,'M-4 6 L55 -24 L55 3 L-4 10Z','#a3a3a1');shape(c,'M47 -27 L55 -24 L55 3 L48 1Z','#747474',ink,1.3);
      shape(c,'M6 3 Q21 -2 43 -13 M26 -6 Q36 -12 45 -12',null,'#575757',1.05);c.restore();
      if(spring>.3)accents(c,183,y-59,.61,1);
      if(!w.flags.wedge||age<1.1)duck(c,98,y-9,67,0,age>=0?'dance':'idle',t);
    }
    const printParts=new Map();
    function referenceCrop(c,image,mask){
      if(!ready(image))return false;
      if(typeof document!=='undefined'){
        let part=printParts.get(mask);
        if(!part){
          const canvas=document.createElement('canvas');canvas.width=640;canvas.height=427;
          const g=canvas.getContext('2d');g.imageSmoothingQuality='high';g.filter='grayscale(1)';
          g.clip(path(mask));g.drawImage(image,0,0,640,640*image.naturalHeight/image.naturalWidth);
          printParts.set(mask,part=canvas);
        }
        c.drawImage(part,0,0);return true;
      }
      c.save();c.filter='grayscale(1)';c.clip(path(mask));c.drawImage(image,0,0,640,640*image.naturalHeight/image.naturalWidth);c.restore();return true;
    }
    const winchMask='M8 314 L18 312 L22 281 L16 271 Q9 265 14 251 L25 236 L61 234 L78 240 Q91 241 97 249 Q120 249 126 257 L134 269 L131 317 L144 318 L145 347 L99 358 L3 355 L4 335 L8 331Z';
    function drum(c,x,ground,locked,mode,t,isBrake){
      c.save();c.translate(x-65,ground-135);c.scale(.86,.86);c.translate(0,-198);
      if(!referenceCrop(c,dragonPrint,winchMask)){
        beam(c,8,344,140,344,15,mid);sheave(c,65,282,38,t);
      }
      if(isBrake)paintMark(c,73,331,27,false,-.035);
      c.save();c.translate(56,288);c.rotate(-.54+1.31*Number(mode||0));
      shape(c,'M-6 2 Q-5 10 4 7 L12 -50 L9 -70 L0 -70 L2 -48Z','#d2d2cf');
      shape(c,'M-1 -67 Q-4 -72 1 -76 L20 -80 Q24 -80 25 -73 Q26 -66 21 -65 L4 -61Z',red);
      bolt(c,0,0,4.8);c.restore();
      if(locked)shape(c,'M93 255 L115 236 Q119 230 124 235 Q129 238 123 244 L100 262Z',mid);
      c.restore();
      if(isBrake){beam(c,x-70,ground+3,x+72,ground+3,8,'#777');for(const dir of [-1,1]){
        c.save();c.translate(x+dir*(locked?37:57),ground-4);c.scale(dir,1);
        shape(c,'M-7 5 L-13 -7 L-7 -21 Q-2 -27 2 -19 L0 -9 L11 -6 L11 3Z',mid);bolt(c,4,0,2.6);c.restore();}}
    }
    function gantry(c,x,y,height,width,time,travel,withDuck,cargo=false){
      const top=y-height,left=x-width*.5,right=x+width*.5;
      beam(c,left+5,y,left-1,top+14,12,'#a5a5a2');beam(c,right+6,y,right-1,top+12,12,'#888887');
      beam(c,left-10,top+8,right+12,top+8,14,paper);beam(c,left+1,top+42,left+37,top+12,8,mid);
      const a=left+30,b=right-23,platform=cargo?y-12-54*travel:y-9+travel*9;
      const weight=cargo?y-80+54*travel:y-31-travel*42;
      rope(c,a,platform,a,top+22);rope(c,a,top+20,b,top+20);rope(c,b,top+22,b,weight-24);
      const winding=travel*(cargo?-3.2:2);
      sheave(c,a,top+20,9.3,winding);sheave(c,b,top+20,9.3,winding);
      if(cargo){
        c.save();c.translate(x,top+5);
        shape(c,'M-23 -5 L25 -5 L20 28 L-19 28Z','#dad8ce',ink,1.7);
        bolt(c,-18,0,2.1);bolt(c,19,0,2.1);paintMark(c,1,12,23,true);c.restore();
        beam(c,left-19,y-1,left+11,y-13+8*travel,7,'#8a8882');
      }
      c.save();c.translate(b,weight);
      shape(c,'M-6 -23 Q-1 -32 5 -24 L7 -18 Q14 -17 15 -9 L20 7 L17 12 L-16 12 L-20 8 L-14 -12 Q-14 -18 -7 -18Z','#8b8b89');
      shape(c,'M-11 -10 L-13 5 M-8 -13 L-9 -8',null,paper,1.5);c.restore();
      const cx=a+21;shadow(c,cx,y+1,32);
      beam(c,cx-40,platform,cx+40,platform,8,paper);
      if(withDuck)duck(c,cx,platform-3,cargo?91:67,0,travel>0&&travel<1?'dance':'idle',time);
    }
    // A wheeled stage puppet made from two sawn flats. Both inked faces,
    // the pull-line and the hinge use the same pivot throughout the bite.
    function dragon(c,w,t,biteTime,foreground=false,rehearsal=null){
      const flags=w.flags,held=rehearsal?rehearsal.lift:(flags.jaw?1:0);
      const localX=w.actor.x%W.P,approaching=!rehearsal&&!flags.jawLocked&&w.route[Math.floor(w.actor.x/W.P)]==='dragon';
      const anticipation=approaching?ease((localX-40)/73):0;
      const clock=W.dragonTiming;
      const beat=(ms,start,end)=>ease((ms-start)/(end-start));
      const jawLift=biteTime==null?Math.max(held,anticipation):reduced?(biteTime<clock.bite?1:0):
        1-.76*beat(biteTime,40,clock.bite)+.23*beat(biteTime,315,450)-.47*beat(biteTime,535,clock.inside);
      const shut=biteTime==null?0:reduced?Number(biteTime>=clock.inside):beat(biteTime,555,clock.inside);
      const angle=.03+.40*jawLift-.18*shut+(!held&&!approaching&&!reduced?.012*Math.sin(t*3.4):0);
      const throat=biteTime==null||reduced?0:Math.sin(Math.PI*beat(biteTime,clock.inside,1360));
      const px=282,py=195;
      if(!foreground){
        shadow(c,206,231,103);
        // Cantilever, rear cheek and moving eyelet of the fly-system.
        beam(c,282,223,299,122,10,'#9e9c99');
        beam(c,302,222,294,155,7,'#c1c0bd');
        sheave(c,299,120,8.2,-angle*2);
        const lugX=px-29*Math.cos(angle)+69*Math.sin(angle);
        const lugY=py-29*Math.sin(angle)-69*Math.cos(angle);
        rope(c,lugX,lugY,298,114,2.8);
        rope(c,306,120,309,205,2.4);
        // The dark rear cheek follows the upper plate. A sliver of scenery
        // remains visible at the front of the open mouth, like a real prop.
        const behind=(x,y)=>{
          const dx=x-px,dy=y-py;
          return [px+dx*Math.cos(angle)-dy*Math.sin(angle),py+dx*Math.sin(angle)+dy*Math.cos(angle)];
        };
        c.beginPath();c.moveTo(119,214);
        c.bezierCurveTo(160,205,...behind(149,181),...behind(133,164));
        c.bezierCurveTo(...behind(176,152),...behind(232,169),...behind(275,155));
        c.quadraticCurveTo(293,180,282,211);c.quadraticCurveTo(200,227,119,214);c.closePath();
        c.fillStyle='#242323';c.fill();
        shape(c,'M158 212 Q192 197 225 197 Q244 198 259 202 Q220 201 199 210Z','#6a6966',null);
        // A pair of grounded castors, with the floor showing between them.
        beam(c,135,221,278,221,7,'#696866');
        for(const x of [143,272]){oval(c,x,225,6.8,5.7,ink,ink,1.4);oval(c,x,225,3.4,2.7,paper,null);bolt(c,x,225,1.4);}
        return;
      }
      c.save();c.translate(px,py);c.rotate(angle);c.translate(-px,-py);
      // The back edge and the three crown fins show the thickness of the cut wood.
      const skull='M99 184 Q89 180 94 169 Q99 156 114 148 Q118 128 135 127 Q143 115 158 122 Q168 127 171 132 L181 121 Q189 108 201 105 Q196 91 202 80 Q207 71 214 73 L226 94 Q235 85 246 81 Q254 80 252 87 L249 98 Q260 94 265 96 Q268 98 265 103 L259 111 Q272 118 280 138 L286 158 L287 177 Q284 194 273 199 L251 194 Q235 181 214 178 Q190 171 163 170 Q136 168 110 182Z';
      c.save();c.translate(5,-2.4);shape(c,skull,'#8c8b88',ink,2.7);c.restore();
      shape(c,skull,'#deddd9',ink,3);
      shape(c,'M203 103 Q198 87 207 78 Q209 88 219 99 M231 99 Q239 88 247 87 M251 104 L262 99',null,'#65635f',1.3);
      shape(c,'M109 162 Q118 151 137 152 M164 143 Q173 140 178 134 M180 149 Q199 158 217 154 M233 165 Q255 160 267 147',null,'#65635f',1.15);
      shape(c,'M143 133 Q149 128 155 135 Q157 140 151 143 Q144 147 142 142 Q140 137 143 133Z M132 137 Q136 133 138 137 Q140 141 135 143 Q131 144 131 141Z',ink,null);
      shape(c,'M116 149 Q114 140 120 135 Q127 129 131 134 L127 139 Q123 135 121 143 L123 148Z','#9e9d99',ink,1.4);
      const teeth='M113 174 Q119 169 130 169 L129 183 Q127 191 121 192 Q116 192 115 186Z M149 166 L171 167 L169 178 Q167 187 160 185 Q154 182 151 176Z M190 171 L209 176 L207 188 Q205 191 201 189 Q194 184 190 171Z M229 180 L245 187 L241 195 Q239 198 235 194Z';
      shape(c,teeth,paper,ink,2);
      const lip='M96 172 Q121 150 163 154 Q203 155 232 164 Q257 170 271 155 Q275 150 280 152 Q285 155 281 164 Q273 182 255 184 Q241 184 225 177 Q199 165 164 165 Q130 162 106 181 Q100 188 95 183 Q90 178 96 172Z';
      shape(c,lip,'#b8b7b1',ink,2.2);
      shape(c,'M100 173 Q127 153 158 157 M170 158 Q202 159 225 168 M249 176 Q266 175 274 164',null,'#faf9f5',1.25);
      for(const [x,y] of [[106,173],[160,159],[225,171],[274,159]])bolt(c,x,y,1.8);
      oval(c,218,130,23,23,'#aaa9a5',ink,2.05);
      oval(c,218,128,20.8,20.6,'#f9f9f6',ink,1.65);
      const surprise=biteTime==null?0:reduced?Number(biteTime<clock.bite):beat(biteTime,0,105)*(1-beat(biteTime,clock.bite,590));
      oval(c,211.5,132-surprise*3,5.8,8.9,ink,null);
      c.save();c.beginPath();c.ellipse(218,128,20.8,20.6,0,0,tau);c.clip();
      c.beginPath();c.moveTo(190,101);c.lineTo(243,98);c.lineTo(245,118-surprise*11);
      c.quadraticCurveTo(226,124-surprise*9,192,139-surprise*19);c.closePath();
      c.fillStyle='#cdccc8';c.fill();c.lineWidth=2.35;c.strokeStyle=ink;c.stroke();c.restore();
      shape(c,'M196 116 Q205 99 223 102 M197 142 Q200 151 208 153 M250 119 Q260 119 267 128',null,'#474642',1.1);
      // Woodcut marks hug the planes; there is no rectangular plate behind the head.
      for(let i=0;i<6;i++)line(c,252+i*2.9,148-i*.8,254+i*2.9,144-i*.8,'#6d6b67',.75);
      bolt(c,253,126,2.6);c.restore();
      // The can disappears progressively behind this cheek plate. A single hinged
      // cover kicks out as the tin passes the throat and seats again afterwards.
      c.save();c.translate(268,165);c.rotate(-throat*.19);
      shape(c,'M-4 7 Q0 -7 12 -13 L20 -12 Q25 5 28 27 L25 45 Q17 50 5 51 L-10 45 L-15 34 Q-10 26 -4 7Z','#b2b1ad',ink,2.5);
      shape(c,'M-6 35 Q1 16 8 7 M-3 42 Q7 46 19 40 M10 -5 L17 -7',null,'#63615c',1.2);
      bolt(c,15,-4,2.5);bolt(c,17,40,2.6);c.restore();
      // The lower jaw stays on the dolly; back teeth are shorter and offset.
      shape(c,'M111 213 L120 198 Q123 191 126 194 L132 209 L148 210 L158 195 Q162 190 165 196 L171 207 L187 206 L197 193 Q202 188 204 195 L208 203 L226 200 L235 187 Q238 184 241 189 L245 197 L260 194 L272 183 L286 191 L279 209 L209 218 L133 221Z',paper,ink,1.9);
      const keel='M102 206 Q105 200 112 203 Q138 215 181 211 Q226 208 245 197 Q258 187 268 174 Q273 169 280 173 L290 180 Q292 185 285 191 Q279 197 278 210 L273 218 Q223 226 174 227 Q128 227 105 218 Q99 215 102 206Z';
      shape(c,keel,'#a8a7a3',ink,2.7);
      shape(c,'M106 207 Q141 222 186 216 Q239 213 257 199 Q270 189 278 178',null,paper,1.7);
      shape(c,'M119 216 Q141 222 166 220 M182 222 Q212 221 224 217 M234 217 L253 211',null,'#5c5a56',1);
      for(const [x,y] of [[110,211],[151,220],[197,217],[247,207]])bolt(c,x,y,1.8);
      shape(c,'M274 174 Q280 170 285 176 L292 185 Q293 189 289 197 L283 214 Q281 220 274 219 L266 216 Q262 215 265 209L271 191Z','#c6c5c0',ink,1.65);
      bolt(c,281,184,3.7);bolt(c,274,212,2.5);
      if(biteTime!==null&&biteTime>=clock.bite&&biteTime<clock.bite+210)accents(c,92,161,.66,-1);
      if(throat>.63)accents(c,294,186,.47,1);
    }
    function bell(c,foot,t,age){
      const swing=age>=0&&age<1.25&&!reduced?Math.sin(age*22)*Math.exp(-3.25*age):0;
      beam(c,162,foot-3,161,foot-119,9,'#a5a5a3');
      beam(c,152,foot-118,232,foot-126,11,paper);
      beam(c,161,foot-86,184,foot-118,7,mid);
      c.save();c.translate(216,foot-124);c.rotate(swing*.48);rope(c,0,0,0,11,2.8);
      shape(c,'M-6 15 Q-7 9 0 7 Q7 8 7 15 L8 18 Q21 24 23 43 Q24 57 34 67 Q37 71 34 74 Q0 85 -34 74 Q-37 71 -33 66 Q-24 58 -22 43 Q-20 24 -7 18Z','#c9c9c8',ink,2.4);
      shape(c,'M-18 46 Q-16 30 -8 27 M-20 53 L-21 57 M-29 64 Q-2 74 29 65',null,paper,2.4);
      paintMark(c,1,48,27,true,-.025,ink);
      oval(c,0,72,32,5,'#474747',ink,1.65);c.save();c.translate(0,70);c.rotate(-swing*.85);
      line(c,0,1,0,9,ink,2);oval(c,0,11,4.8,5.2,'#777');c.restore();c.restore();
      if(age>=0&&age<.9)accents(c,252,foot-79,.75,1);
      if(age>=0&&age<1.8){const hop=age<.73&&!reduced?Math.sin(Math.PI*clamp(age/.73))*14:0;
        duck(c,285,foot-6-hop,68,1,'sing',t,true);
        if(age>.28&&age<1.05)accents(c,265,foot-75-hop,.44,-1);
      }
    }
    function pin(c,type,y,active,age){
      const at=active?ease((Math.max(0,age)+.05)/.42):0;
      if(type==='catch'){
        c.save();c.translate(201,y-3);
        beam(c,-55,0,48,0,9,'#aaa');beam(c,18,-9,37,-91,9,'#bbb');
        // The open fork is carried on a real base. Its keeper sweeps across
        // both tips and captures the structural pin between the two cheeks.
        shape(c,'M-38 -4 L-40 -38 L-37 -65 Q-36 -70 -30 -69 L-23 -66 L-21 -40 Q-19 -28 -9 -27 L1 -27 Q13 -29 14 -40 L17 -66 Q19 -73 25 -69 L30 -65 L30 -36 L21 -7Z','#c4c4c2',ink,2.8);
        shape(c,'M-35 -61 L-33 -38 Q-31 -31 -28 -29 M22 -62 L21 -42 M-31 -10 L9 -12',null,paper,1.8);
        paintMark(c,-9,-16,22,false,-.045,ink);
        c.save();c.translate(-31,-59);c.rotate(-.93*(1-at));shape(c,'M-3 -4 L48 -4 Q54 -4 56 1 L55 6 L46 10 L43 4 L-2 4Z',mid,ink,2.1);c.restore();
        if(active){sheave(c,-4,-45,9,0);if(age<.41){line(c,32,-67,41,-76,ink,2.3);line(c,36,-61,49,-65,ink,1.8);}}
        bolt(c,-31,-59,4.4);bolt(c,-29,-1,2.7);bolt(c,30,-1,2.7);c.restore();return;
      }
      if(type==='lowerPin'){
        c.save();c.translate(194,y-4);beam(c,-38,0,69,0,8,mid);
        shape(c,'M-27 -6 L-27 -43 Q-25 -56 -14 -61 L7 -66 Q18 -67 26 -57 L30 -49 L30 -6Z','#999997',ink,2.3);
        shape(c,'M-26 -47 Q-24 -60 -10 -60 Q6 -60 9 -47 L9 -6 L-26 -6Z','#d6d6d3');
        paintMark(c,-8,-15,15,false,-.04,ink);
        oval(c,-7,-37,13,17,'#404040',ink,2);oval(c,-6,-37,8,12,'#202020',paper,1);
        c.save();c.translate(44*at,0);
        shape(c,'M-9 -41 L58 -42 L64 -36 L58 -30 L-8 -31 Q-13 -36 -9 -41Z',mid);
        line(c,-6,-38,52,-39,paper,1.35);oval(c,60,-35.5,7,8,paper);oval(c,60,-35.5,3,4,'#484848',ink,1);
        c.restore();bolt(c,-18,-8);bolt(c,22,-10);
        if(active&&age<.41){line(c,4,-57,11,-66,ink,2.2);line(c,11,-53,24,-58,ink,1.7);}c.restore();return;
      }
      const travel=-25*at;
      c.save();c.translate(202,y-3);
      // Both feet follow the incline. The stay reaches an upright bolted into
      // the deck; the horizontal spindle still turns on a vertical standard.
      beam(c,44,18,44,-94,10,'#bbb');beam(c,-44,-25,44,-65,9,'#a8a8a6');
      beam(c,35,17,55,27,6,'#787873');bolt(c,44,19);
      beam(c,12,-95,65,-95,9,'#d4d4d1');sheave(c,17,-90,6,at*.6);
      shape(c,'M20 -86 L48 -87 L48 -54 L36 -56Z','#d3d1c8',ink,1.4);
      paintMark(c,37,-73,19,true,0,ink);
      rope(c,17,-84,0,-27,2.5);
      c.rotate(Math.atan2(120,240));
      beam(c,-73,1,2,1,6,'#bebeba');
      shape(c,'M-70 2 L-62 -8 L-58 -24 L-48 -28 L-43 -25 L-42 -11 L-26 -11 L-21 -28 L-10 -32 L-4 -29 L-4 -4 L1 -2 L0 4Z','#adadab');
      shape(c,'M-55 -22 L-49 -24 L-48 -10 L-54 -9Z M-17 -25 L-10 -28 L-10 -13 L-16 -12Z',ink,null);
      c.save();c.translate(travel,0);
      shape(c,'M-61 -18 L16 -24 Q24 -23 24 -18 L19 -14 L-62 -10Z','#dededc');
      oval(c,22,-20,11,11,paper,ink,2.5);oval(c,22,-20,6.4,6.4,'#626261',ink,1.4);
      line(c,-53,-15,9,-20,paper,1.5);c.restore();
      bolt(c,-53,-1,2.4);bolt(c,-13,-4,2.4);c.restore();
      if(active&&age>=0&&age<.43)accents(c,231,y-43,.48,1);
    }
    function chest(c,x,y,s=1,tilt=0,wheels=true){
      c.save();c.translate(x,y);c.rotate(tilt);c.scale(s,s);
      if(wheels){
        beam(c,-44,-8,43,-8,9,'#bcbab3');paintMark(c,10,-8,12,false);
        for(const xx of [-26,26]){oval(c,xx,-5,5.6,5.6,'#393939',ink,1.3);bolt(c,xx,-5,2.3);}
      }
      // Rounded stave lid, pitched left end and forged binding echo the reward in
      // the last story panel. All three faces meet the same receding base line.
      const low=wheels?-9:-1;c.translate(0,low+9);
      shape(c,'M-42 -57 Q-44 -76 -27 -82 Q-8 -88 1 -66 L3 -52 L-38 -40Z','#b8b8b5');
      shape(c,'M-42 -57 Q-42 -76 -26 -81 L18 -88 Q37 -91 42 -71 L44 -61 L-1 -51 Q-4 -72 -17 -77 Q-30 -83 -38 -65Z','#dededb');
      shape(c,'M-41 -55 L0 -48 L1 -5 L-40 -14Z','#b8b8b5');
      shape(c,'M0 -48 L44 -59 L43 -15 L1 -5Z','#e2e2df');
      shape(c,'M-40 -51 L0 -45 L43 -55 L44 -62 L0 -53 L-41 -59Z','#dededc');
      shape(c,'M-27 -80 Q-8 -83 1 -54 L3 -48 L3 -6 L8 -7 L8 -52 Q3 -79 -14 -83Z','#363636',ink,1.3);
      shape(c,'M12 -86 Q28 -83 33 -64 L34 -59 L33 -13 L38 -14 L39 -63 Q34 -83 23 -88Z','#424242',ink,1.3);
      shape(c,'M-39 -41 Q-25 -42 -5 -35 M-39 -31 L-5 -24 M-39 -24 Q-24 -25 -5 -18 M10 -37 L32 -43 M9 -26 L32 -33 M10 -15 Q20 -19 31 -21 M-28 -72 Q-18 -72 -10 -65 M1 -77 L17 -80',null,'#5d5d5a',.88);
      shape(c,'M11 -51 L16 -54 Q19 -59 23 -55 L27 -53 L26 -41 L12 -37Z',paper,ink,1.55);
      oval(c,19.5,-48.5,2,2.4,ink,null);shape(c,'M19 -48 L18 -43 L22 -44 L21 -48Z',ink,null);
      for(const [a,b] of [[5,-34],[5,-13],[36,-26],[35,-47],[0,-60],[30,-71]])oval(c,a,b,.8,1,paper,null);
      paintMark(c,-20,-29,24,true,.17);
      c.restore();
    }
    function freight(c,w,type,t,age){
      const floor=350;
      if(type==='counterCargo'){
        gantry(c,189,floor,209,209,t,w.flags.crate?ease((Math.max(age,0)+.02)/.88):0,true,true);
        return;
      }
      if(type!=='load')return;
      const progress=w.flags.crate?ease((Math.max(age,0)+.02)/.88):0;
      const baseline=floor-109+progress*100;
      beam(c,78,floor+2,80,floor-228,16,'#a6a6a3');beam(c,68,floor-228,284,floor-228,18,paper);
      beam(c,80,floor-164,149,floor-226,11,mid);
      sheave(c,217,floor-210,13,progress*3.8);
      rope(c,218,floor-200,218,w.flags.carry?floor-127:baseline-103);
      if(!w.flags.carry){
        rope(c,218,baseline-103,183,baseline-77,3);rope(c,218,baseline-103,253,baseline-79,3);
        chest(c,216,baseline,1.07,0,false);
        beam(c,160,floor-7,274,floor-7,10,mid);
        for(const xx of [174,258]){oval(c,xx,floor-4,8.1,8.1,'#67665f');bolt(c,xx,floor-4,3.1);}
        paintMark(c,216,floor-7,12,false);
      }else{
        c.save();c.translate(218,floor-127);shape(c,'M-2 -2 Q-3 2 -1 7 Q5 14 11 9 Q15 6 13 1 Q10 8 5 7 L3 3 L4 -2Z',mid);c.restore();
      }
    }
    function startWing(c,w,floor,v){
      if(w.index===2){
        for(const x of [289,574]){
          beam(c,x+2,floor-39,x-2,floor-158,13,'#d6d6d3');peg(c,x-2,floor-158,1.08);
        }
        c.beginPath();c.moveTo(289,floor-145);c.quadraticCurveTo(432,floor-83,574,floor-145);
        c.lineWidth=6;c.strokeStyle='#393939';c.stroke();c.lineWidth=2.8;c.strokeStyle=paper;c.stroke();
        return;
      }
      const la=w.index===4?290:273,y=floor-132;
      rope(c,la,Math.min(v.top-12,y-58),la,y-10,2.7);
      c.save();c.translate(la,y);c.rotate(-.19);
      shape(c,'M-5 -12 L5 -12 L7 -3 Q19 2 24 14 L22 17 L-23 17 L-25 13 Q-18 0 -5 -4Z','#666665');
      oval(c,0,16,23,3.7,paper,ink,1.1);c.restore();
    }
    function singersBox(c,floor,t,locked){
      // A small stage box stands on the rear edge of the deck. Its cornice and
      // sill frame the existing singer, upstage of the blocking mark.
      c.save();c.translate(133,floor-13);
      shape(c,'M-96 -210 Q-56 -216 0 -230 Q51 -217 94 -211 L92 -201 L-94 -199Z','#ecebe8',ink,2.6);
      shape(c,'M-91 -201 Q-46 -207 0 -221 Q42 -208 89 -202 L86 -196 Q44 -199 0 -211 Q-43 -199 -89 -194Z','#7b7b79',ink,1.5);
      const opening='M-82 -194 Q-40 -198 0 -212 Q41 -199 82 -194 L81 -69 L-81 -69Z';
      shape(c,opening,'#333332',ink,2.1);
      c.save();c.clip(path(opening));
      shape(c,'M-88 -201 L-49 -208 Q-47 -174 -67 -136 Q-73 -129 -82 -127Z M50 -207 L88 -200 L86 -127 Q70 -137 63 -153 Q52 -181 50 -207Z','#71716e',ink,1.8);
      shape(c,'M-78 -195 Q-74 -170 -79 -147 M-65 -194 Q-64 -175 -70 -158 M60 -197 Q63 -172 73 -156 M72 -194 Q76 -170 80 -160',null,'#aeaeaa',1.2);
      duck(c,1,-27,171,1,locked?'sing':'idle',t,true);
      if(locked)accents(c,49,-140,.45,1);
      c.restore();
      shape(c,'M-89 -195 L-79 -196 L-79 -68 L-88 -65Z M79 -196 L89 -195 L88 -65 L79 -68Z','#d8d8d5',ink,2.1);
      shape(c,'M-82 -69 L82 -69 L77 -2 L-77 -2Z','#d1d0cd',ink,2.2);
      shape(c,'M-71 -53 L71 -53 L67 -13 L-67 -13Z','#eeeeeb','#444440',1.45);
      shape(c,'M-60 -47 Q-32 -47 -15 -48 M17 -47 L60 -47 L57 -35 M-57 -25 L-56 -20 Q-30 -21 -17 -20 M6 -20 Q32 -21 56 -20',null,'#7a7976',1);
      // Fine woodcuts and the fan rosette belong to the box fascia, below the face.
      shape(c,'M-15 -36 Q-8 -37 -3 -32 Q-10 -43 -5 -43 Q-1 -41 0 -33 Q2 -44 7 -44 Q11 -42 4 -32 Q13 -40 17 -37 L6 -28 L-5 -28Z','#91918b','#42423f',1);
      shape(c,'M-66 -57 Q-39 -58 -19 -56 M23 -57 L62 -58 M-77 -179 L-79 -94 M84 -180 Q82 -132 84 -110',null,'#777773',.85);
      shape(c,'M-92 -73 Q-7 -77 90 -73 L87 -65 L-88 -64Z','#f6f5f1',ink,2.1);
      shape(c,'M-88 -64 L87 -65 L84 -60 L-85 -58Z','#555552',ink,1.2);
      shape(c,'M-79 -7 L79 -7 L82 -1 L79 2 L-82 2Z','#969693',ink,1.7);
      c.restore();
    }
    function finalMark(c,w,type,floor,t,v){
      const singersExit=w.index===3;
      if(singersExit)singersBox(c,floor,t,w.flags.jawLocked);
      if(w.level.cargo){
        // The lights in the illustrated apron throw a pool across the front
        // boards as the trolley clears the wing.
        const entrance=w.goal.x-w.goal.localX;
        const light=ease((w.actor.x-entrance+20)/160);
        if(light>0){
          c.save();c.translate(w.goal.localX,floor-3);
          c.globalAlpha=light*.36;oval(c,7,-1,84,6.6,'#fff',null);c.restore();
        }
      }
      root.OpeningStageMarks.draw(c,w.goal.localX,floor-2,1.03);
      if(w.index===2&&w.flags.wedge)duck(c,304,floor-7,61,0,w.done?'dance':'idle',t);
      if(w.index===4&&w.flags.safe&&w.lastPiece===w.goal.slot)duck(c,307,floor-8,71,1,'sing',t,true);
      if(w.index===5&&w.flags.carry){duck(c,116,floor-8,70,0,w.done?'dance':'idle',t,true);duck(c,337,floor-6,73,1,w.done?'sing':'idle',t);}
    }
    function freightInMotion(c,w,slot){
      if(!w.flags.carry)return;
      const remains=w.cargoPause||0,full=W.cargoPauseDuration||.66;
      const phase=clamp(1-remains/full),shake=remains>0&&!reduced?Math.sin(phase*Math.PI*5)*Math.sin(phase*Math.PI):0;
      const centre=w.actor.x+66+shake*2,bx=centre-slot*W.P,half=49;
      if(bx+half<=0||bx-half>=W.P)return;
      const by=(W.surface(w,centre)??350)+1;
      c.save();
      // Let the cart nose enter the next panel before the can. Only split the
      // body during that crossing; in every other pose the complete cart is visible.
      if(bx<half||bx>W.P-half){c.beginPath();c.rect(0,by-114,W.P,128);c.clip();}
      shadow(c,bx,by,43);chest(c,bx,by,1.07,shake*.065);
      if(remains>.12&&remains<full-.12&&!reduced)accents(c,bx+31,by-50,.46,1);
      c.restore();
    }
    function player(c,w,slot,view){
      if(Math.floor(w.actor.x/W.P)!==slot)return;
      const type=w.route[slot],x=w.actor.x-slot*W.P,foot=w.actor.y+W.R;
      const minHeight=view.minActorHeight?Math.min(view.minActorHeight,foot-view.top-2/view.scale):0;
      const height=Math.max(root.OpeningLaterLayouts.playerHeight(w.index,type),minHeight);
      if(type==='dragon'&&w.dragonBiteMs!=null){
        if(w.dragonBiteMs>=W.dragonTiming.inside)return;
        const u=reduced?Number(w.dragonBiteMs>=W.dragonTiming.bite)*.6:ease(w.dragonBiteMs/W.dragonTiming.inside);
        const h=height*(1-35/76*u),cx=x+(285-x)*u,cy=foot-height/2+(194-(foot-height/2))*u;
        c.save();c.translate(cx,cy);c.rotate(reduced?0:-.83*Math.sin(u*Math.PI)-.31*u);
        if(!can?.draw(c,{x:0,y:h/2,height:h,angle:w.actor.angle+u*4.4,anchor:'ground',pose:{depth:.19}})&&ready(canImage)){
          c.drawImage(canImage,87,80,776,1481,-h*.262,-h*.5,h*.524,h);
        }
        c.restore();return;
      }
      const floor=W.surface(w,w.actor.x),f=w.flags;
      let angle=w.actor.angle,lean=0;
      if(f.carry){lean=-.10-(w.cargoPause>0?.06:0);angle*=.68;}
      if(floor!==null&&Math.abs(foot-floor)<96){
        const gap=Math.max(0,floor-foot),radius=height*.25*(1-Math.min(.68,gap/136));shadow(c,x,floor,radius);}
      const sloped=type==='ramp'||type==='down'||type==='upperPin';
      const pathAngle=sloped?Math.atan2(nominalFloor(type,x+1,W)-nominalFloor(type,x-1,W),2):0;
      // Give the can a slight rolling lean while keeping the contact point on the boards.
      if(!reduced&&w.actor.grounded)lean+=Math.max(-1,Math.min(1,w.actor.vx/245))*.075;
      if(!reduced&&Math.abs(w.actor.vx)>155&&Math.cos(w.elapsed*13)>.05){
        c.save();c.translate(x,foot);c.scale(Math.sign(w.actor.vx)*height/76,height/76);
        shape(c,'M-22 -13 Q-30 -13 -35 -12 M-24 -7 Q-34 -6 -40 -7',null,'#555',1.1);c.restore();
      }
      c.save();c.translate(x,foot);c.rotate(lean);
      const drawn=can?.draw(c,{x:0,y:0,height,angle,anchor:'ground',pose:{depth:.19,pathAngle}});
      if(!drawn&&ready(canImage))c.drawImage(canImage,87,80,776,1481,-height*.262,-height,height*.524,height);
      c.restore();
    }
    function render(c,w,camera,time,slot,v){
      if(!v||slot===undefined)return;
      if(lastWorld!==w){lastWorld=w;events={};}
      if(sceneClockStart===undefined&&time>0)sceneClockStart=time;
      const sceneryTime=Math.max(0,(time-(sceneClockStart??time))/1000);
      const t=w.elapsed||(reduced?0:time/1000),type=w.route[slot],f=w.flags,floor=W.pieces[type].input;
      const wedge=elapsedEvent(w,'wedge'),jaw=elapsedEvent(w,'jaw'),cued=elapsedEvent(w,'cued'),crate=elapsedEvent(w,'crate');
      const biteTime=type==='dragon'?w.dragonBiteMs:null;
      c.save();c.translate(slot*W.P-camera,0);c.lineJoin='round';c.lineCap='round';c.imageSmoothingQuality='high';
      staticPlate(c,w,slot,type,v);
      if(type==='lowBridge')riverFish(c,v,sceneryTime);
      if(w.index===3)walkingDucks(c,duckPassage(w,slot,type,v),v.flockSeconds);
      if(type==='start'||type==='startHigh')startWing(c,w,floor,v);
      if(type==='lowBridge'||type==='cargoBridge')beamBridge(c,w,type,v,t,wedge);
      if(type==='brace')woodWedge(c,w,t,wedge);
      const demo=v.dragonCue;
      if(type==='counter')gantry(c,202,350,147,165,t,demo?demo.lift:jaw<0?0:ease((jaw+.02)/.45),true);
      if(type==='brake'||type==='pawl'){
        c.save();
        if(type==='brake'){c.translate(207,floor);c.scale(1.38,1.38);c.translate(-207,-floor);}
        drum(c,207,floor,demo?demo.crank>.93:type==='brake'?f.secured:f.jawLocked,demo?demo.crank:w.modes[type],t,type==='brake');
        c.restore();
      }
      if(type==='dragon')dragon(c,w,t,biteTime,false,demo);
      if(type==='cue'){
        c.save();c.translate(201,floor);c.scale(1.24,1.24);c.translate(-201,-floor);
        bell(c,floor,t,cued);c.restore();
      }
      if(type==='upperPin'||type==='lowerPin'||type==='catch'){
        const key=type==='upperPin'?'pin':type==='catch'?'safe':'lowerReleased';
        const on=type==='lowerPin'?f.safe&&w.visits[slot]!==undefined:f[key];
        const foot=type==='upperPin'?nominalFloor(type,202,W):floor,scale=type==='upperPin'?1.23:1.36;
        c.save();c.translate(202,foot);c.scale(scale,scale);c.translate(-202,-foot);
        pin(c,type,foot,!!on,elapsedEvent(w,key,on));c.restore();
        if(type==='lowerPin'&&f.safe&&w.lastPiece!==w.goal.slot)duck(c,293,floor-7,70,1,'sing',t,true);
      }
      if(type==='counterCargo'||type==='load')freight(c,w,type,t,crate);
      if(type==='goalLow'||type==='goal')finalMark(c,w,type,floor,t,v);
      freightInMotion(c,w,slot);player(c,w,slot,v);
      if(type==='dragon')dragon(c,w,t,biteTime,true,demo);
      c.restore();
    }
    return render;
  }
  root.OpeningLaterScenes={create,orderSlip};
  if(typeof module==='object'&&module.exports)module.exports={create};
})(typeof window!=='undefined'?window:globalThis);

;
(function(root){
  'use strict';
  const ns='http://www.w3.org/2000/svg';
  const folioBoards=new WeakSet();
  let serial=0,toolbarObserver=null;
  function svg(tag,attrs){
    const node=document.createElementNS(ns,tag);
    for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);
    return node;
  }
  function silhouette(slot,w,h){
    const clip=slot.clip||'';
    if(slot.outline){
      // The compositor authors absolute M/L/Q/C/Z coordinates in a 100-square.
      // Scale geometry once here so nib thickness and ink dots stay circular.
      let axis=0;
      const d=slot.outline.replace(/[MLQCZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi,token=>{
        if(/^[MLQCZ]$/i.test(token)){axis=0;return token;}
        return Number(token)*(axis++%2?h:w)/100;
      });
      return svg('path',{d});
    }
    if(slot.mask==='ellipse'||slot.mask==='circle'||/^(ellipse|circle)\(/.test(clip)){
      const rx=slot.mask==='circle'?Math.min(w,h)/2:w/2;
      return svg('ellipse',{cx:w/2,cy:h/2,rx,ry:slot.mask==='circle'?rx:h/2});
    }
    if(clip.startsWith('polygon(')){
      const coord=(v,n)=>v.endsWith('%')?parseFloat(v)*n/100:parseFloat(v);
      const points=clip.slice(8,-1).split(',').map(pair=>{
        const [x,y]=pair.trim().split(/\s+/);
        return coord(x,w)+','+coord(y,h);
      }).join(' ');
      return svg('polygon',{points});
    }
    return svg('rect',{width:w,height:h});
  }
  function decorate(views,slotPage,board,levelIndex){
    toolbarObserver?.disconnect();
    const guide=board.closest('.p-spread-content')?.querySelector('.p-guide-state');
    guide?.querySelector('.p-turn')?.remove();
    board.classList.add('p-ink-board');
    board.dataset.inkChapter=String(levelIndex+1);
    if(levelIndex===4&&!folioBoards.has(board)){
      folioBoards.add(board);
      let hintTimer;
      document.getElementById('p-help')?.closest('.p-actions')?.addEventListener('click',event=>{
        clearTimeout(hintTimer);
        const requested=!!event.target.closest('#p-help');
        board.classList.toggle('p-show-folios',requested);
        if(requested)hintTimer=setTimeout(()=>board.classList.remove('p-show-folios'),6500);
      });
    }
    const docks=[],folios=[];
    for(const {el,n} of views){
      const slot=slotPage?.slots[n]||{mask:'rectangle',clip:'inset(0)'};
      if(slot.mask==='open'||el.querySelector('.p-ink-edge'))continue;
      const w=slot.rect?.[2]||320,h=slot.rect?.[3]||175;
      el.classList.add('p-ink-framed');
      const id='ink-frame-'+(++serial),shape=id+'-shape',dots=id+'-dots';
      const art=svg('svg',{class:'p-ink-edge',viewBox:'0 0 '+w+' '+h,preserveAspectRatio:'none','aria-hidden':'true',focusable:'false'});
      const defs=svg('defs',{}),contour=silhouette(slot,w,h);
      contour.id=shape;
      const screen=svg('pattern',{id:dots,width:3.4,height:3.4,patternUnits:'userSpaceOnUse',patternTransform:'rotate(-35)'});
      screen.append(svg('circle',{cx:1.7,cy:1.7,r:.92,fill:'#242424'}));
      defs.append(contour,screen);art.append(defs);
      function impression(attrs){art.append(svg('use',{href:'#'+shape,'stroke-linejoin':'round',...attrs}));}
      impression({transform:'translate(4.2 5.6)',fill:'url(#'+dots+')',stroke:'url(#'+dots+')','stroke-width':7});
      impression({transform:'translate(1.15 1.8)',fill:'#191919',stroke:'#191919','stroke-width':8.2});
      impression({fill:'#fff',stroke:'#212121','stroke-width':8.3});
      impression({fill:'#fff',stroke:'#fff','stroke-width':5.35});
      impression({fill:'none',stroke:'#222','stroke-width':1.65});
      impression({class:'p-ink-focus',fill:'none',stroke:'#242424','stroke-width':1.6,'stroke-dasharray':'5 3',transform:'translate(0 -1)'});
      el.prepend(art);
      if(levelIndex===4){
        const number=el.querySelector('.p-number');
        if(number){
          number.classList.add('p-ink-folio');
          folios.push({el,n,number});
        }
      }
      const buttons=[el.querySelector('.p-turn'),el.querySelector('.p-frame-tools')].filter(Boolean);
      if(buttons.length){
        const dock=document.createElement('div');
        dock.className='p-ink-tools';dock.append(...buttons);el.append(dock);
        docks.push({el,n,dock,turn:dock.querySelector('.p-turn')});
      }
    }
    if((!docks.length&&!folios.length)||typeof ResizeObserver==='undefined')return;
    function placeFolio({el,n,number}){
      const rect=el.getBoundingClientRect(),w=rect.width,h=rect.height;
      if(!w||!h)return;
      const halfW=number.offsetWidth/2+3,halfH=number.offsetHeight/2+3;
      const controls=el.querySelector('.p-ink-tools')?.getBoundingClientRect();
      // Start just inside the paper rim. A diagonal cut can move the folio
      // along its top edge, while the control strip keeps its existing seat.
      for(let y=halfH+3;y<h-halfH;y+=5){
        for(let x=halfW+3;x<w-halfW;x+=5){
          if(controls?.width&&rect.x+x+halfW>controls.left&&rect.x+x-halfW<controls.right&&
            rect.y+y+halfH>controls.top&&rect.y+y-halfH<controls.bottom)continue;
          if(![-halfW,halfW].every(dx=>[-halfH,halfH].every(dy=>slotPage.contains(n,(x+dx)/w,(y+dy)/h))))continue;
          number.style.left=x+'px';number.style.top=y+'px';return;
        }
      }
    }
    function placeTools(entries,observer){
      if(!board.isConnected){observer?.disconnect();return;}
      for(const {el,n,dock,turn} of docks){
        const w=el.clientWidth,h=el.clientHeight;
        if(!w||!h)continue;
        const piece=el.dataset.piece,restoreFocus=turn&&turn===document.activeElement;
        if(turn&&turn.parentNode!==dock)dock.prepend(turn);
        el.classList.toggle('p-ink-tight',w<165||h<76);
        const contains=(x,y)=>slotPage?.contains(n,x,y)??(x>=0&&x<=1&&y>=0&&y<=1);
        const camera=turn&&slotPage?.camera(n,piece,w-2,h-2);
        // Keep the caption clear of the whole printed wheel and its moving lever.
        const wheel=camera&&{
          l:(1+camera.left+95*camera.scale)/w,r:(1+camera.left+306*camera.scale)/w,
          t:(1+(178-camera.top)*camera.scale)/h,b:(1+(357-camera.top)*camera.scale)/h
        };
        let anchor;
        for(let attempt=0;attempt<2&&!anchor;attempt++){
          if(attempt)el.classList.add('p-ink-tight');
          const halfW=(dock.offsetWidth/2+2)/w,halfH=(dock.offsetHeight/2+2)/h;
          for(const y of [.14,.22,.31,.40,.5,.60,.70,.80,.88]){
            for(const x of [.83,.74,.65,.56,.47,.38,.29,.20,.12]){
              if(wheel&&x+halfW>wheel.l&&x-halfW<wheel.r&&y+halfH>wheel.t&&y-halfH<wheel.b)continue;
              const fits=[-halfW,0,halfW].every(dx=>[-halfH,0,halfH].every(dy=>contains(x+dx,y+dy)));
              if(fits){anchor=[x,y];break;}
            }
            if(anchor)break;
          }
        }
        if(anchor){
          dock.style.left=anchor[0]*100+'%';dock.style.top=anchor[1]*100+'%';
        }else if(turn&&guide)guide.append(turn);
        if(restoreFocus&&turn!==document.activeElement)turn.focus({preventScroll:true});
      }
      folios.forEach(placeFolio);
    }
    toolbarObserver=new ResizeObserver(placeTools);
    for(const {el} of [...docks,...folios])toolbarObserver.observe(el);
    placeTools();
  }
  root.OpeningInkFrames={decorate};
})(window);

;
(function(root){
  'use strict';
  // The irregular tips of twelve parallel strokes travel across the new impression.
  function brush(ctx,w,h,progress,seed){
    ctx.save();
    const rows=12,band=h/rows;
    ctx.fillStyle='#f9f9f7';
    ctx.beginPath();
    for(let row=0;row<rows;row++){
      const y=row*band,delay=((row*7+seed*5)%11)*.018;
      const t=Math.max(0,Math.min(1,(progress-delay)/.82));
      const tip=(1-Math.pow(1-t,1.45))*1.13*w-.06*w;
      ctx.moveTo(tip,y);ctx.lineTo(w,y);ctx.lineTo(w,y+band+.6);
      ctx.lineTo(tip-.019*w,y+band+.6);ctx.lineTo(tip+.032*w,y+band*.72);
      ctx.lineTo(tip-.01*w,y+band*.49);ctx.lineTo(tip+.041*w,y+band*.23);ctx.closePath();
    }
    ctx.fill();ctx.restore();
  }
  function capture(views,page){
    const overlay=document.createElement('div');
    overlay.className='p-leaves';overlay.setAttribute('aria-hidden','true');
    const sheet=document.createElement('div');sheet.className='p-leaves-paper';overlay.append(sheet);
    const width=document.documentElement.clientWidth;
    const leaves=views.map(({el,n,canvas})=>{
      const box=el.getBoundingClientRect(),print=canvas.getBoundingClientRect();
      const leaf=document.createElement('div');leaf.className='p-leaf';
      Object.assign(leaf.style,{left:box.x+'px',top:box.y+'px',width:box.width+'px',height:box.height+'px',zIndex:getComputedStyle(el).zIndex});
      const edge=el.querySelector('.p-ink-edge');
      if(edge)leaf.append(edge);
      Object.assign(canvas.style,{left:(print.x-box.x)+'px',top:(print.y-box.y)+'px',width:print.width+'px',height:print.height+'px',clipPath:page.slots[n].clip});
      leaf.append(canvas);overlay.append(leaf);
      const dx=box.x+box.width*.5<width*.5?-box.right-20:width-box.left+20;
      return {leaf,dx};
    });
    return signal=>{
      if(signal.aborted)return;
      document.body.append(overlay);
      const options={duration:620,easing:'cubic-bezier(.55,.03,.31,1)',fill:'forwards'};
      const tasks=leaves.map(({leaf,dx})=>leaf.animate([{transform:'translateX(0)'},{transform:'translateX('+dx+'px)'}],options).finished);
      tasks.push(sheet.animate([{opacity:1},{opacity:0}],{duration:530,fill:'forwards'}).finished);
      const remove=()=>overlay.remove();
      signal.addEventListener('abort',remove,{once:true});
      Promise.allSettled(tasks).then(()=>{remove();signal.removeEventListener('abort',remove);});
    };
  }
  function story(page,signal,reduced,advance){
    if(signal.aborted)return;
    if(reduced||!page.animate){advance();return;}
    const moveOn=()=>{if(!signal.aborted)advance();};
    if(document.startViewTransition){
      // Snapshot the whole printed sheet. The next scene is visible under
      // its receding top edge, while the site's header stays on the wall.
      const root=document.documentElement;
      page.classList.add('c-loose-sheet');
      root.classList.add('c-dropping-story');
      const transition=document.startViewTransition(()=>{
        page.classList.remove('c-loose-sheet');
        moveOn();
      });
      transition.finished.finally(()=>{
        page.classList.remove('c-loose-sheet');
        root.classList.remove('c-dropping-story');
      });
      return;
    }
    page.classList.add('c-loose-sheet');
    const animation=page.animate(
      [{transform:'none'},{transform:'translate(1vw,110vh) rotate(2deg)'}],
      {duration:600,easing:'cubic-bezier(.5,.04,.8,.54)',fill:'forwards'}
    );
    const cancel=()=>animation.cancel();
    signal.addEventListener('abort',cancel,{once:true});
    animation.finished.then(moveOn,()=>{}).finally(()=>{
      signal.removeEventListener('abort',cancel);
      animation.cancel();page.classList.remove('c-loose-sheet');
    });
  }
  root.OpeningPageTurn={brush,capture,story};
})(window);

;
(function(){
  'use strict';
  // A rehearsal uses the player's current panels. It never moves a prop or the real tin.
  const cues=[
    [['ramp','bridge','Swap the ramp and the bridge. Drag one panel onto the other, or tap the pair.'],['start','ramp','Press Play. Hold Right to roll. Jump at the lip with Space or the Jump button.']],
    [['bridgeLock','ropeBridge','Roll into the cradle. Its half-turn locks the bridge.'],['ropeSlope','cageExit','Follow the slope down to the cage. A loose bridge drops before you reach it.']],
    [['brace','down','The wedge fits the bridge supports. Roll into it on the upper platform.'],['lowBridge','goalLow','Once the bridge holds, jump the gap at the missing plank.']],
    null,
    [['cue','upperPin','Roll into the bell to cue the singer. The upper pin comes free after the bell rings.'],['catch','lowerPin','Trip the safety catch before the lower pin. Both pins then release the scenery.']],
    [['counterCargo','load','Let the dancer lower the chest. Roll to the trolley to take the load.'],['brake','cargoBridge','Select Inspect on the brake. Wind it clockwise, then roll the loaded cart across.']]
  ];
  window.OpeningRehearsal={mount({index,board,content,listen,signal,reduced,autoOpen=true}){
    if(!cues[index])return;
    const opener=document.createElement('button');opener.type='button';opener.className='rehearsal-link';opener.textContent='Rehearse';
    content.querySelector('.p-guide-state').append(opener);
    const card=document.createElement('aside');card.className='rehearsal-card';card.hidden=true;card.setAttribute('aria-label','Scene rehearsal');
    card.innerHTML='<canvas width="284" height="110" aria-hidden="true"></canvas><div><p aria-live="polite"></p><nav aria-label="Rehearsal controls"><button type="button" data-next>Next cue</button><button type="button" data-end>Try it</button></nav></div>';
    content.append(card);
    const drawing=card.querySelector('canvas'),ctx=drawing.getContext('2d');
    let step=0,raf=0,start=0,lastInk=-Infinity;
    const getFrame=piece=>board.querySelector('.p-frame[data-piece="'+piece+'"]');
    function ink(t){
      if(card.hidden||signal?.aborted)return;
      // Miniatures are printed on twos; repainting them at display frequency
      // spends work without changing the readable gesture.
      if(t-lastInk<1000/12){raf=requestAnimationFrame(ink);return;}
      lastInk=t;
      const [a,b]=cues[index][step];
      ctx.clearRect(0,0,drawing.width,drawing.height);
      const u=reduced?0:Math.min(1,Math.max(0,(t-start-750)/650)),ease=u*u*(3-2*u);
      [a,b].forEach((piece,i)=>{
        const frame=getFrame(piece),im=frame?.querySelector('canvas');
        if(!im?.width||!im.height)return;
        const swapping=index===0&&step===0,progress=swapping?(i?1-ease:ease):i;
        const x=5+progress*141,y=swapping?13+(i?1:-1)*9*Math.sin(Math.PI*ease):13;
        const w=132,h=83,sw=Math.min(im.width,im.height*w/h),sh=sw*h/w;
        ctx.fillStyle='#171717';ctx.fillRect(x-2,y-2,w+4,h+4);
        ctx.drawImage(im,(im.width-sw)/2,(im.height-sh)*.7,sw,sh,x,y,w,h);
      });
      if(t-start>2600)start=t;
      raf=requestAnimationFrame(ink);
    }
    function setStep(n){
      step=n;const [a,b,copy]=cues[index][n];
      card.querySelector('p').textContent=index===0&&n===1&&matchMedia('(pointer:coarse)').matches
        ?'Tap Play. Drag to the right in the tin’s panel to roll. Tap Jump at the lip.'
        :copy;
      card.querySelector('[data-next]').hidden=n===1;start=performance.now();
      for(const frame of board.querySelectorAll('.p-frame'))frame.classList.toggle('rehearsal-subject',[a,b].includes(frame.dataset.piece));
    }
    function close(){
      card.hidden=true;opener.setAttribute('aria-expanded','false');cancelAnimationFrame(raf);
      board.querySelectorAll('.rehearsal-subject').forEach(frame=>frame.classList.remove('rehearsal-subject'));
    }
    function open(){
      close();card.hidden=false;opener.setAttribute('aria-expanded','true');setStep(0);raf=requestAnimationFrame(ink);
    }
    listen(opener,'click',()=>card.hidden?open():close());listen(card.querySelector('[data-next]'),'click',()=>{setStep(1);card.querySelector('[data-end]').focus();});
    listen(card.querySelector('[data-end]'),'click',()=>{close();board.querySelector('.p-frame:not(.p-fixed)')?.focus();});
    // Closing the card reflows the board on phones. Finish the gesture at its drawn location first.
    const finishFrameInput=e=>{if(!e.target.closest('button'))close();};
    listen(board,'pointerup',finishFrameInput,{capture:true});listen(board,'keydown',finishFrameInput,{capture:true});
    listen(content,'click',e=>{if(e.target.closest('.p-actions,[data-turn],.p-frame-tools button'))close();},{capture:true});listen(window,'keydown',e=>{if(e.key==='Escape'&&!card.hidden){close();opener.focus();}});
    signal?.addEventListener('abort',close,{once:true});
    if(!autoOpen)return;
    const key='can-act-rehearsed-'+index;
    try{if(!sessionStorage.getItem(key)){open();sessionStorage.setItem(key,'1');}}catch{open();}
  }};
})();

;
(function(){
  'use strict';
  function showOrderNote(content,env,onDrop){
    const under=[...content.children];
    const cover=document.createElement('div');
    cover.className='p-order-cover';cover.tabIndex=-1;
    cover.setAttribute('role','group');cover.setAttribute('aria-label','Stage cue');
    const note=document.createElement('button');
    note.type='button';note.className='p-order-note';
    note.setAttribute('aria-label','Triangle first, double slash second. Take down the note to begin.');
    note.innerHTML=window.OpeningLaterScenes.orderSlip();
    for(const el of under)el.inert=true;
    cover.append(note);content.append(cover);
    cover.focus({preventScroll:true});
    env.listen(cover,'keydown',e=>{
      if(e.target===cover&&['Enter',' '].includes(e.key)){e.preventDefault();note.click();}
    });
    env.listen(note,'click',()=>{
      if(note.disabled)return;
      note.disabled=true;env.cue('paper');
      const release=()=>{
        cover.remove();
        for(const el of under)el.inert=false;
        onDrop();
        if(document.activeElement===document.body)content.querySelector('.p-frame:not(.p-fixed)')?.focus({preventScroll:true});
      };
      if(env.reduced){release();return;}
      cover.classList.add('p-note-dropped');env.after(release,560);
    });
  }
  function woodenDragonCue({board,content,listen,announce,reduced,objective}){
    const button=document.createElement('button');
    button.type='button';button.className='p-dragon-demo-toggle';
    content.querySelector('.p-guide-state').append(button);
    const beats=[
      {piece:'counter',text:'The dancer steps on the pedal. The rope lifts the jaws.',until:2150},
      {piece:'pawl',text:'Inspect the ratchet. Turn it clockwise to hold the rope.',until:5150},
      {piece:'dragon',text:'The jaws stay open. Roll up the ramp and through.',until:7350}
    ];
    const still='The pedal opens the jaws. Turn the ratchet clockwise to hold them open, then roll up the ramp.';
    let elapsed=null,active=-1,flockSeconds=null;
    function mark(pieces=[]){
      for(const frame of board.querySelectorAll('.p-frame'))frame.classList.toggle('p-demo-focus',pieces.includes(frame.dataset.piece));
    }
    function stop(text){
      if(elapsed===null)return;
      elapsed=null;active=-1;mark();board.classList.remove('p-dragon-demo');
      flockSeconds=0;
      button.textContent=reduced?'Show demo':'Replay demo';button.setAttribute('aria-pressed','false');
      if(text)announce(text);
    }
    function tick(delta){
      if(elapsed===null){if(!reduced)flockSeconds+=delta/1000;return;}
      if(reduced)return;
      elapsed+=delta;
      const i=beats.findIndex(beat=>elapsed<beat.until);
      if(i<0){stop('Place the pedal before the ratchet, then inspect the crank.');return;}
      if(i===active)return;
      active=i;mark([beats[i].piece]);announce(beats[i].text);
    }
    function start(){
      elapsed=0;active=-1;flockSeconds=null;board.classList.add('p-dragon-demo');button.setAttribute('aria-pressed','true');
      button.textContent=reduced?'Hide demo':'Skip demo';
      if(reduced){mark(['counter','pawl','dragon']);announce(still);}
      else tick(0);
    }
    function cancel(){stop(objective);}
    listen(button,'click',()=>elapsed===null?start():cancel());
    // Arrange, inspect, play or ask for a tiered hint immediately, even midway through the demo.
    listen(board,'pointerdown',cancel,{capture:true});
    listen(board,'click',cancel,{capture:true});
    listen(board,'keydown',e=>{if(['Enter',' ','ArrowLeft','ArrowRight','f','F','Escape'].includes(e.key))cancel();},{capture:true});
    listen(content,'click',e=>{if(e.target.closest('.p-actions,[data-turn]'))cancel();},{capture:true});
    function picture(){
      if(elapsed===null||reduced)return null;
      const progress=(start,duration)=>{
        const u=Math.max(0,Math.min(1,(elapsed-start)/duration));return u*u*(3-2*u);
      };
      return {lift:progress(360,950),crank:progress(2530,780)};
    }
    start();
    return {tick,picture,get flockSeconds(){return flockSeconds;}};
  }
  window.OpeningPanels={create:function(env){
    const {W,B,base,saved,save,listen,cue,hint,renderer,reduced}=env;
    return function(index){
      const def=W.levels[index];saved.level=index;saved.furthest=Math.max(saved.furthest,index);save();
      const content=base('','',''),body=env.getBody(),app=env.getApp();
      body.classList.add('c-game-page','p-page');app.classList.add('puzzle-mode');
      content.innerHTML='<div class="p-masthead"><span class="p-issue">'+def.chapter+'</span><h1>'+def.title+'</h1></div><section class="p-board" id="p-board" aria-label="'+def.title+', puzzle panels"></section><div class="p-guide-state"><strong id="p-step-label">Arrange</strong></div><div class="p-message" id="p-message" role="status" aria-live="polite"></div><nav class="p-actions" aria-label="Puzzle controls"><button id="p-arrange" aria-label="Pause to arrange scenes" title="Swap scenes">Arrange</button><button id="p-play" aria-label="Play" title="Play">Play ▶</button><button id="p-retry" aria-label="Restart this chapter" title="Restart from the entrance">Restart ↶</button><button id="p-jump" class="p-jump" aria-label="Jump" title="Jump">Jump ↑</button><button id="p-help" aria-label="Show the first hint" title="Hint">Hint</button></nav>';
      const board=document.getElementById('p-board'),message=document.getElementById('p-message'),playButton=document.getElementById('p-play');
      const compactTouch=matchMedia('(pointer:coarse) and (max-width:720px), (pointer:coarse) and (max-height:540px)');
      const slotPage=index===0?window.OpeningLevelOne:index===1?window.OpeningLevelTwo:window.OpeningLaterLayouts.forLevel(index);
      content.querySelector('.p-masthead h1').textContent=def.en;
      const storyImage=new Image();
      storyImage.src=B.assets[index===0?'assets/theatre-v33/chapter-01-bridge.webp':'assets/stories-v32/chapter-'+String(index+1).padStart(2,'0')+'.webp'];
      let paintedExchange=null,leaving=false,lastIdlePaint=-Infinity;
      let dragonCue=null,orderNoteUp=index===4;
      let spreadStage=null,inkBounds=null;
      if(slotPage){
        board.classList.add(index===0?'p-first-slots':index===1?'p-second-slots':'p-later-slots');
        content.classList.add('p-spread-content');
        spreadStage=document.createElement('div');
        spreadStage.className='p-spread-stage';
        board.replaceWith(spreadStage);
        spreadStage.append(board);
        const slots=slotPage.layout(1000,560);
        const x=Math.min(...slots.map(r=>r.x)),y=Math.min(...slots.map(r=>r.y));
        inkBounds={x,y,width:Math.max(...slots.map(r=>r.x+r.w))-x,height:Math.max(...slots.map(r=>r.y+r.h))-y};
      }
      let order=def.initial.slice(),modes={},world=W.create(index,order,modes),playing=false,lastTime=0,jump=false,pointer=null,complete=false,active=-1;
      const keys=new Set();let views=[],hintStep=0,inspecting=false,selected=null,dragPointer=null,lastWorldMessage='',smallLayout=window.innerWidth<600,hintUntil=0,lastEvent=-1,slotSize='';
      const narrationSignal=env.getSignal?.();let introduction=null,bridgeVoiceQueued=false,crocodileVoiceQueued=false;
      function narrate(id,when){return env.say(id,true,false,{once:true,when});}
      const layouts={
        4:[[0,0,49,48.5,0],[51,0,49,48.5,0],[0,51.5,49,48.5,0],[51,51.5,49,48.5,0]],
        5:[[0,0,32,48.5,0],[34,0,32,48.5,0],[68,0,32,48.5,0],[0,51.5,49,48.5,0],[51,51.5,49,48.5,0]],
        6:[[0,0,32,48.5,0],[34,0,32,48.5,0],[68,0,32,48.5,0],[0,51.5,32,48.5,0],[34,51.5,32,48.5,0],[68,51.5,32,48.5,0]]
      };
      const pad=window.OpeningTouchPad?.mount({content,listen,canMove:()=>playing&&!inspecting&&!env.isModal()&&!complete&&!world.failed,
        jump:()=>{jump=true;},clear:clearInput});
      function moveGuide(){
        if(pad?.enabled)return 'Hold ← or → below the page to roll. Tap Jump to leap.';
        return matchMedia('(pointer:coarse)').matches?'Drag right in the tin’s panel to roll. Tap Jump at a gap.':'Hold A/D or ← → to roll. Press Space to jump.';
      }
      function announce(text){if(message.textContent!==text)message.textContent=text;message.classList.toggle('visible',!!text);}
      function clearHint(){hintUntil=0;board.querySelectorAll('.p-hint-focus').forEach(el=>el.classList.remove('p-hint-focus'));}
      function resetHintProgress(){hintStep=0;const button=document.getElementById('p-help');button.textContent='Hint';button.setAttribute('aria-label','Show the first hint');}
      function showHint(){if(complete||inspecting)return;hintStep=Math.min(3,hintStep+1);const result=W.guidance(world,hintStep);announce(result.text);hintUntil=performance.now()+6500;views.forEach(v=>v.el.classList.toggle('p-hint-focus',result.pieces.includes(world.route[v.n])));const button=document.getElementById('p-help');button.textContent='Hint '+hintStep+'/3';button.setAttribute('aria-label',hintStep===3?'Repeat the last hint':'Show hint '+(hintStep+1));}
      function clearDrag(){board.querySelectorAll('.p-drop,.p-lifted').forEach(e=>e.classList.remove('p-drop','p-lifted'));dragPointer=null;}
      function clearInput(){
        keys.clear();pointer=null;jump=false;clearDrag();pad?.release();
        window.OpeningSFX?.stopCue?.('crocodileLaugh');
        window.OpeningSFX?.stopCue?.('crocodileChomp');
        window.OpeningSFX?.stopCue?.('dragonBite');
        window.OpeningSFX?.stopCue?.('dragonGulp');
      }
      function buttonState(){const phase=complete?'complete':world.failed?'failed':playing?'play':'arrange';playButton.hidden=complete;playButton.disabled=complete;playButton.textContent=world.failed?'Retry ▶':playing?'Pause Ⅱ':world.elapsed>0?'Resume ▶':'Play ▶';playButton.setAttribute('aria-label',playButton.textContent);playButton.title=playButton.textContent;body.classList.toggle('p-playing',playing);body.dataset.phase=phase;board.dataset.phase=phase;document.getElementById('p-step-label').textContent=complete?'Chapter complete':playing?'Onstage':world.failed?'Try another arrangement':slotPage?'Drag scenes to swap them':'Drag panels to swap them';document.getElementById('p-arrange').disabled=complete||(!playing&&!world.failed);document.getElementById('p-jump').disabled=!playing;document.getElementById('p-retry').disabled=complete;document.getElementById('p-help').disabled=complete;pad?.sync();B.music?.scene(playing?'run':'level');}
      function next(){
        if(!complete||leaving||!board.isConnected)return;
        leaving=true;
        env.afterNarration(()=>{
          if(!complete||!board.isConnected)return;
          const reveal=reduced?null:window.OpeningPageTurn.capture(views,slotPage);
          env.open('storybook',index);
          reveal?.(env.getSignal());
          document.querySelector('.c-story-page')?.classList.add('c-story-applause');
          cue('puzzleApplause');
        },true);
      }
      function reset(run=false,repaint=true){world=W.create(index,order,modes);complete=false;bridgeVoiceQueued=false;crocodileVoiceQueued=false;playing=run;clearInput();clearHint();selected=null;lastWorldMessage='';lastEvent=-1;active=-1;board.querySelectorAll('.p-selected').forEach(el=>el.classList.remove('p-selected'));board.classList.remove('p-complete','p-failed');announce('');buttonState();if(repaint)draw(0);}
      function exchange(i,j){
        if(i<0||j<0||i>=order.length||j>=order.length||i===j)return;
        paintedExchange=reduced?null:{slots:[i+1,j+1],start:null};
        playing=false;[order[i],order[j]]=[order[j],order[i]];resetHintProgress();reset(false,false);createFrames();cue('swap');
        board.querySelector('[data-slot="'+(j+1)+'"]')?.focus({preventScroll:true});announce('Scenes swapped. Press Play to try this route.');
      }
      function turn(type){
        if(inspecting||complete)return;playing=false;selected=null;views.forEach(v=>v.el.classList.remove('p-selected'));clearInput();clearHint();buttonState();inspecting=true;const originalMode=!!modes[type];
        const view=views.find(v=>world.route[v.n]===type);
        function paintCloseUp(canvas){
          const g=canvas.getContext('2d'),width=330,height=160,left=42,top=W.pieces[type].input-144;
          const scale=canvas.width/width;
          g.save();g.setTransform(scale,0,0,scale,0,-top*scale);
          renderer(g,world,view.n*W.P+left,performance.now(),view.n,{left,right:left+width,top,bottom:top+height,width,height,scale});
          g.restore();
        }
        window.OpeningMechanism.show({host:body,type,name:W.pieces[type].name,paintCloseUp,locked:!!modes[type],listen,cue,reduced,signal:narrationSignal,
          onChange:on=>{modes[type]=on;world.modes[type]=on;draw(performance.now());},onClose:()=>{if(!body.isConnected||!board.isConnected)return;inspecting=false;const changed=originalMode!==!!modes[type];if(changed){reset(false);resetHintProgress();}createFrames();buttonState();content.querySelector('[data-turn="'+type+'"]')?.focus({preventScroll:true});announce(changed?'Crank set. Press Play to try the mechanism.':world.failed?'Try a different panel order.':world.elapsed>0?'Press Resume to pick up where you left off.':'Back on stage. Press Play to try it.');}});
      }
      function createFrames(){
        const route=[def.start].concat(order,def.end),small=window.innerWidth<600;
        const layout=small&&route.length>4?[[0,0,49,31,0],[51,0,49,31,0],[0,34.5,49,31,0],[51,34.5,49,31,0],[0,69,49,31,0],[51,69,49,31,0]]:layouts[route.length];
        board.innerHTML=route.map((type,n)=>{
          const fixed=n===0||n===route.length-1,pos=layout[n],turnable=W.pieces[type].turnable;
          return '<article class="p-frame'+(fixed?' p-fixed':'')+'" data-slot="'+n+'" data-piece="'+type+'" '+(!fixed?'draggable="false" tabindex="0"':'')+' style="--px:'+pos[0]+'%;--py:'+pos[1]+'%;--pw:'+pos[2]+'%;--ph:'+pos[3]+'%;--pr:'+pos[4]+'deg" aria-label="'+(n+1)+', '+W.pieces[type].name+(fixed?', fixed panel':'. Drag to swap, or move with the left and right arrow keys.')+'"><canvas width="400" height="400" aria-label="'+W.pieces[type].name+' scene"></canvas><span class="p-number" aria-hidden="true">'+String(n+1).padStart(2,'0')+'</span><span class="p-piece-name">'+W.pieces[type].name+'</span>'+(turnable?'<button class="p-turn" data-turn="'+type+'" aria-label="'+W.pieces[type].name+', inspect crank, currently '+(modes[type]?'locked':'released')+'" title="Inspect crank, currently '+(modes[type]?'locked':'released')+'">Inspect<span class="p-inspect-target"> '+W.pieces[type].name.toLowerCase()+'</span><span class="p-inspect-arrow" aria-hidden="true"> ↗</span></button>':'')+(!fixed?'<div class="p-frame-tools"><button data-shift="-1" aria-label="Move '+W.pieces[type].name+' earlier">←</button><button data-shift="1" aria-label="Move '+W.pieces[type].name+' later">→</button></div>':'')+'</article>';
        }).join('');
        views=[...board.querySelectorAll('.p-frame')].map((el,n)=>({el,canvas:el.querySelector('canvas'),ctx:el.querySelector('canvas').getContext('2d'),n}));
        if(slotPage)views.forEach(v=>{const slot=slotPage.slots[v.n];v.el.dataset.slotId=slot.id;v.el.dataset.mask=slot.mask;v.el.style.setProperty('--slot-mask',slot.clip);});
        slotPage?.decorate?.(board,B);
        views.forEach(({el})=>{el.querySelector('[data-turn]')?.addEventListener('click',e=>{e.stopPropagation();turn(e.currentTarget.dataset.turn);});});
        window.OpeningInkFrames.decorate(views,slotPage,board,index);
        views.forEach(v=>{
          const el=v.el,canvas=v.canvas,movable=v.n>0&&v.n<route.length-1;
          function choose(){if(!movable||playing||inspecting||complete)return;if(selected!==null&&selected!==v.n-1){const old=selected;selected=null;exchange(old,v.n-1);}else{selected=selected===v.n-1?null:v.n-1;views.forEach(q=>q.el.classList.toggle('p-selected',q.n-1===selected));announce(selected===null?(slotPage?'Swap two scenes, then press Play.':'Swap two panels, then press Play.'):'Select another scene to swap, or drag this one onto it.');}}
          el.onpointerdown=e=>{if(!movable||playing||inspecting||complete||dragPointer||e.isPrimary===false||e.button!==0||e.target.closest('button'))return;dragPointer={id:v.n-1,pointerId:e.pointerId,x:e.clientX,y:e.clientY,moved:false,el};el.setPointerCapture(e.pointerId);};
          el.onpointermove=e=>{if(!dragPointer||dragPointer.el!==el||dragPointer.pointerId!==e.pointerId)return;const dx=e.clientX-dragPointer.x,dy=e.clientY-dragPointer.y;if(Math.hypot(dx,dy)>8)dragPointer.moved=true;if(!dragPointer.moved)return;el.classList.add('p-lifted');el.style.setProperty('--drag-x',dx+'px');el.style.setProperty('--drag-y',dy+'px');views.forEach(q=>{if(q.el===el||q.el.classList.contains('p-fixed'))return;const r=q.el.getBoundingClientRect(),inside=slotPage?slotPage.contains(q.n,(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height):e.clientX>=r.left&&e.clientX<=r.right&&e.clientY>=r.top&&e.clientY<=r.bottom;q.el.classList.toggle('p-drop',inside);});};
          el.onpointerup=e=>{if(!dragPointer||dragPointer.el!==el||dragPointer.pointerId!==e.pointerId)return;const d=dragPointer,target=views.find(q=>q.el.classList.contains('p-drop'));clearDrag();if(d.moved){if(target)exchange(d.id,target.n-1);else announce('Drop the scene onto another movable panel.');}else choose();};
          el.onpointercancel=clearDrag;el.onlostpointercapture=()=>{if(dragPointer?.el===el)clearDrag();};
          el.onclick=e=>{if(e.detail===0&&!e.pointerType&&!e.target.closest('button'))choose();};
          el.onkeydown=e=>{if(e.target.closest('button')||inspecting||complete)return;if(!playing&&movable&&(e.key==='Enter'||e.key===' ')){e.preventDefault();choose();return;}if(!playing&&e.key.toLowerCase()==='f'&&W.pieces[route[v.n]].turnable){e.preventDefault();turn(route[v.n]);return;}if(!playing&&movable&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();exchange(v.n-1,v.n-1+(e.key==='ArrowRight'?1:-1));}};
          
          el.querySelectorAll('[data-shift]').forEach(b=>{const destination=v.n-1+Number(b.dataset.shift);b.disabled=destination<0||destination>=order.length;b.onclick=()=>{if(!playing&&!inspecting&&!complete)exchange(v.n-1,destination);};});
          function pointerLocal(clientX){
            const rect=canvas.getBoundingClientRect();
            const stageX=v.camera?(clientX-rect.left-v.camera.left)/v.camera.scale:(clientX-rect.left)/rect.width*W.P;
            return slotPage?.playableLocalX?.(v.n,stageX,world)??stageX;
          }
          canvas.onpointerdown=e=>{
            if(!playing||pad?.enabled&&e.pointerType==='touch'||e.isPrimary===false||e.button!==0||pointer)return;e.preventDefault();const actorIndex=Math.floor(world.actor.x/W.P);
            if(v.n!==actorIndex)return;
            const local=pointerLocal(e.clientX),target=v.n*W.P+local;
            pointer={id:e.pointerId,x:e.clientX,local,move:Math.max(-1,Math.min(1,(target-world.actor.x)/80))};
            canvas.setPointerCapture(e.pointerId);
          };
          canvas.onpointermove=e=>{if(pointer&&pointer.id===e.pointerId){const delta=e.clientX-pointer.x;if(Math.abs(delta)>7){const travel=slotPage?pointerLocal(e.clientX)-pointer.local:delta;pointer.move=Math.max(-1,Math.min(1,travel/60));}}};
          canvas.onpointerup=e=>{if(pointer?.id===e.pointerId)pointer=null;};canvas.onpointercancel=()=>{pointer=null;};canvas.onlostpointercapture=()=>{pointer=null;};
        });
        active=-1;slotSize='';draw(0);
      }
      function draw(time){
        if(spreadStage){
          const areaW=spreadStage.clientWidth,areaH=spreadStage.clientHeight,size=areaW+':'+areaH;
          if(areaW&&areaH&&size!==slotSize){
            slotSize=size;
            const scale=Math.min(areaW/inkBounds.width,areaH/inkBounds.height);
            const width=1000*scale,height=560*scale;
            const left=(areaW-inkBounds.width*scale)/2-inkBounds.x*scale;
            const top=(areaH-inkBounds.height*scale)/2-inkBounds.y*scale;
            Object.assign(board.style,{width:width+'px',height:height+'px',left:left+'px',top:top+'px'});
            const layout=slotPage.layout(width,height);
            views.forEach(v=>{
              const r=layout[v.n];
              for(const [key,value]of Object.entries({px:r.x,py:r.y,pw:r.w,ph:r.h}))v.el.style.setProperty('--'+key,value+'px');
            });
            slotPage.resize?.(board,width,height);
          }
        }
        const at=Math.max(0,Math.min(views.length-1,Math.floor(world.actor.x/W.P)));
        if(at!==active){active=at;board.dataset.active=String(at);views.forEach((v,i)=>{v.el.classList.toggle('p-current',i===at);v.el.classList.toggle('p-past',i<at);});}
        const sequence=order.join(',');
        if(board.dataset.order!==sequence)board.dataset.order=sequence;
        if(board.dataset.playing!==String(playing))board.dataset.playing=String(playing);
        if(board.dataset.complete!==String(complete))board.dataset.complete=String(complete);
        for(const v of views){
          const width=slotPage?v.canvas.clientWidth:v.el.clientWidth,height=slotPage?v.canvas.clientHeight:v.el.clientHeight;if(!width||!height)continue;
          const dpr=Math.min(window.devicePixelRatio||1,1.5),pw=Math.round(width*dpr),ph=Math.round(height*dpr);
          if(v.canvas.width!==pw||v.canvas.height!==ph){v.canvas.width=pw;v.canvas.height=ph;}
          const ctx=v.ctx,type=world.route[v.n],piece=W.pieces[type],floor=Math.max(piece.input,piece.output);
          // Frame the playable action, not the full hanging cable / buried stage supports.
          // Tall foreground props retain their real bounds; decorations may extend off-frame.
          const specialTop={cage:piece.input-326,goal:piece.input-262,goalLow:piece.input-262,dragon:36,pressure:78,counter:78,counterCargo:78,load:64,lift:112};
          const actionTop=specialTop[type]??Math.min(piece.input,piece.output)-(piece.input!==piece.output?115:150);
          const bottom=floor+22,usableHeight=Math.max(40,height-16),slotCamera=slotPage?.camera(v.n,type,width,height,world),scale=slotCamera?.scale??Math.min(width/W.P,usableHeight/(bottom-actionTop));
          const visibleHeight=height/scale,visibleWidth=width/scale,left=slotCamera?.left??(width-W.P*scale)/2;
          let top=slotCamera?.top??bottom-visibleHeight+8/scale;
          // Only pan vertically when an actual jump needs room; never shrink the cast mid-jump.
          if(!slotPage&&v.n===at&&playing&&!world.actor.grounded)top=Math.min(top,world.actor.y+W.R-92-6/scale);
          const view={left:-left/scale,right:(width-left)/scale,top,bottom:top+visibleHeight,width:visibleWidth,height:visibleHeight,scale,failElapsedMs:type==='bridge'?world.crocodileMs:null};
          if(compactTouch.matches)view.minActorHeight=Math.min(42,width*.47,height*.65)/scale;
          if(dragonCue){view.dragonCue=dragonCue.picture();view.flockSeconds=dragonCue.flockSeconds;}
          v.camera={left,top,scale};
          ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);if(v.el.dataset.mask!=='open'){ctx.fillStyle='#f5f5f5';ctx.fillRect(0,0,width,height);}
          ctx.save();ctx.scale(scale,scale);ctx.translate(0,-top);
          renderer(ctx,world,v.n*W.P+view.left,time,v.n,view);ctx.restore();
          if(paintedExchange&&paintedExchange.slots.includes(v.n)){
            const progress=paintedExchange.start===null?0:Math.max(0,(performance.now()-paintedExchange.start)/220);
            if(progress>=1)paintedExchange=null;
            else window.OpeningPageTurn.brush(ctx,width,height,progress,v.n);
          }
          const f=world.flags,on=type==='reel'?f.latched:type==='brace'?f.wedge:type==='pawl'?f.jawLocked:type==='cue'?f.cued:type==='catch'?f.safe:type==='brake'?f.secured:type==='pressure'?f.unlock:type==='counter'?f.jaw:type==='counterCargo'?f.crate:false;v.el.classList.toggle('p-engaged',!!on);
        }
        if(paintedExchange&&paintedExchange.start===null)paintedExchange.start=performance.now();
      }
      function startOrPause(){
        if(orderNoteUp||complete)return;
        B.audio.unlock();if(world.failed)reset(false);
        if(inspecting)return;playing=!playing;selected=null;views.forEach(v=>v.el.classList.remove('p-selected'));clearInput();clearHint();announce(playing?moveGuide():'Paused. Resume here, or swap scenes to start from the entrance.');hintUntil=performance.now()+4500;buttonState();board.classList.remove('p-failed');
        if(playing&&index<2&&!introduction)introduction=narrate(index===0?'level-01-intro':'level-02-intro');
        board.focus({preventScroll:true});
      }
      board.tabIndex=-1;listen(playButton,'click',startOrPause);
      listen(document.getElementById('p-arrange'),'click',()=>{if(complete||inspecting)return;playing=false;clearInput();clearHint();buttonState();announce(world.failed?world.message:slotPage?'Drag one scene onto another to swap them inside their frames.':'Drag to swap panels, or resume here.');views.find(v=>!v.el.classList.contains('p-fixed'))?.el.focus({preventScroll:true});});
      listen(document.getElementById('p-retry'),'click',()=>{if(inspecting)return;reset(playing);announce(playing?moveGuide():'Back at the entrance. You can arrange the scenes again.');});
      const jumpButton=document.getElementById('p-jump');
      listen(jumpButton,'click',()=>{if(playing&&!inspecting)jump=true;});
      // While one thumb rolls the tin, browsers suppress click for the second thumb.
      listen(jumpButton,'pointerdown',e=>{if(playing&&!inspecting&&e.pointerType==='touch'&&!e.isPrimary){e.preventDefault();jump=true;}});
      listen(document.getElementById('p-help'),'click',showHint);
      listen(window,'keydown',e=>{
        if(orderNoteUp||env.isModal()||inspecting)return;
        if(e.target instanceof Element&&(e.target.closest('input,select,textarea,[contenteditable="true"]')||e.target.closest('button')&&[' ','Enter'].includes(e.key)))return;
        if(playing&&['ArrowRight','ArrowLeft','ArrowUp',' ','a','d','A','D','w','W'].includes(e.key)){
          e.preventDefault();keys.add(e.key.toLowerCase());if(['ArrowUp',' ','w','W'].includes(e.key))jump=true;
        }else if(e.key==='Escape'){playing=false;clearInput();selected=null;views.forEach(v=>v.el.classList.remove('p-selected'));buttonState();}
      });
      listen(window,'keyup',e=>keys.delete(e.key.toLowerCase()));
      listen(window,'blur',()=>{playing=false;clearInput();buttonState();});
      listen(document,'visibilitychange',()=>{if(document.hidden){playing=false;clearInput();buttonState();}});
      listen(window,'resize',()=>{const small=window.innerWidth<600;if(small!==smallLayout){smallLayout=small;clearInput();selected=null;createFrames();}});
      function finish(){
        playing=false;clearInput();buttonState();
        if(world.done){
          complete=true;world.flags.rescued=true;
          if(def.rescue)saved.ducks=Math.max(saved.ducks,def.rescue);
          saved.furthest=Math.max(saved.furthest,index+1);save();board.classList.add('p-complete');buttonState();
          announce(world.message);
          env.after(()=>{if(complete)next();},90);
        }else{board.classList.add('p-failed');announce(world.message);if(world.crocodileMs===null&&world.dragonBiteMs===null)cue('failure');}
      }
      // Sound follows physical state changes; a held key or a render frame is not a new action.
      function soundStep(before){
        if(world.failed||world.done)return;
        if(world.dragonBiteMs!==null){
          const at=world.dragonBiteMs;
          if(before.dragonBiteMs===null){clearHint();lastWorldMessage='';announce('');}
          else if(before.dragonBiteMs<W.dragonTiming.bite&&at>=W.dragonTiming.bite)cue('dragonBite');
          else if(before.dragonBiteMs<W.dragonTiming.gulp&&at>=W.dragonTiming.gulp)cue('dragonGulp');
          return;
        }
        if(world.crocodileMs!==null){
          const previous=before.crocodileMs,current=world.crocodileMs;
          if(previous===null){
            clearHint();lastWorldMessage='';announce('');
          }else if(previous<W.crocodileTiming.laugh&&current>=W.crocodileTiming.laugh){
            cue('crocodileLaugh');
          }else if((previous<540&&current>=540)||(previous<940&&current>=940)){
            cue('crocodileChomp');
          }
          return;
        }
        const actor=world.actor;
        let action=window.OpeningSFX?.mechanismCue?.(world,before);
        if(!action){
          if(before.grounded&&!actor.grounded&&actor.vy<0)action='jump';
          else if(!before.grounded&&actor.grounded)action='land';
          else if(before.y<=440&&actor.y>440)action='whistleDown';
        }
        if(action)cue(action);      }
      function tick(t){
        const frameMs=Math.max(0,t-lastTime)||16,dt=Math.min(.033,frameMs/1000);lastTime=t;
        if(dragonCue&&!env.isModal()&&!document.hidden)dragonCue.tick(Math.min(frameMs,150));
        if(playing&&!env.isModal()&&!inspecting){
          let move=(keys.has('arrowright')||keys.has('d')?1:0)-(keys.has('arrowleft')||keys.has('a')?1:0);
          if(pointer)move=pointer.move;
          if(pad?.direction)move=pad.direction;
          const before={y:world.actor.y,grounded:world.actor.grounded,flags:{...world.flags},crocodileMs:world.crocodileMs,dragonBiteMs:world.dragonBiteMs};
          W.step(world,dt,{move,jump});jump=false;soundStep(before);
          if(index===0&&!crocodileVoiceQueued&&world.route[Math.floor(world.actor.x/W.P)]==='bridge'&&world.actor.x%W.P>=85&&world.actor.x%W.P<165){
            crocodileVoiceQueued=true;const approachedWorld=world;
            narrate('level-01-crocodile',()=>world===approachedWorld&&world.crocodileMs===null&&!world.failed);
          }
          if(index===1&&world.flags.bridgeLocked&&!before.flags.bridgeLocked&&!bridgeVoiceQueued){
            bridgeVoiceQueued=true;const lockedWorld=world;
            narrate('level-02-bridge',()=>world===lockedWorld&&world.flags.bridgeLocked&&!world.failed);
          }
          if(!world.failed&&!world.done&&world.crocodileMs===null&&world.dragonBiteMs===null){
            if(world.message&&world.message!==lastWorldMessage){lastWorldMessage=world.message;announce(world.message);hintUntil=t+3500;}
            if(!world.message)lastWorldMessage='';
            if(world.event!==lastEvent&&t>hintUntil){lastEvent=world.event;announce(W.actionHint(world).text);board.querySelectorAll('.p-hint-focus').forEach(el=>el.classList.remove('p-hint-focus'));}
          }
          if(world.done||world.failed)finish();
        }
        // Keep held input, a brush pass and the victory pose on the display clock.
        // In rehearsal the idle drawings only need the cadence of an animation cel.
        if(playing||paintedExchange||world.done||t-lastIdlePaint>=1000/24){
          draw(t);lastIdlePaint=t;
        }
        env.setFrame(requestAnimationFrame(tick));
      }
      createFrames();buttonState();hint('');
      slotPage.prepareSwaps?.(order,narrationSignal);
      announce(index===0?'Drag the two middle scenes to swap them. The ramp leads up to the bridge.':W.objectives[index]);
      if(index===3)dragonCue=woodenDragonCue({board,content,listen,announce,reduced,objective:W.objectives[index]});
      else{
        const rehearsal=()=>window.OpeningRehearsal.mount({index,board,content,listen,signal:narrationSignal,reduced,autoOpen:index!==4});
        if(orderNoteUp)showOrderNote(content,env,()=>{orderNoteUp=false;rehearsal();});
        else rehearsal();
      }
      env.setFrame(requestAnimationFrame(tick));
    };
  }};
})();

;
(function(root){
 'use strict';
 let app=null,bar=null;
 function mount(target){
  if(target===app&&bar?.isConnected)return;
  clear();bar?.remove();app=target;if(!app)return;
  bar=document.createElement('div');bar.className='c-cinema-subtitles';bar.hidden=true;bar.setAttribute('role','status');bar.setAttribute('aria-live','polite');bar.setAttribute('aria-atomic','true');
  const line=document.createElement('p');bar.append(line);app.append(bar);
 }
 function show(text,meta={}){
  if(!app?.isConnected)mount(document.getElementById('comic-app'));if(!bar)return;
  const value=String(text||'').trim();if(!value){clear();return;}
  bar.firstElementChild.textContent=value;bar.hidden=false;bar.dataset.narration=meta.id||'';
 }
 function clear(){if(bar){bar.hidden=true;bar.firstElementChild.textContent='';}}
 function placeIn(host,signal){
  if(!bar||!app)return;
  const captions=bar,owner=app;
  host.append(captions);
  signal.addEventListener('abort',()=>owner.append(captions),{once:true});
 }
 root.OpeningSubtitles={mount,show,clear,placeIn};
})(window);

;
(function () {
  'use strict';
  if (window.OpeningNarration?.version === 'v47-jon-recordings') return;

  const clips = {
  "entrance-ticket-call": {
    "text": "Tickets, this way! Tap “Get a ticket” and come on in.",
    "file": "entrance-ticket-call.mp3",
    "duration": 4.8,
    "priority": 3
  },
  "curtain-announcement": {
    "text": "House lights down. Orchestra, take it away!",
    "file": "curtain-announcement.mp3",
    "duration": 3.36,
    "priority": 4
  },
  "first-act": {
    "text": "That's your cue. Places, please! Act One.",
    "file": "first-act.mp3",
    "duration": 3.99,
    "priority": 5
  },
  "finale-tribute": {
    "text": "Six acts. Two players rescued. Even a dragon faced, with nothing but a tin lid. Ladies and gentlemen, give our hero the light!",
    "file": "finale-tribute.mp3",
    "duration": 9.6,
    "priority": 6
  },
  "finale-trunk": {
    "text": "Oh. The chest. It seems we left someone off the programme.",
    "file": "finale-trunk.mp3",
    "duration": 5.6,
    "priority": 6
  },
  "level-01-intro": {
    "text": "First, our hero must cross a bridge.",
    "file": "level-01-intro.mp3",
    "duration": 2.96,
    "priority": 5
  },
  "level-01-crocodile": {
    "text": "A little encouragement from below.",
    "file": "level-01-crocodile.mp3",
    "duration": 3.44,
    "priority": 1
  },
  "story-01": {
    "text": "Every hero must take a first step. With no feet to speak of, our hero had to improvise.",
    "file": "story-01.mp3",
    "duration": 7.12,
    "priority": 6
  },
  "level-02-intro": {
    "text": "The dancer is ready. The door isn't.",
    "file": "level-02-intro.mp3",
    "duration": 3.76,
    "priority": 5
  },
  "level-02-bridge": {
    "text": "There. A bridge that knows its job.",
    "file": "level-02-bridge.mp3",
    "duration": 3.92,
    "priority": 2
  },
  "story-02": {
    "text": "The door was open, but the dancer was in no hurry. It was waiting for the right beat to take a bow.",
    "file": "story-02.mp3",
    "duration": 6.8,
    "priority": 6
  },
  "story-03": {
    "text": "The dancer called it a helping hand. Technically, a wing—but we knew what it meant.",
    "file": "story-03.mp3",
    "duration": 6,
    "priority": 6
  },
  "story-04": {
    "text": "A real dragon would breathe fire at this point. This one was waiting for someone to oil its hinges.",
    "file": "story-04.mp3",
    "duration": 7.04,
    "priority": 6
  },
  "story-05": {
    "text": "The singer was free at last, but insisted on finishing the note. Everyone agreed it could do that on the way out.",
    "file": "story-05.mp3",
    "duration": 7.2,
    "priority": 6
  },
  "story-06": {
    "text": "They brought the chest all the way back to the theatre. It was heavier than expected, and occasionally complained about the road.",
    "file": "story-06.mp3",
    "duration": 7.6,
    "priority": 6
  },
  "theatre-hero": {
    "text": "Ladies and gentlemen, your hero for the evening—",
    "file": "theatre-hero.mp3",
    "duration": 3.6,
    "priority": 4
  },
  "theatre-can": {
    "text": "…A can. Well, the label seems confident.",
    "file": "theatre-can.mp3",
    "duration": 4,
    "priority": 5
  },
  "chase-handoff": {
    "text": "Oh, let the magician have it. At this rate, the chase will be the entire show.",
    "file": "chase-handoff.mp3",
    "duration": 5.84,
    "priority": 3
  },
  "finale-prize": {
    "text": "Ladies and gentlemen—your prize, in person.",
    "file": "finale-prize.mp3",
    "duration": 4.64,
    "priority": 6
  },
  "ticket-usher": {
    "text": "From beneath the counter came the rabbit usher's voice.",
    "file": "ticket-usher.mp3",
    "duration": 3.18,
    "priority": 3
  },
  "coins-overture": {
    "text": "He tapped one foot, and three worms struck up the overture.",
    "file": "coins-overture.mp3",
    "duration": 3.68,
    "priority": 3
  },
  "ticket-invitation": {
    "text": "Your invitation.",
    "file": "ticket-invitation.mp3",
    "duration": 1.68,
    "priority": 2
  },
  "duck-dancer": {
    "text": "That wobble was absolutely intentional.",
    "file": "duck-dancer.mp3",
    "duration": 3.52,
    "priority": 2
  },
  "encore-bow": {
    "text": "The cast was finally in order. Fortunately, the applause didn’t have to be.",
    "file": "encore-bow.mp3",
    "duration": 5.44,
    "priority": 6
  },
  "duck-singer": {
    "text": "One note. No apparent end.",
    "file": "duck-singer.mp3",
    "duration": 3.44,
    "priority": 2
  }
};
  for (const clip of Object.values(clips)) Object.freeze(clip);
  Object.freeze(clips);
  // Boundaries between the two spoken sentences in each chapter recording.
  const secondSentenceAt = {'story-01':3.24,'story-02':3.85,'story-03':2.79,'story-04':3.76,'story-05':4.89,'story-06':3.45};
  const normalize = value => String(value || '').normalize('NFKC')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[—–−]/g, '-').replace(/…/g, '...')
    .replace(/\s+/g, ' ').trim().toLowerCase();
  const byText = new Map(Object.entries(clips).map(([id, clip]) => [normalize(clip.text), id]));
  const find = value => clips[value] ? value : byText.get(normalize(value));
  const safe = (fn, ...args) => { try { return fn?.(...args); } catch (error) { console.warn('[OPENING narration callback]', error); } };
  let config = {
    asset: key => window.OPENING_BASE?.assets?.['assets/' + key] || 'assets/' + key,
    enabled: () => window.OPENING_BASE?.audio?.enabled !== false,
    duck: value => window.OPENING_BASE?.music?.duck(value, 'narration'),
    onCaption: null, onClear: null, onState: null, volume: .92
  };
  let active = null, enabled = true, disposed = false, last = { status: 'idle', id: null, reason: null };
  const played = new Set();
  const scopedPlayed = new WeakMap();
  const listeners = [];
  const pauses = new Set();
  let speaker=null,primed=false,priming=false;
  // Twenty milliseconds of PCM silence authorize this one player in the user's tap.
  // All later cues change its source, including those triggered by scene timers.
  const silence='data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA';
  function getSpeaker(){
    if(!speaker){speaker=new Audio();speaker.hidden=true;speaker.setAttribute?.('playsinline','');}
    return speaker;
  }
  function gesture(event){
    if(event?.isTrusted===false||window.navigator?.userActivation?.isActive===false||disposed||document.hidden||!isEnabled({}))return;
    // Some mobile views regain visibility without a separate window focus event.
    const blurred=pauses.has('blur');
    if(blurred)setPaused(false,'blur');
    if(pauses.size)return;
    if(active){
      if(!blurred&&(active.waitingForTap||(!active.started&&active.audio.paused)))startAudio(active,true);
      return;
    }
    if(primed||priming)return;
    try{
      const player=getSpeaker();
      if(player.getAttribute('src')!==silence)player.src=silence;
      priming=true;
      Promise.resolve(player.play()).then(()=>{primed=true;},()=>{}).finally(()=>{priming=false;});
    }catch(_){priming=false;}
  }

  function publish(status, id, reason) {
    last = { status, id: id || null, reason: reason || null };
    safe(config.onState, { ...last });
    if (typeof CustomEvent === 'function') window.dispatchEvent(new CustomEvent('opening:narration', { detail: { ...last } }));
  }
  function onceSet(options) {
    if (options.signal && typeof options.signal === 'object') {
      let set = scopedPlayed.get(options.signal);
      if (!set) scopedPlayed.set(options.signal, set = new Set());
      return set;
    }
    return played;
  }
  function isEnabled(options) {
    if (!enabled || disposed) return false;
    try { return typeof config.enabled === 'function' ? !!config.enabled(options) : config.enabled !== false; }
    catch (_) { return false; }
  }
  function complete(run, status, reason) {
    if (!run || run.done) return;
    run.done = true;
    clearTimeout(run.loadTimer);
    clearTimeout(run.guardTimer);
    for (const [event, callback] of run.events) run.audio.removeEventListener(event, callback);
    run.options.signal?.removeEventListener('abort', run.abort);
    try { run.audio.pause(); run.audio.removeAttribute('src'); run.audio.load(); } catch (_) {}
    run.audio.removeAttribute?.('data-narration-cue');
    if (run.ducked) { run.ducked = false; safe(run.callbacks.duck, false); }
    if (active === run) {
      active = null;
      safe(run.callbacks.onClear, { id: run.id, status, reason });
      publish(status, run.id, reason);
    }
    run.resolve({ status, id: run.id, reason: reason || null });
  }
  function stop(reason = 'stopped') {
    if (active) complete(active, 'cancelled', reason);
  }
  function result(status, id, reason) { return Promise.resolve({ status, id: id || null, reason: reason || null }); }
  function startAudio(run,fromGesture=false) {
    if(run.done||pauses.size)return;
    const attempt=++run.attempt;
    clearTimeout(run.loadTimer);
    run.waitingForTap=false;
    run.loadTimer=setTimeout(()=>complete(run,'error','load-timeout'),18000);
    function failed(error) {
      if(run.done||attempt!==run.attempt||pauses.size)return;
      if(error?.name==='NotAllowedError'){
        clearTimeout(run.loadTimer);clearTimeout(run.guardTimer);
        if(run.options.captionOnBlock){complete(run,'blocked','autoplay-denied');return;}
        // A host may prohibit even gesture-started media. Keep the existing
        // caption and scene progression available after an explicit failed retry.
        if(fromGesture&&run.hadBlockedAttempt){complete(run,'blocked','gesture-denied');return;}
        run.hadBlockedAttempt=true;
        run.waitingForTap=true;publish('waiting-for-tap',run.id);
        safe(run.callbacks.onCaption,clips[run.id].text,{id:run.id,recorded:true});
      }else if(error?.name!=='NotSupportedError'||!run.tryAlternate())complete(run,'error',error?.name||'play-failed');
    }
    try{run.audio.play()?.catch(failed);}catch(error){failed(error);}
  }
  function setPaused(value,reason){
    if(value===pauses.has(reason))return;
    if(value)pauses.add(reason);else pauses.delete(reason);
    if(!active)return;
    if(pauses.size){
      active.attempt++;clearTimeout(active.loadTimer);clearTimeout(active.guardTimer);active.audio.pause();
    }else startAudio(active);
  }

  function play(value, options = {}) {
    const id = find(value);
    if (!id) return result('missing', null, 'unrecorded-cue');
    if (options.signal?.aborted) return result('cancelled', id, 'aborted');
    if (!isEnabled(options)) return result('muted', id, 'sound-off');
    const clip = clips[id];
    const once = onceSet(options);
    if (active?.id === id && options.once) return active.promise;
    if (options.once && once.has(id)) return result('suppressed', id, 'already-played');
    const priority = Number.isFinite(options.priority) ? options.priority : clip.priority;
    if (active && priority < active.priority) return result('suppressed', id, 'higher-priority-cue');
    let src,alternate;
    try {
      src=config.asset('narration-v47/'+clip.file);
      alternate=config.asset('narration-v47/'+clip.file.replace(/\.mp3$/,'.ogg'));
    } catch (_) {}
    if (!src) return result('missing', id, 'missing-asset');
    stop('superseded');
    let audio;
    try { audio = getSpeaker(); } catch (_) { return result('error', id, 'audio-unavailable'); }
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    const run = {
      id, audio, priority, promise, resolve, options, events: [], done: false,
      started: false, ducked: false, waitingForTap:false, hadBlockedAttempt:false, attempt: 0, loadTimer: 0, guardTimer: 0,
      callbacks: { duck: config.duck, onCaption: config.onCaption, onClear: config.onClear },
      abort: () => complete(run, 'cancelled', 'aborted')
    };
    active = run;
    if(audio.canPlayType?.('audio/mpeg')===''&&alternate)[src,alternate]=[alternate,src];
    run.tryAlternate=()=>{
      if(!alternate||run.started||run.done)return false;
      audio.src=alternate;alternate=null;startAudio(run);return true;
    };
    const on = (event, callback) => { audio.addEventListener(event, callback); run.events.push([event, callback]); };
    const sentenceTime=secondSentenceAt[id];
    const sentences=sentenceTime ? clip.text.split(/(?<=\.)\s+/,2) : [clip.text];
    let captionIndex=-1;
    function syncCaption(){
      if(active!==run||!run.started||run.done)return;
      const index=sentenceTime && audio.currentTime>=sentenceTime ? 1 : 0;
      if(index===captionIndex)return;
      captionIndex=index;
      safe(run.callbacks.onCaption,sentences[index],{id,duration:Number.isFinite(audio.duration)?audio.duration:clip.duration,recorded:true});
    }
    let lastMediaTime=-1;
    function watchProgress(){
      if(run.done||!run.started||pauses.size||audio.currentTime===lastMediaTime)return;
      lastMediaTime=audio.currentTime;
      clearTimeout(run.guardTimer);
      // Slow playback is still playback. Only recover when the media clock stops moving.
      run.guardTimer=setTimeout(()=>complete(run,'error','playback-stalled'),10000);
    }
    on('timeupdate',()=>{watchProgress();if(sentenceTime)syncCaption();});
    on('playing', () => {
      if (active !== run || run.done) return;
      if (!isEnabled(options) || options.signal?.aborted) { complete(run, 'cancelled', 'no-longer-active'); return; }
      if(pauses.size){audio.pause();return;}
      clearTimeout(run.loadTimer);
      lastMediaTime=-1;
      const continuing=run.started;
      primed=true;run.waitingForTap=false;run.started=true;watchProgress();
      if(continuing)return;
      if (options.once) once.add(id);
      run.ducked = true;
      safe(run.callbacks.duck, true);
      syncCaption();
      publish('playing', id);
    });
    on('ended', () => complete(run, 'ended'));
    on('error', () => {
      if(!audio.error)return;
      if([3,4].includes(audio.error.code)&&run.tryAlternate())return;
      complete(run,'error','media-error:'+audio.error.code+':'+audio.error.message);
    });
    on('pause', () => {
      if(!pauses.size&&run.started&&!run.done&&audio.paused&&!audio.ended){
        clearTimeout(run.guardTimer);run.waitingForTap=true;publish('paused',run.id,'interrupted');
      }
    });
    options.signal?.addEventListener('abort', run.abort, { once: true });
    audio.preload = 'auto';
    audio.volume = Math.max(0, Math.min(1, Number.isFinite(config.volume) ? config.volume : .92));
    audio.src = src;
    // Keep the active media element inspectable without adding visible controls.
    const host = document.getElementById?.('comic-app');
    if (host && typeof host.append === 'function') {
      audio.hidden = true;
      audio.setAttribute?.('aria-hidden', 'true');
      audio.setAttribute?.('tabindex', '-1');
      audio.setAttribute?.('data-narration-cue', id);
      host.append(audio);
    }
    publish('loading', id);
    startAudio(run);
    return promise;
  }
  function configure(next = {}) {
    config = { ...config, ...next };
    if (active && !isEnabled(active.options)) stop('sound-off');
    return api;
  }
  function add(target, event, fn, capture=false) { target.addEventListener(event, fn, capture); listeners.push([target, event, fn,capture]); }
  if(document.hidden)pauses.add('hidden');
  for(const name of ['touchend','pointerup','click','keydown'])add(document,name,gesture,true);
  add(document, 'visibilitychange', () => setPaused(document.hidden,'hidden'));
  add(window, 'pagehide', event => {if(event.persisted)setPaused(true,'page-cache');else stop('pagehide');});
  add(window, 'pageshow', () => setPaused(false,'page-cache'));
  add(window, 'blur', () => setPaused(true,'blur'));
  add(window, 'focus', () => setPaused(false,'blur'));
  const api = window.OpeningNarration = {
    version: 'v47-jon-recordings', voice: Object.freeze({"id":"JYUzXNeyCPmymMkfcicu","name":"Jon - Children's Storyteller","language":"en-US"}),
    clips, configure, play, stop, setPaused,
    has: value => !!find(value),
    resolve: value => { const id = find(value); return id ? { id, ...clips[id] } : null; },
    setEnabled(value) { enabled = !!value; if (!enabled) stop('disabled'); },
    resetOnce() { played.clear(); },
    status() { return { ...last, active: active?.id || null, activeSources: active ? 1 : 0, enabled, voice: this.voice.name }; },
    dispose() { stop('disposed'); disposed = true; speaker?.pause(); speaker?.remove?.(); for (const [target, event, fn,capture] of listeners) target.removeEventListener(event, fn,capture); listeners.length = 0; }
  };
})();


;
(function(){
  'use strict';
  let observer=null;
  function asset(key){return window.OPENING_BASE?.assets?.['assets/'+key];}
  function update(){
    const chase=document.querySelector('#c-chase');
    if(chase&&!chase.dataset.dressingRoom){const src=asset('scene-v47/dressing-room.png');if(src){chase.style.setProperty('--theatre-floor','url("'+src+'")');chase.dataset.dressingRoom='true';}}
  }
  function start(){if(observer)return;observer=new MutationObserver(update);observer.observe(document.body,{childList:true,subtree:true});update();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

;
(function () {
  'use strict';
  // Retain the proportions of the actors. Only the empty stage wings expand on wide screens.
  function paintStage(canvas, picture, portraitFocus) {
    const sw=picture.naturalWidth||picture.width, sh=picture.naturalHeight||picture.height;
    const w=canvas.clientWidth, h=canvas.clientHeight;
    if (!sw||!sh||!w||!h) return;
    const ratio=Math.min(devicePixelRatio||1,2);
    const pw=Math.round(w*ratio),ph=Math.round(h*ratio);
    if(canvas.width!==pw||canvas.height!==ph){canvas.width=pw;canvas.height=ph;}
    const ctx=canvas.getContext('2d');ctx.setTransform(ratio,0,0,ratio,0,0);
    if(portraitFocus && w/h<sw/sh){
      const scale=Math.min(h/sh,w/(sw*.48)), crop=w/scale,start=(sw-crop)*portraitFocus;
      const extra=h-sh*scale;
      const top=sh*.16;
      ctx.drawImage(picture,start,0,crop,top,0,0,w,extra+top*scale+.5);
      ctx.drawImage(picture,start,top,crop,sh-top,0,extra+top*scale,w,(sh-top)*scale);
      return {scale,x:-start*scale,y:extra};
    }
    const scale=Math.min(h/sh,w/(sw*.76)),naturalW=sw*scale,naturalH=sh*scale;
    const x=(w-naturalW)/2,y=(h-naturalH)/2;
    // On very tall screens the spare area is the same floor, above and below the action.
    if(y>0){
      const band=sh*.075;
      ctx.drawImage(picture,0,0,sw,band,x,0,naturalW,y+band*scale+.5);
      ctx.drawImage(picture,0,sh-band,sw,band,x,y+(sh-band)*scale-.5,naturalW,y+band*scale+1);
      ctx.drawImage(picture,0,band,sw,sh-2*band,x,y+band*scale,naturalW,(sh-2*band)*scale);
    }else if(x>.5){
      // The tribute painting has a small nail just 4% in from its left edge.
      const left=sw*(portraitFocus ? .032 : .085),right=sw*.085;
      ctx.drawImage(picture,0,0,left,sh,0,0,x+left*scale+.5,h);
      ctx.drawImage(picture,sw-right,0,right,sh,w-x-right*scale-.5,0,x+right*scale+.5,h);
      ctx.drawImage(picture,left,0,sw-left-right,sh,x+left*scale,0,naturalW-(left+right)*scale,h);
    }else ctx.drawImage(picture,x,y,naturalW,naturalH);
    return {x,y,scale};
  }
  function mount({stage, asset, signal, listen, after, afterNarration, say, cue, onReady, isModal, reduced}) {
    const plate = document.createElement('div');
    plate.className = 'chest-tribute';
    const portrait = new Image();
    const scene = document.createElement('canvas');
    scene.className = 'chest-tribute-portrait';
    scene.setAttribute('role','img');
    scene.setAttribute('aria-label','The tin stands in the spotlight. One corner of its red cape is caught on a floor nail.');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chest-tribute-trunk';
    button.disabled = true;
    button.setAttribute('aria-label', 'Inspect the chest');
    const trunk = new Image();
    trunk.alt = '';
    trunk.draggable = false;
    const label = document.createElement('span');
    label.textContent = 'Inspect the chest';
    const pusher=document.createElement('i');
    pusher.className='chest-pusher';
    pusher.setAttribute('aria-hidden','true');
    const wrist=new Image();wrist.alt='';wrist.src=asset('chest-v56/stagehand.webp');pusher.append(wrist);
    button.append(trunk, label, pusher);
    plate.append(scene, button);
    const gallery = document.createElement('div');
    gallery.className = 'chest-gallery';
    gallery.setAttribute('aria-hidden', 'true');
    const handSheet = asset('applause-v64/hands.webp');
    for (const side of ['left','right']) {
      for (const row of ['upper','middle','lower']) {
        const pair = document.createElement('div');
        pair.className = 'chest-clappers ' + side + ' ' + row;
        const strip = new Image();
        strip.src = handSheet;
        strip.alt = '';
        strip.draggable = false;
        pair.append(strip);
        gallery.append(pair);
      }
    }
    stage.append(plate, gallery);
    const title = stage.closest('.c-body').querySelector('.c-title');
    const chestTitle = title?.textContent;
    if (title) title.textContent = 'Six Acts Later';
    const resize=new ResizeObserver(()=>paintStage(scene,portrait,.26));
    resize.observe(scene);
    let began = false,frame=0;
    const sfx=window.OpeningSFX;
    signal.addEventListener('abort',()=>{resize.disconnect();cancelAnimationFrame(frame);sfx?.stopCue('tributeApplause');},{once:true});
    function play() {
      if (began || signal.aborted) return;
      began = true;
      paintStage(scene,portrait,.26);
      stage.dataset.prelude = 'tribute';
      let reading=false,voiceDone=false,pushAge=-1,clock=0,prior=performance.now(),nextAudioAttempt=0;
      say('finale-tribute').then(result=>{reading=['muted','missing','blocked','error'].includes(result?.status);});
      afterNarration(()=>{voiceDone=true;},true);
      void sfx?.preload();
      function step(now){
        if(signal.aborted)return;
        const paused=document.hidden||isModal?.();
        const dt=paused?0:Math.min(100,now-prior);prior=now;clock+=dt;
        if(!paused && clock>=nextAudioAttempt){
          nextAudioAttempt=clock+600;
          if(sfx?.debug().kind!=='tributeApplause')sfx?.cue('tributeApplause');
        }else if(paused)sfx?.stopCue('tributeApplause');
        const speech=document.querySelector('audio[data-narration-cue="finale-tribute"]');
        const nearingEnd=speech && speech.currentTime>0 && speech.duration-speech.currentTime<=2.4;
        if(pushAge<0&&(voiceDone||nearingEnd||reading&&clock>=2600)){
          pushAge=0;stage.dataset.prelude='pushing';
        }
        if(pushAge>=0){
          pushAge+=dt;
          const progress=Math.min(1,pushAge/(reduced?450:2200));
          const ease=progress*progress*(3-2*progress);
          button.style.setProperty('--push',String(1-ease));
          const retreat=Math.min(1,Math.max(0,(pushAge-(reduced?450:2200))/(reduced?160:550)));
          pusher.style.transform='translateX('+(retreat*retreat*115)+'%)';
        }
        if(!voiceDone||pushAge<(reduced?610:2750)){frame=requestAnimationFrame(step);return;}
        sfx?.stopCue('tributeApplause');
        gallery.remove();
        pusher.remove();
        stage.dataset.prelude = 'knock';
        cue('boxJolt');
        after(() => afterNarration(() => {
          cue('latch');
          say('finale-trunk');
          afterNarration(() => {
            stage.dataset.prelude = 'inspect';
            button.disabled = false;
            button.focus({preventScroll:true});
          }, true);
        }, true), 900);
      }
      frame=requestAnimationFrame(step);
    }
    listen(button, 'click', () => {
      if (button.disabled || signal.aborted) return;
      button.disabled = true;
      resize.disconnect();
      plate.remove();
      if (title) title.textContent = chestTitle;
      delete stage.dataset.prelude;
      onReady();
    });
    portrait.src = asset('scenery-v63/six-acts.webp');
    trunk.src = asset('chest-v56/travelling-chest.webp');
    Promise.allSettled([portrait.decode(), trunk.decode()]).then(() => afterNarration(play, true));
  }
  window.OpeningChestPrelude = {mount,paintStage};
})();

;
(function(){
  'use strict';
  const width=1024,height=768;
  const clamp=value=>Math.max(0,Math.min(1,value));
  const ease=value=>{const t=clamp(value);return t*t*(3-2*t);};
  const lerp=(a,b,t)=>a+(b-a)*t;
  const lidOutline=new Path2D('M168 401 Q170 230 235 132 Q256 95 305 92 Q506 58 715 91 Q766 96 793 149 Q844 257 850 399 Q856 433 838 457 L190 460 Q168 451 168 401Z');
  const raisedLid=new Path2D('M179 178 Q195 102 239 68 Q351 35 516 45 Q677 34 768 64 Q811 81 838 178 L767 316 Q756 326 735 324 L274 324 Q245 324 236 310Z');
  const topFace=new Path2D('M180 178Q193 106 240 68Q357 39 516 48Q683 35 765 66Q815 86 838 179Q525 130 180 179Z');
  const cropCurl=new Path2D('M88 299Q80 228 132 190Q112 157 163 130L222 108Q248 101 264 140L293 143Q320 94 382 133Q430 158 430 253Q432 285 404 290Q423 416 337 430Q228 440 154 421Q92 414 88 299Z');

  function mount({stage,asset,signal,reduced,isModal,afterNarration,onPhase,onBeat}){
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;canvas.className='chest-performance';
    canvas.setAttribute('role','img');canvas.setAttribute('aria-label','A travelling chest under the footlights.');
    const screen=document.createElement('canvas');screen.className='chest-performance';
    screen.setAttribute('role','img');screen.setAttribute('aria-label',canvas.getAttribute('aria-label'));
    stage.prepend(screen);
    let projection=null;
    const ctx=canvas.getContext('2d');
    const images={},ready=im=>im?.complete&&im.naturalWidth>0;
    let phase='loading',lift=0,age=0,last=0,raf=0;
    let held=false,raised=0,strikeFrom=0,hit=false;
    let aimX=550,aimY=410;
    let plate=null,outer=null,curledFrame=0;
    const present=(name,value)=>{stage.dataset[name]=value;canvas.dataset[name]=value;};
    const notify=name=>{phase=name;age=0;last=0;present('beat',name);onPhase(name);};
    function schedule(){if(!signal.aborted&&!raf)raf=requestAnimationFrame(tick);}
    function offscreen(){const c=document.createElement('canvas');c.width=width;c.height=height;return c;}
    // Reconstruct just the strip of floor hidden behind the raised lid. Follow the boards
    // back to the unobstructed top edge of this same painting to keep the ink continuous.
    function prepare(){
      if(plate||!ready(images.after)||!ready(images.before))return;
      plate=offscreen();const g=plate.getContext('2d');g.drawImage(images.after,0,0);
      const source=g.getImageData(0,0,width,height),floor=g.createImageData(width,height);
      const region=offscreen(),mg=region.getContext('2d');
      mg.lineWidth=10;mg.fill(raisedLid);mg.stroke(raisedLid);
      const mask=mg.getImageData(0,0,width,height).data;
      for(let y=40;y<324;y++)for(let x=178;x<839;x++){
        const to=(y*width+x)*4;if(!mask[to+3])continue;
        let d=0;
        while(y-d>1&&mask[((y-d)*width+Math.round(x+d*.76))*4+3])d+=3;
        // Reflect through a strip of adjacent floor along the direction of the grain.
        const strip=Math.max(1,Math.min(32,y-d-2));
        const back=strip-Math.abs(d%(strip*2)-strip);
        const sy=Math.max(1,y-d-back-1),sx=Math.min(width-1,Math.round(x+(y-sy)*.76));
        const from=(sy*width+sx)*4;
        for(let ch=0;ch<3;ch++)floor.data[to+ch]=source.data[from+ch];
        floor.data[to+3]=255;
      }
      const patch=offscreen();patch.getContext('2d').putImageData(floor,0,0);
      g.save();g.clip(raisedLid);g.drawImage(patch,0,0);g.restore();
      outer=offscreen();const o=outer.getContext('2d');o.save();o.clip(lidOutline);
      o.drawImage(images.before,0,0);o.drawImage(images.before,399,394,58,72,456,394,110,72);o.restore();
    }
    function drawBox(){
      if(!plate)return;
      const p=clamp(lift),top=lerp(153,50,p),edge=lerp(526,177,p);
      ctx.drawImage(plate,0,0);
      if(p>=.999){ctx.save();ctx.clip(raisedLid);ctx.drawImage(images.after,0,0);ctx.restore();}
      else{
        if(edge<318){
          ctx.save();ctx.beginPath();ctx.moveTo(181,edge);ctx.lineTo(837,edge);
          ctx.lineTo(764,317);ctx.lineTo(242,317);ctx.closePath();ctx.clip();
          ctx.drawImage(images.after,179,176,660,143,179,edge,660,318-edge);ctx.restore();
        }
        ctx.drawImage(outer,153,76,713,385,153,top,713,(edge-top)*385/378);
        if(p>.55){
          ctx.save();ctx.globalAlpha=ease((p-.55)/.45);
          ctx.translate(0,top);ctx.scale(1,(edge-top)/127);ctx.translate(0,-50);
          ctx.clip(topFace);ctx.drawImage(images.after,0,0);ctx.restore();
        }
      }
      if(p>.93&&ready(images.curl))drawCurled(curledFrame,clamp((p-.93)/.07));
      ctx.drawImage(plate,168,500,670,110,168,500,670,110);
    }
    function drawCurled(index,alpha){
      if(!['opening','peek','waiting'].includes(phase))return;
      ctx.save();ctx.globalAlpha=alpha;ctx.translate(279,125);ctx.scale(.9,.9);ctx.clip(cropCurl);
      ctx.drawImage(images.curl,index%3*512,Math.floor(index/3)*512,512,512,0,0,512,512);ctx.restore();
    }
    function actor(name,x,feet,scale){
      const image=images[name];if(!ready(image))return;
      const size=768*scale;ctx.drawImage(image,x-size*.5,feet-size*685/768,size,size);
    }
    function mallet(rotation,retreat=0){
      // The illustration pivots about the stagehand's knuckles. At zero rotation the
      // wooden face meets the exact point the player chose on the lid.
      const scale=.73;
      ctx.save();ctx.translate(aimX+376*scale+retreat*230,aimY+78*scale+retreat*80);
      ctx.rotate(rotation);ctx.scale(scale,scale);ctx.translate(-530,-325);
      ctx.beginPath();ctx.moveTo(672,318);ctx.lineTo(1660,559);ctx.lineTo(1614,770);ctx.lineTo(656,397);
      ctx.closePath();ctx.fillStyle='#171714';ctx.fill();ctx.strokeStyle='#10100f';ctx.lineWidth=4;ctx.stroke();
      ctx.beginPath();ctx.moveTo(685,342);ctx.quadraticCurveTo(745,365,787,365);
      ctx.moveTo(705,375);ctx.lineTo(752,393);ctx.strokeStyle='#494741';ctx.lineWidth=2;ctx.stroke();
      ctx.drawImage(images.mallet,0,0,800,450);ctx.restore();
    }
    const exitFeet=[[277,482],[250,482],[244,484],[283,468],[237,464],[225,462]];
    function departingActor(cel,x,y,facesLeft=false){
      const [px,py]=exitFeet[cel],scale=.92;
      ctx.save();ctx.translate(x,y);if(facesLeft)ctx.scale(-1,1);
      ctx.drawImage(images.exit,cel%3*512,Math.floor(cel/3)*512,512,512,-px*scale,-py*scale,512*scale,512*scale);ctx.restore();
    }
    function draw(){
      drawCel();
      projection=window.OpeningChestPrelude.paintStage(screen,canvas);
      screen.dataset.beat=phase;
    }
    function drawCel(){
      if(signal.aborted||!plate)return;
      ctx.clearRect(0,0,width,height);
      if(phase==='mallet'||phase==='strike'){
        ctx.drawImage(images.before,0,0);
        if(phase==='mallet'){
          mallet(.24+.51*raised);return;
        }
        // Give even a short tap a readable anticipation, held for one exposure on impact.
        const wind=lerp(strikeFrom,.77,ease(age/110));
        const swing=age<110?wind:age<215?.77*(1-clamp((age-110)/105)**2):0;
        const recoil=ease((age-242)/150);
        mallet(reduced?(hit?0:.42):swing+recoil*.43,recoil);
        return;
      }
      drawBox();
      if(phase==='spring'){
        const p=reduced?1:ease(age/390);actor('spring',511+50*p,525-69*p,.54+.16*p);
        if(p<.37)ctx.drawImage(plate,170,500,669,61,170,500,669,61);
      }else if(phase==='spread'){
        const p=reduced?.2:clamp(age/860);
        actor('spread',561+48*p,456-26*Math.sin(Math.PI*p)+252*p*p,.69);
      }else if(phase==='settle'){
        const p=reduced?1:ease(age/270);actor('settle',609+3*p,708+12*p,.69+.025*p);
      }else if(phase==='wave'||phase==='hold'){
        const high=phase==='wave'&&(reduced?age<700:age<380||(age>620&&age<910));
        actor(high?'wave-high':'wave-low',612,720,.715);
      }else if(phase==='sigh'){
        if(age<240)actor('wave-low',612,720,.715);
        else departingActor(age<610?0:age<1320?1:2,612,720,age>=1320);
      }else if(phase==='exit'||phase==='done'){
        const p=phase==='done'?1:clamp(age/920);
        const stride=reduced?0:Math.floor(p*4)%4;
        departingActor([3,4,5,4][stride],612-82*ease(p),720,true);
      }
    }
    function tick(now){
      raf=0;if(signal.aborted)return;
      const dt=last&&!document.hidden&&!isModal()?Math.min(60,now-last):0;last=now;
      age+=dt;
      if(phase==='mallet'){
        raised=clamp(raised+dt/(held?240:-120));
      }else if(phase==='strike'){
        if(age>=215&&!hit){hit=true;onBeat('impact');}
        if(age>=390){notify('opening');onBeat('opened');}
      }else if(phase==='opening'){
        lift=reduced?1:1-(1-clamp(age/390))**3;
        if(age>=390){lift=1;curledFrame=0;notify('peek');}
      }else if(phase==='peek'){
        curledFrame=age<430?0:age<750?2:1;
        if(age>=1250)notify('waiting');
      }else if(phase==='spring'&&age>=(reduced?170:390)){notify('spread');}
      else if(phase==='spread'&&age>=(reduced?560:860)){notify('settle');}
      else if(phase==='settle'&&age>=(reduced?160:270)){notify('wave');}
      else if(phase==='wave'&&age>=1460){
        notify('hold');
        afterNarration(()=>{
          if(signal.aborted||phase!=='hold')return;
          notify('sigh');onBeat('audience');schedule();
        },true);
      }else if(phase==='sigh'&&age>=1670){notify('exit');}
      else if(phase==='exit'&&age>=920){notify('done');draw();onBeat('departed');return;}
      draw();
      if(phase==='mallet'){if(held?raised<1:raised>0)schedule();}
      else if(!['loading','waiting','hold','done'].includes(phase))schedule();
    }
    const available=()=>!signal.aborted&&!isModal()&&phase==='mallet';
    function aim(x,y){
      if(!available()||!Number.isFinite(x)||!Number.isFinite(y))return;
      aimX=Math.max(248,Math.min(735,x));aimY=Math.max(185,Math.min(452,y));draw();
    }
    const poses=['spring','spread','settle','wave-high','wave-low','exit'];
    const art={before:'chest-v55/before.webp',after:'chest-v55/after.webp',curl:'scene-v47/chest-rabbit.png',mallet:'chest-v56/stage-mallet.webp'};
    for(const name of poses)art[name]='chest-v56/'+name+'.webp';
    art.exit='chest-v56/exit-cels.webp';
    let performed=false;
    const loading=new Map();
    function load(id){
      if(ready(images[id]))return Promise.resolve(true);
      if(loading.has(id))return loading.get(id);
      const source=asset(art[id]);if(!source||signal.aborted)return Promise.resolve(false);
      const im=new Image();images[id]=im;
      const attempt=new Promise(resolve=>{
        const finish=ok=>{
          clearTimeout(timeout);im.onload=null;im.onerror=null;signal.removeEventListener('abort',abort);
          loading.delete(id);resolve(ok);
        };
        const abort=()=>finish(false),timeout=setTimeout(abort,12000);
        signal.addEventListener('abort',abort,{once:true});
        im.onload=()=>finish(true);im.onerror=abort;im.src=source;
      });
      loading.set(id,attempt);return attempt;
    }
    function loadChest(){
      Promise.all(['before','after','curl','mallet'].map(load)).then(ok=>{
        if(signal.aborted||phase!=='loading')return;
        if(ok.some(result=>!result)){onBeat('backdrop-unavailable');return;}
        prepare();notify('mallet');draw();
      });
    }
    loadChest();poses.forEach(load);
    const resize=new ResizeObserver(draw);resize.observe(screen);
    signal.addEventListener('abort',()=>{cancelAnimationFrame(raf);resize.disconnect();},{once:true});
    return {
      state:()=>phase,retry:loadChest,
      aimAt(clientX,clientY){
        if(!projection)return;
        const box=screen.getBoundingClientRect();
        aim((clientX-box.left-projection.x)/projection.scale,(clientY-box.top-projection.y)/projection.scale);
      },
      handoff(){
        const rect=screen.getBoundingClientRect();
        const lastFrame=document.createElement('canvas');lastFrame.width=screen.width;lastFrame.height=screen.height;
        lastFrame.getContext('2d').drawImage(screen,0,0);
        return {lastFrame,left:rect.x,top:rect.y,width:rect.width,height:rect.height};
      },
      raise(){if(available()){held=true;last=0;schedule();}},
      strike(){if(available()){held=false;strikeFrom=.24+.51*raised;notify('strike');schedule();}},
      cancel(){held=false;if(phase==='mallet'){last=0;schedule();}},
      perform(){
        if(phase!=='waiting'||performed||signal.aborted||isModal())return;performed=true;
        Promise.all(poses.map(load)).then(result=>{
          if(signal.aborted||phase!=='waiting')return;
          if(result.some(ok=>!ok)){performed=false;onBeat('art-unavailable');return;}
          notify('spring');onBeat('greeting');schedule();
        });
      }
    };
  }
  window.OpeningChestReaction={mount};
})();

;
(function(){
  'use strict';
  const B=window.OPENING_BASE,W=window.ComicWorld;
  if(!B||!W){console.error('[OPENING] Missing base bridge or world engine.');return;}
  const A=B.assets,asset=k=>A['assets/'+k],$=s=>document.querySelector(s);
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const KEY='opening-comic-v02-test', reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let saved={screen:'ticket',level:0,furthest:0,ducks:0,seen:[],voice:true};
  try{const v=JSON.parse(localStorage.getItem(KEY));if(v&&typeof v==='object')saved=Object.assign(saved,v);}catch{}
  if(!saved.versionNarration47){saved.voice=true;saved.versionNarration47=true;try{localStorage.setItem(KEY,JSON.stringify(saved));}catch{}}
  let app=null,body=null,signal=null,life=null,timers=[],frame=0,modal=null,scene='ticket',uid=0;
  const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(saved));}catch{}};
  function after(fn,ms){const id=setTimeout(()=>{if(!signal.aborted)fn();},ms);timers.push(id);return id;}
  function listen(el,event,fn,options){if(el)el.addEventListener(event,fn,Object.assign({signal},options||{}));}
  let speechEpoch=0,speechTail=null,captionUntil=0;
  const queuedLines=new Map();
  function stopNarration(reason='scene-change'){
    speechEpoch++;speechTail=null;captionUntil=0;queuedLines.clear();
    window.OpeningNarration?.stop(reason);window.OpeningSubtitles?.clear();if(window.speechSynthesis)speechSynthesis.cancel();B.music?.duck(false);
  }
  function cleanup(){if(life)life.abort();if(body)body.classList.remove('c-game-page','is-running','p-page','p-playing','c-story-body','t-page');if(app)app.classList.remove('puzzle-mode');timers.forEach(clearTimeout);timers=[];cancelAnimationFrame(frame);window.OpeningSFX?.stop();stopNarration();life=new AbortController();signal=life.signal;}
  function cue(name,options){window.OpeningSFX?.cue(name,options);}
  function say(value,voice=true,force=false,options={}){
    const recording=window.OpeningNarration?.resolve(value),text=recording?.text||value,id=recording?.id||value;
    const pending=queuedLines.get(id);
    if(pending){if(options.when)pending.when=options.when;return pending.task;}
    const entry={when:options.when};
    const owner=signal,epoch=speechEpoch;
    const current=()=>!owner?.aborted&&epoch===speechEpoch;
    async function speak(){
      const remaining=captionUntil-performance.now();
      if(current()&&!force&&remaining>0){
        await new Promise(resolve=>{
          const done=()=>{clearTimeout(timer);owner?.removeEventListener('abort',done);resolve();};
          const timer=setTimeout(done,Math.ceil(remaining));owner?.addEventListener('abort',done,{once:true});
        });
      }
      if(!current()||entry.when&&!entry.when())return {status:'cancelled'};
      captionUntil=0;
      const caption=$('#c-caption');
      if(caption)caption.innerHTML='<strong>'+esc(text)+'</strong>';
      let result={status:'muted'};
      try{if(voice&&window.OpeningNarration)result=await window.OpeningNarration.play(value,{once:options.once,force,signal:owner,captionOnBlock:['storybook','finale','encore'].includes(scene)});}
      catch{result={status:'error'};}
      if(current()){
        if(['muted','missing','blocked','error'].includes(result.status)){
          window.OpeningSubtitles?.show(text);
          const duration=Math.min(5000,Math.max(1400,text.split(/\s+/).length*240));
          const ends=captionUntil=performance.now()+duration;
          after(()=>{if(current()&&ends===captionUntil){captionUntil=0;window.OpeningSubtitles?.clear();}},duration);
        }
      }
      return result;
    }
    const task=speechTail?speechTail.then(speak):speak();
    entry.task=task;speechTail=task;queuedLines.set(id,entry);
    task.then(()=>{if(queuedLines.get(id)===entry)queuedLines.delete(id);if(speechTail===task)speechTail=null;});
    return task;
  }
  function afterNarration(advance,automatic=false){
    const owner=signal;
    function ready(){
      if(owner?.aborted)return;
      if(speechTail){speechTail.then(ready);return;}
      if(modal){modal.addEventListener('close',ready,{once:true,signal:owner});return;}
      if(document.hidden){document.addEventListener('visibilitychange',ready,{once:true,signal:owner});return;}
      const reading=captionUntil-performance.now();
      if(automatic&&reading>0){after(ready,Math.ceil(reading));return;}
      advance();
    }
    ready();
  }

  function base(title,kicker,sub){
    cleanup();body.innerHTML='<div class="c-kicker"><span>'+kicker+'</span><span>PULL & CO. · A VERY ORDINARY HERO</span></div>'+(title?'<h1 class="c-title">'+title+'</h1>':'')+(sub?'<p class="c-sub">'+sub+'</p>':'')+'<div id="c-content"></div><div class="c-bottom"><span id="c-hint" role="status" aria-live="polite"></span><span>CAN ACT / PLAYTEST</span></div>';
    saved.screen=scene;save();return $('#c-content');
  }
  function hint(text){const e=$('#c-hint');if(e)e.textContent=text;}
  function duck(kind=0,motion='idle'){return '<canvas class="c-duck-svg c-cast" width="512" height="512" data-cast="'+(kind?'right':'left')+'-'+motion+'" role="img" aria-label="'+(kind?'The singer':'The dancer')+', '+motion+'"></canvas>';}
  function animateCast(){return window.OpeningCast.mount(body,{signal,reduced:reduce});}
  function machine(){return '<svg class="c-machine" viewBox="0 0 330 520" role="img" aria-label="Capsule machine"><defs><pattern id="mh" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0v6" stroke="#40382a" stroke-width="1"/></pattern></defs><path d="M115 433v42H75v21h184v-21h-42v-42" fill="#a13d2f" stroke="#24221e" stroke-width="5"/><path d="M63 204h204l13 235H49z" fill="#a83f31" stroke="#24221e" stroke-width="6"/><path d="M67 209q-40-50-20-111Q78 21 165 22q91 0 119 79 20 66-19 109" fill="#e5dfcb" stroke="#24221e" stroke-width="6"/><path d="M66 195q74-27 198 5" fill="none" stroke="#24221e" stroke-width="5"/><path d="M55 250h37v180H55z" fill="url(#mh)"/><g stroke="#24221e" stroke-width="4"><circle cx="96" cy="152" r="25" fill="#c0bd8d"/><circle cx="139" cy="114" r="24" fill="#af4939"/><circle cx="190" cy="160" r="27" fill="#d3b467"/><circle cx="233" cy="113" r="23" fill="#aaa57d"/><circle cx="142" cy="179" r="21" fill="#e7dfc7"/><circle cx="199" cy="91" r="20" fill="#e7dfc7"/></g><path d="M95 239h139v49H95z" fill="#e7dcbe" stroke="#24221e" stroke-width="4"/><text x="165" y="259" text-anchor="middle" font-size="12" font-family="Georgia" fill="#24221e">ONE COIN.</text><text x="165" y="277" text-anchor="middle" font-size="12" font-family="Georgia" fill="#24221e">ONE HERO.</text><path d="M130 388h75v34h-75z" fill="#24221e"/><path d="M161 304h9v35h-9z" fill="#24221e"/><path d="M105 19h120V5H105z" fill="#b04a36" stroke="#24221e" stroke-width="4"/></svg>';}
  function register(){
    B.stop();B.audio.color=false;if(document.getElementById('status'))document.getElementById('status').textContent='';document.body.classList.add('comic-mode');
    document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    const skip=$('.c-intro-skip');if(skip)skip.remove();
    if(!app){app=document.createElement('section');app.id='comic-app';app.setAttribute('aria-label','Can Act, a tin-can adventure');app.innerHTML='<header class="c-header"><div class="c-home-links"><button class="c-brand" id="c-home" aria-label="Return to the Can Act cover" title="Return to the cover"><img src="'+B.assets['assets/brand-v55/header-mark.svg']+'" alt="Can Act" width="116" height="75"></button><button class="c-restart" id="c-restart" aria-label="Restart at the cover">Restart ↺</button></div><nav class="c-nav" aria-label="Show controls"><button id="c-program">Programme</button><button id="c-sound">Sound</button><button id="c-voice">Narration</button></nav></header><main class="c-body" id="c-body"></main>';document.body.append(app);body=$('#c-body');
      const restart=()=>{cleanup();B.home();};$('#c-home').onclick=restart;$('#c-restart').onclick=restart;$('#c-program').onclick=()=>program();
      $('#c-sound').onclick=()=>{B.audio.setEnabled(!B.audio.enabled);if(!B.audio.enabled)stopNarration();syncNav();};
      $('#c-voice').onclick=()=>{saved.voice=!saved.voice;save();syncNav();if(!saved.voice)stopNarration();};
    }
    window.OpeningSubtitles?.mount(app);
    window.OpeningNarration?.configure({asset,enabled:opts=>B.audio.enabled&&(saved.voice||opts?.force),duck:value=>{B.music?.duck(value,'narration');window.OpeningSFX?.setNarrationActive(value);},onCaption:(text,meta)=>window.OpeningSubtitles?.show(text,meta),onClear:()=>window.OpeningSubtitles?.clear(),onState:({status,id,reason})=>{const button=$('#c-voice');if(button){button.dataset.audioState=status;button.dataset.audioCue=id||'';button.dataset.audioReason=reason||'';}}});
    syncNav();
  }
  function syncNav(){if(!app)return;[['c-program','☰','Programme'],['c-sound',B.audio.enabled?'♪':'♩','Sound '+(B.audio.enabled?'on':'off')],['c-voice','“ ”','Narration '+(saved.voice?'on':'off')]].forEach(([id,label,title])=>{const el=document.getElementById(id);el.textContent=label;el.title=title;el.setAttribute('aria-label',title);});}
  function open(screen='ticket',number,entry){register();body.style.padding='';scene=screen;app.dataset.scene=screen;if(screen==='level')saved.level=Math.max(0,Math.min(W.levels.length-1,number===undefined?saved.level:number));
    const routes={ticket,coins:()=>coins(entry?.fromTicket),walk:walkScene,curtain:curtainScene,props:propsScene,gacha:gachaScene,chase:chaseScene,level:()=>levelScene(saved.level),finale:finaleScene,storybook:()=>epilogues.story(number===undefined?saved.level:number),encore:()=>epilogues.encore(entry)};B.music?.scene(screen);(routes[screen]||ticket)();}
  window.startComicOpening=()=>open('ticket');
  function program(){
    if(modal)return;
    const trigger=$('#c-program'),sheet=document.createElement('dialog');
    const owner=signal;
    sheet.id='c-programme';sheet.className='c-modal c-programme';
    sheet.setAttribute('aria-labelledby','c-programme-title');
    const prologue=[
      ['ticket','The Reluctant Ticket'],['coins','The Silver Coins'],['walk','Follow That Shadow'],
      ['curtain','Raise the Curtain'],['props','Under the Sheets'],['gacha','Tonight’s Hero'],['chase','Not My Cue']
    ];
    const activeChapter=scene==='level'?saved.level:scene==='storybook'?Number(body.querySelector('.c-story-page')?.dataset.chapter)-1:-1;
    function entry(attribute,value,number,title,active){
      const here=active?' aria-current="location"':'';
      return '<li><button type="button" '+attribute+'="'+value+'"'+here+'><span class="programme-number">'+number+'</span><span class="programme-name">'+esc(title)+'</span>'+(active?'<small class="programme-now">Here</small>':'')+'</button></li>';
    }
    function group(name,rows){return '<section class="programme-section"><h3>'+name+'</h3><ol>'+rows.join('')+'</ol></section>';}
    const prologueList=group('The Prologue',prologue.map(([id,title],i)=>entry('data-screen',id,'0'+(i+1),title,scene===id)));
    const acts=group('The Six Acts',W.levels.map((level,i)=>entry('data-level',i,level.chapter,level.en,i===activeChapter)));
    const curtainCall=group('Curtain Call',[
      entry('data-screen','finale','Finale','Six Acts Later',scene==='finale'),
      entry('data-screen','encore','Encore','A Bow for Everyone',scene==='encore')
    ]);
    sheet.innerHTML='<header class="programme-mast"><h2 id="c-programme-title">The Programme</h2><button type="button" id="c-close-menu" aria-label="Close programme">Close <span aria-hidden="true">×</span></button></header>'+
      '<div class="programme-columns"><div>'+prologueList+'</div><div>'+acts+curtainCall+'</div></div>'+
      '<footer class="programme-footer"><div class="programme-notes"><details><summary>How to play</summary><p>On the rehearsal page, drag two scenes to exchange them. Use the control in a mechanical panel to inspect its reverse side.</p><p>During the show, roll with A/D or the arrow keys. Jump with Space or ↑. On a touchscreen, drag inside the tin’s panel to roll and tap ↑ to jump.</p></details>'+(B.music?.credits||'')+'</div><button type="button" id="c-original">Back to the cover ↺</button></footer>';
    const creditTitle=sheet.querySelector('.opening-music-credits summary');
    if(creditTitle)creditTitle.textContent='Music and sound credits';
    modal=sheet;app.append(sheet);
    trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','true');
    function dismiss(restoreFocus=true){
      if(modal!==sheet)return;
      modal=null;trigger.setAttribute('aria-expanded','false');
      owner.removeEventListener('abort',leaveScene);
      if(sheet.open)sheet.close();
      sheet.remove();
      B.music?.pause(false,'programme');
      window.OpeningNarration?.setPaused(false,'programme');
      if(restoreFocus)trigger.focus({preventScroll:true});
    }
    function leaveScene(){dismiss(false);}
    sheet.addEventListener('close',()=>dismiss());
    sheet.addEventListener('cancel',e=>{e.preventDefault();dismiss();});
    sheet.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();dismiss();}
    });
    sheet.addEventListener('click',e=>{
      if(e.target===sheet){
        const r=sheet.getBoundingClientRect();
        if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dismiss();
        return;
      }
      const choice=e.target.closest('button');
      if(!choice)return;
      if(choice.id==='c-close-menu'){dismiss();return;}
      if(choice.id==='c-original'){dismiss(false);cleanup();B.home();return;}
      if(choice.hasAttribute('data-level')){dismiss(false);open('level',Number(choice.dataset.level));}
      else if(choice.hasAttribute('data-screen')){dismiss(false);open(choice.dataset.screen);}
    });
    sheet.showModal();
    B.music?.pause(true,'programme');
    window.OpeningNarration?.setPaused(true,'programme');
    owner.addEventListener('abort',leaveScene,{once:true});
    sheet.querySelector('#c-close-menu').focus({preventScroll:true});
  }
  function ticket(){
    const c=base('','',''),stall=asset('carrot-v45/stall.png');
    c.closest('.c-body').style.setProperty('--booth-house','url("'+asset('responsive-print-v67/booth-house.webp')+'")');
    // Coordinates belong to the supplied 1920 x 1080 composition; front lips reuse its exact artwork.
    const positions=[[571,550,557],[964,550,557],[1359,550,557],[568,717,725],[964,717,725],[1362,717,725]];
    c.innerHTML='<div class="c-carrot-field" aria-label="Carrot-pulling booth"><img class="c-carrot-stall" src="'+stall+'" alt="" draggable="false"><div class="c-count" aria-label="Catch three carrots"><i></i><i></i><i></i></div>'+positions.map(([x,y,front],i)=>{
      const left=x-1920*.09,top=y-1080*.25*.84;
      const style='--hole-x:'+x/1920*100+'%;--hole-y:'+y/1080*100+'%;--front-top:'+(front-top)/(1080*.25)*100+'%;--front-image-left:'+(-left/(1920*.18)*100)+'%;--front-image-top:'+(-front/(1080*.25*.16)*100)+'%';
      return '<button class="c-hole" data-hole="'+i+'" style="'+style+'" aria-label="Carrot hole '+(i+1)+'"><span class="c-carrot-window"><span class="c-hole-sprite"><img class="c-carrot-sprite" src="'+asset('carrot-v35/carrot.webp')+'" alt="" draggable="false"><img class="c-ticket-sprite" src="'+asset('ticket-v14/complete.png')+'" alt="" draggable="false" hidden></span></span><span class="c-hole-front" aria-hidden="true"><img src="'+stall+'" alt="" draggable="false"></span></button>';
    }).join('')+'</div>';
    let hit=0,active=2,phase='carrot',locked=false,drag=null,press=null,p=0,hopTimer=null,suppressClick=false;
    const field=c.querySelector('.c-carrot-field'),holes=[...c.querySelectorAll('.c-hole')];
    function paint(){
      const ticketVisible=phase==='ticket'||phase==='extracting';
      field.dataset.phase=phase;field.dataset.catches=hit;
      holes.forEach((h,i)=>{h.classList.toggle('active',i===active);h.classList.toggle('ticket',ticketVisible&&i===active);h.querySelector('.c-carrot-sprite').hidden=ticketVisible;h.querySelector('.c-ticket-sprite').hidden=!(ticketVisible&&i===active);h.setAttribute('aria-label','Carrot hole '+(i+1)+(i===active?(ticketVisible?', pull up to take the ticket':', tap to catch the carrot'):''));});
      c.querySelectorAll('.c-count i').forEach((x,i)=>x.classList.toggle('done',i<hit));
    }
    function scheduleHop(ms){clearTimeout(hopTimer);hopTimer=after(hop,ms);}
    function holdTime(){return 1280-hit*170;}
    function hop(){if(phase!=='carrot'||locked)return;if(modal||(press&&press.wasActive)){scheduleHop(180);return;}active=(active+1+Math.floor(Math.random()*4))%6;paint();scheduleHop(holdTime());}
    function pull(value){p=Math.max(0,Math.min(1,value));holes[active].style.setProperty('--pull',p);}
    function done(){if(locked)return;locked=true;phase='extracting';pull(1);paint();window.OpeningSFX?.ticket();after(()=>afterNarration(()=>open('coins',undefined,{fromTicket:true}),true),300);}
    holes.forEach((h,i)=>{
      listen(h,'click',e=>{
        B.audio.unlock();const started=press;press=null;
        if(e.detail!==0&&suppressClick){suppressClick=false;return;}
        if(i!==active||locked||modal||(e.detail!==0&&started&&(!started.wasActive||started.phase!==phase)))return;
        if(phase==='carrot'){
          hit++;window.OpeningSFX?.carrot(hit);const previous=active;active=-1;phase='between';clearTimeout(hopTimer);paint();
          after(()=>{active=(previous+2)%6;phase=hit===3?'ticket':'carrot';paint();if(phase==='ticket'){say('Your invitation.');hint('Pull the ticket up. Repeated taps or Enter will do it too.');}else scheduleHop(holdTime());},125);
        }else if(phase==='ticket'&&!drag){pull(p+.35);if(p>=1)done();}
      });
      listen(h,'pointerdown',e=>{
        if(e.button!==0||e.isPrimary===false||locked||modal)return;
        suppressClick=false;press={hole:i,wasActive:i===active,phase,pointerId:e.pointerId};
        if(phase!=='ticket'||i!==active)return;
        drag={pointerId:e.pointerId,y:e.clientY,start:p,moved:false};h.setPointerCapture(e.pointerId);
      });
      listen(h,'pointermove',e=>{if(!drag||drag.pointerId!==e.pointerId||locked||modal)return;const dy=drag.y-e.clientY;if(Math.abs(dy)>6)drag.moved=true;const distance=Math.min(90,Math.max(46,field.clientHeight*.105));pull(drag.start+dy/distance);if(p>=.95)done();});
      listen(h,'pointerup',e=>{if(drag&&drag.pointerId===e.pointerId){suppressClick=drag.moved;drag=null;}});
      listen(h,'pointercancel',e=>{if(drag&&drag.pointerId===e.pointerId){drag=null;pull(0);}if(press?.pointerId===e.pointerId)press=null;suppressClick=true;});
    });
    listen(window,'pointerup',()=>{if(!drag)after(()=>{press=null;},0);});
    listen(window,'blur',()=>{drag=null;press=null;if(!locked&&phase==='ticket')pull(0);});
    paint();scheduleHop(1400);hint('Tap a carrot when it peeks out. Misses leave your catches intact.');
    say("From beneath the counter came the rabbit usher's voice.");
  }
  function coins(fromTicket){
    const c=base('','','');
    c.innerHTML='<div class="c-coin-landscape" aria-label="Play the worms’ tune on the silver coins"><div class="c-coin-composition" id="c-coin-composition"><img class="c-coins-ground" src="'+asset('coins-v25/background.webp')+'" alt="" draggable="false">'+[1,2,3].map(n=>'<button class="c-landscape-coin c-landscape-coin-'+n+'" data-coin="'+(n-1)+'" aria-label="Play silver coin '+n+'"><img src="'+asset('coins-v16/coin-'+n+'.png')+'" alt="" draggable="false"></button>').join('')+'<img class="c-landscape-ticket" src="'+asset('coins-v25/ticket.png')+'" alt="The usher’s carrot ticket" draggable="false"><img class="c-landscape-leaves" src="'+asset('coins-v25/leaves.png')+'" alt="" draggable="false">'+[1,2,3].map(n=>'<img class="c-landscape-worm c-landscape-worm-'+n+'" data-worm="'+(n-1)+'" src="'+asset('coins-v25/worm.png')+'" alt="Worm beside silver coin '+n+'" draggable="false">').join('')+'</div></div><button class="c-coins-repeat" id="c-repeat" aria-label="Replay the worms’ tune" title="Listen again">↻</button>';
    $('#c-coin-composition').insertAdjacentHTML('beforeend','<canvas class="c-coin-reclining-rabbit" width="512" height="512" data-cast="rabbit-lie" role="img" aria-label="The usher reclines, crossing its legs and tapping one foot"></canvas>');animateCast();
    c.querySelector('.c-coin-landscape').style.backgroundImage='url("'+asset('coins-v25/background.webp')+'")';
    const buttons=[...c.querySelectorAll('[data-coin]')],worms=[...c.querySelectorAll('[data-worm]')],seq=[1,0,2],composition=$('#c-coin-composition');
    const repeat=$('#c-repeat');
    const guide=document.createElement('aside');
    guide.className='c-coin-guide';
    const prompt=document.createElement('p');
    prompt.id='c-coin-prompt';
    prompt.setAttribute('role','status');
    prompt.textContent='Watch the worms. Then tap their coins in the same order to enter the theatre.';
    repeat.textContent='Replay';
    repeat.disabled=true;
    c.append(guide);
    guide.append(prompt,repeat);
    buttons.forEach(button=>button.setAttribute('aria-describedby',prompt.id));
    let input=[],busy=true,finished=false;
    function resize(){
      // Keep the three calling worms in sight, including the outer two on
      // short wide views. All coin hit areas remain attached to their prints.
      const portrait=innerWidth/innerHeight<1.2;
      const scale=portrait?Math.min(innerWidth/1920,innerHeight/1080):Math.min(Math.max(innerWidth/1920,innerHeight/1080),innerWidth/1800,innerHeight/1040);
      composition.style.setProperty('--coin-scale',scale);
      composition.style.setProperty('--coin-page-height',Math.max(1900,Math.min(3350,(innerHeight-178)/scale))+'px');
    }
    listen(window,'resize',resize);resize();
    function flash(i,answer=false){
      const worm=worms[i];worm.classList.remove('is-calling');void worm.offsetWidth;worm.classList.add('is-calling');
      if(answer)buttons[i].classList.add('is-answered');window.OpeningSFX?.note(i);
      after(()=>{worm.classList.remove('is-calling');buttons[i].classList.remove('is-answered');},500);
    }
    function play(){
      if(busy||finished)return;
      busy=true;input=[];repeat.disabled=true;
      composition.dataset.state='listen';
      prompt.textContent='Watch the worms. Then tap their coins in the same order to enter the theatre.';
      seq.forEach((n,i)=>after(()=>flash(n),i*760));
      after(()=>{
        busy=false;repeat.disabled=false;composition.dataset.state='answer';
        prompt.textContent='Your turn. Tap the coins in the same order to enter the theatre.';
      },2400);
    }
    listen(repeat,'click',play);
    buttons.forEach((button,i)=>listen(button,'click',()=>{
      B.audio.unlock();if(busy||finished)return;flash(i,true);input.push(i);
      if(input[input.length-1]!==seq[input.length-1]){
        busy=true;repeat.disabled=true;composition.dataset.state='retry';
        prompt.textContent='Listen again. The worms will show you.';
        after(()=>{busy=false;play();},700);return;
      }
      if(input.length===3){
        finished=true;repeat.disabled=true;composition.dataset.state='solved';
        prompt.textContent='The theatre is open.';
        after(()=>open('walk'),850);
      }
    }));
    const firstNotes=()=>{busy=false;play();};
    if(fromTicket){
      say('He tapped one foot, and three worms struck up the overture.');
      afterNarration(firstNotes,true);
    }else after(firstNotes,450);
  }
  function walkScene(){theatre.walk();}
  function curtainScene(){theatre.curtain();}
  function propsScene(){theatre.props();}
  function gachaScene(){theatre.gacha();}
  function overheadRabbit(canvas){
    const ctx=canvas.getContext('2d');let last='',mode='idle',time=0,heading=0;
    const overheadImgs={walk:sceneImage('rabbit-overhead-v01/walk.webp'),wave:sceneImage('rabbit-overhead-v01/wave.webp')};
    canvas.dataset.view='overhead';
    function draw(next='idle',elapsed=0){
      mode=next;time=elapsed;
      const image=overheadImgs[next==='wave'?'wave':'walk'];
      if(!image.complete||!image.naturalWidth)return;
      const n=reduce||next==='idle'?0:next==='wave'?Math.min(7,Math.floor(elapsed*6/1000)):Math.floor(elapsed*8/1000)%8;
      const key=next+':'+n;if(last===key)return;last=key;
      const w=image.naturalWidth/4,h=image.naturalHeight/2;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(image,n%4*w,Math.floor(n/4)*h,w,h,0,0,canvas.width,canvas.height);
      canvas.dataset.pose=next;canvas.dataset.frame=n;
    }
    Object.values(overheadImgs).forEach(image=>listen(image,'load',()=>{last='';draw(mode,time);}));
    draw();
    return {draw,face(dx,dy){
      if(Math.hypot(dx,dy)<2)return;
      const target=Math.atan2(dy,dx)+Math.PI/2;
      heading+=Math.atan2(Math.sin(target-heading),Math.cos(target-heading))*.3;
      canvas.style.setProperty('--rf',heading+'rad');
    }};
  }

  function cylinderCan(canvas){
    const ctx=canvas.getContext('2d'),cw=canvas.width,ch=canvas.height;
    const renderer=window.OpeningCanRenderer?.get(asset('theatre-v45/can.png'));let angle=0,heading=0,last=NaN;
    function draw(){
      if(!renderer||!renderer.width||angle===last)return;
      last=angle;canvas.dataset.rollAngle=String(angle);canvas.dataset.surface='sealed';canvas.dataset.frontAsset='theatre-v45/can.png';canvas.dataset.frame=String(window.OpeningCanRenderer.phase(angle));
      ctx.clearRect(0,0,cw,ch);renderer.draw(ctx,{x:cw/2,y:ch/2,height:Math.min(ch,cw*renderer.height/renderer.width),angle});
    }
    renderer?.ready.then(()=>{if(!canvas.isConnected)return;last=NaN;draw();}).catch(error=>console.error('[OPENING] Can artwork',error));draw();
    return {roll(dx,dy){
      const distance=Math.hypot(dx,dy);if(distance<.01)return;
      // A cylinder rolls perpendicular to its long axis. Steering changes that
      // axis; reversing direction reverses the wrapper without flipping the can.
      const target=Math.atan2(dy,dx);
      let turn=target-heading;
      while(turn>Math.PI/2)turn-=Math.PI;
      while(turn<-Math.PI/2)turn+=Math.PI;
      heading+=turn*(1-Math.exp(-distance/14));
      const direction=Math.cos(target-heading)>=0?1:-1;
      angle+=direction*distance/Math.max(1,canvas.clientWidth*.475);
      canvas.style.setProperty('--heading',heading+'rad');draw();
    }};
  }

  function chaseScene(){
    const c=base('That’s <em>not my cue.</em>','07 / A SMALL REHEARSAL','');
    c.innerHTML='<div class="c-chase" id="c-chase" aria-label="Dressing-room chase"><canvas class="c-chase-rabbit c-rabbit c-overhead-rabbit" width="448" height="448" role="img" aria-label="Overhead view of the usher chasing the can and waving its wings"></canvas><canvas class="c-chase-can" width="256" height="446" aria-label="Drag to steer the can. Press Enter to hand it over" tabindex="0" role="button"></canvas></div><div class="c-controls"><div class="c-caption" id="c-caption">Drag to steer.</div><button class="c-btn secondary" id="c-give-can" disabled>Ready for the stage →</button></div>';
    $('#c-chase').style.setProperty('--theatre-floor','url("'+asset('theatre-v33/wood-floor.webp')+'")');
    const field=$('#c-chase'),can=$('.c-chase-can'),rabbit=$('.c-chase-rabbit'),give=$('#c-give-can');
    let width=innerWidth,height=innerHeight,x=width*.43,y=height*.53,bx=width*.77,by=height*.69,vx=0,vy=0,drag=null,prev=0,ready=false,readySince=0,done=false,hasPlayed=false;
    const bound=(v,lo,hi)=>Math.max(lo,Math.min(hi,v)),cylinder=cylinderCan(can),actor=overheadRabbit(rabbit);
    let waveAt=performance.now(),wasMoving=false,footTravel=0,lastFoot=0;
    function radius(){return Math.hypot(can.offsetWidth,can.offsetHeight)/2+5;}
    function bounds(){const r=radius();return {left:Math.max(r,width*.20),right:Math.min(width-r,width*.80),top:Math.max(r,height*.15),bottom:Math.min(height-r,height*.90)};}
    function catchDistance(){return Math.max(85,(can.offsetWidth+rabbit.offsetWidth*.72)/2);}
    function paint(){can.style.left=x+'px';can.style.top=y+'px';rabbit.style.left=bx+'px';rabbit.style.top=by+'px';actor.face(x-bx,y-by);}
    function roll(dx,dy){cylinder.roll(dx,dy);}
    function finish(){
      if(!ready||done)return;
      done=true;drag=null;vx=vy=0;can.classList.add('is-handed');give.disabled=true;hint('');cue('handoff');
      after(()=>afterNarration(()=>{
        say('first-act');
        afterNarration(()=>{
          cue('slate');
          after(()=>afterNarration(()=>open('level',0),true),285);
        },true);
      },true),550);
    }
    listen(can,'pointerdown',e=>{if(done)return;e.preventDefault();B.audio.unlock();hasPlayed=true;drag={id:e.pointerId,offsetX:e.clientX-x,offsetY:e.clientY-y,time:performance.now()};vx=vy=0;can.setPointerCapture(e.pointerId);can.classList.add('is-held');});
    listen(can,'pointermove',e=>{
      if(!drag||drag.id!==e.pointerId)return;
      const limits=bounds(),nx=bound(e.clientX-drag.offsetX,limits.left,limits.right),ny=bound(e.clientY-drag.offsetY,limits.top,limits.bottom),now=performance.now(),dt=bound((now-drag.time)/1000,.008,.06),dx=nx-x,dy=ny-y;
      vx=bound(dx/dt,-1500,1500);vy=bound(dy/dt,-1500,1500);roll(dx,dy);x=nx;y=ny;drag.time=now;paint();
    });
    function release(e){if(!drag||drag.id!==e.pointerId)return;if(performance.now()-drag.time>100)vx=vy=0;drag=null;can.classList.remove('is-held');if(ready&&performance.now()-readySince>1800&&Math.hypot(x-bx,y-by)<catchDistance()+25)finish();}
    listen(can,'pointerup',release);listen(can,'pointercancel',()=>{drag=null;vx=vy=0;can.classList.remove('is-held');});
    listen(can,'lostpointercapture',()=>{drag=null;can.classList.remove('is-held');});
    listen(can,'keydown',e=>{
      if(done)return;
      if(e.key==='Enter'||e.key===' '){e.preventDefault();if(ready)finish();return;}
      const d={ArrowLeft:[-38,0],ArrowRight:[38,0],ArrowUp:[0,-38],ArrowDown:[0,38]}[e.key];if(!d)return;e.preventDefault();hasPlayed=true;
      const limits=bounds(),nx=bound(x+d[0],limits.left,limits.right),ny=bound(y+d[1],limits.top,limits.bottom);roll(nx-x,ny-y);x=nx;y=ny;vx=vy=0;paint();
    });
    listen(window,'resize',()=>{const nw=innerWidth,nh=innerHeight;x=x/width*nw;y=y/height*nh;bx=bx/width*nw;by=by/height*nh;width=nw;height=nh;const limits=bounds();x=bound(x,limits.left,limits.right);y=bound(y,limits.top,limits.bottom);paint();});
    listen(window,'blur',()=>{drag=null;vx=vy=0;can.classList.remove('is-held');});
    function tick(t){
      const dt=Math.min(.035,(t-prev)/1000||.016);prev=t;
      if(!done&&!modal){
        if(!drag&&!reduce){
          const ox=x,oy=y,limits=bounds();x+=vx*dt;y+=vy*dt;
          if(x<limits.left||x>limits.right){x=bound(x,limits.left,limits.right);vx*=-.52;}
          if(y<limits.top||y>limits.bottom){y=bound(y,limits.top,limits.bottom);vy*=-.52;}
          roll(x-ox,y-oy);const friction=Math.exp(-3.4*dt);vx*=friction;vy*=friction;
        }
        const dx=x-bx,dy=y-by,d=Math.hypot(dx,dy),waving=t-waveAt<1340&&(!hasPlayed||d<=catchDistance()+20);
        const step=waving?0:Math.min(Math.max(0,d-catchDistance()),dt*Math.min(310,80+d*.7));
        if(step>.05){bx+=dx/d*step;by+=dy/d*step;wasMoving=true;actor.draw('walk',t);footTravel+=step;if(footTravel>48&&t-lastFoot>220){cue('footstep',{volume:.32});footTravel=0;lastFoot=t;}}
        else {if(wasMoving){waveAt=t;wasMoving=false;}actor.draw(t-waveAt<1340?'wave':'idle',t-waveAt);}
        const rx=rabbit.offsetWidth/2+5,ry=rabbit.offsetHeight/2+5;bx=bound(bx,Math.max(rx,width*.20),Math.min(width-rx,width*.80));by=bound(by,Math.max(ry,height*.15),Math.min(height-ry,height*.90));
        if(ready&&hasPlayed&&!drag&&t-readySince>1800&&d<catchDistance()+8&&Math.hypot(vx,vy)<70)finish();
        paint();
      }
      frame=requestAnimationFrame(tick);
    }
    after(()=>{ready=true;readySince=performance.now();say('Oh, let the magician have it. At this rate, the chase will be the entire show.');give.disabled=false;give.textContent='Ready for the stage →';hint('Let the magician catch up, or choose Ready for the stage.');},6500);
    listen(give,'click',()=>finish());hint('Drag the can across the clear floor. Release it to keep it rolling.');paint();frame=requestAnimationFrame(tick);
  }

  // The playable comic chapters are mounted below.
  let levelScene,finaleScene,epilogues;
  function boot(){
    const oldList=$('#scene-list'),oldNames=['','','The Carrot Ticket and the Secret Tune','Under the Sheets','A Very Small Leap','The Two Rescues','Handle with Care','The Chest and the Curtain Call'];
    const oldRoutes={2:['ticket'],3:['props'],4:['level',0],5:['level',1],6:['level',5],7:['finale']};
    function refreshOldMenu(){oldList?.querySelectorAll('[data-go]').forEach(b=>{const i=+b.dataset.go;if(i>=2)b.innerHTML='<span>'+String(i+1).padStart(2,'0')+'</span>'+oldNames[i]+'<i>↗</i>';});}
    ['program','home'].forEach(id=>document.getElementById(id)?.addEventListener('click',refreshOldMenu));
    oldList?.addEventListener('click',e=>{const b=e.target.closest('[data-go]');if(!b)return;const route=oldRoutes[+b.dataset.go];if(route){e.stopImmediatePropagation();$('#program-dialog')?.close();open(route[0],route[1]);}},true);
    const p=new URLSearchParams(location.search);
    if(p.has('comic')){open(p.get('comic')||'ticket',p.has('level')?+p.get('level'):undefined);return;}
    const quick=document.createElement('button');quick.className='c-intro-skip';quick.textContent='Play the comic ↗';quick.onclick=()=>open(saved.screen==='level'?'level':'ticket',saved.level);document.body.append(quick);
  }
  window.addEventListener('pagehide',()=>{cleanup();});
  function thumb(type){
    const p=W.pieces[type],isHigh=p.input===230;
    let path='M0 '+(isHigh?67:108)+'H240';
    if(type==='ramp'||type==='lift')path='M0 108L35 108 200 67H240';
    if(type==='down'||type==='upperPin')path='M0 67H45L200 108H240';
    let detail='';
    if(type==='bridge'||type==='lowBridge'||type==='cargoBridge')detail='<path d="M30 38v95m180-95v95M30 45q90 65 180 0" fill="none" stroke="#28231e" stroke-width="3"/><path d="M25 '+(isHigh?70:108)+'h190" stroke="#a84131" stroke-width="6"/>';
    if(type==='pressure'||type==='counter'||type==='counterCargo')detail='<path d="M85 107v-12h65v12M117 95V22H215v70" fill="none" stroke="#28231e" stroke-width="3"/><rect x="187" y="55" width="45" height="30" fill="#b9a77e" stroke="#28231e" stroke-width="3"/>';
    if(type==='cage')detail='<path d="M95 2v25M60 30h75v40H60zM78 30v40m19-40v40m19-40v40" stroke="#28231e" stroke-width="3" fill="#dfd4b7"/><path d="M90 57q-15-20 7-20 11 0 12 9l17 6-17 6z" fill="#a34433"/>';
    if(type==='dragon')detail='<path d="M32 35l30-20 15 13 23-9 18 20 45-6 49 24-45 13-53-3-20 28-24-20-28-2z" fill="#b04735" stroke="#28231e" stroke-width="4"/><circle cx="142" cy="43" r="4" fill="#28231e"/>';
    if(type==='upperPin'||type==='lowerPin')detail='<path d="M100 27v'+(isHigh?40:81)+'m-8-78h17" stroke="#a84131" stroke-width="6"/><path d="M105 24H222v88" fill="none" stroke="#28231e" stroke-dasharray="3 4" stroke-width="2"/>';
    if(type==='load')detail='<path d="M87 41h76v47H87zM90 41q0-26 35-26t35 26M100 88v20m50-20v20" fill="#b9a77e" stroke="#28231e" stroke-width="3"/><circle cx="98" cy="109" r="6" fill="#28231e"/><circle cx="154" cy="109" r="6" fill="#28231e"/>';
    return '<svg class="c-thumb" viewBox="0 0 240 135" aria-hidden="true"><path d="M0 128h240M15 2v130m210-130v130" stroke="#27231c" stroke-width="1" opacity=".18"/>'+detail+'<path d="'+path+'" fill="none" stroke="#28231e" stroke-width="5"/><path d="M10 133l20-12m15 12 20-12m15 12 20-12m15 12 20-12m15 12 20-12m15 12 20-12" stroke="#28231e" stroke-width="1"/></svg>';
  }
  const sceneImages=new Map();
  function sceneImage(key){
    if(!sceneImages.has(key)){
      const image=new Image();
      image.src=asset(key);
      sceneImages.set(key,image);
    }
    return sceneImages.get(key);
  }
  function inkLine(ctx,x1,y1,x2,y2,width=3,color='#29261f'){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
  function drawDuck(ctx,x,y,size,kind=0,motion='idle',right=false){const key=(kind?'right':'left')+'-'+motion;window.OpeningCast.paint(ctx,key,reduce?0:window.OpeningCast.frame(key,performance.now()),x-size/2,y-size,size,size,right);}
  function drawChest(ctx,x,y,size=85){ctx.save();ctx.translate(x,y);ctx.fillStyle='#d2cbbd';ctx.strokeStyle='#29261f';ctx.lineWidth=3;ctx.fillRect(-size/2,-size*.65,size,size*.65);ctx.strokeRect(-size/2,-size*.65,size,size*.65);ctx.beginPath();ctx.moveTo(-size/2,-size*.65);ctx.quadraticCurveTo(-size*.45,-size*1.04,0,-size*1.04);ctx.quadraticCurveTo(size*.45,-size*1.04,size/2,-size*.65);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#3c352a';ctx.fillRect(-size*.32,-size*.67,size*.09,size*.67);ctx.fillRect(size*.23,-size*.67,size*.09,size*.67);for(let n=1;n<4;n++)inkLine(ctx,-size/2,-size*.14*n,size/2,-size*.14*n,1,'#5a4932');ctx.restore();}
  function etching(ctx,w,type,n,view){
    // Printed stage flats: quiet paper, visible hinges and a few deliberate ink shadows.
    const ground=W.pieces[type].input;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    if(w.index===4){
      inkLine(ctx,34,-30,82,ground,8,'#191919');inkLine(ctx,323,-20,370,ground,8,'#191919');
      inkLine(ctx,45,70,340,126,4,'#191919');
      [72,224].forEach(y=>{ctx.fillStyle='#191919';ctx.beginPath();ctx.arc(51+y*.1,y,3,0,Math.PI*2);ctx.fill();});
    }else{
      inkLine(ctx,view?.left??0,ground-28,view?.right??400,ground-28,.7,'#c5c1b6');

    }
    // Scenery screws, never a full-screen texture filter.
    [26,374].forEach(x=>{ctx.strokeStyle='#191919';ctx.lineWidth=1.3;ctx.beginPath();ctx.arc(x,ground-6,2.5,0,Math.PI*2);ctx.stroke();inkLine(ctx,x-1.5,ground-7.5,x+1.5,ground-4.5,.8,'#191919');});
    ctx.restore();
  }
  function drawDevice(ctx,w,type){
    const f=w.flags,y=W.pieces[type].input;
    const ratchet=['reel','pawl','brake'].includes(type);
    if(ratchet){
      const on=type==='reel'?f.latched:type==='pawl'?f.jawLocked:f.secured,dir=w.modes[type]?1:-1;
      ctx.save();ctx.translate(205,y-58);ctx.fillStyle='#eeeade';ctx.strokeStyle='#23231f';ctx.lineWidth=2.4;
      ctx.beginPath();for(let i=0;i<32;i++){const a=i*Math.PI/16,r=i%2?45:51;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.arc(0,0,33,0,Math.PI*2);ctx.stroke();for(let k=0;k<9;k++)inkLine(ctx,-22+k*6,-24,-30+k*6,22,.8,'#686354');
      ctx.fillStyle=on?'#a72c24':'#24241f';ctx.beginPath();ctx.arc(0,0,11,0,Math.PI*2);ctx.fill();
      inkLine(ctx,0,0,dir*62,-50,5);ctx.fillStyle='#a72c24';ctx.fillRect(dir*62-8,-58,16,16);ctx.strokeRect(dir*62-8,-58,16,16);
      ctx.beginPath();ctx.arc(0,-3,65,-2.7,-.45);ctx.stroke();ctx.beginPath();ctx.moveTo(dir*53,-65);ctx.lineTo(dir*62,-43);ctx.lineTo(dir*39,-47);ctx.stroke();
      inkLine(ctx,-43,38,-65,58,5);inkLine(ctx,43,38,65,58,5);ctx.restore();
      ctx.setLineDash([3,4]);inkLine(ctx,0,y-130,400,y-130,1,'#a72c24');ctx.setLineDash([]);
      if(type==='brake'){ctx.strokeStyle='#292821';ctx.strokeRect(100,y-28,210,22);ctx.fillStyle=on?'#a72c24':'#ddd8c8';ctx.fillRect(135,y-33,18,32);ctx.fillRect(260,y-33,18,32);}
    }
    if(type==='brace'||type==='catch'){
      const on=type==='brace'?f.wedge:f.safe;ctx.fillStyle=on?'#a72c24':'#d5d0bf';ctx.strokeStyle='#25251f';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(100,y-6);ctx.lineTo(248,y-6);ctx.lineTo(on?248:160,y-77);ctx.closePath();ctx.fill();ctx.stroke();
      for(let k=0;k<13;k++)inkLine(ctx,109+k*10,y-8,106+k*10,y-8-Math.min(60,k*5),.8,'#3b382c');
      inkLine(ctx,212,y-65,355,y-130,1.5,'#a72c24');ctx.beginPath();ctx.arc(350,y-133,10,0,Math.PI*2);ctx.stroke();
    }
    if(type==='cue'){
      inkLine(ctx,205,y,205,y-130,4);inkLine(ctx,205,y-130,270,y-130,3);ctx.fillStyle=f.cued?'#a72c24':'#d8d3c1';ctx.strokeStyle='#24241e';ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(230,y-125);ctx.quadraticCurveTo(210,y-105,210,y-75);ctx.lineTo(282,y-75);ctx.quadraticCurveTo(280,y-105,263,y-125);ctx.closePath();ctx.fill();ctx.stroke();
      inkLine(ctx,246,y-75,246,y-55,3);[0,1,2].forEach(k=>inkLine(ctx,300+k*8,y-105-k*7,307+k*10,y-112-k*7,1.5,'#a72c24'));
    }
  }
  function drawWorld(ctx,w,camera,time,onlyPiece,view){
    if(onlyPiece!==undefined){
      const group=Math.min(w.index,2);
      if(!chapterRenderers[group])chapterRenderers[group]=chapterModules[group]?.create({W,asset,reduced:reduce,paintDuck:drawDuck});
      const render=chapterRenderers[group];
      if(render){render(ctx,w,camera,time,onlyPiece,view);return;}
    }
    const scenery={tree:sceneImage('ensemble-v34/stage-tree.webp'),cage:sceneImage('theatre-v33/hanging-cage.webp'),wood:sceneImage('theatre-v33/wood-floor.webp')};
    const cw=1200,ch=900;ctx.save();ctx.filter='grayscale(1)';ctx.clearRect(0,0,cw,ch);ctx.fillStyle='#f5f5f5';ctx.fillRect(0,0,cw,ch);
    const inside=w.index===4;
    if(inside){for(let i=0;i<8;i++){const xx=i*165-camera*.2;inkLine(ctx,xx,20,xx+80,420,12,'#d1cdbf');inkLine(ctx,xx+4,20,xx+84,420,1,'#39372f');}}
    ctx.translate(-camera,0);
    w.route.forEach((type,index)=>{
      if(onlyPiece!==undefined&&index!==onlyPiece)return;
      const x=index*W.P,f=w.flags,p=W.pieces[type];ctx.save();ctx.translate(x,0);etching(ctx,w,type,index,view);
      if(type==='start'||type==='startHigh'){
        const lampY=p.input-132;inkLine(ctx,30,p.input,30,lampY,2,'#282720');inkLine(ctx,30,lampY,135,lampY,2,'#282720');
        ctx.fillStyle='#252520';ctx.beginPath();ctx.moveTo(72,lampY+2);ctx.lineTo(104,lampY+2);ctx.lineTo(112,lampY+20);ctx.lineTo(64,lampY+20);ctx.closePath();ctx.fill();
        ctx.fillStyle='#e8e1c045';ctx.beginPath();ctx.moveTo(68,lampY+20);ctx.lineTo(110,lampY+20);ctx.lineTo(210,p.input);ctx.lineTo(0,p.input);ctx.closePath();ctx.fill();
      }
      if(type==='ramp'||type==='down'||type==='bridge'||type==='lowBridge'){
        const tree=scenery.tree;
        if(tree.complete&&tree.naturalWidth)for(let i=0;i<2;i++){
          const tx=40+i*285,floor=W.surface(w,x+tx)??p.input;
          const sceneryTop=Math.min(p.input,p.output)-(p.input!==p.output?115:150);
          const h=Math.max(70,Math.min(i?156:192,floor-sceneryTop-22)),ww=h*tree.naturalWidth/tree.naturalHeight;
          ctx.save();ctx.translate(tx,floor+3);if(i)ctx.scale(-1,1);ctx.drawImage(tree,-ww*.44,-h*.984,ww,h);ctx.restore();
        }
      }
      if(type==='pressure'||type==='counter'||type==='counterCargo'){
        const engaged=type==='pressure'?f.unlock:type==='counter'?f.jaw:f.crate;
        inkLine(ctx,180,330,180,90,3,'#292929');inkLine(ctx,180,90,365,90,3,'#292929');inkLine(ctx,365,90,365,engaged?125:240,3,'#292929');
        ctx.fillStyle='#89877f';ctx.fillRect(335,engaged?125:240,60,50);ctx.strokeRect(335,engaged?125:240,60,50);
        ctx.fillStyle=engaged?'#b44835':'#191919';ctx.fillRect(105,engaged?344:331,140,15);ctx.strokeRect(105,engaged?344:331,140,15);
        if(type!=='pressure'&&engaged)drawDuck(ctx,180,344,100,0);
      }
      if(type==='lift'){
        inkLine(ctx,70,120,70,410,9,'#333333');inkLine(ctx,330,120,330,410,9,'#333333');
        for(let k=0;k<7;k++)inkLine(ctx,70,145+k*35,330,145+k*35,1,'#66543e');
        // A ghost path makes the inactive lift's intended rise visible.
        ctx.save();ctx.setLineDash(f.latched?[]:[7,7]);ctx.strokeStyle=f.latched?'#a42e26':'#6e6a5a';ctx.lineWidth=f.latched?5:2;
        ctx.beginPath();ctx.moveTo(70,350);ctx.lineTo(320,230);ctx.stroke();ctx.setLineDash([]);
        inkLine(ctx,205,300,205,245,2,f.latched?'#a42e26':'#6e6a5a');inkLine(ctx,205,245,195,258,2);inkLine(ctx,205,245,215,258,2);
        ctx.strokeStyle=f.latched?'#a42e26':'#6e6a5a';ctx.lineWidth=2;ctx.strokeRect(185,165,30,24);ctx.beginPath();ctx.arc(f.latched?200:211,164,11,Math.PI,0);ctx.stroke();ctx.restore();
        ctx.fillStyle=f.latched?'#a42e26':'#26251e';ctx.beginPath();ctx.arc(200,150,7,0,Math.PI*2);ctx.fill();
      }
      if(type==='cage'){
        const image=scenery.cage,opened=worldSafeRescue(w),h=310,ww=h*2/3,bottom=p.input-8,left=205-ww/2,top=bottom-h;
        if(image.complete&&image.naturalWidth){
          // Cage and performer share one physical floor; the doorway is transparent.
          drawDuck(ctx,opened?292:205,bottom-25,opened?100:96,0,opened?'dance':'idle');
          ctx.drawImage(image,left,top,ww,h);
          // A separate arched door swings on the hinges already painted in the art.
          ctx.save();ctx.translate(left+ww*.30,top+h*.555);ctx.scale(opened?.12:1,1);
          ctx.beginPath();ctx.moveTo(0,h*.32);ctx.lineTo(0,h*.07);ctx.quadraticCurveTo(ww*.18,-h*.08,ww*.38,h*.07);ctx.lineTo(ww*.38,h*.32);ctx.closePath();ctx.fillStyle='#eee6d514';ctx.fill();ctx.strokeStyle='#181715';ctx.lineWidth=3;ctx.stroke();
          for(let n=1;n<5;n++)inkLine(ctx,n*ww*.075,h*.035,n*ww*.075,h*.31,2.3,'#25211b');
          ctx.fillStyle='#94352c';ctx.fillRect(ww*.30,h*.17,10,7);ctx.restore();
        }
      }
      if(type==='dragon'){
        const mouth=f.jawLocked?60:15;
        ctx.fillStyle='#ded8c9';ctx.strokeStyle='#29261f';ctx.lineWidth=5;
        ctx.beginPath();ctx.moveTo(20,180);ctx.lineTo(55,70);ctx.lineTo(90,99);ctx.lineTo(120,55);ctx.lineTo(160,95);ctx.lineTo(270,100);ctx.lineTo(355,150-mouth);ctx.lineTo(260,175-mouth);ctx.lineTo(150,175-mouth);ctx.lineTo(120,220);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.beginPath();ctx.moveTo(160,215);ctx.lineTo(265,220);ctx.lineTo(355,205+mouth*.3);ctx.lineTo(275,240);ctx.lineTo(150,240);ctx.closePath();ctx.fill();ctx.stroke();
        ctx.fillStyle='#24221e';ctx.beginPath();ctx.arc(260,125-mouth*.2,8,0,Math.PI*2);ctx.fill();
        inkLine(ctx,150,220,95,450,8,'#333333');ctx.fillStyle='#29261f';[85,270].forEach(xx=>{ctx.beginPath();ctx.arc(xx,447,13,0,Math.PI*2);ctx.fill();});
        for(let k=0;k<19;k++)inkLine(ctx,35+k*9,150,47+k*9,120,1,'#24231bb0');
        inkLine(ctx,247,105-mouth*.2,274,109-mouth*.2,3,'#24231e');
      }
      if(type==='upperPin'||type==='lowerPin'){
        const released=type==='upperPin'?f.pin:!!f.pin;
        ctx.save();ctx.translate(145,type==='upperPin'?215:333);ctx.rotate(released?.7:0);ctx.fillStyle=released?'#8b886b':'#a74231';ctx.fillRect(-8,-80,16,90);ctx.strokeStyle='#29261f';ctx.lineWidth=3;ctx.strokeRect(-8,-80,16,90);inkLine(ctx,-21,-80,21,-80,7);ctx.restore();
        ctx.setLineDash([5,4]);inkLine(ctx,145,105,390,105,2,'#68543b');inkLine(ctx,390,105,390,340,2,'#68543b');ctx.setLineDash([]);
        if(type==='lowerPin'){drawDuck(ctx,290,347,110,1);if(!f.pin)inkLine(ctx,190,170,190,350,14,'#555555');}
      }
      if(type==='load'&&!f.carry){drawChest(ctx,215,f.crate?347:180,100);inkLine(ctx,215,0,215,f.crate?250:80,3);}
      if(type==='bridge'||type==='lowBridge'||type==='cargoBridge'){
        const y=p.input-8;[70,330].forEach(xx=>inkLine(ctx,xx,y-110,xx,y+65,7,'#333333'));ctx.strokeStyle='#292929';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(70,y-95);ctx.quadraticCurveTo(200,y-15,330,y-95);ctx.stroke();
        if(type==='lowBridge')drawDuck(ctx,45,y,90,0);
      }
      let pts=[];function fill(){if(pts.length<2){pts=[];return;}ctx.fillStyle='#f5f1e6';ctx.strokeStyle='#191919';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(pts[0][0],ch);pts.forEach(q=>ctx.lineTo(q[0],q[1]));ctx.lineTo(pts[pts.length-1][0],ch);ctx.closePath();ctx.fill();ctx.save();ctx.clip();if(scenery.wood.complete&&scenery.wood.naturalWidth){ctx.globalAlpha=.38;const textureH=400*scenery.wood.naturalHeight/scenery.wood.naturalWidth;for(let yy=pts[0][1];yy<ch;yy+=textureH)for(let tx=Math.floor((view?.left??0)/400)*400;tx<(view?.right??400);tx+=400)ctx.drawImage(scenery.wood,tx,yy,400,textureH);}ctx.restore();ctx.stroke();pts=[];}
      const leftGround=W.surface(w,x),rightGround=W.surface(w,x+399.9);if(view&&view.left<0&&leftGround!==null)pts.push([view.left-2,leftGround]);
      for(let xx=0;xx<=400;xx+=4){const yy=W.surface(w,x+Math.min(399.9,xx));if(yy===null)fill();else pts.push([xx,yy]);}if(view&&view.right>400&&rightGround!==null)pts.push([view.right+2,rightGround]);fill();
      for(let k=0;k<17;k++){const xx=k*25,yy=W.surface(w,x+Math.min(399.9,xx));if(yy!==null){inkLine(ctx,xx,yy+12,xx+13,yy+6,1.2,'#191919');if(k%4===0){inkLine(ctx,xx+9,yy+24,xx+80,yy+24,.7,'#8c887d');inkLine(ctx,xx+14,yy+28,xx+57,yy+28,.7,'#b5afa1');}}}

      drawDevice(ctx,w,type);
      if(type==='goal'||type==='goalLow'){
        window.OpeningStageMarks.draw(ctx,w.goal?.localX||220,p.input,1);
      }
      ctx.restore();
    });
    const a=w.actor;
    if(onlyPiece!==undefined&&Math.floor(a.x/W.P)!==onlyPiece){ctx.restore();return;}
    if(w.flags.carry){drawChest(ctx,a.x-105,a.y+W.R,85);ctx.fillStyle='#29261f';[-130,-80].forEach(xx=>{ctx.beginPath();ctx.arc(a.x+xx,a.y+W.R+8,9,0,Math.PI*2);ctx.fill();});drawDuck(ctx,a.x-190,a.y+W.R,85,1,body.classList.contains('p-playing')&&Math.abs(a.vx||0)>5?'walk':'idle',(a.vx||0)>=0);}
    else if(saved.ducks>0&&w.index!==3)drawDuck(ctx,a.x-90,a.y+W.R,78,0,body.classList.contains('p-playing')&&Math.abs(a.vx||0)>5?'walk':'idle',(a.vx||0)>=0);
    ctx.fillStyle='#27231c25';ctx.beginPath();ctx.ellipse(a.x,(W.surface(w,a.x)||440)+3,37,7,0,0,Math.PI*2);ctx.fill();
    const canImg=sceneImage('can-v30/front.png');
    if(canImg.complete&&canImg.naturalWidth){
      if(!puzzleCan){puzzleCan=window.OpeningCanRenderer?.get(asset('theatre-v45/can.png'));puzzleCan?.ready.catch(()=>{});}
      // Natural source ratio, uniform scale; keep the rotating silhouette resting on the floor.
      const h=86,b=h*canImg.naturalWidth/canImg.naturalHeight;
      if(!puzzleCan?.draw(ctx,{x:a.x,y:a.y+W.R,height:h,angle:a.angle,rotation:0,anchor:'ground'}))ctx.drawImage(canImg,a.x-b/2,a.y+W.R-h,b,h);
      if(a.grounded&&Math.abs(a.vx)>65){const side=a.vx>0?-1:1;for(let k=0;k<3;k++)inkLine(ctx,a.x+side*(35+k*8),a.y+W.R-3-k*3,a.x+side*(41+k*10),a.y+W.R-6-k*4,1.5,'#191919');}
    }
    ctx.restore();
  }
  function worldSafeRescue(w){return w.done||w.flags.rescued;}
  let puzzleCan;
  const chapterModules=[window.OpeningLevelOne,window.OpeningLevelTwo,window.OpeningLaterScenes];
  const chapterRenderers=[];
  levelScene=window.OpeningPanels.create({W,B,base,saved,save,listen,after,afterNarration,say,cue,hint,renderer:drawWorld,reduced:reduce,getBody:()=>body,getApp:()=>app,getSignal:()=>signal,isModal:()=>!!modal,setFrame:id=>{frame=id;},open});
  finaleScene=function(){
    const c=base('Handle with care.','FINALE / THE GREAT REVEAL','');
    c.innerHTML='<div class="c-frame c-finale" id="c-finale"></div><div class="c-controls" hidden><div class="c-caption" id="c-caption"></div><button type="button" class="c-btn secondary" id="c-open-box"></button></div>';
    const stage=$('#c-finale'),button=$('#c-open-box'),controls=button.parentElement,owner=signal;
    body.style.setProperty('--chest-curtain','url("'+asset('theatre-v40/stage-deep-red.webp')+'")');
    stage.dataset.phase='prelude';let mounted=false;
    function onReady(){
      if(mounted||owner.aborted)return;mounted=true;
      stage.dataset.phase='loading';
      const box=document.createElement('button');box.type='button';box.id='c-chest';
      box.className='chest-mallet-target';box.hidden=true;stage.append(box);
      let pointer=null;
      const actions={
        mallet:['Hold to raise the mallet. Release to strike the lid.','Strike the lid'],
        waiting:['Tap anywhere to greet the audience','Tap anywhere to greet the audience']
      };
      function aimAt(e){
        reaction.aimAt(e.clientX,e.clientY);
      }
      const reaction=window.OpeningChestReaction.mount({stage,asset,signal:owner,reduced:reduce,isModal:()=>!!modal,afterNarration,onPhase(phase){
        stage.dataset.phase=phase;
        const action=actions[phase];box.hidden=phase!=='mallet';
        controls.hidden=!action;
        if(action){box.setAttribute('aria-label',action[0]);button.textContent=action[1];button.disabled=false;}
        if(phase==='waiting')button.focus({preventScroll:true});
      },onBeat(beat){
        if(beat==='impact')cue('braceSeat',{force:1.25,rate:.82});
        if(beat==='opened')cue('chest');
        if(beat==='audience'){
          cue('audienceDisappointed');
          window.OpeningSubtitles?.show('[The audience sighs.]');
        }
        if(beat==='departed'){
          window.OpeningSubtitles?.clear();
          afterNarration(()=>open('encore',undefined,{arrival:reaction.handoff()}),true);
        }
        if(beat==='greeting')say('Ladies and gentlemen—your prize, in person.');
        if(beat==='art-unavailable'){button.textContent='Try the reveal again';}
        if(beat==='backdrop-unavailable'){controls.hidden=false;button.disabled=false;button.textContent='Load the chest again';}
      }});
      function interact(){
        if(modal||owner.aborted)return;
        B.audio.unlock();
        if(reaction.state()==='loading'){button.disabled=true;reaction.retry();return;}
        if(reaction.state()==='waiting'){reaction.perform();return;}
        if(reaction.state()==='mallet')reaction.strike();
      }
      listen(box,'pointerdown',e=>{
        if(modal||pointer!==null||e.button!==0||!e.isPrimary)return;
        e.preventDefault();B.audio.unlock();box.focus({preventScroll:true});
        pointer=e.pointerId;box.setPointerCapture(pointer);aimAt(e);reaction.raise();
      });
      listen(box,'pointermove',e=>{if(pointer===e.pointerId)aimAt(e);});
      listen(box,'pointerup',e=>{
        if(pointer!==e.pointerId)return;
        pointer=null;reaction.strike();
      });
      function cancel(e){if(e.pointerId===undefined||pointer===e.pointerId){pointer=null;reaction.cancel();}}
      for(const event of ['pointercancel','lostpointercapture'])listen(box,event,cancel);listen(window,'blur',cancel);
      listen(box,'keydown',e=>{
        if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!e.repeat&&!modal){B.audio.unlock();reaction.raise();}}
      });
      listen(box,'keyup',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(!modal)reaction.strike();}});
      listen(box,'blur',()=>reaction.cancel());
      listen(box,'click',e=>{if(e.detail===0&&!e.pointerType)interact();});
      listen(button,'click',interact);
      listen(button,'keydown',e=>{if(e.repeat&&(e.key==='Enter'||e.key===' '))e.preventDefault();});
      listen(body,'click',e=>{if(reaction.state()==='waiting'&&!modal&&!e.target.closest('button,a,dialog'))interact();});
    }
    if(window.OpeningChestPrelude)window.OpeningChestPrelude.mount({stage,asset,signal:owner,listen,after,afterNarration,say,onReady,reduced:reduce,isModal:()=>!!modal,cue});
    else onReady();
  };
  epilogues=window.OpeningEpilogues.create({getSignal:()=>signal,isModal:()=>!!modal,base,asset,duck,animateCast,listen,after,afterNarration,cue,hint,say,saved,save,open,home:()=>B.home(),reduced:reduce,storyArt:Array.from({length:6},(_,i)=>i===0?'theatre-v33/chapter-01-bridge.webp':'stories-v32/chapter-'+String(i+1).padStart(2,'0')+'.webp')});
  const theatre=window.OpeningTheatre.create({asset,base,listen,after,afterNarration,hint,say,cue,open,duck,animateCast,saved,save,reduced:reduce,getBody:()=>body,getApp:()=>app,isModal:()=>!!modal,setFrame:id=>frame=id,music:s=>B.music?.scene(s),setScene:s=>{scene=s;app.dataset.scene=s;saved.screen=s;save();B.music?.scene(s);}});
  try{boot();}catch(error){console.error('[OPENING] Comic boot: '+error.stack);throw error;}
})();
