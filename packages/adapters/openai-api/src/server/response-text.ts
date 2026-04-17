function extractTextFromContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const chunks: string[] = [];
  for (const entry of content) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "";
    if (type === "output_text" || type === "text" || type === "content") {
      const text =
        typeof record.text === "string"
          ? record.text
          : typeof record.content === "string"
            ? record.content
            : "";
      if (text.trim()) chunks.push(text.trim());
    }
  }
  return chunks.join("\n").trim();
}

export function extractOpenAiResponseText(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const record = result as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.trim().length > 0) {
    return record.output_text.trim();
  }

  const directContentText = extractTextFromContent(record.content);
  if (directContentText) return directContentText;

  const output = Array.isArray(record.output) ? record.output : [];
  const chunks: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const itemRecord = item as Record<string, unknown>;
    const itemType = typeof itemRecord.type === "string" ? itemRecord.type : "";
    if (itemType === "message") {
      const text = extractTextFromContent(itemRecord.content);
      if (text) chunks.push(text);
      continue;
    }
    const text = extractTextFromContent(itemRecord.content);
    if (text) chunks.push(text);
  }

  return chunks.join("\n").trim();
}
