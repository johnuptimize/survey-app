import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card center">
      <h1>Page not found</h1>
      <p className="muted">
        That survey outcome doesn&apos;t exist. Outcome URLs look like{" "}
        <span className="pattern-chip">AABAB</span>.
      </p>
      <p>
        <Link className="link" href="/">
          Start the survey
        </Link>
      </p>
    </div>
  );
}
