/**
 * Backwards-compatible seed endpoint.
 *
 * The old public seed route used to maintain separate demo data. Client config
 * is now the single seed source, so this endpoint delegates to it.
 */
export { POST } from "./client-config/route";
