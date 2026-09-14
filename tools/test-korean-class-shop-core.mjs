import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
    canManageTeacherShopItem,
    isCurrentClassShopRequest
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
    assert.ok(mutations.includes("if (!getManageableAiedueKoreanShopItem(itemId)) return;"));
    assert.ok(mutations.includes("const item = getManageableAiedueKoreanShopItem(itemId);"));
    assert.ok(mutations.includes("currentUserRole !== 'teacher' || !currentUserId"));
    assert.ok(mutations.includes('.filter((item) => canManageTeacherShopItem('));
});

test('교사 배부 payload를 학생 상점 consumer가 같은 경로와 필드로 읽는다', () => {
    const producer = section(app, 'async function assignAiedueKoreanShopItemToStudent', 'window.openAiedueKoreanDistributeShopItem');
    const consumer = section(app, 'async function loadAiedueKoreanAssignedShopItems', 'function showKoreanShopModal');
    assert.ok(producer.includes('users/${student.id}/assignedShopItems'));
    assert.ok(consumer.includes('users/${currentUserId}/assignedShopItems'));
    for (const field of ['itemId', 'name', 'itemName', 'description', 'price', 'imageUrl', 'teacherId', 'teacherName']) {
        assert.ok(producer.includes(`${field}:`), `producer 필드 없음: ${field}`);
    }
    assert.ok(consumer.includes('assignment.itemId'));
    assert.ok(consumer.includes('assignment.name || assignment.itemName'));
    assert.ok(consumer.includes("assignment.description || ''"));
    assert.ok(consumer.includes('assignment.price || assignment.basePrice || 0'));
    assert.ok(consumer.includes("assignment.imageUrl || ''"));
    assert.ok(consumer.includes('displayItems.push({ assignment, item })'));
});
