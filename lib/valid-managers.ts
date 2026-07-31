/**
 * Valid Managers — single source of truth for portfolio manager lookups.
 *
 * This file is the authoritative list of all valid managers used in the BCM
 * application. It is imported by both the seed script (via JSON) and the
 * client-config migration (directly).
 *
 * Each entry has:
 *   - `name`:       Full manager name (e.g. "ABERDEEN", "ALLIANCE BERNSTEIN")
 *   - `shortcode`:  Unique 2-3 character code used in primaryAccountId generation
 *   - `sortKey`:    Lowercase sort key derived from name for stable ordering
 *
 * Shortcode constraints:
 *   - Maximum 3 characters
 *   - Used in primaryAccountId: `{portfolioCode}_{acCode}{sacCode}_{shortcode}`
 *
 * Source: GitHub issue #258 — user-provided list of 59 valid managers.
 */

export interface ValidManager {
  name: string;
  shortcode: string;
}

/** Complete list of valid managers, sorted alphabetically by name. */
export const VALID_MANAGERS: ValidManager[] = [
  { name: "ABERDEEN", shortcode: "ABD" },
  { name: "ACADIAN", shortcode: "ACA" },
  { name: "ADVENT", shortcode: "ADV" },
  { name: "AEGON", shortcode: "AEG" },
  { name: "ALLIANCE BERNSTEIN", shortcode: "AB" },
  { name: "ALLSPRING", shortcode: "ALL" },
  { name: "ALMAZARA", shortcode: "ALM" },
  { name: "AQR", shortcode: "AQR" },
  { name: "ARROWSTREET", shortcode: "ARR" },
  { name: "AXA", shortcode: "AXA" },
  { name: "BARCLAYS", shortcode: "BAR" },
  { name: "BARINGS", shortcode: "BRG" },
  { name: "BLACKROCK", shortcode: "BLK" },
  { name: "BLUEBAY", shortcode: "BLB" },
  { name: "BNP PARIBAS", shortcode: "BNP" },
  { name: "BSM", shortcode: "BSM" },
  { name: "CARDANO", shortcode: "CAR" },
  { name: "CITIBANK", shortcode: "CIT" },
  { name: "CTI", shortcode: "CTI" },
  { name: "DDJ", shortcode: "DDJ" },
  { name: "DE MUNT HYPOTHEKEN", shortcode: "DMF" },
  { name: "DEUTSCHE", shortcode: "DWS" },
  { name: "DYNAMIC CREDIT", shortcode: "DYC" },
  { name: "EIGEN BEHEER", shortcode: "OWN" },
  { name: "FIDELITY", shortcode: "FID" },
  { name: "GOLDMAN SACHS", shortcode: "GOL" },
  { name: "HENDERSON", shortcode: "HND" },
  { name: "ING", shortcode: "ING" },
  { name: "INSIGHT", shortcode: "INS" },
  { name: "INTERMEDE", shortcode: "INT" },
  { name: "IRISH LIFE", shortcode: "IRL" },
  { name: "JP MORGAN", shortcode: "JPM" },
  { name: "KEMPEN", shortcode: "KMP" },
  { name: "KOPERNIK", shortcode: "KPR" },
  { name: "LAZARD", shortcode: "LAZ" },
  { name: "LEGAL & GENERAL", shortcode: "LG" },
  { name: "LSV", shortcode: "LSV" },
  { name: "M&G", shortcode: "MG" },
  { name: "METLIFE", shortcode: "MET" },
  { name: "MFS", shortcode: "MFS" },
  { name: "MORGAN STANLEY", shortcode: "MS" },
  { name: "NINETY ONE", shortcode: "NIN" },
  { name: "NOMURA", shortcode: "NOM" },
  { name: "NORDEA", shortcode: "NOR" },
  { name: "NORTHERN TRUST", shortcode: "NT" },
  { name: "OAKTREE", shortcode: "OAK" },
  { name: "PAYDEN RYGEL", shortcode: "PAY" },
  { name: "PGIM", shortcode: "PGM" },
  { name: "PIMCO", shortcode: "PIM" },
  { name: "PINESTONE", shortcode: "PS" },
  { name: "PVF HYPOTHEKEN", shortcode: "PVF" },
  { name: "PZENA", shortcode: "PZE" },
  { name: "ROBECO", shortcode: "ROB" },
  { name: "RUSSELL", shortcode: "RUS" },
  { name: "SIXTH STREET", shortcode: "6ST" },
  { name: "STATESTREET", shortcode: "SST" },
  { name: "STONE HARBOUR", shortcode: "SH" },
  { name: "T-ROWE", shortcode: "TRO" },
  { name: "UBS", shortcode: "UBS" },
];

/** Look up a manager entry by its shortcode (case-insensitive). */
export function findManagerByShortcode(
  code: string,
): ValidManager | undefined {
  return VALID_MANAGERS.find(
    (m) => m.shortcode.toUpperCase() === code.toUpperCase(),
  );
}

/** Look up a manager entry by its full name (case-insensitive). */
export function findManagerByName(name: string): ValidManager | undefined {
  return VALID_MANAGERS.find(
    (m) => m.name.toUpperCase() === name.toUpperCase(),
  );
}

/** Get a random valid manager (useful for seeding). */
export function getRandomManager(): ValidManager {
  const idx = Math.floor(Math.random() * VALID_MANAGERS.length);
  return VALID_MANAGERS[idx];
}

/** Get N distinct random managers (useful for multi-portfolio seeding). */
export function getRandomManagers(count: number): ValidManager[] {
  const shuffled = [...VALID_MANAGERS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, VALID_MANAGERS.length));
}

/** Map of shortcode → name for quick lookups. */
export const MANAGER_SHORTCODE_TO_NAME: Record<string, string> =
  Object.fromEntries(VALID_MANAGERS.map((m) => [m.shortcode, m.name]));

/** Map of uppercase name → shortcode for reverse lookups. */
export const MANAGER_NAME_TO_SHORTCODE: Record<string, string> =
  Object.fromEntries(
    VALID_MANAGERS.map((m) => [m.name.toUpperCase(), m.shortcode]),
  );
