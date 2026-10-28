import { describe, expect, test } from "bun:test";
import {
	dockIconKey,
	matchesPackagedExecutable,
	mergeTrayApps,
	selectDockTrayApps,
	type AppInfo,
	type TrayApp
} from "../src/dockApps";
const tray: TrayApp = {
	name: "Discord",
	path: "C:\\Apps\\Discord.exe",
	tray_ids: ["42"],
	window_handles: [11, 12]
};
const windowApp: AppInfo = {
	name: "Discord",
	path: "com.squirrel.Discord.Discord",
	icon: null,
	is_running: true,
	hwnd: 11,
	all_hwnds: [[11, "Discord"]]
};
test("a running pinned browser uses the live icon name without sharing another web app's icon", () => {
	const pin = {
		path: "C:\\Browser\\chrome.exe",
		name: "Chrome",
		icon_name: "Google Chrome",
		hwnd: 12
	};
	expect(dockIconKey(pin, true)).toBe("C:\\Browser\\chrome.exe:google chrome");
	expect(dockIconKey({ ...pin, icon_name: "YouTube" }, true)).not.toBe(dockIconKey(pin, true));
	expect(dockIconKey({ ...pin, icon_name: undefined }, true)).toBe(
		"C:\\Browser\\chrome.exe:chrome"
	);
	expect(dockIconKey(pin, false)).toBe("C:\\Browser\\chrome.exe-12");
	expect(dockIconKey({ ...pin, icon_path: "C:\\Updated\\chrome.exe" }, true)).toBe(
		"C:\\Updated\\chrome.exe:google chrome"
	);
});
describe("dock tray lifecycle", () => {
	test("merges a helper-owned Steam window through its resolved executable identity", () => {
		const steam = { ...tray, path: "C:\\Steam\\steam.exe", window_handles: [22] };
		const helper = {
			...windowApp,
			path: "c:/steam/Steam.exe",
			hwnd: 33,
			all_hwnds: [[33, "Steam"]] as [number, string][]
		};
		const visible = selectDockTrayApps([helper], [steam], () => false);
		expect(visible).toEqual([steam]);
		expect(mergeTrayApps([helper], visible)).toMatchObject([
			{ path: helper.path, tray_ids: ["42"], is_background: false }
		]);
	});
	test("does not attach a shared browser tray by executable path alone", () => {
		const browserTray = { ...tray, path: "C:\\Browser\\brave.exe" };
		const browserWindow = {
			...windowApp,
			path: browserTray.path,
			hwnd: 99,
			all_hwnds: [[99, "Browser"]] as [number, string][]
		};
		expect(mergeTrayApps([browserWindow], [browserTray])).toHaveLength(2);
	});
	test("does not show every tray app when the dock starts", () => {
		expect(selectDockTrayApps([], [tray], () => false)).toEqual([]);
	});
	// Quick Look keeps its process and tray icon alive after the preview closes.
	const quickLookTray: TrayApp = {
		name: "QuickLook",
		path: "C:\\Program Files\\WindowsApps\\QuickLook\\QuickLook.exe",
		tray_ids: ["7"],
		window_handles: [70, 71]
	};
	const quickLookPreview: AppInfo = {
		name: "QuickLook",
		path: quickLookTray.path,
		icon: null,
		is_running: true,
		hwnd: 71,
		all_hwnds: [[71, "QuickLook - photo.png"]]
	};
	const dock = (windows: AppInfo[], isPinned = () => false) =>
		mergeTrayApps(windows, selectDockTrayApps(windows, [quickLookTray], isPinned));
	test("shows Quick Look as a normal window while its preview is open", () => {
		expect(dock([quickLookPreview])).toMatchObject([
			{ path: quickLookTray.path, is_background: false, tray_ids: ["7"] }
		]);
	});
	test("removes unpinned Quick Look when the preview closes but its tray icon remains", () => {
		dock([quickLookPreview]);
		expect(dock([])).toEqual([]);
	});
	test("removes an unpinned app closed to the tray", () => {
		expect(selectDockTrayApps([windowApp], [tray], () => false)).toEqual([tray]);
		expect(mergeTrayApps([], selectDockTrayApps([], [tray], () => false))).toEqual([]);
	});
	test("keeps pinned Quick Look as a background dot, never as an open window", () => {
		const apps = dock([], () => true);
		expect(apps).toHaveLength(1);
		expect(apps[0]).toMatchObject({ is_running: true, is_background: true, all_hwnds: [] });
		expect(apps[0].hwnd).toBeUndefined();
	});
	test("shows a pinned app's background dot immediately at startup", () => {
		const visible = selectDockTrayApps([], [tray], (app) => app.path === tray.path);
		expect(mergeTrayApps([], visible)[0]).toMatchObject({
			is_background: true,
			tray_ids: ["42"]
		});
	});
	test("does not treat an unrelated same-name window as opening the tray app", () => {
		const other = { ...windowApp, hwnd: 99, all_hwnds: [[99, "Discord"]] as [number, string][] };
		expect(selectDockTrayApps([other], [tray], () => false)).toEqual([]);
	});
	test("keeps a zero-window app running with exactly the tray identity", () => {
		const apps = mergeTrayApps([], [tray]);
		expect(apps).toHaveLength(1);
		expect(apps[0]).toMatchObject({
			is_running: true,
			is_background: true,
			all_hwnds: [],
			tray_ids: ["42"]
		});
		expect(apps[0].hwnd).toBeUndefined();
	});
	test("reconciles a shell-id window with its executable tray without a duplicate", () => {
		const apps = mergeTrayApps([windowApp], [tray]);
		expect(apps).toHaveLength(1);
		expect(apps[0]).toMatchObject({ path: windowApp.path, is_background: false, tray_ids: ["42"] });
		expect(windowApp.tray_ids).toBeUndefined();
	});
	test("returns to background and disappears after a true exit", () => {
		expect(mergeTrayApps([windowApp], [tray])[0].is_background).toBe(false);
		expect(mergeTrayApps([], [tray])[0].is_background).toBe(true);
		expect(mergeTrayApps([], [])).toEqual([]);
	});
	test("does not collapse independent PWAs or attach a shared tray to one of them", () => {
		const second = {
			...windowApp,
			name: "Other PWA",
			path: "other-id",
			hwnd: 12,
			all_hwnds: [[12, "Other"]] as [number, string][]
		};
		const apps = mergeTrayApps([windowApp, second], [tray]);
		expect(apps).toHaveLength(2);
		expect(apps.every((a) => !a.is_background && a.tray_ids === undefined)).toBe(true);
	});
	test("does not match a different process by display name", () => {
		const other = { ...windowApp, hwnd: 99, all_hwnds: [[99, "Discord"]] as [number, string][] };
		expect(mergeTrayApps([other], [tray])).toHaveLength(2);
	});
});

