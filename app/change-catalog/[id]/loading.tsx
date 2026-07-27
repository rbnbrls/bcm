export default function Loading() {
  return (
    <div className="page-shell" aria-label="Bezig met laden…">
      <div className="page-intro">
        <div className="skeleton skeleton-text" style={{ width: "200px", marginBottom: 12 }} />
        <div className="skeleton skeleton-heading" style={{ width: "60%" }} />
        <div className="skeleton skeleton-text" style={{ width: "50%", marginTop: 8 }} />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 16,
          margin: "32px 0",
        }}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="cost-card">
            <div className="skeleton skeleton-text" style={{ width: "60%", height: 12, marginBottom: 8 }} />
            <div className="skeleton skeleton-text" style={{ width: "80%", height: 14 }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ width: "100%", height: 200, borderRadius: 12, marginBottom: 32 }} />
      <div className="skeleton" style={{ width: "100%", height: 80, borderRadius: 12 }} />
    </div>
  );
}
