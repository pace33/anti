import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const entryUrl = 'https://aiedue.ddns.net/school-game-entry.js?v=20261007-pokemon-entry-v2';

function section(start, end) {
    const from = source.indexOf(start);
    assert.notEqual(from, -1, `Missing source marker: ${start}`);
    const to = source.indexOf(end, from + start.length);
    assert.notEqual(to, -1, `Missing source marker: ${end}`);
    return source.slice(from, to + end.length);
}

function renderContext(role = 'student') {
    const context = vm.createContext({
        currentUserRole: role,
        escapeKoreanShopHtml: String,
        renderAieduePorandyShopCard: () => '',
        renderAiedueRoblShopCard: () => '',
        renderAiedueKoreanTeacherShopManager: () => ''
    });
    for (const name of ['renderAieduePokemonShopCard', 'renderAiedueKoreanShopItems', 'renderAiedueKoreanTeacherShop']) {
        vm.runInContext(section(`function ${name}(`, '\n}'), context);
    }
    return context;
}

function launcher({ load, enter } = {}) {
    const notices = [], headers = [], games = [], destroyed = [], listeners = new Map();
    const elements = new Map(['dashboard-coins', 'dashboard-coins-header', 'school-enter-pokemon-btn'].map((id) => [id, { disabled: false, isConnected: true }]));
    let options, imports = 0, factories = 0;
    const context = vm.createContext({
        loginSuccess: true,
        currentUserId: 'student-a',
        currentUserRole: 'student',
        currentUserName: 'Student A', currentUserIcon: '🐱',
        currentUserBalance: 3400, currentUserCoins: 3400, currentUserAeduTokens: 900,
        currentUserProfileSnapshot: { balance: 3400, coins: 3400, aeduTokens: 900, name: 'Student A' },
        auth: { currentUser: { uid: 'student-a' } },
        db: {}, document: { getElementById: (id) => elements.get(id) },
        showModal: (message) => notices.push(message),
        updateSyncedActivityHeaders: (data) => headers.push(data),
        addEventListener: (name, listener) => listeners.set(name, listener),
        console: { warn() {}, error() {} },
        async loadPokemonModule() {
            imports += 1;
            await load?.();
            return { createSchoolGameEntry(value) {
                options = value;
                const id = ++factories;
                return {
                    bind() { assert.fail('Inline launcher must not register a second button handler'); },
                    async enter(game) { games.push(game); await enter?.(game); },
                    destroy() { destroyed.push(id); }
                };
            } };
        }
    });
    context.window = context;
    const code = section('let aieduePokemonEntryPromise =', '\nfunction renderAiedueRoblShopCard(').replace(/\nfunction renderAiedueRoblShopCard\($/, '');
    assert.ok(code.includes(entryUrl), 'Launcher reuses the verified School game entry module');
    for (const name of ['escapeHtml', 'escapeKoreanShopHtml']) vm.runInContext(section(`function ${name}(`, '\n}'), context);
    vm.runInContext(code.replace(/import\([^)]*\)/g, 'loadPokemonModule()'), context);
    return { context, notices, headers, games, elements, destroyed, listeners, get options() { return options; }, get imports() { return imports; }, get factories() { return factories; } };
}

const button = () => ({ disabled: false, isConnected: true });

test('Pokémon card shows a student price of 1,000원 and free teacher entry', () => {
    const context = renderContext();
    const student = context.renderAieduePokemonShopCard();
    assert.match(student, /에이두 포켓몬/);
    assert.match(student, /1,000원/);
    assert.match(student, /id="school-enter-pokemon-btn"/);
    assert.match(student, /onclick="openAieduePokemon\(this\)"/);
    context.currentUserRole = 'teacher';
    const teacher = context.renderAieduePokemonShopCard();
    assert.match(teacher, /무료/);
    assert.doesNotMatch(teacher, /1,000원/);
});

