import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { motion } from "framer-motion";
import { SNAP } from "../motion";

/** Left to right, as in Settings › System › Power. */
const MODES: [string, string, string][] = [
	["efficiency", "Best efficiency", "Longer battery, a little slower"],
	["balanced", "Balanced", "Windows' default"],
	["performance", "Best performance", "Fastest, uses more power"]
];

/** Windows' power mode, as one slider with three stops (the way Windows
 *  shows it). Greyed out with the reason when the power plan isn't
 *  Balanced, which is the only plan Windows offers the modes on. */
export default function PowerModes() {
	const [mode, setMode] = useState<string | null>(null);
	const [available, setAvailable] = useState(true);
	const [error, setError] = useState("");
	useEffect(() => {
		invoke<string | null>("power_mode").then(setMode).catch(() => {});
		invoke<boolean>("power_modes_available").then(setAvailable).catch(() => {});
	}, []);
	const pick = (id: string) => {
		if (!available || id === mode) return;
		const before = mode;
		setMode(id);
		invoke("set_power_mode", { mode: id })
			.then(() => setError(""))
			.catch((e) => (setMode(before), setError(String(e))));
	};
	const at = MODES.findIndex(([id]) => id === mode);
	const current = MODES[at];
	return (
		<div className={`pm${available ? "" : " off"}`} style={{ ["--tool-color" as string]: "#FFD25A" }}>
			<div className="pm-head">
				<span className="pm-name">{available ? (current?.[1] ?? "Power mode") : "Power mode"}</span>
				<span className="pm-note">
					{available ? (current?.[2] ?? "Pick one") : "Needs Windows' Balanced power plan (Control Panel › Power Options)"}
				</span>
			</div>
			<div className="pm-track" role="radiogroup" aria-label="Power mode" aria-disabled={!available}>
				<div className="pm-rail" aria-hidden />
				{at >= 0 && <motion.div className="pm-fill" aria-hidden initial={false} animate={{ width: `${at * 50}%` }} transition={SNAP} />}
				{MODES.map(([id, name], i) => (
					<button
						key={id}
						type="button"
						role="radio"
						aria-checked={id === mode}
						aria-label={name}
						disabled={!available}
						className={`pm-stop${i <= at ? " passed" : ""}`}
						style={{ left: `${i * 50}%` }}
						onClick={() => pick(id)}
					>
						{id === mode && <motion.span layoutId="pm-thumb" className="pm-thumb" transition={SNAP} />}
					</button>
				))}
			</div>
			<div className="pm-labels" aria-hidden>
				{MODES.map(([id, name]) => (
					<button key={id} type="button" tabIndex={-1} className={id === mode ? "on" : ""} disabled={!available} onClick={() => pick(id)}>
						{name.replace("Best ", "")}
					</button>
				))}
			</div>
			{error && <div className="pm-error">{error}</div>}
		</div>
	);
}
