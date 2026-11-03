'use client';

import { useEffect, useRef, useState } from 'react';
import { absoluteDeadline } from '@/lib/deadlines';
import { answersChanged } from '@/lib/attempt';
import LeaveQuestionDialog from './leave-question-dialog';
import NewQuestionDialog from './new-question-dialog';
import LabHome from './lab-home';
import { nextQuestionIndex, questionSubject, subjectKey } from '@/lib/subjects';
import type { SecondarySubject } from '@/lib/subjects';
import { parseHistory } from '@/lib/grading';
import type { Answers, Cell, Check, Grade, PublicQuestion, Topic } from '@/lib/types';

const topics: { id: Topic; title: string; icon: string; }[] = [
  { id: 'scheduling', title: 'CPU Scheduling', icon: '▥' },
  { id: 'paging', title: 'Virtual Memory', icon: '▦' },
  { id: 'allocation', title: 'Memory Allocation', icon: '▤' },
];
const symbols: { value: Cell; label: string; className: string; key: string; }[] = [
  { value: '■', label: 'Executing', className: 'executing', key: '1' },
  { value: 'X', label: 'Overhead', className: 'overhead', key: '2' },
  { value: '•', label: 'Ready', className: 'ready', key: '3' },
  { value: '', label: 'Empty', className: 'empty', key: '4' },
];
const display = (s: string) => s === '' ? 'Empty' : s;

