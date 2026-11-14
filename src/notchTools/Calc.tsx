import { useState } from "react";
import type { ToolProps } from "../tools";
import { calc } from "./calcEval";
import { copyText } from "./useToolData";

const KEYS = ["C", "(", ")", "÷", "7", "8", "9", "×", "4", "5", "6", "−", "1", "2", "3", "+", "0", ".", "⌫", "="];
const OPS = "÷×−+=";

/** Calculator: type or tap; Enter or = keeps the result; click it to copy. */
export default function Calc({ setPinned }: ToolProps) {
	const [expr, setExpr] = useState("");
	const [copied, setCopied] = useState(false);
	const result = calc(expr);
	const shown = result === null ? "" : String(Math.round(result * 1e10) / 1e10);
	const press = (k: string) => {
		if (k === "C") setExpr("");
		else if (k === "⌫") setExpr((e) => e.slice(0, -1));
		else if (k === "=") shown && setExpr(shown);
		else setExpr((e) => e + k);
	};
	return (
		<div style={{ ["--tool-color" as string]: "#9DB4FF", display: "contents" }}>
			<input
				className="nt-input"
				style={{ textAlign: "right", fontSize: 13 }}
				value={expr}
				placeholder="128 × 3.5"
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
