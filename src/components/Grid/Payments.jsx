import { userErrorMessage } from "../../../shared/user-errors.js";
import { useEffect, useRef, useState } from "react";
import { learningApi } from "../../api/learning";
import { auth } from "../../config/firebase";
import DataGrid from "./DataGrid";
export default function Payments({ revision = "" }) {
  const [account, setAccount] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const running = useRef(false),
    handledReturn = useRef(false);
  const checkoutKey = (packId) =>
    `paypal-checkout:${account?.environment || "sandbox"}:${auth.currentUser?.uid}:${packId}`;
  async function refresh() {
    setAccount(await learningApi("/payments/account"));
  }
  async function action(fn) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(userErrorMessage(e));
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  async function capture(id) {
    const { purchase } = await learningApi(`/payments/orders/${id}/capture`, {
      method: "POST",
    });
    if (["COMPLETED", "REVERSED"].includes(purchase.status))
      sessionStorage.removeItem(checkoutKey(purchase.packId));
    setNotice(
      purchase.status === "COMPLETED"
        ? "Payment verified. Your learning credits are ready."
        : purchase.status === "REVERSED"
          ? "This payment was refunded or reversed."
          : "Payment is awaiting approval or completion. Check its status again shortly.",
    );
  }
  useEffect(() => {
    refresh().catch((e) => setError(userErrorMessage(e)));
  }, [revision]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search),
      id = params.get("purchase");
    if (handledReturn.current) return;
    handledReturn.current = true;
    if (id && /^[a-f0-9-]{36}$/i.test(id)) action(() => capture(id));
    if (params.get("payment") === "cancelled")
      setNotice("Checkout cancelled. You can resume it from payment history.");
    if (id || params.has("payment"))
      window.history.replaceState({}, "", window.location.pathname);
  }, []);
  async function buy(packId) {
    await action(async () => {
      const key = checkoutKey(packId);
      let id = sessionStorage.getItem(key);
      if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem(key, id);
      }
      const { purchase } = await learningApi("/payments/orders", {
        method: "POST",
        body: { id, packId },
      });
      if (["COMPLETED", "REVERSED"].includes(purchase.status)) {
        sessionStorage.removeItem(key);
        setNotice(
          "Previous checkout is finished. Select the pack again to start a new purchase.",
        );
        return;
      }
      window.location.assign(purchase.approvalUrl);
    });
  }
  return (
    <section className="journey-card payments-panel">
      <p className="eyebrow">PayPal × AI learning</p>
      <h2>Learning credits & payments</h2>
      <p>
        One credit creates one AI learning plan or one personalized quiz with a
        plan and answer review. Failed generations return the credit. Classic
        quizzes stay free.
      </p>
      {account && (
        <p>
          <strong>
            {account.enabled
              ? `${account.wallet.balance} credits available · ${account.environment === "sandbox" ? "PayPal sandbox — test payments only" : "PayPal live payments"}`
              : "Checkout is unavailable right now. You can continue using AI learning for free."}
          </strong>
        </p>
      )}
      <p>
        When billing is enabled, each account starts with 3 complimentary
        credits. Packs are one-time purchases with no recurring billing.
      </p>
      {error && (
        <p role="alert" className="journey-error">
          {error}{" "}
          <button disabled={busy} onClick={() => action(refresh)}>
            Retry payments
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="journey-notice">
          {notice}
        </p>
      )}
      <DataGrid
        label="Learning packs"
        rows={account?.packs || []}
        searchable={false}
        exportable={false}
        columns={[
          { field: "name", headerName: "Pack", minWidth: 170 },
          { field: "credits", headerName: "AI credits" },
          {
            headerName: "One-time price",
            valueGetter: (p) => `${p.data.currency} ${p.data.amount}`,
          },
          {
            headerName: "Checkout",
            sortable: false,
            filter: false,
            minWidth: 180,
            cellRenderer: ({ data }) => (
              <button
                disabled={busy || !account?.enabled}
                onClick={() => buy(data.id)}
              >
                Buy with PayPal
              </button>
            ),
          },
        ]}
      />
      <p className="journey-muted">
        A refund or payment reversal removes all credits from that pack. Credits
        already used can leave a negative balance.
      </p>
      <h3>Payment history</h3>
      <p className="journey-muted">
        If checkout was interrupted, use Check payment. Credits are added once
        after PayPal confirms your payment. Contact support with the payment ID
        for refund support.
      </p>
      <DataGrid
        label="Payment history"
        rows={account?.purchases || []}
        columns={[
          {
            field: "createdAt",
            headerName: "Created",
            minWidth: 170,
            valueFormatter: (p) => new Date(p.value).toLocaleString(),
          },
          { field: "name", headerName: "Pack" },
          { field: "id", headerName: "Payment ID", minWidth: 240 },
          { field: "status", headerName: "Status" },
          {
            headerName: "Total",
            valueGetter: (p) => `${p.data.currency} ${p.data.amount}`,
          },
          { field: "credits", headerName: "Credits" },
          {
            headerName: "Actions",
            minWidth: 230,
            filter: false,
            sortable: false,
            cellRenderer: ({ data }) => (
              <div>
                <button
                  disabled={busy || !data.orderId || !account?.enabled}
                  onClick={() => action(() => capture(data.id))}
                >
                  Check payment
                </button>
                {data.status === "CREATED" && data.approvalUrl && (
                  <a href={data.approvalUrl}> Resume checkout</a>
                )}
              </div>
            ),
          },
        ]}
      />
    </section>
  );
}
