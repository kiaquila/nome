export const trustedAssociations = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export function isTrustedAssociation(value) {
  return trustedAssociations.has(String(value || "").toUpperCase());
}

export function extractClaudeOutcome(body) {
  const match = String(body || "").match(/^AI_REVIEW_OUTCOME:\s*(pass|advisory|block)\s*$/im);
  return match?.[1]?.toLowerCase() || null;
}

export function extractMarkerSha(body) {
  const match = String(body || "").match(/^AI_REVIEW_SHA:\s*([a-f0-9]{7,40})\s*$/im);
  return match?.[1] || null;
}

export function createAiReviewRequestMarkerBody({
  agent,
  headSha,
  requestId,
  sourceCommentId,
  sourceCommentCreatedAt,
  requestedAt
}) {
  const recordedAt = requestedAt || new Date().toISOString();
  return [
    `AI review request recorded for \`${String(headSha || "").slice(0, 10)}\`.`,
    "",
    "<!-- nome:ai-review-request",
    `AI_REVIEW_REQUEST_ID: ${requestId}`,
    `AI_REVIEW_AGENT: ${String(agent || "").trim().toLowerCase()}`,
    `AI_REVIEW_SHA: ${headSha}`,
    `AI_REVIEW_SOURCE_COMMENT_ID: ${sourceCommentId}`,
    `AI_REVIEW_SOURCE_COMMENT_CREATED_AT: ${sourceCommentCreatedAt || recordedAt}`,
    `AI_REVIEW_REQUESTED_AT: ${recordedAt}`,
    "-->"
  ].join("\n");
}

export function extractAiReviewRequestMarker(body) {
  const text = String(body || "");
  if (!text.includes("nome:ai-review-request")) return null;

  const field = (name) => text.match(new RegExp(`^${name}:\\s*(.+?)\\s*$`, "im"))?.[1]?.trim() || null;
  const requestId = field("AI_REVIEW_REQUEST_ID");
  const agent = field("AI_REVIEW_AGENT")?.toLowerCase();
  const sha = field("AI_REVIEW_SHA");
  const sourceCommentId = field("AI_REVIEW_SOURCE_COMMENT_ID");
  const sourceCommentCreatedAt = field("AI_REVIEW_SOURCE_COMMENT_CREATED_AT");
  const requestedAt = field("AI_REVIEW_REQUESTED_AT");

  if (!requestId || !agent || !sha || !sourceCommentId || !requestedAt) return null;
  if (!/^[a-f0-9]{7,40}$/i.test(sha)) return null;

  return {
    requestId,
    agent,
    sha,
    sourceCommentId,
    sourceCommentCreatedAt,
    requestedAt
  };
}

export function normalizeLogin(login) {
  return String(login || "").toLowerCase();
}

const defaultTrustedReviewLogins = {
  codex: ["chatgpt-codex-connector[bot]"],
  claude: ["claude[bot]"],
  gemini: ["gemini-code-assist[bot]"]
};

export function trustedReviewLoginsForAgent(agent, config = {}) {
  return new Set([
    ...(defaultTrustedReviewLogins[agent] || []),
    ...(config.trustedReviewLogins || []),
    ...(config.trustedReviewLoginsByAgent?.[agent] || [])
  ].map(normalizeLogin));
}

export function isTrustedReviewLogin(login, agent, config = {}) {
  return trustedReviewLoginsForAgent(agent, config).has(normalizeLogin(login));
}

export function isAiReviewRequestMarkerComment(comment, agent, headSha) {
  const login = normalizeLogin(comment?.user?.login);
  if (login !== "github-actions[bot]") return false;
  const marker = extractAiReviewRequestMarker(comment?.body);
  if (!marker) return false;
  return marker.agent === String(agent || "").toLowerCase() && marker.sha === headSha;
}

export function latestAiReviewRequestMarker(comments = [], agent, headSha) {
  return comments
    .map((comment) => {
      const marker = extractAiReviewRequestMarker(comment?.body);
      if (!marker) return null;
      return {
        ...marker,
        commentId: String(comment.id || ""),
        commentCreatedAt: comment.created_at || null,
        author: comment.user?.login || null
      };
    })
    .filter((marker) =>
      marker &&
      normalizeLogin(marker.author) === "github-actions[bot]" &&
      marker.agent === String(agent || "").toLowerCase() &&
      marker.sha === headSha
    )
    .sort((left, right) =>
      Date.parse(right.commentCreatedAt || right.requestedAt || "") -
      Date.parse(left.commentCreatedAt || left.requestedAt || "")
    )[0] || null;
}

// Project formatting only for visible contradiction checks. Protocol evidence
// continues to use its original bytes and strict grammar.
// HTML5 named whitespace/format entities (standard HTML entity names).
const htmlSpacingEntities = {"ApplyFunction": "\u2061", "InvisibleComma": "\u2063", "InvisibleTimes": "\u2062", "MediumSpace": "\u205f", "NegativeMediumSpace": "\u200b", "NegativeThickSpace": "\u200b", "NegativeThinSpace": "\u200b", "NegativeVeryThinSpace": "\u200b", "NewLine": "\n", "NoBreak": "\u2060", "NonBreakingSpace": "\u00a0", "Tab": "\t", "ThickSpace": "\u205f\u200a", "ThinSpace": "\u2009", "VeryThinSpace": "\u200a", "ZeroWidthSpace": "\u200b", "af": "\u2061", "emsp": "\u2003", "emsp13": "\u2004", "emsp14": "\u2005", "ensp": "\u2002", "hairsp": "\u200a", "ic": "\u2063", "it": "\u2062", "lrm": "\u200e", "nbsp": "\u00a0", "numsp": "\u2007", "puncsp": "\u2008", "rlm": "\u200f", "shy": "\u00ad", "thinsp": "\u2009", "zwj": "\u200d", "zwnj": "\u200c"};
// Only presentation is projected here; machine evidence keeps its original bytes.
function validMarkdownDestination(raw, allowEmpty = true) {
  raw = raw.replace(/\r\n?/g, "\n");
  if (/\n[ \t\f\v]*\n/.test(raw)) return false;
  const destination = raw.replace(/^[ \t\n\f\v]*|[ \t\n\f\v]*$/g, "");
  if (!destination) return allowEmpty;
  if (/\\([^\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e])/.test(destination)) return false;
  const match = destination.match(/^((?:<[^<>\s]*>|(?:\\.|[^\x00-\x20\x7f<>])+))(?:(?:[ \t\f\v]+(?:\n[ \t\f\v]*)?|\n[ \t\f\v]*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\)))?$/);
  if (!match) return false;
  if (match[1].startsWith("<")) return true;
  let depth = 0;
  for (let index = 0; index < match[1].length; index++) {
    if (match[1][index] === "\\") { index++; continue; }
    if (match[1][index] === "(" && ++depth > 32) return false;
    if (match[1][index] === ")" && --depth < 0) return false;
  }
  return depth === 0;
}

