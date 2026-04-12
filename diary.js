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

function isSpendingCategory(cat) {
  // GOT entries are excluded from "spent" totals
  return cat !== 'got-savings' && cat !== 'got-budget';
}

function getDaySpent(dateStr) {
  // Spending = spend categories minus any 'got-budget' received today
  return getEntriesForDate(dateStr).reduce(function(s, e) {
    if (e.category === 'got-budget') return s - e.amount;
    if (e.category === 'got-savings') return s; // doesn't affect today's spent
    return s + e.amount;
  }, 0);
}

function getMonthSpentBefore(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const dayOfMonth = date.getDate();
  const entries = getEntriesForMonth(year, month);
  let total = 0;
  entries.forEach(function(e) {
    const eDay = parseInt(e.date.split('-')[2]);
    if (eDay >= dayOfMonth) return;
    if (e.category === 'got-savings') return; // doesn't offset spending
    if (e.category === 'got-budget') { total -= e.amount; return; }
    total += e.amount;
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

  // Spread the deficit: remaining budget / remaining days.
  // Leftover from underspending inflates today's budget — user is prompted
  // at month-end to decide where to direct the surplus (savings, extra debt
  // payment, roll forward) rather than blow it.
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

  // Budget + left (single number now, above numpad)
  const budget = getDailyBudget(date);
  const spent = getDaySpent(dateStr);
  const left = budget - spent;

  const hintEl = document.getElementById('diary-left-hint');
  if (hintEl) {
    const leftAbs = Math.abs(left);
    const prefix = left < 0 ? '-$' : '$';
    hintEl.textContent = prefix + leftAbs.toFixed(2) + ' left today';
    hintEl.style.color = left >= 0 ? 'var(--muted)' : 'var(--red)';
  }

  // Hide entry screen for future dates (can only view entries, not add)
  const entryScreen = document.getElementById('diary-entry-screen');
  if (entryScreen) entryScreen.style.display = isFuture ? 'none' : '';

  // Today strip text
  const entries = getEntriesForDate(dateStr);
  const total = entries.reduce(function(s,e){return s+e.amount;},0);
  const stripText = document.getElementById('diary-today-strip-text');
  if (stripText) {
    const label = isToday ? 'Today' : date.toLocaleDateString(undefined, {month:'short',day:'numeric'});
    stripText.textContent = label + ': ' + entries.length + ' · $' + total.toFixed(2);
  }

  // Entries list
  renderDiaryEntries(dateStr);

  // Month summary
  renderDiaryMonthSummary(date);

  // Desktop layout (if visible)
  renderDiaryDesktop(date, dateStr, budget, spent, left);
}

// ─── DESKTOP LAYOUT RENDER ──────────────────────────────────────────────────

function renderDiaryDesktop(date, dateStr, budget, spent, left) {
  const deskRoot = document.querySelector('.diary-desktop');
  if (!deskRoot) return;
  // Always render — CSS media query handles visibility. Cheap to update hidden DOM.

  // Date label
  const dateLabel = document.getElementById('desk-date-label');
  if (dateLabel) {
    const today = diaryToday();
    const isToday = diaryDateStr(today) === dateStr;
    const opts = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
    dateLabel.textContent = (isToday ? 'Today — ' : '') + date.toLocaleDateString(undefined, opts);
  }

  // HUD
  const bEl = document.getElementById('desk-budget');
  const sEl = document.getElementById('desk-spent');
  const lEl = document.getElementById('desk-left');
  if (bEl) bEl.textContent = '$' + Math.max(0, budget).toFixed(2);
  if (sEl) sEl.textContent = '$' + spent.toFixed(2);
  if (lEl) {
    lEl.textContent = (left < 0 ? '-' : '') + '$' + Math.abs(left).toFixed(2);
    lEl.className = 'desktop-hud-val ' + (left >= 0 ? 'green' : 'red');
  }

  // Recent entries (last 7 days, grouped by date, today first)
  renderDesktopEntries(date);

  // This week bars
  renderDesktopWeek(date);

  // Month totals
  renderDesktopMonth(date);

  // All time
  renderDesktopAllTime();

  // Entry strip — enable/disable categories based on amount
  syncDesktopEntryStrip();
}

function renderDesktopEntries(date) {
  const list = document.getElementById('desktop-entries-list');
  if (!list) return;
  list.innerHTML = '';

  // Collect entries for the last 7 days ending at the selected date
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(date);
    d.setDate(d.getDate() - i);
    const ds = diaryDateStr(d);
    const entries = getEntriesForDate(ds);
    if (entries.length > 0 || i === 0) {
      days.push({ date: d, dateStr: ds, entries: entries });
    }
  }

  if (days.every(function(d){return d.entries.length === 0;})) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-family:var(--mono);font-size:11px;color:var(--muted);padding:24px 0;text-align:center;';
    empty.textContent = 'no entries in the last 7 days';
    list.appendChild(empty);
    return;
  }

  const todayStr = diaryDateStr(diaryToday());

  days.forEach(function(d) {
    if (d.entries.length === 0 && d.dateStr !== todayStr) return;
    const group = document.createElement('div');
    group.className = 'desktop-day-group';

    const header = document.createElement('div');
    header.className = 'desktop-day-header' + (d.dateStr === todayStr ? ' today' : '');
    const label = d.dateStr === todayStr ? 'Today' : d.date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const dayTotal = d.entries.reduce(function(s,e){
      if (e.category === 'got-savings' || e.category === 'got-budget') return s;
      return s + e.amount;
    }, 0);
    header.innerHTML = '<span>' + label + '</span><span>$' + dayTotal.toFixed(2) + '</span>';
    group.appendChild(header);

    d.entries.forEach(function(e) {
      const isGot = e.category === 'got-savings' || e.category === 'got-budget';
      let icon, lbl, color, sign;
      if (isGot) {
        icon = e.category === 'got-savings' ? '💰' : '💵';
        lbl = e.category === 'got-savings' ? 'to savings' : 'to budget';
        color = 'var(--green)'; sign = '+';
      } else {
        const cat = DIARY_CATEGORIES.find(function(c){return c.id === e.category;}) || DIARY_CATEGORIES[0];
        icon = cat.icon; lbl = cat.label; color = cat.color; sign = '';
      }
      const row = document.createElement('div');
      row.className = 'desktop-entry';
      row.innerHTML =
        '<span class="diary-entry-icon">' + icon + '</span>' +
        '<span class="diary-entry-amount" style="' + (isGot ? 'color:var(--green);' : '') + '">' + sign + '$' + e.amount.toFixed(2) + '</span>' +
        '<span class="diary-entry-cat" style="color:' + color + ';">' + escHtml(lbl) + '</span>' +
        '<span class="diary-entry-note">' + escHtml(e.note || '') + '</span>' +
        '<button class="remove-btn" onclick="deleteDiaryEntry(' + e.id + ')" title="Delete">×</button>';
      group.appendChild(row);
    });

    list.appendChild(group);
  });
}

