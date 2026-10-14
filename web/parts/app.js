// ---------- 앱 ----------
const IMAGE_TYPES = ["전산화면", "엑셀", "쿼리결과", "업무흐름도"];
const TOKEN_RE = /\{\{(IMAGE|CAPTURE_NEEDED):([^}]*)\}\}/g;
const SOURCE_TAG_RE = /\s*\[(?:메모|줄글|SQL|기존매뉴얼|엑셀(?::[^\]]*)?|캡처\d*)\]/g;
const CHECK = "[확인 필요]";
const JOB_LABEL = { 신규: "신규 작성", 갱신: "기존 매뉴얼 갱신", 추가: "기존 매뉴얼에 업무 추가" };

const state = {
  page: "input", mode: "mock", job: "신규", format: null, text: "", task: "", files: [],
  existing: null,   // {name, buffer, format, sheets?, parsed?, leaks}
  sheet: null,
  draft: null, confirmed: null,
  library: [],      // Q&A 검색 대상: {task, title, version, origin, file, sheet, sections, at}
  qa: null, busy: null, stream: "", error: "",
  verKind: "minor", // 확정할 때 번호 올리는 방법: minor(작은 수정 +0.1) / major(큰 개정)
  link: null,       // 폴더에서 '이 버전으로 수정'으로 불러온 경우 {folderId, label, name}
  folders: null, folderLatest: [], folderMsg: "", folderView: { id: null, pick: [], confirm: null, compare: null },
};
let nextId = 1;

const $ = (sel, root = document) => root.querySelector(sel);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const today = () => { const d = new Date(); return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`; };
const guessImageType = n => n.includes("흐름도") ? "업무흐름도" : n.includes("쿼리") ? "쿼리결과" : n.includes("엑셀") ? "엑셀" : "전산화면";
const isImage = n => /\.(png|jpe?g)$/i.test(n);
const taskLabel = title => (title || "").replace(/\s*업무(처리)?매뉴얼.*$/, "").trim() || title;
function allImages() {
  const out = { ...(state.draft?.asis?.images || {}) };
  for (const f of state.files) if (f.kind === "이미지") out[f.name] = f.dataUrl;
  return out;
}

// ---------- 중간 형식(마크다운) ----------
function splitFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return [{}, md];
  const meta = {};
  m[1].split("\n").forEach(l => { const i = l.indexOf(":"); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
  return [meta, md.slice(m[0].length)];
}
function splitSections(body) {
  const out = []; let cur = null; let inCode = false;
  for (const line of body.split("\n")) {
    if (line.trim().startsWith("```")) inCode = !inCode;
    const m = !inCode && line.match(/^(#{1,3})\s+(\d+(?:-\d+)*)\.\s*(.*?)\s*$/);
    if (m) { cur = { no: m[2], title: m[3], level: m[1].length, lines: [] }; out.push(cur); } else if (cur) cur.lines.push(line);
  }
  return out.map(s => ({ no: s.no, title: s.title, level: s.level, text: s.lines.join("\n").replace(/^\n+|\n+$/g, ""), fb: null }));
}
const stripTags = t => t.replace(SOURCE_TAG_RE, "");
function countOpen(sections) {
  const imgs = allImages(); let check = 0, capture = 0;
  for (const s of sections) {
    check += s.text.split(CHECK).length - 1;
    for (const m of s.text.matchAll(TOKEN_RE)) if (m[1] === "CAPTURE_NEEDED" || !imgs[m[2].split("|")[0]]) capture++;
  }
  return { check, capture };
}
function placeImages(sections) {
  const byNo = Object.fromEntries(sections.map(s => [s.no, s]));
  for (const f of state.files.filter(f => f.kind === "이미지")) {
    const re = new RegExp("\\{\\{IMAGE:" + f.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?:\\|([^}]*))?\\}\\}");
    let foundIn = null, draftCap = "";
    for (const s of sections) { const m = s.text.match(re); if (m) { foundIn = s; draftCap = m[1] || ""; break; } }
    const token = `{{IMAGE:${f.name}|${f.caption || draftCap || f.name}}}`;
    let target = byNo[f.step] || null;
    if (foundIn && (!target || target === foundIn)) { foundIn.text = foundIn.text.replace(re, () => token); continue; }
    if (foundIn) foundIn.text = foundIn.text.replace(re, "").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\n+$/g, "");
    target = target || byNo["6"] || sections[sections.length - 1];
    target.text = (target.text.replace(/\n+$/, "") + `\n\n${token}`).replace(/^\n+/, "");
  }
}

