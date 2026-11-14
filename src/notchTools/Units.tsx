import { useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import type { ToolProps } from "../tools";

/** Factors to the first unit of each kind; temperature has its own math. */
const KINDS: Record<string, [string, number][]> = {
	Length: [["m", 1], ["km", 1000], ["cm", 0.01], ["mm", 0.001], ["ft", 0.3048], ["in", 0.0254], ["mi", 1609.344], ["yd", 0.9144]],
	Weight: [["kg", 1], ["g", 0.001], ["lb", 0.45359237], ["oz", 0.028349523125], ["t", 1000]],
	Temp: [["°C", 0], ["°F", 0], ["K", 0]],
	Data: [["MB", 1], ["KB", 1 / 1024], ["GB", 1024], ["TB", 1024 * 1024], ["bit", 1 / 8 / 1024 / 1024]],
	Speed: [["km/h", 1], ["m/s", 3.6], ["mph", 1.609344], ["knot", 1.852]]
};

function toC(v: number, u: string) {
	return u === "°F" ? ((v - 32) * 5) / 9 : u === "K" ? v - 273.15 : v;
}
function fromC(c: number, u: string) {
	return u === "°F" ? (c * 9) / 5 + 32 : u === "K" ? c + 273.15 : c;
}

export function convert(kind: string, value: number, from: string, to: string) {
	if (kind === "Temp") return fromC(toC(value, from), to);
	const f = KINDS[kind].find(([u]) => u === from)?.[1] ?? 1;
	const t = KINDS[kind].find(([u]) => u === to)?.[1] ?? 1;
	return (value * f) / t;
}

/** Unit converter: length, weight, temperature, data, speed. */
export default function Units({ setPinned }: ToolProps) {
	const [kind, setKind] = useState("Length");
	const units = KINDS[kind].map(([u]) => u);
	const [from, setFrom] = useState("ft");
	const [to, setTo] = useState("cm");
	const [value, setValue] = useState("5.8");
	const f = units.includes(from) ? from : units[0];
	const t = units.includes(to) ? to : units[1];
	const n = parseFloat(value);
	const out = Number.isFinite(n) ? Math.round(convert(kind, n, f, t) * 1e6) / 1e6 : "";
	const cycle = (u: string, set: (u: string) => void) => set(units[(units.indexOf(u) + 1) % units.length]);
	return (
		<div style={{ ["--tool-color" as string]: "#8BE3F5", display: "contents" }}>
			<div className="nt-seg" role="group" aria-label="What to convert">
				{Object.keys(KINDS).map((k) => (
					<button key={k} type="button" className={k === kind ? "on" : ""} onClick={() => setKind(k)}>
						{k}
					</button>
				))}
			</div>
			<div className="nt-row">
				<div className="nt-card nt-grow">
					<input
						className="nt-input"
						style={{ background: "none", padding: 0, fontSize: 20, fontWeight: 600 }}
						value={value}
						aria-label="Value"
						onFocus={() => setPinned(true)}
						onBlur={() => setPinned(false)}
						onChange={(e) => setValue(e.target.value)}
					/>
					<button type="button" className="nt-btn" style={{ marginTop: 4 }} onClick={() => cycle(f, setFrom)} aria-label="Change the from unit">
						{f}
					</button>
				</div>
				<button type="button" className="nt-btn nt-icon-btn" aria-label="Swap units" onClick={() => (setFrom(t), setTo(f))}>
					<ArrowLeftRight size={14} />
				</button>
				<div className="nt-card nt-grow">
					<div style={{ fontSize: 20, fontWeight: 600, color: "#8BE3F5" }}>{out}</div>
					<button type="button" className="nt-btn" style={{ marginTop: 4 }} onClick={() => cycle(t, setTo)} aria-label="Change the to unit">
						{t}
					</button>
				</div>
			</div>
		</div>
	);
}
