import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const TAG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function unquote(value) {
  const v = value.trim();
  if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/** Parse the minimal frontmatter subset: scalars, `>`/`|` block scalars, inline lists. */
export function parseFrontmatter(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0].trim() !== '---') return {};
  const end = lines.indexOf('---', 1);
  if (end === -1) return {};
  const data = {};
  for (let i = 1; i < end; i++) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const [, key, rest] = m;
    const value = rest.trim();
    if (/^[>|][+-]?$/.test(value)) {
      const folded = value[0] === '>';
      const block = [];
      while (i + 1 < end && (lines[i + 1].trim() === '' || /^\s/.test(lines[i + 1]))) {
        block.push(lines[++i].trim());
      }
      data[key] = folded ? block.join(' ').replace(/\s+/g, ' ').trim() : block.join('\n').trim();
    } else if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1).trim();
      data[key] = inner === '' ? [] : inner.split(',').map((s) => unquote(s));
    } else {
      data[key] = unquote(value);
    }
  }
  return data;
}

function listFiles(dir, base = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(join(dir, entry.name), rel));
    else out.push(rel);
  }
  return out.sort();
}

export function loadCatalog(root) {
  const skillsDir = join(root, 'dist', 'skills');
  const skills = new Map();
  const tags = new Map();
  const folders = readdirSync(skillsDir)
    .filter((n) => statSync(join(skillsDir, n)).isDirectory())
    .sort();
  for (const folder of folders) {
    const dir = join(skillsDir, folder);
    const fm = parseFrontmatter(readFileSync(join(dir, 'SKILL.md'), 'utf8'));
    if (typeof fm.name !== 'string' || fm.name === '') {
      throw new Error(`${folder}: missing "name" in SKILL.md frontmatter`);
    }
    if (fm.name !== folder) {
      throw new Error(`${folder}: frontmatter name "${fm.name}" differs from folder name`);
    }
    if (typeof fm.description !== 'string' || fm.description === '') {
      throw new Error(`${folder}: missing "description" in SKILL.md frontmatter`);
    }
    if (!Array.isArray(fm.tags) || fm.tags.length === 0) {
      throw new Error(`${folder}: missing "tags" in SKILL.md frontmatter`);
    }
    for (const tag of fm.tags) {
      if (!TAG_RE.test(tag)) throw new Error(`${folder}: invalid tag "${tag}" (use lowercase kebab-case)`);
    }
    const skillTags = [...new Set(fm.tags)];
    skills.set(fm.name, { name: fm.name, description: fm.description, tags: skillTags, dir, files: listFiles(dir) });
    for (const tag of skillTags) {
      if (!tags.has(tag)) tags.set(tag, []);
      tags.get(tag).push(fm.name);
    }
  }
  return { skills, tags };
}
