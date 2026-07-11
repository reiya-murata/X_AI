const { DEFAULT_MODELS } = require("./config");

function getPhase3Models() {
  return {
    reply: process.env.OPENAI_REPLY_MODEL || DEFAULT_MODELS.reply,
    moderation: process.env.OPENAI_MODERATION_MODEL || DEFAULT_MODELS.moderation,
  };
}

module.exports = { getPhase3Models };
