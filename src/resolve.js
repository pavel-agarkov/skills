/**
 * Turn { skills, tags } into the final ordered, deduplicated skill-name list.
 * Order follows the catalog (sorted by name). Unknown names or tags throw
 * before anything is written, listing the valid values.
 */
export function resolveSelection(catalog, { skills = [], tags = [] } = {}) {
  const unknownSkills = [...new Set(skills)].filter((n) => !catalog.skills.has(n));
  const unknownTags = [...new Set(tags)].filter((t) => !catalog.tags.has(t));
  const problems = [];
  if (unknownSkills.length > 0) {
    problems.push(`unknown skill${unknownSkills.length > 1 ? 's' : ''}: ${unknownSkills.join(', ')} (valid: ${[...catalog.skills.keys()].join(', ')})`);
  }
  if (unknownTags.length > 0) {
    problems.push(`unknown tag${unknownTags.length > 1 ? 's' : ''}: ${unknownTags.join(', ')} (valid: ${[...catalog.tags.keys()].sort().join(', ')})`);
  }
  if (problems.length > 0) throw new Error(problems.join('; '));

  const wanted = new Set(skills);
  for (const tag of tags) for (const name of catalog.tags.get(tag)) wanted.add(name);
  return [...catalog.skills.keys()].filter((n) => wanted.has(n));
}
