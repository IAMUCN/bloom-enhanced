import { useEffect, useRef, useState } from "react";
import { AnimatePresence, Reorder, motion } from "framer-motion";
import { invoke } from "@tauri-apps/api/core";
import { ArrowBigUp, ChevronRight, EyeOff, GripVertical, Hand, Keyboard, MapPin, Orbit, Timer, Zap } from "lucide-react";
import { useSettingsSync } from "../hooks/useSettingsSync";
import { MODE_LABEL, ordered, parseLayout, type OrbitLayout, type OrbitMode, type OrbitOp } from "../orbitOps";
import { ORBIT_ICONS } from "../orbitIcons";
import { shortcutFrom } from "./ClipboardTab";
import { SettingRow } from "./SettingRow";

const DEFAULT_SHORTCUT = "Ctrl+Alt+Space";
const on = (v: unknown) => v !== false && v !== "false";
const SPRING = { type: "spring", stiffness: 500, damping: 30 } as const;
const KEYS = ["bloom-files-hidden", "bloom-files-order", "bloom-files-mode-order"];

/** A small radial menu drawing: the options of one menu around a hub. */
function RadialPreview({ ops, size, label }: { ops: OrbitOp[]; size: number; label?: string }) {
	const c = size / 2;
	const outer = size / 2 - 2;
	const inner = outer * 0.42;
	const step = 360 / Math.max(1, ops.length);
	const gap = ops.length > 1 ? 2.5 : 0;
	const at = (r: number, deg: number) => [c + r * Math.cos((deg * Math.PI) / 180), c + r * Math.sin((deg * Math.PI) / 180)];
	const slice = (a0: number, a1: number) => {
		const large = a1 - a0 > 180 ? 1 : 0;
		const [x0, y0] = at(outer, a0);
		const [x1, y1] = at(outer, a1);
		const [x2, y2] = at(inner, a1);
		const [x3, y3] = at(inner, a0);
		return `M${x0} ${y0} A${outer} ${outer} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${inner} ${inner} 0 ${large} 0 ${x3} ${y3}Z`;
	};
	const big = size >= 160;
	return (
		<svg width={size} height={size} className="radial-preview">
			<circle cx={c} cy={c} r={outer + 1} className="radial-preview-disc" />
			{ops.map((op, i) => {
				const mid = -90 + i * step;
				const [lx, ly] = at((outer + inner) / 2, mid);
				const Icon = op.icon ? ORBIT_ICONS[op.icon] : undefined;
				return (
					<motion.g
						key={op.id}
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ delay: i * 0.02 }}
						className="radial-preview-slice"
					>
						<path
							d={ops.length === 1 ? `${slice(-90, 89.99)} ${slice(90, 269.99)}` : slice(mid - step / 2 + gap, mid + step / 2 - gap)}
						/>
						{big || !Icon ? (
							<foreignObject x={lx - 30} y={ly - 15} width={60} height={30}>
								<div className={`radial-preview-label${big ? " big" : ""}`}>
									{big && Icon && <Icon size={12} strokeWidth={1.75} />}
									<span>{Icon || big ? op.label : op.label.slice(0, 4)}</span>
								</div>
							</foreignObject>
						) : (
							<Icon x={lx - 5} y={ly - 5} width={10} height={10} strokeWidth={2} className="radial-preview-icon" />
						)}
					</motion.g>
				);
			})}
			<circle cx={c} cy={c} r={inner - 3} className="radial-preview-hub" />
			{label && (
				<text x={c} y={c + 4} textAnchor="middle" className={`radial-preview-hub-text${big ? " big" : ""}`}>
					{label}
				</text>
			)}
		</svg>
	);
}

