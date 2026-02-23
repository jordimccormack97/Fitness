const MISTRAL_CHAT_ENDPOINT = "https://api.mistral.ai/v1/chat/completions";
const OPENROUTER_CHAT_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

function parseBody(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

function text(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    body,
  };
}

function chooseProvider(requestedProvider, hasMistral, hasOpenRouter) {
  if (requestedProvider === "mistral") return "mistral";
  if (requestedProvider === "openrouter") return "openrouter";
  if (hasMistral) return "mistral";
  if (hasOpenRouter) return "openrouter";
  return "";
}

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed. Use POST." });
  }

  const body = parseBody(event.body);
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (messages.length === 0) {
    return json(400, { error: "Missing messages array." });
  }

  const requestedProvider = String(body.provider || "auto").toLowerCase();
  const mistralKey = process.env.MISTRAL_API_KEY || "";
  const openRouterKey = process.env.OPENROUTER_API_KEY || "";
  const provider = chooseProvider(requestedProvider, Boolean(mistralKey), Boolean(openRouterKey));
  if (!provider) {
    return json(500, {
      error: "Server misconfigured: set MISTRAL_API_KEY or OPENROUTER_API_KEY.",
    });
  }

  const temperature = typeof body.temperature === "number" ? body.temperature : undefined;

  if (provider === "mistral") {
    const mistralModel = String(body.model || process.env.MISTRAL_MODEL || "mistral-small-latest");
    const upstream = await fetch(MISTRAL_CHAT_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mistralKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: mistralModel,
        messages,
        ...(temperature != null ? { temperature } : {}),
      }),
    });

    if (!upstream.ok) {
      return text(upstream.status, await upstream.text());
    }

    const data = await upstream.json();
    return json(200, {
      content: String(data?.choices?.[0]?.message?.content ?? ""),
      provider: "mistral",
    });
  }

  const openRouterModel = String(body.model || process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini");
  const upstream = await fetch(OPENROUTER_CHAT_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: openRouterModel,
      messages,
      ...(temperature != null ? { temperature } : {}),
    }),
  });

  if (!upstream.ok) {
    return text(upstream.status, await upstream.text());
  }

  const data = await upstream.json();
  return json(200, {
    content: String(data?.choices?.[0]?.message?.content ?? ""),
    provider: "openrouter",
  });
}
