// Write README.md and CITATION.cff for Wrong About You v1.0 from results/summary.json. Numbers are never typed by hand.
// Usage: node scripts/build-readme.mjs [doi] [conceptDoi] [releaseDate]
import { readFileSync, writeFileSync } from 'node:fs';
import { readDerived } from '../analysis/index-record.mjs';
import { requirePublication, METHOD_LINE, BYLINE, DISPUTE_LINE } from '../lib/publication.mjs';
const [doi = '', conceptDoi = '', releaseDate = '2026-10-08'] = process.argv.slice(2);
const minted = /^10\.\d+\//.test(doi) && /^10\.\d+\//.test(conceptDoi);
const r = JSON.parse(readFileSync('results/summary.json', 'utf8'));
requirePublication(readDerived('data'), r);
const t = r.totals;
const pct = x => x.pct === null ? `${x.k} of ${x.n}` : `${x.k} of ${x.n} (${x.pct.toFixed(1)} percent; 95 percent Wilson interval ${x.low.toFixed(1)} to ${x.high.toFixed(1)})`;
const types = r.per_type.filter(x => x.statements).map(x => `| ${x.type.replace(/_/g, ' ')} | ${x.statements} | ${x.true} | ${x.wrong} | ${x.stale} | ${x.unverifiable} |`).join('\n');
const engines = r.per_engine.map(e => `| ${e.engine} | ${e.statements} | ${e.true} | ${e.wrong} | ${e.stale} | ${e.unverifiable} | ${pct(e.wrong_or_stale_rate)} |`).join('\n');
const cats = r.per_category.map(c => `| ${c.category} | ${c.statements} | ${c.true} | ${c.wrong} | ${c.stale} | ${c.unverifiable} | ${pct(c.wrong_or_stale_rate)} |`).join('\n');
const causes = r.causes.map(c => `| ${c.causing_type === 'not found' ? 'cause not found' : c.causing_type} | ${c.claims} |`).join('\n');
const conf = r.confidence.map(c => `| ${c.runs_stated} of 3 runs | ${c.true} | ${c.wrong} | ${c.stale} | ${c.unverifiable} |`).join('\n');
const readme = `# Wrong About You: what five AI engines state about 70 software vendors, classed against the vendors' own pages

Broadcastwell, Study 6, version 1.0, ${releaseDate}. ${minted ? `DOI ${doi} (all versions: ${conceptDoi})` : 'Archived on Zenodo at release; the DOI is added here once Zenodo mints it'}. Licence CC BY 4.0.

${BYLINE}

${METHOD_LINE}

Every valid target answer that names one of 70 vendors, ${r.capture}. From those ${t.answers} answers we extracted every factual statement each answer makes about the vendor and classed it true, wrong, stale or unverifiable against the vendor's own public pages. No new answer was captured for this study.

Read the study at https://broadcastwell.com/research/wrong-about-you. Every vendor's record is on its Absence Index page (https://index.broadcastwell.com/vendors/).

> Operator disclosure. Broadcastwell ran this study and sells the Record Check, which applies the same classing to one company's answers. The data, the coding guide and the code are public so anyone can recompute every figure.

## Results

- Vendors: ${t.vendors} in ${t.categories} categories (the five most named vendors of each category in release 2026-09, the Agent Gap selection, DOI 10.5281/zenodo.23197560).
- Answers naming them: ${t.answers}.
- Claims (distinct factual statements per vendor): ${t.claims}. Engine statements (one claim as stated by one engine): ${t.statements}: ${t.true} true, ${t.wrong} wrong, ${t.stale} stale, ${t.unverifiable} unverifiable.
- Wrong or stale among verifiable engine statements: ${pct(t.wrong_or_stale_rate)}.
- Answers carrying at least one wrong or stale statement about the vendor they name: ${pct(t.answers_with_wrong_or_stale)}.
- Review: ${t.review.verified} claims verified by two Broadcastwell analysts, ${t.review['first review']} in first review, ${t.review.unreviewed} not yet reviewed.

Unverifiable counts as neither right nor wrong. Counts come before rates; every rate carries a 95 percent Wilson interval. The intervals describe these engine statements; statements from one answer or one engine are not independent, so read them as descriptive.

### Per engine

| Engine | Statements | True | Wrong | Stale | Unverifiable | Wrong or stale among verifiable |
|-|-|-|-|-|-|-|
${engines}

### Per category

| Category | Statements | True | Wrong | Stale | Unverifiable | Wrong or stale among verifiable |
|-|-|-|-|-|-|-|
${cats}

### Per statement type

| Type | Statements | True | Wrong | Stale | Unverifiable |
|-|-|-|-|-|-|
${types}

### Causing pages of wrong or stale claims

| Cause | Claims |
|-|-|
${causes}

### Confidence: in how many of the three runs the engine stated the claim

| Stated in | True | Wrong | Stale | Unverifiable |
|-|-|-|-|-|
${conf}

The per-vendor table with each vendor's category median is results/vendor_table.csv.

## Method

Answers. The 70 vendors are the five most named of each of the 14 categories of the Absence Index release 2026-09, ordered by named count, then cited count, then name. A vendor's answers are every valid target answer in the release that names it under the release's own matching rule; their number equals the vendor's published named count. The answers were ${r.capture}: five engines (ChatGPT, Claude, Perplexity, Google AI Overviews and Google AI Mode), ten buyer questions per category, three scheduled runs. data/answers.csv lists each answer by its deposit record id with its engine, run, question, capture time and cited URLs; the verbatim text is in the Index deposit.

Statements. A statement is one factual claim an answer makes about the vendor, of thirteen types: pricing, plans, free tier, founding, ownership, headquarters, product names, integrations, platforms, certifications, customer counts, acquisitions and discontinued products (CODING_GUIDE.md). Opinions, rankings, feature descriptions, ratings and statements about other vendors are not statements here. The same claim in different words is one claim; each answer that makes it is an instance with a short verbatim quote.

Classes. We class each claim under the published Record rules (broadcastwell.com/methodology#record-rules): true when it matches the vendor's published fact; wrong when it contradicts the published fact on the capture date; stale when it was true before a dated change the vendor documented; unverifiable when the vendor's own pages read in this study do not settle it. Only the vendor's own pages count as evidence, read once each on 8 October 2026 (a page that refused automated reading was read once in a real browser; a page whose robots.txt disallows automated agents was not read). Every true, wrong or stale claim carries the page and a verbatim quote from it.

Team review. A script checks that every quote appears word for word in its deposit answer and every proof quote on the page read. Every flagged engine statement was reviewed by two Broadcastwell analysts before publication; each reviewed statement carries reviewer_1, reviewer_2, review_date and review_state, and the mark "Verified by two Broadcastwell analysts, <date>" shows only when both have signed it (scripts/import-review.mjs, with a dated audit log in data/review_log.csv). Other rows retain their own review state.

Causes. For each wrong or stale claim we read the pages the answers carrying it cite; a cited page that carries the statement is its causing page, typed own page, directory, review site, press, forum or other. Otherwise the cause is "cause not found".

Confidence. For each engine statement, the number of the three scheduled runs in which that engine stated the claim at least once, out of 3.

Differences from the Record Check procedure. The Record Check captures fresh answers by hand and a reviewer classes them. This study reuses the September answers, traces causes through the answers' own citations only, and reads the vendors' pages on 8 October 2026 for answers captured on 22 to 23 September 2026. A fact a vendor changed between those dates is classed against the dated change where the page dates it.

## What this does not prove

Wrong About You records what five AI engines stated about 70 vendors in answer to buyer questions on stated dates, classed against each vendor's own published facts. It makes no claim about what any buyer was told or decided. "Wrong" means the statement contradicted the vendor's published fact on the capture date; "stale" means it was true before a documented change; "unverifiable" means the vendor's own pages did not settle it. A causing page is the page that carried the statement, not proof that the engine read it. The vendors are the subjects of the engines' statements, not their authors; a wrong statement about a vendor says nothing about the vendor's product.

## Disputes

${DISPUTE_LINE} A correction is released as a new version with the change logged.

## Files

- data/vendors.csv, data/answers.csv, data/claims.csv, data/instances.csv, data/pages.csv
- coding/: the coded statement file for each vendor, as reviewed
- results/: summary.json, RESULTS.md and every table as CSV
- analysis/index-record.mjs (the analysis: node analysis/index-record.mjs data results), analysis/derive.mjs (builds data/ from coding/ and the Index deposit, after checking the deposit's SHA-256)
- scripts/import-review.mjs and lib/xlsx-lite.mjs (the two-analyst review import)
- analysis/gate.mjs and analysis/analyze.mjs: the hand-capture protocol for the team's future captured version, tested on a fictional fixture in test/fixture that never enters data/
- CODING_GUIDE.md, CITATION.cff, LICENSE

## How to cite

Broadcastwell (2026). Wrong About You: what five AI engines state about 70 software vendors (Version 1.0) [Data set]. Zenodo. ${minted ? `https://doi.org/${doi}` : 'https://github.com/Broadcastwell/wrong-about-you-2026-10'}

