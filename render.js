'use strict';
// ─── RENDER (DOM rendering, chart, breakdown) ─────────────────────────────

// ─── RENDER BILLS ────────────────────────────────────────────────────────────
function renderBills(){
  const list=document.getElementById('bills-list');
  list.innerHTML='';
  let total=0;
  bills.forEach(function(b){
    total+=b.amount;
    const div=document.createElement('div');
    div.className='bill-item';
    // dropoff control: if set, show editable tag; if not, show subtle + button
    let dropoffHtml;
    if(b.dropoff){
      dropoffHtml=
        '<span class="dropoff-tag dropoff-editing" title="Click to change or clear dropoff month">'+
          '<span style="opacity:0.6">↓m</span>'+
          '<input class="dropoff-inline" type="number" inputmode="numeric" value="'+b.dropoff+'" min="1" max="360" title="Drops off at this month" '+
            'data-bill-id="'+b.id+'" '+
            'oninput="updateBillDropoff('+b.id+',this.value)" '+
            'onblur="cleanBillDropoff('+b.id+',this)">'+
          '<button class="dropoff-clear" onclick="clearBillDropoff('+b.id+')" title="Remove dropoff">×</button>'+
        '</span>';
    } else {
      dropoffHtml='<button class="dropoff-add" onclick="addBillDropoff('+b.id+')" title="Set a month this bill drops off">↓</button>';
    }
    div.innerHTML=
      '<input class="bill-name" type="text" value="'+escHtml(b.name)+'" placeholder="Bill name" oninput="updateBillName('+b.id+',this.value)">'+
      dropoffHtml+
      '<input class="bill-amount" type="number" inputmode="decimal" value="'+b.amount+'" min="0" step="0.01" oninput="updateBillAmount('+b.id+',this.value)">'+
      '<button class="remove-btn" onclick="removeBill('+b.id+')">×</button>';
    list.appendChild(div);
  });
  document.getElementById('bills-total').textContent=fmt(total)+'/mo';
}
function updateBillName(id,val){const b=bills.find(function(x){return x.id===id;});if(b){b.name=val;markDirty();}}
function updateBillAmount(id,val){const b=bills.find(function(x){return x.id===id;});if(b){b.amount=clampPositive(val);markDirty();debouncedRecalc();}}
function updateBillDropoff(id,val){const b=bills.find(function(x){return x.id===id;});if(b){const n=parseInt(val);b.dropoff=n>0?n:null;markDirty();debouncedRecalc();}}
function cleanBillDropoff(id,input){const b=bills.find(function(x){return x.id===id;});if(b&&(!input.value||parseInt(input.value)<1)){b.dropoff=null;renderBills();recalc();markDirty();}}
function clearBillDropoff(id){const b=bills.find(function(x){return x.id===id;});if(b){b.dropoff=null;renderBills();recalc();markDirty();}}
function addBillDropoff(id){
  const b=bills.find(function(x){return x.id===id;});
  if(b){b.dropoff=1;renderBills();recalc();markDirty();
    const inp=document.querySelector('.dropoff-inline[data-bill-id="'+id+'"]');
    if(inp){inp.select();}
  }
}
function removeBill(id){
  const idx=bills.findIndex(function(b){return b.id===id;});
  if(idx<0)return;
  const removed=bills[idx];
  bills.splice(idx,1);
  renderBills();recalc();markDirty();
  showUndoToast('Removed "'+removed.name+'"',function(){bills.splice(idx,0,removed);renderBills();recalc();markDirty();});
}

