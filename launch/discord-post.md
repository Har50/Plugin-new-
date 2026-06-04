# OpenCode Discord — #plugins channel post

**Title:** OpenAudit — Enterprise audit trail for OpenCode

**Body:**

Hey everyone! I built an audit dashboard for OpenCode that logs every tool call, file change, and error — with a web UI and compliance report export.

**What it captures:**
- Every bash command, file read/edit/write
- Every session with timestamps and message counts
- Errors with stack traces
- File changes with content previews

**How to use:**
1. Install: `npm install @har53/opencode-audit`
2. Add to `opencode.json`: `"plugin": ["@har53/opencode-audit"]`
3. Run the dashboard: `npm run dashboard`
4. Open http://localhost:3456

All local, no cloud, open source (MIT).

GitHub: https://github.com/Har50/Plugin-new-
Landing: https://opencode-audit.vercel.app/
