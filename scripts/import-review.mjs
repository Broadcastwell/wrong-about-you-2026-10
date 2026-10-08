// Import the team's review sheet: two analysts' initials and a date per row flip the row to "verified".
// Usage: node scripts/import-review.mjs <REVIEW_SHEET.xlsx> [data/claims.csv] [--key slug,claim_id] [--dry-run]
// - Reads the sheet "Review" (columns: the key columns, reviewer_1, reviewer_2, review_date, note).
// - Initials are two to four capital letters; the two reviewers must differ; the date is YYYY-MM-DD and not in the future.
// - One reviewer gives "first review"; two different reviewers and a date give "verified".
// - Explicit decisions change a class or drop a statement only after two analysts sign.
// - Engine-specific workbooks write statement_reviews.csv; source claims and quotes stay intact.
// - Appends every change to data/review_log.csv with the time, the sheet's SHA-256 and the before and after state.
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readXlsx } from '../lib/xlsx-lite.mjs';
import { parseCsv, toCsv } from '../analysis/analyze.mjs';
import { COLUMNS, reviewState, readDerived, engineStatements, validateDerived } from '../analysis/index-record.mjs';

const INITIALS = /^[A-Z]{2,4}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LOG_COLUMNS = ['logged_at', 'sheet_sha256', 'key', 'from_state', 'to_state', 'reviewer_1', 'reviewer_2', 'review_date', 'note', 'decision', 'from_class', 'to_class'];
export const DECISIONS = Object.freeze(['Confirm', 'Reclassify to true', 'Reclassify to unverifiable', 'Reclassify to stale', 'Reclassify to wrong', 'Drop']);
export const REVIEW_COLUMNS = ['slug', 'claim_id', 'engine', 'class', 'reviewer_1', 'reviewer_2', 'review_date', 'review_state', 'decision', 'note', 'dropped'];
const validDay = day => DAY.test(day) && Number.isFinite(Date.parse(day + 'T00:00:00Z')) && new Date(day + 'T00:00:00Z').toISOString().slice(0, 10) === day;

// Excel may store a typed date as a serial number; convert it to YYYY-MM-DD.
export const sheetDate = v => {
  const s = String(v ?? '').trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) return new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000).toISOString().slice(0, 10);
  return s;
};

