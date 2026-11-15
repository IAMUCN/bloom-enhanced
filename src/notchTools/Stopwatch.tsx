import { useEffect, useState } from "react";
import { Minus, Pause, Play, Plus, RotateCcw } from "lucide-react";
import { useToolData } from "./useToolData";

type Mode = "timer" | "stopwatch" | "pomodoro";

/** Times are stored as timestamps, so a running timer keeps going while the
 *  tab is closed. */
type State = {
	mode: Mode;
	/** Stopwatch: when it (re)started, and the time banked before that. */
	startedAt: number | null;
	banked: number;
	/** Pomodoro: when the current phase started (null = paused), how much of
	 *  it had passed when paused, and the phase number (even = focus). */
	phaseAt: number | null;
	phaseDone: number;
	phase: number;
	/** Timer: its length, when it (re)started and the time it had run. */
	timerLength?: number;
	timerAt?: number | null;
	timerDone?: number;
	/** The start time of the run that just finished, so the notch rings for
	 *  it even if this tab saw the end first. */
	finishedFor?: number | null;
	/** When the last run ended: TIME'S UP shows for a while, then the timer
	 *  is back to its full length. */
	finishedAt?: number | null;
};
/** How long TIME'S UP stays before the timer resets itself. */
const TIMES_UP_MS = 12_000;
const MIN = 60_000;
const FOCUS = 25 * MIN;
const BREAK = 5 * MIN;
const LONG = 15 * MIN;
const PRESETS = [5, 15, 25, 50];

/** Countdowns round up (5:00 stays 5:00 for its first second); the
 *  stopwatch rounds down, so it starts at 0:00. */
const fmt = (ms: number, up = true) => {
	const s = Math.max(0, up ? Math.ceil(ms / 1000) : Math.floor(ms / 1000));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const r = s % 60;
	return `${h ? `${h}:` : ""}${String(m).padStart(h ? 2 : 1, "0")}:${String(r).padStart(2, "0")}`;
};

const MODES: [Mode, string][] = [
	["timer", "Timer"],
	["stopwatch", "Stopwatch"],
	["pomodoro", "Pomodoro"]
];

/** Timer (countdown with presets), Stopwatch, and Pomodoro (25 min focus,
 *  5 min break, a long break every 4). Everything centred. */
