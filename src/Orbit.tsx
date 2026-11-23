// The radial menu (`orbit` window), OrbitDrop's menu in Bloom's look.
// The backend (orbit.rs) opens this window around the pointer when Shift is
// tapped during a drag (files or selected text), on a Shift tap with files
// selected, or on the shortcut. Letting the drag go on an option (or clicking
// one) runs it; the status then shows as a pill here or in the notch
// (`bloom-files-status-at`) with the percentage until the job is done.
import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { AnimatePresence, motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CircleAlert, CircleCheck, CircleSlash, X } from "lucide-react";
import {
	HUB,
	INNER_R,
	MODE_LABEL,
	OUTER_R,
	formatRanges,
	hitTest,
	modesFor,
	parseRanges,
	splitPresets,
	opsFor,
	parseLayout,
	type OrbitInput,
	type OrbitLayout,
	type OrbitMode,
	type OrbitOp,
	type OrbitResult,
	type OrbitStatus
} from "./orbitOps";
import { SPEEDS, lag, timing } from "./orbitMotion";
import { chainAfter, chainStep, chainValid, makesFiles, opById, opLabel } from "./orbitOps";
import { ORBIT_ICONS } from "./orbitIcons";
import { useSettingsSync } from "./hooks/useSettingsSync";
import { initTheme } from "./theme";
import "./Orbit.css";
import "./lightFixes.css";
import "./accentFixes.css";
import { useHideFromCapture } from "./hooks/useHideFromCapture";


const SIZE = 360;
const C = SIZE / 2;
const GAP = 2.5; // degrees between slices
const STATUS = { width: 300, height: 64 };
// Bloom's springy micro-motion.
/** OrbitDrop's wheel: it opens by growing from 0.4 to full size with a small
 *  overshoot in 170 ms while fading in over 110 ms (WPF BackEase 0.3). */
const BLOOM = timing(1).bloom;
/** OrbitDrop's confirmed pick: the wheel pops to 104% and fades in 90 ms. */
const SPRING = { type: "spring", stiffness: 480, damping: 24 } as const;
const ORIGIN = { transformOrigin: `${C}px ${C}px`, transformBox: "view-box" } as const;

document.addEventListener("contextmenu", (e) => e.preventDefault());

interface Outcome {
	source: string;
	output: string | null;
	error: string | null;
}

type Result = OrbitResult;
type Phase =
	| { kind: "closed" }
	| { kind: "wheel" }
	/** percent is null while a folder picker is open (Copy to / Move to). */
	| { kind: "running"; op: OrbitOp; percent: number | null }
	/** Split asks which pages first; pages is null while they are counted. */
	| { kind: "ranges"; op: OrbitOp; input: OrbitInput; pages: number | null }
	/** Resize asks for the size first. */
	| { kind: "size"; op: OrbitOp; input: OrbitInput; /** adding Resize to a chain, not running it */ add?: boolean }
	| { kind: "done"; text: string; result: Result };

const point = (r: number, deg: number) => {
	const a = (deg * Math.PI) / 180;
	return [C + r * Math.cos(a), C + r * Math.sin(a)];
};

/** An annular slice from a0 to a1 degrees (0 = 3 o'clock, clockwise). */
function slicePath(a0: number, a1: number) {
	const large = a1 - a0 > 180 ? 1 : 0;
	const [x0, y0] = point(OUTER_R, a0);
	const [x1, y1] = point(OUTER_R, a1);
	const [x2, y2] = point(INNER_R, a1);
	const [x3, y3] = point(INNER_R, a0);
	return `M${x0} ${y0} A${OUTER_R} ${OUTER_R} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${INNER_R} ${INNER_R} 0 ${large} 0 ${x3} ${y3}Z`;
}

const fileName = (p: string) => p.split(/[\\/]/).pop() ?? p;
const PICKS_FOLDER = ["action.copy-to", "action.move-to"];
const hasInput = (input: OrbitInput) => input.paths.length > 0 || !!input.text;
const shrink = () => invoke("orbit_shrink", STATUS).catch(() => {});

type DragPayload = { paths?: string[]; text?: string; position: { x: number; y: number } };
const inputOf = (p: DragPayload): OrbitInput => (p.paths ? { paths: p.paths } : { paths: [], text: p.text });

const RESULT_ICON = { ok: CircleCheck, failed: CircleAlert, canceled: CircleSlash };

