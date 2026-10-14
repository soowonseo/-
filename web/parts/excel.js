// ---------- 엑셀 읽기·쓰기 (앱의 excel_parser.py / excel_writer.py와 같은 규칙) ----------
const colNum = ref => ref.replace(/\d/g, "").split("").reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
const rowNum = ref => Number(ref.replace(/\D/g, ""));
const colLetter = n => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

async function xlsxBook(zip) {
  const wbPath = "xl/workbook.xml";
  const wb = parseXml(await zip.file(wbPath).async("string"));
  const rels = await readRels(zip, wbPath);
  const sheets = desc(wb, NS.main, "sheet").map(s => {
    const rid = s.getAttributeNS(NS.r, "id");
    return { name: s.getAttribute("name"), el: s, rid, path: rels.find(r => r.id === rid)?.path };
  });
  const sstFile = zip.file("xl/sharedStrings.xml");
  const sst = sstFile ? desc(parseXml(await sstFile.async("string")), NS.main, "si").map(si => desc(si, NS.main, "t").map(t => t.textContent).join("")) : [];
  const stylesFile = zip.file("xl/styles.xml");
  const styles = stylesFile ? parseXml(await stylesFile.async("string")) : null;
  const fonts = styles ? kids(kid(styles.documentElement, NS.main, "fonts"), NS.main, "font") : [];
  const fills = styles ? kids(kid(styles.documentElement, NS.main, "fills"), NS.main, "fill") : [];
  const xfs = styles ? kids(kid(styles.documentElement, NS.main, "cellXfs"), NS.main, "xf") : [];
  const xfInfo = xfs.map(xf => {
    const font = fonts[Number(xf.getAttribute("fontId") || 0)];
    const b = font && kid(font, NS.main, "b");
    const fill = fills[Number(xf.getAttribute("fillId") || 0)];
    const pf = fill && kid(fill, NS.main, "patternFill");
    const fg = pf && pf.getAttribute("patternType") === "solid" && kid(pf, NS.main, "fgColor");
    return { bold: !!b && !["0", "false"].includes(b.getAttribute("val")), fill: fg ? (fg.getAttribute("rgb") || "").slice(-6).toUpperCase() : "" };
  });
  return { wb, sheets, sst, xfInfo };
}

async function xlsxSheetNames(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  return (await xlsxBook(zip)).sheets.map(s => s.name);
}

// 시트 하나의 셀(값·굵기·채우기)과 그림(위치·크기·파일)을 읽는다.
async function readSheet(zip, book, sheetName) {
  const sheet = book.sheets.find(s => s.name === sheetName);
  const doc = parseXml(await zip.file(sheet.path).async("string"));
  const cells = [];
  for (const c of desc(doc, NS.main, "c")) {
    const t = c.getAttribute("t");
    let v = "";
    if (t === "s") v = book.sst[Number(kid(c, NS.main, "v")?.textContent)] ?? "";
    else if (t === "inlineStr") v = desc(c, NS.main, "t").map(x => x.textContent).join("");
    else if (t === "str") v = kid(c, NS.main, "v")?.textContent ?? "";
    else continue;  // 숫자·날짜 칸은 매뉴얼 본문이 아니다
    if (!String(v).trim()) continue;
    const info = book.xfInfo[Number(c.getAttribute("s") || 0)] || {};
    const ref = c.getAttribute("r");
    cells.push({ row: rowNum(ref), col: colNum(ref), text: String(v).replace(/\s+$/, ""), bold: !!info.bold, fill: info.fill || "" });
  }
  const pictures = [];
  const rels = await readRels(zip, sheet.path);
  for (const rel of rels.filter(r => r.type === REL_TYPE.drawing)) {
    const ddoc = parseXml(await zip.file(rel.path).async("string"));
    const drels = await readRels(zip, rel.path);
    for (const anchor of [...desc(ddoc, NS.xdr, "oneCellAnchor"), ...desc(ddoc, NS.xdr, "twoCellAnchor")]) {
      const from = kid(anchor, NS.xdr, "from");
      const num = (el, n) => Number(kid(el, NS.xdr, n)?.textContent || 0);
      const blip = desc(anchor, NS.a, "blip")[0];
      if (!from || !blip) continue;
      const target = drels.find(r => r.id === blip.getAttributeNS(NS.r, "embed"));
      if (!target || !zip.file(target.path)) continue;
      const row = num(from, "row") + 1, col = num(from, "col") + 1;
      let endRow, endCol, w, h;
      const to = kid(anchor, NS.xdr, "to");
      if (anchor.localName === "twoCellAnchor" && to) { endRow = num(to, "row") + 1; endCol = num(to, "col") + 1; }
      else {
        const ext = kid(anchor, NS.xdr, "ext");
        w = Number(ext?.getAttribute("cx") || 0) / EMU_PER_PX; h = Number(ext?.getAttribute("cy") || 0) / EMU_PER_PX;
        endRow = row + Math.max(Math.ceil(h / 20), 1) - 1; endCol = col + Math.max(Math.ceil(w / 64), 1) - 1;
      }
      const ext = target.path.split(".").pop().toLowerCase();
      pictures.push({ row, col, endRow, endCol, bytes: await zip.file(target.path).async("uint8array"), ext, side: [], below: [] });
    }
  }
  pictures.sort((a, b) => a.row - b.row || a.col - b.col);
  return { cells, pictures };
}

