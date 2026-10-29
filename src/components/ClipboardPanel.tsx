import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { Check, ExternalLink, File, Image, Link, Pin, PinOff, Search, Trash2, Type } from "lucide-react";
import "./QuickPanel.css";
import "./ClipboardPanel.css";

/** One clipboard history entry, as stored by the backend (clipboard.rs). */
export interface ClipItem {
	id: string;
	kind: "text" | "image" | "files";
	text?: string;
	is_url: boolean;
	paths?: string[];
	image?: string;
	width: number;
	height: number;
	captured_at: number;
	pinned: boolean;
	hits: number;
}

interface ClipboardPanelProps {
	/** Fallback drag image for files without a thumbnail. */
	dragIcon: string | null;
	/** Called when a drag out of the panel starts and ends, so the notch
	 *  stays open meanwhile and releases its hover afterwards. */
	onDragStart: () => void;
	onDragEnd: () => void;
}

const fileName = (path: string) => path.split(/[\\/]/).pop() || path;

/** Pinned first, then newest first; the search matches text, links and file names. */
export function visibleItems(items: ClipItem[], query: string): ClipItem[] {
	const q = query.trim().toLowerCase();
	const matches = (it: ClipItem) =>
		!q ||
		(it.text ?? "").toLowerCase().includes(q) ||
		(it.paths ?? []).some((p) => p.toLowerCase().includes(q)) ||
		(it.kind === "image" && "image".includes(q));
	const shown = items.filter(matches);
	return [...shown.filter((it) => it.pinned), ...shown.filter((it) => !it.pinned)];
}

function timeAgo(ms: number): string {
	const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
	if (s < 60) return "now";
	if (s < 3600) return `${Math.floor(s / 60)}m`;
	if (s < 86400) return `${Math.floor(s / 3600)}h`;
	return `${Math.floor(s / 86400)}d`;
}

export function ClipboardPanel({ dragIcon, onDragStart, onDragEnd }: ClipboardPanelProps) {
	const [items, setItems] = useState<ClipItem[]>([]);
	const [query, setQuery] = useState("");
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
	const pointer = useRef<{ id: string; x: number; y: number; dragging: boolean } | null>(null);

	useEffect(() => {
		const load = () => invoke<ClipItem[]>("clipboard_history").then(setItems).catch(() => {});
		load();
		const unlisten = listen("clipboard-history-changed", load);
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// Thumbnails for images and the first file of a file entry, via the shelf's previewer.
	useEffect(() => {
		for (const it of items) {
			const path = it.image ?? it.paths?.[0];
			if (!path || path in thumbs) continue;
			setThumbs((prev) => ({ ...prev, [path]: null }));
			invoke<{ thumb: string | null }>("shelf_thumbnail", { path })
				.then((p) => setThumbs((prev) => ({ ...prev, [path]: p.thumb })))
				.catch(() => {});
		}
	}, [items, thumbs]);

	const shown = useMemo(() => visibleItems(items, query), [items, query]);

	const copy = (it: ClipItem) => {
		invoke("clipboard_copy", { id: it.id })
			.then(() => {
				setCopiedId(it.id);
				window.setTimeout(() => setCopiedId((id) => (id === it.id ? null : id)), 1200);
			})
			.catch((e) => console.error("[clipboard] copy failed:", e));
	};

	const dragPaths = (it: ClipItem) => (it.image ? [it.image] : it.paths ?? []);

	const onPointerMove = (e: React.PointerEvent, it: ClipItem) => {
		const st = pointer.current;
		if (!st || st.id !== it.id || st.dragging) return;
		if (Math.hypot(e.clientX - st.x, e.clientY - st.y) < 6) return;
		const paths = dragPaths(it);
		const icon = thumbs[paths[0]] ?? dragIcon;
		if (!paths.length || !icon) return;
		st.dragging = true;
		onDragStart();
		startDrag({ item: paths, icon })
			.catch((err) => console.error("[clipboard] drag out failed:", err))
			.finally(onDragEnd);
	};

	const onClick = (e: React.MouseEvent, it: ClipItem) => {
		e.stopPropagation();
		const st = pointer.current;
		pointer.current = null;
		if (st && st.id === it.id && st.dragging) return;
		copy(it);
	};

	const act = (e: React.MouseEvent, fn: () => unknown) => {
		e.stopPropagation();
		fn();
	};

	return (
		<div className="qp clip-panel" onClick={(e) => e.stopPropagation()}>
			<div className="clip-search">
				<Search size={12} />
				<input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search clipboard"
					spellCheck={false}
				/>
			</div>
			<div className="clip-list">
				{shown.length === 0 && (
					<div className="clip-empty">{query ? "No matches" : "Copied text, links, images and files appear here"}</div>
				)}
				{shown.map((it) => {
					const path = it.image ?? it.paths?.[0];
					const thumb = path ? thumbs[path] : null;
					const draggable = it.kind !== "text";
					return (
						<div
							key={it.id}
							className={`clip-row ${it.pinned ? "pinned" : ""}`}
							title={draggable ? "Click to copy, drag to drop into an app" : "Click to copy"}
							onPointerDown={(e) => {
								if (e.button === 0 && draggable) pointer.current = { id: it.id, x: e.clientX, y: e.clientY, dragging: false };
							}}
							onPointerMove={(e) => onPointerMove(e, it)}
							onClick={(e) => onClick(e, it)}
						>
							<div className="clip-thumb">
								{thumb ? (
									<img src={thumb} alt="" draggable={false} />
								) : it.kind === "image" ? (
									<Image size={14} />
								) : it.kind === "files" ? (
									<File size={14} />
								) : it.is_url ? (
									<Link size={14} />
								) : (
									<Type size={14} />
								)}
							</div>
							<div className="clip-body">
								<span className={`clip-text ${it.is_url ? "url" : ""}`}>
									{it.kind === "text"
										? it.text
										: it.kind === "image"
											? `Image · ${it.width}×${it.height}`
											: it.paths!.length === 1
												? fileName(it.paths![0])
												: `${fileName(it.paths![0])} + ${it.paths!.length - 1} more`}
								</span>
								<span className="clip-meta">
									{copiedId === it.id ? (
										<>
											<Check size={10} /> Copied
										</>
									) : (
										<>
											{timeAgo(it.captured_at)}
											{it.hits > 1 && ` · copied ${it.hits}×`}
										</>
									)}
								</span>
							</div>
							<div className="clip-actions">
								{it.is_url && it.text && (
									<button
										className="qp-icon-btn"
										title="Open link"
										onClick={(e) =>
											act(e, () => openUrl(/^https?:/i.test(it.text!) ? it.text! : `https://${it.text}`))
										}
									>
										<ExternalLink size={12} />
									</button>
								)}
								<button
									className={`qp-icon-btn ${it.pinned ? "on" : ""}`}
									title={it.pinned ? "Unpin" : "Pin (kept through cleanup)"}
									onClick={(e) => act(e, () => invoke("clipboard_pin", { id: it.id, pinned: !it.pinned }))}
								>
									{it.pinned ? <PinOff size={12} /> : <Pin size={12} />}
								</button>
								<button
									className="qp-icon-btn"
									title="Delete"
									onClick={(e) => act(e, () => invoke("clipboard_delete", { id: it.id }))}
								>
									<Trash2 size={12} />
								</button>
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}
