import { buildNewStudentProfile } from './classroom-tools-core.mjs';

// Dependencies are the same Auth SDK and data adapter used by individual signup.
export function createClassroomService(api) {
    const { db, doc, collection, query, where, getDoc, getDocs, runTransaction, serverTimestamp } = api;
    let secondaryAuth;
    function assertTeacher(expected) {
        const current = api.current();
        if (!current.id || current.role !== 'teacher' || (expected && current.id !== expected)) throw new Error('교사 로그인 정보를 확인한 뒤 다시 시도해 주세요.');
        return current.id;
    }
    return {
        assertTeacher, notify: api.notify, safeImage: api.safeImage, PDFDocument: api.PDFDocument,
        refreshStudents: api.refreshStudents,
        getShopItems: api.getShopItems,
        async getStudents() {
            const teacherId = assertTeacher();
            // Printing must fail visibly if a fetch fails, rather than print a partial roster.
            const [classSnap, linked] = await Promise.all([
                getDoc(doc(db, 'classes', teacherId)),
                getDocs(query(collection(db, 'users'), where('teacherId', '==', teacherId)))
            ]);
            const ids = Array.isArray(classSnap.data()?.students) ? classSnap.data().students : [];
            const snapshots = await Promise.all(ids.map(id => getDoc(doc(db, 'users', id))));
            assertTeacher(teacherId);
            const students = new Map();
            [...snapshots, ...linked.docs].forEach(snap => {
                if (!snap.exists()) return;
                const data = snap.data();
                if ((data.role || 'student') === 'student' && (!data.teacherId || data.teacherId === teacherId)) students.set(snap.id, data);
            });
            return [...students.values()].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko'));
        },
        studentService(teacherId) {
            return {
                assertTeacher: () => assertTeacher(teacherId),
                async reserveCode() {
                    assertTeacher(teacherId);
                    return runTransaction(db, async transaction => {
                        const reference = doc(db, 'metadata', 'counters');
                        const snapshot = await transaction.get(reference);
                        const last = Number(snapshot.data()?.lastUserCode || 0);
                        if (!Number.isSafeInteger(last) || last < 0) throw new Error('로그인 번호 발급 정보를 확인해 주세요.');
                        const code = last + 1;
                        transaction.set(reference, { lastUserCode: code }, { merge: true });
                        return code;
                    });
                },
                async createIdentity(code, row) {
                    assertTeacher(teacherId);
                    if (!secondaryAuth) {
                        secondaryAuth = api.getAuth(api.initializeApp(api.firebaseConfig, 'classroom-student-signup'));
                        await api.setPersistence(secondaryAuth, api.inMemoryPersistence);
                    }
                    try {
                        let credential;
                        if (row.authUncertain) {
                            try { credential = await api.signInWithEmailAndPassword(secondaryAuth, `${code}@abc.com`, `${code}qwerty`); }
                            catch (error) { if (!['auth/invalid-credential', 'auth/user-not-found'].includes(error.code)) throw error; }
                        }
                        if (!credential) credential = await api.createUserWithEmailAndPassword(secondaryAuth, `${code}@abc.com`, `${code}qwerty`);
                        return credential.user.uid;
                    } catch (error) {
                        if (error.code === 'auth/network-request-failed') row.authUncertain = true;
                        if (error.code === 'auth/email-already-in-use' && !row.authUncertain) {
                            row.code = null; // A stale counter must never adopt an existing student's identity.
                            throw new Error('이미 사용 중인 번호예요. 다시 추가하면 새 번호를 발급합니다.');
                        }
                        throw error;
                    } finally { await api.signOut(secondaryAuth).catch(() => {}); }
                },
                async saveAndEnroll(row) {
                    assertTeacher(teacherId);
                    const studentRef = doc(db, 'users', row.uid), classRef = doc(db, 'classes', teacherId);
                    await runTransaction(db, async transaction => {
                        const [studentSnap, classSnap] = await Promise.all([transaction.get(studentRef), transaction.get(classRef)]);
                        assertTeacher(teacherId);
                        const existing = studentSnap.data();
                        if (studentSnap.exists() && (existing.role !== 'student' || existing.teacherId !== teacherId || Number(existing.userCode) !== Number(row.code))) throw new Error('이미 등록된 다른 계정입니다. 학급 연결을 확인해 주세요.');
                        const students = [...new Set([...(Array.isArray(classSnap.data()?.students) ? classSnap.data().students : []), row.uid])];
                        if (!studentSnap.exists()) transaction.set(studentRef, buildNewStudentProfile({ uid: row.uid, name: row.name, code: row.code, timestamp: serverTimestamp(), teacherId }));
                        transaction.set(classRef, { teacherId, students, updatedAt: serverTimestamp() }, { merge: true });
                    });
                }
            };
        }
    };
}
