// Vercel 흉내 서버: deploy/vercel/public 정적 파일 + /api/ai + /api/store, 그리고 아티팩트 페이지(/art.html).
// 실행: PORT=8791 STORE_FS_DIR=<빈 폴더> [OPENROUTER_* 환경 변수] node web/tests/dev_server.mjs
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const tests = path.dirname(new URL(import.meta.url).pathname);
const vercel = path.join(tests, "../../deploy/vercel");
const ai = (await import(path.join(vercel, "api/ai.js"))).default;
const store = (await import(path.join(vercel, "api/store.js"))).default;
http.createServer((req, res) => {
  res.status = c => { res.statusCode = c; return res; };
  res.json = o => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(o)); };
  const u = new URL(req.url, "http://x");
  const fn = u.pathname === "/api/ai" ? ai : u.pathname === "/api/store" ? store : null;
  if (fn) {
    req.query = Object.fromEntries(u.searchParams);
    let body = ""; req.on("data", c => body += c); req.on("end", () => { try { req.body = JSON.parse(body || "{}"); } catch { req.body = {}; } fn(req, res); });
    return;
  }
  const f = u.pathname === "/art.html" ? path.join(tests, "out/artifact/manual-writer.html") : path.join(vercel, "public", u.pathname === "/" ? "index.html" : u.pathname);
  if (fs.existsSync(f)) { res.setHeader("Content-Type", "text/html; charset=utf-8"); res.end(fs.readFileSync(f)); } else { res.statusCode = 404; res.end(); }
}).listen(Number(process.env.PORT || 8791), () => console.log("dev on", process.env.PORT || 8791));
