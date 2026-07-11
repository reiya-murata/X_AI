function getParsedText(response) {
  return response?.output_parsed || response?.output?.[0]?.content?.[0]?.text || null;
}

module.exports = { getParsedText };
