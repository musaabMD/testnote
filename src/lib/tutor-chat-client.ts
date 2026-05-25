export type TutorChatMessage = { role: "user" | "assistant"; text: string };

function textFromPayload(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";

  const event = payload as {
    type?: string;
    delta?: unknown;
    text?: unknown;
    content?: unknown;
    parts?: unknown;
  };

  if (event.type === "text-delta" && typeof event.delta === "string") {
    return event.delta;
  }
  if (typeof event.text === "string") return event.text;
  if (typeof event.content === "string") return event.content;
  if (Array.isArray(event.parts)) {
    return event.parts.map((part) => textFromPayload(part)).join("");
  }

  return "";
}

function parseSseTextDelta(chunk: string): string {
  let text = "";
  for (const line of chunk.split("\n")) {
    const trimmed = line.trim();
    const dataStreamMatch = trimmed.match(/^0:(.*)$/);
    if (dataStreamMatch?.[1]) {
      try {
        text += textFromPayload(JSON.parse(dataStreamMatch[1]));
      } catch {
        // ignore malformed chunks
      }
      continue;
    }

    if (!trimmed.startsWith("data: ")) continue;
    const payload = trimmed.slice(6).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      text += textFromPayload(JSON.parse(payload));
    } catch {
      // ignore malformed chunks
    }
  }
  return text;
}

export async function streamTutorReply({
  system,
  messages,
  onUpdate,
  signal,
}: {
  system: string;
  messages: TutorChatMessage[];
  onUpdate?: (text: string) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system,
      messages: messages.map((message, index) => ({
        id: `tutor-${index}`,
        role: message.role,
        parts: [{ type: "text", text: message.text }],
      })),
    }),
    signal,
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Tutor request failed (${response.status}).`);
  }

  if (!response.body) {
    throw new Error("Tutor returned an empty response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let latest = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      latest += parseSseTextDelta(part);
      onUpdate?.(latest);
    }
  }

  buffer += decoder.decode();

  if (buffer.trim()) {
    latest += parseSseTextDelta(buffer);
    onUpdate?.(latest);
  }

  if (!latest.trim()) {
    throw new Error("The tutor response was empty. Try sending again, or ask for a shorter answer.");
  }

  return latest;
}
