// ---------- 4. 작성 가이드 ----------
// 섹션마다 '잘한 예 / 아쉬운 예'를 나란히: 넣은 자료 → 매뉴얼에 실제로 들어가는 모습
const gImg = name => DATA.samples.images.find(i => i.name === name)?.dataUrl || "";
const gPaper = (heading, md, images = {}) => {
  // 매뉴얼 미리보기: 검토 화면과 같은 렌더링(그림·[캡처 필요] 포함)
  let html = ""; let pos = 0;
  for (const m of md.matchAll(TOKEN_RE)) {
    html += renderBlock(md.slice(pos, m.index));
    const [name, caption = ""] = m[2].split("|");
    html += m[1] === "IMAGE" && images[name]
      ? `<figure><img src="${images[name]}" alt="${esc(caption || name)}"><figcaption>[그림] ${esc(caption || name)}</figcaption></figure>`
      : `<div class="capture"><span>📷 [캡처 필요] ${esc(m[1] === "IMAGE" ? caption || name : m[2])}</span></div>`;
    pos = m.index + m[0].length;
  }
  return `<div class="paper"><div class="paper-h">${esc(heading)}</div><div class="md">${html + renderBlock(md.slice(pos))}</div></div>`;
};
const gInput = (label, text) => `<div class="g-in"><span class="g-label">${label}</span><div class="g-quote">${text}</div></div>`;
const gSide = (kind, input, heading, md, images, note) => `
  <div class="g-side ${kind}">
    <div class="g-badge">${kind === "good" ? "✅ 잘한 예" : "❌ 아쉬운 예"}</div>
    ${input}
    <div class="g-arrow">↓ 매뉴얼에는 이렇게 들어갑니다</div>
    ${gPaper(heading, md, images)}
    ${note ? `<p class="g-note">${note}</p>` : ""}
  </div>`;
const gFile = name => `<span class="g-chip">📄 ${esc(name)}</span>`;
const gImgChip = (name, step, caption) => `<span class="g-imgchip"><img src="${gImg(name)}" alt="">${esc(name)}${step ? ` · 단계 ${esc(step)}` : " · 단계 없음"}${caption === null ? "" : caption ? ` · “${esc(caption)}”` : " · 설명 없음"}</span>`;

