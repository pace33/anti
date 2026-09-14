import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '..', 'index.html'), 'utf8');
const css = readFileSync(resolve(here, '..', 'app.css'), 'utf8');
const refreshCss = readFileSync(resolve(here, '..', 'classroom-refresh.css'), 'utf8');
const app = readFileSync(resolve(here, '..', 'app.js'), 'utf8');

function between(start, end) {
  const from = html.indexOf(start);
  const to = html.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing start marker: ${start}`);
  assert.ok(to > from, `missing end marker after: ${start}`);
  return html.slice(from, to);
}

const drawingDashboard = between('id="drawing-activities-section"', 'id="dictation-activities-section"');
const drawingRecords = between('id="my-drawing-section"', 'id="drawing-workspace-section"');
const drawingWorkspace = between('id="drawing-workspace-section"', 'id="my-dictation-section"');

for (const [name, source, callback] of [
  ['drawing dashboard', drawingDashboard, 'openDashboard'],
  ['drawing records', drawingRecords, 'goDrawingDashboard'],
  ['drawing workspace', drawingWorkspace, 'goDrawingDashboard']
]) {
  assert.match(source, /drawing-branded-section/, `${name} must use the shared drawing shell`);
  assert.match(source, /class="drawing-brand-header[^>]*>[\s\S]*?<button[^>]*class="drawing-logo-button[^>]*>[\s\S]*?aiedu_hangul_logo\.webp[\s\S]*?<\/button>/, `${name} must have a native logo button in its brand header`);
  assert.match(source, /alt="에이두 한글"/, `${name} logo must have accessible alt text`);
  assert.match(source, new RegExp(`onclick="${callback}\\(\\)"`), `${name} logo must navigate correctly`);
}

assert.doesNotMatch(drawingRecords, /그리기 홈|완료한 미션과 내가 만든 작품을 한눈에 살펴봐요|>뒤로 가기</);
assert.doesNotMatch(drawingRecords, /drawing-page-heading/);
assert.match(drawingWorkspace, /id="drawing-workspace-brand-title">그림 미션<\/strong>/);
assert.doesNotMatch(drawingWorkspace, /drawing-workspace-top|drawing-workspace-badge|drawing-workspace-progress|drawing-workspace-title|drawing-workspace-desc/);
assert.doesNotMatch(drawingWorkspace, /drawing-new-template-btn|drawing-friends-btn|drawing-workspace-back-btn/);
assert.match(app, /const brandTitle = isShapeMission[\s\S]*?'도형 미션'[\s\S]*?'그림 미션'/);
assert.match(app, /brandTitleElement\.textContent = brandTitle/);
assert.doesNotMatch(app, /그림을 그린 뒤 AI 생성으로 AntiAI가 완성하게 해 보세요\.|선을 따라 그려보아요\./);
assert.match(drawingDashboard, /그림을 AI와 같이 만들어보아요/);
assert.match(drawingDashboard, /drawing-dashboard-content/);
assert.doesNotMatch(drawingDashboard, /aiedu_hangul_logo\.webp[^>]*style="[^"]*width:/, 'dashboard logo width must remain responsive');

assert.doesNotMatch(drawingDashboard, /id="drawing-tutorial-open-btn"|openDrawingTutorial\(\)/, 'drawing dashboard must not keep the obsolete drawing-only tutorial');
assert.match(html, /id="dashboard-tutorial-button"[\s\S]*?onclick="openRoleTutorial\(\)"/, 'dashboard must expose the replayable role tutorial at one fixed entry point');
assert.match(html, /id="student-onboarding-modal"[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"/, 'site-wide onboarding must use an accessible dialog');
assert.match(html, /id="student-onboarding-character"[\s\S]*?assets\/onboarding\/aiedue-wave\.webp/, 'site-wide onboarding must use the optimized official Aiedue onboarding asset');
assert.match(html, /id="student-onboarding-line"[\s\S]*?aria-live="polite"/, 'site-wide onboarding dialogue must announce each step');
assert.match(app, /ONBOARDING_DIALOGUE[\s\S]*?const TEACHER_ONBOARDING_DIALOGUE = Object\.freeze\(/, 'onboarding must define distinct student and teacher tracks');
assert.match(app, /function maybeStartStudentOnboarding\(profile[\s\S]*?currentUserRole === 'teacher'/, 'first-run onboarding must branch by authenticated role');
assert.match(app, /diagnosticStatus[\s\S]*?assignedLevel[\s\S]*?unlockedLevels/, 'student diagnostic assignment must be persisted in the profile contract');
assert.match(app, /function updateDashboardExperience\(userData = \{\}, options = \{\}\)[\s\S]*?options\.authoritative === true[\s\S]*?currentUserProfileSnapshot[\s\S]*?incomingUserData[\s\S]*?deriveStageAccessFromProfile\(userData\)/, 'partial dashboard refreshes must merge while authoritative snapshots replace cached diagnostic placement');
assert.ok((app.match(/updateDashboardExperience\(userData, \{ authoritative: true \}\)/g) || []).length >= 2, 'initial and live server profiles must use authoritative replacement semantics');
assert.match(app, /hasOwnProperty\.call\(profile, 'unlockedLevels'\)[\s\S]*?normalizeUnlockedLevels\(profile\.unlockedLevels, role\)/, 'teacher-managed student stage locks must remain effective after diagnostic placement');
assert.match(app, /const protectedStageSections = Object\.freeze\(\{[\s\S]*?'drawing-workspace-section': \[1\][\s\S]*?'letter-writing-section': \[2\][\s\S]*?'dictation-workspace-section': \[3\][\s\S]*?'word-card-table-game-section': \[3, 4\][\s\S]*?'literacy-workspace-section': \[4\]/, 'all nested stage sections and shared games must be mapped for live authorization changes');
assert.match(app, /function enforceCurrentStageAccess\(\)[\s\S]*?protectedStageSections[\s\S]*?allowedLevels\.some\(\(level\) => unlockedLevels\.includes\(level\)\)[\s\S]*?showDashboardOnly\(\)/, 'live authorization changes must eject students from every revoked stage-owned section');
assert.match(app, /currentUserProfileSyncGeneration \+= 1;[\s\S]*?const snapshotGeneration = \+\+currentUserProfileSyncGeneration[\s\S]*?snapshot\.exists\(\) \? \(snapshot\.data\(\) \|\| \{\}\) : \{\}[\s\S]*?snapshotGeneration !== currentUserProfileSyncGeneration/, 'live profile sync must ignore out-of-order snapshots and treat deleted profiles as authoritative empty data');
assert.match(app, /applyDashboardStageAccess\(unlockedLevels\);[\s\S]*?enforceCurrentStageAccess\(\);/, 'every dashboard profile refresh must enforce the current visible route');
assert.match(app, /function requireStageAccess\(level[\s\S]*?!loginSuccess[\s\S]*?!unlockedLevels\.includes\(Number\(level\)\)/, 'all direct stage entry points must use a fail-closed access guard');
for (const entryPoint of ['goHangulDashboard', 'openKoreanRecords', 'openKoreanMistakes', 'openKoreanTodayReview']) {
  assert.match(app, new RegExp(`${entryPoint}[^\\{]*\\{[\\s\\S]{0,180}?requireStageAccess\\(2, '2단계 한글'\\)`), `${entryPoint} must block direct access when level 2 is locked`);
}
assert.doesNotMatch(app, /localStorage/, 'the Korean site must not persist tutorial state in browser storage');
assert.match(app, /function closeStudentOnboarding\(\)[\s\S]*?roleOnboardingReturnFocus[\s\S]*?returnFocus\.focus\(\)/, 'onboarding close must restore focus');

assert.match(refreshCss, /body\.dashboard-view-active #dashboard-section \.dashboard-quick-actions\s*\{[\s\S]*?position:\s*absolute\s*!important;/, 'dashboard actions must be anchored inside the screen frame');
assert.match(refreshCss, /#main-container > \.aiedue-rpg-hud\s*\{[\s\S]*?position:\s*absolute\s*!important;/, 'information bar must be anchored inside the screen frame');
assert.match(css, /\.drawing-branded-section\s*\{/);
assert.match(css, /\.drawing-logo-button\s+\.login-mini-logo\s*\{/);
assert.match(css, /\.drawing-logo-button\s+\.login-mini-logo\s*\{[\s\S]*?margin-top:\s*0;/);
assert.match(css, /#my-drawing-section,\s*#drawing-workspace-section\s*\{[\s\S]*?justify-content:\s*flex-start\s*!important;[\s\S]*?overflow-y:\s*auto\s*!important;/);
assert.match(css, /@media \(min-width: 577px\) and \(max-height: 900px\)[\s\S]*?#drawing-workspace-section \{ padding-top: 124px !important; \}/);
assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.drawing-logo-button \.login-mini-logo \{ width: 104px; \}/);
assert.match(html, /aiedue-korean-build" content="[^"]+"/);
assert.match(html, /app\.css\?v=[^"]+"/);

console.log('drawing design consistency checks passed');
