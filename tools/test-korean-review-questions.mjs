import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveKoreanReviewQuestion } from '../korean-review-questions.mjs';

const tubeReview = resolveKoreanReviewQuestion({
    lessonId: 20,
    activityType: 'wordPictureMatch',
    correctAnswer: '튜브'
}, {
    pictureItems: [
        { answer: '튜브', icon: '🛟', choices: ['튜브', '투브'] }
    ]
});

assert.deepEqual(tubeReview, {
    kind: 'picture-choice',
    prompt: '그림에 알맞은 낱말을 골라요.',
    icon: '🛟',
    choices: ['튜브', '투브'],
    audioText: '튜브'
});

const listeningReview = resolveKoreanReviewQuestion({
    activityType: 'listenAndFind',
    correctAnswer: 'ㅐ'
}, {
    listeningItems: [
        { answer: 'ㅐ', choices: ['ㅔ', 'ㅐ'] }
    ]
});

assert.deepEqual(listeningReview.choices, ['ㅔ', 'ㅐ']);
assert.equal(resolveKoreanReviewQuestion({ activityType: 'wordPictureMatch', correctAnswer: '없는말' }), null);

const appSource = await readFile(new URL('../app.js', import.meta.url), 'utf8');
assert.match(appSource, /LESSON20_READ_FIND_ITEMS/);
assert.match(appSource, /getKoreanReviewSourcePresentation/);
assert.match(appSource, /korean-review-picture/);

console.log('Korean review question tests passed.');