function validReferenceLabel(label) {
  if (label.length > 999 || !/[^ \t\r\n\f\v]/.test(label) || /\n[ \t\f\v]*\n/.test(label.replace(/\r\n?/g, "\n"))) return false;
  for (let index = 0; index < label.length; index++) {
    if (label[index] === "\\" && /[!-/:-@[-`{-~]/.test(label[index + 1] || "")) { index++; continue; }
    if (label[index] === "[" || label[index] === "]") return false;
  }
  return true;
}

// Unicode 16.0 full case-fold exceptions to per-code-point lowercase.
const unicodeCaseFold = Object.freeze({
  "\u00b5": "\u03bc", "\u00df": "ss", "\u0149": "\u02bcn", "\u017f": "s", "\u01f0": "j\u030c", "\u0345": "\u03b9", "\u0390": "\u03b9\u0308\u0301", "\u03b0": "\u03c5\u0308\u0301",
  "\u03c2": "\u03c3", "\u03d0": "\u03b2", "\u03d1": "\u03b8", "\u03d5": "\u03c6", "\u03d6": "\u03c0", "\u03f0": "\u03ba", "\u03f1": "\u03c1", "\u03f5": "\u03b5",
  "\u0587": "\u0565\u0582", "\u13a0": "\u13a0", "\u13a1": "\u13a1", "\u13a2": "\u13a2", "\u13a3": "\u13a3", "\u13a4": "\u13a4", "\u13a5": "\u13a5", "\u13a6": "\u13a6",
  "\u13a7": "\u13a7", "\u13a8": "\u13a8", "\u13a9": "\u13a9", "\u13aa": "\u13aa", "\u13ab": "\u13ab", "\u13ac": "\u13ac", "\u13ad": "\u13ad", "\u13ae": "\u13ae",
  "\u13af": "\u13af", "\u13b0": "\u13b0", "\u13b1": "\u13b1", "\u13b2": "\u13b2", "\u13b3": "\u13b3", "\u13b4": "\u13b4", "\u13b5": "\u13b5", "\u13b6": "\u13b6",
  "\u13b7": "\u13b7", "\u13b8": "\u13b8", "\u13b9": "\u13b9", "\u13ba": "\u13ba", "\u13bb": "\u13bb", "\u13bc": "\u13bc", "\u13bd": "\u13bd", "\u13be": "\u13be",
  "\u13bf": "\u13bf", "\u13c0": "\u13c0", "\u13c1": "\u13c1", "\u13c2": "\u13c2", "\u13c3": "\u13c3", "\u13c4": "\u13c4", "\u13c5": "\u13c5", "\u13c6": "\u13c6",
  "\u13c7": "\u13c7", "\u13c8": "\u13c8", "\u13c9": "\u13c9", "\u13ca": "\u13ca", "\u13cb": "\u13cb", "\u13cc": "\u13cc", "\u13cd": "\u13cd", "\u13ce": "\u13ce",
  "\u13cf": "\u13cf", "\u13d0": "\u13d0", "\u13d1": "\u13d1", "\u13d2": "\u13d2", "\u13d3": "\u13d3", "\u13d4": "\u13d4", "\u13d5": "\u13d5", "\u13d6": "\u13d6",
  "\u13d7": "\u13d7", "\u13d8": "\u13d8", "\u13d9": "\u13d9", "\u13da": "\u13da", "\u13db": "\u13db", "\u13dc": "\u13dc", "\u13dd": "\u13dd", "\u13de": "\u13de",
  "\u13df": "\u13df", "\u13e0": "\u13e0", "\u13e1": "\u13e1", "\u13e2": "\u13e2", "\u13e3": "\u13e3", "\u13e4": "\u13e4", "\u13e5": "\u13e5", "\u13e6": "\u13e6",
  "\u13e7": "\u13e7", "\u13e8": "\u13e8", "\u13e9": "\u13e9", "\u13ea": "\u13ea", "\u13eb": "\u13eb", "\u13ec": "\u13ec", "\u13ed": "\u13ed", "\u13ee": "\u13ee",
  "\u13ef": "\u13ef", "\u13f0": "\u13f0", "\u13f1": "\u13f1", "\u13f2": "\u13f2", "\u13f3": "\u13f3", "\u13f4": "\u13f4", "\u13f5": "\u13f5", "\u13f8": "\u13f0",
  "\u13f9": "\u13f1", "\u13fa": "\u13f2", "\u13fb": "\u13f3", "\u13fc": "\u13f4", "\u13fd": "\u13f5", "\u1c80": "\u0432", "\u1c81": "\u0434", "\u1c82": "\u043e",
  "\u1c83": "\u0441", "\u1c84": "\u0442", "\u1c85": "\u0442", "\u1c86": "\u044a", "\u1c87": "\u0463", "\u1c88": "\ua64b", "\u1e96": "h\u0331", "\u1e97": "t\u0308",
  "\u1e98": "w\u030a", "\u1e99": "y\u030a", "\u1e9a": "a\u02be", "\u1e9b": "\u1e61", "\u1e9e": "ss", "\u1f50": "\u03c5\u0313", "\u1f52": "\u03c5\u0313\u0300", "\u1f54": "\u03c5\u0313\u0301",
  "\u1f56": "\u03c5\u0313\u0342", "\u1f80": "\u1f00\u03b9", "\u1f81": "\u1f01\u03b9", "\u1f82": "\u1f02\u03b9", "\u1f83": "\u1f03\u03b9", "\u1f84": "\u1f04\u03b9", "\u1f85": "\u1f05\u03b9", "\u1f86": "\u1f06\u03b9",
  "\u1f87": "\u1f07\u03b9", "\u1f88": "\u1f00\u03b9", "\u1f89": "\u1f01\u03b9", "\u1f8a": "\u1f02\u03b9", "\u1f8b": "\u1f03\u03b9", "\u1f8c": "\u1f04\u03b9", "\u1f8d": "\u1f05\u03b9", "\u1f8e": "\u1f06\u03b9",
  "\u1f8f": "\u1f07\u03b9", "\u1f90": "\u1f20\u03b9", "\u1f91": "\u1f21\u03b9", "\u1f92": "\u1f22\u03b9", "\u1f93": "\u1f23\u03b9", "\u1f94": "\u1f24\u03b9", "\u1f95": "\u1f25\u03b9", "\u1f96": "\u1f26\u03b9",
  "\u1f97": "\u1f27\u03b9", "\u1f98": "\u1f20\u03b9", "\u1f99": "\u1f21\u03b9", "\u1f9a": "\u1f22\u03b9", "\u1f9b": "\u1f23\u03b9", "\u1f9c": "\u1f24\u03b9", "\u1f9d": "\u1f25\u03b9", "\u1f9e": "\u1f26\u03b9",
  "\u1f9f": "\u1f27\u03b9", "\u1fa0": "\u1f60\u03b9", "\u1fa1": "\u1f61\u03b9", "\u1fa2": "\u1f62\u03b9", "\u1fa3": "\u1f63\u03b9", "\u1fa4": "\u1f64\u03b9", "\u1fa5": "\u1f65\u03b9", "\u1fa6": "\u1f66\u03b9",
  "\u1fa7": "\u1f67\u03b9", "\u1fa8": "\u1f60\u03b9", "\u1fa9": "\u1f61\u03b9", "\u1faa": "\u1f62\u03b9", "\u1fab": "\u1f63\u03b9", "\u1fac": "\u1f64\u03b9", "\u1fad": "\u1f65\u03b9", "\u1fae": "\u1f66\u03b9",
  "\u1faf": "\u1f67\u03b9", "\u1fb2": "\u1f70\u03b9", "\u1fb3": "\u03b1\u03b9", "\u1fb4": "\u03ac\u03b9", "\u1fb6": "\u03b1\u0342", "\u1fb7": "\u03b1\u0342\u03b9", "\u1fbc": "\u03b1\u03b9", "\u1fbe": "\u03b9",
  "\u1fc2": "\u1f74\u03b9", "\u1fc3": "\u03b7\u03b9", "\u1fc4": "\u03ae\u03b9", "\u1fc6": "\u03b7\u0342", "\u1fc7": "\u03b7\u0342\u03b9", "\u1fcc": "\u03b7\u03b9", "\u1fd2": "\u03b9\u0308\u0300", "\u1fd3": "\u03b9\u0308\u0301",
  "\u1fd6": "\u03b9\u0342", "\u1fd7": "\u03b9\u0308\u0342", "\u1fe2": "\u03c5\u0308\u0300", "\u1fe3": "\u03c5\u0308\u0301", "\u1fe4": "\u03c1\u0313", "\u1fe6": "\u03c5\u0342", "\u1fe7": "\u03c5\u0308\u0342", "\u1ff2": "\u1f7c\u03b9",
  "\u1ff3": "\u03c9\u03b9", "\u1ff4": "\u03ce\u03b9", "\u1ff6": "\u03c9\u0342", "\u1ff7": "\u03c9\u0342\u03b9", "\u1ffc": "\u03c9\u03b9", "\uab70": "\u13a0", "\uab71": "\u13a1", "\uab72": "\u13a2",
  "\uab73": "\u13a3", "\uab74": "\u13a4", "\uab75": "\u13a5", "\uab76": "\u13a6", "\uab77": "\u13a7", "\uab78": "\u13a8", "\uab79": "\u13a9", "\uab7a": "\u13aa",
  "\uab7b": "\u13ab", "\uab7c": "\u13ac", "\uab7d": "\u13ad", "\uab7e": "\u13ae", "\uab7f": "\u13af", "\uab80": "\u13b0", "\uab81": "\u13b1", "\uab82": "\u13b2",
  "\uab83": "\u13b3", "\uab84": "\u13b4", "\uab85": "\u13b5", "\uab86": "\u13b6", "\uab87": "\u13b7", "\uab88": "\u13b8", "\uab89": "\u13b9", "\uab8a": "\u13ba",
  "\uab8b": "\u13bb", "\uab8c": "\u13bc", "\uab8d": "\u13bd", "\uab8e": "\u13be", "\uab8f": "\u13bf", "\uab90": "\u13c0", "\uab91": "\u13c1", "\uab92": "\u13c2",
  "\uab93": "\u13c3", "\uab94": "\u13c4", "\uab95": "\u13c5", "\uab96": "\u13c6", "\uab97": "\u13c7", "\uab98": "\u13c8", "\uab99": "\u13c9", "\uab9a": "\u13ca",
  "\uab9b": "\u13cb", "\uab9c": "\u13cc", "\uab9d": "\u13cd", "\uab9e": "\u13ce", "\uab9f": "\u13cf", "\uaba0": "\u13d0", "\uaba1": "\u13d1", "\uaba2": "\u13d2",
  "\uaba3": "\u13d3", "\uaba4": "\u13d4", "\uaba5": "\u13d5", "\uaba6": "\u13d6", "\uaba7": "\u13d7", "\uaba8": "\u13d8", "\uaba9": "\u13d9", "\uabaa": "\u13da",
  "\uabab": "\u13db", "\uabac": "\u13dc", "\uabad": "\u13dd", "\uabae": "\u13de", "\uabaf": "\u13df", "\uabb0": "\u13e0", "\uabb1": "\u13e1", "\uabb2": "\u13e2",
  "\uabb3": "\u13e3", "\uabb4": "\u13e4", "\uabb5": "\u13e5", "\uabb6": "\u13e6", "\uabb7": "\u13e7", "\uabb8": "\u13e8", "\uabb9": "\u13e9", "\uabba": "\u13ea",
  "\uabbb": "\u13eb", "\uabbc": "\u13ec", "\uabbd": "\u13ed", "\uabbe": "\u13ee", "\uabbf": "\u13ef", "\ufb00": "ff", "\ufb01": "fi", "\ufb02": "fl",
  "\ufb03": "ffi", "\ufb04": "ffl", "\ufb05": "st", "\ufb06": "st", "\ufb13": "\u0574\u0576", "\ufb14": "\u0574\u0565", "\ufb15": "\u0574\u056b", "\ufb16": "\u057e\u0576",
  "\ufb17": "\u0574\u056d",
});

export const caseFoldLabel = (label) => Array.from(label, (character) => unicodeCaseFold[character] ?? character.toLowerCase()).join("");

function markdownLinkLabels(text, knownReferences = null, onLink = null, codeLiterals = []) {
  const references = knownReferences || new Set();
  if (!knownReferences) {
    const lines = text.split(/\r\n|\r|\n/);
    const definitionLines = new Set();
    const footnoteDefinitions = new Map();
    for (let index = 0; index < lines.length; index++) {
      const definition = lines[index].match(/^ {0,3}\[\^([^\]\n]+)\]:[ \t]*(.*)$/);
      if (definition && validReferenceLabel(definition[1]) && !/[ \t\r\n\f\v]/.test(definition[1])) footnoteDefinitions.set(index, caseFoldLabel(definition[1]));
    }
    const footnoteLines = new Map();
    const ownedFootnoteLines = new Set(footnoteDefinitions.keys());
    for (const [index] of footnoteDefinitions) {
      const owned = [index];
      for (let next = index + 1; next < lines.length && !footnoteDefinitions.has(next); next++) {
        const literal = lines[next].match(/^\uE002(\d+)\uE003$/);
        if (!/^[ \t]+\S/.test(lines[next]) && !(literal && /^(?: {4}|\t)/.test(codeLiterals[Number(literal[1])] || ""))) break;
        owned.push(next); ownedFootnoteLines.add(next);
      }
      footnoteLines.set(index, owned);
    }

    for (let index = 0; index < lines.length; index++) {
      const definition = lines[index].match(/^ {0,3}\[([^\]\n]+)\]:[ \t\f\v]*(.*)$/);
      if (!definition || !validReferenceLabel(definition[1]) || footnoteDefinitions.has(index)) continue;
      const destinationIndex = definition[2] ? index : index + 1;
      let destination = definition[2] || (/^ {0,3}\S/.test(lines[destinationIndex] || "") ? lines[destinationIndex] : "");
      let valid = validMarkdownDestination(destination, false), consumed = destinationIndex;
      // A reference title can begin on the next line and continue without a blank line.
      if ((!valid || /^(?:<[^<>\s]*>|(?:\\.|[^\s<>])+)$/.test(destination.trim())) &&
          /^ {0,3}["'(]/.test(lines[destinationIndex + 1] || "")) {
        let candidate = destination;
        for (let next = destinationIndex + 1; next < lines.length && !/^[ \t\f\v]*$/.test(lines[next]); next++) {
          candidate += "\n" + lines[next];
          if (validMarkdownDestination(candidate, false)) { destination = candidate; valid = true; consumed = next; break; }
        }
      }
      if (valid) {
        references.add(caseFoldLabel(definition[1].trim().replace(/\s+/g, " ")));
        for (let line = index; line <= consumed; line++) definitionLines.add(line);
        index = consumed;
      }
    }
    const footnoteSource = lines.map((line, index) => (ownedFootnoteLines.has(index) || definitionLines.has(index)) ? "" : line).join("\n");
    const usedFootnotes = new Set();
    const collectFootnotes = (source) => {
      source = markdownLinkLabels(protectMarkdownCode(source.replace(/^ {1,4}/gm, ""), []), references);
      for (let index = 0; index < source.length; index++) {
        if (!source.startsWith("[^", index)) continue;
        let escaped = 0;
        for (let previous = index - 1; previous >= 0 && source[previous] === "\\"; previous--) escaped++;
        if (escaped % 2) continue;
        const end = source.indexOf("]", index + 2);
        if (end >= 0) usedFootnotes.add(caseFoldLabel(source.slice(index + 2, end)));
      }
    };
    collectFootnotes(footnoteSource);
    let priorSize;
    do {
      priorSize = usedFootnotes.size;
      for (const [index, label] of footnoteDefinitions) if (usedFootnotes.has(label)) collectFootnotes(footnoteLines.get(index).map((line) => lines[line].replace(/\uE002(\d+)\uE003/g, (_, slot) => /^(?: {4}|\t)/.test(codeLiterals[Number(slot)] || "") ? codeLiterals[Number(slot)] : "")).join("\n"));
    } while (usedFootnotes.size !== priorSize);
    for (const [index, label] of footnoteDefinitions) if (!usedFootnotes.has(label)) for (const line of footnoteLines.get(index)) lines[line] = "";

    text = lines.map((line, index) => definitionLines.has(index) ? "" : line).join("\n");
  }
  let result = "";
  for (let index = 0; index < text.length;) {
    const linePrefix = text.slice(text.lastIndexOf("\n", index - 1) + 1, index);
    const fence = /^ {0,3}$/.test(linePrefix) && text.slice(index).match(/^(`{3,}|~{3,})[^\n]*(?:\n|$)/);
    if (fence) {
      const close = new RegExp("^ {0,3}" + fence[1][0] + "{" + fence[1].length + ",}[ \t]*$", "m").exec(text.slice(index + fence[0].length));
      const end = close ? index + fence[0].length + close.index + close[0].length : text.length;
      result += text.slice(index, end); index = end; continue;
    }
    if (text[index] === "`") {
      let escaped = 0;
      for (let previous = index - 1; previous >= 0 && text[previous] === "\\"; previous--) escaped++;
      if (escaped % 2) { result += text[index++]; continue; }
      const run = text.slice(index).match(/^`+/)[0];
      let end = index + run.length;
      while ((end = text.indexOf(run, end)) >= 0 && (text[end - 1] === "`" || text[end + run.length] === "`")) end += run.length;
      if (end >= 0) { result += text.slice(index, end + run.length); index = end + run.length; continue; }
    }
    if (text[index] !== "[") { result += text[index++]; continue; }
    let escapes = 0;
    for (let previous = index - 1; previous >= 0 && text[previous] === "\\"; previous--) escapes++;
    if (escapes % 2) { result += text[index++]; continue; }
    let labelEnd = index + 1, brackets = 1;
    for (; labelEnd < text.length && brackets; labelEnd++) {
      if (text[labelEnd] === "\\") { labelEnd++; continue; }
      if (text[labelEnd] === "[") brackets++;
      if (text[labelEnd] === "]") brackets--;
    }
    const label = text.slice(index + 1, labelEnd - 1);
    if (/\n[ \t\f\v]*\n/.test(label.replace(/\r\n?/g, "\n"))) { result += text[index++]; continue; }
    const labelReference = caseFoldLabel(label.trim().replace(/\s+/g, " "));
    let nestedLink = false;
    if (!brackets && label.includes("[")) markdownLinkLabels(label, references, () => { nestedLink = true; });
    // GFM gives an inner active link precedence; the outer destination stays literal.
    if (nestedLink) { result += text[index++]; continue; }
    if (!brackets && text[labelEnd] !== "[" && text[labelEnd] !== "(" && references.has(labelReference)) {
      if (text[index - 1] !== "!") onLink?.();
      result += label;
      index = labelEnd;
      continue;
    }
    if (!brackets && text[labelEnd] === "[") {
      const referenceEnd = text.indexOf("]", labelEnd + 1);
      const reference = caseFoldLabel(text.slice(labelEnd + 1, referenceEnd).trim().replace(/\s+/g, " ")) || labelReference;
      if (referenceEnd >= 0 && references.has(reference)) {
        if (text[index - 1] !== "!") onLink?.();
        result += text.slice(index + 1, labelEnd - 1);
        index = referenceEnd + 1;
        continue;
      }
    }
    if (brackets || text[labelEnd] !== "(") { result += text[index++]; continue; }
    let destinationEnd = labelEnd + 1, parentheses = 1, titleQuote = null;
    for (; destinationEnd < text.length && parentheses; destinationEnd++) {
      if (text[destinationEnd] === "\\") { destinationEnd++; continue; }
      const character = text[destinationEnd];
      if (titleQuote) { if (character === titleQuote) titleQuote = null; continue; }
      if ((character === '"' || character === "'") && /[ \t\r\n\f\v]/.test(text[destinationEnd - 1])) { titleQuote = character; continue; }
      if (text[destinationEnd] === "(") parentheses++;
      if (text[destinationEnd] === ")") parentheses--;
    }
    const rawDestination = text.slice(labelEnd + 1, destinationEnd - 1);
    if (parentheses || !validMarkdownDestination(rawDestination)) { result += text[index++]; continue; }
    if (text[index - 1] !== "!") onLink?.();
    result += text.slice(index + 1, labelEnd - 1);
    index = destinationEnd;
  }
  return result;
}

const reviewBlockTags = new Set(["address", "article", "aside", "blockquote", "br", "details", "div", "dl", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "th", "thead", "tr", "ul"]);
function htmlVisibleText(text, inlineBoundary, literals = [], rawBlock = false) {
  let result = "";
  for (let index = 0; index < text.length;) {
    if (text[index] !== "<") { result += text[index++]; continue; }
    if (text.startsWith("<!--", index)) {
      const comment = text.slice(index).match(/^<!--(?:>|->|[\s\S]*?(?:-->|--!>|$))/);
      index += comment[0].length;
      continue;
    }
    const tag = text.slice(index).match(/^<\/?([a-z][a-z0-9-]*)(?=[\s/>])/i);
    if (!tag) { result += text[index++]; continue; }
    let end = index + tag[0].length, quote = null;
    for (; end < text.length; end++) {
      const character = text[end];
      if (quote) { if (character === quote) quote = null; }
      else if (character === '"' || character === "'") quote = character;
      else if (character === ">") break;
    }
    if (end === text.length) { result += text.slice(index); break; }
    if (!rawBlock && text[index + 1] === "/" && !/^<\/[A-Za-z][A-Za-z0-9-]*[ \t\r\n\f]*>$/.test(text.slice(index, end + 1))) { result += text.slice(index, end + 1); index = end + 1; continue; }
    if (!rawBlock && text[index + 1] !== "/" && !/^<[A-Za-z][A-Za-z0-9-]*(?:[ \t\r\n\f]+[A-Za-z_:][A-Za-z0-9_.:-]*(?:[ \t\r\n\f]*=[ \t\r\n\f]*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*[ \t\r\n\f]*\/?>$/.test(text.slice(index, end + 1))) { result += text.slice(index, end + 1); index = end + 1; continue; }
    if (["code", "pre"].includes(tag[1].toLowerCase()) && text[index + 1] !== "/") {
      const closing = new RegExp("</" + tag[1] + "[ \t\r\n]*>", "i").exec(text.slice(end + 1));
      const closeAt = closing ? end + 1 + closing.index : text.length;
      const literal = htmlVisibleText(text.slice(end + 1, closeAt), inlineBoundary, literals, rawBlock)
        .replace(/\uE000(\d+)\uE001/g, (_, index) => literals[Number(index)]);
      const slot = literals.push(literal) - 1;
      result += "\uE000" + slot + "\uE001";
      index = closing ? closeAt + closing[0].length : text.length;
      continue;
    }
    if (tag[1].toLowerCase() === "img") {
      const attributes = text.slice(index + tag[0].length, end);
      const alt = [...attributes.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].find((attribute) => attribute[1].toLowerCase() === "alt");
      if (alt) result += " " + (alt[2] ?? alt[3] ?? alt[4] ?? "") + " ";
    }
    result += reviewBlockTags.has(tag[1].toLowerCase()) ? " " : inlineBoundary;
    index = end + 1;
  }
  return result;
}

function protectMarkdownCode(text, literals, keepLines = false) {
  let result = "";
  const keep = (literal) => "\uE002" + (literals.push(literal) - 1) + "\uE003" + (keepLines ? literal.replace(/[^\n]/g, "") : "");
  for (let index = 0; index < text.length;) {
    const lineStart = index === 0 || text[index - 1] === "\n";
    if (lineStart && /^(?: {0,3}(?:>[ \t]?|(?:[-+*]|[0-9]{1,9}[.)])[ \t]))*(?: {4}|\t)/.test(text.slice(index))) {
      const end = text.indexOf("\n", index);
      const stop = end < 0 ? text.length : end;
      result += keep(text.slice(index, stop)); index = stop; continue;
    }
    const fence = lineStart && text.slice(index).match(/^(?: {0,3}(?:>[ \t]?|(?:[-+*]|[0-9]{1,9}[.)])[ \t]))* {0,3}(`{3,}|~{3,})[^\n]*(?:\n|$)/);
    if (fence) {
      const close = new RegExp("^(?: {0,3}(?:>[ \t]?|(?:[-+*]|[0-9]{1,9}[.)])[ \t]))* {0,3}" + fence[1][0] + "{" + fence[1].length + ",}[ \t]*$", "m").exec(text.slice(index + fence[0].length));
      const end = close ? index + fence[0].length + close.index + close[0].length : text.length;
      result += keep(text.slice(index, end)); index = end; continue;
    }
    if (text[index] === "`") {
      let escaped = 0;
      for (let previous = index - 1; previous >= 0 && text[previous] === "\\"; previous--) escaped++;
      if (escaped % 2) { result += text[index++]; continue; }
      const run = text.slice(index).match(/^`+/)[0];
      let end = index + run.length;
      while ((end = text.indexOf(run, end)) >= 0 && (text[end - 1] === "`" || text[end + run.length] === "`")) end += run.length;
      if (end >= 0) { result += keep(text.slice(index, end + run.length)); index = end + run.length; continue; }
    }
    result += text[index++];
  }
  return result;
}

// Raw HTML blocks render HTML but do not interpret Markdown in their contents.
function protectHtmlBlockMarkdown(text, inlineBoundary, literals, blockLiterals) {
  text = text.replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  const peel = (line) => line.replace(/^(?: {0,3}(?:>[ \t]?|(?:[-+*]|[0-9]{1,9}[.)])[ \t]))*/, "");
  const eligible = protectMarkdownCode(text, [], true).split("\n").map(peel);
  const blockNames = "address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul";
  const blockTag = new RegExp("^ {0,3}</?(?:" + blockNames + ")(?=[ \\t\\f/>]|$)", "i");
  const completeTag = /^ {0,3}(?:<\/[A-Za-z][A-Za-z0-9-]*[ \t\f]*>|<[A-Za-z][A-Za-z0-9-]*(?:[ \t\f]+[^\s"'<>/=]+(?:[ \t\f]*=[ \t\f]*(?:[^\s"'=<>`]+|'[^']*'|"[^"]*"))?)*[ \t\f]*\/?>)[ \t\f]*$/;
  let paragraph = false;
  for (let index = 0; index < lines.length; index++) {
    const line = eligible[index] || "";
    const raw = line.match(/^ {0,3}<(script|pre|style|textarea)(?=[ \t\f>]|$)/i);
    let terminator = raw ? new RegExp("</" + raw[1] + "[ \\t\\f]*>", "i") : null;
    if (/^ {0,3}<!--/.test(line)) terminator = /(?:^ {0,3}<!--(?:>|->)|-->|--!>)/;
    else if (/^ {0,3}<\?/.test(line)) terminator = /\?>/;
    else if (/^ {0,3}<![A-Z]/.test(line)) terminator = />/;
    else if (/^ {0,3}<!\[CDATA\[/.test(line)) terminator = /\]\]>/;
    const blankEnded = !terminator && (blockTag.test(line) || (!paragraph && completeTag.test(line)));
    if (!terminator && !blankEnded) {
      if (!line.trim()) paragraph = false;
      else if (!(!paragraph && /^(?: {4}|\t|\uE002)/.test(line))) paragraph = true;
      continue;
    }
    paragraph = false;
    const expandTabs = (value) => {
      let column = 0;
      return value.replace(/[^\t]|\t/g, (character) => {
        if (character !== "\t") { column++; return character; }
        const width = 4 - column % 4; column += width; return " ".repeat(width);
      });
    };
    const containers = [];
    let opening = expandTabs(lines[index]);
    for (;;) {
      const prefix = opening.match(/^ {0,3}(?:>[ \t]?|(?:[-+*]|[0-9]{1,9}[.)])[ \t]+)/);
      if (!prefix) break;
      containers.push(prefix[0].includes(">") ? { quote: true } : { indent: prefix[0].length });
      opening = opening.slice(prefix[0].length);
    }
    const withinContainer = (value) => {
      value = expandTabs(value);
      for (const container of containers) {
        if (container.quote) {
          const prefix = value.match(/^ {0,3}>[ \t]?/);
          if (!prefix) return false;
          value = value.slice(prefix[0].length);
        } else {
          if (!value.trim()) continue;
          if ((value.match(/^[ \t]*/)?.[0].length || 0) < container.indent) return false;
          value = value.slice(container.indent);
        }
      }
      return true;
    };
    let end = index;
    if (terminator) { while (end < lines.length - 1 && !terminator.test(lines[end]) && withinContainer(lines[end + 1])) end++; }
    else { while (end + 1 < lines.length && withinContainer(lines[end + 1]) && peel(lines[end + 1]).trim()) end++; }
    const visible = htmlVisibleText(lines.slice(index, end + 1).join("\n"), inlineBoundary, literals, true)
      .replace(/\uE000(\d+)\uE001/g, (_, slot) => literals[Number(slot)]);
    const decoded = visible.replace(/&#(x[0-9a-f]+|[0-9]+);?/gi, (entity, value) => {
      const point = value[0].toLowerCase() === "x" ? parseInt(value.slice(1), 16) : Number(value);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    }).replace(/&(?:nbsp|shy);?/g, (entity) => entity.startsWith("&nbsp") ? "\u00a0" : "\u00ad")
      .replace(/&([A-Za-z][A-Za-z0-9]*);/g, (entity, name) => htmlSpacingEntities[name] ?? entity);
    const slot = blockLiterals.push(decoded) - 1;
    lines[index] = "\uE005" + slot + "\uE006";
    for (let inner = index + 1; inner <= end; inner++) lines[inner] = "";
    index = end;
  }
  return lines.join("\n");
}

