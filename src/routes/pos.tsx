import { createFileRoute, redirect } from "@tanstack/react-router";

/** Billing (POS) was removed in the redesign; old sales stay in the database. */
export const Route = createFileRoute("/pos")({
  beforeLoad: () => {
    throw redirect({ to: "/home", replace: true });
  },
});
