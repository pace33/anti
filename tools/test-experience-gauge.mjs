import test from 'node:test';
import assert from 'node:assert/strict';
import { createExperienceGauge } from '../experience-gauge.mjs';

function fixture() {
    const nodes = new Map();
    const classes = new Set();
    let now = 0, nextId = 0, reduced = false;
    const frames = new Map();
    const hud = {
        querySelector(selector) {
            if (!nodes.has(selector)) nodes.set(selector, { textContent: '', hidden: true, attributes: {}, style: { setProperty(k, v) { this[k] = v; } }, setAttribute(k, v) { this.attributes[k] = v; } });
            return nodes.get(selector);
        },
        classList: { contains: c => classes.has(c), add: (...cs) => cs.forEach(c => classes.add(c)), remove: (...cs) => cs.forEach(c => classes.delete(c)) }
    };
    const gauge = createExperienceGauge(hud, {
        requestFrame: fn => { frames.set(++nextId, fn); return nextId; },
        cancelFrame: id => frames.delete(id), reducedMotion: () => reduced
    });
    return { gauge, hud, nodes, frames, motion: value => { reduced = value; },
        step(ms) { now += ms; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(now)); },
        drain() { for (let i = 0; frames.size && i < 2000; i++) this.step(20); assert.equal(frames.size, 0); },
        get percent() { return nodes.get('.rpg-circle-percent').textContent; },
        get level() { return nodes.get('.rpg-circle-level').textContent; }
    };
}

test('initial/account snapshots render immediately without a reward', () => {
    const f = fixture(); f.gauge.update('a', 7, 72);
    assert.equal(f.percent, '72%'); assert.equal(f.level, 7); assert.equal(f.frames.size, 0);
    f.gauge.update('b', 20, 10); assert.equal(f.percent, '10%'); assert.equal(f.frames.size, 0);
});
test('fractional rewards keep precise fill while all visible numbers are integers', () => {
    const f = fixture(); f.gauge.update('a', 1, 10); f.gauge.update('a', 1, 10.25); f.step(0);
    assert.equal(f.nodes.get('.rpg-experience-gain').textContent, '+1% 미만'); assert.equal(f.percent, '10%');
    f.step(650); f.step(400);
    const meter = f.nodes.get('.rpg-experience-circle');
    assert.ok(parseFloat(meter.style['--experience']) > 10 && parseFloat(meter.style['--experience']) < 10.25);
    assert.equal(f.percent, '10%');
    f.drain(); assert.equal(f.percent, '10%');
    assert.equal(meter.style['--experience'], '10.25%');
});
test('level-up visibly reaches 100 before resetting and filling the remainder', () => {
    const f = fixture(); f.gauge.update('a', 7, 95); f.gauge.update('a', 8, 7);
    f.step(0); f.step(650); f.step(800);
    assert.equal(f.percent, '100%'); assert.equal(f.level, 7);
    f.step(220); assert.equal(f.percent, '0%'); assert.equal(f.level, 8);
    f.drain(); assert.equal(f.percent, '7%');
});
test('rapid rewards and duplicate snapshots finish without losing or replaying XP', () => {
    const f = fixture(); f.gauge.update('a', 1, 90); f.gauge.update('a', 1, 95); f.step(0);
    f.gauge.update('a', 1, 95); f.gauge.update('a', 2, 10); f.gauge.update('a', 4, 12.5);
    f.drain(); assert.equal(f.percent, '12%'); assert.equal(f.level, 4);
    f.gauge.update('a', 4, 12.5); assert.equal(f.frames.size, 0);
});
test('server corrections cancel queued rewards and use the authoritative value', () => {
    const f = fixture(); f.gauge.update('a', 2, 30); f.gauge.update('a', 2, 60); f.step(0);
    f.gauge.update('a', 2, 25); assert.equal(f.percent, '25%'); assert.equal(f.frames.size, 0);
    assert.equal(f.nodes.get('.rpg-experience-gain').hidden, true);
});
test('logout and account switch cancel pending animations', () => {
    const f = fixture(); f.gauge.update('a', 1, 30); f.gauge.update('a', 2, 60); f.step(0);
    f.gauge.reset(); assert.equal(f.frames.size, 0);
    f.gauge.update('b', 8, 33); assert.equal(f.percent, '33%'); assert.equal(f.frames.size, 0);
});
test('reduced motion and a hidden HUD settle immediately', () => {
    const f = fixture(); f.gauge.update('a', 1, 30); f.gauge.update('a', 2, 60); f.step(0);
    f.motion(true); f.step(20); assert.equal(f.percent, '60%'); assert.equal(f.frames.size, 0);
    f.motion(false); f.gauge.update('a', 3, 10); f.hud.classList.add('hidden'); f.step(20);
    assert.equal(f.percent, '10%'); assert.equal(f.frames.size, 0);
});

test('99.999 percent never displays a premature level-up', () => {
    const f = fixture(); f.gauge.update('a', 7, 99.999);
    assert.equal(f.percent, '99%'); assert.equal(f.level, 7);
    f.gauge.update('a', 8, 0); f.drain();
    assert.equal(f.percent, '0%'); assert.equal(f.level, 8);
});
