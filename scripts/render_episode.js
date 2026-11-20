#!/usr/bin/env node
// Deterministic project renderer: npm install --no-save sharp @xmldom/xmldom
// FFMPEG may point to any ffmpeg build with libx264 and AAC support.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const sharp = require('sharp');

const rootDir = path.resolve(__dirname, '..');
const projectPath = path.join(rootDir, 'projects/episode-01.json');
const project = JSON.parse(fs.readFileSync(projectPath, 'utf8'));
const outPath = path.resolve(process.argv[2] || path.join(rootDir, 'renders/episode-01.mp4'));
const tempVideo = `${outPath}.silent.mp4`;
const width = 720, height = 1280, fps = Number(project.fps) || 24;
const duration = Number(project.duration);
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const parser = new DOMParser({ onError: (level, message) => { if (level === 'error' || level === 'fatalError') throw new Error(message); } });
const serializer = new XMLSerializer();
function parseSvg(text) { return parser.parseFromString(text, 'image/svg+xml'); }
function findId(node, id) {
  if (node.nodeType === 1 && node.getAttribute('id') === id) return node;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    const found = findId(child, id); if (found) return found;
  }
  return null;
}
function readSvg(file) { return parseSvg(fs.readFileSync(path.join(rootDir, file), 'utf8')); }
const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const match = html.match(/(<svg\s+id="stage"[\s\S]*?<\/svg>)/i);
if (!match) throw new Error('Could not find the authored SVG stage in index.html');
const stageTemplate = parseSvg(match[1]);
const locations = new Map();
const locationFiles = { entrance: 'apartment-entrance.svg', stairs: 'stairwell.svg', impact: 'landing-impact.svg', reveal: 'overhead-reveal.svg' };
for (const [key, file] of Object.entries(locationFiles)) locations.set(key, readSvg(`assets/locations/${file}`));
const rigDoc = readSvg('assets/rigs/courier.svg');
const rigTemplate = findId(rigDoc, 'courier-rig');
if (!rigTemplate) throw new Error('courier-rig not found');
const stageDoc = stageTemplate;
const stage = stageDoc.documentElement;
const env = findId(stageDoc, 'environment');
const camera = findId(stageDoc, 'camera-rig');
const puppet = findId(stageDoc, 'puppet-position');
const shadow = findId(stageDoc, 'character-shadow');
const endBlack = findId(stageDoc, 'end-black');
const grain = findId(stageDoc, 'grain-overlay');
const guides = findId(stageDoc, 'safe-guides');
if (grain?.parentNode) grain.parentNode.removeChild(grain); // Keep SVG rendering portable and crisp.
if (guides?.parentNode) guides.parentNode.removeChild(guides);
puppet.appendChild(rigTemplate.cloneNode(true));
const rig = findId(puppet, 'courier-rig');
rig.setAttribute('stroke-width', String(project.style?.outline || 4));
const keys = [...project.keyframes].sort((a,b) => a.t - b.t);
const ease = t => t * t * (3 - 2 * t);
const clamp = (x,a,b) => Math.max(a, Math.min(b,x));
function evaluate(t) {
  let left = keys[0], right = keys[keys.length - 1];
  for (const key of keys) { if (key.t <= t) left = key; if (key.t >= t) { right = key; break; } }
  if (left === right) return { ...left, motionStart: left.t };
  const u = clamp((t-left.t) / Math.max(.0001,right.t-left.t),0,1);
  const pose = { motion: left.motion, motionStart: left.t };
  for (const field of ['x','y','scale','rotation','cx','cy','zoom']) pose[field] = left[field] + (right[field]-left[field])*u;
  return pose;
}
function shotAt(t) { return project.shots.findIndex((s,i) => t >= s.start && (t < s.end || i === project.shots.length-1)); }
function replaceEnvironment(location) {
  while (env.firstChild) env.removeChild(env.firstChild);
  const source = findId(locations.get(location) || locations.get('entrance'), 'environment');
  for (let child=source.firstChild; child; child=child.nextSibling) env.appendChild(child.cloneNode(true));
}
function setRigMotion(pose, time) {
  const localTime = Math.max(0,time-pose.motionStart)*(Number(project.motionSpeed)||1);
  const walk = pose.motion === 'walk' ? Math.sin(localTime*Math.PI*2*1.6) : 0;
  const bob = pose.motion === 'walk' ? Math.abs(Math.sin(localTime*Math.PI*2*1.6))*4 : Math.sin(localTime*2.4)*1.2;
  const gesture = pose.motion === 'gesture' ? ease(clamp(localTime/.65,0,1)) : 0;
  const press = pose.motion === 'press' ? Math.sin(clamp(localTime/1.2,0,1)*Math.PI) : 0;
  const turn = pose.motion === 'turn' ? ease(clamp(localTime/.7,0,1)) : 0;
  findId(rig,'torso').setAttribute('transform',`translate(0 ${-305+bob}) rotate(${pose.motion==='walk'?walk*1.2:0})`);
  findId(rig,'head').setAttribute('transform',`rotate(${turn*-27+(pose.motion==='walk'?Math.sin(localTime*1.7)*2:0)} 0 -354)`);
  findId(rig,'arm-front').setAttribute('transform',`translate(51 ${-282+bob}) rotate(${-10-walk*17-gesture*48-press*45})`);
  findId(rig,'arm-back').setAttribute('transform',`translate(-51 ${-281+bob}) rotate(${8+walk*17})`);
  findId(rig,'leg-front').setAttribute('transform',`translate(20 ${-202+bob}) rotate(${walk*23})`);
  findId(rig,'leg-back').setAttribute('transform',`translate(-25 ${-202+bob}) rotate(${-walk*22})`);
  findId(rig,'knee-front').setAttribute('transform',`translate(0 88) rotate(${Math.max(0,-walk)*16})`);
  findId(rig,'knee-back').setAttribute('transform',`translate(0 88) rotate(${Math.max(0,walk)*15})`);
  findId(rig,'delivery-bag').setAttribute('transform',`translate(28 ${-314+bob*1.7}) rotate(${pose.motion==='walk'?walk*2.5:0})`);
}
function renderSvg(time) {
  const index = shotAt(time), shot = project.shots[index];
  if (index < 0 || !shot) throw new Error(`No shot at ${time}`);
  replaceEnvironment(shot.location);
  const pose = evaluate(time);
  camera.setAttribute('transform',`translate(${180+pose.cx} ${320+pose.cy}) scale(${pose.zoom}) translate(-180 -320)`);
  puppet.setAttribute('transform',`translate(${pose.x.toFixed(2)} ${pose.y.toFixed(2)}) rotate(${pose.rotation.toFixed(2)}) scale(${pose.scale.toFixed(3)})`);
  shadow.setAttribute('cx',pose.x); shadow.setAttribute('cy',pose.y-1); shadow.setAttribute('rx',61*pose.scale);
  puppet.setAttribute('opacity',shot.showCourier === false ? '0' : '1');
  shadow.setAttribute('opacity',shot.showCourier === false ? '0' : '.5');
  const pov = findId(env,'pov-hand');
  if (pov) {
    const local=time-shot.start;
    const rise=shot.showPovHand ? (local<1.5?18*(1-ease(clamp(local/1.5,0,1))):local<2.1?-2:0) : 24;
    pov.setAttribute('opacity',shot.showPovHand?'1':'0');
    pov.setAttribute('transform',`translate(0 ${rise})`);
  }
  const door=findId(env,'doorwing');
  if (door) { const local=time-shot.start; const open=shot.id==='S01'?46*ease(clamp((local-6.4)/2.8,0,1)):0; door.setAttribute('transform',`rotate(${-open} 32 203)`); }
  endBlack.setAttribute('opacity',shot.id==='S07'?String(ease(clamp((time-79.25)/.75,0,1))):'0');
  return serializer.serializeToString(stageDoc);
}

