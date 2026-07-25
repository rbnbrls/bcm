export default function ChangesLoading() {
  return (
    <div className="page-shell">
      <div className="page-intro">
        <div className="skeleton skeleton-text" style={{ width: 120 }} />
        <div className="skeleton skeleton-heading" />
        <div className="skeleton skeleton-text" style={{ width: 360 }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 32 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton-card" style={{ height: 80 }} />
        ))}
      </div>
      <div className="skeleton skeleton-card" style={{ height: 400 }} />
    </div>
  );
}
