# Performance investigation — 2026-08-06

Record of a day spent on "the website is too slow", kept because most of its
value is in the hypotheses that were **refuted**. Three separate defects were
found; two are fixed and verified, one is still open at the time of writing.

## 1. Compute was in the wrong continent — FIXED, verified

`x-vercel-id` on any dynamic request read `bom1::iad1::…`: functions executed
in **iad1 (Washington DC)** while Supabase runs in **eu-central-1
(Frankfurt)**. Nothing had ever selected a region — no `vercel.json`, no
`preferredRegion` — so it was Vercel's default. A request from the Gulf went
Mumbai edge → Washington compute → Frankfurt database and back.

Measured on `/en/verify/X` (exactly one query), 6 samples 15s apart:

| | median TTFB | cold |
|---|---|---|
| before (`iad1`) | 1.092s | 3.00s |
| after (`fra1`) | 0.849s | 1.93s |

~240ms faster warm, ~1.1s faster cold. **Less than the ~600ms first
predicted** — that estimate wrongly assumed every request paid full
connection setup, but warm instances reuse their pooled connection. The gain
is larger on multi-query pages.

Fix: `vercel.json` → `{"regions": ["fra1"]}`.

This one matters beyond its own numbers: it made per-query cost ~2ms instead
of ~90ms, which is what makes serializing queries free (see §3).

## 2. Counts arrived as strings, silently breaking charts — FIXED, verified

`sql<T>` is an unchecked type **assertion**, and postgres.js returns Postgres
bigint counts as **strings**. Seven hand-written ``sql<number>`count(*)` ``
expressions in `modules/reporting/queries.ts` were typed `number` but were
strings at runtime.

Invisible wherever a value was only rendered — but `StackedStatusBar` and
`BarList` both compute `items.reduce((sum, i) => sum + i.value, 0)`, and
`0 + "1" + "1"` is `"011"`. The total became a concatenated string and every
bar's percentage collapsed to a fraction-of-a-percent sliver. **The
requests-by-status bar had been rendering effectively empty.**

Fixed at the source with drizzle's `count()`, which carries `.mapWith(Number)`.
`countDistinct()` already did, which is why `activeCompanies` and
`activeLearners` were unaffected. The two `FILTER` counts keep the `sql``  `
tag but are typed `<string>` honestly and pass through `num()`.

Found by accident while writing characterization tests for something else —
the argument for writing them first.

## 3. Admin pages hang until the 300s function timeout — OPEN

### Symptom

`/admin/reports` never loaded in production. The Vercel runtime log:

```
level: error
message: "Vercel Runtime Timeout Error: Task timed out after 300 seconds"
responseStatusCode: 307
source: function
```

No database error, no stack trace. The function *responded* in under a second
and then ran for the full 300s without finishing. `/admin/scheduling` failed
the same way intermittently, and a wedged instance took out whatever admin
page landed on it next — which is why `/admin/companies` looked broken when
probed straight after reports, and was fine when probed alone.

### Ruled out, each by measurement not argument

| Hypothesis | How it was killed |
|---|---|
| Query cost / count | Collapsed 34 → 16 queries, deployed, still hung 3/3 |
| Data volume | 3,000 requests + 3,000 payments seeded locally; entire page fan-out **5ms** |
| The code itself | Same commit, production build, real admin login, 3,000 rows: renders in **126ms** locally |
| Session-mode / IPv6 connection | `DATABASE_URL` confirmed as `…pooler.supabase.com:6543`, correct transaction pooler |

### Pool size measurements (production, admin pages, 3 passes each)

| `max` | Result |
|---|---|
| 1 | Every page unreliable **including single-query ones**; one 500. A single stuck connection takes the whole instance down. |
| 3 | Single-query pages fine; scheduling (4 concurrent) failed ~1 in 3; reports (16 concurrent) hung every time. |
| 10 | **15/15 green** — all 5 admin pages, 3 passes each, no timeouts. Medians 429–872ms. Single user only; the two-concurrent-session test did not run before the session ended. |

### Current best explanation

postgres.js **pipelines** concurrent queries onto a connection once its pool
is busy, and pipelined queries on one client connection stall against
Supavisor in transaction mode, which assigns a backend per transaction.
Pipeline **depth** predicts the failure rate exactly — 16-deep always,
4-deep sometimes, 1-deep never — where cost, count and volume were each
measured and eliminated.

It never reproduces locally because local Postgres is a direct connection
with no pooler in front.

**This is a hypothesis, not a conclusion.** Two earlier ones were refuted the
same way this one might be.

### Where it was left

- `677ed97` raises the pool to 10. The **single-user** sweep is clean: 15/15,
  every admin page, no timeouts — the first fully green sweep of the day. The
  **two-concurrent-session** test, which is where `max: 1` collapsed, did not
  run before the session ended. Until that passes, treat §3 as probably fixed
  rather than fixed.
- `admin/reports/page.tsx` awaits its queries **sequentially** and this is
  load-bearing until §3 is closed — it is what took reports from a 300s
  timeout to 200 in ~600ms, 3/3.

### Next steps

1. Re-run the sweep, single-user **and** two concurrent sessions. If `max: 10`
   holds under both, §3 is closed.
2. If it doesn't hold, **stop iterating blind** and open a Supabase support
   ticket. The report is strong: exact reproduction, correct pooler on 6543,
   failure rate correlating with pipeline depth, 300s timeouts with zero
   database-side errors. Supavisor logs are on their side and we cannot see
   them.
3. Remove the temporary `step()` instrumentation in
   `admin/reports/page.tsx` once this has been green for a while. It logs
   `reports: <name> ok in Nms` per call, so a future stall names the stuck
   call instead of leaving another bare timeout.
4. The other **13 `Promise.all` DB fan-out sites** (`grep -rn "Promise.all"
   src/app src/modules`) are latent until §3 is genuinely closed. Serializing
   reports alone was not enough — scheduling broke on the very next sweep.

## Method notes worth keeping

- **Measure before and after, same methodology.** The `fra1` gain was real but
  2.5× smaller than predicted; only re-running the identical probe showed that.
- **Characterization tests before refactoring numbers.** Writing them first
  both caught defect §2 and made the 34 → 16 collapse provably
  correctness-neutral.
- **A local repro that *fails* to reproduce is evidence too.** 126ms locally
  vs 300s in production is what eliminated the entire codebase as a suspect
  and pointed at the environment.
