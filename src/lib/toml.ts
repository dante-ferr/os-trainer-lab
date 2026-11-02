/** Schema-focused TOML reader: tables, dotted/bare/quoted keys, strings,
 * finite numbers, booleans, arrays and inline tables. No dates or array-tables.
 * Unsupported syntax fails explicitly instead of being silently ignored.
 */
export function parseToml(source: string): Record<string, unknown> {
  let pos = 0;
  const fail = (message: string): never => { throw new Error(`TOML line ${source.slice(0, pos).split('\n').length}: ${message}`); };
  const skip = () => {
    while (pos < source.length) {
      if (/\s/.test(source[pos])) { pos++; continue; }
      if (source[pos] === '#') { while (pos < source.length && source[pos] !== '\n') pos++; continue; }
      break;
    }
  };
  const string = (): string => {
    const quote = source[pos++]; let raw = '';
    while (pos < source.length) {
      const c = source[pos++];
      if (c === quote) {
        if (quote === "'") return raw;
        try { return JSON.parse('"' + raw + '"') as string; } catch { return fail('Invalid string escape'); }
      }
      if (c === '\n' || c === '\r') fail('Multiline strings are unsupported');
      raw += c;
      if (c === '\\' && quote === '"') { if (pos >= source.length) fail('Unterminated escape'); raw += source[pos++]; }
    }
    return fail('Unterminated string');
  };
  const key = (): string => {
    skip();
    if (source[pos] === '"' || source[pos] === "'") return string();
    const m = /^[A-Za-z0-9_-]+/.exec(source.slice(pos));
    if (!m) return fail('Expected key');
    pos += m[0].length; return m[0];
  };
  const path = () => { const keys = [key()]; skip(); while (source[pos] === '.') { pos++; keys.push(key()); skip(); } return keys; };
  const object = (): Record<string, unknown> => Object.create(null) as Record<string, unknown>;
  const put = (target: Record<string, unknown>, keys: string[], value: unknown) => {
    for (const k of keys.slice(0, -1)) {
      if (!Object.hasOwn(target, k)) target[k] = object();
      if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) fail('Key conflicts with table');
      target = target[k] as Record<string, unknown>;
    }
    const k = keys.at(-1)!;
    if (Object.hasOwn(target, k)) fail(`Duplicate key ${k}`);
    target[k] = value;
  };
  const value = (): unknown => {
    skip(); const c = source[pos];
    if (c === '"' || c === "'") return string();
    if (c === '[') {
      pos++; const out: unknown[] = []; skip();
      while (source[pos] !== ']') {
        out.push(value()); skip();
        if (source[pos] === ']') break;
        if (source[pos++] !== ',') fail('Expected comma in array');
        skip();
      }
      pos++; return out;
    }
    if (c === '{') {
      pos++; const out = object(); skip();
      while (source[pos] !== '}') {
        const keys = path(); if (source[pos++] !== '=') fail('Expected =');
        put(out, keys, value()); skip();
        if (source[pos] === '}') break;
        if (source[pos++] !== ',') fail('Expected comma in inline table');
        skip();
      }
      pos++; return out;
    }
    const m = /^(true|false|[+-]?(?:\d[\d_]*)(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?)(?=[\s,\]}#]|$)/.exec(source.slice(pos));
    if (!m) return fail('Unsupported or invalid value');
    pos += m[0].length;
    if (m[0] === 'true' || m[0] === 'false') return m[0] === 'true';
    const n = Number(m[0].replaceAll('_', '')); if (!Number.isFinite(n)) fail('Nonfinite number'); return n;
  };
  const root = object(); let table = root; const declared = new Set<string>();
  skip();
  while (pos < source.length) {
    if (source[pos] === '[') {
      pos++; const keys = path(); if (source[pos++] !== ']') fail('Expected table closing ]');
      const name = JSON.stringify(keys); if (declared.has(name)) fail('Duplicate table'); declared.add(name);
      table = root;
      for (const k of keys) {
        if (!Object.hasOwn(table, k)) table[k] = object();
        if (!table[k] || typeof table[k] !== 'object' || Array.isArray(table[k])) fail('Invalid table');
        table = table[k] as Record<string, unknown>;
      }
    } else {
      const keys = path(); if (source[pos++] !== '=') fail('Expected = after key');
      put(table, keys, value());
    }
    while (source[pos] === ' ' || source[pos] === '\t' || source[pos] === '\r') pos++;
    if (source[pos] === '#') while (pos < source.length && source[pos] !== '\n') pos++;
    if (pos < source.length && source[pos] !== '\n') fail('Expected newline');
    skip();
  }
  return root;
}

export function inlineToml(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map(inlineToml).join(', ')}]`;
  if (value && typeof value === 'object') return `{ ${Object.entries(value).map(([k, v]) => `${JSON.stringify(k)} = ${inlineToml(v)}`).join(', ')} }`;
  throw new Error('Unsupported TOML value');
}
