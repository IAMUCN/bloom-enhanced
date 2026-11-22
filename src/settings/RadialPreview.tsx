// Settings › Radial Menu previews: one looping scene per option group, read
// from the live settings (localStorage mirrors every saved key).
import { useEffect, useState } from "react";
import { ProgressEffect, asProgressStyle } from "../components/ProgressEffect";

export type RadialScene = "r-trigger" | "r-drag" | "r-double" | "r-progress";

const on = (k: string, fallback = true) => {
	const v = localStorage.getItem(k);
	return v === null ? fallback : v !== "false";
};
const KEY_NAME: Record<string, string> = { shift: "Shift", ctrl: "Ctrl", alt: "Alt" };
const MENUS = ["Convert", "Tools", "Actions"];

/** 0..1 loop over `ms`. */
function useLoop(ms: number) {
	const [t, setT] = useState(0);
	useEffect(() => {
		const start = performance.now();
		const id = window.setInterval(() => setT(((performance.now() - start) % ms) / ms), 40);
		return () => window.clearInterval(id);
	}, [ms]);
	return t;
}
const between = (t: number, a: number, b: number) => t >= a && t < b;

function Key({ name, down }: { name: string; down: boolean }) {
	return <span className={`rp-key${down ? " down" : ""}`}>{name}</span>;
}

/** Six wedges around a hub; `open` scales it in, `pick` lights one wedge. */
function Ring({ open, hub, pick }: { open: boolean; hub: string; pick?: number }) {
	const c = 60;
	const wedge = (i: number) => {
		const a0 = ((i * 60 - 90 + 3) * Math.PI) / 180;
		const a1 = (((i + 1) * 60 - 90 - 3) * Math.PI) / 180;
		const p = (r: number, a: number) => `${c + r * Math.cos(a)} ${c + r * Math.sin(a)}`;
		return `M${p(56, a0)} A56 56 0 0 1 ${p(56, a1)} L${p(26, a1)} A26 26 0 0 0 ${p(26, a0)}Z`;
	};
	return (
		<svg width="120" height="120" className="rp-ring" style={{ opacity: open ? 1 : 0, transform: `scale(${open ? 1 : 0.6})` }}>
			{[0, 1, 2, 3, 4, 5].map((i) => (
				<path key={i} d={wedge(i)} className={pick === i ? "pick" : ""} />
			))}
			<text x={c} y={c + 4} textAnchor="middle">
				{hub}
			</text>
		</svg>
	);
}

export function RadialPreview({ scene }: { scene: RadialScene }) {
	const key = KEY_NAME[localStorage.getItem("bloom-files-key") ?? "shift"] ?? "Shift";
	const drag = on("bloom-files-drag");
	const doubleOn = on("bloom-files-shift-tap");
	const doubleMs = Number(localStorage.getItem("bloom-files-double-shift-ms")) || 400;
	const seconds = Number(localStorage.getItem("bloom-files-status-seconds")) || 2;
	const notchOn = on("bloom-notch-enabled");
	const atNotch = notchOn && localStorage.getItem("bloom-files-status-at") === "notch";
	const effect = asProgressStyle(localStorage.getItem("bloom-progress-effect"));
	const floating = localStorage.getItem("bloom-notch-style") === "pill";
	const cycle = scene === "r-progress" ? 2600 + seconds * 1000 : 4200;
	const t = useLoop(cycle);

	if (scene === "r-trigger") {
		const open = between(t, 0.2, 0.95);
		const second = t > 0.6;
		return (
			<div className="rp-stage">
				<div className="rp-row">
					<Key name={key} down={between(t, 0.15, 0.3) || between(t, 0.55, 0.68)} />
				</div>
				<Ring open={open} hub={MENUS[second ? 1 : 0]} />
				<p className="rp-cap">{`Tap ${key} to open the menu; tap it again to switch menus.`}</p>
			</div>
		);
	}

	if (scene === "r-drag") {
		const x = t < 0.4 ? -70 + (t / 0.4) * 70 : 0;
		const dropped = t > 0.85;
		return (
			<div className={`rp-stage${drag ? "" : " off"}`}>
				<div className="rp-ringwrap">
					<Ring open={between(t, 0.45, 0.88)} hub="Convert" pick={dropped ? 1 : between(t, 0.7, 0.88) ? 1 : undefined} />
					<span className="rp-file" style={{ transform: `translate(${dropped ? 30 : x}px, ${dropped ? -34 : 0}px) scale(${dropped ? 0.4 : 1})`, opacity: dropped ? 0 : 1 }}>
						IMG
					</span>
				</div>
				<div className="rp-row">
					<Key name={key} down={between(t, 0.4, 0.5)} />
				</div>
				<p className="rp-cap">{drag ? `Dragging a file? Tap ${key}, then let go on an option.` : "Off: dragging never opens the menu."}</p>
			</div>
		);
	}

	if (scene === "r-double") {
		const gap = 0.22 * (doubleMs / 400);
		const t1 = 0.15;
		const t2 = t1 + gap;
		const open = t > t2 + 0.03 && t < 0.95;
		return (
			<div className={`rp-stage${doubleOn ? "" : " off"}`}>
				<div className="rp-explorer">
					<span className="sel">report.pdf</span>
					<span>notes.txt</span>
				</div>
				<div className="rp-row">
					<Key name={key} down={between(t, t1, t1 + 0.07) || between(t, t2, t2 + 0.07)} />
					<span className="rp-timer">
						<i style={{ width: `${(doubleMs / 800) * 100}%` }} />
					</span>
					<small>{doubleMs} ms</small>
				</div>
				<Ring open={open} hub="Convert" />
				<p className="rp-cap">{doubleOn ? `Press ${key} twice within ${doubleMs} ms with files selected.` : "Off: selected files never open the menu."}</p>
			</div>
		);
	}

	// progress
	const runEnd = 2400 / cycle;
	const pct = t < runEnd ? (t / runEnd) * 100 : 100;
	const done = t >= runEnd;
	return (
		<div className="rp-stage">
			{atNotch ? (
				<div className={`rp-notch${floating ? " floating" : ""}`}>
					<ProgressEffect style={effect} percent={pct} result={done ? "ok" : null} full={floating} />
					<span>{done ? "Done" : `${Math.round(pct)}%`}</span>
				</div>
			) : (
				<div className="rp-pointer">
					<svg width="18" height="18" viewBox="0 0 18 18"><path d="M3 2l11 6-5 1.5L7 15z" fill="#fff" stroke="#000" strokeWidth="1" /></svg>
					<span className={done ? "ok" : ""}>{done ? "Done" : `${Math.round(pct)}%`}</span>
				</div>
			)}
			<p className="rp-cap">
				{`${atNotch ? "On the notch" : "At the pointer"}; the result stays for ${seconds} s.`}
			</p>
		</div>
	);
}
