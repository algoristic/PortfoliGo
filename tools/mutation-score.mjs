// Checks the mutation score over all CI shards (TS §14.4). Each shard of `verify-extended.yml`
// mutates one list of `MUTATION_SHARDS` and doesn't break on its own score; this script reads their
// `mutation.json` reports, checks that every file of the configuration was mutated exactly once and
// compares the score of all shards with `BREAK_THRESHOLD`. The score counts like Stryker's: detected
// (killed, timeout) over detected plus undetected (survived, no coverage).
import { appendFileSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { BREAK_THRESHOLD, MUTATION_SHARDS } from '../stryker.config.mjs';

const DETECTED = new Set(['Killed', 'Timeout']);
const UNDETECTED = new Set(['Survived', 'NoCoverage']);

const root = process.argv[2] ?? 'reports/shards';
const reports = readdirSync(root, { recursive: true })
  .map(String)
  .filter((path) => path.endsWith('mutation.json'))
  .sort();

const mutatedBy = new Map();
const lines = [];
let detected = 0;
let undetected = 0;
for (const report of reports) {
  const { files } = JSON.parse(readFileSync(join(root, report), 'utf8'));
  let reportDetected = 0;
  let reportUndetected = 0;
  for (const [file, { mutants }] of Object.entries(files)) {
    const path = relative('.', file);
    mutatedBy.set(path, [...(mutatedBy.get(path) ?? []), report]);
    for (const { status } of mutants) {
      if (DETECTED.has(status)) reportDetected++;
      if (UNDETECTED.has(status)) reportUndetected++;
    }
  }
  detected += reportDetected;
  undetected += reportUndetected;
  lines.push(`${report}: ${formatScore(reportDetected, reportUndetected)}`);
}

const errors = [];
for (const file of MUTATION_SHARDS.flat()) {
  const by = mutatedBy.get(file) ?? [];
  if (by.length === 0) errors.push(`not mutated by any shard: ${file}`);
  if (by.length > 1) errors.push(`mutated by several shards (${by.join(', ')}): ${file}`);
}
const total = `Mutation score of ${reports.length} shard(s): ${formatScore(detected, undetected)} (break ${BREAK_THRESHOLD} %)`;
lines.push(total);

console.log(lines.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.map((line) => `- ${line}\n`).join(''));
}
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
if (score(detected, undetected) < BREAK_THRESHOLD) {
  console.error('The mutation score is below the break threshold (TS §14.1).');
  process.exit(1);
}

function score(det, undet) {
  return det + undet === 0 ? 100 : (100 * det) / (det + undet);
}

function formatScore(det, undet) {
  return `${score(det, undet).toFixed(2)} % (${det} detected, ${undet} undetected)`;
}
