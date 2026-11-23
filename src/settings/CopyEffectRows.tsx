import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sparkles } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { Choice } from "./Choice";
import { ColourRow } from "./ColourRow";
import { COPY_EFFECTS } from "../components/ProgressEffect";

/** Settings › Shelf › Copy Effect: what the notch shows with "Copied", and its colour. */
export function CopyEffectRows() {
	const [effect, setEffect] = useState(() => localStorage.getItem("bloom-copy-effect") ?? "beam");
	return (
		<>
			<SettingRow icon={Sparkles} label="Copy Effect" desc="Light on the notch's edge when something is copied: the gradient beam (both ways from the centre), one lap of light, a neon flash or a soft glow" divider={effect !== "off"}>
				<Choice
					value={effect}
					options={COPY_EFFECTS}
					onChange={(v) => {
						setEffect(v);
						localStorage.setItem("bloom-copy-effect", v);
						invoke("save_setting", { key: "bloom-copy-effect", value: v }).catch(() => {});
					}}
					label="Copy effect"
				/>
			</SettingRow>
			{effect !== "off" && <ColourRow storeKey="bloom-copy-color" label="Effect Colour" desc="The first swatch follows your accent colour" divider={false} />}
		</>
	);
}