function Orbit() {
	useHideFromCapture("bloom-files-hide-from-capture", true);
	const [phase, setPhase] = useState<Phase>({ kind: "closed" });
	const [input, setInput] = useState<OrbitInput>({ paths: [] });
	const [mode, setMode] = useState<OrbitMode>("convert");
	const [hover, setHover] = useState(HUB);
	// Settings › Radial Menu.
	const [raw, setRaw] = useState<Record<string, unknown>>({});
	const layout: OrbitLayout = parseLayout(raw["bloom-files-hidden"], raw["bloom-files-order"], raw["bloom-files-mode-order"]);
	// Progress goes to the notch only while there is one.
	const inNotch =
		raw["bloom-files-status-at"] === "notch" && raw["bloom-notch-enabled"] !== false && raw["bloom-notch-enabled"] !== "false";
	const seconds = Number(raw["bloom-files-status-seconds"]) || 2;
	// Bumped on every open and menu switch: the whole wheel is made again, so the
	// disc grows in and the slices turn in each time (OrbitDrop).
	const [bloomKey, setBloomKey] = useState(0);
	// A chain: options added with Ctrl, run one after another on what the one before made.
	const [chain, setChain] = useState<string[]>([]);
	const [chainNote, setChainNote] = useState<string | null>(null);
	// The pointer inside the wheel: the chain follows it as a small tag.
	const [ptr, setPtr] = useState<{ x: number; y: number } | null>(null);
	const phaseRef = useRef(phase);
	phaseRef.current = phase;
	const hoverRef = useRef(hover);
	hoverRef.current = hover;
	const state = useRef({ input, mode, layout, inNotch, seconds, chain });
	state.current = { input, mode, layout, inNotch, seconds, chain };
	/** What the options are listed for: the files after the chain so far. */
	const viewOf = () => chainAfter(state.current.input, state.current.chain) ?? state.current.input;

	useEffect(() => initTheme(), []);
	useEffect(() => {
		invoke<Record<string, string>>("load_settings")
			.then(setRaw)
			.catch(() => {});
	}, []);
	const keep = (key: string) => (v: unknown) => setRaw((r) => ({ ...r, [key]: v }));
	useSettingsSync({
		"bloom-files-hidden": keep("bloom-files-hidden"),
		"bloom-files-order": keep("bloom-files-order"),
		"bloom-files-mode-order": keep("bloom-files-mode-order"),
		"bloom-files-status-at": keep("bloom-files-status-at"),
		"bloom-notch-enabled": keep("bloom-notch-enabled"),
		"bloom-files-status-seconds": keep("bloom-files-status-seconds"),
		"bloom-files-anim-open": keep("bloom-files-anim-open"),
		"bloom-files-anim-switch": keep("bloom-files-anim-switch"),
		"bloom-files-anim-close": keep("bloom-files-anim-close"),
		"bloom-files-anim-speed": keep("bloom-files-anim-speed"),
		"bloom-files-chain-at": keep("bloom-files-chain-at")
	});
	// Animations (Settings › Radial Menu › Menu Animation), each on by default.
	const animOf = (key: string) => raw[key] !== false && raw[key] !== "false";
	const animOpen = animOf("bloom-files-anim-open");
	const animSwitch = animOf("bloom-files-anim-switch");
	const animClose = animOf("bloom-files-anim-close");
	// Where the chain shows while it is built: on the notch or by the cursor, never both.
	const chainOnNotch = raw["bloom-files-chain-at"] !== "cursor" && raw["bloom-notch-enabled"] !== false && raw["bloom-notch-enabled"] !== "false";
	const chainOnNotchRef = useRef(chainOnNotch);
	chainOnNotchRef.current = chainOnNotch;
	const speed = (SPEEDS as Record<string, number>)[String(raw["bloom-files-anim-speed"])] ?? 1;
	const T = timing(speed);
	const popMsRef = useRef(T.pop);
	popMsRef.current = T.pop;
	const animCloseRef = useRef(animClose);
	animCloseRef.current = animClose;
	// A confirmed pick: the wheel pops (grows 4%) and fades for 90 ms before the job starts.
	const [popping, setPopping] = useState(false);
	// Set when the user cancels a job: whatever the job returns afterwards is not shown (no red flash).
	const cancelledJob = useRef(false);

	/** Modes for the current input; before a drag has entered, every mode. */
	const modesNow = useCallback(() => {
		const { input, layout, chain } = state.current;
		const view = chainAfter(input, chain) ?? input;
		return hasInput(view) ? modesFor(view, layout) : layout.modes;
	}, []);
	const modes = modesNow();
	const viewInput = chainAfter(input, chain) ?? input;
	const ops = opsFor(viewInput, mode, layout);

	const close = useCallback(() => {
		setChain([]);
		setPhase({ kind: "closed" });
		invoke("orbit_close").catch(() => {});
	}, []);

	const cycle = useCallback(() => {
		const list = modesNow();
		setBloomKey((k) => k + 1);
		setMode((m) => list[(list.indexOf(m) + 1) % list.length] ?? m);
		setHover(HUB);
	}, [modesNow]);

	// The chain being built shows on the notch ("Invert › PDF ›") while the wheel is open.
	useEffect(() => {
		if (!chainOnNotchRef.current || phase.kind !== "wheel") return;
		const status: OrbitStatus = chain.length ? { text: `${chain.map(opLabel).join(" › ")} ›`, percent: null, result: null } : null;
		emitTo("main", "orbit-status", status).catch(() => {});
	}, [chain, phase.kind, chainOnNotch]);

	// The status goes to the notch instead: this window steps out of the way.
	useEffect(() => {
		if (!state.current.inNotch) return;
		let status: OrbitStatus = null;
		if (phase.kind === "running" && phase.percent !== null)
			status = { text: phase.op.progress, percent: phase.percent, result: null };
		else if (phase.kind === "done") status = { text: phase.text, percent: null, result: phase.result };
		if (status) invoke("orbit_hide").catch(() => {});
		if (phase.kind !== "wheel") emitTo("main", "orbit-status", status).catch(() => {});
	}, [phase]);

	const finish = useCallback(
		(text: string, result: Result) => {
			// After a cancel nothing else may report: no failure over "Canceled".
			if (cancelledJob.current && result !== "canceled") return;
			setPhase({ kind: "done", text, result });
			if (!state.current.inNotch) shrink();
			const s = state.current.seconds;
			const ms = result === "canceled" ? 900 : result === "failed" ? (s + 2) * 1000 : s * 1000;
			setTimeout(() => {
				if (phaseRef.current.kind === "done") close();
			}, ms);
		},
		[close]
	);

	/** A short message in the hub ("Cannot perform the action"). */
	const flash = useCallback((text: string) => {
		setChainNote(text);
		window.setTimeout(() => setChainNote((n) => (n === text ? null : n)), 1500);
	}, []);

	const run = useCallback(
		async (op: OrbitOp, input: OrbitInput, steps: string[] = state.current.chain, popped = false) => {
			if (!popped && animCloseRef.current && phaseRef.current.kind === "wheel") {
				setPopping(true);
				await new Promise((done) => setTimeout(done, popMsRef.current));
				setPopping(false);
			}
			// Dragged text: copying it is what records it, so it lands in the
			// shelf once and is also on the clipboard.
			const ids = [...steps, op.id];
			if (!chainValid(input, ids)) {
				setPopping(false);
				flash("Cannot perform the action");
				return;
			}
			if (input.text) {
				// Text chains: the upper/lower steps are applied in turn, then the last option acts.
				let t = input.text;
				// Save .txt in the middle: the text is saved, then the rest acts on the file.
				const saveAt = ids.indexOf("text.save");
				for (const id of saveAt < 0 ? steps : ids.slice(0, saveAt))
					t = id === "text.upper" ? t.toUpperCase() : id === "text.lower" ? t.toLowerCase() : t;
				try {
					if (saveAt >= 0 && saveAt < ids.length - 1) {
						const path = await invoke<string>("orbit_save_text", { text: t });
						const rest = ids.slice(saveAt + 1);
						const last = opById(rest[rest.length - 1]);
						if (last) return run(last, { paths: [path] }, rest.slice(0, -1), true);
					}
					if (op.id === "text.upper") {
						await writeText(t.toUpperCase());
						finish("Copied in UPPER CASE", "ok");
					} else if (op.id === "text.lower") {
						await writeText(t.toLowerCase());
						finish("Copied in lower case", "ok");
					} else if (op.id === "text.count") {
						const words = t.trim() ? t.trim().split(/\s+/).length : 0;
						finish(`${words} word${words === 1 ? "" : "s"} · ${t.length} characters`, "ok");
					} else if (op.id === "text.search") {
						await openUrl(`https://www.google.com/search?q=${encodeURIComponent(t.trim().slice(0, 500))}`);
						finish("Searching the web", "ok");
					} else if (op.id === "text.save") {
						const path = await invoke<string>("orbit_save_text", { text: t });
						finish(`Saved ${fileName(path)}`, "ok");
					} else {
						await writeText(t);
						finish("Added to the shelf and copied", "ok");
					}
				} catch (e) {
					finish(String(e), "failed");
				}
				return;
			}
			if (op.id === "tool.image.resize") {
				setPhase({ kind: "size", op, input });
				return;
			}
			// Split asks for the page ranges first (the colon form carries them).
			if (op.id === "tool.pdf.split") {
				setPhase({ kind: "ranges", op, input, pages: null });
				try {
					const pages = await invoke<number>("orbit_pdf_pages", { paths: input.paths });
					setPhase((p) => (p.kind === "ranges" ? { ...p, pages } : p));
				} catch (e) {
					finish(String(e), "failed");
				}
				return;
			}
			const picking = PICKS_FOLDER.includes(op.id);
			cancelledJob.current = false;
			setPhase({ kind: "running", op, percent: picking ? null : 0 });
			if (!picking && !state.current.inNotch) shrink();
			let text: string;
			let result: Result = "ok";
			try {
				const outcomes = await invoke<Outcome[]>("orbit_run", { ops: ids, paths: input.paths });
				// Already shown as Canceled (Esc or ×): the rest finished quietly.
				if (cancelledJob.current || phaseRef.current.kind !== "running") return;
				const errors = outcomes.filter((o) => o.error);
				const outputs = outcomes.flatMap((o) => (o.output ? [o.output] : []));
				if (errors.length && errors.every((o) => o.error === "Canceled")) {
					text = "Canceled";
					result = "canceled";
				} else if (errors.length) {
					result = "failed";
					const name = fileName(errors[0].source);
					text =
						outcomes.length === 1
							? `${name}: ${errors[0].error}`
							: `${errors.length} of ${outcomes.length} failed. ${name}: ${errors[0].error}`;
				} else if (outputs.length === 1) text = `Saved ${fileName(outputs[0])}`;
				else if (outputs.length) text = `Saved ${outputs.length} files`;
				else text = op.id === "action.shelf" ? "Added to the shelf and copied" : ids.length > 1 ? `${ids.map(opLabel).join(" › ")}: done` : `${op.label}: done`;
			} catch (e) {
				result = "failed";
				text = String(e);
			}
			finish(text, result);
		},
		[finish, flash]
	);

	useEffect(() => {
		// Points arrive in physical client pixels.
		const hitAt = (x: number, y: number, input = viewOf()) => {
			const { mode, layout } = state.current;
			return hitTest(x / devicePixelRatio - C, y / devicePixelRatio - C, opsFor(input, mode, layout).length);
		};
		/** Runs the steps chosen so far (the last one acts as the option). False when there are none. */
		const runChainNow = (input = state.current.input) => {
			const { chain } = state.current;
			const last = chain.length ? opById(chain[chain.length - 1]) : undefined;
			if (!last) return false;
			// The steps are passed along: re-rendering would reset state.current.chain.
			run(last, input, chain.slice(0, -1));
			return true;
		};
		const offs = [
			listen<{ paths: string[]; drag: boolean }>("orbit-open", (e) => {
				const next = { paths: e.payload.paths };
				setInput(next);
				state.current.input = next;
				cancelledJob.current = false;
				state.current.chain = [];
				setChain([]);
				setChainNote(null);
				setMode(modesNow()[0] ?? "convert");
				setHover(HUB);
				setBloomKey((k) => k + 1);
				setPopping(false);
				setPhase({ kind: "wheel" });
			}),
			listen("orbit-canceled", () => {
				if (phaseRef.current.kind === "running") {
					cancelledJob.current = true;
					finish("Canceled", "canceled");
				}
			}),
			listen("orbit-close", () => {
				if (phaseRef.current.kind === "wheel" || phaseRef.current.kind === "ranges") setPhase({ kind: "closed" });
			}),
			listen("orbit-shift", () => {
				if (phaseRef.current.kind === "wheel") cycle();
			}),
			// Backspace: one step back.
			listen("orbit-back", () => {
				if (phaseRef.current.kind !== "wheel" || !state.current.chain.length) return;
				const next = state.current.chain.slice(0, -1);
				state.current.chain = next;
				setChain(next);
				setHover(HUB);
				setBloomKey((k) => k + 1);
				const after = chainAfter(state.current.input, next) ?? state.current.input;
				setMode(hasInput(after) ? (modesFor(after, state.current.layout)[0] ?? "convert") : "convert");
			}),
			// The chain key is let go: on an option it joins the chain; in the middle it
			// runs the chain as it is. (Backspace takes the last step back.)
			listen("orbit-add", () => {
				if (phaseRef.current.kind !== "wheel") return;
				const { input, mode, layout, chain } = state.current;
				if (!hasInput(input)) return;
				const view = chainAfter(input, chain) ?? input;
				const list = opsFor(view, mode, layout);
				const at = hoverRef.current;
				const setTo = (next: string[]) => {
					state.current.chain = next;
					setChain(next);
					setHover(HUB);
					setBloomKey((k) => k + 1);
					const after = chainAfter(input, next) ?? input;
					setMode(hasInput(after) ? (modesFor(after, layout)[0] ?? "convert") : "convert");
				};
				if (at === HUB) {
					runChainNow(input);
					return;
				}
				const op = list[at];
				if (!op) return;
				if (op.id === "tool.pdf.split") return flash("Click it to run it last");
				if (op.id === "tool.image.resize") {
					if (chainStep(view, op.id, chain.some(makesFiles)) === false) return flash("Cannot perform the action");
					return setPhase({ kind: "size", op, input: view, add: true });
				}
				const changed = chain.some(makesFiles);
				const next = chainStep(view, op.id, changed);
				if (next === false) return flash("Cannot perform the action");
				if (next === null) return flash("Click it to run it last");
				setTo([...chain, op.id]);
			}),
			listen<number>("orbit-progress", (e) => {
				const p = phaseRef.current;
				if (p.kind !== "running") return;
				if (p.percent === null && !state.current.inNotch) shrink();
				setPhase({ ...p, percent: e.payload });
			}),
			listen<DragPayload>("orbit-drag-enter", (e) => {
				if (phaseRef.current.kind !== "wheel") return;
				const next = inputOf(e.payload);
				const { input } = state.current;
				if (next.paths.join("|") !== input.paths.join("|") || next.text !== input.text) {
					setInput(next);
					state.current.input = next;
					const list = modesNow();
					if (!list.includes(state.current.mode)) setMode(list[0] ?? "actions");
				}
				setHover(hitAt(e.payload.position.x, e.payload.position.y));
			}),
			listen<{ x: number; y: number }>("orbit-drag-over", (e) => {
				setHover(hitAt(e.payload.x, e.payload.y));
				setPtr({ x: e.payload.x / devicePixelRatio, y: e.payload.y / devicePixelRatio });
			}),
			listen<DragPayload>("orbit-drag-drop", (e) => {
				if (phaseRef.current.kind !== "wheel") return;
				const dropped = inputOf(e.payload);
				const { mode, layout } = state.current;
				const i = hitAt(e.payload.position.x, e.payload.position.y, chainAfter(dropped, state.current.chain) ?? dropped);
				if (i >= 0) run(opsFor(chainAfter(dropped, state.current.chain) ?? dropped, mode, layout)[i], dropped);
				// Let go anywhere else: the steps chosen so far run; with none, it closes.
				else if (!runChainNow(dropped)) close();
			}),
			// The drag ended: unless it landed on an option, close.
			listen("orbit-release", () =>
				setTimeout(() => {
					if (phaseRef.current.kind === "wheel" && !runChainNow()) close();
				}, 300)
			)
		];
		// Listening now: a wheel opened while this page loaded gets its open.
		Promise.all(offs)
			.then(() => invoke("orbit_ready"))
			.catch(() => {});
		return () => offs.forEach((p) => p.then((off) => off()));
	}, [close, cycle, run, finish, modesNow]);

	if (phase.kind === "closed") return null;
	if (phase.kind === "running" && (phase.percent === null || inNotch)) return null;
	if (phase.kind === "done" && inNotch) return null;

	if (phase.kind === "ranges")
		return (
			<RangeRing
				pages={phase.pages}
				files={phase.input.paths.length}
				onPick={(ranges) => run({ ...phase.op, id: `${phase.op.id}:${ranges}` }, phase.input)}
				onCancel={close}
			/>
		);

	if (phase.kind === "size")
		return (
			<PickRing
				title="Resize"
				placeholder="1200"
				presets={SIZE_PRESETS}
				check={(t) =>
					!t
						? { value: null, note: "Longest side, px", bad: false }
						: /^\d+$/.test(t) && +t >= 16 && +t <= 20000
							? { value: t, note: `Longest side ${t} px`, bad: false }
							: { value: null, note: "A size like 1200", bad: true }
				}
				onPick={(px) => {
					if (!phase.add) return run({ ...phase.op, id: `${phase.op.id}:${px}` }, phase.input);
					// Resize in the middle of a chain: it joins the chain and the wheel comes back.
					const next = [...state.current.chain, `${phase.op.id}:${px}`];
					state.current.chain = next;
					setChain(next);
					setHover(HUB);
					setBloomKey((k) => k + 1);
					setPhase({ kind: "wheel" });
				}}
				onCancel={phase.add ? () => setPhase({ kind: "wheel" }) : close}
			/>
		);

	if (phase.kind === "running" || phase.kind === "done") {
		const Icon = phase.kind === "done" ? RESULT_ICON[phase.result] : null;
		return (
			<motion.div
				className={`orbit-status${phase.kind === "done" ? ` ${phase.result}` : ""}`}
				initial={{ scale: 0.6, opacity: 0 }}
				// Done pops, failed shakes, canceled settles back.
				animate={
					phase.kind !== "done"
						? { scale: 1, opacity: 1, x: 0 }
						: phase.result === "ok"
							? { scale: [1, 1.07, 1], opacity: 1, x: 0 }
							: phase.result === "failed"
								? { scale: 1, opacity: 1, x: [0, -8, 8, -5, 5, 0] }
								: { scale: [1, 0.95, 1], opacity: 1, x: 0 }
				}
				transition={phase.kind === "done" ? { duration: 0.45, ease: "easeOut" } : SPRING}
				onClick={phase.kind === "done" ? close : undefined}
			>
				<AnimatePresence mode="popLayout" initial={false}>
					{Icon && (
						<motion.span
							key="icon"
							className="orbit-status-icon"
							initial={{ scale: 0, rotate: -90 }}
							animate={{ scale: 1, rotate: 0 }}
							transition={{ type: "spring", stiffness: 600, damping: 15 }}
						>
							<Icon size={18} />
							{phase.kind === "done" && phase.result === "ok" && (
								<motion.i
									className="orbit-burst"
									initial={{ scale: 0.6, opacity: 0.8 }}
									animate={{ scale: 2.4, opacity: 0 }}
									transition={{ duration: 0.6, ease: "easeOut" }}
								/>
							)}
						</motion.span>
					)}
				</AnimatePresence>
				<motion.span key={phase.kind} className="orbit-status-text" initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={SPRING}>
					{phase.kind === "running" ? phase.op.progress : phase.text}
				</motion.span>
				{phase.kind === "running" && (
					<>
						<span className="orbit-percent">{phase.percent}%</span>
						<button
							title="Cancel (Esc)"
							onClick={() => {
								cancelledJob.current = true;
								invoke("orbit_cancel").catch(() => {});
								finish("Canceled", "canceled");
							}}
						>
							<X size={14} />
						</button>
					</>
				)}
			</motion.div>
		);
	}

	const step = 360 / Math.max(1, ops.length);
	const count = input.paths.length;
	return (
		<motion.div
			key={bloomKey}
			className="orbit"
			initial={animOpen ? { scale: 0.4, opacity: 0 } : false}
			animate={popping ? { scale: 1.04, opacity: 0 } : { scale: 1, opacity: 1 }}
			transition={popping ? { duration: T.pop / 1000, ease: "easeIn" } : T.bloom}
		>
			<svg
				width={SIZE}
				height={SIZE}
				onPointerMove={(e) => {
					setHover(hitTest(e.clientX - C, e.clientY - C, ops.length));
					if (state.current.chain.length) setPtr({ x: e.clientX, y: e.clientY });
				}}
				onPointerLeave={() => setHover(HUB)}
				onClick={(e) => {
					const i = hitTest(e.clientX - C, e.clientY - C, ops.length);
					if (i >= 0 && hasInput(input)) run(ops[i], input);
					else if (i === HUB) cycle();
					else close();
				}}
			>
				<circle className="orbit-disc" cx={C} cy={C} r={OUTER_R + 8} />
				<motion.g
					key={`${mode}|${ops.length}`}
					style={ORIGIN}
				>
					{ops.map((op, i) => {
						const mid = -90 + i * step;
						const a0 = mid - step / 2 + (ops.length > 1 ? GAP : 0);
						const a1 = mid + step / 2 - (ops.length > 1 ? GAP : 0);
						const [lx, ly] = point((OUTER_R + INNER_R) / 2, mid);
						const Icon = op.icon ? ORBIT_ICONS[op.icon] : undefined;
						return (
							<motion.g
								key={op.id}
								className={`orbit-slice${hover === i ? " hover" : ""}`}
								style={ORIGIN}
								// Each slice swings in on its own, past its place and back, one after another.
								initial={animSwitch ? { rotate: -16, opacity: 0 } : false}
								animate={{ rotate: 0, opacity: 1, scale: hover === i ? 1.06 : 1 }}
								transition={{
									...SPRING,
									rotate: { ...T.slice, delay: lag(i, ops.length, speed) },
									opacity: { delay: lag(i, ops.length, speed), duration: 0.12 * speed }
								}}
							>
								{ops.length === 1 ? (
									<path d={`${slicePath(-90, 89.99)} ${slicePath(90, 269.99)}`} />
								) : (
									<path d={slicePath(a0, a1)} />
								)}
								<foreignObject x={lx - 40} y={ly - 22} width={80} height={44}>
									<div className="orbit-label">
										{Icon && <Icon size={16} strokeWidth={1.75} />}
										<span className={Icon ? "" : "orbit-format"}>{op.label}</span>
									</div>
								</foreignObject>
							</motion.g>
						);
					})}
				</motion.g>
				<circle className="orbit-hub" cx={C} cy={C} r={INNER_R - 6} />
				<foreignObject x={C - 50} y={C - 30} width={100} height={60}>
					<motion.div
						key={input.text ? "text" : mode}
						className="orbit-hub-label"
						initial={{ y: 8, opacity: 0, scale: 0.85 }}
						animate={{ y: 0, opacity: 1, scale: 1 }}
						transition={SPRING}
					>
						<strong>{input.text ? "Text" : count ? MODE_LABEL[mode] : "Files"}</strong>
						<span>
							{chainNote ??
								(chain.length
									? `${chain.map(opLabel).join(" › ")} ›`
									: input.text
										? "Selected text"
										: count
											? `${count} file${count > 1 ? "s" : ""}`
											: "Move to choose")}
						</span>
						<div className="orbit-dots">
							{modes.map((m) => (
								<motion.i key={m} animate={{ opacity: m === mode ? 0.9 : 0.3, scale: m === mode ? 1.3 : 1 }} transition={SPRING} />
							))}
						</div>
					</motion.div>
				</foreignObject>
			</svg>
			{chain.length > 0 && ptr && !chainOnNotch && (
				<span
					className="orbit-tag"
					style={{ top: Math.min(SIZE - 22, ptr.y + 14), ...(ptr.x > C ? { right: SIZE - ptr.x + 12 } : { left: ptr.x + 12 }) }}
				>
					{chain.map(opLabel).join(" › ")} ›
				</span>
			)}
		</motion.div>
	);
}

