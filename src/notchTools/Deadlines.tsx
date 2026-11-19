import { useEffect, useRef, useState } from "react";
import { focusFirstTextField } from "../hooks/useTextInputKeyboard";
import { Flag, Plus, X } from "lucide-react";
import { useToolData } from "./useToolData";
import { dayKey, daysLabel, daysUntil } from "../deadlines";
export { dayKey } from "../deadlines";

/** A deadline: a title and a day (YYYY-MM-DD, local). Shared by the
 *  Calendar (next ones, add by clicking a date) and Reminders (all). */
export type Deadline = { id: string; title: string; date: string };
export type DeadlinesData = { items: Deadline[] };

export function useDeadlines() {
	return useToolData<DeadlinesData>("deadlines", { items: [] });
}

/** The deadlines, soonest first, with an add row. `picked`: a date chosen
 *  elsewhere (a calendar day) opens the add row on it. `max`: show only the
 *  next few (past ones drop off after a day). */
export function DeadlineList({
	picked,
	max,
	setPinned,
	store
}: {
	picked?: string | null;
	max?: number;
	setPinned?: (pinned: boolean) => void;
	/** The list from a parent that also shows it (the Calendar marks days). */
	store?: ReturnType<typeof useDeadlines>;
}) {
	const own = useDeadlines();
	const [data, setData] = store ?? own;
	const [adding, setAdding] = useState(false);
	const [title, setTitle] = useState("");
	const [date, setDate] = useState(() => dayKey(new Date()));
	// `picked` is "YYYY-MM-DD#n", so clicking the same day again reopens it.
	useEffect(() => {
		if (picked) {
			setDate(picked.split("#")[0]);
			setAdding(true);
		}
	}, [picked]);
	// The notch doesn't take typing by default; the add row asks for it.
	const row = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (adding && row.current) focusFirstTextField(row.current);
	}, [adding]);
	const shown = [...data.items]
		.filter((d) => daysUntil(d.date) >= -1)
		.sort((a, b) => a.date.localeCompare(b.date))
		.slice(0, max ?? Infinity);
	const add = () => {
		if (!title.trim() || !date) return;
		setData((d) => ({ items: [...d.items, { id: String(Date.now()), title: title.trim(), date }] }));
		setTitle("");
		setAdding(false);
	};
	const remove = (id: string) => setData((d) => ({ items: d.items.filter((x) => x.id !== id) }));
	return (
		<div className="dl">
			{shown.map((d) => {
				const days = daysUntil(d.date);
				return (
					<div key={d.id} className={`dl-item${days < 0 ? " past" : days <= 2 ? " soon" : ""}`}>
						<Flag size={12} />
						<span className="dl-title" title={d.title}>
							{d.title}
						</span>
						<span className="dl-days">{daysLabel(days)}</span>
						<button type="button" className="dl-remove" aria-label={`Remove ${d.title}`} onClick={() => remove(d.id)}>
							<X size={10} />
						</button>
					</div>
				);
			})}
			{adding ? (
				<div className="dl-add" ref={row}>
					<input
						className="nt-input"
						placeholder="Deadline"
						value={title}
						maxLength={60}
						aria-label="Deadline name"
						onFocus={() => setPinned?.(true)}
						onBlur={() => setPinned?.(false)}
						onChange={(e) => setTitle(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter") add();
							if (e.key === "Escape") (e.stopPropagation(), setAdding(false));
						}}
					/>
					<input className="nt-input dl-date" type="date" value={date} aria-label="Deadline date" onChange={(e) => setDate(e.target.value)} />
					<button type="button" className="nt-btn primary" disabled={!title.trim()} onClick={add}>
						Add
					</button>
				</div>
			) : (
				<button type="button" className="dl-new" onClick={() => setAdding(true)}>
					<Plus size={12} /> {shown.length ? "Deadline" : "Add a deadline"}
				</button>
			)}
		</div>
	);
}
