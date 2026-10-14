// ---------- 매뉴얼 폴더(버전 이력) 저장소 ----------
// 버전 번호는 글자로 다룬다: "1" → 작은 수정 "1.1", "1.2" … / 큰 개정 "2" → "2.1" …  ("1.10"이 1.1이 되지 않게)
function isLabel(s) { return /^\d+(\.\d+)?$/.test(String(s ?? "").trim()); }
function vparts(l) { const [a, b = "0"] = String(l).trim().split("."); return [Number(a), Number(b)]; }
function vcmp(a, b) {
  if (!isLabel(a) || !isLabel(b)) return (isLabel(a) ? 1 : 0) - (isLabel(b) ? 1 : 0);
  const x = vparts(a), y = vparts(b); return x[0] - y[0] || x[1] - y[1];
}
function maxLabel(list) { return [...list].filter(isLabel).map(String).sort(vcmp).pop() || ""; }
function nextLabel(base, kind) {
  if (!isLabel(base)) return "1";
  const [major, minor] = vparts(base);
  return kind === "major" ? String(major + 1) : `${major}.${minor + 1}`;
}
const fileBaseName = name => String(name || "").replace(/\.(docx|xlsx)$/i, "").replace(/_v\d+(?:\.\d+)?$/i, "");
const fileLabel = name => (String(name || "").match(/_v(\d+(?:\.\d+)?)\.(?:docx|xlsx)$/i) || [])[1] || "";

const blobToB64 = blob => new Promise((resolve, reject) => {
  const fr = new FileReader();
  fr.onload = () => resolve(String(fr.result).replace(/^data:[^,]*,/, ""));
  fr.onerror = () => reject(fr.error);
  fr.readAsDataURL(blob);
});
const b64ToBuffer = b64 => dataUrlBytes("data:;base64," + b64).buffer;
const storeError = (code, extra = {}) => Object.assign(new Error(code), { code, ...extra });

