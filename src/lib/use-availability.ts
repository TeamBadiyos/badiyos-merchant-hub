import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  availabilityFor,
  openStateFor,
  type ScheduleOverride,
  type StoreHour,
} from "@/lib/schedule";

async function fetchSchedule() {
  const [hours, overrides] = await Promise.all([
    supabase.from("merchant_store_hours").select("*"),
    supabase.from("merchant_schedule_overrides").select("*"),
  ]);
  if (hours.error) throw hours.error;
  if (overrides.error) throw overrides.error;
  return {
    hours: (hours.data ?? []) as StoreHour[],
    overrides: (overrides.data ?? []) as ScheduleOverride[],
  };
}

/**
 * Availability is derived, never stored: the manual `is_accepting_orders`
 * toggle AND the weekly schedule must both allow orders. Customer-facing
 * reads use `merchant_is_currently_open()` in the database, so both sides
 * agree without a cron job flipping the column.
 */
export function useAvailability() {
  const { merchant, refresh } = useAuth();
  const queryClient = useQueryClient();

  const schedule = useQuery({
    queryKey: ["schedule", merchant?.id],
    enabled: Boolean(merchant?.id),
    queryFn: fetchSchedule,
    refetchInterval: 60_000,
  });

  const openState = openStateFor(schedule.data?.hours, schedule.data?.overrides);
  const availability = availabilityFor(merchant, openState);

  const setAccepting = useMutation({
    mutationFn: async (accepting: boolean) => {
      const { error } = await supabase.rpc("merchant_set_accepting_orders", {
        _accepting: accepting,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["schedule"] });
    },
  });

  return {
    schedule,
    openState,
    availability,
    accepting: merchant?.is_accepting_orders === true,
    /** True when the schedule blocks orders regardless of the manual toggle. */
    scheduleBlocked: openState.kind === "closed" || openState.kind === "outside",
    setAccepting,
  };
}
