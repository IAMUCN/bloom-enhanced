import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Circle, Scissors } from "lucide-react";

/** Snip & record through Windows' own Snipping Tool. Its bar picks the shape
 *  (region, window, full screen, freeform); the notch is kept out of the
 *  shot. Snips land on the clipboard, so the Shelf keeps them. */
export default function Snip() {
	const [error, setError] = useState("");
	const go = (mode: string) => invoke("screen_clip", { mode }).then(() => setError("")).catch((e) => setError(String(e)));
	return (
		<div style={{ ["--tool-color" as string]: "#FF7AB8", display: "contents" }}>
			<div className="nt-row" style={{ justifyContent: "center", gap: 12 }}>
				<button type="button" className="nt-btn primary cap-big" onClick={() => go("snip")}>
					<Scissors size={16} /> Snip
				</button>
				<button type="button" className="nt-btn cap-big" style={{ background: "#FF453A", color: "#fff" }} onClick={() => go("record")}>
					<Circle size={13} fill="currentColor" /> Record
				</button>
			</div>
			<div className="nt-muted" style={{ textAlign: "center" }}>
				Pick the shape in Windows' snip bar. The notch stays out of the shot; snips go to the clipboard and the Shelf.
			</div>
			{error && <div className="nt-muted" style={{ color: "#FF453A", textAlign: "center" }}>{error}</div>}
		</div>
	);
}
