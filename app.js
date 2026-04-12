'use strict';

// ─── STATE ──────────────────────────────────────────────────────────────────
let bills = [];
let debts = [];
let income = 0;
let nextBillId = 1;
let nextDebtId = 1;
let selectedColor = '#00e5ff';
let myChart = null;
let saveTimeout = null;
let dirty = false;
let hasExported = false;
let strategy = 'current';
let keepPct = 0;
let overrides = {};
let chain = [];
let detailMonth = null;
let rolloverExplained = false;
let inlineEditHintShown = false;
let debtFocused = {}; // { debtId: true } — when empty, show all; when set, show only focused
let startDate = null; // Date object, first of the start month
let diaryEntries = [];
let nextDiaryId = 1;
let diaryDate = null; // currently viewed date

// ─── HELPERS ────────────────────────────────────────────────────────────────
function fmt(n){if(isNaN(n))return '—';return '$'+Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,',');}
function fmtMo(m){if(!m||m<=0)return '—';const label=fmtDate(m);const y=Math.floor(m/12),mo=m%12;const dur=y===0?mo+'mo':mo===0?y+'yr':y+'yr '+mo+'mo';return dur+' ('+label+')';}
function hexToRgba(hex,a){const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);return 'rgba('+r+','+g+','+b+','+a+')';}
function escHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function safeColor(c){return /^#[0-9a-fA-F]{6}$/.test(c)?c:'#00e5ff';}
function getStartDate(){
  if(startDate)return startDate;
  const d=new Date();d.setDate(1);d.setHours(0,0,0,0);
  return d;
}
function monthToDate(m){const d=new Date(getStartDate());d.setMonth(d.getMonth()+m);return d;}
function fmtDate(m){const d=monthToDate(m);return d.toLocaleDateString(undefined,{month:'short',year:'numeric'});}
function fmtDateShort(m){const d=monthToDate(m);return d.toLocaleDateString(undefined,{month:'short'}).slice(0,3)+' \u2019'+String(d.getFullYear()).slice(2);}
function daysInMonth(m){const d=monthToDate(m);return new Date(d.getFullYear(),d.getMonth()+1,0).getDate();}
let toastTimeout=null;
function showToast(msg,type){const t=document.getElementById('toast');if(toastTimeout)clearTimeout(toastTimeout);if(undoTimeout){clearTimeout(undoTimeout);undoTimeout=null;}t.textContent=msg;t.className='toast '+(type||'');t.classList.add('show');toastTimeout=setTimeout(function(){t.classList.remove('show');},2500);}
let undoTimeout=null;
function showUndoToast(msg,undoFn){
  const t=document.getElementById('toast');
  if(toastTimeout)clearTimeout(toastTimeout);
  if(undoTimeout)clearTimeout(undoTimeout);
  t.innerHTML=escHtml(msg)+' <button onclick="this.parentElement._undoFn()" style="background:none;border:1px solid var(--accent);color:var(--accent);border-radius:4px;padding:2px 8px;margin-left:8px;cursor:pointer;font-family:var(--mono);font-size:10px;">undo</button>';
  t._undoFn=function(){undoFn();t.classList.remove('show');if(undoTimeout)clearTimeout(undoTimeout);showToast('restored','success');};
  t.className='toast';
  t.classList.add('show');
  undoTimeout=setTimeout(function(){t.classList.remove('show');},5000);
}
function clampPositive(val){return Math.max(0,parseFloat(val)||0);}
function clampApr(val){return Math.min(100,Math.max(0,parseFloat(val)||0));}
let recalcTimeout=null;
function debouncedRecalc(){if(recalcTimeout)clearTimeout(recalcTimeout);recalcTimeout=setTimeout(recalc,200);}

// ─── TABS ────────────────────────────────────────────────────────────────────
function switchTab(tab){
  document.querySelectorAll('.tab-btn').forEach(function(b,i){b.classList.toggle('active',(i===0&&tab==='bills')||(i===1&&tab==='debts'));});
  document.getElementById('tab-bills').classList.toggle('active',tab==='bills');
  document.getElementById('tab-debts').classList.toggle('active',tab==='debts');
  if (window.innerWidth <= 800) closeDrawer();
}

// ─── DRAWER ───────────────────────────────────────────────────────────────
function toggleDrawer() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('drawer-backdrop');
  if (!sidebar || !backdrop) return;
  const isOpen = sidebar.classList.contains('drawer-open');
  if (isOpen) {
    closeDrawer();
  } else {
    sidebar.classList.add('drawer-open');
    backdrop.classList.add('show');
  }
}

