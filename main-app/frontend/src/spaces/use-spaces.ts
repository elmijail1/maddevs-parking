import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchMyParkings, fetchSpaces, myParkingsQueryKey, spacesQueryKey, subscribeToSpaces } from "./api";

export function useSpaces() {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      subscribeToSpaces((spaces) => {
        queryClient.setQueryData(spacesQueryKey, spaces);
        void queryClient.invalidateQueries({ queryKey: myParkingsQueryKey });
      }),
    [queryClient],
  );

  return useQuery({ queryKey: spacesQueryKey, queryFn: fetchSpaces, staleTime: Infinity });
}

export function useMyParkings() {
  return useQuery({ queryKey: myParkingsQueryKey, queryFn: fetchMyParkings });
}
