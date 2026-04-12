'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calcMinPayment, buildChain } = require('../engine.js');

// ─── calcMinPayment ──────────────────────────────────────────────────────

test('calcMinPayment: $25 floor when formula produces less', () => {
  // $500 at 0% APR: interest=0, 1% = $5, max($5, $25) = $25
  assert.equal(calcMinPayment(500, 0, 'cc'), 25);
});

test('calcMinPayment: CC formula above $25 floor', () => {
  // $10,000 at 24% APR: interest = 200, 1% = 100, total = 300
  assert.equal(calcMinPayment(10000, 24, 'cc'), 300);
});

test('calcMinPayment: caps at balance + interest', () => {
  // $15 at 20% APR: interest = 0.25, total computed = 25.15, but cap is 15.25
  const result = calcMinPayment(15, 20, 'cc');
  assert.ok(result <= 15.26, 'should not exceed balance + interest, got ' + result);
});

test('calcMinPayment: returns 0 for loan type', () => {
  assert.equal(calcMinPayment(5000, 10, 'loan'), 0);
});

test('calcMinPayment: returns 0 for friend type', () => {
  assert.equal(calcMinPayment(1000, 0, 'friend'), 0);
});

test('calcMinPayment: returns 0 for zero or negative balance', () => {
  assert.equal(calcMinPayment(0, 20, 'cc'), 0);
  assert.equal(calcMinPayment(-100, 20, 'cc'), 0);
});

// ─── buildChain: structure ───────────────────────────────────────────────

test('buildChain: month 0 is a snapshot with no interest or payment applied', () => {
  const seed = {
    income: 5000, bills: [], debts: [
      { id: 1, name: 'X', type: 'cc', balance: 1000, apr: 24, payment: 100, color: '#f00' }
    ], strategy: 'current', keepPct: 0
  };
  const chain = buildChain(seed, {}, 36);
  const m0 = chain[0];
  assert.equal(m0.month, 0);
  assert.equal(m0.income, 5000);
  assert.equal(m0.debts[0].balanceStart, 1000);
  assert.equal(m0.debts[0].balanceEnd, 1000);
  assert.equal(m0.debts[0].interest, 0);
  assert.equal(m0.debts[0].payment, 0);
});

test('buildChain: chain terminates when all debts clear', () => {
  const seed = {
    income: 5000, bills: [], debts: [
      { id: 1, name: 'X', type: 'cc', balance: 1000, apr: 0, payment: 500, color: '#f00' }
    ], strategy: 'current', keepPct: 0
  };
  const chain = buildChain(seed, {}, 36);
  assert.ok(chain.length <= 4, 'expected early terminate, got ' + chain.length);
  const lastNode = chain[chain.length - 1];
  assert.ok(lastNode.debts[0].balanceEnd <= 0.005, 'final balance not cleared');
});

test('buildChain: respects maxMonths cap for unpayable debts', () => {
  const seed = {
    income: 5000, bills: [], debts: [
      { id: 1, name: 'X', type: 'cc', balance: 10000, apr: 24, payment: 50, color: '#f00' }
    ], strategy: 'current', keepPct: 0
  };
  const chain = buildChain(seed, {}, 36);
  assert.equal(chain.length, 37); // month 0 through 36 inclusive
});

// ─── buildChain: unpayable detection ─────────────────────────────────────

test('buildChain: zero payment on non-zero balance marks debt unpayable', () => {
  const seed = {
    income: 5000, bills: [], debts: [
      { id: 1, name: 'X', type: 'cc', balance: 1000, apr: 0, payment: 0, color: '#f00' }
    ], strategy: 'current', keepPct: 0
  };
  const chain = buildChain(seed, {}, 12);
  const mid = chain[6];
  assert.equal(mid.debts[0].payable, false);
  assert.equal(mid.debts[0].balanceEnd, 1000);
});

test('buildChain: payment less than interest marks debt unpayable', () => {
  const seed = {
    income: 5000, bills: [], debts: [
      { id: 1, name: 'X', type: 'cc', balance: 10000, apr: 36, payment: 50, color: '#f00' }
    ], strategy: 'current', keepPct: 0
  };
  const chain = buildChain(seed, {}, 12);
  const mid = chain[6];
  assert.equal(mid.debts[0].payable, false);
});

// ─── buildChain: strategy allocation ─────────────────────────────────────

test('buildChain: snowball targets lowest balance first', () => {
  const seed = {
    income: 5000, bills: [], debts: [
      { id: 1, name: 'BigA', type: 'cc', balance: 5000, apr: 24, payment: 100, color: '#f00' },
      { id: 2, name: 'SmallB', type: 'cc', balance: 500, apr: 20, payment: 50, color: '#0f0' }
    ], strategy: 'snowball', keepPct: 0
  };
  const chain = buildChain(seed, {}, 36);
  let smallBCleared = null, bigACleared = null;
  for (let i = 1; i < chain.length; i++) {
    const sb = chain[i].debts.find(d => d.id === 2);
    const ba = chain[i].debts.find(d => d.id === 1);
    if (sb && sb.paidOff && smallBCleared === null) smallBCleared = i;
    if (ba && ba.paidOff && bigACleared === null) bigACleared = i;
  }
  assert.ok(smallBCleared !== null, 'small debt should pay off');
  assert.ok(bigACleared === null || smallBCleared < bigACleared, 'snowball should clear smaller first');
});

