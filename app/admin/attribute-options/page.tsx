"use client";

import { useActionState, useCallback, useEffect, useMemo, useState, startTransition } from "react";
import {
  createClientConfigAssetClassAction,
  createClientConfigBenchmarkAction,
  createClientConfigManagerAction,
  createClientConfigNpcClassificationAction,
  createClientConfigSubAssetClassAction,
  createOption,
  deleteClientConfigAssetClassAction,
  deleteClientConfigBenchmarkAction,
  deleteClientConfigManagerAction,
  deleteClientConfigNpcClassificationAction,
  deleteClientConfigSubAssetClassAction,
  deleteOption,
  loadAttributeOptions,
  updateClientConfigAssetClassAction,
  updateClientConfigBenchmarkAction,
  updateClientConfigManagerAction,
  updateClientConfigNpcClassificationAction,
  updateClientConfigSubAssetClassAction,
  updateOption,
  type ActionState,
} from "./actions";
import type {
  ClientConfigAssetClassAdmin,
  ClientConfigBenchmarkAdmin,
  ClientConfigManagerAdmin,
  ClientConfigNpcClassificationAdmin,
  ClientConfigSubAssetClassAdmin,
  WtpClassification,
} from "@/lib/types";

const initialState: ActionState = null;

type EditState =
  | { kind: "wtp"; id: string; name: string }
  | { kind: "asset"; row: ClientConfigAssetClassAdmin }
  | { kind: "subAsset"; row: ClientConfigSubAssetClassAdmin }
  | { kind: "manager"; row: ClientConfigManagerAdmin }
  | { kind: "benchmark"; row: ClientConfigBenchmarkAdmin }
  | { kind: "npc"; row: ClientConfigNpcClassificationAdmin }
  | null;

type PageData = {
  wtpClassifications: WtpClassification[];
  clientConfigAssetClasses: ClientConfigAssetClassAdmin[];
  clientConfigSubAssetClasses: ClientConfigSubAssetClassAdmin[];
  clientConfigManagers: ClientConfigManagerAdmin[];
  clientConfigBenchmarks: ClientConfigBenchmarkAdmin[];
  clientConfigNpcClassifications: ClientConfigNpcClassificationAdmin[];
};

const emptyData: PageData = {
  wtpClassifications: [],
  clientConfigAssetClasses: [],
  clientConfigSubAssetClasses: [],
  clientConfigManagers: [],
  clientConfigBenchmarks: [],
  clientConfigNpcClassifications: [],
};

function usageLabel(count: number) {
  return `${count} gebruikt`;
}

function isSuccess(state: ActionState) {
  return state?.ok === true;
}

