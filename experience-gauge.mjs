// Presentation only: the existing wallet remains the source of truth.
export function createExperienceGauge(hud, {
    requestFrame = requestAnimationFrame,
    cancelFrame = cancelAnimationFrame,
    reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
} = {}) {
    const meter = hud.querySelector('.rpg-experience-circle');
    const percent = hud.querySelector('.rpg-circle-percent');
    const levelLabel = hud.querySelector('.rpg-circle-level');
    const gain = hud.querySelector('.rpg-experience-gain');
    const status = hud.querySelector('.rpg-experience-status');
    let account, target = null, frame = null, active = null;
    const queue = [];
    const format = value => String(Number(value.toFixed(3)));

    function render(total, full = false) {
        const level = Math.floor(total / 100) + (full ? 0 : 1);
        const progress = full ? 100 : total % 100;
        meter.style.setProperty('--experience', `${progress}%`);
        percent.textContent = `${Math.floor(progress)}%`;
        levelLabel.textContent = level;
        meter.setAttribute('aria-valuenow', format(progress));
        meter.setAttribute('aria-valuetext', `레벨 ${level}, 경험치 ${Math.floor(progress)}%`);
    }

    function clear() {
        if (frame !== null) cancelFrame(frame);
        frame = null;
        active = null;
        queue.length = 0;
        gain.hidden = true;
        hud.classList.remove('experience-received', 'experience-level-up');
    }

    function tick(now) {
        frame = null;
        if (reducedMotion() || hud.classList.contains('hidden')) {
            clear();
            render(target);
            return;
        }
        if (!active) {
            const next = queue.shift();
            if (!next) return;
            active = { ...next, start: now, phase: 'gain', value: next.from };
            const reward = next.to - next.from;
            gain.textContent = reward < 1 ? '+1% 미만' : `+${Math.floor(reward)}%`;
            gain.hidden = false;
            gain.style.opacity = '0';
            status.textContent = `경험치 ${gain.textContent} 획득`;
        }
        const elapsed = now - active.start;
        if (active.phase === 'gain') {
            const p = Math.min(1, elapsed / 650);
            gain.style.opacity = String(p < .2 ? p / .2 : p < .55 ? 1 : (1 - p) / .45);
            gain.style.transform = `translate(-50%, ${-55 + 94 * Math.max(0, (p - .4) / .6)}px) scale(${1 - .45 * p})`;
            if (p === 1) {
                gain.hidden = true;
                hud.classList.add('experience-received');
                active.phase = 'fill';
                active.start = now;
            }
        } else if (active.phase === 'fill') {
            const boundary = (Math.floor(active.value / 100) + 1) * 100;
            const end = Math.min(active.to, boundary);
            const p = Math.min(1, elapsed / 800);
            const value = active.value + (end - active.value) * (1 - (1 - p) ** 3);
            render(value, p === 1 && end === boundary);
            if (p === 1 && end === boundary) {
                active.value = end;
                active.phase = 'level';
                active.start = now;
                hud.classList.add('experience-level-up');
            } else if (p === 1) finish();
        } else if (elapsed >= 220) {
            render(active.value);
            status.textContent = `레벨 ${Math.floor(active.value / 100) + 1} 달성!`;
            hud.classList.remove('experience-level-up');
            if (active.value === active.to) finish();
            else { active.phase = 'fill'; active.start = now; }
        }
        if (active || queue.length) frame = requestFrame(tick);
    }

    function finish() {
        render(active.to);
        active = null;
        hud.classList.remove('experience-received');
    }

    return {
        update(accountId, level, experience) {
            const total = (Math.max(1, Math.floor(Number(level) || 1)) - 1) * 100
                + Math.min(99.999, Math.max(0, Number(experience) || 0));
            if (account !== accountId || target === null || total < target || reducedMotion() || hud.classList.contains('hidden')) {
                clear();
                account = accountId;
                target = total;
                render(total);
                return;
            }
            if (total === target) return; // Repeated server snapshots are not new rewards.
            queue.push({ from: target, to: total });
            target = total;
            if (frame === null) frame = requestFrame(tick);
        },
        reset() { clear(); target = null; account = undefined; status.textContent = ''; }
    };
}
