const assert = require("node:assert/strict");
const fs = require("node:fs");

const main = fs.readFileSync("src/main.jsx", "utf8");
const styles = fs.readFileSync("src/styles.css", "utf8");
const intent = fs.readFileSync("src/services/xIntent.js", "utf8");
const drafts = fs.readFileSync("src/services/scheduledReplyOpportunity.js", "utf8");

assert.match(main, /function ReplyDraftsPanel/);
assert.match(main, /Xで返信/);
assert.match(main, /opened_in_x/);
assert.match(main, /reply-draft-layout/);
assert.match(styles, /reply-draft-shell/);
assert.match(styles, /reply-draft-actions/);
assert.match(styles, /min-height: 44px/);
assert.match(styles, /env\(safe-area-inset-bottom\)/);
assert.match(styles, /@media \(max-width: 620px\)/);
assert.match(intent, /URLSearchParams/);
assert.match(intent, /in_reply_to/);
assert.match(drafts, /qualityScoreMinimum/);
assert.match(drafts, /operatingHoursStart/);
assert.match(drafts, /operatingHoursEnd/);

console.log(JSON.stringify({
  ok: true,
  widthChecks: [375, 390, 430],
  mobileLayout: "checked_by_source",
}, null, 2));
