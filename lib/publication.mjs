import { analyseDerived, engineStatements, reviewState, CAPTURE_LINE } from '../analysis/index-record.mjs';
import { publicationGate } from '../analysis/publication-gate.mjs';

export const METHOD_LINE = `Answers ${CAPTURE_LINE}. Statements were extracted and classified under the published Record rules and checked against each vendor's own public pages; every flagged statement was reviewed by two Broadcastwell analysts before publication.`;
export const BYLINE = 'Prepared by the Broadcastwell team';
export const DISPUTE_LINE = 'Any named company may request one no-cost re-run at index@broadcastwell.com; both results are published.';

export function requirePublication(data, savedResults = null) {
  const gate = publicationGate(data);
  if (!gate.ok) throw new Error(`Publication held: ${gate.missing.length} flagged engine statements need two analysts; ${gate.errors.join('; ')}`);
  const current = analyseDerived(data);
  if (savedResults && JSON.stringify(savedResults) !== JSON.stringify(current)) throw new Error('results/summary.json is stale: rerun the analysis before publishing');
  return current;
}

export function vendorReviewLabel(data, slug) {
  const flagged = engineStatements(data).filter(s => s.slug === slug && ['wrong', 'stale'].includes(s.class));
  if (!flagged.length) return 'No flagged statements';
  if (flagged.some(s => reviewState(s) !== 'verified')) return 'Team review: in progress';
  return `Flagged statements verified by two Broadcastwell analysts, ${flagged.map(s => s.review_date).sort().at(-1)}`;
}
