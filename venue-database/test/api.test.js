// End-to-end API tests. Run with: npm test
// A throwaway data directory is used so tests never touch real data.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vdb-test-'));
process.env.VDB_DATA_DIR = tmp;
process.env.VDB_DB_PATH = path.join(tmp, 'test.sqlite');
process.env.ADMIN_TOKEN = 'test-admin-token';

const { createServer } = await import('../src/server.js');
const ADMIN = { 'X-Admin-Token': 'test-admin-token' };

let server;
let base;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(tmp, { recursive: true, force: true });
});

async function jreq(method, url, body, headers = {}) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  return { status: res.status, body: isJson ? await res.json() : null };
}
const jpost = (url, body, headers) => jreq('POST', url, body, headers);

test('meta endpoint returns config', async () => {
  const res = await fetch(base + '/api/meta');
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(body.applications));
  assert.ok(body.applications.includes('ArrayCalc'));
  assert.ok(body.maxUploadBytes > 0);
});

test('create venue validates required name', async () => {
  const { status, body } = await jpost('/api/venues', { city: 'Nowhere' });
  assert.equal(status, 422);
  assert.match(body.error, /name/);
});

test('full venue → file → review lifecycle', async () => {
  // 1. create venue
  const created = await jpost('/api/venues', {
    name: 'Test Arena', type: 'Arena', city: 'Testville', country: 'Testland',
    capacity: 12000, latitude: 12.34, longitude: 56.78,
  });
  assert.equal(created.status, 201);
  const venueId = created.body.id;
  assert.ok(venueId.startsWith('ven_'));

  // 2. appears in listing + search
  const list = await (await fetch(base + '/api/venues?q=Test%20Arena')).json();
  assert.equal(list.total, 1);
  assert.equal(list.venues[0].id, venueId);

  // 3. create file metadata
  const fileMeta = await jpost(`/api/venues/${venueId}/files`, {
    filename: 'design.dbpro', application: 'ArrayCalc', app_version: '11.2',
    description: 'main hang', uploader_name: 'Tester', consent: true,
  });
  assert.equal(fileMeta.status, 201);
  const fileId = fileMeta.body.id;
  assert.equal(fileMeta.body.uploadUrl, `/api/files/${fileId}/content`);

  // 4. upload bytes
  const payload = Buffer.from('binary-ish content \x00\x01\x02  arraycalc');
  const up = await fetch(base + fileMeta.body.uploadUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: payload,
  });
  const upBody = await up.json();
  assert.equal(up.status, 200);
  assert.equal(upBody.status, 'ready');
  assert.equal(upBody.size_bytes, payload.length);
  assert.equal(upBody.sha256.length, 64);

  // 5. download returns identical bytes
  const dl = await fetch(base + `/api/files/${fileId}/content`);
  assert.equal(dl.status, 200);
  const dlBuf = Buffer.from(await dl.arrayBuffer());
  assert.deepEqual(dlBuf, payload);

  // 6. add reviews and check aggregation
  assert.equal((await jpost(`/api/files/${fileId}/reviews`, { rating: 5, comment: 'great', reviewer_name: 'A' })).status, 201);
  assert.equal((await jpost(`/api/files/${fileId}/reviews`, { rating: 3, reviewer_name: 'B' })).status, 201);

  const fileAfter = await (await fetch(base + `/api/files/${fileId}`)).json();
  assert.equal(fileAfter.review_count, 2);
  assert.equal(fileAfter.avg_rating, 4);
  assert.equal(fileAfter.reviews.length, 2);

  // 7. venue detail reflects file + rollups
  const venueAfter = await (await fetch(base + `/api/venues/${venueId}`)).json();
  assert.equal(venueAfter.file_count, 1);
  assert.equal(venueAfter.review_count, 2);
  assert.equal(venueAfter.files.length, 1);
});

test('rejects invalid rating', async () => {
  const v = await jpost('/api/venues', { name: 'Rating Venue' });
  const f = await jpost(`/api/venues/${v.body.id}/files`, { filename: 'x.svml', consent: true });
  await fetch(base + f.body.uploadUrl, { method: 'POST', body: 'data' });
  const bad = await jpost(`/api/files/${f.body.id}/reviews`, { rating: 9 });
  assert.equal(bad.status, 422);
});