function renderDesktopWeek(date) {
  const container = document.getElementById('desk-week-bars');
  if (!container) return;
  container.innerHTML = '';

  const todayStr = diaryDateStr(diaryToday());
  const dailyBudget = getDailyBudget(date);
  const maxAmt = Math.max(dailyBudget * 1.2, 1);

  // Show last 7 days ending today (or selected date if in past)
  const endDate = new Date(date);
  for (let i = 6; i >= 0; i--) {
    const d = new Date(endDate);
    d.setDate(d.getDate() - i);
    const ds = diaryDateStr(d);
    const spent = getEntriesForDate(ds).reduce(function(s,e){
      if (e.category === 'got-savings') return s;
      if (e.category === 'got-budget') return s - e.amount;
      return s + e.amount;
    }, 0);
    const pct = Math.min(100, Math.max(0, (spent / maxAmt) * 100));
    const overBudget = spent > dailyBudget;
    const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short' });
    const isToday = ds === todayStr;

    const row = document.createElement('div');
    row.className = 'desk-week-row';
    row.innerHTML =
      '<span class="desk-week-day' + (isToday ? ' today' : '') + '">' + dayLabel + '</span>' +
      '<div class="desk-week-bar-track"><div class="desk-week-bar' + (overBudget ? ' over-budget' : '') + '" style="width:' + pct + '%;"></div></div>' +
      '<span class="desk-week-amount">$' + spent.toFixed(2) + '</span>';
    container.appendChild(row);
  }
}

