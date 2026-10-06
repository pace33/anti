import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function normalizeCurricularAiText('), source.indexOf('async function gradeCurricularCanvasItemWithAi(')), context);
for (const difficulty of [1, 2]) {
  test(`${difficulty}dan requires the complete word, not containment, even with a generous AI verdict`, () => {
    for (const written of ['학', '학고', '나무', '학교집', '학교학교', '나무학교', '', 'ㅎㅏㄱㄱㅛ', '학교ㅋ']) {
      assert.equal(context.decideCurricularAiCorrect({ correct: true, written }, { answer: '학교', word: '학교' }, difficulty), false, written);
    }
    assert.equal(context.decideCurricularAiCorrect({ correct: true, written: '학교' }, { answer: '학교' }, difficulty), true);
  });
}
test('sentence grading compares complete text and does not accept similar meaning', () => {
  for (const written of ['학교에 와요', '학교에 가', '학교에 가요 나무', '학교']) {
    assert.equal(context.decideCurricularAiCorrect({ written }, { answer: '학교에 가요' }, 3), false, written);
  }
  assert.equal(context.decideCurricularAiCorrect({ written: '학교에 가요.' }, { answer: '학교에 가요' }, 3), true);
});
test('blind transcription prompt cannot leak a target or sentence hint', () => {
  const prompt = context.buildCurricularHandwritingTranscriptionPrompt();
  assert.ok(prompt.includes('정답과 문제 문장은 제공하지 않습니다'));
  const grading = source.slice(source.indexOf('async function gradeCurricularCanvasItemWithAi('), source.indexOf('window.confirmCurricularCanvasItem'));
  assert.ok(grading.includes('const prompt = buildCurricularHandwritingTranscriptionPrompt();'));
  assert.ok(!grading.includes('JSON.stringify(target)'));
  assert.ok(!grading.includes('expected:'));
});

async function runGrade(parsed, options = {}) {
  let recorded = null, calls = 0, suppliedPrompt = '';
  const node = { disabled: false, innerText: '' };
  const c = vm.createContext({
    activeDictationSession: { difficulty: 2, items: [{ answer: '학교', word: '학교', sentence: '학교에 가요', difficulty: 2, retryMode: Boolean(options.retry), aiGrading: Boolean(options.busy) }] },
    activeDictationImageAnalysis: '',
    document: { getElementById: id => id.startsWith('curricular-writing-canvas') ? { toDataURL: () => 'data:image/png;base64,aW5r' } : node },
    hasCurricularCanvasInk: () => options.ink !== false,
    callKoreanAiGenerate: async prompt => { calls++; suppliedPrompt = prompt; return JSON.stringify(parsed); },
    parseAiJsonObject: JSON.parse, cleanKoreanSentence: String, cleanKoreanWord: String,
    recordCurricularWritingResultSyllables: async result => { recorded = result; },
    startCurricularRetryMode: () => {}, showAiedueAutoToast: () => {}, showModal: () => {},
    updateCurricularWritingActionButtons: () => {}, getCurricularItemScore: r => r.score,
    checkpointCurricularWritingSession: async () => {}, // isolated grading unit; checkpoint persistence has separate tests
    formatCurricularScore: String, escapeHtml: String, console
  });
  vm.runInContext(source.slice(source.indexOf('function normalizeCurricularAiText('), source.indexOf('window.confirmCurricularCanvasItem')), c);
  if (options.concurrent) {
    await Promise.all([c.gradeCurricularCanvasItemWithAi(0), c.gradeCurricularCanvasItemWithAi(0)]);
  } else {
    await c.gradeCurricularCanvasItemWithAi(0);
  }
  return { recorded, calls, suppliedPrompt };
}

test('production scoring rejects a generous verdict for extra letters and low confidence', async () => {
  for (const parsed of [
    { written: '학교집', correct: true, confidence: 1 },
    { written: '학교ㅋ', correct: true, confidence: 1 },
    { written: '학교', correct: true, confidence: 0.5 },
    { written: '학교', correct: true },
    { written: '학교', correct: false, confidence: 1 }
  ]) {
    assert.equal((await runGrade(parsed)).recorded.score, 0);
  }
  const correct = await runGrade({ written: 'ㅎ,ㅏ,ㄱ|ㄱ,ㅛ,_', correct: true, confidence: 0.99 });
  assert.equal(correct.recorded.score, 1);
  assert.ok(!correct.suppliedPrompt.includes('학교'));
  assert.equal((await runGrade({ written: 'ㅎ,ㅏ,ㄱ|ㄱ,ㅛ,_', correct: true, confidence: 0.99 }, { retry: true })).recorded.score, 0.5);
  assert.equal(correct.recorded.written, '학교');
  assert.equal((await runGrade({ written: 'ㅎ,ㅏ,ㄱ|ㄱ,ㅗ,_', correct: true, confidence: 0.99 })).recorded.score, 0);
  assert.equal((await runGrade({ written: 'ㅎ,ㅏ,ㄱ|ㄱ,ㅛ,_|ㅋ', correct: true, confidence: 0.99 })).recorded.score, 0);
  assert.equal((await runGrade({ written: 'ㅎ,ㅏ,ㄱ|ㄱ,ㅛ,_', correct: true, confidence: 0.5 })).recorded.score, 0);
  assert.equal((await runGrade({ written: '학교', correct: true, confidence: 0.99 })).recorded.score, 0);
});

test('a second confirm during grading cannot create a duplicate AI request or save', async () => {
  const result = await runGrade({ written: 'ㅎ,ㅏ,ㄱ|ㄱ,ㅛ,_', correct: true, confidence: 1 }, { busy: true });
  assert.equal(result.calls, 0);
  assert.equal(result.recorded, null);
  const concurrent = await runGrade({ written: 'ㅎ,ㅏ,ㄱ|ㄱ,ㅛ,_', correct: true, confidence: 1 }, { concurrent: true });
  assert.equal(concurrent.calls, 1);
  assert.equal(concurrent.recorded.score, 1);
});

test('blank ink never calls AI and never creates a grading record', async () => {
  const result = await runGrade({ written: '학교', correct: true, confidence: 1 }, { ink: false });
  assert.equal(result.calls, 0);
  assert.equal(result.recorded, null);
});

test('NFC and spacing are tolerated but visible extra letters are never stripped', () => {
  assert.equal(context.decideCurricularAiCorrect({ written: ' 학교 ' }, { answer: '학교' }, 1), true);
  assert.equal(context.decideCurricularAiCorrect({ written: '학교'.normalize('NFD') }, { answer: '학교' }, 1), true);
  assert.equal(context.decideCurricularAiCorrect({ written: '학교ㅋ' }, { answer: '학교' }, 1), false);
});

test('image preparation preserves every pen path and cannot consult an answer', () => {
  const calls = [];
  const ctx = new Proxy({}, { get: (_, name) => (...args) => calls.push([name, ...args]), set: (o, key, value) => { calls.push(['set', key, value]); o[key] = value; return true; } });
  const canvases = [];
  const c = vm.createContext({ window: { devicePixelRatio: 2 }, document: { createElement: () => {
    const canvas = { getContext: () => ctx, toDataURL: () => 'prepared-ink' };
    canvases.push(canvas);
    return canvas;
  } } });
  vm.runInContext(source.slice(source.indexOf('function normalizeCurricularAiText('), source.indexOf('async function gradeCurricularCanvasItemWithAi(')), c);
  const strokes = [[{ x: .2, y: .3 }, { x: .4, y: .5 }], [{ x: .9, y: .6 }, { x: .95, y: .65 }]];
  const snapshot = JSON.stringify(strokes);
  const input = { width: 640, height: 512, _curricularStrokes: strokes, toDataURL: () => 'original-ink' };
  assert.equal(c.prepareCurricularHandwritingImage(input), 'prepared-ink');
  assert.equal(JSON.stringify(strokes), snapshot, 'preparation must not mutate stored pen paths');
  assert.equal(calls.filter(x => x[0] === 'moveTo').length, 2, 'added letters must retain their paths');
  assert.equal(calls.filter(x => x[0] === 'lineTo').length, 2);
  assert.ok(canvases.every(canvas => canvas.width > 0 && canvas.height > 0 && canvas.width <= 1024 && canvas.height <= 1024));
  assert.equal(c.prepareCurricularHandwritingImage({ toDataURL: () => 'original-ink' }), 'original-ink');
  assert.equal(c.prepareCurricularHandwritingImage({ ...input, width: Infinity }), 'original-ink');
  assert.equal(c.prepareCurricularHandwritingImage({ ...input, width: 0 }), 'original-ink');
  assert.equal(c.prepareCurricularHandwritingImage({ ...input, width: 8000, height: 8000 }), 'prepared-ink');
  assert.ok(canvases.every(canvas => canvas.width > 0 && canvas.height > 0 && canvas.width <= 1024 && canvas.height <= 1024));
  assert.equal(c.prepareCurricularHandwritingImage({ ...input, _curricularStrokes: [[{ x: NaN, y: 0 }, { x: 1, y: 1 }]] }), 'original-ink');
  assert.equal(c.prepareCurricularHandwritingImage({ ...input, _curricularStrokes: [[{ x: -1, y: 0 }, { x: 1, y: 1 }]] }), 'original-ink');
  const helper = source.slice(source.indexOf('function prepareCurricularHandwritingImage('), source.indexOf('function buildCurricularHandwritingTranscriptionPrompt('));
  assert.ok(!/item\.answer|item\.word|expected|activeDictationSession/.test(helper));
});

test('compact blind prompt counts compound vowel strokes without adjacent consonants', () => {
  const prompt = context.buildCurricularHandwritingTranscriptionPrompt();
  assert.ok(prompt.includes('ㅔ/ㅖ'));
  assert.ok(prompt.includes('초성이나 받침'));
  assert.ok(prompt.includes('중성 영역 밖'));
  assert.ok(prompt.includes('두 세로선 사이'));
  assert.ok(prompt.includes('바깥 왼쪽'));
  assert.ok(prompt.includes('하단 가로선'));
  assert.ok(prompt.includes('40자'));
  assert.ok(prompt.length < 750);
});

test('jamo transcription composes observed vowels, rejects word autocorrection and malformed syllables', () => {
  assert.equal(context.composeCurricularTranscription('ㅎ,ㅏ,ㄱ|ㄱ,ㅗ,_'), '학고');
  assert.equal(context.composeCurricularTranscription('ㅎ,ㅏ,ㄱ|ㄱ,ㅛ,_'), '학교');
  assert.equal(context.composeCurricularTranscription('ㅎ,ㅏ,ㄱ|ㄱ,ㅛ,_|ㅋ'), '학교ㅋ');
  assert.equal(context.composeCurricularTranscription('ㄱ,ㅜ,_|ㄱ,ㅠ,_'), '구규');
  for (const invalid of ['', '학교', 'ㄱ,ㅗ', 'ㄱ,ㅗ,_|', 'ㄱ,?,_', 'ㄱ,ㅗ,ㅏ', 'ㄱ,ㅗ,__']) assert.equal(context.composeCurricularTranscription(invalid), '', invalid);
  const initials = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  const vowels = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
  const finals = '_ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ';
  for (let i=0;i<19;i++) for(let v=0;v<21;v++) for(let f=0;f<28;f++) {
    const expected = String.fromCharCode(0xac00+(i*21+v)*28+f);
    assert.equal(context.composeCurricularTranscription(`${initials[i]},${vowels[v]},${finals[f]}`),expected);
  }
});
