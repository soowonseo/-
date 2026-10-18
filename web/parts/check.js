// ---------- 확정 전 자동 점검표 (AI 안 씀) ----------
// 규칙으로 초안을 훑어 빠진 곳을 알려 준다. 막지는 않고, 누르면 그 섹션으로 간다.
//  ① 비어 있는 섹션  ② 화면 조작이 나오는데 캡처가 없는 섹션  ③ 출처 표시가 없는 문장  ④ 띄어쓰기만 다른 같은 용어
var SCREEN_RE = /화면|버튼|클릭|탭|메뉴|입력란|조회창/;
var PARTICLE_RE = /(에서|으로|에게|까지|부터|이며|이고|은|는|이|가|을|를|의|에|도|로|과|와|만)$/;

function proseLines(text) {
  const out = []; let inCode = false;
  for (const raw of String(text || "").split("\n")) {
    const l = raw.trim();
    if (l.startsWith("```")) { inCode = !inCode; continue; }
    if (inCode || !l || l.startsWith("|") || /^#{1,4}\s/.test(l) || /^\*\*[^*]+\*\*$/.test(l)) continue;
    const bare = l.replace(TOKEN_RE, "").replace(/^([-*]|\d+[.)])\s+/, "").trim();
    if (bare.length >= 15) out.push(l);
  }
  return out;
}
function termStem(w) { return w.length > 2 ? w.replace(PARTICLE_RE, "") : w; }

function qualityChecks(d) {
  const items = [];
  const subsOf = s => d.sections.filter(x => x.level > s.level && x.no.startsWith(s.no + "-"));
  // 고치기에서 손대지 않은 기존 문장은 출처 점검에서 뺀다
  const oldLines = new Set((d.asis?.sections || []).flatMap(s => String(s.text).split("\n").map(l => l.trim())));
  d.sections.forEach((s, si) => {
    const body = s.text.replace(SOURCE_TAG_RE, "").trim();
    const hasSubContent = subsOf(s).some(x => x.text.replace(SOURCE_TAG_RE, "").replace(CHECK, "").trim());
    if (!body && !hasSubContent) items.push({ si, level: "warn", kind: "empty", text: "내용이 비어 있습니다." });
    else if (body.replace(new RegExp(CHECK.replace(/[[\]]/g, "\\$&"), "g"), "").replace(/[\s.·:-]/g, "") === "" && !hasSubContent) items.push({ si, level: "warn", kind: "empty", text: "내용이 [확인 필요]뿐입니다." });
    // 소제목이 있는 큰 섹션은 소제목에서 본다
    const hasToken = t => new RegExp(TOKEN_RE.source).test(t);
    if (!subsOf(s).length && SCREEN_RE.test(s.text.replace(SOURCE_TAG_RE, "")) && !hasToken(s.text))
      items.push({ si, level: "info", kind: "capture", text: "화면 조작이 나오는데 캡처(그림)나 [캡처 필요] 표시가 없습니다." });
    const noSource = proseLines(s.text).filter(l => !new RegExp(SOURCE_TAG_RE.source).test(l) && !l.includes(CHECK) && !oldLines.has(l));
    if (noSource.length) items.push({ si, level: "info", kind: "source", text: `출처 표시가 없는 문장 ${noSource.length}개 — 예: "${noSource[0].replace(TOKEN_RE, "").slice(0, 40)}…"` });
  });
  // 용어: '펀드 변경'처럼 띄어 쓴 두 낱말이 다른 곳에서 '펀드변경'으로 붙어 나오면 알린다
  const all = d.sections.map(s => s.text.replace(SOURCE_TAG_RE, "")).join("\n");
  const stems = new Set((all.match(/[가-힣]{2,}/g) || []).map(termStem));
  const seen = new Set();
  d.sections.forEach((s, si) => {
    for (const m of s.text.matchAll(/([가-힣]{2,})[ ]([가-힣]{2,})/g)) {
      const joined = m[1] + termStem(m[2]);
      if (joined.length < 4 || seen.has(joined) || !stems.has(joined)) continue;
      seen.add(joined);
      items.push({ si, level: "info", kind: "term", text: `같은 용어를 '${m[1]} ${termStem(m[2])}' / '${joined}' 두 가지로 씁니다. 하나로 맞추면 챗봇 검색도 정확해집니다.` });
      if (seen.size >= 5) break;
    }
  });
  return items;
}

function qualityPanel(d) {
  const items = qualityChecks(d);
  if (!items.length) return `<div class="notice ok" id="quality">✅ 확정 전 점검: 비어 있는 섹션, 캡처 없는 화면 단계, 출처 없는 문장, 섞어 쓴 용어가 없습니다.</div>`;
  const warn = items.filter(x => x.level === "warn").length;
  const kinds = { empty: "빈 섹션", capture: "캡처", source: "출처", term: "용어" };
  return `<details class="quality" id="quality" ${warn ? "open" : ""}><summary>🔎 확정 전 점검 — ${items.length}건${warn ? ` (꼭 볼 것 ${warn}건)` : ""} <span class="hint">AI 없이 규칙으로 찾았습니다. 그대로 확정할 수도 있습니다.</span></summary>
    <ul>${items.map(x => { const s = d.sections[x.si]; return `<li class="${x.level}"><span class="q-kind">${kinds[x.kind]}</span><button class="link-btn" data-goto-sec="${x.si}">${esc(s.no)}. ${esc(s.title)}</button> ${esc(x.text)}</li>`; }).join("")}</ul></details>`;
}
