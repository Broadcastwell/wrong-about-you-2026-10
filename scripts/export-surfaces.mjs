// One effective engine statement per item: an analyst's engine-specific decision is never lost.
// Usage: node scripts/export-surfaces.mjs <doi> <conceptDoi> <indexOut.json> <appOut.js>
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readDerived, engineStatements, CAPTURE_LINE } from '../analysis/index-record.mjs';
import { requirePublication, METHOD_LINE, BYLINE, DISPUTE_LINE } from '../lib/publication.mjs';

const BANNED = /\bpaused?\b|\bpilot\b|\bclosed\b|\bnot currently offered\b|\bnot open\b|\breopens\b|\bis full\b|\borders in total\b|\(\d+ orders\)|\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twenty|fifty) orders\b|\bwaitlist\b|\btemporarily\b|\blimited availability\b|\bnext batch\b|\bcapacity\b|\bDiagnostic\b|\$990\b|\bAI Fact Check\b|\bGemini\b|free audit|number one|winner|loser|\b(?:rose|fell|climbed|dropped|trend)\b|[\u2012-\u2015]|--/i;
const printable = q => typeof q === 'string' && q.length > 0 && q.length <= 320 && !BANNED.test(q) && !/\$(?!490\b)\d|[<>*|#]/.test(q);
const humanDay = iso => { const [y,m,d] = iso.slice(0,10).split('-').map(Number); return `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]} ${y}`; };

export function exportSurfaces(data, { doi, conceptDoi, savedResults = null }) {
  if (![doi, conceptDoi].every(x => /^10\.5281\/zenodo\.[1-9]\d+$/.test(x || ''))) throw new Error('Two real Zenodo DOI identifiers are required');
  const results = requirePublication(data, savedResults);
  const statements = engineStatements(data);
  const claims = new Map(data.claims.map(c => [c.slug+'|'+c.claim_id,c]));
  const answers = new Map(data.answers.map(a => [a.slug+'|'+a.record_id,a]));
  const vendors = results.per_vendor.map(v => {
    const items = statements.filter(s => s.slug === v.slug && ['wrong','stale'].includes(s.class)).map(s => {
      const c = claims.get(s.slug+'|'+s.claim_id);
      if (BANNED.test(c.claim)) throw new Error(`Claim needs a public copy correction: ${s.slug}/${s.claim_id}`);
      const pick = data.instances.find(i => i.slug === s.slug && i.claim_id === s.claim_id && i.engine === s.engine && printable(i.quote));
      const a = pick ? answers.get(s.slug+'|'+pick.record_id) : null;
      return {
        statement_id: s.slug+'|'+s.claim_id+'|'+s.engine, claim: c.claim, class: s.class, type: c.type,
        engines: [{engine:s.engine,runs_stated:s.runs_stated}],
        quote: pick?.quote || null, quote_engine:a?.engine || null, quote_run:a ? Number(a.run) : null,
        quote_question:a?.question_id || null, quote_date:a ? humanDay(a.captured_at) : null,
        proof_url:c.proof_url, proof_read_on:(c.proof_read_at || '').slice(0,10),
        causing_type:c.causing_type, causing_url:c.causing_url || '',
        reviewer_1:s.reviewer_1 || '', reviewer_2:s.reviewer_2 || '', review_date:s.review_date || '',
        review_state:s.review_state, added:s.review_date || '2026-10-08'
      };
    }).sort((a,b) => b.engines[0].runs_stated-a.engines[0].runs_stated || a.statement_id.localeCompare(b.statement_id));
    if (items.length !== v.wrong+v.stale) throw new Error(`Statement counts do not reconcile for ${v.slug}`);
    return {vendor:v.vendor,vendor_slug:v.slug,category:v.category,category_slug:v.category_id.replaceAll('_','-'),
      counts:{statements:v.statements,true:v.true,wrong:v.wrong,stale:v.stale,unverifiable:v.unverifiable,answers:v.named_answers,answers_with_wrong_or_stale:v.answers_with_wrong_or_stale},
      category_median:{...v.category_median},items_total:items.length,items};
  });
  return {schema_version:'1.0',study:{doi,concept_doi:conceptDoi,url:'https://broadcastwell.com/research/wrong-about-you',
    capture:CAPTURE_LINE,method:METHOD_LINE,byline:BYLINE,dispute:DISPUTE_LINE,pages_read_on:'2026-10-08',
    data_url:'https://github.com/Broadcastwell/wrong-about-you-2026-10'},vendors};
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  const [doi,conceptDoi,indexOut,appOut] = process.argv.slice(2);
  if (!indexOut || !appOut) throw new Error('Usage: node scripts/export-surfaces.mjs <doi> <conceptDoi> <indexOut.json> <appOut.js>');
  const doc = exportSurfaces(readDerived('data'),{doi,conceptDoi,savedResults:JSON.parse(readFileSync('results/summary.json','utf8'))});
  const text = JSON.stringify(doc,null,1).replace(/[^\x00-\x7F]/g,ch => '\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'));
  writeFileSync(indexOut,text+'\n');
  writeFileSync(appOut,`// Generated from reviewed Study 6 data by scripts/export-surfaces.mjs.\nexport const STUDY6 = ${text};\n`);
  console.log(`${doc.vendors.length} vendors; ${doc.vendors.reduce((n,v)=>n+v.items_total,0)} reviewed flagged engine statements exported`);
}
