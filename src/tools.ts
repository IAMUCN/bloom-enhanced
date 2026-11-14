// The notch's tools: one tab each, one colour each (design file › Foundations).
// The colour tints the active tab's icon; the user's accent marks selection.
import { CalendarDays, ClipboardList, Headphones, LayoutGrid, Music, type LucideIcon } from "lucide-react";

export type ToolId = "command-center" | "music" | "calendar" | "devices" | "clipboard";

export interface Tool {
	id: ToolId;
	label: string;
	icon: LucideIcon;
	/** Checked to at least 4.5:1 on black. */
	color: string;
}

export const TOOLS: Record<ToolId, Tool> = {
	"command-center": { id: "command-center", label: "Command Center", icon: LayoutGrid, color: "#5B9BFF" },
	music: { id: "music", label: "Media", icon: Music, color: "#FF5C7A" },
	calendar: { id: "calendar", label: "Calendar & Timer", icon: CalendarDays, color: "#FF9447" },
	devices: { id: "devices", label: "Devices", icon: Headphones, color: "#3DD9C9" },
	clipboard: { id: "clipboard", label: "Shelf", icon: ClipboardList, color: "#B98CFF" }
};

/** Height the tab bar adds to the open notch, in notch pixels. */
export const TAB_BAR_HEIGHT = 36;