test('both shop renderers include one Pokémon card and its handler is allowed safely', () => {
    const context = renderContext();
    for (const name of ['renderAiedueKoreanShopItems', 'renderAiedueKoreanTeacherShop']) {
        assert.equal((context[name]().match(/id="school-enter-pokemon-btn"/g) || []).length, 1);
    }
    vm.runInContext(section('const SAFE_MODAL_ACTIONS =', '\nfunction sanitizeModalHtml(').replace(/\nfunction sanitizeModalHtml\($/, ''), context);
    for (const action of ['openAieduePokemon(this)', 'window.openAieduePokemon(this)']) assert.equal(context.isSafeModalAction(action), true);
    for (const action of ['evil()', "openAieduePokemon(fetch('https://evil.test'))", 'openAieduePokemon(this);alert(1)']) assert.equal(context.isSafeModalAction(action), false);
});

test('invalid or mismatched accounts cannot load or enter Pokémon', async () => {
    for (const change of [
        { loginSuccess: false }, { currentUserId: '' }, { auth: { currentUser: null } },
        { auth: { currentUser: { uid: 'another-user' } } }, { currentUserRole: 'guest' }
    ]) {
        const harness = launcher();
        Object.assign(harness.context, change);
        await harness.context.openAieduePokemon(button());
        assert.equal(harness.imports, 0);
        assert.equal(harness.games.length, 0);
        assert.equal(harness.notices.length, 1);
    }
});

test('concurrent and later entries share one lazily loaded School controller', async () => {
    let release;
    const loading = new Promise((resolve) => { release = resolve; });
    const harness = launcher({ load: () => loading });
    assert.equal(harness.imports, 0);
    const firstButton = button(), secondButton = button();
    const first = harness.context.openAieduePokemon(firstButton);
    const second = harness.context.openAieduePokemon(secondButton);
    assert.equal(firstButton.disabled, true);
    assert.equal(secondButton.disabled, true);
    assert.equal(harness.imports, 1);
    release();
    await Promise.all([first, second]);
    await harness.context.openAieduePokemon(button());
    assert.equal(harness.imports, 1);
    assert.equal(harness.factories, 1);
    assert.deepEqual(harness.games, ['pokemon', 'pokemon', 'pokemon']);
    assert.equal(firstButton.disabled, false);
    assert.equal(secondButton.disabled, false);
});

test('shared entry reads the current account dynamically and updates spendable balances while preserving tokens', async () => {
    const harness = launcher();
    await harness.context.openAieduePokemon(button());
    let current = harness.options.getContext();
    assert.equal(current.authUser, harness.context.auth.currentUser);
    assert.equal(current.user.id, 'student-a');
    assert.equal(current.user.role, 'student');
    assert.equal(current.db, harness.context.db);
    harness.options.onBalanceChanged(2400, { uid: 'student-a' });
    assert.equal(harness.context.currentUserBalance, 2400);
    assert.equal(harness.context.currentUserCoins, 2400);
    assert.equal(harness.context.currentUserAeduTokens, 900);
    assert.equal(harness.context.currentUserProfileSnapshot.balance, 2400);
    assert.equal(harness.context.currentUserProfileSnapshot.coins, 2400);
    assert.equal(harness.context.currentUserProfileSnapshot.aeduTokens, 900);
    for (const id of ['dashboard-coins', 'dashboard-coins-header']) assert.equal(Number(harness.elements.get(id).innerText), 2400);
    assert.equal(harness.headers[0].coins, 2400);
    harness.context.auth.currentUser = { uid: 'teacher-b' };
    harness.context.currentUserId = 'teacher-b';
    harness.context.currentUserRole = 'teacher';
    current = harness.options.getContext();
    assert.equal(current.authUser.uid, 'teacher-b');
    assert.equal(current.user.id, 'teacher-b');
    assert.equal(current.user.role, 'teacher');
    harness.options.onBalanceChanged(9999, { uid: 'student-a' });
    assert.equal(harness.context.currentUserBalance, 2400, 'late callbacks cannot update a different account');
    harness.context.loginSuccess = false;
    assert.equal(harness.options.getContext().user, null);
    harness.options.notify('포켓몬 안내', '<안내 본문>');
    harness.options.notify('제목 안내');
    assert.deepEqual(harness.notices, ['&lt;안내 본문&gt;', '제목 안내']);
});

test('account or role changes during module loading cancel the pending entry', async () => {
    for (const change of [
        { loginSuccess: false }, { currentUserId: 'student-b' }, { currentUserRole: 'teacher' },
        { auth: { currentUser: { uid: 'student-a' } } }
    ]) {
        let release;
        const loading = new Promise((resolve) => { release = resolve; });
        const harness = launcher({ load: () => loading });
        const trigger = button();
        const pending = harness.context.openAieduePokemon(trigger);
        Object.assign(harness.context, change);
        release();
        await pending;
        assert.equal(harness.games.length, 0);
        assert.equal(trigger.disabled, false);
    }
});

test('BFCache restore destroys the used controller and permits a new entry', async () => {
    const harness = launcher();
    await harness.context.openAieduePokemon(button());
    const pageshow = harness.listeners.get('pageshow');
    assert.equal(typeof pageshow, 'function');
    await pageshow({ persisted: false });
    assert.deepEqual(harness.destroyed, []);
    await pageshow({ persisted: true });
    await Promise.resolve();
    assert.deepEqual(harness.destroyed, [1]);
    await harness.context.openAieduePokemon(button());
    assert.equal(harness.imports, 2);
    assert.equal(harness.factories, 2);
    assert.deepEqual(harness.games, ['pokemon', 'pokemon']);
});

test('failed loading restores the button and allows a fresh import on retry', async () => {
    let attempts = 0;
    const harness = launcher({ load() { if (++attempts === 1) throw new Error('offline'); } });
    const trigger = button();
    await harness.context.openAieduePokemon(trigger);
    assert.equal(trigger.disabled, false);
    assert.equal(harness.games.length, 0);
    assert.match(harness.notices[0], /포켓몬/);
    await harness.context.openAieduePokemon(trigger);
    assert.equal(harness.imports, 2);
    assert.equal(harness.factories, 1);
    assert.deepEqual(harness.games, ['pokemon']);
    assert.equal(trigger.disabled, false);
});

test('entry failure also restores the button without reloading the shared controller', async () => {
    let attempts = 0;
    const harness = launcher({ enter() { if (++attempts === 1) throw new Error('entry unavailable'); } });
    const trigger = button();
    await harness.context.openAieduePokemon(trigger);
    assert.equal(trigger.disabled, false);
    assert.match(harness.notices[0], /포켓몬/);
    await harness.context.openAieduePokemon(trigger);
    assert.equal(harness.imports, 1);
    assert.equal(harness.factories, 1);
    assert.equal(trigger.disabled, false);
});
