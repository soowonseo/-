// ---------- 사용 편의: ? 도움말 · 알림 창 · AI 오류 설명 · 무료 모델 안내 · 끌어 놓기 ----------

// 입력 칸 옆 '?' 단추. 누르면 작은 설명 창(help 키 → HELP 내용)
// (첫 화면을 그릴 때 이 파일보다 먼저 쓰이므로 function 선언으로 둔다)
function help(key) { return `<button type="button" class="help-btn" data-help="${key}" aria-label="도움말">?</button>`; }
const HELP = {
  job: ["어떤 작업?", "<b>새로 만들기</b>: 매뉴얼이 없을 때 메모·캡처로 처음부터.<br><b>고치기</b>: 있는 매뉴얼의 규정·절차를 현행화(새 버전).<br><b>업무 추가</b>: 있는 매뉴얼 맨 뒤에 다른 업무를 새 장(Word)·새 시트(엑셀)로."],
  format: ["출력 형식", "부서에서 쓰는 매뉴얼 형식을 고릅니다. 기본값이 없어서 고르기 전에는 [초안 생성]을 누를 수 없습니다. 고치기·업무 추가는 올린 파일 형식을 따릅니다."],
  existing: ["기존 매뉴얼", ".docx 또는 .xlsx 파일 1개. 엑셀을 고칠 때는 바꿀 시트 하나만 고르면 다른 시트는 그대로 남습니다. 파일 안의 '버전 N'을 읽어 다음 번호를 정합니다."],
  import: ["폴더에서 가져오기", "매뉴얼 폴더에 저장된 버전을 그대로 불러옵니다. 확정하면 같은 폴더에 다음 번호로 저장됩니다. 써 둔 줄글·원자료는 지워지지 않습니다."],
  structure: ["섹션 구성", "기존 매뉴얼을 고칠 때는 그 문서의 섹션 번호·제목·순서를 그대로 두고 내용만 고치는 것이 기본입니다. 문서마다 섹션이 달라도 그대로 따라갑니다. 구성을 새로 정리하고 싶을 때만 '섹션 양식으로 새로 정리'를 고르세요."],
  template: ["섹션 양식", "새 매뉴얼(또는 새로 붙일 장·시트)을 어떤 섹션으로 나눌지 정합니다. 기본 6섹션·간단 4섹션 중 고르거나 [＋ 새 양식]으로 직접 만들 수 있습니다. 직접 만든 양식은 매뉴얼 폴더 저장소에 저장되어 함께 씁니다. [🪄 자료 보고 섹션 제안]을 누르면 넣은 자료로 섹션 제목만 먼저 제안하고, 확인·수정해 확정한 뒤 [초안 생성]에서 본문을 씁니다(1차 확인 → 본문 작성). 자료에 없는 섹션은 [확인 필요]로 남습니다."],
  task: ["추가할 업무명", "새 장(Word)·새 시트(엑셀)의 이름이 됩니다. 짧고, 이미 있는 장·시트와 겹치지 않게 쓰세요. 예: 자동재배분"],
  text: ["줄글 입력", "업무를 말하듯 적은 글이나 메모를 붙여넣습니다. <b>기준 숫자·화면 경로·예외</b>가 들어 있으면 빈칸 없이 채워집니다. 없는 내용은 지어내지 않고 [확인 필요]로 남습니다.<br>주민번호·전화번호·계좌번호는 넣지 마세요."],
  docs: ["메모·쿼리·엑셀 파일", ".txt 메모, .sql 쿼리, .xlsx 양식. 쿼리는 '6. 관련 양식·쿼리'에 회색 박스로 그대로 들어갑니다. 여러 개를 한 번에 올리거나 이 칸에 끌어 놓아도 됩니다."],
  images: ["캡처 이미지", ".png/.jpg 여러 장. <b>한 장에 한 장면</b>으로, 파일명에 순서·내용을 넣으면 좋습니다(예: 캡처1_신청화면.png). 올린 뒤 이미지마다 종류·배치할 단계·한 줄 설명을 확인하세요."],
  imgType: ["이미지 종류", "전산화면 / 엑셀 / 쿼리결과 / 업무흐름도. 파일명에 '흐름도·쿼리·엑셀'이 있으면 미리 골라집니다."],
  step: ["배치할 단계", "그 화면을 쓰는 절차 번호(예: 4-3). 흐름도는 '3'. 비우면 초안이 정한 자리, 그래도 없으면 '6. 관련 양식·쿼리' 끝에 붙습니다."],
  caption: ["한 줄 설명", "그림 아래 캡션이 되고 챗봇 검색에도 쓰입니다. \"무슨 화면 — 무엇을 보면 되는지\"를 15~40자로. 예: 검증 오류 예시 (E-102 / E-103)"],
  author: ["작성자·검토자", "개정이력 표(Word)·개정이력 줄(엑셀)에 들어갑니다. 작성자는 꼭 입력해야 확정할 수 있습니다."],
  summary: ["개정내용", "개정이력에 들어갈 한 줄. 바뀐 섹션을 바탕으로 자동으로 채워지며 고칠 수 있습니다."],
  dest: ["저장 위치", "<b>매뉴얼 폴더</b>: 버전 이력이 쌓이고 챗봇이 검색합니다(내려받기도 됨).<br><b>내 컴퓨터</b>: 파일만 내려받습니다. 확정 뒤에 폴더에 넣을 수도 있습니다."],
  folder: ["어느 폴더에", "<b>추천</b>: 불러온 폴더 → 파일 이름이 같은 폴더 → 없으면 새 폴더.<br><b>기존 폴더 고르기</b>: 같은 형식(Word/엑셀) 폴더 중에서.<br><b>새 폴더 만들기</b>: 이름·업무명을 직접. 같은 이름은 쓸 수 없습니다."],
  version: ["버전 번호", "<b>작은 수정</b>(+0.1): 문구·수치 보완. <b>큰 개정</b>(다음 정수): 규정·절차가 크게 바뀜. <b>직접 입력</b>: 1.5, 3처럼. 파일 이름·표지·개정이력에 같은 번호가 들어갑니다."],
  filename: ["파일 이름", "기본은 '폴더이름_v번호'. 바꾸면 그 이름으로 저장·내려받기 됩니다. \\ / : * ? \" < > | 는 쓸 수 없습니다."],
  mode: ["모의 / AI 모드", "<b>모의</b>: 미리 만든 예시 초안으로 바로 동작(연습용).<br><b>AI</b>: 넣은 자료로 AI가 초안을 새로 씁니다. " + (PLATFORM === "vercel" ? "이 사이트는 <b>무료 AI 모델</b>이라 하루 사용 횟수가 정해져 있고 답이 늦을 수 있습니다(초안 1~3분)." : "보는 사람의 claude.ai 계정 사용량을 씁니다.")],
};

