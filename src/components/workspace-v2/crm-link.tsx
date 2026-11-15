import { createContext, forwardRef, useCallback, useContext, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { remapToWorkspace } from "@/lib/workspace-v2/link-remap";

// Az új munkaterület kerete jelzi a beágyazott (régi felülettel közös) komponenseknek,
// hogy a hivatkozásaik az új képernyőkre mutassanak. A kereten kívül minden változatlan.
const InWorkspace = createContext(false);

export function WorkspaceLinkProvider({ children }: { children: ReactNode }) {
  return <InWorkspace.Provider value={true}>{children}</InWorkspace.Provider>;
}

export function useInWorkspace() {
  return useContext(InWorkspace);
}

function remap(opts: Record<string, unknown>, inWs: boolean) {
  if (!inWs) return opts;
  const m = remapToWorkspace({ to: opts.to as string | undefined, params: opts.params as Record<string, unknown> | undefined, search: opts.search });
  return m ? { ...opts, to: m.to, params: m.params, search: m.search ?? {} } : opts;
}

/** Ugyanaz, mint a `Link`; az új munkaterületen belül az új megfelelő képernyőre visz. */
export const CrmLink = forwardRef<HTMLAnchorElement, Record<string, unknown>>(function CrmLink(props, ref) {
  const inWs = useContext(InWorkspace);
  const L = Link as unknown as (p: Record<string, unknown>) => ReactNode;
  return <L ref={ref} {...remap(props, inWs)} />;
}) as unknown as typeof Link;

/** Ugyanaz, mint a `useNavigate`; az új munkaterületen belül az új képernyőre navigál. */
export function useCrmNavigate(): ReturnType<typeof useNavigate> {
  const navigate = useNavigate();
  const inWs = useContext(InWorkspace);
  return useCallback(
    ((opts: Record<string, unknown>) => (navigate as unknown as (o: Record<string, unknown>) => Promise<void>)(remap(opts, inWs))) as unknown as ReturnType<typeof useNavigate>,
    [navigate, inWs],
  );
}
