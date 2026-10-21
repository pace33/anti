// Reader v1: native word-boundary events drive highlights; engines without them use eojeol utterances.
const $ = (id) => document.getElementById(id);
const editor = $('editor'), sheet = $('sheet'), scroller = $('scroll-area');
const synth = window.speechSynthesis;
const KEY = 'aiedue.presentation-reader.v1';
let text = '', tokens = [], lines = [], bookmarkIndex = 0, bookmarkOffset = 0;
let reading = false, paused = false, generation = 0, currentIndex = -1, queueNext = 0;
let outstanding = 0, selectedVoice = null, voices = [], dirty = false, resizeFrame;
let wordFallback = false;
let storageAvailable = true;
let saved = {};
try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { storageAvailable = false; }
function save() {
  const value = { text, bookmarkOffset, rate: Number($('rate').value), fontSize: Number($('font-size').value), voice: $('voice').value };
  try { localStorage.setItem(KEY, JSON.stringify(value)); $('save-status').textContent = '이 기기에 자동 저장됨'; }
  catch { storageAvailable = false; $('save-status').textContent = '자동 저장 불가 · 원고를 따로 보관하세요'; }
}
function plainText() {
  // innerText adds an extra newline for Chromium's empty <div><br></div>.
  // Serialize editing blocks explicitly so blank paragraphs survive every reload.
  function read(parent) {
    return [...parent.childNodes].map((node, index) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      if (node.tagName === 'BR') return '\n';
      const block = ['DIV', 'P'].includes(node.tagName);
      const emptyBlock = block && node.childNodes.length === 1 && node.firstChild.nodeName === 'BR';
      return (block && index > 0 ? '\n' : '') + (emptyBlock ? '' : read(node));
    }).join('');
  }
  return read(editor).replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ');
}
function render(value) {
  text = value.replace(/\r\n?/g, '\n');
  tokens = []; const fragment = document.createDocumentFragment();
  let cursor = 0;
  for (const match of text.matchAll(/\S+/gu)) {
    if (match.index > cursor) fragment.append(document.createTextNode(text.slice(cursor, match.index)));
    const el = document.createElement('span'); el.className = 'word'; el.textContent = match[0];
    const token = { text: match[0], offset: match.index, end: match.index + match[0].length, el };
    el.dataset.index = String(tokens.length); tokens.push(token); fragment.append(el); cursor = token.end;
  }
  if (cursor < text.length) fragment.append(document.createTextNode(text.slice(cursor)));
  editor.replaceChildren(fragment); dirty = false;
  bookmarkIndex = Math.max(0, tokens.findIndex((token) => token.offset >= bookmarkOffset));
  if (tokens.length && bookmarkOffset > tokens.at(-1).offset) bookmarkIndex = tokens.length - 1;
  layout();
}
function syncEditing() {
  if (!dirty) return;
  const value = plainText(); render(value); save();
}
function layout() {
  const origin = sheet.getBoundingClientRect(); lines = [];
  tokens.forEach((token, index) => {
    const rect = token.el.getBoundingClientRect();
    const top = rect.top - origin.top, bottom = rect.bottom - origin.top;
    let line = lines.at(-1);
    if (!line || Math.abs(line.top - top) > 3) { line = { top, bottom, first: index, last: index }; lines.push(line); }
    else { line.last = index; line.bottom = Math.max(line.bottom, bottom); }
  });
  const line = lines.find((item) => item.first <= bookmarkIndex && item.last >= bookmarkIndex);
  if (line) { bookmarkIndex = line.first; bookmarkOffset = tokens[bookmarkIndex].offset; }
  positionBookmark(); if (currentIndex >= 0) highlight(currentIndex, false);
}
function positionBookmark() {
  const line = lines.find((item) => item.first === bookmarkIndex) || lines[0];
  $('bookmark').style.top = `${line ? line.top - 5 : parseFloat(getComputedStyle(sheet).paddingTop)}px`;
  const lineNumber = line ? lines.indexOf(line) + 1 : 1;
  $('bookmark-handle').setAttribute('aria-label', `읽기 시작 ${lineNumber}번째 줄. 위아래로 드래그하거나 방향키로 이동`);
}
function clearHighlight() {
  if (currentIndex >= 0) tokens[currentIndex]?.el.classList.remove('speaking');
  $('active-line').hidden = true;
}
function highlight(index, follow = true) {
  clearHighlight(); currentIndex = index;
  const token = tokens[index]; if (!token) return;
  token.el.classList.add('speaking');
  const line = lines.find((item) => item.first <= index && item.last >= index);
  if (line) {
    $('active-line').style.top = `${line.top - 5}px`;
    $('active-line').style.height = `${line.bottom - line.top + 10}px`;
    $('active-line').hidden = false;
    if (follow) {
      const viewport = scroller.getBoundingClientRect(), rect = token.el.getBoundingClientRect();
      if (rect.top < viewport.top + 22 || rect.bottom > viewport.bottom - 55) scroller.scrollTop += rect.top - viewport.top - viewport.height * .3;
    }
  }
}
function status(message) { $('play-status').textContent = message; }
function updatePlay() {
  $('play').textContent = reading ? 'Ⅱ 일시정지' : paused ? '▶ 이어 읽기' : '▶ 재생';
  $('play').setAttribute('aria-pressed', String(reading));
  editor.setAttribute('contenteditable', String(!reading));
}
function stop({ keepPosition = false } = {}) {
  generation++; reading = false; outstanding = 0;
  if (synth) synth.cancel();
  paused = keepPosition; updatePlay();
}
function setBookmark(line, { reveal = false } = {}) {
  if (!line) return;
  stop(); clearHighlight(); currentIndex = -1;
  bookmarkIndex = line.first; bookmarkOffset = tokens[bookmarkIndex]?.offset || 0;
  positionBookmark(); save(); status(`${lines.indexOf(line) + 1}번째 줄부터 읽어요.`);
  if (reveal) tokens[bookmarkIndex]?.el.scrollIntoView({ block: 'center', behavior: 'instant' });
}
function finish(run) {
  if (run !== generation) return;
  reading = false; paused = false; updatePlay(); clearHighlight(); currentIndex = -1;
  status('원고를 끝까지 읽었어요. 재생하면 책갈피부터 다시 읽어요.');
}
function fillQueue(run) {
  if (!reading || run !== generation) return;
  // Natural sentence speech on boundary-capable engines. Short, bounded chunks
  // also avoid Chromium's long-utterance timeout. Never estimate word timings.
  while (outstanding < (wordFallback ? 3 : 1) && queueNext < tokens.length) {
    const first = queueNext;
    let last = first;
    if (!wordFallback) {
      while (last + 1 < tokens.length) {
        if (/[.!?。！？][’”'"」』)]*$/u.test(tokens[last].text)) break;
        if (text.slice(tokens[last].end, tokens[last + 1].offset).includes('\n')) break;
        if (tokens[last + 1].end - tokens[first].offset > 180) break;
        last++;
      }
    }
    queueNext = last + 1;
    const startOffset = tokens[first].offset;
    const utterance = new SpeechSynthesisUtterance(text.slice(startOffset, tokens[last].end));
    utterance.lang = selectedVoice?.lang || 'ko-KR';
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = Number($('rate').value); utterance.pitch = 1;
    let boundaries = 0;
    const show = (index) => { highlight(index); status(`읽는 중 · ${index + 1} / ${tokens.length}어절`); };
    utterance.onstart = () => { if (run === generation && reading) show(first); };
    utterance.onboundary = (event) => {
      if (run !== generation || !reading || event.name !== 'word') return;
      boundaries++;
      const offset = startOffset + event.charIndex;
      let index = first;
      while (index < last && tokens[index + 1].offset <= offset) index++;
      show(index);
    };
    utterance.onend = () => {
      if (run !== generation || !reading) return;
      outstanding--;
      // Some mobile/cloud voices never send word-boundary events. Switch to
      // actual one-eojeol utterances instead of displaying fake timed highlights.
      if (!boundaries && last > first) wordFallback = true;
      if (queueNext >= tokens.length && outstanding === 0) finish(run);
      else fillQueue(run);
    };
    utterance.onerror = (event) => {
      if (run !== generation || !reading) return;
      if (['interrupted', 'canceled'].includes(event.error)) return;
      stop({ keepPosition: true });
      status(event.error === 'not-allowed' ? '브라우저에서 음성 재생을 허용한 뒤 다시 눌러 주세요.' : '음성을 재생하지 못했어요. 다른 목소리를 선택하고 다시 눌러 주세요.');
    };
    outstanding++; synth.speak(utterance);
  }
}
function start() {
  syncEditing();
  if (!synth || !('SpeechSynthesisUtterance' in window)) { status('이 브라우저는 음성 읽기를 지원하지 않아요. Chrome 또는 Edge에서 열어 주세요.'); return; }
  if (!tokens.length) { status('먼저 원고를 입력해 주세요.'); editor.focus(); return; }
  const startIndex = paused && currentIndex >= 0 ? currentIndex : bookmarkIndex;
  stop(); clearHighlight();
  reading = true; paused = false; queueNext = startIndex; outstanding = 0;
  const run = generation; updatePlay(); status('목소리를 준비하고 있어요…');
  fillQueue(run);
}
$('play').onclick = () => {
  if (reading) { stop({ keepPosition: true }); status('잠시 멈췄어요. 이어 읽기를 누르면 현재 어절부터 읽어요.'); }
  else start();
};
$('reset').onclick = () => {
  syncEditing(); stop(); clearHighlight(); currentIndex = -1;
  bookmarkIndex = 0; bookmarkOffset = 0; positionBookmark(); scroller.scrollTop = 0;
  save(); status('책갈피를 처음으로 옮겼어요.');
};
editor.addEventListener('input', () => {
  if (reading || paused) { stop(); clearHighlight(); currentIndex = -1; }
  dirty = true; text = plainText();
  $('active-line').hidden = true; save();
});
editor.addEventListener('blur', syncEditing);
editor.addEventListener('paste', (event) => {
  event.preventDefault();
  const value = event.clipboardData.getData('text/plain');
  const selection = window.getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0); range.deleteContents();
  const node = document.createTextNode(value); range.insertNode(node); range.setStartAfter(node); range.collapse(true);
  selection.removeAllRanges(); selection.addRange(range);
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste' }));
});
function loadVoices() {
  if (!synth) return;
  const chosen = $('voice').value || saved.voice || '';
  voices = synth.getVoices().filter((voice) => /^ko(?:-|_)/i.test(voice.lang));
  $('voice').replaceChildren(new Option('한국어 기본 목소리', ''));
  voices.forEach((voice) => $('voice').append(new Option(voice.name, voice.voiceURI)));
  if (voices.some((voice) => voice.voiceURI === chosen)) $('voice').value = chosen;
  selectedVoice = voices.find((voice) => voice.voiceURI === $('voice').value) || voices.find((voice) => voice.default) || voices[0] || null;
}
if (synth) { synth.addEventListener('voiceschanged', loadVoices); loadVoices(); }
$('voice').onchange = () => { const restart = reading; if (restart) stop({ keepPosition: true }); selectedVoice = voices.find((voice) => voice.voiceURI === $('voice').value) || voices[0] || null; save(); if (restart) start(); };
$('rate').oninput = () => { $('rate-value').value = `${Number($('rate').value).toFixed(1)}×`; save(); };
$('rate').onchange = () => { if (reading) { stop({ keepPosition: true }); start(); } };
$('font-size').oninput = () => { $('font-value').value = $('font-size').value; sheet.style.setProperty('--script-font', `${$('font-size').value}px`); syncEditing(); layout(); save(); };
let dragging = false, dragY = 0, dragFrame = 0;
const handle = $('bookmark-handle');
function moveDrag() {
  if (!dragging) return;
  const view = scroller.getBoundingClientRect();
  if (dragY < view.top + 45) scroller.scrollTop -= Math.min(20, (view.top + 45 - dragY) / 3);
  if (dragY > view.bottom - 45) scroller.scrollTop += Math.min(20, (dragY - view.bottom + 45) / 3);
  const y = dragY - sheet.getBoundingClientRect().top;
  const line = lines.reduce((best, item) => !best || Math.abs(item.top - 5 - y) < Math.abs(best.top - 5 - y) ? item : best, null);
  if (line && line.first !== bookmarkIndex) {
    bookmarkIndex = line.first; bookmarkOffset = tokens[bookmarkIndex]?.offset || 0; positionBookmark();
    status(`${lines.indexOf(line) + 1}번째 줄부터 읽어요.`);
  }
  dragFrame = requestAnimationFrame(moveDrag);
}
handle.onpointerdown = (event) => {
  if (event.button !== 0) return;
  event.preventDefault(); syncEditing(); stop(); clearHighlight(); currentIndex = -1; layout();
  dragging = true; dragY = event.clientY; handle.setPointerCapture(event.pointerId);
  handle.classList.add('dragging'); document.body.classList.add('dragging'); moveDrag();
};
handle.onpointermove = (event) => { if (dragging) dragY = event.clientY; };
function endDrag() { dragging = false; cancelAnimationFrame(dragFrame); handle.classList.remove('dragging'); document.body.classList.remove('dragging'); save(); }
handle.onpointerup = endDrag; handle.onpointercancel = endDrag; handle.onlostpointercapture = () => { if (dragging) endDrag(); };
handle.onkeydown = (event) => {
  let position = lines.findIndex((line) => line.first === bookmarkIndex);
  if (event.key === 'ArrowDown') position++;
  else if (event.key === 'ArrowUp') position--;
  else if (event.key === 'Home') position = 0;
  else if (event.key === 'End') position = lines.length - 1;
  else return;
  event.preventDefault(); setBookmark(lines[Math.max(0, Math.min(lines.length - 1, position))], { reveal: true });
};
new ResizeObserver(() => { cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { if (!dirty) layout(); }); }).observe(editor);
let elapsed = 0, timerStart = 0, timerRunning = false, timerFrame = 0;
function paintTimer() {
  const ms = elapsed + (timerRunning ? performance.now() - timerStart : 0);
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60), seconds = totalSeconds % 60, tenth = Math.floor(ms / 100) % 10;
  $('time').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenth}`;
  if (timerRunning) timerFrame = requestAnimationFrame(paintTimer);
}
$('timer-toggle').onclick = () => {
  if (timerRunning) { elapsed += performance.now() - timerStart; timerRunning = false; cancelAnimationFrame(timerFrame); }
  else { timerRunning = true; timerStart = performance.now(); }
  $('timer-toggle').textContent = timerRunning ? '일시정지' : elapsed ? '계속' : '시작'; paintTimer();
};
$('timer-reset').onclick = () => { timerRunning = false; elapsed = 0; cancelAnimationFrame(timerFrame); $('timer-toggle').textContent = '시작'; paintTimer(); };
window.addEventListener('pagehide', () => { if (dirty) text = plainText(); save(); stop(); });
$('rate').value = String(Math.max(.5, Math.min(1.6, Number(saved.rate) || 1)));
$('rate-value').value = `${Number($('rate').value).toFixed(1)}×`;
$('font-size').value = String(Math.max(16, Math.min(36, Number(saved.fontSize) || 22)));
$('font-value').value = $('font-size').value; sheet.style.setProperty('--script-font', `${$('font-size').value}px`);
bookmarkOffset = Math.max(0, Number(saved.bookmarkOffset) || 0);
if (typeof saved.text === 'string') render(saved.text);
else {
  try { const response = await fetch('sample.txt'); if (!response.ok) throw new Error('sample'); render(await response.text()); }
  catch { render(''); }
}
if (!storageAvailable) $('save-status').textContent = '자동 저장 불가 · 원고를 따로 보관하세요';
document.documentElement.dataset.readerReady = 'true';