// CommonMark delimiter runs: flanking, intraword underscores, and rule of three.
function activeMarkdownEmphasis(text) {
  const removed = new Set();
  const runs = [];
  const whitespace = (value) => !value || /\s/u.test(value);
  const punctuation = (value) => !!value && /[\p{P}\p{S}]/u.test(value);
  const escaped = (index) => ((text.slice(0, index).match(/\\+$/)?.[0].length || 0) % 2) === 1;
  // Matched code-span delimiters disappear; their literal content is protected
  // by the existing code-context stage before this projection.
  const ticks = [...text.matchAll(/`+/g)];
  let consumed = 0;
  for (let i = 0; i < ticks.length; i += 1) {
    const start = ticks[i];
    if (start.index < consumed || escaped(start.index)) continue;
    const end = ticks.slice(i + 1).find((run) => run[0].length === start[0].length);
    if (!end) continue;
    for (let j = 0; j < start[0].length; j += 1) { removed.add(start.index + j); removed.add(end.index + j); }
    consumed = end.index + end[0].length;
  }
  for (const match of text.matchAll(/\*+|_+|~{2,}/g)) {
    if (escaped(match.index)) continue;
    const before = [...text.slice(0, match.index)].at(-1) || "";
    const after = [...text.slice(match.index + match[0].length)][0] || "";
    const left = !whitespace(after) && (!punctuation(after) || whitespace(before) || punctuation(before));
    const right = !whitespace(before) && (!punctuation(before) || whitespace(after) || punctuation(after));
    runs.push({ character: match[0][0], start: match.index, length: match[0].length, usedOpen: 0, usedClose: 0,
      open: match[0][0] === "_" ? left && (!right || punctuation(before)) : left,
      close: match[0][0] === "_" ? right && (!left || punctuation(after)) : right });
  }
  for (let closeIndex = 0; closeIndex < runs.length; closeIndex += 1) {
    const closer = runs[closeIndex];
    if (!closer.close) continue;
    for (let openIndex = closeIndex - 1; openIndex >= 0 && closer.length - closer.usedClose >= (closer.character === "~" ? 2 : 1); openIndex -= 1) {
      const opener = runs[openIndex];
      if (!opener.open || opener.character !== closer.character || /\r?\n[ \t\f\v]*\r?\n/.test(text.slice(opener.start, closer.start))) continue;
      let availableOpen = opener.length - opener.usedOpen - opener.usedClose;
      let availableClose = closer.length - closer.usedOpen - closer.usedClose;
      if (availableOpen < (closer.character === "~" ? 2 : 1)) continue;
      if (closer.character !== "~" && (opener.close || closer.open) &&
          (availableOpen + availableClose) % 3 === 0 && (availableOpen % 3 !== 0 || availableClose % 3 !== 0)) continue;
      while (availableOpen >= (closer.character === "~" ? 2 : 1) && availableClose >= (closer.character === "~" ? 2 : 1)) {
        const count = availableOpen >= 2 && availableClose >= 2 ? 2 : 1;
        for (let j = 0; j < count; j += 1) {
          removed.add(opener.start + opener.length - opener.usedOpen - 1 - j);
          removed.add(closer.start + closer.usedClose + j);
        }
        opener.usedOpen += count; closer.usedClose += count;
        for (let nested = openIndex + 1; nested < closeIndex; nested += 1) { runs[nested].open = false; runs[nested].close = false; }
        availableOpen -= count; availableClose -= count;
      }
    }
  }
  return text.split("").map((character, index) => removed.has(index) ? "" : character).join("");
}

function visibleReviewText(body, inlineBoundary = "") {
  // Structural parsing uses raw bytes: entities cannot create quotes, tags or links.
  const literals = [];
  const blockLiterals = [];
  const markdownLiterals = [];
  const htmlProtected = protectHtmlBlockMarkdown(String(body || ""), inlineBoundary, literals, blockLiterals);
  const protectedCode = protectMarkdownCode(htmlProtected, markdownLiterals);
  const commentsRemoved = protectedCode.replace(/<!--(?:>|->|[\s\S]*?(?:-->|--!>|$))/g,
    (comment) => comment.replace(/[^\r\n]/g, ""));
  const rendered = activeMarkdownEmphasis(markdownLinkLabels(htmlVisibleText(commentsRemoved, inlineBoundary, literals), null, null, markdownLiterals))
    .replace(/\uE000(\d+)\uE001/g, (_, index) => literals[Number(index)]);
  return rendered.replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (entity, value) => {
    const point = value[0].toLowerCase() === "x" ? parseInt(value.slice(1), 16) : Number(value);
    return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  }).replace(/&([A-Za-z][A-Za-z0-9]*);/g, (entity, name) => htmlSpacingEntities[name] ?? entity)
    .replace(/\uE005(\d+)\uE006/g, (_, index) => blockLiterals[Number(index)])
    .replace(/\uE002(\d+)\uE003/g, (_, index) => {
      const literal = markdownLiterals[Number(index)];
      const delimiter = literal.match(/^`+/)?.[0];
      return delimiter && literal.endsWith(delimiter) ? literal.slice(delimiter.length, -delimiter.length) : literal;
    })
    .replace(/\bdo[\s\p{Default_Ignorable_Code_Point}]+not[\s\p{Default_Ignorable_Code_Point}]+merge\b/giu, "Do not merge").replace(/\p{Default_Ignorable_Code_Point}/gu, "").replace(/\r\n?/g, "\n").replace(/\n[ \t\f\v]*\n/g, "\uE004").replace(/\s+/g, " ").replace(/\uE004/g, "\n\n");
}