function renderDesktopMonth(date) {
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const title = document.getElementById('desk-month-title');
  if (title) title.textContent = monthNames[date.getMonth()] + ' ' + date.getFullYear();

  const totals = getMonthCategoryTotals(date);
  const monthBudget = getMonthBudget(date);
  const monthSpent = (totals.food || 0) + (totals.essentials || 0) + (totals.lifestyle || 0);
  const pct = monthBudget > 0 ? Math.min(100, (monthSpent / monthBudget) * 100) : 0;

  const totalsEl = document.getElementById('desk-month-totals');
  if (totalsEl) {
    totalsEl.innerHTML = '';
    const maxCat = Math.max(totals.food || 0, totals.essentials || 0, totals.lifestyle || 0, 1);
    DIARY_CATEGORIES.forEach(function(cat) {
      const amt = totals[cat.id] || 0;
      const catPct = (amt / maxCat) * 100;
      const row = document.createElement('div');
      row.className = 'desktop-month-row';
      row.innerHTML =
        '<span class="cat-icon">' + cat.icon + '</span>' +
        '<span class="cat-label">' + cat.label + '</span>' +
        '<div class="cat-bar-track"><div class="cat-bar" style="width:' + catPct + '%;background:' + cat.color + ';"></div></div>' +
        '<span class="cat-amount">$' + amt.toFixed(0) + '</span>';
      totalsEl.appendChild(row);
    });
  }

  const bar = document.getElementById('desk-month-progress-bar');
  if (bar) {
    bar.style.width = pct + '%';
    bar.style.background = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--amber)' : 'var(--green)';
  }
  const label = document.getElementById('desk-month-progress-label');
  if (label) label.textContent = '$' + monthSpent.toFixed(0) + ' of $' + Math.max(0, monthBudget).toFixed(0) + ' (' + pct.toFixed(0) + '%)';
}

function renderDesktopAllTime() {
  const el = document.getElementById('desk-alltime');
  if (!el) return;
  // All-time net: sum of (daily budget - daily spent) for every day with entries
  if (!diaryEntries || diaryEntries.length === 0) {
    el.innerHTML = '<div class="sub">log entries to see trends</div>';
    return;
  }
  const uniqueDates = {};
  diaryEntries.forEach(function(e){ uniqueDates[e.date] = true; });
  const dates = Object.keys(uniqueDates).sort();
  let totalNet = 0;
  let dayCount = 0;
  dates.forEach(function(ds) {
    const parts = ds.split('-');
    const d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    const budget = getDailyBudget(d);
    const spent = getEntriesForDate(ds).reduce(function(s,e){
      if (e.category === 'got-savings') return s;
      if (e.category === 'got-budget') return s - e.amount;
      return s + e.amount;
    }, 0);
    totalNet += (budget - spent);
    dayCount++;
  });
  const avgPerDay = dayCount > 0 ? totalNet / dayCount : 0;
  const sign = totalNet >= 0 ? '+' : '-';
  const cls = totalNet >= 0 ? 'positive' : 'negative';
  el.innerHTML =
    '<div class="net ' + cls + '">' + sign + '$' + Math.abs(totalNet).toFixed(0) + '</div>' +
    '<div class="sub">' + (avgPerDay >= 0 ? '+' : '-') + '$' + Math.abs(avgPerDay).toFixed(2) + '/day avg · ' + dayCount + ' days tracked</div>';
}

function syncDesktopEntryStrip() {
  const input = document.getElementById('desk-amount');
  if (!input) return;
  const val = parseFloat(input.value);
  const enable = !isNaN(val) && val > 0;
  document.querySelectorAll('.entry-strip-cat').forEach(function(b){ b.disabled = !enable; });
}

function commitDesktopEntry(category) {
  const input = document.getElementById('desk-amount');
  if (!input) return;
  const amt = parseFloat(input.value);
  if (isNaN(amt) || amt <= 0) return;
  const entry = addDiaryEntry(amt, category, '');
  if (entry) {
    const cat = DIARY_CATEGORIES.find(function(c){return c.id === category;});
    const catLabel = cat ? (cat.icon + ' ' + cat.label.toLowerCase()) : category;
    if (typeof vibrate === 'function') vibrate(10);
    showUndoToast('✓ $' + amt.toFixed(2) + ' ' + catLabel, function() {
      removeDiaryEntry(entry.id);
      renderDiary();
    });
  }
  input.value = '';
  syncDesktopEntryStrip();
  renderDiary();
  input.focus();
}

