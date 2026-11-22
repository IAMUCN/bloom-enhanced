import { useState } from "react";
import { Check, X } from "lucide-react";
import type { ToolProps } from "../tools";
import { useToolData } from "./useToolData";

type Todo = { id: string; text: string; done: boolean };

/** To-dos: a list to tick off; finished ones sink to the bottom. */
export default function Todos({ setPinned }: ToolProps) {
	const [data, setData] = useToolData<{ items: Todo[] }>("todo", { items: [] });
	const [draft, setDraft] = useState("");
	const items = [...data.items].sort((a, b) => Number(a.done) - Number(b.done));
	const done = data.items.filter((t) => t.done).length;
	const add = () => {
		const text = draft.trim();
		if (!text) return;
		setData((d) => ({ items: [{ id: String(Date.now()), text, done: false }, ...d.items] }));
		setDraft("");
	};
	return (
		<div style={{ ["--tool-color" as string]: "#7EE081", display: "contents" }}>
			<div className="nt-row">
				<input
					className="nt-input"
					placeholder="Add a to-do and press Enter"
					value={draft}
					aria-label="New to-do"
					onFocus={() => setPinned(true)}
					onBlur={() => setPinned(false)}
					onChange={(e) => setDraft(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && add()}
				/>
				<span className="nt-muted" style={{ whiteSpace: "nowrap" }}>
					{done} of {data.items.length}
				</span>
			</div>
			<div className="nt-list" role="list">
				{items.map((t) => (
					<div key={t.id} className="nt-card nt-row" role="listitem" style={{ padding: "6px 8px" }}>
						<button
							type="button"
							role="checkbox"
							aria-checked={t.done}
							aria-label={t.text}
							className="nt-btn nt-icon-btn"
							style={{ padding: 3, background: t.done ? "#7EE081" : undefined, color: "#000" }}
							onClick={() => setData((d) => ({ items: d.items.map((x) => (x.id === t.id ? { ...x, done: !x.done } : x)) }))}
						>
							<Check size={12} strokeWidth={3} style={{ opacity: t.done ? 1 : 0 }} />
						</button>
						<span className="nt-grow" style={{ textDecoration: t.done ? "line-through" : undefined, opacity: t.done ? 0.5 : 1 }}>
							{t.text}
						</span>
						<button
							type="button"
							className="nt-btn nt-icon-btn"
							style={{ background: "none" }}
							aria-label={`Delete ${t.text}`}
							onClick={() => setData((d) => ({ items: d.items.filter((x) => x.id !== t.id) }))}
						>
							<X size={12} />
						</button>
					</div>
				))}
				{!items.length && <div className="nt-muted">Nothing to do yet.</div>}
			</div>
		</div>
	);
}