test('buildChain: avalanche targets highest APR first', () => {
  const seed = {
    income: 5000, bills: [], debts: [
      { id: 1, name: 'HighAPR', type: 'cc', balance: 2000, apr: 30, payment: 100, color: '#f00' },
      { id: 2, name: 'LowAPR', type: 'cc', balance: 1000, apr: 10, payment: 50, color: '#0f0' }
    ], strategy: 'avalanche', keepPct: 0
  };
  const chain = buildChain(seed, {}, 36);
  let highCleared = null, lowCleared = null;
  for (let i = 1; i < chain.length; i++) {
    const h = chain[i].debts.find(d => d.id === 1);
    const l = chain[i].debts.find(d => d.id === 2);
    if (h && h.paidOff && highCleared === null) highCleared = i;
    if (l && l.paidOff && lowCleared === null) lowCleared = i;
  }
  assert.ok(highCleared !== null, 'high APR debt should pay off');
  assert.ok(lowCleared === null || highCleared < lowCleared, 'avalanche should clear high APR first');
});

test('buildChain: current strategy preserves user-set payments', () => {
  const seed = {
    income: 5000, bills: [], debts: [
      { id: 1, name: 'A', type: 'cc', balance: 100, apr: 0, payment: 200, color: '#f00' },
      { id: 2, name: 'B', type: 'cc', balance: 5000, apr: 24, payment: 100, color: '#0f0' }
    ], strategy: 'current', keepPct: 0
  };
  const chain = buildChain(seed, {}, 24);
  const m1 = chain[1];
  const a = m1.debts.find(d => d.id === 1);
  assert.ok(a.paidOff, 'A should be paid off in month 1');
  const m2 = chain[2];
  const bM2 = m2.debts.find(d => d.id === 2);
  assert.ok(Math.abs(bM2.payment - 100) < 0.01, 'B should still get $100 in current mode, got ' + bM2.payment);
});

// ─── buildChain: rollover ────────────────────────────────────────────────

test('buildChain: rollover delivers full payment slot to next month', () => {
  // Snowball targets lowest balance — clears A first, rollover goes to B
  const seed = {
    income: 5000, bills: [], debts: [
      { id: 1, name: 'A', type: 'cc', balance: 50, apr: 0, payment: 200, color: '#f00' },
      { id: 2, name: 'B', type: 'cc', balance: 3000, apr: 20, payment: 100, color: '#0f0' }
    ], strategy: 'snowball', keepPct: 0
  };
  const chain = buildChain(seed, {}, 36);
  const m1 = chain[1];
  const a = m1.debts.find(d => d.id === 1);
  assert.ok(a.paidOff, 'A should clear in month 1');
  const m2 = chain[2];
  const b = m2.debts.find(d => d.id === 2);
  assert.ok(b.payment > 100, 'B should get rollover in month 2, got ' + b.payment);
});

test('buildChain: keepPct reduces rollover', () => {
  const seedBase = {
    income: 5000, bills: [], debts: [
      { id: 1, name: 'A', type: 'cc', balance: 50, apr: 0, payment: 200, color: '#f00' },
      { id: 2, name: 'B', type: 'cc', balance: 3000, apr: 20, payment: 100, color: '#0f0' }
    ], strategy: 'snowball'
  };
  const chainFull = buildChain({ ...seedBase, keepPct: 0 }, {}, 36);
  const chainHalf = buildChain({ ...seedBase, keepPct: 50 }, {}, 36);
  const bFull = chainFull[2].debts.find(d => d.id === 2);
  const bHalf = chainHalf[2].debts.find(d => d.id === 2);
  assert.ok(bFull.payment > bHalf.payment, 'keepPct=0 should roll more than keepPct=50');
});

// ─── buildChain: overrides ───────────────────────────────────────────────

test('buildChain: overrides apply at the specified month and inherit forward', () => {
  const seed = {
    income: 5000, bills: [], debts: [
      { id: 1, name: 'X', type: 'cc', balance: 1000, apr: 0, payment: 100, color: '#f00' }
    ], strategy: 'current', keepPct: 0
  };
  const overrides = { 3: { income: 10000 } };
  const chain = buildChain(seed, overrides, 12);
  assert.equal(chain[2].income, 5000);
  assert.equal(chain[3].income, 10000);
  assert.equal(chain[4].income, 10000, 'override should inherit to month 4');
});

test('buildChain: extraIncome is one-time, does not inherit', () => {
  const seed = {
    income: 5000, bills: [], debts: [
      { id: 1, name: 'X', type: 'cc', balance: 1000, apr: 0, payment: 100, color: '#f00' }
    ], strategy: 'current', keepPct: 0
  };
  const overrides = { 3: { extraIncome: 2000 } };
  const chain = buildChain(seed, overrides, 12);
  assert.equal(chain[3].extraIncome, 2000);
  assert.equal(chain[4].extraIncome, 0, 'extraIncome should NOT inherit');
});

test('buildChain: surplus accounts for income + extraIncome - bills - debts', () => {
  const seed = {
    income: 5000, bills: [
      { id: 1, name: 'Rent', amount: 1500 }
    ], debts: [
      { id: 1, name: 'X', type: 'cc', balance: 1000, apr: 0, payment: 100, color: '#f00' }
    ], strategy: 'current', keepPct: 0
  };
  const chain = buildChain(seed, {}, 12);
  const m1 = chain[1];
  // 5000 - 1500 - 100 = 3400
  assert.equal(m1.surplus, 3400);
});
