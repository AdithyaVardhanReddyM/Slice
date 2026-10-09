"use client";

import { useState } from "react";
import { Segmented } from "../form";

// Visual only until metrics come from Convex; 30 days is what the mock series holds.
export function RangePicker() {
  const [range, setRange] = useState<"7d" | "30d" | "90d">("30d");
  return (
    <Segmented
      value={range}
      onChange={setRange}
      options={[
        { value: "7d", label: "Last 7 days" },
        { value: "30d", label: "Last 30 days" },
        { value: "90d", label: "Last 90 days" },
      ]}
    />
  );
}
