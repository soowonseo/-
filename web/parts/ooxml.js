// ---------- Office 파일(OOXML) 공용 ----------
// Word·엑셀 파일은 ZIP 안의 XML이다. JSZip으로 열어 필요한 XML만 읽고 고친다.
// 갱신·추가 때 손대지 않는 시트·장은 원본 바이트 그대로 남는다.
const NS = {
  main: "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
  r: "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
  rel: "http://schemas.openxmlformats.org/package/2006/relationships",
  ct: "http://schemas.openxmlformats.org/package/2006/content-types",
  xdr: "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing",
  a: "http://schemas.openxmlformats.org/drawingml/2006/main",
  w: "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
};
const REL_TYPE = {
  worksheet: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet",
  drawing: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing",
  image: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image",
  styles: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles",
  officeDocument: "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument",
};
const CT = {
  worksheet: "application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml",
  drawing: "application/vnd.openxmlformats-officedocument.drawing+xml",
  workbook: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
  styles: "application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml",
};
const EMU_PER_PX = 9525;

const parseXml = s => new DOMParser().parseFromString(s, "application/xml");
const serializeXml = d => new XMLSerializer().serializeToString(d);
const xesc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const kids = (el, ns, name) => el ? [...el.childNodes].filter(n => n.nodeType === 1 && n.namespaceURI === ns && n.localName === name) : [];
const kid = (el, ns, name) => kids(el, ns, name)[0] || null;
const desc = (el, ns, name) => el ? [...el.getElementsByTagNameNS(ns, name)] : [];

function resolvePath(base, target) {
  // base: 'xl/worksheets/sheet1.xml', target: '../drawings/drawing1.xml' → 'xl/drawings/drawing1.xml'
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/").slice(0, -1);
  for (const p of target.split("/")) { if (p === "..") parts.pop(); else if (p !== ".") parts.push(p); }
  return parts.join("/");
}
const relsPath = part => { const i = part.lastIndexOf("/"); return `${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`; };

async function readRels(zip, part) {
  const f = zip.file(relsPath(part));
  if (!f) return [];
  const doc = parseXml(await f.async("string"));
  return desc(doc, NS.rel, "Relationship").map(r => ({ id: r.getAttribute("Id"), type: r.getAttribute("Type"), target: r.getAttribute("Target"), path: resolvePath(part, r.getAttribute("Target")) }));
}
async function addRel(zip, part, type, target) {
  const p = relsPath(part);
  const f = zip.file(p);
  const doc = parseXml(f ? await f.async("string") : `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${NS.rel}"></Relationships>`);
  const ids = desc(doc, NS.rel, "Relationship").map(r => Number(r.getAttribute("Id").replace(/\D/g, "")) || 0);
  const id = `rId${Math.max(0, ...ids) + 1}`;
  const el = doc.createElementNS(NS.rel, "Relationship");
  el.setAttribute("Id", id); el.setAttribute("Type", type); el.setAttribute("Target", target);
  doc.documentElement.appendChild(el);
  zip.file(p, serializeXml(doc));
  return id;
}
async function ensureContentType(zip, { ext, partName, type }) {
  const doc = parseXml(await zip.file("[Content_Types].xml").async("string"));
  const root = doc.documentElement;
  if (ext && !desc(doc, NS.ct, "Default").some(d => d.getAttribute("Extension").toLowerCase() === ext)) {
    const el = doc.createElementNS(NS.ct, "Default"); el.setAttribute("Extension", ext); el.setAttribute("ContentType", type); root.insertBefore(el, root.firstChild);
  }
  if (partName && !desc(doc, NS.ct, "Override").some(o => o.getAttribute("PartName") === partName)) {
    const el = doc.createElementNS(NS.ct, "Override"); el.setAttribute("PartName", partName); el.setAttribute("ContentType", type); root.appendChild(el);
  }
  zip.file("[Content_Types].xml", serializeXml(doc));
}
function uniquePath(zip, dir, stem, ext) {
  let n = 1;
  while (zip.file(`${dir}/${stem}${n}.${ext}`)) n++;
  return `${dir}/${stem}${n}.${ext}`;
}
function bytesToDataUrl(bytes, ext) {
  let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return `data:image/${ext === "jpg" ? "jpeg" : ext};base64,${btoa(s)}`;
}
function dataUrlBytes(url) { const b = atob(url.split(",")[1]); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
const dataUrlExt = url => (url.match(/^data:image\/(\w+)/) || [, "png"])[1].replace("jpeg", "jpg");
function imageSize(url) { return new Promise(r => { const im = new Image(); im.onload = () => r([im.naturalWidth, im.naturalHeight]); im.onerror = () => r([800, 450]); im.src = url; }); }
