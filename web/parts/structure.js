// ---------- 섹션 구성: 고치기는 기존 매뉴얼 구성 그대로, 새로 만들기·업무 추가는 섹션 양식 ----------
// 양식 = { id, name, sections: [{ title, level }] }  (level 1 = 큰 섹션, 2 = 소제목)
const BUILTIN_TEMPLATES = [
  { id: "basic6", name: "기본 6섹션", builtin: true, sections: ["업무개요", "관련규정", "업무흐름도", "처리절차", "유의사항·예외", "관련 양식·쿼리"].map(title => ({ title, level: 1 })) },
  { id: "simple4", name: "간단 4섹션", builtin: true, sections: ["업무개요", "기준·규정", "처리절차", "유의사항"].map(title => ({ title, level: 1 })) },
];
const allTemplates = () => [...BUILTIN_TEMPLATES, ...(state.customTemplates || [])];
const templateById = id => allTemplates().find(t => t.id === id) || BUILTIN_TEMPLATES[0];

// 양식 → 번호 붙은 섹션 뼈대(1, 1-1, 2 …)
function templateSkeleton(tpl) {
  const out = []; let top = 0, sub = 0;
  for (const s of tpl.sections) {
    if (s.level > 1 && top) { sub++; out.push({ no: `${top}-${sub}`, title: s.title, level: 2, text: "" }); }
    else { top++; sub = 0; out.push({ no: String(top), title: s.title, level: 1, text: "" }); }
  }
  return out;
}
// 양식 편집 글 ↔ 섹션 목록: 한 줄에 하나, '-'로 시작하면 바로 위 섹션의 소제목
const templateFromLines = text => text.split("\n").map(l => l.replace(/\s+$/, "")).filter(l => l.trim())
  .map(l => /^\s*[-·]\s*/.test(l) ? { title: l.replace(/^\s*[-·]\s*/, "").trim(), level: 2 } : { title: l.trim().replace(/^\d+(-\d+)*\.\s*/, ""), level: 1 })
  .filter(s => s.title).slice(0, 40);
const templateToLines = tpl => tpl.sections.map(s => (s.level > 1 ? "- " : "") + s.title).join("\n");
const skeletonText = sk => sk.filter(s => s.level === 1).map(s => `${s.no}. ${s.title}`).join(" · ");

// 이번 초안이 따를 섹션 구성(null이면 초안 그대로)
// 고치기 + '기존 구성 그대로' → As-Is 섹션, 그 밖 → 고른 양식. 기본 6섹션은 초안 구성과 같아 손대지 않는다.
function structureTarget(asis) {
  const st = state.structure || {};
  if (state.job === "갱신" && st.mode !== "template") return asis?.sections?.length ? { kind: "keep", skeleton: asis.sections.map(s => ({ ...s })) } : null;
  const tpl = templateById(st.templateId);
  return { kind: "template", tpl, skeleton: templateSkeleton(tpl) };
}
// AI에게 줄 섹션 구성 규칙(첫 줄)
function structureRule(target) {
  if (!target) return "";
  const list = target.skeleton.map(s => `'${"#".repeat(s.level)} ${s.no}. ${s.title}'`).join(", ");
  return target.kind === "keep"
    ? `- 기존 매뉴얼의 섹션 구성(번호·제목·순서)을 그대로 유지한다: ${list}. 섹션을 새로 만들거나 이름·순서를 바꾸지 말고 내용만 현행화한다. 기존 섹션에 꼭 맞지 않는 새 내용은 가장 가까운 섹션 안에 넣는다.`
    : `- 다음 섹션을 이 순서로 쓴다: ${list}. 처리 단계가 여럿이면 해당 섹션에 소제목 '## 번호-1. …'을 달 수 있다. 처리 단계는 번호 목록으로 쓴다.`;
}

