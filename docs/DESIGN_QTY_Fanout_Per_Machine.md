# Design Doc: QTY Fan-out Per Machine (M/C 6 Digit)

**Status:** Discussion only — NOT implemented.
**Scope:** `history-request.component.ts` — `exportexcel()` and `exportas400()`.

---

## 1. Background

A purchase request can list multiple machines in a single `MCNo` field, e.g. `"12,15,20-22"`.
`parseMachineNumbers()` (already exists, `history-request.component.ts`) can fully expand this
into `["12","15","20","21","22"]`, but today it is only ever used to grab the **first** machine
(`machineList[0]`) to build `MCNo6Digit`. The other machines in the list are silently dropped —
no fan-out exists anywhere in the codebase today:

- **At creation**: a request is stored as ONE row holding the raw `MCNo` string as-is. The insert
  path (`Stored_Add_New_Request` / `insertRequestBulk`) has no machine-splitting logic.
- **At display**: the UI table (PMC only, `Division_ === '71DZ'`) shows one `MCNo6Digit`, built
  from machine `[0]` only.
- **At export**: neither `exportexcel()` nor `exportas400()` fan out per machine today. AS400's
  payload doesn't even include a machine-number field at all (see schema below) — it never gets
  machine info regardless of how many are listed.

## 2. Requested design

> "qty must divide by machine count and the left of item must random at add into some machine"

**Split rule** (per selected request, when `machineCount > 1`):

```
base      = floor(QTY / machineCount)
remainder = QTY % machineCount        // always < machineCount

Every machine gets `base`.
`remainder` units are randomly assigned, ONE EACH, to `remainder` distinct
machines (chosen at random, no repeats) — so no machine gets more than
`base + 1`.
```

Example: `QTY = 39`, 5 machines → base `7` × 5 = `35`, remainder `4` → four
randomly-picked machines get `8`, one gets `7`. Sums back to `39` exactly.

**Where it applies** (confirmed: **both**):

1. **`exportas400()`** — one AS400 payload line **per machine** instead of one line per request,
   identical in every field except `Quantity` (the split value).
2. **`exportexcel()`** — one Excel row **per machine**, `MC_No` column shows that specific
   machine's number instead of the whole list / first-only.

Single-machine requests are unaffected (`machineCount <= 1` → `[QTY]`, no behavior change).

## 3. Current AS400 payload schema (for reference — unaffected by this design, just context)

`POST {AS400_GM_LINK|AS400_PMC_LINK}`, one JSON array, no machine field:

| Field | Source | Notes |
|---|---|---|
| `ItemNo` | `req.ItemNo` | |
| `ItemRevision` | `""` | always empty |
| `Quantity` | `req.QTY` | **this is what gets split under the new design** |
| `DOCNo` | `req.DocNo` | |
| `TransactionYear/Month/Day` | today's date | not the request's original date |
| `WareHouse` | derived from division + tool type | |
| `StockControl` | `""` | always empty |
| `StockLocation` | `req.Stock_Location` | |
| `MaterialLot` | `req.MatLot` | |
| `Mono` | GM: `MFG_Order_No`, PMC: `PartNo` | |
| `Vendor` | `""` | always empty |
| `EmpID` / `Pcname` | frontend sends a value, **backend overwrites** with its own env vars | |
| `Public_Id` | internal only | stripped server-side before the real AS400 call; used only to update `AS400STATUS` afterward |

## 4. Impact & consequence analysis

### 4.1 AS400 API call
- No new HTTP calls — it's still one POST with a (now longer) array. N machines = N array entries
  instead of 1.
- **All-or-nothing failure risk amplified.** The backend loop marks `AS400STATUS='FAIL'` for every
  `Public_Id` in the array on any non-2xx response. If AS400 does per-line partial acceptance, the
  current code has no way to read that — it's coarse pass/fail on the whole HTTP response.
- **Near-duplicate lines — the biggest open unknown.** N lines with identical `ItemNo` / `DOCNo` /
  `WareHouse` / `Mono` / `StockLocation`, differing only in `Quantity`. If AS400's ingestion treats
  a repeated DOCNo+ItemNo as a correction/overwrite rather than an addition, this could **silently
  undercount** inventory movement instead of recording N separate transactions. **This must be
  confirmed with whoever owns the AS400 side before implementing** — it cannot be determined from
  this codebase alone.

### 4.2 `AS400STATUS` / DB write-back
- Redundant but harmless: the same `Public_Id` appears N times in the update loop, each a no-op
  UPDATE after the first.
- **The split is never persisted to the DB.** The request row keeps its original combined `QTY`
  and `MCNo` list; the split only exists transiently inside the export function's local variable.
  Consequence: **not auditable after the fact** ("what quantity did machine #15 get?" has no
  persisted answer), and **not reproducible** — a re-export of the same request produces a
  *different* random split, since nothing seeds/stores the previous one.

### 4.3 Excel export
- Row count grows from 1-per-selected-request to 1-per-machine (20 selected requests could become
  60+ rows). Any downstream consumer that assumes row-count = selection-count would break.
- QTY column no longer shows one round number per request — shows the per-machine split instead.
  Confirm this matches how floor staff actually use the sheet (physically issuing stock per
  machine) rather than expecting one line per DocNo.

### 4.4 Frontend state / UI consistency
- The on-screen table's `MCNo6Digit` display is untouched by this design (still shows only the
  first machine, per current behavior) — so there's a **visual mismatch**: the table shows 1
  machine, but the export fans out to N. Worth deciding whether the table should surface a hint
  ("5 machines") so this isn't a surprise at export time.

### 4.5 Selection / re-export behavior
- Since `AS400STATUS` becomes `DONE` at the request level (not per split-line), retrying/re-exporting
  an already-`DONE` request generates a **new random split** with no record of what was sent last
  time. Same root gap as 4.2.

## 5. Open questions to resolve before implementation

1. **AS400 acceptance of multiple near-identical lines** — confirm with the AS400/system owner
   whether repeated DOCNo+ItemNo lines are additive or overwrite each other. (Highest-risk unknown.)
2. **Reproducibility** — should the remainder's random assignment be deterministic/seeded (e.g. by
   `Public_Id`) so re-exporting the same request twice yields the same split? Or is fresh randomness
   per export acceptable?
3. **Persistence** — should the computed per-machine split be written somewhere (new DB column /
   table) at export time for audit purposes, or is it intentionally export-time-only and disposable?
4. **Scope confirmation** — this design only changes the two export functions; it does NOT change
   the underlying one-row-per-request data model, request-creation flow, or on-screen table. Confirm
   that's the intended scope and not a deeper request-splitting feature.

## 6. Related prior fixes (context)

This design doc follows a separate but related debugging session in the same area:
- Fixed `Stock_Location` being sourced from the wrong division (GM location leaking into PMC
  requests and vice versa) across `PurchaseHistory.controller.js`, `get_ItemNo`,
  `detail.component.ts`, and `detailcasesetup.component.ts`.
- Removed the manual "Sync STK LOC" feature entirely in favor of a scheduled
  `auto_load_item_master.py` daemon (`AutoStartListener\Startup\ItemMaster-Loader.bat`, hourly).
- Eliminated all app-level usage of `[db_Tooling].[viewer].[View_tb_Master_Purchase_SUM_ALL]` —
  replaced with `tb_ItemMaster_Raw` (`pbgm8g`/`PurchaseAutoload`, kept fresh by the same daemon),
  including a new `dbo.Stored_Get_ItemDetail_AutoFill` deployed directly on `pbgm8g`.
