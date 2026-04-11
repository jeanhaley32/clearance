'use strict';
// ─── DIARY (daily spending tracker) ──────────────────────────────────────

const DIARY_CATEGORIES = [
  { id: 'food', label: 'Food', icon: '🍽', color: 'var(--green)' },
  { id: 'essentials', label: 'Essentials', icon: '🏠', color: 'var(--accent)' },
  { id: 'lifestyle', label: 'Lifestyle', icon: '✨', color: 'var(--purple)' }
];

function diaryDateStr(d) {
  if (!d) d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function diaryToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDiaryEntry(amount, category, note) {
  if (amount <= 0) return null;
  const dateStr = diaryDateStr(diaryDate || diaryToday());
  const entry = {
    id: nextDiaryId++,
    date: dateStr,
    amount: amount,
    category: category,
    note: (note || '').trim().slice(0, 60)
  };
  diaryEntries.push(entry);
  markDirty();
  return entry;
}

function removeDiaryEntry(id) {
  const idx = diaryEntries.findIndex(function(e) { return e.id === id; });
  if (idx < 0) return null;
  const removed = diaryEntries[idx];
  diaryEntries.splice(idx, 1);
  markDirty();
  return removed;
}

function getEntriesForDate(dateStr) {
  return diaryEntries.filter(function(e) { return e.date === dateStr; });
}

function getEntriesForMonth(year, month) {
  const prefix = year + '-' + String(month + 1).padStart(2, '0');
  return diaryEntries.filter(function(e) { return e.date.startsWith(prefix); });
}

function getDaySpent(dateStr) {
  return getEntriesForDate(dateStr).reduce(function(s, e) { return s + e.amount; }, 0);
}

function getMonthSpentBefore(date) {
  // Sum all spending in the same month, on days before this date
  const year = date.getFullYear();
  const month = date.getMonth();
  const dayOfMonth = date.getDate();
  const entries = getEntriesForMonth(year, month);
  let total = 0;
  entries.forEach(function(e) {
    const eDay = parseInt(e.date.split('-')[2]);
    if (eDay < dayOfMonth) total += e.amount;
  });
  return total;
}

function getDailyBudget(date) {
  // Map date to chain month
  const start = getStartDate();
  const monthsDiff = (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth());

  if (monthsDiff < 0 || !chain || chain.length === 0) return 0;
  const chainMonth = Math.min(monthsDiff, chain.length - 1);
  const node = chain[chainMonth];
  if (!node) return 0;

  const monthSurplus = node.surplus;
  const daysInMo = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const dayOfMonth = date.getDate();

  // Spread the deficit: remaining budget / remaining days
  const spentBefore = getMonthSpentBefore(date);
  const remainingBudget = monthSurplus - spentBefore;
  const remainingDays = daysInMo - dayOfMonth + 1; // including today

  return remainingBudget / remainingDays;
}

function getMonthBudget(date) {
  const start = getStartDate();
  const monthsDiff = (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth());
  if (monthsDiff < 0 || !chain || chain.length === 0) return 0;
  const chainMonth = Math.min(monthsDiff, chain.length - 1);
  const node = chain[chainMonth];
  return node ? node.surplus : 0;
}

function getMonthCategoryTotals(date) {
  const entries = getEntriesForMonth(date.getFullYear(), date.getMonth());
  const totals = { food: 0, essentials: 0, lifestyle: 0 };
  entries.forEach(function(e) {
    if (totals[e.category] !== undefined) totals[e.category] += e.amount;
  });
  return totals;
}
