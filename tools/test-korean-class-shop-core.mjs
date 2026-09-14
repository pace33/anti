import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
    AIEDUE_SHOP_IMAGE_MAX_BYTES,
    buildTeacherShopImagePath,
    canManageTeacherShopItem,
    isCurrentClassShopRequest,
    isManagedTeacherShopImagePath,
    validateTeacherShopImageFile
} from '../korean-class-shop-core.mjs';

const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');

function section(source, start, end) {
    const from = source.indexOf(start);
    assert.notEqual(from, -1, `시작 마커 없음: ${start}`);
    const to = source.indexOf(end, from + start.length);
    assert.notEqual(to, -1, `끝 마커 없음: ${end}`);
    return source.slice(from, to);
}

const currentRequest = {
    requestId: 7,
    latestRequestId: 7,
    teacherId: 'teacher-a',
    currentUserId: 'teacher-a',
    currentUserRole: 'teacher',
    activeTab: 'shop',
    classModalOpen: true
};

test('현재 교사의 열린 상점 탭 요청만 화면과 캐시를 갱신할 수 있다', () => {
    assert.equal(isCurrentClassShopRequest(currentRequest), true);
    for (const changed of [
        { requestId: 6 },
        { latestRequestId: 8 },
        { currentUserId: 'teacher-b' },
        { currentUserRole: 'student' },
        { activeTab: 'points' },
        { classModalOpen: false }
    ]) {
        assert.equal(isCurrentClassShopRequest({ ...currentRequest, ...changed }), false);
    }
});

test('비로그인·학생·타 교사는 기존 상점 물품을 관리할 수 없다', () => {
    const mine = { id: 'item-a', teacherId: 'teacher-a' };
    const other = { id: 'item-b', teacherId: 'teacher-b' };
    assert.equal(canManageTeacherShopItem({ role: 'teacher', currentUserId: 'teacher-a' }), true);
    assert.equal(canManageTeacherShopItem({ role: 'teacher', currentUserId: 'teacher-a', itemId: 'item-a', item: mine }), true);
    assert.equal(canManageTeacherShopItem({ role: 'teacher', currentUserId: 'teacher-a', itemId: 'item-b', item: other }), false);
    assert.equal(canManageTeacherShopItem({ role: 'teacher', currentUserId: 'teacher-a', itemId: 'item-a', item: { id: 'item-a' } }), false);
    assert.equal(canManageTeacherShopItem({ role: 'student', currentUserId: 'student-a', itemId: 'item-a', item: mine }), false);
    assert.equal(canManageTeacherShopItem({ role: 'teacher', currentUserId: '', itemId: 'item-a', item: mine }), false);
});

test('모든 변경·배부 진입점이 교사 역할과 물품 소유권을 재검사한다', () => {
    const mutations = section(app, 'function getManageableAiedueKoreanShopItem', 'window.confirmAiedueKoreanShopPurchase');
    assert.ok(mutations.includes('canManageTeacherShopItem({ role: currentUserRole, currentUserId, itemId, item })'));
    assert.ok(mutations.includes('const item = getManageableAiedueKoreanShopItem(itemId);'));
    assert.ok(mutations.includes('const existingItem = getManageableAiedueKoreanShopItem(itemId);'));
    assert.ok(mutations.includes('if (!existingItem) return;'));
    assert.ok(mutations.includes("currentUserRole !== 'teacher' || !currentUserId"));
    assert.ok(mutations.includes('.filter((item) => canManageTeacherShopItem('));
});

test('교사 배부 payload를 학생 상점 consumer가 같은 경로와 필드로 읽는다', () => {
    const producer = section(app, 'async function assignAiedueKoreanShopItemToStudent', 'window.openAiedueKoreanDistributeShopItem');
    const consumer = section(app, 'async function loadAiedueKoreanAssignedShopItems', 'function showKoreanShopModal');
    assert.ok(producer.includes('users/${student.id}/assignedShopItems'));
    assert.ok(consumer.includes('users/${studentId}/assignedShopItems'));
    assert.ok(consumer.includes('requestIsCurrent'));
    for (const field of ['itemId', 'name', 'itemName', 'description', 'price', 'imageUrl', 'imagePath', 'teacherId', 'teacherName']) {
        assert.ok(producer.includes(`${field}:`), `producer 필드 없음: ${field}`);
    }
    assert.ok(consumer.includes('assignment.itemId'));
    assert.ok(consumer.includes('assignment.name || assignment.itemName'));
    assert.ok(consumer.includes("assignment.description || ''"));
    assert.ok(consumer.includes('assignment.price || assignment.basePrice || 0'));
    assert.ok(consumer.includes("assignment.imageUrl || ''"));
    assert.ok(consumer.includes("assignment.imagePath || ''"));
    assert.ok(consumer.includes('resolveAiedueKoreanShopItemImage(item)'));
    assert.ok(consumer.includes('displayItems.push({ assignment, item })'));
});

