import { Navigate, type RouteObject } from "react-router";
import { SpacesPage } from "./spaces/SpacesPage";

export const routes: RouteObject[] = [
  { path: "/", element: <Navigate to="/spaces" replace /> },
  { path: "/spaces", element: <SpacesPage /> },
];
