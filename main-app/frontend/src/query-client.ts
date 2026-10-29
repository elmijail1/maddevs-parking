import { QueryCache, QueryClient, type DefaultOptions } from "@tanstack/react-query";
import { UnauthorizedError } from "./api-errors";
import { currentUserQueryKey } from "./auth/api";

export function createQueryClient(defaultOptions?: DefaultOptions) {
  const queryClient: QueryClient = new QueryClient({
    defaultOptions,
    queryCache: new QueryCache({
      onError: (error) => {
        if (error instanceof UnauthorizedError) {
          queryClient.setQueryData(currentUserQueryKey, null);
        }
      },
    }),
  });
  return queryClient;
}
