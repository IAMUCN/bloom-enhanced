import { useState } from "react";
import { Check } from "lucide-react";
import { TOOLS, type ToolId } from "../tools";

/** Each tool's switch in settings.json. */
const TOOL_KEY: Record<ToolId, string> = {
	"command-center": "bloom-notch-command-center-enabled",
	music: "bloom-music-mode-enabled",
	calendar: "bloom-calendar-enabled",
	devices: "bloom-notch-devices-enabled",
	clipboard: "bloom-clipboard-enabled"
};
const ORDER: ToolId[] = ["command-center", "music", "calendar", "devices", "clipboard"];

/** Presets pre-tick tools; Command Center is always in, so the open notch is
 *  never empty. */
export const PRESETS: [string, ToolId[]][] = [
	["Student", ["command-center", "music", "calendar", "clipboard"]],
	["Developer", ["command-center", "music", "calendar", "clipboard"]],
	["Designer", ["command-center", "music", "clipboard"]],
	["Minimal", ["command-center", "music"]],
	["Everything", ORDER]
];

const isOn = (id: ToolId) =>
	id === "devices"
		? localStorage.getItem(TOOL_KEY[id]) === "true"
		: localStorage.getItem(TOOL_KEY[id]) !== "false";

/** First run: "Pick your tools". Shown once in Settings until the user starts
 *  or skips (`bloom-tools-picked`). Skip keeps the tools as they are. */
export function PickTools({
	saveSetting,
	onDone
}: {
	saveSetting: (key: string, value: string | null) => Promise<boolean>;
	onDone: () => void;
}) {
	const [picked, setPicked] = useState<Set<ToolId>>(() => new Set(ORDER.filter(isOn)));
	const [preset, setPreset] = useState<string | null>(null);
	const finish = async (apply: boolean) => {
		if (apply) {
			for (const id of ORDER) await saveSetting(TOOL_KEY[id], String(picked.has(id)));
		}
		await saveSetting("bloom-tools-picked", "true");
		onDone();
	};
	return (
		<div className="pick-tools-backdrop" role="dialog" aria-modal="true" aria-labelledby="pick-tools-title">
			<div className="pick-tools">
				<img src="/lotusnotch.png" alt="" className="pick-tools-logo" />
				<h1 id="pick-tools-title">Welcome to LotusNotch</h1>
				<p>Pick the tools you want in the notch. You can change this any time in Settings › Notch › Tools.</p>
				<div className="pick-tools-presets" role="group" aria-label="Presets">
					{PRESETS.map(([name, tools]) => (
						<button
							key={name}
							type="button"
							className={`pick-chip${preset === name ? " active" : ""}`}
							onClick={() => {
								setPreset(name);
								setPicked(new Set(tools));
							}}
						>
							{name}
						</button>
					))}
				</div>
				<div className="pick-tools-grid">
					{ORDER.map((id) => {
						const { label, icon: Icon, color } = TOOLS[id];
						const on = picked.has(id);
						const locked = id === "command-center";
						return (
							<button
								key={id}
								type="button"
								role="checkbox"
								aria-checked={on}
								disabled={locked}
								title={locked ? "Always on, so the open notch is never empty" : undefined}
								className={`pick-tool${on ? " on" : ""}`}
								onClick={() => {
									setPreset(null);
									setPicked((prev) => {
										const next = new Set(prev);
										if (next.has(id)) next.delete(id);
										else next.add(id);
										return next;
									});
								}}
							>
								<span className="tool-card-icon" style={{ color }}>
									<Icon size={16} />
								</span>
								<span className="pick-tool-label">{label}</span>
								<span className="pick-check">{on && <Check size={12} strokeWidth={3} />}</span>
							</button>
						);
					})}
				</div>
				<div className="pick-tools-actions">
					<button type="button" className="pick-skip" onClick={() => finish(false)}>
						Skip
					</button>
					<button type="button" className="pick-start" onClick={() => finish(true)}>
						Start with {picked.size} {picked.size === 1 ? "tool" : "tools"}
					</button>
				</div>
			</div>
		</div>
	);
}
