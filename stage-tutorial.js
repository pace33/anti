import { installTeacherTutorial } from './teacher-tutorial.js?v=20260915-stage-guides-v4';
import { buildStageTutorial, STAGE_TUTORIALS, TUTORIAL_PASSAGE, isTutorialAnswer, isTutorialWord, tracePoints, nearPoint } from './stage-tutorial-core.mjs';

export function installStageTutorial(actions, level, role) {
    const steps = buildStageTutorial(level, role);
    let panel, mountedStep = '', stopExercise = () => {};
    function clear() { stopExercise(); stopExercise = () => {}; panel?.remove(); panel = null; mountedStep = ''; actions.stopSpeech(); }
    const tutorial = installTeacherTutorial({
        ...actions,
        capture() { document.body.classList.add('stage-tour-open'); return actions.capture(); },
        restore(snapshot, result) { clear(); document.body.classList.remove('stage-tour-open'); actions.restore(snapshot, result); }
    }, {
        id: 'stage-tutorial', title: `${level}단계 ${STAGE_TUTORIALS[level].name} · ${role === 'teacher' ? '선생님' : '학생'} 안내`, steps,
        render(state, dialog, activate) {
            let listen = dialog.querySelector('.stage-tour-listen');
            if (!listen) {
                listen = document.createElement('button'); listen.type = 'button'; listen.className = 'stage-tour-listen'; listen.textContent = '🔊 안내 듣기';
                dialog.querySelector('.teacher-tour-bubble header strong').after(listen);
            }
            listen.disabled = state.busy;
            listen.onclick = () => void actions.speak(state.step.text);
            if (panel) panel.inert = state.busy;
            if (state.busy) return;
            if (mountedStep === state.step.id) return;
            clear(); mountedStep = state.step.id;
            if (!state.step.practice) return;
            panel = document.createElement('section'); panel.className = 'stage-tour-practice';
            panel.setAttribute('aria-label', '함께 해보기');
            panel.innerHTML = `<header><strong tabindex="-1">함께 해보기</strong><small>예시 연습 · 기록과 포인트에 반영되지 않아요</small></header><div class="stage-tour-exercise"></div><p class="stage-tour-feedback" role="status" aria-live="polite"></p><button type="button" class="stage-tour-continue" hidden>연습 마치고 계속</button>`;
            dialog.querySelector('.teacher-tour-guide').appendChild(panel);
            const next = panel.querySelector('.stage-tour-continue');
            next.onclick = () => void activate('practice');
            stopExercise = mountExercise(panel, state.step.practice, role, actions);
            panel.querySelector('header strong').focus({ preventScroll: true });
        }
    });
    return tutorial;
}

