import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import {
	Check,
	ChevronDown,
	Eraser,
	ExternalLink,
	File,
	Image,
	Layers,
	Link,
	Pin,
	PinOff,
	Search,
	Trash2,
	Type,
	Ungroup
} from "lucide-react";
import { useSettingsSync } from "../hooks/useSettingsSync";
import { releaseTextKeyboard } from "../hooks/useTextInputKeyboard";
import {
	CLEAR_WINDOWS,
	CLIP_FILTERS,
	THUMB_SIZES,
	asThumbSize,
	clearIds,
	colorOf,
	fileName,
	visibleItems,
	type ClipFilter,
	type ClipItem
} from "../clipboardModel";
import "./QuickPanel.css";
import "./ClipboardPanel.css";

interface ClipboardPanelProps {
	/** Fallback drag image for files without a thumbnail. */
	dragIcon: string | null;
	/** Called when a drag out of the panel starts and ends, so the surface
	 *  stays open meanwhile and releases its hover afterwards. */
	onDragStart: () => void;
	onDragEnd: () => void;
}

function timeAgo(ms: number): string {
	const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
	if (s < 60) return "now";
	if (s < 3600) return `${Math.floor(s / 60)}m`;
	if (s < 86400) return `${Math.floor(s / 3600)}h`;
	return `${Math.floor(s / 86400)}d`;
}

const label = (it: ClipItem) =>
	it.kind === "text"
		? it.text
		: it.kind === "image"
			? `Image · ${it.width}×${it.height}`
			: it.paths!.length === 1
				? fileName(it.paths![0])
				: `${fileName(it.paths![0])} + ${it.paths!.length - 1} more`;

