import MathSpan from './MathSpan.jsx';
import BookmarkButton from './BookmarkButton.jsx';
import QuestionActions from './QuestionActions.jsx';
import RateQuestion from './RateQuestion.jsx';
import { assetUrl, solutionAssetUrl } from '../api.js';

const IMAGE_MACRO = /\\QuestionFigure(?:NoNumber)?(?:\[[^\]]*\])?\{[^{}]+\}/g;
// The (?<!\\) guards make an escaped \$ — LaTeX for a literal dollar sign —
// ineligible as a delimiter. Without them, prose like "costs \$5 to \$10"
// would have its middle swallowed and rendered as maths.
const MATH_PATTERN = /(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$|(?<!\\)\$([^$]*?)(?<!\\)\$/g;

// A literal dollar reaches us as \$ (still escaped, from raw LaTeX) or as a
// bare $ (the tokenizer unescapes it in body text). Only the former needs
// unescaping for display.
function unescapeDollars(text) {
  return text.replace(/\\\$/g, '$');
}

// Options and \item[...] labels are stored as raw LaTeX (not pre-tokenized
// like the question body), so they still need inline $...$ math parsing +
// image-macro stripping here — mirrors what the old Latex Parser's server.js
// did server-side, just moved client-side now that rendering is React's job.
function renderInlineText(text, keyPrefix) {
  const nodes = [];
  let pos = 0;
  let idx = 0;
  let match;
  const pattern = new RegExp(MATH_PATTERN.source, 'g');
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > pos) {
      nodes.push(
        <span key={`${keyPrefix}-t${idx}`}>{unescapeDollars(text.slice(pos, match.index))}</span>
      );
    }
    // match[1] is the $$...$$ capture, match[2] the $...$ one — so the
    // delimiter tells us display vs inline here too.
    const expr = match[1] ?? match[2];
    nodes.push(<MathSpan key={`${keyPrefix}-m${idx}`} expr={expr} display={match[1] !== undefined} />);
    pos = match.index + match[0].length;
    idx += 1;
  }
  if (pos < text.length) {
    nodes.push(<span key={`${keyPrefix}-tail`}>{unescapeDollars(text.slice(pos))}</span>);
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

// `urlFor` decides which repo images resolve against — question figures come
// from the question repo, solution figures from the solutions repo.
function renderBodyNodes(body, bookId, keyPrefix, urlFor = assetUrl) {
  return (body || []).map((node, idx) => {
    if (node.type === 'text') {
      return <span key={`${keyPrefix}${idx}`}>{renderInlineText(node.value, `${keyPrefix}${idx}`)} </span>;
    }
    if (node.type === 'math') {
      return <MathSpan key={`${keyPrefix}${idx}`} expr={node.value} display={node.display} />;
    }
    if (node.type === 'image') {
      return (
        <img
          key={`${keyPrefix}${idx}`}
          className="question-image"
          src={urlFor(bookId, node.src)}
          alt="question"
        />
      );
    }
    if (node.type === 'list') {
      const Tag = node.ordered ? 'ol' : 'ul';
      return (
        <Tag className="body-list" key={`${keyPrefix}${idx}`}>
          {node.items.map((item, n) => (
            // A custom \item[(I)] marker replaces the bullet rather than
            // sitting alongside it, matching how LaTeX renders it.
            <li key={n} className={item.label ? 'labelled' : undefined}>
              {/* The marker is raw LaTeX like "$P$." — matching exercises label
                  their rows with maths — so it needs the same inline pass the
                  item's content gets, or the dollars render literally. */}
              {item.label && (
                <span className="item-label">
                  {renderInlineText(item.label, `${keyPrefix}${idx}-${n}-label`)}
                </span>
              )}
              {renderBodyNodes(item.content, bookId, `${keyPrefix}${idx}-${n}-`, urlFor)}
            </li>
          ))}
        </Tag>
      );
    }
    if (node.type === 'method' || node.type === 'keypoints' || node.type === 'mistakes') {
      const heading =
        node.type === 'method'
          ? `Method ${node.label}`
          : node.type === 'keypoints'
            ? 'Key Points'
            : 'Mistakes to Avoid';
      return (
        <div className={`sol-block sol-${node.type}`} key={`${keyPrefix}${idx}`}>
          <div className="sol-block-title">{heading}</div>
          {renderBodyNodes(node.content, bookId, `${keyPrefix}${idx}-`, urlFor)}
        </div>
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
                      {renderBodyNodes(cell.content, bookId, `${keyPrefix}${idx}-${r}-${c}-`, urlFor)}
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

export default function QuestionViewer({ bookId, subject, question }) {
  if (!question) return null;

  return (
    <div className="question-card">
      <div className="question-meta">
        {question.questionId && <strong>Q{question.questionId}</strong>}
        <strong>{question.questionType}</strong>
        <span>{question.year}</span>
        {question.marks && !question.starred && <span>{question.marks} Mark(s)</span>}
        <span className="question-meta-spacer" />
        <BookmarkButton bookId={bookId} subject={subject} question={question} />
      </div>

      <RateQuestion bookId={bookId} subject={subject} question={question} />

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

      {/* Sits directly below the question and its options, before the answer:
          a problem with the question is something you notice while reading it,
          not after working through the solution. */}
      <QuestionActions
        bookId={bookId}
        subject={subject}
        question={question}
        types={['question_issue']}
      />

      {question.answer && (
        <details className="answer">
          <summary>Show answer</summary>
          <div>{renderInlineText(String(question.answer), 'ans')}</div>
        </details>
      )}

      {question.solution && (
        <SolutionSection
          bookId={bookId}
          subject={subject}
          question={question}
          solution={question.solution}
        />
      )}

      {/* Requesting a video only makes sense when there isn't one already.
          Nothing renders here when there is, since the question report has
          moved up to sit under the question itself. */}
      {!(question.solution && question.solution.video) && (
        <QuestionActions
          bookId={bookId}
          subject={subject}
          question={question}
          types={['video_request']}
        />
      )}
    </div>
  );
}

const DIFFICULTY_LABELS = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };

// Accepts the forms authors actually write — youtu.be/ID, watch?v=ID,
// /embed/ID, /shorts/ID, /live/ID — and returns a privacy-mode embed URL,
// preserving a start time if one was given. Returns null for anything that
// isn't recognisably a YouTube video, so we never drop an arbitrary URL into
// an iframe.
function toYouTubeEmbed(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl).trim());
  } catch (error) {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\.|^m\./, '');
  let id = null;

  if (host === 'youtu.be') {
    id = parsed.pathname.slice(1).split('/')[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') {
      id = parsed.searchParams.get('v');
    } else {
      const match = /^\/(embed|shorts|live|v)\/([^/?#]+)/.exec(parsed.pathname);
      id = match ? match[2] : null;
    }
  }

  if (!id || !/^[\w-]{6,20}$/.test(id)) {
    return null;
  }

  const start = parsed.searchParams.get('t') || parsed.searchParams.get('start');
  const seconds = start ? String(start).replace(/[^\d]/g, '') : '';
  const query = seconds ? `?start=${seconds}` : '';
  return `https://www.youtube-nocookie.com/embed/${id}${query}`;
}

function SolutionSection({ bookId, subject, question, solution }) {
  const level = Number(solution.difficulty);
  const embedUrl = solution.video ? toYouTubeEmbed(solution.video) : null;
  return (
    // Collapsed by default so the question can be attempted before the
    // solution is visible.
    <details className="solution">
      <summary>Show solution</summary>
      <div className="solution-meta">
        {Number.isFinite(level) && level > 0 && (
          <span className="difficulty" title={DIFFICULTY_LABELS[level] || ''}>
            {'●'.repeat(level)}
            {'○'.repeat(Math.max(0, 3 - level))} {DIFFICULTY_LABELS[level] || ''}
          </span>
        )}
        {solution.video && !embedUrl && (
          <a className="video-link" href={solution.video} target="_blank" rel="noopener noreferrer">
            Watch video solution
          </a>
        )}
      </div>

      {embedUrl && (
        // Inside a closed <details> the iframe isn't rendered at all, so the
        // YouTube player only loads once the solution is actually opened.
        <div className="video-embed">
          <iframe
            src={embedUrl}
            title="Video solution"
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      )}

      <div className="solution-body">{renderBodyNodes(solution.body, bookId, 'sol', solutionAssetUrl)}</div>

      {/* Sits inside the collapsed solution: you can only report a problem
          with a solution you have actually opened and read. */}
      <QuestionActions
        bookId={bookId}
        subject={subject}
        question={question}
        types={['solution_issue']}
      />
    </details>
  );
}
