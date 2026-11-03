import type { Answers, Check, Grade, Question } from './types.ts';

/** Comma-separated history such as "0, 2, -1". Empty input means an unused row. */
export function parseHistory(value: string): number[] | null {
  const trimmed = value.trim();
  if (trimmed === '') return [];
  const parts = trimmed.split(',').map(part => part.trim());
  if (parts.some(part => part === '' || !/^-?\d+$/.test(part))) return null;
  return parts.map(Number);
}

export function formatHistory(values: number[]): string {
  return values.join(', ');
}

/** Every cell/field has equal weight. Only the arithmetic mean permits two-decimal roundoff. */
export function gradeQuestion(q: Question, answers: Answers): Grade {
  const checks: Check[] = [];
  const check = (key: string, label: string, expected: string | number) => {
    const actual = typeof answers[key] === 'string' ? answers[key].trim() : '';
    const correct = typeof expected === 'number'
      ? actual !== '' && Number.isFinite(Number(actual)) && Math.abs(Number(actual) - expected) <= (key === 'response.mean' ? 0.005 : 0)
      : actual === expected;
    checks.push({ key, label, actual, expected: String(expected), correct });
  };
  const checkHistory = (key: string, label: string, expected: number[]) => {
    const actual = typeof answers[key] === 'string' ? answers[key] : '';
    const parsed = parseHistory(actual);
    const correct = parsed !== null && parsed.length === expected.length && parsed.every((n, i) => n === expected[i]);
    checks.push({ key, label, actual: actual.trim(), expected: formatHistory(expected), correct });
  };
  if (q.scheduling && q.meta.topic === 'scheduling') {
    for (const [id, cells] of Object.entries(q.scheduling.solution.timeline)) cells.forEach((cell, t) => check(`cell.${id}.${t}`, `${id} at t=${t}`, cell));
    for (const [id, value] of Object.entries(q.scheduling.solution.response_times)) check(`response.${id}`, id === 'mean' ? 'Average response time' : `${id} response time`, value);
  } else if (q.paging && q.meta.topic === 'paging') {
    const { frames_history, page_history, offset, vpn, pfn, page_size, frame_count, page_faults } = q.paging.solution;
    for (const [key, value] of Object.entries({ offset, vpn, pfn, page_size, frame_count, page_faults })) {
      check(`paging.${key}`, key.replaceAll('_', ' '), value);
    }
    frames_history.forEach((row, frame) => checkHistory(`frames.${frame}`, `Frame ${frame} history`, row));
    for (const [vpn, row] of Object.entries(page_history)) checkHistory(`table.${vpn}`, `VPN ${vpn} history`, row);
  } else if (q.allocation) {
    q.allocation.solution.assignments.forEach((block, i) => check(`assignment.${i}`, `Request ${i + 1} block (0-based)`, block));
    q.allocation.solution.remaining.forEach((size, i) => check(`remaining.${i}`, `Block ${i + 1} remaining KiB`, size));
  }
  const correct = checks.filter(c => c.correct).length;
  return { score: Math.round(correct / checks.length * 100), correct, total: checks.length, checks };
}
