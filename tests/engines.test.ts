import { test } from 'node:test';
import assert from 'node:assert/strict';
import { schedule, page, allocate } from '../src/lib/engines.ts';
import { parseToml } from '../src/lib/toml.ts';
import { generateQuestion, serializeQuestion, validateQuestion } from '../src/lib/questions.ts';
import { gradeQuestion } from '../src/lib/grading.ts';

const process = (id: string, arrival: number, duration: number, deadline = 20) => ({ id, arrival, duration, deadline });
test('natural completion immediately dispatches the next process without overhead', () => {
  const s = schedule({ algorithm: 'RR', quantum: 2, overhead: 1, processes: [process('A', 0, 2), process('B', 1, 1)] });
  assert.deepEqual(s.timeline.A, ['■', '■', '']);
  assert.deepEqual(s.timeline.B, ['', '•', '■']);
  assert.deepEqual(s.response_times, { A: 2, B: 2, mean: 2 });
});
test('RR charges outgoing overhead, admits arrivals during overhead, then rotates', () => {
  const s = schedule({ algorithm: 'RR', quantum: 2, overhead: 1, processes: [process('A', 0, 3), process('B', 2, 1)] });
  assert.deepEqual(s.timeline.A, ['■', '■', 'X', '•', '■']);
  assert.deepEqual(s.timeline.B, ['', '', '•', '■', '']);
});
test('EDF finishes the quantum before an earlier deadline runs, and slices even a lone process', () => {
  const s = schedule({ algorithm: 'EDF', quantum: 2, overhead: 1, processes: [process('A', 0, 3, 20), process('B', 1, 1, 10)] });
  assert.deepEqual(s.timeline.A, ['■', '■', 'X', '•', '■']);
  assert.deepEqual(s.timeline.B, ['', '•', '•', '■', '']);
  assert.deepEqual(s.response_times, { A: 5, B: 3, mean: 4 });
  const lone = schedule({ algorithm: 'EDF', quantum: 2, overhead: 1, processes: [process('A', 0, 3)] });
  assert.deepEqual(lone.timeline.A, ['■', '■', 'X', '■']);
});
test('idle periods and SRTF remaining-time preemption are represented', () => {
  const s = schedule({ algorithm: 'SRTF', quantum: 2, overhead: 1, processes: [process('A', 2, 4), process('B', 3, 1)] });
  assert.deepEqual(s.timeline.A, ['', '', '■', 'X', '•', '■', '■', '■']);
  assert.equal(s.response_times.B, 2);
});
test('FIFO and LRU differ after a hit, using the same VA/PA offset', () => {
  const c = { virtual_bits: 8, physical_bits: 5, offset_bits: 4, references: [0, 1, 0, 2, 0] };
  const fifo = page({ ...c, replacement: 'FIFO' });
  const lru = page({ ...c, replacement: 'LRU' });
  assert.equal(fifo.page_faults, 4); assert.equal(lru.page_faults, 3);
  assert.equal(lru.offset, 4); assert.equal(lru.vpn, 4); assert.equal(lru.pfn, 1);
  assert.deepEqual(lru.mappings['1'], { frame: -1, valid: 0 });
  assert.deepEqual(fifo.frames_history, [[0, 0, 0, 2, 2], [-1, 1, 1, 1, 0]]);
  assert.deepEqual(fifo.page_history, { '0': [0, 0, 0, -1, 1], '1': [-1, 1, 1, 1, -1], '2': [-1, -1, -1, 0, 0] });
  assert.deepEqual(lru.frames_history, [[0, 0, 0, 0, 0], [-1, 1, 1, 2, 2]]);
  assert.deepEqual(lru.page_history, { '0': [0, 0, 0, 0, 0], '1': [-1, 1, 1, -1, -1], '2': [-1, -1, -1, 1, 1] });
});
test('fit strategies split holes and leave failed requests unchanged', () => {
  const c = { blocks: [100, 500, 200, 300, 600], requests: [212, 417, 112, 426] };
  assert.deepEqual(allocate({ ...c, algorithm: 'First Fit' }).assignments, [1, 4, 1, -1]);
  assert.deepEqual(allocate({ ...c, algorithm: 'Best Fit' }).assignments, [3, 1, 2, 4]);
  assert.deepEqual(allocate({ ...c, algorithm: 'Worst Fit' }).assignments, [4, 1, 4, -1]);
  assert.deepEqual(allocate({ ...c, algorithm: 'Next Fit' }).assignments, [1, 4, 4, -1]);
  assert.deepEqual(allocate({ blocks: [100, 80], requests: [70, 50, 30], algorithm: 'Next Fit' }).assignments, [0, 1, 1]);
});
test('all randomized topics round-trip through TOML and validate their keys', () => {
  for (const topic of ['scheduling', 'paging', 'allocation'] as const) for (let n = 0; n < 25; n++) {
    const q = generateQuestion(topic);
    assert.deepEqual(JSON.parse(JSON.stringify(validateQuestion(parseToml(serializeQuestion(q))))), q);
  }
});
test('parser handles comments, quoted dotted keys, arrays and rejects duplicates', () => {
  const t = parseToml('[meta]\nid = "hi#there" # comment\narray = [1,\n 2,]\nmap = { "A" = ["■", "X"] }\n');
  assert.equal((t.meta as Record<string, unknown>).id, 'hi#there');
  assert.throws(() => parseToml('a = 1\na = 2'), /Duplicate/);
  assert.throws(() => parseToml('a = [1 2]'), /comma/);
});
test('grade is exact for states, numeric-tolerant, and never credits blank numeric fields', () => {
  const q = generateQuestion('paging');
  const first = gradeQuestion(q, {});
  assert.equal(first.correct, 0);
  const answers = Object.fromEntries(first.checks.map(c => [c.key, c.expected]));
  assert.equal(gradeQuestion(q, answers).score, 100);
  answers['paging.offset'] = '999';
  const wrong = gradeQuestion(q, answers);
  assert.equal(wrong.checks.find(c => c.key === 'paging.offset')!.correct, false);
  assert.ok(wrong.correct < wrong.total);
});
test('reject inconsistent ground truth and excessive config sizes', () => {
  const q = generateQuestion('paging'); q.paging!.solution.offset = 99;
  assert.throws(() => validateQuestion(q), /Ground-truth/);
  q.paging!.config.physical_bits = 32;
  assert.throws(() => validateQuestion(q), /frames/);
});