/** Settings › Radial Menu: OrbitDrop's convert / tools / actions menu. */
export function FilesTab({ saveSetting }: { saveSetting: (key: string, value: string | null) => Promise<boolean> }) {
	const [s, setS] = useState<Record<string, unknown>>({});
	const [editing, setEditing] = useState<OrbitMode | null>(null);

	useEffect(() => {
		invoke<Record<string, string>>("load_settings")
			.then(setS)
			.catch(() => {});
	}, []);
	const keep = (key: string) => (v: unknown) => setS((r) => ({ ...r, [key]: v }));
	useSettingsSync(
		Object.fromEntries(
			[
				"bloom-files-enabled",
				"bloom-files-drag",
				"bloom-files-shift-tap",
				"bloom-files-shortcut",
				"bloom-files-status-at",
				"bloom-files-status-seconds",
				...KEYS
			].map((k) => [k, keep(k)])
		)
	);

	const save = (key: string, value: string) => {
		setS((r) => ({ ...r, [key]: value }));
		saveSetting(key, value);
	};
	const enabled = on(s["bloom-files-enabled"]);
	const drag = on(s["bloom-files-drag"]);
	const shiftTap = on(s["bloom-files-shift-tap"]);
	const shortcut = s["bloom-files-shortcut"] == null ? DEFAULT_SHORTCUT : String(s["bloom-files-shortcut"]);

	// The layout is edited locally while dragging and saved when a drag ends.
	const saved = parseLayout(s["bloom-files-hidden"], s["bloom-files-order"], s["bloom-files-mode-order"]);
	const [draft, setDraft] = useState<OrbitLayout | null>(null);
	const layout = draft ?? saved;
	const latest = useRef(layout);
	latest.current = layout;
	const mode = editing ?? layout.modes[0];

	const persist = (next: OrbitLayout) => {
		setDraft(null);
		save("bloom-files-hidden", JSON.stringify(next.hidden));
		save("bloom-files-order", JSON.stringify(next.order));
		save("bloom-files-mode-order", JSON.stringify(next.modes));
	};
	const shown = (m: OrbitMode) => ordered(m, layout).filter((op) => !layout.hidden.includes(op.id));
	const hiddenOps = ordered(mode, layout).filter((op) => layout.hidden.includes(op.id));
	/** Saves `ids` as the shown order of `mode`, hidden ones after them. */
	const withOrder = (m: OrbitMode, ids: string[], hidden = layout.hidden): OrbitLayout => ({
		...layout,
		hidden,
		order: { ...layout.order, [m]: [...ids, ...ordered(m, layout).map((o) => o.id).filter((id) => !ids.includes(id))] }
	});

	return (
		<>
			<div className="setting-group-label">Radial Menu</div>
			<div className="setting-group">
				<SettingRow
					icon={Orbit}
					label="Radial Menu"
					desc="Convert, edit and act on files from a ring around the pointer; results are saved next to the original, which is never changed"
					divider={enabled}
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={enabled} onChange={() => save("bloom-files-enabled", String(!enabled))} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{enabled && (
					<>
						<SettingRow
							icon={Hand}
							label="Drag, Then Tap Shift"
							desc="While dragging files or selected text, tap Shift to open the menu and let go on an option"
						>
							<label className="toggle-switch">
								<input type="checkbox" checked={drag} onChange={() => save("bloom-files-drag", String(!drag))} />
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={Zap}
							label="Tap Shift on Selected Files"
							desc="With files selected in File Explorer or on the desktop, tap Shift alone to open the menu. Shift+click and Shift+arrows still select as usual"
						>
							<label className="toggle-switch">
								<input type="checkbox" checked={shiftTap} onChange={() => save("bloom-files-shift-tap", String(!shiftTap))} />
								<span className="slider"></span>
							</label>
						</SettingRow>

						<SettingRow
							icon={Keyboard}
							label="Shortcut"
							desc="Also opens the menu for the selected files. Click the box and press keys; Backspace turns it off"
							divider={false}
						>
							<input
								className="settings-select clip-shortcut"
								readOnly
								value={shortcut || "Off"}
								onKeyDown={(e) => {
									e.preventDefault();
									if (e.key === "Backspace" || e.key === "Delete") save("bloom-files-shortcut", "");
									const next = shortcutFrom(e);
									if (next) save("bloom-files-shortcut", next);
								}}
							/>
						</SettingRow>
					</>
				)}
			</div>

			{enabled && (
				<>
					<div className="setting-group-label">Progress</div>
					<div className="setting-group">
						<SettingRow icon={MapPin} label="Show Progress" desc="Where the percentage and the result appear">
							<select
								className="settings-select"
								value={s["bloom-files-status-at"] === "notch" ? "notch" : "pointer"}
								onChange={(e) => save("bloom-files-status-at", e.target.value)}
							>
								<option value="pointer">At the pointer</option>
								<option value="notch">In the notch</option>
							</select>
						</SettingRow>
						<SettingRow icon={Timer} label="Result Stays For" desc="How long the result shows (errors a bit longer, Canceled briefly)" divider={false}>
							<select
								className="settings-select"
								value={String(Number(s["bloom-files-status-seconds"]) || 2)}
								onChange={(e) => save("bloom-files-status-seconds", e.target.value)}
							>
								{[1, 2, 3, 5].map((n) => (
									<option key={n} value={n}>
										{n} second{n > 1 ? "s" : ""}
									</option>
								))}
							</select>
						</SettingRow>
					</div>

					<div className="setting-group-label">Your Menu</div>
					<div className="setting-group radial-designer">
						<p className="radial-hint">
							Drag the menus to change the order Shift goes through them. Click one to edit it.
						</p>
						<div className="radial-flow">
							<div className="radial-shift-key">
								<ArrowBigUp size={16} />
								<span>Shift</span>
							</div>
						<Reorder.Group
							axis="x"
							values={layout.modes}
							onReorder={(modes) => setDraft({ ...latest.current, modes })}
							className="radial-flow-group"
						>
							{layout.modes.map((m, i) => (
								<Reorder.Item
									key={m}
									value={m}
									className="radial-flow-item"
									onDragEnd={() => persist(latest.current)}
									whileDrag={{ scale: 1.08, rotate: -3, zIndex: 2 }}
									transition={SPRING}
								>
									<span className="radial-step">
										{i > 0 && <ArrowBigUp size={13} />}
										<ChevronRight size={14} />
									</span>
									<motion.div
										className={`radial-card${m === mode ? " active" : ""}`}
										onTap={() => setEditing(m)}
										whileHover={{ y: -3 }}
										whileTap={{ scale: 0.95 }}
										transition={SPRING}
									>
										<RadialPreview ops={shown(m)} size={92} />
										<span className="radial-card-name">{MODE_LABEL[m]}</span>
										<span className="radial-card-count">{shown(m).length} options</span>
									</motion.div>
								</Reorder.Item>
							))}
						</Reorder.Group>
						</div>

						<div className="radial-editor">
							<motion.div key={mode} initial={{ scale: 0.8, rotate: -20, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={SPRING}>
								<RadialPreview ops={shown(mode)} size={190} label={MODE_LABEL[mode]} />
							</motion.div>
							<div className="radial-list">
								<div className="radial-list-title">Order (drag) · hide with the eye</div>
								<Reorder.Group
									axis="y"
									values={shown(mode).map((o) => o.id)}
									onReorder={(ids) => setDraft(withOrder(mode, ids))}
									className="radial-rows"
								>
									<AnimatePresence initial={false}>
										{shown(mode).map((op) => {
											const Icon = op.icon ? ORBIT_ICONS[op.icon] : undefined;
											return (
												<Reorder.Item
													key={op.id}
													value={op.id}
													className="radial-row"
													onDragEnd={() => persist(latest.current)}
													initial={{ opacity: 0, y: -8 }}
													animate={{ opacity: 1, y: 0 }}
													exit={{ opacity: 0, x: 30, scale: 0.9 }}
													whileDrag={{ scale: 1.04, boxShadow: "0 6px 18px rgba(0,0,0,0.3)" }}
													transition={SPRING}
												>
													<GripVertical size={13} className="radial-grip" />
													{Icon ? <Icon size={14} /> : <span className="radial-format">{op.label}</span>}
													<span className="radial-row-label">{Icon ? op.label : `To ${op.label}`}</span>
													<button
														title="Hide"
														onPointerDown={(e) => e.stopPropagation()}
														onClick={() =>
															persist(withOrder(mode, shown(mode).map((o) => o.id), [...layout.hidden, op.id]))
														}
													>
														<EyeOff size={13} />
													</button>
												</Reorder.Item>
											);
										})}
									</AnimatePresence>
								</Reorder.Group>
								<AnimatePresence>
									{hiddenOps.length > 0 && (
										<motion.div
											className="radial-hidden"
											initial={{ opacity: 0, height: 0 }}
											animate={{ opacity: 1, height: "auto" }}
											exit={{ opacity: 0, height: 0 }}
										>
											<div className="radial-list-title">Hidden · click to bring back</div>
											<div className="radial-hidden-chips">
												<AnimatePresence>
													{hiddenOps.map((op) => (
														<motion.button
															key={op.id}
															layout
															className="folder-chip"
															initial={{ opacity: 0, scale: 0.6 }}
															animate={{ opacity: 1, scale: 1 }}
															exit={{ opacity: 0, scale: 0.6 }}
															whileHover={{ scale: 1.06 }}
															whileTap={{ scale: 0.92 }}
															transition={SPRING}
															onClick={() => persist({ ...layout, hidden: layout.hidden.filter((h) => h !== op.id) })}
														>
															{op.label}
														</motion.button>
													))}
												</AnimatePresence>
											</div>
										</motion.div>
									)}
								</AnimatePresence>
							</div>
						</div>
						<p className="radial-hint">Each menu only shows the options that fit the files you drag.</p>
					</div>
				</>
			)}
		</>
	);
}
