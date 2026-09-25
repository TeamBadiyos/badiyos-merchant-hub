import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/delivery")({
  ssr: false,
  component: () => <Outlet />,
});
