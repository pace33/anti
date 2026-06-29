import { getAuth } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import {
  getFirestore as firebaseGetFirestore,
  doc as firebaseDoc,
  getDoc as firebaseGetDoc,
  collection as firebaseCollection,
  query as firebaseQuery,
  where as firebaseWhere,
  getDocs as firebaseGetDocs,
  orderBy as firebaseOrderBy,
  limit as firebaseLimit,
  startAfter as firebaseStartAfter,
  collectionGroup as firebaseCollectionGroup,
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Timestamp
export class Timestamp {
  constructor(seconds, nanoseconds) {
    this.seconds = seconds;
    this.nanoseconds = nanoseconds;
  }
  static now() {
    return Timestamp.fromMillis(Date.now());
  }
  static fromDate(date) {
    return Timestamp.fromMillis(date.getTime());
  }
  static fromMillis(ms) {
    const seconds = Math.floor(ms / 1000);
    const nanoseconds = (ms % 1000) * 1e6;
    return new Timestamp(seconds, nanoseconds);
  }
  toDate() {
    return new Date(this.seconds * 1000 + this.nanoseconds / 1e6);
  }
  toMillis() {
    return this.seconds * 1000 + this.nanoseconds / 1e6;
  }
}

// Helpers
function getDbCollectionName(collectionId) {
  const safe = collectionId.replace(/[^a-zA-Z0-9_\uac00-\ud7a3\-]/g, '');
  const prefix = safe.substring(0, 30);
  
  let hash = 0;
  for (let i = 0; i < collectionId.length; i++) {
    hash = (hash << 5) - hash + collectionId.charCodeAt(i);
    hash |= 0;
  }
  const hashHex = Math.abs(hash).toString(16).padStart(8, '0');
  return `sc2_${prefix}_${hashHex}`.substring(0, 63);
}

async function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const auth = getAuth();
    if (auth && auth.currentUser) {
      const token = await auth.currentUser.getIdToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }
  } catch (e) {
    // Auth might not be initialized yet
  }
  return headers;
}

// Fetch all items from DB API
async function fetchCollectionItems(colName) {
  const base = window.AIEDUE_SCHOOL_DB_BASE || 'https://aiedue.ddns.net/school-db/db-api';
  const url = `${base}/items/${colName}?limit=1000`;
  const headers = await getAuthHeaders();
  
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) {
      if (res.status === 404) {
        return [];
      }
      throw new Error(`Failed to fetch collection ${colName}: ${res.statusText}`);
    }
    const data = await res.json();
    return data.items || [];
  } catch (error) {
    console.error(`Error fetching collection ${colName}:`, error);
    return [];
  }
}

// Helper to set nested field value on an object (supporting dot-notation)
function setNestedValue(obj, keyPath, value) {
  const parts = keyPath.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part];
  }
  const lastKey = parts[parts.length - 1];
  
  if (value && typeof value === 'object' && value.__type) {
    if (value.__type === 'increment') {
      const prev = Number(current[lastKey] || 0);
      current[lastKey] = prev + value.value;
    } else if (value.__type === 'arrayUnion') {
      const arr = Array.isArray(current[lastKey]) ? [...current[lastKey]] : [];
      for (const elem of value.elements) {
        if (!arr.includes(elem)) {
          arr.push(elem);
        }
      }
      current[lastKey] = arr;
    } else if (value.__type === 'arrayRemove') {
      const arr = Array.isArray(current[lastKey]) ? [...current[lastKey]] : [];
      current[lastKey] = arr.filter(item => !value.elements.includes(item));
    } else if (value.__type === 'deleteField') {
      delete current[lastKey];
    } else if (value.__type === 'serverTimestamp') {
      current[lastKey] = Timestamp.now();
    } else {
      current[lastKey] = value;
    }
  } else {
    current[lastKey] = value;
  }
}

// Helper to apply field transforms to existing object with new updates (merging)
function applyFieldTransforms(existing, incoming) {
  const result = JSON.parse(JSON.stringify(existing || {}));
  for (const [key, value] of Object.entries(incoming || {})) {
    setNestedValue(result, key, value);
  }
  return result;
}

