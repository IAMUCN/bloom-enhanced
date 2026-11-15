import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Copy, ScanText, Square } from "lucide-react";
import { copyText } from "./useToolData";

/** OCR: snip part of the screen, then read its text. Windows' own OCR, on
 *  the device: nothing is uploaded. */
export default function Ocr() {
	const [text, setText] = useState("");
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	const read = async () => {
		setBusy(true);
		setError("");
		try {
			setText(await invoke<string>("ocr_clipboard"));
		} catch (e) {
			setError(String(e));
		}
		setBusy(false);
	};
	return (
		<div style={{ ["--tool-color" as string]: "#7CC4FF", display: "contents" }}>
			<div className="nt-row" style={{ justifyContent: "center" }}>
				<button type="button" className="nt-btn" onClick={() => invoke("screen_clip", { mode: "region" }).catch((e) => setError(String(e)))}>
					<Square size={12} /> 1. Snip text
				</button>
				<button type="button" className="nt-btn primary" onClick={read} disabled={busy}>
					<ScanText size={13} /> {busy ? "Reading…" : "2. Read text"}
				</button>
				{text && (
					<button type="button" className="nt-btn" onClick={() => copyText(text).then((ok) => ok && (setCopied(true), window.setTimeout(() => setCopied(false), 1200)))}>
						<Copy size={12} /> {copied ? "Copied" : "Copy"}
					</button>
				)}
			</div>
			<div className="nt-card nt-list" style={{ whiteSpace: "pre-wrap", userSelect: "text", textAlign: text && !error ? undefined : "center" }}>
				{error ? <span style={{ color: "#FF453A" }}>{error}</span> : text || <span className="nt-muted">Snip a part of the screen, then Read text. It reads the image on the clipboard.</span>}
			</div>
		</div>
	);
}