const GUIDE_SECTIONS = [
  {
    no: "1", title: "업무개요", tip: "무슨 업무인지, 누가 어디로 신청하는지, 예외적인 접수 방식",
    good: { input: gInput("줄글", "펀드변경: 계약자가 창구·콜센터로 신청하면 적립금을 다른 펀드로 옮기거나(적립금 이전) 앞으로 낼 보험료 비율을 바꿈(투입비율 변경). 둘 다 신청하면 2건으로 나눠 입력."),
      md: "변액보험 계약자의 신청에 따라 적립금을 다른 펀드로 옮기거나(적립금 이전), 앞으로 납입할 보험료의 펀드별 투입비율을 바꾸는(투입비율 변경) 업무이다.\n\n- 접수 경로: 창구, 콜센터\n- 두 가지를 함께 신청한 경우 건을 2개로 나누어 입력한다." },
    bad: { input: gInput("줄글", "펀드 바꿔주는 업무."), md: "변액보험 계약자의 펀드를 변경하는 업무이다.\n\n- 접수 경로 [확인 필요]\n- 변경 종류 [확인 필요]", note: "누가·어디로·무엇을 바꾸는지 없어서 빈칸이 [확인 필요]로 남습니다." },
  },
  {
    no: "2", title: "관련규정", tip: "기준·한도·수수료·오류코드. 숫자는 정확히, 한 줄에 하나씩",
    good: { input: gInput("줄글", "연 12회 무료, 13회부터 건당 2,000원(적립금 차감).<br>비율 합계 100% 아니면 E-102, 10% 단위 아니면 E-103.<br>판매중지 펀드는 선택 불가(E-105). 기준가는 신청일 +2영업일."),
      md: "| 항목 | 기준 |\n|---|---|\n| 무료 변경 횟수 | 연 12회 (13회차부터 건당 2,000원, 적립금에서 차감) |\n| 비율 합계 | 100% (위반 시 E-102) |\n| 비율 단위 | 10% (위반 시 E-103) |\n| 판매중지 펀드 | 이전 대상으로 선택 불가 (E-105) |\n| 적용 기준가 | 신청일 +2영업일 |" },
    bad: { input: gInput("줄글", "수수료 있음. 오류 나면 고치면 됨."), md: "| 항목 | 기준 |\n|---|---|\n| 무료 변경 횟수 | [확인 필요] |\n| 수수료 | 있음 (금액 [확인 필요]) |\n| 오류 기준 | [확인 필요] |", note: "몇 회부터, 얼마인지, 어떤 오류인지가 없으면 표가 [확인 필요]로 채워집니다." },
  },
  {
    no: "3", title: "업무흐름도", tip: "흐름도 이미지를 '3' 단계로 올리거나, ① → ② → ③ 순서를 줄글로",
    good: { input: gInput("캡처 이미지", gImgChip("업무흐름도.png", "3", "펀드변경 업무 전체 흐름")), md: "{{IMAGE:업무흐름도.png|펀드변경 업무 전체 흐름}}", images: { "업무흐름도.png": gImg("업무흐름도.png") } },
    bad: { input: gInput("줄글", "(흐름 설명 없음, 흐름도 이미지도 없음)"), md: "① 신청 접수 → ② [확인 필요] → ③ 처리", note: "이미지가 없으면 줄글에서 순서를 찾아 텍스트 흐름으로 씁니다. 순서가 없으면 빈칸이 생깁니다." },
  },
  {
    no: "4", title: "처리절차", tip: "메뉴 이름 그대로 화면 경로, 버튼 순서, 하지 말아야 할 순서. 해당 화면 캡처를 그 단계에",
    good: { input: gInput("줄글", "[계약조회] → [변액] 탭 → [펀드변경 신청] → 비율 입력 → [검증] → [저장]. 검증 전에 저장 금지.") + gInput("캡처 이미지", gImgChip("캡처1_신청화면.png", "4-3", "펀드변경 신청 화면 — 변경비율 입력")),
      md: "1. [계약조회] → [변액] 탭 → [펀드변경 신청]을 누른다.\n2. 변경구분을 선택하고 펀드와 변경비율을 입력한다.\n\n{{IMAGE:캡처1_신청화면.png|펀드변경 신청 화면 — 변경비율 입력}}\n\n3. [검증]을 누른 뒤 [저장]을 누른다. [검증] 전에 [저장]을 누르지 않는다.", images: { "캡처1_신청화면.png": gImg("캡처1_신청화면.png") } },
    bad: { input: gInput("줄글", "화면에서 입력하고 저장하면 됨."), md: "1. 신청 화면 경로 [확인 필요]\n2. 입력 후 저장한다.\n\n{{CAPTURE_NEEDED:펀드변경 신청 화면}}", note: "화면 경로가 없고 캡처도 없어서 [확인 필요]와 회색 [캡처 필요] 자리가 생깁니다. 검토 화면에서 그 자리에 바로 캡처를 올릴 수 있습니다." },
  },
  {
    no: "5", title: "유의사항·예외", tip: "자주 하는 실수, 예외 상황, 고객에게 안내할 말. 실제 사례가 있으면 함께",
    good: { input: gInput("줄글", "판매중지 펀드로는 못 옮김(작년에 놓쳐서 재처리함). 같은 날 두 번 신청하면 마지막 건만 유효, 앞 건 취소."),
      md: "- 판매중지 펀드는 이전 대상이 될 수 없다. 펀드목록에서 판매상태를 반드시 확인한다. (과거 누락으로 재처리 사례 있음)\n- 같은 날 두 번 신청하면 마지막 건만 유효하며, 앞 건은 취소 처리한다." },
    bad: { input: gInput("줄글", "주의할 거 많음."), md: "- 유의사항 [확인 필요]", note: "'많음'만으로는 쓸 내용이 없습니다. 실수했던 일, 헷갈리는 규칙을 하나씩 적어 주세요." },
  },
  {
    no: "6", title: "관련 양식·쿼리", tip: "쓰는 엑셀 양식, 조회 쿼리는 파일 그대로 올리기(.xlsx, .sql)",
    good: { input: gInput("메모·쿼리·엑셀 파일", gFile("가상_펀드변경조회.sql") + gFile("펀드변경_처리.xlsx")),
      md: "- 펀드변경_처리.xlsx (펀드목록 / 신청샘플 / 체크리스트)\n\n```sql\n-- ① 올해 펀드변경 횟수 확인\nSELECT A.POLICY_NO, COUNT(*) AS CHG_CNT_YTD\n  FROM TB_TEST_FUND_CHG_REQ A\n WHERE A.POLICY_NO = :POLICY_NO\n GROUP BY A.POLICY_NO;\n```" },
    bad: { input: gInput("줄글", "다음 날 쿼리로 확인."), md: "- 반영 확인 쿼리 [확인 필요]", note: "쿼리 이름만 쓰면 내용을 알 수 없습니다. .sql 파일을 올리면 회색 박스로 그대로 들어갑니다." },
  },
];

