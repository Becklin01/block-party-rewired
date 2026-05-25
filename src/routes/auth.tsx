import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in · Tetris Remix" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { display_name: name.trim() || email.split("@")[0] },
          },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError(null);
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) setError(res.error.message ?? "Google sign-in failed");
  };

  return (
    <div className="min-h-screen w-full text-white font-mono flex flex-col items-center justify-center p-6"
      style={{ background: "radial-gradient(1200px 800px at 50% -10%, #1e1b4b 0%, #0a0a1a 60%, #050510 100%)" }}>
      <Link to="/" className="absolute top-6 left-6 text-white/50 text-xs tracking-widest hover:text-white">← BACK</Link>
      <h1 className="text-5xl font-extrabold tracking-[0.15em] mb-2"
        style={{ background: "linear-gradient(180deg, #fff, #a855f7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
        TETRIS
      </h1>
      <div className="text-purple-300/70 tracking-[0.3em] mb-10 text-xs">
        {mode === "signin" ? "SIGN IN" : "CREATE ACCOUNT"}
      </div>

      <form onSubmit={submit} className="w-full max-w-sm flex flex-col gap-3">
        {mode === "signup" && (
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            placeholder="Display name"
            className="bg-black/50 border border-white/15 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-400"
          />
        )}
        <input
          type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="bg-black/50 border border-white/15 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-400"
        />
        <input
          type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="bg-black/50 border border-white/15 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-400"
        />
        {error && <div className="text-red-400 text-sm text-center">{error}</div>}
        <button
          type="submit" disabled={busy}
          className="px-6 py-3 rounded-xl font-bold tracking-widest text-sm bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_30px_rgba(168,85,247,0.6)] hover:scale-105 transition disabled:opacity-50"
        >
          {busy ? "..." : mode === "signin" ? "SIGN IN" : "SIGN UP"}
        </button>

        <div className="flex items-center gap-3 my-1 text-white/30 text-xs tracking-widest">
          <div className="flex-1 h-px bg-white/10" /> OR <div className="flex-1 h-px bg-white/10" />
        </div>

        <button
          type="button" onClick={google}
          className="px-6 py-3 rounded-xl font-bold tracking-widest text-sm border border-white/20 text-white hover:bg-white/5 transition"
        >
          CONTINUE WITH GOOGLE
        </button>

        <button
          type="button"
          onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
          className="text-xs text-purple-300/70 hover:text-white tracking-widest mt-3"
        >
          {mode === "signin" ? "NEW HERE? CREATE ACCOUNT" : "ALREADY HAVE AN ACCOUNT? SIGN IN"}
        </button>
      </form>
    </div>
  );
}
