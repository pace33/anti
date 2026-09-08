import { DRAWING_SHAPE_LIBRARY } from './drawing-shape-catalog.mjs';

// All geometry uses a square 0–1 coordinate space, independent of screen size.
const polygon = (points) => [...points, { ...points[0] }];
const regular = (sides, radius = 0.33) => polygon(Array.from({ length: sides }, (_, i) => ({
    x: 0.5 + Math.cos(-Math.PI / 2 + i * Math.PI * 2 / sides) * radius,
    y: 0.5 + Math.sin(-Math.PI / 2 + i * Math.PI * 2 / sides) * radius
})));

const outlines = {
    line: [{ x: .16, y: .5 }, { x: .84, y: .5 }],
    wave: Array.from({ length: 97 }, (_, i) => ({ x: .16 + .68 * i / 96, y: .5 + Math.sin(i / 96 * Math.PI * 4) * .14 })),
    circle: regular(96, .31),
    triangle: polygon([{ x: .5, y: .17 }, { x: .83, y: .77 }, { x: .17, y: .77 }]),
    square: polygon([{ x: .2, y: .2 }, { x: .8, y: .2 }, { x: .8, y: .8 }, { x: .2, y: .8 }]),
    diamond: polygon([{ x: .5, y: .13 }, { x: .8, y: .5 }, { x: .5, y: .87 }, { x: .2, y: .5 }]),
    pentagon: regular(5, .35),
    star: polygon(Array.from({ length: 10 }, (_, i) => ({
        x: .5 + Math.cos(-Math.PI / 2 + i * Math.PI / 5) * (i % 2 ? .17 : .36),
        y: .5 + Math.sin(-Math.PI / 2 + i * Math.PI / 5) * (i % 2 ? .17 : .36)
    }))),
    heart: polygon(Array.from({ length: 96 }, (_, i) => {
        const t = i / 96 * Math.PI * 2;
        return { x: .5 + 16 * Math.pow(Math.sin(t), 3) * .66 / 34,
            y: .44 - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * .55 / 30 };
    })),
    zigzag: Array.from({ length: 7 }, (_, i) => ({ x: .16 + .68 * i / 6, y: .5 + (i % 2 ? .16 : -.16) }))
};
export const ZOO_SHAPES = DRAWING_SHAPE_LIBRARY.map(item => ({
    id: item.key, name: item.label, friendly: item.label, color: item.color,
    closed: !['line', 'wave', 'zigzag'].includes(item.key), points: outlines[item.key]
}));

export const getDrawingDuration = (score = 0) => Math.max(6000, 18000 - Math.max(0, Number(score) || 0) * 600);
export const createZooState = () => ({ score: 0, lives: 3, round: 1, status: 'ready' });
export function resolveZooRound(state, passed) {
    // Only one resolution can consume a round, even after rapid repeated clicks.
    if (state.status !== 'delivering') return state;
    const lives = Math.max(0, state.lives - (passed ? 0 : 1));
    return { ...state, score: state.score + (passed ? 1 : 0), lives, status: lives ? 'reaction' : 'gameover' };
}
export function createZooShapeDeck(previousId, random = Math.random) {
    const deck = [...ZOO_SHAPES];
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    if (deck[0].id === previousId) [deck[0], deck[1]] = [deck[1], deck[0]];
    return deck;
}

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function segmentDistance(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}
function segmentsOf(strokes) {
    return strokes.flatMap(stroke => stroke.slice(1).map((p, i) => [stroke[i], p]));
}
function nearest(p, segments) {
    let min = Infinity;
    for (const [a, b] of segments) min = Math.min(min, segmentDistance(p, a, b));
    return min;
}
function sampleSegments(segments, spacing = .008) {
    const points = [];
    for (const [a, b] of segments) {
        const length = distance(a, b);
        if (length < .0001) continue;
        const steps = Math.max(1, Math.ceil(length / spacing));
        for (let i = 0; i < steps; i++) {
            const t = (i + .5) / steps;
            points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, weight: length / steps });
        }
    }
    return points;
}

export function evaluateZooTrace(shape, strokes, tolerance = .048) {
    const fail = { passed: false, coverage: 0, precision: 0, lengthRatio: 0, reason: 'empty' };
    if (!shape?.points || !Array.isArray(strokes) || !strokes.length) return fail;
    // Bound pathological inputs and reject invalid coordinates rather than joining gaps.
    if (strokes.reduce((sum, stroke) => sum + (Array.isArray(stroke) ? stroke.length : 6001), 0) > 6000) return { ...fail, reason: 'scribble' };
    if (strokes.some(stroke => !Array.isArray(stroke) || stroke.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || Math.abs(p.x) > 2 || Math.abs(p.y) > 2))) return fail;
    const drawn = segmentsOf(strokes), guide = segmentsOf([shape.points]);
    const drawnLength = drawn.reduce((sum, [a, b]) => sum + distance(a, b), 0);
    const guideLength = guide.reduce((sum, [a, b]) => sum + distance(a, b), 0);
    const lengthRatio = drawnLength / guideLength;
    if (lengthRatio < .65) return { ...fail, lengthRatio, reason: 'incomplete' };
    if (lengthRatio > 1.85) return { ...fail, lengthRatio, reason: 'scribble' };
    const coverage = sampleSegments(guide).reduce((sum, p) => sum + (nearest(p, drawn) <= tolerance ? p.weight : 0), 0) / guideLength;
    const samples = sampleSegments(drawn);
    const precision = samples.reduce((sum, p) => sum + (nearest(p, guide) <= tolerance ? p.weight : 0), 0) / drawnLength;
    // A generous tracing corridor alone can confuse similar curved/polygonal outlines.
    // Reject only when the drawing is substantially closer to another known outline;
    // ordinary hand wobble still benefits from the full child-friendly tolerance.
    const error = samples.reduce((sum, p) => sum + nearest(p, guide) * p.weight, 0) / drawnLength;
    const wrongShape = coverage >= .86 && precision >= .80 && error > .008 && ZOO_SHAPES.some(other => {
        if (other.id === shape.id) return false;
        const otherGuide = segmentsOf([other.points]);
        const otherError = samples.reduce((sum, p) => sum + nearest(p, otherGuide) * p.weight, 0) / drawnLength;
        return otherError < error * .55 && error - otherError > .008;
    });
    const passed = coverage >= .86 && precision >= .80 && !wrongShape;
    return { passed, coverage, precision, lengthRatio, reason: passed ? 'good' : coverage < .86 ? 'incomplete' : 'off-guide' };
}
