/** Inspect the draft version revision + reviews after the failed publish. */
const postgres = require("postgres");
const sql = postgres("postgres://bcm@localhost:5432/bcm");

(async () => {
  const rows = await sql`
    SELECT wv.id, wv.version_number, wv.status, wv.revision,
           wr.decision, wr.revision AS review_revision, wr.created_at
    FROM workflow_version wv
    LEFT JOIN workflow_version_review wr ON wr.workflow_version_id = wv.id
    WHERE wv.workflow_definition_id = '060f70fc-161f-4e6f-a437-e54eb0101edd'
    ORDER BY wv.version_number, wr.revision`;
  console.log("VERSIONS:", JSON.stringify(rows, null, 1));
  await sql.end();
})().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
