import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { AppWindow, Circle, Lasso, Monitor, Square } from "lucide-react";

const MODES: [string, string, typeof Square][] = [
	["region", "Region", Square],
	["window", "Window", AppWindow],
	["full", "Full screen", Monitor],
	["free", "Freeform", Lasso]
];

/** Snip & record through Windows' own Snipping Tool; the result lands on the
 *  clipboard, so the Shelf keeps it. */
export default function Snip() {
	const [error, setError] = useState("");
	const go = (mode: string) => invoke("screen_clip", { mode }).then(() => setError("")).catch((e) => setError(String(e)));
	return (
		<div style={{ ["--tool-color" as string]: "#FF7AB8", display: "contents" }}>
			<div className="nt-row" style={{ flexWrap: "wrap" }}>
				{MODES.map(([mode, label, Icon]) => (
					<button key={mode} type="button" className="nt-btn" onClick={() => go(mode)}>
						<Icon size={13} /> {label}
					</button>
				))}
			</div>
			<div className="nt-row">
				<button type="button" className="nt-btn" style={{ background: "#FF453A", color: "#fff" }} onClick={() => go("record")}>
					<Circle size={12} fill="currentColor" /> Record screen
				</button>
				<span className="nt-muted nt-grow">Snips go to the clipboard and the Shelf.</span>
			</div>
			{error && <div className="nt-muted" style={{ color: "#FF453A" }}>{error}</div>}
		</div>
	);
}
