import assert from "node:assert/strict";
import { URL } from "node:url";
import process from "node:process";
import { buildXReplyUrl } from "../src/services/xIntent.js";

const url = new URL(buildXReplyUrl({ postId: "1234567890123456789", replyText: "日本語 & #AI の返信" }));
assert.equal(url.origin, "https://x.com");
assert.equal(url.pathname, "/intent/tweet");
assert.equal(url.searchParams.get("in_reply_to"), "1234567890123456789");
assert.equal(url.searchParams.get("text"), "日本語 & #AI の返信");
assert.throws(() => buildXReplyUrl({ postId: "javascript:alert(1)", replyText: "返信" }));
assert.throws(() => buildXReplyUrl({ postId: "12345", replyText: "" }));
assert.throws(() => buildXReplyUrl({ postId: "12345", replyText: "あ".repeat(281) }));
process.stdout.write(`${JSON.stringify({ ok: true, encoding: true, postIdValidation: true, emptyRejected: true, maxLength: 280, automaticPosting: false }, null, 2)}\n`);
