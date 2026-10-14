// ---------- 매뉴얼 챗봇 (PRD 6장 11) ----------
// 모의: 질문 단어가 가장 많이 맞는 섹션의 원문 / AI: 상위 3개 섹션을 근거로 문장으로 답한다.
const CHAT_SUGGEST = ["펀드변경 무료로 몇 번까지 돼?", "판매중지 펀드로 옮길 수 있어?", "자동재배분 주기는 어떻게 돼?"];
const NO_ANSWER = "매뉴얼에 없는 내용입니다.";

function chatEvidence(m, last) {
  if (!m.hits?.length) return "";
  return `<details class="chat-ev" ${last ? "open" : ""}><summary>근거 ${m.hits.length}곳</summary><ol class="evidence" ${last ? 'id="qa-evidence"' : ""}>${m.hits.map((h, i) => `<li><b>[${i + 1}]</b> ${esc(h.label)}${h.best?.[0] ? `<br><span class="hint">↳ ${inline(tidy(h.best[0]))}</span>` : ""}</li>`).join("")}</ol></details>`;
}
function chatBubble(m, i, lastBot) {
  if (m.role === "user") return `<div class="bubble user"><div class="b-text">${esc(m.text)}</div></div>`;
  const last = i === lastBot;
  const body = m.pending
    ? `<div class="b-text" id="chat-pending">${esc(m.text || "답을 찾는 중…")}</div>`
    : `<div class="b-text ${m.status === "답변" || m.ai ? "" : "b-warn"}" ${last ? 'id="qa-answer"' : ""}>${m.text.split("\n").filter(Boolean).map(l => inline(tidy(l))).join("<br>")}</div>`;
  return `<div class="bubble bot"><span class="b-who">🤖 ${m.ai ? "AI 답변" : "매뉴얼 원문"}</span>${body}
    ${m.extra?.length ? m.extra.map(l => `<p class="b-extra">› ${inline(tidy(l))}</p>`).join("") : ""}
    ${m.note ? `<p class="hint">${esc(m.note)}</p>` : ""}${m.pending ? "" : chatEvidence(m, last)}</div>`;
}
function renderQa() {
  const c = state.chat; const usingFolders = state.folders !== null;
  const folders = usingFolders ? state.folders.filter(f => f.versions.length) : [];
  if (c.scope && !folders.some(f => f.id === c.scope)) c.scope = "";
  const sources = qaSources(c.scope);
  const head = `<div class="page-head"><h1>매뉴얼 챗봇</h1>${modeBadge()}</div>`;
  const scopeBox = usingFolders
    ? `<label class="field"><span>어느 매뉴얼에서 찾을까요?</span><select id="chat-scope"><option value="">📁 전체 폴더 (${folders.length}개)</option>${folders.map(f => `<option value="${esc(f.id)}" ${c.scope === f.id ? "selected" : ""}>📁 ${esc(f.name)} · 최신 v${esc(maxLabel(f.versions.map(v => v.label)))}</option>`).join("")}</select></label>`
    : `<div class="notice info">매뉴얼 폴더를 쓸 수 없어, 이번 화면에서 확정하거나 올린 매뉴얼로 답합니다. ${esc(state.folderMsg || "")}</div>`;
  const how = state.mode === "ai"
    ? `AI 모드: 관련 섹션 3곳을 찾아 ${PLATFORM === "vercel" ? "서버의 AI 모델" : "Claude"}가 문장으로 답합니다. 매뉴얼에 없는 내용은 지어내지 않습니다.`
    : "모의 모드: 질문 단어가 가장 많이 들어 있는 섹션의 원문을 보여 줍니다. 왼쪽에서 AI 모드로 바꾸면 문장으로 답합니다.";
  const lastBot = c.msgs.map(m => m.role).lastIndexOf("bot");
  const thread = c.msgs.length ? c.msgs.map((m, i) => chatBubble(m, i, lastBot)).join("")
    : `<div class="bubble bot"><span class="b-who">🤖 매뉴얼 챗봇</span><div class="b-text">${sources.length ? `매뉴얼 ${sources.length}건에서 찾아 드릴게요. 업무 규정이나 처리 순서를 물어보세요.` : "아직 검색할 매뉴얼이 없습니다. 매뉴얼을 확정하면 폴더에 저장되고, 여기서 바로 물어볼 수 있습니다."}</div>
        ${sources.length ? `<div class="row chat-suggest">${CHAT_SUGGEST.map(q => `<button class="btn small" data-ask="${esc(q)}">${esc(q)}</button>`).join("")}</div>` : ""}</div>`;
  const busy = c.msgs.some(m => m.pending);
  return head + `<div class="stack">
    <div class="panel">${scopeBox}
      <details><summary class="hint">검색 대상 ${sources.length}건 보기</summary><div class="files">${sources.map(e => `<div class="file-row"><span class="kind">${e.origin === "폴더" ? "폴더 최신" : e.origin === "업로드" ? "업로드본" : "확정본"}</span><span class="name">${esc(e.origin === "폴더" ? e.title : e.task)} · v${esc(e.version)}${e.sheet ? ` · ${esc(e.file)} &gt; ${esc(e.sheet)}` : ""}</span></div>`).join("") || '<span class="hint">없음</span>'}</div></details>
      <p class="hint" style="margin:0">${how}</p></div>
    <div class="panel chat"><div class="chat-thread" id="chat-thread">${thread}</div>
      <form id="qa-form" class="chat-input"><input type="text" id="question" placeholder="예: 펀드변경 무료로 몇 번까지 돼?" autocomplete="off" ${busy ? "disabled" : ""}>
        <button class="btn primary" type="submit" ${busy || !sources.length ? "disabled" : ""}>보내기</button>
        ${c.msgs.length ? `<button class="btn" type="button" id="chat-clear" ${busy ? "disabled" : ""}>대화 지우기</button>` : ""}</form></div>
  </div>`;
}

