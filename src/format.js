export function renderToon(value) {
  const lines = renderValue(value, 0);
  return `${lines.join("\n")}\n`;
}

function renderValue(value, depth, key) {
  const indent = " ".repeat(depth * 2);

  if (Array.isArray(value)) {
    return renderArray(key, value, depth);
  }

  if (isPlainObject(value)) {
    const lines = [];
    if (key !== undefined) {
      lines.push(`${indent}${formatKey(key)}:`);
    }
    const childDepth = key === undefined ? depth : depth + 1;
    for (const [childKey, childValue] of Object.entries(value)) {
      lines.push(...renderValue(childValue, childDepth, childKey));
    }
    if (lines.length === 0 && key !== undefined) {
      return [`${indent}${formatKey(key)}: {}`];
    }
    return lines;
  }

  if (key === undefined) {
    return [`${indent}${formatScalar(value)}`];
  }
  return [`${indent}${formatKey(key)}: ${formatScalar(value)}`];
}

function renderArray(key, array, depth) {
  const indent = " ".repeat(depth * 2);
  const name = key === undefined ? "items" : formatKey(key);

  if (array.length === 0) {
    return [`${indent}${name}[0]:`];
  }

  const fields = tableFields(array);
  if (fields) {
    const lines = [`${indent}${name}[${array.length}]{${fields.map(formatKey).join(",")}}:`];
    for (const item of array) {
      lines.push(`${indent}  ${fields.map((field) => formatScalar(item[field])).join(",")}`);
    }
    return lines;
  }

  const primitive = array.every((item) => !Array.isArray(item) && !isPlainObject(item));
  if (primitive) {
    if (key === "help") {
      const lines = [`${indent}${name}[${array.length}]:`];
      for (const item of array) {
        lines.push(`${indent}  ${formatScalar(item)}`);
      }
      return lines;
    }
    return [`${indent}${name}[${array.length}]: ${array.map(formatScalar).join(",")}`];
  }

  const lines = [`${indent}${name}[${array.length}]:`];
  for (const item of array) {
    if (isPlainObject(item)) {
      const entries = Object.entries(item);
      if (entries.length === 0) {
        lines.push(`${indent}  - {}`);
        continue;
      }
      const [firstKey, firstValue] = entries[0];
      if (isPlainObject(firstValue) || Array.isArray(firstValue)) {
        lines.push(`${indent}  -`);
        lines.push(...renderValue(item, depth + 2));
      } else {
        lines.push(`${indent}  - ${formatKey(firstKey)}: ${formatScalar(firstValue)}`);
        for (const [childKey, childValue] of entries.slice(1)) {
          lines.push(...renderValue(childValue, depth + 2, childKey));
        }
      }
    } else {
      lines.push(`${indent}  - ${formatScalar(item)}`);
    }
  }
  return lines;
}

function tableFields(array) {
  if (!array.every((item) => isPlainObject(item))) return null;
  const fields = Object.keys(array[0]);
  if (fields.length === 0) return null;
  for (const item of array) {
    const keys = Object.keys(item);
    if (keys.length !== fields.length) return null;
    if (!fields.every((field, index) => keys[index] === field)) return null;
    if (!fields.every((field) => !Array.isArray(item[field]) && !isPlainObject(item[field]))) return null;
  }
  return fields;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function formatKey(key) {
  if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(key)) return key;
  return quote(String(key));
}

function formatScalar(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value) || Object.is(value, -0)) return "null";
    return String(value);
  }
  return formatString(String(value));
}

function formatString(value) {
  if (value === "") return '""';
  if (/^(true|false|null)$/i.test(value)) return quote(value);
  if (/^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(value)) return quote(value);
  if (/[\n\r\t",:#\[\]{}]|^\s|\s$/.test(value)) return quote(value);
  return value;
}

function quote(value) {
  return `"${value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/[\u0000-\u001f]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`)}"`;
}
