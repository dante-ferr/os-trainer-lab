import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateQuestion, publicQuestion, questionFromPublic, serializeQuestion, validateQuestion } from '../src/lib/questions.ts';
import { isSubject, labelQuestionLibrary, nextQuestionIndex, questionLabel, questionSubject, subjects } from '../src/lib/subjects.ts';
import { parseToml } from '../src/lib/toml.ts';

test('each selected secondary subject generates that exact algorithm with an indexed label', () => {
  for (const topic of ['scheduling', 'paging', 'allocation'] as const) {
    for (const subject of subjects[topic]) {
      const q = generateQuestion(topic, subject.id, 7);
      assert.equal(questionSubject(q), subject.id);
      assert.equal(q.meta.title, `${subject.id} · 07`);
      assert.equal(q.meta.index, 7);
      assert.deepEqual(validateQuestion(parseToml(serializeQuestion(q))), q);
      const temporary = publicQuestion(q, false);
      assert.equal(temporary.meta.title, q.meta.title);
      assert.deepEqual(questionFromPublic(temporary), q);
    }
  }
});

test('secondary subjects must belong to the selected topic', () => {
  assert.equal(isSubject('scheduling', 'FIFO'), false);
  assert.equal(isSubject('paging', 'LRU'), true);
  assert.throws(() => generateQuestion('scheduling', 'Best Fit'), /secondary subject/);
  assert.throws(() => generateQuestion('paging', 'unknown'), /secondary subject/);
  assert.throws(() => generateQuestion('allocation', 'First Fit', 0), /index/);
});

test('numbering is independent for every secondary subject and follows the highest saved index', () => {
  const questions = [generateQuestion('scheduling', 'EDF', 2), generateQuestion('scheduling', 'EDF', 5), generateQuestion('scheduling', 'FCFS', 10), generateQuestion('paging', 'FIFO', 3)];
  assert.equal(nextQuestionIndex(questions, 'scheduling', 'EDF'), 6);
  assert.equal(nextQuestionIndex(questions, 'scheduling', 'FCFS'), 11);
  assert.equal(nextQuestionIndex(questions, 'scheduling', 'RR'), 1);
  assert.equal(nextQuestionIndex(questions, 'paging', 'FIFO'), 4);
  assert.equal(questionLabel(generateQuestion('scheduling', 'EDF', 123)), 'EDF · 123');
});

test('older question names and duplicate indices get consistent labels without changing saved work', () => {
  const first = generateQuestion('scheduling', 'FCFS', 1);
  first.meta.title = 'A new scheduling challenge';
  delete first.meta.index;
  first.attempt = { answers: { 'cell.A.0': '■', 'response.A': '999' } };
  const explicit = generateQuestion('scheduling', 'FCFS', 4);
  const duplicate = generateQuestion('scheduling', 'FCFS', 4);
  const labeled = labelQuestionLibrary([first, explicit, duplicate]);
  assert.deepEqual(labeled.map(q => q.meta.title), ['FCFS · 01', 'FCFS · 04', 'FCFS · 02']);
  assert.deepEqual(labeled[0].attempt, first.attempt);
  assert.deepEqual(labeled[0].scheduling, first.scheduling);
  assert.equal(first.meta.title, 'A new scheduling challenge');
  assert.deepEqual(labelQuestionLibrary(labeled), labeled);
});


test('saving a later numbered question does not shift an older imported question label', () => {
  const legacy = generateQuestion('scheduling', 'EDF');
  delete legacy.meta.index;
  const firstLoad = labelQuestionLibrary([legacy]);
  const newlySaved = generateQuestion('scheduling', 'EDF', nextQuestionIndex(firstLoad, 'scheduling', 'EDF'));
  assert.deepEqual(labelQuestionLibrary([legacy, newlySaved]).map(q => q.meta.title), ['EDF · 01', 'EDF · 02']);
});
