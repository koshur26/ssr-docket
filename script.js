

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
  html += '<img src="https://ssrdocket.work.gd/SSR_Logo_Circle.png" style="width:42pt;height:42pt;border-radius:50%;object-fit:cover" alt="SSR">';
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
  html += '<img src="https://ssrdocket.work.gd/SSR_Logo_Circle.png" style="width:42pt;height:42pt;border-radius:50%;object-fit:cover" alt="SSR">';
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

