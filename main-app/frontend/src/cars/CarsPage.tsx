import { carDisplayNameMaxLength, formatLotDate, updateCarRequestSchema, type Car } from "@parking/shared";
import {
  Backdrop,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import { useInfiniteQuery, useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { InfiniteListFooter } from "../components/InfiniteListFooter";
import { StickyTitle } from "../components/StickyTitle";
import { collectErrors } from "../forms";
import { AddCarDialog } from "./AddCarDialog";
import { carsQueryKey, changeCachedCars, fetchCars, removeCar, renameCar } from "./api";

const carChangeMutationKey = ["changeCar"];

function useCarChange<T, R>(
  mutationFn: (variables: T) => Promise<R>,
  updateCars: (cars: Car[], result: R, variables: T) => Car[],
  onSuccess: () => void,
  onFailed: () => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: carChangeMutationKey,
    mutationFn,
    onSuccess: (result, variables) => {
      changeCachedCars(queryClient, (cars) => updateCars(cars, result, variables));
      onSuccess();
    },
    onError: onFailed,
  });
}

function NameEditor({ car, onDone, onFailed }: { car: Car; onDone: () => void; onFailed: () => void }) {
  const [displayName, setDisplayName] = useState(car.displayName);
  const [error, setError] = useState<string | null>(null);
  const mutation = useCarChange(
    renameCar,
    (cars, renamed) => cars.map((current) => (current.id === renamed.id ? renamed : current)),
    onDone,
    onFailed,
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const result = updateCarRequestSchema.safeParse({ displayName });
    if (!result.success) {
      setError(collectErrors(result.error).displayName ?? null);
      return;
    }
    mutation.mutate({ id: car.id, displayName: result.data.displayName });
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-label={`Edit ${car.regNumber}`} className="flex flex-col gap-2">
      <TextField
        id={`car-name-${car.id}`}
        label="Display name"
        slotProps={{ htmlInput: { maxLength: carDisplayNameMaxLength } }}
        value={displayName}
        onChange={(event) => {
          setDisplayName(event.target.value);
          setError(null);
        }}
        error={Boolean(error)}
        helperText={error ?? " "}
        autoFocus
        fullWidth
      />
      <div className="flex gap-2">
        <Button type="submit" variant="contained">
          Save
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

function CarCard({
  car,
  editing,
  locked,
  onEdit,
  onDelete,
  onDone,
  onFailed,
}: {
  car: Car;
  editing: boolean;
  locked: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onDone: () => void;
  onFailed: () => void;
}) {
  return (
    <Paper component="li" aria-label={car.regNumber} className="flex flex-col gap-3 p-6">
      {editing ? (
        <NameEditor car={car} onDone={onDone} onFailed={onFailed} />
      ) : (
        <Typography variant="h6" component="h2" className="break-all">
          {car.displayName}
        </Typography>
      )}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Typography>{car.regNumber}</Typography>
          <Typography variant="body2" color="text.secondary">
            Added {formatLotDate(car.addedAt)}
          </Typography>
        </div>
        {!editing && (
          <div className="flex gap-2">
            <Button variant="outlined" aria-label={`Edit ${car.regNumber}`} disabled={locked} onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="outlined"
              color="error"
              aria-label={`Delete ${car.regNumber}`}
              disabled={locked}
              onClick={onDelete}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
    </Paper>
  );
}

function RemoveCarDialog({ car, onClose, onFailed }: { car: Car | null; onClose: () => void; onFailed: () => void }) {
  const mutation = useCarChange(
    removeCar,
    (cars, _, id) => cars.filter((current) => current.id !== id),
    onClose,
    () => {
      onClose();
      onFailed();
    },
  );
  return (
    <Dialog open={car !== null} onClose={mutation.isPending ? undefined : onClose}>
      {car && (
        <>
          <DialogTitle>Remove {car.regNumber} from your cars?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              To add it again later, you'll need its VIN and registration certificate number.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={mutation.isPending}>
              Cancel
            </Button>
            <Button
              color="error"
              variant="contained"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate(car.id)}
            >
              Remove
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}

export function CarsPage() {
  const carsQuery = useInfiniteQuery({
    queryKey: carsQueryKey,
    queryFn: ({ pageParam }) => fetchCars(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const { isPending, isError, isFetching, refetch } = carsQuery;
  const cars = carsQuery.data?.pages.flatMap((page) => page.cars);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Car | null>(null);
  const [failed, setFailed] = useState(false);
  const saving = useIsMutating({ mutationKey: carChangeMutationKey }) > 0;

  async function reload() {
    setEditingId(null);
    await refetch();
    setFailed(false);
  }

  let content;
  if (failed) {
    content = (
      <div className="flex flex-col items-center gap-4 text-center">
        <Typography color="error">Your changes couldn't be saved. Please reload the page.</Typography>
        <Button variant="contained" onClick={() => void reload()} disabled={isFetching}>
          Reload
        </Button>
      </div>
    );
  } else if (cars) {
    content = (
      <>
        <ul aria-label="Your cars" className="flex flex-col gap-4">
          {cars.map((car) => (
            <CarCard
              key={car.id}
              car={car}
              editing={editingId === car.id}
              locked={editingId !== null}
              onEdit={() => setEditingId(car.id)}
              onDelete={() => setRemoving(car)}
              onDone={() => setEditingId(null)}
              onFailed={() => setFailed(true)}
            />
          ))}
        </ul>
        <InfiniteListFooter
          hasNextPage={carsQuery.hasNextPage}
          isFetchingNextPage={carsQuery.isFetchingNextPage}
          isFetchNextPageError={carsQuery.isFetchNextPageError}
          fetchNextPage={carsQuery.fetchNextPage}
          loadedPages={carsQuery.data?.pages.length ?? 0}
          endText="That's all your cars."
        />
      </>
    );
  } else if (isPending) {
    content = <CircularProgress aria-label="Loading cars" className="self-center" />;
  } else if (isError) {
    content = (
      <div className="flex flex-col items-center gap-4 text-center">
        <Typography color="error">An error occurred when loading your cars.</Typography>
        <Button variant="contained" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-8 pb-8">
      <StickyTitle
        action={
          <Button variant="contained" disabled={editingId !== null || !cars || failed} onClick={() => setAdding(true)}>
            Add car
          </Button>
        }
      >
        My Cars
      </StickyTitle>
      {content}

      <AddCarDialog open={adding} onClose={() => setAdding(false)} onAdded={() => setAdding(false)} />
      <RemoveCarDialog car={removing} onClose={() => setRemoving(null)} onFailed={() => setFailed(true)} />
      <Backdrop open={saving} sx={{ zIndex: (theme) => theme.zIndex.modal + 1 }}>
        <CircularProgress aria-label="Saving" />
      </Backdrop>
    </main>
  );
}