// 작은 설명 창(팝오버)
let helpPop = null;
function closeHelp() { helpPop?.remove(); helpPop = null; }
function openHelp(btn) {
  closeHelp();
  const [title, body] = HELP[btn.dataset.help] || ["도움말", ""];
  helpPop = document.createElement("div");
  helpPop.className = "help-pop"; helpPop.setAttribute("role", "dialog");
  helpPop.innerHTML = `<b>${esc(title)}</b><div>${body}</div>`;
  document.body.appendChild(helpPop);
  const r = btn.getBoundingClientRect(); const w = helpPop.offsetWidth;
  helpPop.style.left = `${Math.max(8, Math.min(window.scrollX + r.left - 12, window.scrollX + document.documentElement.clientWidth - w - 8))}px`;
  helpPop.style.top = `${window.scrollY + r.bottom + 6}px`;
}

// 알림 창(모달)
function showModal({ title, body, actions = [], tone = "info" }) {
  const root = $("#modal-root"); if (!root) return;
  root.innerHTML = `<div class="modal-back" data-modal-close></div>
    <div class="modal ${tone}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <h2 id="modal-title">${title}</h2><div class="modal-body">${body}</div>
      <div class="row modal-actions">${actions.map(a => `<button class="btn ${a.primary ? "primary" : ""}" data-modal-act="${a.id}">${a.label}</button>`).join("")}<button class="btn" data-modal-close>닫기</button></div></div>`;
  root.querySelector(".modal button")?.focus();
}
const closeModal = () => { const root = $("#modal-root"); if (root) root.innerHTML = ""; };

