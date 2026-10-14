// ---------- 6. 개정 예시 ----------
// As-Is 파일과 사이트 입력값으로 To-Be 파일(mock/예상결과_*)을 만드는 절차. 모두 모의 모드 기준.
const EX_FILE = key => { const [group, name] = key.split("."); return DATA[group][name]; };
const EX_CONFIRM_STEP = (ver, summary) => `2 검토·확정 아래 '최종 컨펌'에서 작성자 <b>담당자A</b>, 검토자 <b>파트장C</b>를 넣고, 개정내용은 <b>${summary}</b>, 버전 번호는 <b>${ver}</b>를 고른 뒤 [최종 컨펌]을 누릅니다.`;
const EX_DOWNLOAD_STEP = kind => `[매뉴얼 ${kind} 내려받기]로 받은 파일을 위의 To-Be 파일과 나란히 열어 비교합니다.`;
const FUND_RAW = "memo_펀드변경.txt, 가상_펀드변경조회.sql, 펀드변경_처리.xlsx + 캡처 이미지 5장";
const FUND_IMAGES_ROW = ["캡처 이미지 5장", "업무흐름도.png, 캡처1_신청화면.png ~ 캡처4_쿼리결과.png — 종류·배치할 단계는 '작성 가이드 — 예시로 해 보기'와 같게, 한 줄 설명은 비워 둠(초안에 있는 설명이 들어갑니다)"];
const EXAMPLES = [
  {
    id: "addWord", tab: "추가 · Word", title: "Word 매뉴얼에 업무 추가 — 7장 '변액 자동재배분'",
    lead: "1~6장짜리 펀드변경 매뉴얼(버전 2) 맨 뒤에 자동재배분 업무를 7장으로 붙입니다. 기존 1~6장은 한 글자도 바뀌지 않습니다.",
    asis: { key: "existing.wordV2", points: ["표지: 계약관리부 | 버전 2", "개정이력 2줄 (v1 최초 작성 / v2 AI 초안 기반 전면 개정)", "1. 업무개요 ~ 6. 관련 양식·쿼리, 그림 5장"] },
    tobe: { key: "expected.addWord", points: ["1~6장은 그대로(그림 5장도 그대로)", "<b>7. 변액 자동재배분</b> 새 장: 7-1 업무개요 ~ 7-6 관련 양식·쿼리, 처리절차는 7-4-1 신청 / 7-4-2 해지", "표지: <b>버전 3</b>", "개정이력 3번째 줄: 3 | 7장 '변액 자동재배분' 추가 | 담당자A | 파트장C"] },
    inputs: [["동작 모드", "모의"], ["작업", "기존 매뉴얼에 업무 추가"], ["기존 매뉴얼", "예상결과_펀드변경_매뉴얼_v2.docx (위 As-Is 파일)"], ["추가할 업무명", "변액 자동재배분"], ["줄글 입력", "memo_자동재배분_러프.txt 내용을 그대로 붙여넣기 (아래 '입력한 글 보기')"], ["메모·쿼리·엑셀 / 캡처 이미지", "없음"]],
    text: "autoMemo",
    steps: [
      "왼쪽 아래 동작 모드를 <b>모의</b>로 둡니다.",
      "1 자료 입력에서 작업을 <b>기존 매뉴얼에 업무 추가</b>로 고릅니다.",
      "'기존 매뉴얼' 칸에 As-Is 파일(예상결과_펀드변경_매뉴얼_v2.docx)을 올립니다. 출력 형식은 자동으로 Word가 됩니다.",
      "추가할 업무명에 <b>변액 자동재배분</b>을 씁니다. 이 이름이 7장 제목이 됩니다.",
      "줄글 입력에 자동재배분 메모를 붙여넣고 [초안 생성]을 누릅니다.",
      "2 검토·확정의 As-Is 장 목록 맨 끝에 '➕ 7. 변액 자동재배분 ← 맨 뒤에 새 장으로 추가'가 보이는지 확인합니다. To-Be의 1~6 섹션이 파일에서는 7-1 ~ 7-6이 됩니다.",
      "[확인 필요] 5곳, [캡처 필요] 2곳이 남아 있다고 나옵니다. 예시 파일도 이 칸들이 비어 있는 상태라 그대로 확정합니다.",
      EX_CONFIRM_STEP("큰 개정 → v3", "7장 '변액 자동재배분' 추가 (자동으로 채워짐)"),
      EX_DOWNLOAD_STEP("Word"),
    ],
    why: ["모의 모드에서는 줄글이나 업무명에 '자동재배분'이 있으면 미리 만든 자동재배분 초안을 씁니다. AI 모드면 메모를 읽고 새로 씁니다.", "업무 추가는 기존 문서를 다시 만들지 않고, 맨 뒤에 쪽 나눔 + 새 장만 붙입니다. 개정이력 표에 한 줄을 더하고 표지의 버전을 바꿉니다.", "예시 파일은 예전 규칙(+1)으로 만들어 버전 3입니다. '작은 수정'을 고르면 v2.1이 되고, 나머지 내용은 같습니다."],
    diff: ["표지 줄: 사이트 결과는 '버전 3', 예시 파일은 '버전 2' 그대로입니다(예시 파일은 개정이력 표만 3으로 올렸습니다)."],
    fill: { job: "추가", existing: "wordV2", task: "변액 자동재배분", text: "autoMemo", confirm: { verKind: "major" } },
  },
  {
    id: "addExcel", tab: "추가 · 엑셀", title: "엑셀 매뉴얼에 업무 추가 — '자동재배분' 시트",
    lead: "목차·펀드변경·주소변경 시트가 있는 엑셀 매뉴얼 맨 뒤에 '자동재배분' 시트를 붙이고, 목차 시트에 한 줄을 더합니다.",
    asis: { key: "existing.excelV1", points: ["시트 3개: 목차 / 펀드변경 / 주소변경", "목차 표: 펀드변경, 주소변경 2줄"] },
    tobe: { key: "expected.addExcel", points: ["목차·펀드변경·주소변경 시트는 그대로", "맨 뒤 <b>자동재배분</b> 시트: 제목, '버전 1 / 작성 담당자A', 1~6 섹션", "목차 표 마지막 줄: 자동재배분 | 변액보험 자동재배분 | 확정한 날짜"] },
    inputs: [["동작 모드", "모의"], ["작업", "기존 매뉴얼에 업무 추가"], ["기존 매뉴얼", "가상_업무매뉴얼_v1.xlsx (위 As-Is 파일)"], ["추가할 업무명", "자동재배분 (이 이름이 시트 이름이 됩니다)"], ["줄글 입력", "memo_자동재배분_러프.txt 내용 붙여넣기"], ["메모·쿼리·엑셀 / 캡처 이미지", "없음"]],
    text: "autoMemo",
    steps: [
      "동작 모드 <b>모의</b>, 작업 <b>기존 매뉴얼에 업무 추가</b>.",
      "'기존 매뉴얼' 칸에 가상_업무매뉴얼_v1.xlsx를 올립니다.",
      "추가할 업무명에 <b>자동재배분</b>을 씁니다. 같은 이름의 시트가 있으면 경고가 뜹니다.",
      "줄글 입력에 자동재배분 메모를 붙여넣고 [초안 생성].",
      "As-Is 시트 목록 끝에 '➕ 자동재배분 ← 맨 뒤에 새 시트로 추가 ('목차' 시트에 한 줄 추가)'가 보이는지 확인합니다.",
      "2 검토·확정 아래 '최종 컨펌'에서 작성자 <b>담당자A</b>를 넣고 검토자는 비워 둡니다(예시 시트에 검토자가 없습니다). 개정내용은 <b>'자동재배분' 시트 추가</b>(자동으로 채워짐), 버전 번호는 <b>작은 수정 → v1.1</b>을 고른 뒤 [최종 컨펌]을 누릅니다.",
      EX_DOWNLOAD_STEP("엑셀"),
    ],
    why: ["엑셀 업무 추가는 기존 시트 파일을 건드리지 않고 새 시트만 더합니다. 그래서 펀드변경·주소변경 시트는 원본과 똑같습니다.", "새 시트 안의 버전은 그 업무의 첫 판이라 '버전 1'입니다. 파일 이름의 버전(v1.1)은 통합문서 전체의 개정 번호입니다.", "예상결과 파일의 목차 날짜는 만든 날(2026.10.14)이라, 다른 날 확정하면 그 칸만 다릅니다."],
    diff: ["새 시트 제목: 사이트 결과는 '변액보험 자동재배분 <b>업무처리</b>매뉴얼'(초안 제목 그대로), 예시 파일은 '변액보험 자동재배분 업무매뉴얼'(이 통합문서의 다른 시트처럼)."],
    fill: { job: "추가", existing: "excelV1", task: "자동재배분", text: "autoMemo", reviewer: "", confirm: { verKind: "minor" } },
  },
  {
    id: "updWord", tab: "갱신 · Word", title: "Word 매뉴얼 갱신 — 펀드변경 v1 → v2 (전면 개정)",
    lead: "2023년에 만든 버전 1 매뉴얼을 새 메모·쿼리·캡처로 현행화합니다. 규정이 바뀌어(무료 6회 → 12회 등) 큰 개정으로 v2를 만듭니다.",
    asis: { key: "existing.wordV1", points: ["개정이력 1줄 (1 | 2023.03.15 | 최초 작성)", "무료 연 6회, 7회부터 1,000원, 다음 영업일 기준가", "그림 1장"] },
    tobe: { key: "existing.wordV2", points: ["표지: <b>버전 2</b>, 교육용 안내 문구", "무료 연 12회·2,000원·+2영업일, 판매중지·적합성 확인 절차 추가", "처리절차 4-1 ~ 4-4, 그림 5장, 쿼리 회색 박스", "개정이력 2번째 줄: 2 | AI 초안 기반 전면 개정 … | 담당자A | 파트장C"] },
    inputs: [["동작 모드", "모의"], ["작업", "기존 매뉴얼 갱신"], ["기존 매뉴얼", "가상_펀드변경_매뉴얼_v1.docx (위 As-Is 파일)"], ["줄글 입력", "비워 둠"], ["메모·쿼리·엑셀", "memo_펀드변경.txt, 가상_펀드변경조회.sql, 펀드변경_처리.xlsx"], FUND_IMAGES_ROW],
    steps: [
      "동작 모드 <b>모의</b>, 작업 <b>기존 매뉴얼 갱신</b>.",
      "'기존 매뉴얼' 칸에 가상_펀드변경_매뉴얼_v1.docx를 올립니다.",
      "메모·쿼리·엑셀 칸에 3개 파일을, 캡처 이미지 칸에 5장을 올립니다. 이미지마다 종류·배치할 단계를 넣고, 한 줄 설명은 비워 둡니다.",
      "[초안 생성]을 누릅니다.",
      "To-Be에 <span class=\"chg mod\">변경</span> 5곳, <span class=\"chg add\">추가</span> 5곳 배지가 붙습니다. '바뀐 내용 보기'에서 6회 → 12회 같은 차이를 확인합니다.",
      EX_CONFIRM_STEP("큰 개정 → v2", "AI 초안 기반 전면 개정: 규정 현행화(무료 12회·2,000원·+2영업일), 판매중지·적합성 확인 절차 추가, 화면 캡처·쿼리 보강"),
      EX_DOWNLOAD_STEP("Word"),
    ],
    why: ["모의 모드의 펀드변경 초안은 이 To-Be 파일과 같은 내용입니다. AI 모드에서는 원자료와 기존 매뉴얼을 함께 읽고 새로 씁니다.", "갱신 Word는 새 문서로 다시 만들고, 기존 개정이력 표를 이어서 씁니다.", "캡처 이미지를 빼면 그 자리에 회색 [캡처 필요] 칸이 남습니다."],
    fill: { job: "갱신", existing: "wordV1", raw: true, images: true, confirm: { verKind: "major", summary: "AI 초안 기반 전면 개정: 규정 현행화(무료 12회·2,000원·+2영업일), 판매중지·적합성 확인 절차 추가, 화면 캡처·쿼리 보강" } },
  },
  {
    id: "updExcel", tab: "갱신 · 엑셀", title: "엑셀 매뉴얼 갱신 — '펀드변경' 시트만 v2로",
    lead: "시트 3개짜리 엑셀 매뉴얼에서 '펀드변경' 시트 하나만 현행화합니다. 목차·주소변경 시트는 그대로 둡니다.",
    asis: { key: "existing.excelV1", points: ["시트 3개: 목차 / 펀드변경 / 주소변경", "펀드변경 시트: '작성: 담당자B / 2023.03.15', 무료 6회 등 옛 규정, 그림 2장"] },
    tobe: { key: "expected.updExcel", points: ["목차·주소변경 시트는 원본과 같음", "펀드변경 시트: 제목, '<b>버전 2</b> / 작성 담당자A / 검토 파트장C', 개정이력 줄 (v1 → v2)", "새 규정·절차, 그림 5장(오른쪽 K열에 한 줄 설명)"] },
    inputs: [["동작 모드", "모의"], ["작업", "기존 매뉴얼 갱신"], ["기존 매뉴얼", "가상_업무매뉴얼_v1.xlsx (위 As-Is 파일)"], ["갱신할 시트", "펀드변경"], ["메모·쿼리·엑셀", "memo_펀드변경.txt, 가상_펀드변경조회.sql, 펀드변경_처리.xlsx"], FUND_IMAGES_ROW],
    steps: [
      "동작 모드 <b>모의</b>, 작업 <b>기존 매뉴얼 갱신</b>.",
      "'기존 매뉴얼' 칸에 가상_업무매뉴얼_v1.xlsx를 올리고, '갱신할 시트 1개'에서 <b>펀드변경</b>을 고릅니다.",
      "메모·쿼리·엑셀 3개 파일과 캡처 이미지 5장을 올리고 [초안 생성].",
      "As-Is에 기존 시트의 그림 2장과 그 옆·아래 설명이 보이는지 확인합니다. 도형(말풍선) 속 글은 읽지 못한다는 안내가 함께 나옵니다.",
      EX_CONFIRM_STEP("큰 개정 → v2", "규정 현행화, 판매중지·적합성 확인 절차 추가, 캡처·쿼리 보강"),
      EX_DOWNLOAD_STEP("엑셀"),
    ],
    why: ["엑셀 갱신은 고른 시트 파일만 같은 이름·같은 자리에 다시 씁니다. 다른 시트는 바이트까지 같습니다.", "시트 위쪽의 버전 줄과 개정이력 줄도 고른 번호(v2)로 들어갑니다.", "확정 날짜가 예시 파일(2026.10.14)과 다르면 버전 줄·개정이력 줄의 날짜만 다릅니다."],
    fill: { job: "갱신", existing: "excelV1", sheet: "펀드변경", raw: true, images: true, confirm: { verKind: "major", summary: "규정 현행화, 판매중지·적합성 확인 절차 추가, 캡처·쿼리 보강" } },
  },
  {
    id: "newWord", tab: "신규 · Word", title: "신규 Word 매뉴얼 — 펀드변경 원자료로 v1 만들기",
    lead: "기존 매뉴얼 없이 메모·쿼리·엑셀·캡처만으로 처음부터 Word 매뉴얼을 만듭니다.",
    asis: { none: "기존 파일 없음 — 원자료만 넣습니다", points: [FUND_RAW] },
    tobe: { key: "existing.wordV2", label: "본문 비교용", points: ["본문(1~6장, 그림 5장)은 위 파일과 같습니다", "다른 점: 표지 <b>버전 1</b>, 개정이력은 '1 | 최초 작성' 한 줄"] },
    inputs: [["동작 모드", "모의"], ["작업", "신규 작성"], ["출력 형식", "Word (기본값이 없어 꼭 골라야 합니다)"], ["줄글 입력", "비워 둠"], ["메모·쿼리·엑셀", "memo_펀드변경.txt, 가상_펀드변경조회.sql, 펀드변경_처리.xlsx"], FUND_IMAGES_ROW],
    steps: [
      "동작 모드 <b>모의</b>, 작업 <b>신규 작성</b>, 출력 형식 <b>Word</b>.",
      "메모·쿼리·엑셀 3개 파일과 캡처 이미지 5장을 올리고, 이미지마다 종류·배치할 단계를 넣습니다(한 줄 설명은 비워 둠).",
      "[초안 생성] → 2 검토·확정에서 섹션별로 확인합니다. 고칠 곳은 '피드백·편집'에서 본문을 고치고 [반영].",
      EX_CONFIRM_STEP("v1 (신규는 고르지 않음)", "최초 작성 (자동으로 채워짐)"),
      EX_DOWNLOAD_STEP("Word"),
    ],
    why: ["신규는 항상 v1이고, 매뉴얼 폴더에 새 폴더가 생깁니다.", "출처 태그([메모]·[SQL] 등)는 화면에만 보이고 파일에서는 빠집니다."],
    fill: { job: "신규", format: "docx", raw: true, images: true, confirm: {} },
  },
  {
    id: "newExcel", tab: "신규 · 엑셀", title: "신규 엑셀 매뉴얼 — 같은 원자료로 시트 1장",
    lead: "같은 펀드변경 원자료로 엑셀 매뉴얼(시트 1장)을 처음 만듭니다.",
    asis: { none: "기존 파일 없음 — 원자료만 넣습니다", points: [FUND_RAW] },
    tobe: { key: "expected.newExcel", label: "배치 비교용", points: ["'펀드변경' 시트 1장: 제목 → 섹션 → 표·쿼리·그림 배치가 예시와 같음", "다른 점: B3 버전 줄(신규라 <b>버전 1</b>)과 B4 개정이력 줄 — 예시 파일은 v2로 만든 것"] },
    inputs: [["동작 모드", "모의"], ["작업", "신규 작성"], ["출력 형식", "엑셀"], ["메모·쿼리·엑셀", "memo_펀드변경.txt, 가상_펀드변경조회.sql, 펀드변경_처리.xlsx"], FUND_IMAGES_ROW],
    steps: [
      "동작 모드 <b>모의</b>, 작업 <b>신규 작성</b>, 출력 형식 <b>엑셀</b>.",
      "메모·쿼리·엑셀 3개 파일과 캡처 이미지 5장을 올리고 [초안 생성].",
      EX_CONFIRM_STEP("v1 (신규는 고르지 않음)", "최초 작성 (자동으로 채워짐)"),
      EX_DOWNLOAD_STEP("엑셀"),
    ],
    why: ["시트 이름은 업무명의 마지막 낱말(펀드변경)입니다.", "[확인 필요]는 노란 칸, [캡처 필요]는 회색 칸으로 남고, 그림의 한 줄 설명은 그림 오른쪽 K열에 '← 설명'으로 들어갑니다."],
    fill: { job: "신규", format: "xlsx", raw: true, images: true, confirm: {} },
  },
];

