import { readdir, readFile, writeFile, mkdir, rename, link, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import { parseToml, inlineToml } from './toml.ts';
import { schedule, page, allocate } from './engines.ts';
import { isSubject, labelQuestionLibrary, questionLabel, subjects } from './subjects.ts';
import type { Algorithm, Answers, Fit, PublicQuestion, Question, Topic } from './types.ts';

const directory = join(process.cwd(), 'questions');
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const integer = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** Bound inputs before running simulations or allocating arrays. Verify teacher keys. */
export function validateQuestion(input: unknown, deriveSolution = false): Question {
  assert(input && typeof input === 'object', 'Expected a question table');
  const q = input as Question;
  assert(q.meta && typeof q.meta.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(q.meta.id), 'meta.id must be a safe identifier');
  assert(typeof q.meta.title === 'string' && q.meta.title.length > 0 && q.meta.title.length <= 200, 'Invalid question title');
  assert(['scheduling', 'paging', 'allocation'].includes(q.meta.topic), 'Unknown topic');
  if (q.meta.index !== undefined) assert(integer(q.meta.index, 1, 1000000000), 'Invalid question index');
  if (q.meta.description !== undefined) assert(typeof q.meta.description === 'string', 'Invalid description');
  let expected: unknown;
  if (q.meta.topic === 'scheduling') {
    const c = q.scheduling?.config;
    assert(c && ['FCFS', 'SJF', 'SRTF', 'RR', 'EDF'].includes(c.algorithm), 'Invalid scheduling algorithm');
    assert(integer(c.quantum, 1, 20) && integer(c.overhead, 0, 5), 'Invalid quantum or overhead');
    assert(Array.isArray(c.processes) && c.processes.length >= 1 && c.processes.length <= 8, 'Use 1–8 processes');
    const ids = new Set<string>();
    for (const p of c.processes) {
      assert(p && typeof p.id === 'string' && /^[A-Z][A-Z0-9]{0,7}$/.test(p.id) && !ids.has(p.id), 'Invalid or duplicate process ID'); ids.add(p.id);
      assert(integer(p.arrival, 0, 30) && integer(p.duration, 1, 20) && integer(p.deadline, 0, 200), 'Invalid process parameters');
    }
    const solution = schedule(c);
    expected = solution;
    if (deriveSolution) q.scheduling!.solution = solution;
  } else if (q.meta.topic === 'paging') {
    const c = q.paging?.config;
    assert(c && integer(c.virtual_bits, 4, 32) && integer(c.physical_bits, 4, 32) && integer(c.offset_bits, 1, 24), 'Invalid address widths');
    assert(c.offset_bits < c.virtual_bits && c.offset_bits < c.physical_bits && c.physical_bits - c.offset_bits <= 6, 'Use 1–64 frames and a common offset');
    assert(['FIFO', 'LRU'].includes(c.replacement) && Array.isArray(c.references) && c.references.length > 0 && c.references.length <= 40, 'Invalid paging references or replacement policy');
    assert(c.references.every(n => integer(n, 0, 2 ** (c.virtual_bits - c.offset_bits) - 1)), 'Reference exceeds virtual address space');
    const solution = page(c);
    expected = solution;
    if (deriveSolution) q.paging!.solution = solution;
  } else {
    const c = q.allocation?.config;
    assert(c && ['First Fit', 'Next Fit', 'Best Fit', 'Worst Fit'].includes(c.algorithm), 'Invalid fit algorithm');
    assert(Array.isArray(c.blocks) && c.blocks.length > 0 && c.blocks.length <= 10 && c.blocks.every(n => integer(n, 1, 10000)), 'Invalid memory blocks');
    assert(Array.isArray(c.requests) && c.requests.length > 0 && c.requests.length <= 12 && c.requests.every(n => integer(n, 1, 10000)), 'Invalid requests');
    const solution = allocate(c);
    expected = solution;
    if (deriveSolution) q.allocation!.solution = solution;
  }
  if (q.attempt !== undefined) {
    assert(q.attempt && typeof q.attempt === 'object', 'Invalid saved attempt');
    q.attempt.answers = validateAnswers(q.attempt.answers);
  }
  const supplied = q[q.meta.topic]?.solution;
  assert(supplied, 'Missing ground-truth solution');
  // Pad abbreviated timeline rows (as in the reference schema) with empty cells.
  if (q.meta.topic === 'scheduling') {
    const timeline = q.scheduling!.solution.timeline;
    const model = expected as ReturnType<typeof schedule>;
    assert(timeline && typeof timeline === 'object', 'Missing timeline');
    for (const id of Object.keys(model.timeline)) {
      assert(Array.isArray(timeline[id]) && timeline[id].length <= model.timeline[id].length, `Invalid timeline row ${id}`);
      timeline[id] = Array.from({ length: model.timeline[id].length }, (_, i) => timeline[id][i] ?? '');
    }
  }
  const normalize = (v: unknown): unknown => Array.isArray(v) ? v.map(normalize) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, normalize(x)])) : v;
  assert(JSON.stringify(normalize(supplied)) === JSON.stringify(normalize(expected)), 'Ground-truth solution disagrees with the documented course rules; regenerate or correct it');
  // React Server Components require ordinary object prototypes at the boundary.
  return JSON.parse(JSON.stringify(q)) as Question;
}

/** Answers are persisted verbatim, including incorrect and incomplete work. */
export function validateAnswers(input: unknown): Answers {
  assert(input && typeof input === 'object' && !Array.isArray(input), 'Invalid answers');
  const entries = Object.entries(input);
  assert(entries.length <= 10000 && entries.every(([key, value]) => key.length <= 100 && typeof value === 'string' && value.length <= 1000), 'Invalid answers');
  return Object.fromEntries(entries) as Answers;
}

