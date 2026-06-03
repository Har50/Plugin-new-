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
1. Copy the plugin: https://github.com/Har50/Plugin-new-/blob/main/src/plugin.ts
2. Or install via npm: `npm install @har53/opencode-audit`
3. Drop it in `.opencode/plugins/`
4. Run `npm run dashboard` (from the package) to see the UI

All local, no cloud, open source (MIT).

Would love feedback! https://har50.github.io/Plugin-new-/
