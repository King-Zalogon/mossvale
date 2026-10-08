import {execFileSync} from 'node:child_process';

export function changedPaths(root, base, head = 'HEAD') {
  for (const ref of [base, head])
    if (typeof ref !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(ref) || ref.startsWith('-')) throw new Error('Invalid Git reference for catalogue impact check');
  let mergeBase;
  try {
    mergeBase = execFileSync('git', ['merge-base', base, head], {cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  } catch {
    throw new Error(`Cannot establish merge base for ${base}; fetch complete integration history before checking catalogue impact.`);
  }
  const collect = args => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).split('\0').filter(Boolean);
  const paths = [
    ...collect(['diff', '--no-renames', '--name-only', '-z', mergeBase, head]),
    ...collect(['diff', '--no-renames', '--name-only', '-z', '--cached', head]),
    ...collect(['diff', '--no-renames', '--name-only', '-z']),
    ...collect(['ls-files', '--others', '--exclude-standard', '-z']),
  ];
  return [...new Set(paths)].sort();
}

export function needsCatalogueReview(path, referencedPaths = new Set()) {
  return (
    referencedPaths.has(path) ||
    /^(dist\/(src\/|maps\/|assets\/)|art\/(assets\/|characters\/)|content\/(briefs\/|catalogue\/(schema|templates|curated|examples)\.json)|scripts\/(lib\/(catalogue|catalogue-impact)|catalogue|check-catalogue-impact|compile-brief|pack|art-jobs|composition-briefs|bake-terrain-family)\.mjs|tests\/fixtures\/(packs|prefabs)\/)/.test(
      path,
    )
  );
}

export function validateImpact(paths, reviews, catalogue) {
  const errors = [];
  const ids = new Set(catalogue.entries.map(entry => entry.id));
  const references = new Set(catalogue.entries.flatMap(entry => entry.references));
  const relevant = paths.filter(path => needsCatalogueReview(path, references));
  const covered = new Set();
  for (const review of reviews) {
    if (review.format !== 1 || !Array.isArray(review.changes)) {
      errors.push('Impact review needs format 1 and changes array');
      continue;
    }
    for (const change of review.changes) {
      const valid =
        Array.isArray(change.paths) &&
        change.paths.length &&
        Array.isArray(change.entries) &&
        change.entries.length &&
        change.entries.every(id => ids.has(id)) &&
        ['updated', 'no-semantic-impact'].includes(change.disposition) &&
        typeof change.reason === 'string' &&
        change.reason.trim().length >= 20 &&
        Array.isArray(change.evidence) &&
        change.evidence.length;
      if (!valid) {
        errors.push('Impact review needs explicit paths, existing entry IDs, disposition, substantive reason and evidence paths');
        continue;
      }
      for (const path of change.paths) {
        if (!paths.includes(path)) {
          errors.push(`Impact review claims an unchanged path: ${path}`);
          continue;
        }
        covered.add(path);
      }
    }
  }
  for (const path of relevant)
    if (!covered.has(path)) errors.push(`${path}: add a scoped catalogue impact review; unrelated documentation edits are insufficient`);
  const catalogueUpdated = paths.some(path => /^content\/catalogue\/(catalogue|templates|curated|facts|schema|examples)\.json$/.test(path));
  for (const review of reviews)
    for (const change of review.changes ?? [])
      if (change.disposition === 'updated' && !catalogueUpdated) errors.push('An updated impact record requires an actual catalogue definition/output change');
  return errors;
}
