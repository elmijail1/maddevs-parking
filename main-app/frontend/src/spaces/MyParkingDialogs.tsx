import { formatLotTime, type MyParking } from "@parking/shared";
import { Alert, Button } from "@mui/material";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiRequestError } from "../api-request";
import { cancelBooking, myParkingsQueryKey } from "./api";
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
