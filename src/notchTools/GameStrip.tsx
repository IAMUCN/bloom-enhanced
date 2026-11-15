import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Clock, Cpu, Gamepad2, MemoryStick, MonitorPlay } from "lucide-react";

type Stats = { cpu: number; mem_used: number; mem_total: number };

/** Game strip, first version: CPU, GPU and memory load and the time in one
 *  glanceable strip, plus the Xbox Game Bar (Win+G) for capture and FPS.
 *  ponytail: no FPS of its own yet: that needs ETW present events
 *  (PresentMon's method), planned for a later version. */
export default function GameStrip() {
	const [stats, setStats] = useState<Stats | null>(null);
	const [gpu, setGpu] = useState<number | null>(null);
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const read = () => {
			invoke<Stats>("system_stats").then(setStats).catch(() => {});
			invoke<number | null>("gpu_usage").then((g) => g !== null && setGpu(g)).catch(() => {});
			setNow(new Date());
		};
		read();
		const t = window.setInterval(read, 1000);
		return () => window.clearInterval(t);
	}, []);
	const cells: [typeof Cpu, string, string][] = [
		[Cpu, "CPU", stats ? `${Math.round(stats.cpu)}%` : "…"],
		[MonitorPlay, "GPU", gpu !== null ? `${Math.round(gpu)}%` : "…"],
		[MemoryStick, "RAM", stats ? `${Math.round((stats.mem_used / stats.mem_total) * 100)}%` : "…"],
		[Clock, "Time", now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })]
	];
	return (
		<div className="gs">
			{cells.map(([Icon, label, value]) => (
				<div key={label} className="gs-cell">
					<Icon size={14} className="gs-icon" />
					<span className="gs-value">{value}</span>
					<span className="gs-label">{label}</span>
				</div>
			))}
			<button type="button" className="nt-btn gs-bar" onClick={() => invoke("open_app", { appName: "ms-gamebar:" }).catch(() => {})}>
				<Gamepad2 size={14} /> Game Bar
			</button>
		</div>
	);
}
