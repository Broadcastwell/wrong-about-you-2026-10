import test from 'node:test';
import assert from 'node:assert/strict';
import { writeXlsx } from '../lib/xlsx-lite.mjs';
import { importReview } from '../scripts/import-review.mjs';
import { readDerived, engineStatements, analyseDerived, validateDerived, statementKey } from '../analysis/index-record.mjs';
import { publicationGate } from '../analysis/publication-gate.mjs';

const columns = ['slug','claim_id','engine','reviewer_1','reviewer_2','review_date','decision','note'];
const data = () => readDerived(new URL('../data/', import.meta.url).pathname.replace(/^\/(.:\/)/, '$1'));
const workbook = rows => writeXlsx([{ name:'Review', columns, rows }]);
const input = () => engineStatements(data());
const flagged = () => input().filter(s => ['wrong','stale'].includes(s.class));
const sheetRow = (s, decision, a='AB', b='CD', date='2026-10-08') => [s.slug,s.claim_id,s.engine,a,b,date,decision,'Synthetic test review only'];
const run = rows => importReview({sheetBuf:workbook(rows),rows:input(),keys:['slug','claim_id','engine'],now:new Date('2026-10-08T20:00:00Z')});

test('all explicit classifications and Drop change only the selected engine statement', () => {
  const targets = flagged().slice(0,6);
  const decisions = ['Confirm','Reclassify to true','Reclassify to unverifiable','Reclassify to stale','Reclassify to wrong','Drop'];
  const out = run(targets.map((s,i)=>sheetRow(s,decisions[i])));
  assert.equal(out.ok,true,JSON.stringify(out.errors));
  assert.equal(out.rows.length,input().length-1);
  for(let i=0;i<5;i++) {
    const row=out.rows.find(s=>statementKey(s)===statementKey(targets[i]));
    assert.equal(row.class,i===0?targets[i].class:decisions[i].slice(14));
    assert.equal(row.review_state,'verified');
  }
  assert.equal(out.dropped.length,1);
  assert.equal(out.changes.length,6);
  assert.equal(out.changes.at(-1).to_class,'dropped');
});

test('reclassification and Drop cannot bypass two distinct analysts', () => {
  for(const decision of ['Drop','Reclassify to true']) for(const [a,b] of [['',''],['AB',''],['AB','AB']]) assert.equal(run([sheetRow(flagged()[0],decision,a,b)]).ok,false);
});

test('signed rows reject missing decisions, unknown decisions and invalid dates', () => {
  for(const decision of ['','Wrong']) assert.equal(run([sheetRow(flagged()[0],decision)]).ok,false);
  for(const date of ['2026-02-30','2026-10-09','not a date']) assert.equal(run([sheetRow(flagged()[0],'Confirm','AB','CD',date)]).ok,false);
});

test('duplicate keys and errors are atomic: no input changes survive a refused import', () => {
  const rows=input(), before=JSON.stringify(rows), s=flagged()[0];
  const out=importReview({sheetBuf:workbook([sheetRow(s,'Drop'),sheetRow(s,'Confirm')]),rows,keys:['slug','claim_id','engine'],now:new Date('2026-10-08T20:00:00Z')});
  assert.equal(out.ok,false); assert.equal(JSON.stringify(rows),before); assert.equal(out.changes.length,0);
});

test('different engines of the same claim can be reviewed independently', () => {
  const all=flagged(), first=all.find(s=>all.some(x=>x.slug===s.slug&&x.claim_id===s.claim_id&&x.engine!==s.engine));
  const second=all.find(x=>x.slug===first.slug&&x.claim_id===first.claim_id&&x.engine!==first.engine);
  const out=run([sheetRow(first,'Reclassify to true'),sheetRow(second,'Drop')]);
  const d={...data(),statement_reviews:[...out.rows,...out.dropped].filter(r=>r.decision)};
  assert.equal(validateDerived(d).ok,true);
  const effective=engineStatements(d);
  assert.equal(effective.find(x=>statementKey(x)===statementKey(first)).class,'true');
  assert.equal(effective.some(x=>statementKey(x)===statementKey(second)),false);
  const baseline=analyseDerived(data()).totals, totals=analyseDerived(d).totals;
  assert.equal(totals.statements,baseline.statements-1);
  assert.equal(totals.true,baseline.true+1);
  assert.equal(totals.wrong+totals.stale,baseline.wrong+baseline.stale-2);
  assert.ok(totals.answers_with_wrong_or_stale.k<=baseline.answers_with_wrong_or_stale.k);
});

test('the actual unreviewed deposit stays gated; two signed reviews per flagged row open the fixture gate', () => {
  const d=data(); assert.equal(publicationGate(d).ok,false);
  assert.equal(publicationGate(d).missing.length,118);
  const out=run(flagged().map(s=>sheetRow(s,'Confirm')));
  const reviewed={...d,statement_reviews:out.rows.filter(s=>s.decision)};
  assert.equal(publicationGate(reviewed).ok,true);
  reviewed.statement_reviews[0].reviewer_2='';
  assert.equal(publicationGate(reviewed).ok,false);
});

test('Drop remains excluded on an idempotent import and keeps its review evidence', () => {
  const s=flagged()[0], sheet=workbook([sheetRow(s,'Drop')]);
  const first=run([sheetRow(s,'Drop')]);
  const again=importReview({sheetBuf:sheet,rows:[...first.rows,...first.dropped],keys:['slug','claim_id','engine'],now:new Date('2026-10-08T20:00:00Z')});
  assert.equal(again.ok,true); assert.equal(again.changes.length,0); assert.equal(again.dropped.length,1);
});
