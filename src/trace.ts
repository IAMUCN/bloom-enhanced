import { invoke } from "@tauri-apps/api/core";

/** Dev builds only: one timestamped line in diagnostics.log (next to the Rust
 *  side's own `t.*` lines) for a moment that could matter to a visual glitch.
 *  Does nothing in a release build. */
export function trace(event: string, detail: unknown = "") {
	if (!import.meta.env.DEV) return;
	invoke("trace_event", { event, detail: typeof detail === "string" ? detail : JSON.stringify(detail) }).catch(() => {});
}
