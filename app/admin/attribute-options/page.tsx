"use client";

import { useActionState, useState, useEffect, useCallback, startTransition } from "react";
import {
  loadAttributeOptions,
  createOption,
  updateOption,
  deleteOption,
  type AttributeType,
  type ActionState,
} from "./actions";
import type { WtpClassification, AssetClassRow, Manager, BenchmarkGroup } from "@/lib/types";

const ATTR_TYPES: { key: AttributeType; label: string; description: string }[] = [
  { key: "wtp", label: "WTP classificatie", description: "Rendement, Matching, Opbouw" },
  { key: "asset_class", label: "Asset class", description: "Aandelen, Obligaties, Vastgoed, ..." },
  { key: "manager", label: "Manager", description: "Eigen beheer, externe beheerders" },
  { key: "benchmark", label: "Benchmark", description: "Benchmarkgroepen voor portefeuilles" },
];

type EditState = { type: AttributeType; id: string; name: string } | null;

const initialState: ActionState = null;

export default function AttributeOptionsPage() {
  const [data, setData] = useState<{
    wtpClassifications: WtpClassification[];
    assetClassRows: AssetClassRow[];
    managers: Manager[];
    benchmarkGroups: BenchmarkGroup[];
  }>({ wtpClassifications: [], assetClassRows: [], managers: [], benchmarkGroups: [] });
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<EditState>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [createState, createAction, createPending] = useActionState(createOption, initialState);
  const [updateState, updateAction, updatePending] = useActionState(updateOption, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteOption, initialState);

  const refresh = useCallback(() => {
    loadAttributeOptions().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Refresh data after any action succeeds
  useEffect(() => {
    if (createState?.ok || updateState?.ok || deleteState?.ok) {
      startTransition(() => {
        setEditItem(null);
        setMessage({ ok: true, text: createState?.message || updateState?.message || deleteState?.message || "" });
      });
      refresh();
      setTimeout(() => startTransition(() => setMessage(null)), 4000);
    }
  }, [createState, updateState, deleteState, refresh]);

  // Show errors
  useEffect(() => {
    const err = createState && !createState.ok ? createState
      : updateState && !updateState.ok ? updateState
      : deleteState && !deleteState.ok ? deleteState
      : null;
    if (err) {
      startTransition(() => {
        setMessage({ ok: false, text: err.message });
      });
      setTimeout(() => startTransition(() => setMessage(null)), 6000);
    }
  }, [createState, updateState, deleteState]);

  function getList(type: AttributeType): Array<{ id: string; name: string }> {
    switch (type) {
      case "wtp": return data.wtpClassifications;
      case "asset_class": return data.assetClassRows;
      case "manager": return data.managers;
      case "benchmark": return data.benchmarkGroups;
    }
  }

  const attrInfo = ATTR_TYPES.find((a) => a.key === editItem?.type);

  return (
    <div className="page-shell">
      <div className="page-intro" style={{ alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow">ADMIN · ATTRIBUTEN</p>
          <h1>Attribuutopties beheren</h1>
          <p>
            Beheer de toegestane opties voor de verplichte portfolio-attributen. 
            Opties die in gebruik zijn door een portefeuille kunnen niet worden verwijderd.
          </p>
        </div>
      </div>

      {message && (
        <div
          className={message.ok ? "approval-success" : "form-errors"}
          role="alert"
          style={{ marginBottom: 24 }}
        >
          <b>{message.text}</b>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--muted)", padding: 24 }}>Laden...</p>
      ) : (
        ATTR_TYPES.map((attr) => {
          const items = getList(attr.key);
          const isEditing = editItem?.type === attr.key;
          const isDeleting = deletePending;

          return (
            <section key={attr.key} className="attr-section" style={{ marginBottom: 40 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 18, letterSpacing: "-.03em" }}>{attr.label}</h2>
                  <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--muted)" }}>{attr.description} · {items.length} optie{items.length !== 1 ? "s" : ""}</p>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="empty-state" style={{ padding: "24px 0", textAlign: "center" }}>
                  <p style={{ color: "var(--muted)", fontSize: 13 }}>Geen opties gevonden.</p>
                </div>
              ) : (
                <div className="config-table-wrap">
                  <table className="config-table">
                    <thead>
                      <tr>
                        <th>Naam</th>
                        <th style={{ width: 160 }}>Acties</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id}>
                          {isEditing && editItem?.id === item.id ? (
                            <>
                              <td>
                                <form action={updateAction} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  <input type="hidden" name="type" value={attr.key} />
                                  <input type="hidden" name="id" value={item.id} />
                                  <input
                                    name="name"
                                    defaultValue={editItem.name}
                                    className="inline-edit-input"
                                    style={{
                                      font: "inherit",
                                      fontSize: 13,
                                      padding: "6px 10px",
                                      border: "1px solid var(--accent)",
                                      borderRadius: 6,
                                      background: "#fff",
                                      width: 260,
                                    }}
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") setEditItem(null);
                                    }}
                                  />
                                  <button
                                    className="button button-primary"
                                    disabled={updatePending}
                                    type="submit"
                                    style={{ padding: "6px 14px", fontSize: 12 }}
                                  >
                                    {updatePending ? "..." : "Opslaan"}
                                  </button>
                                  <button
                                    className="button"
                                    type="button"
                                    onClick={() => setEditItem(null)}
                                    style={{ padding: "6px 14px", fontSize: 12 }}
                                  >
                                    Annuleren
                                  </button>
                                </form>
                              </td>
                              <td></td>
                            </>
                          ) : (
                            <>
                              <td><span style={{ fontSize: 14 }}>{item.name}</span></td>
                              <td>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button
                                    className="button"
                                    style={{ padding: "4px 12px", fontSize: 12 }}
                                    onClick={() => setEditItem({ type: attr.key, id: item.id, name: item.name })}
                                  >
                                    Bewerken
                                  </button>
                                  <form action={deleteAction}>
                                    <input type="hidden" name="type" value={attr.key} />
                                    <input type="hidden" name="id" value={item.id} />
                                    <button
                                      className="button-danger"
                                      style={{ padding: "4px 12px", fontSize: 12, lineHeight: 1.4 }}
                                      disabled={isDeleting}
                                      type="submit"
                                      onClick={(e) => {
                                        if (!confirm(`Weet u zeker dat u "${item.name}" wilt verwijderen?`)) {
                                          e.preventDefault();
                                        }
                                      }}
                                    >
                                      {isDeleting ? "..." : "Verwijderen"}
                                    </button>
                                  </form>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add new option form */}
              <details style={{ marginTop: 12 }}>
                <summary
                  style={{
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "var(--accent)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Nieuwe {attr.label.toLocaleLowerCase()} toevoegen
                </summary>
                <form action={createAction} style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
                  <input type="hidden" name="type" value={attr.key} />
                  <input
                    name="name"
                    required
                    minLength={2}
                    maxLength={100}
                    placeholder={`Naam van de ${attr.label.toLocaleLowerCase()}`}
                    style={{
                      font: "inherit",
                      fontSize: 13,
                      padding: "8px 12px",
                      border: "1px solid var(--line)",
                      borderRadius: 6,
                      background: "#fff",
                      flex: 1,
                      maxWidth: 360,
                    }}
                  />
                  <button
                    className="button button-primary"
                    disabled={createPending}
                    type="submit"
                    style={{ padding: "8px 16px", fontSize: 13 }}
                  >
                    {createPending ? "Bezig..." : "Toevoegen →"}
                  </button>
                </form>
              </details>
            </section>
          );
        })
      )}
    </div>
  );
}