// 초안 섹션을 목표 구성에 맞춘다(모의 초안, 그리고 AI가 구성을 어겼을 때 안전장치).
//  ① 제목이 같거나 비슷한 섹션끼리 짝(검토 화면 비교와 같은 규칙) → 그 내용으로 채움
//  ② 짝이 없는 초안 소제목: 부모가 짝이 있으면 양식은 그 아래 소제목으로, '기존 구성 그대로'는 부모 본문에 넣음
//  ③ 짝이 없는 초안 큰 섹션: 같은 번호의 목표 섹션(없으면 마지막 큰 섹션) 본문 뒤에 '**제목**'과 함께 넣음
//  ④ 내용을 못 받은 목표 섹션: 기존 구성이면 기존 글 그대로, 양식이면 [확인 필요]
function fitToStructure(draft, target) {
  if (!target) return draft;
  const sk = target.skeleton.map(s => ({ no: s.no, title: s.title, level: s.level, text: s.text || "", fb: null }));
  const cmp = compareSections(draft, sk);
  const pairOf = new Map(); for (const s of sk) { const from = cmp.result[s.no]?.from; if (from) pairOf.set(from, s); }
  const out = sk.map(s => { const from = cmp.result[s.no]?.from; return { ...s, text: from ? from.text : target.kind === "keep" ? s.text : CHECK, filled: !!from }; });
  const byNo = no => out.find(s => s.no === no);
  const parentNo = no => no.split("-").slice(0, -1).join("-");
  const tops = out.filter(s => s.level === 1);
  const append = (dest, src, withTitle = true) => {
    if (!src.text.trim()) return;
    const block = withTitle ? `**${src.title}**\n\n${src.text}` : src.text;
    dest.text = (dest.filled || target.kind === "keep") && dest.text.trim() && dest.text !== CHECK ? `${dest.text.replace(/\n+$/, "")}\n\n${block}` : block;
    dest.filled = true;
  };
  const extraSubs = new Map();  // 목표 큰 섹션 번호 → 붙일 소제목들
  for (const s of draft) {
    if (pairOf.has(s)) continue;
    const parent = s.level > 1 ? draft.find(x => x.no === parentNo(s.no)) : null;
    const pDest = parent && pairOf.get(parent);
    if (pDest) {
      if (target.kind === "template" && s.level === 2) { const list = extraSubs.get(pDest.no) || []; list.push(s); extraSubs.set(pDest.no, list); }
      else append(byNo(pDest.no), s);
      continue;
    }
    const top = s.level > 1 ? draft.find(x => x.no === s.no.split("-")[0]) : s;
    const dest = (top && pairOf.get(top)) ? byNo(pairOf.get(top).no) : (byNo(s.no.split("-")[0]) || tops[tops.length - 1]);
    if (dest) append(dest, s);
  }
  // 양식: 짝 없는 소제목을 부모 아래 번호로(부모 본문이 비어 있으면 [확인 필요] 대신 빈 본문)
  const result = [];
  for (const s of out) {
    const subs = extraSubs.get(s.no) || [];
    if (subs.length && s.text === CHECK) s.text = "";
    result.push(s);
    if (s.level === 1 && subs.length) {
      const have = out.filter(x => x.no.startsWith(s.no + "-")).length;
      subs.forEach((x, i) => result.push({ no: `${s.no}-${have + i + 1}`, title: x.title, level: 2, text: x.text, fb: null }));
    }
  }
  // 소제목이 붙은 섹션은 소제목 순서대로 다시 정렬
  const ordered = [];
  const subNo = x => Number(x.no.split("-")[1]) || 0;
  for (const s of result.filter(x => x.level === 1)) { ordered.push(s); ordered.push(...result.filter(x => x.level > 1 && x.no.split("-")[0] === s.no).sort((a, b) => subNo(a) - subNo(b))); }
  return ordered.map(({ filled, ...s }) => s);
}
// 같은 구성인지(번호·제목·수준) — 같으면 맞추지 않는다
const sameStructure = (a, b) => a.length === b.length && a.every((s, i) => s.no === b[i].no && titleKey(s.title) === titleKey(b[i].title) && s.level === b[i].level);

