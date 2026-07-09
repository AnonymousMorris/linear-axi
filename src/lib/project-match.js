export function projectMatches(project, value, options = {}) {
  if (!project || typeof project !== "object" || Array.isArray(project)) return false;
  return sameProjectIdentifier(project.id, value, options)
    || sameProjectIdentifier(project.slugId, value, options)
    || sameProjectName(project.name, value);
}

function sameProjectIdentifier(candidate, value, options) {
  if (options.normalizeIdentifiers) return normalizeText(candidate) === normalizeText(value);
  return candidate === value;
}

function sameProjectName(candidate, value) {
  return normalizeText(candidate) === normalizeText(value);
}

function normalizeText(value) {
  return String(value ?? "").trim().toLocaleLowerCase();
}
