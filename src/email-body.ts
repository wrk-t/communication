// ════════════════════════════════════════════════════════════════
// EMAIL BODY
//
// Tenants write plain text. The email alternative is one small shell
// around it — escaped, with line breaks preserved. That is deliberately
// the whole feature: no tenant HTML means no sanitizer and no injection
// surface, and every value that ends up in a message stays literal.
// ════════════════════════════════════════════════════════════════

const HTML_ESCAPE_PATTERN = /[&<>"']/g;
const CRLF = /\r\n?/g;
const BLANK_LINES = /\n{2,}/;

const HTML_ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

export function escapeHtml(value: string): string {
	return value.replace(
		HTML_ESCAPE_PATTERN,
		(char) => HTML_ESCAPES[char] ?? char,
	);
}

/**
 * Wrap a plain-text body in a minimal, escaped HTML shell.
 *
 * Blank lines become paragraph breaks; single newlines become `<br />`, so a
 * tenant's spacing survives without parsing any markup.
 */
export function renderEmailHtml(body: string): string {
	const normalized = body.replace(CRLF, "\n");
	const paragraphs = normalized
		.split(BLANK_LINES)
		.map(
			(paragraph) =>
				`<p style="margin:0 0 12px;line-height:1.6">${escapeHtml(
					paragraph,
				).replace(/\n/g, "<br />")}</p>`,
		)
		.join("");

	return [
		"<!doctype html>",
		'<html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;color:#1f2937">',
		paragraphs,
		"</body></html>",
	].join("");
}
