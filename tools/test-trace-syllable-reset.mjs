import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function harness() {
    const from = source.indexOf('window.resetTraceWritingSyllable =');
    const to = source.indexOf('function drawSavedTracePaths(', from);
    assert(from >= 0 && to > from, 'syllable reset implementation exists');
    const path0 = Object.assign([{ x: 10, y: 20 }, { x: 20, y: 40 }], { cellIndex: 0 });
    const path1 = Object.assign([{ x: 130, y: 20 }, { x: 140, y: 40 }], { cellIndex: 1 });
    const path2 = Object.assign([{ x: 230, y: 20 }, { x: 240, y: 40 }], { cellIndex: 2 });
    const cells = [0, 1, 2].map(index => ({ index, char: ['바','나','나'][index], bx: index * 100, by: 0, boxW: 100, boxH: 100 }));
    const feedback = { textContent: '완료' };
    const canvas = { id: 'letter-word-writing-canvas', dataset: { traceSyllableReset: '', completed: 'true', traceCompletionNotified: 'true', rewarded: 'true', promptVersion: '7' },
        _traceCompleted: { 0: 3, 1: 2, 2: 3 }, _tracePaths: [path0, path1, path2], _traceCells: cells,
        _cancelTraceDrawing() { this.cancelled = true; }, getContext: () => ({}) };
    const calls = [];
    const context = { window: {}, document: { getElementById: () => feedback }, getTraceWritingCanvas: () => canvas,
        drawTraceWritingGuide: () => calls.push('guide'), drawSavedTracePaths: (_, paths) => calls.push(paths),
        tracePointInBox: (p, c) => p && p.x >= c.bx && p.x < c.bx + c.boxW && p.y >= c.by && p.y < c.by + c.boxH };
    vm.createContext(context);
    vm.runInContext(source.slice(from, to), context);
    return { reset: index => context.window.resetTraceWritingSyllable(canvas, index), canvas, feedback, calls, paths: [path0,path1,path2] };
}

test('only the selected second syllable restarts, even with repeated letters', () => {
    const h = harness();
    assert.equal(h.reset(1), true);
    assert.equal(h.canvas._traceCompleted[0], 3);
    assert.equal(h.canvas._traceCompleted[1], undefined);
    assert.equal(h.canvas._traceCompleted[2], 3);
    assert.deepEqual(Array.from(h.canvas._tracePaths), [h.paths[0], h.paths[2]]);
    assert.equal(h.canvas.dataset.completed, undefined);
    assert.equal(h.canvas.dataset.traceCompletionNotified, undefined);
    assert.equal(h.canvas.dataset.rewarded, 'true', 'retry must not grant the same prompt reward twice');
    assert.equal(h.canvas.dataset.promptVersion, '7', 'in-flight grading still belongs to this prompt');
    assert.equal(h.canvas.dataset.traceRetryVersion, '1', 'pending auto-advance becomes stale');
    assert.equal(h.canvas.cancelled, true);
    assert.equal(h.feedback.textContent, '');
    assert.equal(h.calls[0], 'guide');
    assert.equal(h.calls[1].length, 2);
});

test('invalid targets and non-opted-in canvases are untouched', () => {
    const h = harness();
    assert.equal(h.reset(-1), false);
    assert.equal(h.reset(99), false);
    delete h.canvas.dataset.traceSyllableReset;
    assert.equal(h.reset(1), false);
    assert.equal(h.canvas._tracePaths.length, 3);
    assert.equal(h.calls.length, 0);
});

test('first and last syllable reset are independent and repeated reset is safe', () => {
    const h = harness();
    h.reset(0); h.reset(0); h.reset(2);
    assert.equal(h.canvas._traceCompleted[1], 2);
    assert.deepEqual(Array.from(h.canvas._tracePaths), [h.paths[1]]);
});

test('legacy untagged paths are removed by their starting cell only', () => {
    const h = harness();
    h.canvas._tracePaths.forEach(path => delete path.cellIndex);
    h.reset(1);
    assert.deepEqual(Array.from(h.canvas._tracePaths), [h.paths[0], h.paths[2]]);
});

test('word practice opts in, uses per-syllable cells and tags accepted strokes', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    assert.match(html, /id="letter-word-writing-canvas"[^>]*data-trace-syllable-reset/);
    assert.match(source, /kind === 'word' \? Array\.from\(text\)\.join\('\/'\)/);
    assert.match(source, /activePath\.cellIndex = activeTrace\.cellIndex/);
    assert.match(source, /syncTraceSyllableResetButtons\(canvas\)/);
});
