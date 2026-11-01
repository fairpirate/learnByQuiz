// Keep provider credentials separate: never forward an existing provider's key to NVIDIA.
export function resolveLLMConfiguration(env = process.env) {
  const provider = env.LLM_PROVIDER?.trim() || "openai";
  if (!["openai", "nvidia"].includes(provider))
    throw new Error("LLM_PROVIDER must be openai or nvidia");
  if (provider === "nvidia")
    return {
      provider,
      apiKey: env.NVIDIA_API_KEY,
      baseUrl: "https://integrate.api.nvidia.com/v1",
      model:
        env.NVIDIA_MODEL?.trim() || "nvidia/nemotron-3.5-super-vl-120b-a12b",
    };
  return {
    provider,
    apiKey: env.LLM_API_KEY,
    baseUrl: env.LLM_BASE_URL || "https://api.openai.com/v1",
    model: env.LLM_MODEL,
  };
}