function closeDrawer() {
  const sidebar = document.querySelector('.sidebar');
  const backdrop = document.getElementById('drawer-backdrop');
  if (sidebar) sidebar.classList.remove('drawer-open');
  if (backdrop) backdrop.classList.remove('show');
}

// ─── EXPORT INDICATOR ──────────────────────────────────────────────────────
function updateExportIndicator(){
  const btn=document.getElementById('export-btn');
  if(!btn)return;
  const hasData=(bills&&bills.length>0)||(debts&&debts.length>0)||income>0;
  if(hasData&&!hasExported){
    btn.style.borderColor='rgba(255,204,68,0.4)';
    btn.style.color='var(--amber)';
    btn.title='Unexported changes — click to export YAML backup';
  }else{
    btn.style.borderColor='';
    btn.style.color='';
    btn.title='Export YAML file';
  }
}

// ─── DIRTY / AUTOSAVE ───────────────────────────────────────────────────────
function markDirty(){
  dirty=true;
  const btn=document.getElementById('save-btn');
  btn.textContent='save*';
  btn.style.color='var(--amber)';
  btn.style.borderColor='rgba(255,204,68,0.3)';
  if(saveTimeout)clearTimeout(saveTimeout);
  saveTimeout=setTimeout(function(){autoSave();},2000);
}

function autoSave(){
  saveToCache(true);
}

// ─── LOCALSTORAGE (delegated to store.js) ────────────────────────────────────
function saveToCache(silent) {
  const state = {
    income: income, bills: bills, debts: debts,
    nextBillId: nextBillId, nextDebtId: nextDebtId,
    hasExported: hasExported,
    strategy: strategy, keepPct: keepPct, overrides: overrides,
    startDate: startDate ? startDate.toISOString() : null
  };
  try {
    const ok = saveState(state);
    if (!ok) throw new Error('save failed');
    // ALSO save diary separately
    saveDiary({ entries: diaryEntries, nextId: nextDiaryId });
    dirty = false;
    const btn = document.getElementById('save-btn');
    btn.textContent = 'saved';
    btn.style.color = 'var(--green)';
    btn.style.borderColor = 'rgba(0,224,150,0.3)';
    setTimeout(function() { btn.textContent = 'save'; btn.style.color = ''; btn.style.borderColor = ''; }, 2000);
    if (!silent) showToast('saved to browser cache', 'success');
  } catch (e) {
    showToast('save failed: ' + e.message, 'error');
  }
}

function loadFromCache() {
  try {
    const state = loadState();
    if (!state) return false;
    income = state.income || 0;
    bills = state.bills || [];
    debts = state.debts || [];
    nextBillId = state.nextBillId || Math.max.apply(null, bills.map(function(b) { return b.id; }).concat([0])) + 1;
    nextDebtId = state.nextDebtId || Math.max.apply(null, debts.map(function(d) { return d.id; }).concat([0])) + 1;
    hasExported = state.hasExported || false;
    strategy = state.strategy || 'current';
    keepPct = state.keepPct || 0;
    overrides = state.overrides || {};
    if (state.startDate) {
      startDate = new Date(state.startDate);
      const sd = document.getElementById('start-date-input');
      sd.value = startDate.getFullYear() + '-' + String(startDate.getMonth() + 1).padStart(2, '0');
    } else {
      startDate = null;
    }
    // Load diary from its own key (with migration fallback)
    const diary = loadDiary();
    diaryEntries = diary.entries || [];
    nextDiaryId = diary.nextId || Math.max.apply(null, diaryEntries.map(function(e) { return e.id; }).concat([0])) + 1;
    document.getElementById('strategy-select').value = strategy;
    document.getElementById('strategy-desc').textContent = strategyDescs[strategy] || '';
    document.getElementById('keep-controls').style.display = strategy === 'current' ? 'none' : '';
    document.getElementById('keep-pct').value = keepPct;
    document.getElementById('income-input').value = income;
    renderBills(); renderDebts(); recalc();
    updateExportIndicator();
    const d = new Date(state.savedAt || Date.now());
    showToast('restored from ' + d.toLocaleDateString() + ' ' + d.toLocaleTimeString(), 'success');
    return true;
  } catch (e) {
    showToast('Could not restore saved data: ' + e.message, 'error');
    return false;
  }
}

