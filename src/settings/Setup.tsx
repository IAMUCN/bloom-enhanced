import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PickTools } from "./PickTools";

const MIN = 0.5;
const MAX = 1.5;

/** First-run setup (also once for existing installs, `bloom-setup-done`):
 *  1. your name, which only Shelf sharing shows to others (`bloom-share-name`);
 *  2. the notch's size (`bloom-notch-scale`), set with a slider while the real
 *     notch at the top of the screen grows and shrinks (displays at 100 %
 *     show it smaller than at 125 %, so each person picks their own);
 *  3. "Pick your tools", unless it was already done. */
export function Setup({
	saveSetting,
	onDone
}: {
	saveSetting: (key: string, value: string | null) => Promise<boolean>;
	onDone: () => void;
}) {
	const needsTools = localStorage.getItem("bloom-tools-picked") !== "true";
	const [step, setStep] = useState<"name" | "size" | "tools">("name");
	const [name, setName] = useState(() => localStorage.getItem("bloom-share-name") ?? "");
	const [scale, setScale] = useState(() => {
		const v = parseFloat(localStorage.getItem("bloom-notch-scale") ?? localStorage.getItem("bloom-scale") ?? "1");
		return Number.isFinite(v) ? Math.min(MAX, Math.max(MIN, v)) : 1;
	});

	const finish = async () => {
		await saveSetting("bloom-setup-done", "true");
		onDone();
	};
	const next = async () => {
		if (step === "name") {
			const n = name.trim().slice(0, 48);
			if (n) {
				await saveSetting("bloom-share-name", n);
				invoke("share_set_name", { name: n }).catch(() => {});
			}
			setStep("size");
		} else if (step === "size") {
			if (needsTools) setStep("tools");
			else await finish();
		}
	};

	if (step === "tools") return <PickTools saveSetting={saveSetting} onDone={finish} />;
	return (
		<div className="pick-tools-backdrop" role="dialog" aria-modal="true" aria-labelledby="setup-title">
			<div className="pick-tools setup">
				<img src="/lotusnotch.png" alt="" className="pick-tools-logo" />
				{step === "name" ? (
					<>
						<h1 id="setup-title">Welcome to LotusNotch</h1>
						<p>What's your name? It's only shown to people you share your Shelf with, nothing else.</p>
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
				) : (
					<>
						<h1 id="setup-title">Size the notch</h1>
						<p>Look at the notch at the top of your screen and drag until it feels right. You can change it later in Settings › Notch.</p>
						<div className="setup-scale">
							<span>Smaller</span>
							<input
								type="range"
								min={MIN}
								max={MAX}
								step={0.05}
								value={scale}
								aria-label="Notch size"
								onChange={(e) => {
									const v = Number(e.target.value);
									setScale(v);
									saveSetting("bloom-notch-scale", v.toFixed(2));
								}}
							/>
							<span>Bigger</span>
							<b>{Math.round(scale * 100)}%</b>
						</div>
					</>
				)}
				<div className="pick-tools-actions">
					<button type="button" className="pick-skip" onClick={step === "name" ? () => setStep("size") : finish}>
						Skip
					</button>
					<button type="button" className="pick-start" onClick={next}>
						{step === "size" && !needsTools ? "Done" : "Next"}
					</button>
				</div>
			</div>
		</div>
	);
}
