export function createAieduLoading(document, clock = window) {
    let active = null, serial = 0, interval, closing;
    let previousFocus, inertSiblings = [];
    const overlay = document.getElementById('activity-loading-overlay');
    const scene = overlay.querySelector('.aiedu-loading-scene');
    const image = overlay.querySelector('img');
    const text = overlay.querySelector('.activity-loading-text');
    const bar = overlay.querySelector('[role="progressbar"]');
    const value = overlay.querySelector('.aiedu-loading-value');
    const hint = overlay.querySelector('.aiedu-loading-hint');
    const actors = {
        drawing: ['painter', '화가 에이두가 그림을 그리고 있어요'],
        dictation: ['writer', '에이두가 사진을 보고 노트에 쓰고 있어요'],
        literacy: ['reader', '에이두가 책을 읽고 생각하고 있어요'],
        hangul: ['reader', '에이두가 공부를 준비하고 있어요']
    };
    function progress(percent, complete = false) {
        bar.setAttribute('aria-valuenow', String(percent));
        bar.setAttribute('aria-valuetext', complete ? '완료 100%' : `예상 진행 ${percent}%`);
        bar.style.setProperty('--progress', `${percent}%`);
        value.textContent = `${percent}%`;
        hint.textContent = complete ? '준비가 끝났어요!' : '예상 진행률이에요. 준비가 끝나면 100%가 돼요.';
    }
    function start(message, kind = 'literacy') {
        clock.clearInterval(interval); clock.clearTimeout(closing);
        if (active === null) {
            previousFocus = document.activeElement;
            inertSiblings = [...document.body.children].filter(node => node !== overlay && !['SCRIPT', 'STYLE', 'LINK'].includes(node.tagName)).map(node => [node, node.inert]);
            inertSiblings.forEach(([node]) => { node.inert = true; });
        }
        const token = ++serial, startTime = Date.now();
        active = token;
        const [actor, label] = actors[kind] || actors.literacy;
        scene.dataset.actor = actor; image.src = `assets/classroom/loading-${actor}.webp`; image.alt = label;
        text.textContent = message || label;
        progress(0); overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false'); overlay.setAttribute('aria-busy', 'true');
        overlay.focus({ preventScroll: true });
        interval = clock.setInterval(() => progress(Math.min(92, Math.floor(92 * (1 - Math.exp(-(Date.now() - startTime) / 55000))))), 800);
        return token;
    }
    function update(token, message) { if (active === token) text.textContent = message; }
    function finish(token, success = false) {
        if (active !== token) return;
        clock.clearInterval(interval);
        if (success) progress(100, true);
        const hide = () => {
            if (active !== token) return;
            active = null; overlay.classList.remove('show');
            overlay.setAttribute('aria-hidden', 'true'); overlay.setAttribute('aria-busy', 'false');
            inertSiblings.forEach(([node, inert]) => { node.inert = inert; }); inertSiblings = [];
            if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus({ preventScroll: true });
            else document.getElementById('main-container')?.focus({ preventScroll: true });
        };
        if (success) closing = clock.setTimeout(hide, 550); else hide();
    }
    return { start, update, finish, isActive: token => active === token };
}
