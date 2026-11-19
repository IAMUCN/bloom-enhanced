import { useEffect, useRef, useState } from "react";
import { focusFirstTextField } from "../hooks/useTextInputKeyboard";
import { ChevronLeft, ChevronRight, Flag, Plus, X } from "lucide-react";
import { useToolData } from "./useToolData";
import { dayKey, daysLabel, daysUntil } from "../deadlines";
export { dayKey } from "../deadlines";

/** A deadline: a title and a day (YYYY-MM-DD, local). Shared by the
 *  Calendar (next ones, add by clicking a date) and Reminders (all). */
export type Deadline = { id: string; title: string; date: string };
export type DeadlinesData = { items: Deadline[] };

/** A small month to pick a day, inside the notch (the browser's own date
 *  popup opens outside the notch window and can't be used). */
function MiniMonth({ value, onPick }: { value: string; onPick: (day: string) => void }) {
	const [y0, m0] = value.split("-").map(Number);
	const [view, setView] = useState(() => new Date(y0, m0 - 1, 1));
	const year = view.getFullYear();
	const month = view.getMonth();
	const first = new Date(year, month, 1).getDay();
	const count = new Date(year, month + 1, 0).getDate();
	const today = dayKey(new Date());
	const step = (n: number) => setView(new Date(year, month + n, 1));
	return (
		<div className="mm" role="group" aria-label="Pick a day">
			<div className="mm-head">
				<button type="button" className="mm-nav" aria-label="Previous month" onClick={() => step(-1)}>
					<ChevronLeft size={13} />
				</button>
				<span>{view.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
				<button type="button" className="mm-nav" aria-label="Next month" onClick={() => step(1)}>
					<ChevronRight size={13} />
				</button>
			</div>
			<div className="mm-grid">
				{["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
					<span key={i} className="mm-dow">
						{d}
					</span>
				))}
				{Array.from({ length: first }, (_, i) => (
					<span key={`e${i}`} />
				))}
				{Array.from({ length: count }, (_, i) => {
					const key = dayKey(new Date(year, month, i + 1));
					return (
						<button
							key={key}
							type="button"
							className={`mm-day${key === value ? " on" : ""}${key === today ? " today" : ""}`}
							aria-pressed={key === value}
							onClick={() => onPick(key)}
						>
							{i + 1}
						</button>
					);
				})}
			</div>
		</div>
	);
}

const shortDate = (day: string) => {
	const [y, m, d] = day.split("-").map(Number);
	return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
};

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
	store,
	calendarPicks = false
}: {
	picked?: string | null;
	/** The Calendar beside it is the date picker (no month of its own). */
	calendarPicks?: boolean;
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
	const [choosing, setChoosing] = useState(false);
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
		setChoosing(false);
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
			{adding && choosing && !calendarPicks && (
				<MiniMonth
					value={date}
					onPick={(d) => {
						setDate(d);
						setChoosing(false);
					}}
				/>
			)}
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
					<button
						type="button"
						className={`dl-date${choosing ? " on" : ""}`}
						aria-expanded={calendarPicks ? undefined : choosing}
						title={calendarPicks ? "Click a day on the calendar to change it" : "Pick the day"}
						onClick={() => !calendarPicks && setChoosing(!choosing)}
					>
						{shortDate(date)}
					</button>
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
