export type IdentityContext = {
  userId: string;
  displayName: string;
  groups: string[];
  tenant: string | null;
  businessUnit: string | null;
  sessionId: string;
};

export type IdentityRequest = {
  cookies: {
    get(name: string): { value: string } | undefined;
  };
};

/** Authentication providers implement this boundary; RBAC never reads browser role state. */
export interface IdentityProvider {
  getIdentity(request: IdentityRequest): Promise<IdentityContext | null>;
}
