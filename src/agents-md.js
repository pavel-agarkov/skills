import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const BEGIN_MARKER = '<!-- BEGIN @pavel-agarkov/skills -->';
export const END_MARKER = '<!-- END @pavel-agarkov/skills -->';
export const AGENTS_MD = 'AGENTS.md';
export const CLAUDE_MD = 'CLAUDE.md';

function eolOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

/** Project-relative rules-file path (forward slashes) to an absolute OS path. */
const rulesPath = (cwd, file) => join(cwd, ...file.split('/'));

/**
 * The block text (markers included, no trailing newline). `skills` is [{name, description}]; each line points at
 * `<skillsDir>/<name>/SKILL.md`.
 */
export function renderBlock(skills, skillsDir, eol = '\n') {
  const lines = [BEGIN_MARKER, '## Skills', ''];
  for (const s of skills) {
    lines.push(`- **${s.name}**: ${s.description} (\`${skillsDir}/${s.name}/SKILL.md\`)`);
  }
  lines.push(END_MARKER);
  return lines.join(eol);
}

/** Locate the block in `file`'s text. Returns null when no markers exist; throws on an unpaired or repeated marker. */
function findBlock(text, file) {
  const count = (marker) => text.split(marker).length - 1;
  const begins = count(BEGIN_MARKER);
  const ends = count(END_MARKER);
  if (begins === 0 && ends === 0) return null;
  if (begins !== 1 || ends !== 1) {
    throw new Error(
      `${file} has an unpaired or repeated skills marker (${begins}x BEGIN, ${ends}x END). ` +
        `Make sure exactly one "${BEGIN_MARKER}" is followed by one "${END_MARKER}", then retry; ${file} was not changed.`,
    );
  }
  const start = text.indexOf(BEGIN_MARKER);
  const endAt = text.indexOf(END_MARKER);
  if (endAt < start) {
    throw new Error(`${file} has the END skills marker before the BEGIN marker. Fix the order and retry; ${file} was not changed.`);
  }
  return { start, end: endAt + END_MARKER.length };
}

/**
 * Write or refresh the skills index block in the project-relative rules file `file`. Text outside the markers is
 * preserved byte-for-byte. Only AGENTS.md may be created; any other missing file (CLAUDE.md) throws.
 * `createdFile` is the previous recorded flag (stays true once we created the file).
 * Returns { present: true, createdFile, action: 'create' | 'append' | 'update' | 'none' }.
 */
export function applyBlock({ cwd, file, skills, skillsDir, createdFile = false, dryRun = false }) {
  const abs = rulesPath(cwd, file);
  if (!existsSync(abs)) {
    if (file !== AGENTS_MD) throw new Error(`${file} does not exist; the skills block is only added to an existing ${file}`);
    if (!dryRun) writeFileSync(abs, `${renderBlock(skills, skillsDir)}\n`);
    return { present: true, createdFile: true, action: 'create' };
  }
  const text = readFileSync(abs, 'utf8');
  const eol = eolOf(text);
  const found = findBlock(text, file);
  const block = renderBlock(skills, skillsDir, eol);
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
  if (action !== 'none' && !dryRun) writeFileSync(abs, next);
  return { present: true, createdFile, action };
}

/**
 * Remove the block from the project-relative rules file `file`, and the blank line it introduced. Deletes the file
 * only when we created it and nothing else remains. Returns { action: 'remove' | 'delete' | 'none' }.
 */
export function removeBlock({ cwd, file, createdFile = false, dryRun = false }) {
  const abs = rulesPath(cwd, file);
  if (!existsSync(abs)) return { action: 'none' };
  const text = readFileSync(abs, 'utf8');
  const found = findBlock(text, file);
  if (!found) return { action: 'none' };
  const eol = eolOf(text);
  let before = text.slice(0, found.start);
  let after = text.slice(found.end);
  if (after.startsWith(eol)) after = after.slice(eol.length);
  if (after === '' && before.endsWith(eol + eol)) before = before.slice(0, -eol.length);
  const next = before + after;
  if (createdFile && next.trim() === '') {
    if (!dryRun) rmSync(abs);
    return { action: 'delete' };
  }
  if (!dryRun) writeFileSync(abs, next);
  return { action: 'remove' };
}