async function fillExample(ex) {
  const c = ex.fill; const s = DATA.samples;
  Object.assign(state, { mode: "mock", job: c.job, format: c.format || null, text: c.text ? s[c.text] : "", task: c.task || "", files: [], existing: null, sheet: null,
    error: "", link: null, draft: null, confirmed: null, author: "담당자A", reviewer: c.reviewer ?? "파트장C", summary: undefined, exConfirm: c.confirm || null });
  if (c.raw) {
    await addRawFile(s.memo.name, { text: s.memo.text }); await addRawFile(s.sql.name, { text: s.sql.text });
    state.files.push({ id: nextId++, name: s.xlsx.name, kind: "엑셀", text: s.xlsx.text, leaks: [] });
  }
  if (c.images) for (const im of s.images) {
    await addRawFile(im.name, { dataUrl: im.dataUrl });
    const meta = GUIDE_EXAMPLE.find(g => g[0] === im.name); const f = state.files.find(x => x.name === im.name);
    if (meta && f) Object.assign(f, { imgType: meta[1], step: meta[2], caption: "" });
  }
  if (c.existing) { const f = DATA.existing[c.existing]; await setExisting(f.name, b64Buffer(f.b64)); if (c.sheet) state.sheet = c.sheet; }
  state.page = "input";
}
// 예시로 채운 경우, 초안이 나온 뒤 버전 선택과 개정내용을 예시대로 맞춘다.
function applyExampleConfirm() {
  const c = state.exConfirm; const d = state.draft; state.exConfirm = null;
  if (!c || !d) return;
  if (c.verKind) { state.verKind = c.verKind; d.version = draftVersion(d, c.verKind); }
  if (c.summary) state.summary = c.summary;
}