// ─── RENDER DEBTS ────────────────────────────────────────────────────────────
function renderDebts(){
  const list=document.getElementById('debts-list');
  list.innerHTML='';
  let total=0;
  debts.forEach(function(d){
    total+=d.balance;
    const typeLabel=d.type==='cc'?'CC':d.type==='friend'?'0%':'Loan';
    const badgeClass=d.type==='cc'?'badge-cc':d.type==='friend'?'badge-friend':'badge-loan';
    const div=document.createElement('div');
    div.className='debt-item';
    const hasFocus=Object.keys(debtFocused).length>0;
    const isFocused=!!debtFocused[d.id];
    const dimmed=hasFocus&&!isFocused;
    div.style.opacity=dimmed?'0.4':'1';
    div.style.transition='opacity 0.15s';
    div.innerHTML=
      '<div class="debt-item-header">'+
        '<div onclick="toggleDebtFocus('+d.id+',event)" title="Click to focus on chart" style="width:12px;height:12px;border-radius:50%;background:'+safeColor(d.color)+';flex-shrink:0;cursor:pointer;border:2px solid '+(isFocused?'white':'transparent')+';transition:border-color 0.15s;"></div>'+
        '<input class="debt-name" type="text" value="'+escHtml(d.name)+'" placeholder="Account name" oninput="updateDebtField('+d.id+',\'name\',this.value)">'+
        '<span class="debt-type-badge '+badgeClass+'">'+typeLabel+'</span>'+
        '<button class="remove-btn" onclick="removeDebt('+d.id+')">×</button>'+
      '</div>'+
      '<div class="debt-fields">'+
        '<div class="debt-field"><label>Balance ($)</label><input type="number" inputmode="decimal" value="'+d.balance+'" min="0" step="0.01" oninput="updateDebtField('+d.id+',\'balance\',+this.value)"></div>'+
        '<div class="debt-field"><label>APR (%)</label><input type="number" inputmode="decimal" value="'+d.apr+'" min="0" max="100" step="0.1" '+(d.type==='friend'?'disabled':'')+' oninput="updateDebtField('+d.id+',\'apr\',+this.value)"></div>'+
        '<div class="debt-field full"><label>Monthly payment ($)</label><input type="number" inputmode="decimal" value="'+d.payment+'" min="0" step="0.01" oninput="updateDebtField('+d.id+',\'payment\',+this.value)">'+
        (d.type==='cc'&&d.balance>0?'<div id="min-hint-'+d.id+'" style="font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:2px;">min: '+fmt(calcMinPayment(d.balance,d.apr,d.type))+'</div>':'')+
        '</div>'+
      '</div>';
    list.appendChild(div);
  });
  document.getElementById('debts-total').textContent=fmt(total)+' total';
  const focusCb=document.getElementById('focus-all-cb');
  if(focusCb)focusCb.checked=Object.keys(debtFocused).length===0;
}
function toggleFocusAll(checked){
  if(checked){debtFocused={};}
  else{debtFocused={};debts.forEach(function(d){debtFocused[d.id]=true;});}
  // If unchecked with all selected, that's the same as all — clear it
  if(!checked&&Object.keys(debtFocused).length===debts.length){debtFocused={};}
  renderDebts();renderChart();renderBreakdown();
}
function toggleDebtFocus(id,evt){
  if(evt&&evt.shiftKey){
    // Shift-click: toggle this debt in/out of focus set
    if(debtFocused[id])delete debtFocused[id];
    else debtFocused[id]=true;
  }else{
    // Regular click: solo this debt, or clear if already solo
    if(debtFocused[id]&&Object.keys(debtFocused).length===1){
      debtFocused={};
    }else{
      debtFocused={};
      debtFocused[id]=true;
    }
  }
  renderDebts();
  renderChart();
  renderBreakdown();
}
function updateDebtField(id,field,val){
  if(['name','balance','apr','payment'].indexOf(field)<0)return;
  const d=debts.find(function(x){return x.id===id;});
  if(!d)return;
  if(field==='name')d.name=val;
  else if(field==='apr')d.apr=clampApr(val);
  else d[field]=clampPositive(val);
  if((field==='balance'||field==='apr')&&d.type==='cc'){
    const hint=document.getElementById('min-hint-'+id);
    if(hint)hint.textContent='min: '+fmt(calcMinPayment(d.balance,d.apr,d.type));
  }
  markDirty();debouncedRecalc();
}
function removeDebt(id){
  const idx=debts.findIndex(function(d){return d.id===id;});
  if(idx<0)return;
  const removed=debts[idx];
  debts.splice(idx,1);
  renderDebts();recalc();markDirty();
  showUndoToast('Removed "'+removed.name+'"',function(){debts.splice(idx,0,removed);renderDebts();recalc();markDirty();});
}


