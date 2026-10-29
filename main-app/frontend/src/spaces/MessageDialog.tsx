import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";
import type { ReactNode } from "react";

export function MessageDialog({
  title,
  children,
  onClose,
  actions,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
}) {
  return (
    <Dialog open onClose={onClose}>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <DialogContentText>{children}</DialogContentText>
      </DialogContent>
      <DialogActions>
        {actions ?? (
          <Button variant="contained" onClick={onClose}>
            OK
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
