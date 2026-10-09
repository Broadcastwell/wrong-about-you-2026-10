// Build the study's public pages from results/: the docs page and PDF source (Study 6 in the Research series) and the
// Framer page component with the vendor lookup box. Every number is read from results/, never typed.
// Usage: node scripts/build-pages.mjs <outDir> <doi> <conceptDoi> <date YYYY-MM-DD>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../analysis/analyze.mjs';
import { readDerived } from '../analysis/index-record.mjs';
import { requirePublication, methodLine, BYLINE, DISPUTE_LINE, vendorReviewLabel } from '../lib/publication.mjs';

const [outDir, doi = '', conceptDoi = '', date = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
const r = JSON.parse(readFileSync('results/summary.json', 'utf8'));
const reviewedData = readDerived('data');
requirePublication(reviewedData, r);
const METHOD_LINE = methodLine(reviewedData, date);
if (![doi, conceptDoi].every(x => /^10\.5281\/zenodo\.[1-9]\d+$/.test(x))) throw new Error('Real version and concept DOIs are required');
const vendors = parseCsv(readFileSync('results/vendor_table.csv', 'utf8'));
const vlist = parseCsv(readFileSync('data/vendors.csv', 'utf8'));
const t = r.totals;
const PAGE = 'https://broadcastwell.com/research/wrong-about-you';
const PDF_NAME = 'Study6_Wrong_About_You_2026-10.pdf';
const PDF = 'https://docs.broadcastwell.com/assets/research/study6/' + PDF_NAME;
const REPO = 'https://github.com/Broadcastwell/wrong-about-you-2026-10';
const ENGINES = 'ChatGPT, Claude, Perplexity, Google AI Overviews and Google AI Mode';
const DISPUTE = DISPUTE_LINE;
const DASHES = new RegExp('[' + String.fromCharCode(0x2012) + '-' + String.fromCharCode(0x2015) + ']|-{2}');
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dateText = d => { const [y, m, day] = d.split('-').map(Number); return `${day} ${months[m - 1]} ${y}`; };
const pct = x => x.pct === null ? `${x.k} of ${x.n}` : `${x.k} of ${x.n} (${x.pct.toFixed(1)} percent, 95 percent interval ${x.low.toFixed(1)} to ${x.high.toFixed(1)})`;
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const indexUrl = v => `https://index.broadcastwell.com/vendors/${v.slug}/${String(v.category_id).replace(/_/g, '-')}/`;

const LIMITS = 'Wrong About You records what five AI engines stated about 70 vendors in answer to buyer questions on stated dates, classed against each vendor\'s own published facts. It makes no claim about what any buyer was told or decided. "Wrong" means the statement contradicted the vendor\'s published fact on the capture date; "stale" means it was true before a documented change; "unverifiable" means the vendor\'s own pages did not settle it. A causing page is the page that carried the statement, not proof that the engine read it. The vendors are the subjects of the engines\' statements, not their authors; a wrong statement about a vendor says nothing about the vendor\'s product.';

function markdown() {
  const L = [];
  L.push(`# Wrong About You: what five AI engines state about 70 software vendors`, '');
  L.push(`Broadcastwell Research, Study 6, ${dateText(date)}. CC BY 4.0. DOI [${doi}](https://doi.org/${doi}). Data and code: ${REPO}.`, '');
  L.push(BYLINE, '', METHOD_LINE, '');
  L.push('## The findings', '');
  L.push(`- ${t.answers} answers named the 70 vendors (the five most named in each of 14 categories of the Absence Index release 2026-09).`);
  L.push(`- They made ${t.statements} factual statements about those vendors (one claim as stated by one engine): ${t.true} true, ${t.wrong} wrong, ${t.stale} stale and ${t.unverifiable} unverifiable against the vendors' own pages.`);
  L.push(`- Wrong or stale among verifiable statements: ${pct(t.wrong_or_stale_rate)}.`);
  L.push(`- Answers carrying at least one wrong or stale statement about the vendor they name: ${pct(t.answers_with_wrong_or_stale)}.`, '');
  L.push('Unverifiable counts as neither right nor wrong. Counts come before rates; every rate carries a 95 percent Wilson interval, descriptive because statements from one answer or one engine are not independent.', '');
  L.push('## Per engine', '', '| Engine | Statements | True | Wrong | Stale | Unverifiable | Wrong or stale among verifiable |', '|-|-|-|-|-|-|-|');
  for (const e of r.per_engine) L.push(`| ${e.engine} | ${e.statements} | ${e.true} | ${e.wrong} | ${e.stale} | ${e.unverifiable} | ${pct(e.wrong_or_stale_rate)} |`);
  L.push('', '## Per category', '', '| Category | Statements | True | Wrong | Stale | Unverifiable | Wrong or stale among verifiable |', '|-|-|-|-|-|-|-|');
  for (const c of r.per_category) L.push(`| ${c.category} | ${c.statements} | ${c.true} | ${c.wrong} | ${c.stale} | ${c.unverifiable} | ${pct(c.wrong_or_stale_rate)} |`);
  L.push('', '## What kind of statement', '', '| Type | Statements | True | Wrong | Stale | Unverifiable |', '|-|-|-|-|-|-|');
  for (const x of r.per_type.filter(x => x.statements)) L.push(`| ${x.type.replace(/_/g, ' ')} | ${x.statements} | ${x.true} | ${x.wrong} | ${x.stale} | ${x.unverifiable} |`);
  L.push('', '## Where the wrong and stale statements came from', '', '| Causing page | Claims |', '|-|-|');
  for (const x of r.causes) L.push(`| ${x.causing_type === 'not found' ? 'cause not found' : x.causing_type} | ${x.claims} |`);
  L.push('', '## How sure: in how many of the three runs the engine said it', '', '| Stated in | True | Wrong | Stale | Unverifiable |', '|-|-|-|-|-|');
  for (const x of r.confidence) L.push(`| ${x.runs_stated} of 3 runs | ${x.true} | ${x.wrong} | ${x.stale} | ${x.unverifiable} |`);
  L.push('', '## Every vendor, with its category median', '', '| Category | Vendor | Answers | Wrong (median) | Stale (median) | Unverifiable (median) | True (median) | Review |', '|-|-|-|-|-|-|-|-|');
  for (const v of vendors) L.push(`| ${v.category} | ${v.vendor} | ${v.named_answers} | ${v.wrong} (${v.category_median_wrong}) | ${v.stale} (${v.category_median_stale}) | ${v.unverifiable} (${v.category_median_unverifiable}) | ${v.true} (${v.category_median_true}) | ${vendorReviewLabel(reviewedData, v.slug)} |`);
  L.push('', '## Method', '');
  L.push(`Answers. Every valid target answer in the Absence Index release 2026-09 that names one of the 70 vendors under the release's own matching rule; their number equals each vendor's published named count. Five engines (${ENGINES}), ten buyer questions per category, three scheduled runs, ${r.capture}. No new answer was captured for this study.`, '');
  L.push('Statements and classes. Thirteen statement types: pricing, plans, free tier, founding, ownership, headquarters, product names, integrations, platforms, certifications, customer counts, acquisitions and discontinued products. Each claim is classed true, wrong, stale or unverifiable under the published Record rules (broadcastwell.com/methodology#record-rules) against the vendor\'s own pages read once on 8 October 2026, with a verbatim quote from the page for every true, wrong or stale claim. A script checks every quote against the deposit and the page read. Every row shows its actual review state. Only a statement signed by two distinct analysts with a real date may show the verified mark. Review changes are logged in data/review_log.csv; source provenance corrections are logged in data/provenance_log.csv.', '');
  L.push('Causes and confidence. A wrong or stale claim\'s causing page is a page cited by the answers carrying it that carries the statement, typed own page, directory, review site, press, forum or other; otherwise "cause not found". Confidence is the number of the three runs in which the engine stated the claim.', '');
  L.push('Differences from the Record Check. The Record Check captures fresh answers by hand and a reviewer classes them. This study reuses the September answers, traces causes through the answers\' own citations only, and reads the vendors\' pages on 8 October 2026. A page whose robots.txt disallows automated agents was not read; its claims stay unverifiable.', '');
  L.push('## What this does not prove', '', LIMITS, '', '## Disputes and citation', '', DISPUTE, '', `Cite as: Broadcastwell (2026). Wrong About You: what five AI engines state about 70 software vendors (Version 1.0) [Data set]. Zenodo. https://doi.org/${doi}. All versions: https://doi.org/${conceptDoi}.`, '');
  return L.join('\n');
}

function docsPage(md) {
  return `---\ntitle: "Study 6: Wrong About You"\ndescription: "What five AI engines state about 70 software vendors, classed against the vendors' own pages. Absence Index release 2026-09 answers, DOI ${doi}."\n---\n\n${md.replace(/^# .*\n/, '# Study 6: Wrong About You\n')}\n[Download the PDF](../../assets/research/study6/${PDF_NAME})\n`;
}

function framer(md) {
  const html = md.split('\n').filter(l => !/^# /.test(l)).join('\n')
    .replace(/^## (.*)$/gm, (_, h) => `<h2>${esc(h)}</h2>`)
    .replace(/^\| (.*) \|$/gm, row => row)
    .split(/\n{2,}/).map(block => {
      if (/^<h2>/.test(block)) return block;
      if (/^\|/.test(block)) {
        const rows = block.split('\n').filter(l => !/^\|-/.test(l)).map(l => l.replace(/^\|\s?|\s?\|$/g, '').split(' | '));
        const head = rows[0];
        return `<div class="way-table"><table><thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map(cells => `<tr>${cells.map((c, i) => `<td data-label="${esc(head[i])}">${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      }
      if (/^- /.test(block)) return `<ul>${block.split('\n').map(l => `<li>${esc(l.replace(/^- /, ''))}</li>`).join('')}</ul>`;
      return `<p>${esc(block).replace(/\[([^\]]+)\]\((https:[^)\s]+)\)/g, '<a href="$2">$1</a>')}</p>`;
    }).join('\n');
  const lookup = vlist.map(v => ({ v: v.vendor, c: v.category, u: indexUrl(v) }));
  const jsonLd = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'Dataset', '@id': 'https://doi.org/' + doi, name: 'Wrong About You: what five AI engines state about 70 software vendors (Version 1.0)', description: `${t.statements} engine statements from ${t.answers} Absence Index release 2026-09 answers about 70 vendors, each classed true, wrong, stale or unverifiable against the vendor's own pages, with causing page, runs stated and review state.`, creator: { '@type': 'Organization', name: 'Broadcastwell', url: 'https://broadcastwell.com' }, publisher: { '@type': 'Organization', name: 'Broadcastwell', url: 'https://broadcastwell.com' }, datePublished: date, version: '1.0', license: 'https://creativecommons.org/licenses/by/4.0/', url: PAGE, sameAs: [REPO, 'https://doi.org/' + doi], isBasedOn: 'https://doi.org/10.5281/zenodo.22907695', distribution: [{ '@type': 'DataDownload', encodingFormat: 'application/pdf', contentUrl: PDF }], isAccessibleForFree: true, keywords: ['AI search', 'B2B software', 'Absence Index'] },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Research', item: 'https://broadcastwell.com/research' }, { '@type': 'ListItem', position: 2, name: 'Wrong About You', item: PAGE }] }
  ] };
  const CSS = '.way-study{max-width:1000px;margin:0 auto;padding:76px 24px 84px;color:#101828;line-height:1.7;overflow-wrap:anywhere}.way-study h1{font-size:clamp(34px,4vw,54px);line-height:1.13;letter-spacing:-.045em;font-weight:650;max-width:950px;margin:24px 0}.way-study h2{font-size:28px;line-height:1.25;letter-spacing:-.025em;margin:48px 0 18px;padding-bottom:12px;border-bottom:2px solid #3B82F6}.way-study p,.way-study li{font-size:17px;margin:0 0 22px}.way-study .way-meta{font-size:15px;color:#475467}.way-study a{color:#1D4ED8;text-decoration:underline;text-underline-offset:3px}.way-study a:focus-visible,.way-study input:focus-visible{outline:3px solid #3B82F6;outline-offset:4px}.way-links{display:flex;flex-wrap:wrap;gap:16px 34px;font-size:14px}.way-heads{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;margin:32px 0}.way-heads div{background:#EFF4FF;border-top:2px solid #3B82F6;padding:18px}.way-heads strong{display:block;font-size:34px;color:#1D4ED8;letter-spacing:-.03em}.way-heads span{font-size:14px;color:#475467}.way-lookup{background:#F5F8FF;border:1px solid #D5DDE8;padding:20px;margin:28px 0}.way-lookup label{display:block;font-weight:600;margin-bottom:8px}.way-lookup input{width:100%;max-width:520px;min-height:44px;padding:10px 12px;border:1px solid #9DB2D6;border-radius:8px;font:inherit}.way-lookup ul{list-style:none;padding:0;margin:12px 0 0}.way-lookup li{margin:6px 0;font-size:16px}.way-buy{display:inline-block;margin:8px 0 24px;padding:12px 20px;border:2px solid #1D4ED8;border-radius:10px;background:#1D4ED8;color:#fff!important;font-weight:600;text-decoration:none}.way-table{width:100%;margin:24px 0 34px;overflow-x:auto}.way-table table{width:100%;border-collapse:collapse;font-size:14px}.way-table th{background:#EFF6FF;text-align:left}.way-table th,.way-table td{padding:12px 10px;border-bottom:1px solid #D5DDE8;vertical-align:top;overflow-wrap:anywhere}@media(max-width:810px){.way-study{padding-top:46px}.way-study h1{font-size:40px}.way-heads{grid-template-columns:1fr}}@media(max-width:600px){.way-study{padding:32px 20px 48px}.way-study h1{font-size:32px}.way-study p,.way-study li{font-size:16px}.way-table table,.way-table tbody{display:block}.way-table thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}.way-table tr{display:block;padding:10px 0;border-top:1px solid #3B82F6;margin:14px 0}.way-table td{display:grid;grid-template-columns:43% 1fr;gap:14px;padding:9px 4px;font-size:14px}.way-table td:before{content:attr(data-label);font-weight:600;color:#475467}}';
  const heads = [[t.wrong + t.stale, 'statements classed wrong or stale', `of ${t.true + t.wrong + t.stale} verifiable, ${t.wrong_or_stale_rate.pct.toFixed(1)} percent (${t.wrong_or_stale_rate.low.toFixed(1)} to ${t.wrong_or_stale_rate.high.toFixed(1)})`], [t.answers_with_wrong_or_stale.k, 'answers with at least one', `of ${t.answers} answers, ${t.answers_with_wrong_or_stale.pct.toFixed(1)} percent (${t.answers_with_wrong_or_stale.low.toFixed(1)} to ${t.answers_with_wrong_or_stale.high.toFixed(1)})`], [t.statements, 'engine statements classed', `${t.true} true, ${t.unverifiable} unverifiable`]];
  return `import * as React from "react"
import { Page } from "./Kit.tsx"
/** @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 * @framerIntrinsicWidth 1200 */
const TITLE=${JSON.stringify('Wrong About You: what five AI engines state about 70 software vendors')}
const DOI=${JSON.stringify(doi)}
const PDF=${JSON.stringify(PDF)}
const CSS=${JSON.stringify(CSS)}
const BODY=${JSON.stringify(html)}
const HEADS=${JSON.stringify(heads)}
const VENDORS=${JSON.stringify(lookup)}
const JSON_LD=${JSON.stringify(JSON.stringify(jsonLd))}

function Lookup() {
 const [q, setQ] = React.useState("")
 const needle = q.trim().toLowerCase()
 const hits = needle.length < 2 ? [] : VENDORS.filter(x => (x.v + " " + x.c).toLowerCase().includes(needle)).slice(0, 12)
 return <div className="way-lookup" role="search"><label htmlFor="way-q">Find a vendor or a category</label><input id="way-q" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="For example Procore, or dental" autoComplete="off" /><ul aria-live="polite">{hits.map(h => <li key={h.u}><a href={h.u}>{h.v}</a>, {h.c}</li>)}{needle.length >= 2 && !hits.length ? <li>No vendor in this study matches.</li> : null}</ul></div>
}

export default function WrongAboutYou() {
 return <Page pagePath="/research/wrong-about-you" pageName="Wrong About You" footerVariant="research" jsonLd={JSON_LD}>
  <style suppressHydrationWarning dangerouslySetInnerHTML={{__html:CSS}} />
  <article className="way-study">
   <nav className="way-links" aria-label="Study resources"><a href="/research">All research</a><a href={PDF}>Download PDF</a><a href={"https://doi.org/"+DOI}>Dataset and DOI</a><a href="/methodology#record-rules">Every figure comes from the published method, v1.1.</a><a href="/set-the-record">Set the Record</a></nav>
   <h1>{TITLE}</h1><p className="way-meta">{"Broadcastwell Research, Study 6, ${dateText(date)}, CC BY 4.0, DOI "+DOI}</p>
   <p className="way-meta">${BYLINE}</p><p>${esc(METHOD_LINE)}</p>
   <div className="way-heads">{HEADS.map((h, i) => <div key={i}><strong>{h[0]}</strong><span>{h[1]}</span><br/><span>{h[2]}</span></div>)}</div>
   <Lookup />
   <a className="way-buy" href="/buy/record-check">Get the Record Check for your company, $490</a>
   <div dangerouslySetInnerHTML={{__html:BODY}} />
  </article>
 </Page>
}
`;
}

const check = (name, text) => { if (/[^\x00-\x7F]/.test(text)) throw new Error(name + ': non-ASCII'); if (DASHES.test(text.replace(/--[a-z-]+/g, ''))) throw new Error(name + ': dash'); return text; };
const md = check('markdown', markdown());
for (const d of ['docs/research', 'docs/assets/research/study6', 'framer']) mkdirSync(join(outDir, d), { recursive: true });
writeFileSync(join(outDir, 'docs/assets/research/study6/Study6_Wrong_About_You_2026-10.md'), md);
writeFileSync(join(outDir, 'docs/research/study6-wrong-about-you.md'), check('docs page', docsPage(md)));
writeFileSync(join(outDir, 'framer/WrongAboutYou.tsx'), check('Framer page', framer(md)));
console.log('pages built in', outDir);
