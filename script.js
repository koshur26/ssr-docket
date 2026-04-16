// ── LOGIN ──────────────────────────────────────────────────
const LOGIN_KEY = 'ssr_docket_auth';
const LOGIN_PW  = 'SSR';

function checkLogin() {
  const overlay = document.getElementById('loginOverlay');
  if (!overlay) return;
  if (localStorage.getItem(LOGIN_KEY) === 'granted') {
    overlay.classList.add('hidden');
  }
  // else: overlay stays visible, blocking the app
}

function submitLogin() {
  const input = document.getElementById('loginPwInput');
  const errEl = document.getElementById('loginError');
  const pw    = input.value.trim();

  if (pw === LOGIN_PW) {
    localStorage.setItem(LOGIN_KEY, 'granted');
    const overlay = document.getElementById('loginOverlay');
    overlay.style.transition = 'opacity .4s ease';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.classList.add('hidden'), 420);
    errEl.textContent = '';
  } else {
    errEl.textContent = 'Incorrect password. Please try again.';
    input.classList.add('error');
    input.value = '';
    setTimeout(() => input.classList.remove('error'), 400);
    input.focus();
  }
}

// Run check immediately
(function() {
  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkLogin);
  } else {
    checkLogin();
  }
})();



const SB_URL  = 'https://ddqlncebxfuairwsajsp.supabase.co';
const SB_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkcWxuY2VieGZ1YWlyd3NhanNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI2MzE0MDcsImV4cCI6MjA4ODIwNzQwN30.ti6gzM9HVD7YH8FkAppEzd_8yWt48t7mb3z4MWIYMYg';
const SB_BASE = `${SB_URL}/rest/v1/docket`;
const SB_HDR  = {'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`,'Content-Type':'application/json','Prefer':'return=minimal'};

const ADVOCATES    = ['Adv. Sibtain','Adv. Rizwan','Adv. Tehjud','Adv. Showkat','Adv. Tuyyab','Adv. Rutba','Adv. / Intern 1','Adv. / Intern 2'];
const COURT_COLORS = ['cc-0','cc-1','cc-2','cc-3','cc-4','cc-5','cc-6','cc-7'];
const SS = [
  {k:'pending',   l:'Pending'},
  {k:'attended',  l:'Attended'},
  {k:'arguments', l:'For Arguments Later'},
];
const SC  = {pending:'#7a4f10',attended:'#1e4d35',arguments:'#3d1a5c'};
const SS2 = {
  pending:  {bg:'#fdf4e3',c:'#7a4f10',b:'#d4a84a'},
  attended: {bg:'#edf5f0',c:'#1e4d35',b:'#a8ccb8'},
  arguments:{bg:'#f4eefa',c:'#3d1a5c',b:'#b090d0'},
  completed:{bg:'#edf5f0',c:'#1e4d35',b:'#a8ccb8'},
};

let cases   = [];
let cols    = (function(){ var saved=localStorage.getItem('ssr_cols'); var ver=localStorage.getItem('ssr_cols_ver'); if(saved && ver==='3') return JSON.parse(saved); localStorage.setItem('ssr_cols_ver','3'); return JSON.parse(JSON.stringify(ADVOCATES)); })();
let filt    = 'all';
let viewOffset = 0;   // 0=today, -1=yesterday, +1=tomorrow, etc.
let importOffset = 0; // which date to import into
let isReadOnly = false;
let editId  = null;
let pwCb    = null;
let courtColorMap = {};
let isSaving = false;

function queueSave(){ saveToSupabase(); }
function forceSave(){ saveToSupabase(); }

function setSaveBtn(state){
  const btn=document.getElementById('saveBtn'); if(!btn)return;
  if(state==='saving'){btn.className='top-save saving';btn.textContent='Saving…';}
  else if(state==='saved'){btn.className='top-save pending';btn.textContent='✓ Saved';setTimeout(()=>{btn.className='top-save';},2000);}
  else{btn.className='top-save';}
}

(async function(){
  const d = new Date();
  const dayStr  = d.toLocaleDateString('en-IN',{weekday:'long'});
  const dateStr = d.toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});
  const fullStr = d.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  const topDay = document.getElementById('topDay');
  if(topDay) topDay.textContent = dayStr;
  document.getElementById('topDate').textContent    = dateStr;
  document.getElementById('footerDate').textContent = fullStr;
  renderCols();
  await loadFromSupabase();
  setInterval(async()=>{ if(!isSaving && viewOffset===0) await loadFromSupabase(true); },15000);
  buildImportDateRow();
  updateDateNav();
  loadMiscFromSupabase();
  cleanupOldDates();
  loadFilingsFromSupabase();
})();

async function loadFromSupabase(silent){
  if(!silent) showSync('Loading…','loading');
  try{
    const targetDate=getDateKey(viewOffset);
    isReadOnly = viewOffset < 0;  // past = read only, today+future = editable
    const res=await fetch(SB_BASE+'?date=eq.'+targetDate,{headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`}});
    if(!res.ok) throw new Error('Connection error. Check your internet.');
    const rows=await res.json();
    if(!rows.length){
      cases=[];
    } else if(!silent){
      cases=rows[0].cases||[];
      cases.forEach(function(c){
        var seen={};
        c.assignedTo=(c.assignedTo||[]).map(function(a){
          var aClean=a.toLowerCase().replace(/\.\s*/g,' ').replace(/\s+/g,' ').trim();
          var match=cols.find(function(col){
            var cClean=col.toLowerCase().replace(/\.\s*/g,' ').replace(/\s+/g,' ').trim();
            return cClean===aClean;
          });
          return match||a;
        }).filter(function(a){
          if(seen[a.toLowerCase()]) return false;
          seen[a.toLowerCase()]=true;
          return true;
        });
      });
    } else {
      const sc=rows[0].cases||[];
      const localIds=new Set(cases.map(c=>c.id));
      sc.forEach(s=>{if(!localIds.has(s.id))cases.push(s);});
      sc.forEach(s=>{
        const lc=cases.find(c=>c.id===s.id);
        if(lc&&(s._ts||0)>(lc._ts||0)){
          lc.status=s.status;lc.assignedTo=s.assignedTo;
          lc.urgent=s.urgent;lc.note=s.note;
          lc._ts=s._ts;lc.statusTime=s.statusTime;
        }
      });
    }
    if(!silent) showSync('','');
    updateDateNav();
    render();
  } catch(e){ showSync(e.message,'err'); }
}

async function saveToSupabase(){
  if(isSaving||isReadOnly) return;
  isSaving=true; setSaveBtn('saving');
  try{
    const targetDate=getDateKey(viewOffset);
    const chk=await fetch(SB_BASE+'?date=eq.'+targetDate,{headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`}});
    const rows=await chk.json();
    let res;
    if(rows.length){
      res=await fetch(SB_BASE+'?date=eq.'+targetDate,{method:'PATCH',headers:SB_HDR,body:JSON.stringify({cases})});
    } else {
      res=await fetch(SB_BASE,{method:'POST',headers:{...SB_HDR,'Prefer':'return=minimal'},body:JSON.stringify({date:targetDate,cases})});
    }
    if(!res.ok) throw new Error(await res.text());
    setSaveBtn('saved');
  } catch(e){ showSync('Save failed: '+e.message,'err'); }
  isSaving=false;
}

function showSync(msg,type){
  const bar=document.getElementById('syncBar');
  document.getElementById('syncMsg').textContent=msg;
  bar.className='sync-bar';
  if(!type){bar.classList.remove('on');return;}
  bar.classList.add('on',type==='err'?'err':type==='ok'?'ok':'loading');
}

function getTodayKey(){return getDateKey(0);}
function getDateKey(offset){
  const d=new Date();
  if(offset) d.setDate(d.getDate()+offset);
  return String(d.getDate()).padStart(2,'0')+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+d.getFullYear();
}
function formatDateFull(offset){
  const d=new Date(); if(offset) d.setDate(d.getDate()+offset);
  return d.toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});
}
function formatDateShort(offset){
  const d=new Date(); if(offset) d.setDate(d.getDate()+offset);
  return d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
}
function offsetLabel(offset){
  if(offset===0) return "Today";
  if(offset===1) return "Tomorrow";
  if(offset===-1) return "Yesterday";
  if(offset>0) return "+"+offset+" days";
  return offset+" days";
}
function getTodayPw(){const d=new Date();return String(d.getDate()).padStart(2,'0')+String(d.getMonth()+1).padStart(2,'0')+d.getFullYear();}
function fmtTime(ts){if(!ts)return'';const d=new Date(ts);let h=d.getHours(),m=String(d.getMinutes()).padStart(2,'0');const ap=h>=12?'PM':'AM';h=h%12||12;return`${h}:${m} ${ap}`;}

function showPw(cb,title,desc){
  pwCb=cb;
  document.getElementById('pwTitle').textContent=title||'Authorisation Required';
  document.getElementById('pwDesc').textContent=desc||'Enter the access password.';
  document.getElementById('pwIn').value='';
  document.getElementById('pwErr').textContent='';
  document.getElementById('pwIn').classList.remove('err');
  document.getElementById('pwOverlay').classList.add('on');
  setTimeout(()=>document.getElementById('pwIn').focus(),80);
}
function closePw(){document.getElementById('pwOverlay').classList.remove('on');pwCb=null;}
function confirmPw(){
  const v=document.getElementById('pwIn').value.trim();
  if(v===getTodayPw()){document.getElementById('pwOverlay').classList.remove('on');const cb=pwCb;pwCb=null;if(cb)cb();}
  else{const i=document.getElementById('pwIn');document.getElementById('pwErr').textContent='Incorrect password.';i.classList.add('err');i.value='';setTimeout(()=>i.classList.remove('err'),600);i.focus();}
}
document.addEventListener('DOMContentLoaded',function(){document.getElementById('pwIn').addEventListener('keydown',function(e){
  if(e.key==='Enter')confirmPw();
  document.getElementById('pwErr').textContent='';this.classList.remove('err');
});});

