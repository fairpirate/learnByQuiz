import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { PayPalService, creditPacks } from "../services/paypal.js";
import { createApp } from "../app.js";
import { MemoryRepository } from "./helpers.js";
import { AppError } from "../errors.js";
const env = {
  PAYPAL_ENABLED: "true",
  PAYPAL_CLIENT_ID: "client",
  PAYPAL_CLIENT_SECRET: "secret",
  PAYPAL_WEBHOOK_ID: "webhook",
  APP_ORIGIN: "https://learn.example",
  PAYPAL_ENVIRONMENT: "sandbox",
};
const uid = "learner",
  id = randomUUID();
class BillingMemory extends MemoryRepository {
  async createPurchase(uid, purchase) {
    return (
      (await this.get(uid, "purchases", purchase.id)) ||
      this.put(uid, "purchases", purchase.id, purchase)
    );
  }
  async attachOrder(uid, id, orderId, approvalUrl) {
    return this.put(uid, "purchases", id, {
      ...(await this.get(uid, "purchases", id)),
      orderId,
      approvalUrl,
    });
  }
  async wallet(uid) {
    return (await this.get(uid, "billing", "wallet")) || { balance: 3 };
  }
  async settlePurchase(uid, id, captureId) {
    const p = await this.get(uid, "purchases", id);
    if (["COMPLETED", "REVERSED"].includes(p.status)) return p;
    await this.put(uid, "billing", "wallet", {
      balance: (await this.wallet(uid)).balance + p.credits,
    });
    return this.put(uid, "purchases", id, {
      ...p,
      status: "COMPLETED",
      captureId,
    });
  }
  async reversePurchase(uid, id) {
    const p = await this.get(uid, "purchases", id);
    if (p.status === "REVERSED") return;
    if (p.status === "COMPLETED")
      await this.put(uid, "billing", "wallet", {
        balance: (await this.wallet(uid)).balance - p.credits,
      });
    return this.put(uid, "purchases", id, { ...p, status: "REVERSED" });
  }
  async reserveCredit(uid, id) {
    const wallet = await this.wallet(uid);
    if (wallet.balance < 1)
      throw new AppError(402, "CREDITS_REQUIRED", "Buy credits.");
    await this.put(uid, "billing", "wallet", { balance: wallet.balance - 1 });
    await this.put(uid, "creditReservations", id, { status: "RESERVED" });
  }
  async finishCredit(uid, id, success) {
    if ((await this.get(uid, "creditReservations", id))?.status !== "RESERVED")
      return;
    await this.put(uid, "creditReservations", id, {
      status: success ? "CONSUMED" : "RELEASED",
    });
    if (!success)
      await this.put(uid, "billing", "wallet", {
        balance: (await this.wallet(uid)).balance + 1,
      });
  }
}
function setup() {
  const repo = new BillingMemory(),
    calls = [];
  let status = "APPROVED",
    verification = "SUCCESS",
    override = {};
  const order = () => ({
    id: "ORDER123",
    intent: "CAPTURE",
    status,
    purchase_units: [
      {
        custom_id: uid,
        invoice_id: id,
        amount: { value: "5.00", currency_code: "USD" },
        payments: {
          captures: [
            {
              id: "CAPTURE123",
              status: "COMPLETED",
              amount: { value: "5.00", currency_code: "USD" },
            },
          ],
        },
        ...override,
      },
    ],
    links: [
      {
        rel: "payer-action",
        href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER123",
      },
    ],
  });
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options });
    if (url.endsWith("/v1/oauth2/token"))
      return Response.json({ access_token: "test-token", expires_in: 3600 });
    if (url.endsWith("/verify-webhook-signature"))
      return Response.json({ verification_status: verification });
    if (url.endsWith("/capture")) status = "COMPLETED";
    return Response.json(order());
  };
  const paypal = new PayPalService({ env, repo, fetchImpl });
  return {
    repo,
    paypal,
    calls,
    setStatus: (s) => {
      status = s;
    },
    setVerification: (s) => {
      verification = s;
    },
    setOverride: (s) => {
      override = s;
    },
  };
}
const headers = Object.fromEntries(
  [
    "auth-algo",
    "cert-url",
    "transmission-id",
    "transmission-sig",
    "transmission-time",
  ].map((k) => [`paypal-${k}`, "test"]),
);
const event = (type) => ({
  id: randomUUID(),
  event_type: type,
  resource: {
    id: "CAPTURE123",
    supplementary_data: { related_ids: { order_id: "ORDER123" } },
  },
});

