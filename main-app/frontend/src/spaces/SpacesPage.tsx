import type { Space } from "@parking/shared";
import { Button, CircularProgress, Typography } from "@mui/material";
import { useState } from "react";
import { BookSpaceDialog } from "./BookSpaceDialog";
import { SpaceDetailsDialog } from "./SpaceDetailsDialog";
import { SpaceTile } from "./SpaceTile";
import { useSpaces } from "./use-spaces";

function groupIntoRows(spaces: Space[]) {
  const rows = new Map<string, Space[]>();
  for (const space of spaces) {
    const rowName = space.displayName.charAt(0);
    rows.set(rowName, [...(rows.get(rowName) ?? []), space]);
  }
  return [...rows.values()];
}

export function SpacesPage() {
  const { data: spaces, isPending, isError, refetch } = useSpaces();
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);
  const [bookingSpaceId, setBookingSpaceId] = useState<string | null>(null);
  const findVacant = (id: string | null) => spaces?.find((s) => s.id === id && s.status === "vacant") ?? null;
  const selectSpace = (space: Space) => setSelectedSpaceId(space.id);
  if (selectedSpaceId && !findVacant(selectedSpaceId)) {
    setSelectedSpaceId(null);
  }
  if (bookingSpaceId && !findVacant(bookingSpaceId)) {
    setBookingSpaceId(null);
  }

  let content;
  if (spaces) {
    const [topRow = [], ...otherRows] = groupIntoRows(spaces);
    content = (
      <div className="flex flex-col gap-4">
        <div className="flex justify-center gap-4">
          {topRow.map((space) => (
            <SpaceTile key={space.id} space={space} onSelect={selectSpace} />
          ))}
        </div>
        <div className="flex h-16 items-center justify-center border-y-2 border-dashed border-gray-300 text-gray-400">
          Driveway
        </div>
        {otherRows.map((row) => (
          <div key={row[0]!.id} className="flex justify-center gap-4">
            {row.map((space) => (
              <SpaceTile key={space.id} space={space} onSelect={selectSpace} />
            ))}
          </div>
        ))}
      </div>
    );
  } else if (isPending) {
    content = <CircularProgress aria-label="Loading spaces" />;
  } else if (isError) {
    content = (
      <div className="flex flex-col items-center gap-4 text-center">
        <Typography color="error">An error occurred when loading spaces.</Typography>
        <Button variant="contained" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      <Typography variant="h4" component="h1">
        Parking lot
      </Typography>
      <section
        aria-label="Parking lot diagram"
        className="flex min-h-96 items-center justify-center rounded-lg border-2 border-gray-400 p-6"
      >
        {content}
      </section>

      <SpaceDetailsDialog
        space={findVacant(selectedSpaceId)}
        onClose={() => setSelectedSpaceId(null)}
        onBook={(space) => {
          setSelectedSpaceId(null);
          setBookingSpaceId(space.id);
        }}
      />
      <BookSpaceDialog space={findVacant(bookingSpaceId)} onClose={() => setBookingSpaceId(null)} />
    </main>
  );
}
