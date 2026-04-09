const ANTHROPIC_PACKAGE_NAME = "@anthropic-ai/sdk";

export async function loadAnthropicSdk(): Promise<any> {
  try {
    return await import(ANTHROPIC_PACKAGE_NAME);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Anthropic SDK is unavailable. Install workspace dependencies so ${ANTHROPIC_PACKAGE_NAME} can be resolved. ${reason}`,
    );
  }
}