// ---------- 화면용 렌더링 ----------
function inline(t) {
  let h = esc(t);
  h = h.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
  h = h.replace(/\[확인 필요\]/g, '<span class="check">[확인 필요]</span>');
  h = h.replace(/\[(메모|줄글|SQL|기존매뉴얼|엑셀(?::[^\]]*)?|캡처\d*)\]/g, '<span class="tag">[$1]</span>');
  return h;
}
function renderBlock(text) {
  const lines = text.split("\n"); let html = ""; let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (t.startsWith("```")) { const code = []; i++; while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++]); html += `<pre>${esc(code.join("\n"))}</pre>`; i++; continue; }
    if (t.startsWith("|")) {
      const rows = []; while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++].trim());
      const cells = rows.map(r => r.replace(/^\||\|$/g, "").split("|").map(c => c.trim())).filter(r => !r.every(c => /^:?-{3,}:?$/.test(c)));
      html += `<div class="table-wrap"><table>${cells.map((r, ri) => `<tr>${r.map(c => ri === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</table></div>`;
      continue;
    }
    if (t.startsWith("- ")) { const items = []; while (i < lines.length && lines[i].trim().startsWith("- ")) items.push(lines[i++].trim().slice(2)); html += `<ul>${items.map(x => `<li>${inline(x)}</li>`).join("")}</ul>`; continue; }
    if (t) html += `<p>${inline(t)}</p>`;
    i++;
  }
  return html;
}
function renderSectionBody(text, si, editable) {
  const imgs = allImages(); let html = ""; let pos = 0; let k = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    html += renderBlock(text.slice(pos, m.index));
    const [name, caption = ""] = m[2].split("|");
    if (m[1] === "IMAGE" && imgs[name]) html += `<figure><img src="${imgs[name]}" alt="${esc(caption || name)}"><figcaption>[그림] ${esc(caption || name)}</figcaption></figure>`;
    else {
      const d = m[1] === "IMAGE" ? (caption || name) : m[2]; const id = `cap-${si}-${k}`;
      html += `<div class="capture"><span>📷 [캡처 필요] ${esc(d)}</span>${editable ? `<label class="btn" for="${id}">캡처 올리기<input type="file" id="${id}" accept="image/png,image/jpeg" data-capture="${si}" data-token="${esc(m[0])}" data-desc="${esc(d)}"></label>` : ""}</div>`;
    }
    pos = m.index + m[0].length; k++;
  }
  return html + renderBlock(text.slice(pos));
}

// ---------- 개인정보 필터 (PRD 6장 10) ----------
const PII = [["주민등록번호", /\d{6}-?[1-4]\d{6}/g], ["휴대폰 번호", /01[016789]-?\d{3,4}-?\d{4}/g], ["계좌번호", /\d{2,6}-\d{2,6}-\d{2,6}/g]];
const DATE_RE = /^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
function scanText(text) {
  const found = [], taken = [];
  for (const [kind, re] of PII) for (const m of String(text || "").matchAll(re)) {
    const s = m.index, e = s + m[0].length;
    if (taken.some(([a, b]) => s < b && a < e) || (kind === "계좌번호" && DATE_RE.test(m[0]))) continue;
    taken.push([s, e]); found.push([kind, m[0].slice(0, 3) + "*".repeat(m[0].length - 3)]);
  }
  return found;
}
async function officeText(name, buffer) {
  const zip = await JSZip.loadAsync(buffer);
  if (/\.xlsx$/i.test(name)) {
    // 글자 칸만 본다(날짜·숫자 칸은 개인정보가 아니다).
    const parts = Object.keys(zip.files).filter(p => p === "xl/sharedStrings.xml" || /^xl\/worksheets\/.*\.xml$/.test(p));
    let out = "";
    for (const p of parts) out += desc(parseXml(await zip.file(p).async("string")), NS.main, "t").map(t => t.textContent).join("\n") + "\n";
    return out;
  }
  return desc(parseXml(await zip.file("word/document.xml").async("string")), NS.w, "t").map(t => t.textContent).join("\n");
}
function leaks() {
  const out = [];
  scanText(state.text).forEach(([k, v]) => out.push(["줄글 입력", k, v]));
  if (state.job === "추가") scanText(state.task).forEach(([k, v]) => out.push(["추가할 업무명", k, v]));
  for (const f of state.files) {
    if (f.kind === "이미지") scanText(`${f.step} ${f.caption}`).forEach(([k, v]) => out.push([`${f.name}의 정보`, k, v]));
    else (f.leaks || []).forEach(([k, v]) => out.push([f.name, k, v]));
  }
  (state.existing?.leaks || []).forEach(([k, v]) => out.push([state.existing.name, k, v]));
  return out;
}

// ---------- 초안 생성 ----------
const RULES = `작성 규칙
- 회사 업무처리매뉴얼 양식의 6개 섹션을 이 순서로 쓴다: '# 1. 업무개요', '# 2. 관련규정', '# 3. 업무흐름도', '# 4. 처리절차'(소제목 '## 4-1. …', '## 4-2. …', 단계는 번호 목록), '# 5. 유의사항·예외', '# 6. 관련 양식·쿼리'.
- 맨 앞에 frontmatter를 둔다: ---\\ntitle: (업무명) 업무처리매뉴얼\\ndept: 계약관리부\\n---
- 원자료에 적힌 내용만 정리한다. 적히지 않은 내용은 지어내지 말고 '[확인 필요]'로 남긴다.
- 문장 끝에 출처 태그를 단다: [메모], [줄글], [엑셀:시트명], [캡처N], [SQL], [기존매뉴얼]. 근거 없는 추정은 [확인 필요].
- 캡처 이미지는 {{IMAGE:파일명|한 줄 설명}}으로 해당 단계 바로 아래에 넣는다. 목록에 있는 파일명만 쓴다.
- 화면 조작 단계인데 캡처가 없으면 {{CAPTURE_NEEDED:필요한 화면 설명}}을 넣는다.
- 업무흐름도 이미지가 없으면 '① … → ② … → ③ …' 텍스트 흐름으로 쓴다.
- 관련규정은 '| 항목 | 기준 |' 표로, 쿼리는 \`\`\`sql 블록으로 쓴다.
- 마크다운만 출력한다. 설명이나 인사말은 쓰지 않는다.`;
function materialsForPrompt(asis) {
  let out = "";
  if (state.text.trim()) out += `## 줄글 입력\n${state.text}\n\n`;
  for (const f of state.files) {
    if (f.kind === "이미지") out += `## 캡처 이미지: ${f.name}\n- 종류: ${f.imgType}${f.step ? `\n- 배치할 단계: ${f.step}` : ""}${f.caption ? `\n- 설명: ${f.caption}` : ""}\n\n`;
    else out += `## ${f.kind} 파일: ${f.name}\n${f.text || "(내용을 읽을 수 없음. 파일명만 참고)"}\n\n`;
  }
  if (asis && state.job === "갱신") out += `## 기존 매뉴얼 (갱신 대상)\n${asis.sections.map(s => `${"#".repeat(s.level + 1)} ${s.no}. ${s.title}\n${s.text}`).join("\n\n")}\n\n`;
  return out;
}
// 배포 대상: 아티팩트(claude.ai의 sample·downloads 기능) 또는 Vercel(서버 함수 /api/claude + 일반 다운로드)
const PLATFORM = window.__PLATFORM__ || "artifact";
async function vercelSample(prompt, { onText } = {}) {
  let res;
  try {
    res = await fetch("/api/ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }) });
  } catch { throw { code: "network" }; }
  if (!res.ok) { const j = await res.json().catch(() => ({})); throw { code: j.code || `http_${res.status}` }; }
  const reader = res.body.getReader(); const dec = new TextDecoder(); let text = "";
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    text += dec.decode(value, { stream: true });
    const i = text.indexOf("\u0000");
    if (i >= 0) { const code = text.slice(i + 1).trim(); text = text.slice(0, i); if (code !== "truncated") throw { code, text }; }
    onText?.({ text });
  }
  // 일부 모델은 생각 과정을 <think>…</think>로 본문에 섞어 보낸다. 매뉴얼에는 넣지 않는다.
  return { text: text.replace(/<think>[\s\S]*?<\/think>/g, "").trim(), truncated: false };
}
const vercelDownloads = {
  async save({ filename, data }) {
    const url = URL.createObjectURL(data); const a = document.createElement("a");
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return { status: "saved" };
  },
};
async function getCap(name) {
  if (PLATFORM === "vercel") return name === "sample" ? vercelSample : name === "downloads" ? vercelDownloads : null;
  try { return window.claude?.use ? await window.claude.use(name) : null; } catch { return null; }
}
function sampleErrorText(e) {
  const map = { not_granted: "Claude 사용을 허용하지 않아 AI 모드를 쓸 수 없습니다. 모의 모드로 진행해 주세요.", rate_limited: "요청이 많습니다(무료 모델은 분당·하루 사용 횟수가 정해져 있어요). 잠시 뒤 다시 눌러 주세요.", cancelled: "중지했습니다.",
    not_configured: "서버에 AI 설정이 아직 없습니다. 관리자가 Vercel 환경 변수 OPENROUTER_API_KEY와 OPENROUTER_MODEL을 넣어야 합니다. 모의 모드로 진행해 주세요.",
    bad_model: "서버에 설정된 AI 모델 이름이 맞지 않습니다. 관리자에게 OPENROUTER_MODEL 값을 확인해 달라고 알려 주세요.",
    no_credits: "AI 사용 한도가 남아 있지 않습니다. 관리자에게 알려 주세요.",
    bad_key: "서버의 API 키가 올바르지 않습니다. 관리자에게 알려 주세요.",
    refusal: "Claude가 이 요청에 답하지 않았습니다. 자료에서 민감해 보이는 내용을 빼고 다시 시도해 주세요.", network: "서버에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.",
    too_large: "자료가 너무 많습니다. 원자료를 줄여서 다시 시도해 주세요." };
  return map[e?.code] || `AI 호출이 실패했습니다 (${e?.code || "알 수 없음"}). 모의 모드로 진행하거나 잠시 뒤 다시 시도해 주세요.`;
}
// 답변 전체가 ```markdown … ``` 으로 감싸져 온 경우에만 벗긴다(마지막 sql 블록의 닫는 ```는 지우지 않는다).
const unfence = t => { t = t.trim(); const m = t.match(/^```(?:markdown|md)?\n([\s\S]*)\n```$/); return (m && !/^---\n|^#/.test(t) ? m[1] : t).trim(); };

async function readExisting() {
  const ex = state.existing; if (!ex) return null;
  if (ex.format === "docx") return { ...(await parseDocx(ex.buffer)), format: "docx" };
  const zip = await JSZip.loadAsync(ex.buffer); const book = await xlsxBook(zip);
  if (state.job === "추가") return { title: ex.name, version: 0, history: [], sections: [], images: {}, sheets: book.sheets.map(s => s.name), format: "xlsx" };
  return { ...(await parseSheet(zip, book, state.sheet, "asis_")), format: "xlsx" };
}
function addToLibrary(entry) {
  state.library = state.library.filter(e => !(e.origin === "업로드" && entry.origin === "업로드" && e.file === entry.file && e.sheet === entry.sheet));
  state.library.push({ ...entry, at: Date.now() });
}
async function registerUploaded(asis) {
  // 올린 기존 매뉴얼을 Q&A 자료로 등록한다. 엑셀은 갱신 대상이 아니어도 시트 전부.
  const ex = state.existing;
  if (ex.format === "docx") { addToLibrary({ task: taskLabel(asis.title), title: asis.title, version: asis.version, origin: "업로드", file: ex.name, sheet: null, sections: asis.sections }); return; }
  const zip = await JSZip.loadAsync(ex.buffer); const book = await xlsxBook(zip);
  for (const s of book.sheets) {
    const p = await parseSheet(zip, book, s.name, `qa_${s.name}_`);
    if (p.sections.length) addToLibrary({ task: taskLabel(p.title), title: p.title, version: p.version, origin: "업로드", file: ex.name, sheet: s.name, sections: p.sections });
  }
}

// 확정본이 들어갈 폴더와 버전 번호를 정한다.
//  신규: 새 폴더, v1 / 갱신·추가: '이 버전으로 수정'한 폴더 → 같은 이름(파일명에서 _vN 뺀 것)의 폴더 → 새 폴더(원본을 첫 버전으로)
async function planFolder(d) {
  const store = await getStore();
  let folders = [];
  if (store) { try { folders = await store.list(); state.folders = folders; } catch { /* 저장소가 잠깐 안 되면 번호만 정한다 */ } }
  const safe = n => String(n || "").replace(/[\\/:*?"<>|\s]+/g, "_");
  if (d.job === "신규") {
    const base = safe(d.meta.title) || "매뉴얼"; let name = base;
    for (let i = 2; folders.some(f => f.name === name); i++) name = `${base}_${i}`;
    return { store: !!store, folderId: null, name, base: null, origLabel: null };
  }
  const ex = state.existing;
  let folder = state.link ? folders.find(f => f.id === state.link.folderId) : null;
  const name = folder?.name || safe(fileBaseName(ex.name));
  if (!folder) folder = folders.find(f => f.name === name && f.format === ex.format) || null;
  if (folder) return { store: !!store, folderId: folder.id, name: folder.name, base: maxLabel(folder.versions.map(v => v.label)), origLabel: null };
  // 처음 올린 파일: 파일 안의 '버전 N' → 파일명의 _vN → 1
  const origLabel = isLabel(d.asis?.version) && Number(d.asis.version) > 0 ? String(d.asis.version) : fileLabel(ex.name) || "1";
  return { store: !!store, folderId: null, name, base: origLabel, origLabel };
}
async function planVersion(d) {
  d.plan = await planFolder(d);
  d.version = d.job === "신규" ? "1" : nextLabel(d.plan.base, state.verKind);
}

async function generate() {
  state.error = "";
  state.busy = state.mode === "ai" ? "AI가 초안을 쓰는 중입니다" : "초안을 만드는 중입니다"; state.stream = ""; render();
  try {
    const asis = await readExisting();
    if (asis) await registerUploaded(asis);
    let md;
    if (state.mode === "mock") {
      md = (state.text + (state.job === "추가" ? state.task : "")).includes("자동재배분") ? DATA.mock.auto : DATA.mock.fund;
    } else {
      const sample = await getCap("sample");
      if (!sample) throw { code: "unavailable_ai" };
      const prompt = `너는 보험사 계약관리부의 업무처리매뉴얼 작성 담당자다. 아래 원자료로 매뉴얼${state.job === "갱신" ? "을 현행화한 새 버전" : " 초안"}을 마크다운으로 작성하라.\n\n${RULES}\n\n형식 예시(내용은 따라 하지 말 것):\n${DATA.mock.auto}\n\n# 원자료\n${materialsForPrompt(asis)}`;
      const { text } = await sample(prompt, { modelTier: "default", onText: ({ text }) => { state.stream = text; updateStream(); } });
      md = unfence(text);
    }
    const [meta, body] = splitFrontmatter(md);
    const sections = splitSections(body);
    if (!sections.length) throw { code: "format" };
    placeImages(sections);
    const title = meta.title || "업무처리매뉴얼";
    const format = state.job === "신규" ? state.format : state.existing.format;
    state.draft = { meta: { title, dept: meta.dept || "계약관리부" }, task: state.job === "추가" ? state.task.trim() : taskLabel(title), sections, job: state.job, format, asis, chapterNo: asis ? lastChapterNo(asis.sections) + 1 : 1 };
    state.verKind = "minor";
    await planVersion(state.draft);
    state.confirmed = null; state.summary = undefined; state.page = "review";
    applyExampleConfirm();
  } catch (e) {
    state.error = e?.code === "unavailable_ai" ? "이 화면에서는 AI 모드를 쓸 수 없습니다. 모의 모드로 진행해 주세요."
      : e?.code === "format" ? "AI 답변을 매뉴얼 형식으로 읽지 못했습니다. 다시 시도하거나 모의 모드를 써 주세요."
      : e?.code ? sampleErrorText(e) : `파일을 처리하지 못했습니다: ${e?.message || e}`;
  } finally { state.busy = null; render(); }
}

async function rewriteSection(si, comment) {
  const s = state.draft.sections[si];
  const sample = await getCap("sample");
  if (!sample) { state.error = "이 화면에서는 AI 모드를 쓸 수 없습니다."; render(); return; }
  state.busy = `${s.no}. ${s.title} 섹션을 AI가 다시 쓰는 중입니다`; state.stream = ""; render();
  try {
    const prompt = `업무처리매뉴얼의 한 섹션을 담당자 피드백에 맞게 고쳐라. 제목 줄은 쓰지 말고 고친 본문만 마크다운으로 출력하라.\n${RULES}\n\n# 섹션: ${s.no}. ${s.title}\n${s.text}\n\n# 피드백\n${comment}\n\n# 참고 원자료\n${materialsForPrompt(state.draft.asis)}`;
    const { text } = await sample(prompt, { modelTier: "default", onText: ({ text }) => { state.stream = text; updateStream(); } });
    s.text = unfence(text).replace(/^#{1,3}\s+\d[\d-]*\..*\n+/, "");
    s.fb = { status: "반영", comment };
  } catch (e) { state.error = sampleErrorText(e); s.fb = { status: "미반영", comment }; }
  finally { state.busy = null; render(); }
}

// ---------- Word 새로 만들기(신규·갱신) ----------
async function buildDocx(revisions) {
  const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType, AlignmentType, HeadingLevel } = window.docx;
  const imgs = allImages(); const d = state.draft;
  const runs = (text, bold) => text.split(/(\[확인 필요\]|\*\*[^*]+\*\*)/).filter(Boolean).map(p =>
    p === CHECK ? new TextRun({ text: p, color: "C55A11", bold: true }) : p.startsWith("**") && p.endsWith("**") ? new TextRun({ text: p.slice(2, -2), bold: true }) : new TextRun({ text: p, bold }));
  const box = (lines, fill, opts = {}) => new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: [new TableCell({ shading: { type: ShadingType.CLEAR, color: "auto", fill },
    children: lines.map(l => new Paragraph({ alignment: opts.center ? AlignmentType.CENTER : undefined, children: opts.mono ? [new TextRun({ text: l || " ", font: "Consolas", size: 18 })] : runs(l) })) })] })] });
  const gap = () => new Paragraph({ text: "" });
  const table = (rows, head = true) => {
    const cells = rows.map(r => Array.isArray(r) ? r : r.replace(/^\||\|$/g, "").split("|").map(c => c.trim())).filter(r => !r.every(c => /^:?-{3,}:?$/.test(c)));
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: cells.map((r, ri) => new TableRow({ children: r.map(c => new TableCell({
      shading: head && ri === 0 ? { type: ShadingType.CLEAR, color: "auto", fill: "DDE5F0" } : undefined, children: [new Paragraph({ children: runs(String(c || " "), head && ri === 0) })] })) })) });
  };
  const body = [];
  for (const s of d.sections) {
    body.push(new Paragraph({ text: `${s.no}. ${s.title}`, heading: s.level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2 }));
    const lines = stripTags(s.text).split("\n");
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t.startsWith("```")) { const code = []; i++; while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++].replace(/\s+$/, "")); body.push(box(code, "F2F2F2", { mono: true }), gap()); continue; }
      if (t.startsWith("|")) { const rows = []; while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++]); i--; body.push(table(rows), gap()); continue; }
      const tok = t.match(/^\{\{(IMAGE|CAPTURE_NEEDED):([^}]*)\}\}$/);
      if (tok) {
        const [name, caption = ""] = tok[2].split("|");
        if (tok[1] === "IMAGE" && imgs[name]) {
          const [w, h] = await imageSize(imgs[name]); const width = 529; const height = Math.round(h * width / w);
          body.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: dataUrlBytes(imgs[name]), transformation: { width, height } })] }));
          body.push(new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `[그림] ${caption || name}`, size: 18, color: "595959" })] }));
        } else body.push(box([`[캡처 필요: ${tok[1] === "IMAGE" ? (caption || name) : tok[2]}]`], "D9D9D9", { center: true }), gap());
        continue;
      }
      if (t.startsWith("- ")) { body.push(new Paragraph({ bullet: { level: 0 }, children: runs(t.slice(2)) })); continue; }
      if (t) body.push(new Paragraph({ children: runs(t), spacing: { after: 80 } }));
    }
  }
  const doc = new Document({
    styles: { default: { document: { run: { font: "Malgun Gothic", size: 21 } } } },
    sections: [{ children: [
      new Paragraph({ heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER, text: d.meta.title }),
      new Paragraph({ alignment: AlignmentType.CENTER, text: `${d.meta.dept}  |  버전 ${d.version}  |  ${today()}` }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "※ 교육용 가상 자료입니다. 실제 회사 규정·시스템과 무관합니다.", color: "B03A2E" })] }),
      new Paragraph({ text: "개정이력", heading: HeadingLevel.HEADING_1 }),
      table([["버전", "개정일", "개정내용", "작성자", "검토자"], ...revisions.map(r => r.map(String))]),
      ...body,
    ] }],
  });
  return Packer.toBlob(doc);
}

