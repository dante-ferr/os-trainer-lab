'use client';

import { useEffect, useRef, useState } from 'react';
import { subjects } from '@/lib/subjects';
import type { SecondarySubject } from '@/lib/subjects';
import type { Topic } from '@/lib/types';

interface Props {
  topic: Topic;
  initialSubject?: SecondarySubject;
  onCancel: () => void;
  onChoose: (subject: SecondarySubject) => void;
}

export default function NewQuestionDialog({ topic, initialSubject, onCancel, onChoose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(initialSubject ?? subjects[topic][0].id);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="leave-dialog new-question-dialog" aria-labelledby="new-question-title"
      onCancel={event => { event.preventDefault(); onCancel(); }}>
      <form onSubmit={event => { event.preventDefault(); onChoose(selected); }}>
        <h2 id="new-question-title">New {topic === 'scheduling' ? 'scheduling' : topic === 'paging' ? 'paging' : 'allocation'} question</h2>
        <fieldset className="subject-picker">
          <legend>Choose a secondary subject</legend>
          {subjects[topic].map(subject => (
            <label key={subject.id} className={`subject-option ${selected === subject.id ? 'selected' : ''}`}>
              <input type="radio" name="secondary-subject" value={subject.id} checked={selected === subject.id} autoFocus={selected === subject.id}
                onChange={() => setSelected(subject.id)} />
              <span><strong>{subject.id}</strong><small>{subject.description}</small></span>
            </label>
          ))}
        </fieldset>
        <div className="dialog-actions">
          <button className="button secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className="button primary" type="submit">Create question</button>
        </div>
      </form>
    </dialog>
  );
}
