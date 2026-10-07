# Wrong About You: what five engines get wrong, stale and late about 42 software vendors

> Draft. Placeholders in angle brackets (<month>, <doi>) and the results fill at the publication gate. Nothing here is public until then.

210 answers captured by hand by the Broadcastwell team in <month>: one fact question about each of 42 Absence Index vendors (the three most-named vendors in each of the 14 categories of release 2026-09) on ChatGPT, Claude, Perplexity, Google AI Overviews and Google AI Mode. Every statement in every answer verified against the vendor's own pages and classed true, wrong, stale or unverifiable; each wrong or stale statement traced to its causing page and type; each vendor's latest dated release checked against each engine's answer. Data, screenshots (Perplexity as excerpt and share link), method and code, CC BY 4.0, DOI <doi>.

Read the study at https://broadcastwell.com/research/wrong-about-you (after publication).

> Operator disclosure. Broadcastwell ran this study and sells the Record Check, which applies the same capture and classing to one company. The data, the screenshots and the code are public so anyone can recompute every figure.

## Method

Vendors. The three most-named vendors in each of the 14 categories of The Absence Index, release 2026-09 (DOI 10.5281/zenodo.22907695), ordered by named count, then cited count, then name: 42 vendors. The list is data/vendors.csv.

Question. One question per vendor, the same on every engine: "Tell me about <vendor>: what it does, its pricing, its latest releases, and who owns it." One capture per vendor per engine: 210 answers.

Capture. Every answer was captured by a member of the Broadcastwell team, by hand, in a signed-in seat, one question per fresh chat, with no custom instructions, memory and personalisation off where the product allows, web search on where the product offers it, in US English, using the exact question text and nothing else. We recorded the engine, the model label as displayed, the seat type, the UTC time, the full answer text (for Perplexity, the 60-word excerpt that carries the statements and the share link), every visible citation, and a screenshot. Google AI Overviews was recorded as present or absent before capture; an absent Overview is a valid record. Google AI Mode was captured in the AI Mode tab. Nothing was captured by a script, an extension or an automation; the engines' terms forbid it, and so do we.

Classes. A statement is one factual claim an answer makes about the vendor. Every statement in the 210 answers was listed and classed by our reviewer against the vendor's own public pages: true when it matches; wrong when it contradicts the vendor's published fact on the capture date; stale when it was true before a dated change the vendor documented; unverifiable when the vendor's own pages do not settle it within five minutes. Unverifiable counts as neither right nor wrong. Each wrong or stale statement was traced to its causing page: the citation the engine attached if it carries the statement, else the page found by searching the statement's distinctive words, else "cause not found". Causing pages are typed: own page, directory, review site, press, forum, other. Counts are reported with their bases; answers with at least one wrong or stale statement are reported as n of 42 per engine with a 95 percent Wilson interval.

Releases. For each vendor the team found its latest dated release on its own changelog, blog or press page within the 180 days before the vendor's first capture, and recorded for each engine whether the answer reflects it. Days since launch run from the release date to the capture date of that engine's answer. A vendor with no dated release in the window is listed and left out of the launch lag base.

People. Captures and statements carry team codes (R01, R02 and so on) instead of names. The gate in analysis/gate.mjs refuses the data unless every answer, time, seat, model label and screenshot is present, no engine appears twice for a vendor, every Perplexity row carries an excerpt of at most 60 words and a share link, and every wrong or stale statement carries a proof URL.

## Results per engine

<results: filled by analysis/analyze.mjs at the publication gate>

## Results per category

<results>

## Launch lag

<results>

## The vendor table

<results>

## What this does not prove

Wrong About You records what five AI engines stated about 42 vendors in answer to one question on stated dates, captured by people and verified against each vendor's own published facts. It makes no claim about what any buyer was told or decided.

"Wrong" means the statement contradicted the vendor's published fact on that date; "stale" means it was true before a change the vendor documented; "unverifiable" means the vendor's own pages did not settle it. A causing page is the page that carried the statement, not proof that the engine read it.

The vendors are the subjects of the engines' statements, not the authors of them. A wrong statement about a vendor says nothing about the vendor's product.

Each cell is one capture. Answers vary from run to run, so the intervals describe these 210 captures, not every answer an engine could give.

## How to cite

Broadcastwell (2026). Wrong About You: what five engines get wrong, stale and late about 42 software vendors (Version 1.0) [Data set]. Zenodo. <doi>

CITATION.cff carries the same.

## Files

- data/vendors.csv: the 42 vendors, their categories and the study question
- data/record_captures.csv: one row per answer: engine, UTC time, seat, model label, answer text (Perplexity: excerpt and share link), citations, screenshot file, team code
- data/record_statements.csv: one row per statement: class, fact, proof URL, causing URL and type, reviewer code
- data/vendor_launches.csv: each vendor's latest dated release and whether each engine's answer reflects it
- data/screenshots/: the screenshots of ChatGPT, Claude, Google AI Overviews and Google AI Mode answers
- analysis/analyze.mjs: the analysis (Node, no dependencies): node analysis/analyze.mjs data results
- analysis/gate.mjs: the publication gate that validated the team's capture folder and built data/
- results/: every table as CSV, RESULTS.md, summary.json and the figures
- test/: the tests, on a fictional 30-row fixture: npm test

## Disputes and corrections

A vendor that believes a statement is classed incorrectly can write to hello@broadcastwell.com with the page that proves it; a correction is published as a new version with the change logged. Any company can also report one wrong statement about itself free at the Correction Desk: https://app.broadcastwell.com/correction-desk.

## License

CC BY 4.0. The CC BY 4.0 license covers Broadcastwell's work: the classifications, tables, figures, method and code. Answer text and screenshots record what each engine displayed; rights in that output stay with whoever holds them.
