import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const [app, html, game, css, appCss] = await Promise.all([
    readFile(new URL('app.js', root), 'utf8'),
    readFile(new URL('index.html', root), 'utf8'),
    readFile(new URL('syllable-slow-reader.js', root), 'utf8'),
    readFile(new URL('syllable-slow-reader.css', root), 'utf8'),
    readFile(new URL('app.css', root), 'utf8')
]);

test('한글 카드의 받침 낱말 오른쪽 직접 만들기 탭에 연결된다', () => {
    const tabs = html.slice(html.indexOf('id="reading-category-tabs"'), html.indexOf('id="reading-cards-grid"'));
    assert.ok(tabs.indexOf('data-reading-category="batchim"') >= 0);
    assert.ok(tabs.indexOf('data-reading-category="custom"') > tabs.indexOf('data-reading-category="batchim"'));
    assert.ok(html.includes('id="reading-custom-maker"'));
    assert.ok(html.includes('id="reading-tab-custom"'));
    assert.ok(html.includes('aria-labelledby="reading-tab-custom ssr-title"'));
    assert.equal(html.includes('id="syllable-slow-reader-section"'), false);
    assert.equal(app.includes('openAiedueLabSyllableReader'), false);
    assert.ok(app.includes('window.openSyllableSlowReader?.()'));
    assert.ok(app.includes("activeReadingCategory === 'custom'"));
    assert.ok(app.includes('item.tabIndex = isActive ? 0 : -1'));
    assert.ok(app.includes('ArrowRight'));
    assert.ok(app.includes('ArrowLeft'));
    assert.ok(app.includes('Home'));
    assert.ok(app.includes('End'));
    assert.ok(html.includes('src="syllable-slow-reader.js'));
    assert.ok(html.includes('href="syllable-slow-reader.css'));
});

test('브라우저 비밀키 없이 공용 에이두 TTS와 취소 계약을 쓴다', () => {
    assert.ok(game.includes('window.speakTextKo?.('));
    assert.ok(game.includes('window.cancelSpeech?.()'));
    assert.ok(game.includes('runId !== state.runId'));
    assert.equal(game.includes('generativelanguage.googleapis.com'), false);
    assert.equal(game.includes('apiKey'), false);
    assert.equal(game.includes('fetch('), false);
    assert.ok(app.includes('activeTtsAudioCancel?.()'));
    assert.ok(app.includes("const cancelAudioWait = () => finish(reject, new DOMException('재생이 취소됐습니다.', 'AbortError'))"));
});

test('입력은 textContent 기반으로 렌더링하고 음절별 실제 완료를 기다린다', () => {
    assert.ok(game.includes('card.textContent = token.text'));
    assert.equal(game.includes('innerHTML'), false);
    assert.match(game, /await window\.speakTextKo\?\.\(sequence\[index\]\.text/);
    assert.ok(game.includes('await waitForGap(gap.milliseconds, runId)'));
    assert.ok(game.includes("document.addEventListener('visibilitychange'"));
    assert.ok(game.includes('shouldCancelSpeech = state.isPlaying'));
    assert.match(game, /async function speakOne[\s\S]*finally \{/);
});

test('모바일과 접근성 계약을 유지한다', () => {
    assert.match(html, /id="ssr-status"[^>]*role="status"[^>]*aria-live="polite"/);
    assert.match(html, /id="ssr-play"[^>]*aria-pressed="false"/);
    assert.ok(css.includes('@media (max-width: 760px)'));
    assert.ok(css.includes('min-height: 44px'));
    assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
    assert.ok(game.includes("reduceMotion ? 'auto' : 'smooth'"));
    assert.ok(game.includes("section: $('reading-custom-maker')"));
    assert.ok(appCss.includes('@media (max-width:820px){.reading-category-tabs{flex-wrap:wrap;}'));
});
