import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../math/math-spiral.js', import.meta.url), 'utf8');
const noop = () => {};
let randomState = 0x1a1ed0e;
const seededMath = Object.create(Math);
seededMath.random = () => {
    randomState = (1664525 * randomState + 1013904223) >>> 0;
    return randomState / 0x100000000;
};
const document = {
    addEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    getElementById: () => null,
    createElement: () => ({ dataset: {}, classList: { add: noop, remove: noop, toggle: noop } })
};
const window = {
    addEventListener: noop,
    dispatchEvent: noop,
    setTimeout: noop,
    document
};
const context = vm.createContext({
    window,
    document,
    console,
    Math: seededMath,
    Set,
    Array,
    String,
    Number,
    Object,
    CSS: { escape: String },
    CustomEvent: class CustomEvent {},
    SpeechSynthesisUtterance: class SpeechSynthesisUtterance {},
    speechSynthesis: { cancel: noop, speak: noop },
    setTimeout: noop,
    clearTimeout: noop
});
vm.runInContext(source, context, { filename: 'math-spiral.js' });
assert.equal(typeof window.auditAiedueMathQuestionQuality, 'function');
const result = window.auditAiedueMathQuestionQuality(20);
assert.equal(result.lessonCount, 51);
assert.equal(result.sampleCount, 51 * 6 * 20);
if (result.issues.length) {
    console.error(result.issues.slice(0, 100).join('\n'));
}
assert.equal(result.issues.length, 0);
console.log(`에이두 수학 문제은행 무작위 감사 완료: ${result.lessonCount}개 개념, ${result.sampleCount}문항, 오류 0건`);
