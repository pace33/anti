import { normalizeStudentNames, provisionStudentRows, provisionFailureLabel, summarizeProvisionRows, CURRENCY_ASSETS, escapePrintHtml as esc, rosterMarkup, shopMarkup } from './classroom-tools-core.mjs';

const PRINT_STYLE = `@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:'Noto Sans KR',Arial,sans-serif;color:#172b3a;margin:24px}h1{font-size:28px;margin:0 0 8px}header p{font-size:14px;margin:0 0 18px}table{width:100%;border-collapse:collapse;table-layout:fixed}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:2px solid #354b5d;padding:12px;overflow-wrap:anywhere}th{background:#edf5f3;font-size:22px}.roster td{font-size:28px;font-weight:800;text-align:center}.roster td:first-child{font-variant-numeric:tabular-nums;letter-spacing:.08em}.shop td{width:33.333%;vertical-align:top;padding:10px}.shop img,.no-image{width:100%;height:40mm;object-fit:contain}.no-image{display:grid;place-items:center;background:#f4f5f6}.shop h2{font-size:21px;margin:10px 0}.shop p{font-size:15px;line-height:1.55;white-space:pre-wrap}.shop strong{font-size:24px;color:#172b3a}.empty{border:0}.toolbar{position:sticky;top:0;background:white;padding:12px 0;display:flex;gap:12px;align-items:center}button{padding:12px 20px;font-size:17px;font-weight:bold;cursor:pointer}button:disabled{cursor:wait}#print-status{font-size:14px}@media print{body{margin:0}.toolbar{display:none}header{break-after:avoid}img{print-color-adjust:exact}}`;

async function openPrintPreview(title) {
    const popup = window.open(new URL('classroom-print.html', import.meta.url).href, '_blank');
    if (!popup) throw new Error('인쇄 창을 열 수 없어요. 브라우저에서 팝업을 허용해 주세요.');
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('인쇄 창을 불러오지 못했어요. 다시 시도해 주세요.')), 15000);
        popup.addEventListener('load', () => { clearTimeout(timeout); resolve(); }, { once: true });
    });
    if (popup.closed) throw new Error('인쇄 창이 닫혔어요.');
    popup.document.title = title;
    const style = popup.document.createElement('style'); style.textContent = PRINT_STYLE; popup.document.head.appendChild(style);
    popup.document.body.innerHTML = `<div class="toolbar"><button id="print-button" disabled>인쇄 / PDF 저장</button><span id="print-status" role="status">자료를 불러오는 중…</span></div><header><h1>${esc(title)}</h1><p>에이두 한글 · ${esc(new Date().toLocaleDateString('ko-KR'))}</p></header><main></main>`;
    popup.document.getElementById('print-button').onclick = () => popup.print();
    return popup;
}

