"use client";

import { useActionState, useState, useEffect, useCallback, startTransition } from "react";
import {
  loadAttributeOptions,
  createOption,
  updateOption,
  deleteOption,
  createClientConfigAssetClassAction,
  updateClientConfigAssetClassAction,
  deleteClientConfigAssetClassAction,
  createClientConfigSubAssetClassAction,
  updateClientConfigSubAssetClassAction,
  deleteClientConfigSubAssetClassAction,
  type AttributeType,
  type ActionState,
} from "./actions";
import type {
  WtpClassification,
  Manager,
  BenchmarkGroup,
  ClientConfigAssetClassAdmin,
  ClientConfigSubAssetClassAdmin,
} from "@/lib/types";

const ATTR_TYPES: { key: AttributeType; label: string; description: string }[] = [
  { key: "wtp", label: "WTP classificatie", description: "CVP, Matching, Opbouw, Rendement, Rente, Reserve" },
  { key: "manager", label: "Manager", description: "Eigen beheer, externe beheerders" },
  { key: "benchmark", label: "Benchmark", description: "Benchmarkgroepen voor portefeuilles" },
];

type EditState = { type: AttributeType; id: string; name: string } | null;
type AssetClassEditState = ClientConfigAssetClassAdmin | null;
type SubAssetClassEditState = ClientConfigSubAssetClassAdmin | null;

const initialState: ActionState = null;