function requestImport(){showPw(()=>doImport(),'Import Cases','Enter the access password to import today\'s cases.');}
function doImport(){
  const raw=document.getElementById('pasteArea').value.trim();
  if(!raw){alert('Please paste the case text first.');return;}
  const lines=raw.split('\n').map(l=>l.trim()).filter(l=>l&&l.includes('|'));
  if(!lines.length){alert('No valid cases found.');return;}
  const ek=new Set(cases.map(c=>caseKey(c)));let added=0;
  lines.forEach(line=>{
    const p=line.split('|').map(x=>x.trim());
    const nc={id:Date.now()+'-'+Math.random().toString(36).substr(2,5),courtName:p[0]||'Unknown Court',caseNum:p[1]||'',parties:p[2]||'—',stage:p[3]||'',dateStr:p[4]||'',status:'pending',assignedTo:[],note:'',urgent:false,nature:'normal',dontAttend:false,_ts:0,statusTime:null,serialNo:'',serialType:'',serialTotal:''};
    const k=caseKey(nc);if(!ek.has(k)){cases.push(nc);ek.add(k);added++;}
  });
  document.getElementById('pasteArea').value='';

  // Save to the import target date
  const importTargetDate = getDateKey(importOffset);
  (async()=>{
    try{
      const chk=await fetch(SB_BASE+'?date=eq.'+importTargetDate,{headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}});
      const rows=await chk.json();
      const existing=rows.length?(rows[0].cases||[]):[];
      const existingKeys=new Set(existing.map(c=>caseKey(c)));
      const toAdd=cases.filter(c=>!existingKeys.has(caseKey(c)));
      const merged=[...existing,...toAdd];
      if(rows.length){
        await fetch(SB_BASE+'?date=eq.'+importTargetDate,{method:'PATCH',headers:SB_HDR,body:JSON.stringify({cases:merged})});
      } else {
        await fetch(SB_BASE,{method:'POST',headers:{...SB_HDR,'Prefer':'return=minimal'},body:JSON.stringify({date:importTargetDate,cases:merged})});
      }
    } catch(e){ showSync('Import save failed: '+e.message,'err'); }
  })();

  if(importOffset===viewOffset) render();
  const forLabel=importOffset===0?'today':importOffset===1?'tomorrow':'day after tomorrow';
  const skipped=lines.length-added;
  if(added===0){alert('All cases already exist.');}
  else{alert(added+' case'+(added>1?'s':'')+' imported for '+forLabel+' ('+formatDateShort(importOffset)+').'+(skipped?' '+skipped+' duplicate'+(skipped>1?'s':'')+' skipped.':''));}
  return;

  // Date mismatch check
  const todayKey = getTodayKey(); // DD-MM-YYYY
  // convert to readable for comparison
  const today = new Date();
  const todayTokens = [String(today.getDate()).padStart(2,'0'), String(today.getMonth()+1).padStart(2,'0'), today.getFullYear()];

  const mismatchedCases = cases.filter(c=>{
    if(!c.dateStr) return false;
    // parse dateStr like "27-02-2026" or "27 Feb 2026" or "1 Mar 2026"
    const d = parseImportDate(c.dateStr);
    if(!d) return false;
    return d.getDate()!==today.getDate() || d.getMonth()!==today.getMonth() || d.getFullYear()!==today.getFullYear();
  });

  if(mismatchedCases.length>0){
    showDateMismatchWarning(mismatchedCases);
  } else if(added===0){
    alert('All cases already exist. No new cases added.');
  } else if(added<lines.length){
    alert(`${added} case${added>1?'s':''} added. ${lines.length-added} duplicate${lines.length-added>1?'s':''} skipped.`);
  }
}

function parseImportDate(str){
  if(!str) return null;
  str = str.trim();
  var parts = str.split(/[-\/]/);
  if(parts.length===3 && parts[2].length===4){
    return new Date(+parts[2], +parts[1]-1, +parts[0]);
  }
  var months={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
  var words = str.split(' ');
  if(words.length===3 && words[2].length===4){
    var mo = months[words[1].toLowerCase().substr(0,3)];
    if(mo!==undefined) return new Date(+words[2], mo, +words[0]);
  }
  return null;
}

function dismissDateBanner(){ document.getElementById('dateMismatchBanner').style.display='none'; }
function showDateMismatchWarning(mismatchCases){
  var today = new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'});
  var count = mismatchCases.length;
  var banner = document.getElementById('dateMismatchBanner');
  if(!banner) return;
  banner.innerHTML = '<strong>⚠️ ' + count + ' case' + (count>1?'s':'') + ' may not be for today</strong> (' + today + '). Please verify dates before proceeding. <span onclick="dismissDateBanner()" style="cursor:pointer;float:right;margin-left:1rem">✕</span>';
  banner.style.display = 'block';
}
function caseKey(c){return[c.courtName,c.caseNum,c.parties,c.stage].map(s=>(s||'').trim().toLowerCase()).join('|');}

function renderCols(){
  document.getElementById('colChips').innerHTML=cols.map((c,i)=>
    `<div class="chip"><div class="chip-dot"></div>${c}<span class="x" onclick="removeCol(${i})">×</span></div>`).join('');
  localStorage.setItem('ssr_cols',JSON.stringify(cols));
  const advF=document.getElementById('advF');
  if(advF){const cur=advF.value;advF.innerHTML=`<option value="all">All Advocates</option>`+cols.map(c=>`<option value="${c}">${c}</option>`).join('');if(cols.includes(cur))advF.value=cur;}
}
function removeCol(i){cols.splice(i,1);renderCols();render();}
document.addEventListener('DOMContentLoaded',function(){document.getElementById('colIn').addEventListener('keydown',function(e){
  if(e.key==='Enter'&&this.value.trim()){cols.push(this.value.trim());this.value='';renderCols();render();}
});});

function setF(f,btn){filt=f;document.querySelectorAll('.pill[data-f]').forEach(b=>b.classList.remove('on'));btn.classList.add('on');renderCards();}

// ── MULTI-COURT FILTER ──────────────────────────────────────
let selectedCourts = new Set();

function toggleCourtDropdown(){
  const dd = document.getElementById('courtMultiDropdown');
  dd.classList.toggle('open');
}
function clearCourtFilter(){
  selectedCourts.clear();
  document.querySelectorAll('#courtMultiOptions input[type=checkbox]').forEach(cb=>cb.checked=false);
  updateCourtLabel();
  renderCards();
}
function updateCourtLabel(){
  const lbl = document.getElementById('courtMultiLabel');
  const btn = document.getElementById('courtMultiBtn');
  if(selectedCourts.size===0){ lbl.textContent='All Courts'; btn.classList.remove('active'); }
  else if(selectedCourts.size===1){ lbl.textContent=[...selectedCourts][0]; btn.classList.add('active'); }
  else{ lbl.textContent=selectedCourts.size+' Courts'; btn.classList.add('active'); }
}
function rebuildCourtOptions(){
  var courts=[...new Set(cases.map(function(c){return c.courtName;}).filter(Boolean))].sort();
  var wrap=document.getElementById('courtMultiOptions'); if(!wrap) return;
  if(!courts.length){ wrap.innerHTML='<div style="padding:.6rem 1rem;font-size:.8rem;color:var(--muted)">No courts loaded</div>'; return; }
  wrap.innerHTML=courts.map(function(ct){
    var checked = selectedCourts.has(ct) ? 'checked' : '';
    return '<label class="court-multi-opt"><input type="checkbox" value="'+ct+'" '+checked+' onchange="toggleCourtSel(this)"/> '+ct+'</label>';
  }).join('');
}
function toggleCourtSel(cb){
  if(cb.checked) selectedCourts.add(cb.value);
  else selectedCourts.delete(cb.value);
  updateCourtLabel();
  renderCards();
}
// close dropdown on outside click
document.addEventListener('click',function(e){
  const wrap=document.getElementById('courtMultiWrap');
  if(wrap&&!wrap.contains(e.target)) document.getElementById('courtMultiDropdown')?.classList.remove('open');
});
// ────────────────────────────────────────────────────────────

function render(){
  const has=cases.length>0;
  document.getElementById('heroWrap').style.display  ='block'; // always show hero for date nav
  document.getElementById('filtersBar').style.display=has?'flex':'none';
  document.getElementById('heroStats').style.visibility=has?'visible':'hidden';
  document.getElementById('progressBar').style.display=has?'block':'none';
  document.getElementById('progressLegend').style.display=has?'block':'none';
  document.getElementById('heroSub').style.display=has?'block':'none';
  // Show import card when empty and not read-only; show empty state when read-only
  const tooFarAhead = viewOffset > 2;
  const showImport = !has && !isReadOnly && !tooFarAhead;
  const showEmpty  = !has && isReadOnly;
  const showTooFar = !has && tooFarAhead;
  document.getElementById('uploadCard').style.display = showImport ? 'block' : 'none';
  if(showImport) buildImportDateRow();
  if(showEmpty){
    document.getElementById('casesWrap').innerHTML='<div class="empty"><div class="ei">📅</div><h3>No cases for '+formatDateFull(viewOffset)+'</h3><p>This is a past date — read only</p></div>';
  } else if(showTooFar){
    document.getElementById('casesWrap').innerHTML='<div class="empty"><div class="ei">🗓️</div><h3>Too far ahead</h3><p>Cause list import is only available for Today, Tomorrow, and Day After.<br>Check back closer to the date.</p></div>';
  } else if(!has){
    document.getElementById('casesWrap').innerHTML='';
  }
  const ba=document.getElementById('bottomActions');
  if(ba) ba.style.display=has?'block':'none';
  updateActionRow();
  updateDateNav();
  // Show/hide "Back to Today" button
  const todayBtn = document.getElementById('backToTodayBtn');
  if(todayBtn) todayBtn.style.display = viewOffset !== 0 ? 'inline-flex' : 'none';
  if(has){renderHero();renderProgress();}
  renderCourtFilter();renderAdvFilter();renderCards();
}

function renderHero(){
  const cnt={};SS.forEach(s=>cnt[s.k]=0);
  cases.forEach(c=>{if(cnt[c.status]!==undefined)cnt[c.status]++;});
  const urg=cases.filter(c=>c.urgent).length;
  // date badge
  const db=document.getElementById('docketDateBadge');
  // Date badge is managed by updateDateNav() — don't rebuild here
  // title
  const ey=document.querySelector('.docket-eyebrow');
  const dTitle = viewOffset===0?"Today's Docket":viewOffset===1?"Tomorrow's Docket":viewOffset===-1?"Yesterday's Docket":formatDateFull(viewOffset);
  if(ey) ey.innerHTML=dTitle+' <em>— '+cases.length+' case'+(cases.length!==1?'s':'')+'</em>';
  // stats row
  document.getElementById('heroStats').innerHTML=`
    <div class="dstat pend"><span class="dstat-n a" id="dn-pending">${cnt.pending}</span><span class="dstat-l">Pending</span></div>
    <div class="dstat att"><span class="dstat-n bl" id="dn-attended">${cnt.attended}</span><span class="dstat-l">Attended</span></div>
    <div class="dstat args"><span class="dstat-n p" id="dn-arguments">${cnt.arguments}</span><span class="dstat-l">Arguments</span></div>

    ${urg?`<div class="dstat urg"><span class="dstat-n r" id="dn-urgent">${urg}</span><span class="dstat-l">Urgent</span></div>`:''}`;
  // sub line
  document.getElementById('heroSub').textContent=`${cases.filter(c=>c.assignedTo.length).length} of ${cases.length} cases assigned`;
  // trigger breathe animation on numbers every 8s
  startBreathing();
}

let breatheTimer=null;

function updateDateNav(){
  const db = document.getElementById('docketDateBadge');
  if(db) db.textContent = formatDateFull(viewOffset);
  const ro = document.getElementById('readonlyBadge');
  if(ro) ro.style.display = isReadOnly ? 'block' : 'none';
  const ey = document.getElementById('docketEyebrow');
  if(ey){
    const dTitle = viewOffset===0?"Today's Docket":viewOffset===1?"Tomorrow's Docket":viewOffset===-1?"Yesterday's Docket":formatDateFull(viewOffset);
    ey.textContent = dTitle;
  }
}

function showDatePicker(){
  const dp = document.getElementById('datePicker');
  if(!dp) return;
  const parts = getDateKey(viewOffset).split('-');
  dp.value = parts[2]+'-'+parts[1]+'-'+parts[0];
  dp.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;opacity:0;pointer-events:auto;z-index:9999;cursor:pointer';
  dp.focus();
  try { dp.showPicker(); } catch(e) { dp.click(); }
  function hide(){ dp.style.cssText='position:absolute;opacity:0;pointer-events:none;width:0;height:0'; dp.removeEventListener('change',hide); dp.removeEventListener('blur',hide); }
  dp.addEventListener('change', hide, {once:true});
  dp.addEventListener('blur', function(){ setTimeout(hide,200); }, {once:true});
}

function saveAndCollapse(id, btn){
  // Flash "Saved ✓" then collapse
  const origText = btn.innerHTML;
  btn.innerHTML = '✓ Saved';
  btn.style.background = 'var(--green,#2d6a4f)';
  btn.style.color = '#fff';
  btn.style.borderColor = 'var(--green,#2d6a4f)';
  saveToSupabase();
  setTimeout(function(){
    // Collapse the card
    const card = document.querySelector('.card[data-id="'+id+'"]');
    if(card){
      card.classList.remove('open');
      const det = card.querySelector('.card-detail');
      if(det) det.style.display='none';
    }
    btn.innerHTML = origText;
    btn.style.background = '';
    btn.style.color = '';
    btn.style.borderColor = '';
  }, 800);
}

function showDeleteConfirm(msg, onConfirm, opts){
  const overlay = document.getElementById('deleteConfirmOverlay');
  const msgEl = document.getElementById('deleteConfirmMsg');
  if(!overlay || !msgEl) return;
  msgEl.textContent = msg;
  // Apply custom icon, title, button label if provided
  const icon = opts&&opts.icon ? opts.icon : '🗑';
  const title = opts&&opts.title ? opts.title : 'Delete?';
  const btnLabel = opts&&opts.btn ? opts.btn : 'Delete';
  const btnClass = opts&&opts.btnClass ? opts.btnClass : 'btn-danger';
  document.getElementById('deleteConfirmIcon').textContent = icon;
  document.getElementById('deleteConfirmTitle').textContent = title;
  const confirmBtn = document.getElementById('deleteConfirmBtn');
  confirmBtn.textContent = btnLabel;
  confirmBtn.className = btnClass;
  overlay.classList.add('on');
  // Store callback
  overlay._onConfirm = onConfirm;
}

function closeDeleteConfirm(){
  const overlay = document.getElementById('deleteConfirmOverlay');
  if(overlay) overlay.classList.remove('on');
}

function confirmDelete(){
  const overlay = document.getElementById('deleteConfirmOverlay');
  if(overlay && overlay._onConfirm) overlay._onConfirm();
  closeDeleteConfirm();
}

function toggleFiledSection(){
  const body = document.getElementById('filedBody');
  const icon = document.getElementById('filedToggleIcon');
  if(!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  if(icon) icon.textContent = isHidden ? '▾' : '▸';
}

function toggleCompletedSection(){
  const body = document.getElementById('compBody');
  const icon = document.getElementById('compToggleIcon');
  if(!body) return;
  const isHidden = body.style.display === 'none';
  body.style.display = isHidden ? 'block' : 'none';
  if(icon) icon.textContent = isHidden ? '▾' : '▸';
}

function formatDateFromKey(key){
  // key is DD-MM-YYYY, return like "7 Mar 2026"
  if(!key) return '';
  const p = key.split('-');
  if(p.length !== 3) return key;
  const d = new Date(+p[2], +p[1]-1, +p[0]);
  return d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
}

function goToToday(){
  viewOffset = 0;
  importOffset = 0;
  cases = [];
  updateDateNav();
  loadFromSupabase(false);
}

function goDate(dir){
  viewOffset += dir;
  cases = [];
  // Pre-select the matching import pill if viewing today/tomorrow/day-after
  if(viewOffset >= 0 && viewOffset <= 2) importOffset = viewOffset;
  else importOffset = 0;
  updateDateNav();
  loadFromSupabase(false);
}

function goToDate(val){
  if(!val) return;
  const parts = val.split('-'); // yyyy-mm-dd
  const picked = new Date(+parts[0], +parts[1]-1, +parts[2]);
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((picked - today) / 86400000);
  viewOffset = diff;
  cases = [];
  if(viewOffset >= 0 && viewOffset <= 2) importOffset = viewOffset;
  else importOffset = 0;
  updateDateNav();
  loadFromSupabase(false);
}

function buildImportDateRow(){
  const row = document.getElementById('importDateRow');
  if(!row) return;
  // Pills are always relative to today (absolute offsets 0,1,2)
  // but we pre-select whichever matches viewOffset if viewing today/tomorrow/day-after
  const opts = [
    {offset:0, label:'Today'},
    {offset:1, label:'Tomorrow'},
    {offset:2, label:'Day After'},
  ];
  // Default importOffset to match viewOffset if it's 0/1/2, else 0
  if(importOffset < 0 || importOffset > 2) importOffset = Math.max(0, Math.min(2, viewOffset));
  row.innerHTML = opts.map(o =>
    '<div class="import-date-opt'+(o.offset===importOffset?' selected':'')+'" data-offset="'+o.offset+'" onclick="selectImportDate('+o.offset+',this)">'+
    '<div class="ido-label">'+o.label+'</div>'+
    '<div class="ido-date">'+formatDateShort(o.offset)+'</div>'+
    '</div>'
  ).join('');
}

function selectImportDate(offset, el){
  importOffset = offset;
  document.querySelectorAll('.import-date-opt').forEach(e=>e.classList.remove('selected'));
  el.classList.add('selected');
}

async function cleanupOldDates(){
  try{
    const res = await fetch(SB_BASE, {headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}});
    const rows = await res.json();
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-90); cutoff.setHours(0,0,0,0);
    for(const row of rows){
      if(!row.date || row.date.startsWith('__')) continue;
      const p = row.date.split('-');
      if(p.length!==3) continue;
      const d = new Date(+p[2], +p[1]-1, +p[0]);
      if(d < cutoff){
        await fetch(SB_BASE+'?id=eq.'+row.id, {method:'DELETE', headers:SB_HDR});
      }
    }
  } catch(e){}
}
function startBreathing(){
  if(breatheTimer) return; // already running
  breatheTimer=setInterval(()=>{
    document.querySelectorAll('.dstat-n').forEach(el=>{
      el.classList.remove('animate');
      void el.offsetWidth; // reflow to restart
      el.classList.add('animate');
    });
  },8000);
}

