import { useEffect, useState } from "react";
import { availableMonitors } from "@tauri-apps/api/window";
import { Monitor } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { Choice } from "./Choice";

/** Which display a surface (`bloom-notch-monitor`, `bloom-dock-monitor`,
 *  `bloom-clipboard-monitor`) lives on: Primary, or one of the connected
 *  displays by name. Shown only with more than one display; re-read when the
 *  window gets focus, so a display plugged in meanwhile appears. */
export function DisplayRow({
	storeKey,
	label,
	desc,
	value,
	saveSetting,
	divider
}: {
	storeKey: string;
	label: string;
	desc: string;
	value?: string;
	saveSetting: (key: string, value: string | null) => Promise<boolean>;
	divider?: boolean;
}) {
	const [monitors, setMonitors] = useState<string[]>([]);
	const [own, setOwn] = useState(() => localStorage.getItem(storeKey) ?? "");
	useEffect(() => {
		const read = () =>
			availableMonitors()
				.then((list) => setMonitors(list.map((m) => m.name).filter((n): n is string => !!n)))
				.catch(() => {});
		read();
		window.addEventListener("focus", read);
		return () => window.removeEventListener("focus", read);
	}, []);
	if (monitors.length < 2) return null;
	const current = value ?? own;
	// A display that is unplugged shows as Primary: that is where the surface goes.
	const shown = monitors.includes(current) ? current : "";
	return (
		<SettingRow icon={Monitor} label={label} desc={desc} divider={divider}>
			<Choice
				value={shown}
				options={[["", "Primary"], ...monitors.map((name, i) => [name, `Display ${i + 1}`] as const)]}
				onChange={(v) => {
					setOwn(v);
					saveSetting(storeKey, v);
				}}
				label={label}
			/>
		</SettingRow>
	);
}
