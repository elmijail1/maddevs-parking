import { AppBar, Button, Toolbar, Typography } from "@mui/material";
import { Link, Outlet, useMatch } from "react-router";

const links = [
  { to: "/spaces", label: "Parking Diagram" },
  { to: "/profile", label: "My Profile" },
];

function NavButton({ to, label }: { to: string; label: string }) {
  const active = Boolean(useMatch(to));
  return (
    <Button
      component={Link}
      to={to}
      color="inherit"
      aria-current={active ? "page" : undefined}
      className={active ? "bg-white/20" : undefined}
    >
      {label}
    </Button>
  );
}

export function AppLayout() {
  return (
    <>
      <AppBar position="static">
        <Toolbar className="gap-2">
          <Typography variant="h6" component="span" className="mr-4">
            Parking
          </Typography>
          <nav aria-label="Main" className="flex gap-2">
            {links.map((link) => (
              <NavButton key={link.to} {...link} />
            ))}
          </nav>
        </Toolbar>
      </AppBar>
      <Outlet />
    </>
  );
}
