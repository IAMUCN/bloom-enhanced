// The edge clipboard shelf (`clipshelf` window). The backend parks this
// window off screen and moves it to the left or right edge when the cursor
// reaches the middle third of that edge (clipboard.rs › Edge shelf); this
// component slides the panel in and out and takes drops.
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ClipboardPanel } from "./components/ClipboardPanel";
import { EdgeSurface } from "./components/EdgeSurface";
import { useTextInputKeyboard, releaseTextKeyboard } from "./hooks/useTextInputKeyboard";
import { useSettingsSync } from "./hooks/useSettingsSync";
import { parsePanelScales } from "./notchLayout";
import { initTheme } from "./theme";
import "./ClipShelf.css";

document.addEventListener("contextmenu", (e) => e.preventDefault());

function ClipShelf() {
	const [open, setOpen] = useState(false);
	const [side, setSide] = useState<"left" | "right">("left");
	const [dragHover, setDragHover] = useState(false);
	const [dragIcon, setDragIcon] = useState<string | null>(null);
	const [globalScale, setGlobalScale] = useState(1);
	const [panelScale, setPanelScale] = useState(1);
	const selfDrag = useRef(false);

	useTextInputKeyboard();
	useEffect(() => initTheme(), []);

	// Same size as the backend's window: bloom-scale × the clipboard panel size.
	useEffect(() => {
		invoke<Record<string, string>>("load_settings")
			.then((s) => {
				setGlobalScale(parseFloat(s["bloom-scale"] ?? "1") || 1);
				setPanelScale(parsePanelScales(s["bloom-notch-panel-scales"]).clipboard ?? 1);
			})
			.catch(() => {});
		invoke<string | null>("shelf_drag_icon").then(setDragIcon).catch(() => {});
		invoke("setup_shelf_drop").catch(() => {});
	}, []);
	useSettingsSync({
		"bloom-scale": (v) => setGlobalScale(Number(v) || 1),
		"bloom-notch-panel-scales": (v) => setPanelScale(parsePanelScales(String(v)).clipboard ?? 1)
	});

	useEffect(() => {
		const unlisteners = [
			listen<{ open: boolean; side: "left" | "right" }>("clipshelf-open", (e) => {
				setSide(e.payload.side);
				setOpen(e.payload.open);
				if (!e.payload.open) releaseTextKeyboard();
			}),
			// Our own tile dragged within the shelf (to group it) keeps the history.
			listen("clipshelf-drag-enter", () => setDragHover(!selfDrag.current)),
			listen("clipshelf-drag-leave", () => setDragHover(false)),
			listen<{ paths?: string[]; text?: string }>("clipshelf-drag-drop", (e) => {
				setDragHover(false);
				// Dropping our own drag back onto the shelf is a no-op.
				if (selfDrag.current) return;
				invoke("clipboard_add", { paths: e.payload.paths ?? [], text: e.payload.text }).catch(() => {});
			})
		];
		return () => {
			unlisteners.forEach((p) => p.then((fn) => fn()));
		};
	}, []);

	return (
		<div
			className={`clipshelf ${side} ${open ? "open" : ""} ${dragHover ? "drop-hover" : ""}`}
			style={{ zoom: globalScale * panelScale }}
		>
			<EdgeSurface edge={side} />
			<ClipboardPanel
				dragIcon={dragIcon}
				dropEvent="clipshelf-drag-drop"
				dragOver={dragHover}
				onDragStart={() => {
					selfDrag.current = true;
				}}
				onDragEnd={() => {
					selfDrag.current = false;
				}}
			/>
		</div>
	);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
	<React.StrictMode>
		<ClipShelf />
	</React.StrictMode>
);
