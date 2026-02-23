const GROQ_TRANSCRIPTION_ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions";

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

export async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed. Use POST." });
  }

  const groqKey = process.env.GROQ_API_KEY || "";
  if (!groqKey) {
    return json(500, { error: "GROQ_API_KEY is not set." });
  }

  const body = parseBody(event.body);
  const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : "";
  if (!audioBase64) {
    return json(400, { error: "Missing audioBase64." });
  }

  const mimeType = String(body.mimeType || "audio/webm");
  const fileName = String(body.fileName || "voice-input.webm");
  const model = String(
    body.model || process.env.GROQ_TRANSCRIPTION_MODEL || "whisper-large-v3-turbo"
  );
  const language = String(body.language || process.env.GROQ_TRANSCRIPTION_LANGUAGE || "en");

  let audioBuffer;
  try {
    audioBuffer = Buffer.from(audioBase64, "base64");
  } catch {
    return json(400, { error: "Invalid audioBase64 payload." });
  }

  const formData = new FormData();
  formData.append("file", new Blob([audioBuffer], { type: mimeType }), fileName);
  formData.append("model", model);
  formData.append("language", language);

  const upstream = await fetch(GROQ_TRANSCRIPTION_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${groqKey}`,
    },
    body: formData,
  });

  if (!upstream.ok) {
    return text(upstream.status, await upstream.text());
  }

  const data = await upstream.json();
  return json(200, {
    text: String(data?.text || ""),
    provider: "groq",
  });
}
