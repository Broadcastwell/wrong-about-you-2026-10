// Tests on the fictional 30-row fixture (6 vendors, 5 engines). Run: node test/analyze.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, cpSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv, toCsv, validate, analyse, wilson, median, words, slug, screenshotName, hasDash, run, ENGINES, ALL, OVERVIEW_ABSENT } from '../analysis/analyze.mjs';
import { gate, readCaptures, CAPTURE_FILES } from '../analysis/gate.mjs';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixture');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const NOW = Date.parse('2026-10-07T12:00:00Z');
const fixture = () => readCaptures(FIXTURE);
const engine = (r, name) => r.per_engine.find(e => e.engine === name);

function capturesDir({ skip = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'way-captures-'));
  cpSync(FIXTURE, dir, { recursive: true });
  mkdirSync(join(dir, CAPTURE_FILES.screenshots));
  for (const c of fixture().captures) if (!skip.includes(c.screenshot)) writeFileSync(join(dir, CAPTURE_FILES.screenshots, c.screenshot), PNG);
  return dir;
}

test('the fixture passes the publication gate checks', () => {
  const out = validate(fixture(), { now: NOW });
  assert.deepEqual(out.errors, []);
  assert.equal(out.ok, true);
  assert.equal(fixture().captures.length, 30);
});

test('CSV parsing keeps quoted commas, doubled quotes and line breaks', () => {
  const rows = parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\r\n');
  assert.deepEqual(rows, [{ a: 'x, y', b: 'say "hi"\nthere' }]);
  assert.deepEqual(parseCsv(toCsv(rows, ['a', 'b'])), rows);
});

test('Wilson intervals and medians', () => {
  assert.deepEqual(wilson(3, 6), { low: 18.8, high: 81.2 });
  assert.deepEqual(wilson(0, 6), { low: 0, high: 39 });
  assert.equal(median([22, 57, 93, 122]), 75);
  assert.equal(median([57, 122, 93]), 93);
  assert.equal(median([]), null);
});

test('names follow the capture kit', () => {
  assert.equal(slug('IDEXX (Cornerstone, Neo)'), 'idexx-cornerstone-neo');
  assert.equal(screenshotName('8am MyCase', 'Google AI Overviews'), 'WAY-2026-10_8am-mycase_GoogleAIOverviews_S.png');
});

test('per engine: statements by class, settled share and answers with a wrong or stale statement', () => {
  const r = analyse(fixture());
  const expect = { 'ChatGPT': [13, 9, 1, 2, 1, 3], 'Claude': [12, 7, 2, 1, 2, 3], 'Perplexity': [12, 10, 2, 0, 0, 2], 'Google AI Overviews': [7, 5, 0, 2, 0, 2], 'Google AI Mode': [13, 10, 2, 1, 0, 3], [ALL]: [57, 41, 7, 6, 3, 13] };
  for (const [name, [statements, t, w, s, u, answers]] of Object.entries(expect)) {
    const e = engine(r, name);
    assert.equal(e.statements, statements, name);
    assert.deepEqual([e.classes.true.k, e.classes.wrong.k, e.classes.stale.k, e.classes.unverifiable.k], [t, w, s, u], name);
    assert.equal(e.answers_wrong_or_stale.k, answers, name);
    assert.equal(e.answers_wrong_or_stale.n, name === ALL ? 30 : 6, name);
    assert.equal(e.wrong_or_stale_of_settled.n, t + w + s, name);
  }
  assert.equal(engine(r, 'Google AI Overviews').overview_absent, 2);
  assert.deepEqual(engine(r, 'ChatGPT').answers_wrong_or_stale, { k: 3, n: 6, pct: 50, low: 18.8, high: 81.2 });
});

test('wrong statement types and causing page types', () => {
  const all = engine(analyse(fixture()), ALL);
  assert.deepEqual(all.wrong_types[0], { item: 'pricing', n: 6 });
  assert.deepEqual(all.causing_types, [{ type: 'directory', n: 5 }, { type: 'own page', n: 2 }, { type: 'press', n: 2 }, { type: 'review site', n: 2 }, { type: 'forum', n: 1 }, { type: 'not found', n: 1 }]);
});

