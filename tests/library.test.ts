import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateQuestion, loadQuestions, publicQuestion, saveQuestion } from '../src/lib/questions.ts';
import { gradeQuestion } from '../src/lib/grading.ts';

test('an empty saved library is valid', async () => {
  const root = await mkdtemp(join(tmpdir(), 'os-lab-empty-'));
  try {
    assert.deepEqual(await loadQuestions(root), { questions: [], errors: [] });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('a topic library loads, hides solutions, and grades perfect keys', async () => {
  // Use isolated fixtures: a user's saved library may legitimately be empty.
  const root = await mkdtemp(join(tmpdir(), 'os-lab-library-'));
  try {
    for (const topic of ['scheduling', 'paging', 'allocation'] as const) {
      await saveQuestion(generateQuestion(topic), { root });
    }
    const { questions, errors } = await loadQuestions(root);
    assert.deepEqual(errors, []);
    assert.equal(questions.length, 3);
    for (const q of questions) {
      const publicData = publicQuestion(q);
      assert.equal(JSON.stringify(publicData).includes('solution'), false);
      assert.equal(Object.getPrototypeOf(publicData.meta), Object.prototype);
      const answers = Object.fromEntries(gradeQuestion(q, {}).checks.map(c => [c.key, c.expected]));
      assert.equal(gradeQuestion(q, answers).score, 100);
      const allWrong = Object.fromEntries(Object.keys(answers).map(key => [key, 'invalid']));
      assert.equal(gradeQuestion(q, allWrong).score, 0);
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
