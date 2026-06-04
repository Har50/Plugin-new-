import express from "express";
import initSqlJs from "sql.js";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import Razorpay from "razorpay";
import crypto from "crypto";
import dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const DB_PATH = join(homedir(), ".opencode-audit", "audit.db");
const PORT = parseInt(process.env.PORT || "3456", 10);
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";

const app = express();
app.set("view engine", "ejs");
app.set("views", join(__dirname, "views"));
app.use(express.static(join(__dirname, "public")));
app.use(express.json());

let SQL: any;
let razorpayInstance: any = null;
if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
  razorpayInstance = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
}

async function openDb() {
  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  let db: any;
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_key TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    razorpay_payment_id TEXT,
    razorpay_order_id TEXT,
    activated_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT,
    customer_email TEXT,
    customer_name TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS razorpay_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    razorpay_order_id TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL DEFAULT 'created',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`);

  return db;
}

function saveDb(db: any) {
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(DB_PATH, buffer);
}

async function withDb<T>(fn: (db: any) => T): Promise<T> {
  const db = await openDb();
  try {
    const result = await fn(db);
    saveDb(db);
    return result;
  } finally {
    db.close();
  }
}

async function readDb<T>(fn: (db: any) => T): Promise<T> {
  const db = await openDb();
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

async function getLicenseInfo() {
  try {
    return await readDb(async (db) => {
      const rows = db.exec(
        "SELECT plan, status, expires_at FROM licenses WHERE status = 'active' ORDER BY id DESC LIMIT 1"
      );
      if (rows[0]?.values.length) {
        return {
          plan: rows[0].values[0][0],
          status: rows[0].values[0][1],
          expiresAt: rows[0].values[0][2],
        };
      }
      return { plan: "free", status: "active", expiresAt: null };
    });
  } catch {
    return { plan: "free", status: "active", expiresAt: null };
  }
}

const PLAN_PRICES: Record<string, { amount: number; label: string }> = {
  pro: { amount: 84900, label: "Pro" },
  enterprise: { amount: 424900, label: "Enterprise" },
};

app.get("/", (_req, res) => {
  res.redirect("/dashboard");
});

app.get("/api/config", (_req, res) => {
  res.json({
    razorpayKeyId: RAZORPAY_KEY_ID || null,
    razorpayConfigured: !!razorpayInstance,
  });
});

app.get("/api/license/status", async (_req, res) => {
  const license = await getLicenseInfo();

  const payments = await readDb(async (db) => {
    const rows = db.exec(
      "SELECT razorpay_order_id, plan, amount, currency, status, created_at FROM razorpay_orders ORDER BY created_at DESC"
    );
    return rows[0]?.values.map((v: any[]) => ({
      orderId: v[0], plan: v[1], amount: v[2], currency: v[3],
      status: v[4], createdAt: v[5],
    })) || [];
  });

  res.json({ ...license, payments });
});

app.post("/api/razorpay/create-order", async (req, res) => {
  const { plan } = req.body;

  if (!razorpayInstance) {
    return res.status(400).json({ error: "Razorpay not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env" });
  }
  if (!PLAN_PRICES[plan]) {
    return res.status(400).json({ error: "Invalid plan. Choose 'pro' or 'enterprise'" });
  }

  try {
    const p = PLAN_PRICES[plan];
    const order = await razorpayInstance.orders.create({
      amount: p.amount,
      currency: "INR",
      receipt: `oa_${plan}_${Date.now()}`,
    });

    await withDb(async (db) => {
      db.run(
        "INSERT INTO razorpay_orders (razorpay_order_id, plan, amount, status) VALUES (?, ?, ?, 'created')",
        [order.id, plan, p.amount]
      );
    });

    res.json({ orderId: order.id, amount: p.amount, currency: "INR", plan });
  } catch (err: any) {
    console.error("Razorpay order error:", err);
    res.status(500).json({ error: err.message || "Failed to create order" });
  }
});

app.post("/api/razorpay/verify", async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, customer_email, customer_name } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: "Missing payment details" });
  }

  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(body)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    return res.status(400).json({ error: "Payment verification failed: signature mismatch" });
  }

  const licenseKey = `OA-${crypto.randomBytes(4).toString("hex").toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

  try {
    const result = await withDb(async (db) => {
      const orderRows = db.exec(
        "SELECT plan FROM razorpay_orders WHERE razorpay_order_id = ?",
        [razorpay_order_id]
      );
      const plan = orderRows[0]?.values[0]?.[0] || "pro";

      db.run("UPDATE razorpay_orders SET status = 'paid' WHERE razorpay_order_id = ?", [razorpay_order_id]);

      db.run(
        "INSERT INTO licenses (license_key, plan, status, razorpay_payment_id, razorpay_order_id, customer_email, customer_name) VALUES (?, ?, 'active', ?, ?, ?, ?)",
        [licenseKey, plan, razorpay_payment_id, razorpay_order_id, customer_email || null, customer_name || null]
      );

      return plan;
    });

    res.json({ success: true, licenseKey, plan: result });
  } catch (err: any) {
    console.error("License creation error:", err);
    res.status(500).json({ error: err.message || "Failed to create license" });
  }
});

