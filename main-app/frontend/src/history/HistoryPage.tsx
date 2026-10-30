import { formatCents, formatLotDateTime, type HistoryEntry, type ParkingStatus } from "@parking/shared";
import { Button, Chip, CircularProgress, Paper, Typography } from "@mui/material";
import { useInfiniteQuery } from "@tanstack/react-query";
import { InfiniteListFooter } from "../components/InfiniteListFooter";
import { StickyTitle } from "../components/StickyTitle";
import { fetchHistory, historyQueryKey } from "./api";

const statusLabels: Record<ParkingStatus, { label: string; color: "info" | "success" | "default" | "warning" }> = {
  booked: { label: "Booked", color: "info" },
  active: { label: "In the lot", color: "success" },
  cancelled: { label: "Cancelled", color: "default" },
  finished: { label: "Finished", color: "warning" },
};

function HistoryCard({ entry }: { entry: HistoryEntry }) {
  const started = entry.status === "active" || entry.status === "finished";
  const status = statusLabels[entry.status];
  return (
    <Paper
      component="li"
      aria-label={`${entry.regNumber}, ${formatLotDateTime(entry.date)}`}
      className="flex flex-col gap-1 p-5"
    >
      <div className="flex items-start justify-between gap-4">
        <Typography variant="h6" component="h2" className="break-all">
          {entry.carName}
        </Typography>
        <Chip label={status.label} color={status.color} size="small" />
      </div>
      <Typography>
        {entry.regNumber} · Space {entry.spaceName}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {started ? "Entered" : "Booked"} {formatLotDateTime(entry.date)}
      </Typography>
      {entry.payment?.status === "paid" && (
        <Typography className="font-semibold">
          Paid: {formatCents(entry.payment.total)} on {formatLotDateTime(entry.payment.paidAt)}
        </Typography>
      )}
      {entry.payment?.status === "unpaid" && <Typography color="error">Left without paying</Typography>}
    </Paper>
  );
}

export function HistoryPage() {
  const history = useInfiniteQuery({
    queryKey: historyQueryKey,
    queryFn: ({ pageParam }) => fetchHistory(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const parkings = history.data?.pages.flatMap((page) => page.parkings);

  let content;
  if (parkings) {
    content =
      parkings.length > 0 ? (
        <>
          <ul aria-label="Your parkings" className="flex flex-col gap-4">
            {parkings.map((entry) => (
              <HistoryCard key={entry.parkingId} entry={entry} />
            ))}
          </ul>
          <InfiniteListFooter
            hasNextPage={history.hasNextPage}
            isFetchingNextPage={history.isFetchingNextPage}
            isFetchNextPageError={history.isFetchNextPageError}
            fetchNextPage={history.fetchNextPage}
            loadedPages={history.data?.pages.length ?? 0}
            endText="That's all your parkings."
          />
        </>
      ) : (
        <Typography color="text.secondary">No parkings yet.</Typography>
      );
  } else if (history.isError) {
    content = (
      <div className="flex flex-col items-center gap-4 text-center">
        <Typography color="error">An error occurred when loading your history.</Typography>
        <Button variant="contained" onClick={() => void history.refetch()}>
          Try again
        </Button>
      </div>
    );
  } else {
    content = <CircularProgress aria-label="Loading your history" className="self-center" />;
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-8 pb-8">
      <StickyTitle>History</StickyTitle>
      {content}
    </main>
  );
}
