import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseToml } from '../src/lib/toml.ts';
import { validateQuestion } from '../src/lib/questions.ts';
import { schedule } from '../src/lib/engines.ts';

test('the supplied EDF reference loads, including its abbreviated B row', () => {
  const q = validateQuestion(parseToml(`
[meta]
id = "sched_edf_01"
title = "EDF Scheduling with Time Slicing"
topic = "scheduling"
[scheduling.config]
algorithm = "EDF"
quantum = 2
overhead = 1
processes = [
  { id = "A", arrival = 0, duration = 4, deadline = 35 },
  { id = "B", arrival = 3, duration = 2, deadline = 15 }
]
[scheduling.solution]
timeline = {
  A = ["■", "■", "X", "•", "•", "■", "■"],
  B = ["", "", "", "■", "■"]
}
response_times = { A = 7, B = 2, mean = 4.5 }
`));
  assert.deepEqual(q.scheduling!.solution.timeline.B, ['', '', '', '■', '■', '', '']);
});

test('SJF is nonpreemptive and chooses shortest ready burst at dispatch', () => {
  const config = {
    algorithm: 'SJF' as const, quantum: 2, overhead: 1, processes: [
      { id: 'A', arrival: 0, duration: 3, deadline: 20 },
      { id: 'B', arrival: 1, duration: 4, deadline: 20 },
      { id: 'C', arrival: 2, duration: 1, deadline: 20 },
    ]
  };
  assert.deepEqual(schedule(config).timeline.C, ['', '', '•', '■', '', '', '', '']);
  assert.deepEqual(schedule({ ...config, algorithm: 'FCFS' }).timeline.C, ['', '', '•', '•', '•', '•', '•', '■']);
});