async function renderVideo() {
  const args=['-hide_banner','-loglevel','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s',`${width}x${height}`,'-r',String(fps),'-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',tempVideo];
  const proc=spawn(ffmpeg,args,{stdio:['pipe','ignore','inherit']});
  proc.on('error',err=>{throw err;});
  for(let frame=0;frame<Math.round(duration*fps);frame++) {
    const time=frame/fps;
    const svg=renderSvg(time);
    const pixels=await sharp(Buffer.from(svg)).resize(width,height,{fit:'fill'}).removeAlpha().raw().toBuffer();
    if(!proc.stdin.write(pixels)) await new Promise(resolve=>proc.stdin.once('drain',resolve));
    if((frame+1)%120===0 || frame===0) console.log(`Rendered ${frame+1}/${Math.round(duration*fps)} frames (${(time).toFixed(1)}s)`);
  }
  proc.stdin.end();
  const code=await new Promise((resolve,reject)=>{proc.on('close',resolve);proc.on('error',reject);});
  if(code!==0) throw new Error(`ffmpeg video render failed with ${code}`);
}

function muxAudio() {
  const cues=project.audioCues||[];
  const args=['-hide_banner','-loglevel','error','-y','-i',tempVideo];
  for(const cue of cues) args.push('-i',path.join(rootDir,cue.file));
  const lavfi=[
    `sine=frequency=48:sample_rate=48000:duration=${duration}`,
    'sine=frequency=196:sample_rate=48000:duration=0.12',
    'anoisesrc=color=brown:sample_rate=48000:duration=0.7',
    'anoisesrc=color=pink:sample_rate=48000:duration=1.4'
  ];
  for(const source of lavfi) args.push('-f','lavfi','-i',source);
  const filters=[];
  filters.push(`[${1+cues.length}:a]volume=0.035[room]`);
  cues.forEach((cue,i)=>{
    const delay=Math.round((Number(project.shots[cue.shot].start)+(Number(cue.offset)||0))*1000);
    filters.push(`[${1+i}:a]adelay=${delay}|${delay},volume=1.0[vo${i}]`);
  });
  const base=1+cues.length;
  filters.push(`[${base+1}:a]volume=0.10,afade=t=out:st=0.04:d=0.08,adelay=1600|1600[button]`);
  filters.push(`[${base+2}:a]lowpass=f=180,volume=0.65,afade=t=in:d=0.01,afade=t=out:st=0.15:d=0.55,adelay=54000|54000[impact]`);
  filters.push(`[${base+3}:a]highpass=f=350,lowpass=f=1800,volume=0.06,afade=t=in:d=0.05,afade=t=out:st=0.7:d=0.7,adelay=6200|6200[door]`);
  const labels=['room',...cues.map((_,i)=>`vo${i}`),'button','impact','door'];
  filters.push(`${labels.map(x=>`[${x}]`).join('')}amix=inputs=${labels.length}:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95[aout]`);
  args.push('-filter_complex',filters.join(';'),'-map','0:v:0','-map','[aout]','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-t',String(duration),'-movflags','+faststart',outPath);
  const result=spawnSync(ffmpeg,args,{stdio:'inherit'});
  if(result.error) throw result.error;
  if(result.status!==0) throw new Error(`ffmpeg audio mux failed with ${result.status}`);
  fs.unlinkSync(tempVideo);
}

(async()=>{
  try {
    console.log(`Rendering ${project.title}: ${duration}s at ${fps} fps to ${outPath}`);
    await renderVideo();
    muxAudio();
    const size=(fs.statSync(outPath).size/1024/1024).toFixed(1);
    console.log(`Done: ${outPath} (${size} MB)`);
  } catch(error) {
    try { fs.unlinkSync(tempVideo); } catch(_) {}
    console.error(error); process.exitCode=1;
  }
})();
