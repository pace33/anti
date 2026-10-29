import { getApps, initializeApp } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js';
import { firebaseConfig } from './firebase-config.js';

const auth = getAuth(getApps()[0] || initializeApp(firebaseConfig));
const base = '/db-api/korean/v2/notices';
const dialog = document.createElement('dialog');
dialog.id = 'korean-notices-dialog';
dialog.className = 'korean-notices-dialog';
dialog.setAttribute('aria-labelledby', 'notices-heading');
dialog.innerHTML = `
    <header class="notices-header"><div><p class="notices-eyebrow">에이두 한글</p><h2 id="notices-heading">공지</h2></div><button type="button" id="notices-close" aria-label="공지 닫기">✕</button></header>
    <p class="notices-description">운영자와 관리자가 전하는 소식을 누구나 볼 수 있어요.</p>
    <p id="notices-status" role="status" aria-live="polite"></p>
    <section id="notices-list-view"><div class="notices-toolbar"><span>전체 공지</span><div><button type="button" id="notices-refresh">새로고침</button><button type="button" id="notices-write" class="notice-primary" hidden>공지 쓰기</button></div></div><div id="notices-list"></div><button type="button" id="notices-more" hidden>더 보기</button></section>
    <section id="notices-detail" hidden><div class="notices-toolbar"><button type="button" data-notices-back>← 목록</button><div id="notices-manage" hidden><button type="button" id="notices-edit">수정</button><button type="button" id="notices-delete" class="notice-danger">삭제</button></div></div><h3 id="notice-title" tabindex="-1"></h3><p id="notice-meta" class="notice-meta"></p><div id="notice-content" class="notice-content"></div><a id="notice-attachment" class="notice-attachment" hidden>첨부파일 다운로드</a></section>
    <form id="notices-form" hidden><h3 id="notices-form-heading">공지 쓰기</h3><label>제목<input id="notice-title-input" name="title" maxlength="120" required placeholder="공지 제목"></label><label>내용<textarea id="notice-content-input" name="content" maxlength="30000" required rows="12" placeholder="모두에게 알릴 내용을 적어 주세요."></textarea></label><label>첨부 링크 <small>선택 · 에이두 데이터서버 공유 링크</small><input id="notice-url-input" name="attachmentUrl" type="url" maxlength="512" placeholder="https://aiedue.ddns.net/db-cloud/…/download"></label><label>첨부파일 이름 <small>선택</small><input id="notice-filename-input" name="attachmentName" maxlength="180" placeholder="파일 이름.hwp"></label><div class="notices-form-actions"><button type="button" id="notices-cancel">취소</button><button type="submit" id="notices-save" class="notice-primary">게시하기</button></div></form>`;
