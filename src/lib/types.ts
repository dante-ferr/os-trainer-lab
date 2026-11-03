export type Topic = 'scheduling' | 'paging' | 'allocation';
export type Cell = '' | '■' | 'X' | '•';
export type Algorithm = 'FCFS' | 'SJF' | 'SRTF' | 'RR' | 'EDF';
export type Fit = 'First Fit' | 'Next Fit' | 'Best Fit' | 'Worst Fit';
export interface Process {
  id: string;
  arrival: number;
  duration: number;
  /** Time allowed after arrival; absolute due time is arrival + deadline. */
  deadline: number;
}
export interface SchedulingConfig { algorithm: Algorithm; quantum: number; overhead: number; processes: Process[]; }
export interface PagingConfig { virtual_bits: number; physical_bits: number; offset_bits: number; replacement: 'FIFO' | 'LRU'; references: number[]; }
export interface AllocationConfig { algorithm: Fit; blocks: number[]; requests: number[]; }
export interface Question {
  meta: { id: string; title: string; topic: Topic; index?: number; description?: string; };
  attempt?: { answers: Answers; };
  scheduling?: { config: SchedulingConfig; solution: { timeline: Record<string, Cell[]>; response_times: Record<string, number>; }; };
  paging?: {
    config: PagingConfig;
    solution: {
      offset: number;
      vpn: number;
      pfn: number;
      page_size: number;
      frame_count: number;
      page_faults: number;
      /** VPN resident in each frame after every reference; −1 marks an empty frame. */
      frames_history: number[][];
      /** Frame mapped to each referenced VPN after every reference; −1 marks absent. */
      page_history: Record<string, number[]>;
      mappings: Record<string, { frame: number; valid: number; }>;
    };
  };
  allocation?: { config: AllocationConfig; solution: { assignments: number[]; remaining: number[]; }; };
}
export interface PublicQuestion { saved?: boolean; answers?: Answers; meta: Question['meta']; scheduling?: { config: SchedulingConfig; horizon: number; }; paging?: { config: PagingConfig; pages: number[]; }; allocation?: { config: AllocationConfig; }; }
export interface Check { key: string; label: string; actual: string; expected: string; correct: boolean; }
export interface Grade { score: number; correct: number; total: number; checks: Check[]; }
export type Answers = Record<string, string>;