// ─── YAML EXPORT ─────────────────────────────────────────────────────────────
function stateToYaml(){
  const lines=['# Clearance — debt payoff planner','# exported '+new Date().toISOString(),'','version: 1',''];
  lines.push('income: '+income);
  if (strategy !== 'current') lines.push('strategy: ' + strategy);
  if (keepPct > 0) lines.push('keepPct: ' + keepPct);
  lines.push('');
  lines.push('bills:');
  if(bills.length===0)lines.push('  []');
  bills.forEach(function(b){
    lines.push('  - name: '+JSON.stringify(b.name));
    lines.push('    amount: '+b.amount);
    if(b.dropoff)lines.push('    dropoff: '+b.dropoff);
  });
  lines.push('');
  lines.push('debts:');
  if(debts.length===0)lines.push('  []');
  debts.forEach(function(d){
    lines.push('  - name: '+JSON.stringify(d.name));
    lines.push('    type: '+d.type);
    lines.push('    balance: '+d.balance);
    lines.push('    apr: '+d.apr);
    lines.push('    payment: '+d.payment);
    lines.push("    color: '"+safeColor(d.color)+"'");
  });
  return lines.join('\n');
}

function exportYaml(){
  const yaml=stateToYaml();
  const blob=new Blob([yaml],{type:'text/yaml'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='clearance-'+(new Date().toISOString().slice(0,10))+'.yaml';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  URL.revokeObjectURL(url);
  hasExported=true;
  updateExportIndicator();
  showToast('exported clearance.yaml','success');
}

// ─── YAML IMPORT ─────────────────────────────────────────────────────────────
function importYaml(){
  document.getElementById('yaml-input').value='';
  document.getElementById('modal-import').classList.add('open');
  setTimeout(function(){document.getElementById('yaml-input').focus();},50);
}

function loadYamlFile(input){
  const file=input.files[0];
  if(!file)return;
  const reader=new FileReader();
  reader.onload=function(e){document.getElementById('yaml-input').value=e.target.result;};
  reader.readAsText(file);
}

function parseYaml(text){
  // Minimal hand-rolled YAML parser for our specific schema
  const result={income:0,bills:[],debts:[],strategy:'current',keepPct:0};
  let skipped=0;
  const lines=text.split('\n');
  let section=null;
  let current=null;

  function parseVal(v){
    v=v.trim();
    if(v===''||v==='null'||v==='~')return null;
    if(v==='true')return true;
    if(v==='false')return false;
    const n=parseFloat(v);
    if(!isNaN(n)&&String(n)===v)return n;
    // quoted string
    if((v[0]==='"'&&v[v.length-1]==='"')||(v[0]==="'"&&v[v.length-1]==="'"))return v.slice(1,-1);
    return v;
  }

  const billFields = ['name','amount','dropoff'];
  const debtFields = ['name','type','balance','apr','payment','color'];

  lines.forEach(function(line){
    if(line.trim()===''||line.trim().startsWith('#'))return;
    const indent=line.search(/\S/);

    if(indent===0){
      const m=line.match(/^(\w+):\s*(.*)/);
      if(!m){skipped++;return;}
      const key=m[1],val=m[2].trim();
      if(key==='income'){result.income=parseFloat(val)||0;}
      else if(key==='strategy'){result.strategy=val;}
      else if(key==='keepPct'){result.keepPct=parseFloat(val)||0;}
      else if(key==='bills'){section='bills';current=null;}
      else if(key==='debts'){section='debts';current=null;}
    } else if(indent===2){
      const isListItem=line.trim().startsWith('- ');
      if(isListItem){
        const rest=line.trim().slice(2);
        const km=rest.match(/^(\w+):\s*(.*)/);
        if(km){
          if(section==='bills'){current={id:nextBillId++,name:'',amount:0,dropoff:null};result.bills.push(current);if(billFields.indexOf(km[1])>=0)current[km[1]]=parseVal(km[2]);}
          else if(section==='debts'){current={id:nextDebtId++,name:'',type:'cc',balance:0,apr:0,payment:0,color:'#00e5ff'};result.debts.push(current);if(debtFields.indexOf(km[1])>=0)current[km[1]]=parseVal(km[2]);}
        } else {skipped++;}
      } else {
        const km2=line.trim().match(/^(\w+):\s*(.*)/);
        if(km2&&current){const allowed=section==='bills'?billFields:debtFields;if(allowed.indexOf(km2[1])>=0)current[km2[1]]=parseVal(km2[2]);}
        else skipped++;
      }
    } else if(indent===4){
      const km3=line.trim().match(/^(\w+):\s*(.*)/);
      if(km3&&current){const allowed=section==='bills'?billFields:debtFields;if(allowed.indexOf(km3[1])>=0)current[km3[1]]=parseVal(km3[2]);}
      else skipped++;
    }
  });

  // coerce types
  result.bills.forEach(function(b){b.amount=parseFloat(b.amount)||0;b.dropoff=b.dropoff?parseInt(b.dropoff):null;});
  result.debts.forEach(function(d){d.balance=parseFloat(d.balance)||0;d.apr=parseFloat(d.apr)||0;d.payment=parseFloat(d.payment)||0;if(['cc','loan','friend'].indexOf(d.type)<0) d.type='cc';if(d.type==='friend')d.apr=0;if(!d.color||!/^#[0-9a-fA-F]{6}$/.test(d.color))d.color='#00e5ff';});
  result.skipped=skipped;
  return result;
}

function confirmImport(){
  const text=document.getElementById('yaml-input').value.trim();
  if(!text){showToast('nothing to import','error');return;}
  try{
    const parsed=parseYaml(text);
    // Stash current state before overwriting
    if(bills.length>0||debts.length>0||income>0){
      const existing=getRawState();
      if(existing)setBackup(existing);
    }
    income=parsed.income;
    bills=parsed.bills;
    debts=parsed.debts;
    strategy=parsed.strategy||'current';
    keepPct=parsed.keepPct||0;
    overrides={};
    document.getElementById('strategy-select').value=strategy;
    document.getElementById('strategy-desc').textContent=strategyDescs[strategy]||'';
    document.getElementById('keep-controls').style.display=strategy==='current'?'none':'';
    document.getElementById('keep-pct').value=keepPct;
    document.getElementById('income-input').value=income;
    hasExported=false;
    renderBills();renderDebts();recalc();
    closeModal('modal-import');
    saveToCache(true);
    if(parsed.skipped>0)showToast('imported '+bills.length+' bills, '+debts.length+' debts ('+parsed.skipped+' lines skipped)','');
    else showToast('imported '+bills.length+' bills, '+debts.length+' debts','success');
  }catch(e){showToast('parse error: '+e.message,'error');}
}

// ─── CLEAR ALL ──────────────────────────────────────────────────────────────
function clearAll(){
  if(!confirm('Clear all data? This cannot be undone.'))return;
  income=0;
  bills=[];
  debts=[];
  nextBillId=1;
  nextDebtId=1;
  strategy='current';
  keepPct=0;
  overrides={};
  chain=[];
  detailMonth=null;
  hasExported=false;
  document.getElementById('income-input').value=0;
  document.getElementById('strategy-select').value='current';
  document.getElementById('strategy-desc').textContent=strategyDescs['current'];
  document.getElementById('keep-controls').style.display='none';
  document.getElementById('keep-pct').value=0;
  diaryEntries = [];
  nextDiaryId = 1;
  diaryDate = null;
  startDate=null;
  const defDate=getStartDate();
  document.getElementById('start-date-input').value=defDate.getFullYear()+'-'+String(defDate.getMonth()+1).padStart(2,'0');
  renderBills();renderDebts();recalc();
  clearAllStorage(); // from store.js — clears all clearance_* keys
  showToast('all data cleared','success');
}

// ─── EXAMPLE DATA ────────────────────────────────────────────────────────────
function loadExample(){
  income=5000;
  nextBillId=1;nextDebtId=1;
  bills=[
    {id:nextBillId++,name:'Rent',amount:1200,dropoff:null},
    {id:nextBillId++,name:'Utilities',amount:120,dropoff:null},
    {id:nextBillId++,name:'Phone',amount:65,dropoff:null},
    {id:nextBillId++,name:'Internet',amount:60,dropoff:null},
    {id:nextBillId++,name:'Subscription (temp)',amount:80,dropoff:6},
  ];
  debts=[
    {id:nextDebtId++,name:'Visa',type:'cc',balance:4200,apr:24,payment:150,color:'#ff4466'},
    {id:nextDebtId++,name:'Personal loan',type:'loan',balance:8000,apr:12,payment:250,color:'#a78bfa'},
    {id:nextDebtId++,name:'Friend',type:'friend',balance:1500,apr:0,payment:200,color:'#00e096'},
  ];
  document.getElementById('income-input').value=income;
  strategy='avalanche';
  keepPct=0;
  overrides={};
  hasExported=false;
  document.getElementById('strategy-select').value=strategy;
  document.getElementById('strategy-desc').textContent=strategyDescs[strategy];
  document.getElementById('keep-controls').style.display='';
  document.getElementById('keep-pct').value=keepPct;
  renderBills();renderDebts();recalc();
  saveToCache(true);
  showToast('example data loaded','success');
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function openAddBill(){
  document.getElementById('new-bill-name').value='';
  document.getElementById('new-bill-amount').value='';
  document.getElementById('new-bill-dropoff').value='';
  document.getElementById('modal-bill').classList.add('open');
  setTimeout(function(){document.getElementById('new-bill-name').focus();},50);
}
function confirmAddBill(){
  const name=document.getElementById('new-bill-name').value.trim()||'Bill';
  const amount=clampPositive(document.getElementById('new-bill-amount').value);
  const dropoff=parseInt(document.getElementById('new-bill-dropoff').value)||null;
  bills.push({id:nextBillId++,name:name,amount:amount,dropoff:dropoff});
  closeModal('modal-bill');renderBills();recalc();markDirty();
}

function openAddDebt(){
  document.getElementById('new-debt-name').value='';
  document.getElementById('new-debt-balance').value='';
  document.getElementById('new-debt-apr').value='0';
  document.getElementById('new-debt-payment').value='';
  document.getElementById('new-debt-type').value='cc';
  document.getElementById('apr-field').style.opacity='1';
  document.querySelectorAll('.color-dot').forEach(function(d,i){d.classList.toggle('selected',i===0);});
  selectedColor='#00e5ff';
  document.getElementById('min-payment-hint').textContent='';
  document.getElementById('modal-debt').classList.add('open');
  setTimeout(function(){document.getElementById('new-debt-name').focus();},50);
}
function onDebtTypeChange(){
  const type=document.getElementById('new-debt-type').value;
  const aprField=document.getElementById('apr-field');
  if(type==='friend'){document.getElementById('new-debt-apr').value='0';aprField.style.opacity='0.4';}
  else{aprField.style.opacity='1';}
  updateMinPaymentHint();
}
function updateMinPaymentHint(){
  const type=document.getElementById('new-debt-type').value;
  const balance=clampPositive(document.getElementById('new-debt-balance').value);
  const apr=type==='friend'?0:clampApr(document.getElementById('new-debt-apr').value);
  const hint=document.getElementById('min-payment-hint');
  const paymentInput=document.getElementById('new-debt-payment');
  if(type!=='cc'||balance<=0){hint.textContent='';return;}
  const min=calcMinPayment(balance,apr,type);
  hint.textContent='est. minimum: '+fmt(min)+'/mo';
  if(!paymentInput.value||parseFloat(paymentInput.value)===0){paymentInput.value=min.toFixed(2);}
}
function confirmAddDebt(){
  const name=document.getElementById('new-debt-name').value.trim()||'Debt';
  const type=document.getElementById('new-debt-type').value;
  const balance=clampPositive(document.getElementById('new-debt-balance').value);
  const apr=type==='friend'?0:clampApr(document.getElementById('new-debt-apr').value);
  const payment=clampPositive(document.getElementById('new-debt-payment').value);
  debts.push({id:nextDebtId++,name:name,type:type,balance:balance,apr:apr,payment:payment,color:selectedColor});
  closeModal('modal-debt');renderDebts();recalc();markDirty();
}
function closeModal(id){document.getElementById(id).classList.remove('open');}
function pickColor(el){document.querySelectorAll('.color-dot').forEach(function(d){d.classList.remove('selected');});el.classList.add('selected');selectedColor=el.dataset.color;}

const strategyDescs = {
  current: 'Each debt keeps its set monthly payment. No freed money is redirected.',
  snowball: 'Minimums on all debts, extra attacks the smallest balance. When it\'s gone, its payment rolls to the next smallest.',
  avalanche: 'Minimums on all debts, extra attacks the highest APR. Mathematically optimal — saves the most in interest.'
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

// ─── MONTH EDIT ──────────────────────────────────────────────────────────────
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

  document.getElementById('edit-month-extra').value = ovr.extraIncome || '';
  document.getElementById('edit-month-extra-note').value = ovr.extraNote || '';

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
  // Compare against the inherited (pre-override) value from the previous month
  const prevNode = chain[month - 1] || chain[0];
  const inheritedIncome = prevNode ? prevNode.income : income;

  const incVal = document.getElementById('edit-month-income').value;
  const incNum = parseFloat(incVal);
  if (!isNaN(incNum) && incNum !== inheritedIncome) ovr.income = incNum;

  const stratVal = document.getElementById('edit-month-strategy').value;
  if (stratVal) ovr.strategy = stratVal;

  const keepVal = document.getElementById('edit-month-keep').value;
  const keepNum = parseFloat(keepVal);
  if (!isNaN(keepNum) && keepVal !== '') ovr.keep = keepNum;

  const extraVal = parseFloat(document.getElementById('edit-month-extra').value);
  if (!isNaN(extraVal) && extraVal > 0) { ovr.extraIncome = extraVal; ovr.extraNote = document.getElementById('edit-month-extra-note').value.trim().slice(0, 40); }

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

// ─── THEME ────────────────────────────────────────────────────────────────────
let themeState='auto';
const themeIcons={auto:'⊙',light:'☀',dark:'☽'};
const themeLabels={auto:'auto',light:'light',dark:'dark'};

function applyTheme(state){
  document.body.classList.remove('theme-light','theme-dark');
  if(state==='light')document.body.classList.add('theme-light');
  if(state==='dark')document.body.classList.add('theme-dark');
  const btn=document.getElementById('theme-btn');
  btn.textContent=themeIcons[state];
  btn.title='Theme: '+themeLabels[state]+' (click to cycle)';
}

function toggleTheme(){
  const cycle={auto:'light',light:'dark',dark:'auto'};
  themeState=cycle[themeState];
  applyTheme(themeState);
  saveTheme(themeState);
}

function initTheme(){
  const saved=loadTheme();
  if(saved==='light'||saved==='dark'||saved==='auto')themeState=saved;
  applyTheme(themeState);
}

// ─── VIEW TOGGLE ──────────────────────────────────────────────────────────
let currentView = 'dashboard';

function switchView(view) {
  currentView = view;
  document.getElementById('view-dashboard-btn').classList.toggle('active', view === 'dashboard');
  document.getElementById('view-diary-btn').classList.toggle('active', view === 'diary');

  // Hide dashboard children (empty state + dashboard) rather than the whole .app
  // because .diary-view lives inside main and would be hidden otherwise.
  const emptyState = document.getElementById('empty-state');
  const dashboard = document.getElementById('dashboard');
  const warnBar = document.getElementById('warn-bar');
  const sidebar = document.querySelector('.sidebar');
  const diary = document.getElementById('diary-view');

  const hamburger = document.getElementById('hamburger-btn');

  const app = document.querySelector('.app');

  if (view === 'diary') {
    if (emptyState) emptyState.style.display = 'none';
    if (dashboard) dashboard.style.display = 'none';
    if (warnBar) warnBar.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';
    if (hamburger) hamburger.style.display = 'none';
    // Collapse the app grid to a single column so main takes full width
    if (app) app.style.gridTemplateColumns = '1fr';
    if (typeof closeDrawer === 'function') closeDrawer();
    diary.classList.add('active');
    if (!diaryDate) diaryDate = diaryToday();
    renderDiary();
  } else {
    if (sidebar) sidebar.style.display = '';
    if (hamburger) hamburger.style.display = '';
    if (app) app.style.gridTemplateColumns = '';
    diary.classList.remove('active');
    // Let recalc() restore correct state for empty-state vs dashboard
    recalc();
  }
}

// ─── KEYBOARD ─────────────────────────────────────────────────────────────────
document.addEventListener('keydown',function(e){
  if(e.key==='Escape')document.querySelectorAll('.modal-overlay').forEach(function(m){m.classList.remove('open');});
  if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))saveToCache();
  if(e.key==='Enter'&&!e.ctrlKey&&!e.metaKey){
    const modalBill=document.getElementById('modal-bill');
    const modalDebt=document.getElementById('modal-debt');
    const modalImport=document.getElementById('modal-import');
    if(modalBill.classList.contains('open')&&e.target.closest('#modal-bill')){confirmAddBill();}
    else if(modalDebt.classList.contains('open')&&e.target.closest('#modal-debt')){confirmAddDebt();}
    else if(modalImport.classList.contains('open')&&e.target.closest('#modal-import')&&e.target.tagName!=='TEXTAREA'){confirmImport();}
  }
});
document.querySelectorAll('.modal-overlay').forEach(function(m){m.addEventListener('click',function(e){if(e.target===this)closeModal(this.id);});});
document.getElementById('income-input').addEventListener('input',function(){income=clampPositive(this.value);markDirty();debouncedRecalc();});
document.getElementById('start-date-input').addEventListener('input',function(){
  if(this.value){const parts=this.value.split('-');startDate=new Date(parseInt(parts[0]),parseInt(parts[1])-1,1);}
  else{startDate=null;}
  markDirty();recalc();
});
document.getElementById('proj-month').addEventListener('input',function(){
  detailMonth=parseInt(this.value)||null;
  if(chain.length>1){updateProjection();renderBreakdown();if(myChart)myChart.update();}
  else{recalc();}
});

// ─── INIT ──────────────────────────────────────────────────────────────────────
window.addEventListener('beforeunload',function(){if(dirty)autoSave();});
initTheme();
// Set default start date to first of next month
if(!document.getElementById('start-date-input').value){
  const def=getStartDate();
  document.getElementById('start-date-input').value=def.getFullYear()+'-'+String(def.getMonth()+1).padStart(2,'0');
}
if(!loadFromCache()){recalc();}

// ─── SERVICE WORKER ───────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('sw.js').catch(function(err) {
      console.warn('SW registration failed:', err);
    });
  });
}

