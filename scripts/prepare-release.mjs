// Recompute the joined evidence and repository metadata without inventing a DOI.
import { readFileSync, writeFileSync } from 'node:fs';
import { readDerived } from '../analysis/index-record.mjs';
import { exportEvidence } from './export-surfaces.mjs';

const doc = exportEvidence(readDerived('data'), { savedResults: JSON.parse(readFileSync('results/summary.json', 'utf8')) });
writeFileSync('results/flagged_statements.json', JSON.stringify(doc, null, 1) + '\n');
const metadata = JSON.parse(readFileSync('.zenodo.json', 'utf8'));
metadata.description = `${doc.study.byline}. ${doc.study.method} ${doc.study.dispute} The dataset includes each flagged engine statement with its verbatim source observations, vendor page proof, run confidence, category median and actual review state. Classifications, method and code are licensed CC BY 4.0.`;
writeFileSync('.zenodo.json', JSON.stringify(metadata, null, 2) + '\n');
console.log(`${doc.vendors.length} vendors and ${doc.vendors.reduce((n, v) => n + v.items_total, 0)} flagged engine statements prepared; no DOI assigned`);