function makeDocumentSnapshot(db, docPath, data) {
  const segments = docPath.split('/');
  const docId = segments[segments.length - 1];
  const exists = data !== null && data !== undefined;
  
  const cleanData = {};
  if (exists) {
    for (const [k, v] of Object.entries(data)) {
      if (k !== '__docId' && k !== '__path') {
        if (v && typeof v === 'object' && v.seconds !== undefined && v.nanoseconds !== undefined) {
          cleanData[k] = new Timestamp(v.seconds, v.nanoseconds);
        } else {
          cleanData[k] = v;
        }
      }
    }
  }

  return {
    type: 'documentSnapshot',
    id: docId,
    ref: doc(db, docPath),
    exists() {
      return exists;
    },
    data() {
      return exists ? cleanData : undefined;
    },
    get(field) {
      if (!exists) return undefined;
      const parts = field.split('.');
      let current = cleanData;
      for (const part of parts) {
        if (current === null || typeof current !== 'object') return undefined;
        current = current[part];
      }
      return current;
    }
  };
}

export function getFirestore(app) {
  return {
    type: 'firestore',
    app,
    nativeDb: firebaseGetFirestore(app)
  };
}

export function doc(first, ...parts) {
  let db;
  let pathSegments = [];
  
  if (first && first.type === 'collection') {
    db = first.db;
    pathSegments = first.path.split('/').concat(parts);
  } else if (first && first.type === 'document') {
    db = first.db;
    pathSegments = first.path.split('/').concat(parts);
  } else {
    db = first;
    pathSegments = parts;
  }
  
  const path = pathSegments.filter(Boolean).join('/').split('/').filter(Boolean).join('/');
  const segments = path.split('/');
  if (segments.length % 2 !== 0) {
    throw new Error(`Invalid document path: ${path}`);
  }
  const id = segments[segments.length - 1];
  const collectionId = segments[segments.length - 2];
  
  return {
    type: 'document',
    db,
    path,
    id,
    collectionId,
    get parent() {
      const parentPath = segments.slice(0, -1).join('/');
      return collection(db, parentPath);
    }
  };
}

export function collection(first, ...parts) {
  let db;
  let pathSegments = [];
  
  if (first && first.type === 'document') {
    db = first.db;
    pathSegments = first.path.split('/').concat(parts);
  } else if (first && first.type === 'collection') {
    db = first.db;
    pathSegments = first.path.split('/').concat(parts);
  } else {
    db = first;
    pathSegments = parts;
  }
  
  const path = pathSegments.filter(Boolean).join('/').split('/').filter(Boolean).join('/');
  const segments = path.split('/');
  if (segments.length % 2 === 0) {
    throw new Error(`Invalid collection path: ${path}`);
  }
  const id = segments[segments.length - 1];
  
  return {
    type: 'collection',
    db,
    path,
    id
  };
}

export function collectionGroup(db, collectionId) {
  return {
    type: 'collectionGroup',
    db,
    id: collectionId,
    path: collectionId
  };
}


function nativeDocRef(docRef) {
  return firebaseDoc(docRef.db.nativeDb || firebaseGetFirestore(docRef.db.app), docRef.path);
}

function nativeCollectionRef(base) {
  if (base.type === 'collectionGroup' || base.type === 'collectionGroupQuery') {
    return firebaseCollectionGroup(base.db.nativeDb || firebaseGetFirestore(base.db.app), base.id);
  }
  return firebaseCollection(base.db.nativeDb || firebaseGetFirestore(base.db.app), base.path);
}

function nativeConstraint(c) {
  if (!c) return null;
  if (c.type === 'where') return firebaseWhere(c.field, c.op, c.value);
  if (c.type === 'orderBy') return firebaseOrderBy(c.field, c.direction);
  if (c.type === 'limit') return firebaseLimit(c.limit);
  if (c.type === 'startAfter') return firebaseStartAfter(...c.val);
  return null;
}

async function mirrorNativeDocToApi(docRef, data) {
  if (!data) return;
  try {
    const colName = getDbCollectionName(docRef.collectionId);
    const base = window.AIEDUE_SCHOOL_DB_BASE || 'https://aiedue.ddns.net/school-db/db-api';
    const items = await fetchCollectionItems(colName);
    const existing = items.find(item => item.data && item.data.__path === docRef.path);
    const headers = await getAuthHeaders();
    const payload = { ...data, __docId: docRef.id, __path: docRef.path };
    if (existing) {
      await fetch(`${base}/items/${colName}/${existing.id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ replace: true, data: payload })
      });
      return;
    }
    await fetch(`${base}/collections`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: colName, description: `School collection: ${docRef.collectionId}` })
    }).catch(() => null);
    await fetch(`${base}/items/${colName}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: payload })
    });
  } catch (error) {
    console.warn('School DB mirror skipped', docRef.path, error);
  }
}

async function fetchNativeDoc(docRef) {
  const snap = await firebaseGetDoc(nativeDocRef(docRef));
  if (!snap.exists()) return null;
  const data = snap.data() || {};
  await mirrorNativeDocToApi(docRef, data);
  return data;
}

