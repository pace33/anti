export const AIEDUE_SHOP_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const AIEDUE_SHOP_IMAGE_EXTENSIONS = Object.freeze({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif'
});

function safeStoragePathSegment(value = '') {
    return String(value)
        .trim()
        .replace(/[^a-z0-9._-]+/gi, '_')
        .replace(/^[._-]+|[._-]+$/g, '')
        .slice(0, 160);
}

export function validateTeacherShopImageFile(file) {
    if (!file) return { ok: false, error: '업로드할 이미지를 선택해 주세요.' };
    const extension = AIEDUE_SHOP_IMAGE_EXTENSIONS[String(file.type || '').toLowerCase()];
    if (!extension) return { ok: false, error: 'PNG, JPG, WebP, GIF 이미지만 올릴 수 있어요.' };
    const size = Number(file.size || 0);
    if (!Number.isFinite(size) || size <= 0) return { ok: false, error: '비어 있는 이미지는 올릴 수 없어요.' };
    if (size > AIEDUE_SHOP_IMAGE_MAX_BYTES) return { ok: false, error: '이미지는 5MB 이하만 올릴 수 있어요.' };
    return { ok: true, extension };
}

export function buildTeacherShopImagePath({ teacherId, itemId, token, extension } = {}) {
    const teacher = safeStoragePathSegment(teacherId);
    const item = safeStoragePathSegment(itemId);
    const revision = safeStoragePathSegment(token);
    const normalizedExtension = String(extension || '').toLowerCase() === 'jpeg' ? 'jpg' : safeStoragePathSegment(extension).toLowerCase();
    if (!teacher || !item || !revision || !['png', 'jpg', 'webp', 'gif'].includes(normalizedExtension)) {
        throw new Error('상점 이미지 저장 경로를 만들 수 없어요.');
    }
    return `shop-items/${teacher}/${item}/${revision}.${normalizedExtension}`;
}

export function isManagedTeacherShopImagePath(path, { teacherId, itemId } = {}) {
    const teacher = safeStoragePathSegment(teacherId);
    const item = safeStoragePathSegment(itemId);
    return Boolean(teacher && item && String(path || '').startsWith(`shop-items/${teacher}/${item}/`));
}

export function isCurrentClassShopRequest({
    requestId,
    latestRequestId,
    teacherId,
    currentUserId,
    currentUserRole,
    activeTab,
    classModalOpen
} = {}) {
    return Number.isInteger(requestId)
        && requestId === latestRequestId
        && Boolean(teacherId)
        && teacherId === currentUserId
        && currentUserRole === 'teacher'
        && activeTab === 'shop'
        && classModalOpen === true;
}

export function canManageTeacherShopItem({ role, currentUserId, itemId = '', item = null } = {}) {
    if (role !== 'teacher' || !currentUserId) return false;
    if (!itemId) return true;
    return Boolean(item && item.id === itemId && item.teacherId === currentUserId);
}
