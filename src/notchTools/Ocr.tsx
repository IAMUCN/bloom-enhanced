import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Copy, ScanText } from "lucide-react";
import { copyText, useToolData } from "./useToolData";

type Result = { text: string; error: string };

/** OCR in one step: snip the text, it is read (Windows' own OCR, on the
 *  device, nothing uploaded), shown here and copied. The notch can close
 *  during the snip; the backend sends the result (`ocr-result`) and App
 *  saves it, so it is here when the notch opens again. */
export default function Ocr() {
	const [data, setData] = useToolData<Result>("ocr", { text: "", error: "" });
	const [busy, setBusy] = useState(false);
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		const off = listen<{ text?: string; error?: string }>("ocr-result", (e) => setData({ text: e.payload.text ?? "", error: e.payload.error ?? "" }));
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
