// ---------- Word 읽기·장 추가 (앱의 word_parser.py / word_writer.append_chapter와 같은 규칙) ----------
const W_HEADING_RE = /^(\d+(?:-\d+)*)\.\s*(.+)$/;
const wText = el => desc(el, NS.w, "t").map(t => t.textContent).join("");

async function docxParts(zip) {
  const docPath = "word/document.xml";
  const doc = parseXml(await zip.file(docPath).async("string"));
  const stylesFile = zip.file("word/styles.xml");
  const styleNames = {};
  if (stylesFile) for (const s of desc(parseXml(await stylesFile.async("string")), NS.w, "style")) {
    styleNames[s.getAttributeNS(NS.w, "styleId")] = kid(s, NS.w, "name")?.getAttributeNS(NS.w, "val") || "";
  }
  return { docPath, doc, styleNames, rels: await readRels(zip, docPath) };
}
const pStyleName = (p, styleNames) => {
  const id = desc(kid(p, NS.w, "pPr"), NS.w, "pStyle")[0]?.getAttributeNS(NS.w, "val") || "";
  return (styleNames[id] || id).toLowerCase();
};
const pBold = p => kids(p, NS.w, "r").some(r => {
  if (!wText(r).trim()) return false;
  const b = desc(kid(r, NS.w, "rPr"), NS.w, "b")[0];
  return b && !["0", "false"].includes(b.getAttributeNS(NS.w, "val"));
});

// 기존 Word 매뉴얼 → 섹션(PRD 6장 5). ① 제목 스타일 ② 없으면 번호로 시작하는 굵은 문단
async function parseDocx(buffer, prefix = "asis_") {
  const zip = await JSZip.loadAsync(buffer);
  const { doc, styleNames, rels } = await docxParts(zip);
  const body = desc(doc, NS.w, "body")[0];
  const items = [...body.childNodes].filter(n => n.nodeType === 1 && (n.localName === "p" || n.localName === "tbl"));
  const paras = items.filter(n => n.localName === "p");
  const heading = (p, useBold) => {
    const m = wText(p).trim().match(W_HEADING_RE);
    if (!m) return null;
    const ok = useBold ? pBold(p) : pStyleName(p, styleNames).startsWith("heading");
    return ok ? [m[1], m[2].trim()] : null;
  };
  const useBold = !paras.some(p => heading(p, false));
  const title = (paras.find(p => pStyleName(p, styleNames) === "title") && wText(paras.find(p => pStyleName(p, styleNames) === "title")).trim()) || "";
  const info = paras.map(wText).find(t => t.includes("버전")) || "";
  const vm = info.match(/버전\s*(\d+(?:\.\d+)?)/);
  let version = vm ? vm[1] : "";
  const dept = info.includes("|") ? info.split("|")[0].trim() : "";

  let history = []; const sections = []; let cur = null; let count = 0; const images = {};
  for (let idx = 0; idx < items.length; idx++) {
    const el = items[idx];
    if (el.localName === "tbl") {
      const rows = desc(el, NS.w, "tr").map(tr => kids(tr, NS.w, "tc").map(tc => kids(tc, NS.w, "p").map(wText).join("\n").trim()));
      if (rows[0] && rows[0].includes("버전") && rows[0].includes("개정일")) { history = rows.slice(1); continue; }
      if (!cur) continue;
      if (rows.length === 1 && rows[0].length === 1) cur.lines.push("```sql\n" + rows[0][0] + "\n```");
      else {
        const clean = rows.map(r => r.map(c => c.replace(/\|/g, "/").replace(/\n/g, " ")));
        cur.lines.push([`| ${clean[0].join(" | ")} |`, "|" + "---|".repeat(clean[0].length), ...clean.slice(1).map(r => `| ${r.join(" | ")} |`)].join("\n"));
      }
      continue;
    }
    const h = heading(el, useBold);
    if (h) { cur = { no: h[0], title: h[1], level: h[0].includes("-") ? 2 : 1, lines: [] }; sections.push(cur); continue; }
    if (!cur) continue;
    const text = wText(el).trim();
    if (text.startsWith("[그림]") && cur.skipCaption) { cur.skipCaption = false; continue; }
    for (const blip of desc(el, NS.a, "blip")) {
      const rel = rels.find(r => r.id === blip.getAttributeNS(NS.r, "embed"));
      if (!rel || !zip.file(rel.path)) continue;
      const ext = rel.path.split(".").pop().toLowerCase();
      const name = `${prefix}${++count}.${ext}`;
      images[name] = bytesToDataUrl(await zip.file(rel.path).async("uint8array"), ext);
      const next = items[idx + 1];
      let caption = "";
      if (next && next.localName === "p" && wText(next).trim().startsWith("[그림]")) { caption = wText(next).trim().replace(/^\[그림\]\s*/, ""); cur.skipCaption = true; }
      cur.lines.push(`{{IMAGE:${name}|${caption}}}`);
    }
    if (text) cur.lines.push(pStyleName(el, styleNames).startsWith("list bullet") ? "- " + text : text);
  }
  sections.forEach(s => { s.text = s.lines.join("\n\n"); delete s.lines; delete s.skipCaption; });
  if (!version && history.length) version = maxLabel(history.map(h => String(h[0]).trim()).filter(isLabel)) || "";
  return { title, dept, version, history, sections, images };
}

