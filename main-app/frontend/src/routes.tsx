import { Navigate, type RouteObject } from "react-router";
import { AppLayout } from "./AppLayout";
import { AppRoot } from "./AppRoot";
import { AuthenticatePage } from "./auth/AuthenticatePage";
import { authenticatePath, GuestOnly, RequireAuth } from "./auth/route-guards";
import { CarsPage } from "./cars/CarsPage";
import { HistoryPage } from "./history/HistoryPage";
import { ProfilePage } from "./profile/ProfilePage";
import { SpacesPage } from "./spaces/SpacesPage";

export const routes: RouteObject[] = [
  {
    element: <AppRoot />,
    children: [
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
              { path: "/cars", element: <CarsPage /> },
              { path: "/history", element: <HistoryPage /> },
              { path: "/profile", element: <ProfilePage /> },
            ],
          },
        ],
      },
    ],
  },
];
