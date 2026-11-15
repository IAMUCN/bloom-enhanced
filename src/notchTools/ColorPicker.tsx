import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Copy, Pipette, X } from "lucide-react";
import { copyText, useToolData } from "./useToolData";
import type { ToolProps } from "../tools";

const rgb = (hex: string) => {
	const n = parseInt(hex.slice(1), 16);
	return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

/** Colour picker: click Pick, then click anywhere on screen (right-click
 *  cancels). While picking, the cursor is a crosshair and the big swatch
 *  shows the colour under it. Picked colours are kept; click one to use it,
 *  its × removes it, Clear removes them all. */
export default function ColorPicker({ setPinned }: ToolProps) {
	const [data, setData] = useToolData<{ recent: string[] }>("picker", { recent: [] });
	const [picking, setPicking] = useState(false);
	const [live, setLive] = useState<string | null>(null);
	const [copied, setCopied] = useState("");
	const current = data.recent[0] ?? null;
	// Live preview of the colour under the pointer while picking.
	useEffect(() => {
		if (!picking) return setLive(null);
		const t = window.setInterval(() => invoke<string | null>("color_at_cursor").then(setLive).catch(() => {}), 80);
		return () => window.clearInterval(t);
	}, [picking]);
	const pick = async () => {
		// Keep the notch open while the pointer leaves it to click the screen.
		setPinned(true);
		setPicking(true);
		const hex = await invoke<string | null>("pick_screen_color").catch(() => null);
		setPicking(false);
		setPinned(false);
		if (!hex) return;
		setData((d) => ({ recent: [hex, ...d.recent.filter((c) => c !== hex)].slice(0, 12) }));
		copy(hex);
	};
	const copy = (text: string) => copyText(text).then((ok) => ok && (setCopied(text), window.setTimeout(() => setCopied(""), 1200)));
	const remove = (c: string) => setData((d) => ({ recent: d.recent.filter((x) => x !== c) }));
	const shown = picking ? live : current;
	return (
		<div style={{ ["--tool-color" as string]: "#F27BFF", display: "contents" }}>
			<div className="nt-row" style={{ justifyContent: "center", gap: 12 }}>
				<div className={`cp-swatch${picking ? " picking" : ""}`} style={{ background: shown ?? "transparent" }} aria-hidden />
				<div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 170 }}>
					{picking ? (
						<>
							<strong style={{ fontSize: 14 }}>{live ?? "…"}</strong>
							<span className="nt-muted">Click anywhere to pick · right-click cancels</span>
						</>
					) : current ? (
						[current, rgb(current)].map((v) => (
							<button key={v} type="button" className="nt-btn" style={{ justifyContent: "space-between", fontSize: 13 }} onClick={() => copy(v)}>
								{copied === v ? "Copied" : v} <Copy size={12} />
							</button>
						))
					) : (
						<span className="nt-muted">Pick a colour from anywhere on the screen.</span>
					)}
				</div>
				<button type="button" className={`nt-btn primary cap-big${picking ? " cp-active" : ""}`} aria-pressed={picking} onClick={pick} disabled={picking}>
					<Pipette size={15} /> {picking ? "Picking…" : "Pick"}
				</button>
			</div>
			{data.recent.length > 0 && (
				<div className="nt-row" style={{ justifyContent: "center", flexWrap: "wrap", gap: 6 }}>
					{data.recent.map((c) => (
						<span key={c} className={`cp-chip${c === current ? " on" : ""}`}>
							<button type="button" title={c} aria-label={`Use ${c}`} style={{ background: c }} onClick={() => setData((d) => ({ recent: [c, ...d.recent.filter((x) => x !== c)] }))} />
							<button type="button" className="cp-remove" aria-label={`Remove ${c}`} onClick={() => remove(c)}>
								<X size={9} strokeWidth={3} />
							</button>
						</span>
					))}
					<button type="button" className="nt-btn" style={{ padding: "3px 10px" }} onClick={() => setData({ recent: [] })}>
						Clear
					</button>
				</div>
			)}
		</div>
	);
}
