import type { Answers, Check, Grade, Question } from './types.ts';

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
  if (q.scheduling && q.meta.topic === 'scheduling') {
    for (const [id, cells] of Object.entries(q.scheduling.solution.timeline)) cells.forEach((cell, t) => check(`cell.${id}.${t}`, `${id} at t=${t}`, cell));
    for (const [id, value] of Object.entries(q.scheduling.solution.response_times)) check(`response.${id}`, id === 'mean' ? 'Average response time' : `${id} response time`, value);
  } else if (q.paging && q.meta.topic === 'paging') {
    const { mappings, ...metrics } = q.paging.solution;
    for (const [key, value] of Object.entries(metrics)) check(`paging.${key}`, key.replaceAll('_', ' '), value);
    for (const [vpn, mapping] of Object.entries(mappings)) {
      check(`mapping.${vpn}.valid`, `VPN ${vpn}: present bit`, mapping.valid);
      check(`mapping.${vpn}.frame`, `VPN ${vpn}: frame`, mapping.frame);
    }
  } else if (q.allocation) {
    q.allocation.solution.assignments.forEach((block, i) => check(`assignment.${i}`, `Request ${i + 1} block (0-based)`, block));
    q.allocation.solution.remaining.forEach((size, i) => check(`remaining.${i}`, `Block ${i + 1} remaining KiB`, size));
  }
  const correct = checks.filter(c => c.correct).length;
  return { score: Math.round(correct / checks.length * 100), correct, total: checks.length, checks };
}
