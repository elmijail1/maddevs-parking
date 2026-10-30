import { formatCents, formatDuration, formatLotTime, type MyParking } from "@parking/shared";
import { Alert, Button, CircularProgress } from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiRequestError } from "../api-request";
import { cancelBooking, myParkingsQueryKey, refreshParking } from "./api";
import { MessageDialog } from "./MessageDialog";

export const cancelBookingMutationKey = ["cancelBooking"];

export function MyParkingDialog({
  parking,
  onClose,
  onCancel,
}: {
  parking: MyParking;
  onClose: () => void;
  onCancel: () => void;
}) {
  if (parking.status === "active") {
    return <ParkingTotalsDialog parking={parking} onClose={onClose} />;
  }
  return (
    <MessageDialog
      title={parking.spaceName}
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button color="error" variant="outlined" onClick={onCancel}>
            Cancel booking
          </Button>
        </>
      }
    >
      This space is booked for {parking.regNumber}. The booking expires at {formatLotTime(parking.expiresAt)}.
    </MessageDialog>
  );
}

function ParkingTotalsDialog({ parking, onClose }: { parking: MyParking; onClose: () => void }) {
  const totals = useQuery({
    queryKey: ["parkingTotals", parking.parkingId],
    queryFn: () => refreshParking(parking.parkingId),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  let content;
  if (totals.data) {
    const { activeSince, chargedMinutes, total, currentRate, ratePerHourCents, nextRate, nextRateFrom } = totals.data;
    content = (
      <>
        <span className="block">
          {parking.regNumber} has been parked here since {formatLotTime(activeSince)}.
        </span>
        <span className="block">Time counted: {formatDuration(chargedMinutes)}</span>
        <span className="block font-semibold">Total so far: {formatCents(total)}</span>
        <span className="block">
          Current rate: {currentRate}, {formatCents(ratePerHourCents)} per hour ({nextRate} rate from{" "}
          {formatLotTime(nextRateFrom)})
        </span>
      </>
    );
  } else if (totals.isError) {
    const gone = totals.error instanceof ApiRequestError && totals.error.code === "parking_not_active";
    content = gone ? (
      "This car is no longer in the lot."
    ) : (
      <span className="flex flex-col items-start gap-2">
        <span>The total couldn't be calculated.</span>
        <Button onClick={() => void totals.refetch()}>Try again</Button>
      </span>
    );
  } else {
    content = <CircularProgress aria-label="Calculating the total" />;
  }

  return (
    <MessageDialog title={parking.spaceName} onClose={onClose} actions={<Button onClick={onClose}>Close</Button>}>
      {content}
    </MessageDialog>
  );
}

export function ConfirmCancelDialog({
  parking,
  onKeep,
  onCancelled,
  onNotCancellable,
}: {
  parking: MyParking;
  onKeep: () => void;
  onCancelled: () => void;
  onNotCancellable: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationKey: cancelBookingMutationKey,
    mutationFn: cancelBooking,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: myParkingsQueryKey });
      onCancelled();
    },
    onError: (failure) => {
      const code = failure instanceof ApiRequestError ? failure.code : "unknown";
      if (code === "booking_not_active" || code === "not_found") {
        void queryClient.invalidateQueries({ queryKey: myParkingsQueryKey });
        onNotCancellable();
      } else {
        setError("Something went wrong. Please try again.");
      }
    },
  });

  return (
    <MessageDialog
      title={`Cancel the booking of ${parking.spaceName}?`}
      onClose={mutation.isPending ? () => {} : onKeep}
      actions={
        <>
          <Button onClick={onKeep} disabled={mutation.isPending}>
            Keep booking
          </Button>
          <Button
            color="error"
            variant="contained"
            disabled={mutation.isPending}
            onClick={() => {
              setError(null);
              mutation.mutate(parking.parkingId);
            }}
          >
            Cancel booking
          </Button>
        </>
      }
    >
      The space will be free for others to book, and {parking.regNumber} will need a new booking.
      {error && (
        <Alert severity="error" component="span" className="mt-3 flex">
          {error}
        </Alert>
      )}
    </MessageDialog>
  );
}
