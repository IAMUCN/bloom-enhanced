import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Palette } from "lucide-react";
import { SettingRow } from "./SettingRow";

// "" = follow the accent colour.
const COLOURS = ["", "#ffffff", "#30d158", "#ff4fd8", "#00d4ff", "#ffb020"];

/** A colour for an effect (`storeKey`): the accent, five presets or any colour. */
export function ColourRow({ storeKey, label, desc, divider }: { storeKey: string; label: string; desc: string; divider?: boolean }) {
	const [colour, setColour] = useState(() => localStorage.getItem(storeKey) ?? "");
	const pick = (v: string) => {
		setColour(v);
		localStorage.setItem(storeKey, v);
		invoke("save_setting", { key: storeKey, value: v }).catch(() => {});
	};
	return (
		<SettingRow icon={Palette} label={label} desc={desc} divider={divider}>
			<div className="accent-swatches">
				{COLOURS.map((c) => (
					<button
						key={c || "accent"}
						type="button"
						className={`accent-swatch${c === colour ? " on" : ""}`}
						style={{ background: c || "var(--user-accent, #6a55ff)" }}
						aria-label={c ? `Colour ${c}` : "Accent colour"}
						aria-pressed={c === colour}
						onClick={() => pick(c)}
					/>
				))}
				<input type="color" value={colour || "#6a55ff"} onChange={(e) => pick(e.target.value)} className="color-picker-input" aria-label={`Custom ${label.toLowerCase()}`} />
			</div>
		</SettingRow>
	);
}
