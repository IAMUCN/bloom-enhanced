import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

const isTextField = (el: EventTarget | null): el is HTMLElement =>
	el instanceof HTMLTextAreaElement ||
	(el instanceof HTMLInputElement && !["range", "checkbox", "radio", "button", "submit"].includes(el.type));

let held = false;

/** Gives the keyboard back if a text field had taken it. Called when the
 *  surface closes, since a field removed while focused fires no focusout. */
export function releaseTextKeyboard() {
	if (!held) return;
	held = false;
	invoke("keyboard_focus", { focus: false }).catch(() => {});
}

/**
 * The notch and the edge clipboard shelf never take focus on click
 * (WS_EX_NOACTIVATE), so their text fields can't receive typing. Clicking any
 * text field in the window hands it the keyboard (`keyboard_focus`); leaving
 * the field, or clicking anywhere else in the window, gives the keyboard back
 * to the app that had it.
 */
export function useTextInputKeyboard() {
	useEffect(() => {
		const release = releaseTextKeyboard;
		const down = (e: PointerEvent) => {
			if (!isTextField(e.target)) {
				release();
				return;
			}
			held = true;
			const field = e.target;
			invoke("keyboard_focus", { focus: true })
				.then(() => field.focus())
				.catch(() => {});
		};
		const out = (e: FocusEvent) => {
			if (isTextField(e.target) && !isTextField(e.relatedTarget)) release();
		};
		document.addEventListener("pointerdown", down, true);
		document.addEventListener("focusout", out, true);
		return () => {
			document.removeEventListener("pointerdown", down, true);
			document.removeEventListener("focusout", out, true);
			release();
		};
	}, []);
}
