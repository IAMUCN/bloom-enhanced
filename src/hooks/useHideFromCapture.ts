import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Each module's "Hide From Recordings" (`bloom-<module>-hide-from-capture`):
 *  on = Windows leaves this window out of recordings, shares and screenshots
 *  (it can't tell them apart). Unset = the module's default. */
export const hidesFromCapture = (key: string, byDefault: boolean) => {
	const v = localStorage.getItem(key);
	return v === null ? byDefault : v === "true";
};

/** Applies the setting to the window this page runs in, now and on change. */
export function useHideFromCapture(key: string, byDefault: boolean, enabled = true) {
	useEffect(() => {
		if (!enabled) return;
		const apply = (excluded: boolean) => invoke("set_capture_excluded", { excluded }).catch(() => {});
		apply(hidesFromCapture(key, byDefault));
		const off = listen<{ key?: string; value?: unknown }>("settings-changed", (e) => {
			if (e.payload?.key === key) apply(String(e.payload.value) === "true");
		});
		return () => void off.then((f) => f());
	}, [key, byDefault, enabled]);
}
