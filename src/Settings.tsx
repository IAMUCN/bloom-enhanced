import { StrictMode, useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Effect } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
	X,
	Settings2,
	Palette,
	PanelTop,
	PanelBottom,
	LayoutGrid,
	Info,
	Megaphone,
	ClipboardList,
	Orbit,
	Search,
	RotateCcw,
	Keyboard
} from "lucide-react";
import {
	useSettings,
	GeneralTab,
	AppearanceTab,
	NotchTab,
	DockTab,
	ClipboardTab,
	FilesTab,
	AboutTab
} from "./settings/index";
import type { SettingsTab } from "./settings/index";
import { useAnnouncement } from "./hooks/useAnnouncement";
import { PickTools } from "./settings/PickTools";
import { ToolsTab } from "./settings/ToolsTab";
import { ShortcutsTab } from "./settings/ShortcutsTab";
import { useSettingsSync } from "./hooks/useSettingsSync";
import { MAX_TABS, builtInTabCount, parseEnabledTools } from "./tools";
import { initTheme } from "./theme";
import { FeaturePreview } from "./settings/FeaturePreview";
import { searchSettings, type SettingEntry } from "./settings/searchIndex";
import "./Settings.css";

const appWindow = getCurrentWebviewWindow();

type NavItem = { id: SettingsTab; label: string; icon: typeof Settings2; sub?: boolean };

/** The sidebar, in parts (user, 2026-11-15): the notch and its tools, then
 *  each module on its own, then the app-wide pages. About sits at the foot. */
const NAV: NavItem[][] = [
	[
		{ id: "notch", label: "Notch", icon: PanelTop },
		{ id: "tools", label: "Tools", icon: LayoutGrid, sub: true }
	],
	[{ id: "dock", label: "Dock", icon: PanelBottom }],
	[{ id: "clipboard", label: "Shelf", icon: ClipboardList }],
	[{ id: "files", label: "Radial Menu", icon: Orbit }],
	[
		{ id: "general", label: "General", icon: Settings2 },
		{ id: "shortcuts", label: "Shortcuts", icon: Keyboard },
		{ id: "appearance", label: "Appearance", icon: Palette }
	]
];
const TABS: NavItem[] = [...NAV.flat(), { id: "about", label: "About", icon: Info }];

const TAB_COPY: Record<SettingsTab, string> = {
	general: "How LotusNotch starts, runs and saves battery.",
	appearance: "Theme, size and motion for every part of LotusNotch.",
	notch: "How the notch looks, opens and what its clock bar shows.",
	tools: "The tools in the notch's tab bar, in their order.",
	shortcuts: "Keys for the notch, every tool and every quick setting.",
	dock: "The taskbar replacement at the bottom of the screen.",
	clipboard: "Everything you copy, kept on this PC.",
	files: "Convert and act on files from a ring around the pointer.",
	about: "Version, updates and your settings data."
};

/** Keys each page's "Reset this page" puts back to defaults. */
const PAGE_KEYS: Partial<Record<SettingsTab, string[]>> = {
	general: [
		"bloom-time-format-24h",
		"bloom-show-update-indicator",
		"bloom-low-battery-threshold",
		"bloom-keep-windows-loaded"
	],
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
	files: ["bloom-files-"]
};

/** A search result's row on its page: the row (or folded section, or group
 *  heading) with that label; between rows with the same label, the one whose
 *  description is part of the entry's. */
function rowFor(root: HTMLElement | null, hit: SettingEntry): HTMLElement | null {
	if (!root) return null;
	const labelOf = (el: HTMLElement) =>
		(el.matches(".setting-item") ? el.querySelector(".setting-label")?.textContent : el.firstChild?.textContent)?.trim() ?? "";
	const rows = Array.from(
		root.querySelectorAll<HTMLElement>(".setting-item, .settings-disclosure > summary, .setting-group-label")
	).filter((el) => (hit.match ? labelOf(el).startsWith(hit.match) : labelOf(el) === hit.label));
	const desc = hit.desc.toLowerCase();
	return (
		rows.find((el) => {
			const own = el.querySelector(".setting-desc")?.textContent?.trim().toLowerCase();
			return !!own && desc.includes(own);
		}) ??
		rows[0] ??
		null
	);
}