function hasPositiveFindingStatement(text) {
  const paragraphs = String(text).replace(/\r\n/g, "\n").split(/[\r\n][ \t\f\v]*[\r\n]/);
  return paragraphs.some((paragraph) => paragraph.replace(/[ \t\r\n\f\v]+/g, " ")
    .replace(/\b(no|zero) +(?:(?!(?:issues?|findings?|problems?|bugs?)\b)[\p{L}-]+ +)+(?:and|or) +(?:(?!(?:issues?|findings?|problems?|bugs?)\b)[\p{L}-]+ +)*((?:issues?|findings?|problems?|bugs?)\b)/giu, "$1 $2")
    .split(/[.!?;]|(?<![0-9]),|,(?![0-9])|\b(?:and|or|but|however|yet)\b/i).some((clause) => {
      // Negating a resolution preserves the finding, unlike negating its noun.
      clause = clause.replace(/\b(?:not|never) +(?:been +)?(?:resolved|fixed|addressed|cleared|removed|closed)\b|\b(?:is|are|was|were|has|have)n['’]t +(?:been +)?(?:resolved|fixed|addressed|cleared|removed|closed)\b/gi, " unresolved ");
      const noun = "(?<![\\p{L}\\p{N}_\\p{Pd}])(?:issues?|findings?|problems?|bugs?)(?![\\p{L}\\p{N}_\\p{Pd}])";
      const isAffirmative = (match, counted = false) => {
        const before = clause.slice(0, match.index);
        const after = clause.slice(match.index + match[0].length);
        if (!counted && /^ *: *(?:no|none|zero|0+(?:,000)*)(?![\p{L}\p{N}_])/iu.test(after)) return false;
        // Scope negation to this construction, not an unrelated earlier clause.
        if (/\b(?:no|zero|not|without|never|cannot)\b|\b[\p{L}]+n['’]t\b/iu.test(match[0])) return false;
        if (/(?:\b(?:no|zero|not|without|never|cannot)|\b[\p{L}]+n['’]t)(?: +(?:be|been|being|considered))* +$/iu.test(before)) return false;
        if (/\b(?:resolved|fixed|addressed|cleared|removed|closed)\b/i.test(match[0])) return false;
        if (/^ +(?:(?:that|which) +)?(?:(?:is|are|was|were|has|have|been|now) +)*(?:resolved|fixed|addressed|cleared|removed|closed)\b/i.test(after)) return false;
        return true;
      };
      const counts = [...clause.matchAll(new RegExp("(?<![\\p{L}\\p{N}_])[*_~`]*([0-9]+(?:,[0-9]{3})*)[*_~`]* +(?:[\\p{L}-]+ +)*?" + noun, "giu"))];
      if (counts.some((match) => !/^0+$/.test(match[1].replaceAll(",", "")) && isAffirmative(match, true))) return true;
      const reporting = clause.replace(new RegExp("(?<![\\p{L}\\p{N}_])[*_~`]*0+(?:,000)*[*_~`]* +(?:[\\p{L}-]+ +)*?" + noun, "giu"), (match) => " ".repeat(match.length));
      const patterns = [
        "\\b(?:found|[\\p{L}]+ed) +(?:[\\p{L}-]+ +)*?" + noun,
        "(?:\\b(?:a|an|one|some|several|multiple|[0-9]+) +(?:[\\p{L}-]+ +)*?" + noun + "|\\bthe +" + noun + "|(?<![\\p{L}\\p{N}_] )" + noun + ")" + " +(?:(?:is|are|was|were|has|have|been) +)*(?:found|[\\p{L}]+ed|remains?|exists?)\\b",
        "\\bthere +(?:is|are) +(?:[\\p{L}-]+ +)*?" + noun,
        "\\b(?:a|an) +(?:[\\p{L}-]+ +)*?" + noun + " +(?:(?:is|are|was|were) +[\\p{L}-]+|(?!(?:is|was|has)\\b)[\\p{L}]+s)\\b"
      ];
      return patterns.some((pattern) => [...reporting.matchAll(new RegExp(pattern, "giu"))].some((match) => isAffirmative(match)));
    }));
}


export function containsBlockingSeverity(body, agent) {
  const text = agent === "codex" ? visibleReviewText(body) : String(body || "");
  if (agent === "codex") {
    return hasPositiveFindingStatement(text) || /\bP[0-2]\b|\bdo not merge\b|\bsecurity review failed\b|\breview pending\b|\bchanges requested\b/i.test(text) || /\bdo not merge\b/i.test(visibleReviewText(body, " "));
  }
  if (agent === "gemini") {
    return /\b(critical|high)\b/i.test(text);
  }
  return false;
}

export function extractCodexPriority(body) {
  const priorities = [...String(body || "").matchAll(/\bP([0-3])\b/gi)].map((match) => Number(match[1]));
  return priorities.length ? Math.min(...priorities) : null;
}



function codeCompletionTime(comment) {
  const rows = String(comment?.body || "").split(/\r?\n/).filter((line) => line.startsWith("|") && line.includes("**Code Review**"));
  if (rows.length !== 1) return null;
  const match = rows[0].match(/\| ✅ \*\*Completed\*\* <relative-time datetime="([^"]+)">([^<]+)<\/relative-time> \|/);
  const value = match && match[1] === match[2] ? Date.parse(match[1]) : NaN;
  const edited = Date.parse(comment?.updated_at || comment?.created_at || "");
  return Number.isFinite(value) && Number.isFinite(edited) && value <= edited + 999 ? match[1] : null;
}

export function verdictTime(comment, result, headSha = null, config = {}) {
  {
    const state = validatedTypedState(comment);
    if (state && validFindingCompanions(comment, state, headSha, config)) {
      const clocks = ["code_review", "security_review"].filter((kind) =>
        (headSha === null || state[kind].commit_sha === headSha) &&
        (state[kind].has_any_findings === true || state[kind].has_unresolved_findings === true)
      ).map((kind) => negativeSectionTime(comment, state, kind, state[kind].commit_sha, config));
      if (clocks.length && clocks.every(Number.isFinite)) return new Date(Math.max(...clocks) * 1000).toISOString();
    }
  }

  return ["pass", "neutral"].includes(result) && String(comment?.body || "").trim().startsWith(summaryMarker)
    ? codeCompletionTime(comment) : result === "pass" ? comment?.created_at : comment?.updated_at || comment?.created_at;
}

const receiptMarker = "<!-- codex-review-receipt:v1 -->";
const summaryMarker = "<!-- codex-pull-request-review-summary -->";

export function isCodexReviewSignal(body) {
  const text = String(body || "").trim().replace(/^(?:<!--(?! codex-)[\s\S]*?-->\s*)+/gi, "");
  return /^Codex Review:/i.test(text) ||
    /^<!-- (?:codex-review-receipt:|codex-pull-request-review-summary(?: |-->)|codex-review-state:)/i.test(text);
}

export function reviewEvidenceTimestamp(comment) {
  return comment?.updated_at || comment?.created_at;
}

function isAfterRequest(comment, requestMarker, timestamp = reviewEvidenceTimestamp(comment)) {
  const requestedAt = Date.parse(requestMarker?.sourceCommentCreatedAt ||
    requestMarker?.requestedAt || requestMarker?.commentCreatedAt || "");
  const updatedAt = Date.parse(timestamp || "");
  return Number.isFinite(requestedAt) && Number.isFinite(updatedAt) && updatedAt >= requestedAt;
}

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

function reviewStateIsValid(state) {
  return exactKeys(state, ["commit_sha", "has_any_findings", "has_unresolved_findings", "status"]) &&
    (state.commit_sha === null || (typeof state.commit_sha === "string" && /^[a-f0-9]{40}$/.test(state.commit_sha))) &&
    [null, true, false].includes(state.has_any_findings) &&
    [null, true, false].includes(state.has_unresolved_findings) &&
    [null, "queued", "running", "in_progress", "completed"].includes(state.status) &&
    !(state.has_any_findings === false && state.has_unresolved_findings === true);
}

function withoutCodexFooter(body) {
  if ((body.match(/<details>/g) || []).length !== (body.match(/<\/details>/g) || []).length) return null;
  if ((body.match(/<details>/g) || []).length > 1 || containsBlockingSeverity(body, "codex") ||
      /unresolved (?:issues|findings)|found (?:some |major )?(?:issues|findings)/i.test(body)) return null;
  return body.replace(/\s*<details>\s*<summary>ℹ️ About Codex in GitHub<\/summary>[\s\S]*<\/details>\s*$/, "").trim();
}

function renderedSummaryAgrees(rendered, state, headSha, requestMarker) {
  const text = withoutCodexFooter(rendered);
  if (text === null) return false;

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const introduction = "This comment shows the latest Codex review activity on this pull request.";
  if (lines.shift() !== introduction || lines.shift() !== "| Review | Status | Commit | Review trigger |" ||
      lines.shift() !== "| --- | --- | --- | --- |") return false;
  const expectedReviews = state.security_review.status === null ? ["Code Review"] : ["Code Review", "Security Review"];
  if (lines.length !== expectedReviews.length) return false;
  return lines.every((line, index) => {
    const row = line.match(/^\| (📝|🛡️|🔒) \*\*(Code Review|Security Review)\*\* \| ✅ \*\*Completed\*\* <relative-time datetime="([^"]+)">([^<]+)<\/relative-time> \| `([a-f0-9]{7})` \| (?:Manual request|Automatic review) \|$/);
    return row && row[2] === expectedReviews[index] && (row[2] !== "Code Review" || row[1] === "📝") &&
      row[3] === row[4] && Number.isFinite(Date.parse(row[3])) &&
      (row[2] !== "Code Review" || (Number.isFinite(Date.parse(requestMarker?.sourceCommentCreatedAt || requestMarker?.requestedAt || requestMarker?.commentCreatedAt || "")) &&
        Math.floor(Date.parse(row[3]) / 1000) > Math.floor(Date.parse(requestMarker.sourceCommentCreatedAt || requestMarker.requestedAt || requestMarker.commentCreatedAt) / 1000))) && row[5] === headSha.slice(0, 7);
  });
}

// Parse a closed schema. Unknown versions, duplicate JSON keys/markers and prose
// cannot silently become a positive verdict. The native summary is mutable.
export function classifyCodexSummaryComment(comment, headSha, requestMarker = null, config = {}) {
  if (hasIndentedCodexEnvelope(comment?.body)) return null;
  if (!/^[a-f0-9]{40}$/.test(headSha || "") ||
      !isTrustedReviewLogin(comment?.user?.login, "codex", config)) return null;
  const body = String(comment?.body || "").trim();
  if (!isCodexReviewSignal(body)) return null;

  if (body.startsWith(summaryMarker) || body.startsWith("<!-- codex-review-state:")) {
    const match = body.match(/^<!-- codex-pull-request-review-summary -->\s*<!-- codex-review-state:v1 (\{[^\n]+\}) -->\s*## Codex Review Summary(?:\s|$)/);
    if (!match || codexProtocolMarkerCount(body) !== 2) return "fail";
    if (match[1].includes("\\")) return "fail";
    let state;
    try { state = JSON.parse(match[1]); } catch { return "fail"; }
    // JSON.parse accepts duplicate keys; count every schema key before parsing
    // can discard an earlier conflicting verdict.
    for (const [key, count] of [["code_review", 1], ["security_review", 1],
      ["commit_sha", 2], ["has_any_findings", 2], ["has_unresolved_findings", 2], ["status", 2]]) {
      if ((match[1].match(new RegExp(`"${key}"\\s*:`, "g")) || []).length !== count) return "fail";
    }
    if (!exactKeys(state, ["code_review", "security_review"]) ||
        !reviewStateIsValid(state.code_review) || !reviewStateIsValid(state.security_review)) return "fail";
    const code = state.code_review;
    if (code.commit_sha !== headSha) return null;
    if (containsBlockingSeverity(body, "codex") || code.has_any_findings === true ||
        code.has_unresolved_findings === true) return "fail";
    const security = state.security_review;
    const absent = Object.values(security).every((value) => value === null);
    const rendered = body.slice(match[0].length).trim();
    if (code.status !== "completed") return "pending";
    if (code.has_any_findings !== false || code.has_unresolved_findings !== false) {
      // Native non-review replies can set Completed with null findings flags.
      // This is no verdict: it cannot pass alone or erase a valid receipt.
      // Keep a distinct signal so completion recovery retains its edit time.
      return absent && renderedSummaryAgrees(rendered, state, headSha, requestMarker) ? "neutral" : "pending";
    }
    if (!absent && (security.commit_sha !== headSha || security.status !== "completed" ||
        security.has_any_findings !== false || security.has_unresolved_findings !== false)) return "fail";
    // Additional native rendered content may contain findings; require its
    // explicit verdict to agree, rather than trusting a heading or Completed.
    if (!renderedSummaryAgrees(rendered, state, headSha, requestMarker)) return canonicalTypedRowsAgree(comment, state, headSha) ? "neutral" : "pending";
    return codeCompletionTime(comment) ? "pass" : "pending";
  }

  const reviewedCommits = [...body.matchAll(/^\*\*Reviewed commit:\*\* `([a-f0-9]{10}|[a-f0-9]{40})`$/gm)];
  if (reviewedCommits.length === 1 && ![headSha, headSha.slice(0, 10)].includes(reviewedCommits[0][1])) return null;
  if (reviewedCommits.length > 1) return "fail";
  const receipt = body.startsWith("<!-- codex-review-receipt:");
  let text = body;
  if (receipt) {
    if (!text.startsWith(receiptMarker)) return "fail";
    text = text.slice(receiptMarker.length).trim();
  }
  if (/<!-- codex-/.test(text)) return "fail";
  // Ignore only the official informational footer, never arbitrary details.
  text = withoutCodexFooter(text);
  if (text === null) return "fail";
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (reviewedCommits.length && /(?:here are[\s\S]*suggestions|found (?:some |major |any |an? )?(?:issues?|findings?)|changes requested|unresolved findings)/i.test(text)) return "fail";
  if (!/^Codex Review: Did(?: not|n['’]t) find any major issues\.(?:\s*(?::rocket:|🚀|:\+1:|👍|Keep it up!|Breezy!|Already looking forward to the next diff\.))*$/i.test(lines[0] || "")) return "pending";
  const commitLine = lines[1]?.match(/^\*\*Reviewed commit:\*\* `([a-f0-9]{10}|[a-f0-9]{40})`$/);
  if (lines.length > (commitLine ? 2 : 1)) return "fail";
  if (commitLine) return [headSha, headSha.slice(0, 10)].includes(commitLine[1]) ? "pass" : null;
  // New receipts must carry an explicit reviewed commit. Legacy text can use
  // a trusted request plus the caller's no-intervening-push timeline check.
  return !receipt && requestMarker?.agent === "codex" && requestMarker.sha === headSha &&
    isAfterRequest(comment, requestMarker, comment?.created_at) ? "pass" : null;
}

export function isAcceptableCodexSummaryComment(comment, headSha, requestMarker = null, config = {}) {
  return classifyCodexSummaryComment(comment, headSha, requestMarker, config) === "pass";
}

export function latestCodexSummaryResult(comments, headSha, requestMarker, config = {}, timeline = []) {
  return comments.map((comment) => {
    let result = classifyCodexSummaryComment(comment, headSha, requestMarker, config);
    const unrecognized = result === null;
    // Historical observations cannot veto a new request; validated finding
    // history is retained independently until its own section is cleared.
    if (result !== "pass" && !isAfterRequest(comment, requestMarker) &&
        !(result === "fail" && hasCurrentHeadTypedFinding(comment, headSha) &&
          hasUnclearedTypedFindings(comments, headSha, requestMarker, config))) result = null;
    if (result === "fail" && hasCurrentHeadTypedFinding(comment, headSha) &&
        validFindingCompanions(comment, validatedTypedState(comment), headSha, config, true) &&
        !hasUnclearedTypedFindings(comments, headSha, requestMarker, config)) result = "neutral";
    if (result === "pass" && !isAfterRequest(comment, requestMarker, verdictTime(comment, result, headSha, config))) result = null;
    const triggerAt = requestMarker?.sourceCommentCreatedAt || requestMarker?.requestedAt || requestMarker?.commentCreatedAt;
    if (result === "pass" && hasHeadUpdateBetweenTimestamps(timeline, triggerAt, reviewEvidenceTimestamp(comment))) result = null;
    if (unrecognized && isTrustedReviewLogin(comment?.user?.login, "codex", config) &&
        isCodexReviewSignal(comment?.body) && isAfterRequest(comment, requestMarker)) result = "pending";
    return { comment, result, time: verdictTime(comment, result, headSha, config) };
  }).filter((entry) => entry.result !== null && entry.result !== "neutral")
    .sort((left, right) => Math.floor(Date.parse(right.time) / 1000) - Math.floor(Date.parse(left.time) / 1000) ||
      ({ fail: 3, pending: 2, pass: 1 }[right.result] || 0) - ({ fail: 3, pending: 2, pass: 1 }[left.result] || 0))[0]?.result || null;
}

export function hasHeadUpdateBetweenTimestamps(timeline = [], startCreatedAt, endCreatedAt) {
  const startTime = Date.parse(startCreatedAt || "");
  const endTime = Date.parse(endCreatedAt || "");
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime) return true;
  return timeline.some((event) => {
    if (event.event !== "committed" && event.event !== "head_ref_force_pushed") return false;
    const eventTime = Date.parse(event.created_at || event.committer?.date || "");
    return Number.isFinite(eventTime) && eventTime > startTime && eventTime <= endTime;
  });
}

export function classifyCodexNativeReview(review, reviewComments = [], headSha, config = {}) {
  if (!review) return null;
  if (!headSha || review.commit_id !== headSha) return null;
  const login = normalizeLogin(review.user?.login);
  if (!isTrustedReviewLogin(login, "codex", config)) return null;
  if (containsBlockingSeverity(review.body, "codex")) return "fail";

  if (review.state === "CHANGES_REQUESTED") return "fail";
  if (!["APPROVED", "COMMENTED"].includes(review.state)) return null;

  const commentsForReview = reviewComments.filter((comment) =>
    comment.pull_request_review_id === review.id &&
    isTrustedReviewLogin(comment.user?.login, "codex", config)
  );
  if (commentsForReview.length === 0) return "pass";

  const priorities = commentsForReview.map((comment) => extractCodexPriority(comment.body));
  if (priorities.some((priority) => priority === null)) return "fail";
  return Math.min(...priorities) <= 2 ? "fail" : "pass";
}

export function latestCodexNativeReviewResult(reviews = [], reviewComments = [], headSha, config = {}) {
  return reviews
    .map((review) => ({
      review,
      result: classifyCodexNativeReview(review, reviewComments, headSha, config)
    }))
    .filter((entry) => entry.result !== null)
    .sort((left, right) =>
      Date.parse(right.review.submitted_at || "") - Date.parse(left.review.submitted_at || "")
    )[0]?.result || null;
}

export function isAcceptableNativeReview(review, agent, headSha, config = {}) {
  if (!review) return false;
  if (review.commit_id && headSha && review.commit_id !== headSha) return false;
  const login = normalizeLogin(review.user?.login);
  const body = review.body || "";

  if (agent === "codex") {
    return isTrustedReviewLogin(login, agent, config) &&
      review.state === "APPROVED" &&
      !containsBlockingSeverity(body, agent);
  }

  if (agent === "gemini") {
    return isTrustedReviewLogin(login, agent, config) && !containsBlockingSeverity(body, agent);
  }

  return false;
}

export function isAcceptableClaudeComment(comment, headSha, config = {}) {
  const body = comment?.body || "";
  const login = normalizeLogin(comment?.user?.login);
  if (!isTrustedReviewLogin(login, "claude", config)) return false;
  if (extractMarkerSha(body) !== headSha) return false;
  return extractClaudeOutcome(body) === "pass";
}


function validatedTypedState(comment) {
  if (hasIndentedCodexEnvelope(comment?.body)) return null;
  const body = String(comment?.body || "").trim().replace(/<!--(?! codex-)[\s\S]*?-->/gi, "").trim().replace(/^<!-- codex-pull-request-review-summary -->\s*/, "");
  if (codexProtocolMarkerCount(body) !== 1) return null;
  const match = body.match(/^<!-- codex-review-state:v1 (\{[\s\S]*?\}) -->/);
  if (!match || match[1].includes("\\")) return null;
  for (const [key, count] of [["code_review", 1], ["security_review", 1],
    ["commit_sha", 2], ["has_any_findings", 2], ["has_unresolved_findings", 2], ["status", 2]]) {
    if ((match[1].match(new RegExp(`"${key}"\\s*:`, "g")) || []).length !== count) return null;
  }
  let state;
  try { state = JSON.parse(match[1]); } catch { return null; }
  if (!exactKeys(state, ["code_review", "security_review"]) ||
      !reviewStateIsValid(state.code_review) || !reviewStateIsValid(state.security_review)) return null;
  return state;
}


export function hasCurrentHeadTypedFinding(comment, headSha) {
  const state = leadingNegativeState(comment);
  return !!state && Object.values(state).some((review) => review.commit_sha === headSha &&
    (review.has_any_findings === true || review.has_unresolved_findings === true));
}

// Negative facts belong to the canonical leading envelope. Later finding
// presentation cannot erase them; approval and resolution still parse the full body.
function leadingNegativeState(comment) {
  if (hasIndentedCodexEnvelope(comment?.body)) return null;
  const body = String(comment?.body || "").trim().replace(/<!--(?! codex-)[\s\S]*?-->/gi, "").trim();
  const match = body.match(/^(?:<!-- codex-pull-request-review-summary -->\s*)?<!-- codex-review-state:v1 .*? -->\s*## Codex Review Summary(?:\r?\n|$)/s);
  return match ? validatedTypedState({ ...comment, body: match[0] }) : null;
}

export function hasUnclearedTypedFindings(comments, headSha, requestMarker, config = {}) {
  const evidence = comments.filter((comment) => isTrustedReviewLogin(comment.user?.login, "codex", config))
    .map((comment) => ({ comment, state: leadingNegativeState(comment) })).filter((entry) => entry.state);
  return evidence.some(({ comment, state }) => ["code_review", "security_review"].some((kind) => {
    const finding = state[kind];
    if (finding.commit_sha !== headSha || !(finding.has_any_findings || finding.has_unresolved_findings)) return false;
    const sectionTime = negativeSectionTime(comment, state, kind, headSha, config);
    const findingAt = Number.isFinite(sectionTime) ? sectionTime : Math.floor(Date.parse(comment.updated_at || comment.created_at || "") / 1000);
    return !evidence.some((clean) => {
      const next = clean.state[kind];
      return next.commit_sha === headSha && next.status === "completed" && next.has_any_findings === false &&
        next.has_unresolved_findings === false && canonicalSectionClear(clean.comment, clean.state, kind, headSha, config) && sectionCompletionBucket(clean.comment, kind, headSha) > findingAt;
    });
  }));
}


// Ambiguous rendered table rows invalidate clocks; they never grant evidence.
function isReviewRowCandidate(line, title) {
  return line.includes("|") && visibleReviewText(line).toLowerCase().includes(title.replaceAll("*", "").toLowerCase());
}

function sectionCompletionBucket(comment, kind, headSha = null) {
  const title = kind === "security_review" ? "**Security Review**" : "**Code Review**";
  const rows = String(comment.body || "").split(/\r?\n/).filter((line) => isReviewRowCandidate(line, title));
  if (rows.length !== 1) return NaN;
  const cells = rows[0].split("|").map((cell) => cell.trim());
  const label = kind === "security_review" ? /^(?:🛡️|🔒) \*\*Security Review\*\*$/ : /^📝 \*\*Code Review\*\*$/;
  if (cells.length !== 6 || !label.test(cells[1]) || cells[5] !== "" ||
      !["Manual request", "Automatic review"].includes(cells[4]) ||
      (headSha && cells[3] !== "`" + headSha.slice(0, 7) + "`")) return NaN;
  const match = rows[0].match(/\| ✅ \*\*Completed\*\* <relative-time datetime="([^"]+)">([^<]+)<\/relative-time> \|/);
  const value = match && match[1] === match[2] ? Date.parse(match[1]) : NaN;
  const updated = Date.parse(comment.updated_at || comment.created_at || "");
  return Number.isFinite(value) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(match[1]) &&
    new Date(value).toISOString().slice(0, 19) === match[1].slice(0, 19) &&
    value <= updated + 999 ? Math.floor(value / 1000) : NaN;
}


function canonicalTypedRowsAgree(comment, state, headSha) {
  if (!state || Object.values(state).some((review) => review.status !== null &&
      (review.status !== "completed" || review.commit_sha !== headSha))) return false;
  const body = String(comment.body || "").trim();
  const match = body.match(/^<!-- codex-pull-request-review-summary -->\s*<!-- codex-review-state:v1 (\{[^\n]+\}) -->\s*## Codex Review Summary(?:\s|$)/);
  return !!match && renderedSummaryAgrees(body.slice(match[0].length).trim(), state, headSha,
    { requestedAt: "1970-01-01T00:00:00Z" });
}


function canonicalSectionClear(comment, state, kind, headSha, config, validateCompanion = true) {
  const other = kind === "code_review" ? "security_review" : "code_review";
  const otherTitle = other === "security_review" ? "**Security Review**" : "**Code Review**";
  const otherRows = String(comment.body || "").split(/\r?\n/).filter((line) => isReviewRowCandidate(line, otherTitle));
  if (validateCompanion && (otherRows.length > 1 || (otherRows.length === 1 && !removableCompanionRow(comment, state[other], other, otherRows[0])))) return false;
  const target = kind === "security_review" ? "**Security Review**" : "**Code Review**";
  const absent = { commit_sha: null, has_any_findings: null, has_unresolved_findings: null, status: null };
  const body = String(comment.body || "").trim();
  const projected = body.replace(/<!-- codex-review-state:v1 .*? -->/s,
    "<!-- codex-review-state:v1 " + JSON.stringify({ code_review: state[kind], security_review: absent }) + " -->")
    .split(/\r?\n/).filter((line) => !line.startsWith("|") ||
      (!line.includes("**Code Review**") && !line.includes("**Security Review**")) || line.includes(target))
    .map((line) => line.includes(target) && kind === "security_review"
      ? line.replace(/(?:🛡️|🔒) \*\*Security Review\*\*/, "📝 **Code Review**") : line).join("\n");
  return classifyCodexSummaryComment({ ...comment, body: projected }, headSha,
    { requestedAt: "1970-01-01T00:00:00Z" }, config) === "pass";
}


// Negative clocks may scope away only a structurally validated companion row.
function negativeSectionStructure(comment, state, kind, config) {
  const title = kind === "security_review" ? "**Security Review**" : "**Code Review**";
  const rows = String(comment.body || "").split(/\r?\n/).filter((line) => isReviewRowCandidate(line, title));
  if (rows.length !== 1) return false;
  const cells = rows[0].split("|");
  if (cells.length !== 6) return false;
  if (state[kind].has_any_findings === true || state[kind].has_unresolved_findings === true) cells[4] = " Manual request ";
  const structural = { ...comment, body: comment.body.replace(rows[0], cells.join("|")) };
  return Number.isFinite(sectionCompletionBucket(structural, kind, state[kind].commit_sha)) &&
    canonicalSectionClear(structural, { ...state, [kind]: { ...state[kind], has_any_findings: false, has_unresolved_findings: false } },
      kind, state[kind].commit_sha, config, false);
}

function negativeSectionTime(comment, state, kind, headSha, config) {
  if (state[kind].status !== "completed") return NaN;
  const other = kind === "code_review" ? "security_review" : "code_review";
  const otherTitle = other === "security_review" ? "**Security Review**" : "**Code Review**";
  const rows = String(comment.body || "").split(/\r?\n/).filter((line) => isReviewRowCandidate(line, otherTitle));
  if (rows.length && (state[other].status !== "completed" || !negativeSectionStructure(comment, state, other, config))) return NaN;
  return canonicalSectionClear(comment, { ...state, [kind]: { ...state[kind], has_any_findings: false, has_unresolved_findings: false } },
    kind, headSha, config, false) ? sectionCompletionBucket(comment, kind, headSha) : NaN;
}

// A resolved own-section finding cannot erase a newer invalid companion.
function validFindingCompanions(comment, state, headSha, config = {}, allowResolvedOwn = false) {
  if (!state) return false;
  return Object.entries(state).every(([kind, review]) => {
    const title = kind === "security_review" ? "**Security Review**" : "**Code Review**";
    if (Object.values(review).every((value) => value === null)) return !String(comment.body || "").split(/\r?\n/).some((line) => isReviewRowCandidate(line, title));
    if (review.status !== "completed") return false;
    if (allowResolvedOwn && review.commit_sha === headSha && (review.has_any_findings || review.has_unresolved_findings)) return true;
    return negativeSectionStructure(comment, state, kind, config);
  });
}


function hasIndentedCodexEnvelope(body) {
  const leading = String(body || "").replace(/[^\S \t\r\n]/g, "").match(/^(?:[ \t\r\n]*<!--[\s\S]*?-->)*[ \t\r\n]*/)?.[0] || "";
  const heading = String(body || "").replace(/[^\S \t\r\n]/g, "").replace(/<!--(?! codex-)[^\r\n]*?-->/gi, "").split(/\r?\n/).find((line) => /^[ \t]*## Codex Review Summary(?:\s|$)/.test(line));
  return /^(?: {4,}|[ \t]*\t[ \t]*)<!-- codex-/im.test(leading) ||
    /^(?: {4,}|[ \t]*\t)/.test(heading || "");
}

function removableCompanionRow(comment, review, kind, row) {
  if (!review?.commit_sha) return false;
  const cells = row.split("|").map((cell) => cell.trim());
  const label = kind === "security_review" ? /^(?:🛡️|🔒) \*\*Security Review\*\*$/ : /^📝 \*\*Code Review\*\*$/;
  if (cells.length !== 6 || !label.test(cells[1]) || cells[3] !== "`" + review.commit_sha.slice(0, 7) + "`" ||
      !["Manual request", "Automatic review"].includes(cells[4])) return false;
  if (review.status === "completed") return /^✅ \*\*Completed\*\* /.test(cells[2]) &&
    Number.isFinite(sectionCompletionBucket(comment, kind, review.commit_sha));
  if (!["running", "in_progress"].includes(review.status)) return false;
  const match = cells[2].match(/^🔄 \*\*Running\*\* since <relative-time datetime="([^"]+)">([^<]+)<\/relative-time>$/);
  const time = match && match[1] === match[2] ? Date.parse(match[1]) : NaN;
  return Number.isFinite(time) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/.test(match[1]) &&
    new Date(time).toISOString().slice(0, 19) === match[1].slice(0, 19) &&
    time <= Date.parse(comment.updated_at || comment.created_at || "") + 999;
}


function codexProtocolMarkerCount(body) {
  return (String(body || "").split(/\r?\n/).filter((line) =>
    !/^(?: {4,}|[ \t]*\t)/.test(line)).join("\n").match(/<!-- codex-/gi) || []).length;
}