// ----- 예시 화면: 실제 파일 내용으로 As-Is → 넣은 자료 → To-Be -----
// asis/tobe: 실제 파일을 페이지에서 읽어 섹션별로 보여 준다(To-Be는 사이트 결과와 같음을 시험으로 확인한 예상결과 파일).
// mock: 같은 내용의 모의 초안(출처 태그가 남아 있음) — 섹션마다 '어느 자료에서 왔는지'를 보여 주는 데 쓴다.
const EX_VIEW = {
  addWord: { kind: "add", asis: { key: "existing.wordV2" }, tobe: { key: "expected.addWord", only: "7" }, mock: "auto", chapter: "7" },
  addExcel: { kind: "add", asis: { key: "existing.excelV1", sheet: "펀드변경", sheets: true }, tobe: { key: "expected.addExcel", sheet: "자동재배분" }, mock: "auto" },
  updWord: { kind: "update", asis: { key: "existing.wordV1" }, tobe: { key: "existing.wordV2" }, mock: "fund" },
  updExcel: { kind: "update", asis: { key: "existing.excelV1", sheet: "펀드변경" }, tobe: { key: "expected.updExcel", sheet: "펀드변경" }, mock: "fund" },
  newWord: { kind: "new", tobe: { key: "existing.wordV2" }, mock: "fund", note: "사이트 결과는 표지 '버전 1', 개정이력 '1 | 최초 작성' 한 줄만 다릅니다." },
  newExcel: { kind: "new", tobe: { key: "expected.newExcel", sheet: "펀드변경" }, mock: "fund", note: "사이트 결과는 시트 위쪽 버전 줄(버전 1)과 개정이력 줄만 다릅니다." },
};
// 출처 태그 → 사람이 읽는 자료 이름
const EX_SRC = {
  fund: { "메모": "memo_펀드변경.txt", "SQL": "가상_펀드변경조회.sql", "엑셀": "펀드변경_처리.xlsx", "캡처1": "캡처1_신청화면.png", "캡처2": "캡처2_오류화면.png", "캡처3": "캡처3_엑셀체크리스트.png", "캡처4": "캡처4_쿼리결과.png" },
  auto: { "메모": "줄글(자동재배분 메모)" },
};
const exViews = {};  // 예시별로 한 번만 읽는다
async function readManual(ref, prefix) {
  const f = EX_FILE(ref.key); const buf = b64Buffer(f.b64);
  if (/\.docx$/i.test(f.name)) { const d = await parseDocx(buf, prefix); return { name: f.name, title: d.title, version: d.version, history: d.history, sections: d.sections, images: d.images }; }
  const zip = await JSZip.loadAsync(buf); const book = await xlsxBook(zip);
  const p = await parseSheet(zip, book, ref.sheet, prefix);
  return { name: f.name, title: p.title, version: p.version, history: p.history, sections: p.sections, images: p.images, sheets: book.sheets.map(x => x.name), sheet: ref.sheet };
}
function sourcesOf(md, srcMap) {
  // 모의 초안의 섹션별 출처 태그와 그림 파일명
  const out = {};
  for (const s of splitSections(splitFrontmatter(md)[1])) {
    const tags = new Set();
    for (const m of s.text.matchAll(/\[(메모|줄글|SQL|기존매뉴얼|엑셀(?::[^\]]*)?|캡처\d*)\]/g)) { const k = m[1].startsWith("엑셀") ? "엑셀" : m[1]; tags.add(srcMap[k] ? `${srcMap[k]}${m[1].includes(":") ? ` (${m[1].split(":")[1]} 시트)` : ""}` : m[1]); }
    for (const m of s.text.matchAll(TOKEN_RE)) if (m[1] === "IMAGE") tags.add(m[2].split("|")[0]);
    out[s.no] = [...tags];
  }
  return out;
}
async function loadExampleView(ex) {
  if (exViews[ex.id]) return exViews[ex.id];
  const v = EX_VIEW[ex.id];
  const view = { asis: v.asis ? await readManual(v.asis, `exa_${ex.id}_`) : null, tobe: await readManual(v.tobe, `ext_${ex.id}_`), src: sourcesOf(DATA.mock[v.mock], EX_SRC[v.mock]) };
  if (v.tobe.only) view.tobe.sections = view.tobe.sections.filter(s => s.no === v.tobe.only || s.no.startsWith(v.tobe.only + "-"));
  return (exViews[ex.id] = view);
}

