import { Link } from "react-router-dom";

export function NotFound() {
  return (
    <section className="page">
      <div className="page-header">
        <p className="eyebrow">404</p>
        <h2>Page not found</h2>
        <p>The requested route does not exist.</p>
      </div>
      <Link className="button-link" to="/">
        Return home
      </Link>
    </section>
  );
}
