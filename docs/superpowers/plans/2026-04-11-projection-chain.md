# Projection Chain Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace independent per-debt calculations with a unified month-by-month projection chain that supports snowball/avalanche strategies, rollover mechanics, and user overrides.

**Architecture:** Immutable chain + overlay mask. `buildChain(seed, overrides, maxMonths)` is a pure function producing `MonthNode[]`. The chain engine lives in a separate `<script>` tag (engine.js inline) to keep computation separate from DOM. The existing `recalc()` becomes a thin wrapper that builds the chain and renders it.

**Tech Stack:** Vanilla JS, Chart.js 4.4.1, single HTML file with two `<script>` blocks.

---

## File Structure

All changes are in `/workspace/index.html`. The file is split into two `<script>` blocks:

1. **Engine script** (new, first `<script>` block before the closing `</body>`)
   - `calcMinPayment(balance, apr, type)` — moved from helpers
   - `buildChain(seed, overrides, maxMonths)` — the chain builder
   - Pure functions only, no DOM access

2. **App script** (existing, second `<script>` block)
   - State, DOM rendering, event handlers
   - `recalc()` refactored to call `buildChain()` and render results
   - New: strategy UI, month detail panel, month edit modal
   - Modified: `saveToCache`, `loadFromCache`, `stateToYaml`, `parseYaml`

Additionally:
- New CSS rules for strategy controls, month detail panel, month edit modal, chart payoff markers
- New HTML for strategy section in sidebar, month edit modal, detail panel template
- Modified HTML for breakdown panel (two-mode support)

---

## Task 1: Extract Engine Script Block

Split the file to establish the two-script architecture. Move pure computation into the first script block.

**Files:**
- Modify: `/workspace/index.html:460-630` (move calcMinPayment, remove calcDebt)

- [ ] **Step 1: Add engine script block**

Before the existing `<script>` tag (around line 462), add:

```html
<script>
// ─── ENGINE (pure computation, no DOM) ────────────────────────────────────
'use strict';

function calcMinPayment(balance, apr, type) {
  if (balance <= 0) return 0;
  if (type === 'friend') return 0;
  if (type === 'loan') return 0; // loans use user-set payment
  const monthly = balance * (apr / 100 / 12) + balance * 0.01;
  return Math.max(monthly, 25);
}
</script>
```

Note: `type === 'loan'` and `type === 'friend'` return 0 here because their minimums are the user-set payment, which the chain handles separately. `calcMinPayment` only computes the CC-formula minimum.

- [ ] **Step 2: Update existing calcMinPayment call**

The existing `calcMinPayment` at line 498 in the app script takes `(balance, apr)` with no type. Update all call sites to pass the type parameter:

In `updateMinPaymentHint()` (around line 1059):
```javascript
const min = calcMinPayment(balance, apr, type);
```

In `renderDebts()` (around line 585):
```javascript
(d.type==='cc'&&d.balance>0?'<div style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:2px;">min: '+fmt(calcMinPayment(d.balance,d.apr,d.type))+'</div>':'')
```

- [ ] **Step 3: Remove old calcMinPayment and calcDebt from app script**

Delete the old `calcMinPayment` function (line 498) and `calcDebt` function (lines 611-630) from the app script. They are replaced by the engine.

- [ ] **Step 4: Add stub buildChain to engine script**

Add to the engine script block, after `calcMinPayment`:

```javascript
function buildChain(seed, overrides, maxMonths) {
  // Stub: reproduce current behavior with independent per-debt calc
  const chain = [];
  for (let m = 0; m <= maxMonths; m++) {
    chain.push({
      month: m,
      income: seed.income,
      activeBills: [],
      totalBills: 0,
      debts: seed.debts.map(function(d) {
        return {
          id: d.id, name: d.name, type: d.type,
          balanceStart: d.balance, apr: d.apr,
          interest: 0, payment: d.payment,
          paymentSlot: d.payment,
          balanceEnd: d.balance,
          paidOff: false, payable: true,
          minimum: calcMinPayment(d.balance, d.apr, d.type) || d.payment
        };
      }),
      strategy: seed.strategy || 'current',
      keepPct: seed.keepPct || 0,
      surplus: 0,
      cumulativeInterest: 0,
      rollovers: [],
      totalDebtPayment: 0,
      hasOverride: false
    });
  }
  return chain;
}
```

This is a non-functional stub. It will be replaced in Task 2. The purpose is to verify the two-script split works without breaking the app.

- [ ] **Step 5: Verify app still loads**

