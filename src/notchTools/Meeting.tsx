import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Mic, MicOff } from "lucide-react";

/** Meeting: mutes the microphone for every app at once (the default
 *  communications mic). */
export default function Meeting() {
	const [muted, setMuted] = useState<boolean | null>(null);
	useEffect(() => {
		const read = () => invoke<boolean | null>("mic_muted").then(setMuted).catch(() => {});
		read();
		const t = window.setInterval(read, 3000);
		return () => window.clearInterval(t);
	}, []);
	const toggle = () => muted !== null && invoke("set_mic_muted", { muted: !muted }).then(() => setMuted(!muted));
	return (
		<div className="nt-row">
			<button
				type="button"
				className="nt-btn nt-icon-btn"
				style={{ width: 52, height: 52, background: muted ? "#FF453A" : undefined, color: muted ? "#fff" : undefined }}
				aria-pressed={!!muted}
				aria-label={muted ? "Unmute microphone" : "Mute microphone"}
				disabled={muted === null}
				onClick={toggle}
			>
				{muted ? <MicOff size={22} /> : <Mic size={22} />}
			</button>
			<div className="nt-grow">
				<div style={{ fontWeight: 600, fontSize: 13 }}>{muted === null ? "No microphone" : muted ? "Microphone muted" : "Microphone on"}</div>
				<div className="nt-muted">Mutes it for every app, like the hardware key.</div>
			</div>
		</div>
	);
}