const exPaper = (s, images) => gPaper(`${s.no}. ${s.title}`, stripTags(s.text), images);
const hasImage = s => [...(s?.text || "").matchAll(TOKEN_RE)].some(m => m[1] === "IMAGE");
// 접고 펼치기: '모두 펼치기/접기'를 누르면 그 값, 아니면 기본(같음·그림 있는 섹션은 접힘)
const exOpen = (ex, byDefault) => state.exFoldAll?.[ex.id] ?? byDefault;
const exFold = (summary, body, open, cls = "") => `<details class="ex-fold ${cls}" ${open ? "open" : ""}><summary>${summary}</summary><div class="ex-fold-body">${body}</div></details>`;
const exFoldBar = ex => `<div class="row ex-foldbar"><button class="btn small" data-ex-fold="open">모두 펼치기</button><button class="btn small" data-ex-fold="close">모두 접기</button><span class="hint">같은 섹션과 그림이 있는 섹션은 접혀 있습니다. 제목을 누르면 펼쳐집니다.</span></div>`;
const exSecList = (ex, sections, images, srcFor) => `<div class="ex-secs">${sections.map(s => exFold(
  `<b>${esc(s.no)}. ${esc(s.title)}</b>${hasImage(s) ? ' <span class="hint">🖼 그림 있음</span>' : ""}${exChecks(s) ? ` <span class="hint">· [확인 필요]·[캡처 필요] ${exChecks(s)}</span>` : ""}`,
  exPaper(s, images) + (srcFor ? exSrcLine(srcFor(s.no), exViews[ex.id]) : ""), exOpen(ex, !hasImage(s)), s.level > 1 ? "ex-sub" : "")).join("")}</div>`;
