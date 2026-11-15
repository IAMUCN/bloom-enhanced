import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { ToolProps } from "../tools";
import { calc } from "./calcEval";
import { copyText } from "./useToolData";

const KEYS = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "⌫", "="];
const OPS = "÷×−+=";

/** A key as the web names it → the calculator's own key. */
const FROM_KEY: Record<string, string> = {
	"+": "+",
	"-": "−",
	"*": "×",
	"/": "÷",
	"=": "=",
	Enter: "=",
	Backspace: "⌫",
	Delete: "C",
	".": ".",
	",": ".",
	"(": "(",
	")": ")"
};
const toKey = (k: string) => (/^[0-9]$/.test(k) ? k : FROM_KEY[k]);

/** Calculator: type or tap; Enter or = keeps the result; click it to copy.
 *  While it shows, number keys (top row or numpad) go to it, even with the
 *  keyboard in another app; Esc hands them back to the tab bar (1–9 then
 *  switch tools), a click takes them again. */
export default function Calc({ setPinned }: ToolProps) {
	const [expr, setExpr] = useState("");
	const [copied, setCopied] = useState(false);
	const [typing, setTyping] = useState(true);
	const result = calc(expr);
	const shown = result === null ? "" : String(Math.round(result * 1e10) / 1e10);
	const press = (k: string) => {
		if (k === "C") setExpr("");
		else if (k === "⌫") setExpr((e) => e.slice(0, -1));
		else if (k === "=") shown && setExpr(shown);
		else setExpr((e) => e + k);
	};
	const pressRef = useRef(press);
	pressRef.current = press;

	useEffect(() => {
		invoke("set_notch_key_capture", { on: typing }).catch(() => {});
		if (!typing) return;
		// Keys from other apps' focus (the keyboard hook, shortcuts.rs)…
		const off = listen<string>("notch-key", (e) => {
			const k = toKey(e.payload);
			if (k) pressRef.current(k);
		});
		// …and from this window when it has the keyboard (not the text field).
		const onKey = (e: KeyboardEvent) => {
			if (e.ctrlKey || e.altKey || e.metaKey || (e.target as HTMLElement | null)?.closest("input")) return;
			const k = toKey(e.key);
			if (!k) return;
			e.preventDefault();
			pressRef.current(k);
		};
		window.addEventListener("keydown", onKey, true);
		// Esc: hand the keys back to the tab bar instead of closing.
		const onEsc = (e: Event) => {
			e.preventDefault();
			setTyping(false);
		};
		window.addEventListener("notch-escape-tool", onEsc);
		return () => {
			off.then((f) => f());
			window.removeEventListener("keydown", onKey, true);
			window.removeEventListener("notch-escape-tool", onEsc);
		};
	}, [typing]);
	useEffect(() => () => void invoke("set_notch_key_capture", { on: false }).catch(() => {}), []);

	return (
		<div style={{ ["--tool-color" as string]: "#9DB4FF", display: "contents" }} onPointerDown={() => setTyping(true)}>
			<div className="nt-muted" style={{ fontSize: 10, textAlign: "center" }}>
				{typing ? "Number keys type here · Esc to switch tools with 1–9" : "Click to type · 1–9 switch tools"}
			</div>
			<input
				className="nt-input"
				style={{ textAlign: "right", fontSize: 13 }}
				value={expr}
				aria-label="Calculation"
				onFocus={() => setPinned(true)}
				onBlur={() => setPinned(false)}
				onChange={(e) => setExpr(e.target.value)}
				onKeyDown={(e) => e.key === "Enter" && press("=")}
			/>
			<button
				type="button"
				className="nt-big"
				style={{ background: "none", border: "none", color: "inherit", textAlign: "right", cursor: "copy", padding: 0, font: "inherit", fontSize: 30, fontWeight: 600 }}
				title="Click to copy"
				aria-label={shown ? `Result ${shown}, click to copy` : "No result"}
				onClick={() => shown && copyText(shown).then((ok) => ok && (setCopied(true), window.setTimeout(() => setCopied(false), 1200)))}
			>
				{copied ? "Copied" : shown || "0"}
			</button>
			<div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
				{KEYS.map((k) => (
					<button key={k} type="button" className={`nt-btn${OPS.includes(k) ? " primary" : ""}`} style={{ borderRadius: 10, padding: "7px 0" }} onClick={() => press(k)}>
						{k}
					</button>
				))}
			</div>
		</div>
	);
}
