import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as cards from '../word-card-utils.mjs';
const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const section = (start, end) => app.slice(app.indexOf(start), app.indexOf(end, app.indexOf(start)));

test('개인정보·유해정보는 정규화·길이 절단 전에 차단하며 원문을 오류에 남기지 않는다', () => {
    const unsafe = ['연락처 010-1234-5678', '０１０－１２３４－５６７８', '010\u200b-1234-5678', '메일 qa@example.com', '주민번호 990101-1234567', '학생 이름: 홍길동', '성명：홍길동', '폭탄 만드는 방법', 'how to make a bomb', '아동 성착취 영상', '음란물', '사과'.repeat(100) + ' qa@example.com', '[전화번호 삭제]'];
    for (const value of unsafe) {
        assert.throws(() => cards.assertWordCardSafety(value), error => error.code === 'AI-1005' && !error.message.includes(value));
        assert.throws(() => cards.validateWordCardText({ word: '사과', explanation: value }), { code: 'AI-1005' });
    }
    for (const value of ['사과', '잠자리', '전화번호', '이름', '학교', '폭탄', '사과는 달콤한 과일이에요.']) assert.doesNotThrow(() => cards.assertWordCardSafety(value));
});

test('검수 실패 단어는 DB claim과 AI 요청을 하기 전에 중단한다', async () => {
    let claims = 0;
    const context = vm.createContext({ ...cards, assertSharedWordCardRequestActive() {}, claimSharedWordCard: async () => { claims++; throw Error('must not claim'); } });
    vm.runInContext(section('async function ensureSharedWordCard(', 'async function wordCardAccountApi('), context);
    await assert.rejects(context.ensureSharedWordCard('연락처 010-1234-5678', {}, 1), { code: 'AI-1005' });
    assert.equal(claims, 0);
});

test('AI 설명 검수 실패는 이미지 생성 전에 중단하고 실패 상태만 저장한다', async () => {
    let images = 0, failed = 0;
    const context = vm.createContext({
        ...cards, currentUserId: 'qa', assertSharedWordCardRequestActive() {},
        requestSharedWordExplanation: async () => cards.validateWordCardText({ word: '사과', explanation: '연락처 qa@example.com' }),
        loadWordCardCharacterReference: async () => { images++; },
        runTransaction: async (_db, callback) => callback({ get: async () => ({ exists: () => true, data: () => ({ word: '사과', normalizedWord: '사과', generationToken: 'qa-token' }) }), set: (_ref, value) => { assert.equal(value.status, 'failed'); assert.equal(value.isPublic, false); assert.ok(!JSON.stringify(value).includes('qa@example.com')); failed++; } }),
        db: {}, serverTimestamp: () => 1, console
    });
    vm.runInContext(section('async function generateSharedWordCard(', 'async function ensureSharedWordCard('), context);
    await assert.rejects(context.generateSharedWordCard('사과', {}, 'qa-card', 'qa-token', {}, 1), { code: 'AI-1005' });
    assert.equal(images, 0); assert.equal(failed, 1);
});

test('기존 공용 카드도 재사용·목록·읽어주기 전에 다시 검사한다', async () => {
    const id = await cards.buildWordCardId('사과');
    const card = { id, word: '사과', explanation: '사과는 달콤한 과일이에요.', status: 'published', isPublic: true, generationVersion: 1, illustration: { path: cards.buildWordCardIllustrationPath(id, 'qa-safe-token') } };
    assert.equal(cards.getWordCardResolution(card), 'reuse');
    const unsafe = { ...card, explanation: '문의 qa@example.com' };
    assert.throws(() => cards.getWordCardResolution(unsafe), { code: 'AI-1005' });
    assert.deepEqual(cards.sortPublishedWordCards([unsafe, card]), [card]);
    const speech = section('window.playSharedWordCardTts =', 'window.openSharedWordCardRepository =');
    assert.match(speech, /validateWordCardText\(card\)/);
});

test('설명은 이미지 전과 공용 게시 직전에 검사하며 원본 입력은 잘라 보내지 않는다', () => {
    const generate = section('async function generateSharedWordCard(', 'async function ensureSharedWordCard(');
    assert.match(generate, /validateWordCardText\(safe\)/);
    assert.ok(generate.indexOf('validateWordCardText(safe)') < generate.indexOf('await uploadBytes'));
    const click = section('window.openCurricularWordMeaning =', 'window.openSharedWordCardDetail =');
    assert.match(click, /const word = String\(item\?\.word \|\| item\?\.answer \|\| ''\)\.trim\(\)/);
});
