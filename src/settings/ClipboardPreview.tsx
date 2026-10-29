// Settings › Clipboard previews: sample tiles drawn with the real ClipTile,
// one scene per optional feature, following the live toggles.
import { useEffect, useState } from "react";
import { ClipboardCheck, Layers, Volume2 } from "lucide-react";
import { ClipTile } from "../components/ClipTile";
import { useClipboardSettings } from "../hooks/useClipboardSettings";
import { clipSounds } from "../clipboardSounds";
import type { ClipItem } from "../clipboardModel";
import "../components/ClipboardPanel.css";

export type ClipScene = "clip-shelf" | "clip-rich" | "clip-links" | "clip-notes" | "clip-select" | "clip-sounds" | "clip-indicator";

const now = Date.now();
const item = (id: string, patch: Partial<ClipItem>): ClipItem => ({
	id,
	kind: "text",
	is_url: false,
	width: 0,
	height: 0,
	captured_at: now - 4 * 60_000,
	pinned: false,
	hits: 1,
	...patch
});

const photo = (hue: number) =>
	`data:image/svg+xml,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="64"><defs><linearGradient id="g" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 70% 62%)"/><stop offset="1" stop-color="hsl(${hue + 40} 60% 32%)"/></linearGradient></defs><rect width="80" height="64" fill="url(#g)"/><circle cx="58" cy="18" r="8" fill="#fff" opacity=".7"/></svg>`
	)}`;
const PHOTOS = ["a.png", "b.png", "c.png"];
const THUMBS = Object.fromEntries(PHOTOS.map((p, i) => [p, photo(200 + i * 50)]));

const SAMPLES = {
	text: item("t", { text: "Meeting moved to 3 pm, bring the Q3 numbers and the draft." }),
	rich: item("r", { text: "Quarterly report: revenue up 12%", html: "<b>Quarterly report</b>" }),
	link: item("l", { text: "https://github.com/tauri-apps/tauri/releases", is_url: true }),
	color: item("c", { text: "#7C5CFF" }),
	stack: item("s", { kind: "files", paths: PHOTOS, captured_at: now - 60_000 }),
	noted: item("n", { text: "INV-20931 · 1,240.00", note: "#work invoice for March", pinned: false })
};

export function ClipboardPreview({ scene }: { scene: ClipScene }) {
	const o = useClipboardSettings();
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (scene !== "clip-indicator") return;
		const timer = window.setInterval(() => setCopied((c) => !c), 1400);
		return () => window.clearInterval(timer);
	}, [scene]);

	const tile = (it: ClipItem, extra: Partial<React.ComponentProps<typeof ClipTile>> = {}) => (
		<ClipTile
			key={it.id}
			item={it}
			thumbs={THUMBS}
			linkPreviews={o.linkPreviews}
			notes={o.notes}
			richText={o.richText}
			{...extra}
		/>
	);
	const grid = (tiles: React.ReactNode, bar?: React.ReactNode) => (
		<div className="qp clip-panel clip-preview" style={{ "--clip-tile": "92px" } as React.CSSProperties}>
			{bar}
			<div className="clip-grid">{tiles}</div>
		</div>
	);

	switch (scene) {
		case "clip-shelf":
			return grid([SAMPLES.text, SAMPLES.stack, SAMPLES.link, SAMPLES.color].map((it) => tile(it)));
		case "clip-rich":
			return grid([tile(SAMPLES.rich), tile(SAMPLES.text)]);
		case "clip-links":
			return grid([tile(SAMPLES.link), tile(item("l2", { text: "https://en.wikipedia.org/wiki/Clipboard_(computing)", is_url: true }))]);
		case "clip-notes":
			return grid([tile(SAMPLES.noted), tile(SAMPLES.text)]);
		case "clip-select":
			return grid(
				[tile(SAMPLES.stack, { selected: o.multiSelect }), tile(item("p", { kind: "files", paths: ["a.png"] }), { selected: o.multiSelect }), tile(SAMPLES.text)],
				o.multiSelect ? (
					<div className="clip-bar">
						<span className="clip-bar-title">2 selected</span>
						<button>
							<Layers size={11} /> Group
						</button>
					</div>
				) : undefined
			);
		case "clip-sounds":
			return (
				<div className="clip-preview clip-preview-center">
					{(["copy", "pop", "delete"] as const).map((name) => (
						<button key={name} className="clip-preview-btn" disabled={!o.sounds} onClick={() => clipSounds[name]()}>
							<Volume2 size={12} /> {name === "copy" ? "Copy" : name === "pop" ? "Pin / group" : "Delete"}
						</button>
					))}
				</div>
			);
		case "clip-indicator":
			return (
				<div className="clip-preview clip-preview-center">
					<div className={`clip-preview-pill ${o.copyIndicator && copied ? "wide" : ""}`}>
						{o.copyIndicator && copied && (
							<>
								<ClipboardCheck size={14} /> Copied
							</>
						)}
					</div>
				</div>
			);
	}
}
