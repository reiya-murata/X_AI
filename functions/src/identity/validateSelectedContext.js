function validateSelectedContext({ selectedProjects, selectedExperiences, selectedOpinions, selectedWriterInstructions }) {
  const ids = new Set();
  for (const item of [...selectedProjects, ...selectedExperiences, ...selectedOpinions, ...selectedWriterInstructions]) {
    if (!item || ids.has(item.id)) return false;
    ids.add(item.id);
    if (item.publicUseAllowed === false || item.useForReply === false || item.isActive === false) return false;
  }
  return true;
}

module.exports = { validateSelectedContext };