// Wire up desktop entry strip once
(function(){
  const input = document.getElementById('desk-amount');
  if (!input) return;
  input.addEventListener('input', syncDesktopEntryStrip);
  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      // Default commit: Food
      e.preventDefault();
      commitDesktopEntry('food');
      return;
    }
    // F/L/E shortcuts when input has value
    const val = parseFloat(input.value);
    if (!isNaN(val) && val > 0) {
      const k = e.key.toLowerCase();
      if (k === 'f') { e.preventDefault(); commitDesktopEntry('food'); }
      else if (k === 'e') { e.preventDefault(); commitDesktopEntry('essentials'); }
      else if (k === 'l') { e.preventDefault(); commitDesktopEntry('lifestyle'); }
    }
  });
})();

// ─── NUMPAD-FIRST ENTRY ─────────────────────────────────────────────────────

let diaryAmountStr = '';

function diaryAmountValue() {
  const v = parseFloat(diaryAmountStr);
  return isNaN(v) ? 0 : v;
}

function updateDiaryAmountDisplay() {
  const el = document.getElementById('diary-amount-display');
  if (!el) return;
  const v = diaryAmountValue();
  if (!diaryAmountStr || v === 0) {
    el.textContent = '$0.00';
    el.classList.add('empty');
  } else {
    // Show what user has typed, preserving trailing decimals
    const parts = diaryAmountStr.split('.');
    const whole = parts[0] || '0';
    const dec = parts[1] !== undefined ? parts[1].slice(0,2) : null;
    el.textContent = '$' + (parseInt(whole)||0).toLocaleString() + (dec !== null ? '.' + dec.padEnd(2,'0') : '.00');
    el.classList.remove('empty');
  }
  // Enable/disable category buttons
  const commitBtns = document.querySelectorAll('#diary-commit-row .commit-btn');
  commitBtns.forEach(function(b){ b.disabled = v <= 0; });
}

function pressNumpad(key) {
  if (key === 'back') {
    diaryAmountStr = diaryAmountStr.slice(0, -1);
  } else if (key === '.') {
    if (!diaryAmountStr.includes('.')) {
      diaryAmountStr = (diaryAmountStr || '0') + '.';
    }
  } else {
    // digit
    if (diaryAmountStr.includes('.')) {
      const dec = diaryAmountStr.split('.')[1];
      if (dec && dec.length >= 2) return; // max 2 decimal places
    }
    // cap at $99.99 (hard-stop)
    const newStr = diaryAmountStr + key;
    const newVal = parseFloat(newStr);
    if (newVal > 99.99) {
      bounceAmount();
      return;
    }
    diaryAmountStr = newStr === '0' ? '' : newStr;
  }
  updateDiaryAmountDisplay();
}

function bounceAmount() {
  const el = document.getElementById('diary-amount-display');
  if (!el) return;
  el.classList.remove('bounce');
  void el.offsetWidth; // force reflow
  el.classList.add('bounce');
}

// Track last commit for debounce + undo
let lastCommitTime = 0;

function commitDiaryEntry(category) {
  const now = Date.now();
  if (now - lastCommitTime < 500) return; // debounce
  const amt = diaryAmountValue();
  if (amt <= 0) {
    bounceAmount();
    return;
  }
  lastCommitTime = now;
  const entry = addDiaryEntry(amt, category, '');
  if (entry) {
    const cat = DIARY_CATEGORIES.find(function(c){return c.id === category;});
    const catLabel = cat ? (cat.icon + ' ' + cat.label.toLowerCase()) : category;
    if (typeof vibrate === 'function') vibrate(10);
    showUndoToast('✓ $' + amt.toFixed(2) + ' ' + catLabel, function() {
      removeDiaryEntry(entry.id);
      renderDiary();
    });
  }
  diaryAmountStr = '';
  updateDiaryAmountDisplay();
  renderDiary();
}

function toggleDiaryEntries() {
  const panel = document.getElementById('diary-entries-panel');
  const caret = document.getElementById('diary-strip-caret');
  if (!panel) return;
  const isOpen = panel.classList.toggle('open');
  if (caret) caret.classList.toggle('open', isOpen);
}

