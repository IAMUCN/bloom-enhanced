import { useState } from "react";
import { Search } from "lucide-react";
import type { ToolProps } from "../tools";
import { copyText, useToolData } from "./useToolData";

// ponytail: a hand-picked list of common emoji with search words, not the
// full Unicode set; a full picker would need the emoji data (a dependency).
const EMOJI: [string, string][] = [
	["😀", "grin smile happy"], ["😂", "joy laugh tears"], ["🥹", "touched holding tears"], ["😍", "love heart eyes"], ["🤔", "think hmm"],
	["😴", "sleep tired"], ["😅", "sweat nervous"], ["😭", "cry sob"], ["😎", "cool sunglasses"], ["🙃", "upside down"],
	["😉", "wink"], ["😊", "blush smile"], ["🤯", "mind blown"], ["😡", "angry mad"], ["🥳", "party celebrate"],
	["🤝", "handshake deal"], ["👍", "thumbs up yes ok"], ["👎", "thumbs down no"], ["👏", "clap"], ["🙏", "pray thanks please"],
	["💪", "strong muscle"], ["👀", "eyes look"], ["🔥", "fire lit hot"], ["✨", "sparkles"], ["💯", "hundred perfect"],
	["❤️", "heart love red"], ["💔", "broken heart"], ["🎉", "tada party"], ["✅", "check done yes"], ["❌", "cross no wrong"],
	["⚠️", "warning"], ["📌", "pin"], ["📎", "paperclip attach"], ["📅", "calendar date"], ["⏰", "alarm clock time"],
	["💡", "idea bulb"], ["📝", "memo note write"], ["📚", "books study"], ["💻", "laptop computer"], ["🖥️", "desktop computer"],
	["🐛", "bug"], ["🚀", "rocket launch ship"], ["☕", "coffee"], ["🍕", "pizza food"], ["🎵", "music note"],
	["🎮", "game controller"], ["📷", "camera photo"], ["🌙", "moon night"], ["☀️", "sun day"], ["🌧️", "rain"]
];

/** Emoji: click one to copy it; recent ones come first. */
export default function Emoji({ setPinned }: ToolProps) {
	const [data, setData] = useToolData<{ recent: string[] }>("emoji", { recent: [] });
	const [q, setQ] = useState("");
	const [copied, setCopied] = useState("");
	const words = q.toLowerCase().trim();
	const list = words ? EMOJI.filter(([, w]) => w.includes(words)) : [...data.recent.map((e) => [e, ""] as [string, string]), ...EMOJI.filter(([e]) => !data.recent.includes(e))];
	return (
		<div style={{ display: "contents" }}>
			<label className="nt-input nt-row" style={{ padding: "5px 10px" }}>
				<Search size={13} className="nt-muted" />
				<input
					style={{ all: "unset", flex: 1 }}
					placeholder={copied ? `Copied ${copied}` : "Search emoji"}
					value={q}
					aria-label="Search emoji"
					onFocus={() => setPinned(true)}
					onBlur={() => setPinned(false)}
					onChange={(e) => setQ(e.target.value)}
				/>
			</label>
			<div className="nt-list" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, 38px)", gap: 4, alignContent: "start" }}>
				{list.map(([e]) => (
					<button
						key={e}
						type="button"
						aria-label={`Copy ${e}`}
						className="nt-btn"
						style={{ fontSize: 20, padding: 0, width: 38, height: 34, borderRadius: 10 }}
						onClick={() =>
							copyText(e).then((ok) => {
								if (!ok) return;
								setCopied(e);
								setData((d) => ({ recent: [e, ...d.recent.filter((x) => x !== e)].slice(0, 8) }));
							})
						}
					>
						{e}
					</button>
				))}
			</div>
		</div>
	);
}
