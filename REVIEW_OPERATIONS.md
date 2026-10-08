# Study 6 review import

The flagged workbook has one row per vendor, claim and engine. Its record_id is
the same three keys joined with a vertical bar. Never supply analyst initials
for the team. The source claims, answer instances and verbatim quotes are kept.

Run `node scripts/import-review.mjs STUDY6_FLAGGED_REVIEW_DONE.xlsx --dry-run`
first. Explicit decisions are Confirm, Reclassify to true, Reclassify to
unverifiable, Reclassify to stale, Reclassify to wrong, and Drop. Classification
changes and Drop need two different analysts and a valid date. A blank or
partially signed file cannot open the publication gate.

Without `--dry-run`, engine-specific decisions are saved in
`data/statement_reviews.csv` and every change is appended to
`data/review_log.csv`, including the workbook hash, decision and old and new
class. An invalid workbook writes nothing. Reimporting an unchanged workbook
does not duplicate changes. A dropped statement retains its audit evidence but
leaves all published counts and the published engine statement set.

Then run `npm run analyse`, `npm test` and `npm run gate`. The gate requires the
team's review of every originally flagged engine statement, including rows
reclassified or dropped. It also checks currently flagged rows. The original
data stays private while any required review is missing.

Consumers must use `engineStatements(readDerived(dataDir))`, including the
returned class, reviewer fields and review_state. Joining source claims alone
would ignore engine-specific decisions. Source claim counts, answer counts,
category medians, rates and intervals are recomputed by `analyseDerived`.
`gate:captures` preserves the separate original manual-capture workflow; the
Index-derived release does not invoke it or make any new engine capture.
