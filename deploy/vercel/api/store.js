// Vercel 서버 함수: 매뉴얼 폴더(버전 이력) 저장소. Vercel Blob에 저장한다.
//   목록:   manuals/index.json  { folders: [{ id, name, task, format, createdAt, updatedAt, versions: [...] }] }
//           templates: [{ id, name, sections: [{ title, level }] }]  (이용자가 만든 섹션 양식)
//   파일:   manuals/files/<폴더 id>/<버전>-<파일명>
// 환경 변수: Vercel에서 Blob 저장소를 프로젝트에 연결하면 자동으로 들어간다.
//           BLOB_STORE_ID(+ 자동 로그인 OIDC) 또는 예전 방식의 BLOB_READ_WRITE_TOKEN — 라이브러리가 둘 다 처리한다.
//           BLOB_ACCESS=public    (저장소를 Public으로 만들었을 때만. 기본은 private)
//           STORE_FS_DIR          (로컬 시험용: Blob 대신 이 폴더에 저장)
import { put, get, del } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const ACCESS = process.env.BLOB_ACCESS === "public" ? "public" : "private";
const INDEX = "manuals/index.json";
const FS_DIR = process.env.STORE_FS_DIR;
const LABEL_RE = /^\d+(\.\d+)?$/;

const storage = FS_DIR ? {
  read: p => fs.readFile(path.join(FS_DIR, p)).catch(() => null),
  async write(p, body) { const f = path.join(FS_DIR, p); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, body); },
  async remove(paths) { for (const p of paths) await fs.rm(path.join(FS_DIR, p), { force: true }); },
} : {
  async read(p) {
    try {
      const r = await get(p, { access: ACCESS, useCache: false });   // 캐시 없이 최신 내용을 읽는다
      if (!r || r.statusCode !== 200) return null;
      return Buffer.from(await new Response(r.stream).arrayBuffer());
    } catch (err) {
      if (err?.name === "BlobNotFoundError") return null;
      throw err;
    }
  },
  async write(p, body, contentType) {
    await put(p, body, { access: ACCESS, addRandomSuffix: false, allowOverwrite: true, contentType });
  },
  async remove(paths) { if (paths.length) await del(paths); },
};

