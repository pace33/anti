(() => {
  const DOMAIN_ORDER = ['number', 'relation', 'geometry', 'data'];
  const DOMAIN_NAMES = {
    number: '수와 연산',
    relation: '변화와 관계',
    geometry: '도형과 측정',
    data: '자료와 가능성'
  };

  function getDomain(areaId) {
    return typeof CURRICULUM !== 'undefined'
      ? CURRICULUM.find((area) => area.id === areaId)
      : null;
  }

  function resetScroll(sectionId) {
    const section = document.getElementById(sectionId);
    if (section) {
      section.scrollTop = 0;
      section.scrollLeft = 0;
    }
    const content = section?.firstElementChild;
    if (content) content.scrollTop = 0;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    requestAnimationFrame(() => {
      if (section) section.scrollTop = 0;
      window.scrollTo(0, 0);
    });
  }

  function areaLessons(area) {
    return BANDS.flatMap((band) => area.bands[band]);
  }

  function areaProgress(area) {
    const lessons = areaLessons(area);
    const completed = lessons.filter((item) => state.completed.has(item.id)).length;
    return {
      completed,
      total: lessons.length,
      percent: lessons.length ? Math.round((completed / lessons.length) * 100) : 0
    };
  }

  function bandProgress(area, band) {
    const lessons = area.bands[band] || [];
    const completed = lessons.filter((item) => state.completed.has(item.id)).length;
    return { completed, total: lessons.length };
  }

  function renderDomainNode(item, index, lessons) {
    const done = state.completed.has(item.id);
    const previous = lessons[index - 1];
    const locked = index > 0 && previous && !state.completed.has(previous.id);
    return `
      <button type="button" class="spiral-node domain-lesson-node ${done ? 'completed' : ''} ${locked ? 'locked' : ''}"
        data-id="${item.id}" ${locked ? 'disabled aria-disabled="true"' : ''}>
        <span class="node-state">${done ? '✓' : locked ? '🔒' : index + 1}</span>
        <span class="domain-node-copy">
          <strong>${item.title}</strong>
          <small>${item.summary}</small>
        </span>
      </button>`;
  }

  function renderDomainMap(area) {
    const root = document.getElementById('spiral-map-content');
    if (!root || !area) return;

    const progress = areaProgress(area);
    const lessons = area.bands[state.band] || [];
    const currentBandProgress = bandProgress(area, state.band);
    const specialTimeActivity = area.id === 'geometry' && state.band === '1-2'
      ? `
        <aside class="domain-special-activity">
          <div class="domain-special-icon" aria-hidden="true">🕒</div>
          <div>
            <span class="domain-special-label">집중 활동</span>
            <h3>시간 퀴즈</h3>
            <p>시계를 보고 시각을 읽는 문제를 난이도별로 연습해요.</p>
          </div>
          <button type="button" onclick="openGeometryTimeQuiz()">활동 시작</button>
        </aside>`
      : '';

    root.innerHTML = `
      <main class="spiral-shell domain-map-shell" style="--area:${area.color}">
        <header class="domain-map-hero spiral-panel">
          <button type="button" class="domain-back-button" onclick="openDashboard()">← 수학 영역 선택</button>
          <div class="domain-hero-main">
            <span class="domain-hero-icon" aria-hidden="true">${area.icon}</span>
            <div class="domain-hero-copy">
              <p class="spiral-eyebrow">2022 개정 초등 수학</p>
              <h1>${area.title}</h1>
              <p>${area.idea}</p>
            </div>
            <div class="domain-progress-card" aria-label="${area.title} 전체 진행률 ${progress.percent}%">
              <strong>${progress.percent}%</strong>
              <span>${progress.completed} / ${progress.total}개 완료</span>
              <div class="spiral-progress-track"><div class="spiral-progress-fill" style="width:${progress.percent}%"></div></div>
            </div>
          </div>
        </header>

        <nav class="spiral-tabs domain-band-tabs" aria-label="학년군 선택">
          ${BANDS.map((band) => `
            <button type="button" class="spiral-tab ${state.band === band ? 'active' : ''}" data-band="${band}">
              ${band.replace('-', '~')}학년
            </button>`).join('')}
        </nav>

        <section class="domain-learning-panel spiral-panel">
          <div class="domain-panel-heading">
            <div>
              <p class="spiral-eyebrow">${state.band.replace('-', '~')}학년군</p>
              <h2>${area.title} 배움 활동</h2>
              <p>앞 개념을 완료하면 다음 활동이 열려요.</p>
            </div>
            <span>${currentBandProgress.completed} / ${currentBandProgress.total} 완료</span>
          </div>
          <div class="domain-node-list">
            ${lessons.map((item, index) => renderDomainNode(item, index, lessons)).join('')}
          </div>
          ${specialTimeActivity}
        </section>

        <section class="domain-flow-guide spiral-panel" aria-label="학습 흐름">
          <strong>한 개념을 이렇게 배워요</strong>
          <div>${STEPS.map((step, index) => `<span><b>${index + 1}</b>${step}</span>`).join('')}</div>
        </section>
      </main>`;

    root.querySelectorAll('.domain-band-tabs .spiral-tab').forEach((button) => {
      button.addEventListener('click', () => {
        state.band = button.dataset.band;
        renderDomainMap(area);
        resetScroll('spiral-map-section');
      });
    });

    root.querySelectorAll('.domain-lesson-node:not(.locked)').forEach((button) => {
      button.addEventListener('click', () => window.openSpiralLesson(button.dataset.id));
    });
  }

  function syncDashboardProgress() {
    DOMAIN_ORDER.forEach((areaId) => {
      const area = getDomain(areaId);
      const card = document.querySelector(`[data-math-domain="${areaId}"]`);
      if (!area || !card) return;
      const progress = areaProgress(area);
      const value = card.querySelector('.domain-card-progress-value');
      const fill = card.querySelector('.domain-card-progress-fill');
      if (value) value.textContent = `${progress.percent}%`;
      if (fill) fill.style.width = `${progress.percent}%`;
    });
  }

  function syncVisibleProgress() {
    syncDashboardProgress();
    const map = document.getElementById('spiral-map-section');
    const mapVisible = map && !map.classList.contains('hidden') && map.style.display !== 'none';
    if (!mapVisible) return;
    const area = getDomain(state.activeAreaId || state.current?.area?.id);
    if (area) renderDomainMap(area);
  }

  function decorateLessonNavigation() {
    const area = state.current?.area;
    if (!area) return;
    document.querySelectorAll('#spiral-lesson-content .spiral-back').forEach((button) => {
      const label = `← ${area.title}`;
      if (button.textContent !== label) button.textContent = label;
    });
    document.querySelectorAll('#spiral-lesson-content .spiral-action').forEach((button) => {
      if (button.textContent.includes('배움 지도')) button.textContent = `${area.title}로 돌아가기`;
    });
  }

  const originalOpenSpiralLesson = window.openSpiralLesson;
  const originalOpenDashboard = window.openDashboard;
  const originalOpenTimeQuiz = window.openTimeQuiz;

  window.openMathDomain = function openMathDomain(areaId) {
    const area = getDomain(areaId);
    if (!area) return;
    state.activeAreaId = areaId;
    showSection('spiral-map-section');
    renderDomainMap(area);
    resetScroll('spiral-map-section');
    Promise.resolve(window.refreshAiedueMathProgress?.()).catch((error) => console.error('Math progress refresh failed:', error));
  };

  window.openSpiralMap = function openSpiralMap(areaId) {
    const targetId = areaId || state.activeAreaId || state.current?.area?.id;
    if (!targetId) {
      window.openDashboard();
      return;
    }
    window.openMathDomain(targetId);
  };

  window.openSpiralCurriculum = function openSpiralCurriculum() {
    window.openDashboard();
  };

  window.openSpiralLesson = function openSpiralLesson(id, options = {}) {
    const found = findLesson(id);
    if (!found) return false;
    state.activeAreaId = found.area.id;
    const opened = originalOpenSpiralLesson?.(id, options);
    if (opened === false) return false;
    resetScroll('spiral-lesson-section');
    requestAnimationFrame(decorateLessonNavigation);
    return true;
  };

  window.openDashboard = function openDashboardFromDomain() {
    state.activeAreaId = null;
    originalOpenDashboard?.();
    syncDashboardProgress();
    resetScroll('dashboard-section');
  };

  window.openGeometryTimeQuiz = function openGeometryTimeQuiz() {
    state.activeAreaId = 'geometry';
    originalOpenTimeQuiz?.();
    resetScroll('time-quiz-section');
  };

  window.goBackFromSpiral = function goBackFromSpiral() {
    const lesson = document.getElementById('spiral-lesson-section');
    const lessonVisible = lesson && !lesson.classList.contains('hidden') && lesson.style.display !== 'none';
    if (lessonVisible) window.openSpiralMap();
    else window.openDashboard();
  };

  window.goBackFromRpgHud = function goBackFromRpgHud() {
    const lesson = document.getElementById('spiral-lesson-section');
    const map = document.getElementById('spiral-map-section');
    const quiz = document.getElementById('time-quiz-section');
    if (lesson && !lesson.classList.contains('hidden') && lesson.style.display !== 'none') {
      window.openSpiralMap();
      return;
    }
    if (map && !map.classList.contains('hidden') && map.style.display !== 'none') {
      window.openDashboard();
      return;
    }
    if (quiz && !quiz.classList.contains('hidden') && quiz.style.display !== 'none' && state.activeAreaId === 'geometry') {
      window.openMathDomain('geometry');
      return;
    }
    window.openDashboard();
  };

  window.addEventListener('aiedue-math-progress-changed', syncVisibleProgress);

  document.addEventListener('DOMContentLoaded', () => {
    syncDashboardProgress();

    const tray = document.getElementById('rpg-action-tray');
    if (tray) {
      const buttons = [...tray.querySelectorAll('button')];
      const hasMathHome = buttons.some((button) => button.dataset.mathHomeAction === 'true' || button.getAttribute('onclick')?.includes('openDashboard') || button.textContent.includes('수학 영역'));
      const hasKoreanHome = buttons.some((button) => button.dataset.koreanHomeAction === 'true' || button.classList.contains('rpg-korean-action-button') || button.textContent.includes('에이두 한글'));
      if (!hasMathHome) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rpg-action-button';
        button.dataset.mathHomeAction = 'true';
        button.textContent = '🧮 수학 영역';
        button.addEventListener('click', () => window.openDashboard());
        tray.appendChild(button);
      }
      if (!hasKoreanHome) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rpg-action-button rpg-korean-action-button';
        button.dataset.koreanHomeAction = 'true';
        button.textContent = '📗 에이두 한글';
        button.addEventListener('click', () => { window.location.href = '../index.html'; });
        tray.appendChild(button);
      }
    }

  });
})();
