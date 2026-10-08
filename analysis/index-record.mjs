// Wrong About You v1.0: the Record built from Absence Index release 2026-09 answers.
// The answers were captured under method v1.1 on 22 to 23 Sep 2026 (DOI 10.5281/zenodo.22907695); this release
// extracts every factual statement those answers make about 70 vendors and classes it against each vendor's own
// pages under the published Record rules. Node, no dependencies.
//   node analysis/index-record.mjs data results
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { parseCsv, toCsv, rate, median, ENGINES, CLASSES, CAUSING_TYPES, hasDash } from './analyze.mjs';

export const INDEX_DOI = '10.5281/zenodo.22907695';
export const CAPTURE_LINE = 'captured under method v1.1 on 22 to 23 Sep 2026 for the Absence Index release 2026-09 (DOI 10.5281/zenodo.22907695)';
export const TYPES = Object.freeze(['pricing', 'plans', 'free_tier', 'founding', 'ownership', 'headquarters', 'product_names', 'integrations', 'platforms', 'certifications', 'customer_counts', 'acquisitions', 'discontinued']);
export const REVIEW_STATES = Object.freeze(['unreviewed', 'first review', 'verified']);
export const DERIVED_FILES = Object.freeze({ vendors: 'vendors.csv', answers: 'answers.csv', claims: 'claims.csv', instances: 'instances.csv', pages: 'pages.csv' });
export const COLUMNS = Object.freeze({
  vendors: ['category_id', 'category', 'vendor', 'slug', 'domain', 'named_count', 'base'],
  answers: ['slug', 'record_id', 'category_id', 'question_id', 'question', 'engine', 'run', 'captured_at', 'cited_urls'],
  claims: ['slug', 'claim_id', 'type', 'claim', 'class', 'proof_url', 'proof_quote', 'proof_read_at', 'stale_change_date', 'stale_change_quote', 'stale_change_url', 'causing_url', 'causing_type', 'causing_quote', 'rationale', 'reviewer_1', 'reviewer_2', 'review_date', 'review_state'],
  instances: ['slug', 'claim_id', 'record_id', 'engine', 'run', 'question_id', 'quote'],
  pages: ['slug', 'url', 'final_url', 'read_at', 'status', 'method', 'robots', 'sha256', 'note']
});
const isoDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && Number.isFinite(Date.parse(v + 'T00:00:00Z'));
const isoTime = v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z$/.test(v || '');
const httpUrl = v => /^https?:\/\/\S+$/i.test(String(v || '').trim());
const initials = v => /^[A-Z]{2,4}$/.test(String(v || '').trim());

export function readDerived(dir) {
  const read = f => parseCsv(readFileSync(join(dir, f), 'utf8'));
  return Object.fromEntries(Object.entries(DERIVED_FILES).map(([k, f]) => [k, read(f)]));
}

// Review state is derived from the reviewer fields; a row is "verified" only with two reviewers and a date.
export function reviewState(c) {
  const r1 = String(c.reviewer_1 || '').trim(), r2 = String(c.reviewer_2 || '').trim();
  if (r1 && r2 && r1 !== r2 && isoDate(c.review_date)) return 'verified';
  if (r1 || r2) return 'first review';
  return 'unreviewed';
}
export const reviewMark = c => reviewState(c) === 'verified' ? `Verified by two Broadcastwell analysts, ${c.review_date}` : 'Team review: in progress';

