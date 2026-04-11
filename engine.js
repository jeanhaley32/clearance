// ─── ENGINE (pure computation, no DOM) ────────────────────────────────────
'use strict';

function calcMinPayment(balance, apr, type) {
  if (balance <= 0) return 0;
  if (type === 'friend') return 0;
  if (type === 'loan') return 0;
  const interest = balance * (apr / 100 / 12);
  const monthly = interest + balance * 0.01;
  return Math.min(Math.max(monthly, 25), balance + interest);
}

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
    extraIncome: 0,
    extraNote: '',
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

    let extraIncome = 0;
    let extraNote = '';
    if (ovr && ovr.extraIncome) { extraIncome = ovr.extraIncome; extraNote = ovr.extraNote || ''; }

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
      d.payable = d.balanceStart <= 0.005 || (d.payment > 0 && (d.payment >= d.interest || d.apr === 0));
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
    const surplus = monthIncome + extraIncome - totalBills - totalDebtPayment;
    const cumInterest = prev.cumulativeInterest + monthInterest;

    chain.push({
      month: m,
      income: monthIncome,
      extraIncome: extraIncome,
      extraNote: extraNote,
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
