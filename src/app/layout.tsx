import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'OS Trainer Lab', description: 'A local MATA58 operating systems exam trainer for scheduling, paging, and dynamic memory allocation.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode; }>) {
  return <html lang="en"><body>{children}</body></html>;
}
