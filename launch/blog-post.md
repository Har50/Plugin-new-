# Blog Post: How to audit AI coding agents for SOC2 compliance

**Draft structure:**

## Title: How to pass SOC2 when your developers use AI coding agents

## Intro
AI coding agents (OpenCode, Cursor, Copilot) are becoming essential. But they create a compliance blind spot. If an AI agent runs `DROP TABLE` in production or commits an API key to a public repo, who's responsible?

## The problem
- No audit trail for AI actions
- Compliance frameworks (SOC2, HIPAA, SOX) require logging who/what/when
- Engineering managers can't answer "what did the AI do last session?"

## The solution: OpenAudit
OpenAudit is an OpenCode plugin that logs every AI action to a local SQLite database.

### What it captures
- Session history with timestamps
- Every tool call (bash, read, edit, write) with full arguments
- Every file change with content previews
- Every error with stack traces

### The dashboard
A local web UI (localhost:3456) showing:
- Session list with stats
- Per-session drill-downs
- Tool call details
- File change logs
- One-click JSON export for compliance

## Installation
```bash
npm install @har53/opencode-audit
# Then add to opencode.json: "plugin": ["@har53/opencode-audit"]
# Run: npm run dashboard
```

## Privacy
Everything stays on your machine. No cloud, no telemetry, no external servers.

## Pricing
- Free: 7-day history
- Pro ($10/mo): 1-year history, CSV export
- Enterprise ($50/seat): SOC2 reports, SSO, team dashboard

## Conclusion
AI coding agents are the future, but accountability isn't optional. OpenAudit bridges the gap.

---

**Where to publish:** dev.to, Medium, or your own blog
