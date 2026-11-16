// The edge clipboard shelf (`clipshelf` window). The backend parks this
// window off screen and moves it to the left or right edge when the cursor
// reaches the middle third of that edge (clipboard.rs › Edge shelf); this
// component slides the panel in and out and takes drops.
import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { requestSend, sharePeerAt } from "./components/ShareColumn";
import { ClipboardPanel } from "./components/ClipboardPanel";
import { EdgeSurface } from "./components/EdgeSurface";
import { useTextInputKeyboard, releaseTextKeyboard } from "./hooks/useTextInputKeyboard";
import { useSettingsSync } from "./hooks/useSettingsSync";
import { panelZoom } from "./notchLayout";
import { initTheme } from "./theme";
import "./ClipShelf.css";

document.addEventListener("contextmenu", (e) => e.preventDefault());

function ClipShelf() {
	const [open, setOpen] = useState(false);
	const [side, setSide] = useState<"left" | "right" | "top">("left");
	const [dragHover, setDragHover] = useState(false);
	const [dragIcon, setDragIcon] = useState<string | null>(null);
	const [globalScale, setGlobalScale] = useState(1);
	const selfDrag = useRef(false);

	useTextInputKeyboard();
	useEffect(() => initTheme(), []);

	// Same size as the backend's window: bloom-scale × the clipboard's base.
	useEffect(() => {
		invoke<Record<string, string>>("load_settings")
			.then((s) => {
				setGlobalScale(parseFloat(s["bloom-scale"] ?? "1") || 1);
			})
			.catch(() => {});
		invoke<string | null>("shelf_drag_icon").then(setDragIcon).catch(() => {});
		invoke("setup_shelf_drop").catch(() => {});
	}, []);
	useSettingsSync({
		"bloom-scale": (v) => setGlobalScale(Number(v) || 1)
	});

	useEffect(() => {
		const unlisteners = [
			listen<{ open: boolean; side: "left" | "right" | "top" }>("clipshelf-open", (e) => {
				setSide(e.payload.side);
				setOpen(e.payload.open);
				if (!e.payload.open) releaseTextKeyboard();
			}),
			// Our own tile dragged within the shelf (to group it) keeps the history.
			listen("clipshelf-drag-enter", () => setDragHover(!selfDrag.current)),
			listen("clipshelf-drag-leave", () => setDragHover(false)),
			listen<{ paths?: string[]; text?: string; position?: { x: number; y: number } }>("clipshelf-drag-drop", (e) => {
				setDragHover(false);
				// Dropping our own drag back onto the shelf is a no-op.
				if (selfDrag.current) return;
				// Dropped on a person in the share row: send it, don't keep it.
				const peer = sharePeerAt(e.payload.position);
				if (peer) return requestSend(peer, { paths: e.payload.paths ?? [], text: e.payload.text });
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
			style={{ zoom: globalScale * panelZoom("clipboard") }}
		>
			<EdgeSurface edge={side} />
			<ClipboardPanel
				dragIcon={dragIcon}
				dropEvent="clipshelf-drag-drop"
				layout="edge"
				onClose={() => invoke("clipboard_shelf_close").catch(() => {})}
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
