# OS Trainer Lab

A local Operating Systems exam trainer built with Next.js, React, TypeScript and Tailwind CSS.

- **CPU scheduling:** FCFS, SJF, SRTF, Round Robin and EDF.
- **Virtual memory:** address calculations and FIFO/LRU paging.
- **Memory allocation:** First, Next, Best and Worst Fit.

## Run

Requires **Node.js 22.18+** and npm. No API keys or environment variables needed.

```sh
npm install
npm run dev
```

Open [127.0.0.1:3000](http://127.0.0.1:3000). For production, run `npm run build` then `npm start`.

## Practice

Choose an exercise type from home, then select its algorithm. Fill in your answer and select **Check my answer** for a visual comparison and accuracy score.

**New question** creates a temporary exercise. **Save question** keeps the question and your current answers in `questions/<topic>/<id>.toml`; reopen it from **Saved questions**. Unsaved changes trigger confirmation before leaving. Reloading returns home.

For timeline cells, use `1` executing, `2` overhead, `3` ready or `4` empty, then click to paint.

## Course conventions

- Overhead applies only to preemption, never natural completion. EDF uses a quantum and compares **arrival + deadline** when the CPU is assigned. A running process keeps the CPU until its quantum expires or it finishes. Deadlines are relative to arrival.
- “Response time” means **completion − arrival**.
- Virtual and physical addresses share the same offset width. Paging starts with empty frames. For each frame and VPN, record the comma-separated history of values; the last entry is current. Append `-1` in the page table when a page is evicted.
- Allocations split free blocks. Next Fit resumes at the last block’s remainder. Ties choose the lowest block index.

## Commands

```sh
npm test
npm run typecheck
npm run generate -- scheduling EDF
npm run generate -- paging LRU
npm run generate -- allocation "Best Fit"
npm run generate -- --seed  # Add built-in examples without overwriting
```

CLI generation saves directly to the topic folder. Use **Reload saved questions** afterward.

Question files contain `[meta]`, `[<topic>.config]`, `[<topic>.solution]`, and optional `[attempt]` answers. The schema-focused TOML reader supports tables, strings, numbers, booleans, arrays and inline tables; dates, multiline strings and array-of-tables are unsupported. Imported answer keys are validated against the course rules.