// AI 오류 설명: 무엇이 / 왜 / 어떻게
function aiErrorInfo(code) {
  const vercel = PLATFORM === "vercel";
  const M = {
    rate_limited: ["요청이 많아 잠시 막혔습니다", vercel ? "무료 AI 모델(OpenRouter)은 1분·하루에 쓸 수 있는 횟수가 정해져 있습니다. 이 사이트를 쓰는 모든 사람이 한도를 함께 씁니다." : "Claude 사용량 한도에 잠시 걸렸습니다.", ["1~2분 뒤 다시 눌러 보세요.", "하루 한도를 다 썼다면 내일 다시 하거나, 모의 모드로 진행하세요.", vercel ? "관리자: OpenRouter는 크레딧이 있는 계정의 무료 모델 한도를 더 크게 주는 것으로 안내합니다(정확한 수치는 OpenRouter 안내 확인)." : ""]],
    not_configured: ["AI가 아직 연결되지 않았습니다", "서버에 AI 설정(OpenRouter 키·모델 이름)이 없습니다.", ["관리자: Vercel 환경 변수 OPENROUTER_API_KEY와 OPENROUTER_MODEL을 넣고 Redeploy 하세요.", "그동안은 모의 모드로 진행하세요."]],
    bad_model: ["AI 모델 이름이 맞지 않습니다", "서버에 적힌 모델이 OpenRouter에 없거나 이름이 바뀌었습니다(무료 모델은 가끔 내려갑니다).", ["관리자: openrouter.ai/models 에서 무료(:free) 모델 ID를 다시 복사해 OPENROUTER_MODEL에 넣고 Redeploy 하세요."]],
    no_credits: ["AI 사용 한도가 남아 있지 않습니다", "OpenRouter 계정의 크레딧이 부족하거나, 무료 모델이 아닌 모델로 설정되어 있습니다.", ["관리자: OpenRouter 크레딧을 확인하거나 모델을 :free 모델로 바꾸세요.", "그동안은 모의 모드로 진행하세요."]],
    bad_key: ["AI 키가 올바르지 않습니다", "서버에 넣은 OpenRouter 키가 틀렸거나 만료·삭제되었습니다.", ["관리자: OpenRouter에서 키를 새로 만들어 OPENROUTER_API_KEY를 바꾸고 Redeploy 하세요(키는 채팅·PC에 붙여 넣지 마세요)."]],
    network: ["AI 서버에 연결하지 못했습니다", "인터넷이 끊겼거나 AI 서비스가 잠시 응답하지 않습니다.", ["인터넷 연결을 확인하고 다시 눌러 보세요."]],
    timeout: ["AI 답이 너무 오래 걸렸습니다", "무료 모델이 느려서 서버 대기 시간(최대 5분)을 넘겼습니다.", ["원자료를 조금 줄이거나 잠시 뒤 다시 해 보세요.", "급하면 모의 모드로 진행하세요."]],
    too_large: ["자료가 너무 많습니다", "AI에 한 번에 보낼 수 있는 글자 수를 넘었습니다.", ["줄글·메모를 줄이거나 필요 없는 파일을 빼고 다시 해 보세요."]],
    api_error: ["AI 서비스에서 오류가 났습니다", "OpenRouter나 모델 쪽에서 일시적인 문제가 생겼습니다.", ["잠시 뒤 다시 해 보세요. 계속되면 모의 모드로 진행하세요."]],
    format: ["AI 답을 매뉴얼 형식으로 읽지 못했습니다", "AI가 정해진 섹션 형식(# 1. 섹션 제목 …)을 지키지 않았습니다. 무료 모델에서 가끔 생깁니다.", ["한 번 더 [초안 생성]을 눌러 보세요.", "계속되면 모의 모드로 진행하세요."]],
    not_granted: ["Claude 사용을 허용하지 않았습니다", "AI 모드는 보는 사람의 claude.ai 계정으로 동작하는데, 허용 창에서 거절되었습니다.", ["페이지를 새로고침하고 다시 시도하면 허용 창이 다시 뜹니다.", "또는 모의 모드로 진행하세요."]],
    unavailable_ai: ["이 화면에서는 AI를 쓸 수 없습니다", "claude.ai 밖에서 열었거나 로그인하지 않은 상태입니다.", ["claude.ai에 로그인한 상태로 열거나, 모의 모드로 진행하세요."]],
    refusal: ["AI가 답하지 않았습니다", "자료에 민감해 보이는 내용이 있어 AI가 답을 거절했습니다.", ["민감해 보이는 내용을 빼고 다시 해 보세요."]],
  };
  const http = /^http_(\d+)$/.exec(code || "");
  if (http && ["504", "502", "524"].includes(http[1])) return M.timeout;
  return M[code] || ["AI 호출이 실패했습니다", `알 수 없는 오류입니다 (${esc(code || "코드 없음")}).`, ["잠시 뒤 다시 해 보세요. 계속되면 모의 모드로 진행하세요."]];
}
function showAiError(e, where = "AI") {
  const code = e?.code || "unknown"; const [title, why, todo] = aiErrorInfo(code);
  showModal({ tone: "warn", title: `⚠ ${where}: ${title}`,
    body: `<p><b>무슨 일인가요?</b><br>${why}</p><p><b>어떻게 하나요?</b></p><ul>${todo.filter(Boolean).map(x => `<li>${x}</li>`).join("")}</ul><p class="hint">오류 코드: ${esc(code)}${PLATFORM === "vercel" ? " · AI: OpenRouter 무료 모델" : " · AI: Claude(claude.ai)"}</p>`,
    actions: state.mode === "ai" ? [{ id: "to-mock", label: "모의 모드로 전환", primary: true }] : [] });
}

