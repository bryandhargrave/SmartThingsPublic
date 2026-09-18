'use strict';

const app = document.getElementById('app');
let META = null; // { applications, venueTypes, maxUploadBytes, stats }

// ---- tiny helpers ----------------------------------------------------------

async function api(path, options = {}) {
  const res = await fetch(path, options);
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    const err = new Error((body && body.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function stars(avg) {
  const n = Math.round(Number(avg) || 0);
  let out = '';
  for (let i = 1; i <= 5; i++) out += i <= n ? '★' : '<span class="empty">★</span>';
  return `<span class="stars" title="${avg ? Number(avg).toFixed(1) : 'no ratings'}">${out}</span>`;
}

function fmtBytes(b) {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
}

function locationLine(v) {
  return [v.city, v.region, v.country].filter(Boolean).join(', ');
}

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  if (busy) { btn.dataset.label = btn.textContent; btn.textContent = label || 'Working…'; }
  else if (btn.dataset.label) { btn.textContent = btn.dataset.label; }
}

// ---- views -----------------------------------------------------------------

async function renderBrowse() {
  app.innerHTML = '<p class="loading">Loading venues…</p>';
  const s = META.stats;
  const params = new URLSearchParams(location.hash.split('?')[1] || '');
  const q = params.get('q') || '';
  const country = params.get('country') || '';
  const type = params.get('type') || '';

  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (country) query.set('country', country);
  if (type) query.set('type', type);
  const data = await api(`/api/venues?${query.toString()}`);

  const typeOptions = ['<option value="">All types</option>']
    .concat(META.venueTypes.map((t) => `<option value="${esc(t)}" ${t === type ? 'selected' : ''}>${esc(t)}</option>`))
    .join('');

  app.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${s.venues}</b><span>Venues</span></div>
      <div class="stat"><b>${s.models ?? 0}</b><span>Convertible</span></div>
      <div class="stat"><b>${s.files}</b><span>Files</span></div>
      <div class="stat"><b>${s.reviews}</b><span>Reviews</span></div>
      <div class="stat"><b>${s.countries}</b><span>Countries</span></div>
    </div>

    <form id="search" class="searchbar">
      <input name="q" placeholder="Search venue, city or country…" value="${esc(q)}" />
      <input name="country" placeholder="Country" value="${esc(country)}" />
      <select name="type">${typeOptions}</select>
      <button class="btn btn-primary" type="submit">Search</button>
    </form>

    <p class="muted small">${data.total} venue${data.total === 1 ? '' : 's'}${q || country || type ? ' matching your filters' : ''}.</p>
    <div class="venue-list">
      ${data.venues.map(venueCard).join('') || '<div class="card muted">No venues yet. Be the first to <a href="#/add">add one</a>.</div>'}
    </div>`;

  document.getElementById('search').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const next = new URLSearchParams();
    for (const [k, val] of f.entries()) if (val) next.set(k, val);
    location.hash = `#/?${next.toString()}`;
  });
}

function venueCard(v) {
  return `
    <a class="card venue-item" href="#/venues/${esc(v.id)}">
      <div>
        <h3>${esc(v.name)}</h3>
        <div class="meta">${esc(locationLine(v)) || 'Location not specified'}${v.capacity ? ` · cap. ${v.capacity.toLocaleString()}` : ''}</div>
        <div class="badges">
          ${v.type ? `<span class="badge">${esc(v.type)}</span>` : ''}
          ${v.has_geometry ? '<span class="badge" style="border-color:var(--primary);color:var(--primary)">geometry ⇄</span>' : ''}
          <span class="badge">${v.file_count} file${v.file_count === 1 ? '' : 's'}</span>
          <span class="badge">${v.review_count} review${v.review_count === 1 ? '' : 's'}</span>
        </div>
      </div>
      <div style="text-align:right; white-space:nowrap">${stars(v.avg_rating)}</div>
    </a>`;
}

