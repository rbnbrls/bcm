import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import type { ChangeRequest } from "@/lib/types";

/* ── Styles ── */

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.5,
    color: "#14231e",
  },
  header: {
    marginBottom: 24,
    borderBottom: "1px solid #d9dfdb",
    paddingBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#0a513f",
  },
  metadataGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metadataItem: {
    width: "45%",
    flexDirection: "row",
    marginBottom: 2,
  },
  metadataLabel: {
    width: 100,
    fontWeight: "bold",
    color: "#5d6864",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  metadataValue: {
    flex: 1,
    color: "#14231e",
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "bold",
    marginBottom: 10,
    marginTop: 16,
    color: "#0a513f",
  },
  table: {
    borderWidth: 1,
    borderColor: "#d9dfdb",
    borderRadius: 4,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0f6d55",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  tableHeaderCell: {
    color: "#ffffff",
    fontWeight: "bold",
    fontSize: 8,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#d9dfdb",
    alignItems: "center",
  },
  tableRowAlt: {
    backgroundColor: "#f6f8f5",
  },
  tableRowLast: {
    borderBottomWidth: 0,
  },
  cellPortfolio: {
    width: "20%",
    fontWeight: "bold",
    fontSize: 9,
  },
  cellIst: {
    width: "28%",
    paddingRight: 4,
  },
  cellSoll: {
    width: "28%",
    paddingRight: 4,
  },
  cellCost: {
    width: "12%",
    textAlign: "right",
    fontVariant: "tabular-nums",
  },
  benchmarkCode: {
    fontFamily: "Courier",
    fontSize: 8,
    color: "#5d6864",
    marginBottom: 1,
  },
  benchmarkName: {
    fontSize: 9,
    color: "#14231e",
  },
  istLabel: {
    fontSize: 7,
    color: "#a44032",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  sollLabel: {
    fontSize: 7,
    color: "#0a513f",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 1,
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: "center",
    color: "#5d6864",
    fontSize: 8,
    borderTop: "1px solid #d9dfdb",
    paddingTop: 8,
  },
  rationaleSection: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#f6f8f5",
    borderRadius: 4,
  },
  rationaleLabel: {
    fontWeight: "bold",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    color: "#5d6864",
    marginBottom: 4,
  },
  rationaleText: {
    fontSize: 10,
    color: "#14231e",
    lineHeight: 1.6,
  },
});

/* ── PDF Document Component ── */

