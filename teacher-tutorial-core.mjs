const orb = '#aiedue-rpg-hud .rpg-profile-portrait';
const stages = [1, 2, 3, 4].map(level => `#card-level-${level}`);
export const TEACHER_TUTORIAL_VERSION = 'teacher-spotlight-v2';
export const TEACHER_TUTORIAL_STEPS = Object.freeze([
    { id: 'hello', pose: 'wave', text: '안녕하세요 선생님! 항상 아이들을 가르치시느라 고생이 많으시겠어요.' },
    { id: 'introduce', pose: 'welcome', text: '전 선생님의 수업 부담을 줄이고! 아이들의 한글 공부도 도와줄 수 있는 에이두라고 합니다.' },
    { id: 'experience', pose: 'grow', targets: [orb], text: '에이두 한글은 이 경험치와 레벨!이 아이들의 공부 원동력이 되어줄 건데요!' },
    { id: 'level-up', pose: 'grow', targets: [orb], text: '1, 2, 3, 4단계 공부를 할 때마다 경험치가 차고! 경험치가 다 차면 레벨 업을 합니다.' },
    { id: 'rewards', view: 'wallet', pose: 'grow', targets: [orb, '#aiedue-rpg-hud .rpg-wallet-line'], text: '레벨업을 하면 여기 에이두 포인트가 1000원 지급되고, 주의토큰은 하나가 감소돼요. (주의토큰이 하나 있을 때마다 강화물을 받는 상점 가격이 +1배만큼 비싸진답니다!)' },
    { id: 'stages', targets: stages, text: '일단 이 에이두 한글은 총 4단계로 있어요.' },
    { id: 'drawing', targets: [stages[0]], text: '그 중에 1단계는 그리기! 아직은 한글을 습득하지 못했고, 수업 습관 및 태블릿 사용 연습이 필요한 친구들을 위해 있는 단계에요.' },
    { id: 'decoding', targets: [stages[1]], text: '그 다음 2단계는 한글 해득! 이제 태블릿 사용에 어느 정도 익숙하고, 한글을 배울 준비가 된 친구들을 위해 있는 단계에요.' },
    { id: 'dictation', targets: [stages[2]], text: '그 다음 3단계는 교과 맞춤쓰기! 한글을 이제 안다면, 다양한 어휘를 알아보고 읽고 쓸 차례죠! 단어와 문장 읽기 및 쓰기를 일상과 연계해서 공부하는 단계에요.' },
    { id: 'literacy', targets: [stages[3]], text: '그 다음 4단계는 문해력! 3단계에서 등록한 단어들이 포함된 지문을 읽고 다양한 난이도와 유형으로 문해력 향상 문제를 풀며 문해력을 향상시키는 단계에요.' },
    { id: 'diagnostic', pose: 'think', text: '학생들이 가입하고 나면 진단 평가를 가볍게 진행 후 필요한 단계에서 공부할 수 있게 했으니 학생 계정으로도 한번 확인해보세요! (선생님이 학생들의 단계를 잠그고 해제할 수도 있어요!)' },
    { id: 'open-class', pose: 'think', targets: ['#dashboard-teacher-class-button'], click: 'class', clickLabel: '학급 관리', text: '아.. 학생들의 계정이 혹시 없을까요? 그럼 학급 관리를 눌러보세요!' },
    { id: 'add-students', view: 'class', targets: ['#class-new-students-button'], click: 'new-students', clickLabel: '신규 학생 추가', text: '학생이 없다면 신규 학생 추가 버튼을 눌러보실래요?' },
    { id: 'student-dialog', view: 'new-students', targets: ['#new-class-students-dialog'], text: '이제 여기서 학생들 계정을 한번에 여러개 만들 수 있어요! 가입된 친구들은 바로 내 학급으로 등록되니까 걱정마세요!' },
    { id: 'points', view: 'points', targets: ['[data-class-tab="points"]', '#class-management-points-panel'], text: '추가된 학생은 여기 포인트 탭에서 돈(포인트)과 주의토큰을 지급하고 차감할 수 있어요! 로그인 번호도 바로 볼 수 있구요!' },
    { id: 'progress', view: 'progress', targets: ['[data-class-tab="progress"]', '#class-management-progress-panel'], text: '학생의 학습 단계를 설정하고 싶거나 진도를 보고 싶다면 이 단계별 진도를!' },
    { id: 'shop', view: 'shop', targets: ['[data-class-tab="shop"]', '#class-management-shop-panel'], text: '상점 물품을 추가하고 수정도 하고 그러고 싶다면 이 상점 물품 관리를 눌러주세요!' },
    { id: 'money-button', view: 'shop', targets: ['#class-currency-button'], text: '1단계 수준의 학생의 화폐 교육을 위해서 종이 화폐도 준비해놨으니 필요하시면 이 종이 화폐 출력을 누르시고!' },
    { id: 'money-dialog', view: 'currency', targets: ['#class-currency-dialog'], text: '필요하신 화폐를 눌러서 출력해서 사용하세요!' },
    { id: 'explore', pose: 'welcome', text: '제가 말씀드린 내용 말고도 알려드릴 게 많지만, 다른 기능은 하나 하나 직접 써보시는 거를 추천 드릴게요!' },
    { id: 'replay', targets: ['#dashboard-tutorial-button'], text: '다시 내용을 알려드려야 한다면 언제든 이 튜토리얼 버튼을 눌러주세요!' },
    { id: 'goodbye', pose: 'celebrate', text: '그럼, 오늘도 좋은 하루 되세요!' }
].map(step => Object.freeze({ view: 'dashboard', pose: 'welcome', targets: [], ...step })));

// Navigation is separate from rendering so async saves and click gates are testable.
export function createTeacherTutorialController(host) {
    let active = false, busy = false, index = 0, uid = null, revision = 0, error = '';
    const state = () => ({ active, busy, index, uid, error, step: TEACHER_TUTORIAL_STEPS[index] });
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
    async function prepare() { await host.prepare(TEACHER_TUTORIAL_STEPS[index], uid); }
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
                if (index === TEACHER_TUTORIAL_STEPS.length - 1) {
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
        async retry() { await run(prepare); },
        stop
    };
}
