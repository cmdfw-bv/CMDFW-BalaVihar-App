import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import * as Linking from "expo-linking";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { decodeClaims } from "./claims";
import { deriveSessionState, type DerivedSession, type SessionStatus } from "./sessionDerivation";

interface RoleRow {
  id: string;
  role: string;
  scope_type: string;
  scope_id: string | null;
  is_active: boolean;
  scope_label: string | null;
}

interface ScopeLabelRow {
  user_roles_id: string;
  scope_label: string | null;
}

interface SessionContextValue extends Omit<DerivedSession, "status"> {
  status: SessionStatus | "loading";
  scopeLabel: string | null;
  session: Session | null;
  myRoles: RoleRow[];
  signOut: () => Promise<void>;
  switchRole: (userRolesId: string) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [derived, setDerived] = useState<DerivedSession | null>(null);
  const [myRoles, setMyRoles] = useState<RoleRow[]>([]);

  async function refresh(nextSession: Session | null) {
    setSession(nextSession);
    const claims = nextSession ? decodeClaims(nextSession.access_token) : null;
    setDerived(deriveSessionState(!!nextSession, claims));

    // Refetched on every SIGNED_IN/TOKEN_REFRESHED, not cached across the session (Design
    // spec, "Role list (myRoles)") — a grant/revoke elsewhere is picked up on next refresh.
    if (nextSession) {
      const [{ data: roles }, { data: labels }] = await Promise.all([
        supabase.from("user_roles").select("id, role, scope_type, scope_id, is_active"),
        supabase.rpc("resolve_my_scope_labels"),
      ]);
      const labelById = new Map(
        ((labels ?? []) as ScopeLabelRow[]).map((l) => [l.user_roles_id, l.scope_label])
      );
      setMyRoles(
        ((roles ?? []) as Omit<RoleRow, "scope_label">[]).map((r) => ({
          ...r,
          scope_label: labelById.get(r.id) ?? null,
        }))
      );
    } else {
      setMyRoles([]);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => refresh(data.session));

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      refresh(nextSession);
    });

    // Deep-link completion (Design spec) — cold start + warm start, one code path.
    Linking.getInitialURL().then((initialUrl) => {
      if (initialUrl) void handleDeepLink(initialUrl);
    });
    const linkingSub = Linking.addEventListener("url", ({ url }) => void handleDeepLink(url));

    return () => {
      authListener.subscription.unsubscribe();
      linkingSub.remove();
    };
  }, []);

  async function handleDeepLink(url: string) {
    const { queryParams } = Linking.parse(url);
    const code = queryParams?.code;
    if (typeof code === "string") {
      await supabase.auth.exchangeCodeForSession(code);
    }
  }

  const value = useMemo<SessionContextValue>(() => ({
    status: derived?.status ?? "loading",
    activeRole: derived?.activeRole ?? null,
    scopeType: derived?.scopeType ?? null,
    scopeId: derived?.scopeId ?? null,
    scopeLabel: myRoles.find((r) => r.is_active)?.scope_label ?? null,
    session,
    myRoles,
    async signOut() {
      await supabase.auth.signOut();
    },
    async switchRole(userRolesId: string) {
      // No optimistic flip (refine-stage no-op edge case) — the switcher reflects only what
      // refreshSession() actually returns, via the TOKEN_REFRESHED listener above.
      await supabase.rpc("switch_active_role", { p_user_roles_id: userRolesId });
      await supabase.auth.refreshSession();
    },
  }), [derived, session, myRoles]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
