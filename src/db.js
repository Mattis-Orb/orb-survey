const DB_NAME = 'orb-survey';
const DB_VERSION = 1;

let databasePromise;

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('plots')) db.createObjectStore('plots', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return databasePromise;
}

function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('The save was aborted'));
  });
}

async function run(store, mode, fn) {
  const db = await openDatabase();
  const tx = db.transaction(store, mode);
  const result = fn(tx.objectStore(store));
  await transactionDone(tx);
  return result;
}

export function getAll(store) {
  return run(store, 'readonly', (objectStore) => new Promise((resolve, reject) => {
    const request = objectStore.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

export function getOne(store, id) {
  return run(store, 'readonly', (objectStore) => new Promise((resolve, reject) => {
    const request = objectStore.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  }));
}

export function putOne(store, value) {
  return run(store, 'readwrite', (objectStore) => {
    objectStore.put(value);
  });
}

export function deleteOne(store, id) {
  return run(store, 'readwrite', (objectStore) => {
    objectStore.delete(id);
  });
}

export async function clearAll() {
  for (const store of ['projects', 'plots', 'entries', 'blobs']) {
    await run(store, 'readwrite', (objectStore) => {
      objectStore.clear();
    });
  }
}
