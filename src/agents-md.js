import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS } from './agents.js';

export const BEGIN_MARKER = '<!-- BEGIN @pavel-agarkov/skills -->';
export const END_MARKER = '<!-- END @pavel-agarkov/skills -->';
export const AGENTS_MD = 'AGENTS.md';

function eolOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/** The block text (markers included, no trailing newline). `skills` is [{name, description}]. */
export function renderBlock(skills, eol = '\n') {
  const lines = [BEGIN_MARKER, '## Skills', ''];
  for (const s of skills) {
    lines.push(`- **${s.name}**: ${s.description} (\`${AGENTS.universal.skillsDir}/${s.name}/SKILL.md\`)`);
  }
  lines.push(END_MARKER);
  return lines.join(eol);
}

/** Locate the block. Returns null when no markers exist; throws on an unpaired or repeated marker. */
function findBlock(text) {
  const count = (marker) => text.split(marker).length - 1;
  const begins = count(BEGIN_MARKER);
  const ends = count(END_MARKER);
  if (begins === 0 && ends === 0) return null;
  if (begins !== 1 || ends !== 1) {
    throw new Error(
      `${AGENTS_MD} has an unpaired or repeated skills marker (${begins}x BEGIN, ${ends}x END). ` +
        `Make sure exactly one "${BEGIN_MARKER}" is followed by one "${END_MARKER}", then retry; ${AGENTS_MD} was not changed.`,
    );
  }
  const start = text.indexOf(BEGIN_MARKER);
  const endAt = text.indexOf(END_MARKER);
  if (endAt < start) {
    throw new Error(`${AGENTS_MD} has the END skills marker before the BEGIN marker. Fix the order and retry; ${AGENTS_MD} was not changed.`);
  }
  return { start, end: endAt + END_MARKER.length };
}

/**
 * Write or refresh the skills index block. Text outside the markers is preserved byte-for-byte.
 * `createdFile` is the previous recorded flag (stays true once we created the file).
 * Returns { present: true, createdFile, action: 'create' | 'append' | 'update' | 'none' }.
 */
export function applyBlock({ cwd, skills, createdFile = false, dryRun = false }) {
  const file = join(cwd, AGENTS_MD);
  const exists = existsSync(file);
  if (!exists) {
    if (!dryRun) writeFileSync(file, `${renderBlock(skills)}\n`);
    return { present: true, createdFile: true, action: 'create' };
  }
  const text = readFileSync(file, 'utf8');
  const eol = eolOf(text);
  const found = findBlock(text);
  const block = renderBlock(skills, eol);
  let next;
  let action;
  if (found) {
    next = text.slice(0, found.start) + block + text.slice(found.end);
    action = next === text ? 'none' : 'update';
  } else {
    const sep = text === '' ? '' : text.endsWith('\n') ? eol : eol + eol;
    next = `${text}${sep}${block}${eol}`;
    action = 'append';
  }
  if (action !== 'none' && !dryRun) writeFileSync(file, next);
  return { present: true, createdFile, action };
}

/**
 * Remove the block and the blank line it introduced. Deletes the file only when we created it and
 * nothing else remains. Returns { action: 'remove' | 'delete' | 'none' }.
 */
export function removeBlock({ cwd, createdFile = false, dryRun = false }) {
  const file = join(cwd, AGENTS_MD);
  if (!existsSync(file)) return { action: 'none' };
  const text = readFileSync(file, 'utf8');
  const found = findBlock(text);
  if (!found) return { action: 'none' };
  const eol = eolOf(text);
  let before = text.slice(0, found.start);
  let after = text.slice(found.end);
  if (after.startsWith(eol)) after = after.slice(eol.length);
  if (after === '' && before.endsWith(eol + eol)) before = before.slice(0, -eol.length);
  const next = before + after;
  if (createdFile && next.trim() === '') {
    if (!dryRun) rmSync(file);
    return { action: 'delete' };
  }
  if (!dryRun) writeFileSync(file, next);
  return { action: 'remove' };
}