/** Temporary questions carry only public configuration. Recompute the answer key
 * after the same bounded validation used for imported files; never trust a client key. */
export function questionFromPublic(input: unknown): Question {
  assert(input && typeof input === 'object', 'Invalid question');
  const candidate = input as PublicQuestion;
  assert(candidate.meta && ['scheduling', 'paging', 'allocation'].includes(candidate.meta.topic), 'Invalid topic');
  const topic = candidate.meta.topic;
  const question = { meta: candidate.meta, [topic]: { config: candidate[topic]?.config } };
  return validateQuestion(JSON.parse(JSON.stringify(question)), true);
}

export async function loadQuestions(root = directory) {
  await mkdir(root, { recursive: true });
  const files: { path: string; topic?: Topic; }[] = [];
  for (const topic of ['scheduling', 'paging', 'allocation'] as const) {
    const folder = join(root, topic);
    await mkdir(folder, { recursive: true });
    for (const file of (await readdir(folder)).filter(f => f.endsWith('.toml')).sort()) {
      files.push({ path: join(topic, file), topic });
    }
  }
  // Read older root-level files too, but all new saves use topic folders.
  files.push(...(await readdir(root)).filter(f => f.endsWith('.toml')).sort().map(path => ({ path })));
  const questions: Question[] = [], errors: string[] = [];
  for (const file of files) {
    try {
      const q = validateQuestion(parseToml(await readFile(join(root, file.path), 'utf8')));
      assert(!file.topic || q.meta.topic === file.topic, 'Question topic does not match its folder');
      if (questions.some(existing => existing.meta.id === q.meta.id)) throw new Error('Duplicate question ID');
      questions.push(q);
    } catch (e) { errors.push(`${file.path}: ${e instanceof Error ? e.message : 'Unable to load'}`); }
  }
  return { questions: labelQuestionLibrary(questions), errors };
}
export function publicQuestion(q: Question, saved = true): PublicQuestion {
  const common = { meta: { ...q.meta, title: questionLabel(q), index: q.meta.index ?? 1 }, saved, answers: q.attempt?.answers ?? {} };
  if (q.meta.topic === 'scheduling') return { ...common, scheduling: { config: q.scheduling!.config, horizon: Object.values(q.scheduling!.solution.timeline)[0].length } };
  if (q.meta.topic === 'paging') return { ...common, paging: { config: q.paging!.config, pages: [...new Set(q.paging!.config.references)].sort((a, b) => a - b) } };
  return { ...common, allocation: { config: q.allocation!.config } };
}
export function generateQuestion(topic: Topic, secondarySubject: string = subjects[topic][0].id, index = 1): Question {
  assert(isSubject(topic, secondarySubject), 'Choose a secondary subject for this topic');
  assert(integer(index, 1, 1000000000), 'Invalid question index');
  const id = `${topic}_${randomUUID().slice(0, 8)}`;
  const meta = { id, title: `${secondarySubject} · ${String(index).padStart(2, '0')}`, topic, index };
  if (topic === 'scheduling') {
    const algorithm = secondarySubject as Algorithm;
    const config = { algorithm, quantum: randomInt(2, 5), overhead: randomInt(1, 4), processes: Array.from({ length: 4 }, (_, i) => ({ id: String.fromCharCode(65 + i), arrival: i === 0 ? 0 : randomInt(1, 8), duration: randomInt(2, 6), deadline: randomInt(10, 36) })) };
    return { meta, scheduling: { config, solution: schedule(config) } };
  }
  if (topic === 'paging') {
    const offset_bits = randomInt(8, 13);
    const config = { virtual_bits: offset_bits + randomInt(4, 9), physical_bits: offset_bits + randomInt(1, 4), offset_bits, replacement: secondarySubject as 'FIFO' | 'LRU', references: Array.from({ length: 14 }, () => randomInt(7)) };
    return { meta, paging: { config, solution: page(config) } };
  }
  const config = { algorithm: secondarySubject as Fit, blocks: Array.from({ length: 5 }, () => randomInt(8, 31) * 16), requests: Array.from({ length: 6 }, () => randomInt(3, 22) * 16) };
  return { meta, allocation: { config, solution: allocate(config) } };
}
export function serializeQuestion(q: Question) {
  const topic = q.meta.topic;
  const sections = [
    `[meta]\n${Object.entries(q.meta).map(([k, v]) => `${k} = ${inlineToml(v)}`).join('\n')}`,
    `[${topic}.config]\n${Object.entries(q[topic]!.config).map(([k, v]) => `${k} = ${inlineToml(v)}`).join('\n')}`,
    `[${topic}.solution]\n${Object.entries(q[topic]!.solution).map(([k, v]) => `${k} = ${inlineToml(v)}`).join('\n')}`,
  ];
  if (q.attempt) sections.push(`[attempt]\nanswers = ${inlineToml(q.attempt.answers)}`);
  return sections.join('\n\n') + '\n';
}

/** Atomic replacement keeps the previous saved work intact if writing fails.
 * CLI/seed creation stays exclusive unless overwrite is explicitly requested. */
export async function saveQuestion(q: Question, options: { overwrite?: boolean; root?: string; } = {}) {
  const validated = validateQuestion(q);
  const folder = join(options.root ?? directory, validated.meta.topic);
  await mkdir(folder, { recursive: true });
  const destination = join(folder, `${validated.meta.id}.toml`);
  const temporary = join(folder, `.${validated.meta.id}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, serializeQuestion(validated), { flag: 'wx' });
    if (options.overwrite) await rename(temporary, destination);
    else await link(temporary, destination);
  } finally { await rm(temporary, { force: true }); }
}
