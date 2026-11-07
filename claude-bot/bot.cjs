// claude-bot v3: a Mineflayer bridge that a Muse drives directly.
// No external LLM API: Muse sends line commands on stdin and reads JSON
// state/events on stdout, making every decision itself.
//
// v3: stdin commands run SEQUENTIALLY (a promise queue), so one write can
// carry a whole script (dig, dig, goto, craft...) that executes in order
// without operator poll latency between steps. 'stop', 'state' and 'think'
// bypass the queue and run immediately. A HUD/thoughts web overlay is served
// on port 3008 (page at /, JSON at /state and /thoughts) for the stream:
// the viewer iframe + health/food/hotbar + a live thoughts feed fed by the
// 'think <text>' command.
//
// Commands (one per line on stdin):
//   state                     -> STATE {json}
//   say <text>                -> chat in game
//   think <text>              -> push a thought to the stream overlay feed
//   goto <x> <y> <z> [range]  -> pathfind near a position
//   stop                      -> stop moving / fighting
//   near <blockName> [count]  -> list nearest matching blocks
//   collect <blockName> <n>   -> go mine/collect n of a block (collectblock)
//   dig <x> <y> <z>           -> dig one specific block
//   place <itemName>          -> place a block item on the ground next to the bot
//   craft <itemName> [n]      -> craft (uses a crafting table when needed)
//   smelt <input> <fuel> <n>  -> smelt n items in a furnace (places one if held)
//   equip <itemName> [dest]   -> hold/wear an item
//   drop <itemName> [n]       -> toss items
//   eat                       -> eat the best food in inventory
//   attack <entityName>       -> hunt/attack nearest matching entity until dead
//   look <x> <y> <z>          -> look at a position
//   sleep / wake              -> use nearest bed
//   quit                      -> disconnect and exit

const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;
const toolPlugin = require('mineflayer-tool').plugin;
const pvpPlugin = require('mineflayer-pvp').plugin;
const { Vec3 } = require('vec3');
const readline = require('readline');
const http = require('http');
const fs = require('fs');
const path = require('path');

const bot = mineflayer.createBot({
  host: process.env.MC_HOST || '127.0.0.1',
  port: parseInt(process.env.MC_PORT || '25565', 10),
  username: process.env.MC_USER || 'MuseCraft',
  auth: 'offline',
  version: '1.21.6',
});

bot.loadPlugin(pathfinder);
bot.loadPlugin(collectBlock);
bot.loadPlugin(toolPlugin);
bot.loadPlugin(pvpPlugin);

function out(tag, data) {
  console.log(tag, typeof data === 'string' ? data : JSON.stringify(data));
}

// --- Stream overlay: thoughts feed + HUD server (port 3008) ---
const thoughts = [];
function addThought(text) {
  thoughts.push({ t: Date.now(), text: String(text).slice(0, 300) });
  while (thoughts.length > 80) thoughts.shift();
  out('THINK', text);
}

