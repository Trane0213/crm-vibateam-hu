import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  ssr: false,
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto mb-8 flex flex-col items-center text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-primary text-primary-foreground text-2xl font-bold shadow">
          V
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">VIBA CRM</h1>
        <p className="text-sm text-muted-foreground">VIBA-TEAM Kft. belső értékesítési rendszer</p>
      </div>
      <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-2">
        <SignInCard onSuccess={() => navigate({ to: "/dashboard", replace: true })} />
        <SignUpCard />
      </div>
    </div>
  );
}

function PasswordInput({
  id, value, onChange, autoComplete, minLength,
}: {
  id: string; value: string; onChange: (v: string) => void;
  autoComplete?: string; minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        required
        minLength={minLength}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Jelszó elrejtése" : "Jelszó mutatása"}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function SignInCard({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError("Az e-mail cím megadása kötelező.");
    if (!password) return setError("A jelszó megadása kötelező.");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      const msg = /invalid/i.test(error.message)
        ? "Hibás e-mail cím vagy jelszó."
        : error.message;
      setError(msg);
      toast.error("Sikertelen bejelentkezés", { description: msg });
      return;
    }
    toast.success("Sikeres bejelentkezés");
    onSuccess();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Bejelentkezés</CardTitle>
        <CardDescription>Lépj be a CRM felületre.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="signin-email">E-mail cím</Label>
            <Input
              id="signin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signin-password">Jelszó</Label>
            <PasswordInput
              id="signin-password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          </div>
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Bejelentkezés…" : "Bejelentkezés"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SignUpCard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) return setError("Az e-mail cím megadása kötelező.");
    if (!password) return setError("A jelszó megadása kötelező.");
    if (password.length < 8) return setError("A jelszónak legalább 8 karakter hosszúnak kell lennie.");
    if (!confirm) return setError("A jelszó megerősítése kötelező.");
    if (password !== confirm) return setError("A két jelszó nem egyezik.");

    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      toast.error("Sikertelen regisztráció", { description: error.message });
      return;
    }
    toast.success("Sikeres regisztráció", {
      description: "Ellenőrizd az e-mail fiókod a megerősítéshez.",
    });
    setPassword("");
    setConfirm("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Új fiók létrehozása</CardTitle>
        <CardDescription>Csak meghívott VIBA-TEAM munkatársaknak.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="signup-email">E-mail cím</Label>
            <Input
              id="signup-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signup-password">Jelszó</Label>
            <PasswordInput
              id="signup-password"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              minLength={8}
            />
            <p className="text-xs text-muted-foreground">Legalább 8 karakter.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="signup-confirm">Jelszó megerősítése</Label>
            <PasswordInput
              id="signup-confirm"
              value={confirm}
              onChange={setConfirm}
              autoComplete="new-password"
              minLength={8}
            />
          </div>
          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Regisztráció…" : "Regisztráció"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}