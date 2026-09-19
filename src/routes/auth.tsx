import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { LockKeyhole, Mail } from "lucide-react";
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
  const [mode, setMode] = useState<"signin" | "signup" | "magic" | "forgot">("signin");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [name, setName] = useState("");
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null); setNotice(null);
    try {
      if (mode === "signin") { const { error: authError } = await supabase.auth.signInWithPassword({ email, password }); if (authError) throw authError; await navigate({ to: "/dashboard" }); }
      if (mode === "signup") { const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { data: { full_name: name }, emailRedirectTo: window.location.origin } }); if (authError) throw authError; if (data.session) await navigate({ to: "/dashboard" }); else setNotice("Check your email to confirm your account, then return to sign in."); }
      if (mode === "magic") { const { error: authError } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } }); if (authError) throw authError; setNotice("A secure sign-in link is on its way to your email."); }
      if (mode === "forgot") { const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }); if (authError) throw authError; setNotice("Check your email for the password reset link."); }
    } catch (err) { setError(err instanceof Error ? err.message : "Sign-in failed"); } finally { setBusy(false); }
  };
  return <main className="grid min-h-screen md:grid-cols-[minmax(280px,0.8fr)_1.2fr]">
    <section className="flex flex-col justify-between bg-ink px-7 py-8 text-sidebar-foreground md:px-12 md:py-12">
      <div><div className="font-serif text-2xl font-semibold">Medina Stores</div><div className="mt-1 text-xs uppercase tracking-[0.18em] opacity-60">Family business ledger</div></div>
      <div className="my-12 max-w-md"><p className="font-serif text-3xl leading-tight md:text-5xl">Every crate, sale and family share. Accounted for.</p><div className="mt-8 h-px bg-sidebar-border" /></div>
      <p className="text-xs opacity-60">Private access for owners, staff and family stakeholders.</p>
    </section>
    <section className="flex items-center justify-center bg-background px-5 py-12"><div className="w-full max-w-md">
      <div className="mb-7"><div className="mb-4 flex h-11 w-11 items-center justify-center border border-ink"><LockKeyhole className="h-5 w-5" /></div><h1 className="text-3xl font-semibold">{mode === "signin" ? "Welcome back" : mode === "signup" ? "Create your account" : mode === "magic" ? "Email sign-in link" : "Reset your password"}</h1><p className="mt-2 text-sm text-muted-foreground">{mode === "signin" ? "Enter your details to open the ledger." : mode === "signup" ? "The first registered account becomes the owner." : "We’ll send instructions to your email address."}</p></div>
      <form onSubmit={submit} className="space-y-4">
        {mode === "signup" ? <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></Field> : null}
        <Field label="Email address"><div className="relative"><Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/><Input className="pl-9" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div></Field>
        {(mode === "signin" || mode === "signup") ? <Field label="Password"><Input type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === "signin" ? "current-password" : "new-password"} /></Field> : null}
        <FormError message={error} />{notice ? <div className="border-l-2 border-positive bg-positive/5 px-3 py-2 text-sm text-positive">{notice}</div> : null}
        <Button className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : mode === "magic" ? "Send secure link" : "Send reset link"}</Button>
      </form>
      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t pt-4 text-sm">
        <button className="text-steel hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Create account" : "Back to sign in"}</button>
        {mode === "signin" ? <><button className="text-steel hover:underline" onClick={() => setMode("magic")}>Use email link</button><button className="text-steel hover:underline" onClick={() => setMode("forgot")}>Forgot password?</button></> : null}
      </div>
    </div></section>
  </main>;
}
