// Deadline date math (the Calendar and Reminders, notchTools/Deadlines.tsx).

/** Local YYYY-MM-DD of a date. */
export const dayKey = (d: Date) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Whole days from today to `date` (negative once it has passed). */
export function daysUntil(date: string, today = new Date()): number {
	const [y, m, d] = date.split("-").map(Number);
	const due = Date.UTC(y, m - 1, d);
	const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
	return Math.round((due - now) / 86_400_000);
}

export function daysLabel(days: number): string {
	if (days === 0) return "Today";
	if (days === 1) return "Tomorrow";
	if (days > 1) return `${days} days left`;
	return days === -1 ? "Yesterday" : `${-days} days ago`;
}

