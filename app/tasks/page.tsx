import Link from "next/link";
import { redirect } from "next/navigation";

import { sql } from "@/lib/db";
import { getFeatureFlagSnapshot } from "@/lib/feature-flags";
import { getIdentityContext } from "@/lib/identity/request";
import { PostgresWorkflowRuntimeStore } from "@/lib/workflow-studio/runtime-postgres-store";
import { WorkflowTaskService, type WorkflowTaskListFilters } from "@/lib/workflow-studio/runtime-task";
import { claimWorkflowTaskAction, completeWorkflowTaskAction, decideWorkflowApprovalAction, releaseWorkflowTaskAction } from "@/app/tasks/actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ status?: string; due?: string; error?: string; notice?: string }>;

const statusLabels = {
  open: "Open",
  claimed: "Geclaimd",
  completed: "Voltooid",
  cancelled: "Geannuleerd",
  expired: "Verlopen",
} as const;

function formatDate(value?: string): string {
  if (!value) return "Geen deadline";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function statusFilter(value?: string): WorkflowTaskListFilters["statuses"] {
  if (value === "open" || value === "claimed" || value === "completed" || value === "cancelled" || value === "expired") return [value];
  return ["open", "claimed"];
}

function dueFilter(value?: string): WorkflowTaskListFilters["due"] {
  return value === "overdue" || value === "upcoming" ? value : "all";
}

export default async function TasksPage({ searchParams }: { searchParams: SearchParams }) {
  if (!getFeatureFlagSnapshot()["workflow_runtime.start"]) redirect("/");
  const params = await searchParams;
  const identity = await getIdentityContext();
  const result = sql
    ? await new WorkflowTaskService(new PostgresWorkflowRuntimeStore(sql)).listMine(identity, {
      statuses: statusFilter(params.status),
      due: dueFilter(params.due),
    })
    : { ok: false as const, code: "runtime_error" as const, message: "De workflowdatabase is niet beschikbaar." };

  const activeStatus = params.status ?? "active";
  const activeDue = params.due ?? "all";

  return <div className="page-shell tasks-page">
    <header className="page-intro">
      <div>
        <p className="eyebrow">MIJN WERK</p>
        <h1>Workflowtaken</h1>
        <p>Claim rolgebonden taken, vul uitkomsten in en zet de workflow gecontroleerd door.</p>
      </div>
      <Link className="button button-secondary" href="/change-catalog">Nieuwe aanvraag</Link>
    </header>

    {params.notice ? <div className="approval-success" role="status">{params.notice}</div> : null}
    {params.error ? <div className="form-errors" role="alert">Actie niet uitgevoerd: {params.error}</div> : null}

    <nav className="task-filters" aria-label="Taakfilters">
      {[
        ["active", "Actief"],
        ["open", "Open"],
        ["claimed", "Geclaimd"],
        ["completed", "Voltooid"],
      ].map(([value, label]) => (
        <Link key={value} className={activeStatus === value ? "is-active" : ""} href={`/tasks?status=${value}&due=${activeDue}`}>{label}</Link>
      ))}
      {[
        ["all", "Alle deadlines"],
        ["overdue", "Verlopen"],
        ["upcoming", "Aankomend"],
      ].map(([value, label]) => (
        <Link key={value} className={activeDue === value ? "is-active" : ""} href={`/tasks?status=${activeStatus}&due=${value}`}>{label}</Link>
      ))}
    </nav>

    {!result.ok ? (
      <section className="studio-empty-panel">
        <h2>Taken niet beschikbaar</h2>
        <p>{result.message}</p>
      </section>
    ) : result.value.length === 0 ? (
      <section className="studio-empty-panel">
        <h2>Geen taken gevonden</h2>
        <p>Er staan geen workflowtaken klaar voor jouw rollen en filters.</p>
      </section>
    ) : (
      <div className="task-list" aria-label="Workflowtaken">
        {result.value.map((task) => {
          const isMine = task.claimedByUserId === identity.userId;
          const isApproval = task.permissions.includes("workflow:approve");
          return <article className="task-card" key={task.id}>
            <div className="task-card-main">
              <div className="task-card-heading">
                <span className={`studio-status studio-status--${task.status}`}>{statusLabels[task.status]}</span>
                <h2>{task.title}</h2>
              </div>
              <p>{task.instructions}</p>
              <dl className="studio-workflow-meta">
                <div><dt>Rol</dt><dd>{task.workflowRole}</dd></div>
                <div><dt>Groep</dt><dd>{task.assigneeGroup.replace("bcm:role:", "")}</dd></div>
                <div><dt>Deadline</dt><dd>{formatDate(task.deadlineAt)}</dd></div>
                <div><dt>Claim</dt><dd>{task.claimedByUserId ?? "Nog niet geclaimd"}</dd></div>
              </dl>
              <Link className="button button-secondary" href={`/workflow-runtime/${task.instanceId}`}>Instance openen</Link>
            </div>
            <div className="task-actions">
              {task.status === "open" ? (
                <form action={claimWorkflowTaskAction}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <button className="button button-primary" type="submit">Claim</button>
                </form>
              ) : null}
              {task.status === "claimed" && isMine ? (
                <>
                  <form action={releaseWorkflowTaskAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <button className="button button-secondary" type="submit">Vrijgeven</button>
                  </form>
                  {isApproval ? (
                    <form className="task-complete-form" action={decideWorkflowApprovalAction}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <label className="field">
                        <span>Opmerking</span>
                        <textarea name="comment" rows={3} />
                      </label>
                      <div className="approval-decision-row">
                        <button className="button button-primary" name="decision" value="approved" type="submit">Goedkeuren</button>
                        <button className="button button-secondary" name="decision" value="returned" type="submit">Terugsturen</button>
                        <button className="button button-danger" name="decision" value="rejected" type="submit">Afwijzen</button>
                      </div>
                    </form>
                  ) : (
                    <form className="task-complete-form" action={completeWorkflowTaskAction}>
                      <input type="hidden" name="taskId" value={task.id} />
                      <label className="field">
                        <span>Taakuitvoer JSON</span>
                        <textarea name="formDataJson" defaultValue="{}" rows={4} />
                      </label>
                      <label className="field">
                        <span>Opmerking</span>
                        <textarea name="comment" rows={3} />
                      </label>
                      <button className="button button-primary" type="submit">Voltooien</button>
                    </form>
                  )}
                </>
              ) : null}
            </div>
          </article>;
        })}
      </div>
    )}
  </div>;
}