function mountExercise(panel, kind, role, actions) {
    const area = panel.querySelector('.stage-tour-exercise'), feedback = panel.querySelector('.stage-tour-feedback');
    const next = panel.querySelector('.stage-tour-continue');
    let disposed = false, solved = false;
    const complete = message => {
        if (disposed) return;
        solved = true; feedback.textContent = message; feedback.dataset.correct = 'true'; next.hidden = false;
    };
    const hint = message => { if (!solved) { feedback.textContent = message; feedback.dataset.correct = 'false'; } };
    const button = (text, handler, parent = area) => {
        const node = document.createElement('button'); node.type = 'button'; node.textContent = text; node.onclick = handler; parent.appendChild(node); return node;
    };
    const text = (value, className = '') => { const node = document.createElement('p'); node.textContent = value; node.className = className; area.appendChild(node); return node; };
    const speak = phrase => button('🔊 소리 듣기', async () => {
        const ok = await actions.speak(phrase);
        if (!disposed && ok === false) hint('소리가 들리지 않으면 화면의 글자를 보고 연습해도 괜찮아요.');
    });
    const choices = (values, correctText, wrongText) => {
        const group = document.createElement('div'); group.className = 'stage-tour-choices'; area.appendChild(group);
        values.forEach(value => button(value, event => {
            if (solved) return;
            if (isTutorialAnswer(kind, value)) { event.currentTarget.classList.add('is-correct'); complete(correctText); }
            else hint(wrongText);
        }, group));
    };
    if (kind === 'trace-line' || kind === 'trace-letter') {
        text(kind === 'trace-line' ? '초록 점에서 시작해 선을 따라가요.' : 'ㄱ: 오른쪽으로, 그다음 아래로 내려가요.');
        const points = tracePoints(kind), d = points.map((p, i) => `${i ? 'L' : 'M'}${p.join(' ')}`).join(' ');
        const samples = [points[0]];
        for (let i = 1; i < points.length; i++) {
            const from = points[i-1], to = points[i], count = Math.ceil(Math.hypot(to[0]-from[0], to[1]-from[1]) / 18);
            for (let j = 1; j <= count; j++) samples.push([from[0]+(to[0]-from[0])*j/count, from[1]+(to[1]-from[1])*j/count]);
        }
        const canvas = document.createElement('div'); canvas.className = 'stage-tour-trace';
        canvas.innerHTML = `<svg viewBox="0 0 360 205" role="img" aria-label="${kind === 'trace-line' ? '가로선' : 'ㄱ'} 따라 그리기"><path d="${d}" fill="none" stroke="#d9dfeb" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/><path class="trace-ink" fill="none" stroke="#668e42" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${points[0][0]}" cy="${points[0][1]}" r="12" fill="#83bc58"/>${points.slice(1).map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="7" fill="#8b9bb5"/>`).join('')}</svg>`;
        area.appendChild(canvas);
        const svg = canvas.querySelector('svg'), ink = canvas.querySelector('.trace-ink');
        let cursor = 0, pointer = null, last = null, path = '';
        const position = event => { const r = svg.getBoundingClientRect(); return [(event.clientX-r.left)*360/r.width, (event.clientY-r.top)*205/r.height]; };
        svg.onpointerdown = event => {
            if (solved || pointer !== null) return;
            const p = position(event);
            if (!nearPoint(p, points[0])) { hint('초록 시작점에 손가락이나 펜을 대고 시작해요.'); return; }
            event.preventDefault(); pointer = event.pointerId; svg.setPointerCapture(pointer); cursor = 1; last = p;
            path = `M${p.join(' ')}`; ink.setAttribute('d', path); feedback.textContent = '';
        };
        svg.onpointermove = event => {
            if (pointer !== event.pointerId || solved) return;
            const p = position(event), count = Math.max(1, Math.ceil(Math.hypot(p[0]-last[0], p[1]-last[1])/8));
            for (let i = 1; i <= count; i++) {
                const q = [last[0]+(p[0]-last[0])*i/count, last[1]+(p[1]-last[1])*i/count];
                while (cursor < samples.length && nearPoint(q, samples[cursor], 23)) cursor++;
            }
            path += ` L${p.join(' ')}`; ink.setAttribute('d', path); last = p;
        };
        svg.onpointerup = event => {
            if (pointer !== event.pointerId) return;
            pointer = null;
            if (cursor === samples.length && nearPoint(position(event), points.at(-1))) complete(role === 'teacher' ? '방향을 따라 끝까지 그렸습니다. 학생에게도 구체적으로 무엇을 해냈는지 말해 주세요.' : '시작점에서 끝까지 잘 이어 갔어! 천천히 다시 해 봐도 좋아.');
            else hint('잘 시작했어요. 초록 점에서 다시 출발해 회색 길 끝까지 이어 볼까요?');
        };
        svg.onpointercancel = () => { pointer = null; hint('손을 다시 대고 초록 점부터 시작해요.'); };
        button('다시 그리기', () => {
            solved = false; pointer = null; checkpoint = 0; cursor = 0; ink.setAttribute('d', ''); feedback.textContent = ''; next.hidden = true;
            alternative.querySelectorAll('button').forEach(node => { node.disabled = false; });
        });
        const alternative = document.createElement('div'); alternative.className = 'stage-tour-choices'; alternative.hidden = true; area.appendChild(alternative);
        let checkpoint = 0;
        button('점으로 따라가기', () => { alternative.hidden = false; });
        points.forEach((p, index) => button(`${index+1}번 점${index === 0 ? ' · 시작' : ''}`, event => {
            if (solved) return;
            if (index !== checkpoint) { hint(`${checkpoint+1}번 점을 먼저 눌러요.`); return; }
            event.currentTarget.disabled = true; checkpoint++;
            ink.setAttribute('d', points.slice(0,checkpoint).map((q,i)=>`${i?'L':'M'}${q.join(' ')}`).join(' '));
            if (checkpoint === points.length) complete('시작과 방향을 차례대로 따라갔어요! 실제 활동에서는 펜이나 손가락으로도 시도해 봐요.');
        }, alternative));
    } else if (kind === 'triangle') {
        text('1 → 2 → 3 → 1 순서로 세모를 닫아요.');
        area.insertAdjacentHTML('beforeend', '<div class="stage-tour-triangle"><svg viewBox="0 0 300 170" aria-hidden="true"><path d="M150 25 L35 145 L265 145 Z" fill="#f0e8ff" stroke="#b9a0dc" stroke-width="5" stroke-dasharray="9 8"/></svg></div>');
        let index = 0; const sequence = [1,2,3,1], group = area.querySelector('.stage-tour-triangle');
        [1,2,3].forEach(n => { const node = button(String(n), () => {
            if (solved) return;
            if (n !== sequence[index]) { hint(`이번에는 ${sequence[index]}번 점으로 가요.`); return; }
            index++; feedback.textContent = `${sequence.slice(0,index).join(' → ')} 연결했어요.`;
            if (index === sequence.length) { group.classList.add('is-complete'); complete('세 변을 이어 세모를 완성했어요. 마지막에 시작점으로 돌아오면 모양이 닫혀요!'); }
        }, group); node.dataset.point = String(n); node.setAttribute('aria-label', `${n}번 꼭짓점`); });
    } else if (kind === 'sound') {
        text('ㄱ + ㅏ = 가', 'stage-tour-big-word'); speak('가');
        choices(['나','가','고'], '‘가’를 찾았어요! ㄱ과 ㅏ가 만나 ‘가’가 돼요.', '모양을 다시 봐요. ㄱ과 ㅏ가 함께 있는 글자는 무엇일까요?');
    } else if (kind === 'collect') {
        text('예시 노트: 오늘은 사과를 먹었어요. 가방에 책을 넣었어요.', 'stage-tour-passage');
        choices(['가방','책','사과'], '사과는 먹을 수 있는 과일이에요. 이제 소리와 글자를 연결해 볼게요.', '먹을 수 있는 과일을 찾아요. 노트를 다시 읽어 봐요.');
    } else if (kind === 'build' || kind === 'write') {
        text('🍎 사과', 'stage-tour-big-word'); speak('사과');
        const input = document.createElement('input'); input.type = 'text'; input.maxLength = 12; input.autocomplete = 'off'; input.setAttribute('aria-label', '사과 낱말 입력'); input.readOnly = kind === 'build'; area.appendChild(input);
        const group = document.createElement('div'); group.className = 'stage-tour-choices'; area.appendChild(group);
        ['과','사','가'].forEach(syllable => button(syllable, () => { if (!solved) input.value += syllable; }, group));
        button('다시 만들기', () => { solved = false; input.value = ''; feedback.textContent = ''; next.hidden = true; }, group);
        const check = () => {
            if (solved) return;
            if (isTutorialWord(input.value)) complete('사 + 과, 사과를 완성했어요! 이제 “나는 사과를 먹어요”처럼 문장으로도 말해 보세요.');
            else hint('그림의 이름을 천천히 말해요. ‘사’ 다음 ‘과’예요. 다시 만들기를 눌러 고쳐 봐요.');
        };
        button('확인하기', check); input.onkeydown = event => { if (event.key === 'Enter' && !event.isComposing) check(); };
    } else {
        text(TUTORIAL_PASSAGE.join(' '), 'stage-tour-passage');
        if (kind === 'read') {
            speak(TUTORIAL_PASSAGE.join(' ')); button('글을 읽었어요', () => complete('좋아요. 이제 글에서 답과 근거를 찾아볼게요.'));
        } else if (kind === 'literal') {
            text('지우는 무엇을 챙겼나요?'); choices(['모자','장갑','우산'], '“우산을 챙겨”라는 부분에서 답을 찾았어요.', '두 번째 문장을 다시 읽어요. 무엇을 챙겼다고 했나요?');
        } else if (kind === 'infer') {
            text('지우는 왜 우산을 챙겼을까요?'); choices(['눈이 와서','비가 와서','그림을 그리려고'], '빗방울을 보았다는 단서와 우산을 연결했어요!', '첫 문장의 날씨 단서를 찾아요. 창밖에 무엇이 보였나요?');
        } else if (kind === 'evidence') {
            text('비가 와서 우산을 챙겼다고 생각한 근거는?'); choices(TUTORIAL_PASSAGE, '빗방울을 보았다는 문장이 근거예요. “빗방울이 보여서 비가 오는 줄 알았어요”라고 설명할 수 있어요.', '날씨를 알려 주는 말이 있는 문장을 찾아요.');
        }
    }
    return () => { disposed = true; };
}
