import { useState } from "react";

/** One card: a title (its diamond opens and closes it) over the rows. The rows
 *  stay in the page when closed so search can still find them. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
	const [open, setOpen] = useState(true);
	return (
		<div className={`gsec${open ? " open" : ""}`}>
			<button type="button" className="gsec-head" aria-expanded={open} onClick={() => setOpen(!open)}>
				<span className="gsec-diamond" />
				{title}
			</button>
			<div className="gsec-body" inert={!open}>
				<div className="setting-group">{children}</div>
			</div>
		</div>
	);
}
