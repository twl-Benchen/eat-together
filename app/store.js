/* EatTogether 儲存轉接層
 * 在 claude.ai 打開時，App 用平台的共享資料庫（claude.use("db")）。
 * 其他地方（例如 GitHub Pages）改用這個「本機模式」：資料存在瀏覽器 localStorage，
 * 介面刻意做成和共享資料庫一樣（collection/doc/set/update/delete/get/onSnapshot/acquire），
 * 所以 App 的其餘程式碼不用分兩套。
 */
(function (root) {
  "use strict";

  const KEY = "eattogether.db.v1";
  const BLOB_PREFIX = "eattogether.blob.";
  const meta = { fromCache: false, hasPendingWrites: false };
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const parentOf = (p) => p.split("/").slice(0, -1).join("/");

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { return {}; }
  }
  let data = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { throw { code: "quota_exceeded", message: "瀏覽器空間滿了" }; }
  }

  const listeners = new Set();
  function snapDoc(path) {
    const d = data[path];
    return { id: path.split("/").pop(), exists: !!d, data: () => (d ? clone(d) : undefined), metadata: meta };
  }
  function colDocs(col) {
    return Object.keys(data).filter((p) => parentOf(p) === col).sort().map(snapDoc);
  }
  function deliver(l) {
    setTimeout(() => {
      if (!l.active) return;
      if (l.doc) { l.cb(snapDoc(l.doc)); return; }
      const docs = colDocs(l.col);
      l.cb({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: meta });
    }, 0);
  }
  function notify(col) {
    for (const l of listeners) if (l.col === col || (l.doc && parentOf(l.doc) === col)) deliver(l);
  }
  function notifyAll() { for (const l of listeners) deliver(l); }

  // 同一台裝置開兩個分頁時，互相同步
  try {
    window.addEventListener("storage", (ev) => {
      if (ev.key !== KEY) return;
      data = load();
      notifyAll();
    });
  } catch (e) {}

  let n = 0;
  const genId = () => Date.now().toString(36) + (++n).toString(36) + Math.random().toString(36).slice(2, 8);

  function docRef(path) {
    const col = parentOf(path);
    return {
      id: path.split("/").pop(),
      path,
      get: async () => snapDoc(path),
      set: async (body) => { data[path] = clone(body); save(); notify(col); },
      update: async (body) => {
        if (!data[path]) throw { code: "invalid_argument", message: "文件不存在" };
        data[path] = Object.assign({}, data[path], clone(body));
        save(); notify(col);
      },
      delete: async () => { delete data[path]; save(); notify(col); },
      acquire: async () => ({ acquired: true, version: 1 }),
      onSnapshot: (cb) => {
        const l = { doc: path, cb, active: true };
        listeners.add(l); deliver(l);
        return () => { l.active = false; listeners.delete(l); };
      },
      collection: (sub) => colRef(path + "/" + sub),
    };
  }
  function colRef(col) {
    const q = {
      path: col,
      doc: (id) => docRef(col + "/" + (id || genId())),
      add: async (body) => { const r = docRef(col + "/" + genId()); await r.set(body); return r; },
      get: async () => { const docs = colDocs(col); return { docs, size: docs.length, empty: !docs.length, metadata: meta }; },
      onSnapshot: (cb) => {
        const l = { col, cb, active: true };
        listeners.add(l); deliver(l);
        return () => { l.active = false; listeners.delete(l); };
      },
      where() { return q; }, orderBy() { return q; }, limit() { return q; },
    };
    return q;
  }

  // 頭貼：本機模式存成 dataURL
  const assets = {
    upload: (blob) => new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const id = Array.from({ length: 32 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
        try { localStorage.setItem(BLOB_PREFIX + id, r.result); }
        catch (e) { reject({ code: "quota_or_state" }); return; }
        resolve({ id, url: r.result, sizeBytes: blob.size, contentType: blob.type });
      };
      r.onerror = () => reject({ code: "invalid_request" });
      r.readAsDataURL(blob);
    }),
    delete: async (id) => {
      try { const had = localStorage.getItem(BLOB_PREFIX + id) != null; localStorage.removeItem(BLOB_PREFIX + id); return { deleted: had }; }
      catch (e) { return { deleted: false }; }
    },
    list: async () => ({ assets: [], usage: { files: 0, bytes: 0, maxFiles: 0, maxBytes: 0 } }),
  };
  function blobUrl(id) {
    try { return localStorage.getItem(BLOB_PREFIX + id); } catch (e) { return null; }
  }

  // 匯出／匯入整本帳（含頭貼）
  function exportAll() {
    const blobs = {};
    for (const p in data) {
      const photo = p.startsWith("members/") && data[p].photo;
      if (photo) { const u = blobUrl(photo); if (u) blobs[photo] = u; }
    }
    return { app: "EatTogether", version: 1, exportedAt: new Date().toISOString(), docs: clone(data), blobs };
  }
  function importAll(obj) {
    if (!obj || obj.app !== "EatTogether" || typeof obj.docs !== "object") throw { code: "bad_file" };
    for (const id in obj.blobs || {}) {
      if (/^[0-9a-f]{32}$/.test(id) && typeof obj.blobs[id] === "string" && obj.blobs[id].startsWith("data:image/")) {
        try { localStorage.setItem(BLOB_PREFIX + id, obj.blobs[id]); } catch (e) {}
      }
    }
    data = clone(obj.docs);
    save();
    notifyAll();
  }

  root.EatStore = {
    local: { db: Object.freeze({ doc: docRef, collection: colRef }), assets, blobUrl, exportAll, importAll },
  };
})(typeof window !== "undefined" ? window : this);