const exChecks = s => (s.text.split(CHECK).length - 1) + [...s.text.matchAll(TOKEN_RE)].filter(m => m[1] === "CAPTURE_NEEDED").length;
function exSrcLine(srcNo, view) {
  const list = view.src[srcNo] || [];
  return list.length ? `<p class="ex-src">📎 출처: ${list.map(x => `<span class="g-chip">${esc(x)}</span>`).join(" ")}</p>` : "";
}
function exInputs(ex) {
  // ② 넣은 자료: 실제로 넣은 글·파일 내용·이미지
  const c = ex.fill; const s = DATA.samples; const parts = [];
  if (c.task) parts.push(`<div class="g-in"><span class="g-label">추가할 업무명</span><div class="g-quote"><b>${esc(c.task)}</b></div></div>`);
  if (c.text) parts.push(`<div class="g-in"><span class="g-label">줄글 입력</span><pre class="ex-text">${esc(s[c.text])}</pre></div>`);
  if (c.raw) for (const [label, f] of [["메모 파일", s.memo], ["쿼리 파일", s.sql], ["엑셀 파일 (글자만 발췌)", s.xlsx]])
    parts.push(`<details class="ex-file"><summary><span class="g-chip">📄 ${esc(f.name)}</span> <span class="hint">${label} — 내용 보기</span></summary><pre class="ex-text">${esc(f.text)}</pre></details>`);
  if (c.images) parts.push(`<div class="g-in"><span class="g-label">캡처 이미지 ${s.images.length}장 (종류 · 배치할 단계)</span><div class="g-cards">${GUIDE_EXAMPLE.map(([n, t, st]) => `<div class="g-card g-capcard"><img src="${gImg(n)}" alt=""><b>${esc(n)}</b><span>${esc(t)} · 단계 ${esc(st)}</span></div>`).join("")}</div></div>`);
  if (!c.text && !c.raw && !c.images) parts.push('<p class="hint">따로 넣은 자료 없음</p>');
  return parts.join("");
}
function exAsIs(ex, view) {
  const v = EX_VIEW[ex.id]; const a = view.asis;
  if (!a) return `<p class="hint">기존 파일 없이 ②의 자료만으로 새로 만듭니다.</p>`;
  const head = `<p class="ex-meta"><code>${esc(a.name)}</code>${a.sheet ? ` &gt; <b>${esc(a.sheet)}</b> 시트` : ""} · ${esc(a.title)}${a.version ? ` · 버전 ${esc(a.version)}` : ""}${a.history?.length ? ` · 개정이력 ${a.history.length}줄` : ""}</p>`;
  const body = exSecList(ex, a.sections, a.images, null);
  if (v.kind === "add") {
    const toc = v.asis.sheets ? a.sheets.map(n => `<li>${esc(n)} 시트 <span class="hint">— 그대로</span></li>`).join("")
      : a.sections.filter(s => s.level === 1).map(s => `<li>${esc(s.no)}. ${esc(s.title)} <span class="hint">— 그대로</span></li>`).join("");
    return head + `<ul class="toc">${toc}</ul><details><summary class="hint">As-Is ${v.asis.sheets ? `'${esc(a.sheet)}' 시트` : "본문"} 내용 펼쳐 보기</summary>${body}</details>`;
  }
  return head + (v.kind === "update" ? "" : body);
}
function exToBe(ex, view) {
  const v = EX_VIEW[ex.id]; const t = view.tobe;
  const head = `<p class="ex-meta"><code>${esc(t.name)}</code>${t.sheet ? ` &gt; <b>${esc(t.sheet)}</b> 시트` : ""} · ${esc(t.title)}${t.version ? ` · 버전 ${esc(t.version)}` : ""}</p>
    <p class="hint">사이트에서 위 자료로 만든 파일과 같은 내용입니다(시험으로 확인). 문장 끝 출처 태그는 화면에서만 보이고 파일에는 없습니다. 섹션마다 📎 출처는 어느 자료에서 온 내용인지입니다.</p>
    ${v.note ? `<p class="hint">※ ${esc(v.note)}</p>` : ""}`;
  const srcNo = no => v.chapter ? no.replace(new RegExp(`^${v.chapter}-?`), "") : no;
  if (v.kind === "update") {
    const cmp = compareSections(view.asis.sections, t.sections);
    const count = k => Object.values(cmp.result).filter(r => r.status === k).length;
    const rows = t.sections.map(s => {
      const r = cmp.result[s.no]; const before = r.from;
      const badge = r.status === "동일" ? '<span class="hint">같음</span>' : `<span class="chg ${r.status === "추가" ? "add" : "mod"}">${r.status}</span>`;
      const head = `<b>${esc(s.no)}. ${esc(s.title)}</b> ${badge}${before && (before.no !== s.no || before.title !== s.title) ? ` <span class="hint">← As-Is '${esc(before.no)}. ${esc(before.title)}'</span>` : ""}${hasImage(s) || hasImage(before) ? ' <span class="hint">🖼</span>' : ""}${exChecks(s) ? ` <span class="hint">· 남은 [확인 필요]·[캡처 필요] ${exChecks(s)}</span>` : ""}`;
      return exFold(head, `
        <div class="g-compare"><div class="ex-col"><span class="g-label">As-Is</span>${before ? exPaper(before, view.asis.images) : '<p class="hint">(없던 섹션)</p>'}</div>
          <div class="ex-col"><span class="g-label">To-Be</span>${exPaper(s, t.images)}</div></div>
        ${exSrcLine(s.no, view)}
        ${r.status === "변경" && r.diff.length ? `<details class="diff"><summary>바뀐 줄만 보기 (${r.diff.length}줄)</summary><pre>${r.diff.map(l => `<span class="${l[0] === "+" ? "plus" : "minus"}">${esc(l)}</span>`).join("\n")}</pre></details>` : ""}`,
        exOpen(ex, r.status !== "동일" && !hasImage(s) && !hasImage(before)), `ex-row ${s.level > 1 ? "ex-sub" : ""}`);
    }).join("");
    const deleted = cmp.deleted.map(x => exFold(`<b><s>${esc(x.no)}. ${esc(x.title)}</s></b> <span class="chg del">삭제</span>`, exPaper(x, view.asis.images), exOpen(ex, false), "ex-row")).join("");
    return head + `<p><b>섹션별 비교:</b> 변경 ${count("변경")} · 추가 ${count("추가")} · 삭제 ${cmp.deleted.length} · 같음 ${count("동일")} <span class="hint">(제목이 같거나 비슷한 섹션끼리 짝지음)</span></p>${exFoldBar(ex)}${rows}${deleted}`;
  }
  return head + exFoldBar(ex) + exSecList(ex, t.sections, t.images, srcNo);
}

