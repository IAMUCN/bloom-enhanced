import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Palette, Sparkles } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { Choice } from "./Choice";
import { COPY_EFFECTS } from "../components/ProgressEffect";

// "" = follow the accent colour.
const COLOURS = ["", "#ffffff", "#30d158", "#ff4fd8", "#00d4ff", "#ffb020"];

const save = (key: string, value: string) => {
	localStorage.setItem(key, value);
	invoke("save_setting", { key, value }).catch(() => {});
};

/** Settings › Shelf › Copy Effect: what the notch shows with "Copied", and its colour. */
export function CopyEffectRows() {
	const [effect, setEffect] = useState(() => localStorage.getItem("bloom-copy-effect") ?? "beam");
	const [colour, setColour] = useState(() => localStorage.getItem("bloom-copy-color") ?? "");
	return (
		<>
			<SettingRow icon={Sparkles} label="Copy Effect" desc="Light on the notch's edge when something is copied: one lap of light, a neon flash or a soft glow" divider>
				<Choice
					value={effect}
					options={COPY_EFFECTS}
					onChange={(v) => (setEffect(v), save("bloom-copy-effect", v))}
					label="Copy effect"
				/>
			</SettingRow>
			{effect !== "off" && (
				<SettingRow icon={Palette} label="Effect Colour" desc="The first swatch follows your accent colour">
					<div className="accent-swatches">
						{COLOURS.map((c) => (
							<button
								key={c || "accent"}
								type="button"
								className={`accent-swatch${c === colour ? " on" : ""}`}
								style={{ background: c || "var(--user-accent, #6a55ff)" }}
								aria-label={c ? `Colour ${c}` : "Accent colour"}
								aria-pressed={c === colour}
								onClick={() => (setColour(c), save("bloom-copy-color", c))}
							/>
						))}
						<input type="color" value={colour || "#6a55ff"} onChange={(e) => (setColour(e.target.value), save("bloom-copy-color", e.target.value))} className="color-picker-input" aria-label="Custom effect colour" />
					</div>
				</SettingRow>
			)}
		</>
	);
}
