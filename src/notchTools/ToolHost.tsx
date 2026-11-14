import { Suspense, lazy, useMemo } from "react";
import { EXTRA_BY_ID, type ExtraToolId, type ToolProps } from "../tools";
import "./tools.css";

/** Loads a tool's component the first time it is shown; a tool that is off
 *  is never loaded (the tool contract). */
export function ToolHost({ id, ...props }: ToolProps & { id: ExtraToolId }) {
	const Tool = useMemo(() => lazy(EXTRA_BY_ID[id].load), [id]);
	return (
		<div className="notch-tool" data-tool={id}>
			<Suspense fallback={null}>
				<Tool {...props} />
			</Suspense>
		</div>
	);
}
