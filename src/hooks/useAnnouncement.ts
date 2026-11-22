export interface Announcement {
	id: string;
	severity: "info" | "warning";
	title: string;
	body: string;
	url?: string;
}

/**
 * Bloom fetched announcements hourly from its author's website. LotusNotch
 * calls no server of its own (no telemetry, no IP sent to a third party), so
 * there is never an announcement; the notch card and the Settings banner stay
 * in place, ready if LotusNotch ever ships its notes inside an update.
 */
export function useAnnouncement(): {
	announcement: Announcement | null;
	dismissed: boolean;
	dismiss: () => void;
} {
	return { announcement: null, dismissed: true, dismiss: () => {} };
}
