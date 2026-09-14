import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '..', 'index.html'), 'utf8');
const css = readFileSync(resolve(here, '..', 'app.css'), 'utf8');
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

assert.match(drawingDashboard, /id="drawing-tutorial-open-btn"[\s\S]*?onclick="openDrawingTutorial\(\)"/, 'drawing dashboard must keep a replayable tutorial button');
assert.match(html, /id="drawing-tutorial-modal"[\s\S]*?role="dialog"[\s\S]*?aria-modal="true"/, 'drawing tutorial must use an accessible dialog');
assert.match(html, /drawing-tutorial-character[\s\S]*?assets\/aiedue-literacy-detective\.webp/, 'tutorial must reuse an existing official Aiedue character asset');
assert.match(html, /id="drawing-tutorial-dialogue"[\s\S]*?aria-live="polite"/, 'tutorial dialogue must announce each step');
assert.match(app, /const DRAWING_TUTORIAL_STEPS = Object\.freeze\(\{[\s\S]*?student:[\s\S]*?teacher:/, 'tutorial must define distinct student and teacher tracks');
assert.match(app, /function getDrawingTutorialRole\(\)[\s\S]*?currentUserRole === 'teacher'/, 'tutorial must select steps from the authenticated role');
assert.match(app, /function getDrawingTutorialStorageKey\(\)[\s\S]*?currentUserId[\s\S]*?getDrawingTutorialRole/, 'first-run state must be scoped by user and role');
assert.match(app, /const completedDrawingTutorials = new Set\(\)[\s\S]*?completedDrawingTutorials\.has\(key\)[\s\S]*?completedDrawingTutorials\.add\(key\)/, 'tutorial first-run state must stay scoped to the authenticated session without browser storage');
assert.doesNotMatch(app, /localStorage/, 'the Korean site must not persist tutorial state in browser storage');
assert.match(app, /maybeOpenDrawingTutorial/, 'drawing entry must support first-run tutorial display');
assert.match(app, /closeDrawingTutorial\(\)[\s\S]*?drawingTutorialReturnFocus/, 'tutorial close must restore focus');

assert.match(css, /\.drawing-branded-section\s*\{/);
assert.match(css, /\.drawing-logo-button\s+\.login-mini-logo\s*\{/);
assert.match(css, /\.drawing-logo-button\s+\.login-mini-logo\s*\{[\s\S]*?margin-top:\s*0;/);
assert.match(css, /#my-drawing-section,\s*#drawing-workspace-section\s*\{[\s\S]*?justify-content:\s*flex-start\s*!important;[\s\S]*?overflow-y:\s*auto\s*!important;/);
assert.match(css, /@media \(min-width: 577px\) and \(max-height: 900px\)[\s\S]*?#drawing-workspace-section \{ padding-top: 124px !important; \}/);
assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.drawing-logo-button \.login-mini-logo \{ width: 104px; \}/);
assert.match(html, /aiedue-korean-build" content="[^"]+"/);
assert.match(html, /app\.css\?v=[^"]+"/);

console.log('drawing design consistency checks passed');
