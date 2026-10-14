// ---------- 매뉴얼 폴더: 새 폴더 만들기 / 파일로 새 버전 올리기 ----------
// state.folderView.form = { mode: "create"|"version", name, task, format, file, sheet, label, summary, author, error }
function folderForm(folder) {
  const f = state.folderView.form; const file = f.file;
  const create = f.mode === "create";
  const fileRow = `<label class="drop"><span class="field"><span>${create ? "첫 파일 (선택 — 올리면 첫 버전이 됩니다)" : "올릴 파일"}</span></span>
      <input type="file" id="ff-file" accept="${create ? ".docx,.xlsx" : folder.format === "xlsx" ? ".xlsx" : ".docx"}">
      ${file ? `<span class="hint">올린 파일: <b>${esc(file.name)}</b>${file.version ? ` · 파일 안 버전 ${esc(file.version)}` : ""}</span>` : ""}</label>`;
  const verRows = file ? `<div class="grid2">
      <label class="field"><span>버전 번호</span><input type="text" id="ff-label" value="${esc(f.label)}" placeholder="예: 1, 1.1, 2"></label>
      ${file.format === "xlsx" ? `<label class="field"><span>검색·비교에 쓸 시트</span><select id="ff-sheet">${file.sheets.map(n => `<option ${n === f.sheet ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>` : "<span></span>"}
      <label class="field"><span>개정내용</span><input type="text" id="ff-summary" value="${esc(f.summary)}"></label>
      <label class="field"><span>작성자</span><input type="text" id="ff-author" value="${esc(f.author)}" placeholder="예: 담당자A"></label></div>` : "";
  return `<div class="ff-form" id="ff-form"><b>${create ? "＋ 새 폴더 만들기" : "⬆ 파일로 새 버전 올리기"}</b>
    ${create ? `<div class="grid2"><label class="field"><span>폴더 이름 (필수)</span><input type="text" id="ff-name" value="${esc(f.name)}" placeholder="예: 변액_자동재배분_매뉴얼"></label>
      <label class="field"><span>업무명</span><input type="text" id="ff-task" value="${esc(f.task)}" placeholder="예: 변액보험 자동재배분"></label></div>
      <div class="field"><span>형식</span><div class="choice">${[["docx", "Word"], ["xlsx", "엑셀"]].map(([v, l]) => `<label><input type="radio" name="ff-format" value="${v}" ${f.format === v ? "checked" : ""} ${file ? "disabled" : ""}>${l}</label>`).join("")}</div>
        <span class="hint">${file ? "올린 파일의 형식을 따릅니다." : "이 폴더에 저장할 매뉴얼의 형식입니다."}</span></div>` : ""}
    ${fileRow}${verRows}
    ${f.error ? `<div class="notice warn">${esc(f.error)}</div>` : ""}
    <div class="row"><button class="btn small primary" id="ff-save" ${state.busy ? "disabled" : ""}>${create ? "폴더 만들기" : "올리기"}</button><button class="btn small" id="ff-cancel">취소</button>
      <span class="hint">${create ? "파일 없이 빈 폴더로 만들어 두고, 나중에 확정할 때 '저장할 폴더'에서 고를 수도 있습니다." : "올린 파일은 그대로 저장되고, 챗봇 검색과 버전 비교에도 쓰입니다."}</span></div></div>`;
}

async function readFolderFile(name, buffer) {
  // 올린 파일의 형식·버전·시트, 개인정보 여부
  const format = /\.xlsx$/i.test(name) ? "xlsx" : "docx";
  const out = { name, buffer, format, version: "", title: "", sheets: [], leaks: scanText(await officeText(name, buffer)) };
  if (format === "docx") { const d = await parseDocx(buffer, "ff_"); out.version = String(d.version || ""); out.title = d.title; }
  else {
    out.sheets = await xlsxSheetNames(buffer);
    const sheet = out.sheets.find(n => n !== "목차") || out.sheets[0];
    const zip = await JSZip.loadAsync(buffer); const p = await parseSheet(zip, await xlsxBook(zip), sheet, "ff_");
    out.title = p.title; out.version = p.version && p.version !== "1" ? String(p.version) : "";  // 엑셀은 시트에 '버전 N'이 적힌 경우만
  }
  return out;
}
async function folderFileSections(file, sheet) {
  const pick = s => ({ no: s.no, title: s.title, level: s.level, text: s.text });
  if (file.format === "docx") return (await parseDocx(file.buffer, "ff_")).sections.map(pick);
  const zip = await JSZip.loadAsync(file.buffer); const book = await xlsxBook(zip);
  return (await parseSheet(zip, book, sheet, "ff_")).sections.map(pick);
}
async function saveFolderForm() {
  const fv = state.folderView; const f = fv.form; const store = await getStore();
  const folder = f.mode === "version" ? curFolder() : null;
  f.error = "";
  const fail = msg => { f.error = msg; };
  if (!store) return fail(storeErrorText(storeReason));
  if (f.mode === "create") {
    f.name = f.name.trim();
    if (!f.name) return fail("폴더 이름을 입력해 주세요.");
    if (state.folders.some(x => x.name === f.name)) return fail("같은 이름의 폴더가 이미 있습니다. 다른 이름을 써 주세요.");
  } else if (!f.file) return fail("올릴 파일을 골라 주세요.");
  let versions = [];
  if (f.file) {
    const label = String(f.label).trim();
    if (!isLabel(label)) return fail("버전 번호는 1, 1.1, 2 같은 형식으로 써 주세요.");
    if (folder && folder.format !== f.file.format) return fail(`이 폴더는 ${folder.format === "xlsx" ? "엑셀" : "Word"} 폴더입니다. 같은 형식의 파일을 올려 주세요.`);
    if (folder?.versions.some(v => v.label === label)) return fail(`v${label}은 이미 있습니다. 다른 번호를 써 주세요.`);
    if (f.file.leaks.length) return fail("파일에 개인정보로 보이는 값이 있어 올리지 않았습니다: " + f.file.leaks.map(([k, v]) => `${k} ${v}`).join(", "));
    versions = [{ label, fileName: f.file.name, blob: new Blob([f.file.buffer]), origin: "직접 업로드", summary: f.summary.trim() || "파일 올림",
      author: f.author.trim(), reviewer: "", sheet: f.file.format === "xlsx" ? f.sheet : null, sections: await folderFileSections(f.file, f.sheet) }];
  }
  try {
    const meta = { name: folder ? folder.name : f.name, task: folder ? folder.task : f.task.trim(), format: folder ? folder.format : f.file ? f.file.format : f.format };
    const r = versions.length ? await store.save({ folderId: folder?.id || null, folder: meta, versions }) : await store.createFolder(meta);
    state.folders = r.folders; state.folderMsg = "";
    state.folderView = { id: r.folderId, pick: [], confirm: null, compare: null, status: f.mode === "create" ? `'${meta.name}' 폴더를 만들었습니다.` : `v${versions[0].label}을 올렸습니다.` };
    await refreshFolderLatest();
  } catch (e) { fail(storeErrorText(e.code)); }
}

document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t) return;
  const fv = state.folderView;
  if (t.id === "ff-new") { fv.form = { mode: "create", name: "", task: "", format: "docx", file: null, sheet: "", label: "1", summary: "처음 올린 원본", author: "", error: "" }; fv.editing = false; render(); $("#ff-name")?.focus(); }
  else if (t.id === "ff-addver") {
    const cur = curFolder(); const latest = maxLabel(cur.versions.map(v => v.label));
    fv.form = { mode: "version", file: null, sheet: "", label: latest ? nextLabel(latest, "minor") : "1", summary: "", author: "", error: "" }; fv.editing = false; render();
  }
  else if (t.id === "ff-cancel") { fv.form = null; render(); }
  else if (t.id === "ff-save") { state.busy = "폴더에 저장하는 중입니다"; render(); try { await saveFolderForm(); } finally { state.busy = null; render(); } }
});
document.addEventListener("change", async e => {
  const t = e.target; const f = state.folderView.form; if (!f) return;
  if (t.id === "ff-file" && t.files[0]) {
    try {
      const file = await readFolderFile(t.files[0].name, await t.files[0].arrayBuffer());
      f.file = file; f.error = "";
      if (file.format === "xlsx") f.sheet = file.sheets.find(n => n !== "목차") || file.sheets[0];
      const own = isLabel(file.version) && Number(file.version) > 0 ? file.version : fileLabel(file.name);
      const cur = f.mode === "version" ? curFolder() : null;
      const latest = cur ? maxLabel(cur.versions.map(v => v.label)) : "";
      f.label = latest ? nextLabel(latest, "minor") : own || "1";
      if (f.mode === "create") {
        f.format = file.format;
        if (!f.name.trim()) f.name = fileBaseName(file.name).replace(/[\\/:*?"<>|\s]+/g, "_");
        if (!f.task.trim() && file.title) f.task = taskLabel(file.title);  // 업무명은 파일 제목에서(챗봇 검색에 쓰임)
      }
    } catch (err) { f.error = `파일을 읽지 못했습니다: ${err?.message || err}`; }
    render();
  }
  else if (t.name === "ff-format") f.format = t.value;
  else if (t.id === "ff-sheet") f.sheet = t.value;
});
document.addEventListener("input", e => {
  const t = e.target; const f = state.folderView.form; if (!f) return;
  const key = { "ff-name": "name", "ff-task": "task", "ff-label": "label", "ff-summary": "summary", "ff-author": "author" }[t.id];
  if (key) f[key] = t.value;
});