/** Resize's sizes: the longest side, never made bigger. */
const SIZE_PRESETS = [
	{ label: "4K", hint: "3840 px", value: "3840" },
	{ label: "Full HD", hint: "1920 px", value: "1920" },
	{ label: "HD", hint: "1280 px", value: "1280" },
	{ label: "Small", hint: "800 px", value: "800" },
	{ label: "Thumbnail", hint: "320 px", value: "320" }
];

type Check = { value: string | null; note: string; bad: boolean };

/** Split's page ranges: one-click choices plus typed ranges ("1-5, 6-20"). */
function RangeRing({
	pages,
	files,
	onPick,
	onCancel
}: {
	pages: number | null;
	files: number;
	onPick: (ranges: string) => void;
	onCancel: () => void;
}) {
	const presets = pages ? splitPresets(pages, files).map((p) => ({ label: p.label, hint: p.hint, value: p.ranges })) : [];
	const check = (text: string): Check => {
		if (pages === null) return { value: null, note: "Counting pages…", bad: false };
		const parsed = parseRanges(text, pages);
		if (typeof parsed === "string") return { value: null, note: parsed, bad: true };
		if (pages < 2 && !text) return { value: formatRanges(parsed), note: "Only one page", bad: false };
		return {
			value: formatRanges(parsed),
			note: `${parsed.length} PDF${parsed.length === 1 ? "" : "s"} · ${files > 1 ? `${files} files` : `${pages} pages`}`,
			bad: false
		};
	};
	return <PickRing title="Split" placeholder="1-5, 6-20" presets={presets} disabled={pages === null} check={check} onPick={onPick} onCancel={onCancel} />;
}

