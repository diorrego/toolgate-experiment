import { openaiCost } from "./metrics.mjs";
/** One attempt, including failed transport; never automatically retry paid requests. */
export async function responseAttempt({
  key,
  body,
  signal,
  attempts,
  fetcher = fetch,
}) {
  const attempt = {
    durationMs: null,
    httpStatus: null,
    model: null,
    responseId: null,
    status: null,
    usage: null,
    costUSD: null,
    error: null,
    output: null,
  };
  attempts.push(attempt);
  const started = performance.now();
  try {
    const res = await fetcher("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + key,
      },
      body: JSON.stringify(body),
      signal,
    });
    attempt.httpStatus = res.status;
    const data = await res.json();
    Object.assign(attempt, {
      model: data.model ?? null,
      responseId: data.id ?? null,
      status: data.status ?? null,
      usage: data.usage ?? null,
      costUSD: openaiCost(data.usage),
      error: data.error
        ? { code: data.error.code, message: data.error.message }
        : null,
      output: data.output?.filter((i) => i.type !== "reasoning") ?? null,
    });
    if (!res.ok) throw Error("OPENAI_HTTP_" + res.status);
    if (data.model !== "gpt-6-luna") throw Error("MODEL_DRIFT");
    return data;
  } catch (error) {
    attempt.error ??= { code: "OPENAI_TRANSPORT_OR_RESPONSE_ERROR" };
    throw error;
  } finally {
    attempt.durationMs = performance.now() - started;
  }
}
