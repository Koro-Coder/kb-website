import { Link } from 'react-router-dom';
import Brand from './Brand.jsx';

/* The three links below are the same ones the PDF library carries in its
   footer, pointing at the same destinations — the feedback form, the
   WhatsApp group and the About page all serve both halves of the site, so
   a reader who lands here first still reaches the same people. */

const CHAT_ICON = (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-4-.9L3 21l1.9-4.5A8.4 8.4 0 0 1 4 11.5a8.4 8.4 0 0 1 9-8.4 8.4 8.4 0 0 1 8 8.4Z" />
  </svg>
);

/* Brand mark, so it keeps WhatsApp's own green rather than inheriting the
   link colour the way the outline icons do. */
const WHATSAPP_ICON = (
  <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="12" fill="#25D366" />
    <path
      fill="#fff"
      d="M12.04 5.5c-3.61 0-6.54 2.93-6.54 6.54 0 1.15.3 2.28.88 3.27L5.4 18.6l3.42-.9a6.52 6.52 0 0 0 3.22.85h.003c3.61 0 6.54-2.93 6.54-6.54a6.5 6.5 0 0 0-1.92-4.63 6.5 6.5 0 0 0-4.62-1.88zm0 11.97a5.4 5.4 0 0 1-2.75-.76l-.2-.12-2 .52.53-1.94-.13-.2a5.41 5.41 0 0 1-.83-2.88c0-2.99 2.43-5.42 5.42-5.421.45 0 2.81.56 3.83 1.59a5.39 5.39 0 0 1 1.59 3.83c0 2.99-2.43 5.38-5.46 5.38zm2.96-4.03c-.16-.08-.96-.47-1.11-.53-.15-.05-.26-.08-.36.08-.11.16-.42.53-.51.64-.1.11-.19.12-.35.04-.16-.08-.68-.25-1.3-.8-.48-.43-.81-.96-.9-1.12-.09-.16-.01-.25.07-.33.07-.07.16-.19.24-.28.08-.1.11-.16.16-.27.05-.11.03-.2-.01-.28-.04-.08-.36-.88-.5-1.2-.13-.32-.26-.27-.36-.28h-.31c-.11 0-.28.04-.43.2-.15.16-.57.55-.57 1.35s.58 1.57.66 1.68c.08.11 1.14 1.74 2.77 2.44.39.17.69.27.92.34.39.12.74.11 1.02.06.31-.05.96-.39 1.09-.77.14-.38.14-.7.1-.77-.04-.07-.15-.11-.31-.19z"
    />
  </svg>
);

export default function SiteFooter() {
  return (
    <footer>
      <div className="footer-inner">
        <Link className="logo" to="/" aria-label="PrepFusion Study Hub home">
          <Brand />
        </Link>
        <a
          className="feedback-btn"
          href="https://forms.gle/KjeJHFvppH4TDoLu6"
          target="_blank"
          rel="noopener noreferrer"
        >
          {CHAT_ICON}
          Share feedback
        </a>
        <a
          className="footer-link"
          href="https://chat.whatsapp.com/CG6NeORAHLt54WcwivLP2U?s=cl&p=a&mlu=4"
          target="_blank"
          rel="noopener noreferrer"
        >
          {WHATSAPP_ICON}
          Report an error
        </a>
        {/* The About page lives on the PDF library's domain, not in this
            app's router, so it has to be an absolute link. */}
        <a className="footer-link" href="https://pyq.prepfusion.in/about/">
          About Us
        </a>
        <p className="mono small">© {new Date().getFullYear()} PrepFusion</p>
      </div>
    </footer>
  );
}