Open `index.html` in a browser. Confirm:
- Dashboard renders with existing data
- No console errors
- `calcMinPayment` works (add a debt, see the hint)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "refactor: extract engine script block, stub buildChain"
```

---

## Task 2: Implement buildChain Core

Replace the stub with the full chain computation. No UI changes yet — this task is pure logic.

**Files:**
- Modify: `/workspace/index.html` (engine script block)

- [ ] **Step 1: Implement month 0 (seed node)**

Replace the `buildChain` stub with:

```javascript
function buildChain(seed, overrides, maxMonths) {
  const chain = [];
  const allBills = seed.bills || [];
  const allDebts = seed.debts || [];
  const baseStrategy = seed.strategy || 'current';
  const baseKeepPct = seed.keepPct || 0;
  const baseBudget = allDebts.reduce(function(s, d) { return s + d.payment; }, 0);

  // Month 0: current state snapshot
  const m0Debts = allDebts.map(function(d) {
    const min = d.type === 'cc' ? calcMinPayment(d.balance, d.apr, d.type) : d.payment;
    return {
      id: d.id, name: d.name, type: d.type,
      balanceStart: d.balance, apr: d.apr,
      interest: 0, payment: 0, paymentSlot: d.payment,
      balanceEnd: d.balance,
      paidOff: false, payable: d.balance <= 0 || d.payment > 0,
      minimum: min
    };
  });
  const m0Bills = allBills.filter(function(b) {
    return !b.dropoff || b.dropoff > 0;
  }).map(function(b) {
    return { id: b.id, name: b.name, amount: b.amount };
  });
  const m0TotalBills = m0Bills.reduce(function(s, b) { return s + b.amount; }, 0);

  chain.push({
    month: 0,
    income: seed.income,
    activeBills: m0Bills,
    totalBills: m0TotalBills,
    debts: m0Debts,
    strategy: baseStrategy,
    keepPct: baseKeepPct,
    surplus: seed.income - m0TotalBills - baseBudget,
    cumulativeInterest: 0,
    rollovers: [],
    totalDebtPayment: baseBudget,
    hasOverride: false
  });

  // Chain computation continues in next step...
  return chain;
}
```

- [ ] **Step 2: Implement month N derivation loop**

Add the main loop inside `buildChain`, after the month 0 push and before `return chain`:

```javascript
  let pendingRollover = 0;

  for (let m = 1; m <= maxMonths; m++) {
    const prev = chain[m - 1];
    const ovr = overrides[m] || null;

    // Step 1: Inherit
    let monthIncome = prev.income;
    let monthStrategy = prev.strategy;
    let monthKeepPct = prev.keepPct;

    // Step 2: Merge overrides
    if (ovr) {
      if (ovr.income !== undefined) monthIncome = ovr.income;
      if (ovr.strategy !== undefined) monthStrategy = ovr.strategy;
      if (ovr.keepPct !== undefined) monthKeepPct = ovr.keepPct;
    }

    // Step 3: Compute bills
    const monthBills = allBills.filter(function(b) {
      if (ovr && ovr.bills && ovr.bills[b.id] && ovr.bills[b.id].active === false) return false;
      return !b.dropoff || b.dropoff > m;
    }).map(function(b) {
      let amt = b.amount;
      if (ovr && ovr.bills && ovr.bills[b.id] && ovr.bills[b.id].amount !== undefined) amt = ovr.bills[b.id].amount;
      return { id: b.id, name: b.name, amount: amt };
    });
    const totalBills = monthBills.reduce(function(s, b) { return s + b.amount; }, 0);

    // Step 4: Build debt state from previous balances
    let monthDebts = prev.debts.map(function(pd) {
      const balStart = pd.balanceEnd;
      const userPayment = allDebts.find(function(d) { return d.id === pd.id; });
      const seedPayment = userPayment ? userPayment.payment : 0;
      const min = pd.type === 'cc' ? calcMinPayment(balStart, pd.apr, pd.type) : seedPayment;
      return {
        id: pd.id, name: pd.name, type: pd.type,
        balanceStart: balStart, apr: pd.apr,
        interest: 0, payment: 0, paymentSlot: 0,
        balanceEnd: balStart,
        paidOff: false, payable: true,
        minimum: balStart > 0.005 ? min : 0
      };
    });

    // Apply debt overrides
    if (ovr && ovr.debts) {
      monthDebts.forEach(function(md) {
        const dOvr = ovr.debts[md.id];
        if (dOvr && md.balanceStart > 0.005) {
          if (dOvr.payment !== undefined) md.paymentSlot = dOvr.payment;
          if (dOvr.extraPayment !== undefined) md.paymentSlot = (md.paymentSlot || 0) + dOvr.extraPayment;
        }
      });
    }

    // Step 5: Compute budget
    let budget = baseBudget + pendingRollover;
    pendingRollover = 0; // consumed

    // Step 6: Allocate by strategy
    const liveDebts = monthDebts.filter(function(d) { return d.balanceStart > 0.005; });
    const totalMins = liveDebts.reduce(function(s, d) { return s + d.minimum; }, 0);

    if (monthStrategy === 'current') {
      // No reallocation — each debt keeps user-set payment
      monthDebts.forEach(function(md) {
        if (md.balanceStart <= 0.005) { md.payment = 0; md.paymentSlot = 0; return; }
        const seedD = allDebts.find(function(d) { return d.id === md.id; });
        md.payment = seedD ? seedD.payment : 0;
        md.paymentSlot = md.payment;
      });
    } else {
      // Snowball or avalanche
      let extra = budget - totalMins;
      if (extra < 0) extra = 0;

      // Pay minimums first
      liveDebts.forEach(function(d) { d.payment = d.minimum; d.paymentSlot = d.minimum; });

      // Sort for targeting
      const targets = liveDebts.slice().sort(function(a, b) {
        if (monthStrategy === 'snowball') return a.balanceStart - b.balanceStart;
        if (monthStrategy === 'avalanche') {
          if (b.apr !== a.apr) return b.apr - a.apr;
          return a.balanceStart - b.balanceStart; // tie-break: smaller balance
        }
        return 0;
      });

      // Apply extra to targets
      for (let t = 0; t < targets.length && extra > 0.005; t++) {
        const d = targets[t];
        const rate = d.apr / 100 / 12;
        const interestThisMonth = d.balanceStart * rate;
        const canApply = d.balanceStart + interestThisMonth - d.payment;
        if (canApply <= 0) continue; // already covered by minimum
        const apply = Math.min(extra, canApply);
        d.payment += apply;
        d.paymentSlot += apply;
        extra -= apply;
      }
    }

    // Step 7: Apply interest + payments
    let monthInterest = 0;
    monthDebts.forEach(function(d) {
      if (d.balanceStart <= 0.005) {
        d.interest = 0; d.balanceEnd = 0; d.paidOff = false; d.payable = true;
        return;
      }
      const rate = d.apr / 100 / 12;
      d.interest = d.balanceStart * rate;
      monthInterest += d.interest;
      d.balanceEnd = d.balanceStart + d.interest - d.payment;
      if (d.balanceEnd <= 0.005) {
        d.balanceEnd = 0;
        d.paidOff = true;
      }
      // Payable check: can payment cover interest?
      d.payable = d.payment >= d.interest || d.apr === 0;
    });

    // Step 8: Handle rollover
    const rollovers = [];
    let freedThisMonth = 0;
    monthDebts.forEach(function(d) {
      if (d.paidOff) {
        freedThisMonth += d.paymentSlot;
      }
    });

    if (freedThisMonth > 0 && monthStrategy !== 'current') {
      let keepAmt;
      if (ovr && ovr.keep !== undefined) {
        keepAmt = ovr.keep;
      } else {
        keepAmt = freedThisMonth * (monthKeepPct / 100);
      }
      const rolloverAmt = Math.max(0, freedThisMonth - keepAmt);
      pendingRollover = rolloverAmt;

      // Record what rolled where (target is next month's top priority)
      const paidOffNames = monthDebts.filter(function(d) { return d.paidOff; }).map(function(d) { return d.name; });
      if (rolloverAmt > 0) {
        rollovers.push({ from: paidOffNames.join(', '), to: 'next target', amount: rolloverAmt });
      }
    }

    // Step 9: Compute surplus
    const totalDebtPayment = monthDebts.reduce(function(s, d) { return s + d.payment; }, 0);
    const surplus = monthIncome - totalBills - totalDebtPayment;
    const cumInterest = prev.cumulativeInterest + monthInterest;

    chain.push({
      month: m,
      income: monthIncome,
      activeBills: monthBills,
      totalBills: totalBills,
      debts: monthDebts,
      strategy: monthStrategy,
      keepPct: monthKeepPct,
      surplus: surplus,
      cumulativeInterest: cumInterest,
      rollovers: rollovers,
      totalDebtPayment: totalDebtPayment,
      hasOverride: !!ovr
    });

    // Termination: all debts paid off
    if (monthDebts.every(function(d) { return d.balanceEnd <= 0.005; })) break;
  }

  return chain;
}
```

- [ ] **Step 3: Verify buildChain in console**

Open browser console, run:
```javascript
const seed = { income: 5000, bills: [], debts: [
  { id: 1, name: 'Test', type: 'cc', balance: 1000, apr: 24, payment: 100, color: '#ff0000' }
], strategy: 'current', keepPct: 0 };
const chain = buildChain(seed, {}, 36);
console.log('Months:', chain.length, 'Final balance:', chain[chain.length-1].debts[0].balanceEnd);
```

Expected: chain has entries, final balance < initial balance, no errors.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat: implement buildChain core computation"
```

