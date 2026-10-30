import { useEffect, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { searchRecords } from "./record-search.functions";
import { RECORD_SEARCH_DELAY, mergeRecordPages, type RecordSearchInput } from "./record-search-model";

export function useRecordSearch(input: Omit<RecordSearchInput, "search" | "page" | "id">, search: string, open: boolean, selectedId?: string) {
  const fetchRecords = useServerFn(searchRecords);
  const [debounced, setDebounced] = useState(search);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), RECORD_SEARCH_DELAY);
    return () => clearTimeout(timer);
  }, [search]);
  const results = useInfiniteQuery({
    queryKey: [input.source, "record-search", input.filters ?? {}, debounced],
    enabled: open && search === debounced,
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchRecords({ data: { ...input, search: debounced, page: pageParam } }),
    getNextPageParam: (last, pages) => last.hasMore ? pages.length : undefined,
    staleTime: 30_000,
  });
  const selected = useQuery({
    queryKey: [input.source, "record-selected", selectedId],
    enabled: Boolean(selectedId),
    queryFn: () => fetchRecords({ data: { source: input.source, id: selectedId } }),
    staleTime: 30_000,
  });
  return { results, selected: selected.data?.rows[0], selectedLoading: selected.isLoading,
    rows: search === debounced ? mergeRecordPages(results.data?.pages ?? []) : [],
    searching: search !== debounced || results.isLoading };
}