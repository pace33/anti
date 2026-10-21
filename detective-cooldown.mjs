export const DETECTIVE_WAIT_MS = 120000;
export function detectiveCooldownUntil(data = {}) {
    const value = data.literacyDetectiveLastWrongAt;
    let at = 0;
    if (typeof value?.toMillis === 'function') at = value.toMillis();
    else if (value && typeof value === 'object' && Number.isFinite(Number(value.seconds))) at = Number(value.seconds)*1000 + Number(value.nanoseconds || 0)/1e6;
    else if (typeof value === 'number') at = value;
    else if (value) at = Date.parse(String(value));
    return Number.isFinite(at) && at > 0 ? at + DETECTIVE_WAIT_MS : 0;
}
export function requireDetectiveReady(data, now = Date.now()) {
    const until = detectiveCooldownUntil(data);
    if (until > now) {
        const seconds=Math.ceil((until-now)/1000);
        const error=new Error(`추리를 다시 살펴보세요. ${Math.floor(seconds/60)}분 ${String(seconds%60).padStart(2,'0')}초 뒤에 다시 도전할 수 있어요.`);
        error.code='detective-cooldown';error.cooldownUntil=until;throw error;
    }
    return until;
}