const sectionForPrompt = s => stripTags(s.text.replace(TOKEN_RE, (m, k, v) => k === "IMAGE" ? `[그림: ${v.split("|")[1] || v.split("|")[0]}]` : `[캡처 필요: ${v}]`));
async function answerChat(q, bot) {
  const c = state.chat; const entries = qaSources(c.scope);
  // 이어지는 질문("그럼 수수료는?", 낱말 하나뿐인 질문)만 바로 앞 질문과 합쳐서 다시 찾는다.
  // 새 질문을 앞 질문과 합치면 매뉴얼에 없는 질문에도 앞 답이 나오므로 그 외에는 합치지 않는다.
  const users = c.msgs.filter(m => m.role === "user");
  const followUp = /^(그럼|그러면|그건|그거|그때|그리고|또 |이건|이거|저건)/.test(q.trim()) || qaWords(q).length <= 1;
  const prevQ = followUp && users.length > 1 ? users[users.length - 2].text : "";
  let r = askQa(q, entries);
  if (r.status === "없음" && prevQ) { const r2 = askQa(`${prevQ} ${q}`, entries); if (r2.status !== "없음") r = r2; }
  const mockAnswer = () => {
    bot.status = r.status; bot.hits = r.hits;
    bot.text = r.status === "답변" ? r.lines.join("\n") : r.answer;
    bot.extra = r.status === "확인 필요" ? r.lines : [];
  };
  if (state.mode !== "ai") return mockAnswer();
  // AI: 기준을 넘는 섹션이 없으면 점수가 있는 상위 3곳까지 근거로 넘긴다.
  let hits = r.hits;
  if (!hits.length) { const { hits: all } = qaHits(prevQ && r.status === "없음" ? `${prevQ} ${q}` : q, entries); hits = all.slice(0, 3); hits.forEach(h => { h.best = bestLines(h.s.text, h.found, 1); }); }
  if (!hits.length) { bot.status = "없음"; bot.text = NO_ANSWER; bot.hits = []; return; }
  const sample = await getCap("sample");
  if (!sample) { mockAnswer(); bot.note = "이 화면에서는 AI를 쓸 수 없어 매뉴얼 원문으로 답했습니다."; return; }
  const history = c.msgs.filter(m => m !== bot && !m.pending).slice(-7, -1).map(m => `${m.role === "user" ? "질문" : "답변"}: ${m.text}`).join("\n");
  const prompt = `너는 보험사 계약관리부의 업무매뉴얼 안내 챗봇이다. 아래 [근거]에 적힌 내용만으로 질문에 한국어로 답하라.
규칙
- 2~5문장으로 짧게. 숫자·코드·화면 이름은 근거 그대로 쓴다.
- 문장 끝에 근거 번호를 [1]처럼 붙인다.
- 근거에 답이 없으면 "${NO_ANSWER}" 한 문장만 쓴다. 추측하거나 지어내지 않는다.
- 근거에서 그 항목이 '[확인 필요]'로 남아 있으면 "매뉴얼에 아직 확인되지 않은 항목입니다."라고 알린다.
- 마크다운 표·제목은 쓰지 않는다.
${history ? `\n[이전 대화]\n${history}\n` : ""}
${hits.map((h, i) => `[근거 ${i + 1}] ${h.label}\n${sectionForPrompt(h.s)}`).join("\n\n")}

[질문] ${q}`;
  try {
    const { text } = await sample(prompt, { modelTier: "default", cache: false, onText: ({ text }) => { bot.text = text; const el = $("#chat-pending"); if (el) { el.textContent = text; scrollChat(); } } });
    bot.text = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim() || NO_ANSWER; bot.ai = true; bot.hits = hits;
    bot.status = bot.text.startsWith(NO_ANSWER) ? "없음" : "답변";
  } catch (e) { mockAnswer(); bot.note = `${sampleErrorText(e)} 매뉴얼 원문으로 대신 답했습니다.`; }
}
const scrollChat = () => { const t = $("#chat-thread"); if (t) t.scrollTop = t.scrollHeight; };
async function sendChat(q) {
  q = q.trim(); if (!q || state.chat.msgs.some(m => m.pending)) return;
  if (scanText(q).length) { state.chat.msgs.push({ role: "user", text: q.replace(/\d/g, "*") }, { role: "bot", text: "개인정보로 보이는 값이 있어 답하지 않았습니다. 지우고 다시 물어봐 주세요.", status: "없음", hits: [] }); render(); return; }
  const bot = { role: "bot", pending: true, text: "", hits: [] };
  state.chat.msgs.push({ role: "user", text: q }, bot); render(); scrollChat();
  try { await answerChat(q, bot); } finally { bot.pending = false; render(); scrollChat(); $("#question")?.focus(); }
}

document.addEventListener("submit", e => {
  if (e.target.id !== "qa-form") return;
  e.preventDefault(); sendChat($("#question").value);
});
document.addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.ask) sendChat(t.dataset.ask);
  else if (t.id === "chat-clear") { state.chat.msgs = []; render(); }
});
document.addEventListener("change", e => {
  if (e.target.id === "chat-scope") { state.chat.scope = e.target.value; render(); }
});