async function renderVenue(id) {
  app.innerHTML = '<p class="loading">Loading venue…</p>';
  const v = await api(`/api/venues/${id}`);
  app.innerHTML = `
    <a class="back" href="#/">← All venues</a>
    <div class="card stack">
      <div>
        <h1>${esc(v.name)}</h1>
        <div class="muted">${esc(locationLine(v)) || 'Location not specified'}${v.capacity ? ` · capacity ${v.capacity.toLocaleString()}` : ''}</div>
        <div class="badges" style="margin-top:8px">
          ${v.type ? `<span class="badge">${esc(v.type)}</span>` : ''}
          ${v.website ? `<a class="badge" href="${esc(v.website)}" target="_blank" rel="noopener">website ↗</a>` : ''}
          ${v.latitude != null && v.longitude != null ? `<a class="badge" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${v.latitude}&mlon=${v.longitude}#map=16/${v.latitude}/${v.longitude}">map ↗</a>` : ''}
        </div>
      </div>
      ${v.description ? `<p>${esc(v.description)}</p>` : ''}
      ${(v.aliases && v.aliases.length) ? `<p class="muted small">Also known as: ${v.aliases.map((a) => esc(a.alias)).join(' · ')}</p>` : ''}
      ${v.submitted_by ? `<p class="muted small">Submitted by ${esc(v.submitted_by)}</p>` : ''}
    </div>

    ${v.has_geometry ? `
    <h2>Get a venue file</h2>
    <div class="card stack">
      <div class="notice small">This venue has an open geometry model. Convert it to the format your prediction software imports, then build your design in your own tool. Coordinates are in metres; treat the model as a schematic starting point and verify against the real room.</div>
      <div class="row-actions">
        <a class="btn btn-primary" href="/api/venues/${esc(v.id)}/export?format=dxf">⬇ DXF (CAD / SketchUp / most tools)</a>
        <a class="btn" href="/api/venues/${esc(v.id)}/export?format=obj">⬇ OBJ (3D)</a>
        <a class="btn" href="/api/venues/${esc(v.id)}/export?format=json">⬇ JSON (neutral model)</a>
        <a class="btn" href="/api/venues/${esc(v.id)}/model" target="_blank" rel="noopener">view model</a>
      </div>
      <p class="small muted">Import DXF into ArrayCalc, Soundvision, MAPP 3D, DISPLAY 3, Danley Direct, SketchUp Pro, AutoCAD, and more.</p>
    </div>` : ''}

    <h2>Files (${v.files.length})</h2>
    <div id="files" class="stack">
      ${v.files.map(fileBlock).join('') || '<div class="card muted">No files uploaded yet.</div>'}
    </div>

    <h2>Upload a file</h2>
    ${uploadForm(v.id)}

    <h2>Report an issue</h2>
    ${reportForm(v.id)}`;

  wireUploadForm(v.id);
  wireReportForm(v.id);
  v.files.forEach((f) => wireReviewForm(f.id));
}

function reportForm(venueId) {
  return `
    <form id="report" class="card stack" data-venue="${esc(venueId)}">
      <p class="small muted">Spotted a typo, wrong detail, a duplicate, or a name change? Let the maintainers know.</p>
      <div class="field-row">
        <div>
          <label>Type</label>
          <select name="type">
            <option value="correction">Correction</option>
            <option value="name_change">Name change</option>
            <option value="duplicate">Duplicate of another venue</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div><label>Your name (optional)</label><input name="reporter_name" maxlength="120" /></div>
      </div>
      <label>What needs fixing? *</label>
      <textarea name="message" maxlength="4000" required placeholder="e.g. Capacity should be 5,000; or 'renamed from X to Y in 2024'; or 'duplicate of <venue>'."></textarea>
      <div><label>Contact (optional, if you're happy to be followed up)</label><input name="reporter_contact" maxlength="200" /></div>
      <div><button class="btn btn-primary" type="submit">Submit report</button></div>
      <p class="error" data-role="err" hidden></p>
      <p class="small" data-role="ok" hidden style="color:var(--primary)"></p>
    </form>`;
}

function wireReportForm(venueId) {
  const form = document.getElementById('report');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('[data-role="err"]');
    const ok = form.querySelector('[data-role="ok"]');
    err.hidden = true; ok.hidden = true;
    if (!form.message.value.trim()) { err.textContent = 'Please describe the issue.'; err.hidden = false; return; }
    const btn = form.querySelector('button');
    setBusy(btn, true, 'Submitting…');
    try {
      await api(`/api/venues/${venueId}/fix-requests`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: form.type.value, message: form.message.value,
          reporter_name: form.reporter_name.value, reporter_contact: form.reporter_contact.value,
        }),
      });
      form.reset();
      ok.textContent = 'Thanks — your report was submitted for review.'; ok.hidden = false;
      setBusy(btn, false);
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
      setBusy(btn, false);
    }
  });
}

function fileBlock(f) {
  const isRef = f.status === 'reference';
  const action = isRef
    ? `<a class="btn" href="${esc(f.source_url)}" target="_blank" rel="noopener">↗ Open official source</a>`
    : `<a class="btn" href="/api/files/${esc(f.id)}/content">⬇ Download</a>`;
  return `
    <div class="file-block" id="file-${esc(f.id)}">
      <div class="file-head">
        <h4>${esc(f.filename)}</h4>
        <div>${stars(f.avg_rating)} <span class="muted small">(${f.review_count})</span></div>
      </div>
      <div class="badges" style="margin:6px 0">
        ${isRef ? '<span class="badge" style="border-color:var(--primary);color:var(--primary)">external reference</span>' : ''}
        ${f.application ? `<span class="badge">${esc(f.application)}${f.app_version ? ` ${esc(f.app_version)}` : ''}</span>` : ''}
        ${isRef ? '' : `<span class="badge">${fmtBytes(f.size_bytes)}</span>`}
        ${f.uploader_name ? `<span class="badge">by ${esc(f.uploader_name)}</span>` : ''}
      </div>
      ${f.description ? `<p class="small">${esc(f.description)}</p>` : ''}
      ${isRef && f.license_note ? `<p class="small muted">License: ${esc(f.license_note)}</p>` : ''}
      <div class="row-actions">
        ${action}
      </div>

      <div class="reviews">
        ${(f.reviews || []).map(reviewBlock).join('')}
      </div>

      <form class="review-form stack" data-file="${esc(f.id)}" style="margin-top:12px">
        <label>Your rating</label>
        ${ratingInput()}
        <div class="field-row">
          <div><label>Name (optional)</label><input name="reviewer_name" maxlength="120" placeholder="e.g. FOH engineer" /></div>
        </div>
        <label>Comment</label>
        <textarea name="comment" maxlength="4000" placeholder="How accurate was the prediction? Any gotchas at this venue?"></textarea>
        <div><button class="btn btn-primary" type="submit">Post review</button></div>
        <p class="error" data-role="err" hidden></p>
      </form>
    </div>`;
}

function reviewBlock(r) {
  return `
    <div class="review">
      <div>${stars(r.rating)} <span class="who">${esc(r.reviewer_name || 'Anonymous')} · ${esc((r.created_at || '').replace('T', ' ').replace('Z', ''))}</span></div>
      ${r.comment ? `<div class="small">${esc(r.comment)}</div>` : ''}
    </div>`;
}

function ratingInput() {
  return `<div class="rating-input" data-role="rating" data-value="0">
    ${[1, 2, 3, 4, 5].map((n) => `<span data-val="${n}">★</span>`).join('')}
  </div>`;
}

function uploadForm(venueId) {
  const appOptions = META.applications.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
  return `
    <form id="upload" class="card stack" data-venue="${esc(venueId)}">
      <div class="notice small">Upload project or measurement files (ArrayCalc, Soundvision, MAPP 3D, EASE, GLL, measurement exports…). Max ${fmtBytes(META.maxUploadBytes)}. Only share files you have the right to distribute.</div>
      <div>
        <label>File *</label>
        <input type="file" name="file" required />
      </div>
      <div class="field-row">
        <div>
          <label>Application</label>
          <select name="application"><option value="">— select —</option>${appOptions}</select>
        </div>
        <div><label>App version</label><input name="app_version" maxlength="60" placeholder="e.g. 11.2" /></div>
      </div>
      <div><label>Your name (optional)</label><input name="uploader_name" maxlength="120" /></div>
      <label>Description / notes</label>
      <textarea name="description" maxlength="3000" placeholder="What's in this file? Rig, trim heights, what worked well…"></textarea>
      <label class="check"><input type="checkbox" name="consent" /> I have the right to share this file and agree to contribute it to the open database under CC BY-SA 4.0.</label>
      <div><button class="btn btn-primary" type="submit">Upload file</button></div>
      <p class="error" data-role="err" hidden></p>
    </form>`;
}

// ---- interaction wiring ----------------------------------------------------

function wireRating(container) {
  const stars = [...container.querySelectorAll('span')];
  const paint = (val) => stars.forEach((s) => s.classList.toggle('on', Number(s.dataset.val) <= val));
  stars.forEach((s) => {
    s.addEventListener('mouseenter', () => paint(Number(s.dataset.val)));
    s.addEventListener('click', () => { container.dataset.value = s.dataset.val; paint(Number(s.dataset.val)); });
  });
  container.addEventListener('mouseleave', () => paint(Number(container.dataset.value)));
}

function wireReviewForm(fileId) {
  const form = document.querySelector(`.review-form[data-file="${CSS.escape(fileId)}"]`);
  if (!form) return;
  wireRating(form.querySelector('[data-role="rating"]'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('[data-role="err"]');
    err.hidden = true;
    const rating = Number(form.querySelector('[data-role="rating"]').dataset.value);
    if (!rating) { err.textContent = 'Please pick a star rating.'; err.hidden = false; return; }
    const btn = form.querySelector('button');
    setBusy(btn, true, 'Posting…');
    try {
      await api(`/api/files/${fileId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating,
          comment: form.comment.value,
          reviewer_name: form.reviewer_name.value,
        }),
      });
      router(); // reload venue view
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
      setBusy(btn, false);
    }
  });
}

