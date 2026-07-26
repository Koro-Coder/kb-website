import { useEffect, useRef } from 'react';
import katex from 'katex';

export default function MathSpan({ expr }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    try {
      katex.render(expr || '', ref.current, { throwOnError: false, displayMode: false });
    } catch (error) {
      ref.current.textContent = expr;
    }
  }, [expr]);

  return <span ref={ref} className="math" />;
}