// ----- 실제로 돌려 보기: 이 화면에서 예시를 그대로 실행해 결과 파일을 만들고 To-Be 파일과 비교 -----
// 입력 화면·초안·폴더는 건드리지 않는다(상태를 저장했다가 되돌림, 폴더에는 저장하지 않음).
const exRuns = {};
async function runExample(ex) {
  const keep = { ...state }; const run = (exRuns[ex.id] = { status: "running" }); render();
  try {
    await fillExample(ex);
    const asis = await readExisting();
    const md = (state.text + (state.job === "추가" ? state.task : "")).includes("자동재배분") ? DATA.mock.auto : DATA.mock.fund;
    const [meta, body] = splitFrontmatter(md); const sections = splitSections(body); placeImages(sections);
    const title = meta.title || "업무처리매뉴얼";
    const d = state.draft = { meta: { title, dept: meta.dept || "계약관리부" }, task: state.job === "추가" ? state.task.trim() : taskLabel(title), sections, job: state.job,
      format: state.job === "신규" ? state.format : state.existing.format, asis, chapterNo: asis ? lastChapterNo(asis.sections) + 1 : 1 };
    // 폴더 상태와 상관없이 같은 결과가 나오도록 '새 폴더·내 컴퓨터' 기준으로 번호를 정한다
    state.verKind = "minor"; d.save = { ...newSaveOptions(d), dest: "local", folderMode: "new" };
    await planVersion(d); applyExampleConfirm();
    const c = { author: state.author, reviewer: state.reviewer, summary: (state.summary ?? defaultSummary()).trim() };
    await buildManualFile(d, c);
    run.filename = saveFileName(d); run.blob = c.blob; run.version = d.version;
    // 만든 파일을 다시 읽어 To-Be 파일과 섹션별로 비교
    const v = EX_VIEW[ex.id]; const view = await loadExampleView(ex); const buf = await c.blob.arrayBuffer();
    let made;
    if (d.format === "docx") made = await parseDocx(buf, `run_${ex.id}_`);
    else { const zip = await JSZip.loadAsync(buf); made = await parseSheet(zip, await xlsxBook(zip), v.tobe.sheet, `run_${ex.id}_`); }
    let mine = made.sections;
    if (v.tobe.only) {
      mine = made.sections.filter(s => s.no === v.tobe.only || s.no.startsWith(v.tobe.only + "-"));
      const rest = made.sections.filter(s => !mine.includes(s));
      run.kept = rest.length === view.asis.sections.length && rest.every((s, i) => s.no === view.asis.sections[i].no && diffLines(s.text).join("\n") === diffLines(view.asis.sections[i].text).join("\n"));
    }
    const want = view.tobe.sections; const rows = [];
    for (const w of want) {
      const m = mine.find(x => x.no === w.no);
      if (!m) { rows.push({ no: w.no, title: w.title, status: "없음" }); continue; }
      const a = diffLines(w.text), b = diffLines(m.text);
      rows.push({ no: w.no, title: w.title, status: a.join("\n") === b.join("\n") && m.title === w.title ? "같음" : "다름", diff: lineDiff(a, b) });
    }
    for (const m of mine) if (!want.some(w => w.no === m.no)) rows.push({ no: m.no, title: m.title, status: "더 있음" });
    run.rows = rows; run.made = { title: made.title, version: made.version }; run.status = "done";
  } catch (e) { run.status = "error"; run.error = String(e?.message || e); }
  finally { for (const k of Object.keys(state)) if (!(k in keep)) delete state[k]; Object.assign(state, keep); render(); }
}
function exRunBox(ex) {
  const run = exRuns[ex.id]; const v = EX_VIEW[ex.id]; const t = exViews[ex.id]?.tobe;
  const btn = `<button class="btn primary" data-ex-run="${ex.id}" ${run?.status === "running" ? "disabled" : ""}>▶ 실제로 돌려 보기</button>`;
  if (!run) return `<div class="ex-run">${btn}<span class="hint">이 화면에서 ②의 자료로 사이트를 그대로 실행해 파일을 만들고, 위 To-Be 파일과 섹션별로 비교합니다. 입력 화면과 매뉴얼 폴더에는 아무것도 바뀌지 않습니다.</span></div>`;
  if (run.status === "running") return `<div class="ex-run">${btn}<span class="hint">실행 중…</span></div>`;
  if (run.status === "error") return `<div class="ex-run">${btn}<div class="notice warn">실행하지 못했습니다: ${esc(run.error)}</div></div>`;
  const same = run.rows.filter(r => r.status === "같음").length; const bad = run.rows.filter(r => r.status !== "같음");
  return `<div class="ex-run">${btn}
    <div class="notice ${bad.length ? "warn" : "ok"}" id="ex-run-result"><b>${bad.length ? "⚠" : "✅"} 섹션 ${run.rows.length}개 중 ${same}개가 To-Be 파일과 같습니다.</b>
      ${v.tobe.only ? `<br>기존 1~6장 그대로: ${run.kept ? "예" : "아니오"}` : ""}
      <br>만든 파일: ${esc(run.filename)} · 버전 ${esc(run.version)}${t?.version && String(t.version) !== String(run.version) ? ` <span class="hint">(To-Be 파일은 버전 ${esc(t.version)} — 아래 '예시 파일과 다른 점' 참고)</span>` : ""}</div>
    ${bad.length ? `<ul>${bad.map(r => `<li><b>${esc(r.no)}. ${esc(r.title)}</b> — ${r.status}${r.diff?.length ? `<pre class="ex-text">${r.diff.map(l => esc(l)).join("\n")}</pre>` : ""}</li>`).join("")}</ul>` : ""}
    <div class="row"><button class="btn small" data-ex-run-dl="${ex.id}">⬇ 만든 파일 내려받기</button></div></div>`;
}

