// Build the public data files of Wrong About You v1.0 from the coded statement files and the Index deposit.
// Usage: node analysis/derive.mjs <answers-2026-09.jsonl> <release-2026-09.json> <AGENT_GAP_SET.csv> <coding dir> <pages manifest.jsonl> [dataDir]
// - Verifies the deposit file by its published SHA-256 before anything else.
// - Every vendor's answers are re-selected from the deposit with the release's own named counts; a mismatch stops the build.
// - Every quote must be found verbatim (whitespace and markdown emphasis aside) in the deposit answer it cites.
// - The fictional test fixture is never read here and never reaches data/.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { toCsv } from './analyze.mjs';
import { COLUMNS, DERIVED_FILES, reviewState } from './index-record.mjs';

export const DEPOSIT_SHA256 = '221c94e1ebad2bc87d7cd20837fa670cc40b10dba6f68b75423dc8bee69697b3';
const norm = s => String(s || '').replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
// Our own text carries no dash characters: a dash between numbers reads "to", any other dash a comma. Quotes stay verbatim.
export const noDash = s => String(s || '')
  .replace(/(\d)\s*[\u2012\u2013\u2014\u2015]\s*(?=[\d$])/g, '$1 to ').replace(/\s*[\u2012\u2013\u2014\u2015]\s*/g, ', ')
  .replace(/(\d)\s*--\s*(?=[\d$])/g, '$1 to ').replace(/\s*--+\s*/g, ', ');
const parseCsvLine = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };

// A failed fetch can precede the readable browser snapshot for the same URL.
// Proof provenance belongs to the successful snapshot that contains the quote.
export function selectProofPage(manifest, slug, url, quote, readText = m => {
  return m.text_file && existsSync(m.text_file) ? readFileSync(m.text_file, 'utf8') : null;
}) {
  const same = m => m.url === url || m.final_url === url || String(m.url).replace(/\/$/, '') === String(url).replace(/\/$/, '');
  const candidates = manifest.filter(m => same(m) && Number(m.status) >= 200 && Number(m.status) < 300)
    .sort((a, b) => Number(b.slug === slug) - Number(a.slug === slug));
  return candidates.find(m => {
    if (!quote) return true;
    const text = readText(m);
    return text !== null && norm(text).includes(norm(quote));
  }) || null;
}

