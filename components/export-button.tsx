"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface ExportButtonProps {
  changeRequestId: string;
}

export function ExportButton({ changeRequestId }: ExportButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const triggerDownload = useCallback(
    async (format: "csv" | "pdf") => {
      setDownloading(true);
      setOpen(false);
      setError(null);
      try {
        const response = await fetch(
          `/api/export/${changeRequestId}?format=${format}`
        );
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.error || "Export mislukt.");
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (err) {
        console.error("Export failed:", err);
        setError(err instanceof Error ? err.message : "Export mislukt.");
      } finally {
        setTimeout(() => setDownloading(false), 500);
      }
    },
    [changeRequestId]
  );

  const handleDownloadCSV = useCallback(
    () => triggerDownload("csv"),
    [triggerDownload]
  );

  const handleDownloadPDF = useCallback(
    () => triggerDownload("pdf"),
    [triggerDownload]
  );

  const toggleDropdown = useCallback(() => {
    setOpen((prev) => !prev);
  }, []);

  // Click-outside to close dropdown
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [open]);

  return (
    <div className="export-split">
      <button
        className="export-split__main"
        onClick={handleDownloadCSV}
        disabled={downloading}
        type="button"
      >
        {downloading ? "Exporteren…" : "Exporteer request"}
      </button>
      <button
        className="export-split__arrow"
        onClick={toggleDropdown}
        disabled={downloading}
        aria-label="Exportformaat kiezen"
        aria-haspopup="menu"
        aria-expanded={open}
        type="button"
      >
        &#9660;
      </button>
      {open && (
        <div className="export-split__dropdown" ref={dropdownRef} role="menu" aria-orientation="vertical">
          <button onClick={handleDownloadCSV} type="button" role="menuitem">
            CSV downloaden
          </button>
          <button onClick={handleDownloadPDF} type="button" role="menuitem">
            PDF downloaden
          </button>
        </div>
      )}
      {error && (
        <div className="form-errors" role="alert" style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 8 }}>
          <b>Export mislukt.</b>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
}
