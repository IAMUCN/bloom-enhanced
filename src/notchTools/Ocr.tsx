import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Copy, ScanText, Trash2 } from "lucide-react";
import { copyText, useToolData } from "./useToolData";

/** `at`: when it was read (ms). The last result stays until cleared, or
 *  for 7 days. It lives in the app's own data folder, on this PC only. */
type Result = { text: string; error: string; at?: number };
const KEEP_MS = 7 * 24 * 3600 * 1000;
const EMPTY: Result = { text: "", error: "" };

/** OCR in one step: snip the text, it is read (Windows' own OCR, on the
 *  device, nothing uploaded), shown here and copied. The notch can close
 *  during the snip; the backend sends the result (`ocr-result`) and App
 *  saves it, so it is here when the notch opens again. */
export default function Ocr() {
	const [stored, setData, ready] = useToolData<Result>("ocr", EMPTY);
	// Older than 7 days: gone (also from the disk).
	const stale = !!stored.at && Date.now() - stored.at > KEEP_MS;
	useEffect(() => {
		if (ready && stale) setData(EMPTY);
	}, [ready, stale]);
	const data = stale ? EMPTY : stored;
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		const off = listen<{ text?: string; error?: string }>("ocr-result", (e) =>
			setData({ text: e.payload.text ?? "", error: e.payload.error ?? "", at: Date.now() })
		);
		return () => void off.then((f) => f());
	}, []);
	const snip = () => {
		setBusy(true);
		invoke("ocr_snip")
			.catch((e) => setData({ text: "", error: String(e) }))
			.finally(() => setBusy(false));
	};
	const { text, error } = data;
	return (
		<div style={{ ["--tool-color" as string]: "#7CC4FF", display: "contents" }}>
			<div className="nt-row" style={{ justifyContent: "center" }}>
				<button type="button" className="nt-btn primary cap-big" onClick={snip} disabled={busy}>
					<ScanText size={16} /> {busy ? "Snip the text…" : "Snip text"}
				</button>
				{text && !error && (
					<button type="button" className="nt-btn cap-big" onClick={() => copyText(text).then((ok) => ok && (setCopied(true), window.setTimeout(() => setCopied(false), 1200)))}>
						<Copy size={14} /> {copied ? "Copied" : "Copy"}
					</button>
				)}
				{(text || error) && (
					<button type="button" className="nt-btn cap-big" aria-label="Clear" title="Clear (it also clears itself after 7 days)" onClick={() => setData(EMPTY)}>
						<Trash2 size={14} /> Clear
					</button>
				)}
			</div>
			<div className="nt-card nt-list" style={{ whiteSpace: "pre-wrap", userSelect: "text", fontSize: 13, textAlign: text && !error ? undefined : "center" }}>
				{error ? (
					<span style={{ color: "#FF453A" }}>{error}</span>
				) : (
					text || <span className="nt-muted">Snip some text on the screen: it shows here and is copied, ready to paste.</span>
				)}
			</div>
		</div>
	);
}
