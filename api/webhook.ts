import crypto from "crypto";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Collect raw body for signature verification
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const rawBody = Buffer.concat(chunks).toString("utf-8");
  const event = JSON.parse(rawBody);

  // Verify webhook signature
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
  if (webhookSecret) {
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");
    const receivedSignature = req.headers["x-razorpay-signature"] as string;
    if (!receivedSignature || expectedSignature !== receivedSignature) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }
  }

  console.log(
    `[webhook] ${event.event} payment=${event.payload?.payment?.entity?.id || "—"} order=${event.payload?.order?.entity?.id || event.payload?.payment?.entity?.order_id || "—"}`
  );

  // Forward to dashboard Express server if configured
  const dashboardUrl = process.env.DASHBOARD_URL;
  if (dashboardUrl) {
    try {
      await fetch(`${dashboardUrl}/api/razorpay/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: rawBody,
      });
    } catch (err: any) {
      console.error(`[webhook] failed to forward to dashboard: ${err.message}`);
    }
  }

  res.json({ status: "ok" });
}
