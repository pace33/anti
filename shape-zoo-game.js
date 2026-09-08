import { ZOO_SHAPES, createZooState, createZooShapeDeck, getDrawingDuration, evaluateZooTrace, resolveZooRound } from './shape-zoo-core.mjs';

const section = document.getElementById('shape-zoo-game-section');
const markup = `
    <header class="zoo-header">
        <button type="button" id="zoo-home" class="zoo-back">← <span>연구실</span></button>
        <div class="zoo-brand"><span class="zoo-brand-mark" aria-hidden="true">◒</span><div><p>AIEDUE LAB <span>/ PLAY & LEARN</span></p><h1 id="shape-zoo-title">도형 동물원</h1></div></div>
        <div class="zoo-header-actions"><span class="zoo-lab-tag">생각이 자라는 놀이터</span><button type="button" id="zoo-pause" class="zoo-icon-button" aria-label="게임 일시정지" disabled>Ⅱ</button></div>
    </header>
    <main class="zoo-main">
        <div class="zoo-intro"><div><span class="zoo-eyebrow">작은 사육사의 간식 시간</span><h2>도형을 그리면, <span>사자가 냠냠!</span></h2><p>점선을 따라 과자를 완성하고 사자 친구에게 건네주세요.</p></div><div class="zoo-scoreboard"><div><span>완성한 과자</span><strong><b id="zoo-score">0</b><small>개</small></strong></div><div><span>남은 생명</span><strong id="zoo-lives" aria-label="생명 3개">♥♥♥</strong></div></div></div>
        <div class="zoo-play-layout">
            <section class="zoo-habitat" aria-label="사자의 울타리">
                <div class="zoo-scene-label"><span class="zoo-live-dot"></span> 사자 친구의 집 <span>01</span></div>
                <div class="zoo-thought"><span id="zoo-wish">이 모양 과자가 먹고 싶어!</span><div id="zoo-request-shape" aria-hidden="true"></div><strong id="zoo-request-name">동그라미</strong></div>
                <div id="zoo-lion" class="zoo-lion" data-mood="neutral" role="img" aria-label="과자를 기다리는 사자"></div>
                <div id="zoo-reward" class="zoo-reward" aria-hidden="true"></div>
                <div class="zoo-nameplate"><span>오늘의 친구</span><strong>사자 레오</strong><i aria-hidden="true">✦</i></div>
                <div class="zoo-scene-caption">작은 손으로 만드는, 맛있는 도형 한 조각.</div>
            </section>
            <section class="zoo-workshop" aria-labelledby="zoo-workshop-title">
                <div class="zoo-workshop-heading"><div><span class="zoo-eyebrow">SHAPE COOKIE</span><h2 id="zoo-workshop-title">과자 만들기</h2></div><span id="zoo-round" class="zoo-round">ROUND 01</span></div>
                <div class="zoo-timer-label"><span id="zoo-timer-caption">그릴 수 있는 시간</span><strong><span id="zoo-seconds">18.0</span><small>초</small></strong></div>
                <div id="zoo-timer" class="zoo-timer" role="progressbar" aria-label="남은 그리기 시간" aria-valuemin="0" aria-valuemax="18" aria-valuenow="18"><i id="zoo-time-fill"></i></div>
                <div class="zoo-board-wrap"><span class="zoo-board-label" id="zoo-board-label">동그라미</span><canvas id="zoo-canvas" width="600" height="600" tabindex="0" role="application" aria-label="점선을 따라 도형 그리기" aria-describedby="zoo-keyboard-help zoo-feedback"></canvas><span class="zoo-board-hint" id="zoo-board-hint">어디서 시작해도 좋아요</span></div>
                <p id="zoo-feedback" class="zoo-feedback" role="status" aria-live="polite">준비되면 아래의 시작 버튼을 눌러 주세요.</p>
                <div class="zoo-drawing-actions"><button id="zoo-clear" type="button" class="zoo-clear" disabled>↺ 다시 그리기</button><button id="zoo-submit" type="button" class="zoo-primary" disabled>완료! 과자 주기 <span aria-hidden="true">↗</span></button></div>
                <p class="zoo-input-hint">마우스 · 터치 · 펜으로 그려요 <span>손을 떼었다 이어 그려도 괜찮아요.</span></p>
                <p id="zoo-keyboard-help" class="zoo-sr-only">키보드: 방향키로 이동, 스페이스로 펜을 내리거나 올리기, Enter로 완료. Shift와 방향키를 함께 누르면 크게 이동합니다.</p>
            </section>
        </div>
        <footer class="zoo-footer"><span><b>01</b> 말풍선 속 도형을 봐요</span><i>→</i><span><b>02</b> 점선을 따라 그려요</span><i>→</i><span><b>03</b> 완료를 눌러 과자를 줘요</span><small>성공할수록 시간이 조금씩 줄어요!</small></footer>
    </main>
    <div id="zoo-overlay" class="zoo-overlay" role="dialog" aria-modal="true" aria-labelledby="zoo-overlay-title" aria-describedby="zoo-overlay-copy">
        <div class="zoo-overlay-card"><span class="zoo-eyebrow" id="zoo-overlay-eyebrow">WELCOME TO SHAPE ZOO</span><span class="zoo-overlay-symbol" aria-hidden="true">◯ △ □</span><h2 id="zoo-overlay-title">레오의 간식을 만들어 볼까요?</h2><p id="zoo-overlay-copy">말풍선 속 도형을 점선 따라 그리고 완료를 눌러요. 잘 그리면 과자 +1개! 모양이 다르거나 시간이 지나면 생명이 1개 줄어요.</p><div id="zoo-overlay-chips" class="zoo-overlay-chips"><span>생명 3개</span><span>18초부터 시작</span><span>나의 도형 ${ZOO_SHAPES.length}종</span></div><button id="zoo-start" type="button" class="zoo-primary">게임 시작 <span aria-hidden="true">→</span></button><button id="zoo-overlay-home" type="button" class="zoo-text-button">연구실로 돌아가기</button></div>
    </div>
    <canvas id="zoo-cookie" class="zoo-cookie" width="160" height="160" aria-hidden="true" hidden></canvas>
`;

