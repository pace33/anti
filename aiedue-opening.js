(() => {
    const start = document.getElementById('start-screen');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const seenKey = 'aiedue-star-opening-gemini-v2';
    if (!start || start.classList.contains('hidden') || reducedMotion.matches) return;
    try { if (sessionStorage.getItem(seenKey)) return; } catch (_) { /* Playback works without storage. */ }

    const overlay = document.createElement('div');
    overlay.className = 'aiedue-opening';
    overlay.setAttribute('aria-label', '에이두가 별을 따라가며 한글을 만나는 오프닝');
    const video = document.createElement('video');
    video.src = 'assets/opening/aiedue-star-opening.mp4?v=20261006-gemini-v2';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.setAttribute('aria-hidden', 'true');
    const skip = document.createElement('button');
    skip.type = 'button';
    skip.className = 'aiedue-opening-skip';
    skip.textContent = '인트로 건너뛰기';
    overlay.append(video, skip);

    let finished = false;
    let begun = false;
    let loadingTimer;
    let endingTimer;
    let observer;
    const onKey = (event) => { if (event.key === 'Escape') finish(); };
    const onVisibility = () => {
        if (document.hidden) video.pause();
        else if (begun && !finished) video.play().catch(() => finish());
    };
    const onMotion = () => { if (reducedMotion.matches) finish(); };
    const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(loadingTimer);
        clearTimeout(endingTimer);
        video.pause();
        start.classList.remove('is-opening');
        overlay.classList.add('is-ending');
        if (document.activeElement === skip && !start.classList.contains('hidden')) {
            start.querySelector('.btn-start')?.focus({ preventScroll: true });
        }
        observer?.disconnect();
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('visibilitychange', onVisibility);
        reducedMotion.removeEventListener('change', onMotion);
        setTimeout(() => {
            overlay.remove();
            video.removeAttribute('src');
            video.load();
        }, 700);
    };
    skip.addEventListener('click', finish);
    video.addEventListener('error', finish, { once: true });
    video.addEventListener('ended', finish, { once: true });
    video.addEventListener('timeupdate', () => {
        if (video.duration && video.currentTime >= video.duration - .65) finish();
    });
    video.addEventListener('playing', () => {
        if (finished) return;
        begun = true;
        clearTimeout(loadingTimer);
        try { sessionStorage.setItem(seenKey, '1'); } catch (_) { /* Optional session flag. */ }
    });
    video.addEventListener('canplay', () => {
        if (finished || start.classList.contains('hidden') || reducedMotion.matches) return finish();
        start.append(overlay);
        start.classList.add('is-opening');
        video.play().catch(() => finish());
        // A stalled video must never prevent access to the original login screen.
        endingTimer = setTimeout(finish, 25000);
    }, { once: true });
    observer = new MutationObserver(() => { if (start.classList.contains('hidden')) finish(); });
    observer.observe(start, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener('change', onMotion);
    loadingTimer = setTimeout(finish, 5000);
})();