async function finishPrintPreview(popup, markup) {
    if (popup.closed) return;
    popup.document.querySelector('main').innerHTML = markup;
    const images = [...popup.document.images];
    await Promise.all(images.map(image => new Promise(resolve => {
        if (image.complete) return resolve();
        const timeout = setTimeout(resolve, 20000);
        image.onload = image.onerror = () => { clearTimeout(timeout); resolve(); };
    })));
    if (popup.closed) return;
    if (images.some(image => !image.complete || !image.naturalWidth)) {
        popup.document.getElementById('print-status').textContent = '일부 그림을 불러오지 못했어요. 창을 닫고 다시 출력해 주세요.';
        return;
    }
    popup.document.getElementById('print-status').textContent = '인쇄 준비 완료 · A4 세로 · PDF로 저장할 수도 있어요.';
    popup.document.getElementById('print-button').disabled = false;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function installClassroomTools(service) {
    let dialog, rows = [], busy = false, owner = '', previousFocus;
    function persist() { sessionStorage.setItem(`aiedu-new-students:${owner}`, JSON.stringify(rows)); }
    function close() { if (!busy) { dialog.close(); previousFocus?.focus(); } }
    function render() {
        const summary = summarizeProvisionRows(rows);
        dialog.innerHTML = `<form method="dialog" class="classroom-dialog-content"><div class="classroom-dialog-heading"><h2 id="new-students-title">신규 학생 추가</h2><button type="button" data-close ${busy ? 'disabled' : ''} aria-label="닫기">✕</button></div><p>이름을 입력하면 로그인 번호가 만들어지고 우리 학급에 바로 추가됩니다. 같은 이름의 학생도 각각 가입할 수 있어요.</p><div class="classroom-name-list">${rows.map((row, i) => `<div class="classroom-name-row"><label for="new-student-${i}">이름 ${i + 1}</label><input id="new-student-${i}" data-name="${i}" maxlength="30" value="${esc(row.name)}" ${busy || row.code ? 'disabled' : ''} autocomplete="off"><button type="button" data-remove="${i}" ${busy || row.code || rows.length === 1 ? 'disabled' : ''} aria-label="이름 ${i + 1} 삭제">삭제</button><span class="classroom-row-status ${row.status === 'failed' ? 'failed' : ''}">${row.status === 'complete' ? `완료 · 로그인 번호 ${esc(row.code)}` : row.status === 'working' ? '가입 및 학급 연결 중…' : row.status === 'failed' ? `실패(${esc(provisionFailureLabel(row.failureType))}) · ${esc(row.error)} · 다시 시도 가능` : ''}</span></div>`).join('')}</div><div class="classroom-dialog-footer"><button type="button" data-add ${busy || rows.length >= 40 ? 'disabled' : ''}>＋ 이름 추가</button><span role="status" aria-live="polite">${summary.complete}명 완료${summary.failed ? ` · ${summary.failed}명 실패` : ''} · 전체 ${summary.total}명</span><button type="button" class="classroom-primary" data-submit ${busy || rows.every(row => row.status === 'complete') ? 'disabled' : ''}>${busy ? '신규 추가 중…' : rows.some(row => row.status === 'failed') ? '실패한 학생 다시 시도' : '신규 추가'}</button></div></form>`;
        dialog.querySelector('[data-close]').onclick = close;
        dialog.querySelectorAll('[data-name]').forEach(input => input.oninput = () => { rows[Number(input.dataset.name)].name = input.value; persist(); });
        dialog.querySelectorAll('[data-remove]').forEach(button => button.onclick = () => { rows.splice(Number(button.dataset.remove), 1); persist(); render(); });
        dialog.querySelector('[data-add]').onclick = () => { rows.push({ name: '', status: 'new' }); persist(); render(); dialog.querySelector(`[data-name="${rows.length - 1}"]`).focus(); };
        dialog.querySelector('[data-submit]').onclick = submit;
        dialog.querySelector('form').onsubmit = event => { event.preventDefault(); submit(); };
    }
    async function submit() {
        if (busy) return;
        try { service.assertTeacher(owner); const names = normalizeStudentNames(rows.map(row => row.name)); rows.forEach((row, i) => row.name = names[i]); }
        catch (error) { dialog.querySelector('[role="status"]').textContent = error.message; return; }
        busy = true; render();
        try {
            await provisionStudentRows(rows, service.studentService(owner), () => { persist(); render(); });
        } catch (error) {
            // Row failures are already retained and categorized. Never replace successful rows.
            service.notify(error.message || '학생 추가 결과를 저장하지 못했어요.');
        }
        finally {
            busy = false; persist(); render();
            try { service.assertTeacher(owner); await service.refreshStudents(); }
            catch { /* Session changes must not refresh another teacher's class. */ }
        }
    }
    window.openNewClassStudents = () => {
        try {
            if (busy) return;
            owner = service.assertTeacher();
            if (!dialog) {
                dialog = document.createElement('dialog'); dialog.className = 'classroom-dialog'; dialog.id = 'new-class-students-dialog';
                dialog.setAttribute('aria-labelledby', 'new-students-title');
                dialog.addEventListener('cancel', event => { if (busy) event.preventDefault(); });
                document.body.appendChild(dialog);
            }
            try { rows = JSON.parse(sessionStorage.getItem(`aiedu-new-students:${owner}`) || '[]'); } catch { rows = []; }
            if (!Array.isArray(rows) || !rows.length || rows.every(row => row.status === 'complete')) rows = [{ name: '', status: 'new' }];
            previousFocus = document.activeElement; render(); dialog.showModal(); dialog.querySelector('input:not(:disabled)')?.focus();
            return dialog;
        } catch (error) { service.notify(error.message); }
    };
    async function print(kind) {
        let popup;
        try {
            const teacher = service.assertTeacher();
            popup = await openPrintPreview(kind === 'roster' ? '우리 학급 명단' : '우리 학급 상점');
            const items = await (kind === 'roster' ? service.getStudents() : service.getShopItems());
            service.assertTeacher(teacher);
            const printImage = value => {
                const safe = service.safeImage(value);
                return safe ? new URL(safe, document.baseURI).href : '';
            };
            await finishPrintPreview(popup, !items.length ? '<p>등록된 항목이 없습니다.</p>' : kind === 'roster' ? rosterMarkup(items) : shopMarkup(items, printImage));
        } catch (error) {
            if (popup && !popup.closed) popup.document.getElementById('print-status').textContent = `불러오기 실패: ${error.message}`;
            else service.notify(error.message);
        }
    }
    window.printClassRoster = () => print('roster');
    window.printClassShop = () => print('shop');
    window.openClassCurrency = () => {
        try { service.assertTeacher(); } catch (error) { service.notify(error.message); return; }
        const moneyDialog = document.createElement('dialog'); moneyDialog.className = 'classroom-dialog'; moneyDialog.id = 'class-currency-dialog';
        moneyDialog.setAttribute('aria-labelledby', 'currency-title');
        moneyDialog.innerHTML = `<div class="classroom-dialog-content"><div class="classroom-dialog-heading"><h2 id="currency-title">종이 화폐 출력</h2><button aria-label="닫기" data-close>✕</button></div><p>금액별 원본 그림 또는 여러 장을 배치한 A4 PDF를 받으세요.</p><div class="classroom-currency-grid">${CURRENCY_ASSETS.map(asset => `<article><img src="${asset.src}" alt="에이두 ${asset.label}"><h3>${asset.label}</h3><a href="${asset.src}" download="에이두-${asset.value}원.png">원본 PNG</a><button data-money="${asset.value}">A4 PDF 다운로드</button></article>`).join('')}</div><p data-money-status role="status" aria-live="polite"></p></div>`;
        moneyDialog.querySelector('[data-close]').onclick = () => moneyDialog.close();
        moneyDialog.onclose = () => moneyDialog.remove();
        moneyDialog.querySelectorAll('[data-money]').forEach(button => button.onclick = async () => {
            button.disabled = true;
            const status = moneyDialog.querySelector('[data-money-status]');
            status.textContent = '인쇄용 PDF를 만드는 중…';
            try {
                const asset = CURRENCY_ASSETS.find(item => item.value === Number(button.dataset.money));
                const response = await fetch(asset.src);
                if (!response.ok) throw new Error('화폐 그림을 불러오지 못했어요.');
                const pdf = await service.PDFDocument.create();
                const image = await pdf.embedPng(await response.arrayBuffer());
                const page = pdf.addPage([595.28, 841.89]);
                const columns = asset.coin ? 4 : 2, rowCount = asset.coin ? 5 : 4;
                const cellW = 539 / columns, cellH = 760 / rowCount;
                const scale = Math.min((cellW - 10) / image.width, (cellH - 12) / image.height);
                for (let r = 0; r < rowCount; r++) for (let c = 0; c < columns; c++) {
                    const width = image.width * scale, height = image.height * scale;
                    page.drawImage(image, { x: 28 + c * cellW + (cellW - width) / 2, y: 805 - r * cellH - (cellH + height) / 2, width, height });
                }
                downloadBlob(new Blob([await pdf.save()], { type: 'application/pdf' }), `에이두-${asset.value}원-A4.pdf`);
                status.textContent = `${asset.label} A4 PDF를 다운로드했어요.`;
            } catch (error) { status.textContent = `${error.message} 다시 시도해 주세요.`; }
            finally { button.disabled = false; }
        });
        document.body.appendChild(moneyDialog); moneyDialog.showModal();
        return moneyDialog;
    };
}
