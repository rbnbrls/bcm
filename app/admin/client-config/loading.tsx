export default function Loading() {
  return (
    <div className="page-shell config-shell" aria-label="Bezig met laden…">
      <div className="page-intro">
        <div className="skeleton skeleton-text" style={{ width: "100px", marginBottom: 12 }} />
        <div className="skeleton skeleton-heading" style={{ width: "45%" }} />
        <div className="skeleton skeleton-text" style={{ width: "75%", marginTop: 8 }} />
      </div>
      <div className="config-table-toolbar" style={{ marginTop: 32 }}>
        <div className="skeleton" style={{ height: 32, width: 160, borderRadius: 8 }} />
      </div>
      <div className="config-table-wrap" style={{ marginTop: 12 }}>
        <table className="config-table">
          <thead>
            <tr>
              {Array.from({ length: 4 }).map((_, i) => (
                <th key={i}>
                  <div className="skeleton skeleton-text" style={{ width: "70%", height: 12 }} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, row) => (
              <tr key={row}>
                {Array.from({ length: 4 }).map((_, col) => {
                const widths = ["50%", "70%", "60%", "85%"];
                return (
                  <td key={col}>
                    <div className="skeleton skeleton-text" style={{ width: widths[col % widths.length], height: 12 }} />
                  </td>
                );
              })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
