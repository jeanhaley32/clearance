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

// ─── RENDERING ──────────────────────────────────────────────────────────────

function renderDiary() {
  const date = diaryDate || diaryToday();
  const dateStr = diaryDateStr(date);
  const today = diaryToday();
  const isToday = diaryDateStr(today) === dateStr;
  const isFuture = date > today;

  // Date label
  const dateLabel = document.getElementById('diary-date-label');
  const opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
  dateLabel.textContent = (isToday ? 'Today — ' : '') + date.toLocaleDateString(undefined, opts);

  // Budget
  const budget = getDailyBudget(date);
  const spent = getDaySpent(dateStr);
  const left = budget - spent;

  document.getElementById('diary-budget').textContent = '$' + Math.max(0, budget).toFixed(2);
  document.getElementById('diary-spent').textContent = '$' + spent.toFixed(2);
  const leftEl = document.getElementById('diary-left');
  leftEl.textContent = (left < 0 ? '-' : '') + '$' + Math.abs(left).toFixed(2);
  leftEl.className = 'diary-hero-val ' + (left >= 0 ? 'green' : 'red');

  // Show/hide add section for future dates
  document.getElementById('diary-add-section').style.display = isFuture ? 'none' : '';

  // Entries list
  renderDiaryEntries(dateStr);

  // Month summary
  renderDiaryMonthSummary(date);
}

function renderDiaryEntries(dateStr) {
  const list = document.getElementById('diary-entries-list');
  list.innerHTML = '';
  const entries = getEntriesForDate(dateStr);

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-family:var(--mono);font-size:11px;color:var(--muted);padding:12px 0;text-align:center;';
    empty.textContent = 'no spending logged';
    list.appendChild(empty);
    return;
  }

  entries.forEach(function(e) {
    const cat = DIARY_CATEGORIES.find(function(c) { return c.id === e.category; }) || DIARY_CATEGORIES[0];
    const div = document.createElement('div');
    div.className = 'diary-entry';
    div.dataset.entryId = e.id;
    div.innerHTML =
      '<div class="diary-entry-swipe-action">delete</div>' +
      '<div class="diary-entry-content">' +
        '<span class="diary-entry-icon">' + cat.icon + '</span>' +
        '<span class="diary-entry-amount">$' + e.amount.toFixed(2) + '</span>' +
        '<span class="diary-entry-cat" style="color:' + cat.color + ';">' + cat.label + '</span>' +
        '<span class="diary-entry-note">' + escHtml(e.note || '') + '</span>' +
        '<button class="remove-btn" onclick="deleteDiaryEntry(' + e.id + ')" title="Delete">×</button>' +
      '</div>';
    list.appendChild(div);
    attachSwipeHandler(div, e.id);
  });
}

function attachSwipeHandler(entryEl, entryId) {
  const content = entryEl.querySelector('.diary-entry-content');
  if (!content) return;

  let startX = 0;
  let currentX = 0;
  let dragging = false;
  const threshold = 80;

  function onDown(e) {
    const pt = e.touches ? e.touches[0] : e;
    startX = pt.clientX;
    currentX = 0;
    dragging = true;
    content.style.transition = 'none';
  }

  function onMove(e) {
    if (!dragging) return;
    const pt = e.touches ? e.touches[0] : e;
    const dx = pt.clientX - startX;
    if (dx > 0) { currentX = 0; content.style.transform = ''; return; } // only left swipe
    currentX = Math.max(dx, -120);
    content.style.transform = 'translateX(' + currentX + 'px)';
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    content.style.transition = 'transform 0.15s';
    if (currentX < -threshold) {
      // Commit delete
      content.style.transform = 'translateX(-100%)';
      if (typeof vibrate === 'function') vibrate([20, 40, 20]);
      setTimeout(function() { deleteDiaryEntry(entryId); }, 150);
    } else {
      content.style.transform = '';
    }
  }

  function onCancel() {
    if (!dragging) return;
    dragging = false;
    content.style.transition = 'transform 0.15s';
    content.style.transform = '';
  }

  content.addEventListener('pointerdown', onDown);
  content.addEventListener('pointermove', onMove);
  content.addEventListener('pointerup', onUp);
  content.addEventListener('pointercancel', onCancel);
}