export default function Stopwatch() {
	const [s, set] = useToolData<State>("stopwatch", { mode: "timer", startedAt: null, banked: 0, phaseAt: null, phaseDone: 0, phase: 0 });
	const [, tick] = useState(0);
	useEffect(() => {
		const t = window.setInterval(() => tick((n) => n + 1), 250);
		return () => window.clearInterval(t);
	}, []);
	const now = Date.now();
	const timerLength = s.timerLength ?? 5 * MIN;
	const timerLeft = timerLength - (s.timerDone ?? 0) - (s.timerAt ? now - s.timerAt : 0);
	const length = s.phase % 2 === 0 ? FOCUS : s.phase % 8 === 7 ? LONG : BREAK;
	const elapsed = s.phaseDone + (s.phaseAt ? now - s.phaseAt : 0);
	// A finished Pomodoro phase moves on to the next one, paused; a finished
	// timer stops at zero.
	useEffect(() => {
		if (s.mode === "pomodoro" && s.phaseAt && elapsed >= length) set((p) => ({ ...p, phase: p.phase + 1, phaseAt: null, phaseDone: 0 }));
		if (s.timerAt && timerLeft <= 0)
			set((p) => ({ ...p, timerAt: null, timerDone: p.timerLength ?? 5 * MIN, finishedFor: p.timerAt, finishedAt: Date.now() }));
		// After TIME'S UP has shown for a while, back to a fresh timer.
		if (!s.timerAt && s.finishedAt && now - s.finishedAt > TIMES_UP_MS) set((p) => ({ ...p, timerDone: 0, finishedAt: null }));
		// A run that ended before finishedAt existed: reset it the same way.
		if (!s.timerAt && !s.finishedAt && (s.timerDone ?? 0) >= timerLength) set((p) => ({ ...p, timerDone: 0 }));
	});

	const running = s.mode === "stopwatch" ? s.startedAt !== null : s.mode === "pomodoro" ? s.phaseAt !== null : !!s.timerAt;
	const toggle = () =>
		set((p) => {
			if (p.mode === "stopwatch")
				return p.startedAt ? { ...p, startedAt: null, banked: p.banked + Date.now() - p.startedAt } : { ...p, startedAt: Date.now() };
			if (p.mode === "pomodoro")
				return p.phaseAt ? { ...p, phaseAt: null, phaseDone: p.phaseDone + Date.now() - p.phaseAt } : { ...p, phaseAt: Date.now() };
			// Timer: a finished one starts over.
			const len = p.timerLength ?? 5 * MIN;
			if (p.timerAt) return { ...p, timerAt: null, timerDone: (p.timerDone ?? 0) + Date.now() - p.timerAt };
			return { ...p, timerAt: Date.now(), timerDone: (p.timerDone ?? 0) >= len ? 0 : (p.timerDone ?? 0), finishedAt: null };
		});
	const reset = () =>
		set((p) =>
			p.mode === "stopwatch"
				? { ...p, startedAt: null, banked: 0 }
				: p.mode === "pomodoro"
					? { ...p, phaseAt: null, phaseDone: 0, phase: 0 }
					: { ...p, timerAt: null, timerDone: 0, finishedAt: null }
		);
	const setLength = (minutes: number) =>
		set((p) => ({ ...p, timerLength: Math.max(1, Math.min(180, minutes)) * MIN, timerAt: null, timerDone: 0, finishedAt: null }));

	const big =
		s.mode === "stopwatch"
			? fmt(s.banked + (s.startedAt ? now - s.startedAt : 0), false)
			: s.mode === "pomodoro"
				? fmt(length - elapsed)
				: fmt(timerLeft);
	const label =
		s.mode === "pomodoro"
			? s.phase % 2 === 0
				? `Focus ${(Math.floor(s.phase / 2) % 4) + 1} of 4`
				: length === LONG
					? "Long break"
					: "Break"
			: s.mode === "timer"
				? s.finishedAt && now - s.finishedAt <= TIMES_UP_MS
					? "Time's up"
					: running
						? "Running"
						: `${Math.round(timerLength / MIN)} min timer`
				: "Stopwatch";
	const editable = s.mode === "timer" && !running;

	return (
		<div className="nt-timers" style={{ ["--tool-color" as string]: "#FFC94D" }}>
			<div className="nt-seg" role="group" aria-label="Mode">
				{MODES.map(([m, name]) => (
					<button key={m} type="button" className={s.mode === m ? "on" : ""} onClick={() => set((p) => ({ ...p, mode: m }))}>
						{name}
					</button>
				))}
			</div>
			<div className="nt-timer-face">
				{editable && (
					<button type="button" className="nt-btn nt-icon-btn" aria-label="One minute less" onClick={() => setLength(Math.round(timerLength / MIN) - 1)}>
						<Minus size={14} />
					</button>
				)}
				<div className="nt-big" style={{ color: "#FFC94D", fontSize: 36 }} aria-live="off">
					{big}
				</div>
				{editable && (
					<button type="button" className="nt-btn nt-icon-btn" aria-label="One minute more" onClick={() => setLength(Math.round(timerLength / MIN) + 1)}>
						<Plus size={14} />
					</button>
				)}
			</div>
			<div className={label === "Time's up" ? "nt-times-up" : "nt-muted"}>{label === "Time's up" ? "TIME'S UP" : label}</div>
			<div className="nt-timer-actions">
				{editable &&
					PRESETS.map((m) => (
						<button key={m} type="button" className={`nt-chip${Math.round(timerLength / MIN) === m ? " on" : ""}`} onClick={() => setLength(m)}>
							{m}m
						</button>
					))}
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
