import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { VideoOff } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { hidesFromCapture } from "../hooks/useHideFromCapture";

/** "Hide From Recordings" for one module (see useHideFromCapture). */
export function HideFromCaptureRow({ settingKey, byDefault, what }: { settingKey: string; byDefault: boolean; what: string }) {
	const [on, setOn] = useState(() => hidesFromCapture(settingKey, byDefault));
	return (
		<SettingRow icon={VideoOff} label="Hide From Recordings" desc={`Recordings, screen shares and screenshots leave ${what} out`}>
			<label className="toggle-switch">
				<input
					type="checkbox"
					checked={on}
					onChange={() => {
						const next = !on;
						setOn(next);
						localStorage.setItem(settingKey, String(next));
						invoke("save_setting", { key: settingKey, value: String(next) }).catch(() => {});
					}}
				/>
				<span className="slider"></span>
			</label>
		</SettingRow>
	);
}