// ---------- 확정 ----------
async function confirmDraft() {
  const d = state.draft; const c = state.confirmed;
  await planVersion(d);  // 그사이 폴더에 다른 버전이 저장됐을 수 있어 번호를 다시 정한다
  const revision = [String(d.version), today(), c.summary, c.author, c.reviewer];
  const docSections = d.sections.map(s => ({ no: s.no, title: s.title, level: s.level, text: s.text }));
  // 엑셀 업무 추가의 새 시트는 시트 자체의 v1, 파일(폴더) 번호는 d.version
  const layout = { title: d.meta.title, version: d.job === "추가" && d.format === "xlsx" ? "1" : d.version, revision, sections: docSections, images: allImages() };
  const ex = state.existing;
  if (d.job === "추가" && d.format === "docx") c.blob = await docxAppendChapter(ex.buffer, { chapterNo: d.chapterNo, chapterTitle: d.task, version: d.version, sections: docSections, images: allImages(), revision });
  else if (d.job === "추가") c.blob = await xlsxAdd(ex.buffer, safeSheetName(d.task), taskLabel(d.meta.title), layout);
  else if (d.format === "docx") c.blob = await buildDocx([...(d.job === "갱신" ? d.asis.history : []), revision]);
  else if (d.job === "갱신") c.blob = await xlsxReplace(ex.buffer, state.sheet, { ...layout, history: d.asis.history.map(h => `v${h[0]} ${h[1]} ${h[2]}`.trim()) });
  else c.blob = await xlsxNew({ task: d.task, ...layout });
  c.filename = `${d.plan.name}_v${d.version}.${d.format}`;
  const sheet = d.format === "xlsx" ? (d.job === "갱신" ? state.sheet : d.job === "추가" ? safeSheetName(d.task) : sheetNameFor(d.task)) : null;
  addToLibrary({ task: d.task, title: d.meta.title, version: d.version, origin: "확정", file: c.filename, sheet, sections: docSections });
  await saveToFolder(d, c, sheet, docSections);
}
// 확정본을 폴더에 새 버전으로 저장. 새 폴더면 처음 올린 원본을 첫 버전으로 함께 넣는다.
async function saveToFolder(d, c, sheet, docSections) {
  c.saved = null; c.saveError = "";
  const store = await getStore();
  if (!store) { c.saveError = storeErrorText(storeReason); return; }
  const versions = [];
  const ex = state.existing;
  if (!d.plan.folderId && d.plan.origLabel && ex) {
    versions.push({ label: d.plan.origLabel, fileName: ex.name, blob: new Blob([ex.buffer]), origin: "최초 업로드", summary: "처음 올린 원본",
      author: "", reviewer: "", sheet: ex.format === "xlsx" && d.job === "갱신" ? state.sheet : null,
      sections: d.job === "추가" && d.format === "xlsx" ? [] : d.asis.sections.map(s => ({ no: s.no, title: s.title, level: s.level, text: s.text })) });
  }
  versions.push({ label: d.version, fileName: c.filename, blob: c.blob, origin: JOB_LABEL[d.job], summary: c.summary, author: c.author, reviewer: c.reviewer, sheet, sections: docSections });
  try {
    const r = await store.save({ folderId: d.plan.folderId, folder: { name: d.plan.name, task: d.task, format: d.format }, versions });
    state.folders = r.folders; c.saved = { folderId: r.folderId, name: d.plan.name, label: d.version, withOriginal: versions.length > 1 ? d.plan.origLabel : null };
    state.link = { folderId: r.folderId, label: d.version, name: d.plan.name };
    await refreshFolderLatest();
  } catch (e) { c.saveError = storeErrorText(e.code); }
}
async function download() {
  const status = $("#dl-status"); const c = state.confirmed;
  try {
    const dl = await getCap("downloads");
    if (!dl) { status.textContent = "이 화면에서는 파일 내려받기를 쓸 수 없습니다. claude.ai에서 열어 주세요."; return; }
    status.textContent = "저장 확인 창을 확인해 주세요.";
    await dl.save({ filename: c.filename, data: c.blob });
    status.textContent = `${c.filename} 저장을 요청했습니다.`;
  } catch (e) { status.textContent = e?.code === "declined" ? "저장을 취소했습니다." : `내려받기에 실패했습니다 (${e?.code || e?.message || "알 수 없음"}).`; }
}

// ---------- Q&A (모의, PRD 6장 11 — 앱의 qa.py와 같은 규칙) ----------
const FILLER = new Set(["뭐야", "뭐예요", "어떻게", "언제", "얼마야", "얼마", "있어", "있나요", "되나요", "돼", "해", "하면", "되나"]);
const qaWords = q => q.split(/\s+/).map(w => w.replace(/[^\p{L}\p{N}_-]/gu, "").replace(/^-+|-+$/g, "")).filter(w => w.length >= 2 && !FILLER.has(w));
const qaFind = (w, text) => { for (let e = w.length; e > 1; e--) if (text.includes(w.slice(0, e))) return w.slice(0, e); return null; };
const taskKey = name => taskLabel(name || "").replace(/\s+/g, "");
function latestOnly() {
  // 같은 업무가 여럿이면 확정본 > 업로드본, 높은 버전, 나중 것 하나만 남긴다.
  const rank = e => [e.origin !== "업로드" ? 1 : 0, e.version, e.at];
  const higher = (a, b) => { for (let i = 0; i < a.length; i++) { const c = i === 1 ? vcmp(a[i], b[i]) : a[i] === b[i] ? 0 : a[i] > b[i] ? 1 : -1; if (c) return c > 0; } return false; };
  const best = new Map();
  for (const e of [...state.folderLatest, ...state.library]) {
    const key = taskKey(e.task); const cur = best.get(key);
    if (!cur || higher(rank(e), rank(cur))) best.set(key, e);
  }
  return [...best.values()];
}
function qaLabel(e, s) {
  const sec = `${s.no}. ${s.title}`;
  if (e.sheet) return `${e.file} > ${e.sheet} > ${sec}`;
  if (e.origin === "업로드") return `${e.file} · v${e.version} · ${sec}`;
  if (e.origin === "폴더") return `${e.title} 폴더 · v${e.version} · ${sec}`;
  return `${e.task} 매뉴얼 · v${e.version} (확정본) · ${sec}`;
}
function bestLines(text, found, limit = 3) {
  const plain = text.replace(TOKEN_RE, (m, k, v) => "\n" + (v.split("|")[1] || "") + "\n");
  const lines = plain.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("```") && !l.startsWith("|---"));
  const scored = lines.map((ln, i) => [found.reduce((a, [w, m]) => a + (ln.includes(m) ? m.length / w.length : 0), 0), i, ln]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  if (!scored.length || scored[0][0] === 0) return [];
  return scored.filter(x => x[0] === scored[0][0]).map(x => x[2]).slice(0, limit);
}
function askQa(question) {
  const words = qaWords(question); const hits = [];
  for (const e of latestOnly()) for (const s of e.sections) {
    const text = `${s.title}\n${s.text}`;
    const found = words.map(w => [w, qaFind(w, text)]).filter(x => x[1]);
    const inTask = words.filter(w => qaFind(w, e.task || "")).length;
    if (found.length || inTask) hits.push({ e, s, score: found.reduce((a, [w, m]) => a + m.length / w.length, 0) + inTask, found, label: qaLabel(e, s) });
  }
  hits.sort((a, b) => b.score - a.score);
  const ok = hits.filter(h => words.length && h.score / words.length >= 0.5).slice(0, 3);
  if (!ok.length) return { status: "없음", answer: "매뉴얼에 없는 내용입니다.", lines: [], hits: [] };
  ok.forEach(h => { h.best = bestLines(h.s.text, h.found, 1); });
  const lines = bestLines(ok[0].s.text, ok[0].found);
  if (lines.some(l => l.includes(CHECK))) return { status: "확인 필요", answer: "매뉴얼에 아직 확인되지 않은 항목입니다.", lines, hits: ok };
  return { status: "답변", answer: lines.map(stripTags).join("\n"), lines, hits: ok };
}
const tidy = l => { l = stripTags(l).trim(); return l.startsWith("|") ? l.replace(/^\||\|$/g, "").split("|").map(c => c.trim()).filter(Boolean).join(" — ") : l; };


// ---------- 변경 감지 (PRD 6장 9 — 앱의 diff.py와 같은 규칙) ----------
function diffLines(text) {
  return stripTags(text.replace(TOKEN_RE, (m, k, v) => k === "IMAGE" ? `[그림: ${v.split("|")[1] || v}]` : `[캡처 필요: ${v}]`))
    .split("\n").map(l => l.replace(/\s+/g, " ").trim()).filter(Boolean);
}
function lineDiff(a, b) {
  // 최장 공통 부분열로 줄 단위 차이: '- 옛 줄', '+ 새 줄'
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] === b[j]) { i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) out.push("- " + a[i++]); else out.push("+ " + b[j++]); }
  while (i < n) out.push("- " + a[i++]); while (j < m) out.push("+ " + b[j++]);
  return out;
}
function compareSections(asisSections, tobeSections) {
  const old = Object.fromEntries(asisSections.map(s => [s.no, s])); const result = {};
  for (const s of tobeSections) {
    const before = old[s.no];
    if (!before) { result[s.no] = { status: "추가", diff: [] }; continue; }
    const a = diffLines(before.text), b = diffLines(s.text); const titleChanged = before.title.trim() !== s.title.trim();
    result[s.no] = a.join("\n") === b.join("\n") && !titleChanged ? { status: "동일", diff: [] } : { status: "변경", titleChanged, oldTitle: before.title, diff: lineDiff(a, b) };
  }
  const nos = new Set(tobeSections.map(s => s.no));
  return { result, deleted: asisSections.filter(s => !nos.has(s.no)) };
}
function changeSummary({ result, deleted }) {
  const parts = ["변경", "추가"].map(k => [k, Object.entries(result).filter(([, r]) => r.status === k).map(([no]) => no)]).filter(([, v]) => v.length).map(([k, v]) => `${k} ${v.join(", ")}`);
  if (deleted.length) parts.push(`삭제 ${deleted.map(s => s.no).join(", ")}`);
  return parts.join(" / ");
}
const changesOf = d => d.job === "갱신" && d.asis ? compareSections(d.asis.sections, d.sections) : null;

