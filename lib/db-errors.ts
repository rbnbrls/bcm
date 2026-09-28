/**
 * DB constraint-error detection and friendly-message mapping.
 *
 * postgres.js surfaces server-side constraint violations as PostgresError
 * objects with a SQLSTATE `code` (e.g. 23514 = check_violation) plus
 * `constraint_name` / `table_name` / `column_name` when the server reports
 * them. Server actions that write through lib/* should translate these into
 * a friendly user-facing message instead of leaking the raw PostgreSQL
 * error text (which references internal relation/constraint names like
 * `change_portfolio_configuration_long_name_check`).
 */

export interface DbConstraintErrorInfo {
  /** SQLSTATE code, e.g. "23514" (check_violation), "23503" (foreign_key_violation). */
  code: string;
  /** Constraint name as reported by the server (e.g. change_portfolio_configuration_long_name_check). */
  constraint?: string;
  table?: string;
  column?: string;
}

/** SQLSTATE codes that indicate a user-correctable constraint violation. */
const CONSTRAINT_SQLSTATES = new Set([
  "23502", // not_null_violation
  "23503", // foreign_key_violation
  "23505", // unique_violation
  "23514", // check_violation
  "22001", // string_data_right_truncation (value too long for varchar(n))
]);

/** Message-pattern fallback for drivers/mocks that don't populate `code`. */
const CONSTRAINT_MESSAGE_PATTERN =
  /violates (check|unique|foreign key|not-null) constraint|constraint .*violated/i;

/**
 * Detect a DB constraint violation in a thrown value.
 *
 * Returns a structured description (SQLSTATE code + constraint/table/column
 * when available) or null when the error is not a constraint violation.
 * Works with real postgres.js PostgresError objects and with plain Error /
 * object mocks that carry `code`, `constraint_name`, `constraint`, etc.
 */
export function getDbConstraintError(error: unknown): DbConstraintErrorInfo | null {
  if (!error || typeof error !== "object") return null;
  const e = error as Record<string, unknown>;

  const code = typeof e.code === "string" ? e.code : "";
  const constraint =
    typeof e.constraint_name === "string"
      ? e.constraint_name
      : typeof e.constraint === "string"
        ? e.constraint
        : undefined;
  const table = typeof e.table_name === "string" ? e.table_name : undefined;
  const column = typeof e.column_name === "string" ? e.column_name : undefined;

  const message = error instanceof Error ? error.message : String(error);
  const looksLikeConstraint =
    CONSTRAINT_SQLSTATES.has(code) || CONSTRAINT_MESSAGE_PATTERN.test(message) || constraint !== undefined;

  if (!looksLikeConstraint) return null;

  return {
    code: code || "unknown",
    ...(constraint ? { constraint } : {}),
    ...(table ? { table } : {}),
    ...(column ? { column } : {}),
  };
}

/**
 * Friendly Dutch user-facing message for a constraint violation.
 *
 * The raw PostgreSQL message is intentionally NOT included: it names
 * internal schema objects and would confuse end users. The structured
 * details (constraint/table/column) are logged separately via reportError.
 */
export function friendlyDbConstraintMessage(info: DbConstraintErrorInfo): string {
  switch (info.code) {
    case "23514":
      return "De ingevoerde gegevens voldoen niet aan een databasebeperking. Controleer de ingevulde waarden en probeer het opnieuw.";
    case "23505":
      return "Deze waarde bestaat al in de database. Controleer de ingevulde gegevens en probeer het opnieuw.";
    case "23502":
      return "Een verplichte waarde ontbreekt. Controleer de ingevulde gegevens en probeer het opnieuw.";
    case "22001":
      return "Een ingevulde waarde is te lang. Verkort de waarde en probeer het opnieuw.";
    default:
      // 23503 (FK) and anything else: generic inconsistency message.
      return "Er is een inconsistentie in de database. Ververs de pagina en probeer het opnieuw.";
  }
}