## Licence

CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/legalcode). The licence covers Broadcastwell's work: the classifications, tables, method and code. Quoted answer text records what each engine displayed; rights in that output stay with whoever holds them.
`;
writeFileSync('README.md', readme);
const cff = `cff-version: 1.2.0
message: "If you use this data or code, please cite it as below."
title: "Wrong About You: what five AI engines state about 70 software vendors"
type: dataset
version: "1.0"
date-released: "${releaseDate}"
${doi.startsWith('10.') ? `doi: "${doi}"\n` : ''}authors:
  - name: "Broadcastwell"
    website: "https://broadcastwell.com"
    email: "hello@broadcastwell.com"
license: CC-BY-4.0
repository-code: "https://github.com/Broadcastwell/wrong-about-you-2026-10"
url: "https://broadcastwell.com/research/wrong-about-you"
abstract: "Every valid target answer in the Absence Index release 2026-09 that names one of 70 vendors (${t.answers} answers, ${r.capture}), read for factual statements about the vendor and classed true, wrong, stale or unverifiable against the vendor's own pages under the published Record rules. ${t.statements} engine statements; every row carries its review state."
keywords: ["AI search", "B2B software", "Absence Index", "ChatGPT", "Claude", "Perplexity", "Google AI Overviews", "Google AI Mode"]
references:
  - type: dataset
    title: "The Absence Index, release 2026-09"
    authors:
      - name: "Broadcastwell"
    doi: "10.5281/zenodo.22907695"
`;
writeFileSync('CITATION.cff', cff);
console.log('README.md and CITATION.cff written');
