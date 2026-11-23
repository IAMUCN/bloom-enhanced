import { StrictMode, useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { motion, AnimatePresence } from "framer-motion";
import { listen, emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import "./Overlay.css";
import "./lightFixes.css";
import "./accentFixes.css";
import { initTheme } from "./theme";
import { createRegionSender } from "./windowRegion";

// The overlay window shows only the first-run / new-version splash and the
// auto-update screen. Its volume and brightness HUDs (and the app mixer)
// were removed on 2026-11-15: the notch's Command Center has both sliders,
// and Windows shows its own flyout for the keys.

function OverlayApp() {
	useEffect(() => {
		return initTheme();
	}, []);

	type Mode = "idle" | "splash" | "updating";
	const [mode, setMode] = useState<Mode>("idle");
	const [updateStatus, setUpdateStatus] = useState<string>("checking");
	const [updateProgress, setUpdateProgress] = useState(0);
	const hideWindowTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const splashActiveRef = useRef(false);

	// ── Splash Detection ──
	useEffect(() => {
		const firstRun = localStorage.getItem("bloom-first-run") === null;
		const storedVersion = localStorage.getItem("bloom-app-version");

		const showSplash = (version?: string) => {
			splashActiveRef.current = true;
			setMode("splash");
			invoke("set_splash_fullscreen", { fullscreen: true });
			if (version) localStorage.setItem("bloom-app-version", version);
			setTimeout(() => emit("splash-done"), 2800);
		};

		// First run or old version without version key — splash immediately
		if (firstRun || storedVersion === null) {
			showSplash();
			getVersion()
				.then((v) => localStorage.setItem("bloom-app-version", v))
				.catch(() => {});
			return;
		}

		getVersion()
			.then((currentVersion) => {
				if (storedVersion !== currentVersion) showSplash(currentVersion);
				else emit("splash-done");
			})
			.catch(() => emit("splash-done"));
	}, []);

	const onSplashComplete = useCallback(() => {
		localStorage.setItem("bloom-first-run", "done");
		setTimeout(() => {
			splashActiveRef.current = false;
			setMode("idle");
			invoke("set_splash_fullscreen", { fullscreen: false });
		}, 300);
	}, []);

	// ── Auto-update screen ──
	useEffect(() => {
		const preventContext = (e: MouseEvent) => e.preventDefault();
		document.addEventListener("contextmenu", preventContext);
		const autoUpdatePromise = listen<{ status: string; progress?: number }>("auto-update-status", (event) => {
			const { status, progress } = event.payload;
			setUpdateStatus(status);
			if (progress !== undefined) setUpdateProgress(progress);
			if (status === "checking" || status === "downloading" || status === "installing") {
				splashActiveRef.current = true;
				setMode("updating");
				invoke("set_splash_fullscreen", { fullscreen: true });
			} else if (status === "done") {
				splashActiveRef.current = false;
				setMode("idle");
				invoke("set_splash_fullscreen", { fullscreen: false });
			}
		});
		return () => {
			autoUpdatePromise.then((fn) => fn());
			document.removeEventListener("contextmenu", preventContext);
		};
	}, []);

	// ── Window visibility: hidden while idle ──
	useEffect(() => {
		const syncWindow = async () => {
			try {
				const appWindow = getCurrentWebviewWindow();
				if (hideWindowTimeoutRef.current) {
					clearTimeout(hideWindowTimeoutRef.current);
					hideWindowTimeoutRef.current = null;
				}
				if (mode === "idle") {
					// Wait for the exit animation to finish before hiding
					hideWindowTimeoutRef.current = setTimeout(() => invoke("hide_overlay"), 400);
				} else {
					await invoke("sync_overlay_position");
					await appWindow.show();
				}
			} catch (e) {
				console.error("Window management error:", e);
			}
		};
		// Don't manage window visibility during splash — Rust handles it
		if (mode !== "splash" && !splashActiveRef.current) syncWindow();
		return () => {
			if (hideWindowTimeoutRef.current) clearTimeout(hideWindowTimeoutRef.current);
		};
	}, [mode]);

	const sendOverlayRegion = useMemo(
		() =>
			createRegionSender((rects) => {
				invoke("set_window_region", { rects }).catch(() => {});
			}, 700, 34),
		[]
	);

	// Clip the full-screen overlay to what it draws (see window_region.rs):
	// the splashes cover the screen, otherwise nothing.
	useEffect(() => {
		const full = mode === "splash" || mode === "updating";
		sendOverlayRegion(full ? [{ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight }] : []);
	});

	return (
		<div className="overlay-container">
			{/* Splash Screen */}
			<AnimatePresence>
				{mode === "splash" && (
					<motion.div
						className="splash-screen"
						initial={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.3 }}
					>
						<motion.img
							src="/lotusnotch.png"
							className="splash-logo"
							draggable={false}
							initial={{ scale: 0, opacity: 0, rotate: 0 }}
							animate={{
								scale: [0, 1.1, 1, 1.2, 1, 1, 0.2],
								opacity: [0, 1, 1, 1, 1, 1, 0],
								rotate: [0, 0, 0, 0, 0, 540, 1080]
							}}
							transition={{
								duration: 3.2,
								times: [0, 0.17, 0.3, 0.43, 0.56, 0.78, 1],
								ease: ["easeOut", "easeInOut", "easeInOut", "easeInOut", "linear", "linear"]
							}}
							onAnimationComplete={onSplashComplete}
						/>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Auto-Update Splash */}
			<AnimatePresence>
				{mode === "updating" && (
					<motion.div
						className="update-splash"
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.3 }}
					>
						<img src="/lotusnotch.png" className="update-splash-logo" alt="LotusNotch" />
						<p className="update-splash-text">
							{updateStatus === "checking" && "Checking for updates..."}
							{updateStatus === "downloading" && `Downloading update... ${updateProgress}%`}
							{updateStatus === "installing" && "Installing update..."}
						</p>
						{updateStatus === "downloading" && (
							<div className="update-progress-bar">
								<div className="update-progress-fill" style={{ width: `${updateProgress}%` }} />
							</div>
						)}
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<OverlayApp />
	</StrictMode>
);
