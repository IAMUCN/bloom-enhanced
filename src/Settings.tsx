import { StrictMode, useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Effect } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
	X,
	Settings,
	Palette,
	PanelTop,
	Monitor,
	Layers,
	Info,
	Megaphone,
	ClipboardList,
	Orbit,
	Search,
	RotateCcw
} from "lucide-react";
import {
	useSettings,
	GeneralTab,
	AppearanceTab,
	NotchTab,
	DockTab,
	OverlaysTab,
	ClipboardTab,
	FilesTab,
	AboutTab
} from "./settings/index";
import type { SettingsTab } from "./settings/index";
import { useAnnouncement } from "./hooks/useAnnouncement";
import { initTheme } from "./theme";
import { FeaturePreview } from "./settings/FeaturePreview";
import "./Settings.css";

const appWindow = getCurrentWebviewWindow();

const TABS: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
	{ id: "general", label: "General", icon: Settings },
	{ id: "appearance", label: "Appearance", icon: Palette },
	{ id: "notch", label: "Notch", icon: PanelTop },
	{ id: "dock", label: "Dock", icon: Monitor },
	{ id: "clipboard", label: "Shelf", icon: ClipboardList },
	{ id: "files", label: "Radial Menu", icon: Orbit },
	{ id: "overlays", label: "Overlays", icon: Layers },
	{ id: "about", label: "About", icon: Info }
];

const TAB_COPY: Record<SettingsTab, string> = {
	general: "The essentials for how Bloom starts and runs.",
	appearance: "Make every surface feel at home on your desktop.",
	notch: "Choose what appears at the top of your screen.",
	dock: "Shape the taskbar replacement around your workflow.",
	clipboard: "Everything you copy, kept on this PC and opened from the notch.",
	files: "Convert and act on files from a ring around the pointer, without opening an app.",
	overlays: "Keep quick controls visible only when you need them.",
	about: "Version, updates and your settings data."
};

/** Keys each page's "Reset this page" puts back to defaults. */
const PAGE_KEYS: Partial<Record<SettingsTab, string[]>> = {
	general: ["bloom-time-format-24h", "bloom-show-update-indicator", "bloom-low-battery-threshold"],
	appearance: ["bloom-theme-", "bloom-scale"],
	notch: [
		"bloom-notch-",
		"bloom-calendar-",
		"bloom-music-",
		"bloom-media-",
		"bloom-visualizer-enabled",
		"bloom-weather-",
		"bloom-temp-unit",
		"bloom-status-widgets",
		"bloom-shelf-persist"
	],
	dock: ["bloom-dock-", "bloom-start-icon"],
	clipboard: ["bloom-clipboard-"],
	files: ["bloom-files-"],
	overlays: ["bloom-volume-", "bloom-brightness-"]
};

interface Hit {
	tab: SettingsTab;
	label: string;
	desc: string;
	row: HTMLElement;
}

/** Rows of every page whose label, description or page name holds
 *  all the words typed. */
function findSettings(root: HTMLElement | null, query: string): Hit[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (!root || !words.length) return [];
	const hits: Hit[] = [];
	root.querySelectorAll<HTMLElement>("section[data-tab]").forEach((section) => {
		const tab = section.dataset.tab as SettingsTab;
		const page = TABS.find((t) => t.id === tab)?.label ?? "";
		section.querySelectorAll<HTMLElement>(".setting-item, .settings-disclosure > summary").forEach((row) => {
			const label = row.querySelector(".setting-label")?.textContent ?? row.firstChild?.textContent ?? "";
			const desc = (row.querySelector(".setting-desc") ?? row.querySelector("span"))?.textContent ?? "";
			const text = `${label} ${desc} ${page}`.toLowerCase();
			if (label && words.every((w) => text.includes(w))) hits.push({ tab, label, desc, row });
		});
	});
	return hits;
}

