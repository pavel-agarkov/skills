import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const SKILLS_REL_DIR = '.agents/skills';

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Project-relative manifest path (forward slashes) to an absolute OS path. */
export function absPath(cwd, rel) {
  return join(cwd, ...rel.split('/'));
}

function hashOnDisk(abs) {
  try {
    if (!statSync(abs).isFile()) return 'not-a-file';
  } catch {
    return null;
  }
  return sha256(readFileSync(abs));
}

/** Remove empty directories upward from `rel`'s parent, never leaving `.agents/skills` itself deleted unless empty. */
function pruneEmptyDirs(cwd, rel) {
  let dir = rel.split('/').slice(0, -1).join('/');
  while (dir.startsWith(`${SKILLS_REL_DIR}/`) || dir === SKILLS_REL_DIR) {
    const abs = absPath(cwd, dir);
    try {
      if (readdirSync(abs).length > 0) return;
      rmdirSync(abs);
    } catch {
      return;
    }
    dir = dir.split('/').slice(0, -1).join('/');
  }
}

/**
 * Make the disk match the resolved skill set.
 *
 * Only paths recorded in the previous manifest may be deleted or overwritten, and only when the
 * on-disk SHA-256 equals the recorded one. Consumer-modified files are skipped (and dropped from the
 * manifest) unless `force`. Returns the plan/result:
 *   { added, removed, updated, modified, unchanged, missing, restored, files, skills }
 * `missing` = tracked files already gone from disk that are no longer wanted (just dropped from the manifest);
 * `restored` = tracked files gone from disk that are still wanted (recreated, also listed in `added`).
 * `files` is the new manifest ({path, sha256}, sorted); with `dryRun` nothing is written.
 */
export function syncSkills({ cwd, catalog, skills, prev = null, force = false, dryRun = false }) {
  const prevFiles = new Map((prev?.installed.files ?? []).map((f) => [f.path, f.sha256]));
  const prevSkills = new Set(prev?.installed.skills ?? []);

  const desired = [];
  for (const name of skills) {
    const skill = catalog.skills.get(name);
    for (const file of skill.files) {
      const bytes = readFileSync(join(skill.dir, ...file.split('/')));
      desired.push({ skill: name, path: `${SKILLS_REL_DIR}/${name}/${file}`, bytes, sha256: sha256(bytes) });
    }
  }
  const desiredPaths = new Set(desired.map((d) => d.path));

  // Collisions: a target skill dir that exists but is not ours.
  if (!force) {
    const collisions = skills.filter((name) => {
      if (prevSkills.has(name)) return false;
      return existsSync(absPath(cwd, `${SKILLS_REL_DIR}/${name}`));
    });
    if (collisions.length > 0) {
      throw new Error(
        `${collisions.map((n) => `${SKILLS_REL_DIR}/${n}`).join(', ')} already exist${collisions.length === 1 ? 's' : ''} and ` +
          `${collisions.length === 1 ? 'was' : 'were'} not installed by this package. Move or rename ` +
          `${collisions.length === 1 ? 'it' : 'them'}, or re-run with --force to take over (existing files that differ are overwritten).`,
      );
    }
  }

  const result = { added: [], removed: [], updated: [], modified: [], unchanged: [], missing: [], restored: [], files: [], skills: [...skills] };
  const manifest = new Map();

  for (const d of desired) {
    const abs = absPath(cwd, d.path);
    const disk = hashOnDisk(abs);
    const recorded = prevFiles.get(d.path);
    const write = (bucket) => {
      result[bucket].push(d.path);
      if (!dryRun) {
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, d.bytes);
      }
      manifest.set(d.path, d.sha256);
    };

    if (disk === null) {
      if (recorded !== undefined) result.restored.push(d.path);
      write('added');
    } else if (disk === d.sha256) {
      // Already what we want (unchanged, or an identical consumer copy we adopt).
      result.unchanged.push(d.path);
      manifest.set(d.path, d.sha256);
    } else if (recorded !== undefined && disk === recorded) {
      write('updated');
    } else if (force) {
      write('updated');
    } else {
      // Consumer-modified (or a pre-existing consumer file): keep it, warn, do not track it.
      result.modified.push(d.path);
    }
  }

  // Previously installed files that are no longer wanted.
  for (const [path, recorded] of prevFiles) {
    if (desiredPaths.has(path)) continue;
    const abs = absPath(cwd, path);
    const disk = hashOnDisk(abs);
    if (disk === null) {
      result.missing.push(path);
      continue;
    }
    if (disk === recorded) {
      result.removed.push(path);
      if (!dryRun) {
        rmSync(abs);
        pruneEmptyDirs(cwd, path);
      }
    } else {
      result.modified.push(path);
    }
  }

  for (const key of ['added', 'removed', 'updated', 'modified', 'unchanged']) result[key].sort();
  result.files = [...manifest]
    .map(([path, hash]) => ({ path, sha256: hash }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return result;
}