// ----- 사용자 양식 저장: 매뉴얼 폴더 저장소(모두 공유), 없으면 이 브라우저 -----
const TPL_LOCAL = "manual-writer:templates:v1";
async function refreshTemplates() {
  const store = await getStore();
  try { state.customTemplates = store?.listTemplates ? await store.listTemplates() : JSON.parse(localStorage.getItem(TPL_LOCAL) || "[]"); }
  catch { state.customTemplates = state.customTemplates || []; }
  state.templatesShared = !!store?.listTemplates;
}
async function saveTemplate(tpl) {
  const store = await getStore();
  if (store?.saveTemplate) { state.customTemplates = await store.saveTemplate(tpl); return; }
  const list = (state.customTemplates || []).filter(t => t.id !== tpl.id); const id = tpl.id || newId();
  list.push({ ...tpl, id }); state.customTemplates = list; try { localStorage.setItem(TPL_LOCAL, JSON.stringify(list)); } catch { /* 저장 못 함 */ }
}
async function deleteTemplate(id) {
  const store = await getStore();
  if (store?.deleteTemplate) { state.customTemplates = await store.deleteTemplate(id); return; }
  state.customTemplates = (state.customTemplates || []).filter(t => t.id !== id); try { localStorage.setItem(TPL_LOCAL, JSON.stringify(state.customTemplates)); } catch { /* 저장 못 함 */ }
}

// ----- 자료 입력 화면: 섹션 구성 고르기 -----
function structureBox() {
  if (!state.templatesTried) { state.templatesTried = true; refreshTemplates().then(render); }
  const st = state.structure || (state.structure = { mode: "keep", templateId: "basic6" });
  const keepMode = state.job === "갱신" && st.mode !== "template";
  const tpl = templateById(st.templateId); const ed = state.tplEdit;
  const editor = ed ? `<div class="tpl-edit" id="tpl-edit"><b>${ed.id ? "양식 고치기" : "＋ 새 섹션 양식"}</b>
      <label class="field"><span>양식 이름</span><input type="text" id="tpl-name" value="${esc(ed.name)}" placeholder="예: 우리 팀 간단 양식"></label>
      <label class="field"><span>섹션 (한 줄에 하나, 소제목은 '- '로 시작)</span><textarea id="tpl-lines" rows="7" placeholder="업무개요&#10;처리기준&#10;처리절차&#10;- 접수&#10;- 처리&#10;유의사항">${esc(ed.lines)}</textarea></label>
      <span class="hint">미리 보기: ${esc(skeletonText(templateSkeleton({ sections: templateFromLines(ed.lines) }))) || "(섹션을 적어 주세요)"}</span>
      ${ed.error ? `<div class="notice warn">${esc(ed.error)}</div>` : ""}
      <div class="row"><button class="btn small primary" id="tpl-save">양식 저장</button><button class="btn small" id="tpl-cancel">취소</button>
        <span class="hint">${state.templatesShared ? "매뉴얼 폴더 저장소에 저장되어 이 사이트를 쓰는 모두가 고를 수 있습니다." : "폴더 저장소를 쓸 수 없어 이 브라우저에만 저장됩니다."}</span></div></div>` : "";
  const picker = `<div class="row"><select id="tpl-select" style="flex:1 1 220px">${allTemplates().map(t => `<option value="${esc(t.id)}" ${t.id === tpl.id ? "selected" : ""}>${esc(t.name)}${t.builtin ? "" : " (직접 만든 양식)"}</option>`).join("")}</select>
      <button class="btn small" id="tpl-new">＋ 새 양식</button>${tpl.builtin ? "" : state.tplDelAsk ? `<span class="hint">'${esc(tpl.name)}' 양식을 지울까요?</span><button class="btn small danger" id="tpl-del">삭제</button><button class="btn small" id="tpl-del-no">취소</button>` : `<button class="btn small" id="tpl-edit-open">고치기</button><button class="btn small" id="tpl-del-ask">삭제</button>`}</div>
    <div class="tpl-preview">${templateSkeleton(tpl).map(s => `<span class="${s.level > 1 ? "sub" : ""}">${esc(s.no)}. ${esc(s.title)}</span>`).join("")}</div>`;
  if (state.job === "갱신") {
    return `<div class="field"><span>섹션 구성 ${help("structure")}</span>
      <div class="choice"><label><input type="radio" name="structMode" value="keep" ${keepMode ? "checked" : ""}>기존 매뉴얼 구성 그대로 (추천)</label><label><input type="radio" name="structMode" value="template" ${keepMode ? "" : "checked"}>섹션 양식으로 새로 정리</label></div>
      ${keepMode ? `<span class="hint">올린 매뉴얼의 섹션 번호·제목·순서는 그대로 두고 내용만 고칩니다.${state.existing?.chapters?.length ? ` 지금 구성: ${esc(state.existing.chapters.map((c, i) => `${i + 1}. ${c}`).join(" · "))}` : ""}</span>` : picker}
      ${keepMode ? "" : editor}</div>`;
  }
  return `<div class="field"><span>섹션 양식 ${help("template")}</span>${picker}${editor}
    <span class="hint">${state.job === "추가" ? "새로 붙일 장·시트 안의 섹션 구성입니다. 기존 장·시트는 그대로입니다." : "새 매뉴얼의 섹션 구성입니다."}</span></div>`;
}

