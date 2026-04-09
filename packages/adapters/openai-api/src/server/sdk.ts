const OPENAI_PACKAGE_NAME = "openai";

export async function loadOpenAiSdk(): Promise<any> {
  try {
    return await import(OPENAI_PACKAGE_NAME);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `OpenAI SDK is unavailable. Install workspace dependencies so ${OPENAI_PACKAGE_NAME} can be resolved. ${reason}`,
    );
  }
}
