import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAWING_SHAPE_LIBRARY } from '../drawing-shape-catalog.mjs';
import {
    ZOO_SHAPES,
    evaluateZooTrace,
    createZooState,
    resolveZooRound,
    getDrawingDuration,
    createZooShapeDeck
} from '../shape-zoo-core.mjs';

// Resample the visible guide so tests resemble pointer input, independently of
// how many control points each shape happens to have.
function tracePoints(shape, spacing = 0.012) {
    const result = [{ ...shape.points[0] }];
    for (let i = 1; i < shape.points.length; i++) {
        const a = shape.points[i - 1];
        const b = shape.points[i];
        const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / spacing);
        for (let j = 1; j <= steps; j++) {
            const t = j / steps;
            result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
    }
    return result;
}

function expectPass(shape, strokes) {
    const result = evaluateZooTrace(shape, strokes);
    assert.equal(result.passed, true, `${shape.id}: ${JSON.stringify(result)}`);
    assert.equal(result.reason, 'good');
    return result;
}

test('different known shapes cannot satisfy each other', () => {
    for (const target of ZOO_SHAPES) for (const drawn of ZOO_SHAPES) {
        if (target.id !== drawn.id) assert.equal(evaluateZooTrace(target, [drawn.points]).passed, false, `${drawn.id} accepted as ${target.id}`);
    }
});

for (const shape of ZOO_SHAPES) {
    test(`${shape.id}: the complete guide passes in either direction`, () => {
        const forward = expectPass(shape, [shape.points]);
        const backward = expectPass(shape, [[...shape.points].reverse()]);
        for (const result of [forward, backward]) {
            assert.ok(result.coverage > 0.99);
            assert.ok(result.precision > 0.99);
            assert.ok(Math.abs(result.lengthRatio - 1) < 1e-9);
        }
    });

    test(`${shape.id}: ordinary hand jitter still passes`, () => {
        const jittered = tracePoints(shape).map((p, i) => ({
            x: p.x + Math.sin(i * 0.65) * 0.008,
            y: p.y + Math.cos(i * 0.71) * 0.008
        }));
        const result = expectPass(shape, [jittered]);
        assert.ok(result.coverage > 0.95);
        assert.ok(result.precision > 0.95);
    });

    test(`${shape.id}: lifting the pen between nearby trace sections is allowed`, () => {
        const points = tracePoints(shape);
        const strokes = [];
        // Deliberately omit the connecting segment at each pen lift. These
        // short gaps are within the child-friendly drawing tolerance.
        for (let i = 0; i < points.length; i += 20) {
            strokes.push(points.slice(i, i + 20));
        }
        assert.ok(strokes.length > 1);
        expectPass(shape, strokes.reverse());
    });

    test(`${shape.id}: partial traces and isolated taps cannot complete a shape`, () => {
        const points = tracePoints(shape);
        const partial = evaluateZooTrace(shape, [points.slice(0, Math.floor(points.length * 0.4))]);
        assert.equal(partial.passed, false);
        assert.equal(partial.reason, 'incomplete');
        const taps = evaluateZooTrace(shape, points.map(p => [p]));
        assert.equal(taps.passed, false);
        assert.equal(taps.lengthRatio, 0);
    });

    test(`${shape.id}: repeatedly scribbling over the guide is rejected`, () => {
        const result = evaluateZooTrace(shape, [shape.points, shape.points, shape.points]);
        assert.equal(result.passed, false);
        assert.equal(result.reason, 'scribble');
    });
}

test('pen lifts never create invisible connecting lines', () => {
    const square = ZOO_SHAPES.find(shape => shape.id === 'square');
    const [topLeft, topRight, bottomRight, bottomLeft] = square.points;
    const separateStrokes = [[topLeft, topRight], [bottomRight, bottomLeft, topLeft]];
    const result = evaluateZooTrace(square, separateStrokes);
    // Three real sides have enough length to reach geometric assessment, but
    // the missing right side must remain missing across the pen lift.
    assert.ok(result.lengthRatio > 0.65);
    assert.ok(result.precision > 0.99);
    assert.equal(result.passed, false);
    assert.equal(result.reason, 'incomplete');
    // A real connecting segment would complete this outline.
    expectPass(square, [separateStrokes.flat()]);
});

test('a long interior zigzag is not mistaken for a completed outline', () => {
    const square = ZOO_SHAPES.find(shape => shape.id === 'square');
    const zigzag = Array.from({ length: 9 }, (_, i) => ({
        x: i % 2 ? 0.68 : 0.32,
        y: 0.32 + i * 0.045
    }));
    const result = evaluateZooTrace(square, [zigzag]);
    assert.ok(result.lengthRatio > 0.65 && result.lengthRatio < 1.85);
    assert.equal(result.passed, false);
    assert.ok(result.coverage < 0.5);
    assert.ok(result.precision < 0.5);
});

