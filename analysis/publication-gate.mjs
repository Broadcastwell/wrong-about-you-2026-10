// Index-derived Study 6 gate. Never reads or creates a new engine capture.
import { readDerived, validateDerived, engineStatements, reviewState, analyseDerived, statementKey } from './index-record.mjs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function publicationGate(data) {
  const check = validateDerived(data);
  const reviews = new Map(engineStatements(data, { includeDropped: true }).map(s => [statementKey(s), s]));
  const original = engineStatements({ ...data, statement_reviews: [] });
  const required = new Set(original.filter(s => ['wrong', 'stale'].includes(s.class)).map(statementKey));
  for (const s of reviews.values()) if (['wrong', 'stale'].includes(s.class)) required.add(statementKey(s));
  const missing = [...required].filter(key => reviewState(reviews.get(key) || {}) !== 'verified');
  return { ok: check.ok && missing.length === 0, errors: check.errors, required: required.size, missing, totals: analyseDerived(data).totals };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1] || '')).href) {
  const out = publicationGate(readDerived(resolve(process.argv[2] || 'data')));
  console.log(JSON.stringify(out, null, 2));
  if (!out.ok) process.exitCode = 1;
}
