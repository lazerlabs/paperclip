const GEMINI_PACKAGE_NAME = "@google/genai";

export async function loadGeminiSdk(): Promise<any> {
  try {
    return await import(GEMINI_PACKAGE_NAME);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Gemini SDK is unavailable. Install workspace dependencies so ${GEMINI_PACKAGE_NAME} can be resolved. ${reason}`,
    );
  }
}
