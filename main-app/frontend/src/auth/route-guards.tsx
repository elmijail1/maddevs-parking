import type { AuthUser } from "@parking/shared";
import { Button, CircularProgress, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { Navigate, Outlet } from "react-router";
import { useCurrentUser } from "./use-current-user";

export const authenticatePath = "/authenticate";
const defaultPath = "/spaces";

function UserCheck({ children }: { children: (user: AuthUser | null) => ReactNode }) {
  const { data: user, isPending, isError, refetch } = useCurrentUser();
  if (user !== undefined) {
    return children(user);
  }
  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <CircularProgress aria-label="Checking your session" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <Typography color="error">An error occurred when checking your session.</Typography>
        <Button variant="contained" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  return null;
}

export function RequireAuth() {
  return <UserCheck>{(user) => (user ? <Outlet /> : <Navigate to={authenticatePath} replace />)}</UserCheck>;
}

export function GuestOnly() {
  return <UserCheck>{(user) => (user ? <Navigate to={defaultPath} replace /> : <Outlet />)}</UserCheck>;
}
