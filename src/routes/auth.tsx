import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { LockKeyhole, Mail, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/medina/shared";

export const Route = createFileRoute("/auth")({
  ssr: false,
  beforeLoad: async () => { const { data } = await supabase.auth.getUser(); if (data.user) return { signedIn: true }; return { signedIn: false }; },
  head: () => ({ meta: [{ title: "Sign in — Medina Stores" }, { name: "description", content: "Secure access to the Medina Stores business ledger." }, { property: "og:title", content: "Sign in — Medina Stores" }, { property: "og:description", content: "Secure access to the Medina Stores business ledger." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      if (mode === "signin") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
        await navigate({ to: "/dashboard" });
      }
      if (mode === "forgot") {
        const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
        if (authError) throw authError;
        setNotice("Check your email for the password reset link.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="grid min-h-screen md:grid-cols-[minmax(280px,0.8fr)_1.2fr]">
      <section className="flex flex-col justify-between bg-ink px-7 py-8 text-sidebar-foreground md:px-12 md:py-12">
        <div>
          <div className="font-serif text-2xl font-semibold">Medina Stores</div>
          <div className="mt-1 text-xs uppercase tracking-[0.18em] opacity-60">Family business ledger</div>
        </div>
        <div className="my-12 max-w-md">
          <p className="font-serif text-3xl leading-tight md:text-5xl">Every crate, sale and family share. Accounted for.</p>
          <div className="mt-8 h-px bg-sidebar-border" />
        </div>
        <p className="text-xs opacity-60">Private access for owners, staff and family stakeholders.</p>
      </section>

      <section className="flex items-center justify-center bg-background px-5 py-12">
        <div className="w-full max-w-md">
          <div className="mb-7">
            <div className="mb-4 flex h-11 w-11 items-center justify-center border border-ink">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <h1 className="text-3xl font-semibold">
              {mode === "signin" ? "Welcome back" : "Reset your password"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "signin"
                ? "Enter your details to open the ledger."
                : "We'll send instructions to your email address."}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <Field label="Email address">
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
              </div>
            </Field>
            {mode === "signin" ? (
              <Field label="Password">
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-2.5 text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </Field>
            ) : null}
            <FormError message={error} />
            {notice ? <div className="border-l-2 border-positive bg-positive/5 px-3 py-2 text-sm text-positive">{notice}</div> : null}
            <Button className="w-full" disabled={busy}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Send reset link"}
            </Button>
          </form>

          {mode === "signin" ? (
            <div className="mt-5 border-t pt-4 text-sm">
              <button className="text-steel hover:underline" onClick={() => { setMode("forgot"); setError(null); setNotice(null); }}>
                Forgot password?
              </button>
            </div>
          ) : (
            <div className="mt-5 border-t pt-4 text-sm">
              <button className="text-steel hover:underline" onClick={() => { setMode("signin"); setError(null); setNotice(null); }}>
                Back to sign in
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
