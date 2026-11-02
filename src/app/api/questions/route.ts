import { generateQuestion, loadQuestions, publicQuestion, questionFromPublic, saveQuestion, validateAnswers } from '@/lib/questions';
import { isSubject, nextQuestionIndex, questionLabel, questionSubject } from '@/lib/subjects';
import { sameOrigin } from '@/lib/http';
import type { Topic } from '@/lib/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  const { questions, errors } = await loadQuestions();
  return Response.json({ questions: questions.map(q => publicQuestion(q)), errors });
}

/** New questions live only in the current browser's React state. */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Cross-origin writes are not allowed' }, { status: 403 });
  try {
    const { topic, subject, index } = await request.json();
    if (!['scheduling', 'paging', 'allocation'].includes(topic)) return Response.json({ error: 'Choose a valid topic' }, { status: 400 });
    if (!isSubject(topic as Topic, subject)) return Response.json({ error: 'Choose a secondary subject for this topic' }, { status: 400 });
    if (index !== undefined && (!Number.isInteger(index) || index < 1 || index > 1000000000)) return Response.json({ error: 'Invalid question index' }, { status: 400 });
    const { questions } = await loadQuestions();
    const nextIndex = Math.max(index ?? 1, nextQuestionIndex(questions, topic, subject));
    return Response.json({ question: publicQuestion(generateQuestion(topic as Topic, subject, nextIndex), false) });
  } catch { return Response.json({ error: 'Could not create a new question' }, { status: 400 }); }
}

/** Save both the dataset and a snapshot of the student's current answer. */
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Cross-origin writes are not allowed' }, { status: 403 });
  try {
    const { question, answers } = await request.json();
    const q = questionFromPublic(question);
    q.attempt = { answers: validateAnswers(answers) };
    const { questions } = await loadQuestions();
    const existing = questions.find(saved => saved.meta.id === q.meta.id);
    if (existing) q.meta.index = existing.meta.index;
    else if (questions.some(saved => saved.meta.topic === q.meta.topic && questionSubject(saved) === questionSubject(q) && saved.meta.index === q.meta.index)) {
      q.meta.index = nextQuestionIndex(questions, q.meta.topic, questionSubject(q));
    }
    q.meta.title = questionLabel(q);
    await saveQuestion(q, { overwrite: true });
    return Response.json({ question: publicQuestion(q) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Could not save question' }, { status: 400 });
  }
}