app.post("/api/license/activate", async (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey) return res.status(400).json({ error: "License key required" });

  try {
    const result = await withDb(async (db) => {
      const rows = db.exec("SELECT plan, status FROM licenses WHERE license_key = ?", [licenseKey.trim()]);
      if (!rows[0]?.values.length) {
        return { error: "Invalid license key" };
      }
      const row = rows[0].values[0];
      return { plan: row[0], status: row[1] };
    });

    if (result.error) return res.status(400).json(result);
    res.json({ success: true, plan: result.plan, status: result.status });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Activation failed" });
  }
});

app.post("/api/razorpay/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";

  if (webhookSecret) {
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(JSON.stringify(req.body))
      .digest("hex");
    const receivedSignature = req.headers["x-razorpay-signature"] as string;
    if (expectedSignature !== receivedSignature) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }
  }

  const event = req.body;
  if (event.event === "payment.captured" || event.event === "order.paid") {
    const paymentId = event.payload.payment?.entity?.id;
    const orderId = event.payload.order?.entity?.id || event.payload.payment?.entity?.order_id;
    if (orderId) {
      await withDb(async (db) => {
        db.run("UPDATE razorpay_orders SET status = 'paid' WHERE razorpay_order_id = ?", [orderId]);
      });
    }
  }

  res.json({ status: "ok" });
});

app.get("/license", async (_req, res) => {
  const license = await getLicenseInfo();
  const payments = await readDb(async (db) => {
    const rows = db.exec(
      "SELECT razorpay_order_id, plan, amount, currency, status, created_at FROM razorpay_orders ORDER BY created_at DESC"
    );
    return rows[0]?.values.map((v: any[]) => ({
      orderId: v[0], plan: v[1], amount: v[2], currency: v[3],
      status: v[4], createdAt: v[5],
    })) || [];
  });

  res.render("license", {
    license,
    payments,
    razorpayConfigured: !!razorpayInstance,
    razorpayKeyId: RAZORPAY_KEY_ID,
  });
});

app.get("/dashboard", async (_req, res) => {
  if (!existsSync(DB_PATH)) {
    return res.render("dashboard", {
      sessions: [],
      totalTools: 0,
      totalFiles: 0,
      totalErrors: 0,
      activeSessions: 0,
      error: "No audit data found. Run OpenCode with the audit plugin first.",
    });
  }

  const db = await openDb();
  if (!db) {
    return res.render("dashboard", {
      sessions: [], totalTools: 0, totalFiles: 0, totalErrors: 0, activeSessions: 0,
      error: "Could not open database.",
    });
  }

  try {
    const sessions = db.exec(`
      SELECT id, created_at, updated_at, status, message_count, tool_count
      FROM sessions ORDER BY created_at DESC LIMIT 50
    `);

    const stats = db.exec(`
      SELECT
        (SELECT COUNT(*) FROM tool_calls) as total_tools,
        (SELECT COUNT(*) FROM file_changes) as total_files,
        (SELECT COUNT(*) FROM errors) as total_errors,
        (SELECT COUNT(*) FROM sessions WHERE status = 'active') as active_sessions
    `);

    const rows = sessions[0]?.values.map((v: any[]) => ({
      id: v[0], created_at: v[1], updated_at: v[2],
      status: v[3], message_count: v[4], tool_count: v[5],
    })) || [];

    const s = stats[0]?.values[0] || [0, 0, 0, 0];
    const license = await getLicenseInfo();

    res.render("dashboard", {
      sessions: rows,
      totalTools: s[0], totalFiles: s[1], totalErrors: s[2], activeSessions: s[3],
      error: null,
      license,
      razorpayConfigured: !!razorpayInstance,
    });
  } finally {
    db.close();
  }
});

