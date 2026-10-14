// 가짜 OpenRouter: /chat/completions 스트리밍(SSE)을 OpenAI 호환 형식으로 흉내 낸다.
import http from "node:http"; import fs from "node:fs";
const text = fs.readFileSync(process.argv[2], "utf8");
const GOOD_MODEL = "nvidia/test-nemotron:free";
http.createServer((req, res) => {
  let body = ""; req.on("data", c => body += c); req.on("end", () => {
    const b = JSON.parse(body || "{}");
    fs.writeFileSync(new URL("./last_request.json", import.meta.url), JSON.stringify({ url: req.url, auth: req.headers.authorization, body: b }, null, 1));
    if (req.headers.authorization !== "Bearer or-test-key") { res.writeHead(401, { "content-type": "application/json" }); return res.end('{"error":{"code":401,"message":"No auth"}}'); }
    if (b.model !== GOOD_MODEL) { res.writeHead(400, { "content-type": "application/json" }); return res.end('{"error":{"code":400,"message":"not a valid model ID"}}'); }
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(": OPENROUTER PROCESSING\n\n");
    const send = c => res.write(`data: ${JSON.stringify({ id: "x", choices: [{ index: 0, delta: { content: c }, finish_reason: null }] })}\n\n`);
    send("<think>규칙을 확인하자.</think>");
    const parts = text.match(/[\s\S]{1,300}/g); let i = 0;
    const tick = () => {
      if (i < parts.length) { send(parts[i++]); setTimeout(tick, 5); return; }
      res.write(`data: ${JSON.stringify({ id: "x", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`); res.write("data: [DONE]\n\n"); res.end();
    }; tick();
  });
}).listen(8788, () => console.log("mock openrouter on 8788"));
