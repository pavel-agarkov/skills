#!/usr/bin/env node
// Regenerates CHANGELOG.md from changelog.json, or prints one version's notes (`notes <version>`).
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadChangelog, renderMarkdown, renderNotes } from '../src/changelog.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [cmd, version] = process.argv.slice(2);

try {
  const entries = loadChangelog(root);
  if (cmd === undefined) {
    writeFileSync(join(root, 'CHANGELOG.md'), renderMarkdown(entries));
    console.log('wrote CHANGELOG.md');
  } else if (cmd === 'notes' && version) {
    const entry = entries.find((e) => e.version === version);
    if (!entry) {
      console.error(`no changelog.json entry for ${version}`);
      process.exit(1);
    }
    process.stdout.write(`${renderNotes(entry)}\n`);
  } else {
    console.error('usage: node scripts/changelog.js [notes <version>]');
    process.exit(1);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