app.get("/session/:id", async (req, res) => {
  if (!existsSync(DB_PATH)) {
    return res.status(404).send("No data found");
  }

  const db = await openDb();
  if (!db) return res.status(500).send("DB error");

  try {
    const sessionRows = db.exec("SELECT * FROM sessions WHERE id = ?", [req.params.id]);
    if (!sessionRows[0]?.values.length) {
      return res.status(404).send("Session not found");
    }

    const s = sessionRows[0].values[0];
    const session = {
      id: s[0], created_at: s[1], updated_at: s[2],
      status: s[3], message_count: s[4], tool_count: s[5],
    };

    const tc = db.exec("SELECT * FROM tool_calls WHERE session_id = ? ORDER BY timestamp ASC", [req.params.id]);
    const toolCalls = tc[0]?.values.map((v: any[]) => ({
      id: v[0], session_id: v[1], timestamp: v[2], tool_name: v[3],
      args: v[4], result: v[5], duration_ms: v[6], success: v[7],
    })) || [];

    const fc = db.exec("SELECT * FROM file_changes WHERE session_id = ? ORDER BY timestamp ASC", [req.params.id]);
    const fileChanges = fc[0]?.values.map((v: any[]) => ({
      id: v[0], session_id: v[1], timestamp: v[2], file_path: v[3],
      change_type: v[4], content_preview: v[5],
    })) || [];

    const msg = db.exec("SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC", [req.params.id]);
    const messages = msg[0]?.values.map((v: any[]) => ({
      id: v[0], session_id: v[1], timestamp: v[2], role: v[3],
      content_preview: v[4], token_count: v[5],
    })) || [];

    const err = db.exec("SELECT * FROM errors WHERE session_id = ? ORDER BY timestamp ASC", [req.params.id]);
    const errors = err[0]?.values.map((v: any[]) => ({
      id: v[0], session_id: v[1], timestamp: v[2],
      error_type: v[3], message: v[4], stack: v[5],
    })) || [];

    const license = await getLicenseInfo();

    res.render("session", { session, toolCalls, fileChanges, messages, errors, license, razorpayConfigured: !!razorpayInstance });
  } finally {
    db.close();
  }
});

app.get("/api/report/:id", async (req, res) => {
  if (!existsSync(DB_PATH)) return res.status(404).json({ error: "No data" });

  const db = await openDb();
  if (!db) return res.status(500).json({ error: "DB error" });

  try {
    const sessionRows = db.exec("SELECT * FROM sessions WHERE id = ?", [req.params.id]);
    if (!sessionRows[0]?.values.length) {
      return res.status(404).json({ error: "Not found" });
    }

    const s = sessionRows[0].values[0];
    const session = {
      id: s[0], created_at: s[1], status: s[3],
      message_count: s[4], tool_count: s[5],
    };

    const tc = db.exec(
      "SELECT tool_name, COUNT(*) as count FROM tool_calls WHERE session_id = ? GROUP BY tool_name",
      [req.params.id]
    );
    const toolBreakdown = tc[0]?.values.map((v: any[]) => ({ tool: v[0], count: v[1] })) || [];

    const fc = db.exec(
      "SELECT change_type, COUNT(*) as count FROM file_changes WHERE session_id = ? GROUP BY change_type",
      [req.params.id]
    );
    const fileBreakdown = fc[0]?.values.map((v: any[]) => ({ type: v[0], count: v[1] })) || [];

    const ec = db.exec("SELECT COUNT(*) as count FROM errors WHERE session_id = ?", [req.params.id]);
    const errorCount = ec[0]?.values[0]?.[0] || 0;

    const totalTools = toolBreakdown.reduce((a: number, t: any) => a + t.count, 0);
    const totalFiles = fileBreakdown.reduce((a: number, f: any) => a + f.count, 0);

    res.json({
      session_id: session.id,
      created_at: session.created_at,
      status: session.status,
      message_count: session.message_count,
      tool_count: session.tool_count,
      summary: {
        total_tool_calls: totalTools,
        total_file_changes: totalFiles,
        total_errors: errorCount,
      },
      tool_breakdown: toolBreakdown,
      file_breakdown: fileBreakdown,
    });
  } finally {
    db.close();
  }
});

async function start() {
  SQL = await initSqlJs();

  await openDb().then(db => { db.close(); });

  app.listen(PORT, () => {
    console.log(`OpenCode Audit Dashboard running at http://localhost:${PORT}`);
    console.log(`DB: ${DB_PATH}`);
    if (razorpayInstance) {
      console.log("Razorpay: configured");
    } else {
      console.log("Razorpay: not configured (set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env)");
    }
    if (!existsSync(DB_PATH)) {
      console.log("No audit data yet. Install the plugin in .opencode/plugins/ and run OpenCode to start collecting data.");
    }
  });
}

start();