function wireUploadForm(venueId) {
  const form = document.getElementById('upload');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('[data-role="err"]');
    err.hidden = true;
    const file = form.file.files[0];
    if (!file) { err.textContent = 'Choose a file first.'; err.hidden = false; return; }
    if (!form.consent.checked) { err.textContent = 'Please confirm you have the right to share this file.'; err.hidden = false; return; }
    if (file.size > META.maxUploadBytes) {
      err.textContent = `File is too large (max ${fmtBytes(META.maxUploadBytes)}).`; err.hidden = false; return;
    }
    const btn = form.querySelector('button');
    setBusy(btn, true, 'Uploading…');
    try {
      // 1) create metadata, 2) stream the bytes to the returned upload URL.
      const meta = await api(`/api/venues/${venueId}/files`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          application: form.application.value,
          app_version: form.app_version.value,
          description: form.description.value,
          uploader_name: form.uploader_name.value,
          consent: true,
        }),
      });
      await api(meta.uploadUrl, {
        method: 'POST',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });
      router();
    } catch (ex) {
      err.textContent = ex.message; err.hidden = false;
      setBusy(btn, false);
    }
  });
}

async function renderAddVenue() {
  const typeOptions = ['<option value="">— select —</option>']
    .concat(META.venueTypes.map((t) => `<option value="${esc(t)}">${esc(t)}</option>`)).join('');
  app.innerHTML = `
    <a class="back" href="#/">← All venues</a>
    <h1>Add a venue</h1>
    <form id="add" class="card stack">
      <div><label>Venue name *</label><input name="name" required maxlength="200" /></div>
      <div class="field-row">
        <div><label>Type</label><select name="type">${typeOptions}</select></div>
        <div><label>Capacity</label><input name="capacity" type="number" min="0" /></div>
      </div>
      <div class="field-row">
        <div><label>City</label><input name="city" /></div>
        <div><label>Region / State</label><input name="region" /></div>
      </div>
      <div class="field-row">
        <div><label>Country</label><input name="country" /></div>
        <div><label>Website</label><input name="website" placeholder="https://" /></div>
      </div>
      <div class="field-row">
        <div><label>Latitude</label><input name="latitude" type="number" step="any" min="-90" max="90" /></div>
        <div><label>Longitude</label><input name="longitude" type="number" step="any" min="-180" max="180" /></div>
      </div>
      <div><label>Address</label><input name="address" /></div>
      <label>Description (acoustics, quirks, rigging notes…)</label>
      <textarea name="description" maxlength="5000"></textarea>
      <div><label>Your name (optional)</label><input name="submitted_by" maxlength="120" /></div>
      <div data-role="dups" hidden></div>
      <div><button class="btn btn-primary" type="submit">Create venue</button></div>
      <p class="error" data-role="err" hidden></p>
    </form>`;

  let confirmDuplicate = false;
  document.getElementById('add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const err = form.querySelector('[data-role="err"]');
    const dupBox = form.querySelector('[data-role="dups"]');
    err.hidden = true;
    const payload = {};
    for (const [k, val] of new FormData(form).entries()) if (val !== '') payload[k] = val;
    if (confirmDuplicate) payload.confirm_duplicate = true;
    const btn = form.querySelector('button');
    setBusy(btn, true, 'Creating…');
    try {
      const v = await api('/api/venues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      location.hash = `#/venues/${v.id}`;
    } catch (ex) {
      setBusy(btn, false);
      if (ex.status === 409 && ex.body && ex.body.duplicates) {
        // Show likely existing venues and let the user pick one or confirm a new entry.
        dupBox.hidden = false;
        dupBox.innerHTML = `
          <div class="notice">
            <strong>This may already be in the database.</strong> Possible matches:
            <ul style="margin:8px 0">
              ${ex.body.duplicates.map((d) => `<li><a href="#/venues/${esc(d.id)}">${esc(d.name)}</a>${d.city ? ` — ${esc(d.city)}` : ''}${d.country ? `, ${esc(d.country)}` : ''} <span class="muted small">(${Math.round(d.score * 100)}% match)</span></li>`).join('')}
            </ul>
            If none of these is your venue, submit again to add it anyway.
          </div>`;
        confirmDuplicate = true;
        btn.textContent = 'Add anyway';
        return;
      }
      err.textContent = ex.message; err.hidden = false;
    }
  });
}