export function ClipboardPanel({ dragIcon, onDragStart, onDragEnd }: ClipboardPanelProps) {
	const [items, setItems] = useState<ClipItem[]>([]);
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<ClipFilter>("all");
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [expandedId, setExpandedId] = useState<string | null>(null);
	const [clearOpen, setClearOpen] = useState(false);
	const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
	const [thumbSize, setThumbSize] = useState(() =>
		asThumbSize(localStorage.getItem("bloom-clipboard-thumb-size"))
	);
	const pointer = useRef<{ id: string; x: number; y: number; dragging: boolean } | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		invoke<Record<string, string>>("load_settings")
			.then((s) => setThumbSize(asThumbSize(s["bloom-clipboard-thumb-size"])))
			.catch(() => {});
	}, []);
	useSettingsSync({ "bloom-clipboard-thumb-size": (v) => setThumbSize(asThumbSize(v)) });

	// Typing works through useTextInputKeyboard (in the window's root); closing
	// the panel while typing hands the keyboard back too.
	useEffect(() => releaseTextKeyboard, []);

	useEffect(() => {
		const load = () => invoke<ClipItem[]>("clipboard_history").then(setItems).catch(() => {});
		load();
		const unlisten = listen("clipboard-history-changed", load);
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// Thumbnails for images and files (every file of an open group), via the shelf's previewer.
	useEffect(() => {
		const wanted = items.flatMap((it) =>
			it.image ? [it.image] : it.id === expandedId ? (it.paths ?? []) : (it.paths ?? []).slice(0, 1)
		);
		for (const path of wanted) {
			if (path in thumbs) continue;
			setThumbs((prev) => ({ ...prev, [path]: null }));
			invoke<{ thumb: string | null }>("shelf_thumbnail", { path })
				.then((p) => setThumbs((prev) => ({ ...prev, [path]: p.thumb })))
				.catch(() => {});
		}
	}, [items, thumbs, expandedId]);

	const shown = useMemo(() => visibleItems(items, query, filter), [items, query, filter]);

	const flashCopied = (id: string) => {
		setCopiedId(id);
		window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
	};
	const copy = (it: ClipItem) =>
		invoke("clipboard_copy", { id: it.id })
			.then(() => flashCopied(it.id))
			.catch((e) => console.error("[clipboard] copy failed:", e));
	const copyPath = (path: string) =>
		invoke("clipboard_copy_paths", { paths: [path] })
			.then(() => flashCopied(path))
			.catch((e) => console.error("[clipboard] copy failed:", e));

	// Click copies; moving 6px with the button down drags the files out instead.
	const beginPointer = (e: React.PointerEvent, key: string) => {
		if (e.button === 0) pointer.current = { id: key, x: e.clientX, y: e.clientY, dragging: false };
	};
	const movePointer = (e: React.PointerEvent, key: string, paths: string[]) => {
		const st = pointer.current;
		if (!st || st.id !== key || st.dragging) return;
		if (Math.hypot(e.clientX - st.x, e.clientY - st.y) < 6) return;
		const icon = thumbs[paths[0]] ?? dragIcon;
		if (!paths.length || !icon) return;
		st.dragging = true;
		onDragStart();
		startDrag({ item: paths, icon })
			.catch((err) => console.error("[clipboard] drag out failed:", err))
			.finally(onDragEnd);
	};
	const clicked = (e: React.MouseEvent, key: string, action: () => unknown) => {
		e.stopPropagation();
		const st = pointer.current;
		pointer.current = null;
		if (st && st.id === key && st.dragging) return;
		action();
	};
	const act = (e: React.MouseEvent, fn: () => unknown) => {
		e.stopPropagation();
		fn();
	};

	const clear = (hours: number) => {
		setClearOpen(false);
		const ids = clearIds(shown, hours, Date.now());
		if (ids.length) invoke("clipboard_delete_many", { ids }).catch(() => {});
	};

	const thumbPx = THUMB_SIZES[thumbSize];

	const thumbFor = (it: ClipItem) => {
		const color = colorOf(it);
		if (color) return <span className="clip-swatch" style={{ background: color }} />;
		const path = it.image ?? it.paths?.[0];
		const thumb = path ? thumbs[path] : null;
		if (thumb) return <img src={thumb} alt="" draggable={false} />;
		if (it.kind === "image") return <Image size={14} />;
		if (it.kind === "files") return it.paths!.length > 1 ? <Layers size={14} /> : <File size={14} />;
		return it.is_url ? <Link size={14} /> : <Type size={14} />;
	};

	return (
		<div
			className="qp clip-panel"
			style={{ "--clip-thumb": `${thumbPx}px` } as React.CSSProperties}
			onClick={(e) => {
				e.stopPropagation();
				setClearOpen(false);
			}}
		>
			<div className="clip-toolbar">
				<div className="clip-search">
					<Search size={12} />
					<input
						ref={searchRef}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Escape") {
								setQuery("");
								searchRef.current?.blur();
							}
						}}
						placeholder="Search clipboard"
						spellCheck={false}
					/>
				</div>
				<div className="clip-clear">
					<button
						className="qp-icon-btn"
						title="Clear unpinned items in this view"
						onClick={(e) => act(e, () => setClearOpen((o) => !o))}
					>
						<Eraser size={13} />
					</button>
					{clearOpen && (
						<div className="clip-menu">
							{CLEAR_WINDOWS.map(([hours, text]) => (
								<button key={hours} onClick={(e) => act(e, () => clear(hours))}>
									{text}
								</button>
							))}
						</div>
					)}
				</div>
			</div>

			<div className="clip-filters">
				{CLIP_FILTERS.map(([id, text]) => (
					<button
						key={id}
						className={filter === id ? "active" : ""}
						onClick={(e) => act(e, () => setFilter(id))}
					>
						{text}
					</button>
				))}
			</div>

			<div className="clip-list">
				{shown.length === 0 && (
					<div className="clip-empty">
						{query || filter !== "all" ? "Nothing here" : "Copied text, links, images and files appear here"}
					</div>
				)}
				{shown.map((it) => {
					const paths = it.image ? [it.image] : (it.paths ?? []);
					const draggable = it.kind !== "text";
					const group = it.kind === "files" && paths.length > 1;
					const expanded = group && expandedId === it.id;
					const color = colorOf(it);
					return (
						<div key={it.id} className={`clip-entry ${expanded ? "expanded" : ""}`}>
							<div
								className={`clip-row ${it.pinned ? "pinned" : ""}`}
								title={draggable ? "Click to copy, drag into an app" : "Click to copy"}
								onPointerDown={(e) => draggable && beginPointer(e, it.id)}
								onPointerMove={(e) => movePointer(e, it.id, paths)}
								onClick={(e) => clicked(e, it.id, () => copy(it))}
							>
								<div className={`clip-thumb ${group ? "stack" : ""}`}>
									{thumbFor(it)}
									{group && <span className="clip-count">{paths.length}</span>}
								</div>
								<div className="clip-body">
									<span className={`clip-text ${it.is_url ? "url" : ""} ${color ? "mono" : ""}`}>
										{label(it)}
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
									{group && (
										<>
											<button
												className={`qp-icon-btn clip-expand ${expanded ? "on" : ""}`}
												title={expanded ? "Collapse" : "Show files"}
												onClick={(e) => act(e, () => setExpandedId(expanded ? null : it.id))}
											>
												<ChevronDown size={12} />
											</button>
											<button
												className="qp-icon-btn"
												title="Ungroup into separate items"
												onClick={(e) => act(e, () => invoke("clipboard_split", { id: it.id }))}
											>
												<Ungroup size={12} />
											</button>
										</>
									)}
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
							{expanded &&
								paths.map((path) => (
									<div
										key={path}
										className="clip-row clip-sub"
										title="Click to copy this file, drag into an app"
										onPointerDown={(e) => beginPointer(e, path)}
										onPointerMove={(e) => movePointer(e, path, [path])}
										onClick={(e) => clicked(e, path, () => copyPath(path))}
									>
										<div className="clip-thumb">
											{thumbs[path] ? <img src={thumbs[path]!} alt="" draggable={false} /> : <File size={12} />}
										</div>
										<div className="clip-body">
											<span className="clip-text">{fileName(path)}</span>
											{copiedId === path && (
												<span className="clip-meta">
													<Check size={10} /> Copied
												</span>
											)}
										</div>
									</div>
								))}
						</div>
					);
				})}
			</div>
		</div>
	);
}
