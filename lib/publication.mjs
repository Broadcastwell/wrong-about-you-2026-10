import { isDeepStrictEqual } from 'node:util';
import { analyseDerived, engineStatements, reviewState } from '../analysis/index-record.mjs';
import { releaseGate } from '../analysis/publication-gate.mjs';

export { METHOD_LINE, BYLINE, DISPUTE_LINE } from './study-copy.mjs';
export { methodLine } from '../analysis/index-record.mjs';

export function requirePublication(data, savedResults = null) {
  const gate = releaseGate(data);
  if (!gate.ok) throw new Error(`Publication held: invalid source data; ${gate.errors.join('; ')}`);
  const current = analyseDerived(data);
  if (savedResults) {
    const { inputs, ...saved } = JSON.parse(JSON.stringify(savedResults));
    const generated = JSON.parse(JSON.stringify(current));
    if (!Object.hasOwn(saved, 'statements')) delete generated.statements;
    if (!isDeepStrictEqual(saved, generated) || (inputs && !isDeepStrictEqual(inputs, data.input_hashes))) {
      throw new Error('results/summary.json is stale: rerun the analysis before publishing');
    }
  }
  return current;
}

export function vendorReviewLabel(data, slug) {
  const flagged = engineStatements(data).filter(s => s.slug === slug && ['wrong', 'stale'].includes(s.class));
  if (!flagged.length) return 'No flagged statements';
  if (flagged.some(s => reviewState(s) !== 'verified')) return 'Team review: in progress';
  return `Flagged statements verified by two Broadcastwell analysts, ${flagged.map(s => s.review_date).sort().at(-1)}`;
}