function renderGuide() {
  const imgs = Object.fromEntries(DATA.samples.images.map(i => [i.name, i.dataUrl]));
  const fields = [
    ["🗂", "작업", "신규 작성 / 갱신 / 업무 추가", "규정이 바뀜 → 갱신"],
    ["📄", "출력 형식", "Word 또는 엑셀 (신규만, 기본값 없음)", "부서 양식이 엑셀이면 엑셀"],
    ["📁", "기존 매뉴얼", ".docx / .xlsx 1개 (갱신·추가)", "가상_업무매뉴얼_v1.xlsx"],
    ["🏷", "추가할 업무명", "새 장·새 시트 이름 (추가만)", "자동재배분"],
    ["✍️", "줄글", "업무를 말하듯 적은 글, 메모 붙여넣기", "아래 1~6 참고"],
    ["🧾", "메모·쿼리·엑셀", ".txt / .sql / .xlsx", "가상_펀드변경조회.sql"],
    ["🖼", "캡처 이미지", ".png / .jpg 여러 장 + 종류·단계·설명", "아래 이미지 참고"],
  ];
  const placeGood = [["3. 업무흐름도", ["업무흐름도.png"]], ["4-3. 화면 입력", ["캡처1_신청화면.png", "캡처2_오류화면.png"]], ["4-4. 결과 기록", ["캡처3_엑셀체크리스트.png", "캡처4_쿼리결과.png"]]];
  const outline = rows => `<div class="g-outline">${rows.map(([sec, names]) => `<div class="g-orow"><span class="g-osec">${esc(sec)}</span><span class="g-othumbs">${names.map(n => `<img src="${imgs[n]}" alt="${esc(n)}" title="${esc(n)}">`).join("")}</span></div>`).join("")}</div>`;
  return `
  <div class="page-head"><h1>작성 가이드</h1>${modeBadge()}</div>
  <div class="stack guide md">
    <div class="panel">
      <div class="g-flow">
        <div><b>1</b> 자료 넣기<span>줄글 · 파일 · 캡처</span></div><i>→</i>
        <div><b>2</b> 초안 확인<span>[확인 필요] · [캡처 필요] 채우기</span></div><i>→</i>
        <div><b>3</b> 확정<span>Word / 엑셀 내려받기</span></div>
      </div>
      <div class="g-rule">💡 <b>적힌 것만 매뉴얼이 됩니다.</b> 없는 내용은 지어내지 않고 <span class="check">[확인 필요]</span>로 남깁니다.</div>
      <div class="toc-links"><a href="#g-fields">입력 칸 한눈에</a><a href="#g-text">섹션별 잘한 예 · 아쉬운 예</a><a href="#g-images">이미지 넣기</a><a href="#g-captions">이미지 한 줄 설명</a><a href="#g-example">예시로 해 보기</a><a href="#g-check">초안 전 점검</a></div>
    </div>

    <section class="panel" id="g-fields"><h2>입력 칸 한눈에</h2>
      <div class="g-cards">${fields.map(([icon, name, what, eg]) => `<div class="g-card"><span class="g-icon">${icon}</span><b>${name}</b><span>${what}</span><span class="hint">예: ${eg}</span></div>`).join("")}</div>
      <div class="notice warn">🔒 주민번호·전화번호·계좌번호는 넣지 마세요. 감지되면 진행이 멈춥니다.</div>
    </section>

    <section class="stack" id="g-text"><div class="g-sechead"><h2>섹션별 잘한 예 · 아쉬운 예</h2><p class="hint">매뉴얼은 아래 6개 섹션으로 만들어집니다. 섹션마다 무엇을 넣으면 어떻게 들어가는지 보세요.</p></div>
      ${GUIDE_SECTIONS.map(g => `
      <section class="panel g-sec" id="g-sec-${g.no}">
        <div class="g-sec-title"><span class="g-no">${g.no}</span><h3>${esc(g.title)}</h3><span class="g-tip">넣을 것: ${esc(g.tip)}</span></div>
        <div class="g-compare">
          ${gSide("good", g.good.input, `${g.no}. ${g.title}`, g.good.md, g.good.images, g.good.note)}
          ${gSide("bad", g.bad.input, `${g.no}. ${g.title}`, g.bad.md, g.bad.images, g.bad.note)}
        </div>
      </section>`).join("")}
    </section>

    <section class="panel" id="g-images"><h2>이미지 넣기</h2>
      <div class="g-compare">
        <div class="g-side good"><div class="g-badge">✅ 단계를 적은 경우</div>
          <div class="g-in"><span class="g-label">올린 이미지</span><div class="g-quote g-chipcol">${GUIDE_EXAMPLE.map(([n, , st]) => gImgChip(n, st, null)).join("")}</div></div>
          <div class="g-arrow">↓ 그 단계 바로 아래에 들어갑니다</div>${outline(placeGood)}</div>
        <div class="g-side bad"><div class="g-badge">❌ 단계를 비운 경우 (초안에도 자리가 없을 때)</div>
          <div class="g-in"><span class="g-label">올린 이미지</span><div class="g-quote g-chipcol">${GUIDE_EXAMPLE.map(([n]) => gImgChip(n, "", null)).join("")}</div></div>
          <div class="g-arrow">↓ 맨 끝 섹션에 한꺼번에 모입니다</div>${outline([["6. 관련 양식·쿼리", GUIDE_EXAMPLE.map(g => g[0])]])}</div>
      </div>
      <div class="g-tips">
        <div>📸 <b>한 장에 한 장면</b><span>신청 · 오류 · 결과 화면을 따로 캡처</span></div>
        <div>🔢 <b>파일명에 순서·내용</b><span>캡처1_신청화면.png · '흐름도·쿼리·엑셀'이 있으면 종류 자동 선택</span></div>
        <div>⬆️ <b>한 단계에 여러 장</b><span>보여 줄 순서대로 올리기 (올린 순서대로 붙음)</span></div>
        <div>⬜ <b>캡처가 없어도 OK</b><span>회색 [캡처 필요] 자리 → 검토 화면에서 바로 올리기</span></div>
      </div>
    </section>

    <section class="panel" id="g-captions"><h2>이미지 한 줄 설명</h2>
      <p class="hint">그림 아래 캡션이 되고 Q&amp;A 검색에도 쓰입니다. <b>"무슨 화면 — 무엇을 보면 되는지"</b>, 15~40자.</p>
      <div class="g-compare">
        <div class="g-side good"><div class="g-badge">✅ 잘한 예</div>${gPaper("4-3. 화면 입력", "{{IMAGE:캡처2_오류화면.png|검증 오류 예시 (E-102 / E-103 / E-105)}}", imgs)}<p class="g-note">오류 코드가 있어 Q&amp;A에서 'E-105'로 찾을 수 있습니다.</p></div>
        <div class="g-side bad"><div class="g-badge">❌ 아쉬운 예</div>${gPaper("4-3. 화면 입력", "{{IMAGE:캡처2_오류화면.png|화면2}}", imgs)}<p class="g-note">무엇을 보라는 그림인지 알 수 없습니다. 실명·계좌번호가 보이는 화면도 쓰지 않습니다.</p></div>
      </div>
      <div class="g-cards">${GUIDE_EXAMPLE.slice(1).map(([n, , , c]) => `<div class="g-card g-capcard"><img src="${imgs[n]}" alt=""><span>✅ ${esc(c)}</span></div>`).join("")}</div>
    </section>

    <section class="panel" id="g-example"><h2>예시로 해 보기 (펀드변경 원자료)</h2>
      <div class="g-cards">${GUIDE_EXAMPLE.map(([n, t, s, c]) => `<div class="g-card g-capcard"><img src="${imgs[n]}" alt=""><b>${esc(n)}</b><span>${esc(t)} · 단계 ${esc(s)}</span><span class="hint">${esc(c)}</span></div>`).join("")}</div>
      <p class="hint">메모·쿼리·엑셀 파일(memo_펀드변경.txt, 가상_펀드변경조회.sql, 펀드변경_처리.xlsx)도 함께 들어갑니다. 출력 형식은 직접 고르세요. 작업별 전체 과정은 '6. 개정 예시'에 있습니다.</p>
      <div class="row"><button class="btn primary" id="guide-fill">이 예시대로 자료 입력 채우기</button></div>
    </section>

    <section class="panel" id="g-check"><h2>초안 생성 전 점검</h2>
      <ul class="g-checklist">
        <li>작업 · 출력 형식(신규) 또는 기존 매뉴얼·시트(갱신) · 업무명(추가)을 정했다</li>
        <li>줄글에 기준 숫자 · 화면 경로 · 예외가 있다</li>
        <li>이미지마다 종류 · 배치할 단계 · 한 줄 설명을 확인했다</li>
        <li>다른 업무의 캡처나 개인정보가 섞이지 않았다</li>
        <li>초안의 [확인 필요] · [캡처 필요] 개수를 보고 피드백으로 채운다</li>
        <li>갱신이면 <span class="chg mod">변경</span> <span class="chg add">추가</span> <span class="chg del">삭제</span> 배지로 달라진 곳을 확인한다</li>
      </ul>
    </section>
  </div>`;
}