test('external reference: catalogued as a link, download redirects', async () => {
  const v = await jpost('/api/venues', { name: 'Reference Venue' });
  const ref = await jpost(`/api/venues/${v.body.id}/references`, {
    filename: 'EASE Focus 3 (official free download)',
    application: 'EASE / EASE Focus',
    source_url: 'https://example.com/official-resource',
    license_note: 'Vendor terms — verify before redistributing',
  });
  assert.equal(ref.status, 201);
  assert.equal(ref.body.status, 'reference');
  assert.equal(ref.body.source_url, 'https://example.com/official-resource');

  // reference requires a source_url
  const bad = await jpost(`/api/venues/${v.body.id}/references`, { filename: 'no url' });
  assert.equal(bad.status, 422);

  // download endpoint redirects to the official source (no rehosted bytes)
  const dl = await fetch(base + `/api/files/${ref.body.id}/content`, { redirect: 'manual' });
  assert.equal(dl.status, 302);
  assert.equal(dl.headers.get('location'), 'https://example.com/official-resource');

  // reviews work on references too
  assert.equal((await jpost(`/api/files/${ref.body.id}/reviews`, { rating: 4 })).status, 201);

  // it appears in the venue's file list
  const venueAfter = await (await fetch(base + `/api/venues/${v.body.id}`)).json();
  assert.equal(venueAfter.file_count, 1);
  assert.equal(venueAfter.files[0].status, 'reference');
});

test('geometry: store neutral model, convert to DXF/OBJ/JSON', async () => {
  const model = {
    units: 'meters',
    origin: { note: 'test room' },
    surfaces: [
      { name: 'Floor', type: 'audience', vertices: [[-5, 5, 0], [5, 5, 0], [5, 20, 0], [-5, 20, 0]] },
      { name: 'Stage', type: 'stage', vertices: [[-5, 0, 1], [5, 0, 1], [5, 5, 1]] },
    ],
    points: [{ label: 'FOH', x: 0, y: 15, z: 1.5 }],
  };
  const v = await jpost('/api/venues', { name: 'Geometry Hall' });
  const set = await fetch(base + `/api/venues/${v.body.id}/geometry`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...model, consent: true }),
  });
  assert.equal(set.status, 200);
  assert.equal((await set.json()).has_geometry, true);

  // shows up as convertible on the venue + in stats
  const venue = await (await fetch(base + `/api/venues/${v.body.id}`)).json();
  assert.equal(venue.has_geometry, true);

  // DXF export
  const dxfRes = await fetch(base + `/api/venues/${v.body.id}/export?format=dxf`);
  assert.equal(dxfRes.status, 200);
  assert.match(dxfRes.headers.get('content-disposition'), /geometry-hall\.dxf/);
  const dxf = await dxfRes.text();
  assert.match(dxf, /^0\r?\nSECTION/);         // starts with a SECTION
  assert.match(dxf, /3DFACE/);                  // faces emitted
  assert.match(dxf, /\nEOF\n$/);                // proper DXF terminator
  // quad -> 2 triangles, triangle -> 1 triangle = 3 faces
  assert.equal((dxf.match(/3DFACE/g) || []).length, 3);
  assert.match(dxf, /\nFOH\n/);                 // point label text

  // OBJ export
  const obj = await (await fetch(base + `/api/venues/${v.body.id}/export?format=obj`)).text();
  assert.match(obj, /^# VenueBridge export/);
  assert.match(obj, /\nf 1 2 3 4\n/);           // quad face, 1-indexed

  // JSON model round-trips through normalization
  const jsonModel = await (await fetch(base + `/api/venues/${v.body.id}/model`)).json();
  assert.equal(jsonModel.surfaces.length, 2);
  assert.equal(jsonModel.points[0].label, 'FOH');

  // unsupported format is rejected
  assert.equal((await fetch(base + `/api/venues/${v.body.id}/export?format=skp`)).status, 400);
});

test('geometry: reject invalid model, 404 when absent', async () => {
  const v = await jpost('/api/venues', { name: 'No Geometry Yet' });
  assert.equal((await fetch(base + `/api/venues/${v.body.id}/model`)).status, 404);
  assert.equal((await fetch(base + `/api/venues/${v.body.id}/export?format=dxf`)).status, 404);
  const bad = await fetch(base + `/api/venues/${v.body.id}/geometry`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ consent: true, surfaces: [{ name: 'bad', vertices: [[0, 0]] }] }),
  });
  assert.equal(bad.status, 422);
});

