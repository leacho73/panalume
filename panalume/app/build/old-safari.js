// Older Safari drops any rule using something it doesn't know: color-mix()
// (before 16.2), so a tint or highlight disappears, and dvh (before 15.4), so
// pop-ups lose their height limit. This adds a plain fallback just before each
// of those rules: newer browsers use the one that follows, older ones keep the
// fallback. It runs on the finished CSS so the minifier can't fold it away.

// Index of the bracket that closes the one at `open`.
function close(s, open) {
  for (let i = open, depth = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

// Splits at top-level commas.
function args(s) {
  const out = [];
  let depth = 0, start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === ',' && depth === 0) { out.push(s.slice(start, i).trim()); start = i + 1; }
  }
  return [...out, s.slice(start).trim()];
}

// color-mix(in srgb, A 30%, B) → B, or a faint white when B is transparent,
// so "on" and "selected" states still show.
function plain(value) {
  let i;
  while ((i = value.indexOf('color-mix(')) !== -1) {
    const end = close(value, i + 9);
    if (end === -1) return null;
    const [, a, b = 'transparent'] = args(value.slice(i + 10, end));
    const pct = Number(/(\d+(?:\.\d+)?)%\s*$/.exec(a)?.[1] ?? 50);
    const bare = b.replace(/\s+\d+(?:\.\d+)?%$/, '');
    const fb = bare === 'transparent' ? `rgba(255,255,255,${Math.min(0.3, +(pct / 300).toFixed(2))})` : bare;
    value = value.slice(0, i) + fb + value.slice(end + 1);
  }
  return value;
}

export function addFallbacks(css) {
  let out = '', depth = 0, start = 0;
  const flush = (end) => {
    const decl = css.slice(start, end);
    const m = /^(\s*)([a-z-]+)\s*:([\s\S]*)$/.exec(decl);
    if (m && !m[2].startsWith('--') && (m[3].includes('color-mix(') || /\ddvh\b/.test(m[3]))) {
      const fb = plain(m[3])?.replace(/(\d)dvh\b/g, '$1vh');
      if (fb) out += `${m[1]}${m[2]}:${fb};`;
    }
    out += decl;
  };
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (depth === 0 && (c === ';' || c === '}' || c === '{')) {
      if (c === '{') out += css.slice(start, i);
      else flush(i);
      out += c;
      start = i + 1;
    }
  }
  return out + css.slice(start);
}

export default function oldSafari() {
  return {
    name: 'panalume-old-safari',
    enforce: 'post',
    generateBundle(_, bundle) {
      for (const f of Object.values(bundle)) {
        if (f.type === 'asset' && f.fileName.endsWith('.css')) f.source = addFallbacks(String(f.source));
        // Lookbehind in a regular expression ((?<! or (?<=) needs Safari 16.4
        // and can't be converted, so older Safari throws when it runs.
        if (f.type === 'chunk' && /\(\?<[!=]/.test(f.code)) {
          this.error(`${f.fileName} uses a regular expression lookbehind, which older Safari can't run. Rewrite it without (?<! or (?<=.`);
        }
      }
    },
  };
}