function SettingsApp() {
	const [activeTab, setActiveTab] = useState<SettingsTab>("general");
	const [previewFocus, setPreviewFocus] = useState("");
	const contentRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	const [hits, setHits] = useState<Hit[]>([]);
	// While searching no page shows; the results do.
	const shown = query.trim() ? null : activeTab;
	useEffect(() => setHits(findSettings(contentRef.current, query)), [query]);

	const jumpTo = (hit: Hit) => {
		setQuery("");
		setActiveTab(hit.tab);
		requestAnimationFrame(() => {
			for (let el = hit.row.parentElement; el; el = el.parentElement)
				if (el instanceof HTMLDetailsElement) el.open = true;
			hit.row.scrollIntoView({ block: "center", behavior: "smooth" });
			hit.row.classList.remove("search-hit");
			void hit.row.offsetWidth;
			hit.row.classList.add("search-hit");
			hit.row.querySelector<HTMLElement>("input, button, [tabindex='0']")?.focus({ preventScroll: true });
		});
	};

	// Ctrl+F searches; Esc clears the search, or closes Settings.
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
				e.preventDefault();
				searchRef.current?.focus();
				searchRef.current?.select();
			} else if (e.key === "Escape" && !e.defaultPrevented) {
				const field = e.target instanceof HTMLInputElement && e.target.type !== "checkbox" ? e.target : null;
				if (searchRef.current?.value) setQuery("");
				else if (field && field !== searchRef.current) field.blur();
				else appWindow.hide().catch(() => {});
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	const settings = useSettings();
	const { announcement, dismissed, dismiss } = useAnnouncement();

	useEffect(() => {
		return initTheme();
	}, []);

	useEffect(() => {
		const preventContext = (e: MouseEvent) => e.preventDefault();
		document.addEventListener("contextmenu", preventContext as any);

		appWindow
			.setEffects({
				effects: ["mica" as Effect],
				state: "active" as any
			})
			.catch(() => {});

		return () => {
			document.removeEventListener("contextmenu", preventContext as any);
		};
	}, []);

	useEffect(() => {
		invoke("resize_settings_window", {
			width: 740 * settings.scale,
			height: 560 * settings.scale
		}).catch(console.error);
	}, [settings.scale]);

	useEffect(() => {
		if (contentRef.current) contentRef.current.scrollTop = 0;
	}, [activeTab]);

	const handleClose = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		try {
			await appWindow.hide();
		} catch {}
	};

	return (
		<div className="settings-container" style={{ zoom: settings.scale }}>
			<div className="title-bar" data-tauri-drag-region>
				<span className="title-text" data-tauri-drag-region>
					Settings
				</span>
				<button className="close-btn" onClick={handleClose} title="Close Settings">
					<X size={12} strokeWidth={1.5} className="close-btn-icon" />
				</button>
			</div>

			<div className="settings-body">
				<div className="settings-sidebar">
					<div className="settings-sidebar-intro"><strong>Bloom</strong><span>Make it yours</span></div>
					<label className="settings-search">
						<Search size={13} strokeWidth={1.75} />
						<input
							ref={searchRef}
							value={query}
							placeholder="Search settings"
							aria-label="Search settings"
							spellCheck={false}
							onChange={(e) => setQuery(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter" && hits[0]) jumpTo(hits[0]);
							}}
						/>
					</label>
					{TABS.map(({ id, label, icon: Icon }) => (
						<button
							key={id}
							className={`sidebar-tab ${shown === id ? "active" : ""}`}
							aria-current={shown === id ? "page" : undefined}
							onClick={() => {
								setQuery("");
								setActiveTab(id);
							}}
						>
							<div className="sidebar-tab-icon">
								<Icon size={14} strokeWidth={1.5} />
							</div>
							<span>{label}</span>
						</button>
					))}
				</div>

				<div className="settings-content" ref={contentRef} onChangeCapture={(event) => {
					const target = event.target as HTMLElement;
					const row = target.closest(".setting-item");
					let label = row?.querySelector(".setting-label")?.textContent;
					if (!label && target.closest(".settings-disclosure-standalone")) label = "Status Widgets";
					if (activeTab === "overlays" && label === "Show on Edge Hover") {
						const edgeRows = Array.from(contentRef.current?.querySelectorAll(".setting-item") ?? []).filter(
							(item) => item.querySelector(".setting-label")?.textContent === label
						);
						label = row === edgeRows[edgeRows.length - 1] && edgeRows.length > 1 ? "Brightness Edge Hover" : "Volume Edge Hover";
					}
					if (label) setPreviewFocus(activeTab + ":" + label + ":" + Date.now());
				}} onClickCapture={(event) => {
					const label = (event.target as HTMLElement).closest(".setting-item")?.querySelector(".setting-label")?.textContent;
					if (label === "Start Menu Icon" || label === "Weather Status") {
						setPreviewFocus(activeTab + ":" + label + ":" + Date.now());
					}
				}}>
					{settings.saveError && (
						<div className="settings-save-error" role="alert">
							<span>
								Changes could not be saved. Your saved settings have been restored.
								{settings.saveErrorDetail && (
									<small style={{ display: "block" }}>{settings.saveErrorDetail}</small>
								)}
							</span>
							<button onClick={settings.dismissSaveError} aria-label="Dismiss save error">
								<X size={14} strokeWidth={2} />
							</button>
						</div>
					)}
					{announcement && !dismissed && (
						<div className={`announcement-banner severity-${announcement.severity}`}>
							<Megaphone size={14} className="announcement-banner-icon" />
							<div className="announcement-banner-text">
								<span className="announcement-banner-title">{announcement.title}</span>
								{announcement.body && (
									<span className="announcement-banner-body">{announcement.body}</span>
								)}
							</div>
							{announcement.url && (
								<button
									className="announcement-banner-link"
									onClick={() => openUrl(announcement.url!)}
								>
									Learn more
								</button>
							)}
							<button className="announcement-banner-close" onClick={dismiss} title="Dismiss">
								<X size={12} strokeWidth={2.2} />
							</button>
						</div>
					)}
					{shown ? (
						<>
							<div className="settings-page-heading">
								<h1>{TABS.find((tab) => tab.id === shown)?.label}</h1>
								<p>{TAB_COPY[shown]}</p>
							</div>
							<FeaturePreview tab={shown} settings={settings} focus={previewFocus} />
						</>
					) : (
						<div className="settings-search-results" role="list">
							<div className="settings-page-heading">
								<h1>Search</h1>
								<p>
									{hits.length
										? `${hits.length} setting${hits.length === 1 ? "" : "s"} match. Enter opens the first.`
										: "Nothing matches. Try another word."}
								</p>
							</div>
							{hits.map((hit, i) => (
								<button key={i} role="listitem" className="search-result" onClick={() => jumpTo(hit)}>
									<span className="search-result-page">{TABS.find((t) => t.id === hit.tab)?.label}</span>
									<span className="search-result-label">{hit.label}</span>
									{hit.desc && <span className="search-result-desc">{hit.desc}</span>}
								</button>
							))}
						</div>
					)}
					<section data-tab="general" hidden={shown !== "general"}>
						<GeneralTab
							autostart={settings.autostart}
							toggleAutostart={settings.toggleAutostart}
							timeFormat24h={settings.timeFormat24h}
							toggleTimeFormat24h={settings.toggleTimeFormat24h}
							showUpdateIndicator={settings.showUpdateIndicator}
							toggleUpdateIndicator={settings.toggleUpdateIndicator}
							lowBatteryThreshold={settings.lowBatteryThreshold}
							handleThresholdChange={settings.handleThresholdChange}
							restartBloom={settings.restartBloom}
							resetToDefaults={settings.resetToDefaults}
							quitBloom={settings.quitBloom}
						/>
					</section>
					<section data-tab="appearance" hidden={shown !== "appearance"}>
						<AppearanceTab
							themeMode={settings.themeMode}
							handleThemeModeChange={settings.handleThemeModeChange}
							themeColor={settings.themeColor}
							handleThemeColorChange={settings.handleThemeColorChange}
							themeOpacity={settings.themeOpacity}
							handleOpacityChange={settings.handleOpacityChange}
							themeSaturation={settings.themeSaturation}
							handleSaturationChange={settings.handleSaturationChange}
							themeBrightness={settings.themeBrightness}
							handleBrightnessChange={settings.handleBrightnessChange}
							scale={settings.scale}
							handleScaleChange={settings.handleScaleChange}
						/>
					</section>
					<section data-tab="notch" hidden={shown !== "notch"}>
						<NotchTab
							saveSetting={settings.saveSetting}
							notchEnabled={settings.notchEnabled}
							toggleNotch={settings.toggleNotch}
							notchMode={settings.notchMode}
							setNotchModeValue={settings.setNotchModeValue}
							notchEdgeDelay={settings.notchEdgeDelay}
							handleNotchEdgeDelayChange={settings.handleNotchEdgeDelayChange}
							calendarEnabled={settings.calendarEnabled}
							toggleCalendar={settings.toggleCalendar}
							controlsPanelEnabled={settings.controlsPanelEnabled}
							toggleControlsPanel={settings.toggleControlsPanel}
							devicesPanelEnabled={settings.devicesPanelEnabled}
							toggleDevicesPanel={settings.toggleDevicesPanel}
							enabledPanelCount={settings.enabledPanelCount}
							notchRememberPanel={settings.notchRememberPanel}
							toggleNotchRememberPanel={settings.toggleNotchRememberPanel}
							notchDefaultPanel={settings.notchDefaultPanel}
							changeNotchDefaultPanel={settings.changeNotchDefaultPanel}
							timerSoundEnabled={settings.timerSoundEnabled}
							toggleTimerSound={settings.toggleTimerSound}
							musicModeEnabled={settings.musicModeEnabled}
							toggleMusicMode={settings.toggleMusicMode}
							musicCompactNotch={settings.musicCompactNotch}
							toggleMusicCompactNotch={settings.toggleMusicCompactNotch}
							shelfPersist={settings.shelfPersist}
							toggleShelfPersist={settings.toggleShelfPersist}
							mediaLayout={settings.mediaLayout}
							toggleMediaLayout={settings.toggleMediaLayout}
							mediaAmbienceEnabled={settings.mediaAmbienceEnabled}
							toggleAmbience={settings.toggleAmbience}
							mediaCompactGlowEnabled={settings.mediaCompactGlowEnabled}
							toggleCompactGlow={settings.toggleCompactGlow}
							weatherEnabled={settings.weatherEnabled}
							toggleWeather={settings.toggleWeather}
							tempUnitFahrenheit={settings.tempUnitFahrenheit}
							toggleTempUnit={settings.toggleTempUnit}
							cityName={settings.cityName}
							setCityName={settings.setCityName}
							citySearchResults={settings.citySearchResults}
							showCityDropdown={settings.showCityDropdown}
							setShowCityDropdown={settings.setShowCityDropdown}
							selectCity={settings.selectCity}
							handleCityClear={settings.handleCityClear}
							statusWidgets={settings.statusWidgets}
							handleWidgetsChange={settings.handleWidgetsChange}
							notchScale={settings.notchScale}
							handleNotchScaleChange={settings.handleNotchScaleChange}
							notchPanelScales={settings.notchPanelScales}
							handlePanelScaleChange={settings.handlePanelScaleChange}
							notchStyle={settings.notchStyle}
							handleNotchStyleChange={settings.handleNotchStyleChange}
						/>
					</section>
					<section data-tab="dock" hidden={shown !== "dock"}>
						<DockTab
							dockEnabled={settings.dockEnabled}
							toggleDock={settings.toggleDock}
							dockMode={settings.dockMode}
							setDockModeValue={settings.setDockModeValue}
							dockEdgeDelay={settings.dockEdgeDelay}
							handleDockEdgeDelayChange={settings.handleDockEdgeDelayChange}
							dockPreviewEnabled={settings.dockPreviewEnabled}
							toggleDockPreview={settings.toggleDockPreview}
							dockIconOnly={settings.dockIconOnly}
							toggleDockIconOnly={settings.toggleDockIconOnly}
							dockSeparatorEnabled={settings.dockSeparatorEnabled}
							toggleDockSeparator={settings.toggleDockSeparator}
							dockAdaptive={settings.dockAdaptive}
							toggleDockAdaptive={settings.toggleDockAdaptive}
							dockWinNumberEnabled={settings.dockWinNumberEnabled}
							toggleDockWinNumber={settings.toggleDockWinNumber}
							dockExtrasPosition={settings.dockExtrasPosition}
							handleDockExtrasPositionChange={settings.handleDockExtrasPositionChange}
							dockExtrasDrives={settings.dockExtrasDrives}
							toggleDockExtrasDrives={settings.toggleDockExtrasDrives}
							dockExtrasHiddenDrives={settings.dockExtrasHiddenDrives}
							toggleDockExtrasDrive={settings.toggleDockExtrasDrive}
							dockExtrasRecycleBin={settings.dockExtrasRecycleBin}
							toggleDockExtrasRecycleBin={settings.toggleDockExtrasRecycleBin}
							dockTaskView={settings.dockTaskView}
							toggleDockTaskView={settings.toggleDockTaskView}
							dockExtrasFolders={settings.dockExtrasFolders}
							toggleDockExtraFolder={settings.toggleDockExtraFolder}
							dockExtrasCustomFolders={settings.dockExtrasCustomFolders}
							handleAddDockExtraFolder={settings.handleAddDockExtraFolder}
							handleRemoveDockExtraFolder={settings.handleRemoveDockExtraFolder}
							startIcon={settings.startIcon}
							handleStartIconChange={settings.handleStartIconChange}
							dockScale={settings.dockScale}
							handleDockScaleChange={settings.handleDockScaleChange}
						/>
					</section>
					<section data-tab="clipboard" hidden={shown !== "clipboard"}>
						<ClipboardTab
							enabled={settings.clipboardEnabled}
							toggleEnabled={settings.toggleClipboard}
							incognito={settings.clipboardIncognito}
							toggleIncognito={settings.toggleClipboardIncognito}
							limit={settings.clipboardLimit}
							changeLimit={settings.changeClipboardLimit}
							retentionHours={settings.clipboardRetentionHours}
							changeRetention={settings.changeClipboardRetention}
							clearHistory={settings.clearClipboardHistory}
							groupFiles={settings.clipboardGroupFiles}
							toggleGroupFiles={settings.toggleClipboardGroupFiles}
							thumbSize={settings.clipboardThumbSize}
							changeThumbSize={settings.changeClipboardThumbSize}
							position={settings.clipboardPosition}
							changePosition={settings.changeClipboardPosition}
							shortcut={settings.clipboardShortcut}
							changeShortcut={settings.changeClipboardShortcut}
							saveSetting={settings.saveSetting}
							notchOn={settings.notchEnabled}
						/>
					</section>
					<section data-tab="files" hidden={shown !== "files"}>
						<FilesTab saveSetting={settings.saveSetting} />
					</section>
					<section data-tab="overlays" hidden={shown !== "overlays"}>
						<OverlaysTab
							volumeOverlayEnabled={settings.volumeOverlayEnabled}
							toggleVolumeOverlay={settings.toggleVolumeOverlay}
							volumeEdgeEnabled={settings.volumeEdgeEnabled}
							toggleVolumeEdge={settings.toggleVolumeEdge}
							brightnessOverlayEnabled={settings.brightnessOverlayEnabled}
							toggleBrightnessOverlay={settings.toggleBrightnessOverlay}
							brightnessEdgeEnabled={settings.brightnessEdgeEnabled}
							toggleBrightnessEdge={settings.toggleBrightnessEdge}
						/>
					</section>
					<section data-tab="about" hidden={shown !== "about"}>
						<AboutTab
							appVersion={settings.appVersion}
							autoUpdate={settings.autoUpdate}
							toggleAutoUpdate={settings.toggleAutoUpdate}
							updateStatus={settings.updateStatus}
							updateVersion={settings.updateVersion}
							checkForUpdates={settings.checkForUpdates}
							installUpdate={settings.installUpdate}
							exportStatus={settings.exportStatus}
							importStatus={settings.importStatus}
							handleExportSettings={settings.handleExportSettings}
							handleImportSettings={settings.handleImportSettings}
						/>
					</section>
					{shown && PAGE_KEYS[shown] && (
						<div className="settings-page-reset">
							<button
								onClick={() =>
									settings.resetPage(TABS.find((t) => t.id === shown)?.label ?? "", PAGE_KEYS[shown] ?? [])
								}
							>
								<RotateCcw size={12} strokeWidth={1.75} />
								Reset this page
							</button>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

createRoot(document.getElementById("root") as HTMLElement).render(
	<StrictMode>
		<SettingsApp />
	</StrictMode>
);
