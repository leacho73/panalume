// A card's Custom CSS: plain declarations (`border-radius: 30px`) style the card
// itself, and rules (`& .name { white-space: normal }`, or just `.name { … }`)
// style parts inside it. Rules are scoped to that one card, without relying on
// the browser supporting CSS nesting (older wall-tablet browsers don't).
export function splitCss(css, scope) {
  let decls = '', rules = '', buf = '', sel = '', depth = 0;
  for (const ch of String(css || '')) {
    if (ch === '{') {
      if (depth++ === 0) {
        const i = buf.lastIndexOf(';');
        decls += buf.slice(0, i + 1);
        sel = buf.slice(i + 1).trim();
        buf = '';
        continue;
      }
    } else if (ch === '}') {
      if (depth > 0 && --depth === 0) {
        const s = sel.split(',').map((x) => x.trim()).filter(Boolean)
          .map((x) => (x.includes('&') ? x.replace(/&/g, scope) : `${scope} ${x}`)).join(', ');
        if (s) rules += `${s} { ${buf} }\n`;
        buf = '';
        continue;
      }
    }
    buf += ch;
  }
  decls += buf;
  return { decls: decls.trim(), rules: rules.replace(/<\//g, '<\\/') };
}
