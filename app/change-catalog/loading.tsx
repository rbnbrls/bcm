export default function Loading() {
  return (
    <div className="page-shell config-shell" aria-label="Bezig met laden…">
      <div className="page-intro">
        <div className="skeleton skeleton-text" style={{ width: "140px", marginBottom: 12 }} />
        <div className="skeleton skeleton-heading" style={{ width: "50%" }} />
        <div className="skeleton skeleton-text" style={{ width: "70%", marginTop: 8 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))", gap: 20, marginTop: 32 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="change-type-card" style={{ gap: 14, padding: 24 }}>
            <div className="skeleton skeleton-heading" style={{ width: "40%", marginBottom: 8 }} />
            <div className="skeleton skeleton-text" style={{ width: "100%", marginBottom: 6 }} />
            <div className="skeleton skeleton-text" style={{ width: "80%", marginBottom: 6 }} />
            <div className="skeleton" style={{ width: "100%", height: 60, borderRadius: 8 }} />
            <div className="skeleton" style={{ width: "100%", height: 40, borderRadius: 8 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
