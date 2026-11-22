import { useRef } from "react";

/** The keys that showed up after the list first loaded (`null` = still loading).
 *  A row with such a key plays a one-off highlight (effects.css `.fx-new`). */
export function useNewKeys(keys: readonly string[] | null): ReadonlySet<string> {
	const seen = useRef<Set<string> | null>(null);
	const fresh = useRef(new Set<string>());
	if (keys) {
		if (!seen.current) seen.current = new Set(keys);
		else
			for (const k of keys)
				if (!seen.current.has(k)) {
					seen.current.add(k);
					fresh.current.add(k);
				}
	}
	return fresh.current;
}
