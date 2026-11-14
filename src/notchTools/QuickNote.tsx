import { Plus, Trash2 } from "lucide-react";
import type { ToolProps } from "../tools";
import { useToolData } from "./useToolData";

type Note = { id: string; text: string };
const blank = (): Note => ({ id: String(Date.now()), text: "" });

/** Quick note: notes that save themselves; one shows, chips switch. */
export default function QuickNote({ setPinned }: ToolProps) {
	const [data, setData, ready] = useToolData<{ notes: Note[]; current: string }>("note", {
		notes: [{ id: "1", text: "" }],
		current: "1"
	});
	const note = data.notes.find((n) => n.id === data.current) ?? data.notes[0];
	const title = (n: Note) => n.text.split("\n")[0].trim().slice(0, 18) || "Empty note";
	return (
		<div style={{ ["--tool-color" as string]: "#FFE066", display: "contents" }}>
			<textarea
				className="nt-input nt-grow"
				style={{ flex: 1, background: "color-mix(in srgb, #FFE066 12%, transparent)" }}
				placeholder="Write something…"
				value={note?.text ?? ""}
				disabled={!ready}
				aria-label="Note"
				onFocus={() => setPinned(true)}
				onBlur={() => setPinned(false)}
				onChange={(e) =>
					setData((d) => ({ ...d, notes: d.notes.map((n) => (n.id === note.id ? { ...n, text: e.target.value } : n)) }))
				}
			/>
			<div className="nt-row" style={{ flexWrap: "nowrap", overflowX: "auto" }}>
				{data.notes.map((n) => (
					<button
						key={n.id}
						type="button"
						className={`nt-btn${n.id === note?.id ? " primary" : ""}`}
						onClick={() => setData((d) => ({ ...d, current: n.id }))}
					>
						{title(n)}
					</button>
				))}
				<button
					type="button"
					className="nt-btn nt-icon-btn"
					aria-label="New note"
					onClick={() => {
						const n = blank();
						setData((d) => ({ notes: [...d.notes, n], current: n.id }));
					}}
				>
					<Plus size={14} />
				</button>
				{data.notes.length > 1 && (
					<button
						type="button"
						className="nt-btn nt-icon-btn"
						aria-label="Delete this note"
						onClick={() =>
							setData((d) => {
								const notes = d.notes.filter((n) => n.id !== note.id);
								return { notes, current: notes[0].id };
							})
						}
					>
						<Trash2 size={14} />
					</button>
				)}
			</div>
		</div>
	);
}
