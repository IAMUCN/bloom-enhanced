import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Coffee } from "lucide-react";

const CHOICES: [number, string][] = [
	[30, "30 min"],
	[60, "1 h"],
	[120, "2 h"],
	[0, "∞"]
];

/** Keep awake: stops the PC and the display sleeping for a while. */
export default function KeepAwake() {
	const [until, setUntil] = useState(0);
	useEffect(() => {
		const read = () => invoke<number>("keep_awake_status").then(setUntil).catch(() => {});
		read();
		const t = window.setInterval(read, 15000);
		return () => window.clearInterval(t);
	}, []);
	const on = until !== 0;
	const label = !on
		? "Off: the PC sleeps as usual"
		: until >= Number.MAX_SAFE_INTEGER
			? "On until you turn it off"
			: `On until ${new Date(until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
	return (
		<div style={{ ["--tool-color" as string]: "#FFB347" }} className="nt-row" >
			<button
				type="button"
				className={`nt-btn${on ? " primary" : ""} nt-icon-btn`}
				style={{ width: 44, height: 44 }}
				aria-pressed={on}
				aria-label={on ? "Turn keep awake off" : "Keep awake for 1 hour"}
				onClick={() => invoke<number>("keep_awake", { minutes: on ? null : 60 }).then(setUntil)}
			>
				<Coffee size={20} />
			</button>
			<div className="nt-grow">
				<div style={{ fontWeight: 600, fontSize: 13 }}>Keep awake</div>
				<div className="nt-muted">{label}</div>
				<div className="nt-seg" style={{ marginTop: 6 }} role="group" aria-label="Keep awake for">
					{CHOICES.map(([m, name]) => (
						<button key={m} type="button" onClick={() => invoke<number>("keep_awake", { minutes: m }).then(setUntil)}>
							{name}
						</button>
					))}
				</div>
			</div>
		</div>
	);
}