export default function AttributeOptionsPage() {
  const [data, setData] = useState<{
    wtpClassifications: WtpClassification[];
    clientConfigAssetClasses: ClientConfigAssetClassAdmin[];
    clientConfigSubAssetClasses: ClientConfigSubAssetClassAdmin[];
    managers: Manager[];
    benchmarkGroups: BenchmarkGroup[];
  }>({
    wtpClassifications: [],
    clientConfigAssetClasses: [],
    clientConfigSubAssetClasses: [],
    managers: [],
    benchmarkGroups: [],
  });
  const [loading, setLoading] = useState(true);
  const [editItem, setEditItem] = useState<EditState>(null);
  const [editAssetClass, setEditAssetClass] = useState<AssetClassEditState>(null);
  const [editSubAssetClass, setEditSubAssetClass] = useState<SubAssetClassEditState>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [createState, createAction, createPending] = useActionState(createOption, initialState);
  const [updateState, updateAction, updatePending] = useActionState(updateOption, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteOption, initialState);
  const [createAssetState, createAssetAction, createAssetPending] = useActionState(createClientConfigAssetClassAction, initialState);
  const [updateAssetState, updateAssetAction, updateAssetPending] = useActionState(updateClientConfigAssetClassAction, initialState);
  const [deleteAssetState, deleteAssetAction, deleteAssetPending] = useActionState(deleteClientConfigAssetClassAction, initialState);
  const [createSubAssetState, createSubAssetAction, createSubAssetPending] = useActionState(createClientConfigSubAssetClassAction, initialState);
  const [updateSubAssetState, updateSubAssetAction, updateSubAssetPending] = useActionState(updateClientConfigSubAssetClassAction, initialState);
  const [deleteSubAssetState, deleteSubAssetAction, deleteSubAssetPending] = useActionState(deleteClientConfigSubAssetClassAction, initialState);

  const refresh = useCallback(() => {
    loadAttributeOptions().then((d) => {
      setData(d);
      setLoading(false);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  // Refresh data after any action succeeds
  useEffect(() => {
    const successState = [
      createState,
      updateState,
      deleteState,
      createAssetState,
      updateAssetState,
      deleteAssetState,
      createSubAssetState,
      updateSubAssetState,
      deleteSubAssetState,
    ].find((state) => state?.ok);

    if (successState?.ok) {
      startTransition(() => {
        setEditItem(null);
        setEditAssetClass(null);
        setEditSubAssetClass(null);
        setMessage({ ok: true, text: successState.message });
      });
      refresh();
      setTimeout(() => startTransition(() => setMessage(null)), 4000);
    }
  }, [
    createState,
    updateState,
    deleteState,
    createAssetState,
    updateAssetState,
    deleteAssetState,
    createSubAssetState,
    updateSubAssetState,
    deleteSubAssetState,
    refresh,
  ]);

  // Show errors
  useEffect(() => {
    const err = [
      createState,
      updateState,
      deleteState,
      createAssetState,
      updateAssetState,
      deleteAssetState,
      createSubAssetState,
      updateSubAssetState,
      deleteSubAssetState,
    ].find((state) => state && !state.ok);
    if (err) {
      startTransition(() => {
        setMessage({ ok: false, text: err.message });
      });
      setTimeout(() => startTransition(() => setMessage(null)), 6000);
    }
  }, [
    createState,
    updateState,
    deleteState,
    createAssetState,
    updateAssetState,
    deleteAssetState,
    createSubAssetState,
    updateSubAssetState,
    deleteSubAssetState,
  ]);

  function getList(type: AttributeType): Array<{ id: string; name: string }> {
    switch (type) {
      case "wtp": return data.wtpClassifications;
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

      {!loading && (
        <section style={{ marginTop: 48 }}>
          <div style={{ marginBottom: 18 }}>
            <p style={{ margin: "0 0 6px", color: "var(--muted)", fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase" }}>
              CLIENT CONFIG · REFERENTIEDATA
            </p>
            <h2 style={{ margin: 0, fontSize: 22, letterSpacing: "-.03em" }}>Asset class catalogus</h2>
            <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13 }}>
              Beheer de asset classes en sub asset classes die worden gebruikt in primary account IDs, zoals BAK*RACOM*EXA.
            </p>
          </div>

          <div style={{ display: "grid", gap: 28 }}>
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18 }}>Asset classes</h3>
                  <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--muted)" }}>
                    {data.clientConfigAssetClasses.length} optie{data.clientConfigAssetClasses.length !== 1 ? "s" : ""} · shortcode is 2 hoofdletters
                  </p>
                </div>
              </div>

              <div className="config-table-wrap">
                <table className="config-table">
                  <thead>
                    <tr>
                      <th>Shortcode</th>
                      <th>Naam</th>
                      <th>Gebruik</th>
                      <th style={{ width: 180 }}>Acties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clientConfigAssetClasses.map((assetClass) => {
                      const inUse = assetClass.portfolioConfigurationCount > 0 || assetClass.accountCount > 0;
                      const hasChildren = assetClass.subAssetClassCount > 0;
                      const isEditing = editAssetClass?.assetClassId === assetClass.assetClassId;

                      return (
                        <tr key={assetClass.assetClassId}>
                          {isEditing ? (
                            <>
                              <td colSpan={3}>
                                <form action={updateAssetAction} style={{ display: "grid", gridTemplateColumns: "90px minmax(180px, 1fr) auto auto", gap: 8, alignItems: "center" }}>
                                  <input type="hidden" name="assetClassId" value={assetClass.assetClassId} />
                                  <input
                                    name="assetClassCode"
                                    defaultValue={assetClass.assetClassCode}
                                    maxLength={2}
                                    pattern="[A-Z]{2}"
                                    className="inline-edit-input"
                                    title="Gebruik precies 2 hoofdletters"
                                    style={{ font: "inherit", fontSize: 13, padding: "6px 10px", border: "1px solid var(--accent)", borderRadius: 6 }}
                                  />
                                  <input
                                    name="assetClassName"
                                    defaultValue={assetClass.assetClassName}
                                    maxLength={30}
                                    style={{ font: "inherit", fontSize: 13, padding: "6px 10px", border: "1px solid var(--accent)", borderRadius: 6 }}
                                  />
                                  <button className="button button-primary" disabled={updateAssetPending} type="submit" style={{ padding: "6px 14px", fontSize: 12 }}>
                                    {updateAssetPending ? "..." : "Opslaan"}
                                  </button>
                                  <button className="button" type="button" onClick={() => setEditAssetClass(null)} style={{ padding: "6px 14px", fontSize: 12 }}>
                                    Annuleren
                                  </button>
                                </form>
                              </td>
                              <td></td>
                            </>
                          ) : (
                            <>
                              <td><code>{assetClass.assetClassCode}</code></td>
                              <td>{assetClass.assetClassName}</td>
                              <td style={{ color: "var(--muted)", fontSize: 13 }}>
                                {assetClass.subAssetClassCount} sub · {assetClass.portfolioConfigurationCount + assetClass.accountCount} gebruikt
                              </td>
                              <td>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button className="button" style={{ padding: "4px 12px", fontSize: 12 }} onClick={() => setEditAssetClass(assetClass)}>
                                    Bewerken
                                  </button>
                                  <form action={deleteAssetAction}>
                                    <input type="hidden" name="assetClassId" value={assetClass.assetClassId} />
                                    <button
                                      className="button-danger"
                                      disabled={deleteAssetPending || inUse || hasChildren}
                                      title={hasChildren ? "Verwijder eerst gekoppelde sub asset classes" : inUse ? "Asset class is in gebruik" : undefined}
                                      style={{ padding: "4px 12px", fontSize: 12, lineHeight: 1.4 }}
                                      type="submit"
                                      onClick={(e) => {
                                        if (!confirm(`Weet u zeker dat u "${assetClass.assetClassName}" wilt verwijderen?`)) {
                                          e.preventDefault();
                                        }
                                      }}
                                    >
                                      Verwijderen
                                    </button>
                                  </form>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>
                  Nieuwe asset class toevoegen
                </summary>
                <form action={createAssetAction} style={{ display: "grid", gridTemplateColumns: "100px minmax(220px, 1fr) auto", gap: 8, alignItems: "center", marginTop: 10, maxWidth: 640 }}>
                  <input name="assetClassCode" maxLength={2} pattern="[A-Z]{2}" placeholder="RA" required style={{ font: "inherit", fontSize: 13, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 6 }} />
                  <input name="assetClassName" maxLength={30} placeholder="REAL_ASSETS" required style={{ font: "inherit", fontSize: 13, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 6 }} />
                  <button className="button button-primary" disabled={createAssetPending} type="submit" style={{ padding: "8px 16px", fontSize: 13 }}>
                    {createAssetPending ? "Bezig..." : "Toevoegen"}
                  </button>
                </form>
              </details>
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18 }}>Sub asset classes</h3>
                  <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--muted)" }}>
                    {data.clientConfigSubAssetClasses.length} optie{data.clientConfigSubAssetClasses.length !== 1 ? "s" : ""} · shortcode is 3 hoofdletters binnen de asset class
                  </p>
                </div>
              </div>

              <div className="config-table-wrap">
                <table className="config-table">
                  <thead>
                    <tr>
                      <th>Asset class</th>
                      <th>Shortcode</th>
                      <th>Naam</th>
                      <th>Sort</th>
                      <th>Gebruik</th>
                      <th style={{ width: 180 }}>Acties</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.clientConfigSubAssetClasses.map((subAssetClass) => {
                      const inUse = subAssetClass.portfolioConfigurationCount > 0 || subAssetClass.accountCount > 0;
                      const isEditing = editSubAssetClass?.subAssetClassId === subAssetClass.subAssetClassId;

                      return (
                        <tr key={subAssetClass.subAssetClassId}>
                          {isEditing ? (
                            <>
                              <td colSpan={5}>
                                <form action={updateSubAssetAction} style={{ display: "grid", gridTemplateColumns: "minmax(150px, 1fr) 90px minmax(220px, 1.5fr) 80px auto auto", gap: 8, alignItems: "center" }}>
                                  <input type="hidden" name="subAssetClassId" value={subAssetClass.subAssetClassId} />
                                  <select name="assetClassId" defaultValue={subAssetClass.assetClassId} style={{ font: "inherit", fontSize: 13, padding: "6px 10px", border: "1px solid var(--accent)", borderRadius: 6 }}>
                                    {data.clientConfigAssetClasses.map((assetClass) => (
                                      <option key={assetClass.assetClassId} value={assetClass.assetClassId}>
                                        {assetClass.assetClassCode} · {assetClass.assetClassName}
                                      </option>
                                    ))}
                                  </select>
                                  <input name="subAssetClassCode" defaultValue={subAssetClass.subAssetClassCode} maxLength={3} pattern="[A-Z]{3}" className="inline-edit-input" style={{ font: "inherit", fontSize: 13, padding: "6px 10px", border: "1px solid var(--accent)", borderRadius: 6 }} />
                                  <input name="subAssetClassName" defaultValue={subAssetClass.subAssetClassName} maxLength={100} style={{ font: "inherit", fontSize: 13, padding: "6px 10px", border: "1px solid var(--accent)", borderRadius: 6 }} />
                                  <input name="sortOrder" type="number" min={1} defaultValue={subAssetClass.sortOrder ?? ""} style={{ font: "inherit", fontSize: 13, padding: "6px 10px", border: "1px solid var(--accent)", borderRadius: 6 }} />
                                  <button className="button button-primary" disabled={updateSubAssetPending} type="submit" style={{ padding: "6px 14px", fontSize: 12 }}>
                                    {updateSubAssetPending ? "..." : "Opslaan"}
                                  </button>
                                  <button className="button" type="button" onClick={() => setEditSubAssetClass(null)} style={{ padding: "6px 14px", fontSize: 12 }}>
                                    Annuleren
                                  </button>
                                </form>
                              </td>
                              <td></td>
                            </>
                          ) : (
                            <>
                              <td>{subAssetClass.assetClassName}</td>
                              <td><code>{subAssetClass.assetClassCode}{subAssetClass.subAssetClassCode}</code></td>
                              <td>{subAssetClass.subAssetClassName}</td>
                              <td>{subAssetClass.sortOrder ?? ""}</td>
                              <td style={{ color: "var(--muted)", fontSize: 13 }}>{subAssetClass.portfolioConfigurationCount + subAssetClass.accountCount} gebruikt</td>
                              <td>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button className="button" style={{ padding: "4px 12px", fontSize: 12 }} onClick={() => setEditSubAssetClass(subAssetClass)}>
                                    Bewerken
                                  </button>
                                  <form action={deleteSubAssetAction}>
                                    <input type="hidden" name="subAssetClassId" value={subAssetClass.subAssetClassId} />
                                    <button
                                      className="button-danger"
                                      disabled={deleteSubAssetPending || inUse}
                                      title={inUse ? "Sub asset class is in gebruik" : undefined}
                                      style={{ padding: "4px 12px", fontSize: 12, lineHeight: 1.4 }}
                                      type="submit"
                                      onClick={(e) => {
                                        if (!confirm(`Weet u zeker dat u "${subAssetClass.subAssetClassName}" wilt verwijderen?`)) {
                                          e.preventDefault();
                                        }
                                      }}
                                    >
                                      Verwijderen
                                    </button>
                                  </form>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600, color: "var(--accent)" }}>
                  Nieuwe sub asset class toevoegen
                </summary>
                <form action={createSubAssetAction} style={{ display: "grid", gridTemplateColumns: "minmax(170px, 1fr) 100px minmax(220px, 1.5fr) 80px auto", gap: 8, alignItems: "center", marginTop: 10 }}>
                  <select name="assetClassId" required style={{ font: "inherit", fontSize: 13, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 6 }}>
                    <option value="">Asset class</option>
                    {data.clientConfigAssetClasses.map((assetClass) => (
                      <option key={assetClass.assetClassId} value={assetClass.assetClassId}>
                        {assetClass.assetClassCode} · {assetClass.assetClassName}
                      </option>
                    ))}
                  </select>
                  <input name="subAssetClassCode" maxLength={3} pattern="[A-Z]{3}" placeholder="COM" required style={{ font: "inherit", fontSize: 13, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 6 }} />
                  <input name="subAssetClassName" maxLength={100} placeholder="COMMODITIES" required style={{ font: "inherit", fontSize: 13, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 6 }} />
                  <input name="sortOrder" type="number" min={1} placeholder="1" style={{ font: "inherit", fontSize: 13, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 6 }} />
                  <button className="button button-primary" disabled={createSubAssetPending} type="submit" style={{ padding: "8px 16px", fontSize: 13 }}>
                    {createSubAssetPending ? "Bezig..." : "Toevoegen"}
                  </button>
                </form>
              </details>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