const X_SECTION_RE = /^(\d+(?:-\d+)*)\.\s*(.+)$/;
const X_STEP_RE = /^[①-⑳]/;
const X_SQL_RE = /^\s*(SELECT|WITH|UPDATE|INSERT|DELETE)\b/i;
const CAPTURE_BOX_RE = /^\[캡처 필요(?::\s*([^\]]*)\]|\]\s*(.*))$/;  // '[캡처 필요: 설명]' 또는 예전 '[캡처 필요] 설명'


// 자유 배치형 엑셀 시트 → 섹션(PRD 6장 6)
async function parseSheet(zip, book, sheetName, prefix) {
  const { cells, pictures } = await readSheet(zip, book, sheetName);
  const boldHeadings = cells.some(c => c.bold && X_SECTION_RE.test(c.text.trim()));
  const isHeading = c => X_SECTION_RE.test(c.text.trim()) && (c.bold || !boldHeadings);
  const images = {};
  pictures.forEach((p, i) => { p.name = `${prefix}${i + 1}.${p.ext}`; images[p.name] = bytesToDataUrl(p.bytes, p.ext); });

  const firstSection = cells.filter(isHeading).map(c => c.row)[0];
  const cover = cells.filter(c => firstSection === undefined || c.row < firstSection);
  const body = cells.filter(c => !cover.includes(c));
  const titleCell = cover.find(c => c.bold) || cover[0];
  const title = titleCell ? titleCell.text : sheetName;
  const metaText = cover.filter(c => c !== titleCell).map(c => c.text).join(" ");

  // 설명을 가장 가까운 그림에 붙인다: 옆(0) / 아래(1~2행) / 바로 위 1행은 단계 문장이라 본문에 둔다.
  const distance = (c, p) => {
    if (p.row <= c.row && c.row <= p.endRow && (c.col > p.endCol || c.col < p.col)) return 0;
    if (p.endRow < c.row && c.row <= p.endRow + 2 && p.col <= c.col && c.col <= p.endCol) return c.row - p.endRow;
    if (c.row === p.row - 1) return 1;
    return null;
  };
  const captions = new Set();
  for (const c of body) {
    const text = c.text.trim();
    if (X_SECTION_RE.test(text) || X_STEP_RE.test(text) || c.bold || c.fill === "F2F2F2") continue;
    const cands = pictures.map(p => [distance(c, p), Math.abs(c.row - p.row), p]).filter(x => x[0] !== null).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (!cands.length) continue;
    const [d, , pic] = cands[0];
    if (d === 1 && c.row === pic.row - 1) continue;
    (d === 0 ? pic.side : pic.below).push(text.replace(/^[←→↑↓]\s*/, ""));
    captions.add(c);
  }

  const byRow = new Map();
  for (const c of body) if (!captions.has(c)) { if (!byRow.has(c.row)) byRow.set(c.row, []); byRow.get(c.row).push(c); }
  const events = [...[...byRow.entries()].map(([r, cs]) => [r, 0, "row", cs.sort((a, b) => a.col - b.col)]), ...pictures.map(p => [p.row, 1, "pic", p])]
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const sections = []; let cur = null; const code = [], table = [];
  const flush = () => {
    if (!cur) { code.length = 0; table.length = 0; return; }
    if (code.length) { cur.lines.push("```sql\n" + code.join("\n") + "\n```"); code.length = 0; }
    if (table.length) {
      const w = Math.max(...table.map(r => r.length));
      const rows = table.map(r => [...r, ...Array(w - r.length).fill("")]);
      cur.lines.push([`| ${rows[0].join(" | ")} |`, "|" + "---|".repeat(w), ...rows.slice(1).map(r => `| ${r.join(" | ")} |`)].join("\n"));
      table.length = 0;
    }
  };
  for (const [, , kind, obj] of events) {
    if (kind === "pic") { flush(); if (cur) cur.lines.push(`{{IMAGE:${obj.name}|${[...obj.side, ...obj.below].join(" / ")}}}`); continue; }
    const row = obj;
    if (row.length === 1 && isHeading(row[0])) {
      flush(); const m = row[0].text.trim().match(X_SECTION_RE);
      cur = { no: m[1], title: m[2], level: m[1].includes("-") ? 2 : 1, lines: [] }; sections.push(cur); continue;
    }
    if (row.length === 1 && CAPTURE_BOX_RE.test(row[0].text.trim())) {  // 회색 [캡처 필요] 칸(채우기 색과 상관없이)
      flush(); const cap = row[0].text.trim().match(CAPTURE_BOX_RE); if (cur) cur.lines.push(`{{CAPTURE_NEEDED:${(cap[1] ?? cap[2]).trim()}}}`); continue;
    }
    if (row[0].fill === "F2F2F2") { if (table.length) flush(); code.push(row[0].text); continue; }
    if (row.length > 1) { if (code.length) flush(); table.push(row.map(c => c.text.trim())); continue; }
    flush();
    if (cur) {
      const t = row[0].text.trim(); const cap = t.match(CAPTURE_BOX_RE);
      cur.lines.push(cap ? `{{CAPTURE_NEEDED:${(cap[1] ?? cap[2]).trim()}}}` : X_SQL_RE.test(t) ? "```sql\n" + t + "\n```" : t);
    }
  }
  flush();
  sections.forEach(s => { s.text = s.lines.join("\n\n"); delete s.lines; });

  let history = [];
  const histLine = cover.map(c => c.text).find(t => t.startsWith("개정이력")) || "";
  for (const part of histLine.replace(/^개정이력:?/, "").split("→")) {
    const m = part.trim().match(/v(\d+(?:\.\d+)?)\s+(\d{4}\.\d{2}\.\d{2})\s+(.+)/);
    if (m) history.push([m[1], m[2], m[3].trim(), "", ""]);
  }
  if (!history.length) {
    const date = metaText.match(/(\d{4}\.\d{2}\.\d{2})/); const author = metaText.match(/작성[:\s]\s*([^/]+)/);
    history = [["1", date ? date[1] : "", "최초 작성", author ? author[1].trim() : "", ""]];
  }
  const vm = metaText.match(/버전\s*(\d+(?:\.\d+)?)/);
  const version = vm ? vm[1] : maxLabel(history.map(h => h[0])) || "1";
  return { title, version, history, sections, images, sheet: sheetName };
}

