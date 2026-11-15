import { useRef, useState } from "react";
import { Reorder } from "framer-motion";
import { ArrowLeft, BellRing, ChevronRight, GripVertical, Plus, Trash2, X } from "lucide-react";
import { ask } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { SettingRow } from "./SettingRow";
import {
	EXTRA_BY_ID,
	EXTRA_TOOLS,
	MAX_TABS,
	TOOLS,
	orderTabs,
	parseEnabledTools,
	type ExtraToolId,
	type Tool,
	type ToolId
} from "../tools";
import { CC_BY_ID, CC_DEFAULT, CC_MAX_ICONS, CC_TILES, ccIsWide, parseCcTiles, type CcTileId } from "../components/CommandCenter";
import { NOTCH_PANEL_ORDER } from "../notchLayout";

type Save = (key: string, value: string | null) => Promise<boolean>;

/** One line per built-in tool. */
const BUILT_IN_DESC: Record<ToolId, string> = {
	"command-center": "Quick settings, volume and brightness",
	music: "What's playing, or \"Nothing's playing\" while idle",
	calendar: "Month, today's events and the timer",
	devices: "Batteries of your connected devices",
	clipboard: "Clipboard history, while the Shelf sits in the notch"
};
const BUILT_IN: ToolId[] = ["command-center", "music", "calendar", "devices", "clipboard"];

interface ToolsTabProps {
	saveSetting: Save;
	calendarEnabled: boolean;
	toggleCalendar: () => void;
	controlsPanelEnabled: boolean;
	toggleControlsPanel: () => void;
	devicesPanelEnabled: boolean;
	toggleDevicesPanel: () => void;
	musicModeEnabled: boolean;
	toggleMusicMode: () => void;
	enabledPanelCount: number;
	timerSoundEnabled: boolean;
	toggleTimerSound: () => void;
	/** The Shelf's tab follows the Shelf's position: its card opens that page. */
	openShelf: () => void;
	clipboardEnabled: boolean;
	clipboardPosition: string;
	/** The open tool page, if any (kept by Settings so search and Esc can reach it). */
	page: string | null;
	setPage: (page: string | null) => void;
}

/** Settings › Tools: every notch tool as a card. "In your notch" holds the
 *  ones that are on, dragged into the tab bar's order (`bloom-tab-order`);
 *  "Available" holds the rest. At most 15 (MAX_TABS). A card's › opens the
 *  tool's own page. */
