/** Evaluates a calculator expression without eval(): numbers, + − × ÷ ^ %,
 *  parentheses and unary minus. Returns null for anything it can't read. */
export function calc(input: string): number | null {
	const src = input.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/,/g, "").replace(/\s+/g, "");
	if (!src) return null;
	let i = 0;
	const peek = () => src[i];
	// expr := term (('+'|'-') term)*
	const expr = (): number => {
		let v = term();
		while (peek() === "+" || peek() === "-") v = src[i++] === "+" ? v + term() : v - term();
		return v;
	};
	// term := power (('*'|'/'|'%') power)*
	const term = (): number => {
		let v = power();
		while (peek() === "*" || peek() === "/" || peek() === "%") {
			const op = src[i++];
			const r = power();
			v = op === "*" ? v * r : op === "/" ? v / r : v % r;
		}
		return v;
	};
	// power := unary ('^' power)?   (right-associative)
	const power = (): number => {
		const base = unary();
		if (peek() === "^") {
			i++;
			return base ** power();
		}
		return base;
	};
	const unary = (): number => {
		if (peek() === "-") {
			i++;
			return -unary();
		}
		if (peek() === "+") {
			i++;
			return unary();
		}
		return atom();
	};
	const atom = (): number => {
		if (peek() === "(") {
			i++;
			const v = expr();
			if (src[i++] !== ")") throw new Error("missing )");
			return v;
		}
		const m = /^\d*\.?\d+(e[+-]?\d+)?/i.exec(src.slice(i));
		if (!m) throw new Error("number expected");
		i += m[0].length;
		return parseFloat(m[0]);
	};
	try {
		const v = expr();
		return i === src.length && Number.isFinite(v) ? v : null;
	} catch {
		return null;
	}
}