// ─── RECALC ──────────────────────────────────────────────────────────────────
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
  const focusActive = Object.keys(debtFocused).length > 0;
  const focusDebts = focusActive ? debts.filter(function(d){return !!debtFocused[d.id];}) : debts;
  document.getElementById('h-income').textContent = fmt(inc);
  const totalBillsNow = chain[0].totalBills;
  document.getElementById('h-bills').textContent = fmt(totalBillsNow);
  document.getElementById('h-debt').textContent = fmt(focusDebts.reduce(function(s, d) { return s + d.balance; }, 0));

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

  document.getElementById('proj-month-label').textContent = fmtDate(projMonth);

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
    if (hasEvent) {
      div.title = dropoffEvents[m].join(', ') + ' drops off at month ' + m;
    }
    div.innerHTML = '<div class="proj-tick-line"></div><span>' + m + '</span>';
    ticksEl.style.position = 'relative';
    ticksEl.style.height = '14px';
    ticksEl.appendChild(div);
  });

  const oldDropLegend = document.getElementById('dropoff-legend');
  if (oldDropLegend) oldDropLegend.remove();
  if (Object.keys(dropoffEvents).length > 0) {
    const legendDiv = document.createElement('div');
    legendDiv.id = 'dropoff-legend';
    legendDiv.style.cssText = 'font-family:var(--mono);font-size:8px;color:var(--amber);opacity:0.5;margin-top:2px;';
    legendDiv.textContent = '\u25cf = bill drops off';
    ticksEl.parentElement.appendChild(legendDiv);
  }

  // Hero values
  const nowFree = nowNode.surplus;
  const projFree = projNode.surplus;
  const droppedByProj = bills.filter(function(b) { return b.dropoff && b.dropoff <= projMonth; }).map(function(b) { return b.name; });
  const subText = droppedByProj.length > 0 ? droppedByProj.join(', ') + ' dropped' : projMonth === 1 ? 'no bills dropped yet' : 'no bills drop by month ' + projMonth;

  document.getElementById('d-now').textContent = '$' + Math.max(0, nowFree / daysInMonth(0)).toFixed(2);
  document.getElementById('d-soon').textContent = '$' + Math.max(0, projFree / daysInMonth(projMonth)).toFixed(2);
  document.getElementById('d-now-sub').textContent = fmt(Math.max(0, nowFree)) + '/mo free right now';
  document.getElementById('d-soon-sub').textContent = subText;
  document.getElementById('d-surplus').textContent = fmt(Math.max(0, nowFree));
  document.getElementById('d-surplus-sub').textContent = 'after all bills + debt payments';
  document.getElementById('proj-surplus-label').textContent = fmtDate(projMonth);
  document.getElementById('d-surplus-proj').textContent = fmt(Math.max(0, projFree));
  const surplusDelta = projFree - nowFree;
  const deltaStr = (surplusDelta >= 0 ? '+' : '') + fmt(Math.abs(surplusDelta)) + (surplusDelta >= 0 ? ' more' : ' less') + ' than now';
  document.getElementById('d-surplus-proj-sub').textContent = surplusDelta === 0 ? 'no change from now' : deltaStr;
  document.getElementById('d-surplus-proj').style.color = projFree >= nowFree ? 'var(--green)' : 'var(--red)';
  document.getElementById('m-bills-soon').textContent = fmt(projNode.totalBills) + '/mo';

  // Warning bar — check for unpayable debts across chain
  const unpayableNames = [];
  chain.forEach(function(node) {
    node.debts.forEach(function(d) {
      if (!d.payable && d.balanceStart > 0.005 && unpayableNames.indexOf(d.name) === -1) {
        unpayableNames.push(d.name);
      }
    });
  });
  const warnBar = document.getElementById('warn-bar');
  if (unpayableNames.length > 0) {
    warnBar.textContent = 'Payment too low to cover interest on ' + unpayableNames.join(', ') + ' \u2014 increase monthly payments.';
    warnBar.style.display = 'block';
  } else {
    warnBar.style.display = 'none';
  }

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

  // Find payoff month per debt and compute totals — scoped to focused debts
  const lastNode = chain[maxMonth];
  const focusIds = focusActive ? focusDebts.map(function(d){return d.id;}) : null;

  // Per-debt payoff month (latest among focused debts)
  let clearedMonth = 0;
  let allCleared = true;
  let totalInterest = 0;
  let totalPaidOut = 0;
  let totalDebtPayment = 0;

  focusDebts.forEach(function(d) {
    let debtPayoff = null;
    let debtInterest = 0;
    let debtPaid = 0;
    for (let i = 1; i < chain.length; i++) {
      const cd = chain[i].debts.find(function(x) { return x.id === d.id; });
      if (cd) {
        debtInterest += cd.interest;
        debtPaid += cd.payment;
        if (cd.paidOff && debtPayoff === null) debtPayoff = i;
      }
    }
    if (debtPayoff !== null) {
      if (debtPayoff > clearedMonth) clearedMonth = debtPayoff;
    } else {
      allCleared = false;
    }
    totalInterest += debtInterest;
    totalPaidOut += debtPaid;
  });

  if (!allCleared) clearedMonth = null;
  if (chain[1]) {
    focusDebts.forEach(function(d) {
      const cd = chain[1].debts.find(function(x) { return x.id === d.id; });
      if (cd) totalDebtPayment += cd.payment;
    });
  }

  // Strategy comparison deltas
  let deltaMonths = null;
  let deltaInterest = null;
  if (strategy !== 'current') {
    const baselineSeed = { income: inc, bills: bills, debts: debts, strategy: 'current', keepPct: 0 };
    const baselineChain = buildChain(baselineSeed, overrides, 600);
    // Compute baseline totals for same focused debts
    let baseCleared = 0;
    let baseAllCleared = true;
    let baseTotalInterest = 0;
    focusDebts.forEach(function(d) {
      let payoff = null;
      let interest = 0;
      for (let i = 1; i < baselineChain.length; i++) {
        const cd = baselineChain[i].debts.find(function(x) { return x.id === d.id; });
        if (cd) {
          interest += cd.interest;
          if (cd.paidOff && payoff === null) payoff = i;
        }
      }
      if (payoff !== null) { if (payoff > baseCleared) baseCleared = payoff; }
      else baseAllCleared = false;
      baseTotalInterest += interest;
    });
    if (baseAllCleared && allCleared) deltaMonths = baseCleared - clearedMonth;
    deltaInterest = baseTotalInterest - totalInterest;
  }

  const focusLabel = focusActive ? ' <span style="color:var(--accent);font-size:9px;opacity:0.6;">(' + focusDebts.map(function(d){return escHtml(d.name);}).join(', ') + ')</span>' : '';
  document.getElementById('m-cleared').innerHTML = fmtMo(clearedMonth || maxMonth) +
    (deltaMonths !== null && deltaMonths > 0 ? ' <span style="color:var(--green);font-size:12px;">(-' + deltaMonths + 'mo vs current)</span>' : '');
  document.getElementById('m-interest').innerHTML = fmt(totalInterest) +
    (deltaInterest !== null && deltaInterest > 0 ? ' <span style="color:var(--green);font-size:12px;">(-' + fmt(deltaInterest) + ' saved)</span>' : '');
  document.getElementById('m-total-paid').textContent = fmt(totalPaidOut);
  document.getElementById('m-monthly-debt').innerHTML = fmt(totalDebtPayment) + focusLabel;

  // Breakdown panel
  renderBreakdown();

  // Chart
  renderChart();

  updateExportIndicator();
}

