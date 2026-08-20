import assert from 'node:assert/strict';

// Configuration is read when the adapter module is evaluated.
globalThis.__KOREAN_DATA_ADAPTER__ = { firebaseBridge: false, pollIntervalMs: 250 };

const adapter = await import('../korean-data-adapter.js');
const {
    Timestamp, getFirestore, doc, collection, collectionGroup, query, where, orderBy, limit,
    getDoc, getDocs, setDoc, updateDoc, deleteDoc, runTransaction, serverTimestamp,
    arrayUnion, arrayRemove, onSnapshot, getStorage, ref, uploadBytes, listAll,
    getMetadata, getDownloadURL, deleteObject, __adapterTest
} = adapter;

const documents = new Map();
const files = new Map();
const calls = [];
let version = 0;

const copy = (value) => value === undefined ? undefined : structuredClone(value);
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function materialize(value, previous) {
    if (Array.isArray(value)) return value.map((item, index) => materialize(item, previous?.[index]));
    if (value && typeof value === 'object') {
        if (value.__koreanAdapterType === 'transform') {
            if (value.operation === 'serverTimestamp') return { _seconds: 1774051200, _nanoseconds: 123000000 };
            const before = Array.isArray(previous) ? previous : [];
            const values = value.values || [];
            if (value.operation === 'arrayUnion') return [...before, ...values.filter((item) => !before.some((old) => equal(old, item)))];
            if (value.operation === 'arrayRemove') return before.filter((old) => !values.some((item) => equal(old, item)));
        }
        return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, materialize(item, previous?.[key])]));
    }
    return value;
}

function applyWrite(write) {
    if (write.type === 'delete') {
        documents.delete(write.path);
        return;
    }
    const previous = documents.get(write.path)?.data || {};
    const incoming = materialize(write.data, previous);
    const data = write.type === 'update' || write.options?.merge ? { ...previous, ...incoming } : incoming;
    documents.set(write.path, { data, version: ++version });
}

async function transport(operation, payload) {
    calls.push({ operation, payload });
    if (operation === 'getDocument') {
        const found = documents.get(payload.path);
        return found ? { exists: true, document: { path: payload.path, data: copy(found.data), version: found.version } } : { exists: false };
    }
    if (operation === 'query') {
        const source = payload.source;
        const rows = [...documents.entries()].filter(([path]) => {
            const parts = path.split('/');
            if (source.type === 'collection') return path.startsWith(`${source.path}/`) && parts.length === source.path.split('/').length + 1;
            return parts.length >= 2 && parts.at(-2) === source.collectionId;
        }).map(([path, entry]) => ({ path, id: path.split('/').at(-1), data: copy(entry.data), version: entry.version }));
        return { documents: rows, authoritativeEmpty: rows.length === 0 };
    }
    if (operation === 'commit') {
        for (const read of payload.reads || []) {
            const current = documents.get(read.path);
            if (read.exists !== Boolean(current) || current && read.version !== current.version) {
                const error = new Error('conflict'); error.status = 409; error.code = 'aborted'; throw error;
            }
        }
        payload.writes.forEach(applyWrite);
        return { committed: true };
    }
    if (operation === 'storageUpload') {
        files.set(payload.path, { blob: payload.blob, metadata: { ...payload.metadata, path: payload.path, size: payload.blob.size, timeCreated: '2026-07-21T00:00:00.000Z' } });
        return { ok: true };
    }
    if (operation === 'storageList') return { files: [...files.values()].map((item) => item.metadata), authoritativeEmpty: files.size === 0 };
    if (operation === 'storageMetadata') {
        const item = files.get(payload.path);
        return item ? { metadata: item.metadata } : { exists: false };
    }
    if (operation === 'storageDownload') {
        const item = files.get(payload.path);
        if (!item) { const error = new Error('not found'); error.status = 404; throw error; }
        return item.blob;
    }
    if (operation === 'storageDelete') { files.delete(payload.path); return { ok: true }; }
    throw new Error(`Unexpected operation: ${operation}`);
}

__adapterTest.setTransport(transport);
const db = getFirestore({ options: { storageBucket: 'test.appspot.com' } });

// References, snapshots, timestamp revival, transforms, and supported queries.
const first = doc(db, 'users', 'student-1');
assert.equal(first.id, 'student-1');
assert.equal(first.parent.path, 'users');
await setDoc(first, {
    name: '가람', score: 10, tags: ['old'],
    createdAt: serverTimestamp()
});
await updateDoc(first, { tags: arrayUnion('new', 'old') });
await updateDoc(first, 'tags', arrayRemove('old'), 'score', 12);
const firstSnapshot = await getDoc(first);
assert.equal(firstSnapshot.exists(), true);
assert.equal(firstSnapshot.data().name, '가람');
assert.deepEqual(firstSnapshot.data().tags, ['new']);
assert(firstSnapshot.get('createdAt') instanceof Timestamp);
assert.equal(firstSnapshot.get('createdAt').nanoseconds, 123000000);

await setDoc(doc(db, 'users', 'student-2'), { name: '나래', score: 30, group: 'A' });
await setDoc(first, { group: 'A' }, { merge: true });
const ranked = await getDocs(query(collection(db, 'users'), where('group', '==', 'A'), orderBy('score', 'desc'), limit(1)));
assert.equal(ranked.size, 1);
assert.equal(ranked.docs[0].id, 'student-2');
assert.equal(ranked.empty, false);
let iterated = 0;
ranked.forEach(() => { iterated += 1; });
assert.equal(iterated, 1);

