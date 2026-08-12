"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createDraftFromPublishedAction,
  type CreateDraftFromPublishedState,
} from "@/app/workflow-studio/actions";

export type BranchDraftFromPublishedAction = (
  input: { definitionId: string },
) => Promise<CreateDraftFromPublishedState>;

/**
 * "Aanpassen" action for published workflows. Branching a fresh editable
 * draft from the latest published version is a server action that returns a
 * state object (it does not redirect), so this client component calls it and
 * then routes to the editor, which loads the branched draft via the regular
 * load flow. The action is injectable so tests can mock the server boundary.
 */
export function WorkflowBranchDraftButton({
  definitionId,
  action = createDraftFromPublishedAction,
}: {
  definitionId: string;
  action?: BranchDraftFromPublishedAction;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await action({ definitionId });
      if (!result.success && result.code !== "draft_already_exists") {
        setError(result.message);
        return;
      }
      // Success, or a draft already appeared (e.g. in another tab): the
      // editable draft exists, so take the user straight to the editor.
      router.push(`/workflow-studio/${definitionId}/edit`);
      router.refresh();
    });
  }

  return (
    <span className="studio-branch-draft">
      <button
        type="button"
        className="button button-primary"
        onClick={handleClick}
        disabled={pending}
      >
        {pending ? "Aanpassen…" : "Aanpassen"}
      </button>
      {error ? (
        <p className="studio-action-error" role="alert">
          {error}
        </p>
      ) : null}
    </span>
  );
}
