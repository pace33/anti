// One accessible comic panel per grading result. It never changes scoring or retry limits.
export function createGradingFeedback(document) {
    let panel, previousFocus, inertSiblings = [];
    function close() {
        if (!panel) return;
        panel.remove(); panel = null;
        inertSiblings.forEach(([node, value]) => { node.inert = value; });
        inertSiblings = [];
        if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus({ preventScroll: true });
    }
    function show(correct, { retry = false, finalAttempt = false, returnFocus } = {}) {
        close();
        previousFocus = returnFocus || document.activeElement;
        panel = document.createElement('div');
        panel.className = `grading-comic-overlay ${correct ? 'is-correct' : 'is-retry'}`;
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'grading-comic-title');
        panel.setAttribute('aria-describedby', 'grading-comic-detail');
        const title = correct ? '정답!' : '앗! 다시 해보자!';
        const detail = correct ? (retry ? '다시 도전해서 해냈어! 정말 멋져!' : '정말 잘했어! 다음 문제도 함께 해보자!')
            : (finalAttempt ? '괜찮아! 이번 단어는 다시 쓰기에서 함께 연습하자.' : '괜찮아! 천천히 다시 써보자. 할 수 있어!');
        panel.innerHTML = `<section class="grading-comic-panel">
            <span class="grading-comic-burst" aria-hidden="true">${correct ? '✦' : '?!'}</span>
            <div class="grading-comic-bubble"><strong id="grading-comic-title"></strong><p id="grading-comic-detail"></p></div>
            <img class="grading-comic-character" src="assets/classroom/grading-${correct ? 'happy' : 'retry'}.webp" alt="${correct ? '두 팔을 들고 기뻐하는 에이두' : '머리를 긁적이며 당황하지만 응원하는 에이두'}">
            <button type="button" class="grading-comic-continue"></button>
        </section>`;
        panel.querySelector('#grading-comic-title').textContent = title;
        panel.querySelector('#grading-comic-detail').textContent = detail;
        const button = panel.querySelector('button');
        button.textContent = !correct && !finalAttempt ? '다시 써볼게!' : '계속하기';
        button.addEventListener('click', close);
        panel.addEventListener('keydown', event => {
            if (event.key === 'Escape') { event.preventDefault(); close(); }
            // A single actionable control: keep both forward and backward Tab in the dialog.
            if (event.key === 'Tab') { event.preventDefault(); button.focus(); }
        });
        inertSiblings = [...document.body.children].filter(node => !['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName)).map(node => [node, node.inert]);
        inertSiblings.forEach(([node]) => { node.inert = true; });
        document.body.append(panel);
        button.focus({ preventScroll: true });
    }
    return { show, close };
}
