import initSqlJs from "sql.js";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";

const DB_PATH = join(homedir(), ".opencode-audit", "audit.db");
const DB_DIR = join(homedir(), ".opencode-audit");
if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });

const SQL = await initSqlJs();
const db = new SQL.Database();

db.run(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT,
    status TEXT DEFAULT 'active',
    message_count INTEGER DEFAULT 0,
    tool_count INTEGER DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS tool_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    args TEXT,
    result TEXT,
    duration_ms INTEGER,
    success INTEGER DEFAULT 1,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );
  CREATE TABLE IF NOT EXISTS file_changes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    file_path TEXT NOT NULL,
    change_type TEXT NOT NULL,
    content_preview TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    role TEXT NOT NULL,
    content_preview TEXT,
    token_count INTEGER,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );
  CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    error_type TEXT,
    message TEXT,
    stack TEXT,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );
`);

// Seed sessions
const sessions = [];
const now = new Date();
for (let i = 0; i < 5; i++) {
  const d = new Date(now);
  d.setHours(d.getHours() - i * 3);
  const id = crypto.randomUUID();
  const status = i === 0 ? "active" : "completed";
  const msgs = Math.floor(Math.random() * 20) + 5;
  const tools = Math.floor(Math.random() * 40) + 10;
  sessions.push({ id, created_at: d.toISOString(), status, msgs, tools });
  const updated = new Date(d);
  updated.setMinutes(updated.getMinutes() + Math.floor(Math.random() * 60) + 10);
  db.run("INSERT INTO sessions VALUES (?,?,?,?,?,?)", [id, d.toISOString(), updated.toISOString(), status, msgs, tools]);
}

// Seed tool calls
const toolNames = ["bash", "read", "edit", "write", "grep", "glob", "websearch", "webfetch"];
for (const s of sessions) {
  for (let j = 0; j < s.tools; j++) {
    const t = new Date(s.created_at);
    t.setSeconds(t.getSeconds() + j * 15);
    const tool = toolNames[Math.floor(Math.random() * toolNames.length)];
    const key = tool === "read" || tool === "edit" || tool === "write" ? "filePath" : tool === "bash" ? "command" : "pattern";
    const args = JSON.stringify({ [key]: "demo/" + Math.random().toString(36).slice(2, 8) });
    const success = Math.random() > 0.1 ? 1 : 0;
    db.run("INSERT INTO tool_calls (session_id, timestamp, tool_name, args, result, duration_ms, success) VALUES (?,?,?,?,?,?,?)",
      [s.id, t.toISOString(), tool, args, JSON.stringify({ status: success ? "ok" : "error" }), Math.floor(Math.random() * 3000) + 100, success]);
  }
}

// Seed file changes
const paths = ["src/index.ts", "src/app.ts", "src/utils/helpers.ts", "src/components/Header.tsx", "README.md", "package.json", "src/styles.css", "src/config.ts"];
for (const s of sessions) {
  const count = Math.floor(Math.random() * 8) + 2;
  for (let j = 0; j < count; j++) {
    const t = new Date(s.created_at);
    t.setMinutes(t.getMinutes() + j * 5);
    const path = paths[Math.floor(Math.random() * paths.length)];
    const type = Math.random() > 0.5 ? "edit" : "create";
    db.run("INSERT INTO file_changes (session_id, timestamp, file_path, change_type, content_preview) VALUES (?,?,?,?,?)",
      [s.id, t.toISOString(), path, type, "function demo() { return true; }"]);
  }
}

// Seed messages
const roles = ["user", "assistant"];
for (const s of sessions) {
  for (let j = 0; j < s.msgs; j++) {
    const t = new Date(s.created_at);
    t.setMinutes(t.getMinutes() + j * 2);
    const role = roles[j % 2];
    db.run("INSERT INTO messages (session_id, timestamp, role, content_preview, token_count) VALUES (?,?,?,?,?)",
      [s.id, t.toISOString(), role, "Sample message content for demo purposes...", Math.floor(Math.random() * 500) + 50]);
  }
}

// Seed errors
for (const s of sessions) {
  if (Math.random() > 0.5) {
    const t = new Date(s.created_at);
    t.setMinutes(t.getMinutes() + 30);
    db.run("INSERT INTO errors (session_id, timestamp, error_type, message, stack) VALUES (?,?,?,?,?)",
      [s.id, t.toISOString(), "TypeError", "Cannot read properties of undefined (reading 'foo')", "Error: demo stack trace\n    at Object.<anonymous> (demo.ts:42:10)"]);
  }
}

const data = db.export();
writeFileSync(DB_PATH, Buffer.from(data));
db.close();
console.log("Database seeded at " + DB_PATH);
