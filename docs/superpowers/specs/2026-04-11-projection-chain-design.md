# Projection Chain Engine — Design Spec

## Context

Clearance is a single-file debt payoff planner (vanilla JS, no
framework). It currently calculates each debt independently with
fixed payments. This design adds:

- Snowball/avalanche payoff strategies
- A month-by-month projection chain where debts interact
- User-editable overrides at any month in the timeline
- Rollover mechanics when debts pay off

The chain is the new calculation engine. It replaces `calcDebt()`
with a unified simulation that considers all debts together.

## Architecture: Immutable Chain + Overlay Mask

Two layers, always separate:

```
Base chain:   Pure math. Given seed state + strategy, what happens
              with no human intervention.

Mask:         Sparse override map. User modifications at specific
              months. Applied during chain resolution.

Resolved:     base + mask → the projection the user sees.
```

The chain is a pure function:

```
buildChain(seed, overrides, maxMonths) → MonthNode[]
```

- Recomputes fully on any change (36 months, <10 debts = sub-ms)
- No incremental/partial recomputation needed
- `overrides` is a plain object keyed by month number
- "Reset month N" = `delete overrides[N]`, recompute

## Data Model

### Seed State (existing, unchanged)

```
income: number
bills: [{ id, name, amount, dropoff }]
debts: [{ id, name, type, balance, apr, payment, color }]
```

### New Global Fields

```
strategy: 'current' | 'snowball' | 'avalanche'  (default: 'current')
keepPct: number (0-100)                          (default: 0)
overrides: { [month]: MonthOverride }            (default: {})
```

- `strategy: 'current'` = no reallocation, use payments as-is
  (renamed from 'none' per designer feedback)
- `keepPct` = percentage of freed payment to keep for savings
  (framed as "keep" not "rollover" per designer feedback)
  Default 0% means 100% rolls to next target.

### MonthOverride Shape

```
{
  income?: number,
  strategy?: 'snowball' | 'avalanche',
  keepPct?: number,
  keep?: number,            // dollar amount override (takes precedence)
  bills?: {
    [billId]: { amount?: number, active?: boolean }
  },
  debts?: {
    [debtId]: { payment?: number, extraPayment?: number }
  }
}
```

### MonthNode (computed, not stored)

```
{
  month: number,
  income: number,
  activeBills: [{ id, name, amount }],
  totalBills: number,
  debts: [{
    id, name, type,
    balanceStart: number,
    apr: number,
    interest: number,
    payment: number,
    paymentSlot: number,    // allocated slot (for rollover calc)
    balanceEnd: number,
    paidOff: boolean,
    payable: boolean,
    minimum: number
  }],
  strategy: string,
  keepPct: number,
  surplus: number,          // can be negative (shortfall visible)
  cumulativeInterest: number,
  rollovers: [{ from, to, amount }],
  totalDebtPayment: number,
  hasOverride: boolean      // true if overrides[month] exists
}
```

Display-layer concerns like `freePerDay` computed at render time
as `max(0, surplus) / 30`, not stored in the node.

## Minimum Payment Rules

| Type   | Formula                                       |
|--------|-----------------------------------------------|
| CC     | max(balance * (apr/100/12) + balance * 0.01, 25) |
| Loan   | user-set payment (fixed installment)          |
| Friend | user-set payment (no $25 floor)               |

## Chain Computation — Per Month

For month N, deriving from month N-1:

### Step 1: Inherit

Copy from N-1: debt balanceEnd values become balanceStart,
income, strategy, keepPct all inherited.

### Step 2: Merge Overrides

If `overrides[N]` exists, merge fields. Overrides apply to
inherited state. If a debt's balanceStart is already 0, payment
overrides on it are no-ops.

### Step 3: Compute Bills

Filter bills: permanent (no dropoff) + temporary where
`dropoff > N`. Apply any bill amount/active overrides.
Sum `totalBills`.

### Step 4: Compute Minimums

For each debt with balance > 0, compute minimum by type
(see table above). Sum `totalMinimums`.

### Step 5: Compute Budget

`budget = sum(user-set payments from seed)` + any freed
rollover from previous month.

When a user overrides a specific debt's payment,
`budget = sum(payments after overrides)`. Override adjusts
the total budget, does not steal from other allocations.

### Step 6: Allocate by Strategy

1. Pay minimums on all debts with balance > 0
2. `extra = budget - totalMinimums`
3. If `extra < 0`: pro-rate minimums (shortfall)
4. Sort debts for targeting:
   - `current`: no reallocation, each debt keeps user payment
   - `snowball`: lowest balanceStart first
   - `avalanche`: highest APR first (ties broken by balance)
5. Apply extra to target debt
6. If target pays off mid-allocation, remainder to next target

### Step 7: Apply Interest + Payments

For each debt:
```
interest = balanceStart * (apr / 100 / 12)
balanceEnd = balanceStart + interest - payment
if balanceEnd <= 0.005: paidOff = true, balanceEnd = 0
```

Track `cumulativeInterest` from N-1 + this month's total interest.

### Step 8: Handle Rollover

For each debt where `paidOff` is true this month:
- `freed = paymentSlot` (the full allocated slot, NOT the
  final fractional payment)
- `rolloverAmount = freed * ((100 - keepPct) / 100)`
- Per-month `keep` dollar override takes precedence over
  percentage
- Sum all freed amounts if multiple debts pay off same month
- Deliver rollover to next month's budget (month N+1)

