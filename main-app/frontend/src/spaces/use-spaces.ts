import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { currentUserQueryKey } from "../auth/api";
import { fetchMyParkings, fetchSpaces, myParkingsQueryKey, spacesQueryKey, subscribeToSpaces } from "./api";

export function useSpaces() {
  const queryClient = useQueryClient();
  const [livePaused, setLivePaused] = useState(false);

  useEffect(
    () =>
      subscribeToSpaces({
        onSpaces: (spaces) => {
          queryClient.setQueryData(spacesQueryKey, spaces);
          void queryClient.invalidateQueries({ queryKey: myParkingsQueryKey });
        },
        onPausedChange: setLivePaused,
        onClosed: () => void queryClient.invalidateQueries({ queryKey: currentUserQueryKey }),
      }),
    [queryClient],
  );

  return { ...useQuery({ queryKey: spacesQueryKey, queryFn: fetchSpaces, staleTime: Infinity }), livePaused };
}

export function useMyParkings() {
  return useQuery({ queryKey: myParkingsQueryKey, queryFn: fetchMyParkings });
}
