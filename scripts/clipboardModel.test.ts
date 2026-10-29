import { expect, test } from "bun:test";
import { clearIds, colorOf, isKept, linkInfo, matchesFilter, visibleItems, type ClipItem } from "../src/clipboardModel";

const item = (id: string, patch: Partial<ClipItem>): ClipItem => ({
	id,
	kind: "text",
	is_url: false,
	width: 0,
	height: 0,
	captured_at: 0,
	pinned: false,
	hits: 1,
	...patch
});

const text = item("t", { text: "hello" });
const link = item("l", { text: "https://a.b", is_url: true });
const color = item("c", { text: "#1e90ff" });
const shot = item("s", { kind: "image" });
const pics = item("p", { kind: "files", paths: ["C:\\a.png", "C:\\b.JPG"] });
const docs = item("d", { kind: "files", paths: ["C:\\a.png", "C:\\r.pdf"] });

test("filters sort items into one tab each", () => {
	const all = [text, link, color, shot, pics, docs];
	const tab = (f: Parameters<typeof matchesFilter>[1]) => all.filter((it) => matchesFilter(it, f)).map((it) => it.id);
	expect(tab("text")).toEqual(["t"]);
	expect(tab("links")).toEqual(["l"]);
	expect(tab("images")).toEqual(["s", "p"]);
	expect(tab("others")).toEqual(["c", "d"]);
	expect(tab("all")).toHaveLength(6);
});

test("recognises colour codes only when the whole text is one", () => {
	expect(colorOf(item("x", { text: " #FFF " }))).toBe("#FFF");
	expect(colorOf(item("x", { text: "rgba(0, 0, 0, .5)" }))).toBe("rgba(0, 0, 0, .5)");
	expect(colorOf(item("x", { text: "#12345" }))).toBeNull();
	expect(colorOf(item("x", { text: "color: #fff" }))).toBeNull();
});

test("search and pinning order", () => {
	const pinned = item("p2", { text: "hello pinned", pinned: true });
	expect(visibleItems([text, pinned, link], "hello").map((it) => it.id)).toEqual(["p2", "t"]);
	expect(visibleItems([pics, docs], "r.pdf").map((it) => it.id)).toEqual(["d"]);
});

test("scoped clear keeps pinned and older items", () => {
	const now = 10 * 3_600_000;
	const fresh = item("f", { captured_at: now - 1000 });
	const old = item("o", { captured_at: now - 5 * 3_600_000 });
	const kept = item("k", { captured_at: now, pinned: true });
	expect(clearIds([fresh, old, kept], 1, now)).toEqual(["f"]);
	expect(clearIds([fresh, old, kept], 0, now)).toEqual(["f", "o"]);
});

test("offline link previews read the URL only", () => {
	expect(linkInfo("https://www.github.com/tauri-apps/tauri-plugin-drag")).toMatchObject({
		domain: "github.com",
		title: "Tauri plugin drag",
		letter: "G"
	});
	expect(linkInfo("www.example.com")?.title).toBe("Example");
	expect(linkInfo("https://site.io/a1b2c3d4e5f6a7b8")?.title).toBe("Site");
	expect(linkInfo("https://x.y/My%20Page.html")?.title).toBe("My Page");
	expect(linkInfo("http://")).toBeNull();
});

test("noted items count as kept", () => {
	const noted = item("n", { note: "invoice" });
	expect(isKept(noted)).toBe(true);
	expect(clearIds([noted, item("x", {})], 0, 1)).toEqual(["x"]);
});
