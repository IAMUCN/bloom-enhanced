import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Play, Plus, Trash2, X } from "lucide-react";
import type { ToolProps } from "../tools";
import type { App } from "./AppLauncher";
import { useToolData } from "./useToolData";

type Set_ = { id: string; name: string; apps: App[] };

/** Multi-launch: sets of apps that open together (study, gaming…). */
export default function MultiLaunch({ setPinned }: ToolProps) {
	const [data, setData] = useToolData<{ sets: Set_[] }>("launch", { sets: [] });
	const [editing, setEditing] = useState<string | null>(null);
	const [apps, setApps] = useState<App[]>([]);
	const [q, setQ] = useState("");
	useEffect(() => {
		if (editing && !apps.length) invoke<App[]>("get_installed_apps").then(setApps).catch(() => {});
	}, [editing, apps.length]);
	const launch = (s: Set_) => s.apps.forEach((a) => invoke("launch_new_instance", { appPath: a.path, appName: a.name }).catch(() => {}));
	const set = data.sets.find((s) => s.id === editing);
	const update = (fn: (s: Set_) => Set_) => setData((d) => ({ sets: d.sets.map((s) => (s.id === editing ? fn(s) : s)) }));
	if (set) {
		const words = q.toLowerCase().trim();
		const hits = words ? apps.filter((a) => a.name.toLowerCase().includes(words) && !set.apps.some((x) => x.path === a.path)).slice(0, 6) : [];
		return (
			<div style={{ ["--tool-color" as string]: "#C3A6FF", display: "contents" }}>
				<div className="nt-row">
					<input className="nt-input" value={set.name} aria-label="Set name" onFocus={() => setPinned(true)} onBlur={() => setPinned(false)} onChange={(e) => update((s) => ({ ...s, name: e.target.value }))} />
					<button type="button" className="nt-btn primary" onClick={() => (setEditing(null), setQ(""))}>Done</button>
				</div>
				<div className="nt-row" style={{ flexWrap: "wrap" }}>
					{set.apps.map((a) => (
						<button key={a.path} type="button" className="nt-btn" onClick={() => update((s) => ({ ...s, apps: s.apps.filter((x) => x.path !== a.path) }))} aria-label={`Remove ${a.name}`}>
							{a.name} <X size={11} />
						</button>
					))}
				</div>
				<input className="nt-input" placeholder="Add an app: type its name" value={q} aria-label="Find an app" onFocus={() => setPinned(true)} onBlur={() => setPinned(false)} onChange={(e) => setQ(e.target.value)} />
				<div className="nt-row" style={{ flexWrap: "wrap" }}>
					{hits.map((a) => (
						<button key={a.path} type="button" className="nt-btn" onClick={() => (update((s) => ({ ...s, apps: [...s.apps, { name: a.name, path: a.path }] })), setQ(""))}>
							<Plus size={11} /> {a.name}
						</button>
					))}
				</div>
			</div>
		);
	}
	return (
		<div style={{ ["--tool-color" as string]: "#C3A6FF", display: "contents" }}>
			<div className="nt-list" role="list">
				{data.sets.map((s) => (
					<div key={s.id} className="nt-card nt-row" role="listitem" style={{ padding: "6px 10px" }}>
						<button type="button" className="nt-grow" style={{ all: "unset", cursor: "pointer", flex: 1 }} onClick={() => setEditing(s.id)}>
							<div style={{ fontWeight: 600 }}>{s.name}</div>
							<div className="nt-muted">{s.apps.map((a) => a.name).join(" · ") || "No apps yet: click to add"}</div>
						</button>
						<button type="button" className="nt-btn primary" disabled={!s.apps.length} onClick={() => launch(s)}>
							<Play size={12} /> Launch
						</button>
						<button type="button" className="nt-btn nt-icon-btn" aria-label={`Delete ${s.name}`} onClick={() => setData((d) => ({ sets: d.sets.filter((x) => x.id !== s.id) }))}>
							<Trash2 size={12} />
						</button>
					</div>
				))}
			</div>
			<button
				type="button"
				className="nt-btn"
				onClick={() => {
					const id = String(Date.now());
					setData((d) => ({ sets: [...d.sets, { id, name: "New set", apps: [] }] }));
					setEditing(id);
				}}
			>
				<Plus size={12} /> New set
			</button>
		</div>
	);
}
