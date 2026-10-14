// claude.ai 의 db·assets·downloads 흉내(localStorage에 저장 → 다른 탭에서도 보임)
(() => {
  const L = { get: k => JSON.parse(localStorage.getItem(k) || "null"), set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
  const dbAll = () => L.get("db") || {}; const dbSave = o => L.set("db", o);
  const docRef = (col, id) => ({
    async get() { const v = dbAll()[`${col}/${id}`]; return { exists: !!v, data: () => v ? structuredClone(v) : undefined }; },
    async set(d) { const s = JSON.stringify(d); if (s.length > 256 * 1024) throw { code: "invalid_argument" }; const o = dbAll(); o[`${col}/${id}`] = JSON.parse(s); dbSave(o); },
    async update(d) { const o = dbAll(); if (!o[`${col}/${id}`]) throw { code: "not_found" }; o[`${col}/${id}`] = { ...o[`${col}/${id}`], ...d }; dbSave(o); },
    async delete() { const o = dbAll(); delete o[`${col}/${id}`]; dbSave(o); },
  });
  const db = { collection: col => ({ doc: id => docRef(col, id), async get() { const o = dbAll(); const docs = Object.keys(o).filter(k => k.startsWith(col + "/")).sort().map(k => ({ exists: true, data: () => structuredClone(o[k]) })); return { docs, size: docs.length, empty: !docs.length }; } }) };
  const assets = {
    async upload(blob, opt) { if (opt?.type !== "text/plain") throw { code: "unsupported_type" }; const id = Math.random().toString(16).slice(2).padEnd(32, "0"); const b = L.get("blobs") || {}; b[id] = await blob.text(); L.set("blobs", b); return { id, url: "/_blob/" + id, sizeBytes: blob.size, contentType: "text/plain" }; },
    async delete(id) { const b = L.get("blobs") || {}; const had = id in b; delete b[id]; L.set("blobs", b); return { deleted: had }; },
  };
  const downloads = { async save({ filename, data }) { const a = document.createElement("a"); a.href = URL.createObjectURL(data); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); return { status: "saved" }; } };
  const realFetch = window.fetch;
  window.fetch = async (u, o) => { if (String(u).startsWith("/_blob/")) { const t = (L.get("blobs") || {})[String(u).slice(7)]; return t == null ? new Response("", { status: 404 }) : new Response(t); } return realFetch(u, o); };
  const sample = async (prompt, o = {}) => { window.__lastPrompt = prompt; const text = "(가짜 Claude) 연 12회까지 무료입니다. [1]"; o.onText?.({ text, delta: text }); return { text, truncated: false }; };
  window.claude = { use: async n => ({ db, assets, downloads, sample })[n] || null };
})();
