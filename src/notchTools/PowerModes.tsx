import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Leaf, Scale, Zap } from "lucide-react";

const MODES: [string, string, string, typeof Leaf][] = [
	["efficiency", "Best efficiency", "Longer battery", Leaf],
	["balanced", "Balanced", "Windows default", Scale],
	["performance", "Best performance", "Faster, more power", Zap]
];

/** Windows' power modes (Settings › System › Power) in one tap. */
export default function PowerModes() {
	const [mode, setMode] = useState<string | null>(null);
	const [error, setError] = useState("");
	useEffect(() => {
		invoke<string | null>("power_mode").then(setMode).catch(() => {});
	}, []);
	return (
		<div style={{ ["--tool-color" as string]: "#FFD25A", display: "contents" }}>
			<div className="nt-row" role="radiogroup" aria-label="Power mode" style={{ alignItems: "stretch" }}>
				{MODES.map(([id, name, sub, Icon]) => {
					const on = mode === id;
					return (
						<button
							key={id}
							type="button"
							role="radio"
							aria-checked={on}
							className="nt-card"
							style={{ flex: 1, border: "none", cursor: "pointer", textAlign: "left", font: "inherit", color: on ? "#000" : "inherit", background: on ? "#FFD25A" : undefined, display: "flex", flexDirection: "column", gap: 4 }}
							onClick={() => invoke("set_power_mode", { mode: id }).then(() => (setMode(id), setError(""))).catch((e) => setError(String(e)))}
						>
							<Icon size={16} />
							<span style={{ fontWeight: 600 }}>{name}</span>
							<span style={{ fontSize: 11, opacity: 0.7 }}>{sub}</span>
						</button>
					);
				})}
			</div>
			{error && <div className="nt-muted" style={{ color: "#FF453A" }}>{error}</div>}
		</div>
	);
}
