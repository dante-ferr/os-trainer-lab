'use client';

import type { Topic } from '@/lib/types';

const exercises: { topic: Topic; title: string; subjects: string; icon: string; }[] = [
  { topic: 'scheduling', title: 'CPU Scheduling', subjects: 'FCFS · SJF · SRTF · RR · EDF', icon: '▥' },
  { topic: 'paging', title: 'Virtual Memory', subjects: 'FIFO · LRU', icon: '▦' },
  { topic: 'allocation', title: 'Memory Allocation', subjects: 'First Fit · Next Fit · Best Fit · Worst Fit', icon: '▤' },
];

interface Props {
  busy: boolean;
  error: string;
  libraryErrors: string[];
  onChoose: (topic: Topic) => void;
}

export default function LabHome({ busy, error, libraryErrors, onChoose }: Props) {
  return (
    <div className="lab-home">
      <header className="home-header">
        <div className="brand"><span className="brand-mark">os</span><span>trainer<span className="brand-light">lab</span></span></div>
      </header>
      <main className="home-main">
        <h1>Choose an exercise</h1>
        <p className="home-description">Select a type to get started.</p>
        {error && <p className="error-banner" role="alert">{error}</p>}
        {libraryErrors.length > 0 && <details className="error-banner"><summary>{libraryErrors.length} question file(s) need attention</summary>{libraryErrors.map(message => <p key={message}>{message}</p>)}</details>}
        <div className="home-exercises">
          {exercises.map(exercise => (
            <button className={`home-exercise ${exercise.topic}`} key={exercise.topic} disabled={busy} onClick={() => onChoose(exercise.topic)}>
              <span className="home-exercise-icon" aria-hidden="true">{exercise.icon}</span>
              <strong>{exercise.title}</strong>
              <span className="home-exercise-subjects">{exercise.subjects}</span>
              <span className="home-exercise-arrow" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
        {busy && <p className="home-description" role="status">Preparing your question…</p>}
      </main>
    </div>
  );
}
