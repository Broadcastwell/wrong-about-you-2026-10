import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readDerived, engineStatements, analyseDerived, statementKey, methodLine } from '../analysis/index-record.mjs';
import { publicationGate, releaseGate } from '../analysis/publication-gate.mjs';
import { exportSurfaces, exportEvidence } from '../scripts/export-surfaces.mjs';
import { requirePublication, vendorReviewLabel, METHOD_LINE, BYLINE, DISPUTE_LINE } from '../lib/publication.mjs';

// Synthetic initials exist only in memory in these regression fixtures. No data file is written.
const data = () => readDerived(new URL('../data/',import.meta.url).pathname.replace(/^\/(.:\/)/,'$1'));
const options = {doi:'10.5281/zenodo.1234567',conceptDoi:'10.5281/zenodo.1234568'};
function fixture() {
 const d=data();d.statement_reviews=engineStatements(d).filter(s=>['wrong','stale'].includes(s.class)).map(s=>({...s,reviewer_1:'AB',reviewer_2:'CD',review_date:'2026-10-08',review_state:'verified',decision:'Confirm',note:'Synthetic test only'}));return d;
}
test('the actual deposit publishes provisional evidence without inventing analyst review',()=>{
 const d=data(),doc=exportSurfaces(d,options),items=doc.vendors.flatMap(v=>v.items);
 assert.equal(releaseGate(d).ok,true);
 assert.equal(publicationGate(d).ok,false);
 assert.equal(publicationGate(d).missing.length,118);
 assert.equal(items.length,118);
 assert.equal(items.filter(i=>i.class==='wrong').length,113);
 assert.equal(items.filter(i=>i.class==='stale').length,5);
 assert.equal(doc.study.method,METHOD_LINE);
 assert.equal(doc.study.byline,BYLINE);
 assert.equal(doc.study.dispute,DISPUTE_LINE);
 assert.doesNotMatch(doc.study.method,/was reviewed|before publication/);
 for(const i of items){
  assert.equal(i.review_state,'unreviewed');assert.equal(i.review_label,'Team review: in progress');
  assert.equal(i.reviewer_1,'');assert.equal(i.reviewer_2,'');assert.equal(i.review_date,'');assert.equal(i.added,'');
  assert.ok(i.proof_quote);assert.ok(i.proof_read_at);assert.ok(i.observations.length);
  for(const o of i.observations){assert.ok(o.record_id);assert.ok(o.question);assert.match(o.captured_at,/^2026-09-2[23]/);assert.equal(o.engine,i.quote_engine);}
 }
 assert.equal(methodLine(d,'2026-10-09'),METHOD_LINE);
 assert.equal(exportEvidence(d).study.doi,undefined);
 assert.throws(()=>exportSurfaces(d,{doi:'10.5281/zenodo.0000000',conceptDoi:''}),/DOI identifiers/);
});
test('each exported item uses its own engine decision, review fields and verbatim source',()=>{
 const d=fixture(),first=d.statement_reviews.find(s=>d.statement_reviews.some(t=>t.slug===s.slug&&t.claim_id===s.claim_id&&t.engine!==s.engine));
 const peer=d.statement_reviews.find(s=>s.slug===first.slug&&s.claim_id===first.claim_id&&s.engine!==first.engine);
 first.class='true';first.decision='Reclassify to true';peer.dropped=true;peer.decision='Drop';
 const keep=d.statement_reviews.find(s=>s!==first&&s!==peer);
 const doc=exportSurfaces(d,{...options,savedResults:analyseDerived(d)});
 const items=doc.vendors.flatMap(v=>v.items);
 assert.equal(items.length,116);
 assert.ok(!items.some(i=>[statementKey(first),statementKey(peer)].includes(i.statement_id)));
 for(const i of items){assert.equal(i.review_state,'verified');assert.equal(i.engines.length,1);assert.equal(i.reviewer_1,'AB');assert.ok(i.quote);assert.equal(i.quote_engine,i.engines[0].engine);const [slug,claim_id,engine]=i.statement_id.split('|');assert.ok(d.instances.some(x=>x.slug===slug&&x.claim_id===claim_id&&x.engine===engine&&x.quote===i.quote));}
 for(const v of doc.vendors)assert.equal(v.items_total,v.counts.wrong+v.counts.stale);
 assert.match(vendorReviewLabel(d,keep.slug),/^Flagged statements verified/);
 assert.match(methodLine(d,'2026-10-09'),/Every flagged statement was reviewed by two Broadcastwell analysts; the reviewed counts replaced the provisional ones on 2026-10-09\.$/);
 d.statement_reviews.at(-1).reviewer_2='';
 d.statement_reviews.at(-1).review_state='first review';
 assert.equal(methodLine(d,'2026-10-09'),METHOD_LINE);
});
test('stale saved tables are rejected even if their headline totals still match',()=>{
 const d=fixture(),saved=analyseDerived(d);saved.per_vendor[0].category_median.wrong+=1;
 assert.throws(()=>requirePublication(d,saved),/stale/);
});

test('the stored summary format validates all tables and source hashes',()=>{
 const d=data(),saved=JSON.parse(readFileSync(new URL('../results/summary.json',import.meta.url),'utf8'));
 assert.doesNotThrow(()=>requirePublication(d,saved));
 saved.inputs['claims.csv']='0'.repeat(64);
 assert.throws(()=>requirePublication(d,saved),/stale/);
});

test('provisional publication still refuses invalid evidence and review states',()=>{
 const d=data(),flag=d.claims.find(c=>c.class==='wrong');flag.proof_url='';
 assert.equal(releaseGate(d).ok,false);
 assert.throws(()=>exportEvidence(d),/invalid source data/);
 const signed=data();signed.claims[0].review_state='verified';
 assert.throws(()=>exportEvidence(signed),/review_state/);
});

test('the initial public metadata uses the exact honest method, byline and dispute text',()=>{
 const exact="Answers captured under method v1.1 on 22 to 23 Sep 2026 for the Absence Index release 2026-09 (DOI 10.5281/zenodo.22907695). Statements were extracted and classified under the published Record rules and checked against each vendor's own public pages. Every flagged statement is published with its engine, run, question, capture date and the vendor page it was checked against. Team review of the flagged statements is in progress; rows change only if the review changes them, and every change is logged in the public ledger.";
 assert.equal(METHOD_LINE,exact);
 for(const file of ['README.md','CITATION.cff','.zenodo.json','results/RESULTS.md']){
  const text=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  assert.ok(text.includes(exact),file);assert.ok(text.includes(BYLINE),file);assert.ok(text.includes(DISPUTE_LINE),file);
  assert.doesNotMatch(text,/every flagged statement was reviewed|every flagged engine statement was reviewed|AI assistance/i);
 }
});

test('quoted prices, punctuation, markup and long evidence are preserved as source text',()=>{
 const d=fixture(),s=d.statement_reviews[0];
 const quote='The fictional plan costs $39 — includes <custom> & **reports**. '+('A long original observation. '.repeat(20));
 for(const i of d.instances)if(i.slug===s.slug&&i.claim_id===s.claim_id&&i.engine===s.engine)i.quote=quote;
 const row=exportSurfaces(d,options).vendors.flatMap(v=>v.items).find(i=>i.statement_id===statementKey(s));
 assert.equal(row.quote,quote);assert.ok(row.quote.length>320);
});
