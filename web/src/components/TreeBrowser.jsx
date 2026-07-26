function resolvePath(tree, path) {
  let items = tree;
  const trail = [];
  for (const key of path) {
    const node = items.find((n) => n.key === key);
    if (!node) break;
    trail.push(node);
    items = node.children || [];
  }
  return { items, trail };
}

// Generic drill-down grid: works for any depth/shape of the merged subject
// tree (Year>Session, Chapter>Branch, Domain>Branch>Chapter) because every
// node is either {children:[...]} or {leaf:{bookId,fileId}}.
export default function TreeBrowser({ tree, path, onNavigateToDepth, onEnterBranch, onSelectLeaf }) {
  const { items, trail } = resolvePath(tree, path);

  return (
    <div>
      {trail.length > 0 && (
        <div className="breadcrumbs">
          <button className="link" onClick={() => onNavigateToDepth(0)}>
            All
          </button>
          {trail.map((node, idx) => (
            <span key={node.key}>
              {' '}
              /{' '}
              <button className="link" onClick={() => onNavigateToDepth(idx + 1)}>
                {node.label}
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="grid">
        {items.map((node) =>
          node.leaf ? (
            <button key={node.key} className="tile leaf" onClick={() => onSelectLeaf(node.leaf, node.label)}>
              {node.label}
            </button>
          ) : (
            <button key={node.key} className="tile" onClick={() => onEnterBranch(node.key)}>
              {node.label}
              <span className="muted small"> ({(node.children || []).length})</span>
            </button>
          )
        )}
        {items.length === 0 && <p className="muted">Nothing here yet.</p>}
      </div>
    </div>
  );
}
