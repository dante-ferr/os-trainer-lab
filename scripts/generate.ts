import { generateQuestion, loadQuestions, saveQuestion } from '../src/lib/questions.ts';
import { nextQuestionIndex, questionLabel, questionSubject } from '../src/lib/subjects.ts';
import { schedule, page, allocate } from '../src/lib/engines.ts';
import type { Question, Topic } from '../src/lib/types.ts';

const topic = process.argv[2] ?? 'scheduling';
if (topic === '--seed') {
  const scheduling = {
    algorithm: 'EDF' as const, quantum: 2, overhead: 1, processes: [
      { id: 'A', arrival: 0, duration: 5, deadline: 18 },
      { id: 'B', arrival: 1, duration: 3, deadline: 10 },
      { id: 'C', arrival: 3, duration: 4, deadline: 15 },
      { id: 'D', arrival: 5, duration: 2, deadline: 12 },
    ]
  };
  const paging = { virtual_bits: 16, physical_bits: 12, offset_bits: 10, replacement: 'FIFO' as const, references: [0, 1, 2, 0, 3, 4, 1, 2, 5, 0, 1, 4] };
  const allocation = { algorithm: 'Best Fit' as const, blocks: [100, 500, 200, 300, 600], requests: [212, 417, 112, 426] };
  const seeds: Question[] = [
    { meta: { id: 'sched_edf_01', title: 'EDF · 01', topic: 'scheduling', index: 1, description: 'Four processes. One CPU. Build the execution timeline using Earliest Deadline First and the MATA58 preemption rules.' }, scheduling: { config: scheduling, solution: schedule(scheduling) } },
    { meta: { id: 'paging_fifo_01', title: 'FIFO · 01', topic: 'paging', index: 1, description: 'Decode the address spaces, trace demand paging, and reconstruct the final page table.' }, paging: { config: paging, solution: page(paging) } },
    { meta: { id: 'alloc_best_01', title: 'Best Fit · 01', topic: 'allocation', index: 1, description: 'Place each request in order. Split the selected free block and keep track of the space left behind.' }, allocation: { config: allocation, solution: allocate(allocation) } },
  ];
  for (const q of seeds) {
    try { await saveQuestion(q); console.log(`Created questions/${q.meta.topic}/${q.meta.id}.toml`); }
    catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') console.log(`Already exists: ${q.meta.id}.toml`); else throw e; }
  }
} else {
  if (!['scheduling', 'paging', 'allocation'].includes(topic)) throw new Error('Usage: npm run generate -- [scheduling|paging|allocation|--seed] [secondary-subject]');
  const q = generateQuestion(topic as Topic, process.argv[3]);
  const { questions } = await loadQuestions();
  q.meta.index = nextQuestionIndex(questions, q.meta.topic, questionSubject(q));
  q.meta.title = questionLabel(q);
  await saveQuestion(q); console.log(`Created questions/${q.meta.topic}/${q.meta.id}.toml`);
}