test('상점 업로드 이미지는 PNG·JPEG·WebP·GIF와 5MB 이하만 허용한다', () => {
    assert.equal(AIEDUE_SHOP_IMAGE_MAX_BYTES, 5 * 1024 * 1024);
    for (const [type, name, extension] of [
        ['image/png', 'gift.png', 'png'],
        ['image/jpeg', 'gift.jpeg', 'jpg'],
        ['image/webp', 'gift.webp', 'webp'],
        ['image/gif', 'gift.gif', 'gif']
    ]) {
        assert.deepEqual(validateTeacherShopImageFile({ type, name, size: 1024 }), { ok: true, extension });
    }
    assert.equal(validateTeacherShopImageFile({ type: 'image/svg+xml', name: 'gift.svg', size: 10 }).ok, false);
    assert.equal(validateTeacherShopImageFile({ type: 'image/png', name: 'gift.png', size: AIEDUE_SHOP_IMAGE_MAX_BYTES + 1 }).ok, false);
    assert.equal(validateTeacherShopImageFile(null).ok, false);
});

test('상점 이미지 경로는 교사·상품 아래 안전한 확장자로 생성되고 소유 범위를 판정한다', () => {
    const path = buildTeacherShopImagePath({ teacherId: '../teacher/a', itemId: 'item/../1', token: 'rev/1', extension: 'jpeg' });
    assert.equal(path, 'shop-items/teacher_a/item_.._1/rev_1.jpg');
    assert.equal(isManagedTeacherShopImagePath(path, { teacherId: '../teacher/a', itemId: 'item/../1' }), true);
    assert.equal(isManagedTeacherShopImagePath(path, { teacherId: 'teacher-b', itemId: 'item/../1' }), false);
    assert.throws(() => buildTeacherShopImagePath({ teacherId: '', itemId: 'item-1', token: 'x', extension: 'png' }));
});

test('교사 상점 편집기는 URL과 이미지 업로드·미리보기를 제공하고 데이터 서버 경로를 저장한다', () => {
    const mutations = section(app, 'function getManageableAiedueKoreanShopItem', 'async function assignAiedueKoreanShopItemToStudent');
    for (const marker of [
        'korean-shop-edit-image-file',
        'accept="image/png,image/jpeg,image/webp,image/gif"',
        'triggerAiedueKoreanShopImageUpload',
        'korean-shop-edit-image-preview',
        'validateTeacherShopImageFile',
        'buildTeacherShopImagePath',
        "storageRef(storage, uploadedImagePath)",
        'imagePath: nextImagePath',
        'deleteObject(storageRef(storage, uploadedImagePath))',
        'deleteManagedAiedueKoreanShopImage'
    ]) assert.ok(mutations.includes(marker), `업로드 통합 마커 없음: ${marker}`);
    assert.ok(app.includes('await resolveAiedueKoreanShopItemImage(item)'));
    assert.ok(app.includes('aiedueKoreanShopSaveLocks'));
    assert.ok(app.includes('aiedueKoreanShopPreviewObjectUrl'));
    assert.ok(app.includes('aiedueKoreanShopEditorGeneration'));
    assert.ok(app.includes('aiedueKoreanTeacherShopRequestId'));
    const sharedModalOpen = app.slice(app.indexOf('window.showModal = function showModal'), app.indexOf('window.handleModalConfirm = function handleModalConfirm'));
    const sharedModalClose = app.slice(app.indexOf('window.handleModalConfirm = function handleModalConfirm'), app.indexOf('// Inline onclick'));
    assert.ok(sharedModalOpen.includes('clearAiedueKoreanShopImagePreviewUrl()'));
    assert.ok(sharedModalClose.includes('clearAiedueKoreanShopImagePreviewUrl()'));
    assert.ok(app.includes('const modalGeneration = aiedueKoreanShopEditorGeneration'));
    assert.ok(app.includes("const submittedName = document.getElementById('korean-shop-edit-name')"));
    assert.ok(app.includes('name: submittedName'));
    assert.ok(app.includes('await runTransaction(db, async (transaction) =>'));
    assert.ok(app.includes("latestItem.imagePath || ''"));
    assert.ok(app.includes("isManagedTeacherShopImagePath(item.imagePath, { teacherId: item.teacherId, itemId: item.id })"));
    assert.ok(app.includes("auth.currentUser?.uid === operationTeacherId"));
    assert.ok(app.includes('aiedueKoreanStudentShopRequestId'));
});

test('수학 공유 상점도 업로드 이미지 경로를 표시·배부하고 삭제 때 정리한다', async () => {
    const math = await readFile(new URL('../math/math-services.js', import.meta.url), 'utf8');
    for (const marker of [
        'await resolveShopItemImage(item)',
        'safeImageSource(item.displayImageUrl || item.imageUrl)',
        "imagePath: item.imagePath || ''",
        'await deleteManagedShopImage(item)',
        '/^blob:https?:\\/\\//i.test(source)',
        'isCurrentShopSession(uid, generation)',
        "item.teacherId !== teacherId",
        '업로드 이미지는 에이두 한글 상점에서 변경할 수 있습니다.'
    ]) assert.ok(math.includes(marker), `수학 공유 상점 imagePath 계약 없음: ${marker}`);
});