export function validateDerived(d) {
  const errors = [];
  const vendors = new Map(d.vendors.map(v => [v.slug, v]));
  const answers = new Map(d.answers.map(a => [a.slug + '|' + a.record_id, a]));
  const claims = new Map(d.claims.map(c => [c.slug + '|' + c.claim_id, c]));
  if (vendors.size !== d.vendors.length) errors.push('vendors: duplicate slug');
  for (const v of d.vendors) {
    const n = d.answers.filter(a => a.slug === v.slug).length;
    if (n !== Number(v.named_count)) errors.push(`${v.slug}: ${n} answers but named_count ${v.named_count}`);
  }
  for (const a of d.answers) {
    if (!vendors.has(a.slug)) errors.push(`answers: unknown vendor ${a.slug}`);
    if (!ENGINES.includes(a.engine)) errors.push(`answers: unknown engine ${a.engine}`);
    if (!['1', '2', '3'].includes(String(a.run))) errors.push(`answers: run ${a.run}`);
    if (!isoTime(a.captured_at) || !/^2026-09-2[23]/.test(a.captured_at)) errors.push(`answers: ${a.record_id} capture time outside 22 to 23 Sep 2026`);
  }
  const pages = new Set(d.pages.map(p => p.slug + '|' + p.url));
  const pageOk = (slug, url) => pages.has(slug + '|' + url) || d.pages.some(p => p.slug === slug && (p.final_url === url || p.url.replace(/\/$/, '') === String(url).replace(/\/$/, '')));
  const seenClaim = new Set();
  for (const c of d.claims) {
    const at = `${c.slug} ${c.claim_id}`;
    if (seenClaim.has(c.slug + '|' + c.claim_id)) errors.push(`${at}: duplicate claim`); seenClaim.add(c.slug + '|' + c.claim_id);
    if (!vendors.has(c.slug)) errors.push(`${at}: unknown vendor`);
    if (!TYPES.includes(c.type)) errors.push(`${at}: type ${c.type}`);
    if (!CLASSES.includes(c.class)) errors.push(`${at}: class ${c.class}`);
    if (hasDash(c.claim) || hasDash(c.rationale)) errors.push(`${at}: dash in our own text`);
    if (['true', 'wrong', 'stale'].includes(c.class)) {
      if (!httpUrl(c.proof_url) || !String(c.proof_quote).trim()) errors.push(`${at}: needs proof_url and proof_quote`);
      else if (!pageOk(c.slug, c.proof_url)) errors.push(`${at}: proof page not in pages.csv`);
      if (!isoTime(c.proof_read_at)) errors.push(`${at}: proof_read_at`);
    }
    if (['wrong', 'stale'].includes(c.class)) {
      if (!CAUSING_TYPES.includes(c.causing_type)) errors.push(`${at}: causing_type`);
      if (c.causing_type === 'not found' ? c.causing_url : !httpUrl(c.causing_url)) errors.push(`${at}: causing_url and type disagree`);
    }
    if (c.class === 'stale' && (!isoDate(c.stale_change_date) && !/^\d{4}-\d{2}$/.test(c.stale_change_date || ''))) errors.push(`${at}: stale needs stale_change_date`);
    if (!REVIEW_STATES.includes(c.review_state) || c.review_state !== reviewState(c)) errors.push(`${at}: review_state must equal the state the reviewer fields give`);
    for (const r of [c.reviewer_1, c.reviewer_2]) if (String(r || '').trim() && !initials(r)) errors.push(`${at}: reviewer must be initials`);
  }
  const instancesOf = new Map();
  for (const i of d.instances) {
    const at = `${i.slug} ${i.claim_id} ${i.record_id}`;
    if (!claims.has(i.slug + '|' + i.claim_id)) errors.push(`${at}: instance of an unknown claim`);
    const a = answers.get(i.slug + '|' + i.record_id);
    if (!a) errors.push(`${at}: instance answer not in answers.csv`);
    else if (a.engine !== i.engine || String(a.run) !== String(i.run) || a.question_id !== i.question_id) errors.push(`${at}: engine, run or question disagree with the answer`);
    if (!String(i.quote).trim()) errors.push(`${at}: empty quote`);
    const k = i.slug + '|' + i.claim_id; instancesOf.set(k, (instancesOf.get(k) || 0) + 1);
  }
  for (const c of d.claims) if (!instancesOf.get(c.slug + '|' + c.claim_id)) errors.push(`${c.slug} ${c.claim_id}: claim without instances`);
  return { ok: errors.length === 0, errors };
}

