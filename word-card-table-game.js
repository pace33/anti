import { createWordCardState, resolveWordCardAnswer, loadWordCardRound } from './word-card-table-core.mjs';

const section = document.getElementById('word-card-table-game-section');
const markup = `
    <header class="wct-header"><button type="button" id="wct-home" class="wct-back aiedue-lab-home aiedue-lab-logo-home" aria-label="3단계 교과 맞춤쓰기 화면으로 돌아가기"><img src="aiedu_hangul_logo.webp" alt="에이두 한글"></button><div class="wct-brand aiedue-lab-brand"><div><p>3단계 · AIEDUE LAB</p><h1 id="wct-title">🃏 단어 카드 한 판</h1></div></div><button type="button" id="wct-finish" class="wct-back" disabled>게임 마치기</button></header>
    <main class="wct-main">
        <div class="wct-intro"><div><span class="wct-eyebrow">친구와 마주 앉아, 낱말 놀이</span><h2>그림과 설명을 보고 <em>내 카드를 내요!</em></h2></div><div class="wct-stats"><span>내 점수 <strong id="wct-score">0</strong></span><span>도전 <strong id="wct-attempts">0<small>번</small></strong></span></div></div>
        <div class="wct-match">
            <section class="wct-arena" aria-label="맞은편 친구와 카드 책상">
                <div class="wct-table-label"><span>친구가 낸 카드</span><small id="wct-round-number">01</small></div>
                <div id="wct-friend" class="wct-friend" data-mood="waiting" role="img" aria-label="카드를 내미는 친구"></div>
                <p id="wct-friend-says" class="wct-friend-says">이 카드의 이름은 뭘까?</p>
                <div id="wct-question" class="wct-question" aria-label="단어 이름이 가려진 문제 카드"><div class="wct-card-placeholder"><span aria-hidden="true">?</span><strong>친구의 카드가 도착할 자리</strong></div></div>
                <span id="wct-point-pop" class="wct-point-pop" aria-hidden="true"></span>
                <div class="wct-desk-label">WORD CARD CLUB <span>그림으로 만나고, 말로 기억해요.</span></div>
            </section>
            <section class="wct-hand" aria-labelledby="wct-hand-title"><div class="wct-hand-heading"><div><span class="wct-eyebrow">YOUR HAND</span><h2 id="wct-hand-title">내 카드 네 장</h2></div><span class="wct-hand-tip">한 장을 눌러 내세요 ↙</span></div><div id="wct-choices" class="wct-choices" aria-label="고를 수 있는 단어 카드 네 장"></div><p id="wct-status" class="wct-status" role="status" aria-live="polite">같은 단어의 카드를 찾아 주세요.</p><div class="wct-actions"><button type="button" id="wct-listen" class="wct-secondary" disabled>♪ 설명 듣기</button><button type="button" id="wct-next" class="wct-primary" hidden>다음 카드 받기 →</button></div></section>
        </div>
        <footer class="wct-footer"><span id="wct-source">단어 카드 저장소와 연결해요</span><span>정답 +1점 · 오답은 점수 그대로 · 시간 제한 없이 생각해요</span></footer>
    </main>
    <div id="wct-overlay" class="wct-overlay" role="dialog" aria-modal="true" aria-labelledby="wct-overlay-title" aria-describedby="wct-overlay-copy"><div class="wct-overlay-card"><span class="wct-eyebrow" id="wct-overlay-label">LET’S PLAY TOGETHER</span><span class="wct-card-mark" aria-hidden="true">▤ ? ▤</span><h2 id="wct-overlay-title">친구의 단어 카드를 맞혀 볼까요?</h2><p id="wct-overlay-copy">친구가 책상에 놓은 카드의 이름은 비밀! 그림과 설명을 보고 내 카드 네 장 중 같은 단어를 골라 내요. 정답이면 친구가 박수치며 1점을 줘요.</p><div class="wct-rules" id="wct-rules"><span>저장소 카드만</span><span>정답 +1점</span><span>시간 제한 없음</span></div><button type="button" id="wct-start" class="wct-primary">카드 게임 시작 →</button><button type="button" id="wct-repository" class="wct-secondary" hidden>단어 카드 저장소 보기</button><button type="button" id="wct-overlay-home" class="wct-text-button">연구실로 돌아가기</button></div></div>
    <div id="wct-flying" class="wct-flying" aria-hidden="true" hidden></div>
`;

let state = createWordCardState(), round = null, pendingOutcome = null, previousId = '';
let controller = null, generation = 0, frame = 0, lastTime = 0, elapsed = 0, pausedStatus = '', flight = null;
let initialized = false, source = null;
const ui = {};