test("PayPal fails closed for incomplete or invalid production configuration", () => {
  assert.throws(
    () => new PayPalService({ env: { ...env, PAYPAL_CLIENT_SECRET: "" } }),
  );
  assert.throws(
    () => new PayPalService({ env: { ...env, PAYPAL_ENVIRONMENT: "invalid" } }),
  );
  assert.throws(
    () =>
      new PayPalService({
        env: { ...env, APP_ORIGIN: "http://public.example" },
      }),
  );
  assert.throws(
    () =>
      new PayPalService({
        env: { ...env, APP_ORIGIN: "https://example.com/path" },
      }),
  );
  assert.equal(new PayPalService({ env: {} }).enabled, false);
});
test("PayPal creates server-priced orders and reuses persisted checkout without another provider call", async () => {
  const { repo, paypal, calls } = setup();
  const p = await paypal.create(uid, "starter", id);
  assert.equal(p.amount, "5.00");
  assert.equal(p.credits, 10);
  assert.match(p.approvalUrl, /^https:\/\/www.sandbox.paypal.com\//);
  const create = calls.find((c) => c.url.endsWith("/v2/checkout/orders"));
  const body = JSON.parse(create.body);
  assert.equal(body.purchase_units[0].amount.value, creditPacks[0].amount);
  assert.equal(body.purchase_units[0].custom_id, uid);
  assert.equal(
    body.payment_source.paypal.experience_context.shipping_preference,
    "NO_SHIPPING",
  );
  const count = calls.length;
  assert.deepEqual(await paypal.create(uid, "starter", id), p);
  assert.equal(calls.length, count);
  assert.equal((await repo.list(uid, "purchases")).length, 1);
  await assert.rejects(paypal.create(uid, "explorer", id), {
    code: "PURCHASE_CONFLICT",
  });
});
test("capture verifies owner, amount and currency before credits and retries grant once", async () => {
  const { paypal, repo, calls } = setup();
  await paypal.create(uid, "starter", id);
  await assert.rejects(paypal.reconcile("another", id, true), {
    code: "PURCHASE_NOT_FOUND",
  });
  await paypal.reconcile(uid, id, true);
  await paypal.reconcile(uid, id, true);
  assert.equal((await repo.wallet(uid)).balance, 13);
  assert.equal(calls.filter((c) => c.url.endsWith("/capture")).length, 1);
  assert.ok(
    calls.find((c) => c.url.endsWith("/capture")).headers["PayPal-Request-Id"],
  );
});
for (const [name, override] of [
  ["owner", { custom_id: "attacker" }],
  ["invoice", { invoice_id: randomUUID() }],
  ["amount", { amount: { value: "0.01", currency_code: "USD" } }],
  ["currency", { amount: { value: "5.00", currency_code: "EUR" } }],
])
  test(`mismatched ${name} never grants credits`, async () => {
    const ctx = setup();
    await ctx.paypal.create(uid, "starter", id);
    ctx.setStatus("COMPLETED");
    ctx.setOverride(override);
    await assert.rejects(ctx.paypal.reconcile(uid, id, true), {
      code: "PAYMENT_MISMATCH",
    });
    assert.equal((await ctx.repo.wallet(uid)).balance, 3);
  });
test("pending capture grants no credits", async () => {
  const ctx = setup();
  await ctx.paypal.create(uid, "starter", id);
  ctx.setStatus("COMPLETED");
  ctx.setOverride({
    payments: {
      captures: [
        { status: "PENDING", amount: { value: "5.00", currency_code: "USD" } },
      ],
    },
  });
  await ctx.paypal.reconcile(uid, id);
  assert.equal((await ctx.repo.wallet(uid)).balance, 3);
});
test("invalid or missing webhook signatures cannot change billing", async () => {
  const ctx = setup();
  await ctx.paypal.create(uid, "starter", id);
  await assert.rejects(
    ctx.paypal.webhook({}, event("PAYMENT.CAPTURE.COMPLETED")),
    { code: "INVALID_WEBHOOK" },
  );
  ctx.setVerification("FAILURE");
  await assert.rejects(
    ctx.paypal.webhook(headers, event("PAYMENT.CAPTURE.COMPLETED")),
    { code: "INVALID_WEBHOOK" },
  );
  assert.equal((await ctx.repo.wallet(uid)).balance, 3);
});
test("verified duplicate completion/refund and out-of-order events do not mint credits", async () => {
  const ctx = setup();
  await ctx.paypal.create(uid, "starter", id);
  ctx.setStatus("COMPLETED");
  await ctx.paypal.webhook(headers, event("PAYMENT.CAPTURE.COMPLETED"));
  await ctx.paypal.webhook(headers, event("PAYMENT.CAPTURE.COMPLETED"));
  assert.equal((await ctx.repo.wallet(uid)).balance, 13);
  await ctx.paypal.webhook(headers, event("PAYMENT.CAPTURE.REFUNDED"));
  await ctx.paypal.webhook(headers, event("PAYMENT.CAPTURE.REFUNDED"));
  await ctx.paypal.webhook(headers, event("PAYMENT.CAPTURE.COMPLETED"));
  assert.equal((await ctx.repo.wallet(uid)).balance, 3);
});
test("provider errors redact credentials and payment details", async () => {
  const paypal = new PayPalService({
    env,
    fetchImpl: async () =>
      Response.json({ error: "secret access denied" }, { status: 401 }),
  });
  await assert.rejects(
    paypal.request("/v2/checkout/orders"),
    (e) => e.code === "PAYPAL_UNAVAILABLE" && !e.message.includes("secret"),
  );
});
function app(ctx, run = async () => ({ ok: true })) {
  return createApp({
    repo: ctx.repo,
    paypal: ctx.paypal,
    qloo: {},
    agent: { run },
    verifyToken: async (token) => ({ uid: token }),
    logger: () => {},
  });
}
test("payment routes require auth, reject client prices, and scope history to the token", async () => {
  const ctx = setup(),
    api = app(ctx);
  await request(api).get("/api/payments/account").expect(401);
  await request(api)
    .post("/api/payments/orders")
    .set("Authorization", `Bearer ${uid}`)
    .send({ id, packId: "starter", amount: "0.01" })
    .expect(400);
  await ctx.paypal.create(uid, "starter", id);
  const own = await request(api)
    .get("/api/payments/account")
    .set("Authorization", `Bearer ${uid}`)
    .expect(200);
  assert.equal(own.body.purchases.length, 1);
  const other = await request(api)
    .get("/api/payments/account")
    .set("Authorization", "Bearer other")
    .expect(200);
  assert.equal(other.body.purchases.length, 0);
  await request(api)
    .post(`/api/payments/orders/${id}/capture`)
    .set("Authorization", "Bearer other")
    .send({})
    .expect(404);
});
test("AI success consumes a credit; AI failure restores it; zero balance blocks the provider", async () => {
  const ctx = setup();
  let calls = 0;
  const api = app(ctx, async () => {
    calls++;
    return { ok: true };
  });
  const generate = (api) =>
    request(api)
      .post("/api/agents/generate-quiz")
      .set("Authorization", `Bearer ${uid}`)
      .send({});
  await generate(api).expect(200);
  assert.equal((await ctx.repo.wallet(uid)).balance, 2);
  await generate(
    app(ctx, async () => {
      throw new AppError(502, "FAILED", "AI unavailable");
    }),
  ).expect(502);
  assert.equal((await ctx.repo.wallet(uid)).balance, 2);
  await ctx.repo.put(uid, "billing", "wallet", { balance: 0 });
  await generate(api).expect(402);
  assert.equal(calls, 1);
});
test("webhook is public but requires verified PayPal signatures, with bounded JSON input", async () => {
  const ctx = setup(),
    api = app(ctx);
  await request(api)
    .post("/api/payments/webhook")
    .send(event("PAYMENT.CAPTURE.COMPLETED"))
    .expect(400);
  await request(api)
    .post("/api/payments/webhook")
    .set(headers)
    .send(event("UNRELATED.EVENT"))
    .expect(204);
});
