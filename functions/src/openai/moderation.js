const { runModeration } = require("./client");

async function moderateText({ model, text }) {
  return runModeration({ model, input: text });
}

module.exports = { moderateText };