export function importReview({ sheetBuf, rows, keys = ['slug', 'claim_id'], now = new Date() }) {
  const sheet = readXlsx(sheetBuf).Review;
  if (!sheet) return { ok: false, errors: ['the workbook has no sheet named Review'] };
  const sha = createHash('sha256').update(sheetBuf).digest('hex');
  const keyOf = r => keys.map(k => String(r[k] ?? '').trim()).join('|');
  const sourceRows = rows;
  rows = rows.map(r => ({ ...r }));
  const index = new Map(rows.map((r, i) => [keyOf(r), i]));
  const errors = [], changes = [], classRequests = [];
  const seen = new Set(), dropped = [];
  if (index.size !== rows.length) errors.push('data keys are not unique');
  const today = now.toISOString().slice(0, 10);
  for (const [n, s] of sheet.entries()) {
    const at = `sheet row ${n + 2}`;
    const k = keyOf(s), i = index.get(k);
    if (seen.has(k)) { errors.push(`${at}: duplicate review key ${k}`); continue; }
    seen.add(k);
    if (i === undefined) { errors.push(`${at}: no data row for ${k}`); continue; }
    const r1 = String(s.reviewer_1 ?? '').trim().toUpperCase(), r2 = String(s.reviewer_2 ?? '').trim().toUpperCase(), date = sheetDate(s.review_date);
    const hasDecision = Object.hasOwn(s, 'decision');
    const decision = String(s.decision || '').trim();
    if (decision && !DECISIONS.includes(decision)) { errors.push(`${at}: unknown decision ${decision}`); continue; }
    if (!r1 && !r2) {
      if (decision) errors.push(`${at}: a decision requires two analysts' initials and a date`);
      continue;
    }
    if ((r1 && !INITIALS.test(r1)) || (r2 && !INITIALS.test(r2))) { errors.push(`${at}: reviewers must be initials (two to four capital letters)`); continue; }
    if (r1 && r2 && r1 === r2) { errors.push(`${at}: the two reviewers must be different people`); continue; }
    if (r1 && r2 && (!validDay(date) || date > today)) { errors.push(`${at}: review_date must be a real past or present YYYY-MM-DD date`); continue; }
    if (hasDecision && r1 && r2 && !decision) { errors.push(`${at}: signed rows need an explicit decision`); continue; }
    if (decision && decision !== 'Confirm' && !(r1 && r2)) { errors.push(`${at}: reclassification or Drop requires two analysts`); continue; }
    const row = rows[i], before = row.review_state || reviewState(row);
    const next = { reviewer_1: r1, reviewer_2: r2, review_date: r1 && r2 ? date : '' };
    const after = reviewState(next);
    if (/\b(?:class|should be|reclass)\b/i.test(String(s.note || ''))) classRequests.push({ key: k, note: String(s.note).trim() });
    const nextClass = decision.startsWith('Reclassify to ') ? decision.slice('Reclassify to '.length) : row.class;
    const isDrop = decision === 'Drop';
    const note = String(s.note || '').trim();
    if (row.reviewer_1 === next.reviewer_1 && row.reviewer_2 === next.reviewer_2 && row.review_date === next.review_date && row.class === nextClass && String(row.decision || '') === decision && String(row.note || '') === note && !!row.dropped === isDrop) continue;
    rows[i] = { ...row, ...next, class: nextClass, review_state: after, ...(hasDecision ? { decision, note, dropped: isDrop } : {}) };
    if (isDrop) dropped.push(rows[i]);
    changes.push({ logged_at: now.toISOString(), sheet_sha256: sha, key: k, from_state: before, to_state: after, ...next, note, decision, from_class: row.class, to_class: isDrop ? 'dropped' : nextClass });
  }
  if (errors.length) return { ok: false, errors, changes: [], classRequests, dropped: [], rows: sourceRows };
  return { ok: true, errors, changes, classRequests, dropped: rows.filter(r => r.dropped), rows: rows.filter(r => !r.dropped) };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const keyArg = args.includes('--key') ? args[args.indexOf('--key') + 1] : 'slug,claim_id';
  const [sheetPath, dataPath = 'data/claims.csv'] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--key');
  if (!sheetPath) { console.error('Usage: node scripts/import-review.mjs <REVIEW_SHEET.xlsx> [data/claims.csv] [--key slug,claim_id] [--dry-run]'); process.exit(2); }
  const sheetBuf = readFileSync(sheetPath);
  const statementMode = !args.includes('--key') && Object.hasOwn(readXlsx(sheetBuf).Review?.[0] || {}, 'engine');
  const derived = statementMode ? readDerived(dirname(dataPath)) : null;
  const rows = statementMode ? engineStatements(derived, { includeDropped: true }) : parseCsv(readFileSync(dataPath, 'utf8'));
  const out = importReview({ sheetBuf, rows, keys: statementMode ? ['slug', 'claim_id', 'engine'] : keyArg.split(',') });
  for (const e of out.errors) console.error(e);
  if (!out.ok) { console.error('Nothing written. Fix the sheet and run again.'); process.exit(1); }
  const reviewRows = statementMode ? [...out.rows, ...out.dropped].filter(r => r.reviewer_1 || r.reviewer_2 || r.decision) : null;
  if (statementMode) {
    const check = validateDerived({ ...derived, statement_reviews: reviewRows });
    if (!check.ok) { console.error('Nothing written. ' + check.errors.join('\n')); process.exit(1); }
  }
  const columns = Object.keys(rows[0] || {}).length ? Object.keys(rows[0]) : COLUMNS.claims;
  if (!dry) {
    if (statementMode) writeFileSync(join(dirname(dataPath), 'statement_reviews.csv'), toCsv(reviewRows, REVIEW_COLUMNS));
    else writeFileSync(dataPath, toCsv(out.rows, columns));
    const log = join(dirname(dataPath), 'review_log.csv');
    const oldLog = existsSync(log) ? parseCsv(readFileSync(log, 'utf8')) : [];
    writeFileSync(log, toCsv([...oldLog, ...out.changes], LOG_COLUMNS));
  }
  const verified = out.rows.filter(r => r.review_state === 'verified').length;
  console.log(`${dry ? 'Dry run: ' : ''}${out.changes.length} rows changed; ${verified} verified in all.${out.classRequests.length ? ` ${out.classRequests.length} notes ask for a class change; those go to a new data version, not this import.` : ''}`);
  for (const c of out.classRequests) console.log(`class change requested: ${c.key}: ${c.note}`);
}
