// Shared release wording. Review claims must come from the recorded review state.
export const METHOD_PREFIX = "Answers captured under method v1.1 on 22 to 23 Sep 2026 for the Absence Index release 2026-09 (DOI 10.5281/zenodo.22907695). Statements were extracted and classified under the published Record rules and checked against each vendor's own public pages. Every flagged statement is published with its engine, run, question, capture date and the vendor page it was checked against.";
export const METHOD_LINE = `${METHOD_PREFIX} Team review of the flagged statements is in progress; rows change only if the review changes them, and every change is logged in the public ledger.`;
export const BYLINE = 'Prepared by the Broadcastwell team';
export const DISPUTE_LINE = 'Any named company may request one no-cost re-run at index@broadcastwell.com; both results are published.';
export const reviewedMethodLine = date => `${METHOD_PREFIX.split(' Every flagged statement is published')[0]} Every flagged statement was reviewed by two Broadcastwell analysts; the reviewed counts replaced the provisional ones on ${date}.`;
