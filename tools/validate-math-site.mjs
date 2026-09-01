import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mathRoot = resolve(root, 'math');
const read = (path) => readFileSync(resolve(mathRoot, path), 'utf8').replace(/\r\n/g, '\n');
const assert = (condition, message) => {
    if (!condition) throw new Error(message);
};

const requiredFiles = [
    'index.html',
    'style.css',
    'app.css',
    'math.css',
    'math-spiral.css',
    'math-domain-navigation.css',
    'firebase-config.js',
    'aiedu-data-adapter.js',
    'math-learning-records.mjs',
    'math-quality-core.mjs',
    'math.js',
    'math-services.js',
    'math-spiral.js',
    'math-domain-navigation.js',
    'aiedu_math_bg.svg',
    'aiedu_math_logo_cutout.png',
    'aiedu_bgm.mp3',
    'aiedu_click.mp3',
    'README.md'
];

requiredFiles.forEach((path) => {
    const target = resolve(mathRoot, path);
    assert(existsSync(target) && statSync(target).isFile(), `에이두 수학 필수 파일이 없습니다: ${path}`);
});

const index = read('index.html');
const math = read('math.js');
const services = read('math-services.js');
const spiral = read('math-spiral.js');
const navigation = read('math-domain-navigation.js');
const adapter = read('aiedu-data-adapter.js');
const records = read('math-learning-records.mjs');
const quality = read('math-quality-core.mjs');

[
    'dashboard-section',
    'spiral-map-section',
    'spiral-lesson-section',
    'math-review-section',
    'math-records-section',
    'math-class-section',
    'info-drawer',
    'aiedue-rpg-hud',
    'rpg-profile-menu',
    'rpg-action-tray',
    'result-modal',
    'settings-modal',
    'icon-modal'
].forEach((id) => assert(index.includes(`id="${id}"`), `index.html 필수 화면/모달이 없습니다: ${id}`));

[
    'toggleRpgHudPanel(this)',
    'toggleInfoDrawer()',
    'openAiedueMathShop()',
    'openMathTodayReview()',
    'openMathRecords()',
    'openMathClass()'
].forEach((marker) => assert(index.includes(marker), `공통 HUD 기능 연결이 없습니다: ${marker}`));

