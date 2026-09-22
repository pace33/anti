import { installTeacherTutorial } from './teacher-tutorial.js?v=20260915-real-stage-tour-v5';
import { buildStageTutorial, STAGE_TUTORIALS } from './stage-tutorial-core.mjs?v=20260922-writing-game-v1';

export function installStageTutorial(actions, level, role) {
    const steps = buildStageTutorial(level, role);
    let state, dialog, mountedStep = '', completed = false, pointer = null, moved = false, fitPasses = 0;
    const inertNodes = new Map();
    const release = () => { inertNodes.forEach((value, node) => { node.inert = value; }); inertNodes.clear(); };
    const allowed = () => state?.busy ? [] : [...(state?.step.interact || []), ...(state?.step.allow || []), ...(state?.step.press ? [state.step.press] : [])];
    const matches = (node, selectors) => node instanceof Element && selectors.some(selector => node.closest(selector));
    function restrict() {
        release();
        if (state?.busy) return;
        const nodes = allowed().flatMap(selector => [...document.querySelectorAll(selector)]).filter(node => node.getClientRects().length);
        nodes.push(dialog);
        function walk(parent) {
            for (const child of parent.children) {
                if (!(child instanceof HTMLElement) || ['SCRIPT', 'STYLE', 'LINK'].includes(child.tagName)) continue;
                if (nodes.includes(child)) continue;
                if (nodes.some(node => child.contains(node))) walk(child);
                else { inertNodes.set(child, child.inert); child.inert = true; }
            }
        }
        walk(document.body);
    }
    function keepTargetVisible() {
        if (state?.busy || fitPasses++ >= 6) return;
        const node = document.querySelector(state.step.press || state.step.targets[0] || '#main-container');
        if (!node) return;
        const bubbleTop = dialog.querySelector('.teacher-tour-bubble').getBoundingClientRect().top;
        for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
            if (!/(auto|scroll)/.test(getComputedStyle(parent).overflowY) || parent.scrollHeight <= parent.clientHeight) continue;
            const box = parent.getBoundingClientRect(), r = node.getBoundingClientRect();
            const top = Math.max(12, box.top + 10), bottom = Math.min(bubbleTop - 16, box.bottom - 10);
            if (bottom <= top) continue;
            let delta = 0;
            if (r.top < top) delta = r.top - top;
            else if (r.bottom > bottom) delta = r.height > bottom-top ? r.top-top : r.bottom-bottom;
            if (Math.abs(delta) > 2) parent.scrollTop += delta;
        }
    }
    function finishInteraction() {
        completed = true;
        const button = dialog.querySelector('.stage-tour-continue');
        button.disabled = false;
        dialog.querySelector('.teacher-tour-hint').textContent = '직접 해 봤어요. 더 둘러본 뒤 계속해도 좋아요.';
    }
    function guard(event) {
        if (!state?.active || !event.isTrusted) return;
        if (dialog.contains(event.target)) return;
        if (!matches(event.target, allowed())) { event.preventDefault(); event.stopImmediatePropagation(); }
    }
    function observe(event) {
        if (!state?.active || state.busy || !state.step.interact) return;
        if (event.type === 'pointerup' && pointer?.id === event.pointerId) {
            if (moved && state.step.event === 'stroke') finishInteraction();
            pointer = null; return;
        }
        if (event.type === 'pointercancel') { pointer = null; return; }
        if (!matches(event.target, state.step.interact)) return;
        if (state.step.event === 'stroke') {
            if (event.type === 'pointerdown') { pointer = { id: event.pointerId, x: event.clientX, y: event.clientY }; moved = false; }
            if (event.type === 'pointermove' && pointer?.id === event.pointerId && Math.hypot(event.clientX-pointer.x, event.clientY-pointer.y) > 12) moved = true;
        } else if (event.type === state.step.event) finishInteraction();
    }
    function keydown(event) {
        if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); tutorial.stop(); return; }
        if (event.key !== 'Tab') return;
        const focusable = [...document.querySelectorAll('button, input, textarea, select, a[href], [tabindex]')]
            .filter(node => !node.closest('[inert]') && !node.disabled && node.tabIndex >= 0 && node.getClientRects().length);
        const index = focusable.indexOf(document.activeElement);
        if (focusable.length && (index < 0 || (!event.shiftKey && index === focusable.length-1) || (event.shiftKey && index === 0))) {
            event.preventDefault(); focusable[event.shiftKey ? focusable.length-1 : 0].focus();
        }
    }
    const events = ['click', 'input', 'change', 'pointerdown', 'pointermove', 'pointerup', 'pointercancel'];
    const tutorial = installTeacherTutorial({
        ...actions,
        capture() {
            document.body.classList.add('stage-tour-open');
            events.forEach(type => { document.addEventListener(type, guard, true); document.addEventListener(type, observe); });
            document.addEventListener('keydown', keydown, true);
            return actions.capture();
        },
        async prepare(step, uid) { release(); await actions.prepare(step, uid); },
        async activate(action, uid) {
            if (action === 'explore' && !completed) throw new Error('밝은 화면에서 먼저 직접 해 보세요.');
            release(); await actions.activate(action, uid);
        },
        restore(snapshot, result) {
            state = null; release(); actions.stopSpeech();
            events.forEach(type => { document.removeEventListener(type, guard, true); document.removeEventListener(type, observe); });
            document.removeEventListener('keydown', keydown, true);
            document.body.classList.remove('stage-tour-open'); actions.restore(snapshot, result);
        }
    }, {
        interactive: true, id: 'stage-tutorial', title: `${level}단계 ${STAGE_TUTORIALS[level].name} · ${role === 'teacher' ? '선생님' : '학생'} 안내`, steps,
        layout() { restrict(); keepTargetVisible(); },
        render(nextState, element, activate) {
            state = nextState; dialog = element;
            let listen = dialog.querySelector('.stage-tour-listen');
            if (!listen) {
                listen = document.createElement('button'); listen.type = 'button'; listen.className = 'stage-tour-listen'; listen.textContent = '🔊 안내 듣기';
                dialog.querySelector('.teacher-tour-bubble header strong').after(listen);
                const done = document.createElement('button'); done.type = 'button'; done.className = 'stage-tour-continue'; done.textContent = '체험 마치고 계속';
                done.onclick = () => { if (completed) void activate('explore'); };
                dialog.querySelector('.teacher-tour-next').after(done);
            }
            if (mountedStep !== state.step.id) { mountedStep = state.step.id; completed = false; pointer = null; fitPasses = 0; }
            listen.disabled = state.busy; listen.onclick = () => void actions.speak(state.step.text);
            const interactive = Boolean(state.step.interact);
            dialog.querySelector('.teacher-tour-next').hidden = interactive;
            const done = dialog.querySelector('.stage-tour-continue'); done.hidden = !interactive; done.disabled = !completed || state.busy;
            if (interactive) dialog.querySelector('.teacher-tour-hint').textContent = completed ? '더 해 본 뒤 계속해도 좋아요.' : state.step.event === 'stroke' ? '밝은 실제 그림판에 선을 그어 보세요.' : '밝은 실제 버튼을 직접 눌러 보세요.';
        }
    });
    return tutorial;
}