---

## Task 3: Add State Variables and Wire recalc to Chain

Add new global state, refactor `recalc()` to use `buildChain`, update chart and metrics rendering.

**Files:**
- Modify: `/workspace/index.html:463-474` (state vars)
- Modify: `/workspace/index.html:632-790` (recalc function)

- [ ] **Step 1: Add new state variables**

After the existing state block (line 473), add:

```javascript
let strategy = 'current';
let keepPct = 0;
let overrides = {};
let chain = [];
let detailMonth = null; // null = overview, number = month detail mode
```

- [ ] **Step 2: Refactor recalc to use buildChain**

Replace the `recalc()` function (lines 633-790) with a new version that:
1. Builds the seed object from current state
2. Calls `buildChain(seed, overrides, 600)`
3. Extracts display values from the chain
4. Renders hero, metrics, chart, and breakdown from chain data

The new `recalc()`:

```javascript
function recalc() {
  if (recalcTimeout) { clearTimeout(recalcTimeout); recalcTimeout = null; }
  const inc = clampPositive(document.getElementById('income-input').value);
  income = inc;

  // Build seed
  const seed = {
    income: inc, bills: bills, debts: debts,
    strategy: strategy, keepPct: keepPct
  };

  // Build chain
  chain = buildChain(seed, overrides, 600);
  const maxMonth = chain.length - 1;

  // Header stats
  document.getElementById('h-income').textContent = fmt(inc);
  const totalBillsNow = chain[0].totalBills;
  document.getElementById('h-bills').textContent = fmt(totalBillsNow);
  document.getElementById('h-debt').textContent = fmt(debts.reduce(function(s, d) { return s + d.balance; }, 0));

  // Dashboard visibility
  const hasDashboard = debts.length > 0 || bills.length > 0 || inc > 0;
  document.getElementById('empty-state').style.display = hasDashboard ? 'none' : 'flex';
  const dash = document.getElementById('dashboard');
  dash.style.display = hasDashboard ? 'flex' : 'none';
  if (!hasDashboard) { updateExportIndicator(); return; }

  // Projection slider
  const projMonth = Math.min(parseInt(document.getElementById('proj-month').value) || 6, maxMonth);
  const projNode = chain[projMonth] || chain[maxMonth];
  const nowNode = chain[0];

  document.getElementById('proj-month-label').textContent = projMonth;

  // Build tick marks (reuse existing tick logic)
  const dropoffEvents = {};
  bills.forEach(function(b) {
    if (b.dropoff && b.dropoff <= 36) {
      if (!dropoffEvents[b.dropoff]) dropoffEvents[b.dropoff] = [];
      dropoffEvents[b.dropoff].push(b.name);
    }
  });
  const ticksEl = document.getElementById('proj-ticks');
  ticksEl.innerHTML = '';
  const tickMonths = [1, 6, 12, 18, 24, 36];
  Object.keys(dropoffEvents).forEach(function(m) {
    const n = parseInt(m);
    if (tickMonths.indexOf(n) === -1) tickMonths.push(n);
  });
  tickMonths.sort(function(a, b) { return a - b; });
  tickMonths.forEach(function(m) {
    if (m > 36) return;
    const hasEvent = !!dropoffEvents[m];
    const pct = ((m - 1) / 35) * 100;
    const div = document.createElement('div');
    div.className = 'proj-tick' + (hasEvent ? ' has-event' : '');
    div.style.position = 'absolute';
    div.style.left = pct + '%';
    div.style.transform = 'translateX(-50%)';
    div.innerHTML = '<div class="proj-tick-line"></div><span>' + m + '</span>';
    ticksEl.style.position = 'relative';
    ticksEl.style.height = '14px';
    ticksEl.appendChild(div);
  });

  // Hero values
  const nowFree = nowNode.surplus;
  const projFree = projNode.surplus;
  const droppedByProj = bills.filter(function(b) { return b.dropoff && b.dropoff <= projMonth; }).map(function(b) { return b.name; });
  const subText = droppedByProj.length > 0 ? droppedByProj.join(', ') + ' dropped' : projMonth === 1 ? 'no bills dropped yet' : 'no bills drop by month ' + projMonth;

  document.getElementById('d-now').textContent = '$' + Math.max(0, nowFree / 30).toFixed(2);
  document.getElementById('d-soon').textContent = '$' + Math.max(0, projFree / 30).toFixed(2);
  document.getElementById('d-now-sub').textContent = fmt(Math.max(0, nowFree)) + '/mo free right now';
  document.getElementById('d-soon-sub').textContent = subText;
  document.getElementById('d-surplus').textContent = fmt(Math.max(0, nowFree));
  document.getElementById('d-surplus-sub').textContent = 'after all bills + debt payments';
  document.getElementById('proj-surplus-label').textContent = projMonth;
  document.getElementById('d-surplus-proj').textContent = fmt(Math.max(0, projFree));
  const surplusDelta = projFree - nowFree;
  const deltaStr = (surplusDelta >= 0 ? '+' : '') + fmt(Math.abs(surplusDelta)) + (surplusDelta >= 0 ? ' more' : ' less') + ' than now';
  document.getElementById('d-surplus-proj-sub').textContent = surplusDelta === 0 ? 'no change from now' : deltaStr;
  document.getElementById('d-surplus-proj').style.color = projFree >= nowFree ? 'var(--green)' : 'var(--red)';
  document.getElementById('m-bills-soon').textContent = fmt(projNode.totalBills) + '/mo';

  // Warning bar — check for unpayable debts across chain
  const hasWarn = chain.some(function(node) {
    return node.debts.some(function(d) { return !d.payable && d.balanceStart > 0.005; });
  });
  document.getElementById('warn-bar').style.display = hasWarn ? 'block' : 'none';

  if (debts.length === 0) {
    document.getElementById('m-cleared').textContent = 'no debts';
    document.getElementById('m-interest').textContent = '$0.00';
    document.getElementById('m-total-paid').textContent = '$0.00';
    document.getElementById('m-monthly-debt').textContent = '$0.00';
    document.getElementById('breakdown-list').innerHTML = '';
    document.getElementById('chart-legend').innerHTML = '';
    if (myChart) { myChart.data.labels = []; myChart.data.datasets = []; myChart.update('none'); }
    updateExportIndicator();
    return;
  }

  // Find payoff month per debt and compute totals from chain
  const lastNode = chain[maxMonth];
  const allCleared = debts.every(function(d) {
    const ld = lastNode.debts.find(function(x) { return x.id === d.id; });
    return ld && ld.balanceEnd <= 0.005;
  });
  const clearedMonth = allCleared ? maxMonth : null;
  const totalInterest = lastNode.cumulativeInterest;
  const totalDebtPayment = chain[1] ? chain[1].totalDebtPayment : 0;

  // Compute totalPaidOut: sum of all payments made across the chain
  let totalPaidOut = 0;
  for (let i = 1; i < chain.length; i++) {
    totalPaidOut += chain[i].totalDebtPayment;
  }

  // Strategy comparison deltas
  let deltaMonths = null;
  let deltaInterest = null;
  if (strategy !== 'current') {
    const baselineSeed = { income: inc, bills: bills, debts: debts, strategy: 'current', keepPct: 0 };
    const baselineChain = buildChain(baselineSeed, {}, 600);
    const baseMax = baselineChain.length - 1;
    const baseTotalInterest = baselineChain[baseMax].cumulativeInterest;
    deltaMonths = baseMax - maxMonth;
    deltaInterest = baseTotalInterest - totalInterest;
  }

  document.getElementById('m-cleared').innerHTML = fmtMo(clearedMonth || maxMonth) +
    (deltaMonths !== null && deltaMonths > 0 ? ' <span style="color:var(--green);font-size:12px;">(-' + deltaMonths + 'mo)</span>' : '');
  document.getElementById('m-interest').innerHTML = fmt(totalInterest) +
    (deltaInterest !== null && deltaInterest > 0 ? ' <span style="color:var(--green);font-size:12px;">(-' + fmt(deltaInterest) + ')</span>' : '');
  document.getElementById('m-total-paid').textContent = fmt(totalPaidOut);
  document.getElementById('m-monthly-debt').textContent = fmt(totalDebtPayment);

  // Breakdown panel
  renderBreakdown();

  // Chart
  renderChart();

  updateExportIndicator();
}
```