document.body.append(dialog);
const el = id => dialog.querySelector('#' + id);
for (let index = 2; index <= 3; index++) {
    const group = document.createElement('div');
    group.innerHTML = `<label>첨부 링크 ${index} <small>선택 · 에이두 데이터서버 공유 링크</small><input id="notice-url-input-${index}" name="attachmentUrl${index}" type="url" maxlength="512" placeholder="https://aiedue.ddns.net/db-cloud/…/download"></label><label>첨부파일 ${index} 이름 <small>선택</small><input id="notice-filename-input-${index}" name="attachmentName${index}" maxlength="180"></label>`;
    el('notices-form').insertBefore(group, dialog.querySelector('.notices-form-actions'));
}
const attachmentPattern = /^https:\/\/aiedue\.ddns\.net\/db-cloud\/cloud_[a-f0-9]+(?:\/download)?$/;
function attachmentsOf(notice) { return notice?.attachments ?? (notice?.attachmentUrl ? [{ url: notice.attachmentUrl, name: notice.attachmentName }] : []); }
let canManage = false, selected = null, editing = null, nextCursor = null;
let listGeneration = 0, detailGeneration = 0, authGeneration = 0, accessGeneration = 0, busy = false;
let returnFocus = null;
const seen = new Set();
const dateText = value => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(value));
function status(message = '') { el('notices-status').textContent = message; }
function view(name) {
    el('notices-list-view').hidden = name !== 'list'; el('notices-detail').hidden = name !== 'detail'; el('notices-form').hidden = name !== 'form';
}
function permissions(value) {
    canManage = value === true;
    el('notices-write').hidden = !canManage; el('notices-manage').hidden = !canManage;
    if (!canManage && !el('notices-form').hidden) { editing = null; el('notices-form').reset(); view('list'); }
}
async function request(path = '', options = {}, authenticated = false) {
    const generation = authGeneration, user = auth.currentUser;
    const headers = { 'Content-Type': 'application/json' };
    if (authenticated) {
        if (!user) throw new Error('로그인 후 이용해 주세요.');
        headers.Authorization = 'Bearer ' + await user.getIdToken();
        if (generation !== authGeneration || auth.currentUser?.uid !== user.uid) throw new Error('로그인 상태가 바뀌었습니다. 다시 열어 주세요.');
    }
    const response = await fetch(base + path, { cache: 'no-store', ...options, headers });
    const data = await response.json();
    if (authenticated && (generation !== authGeneration || auth.currentUser?.uid !== user.uid)) throw new Error('로그인 상태가 바뀌었습니다. 다시 열어 주세요.');
    if (!response.ok) throw new Error(data.error || '공지를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
    return data;
}
async function loadAccess() {
    const attempt = ++accessGeneration, generation = authGeneration;
    permissions(false);
    if (!auth.currentUser) return;
    try { const result = await request('/access', {}, true); if (attempt === accessGeneration && generation === authGeneration) permissions(result.canManage); }
    catch { if (attempt === accessGeneration && generation === authGeneration) permissions(false); }
}
function card(notice) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'notice-card'; button.dataset.noticeId = notice.id;
    const title = document.createElement('strong'); title.textContent = notice.title;
    const meta = document.createElement('span'); meta.textContent = `${dateText(notice.createdAt)} · ${notice.authorName}`;
    button.append(title, meta); button.addEventListener('click', () => openDetail(notice.id)); return button;
}
async function loadList(append = false) {
    const generation = ++listGeneration; ++detailGeneration; selected = null; view('list'); status('공지를 불러오는 중…');
    el('notices-more').disabled = true;
    if (!append) { nextCursor = null; seen.clear(); el('notices-list').replaceChildren(); }
    const cursor = nextCursor;
    try {
        const result = await request(cursor ? '?before=' + encodeURIComponent(cursor) : '');
        if (generation !== listGeneration || !dialog.open) return;
        for (const notice of result.notices) if (!seen.has(notice.id)) { seen.add(notice.id); el('notices-list').append(card(notice)); }
        nextCursor = result.nextCursor; el('notices-more').hidden = !nextCursor;
        status(seen.size ? '' : '아직 등록된 공지가 없습니다.');
    } catch (error) { if (generation === listGeneration) status(error.message); }
    finally { if (generation === listGeneration) el('notices-more').disabled = false; }
}
async function openDetail(id) {
    ++listGeneration; const generation = ++detailGeneration; status('공지를 불러오는 중…');
    try {
        const { notice } = await request('/' + encodeURIComponent(id));
        if (generation !== detailGeneration || !dialog.open) return;
        selected = notice; view('detail'); status();
        el('notice-title').textContent = notice.title;
        el('notice-meta').textContent = `${notice.authorName} · ${dateText(notice.createdAt)}${notice.revision > 1 ? ' · 수정됨' : ''}`;
        el('notice-content').textContent = notice.content;
        dialog.querySelectorAll('.notice-extra-attachment').forEach(node => node.remove());
        const attachment = el('notice-attachment'); attachment.hidden = true; attachment.removeAttribute('href');
        for (const [index, item] of attachmentsOf(notice).entries()) {
            if (!attachmentPattern.test(item.url)) continue;
            const link = index === 0 ? attachment : document.createElement('a');
            link.className = 'notice-attachment' + (index ? ' notice-extra-attachment' : '');
            link.href = item.url; link.textContent = '↓ ' + (item.name || '첨부파일 다운로드'); link.hidden = false;
            if (index) el('notices-detail').append(link);
        }
        el('notices-manage').hidden = !canManage;
        el('notice-title').focus({ preventScroll: true });
    } catch (error) { if (generation === detailGeneration) status(error.message); }
}
function openForm(notice = null) {
    if (!canManage || busy) return;
    ++listGeneration; ++detailGeneration; editing = notice; el('notices-form').reset();
    el('notices-form-heading').textContent = notice ? '공지 수정' : '공지 쓰기'; el('notices-save').textContent = notice ? '수정하기' : '게시하기';
    el('notice-title-input').value = notice?.title || ''; el('notice-content-input').value = notice?.content || '';
    const items = attachmentsOf(notice);
    el('notice-url-input').value = items[0]?.url || ''; el('notice-filename-input').value = items[0]?.name || '';
    for (let index = 2; index <= 3; index++) {
        el('notice-url-input-' + index).value = items[index - 1]?.url || '';
        el('notice-filename-input-' + index).value = items[index - 1]?.name || '';
    }
    status(); view('form'); el('notice-title-input').focus();
}
function working(value) { busy = value; for (const id of ['notices-save','notices-cancel','notices-delete','notices-edit','notices-write']) el(id).disabled = value; }
async function openNotices(id) {
    returnFocus = document.activeElement;
    if (!dialog.open) dialog.showModal();
    void loadAccess(); await loadList(); if (id && dialog.open) await openDetail(id);
}
el('notices-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => { ++listGeneration; ++detailGeneration; ++accessGeneration; editing = null; el('notices-form').reset(); returnFocus?.focus?.({ preventScroll: true }); });
el('notices-refresh').addEventListener('click', () => { void loadAccess(); void loadList(); });
el('notices-more').addEventListener('click', () => loadList(true));
dialog.querySelectorAll('[data-notices-back]').forEach(button => button.addEventListener('click', () => loadList()));
el('notices-write').addEventListener('click', () => openForm());
el('notices-edit').addEventListener('click', () => openForm(selected));
el('notices-cancel').addEventListener('click', () => { editing = null; el('notices-form').reset(); void loadList(); });
el('notices-form').addEventListener('submit', async event => {
    event.preventDefault(); if (busy || !canManage) return;
    const form = event.currentTarget, notice = editing, generation = authGeneration;
    const fields = Object.fromEntries(new FormData(form));
    const attachments = [1, 2, 3].map(index => {
        const suffix = index === 1 ? '' : index;
        return { url: fields['attachmentUrl' + suffix].trim(), name: fields['attachmentName' + suffix].trim() };
    }).filter(item => item.url);
    const body = { title: fields.title, content: fields.content, attachments }; if (notice) body.revision = notice.revision;
    working(true); status('공지를 저장하는 중…');
    try {
        const { notice: saved } = await request(notice ? '/' + encodeURIComponent(notice.id) : '', { method: notice ? 'PATCH' : 'POST', body: JSON.stringify(body) }, true);
        if (generation !== authGeneration) return;
        form.reset(); editing = null;
        if (dialog.open) { selected = saved; await openDetail(saved.id); status(notice ? '공지를 수정했습니다.' : '공지를 게시했습니다.'); }
    } catch (error) { if (generation === authGeneration) status(error.message); }
    finally { working(false); }
});
el('notices-delete').addEventListener('click', async () => {
    if (busy || !canManage || !selected || !confirm('이 공지를 삭제할까요? 삭제하면 모두에게 보이지 않습니다.')) return;
    const notice = selected, generation = authGeneration; working(true); status('공지를 삭제하는 중…');
    try { await request('/' + encodeURIComponent(notice.id) + '?revision=' + notice.revision, { method: 'DELETE' }, true); if (generation === authGeneration && dialog.open) { await loadList(); status('공지를 삭제했습니다.'); } }
    catch (error) { if (generation === authGeneration) status(error.message); }
    finally { working(false); }
});
document.querySelectorAll('[data-open-notices]').forEach(button => button.addEventListener('click', () => openNotices()));
onAuthStateChanged(auth, () => { ++authGeneration; ++accessGeneration; permissions(false); editing = null; el('notices-form').reset(); if (dialog.open) { void loadAccess(); void loadList(); } });
const linkedId = new URL(location.href).searchParams.get('notice');
if (linkedId && /^notice_[a-f0-9-]{36}$/.test(linkedId)) void openNotices(linkedId);
