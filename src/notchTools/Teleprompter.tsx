import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, Pause, Pencil, Play, RotateCcw, Trash2, Type, Gauge } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import type { ToolProps } from "../tools";
import { useToolData } from "./useToolData";

type Data = { script: string; speed: number; size: number };

/** Teleprompter (user's reference, 2026-11-15): your script scrolls up in
 *  the notch, right under the camera. While it shows, the notch is hidden
 *  from screen shares and recordings (Windows' capture exclusion), so the
 *  audience never sees it. */
export default function Teleprompter({ setPinned }: ToolProps) {
	const [data, setData] = useToolData<Data>("teleprompter", { script: "", speed: 30, size: 22 });
	const [editing, setEditing] = useState(false);
	const [playing, setPlaying] = useState(false);
	const offset = useRef(0);
	const text = useRef<HTMLDivElement>(null);
	const box = useRef<HTMLDivElement>(null);

	useEffect(() => {
		invoke("set_capture_excluded", { excluded: true }).catch(() => {});
		return () => void invoke("set_capture_excluded", { excluded: false }).catch(() => {});
	}, []);

	// Ctrl+V on this page loads the copied text as the script: from another
	// app's keyboard via the hook (shortcuts.rs), or here when the notch has it
	// (inside the editor, Ctrl+V just pastes as usual).
	const loadRef = useRef(() => {});
	loadRef.current = () =>
		readText()
			.then((t) => {
				if (!t?.trim()) return;
				setData((d) => ({ ...d, script: t }));
				setPlaying(false);
				setEditing(false);
				offset.current = 0;
				if (text.current) text.current.style.transform = "translateY(0)";
			})
			.catch(() => {});
	// While playing, the notch stays open (the pointer can leave it) and
	// Ctrl+V in other apps is left alone.
	useEffect(() => {
		setPinned(playing);
		invoke("set_notch_paste_capture", { on: !playing }).catch(() => {});
		return () => setPinned(false);
	}, [playing]);
	useEffect(() => {
		const off = listen("notch-paste", () => loadRef.current());
		const onKey = (e: KeyboardEvent) => {
			if (!(e.ctrlKey && !e.altKey && e.key.toLowerCase() === "v")) return;
			if ((e.target as HTMLElement | null)?.closest("textarea, input")) return;
			e.preventDefault();
			loadRef.current();
		};
		window.addEventListener("keydown", onKey);
		return () => {
			invoke("set_notch_paste_capture", { on: false }).catch(() => {});
			off.then((f) => f());
			window.removeEventListener("keydown", onKey);
		};
	}, []);

	// Scroll at `speed` px/s while playing; stop at the end.
	useEffect(() => {
		if (!playing) return;
		let frame = 0;
		let last = performance.now();
		const step = (now: number) => {
			const dt = (now - last) / 1000;
			last = now;
			const max = Math.max(0, (text.current?.scrollHeight ?? 0) - (box.current?.clientHeight ?? 0) / 2);
			offset.current = Math.min(max, offset.current + data.speed * dt);
			if (text.current) text.current.style.transform = `translateY(${-offset.current}px)`;
			if (offset.current >= max) return setPlaying(false);
			frame = requestAnimationFrame(step);
		};
		frame = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame);
	}, [playing, data.speed]);

	const restart = () => {
		offset.current = 0;
		if (text.current) text.current.style.transform = "translateY(0)";
	};

	return (
		<div className="tp">
			{editing ? (
				<textarea
					className="nt-input tp-edit"
					value={data.script}
					autoFocus
					placeholder="Paste your script here."
					aria-label="Script"
					// Stays open on blur: taking the keyboard briefly blurs it, which
					// used to close the editor before anything could be pasted.
					onFocus={() => setPinned(true)}
					onBlur={() => setPinned(false)}
					onChange={(e) => setData((d) => ({ ...d, script: e.target.value }))}
				/>
			) : (
				<div ref={box} className="tp-view" onDoubleClick={() => setEditing(true)}>
					<div ref={text} className="tp-text" style={{ fontSize: data.size }}>
						{data.script || <span className="tp-empty">Copy your script and press Ctrl+V here.</span>}
					</div>
				</div>
			)}
			<div className="tp-controls">
				<button
					type="button"
					className="nt-btn nt-icon-btn tp-round"
					aria-label={editing ? "Done editing" : "Edit script"}
					onClick={() => {
						setPlaying(false);
						setEditing((e) => !e);
					}}
				>
					{editing ? <Check size={14} /> : <Pencil size={14} />}
				</button>
				<button
					type="button"
					className="nt-btn nt-icon-btn tp-round tp-play"
					aria-label={playing ? "Pause" : "Play"}
					disabled={!data.script}
					onClick={() => (setEditing(false), setPlaying((p) => !p))}
				>
					{playing ? <Pause size={16} /> : <Play size={16} />}
				</button>
				<button type="button" className="nt-btn nt-icon-btn tp-round" aria-label="Back to the start" onClick={restart}>
					<RotateCcw size={14} />
				</button>
				<button
					type="button"
					className="nt-btn nt-icon-btn tp-round"
					aria-label="Clear the script"
					title="Clear the script"
					disabled={!data.script}
					onClick={() => {
						setPlaying(false);
						setEditing(false);
						restart();
						setData((d) => ({ ...d, script: "" }));
					}}
				>
					<Trash2 size={14} />
				</button>
				<label className="tp-slider" title="Speed">
					<Gauge size={13} />
					<input type="range" min={5} max={120} value={data.speed} aria-label="Speed" onChange={(e) => setData((d) => ({ ...d, speed: Number(e.target.value) }))} />
				</label>
				<label className="tp-slider" title="Text size">
					<Type size={13} />
					<input type="range" min={14} max={40} value={data.size} aria-label="Text size" onChange={(e) => setData((d) => ({ ...d, size: Number(e.target.value) }))} />
				</label>
			</div>
		</div>
	);
}
