// Firestore/Storage-compatible browser adapter for the Korean app.
// The self-hosted endpoint is authoritative. Firebase authentication remains in use,
// but Firestore/Storage read-through and write mirroring are disabled by default.

const DEFAULT_ENDPOINT = '/db-api/korean/v2';
const DEFAULT_POLL_MS = 5000;
const FIREBASE_VERSION = '11.6.1';
const TYPE_KEY = '__koreanAdapterType';
const config = globalThis.__KOREAN_DATA_ADAPTER__ ||= {};

let testTransport = null;
let bridgeOverride;
let firestoreBridgePromise;
let storageBridgePromise;
let firebaseAuthPromise;
const objectUrls = new Map();

function adapterConfig() {
    return {
        endpoint: config.endpoint || DEFAULT_ENDPOINT,
        apiKey: config.apiKey || '',
        pollIntervalMs: Math.max(250, Number(config.pollIntervalMs) || DEFAULT_POLL_MS),
        firebaseBridge: config.firebaseBridge === true
    };
}

function cleanPath(value) {
    return String(value || '').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
}

function pathParts(value) {
    const path = cleanPath(value);
    return path ? path.split('/') : [];
}

function assertPath(path, kind) {
    const count = pathParts(path).length;
    if (!count || (kind === 'document' ? count % 2 !== 0 : count % 2 !== 1)) {
        throw new TypeError(`Invalid ${kind} path: ${path}`);
    }
}

function joinReferencePath(parent, segments) {
    const base = parent?.path || '';
    return cleanPath([base, ...segments.map(String)].filter(Boolean).join('/'));
}

function randomId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID().replaceAll('-', '');
    const bytes = new Uint8Array(20);
    globalThis.crypto?.getRandomValues?.(bytes);
    const value = bytes.some(Boolean)
        ? Array.from(bytes, (byte) => byte.toString(36).padStart(2, '0')).join('')
        : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
    return value.slice(0, 40);
}

export class Timestamp {
    constructor(seconds, nanoseconds = 0) {
        this.seconds = Number(seconds);
        this.nanoseconds = Number(nanoseconds);
        if (!Number.isInteger(this.seconds) || !Number.isInteger(this.nanoseconds) || this.nanoseconds < 0 || this.nanoseconds >= 1e9) {
            throw new TypeError('Timestamp requires integer seconds and nanoseconds in [0, 1e9).');
        }
        Object.freeze(this);
    }

    static now() { return Timestamp.fromMillis(Date.now()); }
    static fromDate(date) { return Timestamp.fromMillis(date.getTime()); }
    static fromMillis(milliseconds) {
        const seconds = Math.floor(Number(milliseconds) / 1000);
        return new Timestamp(seconds, Math.floor((Number(milliseconds) - seconds * 1000) * 1e6));
    }

    toDate() { return new Date(this.toMillis()); }
    toMillis() { return this.seconds * 1000 + this.nanoseconds / 1e6; }
    isEqual(other) { return other instanceof Timestamp && other.seconds === this.seconds && other.nanoseconds === this.nanoseconds; }
    valueOf() { return `${String(this.seconds + 62135596800).padStart(12, '0')}.${String(this.nanoseconds).padStart(9, '0')}`; }
    toJSON() { return { [TYPE_KEY]: 'timestamp', seconds: this.seconds, nanoseconds: this.nanoseconds }; }
}

class Transform {
    constructor(operation, values = []) {
        this.operation = operation;
        this.values = values;
        Object.freeze(this.values);
        Object.freeze(this);
    }
}

export function serverTimestamp() { return new Transform('serverTimestamp'); }
export function arrayUnion(...values) { return new Transform('arrayUnion', values); }
export function arrayRemove(...values) { return new Transform('arrayRemove', values); }

function isPlainObject(value) {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}

function encodeValue(value) {
    if (value === undefined) return undefined;
    if (value instanceof Transform) return { [TYPE_KEY]: 'transform', operation: value.operation, values: value.values.map(encodeValue) };
    if (value instanceof Timestamp) return value.toJSON();
    if (value instanceof Date) return Timestamp.fromDate(value).toJSON();
    if (Array.isArray(value)) return value.map(encodeValue);
    if (isPlainObject(value)) {
        const output = {};
        for (const [key, child] of Object.entries(value)) {
            const encoded = encodeValue(child);
            if (encoded !== undefined) output[key] = encoded;
        }
        return output;
    }
    return value;
}

function integerOrNull(value) {
    if (typeof value === 'number' && Number.isInteger(value)) return value;
    if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value);
    return null;
}

function timestampFromMillis(value) {
    const millis = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(millis)) return null;
    const seconds = Math.floor(millis / 1000);
    return [seconds, Math.floor((millis - seconds * 1000) * 1e6)];
}

