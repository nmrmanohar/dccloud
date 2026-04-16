/**
 * app.js – DC Cloud Training Operations
 * Single-page app with hash-based routing.
 * Data loaded from GitHub (private repo) via storage.js
 */

// ── In-memory cache ───────────────────────────────────────────────────
const cache = { trainings: null, vendors: null, trainers: null };
let _importEntity = null; // which entity is being imported

async function loadEntity(entity) {
  if (!cache[entity]) cache[entity] = await storage.getAll(entity);
  return cache[entity];
}
function invalidate(entity) { cache[entity] = null; }

// ── Routing ───────────────────────────────────────────────────────────
function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '') || 'trainings';
  const [entity = 'trainings', action, id] = raw.split('/');
  return { entity, action, id };
}

function navigate(path) { location.hash = '#/' + path; }

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

window.addEventListener('hashchange', route);
window.navigate = navigate;
window.toggleSidebar = toggleSidebar;

function showAppShell() {
  document.getElementById('auth-shell').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  // Show/hide admin nav
  document.getElementById('nav-admin').style.display = auth.isAdmin ? 'block' : 'none';
  // Update user pill
  const pill = document.getElementById('userPill');
  const initials = (auth.displayName || auth.currentUser?.username || '?')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const roleColors = { admin: '#7c3aed', editor: '#1d4ed8', viewer: '#15803d' };
  pill.innerHTML = `
    <span class="avatar" style="background:${roleColors[auth.role]||'#666'}">${esc(initials)}</span>
    ${esc(auth.displayName || auth.currentUser?.username)}
    <span class="role-tag">${esc(auth.role)}</span>`;
}

function showAuthShell(html) {
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-shell').style.display = 'block';
  document.getElementById('auth-content').innerHTML = html;
}

async function route() {
  // Auth guard — must be logged in to use the app
  if (!auth.isLoggedIn) {
    const users = storage.configUsers;
    if (!users || users.length === 0) showFirstTimeSetup();
    else showLoginPage();
    return;
  }

  showAppShell();
  const { entity, action, id } = parseRoute();

  // Highlight active nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === entity);
  });

  const content = document.getElementById('content');
  content.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    if (entity === 'trainings') {
      if (action === 'new')       await showTrainingForm(null);
      else if (action === 'edit') await showTrainingForm(id);
      else                        await showTrainingsList();
    } else if (entity === 'vendors') {
      if (action === 'new')       await showVendorForm(null);
      else if (action === 'edit') await showVendorForm(id);
      else                        await showVendorsList();
    } else if (entity === 'trainers') {
      if (action === 'new')       await showTrainerForm(null);
      else if (action === 'edit') await showTrainerForm(id);
      else                        await showTrainersList();
    } else if (entity === 'users') {
      if (!auth.isAdmin) { navigate('trainings'); return; }
      showUserManagement();
    } else if (entity === 'settings') {
      showSettings();
    } else {
      await showTrainingsList();
    }
  } catch (err) {
    content.innerHTML = `<div class="empty-state"><h3>Error</h3><p>${esc(err.message)}</p>
      <button class="btn" onclick="route()">Retry</button></div>`;
  }
}

// ── Toast & Modal ─────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.className = 'toast', 3200);
}

let _modalResolve;
function confirm(msg, title = 'Confirm Delete') {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').textContent  = msg;
  document.getElementById('modalOverlay').style.display = 'flex';
  return new Promise(res => { _modalResolve = res; });
}
function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
  if (_modalResolve) _modalResolve(false);
}
document.getElementById('modalConfirm').onclick = () => {
  document.getElementById('modalOverlay').style.display = 'none';
  if (_modalResolve) _modalResolve(true);
};
window.closeModal = closeModal;

// ── Vendor / Trainer name lookup ──────────────────────────────────────
function vendorName(id) {
  return (cache.vendors || []).find(v => v.id === id)?.account_name || '';
}
function trainerName(id) {
  const t = (cache.trainers || []).find(t => t.id === id);
  return t ? `${t.first_name} ${t.last_name}`.trim() : '';
}

// ═══════════════════════════════════════════════════════════════════════
// TRAININGS LIST
// ═══════════════════════════════════════════════════════════════════════
let _fyYear = null; // set on first load based on role
let _search = '';