function initialize() {
    if (initialized || !section) return;
    section.innerHTML = markup;
    for (const id of ['home','finish','score','attempts','round-number','friend','friend-says','question','point-pop','choices','status','listen','next','source','overlay','overlay-title','overlay-copy','overlay-label','rules','start','repository','overlay-home','flying']) ui[id] = document.getElementById(`wct-${id}`);
    ui.main = section.querySelector('.wct-main'); ui.header = section.querySelector('.wct-header');
    ui.start.addEventListener('click', start);
    ui.next.addEventListener('click', () => { if (state.status === 'feedback') void deal(); });
    ui.home.addEventListener('click', close); ui['overlay-home'].addEventListener('click', close);
    ui.finish.addEventListener('click', finish);
    ui.repository.addEventListener('click', () => { close(); window.openSharedWordCardRepository?.('dictation'); });
    ui.listen.addEventListener('click', () => { if (['choosing','feedback'].includes(state.status) && round) source?.speak?.(round.answer.explanation); });
    section.addEventListener('keydown', event => {
        if (event.key === 'Escape' && ['dealing','choosing','playing','feedback'].includes(state.status)) { event.preventDefault(); pause(); }
        if (event.key === 'Tab' && !ui.overlay.hidden) {
            if (event.shiftKey && document.activeElement === ui.home) { event.preventDefault(); ui['overlay-home'].focus(); }
            else if (!event.shiftKey && document.activeElement === ui.home) { event.preventDefault(); ui.start.focus(); }
            else if (event.shiftKey && document.activeElement === ui.start) { event.preventDefault(); ui.home.focus(); }
            else if (!event.shiftKey && document.activeElement === ui['overlay-home']) { event.preventDefault(); ui.home.focus(); }
        }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    window.addEventListener('pagehide', event => { if (event.persisted) pause(); else stop(); });
    initialized = true;
}

function say(text) { ui.status.textContent = text; }
function mood(value) {
    ui.friend.dataset.mood = value;
    ui.friend.setAttribute('aria-label', value === 'happy' ? '박수치며 기뻐하는 친구' : value === 'oops' ? '이마에 손을 얹으며 아이고 하는 친구' : '카드를 내미는 친구');
}
function controls() {
    for (const button of ui.choices.querySelectorAll('button')) button.disabled = state.status !== 'choosing';
    ui.listen.disabled = !['choosing','feedback'].includes(state.status);
    ui.next.hidden = state.status !== 'feedback';
    ui.finish.disabled = !['choosing','feedback'].includes(state.status);
}
function hud() {
    ui.score.textContent = String(state.score);
    ui.attempts.textContent = `${state.attempts}번`;
    ui['round-number'].textContent = String(state.attempts + (state.status === 'feedback' ? 0 : 1)).padStart(2, '0');
    controls();
}
function makeCard(card, { concealed = false, choice = false, wordOnly = choice, index = 0 } = {}) {
    const node = document.createElement(choice ? 'button' : 'article');
    node.className = `wct-card${wordOnly ? ' wct-word-choice' : ''}`;
    if (choice) {
        node.type = 'button'; node.setAttribute('aria-label', `${index + 1}번, ${card.word} 카드 내기`);
    }
    const word = document.createElement('strong'); word.className = `wct-card-word${concealed ? ' is-secret' : ''}`;
    word.textContent = concealed ? '? ? ?' : card.word;
    if (concealed) word.setAttribute('aria-label', '가려진 단어 이름');
    if (wordOnly) {
        node.append(word);
        if (choice) node.addEventListener('click', () => play(card.id, node));
        return node;
    }
    const picture = document.createElement('img'); picture.className = 'wct-card-image';
    picture.alt = concealed ? '어떤 단어인지 알려 주는 문제 그림' : `${card.word} 그림`;
    picture.src = card.imageUrl; picture.draggable = false;
    const explanation = document.createElement('p'); explanation.className = 'wct-card-explanation'; explanation.textContent = card.explanation;
    node.append(picture, word, explanation);
    return node;
}

function prepareImage(url, signal) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const cleanup = () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); img.onload = img.onerror = null; };
        const done = () => { cleanup(); resolve(); };
        const fail = () => { cleanup(); reject(new Error('카드 그림을 불러오지 못했어요.')); };
        const abort = () => { cleanup(); reject(new DOMException('취소됨', 'AbortError')); };
        const timeout = setTimeout(fail, 20000);
        img.onload = () => img.naturalWidth ? done() : fail(); img.onerror = fail;
        signal?.addEventListener('abort', abort, { once: true });
        if (signal?.aborted) { abort(); return; }
        img.src = url;
    });
}