function timestampParts(value) {
    if (!value || typeof value !== 'object') return null;
    if (value instanceof Timestamp) return [value.seconds, value.nanoseconds];
    const seconds = integerOrNull(value.seconds ?? value._seconds);
    const nanoseconds = integerOrNull(value.nanoseconds ?? value._nanoseconds ?? value.nanos ?? 0);
    if (value[TYPE_KEY] === 'timestamp' || value.__type === 'timestamp' || value.type === 'timestamp') {
        if (value.millis !== undefined || value.milliseconds !== undefined) return timestampFromMillis(value.millis ?? value.milliseconds);
        if (seconds !== null && nanoseconds !== null) return [seconds, nanoseconds];
        return null;
    }
    if (seconds !== null && nanoseconds !== null) return [seconds, nanoseconds];
    return null;
}

export function reviveValue(value) {
    const parts = timestampParts(value);
    if (parts) return new Timestamp(Number(parts[0]), Number(parts[1]));
    if (Array.isArray(value)) return value.map(reviveValue);
    if (isPlainObject(value)) {
        const output = {};
        for (const [key, child] of Object.entries(value)) output[key] = reviveValue(child);
        return output;
    }
    return value;
}

function cloneValue(value) {
    if (value instanceof Timestamp) return new Timestamp(value.seconds, value.nanoseconds);
    if (Array.isArray(value)) return value.map(cloneValue);
    if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cloneValue(child)]));
    return value;
}

function stableValue(value) {
    const sortKeys = (item) => {
        if (Array.isArray(item)) return item.map(sortKeys);
        if (isPlainObject(item)) return Object.fromEntries(Object.keys(item).sort().map((key) => [key, sortKeys(item[key])]));
        return item;
    };
    return JSON.stringify(sortKeys(encodeValue(value)));
}

class AdapterError extends Error {
    constructor(message, status = 0, body = null) {
        super(message);
        this.name = 'KoreanDataAdapterError';
        this.status = status;
        this.body = body;
        this.code = body?.code || (status === 409 || status === 412 ? 'aborted' : 'unknown');
    }
}

