import { buildNewStudentProfile } from './classroom-tools-core.mjs';

// Dependencies are the same Auth SDK and data adapter used by individual signup.
export function createClassroomService(api) {
    const { db, doc, collection, query, where, getDoc, getDocs, runTransaction, serverTimestamp } = api;
    let secondaryAuth;
    const bootstrapProfiles = typeof api.bootstrapStudentProfile === 'function';

    function tagged(error, failureType) {
        if (error && typeof error === 'object') {
            if (!error.failureType) error.failureType = failureType;
            return error;
        }
        return Object.assign(new Error(String(error || '요청에 실패했습니다.')), { failureType });
    }
    function assertTeacher(expected) {
        const current = api.current();
        if (!current.id || current.role !== 'teacher' || (expected && current.id !== expected)) {
            throw Object.assign(new Error('교사 로그인 정보를 확인한 뒤 다시 시도해 주세요.'), { failureType: 'auth' });
        }
        return current.id;
    }
    async function getSecondaryAuth() {
        if (!secondaryAuth) {
            secondaryAuth = api.getAuth(api.initializeApp(api.firebaseConfig, 'classroom-student-signup'));
            await api.setPersistence(secondaryAuth, api.inMemoryPersistence);
        }
        return secondaryAuth;
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
            const student = {
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
                    const auth = await getSecondaryAuth().catch(error => { throw tagged(error, 'auth'); });
                    try {
                        let credential;
                        if (row.authUncertain) {
                            try { credential = await api.signInWithEmailAndPassword(auth, `${code}@abc.com`, `${code}qwerty`); }
                            catch (error) { if (!['auth/invalid-credential', 'auth/user-not-found'].includes(error.code)) throw error; }
                        }
                        if (!credential) credential = await api.createUserWithEmailAndPassword(auth, `${code}@abc.com`, `${code}qwerty`);
                        return credential.user.uid;
                    } catch (error) {
                        if (error.code === 'auth/network-request-failed') row.authUncertain = true;
                        if (error.code === 'auth/email-already-in-use' && !row.authUncertain) {
                            row.code = null; // A stale counter must never adopt an existing student's identity.
                            throw Object.assign(new Error('이미 사용 중인 번호예요. 다시 추가하면 새 번호를 발급합니다.'), { code: error.code, failureType: 'duplicate' });
                        }
                        throw tagged(error, 'auth');
                    } finally { await api.signOut(auth).catch(() => {}); }
                },
                async saveAndEnroll(row) {
                    assertTeacher(teacherId);
                    const studentRef = doc(db, 'users', row.uid), classRef = doc(db, 'classes', teacherId);
                    if (bootstrapProfiles) {
                        // Profile bootstrap carries the secondary student's token. Class membership
                        // carries the still-intact primary teacher token, so these cannot be one commit.
                        await runTransaction(db, async transaction => {
                            const classSnap = await transaction.get(classRef);
                            assertTeacher(teacherId);
                            const students = [...new Set([...(Array.isArray(classSnap.data()?.students) ? classSnap.data().students : []), row.uid])];
                            transaction.set(classRef, { teacherId, students, updatedAt: serverTimestamp() }, { merge: true });
                        });
                        // Relationship fields are attached only after teacher-owned membership exists.
                        try {
                            await runTransaction(db, async transaction => {
                                const studentSnap = await transaction.get(studentRef);
                                assertTeacher(teacherId);
                                const existing = studentSnap.data();
                                if (!studentSnap.exists() || existing.role !== 'student' || Number(existing.userCode) !== Number(row.code)) throw new Error('생성된 학생 정보를 확인할 수 없습니다.');
                                if (existing.teacherId && existing.teacherId !== teacherId) throw new Error('이미 다른 학급에 등록된 계정입니다.');
                                transaction.set(studentRef, { teacherId, classId: teacherId, createdBy: teacherId }, { merge: true });
                            });
                        } catch (error) { throw tagged(error, 'profile'); }
                        return;
                    }

                    // Compatibility path until the authenticated bootstrap dependency is supplied.
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

            if (bootstrapProfiles) student.createProfile = async row => {
                assertTeacher(teacherId);
                const auth = await getSecondaryAuth().catch(error => { throw tagged(error, 'auth'); });
                let profileRequestStarted = false;
                try {
                    const credential = await api.signInWithEmailAndPassword(auth, `${row.code}@abc.com`, `${row.code}qwerty`);
                    if (credential.user.uid !== row.uid) throw new Error('생성된 학생 계정이 로그인 번호와 일치하지 않습니다.');
                    const token = await credential.user.getIdToken();
                    const profile = buildNewStudentProfile({ uid: row.uid, name: row.name, code: row.code, timestamp: serverTimestamp() });
                    profileRequestStarted = true;
                    await api.bootstrapStudentProfile({ user: credential.user, token, profile });
                    assertTeacher(teacherId);
                } catch (error) { throw tagged(error, profileRequestStarted ? 'profile' : 'auth'); }
                finally { await api.signOut(auth).catch(() => {}); }
            };
            return student;
        }
    };
}
