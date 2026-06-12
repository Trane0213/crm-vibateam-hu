import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { canAccessRoute, type RoleSlug } from "@/lib/permissions";

export type RoutePermRow = {
  id: string;
  role_name: string;
  route_prefix: string;
  allowed: boolean;
};

/**
 * A route_permissions tábla tartalma. Ha nem létezik / üres / hibázik,
 * üres tömböt ad vissza és a hívó a kódba égetett ROUTE_ACCESS-re esik vissza.
 */
export function useRoutePermissions() {
  return useQuery({
    queryKey: ["route_permissions"],
    staleTime: 60_000,
    queryFn: async (): Promise<RoutePermRow[]> => {
      const { data, error } = await supabase
        .from("route_permissions")
        .select("id, role_name, route_prefix, allowed");
      if (error) {
        console.warn("[useRoutePermissions] fallback to ROUTE_ACCESS:", error.message);
        return [];
      }
      return (data ?? []) as RoutePermRow[];
    },
  });
}

/**
 * Effektív hozzáférés egy adott role-hoz és útvonalhoz.
 * 1. Ha a route_permissions tartalmaz illeszkedő prefixet az adott role-ra,
 *    annak `allowed` értéke nyer (leghosszabb prefix illeszkedés).
 * 2. Ha nincs DB rekord, a kódba égetett canAccessRoute dönt.
 */
export function resolveAccess(
  role: RoleSlug,
  pathname: string,
  rules: RoutePermRow[] | undefined,
): boolean {
  if (role === "owner") return true;
  if (rules && rules.length > 0) {
    const match = rules
      .filter(
        (r) =>
          r.role_name.toLowerCase() === role &&
          (pathname === r.route_prefix || pathname.startsWith(r.route_prefix + "/")),
      )
      .sort((a, b) => b.route_prefix.length - a.route_prefix.length)[0];
    if (match) return match.allowed;
  }
  return canAccessRoute(role, pathname);
}