function updateProjection() {
  if (chain.length < 2) return;
  const maxMonth = chain.length - 1;
  const projMonth = Math.min(parseInt(document.getElementById('proj-month').value) || 6, maxMonth);
  const projNode = chain[projMonth] || chain[maxMonth];
  const nowNode = chain[0];
  const nowFree = nowNode.surplus;
  const projFree = projNode.surplus;

  document.getElementById('proj-month-label').textContent = fmtDate(projMonth);
  const droppedByProj = bills.filter(function(b) { return b.dropoff && b.dropoff <= projMonth; }).map(function(b) { return b.name; });
  const subText = droppedByProj.length > 0 ? droppedByProj.join(', ') + ' dropped' : projMonth === 1 ? 'no bills dropped yet' : 'no bills drop by month ' + projMonth;

  document.getElementById('d-soon').textContent = '$' + Math.max(0, projFree / daysInMonth(projMonth)).toFixed(2);
  document.getElementById('d-soon-sub').textContent = subText;
  document.getElementById('proj-surplus-label').textContent = fmtDate(projMonth);
  document.getElementById('d-surplus-proj').textContent = fmt(Math.max(0, projFree));
  const surplusDelta = projFree - nowFree;
  const deltaStr = (surplusDelta >= 0 ? '+' : '') + fmt(Math.abs(surplusDelta)) + (surplusDelta >= 0 ? ' more' : ' less') + ' than now';
  document.getElementById('d-surplus-proj-sub').textContent = surplusDelta === 0 ? 'no change from now' : deltaStr;
  document.getElementById('d-surplus-proj').style.color = projFree >= nowFree ? 'var(--green)' : 'var(--red)';
  document.getElementById('m-bills-soon').textContent = fmt(projNode.totalBills) + '/mo';
}

