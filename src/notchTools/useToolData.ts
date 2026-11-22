import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

/** A tool's saved data (backend tool_data.rs: one JSON file per tool). Loads
 *  once, then saves shortly after each change. `ready` is false until the
 *  saved copy has been read, so a first render can't overwrite it. */
export function useToolData<T>(tool: string, initial: T): [T, (next: T | ((prev: T) => T)) => void, boolean] {
	const [data, setData] = useState<T>(initial);
	const [ready, setReady] = useState(false);
	const timer = useRef<number | null>(null);
	useEffect(() => {
		invoke<string | null>("tool_data_get", { tool })
			.then((text) => {
				if (text) {
					try {
						setData({ ...initial, ...JSON.parse(text) });
					} catch {
						// A damaged file starts over rather than breaking the tool.
					}
				}
			})
			.catch(() => {})
			.finally(() => setReady(true));
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [tool]);
	const update = (next: T | ((prev: T) => T)) => {
		setData((prev) => {
			const value = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
			if (timer.current !== null) window.clearTimeout(timer.current);
			timer.current = window.setTimeout(() => {
				invoke("tool_data_set", { tool, json: JSON.stringify(value) }).catch(() => {});
			}, 400);
			return value;
		});
	};
	return [data, update, ready];
}

/** Copies text; true when it worked. */
export async function copyText(text: string) {
	try {
		// Tauri's clipboard: the browser one refuses while the notch has no
		// focus, which is most of the time (Fable's tool review, 2026-11-15).
		await writeText(text);
		return true;
	} catch {
		return false;
	}
}
