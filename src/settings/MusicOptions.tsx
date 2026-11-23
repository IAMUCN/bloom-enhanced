import { Music, Minimize2, LayoutList, Sparkles, Circle } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { Section } from "./Section";

const Switch = ({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) => (
	<label className="toggle-switch">
		<input type="checkbox" checked={on} onChange={onChange} aria-label={label} />
		<span className="slider"></span>
	</label>
);

export interface MusicOptionsProps {
	musicModeEnabled: boolean;
	toggleMusicMode: () => void;
	musicCompactNotch: boolean;
	toggleMusicCompactNotch: () => void;
	mediaLayout: "classic" | "compact";
	toggleMediaLayout: (layout: "classic" | "compact") => void;
	mediaAmbienceEnabled: boolean;
	toggleAmbience: () => void;
	mediaCompactGlowEnabled: boolean;
	toggleCompactGlow: () => void;
}

/** Media tool page: the music widget and its look (moved out of the Notch page). */
export function MusicOptions(p: MusicOptionsProps) {
	return (
		<>
			<Section title="Now Playing">
				<SettingRow icon={Music} label="Music Mode" desc="Interactive live music widget" divider={p.musicModeEnabled}>
					<Switch on={p.musicModeEnabled} onChange={p.toggleMusicMode} label="Music mode" />
				</SettingRow>
				{p.musicModeEnabled && (
					<>
						<SettingRow icon={Minimize2} label="Compact Mode" desc="Show visualizer & artwork when collapsed">
							<Switch on={p.musicCompactNotch} onChange={p.toggleMusicCompactNotch} label="Compact mode" />
						</SettingRow>
						<SettingRow icon={LayoutList} label="Media Layout" desc="Choose expanded player style">
							<div className="unit-toggle-minimal wide">
								{(["classic", "compact"] as const).map((l) => (
									<span key={l} className={p.mediaLayout === l ? "active" : ""} onClick={() => p.toggleMediaLayout(l)}>
										{l === "classic" ? "Classic" : "Compact"}
									</span>
								))}
							</div>
						</SettingRow>
						<SettingRow icon={Sparkles} label="Ambient Glow" desc="Colored glow behind expanded album art">
							<Switch on={p.mediaAmbienceEnabled} onChange={p.toggleAmbience} label="Ambient glow" />
						</SettingRow>
						<SettingRow icon={Circle} label="Compact Glow" desc="Glow around collapsed thumbnail" divider={false}>
							<Switch on={p.mediaCompactGlowEnabled} onChange={p.toggleCompactGlow} label="Compact glow" />
						</SettingRow>
					</>
				)}
			</Section>
		</>
	);
}