function renderProgress(){
  const cnt={};SS.forEach(s=>cnt[s.k]=0);
  cases.forEach(c=>cnt[c.status]++);
  const total=cases.length||1;
  let segs='',leg='';
  SS.forEach(s=>{
    if(!cnt[s.k])return;
    segs+=`<div class="pb-seg pb-${s.k}" style="flex:${cnt[s.k]}" title="${s.l}: ${cnt[s.k]}"></div>`;
    leg+=`<div class="pl-item"><div class="pl-dot" style="background:${SC[s.k]}"></div>${s.l} (${cnt[s.k]})</div>`;
  });
  document.getElementById('progressBar').innerHTML=segs;
  document.getElementById('progressLegend').innerHTML=leg;
}

function renderCourtFilter(){
  var courts=[...new Set(cases.map(function(c){return c.courtName;}).filter(Boolean))].sort();
  courts.forEach(function(ct,i){if(!courtColorMap[ct])courtColorMap[ct]=COURT_COLORS[i%COURT_COLORS.length];});
  rebuildCourtOptions();
}

function renderAdvFilter(){
  const sel=document.getElementById('advF');if(!sel)return;
  const cur=sel.value;
  sel.innerHTML=`<option value="all">All Advocates</option>`+cols.map(c=>`<option value="${c}">${c}</option>`).join('');
  if(cols.includes(cur))sel.value=cur;
}

function renderCards(){
  // Don't overwrite the too-far-ahead or read-only message
  if(viewOffset > 2 && cases.length === 0) return;
  if(isReadOnly && cases.length === 0) return;
  const wrap=document.getElementById('casesWrap');
  const af=document.getElementById('advF')?.value||'all';
  let list=cases.filter(c=>{
    if(filt==='urgent')return c.urgent;
    if(filt!=='all'&&c.status!==filt)return false;
    if(selectedCourts.size>0&&!selectedCourts.has(c.courtName))return false;
    if(af!=='all'&&!c.assignedTo.includes(af))return false;
    return true;
  });
  if(!list.length){
    wrap.innerHTML=`<div class="empty"><div class="ei">${cases.length?'🔍':'⚖️'}</div><h3>${cases.length?'No cases match this filter':'Nothing here yet'}</h3><p>${cases.length?'Try a different filter':'Import cases using the panel above'}</p></div>`;
    return;
  }
  const activeCases=list.filter(c=>!c.dontAttend);
  const daCases=list.filter(c=>c.dontAttend);
  const groups={};
  activeCases.forEach(c=>{if(!groups[c.courtName])groups[c.courtName]=[];groups[c.courtName].push(c);});
  const daGroups={};
  daCases.forEach(c=>{if(!daGroups[c.courtName])daGroups[c.courtName]=[];daGroups[c.courtName].push(c);});
  // Sort within group: attended+completed sink to bottom
  const doneStatuses = new Set(['completed','attended']);
  Object.keys(groups).forEach(ct=>{
    groups[ct].sort((a,b)=>{
      const aD=doneStatuses.has(a.status)?1:0;
      const bD=doneStatuses.has(b.status)?1:0;
      return aD-bD;
    });
  });

  // Sort court groups: all cases done → move group to bottom
  const groupEntries = Object.entries(groups);
  groupEntries.sort((a,b)=>{
    const aAllDone = a[1].every(c=>doneStatuses.has(c.status)) ? 1 : 0;
    const bAllDone = b[1].every(c=>doneStatuses.has(c.status)) ? 1 : 0;
    return aAllDone - bAllDone;
  });

  const activeHtml=groupEntries.map(([court,cl])=>{
    const cc=courtColorMap[court]||'cc-0';
    const allDone=cl.every(c=>doneStatuses.has(c.status));
    const hasUrgent=cl.some(c=>c.urgent);
    const groupClass=allDone?'all-done':hasUrgent?'has-urgent':'';
    return `<div class="court-group ${groupClass}">
      <div class="court-label" style="background:var(--court-${cc.replace('cc-','')})"><div class="court-color-dot"></div>${court}<span class="court-case-count">${cl.length} case${cl.length>1?'s':''}</span></div>
      ${cl.map(c=>cardHtml(c)).join('')}
    </div>`;
  }).join('');
  const daGroupEntries=Object.entries(daGroups);
  const daHtml=daGroupEntries.length>0?
    '<div class="da-section">'+'<div class="da-section-hdr">🚫 Not Attending — '+daCases.length+' case'+(daCases.length>1?'s':'')+'</div>'+
    daGroupEntries.map(([court,cl])=>`<div class="court-group da-court-group"><div class="court-label da-court-label"><div class="court-color-dot"></div>${court}<span class="court-case-count">${cl.length} case${cl.length>1?'s':''}</span></div>${cl.map(c=>cardHtml(c)).join('')}</div>`).join('')+
    '</div>':'';
  wrap.innerHTML=activeHtml+daHtml;
}