test('upload requires contribution consent', async () => {
  const v = await jpost('/api/venues', { name: 'Consent Hall' });
  const noConsent = await jpost(`/api/venues/${v.body.id}/files`, { filename: 'x.dbpr' });
  assert.equal(noConsent.status, 422);
  assert.match(noConsent.body.error, /right to share/i);
  const ok = await jpost(`/api/venues/${v.body.id}/files`, { filename: 'x.dbpr', consent: true });
  assert.equal(ok.status, 201);
});

test('duplicate detection: warns, then allows with confirm; alias search + merge', async () => {
  const a = await jpost('/api/venues', { name: 'Wembley Stadium', city: 'London', country: 'United Kingdom' });
  assert.equal(a.status, 201);

  // a typo'd near-duplicate in the same city should be blocked (409) with candidates
  const dup = await jpost('/api/venues', { name: 'Wembly Stadium', city: 'London', country: 'United Kingdom' });
  assert.equal(dup.status, 409);
  assert.ok(dup.body.duplicates.length >= 1);
  assert.equal(dup.body.duplicates[0].id, a.body.id);

  // the similar endpoint powers the live warning
  const sim = await (await fetch(base + '/api/venues/similar?name=' + encodeURIComponent('Wembley Stadum') + '&country=United+Kingdom')).json();
  assert.ok(sim.duplicates.length >= 1);

  // confirm_duplicate lets a genuine second entry through (we'll merge it back)
  const b = await jpost('/api/venues', { name: 'Wembley Stadium (old)', city: 'London', country: 'United Kingdom', confirm_duplicate: true });
  assert.equal(b.status, 201);

  // give b a file so we can prove merge moves content
  const f = await jpost(`/api/venues/${b.body.id}/files`, { filename: 'legacy.dbpr', consent: true });
  await fetch(base + f.body.uploadUrl, { method: 'POST', body: 'x' });

  // admin merge b -> a
  const merged = await jpost('/api/admin/merge', { source_id: b.body.id, target_id: a.body.id }, ADMIN);
  assert.equal(merged.status, 200);
  assert.equal(merged.body.id, a.body.id);

  // b is gone, its file now lives on a, and b's name is an alias of a
  assert.equal((await fetch(base + `/api/venues/${b.body.id}`)).status, 404);
  const aDetail = await (await fetch(base + `/api/venues/${a.body.id}`)).json();
  assert.equal(aDetail.file_count, 1);
  assert.ok(aDetail.aliases.some((al) => al.alias === 'Wembley Stadium (old)' && al.kind === 'former'));

  // searching the former name finds the surviving venue
  const search = await (await fetch(base + '/api/venues?q=' + encodeURIComponent('Wembley Stadium (old)'))).json();
  assert.ok(search.venues.some((v) => v.id === a.body.id));
});

test('fix requests: public submit, admin triage; admin needs a token', async () => {
  const v = await jpost('/api/venues', { name: 'Fixme Arena' });

  // public submit
  const fix = await jpost(`/api/venues/${v.body.id}/fix-requests`, { type: 'correction', message: 'Capacity is wrong, should be 5000', reporter_name: 'Tech' });
  assert.equal(fix.status, 201);

  // admin endpoints reject without / with wrong token
  assert.equal((await fetch(base + '/api/admin/fix-requests')).status, 401);
  assert.equal((await fetch(base + '/api/admin/fix-requests', { headers: { 'X-Admin-Token': 'nope' } })).status, 401);

  // admin lists and resolves
  const open = await (await fetch(base + '/api/admin/fix-requests?status=open', { headers: ADMIN })).json();
  assert.ok(open.fix_requests.length >= 1);
  const target = open.fix_requests.find((r) => r.venue_id === v.body.id);
  assert.equal(target.venue_name, 'Fixme Arena');
  const resolved = await jpost(`/api/admin/fix-requests/${target.id}/resolve`, { status: 'resolved', admin_note: 'fixed' }, ADMIN);
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.status, 'resolved');
});

test('admin can hide a venue, removing it from public listings', async () => {
  const v = await jpost('/api/venues', { name: 'Hide Me Hall', country: 'Testland' });
  const before = await (await fetch(base + '/api/venues?q=Hide%20Me%20Hall')).json();
  assert.equal(before.total, 1);
  const hidden = await jpost(`/api/admin/venues/${v.body.id}/status`, { status: 'hidden' }, ADMIN);
  assert.equal(hidden.status, 200);
  const after = await (await fetch(base + '/api/venues?q=Hide%20Me%20Hall')).json();
  assert.equal(after.total, 0);
});

test('unknown venue is 404', async () => {
  const res = await fetch(base + '/api/venues/ven_missing');
  assert.equal(res.status, 404);
});
