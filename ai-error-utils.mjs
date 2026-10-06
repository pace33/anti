const CODES = new Set(['AI-1001','AI-1002','AI-1003','AI-1004','AI-1005','AI-1006','AI-1007','AI-1008','AI-1009','AI-1099']);
export function aiErrorCode(error, status) {
    const code = error?.errorCode || error?.code || error?.error?.code;
    if (CODES.has(code)) return code;
    const message = String(typeof error === 'string' ? error : error?.message || error?.error?.message || error?.error || '').toLowerCase();
    const embedded = message.match(/\bAI-(?:100[1-9]|1099)\b/i)?.[0]?.toUpperCase();
    if (CODES.has(embedded)) return embedded;
    const http = Number(status || error?.statusCode || error?.status);
    if (http === 429 || /resource_exhausted|rate limit|quota/.test(message)) return 'AI-1003';
    if (http === 504 || /timed? ?out|timeout|시간.*초과/.test(message)) return 'AI-1002';
    if (http === 401 || /unauthorized|not logged|authentication/.test(message)) return 'AI-1004';
    if (/permission|unsupported tool|tool budget|unexpected tool/.test(message)) return 'AI-1007';
    if (http === 403) return 'AI-1004';
    if (http === 404 || http === 410 || /expired|session.*not found|job.*not found/.test(message)) return 'AI-1009';
    if (/invalid.*(?:json|output|schema)|structured_output|empty response|올바르게 생성/.test(message)) return 'AI-1006';
    if (http === 400 || http === 422) return 'AI-1005';
    if (/fetch|network|econn|connection|연결/.test(message)) return 'AI-1008';
    if (http === 502 || http === 503 || /unavailable|unreachable|eligibility check/.test(message)) return 'AI-1001';
    return 'AI-1099';
}
export function aiErrorMessage(error, status) {
    return `AI 생성에 실패했습니다. 오류 코드: ${aiErrorCode(error, status)}`;
}
export function createAiError(error, status) {
    const safe = new Error(aiErrorMessage(error, status));
    safe.code = aiErrorCode(error, status);
    if (status) safe.statusCode = status;
    return safe;
}
