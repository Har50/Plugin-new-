import express from "express";
import initSqlJs from "sql.js";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(homedir(), ".opencode-audit", "audit.db");
const PORT = parseInt(process.env.PORT || "3456", 10);

const app = express();
app.set("view engine", "ejs");
app.set("views", join(__dirname, "views"));
app.use(express.static(join(__dirname, "public")));
app.use(express.json());

let SQL: any;

async function loadDb() {
  if (!existsSync(DB_PATH)) return null;
  const buffer = readFileSync(DB_PATH);
  return new SQL.Database(buffer);
}

app.get("/", (_req, res) => {
  res.redirect("/dashboard");
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

  const db = await loadDb();
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

    res.render("dashboard", {
      sessions: rows,
      totalTools: s[0], totalFiles: s[1], totalErrors: s[2], activeSessions: s[3],
      error: null,
    });
  } finally {
    db.close();
  }
});

app.get("/session/:id", async (req, res) => {
  if (!existsSync(DB_PATH)) {
    return res.status(404).send("No data found");
  }

  const db = await loadDb();
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

    res.render("session", { session, toolCalls, fileChanges, messages, errors });
  } finally {
    db.close();
  }
});

app.get("/api/report/:id", async (req, res) => {
  if (!existsSync(DB_PATH)) return res.status(404).json({ error: "No data" });

  const db = await loadDb();
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
  app.listen(PORT, () => {
    console.log(`OpenCode Audit Dashboard running at http://localhost:${PORT}`);
    console.log(`DB: ${DB_PATH}`);
    if (!existsSync(DB_PATH)) {
      console.log("No audit data yet. Install the plugin in .opencode/plugins/ and run OpenCode to start collecting data.");
    }
  });
}

start();
