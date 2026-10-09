// Index-derived Study 6 gate. Never reads or creates a new engine capture.
import { readDerived, validateDerived, analyseDerived, reviewCompletion } from './index-record.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function publicationGate(data) {
  const check = validateDerived(data);
  const review = reviewCompletion(data);
  return { ok: check.ok && review.missing.length === 0, errors: check.errors, ...review, totals: analyseDerived(data).totals };
}

// The provisional release is valid with honest in-progress wording. This does
// not mark any statement reviewed or relax the two-analyst decision importer.
export function releaseGate(data) {
  const review = publicationGate(data);
  return { ...review, ok: review.errors.length === 0, review_status: review.reviewed_on ? 'reviewed' : 'in_progress' };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  const args = process.argv.slice(2);
  const gate = args.includes('--reviewed') ? publicationGate : releaseGate;
  const out = gate(readDerived(resolve(args.find(arg => !arg.startsWith('--')) || 'data')));
  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exitCode = 1;
}
