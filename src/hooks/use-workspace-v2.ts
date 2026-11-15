import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

// Felhasználónkénti be/ki kapcsoló az új munkaterülethez. Csak böngészőben tárolt
// megjelenítési beállítás — semmilyen adatot vagy jogot nem érint.
const key = (uid: string) => `viba.workspace-v2.${uid}`;

export function useWorkspaceV2() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!user?.id) return;
    setEnabled(window.localStorage.getItem(key(user.id)) === "1");
  }, [user?.id]);
  const set = useCallback((v: boolean) => {
    if (!user?.id) return;
    window.localStorage.setItem(key(user.id), v ? "1" : "0");
    setEnabled(v);
  }, [user?.id]);
  return { enabled, setEnabled: set };
}
