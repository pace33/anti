const orb = '#aiedue-rpg-hud .rpg-profile-portrait';
const stages = [1, 2, 3, 4].map(level => `#card-level-${level}`);
export const TEACHER_TUTORIAL_VERSION = 'teacher-spotlight-v2';
export const TEACHER_TUTORIAL_STEPS = Object.freeze([
    { id: 'hello', pose: 'wave', text: '안녕하세요, 선생님. 늘 아이들을 정성껏 지도해 주셔서 감사합니다.' },
    { id: 'introduce', pose: 'welcome', text: '저는 선생님의 수업 준비 부담을 덜어 드리고, 아이들의 한글 학습을 돕는 에이두입니다.' },
    { id: 'experience', pose: 'grow', targets: [orb], text: '에이두 한글에서는 경험치와 레벨이 아이들의 즐거운 학습 동기를 높이는 데 도움을 줍니다.' },
    { id: 'level-up', pose: 'grow', targets: [orb], text: '아이들이 1단계부터 4단계까지 학습할 때마다 경험치가 쌓이며, 경험치를 모두 채우면 레벨이 올라갑니다.' },
    { id: 'rewards', view: 'wallet', pose: 'grow', targets: [orb, '#aiedue-rpg-hud .rpg-wallet-line'], text: '레벨이 오르면 에이두 포인트 1,000원이 지급되고 주의 토큰 1개가 줄어듭니다. 주의 토큰 1개당 상점의 강화물 가격은 기본 가격의 1배만큼 추가됩니다.' },
    { id: 'stages', targets: stages, text: '에이두 한글의 학습 과정은 모두 4단계로 구성되어 있습니다.' },
    { id: 'drawing', targets: [stages[0]], text: '1단계는 그리기입니다. 한글을 배우기 전 수업 습관을 익히고 태블릿 사용을 연습하는 아이들을 위한 단계입니다.' },
    { id: 'decoding', targets: [stages[1]], text: '2단계는 한글 해득입니다. 태블릿 사용에 익숙해지고 한글을 본격적으로 배울 준비가 된 아이들을 위한 단계입니다.' },
    { id: 'dictation', targets: [stages[2]], text: '3단계는 교과 맞춤쓰기입니다. 다양한 어휘를 익히고 단어와 문장을 읽고 쓰는 활동을 일상과 연계하여 학습합니다.' },
    { id: 'literacy', targets: [stages[3]], text: '4단계는 문해력입니다. 3단계에서 등록한 단어가 포함된 지문을 읽고, 다양한 난이도와 유형의 문제를 풀며 문해력을 기릅니다.' },
    { id: 'diagnostic', pose: 'think', text: '학생은 가입 후 간단한 진단 평가를 거쳐 필요한 단계부터 학습할 수 있습니다. 학생 계정에서도 확인해 주세요. 선생님께서 학생별 학습 단계를 잠그거나 해제하실 수도 있습니다.' },
    { id: 'open-class', pose: 'think', targets: ['#dashboard-teacher-class-button'], click: 'class', clickLabel: '학급 관리', text: '아직 학생 계정이 준비되지 않았다면, 학급 관리 버튼을 눌러 주세요.' },
    { id: 'add-students', view: 'class', targets: ['#class-new-students-button'], click: 'new-students', clickLabel: '신규 학생 추가', text: '학생 계정을 만들려면 신규 학생 추가 버튼을 눌러 주세요.' },
    { id: 'student-dialog', view: 'new-students', targets: ['#new-class-students-dialog'], text: '이 화면에서 여러 학생의 계정을 한 번에 만들 수 있습니다. 생성된 학생 계정은 선생님의 학급에 바로 등록됩니다.' },
    { id: 'points', view: 'points', targets: ['[data-class-tab="points"]', '#class-management-points-panel'], text: '포인트 탭에서는 학생에게 포인트와 주의 토큰을 지급하거나 차감할 수 있으며, 로그인 번호도 확인할 수 있습니다.' },
    { id: 'progress', view: 'progress', targets: ['[data-class-tab="progress"]', '#class-management-progress-panel'], text: '학생의 학습 단계를 설정하거나 학습 진도를 확인하려면 단계별 진도 탭을 이용해 주세요.' },
    { id: 'shop', view: 'shop', targets: ['[data-class-tab="shop"]', '#class-management-shop-panel'], text: '상점 물품을 추가하거나 수정하려면 상점 물품 관리 탭을 이용해 주세요.' },
    { id: 'money-button', view: 'shop', targets: ['#class-currency-button'], text: '1단계 학생의 화폐 학습에 활용할 수 있도록 종이 화폐 자료도 준비했습니다. 필요하시면 종이 화폐 출력 버튼을 눌러 주세요.' },
    { id: 'money-dialog', view: 'currency', targets: ['#class-currency-dialog'], text: '수업에 필요한 화폐를 선택하여 출력해 사용하실 수 있습니다.' },
    { id: 'explore', pose: 'welcome', text: '소개해 드린 기능 외에도 다양한 기능이 준비되어 있습니다. 수업 상황에 맞게 하나씩 활용해 보시기를 권해 드립니다.' },
    { id: 'replay', targets: ['#dashboard-tutorial-button'], text: '안내를 다시 확인하고 싶으실 때는 언제든지 튜토리얼 버튼을 눌러 주세요.' },
    { id: 'goodbye', pose: 'celebrate', text: '안내를 확인해 주셔서 감사합니다. 오늘도 좋은 하루 보내세요.' }
].map(step => Object.freeze({ view: 'dashboard', pose: 'welcome', targets: [], ...step })));

// Navigation is separate from rendering so async saves and click gates are testable.
export function createTeacherTutorialController(host, steps = TEACHER_TUTORIAL_STEPS) {
    let active = false, busy = false, index = 0, uid = null, revision = 0, error = '';
    const state = () => ({ active, busy, index, uid, error, step: steps[index] });
    const emit = () => host.render(state());
    const current = token => active && revision === token && host.session() === uid;
    function stop(completed = false) {
        if (!active) return;
        active = false; busy = false; error = ''; revision += 1;
        host.close({ completed });
    }
    async function run(work) {
        if (!active || busy) return;
        if (host.session() !== uid) { stop(); return; }
        const token = revision;
        busy = true; error = ''; emit();
        try {
            await work(token);
        } catch (cause) {
            if (current(token)) error = cause?.message || '화면을 불러오지 못했어요. 다시 시도해 주세요.';
        } finally {
            if (current(token)) { busy = false; emit(); }
            else if (active && revision === token) stop();
        }
    }
    async function prepare() { await host.prepare(steps[index], uid); }
    return {
        state,
        async start() {
            if (active || !host.session()) return;
            uid = host.session(); active = true; index = 0; revision += 1;
            host.open();
            await run(prepare);
        },
        async next() {
            if (!active || busy || error || state().step.click) return;
            await run(async token => {
                if (index === steps.length - 1) {
                    await host.complete(uid);
                    if (current(token)) stop(true);
                } else { index += 1; await prepare(); }
            });
        },
        async activate(action) {
            if (!active || busy || error || state().step.click !== action) return;
            await run(async token => {
                await host.activate(action, uid);
                if (!current(token)) return;
                index += 1; await prepare();
            });
        },
        async previous() {
            if (index < 1) return;
            await run(async () => { index -= 1; await prepare(); });
        },
        async skip() {
            if (!active || busy) return;
            await run(async token => {
                await host.complete(uid);
                if (current(token)) stop(true);
            });
        },
        async retry() { await run(prepare); },
        stop
    };
}
