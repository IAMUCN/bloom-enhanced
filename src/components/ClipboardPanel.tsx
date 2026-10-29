import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { ArrowLeft, Copy, Eraser, Layers, ListChecks, Pin, Search, Trash2, Ungroup, X } from "lucide-react";
import { releaseTextKeyboard } from "../hooks/useTextInputKeyboard";
import { useClipboardSettings } from "../hooks/useClipboardSettings";
import { clipSounds } from "../clipboardSounds";
import { ClipTile } from "./ClipTile";
import {
	CLEAR_WINDOWS,
	CLIP_FILTERS,
	THUMB_SIZES,
	clearIds,
	filePaths,
	visibleItems,
	type ClipFilter,
	type ClipItem
} from "../clipboardModel";
import "./QuickPanel.css";
import "./ClipboardPanel.css";

interface ClipboardPanelProps {
	/** Fallback drag image for files without a thumbnail. */
	dragIcon: string | null;
	/** The window's drop event (`shelf-drag-drop` / `clipshelf-drag-drop`):
	 *  dropping one of our own tiles onto another groups them. */
	dropEvent: string;
	/** Called when a drag out of the panel starts and ends, so the surface
	 *  stays open meanwhile and releases its hover afterwards. */
	onDragStart: () => void;
	onDragEnd: () => void;
}

const openLink = (url: string) => openUrl(/^https?:/i.test(url) ? url : `https://${url}`);