// Swipe-to-commit on the amount display or numpad area
function attachDiarySwipe() {
  const area = document.getElementById('diary-entry-screen');
  if (!area || area.dataset.swipeBound) return;
  area.dataset.swipeBound = '1';
  let startX = 0, startY = 0, tracking = false;
  area.addEventListener('pointerdown', function(e) {
    // Don't start swipe on a button press
    if (e.target.closest('.numpad-btn') || e.target.closest('.commit-btn') || e.target.closest('.diary-got-fab') || e.target.closest('.diary-today-strip')) return;
    startX = e.clientX; startY = e.clientY; tracking = true;
  });
  area.addEventListener('pointerup', function(e) {
    if (!tracking) return;
    tracking = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    const threshold = Math.min(window.innerWidth, 400) * 0.25;
    if (absDx < threshold && absDy < threshold) return; // too short
    if (diaryAmountValue() <= 0) { bounceAmount(); return; }
    if (absDx > absDy) {
      if (dx < 0) commitDiaryEntry('food');        // swipe left → Food
      else commitDiaryEntry('essentials');          // swipe right → Essentials
    } else {
      if (dy < 0) commitDiaryEntry('lifestyle');    // swipe up → Lifestyle
      // swipe down does nothing (reserved for future GOT)
    }
  });
  area.addEventListener('pointercancel', function(){ tracking = false; });
}

// Numpad click delegation
(function(){
  const pad = document.getElementById('diary-numpad');
  if (pad) {
    pad.addEventListener('click', function(e) {
      const btn = e.target.closest('.numpad-btn');
      if (!btn) return;
      pressNumpad(btn.dataset.key);
    });
  }
  attachDiarySwipe();
  updateDiaryAmountDisplay();
})();

// ─── GOT MODAL ──────────────────────────────────────────────────────────────
function openGotModal() {
  document.getElementById('got-amount').value = '';
  document.getElementById('got-note').value = '';
  document.getElementById('modal-got').classList.add('open');
  setTimeout(function(){ document.getElementById('got-amount').focus(); }, 50);
}

function commitGot(destination) {
  const amt = parseFloat(document.getElementById('got-amount').value);
  if (isNaN(amt) || amt <= 0) {
    showToast('Enter an amount', 'error');
    return;
  }
  const note = document.getElementById('got-note').value.trim().slice(0, 60);
  const cat = destination === 'savings' ? 'got-savings' : 'got-budget';
  // Use a manual entry push (addDiaryEntry rejects <=0 but we can add directly)
  const dateStr = diaryDateStr(diaryDate || diaryToday());
  const entry = {
    id: nextDiaryId++,
    date: dateStr,
    amount: amt,
    category: cat,
    note: note
  };
  diaryEntries.push(entry);
  markDirty();
  if (typeof vibrate === 'function') vibrate(10);
  showToast('✓ Received $' + amt.toFixed(2) + ' → ' + (destination === 'savings' ? 'savings' : 'today\'s budget'), 'success');
  closeModal('modal-got');
  renderDiary();
}

function renderDiaryEntries(dateStr) {
  const list = document.getElementById('diary-entries-list');
  list.innerHTML = '';
  const entries = getEntriesForDate(dateStr);
  const countEl = document.getElementById('diary-today-count');
  if (countEl) {
    if (entries.length === 0) {
      countEl.textContent = '';
    } else {
      const total = entries.reduce(function(s,e){return s+e.amount;},0);
      countEl.textContent = entries.length + (entries.length === 1 ? ' entry' : ' entries') + ' · $' + total.toFixed(2);
    }
  }

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-family:var(--mono);font-size:11px;color:var(--muted);padding:20px 0;text-align:center;';
    empty.textContent = 'no spending logged';
    list.appendChild(empty);
    return;
  }

  entries.forEach(function(e) {
    const isGot = e.category === 'got-savings' || e.category === 'got-budget';
    let icon, label, color, sign;
    if (isGot) {
      icon = e.category === 'got-savings' ? '💰' : '💵';
      label = e.category === 'got-savings' ? 'to savings' : 'to budget';
      color = 'var(--green)';
      sign = '+';
    } else {
      const cat = DIARY_CATEGORIES.find(function(c) { return c.id === e.category; }) || DIARY_CATEGORIES[0];
      icon = cat.icon; label = cat.label; color = cat.color; sign = '';
    }
    const div = document.createElement('div');
    div.className = 'diary-entry';
    div.dataset.entryId = e.id;
    div.innerHTML =
      '<div class="diary-entry-swipe-action">delete</div>' +
      '<div class="diary-entry-content">' +
        '<span class="diary-entry-icon">' + icon + '</span>' +
        '<span class="diary-entry-amount" style="' + (isGot ? 'color:var(--green);' : '') + '">' + sign + '$' + e.amount.toFixed(2) + '</span>' +
        '<span class="diary-entry-cat" style="color:' + color + ';">' + escHtml(label) + '</span>' +
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
