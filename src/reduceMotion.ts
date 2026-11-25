import { useState } from "react";
import { useSettingsSync } from "./hooks/useSettingsSync";

/** Settings › General › Reduce Motion (`bloom-reduce-motion`, off by default),
 *  the one place that decides it for every window: springs become a short ease,
 *  nothing bounces, delayed arrivals come at once. It does not follow Windows'
 *  "Animation effects" (the user's rule, 2026-11-25); CSS follows the
 *  `reduce-motion` class that theme.ts puts on the root. */
export function useReduceMotion(): boolean {
	const [on, setOn] = useState(() => localStorage.getItem("bloom-reduce-motion") === "true");
	useSettingsSync({ "bloom-reduce-motion": (v) => setOn(v === true || v === "true") });
	return on;
}
