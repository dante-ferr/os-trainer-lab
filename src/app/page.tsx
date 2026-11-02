import { loadQuestions, publicQuestion } from '@/lib/questions';
import Trainer from '@/components/trainer';
export const dynamic = 'force-dynamic';
export default async function Home() {
  const { questions, errors } = await loadQuestions();
  // The home screen is always the entry point, including after a full reload.
  return <Trainer initialQuestions={questions.map(q => publicQuestion(q))} initialErrors={errors} />;
}