test('per category', () => {
  const r = analyse(fixture());
  assert.deepEqual(r.per_category.map(c => [c.category, c.vendors, c.answers, c.answers_wrong_or_stale.k]), [['Field service management software (fictional)', 3, 15, 7], ['Dental practice management software (fictional)', 3, 15, 6]]);
  assert.equal(r.category_engine.length, 10);
});

test('launch lag: releases reflected and days since launch', () => {
  const lag = Object.fromEntries(analyse(fixture()).launch_lag.map(l => [l.engine, l]));
  assert.equal(lag.ChatGPT.vendors_with_release, 5);
  assert.deepEqual(ENGINES.map(e => lag[e].reflected.k), [3, 1, 2, 1, 4]);
  assert.deepEqual([lag.ChatGPT.days_reflected.median, lag.ChatGPT.days_not_reflected.median], [122, 57.5]);
  assert.deepEqual([lag.Perplexity.days_reflected.median, lag.Perplexity.days_not_reflected.median], [78.5, 93]);
  assert.deepEqual([lag['Google AI Mode'].days_reflected.min, lag['Google AI Mode'].days_reflected.max], [22, 122]);
});

test('vendor table: Perplexity only as excerpt and share link, never a screenshot', () => {
  const rows = analyse(fixture()).vendor_table;
  assert.equal(rows.length, 30);
  for (const v of rows.filter(x => x.engine === 'Perplexity')) {
    assert.equal(v.screenshot, '');
    assert.ok(words(v.perplexity_excerpt) <= 60);
    assert.match(v.share_link, /^https:\/\//);
  }
  assert.equal(rows.find(x => x.vendor === 'Tallowfield' && x.engine === 'Google AI Overviews').overview, 'absent');
  assert.equal(rows.find(x => x.vendor === 'Tallowfield').release_reflected, 'no release in window');
});

test('the gate refuses each kind of incomplete or unsafe data', () => {
  const cases = [
    ['blank answer', d => { d.captures[0].answer_text_or_excerpt = ''; }, /blank answer/],
    ['duplicate engine', d => { d.captures[1].engine = 'ChatGPT'; }, /duplicate engine/],
    ['missing capture', d => { d.captures.pop(); }, /capture missing: Ostrey, Google AI Mode/],
    ['Perplexity excerpt too long', d => { d.captures[2].answer_text_or_excerpt = Array(61).fill('word').join(' '); }, /over 60 words/],
    ['Perplexity without share link', d => { d.captures[2].share_link = ''; }, /share link missing/],
    ['wrong without proof', d => { d.statements.find(s => s.class === 'wrong').proof_url = ''; }, /without a proof URL/],
    ['cause on a true statement', d => { d.statements.find(s => s.class === 'true').causing_type = 'press'; }, /only for wrong or stale/],
    ['statement on an absent Overview', d => { d.statements.push({ ...d.statements[0], engine: 'Google AI Overviews', company: 'Tallowfield' }); }, /Overview was absent/],
    ['release outside the window', d => { d.launches[0].launch_date = '2026-01-02'; }, /more than 180 days/],
    ['release after capture', d => { d.launches[0].launch_date = '2026-10-05'; }, /after the first capture/],
    ['reflected on an absent Overview', d => { d.launches[5]['Google AI Overviews'] = 'yes'; }, /cannot reflect/],
    ['wrong screenshot name', d => { d.captures[0].screenshot = 'shot.png'; }, /screenshot should be named/],
    ['capture in the future', d => { d.captures[0].captured_utc = '2027-01-01T00:00:00Z'; }, /in the future/],
    ['missing initials', d => { d.captures[0].captured_by = ''; }, /initials missing/]
  ];
  for (const [name, change, pattern] of cases) {
    const d = fixture(); change(d);
    const out = validate(d, { now: NOW });
    assert.equal(out.ok, false, name);
    assert.ok(out.errors.some(e => pattern.test(e)), name + ': ' + out.errors.join('; '));
  }
  const noShot = validate(fixture(), { now: NOW, screenshotExists: n => !n.includes('kalvenor-systems_Claude') });
  assert.ok(noShot.errors.some(e => /screenshot file .*kalvenor-systems_Claude_S\.png not found/.test(e)));
});

test('gate: deposit keeps Perplexity as excerpt and link, codes the team and writes the results', () => {
  const caps = capturesDir();
  const repo = mkdtempSync(join(tmpdir(), 'way-repo-'));
  try {
    const out = gate(caps, repo, { now: NOW });
    assert.equal(out.ok, true, (out.errors || []).join('; '));
    assert.equal(out.screenshots, 24);
    assert.equal(out.people, 3);
    const shots = readdirSync(join(repo, 'data', 'screenshots'));
    assert.equal(shots.length, 24);
    assert.ok(shots.every(f => !f.includes('_Perplexity_')));
    const deposit = readFileSync(join(repo, 'data', 'record_captures.csv'), 'utf8') + readFileSync(join(repo, 'data', 'record_statements.csv'), 'utf8') + readFileSync(join(repo, 'data', 'vendors.csv'), 'utf8');
    assert.doesNotMatch(deposit, /"(AB|CD|EF)"/);
    assert.match(deposit, /"R01"/);
    assert.doesNotMatch(readFileSync(join(repo, 'data', 'vendors.csv'), 'utf8'), /captured_by_initials/);
    for (const f of ['RESULTS.md', 'per_engine.csv', 'per_category.csv', 'launch_lag.csv', 'vendor_table.csv', 'summary.json', 'figures/fig1_answers_wrong_or_stale.svg', 'figures/fig2_statement_classes.svg', 'figures/fig3_causing_page_types.svg', 'figures/fig4_releases_reflected.svg']) assert.ok(existsSync(join(repo, 'results', f)), f);
    const md = readFileSync(join(repo, 'results', 'RESULTS.md'), 'utf8');
    assert.match(md, /\| All five engines \| 30 \(2 Overview absent\) \| 57 \|/);
    assert.match(md, /3 of 6 \(50\.0%, 18\.8 to 81\.2\)/);
    for (const f of ['RESULTS.md', 'figures/fig1_answers_wrong_or_stale.svg', 'figures/fig2_statement_classes.svg', 'figures/fig3_causing_page_types.svg', 'figures/fig4_releases_reflected.svg']) {
      const text = readFileSync(join(repo, 'results', f), 'utf8');
      assert.doesNotMatch(text, /[^\x00-\x7F]/, f + ' is ASCII');
      assert.equal(hasDash(text), false, f + ' has no dash');
    }
    const first = readFileSync(join(repo, 'results', 'summary.json'), 'utf8');
    const again = run(join(repo, 'data'), join(repo, 'results'));
    assert.equal(again.ok, true);
    assert.equal(readFileSync(join(repo, 'results', 'summary.json'), 'utf8'), first, 'same data, same bytes');
  } finally { rmSync(caps, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true }); }
});

