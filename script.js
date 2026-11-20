(() => {
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const stage = $('#stage');
  const puppetSlot = $('#puppet-position');
  const audio = $('#audio-preview');
  const fpsSelect = $('#fps');
  const presetNames = { idle: 'Покой', walk: 'Шаговый цикл', turn: 'Поворот головы', gesture: 'Жест рукой', press: 'Нажатие' };
  const defaultKeys = [
    { t: 0, x: 220, y: 520, scale: .78, rotation: 0, cx: 0, cy: 0, zoom: 1, motion: 'press' },
    { t: 3, x: 220, y: 520, scale: .78, rotation: 0, cx: 0, cy: 0, zoom: 1, motion: 'press' },
    { t: 7, x: 220, y: 520, scale: .78, rotation: 0, cx: 0, cy: 0, zoom: 1, motion: 'press' },
    { t: 10, x: 220, y: 515, scale: .76, rotation: 0, cx: 0, cy: 0, zoom: 1, motion: 'walk' },
    { t: 15, x: 246, y: 482, scale: .74, rotation: -1, cx: 0, cy: 0, zoom: 1, motion: 'walk' },
    { t: 20, x: 257, y: 446, scale: .72, rotation: 0, cx: 0, cy: 0, zoom: 1, motion: 'turn' },
    { t: 25, x: 257, y: 446, scale: .72, rotation: 0, cx: 0, cy: 0, zoom: 1, motion: 'turn' },
    { t: 30, x: 255, y: 446, scale: .92, rotation: 0, cx: -230, cy: 170, zoom: 1.8, motion: 'idle' },
    { t: 36, x: 255, y: 446, scale: .92, rotation: 0, cx: -245, cy: 170, zoom: 2, motion: 'idle' },
    { t: 42, x: 255, y: 440, scale: .72, rotation: 0, cx: 0, cy: 0, zoom: 1, motion: 'gesture' },
    { t: 48, x: 255, y: 440, scale: .72, rotation: 0, cx: -8, cy: 36, zoom: 1.08, motion: 'gesture' },
    { t: 54, x: 255, y: 440, scale: .72, rotation: 0, cx: 0, cy: 0, zoom: 1, motion: 'idle' },
    { t: 68, x: 255, y: 440, scale: .72, rotation: 0, cx: 0, cy: 0, zoom: 1, motion: 'idle' },
    { t: 79, x: 255, y: 440, scale: .72, rotation: 0, cx: 8, cy: 4, zoom: 1.1, motion: 'idle' },
    { t: 80, x: 255, y: 440, scale: .72, rotation: 0, cx: 8, cy: 4, zoom: 1.1, motion: 'idle' }
  ];
  let project = {
    version: '1.0', series: 'CUTOUT CINEMA / Курьерские истории', title: 'ДРУЖБЫ, 18, КВ. 14', episode: 1,
    duration: 80, fps: 24, motionSpeed: 1, location: 'entrance', camera: { cx: 0, cy: 0, zoom: 1 },
    style: { outline: 4, grain: 13, accent: '#f1d21a' }, keyframes: structuredClone(defaultKeys), shots: [], audioCues: [], audioName: ''
  };
  let currentTime = 0;
  let playing = false;
  let lastTick = 0;
  let raf = 0;
  let audioURL = '';
  let audioMuted = false;
  let exportRun = null;
  let toastTimer = 0;
  let audioDuration = 0;
  let locationLoadId = 0;
  let locationCache = new Map();
  let displayedLocation = '';
  let activeShotIndex = -1;
  let voicePlayers = [];
  let activeVoiceIndex = -1;
  let audioContext = null;
  let mediaAudioBus = null;
  let mediaAudioDestination = null;
  let soundscape = null;
  let sceneIndexAtPlayback = -1;
  let restoredProject = false;

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const ease = t => t * t * (3 - 2 * t);

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('visible'), 2400);
  }

  async function loadRig() {
    try {
      const response = await fetch('assets/rigs/courier.svg');
      if (!response.ok) throw new Error('rig not found');
      const text = await response.text();
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const rig = doc.querySelector('#courier-rig');
      if (!rig) throw new Error('courier group missing');
      puppetSlot.replaceChildren(document.importNode(rig, true));
      updateStyle();
      renderAt(currentTime);
    } catch (error) {
      toast('Не удалось загрузить courier.svg — запусти через локальный сервер.');
      console.error(error);
    }
  }

  function orderedKeys() { return [...project.keyframes].sort((a, b) => a.t - b.t); }

  function evaluate(time) {
    const keys = orderedKeys();
    if (!keys.length) return { ...defaultKeys[0], motionStart: 0 };
    let left = keys[0], right = keys[keys.length - 1];
    for (let i = 0; i < keys.length; i++) {
      if (keys[i].t <= time) left = keys[i];
      if (keys[i].t >= time) { right = keys[i]; break; }
    }
    if (left === right) return { ...left, motionStart: left.t };
    const span = Math.max(.0001, right.t - left.t);
    const u = clamp((time - left.t) / span, 0, 1);
    return {
      t: time,
      x: left.x + (right.x - left.x) * u,
      y: left.y + (right.y - left.y) * u,
      scale: left.scale + (right.scale - left.scale) * u,
      rotation: left.rotation + (right.rotation - left.rotation) * u,
      cx: left.cx + (right.cx - left.cx) * u,
      cy: left.cy + (right.cy - left.cy) * u,
      zoom: left.zoom + (right.zoom - left.zoom) * u,
      motion: left.motion,
      motionStart: left.t
    };
  }

  function upsertKey(time, changes = {}) {
    const pose = { ...evaluate(time), ...changes, t: Math.round(time * 100) / 100 };
    delete pose.motionStart;
    let index = project.keyframes.findIndex(key => Math.abs(key.t - time) < .045);
    if (index < 0) project.keyframes.push(pose);
    else project.keyframes[index] = { ...project.keyframes[index], ...pose };
    project.keyframes.sort((a, b) => a.t - b.t);
    markDirty();
    drawTimeline();
  }

  function setPosition(x, y, scale, rotation) {
    const g = $('#puppet-position');
    if (!g) return;
    g.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${rotation.toFixed(2)}) scale(${scale.toFixed(3)})`);
    const shadow = $('#character-shadow');
    shadow.setAttribute('cx', x);
    shadow.setAttribute('cy', y - 1);
    shadow.setAttribute('rx', 61 * scale);
  }

  function setRigMotion(pose, t) {
    const root = $('#courier-rig');
    if (!root) return;
    const localTime = Math.max(0, t - pose.motionStart) * (Number(project.motionSpeed) || 1);
    const walk = pose.motion === 'walk' ? Math.sin(localTime * Math.PI * 2 * 1.6) : 0;
    const bob = pose.motion === 'walk' ? Math.abs(Math.sin(localTime * Math.PI * 2 * 1.6)) * 4 : Math.sin(localTime * 2.4) * 1.2;
    const gesture = pose.motion === 'gesture' ? ease(clamp(localTime / .65, 0, 1)) : 0;
    const press = pose.motion === 'press' ? Math.sin(clamp(localTime / 1.2, 0, 1) * Math.PI) : 0;
    const turn = pose.motion === 'turn' ? ease(clamp(localTime / .7, 0, 1)) : 0;
    $('#torso').setAttribute('transform', `translate(0 ${-305 + bob}) rotate(${pose.motion === 'walk' ? walk * 1.2 : 0})`);
    $('#head').setAttribute('transform', `rotate(${turn * -27 + (pose.motion === 'walk' ? Math.sin(localTime * 1.7) * 2 : 0)} 0 -354)`);
    $('#arm-front').setAttribute('transform', `translate(51 ${-282 + bob}) rotate(${-10 - walk * 17 - gesture * 48 - press * 45})`);
    $('#arm-back').setAttribute('transform', `translate(-51 ${-281 + bob}) rotate(${8 + walk * 17})`);
    $('#leg-front').setAttribute('transform', `translate(20 ${-202 + bob}) rotate(${walk * 23})`);
    $('#leg-back').setAttribute('transform', `translate(-25 ${-202 + bob}) rotate(${-walk * 22})`);
    $('#knee-front').setAttribute('transform', `translate(0 88) rotate(${Math.max(0, -walk) * 16})`);
    $('#knee-back').setAttribute('transform', `translate(0 88) rotate(${Math.max(0, walk) * 15})`);
    $('#delivery-bag').setAttribute('transform', `translate(28 ${-314 + bob * 1.7}) rotate(${pose.motion === 'walk' ? walk * 2.5 : 0})`);
  }

  const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(Math.floor(value % 60)).padStart(2, '0')}`;
  const shotAt = time => project.shots?.findIndex((shot, index) => time >= shot.start && (time < shot.end || index === project.shots.length - 1)) ?? -1;

  async function fetchLocation(location) {
    if (locationCache.has(location)) return locationCache.get(location);
    const file = ({ entrance: 'apartment-entrance', stairs: 'stairwell', impact: 'landing-impact', reveal: 'overhead-reveal' })[location] || 'apartment-entrance';
    const response = await fetch(`assets/locations/${file}.svg`);
    if (!response.ok) throw new Error(`Missing location: ${file}`);
    const parsed = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    const root = parsed.querySelector('#environment');
    if (!root) throw new Error(`Missing environment group: ${file}`);
    locationCache.set(location, root);
    return root;
  }

  function syncShotLayers() {
    const shot = project.shots?.[activeShotIndex];
    if (!shot) return;
    const pov = $('#pov-hand');
    if (pov) {
      const local = currentTime - shot.start;
      const rise = shot.showPovHand ? (local < 1.5 ? 18 * (1 - ease(clamp(local / 1.5, 0, 1))) : local < 2.1 ? -2 : 0) : 24;
      pov.setAttribute('opacity', shot.showPovHand ? '1' : '0');
      pov.setAttribute('transform', `translate(0 ${rise})`);
    }
    const door = $('#doorwing');
    if (door) {
      const local = currentTime - shot.start;
      const open = shot.id === 'S01' ? 46 * ease(clamp((local - 6.4) / 2.8, 0, 1)) : 0;
      door.setAttribute('transform', `rotate(${-open} 32 203)`);
    }
    $('#puppet-position').style.opacity = shot.showCourier === false ? '0' : '1';
    $('#character-shadow').style.opacity = shot.showCourier === false ? '0' : '.5';
    $('#end-black').setAttribute('opacity', shot.id === 'S07' ? String(ease(clamp((currentTime - 79.25) / .75, 0, 1))) : '0');
  }

  function updateEpisodeUI(index) {
    const shot = project.shots?.[index];
    if (!shot) return;
    $('#scene-title').textContent = `SHOT ${shot.id.slice(1)} — ${shot.title.toUpperCase()}`;
    $('#episode-shot-id').textContent = `${shot.id.slice(1)} / ${String(project.shots.length).padStart(2, '0')}`;
    $('#episode-shot-title').textContent = shot.title;
    $('#episode-shot-range').textContent = `${clock(shot.start)}—${clock(shot.end)}`;
    $('#episode-shot-description').textContent = shot.description;
    $$('.episode-shot-button').forEach(button => button.classList.toggle('active', Number(button.dataset.shotIndex) === index));
  }

  function changeShot(index, time) {
    if (index < 0 || !project.shots?.[index]) return;
    activeShotIndex = index;
    const shot = project.shots[index];
    updateEpisodeUI(index);
    if (displayedLocation !== shot.location && pendingLocation !== shot.location) applyLocation(shot.location);
    syncShotLayers();
    if (playing) {
      startVoiceForShot(index, Math.max(0, time - shot.start));
      if (soundscape) soundscape.enter(index, time);
    }
  }

  let pendingLocation = '';
  function applyLocation(location) {
    if (displayedLocation === location || pendingLocation === location) return;
    if (locationCache.has(location)) {
      const root = locationCache.get(location);
      $('#environment').replaceChildren(...[...root.childNodes].map(node => document.importNode(node, true)));
      displayedLocation = location; pendingLocation = ''; syncShotLayers(); return;
    }
    const requestId = ++locationLoadId;
    pendingLocation = location;
    fetchLocation(location).then(root => {
      if (requestId !== locationLoadId) return;
      const environment = $('#environment');
      environment.replaceChildren(...[...root.childNodes].map(node => document.importNode(node, true)));
      displayedLocation = location; pendingLocation = '';
      syncShotLayers();
    }).catch(error => { pendingLocation = ''; console.error(error); toast(`Нет SVG локации: ${location}`); });
  }

  function renderAt(time) {
    currentTime = clamp(time, 0, project.duration);
    const shotIndex = shotAt(currentTime);
    if (shotIndex >= 0 && shotIndex !== activeShotIndex) changeShot(shotIndex, currentTime);
    else if (activeShotIndex >= 0) syncShotLayers();
    const pose = evaluate(currentTime);
    setPosition(pose.x, pose.y, pose.scale, pose.rotation);
    $('#camera-rig').setAttribute('transform', `translate(${180 + pose.cx} ${320 + pose.cy}) scale(${pose.zoom}) translate(-180 -320)`);
    setRigMotion(pose, currentTime);
    setInputs(pose);
    updateReadouts();
    movePlayhead();
  }

  function setInputs(pose) {
    const values = {
      'prop-x': Math.round(pose.x), 'prop-y': Math.round(pose.y), 'prop-scale': Math.round(pose.scale * 100), 'prop-rotation': Math.round(pose.rotation),
      'camera-x': Math.round(pose.cx), 'camera-y': Math.round(pose.cy), 'camera-zoom': Math.round(pose.zoom * 100)
    };
    for (const [id, value] of Object.entries(values)) { const input = $(`#${id}`); if (input) input.value = value; }
    $('#motion-select').value = pose.motion || 'idle';
    $('#out-x').value = String(values['prop-x']); $('#out-y').value = String(values['prop-y']);
    $('#out-scale').value = `${values['prop-scale']}%`; $('#out-rotation').value = `${values['prop-rotation']}°`;
    $('#out-camera-x').value = String(values['camera-x']); $('#out-camera-y').value = String(values['camera-y']); $('#out-camera-zoom').value = `${values['camera-zoom']}%`;
    $$('.motion-item').forEach(button => button.classList.toggle('active', button.dataset.motion === pose.motion));
  }

  function updateReadouts() {
    const fps = Number(project.fps || 24);
    const frame = Math.floor(currentTime * fps);
    const seconds = Math.floor(currentTime);
    const frames = frame % fps;
    $('#timecode').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
    $('#frame-readout').textContent = `КАДР ${String(frame).padStart(3, '0')} / ${String(Math.round(project.duration * fps)).padStart(3, '0')}`;
  }

  function movePlayhead() {
    const percent = project.duration ? currentTime / project.duration * 100 : 0;
    $('#playhead').style.left = `${percent}%`;
  }

  function drawTimeline() {
    const scroller = $('#timeline-scroller');
    const width = Math.max(scroller.clientWidth, project.duration * 32);
    const inner = $('#timeline-inner');
    inner.style.width = `${width}px`;
    inner.style.setProperty('--scale', `${width / project.duration}px`);
    const ruler = $('#ruler-row');
    ruler.replaceChildren();
    const increment = project.duration <= 30 ? 5 : project.duration <= 80 ? 10 : 20;
    for (let time = 0; time <= project.duration; time += increment) {
      const mark = document.createElement('span');
      mark.className = 'ruler-mark'; mark.style.left = `${time / project.duration * 100}%`; mark.textContent = `${String(Math.floor(time / 60)).padStart(2, '0')}:${String(time % 60).padStart(2, '0')}`;
      ruler.append(mark);
    }
    for (const laneId of ['camera-lane', 'courier-lane', 'pose-lane']) $(`#${laneId}`).querySelectorAll('.key-dot,.motion-chip').forEach(el => el.remove());
    $('#cut-lane').querySelectorAll('.cut-segment').forEach(el => el.remove());
    for (const shot of project.shots || []) {
      const segment = document.createElement('button'); segment.type = 'button'; segment.className = 'cut-segment';
      segment.style.left = `${shot.start / project.duration * 100}%`;
      segment.style.width = `${(shot.end - shot.start) / project.duration * 100}%`;
      segment.dataset.shotIndex = project.shots.indexOf(shot); segment.textContent = `${shot.id} · ${shot.title}`;
      segment.setAttribute('aria-label', `${shot.id}: ${shot.title}, ${clock(shot.start)}–${clock(shot.end)}`);
      segment.addEventListener('click', event => { event.stopPropagation(); seek(shot.start); });
      $('#cut-lane').append(segment);
    }
    for (const key of orderedKeys()) {
      const pct = `${key.t / project.duration * 100}%`;
      const rigMark = document.createElement('button');
      rigMark.type = 'button'; rigMark.className = 'key-dot'; rigMark.style.left = pct; rigMark.title = `Курьер · ${key.t.toFixed(2)} сек`; rigMark.setAttribute('aria-label', `Ключ курьера на ${key.t.toFixed(2)} секунд`);
      rigMark.addEventListener('click', event => { event.stopPropagation(); seek(key.t); });
      $('#courier-lane').append(rigMark);
      const camMark = document.createElement('button');
      camMark.type = 'button'; camMark.className = 'key-dot camera-key'; camMark.style.left = pct; camMark.title = `Камера · ${key.t.toFixed(2)} сек`; camMark.setAttribute('aria-label', `Ключ камеры на ${key.t.toFixed(2)} секунд`);
      camMark.addEventListener('click', event => { event.stopPropagation(); seek(key.t); });
      $('#camera-lane').append(camMark);
    }
    const keys = orderedKeys();
    for (let i = 0; i < keys.length; i++) {
      if (i === keys.length - 1 || keys[i].motion === keys[i + 1].motion) continue;
      const chip = document.createElement('span'); chip.className = 'motion-chip'; chip.textContent = presetNames[keys[i].motion] || 'Поза';
      chip.style.left = `${keys[i].t / project.duration * 100}%`; chip.style.width = `${Math.max(2, ((keys[i + 1]?.t ?? project.duration) - keys[i].t) / project.duration * 100)}%`;
      $('#pose-lane').append(chip);
    }
    const audioLane = $('#audio-lane');
    audioLane.querySelectorAll('.voice-cue').forEach(el => el.remove());
    for (const cue of project.audioCues || []) {
      const shot = project.shots?.[cue.shot]; if (!shot) continue;
      const marker = document.createElement('button'); marker.type = 'button'; marker.className = 'voice-cue';
      marker.style.left = `${shot.start / project.duration * 100}%`;
      marker.style.width = `${Math.max(2, (shot.end - shot.start) * .78 / project.duration * 100)}%`;
      marker.textContent = `VO · ${shot.id}`; marker.title = shot.voice || `Закадровый голос · ${shot.title}`;
      marker.addEventListener('click', event => { event.stopPropagation(); seek(shot.start); });
      audioLane.append(marker);
    }
    const hasAudio = Boolean(project.audioName || project.audioCues?.length);
    audioLane.classList.toggle('has-audio', hasAudio);
    $('#audio-name').textContent = project.audioName ? project.audioName.toUpperCase() : project.audioCues?.length ? `VO · ${project.audioCues.length} ФРАГМЕНТОВ` : 'ОЗВУЧКА НЕ ДОБАВЛЕНА';
    $('#audio-wave').style.width = project.audioName && audioDuration ? `${Math.min(100, audioDuration / project.duration * 100)}%` : '100%';
  }

  function drawEpisodeShots() {
    const list = $('#episode-shot-list');
    list.replaceChildren();
    for (const [index, shot] of (project.shots || []).entries()) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'episode-shot-button'; button.dataset.shotIndex = String(index);
      button.innerHTML = `<span>${shot.id}</span><strong>${shot.title}</strong><small>${clock(shot.start)}—${clock(shot.end)}</small>`;
      button.addEventListener('click', () => seek(shot.start));
      list.append(button);
    }
  }

  function createSoundscape(context, bus) {
    const scheduled = new Set();
    let ambientNoise = null, ambientTone = null, ambientGain = null;
    const noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const channel = noiseBuffer.getChannelData(0); let seed = 1979;
    for (let i = 0; i < channel.length; i++) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; channel[i] = (seed / 2147483648) * .5; }
    function keep(node) { scheduled.add(node); node.onended = () => scheduled.delete(node); return node; }
    function noise(at, length, gainValue, cutoff, type = 'lowpass') {
      const source = keep(context.createBufferSource()); source.buffer = noiseBuffer;
      const filter = context.createBiquadFilter(); filter.type = type; filter.frequency.value = cutoff;
      const gain = context.createGain(); gain.gain.setValueAtTime(0, at); gain.gain.linearRampToValueAtTime(gainValue, at + .012); gain.gain.exponentialRampToValueAtTime(.0001, at + length);
      source.connect(filter).connect(gain).connect(bus); source.start(at); source.stop(at + length + .03);
    }
    function tone(at, length, startHz, endHz, gainValue, wave = 'sine') {
      const osc = keep(context.createOscillator()); const gain = context.createGain(); osc.type = wave;
      osc.frequency.setValueAtTime(startHz, at); osc.frequency.exponentialRampToValueAtTime(Math.max(1, endHz), at + length);
      gain.gain.setValueAtTime(.0001, at); gain.gain.exponentialRampToValueAtTime(gainValue, at + .008); gain.gain.exponentialRampToValueAtTime(.0001, at + length);
      osc.connect(gain).connect(bus); osc.start(at); osc.stop(at + length + .02);
    }
    function ambient(on) {
      const now = context.currentTime;
      if (on) {
        if (!ambientGain) {
          ambientGain = context.createGain(); ambientGain.gain.value = .0001; ambientGain.connect(bus);
          const src = context.createBufferSource(); src.buffer = noiseBuffer; src.loop = true;
          const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 420;
          src.connect(filter).connect(ambientGain); src.start(); ambientNoise = src;
          const osc = context.createOscillator(); osc.type = 'sine'; osc.frequency.value = 49;
          const toneGain = context.createGain(); toneGain.gain.value = .012; osc.connect(toneGain).connect(ambientGain); osc.start(); ambientTone = osc;
        }
        ambientGain.gain.cancelScheduledValues(now); ambientGain.gain.setTargetAtTime(.18, now, .8);
      } else if (ambientGain) {
        ambientGain.gain.cancelScheduledValues(now); ambientGain.gain.setTargetAtTime(.0001, now, .12);
      }
    }
    function cancelTransient() {
      for (const source of [...scheduled]) { try { source.stop(); } catch (_) {} }
      scheduled.clear();
    }
    function enter(index, time) {
      cancelTransient();
      const shot = project.shots?.[index];
      if (!shot || index >= 5) { ambient(false); }
      else ambient(true);
      const now = context.currentTime;
      if (index === 0) {
        const local = time - shot.start;
        if (local < 2) { const at = now + Math.max(.05, 1.1 - local); noise(at, .045, .12, 2500, 'highpass'); tone(at, .055, 1180, 620, .045, 'triangle'); }
        if (local < 9) { const at = now + Math.max(.1, 7.1 - local); tone(at, .95, 190, 94, .07, 'triangle'); noise(at, .8, .035, 620, 'lowpass'); }
      }
      if (index === 1 || index === 4) {
        const local = time - shot.start; const end = shot.end - shot.start;
        for (let t = Math.max(.2, Math.ceil(local / .82) * .82); t < end; t += .82) {
          const at = now + Math.max(.05, t - local); tone(at, .14, 83, 48, .07, 'sine'); noise(at, .11, .025, 500, 'lowpass');
        }
      }
      if (index === 2 || index === 3) noise(now + .25, .22, .035, 1450, 'bandpass');
      if (index === 5) { tone(now + .08, .62, 88, 29, .2, 'sine'); noise(now + .08, .48, .15, 240, 'lowpass'); }
    }
    function pause() { ambient(false); cancelTransient(); }
    return { enter, pause };
  }

  function configureVoiceCues() {
    for (const player of voicePlayers) { player.pause(); player.removeAttribute('src'); player.load(); }
    voicePlayers = (project.audioCues || []).map(cue => {
      const player = new Audio(cue.file);
      player.preload = 'auto'; player.dataset.shotIndex = String(cue.shot);
      if (audioContext && mediaAudioBus) {
        try { const source = audioContext.createMediaElementSource(player); source.connect(mediaAudioBus); } catch (_) {}
      }
      return player;
    });
    activeVoiceIndex = -1;
  }

  function ensureAudioGraph() {
    if (audioContext) return audioContext;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    try {
      audioContext = new Context();
      mediaAudioBus = audioContext.createGain(); mediaAudioBus.gain.value = 1;
      mediaAudioBus.connect(audioContext.destination);
      mediaAudioDestination = audioContext.createMediaStreamDestination(); mediaAudioBus.connect(mediaAudioDestination);
      const mediaElements = [audio, ...voicePlayers];
      for (const element of mediaElements) {
        try { audioContext.createMediaElementSource(element).connect(mediaAudioBus); } catch (_) {}
      }
      soundscape = createSoundscape(audioContext, mediaAudioBus);
      return audioContext;
    } catch (error) { console.warn('Audio mixer unavailable', error); return null; }
  }

  function startVoiceForShot(index, offset = 0) {
    voicePlayers.forEach(player => { if (Number(player.dataset.shotIndex) !== index || audioMuted) player.pause(); });
    const player = voicePlayers.find(item => Number(item.dataset.shotIndex) === index);
    activeVoiceIndex = index;
    if (!player || audioMuted) return;
    if (Number.isFinite(player.duration) && offset >= player.duration) { player.pause(); return; }
    try { player.currentTime = Math.max(0, offset); } catch (_) {}
    player.play().catch(() => {});
  }

  function pauseAllAudio() {
    audio.pause(); voicePlayers.forEach(player => player.pause());
    soundscape?.pause(); activeVoiceIndex = -1;
  }

  function seek(time) {
    currentTime = clamp(Number(time), 0, project.duration);
    renderAt(currentTime);
    if (audio.src && Number.isFinite(audio.duration) && currentTime < audio.duration) audio.currentTime = currentTime;
    if (playing && activeShotIndex >= 0) {
      const shot = project.shots?.[activeShotIndex];
      if (shot) startVoiceForShot(activeShotIndex, currentTime - shot.start);
    }
  }

  function markDirty() {
    $('#save-status').textContent = 'НЕ СОХРАНЕНО'; $('#save-status').classList.add('unsaved');
    try { localStorage.setItem('cutout-cinema-episode-project', JSON.stringify(project)); $('#save-status').textContent = 'АВТОСОХРАНЕНО'; $('#save-status').classList.remove('unsaved'); } catch (_) {}
  }

  function play() {
    if (playing) {
      playing = false; cancelAnimationFrame(raf); lastTick = 0;
      $('#play').textContent = '▶'; $('#play').setAttribute('aria-label', 'Воспроизвести');
      pauseAllAudio(); return;
    }
    if (currentTime >= project.duration) seek(0);
    playing = true; lastTick = 0;
    $('#play').textContent = 'Ⅱ'; $('#play').setAttribute('aria-label', 'Пауза');
    const context = ensureAudioGraph(); context?.resume();
    if (activeShotIndex >= 0) {
      startVoiceForShot(activeShotIndex, currentTime - project.shots[activeShotIndex].start);
      soundscape?.enter(activeShotIndex, currentTime);
    }
    if (audio.src && !audioMuted) { if (currentTime < audio.duration) audio.currentTime = currentTime; audio.play().catch(() => {}); }
    const tick = now => {
      if (!playing) return;
      if (lastTick) currentTime += (now - lastTick) / 1000;
      lastTick = now;
      if (currentTime >= project.duration) { currentTime = project.duration; playing = false; $('#play').textContent = '▶'; $('#play').setAttribute('aria-label', 'Воспроизвести'); lastTick = 0; }
      renderAt(currentTime);
      if (!playing) pauseAllAudio();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function setMotion(name) {
    const pose = evaluate(currentTime);
    upsertKey(currentTime, { ...pose, motion: name });
    renderAt(currentTime);
  }

  function changeProperty(name, value) {
    const pose = evaluate(currentTime);
    const numeric = Number(value);
    const change = name === 'scale' || name === 'zoom' ? numeric / 100 : numeric;
    upsertKey(currentTime, { ...pose, [name]: change });
    renderAt(currentTime);
  }

  function setDuration(value) {
    const duration = clamp(Number(value) || 30, 10, 120);
    project.duration = duration;
    project.keyframes = project.keyframes.filter(key => key.t <= duration);
    $('#duration').value = duration;
    currentTime = clamp(currentTime, 0, duration);
    drawTimeline(); renderAt(currentTime); markDirty();
  }

  function updateLocation(location) {
    project.location = location;
    const activeShot = project.shots?.[activeShotIndex];
    if (activeShot) activeShot.location = location;
    $('#location-entrance').classList.toggle('selected', location === 'entrance');
    $('#location-stairs').classList.toggle('selected', location === 'stairs');
    applyLocation(location); syncShotLayers(); markDirty(); drawTimeline();
  }

  function updateStyle() {
    const outline = Number($('#outline-width').value);
    const grain = Number($('#grain-amount').value);
    $('#out-outline').value = `${outline} px`; $('#out-grain').value = `${grain}%`;
    const rig = $('#courier-rig'); if (rig) rig.setAttribute('stroke-width', String(outline));
    $('#grain-overlay').setAttribute('opacity', String(grain / 100));
    const accent = project.style?.accent || '#f1d21a';
    document.documentElement.style.setProperty('--yellow', accent);
    const bagFront = $('#delivery-bag')?.querySelector('path'); if (bagFront) bagFront.setAttribute('fill', accent);
    project.style.outline = outline; project.style.grain = grain; markDirty();
  }

  function buildProjectJSON() {
    const clean = { ...project, keyframes: orderedKeys(), export: { width: 360, height: 640, aspectRatio: '9:16', renderer: 'SVG / Canvas' } };
    return JSON.stringify(clean, null, 2);
  }

  function download(name, data, type) {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  function saveProject() {
    download(`${project.title.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-') || 'cutout-project'}.json`, buildProjectJSON(), 'application/json');
    $('#save-status').textContent = 'СОХРАНЕНО'; $('#save-status').classList.remove('unsaved');
    toast('Проект сохранён в JSON.');
  }

  async function importProject(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.keyframes) || !data.keyframes.length) throw new Error('Missing keyframes');
      project = {
        ...project, ...data,
        duration: clamp(Number(data.duration) || 30, 10, 120),
        fps: [12, 24, 30].includes(Number(data.fps)) ? Number(data.fps) : 24,
        keyframes: data.keyframes.map(key => ({ ...defaultKeys[0], ...key, t: clamp(Number(key.t) || 0, 0, 120) })).sort((a, b) => a.t - b.t)
      };
      $('#project-title').textContent = project.title || 'Новый проект'; $('#duration').value = project.duration; $('#fps').value = String(project.fps);
      $('#motion-speed').value = Math.round((Number(project.motionSpeed) || 1) * 100); $('#out-speed').value = `${(Number(project.motionSpeed) || 1).toFixed(1)}×`;
      $('#outline-width').value = project.style?.outline ?? 4; $('#grain-amount').value = project.style?.grain ?? 13;
      activeShotIndex = -1; displayedLocation = ''; configureVoiceCues(); drawEpisodeShots();
      applyLocation(project.shots?.[0]?.location || project.location || 'entrance'); updateStyle();
      drawTimeline(); seek(0); markDirty(); toast('Проект загружен.');
    } catch (_) { toast('Не удалось открыть файл проекта.'); }
  }

  function newProject() {
    const title = window.prompt('Название нового проекта', 'Новый эпизод');
    if (title === null) return;
    playing = false; cancelAnimationFrame(raf); audio.pause();
    project = { version: '1.0', title: title.trim() || 'Новый эпизод', duration: 30, fps: 24, motionSpeed: 1, location: 'entrance', camera: { cx: 0, cy: 0, zoom: 1 }, style: { outline: 4, grain: 13, accent: '#f1d21a' }, keyframes: [{ ...defaultKeys[0] }], shots: [], audioCues: [], audioName: '' };
    $('#project-title').textContent = project.title; $('#duration').value = 30; $('#fps').value = '24'; $('#motion-speed').value = 100; $('#out-speed').value = '1.0×';
    if (audioURL) URL.revokeObjectURL(audioURL); audioURL = ''; audio.removeAttribute('src'); audio.load(); audioDuration = 0;
    activeShotIndex = -1; configureVoiceCues(); drawEpisodeShots(); updateLocation('entrance'); drawTimeline(); seek(0); markDirty();
  }

  function loadAudio(file) {
    if (!file) return;
    if (audioURL) URL.revokeObjectURL(audioURL);
    audioURL = URL.createObjectURL(file); audio.src = audioURL; project.audioName = file.name;
    audio.addEventListener('loadedmetadata', () => { audioDuration = audio.duration || 0; drawTimeline(); markDirty(); }, { once: true });
    drawTimeline(); markDirty(); toast(`Добавлена дорожка: ${file.name}`);
  }

  function stageBlob() {
    const svg = stage.cloneNode(true);
    svg.querySelector('#safe-guides')?.remove();
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('width', '720'); svg.setAttribute('height', '1280');
    return new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
  }

  async function paintExportFrame(canvas, context) {
    const blob = stageBlob();
    const bitmap = await createImageBitmap(blob);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
  }

  function finishExport(recorder, chunks, cancelled) {
    $('#export-progress').classList.add('hidden');
    exportRun = null; playing = false; cancelAnimationFrame(raf); pauseAllAudio();
    $('#play').textContent = '▶'; $('#play').setAttribute('aria-label', 'Воспроизвести');
    if (cancelled || !chunks.length) { toast('Экспорт отменён.'); return; }
    const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' });
    download(`${project.title.toLowerCase().replace(/[^a-zа-я0-9]+/gi, '-') || 'cutout-film'}.webm`, blob, blob.type);
    toast(`WEBM готов · ${(blob.size / (1024 * 1024)).toFixed(1)} МБ`);
    seek(0);
  }

  async function exportWebM() {
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) { toast('Экспорт WebM не поддерживается в этом браузере.'); return; }
    const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 1280;
    const context = canvas.getContext('2d');
    playing = false; pauseAllAudio(); currentTime = 0; activeShotIndex = -1; renderAt(0);
    const fps = Number(project.fps) || 24;
    const stream = canvas.captureStream(fps);
    const audioGraph = ensureAudioGraph();
    if (audioGraph && mediaAudioDestination && !audioMuted) mediaAudioDestination.stream.getAudioTracks().forEach(track => stream.addTrack(track));
    const mime = ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type => MediaRecorder.isTypeSupported(type));
    if (!mime) { toast('В браузере не найден поддерживаемый кодек WebM.'); return; }
    let recorder;
    try { recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5000000 }); }
    catch (_) { toast('Не удалось запустить рендер.'); return; }
    const chunks = [];
    let cancelled = false;
    recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    recorder.onstop = () => finishExport(recorder, chunks, cancelled);
    exportRun = { recorder, cancel: () => { cancelled = true; if (recorder.state !== 'inactive') recorder.stop(); } };
    $('#export-progress').classList.remove('hidden');
    $('#export-progress-fill').style.width = '0%'; $('#export-percent').textContent = '0%';
    recorder.start(1000);
    await audioGraph?.resume();
    playing = true; activeVoiceIndex = -1;
    if (activeShotIndex >= 0) { startVoiceForShot(activeShotIndex, Math.max(0, currentTime - project.shots[activeShotIndex].start)); soundscape?.enter(activeShotIndex, currentTime); }
    if (audio.src && !audioMuted) { audio.currentTime = 0; audio.play().catch(() => {}); }
    const startedAt = performance.now();
    const tickExport = async now => {
      if (!exportRun || cancelled) return;
      currentTime = Math.min(project.duration, (now - startedAt) / 1000);
      renderAt(currentTime);
      try { await paintExportFrame(canvas, context); }
      catch (error) { console.error(error); exportRun.cancel(); toast('Ошибка рендера SVG-кадра.'); return; }
      const progress = Math.min(100, currentTime / project.duration * 100);
      $('#export-progress-fill').style.width = `${progress}%`; $('#export-percent').textContent = `${Math.floor(progress)}%`;
      if (currentTime >= project.duration) { recorder.stop(); return; }
      raf = requestAnimationFrame(tickExport);
    };
    raf = requestAnimationFrame(tickExport);
  }

  async function initializeEpisode() {
    try { localStorage.removeItem('cutout-cinema-project'); } catch (_) {}
    try {
      const cached = JSON.parse(localStorage.getItem('cutout-cinema-episode-project') || 'null');
      if (cached?.keyframes?.length && cached?.shots?.length) {
        project = { ...project, ...cached, duration: clamp(Number(cached.duration) || 80, 10, 120) };
        restoredProject = true;
      } else {
        const response = await fetch('projects/episode-01.json');
        if (!response.ok) throw new Error('Default episode JSON unavailable');
        project = { ...project, ...await response.json() };
      }
    } catch (error) { console.error(error); toast('Не удалось загрузить проект серии 01.'); }

    $('#project-title').textContent = project.title || 'Новый эпизод';
    $('#duration').value = project.duration; $('#fps').value = String(project.fps || 24);
    $('#motion-speed').value = Math.round((Number(project.motionSpeed) || 1) * 100); $('#out-speed').value = `${(Number(project.motionSpeed) || 1).toFixed(1)}×`;
    $('#outline-width').value = project.style?.outline ?? 4; $('#grain-amount').value = project.style?.grain ?? 13;
    configureVoiceCues(); drawEpisodeShots(); drawTimeline();
    // Load the reusable rig and all shot locations before playback, then hold the first cut.
    await loadRig();
    await Promise.all([...new Set((project.shots || []).map(shot => shot.location))].map(location => fetchLocation(location).catch(error => console.error(error))));
    activeShotIndex = -1; displayedLocation = '';
    renderAt(0);
    markDirty();
  }

  $('#play').addEventListener('click', play);
  $('#go-start').addEventListener('click', () => { if (playing) { playing = false; pauseAllAudio(); $('#play').textContent = '▶'; } seek(0); });
  $('#go-end').addEventListener('click', () => { if (playing) { playing = false; pauseAllAudio(); $('#play').textContent = '▶'; } seek(project.duration); });
  $('#add-keyframe').addEventListener('click', () => { const pose = evaluate(currentTime); upsertKey(currentTime, pose); toast(`Ключ создан · ${currentTime.toFixed(2)} сек`); });
  $('#duration').addEventListener('change', event => setDuration(event.target.value));
  $('#fps').addEventListener('change', event => { project.fps = Number(event.target.value); updateReadouts(); markDirty(); });

  const propertyMap = [['prop-x','x'],['prop-y','y'],['prop-scale','scale'],['prop-rotation','rotation'],['camera-x','cx'],['camera-y','cy'],['camera-zoom','zoom']];
  propertyMap.forEach(([id, name]) => $(`#${id}`).addEventListener('input', event => changeProperty(name, event.target.value)));
  $('#motion-select').addEventListener('change', event => setMotion(event.target.value));
  $('#motion-speed').addEventListener('input', event => { project.motionSpeed = Number(event.target.value) / 100; $('#out-speed').value = `${project.motionSpeed.toFixed(1)}×`; renderAt(currentTime); markDirty(); });
  $$('.motion-item').forEach(button => button.addEventListener('click', () => { $('#motion-select').value = button.dataset.motion; setMotion(button.dataset.motion); }));
  $$('.controller').forEach(button => button.addEventListener('click', () => {
    $$('.controller').forEach(item => item.classList.toggle('active', item === button));
    if (button.dataset.controller === 'head') { $('#motion-select').value = 'turn'; setMotion('turn'); }
    if (button.dataset.controller === 'arm-front') { $('#motion-select').value = 'gesture'; setMotion('gesture'); }
    if (button.dataset.controller === 'leg-front') { $('#motion-select').value = 'walk'; setMotion('walk'); }
    if (button.dataset.controller === 'bag') { const bag = $('#delivery-bag'); bag.style.opacity = bag.style.opacity === '0' ? '1' : '0'; toast(bag.style.opacity === '0' ? 'Термосумка скрыта' : 'Термосумка показана'); }
  }));

  $('#camera-reset').addEventListener('click', () => { const pose = evaluate(currentTime); upsertKey(currentTime, { ...pose, cx: 0, cy: 0, zoom: 1 }); renderAt(currentTime); });
  $('#location-entrance').addEventListener('click', () => updateLocation('entrance'));
  $('#location-stairs').addEventListener('click', () => updateLocation('stairs'));
  let draggingPuppet = false;
  stage.addEventListener('pointerdown', event => {
    if (!event.target.closest('#courier-rig') || playing || exportRun) return;
    draggingPuppet = true; stage.setPointerCapture?.(event.pointerId); event.preventDefault();
  });
  stage.addEventListener('pointermove', event => {
    if (!draggingPuppet) return;
    const point = stage.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const screen = point.matrixTransform(stage.getScreenCTM().inverse());
    const camera = evaluate(currentTime);
    const x = (screen.x - 180 - camera.cx) / camera.zoom + 180;
    const y = (screen.y - 320 - camera.cy) / camera.zoom + 320;
    upsertKey(currentTime, { ...evaluate(currentTime), x, y }); renderAt(currentTime);
  });
  stage.addEventListener('pointerup', () => { draggingPuppet = false; });
  stage.addEventListener('pointercancel', () => { draggingPuppet = false; });
  $('#toggle-guides').addEventListener('click', event => { const guides = $('#safe-guides'); guides.classList.toggle('hidden-guides'); event.currentTarget.classList.toggle('active'); });
  $('#guides-style').addEventListener('click', () => $('#toggle-guides').click());
  $('#fullscreen').addEventListener('click', () => { const node = $('#stage-shell'); if (document.fullscreenElement) document.exitFullscreen?.(); else node.requestFullscreen?.(); });
  $('#preview-zoom').addEventListener('change', event => { const shell = $('#stage-shell'); shell.style.transform = event.target.value === 'fit' ? '' : `scale(${event.target.value})`; });

  $('#outline-width').addEventListener('input', updateStyle); $('#grain-amount').addEventListener('input', updateStyle);
  $$('.swatches button').forEach(button => button.addEventListener('click', () => {
    const color = getComputedStyle(button).getPropertyValue('--swatch').trim();
    project.style.accent = color; document.documentElement.style.setProperty('--yellow', color);
    const bag = $('#delivery-bag'); if (bag) bag.querySelector('path').setAttribute('fill', color);
    markDirty(); toast(`Акцент палитры · ${color}`);
  }));
  $$('.inspector-tabs button').forEach(button => button.addEventListener('click', () => {
    $$('.inspector-tabs button').forEach(tab => tab.classList.toggle('active', tab === button));
    $('#transform-panel').classList.toggle('hidden', button.dataset.inspector !== 'transform');
    $('#style-panel').classList.toggle('hidden', button.dataset.inspector !== 'style');
  }));

  const audioInput = $('#audio-file');
  $('#add-track').addEventListener('click', () => audioInput.click());
  $('.audio-track-label').addEventListener('click', () => audioInput.click());
  audioInput.addEventListener('change', event => loadAudio(event.target.files[0]));
  $('#audio-toggle').addEventListener('click', event => {
    audioMuted = !audioMuted; audio.muted = audioMuted;
    if (audioMuted) { voicePlayers.forEach(player => player.pause()); soundscape?.pause(); }
    else if (playing && activeShotIndex >= 0) { startVoiceForShot(activeShotIndex, currentTime - project.shots[activeShotIndex].start); soundscape?.enter(activeShotIndex, currentTime); }
    event.currentTarget.classList.toggle('muted', audioMuted);
    event.currentTarget.setAttribute('aria-label', audioMuted ? 'Звук выключен' : 'Звук включён');
  });
  audio.addEventListener('loadedmetadata', () => { audioDuration = audio.duration || 0; drawTimeline(); });

  $('#timeline-scroller').addEventListener('pointerdown', event => {
    if (event.target.closest('.key-dot,.cut-segment,.voice-cue')) return;
    const scroller = event.currentTarget;
    const setFromPointer = clientX => {
      const rect = scroller.getBoundingClientRect();
      const x = clamp(clientX - rect.left + scroller.scrollLeft, 0, $('#timeline-inner').clientWidth);
      seek(x / $('#timeline-inner').clientWidth * project.duration);
    };
    setFromPointer(event.clientX);
    const move = e => setFromPointer(e.clientX);
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  });
  $('#timeline-scroller').addEventListener('wheel', event => { if (event.shiftKey) { event.preventDefault(); event.currentTarget.scrollLeft += event.deltaY; } }, { passive: false });
  $('.timeline-head .timeline-tools .icon-button').addEventListener('click', () => toast('Сетка привязана к секундам и кадрам.'));
  $$('.track-label').forEach(button => button.addEventListener('click', () => { $$('.track-label').forEach(row => row.classList.toggle('selected', row === button)); $$('.track-lane').forEach(lane => lane.classList.toggle('selected', lane.id.startsWith(button.dataset.track))); }));
  $('#add-asset').addEventListener('click', () => toast('Добавление SVG/PNG ассетов — следующий модуль.'));
  $('#new-project').addEventListener('click', newProject);
  $('#save-project').addEventListener('click', saveProject);
  $('#import-project').addEventListener('click', () => $('#project-file').click());
  $('#project-file').addEventListener('change', event => importProject(event.target.files[0]));
  $('#export-video').addEventListener('click', exportWebM);
  $('#cancel-export').addEventListener('click', () => exportRun?.cancel());
  $('#project-title').addEventListener('dblclick', () => { const title = window.prompt('Название проекта', project.title); if (title) { project.title = title; $('#project-title').textContent = title; markDirty(); } });

  document.addEventListener('keydown', event => {
    if (event.target.matches('input,select,textarea')) return;
    if (event.code === 'Space') { event.preventDefault(); play(); }
    if (event.key.toLowerCase() === 'k') { const pose = evaluate(currentTime); upsertKey(currentTime, pose); toast('Ключевой кадр добавлен.'); }
    if (event.key === 'ArrowLeft') seek(currentTime - 1 / project.fps);
    if (event.key === 'ArrowRight') seek(currentTime + 1 / project.fps);
  });

  window.addEventListener('resize', drawTimeline);
  window.addEventListener('beforeunload', () => { if (audioURL) URL.revokeObjectURL(audioURL); });
  initializeEpisode();
})();
