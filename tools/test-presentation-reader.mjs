import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
const file = (name) => readFileSync(new URL(`../reader/${name}`, import.meta.url), 'utf8');
const js = file('app.js'), html = file('index.html'), css = file('style.css');
test('reader is a valid browser module', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {input:js,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});
test('minimal editor/right sidebar and independent stopwatch controls exist', () => {
  for (const id of ['editor','bookmark-handle','play','reset','voice','rate','font-size','timer-toggle','timer-reset','time']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(css,/grid-template-columns:minmax\(0,1fr\) 260px/);
  assert.match(js,/utterance\.onboundary/);assert.match(js,/event\.charIndex/);assert.match(js,/utterance\.onstart/);
  assert.match(js,/setPointerCapture/);assert.match(js,/performance\.now\(\)/);
  assert.doesNotMatch(js,/\.innerHTML\s*=/);
});
test('long user manuscript is shipped without truncation', () => {
  const text = file('sample.txt');
  assert.ok(text.match(/\S+/g).length>900);
  assert.ok(text.startsWith('안녕하세요. 에이두 한글. 발표 시작하겠습니다.'));
  assert.ok(text.trimEnd().endsWith('감사합니다.'));
});
test('contenteditable serialization preserves blank blocks, nested word spans and plain text', () => {
  const begin=js.indexOf('function plainText() {'),end=js.indexOf('\nfunction render(',begin);
  assert.ok(begin>=0&&end>begin);
  const text=(value)=>({nodeType:3,textContent:value});
  const element=(tag,...nodes)=>({nodeType:1,tagName:tag,nodeName:tag,childNodes:nodes,firstChild:nodes[0]});
  const br=element('BR');
  const serialize=(nodes)=>vm.runInNewContext(`${js.slice(begin,end)}; plainText()`,{Node:{TEXT_NODE:3,ELEMENT_NODE:1},editor:{childNodes:nodes}});
  assert.equal(serialize([text('첫 문장'),element('DIV',br),element('DIV',text('둘째 문장')),element('DIV',text('셋째 문장'))]),'첫 문장\n\n둘째 문장\n셋째 문장');
  assert.equal(serialize([element('SPAN',text('원고')),text(' '),element('SPAN',text('<img>')),text('\n\n끝')]),'원고 <img>\n\n끝');
  assert.equal(serialize([text('공백\u00a0보존')]),'공백 보존');
  assert.equal(serialize([]),'');
});
