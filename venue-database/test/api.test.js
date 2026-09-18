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

const { createServer } = await import('../src/server.js');

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

async function jpost(url, body) {
  const res = await fetch(base + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

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
    description: 'main hang', uploader_name: 'Tester',
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
  const f = await jpost(`/api/venues/${v.body.id}/files`, { filename: 'x.svml' });
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

test('unknown venue is 404', async () => {
  const res = await fetch(base + '/api/venues/ven_missing');
  assert.equal(res.status, 404);
});
