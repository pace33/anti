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
    activeDictationSession: { difficulty: 2, items: [{ answer: '학교', word: '학교', sentence: '학교에 가요', difficulty: 2, retryMode: Boolean(options.retry) }] },
    activeDictationImageAnalysis: '',
    document: { getElementById: id => id.startsWith('curricular-writing-canvas') ? { toDataURL: () => 'data:image/png;base64,aW5r' } : node },
    hasCurricularCanvasInk: () => options.ink !== false,
    callKoreanAiGenerate: async prompt => { calls++; suppliedPrompt = prompt; return JSON.stringify(parsed); },
    parseAiJsonObject: JSON.parse, cleanKoreanSentence: String, cleanKoreanWord: String,
    recordCurricularWritingResultSyllables: async result => { recorded = result; },
    startCurricularRetryMode: () => {}, showAiedueAutoToast: () => {}, showModal: () => {},
    updateCurricularWritingActionButtons: () => {}, getCurricularItemScore: r => r.score,
    formatCurricularScore: String, escapeHtml: String, console
  });
  vm.runInContext(source.slice(source.indexOf('function normalizeCurricularAiText('), source.indexOf('window.confirmCurricularCanvasItem')), c);
  await c.gradeCurricularCanvasItemWithAi(0);
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
