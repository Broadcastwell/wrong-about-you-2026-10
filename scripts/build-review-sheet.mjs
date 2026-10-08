// Build REVIEW_SHEET_study6.xlsx for the team: one row per claim with the evidence beside it, two initials columns,
// a date column and a note column. scripts/import-review.mjs reads it back.
// Usage: node scripts/build-review-sheet.mjs <out.xlsx>
import { readFileSync, writeFileSync } from 'node:fs';
import { writeXlsx } from '../lib/xlsx-lite.mjs';
import { readDerived, engineStatements } from '../analysis/index-record.mjs';
const [out = 'REVIEW_SHEET_study6.xlsx'] = process.argv.slice(2);
const d = readDerived('data');
const vendor = new Map(d.vendors.map(v => [v.slug, v]));
const stmts = engineStatements(d);
const firstQuote = new Map();
for (const i of d.instances) { const k = i.slug + '|' + i.claim_id; if (!firstQuote.has(k)) firstQuote.set(k, `${i.engine}, run ${i.run}, ${i.question_id}: ${i.quote}`); }
const order = { wrong: 0, stale: 1, true: 2, unverifiable: 3 };
const rows = [...d.claims].sort((a, b) => order[a.class] - order[b.class] || a.slug.localeCompare(b.slug) || a.claim_id.localeCompare(b.claim_id)).map(c => {
  const v = vendor.get(c.slug), runs = stmts.filter(s => s.slug === c.slug && s.claim_id === c.claim_id).map(s => `${s.engine} ${s.runs_stated}/3`).join('; ');
  return [c.slug, c.claim_id, v.vendor, v.category, c.type, c.claim, c.class, runs, firstQuote.get(c.slug + '|' + c.claim_id) || '', c.proof_url, c.proof_quote, c.causing_type === 'not found' ? 'cause not found' : c.causing_type, c.causing_url, c.rationale, c.reviewer_1, c.reviewer_2, c.review_date, ''];
});
const how = [
  'How to review (two analysts, every row)',
  'Each row is one claim: a factual statement the engines made about the vendor, classed against the vendor\'s own page. Read the claim, the quote from the answer, the proof page and its quote. Open the proof page if the quote does not settle it.',
  'If you agree with the class, write your initials (two to four capital letters) in reviewer_1, or in reviewer_2 if the first column is already filled by someone else. The second analyst adds review_date as YYYY-MM-DD. A row is verified only with two different analysts and a date.',
  'If you disagree, do not change the class here. Write in note: "class should be <class>" and why, with the page that shows it. Those rows go to a new data version; the import never changes a class.',
  'Order: wrong and stale claims first (these are on the vendors\' Index pages), then true, then unverifiable.',
  'When done: node scripts/import-review.mjs REVIEW_SHEET_study6.xlsx data/claims.csv, then node analysis/index-record.mjs data results, then rebuild the exports (SIGNED_HANDOFF.md, review import steps). The import writes data/review_log.csv with the time, the sheet hash and every change.'
];
writeFileSync(out, writeXlsx([
  { name: 'How to review', columns: [how[0]], rows: how.slice(1).map(l => [l]), widths: [140], wrap: true },
  { name: 'Review', columns: ['slug', 'claim_id', 'vendor', 'category', 'type', 'claim', 'class', 'engines (runs stated of 3)', 'example quote', 'proof_url', 'proof_quote', 'cause', 'causing_url', 'rationale', 'reviewer_1', 'reviewer_2', 'review_date', 'note'], rows, widths: [18, 8, 18, 22, 12, 50, 10, 26, 60, 40, 50, 14, 30, 50, 10, 10, 12, 40], wrap: true }
]));
console.log(`${rows.length} claims written to ${out}`);
