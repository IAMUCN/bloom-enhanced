import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowDown, ArrowUp, BatteryCharging, BatteryMedium, Cpu, Globe, HardDrive, MemoryStick, type LucideIcon } from "lucide-react";

type Stats = {
	cpu: number;
	mem_used: number;
	mem_total: number;
	net_down: number;
	net_up: number;
	disk_free: number;
	disk_total: number;
	battery: number | null;
	charging: boolean;
};

const GB = 1024 ** 3;
const bytes = (b: number) => (b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB/s` : `${Math.round(b / 1024)} KB/s`);
/** Bits/s in Task Manager's units (Kbps / Mbps, decimal). */
const bits = (b: number) => (b * 8 >= 1e6 ? `${((b * 8) / 1e6).toFixed(1)} Mbps` : `${Math.round((b * 8) / 1e3)} Kbps`);

function Spark({ values, max }: { values: number[]; max: number }) {
	const w = 60;
	const h = 14;
	const pts = values.map((v, i) => `${(i / Math.max(1, values.length - 1)) * w},${h - (Math.min(v, max) / max) * h}`).join(" ");
	return (
		<svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="sm-spark">
			<polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
		</svg>
	);
}

function Row({ icon: Icon, label, children, value, faint }: { icon: LucideIcon; label: string; children: React.ReactNode; value: string; faint?: boolean }) {
	return (
		<div className="sm-row">
			<Icon size={15} className="sm-icon" />
			<span className="sm-label">{label}</span>
			<div className="sm-mid">{children}</div>
			<span className={`sm-value${faint ? " faint" : ""}`}>{value}</span>
		</div>
	);
}

const Bar = ({ value }: { value: number }) => (
	<div className="sm-track">
		<div className="sm-fill" style={{ transform: `scaleX(${Math.max(0, Math.min(1, value))})` }} />
	</div>
);

/** System monitor: CPU, memory, disk, network and battery as one list of
 *  bars (user's reference, 2026-11-15), sampled every 1.5 s only while this
 *  tab shows. CPU and network read like Task Manager. */
export default function SystemMonitor() {
	const [history, setHistory] = useState<Stats[]>([]);
	useEffect(() => {
		const read = () => invoke<Stats>("system_stats").then((s) => setHistory((h) => [...h.slice(-29), s])).catch(() => {});
		read();
		const t = window.setInterval(read, 1500);
		return () => window.clearInterval(t);
	}, []);
	const last = history[history.length - 1];
	if (!last) return <div className="nt-muted">Reading…</div>;
	const peak = Math.max(1024 * 50, ...history.map((s) => Math.max(s.net_down, s.net_up)));
	return (
		<div className="sm-card">
			<Row icon={Cpu} label="CPU" value={`${Math.round(last.cpu)}%`}>
				<Bar value={last.cpu / 100} />
			</Row>
			<Row icon={MemoryStick} label="Memory" value={`${(last.mem_used / GB).toFixed(2)} GB`}>
				<Bar value={last.mem_used / last.mem_total} />
			</Row>
			<Row icon={HardDrive} label="Disk" value={`${(last.disk_free / GB).toFixed(2)} GB free`}>
				<Bar value={last.disk_total ? 1 - last.disk_free / last.disk_total : 0} />
			</Row>
			<Row icon={Globe} label="Net" value="" faint>
				<span className="sm-net">
					<ArrowDown size={11} className="sm-arrow" />
					<Spark values={history.map((s) => s.net_down)} max={peak} />
					<strong>
						{bytes(last.net_down)} · {bits(last.net_down)}
					</strong>
				</span>
				<span className="sm-net">
					<ArrowUp size={11} className="sm-arrow" />
					<Spark values={history.map((s) => s.net_up)} max={peak} />
					<strong>{bytes(last.net_up)}</strong>
				</span>
			</Row>
			{last.battery !== null && (
				<Row icon={last.charging ? BatteryCharging : BatteryMedium} label="Battery" value={`${last.battery}%`}>
					<Bar value={last.battery / 100} />
				</Row>
			)}
		</div>
	);
}