// Vercel: 서버 함수 /api/store 가 Vercel Blob에 저장한다. 목록(index.json)에 섹션 본문도 함께 둔다.
function vercelStore() {
  const call = async (method, body) => {
    let res;
    try {
      res = await fetch("/api/store", method === "GET" ? { cache: "no-store" } : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } catch { throw storeError("network"); }
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw storeError(j.code || `http_${res.status}`);
    return j;
  };
  return {
    kind: "vercel",
    async list() { return (await call("GET")).folders || []; },
    async save({ folderId, folder, versions }) {
      const out = [];
      for (const { blob, ...v } of versions) out.push({ ...v, fileBase64: await blobToB64(blob) });
      const j = await call("POST", { action: "save", folderId, folder, versions: out });
      return { folders: j.folders, folderId: j.folderId };
    },
    async file(folder, v) {
      let res;
      try { res = await fetch(`/api/store?file=${encodeURIComponent(v.filePath)}`, { cache: "no-store" }); } catch { throw storeError("network"); }
      if (!res.ok) throw storeError(res.status === 404 ? "not_found" : `http_${res.status}`);
      return res.arrayBuffer();
    },
    async sections(folder, v) { return v.sections || []; },
    async deleteVersion(folder, label) { return (await call("POST", { action: "deleteVersion", folderId: folder.id, label })).folders; },
    async deleteFolder(folder) { return (await call("POST", { action: "deleteFolder", folderId: folder.id })).folders; },
  };
}

// 아티팩트: db에 폴더 목록(folders/<id>)과 버전별 섹션(sections/<id>__<버전>), 파일은 assets에 base64 글자로.
function artifactStore(db, assets) {
  const folders = db.collection("folders");
  const secDoc = (folderId, label) => db.collection("sections").doc(`${folderId}__${label}`);
  const list = async () => (await folders.get()).docs.map(d => d.data()).filter(Boolean);
  return {
    kind: "artifact",
    list,
    async save({ folderId, folder, versions }) {
      const all = await list();
      let f = all.find(x => x.id === folderId);
      if (!f) {
        const at = new Date().toISOString();
        f = { id: crypto.randomUUID(), name: folder.name, task: folder.task || "", format: folder.format === "xlsx" ? "xlsx" : "docx", createdAt: at, updatedAt: at, versions: [] };
      }
      f = { ...f, versions: [...f.versions] };
      for (const { blob, sections, ...v } of versions) {
        if (!isLabel(v.label)) throw storeError("bad_request");
        if (f.versions.some(x => x.label === v.label)) throw storeError("version_exists");
        const up = await assets.upload(new Blob([await blobToB64(blob)], { type: "text/plain" }), { type: "text/plain" });
        await secDoc(f.id, v.label).set({ sections: sections || [] });
        f.versions.push({ ...v, assetId: up.id, at: v.at || new Date().toISOString() });
      }
      f.updatedAt = new Date().toISOString();
      await folders.doc(f.id).set(f);
      return { folders: await list(), folderId: f.id };
    },
    async file(folder, v) {
      const res = await fetch("/_blob/" + v.assetId);
      if (!res.ok) throw storeError(res.status === 404 ? "not_found" : `http_${res.status}`);
      return b64ToBuffer((await res.text()).trim());
    },
    async sections(folder, v) { return (await secDoc(folder.id, v.label).get()).data()?.sections || []; },
    async deleteVersion(folder, label) {
      const gone = folder.versions.filter(v => v.label === label);
      for (const v of gone) { await assets.delete(v.assetId).catch(() => null); await secDoc(folder.id, v.label).delete(); }
      const rest = folder.versions.filter(v => v.label !== label);
      if (rest.length) await folders.doc(folder.id).set({ ...folder, versions: rest, updatedAt: new Date().toISOString() });
      else await folders.doc(folder.id).delete();
      return list();
    },
    async deleteFolder(folder) {
      for (const v of folder.versions) { await assets.delete(v.assetId).catch(() => null); await secDoc(folder.id, v.label).delete(); }
      await folders.doc(folder.id).delete();
      return list();
    },
  };
}

// 쓸 수 있는 저장소를 한 번만 찾는다. 없으면 null과 이유(storeReason).
let storePromise = null; let storeReason = "";
function getStore() {
  if (!storePromise) storePromise = (async () => {
    if ((window.__PLATFORM__ || "artifact") === "vercel") {
      const s = vercelStore();
      try { await s.list(); return s; } catch (e) {
        storeReason = e.code || "error";
        if (storeReason !== "not_configured") storePromise = null;  // 잠깐 끊긴 것이면 다음에 다시 시도
        return null;
      }
    }
    const [db, assets] = await Promise.all([getCap("db"), getCap("assets")]);
    if (!db || !assets) { storeReason = "artifact_unavailable"; return null; }
    return artifactStore(db, assets);
  })();
  return storePromise;
}
function storeErrorText(code) {
  return {
    not_configured: "서버에 저장소가 아직 연결되지 않았습니다. 관리자가 Vercel에서 Blob 저장소를 이 프로젝트에 연결해야 합니다(deploy/vercel/README.md 참고).",
    artifact_unavailable: "이 화면에서는 폴더 저장을 쓸 수 없습니다. claude.ai에서 로그인한 상태로 열고, 저장 권한을 허용해 주세요(파일 저장은 편집 권한이 있는 사람만 됩니다).",
    version_exists: "같은 번호의 버전이 방금 다른 곳에서 저장되었습니다. 폴더를 새로 불러온 뒤 다시 확정해 주세요.",
    not_found: "저장된 파일을 찾지 못했습니다. 이미 삭제되었을 수 있습니다.",
    network: "저장소에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.",
    not_granted: "저장 권한을 허용하지 않아 폴더를 쓸 수 없습니다.",
    too_large: "파일이 너무 커서 저장하지 못했습니다.",
  }[code] || `저장소 오류가 났습니다 (${code || "알 수 없음"}).`;
}
