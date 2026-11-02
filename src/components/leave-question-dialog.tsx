'use client';

import { useEffect, useRef } from 'react';

interface Props {
  busy: boolean;
  error: string;
  onCancel: () => void;
  onDiscard: () => void;
  onSave: () => void;
}

/** A native modal traps focus, makes the background inert, and supports Escape. */
export default function LeaveQuestionDialog({ busy, error, onCancel, onDiscard, onSave }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} className="leave-dialog" aria-labelledby="leave-title" aria-describedby="leave-description"
      onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
      <h2 id="leave-title">Save your changes?</h2>
      <p id="leave-description">This question has unsaved answers. Save the question and your work before leaving, or discard these changes.</p>
      {error && <p className="error-banner" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button className="button secondary" autoFocus disabled={busy} onClick={onCancel}>Keep editing</button>
        <button className="button danger" disabled={busy} onClick={onDiscard}>Discard changes</button>
        <button className="button primary" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : 'Save and leave'}</button>
      </div>
    </dialog>
  );
}