async function resolveFirebaseAuth(app) {
    if (!app || typeof window === 'undefined') return null;

    // Prefer the Auth instance already attached by the page. During the migration,
    // some pages can initialize the same Firebase app through another SDK version;
    // calling getAuth(app) from this adapter first can otherwise throw or briefly
    // expose currentUser as null while persisted authentication is being restored.
    let auth = null;
    try {
        auth = app?._container?.getProvider?.('auth')?.getImmediate?.({ optional: true }) || null;
    } catch {
        auth = null;
    }

    if (!auth) {
        firebaseAuthPromise ||= import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`).catch(() => null);
        const authModule = await firebaseAuthPromise;
        try {
            auth = authModule?.getAuth?.(app) || null;
        } catch {
            auth = null;
        }
    }

    // Wait for IndexedDB-backed login restoration before the first private API
    // request. Anonymous/public reads still proceed immediately when no Auth
    // instance is available, and readiness failures remain non-fatal.
    if (typeof auth?.authStateReady === 'function') {
        await auth.authStateReady().catch(() => undefined);
    }
    return auth;
}

async function authHeaders(dbOrStorage) {
    const headers = {};
    const apiKey = adapterConfig().apiKey;
    if (apiKey) headers['x-api-key'] = apiKey;
    const app = dbOrStorage?.app;
    let token = null;
    if (typeof config.tokenProvider === 'function') {
        token = await Promise.resolve(config.tokenProvider()).catch(() => null);
    // Firebase Auth remains the temporary identity provider even after every
    // Firestore/Storage bridge read and write has been disabled.
    } else if (app && typeof window !== 'undefined') {
        const auth = await resolveFirebaseAuth(app);
        token = await auth?.currentUser?.getIdToken?.().catch(() => null);
    }
    if (token) headers.authorization = `Bearer ${token}`;
    return headers;
}

function encodeUrlPath(path) {
    return cleanPath(path).split('/').map(encodeURIComponent).join('/');
}

function randomCommitKey() {
    return `web-${randomId()}-${Date.now().toString(36)}`.slice(0, 180);
}

function queryRequest(payload) {
    const filters = [];
    const order = [];
    let cap = 500;
    for (const constraint of payload.constraints || []) {
        if (constraint.type === 'where') filters.push({ field: constraint.fieldPath, op: constraint.operator, value: constraint.value });
        else if (constraint.type === 'orderBy') order.push({ field: constraint.fieldPath, direction: constraint.direction });
        else if (constraint.type === 'limit') cap = constraint.count;
    }
    return {
        ...(payload.source?.type === 'collectionGroup'
            ? { collectionGroup: payload.source.collectionId }
            : { collection: payload.source?.path }),
        where: filters,
        orderBy: order,
        limit: cap
    };
}

function commitRequest(payload) {
    const readVersions = new Map((payload.reads || []).map((read) => [read.path, read.exists ? read.version : 0]));
    return {
        operations: (payload.writes || []).map((write) => ({
            type: write.type,
            path: write.path,
            ...(write.type === 'delete' ? {} : { data: write.data || {} }),
            ...(write.options?.merge ? { merge: true } : {}),
            ...(readVersions.has(write.path) ? { expectedRevision: readVersions.get(write.path) } : {})
        }))
    };
}

async function parseErrorResponse(response) {
    let errorBody = null;
    try { errorBody = await response.json(); }
    catch { errorBody = await response.text().catch(() => null); }
    return new AdapterError(errorBody?.error || errorBody?.message || `Korean data API failed (${response.status})`, response.status, errorBody);
}

async function defaultTransport(operation, payload, context = {}) {
    const endpoint = adapterConfig().endpoint.replace(/\/+$/, '');
    const headers = await authHeaders(context.instance);
    const options = { headers, credentials: 'same-origin', signal: context.signal };
    let url = endpoint;

    if (operation === 'getDocument') {
        url += `/documents/${encodeUrlPath(payload.path)}`;
        options.method = 'GET';
    } else if (operation === 'query') {
        url += '/query';
        options.method = 'POST';
        headers['content-type'] = 'application/json';
        options.body = JSON.stringify(encodeValue(queryRequest(payload)));
    } else if (operation === 'commit') {
        if (!(payload.writes || []).length) return { committed: true, results: [] };
        url += '/commit';
        options.method = 'POST';
        headers['content-type'] = 'application/json';
        headers['idempotency-key'] = payload.idempotencyKey || randomCommitKey();
        options.body = JSON.stringify(encodeValue(commitRequest(payload)));
    } else if (operation === 'storageUpload') {
        url += `/storage/${encodeUrlPath(payload.path)}`;
        options.method = 'PUT';
        headers['content-type'] = payload.metadata?.contentType || payload.blob?.type || 'application/octet-stream';
        options.body = payload.blob;
    } else if (operation === 'storageList') {
        url += `/storage?prefix=${encodeURIComponent(cleanPath(payload.path))}`;
        options.method = 'GET';
    } else if (operation === 'storageMetadata') {
        url += `/storage/${encodeUrlPath(payload.path)}?metadata=1`;
        options.method = 'GET';
    } else if (operation === 'storageDownload') {
        url += `/storage/${encodeUrlPath(payload.path)}`;
        options.method = 'GET';
    } else if (operation === 'storageDelete') {
        url += `/storage/${encodeUrlPath(payload.path)}`;
        options.method = 'DELETE';
    } else {
        throw new AdapterError(`Unsupported Korean data operation: ${operation}`, 400, { code: 'invalid-argument' });
    }

    const response = await fetch(url, options);
    if (operation === 'getDocument' && response.status === 404) return { exists: false };
    if (operation === 'storageMetadata' && response.status === 404) return { exists: false };
    if (!response.ok) throw await parseErrorResponse(response);
    if (operation === 'storageDownload') return response.blob();
    if (response.status === 204) return {};
    const value = await response.json();
    if (operation === 'getDocument') return { exists: true, document: value.document };
    if (operation === 'query') return value;
    if (operation === 'storageList') return { files: value.objects || value.files || [] };
    if (operation === 'storageMetadata') return value.object ? { metadata: value.object } : value;
    return value;
}

async function callPrimary(operation, payload, instance, signal) {
    return (testTransport || defaultTransport)(operation, payload, { instance, signal });
}

function getDb(referenceOrQuery) {
    return referenceOrQuery?.db || referenceOrQuery?.source?.db || referenceOrQuery;
}

export function getFirestore(app) {
    return Object.freeze({ type: 'firestore', app, endpoint: adapterConfig().endpoint });
}

export function doc(parent, ...segments) {
    const db = getDb(parent);
    const path = joinReferencePath(parent?.type === 'firestore' ? null : parent, segments);
    assertPath(path, 'document');
    return Object.freeze({ type: 'document', db, path, id: pathParts(path).at(-1), parent: collection(db, ...pathParts(path).slice(0, -1)) });
}

export function collection(parent, ...segments) {
    const db = getDb(parent);
    const path = joinReferencePath(parent?.type === 'firestore' ? null : parent, segments);
    assertPath(path, 'collection');
    return Object.freeze({ type: 'collection', db, path, id: pathParts(path).at(-1), parent: pathParts(path).length > 1 ? doc(db, ...pathParts(path).slice(0, -1)) : null });
}

export function collectionGroup(db, collectionId) {
    if (!collectionId || String(collectionId).includes('/')) throw new TypeError('collectionGroup requires one collection ID.');
    return Object.freeze({ type: 'collectionGroup', db, collectionId: String(collectionId), path: `**/${collectionId}` });
}

export function where(fieldPath, operator, value) {
    if (operator !== '==') throw new TypeError(`Only == queries are supported, received ${operator}.`);
    return Object.freeze({ type: 'where', fieldPath: String(fieldPath), operator, value: cloneValue(value) });
}

export function limit(count) {
    const value = Number(count);
    if (!Number.isInteger(value) || value < 0) throw new TypeError('limit requires a non-negative integer.');
    return Object.freeze({ type: 'limit', count: value });
}

export function orderBy(fieldPath, direction = 'asc') {
    if (!['asc', 'desc'].includes(direction)) throw new TypeError('orderBy direction must be asc or desc.');
    return Object.freeze({ type: 'orderBy', fieldPath: String(fieldPath), direction });
}

export function query(source, ...constraints) {
    if (!['collection', 'collectionGroup'].includes(source?.type)) throw new TypeError('query requires a collection or collectionGroup.');
    return Object.freeze({ type: 'query', db: source.db, source, constraints: Object.freeze(constraints.slice()) });
}

export class DocumentSnapshot {
    constructor(reference, found, value, metadata = {}) {
        this.ref = reference;
        this.id = reference.id;
        this.metadata = Object.freeze({ fromCache: false, hasPendingWrites: false, ...metadata });
        this._found = Boolean(found);
        this._value = this._found ? reviveValue(value || {}) : undefined;
        Object.freeze(this);
    }
    exists() { return this._found; }
    data() { return this._found ? cloneValue(this._value) : undefined; }
    get(fieldPath) { return this._found ? cloneValue(readField(this._value, fieldPath)) : undefined; }
}

export class QuerySnapshot {
    constructor(queryReference, snapshots, metadata = {}) {
        this.query = queryReference;
        this.docs = Object.freeze(snapshots.slice());
        this.size = this.docs.length;
        this.empty = this.size === 0;
        this.metadata = Object.freeze({ fromCache: false, hasPendingWrites: false, ...metadata });
        Object.freeze(this);
    }
    forEach(callback, thisArg) { this.docs.forEach(callback, thisArg); }
}

function readField(value, fieldPath) {
    return String(fieldPath).split('.').reduce((current, part) => current == null ? undefined : current[part], value);
}

function comparable(value) {
    if (value instanceof Timestamp) return value.toMillis();
    if (value instanceof Date) return value.getTime();
    return value;
}

function valuesEqual(left, right) {
    if (left instanceof Timestamp || right instanceof Timestamp) return comparable(left) === comparable(right);
    if (left && right && typeof left === 'object' && typeof right === 'object') return JSON.stringify(encodeValue(left)) === JSON.stringify(encodeValue(right));
    return Object.is(left, right);
}

function applyConstraints(rows, constraints) {
    let output = rows.slice();
    for (const constraint of constraints) {
        if (constraint.type === 'where') output = output.filter((row) => valuesEqual(readField(row.data, constraint.fieldPath), constraint.value));
    }
    const orders = constraints.filter((item) => item.type === 'orderBy');
    if (orders.length) {
        output.sort((left, right) => {
            for (const order of orders) {
                const a = comparable(readField(left.data, order.fieldPath));
                const b = comparable(readField(right.data, order.fieldPath));
                const result = a === b ? 0 : a == null ? -1 : b == null ? 1 : a < b ? -1 : 1;
                if (result) return order.direction === 'desc' ? -result : result;
            }
            return left.path.localeCompare(right.path);
        });
    }
    const cap = constraints.find((item) => item.type === 'limit');
    if (cap) output = output.slice(0, cap.count);
    return output;
}

function normalizeDocumentResponse(response, reference) {
    const raw = response?.document ?? response?.doc ?? response?.item ?? response;
    const found = response?.exists ?? response?.found ?? (raw?.exists !== false && raw?.data != null);
    const data = raw?.data ?? raw?.value ?? (found && isPlainObject(raw) ? raw : undefined);
    return { found: Boolean(found), data: reviveValue(data), version: raw?.revision ?? raw?.version ?? raw?.updatedAt ?? response?.revision ?? response?.version ?? null };
}

function normalizeRows(response, source) {
    const rawRows = Array.isArray(response) ? response : response?.documents ?? response?.docs ?? response?.items ?? response?.results ?? [];
    return rawRows.map((raw) => {
        const candidate = raw?.document ?? raw;
        const data = reviveValue(candidate?.data ?? candidate?.value ?? candidate);
        let path = cleanPath(candidate?.path || candidate?.ref?.path || '');
        const id = String(candidate?.id ?? pathParts(path).at(-1) ?? '');
        if (!path && source.type === 'collection') path = `${source.path}/${id}`;
        if (!path && source.type === 'collectionGroup') path = `${source.collectionId}/${id}`;
        return { id: id || pathParts(path).at(-1), path, data, version: candidate?.revision ?? candidate?.version ?? candidate?.updatedAt ?? null };
    }).filter((row) => row.id && row.path);
}

async function firestoreBridge() {
    if (bridgeOverride !== undefined) return bridgeOverride;
    if (!adapterConfig().firebaseBridge || typeof window === 'undefined') return null;
    firestoreBridgePromise ||= import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`).catch((error) => {
        console.warn('Firebase Firestore bridge unavailable:', error);
        return null;
    });
    return firestoreBridgePromise;
}

