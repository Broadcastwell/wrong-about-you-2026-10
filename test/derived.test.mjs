// Tests on the real v1.0 data (data/ and results/) and on the review import. Run: node --test test/
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readDerived, validateDerived, analyseDerived, engineStatements, reviewState, reviewMark, TYPES, CAPTURE_LINE } from '../analysis/index-record.mjs';
import { noDash, DEPOSIT_SHA256 } from '../analysis/derive.mjs';
import { importReview, sheetDate } from '../scripts/import-review.mjs';
import { writeXlsx, readXlsx } from '../lib/xlsx-lite.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');
const hasData = existsSync(join(DATA, 'claims.csv'));

test('the deposit hash pinned in derive.mjs is the published SHA-256 of answers-2026-09.jsonl', () => {
  assert.equal(DEPOSIT_SHA256, '221c94e1ebad2bc87d7cd20837fa670cc40b10dba6f68b75423dc8bee69697b3');
});

test('our own text carries no dash characters; quotes are left verbatim', () => {
  assert.equal(noDash('Plans $49\u2013$129 a month \u2014 billed yearly'), 'Plans $49 to $129 a month, billed yearly');
  assert.equal(noDash('a -- b'), 'a, b');
  assert.equal(noDash('no dash here'), 'no dash here');
});

test('review state follows the reviewer fields and the mark shows only for two analysts and a date', () => {
  assert.equal(reviewState({}), 'unreviewed');
  assert.equal(reviewState({ reviewer_1: 'AB' }), 'first review');
  assert.equal(reviewState({ reviewer_1: 'AB', reviewer_2: 'AB', review_date: '2026-10-09' }), 'first review');
  assert.equal(reviewState({ reviewer_1: 'AB', reviewer_2: 'CD', review_date: '2026-10-09' }), 'verified');
  assert.equal(reviewMark({ reviewer_1: 'AB', reviewer_2: 'CD', review_date: '2026-10-09' }), 'Verified by two Broadcastwell analysts, 2026-10-09');
  assert.equal(reviewMark({ reviewer_1: 'AB' }), 'Team review: in progress');
});

test('the review import flips rows only for two different analysts and a past date, logs every change and never changes a class', () => {
  const sheet = writeXlsx([{ name: 'Review', columns: ['slug', 'claim_id', 'reviewer_1', 'reviewer_2', 'review_date', 'note'], rows: [
    ['acme', 'C01', 'AB', 'CD', '2026-10-09', ''], ['acme', 'C02', 'AB', '', '', ''], ['acme', 'C03', 'AB', 'CD', 46304, 'class should be stale']] }]);
  const rows = ['C01', 'C02', 'C03'].map(c => ({ slug: 'acme', claim_id: c, class: 'true', reviewer_1: '', reviewer_2: '', review_date: '', review_state: 'unreviewed' }));
  const out = importReview({ sheetBuf: sheet, rows, keys: ['slug', 'claim_id'], now: new Date('2026-10-10T00:00:00Z') });
  assert.equal(out.ok, true);
  assert.deepEqual(out.rows.map(r => r.review_state), ['verified', 'first review', 'verified']);
  assert.deepEqual(out.rows.map(r => r.class), ['true', 'true', 'true'], 'classes are never changed by the import');
  assert.equal(out.changes.length, 3); assert.equal(out.classRequests.length, 1);
  assert.equal(sheetDate(46304), '2026-10-09');
  const same = writeXlsx([{ name: 'Review', columns: ['slug', 'claim_id', 'reviewer_1', 'reviewer_2', 'review_date'], rows: [['acme', 'C01', 'AB', 'AB', '2026-10-09']] }]);
  assert.equal(importReview({ sheetBuf: same, rows, keys: ['slug', 'claim_id'] }).ok, false);
  const future = writeXlsx([{ name: 'Review', columns: ['slug', 'claim_id', 'reviewer_1', 'reviewer_2', 'review_date'], rows: [['acme', 'C01', 'AB', 'CD', '2099-01-01']] }]);
  assert.equal(importReview({ sheetBuf: future, rows, keys: ['slug', 'claim_id'] }).ok, false);
  assert.deepEqual(readXlsx(sheet).Review.length, 3);
});

test('the published data validates, reconciles with the release named counts and recomputes to results/summary.json', { skip: !hasData }, () => {
  const d = readDerived(DATA);
  const v = validateDerived(d);
  assert.deepEqual(v.errors.slice(0, 5), []);
  assert.equal(d.vendors.length, 70);
  assert.equal(d.answers.length, d.vendors.reduce((n, x) => n + Number(x.named_count), 0));
  const r = analyseDerived(d);
  const saved = JSON.parse(readFileSync(join(ROOT, 'results', 'summary.json'), 'utf8'));
  assert.deepEqual(saved.totals, JSON.parse(JSON.stringify(r.totals)));
  assert.deepEqual(saved.per_vendor.map(x => [x.slug, x.wrong, x.stale, x.true, x.unverifiable]), r.per_vendor.map(x => [x.slug, x.wrong, x.stale, x.true, x.unverifiable]));
  assert.equal(r.capture, CAPTURE_LINE);
  for (const s of engineStatements(d)) assert.ok(s.runs_stated >= 1 && s.runs_stated <= 3);
  for (const c of d.claims) { assert.ok(TYPES.includes(c.type)); assert.equal(c.review_state, reviewState(c)); }
});

test('no fictional fixture row reaches data/ or coding/', { skip: !hasData }, () => {
  const fixtureVendors = readFileSync(join(ROOT, 'test', 'fixture', 'STUDY_VENDORS.csv'), 'utf8').split(/\r?\n/).slice(1).map(l => (l.split(',')[3] || '').replace(/"/g, '').trim().toLowerCase()).filter(Boolean);
  const blob = readdirSync(DATA).filter(f => f.endsWith('.csv')).map(f => readFileSync(join(DATA, f), 'utf8')).join('\n').toLowerCase();
  for (const name of fixtureVendors) if (!['procore', 'buildertrend'].includes(name)) assert.equal(blob.includes(name), false, name);
  assert.equal(/kalvenor|fieldmark|fictional/i.test(blob), false);
});


test('proof provenance skips failed fetches and selects the readable snapshot containing the quote', async () => {
  const { selectProofPage } = await import('../analysis/derive.mjs');
  const failed = { slug: 'subject', url: 'https://example.com/pricing', status: 403, fetched_at: '2026-10-08T02:00:00Z' };
  const unrelated = { ...failed, status: 200, fetched_at: '2026-10-08T03:00:00Z', body: 'A challenge page' };
  const readable = { ...failed, status: 200, fetched_at: '2026-10-08T04:00:00Z', body: 'Plans start\n at $49 per month.' };
  const read = m => m.body ?? null;
  assert.equal(selectProofPage([failed, unrelated, readable], 'subject', failed.url, 'Plans start at $49 per month.', read), readable);
  assert.equal(selectProofPage([failed, unrelated], 'subject', failed.url, 'Plans start at $49 per month.', read), null);
});