const runtimeSources = [math, services, spiral, navigation].join('\n');
[...index.matchAll(/\bonclick=["']\s*([A-Za-z_$][\w$]*)\s*\(/g)]
    .map((match) => match[1])
    .filter((name) => name !== 'location')
    .forEach((name) => {
        const exposed = new RegExp(`(?:window\\.)?${name}\\s*=|function\\s+${name}\\s*\\(`).test(runtimeSources);
        assert(exposed, `index.html의 onclick 함수가 구현되지 않았습니다: ${name}`);
    });

[
    'math.js',
    'math-services.js',
    'math-spiral.js',
    'math-domain-navigation.js'
].forEach((script) => assert(new RegExp(`src=["']${script.replace('.', '\\.')}(?:\\?[^"']*)?["']`).test(index), `index.html이 ${script}를 불러오지 않습니다.`));

assert(math.includes('from "./aiedu-data-adapter.js?v='), 'math.js가 에이두 데이터 서버 adapter를 사용하지 않습니다.');
assert(services.includes('from "./aiedu-data-adapter.js'), 'math-services.js가 에이두 데이터 서버 adapter를 사용하지 않습니다.');
assert(!math.includes('firebase-firestore.js') && !services.includes('firebase-firestore.js'), '수학 앱이 Firebase Firestore를 직접 import합니다.');
assert(!math.includes('firebase-storage.js') && !services.includes('firebase-storage.js'), '수학 앱이 Firebase Storage를 직접 import합니다.');
assert(adapter.includes("const DEFAULT_ENDPOINT = '/db-api/korean/v2';"), '수학 adapter 기본 endpoint가 에이두 데이터 서버가 아닙니다.');
assert(adapter.includes('firebaseBridge: config.firebaseBridge === true'), 'Firebase 데이터 bridge가 기본 비활성 opt-in이 아닙니다.');

for (const [path, source] of [
    ['math.js', math],
    ['math-services.js', services],
    ['math-spiral.js', spiral],
    ['math-domain-navigation.js', navigation]
]) {
    assert(!source.includes('localStorage') && !source.includes('sessionStorage'), `${path}에 브라우저 영구 저장 경로가 남아 있습니다.`);
}

const curriculumLessonCount = (spiral.match(/\blesson\('/g) || []).length;
assert(curriculumLessonCount === 51, '백업의 수학 나선형 교육과정 51개 개념이 보존되지 않았습니다.');
['number', 'relation', 'geometry', 'data'].forEach((domain) => {
    assert(spiral.includes(`id: '${domain}'`), `수학 교육과정 영역이 없습니다: ${domain}`);
});
['경험', '조작', '시각화', '기호화', '설명', '적용'].forEach((step) => {
    assert(spiral.includes(`'${step}'`), `6단계 학습 표현이 없습니다: ${step}`);
});
assert(spiral.includes('aiedueMathData') && spiral.includes('recordAttempt'), '나선형 학습이 서버 시도 기록 API와 연결되지 않았습니다.');
assert(math.includes('math-quality-core.mjs') && services.includes('math-quality-core.mjs'), '시간 퀴즈와 서버 보상이 공통 품질·보상 정책을 사용하지 않습니다.');
['generateClockTime', 'buildClockOptions', 'experienceForAttempt', 'calculateWalletReward'].forEach((name) => assert(quality.includes(`export function ${name}`), `수학 품질 코어 API가 없습니다: ${name}`));
assert(spiral.includes('auditAiedueMathQuestionQuality'), '수학 문제은행 무작위 품질 감사 API가 없습니다.');
assert(services.includes("'mathStudentProgress'") && services.includes("'mathAttempts'"), '수학 진도/시도 컬렉션 계약이 없습니다.');
assert(services.includes("'mathAssignments'"), '교사 수학 배정 컬렉션 계약이 없습니다.');
assert(services.includes("'shopItems'") && services.includes("'purchaseLog'") && services.includes('assignedShopItems'), '국어와 공유하는 상점 데이터 계약이 없습니다.');
[
    'buildMathProgressId',
    'applyMathAttempt',
    'buildMathAreaProgress',
    'summarizeMathStudentRecords',
    'buildMathWeeklyProgress',
    'buildMathGrowthRecommendations'
].forEach((name) => assert(records.includes(`export function ${name}`), `수학 기록 계산 API가 없습니다: ${name}`));

const ids = [...index.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, indexOfId) => ids.indexOf(id) !== indexOfId))];
assert(!duplicateIds.length, `index.html에 중복 id가 있습니다: ${duplicateIds.join(', ')}`);

const localReferencePattern = /\b(?:src|href)=["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/gi;
const referencedFiles = new Set();
for (const sourcePath of ['index.html', 'style.css', 'app.css', 'math.css', 'math-spiral.css', 'math-domain-navigation.css']) {
    const source = read(sourcePath);
    for (const match of source.matchAll(localReferencePattern)) {
        const raw = (match[1] || match[2] || '').trim();
        if (!raw || /^(?:[a-z]+:|\/\/|#|data:)/i.test(raw)) continue;
        const path = raw.split(/[?#]/, 1)[0];
        const target = resolve(mathRoot, dirname(sourcePath), path);
        const targetRelative = relative(mathRoot, target);
        const isMathLocal = targetRelative === '' || (!targetRelative.startsWith('..') && !isAbsolute(targetRelative));
        const isKoreanHomeLink = target === resolve(root, 'index.html');
        assert(isMathLocal || isKoreanHomeLink, `math 폴더 밖을 가리키는 참조입니다: ${raw}`);
        assert(existsSync(target) && statSync(target).isFile(), `${sourcePath}의 참조 파일이 없습니다: ${raw}`);
        referencedFiles.add(targetRelative);
    }
}

console.log(`에이두 수학 검증 완료: 필수 파일 ${requiredFiles.length}개, 개념 ${curriculumLessonCount}개, 로컬 참조 ${referencedFiles.size}개`);