function renderBreakdown() {
  const blist = document.getElementById('breakdown-list');
  const bpTitle = document.querySelector('.bp-title');
  blist.innerHTML = '';
  const hasFocusB = Object.keys(debtFocused).length > 0;

  if (detailMonth !== null && chain[detailMonth]) {
    // Month detail mode
    const node = chain[detailMonth];
    bpTitle.innerHTML = '<span style="cursor:pointer;" onclick="detailMonth=null;renderBreakdown();">&larr; </span>Month ' + detailMonth + ' of ' + (chain.length - 1);

    // Contextual date
    const contextDiv = document.createElement('div');
    contextDiv.style.cssText = 'font-family:var(--mono);font-size:10px;color:var(--muted);margin-bottom:10px;line-height:1.6;';
    const dateEst = new Date();
    dateEst.setMonth(dateEst.getMonth() + detailMonth);
    const monthName = dateEst.toLocaleDateString(undefined, {month:'short', year:'numeric'});
    contextDiv.textContent = 'Projected snapshot for ~' + monthName;
    blist.appendChild(contextDiv);

    // Extra income display
    const ovr = overrides[detailMonth] || {};
    if (ovr.extraIncome && ovr.extraIncome > 0) {
      const extraDiv = document.createElement('div');
      extraDiv.className = 'extra-income-line';
      extraDiv.textContent = '+ ' + fmt(ovr.extraIncome) + (ovr.extraNote ? ' — ' + ovr.extraNote : ' extra income');
      extraDiv.title = 'Click to edit in month options';
      extraDiv.onclick = function() { openMonthEdit(detailMonth); };
      blist.appendChild(extraDiv);
    }

    // Debt cards with inline-editable payments
    let firstEditableHinted = false;
    const detailDebts = hasFocusB ? node.debts.filter(function(d){return !!debtFocused[d.id];}) : node.debts;
    detailDebts.forEach(function(d) {
      if (d.balanceStart <= 0 && !d.paidOff) return; // skip long-dead debts
      const card = document.createElement('div');
      card.className = 'debt-summary-card';
      if (!d.payable) card.style.borderColor = 'var(--red)';
      if (d.paidOff) card.style.borderColor = 'var(--green)';
      const debt = debts.find(function(x) { return x.id === d.id; });
      const debtColor = safeColor(debt ? debt.color : '#00e5ff');

      // Check if this payment has an override
      const hasPaymentOverride = ovr.debts && ovr.debts[d.id] && ovr.debts[d.id].payment !== undefined;

      // Build card content
      card.innerHTML =
        '<div class="dsc-name"><span>' + escHtml(d.name) + '</span><span style="font-family:var(--mono);font-size:11px;color:' + debtColor + ';">' + d.apr + '%</span></div>' +
        '<div class="dsc-row"><span>Balance</span><span>' + (d.paidOff ? '<span style="color:var(--green)">paid off</span>' : fmt(d.balanceEnd)) + '</span></div>' +
        '<div class="dsc-row dsc-payment-row" data-debt-id="' + d.id + '"></div>' +
        '<div class="dsc-row"><span>Interest</span><span class="warn-val">' + fmt(d.interest) + '</span></div>' +
        (d.paidOff ? '<div class="dsc-row"><span>Rollover</span><span class="good">' + fmt(d.paymentSlot) + ' freed</span></div>' : '');

      // Build the interactive payment row
      const payRow = card.querySelector('.dsc-payment-row');
      if (payRow && !d.paidOff) {
        const label = document.createElement('span');
        label.textContent = 'Payment';
        payRow.appendChild(label);

        const valWrap = document.createElement('span');

        const valSpan = document.createElement('span');
        valSpan.className = 'dsc-val-editable' + (hasPaymentOverride ? ' overridden' : '');
        valSpan.textContent = fmt(d.payment);
        valSpan.title = 'Click to adjust payment';
        valSpan.onclick = function() {
          // Replace with inline edit
          valWrap.innerHTML = '';
          const editWrap = document.createElement('span');
          editWrap.className = 'dsc-inline-edit';
          const inp = document.createElement('input');
          inp.className = 'dsc-inline-input';
          inp.type = 'number';
          inp.inputMode = 'decimal';
          inp.min = '0';
          inp.step = '0.01';
          inp.value = d.payment.toFixed(2);
          const actions = document.createElement('span');
          actions.className = 'dsc-inline-actions';
          const confirmBtn = document.createElement('button');
          confirmBtn.className = 'confirm';
          confirmBtn.textContent = '\u2713';
          confirmBtn.title = 'Confirm';
          confirmBtn.onclick = function() {
            const newVal = parseFloat(inp.value);
            if (isNaN(newVal) || newVal < 0) return;
            if (!overrides[detailMonth]) overrides[detailMonth] = {};
            if (!overrides[detailMonth].debts) overrides[detailMonth].debts = {};
            overrides[detailMonth].debts[d.id] = { payment: newVal };
            markDirty();
            recalc();
            showToast('Month ' + detailMonth + ': ' + escHtml(d.name) + ' payment set to ' + fmt(newVal), 'success');
          };
          const cancelBtn = document.createElement('button');
          cancelBtn.className = 'cancel';
          cancelBtn.textContent = '\u2717';
          cancelBtn.title = 'Cancel';
          cancelBtn.onclick = function() { renderBreakdown(); };

          editWrap.appendChild(inp);
          actions.appendChild(confirmBtn);
          actions.appendChild(cancelBtn);
          editWrap.appendChild(actions);
          valWrap.appendChild(editWrap);
          inp.focus();
          inp.select();

          // Enter to confirm, Escape to cancel
          inp.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); confirmBtn.click(); }
            if (e.key === 'Escape') { e.preventDefault(); cancelBtn.click(); }
          });
        };

        valWrap.appendChild(valSpan);

        // Revert button if overridden
        if (hasPaymentOverride) {
          const revertBtn = document.createElement('button');
          revertBtn.className = 'dsc-revert';
          revertBtn.textContent = '\u21A9';
          revertBtn.title = 'Revert to auto';
          revertBtn.onclick = function(e) {
            e.stopPropagation();
            if (overrides[detailMonth] && overrides[detailMonth].debts) {
              delete overrides[detailMonth].debts[d.id];
              if (Object.keys(overrides[detailMonth].debts).length === 0) delete overrides[detailMonth].debts;
              if (Object.keys(overrides[detailMonth]).length === 0) delete overrides[detailMonth];
            }
            markDirty();
            recalc();
            showToast(escHtml(d.name) + ' payment reverted to auto', 'success');
          };
          valWrap.appendChild(revertBtn);
        }

        payRow.appendChild(valWrap);
      } else if (payRow && d.paidOff) {
        payRow.innerHTML = '<span>Payment</span><span>' + fmt(d.payment) + ' (final)</span>';
      }

      blist.appendChild(card);

      // One-time hint for first editable payment
      if (!inlineEditHintShown && !firstEditableHinted && !d.paidOff && d.balanceStart > 0.005) {
        const hint = document.createElement('div');
        hint.style.cssText = 'font-family:var(--mono);font-size:9px;color:var(--muted);opacity:0.5;padding:2px 0 4px;';
        hint.textContent = 'click a payment to adjust';
        card.appendChild(hint);
        inlineEditHintShown = true;
        firstEditableHinted = true;
      }
    });

    // Rollovers
    node.rollovers.forEach(function(r) {
      const div = document.createElement('div');
      div.style.cssText = 'font-family:var(--mono);font-size:10px;color:var(--green);padding:6px 0;border-top:1px solid var(--border);margin-top:4px;';
      let text = fmt(r.amount) + ' rolls from ' + r.from + ' \u2192 ' + r.to;
      if (!rolloverExplained) {
        text += ' (freed payment redirected to next debt)';
        rolloverExplained = true;
      }
      div.textContent = text;
      blist.appendChild(div);
    });

    // Add extra income link (when not already set)
    if (!ovr.extraIncome || ovr.extraIncome <= 0) {
      const addExtraLink = document.createElement('div');
      addExtraLink.className = 'add-extra-link';
      addExtraLink.textContent = '+ add extra income for this month';
      addExtraLink.onclick = function() { openMonthEdit(detailMonth); };
      blist.appendChild(addExtraLink);
    }

    // Surplus
    const surpDiv = document.createElement('div');
    surpDiv.style.cssText = 'font-family:var(--mono);font-size:10px;color:var(--muted);padding:8px 0;border-top:1px solid var(--border);margin-top:4px;';
    surpDiv.textContent = 'Surplus: ' + fmt(Math.max(0, node.surplus)) + '/mo ($' + Math.max(0, node.surplus / daysInMonth(detailMonth)).toFixed(2) + '/day)';
    blist.appendChild(surpDiv);

    // Edit button
    const editBtn = document.createElement('button');
    editBtn.className = 'add-btn';
    editBtn.textContent = 'more options';
    editBtn.style.marginTop = '8px';
    editBtn.onclick = function() { openMonthEdit(detailMonth); };
    blist.appendChild(editBtn);

    const editHint = document.createElement('div');
    editHint.style.cssText = 'font-family:var(--mono);font-size:9px;color:var(--muted);margin-top:4px;opacity:0.5;';
    editHint.textContent = 'income, strategy, and rollover settings';
    blist.appendChild(editHint);

  } else {
    // Overview mode — existing behavior
    bpTitle.innerHTML = 'Per account <span style="float:right;opacity:0.4;font-style:italic;text-transform:none;letter-spacing:0;">slide to explore →</span>';

    if (chain.length < 2) return;

    const overviewDebts = hasFocusB ? debts.filter(function(d){return !!debtFocused[d.id];}) : debts;
    overviewDebts.forEach(function(d) {
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

function renderChart() {
  if (chain.length < 2) return;
  const maxMonth = chain.length - 1;

  const labels = [];
  for (let i = 0; i <= maxMonth; i++) labels.push(i === 0 ? 'Now' : fmtDateShort(i));

  const hasFocus = Object.keys(debtFocused).length > 0;
  const visibleDebts = hasFocus ? debts.filter(function(d) { return !!debtFocused[d.id]; }) : debts;
  const datasets = visibleDebts.map(function(d) {
    const chartData = [];
    for (let i = 0; i < chain.length; i++) {
      const cd = chain[i].debts.find(function(x) { return x.id === d.id; });
      chartData.push(cd ? cd.balanceEnd : 0);
    }
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
  visibleDebts.forEach(function(d) {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = '<div class="legend-swatch" style="background:' + safeColor(d.color) + ';"></div>' + escHtml(d.name) + ' ' + d.apr + '%';
    legend.appendChild(item);
  });

  const hasUnpayable = datasets.some(function(ds) { return ds.borderDash && ds.borderDash.length > 0; });
  if (hasUnpayable) {
    const note = document.createElement('div');
    note.className = 'legend-item';
    note.style.opacity = '0.5';
    note.innerHTML = '<div class="legend-swatch" style="background:var(--muted);border-top:1px dashed var(--muted);height:0;"></div><span style="color:var(--red);font-size:9px;">dashed = won\'t pay off</span>';
    legend.appendChild(note);
  }

  if (myChart) {
    myChart.data.labels = labels;
    myChart.data.datasets = datasets;
    myChart.update();
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
            const hint = document.getElementById('chart-hint');
            if (hint) hint.style.display = 'none';
            renderBreakdown();
            myChart.update();
          }
        }
      },
      plugins: [{
        id: 'monthIndicator',
        afterDraw: function(chart) {
          if (detailMonth === null || detailMonth === undefined) return;
          const meta = chart.getDatasetMeta(0);
          if (!meta || !meta.data[detailMonth]) return;
          const x = meta.data[detailMonth].x;
          const ctx = chart.ctx;
          const yAxis = chart.scales.y;
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x, yAxis.top);
          ctx.lineTo(x, yAxis.bottom);
          ctx.lineWidth = 1;
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.restore();
          // Month label at top
          ctx.save();
          ctx.fillStyle = 'rgba(136,136,160,0.8)';
          ctx.font = '9px JetBrains Mono';
          ctx.textAlign = 'center';
          ctx.fillText('m' + detailMonth, x, yAxis.top - 4);
          ctx.restore();
        }
      }]
    });
  }
}