document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.id === "tpl-new") { state.tplEdit = { id: null, name: "", lines: "업무개요\n처리기준\n처리절차\n유의사항", error: "" }; render(); $("#tpl-name")?.focus(); }
  else if (t.id === "tpl-edit-open") { const tpl = templateById(state.structure.templateId); state.tplEdit = { id: tpl.id, name: tpl.name, lines: templateToLines(tpl), error: "" }; render(); }
  else if (t.id === "tpl-cancel") { state.tplEdit = null; render(); }
  else if (t.id === "tpl-save") {
    const ed = state.tplEdit; const sections = templateFromLines(ed.lines);
    if (!ed.name.trim()) { ed.error = "양식 이름을 입력해 주세요."; render(); return; }
    if (!sections.some(s => s.level === 1)) { ed.error = "섹션을 한 줄에 하나씩 적어 주세요."; render(); return; }
    if (allTemplates().some(x => x.name === ed.name.trim() && x.id !== ed.id)) { ed.error = "같은 이름의 양식이 있습니다."; render(); return; }
    try {
      const before = new Set((state.customTemplates || []).map(x => x.id));
      await saveTemplate({ id: ed.id || undefined, name: ed.name.trim(), sections });
      const saved = ed.id || (state.customTemplates || []).find(x => !before.has(x.id))?.id;
      if (saved) state.structure.templateId = saved;
      state.tplEdit = null;
    } catch (err) { ed.error = storeErrorText(err?.code); }
    render();
  }
  else if (t.id === "tpl-del-ask") { state.tplDelAsk = true; render(); }
  else if (t.id === "tpl-del-no") { state.tplDelAsk = false; render(); }
  else if (t.id === "tpl-del") {  // 지워도 이미 만든 매뉴얼에는 영향이 없다
    const tpl = templateById(state.structure.templateId);
    try { await deleteTemplate(tpl.id); state.structure.templateId = "basic6"; } catch (err) { state.error = storeErrorText(err?.code); }
    state.tplDelAsk = false; render();
  }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.id === "tpl-select") { state.structure.templateId = t.value; state.tplEdit = null; state.tplDelAsk = false; render(); }
  else if (t.name === "structMode") { state.structure.mode = t.value; render(); }
});
document.addEventListener("input", e => {
  const t = e.target; const ed = state.tplEdit; if (!ed) return;
  if (t.id === "tpl-name") ed.name = t.value;
  else if (t.id === "tpl-lines") { ed.lines = t.value; const hint = t.closest(".tpl-edit")?.querySelector(".hint"); if (hint) hint.textContent = `미리 보기: ${skeletonText(templateSkeleton({ sections: templateFromLines(t.value) })) || "(섹션을 적어 주세요)"}`; }
});
