import MathSpan from './MathSpan.jsx';
import Brand from './Brand.jsx';
import BookmarkButton from './BookmarkButton.jsx';
import QuestionActions from './QuestionActions.jsx';
import RateQuestion from './RateQuestion.jsx';
import { assetUrl, solutionAssetUrl } from '../api.js';

const IMAGE_MACRO = /\\QuestionFigure(?:NoNumber)?(?:\[[^\]]*\])?\{[^{}]+\}/g;
// All four standard LaTeX math delimiters, in capture-group order:
//   1  $$…$$   display
//   2  \[…\]   display
//   3  $…$     inline
//   4  \(…\)   inline
//
// The bracket forms were missing here, so an option written \(e^{j2\pi t}\) —
// valid source the server tokenizer has always understood for question bodies
// (see parsing/texTokenizer.js) — printed as literal backslashes and braces.
// Options and \item labels are stored as raw LaTeX and parsed here rather than
// server-side, so they need their own copy of this knowledge.
//
// The (?<!\\) guards make an escaped delimiter ineligible: \$ is LaTeX for a
// literal dollar (prose like "costs \$5 to \$10" would otherwise have its
// middle swallowed as maths), and \\[ is LaTeX's line break followed by a
// bracket, which without the guard would match as an opening \[ one character
// in.
const MATH_PATTERN =
  /(?<!\\)\$\$([\s\S]*?)(?<!\\)\$\$|(?<!\\)\\\[([\s\S]*?)(?<!\\)\\\]|(?<!\\)\$([^$]*?)(?<!\\)\$|(?<!\\)\\\(([\s\S]*?)(?<!\\)\\\)/g;

// LaTeX escapes for literal characters: \& \% \_ \# \$ \{ \} and friends. The
// server tokenizer already resolves these in question BODY text — anything
// after a backslash that is not a letter is a literal character, see
// parseInlineContent in parsing/texTokenizer.js — which is why a table cell
// reading "Power \& fuel" prints an ampersand. Options and \item labels never
// go through that pass (they are stored raw and parsed here), so without this
// the identical source printed "Power \& fuel" verbatim in an option while
// rendering correctly two lines above it in the body.
//
// The \\ alternative matches first so LaTeX's own line break is consumed as a
// unit: without it, "\\&" would be read as a backslash followed by an escaped
// ampersand. Deliberately mirrors the tokenizer's rule rather than listing
// characters, so the two paths cannot drift.
function unescapeLatexText(text) {
  return text.replace(/\\\\|\\([^A-Za-z*])/g, (match, literal) =>
    literal === undefined ? match : literal
  );
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
        <span key={`${keyPrefix}-t${idx}`}>{unescapeLatexText(text.slice(pos, match.index))}</span>
      );
    }
    // Which group matched tells us both the expression and, because the two
    // display forms are groups 1 and 2, whether it renders as a block.
    const expr = match[1] ?? match[2] ?? match[3] ?? match[4];
    const display = match[1] !== undefined || match[2] !== undefined;
    nodes.push(<MathSpan key={`${keyPrefix}-m${idx}`} expr={expr} display={display} />);
    pos = match.index + match[0].length;
    idx += 1;
  }
  if (pos < text.length) {
    nodes.push(<span key={`${keyPrefix}-tail`}>{unescapeLatexText(text.slice(pos))}</span>);
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
      // No trailing space here any more. It used to paper over the tokenizer
      // trimming every text node — it restored the space AFTER a text run but
      // could not restore the one before it, so "$M_1$ and" still ran together.
      // The tokenizer now preserves both, and adding one here would insert a
      // space the source never had.
      return <span key={`${keyPrefix}${idx}`}>{renderInlineText(node.value, `${keyPrefix}${idx}`)}</span>;
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
        {/* Marks is the 4th macro argument. Number(), not truthiness: it
            arrives as a string, so a "0" would otherwise print as "0 Marks".
            Starred (practice) questions write 0 there by convention and carry
            no marks at all — the !starred guard states that intent, and the
            > 0 test is what actually holds if one is ever written unstarred. */}
        {!question.starred && Number(question.marks) > 0 && (
          <span>
            {question.marks} {Number(question.marks) === 1 ? 'Mark' : 'Marks'}
          </span>
        )}
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

      {/* A quiet mark between the question and its options. A screenshot of a
          single question travels a lot further than the page it was taken
          from, and this is the only thing inside that crop saying where it
          came from. Rendered for every question, not just MCQs — a NAT
          question is just as screenshottable, it simply has no options for
          this to sit above. aria-hidden because it is decoration: the header
          already names the site to anyone reading the page itself. */}
      <div className="question-watermark" aria-hidden="true">
        <Brand />
      </div>

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

      {/* The video request now lives inside the solution section — but a
          question with no solution at all has no such section to put it in,
          and those are exactly the ones most worth asking about, so it stays
          out here in that one case. */}
      {!question.solution && (
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
          with a solution you have actually opened and read — and asking for a
          video is the same judgement, made at the same moment ("I have read
          this and still want it explained"). Requesting one is only offered
          when there isn't a video already. */}
      <QuestionActions
        bookId={bookId}
        subject={subject}
        question={question}
        types={solution.video ? ['solution_issue'] : ['solution_issue', 'video_request']}
      />
    </details>
  );
}
