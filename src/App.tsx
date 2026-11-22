import { motion, AnimatePresence, MotionConfig, useAnimation } from "framer-motion";
import { useEffect, useLayoutEffect, useState, useCallback, useMemo, useRef, memo } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getVersion } from "@tauri-apps/api/app";
import type { UpdateCheckResult } from "./updater";
import { batteryTooltip, type BatteryDetails } from "./batteryTooltip";
import {
	createRegionSender,
	measureElements,
	notchPillBox,
	type RegionRect
} from "./windowRegion";
import {
	asNotchStyle,
	parsePanelOrder,
	type SizedPanel,
	panelZoom
} from "./notchLayout";
import "./App.css";
import { initTheme } from "./theme";
import {
	PlayIcon,
	PauseIcon,
	SkipBackIcon,
	SkipForwardIcon,
	VolumeLowIcon,
	VolumeHighIcon,
	MusicNoteIcon,
	HeadphonesIcon
} from "./icons";
import { CompactMediaPlayer } from "./CompactMediaPlayer";
import { useWeather } from "./hooks/useWeather";
import { useSettingsSync } from "./hooks/useSettingsSync";
import { useTrailingThrottle } from "./hooks/useTrailingThrottle";
import { useAnnouncement } from "./hooks/useAnnouncement";
import { NotchTabBar } from "./components/NotchTabBar";
import { BloomTip } from "./components/BloomTip";
import { BODY_VARIANTS, CC_EXIT, LIST_MOTION, LIVELY, bodyMotion } from "./motion";
import { Roll } from "./components/Roll";
import { CopyEffect, LotusSignature, ProgressEffect, asProgressStyle } from "./components/ProgressEffect";
import { EXTRA_BY_ID, GRID_H, MAX_TABS, OPEN_WIDTH, TAB_BAR_HEIGHT, openingTool, pomodoroLength, orderTabs, TOOLS, parseEnabledTools, type ExtraToolId, type Tool } from "./tools";
import { SEGMENT_BAR_HEIGHT, ToolHost, showPart } from "./notchTools/ToolHost";
import { CommandCenter, ccBodyHeight, parseCcTiles, type CcTileId, type CcTileState } from "./components/CommandCenter";

// Tool switches: bodies slide toward the picked tab with a lively spring
// (motion.ts). The Command Center steps aside for its Wi-Fi / Bluetooth list.
const CC_VARIANTS = {
	enter: (c: number | "list") => BODY_VARIANTS.enter(typeof c === "number" ? c : 0),
	center: BODY_VARIANTS.center,
	exit: (c: number | "list") => (c === "list" ? CC_EXIT : BODY_VARIANTS.exit(c))
};

type MotionPref = "on" | "off";
const asMotionPref = (v: unknown): MotionPref => (v === "off" ? "off" : "on");

/** system_tools.rs CcStates; a missing key = not available on this PC. */
type CcSystemStates = Partial<Record<"night-light" | "airplane" | "hotspot" | "nearby" | "captions", boolean | null>>;
import { reloadIfMirrorWasStale } from "./hooks/settingsMirror";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import type { WidgetConfig } from "./components/StatusWidgetConfig";
import { EdgeSurface } from "./components/EdgeSurface";
import { ShelfTypeIcon } from "./components/ShelfTypeIcon";
import { WifiPanel } from "./components/WifiPanel";
import { BluetoothPanel } from "./components/BluetoothPanel";
import { DeviceArt, DeviceArtDefs } from "./devices/DeviceArt";
import { deviceArtFor } from "./devices/deviceArtFor";
import { deviceLookFor } from "./devices/deviceLooks";
import type { BudLevel, BudsBattery } from "./devices/connectedDevices";
import { ConnectedDevicesPanel } from "./components/ConnectedDevicesPanel";
import { requestSend, sharePeerAt } from "./components/ShareColumn";
import { useHideFromCapture } from "./hooks/useHideFromCapture";
import { DeadlineList, dayKey, useDeadlines } from "./notchTools/Deadlines";
import { NotchOutline } from "./components/NotchOutline";
import { ClipboardPanel } from "./components/ClipboardPanel";
import { useClipboardSettings } from "./hooks/useClipboardSettings";
import { clipSounds } from "./clipboardSounds";
import { focusFirstTextField, releaseTextKeyboard, useTextInputKeyboard } from "./hooks/useTextInputKeyboard";
import { useConnectedDevices } from "./hooks/useConnectedDevices";
import { isWiredAudio, usbArtFor, usbDisplayName, type UsbIdentity } from "./devices/usbArtFor";
import type { DeviceArtKey } from "./devices/art";
import {
	Cpu,
	MemoryStick,
	HardDrive,
	ArrowUpDown,
	BellRing,
	Timer,
	Megaphone,
	Type,
	X,
	ChevronLeft,
	ChevronRight,
	Inbox,
	Music,
	Zap,
	ClipboardCheck
} from "lucide-react";
import { CircleAlert, CircleCheck, CircleSlash, Leaf } from "lucide-react";
import type { OrbitStatus } from "./orbitOps";

/**
 * The notch has two kinds of content:
 * - Panels are tools the user chooses. A click opens the last-used panel by
 *   default, or a selected fixed panel when panel memory is turned off.
 * - Live activities (music, a set timer, a filled shelf) show a compact form in
 *   the pill or a bubble beside it, and opening one shows its own view, which
 *   stands alone (no panel arrows) and is never remembered as the last panel.
 *   Dragging files onto the notch also opens the shelf. Wheel/swipe switches
 *   between tool panels, including when a live activity occupies the pill.
 */
type NotchPanel = "calendar" | "command-center" | "devices" | "clipboard";
const NOTCH_PANELS: readonly NotchPanel[] = ["calendar", "command-center", "devices", "clipboard"];
/** What Battery saver pauses (`bloom-battery-saver-pauses`, JSON); all three
 *  by default. */
type SaverPauses = { visualizer: boolean; motion: boolean; glass: boolean };
function parseSaverPauses(raw: unknown): SaverPauses {
	const all = { visualizer: true, motion: true, glass: true };
	try {
		const v = JSON.parse(String(raw ?? ""));
		return v && typeof v === "object" ? { ...all, ...v } : all;
	} catch {
		return all;
	}
}

/** Smart start's window for reopening the last panel. */
const SMART_START_MS = 5 * 60 * 1000;
const asNotchPanel = (value: unknown): NotchPanel | null =>
	NOTCH_PANELS.includes(value as NotchPanel) ? (value as NotchPanel) : null;

// The Connected devices panel grows with its list between these heights;
// the maximum is the size the panel had before it grew to fit.
const DEVICES_MIN_HEIGHT = 150;
const DEVICES_MAX_HEIGHT = 300;



// Completion chime for the Pomodoro timer. Synthesized with the Web Audio API
// so no audio asset is needed; created on the Start click so the webview's
// autoplay policy lets it play when the timer ends.
let timerChimeCtx: AudioContext | null = null;

const getTimerChimeCtx = (): AudioContext | null => {
	try {
		if (!timerChimeCtx) timerChimeCtx = new AudioContext();
		if (timerChimeCtx.state === "suspended") timerChimeCtx.resume().catch(() => {});
		return timerChimeCtx;
	} catch {
		return null;
	}
};

const playTimerChime = () => {
	const ctx = getTimerChimeCtx();
	if (!ctx) return;
	const start = ctx.currentTime + 0.02;
	const master = ctx.createGain();
	master.gain.value = 0.45;
	master.connect(ctx.destination);

	// Soft rising bell arpeggio (A5–C#6–E6) with a quiet octave harmonic.
	const notes = [
		{ freq: 880.0, at: 0 },
		{ freq: 1108.73, at: 0.18 },
		{ freq: 1318.51, at: 0.36 }
	];
	notes.forEach(({ freq, at }) => {
		const osc = ctx.createOscillator();
		const harmonic = ctx.createOscillator();
		const gain = ctx.createGain();
		const harmonicGain = ctx.createGain();
		osc.type = "sine";
		osc.frequency.value = freq;
		harmonic.type = "sine";
		harmonic.frequency.value = freq * 2.01;
		harmonicGain.gain.value = 0.12;
		gain.gain.setValueAtTime(0.0001, start + at);
		gain.gain.exponentialRampToValueAtTime(0.32, start + at + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, start + at + 1.4);
		osc.connect(gain);
		harmonic.connect(harmonicGain);
		harmonicGain.connect(gain);
		gain.connect(master);
		osc.start(start + at);
		harmonic.start(start + at);
		osc.stop(start + at + 1.5);
		harmonic.stop(start + at + 1.5);
	});
};

// Simple SVG icons
function BatteryIcon({
	charging,
	level,
	threshold = 20
}: {
	charging: boolean;
	level: number;
	threshold?: number;
}) {
	const percentage = Math.min(Math.max(level, 0), 100);

	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				position: "relative",
				height: "14px",
				justifyContent: "center"
			}}
		>
			<svg width="20" height="10" viewBox="0 0 20 10" fill="none">
				{/* Battery Shell - Centered at 9px within 20px width, ignoring the tip's offset */}
				<rect
					x="2"
					y="0.75"
					width="14"
					height="8.5"
					rx="2.4"
					stroke="currentColor"
					strokeOpacity={0.35}
					strokeWidth="1.1"
				/>
				{/* Battery Tip */}
				<path
					d="M17.5 3.5V6.5"
					stroke="currentColor"
					strokeOpacity={0.35}
					strokeWidth="1.2"
					strokeLinecap="round"
				/>
				{/* Fill */}
				<rect
					x="3.8"
					y="2.5"
					width={Math.max(0.5, (percentage / 100) * 10.4)}
					height="5"
					rx="1"
					fill={charging ? "#32D74B" : percentage <= threshold ? "#FF453A" : "white"}
				/>
			</svg>
			{/* Charging Bolt - Centered on the battery body */}
			{charging && (
				<div
					style={{
						position: "absolute",
						top: "50%",
						left: "9px",
						transform: "translate(-50%, -50%)",
						color: "white",
						filter: "drop-shadow(0px 0px 1.5px rgba(0,0,0,0.8))"
					}}
				>
					<svg width="7" height="10" viewBox="0 0 8 12" fill="currentColor">
						<path d="M4.5 0L0 7H3.5L2.5 12L8 5H4.5L5.5 0H4.5Z" />
					</svg>
				</div>
			)}
		</div>
	);
}

function GreenDownArrowIcon() {
	return (
		<div
			style={{
				display: "inline-flex",
				alignItems: "center",
				justifyContent: "center",
				width: "18px",
				height: "18px",
				borderRadius: "50%",
				background: "rgba(50, 215, 75, 0.15)",
				border: "1px solid rgba(50, 215, 75, 0.35)",
				boxShadow: "0 0 8px rgba(50, 215, 75, 0.25)",
				flexShrink: 0,
				verticalAlign: "middle"
			}}
		>
			<svg
				width="10"
				height="10"
				viewBox="0 0 24 24"
				fill="none"
				stroke="#32D74B"
				strokeWidth="3"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<line x1="12" y1="4" x2="12" y2="16"></line>
				<polyline points="18 10 12 16 6 10"></polyline>
				<line x1="6" y1="20" x2="18" y2="20"></line>
			</svg>
		</div>
	);
}

export const Visualizer = memo(function Visualizer({
	isPlaying,
	bars = 5,
	height = 20
}: {
	isPlaying: boolean;
	bars?: number;
	height?: number;
}) {
	const [audioData, setAudioData] = useState<number[]>(new Array(bars).fill(0.18));

	useEffect(() => {
		if (!isPlaying) {
			setAudioData(new Array(bars).fill(0.18));
			return;
		}

		const unlisten = listen<{ frequencies: number[] }>("audio-visualization", (event) => {
			// If we receive fewer frequencies than bars, repeat or interpolate
			// If more, slice
			let data = event.payload.frequencies;
			if (data.length > bars) data = data.slice(0, bars);
			while (data.length < bars) data.push(0.18);
			setAudioData(data);
		});

		return () => {
			unlisten.then((fn) => fn());
		};
	}, [isPlaying, bars]);

	return (
		<div
			className="visualizer-horizontal"
			style={{ height: `${height}px`, width: `${bars * 6}px` }}
		>
			{audioData.map((value, i) => (
				<motion.div
					key={i}
					className="bar-horizontal"
					animate={{
						scaleY: isPlaying ? Math.max(0.2, value) : 0.1,
						opacity: isPlaying ? 0.95 : 0.5
					}}
					transition={{
						type: "spring",
						stiffness: 600,
						damping: 30,
						mass: 0.5
					}}
				/>
			))}
		</div>
	);
});

// Number of week rows the current month occupies. Calendar mode sizes the
// notch to the month so five-row months stay compact and six-row months never
// clip the last row.
const calendarMonthRows = (() => {
	const now = new Date();
	const firstWeekday = new Date(now.getFullYear(), now.getMonth(), 1).getDay();
	const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
	return Math.ceil((firstWeekday + daysInMonth) / 7);
})();


interface MediaInfo {
	title: string;
	artist: string;
	is_playing: boolean;
	has_media: boolean;
	artwork?: string[];
	position_ms?: number;
	duration_ms?: number;
	seek_enabled?: boolean;
	position_updated_at?: number;
}

interface WifiStatus {
	enabled: boolean;
	connected: boolean;
	ssid: string | null;
}

// A shelf file's preview from the backend: a picture when one can be made,
// else the opening text of a document or text file, and whether it's a folder
// (for the placeholder icon).
interface ShelfPreview {
	thumb: string | null;
	text: string | null;
	folder: boolean;
}

interface ShelfItem {
	id: string;
	type: "file" | "text";
	name: string;
	path?: string;
	text?: string;
	timestamp: number;
}

type BloomMode =
	| "music"
	| "calendar"
	| "command-center"
	| "announcement"
	| "status"
	| "shelf"
	| "wifi"
	| "bluetooth"
	| "devices"
	| "clipboard"
	| "device"
	| "tool";

// A device that just connected or disconnected, shown briefly in the pill.
interface DeviceAlert {
	// The device's id, so a later battery report can find its alert.
	id: string;
	art: DeviceArtKey;
	name: string;
	connected: boolean;
	battery: number | null;
	// Each bud's and the case's battery, for earbuds that report them.
	buds?: BudsBattery | null;
	// A USB device, which has no list to open when the alert is clicked.
	usb?: boolean;
	// A USB drive: clicking the alert opens it in File Explorer.
	disk?: boolean;
	// Changes on every alert, so the drawing replays its animation.
	runId: number;
}

// As sent by the backend's `bluetooth-connection` event.
interface BluetoothConnection {
	id: string;
	name: string;
	kind: string;
	form: string | null;
	connected: boolean;
	battery: number | null;
}

/** A USB device plugged in or removed, from the backend's `usb-connection`. */
interface UsbConnection extends UsbIdentity {
	/** The device's container id. */
	id: string;
	connected: boolean;
}

// What a device alert says: wired and USB devices are plugged in, cards
// inserted, everything else connected.
const PLUGGED_ART = new Set<DeviceArtKey>([
	"headphones-wired",
	"earbuds-usbc",
	"earbuds-jack",
	"flash-drive",
	"ssd",
	"hub",
	"webcam",
	"microphone"
]);
function deviceAlertStatus(art: DeviceArtKey, connected: boolean, wired = false): string {
	if (art === "sd-card") return connected ? "Inserted" : "Removed";
	// A wired device is plugged in whatever it was picked to look like.
	if (wired || PLUGGED_ART.has(art)) return connected ? "Plugged in" : "Unplugged";
	return connected ? "Connected" : "Disconnected";
}

// How long a device alert stays in the pill.
const DEVICE_ALERT_MS = { connected: 4200, disconnected: 2600 };
// How many alerts for other devices can wait behind the one showing.
const DEVICE_ALERT_QUEUE = 3;

/** A small ring showing a device's battery, with the level in the middle. */
function DeviceBatteryRing({ level, charging = false }: { level: number; charging?: boolean }) {
	const r = 10.5;
	const circumference = 2 * Math.PI * r;
	const low = level <= 20 && !charging;
	return (
		<div
			className={`device-alert-battery${low ? " low" : ""}${charging ? " charging" : ""}`}
			title={`${level}%${charging ? ", charging" : ""}`}
		>
			<svg viewBox="0 0 28 28" width="28" height="28">
				<circle cx="14" cy="14" r={r} className="track" />
				<circle
					cx="14"
					cy="14"
					r={r}
					className="level"
					strokeDasharray={`${(circumference * level) / 100} ${circumference}`}
					transform="rotate(-90 14 14)"
				/>
			</svg>
			<span>{level}</span>
		</div>
	);
}

// Each bud's and the case's battery, for earbuds that report them: a ring
// per part with its label underneath. Parts with no reading are left out.
function DeviceBudsBattery({ buds }: { buds: BudsBattery }) {
	const parts: [string, BudLevel][] = [];
	if (buds.left) parts.push(["L", buds.left]);
	if (buds.right) parts.push(["R", buds.right]);
	if (buds.case) parts.push(["Case", buds.case]);
	return (
		<div className="device-alert-buds">
			{parts.map(([label, part]) => (
				<div key={label} className="device-alert-bud">
					<DeviceBatteryRing level={part.level} charging={part.charging} />
					<span className="device-alert-bud-label">
						{label}
						{part.charging && <Zap className="device-alert-bud-charging" />}
					</span>
				</div>
			))}
		</div>
	);
}

// The shelf is a short-lived stash: one row, newest first, oldest evicted.
const SHELF_MAX_ITEMS = 10;

const MARQUEE_SPEED = 30; // px/s — constant for all titles
const MARQUEE_MIN_DURATION = 5; // floor so short titles don't flicker

const TitleMarquee = ({ title }: { title: string }) => {
	const textRef = useRef<HTMLSpanElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const [isOverflowing, setIsOverflowing] = useState(false);
	const [scrollDistance, setScrollDistance] = useState(0);
	const [scrollDuration, setScrollDuration] = useState(8);

	useEffect(() => {
		const check = () => {
			if (textRef.current && containerRef.current) {
				const textWidth = textRef.current.scrollWidth;
				const containerWidth = containerRef.current.clientWidth;
				const overflow = textWidth > containerWidth;
				setIsOverflowing(overflow);
				if (overflow) {
					const distance = textWidth - containerWidth;
					setScrollDistance(distance);
					setScrollDuration(Math.max(distance / MARQUEE_SPEED, MARQUEE_MIN_DURATION));
				}
			}
		};
		check();
		const observer = new ResizeObserver(check);
		if (containerRef.current) observer.observe(containerRef.current);
		return () => observer.disconnect();
	}, [title]);

	return (
		<div
			ref={containerRef}
			className="premium-title-wrap"
			style={{ width: "100%", overflow: "hidden" }}
		>
			<span
				ref={textRef}
				className={`premium-title ${isOverflowing ? "marquee" : ""}`}
				style={
					{
						"--scroll-distance": isOverflowing ? `-${scrollDistance}px` : undefined,
						"--scroll-duration": `${scrollDuration}s`
					} as React.CSSProperties
				}
			>
				{title}
			</span>
		</div>
	);
};