export default function Trainer({ initialQuestions, initialErrors }: { initialQuestions: PublicQuestion[]; initialErrors: string[]; }) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [q, setQuestion] = useState<PublicQuestion | null>(null);
  const [answers, setAnswers] = useState<Answers>({});
  const [grade, setGrade] = useState<Grade | null>(null);
  const [brush, setBrush] = useState<Cell>('■');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [libraryErrors, setLibraryErrors] = useState(initialErrors);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const [notice, setNotice] = useState('');
  const [pickerTopic, setPickerTopic] = useState<Topic | null>(null);
  // Keep only per-subject counters, never the discarded temporary question or its answers.
  const indices = useRef<Record<string, number>>({});
  const dirty = q !== null && answersChanged(answers, q.answers);
  const saved = q?.saved === true && !dirty;
  const resultRef = useRef<HTMLDivElement>(null);
  const checks = new Map(grade?.checks.map(c => [c.key, c]));

  useEffect(() => {
    // Retire the previous implicit draft; only explicit saves survive closing the lab.
    try { localStorage.removeItem('os-trainer-draft-v1'); } catch { /* Storage is optional. */ }
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  useEffect(() => {
    if (!q) return;
    const handler = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement).matches('input, select, textarea') || event.metaKey || event.ctrlKey || event.altKey) return;
      const symbol = symbols.find(s => s.key === event.key);
      if (symbol) setBrush(symbol.value);
    };
    window.addEventListener('keydown', handler); return () => window.removeEventListener('keydown', handler);
  }, [q]);

  // Keep the view in memory only: a reload always starts at home.
  if (!q) return <>
    <LabHome busy={busy} error={error} libraryErrors={libraryErrors} onChoose={setPickerTopic} />
    {pickerTopic && <NewQuestionDialog topic={pickerTopic}
      onCancel={() => setPickerTopic(null)}
      onChoose={subject => {
        const nextTopic = pickerTopic;
        setPickerTopic(null);
        void newQuestion(nextTopic, subject);
      }} />}
  </>;

  const topic = q.meta.topic;
  const filtered = questions.filter(item => item.meta.topic === topic);
  const activeTopic = topics.find(t => t.id === topic)!;
  const frameCountAnswer = Number(answers['paging.frame_count']);
  const frameRows = q.paging && Number.isInteger(frameCountAnswer) && frameCountAnswer > 0 ? Math.min(frameCountAnswer, 64) : 0;

  function goHome() {
    setQuestion(null);
    setAnswers({});
    setGrade(null);
    setPickerTopic(null);
    setError('');
    setNotice('');
    window.scrollTo({ top: 0 });
  }
  function openQuestion(next: PublicQuestion) {
    setQuestion(next);
    const key = subjectKey(next.meta.topic, questionSubject(next));
    indices.current[key] = Math.max(indices.current[key] ?? 0, next.meta.index ?? 1);
    setAnswers({ ...next.answers });
    setGrade(null);
    setError('');
    setNotice('');
    window.scrollTo({ top: 0 });
  }
  function confirmLeave(action: () => void) {
    if (busy) return;
    if (dirty) { setError(''); setPendingLeave(() => action); }
    else action();
  }
  const switchTopic = (next: Topic) => {
    if (next !== topic && !busy) setPickerTopic(next);
  };
  const selectSaved = (id: string) => {
    if (id === q.meta.id) return;
    const next = questions.find(item => item.meta.id === id);
    if (next) confirmLeave(() => openQuestion(next));
  };
  const reset = () => confirmLeave(() => { setAnswers({}); setGrade(null); setNotice(''); });
  const setAnswer = (key: string, value: string) => {
    setAnswers(a => ({ ...a, [key]: value })); setGrade(null); setNotice('');
  };
  const status = (key: string) => checks.has(key) ? checks.get(key)!.correct ? ' correct' : ' incorrect' : '';

  async function newQuestion(nextTopic: Topic, subject: SecondarySubject) {
    setBusy(true); setError('');
    try {
      const key = subjectKey(nextTopic, subject);
      const index = Math.max((indices.current[key] ?? 0) + 1, nextQuestionIndex(questions, nextTopic, subject));
      const response = await fetch('/api/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ topic: nextTopic, subject, index }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      indices.current[key] = data.question.meta.index;
      openQuestion(data.question);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create a new question'); }
    finally { setBusy(false); }
  }
  async function save(): Promise<boolean> {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/questions', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, answers }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      const savedQuestion: PublicQuestion = data.question;
      setQuestions(prev => [...prev.filter(item => item.meta.id !== savedQuestion.meta.id), savedQuestion]);
      setQuestion(savedQuestion);
      const key = subjectKey(savedQuestion.meta.topic, questionSubject(savedQuestion));
      indices.current[key] = Math.max(indices.current[key] ?? 0, savedQuestion.meta.index ?? 1);
      setNotice('Question and answers saved.');
      return true;
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save question'); return false; }
    finally { setBusy(false); }
  }
  async function saveAndLeave() {
    if (await save()) {
      const action = pendingLeave;
      setPendingLeave(null);
      action?.();
    }
  }
  async function refresh() {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/questions'); if (!response.ok) throw new Error('Unable to reload library');
      const data = await response.json(); setQuestions(data.questions); setLibraryErrors(data.errors);
      setNotice('Saved questions reloaded. Your current work is unchanged.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to reload library'); }
    finally { setBusy(false); }
  }
  async function submit() {
    if (!q) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/grade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q, answers }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setGrade(data); setTimeout(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not grade answer'); }
    finally { setBusy(false); }
  }
  function numeric(key: string, label: string, suffix?: string) {
    const check = checks.get(key);
    return <label className={`field${status(key)}`} key={key}><span>{label}</span><div className="input-wrap"><input aria-label={label} type="number" disabled={busy} step="any" value={answers[key] ?? ''} onChange={e => setAnswer(key, e.target.value)} placeholder="—" /><span>{suffix}</span></div>{check && <small>{check.correct ? '✓ Correct' : `Expected: ${check.expected}`}</small>}</label>;
  }
  function timeline(expected = false) {
    if (!q?.scheduling) return null;
    return <div className="grid-scroll"><table className="timeline"><caption className="sr-only">{expected ? 'Expected execution timeline' : 'Your execution timeline'}</caption><thead><tr><th scope="col">Process</th>{Array.from({ length: q.scheduling.horizon }, (_, t) => <th key={t} scope="col">{t}</th>)}</tr></thead><tbody>{q.scheduling.config.processes.map((p, i) => <tr key={p.id}><th scope="row"><span className={`process-dot dot-${i}`}>{p.id}</span></th>{Array.from({ length: q.scheduling!.horizon }, (_, t) => {
      const key = `cell.${p.id}.${t}`, check = checks.get(key), value = (expected ? check?.expected : answers[key]) ?? '';
      const symbol = symbols.find(s => s.value === value);
      return <td key={t}>{expected ? <div className={`grid-cell ${symbol?.className ?? ''}`}>{value}</div> : <button type="button" disabled={busy} className={`grid-cell ${symbol?.className ?? ''}${status(key)}`} aria-label={`Process ${p.id}, time ${t}: ${display(value)}${check ? `; expected ${display(check.expected)}` : ''}`} title={check ? `Yours: ${display(value)} · Expected: ${display(check.expected)}` : `Process ${p.id} at t=${t}`} onClick={() => setAnswer(key, value === brush ? '' : brush)}>{value}</button>}</td>;
    })}</tr>)}</tbody></table></div>;
  }
  function historyCurrent(key: string) {
    const parsed = parseHistory(answers[key] ?? '');
    if (parsed === null) return 'Invalid';
    if (parsed.length === 0) return '—';
    return String(parsed.at(-1));
  }
  function historyRow(key: string, label: string, icon: string) {
    const check = checks.get(key);
    const current = historyCurrent(key);
    return <div className="mapping-row" key={key}><strong><span className="vpn-icon">{icon}</span> {label}</strong><label className={`field history-field${status(key)}`}><span className="sr-only">{`${label} value history`}</span><div className="input-wrap"><input aria-label={`${label} value history`} disabled={busy} value={answers[key] ?? ''} onChange={e => setAnswer(key, e.target.value)} placeholder="e.g. 0, 3, 5" /></div>{check && <small>{check.correct ? '✓ Correct' : `Expected: ${check.expected || '—'}`}</small>}</label><span className="history-current" title="Last value is current">{current}</span></div>;
  }
  function queueSketch(hint: string) {
    return <>
      <div className="section-title"><h3>Queue sketch</h3><span>Optional helper</span></div>
      <p className="section-hint">{hint} Not graded.</p>
      <label className="queue-sketch"><span className="sr-only">Queue sketch</span><textarea disabled={busy} rows={5} spellCheck={false} value={answers['sketch.queue'] ?? ''} onChange={e => setAnswer('sketch.queue', e.target.value)} placeholder="Scratch space for queue order…" /></label>
    </>;
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">os</span><span>trainer<span className="brand-light">lab</span></span></div>
      <nav aria-label="Practice topics">
        {topics.map(t => <button className={`topic-nav ${topic === t.id ? 'selected' : ''}`} key={t.id} onClick={() => switchTopic(t.id)} disabled={busy} aria-current={topic === t.id ? 'page' : undefined}><span>{t.icon}</span>{t.title}</button>)}
      </nav>
      <p className="sidebar-help">Questions are temporary until you save them. Saving includes your answers.</p>
    </aside>

    <div className="main-shell">
      <main id="practice">
        <section className="page-heading"><button className="button text-button home-link" onClick={() => confirmLeave(goHome)} disabled={busy}>← Home</button><h1>{activeTopic.title}</h1><p>Work through a question, then check your answer.</p></section>
        <section className="library-bar">
          <div className="question-select"><label htmlFor="question">Saved questions</label><select id="question" value={q.meta.id} disabled={busy} onChange={e => selectSaved(e.target.value)}>
            {!filtered.some(item => item.meta.id === q.meta.id) && <option value={q.meta.id}>{q.meta.title} · unsaved</option>}
            {filtered.map(question => <option value={question.meta.id} key={question.meta.id}>{question.meta.title}</option>)}
          </select></div>
          <div className="library-actions">
            <button className="icon-button" title="Reload saved questions" aria-label="Reload saved questions" onClick={refresh} disabled={busy}>↻</button>
            <button className="button secondary" onClick={() => setPickerTopic(topic)} disabled={busy}>＋ New question</button>
            <button className="button primary" onClick={() => { void save(); }} disabled={busy || saved}>{saved ? '✓ Saved' : 'Save question'}</button>
          </div>
        </section>
        {notice && <p className="notice" role="status">{notice}</p>}
        {error && <div className="error-banner" role="alert">{error}</div>}
        {libraryErrors.length > 0 && <details className="error-banner"><summary>{libraryErrors.length} question file(s) need attention</summary>{libraryErrors.map(e => <p key={e}>{e}</p>)}</details>}
        <div className="exercise-layout"><section className="exercise-card">
          <div className="exercise-heading"><div><div className="eyebrow muted">{q.saved ? 'SAVED QUESTION' : 'TEMPORARY QUESTION'}</div><h2>{q.meta.title}</h2></div><span className="outline-badge">{q.scheduling?.config.algorithm ?? q.paging?.config.replacement ?? q.allocation?.config.algorithm}</span></div>
          <p className="exercise-description">{q.meta.description ?? `Work through this ${activeTopic.title.toLowerCase()} challenge. Fill in your answer, then check your reasoning.`}</p>
          {q.scheduling && <>
            <div className="parameters"><span><i>◷</i> Quantum <strong>{q.scheduling.config.quantum} units</strong></span><span><i>⇄</i> Overhead <strong>{q.scheduling.config.overhead} {q.scheduling.config.overhead === 1 ? 'unit' : 'units'}</strong></span><span><i>▥</i> Processes <strong>{q.scheduling.config.processes.length}</strong></span></div>
            <div className="process-table-wrap"><table className="data-table"><thead><tr><th>Process</th><th>Arrival time</th><th>Burst time</th><th>Deadline from arrival</th><th>Due at</th></tr></thead><tbody>{q.scheduling.config.processes.map((p, i) => <tr key={p.id}><td><span className={`process-dot dot-${i}`}>{p.id}</span> <strong>Process {p.id}</strong></td><td>{p.arrival}<small> units</small></td><td>{p.duration}<small> units</small></td><td>{p.deadline}<small> units</small></td><td>{absoluteDeadline(p)}<small> units</small></td></tr>)}</tbody></table></div>
            {q.scheduling.config.algorithm === 'RR' && queueSketch('Track the ready queue as processes arrive, run, and rotate back.')}
            <div className="section-title"><h3>Build the timeline</h3><span>{q.scheduling.horizon} time units</span></div><p className="section-hint">Choose a state, then click a cell to place it. Click again to clear.</p>
            <div className="palette" role="group" aria-label="Timeline painting state">{symbols.map(s => <button key={s.key} onClick={() => setBrush(s.value)} aria-pressed={brush === s.value} className={`palette-item ${brush === s.value ? 'picked' : ''}`}><span className={`symbol ${s.className}`}>{s.value || '□'}</span>{s.label}<kbd>{s.key}</kbd></button>)}</div>
            {timeline()}<div className="grid-footer"><span>↔ Scroll to explore the full timeline</span><span>Each cell = 1 time unit</span></div>
            <div className="section-title response-title"><h3>Response times</h3><span>Completion − arrival</span></div><div className="fields response-fields">{q.scheduling.config.processes.map(p => numeric(`response.${p.id}`, `Process ${p.id}`, 'units'))}{numeric('response.mean', 'Average', 'units')}</div>
          </>}
          {q.paging && <>
            <div className="parameters"><span>Virtual address <strong>{q.paging.config.virtual_bits} bits</strong></span><span>Physical address <strong>{q.paging.config.physical_bits} bits</strong></span><span>Page size <strong>{2 ** q.paging.config.offset_bits} bytes</strong></span></div>
            <div className="section-title"><h3>Page reference string</h3><span>{q.paging.config.replacement} replacement</span></div><div className="reference-string">{q.paging.config.references.map((n, i) => <span key={i}>{n}</span>)}</div><p className="section-hint">References are VPNs. Start with all frames empty and use the lowest free frame first.</p>
            {queueSketch(`Track the ${q.paging.config.replacement} replacement order as you walk the reference string.`)}
            <div className="section-title"><h3>Decode the address space</h3></div><div className="fields paging-fields">{numeric('paging.offset', 'Offset width', 'bits')}{numeric('paging.vpn', 'VPN width', 'bits')}{numeric('paging.pfn', 'PFN width', 'bits')}{numeric('paging.page_size', 'Page size', 'bytes')}{numeric('paging.frame_count', 'Physical frames', 'frames')}{numeric('paging.page_faults', 'Total page faults', 'faults')}</div>
            <div className="section-title"><h3>Frames table</h3><span>{frameRows > 0 ? `${frameRows} frame${frameRows === 1 ? '' : 's'}` : 'Enter physical frames first'}</span></div><p className="section-hint">Row count follows the physical frames value above. List every VPN loaded into the frame, in order, separated by commas. Leave blank if unused. The last value is the current resident.</p>
            {frameRows > 0
              ? <div className="mapping-table history-table"><div className="mapping-header"><span>Frame</span><span>Previous values → current</span><span>Current</span></div>{Array.from({ length: frameRows }, (_, frame) => historyRow(`frames.${frame}`, `F${frame}`, '▤'))}</div>
              : <p className="section-hint">Set <strong>Physical frames</strong> to build the frames table.</p>}
            <div className="section-title"><h3>Page table</h3><span>Value history per VPN</span></div><p className="section-hint">List every frame assigned to the VPN, in order. Append −1 when the page is evicted. The last value is the current mapping.</p>
            <div className="mapping-table history-table"><div className="mapping-header"><span>Virtual page</span><span>Previous values → current</span><span>Current</span></div>{q.paging.pages.map(vpn => historyRow(`table.${vpn}`, `VPN ${vpn}`, '▦'))}</div>
          </>}
          {q.allocation && <>
            <div className="parameters"><span>Strategy <strong>{q.allocation.config.algorithm}</strong></span><span>Partitions <strong>{q.allocation.config.blocks.length}</strong></span><span>Unit <strong>KiB</strong></span></div>
            <div className="section-title"><h3>Available memory</h3><span>Initial free blocks</span></div><div className="memory-layout">{q.allocation.config.blocks.map((size, i) => {
              const used = q.allocation!.config.requests.reduce((sum, request, n) => answers[`assignment.${n}`] === String(i) ? sum + request : sum, 0);
              return <div className={`memory-block ${used > size ? 'overfilled' : ''}`} key={i}><div><strong>B{i + 1}</strong><span>{size} KiB</span></div><div className="memory-track"><div style={{ width: `${Math.min(100, used / size * 100)}%` }} /></div><small>{used > size ? `Over capacity by ${used - size} KiB` : `${size - used} KiB unassigned`}</small>{q.allocation!.config.requests.map((_, n) => answers[`assignment.${n}`] === String(i) ? <span className="allocated-chip" key={n}>P{n + 1}</span> : null)}</div>;
            })}</div>
            <div className="section-title"><h3>Place the requests</h3><span>Work from top to bottom</span></div><p className="section-hint">Assign each request to a free block, or mark it as unallocated.</p><div className="request-list">{q.allocation.config.requests.map((size, i) => <label className={`request-row${status(`assignment.${i}`)}`} key={i}><span className={`process-dot dot-${i % 4}`}>P{i + 1}</span><strong>{size} <small>KiB</small></strong><span className="request-arrow">→</span><select disabled={busy} aria-label={`Block for request P${i + 1}`} value={answers[`assignment.${i}`] ?? ''} onChange={e => setAnswer(`assignment.${i}`, e.target.value)}><option value="">Choose a block…</option>{q.allocation!.config.blocks.map((_, b) => <option key={b} value={b}>B{b + 1}</option>)}<option value="-1">Unallocated</option></select>{checks.get(`assignment.${i}`) && <small>Expected: {Number(checks.get(`assignment.${i}`)!.expected) === -1 ? 'Unallocated' : `B${Number(checks.get(`assignment.${i}`)!.expected) + 1}`}</small>}</label>)}</div>
            <div className="section-title"><h3>Remaining free memory</h3><span>After all requests</span></div><div className="fields response-fields">{q.allocation.config.blocks.map((_, i) => numeric(`remaining.${i}`, `Block B${i + 1}`, 'KiB'))}</div>
          </>}
          <div className="submission-bar"><span><span className="online-dot" />{dirty ? 'Unsaved changes' : q.saved ? 'Question and answers saved' : 'Temporary · not saved'}</span><div><button className="button text-button" onClick={reset} disabled={busy}>Reset answer</button><button className="button primary" onClick={submit} disabled={busy}>{busy ? 'Working…' : 'Check my answer'} <span>→</span></button></div></div>
        </section>
          <aside className="guide-column"><section className="guide-card"><div className="guide-icon">⌘</div><h3>Rules & conventions</h3><div className="guide-rule"><span>01</span><div><h4>{topic === 'scheduling' ? 'Follow the arrivals' : topic === 'paging' ? 'One shared offset' : 'Keep the order'}</h4><p>{topic === 'scheduling' ? 'A process can only run or wait in the ready queue after it arrives.' : topic === 'paging' ? 'Virtual and physical addresses use exactly the same offset bit width.' : 'Handle requests in the listed order. Each successful request splits its selected free block.'}</p></div></div><div className="guide-rule"><span>02</span><div><h4>{topic === 'scheduling' ? 'Preemption has a cost' : topic === 'paging' ? 'Trace every reference' : 'Choose consistently'}</h4><p>{topic === 'scheduling' ? 'Mark X on the outgoing process only when it is preempted. Natural completion has no overhead.' : topic === 'paging' ? 'A missing page causes one fault. FIFO tracks load time; LRU tracks the most recent access. Append a history value only when a frame or mapping changes.' : 'Ties use the lowest block index. Next Fit starts at B1, then searches from the last allocated block’s remainder, wrapping around.'}</p></div></div><div className="guide-rule"><span>03</span><div><h4>{topic === 'scheduling' ? 'Measure the whole journey' : topic === 'paging' ? 'Last value is current' : 'Account for every KiB'}</h4><p>{topic === 'scheduling' ? 'For this course, response time is completion time minus arrival time, including all waiting.' : topic === 'paging' ? 'Each row is a comma-separated history. The last number is the definitive current value. Use −1 when a page is evicted from the page table.' : 'Failed requests leave all blocks unchanged. No deallocation or compaction takes place.'}</p></div></div></section>
            <section className="convention-card"><div className="eyebrow">✳ COURSE CONVENTION</div><h3>{topic === 'scheduling' ? 'Time-sliced EDF' : topic === 'paging' ? 'Address widths' : 'Fit strategies'}</h3><p>{topic === 'scheduling' ? 'Each deadline is measured from its process’s arrival. EDF compares arrival + deadline when the CPU is assigned. A running process keeps the CPU until its quantum expires or it finishes. Quantum expiration charges overhead even when the same process runs again.' : topic === 'paging' ? 'Page size = 2ᵒᶠᶠˢᵉᵗ bytes. Subtract offset bits from each address width to find VPN and PFN widths.' : 'First and Next Fit follow address order. Best Fit minimizes the leftover space; Worst Fit chooses the largest free block.'}</p></section>
          </aside></div>
        {grade && <section className="results-card" ref={resultRef} aria-live="polite"><div className="results-heading"><div><h2>{grade.score === 100 ? 'All answers correct' : 'Answer review'}</h2><p>{grade.correct} of {grade.total} cells and inputs correct. Every item carries equal weight.</p></div><div className="score">{grade.score}<span>% accuracy</span></div></div><div className="diff-legend"><span className="correct">✓ Correct</span><span className="incorrect">× Needs another look</span></div>{q.scheduling && <div className="timeline-comparison"><div><h3>Your timeline</h3>{timeline()}</div><div><h3>Expected timeline</h3>{timeline(true)}</div></div>}<div className="section-title"><h3>Answer comparison</h3><span>Yours → expected</span></div><div className="diff-list">{grade.checks.filter(c => !c.key.startsWith('cell.')).map((c: Check) => <div className={`diff-item ${c.correct ? 'correct' : 'incorrect'}`} key={c.key}><span>{c.correct ? '✓' : '×'}</span><strong>{c.label}</strong><span>{c.actual || '—'} <span className="diff-arrow">→</span> {c.expected || '—'}</span></div>)}</div><p className="section-hint">Edit any answer above to start another attempt. Timeline cells also show the expected state on hover or keyboard focus.</p></section>}
      </main>
    </div>
    {pickerTopic && <NewQuestionDialog topic={pickerTopic}
      initialSubject={pickerTopic === topic ? questionSubject(q) : undefined}
      onCancel={() => setPickerTopic(null)}
      onChoose={subject => {
        const nextTopic = pickerTopic;
        setPickerTopic(null);
        confirmLeave(() => { void newQuestion(nextTopic, subject); });
      }} />}
    {pendingLeave && <LeaveQuestionDialog busy={busy} error={error}
      onCancel={() => { setPendingLeave(null); setError(''); }}
      onDiscard={() => { const action = pendingLeave; setPendingLeave(null); action(); }}
      onSave={() => { void saveAndLeave(); }} />}
  </div>;
}
