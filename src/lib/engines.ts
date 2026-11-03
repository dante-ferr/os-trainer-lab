import { absoluteDeadline } from './deadlines.ts';
import type { AllocationConfig, Cell, PagingConfig, SchedulingConfig } from './types.ts';

/** Integer-time simulation. Overhead belongs to the preempted row only. */
export function schedule(config: SchedulingConfig) {
  const { processes, algorithm, quantum, overhead } = config;
  const remaining = processes.map(p => p.duration);
  const timeline: Record<string, Cell[]> = Object.fromEntries(processes.map(p => [p.id, []]));
  const response_times: Record<string, number> = {};
  let time = 0, current = -1, slice = 0;
  let queue: number[] = [];
  const ready = (i: number) => remaining[i] > 0 && processes[i].arrival <= time;
  const enqueue = () => { processes.forEach((_, i) => { if (ready(i) && i !== current && !queue.includes(i)) queue.push(i); }); };
  const tick = (owner: number, state: Cell) => {
    processes.forEach((p, i) => timeline[p.id].push(i === owner ? state : ready(i) ? '•' : ''));
    time++;
  };
  const rank = (i: number) => algorithm === 'EDF' ? absoluteDeadline(processes[i]) : algorithm === 'SRTF' ? remaining[i] : processes[i].duration;
  const choose = () => {
    if (!queue.length) return -1;
    if (algorithm === 'FCFS' || algorithm === 'RR') return queue.shift()!;
    queue.sort((a, b) => rank(a) - rank(b) || processes[a].arrival - processes[b].arrival || a - b);
    return queue.shift()!;
  };
  while (remaining.some(n => n > 0)) {
    if (time > 1000) throw new Error('Scheduling horizon exceeds 1,000 ticks');
    enqueue();
    const expired = current >= 0 && (algorithm === 'RR' || algorithm === 'EDF') && slice >= quantum;
    // EDF waits for the quantum. Only SRTF yields immediately to a higher priority.
    const priority = current >= 0 && algorithm === 'SRTF' && queue.some(i => rank(i) < rank(current));
    if (expired || priority) {
      const outgoing = current;
      // A quantum expiration costs overhead even if the same process resumes.
      for (let x = 0; x < overhead; x++) { tick(outgoing, 'X'); enqueue(); }
      queue.push(outgoing); current = -1; slice = 0;
    }
    if (current < 0) { current = choose(); slice = 0; }
    if (current < 0) { tick(-1, ''); continue; }
    tick(current, '■'); remaining[current]--; slice++;
    if (!remaining[current]) {
      response_times[processes[current].id] = time - processes[current].arrival;
      current = -1; slice = 0;
    }
  }
  response_times.mean = processes.reduce((sum, p) => sum + response_times[p.id], 0) / processes.length;
  return { timeline, response_times };
}

/** Demand paging starts empty; lowest free frame first, then FIFO or LRU.
 * Histories append only when a value changes; the last entry is the current one. */
export function page(config: PagingConfig) {
  const frame_count = 2 ** (config.physical_bits - config.offset_bits);
  const frames: (number | null)[] = Array(frame_count).fill(null);
  const loaded = new Map<number, number>(), used = new Map<number, number>();
  const pages = [...new Set(config.references)].sort((a, b) => a - b);
  const frames_history: number[][] = Array.from({ length: frame_count }, () => []);
  const page_history: Record<string, number[]> = Object.fromEntries(pages.map(vpn => [String(vpn), []]));
  let page_faults = 0;
  config.references.forEach((vpn, time) => {
    if (!frames.includes(vpn)) {
      page_faults++;
      let frame = frames.indexOf(null);
      if (frame < 0) {
        const clock = config.replacement === 'FIFO' ? loaded : used;
        frame = frames.reduce((best: number, p, i) => clock.get(p!)! < clock.get(frames[best]!)! ? i : best, 0);
        page_history[String(frames[frame]!)].push(-1);
      }
      frames[frame] = vpn;
      loaded.set(vpn, time);
      frames_history[frame].push(vpn);
      page_history[String(vpn)].push(frame);
    }
    used.set(vpn, time);
  });
  const mappings = Object.fromEntries(pages.map(vpn => {
    const frame = frames.indexOf(vpn);
    return [String(vpn), { frame, valid: frame >= 0 ? 1 : 0 }];
  }));
  return {
    offset: config.offset_bits,
    vpn: config.virtual_bits - config.offset_bits,
    pfn: config.physical_bits - config.offset_bits,
    page_size: 2 ** config.offset_bits,
    frame_count,
    page_faults,
    frames_history,
    page_history,
    mappings,
  };
}

/** Variable partitions split in place. Next Fit resumes at the last used remainder. */
export function allocate(config: AllocationConfig) {
  const remaining = [...config.blocks];
  let cursor = 0;
  const assignments = config.requests.map(size => {
    let candidates = remaining.map((space, i) => ({ space, i })).filter(b => b.space >= size);
    if (config.algorithm === 'Best Fit') candidates.sort((a, b) => a.space - b.space || a.i - b.i);
    if (config.algorithm === 'Worst Fit') candidates.sort((a, b) => b.space - a.space || a.i - b.i);
    if (config.algorithm === 'Next Fit') candidates.sort((a, b) => (a.i - cursor + remaining.length) % remaining.length - (b.i - cursor + remaining.length) % remaining.length);
    const index = candidates[0]?.i ?? -1;
    if (index >= 0) { remaining[index] -= size; cursor = index; }
    return index;
  });
  return { assignments, remaining };
}
