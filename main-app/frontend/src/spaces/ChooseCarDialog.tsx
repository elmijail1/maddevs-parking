import type { Booking, Space } from "@parking/shared";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Typography,
} from "@mui/material";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ApiRequestError } from "../api-request";
import { AddCarDialog } from "../cars/AddCarDialog";
import { allCarsQueryKey, fetchAllCars } from "../cars/api";
import { bookSpace, myParkingsQueryKey } from "./api";
import { useMyParkings } from "./use-spaces";

export const bookSpaceMutationKey = ["bookSpace"];

export function ChooseCarDialog({
  space,
  onBack,
  onClose,
  onBooked,
  onUnavailable,
}: {
  space: Space;
  onBack: () => void;
  onClose: () => void;
  onBooked: (booking: Booking) => void;
  onUnavailable: () => void;
}) {
  const queryClient = useQueryClient();
  const cars = useQuery({ queryKey: allCarsQueryKey, queryFn: fetchAllCars });
  const myParkings = useMyParkings();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingCar, setAddingCar] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = new Set(myParkings.data?.map((parking) => parking.regNumber));
  const availableCars = cars.data?.filter((car) => !busy.has(car.regNumber));
  const selected = availableCars?.find((car) => car.id === selectedId);

  const booking = useMutation({
    mutationKey: bookSpaceMutationKey,
    mutationFn: bookSpace,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: myParkingsQueryKey });
      onBooked(result);
    },
    onError: (failure) => {
      const code = failure instanceof ApiRequestError ? failure.code : "unknown";
      if (code === "space_unavailable") {
        onUnavailable();
        return;
      }
      setSelectedId(null);
      if (code === "vehicle_busy") {
        setError(`${selected?.regNumber ?? "This car"} already has a booking or is in the lot.`);
        void queryClient.invalidateQueries({ queryKey: myParkingsQueryKey });
      } else if (code === "car_not_found") {
        setError("This car is no longer in your list.");
        void queryClient.invalidateQueries({ queryKey: allCarsQueryKey });
      } else {
        setError("Something went wrong. Please try again.");
      }
    },
  });

  let content;
  if (availableCars) {
    content =
      availableCars.length > 0 ? (
        <RadioGroup
          aria-label="Your cars"
          className="max-h-40 w-full flex-nowrap overflow-y-auto rounded border border-gray-200 px-3"
          value={selected?.id ?? ""}
          onChange={(event) => {
            setSelectedId(event.target.value);
            setError(null);
          }}
        >
          {availableCars.map((car) => (
            <FormControlLabel
              key={car.id}
              value={car.id}
              control={<Radio />}
              label={`${car.displayName} (${car.regNumber})`}
            />
          ))}
        </RadioGroup>
      ) : (
        <Typography color="text.secondary">
          {cars.data?.length ? "All your cars already have a booking or are in the lot." : "You don't have any cars yet."}
        </Typography>
      );
  } else if (cars.isError || myParkings.isError) {
    content = (
      <div className="flex flex-col items-start gap-2">
        <Typography color="error">Your cars couldn't be loaded.</Typography>
        <Button
          onClick={() => {
            void cars.refetch();
            void myParkings.refetch();
          }}
        >
          Try again
        </Button>
      </div>
    );
  } else {
    content = <CircularProgress aria-label="Loading your cars" />;
  }

  return (
    <>
      <Dialog open onClose={booking.isPending ? undefined : onClose} fullWidth maxWidth="xs">
        <DialogTitle>Book {space.displayName}</DialogTitle>
        <DialogContent className="flex flex-col items-start gap-3">
          <Typography>Choose a car</Typography>
          {content}
          <Button variant="outlined" disabled={booking.isPending} onClick={() => setAddingCar(true)}>
            Add new car
          </Button>
          {error && (
            <Alert severity="error" className="self-stretch">
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onBack} disabled={booking.isPending}>
            Back
          </Button>
          <Button
            variant="contained"
            disabled={!selected || booking.isPending}
            onClick={() => selected && booking.mutate({ spaceId: space.id, carId: selected.id })}
          >
            {selected ? `Book for ${selected.regNumber}` : "Book"}
          </Button>
        </DialogActions>
      </Dialog>
      <AddCarDialog
        open={addingCar}
        onClose={() => setAddingCar(false)}
        onAdded={(car) => {
          setAddingCar(false);
          setSelectedId(car.id);
          setError(null);
        }}
      />
    </>
  );
}
