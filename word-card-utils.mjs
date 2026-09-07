const MAX_WORD_LENGTH = 30;
const MAX_EXPLANATION_LENGTH = 180;
export const WORD_CARD_GENERATION_VERSION = 2;
const WORD_CARD_ID_PATTERN = /^wc1_[a-f0-9]{64}$/;
const WORD_CARD_GENERATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;
const WORD_CARD_IMAGE_EXTENSION_PATTERN = /^(?:png|jpe?g|webp)$/;

export function isValidWordCardId(value = '') {
    return WORD_CARD_ID_PATTERN.test(String(value || ''));
}

export function buildWordCardIllustrationPath(cardId, generationToken, extension = 'webp') {
    const safeId = String(cardId || '');
    const safeToken = String(generationToken || '');
    const safeExtension = String(extension || '').toLowerCase();
    if (!isValidWordCardId(safeId)
        || !WORD_CARD_GENERATION_TOKEN_PATTERN.test(safeToken)
        || !WORD_CARD_IMAGE_EXTENSION_PATTERN.test(safeExtension)) {
        throw new Error('안전한 단어 카드 이미지 경로를 만들 수 없어요.');
    }
    const normalizedExtension = safeExtension === 'jpeg' ? 'jpg' : safeExtension;
    return `SharedWordCards/${safeId}/generations/${safeToken}/illustration.${normalizedExtension}`;
}

export function isValidWordCardIllustrationPath(path = '', cardId = '') {
    if (!isValidWordCardId(cardId)) return false;
    const escapedId = String(cardId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^SharedWordCards/${escapedId}/generations/[A-Za-z0-9_-]{1,100}/illustration\\.(?:png|jpg|webp)$`).test(String(path || ''));
}

export function normalizeWordCardWord(value = '') {
    return String(value || '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^[\s.,!?·ㆍ:;"'“”‘’()\[\]{}<>]+|[\s.,!?·ㆍ:;"'“”‘’()\[\]{}<>]+$/g, '')
        .slice(0, MAX_WORD_LENGTH);
}

export function validateWordCardText(value = {}) {
    const word = normalizeWordCardWord(value.word);
    const explanation = String(value.explanation || '')
        .replace(/[<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_EXPLANATION_LENGTH);
    if (!word || !/[가-힣]/.test(word)) throw new Error('카드에 넣을 올바른 한국어 단어가 필요해요.');
    if (!explanation) throw new Error('단어 설명을 만들지 못했어요.');
    return { word, normalizedWord: word, explanation };
}

export async function buildWordCardId(word, cryptoApi = globalThis.crypto) {
    const normalizedWord = normalizeWordCardWord(word);
    if (!normalizedWord) throw new Error('단어 카드 ID를 만들 단어가 필요해요.');
    if (!cryptoApi?.subtle?.digest) throw new Error('이 기기에서는 안전한 단어 카드 ID를 만들 수 없어요.');
    const bytes = new TextEncoder().encode(normalizedWord);
    const digest = await cryptoApi.subtle.digest('SHA-256', bytes);
    const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `wc1_${hex}`;
}

export function getWordCardResolution(card, nowMs = Date.now()) {
    if (card?.status === 'published'
        && card?.isPublic === true
        && Number(card?.generationVersion || 0) >= WORD_CARD_GENERATION_VERSION
        && isValidWordCardId(card?.id)
        && card?.word
        && card?.explanation
        && isValidWordCardIllustrationPath(card?.illustration?.path, card.id)) return 'reuse';
    if (card?.status === 'generating' && Number(card?.leaseExpiresAtMs || 0) > nowMs) return 'wait';
    return 'generate';
}

export function buildWordCardExplanationPrompt(word) {
    const normalizedWord = normalizeWordCardWord(word);
    return `초등학생이 교과서 낱말의 뜻을 쉽게 이해할 수 있도록 설명하세요.\n단어: "${normalizedWord}"\n규칙:\n1. 정확한 뜻을 쉽고 구체적인 한국어 한 문장으로 씁니다.\n2. 어려운 한자어와 순환 설명을 피합니다.\n3. 60자 이내로 씁니다.\n4. 사람 이름, 학교 이름 등 개인정보를 만들지 않습니다.\n5. 반드시 JSON만 출력합니다: {"word":"${normalizedWord}","explanation":"쉬운 설명 한 문장"}`;
}

export function buildWordCardImageEditPrompt(word, explanation) {
    const safe = validateWordCardText({ word, explanation });
    return `업로드된 이미지는 단어를 뽑아 낸 학습 사진이 아니라, 모든 단어 카드에 사용할 고정 캐릭터 원본입니다. 이미지 속 연두색 새싹 후드 캐릭터 한 명을 반드시 같은 캐릭터로 유지하세요. 갈색 앞머리, 큰 검은 눈, 후드의 초록 새싹 두 잎과 흰 꽃 장식, 볼의 초록 별, 연두색 후드티와 바지 및 초록·흰색 운동화, 귀여운 굵은 선화와 부드러운 채색을 정확히 보존합니다. 마인크래프트 등 단어를 발견한 학습 사진의 인물·캐릭터·화풍·배경은 절대 가져오지 마세요.\n\n단어: "${safe.word}"\n뜻: "${safe.explanation}"\n\n이 고정 캐릭터가 '${safe.word}'의 뜻을 한눈에 보여 주는 교육용 단어 카드 그림으로 편집하세요. 캐릭터와 단어 대상은 반드시 서로 의미 있는 행동이나 반응으로 연결되어야 합니다. 단어의 뜻에 가장 잘 맞는 자연스러운 상호작용 한 가지를 중심 장면으로 선택하세요. 사물·식물·장소를 뜻하면 캐릭터가 그것을 사용하거나 만지거나 돌보거나 살펴보게 하고, 행동을 뜻하면 캐릭터가 그 행동을 직접 수행하게 하며, 감정·상태·추상 개념이면 표정과 몸짓 및 원인이 되는 상황으로 뜻을 보여 주세요. 캐릭터의 시선, 얼굴 표정, 몸 방향, 손동작이 핵심 대상이나 행동을 향하도록 하고 접촉, 움직임 또는 원인과 결과가 분명히 보이게 하세요. 캐릭터가 단어 대상 옆에 무관하게 서 있거나, 대상이 장식처럼 놓이거나, 단순히 들고 포즈만 취하는 장면은 피하세요.\n\n배경은 순백색이고 아주 옅은 바닥 그림자만 허용합니다. 불필요한 소품은 줄이고 단어를 설명하는 캐릭터와 핵심 대상의 관계를 크고 명확하게 표현합니다. 캐릭터와 핵심 대상이 잘리지 않게 중앙에 배치합니다. 글자, 자막, 말풍선, 로고, 워터마크는 넣지 마세요. 정사각형 1:1 고품질 일러스트로 만드세요.`;
}

export function sortPublishedWordCards(cards = []) {
    return [...cards]
        .filter((card) => card?.status === 'published'
            && card?.isPublic === true
            && Number(card?.generationVersion || 0) >= WORD_CARD_GENERATION_VERSION
            && isValidWordCardId(card?.id)
            && card?.word
            && card?.explanation
            && isValidWordCardIllustrationPath(card?.illustration?.path, card.id))
        .sort((a, b) => String(a.word).localeCompare(String(b.word), 'ko'));
}
