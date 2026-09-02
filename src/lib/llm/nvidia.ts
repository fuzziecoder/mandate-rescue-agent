import OpenAI from "openai";
import { AmbiguousClassificationInput, LlmClassificationResult, FAILURE_CAUSES, FailureCause } from "./types";

export async function classifyAmbiguousWithNvidia(
  input: AmbiguousClassificationInput,
  signal?: AbortSignal
): Promise<LlmClassificationResult | null> {
  const apiKey = process.env.NVIDIA_API_KEY;
  const enabled = process.env.LLM_TIEBREAK_ENABLED === "true";
  const provider = process.env.LLM_TIEBREAK_PROVIDER || "nvidia";

  if (!apiKey || !enabled || provider !== "nvidia") {
    return null;
  }

  const model = process.env.LLM_TIEBREAK_MODEL || "nvidia/nemotron-3.5-lightning-30b-a3b";

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: "https://integrate.api.nvidia.com/v1"
    });

    const timeoutMs = Number(process.env.LLM_TIEBREAK_TIMEOUT_MS) || 8000;
    
    // Prepare message payload
    const systemPrompt = `You are a narrowly scoped payment-failure classification service.
Your only task is to classify the likely root cause of a synthetic failed UPI Autopay mandate.
You must not recommend recovery actions, retries, messages, escalation, compliance rules, or financial decisions.
Return JSON only with exactly one allowed cause.`;

    const userPrompt = JSON.stringify({
      allowed_causes: FAILURE_CAUSES,
      transaction: {
        error_code: input.error_code,
        error_message: input.error_message,
        bank_name: input.bank_name ?? null,
        amount: input.amount ?? null,
        failed_at: input.failed_at ?? null,
        mandate_status: input.mandate_status ?? null
      },
      response_schema: {
        cause: "one allowed cause",
        confidence: "number from 0 to 1",
        reasoning: "maximum 180 characters"
      }
    });

    let content: string | null = null;

    try {
      const completion = await client.chat.completions.create(
        {
          model,
          temperature: 0,
          top_p: 1,
          max_tokens: 220,
          stream: false,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        },
        { signal, timeout: timeoutMs }
      );
      content = completion.choices[0]?.message?.content || null;
    } catch (err: any) {
      // Retry once without response_format if unsupported by endpoint
      const completion = await client.chat.completions.create(
        {
          model,
          temperature: 0,
          top_p: 1,
          max_tokens: 220,
          stream: false,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ]
        },
        { signal, timeout: timeoutMs }
      );
      content = completion.choices[0]?.message?.content || null;
    }

    if (!content) {
      console.info("[Mandate Rescue][LLM]", {
        provider: "nvidia",
        model,
        errorCode: input.error_code,
        status: "fallback"
      });
      return null;
    }

    // Strip markdown code fences if present
    const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const causeStr = String(parsed.cause || '').toLowerCase().trim();
    if (!FAILURE_CAUSES.includes(causeStr as FailureCause)) {
      console.info("[Mandate Rescue][LLM]", {
        provider: "nvidia",
        model,
        errorCode: input.error_code,
        status: "fallback"
      });
      return null;
    }

    const cause = causeStr as FailureCause;
    let confidence = Number(parsed.confidence);
    if (!Number.isFinite(confidence)) confidence = 0.75;
    confidence = Math.max(0, Math.min(1, confidence));

    let reasoning = String(parsed.reasoning || '').trim();
    if (!reasoning) reasoning = `NVIDIA NIM classification: ${cause}`;
    if (reasoning.length > 180) reasoning = reasoning.slice(0, 177) + '...';

    console.info("[Mandate Rescue][LLM]", {
      provider: "nvidia",
      model,
      errorCode: input.error_code,
      status: "success"
    });

    return {
      cause,
      confidence,
      reasoning,
      provider: "nvidia",
      model
    };
  } catch (error) {
    console.info("[Mandate Rescue][LLM]", {
      provider: "nvidia",
      model,
      errorCode: input.error_code,
      status: "fallback"
    });
    return null;
  }
}
