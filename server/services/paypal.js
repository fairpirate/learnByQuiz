import { createHash } from "node:crypto";
import { AppError } from "../errors.js";

export const creditPacks = Object.freeze([
  {
    id: "starter",
    name: "Learning starter",
    credits: 10,
    amount: "1.00",
    currency: "USD",
  },
  {
    id: "explorer",
    name: "Learning explorer",
    credits: 30,
    amount: "2.00",
    currency: "USD",
  },
]);
const unavailable = () =>
  new AppError(
    503,
    "PAYPAL_UNAVAILABLE",
    "PayPal checkout is not configured. Contact the administrator.",
  );
export class PayPalService {
  constructor({ env = process.env, fetchImpl = fetch, repo } = {}) {
    this.repo = repo;
    this.fetch = fetchImpl;
    this.clientId = env.PAYPAL_CLIENT_ID;
    this.secret = env.PAYPAL_CLIENT_SECRET;
    this.webhookId = env.PAYPAL_WEBHOOK_ID;
    this.environment = env.PAYPAL_ENVIRONMENT || "sandbox";
    if (!["sandbox", "live"].includes(this.environment))
      throw new Error("PAYPAL_ENVIRONMENT must be sandbox or live");
    if (env.PAYPAL_ENABLED && !["true", "false"].includes(env.PAYPAL_ENABLED))
      throw new Error("PAYPAL_ENABLED must be true or false");
    this.enabled = env.PAYPAL_ENABLED === "true";
    this.base =
      this.environment === "live"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";
    this.origin = env.APP_ORIGIN;
    if (this.enabled) {
      if (!this.clientId || !this.secret || !this.webhookId || !this.origin)
        throw new Error(
          "Enabled PayPal requires credentials, webhook ID and APP_ORIGIN",
        );
      const url = new URL(this.origin);
      if (
        url.origin !== this.origin ||
        (url.protocol !== "https:" &&
          !(
            this.environment === "sandbox" &&
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(url.hostname)
          ))
      )
        throw new Error(
          "APP_ORIGIN must be an HTTPS origin (sandbox permits localhost HTTP)",
        );
    }
  }
  async request(path, { method = "GET", body, requestId } = {}) {
    if (!this.enabled) throw unavailable();
    try {
      if (!this.token || this.expiresAt < Date.now()) {
        const response = await this.fetch(`${this.base}/v1/oauth2/token`, {
          method: "POST",
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.clientId}:${this.secret}`).toString("base64")}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: "grant_type=client_credentials",
          signal: AbortSignal.timeout(15000),
        });
        const data = await response.json();
        if (!response.ok || !data.access_token) throw unavailable();
        this.token = data.access_token;
        this.expiresAt =
          Date.now() + Math.max(0, (data.expires_in - 60) * 1000);
      }
      const response = await this.fetch(`${this.base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) this.token = null;
        if (data.details?.some((d) => d.issue === "INSTRUMENT_DECLINED"))
          throw new AppError(
            422,
            "PAYMENT_DECLINED",
            "PayPal declined this payment. Start a new checkout with another funding source.",
          );
        throw new AppError(
          502,
          "PAYPAL_REQUEST_FAILED",
          "PayPal could not complete the request. Retry from payment history to check its status.",
        );
      }
      return data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(
        502,
        "PAYPAL_UNREACHABLE",
        "PayPal is temporarily unreachable. Retry from payment history; do not start another payment.",
      );
    }
  }
  async create(uid, packId, id) {
    if (!this.enabled) throw unavailable();
    const pack = creditPacks.find((p) => p.id === packId);
    if (!pack)
      throw new AppError(400, "INVALID_PACK", "Select a listed learning pack.");
    // Persist intent before contacting PayPal. The client retains this UUID for safe retries.
    const purchase = await this.repo.createPurchase(uid, {
      ...pack,
      packId: pack.id,
      id,
      createdAt: new Date().toISOString(),
      status: "CREATED",
    });
    if (purchase.packId !== packId)
      throw new AppError(
        409,
        "PURCHASE_CONFLICT",
        "This checkout already belongs to another pack.",
      );
    if (purchase.orderId) return purchase;
    const order = await this.request("/v2/checkout/orders", {
      method: "POST",
      requestId: createHash("sha256")
        .update(`${uid}:${id}:create`)
        .digest("hex")
        .slice(0, 38),
      body: {
        intent: "CAPTURE",
        purchase_units: [
          {
            reference_id: id,
            custom_id: uid,
            invoice_id: id,
            description: `${pack.name}: ${pack.credits} AI learning credits`,
            amount: { currency_code: pack.currency, value: pack.amount },
          },
        ],
        payment_source: {
          paypal: {
            experience_context: {
              user_action: "PAY_NOW",
              shipping_preference: "NO_SHIPPING",
              return_url: `${this.origin}/journey?purchase=${id}`,
              cancel_url: `${this.origin}/journey?payment=cancelled`,
            },
          },
        },
      },
    });
    const approvalUrl = order.links?.find((l) =>
      ["payer-action", "approve"].includes(l.rel),
    )?.href;
    const expectedHost =
      this.environment === "live" ? "www.paypal.com" : "www.sandbox.paypal.com";
    if (
      !order.id ||
      !approvalUrl ||
      new URL(approvalUrl).hostname !== expectedHost ||
      new URL(approvalUrl).protocol !== "https:"
    )
      throw new AppError(
        502,
        "INVALID_PAYPAL_RESPONSE",
        "PayPal did not return a valid checkout link.",
      );
    return this.repo.attachOrder(uid, id, order.id, approvalUrl);
  }
  async reconcile(uid, id, capture = false) {
    const purchase = await this.repo.get(uid, "purchases", id);
    if (!purchase?.orderId)
      throw new AppError(
        404,
        "PURCHASE_NOT_FOUND",
        "Payment not found for this account.",
      );
    let order = await this.request(
      `/v2/checkout/orders/${encodeURIComponent(purchase.orderId)}`,
    );
    const validate = (candidate) => {
      const units = candidate.purchase_units || [],
        unit = units[0];
      if (
        candidate.id !== purchase.orderId ||
        candidate.intent !== "CAPTURE" ||
        units.length !== 1 ||
        unit.custom_id !== uid ||
        unit.invoice_id !== id ||
        unit.amount?.value !== purchase.amount ||
        unit.amount?.currency_code !== purchase.currency
      )
        throw new AppError(
          502,
          "PAYMENT_MISMATCH",
          "The payment details could not be verified.",
        );
      return unit;
    };
    validate(order);
    if (capture && order.status === "APPROVED") {
      await this.request(
        `/v2/checkout/orders/${encodeURIComponent(purchase.orderId)}/capture`,
        {
          method: "POST",
          body: {},
          requestId: createHash("sha256")
            .update(`${uid}:${id}:capture`)
            .digest("hex")
            .slice(0, 38),
        },
      );
      order = await this.request(
        `/v2/checkout/orders/${encodeURIComponent(purchase.orderId)}`,
      );
    }
    const unit = validate(order);
    const captures = unit.payments?.captures || [];
    if (
      captures.some((c) =>
        ["REFUNDED", "PARTIALLY_REFUNDED", "REVERSED"].includes(c.status),
      )
    ) {
      await this.repo.reversePurchase(uid, id);
      return this.repo.get(uid, "purchases", id);
    }
    if (order.status === "COMPLETED" && captures.length === 1) {
      const receipt = captures[0];
      if (
        typeof receipt.id === "string" &&
        receipt.status === "COMPLETED" &&
        receipt.amount?.value === purchase.amount &&
        receipt.amount?.currency_code === purchase.currency
      )
        return this.repo.settlePurchase(uid, id, receipt.id);
    }
    return purchase;
  }
  async webhook(headers, event) {
    if (!this.enabled) throw unavailable();
    const fields = [
      "paypal-auth-algo",
      "paypal-cert-url",
      "paypal-transmission-id",
      "paypal-transmission-sig",
      "paypal-transmission-time",
    ];
    if (fields.some((k) => !headers[k]))
      throw new AppError(
        400,
        "INVALID_WEBHOOK",
        "Missing PayPal signature headers.",
      );
    const verification = await this.request(
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: {
          auth_algo: headers[fields[0]],
          cert_url: headers[fields[1]],
          transmission_id: headers[fields[2]],
          transmission_sig: headers[fields[3]],
          transmission_time: headers[fields[4]],
          webhook_id: this.webhookId,
          webhook_event: event,
        },
      },
    );
    if (verification.verification_status !== "SUCCESS")
      throw new AppError(400, "INVALID_WEBHOOK", "Invalid PayPal signature.");
    if (
      ![
        "PAYMENT.CAPTURE.COMPLETED",
        "PAYMENT.CAPTURE.REFUNDED",
        "PAYMENT.CAPTURE.REVERSED",
      ].includes(event.event_type)
    )
      return;
    let orderId = event.resource?.supplementary_data?.related_ids?.order_id;
    if (!orderId && event.event_type === "PAYMENT.CAPTURE.REFUNDED") {
      const captureLink = event.resource?.links?.find(
        (l) => l.rel === "up",
      )?.href;
      const captureId =
        captureLink &&
        /\/v2\/payments\/captures\/([A-Z0-9]+)$/.exec(captureLink)?.[1];
      if (captureId) {
        const capture = await this.request(
          `/v2/payments/captures/${captureId}`,
        );
        orderId = capture.supplementary_data?.related_ids?.order_id;
      }
    }
    if (!orderId) return;
    const order = await this.request(
      `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    );
    const unit = order.purchase_units?.[0];
    if (!unit?.custom_id || !unit.invoice_id) return;
    const purchase = await this.repo.get(
      unit.custom_id,
      "purchases",
      unit.invoice_id,
    );
    if (!purchase || purchase.orderId !== orderId) return;
    if (event.event_type === "PAYMENT.CAPTURE.COMPLETED")
      await this.reconcile(unit.custom_id, unit.invoice_id);
    if (
      ["PAYMENT.CAPTURE.REFUNDED", "PAYMENT.CAPTURE.REVERSED"].includes(
        event.event_type,
      )
    ) {
      // Conservatively revoke the whole pack on any refund, including partial refunds.
      await this.repo.reversePurchase(unit.custom_id, unit.invoice_id);
    }
  }
}