// ---- admin -----------------------------------------------------------------

const ADMIN_KEY = 'vdb_admin_token';
const getAdminToken = () => { try { return localStorage.getItem(ADMIN_KEY) || ''; } catch { return ''; } };
const setAdminToken = (t) => { try { t ? localStorage.setItem(ADMIN_KEY, t) : localStorage.removeItem(ADMIN_KEY); } catch { /* ignore */ } };

async function adminApi(path, options = {}) {
  return api(path, { ...options, headers: { ...(options.headers || {}), 'X-Admin-Token': getAdminToken() } });
}

async function renderAdmin() {
  const token = getAdminToken();
  if (!token) {
    app.innerHTML = `
      <a class="back" href="#/">← Back</a>
      <h1>Maintenance</h1>
      <form id="admin-login" class="card stack" style="max-width:420px">
        <p class="small muted">Enter your admin token. It's stored only in this browser. The token is set via the <code>ADMIN_TOKEN</code> environment variable (or printed in the server log in dev).</p>
        <div><label>Admin token</label><input name="token" type="password" autocomplete="off" /></div>
        <div><button class="btn btn-primary" type="submit">Unlock</button></div>
        <p class="error" data-role="err" hidden></p>
      </form>`;
    document.getElementById('admin-login').addEventListener('submit', async (e) => {
      e.preventDefault();
      const t = e.target.token.value.trim();
      const err = e.target.querySelector('[data-role="err"]');
      setAdminToken(t);
      try { await adminApi('/api/admin/overview'); router(); }
      catch { setAdminToken(''); err.textContent = 'That token was not accepted.'; err.hidden = false; }
    });
    return;
  }

  app.innerHTML = '<p class="loading">Loading admin…</p>';
  let overview, fixes;
  try {
    overview = await adminApi('/api/admin/overview');
    fixes = await adminApi('/api/admin/fix-requests?status=open');
  } catch (ex) {
    if (ex.status === 401) { setAdminToken(''); return router(); }
    app.innerHTML = `<div class="card error">${esc(ex.message)}</div>`; return;
  }

  app.innerHTML = `
    <div class="row-actions" style="justify-content:space-between">
      <a class="back" href="#/">← Back to site</a>
      <button class="btn" id="admin-logout">Lock</button>
    </div>
    <h1>Maintenance</h1>
    <div class="stats">
      <div class="stat"><b>${overview.venues_total}</b><span>Venues</span></div>
      <div class="stat"><b>${overview.venues_hidden}</b><span>Hidden/flagged</span></div>
      <div class="stat"><b>${overview.fix_open}</b><span>Open reports</span></div>
      <div class="stat"><b>${overview.files}</b><span>Files</span></div>
    </div>

    <h2>Open fix requests (${fixes.fix_requests.length})</h2>
    <div id="fixes" class="stack">
      ${fixes.fix_requests.map(fixRow).join('') || '<div class="card muted">Nothing to review. 🎉</div>'}
    </div>

    <h2>Merge duplicates</h2>
    <form id="merge" class="card stack">
      <p class="small muted">Fold the source venue into the target: its files, geometry and aliases move to the target, and the source's name is kept as a former-name alias. Paste venue IDs (visible in each venue's URL).</p>
      <div class="field-row">
        <div><label>Source venue ID (removed)</label><input name="source_id" placeholder="ven_…" /></div>
        <div><label>Target venue ID (kept)</label><input name="target_id" placeholder="ven_…" /></div>
      </div>
      <div><button class="btn btn-primary" type="submit">Merge</button></div>
      <p class="error" data-role="err" hidden></p>
      <p class="small" data-role="ok" hidden style="color:var(--primary)"></p>
    </form>

    <h2>Find & manage venues</h2>
    <form id="admin-search" class="searchbar"><input name="q" placeholder="Search all venues (incl. hidden)…" /><button class="btn">Search</button></form>
    <div id="admin-venues" class="stack"></div>`;

  document.getElementById('admin-logout').addEventListener('click', () => { setAdminToken(''); router(); });
  fixes.fix_requests.forEach(wireFixRow);
  wireMergeForm();
  wireAdminSearch();
}

