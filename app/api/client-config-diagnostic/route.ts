import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!sql) {
    return NextResponse.json({ error: "No database connection" }, { status: 500 });
  }

  try {
    const tables = [
      { name: "client_config.portfolio_configuration", query: "SELECT COUNT(*) AS cnt FROM client_config.portfolio_configuration" },
      { name: "client_config.portfolio", query: "SELECT COUNT(*) AS cnt FROM client_config.portfolio" },
      { name: "client_config.asset_class", query: "SELECT COUNT(*) AS cnt FROM client_config.asset_class" },
      { name: "client_config.sub_asset_class", query: "SELECT COUNT(*) AS cnt FROM client_config.sub_asset_class" },
      { name: "client_config.manager", query: "SELECT COUNT(*) AS cnt FROM client_config.manager" },
      { name: "client_config.benchmark", query: "SELECT COUNT(*) AS cnt FROM client_config.benchmark" },
      { name: "client_config.npc_classification", query: "SELECT COUNT(*) AS cnt FROM client_config.npc_classification" },
    ];

    const results: Record<string, any> = {};
    for (const t of tables) {
      try {
        const rows = await sql.unsafe(t.query);
        results[t.name] = Number(rows[0]?.cnt ?? 0);
      } catch (e: any) {
        results[t.name] = -1;
        results[`${t.name}_error`] = e.message;
      }
    }

    // Also try the full query with a LIMIT
    try {
      const sample = await sql`
        SELECT pc.primary_account_id, pc.portfolio_code, pc.active_ind
        FROM client_config.portfolio_configuration pc
        JOIN client_config.portfolio p ON p.portfolio_code = pc.portfolio_code
        JOIN client_config.asset_class ac ON ac.asset_class_code = pc.asset_class_code
        JOIN client_config.sub_asset_class sac
          ON sac.asset_class_id = ac.asset_class_id
          AND sac.sub_asset_class_code = pc.sub_asset_class_code
        JOIN client_config.manager m ON m.manager_code = pc.manager_code
        JOIN client_config.benchmark b ON b.benchmark_code = pc.benchmark_code
        JOIN client_config.npc_classification nc ON nc.npc_classification_id = pc.npc_classification_id
        WHERE pc.active_ind = true
        LIMIT 3
      `;
      results["full_query_count"] = sample.length;
      results["full_query_sample"] = sample.map((r: any) => r.primary_account_id);
    } catch (e: any) {
      results["full_query_error"] = e.message;
    }

    return NextResponse.json({ results });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}