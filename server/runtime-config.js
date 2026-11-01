export function runtimeConfiguration(env = process.env) {
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be an integer between 1 and 65535");
  // Trust only explicitly configured proxy addresses/subnets. Hop counts and
  // blanket trust allow client-controlled forwarding headers on alternate paths.
  const value = env.TRUST_PROXY?.trim();
  if (value && /^(true|false|\d+)$/i.test(value))
    throw new Error(
      "TRUST_PROXY must contain trusted proxy addresses or subnets",
    );
  return {
    port,
    trustProxy: value ? value.split(",").map((part) => part.trim()) : false,
  };
}