export async function getDoc(docRef) {
  const colName = getDbCollectionName(docRef.collectionId);
  const items = await fetchCollectionItems(colName);
  const item = items.find(item => item.data && item.data.__path === docRef.path);
  if (item && docRef.collectionId !== 'users') return makeDocumentSnapshot(docRef.db, docRef.path, item.data);

  // 기존 에이두 스쿨 Firebase 데이터 읽기 -> 에이두 데이터 서버로 자동 미러링.
  // 로그인은 Firebase Auth를 그대로 쓰므로, Firestore 규칙상 읽을 수 있는 본인/학급 데이터만 가져온다.
  try {
    const nativeData = await fetchNativeDoc(docRef);
    if (nativeData) return makeDocumentSnapshot(docRef.db, docRef.path, { ...nativeData, __docId: docRef.id, __path: docRef.path });
  } catch (error) {
    console.warn('Native Firestore fallback failed', docRef.path, error);
  }

  if (item) return makeDocumentSnapshot(docRef.db, docRef.path, item.data);

  // 극초기 테스트용 users 컬렉션 호환: users/{uid}가 없고 username/email만 있는 경우 최소 프로필 반환.
  if (docRef.collectionId === 'users') {
    const legacyItems = await fetchCollectionItems('users');
    const auth = getAuth();
    const email = auth?.currentUser?.email || '';
    const legacy = legacyItems.find(item => {
      const d = item.data || {};
      return d.uid === docRef.id || d.email === email || d.username === email || d.username === email.replace(/@abc\.com$/i, '');
    });
    if (legacy) {
      const d = { ...legacy.data, uid: docRef.id, email: legacy.data.email || email, __docId: docRef.id, __path: docRef.path };
      return makeDocumentSnapshot(docRef.db, docRef.path, d);
    }
  }

  return makeDocumentSnapshot(docRef.db, docRef.path, null);
}

export async function setDoc(docRef, data, options) {
  const colName = getDbCollectionName(docRef.collectionId);
  const base = window.AIEDUE_SCHOOL_DB_BASE || 'https://aiedue.ddns.net/school-db/db-api';
  
  const items = await fetchCollectionItems(colName);
  const existing = items.find(item => item.data && item.data.__path === docRef.path);
  
  let mergedData = {};
  if (options && options.merge && existing) {
    mergedData = applyFieldTransforms(existing.data, data);
  } else {
    mergedData = applyFieldTransforms({ __docId: docRef.id, __path: docRef.path }, data);
  }
  
  mergedData.__docId = docRef.id;
  mergedData.__path = docRef.path;
  
  const headers = await getAuthHeaders();
  
  if (existing) {
    const url = `${base}/items/${colName}/${existing.id}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ replace: true, data: mergedData })
    });
    if (!res.ok) {
      throw new Error(`Failed to update doc ${docRef.path}: ${res.statusText}`);
    }
  } else {
    try {
      await fetch(`${base}/collections`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: colName, description: `School2 collection: ${docRef.collectionId}` })
      });
    } catch (e) {}
    
    const url = `${base}/items/${colName}`;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ data: mergedData })
    });
    if (!res.ok) {
      throw new Error(`Failed to create doc ${docRef.path}: ${res.statusText}`);
    }
  }
}

export async function updateDoc(docRef, firstUpdate, ...rest) {
  let updates = {};
  if (typeof firstUpdate === 'string') {
    updates[firstUpdate] = rest[0];
    for (let i = 1; i < rest.length; i += 2) {
      updates[rest[i]] = rest[i + 1];
    }
  } else {
    updates = firstUpdate;
  }
  
  const colName = getDbCollectionName(docRef.collectionId);
  const base = window.AIEDUE_SCHOOL_DB_BASE || 'https://aiedue.ddns.net/school-db/db-api';
  
  const items = await fetchCollectionItems(colName);
  const existing = items.find(item => item.data && item.data.__path === docRef.path);
  
  if (!existing) {
    throw new Error(`Document does not exist: ${docRef.path}`);
  }
  
  const mergedData = { ...existing.data };
  for (const [key, val] of Object.entries(updates)) {
    setNestedValue(mergedData, key, val);
  }
  
  mergedData.__docId = docRef.id;
  mergedData.__path = docRef.path;
  
  const headers = await getAuthHeaders();
  const url = `${base}/items/${colName}/${existing.id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ replace: true, data: mergedData })
  });
  if (!res.ok) {
    throw new Error(`Failed to update doc ${docRef.path}: ${res.statusText}`);
  }
}

