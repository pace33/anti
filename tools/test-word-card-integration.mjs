import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const [app, html, css] = await Promise.all([
    readFile(new URL('../app.js', import.meta.url), 'utf8'),
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../app.css', import.meta.url), 'utf8')
]);

function section(source, start, end) {
    const from = source.indexOf(start);
    assert.notEqual(from, -1, `시작 마커 없음: ${start}`);
    const to = source.indexOf(end, from + start.length);
    assert.notEqual(to, -1, `끝 마커 없음: ${end}`);
    return source.slice(from, to);
}

test('3단계와 4단계에서 단어 카드 저장소가 하단 두 번째 카드다', () => {
    const dictation = section(html, 'id="dictation-activities-section"', 'id="literacy-activities-section"');
    const literacy = section(html, 'id="literacy-activities-section"', 'id="literacy-workspace-section"');
    assert.ok(dictation.indexOf("openDictationPracticeActivity()") < dictation.indexOf("openSharedWordCardRepository('dictation')"));
    assert.ok(dictation.indexOf("openSharedWordCardRepository('dictation')") < dictation.indexOf('openMyDictationFromDashboard()'));
    assert.ok(literacy.indexOf('openLiteracyLimitBreak()') < literacy.indexOf("openSharedWordCardRepository('literacy')"));
    assert.ok(literacy.indexOf("openSharedWordCardRepository('literacy')") < literacy.indexOf('openMyLiteracyRecord()'));
});

test('2스텝의 단어 뜻 버튼은 확인 버튼 왼쪽에 있고 trace에서만 렌더링된다', () => {
    const card = section(app, 'function renderCurricularWritingCanvasCard', 'function renderDictationSessionList');
    assert.ok(card.includes("activeDictationSession?.kind === 'trace'"));
    assert.ok(card.indexOf('openCurricularWordMeaning') < card.indexOf('confirmCurricularCanvasItem'));
});

test('공용 카드 조회가 생성보다 먼저 실행되고 결정적 문서 ID를 사용한다', () => {
    const claim = section(app, 'async function claimSharedWordCard', 'async function generateSharedWordCard');
    const ensure = section(app, 'async function ensureSharedWordCard', 'window.openCurricularWordMeaning');
    assert.ok(claim.includes('buildWordCardId(word)'));
    assert.ok(claim.includes('runTransaction'));
    assert.ok(ensure.indexOf("claim.resolution === 'reuse'") < ensure.indexOf('generateSharedWordCard'));
    assert.ok(ensure.indexOf("claim.resolution === 'wait'") < ensure.indexOf('generateSharedWordCard'));
});

test('새 카드는 이미지 편집 세션과 공용 게시 상태를 사용하고 원본 사진은 저장하지 않는다', () => {
    const generate = section(app, 'async function generateSharedWordCard', 'async function ensureSharedWordCard');
    assert.ok(generate.includes('createSettingsImageEditSession(sourceBlob'));
    assert.ok(generate.includes('buildWordCardImageEditPrompt'));
    assert.ok(generate.includes("status: 'published'"));
    assert.ok(generate.includes('isPublic: true'));
    assert.ok(generate.includes('buildWordCardIllustrationPath(cardId, generationToken, extension)'));
    assert.equal(generate.includes('sourceBlob:'), false);
    assert.equal(generate.includes('sourcePhoto:'), false);
    assert.ok(app.includes("if (pendingWordBankCameraAfterSave === 'curricular-writing') activeCurricularWordCardSourceBlob = analysisFile;"));
});

test('모달에 정확한 로딩 문구와 문장 클릭·별도 TTS 버튼이 있다', () => {
    assert.ok(html.includes('단어를 설명하기 위해 생각하고 있어요…'));
    assert.ok(app.includes("content.querySelector('.shared-word-card-sentence')?.addEventListener('click'"));
    assert.ok(app.includes("content.querySelector('.shared-word-card-tts')?.addEventListener('click'"));
    assert.ok(app.includes('speakTextKo(card.explanation)'));
    assert.ok(css.includes('.shared-word-card-modal'));
    assert.ok(css.includes('@media (max-width: 560px)'));
});

test('lease별 고유 이미지 경로를 게시하고 패배하거나 실패한 업로드는 정리한다', () => {
    const generate = section(app, 'async function generateSharedWordCard', 'async function ensureSharedWordCard');
    assert.ok(generate.includes('buildWordCardIllustrationPath(cardId, generationToken, extension)'));
    assert.ok(app.includes('generationOwnerUid: currentUserId'));
    assert.ok(generate.includes('publishedGenerationToken: generationToken'));
    assert.ok(generate.includes('failedGenerationToken: generationToken'));
    assert.ok(generate.includes('usedUpload: false'));
    assert.ok(generate.includes('deleteObject(storageRef(storage, uploadedImagePath))'));
    assert.ok(generate.indexOf('latest?.generationToken !== generationToken') < generate.indexOf('transaction.set(cardReference, card'));
});

test('공개 저장소는 비공개 카드를 조회하지 않고 문서 ID를 인라인 HTML에 삽입하지 않는다', () => {
    const repository = section(app, 'window.openSharedWordCardRepository', 'window.closeSharedWordCardModal');
    assert.ok(repository.includes("where('isPublic', '==', true)"));
    assert.ok(repository.includes("tile.addEventListener('click', () => openSharedWordCardDetail(card.id))"));
    assert.equal(repository.includes("onclick=\"openSharedWordCardDetail('${card.id}')\""), false);
    assert.equal(repository.includes('data-word-card-image="${card.id}"'), false);
});

test('대기·생성·렌더링은 취소 신호와 요청 세대가 바뀌면 화면을 갱신하지 않는다', () => {
    const wait = section(app, 'async function waitForPublishedSharedWordCard', 'async function claimSharedWordCard');
    const ensure = section(app, 'async function ensureSharedWordCard', 'window.openCurricularWordMeaning');
    assert.ok(wait.includes('assertSharedWordCardRequestActive(requestId, signal)'));
    assert.ok(ensure.includes('waitForPublishedSharedWordCard(claim.cardReference, signal, requestId)'));
    assert.ok(app.includes('activeSharedWordCardRequestId += 1'));
});