function fixRow(r) {
  return `
    <div class="card stack" data-fix="${esc(r.id)}">
      <div class="row-actions" style="justify-content:space-between">
        <div><span class="badge">${esc(r.type)}</span> ${r.venue_name ? `on <a href="#/venues/${esc(r.venue_id)}">${esc(r.venue_name)}</a>` : '<span class="muted">(no venue)</span>'}</div>
        <span class="muted small">${esc((r.created_at || '').replace('T', ' ').replace('Z', ''))}</span>
      </div>
      <div>${esc(r.message)}</div>
      ${r.reporter_name || r.reporter_contact ? `<div class="muted small">— ${esc(r.reporter_name || 'anon')}${r.reporter_contact ? ` · ${esc(r.reporter_contact)}` : ''}</div>` : ''}
      <div class="row-actions">
        <input data-role="note" placeholder="Note (optional)" style="max-width:280px" />
        <button class="btn btn-primary" data-act="resolved">Mark resolved</button>
        <button class="btn" data-act="dismissed">Dismiss</button>
      </div>
      <p class="error" data-role="err" hidden></p>
    </div>`;
}

function wireFixRow(r) {
  const card = document.querySelector(`[data-fix="${CSS.escape(r.id)}"]`);
  if (!card) return;
  card.querySelectorAll('button[data-act]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const err = card.querySelector('[data-role="err"]');
      err.hidden = true;
      try {
        await adminApi(`/api/admin/fix-requests/${r.id}/resolve`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: btn.dataset.act, admin_note: card.querySelector('[data-role="note"]').value }),
        });
        card.remove();
      } catch (ex) { err.textContent = ex.message; err.hidden = false; }
    });
  });
}

