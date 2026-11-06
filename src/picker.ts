import { createInterface } from 'node:readline/promises';
import type { Catalog } from './catalog.ts';

/**
 * Numbered readline picker. Accepts numbers, skill names or `tag:<name>`, separated by commas/spaces.
 * Returns { skills, tags } (explicit selections). Unknown entries throw so nothing is installed by guesswork.
 */
export async function pickSelection(
  catalog: Catalog,
  {
    input = process.stdin,
    output = process.stdout,
    preselected = [],
  }: { input?: NodeJS.ReadableStream; output?: NodeJS.WritableStream; preselected?: string[] } = {},
): Promise<{ skills: string[]; tags: string[] }> {
  const names = [...catalog.skills.keys()];
  const chosen = new Set(preselected);
  output.write('Available skills:\n');
  names.forEach((name, i) => {
    const s = catalog.skills.get(name)!;
    output.write(`  ${String(i + 1).padStart(2)}. ${chosen.has(name) ? '[x]' : '[ ]'} ${name}  [${s.tags.join(', ')}]\n`);
  });
  output.write(`Tags: ${[...catalog.tags.keys()].sort().join(', ')}\n`);
  const rl = createInterface({ input, output });
  let answer: string;
  try {
    answer = await rl.question('Enter numbers, skill names or tag:<name> (comma-separated): ');
  } finally {
    rl.close();
  }
  const skills: string[] = [];
  const tags: string[] = [];
  for (const token of answer.split(/[,\s]+/).filter((t) => t !== '')) {
    if (/^\d+$/.test(token)) {
      const name = names[Number(token) - 1];
      if (!name) throw new Error(`no skill numbered ${token}`);
      skills.push(name);
    } else if (token.startsWith('tag:')) {
      tags.push(token.slice(4));
    } else {
      skills.push(token);
    }
  }
  return { skills, tags };
}
