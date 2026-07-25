"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface ExportButtonProps {
  changeRequestId: string;
}

export function ExportButton({ changeRequestId }: ExportButtonProps) {
  const [downloading, setDownloading] = useState(false);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const triggerDownload = useCallback(
    (format: "csv" | "pdf") => {
      setDownloading(true);
      setOpen(false);
      const a = document.createElement("a");
      a.href = `/api/export/${changeRequestId}?format=${format}`;
      a.download = "";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => setDownloading(false), 1500);
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
        type="button"
      >
        &#9660;
      </button>
      {open && (
        <div className="export-split__dropdown" ref={dropdownRef}>
          <button onClick={handleDownloadCSV} type="button">
            CSV downloaden
          </button>
          <button onClick={handleDownloadPDF} type="button">
            PDF downloaden
          </button>
        </div>
      )}
    </div>
  );
}
