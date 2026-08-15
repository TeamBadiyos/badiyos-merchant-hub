import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { useAuth } from "./auth";

/**
 * Guards a merchant screen: redirects to login when signed out and back to
 * onboarding while the application is still a draft.
 */
export function useRequireAuth({ allowDraft = false }: { allowDraft?: boolean } = {}) {
  const { userId, merchant, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    if (!userId) {
      void navigate({ to: "/login", replace: true });
      return;
    }
    if (!allowDraft && merchant?.status === "draft") {
      void navigate({ to: "/onboarding", replace: true });
    }
  }, [ready, userId, merchant?.status, allowDraft, navigate]);

  if (!ready || !userId) return null;
  if (!allowDraft && merchant?.status === "draft") return null;
  return merchant;
}
