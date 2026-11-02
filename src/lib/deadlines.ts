import type { Process } from './types.ts';

/** The dataset deadline is a duration measured from this process's arrival. */
export function absoluteDeadline(process: Process): number {
  return process.arrival + process.deadline;
}
