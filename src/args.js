export function parseFlags(args, options = {}) {
  const parsed = { positionals: [] };
  const booleanFlags = new Set(options.boolean ?? []);
  const arrayFlags = new Set(options.array ?? []);

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === "--") {
      parsed.positionals.push(...args.slice(index + 1));
      break;
    }

    if (!arg.startsWith("--")) {
      parsed.positionals.push(arg);
      continue;
    }

    const equals = arg.indexOf("=");
    const name = equals === -1 ? arg.slice(2) : arg.slice(2, equals);
    if (!name) {
      throw usage("empty flag name", ["Run `linear-axi --help`"]);
    }

    let value;
    if (booleanFlags.has(name)) {
      value = equals === -1 ? true : parseBoolean(arg.slice(equals + 1), name);
    } else if (equals !== -1) {
      value = arg.slice(equals + 1);
    } else {
      index += 1;
      if (index >= args.length) {
        throw usage(`--${name} requires a value`, [`Run \`linear-axi ${options.example ?? "--help"}\``]);
      }
      value = args[index];
    }

    if (arrayFlags.has(name)) {
      parsed[name] = [...(parsed[name] ?? []), value];
    } else {
      parsed[name] = value;
    }
  }

  return parsed;
}

export function parseJsonObject(value, flagName) {
  if (value === undefined) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not object");
    }
    return parsed;
  } catch {
    throw usage(`${flagName} must be a JSON object`, [`Run \`linear-axi call <tool> --args '{"limit":10}'\``]);
  }
}

export function parseScalar(value) {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^-?(0|[1-9]\d*)(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function parseBoolean(value, flagName) {
  if (value === "true") return true;
  if (value === "false") return false;
  throw usage(`--${flagName} must be true or false`, [`Run \`linear-axi --help\``]);
}

export class AxiError extends Error {
  constructor(kind, message, help = []) {
    super(message);
    this.kind = kind;
    this.help = help;
    this.exitCode = kind === "usage" ? 2 : 1;
  }
}

export function usage(message, help = []) {
  return new AxiError("usage", message, help);
}