/** A second ring that asks for one value: one-click choices around a hub
 *  where it can be typed; Enter takes it (Split's ranges, Resize's size). */
function PickRing({
	title,
	placeholder,
	presets,
	disabled = false,
	check,
	onPick,
	onCancel
}: {
	title: string;
	placeholder: string;
	presets: { label: string; hint: string; value: string }[];
	disabled?: boolean;
	check: (text: string) => Check;
	onPick: (value: string) => void;
	onCancel: () => void;
}) {
	const [text, setText] = useState("");
	const [hover, setHover] = useState(HUB);
	const field = useRef<HTMLInputElement>(null);
	// Takes the keyboard on open, and again on any click in the box (another
	// window may have taken it meanwhile).
	const grab = () =>
		invoke("orbit_focus")
			.catch(() => {})
			.finally(() => field.current?.focus());
	useEffect(() => {
		grab();
	}, []);
	const { value, note, bad } = check(text);
	const step = 360 / Math.max(1, presets.length);
	return (
		<motion.div className="orbit" initial={localStorage.getItem("bloom-files-anim-open") === "false" ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={BLOOM}>
			<svg
				width={SIZE}
				height={SIZE}
				onPointerMove={(e) => setHover(hitTest(e.clientX - C, e.clientY - C, presets.length))}
				onPointerLeave={() => setHover(HUB)}
				onClick={(e) => {
					const i = hitTest(e.clientX - C, e.clientY - C, presets.length);
					if (i >= 0) onPick(presets[i].value);
					else if (i !== HUB) onCancel();
				}}
			>
				<circle className="orbit-disc" cx={C} cy={C} r={OUTER_R + 8} />
				{presets.map((p, i) => {
					const mid = -90 + i * step;
					const [lx, ly] = point((OUTER_R + INNER_R) / 2, mid);
					return (
						<motion.g
							key={p.label}
							className={`orbit-slice${hover === i ? " hover" : ""}`}
							style={ORIGIN}
							initial={false}
							animate={{ opacity: 1, scale: hover === i ? 1.06 : 1 }}
							transition={{ ...SPRING, opacity: { delay: i * 0.03, duration: 0.15 } }}
						>
							<path d={slicePath(mid - step / 2 + GAP, mid + step / 2 - GAP)} />
							<foreignObject x={lx - 42} y={ly - 22} width={84} height={44}>
								<div className="orbit-label">
									<span>{p.label}</span>
									<small>{p.hint}</small>
								</div>
							</foreignObject>
						</motion.g>
					);
				})}
				<circle className="orbit-hub" cx={C} cy={C} r={INNER_R - 6} />
				<foreignObject x={C - 52} y={C - 34} width={104} height={68}>
					<div className="orbit-hub-label orbit-ranges">
						<strong>{title}</strong>
						<input
							ref={field}
							value={text}
							placeholder={placeholder}
							spellCheck={false}
							disabled={disabled}
							className={bad ? "bad" : ""}
							onPointerDown={grab}
							onChange={(e) => setText(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && value) onPick(value);
								if (e.key === "Escape") onCancel();
							}}
						/>
						<motion.span key={note} initial={{ y: 4, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={bad ? "bad" : ""}>
							{note}
						</motion.span>
					</div>
				</foreignObject>
			</svg>
		</motion.div>
	);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<Orbit />
	</React.StrictMode>
);

// Register the drop target on this window (done again by the backend once
// the window has been shown, when WebView2 has its render child).
invoke("setup_shelf_drop").catch(() => {});
