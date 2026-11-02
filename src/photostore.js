// The photos that wait for their upload (REC-8), in the IndexedDB database `maney.photos`, object
// store `pending`, by the key of the photo. With no IndexedDB, or when it does not open, the store
// lives in memory for this start. The IndexedDB object is a parameter (ENG-4).
import { keyOf } from '#storage';

export const PHOTO_DB = keyOf('photos');
const STORE = 'pending';

export const memoryPhotoStore = () => {
  const map = new Map();
  return {
    put: async (key, blob) => {
      map.set(key, blob);
    },
    get: async (key) => map.get(key) ?? null,
    remove: async (key) => {
      map.delete(key);
    },
    keys: async () => [...map.keys()],
    clear: async () => {
      map.clear();
    },
  };
};

const storeOf = (db) => {
  // Resolves with the result of the request when its transaction completes.
  const run = (mode, request) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = request(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  return {
    put: async (key, blob) => {
      await run('readwrite', (store) => store.put(blob, key));
    },
    get: async (key) => (await run('readonly', (store) => store.get(key))) ?? null,
    remove: async (key) => {
      await run('readwrite', (store) => store.delete(key));
    },
    keys: async () => (await run('readonly', (store) => store.getAllKeys())).map(String),
    clear: async () => {
      await run('readwrite', (store) => store.clear());
    },
  };
};

export const openPhotoStore = (indexedDB) =>
  new Promise((resolve) => {
    let request;
    try {
      if (!indexedDB) throw new Error('no IndexedDB');
      request = indexedDB.open(PHOTO_DB, 1);
    } catch {
      resolve(memoryPhotoStore());
      return;
    }
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(storeOf(request.result));
    request.onerror = () => resolve(memoryPhotoStore());
  });
