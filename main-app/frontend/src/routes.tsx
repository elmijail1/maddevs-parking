import { Navigate, type RouteObject } from "react-router";
import { AppLayout } from "./AppLayout";
import { AuthenticatePage } from "./auth/AuthenticatePage";
import { authenticatePath, GuestOnly, RequireAuth } from "./auth/route-guards";
import { ProfilePage } from "./profile/ProfilePage";
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
      {
        element: <AppLayout />,
        children: [
          { path: "/spaces", element: <SpacesPage /> },
          { path: "/profile", element: <ProfilePage /> },
        ],
      },
    ],
  },
];
