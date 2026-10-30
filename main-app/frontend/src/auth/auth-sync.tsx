import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { currentUserQueryKey } from "./api";

type AuthMessage = { type: "logged-in" } | { type: "logged-out" } | { type: "user-changed" };

const channelName = "parking-auth";
const BroadcastContext = createContext<(message: AuthMessage) => void>(() => {});

export function clearUserData(queryClient: QueryClient) {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== currentUserQueryKey[0] });
}

export function AuthSyncProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const channel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const current = new BroadcastChannel(channelName);
    current.onmessage = (event: MessageEvent<AuthMessage>) => {
      if (event.data.type === "logged-out") {
        clearUserData(queryClient);
        queryClient.setQueryData(currentUserQueryKey, null);
      } else if (event.data.type === "logged-in") {
        clearUserData(queryClient);
        void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
      } else {
        void queryClient.invalidateQueries({ queryKey: currentUserQueryKey });
      }
    };
    channel.current = current;
    return () => {
      current.close();
      channel.current = null;
    };
  }, [queryClient]);

  return (
    <BroadcastContext.Provider value={(message) => channel.current?.postMessage(message)}>
      {children}
    </BroadcastContext.Provider>
  );
}

export function useBroadcastAuth() {
  return useContext(BroadcastContext);
}
