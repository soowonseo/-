// Vercel 서버 함수: 브라우저에서 받은 프롬프트를 Claude에 보내고, 답을 글자 그대로 스트리밍한다.
// API 키는 Vercel 환경 변수 ANTHROPIC_API_KEY에만 둔다(브라우저·교육용 PC에는 남지 않는다).
// 공개 주소에서 키가 남용되지 않도록 AI_ACCESS_CODE를 설정하면, 그 코드를 아는 사람만 AI 모드를 쓸 수 있다.
import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-opus-5-5";
const MAX_PROMPT_CHARS = 200_000;
// 스트림 중간 오류·거절을 알리는 표시(본문에는 나오지 않는 문자로 시작)
const SIGNAL = "\u0000";

const client = new Anthropic();

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ code: "method_not_allowed" });
  if (!process.env.ANTHROPIC_API_KEY) return res.status(503).json({ code: "not_configured" });
  const accessCode = process.env.AI_ACCESS_CODE;
  if (accessCode && req.headers["x-access-code"] !== accessCode) return res.status(401).json({ code: "bad_code" });

  const prompt = req.body?.prompt;
  if (typeof prompt !== "string" || !prompt.trim()) return res.status(400).json({ code: "bad_request" });
  if (prompt.length > MAX_PROMPT_CHARS) return res.status(413).json({ code: "too_large" });

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  try {
    const stream = client.beta.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      output_config: { effort: "medium" },
      // 안전 장치가 거절하면 서버에서 권장 모델로 다시 쓴다(거절 종류별로 자동 선택)
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [{ role: "user", content: prompt }],
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") res.write(event.delta.text);
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") res.write(`${SIGNAL}refusal`);
    else if (final.stop_reason === "max_tokens") res.write(`${SIGNAL}truncated`);
  } catch (err) {
    const code = err instanceof Anthropic.RateLimitError ? "rate_limited"
      : err instanceof Anthropic.AuthenticationError ? "bad_key"
      : err instanceof Anthropic.APIConnectionError ? "network"
      : "api_error";
    console.error("claude api error", err?.status, err?.message);
    res.write(`${SIGNAL}${code}`);
  }
  res.end();
}
