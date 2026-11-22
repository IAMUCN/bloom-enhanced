import { useState } from "react";
import { BellRing, Check, Clock } from "lucide-react";
import type { ToolProps } from "../tools";
import { useToolData } from "./useToolData";
import { DeadlineList } from "./Deadlines";

export type Reminder = { id: string; text: string; at: number; repeat: "none" | "daily" | "weekly" };
export type RemindersData = { items: Reminder[] };

const QUICK: [string, () => number][] = [
	["10 min", () => Date.now() + 10 * 60_000],
	["1 hour", () => Date.now() + 60 * 60_000],
	[
		"Tomorrow 9:00",
		() => {
			const d = new Date();
			d.setDate(d.getDate() + 1);
			d.setHours(9, 0, 0, 0);
			return d.getTime();
		}
	]
];

const when = (at: number) => {
	const d = new Date(at);
	const today = new Date().toDateString() === d.toDateString();
	return (today ? "Today " : d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) + " ") +
		d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/** A due reminder moves on: repeating ones to their next time, others go. */
export function complete(items: Reminder[], id: string): Reminder[] {
	return items.flatMap((r) => {
		if (r.id !== id) return [r];
		if (r.repeat === "none") return [];
		const step = r.repeat === "daily" ? 86_400_000 : 7 * 86_400_000;
		let at = r.at;
		while (at <= Date.now()) at += step;
		return [{ ...r, at }];
	});
}

/** Reminders: the notch opens on this tab and rings when one is due (App
 *  checks while the tool is on, even with the tab closed). */
export default function Reminders({ setPinned }: ToolProps) {
	const [data, setData] = useToolData<RemindersData>("reminders", { items: [] });
	const [text, setText] = useState("");
	const [repeat, setRepeat] = useState<Reminder["repeat"]>("none");
	const add = (at: number) => {
		if (!text.trim()) return;
		setData((d) => ({ items: [...d.items, { id: String(Date.now()), text: text.trim(), at, repeat }].sort((a, b) => a.at - b.at) }));
		setText("");
	};
	const now = Date.now();
	return (
		<div style={{ ["--tool-color" as string]: "#FF8F8F", display: "contents" }}>
			<div className="nt-row">
				<input
					className="nt-input"
					placeholder="Remind me to…"
					value={text}
					aria-label="Reminder text"
					onFocus={() => setPinned(true)}
					onBlur={() => setPinned(false)}
					onChange={(e) => setText(e.target.value)}
				/>
				<div className="nt-seg" role="group" aria-label="Repeat">
					{(["none", "daily", "weekly"] as const).map((r) => (
						<button key={r} type="button" className={repeat === r ? "on" : ""} onClick={() => setRepeat(r)}>
							{r === "none" ? "Once" : r === "daily" ? "Daily" : "Weekly"}
						</button>
					))}
				</div>
			</div>
			<div className="nt-row">
				{QUICK.map(([label, at]) => (
					<button key={label} type="button" className="nt-btn" disabled={!text.trim()} onClick={() => add(at())}>
						<Clock size={12} /> {label}
					</button>
				))}
			</div>
			<div className="nt-list" role="list">
				{data.items.map((r) => {
					const due = r.at <= now;
					return (
						<div key={r.id} className="nt-card nt-row" role="listitem" style={{ padding: "6px 10px", outline: due ? "1.5px solid #FF8F8F" : undefined }}>
							<BellRing size={14} color="#FF8F8F" />
							<div className="nt-grow">
								<div>{r.text}</div>
								<div className="nt-muted">{due ? "Due now" : when(r.at)}{r.repeat !== "none" ? ` · ${r.repeat}` : ""}</div>
							</div>
							{due && (
								<button type="button" className="nt-btn" onClick={() => setData((d) => ({ items: d.items.map((x) => (x.id === r.id ? { ...x, at: Date.now() + 10 * 60_000 } : x)) }))}>
									Snooze
								</button>
							)}
							<button type="button" className="nt-btn nt-icon-btn" aria-label={`Done: ${r.text}`} onClick={() => setData((d) => ({ items: complete(d.items, r.id) }))}>
								<Check size={12} />
							</button>
						</div>
					);
				})}
				{!data.items.length && <div className="nt-muted">No reminders.</div>}
			</div>
			<div className="nt-muted dl-heading">Deadlines</div>
			<DeadlineList setPinned={setPinned} />
		</div>
	);
}