// ---------- 화면 ----------
function modeBadge() { return state.mode === "ai" ? `<span class="badge ai">● AI 모드</span>` : `<span class="badge">● 모의 모드</span>`; }
function busyPanel() { return `<div class="panel"><b>${esc(state.busy)}…</b>${state.mode === "ai" ? `<span class="hint">${PLATFORM === "vercel" ? "" : "처음 쓸 때는 Claude 사용을 허용할지 묻는 창이 뜹니다. "}답이 오기까지 수십 초 걸릴 수 있습니다.</span>` : ""}<div class="stream" id="stream">${esc(state.stream || "처리하는 중…")}</div></div>`; }
function updateStream() { const el = $("#stream"); if (el) { el.textContent = state.stream; el.scrollTop = el.scrollHeight; } }

function problems() {
  const p = [];
  const ex = state.existing;
  if (state.job === "신규" && !state.format) p.push("출력 형식(Word/엑셀)을 골라 주세요.");
  if (state.job !== "신규" && !ex) p.push("기존 매뉴얼을 올려 주세요.");
  if (state.job === "갱신" && ex?.format === "xlsx" && !state.sheet) p.push("갱신할 시트를 골라 주세요.");
  if (state.job === "추가" && !state.task.trim()) p.push("추가할 업무명을 입력해 주세요.");
  const hasRaw = state.text.trim() || state.files.length;
  if (state.job === "신규" && !hasRaw) p.push("줄글을 쓰거나 원자료 파일을 하나 이상 올려 주세요.");
  if (state.job === "추가" && !hasRaw) p.push("추가할 업무의 줄글이나 원자료를 넣어 주세요.");
  if (leaks().length) p.push("개인정보가 감지되어 진행할 수 없습니다.");
  return p;
}
function duplicateWarning() {
  const ex = state.existing; const t = state.task.trim();
  if (state.job !== "추가" || !ex || !t) return "";
  const taken = ex.format === "xlsx" ? ex.sheets.includes(safeSheetName(t)) : ex.chapters.some(c => c.includes(t));
  return taken ? `<div class="notice warn">'${esc(t)}' 이름의 ${ex.format === "xlsx" ? "시트가" : "장이"} 이미 있습니다.</div>` : "";
}