// ─── INSTALL PROMPT ───────────────────────────────────────────────────────
let deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', function(e) {
  e.preventDefault();
  deferredInstallPrompt = e;
  // Only show if not already dismissed
  try {
    if (typeof getInstallDismissed === 'function' && getInstallDismissed()) return;
  } catch(err) {}
  const banner = document.getElementById('install-banner');
  const msg = document.getElementById('install-msg');
  if (banner && msg) {
    msg.textContent = 'Install Clearance on your device';
    banner.classList.add('show');
  }
});

function triggerInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  deferredInstallPrompt.userChoice.then(function() {
    deferredInstallPrompt = null;
    const banner = document.getElementById('install-banner');
    if (banner) banner.classList.remove('show');
  });
}

function dismissInstall() {
  const banner = document.getElementById('install-banner');
  if (banner) banner.classList.remove('show');
  try { if (typeof setInstallDismissed === 'function') setInstallDismissed(); } catch(e) {}
}

// iOS-specific install banner (no beforeinstallprompt on iOS)
window.addEventListener('load', function() {
  if (typeof isIOS === 'function' && isIOS() && typeof isStandalone === 'function' && !isStandalone()) {
    try {
      if (typeof getInstallDismissed === 'function' && getInstallDismissed()) return;
    } catch(err) {}
    const banner = document.getElementById('install-banner');
    const msg = document.getElementById('install-msg');
    const installBtn = document.getElementById('install-btn');
    if (banner && msg && installBtn) {
      msg.textContent = 'Install: tap Share → Add to Home Screen';
      installBtn.style.display = 'none';
      setTimeout(function() { banner.classList.add('show'); }, 2000);
    }
  }
});
