export default function Loading() {
  return (
    <div className="page-shell request-shell" aria-label="Bezig met laden…">
      <div className="request-header" style={{ marginBottom: 32 }}>
        <div className="skeleton skeleton-text" style={{ width: "160px", marginBottom: 12 }} />
        <div className="skeleton skeleton-heading" style={{ width: "50%" }} />
        <div className="skeleton skeleton-text" style={{ width: "40%", marginTop: 8 }} />
      </div>
      <div className="request-overview" style={{ marginBottom: 32 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div className="skeleton skeleton-text" style={{ width: "100px", height: 10, marginBottom: 4 }} />
            <div className="skeleton skeleton-text" style={{ width: "60%", height: 16 }} />
          </div>
        ))}
      </div>
      <div className="skeleton skeleton-card" style={{ height: 200 }}>
        <div className="skeleton skeleton-text" style={{ width: "30%", marginBottom: 12 }} />
        <div className="skeleton skeleton-text" style={{ width: "90%" }} />
        <div className="skeleton skeleton-text" style={{ width: "80%" }} />
        <div className="skeleton skeleton-text" style={{ width: "70%" }} />
        <div className="skeleton skeleton-text" style={{ width: "60%" }} />
      </div>
    </div>
  );
}