export function ClipboardPanel({ dragIcon, dropEvent, onDragStart, onDragEnd }: ClipboardPanelProps) {
	const options = useClipboardSettings();
	const [items, setItems] = useState<ClipItem[]>([]);
	const [query, setQuery] = useState("");
	const [filter, setFilter] = useState<ClipFilter>("all");
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [groupId, setGroupId] = useState<string | null>(null);
	const [selecting, setSelecting] = useState(false);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [clearOpen, setClearOpen] = useState(false);
	const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
	const pointer = useRef<{ id: string; x: number; y: number; dragging: boolean } | null>(null);
	// The tile being dragged out, so dropping it back on another tile groups them.
	const dragSource = useRef<string | null>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	const sound = (name: keyof typeof clipSounds) => options.sounds && clipSounds[name]();

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

	useEffect(() => {
		const unlisten = listen<{ position?: { x: number; y: number } }>(dropEvent, (e) => {
			const source = dragSource.current;
			const pos = e.payload.position;
			if (!source || !pos) return;
			const el = document.elementFromPoint(pos.x / devicePixelRatio, pos.y / devicePixelRatio);
			const target = el?.closest<HTMLElement>("[data-clip-id]")?.dataset.clipId;
			if (target && target !== source) {
				invoke("clipboard_group", { ids: [target, source] })
					.then(() => sound("pop"))
					.catch(() => {});
			}
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, [dropEvent, options.sounds]);

	const group = groupId ? items.find((it) => it.id === groupId && it.kind === "files") : undefined;
	useEffect(() => {
		if (groupId && !group) setGroupId(null);
	}, [groupId, group]);

	// Drop selections of items that are gone; leave select mode when it's turned off.
	useEffect(() => {
		if (!options.multiSelect) setSelecting(false);
		setSelected((prev) => {
			const next = new Set([...prev].filter((id) => options.multiSelect && items.some((it) => it.id === id)));
			return next.size === prev.size ? prev : next;
		});
	}, [items, options.multiSelect]);

	const shown = useMemo(() => visibleItems(items, query, filter), [items, query, filter]);

	// Thumbnails for images and files (the first three of a stack, or every
	// file of the open group), via the shelf's previewer.
	useEffect(() => {
		const wanted = group ? (group.paths ?? []) : shown.flatMap((it) => filePaths(it).slice(0, 3));
		for (const path of wanted) {
			if (path in thumbs) continue;
			setThumbs((prev) => ({ ...prev, [path]: null }));
			invoke<{ thumb: string | null }>("shelf_thumbnail", { path })
				.then((p) => setThumbs((prev) => ({ ...prev, [path]: p.thumb })))
				.catch(() => {});
		}
	}, [shown, group, thumbs]);

	const flashCopied = (id: string) => {
		sound("copy");
		setCopiedId(id);
		window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
	};
	const copy = (it: ClipItem) =>
		invoke("clipboard_copy", { id: it.id })
			.then(() => flashCopied(it.id))
			.catch((e) => console.error("[clipboard] copy failed:", e));
	const copyPaths = (paths: string[], key: string) =>
		invoke("clipboard_copy_paths", { paths })
			.then(() => flashCopied(key))
			.catch((e) => console.error("[clipboard] copy failed:", e));
	const remove = (ids: string[]) => {
		sound("delete");
		invoke("clipboard_delete_many", { ids }).catch(() => {});
	};
	const pin = (ids: string[], pinned: boolean) => {
		sound("pop");
		ids.forEach((id) => invoke("clipboard_pin", { id, pinned }).catch(() => {}));
	};

	// Moving 6px with the button down drags the item out: files and images as
	// files, text as text. Anything else is a click.
	const beginPointer = (e: React.PointerEvent, key: string) => {
		if (e.button === 0) pointer.current = { id: key, x: e.clientX, y: e.clientY, dragging: false };
	};
	const movePointer = (e: React.PointerEvent, key: string, source: ClipItem | null, paths: string[], text?: string) => {
		const st = pointer.current;
		if (!st || st.id !== key || st.dragging || selecting) return;
		if (Math.hypot(e.clientX - st.x, e.clientY - st.y) < 6) return;
		const icon = (paths[0] && thumbs[paths[0]]) || dragIcon;
		let drag: Promise<unknown>;
		if (paths.length && icon) drag = startDrag({ item: paths, icon });
		else if (text) drag = invoke("clipboard_drag_text", { text });
		else return;
		st.dragging = true;
		dragSource.current = source?.id ?? null;
		onDragStart();
		drag.catch((err) => console.error("[clipboard] drag out failed:", err)).finally(() => {
			// The drop event can land just after the drag call returns.
			window.setTimeout(() => (dragSource.current = null), 300);
			onDragEnd();
		});
	};
	// True when this click ends a drag rather than being a click.
	const wasDrag = (key: string) => {
		const st = pointer.current;
		pointer.current = null;
		return !!st && st.id === key && st.dragging;
	};

	const toggleSelected = (id: string) =>
		setSelected((prev) => {
			const next = new Set(prev);
			if (!next.delete(id)) next.add(id);
			return next;
		});

	const clickItem = (e: React.MouseEvent, it: ClipItem) => {
		e.stopPropagation();
		if (wasDrag(it.id)) return;
		if (options.multiSelect && (selecting || e.ctrlKey || e.shiftKey)) return toggleSelected(it.id);
		if (it.kind === "files" && (it.paths?.length ?? 0) > 1) return setGroupId(it.id);
		copy(it);
	};

	const clear = (hours: number) => {
		setClearOpen(false);
		const ids = clearIds(shown, hours, Date.now());
		if (ids.length) remove(ids);
	};

	const picked = items.filter((it) => selected.has(it.id));
	const pickedFiles = picked.filter((it) => it.kind !== "text");
	const endSelection = () => {
		setSelected(new Set());
		setSelecting(false);
	};

	const tile = (it: ClipItem, key = it.id, paths = filePaths(it), onClick?: (e: React.MouseEvent) => void) => (
		<ClipTile
			key={key}
			item={it}
			thumbs={thumbs}
			linkPreviews={options.linkPreviews}
			notes={options.notes}
			richText={options.richText}
			copied={copiedId === key}
			selected={selected.has(key)}
			onPointerDown={(e) => beginPointer(e, key)}
			onPointerMove={(e) => movePointer(e, key, onClick ? null : it, paths, it.kind === "text" ? it.text : undefined)}
			onClick={onClick ?? ((e) => clickItem(e, it))}
			{...(onClick
				? {}
				: {
						onPin: () => pin([it.id], !it.pinned),
						onDelete: () => remove([it.id]),
						onOpenLink: it.is_url && it.text ? () => openLink(it.text!) : undefined,
						onUngroup: () => invoke("clipboard_split", { id: it.id }).catch(() => {}),
						onSaveNote: (note: string) => {
							if (note.trim() !== (it.note ?? "")) invoke("clipboard_set_note", { id: it.id, note }).catch(() => {});
						}
					})}
		/>
	);

	return (
		<div
			className="qp clip-panel"
			style={{ "--clip-tile": `${THUMB_SIZES[options.thumbSize]}px` } as React.CSSProperties}
			onClick={(e) => {
				e.stopPropagation();
				setClearOpen(false);
			}}
			onKeyDown={(e) => {
				if (e.key === "Escape" && (selected.size || selecting)) endSelection();
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
						placeholder="Search clipboard and notes"
						spellCheck={false}
					/>
				</div>
				{options.multiSelect && (
					<button
						className={`qp-icon-btn ${selecting ? "on" : ""}`}
						title={selecting ? "Done selecting" : "Select several (or Ctrl-click)"}
						onClick={(e) => {
							e.stopPropagation();
							if (selecting) endSelection();
							else setSelecting(true);
						}}
					>
						<ListChecks size={13} />
					</button>
				)}
				<div className="clip-clear">
					<button
						className="qp-icon-btn"
						title="Clear unpinned items in this view"
						onClick={(e) => {
							e.stopPropagation();
							setClearOpen((o) => !o);
						}}
					>
						<Eraser size={13} />
					</button>
					{clearOpen && (
						<div className="clip-menu">
							{CLEAR_WINDOWS.map(([hours, text]) => (
								<button
									key={hours}
									onClick={(e) => {
										e.stopPropagation();
										clear(hours);
									}}
								>
									{text}
								</button>
							))}
						</div>
					)}
				</div>
			</div>

			{group ? (
				<div className="clip-bar">
					<button title="Back" onClick={() => setGroupId(null)}>
						<ArrowLeft size={12} />
					</button>
					<span className="clip-bar-title">{group.paths!.length} files</span>
					<button title="Copy all files" onClick={() => copy(group)}>
						<Copy size={11} /> {copiedId === group.id ? "Copied" : "Copy all"}
					</button>
					<button title="Ungroup into separate items" onClick={() => invoke("clipboard_split", { id: group.id })}>
						<Ungroup size={11} /> Ungroup
					</button>
				</div>
			) : selected.size || selecting ? (
				<div className="clip-bar">
					<span className="clip-bar-title">{selected.size ? `${selected.size} selected` : "Click items to select"}</span>
					{picked.length >= 2 && (
						<button
							title="Group into one stack (text becomes a .txt file)"
							onClick={() =>
								invoke("clipboard_group", { ids: picked.map((it) => it.id) })
									.then(() => {
										sound("pop");
										endSelection();
									})
									.catch(() => {})
							}
						>
							<Layers size={11} /> Group
						</button>
					)}
					{pickedFiles.length > 0 && pickedFiles.length === picked.length && (
						<button title="Copy all files" onClick={() => copyPaths(pickedFiles.flatMap(filePaths), "selection")}>
							<Copy size={11} /> {copiedId === "selection" ? "Copied" : "Copy"}
						</button>
					)}
					{picked.length > 0 && (
						<>
							<button title="Pin or unpin" onClick={() => pin(picked.map((it) => it.id), !picked.every((it) => it.pinned))}>
								<Pin size={11} />
							</button>
							<button
								title="Delete"
								onClick={() => {
									remove(picked.map((it) => it.id));
									endSelection();
								}}
							>
								<Trash2 size={11} />
							</button>
						</>
					)}
					<button title="Done" onClick={endSelection}>
						<X size={12} />
					</button>
				</div>
			) : (
				<div className="clip-filters">
					{CLIP_FILTERS.map(([id, text]) => (
						<button
							key={id}
							className={filter === id ? "active" : ""}
							onClick={(e) => {
								e.stopPropagation();
								setFilter(id);
							}}
						>
							{text}
						</button>
					))}
				</div>
			)}

			<div className="clip-grid">
				{group
					? group.paths!.map((path) =>
							tile(
								{ ...group, id: path, paths: [path], note: undefined, pinned: false, hits: 1 },
								path,
								[path],
								(e) => {
									e.stopPropagation();
									if (!wasDrag(path)) copyPaths([path], path);
								}
							)
						)
					: shown.map((it) => tile(it))}
				{!group && shown.length === 0 && (
					<div className="clip-empty">
						{query || filter !== "all" ? "Nothing here" : "Copied text, links, images and files appear here"}
					</div>
				)}
			</div>
		</div>
	);
}
