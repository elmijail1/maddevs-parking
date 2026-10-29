import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchSpaces, spacesQueryKey, subscribeToSpaces } from "./api";

export function useSpaces() {
  const queryClient = useQueryClient();

  useEffect(() => subscribeToSpaces((spaces) => queryClient.setQueryData(spacesQueryKey, spaces)), [queryClient]);

  return useQuery({ queryKey: spacesQueryKey, queryFn: fetchSpaces, staleTime: Infinity });
}