async function readIndex() {
  const raw = await storage.read(INDEX);
  return raw ? JSON.parse(raw.toString("utf8")) : { folders: [] };
}
const writeIndex = index => storage.write(INDEX, Buffer.from(JSON.stringify(index)), "application/json");
const safeName = name => String(name || "manual").replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120);
const now = () => new Date().toISOString();

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const file = req.query?.file ?? new URL(req.url, "http://local").searchParams.get("file");
      if (!file) return res.status(200).json(await readIndex());
      if (!file.startsWith("manuals/files/") || file.includes("..")) return res.status(400).json({ code: "bad_request" });
      const body = await storage.read(file);
      if (!body) return res.status(404).json({ code: "not_found" });
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Cache-Control", "no-store");
      return res.end(body);
    }
    if (req.method !== "POST") return res.status(405).json({ code: "method_not_allowed" });

    const body = req.body || {};
    const index = await readIndex();

    if (body.action === "save") {
      // versions: 1~2개(처음 올린 원본 + 새 버전). 각 { label, fileName, fileBase64, sections, ...메타 }
      const versions = Array.isArray(body.versions) ? body.versions : [];
      if (!versions.length || versions.length > 2) return res.status(400).json({ code: "bad_request" });
      let folder = index.folders.find(f => f.id === body.folderId);
      if (!folder) {
        const meta = body.folder || {};
        if (typeof meta.name !== "string" || !meta.name.trim()) return res.status(400).json({ code: "bad_request" });
        folder = { id: randomUUID(), name: meta.name.trim().slice(0, 200), task: String(meta.task || "").slice(0, 200),
          format: meta.format === "xlsx" ? "xlsx" : "docx", createdAt: now(), updatedAt: now(), versions: [] };
        index.folders.push(folder);
      }
      for (const v of versions) {
        if (!LABEL_RE.test(String(v.label)) || typeof v.fileBase64 !== "string") return res.status(400).json({ code: "bad_request" });
        if (folder.versions.some(x => x.label === v.label)) return res.status(409).json({ code: "version_exists" });
        const filePath = `manuals/files/${folder.id}/${v.label}-${safeName(v.fileName)}`;
        await storage.write(filePath, Buffer.from(v.fileBase64, "base64"), "application/octet-stream");
        const { fileBase64, ...meta } = v;
        folder.versions.push({ ...meta, filePath, at: meta.at || now() });
      }
      folder.updatedAt = now();
      await writeIndex(index);
      return res.status(200).json({ ...index, folderId: folder.id });
    }

    if (body.action === "createFolder") {
      // 이용자가 직접 만드는 빈 폴더(버전은 나중에 확정하거나 파일로 올린다)
      const meta = body.folder || {};
      const name = typeof meta.name === "string" ? meta.name.trim().slice(0, 200) : "";
      if (!name) return res.status(400).json({ code: "bad_request" });
      if (index.folders.some(f => f.name === name)) return res.status(409).json({ code: "name_exists" });
      const folder = { id: randomUUID(), name, task: String(meta.task || "").trim().slice(0, 200), format: meta.format === "xlsx" ? "xlsx" : "docx", createdAt: now(), updatedAt: now(), versions: [] };
      index.folders.push(folder);
      await writeIndex(index);
      return res.status(200).json({ ...index, folderId: folder.id });
    }

    if (body.action === "updateFolder") {
      // 폴더 이름·업무명 수정. 새 버전을 이름으로 폴더에 연결하므로 같은 이름은 막는다.
      const folder = index.folders.find(f => f.id === body.folderId);
      if (!folder) return res.status(404).json({ code: "not_found" });
      const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
      if (!name) return res.status(400).json({ code: "bad_request" });
      if (index.folders.some(f => f !== folder && f.name === name)) return res.status(409).json({ code: "name_exists" });
      folder.name = name; folder.task = String(body.task ?? folder.task ?? "").trim().slice(0, 200); folder.updatedAt = now();
      await writeIndex(index);
      return res.status(200).json(index);
    }

    if (body.action === "saveTemplate") {
      // 이용자가 만든 섹션 양식(모두 공유). { id?, name, sections: [{ title, level }] }
      const t = body.template || {};
      const name = typeof t.name === "string" ? t.name.trim().slice(0, 100) : "";
      const sections = (Array.isArray(t.sections) ? t.sections : []).slice(0, 40)
        .map(s => ({ title: String(s?.title || "").trim().slice(0, 100), level: s?.level === 2 ? 2 : 1 })).filter(s => s.title);
      if (!name || !sections.some(s => s.level === 1)) return res.status(400).json({ code: "bad_request" });
      const list = index.templates || (index.templates = []);
      if (list.some(x => x.name === name && x.id !== t.id)) return res.status(409).json({ code: "name_exists" });
      const old = list.find(x => x.id === t.id);
      if (old) Object.assign(old, { name, sections, updatedAt: now() });
      else list.push({ id: randomUUID(), name, sections, createdAt: now(), updatedAt: now() });
      await writeIndex(index);
      return res.status(200).json(index);
    }

    if (body.action === "deleteTemplate") {
      const before = (index.templates || []).length;
      index.templates = (index.templates || []).filter(x => x.id !== body.id);
      if (index.templates.length === before) return res.status(404).json({ code: "not_found" });
      await writeIndex(index);
      return res.status(200).json(index);
    }

    if (body.action === "deleteVersion" || body.action === "deleteFolder") {
      const folder = index.folders.find(f => f.id === body.folderId);
      if (!folder) return res.status(404).json({ code: "not_found" });
      const gone = body.action === "deleteFolder" ? folder.versions : folder.versions.filter(v => v.label === body.label);
      if (body.action === "deleteVersion" && !gone.length) return res.status(404).json({ code: "not_found" });
      if (gone.length) await storage.remove(gone.map(v => v.filePath));
      folder.versions = folder.versions.filter(v => !gone.includes(v));
      // 폴더 삭제일 때만 폴더를 없앤다. 버전을 다 지운 폴더는 빈 폴더로 남긴다.
      if (body.action === "deleteFolder") index.folders = index.folders.filter(f => f !== folder);
      else folder.updatedAt = now();
      await writeIndex(index);
      return res.status(200).json(index);
    }

    return res.status(400).json({ code: "bad_request" });
  } catch (err) {
    // 저장소가 연결되지 않았으면 라이브러리가 'No blob credentials …' 오류를 낸다.
    if (/no blob credentials|no read-write token/i.test(err?.message || "")) return res.status(503).json({ code: "not_configured" });
    console.error("store error", err?.name, err?.message);
    return res.status(500).json({ code: "store_error" });
  }
}