- [ ] **Step 3: Add renderBreakdown function**

Add after `recalc()`:

```javascript
function renderBreakdown() {
  const blist = document.getElementById('breakdown-list');
  const bpTitle = document.querySelector('.bp-title');
  blist.innerHTML = '';

  if (detailMonth !== null && chain[detailMonth]) {
    // Month detail mode
    const node = chain[detailMonth];
    bpTitle.innerHTML = '<span style="cursor:pointer;" onclick="detailMonth=null;renderBreakdown();">← </span>Month ' + detailMonth + ' of ' + (chain.length - 1);

    node.debts.forEach(function(d) {
      if (d.balanceStart <= 0 && !d.paidOff) return; // skip long-dead debts
      const card = document.createElement('div');
      card.className = 'debt-summary-card';
      if (!d.payable) card.style.borderColor = 'var(--red)';
      if (d.paidOff) card.style.borderColor = 'var(--green)';
      const debt = debts.find(function(x) { return x.id === d.id; });
      card.innerHTML =
        '<div class="dsc-name"><span>' + escHtml(d.name) + '</span><span style="font-family:var(--mono);font-size:11px;color:' + safeColor(debt ? debt.color : '#00e5ff') + ';">' + d.apr + '%</span></div>' +
        '<div class="dsc-row"><span>Balance</span><span>' + (d.paidOff ? '<span style="color:var(--green)">paid off</span>' : fmt(d.balanceEnd)) + '</span></div>' +
        '<div class="dsc-row"><span>Payment</span><span>' + fmt(d.payment) + '</span></div>' +
        '<div class="dsc-row"><span>Interest</span><span class="warn-val">' + fmt(d.interest) + '</span></div>' +
        (d.paidOff ? '<div class="dsc-row"><span>Rollover</span><span class="good">' + fmt(d.paymentSlot) + ' freed</span></div>' : '');
      blist.appendChild(card);
    });

    // Rollovers
    node.rollovers.forEach(function(r) {
      const div = document.createElement('div');
      div.style.cssText = 'font-family:var(--mono);font-size:10px;color:var(--green);padding:6px 0;border-top:1px solid var(--border);margin-top:4px;';
      div.textContent = fmt(r.amount) + ' rolls from ' + r.from + ' → ' + r.to;
      blist.appendChild(div);
    });

    // Surplus
    const surpDiv = document.createElement('div');
    surpDiv.style.cssText = 'font-family:var(--mono);font-size:10px;color:var(--muted);padding:8px 0;border-top:1px solid var(--border);margin-top:4px;';
    surpDiv.textContent = 'Surplus: ' + fmt(Math.max(0, node.surplus)) + '/mo (' + '$' + Math.max(0, node.surplus / 30).toFixed(2) + '/day)';
    blist.appendChild(surpDiv);

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'add-btn';
    editBtn.textContent = 'edit this month';
    editBtn.style.marginTop = '8px';
    editBtn.onclick = function() { openMonthEdit(detailMonth); };
    blist.appendChild(editBtn);

  } else {
    // Overview mode — existing behavior
    bpTitle.textContent = 'Per account';

    if (chain.length < 2) return;

    debts.forEach(function(d) {
      // Find payoff month for this debt
      let payoffMonth = null;
      let totalInterestForDebt = 0;
      for (let i = 1; i < chain.length; i++) {
        const cd = chain[i].debts.find(function(x) { return x.id === d.id; });
        if (cd) {
          totalInterestForDebt += cd.interest;
          if (cd.paidOff && payoffMonth === null) payoffMonth = i;
        }
      }
      const lastDebt = chain[chain.length - 1].debts.find(function(x) { return x.id === d.id; });
      const payable = lastDebt ? lastDebt.balanceEnd <= 0.005 : false;
      const paidOffText = payable ? fmtMo(payoffMonth) : '<span style="color:var(--red)">unpayable</span>';

      const card = document.createElement('div');
      card.className = 'debt-summary-card';
      if (!payable) card.style.borderColor = 'var(--red)';
      card.innerHTML =
        '<div class="dsc-name"><span>' + escHtml(d.name) + '</span><span style="font-family:var(--mono);font-size:11px;color:' + safeColor(d.color) + ';">' + d.apr + '%</span></div>' +
        '<div class="dsc-row"><span>Balance</span><span>' + fmt(d.balance) + '</span></div>' +
        '<div class="dsc-row"><span>Payment</span><span>' + fmt(d.payment) + '/mo</span></div>' +
        '<div class="dsc-row"><span>Paid off</span><span class="good">' + paidOffText + '</span></div>' +
        '<div class="dsc-row"><span>Interest</span><span class="warn-val">' + fmt(totalInterestForDebt) + '</span></div>';
      blist.appendChild(card);
    });
  }
}
```

