/** Next.js may normalize request.url to localhost. Compare the browser Origin
 * with the actual HTTP Host header, not that internal normalized hostname. */
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // Allow local CLI requests without a browser Origin.
  try {
    const source = new URL(origin), internal = new URL(request.url);
    const host = request.headers.get('host') ?? internal.host;
    return source.host === host && source.protocol === internal.protocol;
  } catch { return false; }
}
