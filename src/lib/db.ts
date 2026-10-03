/**
 * IndexedDB 薄封装：离线时保存档案快照、待同步操作队列、
 * 以及重拍后还没来得及上传的照片（dataURL）。
 */
const DB_NAME = "rugbench";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function db() {
  dbPromise ||= openDB();
  return dbPromise;
}

export async function idbPut(store: string, key: string, value: unknown) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  });
}

export async function idbAll<T>(store: string): Promise<T[]> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function idbDelete(store: string, key: string) {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction(store, "readwrite");
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

const SESSION_KEY = "rugbench.session";
export function loadSession(): { role: "apprentice" | "master"; actor: string } {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || '{"role":"apprentice","actor":"学徒"}');
    return { role: s.role === "master" ? "master" : "apprentice", actor: s.actor || "学徒" };
  } catch {
    return { role: "apprentice", actor: "学徒" };
  }
}
export function saveSession(s: { role: "apprentice" | "master"; actor: string }) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

/** 选图后在平板端先压缩：车间角落原图可能很大，队列要装得下多张重拍。 */
export function fileToDataUrl(file: File, maxSize = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}
