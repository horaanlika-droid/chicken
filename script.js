(() => {
  const shots = [...document.querySelectorAll('.shot-card')];
  const tabs = [...document.querySelectorAll('.shot-tab')];
  const playButton = document.querySelector('#play-toggle');
  const playIcon = document.querySelector('#play-icon');
  const resetButton = document.querySelector('#reset-play');
  const timeLabel = document.querySelector('#player-shot');
  const progress = document.querySelector('#player-progress');
  const track = document.querySelector('#player-track');
  const status = document.querySelector('#player-label');
  const duration = 80;
  let elapsed = 0;
  let running = false;
  let lastTick = 0;
  let frame = 0;
  let activeIndex = 0;

  const format = value => {
    const seconds = Math.max(0, Math.floor(value));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };

  function shotAt(time) {
    return shots.findIndex((shot, i) => time >= Number(shot.dataset.start) && (time < Number(shot.dataset.end) || i === shots.length - 1));
  }

  function setActive(index, scroll = false) {
    activeIndex = Math.max(0, Math.min(index, shots.length - 1));
    shots.forEach((shot, i) => shot.classList.toggle('is-active', i === activeIndex));
    tabs.forEach((tab, i) => {
      const active = i === activeIndex;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    if (scroll) shots[activeIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function render() {
    timeLabel.innerHTML = `${format(elapsed)} <span>/</span> 01:20`;
    const percent = Math.min(100, elapsed / duration * 100);
    progress.style.width = `${percent}%`;
    track.setAttribute('aria-valuenow', String(Math.floor(elapsed)));
    const found = shotAt(elapsed);
    if (found >= 0 && found !== activeIndex) setActive(found);
  }

  function tick(now) {
    if (!running) return;
    if (lastTick) elapsed += (now - lastTick) / 1000;
    lastTick = now;
    if (elapsed >= duration) {
      elapsed = duration;
      running = false;
      playIcon.textContent = '▶';
      playButton.setAttribute('aria-label', 'Запустить просмотр раскадровки');
      status.textContent = 'РАСКАДРОВКА ЗАВЕРШЕНА';
      lastTick = 0;
    }
    render();
    if (running) frame = requestAnimationFrame(tick);
  }

  function togglePlayback() {
    if (running) {
      running = false;
      cancelAnimationFrame(frame);
      lastTick = 0;
      playIcon.textContent = '▶';
      playButton.setAttribute('aria-label', 'Продолжить просмотр раскадровки');
      status.textContent = 'ПРОСМОТР НА ПАУЗЕ';
    } else {
      if (elapsed >= duration) elapsed = 0;
      running = true;
      lastTick = 0;
      playIcon.textContent = 'Ⅱ';
      playButton.setAttribute('aria-label', 'Поставить просмотр на паузу');
      status.textContent = 'РАСКАДРОВКА ИДЁТ';
      frame = requestAnimationFrame(tick);
    }
  }

  playButton.addEventListener('click', togglePlayback);
  resetButton.addEventListener('click', () => {
    running = false;
    cancelAnimationFrame(frame);
    elapsed = 0;
    lastTick = 0;
    playIcon.textContent = '▶';
    playButton.setAttribute('aria-label', 'Запустить просмотр раскадровки');
    status.textContent = 'ПРОЙТИ ПО РАСКАДРОВКЕ';
    setActive(0);
    render();
  });

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      running = false;
      cancelAnimationFrame(frame);
      elapsed = Number(shots[index].dataset.start);
      lastTick = 0;
      playIcon.textContent = '▶';
      playButton.setAttribute('aria-label', 'Запустить просмотр раскадровки');
      status.textContent = 'ПРОЙТИ ПО РАСКАДРОВКЕ';
      setActive(index, true);
      render();
    });
  });

  tabs.forEach((tab, index) => {
    tab.addEventListener('keydown', event => {
      let next = index;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else return;
      event.preventDefault();
      tabs[next].focus();
      tabs[next].click();
    });
  });

  setActive(0);
  render();
})();