async function showTrainingsList() {
  // Default view: viewers start on Audit Info (last month); others on This FY
  if (_fyYear === null) _fyYear = auth.role === 'viewer' ? 'lastmonth' : 'current';

  await Promise.all([loadEntity('trainings'), loadEntity('vendors'), loadEntity('trainers')]);

  // Build list of unique FY years from data
  const fySet = new Set();
  cache.trainings.forEach(t => {
    if (t.invoice_date) {
      const d = new Date(t.invoice_date + 'T00:00:00');
      if (!isNaN(d)) fySet.add(d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1);
    }
  });
  const fyYears = Array.from(fySet).sort((a, b) => b - a);

  const fy = currentFYRange();
  let rows = cache.trainings.slice();

  // Compute last-month range (used for both filter and label)
  const _now = new Date();
  const _lmY = _now.getMonth() === 0 ? _now.getFullYear() - 1 : _now.getFullYear();
  const _lmM = _now.getMonth() === 0 ? 11 : _now.getMonth() - 1;
  const lastMonthStart = new Date(_lmY, _lmM, 1);
  const lastMonthEnd   = new Date(_lmY, _lmM + 1, 0, 23, 59, 59);
  const lastMonthLabel = lastMonthStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  if (_fyYear === 'current') {
    rows = rows.filter(t => inCurrentFY(t.invoice_date));
  } else if (_fyYear === 'prev') {
    const yr = currentFYRange().start.getFullYear() - 1;
    const s = new Date(yr, 3, 1), e = new Date(yr + 1, 2, 31, 23, 59, 59);
    rows = rows.filter(t => {
      if (!t.invoice_date) return false;
      const d = new Date(t.invoice_date + 'T00:00:00');
      return d >= s && d <= e;
    });
  } else if (_fyYear === 'lastmonth') {
    rows = rows.filter(t => {
      if (!t.invoice_date) return false;
      const d = new Date(t.invoice_date + 'T00:00:00');
      return d >= lastMonthStart && d <= lastMonthEnd;
    });
  } else if (_fyYear !== 'all') {
    const yr = parseInt(_fyYear);
    const s = new Date(yr, 3, 1), e = new Date(yr + 1, 2, 31, 23, 59, 59);
    rows = rows.filter(t => {
      if (!t.invoice_date) return false;
      const d = new Date(t.invoice_date + 'T00:00:00');
      return d >= s && d <= e;
    });
  }

  if (_search) {
    const q = _search.toLowerCase();
    rows = rows.filter(t =>
      (t.invoice_number || '').toLowerCase().includes(q) ||
      (t.course_name    || '').toLowerCase().includes(q) ||
      (vendorName(t.vendor_id)).toLowerCase().includes(q)
    );
  }
  rows.sort((a, b) => (b.invoice_number || '').localeCompare(a.invoice_number || ''));

  const totInvoice  = rows.reduce((s, t) => s + (+t.invoice_value   || 0), 0);
  const totReceived = rows.reduce((s, t) => s + (+t.received_amount  || 0), 0);
  const totGST      = rows.reduce((s, t) => s + (+t.gst_amount       || 0), 0);
  const totTrainer  = rows.reduce((s, t) => s + (+t.total_trainer_fee|| 0), 0);

  const curFYStart  = currentFYRange().start;
  const prevFYStart = curFYStart.getFullYear() - 1;

  const fyLabel = _fyYear === 'all'       ? 'All Trainings'
    : _fyYear === 'current'   ? fy.label
    : _fyYear === 'prev'      ? `Previous FY (${prevFYStart}-${String(prevFYStart+1).slice(2)}) Trainings`
    : _fyYear === 'lastmonth' ? `Audit Info – ${lastMonthLabel}`
    : `FY ${_fyYear}-${String(parseInt(_fyYear)+1).slice(2)} Trainings`;
  const fySelectOpts = `
    <option value="lastmonth" ${_fyYear==='lastmonth'?'selected':''}>Audit Info (${lastMonthLabel})</option>
    <option value="current"   ${_fyYear==='current'  ?'selected':''}>This FY</option>
    <option value="prev"      ${_fyYear==='prev'     ?'selected':''}>Previous FY (${prevFYStart}-${String(prevFYStart+1).slice(2)})</option>
    ${fyYears.map(y => `<option value="${y}" ${_fyYear==y?'selected':''}>${y}-${String(y+1).slice(2)}</option>`).join('')}
    <option value="all"       ${_fyYear==='all'      ?'selected':''}>All Years</option>`;

  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="toolbar">
      <span class="toolbar-title">${esc(fyLabel)}</span>
      ${auth.canWrite ? `<button class="btn btn-primary" onclick="navigate('trainings/new')">+ New</button>` : ''}
      <div class="toolbar-sep"></div>
      <button class="btn" onclick="exportTrainings()">⬇ Export CSV</button>
      ${auth.canWrite ? `<button class="btn" onclick="triggerImport('trainings')">⬆ Import Excel</button>` : ''}
      <div class="toolbar-sep"></div>
      <button class="btn" onclick="showGSTLastMonth()">GST Last Month</button>
    </div>

    <div class="filter-bar">
      <input class="search-box" type="text" placeholder="Search invoice #, course, vendor…"
        value="${esc(_search)}" oninput="onSearchChange(this.value)" />
      <select class="filter-select" onchange="onFYChange(this.value)">${fySelectOpts}</select>
      <span class="filter-count">${rows.length} record(s)</span>
    </div>

    <div class="stats-bar">
      <div class="stat-item"><div class="stat-value">${fmtINR(totInvoice)}</div><div class="stat-label">Total Invoiced</div></div>
      <div class="stat-item"><div class="stat-value">${fmtINR(totReceived)}</div><div class="stat-label">Total Received</div></div>
      <div class="stat-item"><div class="stat-value">${fmtINR(totGST)}</div><div class="stat-label">Total GST</div></div>
      <div class="stat-item"><div class="stat-value">${fmtINR(totTrainer)}</div><div class="stat-label">Total Trainer Fee</div></div>
    </div>

    <div class="table-container">
      ${rows.length === 0
        ? `<div class="empty-state"><h3>No records</h3><p>Click "+ New" to add a training.</p></div>`
        : `<table>
          <thead><tr>
            <th class="checkbox-col"></th>
            <th>Payment Status</th>
            <th>Invoice No.</th>
            <th>Invoice Date</th>
            <th>Payment Due</th>
            <th>Course Name</th>
            <th>Vendor</th>
            <th>Currency</th>
            <th>Per Day Fee</th>
            <th>Trainer</th>
            <th>Total Trainer Fee</th>
            <th>Invoice Value</th>
            <th>Received Amt</th>
            <th>GST Amount</th>
          </tr></thead>
          <tbody>${rows.map(t => `
            <tr>
              <td></td>
              <td>${payBadge(t.payment_status)}</td>
              <td><a class="link" onclick="navigate('trainings/edit/${t.id}')">${esc(t.invoice_number)}</a></td>
              <td>${fmtDate(t.invoice_date)}</td>
              <td>${fmtDate(t.payment_due_date)}</td>
              <td>${esc(t.course_name)}</td>
              <td>${esc(vendorName(t.vendor_id))}</td>
              <td>${esc(t.currency)}</td>
              <td class="amt">${t.currency === 'USD' ? fmtUSD(t.per_day_fee) : fmtINR(t.per_day_fee)}</td>
              <td>${esc(trainerName(t.trainer_id))}</td>
              <td class="amt">${fmtINR(t.total_trainer_fee)}</td>
              <td class="amt">${fmtINR(t.invoice_value)}</td>
              <td class="amt">${fmtINR(t.received_amount)}</td>
              <td class="amt">${fmtINR(t.gst_amount)}</td>
            </tr>`).join('')}
          </tbody>
        </table>`}
    </div>`;
}

function payBadge(status) {
  const cls = status === 'Paid' ? 'paid' : status === 'Paid without GST' ? 'partial' : 'not-paid';
  return `<span class="badge badge-${cls}">${esc(status || 'Not Paid')}</span>`;
}

window.onSearchChange = function(v) { _search = v; showTrainingsList(); };
window.onFYChange     = function(v) { _fyYear = v; showTrainingsList(); };

window.exportTrainings = async function() {
  await loadEntity('vendors'); await loadEntity('trainers');
  const rows = cache.trainings;
  const headers = ['Invoice No','Invoice Date','Payment Due','Course Name','PO Number','Date of Course',
    'Vendor','Customer','Currency','Exchange Rate','Per Day Fee (orig)','Days','GST Required',
    'Invoice Value (INR)','GST Amount (INR)','GST Credited','Payment Status','Received Amount (INR)',
    'Paid Date','Trainer','Trainer Fee/Day (INR)','Total Trainer Fee (INR)','Trainer Fee Paid',
    'Trainer TDS Credited','Margin (INR)'];
  const data = rows.map(t => [
    t.invoice_number, t.invoice_date, t.payment_due_date, t.course_name, t.po_number, t.date_of_course,
    vendorName(t.vendor_id), vendorName(t.customer_id), t.currency, t.exchange_rate, t.per_day_fee, t.days,
    t.gst_required, t.invoice_value, t.gst_amount, t.gst_credited, t.payment_status, t.received_amount,
    t.paid_date, trainerName(t.trainer_id), t.trainer_fee_per_day, t.total_trainer_fee,
    t.trainer_fee_paid, t.trainer_tds_credited, t.margin
  ]);
  downloadCSV([headers, ...data], `dc-cloud-trainings-${new Date().toISOString().slice(0,10)}.csv`);
};

// ═══════════════════════════════════════════════════════════════════════
// TRAINING FORM
// ═══════════════════════════════════════════════════════════════════════
async function showTrainingForm(id) {
  await Promise.all([loadEntity('trainings'), loadEntity('vendors'), loadEntity('trainers')]);

  const isNew = !id;
  const rec = isNew
    ? { id: generateId(), currency: 'INR', gst_required: 'No',
        payment_status: 'Not Paid', days: 1,
        trainer_fee_paid: 'NA', trainer_tds_credited: 'NA', gst_credited: 'NA' }
    : cache.trainings.find(t => t.id === id);

  if (!rec) { toast('Record not found', 'error'); navigate('trainings'); return; }

  const vOpts  = cache.vendors.map(v => `<option value="${v.id}" ${v.id === rec.vendor_id ? 'selected' : ''}>${esc(v.account_name)}</option>`).join('');
  const cOpts  = `<option value="">-- None --</option>` + cache.vendors.map(v => `<option value="${v.id}" ${v.id === rec.customer_id ? 'selected' : ''}>${esc(v.account_name)}</option>`).join('');
  const trOpts = `<option value="">-- None --</option>` + cache.trainers.map(t => `<option value="${t.id}" ${t.id === rec.trainer_id ? 'selected' : ''}>${esc(t.first_name + ' ' + t.last_name)}</option>`).join('');

  const invoiceVal = calcAmountToReceive(rec.per_day_fee, rec.days, rec.currency, rec.exchange_rate, rec.gst_required);
  const gstAmt     = calcGST(rec.per_day_fee, rec.days, rec.currency, rec.gst_required);
  const trainerFee = calcTotalTrainerFee(rec.trainer_fee_per_day, rec.days);
  const margin     = calcMargin(rec.received_amount, trainerFee);

  const showUSD    = rec.currency === 'USD';
  const showGSTRow = rec.gst_required === 'Yes' && rec.currency === 'INR';

  document.getElementById('content').innerHTML = `
    <div class="form-toolbar">
      <div class="form-toolbar-left">
        <a class="link form-breadcrumb" onclick="navigate('trainings')">← Trainings List</a>
        <span class="form-breadcrumb">/</span>
        <span class="record-title">${isNew ? 'New Training' : esc(rec.invoice_number)}</span>
        ${isNew ? '' : '<span style="color:#999;font-size:12px">– Saved</span>'}
      </div>
      <button class="btn btn-primary" onclick="saveTraining('${rec.id}',${isNew})">💾 Save</button>
      <button class="btn btn-primary" onclick="saveAndClose('${rec.id}',${isNew})">Save &amp; Close</button>
      ${isNew ? '' : `<button class="btn btn-danger" onclick="deleteTraining('${rec.id}')">🗑 Delete</button>`}
    </div>

    <div class="form-meta-bar">
      <div class="form-meta-item"><div class="form-meta-label">Invoice Number</div><div class="form-meta-value">${esc(rec.invoice_number || '—')}</div></div>
      <div class="form-meta-item"><div class="form-meta-label">Invoice Date</div><div class="form-meta-value">${fmtDate(rec.invoice_date)}</div></div>
      <div class="form-meta-item"><div class="form-meta-label">Margin</div><div class="form-meta-value highlight" id="meta-margin">${fmtINR(margin)}</div></div>
    </div>

    <div class="form-body" id="formBody">

      <!-- GENERAL -->
      <div class="form-card">
        <div class="form-card-title">General</div>
        <div class="form-card-body">
          <div class="form-group">
            <label class="req">Invoice Number</label>
            <input type="text" id="f-invoice_number" value="${esc(rec.invoice_number||'')}" placeholder="DC-26-001" />
          </div>
          <div class="form-group">
            <label class="req">Invoice Date</label>
            <input type="date" id="f-invoice_date" value="${esc(rec.invoice_date||'')}" />
          </div>
          <div class="form-group">
            <label class="req">Course Name</label>
            <input type="text" id="f-course_name" value="${esc(rec.course_name||'')}" />
          </div>
          <div class="form-group">
            <label>PO Number</label>
            <input type="text" id="f-po_number" value="${esc(rec.po_number||'')}" />
          </div>
          <div class="form-group">
            <label>Date of Course (PO)</label>
            <input type="date" id="f-date_of_course" value="${esc(rec.date_of_course||'')}" />
          </div>
          <div class="form-group">
            <label class="req">Vendor</label>
            <select id="f-vendor_id"><option value="">-- Select Vendor --</option>${vOpts}</select>
          </div>
          <div class="form-group">
            <label>Customer</label>
            <select id="f-customer_id">${cOpts}</select>
          </div>
          <div class="form-group">
            <label class="req">GST Required?</label>
            <select id="f-gst_required" onchange="onCalcChange()">${opts(OPT_GST_REQUIRED, rec.gst_required)}</select>
          </div>
          <div class="form-group">
            <label class="req">Currency</label>
            <select id="f-currency" onchange="onCurrencyChange()">${opts(OPT_CURRENCY, rec.currency)}</select>
          </div>
          <div class="form-group ${showUSD ? '' : 'hidden'}" id="grp-exchange">
            <label>Exchange Rate (1 USD = INR)</label>
            <input type="number" id="f-exchange_rate" value="${esc(rec.exchange_rate||'')}" step="0.01" oninput="onCalcChange()" />
          </div>
        </div>
      </div>

      <!-- PAYMENT INFO -->
      <div class="form-card">
        <div class="form-card-title">Payment Info</div>
        <div class="form-card-body">
          <div class="form-group">
            <label class="req">Payment Status</label>
            <select id="f-payment_status">${opts(OPT_PAYMENT_STATUS, rec.payment_status)}</select>
          </div>
          <div class="form-group">
            <label>Payment Due Date</label>
            <input type="date" id="f-payment_due_date" value="${esc(rec.payment_due_date||'')}" />
          </div>
          <div class="form-group">
            <label class="req">Per Day Fee</label>
            <input type="number" id="f-per_day_fee" value="${esc(rec.per_day_fee||'')}" step="0.01" oninput="onCalcChange()" />
          </div>
          <div class="form-group">
            <label class="req">Days</label>
            <input type="number" id="f-days" value="${esc(rec.days||1)}" min="1" step="1" oninput="onCalcChange()" />
          </div>
          <div class="form-group">
            <label>Amount to Receive (INR) <small style="color:#999">(auto)</small></label>
            <input type="text" id="f-invoice_value" class="calc" readonly value="${fmtINR(invoiceVal)}" />
          </div>
          <div class="form-group ${showGSTRow ? '' : 'hidden'}" id="grp-gst">
            <label>GST Amount (INR) <small style="color:#999">(auto)</small></label>
            <input type="text" id="f-gst_amount_disp" class="calc" readonly value="${fmtINR(gstAmt)}" />
          </div>
          <div class="form-group ${showGSTRow ? '' : 'hidden'}" id="grp-gst-credit">
            <label>GST Credited?</label>
            <select id="f-gst_credited">${opts(OPT_YES_NO_NA, rec.gst_credited)}</select>
          </div>
          <div class="form-group">
            <label>Received Amount (INR)</label>
            <input type="number" id="f-received_amount" value="${esc(rec.received_amount||'')}" step="0.01" oninput="onCalcChange()" />
          </div>
          <div class="form-group">
            <label>Paid Date</label>
            <input type="date" id="f-paid_date" value="${esc(rec.paid_date||'')}" />
          </div>
        </div>
      </div>

      <!-- TRAINER INFO -->
      <div class="form-card">
        <div class="form-card-title">Trainer Info</div>
        <div class="form-card-body">
          <div class="form-group">
            <label>Trainer</label>
            <select id="f-trainer_id">${trOpts}</select>
          </div>
          <div class="form-group">
            <label>Trainer Fee Per Day (INR incl. taxes)</label>
            <input type="number" id="f-trainer_fee_per_day" value="${esc(rec.trainer_fee_per_day||'')}" step="0.01" oninput="onCalcChange()" />
          </div>
          <div class="form-group">
            <label>Total Trainer Fee (INR) <small style="color:#999">(auto)</small></label>
            <input type="text" id="f-total_trainer_fee_disp" class="calc" readonly value="${fmtINR(trainerFee)}" />
          </div>
          <div class="form-group">
            <label>Trainer Fee Paid?</label>
            <select id="f-trainer_fee_paid">${opts(OPT_YES_NO_NA, rec.trainer_fee_paid)}</select>
          </div>
          <div class="form-group">
            <label>Trainer TDS Credited?</label>
            <select id="f-trainer_tds_credited">${opts(OPT_YES_NO_NA, rec.trainer_tds_credited)}</select>
          </div>

          <hr style="margin:14px 0;border:none;border-top:1px solid #eee"/>

          <div class="form-group">
            <label>Notes / Timeline</label>
            <textarea id="f-notes" rows="4" placeholder="Enter any notes…">${esc(rec.notes||'')}</textarea>
          </div>
        </div>
      </div>

    </div>`;

  // expose hidden raw numeric values via dataset
  document.getElementById('formBody').dataset.recId = rec.id;
}

// Live calc when any relevant field changes
window.onCalcChange = function() {
  const perDay   = parseFloat(document.getElementById('f-per_day_fee')?.value) || 0;
  const days     = parseFloat(document.getElementById('f-days')?.value) || 1;
  const currency = document.getElementById('f-currency')?.value || 'INR';
  const exchange = parseFloat(document.getElementById('f-exchange_rate')?.value) || 1;
  const gstReq   = document.getElementById('f-gst_required')?.value || 'No';
  const received = parseFloat(document.getElementById('f-received_amount')?.value) || 0;
  const trFee    = parseFloat(document.getElementById('f-trainer_fee_per_day')?.value) || 0;

  const invVal  = calcAmountToReceive(perDay, days, currency, exchange, gstReq);
  const gstAmt  = calcGST(perDay, days, currency, gstReq);
  const totTr   = calcTotalTrainerFee(trFee, days);
  const margin  = calcMargin(received, totTr);
  const showGST = gstReq === 'Yes' && currency === 'INR';

  document.getElementById('f-invoice_value').value           = fmtINR(invVal);
  document.getElementById('f-gst_amount_disp').value         = fmtINR(gstAmt);
  document.getElementById('f-total_trainer_fee_disp').value  = fmtINR(totTr);
  document.getElementById('grp-gst').classList.toggle('hidden', !showGST);
  document.getElementById('grp-gst-credit').classList.toggle('hidden', !showGST);
  const metaMargin = document.getElementById('meta-margin');
  if (metaMargin) metaMargin.textContent = fmtINR(margin);
};

window.onCurrencyChange = function() {
  const usd = document.getElementById('f-currency')?.value === 'USD';
  document.getElementById('grp-exchange').classList.toggle('hidden', !usd);
  // if USD, force GST=No
  if (usd) {
    document.getElementById('f-gst_required').value = 'No';
    document.getElementById('grp-gst').classList.add('hidden');
    document.getElementById('grp-gst-credit').classList.add('hidden');
  }
  onCalcChange();
};

function gatherTraining(id) {
  const g = el => document.getElementById(el)?.value?.trim() ?? '';
  const gn = el => parseFloat(document.getElementById(el)?.value) || null;

  const perDay   = parseFloat(document.getElementById('f-per_day_fee')?.value) || 0;
  const days     = parseFloat(document.getElementById('f-days')?.value) || 1;
  const currency = g('f-currency') || 'INR';
  const exchange = parseFloat(document.getElementById('f-exchange_rate')?.value) || null;
  const gstReq   = g('f-gst_required') || 'No';
  const trFee    = parseFloat(document.getElementById('f-trainer_fee_per_day')?.value) || 0;
  const received = parseFloat(document.getElementById('f-received_amount')?.value) || 0;

  const invoiceValue = calcAmountToReceive(perDay, days, currency, exchange, gstReq);
  const gstAmount    = calcGST(perDay, days, currency, gstReq);
  const totalTrFee   = calcTotalTrainerFee(trFee, days);
  const margin       = calcMargin(received, totalTrFee);

  return {
    id,
    invoice_number:       g('f-invoice_number'),
    invoice_date:         g('f-invoice_date'),
    course_name:          g('f-course_name'),
    po_number:            g('f-po_number'),
    date_of_course:       g('f-date_of_course'),
    vendor_id:            g('f-vendor_id'),
    customer_id:          g('f-customer_id'),
    gst_required:         gstReq,
    currency,
    exchange_rate:        exchange,
    per_day_fee:          perDay || null,
    days,
    payment_status:       g('f-payment_status'),
    payment_due_date:     g('f-payment_due_date'),
    invoice_value:        +invoiceValue.toFixed(2),
    gst_amount:           +gstAmount.toFixed(2),
    gst_credited:         g('f-gst_credited'),
    received_amount:      received || null,
    paid_date:            g('f-paid_date'),
    trainer_id:           g('f-trainer_id'),
    trainer_fee_per_day:  trFee || null,
    total_trainer_fee:    +totalTrFee.toFixed(2),
    trainer_fee_paid:     g('f-trainer_fee_paid'),
    trainer_tds_credited: g('f-trainer_tds_credited'),
    margin:               +margin.toFixed(2),
    notes:                g('f-notes')
  };
}

window.saveTraining = async function(id, isNew) {
  const rec = gatherTraining(id);
  if (!rec.invoice_number) { toast('Invoice number is required', 'error'); return; }
  if (!rec.course_name)    { toast('Course name is required',    'error'); return; }
  try {
    await loadEntity('trainings');
    if (isNew) {
      // Check duplicate invoice number
      if (cache.trainings.find(t => t.invoice_number === rec.invoice_number)) {
        toast(`Invoice ${rec.invoice_number} already exists`, 'error'); return;
      }
      cache.trainings.push(rec);
    } else {
      const idx = cache.trainings.findIndex(t => t.id === id);
      if (idx >= 0) cache.trainings[idx] = rec; else cache.trainings.push(rec);
    }
    await storage.saveAll('trainings', cache.trainings, `Save training ${rec.invoice_number}`);
    toast('Saved successfully', 'success');
    if (isNew) navigate(`trainings/edit/${rec.id}`);
  } catch (e) { toast(e.message, 'error'); }
};

window.saveAndClose = async function(id, isNew) {
  const rec = gatherTraining(id);
  if (!rec.invoice_number) { toast('Invoice number is required', 'error'); return; }
  if (!rec.course_name)    { toast('Course name is required',    'error'); return; }
  try {
    await loadEntity('trainings');
    if (isNew) {
      cache.trainings.push(rec);
    } else {
      const idx = cache.trainings.findIndex(t => t.id === id);
      if (idx >= 0) cache.trainings[idx] = rec; else cache.trainings.push(rec);
    }
    await storage.saveAll('trainings', cache.trainings, `Save training ${rec.invoice_number}`);
    toast('Saved', 'success');
    navigate('trainings');
  } catch (e) { toast(e.message, 'error'); }
};

window.deleteTraining = async function(id) {
  const ok = await confirm('Delete this training record permanently?');
  if (!ok) return;
  try {
    cache.trainings = cache.trainings.filter(t => t.id !== id);
    await storage.saveAll('trainings', cache.trainings, 'Delete training');
    toast('Deleted', 'success');
    navigate('trainings');
  } catch (e) { toast(e.message, 'error'); }
};

// ═══════════════════════════════════════════════════════════════════════
// VENDORS LIST
// ═══════════════════════════════════════════════════════════════════════
async function showVendorsList() {
  await loadEntity('vendors');
  const rows = cache.vendors.slice().sort((a, b) => (a.account_name || '').localeCompare(b.account_name || ''));

  document.getElementById('content').innerHTML = `
    <div class="toolbar">
      <span class="toolbar-title">Accounts</span>
      ${auth.canWrite ? `<button class="btn btn-primary" onclick="navigate('vendors/new')">+ New Account</button>` : ''}
      ${auth.canWrite ? `<div class="toolbar-sep"></div><button class="btn" onclick="triggerImport('vendors')">⬆ Import Excel</button>` : ''}
    </div>
    <div class="table-container">
      ${rows.length === 0
        ? `<div class="empty-state"><h3>No accounts</h3><p>Add vendors and customers here.</p></div>`
        : `<table>
          <thead><tr>
            <th>Account Name</th><th>Type</th><th>GST Number</th><th>PAN Number</th>
            <th>City</th><th>Country</th><th>Phone</th><th>Email</th>
          </tr></thead>
          <tbody>${rows.map(v => `<tr>
            <td><a class="link" onclick="navigate('vendors/edit/${v.id}')">${esc(v.account_name)}</a></td>
            <td>${esc(v.account_type)}</td>
            <td>${esc(v.gst_number)}</td>
            <td>${esc(v.pan_number)}</td>
            <td>${esc(v.address_city)}</td>
            <td>${esc(v.address_country)}</td>
            <td>${esc(v.phone)}</td>
            <td>${esc(v.email)}</td>
          </tr>`).join('')}
          </tbody></table>`}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// VENDOR FORM
// ═══════════════════════════════════════════════════════════════════════
async function showVendorForm(id) {
  await loadEntity('vendors');
  const isNew = !id;
  const rec = isNew ? { id: generateId() } : cache.vendors.find(v => v.id === id);
  if (!rec) { toast('Not found', 'error'); navigate('vendors'); return; }

  const parentOpts = `<option value="">-- None --</option>` +
    cache.vendors.filter(v => v.id !== id).map(v =>
      `<option value="${v.id}" ${v.id === rec.parent_account ? 'selected' : ''}>${esc(v.account_name)}</option>`
    ).join('');

  document.getElementById('content').innerHTML = `
    <div class="form-toolbar">
      <div class="form-toolbar-left">
        <a class="link form-breadcrumb" onclick="navigate('vendors')">← Accounts</a>
        <span class="form-breadcrumb">/</span>
        <span class="record-title">${isNew ? 'New Account' : esc(rec.account_name)}</span>
      </div>
      <button class="btn btn-primary" onclick="saveVendor('${rec.id}',${isNew})">💾 Save</button>
      <button class="btn btn-primary" onclick="saveVendorClose('${rec.id}',${isNew})">Save &amp; Close</button>
      ${isNew ? '' : `<button class="btn btn-danger" onclick="deleteVendor('${rec.id}')">🗑 Delete</button>`}
    </div>
    <div class="form-body two-col" style="padding:14px 16px">

      <div class="form-card">
        <div class="form-card-title">Account Information</div>
        <div class="form-card-body">
          <div class="form-group"><label class="req">Account Name</label><input type="text" id="v-account_name" value="${esc(rec.account_name||'')}" /></div>
          <div class="form-group"><label>Account Type</label><select id="v-account_type">${opts(OPT_ACCOUNT_TYPE, rec.account_type)}</select></div>
          <div class="form-group"><label>Phone</label><input type="tel" id="v-phone" value="${esc(rec.phone||'')}" /></div>
          <div class="form-group"><label>Email</label><input type="email" id="v-email" value="${esc(rec.email||'')}" /></div>
          <div class="form-group"><label>Website</label><input type="text" id="v-website" value="${esc(rec.website||'')}" /></div>
          <div class="form-group"><label>Parent Account</label><select id="v-parent_account">${parentOpts}</select></div>
          <div class="form-group"><label>GST Number</label><input type="text" id="v-gst_number" value="${esc(rec.gst_number||'')}" /></div>
          <div class="form-group"><label>PAN Number</label><input type="text" id="v-pan_number" value="${esc(rec.pan_number||'')}" /></div>
        </div>
      </div>

      <div class="form-card">
        <div class="form-card-title">Address</div>
        <div class="form-card-body">
          <div class="form-group"><label>Street 1</label><input type="text" id="v-addr1" value="${esc(rec.address_street1||'')}" /></div>
          <div class="form-group"><label>Street 2</label><input type="text" id="v-addr2" value="${esc(rec.address_street2||'')}" /></div>
          <div class="form-group"><label>Street 3</label><input type="text" id="v-addr3" value="${esc(rec.address_street3||'')}" /></div>
          <div class="form-group"><label>City</label><input type="text" id="v-city" value="${esc(rec.address_city||'')}" /></div>
          <div class="form-group"><label>State / Province</label><input type="text" id="v-state" value="${esc(rec.address_state||'')}" /></div>
          <div class="form-group"><label>ZIP / Postal Code</label><input type="text" id="v-zip" value="${esc(rec.address_zip||'')}" /></div>
          <div class="form-group"><label>Country / Region</label><input type="text" id="v-country" value="${esc(rec.address_country||'India')}" /></div>
        </div>
      </div>

    </div>`;
}

function gatherVendor(id) {
  const g = el => document.getElementById(el)?.value?.trim() ?? '';
  return {
    id,
    account_name:    g('v-account_name'),
    account_type:    g('v-account_type'),
    phone:           g('v-phone'),
    email:           g('v-email'),
    website:         g('v-website'),
    parent_account:  g('v-parent_account'),
    gst_number:      g('v-gst_number'),
    pan_number:      g('v-pan_number'),
    address_street1: g('v-addr1'),
    address_street2: g('v-addr2'),
    address_street3: g('v-addr3'),
    address_city:    g('v-city'),
    address_state:   g('v-state'),
    address_zip:     g('v-zip'),
    address_country: g('v-country')
  };
}

window.saveVendor = async function(id, isNew) {
  const rec = gatherVendor(id);
  if (!rec.account_name) { toast('Account name is required', 'error'); return; }
  try {
    await loadEntity('vendors');
    if (isNew) cache.vendors.push(rec);
    else { const i = cache.vendors.findIndex(v => v.id === id); if (i >= 0) cache.vendors[i] = rec; else cache.vendors.push(rec); }
    await storage.saveAll('vendors', cache.vendors, `Save vendor ${rec.account_name}`);
    toast('Saved', 'success');
    if (isNew) navigate(`vendors/edit/${rec.id}`);
  } catch (e) { toast(e.message, 'error'); }
};

window.saveVendorClose = async function(id, isNew) {
  const rec = gatherVendor(id);
  if (!rec.account_name) { toast('Account name is required', 'error'); return; }
  try {
    await loadEntity('vendors');
    if (isNew) cache.vendors.push(rec);
    else { const i = cache.vendors.findIndex(v => v.id === id); if (i >= 0) cache.vendors[i] = rec; else cache.vendors.push(rec); }
    await storage.saveAll('vendors', cache.vendors, `Save vendor ${rec.account_name}`);
    toast('Saved', 'success'); navigate('vendors');
  } catch (e) { toast(e.message, 'error'); }
};

window.deleteVendor = async function(id) {
  const ok = await confirm('Delete this account?');
  if (!ok) return;
  try {
    cache.vendors = cache.vendors.filter(v => v.id !== id);
    await storage.saveAll('vendors', cache.vendors, 'Delete vendor');
    toast('Deleted', 'success'); navigate('vendors');
  } catch (e) { toast(e.message, 'error'); }
};

// ═══════════════════════════════════════════════════════════════════════
// TRAINERS LIST
// ═══════════════════════════════════════════════════════════════════════
async function showTrainersList() {
  await loadEntity('trainers');
  const rows = cache.trainers.slice().sort((a, b) => (a.first_name || '').localeCompare(b.first_name || ''));

  document.getElementById('content').innerHTML = `
    <div class="toolbar">
      <span class="toolbar-title">Trainers</span>
      ${auth.canWrite ? `<button class="btn btn-primary" onclick="navigate('trainers/new')">+ New Trainer</button>` : ''}
      ${auth.canWrite ? `<div class="toolbar-sep"></div><button class="btn" onclick="triggerImport('trainers')">⬆ Import Excel</button>` : ''}
    </div>
    <div class="table-container">
      ${rows.length === 0
        ? `<div class="empty-state"><h3>No trainers</h3><p>Add trainer details here.</p></div>`
        : `<table>
          <thead><tr>
            <th>Name</th><th>Mobile</th><th>Email</th><th>City</th>
            <th>PAN Number</th><th>GST Number</th>
          </tr></thead>
          <tbody>${rows.map(t => `<tr>
            <td><a class="link" onclick="navigate('trainers/edit/${t.id}')">${esc(t.first_name + ' ' + t.last_name)}</a></td>
            <td>${esc(t.mobile_phone)}</td>
            <td>${esc(t.email)}</td>
            <td>${esc(t.address_city)}</td>
            <td>${esc(t.pan_number)}</td>
            <td>${esc(t.gst_number)}</td>
          </tr>`).join('')}
          </tbody></table>`}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// TRAINER FORM
// ═══════════════════════════════════════════════════════════════════════
async function showTrainerForm(id) {
  await loadEntity('trainers');
  const isNew = !id;
  const rec = isNew ? { id: generateId(), preferred_contact: 'Any' } : cache.trainers.find(t => t.id === id);
  if (!rec) { toast('Not found', 'error'); navigate('trainers'); return; }

  document.getElementById('content').innerHTML = `
    <div class="form-toolbar">
      <div class="form-toolbar-left">
        <a class="link form-breadcrumb" onclick="navigate('trainers')">← Trainers</a>
        <span class="form-breadcrumb">/</span>
        <span class="record-title">${isNew ? 'New Trainer' : esc(rec.first_name + ' ' + rec.last_name)}</span>
      </div>
      <button class="btn btn-primary" onclick="saveTrainer('${rec.id}',${isNew})">💾 Save</button>
      <button class="btn btn-primary" onclick="saveTrainerClose('${rec.id}',${isNew})">Save &amp; Close</button>
      ${isNew ? '' : `<button class="btn btn-danger" onclick="deleteTrainer('${rec.id}')">🗑 Delete</button>`}
    </div>
    <div class="form-body two-col" style="padding:14px 16px">

      <div class="form-card">
        <div class="form-card-title">Contact Information</div>
        <div class="form-card-body">
          <div class="form-group"><label class="req">First Name</label><input type="text" id="t-first_name" value="${esc(rec.first_name||'')}" /></div>
          <div class="form-group"><label>Middle Name</label><input type="text" id="t-middle_name" value="${esc(rec.middle_name||'')}" /></div>
          <div class="form-group"><label class="req">Last Name</label><input type="text" id="t-last_name" value="${esc(rec.last_name||'')}" /></div>
          <div class="form-group"><label>Job Title</label><input type="text" id="t-job_title" value="${esc(rec.job_title||'')}" /></div>
          <div class="form-group"><label>Email</label><input type="email" id="t-email" value="${esc(rec.email||'')}" /></div>
          <div class="form-group"><label>Business Phone</label><input type="tel" id="t-business_phone" value="${esc(rec.business_phone||'')}" /></div>
          <div class="form-group"><label>Mobile Phone</label><input type="tel" id="t-mobile_phone" value="${esc(rec.mobile_phone||'')}" /></div>
          <div class="form-group"><label>Preferred Contact</label><select id="t-preferred_contact">${opts(OPT_PREF_CONTACT, rec.preferred_contact)}</select></div>
          <div class="form-group"><label>GST Number</label><input type="text" id="t-gst_number" value="${esc(rec.gst_number||'')}" /></div>
          <div class="form-group"><label>PAN Number</label><input type="text" id="t-pan_number" value="${esc(rec.pan_number||'')}" /></div>
          <div class="form-group"><label>Spouse / Partner Name</label><input type="text" id="t-spouse_name" value="${esc(rec.spouse_name||'')}" /></div>
        </div>
      </div>

      <div class="form-card">
        <div class="form-card-title">Address</div>
        <div class="form-card-body">
          <div class="form-group"><label>Street 1</label><input type="text" id="t-addr1" value="${esc(rec.address_street1||'')}" /></div>
          <div class="form-group"><label>Street 2</label><input type="text" id="t-addr2" value="${esc(rec.address_street2||'')}" /></div>
          <div class="form-group"><label>Street 3</label><input type="text" id="t-addr3" value="${esc(rec.address_street3||'')}" /></div>
          <div class="form-group"><label>City</label><input type="text" id="t-city" value="${esc(rec.address_city||'')}" /></div>
          <div class="form-group"><label>State / Province</label><input type="text" id="t-state" value="${esc(rec.address_state||'')}" /></div>
          <div class="form-group"><label>ZIP / Postal Code</label><input type="text" id="t-zip" value="${esc(rec.address_zip||'')}" /></div>
          <div class="form-group"><label>Country / Region</label><input type="text" id="t-country" value="${esc(rec.address_country||'India')}" /></div>
        </div>
      </div>

    </div>`;
}

function gatherTrainer(id) {
  const g = el => document.getElementById(el)?.value?.trim() ?? '';
  return {
    id,
    first_name:       g('t-first_name'),
    middle_name:      g('t-middle_name'),
    last_name:        g('t-last_name'),
    job_title:        g('t-job_title'),
    email:            g('t-email'),
    business_phone:   g('t-business_phone'),
    mobile_phone:     g('t-mobile_phone'),
    preferred_contact:g('t-preferred_contact'),
    gst_number:       g('t-gst_number'),
    pan_number:       g('t-pan_number'),
    spouse_name:      g('t-spouse_name'),
    address_street1:  g('t-addr1'),
    address_street2:  g('t-addr2'),
    address_street3:  g('t-addr3'),
    address_city:     g('t-city'),
    address_state:    g('t-state'),
    address_zip:      g('t-zip'),
    address_country:  g('t-country')
  };
}

window.saveTrainer = async function(id, isNew) {
  const rec = gatherTrainer(id);
  if (!rec.first_name || !rec.last_name) { toast('First and last name are required', 'error'); return; }
  try {
    await loadEntity('trainers');
    if (isNew) cache.trainers.push(rec);
    else { const i = cache.trainers.findIndex(t => t.id === id); if (i >= 0) cache.trainers[i] = rec; else cache.trainers.push(rec); }
    await storage.saveAll('trainers', cache.trainers, `Save trainer ${rec.first_name} ${rec.last_name}`);
    toast('Saved', 'success');
    if (isNew) navigate(`trainers/edit/${rec.id}`);
  } catch (e) { toast(e.message, 'error'); }
};

window.saveTrainerClose = async function(id, isNew) {
  const rec = gatherTrainer(id);
  if (!rec.first_name || !rec.last_name) { toast('First and last name are required', 'error'); return; }
  try {
    await loadEntity('trainers');
    if (isNew) cache.trainers.push(rec);
    else { const i = cache.trainers.findIndex(t => t.id === id); if (i >= 0) cache.trainers[i] = rec; else cache.trainers.push(rec); }
    await storage.saveAll('trainers', cache.trainers, `Save trainer ${rec.first_name} ${rec.last_name}`);
    toast('Saved', 'success'); navigate('trainers');
  } catch (e) { toast(e.message, 'error'); }
};

window.deleteTrainer = async function(id) {
  const ok = await confirm('Delete this trainer?');
  if (!ok) return;
  try {
    cache.trainers = cache.trainers.filter(t => t.id !== id);
    await storage.saveAll('trainers', cache.trainers, 'Delete trainer');
    toast('Deleted', 'success'); navigate('trainers');
  } catch (e) { toast(e.message, 'error'); }
};

// ═══════════════════════════════════════════════════════════════════════
// SETTINGS (simplified — auth is now handled via login)
// ═══════════════════════════════════════════════════════════════════════
function showSettings() {
  const u = auth.currentUser;
  document.getElementById('content').innerHTML = `
    <div class="settings-wrap">
      <div class="settings-card" style="margin-bottom:16px">
        <h2>My Account</h2>
        <p>Logged in as <strong>${esc(u?.displayName || u?.username)}</strong>
           &nbsp;<span class="role-badge role-${u?.role}">${esc(u?.role)}</span></p>
        <h3>Change Password</h3>
        <div class="form-group"><label>Current Password</label>
          <input type="password" id="sp-current" autocomplete="current-password" /></div>
        <div class="form-group"><label>New Password</label>
          <input type="password" id="sp-new" autocomplete="new-password" /></div>
        <div class="form-group"><label>Confirm New Password</label>
          <input type="password" id="sp-confirm" autocomplete="new-password" /></div>
        <div style="display:flex;gap:10px;margin-top:16px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="doChangePassword()">Change Password</button>
          <button class="btn btn-danger" onclick="doLogout()" style="margin-left:auto">Sign Out</button>
        </div>
        <div id="sp-status" style="margin-top:12px;font-size:13px"></div>
      </div>

      ${auth.isAdmin ? `
      <div class="settings-card" style="margin-bottom:16px">
        <h2>Data Repository</h2>
        <p>Connected to <strong>${esc(storage.settings.dataOwner)}/${esc(storage.settings.dataRepo)}</strong></p>
        <button class="btn" onclick="initRepo()">Re-initialize Data Files</button>
        <div id="s-status" style="margin-top:12px;font-size:13px"></div>
      </div>` : ''}

      <div class="settings-card">
        <h2>About</h2>
        <p>App URL: <span class="code">https://nmrmanohar.github.io/dccloud</span><br/>
           Built for: <strong>DC Cloud – Nallapareddy Manohar Reddy</strong></p>
      </div>
    </div>`;
}

window.doLogout = function() {
  auth.logout();
  Object.keys(cache).forEach(k => cache[k] = null);
  toast('Logged out');
  setTimeout(() => location.reload(), 800);
};

window.saveAuditorConfig = async function() {
  const status = document.getElementById('s-auditor-status');
  const readToken = document.getElementById('s-readtoken')?.value.trim();
  if (!readToken) { status.innerHTML = '<span style="color:red">Enter a read-only token first.</span>'; return; }
  if (storage.isReadOnly) { status.innerHTML = '<span style="color:red">You need your write token active to save auditor config.</span>'; return; }
  status.textContent = 'Saving config.json to app repo…';
  try {
    const cfg = {
      dataOwner: storage.settings.dataOwner,
      dataRepo:  storage.settings.dataRepo,
      readToken
    };
    await storage.saveRemoteConfig(cfg);
    status.innerHTML = '<span style="color:green">✓ Saved. Auditors can now open the app URL without any setup.</span>';
  } catch (e) {
    status.innerHTML = `<span style="color:red">✗ ${esc(e.message)}</span>`;
  }
};

window.testAndSave = async function() {
  const token = document.getElementById('s-token').value.trim();
  const owner = document.getElementById('s-owner').value.trim();
  const repo  = document.getElementById('s-repo').value.trim();
  const status = document.getElementById('s-status');

  if (!token || !owner || !repo) {
    status.innerHTML = '<span style="color:red">All fields are required.</span>'; return;
  }
  status.textContent = 'Testing connection…';
  storage.saveSettings({ token, dataOwner: owner, dataRepo: repo });
  try {
    const login = await storage.testConnection();
    status.innerHTML = `<span style="color:green">✓ Connected as <strong>${esc(login)}</strong>. Settings saved.</span>`;
    // reset cache so next navigation fetches fresh
    Object.keys(cache).forEach(k => cache[k] = null);
  } catch (e) {
    status.innerHTML = `<span style="color:red">✗ ${esc(e.message)}</span>`;
  }
};

window.initRepo = async function() {
  const status = document.getElementById('s-status');
  if (!storage.isConfigured) { status.innerHTML = '<span style="color:red">Save settings first.</span>'; return; }
  status.textContent = 'Initializing data files in repo…';
  try {
    await storage.initialize();
    status.innerHTML = '<span style="color:green">✓ Data files created (data/trainings.json, vendors.json, trainers.json).</span>';
  } catch (e) {
    status.innerHTML = `<span style="color:red">✗ ${esc(e.message)}</span>`;
  }
};

// ═══════════════════════════════════════════════════════════════════════
// GST LAST MONTH
// ═══════════════════════════════════════════════════════════════════════
let _gstRecords = []; // kept for CSV export

window.showGSTLastMonth = async function() {
  await loadEntity('trainings');
  await loadEntity('vendors');

  const now       = new Date();
  const y         = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const m         = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const mStart    = new Date(y, m, 1);
  const mEnd      = new Date(y, m + 1, 0, 23, 59, 59);
  const monthLabel = mStart.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  // INR invoices with GST in the last calendar month, filtered by invoice date
  _gstRecords = cache.trainings.filter(t => {
    if (!t.invoice_date || t.currency !== 'INR' || t.gst_required !== 'Yes') return false;
    const d = new Date(t.invoice_date + 'T00:00:00');
    return d >= mStart && d <= mEnd;
  }).sort((a, b) => (a.invoice_date || '').localeCompare(b.invoice_date || ''));

  const totTaxable = _gstRecords.reduce((s, t) => s + (+t.taxable_amount || ((+t.invoice_value || 0) / 1.18)), 0);
  const totGST     = _gstRecords.reduce((s, t) => s + (+t.gst_amount || 0), 0);
  const credited   = _gstRecords.filter(t => t.gst_credited === 'Yes').reduce((s, t) => s + (+t.gst_amount || 0), 0);
  const pending    = totGST - credited;

  const rows = _gstRecords.length === 0
    ? `<div class="empty-state" style="padding:32px"><h3>No GST records</h3>
        <p>No INR invoices with GST Required = Yes found for ${monthLabel}.</p></div>`
    : `<table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f7f7f9;border-bottom:2px solid #e0e0e0">
          <th style="padding:8px 10px;text-align:left">Invoice No.</th>
          <th style="padding:8px 10px;text-align:left">Invoice Date</th>
          <th style="padding:8px 10px;text-align:left">Vendor</th>
          <th style="padding:8px 10px;text-align:left">Course</th>
          <th style="padding:8px 10px;text-align:right">Taxable Amt</th>
          <th style="padding:8px 10px;text-align:right">GST (18%)</th>
          <th style="padding:8px 10px;text-align:right">Invoice Value</th>
          <th style="padding:8px 10px;text-align:center">GST Credited?</th>
        </tr></thead>
        <tbody>
          ${_gstRecords.map(t => {
            const taxable = (+t.taxable_amount) || ((+t.invoice_value || 0) / 1.18);
            return `<tr style="border-bottom:1px solid #eee">
              <td style="padding:7px 10px">${esc(t.invoice_number)}</td>
              <td style="padding:7px 10px">${fmtDate(t.invoice_date)}</td>
              <td style="padding:7px 10px">${esc(vendorName(t.vendor_id))}</td>
              <td style="padding:7px 10px">${esc(t.course_name)}</td>
              <td style="padding:7px 10px;text-align:right;font-family:monospace">${fmtINR(taxable)}</td>
              <td style="padding:7px 10px;text-align:right;font-family:monospace;color:#5c2d91;font-weight:600">${fmtINR(t.gst_amount)}</td>
              <td style="padding:7px 10px;text-align:right;font-family:monospace">${fmtINR(t.invoice_value)}</td>
              <td style="padding:7px 10px;text-align:center">
                <span class="badge ${t.gst_credited==='Yes'?'badge-paid':t.gst_credited==='No'?'badge-not-paid':'badge-partial'}">
                  ${esc(t.gst_credited || 'NA')}
                </span>
              </td>
            </tr>`;
          }).join('')}
          <tr style="background:#f7f7f9;font-weight:700;border-top:2px solid #e0e0e0">
            <td colspan="4" style="padding:8px 10px">Total</td>
            <td style="padding:8px 10px;text-align:right;font-family:monospace">${fmtINR(totTaxable)}</td>
            <td style="padding:8px 10px;text-align:right;font-family:monospace;color:#5c2d91">${fmtINR(totGST)}</td>
            <td colspan="2" style="padding:8px 10px"></td>
          </tr>
        </tbody>
      </table>`;

  document.getElementById('gstTitle').textContent = `GST Summary – ${monthLabel}`;
  document.getElementById('gstBody').innerHTML = `
    <div class="gst-stats">
      <div class="gst-stat">
        <div class="val">${_gstRecords.length}</div>
        <div class="lbl">Invoices</div>
      </div>
      <div class="gst-stat">
        <div class="val">${fmtINR(totTaxable)}</div>
        <div class="lbl">Taxable Amount</div>
      </div>
      <div class="gst-stat">
        <div class="val">${fmtINR(totGST)}</div>
        <div class="lbl">Total GST (18%)</div>
      </div>
      <div class="gst-stat highlight">
        <div class="val">${fmtINR(credited)}</div>
        <div class="lbl">GST Credited</div>
      </div>
      <div class="gst-stat warn">
        <div class="val">${fmtINR(pending)}</div>
        <div class="lbl">Pending Credit</div>
      </div>
    </div>
    ${rows}`;

  document.getElementById('gstOverlay').style.display = 'flex';
};

window.exportGSTCSV = function() {
  if (!_gstRecords.length) return;
  const headers = ['Invoice No','Invoice Date','Vendor','Course','Taxable Amount','GST Amount','Invoice Value','GST Credited'];
  const data = _gstRecords.map(t => [
    t.invoice_number, t.invoice_date, vendorName(t.vendor_id), t.course_name,
    t.taxable_amount || ((+t.invoice_value||0)/1.18).toFixed(2),
    t.gst_amount, t.invoice_value, t.gst_credited
  ]);
  const now = new Date();
  const mon = `${now.getFullYear()}-${String(now.getMonth()).padStart(2,'0')}`;
  downloadCSV([headers, ...data], `gst-summary-${mon}.csv`);
};

// ═══════════════════════════════════════════════════════════════════════
// EXCEL IMPORT
// ═══════════════════════════════════════════════════════════════════════

/** Trigger hidden file input for a given entity */
window.triggerImport = function(entity) {
  _importEntity = entity;
  const inp = document.getElementById('importFile');
  inp.value = '';
  inp.click();
};

/** Called when user selects a file */
window.handleImportFile = async function(input) {
  if (!input.files.length) return;
  const file  = input.files[0];
  const entity = _importEntity;
  toast(`Reading ${file.name}…`);

  try {
    const rows = await readExcelFile(file);
    if (!rows.length) { toast('No data rows found in file', 'error'); return; }

    // Show preview modal before committing
    let preview = '';
    let count = rows.length;
    if (entity === 'vendors')   preview = `Found <strong>${count}</strong> accounts to import.`;
    if (entity === 'trainers')  preview = `Found <strong>${count}</strong> trainers to import.`;
    if (entity === 'trainings') preview = `Found <strong>${count}</strong> training records to import.`;

    document.getElementById('modalTitle').textContent = 'Confirm Import';
    document.getElementById('modalBody').innerHTML =
      `${preview}<br/><br/>This will <strong>add</strong> records to existing data (duplicates by name/invoice number will be skipped).`;
    document.getElementById('modalConfirm').textContent = 'Import';
    document.getElementById('modalOverlay').style.display = 'flex';

    _modalResolve = async (confirmed) => {
      document.getElementById('modalOverlay').style.display = 'none';
      document.getElementById('modalConfirm').textContent = 'Delete';
      if (!confirmed) return;
      await runImport(entity, rows);
    };

  } catch (e) {
    toast('Failed to read file: ' + e.message, 'error');
  }
};

/** Read Excel/CSV file using SheetJS → array of plain objects */
async function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: 'binary', cellDates: false });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

/** Run the actual import for a given entity */
async function runImport(entity, rows) {
  toast('Importing…');
  try {
    await Promise.all([loadEntity('vendors'), loadEntity('trainers'), loadEntity('trainings')]);

    if (entity === 'vendors') {
      const existing = new Set(cache.vendors.map(v => v.account_name?.toLowerCase()));
      let added = 0;
      for (const row of rows) {
        const name = (row['Account Name'] || '').trim();
        if (!name || existing.has(name.toLowerCase())) continue;
        const addr = String(row['Address 1'] || '');
        const addrLines = addr.split(/\n/).map(s => s.trim()).filter(Boolean);
        cache.vendors.push({
          id:              generateId(),
          account_name:    name,
          account_type:    row['Account Type'] || 'Vendor',
          phone:           String(row['Main Phone'] || '').trim(),
          email:           String(row['Email'] || '').trim(),
          website:         String(row['Website'] || '').trim(),
          gst_number:      String(row['GST Number'] || '').trim(),
          pan_number:      String(row['PAN Number'] || '').trim(),
          address_street1: addrLines[0] || '',
          address_street2: addrLines[1] || '',
          address_street3: addrLines[2] || '',
          address_city:    String(row['Address 1: City'] || '').trim(),
          address_state:   String(row['Address 1: State/Province'] || '').trim(),
          address_zip:     String(row['Address 1: ZIP/Postal Code'] || '').trim(),
          address_country: String(row['Address 1: Country/Region'] || '').trim(),
          parent_account:  '', // will resolve below
          _parent_name:    String(row['Parent Account'] || '').trim()
        });
        existing.add(name.toLowerCase());
        added++;
      }
      // Resolve parent account IDs
      cache.vendors.forEach(v => {
        if (v._parent_name) {
          const p = cache.vendors.find(x => x.account_name?.toLowerCase() === v._parent_name.toLowerCase());
          if (p) v.parent_account = p.id;
          delete v._parent_name;
        }
      });
      await storage.saveAll('vendors', cache.vendors, `Import ${added} accounts`);
      toast(`Imported ${added} accounts`, 'success');
      showVendorsList();

    } else if (entity === 'trainers') {
      const existing = new Set(
        cache.trainers.map(t => `${t.first_name} ${t.last_name}`.trim().toLowerCase())
      );
      let added = 0;
      for (const row of rows) {
        const first = String(row['First Name'] || '').trim();
        const last  = String(row['Last Name']  || '').trim();
        const full  = `${first} ${last}`.trim();
        if (!full || existing.has(full.toLowerCase())) continue;
        cache.trainers.push({
          id:               generateId(),
          first_name:       first,
          middle_name:      String(row['Middle Name']    || '').trim(),
          last_name:        last,
          email:            String(row['Email']          || '').trim(),
          business_phone:   String(row['Business Phone'] || '').trim(),
          mobile_phone:     String(row['Mobile Phone']   || '').trim(),
          gst_number:       String(row['GST Number']     || '').trim(),
          pan_number:       String(row['PAN Number']     || '').trim(),
          paid_to:          String(row['Paid To']        || '').trim(),
          payment_terms:    String(row['Payment Terms']  || '').trim(),
          preferred_contact:'Any',
          address_city:     String(row['Address 1: City'] || '').trim(),
          address_country:  String(row['Address 1: Country/Region'] || 'India').trim()
        });
        existing.add(full.toLowerCase());
        added++;
      }
      await storage.saveAll('trainers', cache.trainers, `Import ${added} trainers`);
      toast(`Imported ${added} trainers`, 'success');
      showTrainersList();

    } else if (entity === 'trainings') {
      const existing = new Set(cache.trainings.map(t => (t.invoice_number || '').toLowerCase()));
      let added = 0, skipped = 0;
      for (const row of rows) {
        const invNum = String(row['Invoice Number'] || '').trim();
        if (!invNum) { skipped++; continue; }
        if (existing.has(invNum.toLowerCase())) { skipped++; continue; }

        // Resolve vendor
        const vendorName_ = String(row['Vendor'] || '').trim();
        const vendor = cache.vendors.find(v => v.account_name?.toLowerCase() === vendorName_.toLowerCase());

        // Resolve customer
        const custName = String(row['Customer'] || '').trim();
        const customer = custName ? cache.vendors.find(v => v.account_name?.toLowerCase() === custName.toLowerCase()) : null;

        // Resolve trainer
        const trainerName_ = String(row['Trainer'] || '').trim();
        const trainer = cache.trainers.find(t =>
          `${t.first_name} ${t.last_name}`.trim().toLowerCase() === trainerName_.toLowerCase()
        );

        cache.trainings.push({
          id:                   generateId(),
          invoice_number:       invNum,
          invoice_date:         parseDMY(row['Invoice Date']),
          payment_due_date:     parseDMY(row['Payment Due Date']),
          course_name:          String(row['Course Name']      || '').trim(),
          po_number:            String(row['PO Number']        || '').trim(),
          date_of_course:       parseDMY(row['Date of Course(PO)']),
          vendor_id:            vendor?.id   || '',
          customer_id:          customer?.id || '',
          gst_required:         String(row['GST Required?']   || 'No').trim(),
          currency:             String(row['Currency']        || 'INR').trim(),
          exchange_rate:        parseNum(row['Exchange']),
          per_day_fee:          parseNum(row['Per Day Fee']),
          days:                 parseInt(row['Days']) || 1,
          payment_status:       String(row['Payment Status']  || 'Not Paid').trim(),
          invoice_value:        parseNum(row['Invoice Value'])        || 0,
          gst_amount:           parseNum(row['GST Amount'])           || 0,
          taxable_amount:       parseNum(row['Taxable Amount'])       || 0,
          gst_credited:         String(row['GST Credited?']   || 'NA').trim(),
          received_amount:      parseNum(row['Received Amount']),
          paid_date:            parseDMY(row['Paid Date']),
          trainer_id:           trainer?.id  || '',
          trainer_fee_per_day:  parseNum(row['Trainer Fee Per Day(incl Taxes)']),
          total_trainer_fee:    parseNum(row['Total Trainer Fee(incl Taxes)']) || 0,
          trainer_fee_paid:     String(row['Trainer Fee Paid?']       || 'NA').trim(),
          trainer_paid_date:    parseDMY(row['Trainer Paid Date']),
          trainer_tds_amount:   parseNum(row['Trainer TDS Amount'])   || 0,
          trainer_tds_credited: String(row['Trainer TDS Credited?']   || 'NA').trim(),
          margin:               parseNum(row['Margin'])               || 0,
          notes:                ''
        });
        existing.add(invNum.toLowerCase());
        added++;
      }
      await storage.saveAll('trainings', cache.trainings, `Import ${added} trainings`);
      toast(`Imported ${added} records${skipped ? `, skipped ${skipped} duplicates` : ''}`, 'success');
      showTrainingsList();
    }
  } catch (e) {
    toast('Import failed: ' + e.message, 'error');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// LOGIN PAGE
// ═══════════════════════════════════════════════════════════════════════
function showLoginPage() {
  showAuthShell(`
    <div class="auth-bg">
      <div class="auth-card">
        <div class="auth-header">
          <div class="logo-icon-lg">☁</div>
          <div class="auth-title">DC Cloud</div>
          <div class="auth-subtitle">Training Operations</div>
        </div>
        <div class="auth-body">
          <div id="login-error" class="auth-error" style="display:none"></div>
          <div class="form-group">
            <label>Username</label>
            <input type="text" id="l-username" autocomplete="username" placeholder="Enter username"
              onkeydown="if(event.key==='Enter')document.getElementById('l-password').focus()" />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" id="l-password" autocomplete="current-password" placeholder="Enter password"
              onkeydown="if(event.key==='Enter')doLogin()" />
          </div>
          <label class="checkbox-label" style="margin-top:8px">
            <input type="checkbox" id="l-remember" /> Remember me
          </label>
        </div>
        <div class="auth-footer">
          <button class="btn btn-primary btn-full" id="login-btn" onclick="doLogin()">Sign In</button>
        </div>
      </div>
    </div>`);
  setTimeout(() => document.getElementById('l-username')?.focus(), 50);
}

window.doLogin = async function() {
  const username = document.getElementById('l-username')?.value?.trim();
  const password = document.getElementById('l-password')?.value;
  const remember = document.getElementById('l-remember')?.checked;
  const errEl    = document.getElementById('login-error');
  const btn      = document.getElementById('login-btn');

  if (!username || !password) {
    errEl.textContent = 'Please enter username and password.';
    errEl.style.display = 'block'; return;
  }
  errEl.style.display = 'none';
  btn.disabled = true; btn.textContent = 'Signing in…';

  try {
    await auth.login(username, password, storage.configUsers, storage.readToken, remember);
    route();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.style.display = 'block';
    btn.disabled = false; btn.textContent = 'Sign In';
    document.getElementById('l-password')?.select();
  }
};

// ═══════════════════════════════════════════════════════════════════════
// FIRST-TIME SETUP WIZARD
// ═══════════════════════════════════════════════════════════════════════
let _setupStep = 1, _setupToken = null;

function showFirstTimeSetup() {
  showAuthShell(`
    <div class="auth-bg">
      <div class="auth-card setup-card">
        <div class="auth-header">
          <div class="logo-icon-lg">☁</div>
          <div class="auth-title">DC Cloud Setup</div>
          <div class="auth-subtitle">One-time configuration</div>
        </div>

        <div class="setup-steps">
          <div class="setup-step active" id="step-dot-1">1 · GitHub</div>
          <div class="setup-step" id="step-dot-2">2 · Admin Account</div>
        </div>

        <div id="setup-step-1" class="auth-body">
          <p class="setup-info">Enter your GitHub Personal Access Token to connect to the data repository. This is a one-time step — all other users will log in with just a username and password.</p>
          <div class="form-group">
            <label>GitHub Personal Access Token (repo scope)</label>
            <input type="password" id="su-token" autocomplete="off" placeholder="ghp_…" />
            <div class="field-hint">Needs repo (read/write) scope for <strong>nmrmanohar/dccloud-data</strong>. Will be encrypted with your password — never stored in plain text.</div>
          </div>
          <div id="su-status1" style="min-height:20px;font-size:13px;margin-top:4px"></div>
        </div>

        <div id="setup-step-2" class="auth-body" style="display:none">
          <p class="setup-info">Create the first administrator account. Admins can manage all data and users.</p>
          <div class="form-group">
            <label>Username</label>
            <input type="text" id="su-username" autocomplete="username" placeholder="admin" />
          </div>
          <div class="form-group">
            <label>Display Name</label>
            <input type="text" id="su-displayname" placeholder="Your full name" />
          </div>
          <div class="form-group">
            <label>Password (min 8 characters)</label>
            <input type="password" id="su-password" autocomplete="new-password" />
          </div>
          <div class="form-group">
            <label>Confirm Password</label>
            <input type="password" id="su-confirm" autocomplete="new-password"
              onkeydown="if(event.key==='Enter')setupNext()" />
          </div>
          <div id="su-status2" style="min-height:20px;font-size:13px;margin-top:4px"></div>
        </div>

        <div class="auth-footer">
          <button class="btn btn-primary btn-full" id="su-next-btn" onclick="setupNext()">Next →</button>
        </div>
      </div>
    </div>`);
  _setupStep = 1;
  setTimeout(() => document.getElementById('su-token')?.focus(), 50);
}

window.setupNext = async function() {
  const btn = document.getElementById('su-next-btn');

  if (_setupStep === 1) {
    const token  = document.getElementById('su-token').value.trim();
    const owner  = storage.settings.dataOwner || 'nmrmanohar';
    const repo   = storage.settings.dataRepo  || 'dccloud-data';
    const status = document.getElementById('su-status1');
    if (!token) {
      status.innerHTML = '<span style="color:red">Please enter your GitHub Personal Access Token.</span>'; return;
    }
    btn.disabled = true; btn.textContent = 'Testing connection…';
    status.textContent = 'Connecting to GitHub…';
    storage.saveSettings({ token, dataOwner: owner, dataRepo: repo });
    try {
      const login = await storage.testConnection();
      status.innerHTML = `<span style="color:green">✓ Connected as <strong>${esc(login)}</strong></span>`;
      _setupToken = token;
      _setupStep  = 2;
      document.getElementById('setup-step-1').style.display = 'none';
      document.getElementById('setup-step-2').style.display = 'block';
      document.getElementById('step-dot-1').classList.add('done');
      document.getElementById('step-dot-2').classList.add('active');
      btn.disabled = false; btn.textContent = 'Create Admin & Finish';
      document.getElementById('su-username')?.focus();
    } catch (e) {
      status.innerHTML = `<span style="color:red">✗ ${esc(e.message)}</span>`;
      btn.disabled = false; btn.textContent = 'Next →';
    }

  } else {
    const username    = document.getElementById('su-username').value.trim();
    const displayName = document.getElementById('su-displayname').value.trim();
    const password    = document.getElementById('su-password').value;
    const confirm     = document.getElementById('su-confirm').value;
    const status      = document.getElementById('su-status2');
    if (!username || !password) { status.innerHTML = '<span style="color:red">Username and password are required.</span>'; return; }
    if (password !== confirm)   { status.innerHTML = '<span style="color:red">Passwords do not match.</span>'; return; }
    if (password.length < 8)    { status.innerHTML = '<span style="color:red">Password must be at least 8 characters.</span>'; return; }

    btn.disabled = true; btn.textContent = 'Setting up…';
    status.textContent = 'Creating admin account…';
    try {
      const user = await auth.createUser(username, displayName || username, password, 'admin', _setupToken);
      status.textContent = 'Initializing data files…';
      await storage.initialize(); // creates data/users.json among others
      status.textContent = 'Saving admin account…';
      await storage.saveUsers([user]);
      // config.json is pre-configured in git — no need to update it
      status.innerHTML = '<span style="color:green">✓ Setup complete! Signing you in…</span>';
      await auth.login(username, password, [user], null, true);
      setTimeout(() => route(), 900);
    } catch (e) {
      status.innerHTML = `<span style="color:red">✗ ${esc(e.message)}</span>`;
      btn.disabled = false; btn.textContent = 'Create Admin & Finish';
    }
  }
};

// ═══════════════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════
function showUserManagement() {
  const users = storage.configUsers;
  document.getElementById('content').innerHTML = `
    <div class="toolbar">
      <span class="toolbar-title">Users &amp; Roles</span>
      <button class="btn btn-primary" onclick="showAddUserModal()">+ Add User</button>
    </div>
    <div class="table-container">
      ${users.length === 0
        ? `<div class="empty-state"><h3>No users.</h3></div>`
        : `<table>
          <thead><tr>
            <th>Display Name</th><th>Username</th><th>Role</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>${users.map(u => `<tr>
            <td>${esc(u.displayName)}</td>
            <td>${esc(u.username)}</td>
            <td><span class="role-badge role-${esc(u.role)}">${esc(u.role)}</span></td>
            <td><span class="status-${u.active !== false ? 'active' : 'inactive'}">${u.active !== false ? 'Active' : 'Inactive'}</span></td>
            <td style="white-space:nowrap">
              ${u.id === auth.currentUser?.userId
                ? '<span style="color:#999;font-size:12px">(you)</span>'
                : `<button class="btn btn-sm" onclick="showEditUserModal('${esc(u.id)}')">Edit</button>
                   <button class="btn btn-sm ${u.active !== false ? 'btn-danger' : ''}" style="margin-left:4px"
                     onclick="toggleUserActive('${esc(u.id)}')">${u.active !== false ? 'Deactivate' : 'Activate'}</button>`}
            </td>
          </tr>`).join('')}
          </tbody></table>`}
    </div>`;
}

window.showAddUserModal = function() {
  document.getElementById('modalTitle').textContent = 'Add User';
  document.getElementById('modalBody').innerHTML = `
    <div class="form-group"><label>Username</label><input type="text" id="mu-username" /></div>
    <div class="form-group"><label>Display Name</label><input type="text" id="mu-displayname" /></div>
    <div class="form-group"><label>Role</label>
      <select id="mu-role" onchange="onNewUserRoleChange()">
        <option value="viewer">Viewer — read-only, export</option>
        <option value="editor">Editor — create &amp; edit</option>
        <option value="admin">Admin — full access + user mgmt</option>
      </select></div>
    <div class="form-group"><label>Password (min 8 characters)</label><input type="password" id="mu-password" autocomplete="new-password" /></div>
    <div class="form-group"><label>Confirm Password</label><input type="password" id="mu-confirm" autocomplete="new-password" /></div>
    <div id="mu-token-grp" class="form-group" style="display:none">
      <label>Write Token (GitHub PAT)</label>
      <input type="password" id="mu-token" placeholder="ghp_… — required for admin / editor" />
      <div class="field-hint">Token will be encrypted with the user's password and stored in config.json.</div>
    </div>`;
  document.getElementById('modalConfirm').textContent = 'Create User';
  document.getElementById('modalOverlay').style.display = 'flex';
  _modalResolve = handleAddUser;
  setTimeout(() => document.getElementById('mu-username')?.focus(), 50);
};

window.onNewUserRoleChange = function() {
  const role = document.getElementById('mu-role')?.value;
  const grp  = document.getElementById('mu-token-grp');
  if (grp) grp.style.display = (role === 'viewer') ? 'none' : 'block';
};

async function handleAddUser(confirmed) {
  document.getElementById('modalOverlay').style.display = 'none';
  document.getElementById('modalConfirm').textContent = 'Confirm';
  if (!confirmed) return;

  const username    = document.getElementById('mu-username')?.value?.trim();
  const displayName = document.getElementById('mu-displayname')?.value?.trim();
  const role        = document.getElementById('mu-role')?.value;
  const password    = document.getElementById('mu-password')?.value;
  const confirm     = document.getElementById('mu-confirm')?.value;
  const writeToken  = document.getElementById('mu-token')?.value?.trim();

  if (!username || !password) { toast('Username and password are required', 'error'); return; }
  if (password !== confirm)   { toast('Passwords do not match', 'error'); return; }
  if (password.length < 8)    { toast('Password must be at least 8 characters', 'error'); return; }
  if (role !== 'viewer' && !writeToken) { toast('Write token is required for admin/editor roles', 'error'); return; }

  const users = storage.configUsers;
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    toast('Username already exists', 'error'); return;
  }

  try {
    const newUser = await auth.createUser(username, displayName || username, password, role, writeToken || null);
    await storage.saveUsers([...users, newUser]);
    toast(`User "${username}" created`, 'success');
    showUserManagement();
  } catch (e) { toast(e.message, 'error'); }
}

window.showEditUserModal = function(userId) {
  const users = storage.configUsers;
  const u = users.find(u => u.id === userId);
  if (!u) return;

  document.getElementById('modalTitle').textContent = `Edit: ${u.displayName || u.username}`;
  document.getElementById('modalBody').innerHTML = `
    <div class="form-group"><label>Role</label>
      <select id="eu-role">
        <option value="viewer" ${u.role==='viewer' ?'selected':''}>Viewer — read-only, export</option>
        <option value="editor" ${u.role==='editor' ?'selected':''}>Editor — create &amp; edit</option>
        <option value="admin"  ${u.role==='admin'  ?'selected':''}>Admin — full access + user mgmt</option>
      </select></div>
    <hr style="margin:14px 0;border:none;border-top:1px solid #eee"/>
    <p style="font-size:13px;color:#666;margin:0 0 10px">Reset password (leave blank to keep current):</p>
    <div class="form-group"><label>New Password</label><input type="password" id="eu-password" autocomplete="new-password" /></div>
    <div class="form-group"><label>Confirm Password</label><input type="password" id="eu-confirm" autocomplete="new-password" /></div>
    <div class="form-group">
      <label>Write Token (leave blank to keep current)</label>
      <input type="password" id="eu-token" placeholder="ghp_… — only needed if changing role or token" />
      <div class="field-hint">Only required if changing to admin/editor or if you want to update the stored token.</div>
    </div>`;
  document.getElementById('modalConfirm').textContent = 'Save';
  document.getElementById('modalOverlay').style.display = 'flex';
  _modalResolve = (ok) => handleEditUser(ok, userId);
};

async function handleEditUser(confirmed, userId) {
  document.getElementById('modalOverlay').style.display = 'none';
  document.getElementById('modalConfirm').textContent = 'Confirm';
  if (!confirmed) return;

  const newRole    = document.getElementById('eu-role')?.value;
  const newPw      = document.getElementById('eu-password')?.value;
  const confirm    = document.getElementById('eu-confirm')?.value;
  const writeToken = document.getElementById('eu-token')?.value?.trim();

  if (newPw && newPw !== confirm) { toast('Passwords do not match', 'error'); return; }
  if (newPw && newPw.length < 8)  { toast('Password must be at least 8 characters', 'error'); return; }

  try {
    const users = storage.configUsers;
    const idx   = users.findIndex(u => u.id === userId);
    if (idx < 0) { toast('User not found', 'error'); return; }

    const user = { ...users[idx], role: newRole };

    if (newPw) {
      // Re-encrypt token with new password; use provided write token or session token
      const token = writeToken || (newRole !== 'viewer' ? auth.token : null);
      await auth.changePassword(user, newPw, token);
    }
    // Note: updating the write token alone (without changing password) is not supported,
    // as re-encryption requires the plaintext password. Use password reset for token rotation.

    users[idx] = user;
    await storage.saveUsers(users);
    toast('User updated', 'success');
    showUserManagement();
  } catch (e) { toast(e.message, 'error'); }
}

window.toggleUserActive = async function(userId) {
  try {
    const users = storage.configUsers;
    const idx   = users.findIndex(u => u.id === userId);
    if (idx < 0) return;
    users[idx] = { ...users[idx], active: !(users[idx].active !== false) };
    await storage.saveUsers(users);
    toast('User updated', 'success');
    showUserManagement();
  } catch (e) { toast(e.message, 'error'); }
};

// ═══════════════════════════════════════════════════════════════════════
// CHANGE PASSWORD (from Settings page)
// ═══════════════════════════════════════════════════════════════════════
window.doChangePassword = async function() {
  const current = document.getElementById('sp-current')?.value;
  const newPw   = document.getElementById('sp-new')?.value;
  const confirm = document.getElementById('sp-confirm')?.value;
  const status  = document.getElementById('sp-status');

  if (!current || !newPw) { status.innerHTML = '<span style="color:red">All fields are required.</span>'; return; }
  if (newPw !== confirm)  { status.innerHTML = '<span style="color:red">Passwords do not match.</span>'; return; }
  if (newPw.length < 8)   { status.innerHTML = '<span style="color:red">Password must be at least 8 characters.</span>'; return; }

  status.textContent = 'Verifying current password…';
  try {
    const users   = storage.configUsers;
    const userIdx = users.findIndex(u => u.id === auth.currentUser?.userId);
    if (userIdx < 0) throw new Error('User account not found in config.');
    const user = users[userIdx];

    const ok = await auth.verifyPassword(current, user.passwordHash);
    if (!ok) { status.innerHTML = '<span style="color:red">Current password is incorrect.</span>'; return; }

    status.textContent = 'Updating password…';
    const writeToken = auth.token; // decrypt & re-encrypt with new password
    await auth.changePassword(user, newPw, writeToken);
    users[userIdx] = user;

    await storage.saveUsers(users);
    status.innerHTML = '<span style="color:green">✓ Password changed successfully. Signing out to refresh session…</span>';
    setTimeout(() => doLogout(), 1800);
  } catch (e) {
    status.innerHTML = `<span style="color:red">✗ ${esc(e.message)}</span>`;
  }
};

// ═══════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', async () => {
  await storage.loadRemoteConfig();    // fetch config.json → get dataOwner/dataRepo/readToken
  await storage.loadConfigUsers();     // fetch data/users.json → get users list
  route();
});
