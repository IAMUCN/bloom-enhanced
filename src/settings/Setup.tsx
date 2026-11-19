import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emitTo } from "@tauri-apps/api/event";
import { PickTools } from "./PickTools";

type Step = "closed" | "open" | "name" | "tools";

const clamp = (v: number, min: number, max: number) => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 1);
const stored = (key: string, fallback = "1") => parseFloat(localStorage.getItem(key) ?? fallback);

/** First-run setup (also once for existing installs, `bloom-setup-done`):
 *  1. the closed notch's size (`bloom-notch-scale`) and 2. the open notch's
 *  extra size (`bloom-notch-open-scale`), each with the real notch held at
 *  the top of the screen as a live preview (a display at 100 % shows it
 *  smaller than one at 125 %, so each person sizes it themselves);
 *  3. your name, shown only to people you share your Shelf with
 *  (`bloom-share-name`); 4. "Pick your tools", unless already done. */
export function Setup({
	saveSetting,
	onDone
}: {
	saveSetting: (key: string, value: string | null) => Promise<boolean>;
	onDone: () => void;
}) {
	const needsTools = localStorage.getItem("bloom-tools-picked") !== "true";
	const [step, setStep] = useState<Step>("closed");
	const [name, setName] = useState(() => localStorage.getItem("bloom-share-name") ?? "");
	const [scale, setScale] = useState(() => clamp(stored("bloom-notch-scale", localStorage.getItem("bloom-scale") ?? "1"), 0.5, 1.5));
	const [openScale, setOpenScale] = useState(() => clamp(stored("bloom-notch-open-scale"), 0.8, 1.25));

	// The notch shows what is being sized; let go of it when leaving.
	useEffect(() => {
		emitTo("main", "setup-preview", step === "closed" || step === "open" ? step : null).catch(() => {});
	}, [step]);
	useEffect(() => () => void emitTo("main", "setup-preview", null).catch(() => {}), []);

	const finish = async () => {
		await saveSetting("bloom-setup-done", "true");
		onDone();
	};
	const next = async () => {
		if (step === "closed") return setStep("open");
		if (step === "open") return setStep("name");
		const n = name.trim().slice(0, 48);
		if (n) {
			await saveSetting("bloom-share-name", n);
			invoke("share_set_name", { name: n }).catch(() => {});
		}
		if (needsTools) setStep("tools");
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

	return (
		<div className="pick-tools-backdrop setup-backdrop" role="dialog" aria-modal="true" aria-labelledby="setup-title">
			<div className="pick-tools setup">
				<span className="setup-steps">Step {step === "closed" ? 1 : step === "open" ? 2 : 3} of {needsTools ? 4 : 3}</span>
				{step === "closed" && (
					<>
						<h1 id="setup-title">Size the notch</h1>
						<p>Look at the notch at the top of your screen: it shows the time. Drag until it's easy to read.</p>
						{slider(scale, 0.5, 1.5, (v) => (setScale(v), saveSetting("bloom-notch-scale", v.toFixed(2))), "Notch size")}
					</>
				)}
				{step === "open" && (
					<>
						<h1 id="setup-title">Size the open notch</h1>
						<p>The notch is open at the top of your screen now. Drag until the controls feel right.</p>
						{slider(openScale, 0.8, 1.25, (v) => (setOpenScale(v), saveSetting("bloom-notch-open-scale", v.toFixed(2))), "Open notch size")}
					</>
				)}
				{step === "name" && (
					<>
						<h1 id="setup-title">What's your name?</h1>
						<p>It's only shown to people you share your Shelf with, nothing else.</p>
						<input
							className="setup-input"
							value={name}
							maxLength={48}
							autoFocus
							placeholder="Your name"
							aria-label="Your name"
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && next()}
						/>
					</>
				)}
				<div className="pick-tools-actions">
					<button type="button" className="pick-skip" onClick={step === "name" && needsTools ? () => setStep("tools") : step === "name" ? finish : () => setStep(step === "closed" ? "open" : "name")}>
						Skip
					</button>
					<button type="button" className="pick-start" onClick={next}>
						{step === "name" && !needsTools ? "Done" : "Next"}
					</button>
				</div>
			</div>
		</div>
	);
}