test('integer answer fields are exact while mean response accepts decimal rounding', () => {
  const paging = generateQuestion('paging');
  const pAnswers = Object.fromEntries(gradeQuestion(paging, {}).checks.map(c => [c.key, c.expected]));
  pAnswers['paging.offset'] = String(paging.paging!.solution.offset + 0.001);
  assert.equal(gradeQuestion(paging, pAnswers).checks.find(c => c.key === 'paging.offset')!.correct, false);
  const q = generateQuestion('scheduling');
  const answers = Object.fromEntries(gradeQuestion(q, {}).checks.map(c => [c.key, c.expected]));
  answers['response.mean'] = String(q.scheduling!.solution.response_times.mean + 0.004);
  assert.equal(gradeQuestion(q, answers).score, 100);
});


test('EDF dispatch compares arrival plus deadline, not raw relative deadlines', () => {
  const s = schedule({
    algorithm: 'EDF', quantum: 2, overhead: 1, processes: [
      process('A', 0, 6, 8), // Due at 8.
      process('B', 2, 1, 7), // Due at 9 despite a smaller relative deadline.
    ]
  });
  assert.deepEqual(s.timeline.A, ['■', '■', 'X', '■', '■', 'X', '■', '■', '']);
  assert.deepEqual(s.timeline.B, ['', '', '•', '•', '•', '•', '•', '•', '■']);
  assert.deepEqual(s.response_times, { A: 8, B: 7, mean: 7.5 });
});

test('equal arrival-adjusted due times do not trigger priority preemption', () => {
  const s = schedule({
    algorithm: 'EDF', quantum: 10, overhead: 1, processes: [
      process('A', 0, 4, 8),
      process('B', 1, 1, 7), // Both due at 8; A keeps the CPU.
    ]
  });
  assert.deepEqual(s.timeline.A, ['■', '■', '■', '■', '']);
  assert.deepEqual(s.timeline.B, ['', '•', '•', '•', '■']);
});

test('an earlier arrival-adjusted due time waits until the current quantum ends', () => {
  const s = schedule({
    algorithm: 'EDF', quantum: 4, overhead: 1, processes: [
      process('A', 0, 6, 20), // Due at 20.
      process('B', 1, 1, 5), // Due at 6, but A keeps the CPU for the full quantum.
    ]
  });
  assert.deepEqual(s.timeline.A, ['■', '■', '■', '■', 'X', '•', '■', '■']);
  assert.deepEqual(s.timeline.B, ['', '•', '•', '•', '•', '■', '', '']);
  assert.deepEqual(s.response_times, { A: 8, B: 5, mean: 6.5 });
});
