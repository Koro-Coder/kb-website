import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { useTheme } from '../theme.js';
import Brand from './Brand.jsx';
import NotificationBell from './NotificationBell.jsx';

// One bar for everything: where you are, where else you can go, and who you
// are. The account controls used to sit in a second row of their own, which
// gave the page two competing headers.

function Icon({ path, size = 15 }) {
  return (
    <svg
      className="nav-ic"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}

const BOOK_ICON = (
  <>
    <path d="M12 21V7" />
    <path d="M3 5a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3H4a1 1 0 0 1-1-1Z" />
  </>
);

const CAP_ICON = (
  <>
    <path d="M21.4 10.9a1 1 0 0 0 0-1.8L12.8 5.2a2 2 0 0 0-1.6 0L2.6 9.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.6 0Z" />
    <path d="M22 10v6" />
    <path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5" />
  </>
);

const SEARCH_ICON = (
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>
);

const BAG_ICON = (
  <>
    <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
    <path d="M3 6h18" />
    <path d="M16 10a4 4 0 0 1-8 0" />
  </>
);

function YouTubeMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#FF0000"
        d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8Z"
      />
      <path fill="#fff" d="M9.6 15.6V8.4L15.8 12z" />
    </svg>
  );
}

function ComingSoon({ label, icon, title }) {
  return (
    <span className="nav-soon" title={title}>
      <Icon path={icon} />
      {label}
      <span className="soon-tag">
        <span className="soon-dot" aria-hidden="true" />
        Soon
      </span>
    </span>
  );
}

function YouTubeMenu() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // The panel is position:fixed, because on a phone the nav row scrolls
  // sideways and would clip an absolutely-positioned child. Fixed means the
  // scrolling ancestor cannot clip it, so its coordinates come from the
  // button's own rect at the moment it opens.
  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, left: rect.left });
    }
    setOpen((prev) => !prev);
  };

  return (
    <div className="nav-dd" ref={wrapRef}>
      <button
        type="button"
        ref={btnRef}
        className="nav-dd-btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={toggle}
        title="Watch GATE lectures on YouTube"
      >
        <YouTubeMark />
        YouTube
        <svg
          className="nav-dd-chev"
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="nav-dd-panel" role="menu" style={pos ? { top: pos.top, left: pos.left } : undefined}>
          <a href="https://www.youtube.com/@PrepFusion_GATE" target="_blank" rel="noopener noreferrer" role="menuitem">
            <YouTubeMark />
            English
            <span className="ext" aria-hidden="true">
              ↗
            </span>
          </a>
          <a href="https://www.youtube.com/@prepfusion-hindi" target="_blank" rel="noopener noreferrer" role="menuitem">
            <YouTubeMark />
            Hindi
            <span className="ext" aria-hidden="true">
              ↗
            </span>
          </a>
        </div>
      )}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.6 5.9c4.4-4.1 6.7-10.1 6.7-17.3z"
      />
      <path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.3 0 20 0 24s.9 7.7 2.6 10.8l7.8-6.1z" />
      <path
        fill="#34A853"
        d="M24 48c6.2 0 11.5-2 15.3-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.7 2.3-6.3 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

// The picture is the button; who you are and how to leave live behind it.
// Spelling "Sign out" across the bar put a destructive action one stray click
// from the theme toggle, and repeated a name the picture already carried.
function AccountMenu({ user, signOut }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Anchored by its right edge, not its left: this control sits at the end of
  // the bar, so a panel measured from the left would hang off the viewport.
  const toggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    }
    setOpen((prev) => !prev);
  };

  return (
    <div className="acct" ref={wrapRef}>
      <button
        ref={btnRef}
        type="button"
        className="avatar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
        title={user.name}
        aria-label="Your account"
      >
        {/* Not every provider returns a picture, and the avatar is now the
            only way to reach Sign out — so it must always render something. */}
        {user.avatarUrl ? (
          <img className="avatar" src={user.avatarUrl} alt="" />
        ) : (
          <span className="avatar avatar-fallback" aria-hidden="true">
            {(user.name || user.email || '?').trim()[0].toUpperCase()}
          </span>
        )}
      </button>

      {open && (
        <div
          className="nav-dd-panel acct-panel"
          role="menu"
          style={pos ? { top: pos.top, right: pos.right } : undefined}
        >
          <div className="acct-who">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          <button
            type="button"
            role="menuitem"
            className="acct-item"
            onClick={() => {
              setOpen(false);
              signOut();
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="m16 17 5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

// Browsing never requires an account, so these are the only things that change
// when signed out — nothing else is hidden or blocked.
//
// Split in two because they sit on opposite sides of the theme toggle: the
// per-user tools group with the rest of the bar's controls, while the account
// itself anchors the far right, where people expect to find it.
function AccountTools() {
  const { status, isSignedIn } = useAuth();
  const location = useLocation();

  if (status === 'loading' || !isSignedIn) {
    return null;
  }

  return (
    <>
      <NotificationBell />
      <Link
        className={`icon-btn${location.pathname === '/bookmarks' ? ' is-on' : ''}`}
        to="/bookmarks"
        title="Your bookmarks"
        aria-label="Your bookmarks"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
        </svg>
      </Link>
    </>
  );
}

function AccountEnd() {
  const { user, status, isSignedIn, signIn, signOut } = useAuth();

  if (status === 'loading') {
    return <span className="muted small">…</span>;
  }

  if (!isSignedIn || !user) {
    return (
      <button className="btn-google" onClick={signIn}>
        <GoogleMark />
        Sign in
      </button>
    );
  }

  return <AccountMenu user={user} signOut={signOut} />;
}

export default function SiteHeader() {
  const { toggle } = useTheme();
  const location = useLocation();
  const onStudyHub = location.pathname === '/' || location.pathname.startsWith('/subject');

  return (
    <header className="bar">
      <div className="bar-in">
        <Link className="logo" to="/" aria-label="PrepFusion Study Hub home">
          <Brand large />
        </Link>

        <nav className="nav">
          {/* The PDF library is a separate site (pyq.prepfusion.in/pdf/) that
              hands you whole books. This app is the Study Hub: the same
              catalogue, but opened question by question. */}
          <a
            href="https://pyq.prepfusion.in/pdf/"
            title="Every previous-year paper as a downloadable PDF."
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon path={BOOK_ICON} />
            Library
            <span className="ext" aria-hidden="true">
              ↗
            </span>
          </a>
          <a href="https://prepfusion.in" title="Full GATE courses on prepfusion.in." target="_blank" rel="noopener noreferrer">
            <Icon path={CAP_ICON} />
            Courses
            <span className="ext" aria-hidden="true">
              ↗
            </span>
          </a>
          <YouTubeMenu />
          <Link
            to="/"
            className={onStudyHub ? 'nav-current' : undefined}
            aria-current={onStudyHub ? 'page' : undefined}
            title="You're here — search, read and save every GATE question."
          >
            <Icon path={SEARCH_ICON} />
            Study Hub
          </Link>
          <ComingSoon label="Bookstore" icon={BAG_ICON} title="Printed editions of every series, delivered." />
        </nav>

        <div className="bar-actions">
          <AccountTools />
          <button className="tt" type="button" onClick={toggle} aria-label="Toggle dark mode" title="Toggle dark mode">
            <svg className="i-moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
            </svg>
            <svg className="i-sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
            </svg>
          </button>
          <AccountEnd />
        </div>
      </div>
    </header>
  );
}
