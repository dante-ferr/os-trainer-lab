import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { answersChanged } from '../src/lib/attempt.ts';
import { generateQuestion, loadQuestions, publicQuestion, questionFromPublic, saveQuestion } from '../src/lib/questions.ts';
import { gradeQuestion } from '../src/lib/grading.ts';

test('temporary questions can be graded without saving files or exposing the answer key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'os-lab-temporary-'));
  try {
    for (const topic of ['scheduling', 'paging', 'allocation'] as const) {
      const q = generateQuestion(topic);
      const temporary = publicQuestion(q, false);
      assert.equal(temporary.saved, false);
      assert.deepEqual(temporary.answers, {});
      assert.equal(JSON.stringify(temporary).includes('solution'), false);
      const restored = questionFromPublic(temporary);
      assert.deepEqual(restored[topic]!.solution, q[topic]!.solution);
      const answers = Object.fromEntries(gradeQuestion(q, {}).checks.map(c => [c.key, c.expected]));
      assert.equal(gradeQuestion(restored, answers).score, 100);
    }
    assert.deepEqual(await readdir(root), []);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('saving stores question and current work in its topic folder; resaving updates one file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'os-lab-save-'));
  try {
    for (const topic of ['scheduling', 'paging', 'allocation'] as const) {
      const q = generateQuestion(topic);
      // Deliberately incorrect, incomplete and empty answers must round-trip too.
      q.attempt = { answers: { 'cell.A.0': '■', 'response.A': '999', 'response.mean': '' } };
      await saveQuestion(q, { root });
      const filename = join(root, topic, `${q.meta.id}.toml`);
      assert.match(await readFile(filename, 'utf8'), /\[attempt\]/);
      let loaded = await loadQuestions(root);
      assert.deepEqual(loaded.errors, []);
      const saved = loaded.questions.find(item => item.meta.id === q.meta.id)!;
      assert.deepEqual(publicQuestion(saved).answers, q.attempt.answers);
      assert.equal(publicQuestion(saved).saved, true);
      assert.equal(answersChanged(q.attempt.answers, publicQuestion(saved).answers), false);

      q.attempt.answers['response.A'] = '4';
      await saveQuestion(q, { root, overwrite: true });
      loaded = await loadQuestions(root);
      assert.equal(loaded.questions.find(item => item.meta.id === q.meta.id)!.attempt!.answers['response.A'], '4');
      assert.deepEqual(await readdir(join(root, topic)), [`${q.meta.id}.toml`]);
      await assert.rejects(saveQuestion(q, { root }), { code: 'EEXIST' });
      assert.deepEqual(await readdir(join(root, topic)), [`${q.meta.id}.toml`]);
    }
    assert.deepEqual((await readdir(root)).sort(), ['allocation', 'paging', 'scheduling']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('invalid saves preserve the last saved work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'os-lab-save-error-'));
  try {
    const q = generateQuestion('paging');
    q.attempt = { answers: { 'paging.offset': '10' } };
    await saveQuestion(q, { root });
    const filename = join(root, 'paging', `${q.meta.id}.toml`);
    const before = await readFile(filename, 'utf8');
    q.attempt.answers['paging.offset'] = 4 as unknown as string;
    await assert.rejects(saveQuestion(q, { root, overwrite: true }), /Invalid answers/);
    assert.equal(await readFile(filename, 'utf8'), before);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('wrong topic folders report a file error without hiding valid questions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'os-lab-topic-'));
  try {
    const q = generateQuestion('allocation');
    await saveQuestion(q, { root });
    const text = await readFile(join(root, 'allocation', `${q.meta.id}.toml`), 'utf8');
    await loadQuestions(root); // Ensure all topic folders exist.
    await writeFile(join(root, 'scheduling', 'wrong.toml'), text);
    const loaded = await loadQuestions(root);
    assert.equal(loaded.questions.length, 1);
    assert.match(loaded.errors[0], /topic does not match/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('dirty state detects edits and clearing saved answers, but ignores reverted empty entries', () => {
  assert.equal(answersChanged({}), false);
  assert.equal(answersChanged({ 'cell.A.0': '' }), false);
  assert.equal(answersChanged({ 'cell.A.0': '■' }), true);
  assert.equal(answersChanged({ 'cell.A.0': '' }, { 'cell.A.0': '■' }), true);
  assert.equal(answersChanged({ b: '2', a: '1', empty: '' }, { a: '1', b: '2' }), false);
});