async function deal() {
    if (!['ready','feedback','error'].includes(state.status)) return;
    controller?.abort(); controller = new AbortController();
    const request = ++generation;
    state.status = 'loading'; hideOverlay(); cancelAnimationFrame(frame); controls();
    source?.stopSpeech?.(); mood('waiting'); ui['point-pop'].textContent = '';
    ui['friend-says'].textContent = '저장소에서 새 카드를 골라 볼게!';
    ui.question.classList.remove('is-dealt'); ui.question.replaceChildren(); ui.choices.replaceChildren();
    ui.question.setAttribute('aria-busy', 'true');
    say('단어 카드 저장소에서 새 문제와 단어 선택지를 불러오고 있어요…');
    try {
        const loaded = await loadWordCardRound(source, { previousId, signal: controller.signal, prepareImage });
        if (request !== generation) return;
        round = loaded; previousId = round.answer.id;
        ui.question.replaceChildren(makeCard(round.answer, { concealed: true }));
        ui.question.setAttribute('aria-label', '단어 이름이 가려진 문제 카드');
        ui.question.setAttribute('aria-busy', 'false');
        ui.choices.replaceChildren(...round.choices.map((card, index) => makeCard(card, { choice: true, index })));
        ui.source.textContent = `저장소에서 불러온 공개 카드 ${round.availableCount}종 · 매 문제 새로 뽑아요`;
        state.status = 'dealing'; elapsed = 0;
        ui['friend-says'].textContent = '자, 이 카드의 이름은 뭘까?';
        say('친구가 카드를 책상 가운데 놓고 있어요.'); hud();
        if (document.hidden) pause(); else startFrame();
    } catch (error) {
        if (request !== generation || error?.name === 'AbortError') return;
        state.status = 'error'; ui.question.setAttribute('aria-busy', 'false');
        const copy = error?.code === 'cards/too-few' ? error.message : error?.code === 'cards/login-required' || error?.status === 401
            ? '단어 카드 저장소는 로그인이 필요해요. 에이두 계정을 확인한 뒤 다시 열어 주세요.'
            : '저장소나 카드 그림을 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요. 저장소 카드가 준비되어야 게임을 시작할 수 있어요.';
        showOverlay('카드를 준비하지 못했어요', copy, '다시 불러오기', 'WORD CARD REPOSITORY');
    }
}

