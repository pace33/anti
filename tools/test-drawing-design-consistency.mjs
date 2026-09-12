import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(here, '..', 'index.html'), 'utf8');
const css = readFileSync(resolve(here, '..', 'app.css'), 'utf8');

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

assert.match(drawingRecords, /완료한 미션과 내가 만든 작품을 한눈에 살펴봐요/);
assert.match(drawingWorkspace, /<strong>그림 작업실<\/strong>/);
assert.match(drawingDashboard, /drawing-dashboard-content/);
assert.doesNotMatch(drawingDashboard, /aiedu_hangul_logo\.webp[^>]*style="[^"]*width:/, 'dashboard logo width must remain responsive');

assert.match(css, /\.drawing-branded-section\s*\{/);
assert.match(css, /\.drawing-logo-button\s+\.login-mini-logo\s*\{/);
assert.match(css, /\.drawing-logo-button\s+\.login-mini-logo\s*\{[\s\S]*?margin-top:\s*0;/);
assert.match(css, /#my-drawing-section,\s*#drawing-workspace-section\s*\{[\s\S]*?justify-content:\s*flex-start\s*!important;[\s\S]*?overflow-y:\s*auto\s*!important;/);
assert.match(css, /@media \(min-width: 577px\) and \(max-height: 900px\)[\s\S]*?#drawing-workspace-section \{ padding-top: 124px !important; \}/);
assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.drawing-logo-button \.login-mini-logo \{ width: 104px; \}/);
assert.match(html, /aiedue-korean-build" content="[^"]+"/);
assert.match(html, /app\.css\?v=[^"]+"/);

console.log('drawing design consistency checks passed');
