import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../app.css', import.meta.url), 'utf8');
const notices = [
    { id: 'word-bank-photo-privacy-notice', container: 'word-bank-camera-modal', capture: 'word-bank-camera-capture-btn', input: 'word-bank-photo-input' },
    { id: 'dictation-photo-privacy-notice', container: 'dictation-photo-card', capture: 'dictation-camera-capture-btn', input: 'dictation-photo-input' }
];

for (const { id, container, capture, input } of notices) {
    test(`${id}: face, personal and sensitive information guidance appears before capture and file selection`, () => {
        const notice = html.match(new RegExp(`<div id="${id}"[^>]*>([\\s\\S]*?)</div>`));
        assert.ok(notice, 'notice exists in the initial HTML, not after AI upload');
        for (const text of ['얼굴이 나오지 않게', '노트만', '이름·연락처·주소', '개인정보', '건강·장애', '민감정보', '사진 파일을 고를 때도']) {
            assert.ok(notice[1].includes(text), text);
        }
        assert.match(notice[0], /role="note"/);
        assert.ok(html.indexOf(`id="${container}"`) < notice.index);
        assert.ok(notice.index < html.indexOf(`id="${capture}"`));
        assert.ok(notice.index < html.indexOf(`id="${input}"`));
        for (const control of [capture, input]) {
            const tag = html.match(new RegExp(`<(?:button|input)[^>]*id="${control}"[^>]*>`));
            assert.ok(tag);
            assert.ok(tag[0].includes(`aria-describedby="${id}"`));
        }
    });
}

test('notice is styled without a blocking consent dialog or changes to photo processing', () => {
    assert.match(css, /\.photo-privacy-notice\s*\{/);
    assert.match(css, /\.photo-privacy-notice strong,[\s\S]*?\.photo-privacy-notice span\s*\{ display: block; \}/);
    assert.ok(html.includes('app.css?v=stage3-photo-privacy-v1'));
    assert.ok(html.includes('onclick="captureWordBankCameraPhoto()"'));
    assert.ok(html.includes('onclick="captureDictationCameraPhoto()"'));
});
