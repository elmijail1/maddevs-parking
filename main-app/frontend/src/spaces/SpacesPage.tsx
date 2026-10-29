import { bookingExpirationMinutes, formatLotTime, type Booking, type MyParking, type Space } from "@parking/shared";
import { Button, CircularProgress, Typography } from "@mui/material";
import { useIsMutating } from "@tanstack/react-query";
import { useState } from "react";
import { bookSpaceMutationKey, ChooseCarDialog } from "./ChooseCarDialog";
import { MessageDialog } from "./MessageDialog";
import { SpaceDetailsDialog } from "./SpaceDetailsDialog";
import { SpaceTile } from "./SpaceTile";
import { useMyParkings, useSpaces } from "./use-spaces";

type DialogState =
  | { kind: "details"; spaceId: string }
  | { kind: "chooseCar"; spaceId: string }
  | { kind: "booked"; booking: Booking }
  | { kind: "unavailable" }
  | { kind: "mine"; parkingId: string }
  | null;

function groupIntoRows(spaces: Space[]) {
  const rows = new Map<string, Space[]>();
  for (const space of spaces) {
    const rowName = space.displayName.charAt(0);
    rows.set(rowName, [...(rows.get(rowName) ?? []), space]);
  }
  return [...rows.values()];
}

function MyParkingDialog({ parking, onClose }: { parking: MyParking; onClose: () => void }) {
  if (parking.status === "active") {
    return (
      <MessageDialog title={parking.spaceName} onClose={onClose} actions={<Button onClick={onClose}>Close</Button>}>
        {parking.regNumber} is parked here since {formatLotTime(parking.activeSince)}.
      </MessageDialog>
    );
  }
  return (
    <MessageDialog
      title={parking.spaceName}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button color="error" variant="outlined" disabled>
            Cancel booking
          </Button>
        </>
      }
    >
      This space is booked for {parking.regNumber}. The booking expires at {formatLotTime(parking.expiresAt)}.
    </MessageDialog>
  );
}

export function SpacesPage() {
  const { data: spaces, isPending, isError, refetch } = useSpaces();
  const { data: myParkings } = useMyParkings();
  const [dialog, setDialog] = useState<DialogState>(null);
  const booking = useIsMutating({ mutationKey: bookSpaceMutationKey }) > 0;

  const myParkingBySpace = new Map(myParkings?.map((parking) => [parking.spaceId, parking]));
  const findSpace = (id: string) => spaces?.find((space) => space.id === id);
  const dialogSpace = dialog && "spaceId" in dialog ? findSpace(dialog.spaceId) : undefined;
  const dialogParking =
    dialog?.kind === "mine" ? myParkings?.find((parking) => parking.parkingId === dialog.parkingId) : undefined;

  if (dialog?.kind === "details" && dialogSpace?.status !== "vacant") {
    setDialog(null);
  } else if (dialog?.kind === "chooseCar" && dialogSpace?.status !== "vacant" && !booking) {
    setDialog({ kind: "unavailable" });
  } else if (dialog?.kind === "mine" && myParkings && !dialogParking) {
    setDialog(null);
  }

  const close = () => setDialog(null);
  const tile = (space: Space) => (
    <SpaceTile
      key={space.id}
      space={space}
      myParking={myParkingBySpace.get(space.id)}
      onSelect={(selected) => setDialog({ kind: "details", spaceId: selected.id })}
      onSelectMine={(parking) => setDialog({ kind: "mine", parkingId: parking.parkingId })}
    />
  );

  let content;
  if (spaces) {
    const [topRow = [], ...otherRows] = groupIntoRows(spaces);
    content = (
      <div className="flex flex-col gap-4">
        <div className="flex justify-center gap-4">{topRow.map(tile)}</div>
        <div className="flex h-16 items-center justify-center border-y-2 border-dashed border-gray-300 text-gray-400">
          Driveway
        </div>
        {otherRows.map((row) => (
          <div key={row[0]!.id} className="flex justify-center gap-4">
            {row.map(tile)}
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
        space={dialog?.kind === "details" ? (dialogSpace ?? null) : null}
        onClose={close}
        onBook={(space) => setDialog({ kind: "chooseCar", spaceId: space.id })}
      />
      {dialog?.kind === "chooseCar" && dialogSpace && (
        <ChooseCarDialog
          space={dialogSpace}
          onBack={() => setDialog({ kind: "details", spaceId: dialogSpace.id })}
          onClose={close}
          onBooked={(result) => setDialog({ kind: "booked", booking: result })}
          onUnavailable={() => setDialog({ kind: "unavailable" })}
        />
      )}
      {dialog?.kind === "booked" && (
        <MessageDialog title="Space booked" onClose={close}>
          You've just booked space {dialog.booking.spaceName} for {dialog.booking.regNumber}! Please enter the parking
          lot within {bookingExpirationMinutes} minutes before your booking expires.
        </MessageDialog>
      )}
      {dialog?.kind === "unavailable" && (
        <MessageDialog title="Space unavailable" onClose={close}>
          This space is unavailable, please try another.
        </MessageDialog>
      )}
      {dialogParking && <MyParkingDialog parking={dialogParking} onClose={close} />}
    </main>
  );
}
