export default function Loading() {
  return (
    <div className="page-shell config-shell" aria-label="Bezig met laden…">
      <div className="page-intro">
        <div className="skeleton skeleton-text" style={{ width: "100px", marginBottom: 12 }} />
        <div className="skeleton skeleton-heading" style={{ width: "60%" }} />
        <div className="skeleton skeleton-text" style={{ width: "80%", marginTop: 8 }} />
      </div>
      <div className="config-table-toolbar" style={{ marginTop: 32 }}>
        <div className="skeleton" style={{ height: 32, width: 200, marginBottom: 12, borderRadius: 8 }} />
      </div>
      <div className="config-table-wrap">
        <table className="config-table">
          <thead>
            <tr>
              {Array.from({ length: 6 }).map((_, i) => (
                <th key={i}>
                  <div className="skeleton skeleton-text" style={{ width: "80%", height: 12 }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, row) => (
              <tr key={row}>
                {Array.from({ length: 6 }).map((_, col) => (
                  <td key={col}>
                    <div className="skeleton skeleton-text" style={{ width: `${60 + Math.random() * 30}%`, height: 12 }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
