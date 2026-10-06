const MODEL = "@cf/zai-org/glm-4.7-flash";

function json(data, status = 200) {
  return Response.json(data, { status });
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return json({ error: "POST required" }, 405);

    const supplied = request.headers.get("authorization");
    if (!env.IMPORT_SECRET || supplied !== `Bearer ${env.IMPORT_SECRET}`) {
      return json({ error: "Unauthorized" }, 401);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
    if (typeof body.prompt !== "string" || !body.prompt.trim()) {
      return json({ error: "prompt is required" }, 400);
    }

    try {
      const result = await env.AI.run(MODEL, {
        messages: [
          { role: "system", content: "Follow the requested output format exactly. Return only the finished content." },
          { role: "user", content: body.prompt },
        ],
        max_completion_tokens: 8000,
        temperature: 0.15,
      });
      const text = typeof result === "string"
        ? result
        : result?.response ?? result?.choices?.[0]?.message?.content;
      if (!text) return json({ error: "Empty model response" }, 502);
      return json({ text, model: MODEL });
    } catch (error) {
      console.error("Workers AI error", error);
      return json({ error: "Workers AI unavailable" }, 503);
    }
  },
};
