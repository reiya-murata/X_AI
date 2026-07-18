import assert from "node:assert/strict";
import { URL } from "node:url";
import process from "node:process";
import { buildXReplyUrl } from "../src/services/xIntent.js";

const url = new URL(buildXReplyUrl({ postId: "1234567890123456789", replyText: "日本語 & #AI の返信\n絵文字🙂 https://example.com?a=1&b=2" }));
assert.equal(url.origin, "https://x.com");
assert.equal(url.pathname, "/intent/tweet");
assert.equal(url.searchParams.get("in_reply_to"), "1234567890123456789");
assert.equal(url.searchParams.get("text"), "日本語 & #AI の返信\n絵文字🙂 https://example.com?a=1&b=2");
assert.equal(url.href, "https://x.com/intent/tweet?in_reply_to=1234567890123456789&text=%E6%97%A5%E6%9C%AC%E8%AA%9E+%26+%23AI+%E3%81%AE%E8%BF%94%E4%BF%A1%0A%E7%B5%B5%E6%96%87%E5%AD%97%F0%9F%99%82+https%3A%2F%2Fexample.com%3Fa%3D1%26b%3D2");
assert.throws(() => buildXReplyUrl({ postId: "javascript:alert(1)", replyText: "返信" }));
assert.throws(() => buildXReplyUrl({ postId: "12345", replyText: "" }));
assert.throws(() => buildXReplyUrl({ postId: "12345", replyText: "あ".repeat(281) }));
process.stdout.write(`${JSON.stringify({ ok: true, encoding: true, postIdValidation: true, emptyRejected: true, maxLength: 280, automaticPosting: false }, null, 2)}\n`);