test('empty, malformed, nonfinite, and excessive pointer input is rejected safely', () => {
    const shape = ZOO_SHAPES[0];
    const invalidInputs = [
        undefined, null, [], [[]], [[{ x: 0.5, y: 0.5 }]],
        [null], [[null]], [[{ x: NaN, y: 0.5 }]],
        [[{ x: 0.5, y: Infinity }]], [[{ x: '0.5', y: 0.5 }]],
        [[{ x: 3, y: 0.5 }, { x: 0.5, y: 0.5 }]]
    ];
    for (const strokes of invalidInputs) {
        assert.equal(evaluateZooTrace(shape, strokes).passed, false);
    }
    assert.equal(evaluateZooTrace(null, [shape.points]).passed, false);
    const excess = evaluateZooTrace(shape, [Array.from({ length: 6001 }, () => ({ x: 0.5, y: 0.5 }))]);
    assert.equal(excess.passed, false);
    assert.equal(excess.reason, 'scribble');
});

test('a new game starts with zero food delivered and three independent lives', () => {
    const first = createZooState();
    const second = createZooState();
    assert.deepEqual(first, { score: 0, lives: 3, round: 1, status: 'ready' });
    first.lives = 1;
    assert.equal(second.lives, 3);
});

test('a successful delivery awards exactly one point and preserves lives', () => {
    const state = Object.freeze({ score: 4, lives: 2, round: 7, status: 'delivering' });
    const result = resolveZooRound(state, true);
    assert.deepEqual(result, { score: 5, lives: 2, round: 7, status: 'reaction' });
    assert.equal(state.score, 4);
    assert.strictEqual(resolveZooRound(result, true), result);
    assert.strictEqual(resolveZooRound(result, false), result);
});

test('three failed deliveries consume one life each and end the game at zero', () => {
    let state = createZooState();
    for (let remaining = 2; remaining >= 0; remaining--) {
        state = resolveZooRound({ ...state, status: 'delivering' }, false);
        assert.equal(state.lives, remaining);
        assert.equal(state.score, 0);
        assert.equal(state.status, remaining ? 'reaction' : 'gameover');
        assert.strictEqual(resolveZooRound(state, false), state);
        assert.strictEqual(resolveZooRound(state, true), state);
    }
    const exhausted = resolveZooRound({ ...state, status: 'delivering' }, false);
    assert.equal(exhausted.lives, 0);
    assert.equal(exhausted.status, 'gameover');
});

test('round outcomes cannot be applied outside the delivery phase', () => {
    for (const status of ['ready', 'drawing', 'reaction', 'gameover']) {
        const state = Object.freeze({ score: 3, lives: 1, round: 4, status });
        assert.strictEqual(resolveZooRound(state, true), state);
        assert.strictEqual(resolveZooRound(state, false), state);
    }
});

test('drawing time decreases with progress and never falls below six seconds', () => {
    assert.equal(getDrawingDuration(), 18000);
    assert.equal(getDrawingDuration(1), 17400);
    assert.equal(getDrawingDuration(10), 12000);
    assert.equal(getDrawingDuration(20), 6000);
    assert.equal(getDrawingDuration(1000), 6000);
    assert.equal(getDrawingDuration(-5), 18000);
    assert.equal(getDrawingDuration('invalid'), 18000);
    let previous = getDrawingDuration(0);
    for (let score = 1; score <= 100; score++) {
        const duration = getDrawingDuration(score);
        assert.ok(duration <= previous);
        assert.ok(duration >= 6000);
        previous = duration;
    }
});

test('the zoo includes exactly all ten shapes from 1단계 나의 도형', () => {
    assert.deepEqual(ZOO_SHAPES.map(shape => [shape.id, shape.name]), DRAWING_SHAPE_LIBRARY.map(shape => [shape.key, shape.label]));
    assert.deepEqual(ZOO_SHAPES.map(shape => shape.id).sort(), ['line','wave','circle','triangle','square','star','pentagon','heart','diamond','zigzag'].sort());
    for (const shape of ZOO_SHAPES) {
        assert.ok(shape.points.length >= 2);
        assert.ok(shape.points.every(p => p.x >= .1 && p.x <= .9 && p.y >= .1 && p.y <= .9));
    }
});

test('every shuffled deck includes all ten once and avoids a repeat across deck boundaries', () => {
    for (const previous of ZOO_SHAPES) {
        for (const random of [() => 0, () => .5, () => .999]) {
            const deck = createZooShapeDeck(previous.id, random);
            assert.notEqual(deck[0].id, previous.id);
            assert.deepEqual(deck.map(shape => shape.id).sort(), ZOO_SHAPES.map(shape => shape.id).sort());
            assert.equal(new Set(deck).size, 10);
        }
    }
});

test('straight, wavy, and zigzag guides remain open paths', () => {
    for (const id of ['line', 'wave', 'zigzag']) {
        const shape = ZOO_SHAPES.find(item => item.id === id);
        assert.equal(shape.closed, false);
        assert.notDeepEqual(shape.points[0], shape.points.at(-1));
        assert.equal(evaluateZooTrace(shape, [shape.points]).passed, true);
    }
});