When strategy is `current`: freed cash goes to surplus,
no target selection. Rollover mechanics only activate with
snowball or avalanche.

### Step 9: Compute Surplus

```
surplus = income - totalBills - totalDebtPayment
```

Surplus can be negative. Display layer clamps for
presentation.

### Unpayable Debts

A debt is marked `payable: false` in a node when its
allocated payment does not cover monthly interest. The chain
does NOT abort. Other debts continue computing. An unpayable
debt can become payable later if rollover reaches it or an
override increases its payment.

Cap at 600 months as circuit breaker (existing behavior).

### Mid-Chain Strategy Switch

When an override changes strategy at month N, the new strategy
takes effect immediately at month N. Extra allocation redirects
to the new target order. Months N+1 onward inherit the new
strategy unless overridden again.

### Termination

Chain stops at `maxMonths` or when all debts reach
`balanceEnd = 0`, whichever comes first.

## UI Design

### Strategy Controls — Sidebar Debts Tab

Strategy selection lives in the sidebar, top of the Debts tab,
above the debt accounts list. Not on the main dashboard.

```
┌─────────────────────┐
│ Strategy             │
│ [Current plan    ▾]  │
│  ↳ "no reallocation" │
│                      │
│ When a debt pays off │
│ Keep for savings     │
│ [0%             ]    │
├─────────────────────┤
│ Debt accounts        │
│ ...                  │
```

Dropdown options with inline descriptions:
- **Current plan** — no reallocation, use your set payments
- **Snowball** — pay off smallest balance first (quick wins)
- **Avalanche** — pay off highest interest first (saves most)

"Keep for savings" only visible when strategy is snowball or
avalanche (irrelevant for "current plan").

### Metrics Row — Strategy Comparison

When a strategy is active (not "current plan"), the metrics
row shows deltas against the current-plan baseline:

```
All debts cleared    Total interest
2yr 4mo (-8mo)       $3,200 (-$1,247)
   ↑ green delta        ↑ green delta
```

Deltas are persistent (always visible while strategy active),
not ephemeral toasts. Computed by running the chain twice:
once with strategy, once with `current`.

### Breakdown Panel — Two Modes

The 260px breakdown panel has two modes (not three):

**Mode 1 — Overview (default):**
Per-account summary cards (existing behavior).

**Mode 2 — Month Detail (slider or chart click):**
Panel swaps to show selected month's snapshot:
- Per-debt balances, payments, interest
- Payoff events and rollover amounts
- Surplus at that month
- "Edit this month" button
- "Back to overview" link

Clear mode indicator: panel title changes to
"Month 14 of 36" with visible back navigation.

### Month Edit — Modal

Editing a month's overrides opens a modal (existing modal
system), NOT a panel state change. This:
- Avoids three-mode confusion in a narrow panel
- Signals "you are doing something special"
- Has room for the form fields

Modal contents:
- Month number (read-only)
- Income override
- Strategy override dropdown
- Keep amount (dollar override)
- Per-debt payment overrides (only debts with balance > 0)
- "Reset this month" button (deletes override)
- Cancel / Save buttons

### Chart Enhancements

- **Vertical marker line** at selected month when in detail mode
- **Payoff markers** — small annotation when a debt line hits zero
- **Unpayable debts** — dashed line at balance level (existing)

### Slider as Primary Drill-Down

The projection slider is the primary entry point for month
detail view. Clicking/dragging updates the breakdown panel.

Chart click is secondary — clicking a point on the chart syncs
the slider to that month and shows detail.

Affordance: subtle "view details" text near the slider, or
the breakdown panel title updates reactively as the slider
moves to signal the connection.

### Month Detail Discoverability

When the slider moves, the breakdown panel title changes from
"Per account" to "Month N" with a brief highlight transition.
This teaches the user that the slider controls what the panel
shows.

A small toggle or link lets the user switch back to the
overview cards without resetting the slider position.

## Serialization

### YAML Export (v1)

```yaml
income: 8700

strategy: avalanche
keepPct: 0

bills:
  - name: Rent
    amount: 1550
  - name: SoFi (1)
    amount: 497
    dropoff: 3

debts:
  - name: Card A
    type: cc
    balance: 3300
    apr: 26
    payment: 125
    color: '#ff4466'
```

Overrides are NOT exported in v1. The YAML parser cannot
handle the nested structure without extension. Seed state +
strategy + keepPct export cleanly with existing parser.

Import of files without `strategy`/`keepPct` keys defaults
to `current` / `0`. Backward compatible.

### localStorage

Full state including overrides serialized as JSON (existing
pattern). Overrides survive page refresh.

## Mobile Considerations (v1)

Strategy controls in sidebar work on mobile (sidebar stacks
on top). Month detail in 200px breakdown panel is tight but
functional for v1.

Deferred to post-v1:
- Bottom sheet for month detail on mobile
- Full-screen overlay for month edit on mobile
- Touch-friendly slider with larger hit targets

## What This Replaces

- `calcDebt()` — replaced by chain computation
- Static projection in `recalc()` — replaced by chain-driven
  projection with strategy awareness
- Independent per-debt calculations — replaced by unified
  simulation where debts interact

## What This Preserves

- All existing bug fixes (safeColor, clampPositive, etc.)
- Existing UI structure (sidebar, hero, metrics, chart)
- YAML import/export (extended, backward compatible)
- localStorage persistence
- Responsive layout
- Theme toggle