- [ ] **Step 4: Add renderChart function**

Extract the chart rendering from recalc into its own function:

```javascript
function renderChart() {
  if (chain.length < 2) return;
  const maxMonth = chain.length - 1;

  const labels = [];
  for (let i = 0; i <= maxMonth; i++) labels.push(i === 0 ? 'Now' : i + 'm');

  const datasets = debts.map(function(d) {
    const chartData = [];
    for (let i = 0; i < chain.length; i++) {
      const cd = chain[i].debts.find(function(x) { return x.id === d.id; });
      chartData.push(cd ? cd.balanceEnd : 0);
    }
    // Check if debt is ever payable
    const everPaysOff = chartData[chartData.length - 1] <= 0.005;
    return {
      label: d.name,
      data: chartData,
      borderColor: safeColor(d.color),
      backgroundColor: hexToRgba(safeColor(d.color), 0.07),
      fill: true, tension: 0.35, borderWidth: 2, pointRadius: 0,
      borderDash: everPaysOff ? [] : [5, 5]
    };
  });

  const legend = document.getElementById('chart-legend');
  legend.innerHTML = '';
  debts.forEach(function(d) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = '<div class="legend-swatch" style="background:' + safeColor(d.color) + ';"></div>' + escHtml(d.name) + ' ' + d.apr + '%';
    legend.appendChild(item);
  });

  if (myChart) {
    myChart.data.labels = labels;
    myChart.data.datasets = datasets;
    myChart.update('none');
  } else {
    myChart = new Chart(document.getElementById('chart'), {
      type: 'line', data: { labels: labels, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#13151c', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1,
            titleColor: '#606070', bodyColor: '#e8e8f0',
            titleFont: { family: 'JetBrains Mono' }, bodyFont: { family: 'JetBrains Mono', size: 11 },
            callbacks: { label: function(c) { return ' ' + c.dataset.label + ': $' + Math.round(c.parsed.y).toLocaleString(); } }
          }
        },
        scales: {
          x: { ticks: { color: '#606070', font: { size: 10, family: 'JetBrains Mono' }, maxRotation: 45, autoSkip: true, maxTicksLimit: 20 }, grid: { color: 'rgba(255,255,255,0.03)' }, border: { color: 'rgba(255,255,255,0.06)' } },
          y: { min: 0, ticks: { color: '#606070', font: { size: 10, family: 'JetBrains Mono' }, callback: function(v) { return v >= 1000 ? '$' + (v / 1000).toFixed(0) + 'k' : '$' + v; } }, grid: { color: 'rgba(255,255,255,0.03)' }, border: { color: 'rgba(255,255,255,0.06)' } }
        },
        onClick: function(evt) {
          const points = myChart.getElementsAtEventForMode(evt, 'index', { intersect: false }, true);
          if (points.length > 0) {
            detailMonth = points[0].index;
            const slider = document.getElementById('proj-month');
            if (detailMonth <= 36) slider.value = detailMonth;
            renderBreakdown();
          }
        }
      }
    });
  }
}
```