await setDoc(doc(db, 'users/student-1/assignedShopItems', 'item-1'), { itemId: 'shared' });
await setDoc(doc(db, 'users/student-2/assignedShopItems', 'item-2'), { itemId: 'shared' });
const grouped = await getDocs(query(collectionGroup(db, 'assignedShopItems'), where('itemId', '==', 'shared')));
assert.equal(grouped.size, 2);
assert(grouped.docs.every((snapshot) => snapshot.ref.path.includes('/assignedShopItems/')));

// Transaction writes are staged and sent in one commit with read preconditions.
const commitCountBefore = calls.filter((call) => call.operation === 'commit').length;
const transactionResult = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(first);
    transaction.update(first, { score: snapshot.data().score + 5 });
    transaction.set(doc(db, 'receipts', 'r1'), { ok: true });
    return 'done';
});
assert.equal(transactionResult, 'done');
assert.equal((await getDoc(first)).data().score, 17);
const transactionCommits = calls.filter((call) => call.operation === 'commit').slice(commitCountBefore);
assert.equal(transactionCommits.length, 1);
assert.equal(transactionCommits[0].payload.writes.length, 2);
assert.equal(transactionCommits[0].payload.reads.length, 1);

const commitsBeforeFailure = calls.filter((call) => call.operation === 'commit').length;
await assert.rejects(runTransaction(db, async (transaction) => {
    await transaction.get(first);
    transaction.delete(first);
    throw new Error('cancel callback');
}), /cancel callback/);
assert.equal(calls.filter((call) => call.operation === 'commit').length, commitsBeforeFailure);
assert.equal((await getDoc(first)).exists(), true);

// onSnapshot polling emits only changed values and can be unsubscribed.
const observed = [];
const unsubscribe = onSnapshot(first, (snapshot) => observed.push(snapshot.data().score), (error) => { throw error; });
await new Promise((resolve) => setTimeout(resolve, 40));
await updateDoc(first, { score: 19 });
await new Promise((resolve) => setTimeout(resolve, 290));
unsubscribe();
assert.deepEqual(observed, [17, 19]);

// Storage compatibility: references, metadata/listing, blob URLs, and deletion.
const storage = getStorage(db.app);
const pdfReference = ref(storage, 'cloud/student-1/report.pdf');
await uploadBytes(pdfReference, new Blob(['pdf-body'], { type: 'application/pdf' }), { contentType: 'application/pdf' });
const listed = await listAll(ref(storage, 'cloud/student-1'));
assert.equal(listed.items.length, 1);
assert.equal(listed.items[0].name, 'report.pdf');
assert.equal((await getMetadata(pdfReference)).size, 8);
const blobUrl = await getDownloadURL(pdfReference);
assert.match(blobUrl, /^blob:/);
assert.equal(await fetch(blobUrl).then((response) => response.text()), 'pdf-body');
await deleteObject(pdfReference);
assert.equal((await listAll(ref(storage, 'cloud/student-1'))).items.length, 0);

// Firebase bridge read-through and best-effort write mirroring.
const bridgeWrites = [];
const bridgeData = new Map([['legacy/doc-1', { source: 'firebase', when: { _seconds: 100, _nanoseconds: 2 } }]]);
const fakeBridge = {
    Timestamp,
    getFirestore: () => ({}),
    doc: (_db, path) => ({ path }),
    getDoc: async (reference) => ({
        exists: () => bridgeData.has(reference.path),
        data: () => copy(bridgeData.get(reference.path)),
        metadata: { fromCache: false }
    }),
    setDoc: async (reference, data, options) => { bridgeWrites.push({ type: 'set', path: reference.path, data, options }); },
    updateDoc: async (reference, data) => { bridgeWrites.push({ type: 'update', path: reference.path, data }); },
    deleteDoc: async (reference) => { bridgeWrites.push({ type: 'delete', path: reference.path }); },
    serverTimestamp: () => ({ firebaseTransform: 'serverTimestamp' }),
    arrayUnion: (...values) => ({ firebaseTransform: 'arrayUnion', values }),
    arrayRemove: (...values) => ({ firebaseTransform: 'arrayRemove', values })
};
__adapterTest.setBridge(fakeBridge);
const legacyReference = doc(db, 'legacy', 'doc-1');
const legacySnapshot = await getDoc(legacyReference);
assert.equal(legacySnapshot.data().source, 'firebase');
assert(legacySnapshot.data().when instanceof Timestamp);
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(documents.get('legacy/doc-1').data.source, 'firebase');
await setDoc(doc(db, 'mirror', 'doc-1'), { mirrored: true });
await new Promise((resolve) => setTimeout(resolve, 0));
assert(bridgeWrites.some((write) => write.path === 'mirror/doc-1' && write.type === 'set'));

await deleteDoc(first);
assert.equal((await getDoc(first)).exists(), false);

__adapterTest.reset();
console.log(`adapter tests passed: ${calls.length} primary calls; disabled production bridge; ${bridgeWrites.length} isolated opt-in bridge checks`);
