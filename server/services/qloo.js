import { z } from "zod";
import { AppError } from "../errors.js";
import { entityType } from "../schemas.js";
// Search returns tag_id; Insights returns id. Normalize both verified API shapes.
const rawTag = z.union([
  z.object({ id: z.string().min(1), name: z.string().min(1) }),
  z.object({ tag_id: z.string().min(1), name: z.string().min(1) }),
  // Artist metadata can contain a namespace placeholder with no tag ID/name.
  z.object({ type: z.string().min(1) }).strict(),
]);
const rawEntity = z
  .object({
    entity_id: z.string().uuid(),
    name: z.string().min(1),
    subtype: z.string().optional(),
    types: z.array(z.string()).optional(),
    tags: z.array(rawTag).nullish(),
    query: z
      .object({ affinity: z.number().finite().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();
const searchResponse = z.object({ results: z.array(rawEntity) });
const insightsResponse = z.object({
  success: z.literal(true),
  results: z.object({ entities: z.array(rawEntity) }),
});
export class QlooService {
  constructor({
    apiKey = process.env.QLOO_API_KEY,
    baseUrl = process.env.QLOO_BASE_URL || "https://hackathon.api.qloo.com",
    fetchImpl = fetch,
    ttl = 300000,
    timeout = 12000,
  } = {}) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.fetch = fetchImpl;
    this.ttl = ttl;
    this.timeout = timeout;
    this.cache = new Map();
    if (new URL(baseUrl).protocol !== "https:")
      throw new Error("Qloo requires HTTPS");
  }
  async request(path, params, schema) {
    if (!this.apiKey)
      throw new AppError(
        503,
        "QLOO_NOT_CONFIGURED",
        "Configure QLOO_API_KEY on the server to discover interests.",
      );
    const url = new URL(path, this.baseUrl);
    url.search = new URLSearchParams(params).toString();
    const key = url.toString(),
      cached = this.cache.get(key);
    if (cached?.expires > Date.now()) return structuredClone(cached.data);
    let response;
    try {
      response = await this.fetch(url, {
        method: "GET",
        headers: { "X-Api-Key": this.apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeout),
        redirect: "error",
      });
    } catch {
      throw new AppError(
        502,
        "QLOO_UNAVAILABLE",
        "Qloo is unavailable or timed out. Please retry.",
      );
    }
    if (response.status === 404 && path === "/search") return [];
    if (response.status === 429)
      throw new AppError(
        503,
        "QLOO_RATE_LIMIT",
        "Qloo rate limit reached. Please try again later.",
      );
    if (response.status === 401)
      throw new AppError(
        502,
        "QLOO_AUTH_FAILED",
        "Qloo authentication failed. Hackathon keys require https://hackathon.api.qloo.com; verify the server key and base URL.",
      );
    if (response.status === 403)
      throw new AppError(
        502,
        "QLOO_FORBIDDEN",
        "Qloo access was denied. Verify the requested entity type and your key's permissions.",
      );
    if (response.status === 400)
      throw new AppError(
        502,
        "QLOO_INVALID_REQUEST",
        "Qloo rejected the request. Check the entity type and supported signals against the Qloo API reference.",
      );
    if (!response.ok)
      throw new AppError(
        502,
        "QLOO_ERROR",
        "Qloo could not process this discovery. Check server configuration or try another interest.",
      );
    let parsed;
    let payload;
    try {
      payload = await response.json();
      parsed = schema.parse(payload);
    } catch (cause) {
      const error = new AppError(
        502,
        "QLOO_INVALID_RESPONSE",
        "Qloo returned an unexpected response.",
      );
      // Internal contract diagnostics contain paths/types only, never provider values.
      error.fields =
        cause instanceof z.ZodError
          ? cause.issues.slice(0, 10).map((issue) => {
              const value = issue.path.reduce(
                (node, key) => node?.[key],
                payload,
              );
              return {
                path: issue.path.join("."),
                code: issue.code,
                receivedType:
                  value === null
                    ? "null"
                    : Array.isArray(value)
                      ? "array"
                      : typeof value,
              };
            })
          : [];
      throw error;
    }
    const items = path === "/search" ? parsed.results : parsed.results.entities;
    const data = items.map((e) => ({
      entity_id: e.entity_id,
      name: e.name.slice(0, 500),
      subtype:
        e.subtype ||
        e.types?.find((t) => t.startsWith("urn:entity:")) ||
        "urn:entity:unknown",
      tags: (e.tags || [])
        .filter((tag) => "name" in tag)
        .slice(0, 100)
        .map((t) => ({
          id: ("id" in t ? t.id : t.tag_id).slice(0, 500),
          name: t.name.slice(0, 500),
        })),
      affinity: e.query?.affinity ?? null,
    }));
    if (this.cache.size >= 200)
      this.cache.delete(this.cache.keys().next().value);
    this.cache.set(key, { expires: Date.now() + this.ttl, data });
    return structuredClone(data);
  }
  searchEntities(query, type) {
    return this.request(
      "/search",
      {
        query,
        take: "10",
        ...(type ? { types: `urn:entity:${entityType.parse(type)}` } : {}),
      },
      searchResponse,
    );
  }
  discoverTaste(ids, type = "book") {
    return this.request(
      "/v2/insights",
      {
        "filter.type": `urn:entity:${entityType.parse(type)}`,
        "signal.interests.entities": ids.join(","),
        "filter.exclude.entities": ids.join(","),
        take: "10",
      },
      insightsResponse,
    );
  }
  getRelatedEntities(ids, type) {
    return this.discoverTaste(ids, type);
  }
  getPersonalizedRecommendations(profile, type) {
    return this.discoverTaste(
      profile.entities.map((e) => e.entity_id),
      type,
    );
  }
}