function SettingsApp() {
	const [activeTab, setActiveTab] = useState<SettingsTab>("general");
	const [previewFocus, setPreviewFocus] = useState("");
	const contentRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const [query, setQuery] = useState("");
	// While searching no page shows; the results do. Only the page shown is
	// loaded; search reads the list of every setting (searchIndex.ts).
	const shown = query.trim() ? null : activeTab;
	const pageName = (tab: SettingsTab) => TABS.find((t) => t.id === tab)?.label ?? "";
	const hits = searchSettings(query, pageName);

	const jumpTo = (hit: SettingEntry) => {
		setQuery("");
		setActiveTab(hit.tab);
		// The page renders first; a row that only shows while its feature is on
		// may not be there, and the page simply opens.
		setTimeout(() => {
			const row = rowFor(contentRef.current, hit);
			if (!row) return;
			for (let el = row.parentElement; el; el = el.parentElement)
				if (el instanceof HTMLDetailsElement) el.open = true;
			row.scrollIntoView({ block: "center", behavior: "smooth" });
			row.classList.remove("search-hit");
			void row.offsetWidth;
			row.classList.add("search-hit");
			row.querySelector<HTMLElement>("input, button, [tabindex='0']")?.focus({ preventScroll: true });
		}, 60);
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
				else invoke("close_settings_window").catch(() => {});
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);
	const settings = useSettings();
	// Each module's master switch sits in its page header.
	const [filesOn, setFilesOn] = useState(() => localStorage.getItem("bloom-files-enabled") !== "false");
	useSettingsSync({ "bloom-files-enabled": setFilesOn });
	const modules: Partial<Record<SettingsTab, { on: boolean; toggle: () => void }>> = {
		notch: { on: settings.notchEnabled, toggle: settings.toggleNotch },
		dock: { on: settings.dockEnabled, toggle: settings.toggleDock },
		clipboard: { on: settings.clipboardEnabled, toggle: settings.toggleClipboard },
		files: {
			on: filesOn,
			toggle: () => {
				setFilesOn(!filesOn);
				settings.saveSetting("bloom-files-enabled", String(!filesOn));
			}
		}
	};
	// The tool page open inside Tools (null = the list).
	const [toolPage, setToolPage] = useState<string | null>(null);
	const tabCount =
		builtInTabCount((k) =>
			k === "bloom-clipboard-position"
				? settings.clipboardPosition
				: k === "bloom-clipboard-enabled"
					? String(settings.clipboardEnabled)
					: localStorage.getItem(k)
		) + parseEnabledTools(localStorage.getItem("bloom-tools-enabled")).length;
	// First run: "Pick your tools", once (bloom-tools-picked).
	const [pickTools, setPickTools] = useState(() => localStorage.getItem("bloom-tools-picked") !== "true");
	const { announcement, dismissed, dismiss } = useAnnouncement();

	useEffect(() => {
		return initTheme({ followSystem: true });
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
		if (contentRef.current) contentRef.current.scrollTop = 0;
	}, [activeTab]);

	const handleClose = async (e: React.MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		try {
			await invoke("close_settings_window");
		} catch {}
	};

	return (
		<div className="settings-container" style={{ zoom: settings.scale }}>
			{pickTools && <PickTools saveSetting={settings.saveSetting} onDone={() => setPickTools(false)} />}
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
					<label className="settings-search">
						<Search size={14} strokeWidth={1.75} />
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
					<nav className="settings-nav" aria-label="Settings pages">
						{NAV.map((part, i) => (
							<div key={i} className="settings-nav-part">
								{part.map(({ id, label, icon: Icon, sub }) => {
									const module = modules[id];
									return (
										<button
											key={id}
											className={`sidebar-tab${sub ? " sub" : ""}${shown === id ? " active" : ""}`}
											aria-current={shown === id ? "page" : undefined}
											onClick={() => {
												setQuery("");
												setActiveTab(id);
												setToolPage(null);
											}}
										>
											<span className="sidebar-tab-icon">
												<Icon size={16} strokeWidth={1.75} />
											</span>
											<span className="sidebar-tab-label">{label}</span>
											{module && (
												<span
													className={`sidebar-module-dot${module.on ? " on" : ""}`}
													title={module.on ? `${label} is on` : `${label} is off`}
												/>
											)}
										</button>
									);
								})}
							</div>
						))}
					</nav>
					<button
						className={`sidebar-tab sidebar-about${shown === "about" ? " active" : ""}`}
						aria-current={shown === "about" ? "page" : undefined}
						onClick={() => {
							setQuery("");
							setActiveTab("about");
						}}
					>
						<span className="sidebar-tab-icon">
							<Info size={16} strokeWidth={1.75} />
						</span>
						<span className="sidebar-tab-label">About</span>
						<span className="sidebar-version">{settings.appVersion ? `v${settings.appVersion}` : ""}</span>
					</button>
				</div>

				<div className="settings-content" ref={contentRef} onChangeCapture={(event) => {
					const target = event.target as HTMLElement;
					const row = target.closest(".setting-item");
					let label = row?.querySelector(".setting-label")?.textContent;
					if (!label && target.closest(".settings-disclosure-standalone")) label = "Status Widgets";
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
						!(shown === "tools" && toolPage) && (
							<>
								<header className="settings-page-heading">
									<div>
										<h1>{TABS.find((tab) => tab.id === shown)?.label}</h1>
										<p>{TAB_COPY[shown]}</p>
									</div>
									{modules[shown] && (
										<label className="toggle-switch settings-master" title={`Turn ${TABS.find((t) => t.id === shown)?.label} on or off`}>
											<input
												type="checkbox"
												checked={modules[shown]!.on}
												onChange={modules[shown]!.toggle}
												aria-label={`${TABS.find((t) => t.id === shown)?.label} on`}
											/>
											<span className="slider"></span>
										</label>
									)}
									{shown === "tools" && (
										<span className={`settings-count${tabCount >= MAX_TABS ? " full" : ""}`} title="Tools in the tab bar">
											{tabCount} / {MAX_TABS}
										</span>
									)}
								</header>
								{modules[shown] && !modules[shown]!.on && (
									<p className="settings-module-off">
										{TABS.find((t) => t.id === shown)?.label} is off. Turn it on above to change its settings.
									</p>
								)}
								{(!modules[shown] || modules[shown]!.on) && (
									<FeaturePreview tab={shown} settings={settings} focus={previewFocus} />
								)}
							</>
						)
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
					{shown === "general" && (
						<section data-tab="general">
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
								saveSetting={settings.saveSetting}
							/>
						</section>
					)}
					{shown === "appearance" && (
						<section data-tab="appearance">
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
					)}
					{shown === "notch" && (
						<section data-tab="notch">
							<NotchTab
								saveSetting={settings.saveSetting}
								notchEnabled={settings.notchEnabled}
								notchMode={settings.notchMode}
								setNotchModeValue={settings.setNotchModeValue}
								notchEdgeDelay={settings.notchEdgeDelay}
								handleNotchEdgeDelayChange={settings.handleNotchEdgeDelayChange}
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
								notchStyle={settings.notchStyle}
								handleNotchStyleChange={settings.handleNotchStyleChange}
							/>
						</section>
					)}
					{shown === "dock" && (
						<section data-tab="dock">
							<DockTab
								dockEnabled={settings.dockEnabled}
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
					)}
					{shown === "clipboard" && (
						<section data-tab="clipboard">
							<ClipboardTab
								enabled={settings.clipboardEnabled}
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
					)}
					{shown === "files" && (
						<section data-tab="files">
							<FilesTab saveSetting={settings.saveSetting} />
						</section>
					)}
					{shown === "tools" && (
						<section data-tab="tools">
							<ToolsTab
								saveSetting={settings.saveSetting}
								calendarEnabled={settings.calendarEnabled}
								toggleCalendar={settings.toggleCalendar}
								controlsPanelEnabled={settings.controlsPanelEnabled}
								toggleControlsPanel={settings.toggleControlsPanel}
								devicesPanelEnabled={settings.devicesPanelEnabled}
								toggleDevicesPanel={settings.toggleDevicesPanel}
								musicModeEnabled={settings.musicModeEnabled}
								toggleMusicMode={settings.toggleMusicMode}
								enabledPanelCount={settings.enabledPanelCount}
								timerSoundEnabled={settings.timerSoundEnabled}
								toggleTimerSound={settings.toggleTimerSound}
								openShelf={() => setActiveTab("clipboard")}
								clipboardEnabled={settings.clipboardEnabled}
								clipboardPosition={settings.clipboardPosition}
								page={toolPage}
								setPage={setToolPage}
							/>
						</section>
					)}
					{shown === "shortcuts" && (
						<section data-tab="shortcuts">
							<ShortcutsTab saveSetting={settings.saveSetting} />
						</section>
					)}
					{shown === "about" && (
						<section data-tab="about">
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
					)}
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
