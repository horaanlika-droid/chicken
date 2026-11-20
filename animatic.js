(() => {
  const scenes = [
    { name: 'Домофон', code: '01 / ДОМОФОН', note: 'КЛИК. ТИШИНА.', start: 0, end: 10, src: 'assets/shot-01-intercom.jpg', alt: 'Пластиковая рука курьера нажимает кнопку старого домофона', description: 'Кнопка нажата. Домофон молчит. Тяжёлая дверь поддаётся от руки.' },
    { name: 'Лестница', code: '02 / ПОДЪЁМ', note: 'НЕ ТОТ ПОДЪЕЗД', start: 10, end: 20, src: 'assets/stairwell-hero.jpg', alt: 'Курьер с жёлтой термосумкой поднимается по лестнице', description: 'Низкая камера идёт за спиной курьера. Жёлтый груз подпрыгивает на каждом шаге.' },
    { name: 'Осознание', code: '03 / ПАУЗА', note: '…', start: 20, end: 30, src: '', alt: 'Стилизованный кадр лестничной площадки с остановившимся курьером', description: 'На площадке он замирает и медленно смотрит вниз. Плечи опускаются.' },
    { name: 'Жёлтый куб', code: '04 / MACRO', note: 'ЧУЖАЯ ЕДА', start: 30, end: 42, src: 'assets/shot-04-yellow-cube.jpg', alt: 'Крупный план жёлтой термосумки и уставшего пластикового курьера', description: 'Макро сумки, рука на ткани, усталый пластиковый профиль. Снова сумка.' },
    { name: 'Вверх', code: '05 / LOW ANGLE', note: 'ЕЩЁ ВЫШЕ', start: 42, end: 54, src: '', alt: 'Стилизованный низкий ракурс бесконечной лестницы', description: 'Камера снизу смотрит вдоль лестничного пролёта. Архитектура давит.' },
    { name: 'Падение', code: '06 / CUT', note: 'УДАР. ТИШИНА.', start: 54, end: 68, src: '', alt: 'Жёлтая сумка лежит на бетонной площадке в темноте', description: 'Резкая склейка. Удар тонет в лестничной клетке. Самого падения не видно.' },
    { name: 'Кто я?', code: '07 / TOP SHOT', note: 'НЕ ОБЪЯСНЯТЬ', start: 68, end: 80, src: 'assets/shot-07-reveal.jpg', alt: 'Вид сверху на неподвижную фигуру, курьера и жёлтую сумку на площадке', description: 'Сверху — неподвижная фигура рядом с жёлтой сумкой. Курьер над затылком. Чёрный экран.' }
  ];
  const frame = document.querySelector('#animatic-frame');
  if (!frame) return;
  const image = document.querySelector('#animatic-image');
  const play = document.querySelector('#animatic-play');
  const reset = document.querySelector('#animatic-reset');
  const previous = document.querySelector('#animatic-prev');
  const next = document.querySelector('#animatic-next');
  const label = document.querySelector('#animatic-play-label');
  const icon = document.querySelector('#animatic-play-icon');
  const current = document.querySelector('#animatic-current');
  const clock = document.querySelector('#animatic-time');
  const description = document.querySelector('#animatic-description');
  const progress = document.querySelector('#animatic-progress');
  const fill = document.querySelector('#animatic-progress-fill');
  let elapsed = 0;
  let index = 0;
  let running = false;
  let last = 0;
  let request = 0;

  const time = seconds => {
    const value = Math.floor(Math.max(0, seconds));
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  };

  function render() {
    const scene = scenes[index];
    frame.dataset.scene = String(index);
    frame.classList.remove('cut-in');
    void frame.offsetWidth;
    frame.classList.add('cut-in');
    if (scene.src) {
      image.src = scene.src;
      image.alt = scene.alt;
      image.hidden = false;
    } else {
      image.hidden = true;
      image.alt = scene.alt;
    }
    document.querySelector('#animatic-shot').textContent = `SHOT ${String(index + 1).padStart(2, '0')}`;
    document.querySelector('#animatic-range').textContent = `${time(scene.start)}—${time(scene.end)}`;
    document.querySelector('#animatic-scene-name').textContent = scene.name;
    document.querySelector('#animatic-frame-note').textContent = scene.note;
    current.textContent = scene.code;
    description.textContent = scene.description;
    const percent = elapsed / 80 * 100;
    fill.style.width = `${percent}%`;
    progress.setAttribute('aria-valuenow', String(Math.floor(elapsed)));
    clock.textContent = `${time(elapsed)} / 01:20`;
    previous.disabled = index === 0;
    next.disabled = index === scenes.length - 1;
  }

  function sceneFor(seconds) {
    return scenes.findIndex((scene, i) => seconds >= scene.start && (seconds < scene.end || i === scenes.length - 1));
  }

  function tick(now) {
    if (!running) return;
    if (last) elapsed += (now - last) / 1000;
    last = now;
    if (elapsed >= 80) {
      elapsed = 80;
      running = false;
      last = 0;
      icon.textContent = '▶';
      label.textContent = 'ПРОГНАТЬ ЗАНОВО';
    }
    const sceneIndex = sceneFor(elapsed);
    if (sceneIndex !== index) index = sceneIndex;
    render();
    if (running) request = requestAnimationFrame(tick);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(request);
    last = 0;
    icon.textContent = '▶';
    label.textContent = elapsed >= 80 ? 'ПРОГНАТЬ ЗАНОВО' : 'ПРОДОЛЖИТЬ';
  }

  play.addEventListener('click', () => {
    if (running) {
      stop();
      return;
    }
    if (elapsed >= 80) elapsed = 0;
    running = true;
    last = 0;
    icon.textContent = 'Ⅱ';
    label.textContent = 'ПАУЗА';
    request = requestAnimationFrame(tick);
  });

  function jump(target) {
    stop();
    index = Math.max(0, Math.min(scenes.length - 1, target));
    elapsed = scenes[index].start;
    render();
  }

  previous.addEventListener('click', () => jump(index - 1));
  next.addEventListener('click', () => jump(index + 1));
  reset.addEventListener('click', () => {
    stop();
    elapsed = 0;
    index = 0;
    render();
    label.textContent = 'ПРОГНАТЬ 01:20';
  });
  render();
})();
