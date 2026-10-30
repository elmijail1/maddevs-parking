import { Button, CircularProgress, Typography } from "@mui/material";
import { useEffect, useRef } from "react";

export function InfiniteListFooter({
  hasNextPage,
  isFetchingNextPage,
  isFetchNextPageError,
  fetchNextPage,
  loadedPages,
  endText,
}: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => unknown;
  loadedPages: number;
  endText: string;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const canLoad = hasNextPage && !isFetchingNextPage && !isFetchNextPageError;

  useEffect(() => {
    if (!canLoad || !sentinel.current) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void fetchNextPage();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(sentinel.current);
    return () => observer.disconnect();
  }, [canLoad, fetchNextPage, loadedPages]);

  return (
    <div ref={sentinel} className="flex flex-col items-center gap-2 py-2">
      {isFetchingNextPage && <CircularProgress size={28} aria-label="Loading more" />}
      {isFetchNextPageError && (
        <>
          <Typography color="error">Couldn't load more.</Typography>
          <Button onClick={() => void fetchNextPage()}>Try again</Button>
        </>
      )}
      {canLoad && (
        <Button variant="outlined" onClick={() => void fetchNextPage()}>
          Load more
        </Button>
      )}
      {!hasNextPage && loadedPages > 1 && <Typography color="text.secondary">{endText}</Typography>}
    </div>
  );
}
