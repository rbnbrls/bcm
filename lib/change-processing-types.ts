export interface ProcessChangeResult {
  changeRequestId: string;
  changeType: string;
  /** Number of staged rows used by the selected apply strategy. */
  stagedRows: number;
  /** True when the change was applied to the live config. */
  applied: boolean;
  /** Outcome per staged row when applied. */
  outcomes: Array<{
    actionType: string;
    primaryAccountId: string;
    result: string;
    error?: string;
  }>;
  /** True when a legacy flat-schema path was used. */
  usedLegacy: boolean;
  error?: string;
}

