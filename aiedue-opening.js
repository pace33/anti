(() => {
    const start = document.getElementById('start-screen');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const seenKey = 'aiedue-star-opening-gemini-v2';
    let activeFinish;

    // The start screen must work while the main app's module dependencies load.
    if (typeof window.showLoginFromStart !== 'function') {
        window.showLoginFromStart = () => {
            const login = document.getElementById('login-section');
            if (!start || !login) return;
            activeFinish?.();
            start.classList.add('hidden');
            start.style.display = 'none';
            login.classList.remove('hidden');
            login.style.display = 'flex';
        };
    }

    const playIntro = (manual = false) => {
        if (activeFinish || (!manual && (!start || start.classList.contains('hidden') || reducedMotion.matches))) return;
        const trigger = document.activeElement;
        const bgm = document.getElementById('bg-music');
        const resumeMusic = manual && bgm && !bgm.paused;

        const overlay = document.createElement(manual ? 'dialog' : 'div');
        overlay.className = `aiedue-opening${manual ? ' is-manual' : ''}`;
        overlay.setAttribute('aria-label', '에이두가 별을 따라가며 한글을 만나는 오프닝');
        const video = document.createElement('video');
        video.src = 'assets/opening/aiedue-star-opening.mp4?v=20261006-gemini-v2';
        video.muted = !manual;
        video.controls = manual;
        video.playsInline = true;
        video.preload = 'auto';
        if (!manual) video.setAttribute('aria-hidden', 'true');
        const skip = document.createElement('button');
        skip.type = 'button';
        skip.className = 'aiedue-opening-skip';
        skip.textContent = '인트로 건너뛰기';
        overlay.append(video, skip);

        let finished = false;
        let begun = false;
        let resumeOnVisible = false;
        let loadingTimer;
        let endingTimer;
        let observer;
        const onKey = (event) => { if (event.key === 'Escape') finish(); };
        const onVisibility = () => {
            if (document.hidden) {
                resumeOnVisible = !video.paused;
                video.pause();
            } else if (resumeOnVisible && begun && !finished) video.play().catch(() => finish());
        };
        const onMotion = () => { if (reducedMotion.matches) finish(); };
        const finish = () => {
            if (finished) return;
            finished = true;
            clearTimeout(loadingTimer);
            clearTimeout(endingTimer);
            video.pause();
            activeFinish = null;
            if (!manual) start.classList.remove('is-opening');
            overlay.classList.add('is-ending');
            if (manual) {
                overlay.close();
                if (trigger?.isConnected) trigger.focus({ preventScroll: true });
                if (resumeMusic) bgm.play().catch(() => {});
            } else if (document.activeElement === skip && !start.classList.contains('hidden')) {
                start.querySelector('.btn-start')?.focus({ preventScroll: true });
            }
            observer?.disconnect();
            document.removeEventListener('keydown', onKey);
            document.removeEventListener('visibilitychange', onVisibility);
            if (!manual) reducedMotion.removeEventListener('change', onMotion);
            setTimeout(() => {
                overlay.remove();
                video.removeAttribute('src');
                video.load();
            }, 700);
        };
        activeFinish = finish;
        skip.addEventListener('click', finish);
        video.addEventListener('error', finish, { once: true });
        video.addEventListener('ended', finish, { once: true });
        video.addEventListener('timeupdate', () => {
            // The MP4's drawn start button appears at 9.35s; hand over to the real button.
            if (!manual && video.duration && video.currentTime >= Math.min(9.35, video.duration - .65)) finish();
        });
        video.addEventListener('playing', () => {
            if (finished) return;
            begun = true;
            clearTimeout(loadingTimer);
            try { sessionStorage.setItem(seenKey, '1'); } catch (_) { /* Optional session flag. */ }
        });
        video.addEventListener('canplay', () => {
            if (finished) return;
            if (manual) return;
            if (start.classList.contains('hidden') || reducedMotion.matches) return finish();
            start.append(overlay);
            start.classList.add('is-opening');
            video.play().catch(() => finish());
            // A stalled video must never prevent access to the original login screen.
            endingTimer = setTimeout(finish, 25000);
        }, { once: true });
        if (!manual) {
            observer = new MutationObserver(() => { if (start.classList.contains('hidden')) finish(); });
            observer.observe(start, { attributes: true, attributeFilter: ['class'] });
            reducedMotion.addEventListener('change', onMotion);
        }
        document.addEventListener('keydown', onKey);
        document.addEventListener('visibilitychange', onVisibility);
        loadingTimer = setTimeout(finish, manual ? 15000 : 5000);
        if (manual) {
            if (resumeMusic) bgm.pause();
            document.body.append(overlay);
            overlay.addEventListener('cancel', (event) => { event.preventDefault(); finish(); });
            overlay.showModal();
            skip.focus();
            // A direct user action can start playback with the generated soundtrack.
            video.play().catch(() => {
                if (finished) return;
                video.muted = true;
                video.play().catch(() => finish());
            });
        }
    };

    document.getElementById('dashboard-intro-button')?.addEventListener('click', () => playIntro(true));
    try { if (sessionStorage.getItem(seenKey)) return; } catch (_) { /* Playback works without storage. */ }
    playIntro();
})();
