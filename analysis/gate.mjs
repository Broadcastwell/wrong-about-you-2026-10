// The publication gate. Validates the team's capture folder, builds the public deposit in data/ and runs the analysis.
// Usage: node analysis/gate.mjs <capturesDir> [repoDir]
// capturesDir holds STUDY_VENDORS.csv, record_captures.csv, record_statements.csv, vendor_launches.csv and SCREENSHOTS/.
// The deposit keeps Perplexity as excerpt and share link only (no Perplexity screenshot), and replaces the team's
// initials with stable codes (R01, R02, ...) so no staff member is identified.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCsv, toCsv, validate, imageOnDisk, run, FILES, ENGINES } from './analyze.mjs';

export const CAPTURE_FILES = Object.freeze({ vendors: 'STUDY_VENDORS.csv', captures: 'record_captures.csv', statements: 'record_statements.csv', launches: 'vendor_launches.csv', screenshots: 'SCREENSHOTS' });
const VENDOR_COLUMNS = ['category_id', 'category', 'rank_in_category', 'vendor', 'website', 'named_in_release_2026_09', 'study_question'];
const CAPTURE_COLUMNS = ['order_code', 'company', 'engine', 'question_id', 'captured_utc', 'seat', 'model_label', 'answer_text_or_excerpt', 'share_link', 'citations', 'screenshot', 'captured_by'];
const STATEMENT_COLUMNS = ['order_code', 'company', 'engine', 'question_id', 'statement_text', 'class', 'fact_sheet_item', 'proof_url', 'causing_url', 'causing_type', 'launch_id', 'reviewer'];
const LAUNCH_COLUMNS = ['vendor', 'launch_text', 'launch_date', 'launch_url', ...ENGINES];

export function readCaptures(dir) {
  const read = f => parseCsv(readFileSync(join(dir, f), 'utf8'));
  return { vendors: read(CAPTURE_FILES.vendors), captures: read(CAPTURE_FILES.captures), statements: read(CAPTURE_FILES.statements), launches: read(CAPTURE_FILES.launches) };
}

export function teamCodes(data) {
  const people = [...new Set([...data.captures.map(c => c.captured_by), ...data.statements.map(s => s.reviewer)].map(v => String(v || '').trim().toUpperCase()).filter(Boolean))].sort();
  return new Map(people.map((p, i) => [p, 'R' + String(i + 1).padStart(2, '0')]));
}

export function gate(capturesDir, repoDir, { now = Date.now() } = {}) {
  const data = readCaptures(capturesDir);
  const checked = validate(data, { screenshotExists: imageOnDisk(join(capturesDir, CAPTURE_FILES.screenshots)), now });
  if (!checked.ok) return { ok: false, stage: 'validate', errors: checked.errors, warnings: checked.warnings };
  const codes = teamCodes(data);
  const code = v => codes.get(String(v || '').trim().toUpperCase());
  const dataDir = join(repoDir, 'data');
  if (existsSync(dataDir)) for (const f of readdirSync(dataDir)) if (f !== '.gitkeep') rmSync(join(dataDir, f), { recursive: true, force: true });
  mkdirSync(join(dataDir, FILES.screenshots), { recursive: true });
  writeFileSync(join(dataDir, FILES.vendors), toCsv(data.vendors, VENDOR_COLUMNS));
  writeFileSync(join(dataDir, FILES.captures), toCsv(data.captures.map(c => ({ ...c, captured_by: code(c.captured_by) })), CAPTURE_COLUMNS));
  writeFileSync(join(dataDir, FILES.statements), toCsv(data.statements.map(s => ({ ...s, reviewer: code(s.reviewer) })), STATEMENT_COLUMNS));
  writeFileSync(join(dataDir, FILES.launches), toCsv(data.launches, LAUNCH_COLUMNS));
  let copied = 0;
  for (const c of data.captures) {
    if (c.engine === 'Perplexity') continue;
    copyFileSync(join(capturesDir, CAPTURE_FILES.screenshots, c.screenshot), join(dataDir, FILES.screenshots, c.screenshot));
    copied++;
  }
  const out = run(dataDir, join(repoDir, 'results'));
  if (!out.ok) return { ok: false, stage: 'deposit', errors: out.errors, warnings: checked.warnings };
  return { ok: true, warnings: checked.warnings, screenshots: copied, people: codes.size, results: out.results, written: out.written };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  const [capturesDir, repoDir = '.'] = process.argv.slice(2);
  if (!capturesDir) { console.error('Usage: node analysis/gate.mjs <capturesDir> [repoDir]'); process.exit(2); }
  const out = gate(resolve(capturesDir), resolve(repoDir));
  for (const w of out.warnings || []) console.log('note: ' + w);
  if (!out.ok) { console.error(`Gate closed at ${out.stage}:\n` + out.errors.join('\n')); process.exit(1); }
  console.log(`Gate open: ${out.results.answers} answers, ${out.results.statements} statements, ${out.screenshots} screenshots deposited, ${out.people} team codes. Results in results/.`);
}