const lastChapterNo = sections => Math.max(0, ...sections.map(s => Number(s.no.split("-")[0]) || 0));

// 업무 추가 + Word: 기존 문서 맨 뒤에 새 장. 기존 장은 건드리지 않는다(PRD 6장 8).
async function docxAppendChapter(buffer, { chapterNo, chapterTitle, version, sections, images, revision }) {
  const zip = await JSZip.loadAsync(buffer);
  const { docPath, doc, styleNames } = await docxParts(zip);
  const styleId = name => Object.entries(styleNames).find(([, n]) => n.toLowerCase() === name)?.[0];
  const H = [styleId("heading 1"), styleId("heading 2"), styleId("heading 3") || styleId("heading 2")];
  const bullet = styleId("list bullet"), codeStyle = styleId("code");

  // 개정이력 표에 한 줄, 표지 버전 갱신
  const revTable = desc(doc, NS.w, "tbl").find(t => { const first = desc(t, NS.w, "tr")[0]; return first && kids(first, NS.w, "tc").map(wText).map(s => s.trim()).includes("버전"); });
  if (revTable) {
    const rows = desc(revTable, NS.w, "tr"); const row = rows[rows.length - 1].cloneNode(true);
    kids(row, NS.w, "tc").forEach((tc, i) => {
      const ps = kids(tc, NS.w, "p"); ps.slice(1).forEach(p => tc.removeChild(p));
      const p = ps[0]; kids(p, NS.w, "r").forEach(r => p.removeChild(r));
      const r = doc.createElementNS(NS.w, "w:r"); const t = doc.createElementNS(NS.w, "w:t");
      t.setAttributeNS("http://www.w3.org/XML/1998/namespace", "xml:space", "preserve"); t.textContent = String(revision[i] ?? ""); r.appendChild(t); p.appendChild(r);
    });
    rows[rows.length - 1].parentNode.appendChild(row);
  }
  for (const p of desc(doc, NS.w, "p")) {
    if (!/버전\s*\d+/.test(wText(p))) continue;
    for (const t of desc(p, NS.w, "t")) t.textContent = t.textContent.replace(/버전\s*\d+(?:\.\d+)?/, `버전 ${version}`).replace(/\d{4}\.\d{2}\.\d{2}/, revision[1]);
    break;
  }

  const run = (text, extra = "") => `<w:r>${extra ? `<w:rPr>${extra}</w:rPr>` : ""}<w:t xml:space="preserve">${xesc(text)}</w:t></w:r>`;
  const runs = text => text.split(/(\[확인 필요\]|\*\*[^*]+\*\*)/).filter(Boolean).map(part =>
    part === CHECK ? run(part, '<w:b/><w:color w:val="C55A11"/>') : part.startsWith("**") && part.endsWith("**") ? run(part.slice(2, -2), "<w:b/>") : run(part)).join("");
  const para = (text, style, extra = "") => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ""}${extra}</w:pPr>${runs(text)}</w:p>`;
  const cellBorders = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(s => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join("")}</w:tblBorders>`;
  const box = (lines, fill, opts = {}) => `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${cellBorders}</w:tblPr><w:tr><w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:tcPr>${lines.map(l => opts.code
    ? `<w:p><w:pPr>${codeStyle ? `<w:pStyle w:val="${codeStyle}"/>` : ""}</w:pPr>${run(l || " ", '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/>')}</w:p>`
    : para(l, null, opts.center ? '<w:jc w:val="center"/>' : "")).join("")}</w:tc></w:tr></w:tbl><w:p/>`;
  const table = rows => {
    const cells = rows.map(r => r.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim())).filter(r => !r.every(c => /^:?-{3,}:?$/.test(c)));
    return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/>${cellBorders}</w:tblPr>${cells.map((r, ri) => `<w:tr>${r.map(c => `<w:tc>${ri === 0 ? '<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="DDE5F0"/></w:tcPr>' : ""}<w:p>${ri === 0 ? run(c, "<w:b/>") : runs(c)}</w:p></w:tc>`).join("")}</w:tr>`).join("")}</w:tbl><w:p/>`;
  };
  let imgN = 0;
  const image = async (name, caption) => {
    const url = images[name]; const ext = dataUrlExt(url);
    const media = uniquePath(zip, "word/media", "added", ext);
    zip.file(media, dataUrlBytes(url));
    await ensureContentType(zip, { ext, type: ext === "jpg" ? "image/jpeg" : `image/${ext}` });
    const rid = await addRel(zip, docPath, REL_TYPE.image, `media/${media.split("/").pop()}`);
    const [w, h] = await imageSize(url); const cx = Math.round(14 / 2.54 * 914400), cy = Math.round(cx * h / w); const id = 9000 + (++imgN);
    const drawing = `<w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${id}" name="Picture ${id}"/><a:graphic xmlns:a="${NS.a}"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${xesc(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rid}" xmlns:r="${NS.r}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
    return `<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${drawing}</w:p><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${run(`[그림] ${caption || name}`, '<w:color w:val="595959"/><w:sz w:val="18"/>')}</w:p>`;
  };

  let xml = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` + para(`${chapterNo}. ${chapterTitle}`, H[0]);
  for (const s of sections) {
    xml += para(`${chapterNo}-${s.no}. ${s.title}`, s.level === 1 ? H[1] : H[2]);
    const lines = stripTags(s.text).split("\n");
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t.startsWith("```")) { const code = []; i++; while (i < lines.length && !lines[i].trim().startsWith("```")) code.push(lines[i++].replace(/\s+$/, "")); xml += box(code, "F2F2F2", { code: true }); continue; }
      if (t.startsWith("|")) { const rows = []; while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++]); i--; xml += table(rows); continue; }
      const tok = t.match(/^\{\{(IMAGE|CAPTURE_NEEDED):([^}]*)\}\}$/);
      if (tok) {
        const [name, caption = ""] = tok[2].split("|");
        xml += tok[1] === "IMAGE" && images[name] ? await image(name, caption) : box([`[캡처 필요] ${tok[1] === "IMAGE" ? (caption || name) : tok[2]}`], "D9D9D9", { center: true });
        continue;
      }
      if (t.startsWith("- ")) xml += bullet ? para(t.slice(2), bullet) : para("• " + t.slice(2));
      else if (t) xml += para(t);
    }
  }
  const frag = parseXml(`<w:body xmlns:w="${NS.w}">${xml}</w:body>`);
  const body = desc(doc, NS.w, "body")[0];
  const sectPr = kids(body, NS.w, "sectPr")[0] || null;
  for (const n of [...frag.documentElement.childNodes]) body.insertBefore(doc.importNode(n, true), sectPr);
  zip.file(docPath, serializeXml(doc));
  return zipBlob(zip);
}
