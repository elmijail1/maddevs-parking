import { Typography } from "@mui/material";
import type { ReactNode } from "react";

export function StickyTitle({ children, action }: { children: string; action?: ReactNode }) {
  return (
    <div
      data-testid="sticky-title"
      className="sticky top-14 z-10 -mx-8 flex items-center justify-between gap-4 bg-white px-8 py-3 sm:top-16"
    >
      <Typography variant="h4" component="h1">
        {children}
      </Typography>
      {action}
    </div>
  );
}