function renderExamples() {
  const ex = EXAMPLES.find(e => e.id === state.exId) || EXAMPLES[0];
  const view = exViews[ex.id];
  if (!view) loadExampleView(ex).then(render).catch(err => { exViews[ex.id] = { error: String(err?.message || err) }; render(); });
  const v = EX_VIEW[ex.id];
  const fileBtn = key => { const f = EX_FILE(key); return `<button class="btn small" data-ex-file="${esc(key)}">⬇ ${esc(f.name)}</button>`; };
  const table = rows => `<div class="table-wrap"><table><tr><th>항목</th><th>입력한 값</th></tr>${rows.map(([k, val]) => `<tr><td>${esc(k)}</td><td>${esc(val)}</td></tr>`).join("")}</table></div>`;
  const loading = '<p class="empty">파일을 읽는 중…</p>';
  const stepTitle = { add: ["① As-Is — 지금 매뉴얼", "② 추가하려고 넣은 자료", `③ To-Be — 새로 붙은 ${ex.id === "addWord" ? "7장" : "시트"}`],
    update: ["① As-Is — 지금 매뉴얼", "② 갱신하려고 넣은 자료", "③ As-Is → To-Be 섹션별로 바뀐 내용"],
    new: ["① As-Is — 기존 매뉴얼 없음", "② 넣은 자료", "③ To-Be — 만들어진 매뉴얼"] }[v.kind];
  return `
  <div class="page-head"><h1>개정 예시</h1>${modeBadge()}</div>
  <div class="stack guide md">
    <div class="panel">
      <p class="lead">As-Is 매뉴얼에 어떤 자료를 넣었더니 To-Be가 어떻게 나오는지, 실제 파일 내용으로 보여 줍니다. [이 예시대로 채우기]로 똑같이 해 볼 수 있습니다.</p>
      <div class="row" role="tablist">${EXAMPLES.map(e => `<button class="btn small ${e.id === ex.id ? "primary" : ""}" role="tab" aria-selected="${e.id === ex.id}" data-ex="${e.id}">${esc(e.tab)}</button>`).join("")}</div>
    </div>
    <section class="panel" id="ex-${ex.id}"><h2>${esc(ex.title)}</h2><p class="lead">${esc(ex.lead)}</p>
      <div class="row">${ex.asis.key ? fileBtn(ex.asis.key) : ""}${ex.tobe.key ? fileBtn(ex.tobe.key) : ""}<span class="hint">As-Is / To-Be 원본 파일 내려받기</span></div>
    </section>
    ${view?.error ? `<div class="notice warn">파일을 읽지 못했습니다: ${esc(view.error)}</div>` : ""}
    <section class="panel ex-step" id="ex-asis"><h2>${stepTitle[0]}</h2>${view && !view.error ? exAsIs(ex, view) : loading}</section>
    <section class="panel ex-step" id="ex-input"><h2>${stepTitle[1]}</h2>${exInputs(ex)}
      <details><summary class="hint">사이트 입력 칸별 값 보기</summary>${table(ex.inputs)}</details>
      <div class="row"><button class="btn primary" data-ex-fill="${ex.id}">이 예시대로 채우기</button><span class="hint">1 자료 입력 화면이 위 자료로 채워지고, 확정 화면의 작성자·검토자·개정내용·버전도 예시대로 들어갑니다.</span></div>
    </section>
    <section class="panel ex-step" id="ex-tobe"><h2>${stepTitle[2]}</h2>${view && !view.error ? exRunBox(ex) + exToBe(ex, view) : loading}
      <div class="notice info"><b>파일 전체로 보면</b><ul>${ex.tobe.points.map(x => `<li>${x}</li>`).join("")}</ul></div></section>
    <section class="panel"><details><summary><b>사이트에서 누르는 순서</b></summary><ol>${ex.steps.map(x => `<li>${x}</li>`).join("")}</ol></details></section>
    <section class="panel"><h2>왜 이렇게 나오나요</h2><ul>${ex.why.map(x => `<li>${x}</li>`).join("")}</ul>
      ${ex.diff ? `<div class="notice info"><b>예시 파일과 다른 점</b><ul>${ex.diff.map(x => `<li>${x}</li>`).join("")}</ul></div>` : ""}
      <p class="hint">매뉴얼 폴더에 같은 이름의 폴더가 이미 있으면, 버전 번호는 그 폴더의 최신 번호 다음으로 붙습니다.</p></section>
  </div>`;
}

document.addEventListener("click", async e => {
  const t = e.target.closest("button"); if (!t) return;
  if (t.dataset.ex) { state.exId = t.dataset.ex; render(); return; }
  if (t.dataset.exFold) { const id = state.exId || EXAMPLES[0].id; state.exFoldAll = { ...(state.exFoldAll || {}), [id]: t.dataset.exFold === "open" }; render(); return; }
  if (t.dataset.exRun) { await runExample(EXAMPLES.find(x => x.id === t.dataset.exRun)); return; }
  if (t.dataset.exRunDl) {
    const run = exRuns[t.dataset.exRunDl];
    try { const dl = await getCap("downloads"); if (dl && run?.blob) await dl.save({ filename: run.filename, data: run.blob }); } catch { /* 저장 취소 */ }
    return;
  }
  if (t.dataset.exFill) { await fillExample(EXAMPLES.find(x => x.id === t.dataset.exFill)); render(); window.scrollTo(0, 0); return; }
  if (t.dataset.exFile) {
    const f = EX_FILE(t.dataset.exFile);
    try { const dl = await getCap("downloads"); if (dl) await dl.save({ filename: f.name, data: new Blob([b64Buffer(f.b64)]) }); } catch { /* 저장 취소 */ }
  }
});
