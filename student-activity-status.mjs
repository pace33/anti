// Event-time values only: never substitute today's profile into a historical log.
const finite = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : null;

export function buildActivityStatusSnapshot(before = {}, after = {}) {
    const snapshot = { statusSnapshotVersion: 1 };
    for (const [key, previous, next] of [
        ['experience', before.aeduExperience, after.aeduExperience],
        ['level', before.aeduLevel, after.aeduLevel],
        ['balance', before.balance ?? before.coins ?? before.aeduTokens, after.balance ?? after.coins ?? after.aeduTokens],
        ['warningTokens', before.warningTokens, after.warningTokens]
    ]) {
        const from = finite(previous); const to = finite(next);
        if (from !== null && to !== null) {
            snapshot[`${key}Before`] = from;
            snapshot[`${key}After`] = to;
        }
    }
    return snapshot;
}

const count = value => value.toLocaleString('ko-KR', { maximumFractionDigits: 3 });
const signed = (value, formatter = count) => `${value > 0 ? '+' : '-'}${formatter(Math.abs(value))}`;
const percentage = value => value.toFixed(1);

export function formatActivityStatusChange(log = {}) {
    const parts = [];
    const fromExp = finite(log.experienceBefore); const toExp = finite(log.experienceAfter);
    const fromLevel = finite(log.levelBefore); const toLevel = finite(log.levelAfter);
    if (fromExp !== null && toExp !== null && fromLevel !== null && toLevel !== null) {
        const delta = Math.round(((toLevel - fromLevel) * 100 + toExp - fromExp) * 1000) / 1000;
        if (delta !== 0) parts.push(`경험치 ${signed(delta, percentage)}% → Lv.${count(toLevel)} ${percentage(toExp)}% (Lv.${count(fromLevel)} ${percentage(fromExp)}%에서)`);
    }
    for (const [key, label, unit] of [['balance', '돈', '점'], ['warningTokens', '주의토큰', '개']]) {
        const from = finite(log[`${key}Before`]); const to = finite(log[`${key}After`]);
        if (from !== null && to !== null && from !== to) {
            const delta = Math.round((to - from) * 1000) / 1000;
            parts.push(`${label} ${signed(delta)}${unit} → ${count(to)}${unit} (${count(from)}${unit}에서)`);
        }
    }
    return parts.join(' · ');
}