// AI 모드로 처음 바꿀 때 한 번: 무료 모델 안내
let aiNoticeShown = false;
function aiNotice() {
  if (aiNoticeShown) return; aiNoticeShown = true;
  showModal({ title: PLATFORM === "vercel" ? "ℹ️ 무료 AI 모델 안내" : "ℹ️ AI 모드 안내",
    body: PLATFORM === "vercel"
      ? `<ul><li>이 사이트의 AI는 <b>OpenRouter의 무료 모델</b>입니다.</li><li><b>하루·1분 사용 횟수가 정해져 있고</b>, 사이트를 쓰는 모든 사람이 함께 씁니다. 넘으면 잠시 막힙니다.</li><li><b>느립니다.</b> 초안 하나에 1~3분, 챗봇 답 하나에 수십 초 걸릴 수 있습니다.</li><li>무료 모델은 입력을 기록·학습에 쓸 수 있으니 <b>교육용 가상 자료만</b> 넣으세요.</li><li>연습·시연은 <b>모의 모드</b>가 빠르고 한도가 없습니다.</li></ul>`
      : `<ul><li>AI는 <b>보는 사람의 claude.ai 계정</b>으로 동작하고, 그 계정의 사용량을 씁니다.</li><li>처음 쓸 때 허용 창이 뜹니다.</li><li>초안 하나에 수십 초~1분 걸릴 수 있습니다.</li></ul>`,
    actions: [{ id: "to-mock", label: "모의 모드로 돌아가기" }] });
}

document.addEventListener("click", e => {
  const h = e.target.closest(".help-btn");
  if (h) { e.preventDefault(); e.stopPropagation(); if (helpPop && helpPop.dataset.for === h.dataset.help) closeHelp(); else { openHelp(h); helpPop.dataset.for = h.dataset.help; } return; }
  if (helpPop && !e.target.closest(".help-pop")) closeHelp();
  const m = e.target.closest("[data-modal-close], [data-modal-act]");
  if (m) {
    if (m.dataset.modalAct === "to-mock") { state.mode = "mock"; state.error = ""; render(); }
    closeModal();
  }
}, true);
document.addEventListener("keydown", e => { if (e.key === "Escape") { closeHelp(); closeModal(); } });

// 파일을 올리는 칸에 끌어 놓기
document.addEventListener("dragover", e => { const d = e.target.closest?.(".drop"); if (d) { e.preventDefault(); d.classList.add("drag-on"); } });
document.addEventListener("dragleave", e => { e.target.closest?.(".drop")?.classList.remove("drag-on"); });
document.addEventListener("drop", e => {
  const d = e.target.closest?.(".drop"); if (!d) return;
  e.preventDefault(); d.classList.remove("drag-on");
  const input = d.querySelector('input[type="file"]'); if (!input || !e.dataTransfer?.files?.length) return;
  const dt = new DataTransfer();
  for (const f of e.dataTransfer.files) { dt.items.add(f); if (!input.multiple) break; }
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
});
