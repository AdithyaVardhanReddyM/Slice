"use client";

import { useOptimistic, useTransition } from "react";
import { setSampleData } from "@/app/(app)/dashboard/concierge/actions";
import { Switch } from "@/components/ui/switch";

/**
 * Sample data on or off for the whole Concierge console: Overview,
 * Conversations and Taste insights. Off shows the widget's own shoppers.
 */
export function SampleSwitch({ on }: { on: boolean }) {
  const [pending, start] = useTransition();
  const [checked, setChecked] = useOptimistic(on);
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-neutral-700">
      <Switch
        checked={checked}
        disabled={pending}
        onCheckedChange={(next) =>
          start(async () => {
            setChecked(next);
            await setSampleData(next);
          })
        }
      />
      Sample data
    </label>
  );
}
