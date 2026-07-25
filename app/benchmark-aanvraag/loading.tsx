export default function Loading() {
  return (
    <div className="page-shell request-shell" aria-label="Bezig met laden…">
      <div className="page-intro" style={{ marginBottom: 32 }}>
        <div className="skeleton skeleton-text" style={{ width: "120px", marginBottom: 12 }} />
        <div className="skeleton skeleton-heading" style={{ width: "50%" }} />
        <div className="skeleton skeleton-text" style={{ width: "70%", marginTop: 8 }} />
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="skeleton skeleton-card" style={{ height: 160, marginBottom: 20 }}>
          <div className="skeleton skeleton-text" style={{ width: "40%", marginBottom: 12 }} />
          <div className="skeleton skeleton-text" style={{ width: "90%" }} />
          <div className="skeleton skeleton-text" style={{ width: "75%" }} />
          <div className="skeleton skeleton-text" style={{ width: "60%" }} />
        </div>
      ))}
    </div>
  );
}
