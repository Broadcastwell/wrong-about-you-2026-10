# Study 6, Wrong About You: statement coding guide (v1, 8 October 2026)

This guide is the protocol for extracting and classing statements. It ships in the study repository as `CODING_GUIDE.md`.

## Inputs

- The answers: Absence Index release 2026-09 (DOI 10.5281/zenodo.22907695), captured under method v1.1 on 22 to 23 Sep 2026. For each vendor, every valid target answer that names it under the release matching rule (the count equals the release's named count). `passages/<category>__<slug>.json` holds, per answer, the passages about the vendor; `vendors/<category>__<slug>.json` holds the full answer text. Both are exact text from the deposit.
- The vendor's own public pages, read once each in this study with `scripts/fetch-once.mjs` (snapshot text in `pages/<slug>/<key>.txt`, metadata and read time in `pages/<slug>/<key>.json`).

## What counts as a statement

A statement is one factual claim an answer makes about the vendor, of one of these types only:

| type | examples |
|-|-|
| pricing | a price, a starting price, the price basis (per user, per month, per unit, quote only, custom pricing), billing terms |
| plans | plan or edition names, what a plan includes when stated as a fact (for example "unlimited users on every plan") |
| free_tier | a free plan, a free version, a free trial and its length |
| founding | founding year, founders |
| ownership | owner, parent company, private equity owner, public or private, stock ticker |
| headquarters | headquarters city, state or country |
| product_names | current product or module names, a rename ("formerly X", "now called Y"), "X by Y" naming |
| integrations | a named third-party product it integrates with |
| platforms | iOS, Android, web, Windows, Mac, desktop, cloud, on-premise, hosting |
| certifications | a named security or compliance certification or attestation |
| customer_counts | number of customers, users, firms, practices, projects, countries |
| acquisitions | the vendor acquired something, or was acquired, with or without a date |
| discontinued | a product retired, sunset, end of support, no longer sold |

Not statements for this study: opinions and rankings ("best for", "industry standard"), feature or capability descriptions, ease of use, support quality, review scores and ratings, market share, comparisons with other vendors, statements about another vendor.

Split compound sentences into atomic claims. A list of integrations is one claim per named product. "Plans start at $39 per user per month billed annually" is one claim (the price point with its basis).

Group the same claim made in different words into one claim, with one instance per answer that makes it. Different values are different claims ($39 and $54 are two claims; "founded 2009" and "founded 2010" are two claims).

## Clarifications (8 Oct 2026, from the pilot)

- Lower bounds: "over 1,000,000 projects" when the vendor states "more than 4,000,000" is true as written.
- In scope: integration counts ("250+ integrations") are `integrations` claims; HIPAA, GDPR or similar compliance claims and BAAs are `certifications` claims. Out of scope: valuations, funding amounts, revenue, employee counts, review ratings, product launch years (unless a rename or retirement).
- Splitting: "starts at $39 (EasyStart)" is one claim, the plan price with its basis ("The EasyStart plan costs $39 per user per month"). A plan inclusion list ("Plan X includes A, B and C") stays one claim unless its parts would get different classes; then split.
- Names: using the vendor's name is not a statement. A `product_names` claim is a naming fact: a rename ("formerly X"), "X by Y", or a module named as the vendor's product ("Clio Grow"); one claim per module name.
- Generic platform facts ("has a mobile app", "cloud based", "web based") are `platforms` claims. Hedged or conditional lines ("may require", "might cost") are not statements.
- Pages: when an integrations directory loads by script, up to two individual integration pages may be read, inside the 14 page budget. After two blocked answers from the same host, stop requesting that host and list the pages still needed in `needs_browser_read`.
- Home page: use https://<canonical domain>/ (the `home` field in page-candidates.json can point at a third-party page; ignore it).

## Classes (the published Record rules)

- true: it matches the vendor's published fact.
- wrong: it contradicts the vendor's published fact on the capture date.
- stale: it was true before a dated change the vendor documented.
- unverifiable: the vendor's own pages read in this study do not settle it. Unverifiable counts as neither right nor wrong.

Rules of evidence:
- Class only against the vendor's own published facts on its own pages. Never against a third-party page, never from memory, never by inference about internal facts. A fact the pages do not state is unverifiable, not wrong.
- Wrong needs an explicit contradiction on the vendor's own page. Compare like with like: monthly against monthly billing, per user against per user, the same plan. If the page does not give what the comparison needs, the claim is unverifiable.
- Stale needs a dated change documented on the vendor's own page (a rename, a price change, an acquisition, a retirement) and the claim matching the state before that change. Quote the dated change.
- Capture date: answers were captured 22 to 23 Sep 2026; pages were read 8 Oct 2026. If a page shows a change dated after 23 Sep 2026, class against the fact as it stood on the capture date and say so in the rationale.
- Every true, wrong or stale claim carries `proof_url` (a page read in this study) and `proof_quote`: a short exact copy (at most 300 characters) from that page's snapshot text that settles it. The validator rejects a quote that is not found in the snapshot.
- Never comment on the vendor's quality. The Record is about the engine's statement.

## Pages to read, once each

Up to 8 of the vendor's own pages: home, pricing, about or company, the product page for the product the category names, press or newsroom, integrations, security or trust, legal. Start from the vendor's own pages that the answers cite (`page-candidates.json`) and the home page's links. Product-family vendors (Oracle, SAP, Microsoft, Fujifilm, IDEXX, DaySmart, Patterson for Eaglesoft, Yardi Breeze, AscendTMS) are read on the product's own pages. A page that is blocked, disallowed by robots.txt or renders no text is recorded as such; claims it would have settled are unverifiable.

## Causes, for each wrong or stale claim

Look at the `cited_urls` of the answers that carry the claim.
- If a cited page carries the statement, it is the causing page. Read it once with the fetch tool (at most 6 cited pages per vendor for this step) and record `causing_url`, `causing_type` and a short exact `causing_quote` from its snapshot.
- causing_type: `own page` (the vendor's own page, for example a stale vendor page), `directory` (software directories and listing or comparison directories such as Capterra, G2 listings, GetApp, Software Advice, SourceForge, Crunchbase), `review site` (review aggregators and review pages), `press` (news and press releases), `forum` (Reddit, Quora, community threads), `other` (blogs, competitor pages, vendor comparison articles and anything else).
- If no cited page carries it, or the answer cites nothing, `causing_type` is `not found` and `causing_url` is empty: the Record prints "cause not found". This release traces causes through the answers' own citations only; no web search step.

## Output, one file per vendor: `statements/<category>__<slug>.json`

```json
{
  "vendor": "Fieldwire",
  "slug": "fieldwire",
  "category": "construction-project-management",
  "coded_at": "2026-10-08T03:10:00Z",
  "pages_read": [ { "url": "https://www.fieldwire.com/pricing", "key": "6ef8b1ac01e6fb59", "used_for": "pricing" } ],
  "claims": [
    {
      "claim_id": "C01",
      "type": "pricing",
      "claim": "Paid plans start at $39 per user per month billed annually.",
      "class": "true",
      "proof_url": "https://www.fieldwire.com/pricing",
      "proof_quote": "exact text from the snapshot",
      "stale_change": null,
      "causing_url": "",
      "causing_type": "",
      "causing_quote": "",
      "rationale": "One sentence: why this class.",
      "instances": [ { "record_id": "construction-project-management|q1|ChatGPT|1", "quote": "exact text from the answer" } ]
    }
  ],
  "notes": "anything the reviewer should know (blocked pages, thin pages)"
}
```

- `instances` lists every answer that makes the claim: the deposit record id and a short exact quote (the sentence or table cell) from that answer's text. The validator rejects a quote that is not found verbatim in the answer.
- `stale_change` for stale claims: `{ "date": "YYYY-MM-DD", "quote": "exact text from the vendor page that dates the change", "url": "..." }`.
- Counts, rates, intervals, "stated in n of 3 runs" and the category medians are computed by the analysis script from this file and the deposit, never typed by hand.

## Review

Every claim starts as `review_state: unreviewed`. Two Broadcastwell analysts review each row after publication (REVIEW_SHEET_study6.xlsx, scripts/import-review.mjs). The visible mark "Verified by two Broadcastwell analysts, <date>" appears only when both reviewer fields are filled.
