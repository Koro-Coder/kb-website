import MathSpan from './MathSpan.jsx';
import { assetUrl } from '../api.js';

const IMAGE_MACRO = /\\QuestionFigure(?:NoNumber)?(?:\[[^\]]*\])?\{[^{}]+\}/g;
const MATH_PATTERN = /\$\$([\s\S]*?)\$\$|\$([^$]*?)\$/g;

// Options are stored as raw LaTeX (not pre-tokenized like question body), so
// they still need inline $...$ math parsing + image-macro stripping here —
// mirrors what the old Latex Parser's server.js did server-side, just moved
// client-side now that rendering is React's job.
function renderInlineText(text, keyPrefix) {
  const nodes = [];
  let pos = 0;
  let idx = 0;
  let match;
  const pattern = new RegExp(MATH_PATTERN.source, 'g');
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > pos) {
      nodes.push(<span key={`${keyPrefix}-t${idx}`}>{text.slice(pos, match.index)}</span>);
    }
    const expr = match[1] ?? match[2];
    nodes.push(<MathSpan key={`${keyPrefix}-m${idx}`} expr={expr} />);
    pos = match.index + match[0].length;
    idx += 1;
  }
  if (pos < text.length) {
    nodes.push(<span key={`${keyPrefix}-tail`}>{text.slice(pos)}</span>);
  }
  return nodes;
}

function renderOptionValue(value, images, bookId, keyPrefix) {
  const nodes = [];
  let pos = 0;
  let imgIdx = 0;
  let match;
  const pattern = new RegExp(IMAGE_MACRO.source, 'g');
  while ((match = pattern.exec(value)) !== null) {
    if (match.index > pos) {
      nodes.push(...renderInlineText(value.slice(pos, match.index), `${keyPrefix}-pre${imgIdx}`));
    }
    const image = images[imgIdx];
    if (image) {
      nodes.push(
        <img
          key={`${keyPrefix}-img${imgIdx}`}
          className="option-image"
          src={assetUrl(bookId, image.src)}
          alt="option"
        />
      );
    }
    imgIdx += 1;
    pos = match.index + match[0].length;
  }
  if (pos < value.length) {
    nodes.push(...renderInlineText(value.slice(pos), `${keyPrefix}-tail`));
  }
  return nodes;
}

const OPTION_LABELS = 'ABCDEFGH';

function renderBodyNodes(body, bookId, keyPrefix) {
  return (body || []).map((node, idx) => {
    if (node.type === 'text') {
      return <span key={`${keyPrefix}${idx}`}>{renderInlineText(node.value, `${keyPrefix}${idx}`)} </span>;
    }
    if (node.type === 'math') {
      return <MathSpan key={`${keyPrefix}${idx}`} expr={node.value} />;
    }
    if (node.type === 'image') {
      return (
        <img
          key={`${keyPrefix}${idx}`}
          className="question-image"
          src={assetUrl(bookId, node.src)}
          alt="question"
        />
      );
    }
    if (node.type === 'table') {
      // Cells hold the same body-node shape as everything else, so recursing
      // keeps math/images inside cells rendering identically.
      return (
        <div className="table-scroll" key={`${keyPrefix}${idx}`}>
          <table className="question-table">
            <tbody>
              {node.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} colSpan={cell.colspan > 1 ? cell.colspan : undefined}>
                      {renderBodyNodes(cell.content, bookId, `${keyPrefix}${idx}-${r}-${c}-`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return null;
  });
}

export default function QuestionViewer({ bookId, question }) {
  if (!question) return null;

  return (
    <div className="question-card">
      <div className="question-meta">
        {question.questionId && <strong>Q{question.questionId}</strong>}
        <strong>{question.questionType}</strong>
        <span>{question.year}</span>
        {question.marks && !question.starred && <span>{question.marks} Mark(s)</span>}
      </div>

      {question.commonData && question.commonData.body && question.commonData.body.length > 0 && (
        <div className="common-data">
          <div className="common-data-label">Common Data</div>
          {renderBodyNodes(question.commonData.body, bookId, 'cd')}
        </div>
      )}

      <div className="question-body">{renderBodyNodes(question.body, bookId, 'b')}</div>

      {question.options && question.options.length > 0 && (
        <div className="options">
          {question.options.map((opt, idx) => (
            <div className="option" key={idx}>
              <strong>({OPTION_LABELS[idx] || idx + 1})</strong>{' '}
              {renderOptionValue(opt.value, opt.images || [], bookId, `o${idx}`)}
            </div>
          ))}
        </div>
      )}

      {question.answer && (
        <details className="answer">
          <summary>Show answer</summary>
          <div>{renderInlineText(String(question.answer), 'ans')}</div>
        </details>
      )}
    </div>
  );
}
