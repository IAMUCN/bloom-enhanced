import { Radio, UserPlus, Users } from "lucide-react";

/** The Shelf's share column: people and groups to send to, Pair, and Live
 *  clipboard. On the right in the notch, along the bottom on a screen edge
 *  (.grill/shelf-share.md). Step 1 of the Share build: the layout only;
 *  pairing (step 2), sending (3), live clipboard (4) and groups (5) fill it. */
export function ShareColumn({ layout }: { layout: "notch" | "edge" }) {
	return (
		<aside className={`clip-share ${layout}`} aria-label="Share">
			<div className="clip-share-head">Share</div>
			<div className="clip-share-people">
				<div className="clip-share-empty">
					<Users size={16} strokeWidth={1.6} />
					<span>No one paired yet</span>
				</div>
			</div>
			<div className="clip-share-actions">
				<button type="button" className="clip-share-btn" disabled title="Pair with someone on this network (next step)">
					<UserPlus size={13} /> Pair
				</button>
				<button type="button" className="clip-share-btn" disabled title="Send everything you copy to chosen people (coming soon)">
					<Radio size={13} /> Live clipboard
				</button>
			</div>
		</aside>
	);
}
