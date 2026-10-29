import { dayHours, formatCents, getRatePerMinuteCents, type Space } from "@parking/shared";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";

const formatHour = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
const hourlyRate = (rate: "day" | "night") => `${formatCents(getRatePerMinuteCents(rate) * 60)} per hour`;

export function SpaceDetailsDialog({
  space,
  onClose,
  onBook,
}: {
  space: Space | null;
  onClose: () => void;
  onBook: (space: Space) => void;
}) {
  return (
    <Dialog open={space !== null} onClose={onClose}>
      {space && (
        <>
          <DialogTitle>{space.displayName}</DialogTitle>
          <DialogContent>
            <Typography>
              {formatHour(dayHours.startHour)}–{formatHour(dayHours.endHour)}: {hourlyRate("day")}
            </Typography>
            <Typography>
              {formatHour(dayHours.endHour)}–{formatHour(dayHours.startHour)}: {hourlyRate("night")}
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Close</Button>
            <Button variant="contained" onClick={() => onBook(space)}>
              Book this space
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
