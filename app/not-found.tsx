import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-shell empty-state" role="alert">
      <p className="eyebrow">404</p>
      <h1>Deze change is niet gevonden.</h1>
      <p>Controleer de link of maak een nieuwe benchmarkwissel aan.</p>
      <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
        <Link className="button button-primary" href="/changes/new">Nieuwe change</Link>
        <Link className="button button-secondary" href="/">Naar home</Link>
      </div>
    </div>
  );
}
