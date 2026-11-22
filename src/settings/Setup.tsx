import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Check } from "lucide-react";
import "../effects.css";
import { PickTools } from "./PickTools";
import { Choice } from "./Choice";

type ModuleId = "notch" | "dock" | "clipboard" | "files";
export type SetupModules = Record<ModuleId, { on: boolean; toggle: () => void }>;
type Step = "modules" | "notch-closed" | "notch-open" | "dock" | "shelf" | "radial" | "tools";

const clamp = (v: number, min: number, max: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 1);
const stored = (key: string, fallback = "1") => parseFloat(localStorage.getItem(key) ?? fallback);

/** The four modules: what each is and what it does, with a small picture. */
const MODULES: [ModuleId, string, string][] = [
	["notch", "Notch", "A pill at the top: time, music, your tools. Rest on it or click to open."],
	["dock", "Dock", "Your apps along the bottom, in place of the Windows taskbar."],
	["clipboard", "Shelf", "Everything you copy, kept and shared. Lives in the notch."],
	["files", "Radial Menu", "Drag files and tap Shift: convert, compress, move in one move."]
];

const Art = ({ id }: { id: ModuleId }) => (
	<div className={`setup-art setup-art-${id}`} aria-hidden>
		<i />
		<i />
		<i />
	</div>
);

/** First-run setup (also from Settings › Notch › Run Setup Again), on a
 *  white screen so the real notch at the top is the preview:
 *  1. pick the modules (each switches on or off at once, live);
 *  2. then one page per picked module: notch size closed and open
 *     (`bloom-notch-scale`, `bloom-notch-open-scale`, the notch held in that
 *     state meanwhile), dock size (`bloom-dock-scale`), Shelf (where it lives,
 *     your name for sharing: `bloom-share-name`), Radial Menu trigger key
 *     (`bloom-files-key`); 3. "Pick your tools" for the notch, unless done. */
