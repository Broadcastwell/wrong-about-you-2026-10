// One effective engine statement per item: an analyst's engine-specific decision is never lost.
// Usage: node scripts/export-surfaces.mjs <doi> <conceptDoi> <indexOut.json> <appOut.js>
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readDerived, engineStatements, reviewMark, CAPTURE_LINE } from '../analysis/index-record.mjs';
import { requirePublication, methodLine, BYLINE, DISPUTE_LINE } from '../lib/publication.mjs';

const BANNED = /\bpaused?\b|\bpilot\b|\bclosed\b|\bnot currently offered\b|\bnot open\b|\breopens\b|\bis full\b|\borders in total\b|\(\d+ orders\)|\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|twenty|fifty) orders\b|\bwaitlist\b|\btemporarily\b|\blimited availability\b|\bnext batch\b|\bcapacity\b|\bDiagnostic\b|\$990\b|\bAI Fact Check\b|\bGemini\b|free audit|number one|winner|loser|\b(?:rose|fell|climbed|dropped|trend)\b|[\u2012-\u2015]|--/i;
// Historical evidence is verbatim, including prices and punctuation. Renderers
// escape it as text inside an attributed statement; marketing copy rules must
// never silently remove the evidence for a flagged finding.
const printable = q => typeof q === 'string' && q.trim().length > 0;
const humanDay = iso => { const [y,m,d] = iso.slice(0,10).split('-').map(Number); return `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1]} ${y}`; };

export function exportEvidence(data, { savedResults = null, publicationDate = null } = {}) {
  if (publicationDate && (!/^\d{4}-\d{2}-\d{2}$/.test(publicationDate) || new Date(publicationDate + 'T00:00:00Z').toISOString().slice(0, 10) !== publicationDate)) throw new Error('A real publication date is required');
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
      if (!pick || !a) throw new Error(`Flagged statement lacks a source quote: ${s.slug}/${s.claim_id}/${s.engine}`);
      return {
        statement_id: s.slug+'|'+s.claim_id+'|'+s.engine, claim: c.claim, class: s.class, type: c.type,
        engines: [{engine:s.engine,runs_stated:s.runs_stated}],
        quote: pick.quote, quote_engine:a.engine, quote_run:Number(a.run),
        quote_question:a.question_id, quote_date:humanDay(a.captured_at), quote_record_id:pick.record_id,
        confidence:`stated in ${s.runs_stated} of 3 runs`,
        observations:data.instances.filter(i => i.slug === s.slug && i.claim_id === s.claim_id && i.engine === s.engine).map(i => {
          const answer = answers.get(i.slug+'|'+i.record_id);
          return {record_id:i.record_id,engine:i.engine,run:Number(i.run),question_id:i.question_id,question:answer.question,captured_at:answer.captured_at,quote:i.quote};
        }),
        proof_url:c.proof_url, proof_quote:c.proof_quote, proof_read_at:c.proof_read_at, proof_read_on:(c.proof_read_at || '').slice(0,10),
        causing_type:c.causing_type, causing_url:c.causing_url || '',
        reviewer_1:s.reviewer_1 || '', reviewer_2:s.reviewer_2 || '', review_date:s.review_date || '',
        review_state:s.review_state, review_label:reviewMark(s), added:publicationDate || ''
      };
    }).sort((a,b) => b.engines[0].runs_stated-a.engines[0].runs_stated || a.statement_id.localeCompare(b.statement_id));
    if (items.length !== v.wrong+v.stale) throw new Error(`Statement counts do not reconcile for ${v.slug}`);
    return {vendor:v.vendor,vendor_slug:v.slug,category:v.category,category_slug:v.category_id.replaceAll('_','-'),
      counts:{statements:v.statements,true:v.true,wrong:v.wrong,stale:v.stale,unverifiable:v.unverifiable,answers:v.named_answers,answers_with_wrong_or_stale:v.answers_with_wrong_or_stale},
      category_median:{...v.category_median},items_total:items.length,items};
  });
  return {schema_version:'1.0',study:{url:'https://broadcastwell.com/research/wrong-about-you',
    capture:CAPTURE_LINE,method:methodLine(data, publicationDate),byline:BYLINE,dispute:DISPUTE_LINE,pages_read_on:'2026-10-08',
    data_url:'https://github.com/Broadcastwell/wrong-about-you-2026-10'},vendors};
}

export function exportSurfaces(data, { doi, conceptDoi, ...options }) {
  if (![doi, conceptDoi].every(x => /^10\.5281\/zenodo\.[1-9]\d+$/.test(x || ''))) throw new Error('Two real Zenodo DOI identifiers are required');
  const doc = exportEvidence(data, options);
  return {...doc, study:{...doc.study,doi,concept_doi:conceptDoi}};
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  const [doi,conceptDoi,indexOut,appOut,publicationDate = new Date().toISOString().slice(0,10)] = process.argv.slice(2);
  if (!indexOut || !appOut) throw new Error('Usage: node scripts/export-surfaces.mjs <doi> <conceptDoi> <indexOut.json> <appOut.js>');
  const doc = exportSurfaces(readDerived('data'),{doi,conceptDoi,publicationDate,savedResults:JSON.parse(readFileSync('results/summary.json','utf8'))});
  const text = JSON.stringify(doc,null,1).replace(/[^\x00-\x7F]/g,ch => '\\u'+ch.charCodeAt(0).toString(16).padStart(4,'0'));
  writeFileSync(indexOut,text+'\n');
  writeFileSync(appOut,`// Generated from Study 6 data with each statement's actual review state.\nexport const STUDY6 = ${text};\n`);
  console.log(`${doc.vendors.length} vendors; ${doc.vendors.reduce((n,v)=>n+v.items_total,0)} flagged engine statements exported with actual review states`);
}