function renderDiaryMonthSummary(date) {
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  document.getElementById('diary-month-title').textContent = monthNames[date.getMonth()] + ' ' + date.getFullYear();

  const totals = getMonthCategoryTotals(date);
  const catTotalsEl = document.getElementById('diary-cat-totals');
  catTotalsEl.innerHTML = '';
  DIARY_CATEGORIES.forEach(function(cat) {
    const div = document.createElement('div');
    div.className = 'diary-cat-total';
    div.innerHTML =
      '<div class="cat-icon">' + cat.icon + '</div>' +
      '<div class="cat-amount" style="color:' + cat.color + ';">$' + (totals[cat.id] || 0).toFixed(0) + '</div>';
    catTotalsEl.appendChild(div);
  });

  const monthBudget = getMonthBudget(date);
  const monthSpent = (totals.food || 0) + (totals.essentials || 0) + (totals.lifestyle || 0);
  const pct = monthBudget > 0 ? Math.min(100, (monthSpent / monthBudget) * 100) : 0;

  const bar = document.getElementById('diary-progress-bar');
  bar.style.width = pct + '%';
  bar.style.background = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--amber)' : 'var(--green)';

  document.getElementById('diary-progress-label').textContent =
    '$' + monthSpent.toFixed(0) + ' of $' + Math.max(0, monthBudget).toFixed(0) + ' (' + pct.toFixed(0) + '%)';
}

// ─── DATE NAVIGATION ────────────────────────────────────────────────────────

function diaryPrevDay() {
  if (!diaryDate) diaryDate = diaryToday();
  diaryDate = new Date(diaryDate);
  diaryDate.setDate(diaryDate.getDate() - 1);
  renderDiary();
}

function diaryNextDay() {
  if (!diaryDate) diaryDate = diaryToday();
  diaryDate = new Date(diaryDate);
  diaryDate.setDate(diaryDate.getDate() + 1);
  renderDiary();
}

function diaryGoToday() {
  diaryDate = diaryToday();
  renderDiary();
}

// ─── QUICK-ADD ──────────────────────────────────────────────────────────────

function diaryAddEntry(category) {
  const input = document.getElementById('diary-amount');
  const amount = parseFloat(input.value);
  if (!amount || amount <= 0) {
    input.focus();
    return;
  }
  const noteInput = document.getElementById('diary-note');
  const note = noteInput.value.trim();

  const entry = addDiaryEntry(amount, category, note);
  if (entry) {
    const cat = DIARY_CATEGORIES.find(function(c) { return c.id === category; });
    showToast('$' + amount.toFixed(2) + ' ' + (cat ? cat.icon : '') + ' ' + category, 'success');
    if (typeof vibrate === 'function') vibrate(10);
  }

  // Reset form
  input.value = '';
  noteInput.value = '';
  noteInput.style.display = 'none';
  document.getElementById('diary-note-toggle').textContent = '+ add note';
  input.focus();

  renderDiary();
}

function toggleDiaryNote() {
  const noteInput = document.getElementById('diary-note');
  const toggle = document.getElementById('diary-note-toggle');
  if (noteInput.style.display === 'none' || !noteInput.style.display) {
    noteInput.style.display = 'block';
    toggle.textContent = '− hide note';
    noteInput.focus();
  } else {
    noteInput.style.display = 'none';
    toggle.textContent = '+ add note';
  }
}

// ─── ENTRY DELETION WITH UNDO ───────────────────────────────────────────────

function deleteDiaryEntry(id) {
  const removed = removeDiaryEntry(id);
  if (removed) {
    renderDiary();
    showUndoToast('Removed $' + removed.amount.toFixed(2) + ' ' + removed.category, function() {
      diaryEntries.push(removed);
      markDirty();
      renderDiary();
    });
  }
}

// ─── KEYBOARD SUPPORT ───────────────────────────────────────────────────────

(function() {
  if (typeof document === 'undefined') return;
  const amountInput = document.getElementById('diary-amount');
  if (amountInput) {
    amountInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const firstCat = document.querySelector('.diary-cat-btn');
        if (firstCat) firstCat.focus();
      }
    });
  }
})();

if (typeof module !== 'undefined') {
  module.exports = {
    DIARY_CATEGORIES,
    diaryDateStr,
    diaryToday,
    getEntriesForDate,
    getEntriesForMonth,
    getDaySpent,
    getMonthSpentBefore,
    getDailyBudget,
    getMonthBudget,
    getMonthCategoryTotals
  };
}