function wireMergeForm() {
  const form = document.getElementById('merge');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = form.querySelector('[data-role="err"]'); const ok = form.querySelector('[data-role="ok"]');
    err.hidden = true; ok.hidden = true;
    try {
      const t = await adminApi('/api/admin/merge', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_id: form.source_id.value.trim(), target_id: form.target_id.value.trim() }),
      });
      ok.textContent = `Merged into "${t.name}".`; ok.hidden = false; form.reset();
    } catch (ex) { err.textContent = ex.message; err.hidden = false; }
  });
}

function wireAdminSearch() {
  const form = document.getElementById('admin-search');
  const out = document.getElementById('admin-venues');
  const run = async (q) => {
    out.innerHTML = '<p class="loading">Searching…</p>';
    const data = await adminApi(`/api/admin/venues?status=all&q=${encodeURIComponent(q || '')}`);
    out.innerHTML = data.venues.map(adminVenueRow).join('') || '<div class="card muted">No venues.</div>';
    data.venues.forEach(wireAdminVenueRow);
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); run(form.q.value); });
  run('');
}

function adminVenueRow(v) {
  return `
    <div class="card stack" data-av="${esc(v.id)}">
      <div class="row-actions" style="justify-content:space-between">
        <div><a href="#/venues/${esc(v.id)}"><strong>${esc(v.name)}</strong></a>
          <span class="muted small">${esc([v.city, v.country].filter(Boolean).join(', '))}</span>
          ${v.status !== 'published' ? `<span class="badge" style="border-color:var(--danger);color:var(--danger)">${esc(v.status)}</span>` : ''}
        </div>
        <code class="small muted">${esc(v.id)}</code>
      </div>
      <div class="row-actions">
        <button class="btn" data-act="edit">Edit</button>
        <button class="btn" data-act="alias">Add alias</button>
        <button class="btn" data-act="toggle">${v.status === 'published' ? 'Hide' : 'Publish'}</button>
        <button class="btn" data-act="delete" style="border-color:var(--danger);color:var(--danger)">Delete</button>
      </div>
      <div data-role="edit" hidden></div>
      <p class="error" data-role="err" hidden></p>
    </div>`;
}

