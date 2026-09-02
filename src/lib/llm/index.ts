import { AmbiguousClassificationInput, LlmClassificationResult } from "./types";
import { classifyAmbiguousWithNvidia } from "./nvidia";

export async function classifyWithConfiguredLlm(
  input: AmbiguousClassificationInput,
  signal?: AbortSignal
): Promise<LlmClassificationResult | null> {
  const enabled = process.env.LLM_TIEBREAK_ENABLED === "true";
  const provider = process.env.LLM_TIEBREAK_PROVIDER || "nvidia";

  if (!enabled) {
    return null;
  }

  if (provider === "nvidia") {
    return classifyAmbiguousWithNvidia(input, signal);
  }

  return null;
}

export * from "./types";