export function ToolsTab(props: ToolsTabProps) {
	const { saveSetting, page, setPage } = props;
	const [extras, setExtras] = useState(() => parseEnabledTools(localStorage.getItem("bloom-tools-enabled")));
	// From the live settings: the Shelf's position isn't always mirrored here.
	const shelfInNotch = props.clipboardEnabled && props.clipboardPosition === "notch";
	const builtInOn: Record<ToolId, boolean> = {
		"command-center": props.controlsPanelEnabled,
		music: props.musicModeEnabled,
		calendar: props.calendarEnabled,
		devices: props.devicesPanelEnabled,
		clipboard: shelfInNotch
	};
	const isOn = (id: string) => (id in builtInOn ? builtInOn[id as ToolId] : extras.includes(id as ExtraToolId));
	const all: Tool[] = [...BUILT_IN.map((id) => TOOLS[id]), ...EXTRA_TOOLS];
	const [order, setOrder] = useState(() =>
		orderTabs(all.filter((t) => isOn(t.id)), localStorage.getItem("bloom-tab-order")).map((t) => t.id)
	);
	// Keep the list in step with switches: new ones go last, off ones leave.
	const onIds = [...order.filter(isOn), ...all.filter((t) => isOn(t.id) && !order.includes(t.id)).map((t) => t.id)];
	const latest = useRef(onIds);
	latest.current = onIds;
	const full = onIds.length >= MAX_TABS;

	const saveOrder = (ids: string[]) => {
		saveSetting("bloom-tab-order", JSON.stringify(ids));
		// The wheel cycles the built-in panels in the same order.
		const panels = ids.filter((id): id is (typeof NOTCH_PANEL_ORDER)[number] =>
			(NOTCH_PANEL_ORDER as readonly string[]).includes(id)
		);
		saveSetting("bloom-notch-panel-order", JSON.stringify([...panels, ...NOTCH_PANEL_ORDER.filter((p) => !panels.includes(p))]));
	};
	const lastPanel = (on: boolean) => on && props.enabledPanelCount <= 1;
	const toggle = (id: string) => {
		const on = isOn(id);
		if (!on && full) return;
		if (id in EXTRA_BY_ID) {
			const next = on ? extras.filter((t) => t !== id) : [...extras, id as ExtraToolId];
			setExtras(next);
			saveSetting("bloom-tools-enabled", JSON.stringify(next));
		} else if (id === "command-center") props.toggleControlsPanel();
		else if (id === "calendar") props.toggleCalendar();
		else if (id === "devices") props.toggleDevicesPanel();
		else if (id === "music") props.toggleMusicMode();
		if (!on) setOrder([...onIds, id]);
	};
	const locked = (id: string) =>
		(id === "command-center" || id === "calendar" || id === "devices") && lastPanel(isOn(id));
	const hasPage = (id: string) => id === "command-center" || id === "calendar" || id === "clipboard" || id in EXTRA_BY_ID;

	if (page) {
		const tool = all.find((t) => t.id === page);
		if (tool) return <ToolPage tool={tool} {...props} />;
	}

	const card = (tool: Tool, draggable: boolean) => {
		const on = isOn(tool.id);
		const Icon = tool.icon;
		const desc = tool.id in EXTRA_BY_ID ? EXTRA_BY_ID[tool.id as ExtraToolId].desc : BUILT_IN_DESC[tool.id as ToolId];
		const isShelf = tool.id === "clipboard";
		const control = isShelf ? (
			<span className="tools-card-note">
				{!props.clipboardEnabled ? "Shelf is off" : on ? "In the notch" : `On the ${props.clipboardPosition} edge`}
			</span>
		) : (
			<label
				className="toggle-switch"
				title={
					locked(tool.id)
						? "The notch needs at least one panel"
						: !on && full
							? `The tab bar holds ${MAX_TABS} tools: turn one off first`
							: undefined
				}
				onPointerDown={(e) => e.stopPropagation()}
				onClick={(e) => e.stopPropagation()}
			>
				<input
					type="checkbox"
					checked={on}
					disabled={locked(tool.id) || (!on && full)}
					onChange={() => toggle(tool.id)}
					aria-label={`${tool.label} on`}
				/>
				<span className="slider"></span>
			</label>
		);
		const body = (
			<>
				{draggable ? <GripVertical size={14} className="radial-grip" /> : <span className="tools-card-grip-space" />}
				<span className="tools-card-icon" style={{ color: tool.color }}>
					<Icon size={16} />
				</span>
				<span className="tool-card-text">
					<span className="radial-row-label">{tool.label}</span>
					<span className="tool-card-desc">{desc}</span>
				</span>
				{control}
				{hasPage(tool.id) ? (
					<button
						type="button"
						className="tools-card-open"
						aria-label={`${tool.label} settings`}
						onPointerDown={(e) => e.stopPropagation()}
						onClick={() => (isShelf ? props.openShelf() : setPage(tool.id))}
					>
						<ChevronRight size={16} />
					</button>
				) : (
					<span className="tools-card-open" aria-hidden />
				)}
			</>
		);
		return draggable ? (
			<Reorder.Item
				key={tool.id}
				value={tool.id}
				className="tools-card on"
				whileDrag={{ scale: 1.02, zIndex: 2, boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}
				onDragEnd={() => saveOrder(latest.current)}
			>
				{body}
			</Reorder.Item>
		) : (
			<div key={tool.id} className={`tools-card${on ? " on" : ""}`}>
				{body}
			</div>
		);
	};

	const available = all.filter((t) => !isOn(t.id)).sort((a, b) => a.label.localeCompare(b.label));
	return (
		<>
			<div className="setting-group-label">In your notch · drag to set the tab order</div>
			<Reorder.Group axis="y" values={onIds} onReorder={setOrder} className="tools-list">
				{onIds.map((id) => card(all.find((t) => t.id === id)!, true))}
			</Reorder.Group>
			{available.length > 0 && (
				<>
					<div className="setting-group-label">Available</div>
					<div className="tools-list">{available.map((t) => card(t, false))}</div>
				</>
			)}
		</>
	);
}

/** A tool's own page: back to Tools, then its options. */
function ToolPage({ tool, setPage, saveSetting, timerSoundEnabled, toggleTimerSound, calendarEnabled }: ToolsTabProps & { tool: Tool }) {
	const extra = tool.id in EXTRA_BY_ID ? EXTRA_BY_ID[tool.id as ExtraToolId] : null;
	const Icon = tool.icon;
	const erase = async () => {
		const ok = await ask(`Erase everything ${tool.label} has saved? This can't be undone.`, {
			title: `Erase ${tool.label} data`,
			kind: "warning"
		});
		// A merged tool keeps each part's data in its own file.
		if (ok) for (const part of extra?.parts ?? []) invoke("tool_data_erase", { tool: part }).catch(() => {});
	};
	return (
		<>
			<button type="button" className="tools-back" onClick={() => setPage(null)}>
				<ArrowLeft size={14} />
				Tools
			</button>
			<div className="tools-page-title">
				<span className="tools-card-icon" style={{ color: tool.color }}>
					<Icon size={18} />
				</span>
				<div>
					<h2>{tool.label}</h2>
					<p>{extra?.desc ?? BUILT_IN_DESC[tool.id as ToolId]}</p>
				</div>
			</div>

			{tool.id === "command-center" && (
				<>
					<div className="setting-group-label">Tiles</div>
					<div className="setting-group">
						<div className="page-order-wrap">
							<CcTilePicker saveSetting={saveSetting} />
						</div>
					</div>
				</>
			)}

			{tool.id === "calendar" && (
				<>
					<div className="setting-group-label">Timer</div>
					<div className="setting-group">
						<SettingRow icon={BellRing} label="Timer Sound" desc="Play a chime when the timer finishes" divider={false}>
							<label className="toggle-switch">
								<input type="checkbox" checked={timerSoundEnabled} disabled={!calendarEnabled} onChange={toggleTimerSound} />
								<span className="slider"></span>
							</label>
						</SettingRow>
					</div>
				</>
			)}

			{extra && (
				<>
					<div className="setting-group-label">Data</div>
					<div className="setting-group">
						<SettingRow icon={Trash2} label="Erase Data" desc={`Delete what ${tool.label} has saved on this PC`} divider={false}>
							<button type="button" className="tools-erase" onClick={erase}>
								Erase
							</button>
						</SettingRow>
					</div>
				</>
			)}
		</>
	);
}

/** Tools › Command Center: which round tiles show and in what order
 *  (`bloom-cc-tiles`). Wi-Fi and Bluetooth are always first; up to 14 round
 *  tiles, dragged into order; the rest wait below to be added. */
function CcTilePicker({ saveSetting }: { saveSetting: Save }) {
	const [tiles, setTiles] = useState(() => parseCcTiles(localStorage.getItem("bloom-cc-tiles")));
	const latest = useRef(tiles);
	latest.current = tiles;
	const save = (next: CcTileId[]) => {
		const clean = parseCcTiles(JSON.stringify(next));
		setTiles(clean);
		saveSetting("bloom-cc-tiles", JSON.stringify(clean));
	};
	const dockOff = localStorage.getItem("bloom-dock-enabled") === "false";
	const round = tiles.filter((t) => !ccIsWide(t));
	const full = round.length >= CC_MAX_ICONS;
	const rest = CC_TILES.filter(([id]) => !ccIsWide(id) && !tiles.includes(id));
	const color = TOOLS["command-center"].color;
	return (
		<>
			<div className="cc-picker-count">
				{round.length} of {CC_MAX_ICONS} tiles · drag to reorder · Wi-Fi and Bluetooth stay on top
			</div>
			<Reorder.Group
				axis="y"
				values={round}
				onReorder={(next) => setTiles(["wifi", "bluetooth", ...next])}
				className="radial-rows page-order tool-cards cc-order"
			>
				{round.map((id) => {
					const [, label, Icon] = CC_BY_ID[id];
					const off = id === "dock-mode" && dockOff;
					return (
						<Reorder.Item
							key={id}
							value={id}
							className={`radial-row tool-card${off ? " off" : ""}`}
							whileDrag={{ scale: 1.03, zIndex: 2 }}
							onDragEnd={() => save(latest.current)}
						>
							<GripVertical size={13} className="radial-grip" />
							<span className="tool-card-icon" style={{ color }}>
								<Icon size={16} />
							</span>
							<span className="tool-card-text">
								<span className="radial-row-label">{label}</span>
								{off && <span className="tool-card-desc">Dock is off: hidden until you turn the dock on</span>}
							</span>
							<button
								type="button"
								className="tool-erase"
								aria-label={`Remove ${label}`}
								title={`Remove ${label}`}
								onPointerDown={(e) => e.stopPropagation()}
								onClick={() => save(tiles.filter((t) => t !== id))}
							>
								<X size={13} />
							</button>
						</Reorder.Item>
					);
				})}
			</Reorder.Group>
			{rest.length > 0 && (
				<>
					<div className="cc-picker-count">Add a tile</div>
					<div className="pick-tools-grid cc-tile-picker">
						{rest.map(([id, label, Icon]) => {
							const blocked = id === "dock-mode" && dockOff;
							return (
								<button
									key={id}
									type="button"
									disabled={blocked || full}
									title={
										blocked
											? "The dock is off. Turn it on in Settings › Dock to use this tile"
											: full
												? "The Command Center holds 14 tiles: remove one first"
												: `Add ${label}`
									}
									className="pick-tool"
									onClick={() => save([...tiles, id])}
								>
									<span className="tool-card-icon" style={{ color }}>
										<Icon size={16} />
									</span>
									<span className="pick-tool-label">
										{label}
										{blocked && <span className="pick-tool-note">Dock is off</span>}
									</span>
									<span className="pick-check">
										<Plus size={12} strokeWidth={3} />
									</span>
								</button>
							);
						})}
					</div>
				</>
			)}
			<button type="button" className="cc-tiles-reset" onClick={() => save(CC_DEFAULT)}>
				Reset to default
			</button>
		</>
	);
}
