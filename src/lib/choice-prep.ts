export type ChoicePrepOption = {
  label: string;
  text: string;
};

export type ChoicePrepResponse = {
  error?: string;
  questionText?: string;
  options?: ChoicePrepOption[];
};

export async function fillMissingChoices(
  questionText: string,
  options: ChoicePrepOption[],
  timeoutMs = 20000,
): Promise<ChoicePrepResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch("/api/pdf/fix-grammar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        mode: "fill-choices",
        questionText,
        options,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as ChoicePrepResponse;
    if (!response.ok) {
      throw new Error(data.error ?? "Could not fill missing choices.");
    }
    return data;
  } finally {
    clearTimeout(timeout);
  }
}
