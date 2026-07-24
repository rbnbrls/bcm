import Link from "next/link";

export default function NotFound() {
  return <div className="page-shell empty-state"><p className="eyebrow">404</p><h1>Deze change is niet gevonden.</h1><p>Controleer de link of maak een nieuwe benchmarkwissel aan.</p><Link className="button button-primary" href="/changes/new">Nieuwe change</Link></div>;
}