function cardHtml(c){
  const sbadge=`<span class="status-badge sb-${c.status}">${SS.find(s=>s.k===c.status)?.l||c.status}</span>`;
  const sbtns=isReadOnly?'<span style="font-size:.75rem;color:var(--muted);font-style:italic">Read-only — past date</span>':SS.filter(s=>s.k!=='completed').map(s=>`<button class="stbtn ${c.status===s.k?'on-'+s.k:''}" onclick="setSt('${c.id}','${s.k}');event.stopPropagation()">${s.l}</button>`).join('');
  const abtns=isReadOnly?'':cols.map(col=>`<button class="advbtn ${c.assignedTo.includes(col)?'on':''}" onclick="toggleA('${c.id}','${col}');event.stopPropagation()"><span class="adot"></span>${col}</button>`).join('');
  const tsLine=c.statusTime&&c.status!=='pending'?`<div class="status-ts">⏱ ${SS.find(s=>s.k===c.status)?.l||c.status} at ${fmtTime(c.statusTime)}</div>`:`<div class="status-ts"></div>`;
  const detailActions = isReadOnly ? '' :
    '<div class="detail-actions">'+
    '<div class="da-left">'+
      '<button class="da-btn da-save" id="saveBtn-'+c.id+'" data-id="'+c.id+'" onclick="saveAndCollapse(this.dataset.id,this);event.stopPropagation()">💾 Save</button>'+
      '<select class="nature-select nature-select-'+( c.nature||'normal')+'" data-id="'+c.id+'" onchange="setNature(this.dataset.id,this.value);event.stopPropagation()" onclick="event.stopPropagation()">'+
        '<option value="normal" '+((!c.nature||c.nature==='normal')?'selected':'')+'>Normal</option>'+
        '<option value="imp" '+(c.nature==='imp'?'selected':'')+'>Imp</option>'+
        '<option value="very-imp" '+(c.nature==='very-imp'?'selected':'')+'>Very Imp</option>'+
      '</select>'+
    '</div>'+
    '<div class="da-right">'+
      ''+(!c.dontAttend?'<button class="da-btn da-skip" data-id="'+c.id+'" onclick="toggleDontAttend(this.dataset.id);event.stopPropagation()">🚫 Don’t Attend</button>':'<button class="da-btn da-restore" data-id="'+c.id+'" onclick="restoreDontAttend(this.dataset.id);event.stopPropagation()">↩ Restore</button>')+''+
      '<button class="da-btn urg '+(c.urgent?'urg-on':'')+'" data-id="'+c.id+'" onclick="toggleUrg(this.dataset.id);event.stopPropagation()">🚨 '+(c.urgent?'Remove urgent':'Mark urgent')+'</button>'+
      '<button class="da-btn" data-id="'+c.id+'" onclick="openEdit(this.dataset.id);event.stopPropagation()">✏️ Edit</button>'+
      '<button class="da-btn del" data-id="'+c.id+'" onclick="reqDel(this.dataset.id);event.stopPropagation()">🗑 Delete</button>'+
    '</div>'+
    '</div>';
  return `<div class="case-card ${c.urgent?'urgent':''} ${c.status==='completed'?'completed':''} ${c.status==='attended'?'attended':''} ${c.dontAttend?'da-card':''}" id="cc-${c.id}">
    ${c.dontAttend?'<div class="da-stamp"><span>DON’T ATTEND</span></div>':''}
    <div class="case-summary" onclick="toggleCard('${c.id}')">
      <div class="case-summary-l">
        <div class="case-parties">${c.parties}${c.urgent?' <span class="urg-lbl">🚨</span>':''}</div>
        <div class="case-meta">

          ${c.serialNo?`<span class="serial-badge">${c.serialType?c.serialType+' ':''} ${c.serialNo}${c.serialTotal?'/'+c.serialTotal:''}</span>`:`<span class="serial-add" onclick="toggleCard('${c.id}');event.stopPropagation()">+ S.No.</span>`}
          ${c.nature==='very-imp'?'<span class="nature-dot nd-very-imp">●</span>':c.nature==='imp'?'<span class="nature-dot nd-imp">●</span>':''}
          ${c.dateStr?`<span class="case-num-lbl">📅 ${c.dateStr}</span>`:''}
          ${c.assignedTo&&c.assignedTo.length?`<span class="cc-adv-pill">👤 ${c.assignedTo.join(', ')}</span>`:''}
          ${c.note?`<span class="cc-note-pill">📝 ${c.note.length>60?c.note.substring(0,60)+'…':c.note}</span>`:''}
        </div>
      </div>
      <div class="case-summary-r">
        ${sbadge}
        <span class="expand-icon">▾</span>
      </div>
    </div>
    <div class="case-details">
      <div class="detail-section">
        <div class="detail-lbl">Status</div>
        <div class="status-btns">${sbtns}</div>
        ${tsLine}
      </div>
      <div class="detail-section">
        <div class="detail-lbl">Attending</div>
        <div class="adv-btns">${abtns}</div>
      </div>
      <div class="detail-section">
        <div class="detail-lbl">Note</div>
        ${isReadOnly?`<div style="font-size:.8rem;color:var(--ink2);padding:.25rem 0">${c.note||'—'}</div>`:`<input class="note-in" placeholder="Cause list serial no., next date, brief status…" value="${(c.note||'').replace(/"/g,'&quot;')}" oninput="setNote('${c.id}',this.value)" onblur="queueSave()" onclick="event.stopPropagation()"/>`}
      </div>
      <div class="detail-section">
        <div class="detail-lbl">Serial Number</div>
        <div class="serial-section">
          <div class="serial-field">
            <label>Type</label>
            <select onchange="setSerialType('${c.id}',this.value)" onclick="event.stopPropagation()">
              <option value="" ${(!c.serialType)?'selected':''} disabled>— Type —</option>
              <option value="Civil" ${c.serialType==='Civil'?'selected':''}>Civil</option>
              <option value="Criminal" ${c.serialType==='Criminal'?'selected':''}>Criminal</option>
            </select>
          </div>
          <div class="serial-field">
            <label>Our No.</label>
            <input type="number" min="1" placeholder="—" value="${c.serialNo||''}" onchange="setSerialNo('${c.id}',this.value)" onblur="queueSave()" onclick="event.stopPropagation()"/>
          </div>
          <div class="serial-field">
            <label>Total in List</label>
            <input type="number" min="1" placeholder="—" value="${c.serialTotal||''}" onchange="setSerialTotal('${c.id}',this.value)" onblur="queueSave()" onclick="event.stopPropagation()"/>
          </div>
        </div>
      </div>
      ${detailActions}
    </div>
  </div>`;
}

function toggleCard(id){
  const el=document.getElementById('cc-'+id);
  if(el) el.classList.toggle('open');
}

function setSt(id,s){
  const c=cases.find(x=>x.id===id);if(!c)return;
  c.status=s;c.statusTime=s!=='pending'?Date.now():null;c._ts=Date.now();
  render();queueSave();
}
function toggleA(id,n){
  const c=cases.find(x=>x.id===id);if(!c)return;
  const i=c.assignedTo.indexOf(n);if(i>=0)c.assignedTo.splice(i,1);else c.assignedTo.push(n);
  c._ts=Date.now();render();queueSave();
}
function setNote(id,v){const c=cases.find(x=>x.id===id);if(c){c.note=v;c._ts=Date.now();}}
function setSerialNo(id,v){const c=cases.find(x=>x.id===id);if(c){c.serialNo=v;c._ts=Date.now();}}
function setNature(id,v){
  const cas = cases.find(x=>x.id===id);
  if(cas){
    cas.nature = v;
    cas._ts = Date.now();
    queueSave();
    // Update select styling in-place
    var sel = document.querySelector('.nature-select[data-id="'+id+'"]');
    if(sel){ sel.className = 'nature-select nature-select-'+v; sel.value = v; }
    // Update dot on collapsed card
    const dot = document.querySelector('.card[data-id="'+id+'"] .nature-dot');
    if(dot){
      if(v==='very-imp'){ dot.style.display='inline'; dot.className='nature-dot nd-very-imp'; }
      else if(v==='imp'){ dot.style.display='inline'; dot.className='nature-dot nd-imp'; }
      else { dot.style.display='none'; }
    }
  }
}

function setSerialType(id,v){
  const c=cases.find(x=>x.id===id);
  if(c){
    c.serialType=v;
    c._ts=Date.now();
    queueSave();
    // Update the serial badge pill in-place without re-rendering
    const badge=document.querySelector('.card[data-id="'+id+'"] .serial-badge');
    if(badge) badge.textContent=(v||'Civil')+' '+(c.serialNo||'')+(c.serialTotal?'/'+c.serialTotal:'');
  }
}
function setSerialTotal(id,v){const c=cases.find(x=>x.id===id);if(c){c.serialTotal=v;c._ts=Date.now();}}
function toggleDontAttend(id){
  showDeleteConfirm("Mark this case as Don’t Attend? It will be moved to the bottom of the docket.",function(){
    const cas=cases.find(x=>x.id===id);
    if(cas){cas.dontAttend=true;cas._ts=Date.now();render();queueSave();}
  },{icon:'🚫',title:"Don’t Attend?",btn:"Confirm",btnClass:"btn-confirm"});
}
function restoreDontAttend(id){
  const cas=cases.find(x=>x.id===id);
  if(cas){cas.dontAttend=false;cas._ts=Date.now();render();queueSave();}
}
function toggleUrg(id){
  const c=cases.find(x=>x.id===id);if(!c)return;
  c.urgent=!c.urgent;c._ts=Date.now();render();queueSave();
}
function requestReset(){
  showPw(()=>resetDay(),"Reset Today's Docket","This will clear all cases for today. Enter the password to confirm.");
}
async function resetDay(){
  cases=[];
  render();
  isSaving=true;setSaveBtn('saving');
  try{
    const targetDate=getDateKey(viewOffset);
    const chk=await fetch(SB_BASE+'?date=eq.'+targetDate,{headers:{'apikey':SB_KEY,'Authorization':`Bearer ${SB_KEY}`}});
    const rows=await chk.json();
    if(rows.length){
      const res=await fetch(SB_BASE+'?date=eq.'+targetDate,{method:'PATCH',headers:SB_HDR,body:JSON.stringify({cases:[]})});
      if(!res.ok) throw new Error(await res.text());
    }
    setSaveBtn('saved');
  } catch(e){ showSync('Reset failed: '+e.message,'err'); }
  isSaving=false;
}

function reqDel(id){showPw(()=>{cases=cases.filter(x=>x.id!==id);render();saveToSupabase();},'Confirm Deletion','Enter the access password to remove this case.');}

function openAdd(){editId=null;clearM();document.getElementById('mTitle').textContent='Add Case';document.getElementById('caseOverlay').classList.add('on');}
function openEdit(id){
  const c=cases.find(x=>x.id===id);if(!c)return;editId=id;
  document.getElementById('mTitle').textContent='Edit Case';
  ['fCourt','fCaseNum','fParties','fStage','fDate','fNote'].forEach(f=>{
    const map={fCourt:'courtName',fCaseNum:'caseNum',fParties:'parties',fStage:'stage',fDate:'dateStr',fNote:'note'};
    document.getElementById(f).value=c[map[f]]||'';
  });
  document.getElementById('caseOverlay').classList.add('on');
}
function clearM(){['fCourt','fCaseNum','fParties','fStage','fDate','fNote'].forEach(id=>document.getElementById(id).value='');}
function closeModal(){document.getElementById('caseOverlay').classList.remove('on');editId=null;}
function saveModal(){
  const p=document.getElementById('fParties').value.trim();
  const ct=document.getElementById('fCourt').value.trim();
  if(!p&&!ct){alert('Please enter parties or court name.');return;}
  if(editId){
    const c=cases.find(x=>x.id===editId);
    if(c){c.courtName=ct||c.courtName;c.caseNum=document.getElementById('fCaseNum').value.trim();c.parties=p||c.parties;c.stage=document.getElementById('fStage').value.trim();c.dateStr=document.getElementById('fDate').value.trim();c.note=document.getElementById('fNote').value.trim();c._ts=Date.now();}
  } else {
    cases.push({id:Date.now()+'-'+Math.random().toString(36).substr(2,5),courtName:ct||'Unknown Court',caseNum:document.getElementById('fCaseNum').value.trim(),parties:p||'—',stage:document.getElementById('fStage').value.trim(),dateStr:document.getElementById('fDate').value.trim(),status:'pending',assignedTo:[],note:'',urgent:false,nature:'normal',dontAttend:false,_ts:Date.now(),statusTime:null,serialNo:'',serialType:'',serialTotal:''});
  }
  render();saveToSupabase();closeModal();
}
document.addEventListener('DOMContentLoaded',function(){
  document.getElementById('caseOverlay').addEventListener('click',function(e){if(e.target===this)closeModal();});
  document.getElementById('miscOverlay').addEventListener('click',function(e){if(e.target===this)closeMiscModal();});
  document.getElementById('filingOverlay').addEventListener('click',function(e){if(e.target===this)closeFilingModal();});
});

function openCauseList(){
  var w = window.open('','_blank');
  var viewedDate = new Date();
  viewedDate.setDate(viewedDate.getDate() + viewOffset);
  var day = String(viewedDate.getDate()).padStart(2,'0');
  var mon = viewedDate.toLocaleDateString('en-IN',{month:'short'});
  var yr  = viewedDate.getFullYear();
  var fname = day+'-'+mon+'-'+yr+' Cause List - SSR & Associates';
  var html = buildCauseListHtml(viewedDate);
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+fname+'</title><style>@page{size:A4 portrait;margin:14mm 12mm}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Georgia,serif;font-size:10pt;color:#1a1814;-webkit-print-color-adjust:exact;print-color-adjust:exact}table{border-collapse:collapse}tr{page-break-inside:avoid}</style></head><body>'+html+'</body></html>');
  w.document.close();
  w.onload = function(){ w.focus(); w.print(); };
}

function buildCauseListHtml(viewedDate){
  var dateStr = viewedDate.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  var natureLabel = function(n){ return n==='very-imp'?'Very Imp':n==='imp'?'Imp':'Normal'; };
  var natureColor = function(n){ return n==='very-imp'?'#c0392b':n==='imp'?'#b8860b':'#555'; };

  // Sort: very-imp first, imp second, normal last; then by court
  var activeCL=cases.filter(function(c){return !c.dontAttend;});
  var daCL=cases.filter(function(c){return c.dontAttend;});
  var sorted=[...activeCL].sort(function(a,b){
    var order = {'very-imp':0,'imp':1,'normal':2};
    var ao = order[a.nature]!==undefined?order[a.nature]:2;
    var bo = order[b.nature]!==undefined?order[b.nature]:2;
    if(ao!==bo) return ao-bo;
    return (a.courtName||'').localeCompare(b.courtName||'');
  });

  var sn = 0;
  var rows = '';
  sorted.forEach(function(cas){
    sn++;
    var bg = sn%2===0?'#f7f5f0':'#ffffff';
    rows += '<tr style="background:'+bg+'">';
    rows += '<td style="text-align:center;color:#aaa;font-size:8pt;border:1pt solid #e0ddd6;padding:5pt 4pt">'+sn+'</td>';
    rows += '<td style="font-size:9pt;border:1pt solid #e0ddd6;padding:5pt 7pt;vertical-align:top">'+cas.courtName+'<br><span style="font-size:7.5pt;color:#888;text-transform:uppercase;letter-spacing:.04em">'+(cas.stage||'')+'</span></td>';
    rows += '<td style="font-size:8.5pt;border:1pt solid #e0ddd6;padding:5pt 7pt;vertical-align:top;text-align:center;color:#555">'+(cas.serialType||'—')+'</td>';
    rows += '<td style="font-size:8.5pt;border:1pt solid #e0ddd6;padding:5pt 7pt;vertical-align:top;text-align:center;font-weight:600">'+(cas.serialNo||'—')+'</td>';
    rows += '<td style="font-weight:bold;font-size:10pt;border:1pt solid #e0ddd6;padding:5pt 7pt;vertical-align:top">'+cas.parties+'</td>';
    rows += '<td style="font-size:8.5pt;border:1pt solid #e0ddd6;padding:5pt 7pt;vertical-align:top">'+(cas.assignedTo.join(', ')||'—')+'</td>';
    rows += '<td style="font-size:8.5pt;font-weight:600;color:'+natureColor(cas.nature)+';border:1pt solid #e0ddd6;padding:5pt 7pt;vertical-align:top;text-align:center">'+natureLabel(cas.nature)+'</td>';
    rows += '<td style="font-size:8pt;color:#555;border:1pt solid #e0ddd6;padding:5pt 7pt;vertical-align:top">'+(cas.note||'—')+'</td>';
    rows += '</tr>';
  });

  var html = '';
  html += '<div style="font-family:Georgia,serif;font-size:10pt;color:#1a1814;line-height:1.5">';
  html += '<table style="width:100%;border-collapse:collapse;margin-bottom:10pt">';
  html += '<tr><td style="vertical-align:top">';
  html += '<div style="display:flex;align-items:center;gap:10pt">';
  html += '<img src="data:image/png;base64,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" style="width:42pt;height:42pt;border-radius:50%;object-fit:cover" alt="SSR">';
  html += '<div>';
  html += '<div style="font-size:17pt;font-weight:bold;letter-spacing:.02em">Syed Sibtain Razvi &amp; Associates</div>';
  html += '<div style="font-size:8pt;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-top:2pt">Advocates &amp; Legal Consultants &nbsp;&middot;&nbsp; Srinagar, J&amp;K</div>';
  html += '</div></div>';
  html += '</td><td style="text-align:right;vertical-align:top">';
  html += '<div style="font-size:12pt;font-weight:bold">Cause List</div>';
  html += '<div style="font-size:8.5pt;color:#555;margin-top:2pt">'+dateStr+'</div>';
  html += '</td></tr></table>';
  html += '<div style="border-top:2pt solid #1a1814;margin-bottom:10pt"></div>';
  html += '<div style="font-size:9pt;color:#444;margin-bottom:12pt"><strong>Total Cases:</strong> <strong>'+cases.length+'</strong></div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:9.5pt;margin-bottom:14pt">';
  html += '<thead><tr style="background:#f0ede6">';
  html += '<th style="padding:5pt 4pt;border:1pt solid #ccc;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#666;width:3%;text-align:center">#</th>';
  html += '<th style="padding:5pt 7pt;border:1pt solid #ccc;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#666;text-align:left;width:14%">Court</th>';
  html += '<th style="padding:5pt 7pt;border:1pt solid #ccc;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#666;text-align:center;width:7%">Type</th>';
  html += '<th style="padding:5pt 7pt;border:1pt solid #ccc;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#666;text-align:center;width:6%">S. No.</th>';
  html += '<th style="padding:5pt 7pt;border:1pt solid #ccc;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#666;text-align:left;width:24%">Parties</th>';
  html += '<th style="padding:5pt 7pt;border:1pt solid #ccc;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#666;text-align:left;width:11%">Advocate</th>';
  html += '<th style="padding:5pt 7pt;border:1pt solid #ccc;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#666;text-align:center;width:8%">Nature</th>';
  html += '<th style="padding:5pt 7pt;border:1pt solid #ccc;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#666;text-align:left;width:27%">Note</th>';
  html += '</tr></thead>';
  var daRowsCL='';
  daCL.forEach(function(cas){
    daRowsCL+='<tr style="opacity:0.5;background:#f7f5f0"><td style="text-align:center;color:#bbb;font-size:8pt;border:1pt solid #e0ddd6;padding:5pt 4pt">—</td>';
    daRowsCL+='<td style="font-size:9pt;border:1pt solid #e0ddd6;padding:5pt 7pt;color:#999">'+cas.courtName+'</td>';
    daRowsCL+='<td style="font-size:8.5pt;border:1pt solid #e0ddd6;padding:5pt 7pt;color:#bbb;text-align:center">'+(cas.serialType||'—')+'</td>';
    daRowsCL+='<td style="font-size:8.5pt;border:1pt solid #e0ddd6;padding:5pt 7pt;color:#bbb;text-align:center;font-weight:600">'+(cas.serialNo||'—')+'</td>';
    daRowsCL+='<td style="font-size:9.5pt;border:1pt solid #e0ddd6;padding:5pt 7pt;color:#999;text-decoration:line-through">'+cas.parties+'</td>';
    daRowsCL+='<td style="font-size:8.5pt;border:1pt solid #e0ddd6;padding:5pt 7pt;color:#bbb">'+(cas.assignedTo.join(", ")||'—')+'</td>';
    daRowsCL+='<td style="font-size:8.5pt;font-weight:600;border:1pt solid #e0ddd6;padding:5pt 7pt;color:#bbb;text-align:center">—</td>';
    daRowsCL+='<td style="font-size:8pt;color:#bbb;border:1pt solid #e0ddd6;padding:5pt 7pt">'+(cas.note||'—')+'</td></tr>';
  });
  var daSepCL=daCL.length>0?'<tr><td colspan="8" style="padding:6pt 7pt;background:#f0ede6;font-size:7.5pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#999;border:1pt solid #ccc">Not Attending ('+daCL.length+')</td></tr>'+daRowsCL:'';
  html += '<tbody>'+rows+daSepCL+'</tbody></table>';
  html += '<div style="border-top:1pt solid #ccc;padding-top:7pt;font-size:8pt;color:#999;display:flex;justify-content:space-between">';
  html += '<span>Syed Sibtain Razvi &amp; Associates &nbsp;&middot;&nbsp; For Internal Use Only</span>';
  html += '<span>'+dateStr+'</span>';
  html += '</div>';
  html += '</div>';
  return html;
}

function openEOD(){
  document.getElementById('eodContent').innerHTML = buildEODHtml();
  document.getElementById('eodOverlay').classList.add('on');
}

function buildEODHtml(){
  // Use the date being viewed, not necessarily today
  var viewedDate = new Date();
  viewedDate.setDate(viewedDate.getDate() + viewOffset);
  var dateStr = viewedDate.toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
  var timeStr = new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  var cnt = {}; SS.forEach(function(s){ cnt[s.k]=0; });
  var activeCasesEOD=cases.filter(function(c){return !c.dontAttend;});
  var daCasesEOD=cases.filter(function(c){return c.dontAttend;});
  activeCasesEOD.forEach(function(c){if(cnt[c.status]!==undefined)cnt[c.status]++;});
  var urg=activeCasesEOD.filter(function(c){return c.urgent;}).length;
  var advCount = {};
  activeCasesEOD.forEach(function(c){c.assignedTo.forEach(function(a){advCount[a]=(advCount[a]||0)+1;});});
  var advParts = Object.keys(advCount).sort(function(a,b){ return advCount[b]-advCount[a]; }).map(function(a){ return a+' ('+advCount[a]+')'; });
  var advLine = advParts.length ? advParts.join('  |  ') : 'None assigned';

  var sn = 0;
  var rows = '';
  activeCasesEOD.forEach(function(c){
    sn++;
    var bg = sn % 2 === 0 ? '#f7f5f0' : '#ffffff';
    var statusLabel = (SS.find(function(s){ return s.k===c.status; })||{l:c.status}).l;
    var statusColors = {pending:'#7a4f10',attended:'#1e3d5c',arguments:'#3d1a5c'};
    var statusCol = statusColors[c.status]||'#333';
    var ts = (c.statusTime && c.status!=='pending') ? '  ' + fmtTime(c.statusTime) : '';
    var urgMark = c.urgent ? '  [URGENT]' : '';
    rows += '<tr style="background:'+bg+'">';
    rows += '<td style="text-align:center;color:#aaa;font-size:8pt;border:1pt solid #e0ddd6;padding:5pt 4pt">'+sn+'</td>';
    rows += '<td style="font-size:9pt;border:1pt solid #e0ddd6;padding:5pt 7pt;vertical-align:top">'+c.courtName+'</td>';
    rows += '<td style="font-size:8.5pt;border:1pt solid #e0ddd6;padding:5pt 7pt;vertical-align:top;color:#333">'+( c.caseNum||'—')+'<br><span style="font-size:7.5pt;color:#888;text-transform:uppercase;letter-spacing:.04em">'+(c.stage||'')+'</span></td>';
    rows += '<td style="font-weight:bold;font-size:10pt;border:1pt solid #e0ddd6;padding:5pt 7pt;vertical-align:top">'+c.parties+urgMark+'</td>';
    rows += '<td style="font-size:8.5pt;border:1pt solid #e0ddd6;padding:5pt 7pt;vertical-align:top">'+(c.assignedTo.join(', ')||'—')+'</td>';
    rows += '<td style="font-size:8.5pt;font-weight:600;color:'+statusCol+';border:1pt solid #e0ddd6;padding:5pt 7pt;vertical-align:top">'+statusLabel+ts+'</td>';
    rows += '<td style="font-size:8pt;color:#555;border:1pt solid #e0ddd6;padding:5pt 7pt;vertical-align:top">'+(c.note||'—')+'</td>';
    rows += '</tr>';
  });

  var html = '';
  html += '<div style="font-family:Georgia,serif;font-size:10pt;color:#1a1814;line-height:1.5">';

  // HEADER
  html += '<table style="width:100%;border-collapse:collapse;margin-bottom:10pt">';
  html += '<tr><td style="vertical-align:top">';
  html += '<div style="display:flex;align-items:center;gap:10pt">';
  html += '<img src="data:image/png;base64,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" style="width:42pt;height:42pt;border-radius:50%;object-fit:cover" alt="SSR">';
  html += '<div>';
  html += '<div style="font-size:17pt;font-weight:bold;letter-spacing:.02em">Syed Sibtain Razvi &amp; Associates</div>';
  html += '<div style="font-size:8pt;color:#888;text-transform:uppercase;letter-spacing:.08em;margin-top:2pt">Advocates &amp; Legal Consultants &nbsp;&middot;&nbsp; Srinagar, J&amp;K</div>';
  html += '</div></div>';
  html += '</td><td style="text-align:right;vertical-align:top">';
  html += '<div style="font-size:12pt;font-weight:bold">End-of-Day Report</div>';
  html += '<div style="font-size:8.5pt;color:#555;margin-top:2pt">'+dateStr+'</div>';
  html += '<div style="font-size:8pt;color:#999">Generated at '+timeStr+'</div>';
  html += '</td></tr></table>';
  html += '<div style="border-top:2pt solid #1a1814;margin-bottom:10pt"></div>';

  // SUMMARY — plain text, no boxes
  html += '<div style="font-size:9pt;color:#444;margin-bottom:6pt;line-height:1.9">';
  html += '<strong>Summary:</strong> &nbsp;';
  html += 'Total Cases: <strong>'+cases.length+'</strong> &nbsp;&nbsp; ';
  html += 'Pending: <strong style="color:#7a4f10">'+cnt.pending+'</strong> &nbsp;&nbsp; ';
  html += 'Attended: <strong style="color:#1e3d5c">'+cnt.attended+'</strong> &nbsp;&nbsp; ';
  html += 'For Arguments: <strong style="color:#3d1a5c">'+cnt.arguments+'</strong>';
  if(urg) html += ' &nbsp;&nbsp; Urgent: <strong style="color:#7a1c1c">'+urg+'</strong>';
  html += '</div>';
  html += '<div style="font-size:9pt;color:#444;margin-bottom:12pt">';
  html += '<strong>Advocates:</strong> &nbsp; '+advLine;
  html += '</div>';

  // TABLE
  html += '<div style="font-size:8pt;font-weight:bold;text-transform:uppercase;letter-spacing:.1em;color:#888;margin-bottom:4pt;border-bottom:1pt solid #ccc;padding-bottom:3pt">Case Details</div>';
  html += '<table style="width:100%;border-collapse:collapse;font-size:9.5pt;margin-bottom:14pt">';
  html += '<thead><tr style="background:#f0ede6">';
  html += '<th style="padding:5pt 4pt;border:1pt solid #ccc;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#666;width:4%;text-align:center">#</th>';
  html += '<th style="padding:5pt 7pt;border:1pt solid #ccc;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#666;text-align:left;width:16%">Court</th>';
  html += '<th style="padding:5pt 7pt;border:1pt solid #ccc;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#666;text-align:left;width:13%">Case No.</th>';
  html += '<th style="padding:5pt 7pt;border:1pt solid #ccc;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#666;text-align:left;width:27%">Parties</th>';
  html += '<th style="padding:5pt 7pt;border:1pt solid #ccc;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#666;text-align:left;width:12%">Advocate</th>';
  html += '<th style="padding:5pt 7pt;border:1pt solid #ccc;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#666;text-align:left;width:12%">Status</th>';
  html += '<th style="padding:5pt 7pt;border:1pt solid #ccc;font-size:7.5pt;text-transform:uppercase;letter-spacing:.06em;color:#666;text-align:left;width:16%">Notes</th>';
  html += '</tr></thead>';
  var daRowsEOD='';
  daCasesEOD.forEach(function(cas){
    daRowsEOD+='<tr style="background:#f5f5f3"><td style="text-align:center;color:#bbb;font-size:8pt;border:1pt solid #e0ddd6;padding:4pt">—</td>';
    daRowsEOD+='<td style="font-size:9pt;border:1pt solid #e0ddd6;padding:4pt 7pt;color:#aaa">'+cas.courtName+'</td>';
    daRowsEOD+='<td style="font-size:8.5pt;border:1pt solid #e0ddd6;padding:4pt 7pt;color:#bbb">'+(cas.caseNum||'—')+'</td>';
    daRowsEOD+='<td style="font-size:9.5pt;border:1pt solid #e0ddd6;padding:4pt 7pt;color:#aaa;text-decoration:line-through">'+cas.parties+'</td>';
    daRowsEOD+='<td style="font-size:8.5pt;border:1pt solid #e0ddd6;padding:4pt 7pt;color:#bbb">'+(cas.assignedTo.join(', ')||'—')+'</td>';
    daRowsEOD+='<td style="font-size:8pt;border:1pt solid #e0ddd6;padding:4pt 7pt;color:#bbb">'+(cas.note||'—')+'</td></tr>';
  });
  var daEODSection=daCasesEOD.length>0?
    '<div style="margin-top:16pt"><div style="font-size:8pt;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#999;border-bottom:1pt solid #ddd;padding-bottom:4pt;margin-bottom:6pt">Not To Be Attended</div>'+
    '<table style="width:100%;border-collapse:collapse"><thead><tr style="background:#f5f5f3">'+
    '<th style="padding:4pt;border:1pt solid #ccc;font-size:7pt;color:#bbb;width:4%;text-align:center">#</th>'+
    '<th style="padding:4pt 7pt;border:1pt solid #ccc;font-size:7pt;color:#bbb;text-align:left">Court</th>'+
    '<th style="padding:4pt 7pt;border:1pt solid #ccc;font-size:7pt;color:#bbb;text-align:left">Case No.</th>'+
    '<th style="padding:4pt 7pt;border:1pt solid #ccc;font-size:7pt;color:#bbb;text-align:left">Parties</th>'+
    '<th style="padding:4pt 7pt;border:1pt solid #ccc;font-size:7pt;color:#bbb;text-align:left">Advocate</th>'+
    '<th style="padding:4pt 7pt;border:1pt solid #ccc;font-size:7pt;color:#bbb;text-align:left">Note</th>'+
    '</tr></thead><tbody>'+daRowsEOD+'</tbody></table></div>':'';
  html += '<tbody>'+rows+'</tbody></table>'+daEODSection;

  // FOOTER
  html += '<div style="border-top:1pt solid #ccc;padding-top:7pt;font-size:8pt;color:#999;display:flex;justify-content:space-between">';
  html += '<span>Syed Sibtain Razvi &amp; Associates &nbsp;&middot;&nbsp; For Internal Use Only</span>';
  html += '<span>'+dateStr+'</span>';
  html += '</div>';
  html += '</div>';
  return html;
}

function printEOD(){
  var html = buildEODHtml();
  // Build filename: "07-Mar-2026 EoD - SSR & Associates"
  var viewedDate = new Date();
  viewedDate.setDate(viewedDate.getDate() + viewOffset);
  var day = String(viewedDate.getDate()).padStart(2,'0');
  var mon = viewedDate.toLocaleDateString('en-IN',{month:'short'});
  var yr  = viewedDate.getFullYear();
  var fname = day+'-'+mon+'-'+yr+' EoD Report - SSR & Associates';
  var w = window.open('','_blank');
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+fname+'</title><style>@page{size:A4 portrait;margin:14mm 12mm}*{box-sizing:border-box;margin:0;padding:0}body{font-family:Georgia,serif;font-size:10pt;color:#1a1814;-webkit-print-color-adjust:exact;print-color-adjust:exact}table{border-collapse:collapse}tr{page-break-inside:avoid}</style></head><body>'+html+'</body></html>');
  w.document.close();
  w.onload = function(){
    w.focus();
    w.print();
  };
}

document.addEventListener('DOMContentLoaded',function(){document.getElementById('eodOverlay').addEventListener('click',function(e){if(e.target===this)this.classList.remove('on');});});

// ── STATE ─────────────────────────────────────────────────
let miscItems = [];
let filingItems = [];
let miscEditId = null;
let filingEditId = null;
let currentTab = 'docket';

// ── TAB SWITCHING ─────────────────────────────────────────
function switchTab(tab, btn) {
  currentTab = tab;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.tab-content').forEach(c => { c.style.display = 'none'; });
  document.getElementById('tab-' + tab).style.display = 'block';
  updateActionRow();
  if(tab === 'misc') renderMisc();
  if(tab === 'filings') renderFilings();
}

function updateActionRow() {
  const row = document.getElementById('actionRow');
  const ba = document.getElementById('bottomActions');
  if(!row || !ba) return;
  if(currentTab === 'docket') {
    ba.style.display = cases.length > 0 ? 'block' : 'none';
    row.innerHTML = '<button class="fa-btn" onclick="openEOD()">EOD Report</button>' +
      '<button class="fa-btn" onclick="openCauseList()">📋 Cause List</button>' +
      '<button class="fa-btn danger" onclick="requestReset()">↺ Reset</button>' +
      '<button class="fa-btn primary" onclick="openAdd()">+ Case</button>';
  } else if(currentTab === 'misc') {
    ba.style.display = 'block';
    row.innerHTML = '<button class="fa-btn primary" onclick="openMiscModal()">+ Add Task</button>';
  } else if(currentTab === 'filings') {
    ba.style.display = 'block';
    row.innerHTML = '<button class="fa-btn primary" onclick="openFilingModal()">+ Add Filing</button>';
  }
}

// ── SUPABASE MISC ─────────────────────────────────────────
const SB_ALL = 'https://ddqlncebxfuairwsajsp.supabase.co/rest/v1/docket';

async function cleanupFiledFilings(){
  const today = new Date(); today.setHours(0,0,0,0);
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate()-10);
  let changed = false;
  filingItems = filingItems.filter(f => {
    if(f.fStatus !== 'filed' || !f.filedOn) return true;
    const p = f.filedOn.split('-');
    if(p.length !== 3) return true;
    const d = new Date(+p[2], +p[1]-1, +p[0]);
    if(d < cutoff){ changed = true; return false; }
    return true;
  });
  if(changed) await saveFilingsToSupabase();
}

async function cleanupCompletedMisc(){
  const today = new Date(); today.setHours(0,0,0,0);
  const cutoff = new Date(today); cutoff.setDate(cutoff.getDate()-10);
  let changed = false;
  miscItems = miscItems.filter(m => {
    if(m.mStatus !== 'done' || !m.completedOn) return true;
    const p = m.completedOn.split('-');
    if(p.length !== 3) return true;
    const d = new Date(+p[2], +p[1]-1, +p[0]);
    if(d < cutoff){ changed = true; return false; }
    return true;
  });
  if(changed) await saveMiscToSupabase();
}

async function loadMiscFromSupabase() {
  try {
    const res = await fetch(SB_ALL + '?date=eq.__misc__', {headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}});
    const rows = await res.json();
    miscItems = rows.length ? (rows[0].cases || []) : [];
    await cleanupCompletedMisc();
    if(currentTab === 'misc') renderMisc();
  } catch(e) {}
}

async function saveMiscToSupabase() {
  try {
    const res = await fetch(SB_ALL + '?date=eq.__misc__', {headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}});
    const rows = await res.json();
    if(rows.length) {
      await fetch(SB_ALL + '?date=eq.__misc__', {method:'PATCH', headers:SB_HDR, body:JSON.stringify({cases:miscItems})});
    } else {
      await fetch(SB_ALL, {method:'POST', headers:{...SB_HDR,'Prefer':'return=minimal'}, body:JSON.stringify({date:'__misc__', cases:miscItems})});
    }
  } catch(e) {}
}

// ── SUPABASE FILINGS ──────────────────────────────────────
async function loadFilingsFromSupabase() {
  try {
    const res = await fetch(SB_ALL + '?date=eq.__filings__', {headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}});
    const rows = await res.json();
    filingItems = rows.length ? (rows[0].cases || []) : [];
    await cleanupFiledFilings();
    if(currentTab === 'filings') renderFilings();
  } catch(e) {}
}

async function saveFilingsToSupabase() {
  try {
    const res = await fetch(SB_ALL + '?date=eq.__filings__', {headers:{'apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY}});
    const rows = await res.json();
    if(rows.length) {
      await fetch(SB_ALL + '?date=eq.__filings__', {method:'PATCH', headers:SB_HDR, body:JSON.stringify({cases:filingItems})});
    } else {
      await fetch(SB_ALL, {method:'POST', headers:{...SB_HDR,'Prefer':'return=minimal'}, body:JSON.stringify({date:'__filings__', cases:filingItems})});
    }
  } catch(e) {}
}

// ── RENDER MISC ───────────────────────────────────────────
function renderMisc() {
  const wrap = document.getElementById('miscWrap');
  const countEl = document.getElementById('miscCount');
  if(countEl) countEl.textContent = '— ' + miscItems.length + (miscItems.length !== 1 ? ' tasks' : ' task');
  const pending = miscItems.filter(m => m.mStatus === 'pending').length;
  const progress = miscItems.filter(m => m.mStatus === 'progress').length;
  const done = miscItems.filter(m => m.mStatus === 'done').length;
  const statsEl = document.getElementById('miscStats');
  if(statsEl) statsEl.innerHTML =
    '<div class="mstat"><span class="mstat-n">'+pending+'</span><span class="mstat-l">Pending</span></div>'+
    '<div class="mstat"><span class="mstat-n">'+progress+'</span><span class="mstat-l">In Progress</span></div>'+
    '<div class="mstat"><span class="mstat-n">'+done+'</span><span class="mstat-l">Done</span></div>';
  if(!miscItems.length) {
    wrap.innerHTML = '<div class="empty"><div class="ei">📋</div><h3>No tasks yet</h3><p>Add miscellaneous work using the button below</p></div>';
    return;
  }
  const active = miscItems.filter(m => m.mStatus !== 'done').sort((a,b) => {
    if(a.priority==='urgent' && b.priority!=='urgent') return -1;
    if(b.priority==='urgent' && a.priority!=='urgent') return 1;
    return 0;
  });
  const completed = miscItems.filter(m => m.mStatus === 'done').sort((a,b) => {
    // most recently completed first
    return (b.completedOn||'') > (a.completedOn||'') ? 1 : -1;
  });
  let html = '';
  if(active.length){
    html += active.map(m => miscCardHtml(m)).join('');
  } else {
    html += '<div class="empty" style="padding:1.5rem 0"><div class="ei">✅</div><h3>All tasks completed</h3></div>';
  }
  if(completed.length){
    const compId = 'compSection';
    html += '<div class="misc-completed-section" id="'+compId+'">';
    html += '<div class="misc-completed-header" onclick="toggleCompletedSection()">'+
      '<span>Completed ('+completed.length+')</span>'+
      '<span class="misc-comp-toggle" id="compToggleIcon">▸</span>'+
    '</div>';
    html += '<div class="misc-completed-body" id="compBody" style="display:none">'+
      completed.map(m => miscCardHtml(m)).join('')+
    '</div>';
    html += '</div>';
  }
  wrap.innerHTML = html;
}

function miscCardHtml(m) {
  const id = m.id;
  const statusMap = {pending:'mb-pending', progress:'mb-progress', done:'mb-done'};
  const statusLabel = {pending:'Pending', progress:'In Progress', done:'Done'};
  const advPill = m.assignedTo ? '<span class="cc-adv-pill">\u{1F464} '+m.assignedTo+'</span>' : '';
  const notePill = m.note ? '<span class="cc-note-pill">\u{1F4DD} '+(m.note.length>40?m.note.substring(0,40)+'…':m.note)+'</span>' : '';
  const stbtns = ['pending','progress','done'].map(function(s){
    return '<button class="stbtn '+(m.mStatus===s?'on-attended':'')+'" data-id="'+id+'" data-s="'+s+'" onclick="setMiscStatus(this.dataset.id,this.dataset.s);event.stopPropagation()">'+(s==='pending'?'Pending':s==='progress'?'In Progress':'Done')+'</button>';
  }).join('');
  const advbtns = cols.map(function(col){
    return '<button class="advbtn '+(m.assignedTo===col?'on':'')+'" data-id="'+id+'" data-col="'+col+'" onclick="setMiscAdv(this.dataset.id,this.dataset.col);event.stopPropagation()"><span class="adot"></span>'+col+'</button>';
  }).join('');
  const urgBtn = m.priority==='urgent'
    ? '<button class="da-btn" data-id="'+id+'" onclick="setMiscPriority(this.dataset.id,\'normal\');event.stopPropagation()">Remove Urgent</button>'
    : '<button class="da-btn urg" data-id="'+id+'" onclick="setMiscPriority(this.dataset.id,\'urgent\');event.stopPropagation()">\u{1F6A8} Mark Urgent</button>';
  return '<div class="misc-card '+(m.priority==='urgent'?'urgent-task':m.mStatus==='done'?'done-task':'')+'" id="mc-'+id+'">'+
    '<div class="misc-summary" data-id="'+id+'" onclick="toggleMisc(this.dataset.id)">'+
      '<div class="misc-summary-l">'+
        '<div class="misc-title '+(m.mStatus==='done'?'misc-title-done':'')+'">'+m.title+'</div>'+
        (m.mStatus==='done' && m.completedOn ? '<div class="misc-completed-stamp">Completed on '+formatDateFromKey(m.completedOn)+'</div>' : '')+
        '<div class="misc-meta">'+
          '<span class="misc-badge '+(statusMap[m.mStatus]||'mb-pending')+'">'+(statusLabel[m.mStatus]||'Pending')+'</span>'+
          (m.priority==='urgent'?'<span class="misc-badge mb-urgent">Urgent</span>':'')+
          advPill + notePill +
        '</div>'+
      '</div>'+
      '<span class="expand-icon">▾</span>'+
    '</div>'+
    '<div class="misc-details">'+
      '<div class="detail-section"><div class="detail-lbl">Status</div><div class="status-btns">'+stbtns+'</div></div>'+
      '<div class="detail-section"><div class="detail-lbl">Assigned To</div><div class="adv-btns">'+advbtns+'</div></div>'+
      '<div class="detail-section"><div class="detail-lbl">Note</div>'+
        '<input class="note-in" value="'+( m.note||'').replace(/"/g,'&quot;')+'" placeholder="Details…" data-id="'+id+'" oninput="setMiscNote(this.dataset.id,this.value)" onblur="saveMiscToSupabase()" onclick="event.stopPropagation()"/>'+
      '</div>'+
      '<div class="detail-actions">'+
        urgBtn+
        '<button class="da-btn" data-id="'+id+'" onclick="openMiscModal(this.dataset.id);event.stopPropagation()">✏️ Edit</button>'+
        '<button class="da-btn del" data-id="'+id+'" onclick="deleteMisc(this.dataset.id);event.stopPropagation()">\u{1F5D1} Delete</button>'+
      '</div>'+
    '</div>'+
  '</div>';
}
function toggleMisc(id) { document.getElementById('mc-'+id)?.classList.toggle('open'); }
function setMiscStatus(id,s) {
  const m=miscItems.find(x=>x.id===id);
  if(m){
    m.mStatus=s;
    if(s==='done' && !m.completedOn){
      m.completedOn = getDateKey(0); // today's date DD-MM-YYYY
    } else if(s!=='done'){
      m.completedOn = null;
    }
    renderMisc();
    saveMiscToSupabase();
  }
}
function setMiscAdv(id,a) { const m=miscItems.find(x=>x.id===id); if(m){m.assignedTo=(m.assignedTo===a?'':a);renderMisc();saveMiscToSupabase();} }
function setMiscNote(id,v) { const m=miscItems.find(x=>x.id===id); if(m) m.note=v; }
function setMiscPriority(id,p) { const m=miscItems.find(x=>x.id===id); if(m){m.priority=p;renderMisc();saveMiscToSupabase();} }
function deleteMisc(id) {
  showDeleteConfirm('Are you sure you want to delete this task?', function(){
    miscItems=miscItems.filter(x=>x.id!==id);
    renderMisc();
    saveMiscToSupabase();
  });
}

function openMiscModal(id) {
  miscEditId = id || null;
  const m = id ? miscItems.find(x=>x.id===id) : null;
  document.getElementById('miscMTitle').textContent = m ? 'Edit Task' : 'Add Task';
  document.getElementById('mfTitle').value = m ? m.title : '';
  document.getElementById('mfPriority').value = m ? (m.priority||'normal') : 'normal';
  document.getElementById('mfStatus').value = m ? (m.mStatus||'pending') : 'pending';
  document.getElementById('mfNote').value = m ? (m.note||'') : '';
  const advSel = document.getElementById('mfAdv');
  advSel.innerHTML = '<option value="">Unassigned</option>' + cols.map(c => '<option value="'+c+'"'+(m&&m.assignedTo===c?' selected':'')+'>'+c+'</option>').join('');
  document.getElementById('miscOverlay').classList.add('on');
}
function closeMiscModal() { document.getElementById('miscOverlay').classList.remove('on'); miscEditId=null; }
function saveMiscModal() {
  const title = document.getElementById('mfTitle').value.trim();
  if(!title) { alert('Please enter a task title.'); return; }
  const item = {
    id: miscEditId || (Date.now()+'-'+Math.random().toString(36).substr(2,5)),
    title, assignedTo: document.getElementById('mfAdv').value,
    priority: document.getElementById('mfPriority').value,
    mStatus: document.getElementById('mfStatus').value,
    note: document.getElementById('mfNote').value.trim()
  };
  if(miscEditId) { const i=miscItems.findIndex(x=>x.id===miscEditId); if(i>=0) miscItems[i]=item; }
  else miscItems.push(item);
  renderMisc(); saveMiscToSupabase(); closeMiscModal();
}


// ── RENDER FILINGS ────────────────────────────────────────
function renderFilings() {
  const wrap = document.getElementById('filingsWrap');
  const countEl = document.getElementById('filingsCount');
  if(countEl) countEl.textContent = '— ' + filingItems.length + (filingItems.length!==1?' filings':' filing');
  const draft = filingItems.filter(f=>f.fStatus==='draft').length;
  const ready = filingItems.filter(f=>f.fStatus==='ready').length;
  const filedCount = filingItems.filter(f=>f.fStatus==='filed').length;
  const overdue = filingItems.filter(f=>isOverdue(f)).length;
  const statsEl = document.getElementById('filingStats');
  if(statsEl) statsEl.innerHTML =
    '<div class="mstat"><span class="mstat-n">'+draft+'</span><span class="mstat-l">Draft</span></div>'+
    '<div class="mstat"><span class="mstat-n">'+ready+'</span><span class="mstat-l">Ready</span></div>'+
    '<div class="mstat"><span class="mstat-n">'+filedCount+'</span><span class="mstat-l">Filed</span></div>'+
    (overdue?'<div class="mstat" style="border-color:#e08080"><span class="mstat-n" style="color:var(--urg)">'+overdue+'</span><span class="mstat-l">Overdue</span></div>':'');
  if(!filingItems.length) {
    wrap.innerHTML = '<div class="empty"><div class="ei">📁</div><h3>No filings yet</h3><p>Add fresh filings using the button below</p></div>';
    return;
  }
  const active = filingItems.filter(f => f.fStatus !== 'filed').sort((a,b) => {
    const aOD = isOverdue(a) ? 0 : 1;
    const bOD = isOverdue(b) ? 0 : 1;
    if(aOD !== bOD) return aOD - bOD; // overdue first
    if(!a.deadline && !b.deadline) return 0;
    if(!a.deadline) return 1; if(!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });
  const filed = filingItems.filter(f => f.fStatus === 'filed').sort((a,b) => {
    return (b.filedOn||'') > (a.filedOn||'') ? 1 : -1;
  });
  let html = '';
  if(active.length){
    html += active.map(f => filingCardHtml(f)).join('');
  } else {
    html += '<div class="empty" style="padding:1.5rem 0"><div class="ei">✅</div><h3>All filings done</h3></div>';
  }
  if(filed.length){
    html += '<div class="misc-completed-section" id="filedSection">';
    html += '<div class="misc-completed-header" onclick="toggleFiledSection()">'+
      '<span>Filed ('+filed.length+')</span>'+
      '<span class="misc-comp-toggle" id="filedToggleIcon">▸</span>'+
    '</div>';
    html += '<div class="misc-completed-body" id="filedBody" style="display:none">'+
      filed.map(f => filingCardHtml(f)).join('')+
    '</div>';
    html += '</div>';
  }
  wrap.innerHTML = html;
}

function isOverdue(f) {
  if(!f.deadline||f.fStatus==='filed'||f.fStatus==='registered') return false;
  return new Date(f.deadline) < new Date();
}

function deadlineBadge(f) {
  if(!f.deadline) return '';
  const d=new Date(f.deadline); const today=new Date(); today.setHours(0,0,0,0); d.setHours(0,0,0,0);
  const diff = Math.round((d-today)/86400000);
  const label = d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  if(diff<0) return '<span class="deadline-badge db-overdue">Overdue: '+label+'</span>';
  if(diff<=7) return '<span class="deadline-badge db-soon">By '+label+'</span>';
  return '<span class="deadline-badge db-ok">By '+label+'</span>';
}

function filingCardHtml(f) {
  const id = f.id;
  const isFiled = f.fStatus==='filed';
  const statusLabels = {draft:'Draft', ready:'Ready to File', filed:'Filed', registered:'Registered'};
  const advPill = f.assignedTo ? '<span class="cc-adv-pill">\u{1F464} '+f.assignedTo+'</span>' : '';
  const stbtns = ['draft','ready','filed'].map(function(s){
    return '<button class="stbtn '+(f.fStatus===s?'on-attended':'')+'" data-id="'+id+'" data-s="'+s+'" onclick="setFilingStatus(this.dataset.id,this.dataset.s);event.stopPropagation()">'+(statusLabels[s]||s)+'</button>';
  }).join('');
  const advbtns = cols.map(function(col){
    return '<button class="advbtn '+(f.assignedTo===col?'on':'')+'" data-id="'+id+'" data-col="'+col+'" onclick="setFilingAdv(this.dataset.id,this.dataset.col);event.stopPropagation()"><span class="adot"></span>'+col+'</button>';
  }).join('');
  return '<div class="filing-card '+(isOverdue(f)?'overdue':isFiled?'filed':'')+'" id="fc-'+id+'">'+
    '<div class="filing-summary" data-id="'+id+'" onclick="toggleFiling(this.dataset.id)">'+
      '<div class="filing-summary-l">'+
        '<div class="filing-title '+(isFiled?'misc-title-done':'')+'">'+f.parties+'</div>'+
        (isFiled && f.filedOn ? '<div class="misc-completed-stamp">Filed on '+formatDateFromKey(f.filedOn)+'</div>' : '')+
        '<div class="filing-meta">'+
          '<span class="case-stage-lbl">'+f.fType+'</span>'+
          deadlineBadge(f)+
          '<span class="misc-badge mb-pending">'+(statusLabels[f.fStatus]||f.fStatus)+'</span>'+
          advPill+
        '</div>'+
      '</div>'+
      '<span class="expand-icon">▾</span>'+
    '</div>'+
    '<div class="filing-details">'+
      '<div class="detail-section"><div class="detail-lbl">Status</div><div class="status-btns">'+stbtns+'</div></div>'+
      '<div class="detail-section"><div class="detail-lbl">Assigned To</div><div class="adv-btns">'+advbtns+'</div></div>'+
      '<div class="detail-section"><div class="detail-lbl">By / Before Date</div>'+
        '<input type="date" class="note-in" value="'+(f.deadline||'')+'" data-id="'+id+'" onchange="setFilingDeadline(this.dataset.id,this.value)" onclick="event.stopPropagation()"/>'+
      '</div>'+
      '<div class="detail-section"><div class="detail-lbl">Note</div>'+
        '<input class="note-in" value="'+(f.note||'').replace(/"/g,'&quot;')+'" placeholder="Documents needed, remarks…" data-id="'+id+'" oninput="setFilingNote(this.dataset.id,this.value)" onblur="saveFilingsToSupabase()" onclick="event.stopPropagation()"/>'+
      '</div>'+
      '<div class="detail-actions">'+
        '<button class="da-btn" data-id="'+id+'" onclick="openFilingModal(this.dataset.id);event.stopPropagation()">✏️ Edit</button>'+
        '<button class="da-btn del" data-id="'+id+'" onclick="deleteFiling(this.dataset.id);event.stopPropagation()">\u{1F5D1} Delete</button>'+
      '</div>'+
    '</div>'+
  '</div>';
}
function toggleFiling(id) { document.getElementById('fc-'+id)?.classList.toggle('open'); }
function setFilingStatus(id,s) {
  const f=filingItems.find(x=>x.id===id);
  if(f){
    f.fStatus=s;
    if(s==='filed' && !f.filedOn){
      f.filedOn = getDateKey(0);
    } else if(s!=='filed'){
      f.filedOn = null;
    }
    renderFilings();
    saveFilingsToSupabase();
  }
}
function setFilingAdv(id,a) { const f=filingItems.find(x=>x.id===id); if(f){f.assignedTo=(f.assignedTo===a?'':a);renderFilings();saveFilingsToSupabase();} }
function setFilingNote(id,v) { const f=filingItems.find(x=>x.id===id); if(f) f.note=v; }
function setFilingDeadline(id,v) { const f=filingItems.find(x=>x.id===id); if(f){f.deadline=v;renderFilings();saveFilingsToSupabase();} }
function deleteFiling(id) {
  showDeleteConfirm('Are you sure you want to delete this filing?', function(){
    filingItems=filingItems.filter(x=>x.id!==id);
    renderFilings();
    saveFilingsToSupabase();
  });
}

function openFilingModal(id) {
  filingEditId = id || null;
  const f = id ? filingItems.find(x=>x.id===id) : null;
  document.getElementById('filingMTitle').textContent = f ? 'Edit Filing' : 'Add Filing';
  document.getElementById('ffParties').value = f ? f.parties : '';
  document.getElementById('ffType').value = f ? f.fType : 'Civil';
  document.getElementById('ffDeadline').value = f ? (f.deadline||'') : '';
  document.getElementById('ffStatus').value = f ? f.fStatus : 'draft';
  document.getElementById('ffNote').value = f ? (f.note||'') : '';
  const advSel = document.getElementById('ffAdv');
  advSel.innerHTML = '<option value="">Unassigned</option>' + cols.map(c => '<option value="'+c+'"'+(f&&f.assignedTo===c?' selected':'')+'>'+c+'</option>').join('');
  document.getElementById('filingOverlay').classList.add('on');
}
function closeFilingModal() { document.getElementById('filingOverlay').classList.remove('on'); filingEditId=null; }
function saveFilingModal() {
  const parties = document.getElementById('ffParties').value.trim();
  if(!parties) { alert('Please enter party names.'); return; }
  const item = {
    id: filingEditId || (Date.now()+'-'+Math.random().toString(36).substr(2,5)),
    parties, fType: document.getElementById('ffType').value,
    assignedTo: document.getElementById('ffAdv').value,
    deadline: document.getElementById('ffDeadline').value,
    fStatus: document.getElementById('ffStatus').value,
    note: document.getElementById('ffNote').value.trim()
  };
  if(filingEditId) { const i=filingItems.findIndex(x=>x.id===filingEditId); if(i>=0) filingItems[i]=item; }
  else filingItems.push(item);
  renderFilings(); saveFilingsToSupabase(); closeFilingModal();
}



// ── SCROLL-AWARE TABS NAV ──────────────────────────────
(function(){
  let lastY = 0;
  let ticking = false;
  const nav = document.querySelector('.tabs-nav');
  window.addEventListener('scroll', function(){
    if(!ticking){
      requestAnimationFrame(function(){
        const y = window.scrollY;
        if(y <= 10){
          // At top — always show
          nav.classList.remove('hidden');
        } else if(y > lastY){
          // Scrolling down — hide
          nav.classList.add('hidden');
        } else {
          // Scrolling up — show
          nav.classList.remove('hidden');
        }
        lastY = y;
        ticking = false;
      });
      ticking = true;
    }
  }, {passive: true});
})();

