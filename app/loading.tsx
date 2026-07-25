export default function Loading() {
  return (
    <div className="page-shell home-shell" aria-label="Bezig met laden…">
      <div className="hero">
        <div className="skeleton skeleton-text" style={{ width: "140px", marginBottom: 16 }} />
        <div className="skeleton skeleton-heading" style={{ width: "80%" }} />
        <div className="skeleton skeleton-text" style={{ width: "60%", marginTop: 16 }} />
      </div>
      <div className="status-grid" style={{ marginTop: 48 }}>
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </div>
    </div>
  );
}
