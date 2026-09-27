import type { IdentityContext, IdentityProvider, IdentityRequest } from "@/lib/identity/types";
import { IDENTITY_SESSION_COOKIE, verifyIdentitySessionToken } from "@/lib/identity/session";

export class SignedSessionIdentityProvider implements IdentityProvider {
  async getIdentity(request: IdentityRequest): Promise<IdentityContext | null> {
    return verifyIdentitySessionToken(request.cookies.get(IDENTITY_SESSION_COOKIE)?.value);
  }
}

export const signedSessionIdentityProvider = new SignedSessionIdentityProvider();