function wireAdminVenueRow(v) {
  const card = document.querySelector(`[data-av="${CSS.escape(v.id)}"]`);
  if (!card) return;
  const err = card.querySelector('[data-role="err"]');
  const fail = (ex) => { err.textContent = ex.message; err.hidden = false; };
  const act = (name) => card.querySelector(`button[data-act="${name}"]`);

  act('toggle').addEventListener('click', async () => {
    err.hidden = true;
    try {
      await adminApi(`/api/admin/venues/${v.id}/status`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: v.status === 'published' ? 'hidden' : 'published' }),
      });
      router();
    } catch (ex) { fail(ex); }
  });

  act('alias').addEventListener('click', async () => {
    err.hidden = true;
    const alias = prompt(`Add an alternate/former name for "${v.name}":`);
    if (!alias) return;
    try {
      await adminApi(`/api/admin/venues/${v.id}/aliases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias, kind: 'aka' }),
      });
      err.textContent = 'Alias added.'; err.hidden = false; err.style.color = 'var(--primary)';
    } catch (ex) { err.style.color = ''; fail(ex); }
  });

  act('delete').addEventListener('click', async () => {
    err.hidden = true;
    if (!confirm(`Delete "${v.name}" and all its files/reviews? This cannot be undone.`)) return;
    try { await adminApi(`/api/admin/venues/${v.id}`, { method: 'DELETE' }); card.remove(); }
    catch (ex) { fail(ex); }
  });

  act('edit').addEventListener('click', () => {
    const box = card.querySelector('[data-role="edit"]');
    if (!box.hidden) { box.hidden = true; return; }
    box.hidden = false;
    box.innerHTML = `
      <form class="stack" style="margin-top:10px">
        <div class="field-row">
          <div><label>Name</label><input name="name" value="${esc(v.name)}" /></div>
          <div><label>Capacity</label><input name="capacity" type="number" value="${v.capacity ?? ''}" /></div>
        </div>
        <div class="field-row">
          <div><label>City</label><input name="city" value="${esc(v.city || '')}" /></div>
          <div><label>Country</label><input name="country" value="${esc(v.country || '')}" /></div>
        </div>
        <div><label>Website</label><input name="website" value="${esc(v.website || '')}" /></div>
        <div><button class="btn btn-primary" type="submit">Save</button></div>
      </form>`;
    box.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      const f = e.target;
      const payload = { name: f.name.value, city: f.city.value, country: f.country.value, website: f.website.value };
      if (f.capacity.value) payload.capacity = Number(f.capacity.value);
      try { await adminApi(`/api/admin/venues/${v.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); router(); }
      catch (ex) { fail(ex); }
    });
  });
}

// ---- router ----------------------------------------------------------------

async function router() {
  try {
    if (!META) META = await api('/api/meta');
    else META.stats = (await api('/api/meta')).stats; // keep counts fresh
    const hash = location.hash.replace(/^#/, '') || '/';
    const path = hash.split('?')[0];
    const venueMatch = path.match(/^\/venues\/([^/]+)$/);
    if (path === '/add') return renderAddVenue();
    if (path === '/admin') return renderAdmin();
    if (venueMatch) return renderVenue(venueMatch[1]);
    return renderBrowse();
  } catch (ex) {
    app.innerHTML = `<div class="card error">Something went wrong: ${esc(ex.message)}</div>`;
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
