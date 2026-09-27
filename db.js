// Tiny IndexedDB wrapper for the joke store.
const DB_NAME = "joke-jar";
const STORE = "jokes";

let dbPromise;
function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(result?.result);
    tx.onerror = () => reject(tx.error);
  });
}

export const db = {
  all: () => run("readonly", s => s.getAll()),
  put: joke => run("readwrite", s => s.put(joke)),
  putMany: jokes => run("readwrite", s => jokes.forEach(j => s.put(j))),
  remove: id => run("readwrite", s => s.delete(id)),
  clear: () => run("readwrite", s => s.clear()),
};

// Ask the browser not to evict our data under storage pressure.
export async function persistStorage() {
  try { return await navigator.storage?.persist?.(); } catch { return false; }
}