// An engine statement: one claim as stated by one engine. Its confidence is the number of the three scheduled
// runs in which that engine stated it at least once (any question), out of 3.
export function engineStatements(d) {
  const claims = new Map(d.claims.map(c => [c.slug + '|' + c.claim_id, c]));
  const map = new Map();
  for (const i of d.instances) {
    const key = i.slug + '|' + i.claim_id + '|' + i.engine;
    if (!map.has(key)) { const c = claims.get(i.slug + '|' + i.claim_id); map.set(key, { slug: i.slug, claim_id: i.claim_id, engine: i.engine, class: c.class, type: c.type, review_state: c.review_state, runs: new Set(), records: new Set() }); }
    const s = map.get(key); s.runs.add(String(i.run)); s.records.add(i.record_id);
  }
  return [...map.values()].map(s => ({ ...s, runs_stated: s.runs.size, answers: s.records.size, runs: undefined, records: undefined }))
    .sort((a, b) => a.slug.localeCompare(b.slug) || a.claim_id.localeCompare(b.claim_id) || ENGINES.indexOf(a.engine) - ENGINES.indexOf(b.engine));
}

const countClasses = list => Object.fromEntries(CLASSES.map(k => [k, list.filter(s => s.class === k).length]));
const errorRate = list => { const c = countClasses(list); return rate(c.wrong + c.stale, c.true + c.wrong + c.stale); };

export function analyseDerived(d) {
  const stmts = engineStatements(d);
  const claimClass = new Map(d.claims.map(c => [c.slug + '|' + c.claim_id, c.class]));
  const badAnswers = new Set(d.instances.filter(i => ['wrong', 'stale'].includes(claimClass.get(i.slug + '|' + i.claim_id))).map(i => i.slug + '|' + i.record_id));
  const vendors = d.vendors.map(v => {
    const mine = stmts.filter(s => s.slug === v.slug);
    const c = countClasses(mine);
    const answers = d.answers.filter(a => a.slug === v.slug);
    return { category_id: v.category_id, category: v.category, vendor: v.vendor, slug: v.slug, named_answers: answers.length, statements: mine.length, ...c,
      wrong_or_stale: c.wrong + c.stale, claims: d.claims.filter(x => x.slug === v.slug).length,
      answers_with_wrong_or_stale: answers.filter(a => badAnswers.has(v.slug + '|' + a.record_id)).length };
  });
  const categories = [...new Set(d.vendors.map(v => v.category_id))].map(id => {
    const vs = vendors.filter(v => v.category_id === id);
    const mine = stmts.filter(s => vs.some(v => v.slug === s.slug));
    const answers = vs.reduce((n, v) => n + v.named_answers, 0), bad = vs.reduce((n, v) => n + v.answers_with_wrong_or_stale, 0);
    return { category_id: id, category: vs[0].category, vendors: vs.length, statements: mine.length, ...countClasses(mine),
      wrong_or_stale_rate: errorRate(mine), answers_rate: rate(bad, answers),
      median: Object.fromEntries(['statements', 'true', 'wrong', 'stale', 'unverifiable', 'wrong_or_stale', 'answers_with_wrong_or_stale'].map(k => [k, median(vs.map(v => v[k]))])) };
  });
  for (const v of vendors) v.category_median = categories.find(c => c.category_id === v.category_id).median;
  const engines = ENGINES.map(engine => { const mine = stmts.filter(s => s.engine === engine); return { engine, statements: mine.length, ...countClasses(mine), wrong_or_stale_rate: errorRate(mine) }; });
  const types = TYPES.map(type => { const mine = stmts.filter(s => s.type === type); return { type, statements: mine.length, ...countClasses(mine), wrong_or_stale_rate: errorRate(mine) }; });
  const badClaims = d.claims.filter(c => ['wrong', 'stale'].includes(c.class));
  const causes = CAUSING_TYPES.map(t => ({ causing_type: t, claims: badClaims.filter(c => c.causing_type === t).length }));
  const confidence = [1, 2, 3].map(n => ({ runs_stated: n, ...countClasses(stmts.filter(s => s.runs_stated === n)) }));
  const allAnswers = d.answers.length;
  const reviewed = Object.fromEntries(REVIEW_STATES.map(s => [s, d.claims.filter(c => c.review_state === s).length]));
  return {
    study: 'Wrong About You', version: '1.0', capture: CAPTURE_LINE, index_doi: INDEX_DOI,
    totals: { vendors: d.vendors.length, categories: categories.length, answers: allAnswers, claims: d.claims.length, statements: stmts.length, ...countClasses(stmts),
      wrong_or_stale_rate: errorRate(stmts), answers_with_wrong_or_stale: rate(badAnswers.size, allAnswers), pages_read: d.pages.length, review: reviewed },
    per_engine: engines, per_category: categories, per_vendor: vendors, per_type: types, causes, confidence, statements: stmts
  };
}

