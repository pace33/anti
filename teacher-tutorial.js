import { createTeacherTutorialController, TEACHER_TUTORIAL_STEPS } from './teacher-tutorial-core.mjs?v=20260915-stage-guides-v3';

export function installTeacherTutorial(actions, options = {}) {
    const steps = options.steps || TEACHER_TUTORIAL_STEPS;
    const dialog = document.createElement('dialog');
    dialog.id = options.id || 'teacher-tutorial';
    dialog.className = 'teacher-tutorial';
    dialog.setAttribute('aria-labelledby', `${dialog.id}-title`);
    dialog.setAttribute('aria-modal', 'true');
    dialog.innerHTML = `
        <div class="teacher-tour-shade" aria-hidden="true"></div>
        <div class="teacher-tour-highlights"></div>
        <section class="teacher-tour-guide">
            <img class="teacher-tour-character" src="assets/onboarding/aiedue-wave.webp" alt="안내하는 에이두" width="896" height="1200">
            <div class="teacher-tour-bubble">
                <header><strong id="teacher-tutorial-title">에이두 · 선생님 안내</strong><span class="teacher-tour-progress"></span><button type="button" class="teacher-tour-close" aria-label="교사 튜토리얼 닫기">×</button></header>
                <p class="teacher-tour-line" aria-live="polite"></p>
                <p class="teacher-tour-error" role="alert" hidden></p>
                <footer><span class="teacher-tour-hint"></span><div><button type="button" class="teacher-tour-back">이전</button><button type="button" class="teacher-tour-next">다음</button></div></footer>
            </div>
        </section>`;
    document.body.appendChild(dialog);
    const $ = selector => dialog.querySelector(selector);
    $('#teacher-tutorial-title').id = `${dialog.id}-title`;
    if (options.title) $('.teacher-tour-bubble header strong').textContent = options.title;
    if (options.id) $('.teacher-tour-close').setAttribute('aria-label', '단계 안내 닫기');
    const shade = $('.teacher-tour-shade'), highlights = $('.teacher-tour-highlights');
    const next = $('.teacher-tour-next'), back = $('.teacher-tour-back');
    let view, frame = 0, previousIndex = -1, savedFocus, snapshot, resizeObserver, mutationObserver;
    let missingTimer = 0;

    function raise() {
        if (!controller.state().active) return;
        // Native student/currency dialogs also occupy the top layer. Reinsert the
        // guide last so its dialogue remains above them and they stay inert.
        if (dialog.open) dialog.close();
        dialog.showModal();
        next.focus({ preventScroll: true });
    }
    function roundedHole({ x, y, width, height }, radius = 12) {
        const r = Math.min(radius, width / 2, height / 2), right = x + width, bottom = y + height;
        return `M${x+r},${y}H${right-r}Q${right},${y} ${right},${y+r}V${bottom-r}Q${right},${bottom} ${right-r},${bottom}H${x+r}Q${x},${bottom} ${x},${bottom-r}V${y+r}Q${x},${y} ${x+r},${y}Z`;
    }
    function measureTargets() {
        const width = window.innerWidth, height = window.innerHeight;
        const bubble = $('.teacher-tour-bubble').getBoundingClientRect();
        return (view?.step.targets || []).map(selector => {
            const node = document.querySelector(selector);
            if (!node || !node.getClientRects().length || getComputedStyle(node).visibility === 'hidden') return null;
            const r = node.getBoundingClientRect();
            // Clip highlights to their scroll containers and keep dialogue readable.
            let left = Math.max(4, r.left - 5), top = Math.max(4, r.top - 5);
            let right = Math.min(width - 4, r.right + 5), bottom = Math.min(height - 4, r.bottom + 5);
            bottom = Math.min(bottom, bubble.top - 8);
            for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
                const css = getComputedStyle(parent), box = parent.getBoundingClientRect();
                if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) { top = Math.max(top, box.top); bottom = Math.min(bottom, box.bottom); }
                if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) { left = Math.max(left, box.left); right = Math.min(right, box.right); }
            }
            return right > left + 8 && bottom > top + 8 ? { x: left, y: top, width: right-left, height: bottom-top, node } : null;
        }).filter(Boolean);
    }
    function layout() {
        frame = 0;
        if (!view?.active) return;
        // Use the same inner frame as the HUD, even when the app is centered
        // within a larger browser window. The guide keeps one fixed layout.
        const appFrame = document.getElementById('main-container');
        const bounds = appFrame.getBoundingClientRect(), css = getComputedStyle(appFrame);
        const left = Math.max(0, bounds.left + parseFloat(css.borderLeftWidth));
        const top = Math.max(0, bounds.top + parseFloat(css.borderTopWidth));
        const right = Math.min(window.innerWidth, bounds.right - parseFloat(css.borderRightWidth));
        const bottom = Math.min(window.innerHeight, bounds.bottom - parseFloat(css.borderBottomWidth));
        Object.assign($('.teacher-tour-guide').style, { left: `${left}px`, top: `${top}px`, width: `${right-left}px`, height: `${bottom-top}px` });
        const space = Math.ceil(Math.max($('.teacher-tour-bubble').getBoundingClientRect().height, 194) + 48);
        const value = `${space}px`;
        if (document.body.style.getPropertyValue('--teacher-tour-space') !== value) document.body.style.setProperty('--teacher-tour-space', value);
        const rects = view.busy ? [] : measureTargets();
        const outer = `M0,0H${window.innerWidth}V${window.innerHeight}H0Z`;
        shade.style.clipPath = `path(evenodd, "${outer}${rects.map(r => roundedHole(r)).join('')}")`;
        const targetHadFocus = highlights.contains(document.activeElement);
        highlights.replaceChildren();
        for (const rect of rects) {
            const clickable = Boolean(view.step.click && !view.error);
            const mark = document.createElement(clickable ? 'button' : 'div');
            mark.className = `teacher-tour-highlight${clickable ? ' teacher-tour-target' : ''}`;
            Object.assign(mark.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
            if (clickable) {
                mark.type = 'button'; mark.setAttribute('aria-label', `${view.step.clickLabel} 누르고 계속`);
                mark.onclick = () => void controller.activate(view.step.click);
            } else mark.setAttribute('aria-hidden', 'true');
            highlights.appendChild(mark);
        }
        if (targetHadFocus || (!view.busy && view.step.click && previousIndex !== view.index)) {
            highlights.querySelector('button')?.focus({ preventScroll: true });
        }
        if (!view.busy) previousIndex = view.index;
        const missing = !view.busy && !view.error && rects.length < view.step.targets.length;
        next.disabled = view.busy || Boolean(view.step.click && !view.error) || missing;
        if (missing && !missingTimer) {
            missingTimer = window.setTimeout(() => {
                missingTimer = 0;
                if (view?.active && !view.busy && measureTargets().length < view.step.targets.length) {
                    $('.teacher-tour-error').hidden = false;
                    $('.teacher-tour-error').textContent = '안내할 화면을 불러오지 못했어요. 화면을 다시 불러와 주세요.';
                    next.textContent = '화면 다시 불러오기'; next.disabled = false;
                    next.dataset.retry = 'true';
                }
            }, 5000);
        } else if (!missing) { clearTimeout(missingTimer); missingTimer = 0; }
    }
    function scheduleLayout() { if (!frame) frame = requestAnimationFrame(layout); }
    function render(state) {
        view = state;
        if (!state.active) return;
        dialog.dataset.step = state.step.id;
        document.body.dataset.teacherTourStep = state.step.id;
        $('.teacher-tour-line').textContent = state.step.text;
        $('.teacher-tour-character').src = `assets/onboarding/aiedue-${state.step.pose}.webp`;
        $('.teacher-tour-progress').textContent = `${state.index + 1} / ${steps.length}`;
        $('.teacher-tour-error').hidden = !state.error;
        $('.teacher-tour-error').textContent = state.error;
        next.dataset.retry = state.error ? 'true' : 'false';
        next.textContent = state.busy ? '준비 중…' : state.error ? '다시 시도' : state.index === steps.length - 1 ? '종료' : '다음';
        next.disabled = state.busy || Boolean(state.step.click && !state.error);
        back.disabled = state.busy || state.index === 0;
        $('.teacher-tour-hint').textContent = state.step.practice ? '위에서 함께 연습해 봐요.' : state.step.click ? `밝게 표시된 ‘${state.step.clickLabel}’ 버튼을 눌러주세요.` : '';
        options.render?.(state, dialog, action => controller.activate(action));
        if (!state.busy && previousIndex !== state.index) {
            // Only the tutorial controls can receive keyboard focus; highlighted
            // content is read-only unless this step explicitly offers a proxy.
            if (!state.step.click) next.focus({ preventScroll: true });
        }
        scheduleLayout();
    }
    const controller = createTeacherTutorialController({
        session: actions.session,
        render,
        open() {
            savedFocus = document.activeElement; snapshot = actions.capture(); previousIndex = -1;
            document.body.classList.add('teacher-tour-open');
            document.body.style.setProperty('--teacher-tour-space', '230px');
            dialog.showModal();
            resizeObserver = new ResizeObserver(scheduleLayout);
            resizeObserver.observe($('.teacher-tour-bubble')); resizeObserver.observe(document.getElementById('main-container'));
            mutationObserver = new MutationObserver(records => {
                if (records.some(record => !dialog.contains(record.target))) scheduleLayout();
            });
            mutationObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'open', 'style'] });
            window.addEventListener('resize', scheduleLayout);
            document.addEventListener('scroll', scheduleLayout, true);
        },
        async prepare(step, uid) {
            await actions.prepare(step, uid);
            if (controller.state().active && actions.session() === uid) raise();
        },
        async activate(action, uid) {
            await actions.activate(action, uid);
            if (controller.state().active && actions.session() === uid) raise();
        },
        complete: actions.complete,
        close({ completed }) {
            resizeObserver?.disconnect(); mutationObserver?.disconnect();
            window.removeEventListener('resize', scheduleLayout);
            document.removeEventListener('scroll', scheduleLayout, true);
            cancelAnimationFrame(frame); frame = 0; clearTimeout(missingTimer); missingTimer = 0;
            if (dialog.open) dialog.close();
            view = null; highlights.replaceChildren();
            document.body.classList.remove('teacher-tour-open');
            delete document.body.dataset.teacherTourStep;
            document.body.style.removeProperty('--teacher-tour-space');
            actions.restore(snapshot, { completed });
            if (savedFocus?.isConnected) savedFocus.focus({ preventScroll: true });
        }
    }, steps);
    next.onclick = () => void (next.dataset.retry === 'true' ? controller.retry() : controller.next());
    back.onclick = () => void controller.previous();
    $('.teacher-tour-close').onclick = () => controller.stop();
    dialog.addEventListener('cancel', event => { event.preventDefault(); controller.stop(); });
    return { ...controller, destroy() { controller.stop(); dialog.remove(); } };
}
