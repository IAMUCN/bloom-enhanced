import { useState, type ReactNode } from "react";
import { MotionConfig } from "framer-motion";
import { useSettingsSync } from "./hooks/useSettingsSync";
import { useReduceMotion } from "./reduceMotion";

/** Settings › Appearance › Animations = Off also stills the springs in the
 *  dock, the edge Shelf and the radial menu (the notch has its own). */
export function MotionPref({ children }: { children: ReactNode }) {
	const [off, setOff] = useState(() => localStorage.getItem("bloom-motion") === "off");
	useSettingsSync({ "bloom-motion": (v) => setOff(v === "off") });
	const reduce = useReduceMotion();
	return <MotionConfig reducedMotion={off || reduce ? "always" : "never"}>{children}</MotionConfig>;
}
