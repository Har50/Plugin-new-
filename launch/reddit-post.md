# Reddit posts (3 angles)

---

## r/devops — compliance angle

**Title:** We needed SOC2 compliance for AI coding agents, so I built an audit trail

**Body:**

Our team uses OpenCode (open-source AI coding agent). Devs love it. Compliance team didn't.

Problem: AI agents operate as a black box. No record of what commands they ran, what files they touched, or when errors happened.

Solution: An OpenCode plugin that logs everything to SQLite + a web dashboard for review.

**What it tracks:**
- Every tool call (bash, read, edit, write) with full arguments
- Every file change with content previews
- Every error with stack traces
- Exportable JSON reports (SOC2-ready)

It's open source, all data stays local, zero cloud dependencies.

Would love feedback from anyone dealing with the same problem.

https://github.com/Har50/Plugin-new-

---

## r/programming — builder angle

**Title:** Show HN: I built a plugin that turns OpenCode into a accountable engineering tool

**Body:** Same body as above but focus on "building in public" and "developer tooling."

---

## r/SaaS — business angle

**Title:** Pricing advice: audit trail for AI coding agents — free vs $10 vs $50/seat?

**Body:**

Built an OpenCode plugin that logs all AI agent activity. Thinking of pricing tiers:

- Free: 7-day history
- Pro ($10/mo): 1-year, CSV export
- Enterprise ($50/seat): SOC2 reports, SSO, team dashboard

Is this reasonable? Would your team pay for this? What's missing?

https://github.com/Har50/Plugin-new-
