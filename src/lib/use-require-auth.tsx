import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAuth } from "./auth";

/** Client-side placeholder guard until real auth is wired to the backend. */
export function useRequireAuth() {
  const { session, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && !session) navigate({ to: "/login", replace: true });
  }, [ready, session, navigate]);

  return session;
}