const HUD_PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>MuseCraft - live</title>
<style>
  html,body{margin:0;height:100%;background:#000;overflow:hidden;font-family:Consolas,Menlo,monospace}
  #view{position:absolute;inset:0;width:100%;height:100%;border:0}
  .panel{position:absolute;background:rgba(0,0,0,.62);color:#e8e8e8;border-radius:10px;padding:10px 14px;z-index:5}
  #info{top:12px;left:12px;font-size:14.5px;line-height:1.5;color:#cfcfcf;white-space:nowrap}
  #feed{top:12px;right:12px;width:400px;max-height:72%;display:flex;flex-direction:column}
  #feed h3{margin:0 0 6px;font-size:14px;color:#ffd75e;letter-spacing:1px}
  #thoughts{overflow:hidden;font-size:14.5px;line-height:1.5}
  #thoughts div{margin:0 0 7px;color:#d8d8d8}
  #thoughts .time{color:#7fb2ff}
  #thoughts div:last-child{color:#fff}
  #cross{position:absolute;left:50%;top:50%;width:45px;height:45px;transform:translate(-50%,-50%);z-index:4;mix-blend-mode:difference;image-rendering:pixelated;pointer-events:none}
  #hud{position:absolute;left:50%;bottom:6px;width:182px;height:90px;transform:translateX(-50%) scale(3);transform-origin:bottom center;z-index:5;pointer-events:none}
  #hud img{position:absolute;image-rendering:pixelated}
  #hud .fill{position:absolute;overflow:hidden}
  #hud .fill img{left:0;bottom:0}
  #hud .lvl{position:absolute;left:0;width:182px;text-align:center;color:#80ff20;font-weight:bold;font-size:9px;line-height:9px;text-shadow:1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000}
  #hud .cnt{position:absolute;color:#fff;font-weight:bold;font-size:8px;line-height:8px;text-shadow:1px 1px 0 #3a3a3a;text-align:right}
  #hud .lbl{position:absolute;color:#ddd;font-size:6px;line-height:1.1;text-align:center;overflow:hidden;word-break:break-word}
  #handR{position:absolute;right:-24px;bottom:-46px;width:290px;height:290px;z-index:4;pointer-events:none;perspective:700px;scale:3;transform-origin:100% 100%}
  #handL{position:absolute;left:-24px;bottom:-46px;width:290px;height:290px;z-index:4;pointer-events:none;perspective:700px;scale:3;transform-origin:0% 100%}
  .fpPose{position:absolute;inset:0;transform-style:preserve-3d;animation:handbob 2.6s ease-in-out infinite alternate}
  #handR .fpPose{transform:rotateX(-13.935deg) rotateY(35.3deg) rotateZ(-9.785deg)}
  #handL .fpPose{transform:rotateX(-13.935deg) rotateY(-35.3deg) rotateZ(9.785deg)}
  @keyframes handbob{from{margin-top:0}to{margin-top:7px}}
  .fpFlat{position:absolute;left:50%;top:50%;width:230px;height:230px;transform:translate(-50%,-50%);image-rendering:pixelated;filter:drop-shadow(6px 8px 6px rgba(0,0,0,.45));z-index:3}
  .fpCube{position:absolute;left:50%;top:50%;width:150px;height:150px;transform:translate(-50%,-50%);transform-style:preserve-3d;z-index:3}
  .fpCube div{position:absolute;inset:0;background-size:cover;image-rendering:pixelated;box-shadow:inset 0 0 0 2px rgba(0,0,0,.18)}
  .fpCube .cf{transform:translateZ(75px)}
  .fpCube .ct{transform:rotateX(90deg) translateZ(75px);filter:brightness(1.12)}
  .fpCube .cr{transform:rotateY(90deg) translateZ(75px);filter:brightness(.78)}
  .fpArm{position:absolute;left:30%;top:56%;width:74px;height:215px;transform-style:preserve-3d;transform-origin:50% 0;z-index:2}
  #handR .fpArm{transform:rotate(20deg) rotateX(10deg)}
  #handL .fpArm{transform:rotate(-20deg) rotateX(10deg);left:auto;right:30%}
  .fpArm .af{position:absolute;inset:0;background-image:url('/a/entity/player/wide/steve.png');background-size:1184px 1184px;background-position:-814px -370px;image-rendering:pixelated;box-shadow:inset 0 0 0 2px rgba(0,0,0,.15);transform:scaleY(-1)}
  .fpArm .as{position:absolute;top:0;left:100%;width:74px;height:100%;background-image:url('/a/entity/player/wide/steve.png');background-size:1184px 1184px;background-position:-888px -370px;image-rendering:pixelated;transform-origin:left center;transform:rotateY(58deg) scaleY(-1);filter:brightness(.75)}
  #handL .fpArm .as{left:auto;right:100%;transform-origin:right center;transform:rotateY(-58deg) scaleY(-1)}
  .fpItemWrap{position:absolute;inset:0;transform-style:preserve-3d;z-index:3}
  .fpHand{position:absolute;width:74px;height:54px;transform-origin:50% 0;z-index:4;background-image:url('/a/entity/player/wide/steve.png');background-size:1184px 1184px;background-position:-814px -518px;image-rendering:pixelated}
  #handR .fpHand{left:30%;top:56%;transform:rotate(20deg)}
  #handL .fpHand{right:30%;top:56%;transform:rotate(-20deg)}
</style></head><body>
<iframe id="view"></iframe>
<img id="cross" src="/a/hud/crosshair.png">
<div class="panel" id="info">connecting...</div>
<div class="panel" id="feed"><h3>&#128173; MUSE IS THINKING</h3><div id="thoughts"></div></div>
<div id="hud"></div>
<div id="handL"></div>
<div id="handR"></div>
<script>
document.getElementById('view').src = location.protocol + '//' + location.hostname + ':3007/';
function img(src,x,b,w,h){return '<img src="'+src+'" style="left:'+x+'px;bottom:'+b+'px;width:'+w+'px;height:'+h+'px">';}
function iconErr(el){
  const st=+(el.dataset.st||0);
  if(st===0){el.dataset.st=1;el.src='/a/block/'+el.dataset.name+'.png';}
  else{el.outerHTML='<div class="lbl" style="left:'+el.dataset.x+'px;bottom:'+el.dataset.b+'px;width:16px;height:16px">'+el.dataset.name.replace(/_/g,' ')+'</div>';}
}
function itemIcon(it,x,b){
  if(!it)return '';
  let s='<img src="/a/item/'+it.name+'.png" data-name="'+it.name+'" data-st="0" data-x="'+x+'" data-b="'+b+'" onerror="iconErr(this)" style="left:'+x+'px;bottom:'+b+'px;width:16px;height:16px">';
  if(it.count>1)s+='<div class="cnt" style="left:'+(x-2)+'px;bottom:'+(b+1)+'px;width:19px">'+it.count+'</div>';
  return s;
}
function buildHud(s){
  const H='/a/hud/';
  let o='';
  // --- experience bar + level (bar y = H-29, level text top = H-35) ---
  o+=img(H+'experience_bar_background.png',0,24,182,5);
  const fill=Math.max(0,Math.min(182,Math.floor((s.xpProgress||0)*183)));
  if(fill>0)o+='<div class="fill" style="left:0;bottom:24px;width:'+fill+'px;height:5px"><img src="'+H+'experience_bar_progress.png" style="width:182px;height:5px"></div>';
  if((s.xp||0)>0)o+='<div class="lvl" style="bottom:26px">'+s.xp+'</div>';
  // --- hearts (left = W/2-91, top row top = H-39, icons step 8, rows rise by rowHeight) ---
  const maxH=s.maxHealth||20, hp=Math.max(0,Math.ceil(s.health||0)), abs=0;
  const hc=Math.ceil(maxH/2), rows=Math.max(1,Math.ceil((maxH+abs)/2/10)), rh=Math.max(10-(rows-2),3);
  const t=s.heartType||'normal', pre=(t==='normal')?'heart/':'heart/'+t+'_';
  const lowShake=(hp+abs<=4);
  for(let i=0;i<hc;i++){
    const x=(i%10)*8; let b=30+Math.floor(i/10)*rh;
    if(lowShake)b+=Math.floor(Math.random()*2);
    o+=img(H+'heart/container.png',x,b,9,9);
  }
  for(let i=0;i<hc;i++){
    const q=2*i; if(q>=hp)break;
    const x=(i%10)*8; let b=30+Math.floor(i/10)*rh;
    if(lowShake)b+=Math.floor(Math.random()*2);
    o+=img(H+pre+(q+1===hp?'half.png':'full.png'),x,b,9,9);
  }
  // --- armor (only when armor > 0; y = H-40-heartRows*rowHeight) ---
  const armor=s.armor||0;
  if(armor>0){
    const b=31+rows*rh;
    for(let i=0;i<10;i++){
      const x=i*8;
      o+=img(H+'armor_empty.png',x,b,9,9);
      if(2*i+1<armor)o+=img(H+'armor_full.png',x,b,9,9);
      else if(2*i+1===armor)o+=img(H+'armor_half.png',x,b,9,9);
    }
  }
  // --- food (right-aligned from W/2+91, same row as hearts) ---
  const food=Math.max(0,Math.round(s.food||0)), hs=s.hungerEffect?'_hunger':'';
  for(let i=0;i<10;i++){
    const x=173-i*8;
    o+=img(H+'food_empty'+hs+'.png',x,30,9,9);
    if(2*i+1<food)o+=img(H+'food_full'+hs+'.png',x,30,9,9);
    else if(2*i+1===food)o+=img(H+'food_half'+hs+'.png',x,30,9,9);
  }
  // --- air bubbles (only when air is below max; row above food) ---
  if(s.air!=null&&s.maxAir&&s.air<s.maxAir){
    const fullB=Math.max(0,Math.ceil((s.air-2)*10/s.maxAir));
    const burst=Math.max(0,Math.ceil(s.air*10/s.maxAir)-fullB);
    for(let i=1;i<=10;i++){
      const x=173-(i-1)*8;
      if(i<=fullB)o+=img(H+'air.png',x,50,9,9);
      else if(i<=fullB+burst)o+=img(H+'air_bursting.png',x,50,9,9);
      else o+=img(H+'air_empty.png',x,50,9,9);
    }
  }
  // --- hotbar (bg at H-22, selection 24x23, items 16x16 at H-19) + offhand (left) ---
  if(s.offhand)o+=img(H+'hotbar_offhand_left.png',-29,-1,29,24);
  o+=img(H+'hotbar.png',0,0,182,22);
  const held=(typeof s.heldSlotIdx==='number'&&s.heldSlotIdx>=0)?s.heldSlotIdx:0;
  o+=img(H+'hotbar_selection.png',-1+held*20,0,24,23);
  (s.hotbar||[]).forEach((it,i)=>{o+=itemIcon(it,3+i*20,3);});
  if(s.offhand)o+=itemIcon(s.offhand,-26,3);
  return o;
}
// --- first-person hands + held item ---
// Item pose decoded from the 1.21.6 client (ItemInHandRenderer / gxe, via REA+javap):
// applyItemArmTransform: translate(side*0.56, -0.52 - 0.6*equip, -0.72);
// item local: translate(side*-0.2785682, 0.18344387, 0.15731531), rotX -13.935,
// rotY side*35.3, rotZ side*-9.785 (rotations live in the #handR/#handL CSS).
// The arm is the PlayerModel (goo) arm box, 4x12x4, textured from the wide Steve
// skin: front face uv (44,20), side face uv (48,20) — rendered reaching up to the item.
let lastHandR='~', lastHandL='~';
function armEl(){
  const a=document.createElement('div');a.className='fpArm';
  const f=document.createElement('div');f.className='af';a.appendChild(f);
  const s=document.createElement('div');s.className='as';a.appendChild(s);
  return a;
}
function setHand(el,name,side){
  el.innerHTML='';
  const pose=document.createElement('div');pose.className='fpPose';
  if(side==='L'&&!name){el.appendChild(pose);return;}
  pose.appendChild(armEl());
  const wrap=document.createElement('div');wrap.className='fpItemWrap';
  pose.appendChild(wrap);
  if(name){
    const probe=new Image();
    probe.onload=function(){
      const im=document.createElement('img');im.className='fpFlat';im.src='/a/item/'+name+'.png';wrap.appendChild(im);
    };
    probe.onerror=function(){
      const cube=document.createElement('div');cube.className='fpCube';
      const tex='url(/a/block/'+name+'.png)';
      ['cf','ct','cr'].forEach(function(c){const fc=document.createElement('div');fc.className=c;fc.style.backgroundImage=tex;cube.appendChild(fc);});
      wrap.appendChild(cube);
    };
    probe.src='/a/item/'+name+'.png';
  }
  const hand=document.createElement('div');hand.className='fpHand';
  pose.appendChild(hand);
  el.appendChild(pose);
}
function updateHands(s){
  const rn=s.held||null, ln=s.offhand?s.offhand.name:null;
  if(rn!==lastHandR){lastHandR=rn;setHand(document.getElementById('handR'),rn,'R');}
  if(ln!==lastHandL){lastHandL=ln;setHand(document.getElementById('handL'),ln,'L');}
}
async function tick(){
  try{
    const s=await (await fetch('/state')).json();
    const day=(s.day==null?'?':s.day);
    document.getElementById('info').textContent='Day '+day+' · '+(s.isDay?'day':'night')+(s.raining?' · rain':'')+' · pos '+(s.pos?s.pos.x+', '+s.pos.y+', '+s.pos.z:'?')+' · holding: '+(s.held||'nothing');
    document.getElementById('hud').innerHTML=buildHud(s);
    updateHands(s);
  }catch(e){}
  try{
    const th=await (await fetch('/thoughts')).json();
    document.getElementById('thoughts').innerHTML=th.slice(-13).map(x=>{
      const d=new Date(x.t);const hh=String(d.getHours()).padStart(2,'0');const mm=String(d.getMinutes()).padStart(2,'0');const ss=String(d.getSeconds()).padStart(2,'0');
      return '<div><span class="time">'+hh+':'+mm+':'+ss+'</span> '+x.text.replace(/</g,'&lt;')+'</div>';
    }).join('');
  }catch(e){}
}
setInterval(tick,1000);tick();
</script></body></html>`;

function hudState() {
  const s = stateObj();
  const hotbar = [];
  for (let slot = 36; slot <= 44; slot++) {
    const it = bot.inventory.slots[slot];
    hotbar.push(it ? { name: it.name, count: it.count } : null);
  }
  let day = null;
  try {
    const a = bot.time && bot.time.age;
    if (typeof a === 'bigint') day = Number(a / 24000n) + 1;
    else if (typeof a === 'number') day = Math.floor(a / 24000) + 1;
  } catch {}
  // Real-HUD fields (layout per the official client's Gui/ContextualBar code):
  // max health + armor from entity attributes, with an armor-piece fallback.
  let maxHealth = 20, armor = 0, armorFromAttr = false;
  try {
    const attrs = (bot.entity && bot.entity.attributes) || {};
    for (const k of Object.keys(attrs)) {
      const v = attrs[k] && typeof attrs[k].value === 'number' ? attrs[k].value : null;
      if (v == null) continue;
      if (/max_health/.test(k)) maxHealth = v;
      else if (/armor$/.test(k)) { armor = v; armorFromAttr = true; }
    }
  } catch {}
  if (!armorFromAttr) {
    try {
      const pts = { leather_helmet:1, leather_chestplate:3, leather_leggings:2, leather_boots:1, chainmail_helmet:2, chainmail_chestplate:5, chainmail_leggings:4, chainmail_boots:1, iron_helmet:2, iron_chestplate:6, iron_leggings:5, iron_boots:2, golden_helmet:2, golden_chestplate:5, golden_leggings:3, golden_boots:1, diamond_helmet:3, diamond_chestplate:8, diamond_leggings:6, diamond_boots:3, netherite_helmet:3, netherite_chestplate:8, netherite_leggings:6, netherite_boots:3, turtle_helmet:2 };
      armor = 0;
      for (const sl of [5, 6, 7, 8]) { const it = bot.inventory.slots[sl]; if (it && pts[it.name]) armor += pts[it.name]; }
    } catch {}
  }
  let heartType = 'normal', hungerEffect = false;
  try {
    const mcData = require('minecraft-data')(bot.version);
    const names = new Set();
    const effs = bot.entity && bot.entity.effects;
    if (effs) for (const e of Object.values(effs)) { const en = e && mcData.effects[e.id]; if (en) names.add(en.name); }
    if (names.has('poison')) heartType = 'poisoned';
    else if (names.has('wither')) heartType = 'withered';
    hungerEffect = names.has('hunger');
  } catch {}
  let air = null;
  try {
    // mineflayer reports oxygenLevel on a 0..20 scale; the client HUD works
    // in air ticks (300 max), so convert.
    if (typeof bot.oxygenLevel === 'number') air = Math.round(bot.oxygenLevel * 15);
  } catch {}
  const off = bot.inventory.slots[45];
  return { ...s,
    hotbar,
    heldSlotIdx: typeof bot.quickBarSlot === 'number' ? bot.quickBarSlot : -1,
    day,
    xpProgress: bot.experience ? bot.experience.progress : 0,
    maxHealth, armor, heartType, hungerEffect,
    air, maxAir: 300,
    offhand: off ? { name: off.name, count: off.count } : null,
  };
}

try {
  const hudPort = parseInt(process.env.HUD_PORT || '3008', 10);
  http.createServer((req, res) => {
    if (req.url === '/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(hudState()));
    } else if (req.url === '/thoughts') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(thoughts));
    } else if (req.url.startsWith('/a/')) {
      // Static game textures extracted from the official client jar
      // (HUD sprites + item/block icons) under claude-bot/assets/.
      const rel = decodeURIComponent(req.url.slice(3).split('?')[0]);
      const file = path.normalize(path.join(__dirname, 'assets', rel));
      if (!file.startsWith(path.join(__dirname, 'assets')) || !file.endsWith('.png')) {
        res.writeHead(404); res.end('not found');
      } else {
        fs.readFile(file, (err, buf) => {
          if (err) { res.writeHead(404); res.end('not found'); }
          else { res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'max-age=86400' }); res.end(buf); }
        });
      }
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HUD_PAGE);
    }
  }).listen(hudPort, () => out('HUD', 'overlay at http://127.0.0.1:' + hudPort));
} catch (err) {
  out('ERROR', 'hud server failed: ' + String(err && err.message || err));
}

function stateObj() {
  const e = bot.entity;
  const inv = bot.inventory.items().map(i => ({ name: i.name, count: i.count, slot: i.slot }));
  const nearby = Object.values(bot.entities)
    .filter(x => x !== e && x.position && e.position.distanceTo(x.position) <= 48)
    .map(x => ({
      type: x.type,
      name: x.username || x.name || "unknown",
      pos: { x: Math.round(x.position.x), y: Math.round(x.position.y), z: Math.round(x.position.z) },
      dist: Math.round(e.position.distanceTo(x.position)),
    }))
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 14);
  return {
    pos: e ? { x: +e.position.x.toFixed(1), y: +e.position.y.toFixed(1), z: +e.position.z.toFixed(1) } : null,
    health: bot.health,
    food: bot.food,
    saturation: bot.foodSaturation,
    xp: bot.experience ? bot.experience.level : null,
    gameMode: bot.game ? bot.game.gameMode : null,
    timeOfDay: bot.time ? bot.time.timeOfDay : null,
    isDay: bot.time ? bot.time.isDay : null,
    raining: bot.isRaining,
    held: bot.heldItem ? bot.heldItem.name : null,
    onGround: e ? e.onGround : null,
    inventory: inv,
    nearby,
  };
}

let viewerStarted = false;
bot.once('spawn', () => {
  const mcData = require('minecraft-data')(bot.version);
  const moves = new Movements(bot, mcData);
  moves.canDig = true; // full survival movement: can staircase through dirt/stone
  moves.allow1by1towers = true;
  moves.allowParkour = true;
  bot.pathfinder.setMovements(moves);
  if ('thinkTimeout' in bot.pathfinder) bot.pathfinder.thinkTimeout = 20000;
  if (bot.pvp) { bot.pvp.followRange = 48; }
  if (!viewerStarted) {
    viewerStarted = true;
    try {
      const { mineflayer: webViewer } = require('prismarine-viewer');
      webViewer(bot, { port: parseInt(process.env.VIEW_PORT || '3007', 10), firstPerson: true });
      out('VIEWER', 'bot view at http://127.0.0.1:' + (process.env.VIEW_PORT || '3007'));
    } catch (err) {
      out('ERROR', 'viewer failed: ' + String(err && err.message || err));
    }
  }
  out('SPAWNED', stateObj());
  addThought('Bot connected. HUD + thoughts overlay is live.');
});

bot.on('chat', (username, message) => {
  if (username === bot.username) return;
  out('CHAT', { from: username, message });
});
bot.on('death', () => out('EVENT', 'died'));
bot.on('respawn', () => out('EVENT', 'respawned'));
bot.on('kicked', (reason) => out('EVENT', { kicked: String(reason) }));
bot.on('error', (err) => out('ERROR', String(err && err.message || err)));
bot.on('health', () => out('HEALTH', { health: bot.health, food: bot.food }));

let gotoWaiter = null;
bot.on('goal_reached', () => { if (gotoWaiter) { gotoWaiter('ok'); } });
bot.on('path_update', (r) => {
  if (gotoWaiter && (r.status === 'noPath' || r.status === 'timeout')) gotoWaiter(r.status);
});

function goto(x, y, z, range) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { gotoWaiter = null; resolve('timeout60s'); }, 60000);
    gotoWaiter = (status) => { clearTimeout(timer); gotoWaiter = null; resolve(status); };
    bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, range || 1));
  });
}

async function placeItemNear(name) {
  const item = bot.inventory.items().find(i => i.name === name);
  if (!item) return null;
  await bot.equip(item, 'hand');
  const base = bot.entity.position.floored();
  const offsets = [[1, -1, 0], [-1, -1, 0], [0, -1, 1], [0, -1, -1], [2, -1, 0], [-2, -1, 0], [0, -1, 2], [0, -1, -2]];
  for (const [dx, dy, dz] of offsets) {
    const refPos = base.offset(dx, dy, dz);
    const ref = bot.blockAt(refPos);
    const above = bot.blockAt(refPos.offset(0, 1, 0));
    if (ref && ref.boundingBox === 'block' && above && above.name === 'air') {
      await bot.placeBlock(ref, new Vec3(0, 1, 0));
      return refPos.offset(0, 1, 0);
    }
  }
  return null;
}

async function getCraftingTable() {
  let table = bot.findBlock({ matching: b => b.name === 'crafting_table', maxDistance: 6 });
  if (table) return table;
  if (!bot.inventory.items().some(i => i.name === 'crafting_table')) return null;
  const placed = await placeItemNear('crafting_table');
  if (!placed) return null;
  table = bot.findBlock({ matching: b => b.name === 'crafting_table', maxDistance: 6 });
  return table;
}

async function getFurnace() {
  let f = bot.findBlock({ matching: b => b.name === 'furnace', maxDistance: 6 });
  if (f) return f;
  if (!bot.inventory.items().some(i => i.name === 'furnace')) return null;
  const placed = await placeItemNear('furnace');
  if (!placed) return null;
  return bot.findBlock({ matching: b => b.name === 'furnace', maxDistance: 6 });
}

async function handle(line) {
  const parts = line.trim().split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  const rest = line.trim().slice(parts[0].length).trim();
  try {
    switch (cmd) {
      case 'state':
        out('STATE', stateObj());
        break;
      case 'say':
        bot.chat(rest);
        out('OK', 'said');
        break;
      case 'think':
        addThought(rest);
        break;
      case 'goto': {
        const [x, y, z, r] = parts.slice(1).map(Number);
        const res = await goto(x, y, z, r);
        out('GOTO', { result: res, pos: stateObj().pos });
        break;
      }
      case 'stop':
        bot.pathfinder.stop();
        if (bot.pvp) bot.pvp.stop();
        bot.clearControlStates();
        out('OK', 'stopped');
        break;
      case 'near': {
        const mcData = require('minecraft-data')(bot.version);
        const name = parts[1];
        const id = mcData.blocksByName[name] && mcData.blocksByName[name].id;
        if (id === undefined) { out('NEAR', { error: 'unknown block ' + name }); break; }
        const positions = bot.findBlocks({ matching: id, maxDistance: 48, count: parseInt(parts[2] || '5', 10) });
        out('NEAR', positions.map(p => ({ x: p.x, y: p.y, z: p.z })));
        break;
      }
      case 'collect': {
        const name = parts[1];
        const count = parseInt(parts[2] || '1', 10);
        const blockType = bot.registry.blocksByName[name];
        if (!blockType) { out('COLLECT', { error: 'unknown block ' + name }); break; }
        const blocks = bot.findBlocks({ matching: blockType.id, maxDistance: 64, count });
        if (!blocks.length) { out('COLLECT', { error: 'none nearby' }); break; }
        const targets = blocks.map(p => bot.blockAt(p)).filter(Boolean);
        await bot.collectBlock.collect(targets, { ignoreNoPath: true });
        out('COLLECT', { result: 'done', want: name, pos: stateObj().pos, inventory: stateObj().inventory });
        break;
      }
      case 'dig': {
        const [x, y, z] = parts.slice(1).map(Number);
        const block = bot.blockAt(new Vec3(x, y, z));
        if (!block || block.name === 'air') { out('DIG', { error: 'no block there' }); break; }
        if (bot.tool) await bot.tool.equipForBlock(block);
        await bot.dig(block);
        out('DIG', { result: 'done', block: block.name, inventory: stateObj().inventory });
        break;
      }
      case 'place': {
        const placed = await placeItemNear(parts[1]);
        out('PLACE', placed ? { result: 'ok', at: { x: placed.x, y: placed.y, z: placed.z } } : { error: 'could not place ' + parts[1] });
        break;
      }
      case 'craft': {
        const name = parts[1];
        const count = parseInt(parts[2] || '1', 10);
        const item = bot.registry.itemsByName[name];
        if (!item) { out('CRAFT', { error: 'unknown item ' + name }); break; }
        let recipes = bot.recipesFor(item.id, null, 1, null);
        let table = null;
        if (!recipes.length) {
          table = await getCraftingTable();
          if (table) {
            await goto(table.position.x, table.position.y, table.position.z, 2);
            recipes = bot.recipesFor(item.id, null, 1, table);
          }
        }
        if (!recipes.length) { out('CRAFT', { error: 'no recipe available / missing ingredients for ' + name }); break; }
        await bot.craft(recipes[0], count, table);
        out('CRAFT', { result: 'done', item: name, inventory: stateObj().inventory });
        break;
      }
      case 'smelt': {
        const inputName = parts[1];
        const fuelName = parts[2];
        const count = parseInt(parts[3] || '1', 10);
        const furnaceBlock = await getFurnace();
        if (!furnaceBlock) { out('SMELT', { error: 'no furnace available' }); break; }
        await goto(furnaceBlock.position.x, furnaceBlock.position.y, furnaceBlock.position.z, 2);
        const inputItem = bot.registry.itemsByName[inputName];
        const fuelItem = bot.registry.itemsByName[fuelName];
        if (!inputItem || !fuelItem) { out('SMELT', { error: 'unknown input/fuel item' }); break; }
        const furnace = await bot.openFurnace(furnaceBlock);
        try {
          const haveFuel = bot.inventory.count(fuelItem.id, null);
          const fuelNeeded = Math.min(haveFuel, Math.ceil(count / 8) + 1);
          if (fuelNeeded > 0) await furnace.putFuel(fuelItem.id, null, fuelNeeded);
          await furnace.putInput(inputItem.id, null, count);
          const deadline = Date.now() + count * 11000 + 30000;
          while (Date.now() < deadline) {
            const o = furnace.outputItem();
            if (o && o.count >= count) break;
            await new Promise(r => setTimeout(r, 2000));
          }
          const o = furnace.outputItem();
          if (o) await furnace.takeOutput();
          out('SMELT', { result: o ? 'done' : 'timeout', inventory: stateObj().inventory });
        } finally {
          furnace.close();
        }
        break;
      }
      case 'equip': {
        const item = bot.inventory.items().find(i => i.name === parts[1]);
        if (!item) { out('EQUIP', { error: 'not in inventory: ' + parts[1] }); break; }
        await bot.equip(item, parts[2] || 'hand');
        out('EQUIP', { result: 'ok', held: bot.heldItem && bot.heldItem.name });
        break;
      }
      case 'drop': {
        const item = bot.inventory.items().find(i => i.name === parts[1]);
        if (!item) { out('DROP', { error: 'not in inventory: ' + parts[1] }); break; }
        await bot.toss(item.type, null, parseInt(parts[2] || String(item.count), 10));
        out('DROP', { result: 'ok', inventory: stateObj().inventory });
        break;
      }
      case 'eat': {
        const foods = bot.inventory.items().filter(i => bot.registry.foodsByName[i.name]);
        if (!foods.length) { out('EAT', { error: 'no food in inventory' }); break; }
        await bot.equip(foods[0], 'hand');
        await bot.consume();
        out('EAT', { result: 'ok', food: bot.food });
        break;
      }
      case 'attack': {
        const name = parts[1];
        const target = Object.values(bot.entities)
          .filter(e => e !== bot.entity && e.position && (e.name === name || (e.username || '') === name))
          .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))[0];
        if (!target) { out('ATTACK', { error: 'no ' + name + ' nearby' }); break; }
        bot.pvp.attack(target);
        const targetId = target.id;
        const deadline = Date.now() + 45000;
        while (Date.now() < deadline && bot.entities[targetId]) {
          await new Promise(r => setTimeout(r, 1000));
        }
        const killed = !bot.entities[targetId];
        bot.pvp.stop();
        out('ATTACK', { result: killed ? 'killed' : 'gave up', target: name, health: bot.health, inventory: stateObj().inventory, pos: stateObj().pos });
        break;
      }
      case 'hunt': {
        const name = parts[1];
        const weapon = bot.inventory.items().filter(i => i.name.endsWith('_sword') || i.name.endsWith('_axe'))
          .sort((a, b) => (b.attackDamage || 0) - (a.attackDamage || 0))[0];
        if (weapon) { try { await bot.equip(weapon, 'hand'); } catch {} }
        const findT = () => Object.values(bot.entities)
          .filter(e => e !== bot.entity && e.position && e.isValid !== false && (e.name === name || (e.username || '') === name))
          .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))[0];
        const t0 = Date.now();
        let swings = 0;
        while (Date.now() - t0 < 90000) {
          const e = findT();
          if (!e) break;
          const d = bot.entity.position.distanceTo(e.position);
          if (d > 3) {
            goto(e.position.x, e.position.y, e.position.z, 2);
            const chaseEnd = Date.now() + 10000;
            while (Date.now() < chaseEnd) {
              await new Promise(r => setTimeout(r, 500));
              const e2 = findT();
              if (!e2) break;
              if (bot.entity.position.distanceTo(e2.position) <= 3) break;
            }
            try { bot.pathfinder.stop(); } catch {}
            gotoWaiter = null;
          } else {
            try {
              await bot.lookAt(e.position.offset(0, (e.height || 1) * 0.7, 0), true);
              bot.attack(e);
              swings++;
            } catch {}
            await new Promise(r => setTimeout(r, 650));
          }
        }
        out('HUNT', { result: 'done', target: name, swings, ...stateObj() });
        break;
      }
      case 'step': {
        const tx = Number(parts[1]), tz = Number(parts[2]);
        const secs = Number(parts[3] || 15);
        const deadline = Date.now() + secs * 1000;
        let lastPos = bot.entity.position.clone();
        let stallSince = Date.now();
        bot.setControlState('forward', true);
        while (Date.now() < deadline) {
          const p = bot.entity.position;
          const dx = tx - p.x, dz = tz - p.z;
          if (Math.hypot(dx, dz) < 1.6) break;
          try { await bot.lookAt(new Vec3(tx, p.y + 1.62, tz), true); } catch {}
          if (p.distanceTo(lastPos) > 0.15) { lastPos = p.clone(); stallSince = Date.now(); bot.setControlState('jump', false); }
          else if (Date.now() - stallSince > 350) bot.setControlState('jump', true);
          await new Promise(r => setTimeout(r, 150));
        }
        bot.setControlState('forward', false);
        bot.setControlState('jump', false);
        out('STEP', { result: 'done', ...stateObj() });
        break;
      }
      case 'look': {
        const [x, y, z] = parts.slice(1).map(Number);
        await bot.lookAt(new Vec3(x, y, z));
        out('OK', 'looking');
        break;
      }
      case 'sleep': {
        const bed = bot.findBlock({ matching: b => b.name.endsWith('_bed'), maxDistance: 32 });
        if (!bed) { out('SLEEP', { error: 'no bed nearby' }); break; }
        await goto(bed.position.x, bed.position.y, bed.position.z, 2);
        await bot.sleep(bed);
        out('SLEEP', { result: 'sleeping' });
        break;
      }
      case 'wake':
        await bot.wake();
        out('OK', 'awake');
        break;
      case 'quit':
        out('OK', 'bye');
        bot.quit();
        process.exit(0);
        break;
      case '':
        break;
      default:
        out('ERROR', 'unknown command: ' + cmd);
    }
  } catch (err) {
    out('ERROR', cmd + ': ' + String(err && err.message || err));
  }
}

// Sequential command queue: one stdin write can carry a whole script and it
// executes in order without operator latency between steps. 'stop', 'state'
// and 'think' bypass the queue so emergencies and probes stay instant.
let cmdChain = Promise.resolve();
const BYPASS = new Set(['stop', 'state', 'think']);
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const cmd = (line.trim().split(/\s+/)[0] || '').toLowerCase();
  if (BYPASS.has(cmd)) { handle(line); return; }
  cmdChain = cmdChain.then(() => handle(line)).catch(() => {});
});
