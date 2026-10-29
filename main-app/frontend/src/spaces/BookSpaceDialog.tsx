import { regNumberSchema, type Space } from "@parking/shared";
import { Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { useState } from "react";

const savedRegNumbers: string[] = [];

export function BookSpaceDialog({ space, onClose }: { space: Space | null; onClose: () => void }) {
  const [input, setInput] = useState("");
  const regNumber = regNumberSchema.safeParse(input);

  return (
    <Dialog open={space !== null} onClose={onClose} slotProps={{ transition: { onExited: () => setInput("") } }}>
      {space && (
        <>
          <DialogTitle>Book {space.displayName}</DialogTitle>
          <DialogContent>
            <Autocomplete
              freeSolo
              options={savedRegNumbers}
              inputValue={input}
              onInputChange={(_, value) => setInput(value)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  autoFocus
                  margin="dense"
                  label="Vehicle registration number"
                  error={input.trim() !== "" && !regNumber.success}
                  helperText={input.trim() !== "" && !regNumber.success ? "Use 1 to 15 characters" : " "}
                />
              )}
            />
          </DialogContent>
          <DialogActions>
            <Button variant="contained" disabled={!regNumber.success}>
              {regNumber.success ? `Book for ${regNumber.data}` : "Book"}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
