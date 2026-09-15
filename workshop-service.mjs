// Records live under the signed-in teacher, using the Korean app's data adapter.
export const WORKSHOP_KINDS = new Set(['worksheet', 'mission', 'learning', 'behavior', 'ledger', 'inventory', 'schedule', 'booking', 'role', 'note', 'preference']);

export function createWorkshopService(api, teacherId) {
    let closed = false;
    const assertTeacher = () => {
        const current = api.current();
        if (closed || !teacherId || current.id !== teacherId || current.role !== 'teacher') {
            throw new Error('교사 로그인 정보를 확인한 뒤 수업 공방을 다시 열어 주세요.');
        }
    };
    const records = () => api.collection(api.db, 'users', teacherId, 'workshopEntries');
    const record = id => api.doc(api.db, 'users', teacherId, 'workshopEntries', id);
    async function students() {
        assertTeacher();
        const [classSnap, linked] = await Promise.all([
            api.getDoc(api.doc(api.db, 'classes', teacherId)),
            api.getDocs(api.query(api.collection(api.db, 'users'), api.where('teacherId', '==', teacherId)))
        ]);
        assertTeacher();
        const ids = classSnap.data()?.students || [];
        const snapshots = await Promise.all(ids.map(id => api.getDoc(api.doc(api.db, 'users', id))));
        assertTeacher();
        const roster = new Map();
        [...snapshots, ...linked.docs].forEach(snap => {
            if (!snap.exists()) return;
            const data = snap.data();
            if ((data.role || 'student') !== 'student' || (data.teacherId && data.teacherId !== teacherId)) return;
            roster.set(snap.id, {id:snap.id,kind:'student',studentId:'',date:'',createdAt:'',updatedAt:'',payload:{name:data.name || '학생',grade:String(data.grade || ''),active:true}});
        });
        return [...roster.values()].sort((a,b) => a.payload.name.localeCompare(b.payload.name, 'ko'));
    }
    return Object.freeze({
        close() { closed = true; },
        async load() {
            assertTeacher();
            const [roster, snapshot] = await Promise.all([students(), api.getDocs(records())]);
            assertTeacher();
            const entries = snapshot.docs.map(s => ({...s.data(),id:s.id})).filter(e => WORKSHOP_KINDS.has(e.kind) && !e.deletedAt);
            entries.sort((a,b) => String(b.date).localeCompare(String(a.date)) || String(b.createdAt).localeCompare(String(a.createdAt)));
            return {entries,students:roster};
        },
        async save(kind, payload, studentId = '', date, id) {
            assertTeacher();
            if (!WORKSHOP_KINDS.has(kind) || !payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('기록 내용을 확인해 주세요.');
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('날짜를 확인해 주세요.');
            if (id && !/^[\w-]{1,80}$/.test(id)) throw new Error('기록 번호를 확인해 주세요.');
            const serialized = JSON.stringify(payload);
            if (serialized.length > 180000) throw new Error('학습지 분량이 너무 많습니다. 나누어 저장해 주세요.');
            const roster = await students();
            if (studentId && !roster.some(s => s.id === studentId)) throw new Error('현재 학급 학생을 다시 선택해 주세요.');
            assertTeacher();
            const ref = id ? record(id) : api.doc(records());
            const previous = id ? await api.getDoc(ref) : null;
            assertTeacher();
            if (id && (!previous.exists() || previous.data().kind !== kind || previous.data().deletedAt)) throw new Error('저장된 기록을 다시 불러와 주세요.');
            const now = new Date().toISOString();
            const entry = {id:ref.id,kind,payload:JSON.parse(serialized),studentId,date,createdAt:previous?.data()?.createdAt || now,updatedAt:now};
            await api.setDoc(ref, entry);
            assertTeacher();
            return entry;
        },
        async remove(id) {
            assertTeacher();
            if (!/^[\w-]{1,80}$/.test(id)) throw new Error('기록 번호를 확인해 주세요.');
            const ref = record(id), snapshot = await api.getDoc(ref);
            assertTeacher();
            if (!snapshot.exists() || !WORKSHOP_KINDS.has(snapshot.data().kind)) throw new Error('기록을 찾지 못했습니다.');
            await api.setDoc(ref, {deletedAt:new Date().toISOString()}, {merge:true});
            assertTeacher();
        }
    });
}
