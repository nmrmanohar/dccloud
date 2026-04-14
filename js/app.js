/**
 * app.js – DC Cloud Training Operations
 * Single-page app with hash-based routing.
 * Data loaded from GitHub (private repo) via storage.js
 */

// ── In-memory cache ───────────────────────────────────────────────────
const cache = { trainings: null, vendors: null, trainers: null };

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

async function route() {
  const { entity, action, id } = parseRoute();

  if (!storage.isConfigured && entity !== 'settings') {
    navigate('settings');
    return;
  }

  // Highlight active nav
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.route === entity);
  });

  const content = document.getElementById('content');
  content.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  try {
    if (entity === 'trainings') {
      if (action === 'new')  await showTrainingForm(null);
      else if (action === 'edit' && id) await showTrainingForm(id);
      else await showTrainingsList();
    } else if (entity === 'vendors') {
      if (action === 'new')  await showVendorForm(null);
      else if (action === 'edit' && id) await showVendorForm(id);
      else await showVendorsList();
    } else if (entity === 'trainers') {
      if (action === 'new')  await showTrainerForm(null);
      else if (action === 'edit' && id) await showTrainerForm(id);
      else await showTrainersList();
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
let _fyAll = false;
let _search = '';

async function showTrainingsList() {
  await Promise.all([loadEntity('trainings'), loadEntity('vendors'), loadEntity('trainers')]);

  const fy = currentFYRange();
  let rows = cache.trainings.slice();

  if (!_fyAll) rows = rows.filter(t => inCurrentFY(t.invoice_date));
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

  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="toolbar">
      <span class="toolbar-title">${esc(_fyAll ? 'All Trainings' : fy.label)}</span>
      <button class="btn btn-primary" onclick="navigate('trainings/new')">+ New</button>
      <div class="toolbar-sep"></div>
      <button class="btn" onclick="exportTrainings()">⬇ Export CSV</button>
    </div>

    <div class="filter-bar">
      <input class="search-box" type="text" placeholder="Search invoice #, course, vendor…"
        value="${esc(_search)}" oninput="onSearchChange(this.value)" />
      <select class="filter-select" onchange="onFYChange(this.value)">
        <option value="current" ${!_fyAll ? 'selected' : ''}>This FY</option>
        <option value="all"     ${_fyAll  ? 'selected' : ''}>All Years</option>
      </select>
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
window.onFYChange     = function(v) { _fyAll = v === 'all'; showTrainingsList(); };

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
      <button class="btn btn-primary" onclick="navigate('vendors/new')">+ New Account</button>
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
      <button class="btn btn-primary" onclick="navigate('trainers/new')">+ New Trainer</button>
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
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════
function showSettings() {
  const s = storage.settings;
  document.getElementById('content').innerHTML = `
    <div class="settings-wrap">
      <div class="settings-card">
        <h2>Settings – GitHub Data Connection</h2>
        <p>Your invoice data is stored as JSON files in a GitHub repository you control.
           Enter the details below once; they are saved in your browser only.</p>

        <h3>GitHub Personal Access Token (PAT)</h3>
        <div class="form-group">
          <label>Token <span style="color:#999;font-size:11px">(needs <code>repo</code> scope for private repos)</span></label>
          <input type="password" id="s-token" value="${esc(s.token||'')}" placeholder="ghp_xxxxxxxxx" autocomplete="off" />
        </div>

        <h3>Data Repository</h3>
        <div class="form-group">
          <label>Owner (GitHub username or org)</label>
          <input type="text" id="s-owner" value="${esc(s.dataOwner||'nmrmanohar')}" />
        </div>
        <div class="form-group">
          <label>Repository name <span style="color:#999;font-size:11px">(can be private)</span></label>
          <input type="text" id="s-repo" value="${esc(s.dataRepo||'dccloud-data')}" />
        </div>

        <div style="display:flex;gap:10px;margin-top:24px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="testAndSave()">Test &amp; Save</button>
          <button class="btn" onclick="initRepo()">Initialize Data Files</button>
        </div>
        <div id="s-status" style="margin-top:14px;font-size:13px"></div>

        <h3>Auditor Read-Only Access</h3>
        <p>To give your auditor read-only access, create a <strong>fine-grained PAT</strong> on GitHub with
           <em>Contents: Read-only</em> permission scoped to your data repo, and share just that token.
           They enter it here on their browser.</p>

        <h3>About</h3>
        <p>
          App hosted at: <span class="code">https://nmrmanohar.github.io/dccloud</span><br/>
          Built for: <strong>DC Cloud – Nallapareddy Manohar Reddy</strong>
        </p>
      </div>
    </div>`;
}

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
// INIT
// ═══════════════════════════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', route);
