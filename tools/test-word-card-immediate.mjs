import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const section = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));

test('뜻 버튼은 신청 큐 대신 기존 카드 조회와 즉시 생성 완료 후 그림을 표시한다', async () => {
    const calls = [];
    const card = { id: 'qa-card', word: '학교', explanation: '학교는 배우는 곳이에요.' };
    const content = { innerHTML: '' };
    const context = vm.createContext({
        window: {}, activeDictationSession: { kind: 'trace', items: [{ word: '학교' }] },
        normalizeWordCardWord: value => value, activeSharedWordCardContext: '',
        activeSharedWordCardRequestId: 4,
        beginSharedWordCardRequest: () => ({ requestId: 4, signal: {} }),
        cancelSpeech: () => calls.push('cancel-speech'), setSharedWordCardModalOpen: () => {},
        sharedWordCardElement: id => id === 'shared-word-card-content' ? content : {},
        setSharedWordCardBusy: () => {},
        ensureSharedWordCard: async word => { calls.push(['ensure', word]); return card; },
        assertSharedWordCardRequestActive: () => {},
        renderSharedWordCardDetail: async result => calls.push(['render', result.id]),
        wordCardAccountApi: () => { throw Error('meaning must not submit a queue request'); },
        sharedWordCardError: value => { throw Error(value); }, console
    });
    vm.runInContext(section('window.openCurricularWordMeaning =', 'window.openSharedWordCardDetail ='), context);
    await context.window.openCurricularWordMeaning(0);
    assert.deepEqual(calls, ['cancel-speech', ['ensure', '학교'], ['render', 'qa-card']]);
    assert.equal(content.innerHTML.includes('신청'), false);
});

test('단어 설명과 원본 캐릭터 그림 편집은 명시적인 Gemini 경로다', () => {
    const explanation = section('async function requestSharedWordExplanation', 'async function loadWordCardCharacterReference');
    const image = section('async function generateSharedWordCard', 'async function ensureSharedWordCard');
    assert.match(explanation, /model: AIEDUE_KOREAN_FAST_TEXT_MODEL/);
    assert.match(explanation, /processingMode: getKoreanAiProcessingMode\(\{ processingMode: 'gemini-only' \}\)/);
    assert.match(image, /createSettingsImageEditTurn\(editSession,.*\{ processingMode: 'gemini-only' \}\)/);
    const meaning = section('window.openCurricularWordMeaning =', 'window.openSharedWordCardDetail =');
    assert.ok(meaning.includes('ensureSharedWordCard(word, signal, requestId)'));
    assert.equal(meaning.includes("wordCardAccountApi('/word-card-requests'"), false);
});

test('Gemini 직행은 명시적 옵션이며 local-only URL과 다른 로컬 기능은 유지한다', () => {
    const context = vm.createContext({ window: { location: { search: '' } }, URLSearchParams });
    vm.runInContext(section('function getKoreanAiProcessingMode(', 'async function callKoreanAiGenerate'), context);
    assert.equal(context.getKoreanAiProcessingMode({ processingMode: 'gemini-only' }), 'gemini-only');
    assert.equal(context.getKoreanAiProcessingMode({ processingMode: 'local-only' }), 'local-only');
    assert.equal(context.getKoreanAiProcessingMode(), 'auto');
    context.window.location.search = '?ai=local';
    assert.equal(context.getKoreanAiProcessingMode({ processingMode: 'gemini-only' }), 'local-only');
    assert.match(app, /createSettingsImageEditTurn\(session, prompt, '1:1', controller.signal, \{ processingMode: 'local-only' \}\)/);
    assert.match(app, /model: 'desktop-gemma', processingMode: 'local-only', profile: 'korean-literacy-generate-'/);
});
