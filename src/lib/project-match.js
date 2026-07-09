export function projectMatches(project, value, options = {}) {
  if (!project || typeof project !== "object" || Array.isArray(project)) return false;
  const normalizedValue = normalizeText(value);
  const identifierMatches = options.normalizeIdentifiers
    ? normalizeText(project.id) === normalizedValue || normalizeText(project.slugId) === normalizedValue
    : project.id === value || project.slugId === value;
  return identifierMatches || normalizeText(project.name) === normalizedValue;
}

function normalizeText(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}
