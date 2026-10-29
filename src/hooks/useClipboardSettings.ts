import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsSync } from "./useSettingsSync";
import { asThumbSize, type ThumbSize } from "../clipboardModel";

/** The clipboard options a panel needs, kept in sync with Settings. Every
 *  optional feature defaults to on; Settings › Clipboard turns each off. */
export interface ClipboardOptions {
	thumbSize: ThumbSize;
	linkPreviews: boolean;
	notes: boolean;
	multiSelect: boolean;
	sounds: boolean;
	richText: boolean;
	copyIndicator: boolean;
	/** Monitor name for the edge shelf; empty = primary. */
	monitor: string;
	/** A wider Clipboard panel in the notch (off by default). */
	notchWide: boolean;
}

const on = (v: unknown) => v !== false && v !== "false";

export function useClipboardSettings(): ClipboardOptions {
	const [options, setOptions] = useState<ClipboardOptions>(() => ({
		thumbSize: asThumbSize(localStorage.getItem("bloom-clipboard-thumb-size")),
		linkPreviews: on(localStorage.getItem("bloom-clipboard-link-previews")),
		notes: on(localStorage.getItem("bloom-clipboard-notes")),
		multiSelect: on(localStorage.getItem("bloom-clipboard-multi-select")),
		sounds: on(localStorage.getItem("bloom-clipboard-sounds")),
		richText: on(localStorage.getItem("bloom-clipboard-rich-text")),
		copyIndicator: on(localStorage.getItem("bloom-clipboard-copy-indicator")),
		monitor: localStorage.getItem("bloom-clipboard-monitor") ?? "",
		notchWide: localStorage.getItem("bloom-clipboard-notch-wide") === "true"
	}));
	const set = (patch: Partial<ClipboardOptions>) => setOptions((o) => ({ ...o, ...patch }));

	useEffect(() => {
		invoke<Record<string, string>>("load_settings")
			.then((s) =>
				set({
					thumbSize: asThumbSize(s["bloom-clipboard-thumb-size"]),
					linkPreviews: on(s["bloom-clipboard-link-previews"]),
					notes: on(s["bloom-clipboard-notes"]),
					multiSelect: on(s["bloom-clipboard-multi-select"]),
					sounds: on(s["bloom-clipboard-sounds"]),
					richText: on(s["bloom-clipboard-rich-text"]),
					copyIndicator: on(s["bloom-clipboard-copy-indicator"]),
					monitor: s["bloom-clipboard-monitor"] ?? "",
					notchWide: s["bloom-clipboard-notch-wide"] === "true"
				})
			)
			.catch(() => {});
	}, []);
	useSettingsSync({
		"bloom-clipboard-thumb-size": (v) => set({ thumbSize: asThumbSize(v) }),
		"bloom-clipboard-link-previews": (v) => set({ linkPreviews: on(v) }),
		"bloom-clipboard-notes": (v) => set({ notes: on(v) }),
		"bloom-clipboard-multi-select": (v) => set({ multiSelect: on(v) }),
		"bloom-clipboard-sounds": (v) => set({ sounds: on(v) }),
		"bloom-clipboard-rich-text": (v) => set({ richText: on(v) }),
		"bloom-clipboard-copy-indicator": (v) => set({ copyIndicator: on(v) }),
		"bloom-clipboard-monitor": (v) => set({ monitor: String(v ?? "") }),
		"bloom-clipboard-notch-wide": (v) => set({ notchWide: v === true || v === "true" })
	});
	return options;
}
