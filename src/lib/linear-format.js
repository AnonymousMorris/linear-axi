import { asArray } from "./mcp-tools.js";

export function compactRows(alias, data) {
  if (alias === "issues") return compactIssues(data);
  return asArray(data).map((item) => ({
    id: item.id ?? item.identifier ?? item.key ?? item.slug ?? item.name ?? "",
    name: item.name ?? item.title ?? item.displayName ?? item.email ?? "",
    state: item.state?.name ?? item.status?.name ?? item.state ?? item.status ?? "",
  }));
}

export function parseFields(fields) {
  return fields.split(",").map((field) => field.trim()).filter(Boolean);
}

export function fieldHint(publicName) {
  if (publicName === "issues") return "id,title,state,assignee";
  if (publicName === "documents") return "id,title,updatedAt";
  if (publicName === "projects") return "id,name,status";
  if (publicName === "teams") return "id,name,key";
  if (publicName === "users") return "id,name,email";
  return "id,name,state";
}

export function selectFields(items, fields) {
  return items.map((item) => {
    const selected = {};
    for (const field of fields) {
      selected[field] = fieldValue(item, field);
    }
    return selected;
  });
}

export function paginationInfo(data, rowCount) {
  const total = data?.totalCount ?? data?.total ?? data?.pageInfo?.totalCount;
  const hasNextPageValue = data?.hasNextPage ?? data?.pageInfo?.hasNextPage;
  const cursor = data?.cursor ?? data?.nextCursor ?? data?.pageInfo?.endCursor;
  const hasCursor = cursor !== undefined && cursor !== null && cursor !== "";
  const hasNextPage = hasNextPageValue === undefined ? hasCursor : Boolean(hasNextPageValue);
  if (typeof total === "number") {
    return {
      count: `${rowCount} of ${total} total`,
      cursor: hasNextPage ? cursor : undefined,
    };
  }
  return {
    count: hasNextPage ? `${rowCount} returned, more available` : `${rowCount} returned`,
    cursor: hasNextPage ? cursor : undefined,
  };
}

export function compactComments(data) {
  return asArray(data).map((comment) => {
    const body = formattedPreview(comment.body ?? "", 120);
    return {
      id: comment.id ?? "",
      author: comment.user?.name ?? comment.author?.name ?? "",
      created: comment.createdAt ?? "",
      body: body.text,
      truncated: body.truncated,
    };
  });
}

export function compactCommentMutation(comment) {
  const body = formattedPreview(comment.body ?? "", 120);
  return {
    truncated: body.truncated,
    comment: {
      id: comment.id ?? "",
      author: comment.user?.name ?? comment.author?.name ?? "",
      created: comment.createdAt ?? "",
      body: body.text,
    },
  };
}

export function compactIssues(data) {
  return asArray(data).map((issue) => ({
    id: issue.identifier ?? issue.id ?? "",
    title: issue.title ?? "",
    state: issue.state?.name ?? issue.state ?? "",
    assignee: issue.assignee?.name ?? issue.assignee?.displayName ?? issue.assignee ?? "",
  }));
}

export function compactIssueDetail(issue) {
  const description = String(issue.description ?? issue.body ?? "");
  const preview = truncate(description, 1000);
  return {
    truncated: preview.truncated,
    issue: {
      id: issue.identifier ?? issue.id ?? "",
      title: issue.title ?? "",
      state: issue.state?.name ?? issue.status ?? issue.state ?? "",
      assignee: issue.assignee?.name ?? issue.assignee?.displayName ?? issue.assignee ?? "",
      description: preview.truncated
        ? `${preview.text}... (truncated, ${description.length} chars total)`
        : description,
      url: issue.url ?? "",
    },
  };
}

export function compactIssueMutation(issue) {
  return {
    id: issue.identifier ?? issue.id ?? "",
    title: issue.title ?? "",
    state: issue.state?.name ?? issue.status ?? issue.state ?? "",
    project: issue.project?.name ?? issue.project ?? "",
    team: issue.team?.name ?? issue.team ?? "",
    url: issue.url ?? "",
  };
}

export function compactProjectMutation(project) {
  return {
    id: project.id ?? "",
    name: project.name ?? "",
    status: project.status?.name ?? project.state?.name ?? project.status ?? project.state ?? "",
    team: project.team?.name ?? project.teams?.[0]?.name ?? project.team ?? "",
    url: project.url ?? "",
  };
}

export function compactDocumentMutation(document) {
  return {
    id: document.id ?? "",
    title: document.title ?? document.name ?? "",
    team: document.team?.name ?? document.team ?? "",
    project: document.project?.name ?? document.project ?? "",
    url: document.url ?? "",
  };
}

export function compactDocumentDetail(document, id) {
  const content = rewriteMcpHints(String(document.content ?? document.body ?? ""), id);
  const preview = formattedPreview(content, 1200);
  return {
    truncated: preview.truncated,
    document: {
      id: document.id ?? id ?? "",
      title: document.title ?? document.name ?? "",
      content: preview.text,
      team: document.team?.name ?? document.team ?? "",
      project: document.project?.name ?? document.project ?? "",
      url: document.url ?? "",
    },
  };
}

export function sanitizeDocument(document, id) {
  if (!document || typeof document !== "object") return document;
  return {
    ...document,
    content: document.content === undefined ? document.content : rewriteMcpHints(String(document.content), id ?? document.id),
  };
}

function fieldValue(item, field) {
  const value = field.split(".").reduce((current, part) => current?.[part], item);
  if (value === undefined) return "";
  if (value === null) return null;
  if (typeof value === "object") {
    return value.name ?? value.displayName ?? value.identifier ?? value.id ?? JSON.stringify(value);
  }
  return value;
}

function formattedPreview(value, limit) {
  const text = String(value ?? "");
  const preview = truncate(text, limit);
  if (!preview.truncated) return { text, truncated: false };
  return {
    text: `${preview.text}... (truncated, ${text.length} chars total)`,
    truncated: true,
  };
}

function rewriteMcpHints(text, id) {
  const replacement = id ? `run \`linear-axi documents view ${id} --full\`` : "run `linear-axi documents view <id> --full`";
  return text.replace(/use `get_document`/g, replacement);
}

function truncate(text, limit) {
  if (text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit), truncated: true };
}
