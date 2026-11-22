// Settings › Radial Menu previews: one looping scene per option group, read
// from the live settings (localStorage mirrors every saved key).
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SPEEDS, lag, timing } from "../orbitMotion";
import { ProgressEffect, asProgressStyle } from "../components/ProgressEffect";

export type RadialScene = "r-trigger" | "r-drag" | "r-double" | "r-progress" | "r-anim" | "r-chain";

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
		<svg width="120" height="120" className="rp-ring" style={{ opacity: open ? 1 : 0, transform: `scale(${open ? 1 : 0.4})` }}>
			{[0, 1, 2, 3, 4, 5].map((i) => (
				<path key={i} d={wedge(i)} className={pick === i ? "pick" : ""} />
			))}
			<text x={c} y={c + 4} textAnchor="middle">
				{hub}
			</text>
		</svg>
	);
}

/** The slices of a small wheel, as in `Ring`. */
const wedgePath = (i: number) => {
	const c = 60;
	const a0 = ((i * 60 - 90 + 3) * Math.PI) / 180;
	const a1 = (((i + 1) * 60 - 90 - 3) * Math.PI) / 180;
	const p = (r: number, a: number) => `${c + r * Math.cos(a)} ${c + r * Math.sin(a)}`;
	return `M${p(56, a0)} A56 56 0 0 1 ${p(56, a1)} L${p(26, a1)} A26 26 0 0 0 ${p(26, a0)}Z`;
};

/** The menu's opening, switching and pick animations, as the real menu plays
 *  them with the Menu Animation switches and speed (read on every step). */
function AnimDemo() {
	const [n, setN] = useState(0);
	useEffect(() => {
		const id = window.setInterval(() => setN((x) => x + 1), 1800);
		return () => window.clearInterval(id);
	}, []);
	const phase = n % 4; // 0 opens, 1 switches, 2 picks, 3 rests
	const openOn = on("bloom-files-anim-open");
	const switchOn = on("bloom-files-anim-switch");
	const closeOn = on("bloom-files-anim-close");
	const f = (SPEEDS as Record<string, number>)[localStorage.getItem("bloom-files-anim-speed") ?? ""] ?? 1;
	const T = timing(f);
	const caption = [
		`1 · It opens: the circle grows in and the options swing into place.${openOn ? "" : " (Opening is off)"}`,
		`2 · Press Shift: the menu changes and the options swing in again.${switchOn ? "" : " (Switching Menu is off)"}`,
		`3 · Let go on an option: the menu pops and fades, then the job starts.${closeOn ? "" : " (Picking An Option is off)"}`,
		"…and it is ready for the next time."
	][phase];
	const key = Math.floor(n / 4) * 2 + (phase >= 1 ? 1 : 0);
	return (
		<div className="rp-stage">
			<motion.div
				key={key}
				initial={openOn ? { scale: 0.4, opacity: 0 } : false}
				animate={phase === 2 && closeOn ? { scale: 1.04, opacity: 0 } : phase === 3 ? { scale: 1, opacity: 0 } : { scale: 1, opacity: 1 }}
				transition={phase === 2 && closeOn ? { duration: T.pop / 1000, ease: "easeIn", delay: 0.5 } : T.bloom}
				style={{ width: 120, height: 120 }}
			>
				<svg width="120" height="120" className="rp-ring">
					{[0, 1, 2, 3, 4, 5].map((i) => (
						<motion.path
							key={i}
							d={wedgePath(i)}
							style={{ transformOrigin: "60px 60px", transformBox: "view-box" }}
							initial={switchOn ? { rotate: -16, opacity: 0 } : false}
							animate={{ rotate: 0, opacity: 1 }}
							transition={{ ...T.slice, delay: lag(i, 6, f) }}
						/>
					))}
					<text x="60" y="64" textAnchor="middle">
						{phase === 1 ? "Tools" : "Convert"}
					</text>
				</svg>
			</motion.div>
			<p className="rp-cap">{caption}</p>
		</div>
	);
}

