# OpenCode Audit Dashboard

Enterprise-grade audit trail and compliance dashboard for OpenCode.

## How it works

1. Drop the plugin into OpenCode → it logs all AI activity to a local SQLite DB
2. Run the dashboard → see every session, tool call, file change, and error
3. Export compliance reports (SOC2-ready JSON)

## Quick start

### 1. Install the plugin

Copy `src/plugin.ts` to your project:

```bash
cp src/plugin.ts .opencode/plugins/audit-plugin.ts
```

Or install via npm (once published):

```bash
npm install @har53/opencode-audit
```

Then add to `opencode.json`:

```json
{
  "plugin": ["@har53/opencode-audit"]
}
```

### 2. Run OpenCode

```bash
opencode
```

All activity is automatically logged to `~/.opencode-audit/audit.db`.

### 3. Launch the dashboard

```bash
npm run dashboard
```

Open http://localhost:3456

## Features

- **Live session tracking** — monitor active OpenCode sessions
- **Tool call history** — see every bash, read, edit, write command the AI ran
- **File change log** — track which files were created or modified
- **Error monitoring** — capture and review errors
- **Compliance reports** — export per-session JSON reports for SOC2/HIPAA audits
- **Dark theme** — built for developers

## Pricing (planned)

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | 7-day history, basic dashboard |
| Pro | $10/mo | 1-year history, CSV export, email reports |
| Enterprise | $50/seat/mo | Unlimited history, SOC2 reports, SSO, team dashboard |

## License

MIT
