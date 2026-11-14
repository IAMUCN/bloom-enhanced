import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Copy, Pipette } from "lucide-react";
import { copyText, useToolData } from "./useToolData";

const rgb = (hex: string) => {
	const n = parseInt(hex.slice(1), 16);
	return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

/** Colour picker: click Pick, then click anywhere on screen (right-click
 *  cancels). Recent colours are kept. */
export default function ColorPicker() {
	const [data, setData] = useToolData<{ recent: string[] }>("picker", { recent: [] });
	const [picking, setPicking] = useState(false);
	const [copied, setCopied] = useState("");
	const current = data.recent[0] ?? null;
	const pick = async () => {
		setPicking(true);
		const hex = await invoke<string | null>("pick_screen_color").catch(() => null);
		setPicking(false);
		if (hex) setData((d) => ({ recent: [hex, ...d.recent.filter((c) => c !== hex)].slice(0, 10) }));
	};
	const copy = (text: string) => copyText(text).then((ok) => ok && (setCopied(text), window.setTimeout(() => setCopied(""), 1200)));
	return (
		<div style={{ ["--tool-color" as string]: "#F27BFF", display: "contents" }}>
			<div className="nt-row">
				<div style={{ width: 64, height: 64, borderRadius: 14, flex: "none", background: current ?? "transparent", border: "1px dashed var(--bloom-border, #333)" }} aria-hidden />
				<div className="nt-grow" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
					{current ? (
						[current, rgb(current)].map((v) => (
							<button key={v} type="button" className="nt-btn" style={{ justifyContent: "space-between" }} onClick={() => copy(v)}>
								{copied === v ? "Copied" : v} <Copy size={12} />
							</button>
						))
					) : (
						<span className="nt-muted">Pick a colour from anywhere on the screen.</span>
					)}
				</div>
			</div>
			<div className="nt-row">
				{data.recent.slice(1).map((c) => (
					<button key={c} type="button" title={c} aria-label={`Use ${c}`} onClick={() => setData((d) => ({ recent: [c, ...d.recent.filter((x) => x !== c)] }))}
						style={{ width: 20, height: 20, borderRadius: 6, border: "none", background: c, cursor: "pointer", padding: 0 }} />
				))}
				<span className="nt-grow" />
				<button type="button" className="nt-btn primary" onClick={pick} disabled={picking}>
					<Pipette size={13} /> {picking ? "Click a colour…" : "Pick"}
				</button>
			</div>
		</div>
	);
}