// ----- 쓰기: 시트 XML을 직접 만든다 -----
class StyleBook {
  // xl/styles.xml에 필요한 글꼴·채우기·셀 서식을 덧붙이고 번호를 돌려준다.
  constructor(doc) {
    this.doc = doc; const root = doc.documentElement;
    const need = (name, before) => kid(root, NS.main, name) || root.insertBefore(doc.createElementNS(NS.main, name), kid(root, NS.main, before));
    this.fonts = need("fonts", "fills"); this.fills = need("fills", "borders"); this.xfs = kid(root, NS.main, "cellXfs");
    this.cache = new Map();
  }
  add(parent, xml) {
    const el = parseXml(`<x xmlns="${NS.main}">${xml}</x>`).documentElement.firstElementChild;
    parent.appendChild(this.doc.importNode(el, true));
    const n = kids(parent, NS.main, el.localName).length; parent.setAttribute("count", n); return n - 1;
  }
  style({ bold = false, size = 11, color = null, font = null, fill = null } = {}) {
    const key = JSON.stringify([bold, size, color, font, fill]);
    if (this.cache.has(key)) return this.cache.get(key);
    const fontId = this.add(this.fonts, `<font>${bold ? "<b/>" : ""}<sz val="${size}"/>${color ? `<color rgb="FF${color}"/>` : ""}<name val="${font || "맑은 고딕"}"/></font>`);
    const fillId = fill ? this.add(this.fills, `<fill><patternFill patternType="solid"><fgColor rgb="FF${fill}"/><bgColor indexed="64"/></patternFill></fill>`) : 0;
    const xf = this.add(this.xfs, `<xf numFmtId="0" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0" applyFont="1"${fill ? ' applyFill="1"' : ""}/>`);
    this.cache.set(key, xf); return xf;
  }
}

