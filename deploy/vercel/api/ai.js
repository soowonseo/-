// Vercel 서버 함수: 브라우저에서 받은 프롬프트를 OpenRouter의 모델에 보내고, 답을 글자 그대로 스트리밍한다.
// 키와 모델은 Vercel 환경 변수에만 둔다:
//   OPENROUTER_API_KEY  OpenRouter에서 받은 키 (브라우저·교육용 PC에는 남지 않는다)
//   OPENROUTER_MODEL    모델 ID, 예: openrouter.ai/models 에서 복사한 '…nemotron…:free'
const BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const MAX_PROMPT_CHARS = 200_000;
// 스트림 중간 오류를 알리는 표시(본문에는 나오지 않는 문자로 시작)
const SIGNAL = "\u0000";

function errorCode(status) {
  if (status === 401) return "bad_key";
  if (status === 402) return "no_credits";
  if (status === 429) return "rate_limited";
  if (status === 400 || status === 404) return "bad_model";
  return "api_error";
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ code: "method_not_allowed" });
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!key || !model) return res.status(503).json({ code: "not_configured" });

  const prompt = req.body?.prompt;
  if (typeof prompt !== "string" || !prompt.trim()) return res.status(400).json({ code: "bad_request" });
  if (prompt.length > MAX_PROMPT_CHARS) return res.status(413).json({ code: "too_large" });

  let upstream;
  try {
    upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "X-Title": "Manual Writer PoC" },
      body: JSON.stringify({
        model,
        stream: true,
        reasoning: { exclude: true },   // 생각 과정은 빼고 답만 받는다
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (err) {
    console.error("openrouter network error", err?.message);
    return res.status(502).json({ code: "network" });
  }
  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    console.error("openrouter error", upstream.status, detail.slice(0, 500));
    return res.status(502).json({ code: errorCode(upstream.status) });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue;          // ': OPENROUTER PROCESSING' 같은 알림 줄은 건너뛴다
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let chunk;
        try { chunk = JSON.parse(data); } catch { continue; }
        if (chunk.error) {
          console.error("openrouter stream error", chunk.error);
          res.write(`${SIGNAL}${errorCode(chunk.error.code)}`);
          return res.end();
        }
        const choice = chunk.choices?.[0];
        if (choice?.delta?.content) res.write(choice.delta.content);
        if (choice?.finish_reason === "length") res.write(`${SIGNAL}truncated`);
      }
    }
  } catch (err) {
    console.error("openrouter stream read error", err?.message);
    res.write(`${SIGNAL}network`);
  }
  res.end();
}
