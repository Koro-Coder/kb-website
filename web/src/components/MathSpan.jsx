import { useEffect, useRef } from 'react';
import katex from 'katex';

// `display` mirrors the delimiter the source used: $$...$$ and \[...\] are
// display math, $...$ and \(...\) are inline. Rendering display math inline is
// not merely cramped — KaTeX rejects \tag{} outright in inline mode, and with
// throwOnError:false it then paints the equation's own LaTeX source on the
// page in red, which is what a reader sees as "the rendering is broken".
// \tag is meaningless in inline math in LaTeX too — amsmath only allows it in
// display environments — so an author who wrote one inside $...$ meant a
// display equation. Honouring that is better than rendering their source text.
const NEEDS_DISPLAY = /\\tag\s*\{/;

export default function MathSpan({ expr, display = false }) {
  const ref = useRef(null);
  const isDisplay = Boolean(display) || NEEDS_DISPLAY.test(expr || '');

  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(expr || '', ref.current, {
        throwOnError: false,
        displayMode: isDisplay,
        // Real source contains macros KaTeX does not know; letting it colour
        // them rather than abort keeps the rest of the equation readable.
        errorColor: '#b3261e',
        strict: false,
        trust: false
      });
    } catch (error) {
      ref.current.textContent = expr;
    }
  }, [expr, isDisplay]);

  // A display equation is a block, so it must not sit inside a <span>.
  const Tag = isDisplay ? 'div' : 'span';
  return <Tag ref={ref} className={isDisplay ? 'math math-display' : 'math'} />;
}