describe("packaged executable identity", () => {
	const pin = { name: "Snipping Tool", path: "Microsoft.ScreenSketch_8wekyb3d8bbwe!App" };
	const executable = {
		name: "Snipping Tool",
		path: String.raw`C:\Program Files\WindowsApps\Microsoft.ScreenSketch_11.2.3.0_x64__8wekyb3d8bbwe\SnippingTool.exe`
	};
	test("matches a package executable to its shell identity in either direction", () => {
		expect(matchesPackagedExecutable(pin, executable)).toBe(true);
		expect(matchesPackagedExecutable(executable, pin)).toBe(true);
	});
	test("keeps distinct apps and publishers separate", () => {
		expect(matchesPackagedExecutable(pin, { ...executable, name: "Other app" })).toBe(false);
		expect(
			matchesPackagedExecutable(pin, {
				...executable,
				path: executable.path.replace("8wekyb3d8bbwe", "otherpublisher")
			})
		).toBe(false);
		expect(
			matchesPackagedExecutable(pin, { ...pin, path: pin.path.replace("!App", "!Other") })
		).toBe(false);
		expect(
			matchesPackagedExecutable(pin, {
				...executable,
				path: executable.path.replace("WindowsApps", "OtherFolder")
			})
		).toBe(false);
		expect(matchesPackagedExecutable({ ...pin, name: "" }, { ...executable, name: "" })).toBe(
			false
		);
	});
	test("merges a packaged window and executable tray without a second dock item", () => {
		const window = {
			...windowApp,
			...pin,
			hwnd: 55,
			all_hwnds: [[55, pin.name]] as [number, string][]
		};
		const icon = { ...tray, ...executable, window_handles: [] };
		expect(selectDockTrayApps([window], [icon], () => false)).toEqual([icon]);
		expect(mergeTrayApps([window], [icon])).toMatchObject([
			{ path: pin.path, tray_ids: icon.tray_ids }
		]);
		expect(mergeTrayApps([window], [icon])).toHaveLength(1);
	});
});
