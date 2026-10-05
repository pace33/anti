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
test('NFC and spacing are tolerated but visible extra letters are never stripped', () => {
  assert.equal(context.decideCurricularAiCorrect({ written: ' 학교 ' }, { answer: '학교' }, 1), true);
  assert.equal(context.decideCurricularAiCorrect({ written: '학교'.normalize('NFD') }, { answer: '학교' }, 1), true);
  assert.equal(context.decideCurricularAiCorrect({ written: '학교ㅋ' }, { answer: '학교' }, 1), false);
});
