import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function slice(start, end) {
    const from = source.indexOf(start), to = source.indexOf(end, from);
    assert(from >= 0 && to > from);
    return source.slice(from, to);
}
function harness(levels = [3]) {
    const elements = new Map(), calls = [];
    const element = id => {
        if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', style: {}, scrollTop: 100,
            querySelector: selector => element(`${id} ${selector}`), focus() {} });
        return elements.get(id);
    };
    const context = {
        window: {}, document: { body: { dataset: {} }, getElementById: element }, console,
        currentUserRole: 'student', currentUserId: 'student', currentUserProfileSnapshot: {},
        unlockedLevels: levels, activeKoreanLearningStage: 2, activeKoreanReview: null,
        activityRoutes: { hangul: { level: 2 }, dictation: { level: 3 }, literacy: { level: 4 } },
        getActivityRouteFromLocation: () => 'dictation',
        getCurricularPracticeReviewItems: () => [{ word: '학교', answer: '학교에 가요' }],
        showModal: text => calls.push(['modal', text]),
        requireStageAccess: stage => { calls.push(['guard', stage]); return context.currentUserRole === 'teacher' || context.unlockedLevels.includes(stage); },
        openActivityRoute: (route, options) => { calls.push(['route', route, options]); return true; },
        showTopLevelSection: section => { calls.push(['section', section]); context.document.body.dataset.learningStage = String(context.activeKoreanLearningStage); },
        setKoreanLearningMenuActive() {}, updateKoreanStudentViewUrl: view => calls.push(['url', view]),
        getTodayReviewQuestions: () => { calls.push(['queue']); return [{ correctAnswer: '가' }]; },
        koreanMasteryCache: {}, renderKoreanReviewQuestion: () => calls.push(['question']),
        renderKoreanRecordDashboard: () => calls.push(['records-2']), escapeHtml: text => String(text),
        getCurricularWritingState: () => ({ history: [] }), dictationPortfolio: { missions: {} }, literacyPortfolio: { history: [] },
        renderKoreanStageGameReport: (_, stage) => `game-report-${stage}`
    };
    context.window.openDictationPracticeActivity = () => calls.push(['curricular']);
    context.window.openAiedueLabWordCardGame = () => calls.push(['word-card']);
    context.window.openLiteracyAdventureGame = () => calls.push(['detective']);
    vm.createContext(context);
    vm.runInContext(slice('function getKoreanLearningStage(', 'function updateKoreanStudentViewUrl('), context);
    vm.runInContext(slice('window.openKoreanTodayReview =', 'window.openRpgClass ='), context);
    vm.runInContext(slice('window.openKoreanRecords =', 'window.openKoreanGrowthUnit ='), context);
    vm.runInContext(slice('function openKoreanStudentViewRoute(', 'function getKoreanStudentReportFromData('), context);
    return { context, calls, element };
}

test('stage-3-only students open two review activities without a stage-2 gate or queue', async () => {
    const h = harness();
    await h.context.window.openKoreanTodayReview();
    assert.equal(h.context.activeKoreanLearningStage, 3);
    assert.match(h.element('korean-review-content').innerHTML, /오답 다시 쓰기/);
    assert.match(h.element('korean-review-content').innerHTML, /단어 카드 한 판/);
    assert(!h.calls.some(([name]) => name === 'queue'));
    h.context.window.startKoreanStageReview('curricular');
    h.context.window.startKoreanStageReview('word-card');
    assert(h.calls.some(([name]) => name === 'curricular'));
    assert(h.calls.some(([name]) => name === 'word-card'));
});

