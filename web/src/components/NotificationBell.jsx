import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { listNotifications, markAllNotificationsRead, dismissNotification } from '../api.js';

const ICONS = {
  question_updated: '✎',
  solution_updated: '✓',
  video_uploaded: '🎬'
};

function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toISOString().slice(0, 10);
}

// The link back to the question that changed. The ordinal is a hint captured
// when the report was filed, so it can be missing on older rows — those still
// show, just without a link.
function questionHref(n) {
  if (!n.subject || !n.ordinal) {
    return null;
  }
  const params = new URLSearchParams({
    bookId: n.bookId,
    fileId: n.fileId,
    ordinal: String(n.ordinal)
  });
  return `/subject/${n.subject}?${params.toString()}`;
}

export default function NotificationBell() {
  const { isSignedIn, authFetch } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const panelRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const data = await listNotifications(authFetch);
      setItems(data.notifications);
      setUnread(data.unread);
    } catch (e) {
      /* a failed poll should not break the page */
    }
  }, [isSignedIn, authFetch]);

  useEffect(() => {
    refresh();
    // Resolutions happen on the admin side, so the only way this page learns
    // about one is by asking again periodically.
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, [refresh]);

  // Click outside closes the panel, as a dropdown should.
  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!isSignedIn) {
    return null;
  }

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      await refresh();
      if (unread > 0) {
        // Opening the panel is what "seen" means.
        try {
          await markAllNotificationsRead(authFetch);
          setUnread(0);
          setItems((current) => current.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
        } catch (e) {
          /* leaving the badge up is better than a crash */
        }
      }
    }
  };

  const go = (n) => {
    const href = questionHref(n);
    if (!href) return;
    setOpen(false);
    navigate(href);
  };

  const dismiss = async (event, n) => {
    event.stopPropagation();
    await dismissNotification(authFetch, n.id);
    setItems((current) => current.filter((x) => x.id !== n.id));
  };

  return (
    <div className="bell-wrap" ref={panelRef}>
      <button
        className="bell-btn"
        onClick={toggle}
        aria-label={unread ? `${unread} unread notifications` : 'Notifications'}
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && <span className="bell-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-panel">
          <div className="bell-head">
            <strong>Notifications</strong>
            <span className="muted small">{items.length}</span>
          </div>

          {items.length === 0 && (
            <p className="muted small bell-empty">
              Nothing yet. When a question or solution you reported is updated, it appears here.
            </p>
          )}

          <ul className="bell-list">
            {items.map((n) => {
              const href = questionHref(n);
              return (
                <li
                  key={n.id}
                  className={`${n.readAt ? '' : 'is-unread'}${href ? ' is-linked' : ''}`}
                  onClick={() => go(n)}
                >
                  <span className="bell-icon" aria-hidden="true">
                    {ICONS[n.type] || '•'}
                  </span>
                  <span className="bell-text">
                    <strong>{n.title}</strong>
                    <span className="muted small"> · {timeAgo(n.createdAt)}</span>
                    <div className="muted small">{n.body}</div>
                    {n.questionId && <div className="bell-q">Q{n.questionId}</div>}
                  </span>
                  <button className="bell-dismiss" onClick={(e) => dismiss(e, n)} title="Dismiss">
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
