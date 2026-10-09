# Study 6 release and review

The initial release is provisional. Team review of the 118 flagged engine
statements is in progress. No reviewer initials, review dates or verified marks
are supplied on the analysts' behalf.

`npm run gate` validates source data for publication with the honest method
paragraph and each row's actual review state. `npm run gate:reviewed` is the
separate strict gate for reviewed wording: it requires two distinct analysts
and a valid date for every originally flagged engine statement, including
reclassified or dropped rows, and every currently flagged row. Publication of
the provisional data does not open this reviewed gate.

The flagged workbook has one row per vendor, claim and engine. Its record_id is
the same three keys joined with a vertical bar. The source claims, answer
instances and verbatim quotes are retained.

Run `node scripts/import-review.mjs STUDY6_FLAGGED_REVIEW_DONE.xlsx --dry-run`
first. Explicit decisions are Confirm, Reclassify to true, Reclassify to
unverifiable, Reclassify to stale, Reclassify to wrong, and Drop. Classification
changes and Drop need two different analysts and a valid date. A blank or
partially signed file cannot earn a verified mark or open the reviewed gate.

Without `--dry-run`, engine-specific decisions are saved in
`data/statement_reviews.csv` and every change is appended to
`data/review_log.csv`, including the workbook hash, decision and old and new
class. An invalid workbook writes nothing. Reimporting an unchanged workbook
does not duplicate changes. A dropped statement retains its audit evidence but
leaves the published counts and the published engine statement set.

Then run `npm run analyse`, `npm test`, `npm run gate` and
`npm run gate:reviewed`. Regenerate the release artifacts with the actual date
and DOI identifiers. Reviewed wording appears only if the strict review
requirements are satisfied. Source metadata corrections belong in
`data/provenance_log.csv`; they are not analyst reviews.

Consumers must use `engineStatements(readDerived(dataDir))`, including the
returned class, reviewer fields and review_state. Joining source claims alone
would ignore engine-specific decisions. Source claim counts, answer counts,
category medians, rates and intervals are recomputed by `analyseDerived`.
`gate:captures` preserves the separate original manual-capture workflow; the
Index-derived release does not invoke it or make any new engine capture.

`node scripts/build-readme.mjs` can prepare repository metadata before DOI
minting and explicitly says DOI pending. The page and app/Index exporters
require real version and concept DOI identifiers. They never generate a
placeholder DOI for a public surface.
