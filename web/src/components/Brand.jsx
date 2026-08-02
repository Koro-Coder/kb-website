// The PrepFusion wordmark. No logo bitmap ships with this app, so the mark is
// drawn: a rounded ink tile with a P in it, then "Prep" in the surrounding ink
// and "Fusion" in the wordmark blue.
//
// NEVER uppercase this — the mark is "PrepFusion", not "PREPFUSION".
export default function Brand({ large = false, className = '' }) {
  return (
    <span className={`bm${large ? ' bm-lg' : ''}${className ? ` ${className}` : ''}`}>
      <span className="bm-mono" aria-hidden="true">
        P
      </span>
      <span className="bm-text">
        Prep<b>Fusion</b>
      </span>
    </span>
  );
}
