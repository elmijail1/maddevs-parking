import { Navigate, type RouteObject } from "react-router";
import { AuthenticatePage } from "./auth/AuthenticatePage";
import { authenticatePath, GuestOnly, RequireAuth } from "./auth/route-guards";
import { SpacesPage } from "./spaces/SpacesPage";

export const routes: RouteObject[] = [
  {
    element: <GuestOnly />,
    children: [{ path: authenticatePath, element: <AuthenticatePage /> }],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: "/", element: <Navigate to="/spaces" replace /> },
      { path: "/spaces", element: <SpacesPage /> },
    ],
  },
];
