import { useEffect, useRef, useState } from "react";
import {
	Check,
	ExternalLink,
	File,
	Image,
	Link,
	Pin,
	PinOff,
	StickyNote,
	Trash2,
	Type,
	Ungroup
} from "lucide-react";
import { colorOf, fileName, filePaths, linkInfo, type ClipItem } from "../clipboardModel";

export interface ClipTileProps {
	item: ClipItem;
	/** Thumbnails by file path (data URIs); missing ones show an icon. */
	thumbs: Record<string, string | null>;
	linkPreviews: boolean;
	notes: boolean;
	richText: boolean;
	copied?: boolean;
	selected?: boolean;
	onPointerDown?: (e: React.PointerEvent) => void;
	onPointerMove?: (e: React.PointerEvent) => void;
	onClick?: (e: React.MouseEvent) => void;
	onPin?: () => void;
	onDelete?: () => void;
	onOpenLink?: () => void;
	onUngroup?: () => void;
	onSaveNote?: (note: string) => void;
}

function timeAgo(ms: number): string {
	const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
	if (s < 60) return "now";
	if (s < 3600) return `${Math.floor(s / 60)}m`;
	if (s < 86400) return `${Math.floor(s / 3600)}h`;
	return `${Math.floor(s / 86400)}d`;
}

const extension = (path: string) => (fileName(path).split(".").pop() ?? "").slice(0, 4).toUpperCase();

/** One clipboard entry as a card, in the style of Bloom's shelf tiles. File
 *  groups show as a fanned stack of their first three files. */
export function ClipTile(props: ClipTileProps) {
	const { item, thumbs, linkPreviews, notes, richText, copied, selected } = props;
	const [editing, setEditing] = useState(false);
	const noteRef = useRef<HTMLInputElement>(null);
	useEffect(() => {
		if (editing) noteRef.current?.focus();
	}, [editing]);

	const color = colorOf(item);
	const link = item.is_url && linkPreviews && item.text ? linkInfo(item.text) : null;
	const paths = filePaths(item);
	const group = item.kind === "files" && paths.length > 1;

	const fileFace = (path: string) =>
		thumbs[path] ? (
			<img src={thumbs[path]!} alt="" draggable={false} />
		) : (
			<span className="ctile-file-icon">
				<File size={20} strokeWidth={1.5} />
				<small>{extension(path)}</small>
			</span>
		);

	let preview: React.ReactNode;
	let name: string;
	if (color) {
		preview = <span className="ctile-swatch" style={{ background: color }} />;
		name = color;
	} else if (item.kind === "text") {
		preview = link ? (
			<div className="ctile-link">
				<span className="ctile-link-badge" style={{ background: `hsl(${link.hue} 55% 45%)` }}>
					{link.letter}
				</span>
				<span className="ctile-link-title">{link.title}</span>
			</div>
		) : (
			<div className="ctile-text">
				{item.is_url ? <Link size={11} className="ctile-text-icon" /> : <Type size={11} className="ctile-text-icon" />}
				<div className="ctile-text-body">{item.text}</div>
			</div>
		);
		name = link ? link.domain : item.is_url ? "Link" : "Text";
	} else if (group) {
		preview = (
			<div className="ctile-stack">
				{paths
					.slice(0, 3)
					.reverse()
					.map((path, i, shown) => (
						<div key={path} className={`ctile-card layer-${shown.length - 1 - i}`}>
							{fileFace(path)}
						</div>
					))}
				<span className="ctile-count">{paths.length}</span>
			</div>
		);
		name = `${paths.length} ${paths.every((p) => /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic)$/i.test(p)) ? "images" : "files"}`;
	} else if (item.kind === "image") {
		preview = paths[0] && thumbs[paths[0]] ? <img src={thumbs[paths[0]]!} alt="" draggable={false} /> : <Image size={20} />;
		name = `Image · ${item.width}×${item.height}`;
	} else {
		preview = paths[0] ? fileFace(paths[0]) : <File size={20} />;
		name = paths[0] ? fileName(paths[0]) : "File";
	}

	const stop = (fn?: () => void) => (e: React.MouseEvent) => {
		e.stopPropagation();
		fn?.();
	};

	return (
		<div
			className={`ctile ${item.kind === "text" && !color ? "is-text" : ""} ${item.pinned ? "pinned" : ""} ${selected ? "selected" : ""}`}
			data-clip-id={item.id}
			onPointerDown={props.onPointerDown}
			onPointerMove={props.onPointerMove}
			onClick={props.onClick}
		>
			<div className="ctile-preview">
				{preview}
				{richText && item.html && <span className="ctile-chip">Rich</span>}
				{item.pinned && (
					<span className="ctile-pin" title="Pinned">
						<Pin size={10} />
					</span>
				)}
				{selected && (
					<span className="ctile-check">
						<Check size={11} strokeWidth={3} />
					</span>
				)}
				<div className="ctile-actions">
					{link && props.onOpenLink && (
						<button title="Open link" onClick={stop(props.onOpenLink)}>
							<ExternalLink size={11} />
						</button>
					)}
					{props.onUngroup && (
						<button title={group ? "Ungroup" : "Take out of the group"} onClick={stop(props.onUngroup)}>
							<Ungroup size={11} />
						</button>
					)}
					{notes && props.onSaveNote && (
						<button title={item.note ? "Edit note" : "Add note"} onClick={stop(() => setEditing(true))}>
							<StickyNote size={11} />
						</button>
					)}
					{props.onPin && (
						<button title={item.pinned ? "Unpin" : "Pin (kept through cleanup)"} onClick={stop(props.onPin)}>
							{item.pinned ? <PinOff size={11} /> : <Pin size={11} />}
						</button>
					)}
					{props.onDelete && (
						<button title="Delete" onClick={stop(props.onDelete)}>
							<Trash2 size={11} />
						</button>
					)}
				</div>
			</div>
			<div className="ctile-name">{name}</div>
			{editing ? (
				<input
					ref={noteRef}
					className="ctile-note-input"
					defaultValue={item.note ?? ""}
					placeholder="Note or #tags"
					maxLength={500}
					onClick={(e) => e.stopPropagation()}
					onPointerDown={(e) => e.stopPropagation()}
					onKeyDown={(e) => {
						e.stopPropagation();
						if (e.key === "Enter") {
							props.onSaveNote?.(e.currentTarget.value);
							setEditing(false);
						}
						if (e.key === "Escape") setEditing(false);
					}}
					onBlur={(e) => {
						props.onSaveNote?.(e.currentTarget.value);
						setEditing(false);
					}}
				/>
			) : notes && item.note ? (
				<div className="ctile-note" title={item.note}>
					<StickyNote size={9} /> {item.note}
				</div>
			) : (
				<div className="ctile-meta">
					{copied ? (
						<>
							<Check size={9} /> Copied
						</>
					) : (
						<>
							{timeAgo(item.captured_at)}
							{item.hits > 1 && ` · ${item.hits}×`}
						</>
					)}
				</div>
			)}
		</div>
	);
}