const pct = r => r.pct === null ? `${r.k} of ${r.n}` : `${r.k} of ${r.n} (${r.pct.toFixed(1)} percent, 95 percent interval ${r.low.toFixed(1)} to ${r.high.toFixed(1)})`;
export function resultsMarkdown(r) {
  const t = r.totals, L = [];
  L.push('# Wrong About You v1.0: results', '');
  L.push(`Answers ${r.capture}. Every statement classified under the published Record rules against the vendor's own pages; every row shows its review state. Counts come before rates; every rate carries a Wilson 95 percent interval. Unverifiable counts as neither right nor wrong.`, '');
  L.push(`- Vendors: ${t.vendors} in ${t.categories} categories (the five most named per category in release 2026-09).`);
  L.push(`- Answers naming them: ${t.answers}.`);
  L.push(`- Engine statements (one claim as stated by one engine): ${t.statements}: ${t.true} true, ${t.wrong} wrong, ${t.stale} stale, ${t.unverifiable} unverifiable.`);
  L.push(`- Wrong or stale among verifiable statements: ${pct(t.wrong_or_stale_rate)}.`);
  L.push(`- Answers with at least one wrong or stale statement about the vendor: ${pct(t.answers_with_wrong_or_stale)}.`, '');
  L.push('## Per engine', '', '| Engine | Statements | True | Wrong | Stale | Unverifiable | Wrong or stale among verifiable |', '|-|-|-|-|-|-|-|');
  for (const e of r.per_engine) L.push(`| ${e.engine} | ${e.statements} | ${e.true} | ${e.wrong} | ${e.stale} | ${e.unverifiable} | ${pct(e.wrong_or_stale_rate)} |`);
  L.push('', '## Per category', '', '| Category | Statements | True | Wrong | Stale | Unverifiable | Wrong or stale among verifiable | Answers with a wrong or stale statement |', '|-|-|-|-|-|-|-|-|');
  for (const c of r.per_category) L.push(`| ${c.category} | ${c.statements} | ${c.true} | ${c.wrong} | ${c.stale} | ${c.unverifiable} | ${pct(c.wrong_or_stale_rate)} | ${pct(c.answers_rate)} |`);
  L.push('', '## Per statement type', '', '| Type | Statements | True | Wrong | Stale | Unverifiable |', '|-|-|-|-|-|-|');
  for (const x of r.per_type) L.push(`| ${x.type.replace(/_/g, ' ')} | ${x.statements} | ${x.true} | ${x.wrong} | ${x.stale} | ${x.unverifiable} |`);
  L.push('', '## Causing pages of wrong or stale claims', '', '| Cause | Claims |', '|-|-|');
  for (const x of r.causes) L.push(`| ${x.causing_type === 'not found' ? 'cause not found' : x.causing_type} | ${x.claims} |`);
  L.push('', '## Confidence: in how many of the three runs the engine stated it', '', '| Stated in | True | Wrong | Stale | Unverifiable |', '|-|-|-|-|-|');
  for (const x of r.confidence) L.push(`| ${x.runs_stated} of 3 runs | ${x.true} | ${x.wrong} | ${x.stale} | ${x.unverifiable} |`);
  L.push('', '## Per vendor, with the category median', '', '| Category | Vendor | Answers | Statements | Wrong (median) | Stale (median) | Unverifiable (median) | True (median) |', '|-|-|-|-|-|-|-|-|');
  for (const v of r.per_vendor) L.push(`| ${v.category} | ${v.vendor} | ${v.named_answers} | ${v.statements} | ${v.wrong} (${v.category_median.wrong}) | ${v.stale} (${v.category_median.stale}) | ${v.unverifiable} (${v.category_median.unverifiable}) | ${v.true} (${v.category_median.true}) |`);
  L.push('', `Review: ${t.review.verified} claims verified by two analysts, ${t.review['first review']} in first review, ${t.review.unreviewed} unreviewed.`, '');
  return L.join('\n');
}

