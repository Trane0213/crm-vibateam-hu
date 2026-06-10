import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/settings/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const profile = useQuery({
    queryKey: ["users_profile", "me", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users_profile")
        .select("*")
        .eq("auth_user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const [fullName, setFullName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    if (profile.data?.full_name) setFullName(profile.data.full_name);
  }, [profile.data?.full_name]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.data?.id) {
      toast.error("Hiányzó profil", { description: "Próbálkozz újra pár másodperc múlva." });
      return;
    }
    setSavingProfile(true);
    const { error } = await supabase
      .from("users_profile")
      .update({ full_name: fullName.trim() || null })
      .eq("id", profile.data.id);
    setSavingProfile(false);
    if (error) {
      toast.error("Mentés sikertelen", { description: error.message });
      return;
    }
    toast.success("Profil mentve");
    qc.invalidateQueries({ queryKey: ["users_profile"] });
  };

  // Jelszó módosítás
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwError(null);
    if (newPassword.length < 8) return setPwError("A jelszónak legalább 8 karakter hosszúnak kell lennie.");
    if (newPassword !== confirm) return setPwError("A két jelszó nem egyezik.");
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPw(false);
    if (error) {
      setPwError(error.message);
      toast.error("Jelszó módosítás sikertelen", { description: error.message });
      return;
    }
    setNewPassword("");
    setConfirm("");
    toast.success("Jelszó frissítve");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profil adatok</CardTitle>
          <CardDescription>A neved megjelenik a feladatokon és dokumentumokon.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-4 max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="profile-email">E-mail cím</Label>
              <Input id="profile-email" value={user?.email ?? ""} disabled />
              <p className="text-xs text-muted-foreground">
                Az e-mail cím módosítását kérd a rendszergazdától.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Teljes név</Label>
              <Input
                id="profile-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Pl. Kovács János"
              />
            </div>
            <Button type="submit" disabled={savingProfile || profile.isLoading}>
              {savingProfile ? "Mentés…" : "Profil mentése"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Jelszó módosítása</CardTitle>
          <CardDescription>Új jelszó beállítása.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-4 max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="new-pw">Új jelszó</Label>
              <Input
                id="new-pw"
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">Legalább 8 karakter.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pw">Jelszó megerősítése</Label>
              <Input
                id="confirm-pw"
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
              />
            </div>
            {pwError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {pwError}
              </div>
            )}
            <Button type="submit" disabled={savingPw}>
              {savingPw ? "Mentés…" : "Jelszó módosítása"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}