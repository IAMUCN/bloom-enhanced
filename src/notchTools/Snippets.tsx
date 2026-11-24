import { useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import type { ToolProps } from "../tools";
import { copyText, useToolData } from "./useToolData";

type Snippet = { id: string; name: string; text: string };

/** Snippets: saved bits of text (address, signature, code); click to copy. */
export default function Snippets({ setPinned }: ToolProps) {
	const [data, setData, ready] = useToolData<{ items: Snippet[] }>("snippets", { items: [] });
	const [name, setName] = useState("");
	const [text, setText] = useState("");
	const [copied, setCopied] = useState("");
	const pin = { onFocus: () => setPinned(true), onBlur: () => setPinned(false) };
	return (
		<div style={{ ["--tool-color" as string]: "#9EE6CF", display: "contents" }}>
			<div className="nt-row">
				<input className="nt-input" style={{ width: 110, flex: "none" }} placeholder="Name" value={name} aria-label="Snippet name" {...pin} onChange={(e) => setName(e.target.value)} />
				{/* A textarea: an address, a signature or a bit of code runs over several lines. */}
				<textarea className="nt-input" style={{ resize: "none", flex: 1, minWidth: 0 }} rows={1} placeholder="Text to save" value={text} aria-label="Snippet text" {...pin} onChange={(e) => setText(e.target.value)} />
				<button
					type="button"
					className="nt-btn primary nt-icon-btn"
					aria-label="Save snippet"
					disabled={!ready || !text.trim()}
					onClick={() => {
						setData((d) => ({ items: [...d.items, { id: String(Date.now()), name: name.trim() || text.trim().slice(0, 16), text }] }));
						setName("");
						setText("");
					}}
				>
					<Plus size={14} />
				</button>
			</div>
			<div className="nt-list" role="list">
				{data.items.map((s) => (
					<div key={s.id} className="nt-card nt-row" role="listitem" style={{ padding: "6px 10px" }}>
						<div className="nt-grow">
							<div style={{ fontWeight: 600 }}>{s.name}</div>
							<div className="nt-muted" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.text}</div>
						</div>
						<button type="button" className="nt-btn" onClick={() => copyText(s.text).then((ok) => ok && (setCopied(s.id), window.setTimeout(() => setCopied(""), 1200)))}>
							<Copy size={12} /> {copied === s.id ? "Copied" : "Copy"}
						</button>
						<button type="button" className="nt-btn nt-icon-btn" aria-label={`Delete ${s.name}`} onClick={() => setData((d) => ({ items: d.items.filter((x) => x.id !== s.id) }))}>
							<Trash2 size={12} />
						</button>
					</div>
				))}
				{!data.items.length && <div className="nt-muted">Save text you type often.</div>}
			</div>
		</div>
	);
}
