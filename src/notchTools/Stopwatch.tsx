import { useEffect, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import { useToolData } from "./useToolData";

/** Times are stored as timestamps, so a running stopwatch or Pomodoro keeps
 *  going while the tab is closed. */
type State = {
	mode: "stopwatch" | "pomodoro";
	/** Stopwatch: when it (re)started, and the time banked before that. */
	startedAt: number | null;
	banked: number;
	/** Pomodoro: when the current phase started (null = paused), how much of
	 *  it had passed when paused, and the phase number (even = focus). */
	phaseAt: number | null;
	phaseDone: number;
	phase: number;
};
const FOCUS = 25 * 60_000;
const BREAK = 5 * 60_000;
const LONG = 15 * 60_000;

const fmt = (ms: number) => {
	const s = Math.max(0, Math.floor(ms / 1000));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const r = s % 60;
	return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(r).padStart(2, "0")}`;
};

/** Stopwatch and Pomodoro (25 min focus, 5 min break, a long break every 4). */
export default function Stopwatch() {
	const [s, set] = useToolData<State>("stopwatch", { mode: "pomodoro", startedAt: null, banked: 0, phaseAt: null, phaseDone: 0, phase: 0 });
	const [, tick] = useState(0);
	useEffect(() => {
		const t = window.setInterval(() => tick((n) => n + 1), 500);
		return () => window.clearInterval(t);
	}, []);
	const now = Date.now();
	const length = s.phase % 2 === 0 ? FOCUS : s.phase % 8 === 7 ? LONG : BREAK;
	const elapsed = s.phaseDone + (s.phaseAt ? now - s.phaseAt : 0);
	// A finished phase moves on to the next one, paused.
	useEffect(() => {
		if (s.mode === "pomodoro" && s.phaseAt && elapsed >= length) set((p) => ({ ...p, phase: p.phase + 1, phaseAt: null, phaseDone: 0 }));
	});
	const running = s.mode === "stopwatch" ? s.startedAt !== null : s.phaseAt !== null;
	const toggle = () =>
		set((p) =>
			p.mode === "stopwatch"
				? p.startedAt
					? { ...p, startedAt: null, banked: p.banked + Date.now() - p.startedAt }
					: { ...p, startedAt: Date.now() }
				: p.phaseAt
					? { ...p, phaseAt: null, phaseDone: p.phaseDone + Date.now() - p.phaseAt }
					: { ...p, phaseAt: Date.now() }
		);
	const reset = () => set((p) => (p.mode === "stopwatch" ? { ...p, startedAt: null, banked: 0 } : { ...p, phaseAt: null, phaseDone: 0, phase: 0 }));
	const big = s.mode === "stopwatch" ? fmt(s.banked + (s.startedAt ? now - s.startedAt : 0)) : fmt(length - elapsed);
	const label = s.mode === "pomodoro" ? (s.phase % 2 === 0 ? `Focus ${Math.floor(s.phase / 2) % 4 + 1} of 4` : length === LONG ? "Long break" : "Break") : "Stopwatch";
	return (
		<div style={{ ["--tool-color" as string]: "#FFC94D", display: "contents" }}>
			<div className="nt-seg" role="group" aria-label="Mode">
				{(["pomodoro", "stopwatch"] as const).map((m) => (
					<button key={m} type="button" className={s.mode === m ? "on" : ""} onClick={() => set((p) => ({ ...p, mode: m }))}>
						{m === "pomodoro" ? "Pomodoro" : "Stopwatch"}
					</button>
				))}
			</div>
			<div className="nt-row">
				<div className="nt-big" style={{ color: "#FFC94D", fontSize: 36 }} aria-live="off">
					{big}
				</div>
				<div className="nt-grow nt-muted">{label}</div>
				<button type="button" className="nt-btn primary nt-icon-btn" style={{ width: 36, height: 36 }} aria-label={running ? "Pause" : "Start"} onClick={toggle}>
					{running ? <Pause size={16} /> : <Play size={16} />}
				</button>
				<button type="button" className="nt-btn nt-icon-btn" style={{ width: 36, height: 36 }} aria-label="Reset" onClick={reset}>
					<RotateCcw size={16} />
				</button>
			</div>
		</div>
	);
}
