// Wrong About You: turns the team's captures, statements and release checks into the study tables and figures.
// Usage: node analysis/analyze.mjs [dataDir] [outDir]   (defaults: data, results)
// No dependencies. Every number is a count with its base; intervals are 95 percent Wilson intervals.
import { readFileSync, writeFileSync, mkdirSync, existsSync, openSync, readSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const ORDER_CODE = 'WAY-2026-10';
export const QUESTION_ID = 'S';
export const ENGINES = Object.freeze(['ChatGPT', 'Claude', 'Perplexity', 'Google AI Overviews', 'Google AI Mode']);
export const ENGINE_TOKENS = Object.freeze({ 'ChatGPT': 'ChatGPT', 'Claude': 'Claude', 'Perplexity': 'Perplexity', 'Google AI Overviews': 'GoogleAIOverviews', 'Google AI Mode': 'GoogleAIMode' });
export const CLASSES = Object.freeze(['true', 'wrong', 'stale', 'unverifiable']);
export const FACT_ITEMS = Object.freeze(['identity', 'location', 'pricing', 'launch_1', 'launch_2', 'launch_3', 'compliance', 'ownership', 'names', 'integrations', 'support', 'team', 'founded', 'rival', 'feature', 'other']);
export const CAUSING_TYPES = Object.freeze(['own page', 'directory', 'review site', 'press', 'forum', 'other', 'not found']);
export const OVERVIEW_ABSENT = 'Overview absent';
export const NO_RELEASE = 'none in window';
export const PERPLEXITY_WORDS = 60;
export const WINDOW_DAYS = 180;
export const ALL = 'All five engines';
export const FILES = Object.freeze({ vendors: 'vendors.csv', captures: 'record_captures.csv', statements: 'record_statements.csv', launches: 'vendor_launches.csv', screenshots: 'screenshots' });

const BOM = String.fromCharCode(0xfeff);
const DASHES = new RegExp('[' + String.fromCharCode(0x2012) + '-' + String.fromCharCode(0x2015) + ']|-{2}');
export const hasDash = text => DASHES.test(String(text));
export const studyQuestion = vendor => `Tell me about ${vendor}: what it does, its pricing, its latest releases, and who owns it.`;
export const slug = vendor => String(vendor).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
export const screenshotName = (vendor, engine) => `${ORDER_CODE}_${slug(vendor)}_${ENGINE_TOKENS[engine]}_${QUESTION_ID}.png`;
export const words = text => String(text || '').trim().split(/\s+/).filter(Boolean).length;
const httpsUrl = v => /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:[/?#]\S*)?$/i.test(String(v || '').trim());
const httpUrl = v => /^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:[/?#]\S*)?$/i.test(String(v || '').trim());
const isoTime = v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?Z$/.test(v || '') && Number.isFinite(Date.parse(v));
const isoDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && Number.isFinite(Date.parse(v + 'T00:00:00Z'));
// Team initials in the capture folder; stable codes (R01, R02, ...) in the public deposit.
const initials = v => /^(?:[A-Za-z]{2,4}|R[0-9]{2})$/.test(String(v || '').trim());
const dayNumber = v => Math.floor(Date.parse(String(v).slice(0, 10) + 'T00:00:00Z') / 86400000);

// RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF, optional byte order mark.
export function parseCsv(text) {
  const s = String(text).startsWith(BOM) ? String(text).slice(1) : String(text);
  const rows = []; let row = [], field = '', quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  const kept = rows.filter(r => r.some(v => v !== ''));
  if (!kept.length) return [];
  const head = kept[0].map(h => h.trim());
  return kept.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

export function toCsv(rows, columns) {
  const q = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return [columns.join(','), ...rows.map(r => columns.map(c => q(r[c])).join(','))].join('\n') + '\n';
}

export function wilson(k, n) {
  if (!Number.isInteger(k) || !Number.isInteger(n) || n < 1 || k < 0 || k > n) throw new Error('Wilson interval needs integer counts with 0 <= k <= n and n >= 1.');
  const z = 1.96, p = k / n, z2 = z * z, d = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / d, margin = (z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n)) / d;
  const r1 = x => Math.round((x + Number.EPSILON) * 10) / 10;
  return { low: r1(Math.max(0, center - margin) * 100), high: r1(Math.min(1, center + margin) * 100) };
}

export function rate(k, n) {
  if (!n) return { k, n, pct: null, low: null, high: null };
  const w = wilson(k, n);
  return { k, n, pct: Math.round((k / n) * 1000) / 10, low: w.low, high: w.high };
}

export function median(values) {
  const v = [...values].sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const spread = values => ({ n: values.length, median: median(values), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null });

export function readData(dir, names = FILES) {
  const read = f => parseCsv(readFileSync(join(dir, f), 'utf8'));
  return { vendors: read(names.vendors), captures: read(names.captures), statements: read(names.statements), launches: read(names.launches) };
}

export function imageOnDisk(dir) {
  return name => {
    const path = join(dir, name);
    if (!existsSync(path)) return false;
    const fd = openSync(path, 'r'); const b = Buffer.alloc(8); readSync(fd, b, 0, 8, 0); closeSync(fd);
    return (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') || (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff);
  };
}

const key = (vendor, engine) => vendor + '|' + engine;

// The publication gate's checks. Returns every problem found, one line each; an empty list passes.
export function validate(data, { screenshotExists = () => true, now = Date.now(), screenshotsFor = () => true } = {}) {
  const errors = [], warnings = [];
  const vendors = data.vendors.map(v => v.vendor);
  if (!vendors.length) errors.push('vendors: none listed');
  if (new Set(vendors).size !== vendors.length) errors.push('vendors: a vendor is listed twice');
  const known = new Set(vendors);
  const seen = new Map();
  data.captures.forEach((c, i) => {
    const at = `capture row ${i + 2} (${c.company || '?'}, ${c.engine || '?'})`;
    if (c.order_code !== ORDER_CODE) errors.push(`${at}: order_code is not ${ORDER_CODE}`);
    if (!known.has(c.company)) errors.push(`${at}: vendor not in the study list`);
    if (!ENGINES.includes(c.engine)) errors.push(`${at}: engine not one of the five`);
    if (c.question_id !== QUESTION_ID) errors.push(`${at}: question_id is not S`);
    if (seen.has(key(c.company, c.engine))) errors.push(`${at}: duplicate engine for this vendor`);
    seen.set(key(c.company, c.engine), c);
    if (!isoTime(c.captured_utc)) errors.push(`${at}: captured_utc missing or not ISO UTC`);
    else if (Date.parse(c.captured_utc) > now + 300000) errors.push(`${at}: captured_utc is in the future`);
    if (String(c.seat || '').trim().length < 2) errors.push(`${at}: seat missing`);
    if (!String(c.model_label || '').trim()) errors.push(`${at}: model label missing`);
    if (!initials(c.captured_by)) errors.push(`${at}: captured_by initials missing`);
    const answer = String(c.answer_text_or_excerpt || '').trim();
    if (!answer) errors.push(`${at}: blank answer`);
    if (answer === OVERVIEW_ABSENT && c.engine !== 'Google AI Overviews') errors.push(`${at}: "${OVERVIEW_ABSENT}" is only valid for Google AI Overviews`);
    if (c.engine === 'Perplexity') {
      if (words(answer) > PERPLEXITY_WORDS) errors.push(`${at}: Perplexity excerpt over ${PERPLEXITY_WORDS} words`);
      if (!httpsUrl(c.share_link)) errors.push(`${at}: Perplexity share link missing`);
    } else if (c.share_link && !httpsUrl(c.share_link)) errors.push(`${at}: share link is not an https address`);
    const cites = String(c.citations || '').split('|').map(s => s.trim()).filter(Boolean);
    if (cites.some(u => !httpUrl(u))) errors.push(`${at}: a citation is not a web address (separate several with |)`);
    if (known.has(c.company) && ENGINES.includes(c.engine) && c.screenshot !== screenshotName(c.company, c.engine)) errors.push(`${at}: screenshot should be named ${screenshotName(c.company, c.engine)}`);
    else if (screenshotsFor(c.engine) && c.screenshot && !screenshotExists(c.screenshot)) errors.push(`${at}: screenshot file ${c.screenshot} not found (PNG or JPEG)`);
  });
  for (const v of vendors) for (const e of ENGINES) if (!seen.has(key(v, e))) errors.push(`capture missing: ${v}, ${e}`);

  const withStatements = new Set();
  data.statements.forEach((s, i) => {
    const at = `statement row ${i + 2} (${s.company || '?'}, ${s.engine || '?'})`;
    const capture = seen.get(key(s.company, s.engine));
    if (s.order_code !== ORDER_CODE) errors.push(`${at}: order_code is not ${ORDER_CODE}`);
    if (!capture) errors.push(`${at}: no capture for this vendor and engine`);
    else if (String(capture.answer_text_or_excerpt).trim() === OVERVIEW_ABSENT) errors.push(`${at}: the Overview was absent, so there is no statement to class`);
    if (s.question_id !== QUESTION_ID) errors.push(`${at}: question_id is not S`);
    if (String(s.statement_text || '').trim().length < 3) errors.push(`${at}: statement text missing`);
    if (!CLASSES.includes(s.class)) errors.push(`${at}: class must be true, wrong, stale or unverifiable`);
    if (!FACT_ITEMS.includes(s.fact_sheet_item)) errors.push(`${at}: fact_sheet_item not recognised`);
    if (['wrong', 'stale'].includes(s.class)) {
      if (!httpsUrl(s.proof_url)) errors.push(`${at}: wrong or stale statement without a proof URL`);
      if (!CAUSING_TYPES.includes(s.causing_type)) errors.push(`${at}: causing_type must be one of ${CAUSING_TYPES.join(', ')}`);
      else if (s.causing_type === 'not found' ? Boolean(String(s.causing_url || '').trim()) : !httpUrl(s.causing_url)) errors.push(`${at}: causing_url must be a web address, or blank when the cause is not found`);
    } else {
      if (s.class === 'true' && !httpsUrl(s.proof_url)) errors.push(`${at}: true statement without a proof URL`);
      if (String(s.causing_url || '').trim() || String(s.causing_type || '').trim()) errors.push(`${at}: a cause is recorded only for wrong or stale statements`);
    }
    if (!initials(s.reviewer)) errors.push(`${at}: reviewer initials missing`);
    if (capture) withStatements.add(key(s.company, s.engine));
  });
  for (const c of data.captures) {
    if (String(c.answer_text_or_excerpt || '').trim() && String(c.answer_text_or_excerpt).trim() !== OVERVIEW_ABSENT && !withStatements.has(key(c.company, c.engine))) warnings.push(`no statements recorded for ${c.company}, ${c.engine}`);
  }

  const launchSeen = new Set();
  data.launches.forEach((l, i) => {
    const at = `launch row ${i + 2} (${l.vendor || '?'})`;
    if (!known.has(l.vendor)) errors.push(`${at}: vendor not in the study list`);
    if (launchSeen.has(l.vendor)) errors.push(`${at}: vendor listed twice`);
    launchSeen.add(l.vendor);
    if (String(l.launch_text || '').trim() === NO_RELEASE) {
      if (l.launch_date || l.launch_url) errors.push(`${at}: "${NO_RELEASE}" takes no date or URL`);
      for (const e of ENGINES) if (l[e] && l[e] !== 'n/a') errors.push(`${at}: ${e} should be blank or n/a when there is no release`);
      return;
    }
    if (!String(l.launch_text || '').trim()) errors.push(`${at}: launch_text missing (write "${NO_RELEASE}" if the vendor dated no release)`);
    if (!isoDate(l.launch_date)) errors.push(`${at}: launch_date missing or not YYYY-MM-DD`);
    if (!httpsUrl(l.launch_url)) errors.push(`${at}: launch_url missing`);
    for (const e of ENGINES) if (!['yes', 'no'].includes(l[e])) errors.push(`${at}: ${e} must be yes or no`);
    const caps = ENGINES.map(e => seen.get(key(l.vendor, e))).filter(c => c && isoTime(c.captured_utc));
    if (isoDate(l.launch_date) && caps.length) {
      const first = Math.min(...caps.map(c => dayNumber(c.captured_utc)));
      const age = first - dayNumber(l.launch_date);
      if (age < 0) errors.push(`${at}: launch_date is after the first capture`);
      else if (age > WINDOW_DAYS) errors.push(`${at}: launch_date is more than ${WINDOW_DAYS} days before the first capture`);
    }
    for (const e of ENGINES) {
      const c = seen.get(key(l.vendor, e));
      if (c && String(c.answer_text_or_excerpt).trim() === OVERVIEW_ABSENT && l[e] === 'yes') errors.push(`${at}: ${e} cannot reflect the release when the Overview was absent`);
    }
  });
  for (const v of vendors) if (!launchSeen.has(v)) errors.push(`launch row missing: ${v}`);
  return { ok: errors.length === 0, errors, warnings };
}

function summarise(captures, statements) {
  const byCapture = new Map();
  for (const s of statements) {
    const k = key(s.company, s.engine);
    if (!byCapture.has(k)) byCapture.set(k, []);
    byCapture.get(k).push(s);
  }
  const counts = Object.fromEntries(CLASSES.map(c => [c, 0]));
  let total = 0, wrongAnswers = 0, absent = 0;
  const types = new Map(), causes = new Map();
  for (const c of captures) {
    if (String(c.answer_text_or_excerpt).trim() === OVERVIEW_ABSENT) absent++;
    const mine = byCapture.get(key(c.company, c.engine)) || [];
    let bad = false;
    for (const s of mine) {
      counts[s.class]++; total++;
      if (s.class === 'wrong' || s.class === 'stale') {
        bad = true;
        types.set(s.fact_sheet_item, (types.get(s.fact_sheet_item) || 0) + 1);
        causes.set(s.causing_type, (causes.get(s.causing_type) || 0) + 1);
      }
    }
    if (bad) wrongAnswers++;
  }
  const ranked = m => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const settled = counts.true + counts.wrong + counts.stale;
  return {
    answers: captures.length,
    overview_absent: absent,
    statements: total,
    classes: Object.fromEntries(CLASSES.map(c => [c, rate(counts[c], total)])),
    wrong_or_stale_of_settled: rate(counts.wrong + counts.stale, settled),
    answers_wrong_or_stale: rate(wrongAnswers, captures.length),
    wrong_types: ranked(types).map(([item, n]) => ({ item, n })),
    causing_types: ranked(causes).map(([type, n]) => ({ type, n }))
  };
}

export function analyse(data) {
  const vendorRows = [...data.vendors];
  const vendors = vendorRows.map(v => v.vendor);
  const categoryOf = new Map(vendorRows.map(v => [v.vendor, v.category]));
  const categories = [...new Set(vendorRows.map(v => v.category))];
  const order = new Map(vendors.map((v, i) => [v, i]));
  const captures = [...data.captures].sort((a, b) => order.get(a.company) - order.get(b.company) || ENGINES.indexOf(a.engine) - ENGINES.indexOf(b.engine));
  const statements = data.statements;
  const perEngine = ENGINES.map(engine => ({ engine, ...summarise(captures.filter(c => c.engine === engine), statements) }));
  perEngine.push({ engine: ALL, ...summarise(captures, statements) });
  const perCategory = categories.map(category => ({ category, vendors: vendors.filter(v => categoryOf.get(v) === category).length, ...summarise(captures.filter(c => categoryOf.get(c.company) === category), statements) }));
  const categoryEngine = [];
  for (const category of categories) for (const engine of ENGINES) {
    const s = summarise(captures.filter(c => categoryOf.get(c.company) === category && c.engine === engine), statements);
    categoryEngine.push({ category, engine, answers_wrong_or_stale: s.answers_wrong_or_stale.k, answers: s.answers });
  }
  const launchOf = new Map(data.launches.map(l => [l.vendor, l]));
  const capture = new Map(captures.map(c => [key(c.company, c.engine), c]));
  const withRelease = vendors.filter(v => launchOf.get(v) && isoDate(launchOf.get(v).launch_date));
  const launchLag = ENGINES.map(engine => {
    const yes = [], no = [];
    for (const v of withRelease) {
      const l = launchOf.get(v), c = capture.get(key(v, engine));
      const days = dayNumber(c.captured_utc) - dayNumber(l.launch_date);
      (l[engine] === 'yes' ? yes : no).push(days);
    }
    return { engine, vendors_with_release: withRelease.length, vendors: vendors.length, reflected: rate(yes.length, withRelease.length), days_reflected: spread(yes), days_not_reflected: spread(no) };
  });
  const byCapture = new Map();
  for (const s of statements) { const k = key(s.company, s.engine); if (!byCapture.has(k)) byCapture.set(k, []); byCapture.get(k).push(s); }
  const vendorTable = captures.map(c => {
    const mine = byCapture.get(key(c.company, c.engine)) || [];
    const n = cls => mine.filter(s => s.class === cls).length;
    const causes = mine.filter(s => s.class === 'wrong' || s.class === 'stale').map(s => s.causing_type === 'not found' ? 'cause not found' : `${s.causing_type}: ${s.causing_url}`);
    const l = launchOf.get(c.company);
    const absent = String(c.answer_text_or_excerpt).trim() === OVERVIEW_ABSENT;
    return {
      vendor: c.company, category: categoryOf.get(c.company), engine: c.engine, captured_utc: c.captured_utc,
      statements: mine.length, true: n('true'), wrong: n('wrong'), stale: n('stale'), unverifiable: n('unverifiable'),
      causes: causes.join(' | '),
      release_reflected: l && isoDate(l.launch_date) ? l[c.engine] : 'no release in window',
      overview: c.engine === 'Google AI Overviews' ? (absent ? 'absent' : 'present') : '',
      screenshot: c.engine === 'Perplexity' ? '' : c.screenshot,
      perplexity_excerpt: c.engine === 'Perplexity' ? String(c.answer_text_or_excerpt).trim() : '',
      share_link: c.share_link || ''
    };
  });
  const dates = captures.map(c => String(c.captured_utc).slice(0, 10)).filter(isoDate).sort();
  return {
    study: 'Wrong About You', order_code: ORDER_CODE, vendors: vendors.length, categories: categories.length, answers: captures.length,
    statements: statements.length, capture_dates: { first: dates[0] || null, last: dates[dates.length - 1] || null },
    per_engine: perEngine, per_category: perCategory, category_engine: categoryEngine, launch_lag: launchLag, vendor_table: vendorTable
  };
}

// Text forms. "k of n (p%, 95% interval low to high)".
export const fmtRate = r => r.pct === null ? `${r.k} of ${r.n}` : `${r.k} of ${r.n} (${r.pct.toFixed(1)}%, ${r.low.toFixed(1)} to ${r.high.toFixed(1)})`;
const fmtDays = d => d.n === 0 ? 'none' : `median ${d.median} (${d.min} to ${d.max}), n ${d.n}`;
const fmtList = (list, label) => list.length ? list.slice(0, 3).map(x => `${x[label]} ${x.n}`).join('; ') : 'none';
const mdTable = (head, rows) => ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '-').join('|') + '|', ...rows.map(r => '| ' + r.map(c => String(c).replace(/\|/g, '/')).join(' | ') + ' |')].join('\n');

export function resultsMarkdown(r) {
  const out = [];
  out.push(`# Results`, '', `${r.answers} answers about ${r.vendors} vendors in ${r.categories} categories, captured ${r.capture_dates.first} to ${r.capture_dates.last}; ${r.statements} statements classed. Counts carry their bases; intervals are 95 percent Wilson intervals. Unverifiable statements count as neither right nor wrong.`, '');
  out.push('## Results per engine', '');
  out.push(mdTable(['Engine', 'Answers', 'Statements', 'True', 'Wrong', 'Stale', 'Unverifiable', 'Wrong or stale, of settled statements', 'Answers with at least one wrong or stale statement'],
    r.per_engine.map(e => [e.engine, e.answers + (e.overview_absent ? ` (${e.overview_absent} Overview absent)` : ''), e.statements, fmtRate(e.classes.true), fmtRate(e.classes.wrong), fmtRate(e.classes.stale), fmtRate(e.classes.unverifiable), fmtRate(e.wrong_or_stale_of_settled), fmtRate(e.answers_wrong_or_stale)])), '');
  out.push('### The most common wrong and stale statement types, and their causing pages', '');
  out.push(mdTable(['Engine', 'Wrong or stale statements by fact', 'Causing page types'], r.per_engine.map(e => [e.engine, fmtList(e.wrong_types, 'item'), fmtList(e.causing_types, 'type')])), '');
  out.push('## Results per category', '');
  out.push(mdTable(['Category', 'Vendors', 'Answers', 'Statements', 'Wrong', 'Stale', 'Answers with at least one wrong or stale statement', 'Most common types', 'Causing page types'],
    r.per_category.map(c => [c.category, c.vendors, c.answers, c.statements, c.classes.wrong.k, c.classes.stale.k, fmtRate(c.answers_wrong_or_stale), fmtList(c.wrong_types, 'item'), fmtList(c.causing_types, 'type')])), '');
  out.push(mdTable(['Category', ...ENGINES], [...new Set(r.category_engine.map(x => x.category))].map(cat => [cat, ...ENGINES.map(e => { const x = r.category_engine.find(y => y.category === cat && y.engine === e); return `${x.answers_wrong_or_stale} of ${x.answers}`; })])), '');
  out.push('## Launch lag', '');
  const m = r.launch_lag[0];
  out.push(`${m.vendors_with_release} of ${m.vendors} vendors dated a release within ${WINDOW_DAYS} days before their first capture. Days since launch are counted to the capture date of that engine's answer.`, '');
  out.push(mdTable(['Engine', 'Releases reflected', 'Days since launch, reflected', 'Days since launch, not reflected'], r.launch_lag.map(l => [l.engine, fmtRate(l.reflected), fmtDays(l.days_reflected), fmtDays(l.days_not_reflected)])), '');
  out.push('## The vendor table', '');
  out.push('Receipts: the screenshot file in data/screenshots for ChatGPT, Claude, Google AI Overviews and Google AI Mode; for Perplexity, the excerpt of at most 60 words that carries the statements and the share link.', '');
  out.push(mdTable(['Vendor', 'Engine', 'Statements', 'Wrong', 'Stale', 'Causes', 'Release reflected', 'Receipt'],
    r.vendor_table.map(v => [v.vendor, v.engine + (v.overview === 'absent' ? ' (Overview absent)' : ''), v.statements, v.wrong, v.stale, v.causes || 'none', v.release_reflected, v.engine === 'Perplexity' ? `excerpt; ${v.share_link}` : v.screenshot + (v.share_link ? `; ${v.share_link}` : '')])), '');
  return out.join('\n');
}

// Figures: plain SVG, blue palette, ASCII text.
const svgEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function barChart(title, note, rows) {
  const W = 760, left = 190, right = 150, top = 64, rowH = 40, plot = W - left - right, H = top + rows.length * rowH + 44;
  const x = p => left + (p / 100) * plot;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Geist, Arial, sans-serif" role="img" aria-label="${svgEsc(title)}">`,
    `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`, `<text x="16" y="28" font-size="16" font-weight="600" fill="#101828">${svgEsc(title)}</text>`, `<text x="16" y="48" font-size="12" fill="#475467">${svgEsc(note)}</text>`];
  for (const t of [0, 25, 50, 75, 100]) parts.push(`<line x1="${x(t)}" y1="${top - 6}" x2="${x(t)}" y2="${top + rows.length * rowH}" stroke="#E4E7EC"/><text x="${x(t)}" y="${top + rows.length * rowH + 18}" font-size="11" fill="#475467" text-anchor="middle">${t}%</text>`);
  rows.forEach((row, i) => {
    const y = top + i * rowH;
    parts.push(`<text x="${left - 10}" y="${y + 22}" font-size="13" fill="#101828" text-anchor="end">${svgEsc(row.label)}</text>`);
    if (row.rate.pct !== null) {
      parts.push(`<rect x="${left}" y="${y + 8}" width="${(row.rate.pct / 100) * plot}" height="20" fill="${row.label === ALL ? '#1D4ED8' : '#3B82F6'}"/>`);
      parts.push(`<line x1="${x(row.rate.low)}" y1="${y + 18}" x2="${x(row.rate.high)}" y2="${y + 18}" stroke="#101828" stroke-width="1.5"/><line x1="${x(row.rate.low)}" y1="${y + 12}" x2="${x(row.rate.low)}" y2="${y + 24}" stroke="#101828"/><line x1="${x(row.rate.high)}" y1="${y + 12}" x2="${x(row.rate.high)}" y2="${y + 24}" stroke="#101828"/>`);
    }
    parts.push(`<text x="${W - right + 10}" y="${y + 22}" font-size="12" fill="#101828">${svgEsc(`${row.rate.k} of ${row.rate.n}`)}</text>`);
  });
  parts.push('</svg>');
  return parts.join('\n') + '\n';
}

function stackedClasses(r) {
  const W = 760, left = 190, right = 30, top = 86, rowH = 40, plot = W - left - right, rows = r.per_engine, H = top + rows.length * rowH + 20;
  const colour = { true: '#BFDBFE', wrong: '#1D4ED8', stale: '#3B82F6', unverifiable: '#E4E7EC' };
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Geist, Arial, sans-serif" role="img" aria-label="Statements by class, per engine">`,
    `<rect width="${W}" height="${H}" fill="#FFFFFF"/>`, '<text x="16" y="28" font-size="16" font-weight="600" fill="#101828">Statements by class, per engine</text>',
    '<text x="16" y="48" font-size="12" fill="#475467">Share of all statements in the engine\'s answers. Unverifiable counts as neither right nor wrong.</text>'];
  CLASSES.forEach((c, i) => parts.push(`<rect x="${16 + i * 130}" y="60" width="12" height="12" fill="${colour[c]}" stroke="#98A2B3" stroke-width="0.5"/><text x="${34 + i * 130}" y="70" font-size="12" fill="#101828">${c}</text>`));
  rows.forEach((e, i) => {
    const y = top + i * rowH; let at = left;
    parts.push(`<text x="${left - 10}" y="${y + 22}" font-size="13" fill="#101828" text-anchor="end">${svgEsc(e.engine)}</text>`);
    for (const c of CLASSES) {
      const p = e.classes[c].pct; if (!p) continue;
      const w = (p / 100) * plot;
      parts.push(`<rect x="${at.toFixed(1)}" y="${y + 8}" width="${w.toFixed(1)}" height="20" fill="${colour[c]}"/>`);
      if (w > 28) parts.push(`<text x="${(at + w / 2).toFixed(1)}" y="${y + 22}" font-size="11" text-anchor="middle" fill="${c === 'wrong' ? '#FFFFFF' : '#101828'}">${e.classes[c].k}</text>`);
      at += w;
    }
  });
  parts.push('</svg>');
  return parts.join('\n') + '\n';
}

function causeChart(r) {
  const all = r.per_engine.find(e => e.engine === ALL);
  const total = all.causing_types.reduce((s, c) => s + c.n, 0);
  return barChart('Causing page types of wrong and stale statements', `All five engines; base: ${total} wrong or stale statements.`, CAUSING_TYPES.map(t => ({ label: t === 'not found' ? 'cause not found' : t, rate: rate(all.causing_types.find(c => c.type === t)?.n || 0, total) })));
}

export function figures(r) {
  return {
    'fig1_answers_wrong_or_stale.svg': barChart('Answers with at least one wrong or stale statement', `Per engine, of ${r.vendors} vendors; 95 percent Wilson intervals.`, r.per_engine.map(e => ({ label: e.engine, rate: e.answers_wrong_or_stale }))),
    'fig2_statement_classes.svg': stackedClasses(r),
    'fig3_causing_page_types.svg': causeChart(r),
    'fig4_releases_reflected.svg': barChart('Latest dated release reflected in the answer', `Per engine, of ${r.launch_lag[0].vendors_with_release} vendors with a release in the ${WINDOW_DAYS}-day window; 95 percent Wilson intervals.`, r.launch_lag.map(l => ({ label: l.engine, rate: l.reflected })))
  };
}

export function writeResults(r, outDir, inputs = {}) {
  mkdirSync(join(outDir, 'figures'), { recursive: true });
  const files = {};
  const flat = e => ({ ...Object.fromEntries(['answers', 'overview_absent', 'statements'].map(k => [k, e[k]])), ...Object.fromEntries(CLASSES.flatMap(c => [[c, e.classes[c].k], [c + '_pct', e.classes[c].pct ?? ''], [c + '_low', e.classes[c].low ?? ''], [c + '_high', e.classes[c].high ?? '']])), wrong_or_stale_of_settled: e.wrong_or_stale_of_settled.k, settled: e.wrong_or_stale_of_settled.n, answers_wrong_or_stale: e.answers_wrong_or_stale.k, answers_wrong_or_stale_pct: e.answers_wrong_or_stale.pct ?? '', answers_wrong_or_stale_low: e.answers_wrong_or_stale.low ?? '', answers_wrong_or_stale_high: e.answers_wrong_or_stale.high ?? '' });
  const engineRows = r.per_engine.map(e => ({ engine: e.engine, ...flat(e) }));
  files['per_engine.csv'] = toCsv(engineRows, Object.keys(engineRows[0]));
  const catRows = r.per_category.map(c => ({ category: c.category, vendors: c.vendors, ...flat(c) }));
  files['per_category.csv'] = toCsv(catRows, Object.keys(catRows[0]));
  files['category_engine.csv'] = toCsv(r.category_engine, ['category', 'engine', 'answers_wrong_or_stale', 'answers']);
  files['wrong_types.csv'] = toCsv(r.per_engine.flatMap(e => e.wrong_types.map(t => ({ engine: e.engine, fact_sheet_item: t.item, statements: t.n }))), ['engine', 'fact_sheet_item', 'statements']);
  files['causing_types.csv'] = toCsv(r.per_engine.flatMap(e => e.causing_types.map(t => ({ engine: e.engine, causing_type: t.type, statements: t.n }))), ['engine', 'causing_type', 'statements']);
  files['launch_lag.csv'] = toCsv(r.launch_lag.map(l => ({ engine: l.engine, vendors_with_release: l.vendors_with_release, reflected: l.reflected.k, reflected_pct: l.reflected.pct ?? '', reflected_low: l.reflected.low ?? '', reflected_high: l.reflected.high ?? '', days_reflected_median: l.days_reflected.median ?? '', days_reflected_min: l.days_reflected.min ?? '', days_reflected_max: l.days_reflected.max ?? '', days_not_reflected_median: l.days_not_reflected.median ?? '', days_not_reflected_min: l.days_not_reflected.min ?? '', days_not_reflected_max: l.days_not_reflected.max ?? '' })), ['engine', 'vendors_with_release', 'reflected', 'reflected_pct', 'reflected_low', 'reflected_high', 'days_reflected_median', 'days_reflected_min', 'days_reflected_max', 'days_not_reflected_median', 'days_not_reflected_min', 'days_not_reflected_max']);
  files['vendor_table.csv'] = toCsv(r.vendor_table, Object.keys(r.vendor_table[0]));
  files['RESULTS.md'] = resultsMarkdown(r);
  files['summary.json'] = JSON.stringify({ ...r, inputs_sha256: inputs }, null, 1) + '\n';
  for (const [name, svg] of Object.entries(figures(r))) files['figures/' + name] = svg;
  for (const [name, text] of Object.entries(files)) writeFileSync(join(outDir, name), text);
  return Object.keys(files);
}

export function inputHashes(dir, names = FILES) {
  return Object.fromEntries(['vendors', 'captures', 'statements', 'launches'].map(k => [names[k], createHash('sha256').update(readFileSync(join(dir, names[k]))).digest('hex')]));
}

export function run(dataDir, outDir) {
  const data = readData(dataDir);
  const checked = validate(data, { screenshotExists: imageOnDisk(join(dataDir, FILES.screenshots)), screenshotsFor: engine => engine !== 'Perplexity' });
  if (!checked.ok) return { ok: false, errors: checked.errors };
  const r = analyse(data);
  const written = writeResults(r, outDir, inputHashes(dataDir));
  return { ok: true, results: r, written, warnings: checked.warnings };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  const [dataDir = 'data', outDir = 'results'] = process.argv.slice(2);
  const out = run(dataDir, outDir);
  if (!out.ok) { console.error(out.errors.join('\n')); process.exit(1); }
  for (const w of out.warnings) console.log('note: ' + w);
  console.log(`Wrote ${out.written.length} files to ${outDir}: ${out.results.answers} answers, ${out.results.statements} statements, ${out.results.vendors} vendors.`);
}