test('no wrong answers disables writing review while keeping word cards available', async () => {
    const h = harness();
    h.context.getCurricularPracticeReviewItems = () => [];
    await h.context.window.openKoreanTodayReview();
    const html = h.element('korean-review-content').innerHTML;
    assert.match(html, /startKoreanStageReview\('curricular'\)" disabled/);
    assert.doesNotMatch(html, /startKoreanStageReview\('word-card'\)" disabled/);
    h.context.window.startKoreanStageReview('curricular');
    assert(!h.calls.some(([name]) => name === 'curricular' || name === 'route'));
});

test('stage-4-only students launch the detective game and read their own stage records', async () => {
    const h = harness([4]);
    await h.context.window.openKoreanTodayReview();
    assert.match(h.element('korean-review-content').innerHTML, /문해력 탐정단/);
    h.context.window.startKoreanStageReview('detective');
    assert(h.calls.some(([name]) => name === 'detective'));
    await h.context.window.openKoreanRecords();
    assert.match(h.element('korean-records-content').innerHTML, /game-report-4/);
    assert(!h.calls.some(([name]) => name === 'records-2'));
});

test('locked stages and revoked launch permissions never enter the activity', async () => {
    const h = harness([3]);
    await h.context.window.openKoreanTodayReview({ stage: 4 });
    assert(!h.calls.some(([name]) => name === 'section'));
    h.context.window.startKoreanStageReview('detective');
    h.context.unlockedLevels = [];
    h.context.window.startKoreanStageReview('curricular');
    assert(!h.calls.some(([name]) => ['route', 'detective', 'curricular'].includes(name)));
});

test('visible stage wins for teachers and multi-stage students; stage 2 retains its question flow', async () => {
    const h = harness([2, 3, 4]);
    h.context.document.body.dataset.learningStage = '4';
    await h.context.window.openKoreanTodayReview();
    assert.equal(h.context.activeKoreanLearningStage, 4);
    await h.context.window.openKoreanTodayReview({ stage: 2 });
    assert.equal(h.context.activeKoreanReview.queue.length, 1);
    assert(h.calls.some(([name]) => name === 'question'));
    await h.context.window.openKoreanRecords({ stage: 2 });
    assert(h.calls.some(([name]) => name === 'records-2'));
    h.context.currentUserRole = 'teacher'; h.context.unlockedLevels = [];
    await h.context.window.openKoreanTodayReview({ stage: 3 });
    assert.equal(h.context.activeKoreanLearningStage, 3);
});

test('refresh and back/forward resolve stage from URL instead of old visible state', async () => {
    const h = harness([3, 4]);
    h.context.document.body.dataset.learningStage = '4';
    await h.context.openKoreanStudentViewRoute('review', { pushUrl: false });
    assert.equal(h.context.activeKoreanLearningStage, 3);
    assert(!h.calls.some(([name]) => name === 'url'));
});

test('review URL carries selected stage and stage-1-only students stay out', () => {
    const h = harness([1]);
    assert.equal(h.context.getKoreanLearningStage(), 0);
    let url;
    h.context.window.history = { pushState: (_, __, value) => { url = value; } };
    vm.runInContext(slice('function updateKoreanStudentViewUrl(', 'function formatKoreanMasteryStatus('), h.context);
    h.context.activeKoreanLearningStage = 4;
    h.context.updateKoreanStudentViewUrl('review');
    assert.equal(url, 'index.html?activity=literacy&view=review');
});

test('a pending stage-2 save cannot render a newly opened stage-3 review', async () => {
    const h = harness([2, 3]);
    let finish;
    h.context.recordKoreanAttempt = () => new Promise(resolve => { finish = resolve; });
    h.context.window.setTimeout = () => assert.fail('Must not schedule the stale review');
    const item = { correctAnswer: '가' };
    h.context.activeKoreanReview = { queue: [item], index: 0, correctCount: 0, wrongCount: 0 };
    vm.runInContext(slice('async function finishKoreanReviewAttempt(', 'window.submitKoreanReviewChoice ='), h.context);
    const saving = h.context.finishKoreanReviewAttempt(item, '가', true);
    await h.context.window.openKoreanTodayReview({ stage: 3 });
    finish(); await saving;
    assert.equal(h.context.activeKoreanReview, null);
    assert.match(h.element('korean-review-content').innerHTML, /단어 카드 한 판/);
});
