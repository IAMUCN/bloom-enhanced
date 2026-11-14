import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

type Stats = { cpu: number; mem_used: number; mem_total: number; net_down: number; net_up: number };
const GB = 1024 ** 3;
const rate = (b: number) => (b > 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB/s` : `${Math.round(b / 1024)} KB/s`);

function Spark({ values, color, max }: { values: number[]; color: string; max: number }) {
	const w = 150;
	const h = 30;
	const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (Math.min(v, max) / max) * h}`).join(" ");
	return (
		<svg width={w} height={h} aria-hidden style={{ overflow: "visible" }}>
			<polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
		</svg>
	);
}

/** System monitor: CPU, memory and network, sampled every 1.5 s only while
 *  this tab shows. */
export default function SystemMonitor() {
	const [history, setHistory] = useState<Stats[]>([]);
	useEffect(() => {
		const read = () => invoke<Stats>("system_stats").then((s) => setHistory((h) => [...h.slice(-29), s])).catch(() => {});
		read();
		const t = window.setInterval(read, 1500);
		return () => window.clearInterval(t);
	}, []);
	const last = history[history.length - 1];
	const peakNet = Math.max(1024 * 100, ...history.map((s) => Math.max(s.net_down, s.net_up)));
	const cards: [string, string, string, number[], number][] = last
		? [
				["CPU", `${Math.round(last.cpu)} %`, "#57D9A3", history.map((s) => s.cpu), 100],
				["Memory", `${(last.mem_used / GB).toFixed(1)} / ${(last.mem_total / GB).toFixed(0)} GB`, "#FFC94D", history.map((s) => s.mem_used / s.mem_total), 1],
				["Download", rate(last.net_down), "#5B9BFF", history.map((s) => s.net_down), peakNet],
				["Upload", rate(last.net_up), "#B98CFF", history.map((s) => s.net_up), peakNet]
			]
		: [];
	return (
		<div className="nt-row" style={{ alignItems: "stretch" }}>
			{cards.map(([name, value, color, values, max]) => (
				<div key={name} className="nt-card" style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
					<div className="nt-row" style={{ justifyContent: "space-between" }}>
						<span className="nt-muted">{name}</span>
						<span style={{ color, fontWeight: 600 }}>{value}</span>
					</div>
					<Spark values={values} color={color} max={max} />
				</div>
			))}
			{!last && <div className="nt-muted">Reading…</div>}
		</div>
	);
}
