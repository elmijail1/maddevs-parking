import { addCarRequestSchema, defaultCarDisplayName, type Car } from "@parking/shared";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, TextField } from "@mui/material";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ApiRequestError } from "../api-request";
import { collectErrors } from "../forms";
import { addCar, carsQueryKey } from "./api";

const fields = [
  { name: "regNumber", label: "Registration number" },
  { name: "vin", label: "VIN" },
  { name: "certificateNumber", label: "Registration certificate number" },
  { name: "displayName", label: "Display name" },
] as const;

type FieldName = (typeof fields)[number]["name"];

const addCarMutationKey = ["addCar"];

const serverErrorMessages: Record<string, string> = {
  vehicle_mismatch: "The VIN or certificate number doesn't match this car.",
  already_added: "This car is already in your list.",
};

function AddCarForm({ onClose, onAdded }: { onClose: () => void; onAdded: (car: Car) => void }) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<FieldName, string>>({
    regNumber: "",
    vin: "",
    certificateNumber: "",
    displayName: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationKey: addCarMutationKey,
    mutationFn: addCar,
    onSuccess: (car) => {
      queryClient.setQueryData<Car[]>(carsQueryKey, (cars) => cars && [car, ...cars]);
      onAdded(car);
    },
    onError: (error) => {
      const code = error instanceof ApiRequestError ? error.code : "unknown";
      setFormError(serverErrorMessages[code] ?? "Something went wrong. Please try again.");
    },
  });

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const { displayName, ...required } = values;
    const result = addCarRequestSchema.safeParse(displayName.trim() ? values : required);
    if (!result.success) {
      setErrors(collectErrors(result.error));
      return;
    }
    setErrors({});
    mutation.mutate(result.data);
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-label="Add a car">
      <DialogTitle className="pr-14">Add a car</DialogTitle>
      <IconButton
        aria-label="Close"
        onClick={onClose}
        disabled={mutation.isPending}
        className="absolute right-2 top-2"
      >
        ×
      </IconButton>
      <DialogContent className="flex flex-col gap-1">
        {fields.map((field) => (
          <TextField
            key={field.name}
            id={`add-car-${field.name}`}
            label={field.label}
            value={values[field.name]}
            onChange={(event) => {
              setValues((current) => ({ ...current, [field.name]: event.target.value }));
              setErrors(({ [field.name]: _, ...rest }) => rest);
            }}
            error={Boolean(errors[field.name])}
            helperText={
              errors[field.name] ??
              (field.name === "displayName" ? `Optional. If empty, it's "${defaultCarDisplayName}".` : " ")
            }
            required={field.name !== "displayName"}
            autoFocus={field.name === "regNumber"}
            margin="dense"
            fullWidth
          />
        ))}
        {formError && <Alert severity="error">{formError}</Alert>}
      </DialogContent>
      <DialogActions className="px-6 pb-4">
        <Button onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </form>
  );
}

export function AddCarDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: (car: Car) => void;
}) {
  const [formKey, setFormKey] = useState(0);
  const adding = useIsMutating({ mutationKey: addCarMutationKey }) > 0;
  return (
    <Dialog
      open={open}
      onClose={adding ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      slotProps={{ transition: { onExited: () => setFormKey((key) => key + 1) } }}
    >
      <AddCarForm key={formKey} onClose={onClose} onAdded={onAdded} />
    </Dialog>
  );
}
