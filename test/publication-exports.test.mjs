import test from 'node:test';
import assert from 'node:assert/strict';
import { readDerived, engineStatements, analyseDerived, statementKey } from '../analysis/index-record.mjs';
import { exportSurfaces } from '../scripts/export-surfaces.mjs';
import { requirePublication, vendorReviewLabel } from '../lib/publication.mjs';

// Synthetic initials exist only in memory in these regression fixtures. No data file is written.
const data = () => readDerived(new URL('../data/',import.meta.url).pathname.replace(/^\/(.:\/)/,'$1'));
const options = {doi:'10.5281/zenodo.1234567',conceptDoi:'10.5281/zenodo.1234568'};
function fixture() {
 const d=data();d.statement_reviews=engineStatements(d).filter(s=>['wrong','stale'].includes(s.class)).map(s=>({...s,reviewer_1:'AB',reviewer_2:'CD',review_date:'2026-10-08',review_state:'verified',decision:'Confirm',note:'Synthetic test only'}));return d;
}
test('the actual deposit cannot produce public exports or a reviewed method claim',()=>{
 assert.throws(()=>exportSurfaces(data(),options),/Publication held/);
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
});
test('stale saved tables are rejected even if their headline totals still match',()=>{
 const d=fixture(),saved=analyseDerived(d);saved.per_vendor[0].category_median.wrong+=1;
 assert.throws(()=>requirePublication(d,saved),/stale/);
});

test('quoted prices, punctuation, markup and long evidence are preserved as source text',()=>{
 const d=fixture(),s=d.statement_reviews[0];
 const quote='The fictional plan costs $39 — includes <custom> & **reports**. '+('A long original observation. '.repeat(20));
 for(const i of d.instances)if(i.slug===s.slug&&i.claim_id===s.claim_id&&i.engine===s.engine)i.quote=quote;
 const row=exportSurfaces(d,options).vendors.flatMap(v=>v.items).find(i=>i.statement_id===statementKey(s));
 assert.equal(row.quote,quote);assert.ok(row.quote.length>320);
});
