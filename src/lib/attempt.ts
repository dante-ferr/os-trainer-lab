import type { Answers } from './types.ts';

/** Empty cells and cleared fields have the same meaning as untouched fields.
 * Compare content, not object insertion order, so undoing an edit clears dirty state. */
export function answersChanged(current: Answers, saved: Answers = {}): boolean {
  const normalize = (answers: Answers) => JSON.stringify(Object.entries(answers)
    .filter(([, value]) => value !== '')
    .sort(([a], [b]) => a.localeCompare(b)));
  return normalize(current) !== normalize(saved);
}