function play(id, node) {
    const result = resolveWordCardAnswer(state, round, id);
    if (result === state) return;
    pendingOutcome = result; state.status = 'playing'; controls(); source?.stopSpeech?.();
    ui.choices.querySelectorAll('button').forEach(button => button.classList.toggle('is-played', button === node));
    const start = node.getBoundingClientRect(), target = ui.question.getBoundingClientRect();
    const card = round.choices.find(item => item.id === id);
    ui.flying.replaceChildren(makeCard(card, { wordOnly: true })); ui.flying.hidden = false;
    ui.flying.style.width = `${start.width}px`; ui.flying.style.left = `${start.left}px`; ui.flying.style.top = `${start.top}px`;
    flight = { x: target.left + target.width * .30 - start.left, y: target.top + target.height * .13 - start.top, scale: target.width / start.width * .86 };
    ui.flying.style.transform = 'translate(0, 0)'; elapsed = 0;
    say(`“${card.word}” 카드를 냈어요. 친구가 확인하고 있어요!`); startFrame();
}
function reveal() {
    state = pendingOutcome; pendingOutcome = null;
    ui.flying.hidden = true; flight = null;
    ui.question.replaceChildren(makeCard(round.answer));
    ui.question.setAttribute('aria-label', '이름이 공개된 정답 카드');
    mood(state.correct ? 'happy' : 'oops');
    ui['friend-says'].textContent = state.correct ? '짝짝짝! 정답이야!' : '아이고! 아쉽다, 다음엔 맞혀 보자!';
    ui['point-pop'].textContent = state.correct ? '+1' : '';
    say(state.correct ? `정답! “${round.answer.word}” 카드예요. 1점을 얻었어요.` : `정답은 “${round.answer.word}” 카드예요. 점수는 그대로! 다음 카드도 도전해요.`);
    ui.status.dataset.tone = state.correct ? 'success' : 'oops'; hud(); ui.next.focus({ preventScroll: true });
    const friendRect = ui.friend.getBoundingClientRect();
    if (window.matchMedia?.('(max-width: 620px)').matches || friendRect.top < 0 || friendRect.bottom > window.innerHeight) {
        ui.friend.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    }
}
function tick(now) {
    elapsed += Math.max(0, now - lastTime); lastTime = now;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (state.status === 'dealing') {
        const progress = Math.min(1, elapsed / 650);
        ui.question.style.transform = reduced ? '' : `translateY(${(1 - progress) * -75}px) rotate(${(1 - progress) * -9}deg)`;
        ui.question.style.opacity = String(.35 + .65 * progress);
        if (progress >= 1) { state.status = 'choosing'; ui.question.classList.add('is-dealt'); controls(); say('그림과 설명을 보고, 같은 단어의 카드를 한 장 내세요.'); ui.choices.querySelector('button')?.focus({ preventScroll: true }); return; }
    } else if (state.status === 'playing' && flight) {
        const progress = Math.min(1, elapsed / 650);
        if (reduced) ui.flying.hidden = true;
        else ui.flying.style.transform = `translate(${flight.x * progress}px, ${flight.y * progress - Math.sin(progress * Math.PI) * 50}px) scale(${1 + (flight.scale - 1) * progress}) rotate(${progress * 7}deg)`;
        if (progress >= 1) { reveal(); return; }
    } else return;
    frame = requestAnimationFrame(tick);
}
function startFrame() { cancelAnimationFrame(frame); lastTime = performance.now(); frame = requestAnimationFrame(tick); }
function showOverlay(title, copy, button, label) {
    ui.overlay.hidden = false; ui.main.inert = true;
    ui['overlay-title'].textContent = title; ui['overlay-copy'].textContent = copy;
    ui['overlay-label'].textContent = label; ui.start.textContent = button;
    ui.rules.hidden = state.status !== 'ready'; ui.repository.hidden = state.status !== 'error';
    controls(); ui.start.focus();
}
function hideOverlay() { ui.overlay.hidden = true; ui.main.inert = false; ui.status.dataset.tone = ''; }
function start() {
    if (state.status === 'paused') { resume(); return; }
    if (state.status === 'summary') { state = createWordCardState(); previousId = ''; hud(); }
    if (state.status === 'ready' || state.status === 'error') void deal();
}
function pause() {
    if (!['dealing','choosing','playing','feedback'].includes(state.status)) return;
    pausedStatus = state.status; state.status = 'paused'; cancelAnimationFrame(frame); source?.stopSpeech?.();
    showOverlay('잠깐 쉬어 가요', '카드와 점수는 그대로예요. 준비되면 친구와 이어서 놀아요.', '이어서 하기', 'TAKE A BREAK');
}
function resume() {
    if (document.hidden || state.status !== 'paused') return;
    state.status = pausedStatus; pausedStatus = ''; hideOverlay(); controls();
    if (['dealing','playing'].includes(state.status)) startFrame();
    else if (state.status === 'feedback') ui.next.focus({ preventScroll: true });
    else ui.choices.querySelector('button')?.focus({ preventScroll: true });
}
function finish() {
    if (!['choosing','feedback'].includes(state.status)) return;
    controller?.abort(); generation++; cancelAnimationFrame(frame); source?.stopSpeech?.();
    ui.flying.hidden = true; pendingOutcome = null; state.status = 'summary';
    showOverlay(`${state.score}점! 잘 놀았어요`, `${state.attempts}장의 카드를 내고 ${state.score}개의 단어를 맞혔어요. 새 게임에서도 저장소의 카드만 새로 뽑아요.`, '한 판 더 하기', 'OUR WORD CARD MOMENTS');
}
function stop() {
    controller?.abort(); controller = null; generation++; cancelAnimationFrame(frame); frame = 0;
    if (!initialized) return;
    source?.stopSpeech?.(); state = { ...createWordCardState(), status: 'closed' }; round = null; pendingOutcome = null; previousId = ''; flight = null;
    ui.flying.hidden = true; ui.flying.replaceChildren(); ui.question.replaceChildren(); ui.choices.replaceChildren();
    ui.main.inert = false; ui.header.inert = false;
}
function open() {
    initialize(); if (!initialized) return; stop(); source = window.aiedueWordCardTableSource;
    window.closeAiedueKoreanModal?.(); window.showAiedueTopLevelSection?.('word-card-table-game-section');
    if (section.hasAttribute('data-standalone')) { section.classList.remove('hidden'); document.body.classList.add('word-card-table-open'); }
    state = createWordCardState(); mood('waiting'); hud(); ui['friend-says'].textContent = '나랑 단어 카드 놀이할래?';
    ui['point-pop'].textContent = ''; ui.source.textContent = '단어 카드 저장소와 연결해요';
    showOverlay('친구의 단어 카드를 맞혀 볼까요?', '친구가 책상에 놓은 카드의 이름은 비밀! 그림과 설명을 보고 내 카드 네 장 중 같은 단어를 골라 내요. 정답이면 친구가 박수치며 1점을 줘요.', '카드 게임 시작 →', 'LET’S PLAY TOGETHER');
}
function close() {
    stop(); document.body.classList.remove('word-card-table-open');
    if (section.hasAttribute('data-standalone')) { window.location.href = 'index.html'; return; }
    window.showAiedueTopLevelSection?.('dashboard-section');
    window.restoreAiedueLabReturnFocus?.('dashboard-lab-word-card');
}
window.openWordCardTableGame = open;
window.stopWordCardTableGame = stop;
window.closeWordCardTableGame = close;
if (section?.hasAttribute('data-standalone')) open();
