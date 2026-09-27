import { useCallback } from "react";

import { friendlyErrorMessage } from "./friendly-error";
import { useI18n } from "./i18n";

/** Returns a translator that turns any thrown error into a plain sentence. */
export function useFriendlyError() {
  const { lang } = useI18n();
  return useCallback((err: unknown) => friendlyErrorMessage(err, lang), [lang]);
}