function App() {
	useEffect(() => {
		return initTheme();
	}, []);

	const [time, setTime] = useState("");
	const [isHovered, setIsHovered] = useState(false);
	// Expanded into a panel by a click. Hover alone only peeks.
	const [isOpen, setIsOpen] = useState(false);
	// The Timer tool's running countdown, shown on the closed notch as
	// `bloom-timer-display` says: the time, an edge light, both, or off.
	const [toolTimer, setToolTimer] = useState<{ left: number; total: number } | null>(null);
	const [timerDisplay, setTimerDisplay] = useState(() => localStorage.getItem("bloom-timer-display") ?? "both");
	const [timesUp, setTimesUp] = useState(false);
	const [enabledTools, setEnabledTools] = useState(() => parseEnabledTools(localStorage.getItem("bloom-tools-enabled")));
	// Game strip glance (`bloom-game-glance`): its readings on the closed notch.
	const [gameGlance, setGameGlance] = useState(() => localStorage.getItem("bloom-game-glance") === "on");
	const [glance, setGlance] = useState<{ cpu: number; gpu: number | null; ram: number } | null>(null);
	const isOpenRef = useRef(false);
	isOpenRef.current = isOpen;
	const [isReady, setIsReady] = useState(false);
	const [globalScale, setGlobalScale] = useState(() =>
		parseFloat(localStorage.getItem("bloom-scale") || "1.0")
	);
	// The notch's own size; until it is set the notch follows the global scale.
	const [notchScale, setNotchScale] = useState<number | null>(() => {
		const value = localStorage.getItem("bloom-notch-scale");
		return value ? parseFloat(value) : null;
	});
	const scale = notchScale ?? globalScale;
	const [panelOrder, setPanelOrder] = useState(() => parsePanelOrder(localStorage.getItem("bloom-notch-panel-order")));
	const [notchStyle, setNotchStyle] = useState(() =>
		asNotchStyle(localStorage.getItem("bloom-notch-style"))
	);
	// Sizes of the clock and of the icons on its left and right
	// (Settings > Notch > Widgets), on top of the notch size.
	const sizeOf = (v: unknown) => Number(v) || 1;
	const [timeSize, setTimeSize] = useState(() => sizeOf(localStorage.getItem("bloom-notch-time-size")));
	const [leftSize, setLeftSize] = useState(() => sizeOf(localStorage.getItem("bloom-notch-left-size")));
	const [rightSize, setRightSize] = useState(() => sizeOf(localStorage.getItem("bloom-notch-right-size")));
	const [timeFormat24h, setTimeFormat24h] = useState(
		() => localStorage.getItem("bloom-time-format-24h") === "true"
	);

	const [batteryLevel, setBatteryLevel] = useState(100);
	const [isCharging, setIsCharging] = useState(false);
	// Battery saver (Settings › General): when it turns on and what it pauses.
	const [saverMode, setSaverMode] = useState(() => localStorage.getItem("bloom-battery-saver") ?? "below");
	const [saverThreshold, setSaverThreshold] = useState(
		() => parseInt(localStorage.getItem("bloom-battery-saver-threshold") ?? "", 10) || 30
	);
	const [saverPauses, setSaverPauses] = useState(() => parseSaverPauses(localStorage.getItem("bloom-battery-saver-pauses")));
	// Animations (`bloom-motion`): on by default, whatever Windows' "Animation
	// effects" says; Off turns them off. Battery saver can still pause them.
	const [motionPref, setMotionPref] = useState(() => asMotionPref(localStorage.getItem("bloom-motion")));
	useEffect(() => {
		document.documentElement.classList.toggle("motion-on", motionPref !== "off");
	}, [motionPref]);
	// Fetched when the pointer reaches the battery widget, for its tooltip.
	const [batteryDetails, setBatteryDetails] = useState<BatteryDetails | null>(null);
	// The status widget whose tooltip is open, the side of the pill it hangs
	// from, and the distance from the widget to just past that edge.
	const [statusTooltip, setStatusTooltip] = useState<{
		id: string;
		side: "below" | "left" | "right";
		offset: number;
	} | null>(null);
	const statusTooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// Width the hovered status strip needs so neither side runs into the clock.
	const [statusFitWidth, setStatusFitWidth] = useState(0);
	const [showPowerPulse, setShowPowerPulse] = useState(false);
	const [showLowBatteryPulse, setShowLowBatteryPulse] = useState(false);
	const [lowBatteryThreshold, setLowBatteryThreshold] = useState(() =>
		parseInt(localStorage.getItem("bloom-low-battery-threshold") || "20")
	);
	const prevChargingRef = useRef<boolean | null>(null);
	const powerPulseTimeoutRef = useRef<any>(null);
	const lowBatteryPulseShownRef = useRef<boolean>(false);

	const [eventPeek, setEventPeek] = useState(false);
	const eventPeekTimeoutRef = useRef<any>(null);
	const updatePulseTimerRef = useRef<any>(null);
	// First-run setup's live preview (Settings › setup): the notch stays shown,
	// closed or open, while its size sliders move.
	const [setupPreview, setSetupPreview] = useState<"closed" | "open" | null>(null);
	// Extra size for the open notch only (`bloom-notch-open-scale`).
	const [openScale, setOpenScale] = useState(() => {
		const v = parseFloat(localStorage.getItem("bloom-notch-open-scale") ?? "1");
		return Number.isFinite(v) ? Math.min(1.25, Math.max(0.8, v)) : 1;
	});
	const triggerEventPeek = useCallback((duration = 3000) => {
		setEventPeek(true);
		if (eventPeekTimeoutRef.current) clearTimeout(eventPeekTimeoutRef.current);
		eventPeekTimeoutRef.current = setTimeout(() => setEventPeek(false), duration);
	}, []);

	const [radialOn, setRadialOn] = useState(() => localStorage.getItem("bloom-files-enabled") !== "false");
	const [notchMode, setNotchMode] = useState(() => {
		const raw = localStorage.getItem("bloom-notch-mode") || "fixed";
		if (raw === "auto-hide") return "smart";
		return raw;
	});

	useEffect(() => {
		if (isReady && prevChargingRef.current !== null && prevChargingRef.current !== isCharging) {
			setShowPowerPulse(true);
			if (notchMode === "peek") triggerEventPeek(4000);
			if (powerPulseTimeoutRef.current) clearTimeout(powerPulseTimeoutRef.current);
			powerPulseTimeoutRef.current = setTimeout(() => {
				setShowPowerPulse(false);
			}, 4000);
		}
		prevChargingRef.current = isCharging;
	}, [isCharging, isReady, notchMode, triggerEventPeek]);

	useEffect(() => {
		// Trigger pulse when dropping below threshold while discharging
		if (
			isReady &&
			batteryLevel <= lowBatteryThreshold &&
			!isCharging &&
			!lowBatteryPulseShownRef.current
		) {
			setShowLowBatteryPulse(true);
			if (notchMode === "peek") triggerEventPeek(5000);
			lowBatteryPulseShownRef.current = true;
			setTimeout(() => setShowLowBatteryPulse(false), 5000);
		}

		// Reset the "shown" state if battery is charged or threshold is lowered
		if (isCharging || batteryLevel > lowBatteryThreshold) {
			lowBatteryPulseShownRef.current = false;
		}
	}, [batteryLevel, isCharging, lowBatteryThreshold, isReady, notchMode, triggerEventPeek]);

	// Weather state (managed by useWeather hook)

	// Media state
	const [isPlaying, setIsPlaying] = useState(false);
	const [mediaInfo, setMediaInfo] = useState<MediaInfo>({
		title: "",
		artist: "",
		is_playing: false,
		has_media: false
	});
	const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null);
	const [albumArtKey, setAlbumArtKey] = useState(0);
	const [volume, setVolume] = useState(0.5);
	const [isMuted, setIsMuted] = useState(false);
	// Sliders show 0 while muted, matching the overlay HUD.
	const displayVolume = isMuted ? 0 : volume;
	// What the Command Center's slider icons bring back after muting / dimming to 0.
	const restoreVolumeRef = useRef(0.5);
	const restoreBrightnessRef = useRef(50);
	// Null until the first successful fetch so the pill can't flash a wrong
	// default on startup.
	const [wifiStatus, setWifiStatus] = useState<WifiStatus | null>(null);
	const wifiEnabled = wifiStatus?.enabled ?? false;
	const wifiConnected = wifiStatus?.connected ?? false;
	const [bluetoothEnabled, setBluetoothEnabled] = useState(true);
	// Names of connected Bluetooth devices, for the controls tile.
	const [btConnectedNames, setBtConnectedNames] = useState<string[]>([]);
	const [batterySaverEnabled, setBatterySaverEnabled] = useState(false);
	const [currentBrightness, setCurrentBrightness] = useState(50);

	// System metrics for status widgets
	const [cpuUsage, setCpuUsage] = useState(0);
	const [ramUsage, setRamUsage] = useState(0);
	const [diskSpace, setDiskSpace] = useState(0);
	const [netUpSpeed, setNetUpSpeed] = useState(0);
	const [netDownSpeed, setNetDownSpeed] = useState(0);
	const [statusWidgets, setStatusWidgets] = useState<WidgetConfig>({
		left: ["weather"],
		right: ["battery"]
	});

	const [windowLabel, setWindowLabel] = useState<string>("");
	useEffect(() => {
		setWindowLabel(getCurrentWebviewWindow().label);
	}, []);

	// Update state
	const [updateAvailable, setUpdateAvailable] = useState(false);
	const [showUpdateIndicator, setShowUpdateIndicator] = useState(
		() => localStorage.getItem("bloom-show-update-indicator") !== "false"
	);
	const [showUpdatePulse, setShowUpdatePulse] = useState(false);

	useEffect(() => {
		if (windowLabel !== "main") return;

		let unlisten: (() => void) | undefined;
		let disposed = false;

		listen<UpdateCheckResult>("update-available", (event) => {
			setUpdateAvailable(event.payload.available);
			if (!event.payload.available) {
				setShowUpdatePulse(false);
				if (updatePulseTimerRef.current) clearTimeout(updatePulseTimerRef.current);
				return;
			}
			setShowUpdatePulse(true);
			if (notchMode === "peek") triggerEventPeek(6000);
			if (updatePulseTimerRef.current) clearTimeout(updatePulseTimerRef.current);
			updatePulseTimerRef.current = setTimeout(() => {
				setShowUpdatePulse(false);
			}, 6000);
		}).then((fn) => {
			if (disposed) fn();
			else unlisten = fn;
		});

		invoke<UpdateCheckResult>("get_update_state")
			.then((state) => {
				// Only restore a badge; clearing is left to check results so a
				// late mount read cannot race an "update-available" event.
				if (state.available) setUpdateAvailable(true);
			})
			.catch((e) => console.error("Failed to read update state:", e));

		return () => {
			disposed = true;
			unlisten?.();
			if (updatePulseTimerRef.current) clearTimeout(updatePulseTimerRef.current);
		};
	}, [windowLabel, notchMode, triggerEventPeek]);

	// Remote announcement shown as a persistent notch card until dismissed.
	const {
		announcement,
		dismissed: announcementDismissed,
		dismiss: dismissAnnouncement
	} = useAnnouncement();
	const [deviceAlert, setDeviceAlert] = useState<DeviceAlert | null>(null);
	// Each connected earbud's own levels, as last reported, for Connected devices.
	const [budsById, setBudsById] = useState<Record<string, BudsBattery>>({});
	// The height the Connected devices panel's content needs; the open notch
	// follows it up to DEVICES_MAX_HEIGHT, past which the list scrolls.
	const [devicesContentHeight, setDevicesContentHeight] = useState(DEVICES_MAX_HEIGHT);
	const devicesPanelHeight = Math.min(DEVICES_MAX_HEIGHT, Math.max(DEVICES_MIN_HEIGHT, devicesContentHeight));
	// True from an alert appearing until its exit animation has finished, so
	// the clock row only comes back once the alert has faded out.
	const [deviceAlertOnScreen, setDeviceAlertOnScreen] = useState(false);
	const deviceAlertRef = useRef<DeviceAlert | null>(null);
	deviceAlertRef.current = deviceAlert;
	const deviceAlertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(
		() => () => {
			if (deviceAlertTimerRef.current) clearTimeout(deviceAlertTimerRef.current);
		},
		[]
	);
	const announcementShownRef = useRef<string | null>(null);
	const announcementOpen = !!announcement && !announcementDismissed;
	const announcementOpenRef = useRef(false);
	announcementOpenRef.current = announcementOpen;

	const [isVisible, setIsVisible] = useState(true);
	const [isImpacted, setIsImpacted] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);
	const [startupAnimating, setStartupAnimating] = useState(false);

	const [dockMode, setDockMode] = useState(() => {
		const raw = localStorage.getItem("bloom-dock-mode") || "smart";
		if (raw === "auto-hide") return "smart";
		return raw;
	});
	const [dockEnabled, setDockEnabled] = useState(
		() => localStorage.getItem("bloom-dock-enabled") !== "false"
	);
	const [isNotchHovered, setIsNotchHovered] = useState(false);

	const [isEdgeHovered, setIsEdgeHovered] = useState(false);
	const [isOverlapped, setIsOverlapped] = useState(false);
	const [interactionState, setInteractionState] = useState<"active" | "grace" | "none">("none");
	const bloomRef = useRef<HTMLDivElement>(null);
	// Measured to fit the hovered status strip; see statusFitWidth.
	const leftWidgetsRef = useRef<HTMLDivElement>(null);
	const rightWidgetsRef = useRef<HTMLDivElement>(null);
	const timeCenterRef = useRef<HTMLDivElement>(null);
	const musicBubbleRef = useRef<HTMLButtonElement>(null);
	const shelfBubbleRef = useRef<HTMLButtonElement>(null);
	const reportNotchRect = useRef<() => void>(() => {});
	// The pill's target box in window CSS px, and the sender that applies the
	// notch window's region (holding earlier regions while it shrinks).
	const pillTargetRef = useRef<RegionRect | null>(null);
	const sendNotchRegion = useMemo(
		() =>
			createRegionSender((rects) => {
				invoke("set_window_region", { rects }).catch(() => {});
			}),
		[]
	);

	// Recomputes the notch window's region from the pill's target box and the
	// floating parts drawn around it, and sends it if it changed. Reads only
	// refs and the DOM, so it is safe to call from any callback.
	const updateNotchRegion = () => {
		const wanted: RegionRect[] = [];
		if (pillTargetRef.current) wanted.push(pillTargetRef.current);
		// Each floating part, padded to cover what it paints outside its box: a
		// tooltip card's shadow reaches 20px out plus a 6px drop, a bubble's
		// glow less.
		wanted.push(
			...measureElements([
				[".activity-bubble", 16],
				[".status-tooltip", 28]
			])
		);
		sendNotchRegion(wanted);
	};
	const [systemSettingsReady, setSystemSettingsReady] = useState(false);
	const [waitForStartupSplash, setWaitForStartupSplash] = useState(false);
	const initialSystemSyncDone = useRef(false);
	const splashDone = useRef(false);
	const systemSyncQueue = useRef<Promise<void>>(Promise.resolve());
	const appliedDock = useRef<{ enabled: boolean; mode: string } | null>(null);
	const appliedNotchMode = useRef<string | null>(null);

	const isAnyInteraction = isHovered || isNotchHovered || isEdgeHovered;
	// An open notch never hides (Peek / Smart): the shortcut opens it without
	// the pointer touching the edge.
	// A running Timer shown on the notch keeps it on screen (Peek / Smart).
	const glanceOn = gameGlance && enabledTools.includes("game");
	const timerShowing = (!!toolTimer && timerDisplay !== "off") || timesUp || (glanceOn && !isOpen);
	const [fileStatus, setFileStatus] = useState<OrbitStatus>(null);
	const isHidden =
		!isOpen &&
		!timerShowing &&
		!startupAnimating &&
		!deviceAlertOnScreen &&
		// A notice ("Riya copied: …", a send's result) shows the notch
		// for its few seconds even when an app covers the top.
		!fileStatus &&
		!setupPreview &&
		((notchMode === "smart" && isOverlapped && interactionState === "none" && !eventPeek) ||
			(notchMode === "peek" && interactionState === "none" && !eventPeek));

	useEffect(() => {
		if (isAnyInteraction) {
			setInteractionState("active");
		} else if (interactionState !== "none") {
			setInteractionState("grace");
			const timer = setTimeout(() => setInteractionState("none"), 800);
			return () => clearTimeout(timer);
		}
	}, [isAnyInteraction]);

	useEffect(() => {
		if (windowLabel === "main") {
			invoke("set_notch_hovered", { hovered: isNotchHovered }).catch(() => {});
		}
	}, [isNotchHovered, windowLabel]);

	// Tell the backend whether the notch is actually on screen so a hidden
	// notch (smart/peek mode) stays click-through instead of swallowing clicks
	// in its footprint.
	useEffect(() => {
		if (windowLabel === "main") {
			invoke("set_notch_visible", { visible: isVisible && !isHidden }).catch(() => {});
		}
	}, [isVisible, isHidden, windowLabel]);

	useEffect(() => {
		const updateRect = () => {
			if (bloomRef.current && windowLabel === "main") {
				// Activity bubbles sit beside the pill and must stay clickable too.
				const rects = [bloomRef.current, musicBubbleRef.current, shelfBubbleRef.current]
					.filter((el): el is NonNullable<typeof el> => el !== null)
					.map((el) => el.getBoundingClientRect());
				const left = Math.min(...rects.map((r) => r.left));
				const top = Math.min(...rects.map((r) => r.top));
				const right = Math.max(...rects.map((r) => r.right));
				const bottom = Math.max(...rects.map((r) => r.bottom));
				invoke("update_notch_rect", {
					rect: {
						x: Math.round(left),
						y: Math.round(top),
						width: Math.round(right - left),
						height: Math.round(bottom - top)
					}
				}).catch(() => {});
				// Bubbles finishing their entrance land here too.
				updateNotchRegion();
			}
		};
		reportNotchRect.current = updateRect;

		updateRect();
		window.addEventListener("resize", updateRect);
		const observer = new ResizeObserver(updateRect);
		if (bloomRef.current) observer.observe(bloomRef.current);

		return () => {
			window.removeEventListener("resize", updateRect);
			observer.disconnect();
		};
	}, [isExpanded, isHidden, windowLabel, scale]);

	useEffect(() => {
		if (!windowLabel) return;

		// Only animate the main top-bar
		if (windowLabel !== "main") {
			setIsReady(true);
			setIsImpacted(true);
			setIsExpanded(true);
			return;
		}

		const proceedWithStartup = () => {
			const checkVisibility = async () => {
				try {
					const win = getCurrentWebviewWindow();
					const visible = await win.isVisible();
					if (visible) {
						setStartupAnimating(true);
						setIsReady(true);
						// The window is shown here; WebView2 may only create its
						// render child now, so refresh the drop targets.
						invoke("setup_shelf_drop").catch(() => {});
						setTimeout(() => {
							setIsImpacted(true);
							setIsExpanded(true);
						}, 240);
						setTimeout(() => setStartupAnimating(false), 1500);
						return true;
					}
				} catch (e) {}
				return false;
			};

			const interval = setInterval(async () => {
				if (await checkVisibility()) clearInterval(interval);
			}, 100);

			checkVisibility();
			return interval;
		};

		// Mirror Overlay.tsx's splash decision so we only wait when a splash will actually fire.
		// Overlay always emits splash-done, but on a normal relaunch it emits it near-instantly
		// (after one async getVersion() call) — before this listener would be registered.
		// By making the same decision here we avoid a race and avoid any unnecessary delay.
		const firstRun = localStorage.getItem("bloom-first-run") === null;
		const storedVersion = localStorage.getItem("bloom-app-version");

		const waitForSplash = () => {
			// The overlay window only exists for the splash: ask for it.
			invoke("show_splash_overlay").catch(() => {});
			// Splash is definitely coming — register listener now (2800ms animation gives us plenty of time)
			let started = false;
			let interval: any;
			const unlistenSplash = listen("splash-done", () => {
				if (started) return;
				started = true;
				interval = proceedWithStartup();
				unlistenSplash.then((fn) => fn());
			});
			const safetyTimer = setTimeout(() => {
				if (started) return;
				started = true;
				interval = proceedWithStartup();
				unlistenSplash.then((fn) => fn());
			}, 6000);
			return () => {
				clearTimeout(safetyTimer);
				if (interval) clearInterval(interval);
				unlistenSplash.then((fn) => fn());
			};
		};

		if (firstRun || storedVersion === null) {
			// Splash is definitely showing — wait for it
			return waitForSplash();
		}

		// Has a version key — need async check to know if version changed
		let interval: any;
		getVersion()
			.then((currentVersion) => {
				if (storedVersion !== currentVersion) {
					// Version changed — splash is coming, wait for it
					// (splash takes 2800ms so there's plenty of time to register the listener)
					waitForSplash();
				} else {
					// Same version — no splash, start immediately
					interval = proceedWithStartup();
				}
			})
			.catch(() => {
				interval = proceedWithStartup();
			});
		return () => {
			if (interval) clearInterval(interval);
		};
	}, [windowLabel]);

	// Settings state
	const [settingsWeatherEnabled, setSettingsWeatherEnabled] = useState(
		() => localStorage.getItem("bloom-weather-enabled") !== "false"
	);
	const [settingsCalendarEnabled, setSettingsCalendarEnabled] = useState(
		() => localStorage.getItem("bloom-calendar-enabled") !== "false"
	);
	// Which panels the notch shows. Calendar and Controls are on by default;
	// Connected devices (and panels added later) are opt-in.
	const [settingsControlsPanelEnabled, setSettingsControlsPanelEnabled] = useState(
		() => localStorage.getItem("bloom-notch-command-center-enabled") !== "false"
	);
	const [settingsDevicesPanelEnabled, setSettingsDevicesPanelEnabled] = useState(
		() => localStorage.getItem("bloom-notch-devices-enabled") === "true"
	);
	const connectedDevices = useConnectedDevices(windowLabel === "main" && settingsDevicesPanelEnabled);
	// The clipboard module (capture runs in the backend) and its panel.
	const [settingsClipboardEnabled, setSettingsClipboardEnabled] = useState(
		() => localStorage.getItem("bloom-clipboard-enabled") !== "false"
	);
	// "notch" keeps the history here; "left"/"right" move it to the edge shelf.
	const [clipboardPosition, setClipboardPosition] = useState(
		() => localStorage.getItem("bloom-clipboard-position") || "notch"
	);
	const clipboardInNotch = settingsClipboardEnabled && clipboardPosition === "notch";
	const clipboardInNotchRef = useRef(clipboardInNotch);
	clipboardInNotchRef.current = clipboardInNotch;
	// A short "Copied" pulse in the notch (and the copy sound) whenever the
	// history captures something.
	const clipOptions = useClipboardSettings();
	const [clipboardCopyIndicator, setClipboardCopyIndicator] = useState(
		() => localStorage.getItem("bloom-clipboard-copy-indicator") !== "false"
	);
	const [showCopyPulse, setShowCopyPulse] = useState(false);
	useEffect(() => {
		if (windowLabel !== "main" || !settingsClipboardEnabled) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const unlisten = listen("clipboard-captured", () => {
			if (clipOptions.sounds) clipSounds.copy();
			if (!clipboardCopyIndicator) return;
			setShowCopyPulse(true);
			if (notchMode !== "fixed") triggerEventPeek(1600);
			clearTimeout(timer);
			timer = setTimeout(() => setShowCopyPulse(false), 1600);
		});
		return () => {
			clearTimeout(timer);
			setShowCopyPulse(false);
			unlisten.then((fn) => fn());
		};
	}, [windowLabel, settingsClipboardEnabled, clipboardCopyIndicator, clipOptions.sounds, notchMode, triggerEventPeek]);
	// The radial menu's job status, when Settings › Radial Menu shows it here
	// (the menu sends it as `orbit-status`; null clears it).
	// Shelf sharing on the closed notch: "Riya copied: …" (click puts it on
	// the clipboard) and "Riya sent 3 things". Shown through the status line.
	const liveClipRef = useRef<string | null>(null);
	useEffect(() => {
		if (windowLabel !== "main") return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const show = (text: string, ms: number, clip: string | null, bad = false) => {
			liveClipRef.current = clip;
			// A loss ("Riya removed you") gets the red outline.
			setFileStatus({ text, percent: null, result: bad ? "failed" : clip ? null : "ok" });
			clearTimeout(timer);
			timer = setTimeout(() => {
				liveClipRef.current = null;
				setFileStatus(null);
			}, ms);
		};
		const offs = [
			listen<{ from: string; id: string | null; preview: string | null }>("share-live", (e) =>
				show(`${e.payload.from} copied${e.payload.preview ? `: ${e.payload.preview}` : " something"}`, 6000, e.payload.id)
			),
			listen<{ text: string; bad: boolean }>("share-notice", (e) => show(e.payload.text, 4000, null, e.payload.bad)),
			listen<{ from: string; count: number }>("share-received", (e) =>
				show(`${e.payload.from} sent ${e.payload.count === 1 ? "something" : `${e.payload.count} things`} · in the Shelf`, 3500, null)
			)
		];
		const onCopied = () => show("Ready to paste", 1200, null);
		window.addEventListener("share-live-copied", onCopied);
		return () => {
			clearTimeout(timer);
			window.removeEventListener("share-live-copied", onCopied);
			offs.forEach((o) => o.then((f) => f()));
		};
	}, [windowLabel]);
	// How a job's progress shows on the notch (Settings › Radial Menu).
	const [progressStyle, setProgressStyle] = useState(() => asProgressStyle(localStorage.getItem("bloom-progress-effect")));
	useEffect(() => {
		if (windowLabel !== "main") return;
		const unlisten = listen<OrbitStatus>("orbit-status", (e) => {
			setFileStatus(e.payload);
			// Stays on screen until the job ends (Smart and Peek modes too).
			if (e.payload) {
				setIsHovered(false);
				if (notchMode !== "fixed") // A chain being built (no percent, no result) only peeks for a while.
				if (notchMode !== "fixed") triggerEventPeek(e.payload.result ? 4000 : e.payload.percent === null ? 20000 : 600000);
			}
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, [windowLabel, notchMode, triggerEventPeek]);
	const [settingsTimerSoundEnabled, setSettingsTimerSoundEnabled] = useState(
		() => localStorage.getItem("bloom-timer-sound-enabled") !== "false"
	);
	const [settingsMusicModeEnabled, setSettingsMusicModeEnabled] = useState(
		() => localStorage.getItem("bloom-music-mode-enabled") !== "false"
	);
	const [rememberPanelEnabled, setRememberPanelEnabled] = useState(
		() => (localStorage.getItem("bloom-notch-remember-panel") ??
			localStorage.getItem("bloom-notch-click-to-open")) !== "false"
	);
	const rememberPanelEnabledRef = useRef(rememberPanelEnabled);
	rememberPanelEnabledRef.current = rememberPanelEnabled;
	const [defaultPanel, setDefaultPanel] = useState<NotchPanel>(() =>
		asNotchPanel(localStorage.getItem("bloom-notch-default-panel")) ?? "command-center"
	);
	// When the open notch last closed: Smart start returns to the last panel
	// only within SMART_START_MS of that, else to the favourite.
	const lastClosedAtRef = useRef(0);
	// The extra tools turned on (Settings › Notch › Tools), in tab order, and
	// the one showing while bloomMode is "tool".
	const [ccTiles, setCcTiles] = useState(() => parseCcTiles(localStorage.getItem("bloom-cc-tiles")));
	const [tabOrder, setTabOrder] = useState<unknown>(() => localStorage.getItem("bloom-tab-order"));
	const tabMotion = useRef<{ id: string | null; idx: number; dir: number }>({ id: null, idx: -1, dir: 0 });
	const stepTabRef = useRef<(direction: 1 | -1) => boolean>(() => false);
	const runShortcutRef = useRef<(action: string) => void>(() => {});
	// Which tool the notch opens on (Fable's rules, 2026-11-15): Quick return
	// (the tool you left, within `bloom-notch-quick-return` minutes of
	// closing) → Favourite (`bloom-notch-favourite`, any tool, when
	// `bloom-notch-favourite-on`) → the last tool used → Command Center.
	const openFromRestRef = useRef<() => void>(() => {});
	const [favouriteOn, setFavouriteOn] = useState(() => localStorage.getItem("bloom-notch-favourite-on") !== "false");
	const [favourite, setFavourite] = useState(
		() => localStorage.getItem("bloom-notch-favourite") ?? localStorage.getItem("bloom-notch-default-panel") ?? "command-center"
	);
	const [quickReturnMin, setQuickReturnMin] = useState(() => {
		const v = localStorage.getItem("bloom-notch-quick-return");
		if (v !== null) return Number(v) || 0;
		// Before: Smart Start on = 5 minutes, off = never.
		return localStorage.getItem("bloom-notch-remember-panel") === "false" ? 0 : 5;
	});
	const lastToolRef = useRef<string | null>(localStorage.getItem("bloom-notch-last-tool"));
	// A notch the Timer or a reminder opened doesn't count as "used".
	const autoOpenedRef = useRef(false);
	const [ccSystem, setCcSystem] = useState<CcSystemStates>({});
	const [activeTool, setActiveTool] = useState<ExtraToolId | null>(null);
	// Reminders and the Timer ring while their tool is on, even with the tab
	// closed: when one is due the notch opens on it and chimes, once per due
	// time. Checked every 2 s (ponytail: a poll, cheap: two small files).
	const rungRef = useRef(new Set<string>());
	useEffect(() => {
		const watch = (["reminders", "stopwatch"] as const).filter((t) => enabledTools.includes(t));
		if (windowLabel !== "main" || !watch.length) return;
		const ring = (tool: ExtraToolId, key: string) => {
			if (rungRef.current.has(key)) return;
			rungRef.current.add(key);
			playTimerChime();
			const open = () => {
				autoOpenedRef.current = true;
				setTimesUp(false);
				setActiveTool(tool);
				setIsOpen(true);
				setBloomMode("tool");
			};
			// The Timer says so first: a bold TIME'S UP on the notch, then it opens.
			if (tool === "stopwatch" && !isOpenRef.current) {
				setTimesUp(true);
				window.setTimeout(open, 1800);
			} else open();
		};
		const check = () => {
			if (watch.includes("reminders"))
				invoke<string | null>("tool_data_get", { tool: "reminders" })
					.then((text) => {
						const items: { id: string; at: number }[] = text ? JSON.parse(text).items ?? [] : [];
						const due = items.find((r) => r.at <= Date.now() && !rungRef.current.has(`${r.id}@${r.at}`));
						if (due) ring("reminders", `${due.id}@${due.at}`);
					})
					.catch(() => {});
			if (watch.includes("stopwatch"))
				invoke<string | null>("tool_data_get", { tool: "stopwatch" })
					.then((text) => {
						const t = text ? JSON.parse(text) : null;
						// The tab may have seen the end first and stopped it; only a
						// recent end rings (finishedFor outlives a restart).
						if (t?.finishedFor && !t.timerAt && t.finishedAt && Date.now() - t.finishedAt < 15000) ring("stopwatch", `timer@${t.finishedFor}`);
						// Pomodoro: a phase that ended rings and shows its countdown.
						if (t?.mode === "pomodoro" && t.phaseAt) {
							const total = pomodoroLength(t.phase ?? 0);
							const left = total - (t.phaseDone ?? 0) - (Date.now() - t.phaseAt);
							setToolTimer(left > 0 ? { left, total } : null);
							if (left <= 0) ring("stopwatch", `pomo@${t.phaseAt}`);
							if (!t.timerAt) return;
						}
						if (!t?.timerAt) return setToolTimer(null);
						const total = t.timerLength ?? 300000;
						const left = total - (t.timerDone ?? 0) - (Date.now() - t.timerAt);
						setToolTimer(left > 0 ? { left, total } : null);
						if (left <= 0) ring("stopwatch", `timer@${t.timerAt}`);
					})
					.catch(() => {});
		};
		check();
		const timer = window.setInterval(check, 1000);
		return () => window.clearInterval(timer);
	}, [windowLabel, enabledTools]);
	// OCR's one-step snip ends here (the notch may have closed meanwhile):
	// keep the text for the OCR page and open it, like a ring does.
	useEffect(() => {
		if (windowLabel !== "main") return;
		const off = listen<{ text?: string; error?: string }>("ocr-result", (e) => {
			const result = { text: e.payload.text ?? "", error: e.payload.error ?? "", at: Date.now() };
			invoke("tool_data_set", { tool: "ocr", json: JSON.stringify(result) }).catch(() => {});
			if (!enabledTools.includes("capture")) return;
			showPart("capture", "ocr");
			if (isOpenRef.current) return;
			autoOpenedRef.current = true;
			setActiveTool("capture");
			setIsOpen(true);
			setBloomMode("tool");
		});
		return () => void off.then((f) => f());
	}, [windowLabel, enabledTools]);
	const visualizerWantedRef = useRef(true);
	const visualizerSentRef = useRef<boolean | null>(null);
	// Open on click (default) or on hover after a delay.
	const [notchOpenOn, setNotchOpenOn] = useState(() => localStorage.getItem("bloom-notch-open-on") === "hover" ? "hover" : "click");
	const [notchHoverDelay, setNotchHoverDelay] = useState(() => {
		const v = parseInt(localStorage.getItem("bloom-notch-hover-delay") ?? "", 10);
		return Number.isFinite(v) ? v : 300;
	});
	// The panel the open notch was last left on. Opening the notch returns to it,
	// across restarts too (bloom-notch-last-panel).
	const [lastPanel, setLastPanel] = useState<NotchPanel | null>(() =>
		asNotchPanel(localStorage.getItem("bloom-notch-last-panel"))
	);
	const [settingsMusicCompactNotch, setSettingsMusicCompactNotch] = useState(
		() => localStorage.getItem("bloom-music-compact-notch") !== "false"
	);
	const [shelfPersist, setShelfPersist] = useState(
		() => localStorage.getItem("bloom-shelf-persist") === "true"
	);
	const [settingsVisualizerEnabled, setSettingsVisualizerEnabled] = useState(
		() => localStorage.getItem("bloom-visualizer-enabled") !== "false"
	);
	const [settingsAlbumArtEnabled, setSettingsAlbumArtEnabled] = useState(
		() => localStorage.getItem("bloom-media-album-art-enabled") !== "false"
	);
	const [settingsAmbienceEnabled, setSettingsAmbienceEnabled] = useState(
		() => localStorage.getItem("bloom-media-ambience-enabled") !== "false"
	);
	const [settingsCompactGlowEnabled, setSettingsCompactGlowEnabled] = useState(
		() => localStorage.getItem("bloom-media-compact-glow-enabled") !== "false"
	);
	const [mediaLayout, setMediaLayout] = useState<"classic" | "compact">(
		() => (localStorage.getItem("bloom-media-layout") as "classic" | "compact") || "classic"
	);
	const [compactVolumeExpanded, setCompactVolumeExpanded] = useState(false);

	// Weather hook
	const {
		temperature,
		weatherCondition,
		weatherIcon: WeatherIcon,
		cityName,
		tempUnit
	} = useWeather(settingsWeatherEnabled);

	useEffect(() => {
		if (!windowLabel) return;
		let cancelled = false;

		invoke("load_settings")
			.then(async (settings: any) => {
				if (await reloadIfMirrorWasStale(settings)) return;
				if (cancelled) return;
				const getVal = (key: string, fallback: string | null = null) => {
					const val = settings[key];
					if (val !== undefined && val !== null) return String(val);
					const local = localStorage.getItem(key);
					if (local !== null) return local;
					return fallback;
				};

				setSettingsWeatherEnabled(getVal("bloom-weather-enabled", "true") !== "false");
				setSettingsCalendarEnabled(getVal("bloom-calendar-enabled", "true") !== "false");
				setSettingsControlsPanelEnabled(
					getVal("bloom-notch-command-center-enabled", "true") !== "false"
				);
				setSettingsDevicesPanelEnabled(getVal("bloom-notch-devices-enabled", "false") === "true");
				setSettingsClipboardEnabled(getVal("bloom-clipboard-enabled", "true") !== "false");
				setClipboardPosition(getVal("bloom-clipboard-position", "notch") || "notch");
				setClipboardCopyIndicator(getVal("bloom-clipboard-copy-indicator", "true") !== "false");
				setSettingsTimerSoundEnabled(getVal("bloom-timer-sound-enabled", "true") !== "false");
				setSettingsMusicModeEnabled(getVal("bloom-music-mode-enabled", "true") !== "false");
				setRememberPanelEnabled(
					(getVal("bloom-notch-remember-panel") ?? getVal("bloom-notch-click-to-open", "true")) !== "false"
				);
				setDefaultPanel(asNotchPanel(getVal("bloom-notch-default-panel")) ?? "command-center");
				setNotchOpenOn(getVal("bloom-notch-open-on") === "hover" ? "hover" : "click");
				{
					const v = parseInt(String(getVal("bloom-notch-hover-delay") ?? ""), 10);
					setNotchHoverDelay(Number.isFinite(v) ? v : 300);
				}
				setShelfPersist(getVal("bloom-shelf-persist", "false") === "true");
				setSettingsMusicCompactNotch(getVal("bloom-music-compact-notch", "true") !== "false");
				setLastPanel(asNotchPanel(getVal("bloom-notch-last-panel")));
				const viz =
					getVal("bloom-media-visualizer-enabled") ?? getVal("bloom-visualizer-enabled", "true");
				setSettingsVisualizerEnabled(viz !== "false");
				setSettingsAlbumArtEnabled(getVal("bloom-media-album-art-enabled", "true") !== "false");
				setSettingsAmbienceEnabled(getVal("bloom-media-ambience-enabled", "true") !== "false");
				setSettingsCompactGlowEnabled(
					getVal("bloom-media-compact-glow-enabled", "true") !== "false"
				);
				setTimeFormat24h(getVal("bloom-time-format-24h") === "true");

				const thresholdStr = getVal("bloom-low-battery-threshold", "20");
				if (thresholdStr) setLowBatteryThreshold(parseInt(thresholdStr as string));

				const nMode = getVal("bloom-notch-mode", "fixed");
				if (nMode) {
					const mapped = nMode === "auto-hide" ? "smart" : nMode;
					setNotchMode(mapped);
				}

				if (windowLabel === "main") {
					const firstRun = localStorage.getItem("bloom-first-run") === null;
					if (firstRun) {
						import("@tauri-apps/plugin-autostart").then(({ enable, isEnabled }) => {
							isEnabled().then((enabled) => {
								if (!enabled) enable().catch(() => {});
							});
						});
						localStorage.setItem("bloom-first-run", "done");
					}
					// First-run setup (notch size, name, tools) lives in Settings:
					// open it until it's done, and again after a manual reinstall.
					const again = await invoke<boolean>("take_setup_marker").catch(() => false);
					if (again) {
						localStorage.setItem("bloom-setup-done", "false");
						await invoke("save_setting", { key: "bloom-setup-done", value: "false" }).catch(() => {});
					}
					if (again || getVal("bloom-setup-done", "false") !== "true")
						window.setTimeout(() => invoke("open_settings_window").catch(() => {}), 2500);
					const rawDockMode = getVal("bloom-dock-mode", "smart") as string;
					const dockMode = rawDockMode === "auto-hide" ? "smart" : rawDockMode;
					setDockMode(dockMode);
					setDockEnabled(getVal("bloom-dock-enabled", "true") === "true");
					const storedVersion = localStorage.getItem("bloom-app-version");
					let waitForSplash = firstRun || storedVersion === null;
					if (!waitForSplash) {
						try {
							waitForSplash = storedVersion !== (await getVersion());
						} catch {
							// Version lookup is optional; continue startup without a splash.
						}
					}
					if (cancelled) return;
					setWaitForStartupSplash(waitForSplash);
					setSystemSettingsReady(true);
				}

				const scaleVal = getVal("bloom-scale");
				if (scaleVal !== null) setGlobalScale(parseFloat(scaleVal));
				const notchScaleVal = getVal("bloom-notch-scale");
				if (notchScaleVal !== null) setNotchScale(parseFloat(notchScaleVal));
				setNotchStyle(asNotchStyle(getVal("bloom-notch-style")));
				setPanelOrder(parsePanelOrder(getVal("bloom-notch-panel-order")));
				setTimeSize(sizeOf(getVal("bloom-notch-time-size")));
				setLeftSize(sizeOf(getVal("bloom-notch-left-size")));
				setRightSize(sizeOf(getVal("bloom-notch-right-size")));

				const widgetsVal = getVal("bloom-status-widgets");
				if (widgetsVal) {
					try {
						const parsed = JSON.parse(widgetsVal);
						if (parsed && Array.isArray(parsed.left) && Array.isArray(parsed.right)) {
							setStatusWidgets(parsed);
						}
					} catch {}
				}
			})
			.catch((error) => {
				console.error(error);
				if (!cancelled && windowLabel === "main") setSystemSettingsReady(true);
			});
		return () => {
			cancelled = true;
		};
	}, [windowLabel]); // eslint-disable-line react-hooks/exhaustive-deps

	useEffect(() => {
		// Disable context menu globally
		const preventContext = (e: MouseEvent) => e.preventDefault();
		document.addEventListener("contextmenu", preventContext);

		const unlistenVisibility = listen<boolean>("visibility-change", (event) => {
			setIsVisible(event.payload);
		});

		const unlistenNotchOverlap = listen<boolean>("notch-overlap", (event) => {
			setIsOverlapped(event.payload);
		});

		const unlistenNotchEdgeHover = listen<boolean>("notch-edge-hover", (event) => {
			setIsEdgeHovered(event.payload);
		});

		// The backend emits this when the window flips to click-through while
		// the webview still thinks the pointer is inside the notch (it cannot
		// receive the mouseleave once the window is click-through).
		const unlistenNotchPointerLeft = listen("notch-pointer-left", () => {
			releaseNotchHover();
		});

		return () => {
			unlistenVisibility.then((f) => f());
			unlistenNotchOverlap.then((f) => f());
			unlistenNotchEdgeHover.then((f) => f());
			unlistenNotchPointerLeft.then((f) => f());
			document.removeEventListener("contextmenu", preventContext);
		};
	}, [windowLabel]);

	// Settings sync — consolidated dispatch for all settings events
	useSettingsSync(
		{
			"bloom-weather-enabled": setSettingsWeatherEnabled,
			"bloom-calendar-enabled": setSettingsCalendarEnabled,
			"bloom-notch-command-center-enabled": setSettingsControlsPanelEnabled,
			"bloom-notch-devices-enabled": setSettingsDevicesPanelEnabled,
			"bloom-clipboard-enabled": setSettingsClipboardEnabled,
			"bloom-clipboard-position": (v: unknown) => setClipboardPosition(String(v || "notch")),
			"bloom-clipboard-copy-indicator": (v: unknown) => setClipboardCopyIndicator(v !== false && v !== "false"),
			"bloom-timer-sound-enabled": setSettingsTimerSoundEnabled,
			"bloom-music-mode-enabled": setSettingsMusicModeEnabled,
			"bloom-notch-remember-panel": setRememberPanelEnabled,
			"bloom-notch-default-panel": (v: unknown) =>
				setDefaultPanel(asNotchPanel(v) ?? "command-center"),
			"bloom-notch-open-on": (v: unknown) => setNotchOpenOn(v === "hover" ? "hover" : "click"),
			"bloom-notch-hover-delay": (v: unknown) => {
				const n = parseInt(String(v ?? ""), 10);
				setNotchHoverDelay(Number.isFinite(n) ? n : 300);
			},
			"bloom-shelf-persist": setShelfPersist,
			"bloom-music-compact-notch": setSettingsMusicCompactNotch,
			"bloom-notch-last-panel": (v: unknown) => setLastPanel(asNotchPanel(v)),
			"bloom-media-visualizer-enabled": setSettingsVisualizerEnabled,
			"bloom-visualizer-enabled": setSettingsVisualizerEnabled,
			"bloom-media-album-art-enabled": setSettingsAlbumArtEnabled,
			"bloom-media-ambience-enabled": setSettingsAmbienceEnabled,
			"bloom-media-compact-glow-enabled": setSettingsCompactGlowEnabled,
			"bloom-media-layout": setMediaLayout,
			"bloom-scale": setGlobalScale,
			"bloom-notch-scale": setNotchScale,
			"bloom-notch-open-scale": (v: unknown) => {
				const n = parseFloat(String(v));
				setOpenScale(Number.isFinite(n) ? Math.min(1.25, Math.max(0.8, n)) : 1);
			},
			"bloom-notch-style": (v: unknown) => setNotchStyle(asNotchStyle(v)),
			"bloom-notch-panel-order": (v: unknown) => setPanelOrder(parsePanelOrder(v)),
			"bloom-notch-time-size": (v: unknown) => setTimeSize(sizeOf(v)),
			"bloom-notch-left-size": (v: unknown) => setLeftSize(sizeOf(v)),
			"bloom-notch-right-size": (v: unknown) => setRightSize(sizeOf(v)),
			"bloom-low-battery-threshold": setLowBatteryThreshold,
			"bloom-tools-enabled": (v: unknown) => setEnabledTools(parseEnabledTools(v)),
			"bloom-cc-tiles": (v: unknown) => setCcTiles(parseCcTiles(v)),
			"bloom-timer-display": (v: unknown) => setTimerDisplay(String(v)),
			"bloom-notch-favourite-on": (v: unknown) => setFavouriteOn(v !== false && v !== "false"),
			"bloom-notch-favourite": (v: unknown) => setFavourite(String(v)),
			"bloom-notch-quick-return": (v: unknown) => setQuickReturnMin(Number(v) || 0),
			"bloom-game-glance": (v: unknown) => setGameGlance(v === "on"),
			"bloom-tab-order": setTabOrder,
			"bloom-progress-effect": (v: unknown) => setProgressStyle(asProgressStyle(v)),
			"bloom-battery-saver": (v: unknown) => setSaverMode(String(v ?? "below")),
			"bloom-battery-saver-threshold": (v: unknown) => setSaverThreshold(parseInt(String(v ?? ""), 10) || 30),
			"bloom-battery-saver-pauses": (v: unknown) => setSaverPauses(parseSaverPauses(v)),
			"bloom-motion": (v: unknown) => setMotionPref(asMotionPref(v)),
			"bloom-dock-enabled": setDockEnabled,
			"bloom-dock-mode": setDockMode,
			"bloom-notch-mode": setNotchMode,
			"bloom-files-enabled": (v: unknown) => setRadialOn(v !== false && v !== "false"),
			"bloom-status-widgets": (value) => {
				try {
					const parsed = JSON.parse(value);
					if (parsed && Array.isArray(parsed.left) && Array.isArray(parsed.right)) {
						setStatusWidgets(parsed);
					}
				} catch {}
			},
			"bloom-show-update-indicator": (value) => setShowUpdateIndicator(String(value) === "true"),
			"bloom-time-format-24h": setTimeFormat24h
		},
		[windowLabel]
	);

	// One owner applies the latest window settings. Superseded splash timers and
	// retries are cancelled; an in-flight command finishes before the new state
	// is applied, so an old startup retry cannot overwrite a user change.
	useEffect(() => {
		if (windowLabel !== "main" || !systemSettingsReady) return;

		let cancelled = false;
		let started = false;
		let attempts = 0;
		let startTimer: number | undefined;
		let splashTimer: number | undefined;
		let retryTimer: number | undefined;
		let settleTimer: number | undefined;
		let unlistenSplash: (() => void) | undefined;

		const reconcile = () => {
			systemSyncQueue.current = systemSyncQueue.current
				.catch(() => {})
				.then(async () => {
					if (cancelled) return;
					try {
						if (dockEnabled) {
							if (!appliedDock.current?.enabled) {
								await invoke("init_dock", { mode: dockMode });
								appliedDock.current = { enabled: true, mode: dockMode };
							} else if (appliedDock.current.mode !== dockMode) {
								await invoke("change_dock_mode", { mode: dockMode });
								appliedDock.current = { enabled: true, mode: dockMode };
							}
						} else if (appliedDock.current?.enabled !== false) {
							await invoke("toggle_dock", { enable: false });
							appliedDock.current = { enabled: false, mode: dockMode };
						}
						if (cancelled) return;
						if (appliedNotchMode.current !== notchMode) {
							await invoke("change_notch_mode", { mode: notchMode });
							appliedNotchMode.current = notchMode;
						}
						if (cancelled) return;
						await invoke("sync_appbar");
						if (cancelled) return;
						const wasInitialSync = !initialSystemSyncDone.current;
						initialSystemSyncDone.current = true;
						if (wasInitialSync) {
							settleTimer = window.setTimeout(() => {
								if (!cancelled) {
									systemSyncQueue.current = systemSyncQueue.current
										.catch(() => {})
										.then(() => invoke<void>("sync_appbar"))
										.catch((error) => console.error("AppBar settle failed", error));
								}
							}, 1000);
						}
					} catch (error) {
						console.error("Window reconciliation failed", error);
						if (!cancelled && attempts++ < 1) {
							retryTimer = window.setTimeout(reconcile, 1000);
						}
					}
				});
		};

		const start = () => {
			if (cancelled || started) return;
			started = true;
			splashDone.current = true;
			if (splashTimer !== undefined) window.clearTimeout(splashTimer);
			unlistenSplash?.();
			startTimer = window.setTimeout(reconcile, initialSystemSyncDone.current ? 0 : 400);
		};

		if (waitForStartupSplash && !splashDone.current && !initialSystemSyncDone.current) {
			void listen("splash-done", start)
				.then((unlisten) => {
					if (cancelled || started) unlisten();
					else unlistenSplash = unlisten;
				})
				.catch(() => start());
			splashTimer = window.setTimeout(start, 6000);
		} else {
			start();
		}

		return () => {
			cancelled = true;
			for (const timer of [startTimer, splashTimer, retryTimer, settleTimer]) {
				if (timer !== undefined) window.clearTimeout(timer);
			}
			unlistenSplash?.();
		};
	}, [windowLabel, systemSettingsReady, waitForStartupSplash, dockEnabled, dockMode, notchMode]);

	// Bloom mode state: 'music', 'calendar', 'command-center', 'announcement', 'shelf', or 'status'
	const [bloomMode, setBloomMode] = useState<BloomMode>("status");

	// Shelf: files and selected text stashed in the notch via drag-and-drop.
	// Files are stored as plain paths (references, never copies). Session-scoped
	// by default; the bloom-shelf-persist setting keeps items across restarts.
	const [shelfItems, setShelfItems] = useState<ShelfItem[]>(() => {
		if (localStorage.getItem("bloom-shelf-persist") !== "true") return [];
		try {
			const saved = localStorage.getItem("bloom-shelf-items");
			const parsed = saved ? JSON.parse(saved) : [];
			if (!Array.isArray(parsed)) return [];
			return parsed
				.filter((i): i is ShelfItem => {
					if (typeof i?.id !== "string" || typeof i?.name !== "string") return false;
					// Items stored before text support have no `type`; treat as files.
					if (i.type === "text") return typeof i.text === "string";
					return typeof i.path === "string";
				})
				.map((i) => ({ ...i, type: i.type === "text" ? "text" : "file" }));
		} catch {
			return [];
		}
	});
	useEffect(() => {
		try {
			if (shelfPersist) {
				localStorage.setItem("bloom-shelf-items", JSON.stringify(shelfItems));
			} else {
				localStorage.removeItem("bloom-shelf-items");
			}
		} catch {
			/* storage full or unavailable — shelf just won't persist */
		}
	}, [shelfItems, shelfPersist]);

	// Drop file references whose files are gone (moved/deleted/drive unplugged)
	// once at startup, so a persisted shelf does not accumulate dead entries.
	// Text items are always kept.
	const shelfPrunedRef = useRef(false);
	useEffect(() => {
		if (shelfPrunedRef.current) return;
		shelfPrunedRef.current = true;
		const filePaths = shelfItems
			.filter((i) => i.type === "file" && i.path)
			.map((i) => i.path as string);
		if (filePaths.length === 0) return;
		invoke<string[]>("shelf_prune", { paths: filePaths })
			.then((existing) => {
				const alive = new Set(existing);
				setShelfItems((prev) => {
					const kept = prev.filter(
						(i) => i.type !== "file" || (i.path !== undefined && alive.has(i.path))
					);
					return kept.length === prev.length ? prev : kept;
				});
			})
			.catch(() => {});
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Previews are generated lazily per path and cached. Images, PDFs, Office
	// files with a saved thumbnail, and anything Windows can thumbnail (videos,
	// folders...) show a picture; documents and text files show their opening
	// text; the rest fall back to an icon for their type. Text items render
	// their content.
	const [shelfThumbs, setShelfThumbs] = useState<Record<string, ShelfPreview>>({});
	const shelfThumbPending = useRef<Set<string>>(new Set());
	useEffect(() => {
		for (const item of shelfItems) {
			if (item.type !== "file" || !item.path) continue;
			const path = item.path;
			if (shelfThumbs[path] !== undefined || shelfThumbPending.current.has(path)) continue;
			shelfThumbPending.current.add(path);
			// The item may be removed while this is in flight; don't resurrect
			// a stale cache entry.
			const storeThumb = (preview: ShelfPreview) =>
				setShelfThumbs((prev) => {
					if (!shelfItemsRef.current.some((i) => i.path === path)) return prev;
					return { ...prev, [path]: preview };
				});
			invoke<ShelfPreview>("shelf_thumbnail", { path })
				.then(storeThumb)
				.catch(() => storeThumb({ thumb: null, text: null, folder: false }))
				.finally(() => shelfThumbPending.current.delete(path));
		}
	}, [shelfItems, shelfThumbs]);

	// Drop cached thumbnails for items that left the shelf so the cache cannot
	// grow without bound over a long session (each entry is a data URI).
	useEffect(() => {
		const current = new Set(shelfItems.filter((i) => i.path).map((i) => i.path as string));
		setShelfThumbs((prev) => {
			const keys = Object.keys(prev);
			if (keys.every((k) => current.has(k))) return prev;
			const next: Record<string, ShelfPreview> = {};
			for (const k of keys) {
				if (current.has(k)) next[k] = prev[k];
			}
			return next;
		});
	}, [shelfItems]);

	// Native drag preview for items without a thumbnail.
	const [shelfDragIcon, setShelfDragIcon] = useState<string | null>(null);
	useEffect(() => {
		invoke<string | null>("shelf_drag_icon")
			.then(setShelfDragIcon)
			.catch(() => {});
	}, []);

	// Picking a file back up is a drag-out gesture: press, move past a small
	// threshold, and the OS takes over the drag. A press without movement is a
	// plain click that opens the file (or copies text items).
	const shelfPointerRef = useRef<{ id: string; x: number; y: number; dragging: boolean } | null>(
		null
	);
	// Timestamp of the last drop onto the notch. A drop recorded during our
	// own drag-out means the item came back to the notch (pointer still over
	// it), which decides whether the drag cleanup clears the hover flags.
	const shelfSelfDropAtRef = useRef(0);
	// True while our own drag-out is running, so the drag-enter we receive when
	// it starts over the notch does not flash the hover outline or re-open it.
	const shelfSelfDragRef = useRef(false);
	// Set while an item is dragged out of the Clipboard panel.
	const clipboardSelfDragRef = useRef(false);
	const handleShelfPointerDown = (e: React.PointerEvent<HTMLDivElement>, item: ShelfItem) => {
		if (e.button !== 0) return;
		// Text items have no native drag-out; a click copies them.
		if (item.type !== "file" || !item.path) return;
		// The remove button must keep receiving its own click; capturing the
		// pointer on the tile would retarget it.
		if ((e.target as HTMLElement).closest(".shelf-tile-remove")) return;
		e.stopPropagation();
		e.currentTarget.setPointerCapture(e.pointerId);
		shelfPointerRef.current = { id: item.id, x: e.clientX, y: e.clientY, dragging: false };
	};
	const handleShelfPointerMove = (e: React.PointerEvent<HTMLDivElement>, item: ShelfItem) => {
		const st = shelfPointerRef.current;
		if (!st || st.id !== item.id || st.dragging) return;
		if (Math.hypot(e.clientX - st.x, e.clientY - st.y) < 6) return;
		if (!item.path) return;
		const path = item.path;
		const icon = shelfThumbs[path]?.thumb ?? shelfDragIcon;
		if (!icon) return;
		st.dragging = true;
		// Picking an item up is a deliberate act; don't let the post-drop
		// auto-close fire mid-drag.
		clearShelfCollapse();
		shelfSelfDragRef.current = true;
		const dragStartedAt = Date.now();
		startDrag({ item: [path], icon })
			.catch((err) => console.error("[shelf] drag out failed:", path, err))
			.finally(() => {
				shelfSelfDragRef.current = false;
				// A drop recorded during this drag means it landed back on the
				// notch, so the pointer is still over it. Otherwise the native
				// drag owned the pointer and the webview never saw it leave —
				// release the hover state (flags AND the resting mode) or the
				// shelf panel stays expanded. The command also makes the
				// backend re-evaluate its edge-hover state immediately.
				const droppedOnSelf = shelfSelfDropAtRef.current >= dragStartedAt;
				if (!droppedOnSelf) {
					releaseNotchHover();
					invoke("set_notch_hovered", { hovered: false }).catch(() => {});
				}
			});
	};
	const handleShelfTileClick = (e: React.MouseEvent<HTMLDivElement>, item: ShelfItem) => {
		e.stopPropagation();
		const st = shelfPointerRef.current;
		shelfPointerRef.current = null;
		// Only this tile's own drag suppresses the click; a stale flag from a
		// previous tile's drag-out must not swallow it.
		if (st && st.id === item.id && st.dragging) return;
		openShelfItem(item);
	};

	// Wheel scrolling for the shelf strip: ease towards a target instead of
	// jumping, so wheel and trackpad input both feel fluid.
	const shelfScrollTargetRef = useRef<number | null>(null);
	const shelfGridRef = useRef<HTMLDivElement>(null);
	// Whether the shelf row overflows, so it gets room for its scrollbar.
	const [shelfOverflowing, setShelfOverflowing] = useState(false);
	// Measured against the open shelf's width (380px minus its 14px side
	// padding) rather than the live one, which is still growing while the
	// notch animates open. A removed tile stays in the row until its exit
	// animation ends, so the row is measured again then.
	const measureShelfOverflow = useCallback(() => {
		const el = shelfGridRef.current;
		setShelfOverflowing(!!el && el.scrollWidth > 380 - 28 + 1);
	}, []);
	useLayoutEffect(measureShelfOverflow, [shelfItems, bloomMode, measureShelfOverflow]);
	const shelfScrollRafRef = useRef<number | null>(null);
	// The wheel scrolls the row from anywhere over the shelf view, not just
	// over the tiles. Mice that report lines instead of pixels are scaled up.
	const handleShelfWheel = (e: React.WheelEvent<HTMLDivElement>) => {
		const el = shelfGridRef.current;
		if (!el) return;
		const max = el.scrollWidth - el.clientWidth;
		if (max <= 0) return;
		const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? el.clientWidth : 1;
		const base = shelfScrollTargetRef.current ?? el.scrollLeft;
		shelfScrollTargetRef.current = Math.max(0, Math.min(max, base + (e.deltaY + e.deltaX) * unit));
		if (shelfScrollRafRef.current !== null) return;
		const step = () => {
			const target = shelfScrollTargetRef.current;
			if (target === null) {
				shelfScrollRafRef.current = null;
				return;
			}
			const diff = target - el.scrollLeft;
			if (Math.abs(diff) < 0.5) {
				el.scrollLeft = target;
				shelfScrollTargetRef.current = null;
				shelfScrollRafRef.current = null;
				return;
			}
			const before = el.scrollLeft;
			el.scrollLeft += diff * 0.22;
			// At fractional display scales a small step can round back to the
			// same position; finish the move instead of stalling short of it.
			if (el.scrollLeft === before) {
				el.scrollLeft = target;
				shelfScrollTargetRef.current = null;
				shelfScrollRafRef.current = null;
				return;
			}
			shelfScrollRafRef.current = requestAnimationFrame(step);
		};
		shelfScrollRafRef.current = requestAnimationFrame(step);
	};

	// The shelf closes itself shortly after a drop so the notch does not stay
	// expanded. Hovering it cancels the timer; leaving collapses it.
	const shelfCollapseTimer = useRef<number | null>(null);
	// What the collapsed notch shows (see collapsedMode). Refs let the drop
	// listener and the backend pointer-left event, both mounted once, act on
	// the current state.
	const restingModeRef = useRef<BloomMode>("status");
	const bloomModeRef = useRef<BloomMode>("status");
	const rememberPanelRef = useRef<(panel: NotchPanel) => void>(() => {});
	const notchPinnedRef = useRef(false);
	const releaseDeferredRef = useRef(false);

	// Shared hover-release, called on DOM hover end and when the backend
	// reports the pointer left the (now click-through) notch window. Closes an
	// open notch, remembering its panel, and returns to the resting mode.
	const releaseNotchHover = () => {
		// A view being typed into (a Wi-Fi password) keeps the notch open; the
		// release happens once it lets go, if the pointer is still away.
		if (notchPinnedRef.current) {
			releaseDeferredRef.current = true;
			return;
		}
		releaseTextKeyboard();
		setIsHovered(false);
		setIsNotchHovered(false);
		if (isOpenRef.current) {
			const panel = asNotchPanel(bloomModeRef.current);
			if (panel && rememberPanelEnabledRef.current) rememberPanelRef.current(panel);
			lastClosedAtRef.current = Date.now();
			setIsOpen(false);
		}
		setBloomMode((prev) =>
			prev === "music" ||
			prev === "command-center" ||
			prev === "calendar" ||
			prev === "status" ||
			prev === "shelf" ||
			prev === "wifi" ||
			prev === "bluetooth" ||
			prev === "devices" ||
			prev === "clipboard" ||
			prev === "tool"
				? restingModeRef.current
				: prev
		);
	};

	const releaseNotchHoverRef = useRef(releaseNotchHover);
	releaseNotchHoverRef.current = releaseNotchHover;

	const clearShelfCollapse = () => {
		if (shelfCollapseTimer.current !== null) {
			window.clearTimeout(shelfCollapseTimer.current);
			shelfCollapseTimer.current = null;
		}
	};

	const collapseShelfSoon = (delay = 1800) => {
		clearShelfCollapse();
		shelfCollapseTimer.current = window.setTimeout(() => {
			shelfCollapseTimer.current = null;
			if (bloomModeRef.current !== "shelf") return;
			setIsOpen(false);
			setBloomMode(restingModeRef.current);
		}, delay);
	};

	const removeShelfItem = (id: string) => {
		const next = shelfItems.filter((i) => i.id !== id);
		setShelfItems(next);
		if (next.length === 0 && bloomMode === "shelf") {
			// Nothing left to show: an open notch moves to the remembered panel,
			// a closed one to its resting mode, instead of an empty shelf.
			clearShelfCollapse();
			setBloomMode(isOpen ? openingPanel() : restingModeRef.current);
		}
	};

	// A full shelf never evicts silently: whatever fits is added and the rest
	// is reported. Reads through a ref so the drop listener (mounted once) sees
	// the current list.
	const shelfItemsRef = useRef<ShelfItem[]>(shelfItems);
	shelfItemsRef.current = shelfItems;
	// Tiles that were just added get an entrance animation; ones restored when
	// the panel reopens do not (the panel itself already fades in).
	const shelfNewIdsRef = useRef<Set<string>>(new Set());
	const markShelfNew = (ids: string[]) => {
		for (const id of ids) shelfNewIdsRef.current.add(id);
		window.setTimeout(() => {
			for (const id of ids) shelfNewIdsRef.current.delete(id);
		}, 900);
	};
	const [shelfNotice, setShelfNotice] = useState<string | null>(null);
	const shelfNoticeTimer = useRef<number | null>(null);
	const showShelfNotice = (message: string) => {
		setShelfNotice(message);
		if (shelfNoticeTimer.current !== null) window.clearTimeout(shelfNoticeTimer.current);
		shelfNoticeTimer.current = window.setTimeout(() => {
			shelfNoticeTimer.current = null;
			setShelfNotice(null);
		}, 2600);
	};

	const addShelfItems = (paths: string[]) => {
		if (paths.length === 0) return;
		const prev = shelfItemsRef.current;
		const existing = new Set(prev.filter((i) => i.path).map((i) => i.path));
		const fresh: ShelfItem[] = [];
		for (const p of paths) {
			if (existing.has(p)) continue;
			existing.add(p);
			fresh.push({
				id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
				type: "file",
				name: p.split("\\").pop()?.split("/").pop() || p,
				path: p,
				timestamp: Date.now()
			});
		}
		if (fresh.length === 0) return;

		const room = Math.max(0, SHELF_MAX_ITEMS - prev.length);
		if (room === 0) {
			showShelfNotice(`Shelf is full (${SHELF_MAX_ITEMS}) — remove an item first`);
			return;
		}
		if (fresh.length > room) {
			showShelfNotice(`Shelf is full — added ${room} of ${fresh.length} items`);
		}
		const added = fresh.slice(0, room);
		markShelfNew(added.map((i) => i.id));
		setShelfItems([...added, ...prev]);
	};

	const addShelfText = (text: string) => {
		const prev = shelfItemsRef.current;
		if (prev.some((i) => i.type === "text" && i.text === text)) return;
		if (prev.length >= SHELF_MAX_ITEMS) {
			showShelfNotice(`Shelf is full (${SHELF_MAX_ITEMS}) — remove an item first`);
			return;
		}
		const item: ShelfItem = {
			id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
			type: "text",
			name: text.trim().replace(/\s+/g, " ").slice(0, 48),
			text,
			timestamp: Date.now()
		};
		markShelfNew([item.id]);
		setShelfItems([item, ...prev]);
	};

	// Files open in their default app; text items are copied to the clipboard
	// so they can be pasted anywhere. A file that no longer exists is reported
	// and dropped from the shelf.
	const openShelfItem = (item: ShelfItem) => {
		if (item.type === "text") {
			if (!item.text) return;
			writeText(item.text)
				.then(() => showShelfNotice("Copied to clipboard"))
				.catch((e) => console.error("[shelf] copy failed:", e));
			return;
		}
		if (item.path) {
			const path = item.path;
			invoke("shelf_open", { path }).catch(async (e) => {
				console.error("[shelf] open failed:", path, e);
				// Only a confirmed-missing file leaves the shelf; a transient
				// failure (e.g. no association) must not remove it.
				const alive = await invoke<string[]>("shelf_prune", { paths: [path] }).catch(() => null);
				if (alive && alive.length === 0) {
					showShelfNotice("File no longer exists — removed from shelf");
					removeShelfItem(item.id);
				} else {
					showShelfNotice("Couldn't open the file");
				}
			});
		}
	};

	// Text fields in the notch (clipboard search, Wi-Fi password) need the
	// keyboard handed to this no-activate window.
	useTextInputKeyboard();

	// The backend captures audio only while the visualizer is wanted.
	useEffect(() => {
		if (windowLabel !== "main") return;
		if (visualizerSentRef.current === visualizerWantedRef.current) return;
		visualizerSentRef.current = visualizerWantedRef.current;
		invoke("set_visualizer_wanted", { wanted: visualizerWantedRef.current }).catch(() => {});
	});

	// Esc closes the open notch (the keyboard hook in services.rs reports it;
	// this window never takes focus). The backend learns open/closed here.
	useEffect(() => {
		if (windowLabel !== "main") return;
		invoke("set_notch_open", { open: isOpen }).catch(() => {});
	}, [isOpen, windowLabel]);
	useEffect(() => {
		if (windowLabel !== "main") return;
		// Esc steps back one level: a Wi-Fi / Bluetooth list returns to the
		// Command Center, the next Esc closes the notch.
		const onEscape = () => {
			// Typing in a field: Esc leaves it (number keys switch tabs again);
			// the next Esc steps back / closes.
			const active = document.activeElement as HTMLElement | null;
			if (active?.matches("input, textarea, [contenteditable='true']")) {
				active.blur();
				releaseTextKeyboard();
				notchPinnedRef.current = false;
				return;
			}
			if (bloomModeRef.current === "wifi" || bloomModeRef.current === "bluetooth") return setBloomMode("command-center");
			// A tool holding the keys (the Calculator) lets them go first.
			const toolEsc = new Event("notch-escape-tool", { cancelable: true });
			window.dispatchEvent(toolEsc);
			if (toolEsc.defaultPrevented) return;
			// Closes, clearing any pin a tool left (a pinned notch used to
			// ignore Esc).
			notchPinnedRef.current = false;
			(document.activeElement as HTMLElement | null)?.blur?.();
			releaseNotchHoverRef.current();
		};
		// From the keyboard hook while another app has the keyboard…
		const unlisten = listen("notch-escape", onEscape);
		// …and here while the notch has it (typing in a note): Windows doesn't
		// run LotusNotch's hook then.
		const onEscKey = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !e.defaultPrevented && isOpenRef.current) onEscape();
		};
		window.addEventListener("keydown", onEscKey);
		// Global shortcuts (shortcuts.rs): the notch runs the action.
		const unlistenShortcut = listen<string>("shortcut", (e) => runShortcutRef.current(e.payload));
		// Tab moves into the open tab's typing box (the Shelf's search, a note…).
		const typeHere = () => focusFirstTextField(document.querySelector(".tool-host-motion") ?? document.querySelector(".qp") ?? bloomRef.current);
		const unlistenTab = listen("notch-tab", () => isOpenRef.current && typeHere());
		// With this window focused (typing in a tool), 1–9 jump to a tab and
		// Shift+1–9 to one counted from the end, unless a text field has the keys.
		const onDigit = (e: KeyboardEvent) => {
			if (e.defaultPrevented || !isOpenRef.current || e.ctrlKey || e.altKey || e.metaKey) return;
			const target = e.target as HTMLElement | null;
			if (target?.closest("input, textarea, [contenteditable='true']")) return;
			if (e.key === "Tab" && !e.shiftKey) {
				if (typeHere()) e.preventDefault();
				return;
			}
			const m = /^(Digit|Numpad)([1-9])$/.exec(e.code);
			if (!m || (e.shiftKey && m[1] === "Numpad")) return;
			e.preventDefault();
			runShortcutRef.current(e.shiftKey ? `tool-end-${m[2]}` : `tool-${m[2]}`);
		};
		window.addEventListener("keydown", onDigit);
		return () => {
			unlisten.then((f) => f());
			unlistenShortcut.then((f) => f());
			unlistenTab.then((f) => f());
			window.removeEventListener("keydown", onEscKey);
			window.removeEventListener("keydown", onDigit);
		};
	}, [windowLabel]);

	// The clipboard shortcut (clipboard.rs) toggles the Clipboard panel while
	// the history lives in the notch.
	useEffect(() => {
		if (windowLabel !== "main") return;
		const unlisten = listen("clipboard-shortcut", () => {
			if (bloomModeRef.current === "clipboard" && isOpenRef.current) {
				setIsOpen(false);
				setBloomMode(restingModeRef.current);
			} else if (bloomModeRef.current !== "announcement") {
				setIsOpen(true);
				setBloomMode("clipboard");
			}
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, [windowLabel]);

	// Shelf drag-and-drop plumbing. The backend registers its own OLE drop
	// target (src-tauri/src/shelf.rs) because wry's target can go stale when
	// WebView2 recreates its render child; it emits the shelf-drag-* events
	// below. Drag-enter switches to the shelf panel (restoring the previous
	// mode on cancel); drop stashes the real file paths.
	const [isDragHovering, setIsDragHovering] = useState(false);
	const shelfPrevModeRef = useRef<BloomMode>("status");
	const shelfPrevOpenRef = useRef(false);
	const shelfDragActiveRef = useRef(false);
	useEffect(() => {
		let unlisteners: (() => void)[] = [];
		let cancelled = false;

		const enter = (event: { payload: { paths?: string[]; text?: string } }) => {
			// Our own drag-out starts with the cursor over the notch; ignore
			// the enter it causes instead of flashing the hover state.
			if (shelfSelfDragRef.current) return;
			console.info("[shelf] drag-enter:", event.payload.paths ?? event.payload.text);
			setIsDragHovering(true);
			const prev = bloomModeRef.current;
			// The open Clipboard panel takes drops itself.
			if (prev === "announcement" || prev === "shelf" || prev === "clipboard") return;
			shelfPrevModeRef.current = prev;
			shelfPrevOpenRef.current = isOpenRef.current;
			shelfDragActiveRef.current = true;
			setIsOpen(true);
			// With clipboard history in the notch, drops go to it, not the shelf.
			setBloomMode(clipboardInNotchRef.current ? "clipboard" : "shelf");
		};
		const leave = () => {
			setIsDragHovering(false);
			if (shelfDragActiveRef.current) {
				shelfDragActiveRef.current = false;
				if (bloomModeRef.current === "shelf" || bloomModeRef.current === "clipboard") {
					setIsOpen(shelfPrevOpenRef.current);
					setBloomMode(shelfPrevModeRef.current);
				}
			}
		};
		const drop = (event: { payload: { paths?: string[]; text?: string; position?: { x: number; y: number } } }) => {
			setIsDragHovering(false);
			shelfDragActiveRef.current = false;
			shelfSelfDropAtRef.current = Date.now();
			const paths = event.payload.paths ?? [];
			const text = event.payload.text;
			if (bloomModeRef.current === "clipboard") {
				// Dropped on a person in the share column: send it, don't keep it.
				const peer = clipboardSelfDragRef.current ? null : sharePeerAt(event.payload.position);
				if (peer) return requestSend(peer, { paths, text });
				// Dropping our own drag back onto the panel is a no-op.
				if (!clipboardSelfDragRef.current) invoke("clipboard_add", { paths, text }).catch(() => {});
				return;
			}
			console.info("[shelf] drop:", paths.length > 0 ? paths : text);
			if (paths.length === 0 && !text) return;
			if (paths.length > 0) addShelfItems(paths);
			if (text) addShelfText(text);
			if (bloomModeRef.current !== "announcement") {
				setIsOpen(true);
				setBloomMode("shelf");
			}
			collapseShelfSoon();
		};

		Promise.all([
			listen<{ paths?: string[]; text?: string }>("shelf-drag-enter", enter),
			listen("shelf-drag-leave", leave),
			listen<{ paths?: string[]; text?: string }>("shelf-drag-drop", drop)
		])
			.then((fns) => {
				if (cancelled) {
					fns.forEach((fn) => fn());
				} else {
					unlisteners = fns;
				}
			})
			.catch((e) => console.error("[shelf] drag-drop listener failed:", e));

		invoke("setup_shelf_drop").catch((e) => console.error("[shelf] drop target setup failed:", e));

		return () => {
			cancelled = true;
			unlisteners.forEach((fn) => fn());
		};
	}, []);

	// Open the notch on an unseen announcement; stays open until dismissed.
	useEffect(() => {
		if (!announcement || announcementDismissed) return;
		if (announcementShownRef.current === announcement.id) return;
		announcementShownRef.current = announcement.id;
		setBloomMode("announcement");
		if (notchMode === "peek") triggerEventPeek(6000);
	}, [announcement, announcementDismissed, notchMode, triggerEventPeek]);

	// Leave the announcement view once it is dismissed (or gone).
	useEffect(() => {
		if (bloomMode === "announcement" && (!announcement || announcementDismissed)) {
			setBloomMode(mediaInfo.has_media && isPlaying ? "music" : "status");
		}
	}, [bloomMode, announcement, announcementDismissed, mediaInfo.has_media, isPlaying]);

	// Window height is now kept constant to prevent rendering layout lag and sharp corners

	const lastScrollTime = useRef(0);
	const handleWheel = (e: React.WheelEvent) => {
		const target = e.target as HTMLElement;
		if (isOpen && !target.closest(".main-row")) return;
		if (
			target.closest(".calendar-grid") ||
			target.closest(".timer-column") ||
			target.closest(".shelf-content") ||
			target.closest(".qp-list") ||
			target.closest(".clip-list")
		) {
			return;
		}

		const now = Date.now();
		if (now - lastScrollTime.current < 250) return;

		// Use absolute values to detect horizontal swipe gestures on trackpad
		const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
		if (Math.abs(delta) < 5) return; // Ignore tiny movements

		if (cycleBloomMode(delta > 0 ? 1 : -1)) lastScrollTime.current = now;
	};

	function panelEnabled(panel: NotchPanel) {
		if (panel === "calendar") return settingsCalendarEnabled;
		if (panel === "command-center") return settingsControlsPanelEnabled;
		if (panel === "clipboard") return clipboardInNotch;
		return settingsDevicesPanelEnabled;
	}

	// Settings keeps at least one panel on; if a hand-edited settings file turns
	// them all off, Controls stays so the open notch is never empty.
	function panelAvailable(panel: NotchPanel) {
		if (!NOTCH_PANELS.some(panelEnabled)) return panel === "command-center";
		return panelEnabled(panel);
	}

	// Wheel and swipe navigate panels, even from a collapsed live activity.
	// Music and shelf remain entry points through their activity affordances.
	const cycleBloomMode = (direction: 1 | -1) => {
		if (bloomMode === "announcement") return false;
		// Open: the wheel walks every tab in the tab bar, in its order.
		if (isOpen && stepTabRef.current(direction)) return true;
		const panels = panelOrder.filter(panelAvailable);
		const currentIndex = panels.indexOf(bloomMode as NotchPanel);
		const nextMode = currentIndex === -1
			? openingPanel()
			: panels[(currentIndex + direction + panels.length) % panels.length];
		setIsOpen(true);
		setBloomMode(nextMode);
		return true;
	};

	// Arrows and wheel both stay within panels once one is open.
	const cyclePanel = (direction: 1 | -1) => {
		if (stepTabRef.current(direction)) return;
		const panels = panelOrder.filter(panelAvailable);
		const index = panels.indexOf(bloomMode as NotchPanel);
		if (index === -1 || panels.length < 2) return;
		setBloomMode(panels[(index + direction + panels.length) % panels.length]);
	};

	// The Day tab's own timer was removed (user, 2026-11-20: the Timer tab
	// does it). ponytail: its countdown state and closed-notch display below
	// can no longer start; delete them with the next notch cleanup.
	const [timerSeconds, setTimerSeconds] = useState(0);
	const [isTimerRunning, setIsTimerRunning] = useState(false);
	const [isTimerFinished, setIsTimerFinished] = useState(false);
	const timerIntervalRef = useRef<any>(null);
	const prevTimerFinishedRef = useRef(false);

	// The Game strip glance: CPU · GPU · RAM in the clock's place, read every
	// 2 s only while it shows.
	// Hidden while hovered: the hover widgets beside the clock would land on it.
	const showGlance = glanceOn && !isOpen && !isHovered && !timesUp && !toolTimer && timerSeconds === 0 && !isTimerFinished;
	useEffect(() => {
		if (windowLabel !== "main" || !showGlance) return setGlance(null);
		const read = () =>
			Promise.all([
				invoke<{ cpu: number; mem_used: number; mem_total: number }>("system_stats"),
				invoke<number | null>("gpu_usage").catch(() => null)
			])
				.then(([s, gpu]) => setGlance({ cpu: s.cpu, gpu, ram: (s.mem_used / s.mem_total) * 100 }))
				.catch(() => {});
		read();
		const t = window.setInterval(read, 2000);
		return () => window.clearInterval(t);
	}, [showGlance, windowLabel]);
	// The Timer tool's countdown takes the clock's place on the closed notch.
	const showToolTimer =
		!!toolTimer && !isOpen && timerSeconds === 0 && !isTimerFinished && (timerDisplay === "pill" || timerDisplay === "both");
	const formatTimerTime = (totalSeconds: number) => {
		const mins = Math.floor(Math.abs(totalSeconds) / 60);
		const secs = Math.abs(totalSeconds) % 60;
		return `${mins}:${secs.toString().padStart(2, "0")}`;
	};

	const resetTimer = () => {
		setIsTimerRunning(false);
		setTimerSeconds(0);
		setIsTimerFinished(false);
	};

	useEffect(() => {
		if (isTimerRunning && timerSeconds > 0) {
			timerIntervalRef.current = setInterval(() => {
				setTimerSeconds((s) => s - 1);
			}, 1000);
		} else if (isTimerRunning && timerSeconds === 0) {
			setIsTimerRunning(false);
			setIsTimerFinished(true);
		}
		return () => {
			if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
		};
	}, [isTimerRunning, timerSeconds === 0]);

	// Completion moment: chime once and reveal the notch in peek mode.
	useEffect(() => {
		if (isTimerFinished && !prevTimerFinishedRef.current) {
			if (settingsTimerSoundEnabled) playTimerChime();
			if (notchMode === "peek") triggerEventPeek(6000);
		}
		prevTimerFinishedRef.current = isTimerFinished;
	}, [isTimerFinished, settingsTimerSoundEnabled, notchMode, triggerEventPeek]);

	const lastTrackRef = useRef<string | null>(null);
	const lastPlayingRef = useRef<boolean>(false);
	const [musicActivityVisible, setMusicActivityVisible] = useState(false);

	// Keep a paused media session visible briefly so it can be resumed, then
	// clear its compact activity even if Windows retains the media session.
	useEffect(() => {
		if (!settingsMusicModeEnabled || !mediaInfo.has_media) {
			setMusicActivityVisible(false);
			return;
		}
		setMusicActivityVisible(true);
		if (isPlaying) return;
		const timeout = window.setTimeout(() => setMusicActivityVisible(false), 5000);
		return () => window.clearTimeout(timeout);
	}, [settingsMusicModeEnabled, mediaInfo.has_media, isPlaying]);

	// Like the Dynamic Island, the collapsed notch shows one live activity at a
	// time. Music fades a few seconds after playback stops. A set timer
	// (running, paused or just finished) takes the pill, and music then moves to
	// its own bubble beside it.
	const timerActive = timerSeconds > 0 || isTimerFinished;
	const musicActivity =
		settingsMusicModeEnabled && settingsMusicCompactNotch && mediaInfo.has_media && musicActivityVisible;
	const collapsedMode = musicActivity && !timerActive ? "music" : "status";
	const showMusicBubble = musicActivity && timerActive && !isOpen && isVisible && !isHidden;
	const showShelfBubble =
		shelfItems.length > 0 && !isOpen && isVisible && !isHidden && bloomMode !== "announcement";
	restingModeRef.current = collapsedMode;
	bloomModeRef.current = bloomMode;

	// Smart start: a click reopens the last-used panel if the notch closed
	// less than 5 minutes ago (and memory is on), otherwise the favourite
	// (Default Panel, Command Center unless changed). If that panel is turned
	// off, the first one that's on. A live activity opens its own view instead
	// (its click handler).
	const openingPanel = (): NotchPanel => {
		const recent = Date.now() - lastClosedAtRef.current < SMART_START_MS;
		const preferred = rememberPanelEnabled && recent ? lastPanel ?? defaultPanel : defaultPanel;
		if (panelAvailable(preferred)) return preferred;
		return panelOrder.find(panelAvailable) ?? "command-center";
	};

	// Expands the notch into a panel, or into an activity's own view.
	const openNotch = (view: NotchPanel | "music" | "shelf") => {
		if (bloomMode === "announcement") return;
		setIsOpen(true);
		setBloomMode(view);
	};

	// Someone asks to pair or adds you to a group: open the Shelf in the notch, where the share
	// column shows the request and its code (an edge Shelf shows it when
	// opened; the request waits a minute).
	useEffect(() => {
		if (windowLabel !== "main") return;
		const show = () => {
			if (!clipboardInNotchRef.current) return;
			autoOpenedRef.current = true;
			setIsOpen(true);
			setBloomMode("clipboard");
		};
		const offs = [listen("share-pair-request", show), listen("share-group-invite", show)];
		return () => offs.forEach((o) => void o.then((f) => f()));
	}, [windowLabel]);

	const openFromShortcutRef = useRef(() => {});
	openFromShortcutRef.current = () => openFromRestRef.current();

	// A tool turned off while its tab shows: fall back to the opening panel.
	useEffect(() => {
		if (bloomMode === "tool" && isOpen && !(activeTool && enabledTools.includes(activeTool))) {
			setBloomMode(openingPanel());
		}
	}, [bloomMode, isOpen, activeTool, enabledTools]);

	// Hover opening: resting on the notch for the delay opens it like a click.
	useEffect(() => {
		if (notchOpenOn !== "hover" || !isHovered || isOpen || fileStatus || bloomMode === "announcement") return;
		const timer = window.setTimeout(() => openFromRestRef.current(), notchHoverDelay);
		return () => window.clearTimeout(timer);
	}, [notchOpenOn, notchHoverDelay, isHovered, isOpen, fileStatus, bloomMode]);

	const rememberPanel = (panel: NotchPanel) => {
		if (panel === lastPanel) return;
		setLastPanel(panel);
		localStorage.setItem("bloom-notch-last-panel", panel);
		invoke("save_setting", { key: "bloom-notch-last-panel", value: panel }).catch(console.error);
	};
	rememberPanelRef.current = rememberPanel;

	// Called by views that take typed input; see releaseNotchHover.
	const setNotchPinned = useCallback((pinned: boolean) => {
		notchPinnedRef.current = pinned;
		if (!pinned && releaseDeferredRef.current) {
			releaseDeferredRef.current = false;
			releaseNotchHover();
		}
		// releaseNotchHover only touches refs and state setters.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Settings › Notch › Hide From Recordings (on by default).
	useHideFromCapture("bloom-notch-hide-from-capture", true, windowLabel === "main");

	// Setup's live preview: hold the notch closed (showing the time) or open
	// on the Command Center while its size is chosen; null lets it go.
	useEffect(() => {
		if (windowLabel !== "main") return;
		const off = listen<"closed" | "open" | null>("setup-preview", (e) => {
			const state = e.payload;
			setSetupPreview(state);
			notchPinnedRef.current = state === "open";
			if (state === "open") {
				setIsOpen(true);
				setBloomMode("command-center");
			} else {
				setIsOpen(false);
				setBloomMode("status");
			}
		});
		return () => void off.then((f) => f());
	}, [windowLabel]);

	// In peek mode, briefly show the notch when a new track starts or playback
	// resumes. The notch itself never switches views for media; the collapsed
	// pill follows the live-activity rule below.
	useEffect(() => {
		const isNewTrackWhilePlaying = mediaInfo.title !== lastTrackRef.current && isPlaying;
		const justStartedPlaying = isPlaying && !lastPlayingRef.current;

		// Peek notch on media events (play start or track change)
		if (notchMode === "peek" && (isNewTrackWhilePlaying || justStartedPlaying)) {
			triggerEventPeek(3000);
		}

		lastTrackRef.current = mediaInfo.title;
		lastPlayingRef.current = isPlaying;
	}, [isPlaying, mediaInfo.title, notchMode, triggerEventPeek]);

	// Leave a panel that has just been turned off in Settings.
	useEffect(() => {
		const panel = asNotchPanel(bloomMode);
		if (panel && !panelAvailable(panel)) {
			setBloomMode(isOpen ? openingPanel() : collapsedMode);
		}
	}, [
		settingsCalendarEnabled,
		settingsControlsPanelEnabled,
		settingsDevicesPanelEnabled,
		clipboardInNotch,
		bloomMode,
		isOpen
	]);

	// Leave the music view when music is turned off or the player ends its media
	// session: an open notch falls back to the remembered panel.
	useEffect(() => {
		if (bloomMode === "music" && !(settingsMusicModeEnabled && (mediaInfo.has_media || isOpen))) {
			setBloomMode(isOpen ? openingPanel() : collapsedMode);
		}
	}, [settingsMusicModeEnabled, mediaInfo.has_media, bloomMode, isOpen]);

	// A device connecting or disconnecting takes the pill for a few seconds,
	// like the Dynamic Island: its drawing, name and battery. It never takes
	// over a notch the user has open, an announcement or the shelf. In peek
	// and smart modes it shows the notch for as long as it lasts.
	//
	// Alerts for other devices wait their turn (two drives plugged in
	// together show one after the other); a newer alert for the device on
	// screen replaces it. The queue is short: a burst of devices shouldn't
	// hold the notch for long.
	const deviceAlertQueueRef = useRef<Omit<DeviceAlert, "runId">[]>([]);
	const presentDeviceAlertRef = useRef<(alert: Omit<DeviceAlert, "runId">) => void>(() => {});
	presentDeviceAlertRef.current = (alert) => {
		const duration = alert.connected ? DEVICE_ALERT_MS.connected : DEVICE_ALERT_MS.disconnected;
		setDeviceAlert({ ...alert, runId: Date.now() });
		setDeviceAlertOnScreen(true);
		setBloomMode("device");
		if (notchMode === "peek") triggerEventPeek(duration);
		if (deviceAlertTimerRef.current) clearTimeout(deviceAlertTimerRef.current);
		deviceAlertTimerRef.current = setTimeout(() => {
			const next = deviceAlertQueueRef.current.shift();
			if (next && !isOpenRef.current) presentDeviceAlertRef.current(next);
			else {
				deviceAlertQueueRef.current = [];
				setDeviceAlert(null);
			}
		}, duration);
	};
	const showDeviceAlert = useCallback((alert: Omit<DeviceAlert, "runId">) => {
		const mode = bloomModeRef.current;
		if (isOpenRef.current || mode === "announcement" || mode === "shelf") return;
		const current = deviceAlertRef.current;
		if (current && current.id !== alert.id) {
			const queue = deviceAlertQueueRef.current.filter((queued) => queued.id !== alert.id);
			deviceAlertQueueRef.current = [...queue, alert].slice(-DEVICE_ALERT_QUEUE);
			return;
		}
		presentDeviceAlertRef.current(alert);
	}, []);

	useEffect(() => {
		if (windowLabel !== "main") return;
		const unlistenConnection = listen<BluetoothConnection>("bluetooth-connection", ({ payload }) => {
			showDeviceAlert({
				id: payload.id,
				art: deviceLookFor(payload.name) ?? deviceArtFor(payload),
				name: payload.name,
				connected: payload.connected,
				battery: payload.battery
			});
			// A disconnected device's bud levels are out of date by its next connect.
			if (!payload.connected) {
				setBudsById((all) => {
					if (!(payload.id in all)) return all;
					const { [payload.id]: _gone, ...rest } = all;
					return rest;
				});
			}
		});
		// Windows often reports a battery level a moment after the device
		// connects; fill it into the alert if that device is still showing.
		const unlistenBattery = listen<{ id: string; battery: number }>("bluetooth-battery", ({ payload }) => {
			setDeviceAlert((alert) =>
				alert && alert.id === payload.id && alert.connected ? { ...alert, battery: payload.battery } : alert
			);
		});
		// Earbuds that report each bud's and the case's level send them a
		// moment after connecting.
		const unlistenBuds = listen<BudsBattery & { id: string }>("bluetooth-buds", ({ payload }) => {
			const { id, ...buds } = payload;
			setDeviceAlert((alert) => (alert && alert.id === id && alert.connected ? { ...alert, buds } : alert));
			setBudsById((all) => ({ ...all, [id]: buds }));
		});
		// USB devices, and what's plugged into the 3.5 mm jack. A wired audio
		// device's drawing can be picked in Connected devices.
		const showWired = ({ payload }: { payload: UsbConnection }) => {
			const name = usbDisplayName(payload);
			showDeviceAlert({
				id: payload.id,
				art: (isWiredAudio(payload.class) ? deviceLookFor(name) : null) ?? usbArtFor(payload),
				name,
				connected: payload.connected,
				battery: null,
				usb: true,
				disk: payload.class === "disk"
			});
		};
		const unlistenUsb = listen<UsbConnection>("usb-connection", showWired);
		const unlistenJack = listen<UsbConnection>("wired-audio-connection", showWired);
		return () => {
			unlistenConnection.then((f) => f());
			unlistenBattery.then((f) => f());
			unlistenUsb.then((f) => f());
			unlistenJack.then((f) => f());
			unlistenBuds.then((f) => f());
		};
	}, [windowLabel, showDeviceAlert]);

	// In a dev build, any drawing can be shown from the console, e.g.
	// __bloomDeviceAlert("stem-buds", "AirPods Pro", true, 82), and a late
	// battery report sent with __bloomDeviceBattery("dev", 64).
	useEffect(() => {
		if (!import.meta.env.DEV) return;
		const w = window as unknown as Record<string, unknown>;
		w.__bloomDeviceAlert = (art: DeviceArtKey, name: string, connected = true, battery: number | null = null) =>
			showDeviceAlert({ id: "dev", art, name, connected, battery });
		// __bloomUsb("disk", "SanDisk Cruzer Blade USB Device", true, "a")
		// stands in for the backend's usb-connection event.
		w.__bloomUsb = (kind: string, name: string, connected = true, id = "usb-dev") =>
			showDeviceAlert({
				id,
				art: usbArtFor({ class: kind, name }),
				name: usbDisplayName({ class: kind, name }),
				connected,
				battery: null,
				usb: true
			});
		// __bloomDeviceBuds("dev", [90, false], [80, true], [40, false]) stands
		// in for bluetooth-buds; pass null for a part with no reading.
		const part = (p: [number, boolean] | null) => (p ? { level: p[0], charging: p[1] } : null);
		w.__bloomDeviceBuds = (
			id: string,
			left: [number, boolean] | null,
			right: [number, boolean] | null,
			caseLevel: [number, boolean] | null
		) =>
			setDeviceAlert((alert) =>
				alert && alert.id === id && alert.connected
					? { ...alert, buds: { left: part(left), right: part(right), case: part(caseLevel) } }
					: alert
			);
		w.__bloomDeviceBattery = (id: string, battery: number) =>
			setDeviceAlert((alert) => (alert && alert.id === id && alert.connected ? { ...alert, battery } : alert));
	}, [showDeviceAlert]);

	// The clock row normally returns when the alert's exit animation ends.
	// If the alert never rendered (the notch was still starting up), there's
	// no exit to wait for, so bring it back shortly after the alert ends.
	useEffect(() => {
		if (deviceAlert) return;
		const timer = setTimeout(() => setDeviceAlertOnScreen(false), 400);
		return () => clearTimeout(timer);
	}, [deviceAlert]);

	// Back to the resting view once the alert is over.
	useEffect(() => {
		if (bloomMode === "device" && !deviceAlert) {
			setBloomMode(isOpenRef.current ? openingPanel() : collapsedMode);
		}
		// openingPanel only reads settings state already in this render.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [bloomMode, deviceAlert, collapsedMode]);

	// The collapsed notch always shows its current live activity: music while a
	// session exists, the timer (with music in its bubble) once one is set, and
	// the clock otherwise. An open notch is left alone.
	useEffect(() => {
		if (isOpen || announcementOpenRef.current) return;
		if ((bloomMode === "status" || bloomMode === "music") && bloomMode !== collapsedMode) {
			setBloomMode(collapsedMode);
		}
	}, [collapsedMode, bloomMode, isOpen]);

	// Update time
	useEffect(() => {
		const updateTime = () => {
			const now = new Date();
			setTime(
				now.toLocaleTimeString([], {
					hour: "2-digit",
					minute: "2-digit",
					hour12: !timeFormat24h
				})
			);
		};

		updateTime();
		const interval = setInterval(updateTime, 1000);

		return () => {
			clearInterval(interval);
		};
	}, [timeFormat24h]);

	// Battery API
	useEffect(() => {
		let battery: any = null;

		const initBattery = async () => {
			try {
				battery = await (navigator as any).getBattery();

				const updateBattery = () => {
					setBatteryLevel(Math.round(battery.level * 100));
					setIsCharging(battery.charging);
				};

				updateBattery();

				battery.addEventListener("levelchange", updateBattery);
				battery.addEventListener("chargingchange", updateBattery);

				return () => {
					battery.removeEventListener("levelchange", updateBattery);
					battery.removeEventListener("chargingchange", updateBattery);
				};
			} catch (e) {
				// Battery API not supported
			}
		};

		initBattery();
	}, []);

	// Listen for Volume Changes
	useEffect(() => {
		const unlisten = listen<{ volume: number; is_muted: boolean }>("volume-change", (event) => {
			setVolume(event.payload.volume);
			setIsMuted(event.payload.is_muted);
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// Wi-Fi is a three-state control: Off, on-but-not-connected, Connected.
	// The radio state alone can't tell those apart, so get_wifi_status returns
	// both flags, plus the connected network's name. Returns false so the startup loader knows to retry.
	const refreshWifiStatus = useCallback(async (): Promise<boolean> => {
		try {
			setWifiStatus(await invoke<WifiStatus>("get_wifi_status"));
			return true;
		} catch {
			return false;
		}
	}, []);

	// Seed the Wi-Fi pill at startup. The first call can fail while the WLAN
	// service is still coming up, so retry instead of leaving the pill stuck on
	// its default.
	useEffect(() => {
		let cancelled = false;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;
		const initializeWifiStatus = async (attempt: number) => {
			const loaded = await refreshWifiStatus();
			if (!loaded && !cancelled && attempt < 3) {
				retryTimer = setTimeout(() => void initializeWifiStatus(attempt + 1), (attempt + 1) * 1000);
			}
		};
		void initializeWifiStatus(0);
		return () => {
			cancelled = true;
			if (retryTimer) clearTimeout(retryTimer);
		};
	}, [refreshWifiStatus]);

	// Connected Bluetooth devices for the tile, refreshed whenever the backend
	// reports a device connecting, disconnecting, pairing or being removed.
	useEffect(() => {
		if (!bluetoothEnabled) {
			setBtConnectedNames([]);
			return;
		}
		const refresh = () =>
			invoke<{ name: string; connected: boolean }[]>("bluetooth_list_devices")
				.then((devices) =>
					setBtConnectedNames(devices.filter((d) => d.connected).map((d) => d.name))
				)
				.catch(() => {});
		let debounce: ReturnType<typeof setTimeout> | undefined;
		void refresh();
		const unlisten = listen("bluetooth-changed", () => {
			clearTimeout(debounce);
			debounce = setTimeout(() => void refresh(), 400);
		});
		return () => {
			clearTimeout(debounce);
			unlisten.then((f) => f());
		};
	}, [bluetoothEnabled]);

	// The backend reports connection changes and finished scans as they
	// happen, so the pill follows without waiting for the next poll.
	useEffect(() => {
		let debounce: ReturnType<typeof setTimeout> | undefined;
		const unlisten = listen("wifi-changed", () => {
			clearTimeout(debounce);
			debounce = setTimeout(() => void refreshWifiStatus(), 300);
		});
		return () => {
			clearTimeout(debounce);
			unlisten.then((f) => f());
		};
	}, [refreshWifiStatus]);

	// Load bluetooth/volume/brightness state on mount
	useEffect(() => {
		invoke<boolean>("get_bluetooth_state")
			.then(setBluetoothEnabled)
			.catch(() => {});
		invoke<boolean>("get_battery_saver_state")
			.then(setBatterySaverEnabled)
			.catch(() => {});
		invoke<{ volume: number; is_muted: boolean }>("get_volume_state")
			.then((state) => {
				setVolume(state.volume);
				setIsMuted(state.is_muted);
			})
			.catch(() => {});
		invoke<number>("get_brightness")
			.then(setCurrentBrightness)
			.catch(() => {});

		// Poll battery saver state every 5s (since we can't listen for changes)
		const interval = setInterval(() => {
			invoke<boolean>("get_battery_saver_state")
				.then(setBatterySaverEnabled)
				.catch(() => {});
		}, 5000);
		return () => clearInterval(interval);
	}, []);

	// Refresh Wi-Fi status while the command center is open so changes made
	// outside Bloom (keyboard toggle, Windows quick settings) show up.
	useEffect(() => {
		if (bloomMode !== "command-center") return;
		void refreshWifiStatus();
		const interval = setInterval(() => void refreshWifiStatus(), 5000);
		return () => clearInterval(interval);
	}, [bloomMode, refreshWifiStatus]);

	// Poll system metrics for status widgets
	useEffect(() => {
		const fetchMetrics = () => {
			invoke<number>("get_cpu_usage")
				.then(setCpuUsage)
				.catch((e) => console.warn("CPU:", e));
			invoke<number>("get_ram_usage")
				.then(setRamUsage)
				.catch((e) => console.warn("RAM:", e));
			invoke<number>("get_disk_space")
				.then(setDiskSpace)
				.catch((e) => console.warn("Disk:", e));
			invoke<[number, number]>("get_network_speed")
				.then(([up, down]) => {
					setNetUpSpeed(up);
					setNetDownSpeed(down);
				})
				.catch(() => {});
		};
		fetchMetrics();
		const interval = setInterval(fetchMetrics, 3000);
		return () => clearInterval(interval);
	}, []);

	// Listen for brightness changes
	useEffect(() => {
		const unlisten = listen<{ brightness: number }>("brightness-change", (event) => {
			setCurrentBrightness(event.payload.brightness);
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// Native Windows Media Controls - Listen for updates from background worker
	useEffect(() => {
		const unlisten = listen<MediaInfo>("media-update", (event) => {
			const info = event.payload;
			if (!info) return;

			setMediaInfo((prev) => {
				// Find if artwork changed by checking the first element
				const prevArt = prev.artwork?.[0];
				const nextArt = info.artwork?.[0];
				const artChanged = prevArt !== nextArt;

				if (
					prev.title === info.title &&
					prev.artist === info.artist &&
					prev.is_playing === info.is_playing &&
					prev.has_media === info.has_media &&
					!artChanged &&
					prev.position_ms === info.position_ms &&
					prev.duration_ms === info.duration_ms
				) {
					return prev;
				}

				// Update playing state separately for the hook triggers
				setIsPlaying(info.is_playing);

				if (info.artwork && info.artwork.length > 0) {
					const newArt = info.artwork[0];
					setAlbumArtUrl((prev) => {
						if (prev !== newArt) {
							setAlbumArtKey((k) => k + 1);
							return newArt;
						}
						return prev;
					});
				} else {
					setAlbumArtUrl(null);
				}

				return info;
			});
		});

		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	// Media controls via Tauri commands
	/* Unused saveAndBroadcast removed to fix TS build error */
	const togglePlayPause = useCallback(async () => {
		try {
			await invoke("media_play_pause");
			setIsPlaying(!isPlaying);
		} catch (e) {
			console.error("Failed to toggle play/pause:", e);
		}
	}, [isPlaying]);

	const skipNext = useCallback(async () => {
		try {
			await invoke("media_next");
		} catch (e) {
			console.error("Failed to skip next:", e);
		}
	}, []);

	const skipPrevious = useCallback(async () => {
		try {
			await invoke("media_previous");
		} catch (e) {
			console.error("Failed to skip previous:", e);
		}
	}, []);

	// Slide-push animation for prev/next buttons
	const prevFront = useAnimation();
	const prevBack = useAnimation();
	const nextFront = useAnimation();
	const nextBack = useAnimation();

	const animatePrev = useCallback(async () => {
		prevFront.set({ x: 0 });
		prevBack.set({ x: 30 });
		prevFront.start({ x: -30, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } });
		await prevBack.start({ x: 0, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } });
		skipPrevious();
	}, [skipPrevious, prevFront, prevBack]);

	const animateNext = useCallback(async () => {
		nextFront.set({ x: 0 });
		nextBack.set({ x: -30 });
		nextFront.start({ x: 30, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } });
		await nextBack.start({ x: 0, transition: { duration: 0.18, ease: [0.4, 0, 0.2, 1] } });
		skipNext();
	}, [skipNext, nextFront, nextBack]);

	const sendVolume = useTrailingThrottle((newVol: number) => {
		invoke("set_volume", { volume: newVol }).catch(() => {});
	}, 50);

	const handleVolumeChange = useCallback(
		(newVol: number) => {
			setVolume(newVol);
			// set_volume unmutes for any non-zero level.
			setIsMuted(newVol === 0);
			sendVolume(newVol);
		},
		[sendVolume]
	);

	// WiFi toggle
	const toggleWifi = useCallback(async () => {
		const previous = wifiStatus;
		const newState = !(previous?.enabled ?? false);
		setWifiStatus({
			enabled: newState,
			connected: newState ? (previous?.connected ?? false) : false,
			ssid: newState ? (previous?.ssid ?? null) : null
		});
		try {
			await invoke("set_wifi_state", { enabled: newState });
			// The radio and association take a moment to settle.
			setTimeout(() => void refreshWifiStatus(), 800);
		} catch (e) {
			setWifiStatus(previous);
			console.error("Failed to toggle WiFi:", e);
		}
	}, [wifiStatus, refreshWifiStatus]);

	// Bluetooth toggle
	const toggleBluetooth = useCallback(async () => {
		const newState = !bluetoothEnabled;
		setBluetoothEnabled(newState);
		try {
			await invoke("set_bluetooth_state", { enabled: newState });
		} catch (e) {
			setBluetoothEnabled(!newState);
			console.error("Failed to toggle Bluetooth:", e);
		}
	}, [bluetoothEnabled]);

	// The notch never takes focus, and native `title` tooltips only show for an
	// active window, so the status widgets draw their own. A tooltip opens
	// after a tooltip-like delay, by which time the battery details fetched on
	// enter are in. Under the status strip it hangs below the pill; once the
	// notch is open the pill is the tall panel, so it sits beside the pill on
	// the widget's side instead, level with the widget.
	const showStatusTooltip = useCallback(
		(id: string, widget: HTMLElement) => {
			if (statusTooltipTimerRef.current) clearTimeout(statusTooltipTimerRef.current);
			statusTooltipTimerRef.current = setTimeout(() => {
				const pill = bloomRef.current?.getBoundingClientRect();
				const own = widget.getBoundingClientRect();
				// Client rects are zoomed by the notch scale; offsets are not.
				if (!pill) {
					setStatusTooltip({ id, side: "below", offset: 8 });
				} else if (!isOpen) {
					const gap = (pill.bottom - own.bottom) / scale;
					setStatusTooltip({ id, side: "below", offset: Math.max(0, gap) + 8 });
				} else if (own.left + own.width / 2 >= pill.left + pill.width / 2) {
					const gap = (pill.right - own.right) / scale;
					setStatusTooltip({ id, side: "right", offset: Math.max(0, gap) + 10 });
				} else {
					const gap = (own.left - pill.left) / scale;
					setStatusTooltip({ id, side: "left", offset: Math.max(0, gap) + 10 });
				}
			}, 400);
		},
		[scale, isOpen]
	);

	const hideStatusTooltip = useCallback(() => {
		if (statusTooltipTimerRef.current) clearTimeout(statusTooltipTimerRef.current);
		statusTooltipTimerRef.current = null;
		setStatusTooltip(null);
	}, []);

	// Widgets unmount when the notch collapses, without a mouse leave, and an
	// open card is placed for the notch's shape when it opened.
	useEffect(() => {
		hideStatusTooltip();
	}, [isHovered, isOpen, hideStatusTooltip]);

	// Both sides of the status strip get equal width around the centered
	// clock, so the notch must fit the clock plus twice the wider side. Widget
	// widths vary (network speed especially), so they are measured rather than
	// counted. The width only grows during a hover, so a live label getting
	// shorter doesn't make the notch jitter. Layout widths are unaffected by
	// the notch scale.
	useLayoutEffect(() => {
		if (!isHovered || bloomMode !== "status") {
			if (statusFitWidth !== 0) setStatusFitWidth(0);
			return;
		}
		// offsetWidth, not scrollWidth: an open tooltip card overflows its
		// widget and must not widen the notch.
		// offsetWidth leaves out the groups' own size zoom.
		const side = Math.max(
			(leftWidgetsRef.current?.offsetWidth ?? 0) * leftSize,
			(rightWidgetsRef.current?.offsetWidth ?? 0) * rightSize
		);
		const clock = timeCenterRef.current?.offsetWidth ?? 0;
		// The pill's 12px padding on each side, and a 10px gap to the clock.
		const needed = Math.ceil(clock + 2 * (side + 10) + 24);
		if (side > 0 && needed > statusFitWidth) setStatusFitWidth(needed);
	});

	const refreshBatteryDetails = useCallback(() => {
		invoke<BatteryDetails>("get_battery_details")
			.then(setBatteryDetails)
			.catch((err) => console.error("Failed to read battery details:", err));
	}, []);

	// Battery Saver - opens settings (no public API to toggle without admin)
	const openBatterySaverSettings = useCallback(async () => {
		try {
			await invoke("open_battery_saver_settings");
		} catch (e) {
			console.error("Failed to open Battery Saver settings:", e);
		}
	}, []);

	// Brightness change with throttling
	const sendBrightness = useTrailingThrottle((newVal: number) => {
		invoke("set_brightness", { brightness: newVal }).catch(() => {});
	}, 50);

	const handleBrightnessChange = useCallback(
		(newVal: number) => {
			setCurrentBrightness(newVal);
			sendBrightness(newVal);
		},
		[sendBrightness]
	);

	// Open system tray (unhide taskbar and invoke Win+B)
	const openSystemTray = useCallback(async (e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await invoke("open_system_tray");
		} catch (e) {
			console.error("Failed to open system tray:", e);
		}
	}, []);

	const openSettingsWindow = useCallback(async () => {
		try {
			await invoke("open_settings_window");
		} catch (e) {
			console.error("Failed to open settings window:", e);
		}
	}, []);

	const toggleDockModeSetting = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();
			const nextMode = dockMode === "fixed" ? "smart" : dockMode === "smart" ? "peek" : "fixed";
			setDockMode(nextMode);
			localStorage.setItem("bloom-dock-mode", nextMode);
			invoke("save_setting", { key: "bloom-dock-mode", value: nextMode }).catch(console.error);
			try {
				await invoke("change_dock_mode", { mode: nextMode });
			} catch (err) {
				console.error("Failed to change dock mode:", err);
			}
		},
		[dockMode]
	);

	const toggleNotchModeSetting = useCallback(
		async (e: React.MouseEvent) => {
			e.stopPropagation();
			const nextMode = notchMode === "fixed" ? "smart" : notchMode === "smart" ? "peek" : "fixed";
			setNotchMode(nextMode);
			localStorage.setItem("bloom-notch-mode", nextMode);
			invoke("save_setting", { key: "bloom-notch-mode", value: nextMode }).catch(console.error);
			try {
				await invoke("change_notch_mode", { mode: nextMode });
			} catch (err) {
				console.error("Failed to change notch mode:", err);
			}
		},
		[notchMode]
	);

	const toggleCalendarMode = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (isTimerFinished) {
			resetTimer();
			return;
		}
		// The time is part of the notch: a click opens it like anywhere else.
		// Once open, it is a shortcut to the calendar.
		if (!isOpen) openFromRestRef.current();
	};

	// Where a status tooltip card sits and how it slides in, by placement.
	const statusTooltipMotion = (side: "below" | "left" | "right", offset: number) => {
		if (side === "below") {
			return {
				style: { top: `calc(100% + ${offset}px)`, left: "50%" },
				hidden: { opacity: 0, x: "-50%", y: -4 },
				shown: { opacity: 1, x: "-50%", y: 0 }
			};
		}
		// Top-aligned with the widget rather than centered on it: the widgets
		// sit near the top of the screen, which would cut a centered card off.
		const nudge = side === "right" ? -4 : 4;
		return {
			style: { top: -8, [side === "right" ? "left" : "right"]: `calc(100% + ${offset}px)` },
			hidden: { opacity: 0, x: nudge, y: 0 },
			shown: { opacity: 1, x: 0, y: 0 }
		};
	};

	// A status widget with its tooltip card, which hangs outside the pill.
	const statusWidget = (
		id: string,
		tooltip: string,
		content: React.ReactNode,
		onEnter?: () => void
	) => (
		<div
			className="passive-feature"
			key={id}
			onMouseEnter={(e) => {
				onEnter?.();
				showStatusTooltip(id, e.currentTarget);
			}}
			onMouseLeave={hideStatusTooltip}
		>
			{content}
			<AnimatePresence>
				{statusTooltip?.id === id &&
					(() => {
						const placed = statusTooltipMotion(statusTooltip.side, statusTooltip.offset);
						return (
							<motion.div
								className="status-tooltip"
								style={placed.style}
								initial={placed.hidden}
								animate={placed.shown}
								exit={placed.hidden}
								transition={{ duration: 0.15 }}
							>
								{tooltip}
							</motion.div>
						);
					})()}
			</AnimatePresence>
		</div>
	);

	// Render a status widget by ID
	const renderStatusWidget = (id: string) => {
		switch (id) {
			case "weather":
				if (!settingsWeatherEnabled || temperature === null) return null;
				return statusWidget(
					"weather",
					cityName ? `${weatherCondition} — ${cityName}` : weatherCondition,
					<>
						<WeatherIcon size={12} strokeWidth={2.2} />
						<span className="label">
							{temperature}°{tempUnit === "fahrenheit" ? "F" : "C"}
						</span>
					</>
				);
			case "battery":
				return statusWidget(
					"battery",
					batteryTooltip(
						batteryDetails,
						{ level: batteryLevel, charging: isCharging },
						batterySaverEnabled
					),
					<>
						<BatteryIcon
							charging={isCharging}
							level={batteryLevel}
							threshold={lowBatteryThreshold}
						/>
						<span className="label">{batteryLevel}%</span>
					</>,
					refreshBatteryDetails
				);
			case "cpu":
				return statusWidget(
					"cpu",
					"CPU Usage",
					<>
						<Cpu size={12} strokeWidth={2} />
						<span className="label">{cpuUsage}%</span>
					</>
				);
			case "ram":
				return statusWidget(
					"ram",
					"RAM Usage",
					<>
						<MemoryStick size={12} strokeWidth={2} />
						<span className="label">{Math.round(ramUsage)}%</span>
					</>
				);
			case "disk":
				return statusWidget(
					"disk",
					"Free Disk Space",
					<>
						<HardDrive size={12} strokeWidth={2} />
						<span className="label">{diskSpace}GB</span>
					</>
				);
			case "net":
				return statusWidget(
					"net",
					"Network Speed",
					<>
						<ArrowUpDown size={12} strokeWidth={2} />
						<span className="label">
							↑{formatBytes(netUpSpeed)} ↓{formatBytes(netDownSpeed)}
						</span>
					</>
				);
			default:
				return null;
		}
	};

	const formatBytes = (bytes: number) => {
		if (bytes < 1024) return `${bytes}B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
		return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
	};

	// Music mode shows any time we have media info (playing or paused) and music mode setting is enabled
	const isMusicMode = mediaInfo.has_media && bloomMode === "music" && settingsMusicModeEnabled;

	// Each panel has its own size (Settings > Notch > Panel Sizes). While one
	// is showing, the whole notch is zoomed by it, so the panel's layout scales
	// as a unit and the other panels keep their sizes.
	const sizedPanel: SizedPanel | null =
		bloomMode === "calendar" || bloomMode === "devices" || bloomMode === "shelf" || bloomMode === "clipboard"
			? bloomMode
			: bloomMode === "command-center" || bloomMode === "wifi" || bloomMode === "bluetooth"
				? "command-center"
				: isMusicMode && isOpen
					? "music"
					: null;
	const panelZoomNow = sizedPanel && isExpanded && isVisible && !isHidden ? panelZoom(sizedPanel) : 1;
	const pillZoom = scale * panelZoomNow * (isOpen ? openScale : 1);
	// The floating pill style sits 6px below the edge (see pillTargetY).
	const pillGap = notchStyle === "pill" ? 6 : 0;

	// Fixed mode only: 10 s after the notch was last used (closed, not
	// hovered, nothing happening), it fades to 40% so it sits back; any use
	// brings it back at once.
	const [idleFaded, setIdleFaded] = useState(false);
	useEffect(() => {
		setIdleFaded(false);
		if (notchMode !== "fixed" || isOpen || isHovered || fileStatus || isDragHovering) return;
		const t = setTimeout(() => setIdleFaded(true), 10000);
		return () => clearTimeout(t);
	}, [notchMode, isOpen, isHovered, fileStatus, isDragHovering, bloomMode]);

	// Notch style (Settings > Notch > Style). "pill" floats below the edge
	// with no flares; "minimal" shrinks the idle notch to a thin bar that shows
	// its content again on hover or when a live activity or alert appears.
	const attachedToEdge = isImpacted && notchStyle !== "pill";
	const minimalIdle =
		notchStyle === "minimal" &&
		bloomMode === "status" &&
		!isHovered &&
		!isOpen &&
		!isMusicMode &&
		!showPowerPulse &&
		!showLowBatteryPulse &&
		!showUpdatePulse &&
		!showCopyPulse &&
		!fileStatus;
	// A media session remains reachable on hover after its activity fades, or
	// whenever the compact music display is disabled.
	const showMusicOnStatusHover =
		!isOpen && isHovered && bloomMode === "status" && settingsMusicModeEnabled &&
		mediaInfo.has_media && (!musicActivityVisible || !settingsMusicCompactNotch);
	const showCompactMusicIcons = isMusicMode || showMusicOnStatusHover;

	// Battery saver: on battery ("battery"), or on battery at or below the
	// threshold ("below", default 30 %); "off" never.
	const saverOn =
		!isCharging && (saverMode === "battery" || (saverMode === "below" && batteryLevel <= saverThreshold));
	const visualizerOn = settingsVisualizerEnabled && !(saverOn && saverPauses.visualizer);
	visualizerWantedRef.current = visualizerOn && settingsMusicModeEnabled;

	// The open notch's tab bar: every enabled panel in the user's order, then
	// Media while something is playing. Shown on the panels (the music view
	// keeps its own layout).
	const tabTools: Tool[] = orderTabs(
		[
			...panelOrder.filter(panelAvailable).map((p) => TOOLS[p]),
			...enabledTools.map((id) => EXTRA_BY_ID[id]),
			// Media keeps its tab while nothing plays ("Nothing's playing").
			...(settingsMusicModeEnabled ? [TOOLS.music] : [])
		],
		tabOrder
	).slice(0, MAX_TABS);
	const toolShowing = bloomMode === "tool" && activeTool !== null && enabledTools.includes(activeTool) ? activeTool : null;
	// The Wi-Fi / Bluetooth lists belong to the Command Center: its tab stays
	// active and the notch keeps its size.
	const quickList = bloomMode === "wifi" || bloomMode === "bluetooth";
	const activeTabId: string | null =
		toolShowing ??
		(quickList ? "command-center" : bloomMode === "music" && isOpen && settingsMusicModeEnabled ? "music" : asNotchPanel(bloomMode));
	const showTabBar = isOpen && activeTabId !== null && tabTools.length > 1;
	// Media as a tab: the player (or "Nothing's playing") sits under the tab bar.
	const mediaTab = showTabBar && activeTabId === "music";
	const playerHeight =
		mediaLayout === "compact"
			? ((mediaInfo.duration_ms ?? 0) > 0 ? 132 : 116) + (compactVolumeExpanded ? 36 : 0)
			: 120;
	// Which way the body slides: toward the picked tab (motion.ts).
	const tabIdx = activeTabId ? tabTools.findIndex((t) => t.id === activeTabId) : -1;
	if (activeTabId !== tabMotion.current.id) {
		const prev = tabMotion.current.idx;
		tabMotion.current = { id: activeTabId, idx: tabIdx, dir: prev < 0 || tabIdx < 0 ? 0 : Math.sign(tabIdx - prev) };
	}
	const tabDir = tabMotion.current.dir;
	openFromRestRef.current = () => {
		const id = openingTool({
			tabs: tabTools.map((t) => t.id),
			recent: quickReturnMin > 0 && Date.now() - lastClosedAtRef.current < quickReturnMin * 60_000,
			last: lastToolRef.current,
			favouriteOn,
			favourite
		});
		autoOpenedRef.current = false;
		if (!id) return openNotch(openingPanel());
		setIsOpen(true);
		selectTab(id);
	};
	// Every tool the user lands on while the notch is open is "last used".
	useEffect(() => {
		if (!isOpen) {
			autoOpenedRef.current = false;
			return;
		}
		if (!activeTabId || autoOpenedRef.current) return;
		lastToolRef.current = activeTabId;
		localStorage.setItem("bloom-notch-last-tool", activeTabId);
	}, [activeTabId, isOpen]);
	// A notch the Timer or a reminder opened closes itself after 15 s unless
	// the pointer comes to it, so it doesn't keep taking the number keys
	// (tab jumps, Calculator) from the app being typed in.
	useEffect(() => {
		if (!isOpen || isHovered || !autoOpenedRef.current) return;
		const t = window.setTimeout(() => autoOpenedRef.current && releaseNotchHover(), 15_000);
		return () => window.clearTimeout(t);
	}, [isOpen, isHovered]);
	// One step along the tab bar (wheel and arrows); false when there's no bar.
	stepTabRef.current = (direction: 1 | -1) => {
		if (tabTools.length < 2) return false;
		const i = Math.max(0, tabIdx);
		selectTab(tabTools[(i + direction + tabTools.length) % tabTools.length].id);
		return true;
	};
	const wasOpen = useRef(isOpen);
	const shellSpring =
		isOpen && !wasOpen.current
			? { type: "spring" as const, visualDuration: 0.45, bounce: 0.4 }
			: !isOpen
				? { type: "spring" as const, visualDuration: 0.3, bounce: 0.15 }
				: LIVELY;
	useEffect(() => {
		wasOpen.current = isOpen;
	});
	const selectTab = (id: string) => {
		autoOpenedRef.current = false;
		if (id === "music") openNotch("music");
		else if (id in EXTRA_BY_ID) {
			setActiveTool(id as ExtraToolId);
			setBloomMode("tool");
		} else setBloomMode(id as NotchPanel);
	};
	const tabBarSpace = showTabBar ? TAB_BAR_HEIGHT / panelZoomNow : 0;

	// Command Center tiles. Night light, Airplane mode, Mobile hotspot,
	// Nearby sharing and Live captions switch for real (system_tools.rs
	// cc_toggle); a switch that fails on this PC opens its Windows page
	// instead. Cast and Project open their pickers; Do not disturb, Energy
	// saver and Studio effects have no switch Windows lets an app use.
	const openSystem = (action: string) => () => {
		invoke("open_system_action", { action }).catch(console.error);
	};
	const ccSwitch = (tile: keyof CcSystemStates, fallback: string) => ({
		on: ccSystem[tile] === true,
		onClick: () => {
			invoke<boolean>("cc_toggle", { tile })
				.then((on) => setCcSystem((s) => ({ ...s, [tile]: on })))
				.catch((e) => {
					console.error(`${tile}:`, e);
					openSystem(fallback)();
				});
		}
	});
	const modeName = (m: string) => (m === "fixed" ? "Fixed" : m === "smart" ? "Smart" : "Peek");
	// Turn the radial menu off for a while (an app where Shift+drag means
	// something else); the same switch as Settings › Radial Menu.
	const toggleRadialMenu = () => {
		const next = !radialOn;
		setRadialOn(next);
		localStorage.setItem("bloom-files-enabled", String(next));
		invoke("save_setting", { key: "bloom-files-enabled", value: String(next) }).catch(console.error);
	};
	const ccState: Record<CcTileId, CcTileState> = {
		wifi: {
			on: wifiEnabled,
			status: wifiStatus === null ? "…" : !wifiEnabled ? "Off" : wifiConnected ? (wifiStatus?.ssid ?? "Connected") : "Not connected",
			onClick: () => toggleWifi(),
			onMore: () => setBloomMode("wifi")
		},
		bluetooth: {
			on: bluetoothEnabled,
			status: !bluetoothEnabled
				? "Off"
				: btConnectedNames.length === 1
					? btConnectedNames[0]
					: btConnectedNames.length > 1
						? `${btConnectedNames.length} connected`
						: "On",
			onClick: () => toggleBluetooth(),
			onMore: () => setBloomMode("bluetooth")
		},
		dnd: { hint: "opens Notifications", onClick: openSystem("notification-settings") },
		"night-light": ccSwitch("night-light", "night-light"),
		energy: {
			on: batterySaverEnabled,
			onClick: () => {
				invoke<boolean>("cc_toggle", { tile: "energy" })
					.then(setBatterySaverEnabled)
					.catch((e) => {
						console.error("energy:", e);
						openBatterySaverSettings();
					});
			}
		},
		airplane: ccSwitch("airplane", "airplane"),
		hotspot: ccSwitch("hotspot", "hotspot"),
		captions: ccSwitch("captions", "live-captions"),
		nearby: ccSwitch("nearby", "nearby-sharing"),
		cast: { hint: "pick a screen", onClick: openSystem("cast") },
		project: { hint: "pick a display mode", onClick: openSystem("project") },
		"dock-mode": { caption: modeName(dockMode), hidden: !dockEnabled, onClick: toggleDockModeSetting },
		"notch-mode": { caption: modeName(notchMode), onClick: toggleNotchModeSetting },
		"radial-menu": { on: radialOn, onClick: toggleRadialMenu },
		studio: { hint: "opens camera settings", onClick: openSystem("studio-effects") },
		accessibility: { onClick: openSystem("accessibility") },
		"task-manager": { onClick: openSystem("task-manager") },
		tray: { onClick: openSystemTray },
		notifications: { onClick: () => invoke("open_notification_center").catch(console.error) },
		"windows-settings": { onClick: openSystem("settings") },
		"lotus-settings": { onClick: () => openSettingsWindow() },
		restart: { onClick: () => invoke("restart_bloom").catch(console.error) }
	};

	// What each global shortcut does (src/shortcuts.ts lists them).
	runShortcutRef.current = (action: string) => {
		const openTab = (id: string | undefined) => {
			if (!id) return;
			setIsOpen(true);
			selectTab(id);
		};
		if (action === "notch") {
			if (isOpen) releaseNotchHover();
			else openFromShortcutRef.current();
		} else if (action.startsWith("tool-end-")) {
			// Shift+N: the Nth tab from the end.
			openTab(tabTools[tabTools.length - Number(action.slice(9))]?.id);
		} else if (action.startsWith("tool-")) {
			openTab(tabTools[Number(action.slice(5)) - 1]?.id);
		} else if (action.startsWith("tool:")) {
			const id = action.slice(5);
			if (tabTools.some((t) => t.id === id)) openTab(id);
		} else if (action.startsWith("tile:")) {
			const tile = ccState[action.slice(5) as CcTileId];
			tile?.onClick({ stopPropagation() {}, preventDefault() {} } as React.MouseEvent);
		} else if (action === "snip") {
			invoke("screen_clip", { mode: "snip" }).catch(console.error);
		} else if (action === "ocr") {
			// One step: snip, read, copy; the result opens Capture › OCR.
			invoke("ocr_snip").catch(console.error);
		} else if (action === "picker") {
			invoke<string | null>("pick_screen_color")
				.then((hex) => {
					if (hex) writeText(hex).catch(() => {});
				})
				.catch(console.error);
		} else if (action === "mic") {
			invoke<boolean | null>("mic_muted")
				.then((muted) => invoke("set_mic_muted", { muted: !muted }))
				.catch(console.error);
		}
	};

	// The 24-hour clock is ~16px narrower than the 12-hour one.
	const clock24hTrim = timeFormat24h ? 16 : 0;

	// Calculate width dynamically based on enabled features
	// With the tab bar showing, every tool gets one width so the clock and the
	// tab bar never move when switching; only the height changes.
	const getDynamicWidth = () => (showTabBar ? OPEN_WIDTH / panelZoomNow : getBaseWidth());
	const getBaseWidth = () => {
		if (toolShowing && isOpen) return OPEN_WIDTH;
		if (minimalIdle) return 72;
		if (fileStatus && !isOpen) return 300;
		if (showGlance && glance) return 300;
		if (bloomMode === "announcement" && announcement && !announcementDismissed) return 380;
		if (bloomMode === "device" && deviceAlert) return 330;
		if (isCalendarMode) return 480;
		// The Shelf and the file shelf keep the one open width like every
		// other page (they used to be narrower, so the notch jumped).
		if (bloomMode === "shelf" || bloomMode === "clipboard") return OPEN_WIDTH / panelZoomNow;
		if (bloomMode === "command-center" && isOpen) return 400;
		if (bloomMode === "wifi" || bloomMode === "bluetooth" || bloomMode === "devices") return 350;
		if (showMusicOnStatusHover) {
			return 170 + (visualizerOn ? 30 : 0);
		}
		if (bloomMode === "status" && isHovered) {
			const totalWidgets = statusWidgets.left.length + statusWidgets.right.length;
			return Math.max(Math.min(200 + totalWidgets * 50, 380) - clock24hTrim, statusFitWidth);
		}
		if (isMusicMode && isOpen) return mediaLayout === "compact" ? 300 : 340;
		if ((showPowerPulse || showLowBatteryPulse || showUpdatePulse || showCopyPulse) && !isHovered) return 200;

		let w = 140 - clock24hTrim;
		if (isMusicMode) {
			if (visualizerOn && isPlaying) w += 30;
			if (settingsAlbumArtEnabled) w += 30;
		}

		return w;
	};

	const getDynamicHeight = () => getBaseHeight() + tabBarSpace;
	const getBaseHeight = () => {
		if (!isExpanded || !isVisible || isHidden) {
			return isImpacted ? 28.9 : 44.2;
		}
		// An extra tool: the clock row plus the tool's height from the grid.
		if (toolShowing && isOpen)
			return 36 + GRID_H[EXTRA_BY_ID[toolShowing].size[1]] + (EXTRA_BY_ID[toolShowing].parts.length > 1 ? SEGMENT_BAR_HEIGHT : 0);
		if (mediaTab) return 36 + (mediaInfo.has_media ? playerHeight : 110);
		if (minimalIdle) return 8;
		// Announcement card: body is line-clamped, so a fixed size fits both cases.
		if (bloomMode === "announcement" && announcement && !announcementDismissed) {
			return announcement.url ? 168 : 148;
		}
		// Device alert: the drawing, with room for its motion.
		if (bloomMode === "device" && deviceAlert) return 76;
		// Sized to the calendar's week-row count plus the timer's fixed content.
		if (bloomMode === "calendar") return calendarMonthRows >= 6 ? 305 : 273;
		// Shelf expands on mode alone (no hover needed: there is no cursor
		// hover during an OS drag) and is sized to exactly one row of tiles,
		// plus room for the scrollbar once the tiles overflow it.
		if (bloomMode === "shelf") {
			if (shelfItems.length === 0) return 130;
			return shelfOverflowing ? 190 : 176;
		}
		if (bloomMode === "command-center") return isOpen ? 36 + ccBodyHeight(ccTiles) : 36;
		if (bloomMode === "devices") {
			return devicesPanelHeight;
		}
		// The Command Center's height: opening a list moves nothing.
		if (quickList) return isOpen ? 36 + ccBodyHeight(ccTiles) : 300;
		// The Shelf is tall, so more of the history fits (inside the notch
		// window, commands.rs: 600 × the notch's sizes).
		if (bloomMode === "clipboard") return 520;
		if (bloomMode === "status") return 36;
		if (isMusicMode && isOpen) {
			const hasProgressBar = (mediaInfo.duration_ms ?? 0) > 0;
			let h = mediaLayout === "compact" ? (hasProgressBar ? 132 : 116) : 120;
			if (mediaLayout === "compact") {
				if (compactVolumeExpanded) h += 36;
			}
			return h;
		}
		return 36;
	};

	const isCalendarMode = bloomMode === "calendar";
	// Arrows switch between the two tool panels; wheel/swipe can also open one
	// directly from the collapsed pill or a live activity.
	const showPanelArrows =
		isOpen && !showTabBar && asNotchPanel(bloomMode) !== null && panelOrder.filter(panelAvailable).length > 1;

	// What the notch is doing, for the local perf recorder of testing builds
	// (src-tauri/src/perf.rs); a no-op in normal builds.
	useEffect(() => {
		if (windowLabel !== "main") return;
		const notch = isOpen ? `open:${bloomMode}` : isHovered ? "peek" : "closed";
		invoke("perf_mark", { name: "notch", value: notch }).catch(() => {});
	}, [isOpen, isHovered, bloomMode]);
	useEffect(() => {
		if (windowLabel !== "main") return;
		invoke("perf_mark", { name: "music", value: isPlaying ? "playing" : "" }).catch(() => {});
	}, [isPlaying]);
	useEffect(() => {
		if (windowLabel === "main" && isReady) invoke("perf_mark", { name: "ready", value: "1" }).catch(() => {});
	}, [isReady]);

	// Close compact media player expansions when notch is unhovered or mode changes
	useEffect(() => {
		if (mediaLayout === "compact") {
			setCompactVolumeExpanded(false);
		}
	}, [isHovered, mediaLayout, bloomMode]);

	// The pill's target geometry: the animation springs toward it, and the
	// window region below is cut from it, so the region is already at the
	// final size while the pill animates.
	const pillTargetY = !isReady
		? 250
		: isVisible
			? isHidden
				? -100
				: notchStyle === "pill"
					? 6
					: 0
			: -150;
	const pillTargetWidth = !isReady
		? 34
		: isExpanded && isVisible && !isHidden
			? getDynamicWidth()
			: isImpacted
				? 39.1
				: 30.6;
	const pillTargetHeight = !isReady ? 34 : getDynamicHeight();
	// The notch's real outline, for the effects that run along it.
	const fxShape = { width: pillTargetWidth, height: pillTargetHeight, radius: minimalIdle ? 4 : isCalendarMode ? 28 : 18, flares: attachedToEdge };
	// Shadow and the edge flares beside the pill.
	pillTargetRef.current = notchPillBox(
		window.innerWidth,
		pillZoom,
		pillTargetY,
		pillTargetWidth,
		pillTargetHeight,
		24
	);

	// The Command Center's Windows switches, read each time it opens (they
	// can change in Windows Settings meanwhile).
	useEffect(() => {
		if (windowLabel !== "main" || !isOpen || bloomMode !== "command-center") return;
		invoke<CcSystemStates>("cc_states").then(setCcSystem).catch(() => {});
	}, [isOpen, bloomMode]);

	// Clip the notch window to what it draws (see window_region.rs): outside
	// these rectangles the window takes no clicks, whatever its click-through
	// state. Sent after every render, but only when the region changes.
	useEffect(() => {
		if (windowLabel === "main") updateNotchRegion();
	});

	// The music player (compact or classic): the whole notch while the tab
	// bar is hidden, otherwise the Media tab's body.
	const musicPlayer =
											mediaLayout === "compact" ? (
												<CompactMediaPlayer
													mediaInfo={mediaInfo}
													albumArtUrl={albumArtUrl}
													albumArtKey={albumArtKey}
													isPlaying={isPlaying}
													volume={displayVolume}
													volumeExpanded={compactVolumeExpanded}
													onVolumeExpandedChange={setCompactVolumeExpanded}
													onTogglePlayPause={togglePlayPause}
													onVolumeChange={handleVolumeChange}
													prevFront={prevFront}
													prevBack={prevBack}
													nextFront={nextFront}
													nextBack={nextBack}
													onAnimatePrev={animatePrev}
													onAnimateNext={animateNext}
													onLayoutChange={(layout) => {
														setMediaLayout(layout);
														localStorage.setItem("bloom-media-layout", layout);
														invoke("save_setting", {
															key: "bloom-media-layout",
															value: layout
														}).catch(console.error);
														window.dispatchEvent(
															new CustomEvent("settings-changed", {
																detail: { key: "media-layout", value: layout }
															})
														);
													}}
												/>
											) : (
												<div className="compact-premium-layout">
													<div className="album-art-section">
														<motion.div
															className="premium-album-art"
															whileHover={{ scale: 1.05 }}
															whileTap={{ scale: 0.95 }}
															onClick={(e) => {
																e.stopPropagation();
																setMediaLayout("compact");
																localStorage.setItem("bloom-media-layout", "compact");
																invoke("save_setting", {
																	key: "bloom-media-layout",
																	value: "compact"
																}).catch(console.error);
																window.dispatchEvent(
																	new CustomEvent("settings-changed", {
																		detail: { key: "media-layout", value: "compact" }
																	})
																);
															}}
															style={{ cursor: "pointer" }}
														>
															<AnimatePresence mode="wait" initial={false}>
																{albumArtUrl ? (
																	<motion.img
																		key={`art-${albumArtKey}`}
																		src={albumArtUrl}
																		alt="Art"
																		initial={{ rotateY: 90, opacity: 0 }}
																		animate={{ rotateY: 0, opacity: 1 }}
																		exit={{ rotateY: -90, opacity: 0 }}
																		transition={{ duration: 0.3, ease: "easeInOut" }}
																		style={{ width: "100%", height: "100%", objectFit: "cover" }}
																	/>
																) : (
																	<motion.div
																		key="placeholder"
																		className="art-placeholder-mini"
																		initial={{ rotateY: 90, opacity: 0 }}
																		animate={{ rotateY: 0, opacity: 1 }}
																		exit={{ rotateY: -90, opacity: 0 }}
																		transition={{ duration: 0.3, ease: "easeInOut" }}
																	>
																		<MusicNoteIcon size={32} className="music-placeholder-svg" />
																	</motion.div>
																)}
															</AnimatePresence>
														</motion.div>
													</div>

													<div className="metadata-controls-section-middle">
														<div className="track-header-row">
															<div className="track-info-middle">
																<TitleMarquee title={mediaInfo.title} />
																<span className="premium-artist">{mediaInfo.artist}</span>
															</div>
															<div className="header-visualizer-wrap">
																<div className="header-visualizer">
																	<Visualizer isPlaying={isPlaying} bars={5} height={18} />
																</div>
																<motion.button
																	className="classic-audio-output-btn"
																	onClick={(e) => {
																		e.stopPropagation();
																		invoke("open_sound_settings").catch(() => {});
																	}}
																	whileTap={{ scale: 0.9 }}
																	title="Audio Output"
																>
																	<HeadphonesIcon size={20} style={{ opacity: 0.5 }} />
																</motion.button>
															</div>
														</div>

														<div className="controls-row-sleek">
															<motion.button
																className="sleek-btn previous-btn"
																onClick={(e) => {
																	e.stopPropagation();
																	animatePrev();
																}}
																whileHover={{ scale: 1.2 }}
																whileTap={{ scale: 0.9 }}
																transition={{ type: "spring", stiffness: 400, damping: 25 }}
															>
																<div
																	style={{
																		position: "relative",
																		width: 32,
																		height: 16,
																		overflow: "hidden"
																	}}
																>
																	<motion.div
																		animate={prevBack}
																		style={{
																			position: "absolute",
																			inset: 0,
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "center"
																		}}
																	>
																		<SkipBackIcon size={32} />
																	</motion.div>
																	<motion.div
																		animate={prevFront}
																		style={{
																			position: "absolute",
																			inset: 0,
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "center"
																		}}
																	>
																		<SkipBackIcon size={32} />
																	</motion.div>
																</div>
															</motion.button>

															<motion.button
																className="sleek-btn play-pause-btn-floating"
																onClick={(e) => {
																	e.stopPropagation();
																	togglePlayPause();
																}}
																whileHover={{ scale: 1.2 }}
																whileTap={{ scale: 0.95 }}
																transition={{ type: "spring", stiffness: 400, damping: 25 }}
															>
																<AnimatePresence mode="wait" initial={false}>
																	<motion.div
																		key={isPlaying ? "pause" : "play"}
																		initial={{ opacity: 0, scale: 0.8 }}
																		animate={{ opacity: 1, scale: 1 }}
																		exit={{ opacity: 0, scale: 0.8 }}
																		transition={{ duration: 0.15 }}
																		style={{
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "center"
																		}}
																	>
																		{isPlaying ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
																	</motion.div>
																</AnimatePresence>
															</motion.button>

															<motion.button
																className="sleek-btn next-btn"
																onClick={(e) => {
																	e.stopPropagation();
																	animateNext();
																}}
																whileHover={{ scale: 1.2 }}
																whileTap={{ scale: 0.9 }}
																transition={{ type: "spring", stiffness: 400, damping: 25 }}
															>
																<div
																	style={{
																		position: "relative",
																		width: 32,
																		height: 16,
																		overflow: "hidden"
																	}}
																>
																	<motion.div
																		animate={nextBack}
																		style={{
																			position: "absolute",
																			inset: 0,
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "center"
																		}}
																	>
																		<SkipForwardIcon size={32} />
																	</motion.div>
																	<motion.div
																		animate={nextFront}
																		style={{
																			position: "absolute",
																			inset: 0,
																			display: "flex",
																			alignItems: "center",
																			justifyContent: "center"
																		}}
																	>
																		<SkipForwardIcon size={32} />
																	</motion.div>
																</div>
															</motion.button>
														</div>

														<div className="volume-slider-container">
															<VolumeLowIcon size={12} style={{ opacity: 0.5 }} />
															<div className="slider-track-premium">
																<input
																	type="range"
																	min="0"
																	max="1"
																	step="0.01"
																	value={displayVolume}
																	onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
																	onPointerDown={(e) => e.stopPropagation()}
																	onClick={(e) => e.stopPropagation()}
																	className="premium-slider"
																/>
																<div
																	className="slider-progress-fill"
																	style={{ width: `${displayVolume * 100}%` }}
																/>
															</div>
															<VolumeHighIcon size={14} style={{ opacity: 0.5 }} />
														</div>
													</div>
												</div>
											);

	return (
		<MotionConfig
			reducedMotion={(saverOn && saverPauses.motion) || motionPref === "off" ? "always" : "never"}
		>
		<div className={`screen${saverOn && saverPauses.glass ? " battery-saver" : ""}`} style={{ overflow: "hidden" }}>
			<div
				style={{
					zoom: pillZoom,
					width: "100%",
					display: "flex",
					justifyContent: "center",
					position: "relative",
					opacity: idleFaded ? 0.4 : 1,
					transition: `opacity ${idleFaded ? 800 : 150}ms ease`
				}}
			>
				<DeviceArtDefs />
				{windowLabel === "main" && <BloomTip root={bloomRef} />}
				<motion.div
					ref={bloomRef}
					className={`bloom ${isHovered ? "expanded" : ""} ${isImpacted ? "is-impacted" : ""} ${minimalIdle ? "minimal-idle" : ""} ${isDragHovering ? "drag-hover" : ""}`}
					onMouseEnter={() => setIsNotchHovered(true)}
					// Open: leaving is decided by the backend, which allows a grace
					// margin around the notch (services.rs OPEN_GRACE_PX).
					onMouseLeave={() => !isOpenRef.current && setIsNotchHovered(false)}
					onWheel={handleWheel}
					initial={{
						y: 250,
						width: 30.6,
						height: 44.2,
						borderTopLeftRadius: 18,
						borderTopRightRadius: 18,
						borderBottomLeftRadius: 18,
						borderBottomRightRadius: 18,
						scaleX: 1,
						scaleY: 1,
						opacity: 0
					}}
					animate={{
						y: pillTargetY,
						width: pillTargetWidth,
						height: pillTargetHeight,
						opacity: isVisible ? 1 : 0,
						scaleX: 1,
						scaleY: 1,
						borderTopLeftRadius: attachedToEdge ? 0 : 18,
						borderTopRightRadius: attachedToEdge ? 0 : 18,
						borderBottomLeftRadius: minimalIdle ? 4 : isCalendarMode ? 28 : 18,
						borderBottomRightRadius: minimalIdle ? 4 : isCalendarMode ? 28 : 18,
						filter: isVisible ? "blur(0px)" : "blur(8px)",
						pointerEvents: isVisible ? "auto" : "none"
					}}
					onClick={(e) => {
						e.stopPropagation();
						// "Riya copied: …": a click puts it on the clipboard.
						const clip = liveClipRef.current;
						if (clip) {
							liveClipRef.current = null;
							invoke("clipboard_copy", { id: clip })
								.then(() => window.dispatchEvent(new Event("share-live-copied")))
								.catch(() => {});
							return;
						}
						if (fileStatus) return;
						if (!isOpen) openFromRestRef.current();
					}}
					onHoverStart={() => {
						if (fileStatus) return;
						releaseDeferredRef.current = false;
						setIsHovered(true);
						// Hovering the shelf cancels its post-drop auto-close.
						if (bloomMode === "shelf") clearShelfCollapse();
					}}
					// Open: the backend closes it once the pointer is past the grace
					// margin (notch-pointer-left); closing here, on the pill's own
					// edge, made that margin do nothing.
					onHoverEnd={() => !isOpenRef.current && releaseNotchHover()}
					// Panels placed below the clock row move down by the tab bar.
					style={
						{
							originY: 0,
							"--tab-bar-space": `${tabBarSpace}px`,
							// The width it is opening to: bodies lay out at it (App.css .notch-body).
							"--notch-final-width": `${pillTargetWidth}px`,
							containerType: "inline-size"
						} as React.CSSProperties
					}
					transition={{
						// Opening bounces like the Dynamic Island; closing settles
						// softly; changing tools resizes with a lively spring.
						width: shellSpring,
						height: shellSpring,
						y: { type: "spring", stiffness: 550, damping: 45, mass: 0.8, restDelta: 0.001 },
						opacity: { duration: 0.2 },
						borderTopLeftRadius: { type: "spring", stiffness: 1000, damping: 40 },
						borderTopRightRadius: { type: "spring", stiffness: 1000, damping: 40 },
						borderBottomLeftRadius: { type: "spring", stiffness: 1000, damping: 40 },
						borderBottomRightRadius: { type: "spring", stiffness: 1000, damping: 40 },
						default: { type: "spring", stiffness: 500, damping: 30, mass: 1 }
					}}
				>
					<EdgeSurface edge="top" flares={attachedToEdge} />
					{setupPreview && isVisible && (
						<NotchOutline width={pillTargetWidth} height={pillTargetHeight} radius={minimalIdle ? 4 : isCalendarMode ? 28 : 18} flares={attachedToEdge} />
					)}
					{fileStatus && !isOpen && (
						<ProgressEffect style={progressStyle} percent={fileStatus.percent} result={fileStatus.result} full={!attachedToEdge} shape={fxShape} />
					)}
					{showCopyPulse && !fileStatus && !isOpen && <CopyEffect full={!attachedToEdge} shape={fxShape} />}
					{isOpen && <LotusSignature full={!attachedToEdge} shape={fxShape} />}
					{toolTimer && !fileStatus && !isOpen && (timerDisplay === "edge" || timerDisplay === "both") && (
						<ProgressEffect style="edge" percent={((toolTimer.total - toolTimer.left) / toolTimer.total) * 100} />
					)}
					<AnimatePresence>
						{isMusicMode && settingsAmbienceEnabled && albumArtUrl && isOpen && !isCalendarMode && (
							<motion.div
								className="notch-ambient-glow"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.15 }}
							>
								<AnimatePresence mode="wait">
									<motion.img
										key={albumArtUrl}
										src={albumArtUrl}
										alt=""
										draggable={false}
										initial={{ opacity: 0, scale: 1.1 }}
										animate={{ opacity: 1, scale: 1.8 }}
										exit={{ opacity: 0 }}
										transition={{ duration: 0.3 }}
									/>
								</AnimatePresence>
							</motion.div>
						)}
					</AnimatePresence>
					<AnimatePresence mode="wait">
						{isExpanded && (
							<motion.div
								key="bloom-content"
								initial={{ opacity: 0 }}
								animate={{ opacity: 1 }}
								exit={{ opacity: 0 }}
								transition={{ duration: 0.1 }}
								style={{
									width: "100%",
									height: "100%",
									display: "flex",
									flexDirection: "column",
									alignItems: "center",
									position: "relative",
									borderRadius: "inherit"
								}}
							>
								{/* Faster Waiting Transition Area */}
								<AnimatePresence mode="wait">
									{isOpen && isMusicMode && !isCalendarMode && !mediaTab ? (
										<motion.div
											key="expanded-music"
											className="expanded-music-container"
											initial={{ opacity: 0, scale: 0.98 }}
											animate={{ opacity: 1, scale: 1 }}
											exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.1 } }}
											transition={{ type: "spring", stiffness: 500, damping: 30 }}
										>
											{musicPlayer}
										</motion.div>
									) : (
										<motion.div
											key="standard-view-group"
											initial={{ opacity: 0, y: -5 }}
											animate={{ opacity: 1, y: 0 }}
											exit={{ opacity: 0, y: 5, transition: { duration: 0.1 } }}
											transition={{ duration: 0.2 }}
											style={{ width: "100%" }}
										>
											<div
												className="main-row"
												// A device alert covers the whole pill. The time row keeps one
												// size and place on every page: it undoes the panel's zoom, and
												// its 36px stays at the top while padding fills the panel's
												// zoomed slot (and the zoomed gap of the floating pill style).
												style={{
													zoom: 1 / panelZoomNow,
													marginTop: -pillGap * (panelZoomNow - 1),
													paddingBottom: (36 + pillGap) * (panelZoomNow - 1),
													...(bloomMode === "device" || deviceAlertOnScreen ? { visibility: "hidden" } : {})
												}}
											>
												<AnimatePresence mode="wait">
													{(fileStatus && !isOpen) ||
													((showPowerPulse || showLowBatteryPulse || showUpdatePulse || showCopyPulse) && !isHovered) ? (
														fileStatus ? (
															<motion.div
																key="file-status-view"
																initial={{ opacity: 0, scale: 0.9, filter: "blur(4px)" }}
																animate={
																	fileStatus.result === "failed"
																		? { opacity: 1, scale: 1, filter: "blur(0px)", x: [0, -6, 6, -4, 4, 0] }
																		: fileStatus.result === "ok"
																			? { opacity: 1, scale: [1, 1.08, 1], filter: "blur(0px)", x: 0 }
																			: { opacity: 1, scale: 1, filter: "blur(0px)", x: 0 }
																}
																exit={{ opacity: 0, scale: 1.05, filter: "blur(4px)" }}
																transition={
																	fileStatus.result
																		? { duration: 0.45, ease: "easeOut" }
																		: { type: "spring", stiffness: 480, damping: 24 }
																}
																className="power-pulse-content"
															>
																{fileStatus.result && (
																	<motion.span
																		key={fileStatus.result}
																		initial={{ scale: 0, rotate: -90 }}
																		animate={{ scale: 1, rotate: 0 }}
																		transition={{ type: "spring", stiffness: 600, damping: 15 }}
																		style={{
																			display: "flex",
																			color:
																				fileStatus.result === "ok"
																					? "#32D74B"
																					: fileStatus.result === "failed"
																						? "#FF453A"
																						: undefined
																		}}
																	>
																		{fileStatus.result === "ok" ? (
																			<CircleCheck size={14} />
																		) : fileStatus.result === "failed" ? (
																			<CircleAlert size={14} />
																		) : (
																			<CircleSlash size={14} />
																		)}
																	</motion.span>
																)}
																<span
																	className="label"
																	style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
																>
																	{fileStatus.text}
																	{fileStatus.percent !== null && (
															<>
																 {" • "}<Roll value={fileStatus.percent} />%
															</>
														)}
																</span>
															</motion.div>
														) : showCopyPulse ? (
															<motion.div
																key="copy-pulse-view"
																initial={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
																animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
																exit={{ opacity: 0, scale: 1.05, filter: "blur(4px)" }}
																className="power-pulse-content"
															>
																<ClipboardCheck size={14} />
																<span className="label">Copied</span>
															</motion.div>
														) : showUpdatePulse ? (
															<motion.div
																key="update-pulse-view"
																initial={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
																animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
																exit={{ opacity: 0, scale: 1.05, filter: "blur(4px)" }}
																className="power-pulse-content"
															>
																<GreenDownArrowIcon />
																<span className="label" style={{ color: "#32D74B" }}>
																	Update Available
																</span>
															</motion.div>
														) : (
															<motion.div
																key="pulse-view"
																initial={{ opacity: 0, scale: 0.95, filter: "blur(4px)" }}
																animate={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
																exit={{ opacity: 0, scale: 1.05, filter: "blur(4px)" }}
																className="power-pulse-content"
															>
																{updateAvailable && <GreenDownArrowIcon />}
																<BatteryIcon
																	charging={isCharging}
																	level={batteryLevel}
																	threshold={lowBatteryThreshold}
																/>
																<span
																	className="label"
																	style={{ color: showLowBatteryPulse ? "#FF453A" : "inherit" }}
																>
																	{showLowBatteryPulse
																		? "Low Battery"
																		: isCharging
																			? "Charging"
																			: "On Battery"}{" "}
																	• {batteryLevel}%
																</span>
															</motion.div>
														)
													) : (
														<motion.div
															key="standard-view"
															className="main-row-inner"
															initial={{ opacity: 0 }}
															animate={{ opacity: 1 }}
															exit={{ opacity: 0 }}
														>
															{/* Left: music on hover while a paused session remains, otherwise status widgets */}
															<div className="side-content left">
																{saverOn && !isOpen && (
																	<Leaf
																		size={13}
																		strokeWidth={2.2}
																		className="battery-saver-leaf"
																		aria-label="Battery saver on"
																	/>
																)}
																{showCompactMusicIcons && visualizerOn ? (
																	<AnimatePresence>
																		{visualizerOn && (
																			<motion.div
																				key="visualizer"
																				initial={{ scale: 0.8, opacity: 0 }}
																				animate={{ scale: 1, opacity: 1 }}
																				exit={{ scale: 0.8, opacity: 0 }}
																			>
																				<Visualizer isPlaying={isPlaying} />
																			</motion.div>
																		)}
																	</AnimatePresence>
																) : !showCompactMusicIcons && isHovered && statusWidgets.left.length > 0 ? (
																	<motion.div
																		key="left-widgets"
																		ref={leftWidgetsRef}
																		className="passive-features-group"
																		style={{ zoom: leftSize }}
																		initial={{ opacity: 0 }}
																		animate={{ opacity: 1 }}
																		exit={{ opacity: 0 }}
																		transition={{ duration: 0.2 }}
																	>
																		{statusWidgets.left.map(renderStatusWidget)}
																	</motion.div>
																) : null}
															</div>

															{/* Center - Time (always visible) */}
															<div className="time-center" ref={timeCenterRef}>
																<AnimatePresence>
																	{showPanelArrows && (
																		<motion.button
																			key="panel-prev"
																			type="button"
																			className="panel-arrow prev"
																			aria-label="Previous panel"
																			initial={{ opacity: 0, x: 4 }}
																			animate={{ opacity: 1, x: 0 }}
																			exit={{ opacity: 0, x: 4 }}
																			transition={{ duration: 0.15 }}
																			onClick={(e) => {
																				e.stopPropagation();
																				cyclePanel(-1);
																			}}
																		>
																			<ChevronLeft size={12} strokeWidth={2.5} />
																		</motion.button>
																	)}
																</AnimatePresence>
																<div className="time-flip-container" style={{ zoom: timeSize }} onClick={toggleCalendarMode}>
																	{/* One text at a time: the old one flips out before the new one flips in. */}
																	<AnimatePresence initial={false} mode="wait">
																		{showGlance && glance ? (
																			<motion.span
																				key="game-glance"
																				className="time game-glance"
																				initial={{ rotateX: -90, opacity: 0 }}
																				animate={{ rotateX: 0, opacity: 1 }}
																				exit={{ rotateX: 90, opacity: 0 }}
																				transition={{ type: "spring", stiffness: 600, damping: 30 }}
																			>
																				<span>{time}</span>
																				<span>CPU {Math.round(glance.cpu)}%</span>
																				<span>GPU {glance.gpu === null ? "–" : Math.round(glance.gpu)}%</span>
																				<span>RAM {Math.round(glance.ram)}%</span>
																			</motion.span>
																		) : timesUp ? (
																			<motion.span
																				key="times-up"
																				className="time times-up"
																				initial={{ scale: 0.6, opacity: 0 }}
																				animate={{ scale: 1, opacity: 1 }}
																				exit={{ opacity: 0 }}
																				transition={{ type: "spring", visualDuration: 0.4, bounce: 0.5 }}
																			>
																				TIME'S UP
																			</motion.span>
																		) : showToolTimer ? (
																			<motion.span
																				key="tool-timer"
																				className="time compact-timer tool-countdown"
																				initial={{ rotateX: -90, opacity: 0 }}
																				animate={{ rotateX: 0, opacity: 1 }}
																				exit={{ rotateX: 90, opacity: 0 }}
																				transition={{ type: "spring", stiffness: 600, damping: 30 }}
																			>
																				<Timer size={14} strokeWidth={2.5} />
																				{formatTimerTime(Math.ceil(toolTimer!.left / 1000))}
																			</motion.span>
																		) : timerSeconds > 0 || isTimerFinished ? (
																			<motion.span
																				key="timer"
																				className={`time compact-timer ${isTimerFinished ? "timer-finished" : ""}`}
																				initial={{ rotateX: -90, opacity: 0 }}
																				animate={{ rotateX: 0, opacity: 1 }}
																				exit={{ rotateX: 90, opacity: 0 }}
																				transition={{ type: "spring", stiffness: 600, damping: 30 }}
																			>
																				{isTimerFinished && (
																					<BellRing
																						size={13}
																						strokeWidth={2.5}
																						className="timer-bell"
																					/>
																				)}
																				{formatTimerTime(timerSeconds)}
																			</motion.span>
																		) : (
																			<motion.span
																				key="clock"
																				className="time"
																				initial={{ rotateX: -90, opacity: 0 }}
																				animate={{ rotateX: 0, opacity: 1 }}
																				exit={{ rotateX: 90, opacity: 0 }}
																				transition={{ type: "spring", stiffness: 600, damping: 30 }}
																			>
																				{time}
																			</motion.span>
																		)}
																	</AnimatePresence>
																</div>
																<AnimatePresence>
																	{showPanelArrows && (
																		<motion.button
																			key="panel-next"
																			type="button"
																			className="panel-arrow next"
																			aria-label="Next panel"
																			initial={{ opacity: 0, x: -4 }}
																			animate={{ opacity: 1, x: 0 }}
																			exit={{ opacity: 0, x: -4 }}
																			transition={{ duration: 0.15 }}
																			onClick={(e) => {
																				e.stopPropagation();
																				cyclePanel(1);
																			}}
																		>
																			<ChevronRight size={12} strokeWidth={2.5} />
																		</motion.button>
																	)}
																</AnimatePresence>
																{updateAvailable && showUpdateIndicator && (
																	<div className="update-dot" />
																)}
															</div>

															{/* Right: album art on a retained music session, otherwise status widgets */}
															<div className="side-content right">
																{showCompactMusicIcons && (settingsAlbumArtEnabled || showMusicOnStatusHover) ? (
																	<AnimatePresence mode="wait">
																		<motion.div
																			key="album-art"
																			className="album-art-glow-wrapper"
																			initial={{ opacity: 0, scale: 0.8 }}
																			animate={{ opacity: 1, scale: 1 }}
																			exit={{ opacity: 0, y: -20, scale: 0.8, filter: "blur(8px)" }}
																			transition={{ duration: 0.12 }}
																		>
																			{settingsAlbumArtEnabled && albumArtUrl && settingsCompactGlowEnabled && (
																				<img
																					src={albumArtUrl}
																					alt=""
																					className="album-art-glow-bg"
																					draggable={false}
																				/>
																			)}
																			<button
																				className={`album-art album-art-activity${!isPlaying ? " paused" : ""}`}
																				aria-label="Open music"
																				onClick={(e) => {
																					e.stopPropagation();
																					openNotch("music");
																				}}
																				onContextMenu={(e) => {
																					e.preventDefault();
																					e.stopPropagation();
																					skipPrevious();
																				}}
																			>
																				<div className="album-art-inner">
																					<AnimatePresence mode="wait" initial={false}>
																						{settingsAlbumArtEnabled && albumArtUrl ? (
																							<motion.img
																								key={`compact-art-${albumArtKey}`}
																								src={albumArtUrl}
																								alt="Art"
																								draggable={false}
																								initial={{ rotateY: 90, opacity: 0 }}
																								animate={{ rotateY: 0, opacity: 1 }}
																								exit={{ rotateY: -90, opacity: 0 }}
																								transition={{ duration: 0.25, ease: "easeInOut" }}
																								style={{
																									width: "100%",
																									height: "100%",
																									objectFit: "cover"
																								}}
																							/>
																						) : (
																							<motion.div
																								key="compact-placeholder"
																								className="album-art-placeholder"
																								initial={{ rotateY: 90, opacity: 0 }}
																								animate={{ rotateY: 0, opacity: 1 }}
																								exit={{ rotateY: -90, opacity: 0 }}
																								transition={{ duration: 0.25, ease: "easeInOut" }}
																							>
																								<MusicNoteIcon className="music-placeholder-svg-small" />
																							</motion.div>
																						)}
																					</AnimatePresence>
																				</div>
																			</button>
																		</motion.div>
																	</AnimatePresence>
																) : !showCompactMusicIcons && isHovered && statusWidgets.right.length > 0 ? (
																	<motion.div
																		key="right-widgets"
																		ref={rightWidgetsRef}
																		className="passive-features-group"
																		style={{ zoom: rightSize }}
																		initial={{ opacity: 0 }}
																		animate={{ opacity: 1 }}
																		exit={{ opacity: 0 }}
																		transition={{ duration: 0.2 }}
																	>
																		{statusWidgets.right.map(renderStatusWidget)}
																	</motion.div>
																) : null}
															</div>
														</motion.div>
													)}
												</AnimatePresence>
											</div>
										</motion.div>
									)}
								</AnimatePresence>

								{showTabBar && (
									<NotchTabBar
										tools={tabTools}
										active={activeTabId}
										zoom={1 / panelZoomNow}
										onSelect={selectTab}
										onStep={(dir) => stepTabRef.current(dir)}
									/>
								)}
								<AnimatePresence custom={tabDir}>
									{mediaTab && (
										<motion.div key="media-body" className="notch-body" {...bodyMotion(tabDir)}>
											<div className="media-body" style={{ height: mediaInfo.has_media ? playerHeight : 110 }}>
												{mediaInfo.has_media ? (
													<div className="expanded-music-container">{musicPlayer}</div>
												) : (
													<div className="media-empty">
														<MusicNoteIcon size={26} className="media-empty-icon" />
														<strong>Nothing's playing</strong>
														<span>Play something in any app and it shows up here</span>
													</div>
												)}
											</div>
										</motion.div>
									)}
								</AnimatePresence>
								<AnimatePresence mode="popLayout" custom={tabDir}>
									{toolShowing && isOpen && (
										<motion.div key={toolShowing} className="tool-host-motion" {...bodyMotion(tabDir)}>
											<ToolHost id={toolShowing} setPinned={setNotchPinned} />
										</motion.div>
									)}
								</AnimatePresence>

								{/* Wi-Fi networks, opened from the controls panel's Wi-Fi tile */}
								<AnimatePresence>
									{bloomMode === "wifi" && (
										<motion.div
											key="wifi-view"
											className="notch-body qp-zoom"
											{...LIST_MOTION}
										>
											<WifiPanel
												enabled={wifiEnabled}
												onToggle={toggleWifi}
												onBack={() => setBloomMode("command-center")}
												onPinChange={setNotchPinned}
											/>
										</motion.div>
									)}
								</AnimatePresence>

								{/* Bluetooth devices, opened from the controls panel's Bluetooth tile */}
								<AnimatePresence>
									{bloomMode === "bluetooth" && (
										<motion.div
											key="bluetooth-view"
											className="notch-body qp-zoom"
											{...LIST_MOTION}
										>
											<BluetoothPanel
												enabled={bluetoothEnabled}
												onToggle={toggleBluetooth}
												onBack={() => setBloomMode("command-center")}
												onPinChange={setNotchPinned}
											/>
										</motion.div>
									)}
								</AnimatePresence>

								{/* Connected devices: everything connected, with its battery, by priority */}
								<AnimatePresence custom={tabDir}>
									{bloomMode === "devices" && (
										<motion.div
											key="devices-view"
											className="notch-body"
											{...bodyMotion(tabDir)}
										>
											<ConnectedDevicesPanel
												data={connectedDevices}
												height={devicesPanelHeight}
												buds={budsById}
												lowThreshold={lowBatteryThreshold}
												onContentHeight={setDevicesContentHeight}
											/>
										</motion.div>
									)}
								</AnimatePresence>

								{/* Clipboard history */}
								<AnimatePresence custom={tabDir}>
									{bloomMode === "clipboard" && (
										<motion.div
											key="clipboard-view"
											className="notch-body"
											{...bodyMotion(tabDir)}
										>
											<ClipboardPanel
												dragIcon={shelfDragIcon}
												dropEvent="shelf-drag-drop"
												dragOver={isDragHovering && !clipboardSelfDragRef.current}
												onDragStart={() => {
													clipboardSelfDragRef.current = true;
													clearShelfCollapse();
												}}
												onDragEnd={() => {
													clipboardSelfDragRef.current = false;
													// The native drag owned the pointer, so the webview never saw it leave.
													releaseNotchHover();
													invoke("set_notch_hovered", { hovered: false }).catch(() => {});
												}}
												onBusy={setNotchPinned}
											/>
										</motion.div>
									)}
								</AnimatePresence>

								{/* Command Center */}
								<AnimatePresence custom={quickList ? "list" : tabDir}>
									{bloomMode === "command-center" && (
										<motion.div
											key="command-center"
											className="notch-body"
											variants={CC_VARIANTS} custom={tabDir} initial="enter" animate="center" exit="exit"
										>
											<CommandCenter
												tiles={ccTiles}
												state={ccState}
												volume={Math.round(displayVolume * 100)}
												muted={isMuted}
												onVolume={(v) => handleVolumeChange(v / 100)}
												onMute={() => {
													if (displayVolume > 0) {
														restoreVolumeRef.current = displayVolume;
														handleVolumeChange(0);
													} else handleVolumeChange(restoreVolumeRef.current || 0.5);
												}}
												brightness={currentBrightness}
												onBrightness={handleBrightnessChange}
												onBrightnessIcon={() => {
													if (currentBrightness > 0) {
														restoreBrightnessRef.current = currentBrightness;
														handleBrightnessChange(0);
													} else handleBrightnessChange(restoreBrightnessRef.current || 50);
												}}
											/>
										</motion.div>
									)}
								</AnimatePresence>

								{/* Device alert: a device connected or disconnected. A
								    click opens the Bluetooth view. */}
								<AnimatePresence
									// An alert arriving while the last one fades out keeps the
									// clock row hidden.
									onExitComplete={() => setDeviceAlertOnScreen(deviceAlertRef.current !== null)}
								>
									{bloomMode === "device" && deviceAlert && (
										<motion.div
											className="device-alert"
											title={deviceAlert.disk && deviceAlert.connected ? "Open in File Explorer" : undefined}
											style={deviceAlert.disk && deviceAlert.connected ? { cursor: "pointer" } : undefined}
											onClick={(e) => {
												e.stopPropagation();
												const usb = deviceAlert.usb;
												const openDrive = deviceAlert.disk && deviceAlert.connected;
												deviceAlertQueueRef.current = [];
												setDeviceAlert(null);
												if (openDrive) invoke("open_new_drive").catch(() => {});
												// Bluetooth devices open their list; USB ones
												// have none, so the click just dismisses.
												if (usb) return;
												setIsOpen(true);
												setBloomMode("bluetooth");
											}}
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0, filter: "blur(4px)", transition: { duration: 0.12 } }}
											transition={{ duration: 0.2 }}
										>
											<DeviceArt
												art={deviceAlert.art}
												phase={deviceAlert.connected ? "play" : "leave"}
												runId={deviceAlert.runId}
												size={60}
											/>
											<div className="device-alert-text">
												<span className="device-alert-name">{deviceAlert.name}</span>
												<span className="device-alert-status">
													{deviceAlertStatus(deviceAlert.art, deviceAlert.connected, deviceAlert.usb)}
												</span>
											</div>
											{deviceAlert.connected && deviceAlert.buds ? (
												<DeviceBudsBattery buds={deviceAlert.buds} />
											) : (
												deviceAlert.connected &&
												deviceAlert.battery !== null && <DeviceBatteryRing level={deviceAlert.battery} />
											)}
										</motion.div>
									)}
								</AnimatePresence>

								{/* Announcement Card */}
								<AnimatePresence>
									{bloomMode === "announcement" && announcement && !announcementDismissed && (
										<motion.div
											className={`announcement-content severity-${announcement.severity}`}
											onClick={(e) => e.stopPropagation()}
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{
												opacity: 0,
												filter: "blur(4px)",
												transition: { duration: 0.1 }
											}}
											transition={{ type: "spring", stiffness: 400, damping: 30 }}
										>
											<div className="announcement-header">
												<div className="announcement-heading">
													<Megaphone size={14} className="announcement-icon" />
													<span className="announcement-title">{announcement.title}</span>
												</div>
												<button
													className="announcement-close"
													onClick={dismissAnnouncement}
													title="Dismiss"
												>
													<X size={13} strokeWidth={2.2} />
												</button>
											</div>
											{announcement.body && (
												<p className="announcement-body">{announcement.body}</p>
											)}
											{announcement.url && (
												<button
													className="announcement-link"
													onClick={() => openUrl(announcement.url!)}
												>
													Learn more
												</button>
											)}
										</motion.div>
									)}
								</AnimatePresence>

								{/* Day: the month beside today (date, weekday, week of the month).
								    The timer lives in its own Timer tab only (user, 2026-11-20). */}
								<AnimatePresence custom={tabDir}>
									{settingsCalendarEnabled && isCalendarMode && (
										<motion.div
											className="calendar-timer-content split-view"
											onClick={(e) =>
												e.stopPropagation()
											} /* Block mode switches when clicking inside */
											{...bodyMotion(tabDir)}
										>
											<DayView setPinned={setNotchPinned} />
										</motion.div>
									)}
								</AnimatePresence>

								{/* Shelf Panel */}
								<AnimatePresence custom={tabDir}>
									{bloomMode === "shelf" && (
										<motion.div
											className="shelf-content"
											onClick={(e) => e.stopPropagation()}
											onWheel={handleShelfWheel}
											{...bodyMotion(tabDir)}
										>
											{shelfNotice && <div className="shelf-notice">{shelfNotice}</div>}
											{shelfItems.length === 0 ? (
												<div className="shelf-empty">
													<span>Drop files or selected text here</span>
												</div>
											) : (
												<div
													className={`shelf-items-grid ${shelfOverflowing ? "overflowing" : ""}`}
													ref={shelfGridRef}
												>
													<AnimatePresence mode="popLayout" onExitComplete={measureShelfOverflow}>
														{shelfItems.map((item) => {
															const preview = item.path ? shelfThumbs[item.path] : undefined;
															const thumb = preview?.thumb;
															return (
																<motion.div
																	key={item.id}
																	layout
																	initial={
																		shelfNewIdsRef.current.has(item.id)
																			? { opacity: 0, scale: 0.82 }
																			: false
																	}
																	animate={{ opacity: 1, scale: 1 }}
																	exit={{
																		opacity: 0,
																		scale: 0.82,
																		transition: { duration: 0.16, ease: "easeOut" }
																	}}
																	transition={{
																		type: "spring",
																		stiffness: 520,
																		damping: 38,
																		mass: 0.7
																	}}
																	className={`shelf-tile ${item.type === "text" || (!thumb && preview?.text) ? "is-text" : ""}`}
																	title={
																		item.type === "text" ? item.text?.slice(0, 1000) : item.path
																	}
																	onPointerDown={(e) => handleShelfPointerDown(e, item)}
																	onPointerMove={(e) => handleShelfPointerMove(e, item)}
																	onClick={(e) => handleShelfTileClick(e, item)}
																>
																	<div className="shelf-tile-preview">
																		{item.type === "text" ? (
																			<div className="shelf-tile-text">
																				<Type
																					size={11}
																					strokeWidth={2}
																					className="shelf-tile-text-icon"
																				/>
																				<span className="shelf-tile-text-body">{item.text}</span>
																			</div>
																		) : !thumb && preview?.text ? (
																			// A document or text file: its opening text,
																			// marked with its type's icon.
																			<div className="shelf-tile-text">
																				<ShelfTypeIcon
																					name={item.name}
																					folder={false}
																					size={11}
																					className="shelf-tile-text-icon"
																				/>
																				<span className="shelf-tile-text-body">{preview.text}</span>
																			</div>
																		) : (
																			<>
																				<div className="shelf-tile-placeholder">
																					{preview && !thumb ? (
																						<ShelfTypeIcon
																							name={item.name}
																							folder={preview.folder}
																						/>
																					) : null}
																				</div>
																				{thumb ? (
																					<img src={thumb} alt="" draggable={false} />
																				) : null}
																			</>
																		)}
																	</div>
																	<span className="shelf-tile-name">
																		{item.type === "text"
																			? `Text · ${item.text?.length ?? 0} chars`
																			: item.name}
																	</span>
																	<button
																		className="shelf-tile-remove"
																		title="Remove from shelf"
																		onClick={(e) => {
																			e.stopPropagation();
																			removeShelfItem(item.id);
																		}}
																	>
																		<X size={11} strokeWidth={2.5} />
																	</button>
																</motion.div>
															);
														})}
													</AnimatePresence>
												</div>
											)}
										</motion.div>
									)}
								</AnimatePresence>
							</motion.div>
						)}
					</AnimatePresence>
				</motion.div>
				{/* The shelf's items, as a bubble on the left of the collapsed pill */}
				<AnimatePresence onExitComplete={() => reportNotchRect.current()}>
					{showShelfBubble && (
						<motion.button
							key="shelf-bubble"
							ref={shelfBubbleRef}
							type="button"
							className={`activity-bubble shelf-bubble ${isHovered ? "expanded" : ""}`}
							aria-label={`Open shelf: ${shelfItems.length} item${shelfItems.length === 1 ? "" : "s"}`}
							// Anchored at the pill's centre, offset past its left edge.
							style={{ right: "50%" }}
							initial={{ opacity: 0, scale: 0.4, x: 28, marginRight: getDynamicWidth() / 2 + 8 }}
							animate={{ opacity: 1, scale: 1, x: 0, marginRight: getDynamicWidth() / 2 + 8 }}
							exit={{ opacity: 0, scale: 0.4, x: 28 }}
							transition={{
								type: "spring",
								stiffness: 400,
								damping: 31,
								opacity: { duration: 0.15 }
							}}
							onAnimationComplete={() => reportNotchRect.current()}
							onClick={(e) => {
								e.stopPropagation();
								setIsHovered(true);
								openNotch("shelf");
							}}
						>
							<Inbox size={12} strokeWidth={2.4} />
							<span>{shelfItems.length}</span>
						</motion.button>
					)}
				</AnimatePresence>
				{/* Music in its own bubble while a timer holds the collapsed pill */}
				<AnimatePresence onExitComplete={() => reportNotchRect.current()}>
					{showMusicBubble && (
						<motion.button
							key="music-bubble"
							ref={musicBubbleRef}
							type="button"
							className={`activity-bubble ${isHovered ? "expanded" : ""}`}
							aria-label={mediaInfo.title ? `Open music: ${mediaInfo.title}` : "Open music"}
							// Anchored at the pill's centre, offset past its right edge.
							style={{ left: "50%" }}
							initial={{ opacity: 0, scale: 0.4, x: -28, marginLeft: getDynamicWidth() / 2 + 8 }}
							animate={{ opacity: 1, scale: 1, x: 0, marginLeft: getDynamicWidth() / 2 + 8 }}
							exit={{ opacity: 0, scale: 0.4, x: -28 }}
							transition={{
								type: "spring",
								stiffness: 400,
								damping: 31,
								opacity: { duration: 0.15 }
							}}
							onAnimationComplete={() => reportNotchRect.current()}
							onClick={(e) => {
								e.stopPropagation();
								setIsHovered(true);
								openNotch("music");
							}}
						>
							{settingsAlbumArtEnabled && albumArtUrl ? (
								<img src={albumArtUrl} alt="" draggable={false} />
							) : (
								<Music size={14} strokeWidth={2.2} />
							)}
						</motion.button>
					)}
				</AnimatePresence>
			</div>
		</div>
		</MotionConfig>
	);
}

/** Week of the month, counted in calendar rows (Sunday first, like the
 *  grid beside it): the 1st's row is week 1. */
function weekOfMonth(d: Date) {
	const first = new Date(d.getFullYear(), d.getMonth(), 1).getDay();
	return Math.ceil((d.getDate() + first) / 7);
}

const ORDINAL = ["First", "Second", "Third", "Fourth", "Fifth", "Sixth"];

/** Today, beside the month: the date large, the weekday, the week. */
function TodayPanel() {
	const [now, setNow] = useState(() => new Date());
	// Rolls over at midnight while the notch stays open.
	useEffect(() => {
		const t = setInterval(() => setNow(new Date()), 60000);
		return () => clearInterval(t);
	}, []);
	const week = weekOfMonth(now);
	return (
		<div className="today-panel">
			<span className="today-weekday">{now.toLocaleDateString(undefined, { weekday: "long" })}</span>
			<span className="today-date">{now.getDate()}</span>
			<span className="today-month">{now.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
			<span className="today-week">{ORDINAL[week - 1] ?? `Week ${week}`} week</span>
		</div>
	);
}

/** The Calendar tab: the month (click a day to give it a deadline) and,
 *  beside it, today and the next deadlines with the days left. */
function DayView({ setPinned }: { setPinned: (pinned: boolean) => void }) {
	const store = useDeadlines();
	const [picked, setPicked] = useState<string | null>(null);
	const marked = new Set(store[0].items.map((d) => d.date));
	return (
		<>
			<div className="calendar-column">
				<Calendar marked={marked} onPick={(d) => setPicked(`${d}#${Date.now()}`)} />
			</div>
			<div className="timer-column day-side">
				<TodayPanel />
				<DeadlineList picked={picked} max={2} setPinned={setPinned} store={store} calendarPicks />
			</div>
		</>
	);
}

function Calendar({ marked, onPick }: { marked: Set<string>; onPick: (day: string) => void }) {
	const [date] = useState(new Date());

	const daysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
	const firstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

	const currentMonth = date.getMonth();
	const currentYear = date.getFullYear();
	const monthName = date.toLocaleString("default", { month: "long" });

	const totalDays = daysInMonth(currentYear, currentMonth);
	const startDay = firstDayOfMonth(currentYear, currentMonth);
	const days = [];

	// Padding for start of month
	for (let i = 0; i < startDay; i++) {
		days.push(<div key={`empty-${i}`} className="calendar-day empty" />);
	}

	// Actual days
	const today = new Date().getDate();
	const isCurrentMonth =
		new Date().getMonth() === currentMonth && new Date().getFullYear() === currentYear;

	for (let i = 1; i <= totalDays; i++) {
		const key = dayKey(new Date(currentYear, currentMonth, i));
		days.push(
			<button
				type="button"
				key={i}
				className={`calendar-day ${isCurrentMonth && i === today ? "today" : ""}${marked.has(key) ? " has-deadline" : ""}`}
				title="Add a deadline on this day"
				onClick={() => onPick(key)}
			>
				{i}
			</button>
		);
	}

	return (
		<div className="calendar-container">
			<div className="calendar-header">
				<span className="month-year">
					{monthName} {currentYear}
				</span>
			</div>
			<div className="calendar-grid">
				{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
					<div key={`${d}-${i}`} className="day-name">
						{d}
					</div>
				))}
				{days}
			</div>
		</div>
	);
}

export default App;
