import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import { homedir } from "os";

const DB_DIR = `${homedir()}/.opencode-audit`;

function ensureDir() {
  if (!existsSync(DB_DIR)) mkdirSync(DB_DIR, { recursive: true });
}

function getDb(name: string): Database {
  ensureDir();
  const db = new Database(`${DB_DIR}/${name}`);
  db.exec("PRAGMA journal_mode=WAL");
  return db;
}

function initSchema(db: Database) {
  db.exec(`
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
}

let db: Database;

export default async function ({ project, $, directory, worktree }: any) {
  db = getDb("audit.db");
  initSchema(db);

  const sessionId = crypto.randomUUID();
  const now = new Date().toISOString();

  db.run(
    "INSERT INTO sessions (id, created_at) VALUES (?, ?)",
    [sessionId, now]
  );

  return {
    event: async ({ event }: any) => {
      const ts = new Date().toISOString();

      switch (event.type) {
        case "session.idle": {
          db.run(
            "UPDATE sessions SET updated_at = ?, status = ? WHERE id = ?",
            [ts, "idle", sessionId]
          );
          break;
        }
        case "session.error": {
          db.run(
            "INSERT INTO errors (session_id, timestamp, error_type, message) VALUES (?, ?, ?, ?)",
            [sessionId, ts, event.error?.name || "Error", event.error?.message || ""]
          );
          break;
        }
      }
    },

    "message.updated": async (message: any) => {
      db.run(
        "INSERT INTO messages (session_id, timestamp, role, content_preview) VALUES (?, ?, ?, ?)",
        [sessionId, new Date().toISOString(), message.role || "unknown",
         (message.content || "").slice(0, 200)]
      );
      db.run(
        "UPDATE sessions SET message_count = message_count + 1 WHERE id = ?",
        [sessionId]
      );
    },

    "tool.execute.after": async (input: any, output: any) => {
      const ts = new Date().toISOString();
      const argsStr = JSON.stringify(input?.args || {}).slice(0, 500);

      db.run(
        `INSERT INTO tool_calls (session_id, timestamp, tool_name, args, result, duration_ms, success)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [sessionId, ts, input?.tool || "unknown", argsStr,
         JSON.stringify(output).slice(0, 500), null, 1]
      );
      db.run(
        "UPDATE sessions SET tool_count = tool_count + 1 WHERE id = ?",
        [sessionId]
      );
    },

    "tool.execute.before": async (input: any, output: any) => {
      if (input?.tool === "edit" || input?.tool === "write") {
        db.run(
          `INSERT INTO file_changes (session_id, timestamp, file_path, change_type, content_preview)
           VALUES (?, ?, ?, ?, ?)`,
          [sessionId, new Date().toISOString(),
           input.args?.filePath || "unknown",
           input.tool === "edit" ? "edit" : "create",
           (input.args?.oldString || input.args?.content || "").slice(0, 200)]
        );
      }
    },

    "file.edited": async (file: any) => {
      db.run(
        `INSERT INTO file_changes (session_id, timestamp, file_path, change_type, content_preview)
         VALUES (?, ?, ?, ?, ?)`,
        [sessionId, new Date().toISOString(),
         file?.path || "unknown", "edit",
         (file?.content || "").slice(0, 200)]
      );
    },
  };
}