export default function AttributeOptionsPage() {
  const [data, setData] = useState<PageData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState<EditState>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [createWtpState, createWtpAction, createWtpPending] = useActionState(createOption, initialState);
  const [updateWtpState, updateWtpAction, updateWtpPending] = useActionState(updateOption, initialState);
  const [deleteWtpState, deleteWtpAction, deleteWtpPending] = useActionState(deleteOption, initialState);

  const [createAssetState, createAssetAction, createAssetPending] = useActionState(createClientConfigAssetClassAction, initialState);
  const [updateAssetState, updateAssetAction, updateAssetPending] = useActionState(updateClientConfigAssetClassAction, initialState);
  const [deleteAssetState, deleteAssetAction, deleteAssetPending] = useActionState(deleteClientConfigAssetClassAction, initialState);
  const [createSubAssetState, createSubAssetAction, createSubAssetPending] = useActionState(createClientConfigSubAssetClassAction, initialState);
  const [updateSubAssetState, updateSubAssetAction, updateSubAssetPending] = useActionState(updateClientConfigSubAssetClassAction, initialState);
  const [deleteSubAssetState, deleteSubAssetAction, deleteSubAssetPending] = useActionState(deleteClientConfigSubAssetClassAction, initialState);

  const [createManagerState, createManagerAction, createManagerPending] = useActionState(createClientConfigManagerAction, initialState);
  const [updateManagerState, updateManagerAction, updateManagerPending] = useActionState(updateClientConfigManagerAction, initialState);
  const [deleteManagerState, deleteManagerAction, deleteManagerPending] = useActionState(deleteClientConfigManagerAction, initialState);

  const [createBenchmarkState, createBenchmarkAction, createBenchmarkPending] = useActionState(createClientConfigBenchmarkAction, initialState);
  const [updateBenchmarkState, updateBenchmarkAction, updateBenchmarkPending] = useActionState(updateClientConfigBenchmarkAction, initialState);
  const [deleteBenchmarkState, deleteBenchmarkAction, deleteBenchmarkPending] = useActionState(deleteClientConfigBenchmarkAction, initialState);

  const [createNpcState, createNpcAction, createNpcPending] = useActionState(createClientConfigNpcClassificationAction, initialState);
  const [updateNpcState, updateNpcAction, updateNpcPending] = useActionState(updateClientConfigNpcClassificationAction, initialState);
  const [deleteNpcState, deleteNpcAction, deleteNpcPending] = useActionState(deleteClientConfigNpcClassificationAction, initialState);

  const actionStates = useMemo(() => [
    createWtpState, updateWtpState, deleteWtpState,
    createAssetState, updateAssetState, deleteAssetState,
    createSubAssetState, updateSubAssetState, deleteSubAssetState,
    createManagerState, updateManagerState, deleteManagerState,
    createBenchmarkState, updateBenchmarkState, deleteBenchmarkState,
    createNpcState, updateNpcState, deleteNpcState,
  ], [
    createWtpState, updateWtpState, deleteWtpState,
    createAssetState, updateAssetState, deleteAssetState,
    createSubAssetState, updateSubAssetState, deleteSubAssetState,
    createManagerState, updateManagerState, deleteManagerState,
    createBenchmarkState, updateBenchmarkState, deleteBenchmarkState,
    createNpcState, updateNpcState, deleteNpcState,
  ]);

  const refresh = useCallback(() => {
    loadAttributeOptions().then((nextData) => {
      setData(nextData);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const state = actionStates.find((candidate) => candidate != null);
    if (!state) return;

    startTransition(() => {
      setMessage({ ok: state.ok, text: state.message });
      if (state.ok) setEdit(null);
    });
    if (state.ok) refresh();
    const timeout = window.setTimeout(() => {
      startTransition(() => setMessage(null));
    }, state.ok ? 4000 : 6500);
    return () => window.clearTimeout(timeout);
  }, [actionStates, refresh]);

  return (
    <div className="page-shell">
      <div className="page-intro" style={{ alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow">ADMIN - ATTRIBUTEN</p>
          <h1>Attribuutopties beheren</h1>
          <p>Beheer de toegestane client-config opties voor portfolio changes.</p>
        </div>
      </div>

      {message && (
        <div className={message.ok ? "approval-success" : "form-errors"} role="alert" style={{ marginBottom: 24 }}>
          <b>{message.text}</b>
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--muted)", padding: 24 }}>Laden...</p>
      ) : (
        <div style={{ display: "grid", gap: 40 }}>
          <section className="attr-section">
            <SectionHeader title="WTP classificatie" meta={`${data.wtpClassifications.length} opties`} />
            <div className="config-table-wrap">
              <table className="config-table">
                <thead>
                  <tr><th>Naam</th><th style={{ width: 180 }}>Acties</th></tr>
                </thead>
                <tbody>
                  {data.wtpClassifications.map((wtp) => (
                    <tr key={wtp.id}>
                      {edit?.kind === "wtp" && edit.id === wtp.id ? (
                        <>
                          <td>
                            <form action={updateWtpAction} style={{ display: "flex", gap: 8 }}>
                              <input type="hidden" name="type" value="wtp" />
                              <input type="hidden" name="id" value={wtp.id} />
                              <input name="name" defaultValue={edit.name} className="inline-edit-input" />
                              <button className="button button-primary" disabled={updateWtpPending} type="submit">Opslaan</button>
                              <button className="button" type="button" onClick={() => setEdit(null)}>Annuleren</button>
                            </form>
                          </td>
                          <td />
                        </>
                      ) : (
                        <>
                          <td>{wtp.name}</td>
                          <td><RowActions onEdit={() => setEdit({ kind: "wtp", id: wtp.id, name: wtp.name })} deleteAction={deleteWtpAction} hidden={{ type: "wtp", id: wtp.id }} pending={deleteWtpPending} label={wtp.name} /></td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details style={{ marginTop: 12 }}>
              <summary>Nieuwe WTP classificatie toevoegen</summary>
              <form action={createWtpAction} style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <input type="hidden" name="type" value="wtp" />
                <input name="name" required minLength={2} maxLength={100} placeholder="Naam" />
                <button className="button button-primary" disabled={createWtpPending} type="submit">Toevoegen</button>
              </form>
            </details>
          </section>

          <section className="attr-section">
            <SectionHeader title="Asset classes" meta={`${data.clientConfigAssetClasses.length} opties - shortcode is 2 hoofdletters`} />
            <div className="config-table-wrap">
              <table className="config-table">
                <thead>
                  <tr><th>Code</th><th>Naam</th><th>Gebruik</th><th style={{ width: 180 }}>Acties</th></tr>
                </thead>
                <tbody>
                  {data.clientConfigAssetClasses.map((row) => {
                    const inUse = row.portfolioConfigurationCount + row.accountCount > 0;
                    const hasChildren = row.subAssetClassCount > 0;
                    const editing = edit?.kind === "asset" && edit.row.assetClassId === row.assetClassId;
                    return (
                      <tr key={row.assetClassId}>
                        {editing ? (
                          <>
                            <td colSpan={3}>
                              <form action={updateAssetAction} style={{ display: "grid", gridTemplateColumns: "90px minmax(220px, 1fr) auto auto", gap: 8 }}>
                                <input type="hidden" name="assetClassId" value={row.assetClassId} />
                                <input name="assetClassCode" defaultValue={row.assetClassCode} maxLength={2} pattern="[A-Z]{2}" />
                                <input name="assetClassName" defaultValue={row.assetClassName} maxLength={30} />
                                <button className="button button-primary" disabled={updateAssetPending} type="submit">Opslaan</button>
                                <button className="button" type="button" onClick={() => setEdit(null)}>Annuleren</button>
                              </form>
                            </td>
                            <td />
                          </>
                        ) : (
                          <>
                            <td><code>{row.assetClassCode}</code></td>
                            <td>{row.assetClassName}</td>
                            <td>{row.subAssetClassCount} sub - {usageLabel(row.portfolioConfigurationCount + row.accountCount)}</td>
                            <td><RowActions onEdit={() => setEdit({ kind: "asset", row })} deleteAction={deleteAssetAction} hidden={{ assetClassId: row.assetClassId }} pending={deleteAssetPending} disabled={inUse || hasChildren} label={row.assetClassName} /></td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <details style={{ marginTop: 12 }}>
              <summary>Nieuwe asset class toevoegen</summary>
              <form action={createAssetAction} style={{ display: "grid", gridTemplateColumns: "100px minmax(220px, 1fr) auto", gap: 8, marginTop: 10, maxWidth: 640 }}>
                <input name="assetClassCode" maxLength={2} pattern="[A-Z]{2}" placeholder="RA" required />
                <input name="assetClassName" maxLength={30} placeholder="REAL_ASSETS" required />
                <button className="button button-primary" disabled={createAssetPending} type="submit">Toevoegen</button>
              </form>
            </details>
          </section>

          <section className="attr-section">
            <SectionHeader title="Sub asset classes" meta={`${data.clientConfigSubAssetClasses.length} opties - shortcode is 3 hoofdletters binnen asset class`} />
            <div className="config-table-wrap">
              <table className="config-table">
                <thead>
                  <tr><th>Asset class</th><th>Code</th><th>Naam</th><th>Sort</th><th>Gebruik</th><th style={{ width: 180 }}>Acties</th></tr>
                </thead>
                <tbody>
                  {data.clientConfigSubAssetClasses.map((row) => {
                    const inUse = row.portfolioConfigurationCount + row.accountCount > 0;
                    const editing = edit?.kind === "subAsset" && edit.row.subAssetClassId === row.subAssetClassId;
                    return (
                      <tr key={row.subAssetClassId}>
                        {editing ? (
                          <>
                            <td colSpan={5}>
                              <form action={updateSubAssetAction} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) 90px minmax(220px, 1.5fr) 80px auto auto", gap: 8 }}>
                                <input type="hidden" name="subAssetClassId" value={row.subAssetClassId} />
                                <AssetClassSelect rows={data.clientConfigAssetClasses} defaultValue={row.assetClassId} />
                                <input name="subAssetClassCode" defaultValue={row.subAssetClassCode} maxLength={3} pattern="[A-Z]{3}" />
                                <input name="subAssetClassName" defaultValue={row.subAssetClassName} maxLength={100} />
                                <input name="sortOrder" type="number" min={1} defaultValue={row.sortOrder ?? ""} />
                                <button className="button button-primary" disabled={updateSubAssetPending} type="submit">Opslaan</button>
                                <button className="button" type="button" onClick={() => setEdit(null)}>Annuleren</button>
                              </form>
                            </td>
                            <td />
                          </>
                        ) : (
                          <>
                            <td>{row.assetClassName}</td>
                            <td><code>{row.assetClassCode}{row.subAssetClassCode}</code></td>
                            <td>{row.subAssetClassName}</td>
                            <td>{row.sortOrder ?? ""}</td>
                            <td>{usageLabel(row.portfolioConfigurationCount + row.accountCount)}</td>
                            <td><RowActions onEdit={() => setEdit({ kind: "subAsset", row })} deleteAction={deleteSubAssetAction} hidden={{ subAssetClassId: row.subAssetClassId }} pending={deleteSubAssetPending} disabled={inUse} label={row.subAssetClassName} /></td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <details style={{ marginTop: 12 }}>
              <summary>Nieuwe sub asset class toevoegen</summary>
              <form action={createSubAssetAction} style={{ display: "grid", gridTemplateColumns: "minmax(170px, 1fr) 100px minmax(220px, 1.5fr) 80px auto", gap: 8, marginTop: 10 }}>
                <AssetClassSelect rows={data.clientConfigAssetClasses} />
                <input name="subAssetClassCode" maxLength={3} pattern="[A-Z]{3}" placeholder="COM" required />
                <input name="subAssetClassName" maxLength={100} placeholder="COMMODITIES" required />
                <input name="sortOrder" type="number" min={1} placeholder="1" />
                <button className="button button-primary" disabled={createSubAssetPending} type="submit">Toevoegen</button>
              </form>
            </details>
          </section>

          <section className="attr-section">
            <SectionHeader title="Managers" meta={`${data.clientConfigManagers.length} opties - client_config.manager`} />
            <div className="config-table-wrap">
              <table className="config-table">
                <thead>
                  <tr><th>Code</th><th>Naam</th><th>Gebruik</th><th style={{ width: 180 }}>Acties</th></tr>
                </thead>
                <tbody>
                  {data.clientConfigManagers.map((row) => {
                    const inUse = row.portfolioConfigurationCount + row.accountCount > 0;
                    const editing = edit?.kind === "manager" && edit.row.managerId === row.managerId;
                    return (
                      <tr key={row.managerId}>
                        {editing ? (
                          <>
                            <td colSpan={3}>
                              <form action={updateManagerAction} style={{ display: "grid", gridTemplateColumns: "90px minmax(220px, 1fr) auto auto", gap: 8 }}>
                                <input type="hidden" name="managerId" value={row.managerId} />
                                <input name="managerCode" defaultValue={row.managerCode} maxLength={3} pattern="[A-Z0-9]{3}" />
                                <input name="managerName" defaultValue={row.managerName} maxLength={50} />
                                <button className="button button-primary" disabled={updateManagerPending} type="submit">Opslaan</button>
                                <button className="button" type="button" onClick={() => setEdit(null)}>Annuleren</button>
                              </form>
                            </td>
                            <td />
                          </>
                        ) : (
                          <>
                            <td><code>{row.managerCode}</code></td>
                            <td>{row.managerName}</td>
                            <td>{usageLabel(row.portfolioConfigurationCount + row.accountCount)}</td>
                            <td><RowActions onEdit={() => setEdit({ kind: "manager", row })} deleteAction={deleteManagerAction} hidden={{ managerId: row.managerId }} pending={deleteManagerPending} disabled={inUse} label={row.managerName} /></td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <details style={{ marginTop: 12 }}>
              <summary>Nieuwe manager toevoegen</summary>
              <form action={createManagerAction} style={{ display: "grid", gridTemplateColumns: "100px minmax(220px, 1fr) auto", gap: 8, marginTop: 10, maxWidth: 640 }}>
                <input name="managerCode" maxLength={3} pattern="[A-Z0-9]{3}" placeholder="ROB" required />
                <input name="managerName" maxLength={50} placeholder="ROBECO" required />
                <button className="button button-primary" disabled={createManagerPending} type="submit">Toevoegen</button>
              </form>
            </details>
          </section>

          <section className="attr-section">
            <SectionHeader title="Benchmarks" meta={`${data.clientConfigBenchmarks.length} opties - client_config.benchmark`} />
            <div className="config-table-wrap">
              <table className="config-table">
                <thead>
                  <tr><th>Code</th><th>Naam</th><th>Rimes</th><th>Gebruik</th><th style={{ width: 180 }}>Acties</th></tr>
                </thead>
                <tbody>
                  {data.clientConfigBenchmarks.map((row) => {
                    const inUse = row.portfolioConfigurationCount + row.accountCount > 0;
                    const editing = edit?.kind === "benchmark" && edit.row.benchmarkId === row.benchmarkId;
                    return (
                      <tr key={row.benchmarkId}>
                        {editing ? (
                          <>
                            <td colSpan={4}>
                              <form action={updateBenchmarkAction} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) minmax(220px, 1.5fr) minmax(120px, 1fr) auto auto", gap: 8 }}>
                                <input type="hidden" name="benchmarkId" value={row.benchmarkId} />
                                <input name="benchmarkCode" defaultValue={row.benchmarkCode} maxLength={60} />
                                <input name="benchmarkName" defaultValue={row.benchmarkName ?? ""} maxLength={100} />
                                <input name="rimesCode" defaultValue={row.rimesCode ?? ""} maxLength={40} />
                                <button className="button button-primary" disabled={updateBenchmarkPending} type="submit">Opslaan</button>
                                <button className="button" type="button" onClick={() => setEdit(null)}>Annuleren</button>
                              </form>
                            </td>
                            <td />
                          </>
                        ) : (
                          <>
                            <td><code>{row.benchmarkCode}</code></td>
                            <td>{row.benchmarkName ?? ""}</td>
                            <td>{row.rimesCode ?? ""}</td>
                            <td>{usageLabel(row.portfolioConfigurationCount + row.accountCount)}</td>
                            <td><RowActions onEdit={() => setEdit({ kind: "benchmark", row })} deleteAction={deleteBenchmarkAction} hidden={{ benchmarkId: row.benchmarkId }} pending={deleteBenchmarkPending} disabled={inUse} label={row.benchmarkCode} /></td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <details style={{ marginTop: 12 }}>
              <summary>Nieuwe benchmark toevoegen</summary>
              <form action={createBenchmarkAction} style={{ display: "grid", gridTemplateColumns: "minmax(160px, 1fr) minmax(220px, 1.5fr) minmax(120px, 1fr) auto", gap: 8, marginTop: 10 }}>
                <input name="benchmarkCode" maxLength={60} placeholder="MSCI-WORLD-NR" required />
                <input name="benchmarkName" maxLength={100} placeholder="MSCI World Net Return" />
                <input name="rimesCode" maxLength={40} placeholder="RIMES" />
                <button className="button button-primary" disabled={createBenchmarkPending} type="submit">Toevoegen</button>
              </form>
            </details>
          </section>

          <section className="attr-section">
            <SectionHeader title="NPC classificaties" meta={`${data.clientConfigNpcClassifications.length} opties - client_config.npc_classification`} />
            <div className="config-table-wrap">
              <table className="config-table">
                <thead>
                  <tr><th>ID</th><th>Naam</th><th>Gebruik</th><th style={{ width: 180 }}>Acties</th></tr>
                </thead>
                <tbody>
                  {data.clientConfigNpcClassifications.map((row) => {
                    const inUse = row.portfolioConfigurationCount > 0;
                    const editing = edit?.kind === "npc" && edit.row.npcClassificationId === row.npcClassificationId;
                    return (
                      <tr key={row.npcClassificationId}>
                        {editing ? (
                          <>
                            <td colSpan={3}>
                              <form action={updateNpcAction} style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto auto", gap: 8 }}>
                                <input type="hidden" name="npcClassificationId" value={row.npcClassificationId} />
                                <input name="classificationName" defaultValue={row.classificationName} maxLength={80} />
                                <button className="button button-primary" disabled={updateNpcPending} type="submit">Opslaan</button>
                                <button className="button" type="button" onClick={() => setEdit(null)}>Annuleren</button>
                              </form>
                            </td>
                            <td />
                          </>
                        ) : (
                          <>
                            <td><code>{row.npcClassificationId}</code></td>
                            <td>{row.classificationName}</td>
                            <td>{usageLabel(row.portfolioConfigurationCount)}</td>
                            <td><RowActions onEdit={() => setEdit({ kind: "npc", row })} deleteAction={deleteNpcAction} hidden={{ npcClassificationId: row.npcClassificationId }} pending={deleteNpcPending} disabled={inUse} label={row.classificationName} /></td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <details style={{ marginTop: 12 }}>
              <summary>Nieuwe NPC classificatie toevoegen</summary>
              <form action={createNpcAction} style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) auto", gap: 8, marginTop: 10, maxWidth: 640 }}>
                <input name="classificationName" maxLength={80} placeholder="Geen NPC" required />
                <button className="button button-primary" disabled={createNpcPending} type="submit">Toevoegen</button>
              </form>
            </details>
          </section>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, meta }: { title: string; meta: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 18, letterSpacing: 0 }}>{title}</h2>
        <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--muted)" }}>{meta}</p>
      </div>
    </div>
  );
}

function AssetClassSelect({ rows, defaultValue }: { rows: ClientConfigAssetClassAdmin[]; defaultValue?: number }) {
  return (
    <select name="assetClassId" required defaultValue={defaultValue ?? ""}>
      <option value="" disabled>Asset class</option>
      {rows.map((row) => (
        <option key={row.assetClassId} value={row.assetClassId}>
          {row.assetClassCode} - {row.assetClassName}
        </option>
      ))}
    </select>
  );
}

function RowActions({
  onEdit,
  deleteAction,
  hidden,
  pending,
  disabled,
  label,
}: {
  onEdit: () => void;
  deleteAction: (payload: FormData) => void;
  hidden: Record<string, string | number>;
  pending: boolean;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div style={{ display: "flex", gap: 6 }}>
      <button className="button" style={{ padding: "4px 12px", fontSize: 12 }} onClick={onEdit} type="button">
        Bewerken
      </button>
      <form action={deleteAction}>
        {Object.entries(hidden).map(([name, value]) => (
          <input key={name} type="hidden" name={name} value={value} />
        ))}
        <button
          className="button-danger"
          disabled={pending || disabled}
          style={{ padding: "4px 12px", fontSize: 12, lineHeight: 1.4 }}
          type="submit"
          onClick={(event) => {
            if (!confirm(`Weet u zeker dat u "${label}" wilt verwijderen?`)) {
              event.preventDefault();
            }
          }}
        >
          Verwijderen
        </button>
      </form>
    </div>
  );
}
