# kb-website

Public question viewer for the PrepFusion question bank. Pick a subject, drill
down, and read any past question rendered from its original LaTeX.

Reads the knowledge base produced by [`kb-ingest`](../kb-ingest).

## Running

```bash
npm install
npm start          # API on http://localhost:4002
```

The React UI is a separate Vite app:

```bash
npm --prefix web install
npm --prefix web run dev   # UI on http://localhost:5174
```

### Configuration (`.env`, not committed)

```
GITHUB_TOKEN=<PAT with read access to the content repos>
DEFAULT_ACCOUNT=<github org/user owning the content repos>
KB_DATA_DIR=../kb-data
```

A token is required at runtime, not just at ingest time: the knowledge base
holds only an index, so question text and images are fetched live from GitHub
on each request.

## Navigation

The site never exposes "book" (i.e. one repo) as a concept. Every book of a
subject is merged into a single tree, so adding a repo just adds nodes:

- **Aptitude** — Year → Session → question
- **Maths** — Chapter → Branch → question
- **Technical** — Domain → Branch → Chapter → question

Questions are listed by their real ID (`Q3.06.2` = chapter 3, 2006, question 2)
rather than a sequential counter.

## Rendering

Questions are stored as a small node tree (`text`, `math`, `image`, `table`)
and rendered client-side:

- **Math** via KaTeX — `$…$`, `$$…$$`, `\(…\)`, `\[…\]`
- **Images** proxied through `/assets/:bookId/*` so private repos stay private
- **Tables** as real HTML tables, including `\multicolumn` → `colspan`
- **Common data** blocks shown above every question that links to them

## Parser

`server/parsing/` is intentionally a copy of the same tokenizer and adapters
used by `kb-ingest`, so the site can re-parse a file live and get byte-identical
results. Any change to parsing must be applied to both projects.
