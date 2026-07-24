export type Benchmark = {
  id: string;
  code: string;
  name: string;
  assetClass: string;
  currency: string;
};

export type Portfolio = {
  id: string;
  name: string;
  externalReference: string;
  currentBenchmarkId: string;
  currentBenchmark: Benchmark;
};

export type ClientConfig = {
  id: string;
  name: string;
  externalReference: string;
  portfolios: Portfolio[];
};

export type ChangeItem = {
  portfolioId: string;
  previousBenchmarkId: string;
  requestedBenchmarkId: string;
};

export type ChangeRequest = {
  id: string;
  reference: string;
  clientName: string;
  clientReference: string;
  requestedBy: string;
  rationale: string;
  effectiveDate: string;
  status: string;
  createdAt: string;
  items: Array<{
    portfolioName: string;
    portfolioReference: string;
    previousBenchmark: Benchmark;
    requestedBenchmark: Benchmark;
  }>;
};
