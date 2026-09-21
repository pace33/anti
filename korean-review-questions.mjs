function uniqueChoices(answer, choices = [], limit = 4) {
    const normalizedAnswer = String(answer || '');
    const values = [...choices.map((choice) => String(choice || '')), normalizedAnswer]
        .filter(Boolean);
    const unique = [...new Set(values)];
    const capped = unique.slice(0, Math.max(2, Number(limit) || 4));
    if (!capped.includes(normalizedAnswer)) capped[capped.length - 1] = normalizedAnswer;
    return capped;
}

export function resolveKoreanReviewQuestion(item = {}, sources = {}) {
    const answer = String(item.correctAnswer || item.questionText || '');
    if (!answer) return null;

    if (item.activityType === 'wordPictureMatch') {
        const source = (sources.pictureItems || []).find((entry) => String(entry?.answer || entry?.word || '') === answer);
        if (source?.icon) {
            return {
                kind: 'picture-choice',
                prompt: source.prompt || '그림에 알맞은 낱말을 골라요.',
                icon: source.icon,
                choices: uniqueChoices(answer, source.choices),
                audioText: source.audioText || answer
            };
        }
    }

    const listeningSource = (sources.listeningItems || []).find((entry) => String(entry?.answer || '') === answer);
    if (listeningSource) {
        return {
            kind: 'listening-choice',
            prompt: listeningSource.prompt || '소리를 듣고 알맞은 답을 골라요.',
            choices: uniqueChoices(answer, listeningSource.choices),
            audioText: listeningSource.audioText || answer
        };
    }

    return null;
}