export function sha256(path) { return createHash('sha256').update(readFileSync(path)).digest('hex'); }

export function runDerived(dataDir, outDir) {
  const d = readDerived(dataDir);
  const v = validateDerived(d);
  if (!v.ok) return { ok: false, errors: v.errors };
  const r = analyseDerived(d);
  mkdirSync(outDir, { recursive: true });
  const inputs = Object.fromEntries(Object.values(DERIVED_FILES).map(f => [f, sha256(join(dataDir, f))]));
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ ...r, statements: undefined, inputs }, null, 1) + '\n');
  writeFileSync(join(outDir, 'RESULTS.md'), resultsMarkdown(r));
  const flat = o => ({ ...o, wrong_or_stale_rate: undefined, wrong_or_stale_pct: o.wrong_or_stale_rate?.pct ?? '', wrong_or_stale_low: o.wrong_or_stale_rate?.low ?? '', wrong_or_stale_high: o.wrong_or_stale_rate?.high ?? '' });
  writeFileSync(join(outDir, 'engine_table.csv'), toCsv(r.per_engine.map(flat), ['engine', 'statements', 'true', 'wrong', 'stale', 'unverifiable', 'wrong_or_stale_pct', 'wrong_or_stale_low', 'wrong_or_stale_high']));
  writeFileSync(join(outDir, 'category_table.csv'), toCsv(r.per_category.map(c => ({ ...flat(c), answers_with_wrong_or_stale: c.answers_rate.k, answers: c.answers_rate.n, ...Object.fromEntries(Object.entries(c.median).map(([k, x]) => ['median_' + k, x])) })), ['category_id', 'category', 'vendors', 'statements', 'true', 'wrong', 'stale', 'unverifiable', 'wrong_or_stale_pct', 'wrong_or_stale_low', 'wrong_or_stale_high', 'answers_with_wrong_or_stale', 'answers', 'median_statements', 'median_true', 'median_wrong', 'median_stale', 'median_unverifiable', 'median_wrong_or_stale']));
  writeFileSync(join(outDir, 'vendor_table.csv'), toCsv(r.per_vendor.map(v => ({ ...v, ...Object.fromEntries(Object.entries(v.category_median).map(([k, x]) => ['category_median_' + k, x])) })), ['category_id', 'category', 'vendor', 'slug', 'named_answers', 'claims', 'statements', 'true', 'wrong', 'stale', 'unverifiable', 'wrong_or_stale', 'answers_with_wrong_or_stale', 'category_median_true', 'category_median_wrong', 'category_median_stale', 'category_median_unverifiable', 'category_median_wrong_or_stale']));
  writeFileSync(join(outDir, 'type_table.csv'), toCsv(r.per_type.map(flat), ['type', 'statements', 'true', 'wrong', 'stale', 'unverifiable', 'wrong_or_stale_pct', 'wrong_or_stale_low', 'wrong_or_stale_high']));
  writeFileSync(join(outDir, 'causes.csv'), toCsv(r.causes, ['causing_type', 'claims']));
  writeFileSync(join(outDir, 'engine_statements.csv'), toCsv(r.statements, ['slug', 'claim_id', 'engine', 'class', 'type', 'runs_stated', 'answers', 'review_state']));
  return { ok: true, results: r, inputs };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  const [dataDir = 'data', outDir = 'results'] = process.argv.slice(2);
  const out = runDerived(resolve(dataDir), resolve(outDir));
  if (!out.ok) { console.error('Data refused:\n' + out.errors.slice(0, 50).join('\n')); process.exit(1); }
  const t = out.results.totals;
  console.log(`${t.vendors} vendors, ${t.answers} answers, ${t.claims} claims, ${t.statements} engine statements: ${t.true} true, ${t.wrong} wrong, ${t.stale} stale, ${t.unverifiable} unverifiable. Results in ${outDir}.`);
}
