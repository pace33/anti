import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const fail = (message) => {
    throw new Error(message);
};
const assert = (condition, message) => {
    if (!condition) fail(message);
};

const requiredFiles = [
    'index.html',
    'app.js',
    'app.css',
    'style.css',
    'firebase-config.js',
    'drawing.html',
    'hangul.html',
    'dictation.html',
    'literacy.html',
    'aiedu_bgm.mp3',
    'aiedu_click.mp3',
    'aiedu_korean_logo.webp',
    'aiedu_korean_nature_bg.webp',
    'aiedu_korean_dashboard_nature_bg.webp',
    'baby_giyeok.webp',
    'mom_ah.webp'
];

requiredFiles.forEach((path) => assert(existsSync(resolve(root, path)), `필수 파일이 없습니다: ${path}`));

const index = read('index.html');
const app = read('app.js');
const appCss = read('app.css');
const styleCss = read('style.css');

assert(/<script\s+type=["']module["']\s+src=["']app\.js(?:\?[^"']*)?["']\s*>/i.test(index), 'index.html이 app.js 모듈을 불러오지 않습니다.');
assert(/<link\s+rel=["']stylesheet["']\s+href=["']app\.css(?:\?[^"']*)?["']/i.test(index), 'index.html이 app.css를 불러오지 않습니다.');
assert(!/<script\s+type=["']module["']\s*>/i.test(index), 'index.html에 인라인 모듈 스크립트가 다시 들어왔습니다.');

[
    'aiedueKoreanDrawings',
    'saveDrawingRecordToFirebase',
    'sanitizeModalHtml',
    'enhanceInteractiveSemantics'
].forEach((marker) => assert(app.includes(marker), `app.js 필수 기능이 없습니다: ${marker}`));

[
    'anti-db/db-api',
    'korean-db/db-api',
    'school-firestore-adapter',
    'localStorage',
    'sessionStorage'
].forEach((marker) => assert(!app.includes(marker), `app.js에 사용 중단한 저장 경로가 있습니다: ${marker}`));

['.skip-link', ':focus-visible', 'prefers-reduced-motion', 'forced-colors'].forEach((marker) => {
    assert(appCss.includes(marker), `app.css 접근성 스타일이 없습니다: ${marker}`);
});

const localReferencePattern = /\b(?:src|href)=["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/gi;
const checkedReferences = new Set();
for (const [sourcePath, source] of [['index.html', index], ['app.css', appCss], ['style.css', styleCss]]) {
    for (const match of source.matchAll(localReferencePattern)) {
        const raw = (match[1] || match[2] || '').trim();
        if (!raw || /^(?:[a-z]+:|\/\/|#|data:)/i.test(raw)) continue;
        const withoutSuffix = raw.split(/[?#]/, 1)[0];
        const target = resolve(root, dirname(sourcePath), withoutSuffix);
        assert(target.startsWith(`${root}/`) || target === root, `저장소 밖을 가리키는 참조입니다: ${raw}`);
        assert(existsSync(target) && statSync(target).isFile(), `${sourcePath}의 참조 파일이 없습니다: ${raw}`);
        checkedReferences.add(relative(root, target));
    }
}

const forbiddenNames = [
    /^aidu$/,
    /평가문장/i,
    /^pptx_output/i,
    /^out_utf8\.txt$/i,
    /^all_slides\.txt$/i,
    /^mattress_comparison\.html$/i,
    /^school-firestore-adapter\.js$/i
];

readdirSync(root).forEach((name) => {
    assert(!forbiddenNames.some((pattern) => pattern.test(name)), `배포 루트에 제외 대상이 있습니다: ${name}`);
});

const oldRasterReferences = [...checkedReferences].filter((path) => ['.png', '.jpg', '.jpeg'].includes(extname(path).toLowerCase()));
assert(oldRasterReferences.length === 0, `최적화되지 않은 로컬 래스터 참조가 있습니다: ${oldRasterReferences.join(', ')}`);

console.log(`사이트 검증 완료: 필수 파일 ${requiredFiles.length}개, 로컬 참조 ${checkedReferences.size}개`);
