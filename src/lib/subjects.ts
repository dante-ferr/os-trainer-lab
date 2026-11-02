import type { Algorithm, Fit, PublicQuestion, Question, Topic } from './types.ts';

export type SecondarySubject = Algorithm | Fit | 'FIFO' | 'LRU';
export const subjects: Record<Topic, { id: SecondarySubject; description: string; }[]> = {
  scheduling: [
    { id: 'FCFS', description: 'First Come, First Served' },
    { id: 'SJF', description: 'Shortest Job First · nonpreemptive' },
    { id: 'SRTF', description: 'Shortest Remaining Time First' },
    { id: 'RR', description: 'Round Robin · time-sliced' },
    { id: 'EDF', description: 'Earliest Deadline First · time-sliced' },
  ],
  paging: [
    { id: 'FIFO', description: 'Evict the page loaded first' },
    { id: 'LRU', description: 'Evict the least recently used page' },
  ],
  allocation: [
    { id: 'First Fit', description: 'First sufficient free block' },
    { id: 'Next Fit', description: 'Continue from the last allocation' },
    { id: 'Best Fit', description: 'Smallest sufficient free block' },
    { id: 'Worst Fit', description: 'Largest sufficient free block' },
  ],
};

export function isSubject(topic: Topic, value: unknown): value is SecondarySubject {
  return subjects[topic].some(subject => subject.id === value);
}
export function questionSubject(q: Question | PublicQuestion): SecondarySubject {
  if (q.meta.topic === 'scheduling') return q.scheduling!.config.algorithm;
  if (q.meta.topic === 'paging') return q.paging!.config.replacement;
  return q.allocation!.config.algorithm;
}
export function questionLabel(q: Question | PublicQuestion): string {
  return `${questionSubject(q)} · ${String(q.meta.index ?? 1).padStart(2, '0')}`;
}
export function subjectKey(topic: Topic, subject: SecondarySubject): string {
  return `${topic}:${subject}`;
}

/** Index each secondary subject independently. Unsaved questions need no disk counter. */
export function nextQuestionIndex(questions: (Question | PublicQuestion)[], topic: Topic, subject: SecondarySubject): number {
  return Math.max(0, ...questions.filter(q => q.meta.topic === topic && questionSubject(q) === subject).map(q => q.meta.index ?? 0)) + 1;
}

/** Give older imported files stable labels without rewriting their saved answers.
 * Explicit indices are reserved first; missing/duplicate indices follow file order. */
export function labelQuestionLibrary(questions: Question[]): Question[] {
  const used = new Set<string>();
  const labeled = questions.map(q => {
    const key = `${subjectKey(q.meta.topic, questionSubject(q))}:${q.meta.index}`;
    const index = q.meta.index && !used.has(key) ? q.meta.index : undefined;
    if (index) used.add(key);
    return { ...q, meta: { ...q.meta, index } };
  });
  for (const q of labeled) {
    if (q.meta.index === undefined) {
      const key = subjectKey(q.meta.topic, questionSubject(q));
      let index = 1;
      while (used.has(`${key}:${index}`)) index++;
      q.meta.index = index;
      used.add(`${key}:${index}`);
    }
    q.meta.title = questionLabel(q);
  }
  return labeled;
}
