// ---------- 작성 흐름 편의: AI 진행·중지 · 섹션 목차 · [확인 필요] 바로 채우기 · 임시저장 ----------

// ===== AI 진행 표시와 중지 =====
var aiRun = null;  // { ctrl, start, timer } — 첫 화면을 그릴 때 이 파일보다 먼저 쓰여 var로 둔다
async function withAiRun(fn) {
  const ctrl = new AbortController(); aiRun = { ctrl, start: Date.now() };
  aiRun.timer = setInterval(() => { const el = $("#ai-elapsed"); if (el) el.textContent = aiElapsedText(); }, 1000);
  render();
  const stopped = new Promise((_, reject) => ctrl.signal.addEventListener("abort", () => reject({ code: "cancelled" })));
  try { return await Promise.race([fn(ctrl.signal), stopped]); }
  catch (e) { throw ctrl.signal.aborted ? { code: "cancelled" } : e; }
  finally { clearInterval(aiRun.timer); aiRun = null; }
}
function aiElapsedText() {
  if (!aiRun) return "";
  const sec = Math.floor((Date.now() - aiRun.start) / 1000);
  return `⏱ ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}${PLATFORM === "vercel" ? " · 보통 1~3분" : ""}`;
}
function aiProgressHtml() {
  const t = state.stream || "";
  if (!t.trim()) return `<span class="hint">AI가 자료를 읽고 있습니다… 첫 글자가 나오기까지 수십 초 걸릴 수 있습니다.</span>`;
  const heads = [...t.matchAll(/^(#{1,3})\s+(\d+(?:-\d+)*)\.\s*(.*)$/gm)];
  if (!heads.length) return `<span class="hint">받은 글자 ${t.length.toLocaleString()}자</span>`;
  const top = heads.filter(h => h[1].length === 1).length; const last = heads[heads.length - 1];
  return `<div class="ai-bar"><span style="width:${Math.min(100, Math.round(top / (state.genTop || 6) * 100))}%"></span></div>
    <span>큰 섹션 <b>${Math.min(top, state.genTop || 6)}/${state.genTop || 6}</b> · 소제목 포함 ${heads.length}개 작성 · 지금: <b>${esc(`${last[2]}. ${last[3]}`)}</b></span>`;
}

// ===== 검토 화면: 섹션 목차와 '다음 [확인 필요]로 이동' =====
function sectionToc(d, ch, locked) {
  const items = d.sections.map((s, si) => ({ si, s, ...countOpen([s]), chg: ch?.result[s.no]?.status }));
  const tc = items.reduce((a, x) => a + x.check, 0), tp = items.reduce((a, x) => a + x.capture, 0);
  const chip = x => {
    const marks = `${x.check ? ` <span class="t-check">⚠${x.check}</span>` : ""}${x.capture ? ` <span class="t-cap">📷${x.capture}</span>` : ""}${!x.check && !x.capture ? ' <span class="t-ok">✓</span>' : ""}`;
    return `<button class="toc-chip ${x.s.level > 1 ? "sub" : ""} ${x.chg === "변경" ? "chg-mod" : x.chg === "추가" ? "chg-add" : ""}" data-goto-sec="${x.si}" title="${esc(`${x.s.no}. ${x.s.title}`)}">${esc(x.s.no)}${marks}</button>`;
  };
  return `<div class="sec-toc" id="sec-toc"><div class="row" style="justify-content:space-between">
      <span class="hint">섹션 바로가기 · ⚠ [확인 필요] · 📷 [캡처 필요] · ✓ 채울 곳 없음${ch ? " · 테두리 색 = 변경/추가" : ""}</span>
      <span class="row"><button class="btn small" data-next="check" ${tc ? "" : "disabled"}>다음 [확인 필요] (${tc})</button><button class="btn small" data-next="capture" ${tp ? "" : "disabled"}>다음 [캡처 필요] (${tp})</button></span></div>
    <div class="toc-chips">${items.map(chip).join("")}</div>
    ${!locked && tc ? '<p class="hint" style="margin:0">본문의 <span class="check">[확인 필요] ✎</span>를 누르면 그 자리에 바로 값을 넣을 수 있습니다.</p>' : ""}</div>`;
}
function gotoEl(el) {
  const top = el.getBoundingClientRect().top + window.scrollY - (($("#sec-toc")?.offsetHeight || 0) + 24);
  window.scrollTo({ top, behavior: "smooth" });
  el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
}
function gotoNext(kind) {
  const col = $("#tobe-col"); if (!col) return;
  const els = [...col.querySelectorAll(kind === "check" ? ".check" : ".capture")];
  if (!els.length) return;
  const line = ($("#sec-toc")?.offsetHeight || 0) + 30;
  const next = els.find(el => el.getBoundingClientRect().top > line + 4) || els[0];
  gotoEl(next);
}

// ===== [확인 필요] 바로 채우기 =====
let fillPop = null;
function closeFill() { fillPop?.remove(); fillPop = null; }
function nthIndex(text, word, k) { let i = -1; for (let n = 0; n <= k; n++) { i = text.indexOf(word, i + 1); if (i < 0) return -1; } return i; }
function openFill(btn) {
  closeFill();
  const si = Number(btn.dataset.fillSi), k = Number(btn.dataset.fillK); const s = state.draft.sections[si];
  const at = nthIndex(s.text, CHECK, k); if (at < 0) return;
  const lineStart = s.text.lastIndexOf("\n", at) + 1, lineEnd = s.text.indexOf("\n", at);
  const line = s.text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd);
  fillPop = document.createElement("div"); fillPop.className = "help-pop fill-pop";
  fillPop.innerHTML = `<b>[확인 필요] 채우기 — ${esc(s.no)}. ${esc(s.title)}</b>
    <div class="hint">이 줄: ${inline(tidy(line))}</div>
    <input type="text" id="fill-value" placeholder="이 자리에 들어갈 값 (예: 건당 2,000원)">
    <div class="row"><button class="btn small primary" id="fill-ok">넣기</button><button class="btn small" id="fill-cancel">취소</button><span class="hint" id="fill-msg"></span></div>`;
  fillPop.dataset.si = si; fillPop.dataset.k = k;
  document.body.appendChild(fillPop);
  const r = btn.getBoundingClientRect(); const w = fillPop.offsetWidth;
  fillPop.style.left = `${Math.max(8, Math.min(window.scrollX + r.left - 12, window.scrollX + document.documentElement.clientWidth - w - 8))}px`;
  fillPop.style.top = `${window.scrollY + r.bottom + 6}px`;
  $("#fill-value").focus();
}
function applyFill() {
  const si = Number(fillPop.dataset.si), k = Number(fillPop.dataset.k); const s = state.draft.sections[si];
  const value = $("#fill-value").value.trim();
  if (!value) { $("#fill-msg").textContent = "값을 입력해 주세요."; return; }
  const lk = scanText(value);
  if (lk.length) { $("#fill-msg").textContent = "개인정보로 보이는 값은 넣을 수 없습니다."; return; }
  const at = nthIndex(s.text, CHECK, k); if (at < 0) { closeFill(); return; }
  s.text = s.text.slice(0, at) + value + s.text.slice(at + CHECK.length);
  s.fb = { status: "반영", comment: `[확인 필요] 채움: ${value}` };
  state.summary = undefined; closeFill(); render();
}

// ===== 임시저장 (이 브라우저에만) =====
const AUTOSAVE_KEY = "manual-writer:autosave:v1";
var autosaveTimer = null, exRunning = false;  // render()가 이 파일보다 먼저 불려도 되도록 var·function
function scheduleAutosave() { clearTimeout(autosaveTimer); autosaveTimer = setTimeout(autosave, 700); }
const hasWork = () => !!(state.text?.trim() || state.files?.length || state.existing || state.draft);
function bufToB64(buf) { const b = new Uint8Array(buf); let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); }
function clearAutosave() { try { localStorage.removeItem(AUTOSAVE_KEY); } catch { /* 저장소를 못 쓰는 브라우저 */ } }
function autosave() {
  // 확정한 뒤·실행 중·'이어서 하기'를 묻는 중에는 저장하지 않는다
  if (exRunning || state.busy || state.confirmed?.blob || state.restoreOffer) return;
  try {
    if (!hasWork()) { localStorage.removeItem(AUTOSAVE_KEY); return; }
    const d = state.draft;
    const snap = {
      v: 1, at: Date.now(), page: state.page === "review" ? "review" : "input",
      job: state.job, format: state.format, text: state.text, task: state.task, sheet: state.sheet, link: state.link,
      author: state.author || "", reviewer: state.reviewer || "", summary: state.summary ?? null, verKind: state.verKind, structure: state.structure, onceTemplate: state.onceTemplate || null,
      files: state.files.map(f => ({ ...f })), existing: state.existing ? { name: state.existing.name, b64: bufToB64(state.existing.buffer) } : null,
      draft: d ? { meta: d.meta, task: d.task, sections: d.sections, job: d.job, format: d.format, chapterNo: d.chapterNo, save: d.save, targetId: d.targetId || null, structure: d.structure || "" } : null,
    };
    try { localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snap)); }
    catch {  // 용량이 넘치면 캡처 이미지는 빼고 저장
      snap.files = snap.files.filter(f => f.kind !== "이미지"); snap.partial = true;
      localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snap));
    }
  } catch { /* 임시저장을 못 해도 작업은 계속 */ }
}
function readAutosave() { try { const raw = localStorage.getItem(AUTOSAVE_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }
function restoreBanner() {
  const o = state.restoreOffer; if (!o) return "";
  const when = new Date(o.at); const t = `${when.getMonth() + 1}월 ${when.getDate()}일 ${String(when.getHours()).padStart(2, "0")}:${String(when.getMinutes()).padStart(2, "0")}`;
  const what = [JOB_LABEL[o.job], o.draft ? `초안 '${o.draft.meta?.title || ""}' (섹션 ${o.draft.sections.length}개)` : o.text?.trim() ? `줄글 ${o.text.trim().length}자` : "", o.files?.length ? `파일 ${o.files.length}개` : "", o.existing ? `기존 매뉴얼 ${o.existing.name}` : ""].filter(Boolean).join(" · ");
  return `<div class="notice info restore-banner" id="restore-banner">💾 <b>${t}에 하던 작업이 이 브라우저에 남아 있습니다.</b> ${esc(what)}${o.partial ? " (캡처 이미지는 용량 때문에 저장되지 않았습니다)" : ""}
    <div class="row"><button class="btn small primary" id="restore-yes">이어서 하기</button><button class="btn small" id="restore-no">지우고 새로 시작</button></div></div>`;
}
async function restoreWork() {
  const o = state.restoreOffer; state.restoreOffer = null; if (!o) return;
  state.busy = "하던 작업을 불러오는 중입니다"; render();
  try {
    Object.assign(state, { job: o.job, format: o.format, text: o.text || "", task: o.task || "", author: o.author, reviewer: o.reviewer, summary: o.summary ?? undefined, verKind: o.verKind || "minor", files: o.files || [], existing: null, draft: null, confirmed: null, error: "",
      structure: o.structure || { mode: "keep", templateId: "basic6" }, onceTemplate: o.onceTemplate || null });
    nextId = Math.max(nextId, ...state.files.map(f => f.id + 1));
    if (o.existing) await setExisting(o.existing.name, b64Buffer(o.existing.b64));
    state.sheet = o.sheet; state.link = o.link;
    if (o.draft) {
      const asis = state.existing && (o.draft.job !== "신규") ? await readExisting() : null;
      state.draft = { ...o.draft, asis };
      await planVersion(state.draft);
    }
    state.page = o.draft ? o.page : "input";
  } catch (e) { state.error = `하던 작업을 불러오지 못했습니다: ${e?.message || e}`; state.page = "input"; }
  finally { state.busy = null; render(); }
}

document.addEventListener("click", async e => {
  const t = e.target.closest("button");
  if (fillPop && !e.target.closest(".fill-pop") && !t?.classList.contains("fill-check")) closeFill();
  if (!t) return;
  if (t.id === "ai-cancel") { aiRun?.ctrl.abort(); return; }
  if (t.dataset.gotoSec !== undefined) { const el = $(`#sec-${t.dataset.gotoSec}`); if (el) gotoEl(el); return; }
  if (t.dataset.next) { gotoNext(t.dataset.next); return; }
  if (t.classList.contains("fill-check")) { e.preventDefault(); openFill(t); return; }
  if (t.id === "fill-ok") { applyFill(); return; }
  if (t.id === "fill-cancel") { closeFill(); return; }
  if (t.id === "restore-yes") { await restoreWork(); return; }
  if (t.id === "restore-no") { state.restoreOffer = null; clearAutosave(); render(); return; }
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.id === "fill-value") { e.preventDefault(); applyFill(); }
  if (e.key === "Escape") closeFill();
});

// 처음 열 때: 남은 작업이 있으면 '이어서 하기'를 묻는다(빈 화면 위에 알림 줄)
{ const o = readAutosave(); if (o && (o.text?.trim() || o.files?.length || o.existing || o.draft)) { state.restoreOffer = o; render(); } }
