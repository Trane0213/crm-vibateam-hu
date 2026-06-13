import { useQuery } from "@tanstack/react-query";
import {
  scanIncompleteCompanies,
  scanCompanyDuplicatePairs,
  scanContactConflicts,
  scanUnlinkedLeads,
  scanUnlinkedThreads,
} from "./global-scans";

/**
 * D7 — egységes adatminőségi „overview".
 * Ugyanezt az adatot használja a Marketing dashboard rendszerfigyelmeztetése,
 * a Data Quality Center fejléce, és bárhol, ahol összesített számláló kell.
 */
export function useQualityOverview() {
  const incomplete = useQuery({
    queryKey: ["dq", "overview", "incomplete"],
    queryFn: () => scanIncompleteCompanies(500),
    staleTime: 5 * 60_000,
  });
  const dups = useQuery({
    queryKey: ["dq", "overview", "dups"],
    queryFn: () => scanCompanyDuplicatePairs(),
    staleTime: 5 * 60_000,
  });
  const conflicts = useQuery({
    queryKey: ["dq", "overview", "conflicts"],
    queryFn: () => scanContactConflicts(),
    staleTime: 5 * 60_000,
  });
  const leads = useQuery({
    queryKey: ["dq", "overview", "leads"],
    queryFn: () => scanUnlinkedLeads(),
    staleTime: 5 * 60_000,
  });
  const threads = useQuery({
    queryKey: ["dq", "overview", "threads"],
    queryFn: () => scanUnlinkedThreads(),
    staleTime: 5 * 60_000,
  });

  const counts = {
    incompleteCompanies: (incomplete.data ?? []).filter((r) => r.score.band !== "green").length,
    companyDuplicates: dups.data?.length ?? 0,
    contactConflicts: conflicts.data?.length ?? 0,
    unlinkedLeads: leads.data?.length ?? 0,
    unlinkedThreads: threads.data?.length ?? 0,
  };
  const totalAlerts =
    counts.incompleteCompanies + counts.companyDuplicates +
    counts.contactConflicts + counts.unlinkedLeads + counts.unlinkedThreads;
  const isLoading =
    incomplete.isLoading || dups.isLoading || conflicts.isLoading ||
    leads.isLoading || threads.isLoading;

  return { counts, totalAlerts, isLoading, incomplete, dups, conflicts, leads, threads };
}