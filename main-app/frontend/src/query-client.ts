import { MutationCache, QueryCache, QueryClient, type DefaultOptions } from "@tanstack/react-query";
import { UnauthorizedError } from "./api-errors";
import { currentUserQueryKey } from "./auth/api";

export function createQueryClient(defaultOptions?: DefaultOptions) {
  const onError = (error: Error) => {
    if (error instanceof UnauthorizedError) {
      queryClient.setQueryData(currentUserQueryKey, null);
    }
  };
  const queryClient: QueryClient = new QueryClient({
    defaultOptions,
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
  });
  return queryClient;
}
