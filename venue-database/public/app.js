'use strict';

const app = document.getElementById('app');
let META = null; // { applications, venueTypes, maxUploadBytes, stats }

// ---- tiny helpers ----------------------------------------------------------

async function api(path, options = {}) {
  const res = await fetch(path, options);
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await res.json() : null;
  if (!res.ok) throw new Error((body && body.error) || `Request failed (${res.status})`);
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
      ${v.submitted_by ? `<p class="muted small">Submitted by ${esc(v.submitted_by)}</p>` : ''}
    </div>

    <h2>Files (${v.files.length})</h2>
    <div id="files" class="stack">
      ${v.files.map(fileBlock).join('') || '<div class="card muted">No files uploaded yet.</div>'}
    </div>

    <h2>Upload a file</h2>
    ${uploadForm(v.id)}`;

  wireUploadForm(v.id);
  v.files.forEach((f) => wireReviewForm(f.id));
}

function fileBlock(f) {
  return `
    <div class="file-block" id="file-${esc(f.id)}">
      <div class="file-head">
        <h4>${esc(f.filename)}</h4>
        <div>${stars(f.avg_rating)} <span class="muted small">(${f.review_count})</span></div>
      </div>
      <div class="badges" style="margin:6px 0">
        ${f.application ? `<span class="badge">${esc(f.application)}${f.app_version ? ` ${esc(f.app_version)}` : ''}</span>` : ''}
        <span class="badge">${fmtBytes(f.size_bytes)}</span>
        ${f.uploader_name ? `<span class="badge">by ${esc(f.uploader_name)}</span>` : ''}
      </div>
      ${f.description ? `<p class="small">${esc(f.description)}</p>` : ''}
      <div class="row-actions">
        <a class="btn" href="/api/files/${esc(f.id)}/content">⬇ Download</a>
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
      <div><button class="btn btn-primary" type="submit">Create venue</button></div>
      <p class="error" data-role="err" hidden></p>
    </form>`;

  document.getElementById('add').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const err = form.querySelector('[data-role="err"]');
    err.hidden = true;
    const payload = {};
    for (const [k, val] of new FormData(form).entries()) if (val !== '') payload[k] = val;
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
      err.textContent = ex.message; err.hidden = false;
      setBusy(btn, false);
    }
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
    if (venueMatch) return renderVenue(venueMatch[1]);
    return renderBrowse();
  } catch (ex) {
    app.innerHTML = `<div class="card error">Something went wrong: ${esc(ex.message)}</div>`;
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