export async function addDoc(collectionRef, data) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let docId = '';
  for (let i = 0; i < 20; i++) {
    docId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  const docRef = doc(collectionRef, docId);
  await setDoc(docRef, data);
  return docRef;
}

export async function deleteDoc(docRef) {
  const colName = getDbCollectionName(docRef.collectionId);
  const base = window.AIEDUE_SCHOOL_DB_BASE || 'https://aiedue.ddns.net/school-db/db-api';
  
  const items = await fetchCollectionItems(colName);
  const existing = items.find(item => item.data && item.data.__path === docRef.path);
  
  if (existing) {
    const headers = await getAuthHeaders();
    const url = `${base}/items/${colName}/${existing.id}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) {
      throw new Error(`Failed to delete doc ${docRef.path}: ${res.statusText}`);
    }
  }
}

export function query(base, ...constraints) {
  const existingConstraints = base.constraints || [];
  return {
    type: base.type === 'collectionGroup' ? 'collectionGroupQuery' : 'query',
    db: base.db,
    id: base.id,
    path: base.path,
    constraints: [...existingConstraints, ...constraints]
  };
}

export function where(field, op, value) {
  return { type: 'where', field, op, value };
}

export function orderBy(field, direction = 'asc') {
  return { type: 'orderBy', field, direction };
}

export function limit(n) {
  return { type: 'limit', limit: n };
}

export function startAfter(...val) {
  return { type: 'startAfter', val };
}

export async function getDocs(queryOrCollection) {
  const isQuery = queryOrCollection.type === 'query' || queryOrCollection.type === 'collectionGroupQuery';
  const base = queryOrCollection;
  const constraints = isQuery ? base.constraints : [];
  
  const collectionId = base.id;
  const colName = getDbCollectionName(collectionId);
  
  const items = await fetchCollectionItems(colName);
  
  let filtered = [];
  if (base.type === 'collectionGroup' || base.type === 'collectionGroupQuery') {
    filtered = items.filter(item => {
      const path = item.data?.__path;
      if (!path) return false;
      const parts = path.split('/');
      return parts.length >= 2 && parts[parts.length - 2] === collectionId;
    });
  } else {
    const expectedSegments = base.path.split('/').length + 1;
    filtered = items.filter(item => {
      const path = item.data?.__path;
      if (!path) return false;
      return path.startsWith(base.path + '/') && path.split('/').length === expectedSegments;
    });
  }
  
  for (const c of constraints) {
    if (c.type === 'where') {
      filtered = filtered.filter(item => {
        const val = getFieldValue(item.data, c.field);
        const target = c.value;
        switch (c.op) {
          case '==': return val === target;
          case '!=': return val !== target;
          case '<': return val < target;
          case '<=': return val <= target;
          case '>': return val > target;
          case '>=': return val >= target;
          case 'array-contains':
            return Array.isArray(val) && val.includes(target);
          case 'array-contains-any':
            return Array.isArray(val) && Array.isArray(target) && target.some(t => val.includes(t));
          case 'in':
            return Array.isArray(target) && target.includes(val);
          case 'not-in':
            return Array.isArray(target) && !target.includes(val);
          default: return true;
        }
      });
    }
  }
  
  function getFieldValue(data, fieldName) {
    if (!fieldName) return undefined;
    const parts = fieldName.split('.');
    let current = data;
    for (const part of parts) {
      if (current === null || typeof current !== 'object') return undefined;
      current = current[part];
    }
    return current;
  }
  
  const orderBys = constraints.filter(c => c.type === 'orderBy');
  if (orderBys.length > 0) {
    filtered.sort((a, b) => {
      for (const ob of orderBys) {
        let valA = getFieldValue(a.data, ob.field);
        let valB = getFieldValue(b.data, ob.field);
        
        if (valA && typeof valA === 'object' && valA.seconds !== undefined) {
          valA = valA.seconds * 1000 + (valA.nanoseconds || 0) / 1e6;
        }
        if (valB && typeof valB === 'object' && valB.seconds !== undefined) {
          valB = valB.seconds * 1000 + (valB.nanoseconds || 0) / 1e6;
        }
        
        if (valA instanceof Date) valA = valA.getTime();
        if (valB instanceof Date) valB = valB.getTime();
        
        if (valA === undefined || valA === null) valA = '';
        if (valB === undefined || valB === null) valB = '';
        
        if (valA < valB) return ob.direction === 'desc' ? 1 : -1;
        if (valA > valB) return ob.direction === 'desc' ? -1 : 1;
      }
      return 0;
    });
  }
  
  const startAfterConstraint = constraints.find(c => c.type === 'startAfter');
  if (startAfterConstraint) {
    const val = startAfterConstraint.val[0];
    if (val && typeof val === 'object' && val.type === 'documentSnapshot') {
      const idx = filtered.findIndex(item => item.data.__path === val.ref.path);
      if (idx !== -1) {
        filtered = filtered.slice(idx + 1);
      }
    } else {
      if (orderBys.length > 0) {
        const field = orderBys[0].field;
        const direction = orderBys[0].direction;
        let targetVal = val;
        if (targetVal && typeof targetVal === 'object' && targetVal.seconds !== undefined) {
          targetVal = targetVal.seconds * 1000 + (targetVal.nanoseconds || 0) / 1e6;
        }
        filtered = filtered.filter(item => {
          let itemVal = getFieldValue(item.data, field);
          if (itemVal && typeof itemVal === 'object' && itemVal.seconds !== undefined) {
            itemVal = itemVal.seconds * 1000 + (itemVal.nanoseconds || 0) / 1e6;
          }
          if (direction === 'desc') {
            return itemVal < targetVal;
          } else {
            return itemVal > targetVal;
          }
        });
      }
    }
  }
  
  const limitConstraint = constraints.find(c => c.type === 'limit');
  if (limitConstraint) {
    filtered = filtered.slice(0, limitConstraint.limit);
  }
  
  if (filtered.length === 0) {
    try {
      const nativeBase = nativeCollectionRef(base);
      const nativeConstraints = constraints.map(nativeConstraint).filter(Boolean);
      const nativeQ = nativeConstraints.length ? firebaseQuery(nativeBase, ...nativeConstraints) : nativeBase;
      const nativeSnap = await firebaseGetDocs(nativeQ);
      const nativeDocs = [];
      for (const snap of nativeSnap.docs) {
        const data = snap.data() || {};
        const path = snap.ref.path;
        const segments = path.split('/');
        const nativeDoc = doc(base.db, path);
        await mirrorNativeDocToApi(nativeDoc, data);
        nativeDocs.push(makeDocumentSnapshot(base.db, path, { ...data, __docId: segments[segments.length - 1], __path: path }));
      }
      if (nativeDocs.length) {
        return {
          docs: nativeDocs,
          size: nativeDocs.length,
          empty: false,
          forEach(callback) { nativeDocs.forEach(callback); }
        };
      }
    } catch (error) {
      console.warn('Native Firestore query fallback failed', base.path || base.id, error);
    }
  }

  const docSnapshots = filtered.map(item => makeDocumentSnapshot(queryOrCollection.db, item.data.__path, item.data));
  
  return {
    docs: docSnapshots,
    size: docSnapshots.length,
    empty: docSnapshots.length === 0,
    forEach(callback) {
      docSnapshots.forEach(callback);
    }
  };
}

export async function runTransaction(db, updateFunction) {
  const writes = [];
  const transaction = {
    async get(docRef) {
      return await getDoc(docRef);
    },
    update(docRef, updates) {
      writes.push({ type: 'update', docRef, updates });
      return transaction;
    },
    set(docRef, data, options) {
      writes.push({ type: 'set', docRef, data, options });
      return transaction;
    },
    delete(docRef) {
      writes.push({ type: 'delete', docRef });
      return transaction;
    }
  };
  
  const result = await updateFunction(transaction);
  
  for (const write of writes) {
    if (write.type === 'update') {
      await updateDoc(write.docRef, write.updates);
    } else if (write.type === 'set') {
      await setDoc(write.docRef, write.data, write.options);
    } else if (write.type === 'delete') {
      await deleteDoc(write.docRef);
    }
  }
  
  return result;
}

export function onSnapshot(target, next, error) {
  let active = true;
  let intervalId = null;

  async function trigger() {
    if (!active) return;
    try {
      if (target.type === 'document') {
        const snap = await getDoc(target);
        if (active) next(snap);
      } else {
        const snap = await getDocs(target);
        if (active) next(snap);
      }
    } catch (err) {
      if (active && error) error(err);
    }
  }

  trigger();
  intervalId = setInterval(trigger, 5000);

  return () => {
    active = false;
    if (intervalId) clearInterval(intervalId);
  };
}

export async function getCountFromServer(queryOrCollection) {
  const snap = await getDocs(queryOrCollection);
  return {
    data: () => ({
      count: snap.size
    })
  };
}

export function increment(value) {
  return { __type: 'increment', value };
}

export function deleteField() {
  return { __type: 'deleteField' };
}

export function serverTimestamp() {
  return { __type: 'serverTimestamp' };
}

export function arrayUnion(...elements) {
  return { __type: 'arrayUnion', elements };
}

export function arrayRemove(...elements) {
  return { __type: 'arrayRemove', elements };
}
