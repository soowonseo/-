// ---------- 챗봇이 답 못 한 질문 → 다음 개정 자료 ----------
// 챗봇이 '매뉴얼에 없는 내용'이라고 답한 질문을 매뉴얼 폴더 저장소에 모아 두고(폴더별, 전체 검색이면 폴더 미지정),
// 그 매뉴얼을 고칠 때 줄글 자료에 넣는다. 확정해 그 폴더에 저장하면 넣었던 질문은 목록에서 지운다.
// 첫 화면을 그릴 때도 쓰이므로 function·var로 둔다.
var GAP_HEAD = "## 챗봇에서 답을 못 찾은 질문 (이번 개정에서 보완)";

async function refreshGaps() {
  const store = await getStore();
  try { state.gaps = store?.listGaps ? await store.listGaps() : []; } catch { state.gaps = state.gaps || []; }
}
async function recordGap(q, folderId) {
  const store = await getStore(); if (!store?.addGap) return false;
  try { state.gaps = await store.addGap(q, folderId || null); return true; } catch { return false; }
}
// 이 폴더 질문 + 폴더를 정하지 않고(전체 폴더에서) 물은 질문
function gapsFor(folderId) {
  const all = state.gaps || [];
  return { mine: all.filter(g => folderId && g.folderId === folderId), common: all.filter(g => !g.folderId) };
}
const gapLine = g => `<li><span>${esc(g.q)}</span>${g.count > 1 ? ` <span class="hint">×${g.count}</span>` : ""} <span class="hint">${esc(shortDate(g.at))}</span> <button class="btn small" data-gap-del="${esc(g.id)}" aria-label="이 질문 지우기">✕</button></li>`;

// 매뉴얼 폴더 상세 화면
function gapsPanel(cur) {
  const { mine, common } = gapsFor(cur.id); const n = mine.length + common.length;
  if (!n) return `<div class="panel gaps" id="gaps-panel"><h3 style="margin:0">💬 챗봇이 답 못 한 질문</h3><p class="hint" style="margin:6px 0 0">아직 없습니다. 매뉴얼 챗봇이 이 매뉴얼에서 답을 못 찾은 질문이 여기에 모이고, 다음에 고칠 때 보완 자료로 쓸 수 있습니다.</p></div>`;
  return `<div class="panel gaps" id="gaps-panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">💬 챗봇이 답 못 한 질문 ${n}개</h3>
      ${cur.versions.length ? `<button class="btn small primary" id="gaps-fix">이 질문들로 매뉴얼 고치기</button>` : ""}</div>
    <p class="hint">매뉴얼에 없어 챗봇이 답하지 못한 질문입니다. [이 질문들로 매뉴얼 고치기]를 누르면 최신 버전을 불러와 질문을 줄글 자료에 넣습니다. 확정해 이 폴더에 저장하면 목록에서 지워집니다.</p>
    ${mine.length ? `<ul class="gap-list">${mine.map(gapLine).join("")}</ul>` : ""}
    ${common.length ? `<p class="hint" style="margin:8px 0 2px">전체 폴더에서 물은 질문(폴더 미지정)</p><ul class="gap-list">${common.map(gapLine).join("")}</ul>` : ""}</div>`;
}

// 자료 입력 화면: 폴더에서 불러온 매뉴얼을 고칠 때
function gapNote() {
  if (state.job !== "갱신" || !state.link || !state.existing) return "";
  const used = state.gapsUsed?.folderId === state.link.folderId ? state.gapsUsed.ids : [];
  if (used.length) return `<div class="notice ok" id="gap-note">💬 챗봇이 답 못 한 질문 ${used.length}개를 줄글에 넣었습니다. 확정해 이 폴더에 저장하면 목록에서 지워집니다.</div>`;
  const { mine, common } = gapsFor(state.link.folderId); const n = mine.length + common.length;
  if (!n) return "";
  return `<div class="notice info" id="gap-note">💬 챗봇이 이 매뉴얼에서 답을 못 찾은 질문이 <b>${n}개</b> 있습니다: ${esc([...mine, ...common].slice(0, 3).map(g => `'${g.q}'`).join(", "))}${n > 3 ? " …" : ""}
    <div class="row"><button class="btn small primary" id="gaps-add">줄글 자료에 넣기</button><span class="hint">넣은 질문은 AI가 자료에서 답을 찾아 보완하고, 근거가 없으면 [확인 필요]로 남깁니다.</span></div></div>`;
}
function addGapsToText() {
  const { mine, common } = gapsFor(state.link?.folderId); const list = [...mine, ...common];
  if (!list.length) return;
  state.text = `${state.text.replace(/\s+$/, "")}${state.text.trim() ? "\n\n" : ""}${GAP_HEAD}\n${list.map(g => `- ${g.q}`).join("\n")}\n`;
  state.gapsUsed = { folderId: state.link?.folderId, ids: list.map(g => g.id) };
}
// 확정해 폴더에 저장한 뒤: 넣었던 질문을 지운다
async function resolveGaps(folderId) {
  const u = state.gapsUsed; if (!u?.ids?.length || u.folderId !== folderId) return;
  const ids = u.ids;
  const store = await getStore(); if (!store?.deleteGaps) return;
  try { state.gaps = await store.deleteGaps(ids); state.gapsUsed = null; } catch { /* 다음에 직접 지울 수 있다 */ }
}

document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.gapDel) {
    const store = await getStore(); if (!store?.deleteGaps) return;
    try { state.gaps = await store.deleteGaps([t.dataset.gapDel]); } catch (err) { state.folderView.status = storeErrorText(err?.code); }
    render();
  } else if (t.id === "gaps-add") { addGapsToText(); render(); }
  else if (t.id === "gaps-fix") {
    const f = curFolder(); const v = f && sortedVersions(f)[0]; if (!v) return;
    const st = $("#folder-status");
    try {
      if (st) st.textContent = "파일을 불러오는 중…";
      await loadFolderVersion(f, v, { reset: true });
      addGapsToText(); state.page = "input"; render(); window.scrollTo(0, 0);
    } catch (err) { if (st) st.textContent = storeErrorText(err?.code); }
  }
});
