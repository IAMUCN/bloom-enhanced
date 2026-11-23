interface P {
	size?: number;
}

const stroke = {
	fill: "none",
	stroke: "currentColor",
	strokeWidth: 1.8,
	strokeLinecap: "round",
	strokeLinejoin: "round"
} as const;

export function XIcon({ size = 16 }: P) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
		</svg>
	);
}

export function InstagramIcon({ size = 16 }: P) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
			<rect x="3" y="3" width="18" height="18" rx="5" />
			<circle cx="12" cy="12" r="4.2" />
			<circle cx="17.4" cy="6.6" r="0.6" fill="currentColor" />
		</svg>
	);
}

export function LinkedinIcon({ size = 16 }: P) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
			<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
			<rect x="2" y="9" width="4" height="12" />
			<circle cx="4" cy="4" r="2" />
		</svg>
	);
}

export function RedditIcon({ size = 16 }: P) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24" {...stroke} aria-hidden="true">
			<ellipse cx="12" cy="14" rx="8" ry="5.6" />
			<circle cx="4.4" cy="11.6" r="1.8" />
			<circle cx="19.6" cy="11.6" r="1.8" />
			<circle cx="9" cy="13.4" r="0.9" fill="currentColor" />
			<circle cx="15" cy="13.4" r="0.9" fill="currentColor" />
			<path d="M9.2 16.6c1.7 1 3.9 1 5.6 0" />
			<path d="M12 8.4 13.2 3.6l4 1" />
			<circle cx="18.2" cy="5" r="1.3" />
		</svg>
	);
}