/** Chaining two options: Invert, then PDF. */
const CHAIN_STEPS: { hub: string; pick?: number; keys: string[]; chain: string[]; run?: number; done?: boolean; cap: string }[] = [
	{ hub: "Convert", keys: ["Shift", "Shift"], chain: [], cap: "Select an image and press Shift twice: the menu opens." },
	{ hub: "Tools", keys: ["Shift"], chain: [], cap: "Press Shift to go to the Tools menu." },
	{ hub: "Invert", pick: 2, keys: ["Ctrl"], chain: [], cap: "Hold Ctrl and move to Invert." },
	{ hub: "Invert", pick: 2, keys: [], chain: ["Invert"], cap: "Let go of Ctrl on Invert: it joins the chain. A tag by the pointer and the notch show it." },
	{ hub: "Convert", keys: ["Shift"], chain: ["Invert"], cap: "Press Shift to switch menu. It lists only what fits an inverted image." },
	{ hub: "PDF", pick: 4, keys: ["Ctrl"], chain: ["Invert"], cap: "Hold Ctrl and move to PDF." },
	{ hub: "PDF", pick: 4, keys: [], chain: ["Invert", "PDF"], cap: "Let go of Ctrl on PDF: the chain is now Invert › PDF." },
	{ hub: "Run", keys: ["Mouse"], chain: ["Invert", "PDF"], cap: "Let go of the mouse in the middle (or click an option): all the steps run, in order." },
	{ hub: "", keys: [], chain: ["Invert", "PDF"], run: 55, cap: "The notch shows the progress. Esc cancels the lot." },
	{ hub: "", keys: [], chain: [], done: true, cap: "Done: one PDF of the inverted image. The steps in between are cleaned up." }
];

function ChainDemo({ ctrl }: { ctrl: string }) {
	const [i, setI] = useState(0);
	useEffect(() => {
		const id = window.setInterval(() => setI((x) => (x + 1) % CHAIN_STEPS.length), 1700);
		return () => window.clearInterval(id);
	}, []);
	const s = CHAIN_STEPS[i];
	const running = s.run !== undefined || !!s.done;
	return (
		<div className="rp-stage">
			<div className="rp-row">
				<div className="rp-ringwrap" style={{ width: 120, height: 120, opacity: running ? 0.15 : 1, transition: "opacity .2s" }}>
					<Ring open hub={s.hub} pick={s.pick} />
				</div>
				<div className="rp-chain">
					<div className="rp-keys">
						{s.keys.map((k, j) => (
							<Key key={`${k}${j}`} name={k === "Ctrl" ? ctrl : k} down />
						))}
					</div>
					<div className="rp-chips">
						{s.chain.map((c) => (
							<span key={c} className="rp-chip">
								{c}
							</span>
						))}
						{s.chain.length > 0 && <span className="rp-chip faint">›</span>}
						{s.run !== undefined && <span className="rp-chip ok">{s.run}%</span>}
						{s.done && <span className="rp-chip ok">photo.pdf</span>}
					</div>
				</div>
			</div>
			<p className="rp-cap">{s.cap}</p>
		</div>
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
	if (scene === "r-anim") return <AnimDemo />;
	if (scene === "r-chain") return <ChainDemo ctrl={key === "Ctrl" ? "Shift" : "Ctrl"} />;

	if (scene === "r-trigger") {
		// Two quick presses open it (one while dragging); one more switches menus.
		const open = between(t, 0.34, 0.95);
		const second = t > 0.72;
		return (
			<div className="rp-stage">
				<div className="rp-row">
					<Key name={key} down={between(t, 0.12, 0.2) || between(t, 0.25, 0.33) || between(t, 0.66, 0.74)} />
				</div>
				<Ring open={open} hub={MENUS[second ? 1 : 0]} />
				<p className="rp-cap">{`Press ${key} twice with files selected (once while dragging) to open the menu; press it once to switch menus.`}</p>
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
					<ProgressEffect style={effect} percent={pct} result={done ? "ok" : null} full={floating} shape={{ width: 170, height: 38, radius: 18, flares: !floating }} />
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