async function storageBridge() {
    if (bridgeOverride !== undefined) return bridgeOverride;
    if (!adapterConfig().firebaseBridge || typeof window === 'undefined') return null;
    storageBridgePromise ||= import(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-storage.js`).catch((error) => {
        console.warn('Firebase Storage bridge unavailable:', error);
        return null;
    });
    return storageBridgePromise;
}

async function bridgeDb(db) {
    const bridge = await firestoreBridge();
    return bridge ? { bridge, instance: bridge.getFirestore(db.app) } : null;
}

function bridgeConstraint(bridge, constraint) {
    if (constraint.type === 'where') return bridge.where(constraint.fieldPath, constraint.operator, toBridgeValue(bridge, constraint.value));
    if (constraint.type === 'limit') return bridge.limit(constraint.count);
    if (constraint.type === 'orderBy') return bridge.orderBy(constraint.fieldPath, constraint.direction);
    throw new TypeError(`Unsupported query constraint: ${constraint.type}`);
}

function toBridgeValue(bridge, value) {
    if (value instanceof Transform) {
        if (value.operation === 'serverTimestamp') return bridge.serverTimestamp();
        if (value.operation === 'arrayUnion') return bridge.arrayUnion(...value.values.map((item) => toBridgeValue(bridge, item)));
        if (value.operation === 'arrayRemove') return bridge.arrayRemove(...value.values.map((item) => toBridgeValue(bridge, item)));
    }
    if (value instanceof Timestamp) return new bridge.Timestamp(value.seconds, value.nanoseconds);
    if (Array.isArray(value)) return value.map((item) => toBridgeValue(bridge, item));
    if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toBridgeValue(bridge, item)]));
    return value;
}

async function bridgeDocumentReference(reference) {
    const state = await bridgeDb(reference.db);
    return state ? { ...state, reference: state.bridge.doc(state.instance, reference.path) } : null;
}

async function bridgeQueryReference(queryReference) {
    const state = await bridgeDb(queryReference.db);
    if (!state) return null;
    const source = queryReference.source || queryReference;
    const bridgeSource = source.type === 'collectionGroup'
        ? state.bridge.collectionGroup(state.instance, source.collectionId)
        : state.bridge.collection(state.instance, source.path);
    const constraints = queryReference.constraints || [];
    return { ...state, reference: constraints.length ? state.bridge.query(bridgeSource, ...constraints.map((item) => bridgeConstraint(state.bridge, item))) : bridgeSource };
}

async function mirrorWrite(db, write) {
    const state = await bridgeDb(db);
    if (!state) return;
    const reference = state.bridge.doc(state.instance, write.path);
    if (write.type === 'delete') await state.bridge.deleteDoc(reference);
    else if (write.type === 'update') await state.bridge.updateDoc(reference, toBridgeValue(state.bridge, write.data));
    else await state.bridge.setDoc(reference, toBridgeValue(state.bridge, write.data), write.options || {});
}

function bestEffort(task, label) {
    Promise.resolve().then(task).catch((error) => console.warn(`${label} failed:`, error));
}

async function mirrorPrimaryDocument(reference, value) {
    await callPrimary('commit', { writes: [{ type: 'set', path: reference.path, data: encodeValue(value), options: { merge: false }, source: 'firebase-read-through' }] }, reference.db);
}

async function readBridgeDocument(reference, mirror = true) {
    const state = await bridgeDocumentReference(reference);
    if (!state) return null;
    const snapshot = await state.bridge.getDoc(state.reference);
    if (!snapshot.exists()) return new DocumentSnapshot(reference, false);
    const value = reviveValue(snapshot.data());
    if (mirror) bestEffort(() => mirrorPrimaryDocument(reference, value), 'Firebase document read-through mirror');
    return new DocumentSnapshot(reference, true, value, { fromCache: snapshot.metadata?.fromCache || false });
}

export async function getDoc(reference) {
    if (reference?.type !== 'document') throw new TypeError('getDoc requires a document reference.');
    let primaryError = null;
    try {
        const response = await callPrimary('getDocument', { path: reference.path }, reference.db);
        const normalized = normalizeDocumentResponse(response, reference);
        if (normalized.found) return new DocumentSnapshot(reference, true, normalized.data);
    } catch (error) { primaryError = error; }
    try {
        const fallback = await readBridgeDocument(reference);
        if (fallback) return fallback;
    } catch (error) {
        if (primaryError) console.warn('Firebase document read-through failed:', error);
        else throw error;
    }
    if (primaryError) throw primaryError;
    return new DocumentSnapshot(reference, false);
}

function queryPayload(reference) {
    const source = reference.source || reference;
    return {
        source: source.type === 'collectionGroup' ? { type: 'collectionGroup', collectionId: source.collectionId } : { type: 'collection', path: source.path },
        constraints: (reference.constraints || []).map((item) => encodeValue(item))
    };
}

async function readBridgeQuery(reference, existingPaths = new Set()) {
    const state = await bridgeQueryReference(reference);
    if (!state) return null;
    const snapshot = await state.bridge.getDocs(state.reference);
    const documents = snapshot.docs.map((item) => ({ path: item.ref.path, data: reviveValue(item.data()) }));
    const missingDocuments = documents.filter((item) => !existingPaths.has(item.path));
    if (missingDocuments.length) {
        bestEffort(() => callPrimary('commit', {
            writes: missingDocuments.map((item) => ({ type: 'set', path: item.path, data: encodeValue(item.data), options: { merge: false }, source: 'firebase-read-through' }))
        }, reference.db), 'Firebase query read-through mirror');
    }
    return new QuerySnapshot(reference, documents.map((item) => new DocumentSnapshot(doc(reference.db, item.path), true, item.data)), { fromCache: snapshot.metadata?.fromCache || false });
}

export async function getDocs(reference) {
    if (!['collection', 'collectionGroup', 'query'].includes(reference?.type)) throw new TypeError('getDocs requires a collection or query.');
    const source = reference.source || reference;
    const constraints = reference.constraints || [];
    let primaryError = null;
    let primaryRows = [];
    try {
        const response = await callPrimary('query', queryPayload(reference), reference.db);
        primaryRows = applyConstraints(normalizeRows(response, source), constraints);
        if (!adapterConfig().firebaseBridge || response?.authoritativeEmpty === true) {
            return new QuerySnapshot(reference, primaryRows.map((row) => new DocumentSnapshot(doc(reference.db, row.path), true, row.data)));
        }
    } catch (error) { primaryError = error; }
    try {
        const fallback = await readBridgeQuery(reference, new Set(primaryRows.map((row) => row.path)));
        if (fallback) {
            const merged = new Map(fallback.docs.map((snapshot) => [snapshot.ref.path, snapshot]));
            for (const row of primaryRows) merged.set(row.path, new DocumentSnapshot(doc(reference.db, row.path), true, row.data));
            return new QuerySnapshot(reference, [...merged.values()]);
        }
    } catch (error) {
        if (primaryError) console.warn('Firebase query read-through failed:', error);
        else if (!primaryRows.length) throw error;
        else console.warn('Firebase query bridge failed; using self-hosted results:', error);
    }
    if (primaryRows.length) return new QuerySnapshot(reference, primaryRows.map((row) => new DocumentSnapshot(doc(reference.db, row.path), true, row.data)));
    if (primaryError) throw primaryError;
    return new QuerySnapshot(reference, []);
}

async function commitWrites(db, writes, reads = []) {
    await callPrimary('commit', { writes: writes.map((write) => ({ ...write, data: encodeValue(write.data) })), reads }, db);
    for (const write of writes) bestEffort(() => mirrorWrite(db, write), 'Firebase write mirror');
}

export async function setDoc(reference, data, options = {}) {
    await commitWrites(reference.db, [{ type: 'set', path: reference.path, data, options: { merge: Boolean(options?.merge), mergeFields: options?.mergeFields } }]);
}

function fieldPairs(args) {
    if (args.length === 1 && isPlainObject(args[0])) return args[0];
    if (args.length < 2 || args.length % 2 !== 0) throw new TypeError('updateDoc requires an object or field/value pairs.');
    const output = {};
    for (let index = 0; index < args.length; index += 2) output[String(args[index])] = args[index + 1];
    return output;
}

export async function updateDoc(reference, ...args) {
    await commitWrites(reference.db, [{ type: 'update', path: reference.path, data: fieldPairs(args) }]);
}

export async function addDoc(collectionReference, data) {
    const reference = doc(collectionReference, randomId());
    await setDoc(reference, data);
    return reference;
}

export async function deleteDoc(reference) {
    await commitWrites(reference.db, [{ type: 'delete', path: reference.path }]);
}

export async function runTransaction(db, updateFunction, options = {}) {
    const maxAttempts = Math.max(1, Number(options.maxAttempts) || 3);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const writes = [];
        const reads = [];
        let writeStarted = false;
        const transaction = Object.freeze({
            async get(reference) {
                if (writeStarted) throw new AdapterError('Firestore transactions require all reads before writes.', 400, { code: 'failed-precondition' });
                const response = await callPrimary('getDocument', { path: reference.path, transaction: true }, db);
                let normalized = normalizeDocumentResponse(response, reference);
                if (!normalized.found) {
                    const bridgeSnapshot = await readBridgeDocument(reference, false).catch(() => null);
                    if (bridgeSnapshot?.exists()) {
                        await mirrorPrimaryDocument(reference, bridgeSnapshot.data());
                        normalized = normalizeDocumentResponse(
                            await callPrimary('getDocument', { path: reference.path, transaction: true }, db),
                            reference
                        );
                    }
                }
                reads.push({ path: reference.path, version: normalized.version, exists: normalized.found });
                return new DocumentSnapshot(reference, normalized.found, normalized.data);
            },
            set(reference, data, writeOptions = {}) {
                writeStarted = true;
                writes.push({ type: 'set', path: reference.path, data, options: { merge: Boolean(writeOptions?.merge), mergeFields: writeOptions?.mergeFields } });
                return transaction;
            },
            update(reference, ...args) {
                writeStarted = true;
                writes.push({ type: 'update', path: reference.path, data: fieldPairs(args) });
                return transaction;
            },
            delete(reference) {
                writeStarted = true;
                writes.push({ type: 'delete', path: reference.path });
                return transaction;
            }
        });
        const result = await updateFunction(transaction);
        try {
            if (writes.length) await commitWrites(db, writes, reads);
            return result;
        } catch (error) {
            if (attempt >= maxAttempts || !['aborted', 'conflict'].includes(error?.code) && ![409, 412].includes(error?.status)) throw error;
        }
    }
}

function observerArguments(nextOrObserver, error) {
    if (typeof nextOrObserver === 'function') return { next: nextOrObserver, error: typeof error === 'function' ? error : () => {} };
    return { next: nextOrObserver?.next?.bind(nextOrObserver) || (() => {}), error: nextOrObserver?.error?.bind(nextOrObserver) || (() => {}) };
}

export function onSnapshot(reference, nextOrObserver, errorCallback) {
    const observer = observerArguments(nextOrObserver, errorCallback);
    let stopped = false;
    let running = false;
    let previous;
    const poll = async () => {
        if (stopped || running) return;
        running = true;
        try {
            const snapshot = reference.type === 'document' ? await getDoc(reference) : await getDocs(reference);
            const signature = reference.type === 'document'
                ? stableValue({ exists: snapshot.exists(), data: snapshot.data() })
                : stableValue(snapshot.docs.map((item) => ({ path: item.ref.path, data: item.data() })));
            if (signature !== previous) {
                previous = signature;
                observer.next(snapshot);
            }
        } catch (error) { observer.error(error); }
        finally { running = false; }
    };
    void poll();
    const timer = setInterval(poll, adapterConfig().pollIntervalMs);
    return () => { stopped = true; clearInterval(timer); };
}

export function getStorage(app) {
    return Object.freeze({ type: 'storage', app, endpoint: adapterConfig().endpoint });
}

export function ref(parent, childPath = '') {
    const storage = parent?.type === 'storageReference' ? parent.storage : parent;
    const path = cleanPath(parent?.type === 'storageReference' ? `${parent.fullPath}/${childPath}` : childPath);
    return Object.freeze({ type: 'storageReference', storage, fullPath: path, name: pathParts(path).at(-1) || '', bucket: storage?.app?.options?.storageBucket || '' });
}

async function bridgeStorageReference(reference) {
    const bridge = await storageBridge();
    if (!bridge) return null;
    const instance = bridge.getStorage(reference.storage.app);
    return { bridge, instance, reference: bridge.ref(instance, reference.fullPath) };
}

function revokeObjectUrl(path) {
    const previous = objectUrls.get(path);
    if (previous) URL.revokeObjectURL(previous);
    objectUrls.delete(path);
}

export async function uploadBytes(reference, data, metadata = {}) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: metadata.contentType || 'application/octet-stream' });
    await callPrimary('storageUpload', { path: reference.fullPath, blob, metadata, name: reference.name }, reference.storage);
    revokeObjectUrl(reference.fullPath);
    bestEffort(async () => {
        const state = await bridgeStorageReference(reference);
        if (state) await state.bridge.uploadBytes(state.reference, blob, metadata);
    }, 'Firebase Storage upload mirror');
    return Object.freeze({ ref: reference, metadata: { ...metadata, size: blob.size, fullPath: reference.fullPath, name: reference.name } });
}

function normalizeStorageFiles(response) {
    return (response?.files ?? response?.items ?? response ?? []).map((item) => typeof item === 'string' ? { path: item } : item).map((item) => ({
        path: cleanPath(item.path || item.fullPath || item.name),
        size: Number(item.size ?? item.bytes ?? 0),
        timeCreated: item.timeCreated || item.createdAt || item.created_at || '',
        updated: item.updated || item.updatedAt || item.updated_at || '',
        contentType: item.contentType || item.content_type || 'application/octet-stream'
    })).filter((item) => item.path);
}

export async function listAll(reference) {
    let primaryError = null;
    try {
        const response = await callPrimary('storageList', { path: reference.fullPath }, reference.storage);
        const files = normalizeStorageFiles(response);
        if (files.length || response?.authoritativeEmpty === true) {
            const prefix = reference.fullPath ? `${reference.fullPath}/` : '';
            const direct = files.filter((file) => file.path.startsWith(prefix) && !file.path.slice(prefix.length).includes('/'));
            const folders = [...new Set(files.filter((file) => file.path.startsWith(prefix) && file.path.slice(prefix.length).includes('/')).map((file) => file.path.slice(prefix.length).split('/')[0]))];
            return {
                items: direct.map((file) => Object.freeze({ ...ref(reference.storage, file.path), _metadata: file })),
                prefixes: folders.map((name) => ref(reference.storage, `${prefix}${name}`))
            };
        }
    } catch (error) { primaryError = error; }
    try {
        const state = await bridgeStorageReference(reference);
        if (state) {
            const result = await state.bridge.listAll(state.reference);
            return {
                items: result.items.map((item) => Object.freeze({ ...ref(reference.storage, item.fullPath), _firebaseOnly: true })),
                prefixes: result.prefixes.map((item) => ref(reference.storage, item.fullPath))
            };
        }
    } catch (error) { if (!primaryError) throw error; }
    if (primaryError) throw primaryError;
    return { items: [], prefixes: [] };
}

export async function getMetadata(reference) {
    if (reference._metadata) return { ...reference._metadata, fullPath: reference.fullPath, name: reference.name };
    let primaryError = null;
    try {
        const response = await callPrimary('storageMetadata', { path: reference.fullPath }, reference.storage);
        const metadata = response?.metadata ?? response?.file ?? response;
        if (metadata && (metadata.exists !== false) && (metadata.path || metadata.fullPath || metadata.size != null || metadata.bytes != null)) {
            return { ...metadata, size: Number(metadata.size ?? metadata.bytes ?? 0), fullPath: reference.fullPath, name: reference.name };
        }
    } catch (error) { primaryError = error; }
    try {
        const state = await bridgeStorageReference(reference);
        if (state) return await state.bridge.getMetadata(state.reference);
    } catch (error) { if (!primaryError) throw error; }
    if (primaryError) throw primaryError;
    throw new AdapterError(`Storage object not found: ${reference.fullPath}`, 404, { code: 'storage/object-not-found' });
}

export async function getDownloadURL(reference) {
    if (objectUrls.has(reference.fullPath)) return objectUrls.get(reference.fullPath);
    let blob;
    try {
        blob = await callPrimary('storageDownload', { path: reference.fullPath }, reference.storage);
    } catch (primaryError) {
        const state = await bridgeStorageReference(reference);
        if (!state) throw primaryError;
        const firebaseUrl = await state.bridge.getDownloadURL(state.reference);
        blob = await fetch(firebaseUrl).then((response) => {
            if (!response.ok) throw new AdapterError(`Firebase Storage download failed (${response.status})`, response.status);
            return response.blob();
        });
        bestEffort(() => callPrimary('storageUpload', { path: reference.fullPath, blob, metadata: { contentType: blob.type }, name: reference.name }, reference.storage), 'Firebase Storage read-through mirror');
    }
    const url = URL.createObjectURL(blob);
    objectUrls.set(reference.fullPath, url);
    return url;
}

export async function deleteObject(reference) {
    await callPrimary('storageDelete', { path: reference.fullPath }, reference.storage);
    revokeObjectUrl(reference.fullPath);
    bestEffort(async () => {
        const state = await bridgeStorageReference(reference);
        if (state) await state.bridge.deleteObject(state.reference);
    }, 'Firebase Storage delete mirror');
}

export const __adapterTest = Object.freeze({
    encodeValue,
    applyConstraints,
    normalizeDocumentResponse,
    normalizeRows,
    setTransport(transport) { testTransport = transport; },
    setBridge(bridge) { bridgeOverride = bridge; },
    reset() {
        testTransport = null;
        bridgeOverride = undefined;
        for (const path of [...objectUrls.keys()]) revokeObjectUrl(path);
    }
});