- [ ] **Step 5: Wire slider to set detailMonth**

Update the slider event listener. Find the line:
```javascript
document.getElementById('proj-month').addEventListener('input', recalc);
```

Replace with:
```javascript
document.getElementById('proj-month').addEventListener('input', function() {
  detailMonth = parseInt(this.value) || null;
  recalc();
});
```

- [ ] **Step 6: Verify full app works**

Open in browser, test:
- Load example data — chart renders, breakdown cards show
- Move slider — hero metrics update, breakdown shows month detail
- Click "←" in breakdown title — returns to overview
- Click a point on the chart — breakdown shows that month

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: wire recalc to buildChain, add renderBreakdown and renderChart"
```

---

## Task 4: Strategy Controls in Sidebar

Add the strategy dropdown and keep-for-savings input to the Debts tab.

**Files:**
- Modify: `/workspace/index.html` (HTML sidebar debts tab, CSS, JS)

- [ ] **Step 1: Add CSS for strategy controls**

Add after the `.add-btn:hover` rule (around line 91):

```css
/* STRATEGY */
.strategy-section{padding:1rem;border-bottom:1px solid var(--border);}
.strategy-section .ps-title{margin-bottom:8px;}
.strategy-select{width:100%;background:var(--s3);border:1px solid var(--border2);border-radius:6px;color:var(--text);font-family:var(--mono);font-size:12px;padding:6px 8px;outline:none;margin-bottom:4px;}
.strategy-select:focus{border-color:var(--accent);}
.strategy-desc{font-family:var(--mono);font-size:9px;color:var(--muted);margin-bottom:10px;line-height:1.5;}
.keep-row{display:flex;align-items:center;gap:8px;margin-top:6px;}
.keep-row label{font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase;white-space:nowrap;}
.keep-row input{width:60px;background:var(--s3);border:1px solid var(--border2);border-radius:4px;color:var(--text);font-family:var(--mono);font-size:12px;padding:4px 8px;text-align:right;outline:none;}
.keep-row input:focus{border-color:var(--accent);}
```

- [ ] **Step 2: Add strategy HTML to sidebar Debts tab**

Find the Debts tab panel (the `<div class="tab-panel" id="tab-debts">`) and add a strategy section at the top, before the debt accounts panel-section:

```html
<div class="strategy-section" id="strategy-section">
  <div class="ps-title">Strategy</div>
  <select class="strategy-select" id="strategy-select" onchange="onStrategyChange()">
    <option value="current">Current plan</option>
    <option value="snowball">Snowball</option>
    <option value="avalanche">Avalanche</option>
  </select>
  <div class="strategy-desc" id="strategy-desc">No reallocation — use your set payments</div>
  <div id="keep-controls" style="display:none;">
    <div style="font-family:var(--mono);font-size:9px;color:var(--muted);letter-spacing:0.06em;text-transform:uppercase;margin-bottom:4px;">When a debt pays off, keep for savings</div>
    <div class="keep-row">
      <input type="number" id="keep-pct" value="0" min="0" max="100" step="5" oninput="onKeepChange()">
      <label>%</label>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add strategy JS handlers**

Add after the `pickColor` function:

```javascript
const strategyDescs = {
  current: 'No reallocation — use your set payments',
  snowball: 'Pay off smallest balance first — quick wins build momentum',
  avalanche: 'Pay off highest interest first — saves the most money'
};

function onStrategyChange() {
  strategy = document.getElementById('strategy-select').value;
  document.getElementById('strategy-desc').textContent = strategyDescs[strategy];
  document.getElementById('keep-controls').style.display = strategy === 'current' ? 'none' : '';
  markDirty();
  recalc();
}

function onKeepChange() {
  keepPct = clampPositive(document.getElementById('keep-pct').value);
  if (keepPct > 100) keepPct = 100;
  markDirty();
  recalc();
}
```

- [ ] **Step 4: Persist strategy and keepPct**

Update `saveToCache` — add `strategy`, `keepPct`, and `overrides` to the state object:

```javascript
const state = {
  income: income, bills: bills, debts: debts,
  nextBillId: nextBillId, nextDebtId: nextDebtId,
  hasExported: hasExported,
  strategy: strategy, keepPct: keepPct, overrides: overrides,
  savedAt: new Date().toISOString()
};
```

Update `loadFromCache` — restore strategy, keepPct, overrides:

After `hasExported = state.hasExported || false;` add:
```javascript
strategy = state.strategy || 'current';
keepPct = state.keepPct || 0;
overrides = state.overrides || {};
document.getElementById('strategy-select').value = strategy;
document.getElementById('strategy-desc').textContent = strategyDescs[strategy] || '';
document.getElementById('keep-controls').style.display = strategy === 'current' ? 'none' : '';
document.getElementById('keep-pct').value = keepPct;
```

- [ ] **Step 5: Update YAML export/import**

In `stateToYaml`, after `lines.push('income: ' + income);` add:

```javascript
if (strategy !== 'current') lines.push('strategy: ' + strategy);
if (keepPct > 0) lines.push('keepPct: ' + keepPct);
```

In `parseYaml`, in the indent-0 top-level key handler, add cases:

```javascript
else if (key === 'strategy') { result.strategy = val; }
else if (key === 'keepPct') { result.keepPct = parseFloat(val) || 0; }
```

Add `strategy` and `keepPct` to the result object initialization:
```javascript
const result = { income: 0, bills: [], debts: [], strategy: 'current', keepPct: 0 };
```

In `confirmImport`, after setting bills and debts, add:
```javascript
strategy = parsed.strategy || 'current';
keepPct = parsed.keepPct || 0;
overrides = {};
document.getElementById('strategy-select').value = strategy;
document.getElementById('strategy-desc').textContent = strategyDescs[strategy] || '';
document.getElementById('keep-controls').style.display = strategy === 'current' ? 'none' : '';
document.getElementById('keep-pct').value = keepPct;
```

- [ ] **Step 6: Verify strategy UI**

Test:
- Load example data
- Switch to Debts tab — strategy section visible at top
- Select "Avalanche" — description updates, keep controls appear
- Set keep to 20% — recalc fires
- Chart updates showing faster payoff
- Metrics show deltas (-Xmo, -$X) in green
- Export YAML — contains `strategy: avalanche` and `keepPct: 20`
- Refresh page — strategy persists from localStorage

- [ ] **Step 7: Commit**

```bash
git add index.html
git commit -m "feat: add strategy controls in sidebar Debts tab"
```

---

## Task 5: Month Edit Modal

Add the modal for editing month overrides.

**Files:**
- Modify: `/workspace/index.html` (HTML modal, JS handlers)

- [ ] **Step 1: Add modal HTML**

After the import modal closing `</div>` and before the toast div, add:

```html
<!-- MONTH EDIT MODAL -->
<div class="modal-overlay" id="modal-month-edit">
  <div class="modal">
    <h3>Edit Month <span id="edit-month-num"></span></h3>
    <div class="modal-field">
      <label>Income ($)</label>
      <input type="number" id="edit-month-income" min="0" step="50">
    </div>
    <div class="modal-field">
      <label>Strategy</label>
      <select id="edit-month-strategy">
        <option value="">— inherit —</option>
        <option value="snowball">Snowball</option>
        <option value="avalanche">Avalanche</option>
      </select>
    </div>
    <div class="modal-field">
      <label>Keep from rollover ($)</label>
      <input type="number" id="edit-month-keep" min="0" step="10" placeholder="inherit %">
    </div>
    <div id="edit-month-debts"></div>
    <div class="modal-actions" style="justify-content:space-between;">
      <button class="btn-secondary" onclick="resetMonthOverride()" style="color:var(--red);border-color:rgba(255,68,102,0.3);">reset month</button>
      <div style="display:flex;gap:8px;">
        <button class="btn-secondary" onclick="closeModal('modal-month-edit')">Cancel</button>
        <button class="btn-primary" onclick="saveMonthOverride()">Save</button>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Add openMonthEdit function**

```javascript
let editingMonth = null;

function openMonthEdit(month) {
  editingMonth = month;
  const node = chain[month];
  if (!node) return;
  const ovr = overrides[month] || {};

  document.getElementById('edit-month-num').textContent = month;
  document.getElementById('edit-month-income').value = ovr.income !== undefined ? ovr.income : node.income;
  document.getElementById('edit-month-strategy').value = ovr.strategy || '';
  document.getElementById('edit-month-keep').value = ovr.keep !== undefined ? ovr.keep : '';

  // Build per-debt payment fields
  const container = document.getElementById('edit-month-debts');
  container.innerHTML = '';
  node.debts.forEach(function(d) {
    if (d.balanceStart <= 0.005) return;
    const dOvr = (ovr.debts && ovr.debts[d.id]) || {};
    const div = document.createElement('div');
    div.className = 'modal-field';
    div.innerHTML =
      '<label>' + escHtml(d.name) + ' payment ($)</label>' +
      '<input type="number" class="edit-debt-payment" data-debt-id="' + d.id + '" min="0" step="0.01" ' +
      'value="' + (dOvr.payment !== undefined ? dOvr.payment : '') + '" ' +
      'placeholder="' + d.payment.toFixed(2) + ' (auto)">';
    container.appendChild(div);
  });

  document.getElementById('modal-month-edit').classList.add('open');
}

