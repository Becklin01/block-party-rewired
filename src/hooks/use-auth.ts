import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export interface AuthState {
  session: Session | null;
  user: User | null;
  displayName: string | null;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) { setDisplayName(null); return; }
    let cancelled = false;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setDisplayName(
          data?.display_name ??
          (session.user.user_metadata?.display_name as string | undefined) ??
          (session.user.user_metadata?.full_name as string | undefined) ??
          session.user.email?.split("@")[0] ??
          "Player",
        );
      });
    return () => { cancelled = true; };
  }, [session]);

  return { session, user: session?.user ?? null, displayName, loading };
}

export async function signOut() {
  await supabase.auth.signOut();
}