test('gate stays closed when a screenshot is missing, and deposits nothing', () => {
  const caps = capturesDir({ skip: ['WAY-2026-10_ostrey_GoogleAIMode_S.png'] });
  const repo = mkdtempSync(join(tmpdir(), 'way-repo-'));
  try {
    const out = gate(caps, repo, { now: NOW });
    assert.equal(out.ok, false);
    assert.equal(out.stage, 'validate');
    assert.ok(out.errors.some(e => e.includes('WAY-2026-10_ostrey_GoogleAIMode_S.png')));
    assert.equal(existsSync(join(repo, 'data', 'record_captures.csv')), false);
  } finally { rmSync(caps, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true }); }
});

test('an absent Overview is a valid record and is never classed', () => {
  const d = fixture();
  const absent = d.captures.filter(c => c.answer_text_or_excerpt === OVERVIEW_ABSENT);
  assert.deepEqual(absent.map(c => c.company), ['Tallowfield', 'Ostrey']);
  assert.ok(absent.every(c => c.engine === 'Google AI Overviews'));
  const bad = fixture(); bad.captures[0].answer_text_or_excerpt = OVERVIEW_ABSENT;
  assert.ok(validate(bad, { now: NOW }).errors.some(e => /only valid for Google AI Overviews/.test(e)));
});
