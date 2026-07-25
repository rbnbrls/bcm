import Link from "next/link";
import { notFound } from "next/navigation";
import { getChangeRequest } from "@/lib/db";

export default async function ChangeRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const request = await getChangeRequest(id);
  if (!request) notFound();

  const isNewBenchmark = request.changeType === "new_benchmark";

  return (
    <div className="page-shell request-shell">
      <div className="request-header">
        <div>
          <p className="eyebrow">CHANGE REQUEST · {request.reference}</p>
          <h1>{isNewBenchmark ? "Nieuwe benchmark" : "Benchmarkwissel"}</h1>
          <p>{request.clientName} · {request.clientReference}</p>
        </div>
        <span className="status-pill">{request.status === "submitted" ? "Ingediend" : request.status}</span>
      </div>

      <section className="request-overview">
        <div><span>Aanvrager</span><b>{request.requestedBy}</b></div>
        <div><span>Ingangsdatum</span><b>{new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" }).format(new Date(request.effectiveDate))}</b></div>
        <div><span>Type</span><b>{isNewBenchmark ? "Nieuwe benchmark" : "Normale change"}</b></div>
        <div><span>Scope</span><b>{isNewBenchmark ? "1 nieuwe benchmark" : `${request.items.length} portefeuille(s)`}</b></div>
      </section>

      {isNewBenchmark && request.newBenchmark ? (
        <section className="nb-detail">
          <h2>Nieuwe benchmark specificaties</h2>
          <div className="nb-detail-grid">
            <div className="nb-detail-item">
              <span>Short name</span>
              <span>{request.newBenchmark.shortName}</span>
            </div>
            <div className="nb-detail-item">
              <span>Long name</span>
              <span>{request.newBenchmark.longName}</span>
            </div>
            <div className="nb-detail-item">
              <span>Asset class</span>
              <span>{request.newBenchmark.assetClass}</span>
            </div>
            <div className="nb-detail-item">
              <span>Valuta</span>
              <span>{request.newBenchmark.currency}</span>
            </div>
            <div className="nb-detail-item">
              <span>Geschatte kosten</span>
              <span>€ {request.newBenchmark.estimatedCost.toLocaleString("nl-NL")}</span>
            </div>
            <div className="nb-detail-item">
              <span>Doorlooptijd</span>
              <span>{request.newBenchmark.estimatedLeadWeeks} weken</span>
            </div>
          </div>
        </section>
      ) : (
        <section className="diff-section">
          <div className="diff-heading">
            <div>
              <p className="eyebrow">CONFIGURATIEVERSCHIL</p>
              <h2>IST / SOLL</h2>
            </div>
            <p>De beoogde configuratie is per portefeuille traceerbaar naast de huidige, overeengekomen situatie.</p>
          </div>
          <div className="git-diff">
            <div className="diff-file">client-config/{request.clientReference}.yaml</div>
            {request.items.map((item) => (
              <div className="diff-block" key={item.portfolioReference}>
                <p className="diff-context">portfolio: {item.portfolioName} <span>#{item.portfolioReference}</span></p>
                <div className="diff-line diff-remove"><i>−</i><code>benchmark: {item.previousBenchmark.code}</code><span>{item.previousBenchmark.name}</span></div>
                <div className="diff-line diff-add"><i>+</i><code>benchmark: {item.requestedBenchmark.code}</code><span>{item.requestedBenchmark.name}</span></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="handoff-grid">
        <article>
          <p className="eyebrow">ONDERBOUWING</p>
          <h2>Waarom deze {isNewBenchmark ? "aanvraag" : "change"}?</h2>
          <p>{request.rationale}</p>
        </article>
        <article>
          <p className="eyebrow">DISTRIBUTIE</p>
          <h2>Stakeholders</h2>
          <ul>
            <li>Eigen administratie</li>
            <li>Asset service provider</li>
            <li>FactSet</li>
          </ul>
        </article>
      </section>

      <div className="bottom-actions">
        <Link className="button button-secondary" href={isNewBenchmark ? "/benchmark-aanvraag" : "/changes/new"}>
          {isNewBenchmark ? "Nieuwe benchmark" : "Nieuwe benchmarkwissel"}
        </Link>
        <button className="button button-primary" type="button">Exporteer request (binnenkort)</button>
      </div>
    </div>
  );
}
