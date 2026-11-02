import { questionFromPublic, validateAnswers } from '@/lib/questions';
import { gradeQuestion } from '@/lib/grading';
import { sameOrigin } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: 'Cross-origin writes are not allowed' }, { status: 403 });
  try {
    const { question, answers } = await request.json();
    // Rebuild server-side so temporary questions can be graded without persistence.
    return Response.json(gradeQuestion(questionFromPublic(question), validateAnswers(answers)));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Unable to grade this answer' }, { status: 400 });
  }
}