function renderInput() {
  const p = problems(); const ex = state.existing; const L = leaks();
  const fileRows = state.files.filter(f => f.kind !== "이미지").map(f => `<div class="file-row"><span class="kind">${f.kind}</span><span class="name">${esc(f.name)}</span><button class="btn small" data-remove="${f.id}">빼기</button></div>`).join("");
  const imgCards = state.files.filter(f => f.kind === "이미지").map(f => `
    <div class="img-card"><img src="${f.dataUrl}" alt="${esc(f.name)}">
      <div class="stack" style="gap:10px">
        <div class="row" style="justify-content:space-between"><span class="hint">${esc(f.name)}</span><button class="btn small" data-remove="${f.id}">빼기</button></div>
        <div class="grid2">
          <label class="field"><span>종류</span><select id="type-${f.id}" data-meta="imgType" data-id="${f.id}">${IMAGE_TYPES.map(t => `<option ${t === f.imgType ? "selected" : ""}>${t}</option>`).join("")}</select></label>
          <label class="field"><span>배치할 단계 (선택)</span><input type="text" id="step-${f.id}" data-meta="step" data-id="${f.id}" value="${esc(f.step)}" placeholder="예: 4-3"></label>
        </div>
        <label class="field"><span>한 줄 설명</span><input type="text" id="capt-${f.id}" data-meta="caption" data-id="${f.id}" value="${esc(f.caption)}" placeholder="예: 펀드변경 신청 화면"></label>
      </div></div>`).join("");
  const jobBox = state.job === "신규" ? `
      <div class="field"><span>어떤 형식으로 만들까요?</span>
        <div class="choice">${[["docx", "Word"], ["xlsx", "엑셀"]].map(([v, l]) => `<label><input type="radio" name="format" value="${v}" ${state.format === v ? "checked" : ""}>${l}</label>`).join("")}</div>
        <span class="hint">기본값은 없습니다. 고르기 전에는 [초안 생성]을 누를 수 없습니다.</span></div>` : `
      <label class="drop"><span class="field"><span>기존 매뉴얼 (.docx 또는 .xlsx)</span></span><input type="file" id="up-existing" accept=".docx,.xlsx">
        ${ex ? `<span class="hint">올린 파일: <b>${esc(ex.name)}</b> · 출력 형식: 기존과 같은 <b>${ex.format === "docx" ? "Word" : "엑셀"}</b></span>` : '<span class="hint">출력 형식은 올린 파일을 따릅니다.</span>'}</label>
      ${state.link && ex ? `<div class="notice info" id="link-note">📁 '${esc(state.link.name)}' 폴더의 v${esc(state.link.label)}을 불러왔습니다. 확정하면 이 폴더에 다음 버전으로 저장됩니다.</div>` : ""}
      ${state.job === "갱신" && ex?.format === "xlsx" ? `<label class="field"><span>갱신할 시트 1개</span><select id="sheet">${ex.sheets.map(s => `<option ${s === state.sheet ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></label>` : ""}
      ${state.job === "추가" ? `<label class="field"><span>추가할 업무명</span><input type="text" id="task" value="${esc(state.task)}" placeholder="예: 자동재배분"></label>${duplicateWarning()}` : ""}`;
  return `
  <div class="page-head"><h1>자료 입력</h1>${modeBadge()}</div>
  <div class="stack">
    <div class="panel">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">예시 자료로 시작하기</h2><span class="hint">교육용 가상 자료 · PRD 8장 테스트와 같은 조합</span></div>
      <div class="row">${Object.entries(PRESETS).map(([k, v]) => `<button class="btn small" data-preset="${k}">${esc(v.label)}</button>`).join("")}<button class="btn small" id="clear-all">모두 비우기</button></div>
    </div>
    <div class="panel">
      <div class="field"><span>어떤 작업을 할까요?</span>
        <div class="choice">${Object.entries(JOB_LABEL).map(([j, l]) => `<label><input type="radio" name="job" value="${j}" ${state.job === j ? "checked" : ""}>${l}</label>`).join("")}</div></div>
      ${jobBox}
    </div>
    <div class="panel">
      <label class="field"><span>줄글 입력</span><textarea id="free-text" rows="8" placeholder="업무 내용을 직접 쓰거나 붙여넣으세요. 러프하게 적어도 됩니다.">${esc(state.text)}</textarea></label>
      <div class="grid2">
        <label class="drop"><span class="field"><span>메모·쿼리·엑셀</span></span><input type="file" id="up-docs" multiple accept=".txt,.sql,.xlsx"><span class="hint">.txt, .sql, .xlsx</span></label>
        <label class="drop"><span class="field"><span>캡처 이미지</span></span><input type="file" id="up-images" multiple accept="image/png,image/jpeg"><span class="hint">.png, .jpg (여러 장)</span></label>
      </div>
      ${fileRows ? `<div class="files">${fileRows}</div>` : ""}
      ${imgCards ? `<h3 style="margin:4px 0 0">이미지 정보</h3>${imgCards}` : ""}
    </div>
    ${L.length ? `<div class="notice warn" id="pii">🔒 개인정보로 보이는 값이 있어 진행을 멈췄습니다. 지우거나 가린 뒤 다시 넣어 주세요.<ul>${L.map(([s, k, v]) => `<li>${esc(s)}: ${k} <code>${esc(v)}</code></li>`).join("")}</ul></div>` : ""}
    ${state.error ? `<div class="notice warn">${esc(state.error)}</div>` : ""}
    ${state.busy ? busyPanel() : ""}
    <div class="row">
      <button class="btn primary" id="generate" ${p.length || state.busy ? "disabled" : ""}>초안 생성</button>
      ${p.length ? `<ul class="problems">${p.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    </div>
  </div>`;
}

function renderAsIs(d, locked) {
  const asis = d.asis; const ex = state.existing;
  if (d.job === "신규") return `
    <div class="stack"><h2>As-Is</h2>
      ${state.text.trim() ? `<div class="field"><span>줄글</span><div class="asis-text">${esc(state.text)}</div></div>` : ""}
      ${state.files.length ? `<div class="field"><span>원자료 목록</span><div class="files">${state.files.map(f => `<div class="file-row"><span class="kind">${f.kind === "이미지" ? f.imgType : f.kind}</span><span class="name">${esc(f.name)}${f.step ? ` · ${esc(f.step)}` : ""}</span></div>`).join("")}</div></div>` : ""}
      ${state.files.some(f => f.kind === "이미지") ? `<div class="thumbs">${state.files.filter(f => f.kind === "이미지").map(f => `<img src="${f.dataUrl}" alt="${esc(f.name)}" title="${esc(f.name)}">`).join("")}</div>` : ""}
    </div>`;
  const head = `<h2>As-Is</h2><p class="hint">기존 매뉴얼: ${esc(ex.name)}${d.job === "갱신" && d.format === "xlsx" ? ` &gt; ${esc(state.sheet)}` : ""}</p>`;
  if (d.job === "추가") {
    const rows = d.format === "docx"
      ? [...asis.sections.filter(s => s.level === 1).map(s => esc(`${s.no}. ${s.title}`)), `➕ <b>${d.chapterNo}. ${esc(d.task)}</b> ← 맨 뒤에 새 장으로 추가`]
      : [...asis.sheets.map(esc), `➕ <b>${esc(safeSheetName(d.task))}</b> ← 맨 뒤에 새 시트로 추가${asis.sheets.includes("목차") ? " ('목차' 시트에 한 줄 추가)" : ""}`];
    return `<div class="stack">${head}<div class="section"><b>${d.format === "docx" ? `${esc(asis.title)} · v${asis.version} — 장 목록` : "시트 목록"}</b><ul class="toc">${rows.map(r => `<li>${r}</li>`).join("")}</ul><span class="hint">기존 장·시트는 바뀌지 않습니다.</span></div></div>`;
  }
  return `<div class="stack">${head}<p><b>${esc(asis.title)}</b> · v${asis.version}${asis.history.length ? ` · 개정이력 ${asis.history.length}건` : ""}</p>
    ${d.format === "xlsx" ? '<p class="hint">ⓘ 엑셀의 텍스트 상자·말풍선(도형) 속 설명은 인식되지 않습니다.</p>' : ""}
    ${asis.sections.map(s => `<section class="section ${s.level > 1 ? "sub" : ""}"><div class="section-head"><h3>${esc(s.no)}. ${esc(s.title)}</h3></div><div class="md">${renderSectionBody(s.text, -1, false)}</div></section>`).join("")}</div>`;
}

function renderReview() {
  const d = state.draft;
  if (!d) return `<div class="page-head"><h1>검토·확정</h1>${modeBadge()}</div><div class="panel"><p class="empty">아직 초안이 없습니다. '자료 입력'에서 자료를 넣고 [초안 생성]을 눌러 주세요.</p></div>`;
  const locked = !!state.confirmed?.blob;
  const open = countOpen(d.sections);
  const unapplied = d.sections.filter(s => s.fb?.status === "미반영").length;
  const ch = changesOf(d);
  const tobe = d.sections.map((s, si) => { const c = ch?.result[s.no]; return `
    <section class="section ${s.level > 1 ? "sub" : ""}">
      <div class="section-head"><h3>${esc(s.no)}. ${esc(s.title)} ${c && c.status !== "동일" ? `<span class="chg ${c.status === "추가" ? "add" : "mod"}">${c.status}</span>` : ""}</h3>${s.fb ? `<span class="fb-state ${s.fb.status === "반영" ? "done" : "todo"}">${s.fb.status}</span>` : ""}</div>
      ${c?.status === "변경" ? `<details class="diff"><summary>바뀐 내용 보기</summary>${c.titleChanged ? `<p class="hint">제목: ${esc(c.oldTitle)} → ${esc(s.title)}</p>` : ""}<pre>${c.diff.map(l => `<span class="${l[0] === "+" ? "plus" : "minus"}">${esc(l)}</span>`).join("\n") || "(본문은 같음)"}</pre></details>` : ""}
      <div class="md">${renderSectionBody(s.text, si, !locked)}</div>
      ${locked ? "" : `
      <details class="fb" id="fb-${si}" ${state.openFb === si ? "open" : ""}>
        <summary>피드백·편집${s.fb?.comment ? ` — 마지막 피드백: ${esc(s.fb.comment)}` : ""}</summary>
        <div class="stack">
          <label class="field"><span>피드백</span><input type="text" id="fbc-${si}" placeholder="예: 검증 오류 코드별 조치를 추가해 주세요"></label>
          <label class="field"><span>본문 직접 편집</span><textarea id="fbt-${si}" rows="8">${esc(s.text)}</textarea></label>
          <div class="row"><button class="btn" data-apply="${si}">반영</button>${state.mode === "ai" ? `<button class="btn" data-ai="${si}" ${state.busy ? "disabled" : ""}>피드백으로 AI 재작성</button>` : ""}
            <span class="hint">${state.mode === "ai" ? "AI 재작성은 이 섹션만 다시 씁니다." : "모의 모드에서는 본문을 직접 고친 뒤 [반영]을 누릅니다. 본문을 안 고치면 '미반영'으로 남습니다."}</span></div>
        </div>
      </details>`}
    </section>`; }).join("") + (ch ? ch.deleted.map(x => `<section class="section ${x.level > 1 ? "sub" : ""}"><div class="section-head"><h3><s>${esc(x.no)}. ${esc(x.title)}</s> <span class="chg del">삭제</span></h3></div><p class="hint">As-Is에 있던 섹션이 To-Be에는 없습니다.</p></section>`).join("") : "");
  const confirmBox = locked ? `
    <div class="panel"><div class="notice ok">v${d.version} 확정 완료 — ${esc(state.confirmed.author)} (${esc(state.confirmed.at)}). Q&amp;A 검색 자료로 등록되었습니다.</div>
      ${state.confirmed.saved ? `<div class="notice info" id="save-status">📁 '${esc(state.confirmed.saved.name)}' 폴더에 v${esc(state.confirmed.saved.label)}로 저장했습니다.${state.confirmed.saved.withOriginal ? ` 처음 올린 원본도 v${esc(state.confirmed.saved.withOriginal)}로 함께 넣었습니다.` : ""} <button class="btn small" data-open-folder="${esc(state.confirmed.saved.folderId)}">폴더 보기</button></div>`
        : `<div class="notice warn" id="save-status">폴더에 저장하지 못했습니다. ${esc(state.confirmed.saveError)} 파일은 아래에서 내려받을 수 있습니다.</div>`}
      <div class="row"><button class="btn primary" id="download">${d.format === "docx" ? "매뉴얼 Word 내려받기" : "매뉴얼 엑셀 내려받기"}</button><span class="hint" id="dl-status">${esc(state.confirmed.filename)}</span></div>
      <div class="row"><button class="btn" id="restart">새 매뉴얼 만들기</button><button class="btn" data-page="qa">Q&amp;A로 가기</button></div></div>` : `
    <div class="panel"><h2>최종 컨펌</h2>
      ${open.check || open.capture ? `<div class="notice warn">아직 [확인 필요] ${open.check}곳, [캡처 필요] ${open.capture}곳이 남아 있습니다. 그대로 확정할 수도 있습니다. [확인 필요]는 최종 파일에 색으로 강조되고, [캡처 필요]는 회색 칸으로 남습니다.</div>` : ""}
      ${unapplied ? `<div class="notice warn">반영하지 않은 피드백이 ${unapplied}건 있습니다.</div>` : ""}
      <div class="grid2"><label class="field"><span>작성자 (필수)</span><input type="text" id="author" placeholder="예: 담당자A" value="${esc(state.author || "")}"></label>
        <label class="field"><span>검토자</span><input type="text" id="reviewer" placeholder="예: 파트장C" value="${esc(state.reviewer || "")}"></label></div>
      <label class="field"><span>개정내용</span><input type="text" id="summary" value="${esc(state.summary ?? defaultSummary())}"></label>
      ${versionChoice(d)}
      <div class="row"><button class="btn primary" id="confirm" ${(state.author || "").trim() && !state.busy ? "" : "disabled"}>최종 컨펌</button><span class="hint">작성자를 입력하면 누를 수 있습니다.</span></div></div>`;
  return `
  <div class="page-head"><h1>검토·확정</h1>${modeBadge()}</div>
  <div class="stack">
    <div><h2 style="font-size:19px">${esc(d.meta.title)}</h2>
      <div class="metrics">
        <div class="metric"><span>작업</span><b>${esc(d.job)}</b></div>
        <div class="metric"><span>버전</span><b>v${d.version} ${locked ? "확정" : "초안"}</b></div>
        <div class="metric ${open.check ? "warn" : ""}"><span>[확인 필요]</span><b>${open.check}</b></div>
        <div class="metric ${open.capture ? "warn" : ""}"><span>[캡처 필요]</span><b>${open.capture}</b></div>
      </div>
      <p class="hint">문장 끝의 [메모]·[SQL] 같은 출처 태그는 화면에서만 보이고 최종 파일에서는 빠집니다.</p></div>
    ${state.error ? `<div class="notice warn">${esc(state.error)}</div>` : ""}
    ${state.busy ? busyPanel() : ""}
    <div class="compare">${renderAsIs(d, locked)}<div class="stack"><h2>To-Be</h2>${ch ? `<p class="hint">As-Is와 같은 섹션 번호끼리 비교: 변경 ${Object.values(ch.result).filter(r => r.status === "변경").length} · 추가 ${Object.values(ch.result).filter(r => r.status === "추가").length} · 삭제 ${ch.deleted.length}</p>` : ""}${d.job === "추가" && d.format === "docx" ? `<p class="hint">Word 파일에서는 ${d.chapterNo}장으로 붙고, 소제목은 ${d.chapterNo}-1 ~ ${d.chapterNo}-6, 처리절차 단계는 ${d.chapterNo}-4-1처럼 달립니다.</p>` : ""}${tobe}</div></div>
    ${confirmBox}
  </div>`;
}
function versionChoice(d) {
  const p = d.plan || {};
  const where = !p.store ? `<p class="hint">폴더 저장소를 쓸 수 없어 이번 확정본은 폴더에 저장되지 않습니다(내려받기는 됩니다). ${esc(storeErrorText(storeReason))}</p>`
    : p.folderId ? `<p class="hint">저장 위치: 📁 '${esc(p.name)}' 폴더 (지금 최신 v${esc(p.base)})</p>`
    : d.job === "신규" ? `<p class="hint">저장 위치: 📁 새 폴더 '${esc(p.name)}' — 첫 버전 v1</p>`
    : `<p class="hint">저장 위치: 📁 새 폴더 '${esc(p.name)}' — 처음 올린 원본을 v${esc(p.origLabel)}로 먼저 넣고, 이번 확정본을 그다음 버전으로 넣습니다.</p>`;
  if (d.job === "신규") return `<div class="field"><span>버전</span><b>v1 (최초 작성)</b>${where}</div>`;
  return `<div class="field"><span>버전 번호</span>
    <div class="choice">${[["minor", "작은 수정"], ["major", "큰 개정"]].map(([k, l]) => `<label><input type="radio" name="verKind" value="${k}" ${state.verKind === k ? "checked" : ""}>${l} → v${esc(nextLabel(p.base, k))}</label>`).join("")}</div>
    <p class="hint">문구·수치 보완은 작은 수정(+0.1), 규정·절차가 크게 바뀌면 큰 개정(다음 정수). 파일 이름, 표지, 개정이력의 버전도 같은 번호로 들어갑니다.</p>${where}</div>`;
}
function defaultSummary() {
  const d = state.draft; const applied = d.sections.filter(s => s.fb?.status === "반영").map(s => s.no);
  const ch = changesOf(d); const changed = ch ? changeSummary(ch) : "";
  const base = d.job === "추가" ? (d.format === "docx" ? `${d.chapterNo}장 '${d.task}' 추가` : `'${d.task}' 시트 추가`) : d.job === "신규" ? "최초 작성" : changed ? `개정 (${changed})` : "개정";
  return applied.length ? `${base} (${applied.join(", ")} 피드백 반영)` : base;
}

function renderQa() {
  const targets = latestOnly();
  const head = `<div class="page-head"><h1>매뉴얼 Q&amp;A</h1>${modeBadge()}</div>`;
  if (!targets.length) return head + `<div class="panel"><p class="empty">아직 검색할 매뉴얼이 없습니다. 매뉴얼을 확정하거나, 기존 매뉴얼을 올려 초안을 만들면 여기서 검색됩니다. 매뉴얼 폴더에 저장된 매뉴얼은 각 폴더의 최신 버전이 검색됩니다.</p></div>`;
  const r = state.qa;
  return head + `<div class="stack">
    <details class="panel"><summary>검색 대상 매뉴얼 ${targets.length}건 (같은 업무는 최신 확정본만)</summary>
      <div class="files">${targets.map(e => `<div class="file-row"><span class="kind">${e.origin === "업로드" ? "업로드본" : e.origin === "폴더" ? "폴더 최신" : "확정본"}</span><span class="name">${esc(e.task)} · v${e.version}${e.sheet ? ` · ${esc(e.file)} &gt; ${esc(e.sheet)}` : e.origin === "업로드" ? ` · ${esc(e.file)}` : ""}</span></div>`).join("")}</div></details>
    <form class="panel" id="qa-form"><label class="field"><span>질문</span><input type="text" id="question" placeholder="예: 펀드변경 무료로 몇 번까지 돼?" value="${esc(r?.question || "")}"></label>
      <div class="row"><button class="btn primary" type="submit">질문하기</button><span class="hint">모의 모드: 질문 단어가 가장 많이 들어 있는 섹션의 원문을 보여 줍니다.</span></div></form>
    ${r ? `<div class="panel"><b>Q. ${esc(r.question)}</b>
      <div class="notice ${r.status === "답변" ? "ok" : "warn"}" id="qa-answer">${r.status === "답변" ? r.lines.map(l => inline(tidy(l))).join("<br>") : esc(r.answer)}</div>
      ${r.status === "확인 필요" ? r.lines.map(l => `<p>› ${inline(tidy(l))}</p>`).join("") : ""}
      ${r.hits.length ? `<div class="field"><span>근거</span><ol class="evidence">${r.hits.map(h => `<li>${esc(h.label)}${h.best?.[0] ? `<br><span class="hint">↳ ${inline(tidy(h.best[0]))}</span>` : ""}</li>`).join("")}</ol></div>` : ""}</div>` : ""}
  </div>`;
}


// ---------- 5. 매뉴얼 폴더 ----------
async function refreshFolderLatest() {
  // Q&A용: 폴더마다 최신 버전의 섹션
  const store = await getStore(); if (!store || !state.folders) { state.folderLatest = []; return; }
  const out = [];
  for (const f of state.folders) {
    const v = [...f.versions].sort((a, b) => vcmp(a.label, b.label)).pop(); if (!v) continue;
    try { out.push({ task: f.task || taskLabel(f.name), title: f.name, version: v.label, origin: "폴더", file: v.fileName, sheet: v.sheet || null, sections: await store.sections(f, v), at: Date.parse(v.at) || 0 }); } catch { /* 읽지 못한 폴더는 건너뛴다 */ }
  }
  state.folderLatest = out;
}
async function refreshFolders() {
  const store = await getStore();
  if (!store) { state.folders = null; state.folderMsg = storeErrorText(storeReason); return; }
  try { state.folders = await store.list(); state.folderMsg = ""; await refreshFolderLatest(); }
  catch (e) { state.folderMsg = storeErrorText(e.code); }
}
const shortDate = iso => { const d = new Date(iso); return isNaN(d) ? "" : `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const sortedVersions = f => [...f.versions].sort((a, b) => vcmp(b.label, a.label));
function renderCompare(cmp) {
  const { a, b, result } = cmp; const r = result.result;
  const count = k => Object.values(r).filter(x => x.status === k).length;
  return `<div class="panel" id="compare"><h2>v${esc(a.label)} → v${esc(b.label)} 비교</h2>
    <p class="hint">같은 섹션 번호끼리 비교: 변경 ${count("변경")} · 추가 ${count("추가")} · 삭제 ${result.deleted.length} · 같음 ${count("동일")}</p>
    ${Object.entries(r).map(([no, x]) => { const s = cmp.sections.find(y => y.no === no); return `<section class="section ${s.level > 1 ? "sub" : ""}"><div class="section-head"><h3>${esc(no)}. ${esc(s.title)} ${x.status === "동일" ? '<span class="hint">같음</span>' : `<span class="chg ${x.status === "추가" ? "add" : "mod"}">${x.status}</span>`}</h3></div>
      ${x.status === "변경" ? `${x.titleChanged ? `<p class="hint">제목: ${esc(x.oldTitle)} → ${esc(s.title)}</p>` : ""}<details class="diff" open><summary>바뀐 내용</summary><pre>${x.diff.map(l => `<span class="${l[0] === "+" ? "plus" : "minus"}">${esc(l)}</span>`).join("\n") || "(본문은 같음)"}</pre></details>` : ""}</section>`; }).join("")}
    ${result.deleted.map(x => `<section class="section ${x.level > 1 ? "sub" : ""}"><div class="section-head"><h3><s>${esc(x.no)}. ${esc(x.title)}</s> <span class="chg del">삭제</span></h3></div></section>`).join("")}
    ${!Object.keys(r).length && !result.deleted.length ? '<p class="empty">비교할 섹션이 없습니다(엑셀 업무 추가처럼 섹션이 저장되지 않은 버전).</p>' : ""}
  </div>`;
}
function renderFolders() {
  const head = `<div class="page-head"><h1>매뉴얼 폴더</h1>${modeBadge()}</div>`;
  const fv = state.folderView;
  if (state.folders === null) return head + `<div class="panel">${state.folderMsg ? `<div class="notice warn">${esc(state.folderMsg)}</div>` : '<p class="empty">폴더를 불러오는 중…</p>'}</div>`;
  const intro = `<p class="hint">확정한 매뉴얼이 업무별 폴더에 버전으로 쌓입니다. 처음 만든(또는 처음 올린) 파일이 v1, 이후 수정은 v1.1, v1.2…, 큰 개정은 v2입니다. ${PLATFORM === "vercel" ? "이 사이트를 여는 모든 사람이 같은 폴더를 봅니다." : "이 아티팩트를 여는 사람이 같은 폴더를 봅니다."}</p>`;
  if (!state.folders.length) return head + `<div class="stack">${intro}${state.folderMsg ? `<div class="notice warn">${esc(state.folderMsg)}</div>` : ""}<div class="panel"><p class="empty">아직 저장된 폴더가 없습니다. 매뉴얼을 확정하면 여기에 폴더가 생깁니다.</p></div></div>`;
  const folders = [...state.folders].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const cur = folders.find(f => f.id === fv.id) || null;
  const list = `<div class="files">${folders.map(f => { const latest = maxLabel(f.versions.map(v => v.label)); return `<div class="file-row folder-row ${cur?.id === f.id ? "on" : ""}"><span class="kind">${f.format === "xlsx" ? "엑셀" : "Word"}</span><span class="name">📁 <b>${esc(f.name)}</b> · 최신 v${esc(latest)} · ${f.versions.length}개 버전 · ${esc(shortDate(f.updatedAt))}</span><button class="btn small" data-open-folder="${esc(f.id)}">${cur?.id === f.id ? "열림" : "열기"}</button></div>`; }).join("")}</div>`;
  let detail = "";
  if (cur) {
    const rows = sortedVersions(cur).map(v => {
      const confirming = fv.confirm === `v:${v.label}`;
      return `<tr><td><input type="checkbox" aria-label="v${esc(v.label)} 비교에 넣기" data-pick="${esc(v.label)}" ${fv.pick.includes(v.label) ? "checked" : ""}></td>
        <td><b>v${esc(v.label)}</b></td><td>${esc(shortDate(v.at))}</td><td>${esc(v.summary || "")}</td><td>${esc([v.author, v.reviewer].filter(Boolean).join(" / "))}</td><td>${esc(v.origin || "")}</td>
        <td class="acts">${confirming ? `<span class="hint">v${esc(v.label)}을 지울까요?</span> <button class="btn small danger" data-del-version="${esc(v.label)}">삭제</button> <button class="btn small" data-cancel-del>취소</button>`
          : `<button class="btn small" data-dl-version="${esc(v.label)}">내려받기</button> <button class="btn small" data-edit-version="${esc(v.label)}">이 버전으로 수정</button> <button class="btn small" data-ask-del="v:${esc(v.label)}">삭제</button>`}</td></tr>`;
    }).join("");
    detail = `<div class="panel" id="folder-detail"><div class="row" style="justify-content:space-between"><h2 style="margin:0">📁 ${esc(cur.name)}</h2>
        ${fv.confirm === "folder" ? `<span><span class="hint">폴더와 모든 버전을 지울까요? 되돌릴 수 없습니다.</span> <button class="btn small danger" id="del-folder">폴더 삭제</button> <button class="btn small" data-cancel-del>취소</button></span>` : `<button class="btn small" data-ask-del="folder">폴더 삭제</button>`}</div>
      <p class="hint">업무: ${esc(cur.task || "-")} · 형식: ${cur.format === "xlsx" ? "엑셀" : "Word"} · 만든 날: ${esc(shortDate(cur.createdAt))}</p>
      <div class="md"><div class="table-wrap"><table class="versions"><tr><th>비교</th><th>버전</th><th>저장 시각</th><th>개정내용</th><th>작성/검토</th><th>출처</th><th></th></tr>${rows}</table></div></div>
      <div class="row"><button class="btn" id="compare-btn" ${fv.pick.length === 2 ? "" : "disabled"}>고른 두 버전 비교</button><span class="hint">비교할 버전 2개에 체크하세요. '이 버전으로 수정'은 그 파일을 기존 매뉴얼로 불러와 갱신 작업을 시작합니다.</span><span class="hint" id="folder-status">${esc(fv.status || "")}</span></div></div>
      ${fv.compare && fv.compare.folderId === cur.id ? renderCompare(fv.compare) : ""}`;
  }
  return head + `<div class="stack">${intro}${state.folderMsg ? `<div class="notice warn">${esc(state.folderMsg)}</div>` : ""}<div class="panel"><div class="row" style="justify-content:space-between"><h2 style="margin:0">폴더 ${folders.length}개</h2><button class="btn small" id="reload-folders">새로고침</button></div>${list}</div>${detail}</div>`;
}
const curFolder = () => state.folders?.find(f => f.id === state.folderView.id);
async function folderFile(label) {
  const f = curFolder(); const v = f.versions.find(x => x.label === label);
  return { f, v, buffer: await (await getStore()).file(f, v) };
}
async function openFolderPage(id) {
  state.page = "folders"; state.error = "";
  if (id) state.folderView = { id, pick: [], confirm: null, compare: null };
  render(); await refreshFolders(); render();
}

// ---------- 4. 작성 가이드 ----------
const GUIDE_EXAMPLE = [
  ["업무흐름도.png", "업무흐름도", "3", "펀드변경 업무 전체 흐름"],
  ["캡처1_신청화면.png", "전산화면", "4-3", "펀드변경 신청 화면 — 변경비율 입력"],
  ["캡처2_오류화면.png", "전산화면", "4-3", "검증 오류 예시 (E-102 / E-103 / E-105)"],
  ["캡처3_엑셀체크리스트.png", "엑셀", "4-4", "체크리스트 판정 결과 — '반려/보완' 필터"],
  ["캡처4_쿼리결과.png", "쿼리결과", "4-4", "반영 확인 쿼리 결과 — 비율 합계 100%"],
];
async function fillGuideExample() {
  await loadPreset("fund");
  state.format = null;  // 형식은 기본값 없이 직접 고른다
  for (const [name, type, step, caption] of GUIDE_EXAMPLE) {
    const f = state.files.find(x => x.name === name);
    if (f) Object.assign(f, { imgType: type, step, caption });
  }
  state.page = "input";
}
function renderGuide() {
  const table = (head, rows) => `<div class="table-wrap"><table><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></div>`;
  return `
  <div class="page-head"><h1>작성 가이드</h1>${modeBadge()}</div>
  <div class="stack guide md">
    <div class="panel">
      <p class="lead">자료를 어떻게 넣으면 초안이 잘 나오는지 정리했습니다. 원칙은 하나입니다. <b>적힌 것만 매뉴얼이 됩니다.</b> 빠진 내용은 지어내지 않고 <span class="check">[확인 필요]</span>로 남고, 화면 조작인데 캡처가 없으면 [캡처 필요] 자리가 생깁니다.</p>
      <div class="toc-links"><a href="#g-fields">① 항목별 입력값</a><a href="#g-text">② 줄글 쓰는 법</a><a href="#g-images">③ 이미지 여러 장 넣기</a><a href="#g-captions">④ 이미지 한 줄 설명</a><a href="#g-example">⑤ 예시로 따라 하기</a><a href="#g-check">⑥ 초안 생성 전 점검</a></div>
    </div>

    <section class="panel" id="g-fields"><h2>① 항목별 입력값</h2>
      ${table(["항목", "넣는 값", "예시", "주의"], [
        ["작업 선택", "새로 만들면 <b>신규 작성</b>, 있는 매뉴얼의 내용을 바꾸면 <b>갱신</b>, 있는 매뉴얼에 다른 업무를 붙이면 <b>업무 추가</b>", "규정이 바뀜 → 갱신", "갱신·추가는 출력 형식을 묻지 않고 올린 파일 형식을 따릅니다."],
        ["출력 형식 (신규만)", "Word 또는 엑셀", "부서가 엑셀 매뉴얼을 쓰면 엑셀", "기본값이 없습니다. 고르기 전에는 [초안 생성]이 꺼져 있습니다."],
        ["기존 매뉴얼 (갱신·추가)", ".docx 또는 .xlsx 파일 1개", "가상_업무매뉴얼_v1.xlsx", "엑셀 갱신은 바꿀 시트 1개만 고릅니다. 다른 시트는 그대로 남습니다."],
        ["추가할 업무명 (추가만)", "새 장·새 시트의 이름이 될 업무명", "자동재배분", "같은 이름의 장·시트가 있으면 경고가 뜹니다. 짧고 다른 것과 겹치지 않게."],
        ["줄글 입력", "업무 내용을 말하듯 적은 글. 메모를 붙여넣어도 됩니다.", "② 참고", "주민번호·전화번호·계좌번호는 넣지 마세요. 감지되면 진행이 멈춥니다."],
        ["메모·쿼리·엑셀 파일", ".txt 메모, .sql 쿼리, .xlsx 양식", "memo_펀드변경.txt, 가상_펀드변경조회.sql", "쿼리는 그대로 '6. 관련 양식·쿼리'에 회색 박스로 들어갑니다."],
        ["캡처 이미지", ".png/.jpg 여러 장", "③ 참고", "실제 고객 화면이 아닌 가상 데이터 화면만 씁니다. 이미지 속 글자는 개인정보 검사를 하지 않습니다."],
        ["이미지별 종류", "전산화면 / 엑셀 / 쿼리결과 / 업무흐름도", "캡처4_쿼리결과.png → 쿼리결과", "파일명에 '흐름도·쿼리·엑셀'이 있으면 미리 골라집니다. 맞는지만 확인하세요."],
        ["이미지별 배치할 단계", "매뉴얼 섹션 번호", "4-3, 4-4, 3", "비우면 초안이 정한 자리, 그래도 없으면 '6. 관련 양식·쿼리' 끝에 모입니다."],
        ["이미지별 한 줄 설명", "그림 아래 캡션이 되는 문장", "④ 참고", "비우면 초안의 설명이나 파일명이 들어갑니다."],
      ])}
    </section>

    <section class="panel" id="g-text"><h2>② 줄글 쓰는 법</h2>
      <p>순서가 섞여도, 약어를 써도 괜찮습니다. 아래 다섯 가지가 들어 있으면 섹션이 빈칸 없이 채워집니다.</p>
      ${table(["넣을 내용", "들어가는 섹션", "예시 문장"], [
        ["무슨 업무인지, 누가 어디로 신청하는지", "1. 업무개요", "계약자가 창구·콜센터로 신청하면 적립금을 다른 펀드로 옮김"],
        ["기준·한도·수수료·오류코드 (숫자는 정확히)", "2. 관련규정", "연 12회 무료, 13회차부터 건당 2,000원 / 비율 합계 100% 아니면 E-102"],
        ["처리 순서와 화면 경로", "3. 업무흐름도, 4. 처리절차", "계약조회 → 변액 탭 → 펀드변경 신청 → 비율 입력 → 검증 → 저장"],
        ["자주 하는 실수, 예외, 고객 안내", "5. 유의사항·예외", "판매중지 펀드는 선택 불가. 같은 날 두 번 신청하면 마지막 건만 유효"],
        ["쓰는 엑셀 양식, 조회 쿼리 이름", "6. 관련 양식·쿼리", "처리 후 체크리스트 엑셀에 기록, 다음 날 쿼리 ③으로 반영 확인"],
      ])}
      <div class="cols">
        <div class="eg good"><b>잘 나오는 줄글</b><pre>펀드변경: 창구/콜센터 접수. 연 12회 무료, 13회부터 2,000원(적립금 차감).
계약조회 → 변액 탭 → 펀드변경 신청에서 비율 입력 후 [검증] → [저장]. 검증 전 저장 금지.
비율 합계 100% 아니면 E-102, 10% 단위 아니면 E-103, 판매중지 펀드 E-105.
기준가는 신청일 +2영업일. 다음 날 쿼리로 반영 확인.</pre></div>
        <div class="eg bad"><b>[확인 필요]가 많이 남는 줄글</b><pre>펀드 바꿔주는 업무. 화면에서 입력하고 저장하면 됨.
수수료 있음. 오류 나면 고치면 됨.</pre><p class="hint">몇 회부터, 얼마인지, 어떤 화면인지, 어떤 오류인지가 없어서 모두 [확인 필요]가 됩니다.</p></div>
      </div>
      <ul><li>모르는 내용은 비워 두세요. 추측해서 쓰면 그대로 매뉴얼이 됩니다.</li>
        <li>바뀐 규정만 있으면 갱신 작업에서 짧은 공지(예: memo_펀드변경_v2.txt)만 넣어도 됩니다.</li></ul>
    </section>

    <section class="panel" id="g-images"><h2>③ 이미지 여러 장 넣기</h2>
      <ol>
        <li><b>한 장에 한 장면.</b> 신청 화면, 오류 화면, 결과 화면을 따로 캡처합니다. 한 장에 여러 단계를 담으면 어디에 둘지 정하기 어렵습니다.</li>
        <li><b>파일명에 순서와 내용을 넣습니다.</b> <code>캡처1_신청화면.png</code>, <code>캡처2_오류화면.png</code>처럼 쓰면 목록에서 찾기 쉽고, '흐름도·쿼리·엑셀'이 들어가면 종류가 자동으로 골라집니다.</li>
        <li><b>한 번에 여러 장을 고릅니다.</b> 파일 선택 창에서 Ctrl(맥은 ⌘)을 누른 채 여러 장을 선택하면 이미지마다 입력 칸이 생깁니다. 같은 이름을 다시 올리면 바뀐 파일로 교체됩니다.</li>
        <li><b>배치할 단계를 적습니다.</b> 그 화면을 쓰는 절차 번호(예: 4-3)를 넣습니다. 초안에 그 그림의 자리가 이미 있으면 그 자리에, 없으면 <b>올린 순서대로</b> 그 섹션 끝에 붙습니다. 같은 단계에 여러 장이면 보여 줄 순서대로 올리세요.</li>
        <li><b>흐름도는 '3'</b>(업무흐름도 섹션), 쿼리 결과·엑셀 체크리스트는 그것을 확인하는 단계(예: 4-4)에 둡니다.</li>
        <li><b>캡처가 없어도 됩니다.</b> 초안에 [캡처 필요] 자리가 생기고, 검토 화면에서 그 자리에 바로 올릴 수 있습니다.</li>
      </ol>
      ${table(["상황", "이렇게 넣으세요"], [
        ["한 단계에 화면이 2장 (입력 → 오류)", "둘 다 단계 4-3, 입력 화면을 먼저 올리기"],
        ["어느 단계인지 모르는 캡처", "단계를 비우기 → 초안 자리 또는 '6. 관련 양식·쿼리' 끝에 모입니다. 검토 화면에서 확인 후 옮기기"],
        ["다른 업무의 캡처가 섞임", "빼기 버튼으로 제외 (그대로 두면 6장 끝에 붙습니다)"],
      ])}
    </section>

    <section class="panel" id="g-captions"><h2>④ 이미지 한 줄 설명 쓰는 법</h2>
      <p>그림 아래 <b>[그림] 캡션</b>으로 들어가고, Q&amp;A 검색에도 쓰입니다. <b>"무슨 화면 — 무엇을 보면 되는지"</b> 형태로 15~40자 정도가 좋습니다.</p>
      <div class="cols">
        <div class="eg good"><b>좋은 예</b><pre>펀드변경 신청 화면 — 변경비율 입력
검증 오류 예시 (E-102 / E-103 / E-105)
체크리스트 판정 결과 — '반려/보완' 필터
반영 확인 쿼리 결과 — 비율 합계 100%</pre></div>
        <div class="eg bad"><b>피할 예</b><pre>화면1
캡처
여기 보세요
고객 실명·계좌번호가 보이는 신청 화면</pre><p class="hint">무엇을 보는지 알 수 없거나, 개인정보가 들어 있습니다.</p></div>
      </div>
      <ul><li>화면 이름은 시스템 메뉴 이름 그대로 씁니다(예: [펀드변경 신청]).</li>
        <li>오류 화면은 오류 코드를 함께 적으면 Q&amp;A에서 코드로 찾을 수 있습니다.</li>
        <li>엑셀 매뉴얼로 내보내면 한 줄 설명은 그림 오른쪽 K열에 "← 설명"으로 들어갑니다.</li></ul>
    </section>

    <section class="panel" id="g-example"><h2>⑤ 예시로 따라 하기 (펀드변경 원자료)</h2>
      ${table(["파일", "종류", "배치할 단계", "한 줄 설명"], GUIDE_EXAMPLE.map(([n, t, s, c]) => [`<code>${esc(n)}</code>`, t, s, esc(c)]))}
      <p class="hint">메모·쿼리·엑셀 파일(memo_펀드변경.txt, 가상_펀드변경조회.sql, 펀드변경_처리.xlsx)도 함께 들어갑니다. 출력 형식은 직접 고르세요.</p>
      <div class="row"><button class="btn primary" id="guide-fill">이 예시대로 자료 입력 채우기</button></div>
    </section>

    <section class="panel" id="g-check"><h2>⑥ 초안 생성 전 점검</h2>
      <ul>
        <li>작업과 출력 형식(신규) 또는 기존 매뉴얼·시트(갱신)·업무명(추가)을 정했나요?</li>
        <li>줄글에 기준 숫자, 화면 경로, 예외가 들어 있나요?</li>
        <li>이미지마다 종류·배치할 단계·한 줄 설명을 확인했나요?</li>
        <li>다른 업무의 캡처나 개인정보가 섞이지 않았나요?</li>
        <li>초안이 나오면 [확인 필요]·[캡처 필요] 개수를 보고, 섹션별 피드백으로 채운 뒤 확정합니다.</li>
        <li>갱신이면 To-Be의 <span class="chg mod">변경</span> <span class="chg add">추가</span> <span class="chg del">삭제</span> 배지와 '바뀐 내용 보기'로 달라진 곳을 확인합니다.</li>
      </ul>
    </section>
  </div>`;
}

function render() {
  const main = $("#main"); const scroll = window.scrollY;
  main.innerHTML = state.page === "input" ? renderInput() : state.page === "review" ? renderReview() : state.page === "guide" ? renderGuide() : state.page === "folders" ? renderFolders() : state.page === "examples" ? renderExamples() : renderQa();
  document.querySelectorAll(".step-btn").forEach(b => { b.removeAttribute("aria-current"); if (b.dataset.page === state.page) b.setAttribute("aria-current", "page"); });
  document.querySelectorAll(".seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode)));
  $("#mode-help").textContent = state.mode === "ai"
    ? (PLATFORM === "vercel" ? "서버에 연결된 AI 모델(OpenRouter)이 초안 작성과 섹션 재작성을 합니다. Q&A는 모의 방식으로 답합니다."
      : "보는 사람의 claude.ai 계정으로 Claude가 초안 작성과 섹션 재작성을 합니다. API 키는 필요 없습니다. Q&A는 모의 방식으로 답합니다.")
    : "미리 만든 예시 초안으로 동작합니다. 줄글이나 추가 업무명에 '자동재배분'이 있으면 자동재배분 예시를 씁니다.";
  window.scrollTo(0, scroll);
}

// ---------- 파일·예시 ----------
const readText = f => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsText(f); });
const readDataUrl = f => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
const readBuffer = f => f.arrayBuffer();
async function addRawFile(name, { text = null, dataUrl = null, buffer = null } = {}) {
  state.files = state.files.filter(x => x.name !== name);
  if (isImage(name)) { state.files.push({ id: nextId++, name, kind: "이미지", dataUrl, imgType: guessImageType(name), step: "", caption: "" }); return; }
  if (/\.xlsx$/i.test(name)) {
    let summary = "", lk = [];
    try { const t = await officeText(name, buffer); lk = scanText(t); summary = t.slice(0, 4000); } catch { /* 읽지 못하면 파일명만 */ }
    state.files.push({ id: nextId++, name, kind: "엑셀", text: summary, leaks: lk }); return;
  }
  state.files.push({ id: nextId++, name, kind: /\.sql$/i.test(name) ? "쿼리" : "메모", text, leaks: scanText(text) });
}
async function setExisting(name, buffer) {
  const format = /\.xlsx$/i.test(name) ? "xlsx" : "docx";
  const ex = { name, buffer, format, leaks: [] };
  try {
    ex.leaks = scanText(await officeText(name, buffer));
    if (format === "xlsx") { ex.sheets = await xlsxSheetNames(buffer); state.sheet = ex.sheets.includes(state.sheet) ? state.sheet : ex.sheets[0]; }
    else ex.chapters = (await parseDocx(buffer, "chk_")).sections.filter(s => s.level === 1).map(s => s.title);
  } catch (e) { state.error = `기존 매뉴얼을 읽지 못했습니다: ${e.message || e}`; return; }
  state.existing = ex;
}
const b64Buffer = b64 => dataUrlBytes("data:;base64," + b64).buffer;
const sampleImages = names => names.map(n => DATA.samples.images.find(i => i.name === n));
const PRESETS = {
  fund: { label: "신규: 펀드변경 원자료", job: "신규", format: "docx" },
  auto: { label: "신규: 자동재배분 러프 메모", job: "신규", format: "docx", text: "autoMemo" },
  updWord: { label: "갱신: 기존 Word v1 + 규정 변경 메모", job: "갱신", existing: "wordV1", memoV2: true },
  updMemoV2: { label: "갱신: 확정본 v2 + 규정 변경 공지 (변경 강조 시연)", job: "갱신", existing: "wordV2", memoV2: true },
  updExcel: { label: "갱신: 기존 엑셀 v1 '펀드변경' 시트", job: "갱신", existing: "excelV1", sheet: "펀드변경", memoV2: true, captures: true },
  addWord: { label: "추가: Word 1~6장 + 변액 자동재배분", job: "추가", existing: "wordV2", task: "변액 자동재배분", text: "autoMemo" },
  addExcel: { label: "추가: 엑셀 v1 + 자동재배분 시트", job: "추가", existing: "excelV1", task: "자동재배분", text: "autoMemo" },
};
async function loadPreset(key) {
  const p = PRESETS[key]; const s = DATA.samples;
  Object.assign(state, { job: p.job, format: p.format || null, text: p.text ? s[p.text] : "", task: p.task || "", files: [], existing: null, sheet: p.sheet || null, error: "", link: null, exConfirm: null });
  if (key === "fund") {
    await addRawFile(s.memo.name, { text: s.memo.text }); await addRawFile(s.sql.name, { text: s.sql.text });
    state.files.push({ id: nextId++, name: s.xlsx.name, kind: "엑셀", text: s.xlsx.text, leaks: [] });
  }
  if (p.memoV2) await addRawFile(s.memoV2.name, { text: s.memoV2.text });
  if (key === "fund" || p.captures) for (const im of s.images) await addRawFile(im.name, { dataUrl: im.dataUrl });
  if (p.existing) { const f = DATA.existing[p.existing]; await setExisting(f.name, b64Buffer(f.b64)); if (p.sheet) state.sheet = p.sheet; }
}

// ---------- 이벤트 ----------
document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t || t.form) return;  // 폼 안의 버튼(Q&A 질문)은 submit에서 처리
  if (t.dataset.page === "folders") { await openFolderPage(); return; }
  if (t.dataset.page === "qa") { state.page = "qa"; state.error = ""; render(); await refreshFolders(); render(); return; }
  if (t.dataset.page) { state.page = t.dataset.page; state.error = ""; render(); return; }
  if (t.dataset.openFolder) { await openFolderPage(t.dataset.openFolder); return; }
  if (t.id === "reload-folders") { await refreshFolders(); render(); return; }
  if (t.dataset.askDel) { state.folderView.confirm = t.dataset.askDel; render(); return; }
  if (t.dataset.cancelDel !== undefined) { state.folderView.confirm = null; render(); return; }
  if (t.dataset.delVersion || t.id === "del-folder") {
    const f = curFolder(); const store = await getStore(); const fv = state.folderView;
    try {
      state.folders = t.id === "del-folder" ? await store.deleteFolder(f) : await store.deleteVersion(f, t.dataset.delVersion);
      fv.status = t.id === "del-folder" ? "" : `v${t.dataset.delVersion}을 삭제했습니다.`;
      if (t.id === "del-folder" || !state.folders.some(x => x.id === f.id)) state.folderView = { id: null, pick: [], confirm: null, compare: null };
      else { fv.confirm = null; fv.pick = fv.pick.filter(l => l !== t.dataset.delVersion); fv.compare = null; }
      if (state.link?.folderId === f.id && (t.id === "del-folder" || state.link.label === t.dataset.delVersion)) state.link = null;
      await refreshFolderLatest();
    } catch (err) { state.folderMsg = storeErrorText(err.code); }
    render(); return;
  }
  if (t.dataset.dlVersion) {
    const st = $("#folder-status");
    try {
      st.textContent = "파일을 불러오는 중…";
      const { v, buffer } = await folderFile(t.dataset.dlVersion);
      const dl = await getCap("downloads");
      if (!dl) { st.textContent = "이 화면에서는 파일 내려받기를 쓸 수 없습니다."; return; }
      st.textContent = "저장 확인 창을 확인해 주세요.";
      await dl.save({ filename: v.fileName, data: new Blob([buffer]) });
      st.textContent = `${v.fileName} 저장을 요청했습니다.`;
    } catch (err) { st.textContent = err?.code === "declined" ? "저장을 취소했습니다." : storeErrorText(err?.code); }
    return;
  }
  if (t.dataset.editVersion) {
    const st = $("#folder-status");
    try {
      st.textContent = "파일을 불러오는 중…";
      const { f, v, buffer } = await folderFile(t.dataset.editVersion);
      Object.assign(state, { job: "갱신", format: null, text: "", task: "", files: [], existing: null, sheet: null, error: "", draft: null, confirmed: null });
      await setExisting(v.fileName, buffer);
      if (f.format === "xlsx" && v.sheet && state.existing?.sheets?.includes(v.sheet)) state.sheet = v.sheet;
      state.link = { folderId: f.id, label: v.label, name: f.name };
      state.page = "input"; render(); window.scrollTo(0, 0);
    } catch (err) { st.textContent = storeErrorText(err?.code); }
    return;
  }
  if (t.id === "compare-btn") {
    const f = curFolder(); const store = await getStore(); const fv = state.folderView;
    const [a, b] = fv.pick.map(l => f.versions.find(v => v.label === l)).sort((x, y) => vcmp(x.label, y.label));
    try {
      const [sa, sb] = [await store.sections(f, a), await store.sections(f, b)];
      fv.compare = { folderId: f.id, a, b, sections: sb, result: compareSections(sa, sb) };
    } catch (err) { fv.status = storeErrorText(err?.code); }
    render(); $("#compare")?.scrollIntoView({ block: "start" }); return;
  }
  if (t.dataset.mode) { state.mode = t.dataset.mode; state.error = ""; render(); return; }
  if (t.dataset.preset) { await loadPreset(t.dataset.preset); render(); return; }
  if (t.id === "guide-fill") { await fillGuideExample(); render(); window.scrollTo(0, 0); return; }
  if (t.id === "clear-all") { Object.assign(state, { files: [], text: "", task: "", format: null, existing: null, sheet: null, error: "", link: null, exConfirm: null }); render(); return; }
  if (t.dataset.remove) { state.files = state.files.filter(f => f.id !== Number(t.dataset.remove)); render(); return; }
  if (t.id === "generate") { await generate(); return; }
  if (t.dataset.apply !== undefined) {
    const si = Number(t.dataset.apply); const s = state.draft.sections[si];
    const comment = $(`#fbc-${si}`).value.trim(); const edited = $(`#fbt-${si}`).value.replace(/^\n+|\n+$/g, "");
    const lk = scanText(`${comment}\n${edited}`);
    if (lk.length) { state.error = "개인정보로 보이는 값이 있어 반영하지 않았습니다: " + lk.map(([k, v]) => `${k} ${v}`).join(", "); state.openFb = si; render(); return; }
    const changed = edited.trim() !== s.text.trim();
    if (!changed && !comment) return;
    if (changed) s.text = edited;
    s.fb = { status: changed ? "반영" : "미반영", comment: comment || "직접 편집" };
    state.summary = undefined; state.openFb = null; state.error = ""; render(); return;
  }
  if (t.dataset.ai !== undefined) {
    const si = Number(t.dataset.ai); const comment = $(`#fbc-${si}`).value.trim();
    if (!comment) { state.error = "AI 재작성은 피드백을 적어야 합니다."; render(); return; }
    state.error = ""; await rewriteSection(si, comment); return;
  }
  if (t.id === "confirm") {
    const d = new Date();
    state.confirmed = { author: state.author.trim(), reviewer: (state.reviewer || "").trim(), summary: (state.summary ?? defaultSummary()).trim(),
      at: `${today()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` };
    state.busy = "확정 파일을 만드는 중입니다"; render();
    try { await confirmDraft(); state.error = ""; }
    catch (err) { state.confirmed = null; state.error = `확정 파일을 만들지 못했습니다: ${err?.message || err}`; }
    finally { state.busy = null; render(); }
    return;
  }
  if (t.id === "download") { await download(); return; }
  if (t.id === "restart") { Object.assign(state, { page: "input", draft: null, confirmed: null, files: [], text: "", task: "", format: null, existing: null, sheet: null, author: "", reviewer: "", summary: undefined, error: "", link: null, exConfirm: null }); render(); return; }
});
document.addEventListener("submit", e => {
  if (e.target.id !== "qa-form") return;
  e.preventDefault();
  const q = $("#question").value.trim(); if (!q) return;
  state.qa = { question: q, ...askQa(q) }; render();
});
document.addEventListener("change", async e => {
  const t = e.target;
  if (t.name === "job") { state.job = t.value; state.error = ""; render(); }
  else if (t.name === "format") { state.format = t.value; render(); }
  else if (t.id === "sheet") { state.sheet = t.value; }
  else if (t.id === "up-existing" && t.files[0]) { state.link = null; state.exConfirm = null; await setExisting(t.files[0].name, await readBuffer(t.files[0])); render(); }
  else if (t.name === "verKind") { state.verKind = t.value; if (state.draft) state.draft.version = nextLabel(state.draft.plan.base, t.value); render(); }
  else if (t.dataset.pick) {
    const fv = state.folderView; const l = t.dataset.pick;
    fv.pick = t.checked ? [...fv.pick.filter(x => x !== l), l].slice(-2) : fv.pick.filter(x => x !== l);
    render();
  }
  else if (t.id === "up-docs" || t.id === "up-images") {
    for (const f of t.files) {
      if (isImage(f.name)) await addRawFile(f.name, { dataUrl: await readDataUrl(f) });
      else if (/\.xlsx$/i.test(f.name)) await addRawFile(f.name, { buffer: await readBuffer(f) });
      else await addRawFile(f.name, { text: await readText(f) });
    }
    render();
  }
  else if (t.dataset.meta) { const f = state.files.find(x => x.id === Number(t.dataset.id)); f[t.dataset.meta] = t.value; render(); }
  else if (t.dataset.capture !== undefined && t.files[0]) {
    const s = state.draft.sections[Number(t.dataset.capture)]; const file = t.files[0];
    state.files = state.files.filter(x => x.name !== file.name);
    state.files.push({ id: nextId++, name: file.name, kind: "이미지", dataUrl: await readDataUrl(file), imgType: "전산화면", step: s.no, caption: t.dataset.desc });
    s.text = s.text.replace(t.dataset.token, `{{IMAGE:${file.name}|${t.dataset.desc}}}`);
    render();
  }
});
document.addEventListener("input", e => {
  const t = e.target;
  const rerenderKeepingFocus = () => { const id = t.id, pos = t.selectionStart; render(); const el = document.getElementById(id); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch { } } };
  if (t.id === "free-text") { const before = problems().join("|"); state.text = t.value; if (problems().join("|") !== before) rerenderKeepingFocus(); }
  else if (t.id === "task") { state.task = t.value; rerenderKeepingFocus(); }
  else if (t.dataset.meta) { const f = state.files.find(x => x.id === Number(t.dataset.id)); f[t.dataset.meta] = t.value; }
  else if (t.id === "author") { state.author = t.value; const b = $("#confirm"); if (b) b.disabled = !t.value.trim(); }
  else if (t.id === "reviewer") state.reviewer = t.value;
  else if (t.id === "summary") state.summary = t.value;
});
document.addEventListener("toggle", e => { if (e.target.matches?.("details.fb")) { const i = Number(e.target.id.slice(3)); state.openFb = e.target.open ? i : (state.openFb === i ? null : state.openFb); } }, true);

// 처음 열면 펀드변경 원자료가 들어간 상태로 보여 준다(형식은 고르지 않은 상태: 기본값 없음 규칙).
loadPreset("fund").then(() => { state.format = null; render(); });
render();
