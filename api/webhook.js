import crypto from "crypto";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const event = req.body;

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  const receivedSignature = req.headers["x-razorpay-signature"];

  if (webhookSecret && receivedSignature) {
    const rawBody = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");
    if (expectedSignature !== receivedSignature) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }
  }

  console.log(
    `[webhook] ${event.event} payment=${event.payload?.payment?.entity?.id || "-"} order=${event.payload?.order?.entity?.id || event.payload?.payment?.entity?.order_id || "-"}`
  );

  const dashboardUrl = process.env.DASHBOARD_URL;
  if (dashboardUrl) {
    try {
      await fetch(`${dashboardUrl}/api/razorpay/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event),
      });
    } catch (err) {
      console.error(`[webhook] failed to forward to dashboard: ${err.message}`);
    }
  }

  res.json({ status: "ok" });
}
