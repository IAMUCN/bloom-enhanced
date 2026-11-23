import { useEffect, useState } from "react";

const HEX = /^#[0-9a-f]{6}$/i;
/** "abc", "#abc", "aabbcc" → "#aabbcc"; anything else → null. */
export function parseHex(raw: string): string | null {
	let v = raw.trim().replace(/^#/, "");
	if (/^[0-9a-f]{3}$/i.test(v)) v = v.replace(/./g, (c) => c + c);
	return /^[0-9a-f]{6}$/i.test(v) ? "#" + v.toLowerCase() : null;
}

/** Swatches, the system colour picker and a box to type a hex code. `follow`
 *  adds a first swatch that stores "" (follow another colour). */
export function ColourPicker({
	value,
	presets,
	onPick,
	follow,
	label
}: {
	value: string;
	presets: string[];
	onPick: (v: string) => void;
	follow?: { colour: string; title: string };
	label: string;
}) {
	const [text, setText] = useState(value);
	useEffect(() => setText(value), [value]);
	const shown = HEX.test(value) ? value : (follow?.colour ?? "#6a55ff");
	const commit = () => {
		const hex = parseHex(text);
		if (hex) onPick(hex);
		else setText(value);
	};
	return (
		<div className="accent-swatches">
			{follow && (
				<button type="button" className={`accent-swatch${value === "" ? " on" : ""}`} style={{ background: follow.colour }} title={follow.title} aria-label={follow.title} aria-pressed={value === ""} onClick={() => onPick("")} />
			)}
			{presets.map((c) => (
				<button key={c} type="button" className={`accent-swatch${c === value ? " on" : ""}`} style={{ background: c }} aria-label={`${label} ${c}`} aria-pressed={c === value} onClick={() => onPick(c)} />
			))}
			<input type="color" value={shown} onChange={(e) => onPick(e.target.value)} className="color-picker-input" aria-label={`Pick ${label}`} />
			<input
				className="setting-text-input hex-input"
				value={text}
				placeholder={follow ? "Same" : "#6a55ff"}
				maxLength={7}
				spellCheck={false}
				aria-label={`${label} hex code`}
				onChange={(e) => setText(e.target.value)}
				onBlur={commit}
				onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
			/>
		</div>
	);
}