function ExportDocument({ request }: { request: ChangeRequest }) {
  const isNewBenchmark = request.changeType === "new_benchmark";
  const costFormatter = new Intl.NumberFormat("nl-NL", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const formatDate = (dateStr: string): string => {
    try {
      return new Intl.DateTimeFormat("nl-NL", {
        dateStyle: "long",
      }).format(new Date(dateStr));
    } catch {
      return dateStr;
    }
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>
            Change Request — {request.reference}
          </Text>
          <View style={styles.metadataGrid}>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Client</Text>
              <Text style={styles.metadataValue}>
                {request.clientName} ({request.clientReference})
              </Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Aanvrager</Text>
              <Text style={styles.metadataValue}>{request.requestedBy}</Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Ingangsdatum</Text>
              <Text style={styles.metadataValue}>
                {formatDate(request.effectiveDate)}
              </Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Type</Text>
              <Text style={styles.metadataValue}>
                {isNewBenchmark ? "Nieuwe benchmark" : "Benchmarkwissel"}
              </Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Status</Text>
              <Text style={styles.metadataValue}>
                {request.status === "submitted" ? "Ingediend" : request.status}
              </Text>
            </View>
            <View style={styles.metadataItem}>
              <Text style={styles.metadataLabel}>Referentie</Text>
              <Text style={styles.metadataValue}>{request.reference}</Text>
            </View>
          </View>
        </View>

        {/* IST/SOLL Diff Section */}
        {!isNewBenchmark && request.items.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>IST / SOLL Configuratieverschil</Text>
            <View style={styles.table}>
              {/* Table Header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, styles.cellPortfolio]}>
                  Portefeuille
                </Text>
                <Text style={[styles.tableHeaderCell, styles.cellIst]}>
                  IST Benchmark
                </Text>
                <Text style={[styles.tableHeaderCell, styles.cellSoll]}>
                  SOLL Benchmark
                </Text>
                <Text style={[styles.tableHeaderCell, styles.cellCost]}>
                  Kosten
                </Text>
              </View>

              {/* Table Rows */}
              {request.items.map((item, idx) => (
                <View
                  key={item.portfolioReference}
                  style={[
                    styles.tableRow,
                    idx % 2 === 1 ? styles.tableRowAlt : {},
                    idx === request.items.length - 1 ? styles.tableRowLast : {},
                  ]}
                  wrap={false}
                >
                  <View style={styles.cellPortfolio}>
                    <Text style={styles.benchmarkCode}>
                      {item.portfolioReference}
                    </Text>
                    <Text style={{ fontSize: 9, fontWeight: "bold" }}>
                      {item.portfolioName}
                    </Text>
                  </View>
                  <View style={styles.cellIst}>
                    <Text style={styles.istLabel}>IST</Text>
                    <Text style={styles.benchmarkCode}>
                      {item.previousBenchmark.code}
                    </Text>
                    <Text style={styles.benchmarkName}>
                      {item.previousBenchmark.name}
                    </Text>
                  </View>
                  <View style={styles.cellSoll}>
                    <Text style={styles.sollLabel}>SOLL</Text>
                    <Text style={styles.benchmarkCode}>
                      {item.requestedBenchmark.code}
                    </Text>
                    <Text style={styles.benchmarkName}>
                      {item.requestedBenchmark.name}
                    </Text>
                  </View>
                  <View style={styles.cellCost}>
                    <Text>
                      € {costFormatter.format(item.requestedBenchmark.cost)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* New Benchmark Details */}
        {isNewBenchmark && request.newBenchmark && (
          <>
            <Text style={styles.sectionTitle}>
              Nieuwe benchmark specificaties
            </Text>
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { width: "30%" }]}>
                  Eigenschap
                </Text>
                <Text style={[styles.tableHeaderCell, { width: "70%" }]}>
                  Waarde
                </Text>
              </View>
              {[
                ["Short name", request.newBenchmark.shortName],
                ["Long name", request.newBenchmark.longName],
                ["Asset class", request.newBenchmark.assetClass],
                ["Valuta", request.newBenchmark.currency],
                [
                  "Geschatte kosten",
                  `€ ${costFormatter.format(request.newBenchmark.estimatedCost)}`,
                ],
                [
                  "Doorlooptijd",
                  `${request.newBenchmark.estimatedLeadWeeks} weken`,
                ],
              ].map(([label, value], idx) => (
                <View
                  key={label as string}
                  style={[
                    styles.tableRow,
                    idx % 2 === 1 ? styles.tableRowAlt : {},
                    idx === 5 ? styles.tableRowLast : {},
                  ]}
                >
                  <Text
                    style={{
                      width: "30%",
                      fontWeight: "bold",
                      fontSize: 9,
                      color: "#5d6864",
                      textTransform: "uppercase",
                    }}
                  >
                    {label as string}
                  </Text>
                  <Text style={{ width: "70%", fontSize: 10 }}>
                    {value as string}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Rationale */}
        <View style={styles.rationaleSection}>
          <Text style={styles.rationaleLabel}>
            Waarom deze {isNewBenchmark ? "aanvraag" : "change"}?
          </Text>
          <Text style={styles.rationaleText}>{request.rationale}</Text>
        </View>

        {/* Footer */}
        <View style={styles.footer} fixed>
          <Text>
            Change Request {request.reference} — {request.clientName} —{" "}
            {new Date().toLocaleDateString("nl-NL")}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

/* ── PDF Buffer Generator ── */

/**
 * Build a PDF buffer for a change request.
 * Returns a Promise<Buffer> that can be sent as the HTTP response body.
 */
export async function buildPdfBuffer(request: ChangeRequest): Promise<Uint8Array> {
  const doc = <ExportDocument request={request} />;
  const stream = await pdf(doc).toBuffer();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}