export function Setup({
	saveSetting,
	onDone,
	modules,
	dockScale,
	onDockScale
}: {
	saveSetting: (key: string, value: string | null) => Promise<boolean>;
	onDone: () => void;
	modules: SetupModules;
	dockScale: number;
	onDockScale: (v: number) => void;
}) {
	const needsTools = localStorage.getItem("bloom-tools-picked") !== "true";
	const [step, setStep] = useState<Step>("modules");
	const [name, setName] = useState(() => localStorage.getItem("bloom-share-name") ?? "");
	const [scale, setScale] = useState(() => clamp(stored("bloom-notch-scale", localStorage.getItem("bloom-scale") ?? "1"), 0.5, 1.5));
	const [openScale, setOpenScale] = useState(() => clamp(stored("bloom-notch-open-scale"), 0.8, 1.25));
	const [key, setKey] = useState(() => localStorage.getItem("bloom-files-key") ?? "shift");

	const on = (id: ModuleId) => modules[id].on;
	const steps: Step[] = [
		"modules",
		...(on("notch") ? (["notch-closed", "notch-open"] as const) : []),
		...(on("dock") ? (["dock"] as const) : []),
		...(on("clipboard") ? (["shelf"] as const) : []),
		...(on("files") ? (["radial"] as const) : []),
		...(on("notch") && needsTools ? (["tools"] as const) : [])
	];
	const at = steps.indexOf(step);

	// A white screen: the window fills it while setting up.
	useEffect(() => {
		const win = getCurrentWindow();
		win.maximize().catch(() => {});
		return () => void win.unmaximize().catch(() => {});
	}, []);
	// The notch shows what is being sized; let go of it when leaving.
	useEffect(() => {
		emitTo("main", "setup-preview", step === "notch-closed" ? "closed" : step === "notch-open" ? "open" : null).catch(() => {});
	}, [step]);
	useEffect(() => () => void emitTo("main", "setup-preview", null).catch(() => {}), []);

	const finish = async () => {
		await saveSetting("bloom-setup-done", "true");
		onDone();
	};
	const next = async () => {
		if (step === "shelf") {
			const n = name.trim().slice(0, 48);
			if (n) {
				await saveSetting("bloom-share-name", n);
				invoke("share_set_name", { name: n }).catch(() => {});
			}
		}
		const following = steps[at + 1];
		if (following) setStep(following);
		else await finish();
	};

	if (step === "tools") return <PickTools saveSetting={saveSetting} onDone={finish} />;

	const slider = (value: number, min: number, max: number, onChange: (v: number) => void, label: string) => (
		<div className="setup-scale">
			<span>Smaller</span>
			<input type="range" min={min} max={max} step={0.05} value={value} aria-label={label} onChange={(e) => onChange(Number(e.target.value))} />
			<span>Bigger</span>
			<b>{Math.round(value * 100)}%</b>
		</div>
	);
	const last = at === steps.length - 1;

	return (
		<div className="setup-screen" role="dialog" aria-modal="true" aria-labelledby="setup-title">
			<div className={`setup-panel fx-card${step === "modules" ? " wide" : ""}`}>
				<span className="setup-steps">
					Step {at + 1} of {steps.length}
				</span>
				{step === "modules" && (
					<>
						<h1 id="setup-title">What would you like?</h1>
						<p>Turn on what you want. Each one works on its own; change it any time in Settings.</p>
						<div className="setup-modules">
							{MODULES.map(([id, label, what]) => (
								<button key={id} type="button" className={`setup-module${on(id) ? " on" : ""}`} aria-pressed={on(id)} onClick={modules[id].toggle}>
									<Art id={id} />
									<span className="setup-module-name">
										{label}
										<span className="setup-module-check">{on(id) && <Check size={12} strokeWidth={3} />}</span>
									</span>
									<span className="setup-module-what">{what}</span>
								</button>
							))}
						</div>
					</>
				)}
				{step === "notch-closed" && (
					<>
						<h1 id="setup-title">Size the notch</h1>
						<p>Look at the notch at the top of your screen: it shows the time. Drag until it's easy to read.</p>
						{slider(scale, 0.5, 1.5, (v) => (setScale(v), saveSetting("bloom-notch-scale", v.toFixed(2))), "Notch size")}
					</>
				)}
				{step === "notch-open" && (
					<>
						<h1 id="setup-title">Size the open notch</h1>
						<p>The notch is open at the top of your screen now. Drag until the controls feel right.</p>
						{slider(openScale, 0.8, 1.25, (v) => (setOpenScale(v), saveSetting("bloom-notch-open-scale", v.toFixed(2))), "Open notch size")}
					</>
				)}
				{step === "dock" && (
					<>
						<h1 id="setup-title">Size the dock</h1>
						<p>Look at the dock at the bottom of your screen. Drag until the icons feel right.</p>
						{slider(dockScale, 0.5, 1.5, onDockScale, "Dock size")}
					</>
				)}
				{step === "shelf" && (
					<>
						<h1 id="setup-title">Your Shelf</h1>
						<p>
							{on("notch") ? "It lives in the notch: open it and pick the Shelf tab." : "It slides down from the middle of the top edge."} Share it
							with people near you: what name should they see?
						</p>
						<input
							className="setup-input"
							value={name}
							maxLength={48}
							placeholder="Your name"
							aria-label="Your name"
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && next()}
						/>
					</>
				)}
				{step === "radial" && (
					<>
						<h1 id="setup-title">Radial Menu</h1>
						<p>Drag files and tap this key: the menu opens around the pointer. Let go on an option to run it. Tap it twice with files selected to open it too.</p>
						<Choice
							value={key}
							options={[
								["shift", "Shift"],
								["ctrl", "Ctrl"],
								["alt", "Alt"]
							]}
							onChange={(v) => (setKey(v), saveSetting("bloom-files-key", v))}
							label="Trigger key"
						/>
					</>
				)}
				<div className="pick-tools-actions">
					{at > 0 ? (
						<button type="button" className="pick-skip" onClick={() => setStep(steps[at - 1])}>
							Back
						</button>
					) : (
						<button type="button" className="pick-skip" onClick={finish}>
							Skip
						</button>
					)}
					<button type="button" className="pick-start" onClick={next}>
						{last ? "Done" : "Next"}
					</button>
				</div>
			</div>
		</div>
	);
}
