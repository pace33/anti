export function normalizeStudentNames(names) {
    if (!Array.isArray(names) || !names.length || names.length > 40) throw new Error('한 번에 1~40명의 이름을 입력해 주세요.');
    return names.map((name, index) => {
        const value = String(name || '').trim();
        if (!value || value.length > 30) throw new Error(`이름 ${index + 1}에 1~30자의 이름을 입력해 주세요.`);
        return value;
    });
}

export function buildNewStudentProfile({ uid, name, code, timestamp, teacherId }) {
    return {
        uid, name, email: `${code}@abc.com`, userCode: code, role: 'student',
        coins: 0, balance: 0, portfolio: {},
        drawingPortfolio: { missions: {}, free: [] }, dictationPortfolio: { missions: {}, aiWords: [] },
        aeduTokens: 0, aeduExperience: 0, aeduLevel: 1,
        currentLearningStep: -1, currentDrawingStep: -1, currentDictationStep: -1,
        warningTokens: 0, createdAt: timestamp,
        ...(teacherId ? { teacherId, classId: teacherId, createdBy: teacherId } : {})
    };
}

const FAILURE_LABELS = Object.freeze({
    duplicate: '로그인 번호 중복',
    auth: '계정 인증',
    profile: '학생 정보 저장',
    enrollment: '학급 연결',
    code: '로그인 번호 발급',
    unknown: '알 수 없는 오류'
});

export function classifyProvisionError(error, phase = '') {
    if (error?.failureType && FAILURE_LABELS[error.failureType]) return error.failureType;
    if (error?.code === 'auth/email-already-in-use') return 'duplicate';
    if (String(error?.code || '').startsWith('auth/') || phase === 'auth' || phase === 'identity') return 'auth';
    if (phase === 'profile') return 'profile';
    if (phase === 'enrollment') return 'enrollment';
    if (phase === 'code') return 'code';
    return 'unknown';
}

export function provisionFailureLabel(type) {
    return FAILURE_LABELS[type] || FAILURE_LABELS.unknown;
}

export function summarizeProvisionRows(rows) {
    const complete = rows.filter(row => row.status === 'complete').length;
    const failed = rows.filter(row => row.status === 'failed').length;
    return { complete, failed, pending: rows.length - complete - failed, total: rows.length };
}

// Each row keeps its reserved number, Auth uid, and profile checkpoint across retries.
// Every row owns its catch so one failure can never discard the remaining results.
export async function provisionStudentRows(rows, service, onChange = () => {}) {
    // Rendering/sessionStorage failures must not interrupt account provisioning.
    const emit = row => { try { onChange(row); } catch { /* best-effort progress reporting */ } };
    for (const row of rows) {
        if (row.status === 'complete') continue;
        let phase = 'auth';
        try {
            service.assertTeacher();
            row.status = 'working';
            row.error = '';
            row.failureType = '';
            emit(row);
            phase = 'code';
            if (!row.code) { row.code = await service.reserveCode(); emit(row); }
            service.assertTeacher();
            phase = 'identity';
            if (!row.uid) { row.uid = await service.createIdentity(row.code, row); emit(row); }
            service.assertTeacher();
            phase = 'profile';
            if (service.createProfile && !row.profileCreated) {
                await service.createProfile(row);
                row.profileCreated = true;
                emit(row);
            }
            service.assertTeacher();
            phase = 'enrollment';
            await service.saveAndEnroll(row);
            row.status = 'complete';
        } catch (error) {
            row.status = 'failed';
            row.error = error?.message || '다시 시도해 주세요.';
            row.failureType = classifyProvisionError(error, phase);
        }
        emit(row);
    }
    return rows;
}

export const CURRENCY_ASSETS = Object.freeze([100, 500, 1000, 5000, 10000, 50000].map(value => ({
    value, label: `${value.toLocaleString('ko-KR')}원`, src: `assets/classroom/currency-${value}.png`, coin: value < 1000
})));

export function escapePrintHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function rosterMarkup(students) {
    return `<table class="roster"><thead><tr><th scope="col">로그인 번호</th><th scope="col">이름</th></tr></thead><tbody>${students.map(student => `<tr><td>${escapePrintHtml(student.userCode ?? student.code ?? student.studentCode ?? '미등록')}</td><td>${escapePrintHtml(student.name || '이름 없음')}</td></tr>`).join('')}</tbody></table>`;
}

export function shopMarkup(items, safeImage) {
    const rows = [];
    for (let i = 0; i < items.length; i += 3) {
        rows.push(`<tr>${Array.from({ length: 3 }, (_, column) => {
            const item = items[i + column];
            if (!item) return '<td class="empty"></td>';
            const image = safeImage(item.imageUrl);
            return `<td><article>${image ? `<img src="${escapePrintHtml(image)}" alt="${escapePrintHtml(item.name)}">` : '<div class="no-image">그림 없음</div>'}<h2>${escapePrintHtml(item.name)}</h2><p>${escapePrintHtml(item.description || '설명 없음')}</p><strong>${Math.max(0, Math.floor(Number(item.price) || 0)).toLocaleString('ko-KR')}점</strong></article></td>`;
        }).join('')}</tr>`);
    }
    return `<table class="shop"><tbody>${rows.join('')}</tbody></table>`;
}