function saveMonthOverride() {
  const month = editingMonth;
  if (month === null) return;
  const ovr = {};

  const incVal = document.getElementById('edit-month-income').value;
  const incNum = parseFloat(incVal);
  const node = chain[month];
  if (!isNaN(incNum) && node && incNum !== node.income) ovr.income = incNum;

  const stratVal = document.getElementById('edit-month-strategy').value;
  if (stratVal) ovr.strategy = stratVal;

  const keepVal = document.getElementById('edit-month-keep').value;
  const keepNum = parseFloat(keepVal);
  if (!isNaN(keepNum) && keepVal !== '') ovr.keep = keepNum;

  // Debt payment overrides
  const debtInputs = document.querySelectorAll('.edit-debt-payment');
  const debtOvrs = {};
  let hasDebtOvr = false;
  debtInputs.forEach(function(inp) {
    const id = parseInt(inp.dataset.debtId);
    const val = parseFloat(inp.value);
    if (!isNaN(val) && inp.value !== '') {
      debtOvrs[id] = { payment: val };
      hasDebtOvr = true;
    }
  });
  if (hasDebtOvr) ovr.debts = debtOvrs;

  if (Object.keys(ovr).length > 0) {
    overrides[month] = ovr;
  } else {
    delete overrides[month];
  }

  closeModal('modal-month-edit');
  markDirty();
  recalc();
}

function resetMonthOverride() {
  if (editingMonth !== null) {
    delete overrides[editingMonth];
    closeModal('modal-month-edit');
    markDirty();
    recalc();
    showToast('month ' + editingMonth + ' reset', 'success');
  }
}
```

- [ ] **Step 3: Add modal to Escape key handler**

In the keyboard section, the Escape handler already closes all modal overlays via `querySelectorAll('.modal-overlay')`. The new modal has class `modal-overlay`, so it's automatically handled. No change needed.

- [ ] **Step 4: Verify month edit**

Test:
- Load example data, select avalanche strategy
- Move slider to month 6, click "edit this month" in breakdown
- Modal opens with month 6 data
- Change income to 6000, save
- Chain recomputes — month 6+ shows higher surplus
- Open edit again — income shows 6000
- Click "reset month" — override removed, back to normal

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "feat: add month edit modal for overrides"
```

---

## Task 6: Update Example Data and Final Polish

Update example data to demonstrate strategy, clean up any remaining references to old functions.

**Files:**
- Modify: `/workspace/index.html`

- [ ] **Step 1: Update loadExample to set strategy**

In `loadExample()`, after setting debts, add:

```javascript
strategy = 'avalanche';
keepPct = 0;
overrides = {};
document.getElementById('strategy-select').value = strategy;
document.getElementById('strategy-desc').textContent = strategyDescs[strategy];
document.getElementById('keep-controls').style.display = '';
document.getElementById('keep-pct').value = keepPct;
```

- [ ] **Step 2: Remove dead code**

Search for any remaining references to the old `calcDebt` function. Remove:
- The `padBalance` helper (no longer needed — chart reads directly from chain)
- The `pad` helper (same reason)
- Any references to `results` array in the old recalc pattern

- [ ] **Step 3: Add hasOverride indicator to slider ticks**

In the tick-building loop inside recalc, add override indicators. After the dropoff event ticks, check if any overrides exist at tick months:

```javascript
// Mark override months on ticks
Object.keys(overrides).forEach(function(m) {
  const n = parseInt(m);
  if (n > 0 && n <= 36 && tickMonths.indexOf(n) === -1) tickMonths.push(n);
});
```

And in the tick rendering, add an override indicator:

```javascript
const hasOvr = !!overrides[m];
div.className = 'proj-tick' + (hasEvent ? ' has-event' : '') + (hasOvr ? ' has-event' : '');
```

This reuses the amber styling for override months too. Simple and visible.

- [ ] **Step 4: Full integration test**

Test the complete flow:
1. Load app fresh — empty state shows
2. Load example data — dashboard renders with avalanche strategy
3. Chart shows debts paying off sequentially (Friend first at 0%, then lowest balance)
4. Metrics show delta vs current plan
5. Move slider — month detail shows in breakdown
6. Click "edit this month" — modal opens
7. Change income, save — chain recomputes
8. Switch to snowball — chart changes, deltas update
9. Switch to "Current plan" — keep controls hide, chart shows independent payoff
10. Export YAML — includes strategy
11. Import YAML — strategy restores
12. Refresh page — all state persists

- [ ] **Step 5: Commit and push**

```bash
git add index.html
git commit -m "feat: complete projection chain engine with strategy UI"
git push origin master
```

---

## Summary

| Task | What | Commits |
|------|------|---------|
| 1 | Extract engine script, stub buildChain | 1 |
| 2 | Implement full buildChain computation | 1 |
| 3 | Wire recalc to chain, renderBreakdown, renderChart | 1 |
| 4 | Strategy controls in sidebar, persistence, YAML | 1 |
| 5 | Month edit modal for overrides | 1 |
| 6 | Example data, dead code cleanup, polish | 1 |

Total: 6 tasks, 6 commits, ~500 lines of new/modified code.
