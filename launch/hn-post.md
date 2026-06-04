## Hacker News Post — Final Draft

**Title:** Show HN: OpenAudit – I built an audit trail for AI coding agents because our CTO demanded one

**Body:**

We rolled out OpenCode (open-source AI coding agent) across our engineering team. Developers loved it. Our CTO did not.

His question: "If the AI accidentally runs `DROP TABLE` in production or commits an API key, who's responsible? How do we prove to auditors what happened?"

Cursor and Copilot have the same problem. AI coding agents operate as a black box. There's no record of what they did, when they did it, or which files they touched.

So I built OpenAudit — an OpenCode plugin that logs every action to a local SQLite database and surfaces it in a web dashboard.

**What it captures:**
- Every bash command executed (with full args)
- Every file read, written, or edited (with content preview)
- Every error and stack trace
- Full session history with message counts and timestamps

**What you can do with it:**
- See exactly what the AI did during any session, days or weeks later
- Produce SOC2-ready compliance reports with one click
- Catch errors before they become incidents
- Answer the question "what changed?" without digging through git blame

**The setup is intentionally boring:**
1. Drop one file into `.opencode/plugins/`
2. That's it. The dashboard runs on `localhost:3456`.

**Privacy:** Everything stays on your machine. Zero external servers, zero telemetry, zero cloud dependencies. Your code never leaves your infrastructure.

**Pricing:**
- Individual: free (7-day history, open source)
- Pro: $10/mo (1-year history, CSV export, email digests)
- Enterprise: $50/seat/mo (SOC2 reports, SSO, team dashboard, unlimited retention)

It's fully open source under MIT. I'd love feedback on what's missing and what would make your team actually pay for this.

https://github.com/Har50/Plugin-new- | https://opencode-audit.vercel.app/

---

## Alternative shorter version (if character-limited)

**Title:** Show HN: OpenAudit – audit trail for AI coding agents

**Body:** We use OpenCode as a team. CTO asked: "What is the AI doing? Who's accountable?" No good answer existed.

OpenAudit is an OpenCode plugin that records every tool call, file change, and error to a local SQLite DB, with a web dashboard and SOC2-ready export.

All local, zero cloud, open source (MIT).

GitHub: https://github.com/Har50/Plugin-new-
