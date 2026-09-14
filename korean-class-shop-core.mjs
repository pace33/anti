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
