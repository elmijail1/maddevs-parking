import { Outlet } from "react-router";
import { AuthSyncProvider } from "./auth/auth-sync";

export function AppRoot() {
  return (
    <AuthSyncProvider>
      <Outlet />
    </AuthSyncProvider>
  );
}