const starterShape = ZOO_SHAPES.find(item => item.id === 'circle');
let state = createZooState(), shape = starterShape, shapeQueue = [], strokes = [], activeStroke = null, pointerId = null;
let frame = 0, lastTime = 0, elapsed = 0, remaining = 18000, duration = 18000, pausedStatus = '';
let verdict = null, timedOut = false, overflow = false, flight = null, resizeObserver = null;
let initialized = false, keyboardDown = false, cursor = { x: .5, y: .19 }, previousFocus = null;
const ui = {};
const $ = id => document.getElementById(`zoo-${id}`);
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function shapeIcon(target) {
    // These paths are the actual learning geometry, shared with the tracing guide.
    const d = shape.points.map((p, i) => `${i ? 'L' : 'M'}${p.x * 100},${p.y * 100}`).join(' ');
    target.innerHTML = `<svg viewBox="0 0 100 100" focusable="false"><path d="${d}" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function feedback(text, tone = '') { ui.feedback.textContent = text; ui.feedback.dataset.tone = tone; }
function controls() {
    const drawing = state.status === 'drawing';
    ui.submit.disabled = !drawing;
    ui.clear.disabled = !drawing;
    ui.pause.disabled = !['drawing', 'delivering', 'reaction', 'ending'].includes(state.status);
    ui.canvas.setAttribute('aria-disabled', String(!drawing));
}
function hud() {
    ui.score.textContent = state.score;
    ui.lives.textContent = '♥'.repeat(state.lives) + '♡'.repeat(3 - state.lives);
    ui.lives.setAttribute('aria-label', `생명 ${state.lives}개`);
    ui.round.textContent = `ROUND ${String(state.round).padStart(2, '0')}`;
    controls();
}
function timer() {
    ui.seconds.textContent = (remaining / 1000).toFixed(1);
    ui['time-fill'].style.width = `${remaining / duration * 100}%`;
    ui.timer.dataset.urgent = String(remaining <= 4000);
    ui.timer.setAttribute('aria-valuenow', String(Math.ceil(remaining / 1000)));
    ui.timer.setAttribute('aria-valuemax', String(duration / 1000));
}
function mood(value) {
    ui.lion.dataset.mood = value;
    ui.habitat.dataset.mood = value;
    ui.lion.setAttribute('aria-label', value === 'happy' ? '과자를 먹고 만족하는 사자' : value === 'angry' ? '마음에 들지 않아 화난 사자' : '과자를 기다리는 사자');
}
function drawPath(ctx, points, scale) {
    if (!points.length) return;
    ctx.beginPath(); ctx.moveTo(points[0].x * scale, points[0].y * scale);
    for (const p of points.slice(1)) ctx.lineTo(p.x * scale, p.y * scale);
    ctx.stroke();
}
function drawBoard() {
    const ctx = ui.canvas.getContext('2d');
    const size = ui.canvas.width;
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = size * .052; ctx.strokeStyle = '#edf0e8'; ctx.setLineDash([]);
    drawPath(ctx, shape.points, size);
    ctx.lineWidth = size * .006; ctx.strokeStyle = '#96aaa1'; ctx.setLineDash([size * .012, size * .019]);
    drawPath(ctx, shape.points, size);
    ctx.setLineDash([]); ctx.lineWidth = size * .016; ctx.strokeStyle = '#d98632';
    for (const stroke of strokes) drawPath(ctx, stroke, size);
    if (document.activeElement === ui.canvas && pointerId === null) {
        ctx.beginPath(); ctx.arc(cursor.x * size, cursor.y * size, size * .013, 0, Math.PI * 2);
        ctx.fillStyle = keyboardDown ? '#d98632' : '#286657'; ctx.fill();
    }
}
function resizeBoard() {
    const rect = ui.canvas.getBoundingClientRect();
    if (!rect.width) return;
    const size = Math.round(rect.width * Math.min(window.devicePixelRatio || 1, 2));
    if (ui.canvas.width !== size) ui.canvas.width = ui.canvas.height = size;
    drawBoard();
}
function releasePen() {
    const captured = pointerId;
    pointerId = null; activeStroke = null; keyboardDown = false;
    if (captured !== null && ui.canvas.hasPointerCapture?.(captured)) ui.canvas.releasePointerCapture(captured);
}
function addPoint(p) {
    if (!activeStroke) return;
    const last = activeStroke[activeStroke.length - 1];
    if (last && Math.hypot(p.x - last.x, p.y - last.y) < .002) return;
    if (strokes.reduce((sum, stroke) => sum + stroke.length, 0) >= 6000) { overflow = true; return; }
    activeStroke.push(p); drawBoard();
}
function pointerPoint(event) {
    const r = ui.canvas.getBoundingClientRect();
    return { x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height };
}
function beginPointer(event) {
    if (state.status !== 'drawing' || pointerId !== null || keyboardDown || !event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); pointerId = event.pointerId;
    ui.canvas.setPointerCapture(pointerId);
    activeStroke = []; strokes.push(activeStroke); addPoint(pointerPoint(event));
    ui['board-hint'].textContent = '좋아요! 점선을 끝까지 이어 주세요';
}
function movePointer(event) {
    if (state.status !== 'drawing' || event.pointerId !== pointerId) return;
    event.preventDefault();
    const samples = event.getCoalescedEvents?.();
    for (const sample of samples?.length ? samples : [event]) addPoint(pointerPoint(sample));
}
function endPointer(event) {
    if (event.pointerId !== pointerId) return;
    if (event.type === 'pointerup' && state.status === 'drawing') addPoint(pointerPoint(event));
    releasePen();
}
function keyboard(event) {
    if (state.status !== 'drawing' || pointerId !== null) return;
    if (event.key === 'Enter') { event.preventDefault(); submit(); return; }
    if (event.code === 'Space') {
        event.preventDefault(); if (event.repeat) return;
        keyboardDown = !keyboardDown;
        if (keyboardDown) { activeStroke = [{ ...cursor }]; strokes.push(activeStroke); }
        else activeStroke = null;
        drawBoard(); return;
    }
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
    if (!delta) return;
    event.preventDefault(); const step = event.shiftKey ? .04 : .012;
    cursor = { x: Math.max(0, Math.min(1, cursor.x + delta[0] * step)), y: Math.max(0, Math.min(1, cursor.y + delta[1] * step)) };
    if (keyboardDown) addPoint({ ...cursor });
    else drawBoard();
}
function clearDrawing() {
    if (state.status !== 'drawing') return;
    releasePen(); strokes = []; overflow = false; drawBoard();
    feedback('다시 그려 봐요. 남은 시간은 그대로예요.');
}
function startFrame() { cancelAnimationFrame(frame); lastTime = performance.now(); frame = requestAnimationFrame(tick); }
function nextRound(first = false) {
    releasePen(); strokes = []; overflow = false;
    if (first) {
        shape = starterShape;
        // First introduce the three familiar shapes, then show every other shape.
        shapeQueue = [ZOO_SHAPES.find(item => item.id === 'triangle'), ZOO_SHAPES.find(item => item.id === 'square'),
            ...createZooShapeDeck().filter(item => !['circle', 'triangle', 'square'].includes(item.id))];
    } else {
        if (!shapeQueue.length) shapeQueue = createZooShapeDeck(shape.id);
        shape = shapeQueue.shift();
    }
    state.status = 'drawing'; elapsed = 0; duration = getDrawingDuration(state.score); remaining = duration;
    cursor = { ...shape.points[0] }; mood('neutral'); ui.reward.textContent = ''; ui.cookie.hidden = true;
    ui.wish.textContent = '이 모양 과자가 먹고 싶어!';
    ui['request-name'].textContent = shape.name; shapeIcon(ui['request-shape']);
    ui['board-label'].textContent = shape.name === shape.friendly ? shape.name : `${shape.name} · ${shape.friendly}`;
    ui['board-hint'].textContent = '어디서 시작해도 좋아요';
    ui['timer-caption'].textContent = '그릴 수 있는 시간';
    feedback(`“${shape.name}”의 점선을 따라 그리고 완료를 눌러요.`);
    hud(); timer(); resizeBoard();
}
function drawCookie() {
    const ctx = ui.cookie.getContext('2d'); ctx.clearRect(0, 0, 160, 160);
    ctx.beginPath(); ctx.arc(80, 80, 69, 0, Math.PI * 2); ctx.fillStyle = '#ecc27e'; ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = '#b77b37'; ctx.stroke();
    ctx.beginPath(); ctx.arc(80, 80, 57, 0, Math.PI * 2); ctx.lineWidth = 2; ctx.strokeStyle = '#d7a453'; ctx.stroke();
    ctx.save(); ctx.translate(16, 16); ctx.lineWidth = 5; ctx.strokeStyle = '#855125'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // The cookie carries the child's submitted picture, including imperfect attempts.
    for (const stroke of strokes) drawPath(ctx, stroke, 128);
    ctx.restore();
}
function submit(expired = false) {
    if (state.status !== 'drawing') return;
    // Account for time since the last frame, so a click after the deadline cannot win.
    remaining = Math.max(0, remaining - Math.max(0, performance.now() - lastTime));
    lastTime = performance.now(); timedOut = expired || remaining <= 0;
    releasePen(); verdict = overflow ? { passed: false, reason: 'scribble' } : evaluateZooTrace(shape, strokes);
    if (timedOut) verdict = { ...verdict, passed: false, reason: 'timeout' };
    state.status = 'delivering'; elapsed = 0; controls(); timer();
    ui['timer-caption'].textContent = '이번 도형 그리기 끝!';
    feedback(timedOut ? '시간이 다 됐어요! 레오가 기다리고 있어요.' : '내가 그린 도형 과자가 레오에게 가요!');
    drawCookie();
    const start = ui.submit.getBoundingClientRect(), end = ui.lion.getBoundingClientRect();
    flight = { x: start.left + start.width / 2 - 45, y: start.top - 50, dx: end.left + end.width / 2 - start.left - start.width / 2, dy: end.top + end.height * .55 - start.top + 5 };
    ui.cookie.style.left = `${flight.x}px`; ui.cookie.style.top = `${flight.y}px`;
    ui.cookie.style.transform = 'translate(0, 0)'; ui.cookie.hidden = timedOut;
    ui.cookie.style.opacity = '1';
}
function react() {
    ui.cookie.hidden = true; state = resolveZooRound(state, verdict.passed);
    if (state.status === 'gameover') state.status = 'ending';
    elapsed = 0; mood(verdict.passed ? 'happy' : 'angry');
    ui.reward.textContent = verdict.passed ? '맛있다! +1' : '생명 −1';
    ui.reward.dataset.tone = verdict.passed ? 'success' : 'danger';
    ui.wish.textContent = verdict.passed ? '냠냠! 내가 원하던 모양이야!' : timedOut ? '어흥! 너무 오래 기다렸어!' : '어흥! 이 모양이 아닌데!';
    const help = verdict.reason === 'incomplete' || verdict.reason === 'empty' ? '점선을 빠짐없이 끝까지 이어 주세요.' : verdict.reason === 'scribble' ? '점선을 한 번만 따라 그려 주세요.' : '점선 가까이에서 천천히 그려 주세요.';
    feedback(verdict.passed ? '레오가 만족했어요! 과자 1개를 완성했어요.' : timedOut ? '시간 초과! 생명이 1개 줄었어요.' : `모양이 아쉬워요! ${help}`, verdict.passed ? 'success' : 'danger');
    hud();
}
function tick(now) {
    const delta = Math.max(0, now - lastTime); lastTime = now;
    if (state.status === 'drawing') {
        remaining = Math.max(0, remaining - delta); timer();
        if (remaining <= 0) submit(true);
    } else if (state.status === 'delivering') {
        elapsed += delta;
        const progress = Math.min(1, elapsed / 720);
        if (flight && !timedOut) ui.cookie.style.transform = `translate(${flight.dx * progress}px, ${flight.dy * progress - (reducedMotion() ? 0 : Math.sin(progress * Math.PI) * 95)}px) rotate(${reducedMotion() ? 0 : progress * -25}deg) scale(${1 - progress * .35})`;
        if (progress >= 1) react();
    } else if (state.status === 'reaction' || state.status === 'ending') {
        elapsed += delta;
        if (elapsed >= 1600) {
            if (state.status === 'ending') { gameOver(); return; }
            state.round += 1; nextRound();
        }
    } else return;
    frame = requestAnimationFrame(tick);
}
function overlay(title, copy, button, eyebrow) {
    releasePen(); controls(); ui.overlay.hidden = false;
    ui['overlay-title'].textContent = title; ui['overlay-copy'].textContent = copy;
    ui['overlay-eyebrow'].textContent = eyebrow; ui.start.textContent = button;
    ui['overlay-chips'].hidden = state.status !== 'ready';
    ui.main.inert = true; ui.header.inert = true;
    ui.start.focus();
}
function hideOverlay() { ui.overlay.hidden = true; ui.main.inert = false; ui.header.inert = false; }
function gameOver() {
    state.status = 'gameover'; controls();
    overlay(`도형 과자 ${state.score}개 완성!`, state.score ? `레오와 ${state.round}번째 간식 시간까지 함께했어요. 다시 도전해서 더 많은 도형 과자를 만들어 볼까요?` : '괜찮아요! 점선을 천천히 따라가면 만들 수 있어요. 레오가 다시 기다릴게요.', '다시 도전하기', 'GREAT LITTLE ZOOKEEPER');
}
function start() {
    if (document.hidden) return;
    if (state.status === 'paused') { resume(); return; }
    if (!['ready', 'gameover'].includes(state.status)) return;
    state = createZooState(); hideOverlay(); nextRound(true); startFrame(); ui.canvas.focus({ preventScroll: true });
}
function pause() {
    if (!['drawing', 'delivering', 'reaction', 'ending'].includes(state.status)) return;
    if (state.status === 'drawing') { remaining = Math.max(0, remaining - (performance.now() - lastTime)); timer(); }
    pausedStatus = state.status; state.status = 'paused'; cancelAnimationFrame(frame); frame = 0;
    overlay('잠깐 쉬어 가요', '그림과 남은 시간은 그대로예요. 준비되면 레오와 간식 시간을 이어 가요.', '이어서 하기', 'TAKE A LITTLE BREAK');
}
function resume() {
    if (state.status !== 'paused' || document.hidden) return;
    state.status = pausedStatus; pausedStatus = ''; hideOverlay(); controls(); startFrame(); ui.canvas.focus({ preventScroll: true });
}
function initialize() {
    if (initialized || !section) return;
    section.innerHTML = markup;
    for (const id of ['home','pause','score','lives','round','wish','request-shape','request-name','lion','reward','timer-caption','seconds','timer','time-fill','canvas','board-label','board-hint','feedback','clear','submit','overlay','overlay-title','overlay-copy','overlay-eyebrow','overlay-chips','start','overlay-home','cookie']) ui[id] = $(id);
    ui.main = section.querySelector('.zoo-main'); ui.header = section.querySelector('.zoo-header'); ui.habitat = section.querySelector('.zoo-habitat');
    ui.start.addEventListener('click', start); ui.pause.addEventListener('click', pause);
    ui.home.addEventListener('click', close); ui['overlay-home'].addEventListener('click', close);
    ui.clear.addEventListener('click', clearDrawing); ui.submit.addEventListener('click', () => submit());
    ui.canvas.addEventListener('pointerdown', beginPointer); ui.canvas.addEventListener('pointermove', movePointer);
    for (const event of ['pointerup','pointercancel','lostpointercapture']) ui.canvas.addEventListener(event, endPointer);
    ui.canvas.addEventListener('keydown', keyboard);
    ui.canvas.addEventListener('blur', () => { releasePen(); drawBoard(); });
    section.addEventListener('keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); if (state.status !== 'paused') pause(); else resume(); }
        if (event.key === 'Tab' && !ui.overlay.hidden) {
            if (event.shiftKey && document.activeElement === ui.start) { event.preventDefault(); ui['overlay-home'].focus(); }
            else if (!event.shiftKey && document.activeElement === ui['overlay-home']) { event.preventDefault(); ui.start.focus(); }
        }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    window.addEventListener('pagehide', event => { if (event.persisted) pause(); else stop(); });
    resizeObserver = new ResizeObserver(resizeBoard);
    initialized = true;
}
function stop() {
    cancelAnimationFrame(frame); frame = 0;
    if (!initialized) return;
    releasePen(); resizeObserver.disconnect(); state = { ...createZooState(), status: 'closed' };
    strokes = []; shapeQueue = []; flight = null; verdict = null; pausedStatus = ''; ui.cookie.hidden = true;
    ui.main.inert = false; ui.header.inert = false; controls();
}
function open() {
    initialize(); if (!initialized) return;
    previousFocus = document.activeElement; stop();
    window.closeAiedueKoreanModal?.();
    if (window.showAiedueTopLevelSection) window.showAiedueTopLevelSection('shape-zoo-game-section');
    else { section.classList.remove('hidden'); section.style.display = 'flex'; document.body.classList.add('shape-zoo-open'); }
    state = createZooState(); shape = starterShape; remaining = duration = getDrawingDuration(0);
    mood('neutral'); hud(); timer(); shapeIcon(ui['request-shape']);
    ui['request-name'].textContent = shape.name; ui['board-label'].textContent = shape.name;
    ui.wish.textContent = '이 모양 과자가 먹고 싶어!'; ui.reward.textContent = '';
    ui['timer-caption'].textContent = '그릴 수 있는 시간'; ui['board-hint'].textContent = '어디서 시작해도 좋아요';
    feedback('준비되면 시작 버튼을 눌러 주세요.');
    resizeObserver.observe(ui.canvas); resizeBoard();
    overlay('레오의 간식을 만들어 볼까요?', '말풍선 속 도형을 점선 따라 그리고 완료를 눌러요. 잘 그리면 과자 +1개! 모양이 다르거나 시간이 지나면 생명이 1개 줄어요.', '게임 시작 →', 'WELCOME TO SHAPE ZOO');
}
function close() {
    stop(); document.body.classList.remove('shape-zoo-open');
    if (section.hasAttribute('data-standalone')) { window.location.href = 'index.html'; return; }
    window.showAiedueTopLevelSection?.('dashboard-section'); window.openAiedueLab?.();
    if (previousFocus?.isConnected) previousFocus.focus();
}
window.openShapeZooGame = open;
window.stopShapeZooGame = stop;
window.closeShapeZooGame = close;
if (section?.hasAttribute('data-standalone')) open();