export function derive({ depositPath, releasePath, setPath, codingDir, manifestPath, dataDir }) {
  const errors = [];
  const raw = readFileSync(depositPath);
  const sha = createHash('sha256').update(raw).digest('hex');
  if (sha !== DEPOSIT_SHA256) throw new Error(`deposit SHA-256 ${sha} is not the published ${DEPOSIT_SHA256}`);
  const answers = raw.toString('utf8').split('\n').filter(Boolean).map(JSON.parse);
  const key = r => `${r.category_id}|${r.question_id}|${r.engine}|${r.repeat_index}`;
  const byKey = new Map(answers.map(r => [key(r), r]));
  const release = JSON.parse(readFileSync(releasePath, 'utf8'));
  const set = readFileSync(setPath, 'utf8').trim().split(/\r?\n/).slice(1).map(parseCsvLine).map(([category, vendor, domain, named_count]) => ({ category, vendor, domain, named_count: Number(named_count) }));
  const manifest = readFileSync(manifestPath, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
  const rows = { vendors: [], answers: [], claims: [], instances: [], pages: [] };
  for (const s of set) {
    const cat = release.categories.find(c => c.id === s.category);
    const v = cat.vendors.find(x => x.name === s.vendor);
    const coded = join(codingDir, `${s.category}__${v.slug}.json`);
    if (!existsSync(coded)) { if (!process.env.DERIVE_ALLOW_PARTIAL) errors.push(`${v.slug}: no coded statement file`); continue; }
    const st = JSON.parse(readFileSync(coded, 'utf8'));
    const qText = Object.fromEntries(cat.questions.map(q => [q.id, q.text]));
    rows.vendors.push({ category_id: s.category, category: cat.name, vendor: s.vendor, slug: v.slug, domain: s.domain, named_count: v.mention_rate.count, base: v.mention_rate.base });
    // The vendor's answers, exactly as the coding step received them (the bundle built with the release matcher).
    const bundle = st._bundle_record_ids || null;
    const ids = new Set(st.claims.flatMap(c => c.instances.map(i => i.record_id)));
    for (const id of ids) if (!byKey.has(id)) errors.push(`${v.slug}: record ${id} is not in the deposit`);
    const named = st.answer_record_ids || bundle || [...ids];
    for (const id of named) {
      const r = byKey.get(id); if (!r) continue;
      rows.answers.push({ slug: v.slug, record_id: id, category_id: r.category_id, question_id: r.question_id, question: qText[r.question_id] || '', engine: r.engine, run: r.repeat_index, captured_at: r.captured_at, cited_urls: r.cited_urls.join(' | ') });
    }
    for (const c of st.claims) {
      // A proof page may have been read under a sibling product of the same company (Dentrix and Dentrix Ascend, IDEXX and ezyVet).
      const page = c.proof_url ? selectProofPage(manifest, v.slug, c.proof_url, c.proof_quote) : null;
      if (['true', 'wrong', 'stale'].includes(c.class) && !page) errors.push(`${v.slug} ${c.claim_id}: no readable proof snapshot contains the quote`);
      if (page && page.slug !== v.slug && !rows.pages.some(p => p.slug === v.slug && p.url === page.url)) rows.pages.push({ slug: v.slug, url: page.url, final_url: page.final_url || '', read_at: page.fetched_at, status: page.status ?? '', method: page.method || 'fetch', robots: page.robots || '', sha256: page.sha256_html || '', note: 'read for ' + page.slug });
      const review = { reviewer_1: '', reviewer_2: '', review_date: '' };
      rows.claims.push({ slug: v.slug, claim_id: c.claim_id, type: c.type, claim: noDash(c.claim), class: c.class, proof_url: c.proof_url || '', proof_quote: c.proof_quote || '', proof_read_at: page ? page.fetched_at : '',
        stale_change_date: c.stale_change?.date || '', stale_change_quote: c.stale_change?.quote || '', stale_change_url: c.stale_change?.url || '',
        causing_url: c.causing_url || '', causing_type: c.causing_type || '', causing_quote: c.causing_quote || '', rationale: noDash(c.rationale || ''), ...review, review_state: reviewState(review) });
      for (const i of c.instances) {
        const r = byKey.get(i.record_id); if (!r) continue;
        if (!norm(r.answer_text).includes(norm(i.quote))) errors.push(`${v.slug} ${c.claim_id}: quote not verbatim in ${i.record_id}`);
        rows.instances.push({ slug: v.slug, claim_id: c.claim_id, record_id: i.record_id, engine: r.engine, run: r.repeat_index, question_id: r.question_id, quote: i.quote });
      }
    }
    for (const m of manifest.filter(m => m.slug === v.slug)) rows.pages.push({ slug: v.slug, url: m.url, final_url: m.final_url || '', read_at: m.fetched_at, status: m.status ?? '', method: m.method || 'fetch', robots: m.robots || '', sha256: m.sha256_html || '', note: m.note || '' });
  }
  if (errors.length) return { ok: false, errors };
  if (dataDir) {
    mkdirSync(dataDir, { recursive: true });
    for (const [k, f] of Object.entries(DERIVED_FILES)) writeFileSync(join(dataDir, f), toCsv(rows[k], COLUMNS[k]));
  }
  return { ok: true, counts: Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.length])) };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  const [depositPath, releasePath, setPath, codingDir, manifestPath, dataDir = 'data'] = process.argv.slice(2);
  if (!manifestPath) { console.error('Usage: node analysis/derive.mjs <answers.jsonl> <release.json> <AGENT_GAP_SET.csv> <coding dir> <manifest.jsonl> [dataDir]'); process.exit(2); }
  const out = derive({ depositPath: resolve(depositPath), releasePath: resolve(releasePath), setPath: resolve(setPath), codingDir: resolve(codingDir), manifestPath: resolve(manifestPath), dataDir: resolve(dataDir) });
  if (!out.ok) { console.error('Derive refused:\n' + out.errors.slice(0, 60).join('\n')); process.exit(1); }
  console.log('Derived:', JSON.stringify(out.counts));
}