// 매뉴얼 → 시트 하나(PRD 6장 7 배치 규칙). 반환: 시트 XML과 그림 목록
async function layoutSheet({ title, version, revision, history, sections, images, styles }) {
  const [ver, day, summary, author, reviewer] = revision;
  const cells = new Map();  // row → [{col, text, s}]
  const put = (row, col, text, s) => { if (!cells.has(row)) cells.set(row, []); cells.get(row).push({ col, text, s }); };
  const pics = [];
  const st = {
    title: styles.style({ bold: true, size: 16, color: "1F3864" }), meta: styles.style({ size: 9, color: "888888" }),
    h1: styles.style({ bold: true, size: 13, color: "1F3864" }), h2: styles.style({ bold: true, size: 12 }), th: styles.style({ bold: true, size: 12 }),
    body: styles.style({}), check: styles.style({ fill: "FFFF00" }), code: styles.style({ font: "Consolas", size: 10, fill: "F2F2F2" }),
    codeFill: styles.style({ fill: "F2F2F2" }), capture: styles.style({ fill: "D9D9D9" }),
  };
  const textStyle = t => t.includes(CHECK) ? st.check : st.body;
  put(2, 2, title, st.title);
  put(3, 2, [`버전 ${version}`, day, author && `작성 ${author}`, reviewer && `검토 ${reviewer}`, "※교육용 가상 자료"].filter(Boolean).join(" / "), st.meta);
  // 업무 추가로 붙이는 새 시트(history null)에는 개정이력 줄이 없다(mock/예상결과_추가_엑셀_시트추가.xlsx).
  if (history) put(4, 2, "개정이력: " + [...history, `v${ver} ${day} ${summary}`].join(" → "), st.meta);
  let row = history ? 6 : 5;
  const box = (text, s, fillS) => { put(row, 2, text, s); for (let c = 3; c <= 9; c++) put(row, c, null, fillS); row++; };
  for (const sec of sections) {
    if (sec.level === 1) { row++; put(row, 2, `${sec.no}. ${sec.title}`, st.h1); } else put(row, 2, `${sec.no}. ${sec.title}`, st.h2);
    row++;
    const lines = stripTags(sec.text).split("\n");
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t.startsWith("```")) { i++; while (i < lines.length && !lines[i].trim().startsWith("```")) box(lines[i++].replace(/\s+$/, ""), st.code, st.codeFill); row++; continue; }
      if (t.startsWith("|")) {
        const rows = []; while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(lines[i++]); i--;
        rows.map(r => r.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim())).filter(r => !r.every(c => /^:?-{3,}:?$/.test(c)))
          .forEach((r, ri) => { r.forEach((v, j) => put(row, 2 + j * 3, v, ri === 0 ? st.th : textStyle(v))); row++; });
        continue;
      }
      const tok = t.match(/^\{\{(IMAGE|CAPTURE_NEEDED):([^}]*)\}\}$/);
      if (tok) {
        const [name, caption = ""] = tok[2].split("|");
        if (tok[1] === "IMAGE" && images[name]) {
          const [w, h] = await imageSize(images[name]); const height = Math.round(h * 550 / w);
          pics.push({ row, col: 2, width: 550, height, dataUrl: images[name] });
          if (caption) put(row, 11, `← ${caption}`, st.body);
          row += Math.ceil(height / 20) + 1;
        } else { box(`[캡처 필요: ${tok[1] === "IMAGE" ? (caption || name) : tok[2]}]`, st.capture, st.capture); row++; }  // 회색 칸 아래 한 줄 띄움
        continue;
      }
      if (t) { put(row, 2, t, textStyle(t)); row++; }
    }
  }
  const last = Math.max(row, ...cells.keys());
  let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="${NS.main}" xmlns:r="${NS.r}"><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="3" customWidth="1"/><col min="11" max="11" width="40" customWidth="1"/></cols><sheetData>`;
  for (let r = 1; r <= last; r++) {
    const cs = (cells.get(r) || []).sort((a, b) => a.col - b.col);
    xml += `<row r="${r}" ht="15" customHeight="1">` + cs.map(c => c.text === null || c.text === undefined
      ? `<c r="${colLetter(c.col)}${r}" s="${c.s}"/>`
      : `<c r="${colLetter(c.col)}${r}" s="${c.s}" t="inlineStr"><is><t xml:space="preserve">${xesc(c.text)}</t></is></c>`).join("") + "</row>";
  }
  xml += "</sheetData>__DRAWING__</worksheet>";
  return { xml, pics };
}

async function writeSheetPart(zip, sheetPath, layout) {
  // 시트 XML과 그림(drawing·media·관계)을 저장한다.
  zip.remove(relsPath(sheetPath));
  if (!layout.pics.length) { zip.file(sheetPath, layout.xml.replace("__DRAWING__", "")); return; }
  const drawingPath = uniquePath(zip, "xl/drawings", "drawing", "xml");
  let anchors = "";
  for (const [i, p] of layout.pics.entries()) {
    const ext = dataUrlExt(p.dataUrl);
    const media = uniquePath(zip, "xl/media", "image", ext);
    zip.file(media, dataUrlBytes(p.dataUrl));
    await ensureContentType(zip, { ext, type: ext === "jpg" ? "image/jpeg" : `image/${ext}` });
    const rid = await addRel(zip, drawingPath, REL_TYPE.image, `../media/${media.split("/").pop()}`);
    const cx = p.width * EMU_PER_PX, cy = p.height * EMU_PER_PX;
    anchors += `<xdr:oneCellAnchor><xdr:from><xdr:col>${p.col - 1}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${p.row - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="Picture ${i + 1}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`;
  }
  zip.file(drawingPath, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="${NS.xdr}" xmlns:a="${NS.a}" xmlns:r="${NS.r}">${anchors}</xdr:wsDr>`);
  await ensureContentType(zip, { partName: "/" + drawingPath, type: CT.drawing });
  const rid = await addRel(zip, sheetPath, REL_TYPE.drawing, `../drawings/${drawingPath.split("/").pop()}`);
  zip.file(sheetPath, layout.xml.replace("__DRAWING__", `<drawing r:id="${rid}"/>`));
}

async function loadStyles(zip) {
  return new StyleBook(parseXml(await zip.file("xl/styles.xml").async("string")));
}
const saveStyles = (zip, styles) => zip.file("xl/styles.xml", serializeXml(styles.doc));

async function addSheetToBook(zip, book, name, layoutArgs, position = null) {
  const styles = await loadStyles(zip);
  const layout = await layoutSheet({ ...layoutArgs, styles });
  saveStyles(zip, styles);
  const sheetPath = uniquePath(zip, "xl/worksheets", "sheet", "xml");
  await writeSheetPart(zip, sheetPath, layout);
  await ensureContentType(zip, { partName: "/" + sheetPath, type: CT.worksheet });
  const rid = await addRel(zip, "xl/workbook.xml", REL_TYPE.worksheet, `worksheets/${sheetPath.split("/").pop()}`);
  const sheetsEl = desc(book.wb, NS.main, "sheets")[0];
  const el = book.wb.createElementNS(NS.main, "sheet");
  el.setAttribute("name", name);
  el.setAttribute("sheetId", String(Math.max(0, ...desc(book.wb, NS.main, "sheet").map(s => Number(s.getAttribute("sheetId")))) + 1));
  el.setAttributeNS(NS.r, "r:id", rid);
  const ref = position === null ? null : kids(sheetsEl, NS.main, "sheet")[position] || null;
  sheetsEl.insertBefore(el, ref);
  zip.file("xl/workbook.xml", serializeXml(book.wb));
  zip.remove("xl/calcChain.xml");
}

const SKELETON = {
  "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="${NS.ct}"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CT.workbook}"/><Override PartName="/xl/styles.xml" ContentType="${CT.styles}"/></Types>`,
  "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="${REL_TYPE.officeDocument}" Target="xl/workbook.xml"/></Relationships>`,
  "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="${NS.main}" xmlns:r="${NS.r}"><sheets></sheets></workbook>`,
  "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS.rel}"><Relationship Id="rId1" Type="${REL_TYPE.styles}" Target="styles.xml"/></Relationships>`,
  "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="${NS.main}"><fonts count="1"><font><sz val="11"/><name val="맑은 고딕"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
};
const zipBlob = zip => zip.generateAsync({ type: "blob", compression: "DEFLATE" });
const safeSheetName = name => (name || "").trim().replace(/[\\/*?:[\]]/g, "").slice(0, 31) || "매뉴얼";
const sheetNameFor = task => safeSheetName((task || "매뉴얼").split(/\s+/).pop());

// 신규 + 엑셀: 새 통합문서에 시트 하나
async function xlsxNew({ task, ...layoutArgs }) {
  const zip = new JSZip();
  for (const [p, x] of Object.entries(SKELETON)) zip.file(p, x);
  await addSheetToBook(zip, await xlsxBook(zip), sheetNameFor(task), { ...layoutArgs, history: [] });
  return zipBlob(zip);
}
// 갱신 + 엑셀: 고른 시트만 같은 이름·같은 자리에 다시 쓴다. 다른 시트 파일은 그대로 둔다.
async function xlsxReplace(buffer, sheetName, layoutArgs) {
  const zip = await JSZip.loadAsync(buffer);
  const book = await xlsxBook(zip);
  const sheet = book.sheets.find(s => s.name === sheetName);
  const styles = await loadStyles(zip);
  const layout = await layoutSheet({ ...layoutArgs, styles });
  saveStyles(zip, styles);
  await writeSheetPart(zip, sheet.path, layout);
  zip.remove("xl/calcChain.xml");
  return zipBlob(zip);
}
// 추가 + 엑셀: 맨 뒤에 업무명 시트, '목차' 시트가 있으면 마지막 줄에 (시트명, 업무명, 작성일)
async function xlsxAdd(buffer, sheetName, taskLabel, layoutArgs) {
  const zip = await JSZip.loadAsync(buffer);
  const book = await xlsxBook(zip);
  await addSheetToBook(zip, book, sheetName, { ...layoutArgs, history: null });
  const toc = book.sheets.find(s => s.name === "목차");
  if (toc) await addTocRow(zip, book, toc.path, [sheetName, taskLabel, layoutArgs.revision[1]]);
  return zipBlob(zip);
}
async function addTocRow(zip, book, path, values) {
  const doc = parseXml(await zip.file(path).async("string"));
  const data = desc(doc, NS.main, "sheetData")[0];
  const text = c => c.getAttribute("t") === "s" ? book.sst[Number(kid(c, NS.main, "v")?.textContent)] : desc(c, NS.main, "t").map(x => x.textContent).join("") || kid(c, NS.main, "v")?.textContent || "";
  const head = desc(doc, NS.main, "c").find(c => text(c) === "시트");
  if (!head) return;
  const headRow = rowNum(head.getAttribute("r")), col = colNum(head.getAttribute("r"));
  const rows = kids(data, NS.main, "row");
  const lastRow = Math.max(headRow, ...rows.filter(r => desc(r, NS.main, "c").some(c => text(c))).map(r => Number(r.getAttribute("r"))));
  const prev = rows.find(r => Number(r.getAttribute("r")) === lastRow);
  const newR = lastRow + 1;
  const styleOf = k => lastRow > headRow ? desc(prev, NS.main, "c").find(c => colNum(c.getAttribute("r")) === col + k)?.getAttribute("s") : null;
  const xml = `<row xmlns="${NS.main}" r="${newR}"${prev?.getAttribute("ht") ? ` ht="${prev.getAttribute("ht")}" customHeight="1"` : ""}>` + values.map((v, k) => `<c r="${colLetter(col + k)}${newR}"${styleOf(k) ? ` s="${styleOf(k)}"` : ""} t="inlineStr"><is><t xml:space="preserve">${xesc(v)}</t></is></c>`).join("") + "</row>";
  const el = doc.importNode(parseXml(xml).documentElement, true);
  const after = rows.find(r => Number(r.getAttribute("r")) > lastRow);
  if (after && Number(after.getAttribute("r")) === newR) data.replaceChild(el, after); else data.insertBefore(el, after || null);
  const dim = desc(doc, NS.main, "dimension")[0];
  if (dim) dim.setAttribute("ref", dim.getAttribute("ref").replace(/\d+$/, m => String(Math.max(Number(m), newR))));
  zip.file(path, serializeXml(doc));
}
