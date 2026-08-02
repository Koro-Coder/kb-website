import { Link } from 'react-router-dom';
import Brand from './Brand.jsx';

export default function SiteFooter() {
  return (
    <footer>
      <div className="footer-inner">
        <Link className="logo" to="/" aria-label="PrepFusion Study Hub home">
          <Brand />
        </Link>
        <p className="mono small">© {new Date().getFullYear()} PrepFusion</p>
      </div>
    </footer>
  );
}
