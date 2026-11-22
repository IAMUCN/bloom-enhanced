import { Download, RefreshCw, Bug, UserRound } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { GithubIcon } from "../icons";
import { SettingRow } from "./SettingRow";

/** The open-source projects LotusNotch is built from. */
const CREDITS = [
	["Bloom", "SehajveerSingh2005", "The notch, dock and overlays this app is built on", "https://github.com/SehajveerSingh2005/bloom"],
	["Edge-Drop", "Deepender25", "The edge shelf for what you copy and drag", "https://github.com/Deepender25/Edge-Drop"],
	["OrbitDrop", "i3sam", "The radial menu for converting and acting on files", "https://github.com/i3sam/OrbitDrop"]
] as const;

const AUTHOR_URL = "https://github.com/IAMUCN";
const REPO_URL = "https://github.com/IAMUCN/bloom-enhanced";

/** Where to find the code, report a problem or reach the author. */
const LINKS = [
	[GithubIcon, "Source code", "github.com/IAMUCN/bloom-enhanced", REPO_URL],
	[Bug, "Report a problem or suggest something", "Open an issue on GitHub", `${REPO_URL}/issues`],
	[UserRound, "Contact", "IAMUCN on GitHub", AUTHOR_URL]
] as const;

interface AboutTabProps {
	appVersion: string;
	autoUpdate: boolean;
	toggleAutoUpdate: () => void;
	updateStatus: string;
	updateVersion: string;
	checkForUpdates: () => void;
	installUpdate: () => void;
}

export function AboutTab({
	appVersion,
	autoUpdate,
	toggleAutoUpdate,
	updateStatus,
	updateVersion,
	checkForUpdates,
	installUpdate
}: AboutTabProps) {
	const getUpdateLabel = () => {
		switch (updateStatus) {
			case "checking":
				return "Checking...";
			case "available":
				return `Update Available (v${updateVersion})`;
			case "uptodate":
				return "LotusNotch is up to date";
			case "downloading":
				return "Downloading Update...";
			case "installing":
				return "Installing...";
			case "error":
				return "No updates found";
			default:
				return "Check for Updates";
		}
	};

	const getUpdateDesc = () =>
		updateStatus === "available"
			? "Click to install and restart"
			: `Currently running v${appVersion}`;

	return (
		<div className="about-tab-container">
			<div className="about-header">
				<img src="/lotusnotch.png" className="about-logo" alt="LotusNotch logo" draggable={false} />
				<h1 className="about-title">LotusNotch</h1>
				<p className="about-version">Version {appVersion}</p>
				<p className="about-credit">
					Made with <span className="about-heart">❤️</span> by{" "}
					<button className="about-author" onClick={() => openUrl(AUTHOR_URL)} title="IAMUCN on GitHub">
						<GithubIcon size={12} />
						<span>IAMUCN</span>
					</button>
				</p>
			</div>

			<div className="setting-group-label">Software Updates</div>
			<div className="setting-group">
				<SettingRow icon={Download} label="Auto Update" desc="Update automatically on startup">
					<label className="toggle-switch">
						<input type="checkbox" checked={autoUpdate} onChange={toggleAutoUpdate} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				<SettingRow
					icon={RefreshCw}
					label={getUpdateLabel()}
					desc={getUpdateDesc()}
					action
					divider={false}
					onClick={() => (updateStatus === "available" ? installUpdate() : checkForUpdates())}
				/>
			</div>

			<div className="setting-group-label setting-group-label--spaced">Links</div>
			<div className="setting-group">
				{LINKS.map(([icon, label, desc, url], i) => (
					<SettingRow key={label} icon={icon} label={label} desc={desc} action divider={i < LINKS.length - 1} onClick={() => openUrl(url)} />
				))}
			</div>

			<div className="setting-group-label setting-group-label--spaced">Built On</div>
			<div className="setting-group">
				{CREDITS.map(([name, owner, desc, url], i) => (
					<SettingRow
						key={name}
						icon={GithubIcon}
						label={`${name} by ${owner}`}
						desc={desc}
						action
						divider={i < CREDITS.length - 1}
						onClick={() => openUrl(url)}
					/>
				))}
			</div>

			<p className="about-footer">
				A product of{" "}
				<button className="about-author" onClick={() => openUrl(AUTHOR_URL)} title="IAMUCN on GitHub">
					<GithubIcon size={12} />
					<span>UCN INDUSTRIES</span>
				</button>
			</p>
		</div>
	);
}
