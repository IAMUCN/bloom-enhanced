import { ClipboardList, EyeOff, History, Timer, Trash2 } from "lucide-react";
import { SettingRow } from "./SettingRow";

interface ClipboardTabProps {
	enabled: boolean;
	toggleEnabled: () => void;
	incognito: boolean;
	toggleIncognito: () => void;
	limit: number;
	changeLimit: (limit: number) => void;
	retentionHours: number;
	changeRetention: (hours: number) => void;
	clearHistory: () => void;
}

const LIMITS = [50, 100, 200, 500, 1000];
const RETENTION: [number, string][] = [
	[0, "Never"],
	[1, "After 1 hour"],
	[24, "After 1 day"],
	[168, "After 7 days"],
	[720, "After 30 days"]
];

export function ClipboardTab({
	enabled,
	toggleEnabled,
	incognito,
	toggleIncognito,
	limit,
	changeLimit,
	retentionHours,
	changeRetention,
	clearHistory
}: ClipboardTabProps) {
	return (
		<>
			<div className="setting-group-label">Clipboard</div>
			<div className="setting-group">
				<SettingRow
					icon={ClipboardList}
					label="Clipboard History"
					desc="Record what you copy and show it in the notch's Clipboard panel"
				>
					<label className="toggle-switch">
						<input type="checkbox" checked={enabled} onChange={toggleEnabled} />
						<span className="slider"></span>
					</label>
				</SettingRow>

				{enabled && (
					<SettingRow
						icon={EyeOff}
						label="Incognito"
						desc="Pause recording; nothing copied meanwhile is kept"
						divider={false}
					>
						<label className="toggle-switch">
							<input type="checkbox" checked={incognito} onChange={toggleIncognito} />
							<span className="slider"></span>
						</label>
					</SettingRow>
				)}
			</div>

			<div className="setting-group-label">History</div>
			<div className="setting-group">
				<SettingRow icon={History} label="History Size" desc="Oldest items go first; pinned items stay">
					<select
						className="settings-select"
						value={LIMITS.includes(limit) ? limit : 200}
						onChange={(e) => changeLimit(Number(e.target.value))}
					>
						{LIMITS.map((n) => (
							<option key={n} value={n}>
								{n} items
							</option>
						))}
					</select>
				</SettingRow>

				<SettingRow icon={Timer} label="Auto-Delete" desc="Remove unpinned items after a while">
					<select
						className="settings-select"
						value={RETENTION.some(([h]) => h === retentionHours) ? retentionHours : 0}
						onChange={(e) => changeRetention(Number(e.target.value))}
					>
						{RETENTION.map(([h, label]) => (
							<option key={h} value={h}>
								{label}
							</option>
						))}
					</select>
				</SettingRow>

				<SettingRow
					icon={Trash2}
					label="Clear History"
					desc="Delete every unpinned item now"
					action
					danger
					divider={false}
					onClick={clearHistory}
				/>
			</div>
		</>
	);
}
