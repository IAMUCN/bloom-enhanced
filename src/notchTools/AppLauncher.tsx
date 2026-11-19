import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Search } from "lucide-react";
import type { ToolProps } from "../tools";

export type App = { name: string; path: string; icon?: string | null };

/** App launcher: search installed apps; Enter opens the first match. */
export default function AppLauncher({ setPinned }: ToolProps) {
	const [apps, setApps] = useState<App[]>([]);
	const [q, setQ] = useState("");
	useEffect(() => {
		invoke<App[]>("get_installed_apps").then(setApps).catch(() => {});
	}, []);
	const words = q.toLowerCase().trim();
	const hits = (words ? apps.filter((a) => a.name.toLowerCase().includes(words)) : apps).slice(0, 30);
	const open = (a: App) => invoke("launch_new_instance", { appPath: a.path, appName: a.name }).catch(() => {});
	return (
		<div style={{ display: "contents" }}>
			<label className="nt-input nt-row" style={{ padding: "5px 10px" }}>
				<Search size={13} className="nt-muted" />
				<input
					style={{ all: "unset", flex: 1 }}
					placeholder="Search apps"
					value={q}
					aria-label="Search apps"
					onFocus={() => setPinned(true)}
					onBlur={() => setPinned(false)}
					onChange={(e) => setQ(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && hits[0] && open(hits[0])}
				/>
			</label>
			<div className="nt-list" role="list">
				{hits.map((a) => (
					<button key={a.path} type="button" role="listitem" className="nt-card nt-row" style={{ border: "none", font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", padding: "5px 10px" }} onClick={() => open(a)}>
						{a.icon ? <img src={a.icon.startsWith("data:") ? a.icon : `data:image/png;base64,${a.icon}`} alt="" width={18} height={18} /> : <span style={{ width: 18 }} />}
						<span className="nt-grow">{a.name}</span>
					</button>
				))}
				{!hits.length && <div className="nt-muted">{apps.length ? "No app matches." : "Reading your apps…"}</div>}
			</div>
		</div>
	);
}
