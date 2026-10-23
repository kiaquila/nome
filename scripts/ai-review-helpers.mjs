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
const HTML_NAMED_ENTITIES = Object.freeze({
  "AElig": "\u00c6", "AMP": "&", "Aacute": "\u00c1", "Abreve": "\u0102", "Acirc": "\u00c2", "Acy": "\u0410",
  "Afr": "\ud835\udd04", "Agrave": "\u00c0", "Alpha": "\u0391", "Amacr": "\u0100", "And": "\u2a53", "Aogon": "\u0104",
  "Aopf": "\ud835\udd38", "ApplyFunction": "\u2061", "Aring": "\u00c5", "Ascr": "\ud835\udc9c", "Assign": "\u2254", "Atilde": "\u00c3",
  "Auml": "\u00c4", "Backslash": "\u2216", "Barv": "\u2ae7", "Barwed": "\u2306", "Bcy": "\u0411", "Because": "\u2235",
  "Bernoullis": "\u212c", "Beta": "\u0392", "Bfr": "\ud835\udd05", "Bopf": "\ud835\udd39", "Breve": "\u02d8", "Bscr": "\u212c",
  "Bumpeq": "\u224e", "CHcy": "\u0427", "COPY": "\u00a9", "Cacute": "\u0106", "Cap": "\u22d2", "CapitalDifferentialD": "\u2145",
  "Cayleys": "\u212d", "Ccaron": "\u010c", "Ccedil": "\u00c7", "Ccirc": "\u0108", "Cconint": "\u2230", "Cdot": "\u010a",
  "Cedilla": "\u00b8", "CenterDot": "\u00b7", "Cfr": "\u212d", "Chi": "\u03a7", "CircleDot": "\u2299", "CircleMinus": "\u2296",
  "CirclePlus": "\u2295", "CircleTimes": "\u2297", "ClockwiseContourIntegral": "\u2232", "CloseCurlyDoubleQuote": "\u201d", "CloseCurlyQuote": "\u2019", "Colon": "\u2237",
  "Colone": "\u2a74", "Congruent": "\u2261", "Conint": "\u222f", "ContourIntegral": "\u222e", "Copf": "\u2102", "Coproduct": "\u2210",
  "CounterClockwiseContourIntegral": "\u2233", "Cross": "\u2a2f", "Cscr": "\ud835\udc9e", "Cup": "\u22d3", "CupCap": "\u224d", "DD": "\u2145",
  "DDotrahd": "\u2911", "DJcy": "\u0402", "DScy": "\u0405", "DZcy": "\u040f", "Dagger": "\u2021", "Darr": "\u21a1",
  "Dashv": "\u2ae4", "Dcaron": "\u010e", "Dcy": "\u0414", "Del": "\u2207", "Delta": "\u0394", "Dfr": "\ud835\udd07",
  "DiacriticalAcute": "\u00b4", "DiacriticalDot": "\u02d9", "DiacriticalDoubleAcute": "\u02dd", "DiacriticalGrave": "`", "DiacriticalTilde": "\u02dc", "Diamond": "\u22c4",
  "DifferentialD": "\u2146", "Dopf": "\ud835\udd3b", "Dot": "\u00a8", "DotDot": "\u20dc", "DotEqual": "\u2250", "DoubleContourIntegral": "\u222f",
  "DoubleDot": "\u00a8", "DoubleDownArrow": "\u21d3", "DoubleLeftArrow": "\u21d0", "DoubleLeftRightArrow": "\u21d4", "DoubleLeftTee": "\u2ae4", "DoubleLongLeftArrow": "\u27f8",
  "DoubleLongLeftRightArrow": "\u27fa", "DoubleLongRightArrow": "\u27f9", "DoubleRightArrow": "\u21d2", "DoubleRightTee": "\u22a8", "DoubleUpArrow": "\u21d1", "DoubleUpDownArrow": "\u21d5",
  "DoubleVerticalBar": "\u2225", "DownArrow": "\u2193", "DownArrowBar": "\u2913", "DownArrowUpArrow": "\u21f5", "DownBreve": "\u0311", "DownLeftRightVector": "\u2950",
  "DownLeftTeeVector": "\u295e", "DownLeftVector": "\u21bd", "DownLeftVectorBar": "\u2956", "DownRightTeeVector": "\u295f", "DownRightVector": "\u21c1", "DownRightVectorBar": "\u2957",
  "DownTee": "\u22a4", "DownTeeArrow": "\u21a7", "Downarrow": "\u21d3", "Dscr": "\ud835\udc9f", "Dstrok": "\u0110", "ENG": "\u014a",
  "ETH": "\u00d0", "Eacute": "\u00c9", "Ecaron": "\u011a", "Ecirc": "\u00ca", "Ecy": "\u042d", "Edot": "\u0116",
  "Efr": "\ud835\udd08", "Egrave": "\u00c8", "Element": "\u2208", "Emacr": "\u0112", "EmptySmallSquare": "\u25fb", "EmptyVerySmallSquare": "\u25ab",
  "Eogon": "\u0118", "Eopf": "\ud835\udd3c", "Epsilon": "\u0395", "Equal": "\u2a75", "EqualTilde": "\u2242", "Equilibrium": "\u21cc",
  "Escr": "\u2130", "Esim": "\u2a73", "Eta": "\u0397", "Euml": "\u00cb", "Exists": "\u2203", "ExponentialE": "\u2147",
  "Fcy": "\u0424", "Ffr": "\ud835\udd09", "FilledSmallSquare": "\u25fc", "FilledVerySmallSquare": "\u25aa", "Fopf": "\ud835\udd3d", "ForAll": "\u2200",
  "Fouriertrf": "\u2131", "Fscr": "\u2131", "GJcy": "\u0403", "GT": ">", "Gamma": "\u0393", "Gammad": "\u03dc",
  "Gbreve": "\u011e", "Gcedil": "\u0122", "Gcirc": "\u011c", "Gcy": "\u0413", "Gdot": "\u0120", "Gfr": "\ud835\udd0a",
  "Gg": "\u22d9", "Gopf": "\ud835\udd3e", "GreaterEqual": "\u2265", "GreaterEqualLess": "\u22db", "GreaterFullEqual": "\u2267", "GreaterGreater": "\u2aa2",
  "GreaterLess": "\u2277", "GreaterSlantEqual": "\u2a7e", "GreaterTilde": "\u2273", "Gscr": "\ud835\udca2", "Gt": "\u226b", "HARDcy": "\u042a",
  "Hacek": "\u02c7", "Hat": "^", "Hcirc": "\u0124", "Hfr": "\u210c", "HilbertSpace": "\u210b", "Hopf": "\u210d",
  "HorizontalLine": "\u2500", "Hscr": "\u210b", "Hstrok": "\u0126", "HumpDownHump": "\u224e", "HumpEqual": "\u224f", "IEcy": "\u0415",
  "IJlig": "\u0132", "IOcy": "\u0401", "Iacute": "\u00cd", "Icirc": "\u00ce", "Icy": "\u0418", "Idot": "\u0130",
  "Ifr": "\u2111", "Igrave": "\u00cc", "Im": "\u2111", "Imacr": "\u012a", "ImaginaryI": "\u2148", "Implies": "\u21d2",
  "Int": "\u222c", "Integral": "\u222b", "Intersection": "\u22c2", "InvisibleComma": "\u2063", "InvisibleTimes": "\u2062", "Iogon": "\u012e",
  "Iopf": "\ud835\udd40", "Iota": "\u0399", "Iscr": "\u2110", "Itilde": "\u0128", "Iukcy": "\u0406", "Iuml": "\u00cf",
  "Jcirc": "\u0134", "Jcy": "\u0419", "Jfr": "\ud835\udd0d", "Jopf": "\ud835\udd41", "Jscr": "\ud835\udca5", "Jsercy": "\u0408",
  "Jukcy": "\u0404", "KHcy": "\u0425", "KJcy": "\u040c", "Kappa": "\u039a", "Kcedil": "\u0136", "Kcy": "\u041a",
  "Kfr": "\ud835\udd0e", "Kopf": "\ud835\udd42", "Kscr": "\ud835\udca6", "LJcy": "\u0409", "LT": "<", "Lacute": "\u0139",
  "Lambda": "\u039b", "Lang": "\u27ea", "Laplacetrf": "\u2112", "Larr": "\u219e", "Lcaron": "\u013d", "Lcedil": "\u013b",
  "Lcy": "\u041b", "LeftAngleBracket": "\u27e8", "LeftArrow": "\u2190", "LeftArrowBar": "\u21e4", "LeftArrowRightArrow": "\u21c6", "LeftCeiling": "\u2308",
  "LeftDoubleBracket": "\u27e6", "LeftDownTeeVector": "\u2961", "LeftDownVector": "\u21c3", "LeftDownVectorBar": "\u2959", "LeftFloor": "\u230a", "LeftRightArrow": "\u2194",
  "LeftRightVector": "\u294e", "LeftTee": "\u22a3", "LeftTeeArrow": "\u21a4", "LeftTeeVector": "\u295a", "LeftTriangle": "\u22b2", "LeftTriangleBar": "\u29cf",
  "LeftTriangleEqual": "\u22b4", "LeftUpDownVector": "\u2951", "LeftUpTeeVector": "\u2960", "LeftUpVector": "\u21bf", "LeftUpVectorBar": "\u2958", "LeftVector": "\u21bc",
  "LeftVectorBar": "\u2952", "Leftarrow": "\u21d0", "Leftrightarrow": "\u21d4", "LessEqualGreater": "\u22da", "LessFullEqual": "\u2266", "LessGreater": "\u2276",
  "LessLess": "\u2aa1", "LessSlantEqual": "\u2a7d", "LessTilde": "\u2272", "Lfr": "\ud835\udd0f", "Ll": "\u22d8", "Lleftarrow": "\u21da",
  "Lmidot": "\u013f", "LongLeftArrow": "\u27f5", "LongLeftRightArrow": "\u27f7", "LongRightArrow": "\u27f6", "Longleftarrow": "\u27f8", "Longleftrightarrow": "\u27fa",
  "Longrightarrow": "\u27f9", "Lopf": "\ud835\udd43", "LowerLeftArrow": "\u2199", "LowerRightArrow": "\u2198", "Lscr": "\u2112", "Lsh": "\u21b0",
  "Lstrok": "\u0141", "Lt": "\u226a", "Map": "\u2905", "Mcy": "\u041c", "MediumSpace": "\u205f", "Mellintrf": "\u2133",
  "Mfr": "\ud835\udd10", "MinusPlus": "\u2213", "Mopf": "\ud835\udd44", "Mscr": "\u2133", "Mu": "\u039c", "NJcy": "\u040a",
  "Nacute": "\u0143", "Ncaron": "\u0147", "Ncedil": "\u0145", "Ncy": "\u041d", "NegativeMediumSpace": "\u200b", "NegativeThickSpace": "\u200b",
  "NegativeThinSpace": "\u200b", "NegativeVeryThinSpace": "\u200b", "NestedGreaterGreater": "\u226b", "NestedLessLess": "\u226a", "NewLine": "\n", "Nfr": "\ud835\udd11",
  "NoBreak": "\u2060", "NonBreakingSpace": "\u00a0", "Nopf": "\u2115", "Not": "\u2aec", "NotCongruent": "\u2262", "NotCupCap": "\u226d",
  "NotDoubleVerticalBar": "\u2226", "NotElement": "\u2209", "NotEqual": "\u2260", "NotEqualTilde": "\u2242\u0338", "NotExists": "\u2204", "NotGreater": "\u226f",
  "NotGreaterEqual": "\u2271", "NotGreaterFullEqual": "\u2267\u0338", "NotGreaterGreater": "\u226b\u0338", "NotGreaterLess": "\u2279", "NotGreaterSlantEqual": "\u2a7e\u0338", "NotGreaterTilde": "\u2275",
  "NotHumpDownHump": "\u224e\u0338", "NotHumpEqual": "\u224f\u0338", "NotLeftTriangle": "\u22ea", "NotLeftTriangleBar": "\u29cf\u0338", "NotLeftTriangleEqual": "\u22ec", "NotLess": "\u226e",
  "NotLessEqual": "\u2270", "NotLessGreater": "\u2278", "NotLessLess": "\u226a\u0338", "NotLessSlantEqual": "\u2a7d\u0338", "NotLessTilde": "\u2274", "NotNestedGreaterGreater": "\u2aa2\u0338",
  "NotNestedLessLess": "\u2aa1\u0338", "NotPrecedes": "\u2280", "NotPrecedesEqual": "\u2aaf\u0338", "NotPrecedesSlantEqual": "\u22e0", "NotReverseElement": "\u220c", "NotRightTriangle": "\u22eb",
  "NotRightTriangleBar": "\u29d0\u0338", "NotRightTriangleEqual": "\u22ed", "NotSquareSubset": "\u228f\u0338", "NotSquareSubsetEqual": "\u22e2", "NotSquareSuperset": "\u2290\u0338", "NotSquareSupersetEqual": "\u22e3",
  "NotSubset": "\u2282\u20d2", "NotSubsetEqual": "\u2288", "NotSucceeds": "\u2281", "NotSucceedsEqual": "\u2ab0\u0338", "NotSucceedsSlantEqual": "\u22e1", "NotSucceedsTilde": "\u227f\u0338",
  "NotSuperset": "\u2283\u20d2", "NotSupersetEqual": "\u2289", "NotTilde": "\u2241", "NotTildeEqual": "\u2244", "NotTildeFullEqual": "\u2247", "NotTildeTilde": "\u2249",
  "NotVerticalBar": "\u2224", "Nscr": "\ud835\udca9", "Ntilde": "\u00d1", "Nu": "\u039d", "OElig": "\u0152", "Oacute": "\u00d3",
  "Ocirc": "\u00d4", "Ocy": "\u041e", "Odblac": "\u0150", "Ofr": "\ud835\udd12", "Ograve": "\u00d2", "Omacr": "\u014c",
  "Omega": "\u03a9", "Omicron": "\u039f", "Oopf": "\ud835\udd46", "OpenCurlyDoubleQuote": "\u201c", "OpenCurlyQuote": "\u2018", "Or": "\u2a54",
  "Oscr": "\ud835\udcaa", "Oslash": "\u00d8", "Otilde": "\u00d5", "Otimes": "\u2a37", "Ouml": "\u00d6", "OverBar": "\u203e",
  "OverBrace": "\u23de", "OverBracket": "\u23b4", "OverParenthesis": "\u23dc", "PartialD": "\u2202", "Pcy": "\u041f", "Pfr": "\ud835\udd13",
  "Phi": "\u03a6", "Pi": "\u03a0", "PlusMinus": "\u00b1", "Poincareplane": "\u210c", "Popf": "\u2119", "Pr": "\u2abb",
  "Precedes": "\u227a", "PrecedesEqual": "\u2aaf", "PrecedesSlantEqual": "\u227c", "PrecedesTilde": "\u227e", "Prime": "\u2033", "Product": "\u220f",
  "Proportion": "\u2237", "Proportional": "\u221d", "Pscr": "\ud835\udcab", "Psi": "\u03a8", "QUOT": "\"", "Qfr": "\ud835\udd14",
  "Qopf": "\u211a", "Qscr": "\ud835\udcac", "RBarr": "\u2910", "REG": "\u00ae", "Racute": "\u0154", "Rang": "\u27eb",
  "Rarr": "\u21a0", "Rarrtl": "\u2916", "Rcaron": "\u0158", "Rcedil": "\u0156", "Rcy": "\u0420", "Re": "\u211c",
  "ReverseElement": "\u220b", "ReverseEquilibrium": "\u21cb", "ReverseUpEquilibrium": "\u296f", "Rfr": "\u211c", "Rho": "\u03a1", "RightAngleBracket": "\u27e9",
  "RightArrow": "\u2192", "RightArrowBar": "\u21e5", "RightArrowLeftArrow": "\u21c4", "RightCeiling": "\u2309", "RightDoubleBracket": "\u27e7", "RightDownTeeVector": "\u295d",
  "RightDownVector": "\u21c2", "RightDownVectorBar": "\u2955", "RightFloor": "\u230b", "RightTee": "\u22a2", "RightTeeArrow": "\u21a6", "RightTeeVector": "\u295b",
  "RightTriangle": "\u22b3", "RightTriangleBar": "\u29d0", "RightTriangleEqual": "\u22b5", "RightUpDownVector": "\u294f", "RightUpTeeVector": "\u295c", "RightUpVector": "\u21be",
  "RightUpVectorBar": "\u2954", "RightVector": "\u21c0", "RightVectorBar": "\u2953", "Rightarrow": "\u21d2", "Ropf": "\u211d", "RoundImplies": "\u2970",
  "Rrightarrow": "\u21db", "Rscr": "\u211b", "Rsh": "\u21b1", "RuleDelayed": "\u29f4", "SHCHcy": "\u0429", "SHcy": "\u0428",
  "SOFTcy": "\u042c", "Sacute": "\u015a", "Sc": "\u2abc", "Scaron": "\u0160", "Scedil": "\u015e", "Scirc": "\u015c",
  "Scy": "\u0421", "Sfr": "\ud835\udd16", "ShortDownArrow": "\u2193", "ShortLeftArrow": "\u2190", "ShortRightArrow": "\u2192", "ShortUpArrow": "\u2191",
  "Sigma": "\u03a3", "SmallCircle": "\u2218", "Sopf": "\ud835\udd4a", "Sqrt": "\u221a", "Square": "\u25a1", "SquareIntersection": "\u2293",
  "SquareSubset": "\u228f", "SquareSubsetEqual": "\u2291", "SquareSuperset": "\u2290", "SquareSupersetEqual": "\u2292", "SquareUnion": "\u2294", "Sscr": "\ud835\udcae",
  "Star": "\u22c6", "Sub": "\u22d0", "Subset": "\u22d0", "SubsetEqual": "\u2286", "Succeeds": "\u227b", "SucceedsEqual": "\u2ab0",
  "SucceedsSlantEqual": "\u227d", "SucceedsTilde": "\u227f", "SuchThat": "\u220b", "Sum": "\u2211", "Sup": "\u22d1", "Superset": "\u2283",
  "SupersetEqual": "\u2287", "Supset": "\u22d1", "THORN": "\u00de", "TRADE": "\u2122", "TSHcy": "\u040b", "TScy": "\u0426",
  "Tab": "\t", "Tau": "\u03a4", "Tcaron": "\u0164", "Tcedil": "\u0162", "Tcy": "\u0422", "Tfr": "\ud835\udd17",
  "Therefore": "\u2234", "Theta": "\u0398", "ThickSpace": "\u205f\u200a", "ThinSpace": "\u2009", "Tilde": "\u223c", "TildeEqual": "\u2243",
  "TildeFullEqual": "\u2245", "TildeTilde": "\u2248", "Topf": "\ud835\udd4b", "TripleDot": "\u20db", "Tscr": "\ud835\udcaf", "Tstrok": "\u0166",
  "Uacute": "\u00da", "Uarr": "\u219f", "Uarrocir": "\u2949", "Ubrcy": "\u040e", "Ubreve": "\u016c", "Ucirc": "\u00db",
  "Ucy": "\u0423", "Udblac": "\u0170", "Ufr": "\ud835\udd18", "Ugrave": "\u00d9", "Umacr": "\u016a", "UnderBar": "_",
  "UnderBrace": "\u23df", "UnderBracket": "\u23b5", "UnderParenthesis": "\u23dd", "Union": "\u22c3", "UnionPlus": "\u228e", "Uogon": "\u0172",
  "Uopf": "\ud835\udd4c", "UpArrow": "\u2191", "UpArrowBar": "\u2912", "UpArrowDownArrow": "\u21c5", "UpDownArrow": "\u2195", "UpEquilibrium": "\u296e",
  "UpTee": "\u22a5", "UpTeeArrow": "\u21a5", "Uparrow": "\u21d1", "Updownarrow": "\u21d5", "UpperLeftArrow": "\u2196", "UpperRightArrow": "\u2197",
  "Upsi": "\u03d2", "Upsilon": "\u03a5", "Uring": "\u016e", "Uscr": "\ud835\udcb0", "Utilde": "\u0168", "Uuml": "\u00dc",
  "VDash": "\u22ab", "Vbar": "\u2aeb", "Vcy": "\u0412", "Vdash": "\u22a9", "Vdashl": "\u2ae6", "Vee": "\u22c1",
  "Verbar": "\u2016", "Vert": "\u2016", "VerticalBar": "\u2223", "VerticalLine": "|", "VerticalSeparator": "\u2758", "VerticalTilde": "\u2240",
  "VeryThinSpace": "\u200a", "Vfr": "\ud835\udd19", "Vopf": "\ud835\udd4d", "Vscr": "\ud835\udcb1", "Vvdash": "\u22aa", "Wcirc": "\u0174",
  "Wedge": "\u22c0", "Wfr": "\ud835\udd1a", "Wopf": "\ud835\udd4e", "Wscr": "\ud835\udcb2", "Xfr": "\ud835\udd1b", "Xi": "\u039e",
  "Xopf": "\ud835\udd4f", "Xscr": "\ud835\udcb3", "YAcy": "\u042f", "YIcy": "\u0407", "YUcy": "\u042e", "Yacute": "\u00dd",
  "Ycirc": "\u0176", "Ycy": "\u042b", "Yfr": "\ud835\udd1c", "Yopf": "\ud835\udd50", "Yscr": "\ud835\udcb4", "Yuml": "\u0178",
  "ZHcy": "\u0416", "Zacute": "\u0179", "Zcaron": "\u017d", "Zcy": "\u0417", "Zdot": "\u017b", "ZeroWidthSpace": "\u200b",
  "Zeta": "\u0396", "Zfr": "\u2128", "Zopf": "\u2124", "Zscr": "\ud835\udcb5", "aacute": "\u00e1", "abreve": "\u0103",
  "ac": "\u223e", "acE": "\u223e\u0333", "acd": "\u223f", "acirc": "\u00e2", "acute": "\u00b4", "acy": "\u0430",
  "aelig": "\u00e6", "af": "\u2061", "afr": "\ud835\udd1e", "agrave": "\u00e0", "alefsym": "\u2135", "aleph": "\u2135",
  "alpha": "\u03b1", "amacr": "\u0101", "amalg": "\u2a3f", "amp": "&", "and": "\u2227", "andand": "\u2a55",
  "andd": "\u2a5c", "andslope": "\u2a58", "andv": "\u2a5a", "ang": "\u2220", "ange": "\u29a4", "angle": "\u2220",
  "angmsd": "\u2221", "angmsdaa": "\u29a8", "angmsdab": "\u29a9", "angmsdac": "\u29aa", "angmsdad": "\u29ab", "angmsdae": "\u29ac",
  "angmsdaf": "\u29ad", "angmsdag": "\u29ae", "angmsdah": "\u29af", "angrt": "\u221f", "angrtvb": "\u22be", "angrtvbd": "\u299d",
  "angsph": "\u2222", "angst": "\u00c5", "angzarr": "\u237c", "aogon": "\u0105", "aopf": "\ud835\udd52", "ap": "\u2248",
  "apE": "\u2a70", "apacir": "\u2a6f", "ape": "\u224a", "apid": "\u224b", "apos": "'", "approx": "\u2248",
  "approxeq": "\u224a", "aring": "\u00e5", "ascr": "\ud835\udcb6", "ast": "*", "asymp": "\u2248", "asympeq": "\u224d",
  "atilde": "\u00e3", "auml": "\u00e4", "awconint": "\u2233", "awint": "\u2a11", "bNot": "\u2aed", "backcong": "\u224c",
  "backepsilon": "\u03f6", "backprime": "\u2035", "backsim": "\u223d", "backsimeq": "\u22cd", "barvee": "\u22bd", "barwed": "\u2305",
  "barwedge": "\u2305", "bbrk": "\u23b5", "bbrktbrk": "\u23b6", "bcong": "\u224c", "bcy": "\u0431", "bdquo": "\u201e",
  "becaus": "\u2235", "because": "\u2235", "bemptyv": "\u29b0", "bepsi": "\u03f6", "bernou": "\u212c", "beta": "\u03b2",
  "beth": "\u2136", "between": "\u226c", "bfr": "\ud835\udd1f", "bigcap": "\u22c2", "bigcirc": "\u25ef", "bigcup": "\u22c3",
  "bigodot": "\u2a00", "bigoplus": "\u2a01", "bigotimes": "\u2a02", "bigsqcup": "\u2a06", "bigstar": "\u2605", "bigtriangledown": "\u25bd",
  "bigtriangleup": "\u25b3", "biguplus": "\u2a04", "bigvee": "\u22c1", "bigwedge": "\u22c0", "bkarow": "\u290d", "blacklozenge": "\u29eb",
  "blacksquare": "\u25aa", "blacktriangle": "\u25b4", "blacktriangledown": "\u25be", "blacktriangleleft": "\u25c2", "blacktriangleright": "\u25b8", "blank": "\u2423",
  "blk12": "\u2592", "blk14": "\u2591", "blk34": "\u2593", "block": "\u2588", "bne": "=\u20e5", "bnequiv": "\u2261\u20e5",
  "bnot": "\u2310", "bopf": "\ud835\udd53", "bot": "\u22a5", "bottom": "\u22a5", "bowtie": "\u22c8", "boxDL": "\u2557",
  "boxDR": "\u2554", "boxDl": "\u2556", "boxDr": "\u2553", "boxH": "\u2550", "boxHD": "\u2566", "boxHU": "\u2569",
  "boxHd": "\u2564", "boxHu": "\u2567", "boxUL": "\u255d", "boxUR": "\u255a", "boxUl": "\u255c", "boxUr": "\u2559",
  "boxV": "\u2551", "boxVH": "\u256c", "boxVL": "\u2563", "boxVR": "\u2560", "boxVh": "\u256b", "boxVl": "\u2562",
  "boxVr": "\u255f", "boxbox": "\u29c9", "boxdL": "\u2555", "boxdR": "\u2552", "boxdl": "\u2510", "boxdr": "\u250c",
  "boxh": "\u2500", "boxhD": "\u2565", "boxhU": "\u2568", "boxhd": "\u252c", "boxhu": "\u2534", "boxminus": "\u229f",
  "boxplus": "\u229e", "boxtimes": "\u22a0", "boxuL": "\u255b", "boxuR": "\u2558", "boxul": "\u2518", "boxur": "\u2514",
  "boxv": "\u2502", "boxvH": "\u256a", "boxvL": "\u2561", "boxvR": "\u255e", "boxvh": "\u253c", "boxvl": "\u2524",
  "boxvr": "\u251c", "bprime": "\u2035", "breve": "\u02d8", "brvbar": "\u00a6", "bscr": "\ud835\udcb7", "bsemi": "\u204f",
  "bsim": "\u223d", "bsime": "\u22cd", "bsol": "\\", "bsolb": "\u29c5", "bsolhsub": "\u27c8", "bull": "\u2022",
  "bullet": "\u2022", "bump": "\u224e", "bumpE": "\u2aae", "bumpe": "\u224f", "bumpeq": "\u224f", "cacute": "\u0107",
  "cap": "\u2229", "capand": "\u2a44", "capbrcup": "\u2a49", "capcap": "\u2a4b", "capcup": "\u2a47", "capdot": "\u2a40",
  "caps": "\u2229\ufe00", "caret": "\u2041", "caron": "\u02c7", "ccaps": "\u2a4d", "ccaron": "\u010d", "ccedil": "\u00e7",
  "ccirc": "\u0109", "ccups": "\u2a4c", "ccupssm": "\u2a50", "cdot": "\u010b", "cedil": "\u00b8", "cemptyv": "\u29b2",
  "cent": "\u00a2", "centerdot": "\u00b7", "cfr": "\ud835\udd20", "chcy": "\u0447", "check": "\u2713", "checkmark": "\u2713",
  "chi": "\u03c7", "cir": "\u25cb", "cirE": "\u29c3", "circ": "\u02c6", "circeq": "\u2257", "circlearrowleft": "\u21ba",
  "circlearrowright": "\u21bb", "circledR": "\u00ae", "circledS": "\u24c8", "circledast": "\u229b", "circledcirc": "\u229a", "circleddash": "\u229d",
  "cire": "\u2257", "cirfnint": "\u2a10", "cirmid": "\u2aef", "cirscir": "\u29c2", "clubs": "\u2663", "clubsuit": "\u2663",
  "colon": ":", "colone": "\u2254", "coloneq": "\u2254", "comma": ",", "commat": "@", "comp": "\u2201",
  "compfn": "\u2218", "complement": "\u2201", "complexes": "\u2102", "cong": "\u2245", "congdot": "\u2a6d", "conint": "\u222e",
  "copf": "\ud835\udd54", "coprod": "\u2210", "copy": "\u00a9", "copysr": "\u2117", "crarr": "\u21b5", "cross": "\u2717",
  "cscr": "\ud835\udcb8", "csub": "\u2acf", "csube": "\u2ad1", "csup": "\u2ad0", "csupe": "\u2ad2", "ctdot": "\u22ef",
  "cudarrl": "\u2938", "cudarrr": "\u2935", "cuepr": "\u22de", "cuesc": "\u22df", "cularr": "\u21b6", "cularrp": "\u293d",
  "cup": "\u222a", "cupbrcap": "\u2a48", "cupcap": "\u2a46", "cupcup": "\u2a4a", "cupdot": "\u228d", "cupor": "\u2a45",
  "cups": "\u222a\ufe00", "curarr": "\u21b7", "curarrm": "\u293c", "curlyeqprec": "\u22de", "curlyeqsucc": "\u22df", "curlyvee": "\u22ce",
  "curlywedge": "\u22cf", "curren": "\u00a4", "curvearrowleft": "\u21b6", "curvearrowright": "\u21b7", "cuvee": "\u22ce", "cuwed": "\u22cf",
  "cwconint": "\u2232", "cwint": "\u2231", "cylcty": "\u232d", "dArr": "\u21d3", "dHar": "\u2965", "dagger": "\u2020",
  "daleth": "\u2138", "darr": "\u2193", "dash": "\u2010", "dashv": "\u22a3", "dbkarow": "\u290f", "dblac": "\u02dd",
  "dcaron": "\u010f", "dcy": "\u0434", "dd": "\u2146", "ddagger": "\u2021", "ddarr": "\u21ca", "ddotseq": "\u2a77",
  "deg": "\u00b0", "delta": "\u03b4", "demptyv": "\u29b1", "dfisht": "\u297f", "dfr": "\ud835\udd21", "dharl": "\u21c3",
  "dharr": "\u21c2", "diam": "\u22c4", "diamond": "\u22c4", "diamondsuit": "\u2666", "diams": "\u2666", "die": "\u00a8",
  "digamma": "\u03dd", "disin": "\u22f2", "div": "\u00f7", "divide": "\u00f7", "divideontimes": "\u22c7", "divonx": "\u22c7",
  "djcy": "\u0452", "dlcorn": "\u231e", "dlcrop": "\u230d", "dollar": "$", "dopf": "\ud835\udd55", "dot": "\u02d9",
  "doteq": "\u2250", "doteqdot": "\u2251", "dotminus": "\u2238", "dotplus": "\u2214", "dotsquare": "\u22a1", "doublebarwedge": "\u2306",
  "downarrow": "\u2193", "downdownarrows": "\u21ca", "downharpoonleft": "\u21c3", "downharpoonright": "\u21c2", "drbkarow": "\u2910", "drcorn": "\u231f",
  "drcrop": "\u230c", "dscr": "\ud835\udcb9", "dscy": "\u0455", "dsol": "\u29f6", "dstrok": "\u0111", "dtdot": "\u22f1",
  "dtri": "\u25bf", "dtrif": "\u25be", "duarr": "\u21f5", "duhar": "\u296f", "dwangle": "\u29a6", "dzcy": "\u045f",
  "dzigrarr": "\u27ff", "eDDot": "\u2a77", "eDot": "\u2251", "eacute": "\u00e9", "easter": "\u2a6e", "ecaron": "\u011b",
  "ecir": "\u2256", "ecirc": "\u00ea", "ecolon": "\u2255", "ecy": "\u044d", "edot": "\u0117", "ee": "\u2147",
  "efDot": "\u2252", "efr": "\ud835\udd22", "eg": "\u2a9a", "egrave": "\u00e8", "egs": "\u2a96", "egsdot": "\u2a98",
  "el": "\u2a99", "elinters": "\u23e7", "ell": "\u2113", "els": "\u2a95", "elsdot": "\u2a97", "emacr": "\u0113",
  "empty": "\u2205", "emptyset": "\u2205", "emptyv": "\u2205", "emsp": "\u2003", "emsp13": "\u2004", "emsp14": "\u2005",
  "eng": "\u014b", "ensp": "\u2002", "eogon": "\u0119", "eopf": "\ud835\udd56", "epar": "\u22d5", "eparsl": "\u29e3",
  "eplus": "\u2a71", "epsi": "\u03b5", "epsilon": "\u03b5", "epsiv": "\u03f5", "eqcirc": "\u2256", "eqcolon": "\u2255",
  "eqsim": "\u2242", "eqslantgtr": "\u2a96", "eqslantless": "\u2a95", "equals": "=", "equest": "\u225f", "equiv": "\u2261",
  "equivDD": "\u2a78", "eqvparsl": "\u29e5", "erDot": "\u2253", "erarr": "\u2971", "escr": "\u212f", "esdot": "\u2250",
  "esim": "\u2242", "eta": "\u03b7", "eth": "\u00f0", "euml": "\u00eb", "euro": "\u20ac", "excl": "!",
  "exist": "\u2203", "expectation": "\u2130", "exponentiale": "\u2147", "fallingdotseq": "\u2252", "fcy": "\u0444", "female": "\u2640",
  "ffilig": "\ufb03", "fflig": "\ufb00", "ffllig": "\ufb04", "ffr": "\ud835\udd23", "filig": "\ufb01", "fjlig": "fj",
  "flat": "\u266d", "fllig": "\ufb02", "fltns": "\u25b1", "fnof": "\u0192", "fopf": "\ud835\udd57", "forall": "\u2200",
  "fork": "\u22d4", "forkv": "\u2ad9", "fpartint": "\u2a0d", "frac12": "\u00bd", "frac13": "\u2153", "frac14": "\u00bc",
  "frac15": "\u2155", "frac16": "\u2159", "frac18": "\u215b", "frac23": "\u2154", "frac25": "\u2156", "frac34": "\u00be",
  "frac35": "\u2157", "frac38": "\u215c", "frac45": "\u2158", "frac56": "\u215a", "frac58": "\u215d", "frac78": "\u215e",
  "frasl": "\u2044", "frown": "\u2322", "fscr": "\ud835\udcbb", "gE": "\u2267", "gEl": "\u2a8c", "gacute": "\u01f5",
  "gamma": "\u03b3", "gammad": "\u03dd", "gap": "\u2a86", "gbreve": "\u011f", "gcirc": "\u011d", "gcy": "\u0433",
  "gdot": "\u0121", "ge": "\u2265", "gel": "\u22db", "geq": "\u2265", "geqq": "\u2267", "geqslant": "\u2a7e",
  "ges": "\u2a7e", "gescc": "\u2aa9", "gesdot": "\u2a80", "gesdoto": "\u2a82", "gesdotol": "\u2a84", "gesl": "\u22db\ufe00",
  "gesles": "\u2a94", "gfr": "\ud835\udd24", "gg": "\u226b", "ggg": "\u22d9", "gimel": "\u2137", "gjcy": "\u0453",
  "gl": "\u2277", "glE": "\u2a92", "gla": "\u2aa5", "glj": "\u2aa4", "gnE": "\u2269", "gnap": "\u2a8a",
  "gnapprox": "\u2a8a", "gne": "\u2a88", "gneq": "\u2a88", "gneqq": "\u2269", "gnsim": "\u22e7", "gopf": "\ud835\udd58",
  "grave": "`", "gscr": "\u210a", "gsim": "\u2273", "gsime": "\u2a8e", "gsiml": "\u2a90", "gt": ">",
  "gtcc": "\u2aa7", "gtcir": "\u2a7a", "gtdot": "\u22d7", "gtlPar": "\u2995", "gtquest": "\u2a7c", "gtrapprox": "\u2a86",
  "gtrarr": "\u2978", "gtrdot": "\u22d7", "gtreqless": "\u22db", "gtreqqless": "\u2a8c", "gtrless": "\u2277", "gtrsim": "\u2273",
  "gvertneqq": "\u2269\ufe00", "gvnE": "\u2269\ufe00", "hArr": "\u21d4", "hairsp": "\u200a", "half": "\u00bd", "hamilt": "\u210b",
  "hardcy": "\u044a", "harr": "\u2194", "harrcir": "\u2948", "harrw": "\u21ad", "hbar": "\u210f", "hcirc": "\u0125",
  "hearts": "\u2665", "heartsuit": "\u2665", "hellip": "\u2026", "hercon": "\u22b9", "hfr": "\ud835\udd25", "hksearow": "\u2925",
  "hkswarow": "\u2926", "hoarr": "\u21ff", "homtht": "\u223b", "hookleftarrow": "\u21a9", "hookrightarrow": "\u21aa", "hopf": "\ud835\udd59",
  "horbar": "\u2015", "hscr": "\ud835\udcbd", "hslash": "\u210f", "hstrok": "\u0127", "hybull": "\u2043", "hyphen": "\u2010",
  "iacute": "\u00ed", "ic": "\u2063", "icirc": "\u00ee", "icy": "\u0438", "iecy": "\u0435", "iexcl": "\u00a1",
  "iff": "\u21d4", "ifr": "\ud835\udd26", "igrave": "\u00ec", "ii": "\u2148", "iiiint": "\u2a0c", "iiint": "\u222d",
  "iinfin": "\u29dc", "iiota": "\u2129", "ijlig": "\u0133", "imacr": "\u012b", "image": "\u2111", "imagline": "\u2110",
  "imagpart": "\u2111", "imath": "\u0131", "imof": "\u22b7", "imped": "\u01b5", "in": "\u2208", "incare": "\u2105",
  "infin": "\u221e", "infintie": "\u29dd", "inodot": "\u0131", "int": "\u222b", "intcal": "\u22ba", "integers": "\u2124",
  "intercal": "\u22ba", "intlarhk": "\u2a17", "intprod": "\u2a3c", "iocy": "\u0451", "iogon": "\u012f", "iopf": "\ud835\udd5a",
  "iota": "\u03b9", "iprod": "\u2a3c", "iquest": "\u00bf", "iscr": "\ud835\udcbe", "isin": "\u2208", "isinE": "\u22f9",
  "isindot": "\u22f5", "isins": "\u22f4", "isinsv": "\u22f3", "isinv": "\u2208", "it": "\u2062", "itilde": "\u0129",
  "iukcy": "\u0456", "iuml": "\u00ef", "jcirc": "\u0135", "jcy": "\u0439", "jfr": "\ud835\udd27", "jmath": "\u0237",
  "jopf": "\ud835\udd5b", "jscr": "\ud835\udcbf", "jsercy": "\u0458", "jukcy": "\u0454", "kappa": "\u03ba", "kappav": "\u03f0",
  "kcedil": "\u0137", "kcy": "\u043a", "kfr": "\ud835\udd28", "kgreen": "\u0138", "khcy": "\u0445", "kjcy": "\u045c",
  "kopf": "\ud835\udd5c", "kscr": "\ud835\udcc0", "lAarr": "\u21da", "lArr": "\u21d0", "lAtail": "\u291b", "lBarr": "\u290e",
  "lE": "\u2266", "lEg": "\u2a8b", "lHar": "\u2962", "lacute": "\u013a", "laemptyv": "\u29b4", "lagran": "\u2112",
  "lambda": "\u03bb", "lang": "\u27e8", "langd": "\u2991", "langle": "\u27e8", "lap": "\u2a85", "laquo": "\u00ab",
  "larr": "\u2190", "larrb": "\u21e4", "larrbfs": "\u291f", "larrfs": "\u291d", "larrhk": "\u21a9", "larrlp": "\u21ab",
  "larrpl": "\u2939", "larrsim": "\u2973", "larrtl": "\u21a2", "lat": "\u2aab", "latail": "\u2919", "late": "\u2aad",
  "lates": "\u2aad\ufe00", "lbarr": "\u290c", "lbbrk": "\u2772", "lbrace": "{", "lbrack": "[", "lbrke": "\u298b",
  "lbrksld": "\u298f", "lbrkslu": "\u298d", "lcaron": "\u013e", "lcedil": "\u013c", "lceil": "\u2308", "lcub": "{",
  "lcy": "\u043b", "ldca": "\u2936", "ldquo": "\u201c", "ldquor": "\u201e", "ldrdhar": "\u2967", "ldrushar": "\u294b",
  "ldsh": "\u21b2", "le": "\u2264", "leftarrow": "\u2190", "leftarrowtail": "\u21a2", "leftharpoondown": "\u21bd", "leftharpoonup": "\u21bc",
  "leftleftarrows": "\u21c7", "leftrightarrow": "\u2194", "leftrightarrows": "\u21c6", "leftrightharpoons": "\u21cb", "leftrightsquigarrow": "\u21ad", "leftthreetimes": "\u22cb",
  "leg": "\u22da", "leq": "\u2264", "leqq": "\u2266", "leqslant": "\u2a7d", "les": "\u2a7d", "lescc": "\u2aa8",
  "lesdot": "\u2a7f", "lesdoto": "\u2a81", "lesdotor": "\u2a83", "lesg": "\u22da\ufe00", "lesges": "\u2a93", "lessapprox": "\u2a85",
  "lessdot": "\u22d6", "lesseqgtr": "\u22da", "lesseqqgtr": "\u2a8b", "lessgtr": "\u2276", "lesssim": "\u2272", "lfisht": "\u297c",
  "lfloor": "\u230a", "lfr": "\ud835\udd29", "lg": "\u2276", "lgE": "\u2a91", "lhard": "\u21bd", "lharu": "\u21bc",
  "lharul": "\u296a", "lhblk": "\u2584", "ljcy": "\u0459", "ll": "\u226a", "llarr": "\u21c7", "llcorner": "\u231e",
  "llhard": "\u296b", "lltri": "\u25fa", "lmidot": "\u0140", "lmoust": "\u23b0", "lmoustache": "\u23b0", "lnE": "\u2268",
  "lnap": "\u2a89", "lnapprox": "\u2a89", "lne": "\u2a87", "lneq": "\u2a87", "lneqq": "\u2268", "lnsim": "\u22e6",
  "loang": "\u27ec", "loarr": "\u21fd", "lobrk": "\u27e6", "longleftarrow": "\u27f5", "longleftrightarrow": "\u27f7", "longmapsto": "\u27fc",
  "longrightarrow": "\u27f6", "looparrowleft": "\u21ab", "looparrowright": "\u21ac", "lopar": "\u2985", "lopf": "\ud835\udd5d", "loplus": "\u2a2d",
  "lotimes": "\u2a34", "lowast": "\u2217", "lowbar": "_", "loz": "\u25ca", "lozenge": "\u25ca", "lozf": "\u29eb",
  "lpar": "(", "lparlt": "\u2993", "lrarr": "\u21c6", "lrcorner": "\u231f", "lrhar": "\u21cb", "lrhard": "\u296d",
  "lrm": "\u200e", "lrtri": "\u22bf", "lsaquo": "\u2039", "lscr": "\ud835\udcc1", "lsh": "\u21b0", "lsim": "\u2272",
  "lsime": "\u2a8d", "lsimg": "\u2a8f", "lsqb": "[", "lsquo": "\u2018", "lsquor": "\u201a", "lstrok": "\u0142",
  "lt": "<", "ltcc": "\u2aa6", "ltcir": "\u2a79", "ltdot": "\u22d6", "lthree": "\u22cb", "ltimes": "\u22c9",
  "ltlarr": "\u2976", "ltquest": "\u2a7b", "ltrPar": "\u2996", "ltri": "\u25c3", "ltrie": "\u22b4", "ltrif": "\u25c2",
  "lurdshar": "\u294a", "luruhar": "\u2966", "lvertneqq": "\u2268\ufe00", "lvnE": "\u2268\ufe00", "mDDot": "\u223a", "macr": "\u00af",
  "male": "\u2642", "malt": "\u2720", "maltese": "\u2720", "map": "\u21a6", "mapsto": "\u21a6", "mapstodown": "\u21a7",
  "mapstoleft": "\u21a4", "mapstoup": "\u21a5", "marker": "\u25ae", "mcomma": "\u2a29", "mcy": "\u043c", "mdash": "\u2014",
  "measuredangle": "\u2221", "mfr": "\ud835\udd2a", "mho": "\u2127", "micro": "\u00b5", "mid": "\u2223", "midast": "*",
  "midcir": "\u2af0", "middot": "\u00b7", "minus": "\u2212", "minusb": "\u229f", "minusd": "\u2238", "minusdu": "\u2a2a",
  "mlcp": "\u2adb", "mldr": "\u2026", "mnplus": "\u2213", "models": "\u22a7", "mopf": "\ud835\udd5e", "mp": "\u2213",
  "mscr": "\ud835\udcc2", "mstpos": "\u223e", "mu": "\u03bc", "multimap": "\u22b8", "mumap": "\u22b8", "nGg": "\u22d9\u0338",
  "nGt": "\u226b\u20d2", "nGtv": "\u226b\u0338", "nLeftarrow": "\u21cd", "nLeftrightarrow": "\u21ce", "nLl": "\u22d8\u0338", "nLt": "\u226a\u20d2",
  "nLtv": "\u226a\u0338", "nRightarrow": "\u21cf", "nVDash": "\u22af", "nVdash": "\u22ae", "nabla": "\u2207", "nacute": "\u0144",
  "nang": "\u2220\u20d2", "nap": "\u2249", "napE": "\u2a70\u0338", "napid": "\u224b\u0338", "napos": "\u0149", "napprox": "\u2249",
  "natur": "\u266e", "natural": "\u266e", "naturals": "\u2115", "nbsp": "\u00a0", "nbump": "\u224e\u0338", "nbumpe": "\u224f\u0338",
  "ncap": "\u2a43", "ncaron": "\u0148", "ncedil": "\u0146", "ncong": "\u2247", "ncongdot": "\u2a6d\u0338", "ncup": "\u2a42",
  "ncy": "\u043d", "ndash": "\u2013", "ne": "\u2260", "neArr": "\u21d7", "nearhk": "\u2924", "nearr": "\u2197",
  "nearrow": "\u2197", "nedot": "\u2250\u0338", "nequiv": "\u2262", "nesear": "\u2928", "nesim": "\u2242\u0338", "nexist": "\u2204",
  "nexists": "\u2204", "nfr": "\ud835\udd2b", "ngE": "\u2267\u0338", "nge": "\u2271", "ngeq": "\u2271", "ngeqq": "\u2267\u0338",
  "ngeqslant": "\u2a7e\u0338", "nges": "\u2a7e\u0338", "ngsim": "\u2275", "ngt": "\u226f", "ngtr": "\u226f", "nhArr": "\u21ce",
  "nharr": "\u21ae", "nhpar": "\u2af2", "ni": "\u220b", "nis": "\u22fc", "nisd": "\u22fa", "niv": "\u220b",
  "njcy": "\u045a", "nlArr": "\u21cd", "nlE": "\u2266\u0338", "nlarr": "\u219a", "nldr": "\u2025", "nle": "\u2270",
  "nleftarrow": "\u219a", "nleftrightarrow": "\u21ae", "nleq": "\u2270", "nleqq": "\u2266\u0338", "nleqslant": "\u2a7d\u0338", "nles": "\u2a7d\u0338",
  "nless": "\u226e", "nlsim": "\u2274", "nlt": "\u226e", "nltri": "\u22ea", "nltrie": "\u22ec", "nmid": "\u2224",
  "nopf": "\ud835\udd5f", "not": "\u00ac", "notin": "\u2209", "notinE": "\u22f9\u0338", "notindot": "\u22f5\u0338", "notinva": "\u2209",
  "notinvb": "\u22f7", "notinvc": "\u22f6", "notni": "\u220c", "notniva": "\u220c", "notnivb": "\u22fe", "notnivc": "\u22fd",
  "npar": "\u2226", "nparallel": "\u2226", "nparsl": "\u2afd\u20e5", "npart": "\u2202\u0338", "npolint": "\u2a14", "npr": "\u2280",
  "nprcue": "\u22e0", "npre": "\u2aaf\u0338", "nprec": "\u2280", "npreceq": "\u2aaf\u0338", "nrArr": "\u21cf", "nrarr": "\u219b",
  "nrarrc": "\u2933\u0338", "nrarrw": "\u219d\u0338", "nrightarrow": "\u219b", "nrtri": "\u22eb", "nrtrie": "\u22ed", "nsc": "\u2281",
  "nsccue": "\u22e1", "nsce": "\u2ab0\u0338", "nscr": "\ud835\udcc3", "nshortmid": "\u2224", "nshortparallel": "\u2226", "nsim": "\u2241",
  "nsime": "\u2244", "nsimeq": "\u2244", "nsmid": "\u2224", "nspar": "\u2226", "nsqsube": "\u22e2", "nsqsupe": "\u22e3",
  "nsub": "\u2284", "nsubE": "\u2ac5\u0338", "nsube": "\u2288", "nsubset": "\u2282\u20d2", "nsubseteq": "\u2288", "nsubseteqq": "\u2ac5\u0338",
  "nsucc": "\u2281", "nsucceq": "\u2ab0\u0338", "nsup": "\u2285", "nsupE": "\u2ac6\u0338", "nsupe": "\u2289", "nsupset": "\u2283\u20d2",
  "nsupseteq": "\u2289", "nsupseteqq": "\u2ac6\u0338", "ntgl": "\u2279", "ntilde": "\u00f1", "ntlg": "\u2278", "ntriangleleft": "\u22ea",
  "ntrianglelefteq": "\u22ec", "ntriangleright": "\u22eb", "ntrianglerighteq": "\u22ed", "nu": "\u03bd", "num": "#", "numero": "\u2116",
  "numsp": "\u2007", "nvDash": "\u22ad", "nvHarr": "\u2904", "nvap": "\u224d\u20d2", "nvdash": "\u22ac", "nvge": "\u2265\u20d2",
  "nvgt": ">\u20d2", "nvinfin": "\u29de", "nvlArr": "\u2902", "nvle": "\u2264\u20d2", "nvlt": "<\u20d2", "nvltrie": "\u22b4\u20d2",
  "nvrArr": "\u2903", "nvrtrie": "\u22b5\u20d2", "nvsim": "\u223c\u20d2", "nwArr": "\u21d6", "nwarhk": "\u2923", "nwarr": "\u2196",
  "nwarrow": "\u2196", "nwnear": "\u2927", "oS": "\u24c8", "oacute": "\u00f3", "oast": "\u229b", "ocir": "\u229a",
  "ocirc": "\u00f4", "ocy": "\u043e", "odash": "\u229d", "odblac": "\u0151", "odiv": "\u2a38", "odot": "\u2299",
  "odsold": "\u29bc", "oelig": "\u0153", "ofcir": "\u29bf", "ofr": "\ud835\udd2c", "ogon": "\u02db", "ograve": "\u00f2",
  "ogt": "\u29c1", "ohbar": "\u29b5", "ohm": "\u03a9", "oint": "\u222e", "olarr": "\u21ba", "olcir": "\u29be",
  "olcross": "\u29bb", "oline": "\u203e", "olt": "\u29c0", "omacr": "\u014d", "omega": "\u03c9", "omicron": "\u03bf",
  "omid": "\u29b6", "ominus": "\u2296", "oopf": "\ud835\udd60", "opar": "\u29b7", "operp": "\u29b9", "oplus": "\u2295",
  "or": "\u2228", "orarr": "\u21bb", "ord": "\u2a5d", "order": "\u2134", "orderof": "\u2134", "ordf": "\u00aa",
  "ordm": "\u00ba", "origof": "\u22b6", "oror": "\u2a56", "orslope": "\u2a57", "orv": "\u2a5b", "oscr": "\u2134",
  "oslash": "\u00f8", "osol": "\u2298", "otilde": "\u00f5", "otimes": "\u2297", "otimesas": "\u2a36", "ouml": "\u00f6",
  "ovbar": "\u233d", "par": "\u2225", "para": "\u00b6", "parallel": "\u2225", "parsim": "\u2af3", "parsl": "\u2afd",
  "part": "\u2202", "pcy": "\u043f", "percnt": "%", "period": ".", "permil": "\u2030", "perp": "\u22a5",
  "pertenk": "\u2031", "pfr": "\ud835\udd2d", "phi": "\u03c6", "phiv": "\u03d5", "phmmat": "\u2133", "phone": "\u260e",
  "pi": "\u03c0", "pitchfork": "\u22d4", "piv": "\u03d6", "planck": "\u210f", "planckh": "\u210e", "plankv": "\u210f",
  "plus": "+", "plusacir": "\u2a23", "plusb": "\u229e", "pluscir": "\u2a22", "plusdo": "\u2214", "plusdu": "\u2a25",
  "pluse": "\u2a72", "plusmn": "\u00b1", "plussim": "\u2a26", "plustwo": "\u2a27", "pm": "\u00b1", "pointint": "\u2a15",
  "popf": "\ud835\udd61", "pound": "\u00a3", "pr": "\u227a", "prE": "\u2ab3", "prap": "\u2ab7", "prcue": "\u227c",
  "pre": "\u2aaf", "prec": "\u227a", "precapprox": "\u2ab7", "preccurlyeq": "\u227c", "preceq": "\u2aaf", "precnapprox": "\u2ab9",
  "precneqq": "\u2ab5", "precnsim": "\u22e8", "precsim": "\u227e", "prime": "\u2032", "primes": "\u2119", "prnE": "\u2ab5",
  "prnap": "\u2ab9", "prnsim": "\u22e8", "prod": "\u220f", "profalar": "\u232e", "profline": "\u2312", "profsurf": "\u2313",
  "prop": "\u221d", "propto": "\u221d", "prsim": "\u227e", "prurel": "\u22b0", "pscr": "\ud835\udcc5", "psi": "\u03c8",
  "puncsp": "\u2008", "qfr": "\ud835\udd2e", "qint": "\u2a0c", "qopf": "\ud835\udd62", "qprime": "\u2057", "qscr": "\ud835\udcc6",
  "quaternions": "\u210d", "quatint": "\u2a16", "quest": "?", "questeq": "\u225f", "quot": "\"", "rAarr": "\u21db",
  "rArr": "\u21d2", "rAtail": "\u291c", "rBarr": "\u290f", "rHar": "\u2964", "race": "\u223d\u0331", "racute": "\u0155",
  "radic": "\u221a", "raemptyv": "\u29b3", "rang": "\u27e9", "rangd": "\u2992", "range": "\u29a5", "rangle": "\u27e9",
  "raquo": "\u00bb", "rarr": "\u2192", "rarrap": "\u2975", "rarrb": "\u21e5", "rarrbfs": "\u2920", "rarrc": "\u2933",
  "rarrfs": "\u291e", "rarrhk": "\u21aa", "rarrlp": "\u21ac", "rarrpl": "\u2945", "rarrsim": "\u2974", "rarrtl": "\u21a3",
  "rarrw": "\u219d", "ratail": "\u291a", "ratio": "\u2236", "rationals": "\u211a", "rbarr": "\u290d", "rbbrk": "\u2773",
  "rbrace": "}", "rbrack": "]", "rbrke": "\u298c", "rbrksld": "\u298e", "rbrkslu": "\u2990", "rcaron": "\u0159",
  "rcedil": "\u0157", "rceil": "\u2309", "rcub": "}", "rcy": "\u0440", "rdca": "\u2937", "rdldhar": "\u2969",
  "rdquo": "\u201d", "rdquor": "\u201d", "rdsh": "\u21b3", "real": "\u211c", "realine": "\u211b", "realpart": "\u211c",
  "reals": "\u211d", "rect": "\u25ad", "reg": "\u00ae", "rfisht": "\u297d", "rfloor": "\u230b", "rfr": "\ud835\udd2f",
  "rhard": "\u21c1", "rharu": "\u21c0", "rharul": "\u296c", "rho": "\u03c1", "rhov": "\u03f1", "rightarrow": "\u2192",
  "rightarrowtail": "\u21a3", "rightharpoondown": "\u21c1", "rightharpoonup": "\u21c0", "rightleftarrows": "\u21c4", "rightleftharpoons": "\u21cc", "rightrightarrows": "\u21c9",
  "rightsquigarrow": "\u219d", "rightthreetimes": "\u22cc", "ring": "\u02da", "risingdotseq": "\u2253", "rlarr": "\u21c4", "rlhar": "\u21cc",
  "rlm": "\u200f", "rmoust": "\u23b1", "rmoustache": "\u23b1", "rnmid": "\u2aee", "roang": "\u27ed", "roarr": "\u21fe",
  "robrk": "\u27e7", "ropar": "\u2986", "ropf": "\ud835\udd63", "roplus": "\u2a2e", "rotimes": "\u2a35", "rpar": ")",
  "rpargt": "\u2994", "rppolint": "\u2a12", "rrarr": "\u21c9", "rsaquo": "\u203a", "rscr": "\ud835\udcc7", "rsh": "\u21b1",
  "rsqb": "]", "rsquo": "\u2019", "rsquor": "\u2019", "rthree": "\u22cc", "rtimes": "\u22ca", "rtri": "\u25b9",
  "rtrie": "\u22b5", "rtrif": "\u25b8", "rtriltri": "\u29ce", "ruluhar": "\u2968", "rx": "\u211e", "sacute": "\u015b",
  "sbquo": "\u201a", "sc": "\u227b", "scE": "\u2ab4", "scap": "\u2ab8", "scaron": "\u0161", "sccue": "\u227d",
  "sce": "\u2ab0", "scedil": "\u015f", "scirc": "\u015d", "scnE": "\u2ab6", "scnap": "\u2aba", "scnsim": "\u22e9",
  "scpolint": "\u2a13", "scsim": "\u227f", "scy": "\u0441", "sdot": "\u22c5", "sdotb": "\u22a1", "sdote": "\u2a66",
  "seArr": "\u21d8", "searhk": "\u2925", "searr": "\u2198", "searrow": "\u2198", "sect": "\u00a7", "semi": ";",
  "seswar": "\u2929", "setminus": "\u2216", "setmn": "\u2216", "sext": "\u2736", "sfr": "\ud835\udd30", "sfrown": "\u2322",
  "sharp": "\u266f", "shchcy": "\u0449", "shcy": "\u0448", "shortmid": "\u2223", "shortparallel": "\u2225", "shy": "\u00ad",
  "sigma": "\u03c3", "sigmaf": "\u03c2", "sigmav": "\u03c2", "sim": "\u223c", "simdot": "\u2a6a", "sime": "\u2243",
  "simeq": "\u2243", "simg": "\u2a9e", "simgE": "\u2aa0", "siml": "\u2a9d", "simlE": "\u2a9f", "simne": "\u2246",
  "simplus": "\u2a24", "simrarr": "\u2972", "slarr": "\u2190", "smallsetminus": "\u2216", "smashp": "\u2a33", "smeparsl": "\u29e4",
  "smid": "\u2223", "smile": "\u2323", "smt": "\u2aaa", "smte": "\u2aac", "smtes": "\u2aac\ufe00", "softcy": "\u044c",
  "sol": "/", "solb": "\u29c4", "solbar": "\u233f", "sopf": "\ud835\udd64", "spades": "\u2660", "spadesuit": "\u2660",
  "spar": "\u2225", "sqcap": "\u2293", "sqcaps": "\u2293\ufe00", "sqcup": "\u2294", "sqcups": "\u2294\ufe00", "sqsub": "\u228f",
  "sqsube": "\u2291", "sqsubset": "\u228f", "sqsubseteq": "\u2291", "sqsup": "\u2290", "sqsupe": "\u2292", "sqsupset": "\u2290",
  "sqsupseteq": "\u2292", "squ": "\u25a1", "square": "\u25a1", "squarf": "\u25aa", "squf": "\u25aa", "srarr": "\u2192",
  "sscr": "\ud835\udcc8", "ssetmn": "\u2216", "ssmile": "\u2323", "sstarf": "\u22c6", "star": "\u2606", "starf": "\u2605",
  "straightepsilon": "\u03f5", "straightphi": "\u03d5", "strns": "\u00af", "sub": "\u2282", "subE": "\u2ac5", "subdot": "\u2abd",
  "sube": "\u2286", "subedot": "\u2ac3", "submult": "\u2ac1", "subnE": "\u2acb", "subne": "\u228a", "subplus": "\u2abf",
  "subrarr": "\u2979", "subset": "\u2282", "subseteq": "\u2286", "subseteqq": "\u2ac5", "subsetneq": "\u228a", "subsetneqq": "\u2acb",
  "subsim": "\u2ac7", "subsub": "\u2ad5", "subsup": "\u2ad3", "succ": "\u227b", "succapprox": "\u2ab8", "succcurlyeq": "\u227d",
  "succeq": "\u2ab0", "succnapprox": "\u2aba", "succneqq": "\u2ab6", "succnsim": "\u22e9", "succsim": "\u227f", "sum": "\u2211",
  "sung": "\u266a", "sup": "\u2283", "sup1": "\u00b9", "sup2": "\u00b2", "sup3": "\u00b3", "supE": "\u2ac6",
  "supdot": "\u2abe", "supdsub": "\u2ad8", "supe": "\u2287", "supedot": "\u2ac4", "suphsol": "\u27c9", "suphsub": "\u2ad7",
  "suplarr": "\u297b", "supmult": "\u2ac2", "supnE": "\u2acc", "supne": "\u228b", "supplus": "\u2ac0", "supset": "\u2283",
  "supseteq": "\u2287", "supseteqq": "\u2ac6", "supsetneq": "\u228b", "supsetneqq": "\u2acc", "supsim": "\u2ac8", "supsub": "\u2ad4",
  "supsup": "\u2ad6", "swArr": "\u21d9", "swarhk": "\u2926", "swarr": "\u2199", "swarrow": "\u2199", "swnwar": "\u292a",
  "szlig": "\u00df", "target": "\u2316", "tau": "\u03c4", "tbrk": "\u23b4", "tcaron": "\u0165", "tcedil": "\u0163",
  "tcy": "\u0442", "tdot": "\u20db", "telrec": "\u2315", "tfr": "\ud835\udd31", "there4": "\u2234", "therefore": "\u2234",
  "theta": "\u03b8", "thetasym": "\u03d1", "thetav": "\u03d1", "thickapprox": "\u2248", "thicksim": "\u223c", "thinsp": "\u2009",
  "thkap": "\u2248", "thksim": "\u223c", "thorn": "\u00fe", "tilde": "\u02dc", "times": "\u00d7", "timesb": "\u22a0",
  "timesbar": "\u2a31", "timesd": "\u2a30", "tint": "\u222d", "toea": "\u2928", "top": "\u22a4", "topbot": "\u2336",
  "topcir": "\u2af1", "topf": "\ud835\udd65", "topfork": "\u2ada", "tosa": "\u2929", "tprime": "\u2034", "trade": "\u2122",
  "triangle": "\u25b5", "triangledown": "\u25bf", "triangleleft": "\u25c3", "trianglelefteq": "\u22b4", "triangleq": "\u225c", "triangleright": "\u25b9",
  "trianglerighteq": "\u22b5", "tridot": "\u25ec", "trie": "\u225c", "triminus": "\u2a3a", "triplus": "\u2a39", "trisb": "\u29cd",
  "tritime": "\u2a3b", "trpezium": "\u23e2", "tscr": "\ud835\udcc9", "tscy": "\u0446", "tshcy": "\u045b", "tstrok": "\u0167",
  "twixt": "\u226c", "twoheadleftarrow": "\u219e", "twoheadrightarrow": "\u21a0", "uArr": "\u21d1", "uHar": "\u2963", "uacute": "\u00fa",
  "uarr": "\u2191", "ubrcy": "\u045e", "ubreve": "\u016d", "ucirc": "\u00fb", "ucy": "\u0443", "udarr": "\u21c5",
  "udblac": "\u0171", "udhar": "\u296e", "ufisht": "\u297e", "ufr": "\ud835\udd32", "ugrave": "\u00f9", "uharl": "\u21bf",
  "uharr": "\u21be", "uhblk": "\u2580", "ulcorn": "\u231c", "ulcorner": "\u231c", "ulcrop": "\u230f", "ultri": "\u25f8",
  "umacr": "\u016b", "uml": "\u00a8", "uogon": "\u0173", "uopf": "\ud835\udd66", "uparrow": "\u2191", "updownarrow": "\u2195",
  "upharpoonleft": "\u21bf", "upharpoonright": "\u21be", "uplus": "\u228e", "upsi": "\u03c5", "upsih": "\u03d2", "upsilon": "\u03c5",
  "upuparrows": "\u21c8", "urcorn": "\u231d", "urcorner": "\u231d", "urcrop": "\u230e", "uring": "\u016f", "urtri": "\u25f9",
  "uscr": "\ud835\udcca", "utdot": "\u22f0", "utilde": "\u0169", "utri": "\u25b5", "utrif": "\u25b4", "uuarr": "\u21c8",
  "uuml": "\u00fc", "uwangle": "\u29a7", "vArr": "\u21d5", "vBar": "\u2ae8", "vBarv": "\u2ae9", "vDash": "\u22a8",
  "vangrt": "\u299c", "varepsilon": "\u03f5", "varkappa": "\u03f0", "varnothing": "\u2205", "varphi": "\u03d5", "varpi": "\u03d6",
  "varpropto": "\u221d", "varr": "\u2195", "varrho": "\u03f1", "varsigma": "\u03c2", "varsubsetneq": "\u228a\ufe00", "varsubsetneqq": "\u2acb\ufe00",
  "varsupsetneq": "\u228b\ufe00", "varsupsetneqq": "\u2acc\ufe00", "vartheta": "\u03d1", "vartriangleleft": "\u22b2", "vartriangleright": "\u22b3", "vcy": "\u0432",
  "vdash": "\u22a2", "vee": "\u2228", "veebar": "\u22bb", "veeeq": "\u225a", "vellip": "\u22ee", "verbar": "|",
  "vert": "|", "vfr": "\ud835\udd33", "vltri": "\u22b2", "vnsub": "\u2282\u20d2", "vnsup": "\u2283\u20d2", "vopf": "\ud835\udd67",
  "vprop": "\u221d", "vrtri": "\u22b3", "vscr": "\ud835\udccb", "vsubnE": "\u2acb\ufe00", "vsubne": "\u228a\ufe00", "vsupnE": "\u2acc\ufe00",
  "vsupne": "\u228b\ufe00", "vzigzag": "\u299a", "wcirc": "\u0175", "wedbar": "\u2a5f", "wedge": "\u2227", "wedgeq": "\u2259",
  "weierp": "\u2118", "wfr": "\ud835\udd34", "wopf": "\ud835\udd68", "wp": "\u2118", "wr": "\u2240", "wreath": "\u2240",
  "wscr": "\ud835\udccc", "xcap": "\u22c2", "xcirc": "\u25ef", "xcup": "\u22c3", "xdtri": "\u25bd", "xfr": "\ud835\udd35",
  "xhArr": "\u27fa", "xharr": "\u27f7", "xi": "\u03be", "xlArr": "\u27f8", "xlarr": "\u27f5", "xmap": "\u27fc",
  "xnis": "\u22fb", "xodot": "\u2a00", "xopf": "\ud835\udd69", "xoplus": "\u2a01", "xotime": "\u2a02", "xrArr": "\u27f9",
  "xrarr": "\u27f6", "xscr": "\ud835\udccd", "xsqcup": "\u2a06", "xuplus": "\u2a04", "xutri": "\u25b3", "xvee": "\u22c1",
  "xwedge": "\u22c0", "yacute": "\u00fd", "yacy": "\u044f", "ycirc": "\u0177", "ycy": "\u044b", "yen": "\u00a5",
  "yfr": "\ud835\udd36", "yicy": "\u0457", "yopf": "\ud835\udd6a", "yscr": "\ud835\udcce", "yucy": "\u044e", "yuml": "\u00ff",
  "zacute": "\u017a", "zcaron": "\u017e", "zcy": "\u0437", "zdot": "\u017c", "zeetrf": "\u2128", "zeta": "\u03b6",
  "zfr": "\ud835\udd37", "zhcy": "\u0436", "zigrarr": "\u21dd", "zopf": "\ud835\udd6b", "zscr": "\ud835\udccf", "zwj": "\u200d",
  "zwnj": "\u200c",
});

function decodeVisibleEntities(value, rawHtml = false) {
  const pattern = rawHtml ? /&#(x[0-9a-f]+|[0-9]+);?|&([A-Za-z][A-Za-z0-9]*);|&(nbsp|shy)/gi : /&#(x[0-9a-f]+|[0-9]+);|&([A-Za-z][A-Za-z0-9]*);/gi;
  return value.replace(pattern, (entity, digits, name, legacy) => {
    if (name || (rawHtml && legacy)) {
      const key = name || legacy;
      return Object.hasOwn(HTML_NAMED_ENTITIES, key) ? HTML_NAMED_ENTITIES[key] : entity;
    }
    const point = digits[0].toLowerCase() === "x" ? parseInt(digits.slice(1), 16) : Number(digits);
    return point > 0 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : entity;
  });
}

// Only presentation is projected here; machine evidence keeps its original bytes.
function validMarkdownDestination(raw, allowEmpty = true) {
  raw = raw.replace(/\r\n?/g, "\n");
  if (/\n[ \t\f\v]*\n/.test(raw)) return false;
  const destination = raw.replace(/^[ \t\n\f\v]*|[ \t\n\f\v]*$/g, "");
  if (!destination) return allowEmpty;
  if (/\\([^\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e])/.test(destination)) return false;
  const match = destination.match(/^((?:<[^<>\r\n]*>|(?:\\.|[^\x00-\x20\x7f<>])+))(?:(?:[ \t\f\v]+(?:\n[ \t\f\v]*)?|\n[ \t\f\v]*)(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\((?:\\.|[^)\\])*\)))?$/);
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
      if ((!valid || /^(?:<[^<>\r\n]*>|(?:\\.|[^\s<>])+)$/.test(destination.trim())) &&
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

const reviewBlockTags = new Set(["address", "article", "aside", "blockquote", "br", "center", "details", "div", "dl", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "nav", "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "th", "thead", "tr", "ul"]);
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
    result += tag[1].toLowerCase() === "br" ? " " : reviewBlockTags.has(tag[1].toLowerCase()) ? "\n\n" : inlineBoundary;
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
  const expandTabs = (value) => {
    let column = 0;
    return value.replace(/[^\t]|\t/g, (character) => {
      if (character !== "\t") { column++; return character; }
      const width = 4 - column % 4; column += width; return " ".repeat(width);
    });
  };
  const paragraphContext = (value) => {
    value = expandTabs(value); const frames = [];
    for (;;) {
      const prefix = value.match(/^ {0,3}(?:>[ \t]?|(?:[-+*]|[0-9]{1,9}[.)])[ \t]+)/);
      if (!prefix) return { content: value, frames };
      frames.push(prefix[0].includes(">") ? { quote: true } : { indent: prefix[0].length });
      value = value.slice(prefix[0].length);
    }
  };
  const continuesParagraph = (value, frames) => {
    value = expandTabs(value);
    for (const frame of frames) {
      if (frame.quote) { const prefix = value.match(/^ {0,3}>[ \t]?/); if (!prefix) return false; value = value.slice(prefix[0].length); }
      else { if ((value.match(/^ */)?.[0].length || 0) < frame.indent) return false; value = value.slice(frame.indent); }
    }
    return true;
  };
  let paragraph = null;
  for (let index = 0; index < lines.length; index++) {
    const line = eligible[index] || "";
    const context = paragraphContext(lines[index]);
    if (paragraph && !continuesParagraph(lines[index], paragraph)) paragraph = null;
    const raw = line.match(/^ {0,3}<(script|pre|style|textarea)(?=[ \t\f>]|$)/i);
    let terminator = raw ? new RegExp("</" + raw[1] + "[ \\t\\f]*>", "i") : null;
    if (/^ {0,3}<!--/.test(line)) terminator = /(?:^ {0,3}<!--(?:>|->)|-->|--!>)/;
    else if (/^ {0,3}<\?/.test(line)) terminator = /\?>/;
    else if (/^ {0,3}<![A-Z]/.test(line)) terminator = />/;
    else if (/^ {0,3}<!\[CDATA\[/.test(line)) terminator = /\]\]>/;
    const blankEnded = !terminator && (blockTag.test(line) || (!paragraph && completeTag.test(line)));
    if (!terminator && !blankEnded) {
      if (!line.trim()) paragraph = null;
      else if (!(!paragraph && /^(?: {4}|\t|\uE002)/.test(line))) paragraph = context.frames;
      continue;
    }
    paragraph = null;
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
    const decoded = decodeVisibleEntities(visible, true);
    const slot = blockLiterals.push(decoded) - 1;
    lines[index] = "\uE005" + slot + "\uE006";
    for (let inner = index + 1; inner <= end; inner++) lines[inner] = "";
    index = end;
  }
  return lines.join("\n");
}

// CommonMark delimiter runs: flanking, intraword underscores, and rule of three.
function isEscapedMarkdownStart(text, index) {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) backslashes += 1;
  return backslashes % 2 === 1;
}

// Code contexts display link syntax literally; protect their opening bracket
// until visible entities are decoded, after all Markdown transformations.

function nextEqualTickRuns(ticks) {
  const nextByLength = new Map();
  const successors = new Array(ticks.length);
  for (let index = ticks.length - 1; index >= 0; index -= 1) {
    const length = ticks[index][0].length;
    successors[index] = nextByLength.get(length);
    nextByLength.set(length, ticks[index]);
  }
  return successors;
}

// CommonMark delimiter runs: flanking, intraword underscores, and rule of three.

function activeMarkdownEmphasis(text) {
  const removed = new Set();
  const runs = [];
  const whitespace = (value) => !value || /\s/u.test(value);
  const punctuation = (value) => !!value && /[\p{P}\p{S}]/u.test(value);
  const escaped = (index) => isEscapedMarkdownStart(text, index);
  // Matched code-span delimiters disappear; their literal content is protected
  // by the existing code-context stage before this projection.
  const ticks = [...text.matchAll(/`+/g)];
  const nextTicks = nextEqualTickRuns(ticks);
  let consumed = 0;
  for (let i = 0; i < ticks.length; i += 1) {
    const start = ticks[i];
    if (start.index < consumed || escaped(start.index)) continue;
    const end = nextTicks[i];
    if (!end) continue;
    for (let j = 0; j < start[0].length; j += 1) { removed.add(start.index + j); removed.add(end.index + j); }
    consumed = end.index + end[0].length;
  }
  for (const match of text.matchAll(/\*+|_+|~{2,}/g)) {
    if (escaped(match.index)) continue;
    const beforeIndex = match.index - (match.index >= 2 && /[\uDC00-\uDFFF]/.test(text[match.index - 1]) && /[\uD800-\uDBFF]/.test(text[match.index - 2]) ? 2 : 1);
    const before = beforeIndex >= 0 ? String.fromCodePoint(text.codePointAt(beforeIndex)) : "";
    const afterIndex = match.index + match[0].length;
    const after = afterIndex < text.length ? String.fromCodePoint(text.codePointAt(afterIndex)) : "";
    const left = !whitespace(after) && (!punctuation(after) || whitespace(before) || punctuation(before));
    const right = !whitespace(before) && (!punctuation(before) || whitespace(after) || punctuation(after));
    runs.push({ character: match[0][0], start: match.index, length: match[0].length, usedOpen: 0, usedClose: 0,
      open: match[0][0] === "_" ? left && (!right || punctuation(before)) : left,
      close: match[0][0] === "_" ? right && (!left || punctuation(after)) : right });
  }
  const eligibleOpeners = new Map();
  for (let closeIndex = 0; closeIndex < runs.length; closeIndex += 1) {
    const closer = runs[closeIndex];
    const candidates = eligibleOpeners.get(closer.character) || [];
    if (closer.close) for (let candidate = candidates.length - 1; candidate >= 0 && closer.length - closer.usedClose >= (closer.character === "~" ? 2 : 1); candidate -= 1) {
      const openIndex = candidates[candidate];
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
    if (closer.open) {
      candidates.push(closeIndex);
      eligibleOpeners.set(closer.character, candidates);
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
  return decodeVisibleEntities(rendered)
    .replace(/\uE005(\d+)\uE006/g, (_, index) => blockLiterals[Number(index)])
    .replace(/\uE002(\d+)\uE003/g, (_, index) => {
      const literal = markdownLiterals[Number(index)];
      const delimiter = literal.match(/^`+/)?.[0];
      return delimiter && literal.endsWith(delimiter) ? literal.slice(delimiter.length, -delimiter.length) : literal;
    })
    .replace(/\bdo[\s\p{Default_Ignorable_Code_Point}]+not[\s\p{Default_Ignorable_Code_Point}]+merge\b/giu, "Do not merge").replace(/\p{Default_Ignorable_Code_Point}/gu, "").replace(/\r\n?/g, "\n").replace(/\n[ \t\f\v]*\n/g, "\uE004").replace(/\s+/g, " ").replace(/\uE004/g, "\n\n");
}

function hasPositiveFindingStatement(text) {
  const cardinal = "(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[ -](?:one|two|three|four|five|six|seven|eight|nine))?)";
  const paragraphs = String(text).replace(/\r\n/g, "\n").split(/[\r\n][ \t\f\v]*[\r\n]/);
  return paragraphs.some((paragraph) => paragraph.replace(/[ \t\r\n\f\v]+/g, " ")
    .replace(new RegExp("\\b(?:no|zero) +(?:issues?|findings?|problems?|bugs?|flaws?|defects?|regressions?|vulnerabilit(?:y|ies)|security +risks?)[^.!?;]*?\\bexcept +((?:[1-9][0-9]*|some|several|multiple|" + cardinal + "))\\b([^.!?;]*)", "giu"), (match, count, suffix) => match + "; " + count + " findings" + (suffix.trim() ? suffix.replace(/^ *, */, " ") : " remain"))
    .replace(/\b(no|zero) +((?:issues?|findings?|problems?|bugs?|flaws?|defects?|regressions?|vulnerabilit(?:y|ies)|security +risks?)) +(?:and|or) +(?:issues?|findings?|problems?|bugs?|flaws?|defects?|regressions?|vulnerabilit(?:y|ies)|security +risks?)\b/giu, "$1 $2")
    .replace(/\b(no|zero) +(?:(?!(?:issues?|findings?|problems?|bugs?|flaws?|defects?|regressions?|vulnerabilit(?:y|ies)|security +risks?|is|are|was|were|has|have|been|get|gets|got|a|an|one|some|several|multiple)\b)[\p{L}-]+ +)+(?:and|or) +(?:(?!(?:issues?|findings?|problems?|bugs?|flaws?|defects?|regressions?|vulnerabilit(?:y|ies)|security +risks?|is|are|was|were|has|have|been|get|gets|got|a|an|one|some|several|multiple)\b)[\p{L}-]+ +)*((?:issues?|findings?|problems?|bugs?|flaws?|defects?|regressions?|vulnerabilit(?:y|ies)|security +risks?)\b)/giu, "$1 $2")
    .split(/[.!?;]|(?<![0-9]),|,(?![0-9])|\b(?:and|or|but|however|yet)\b/i).some((clause) => {
      // Negating a resolution preserves the finding, unlike negating its noun.
      clause = clause.replace(/\b(?:not|never) +(?:(?:be|been|being|get|gets|got|gotten|getting) +)*(?:resolved|fixed|addressed|cleared|removed|closed|eliminated)\b|\b(?:is|are|was|were|has|have|had)n['’]t +(?:(?:be|been|being|get|gets|got|gotten|getting) +)*(?:resolved|fixed|addressed|cleared|removed|closed|eliminated)\b/gi, " unresolved ");
      const noun = "(?<![\\p{L}\\p{N}_\\p{Pd}])(?:issues?|findings?|problems?|bugs?|flaws?|defects?|regressions?|vulnerabilit(?:y|ies)|security +risks?)(?![\\p{L}\\p{N}_\\p{Pd}])(?! +(?:tests?|reports?)\\b)";
      const headingNoun = noun.replace("(?![\\p{L}\\p{N}_\\p{Pd}])", "(?![\\p{L}\\p{N}_-])");
      const isAffirmative = (match, counted = false) => {
        const before = clause.slice(0, match.index);
        const after = clause.slice(match.index + match[0].length);
        if (!counted && /^ *(?::|[–—-]) *(?:no|none|zero|0+(?:,000)*)(?: +(?:(?:is|are|was|were|be|been|being|has|have|had|[\p{L}]+ly|now) +)*(?:found|outstanding|exist|exists|remain|remains))? *$/iu.test(after)) return false;
        // Scope negation to this construction, not an unrelated earlier clause.
        if (/\b(?:no|zero|not|without|never|cannot)\b|\b[\p{L}]+n['’]t\b/iu.test(match[0])) return false;
        if (/(?:\b(?:no|zero|not|without|never|cannot)|\b[\p{L}]+n['’]t)(?: +(?:be|been|being|get|gets|got|gotten|getting|considered))* +$/iu.test(before)) return false;
        if (/^\s*nobody +(?:(?:can|could|may|might) +|(?:is|are) +able +to +)bypass +authentication\b/iu.test(match[0])) return false;
        const matchedNoun = [...match[0].matchAll(new RegExp(noun, "giu"))].at(-1);
        const predicate = matchedNoun ? match[0].slice(matchedNoun.index + matchedNoun[0].length) : match[0];
        const modifiers = matchedNoun ? match[0].slice(0, matchedNoun.index) : "";
        const tail = predicate + after;
        // Absence/resolution is evidence only for an unqualified completed assertion.
        if (/^ +(?:do|does|did) +not +(?:exist|exists|remain|remains) *$/iu.test(tail)) return false;
        if (/\b(?:resolved|fixed|addressed|cleared|removed|closed|eliminated) +$/iu.test(before)) return false;
        const recurrence = /\b(?:reappears?|reappeared|recurs?|recurred|reopens?|reopened|found +again|(?:is|are) +(?:open|outstanding|unresolved)|(?:still +)?(?:persists?|remains?|exists?))\b/iu.test(tail) && !/\b(?:not|never) +(?:reappear|reappeared|recur|recurred|reopen|reopened|persist|remain|exist)\b/iu.test(tail);
        // Remediation compounds stay neutral unless their own state is reaffirmed.
        if (/^ +fix(?:es)?\b/iu.test(tail) && !recurrence) return false;
        // A mention is informational only when its own finding is not reaffirmed.
        if (/\b(?:mention(?:s|ed|ing)?|discuss(?:es|ed|ing)?) +/iu.test(modifiers) && !recurrence) return false;
        if (/\b(?:resolves?|fix(?:es)?|address(?:es)?|clears?|removes?|closes?|eliminates?|prevents?|avoids?|mitigates?) +(?:a|an) +/iu.test(modifiers) && !recurrence && !tail.trim()) return false;
        const obligation = /\b(?:can|could|may|might|will|would|must|should) +(?:(?:be|been|being|get|gets|got) +)*(?:resolved|fixed|addressed|cleared|removed|closed|eliminated)\b/iu.test(tail);
        if (obligation) return true;
        if (/\b(?:resolved|fixed|addressed|cleared|removed|closed|eliminated)\b/i.test(modifiers) && !recurrence && !/^ +(?:(?:is|are|was|were|has|have|had|be|been|being|get|gets|got|gotten|getting) +)*(?:can|could|may|might|will|would|must|should) +(?:reappear|recur|reopen)\b/iu.test(tail)) return false;
        if (/^(?: +| *(?::|[–—-]) *)(?:(?:that|which) +)?(?:(?:is|are|was|were|has|have|had|be|been|being|get|gets|got|gotten|getting|now|already|remains?) +)*(?:resolved|fixed|addressed|cleared|removed|closed|eliminated|harmless|benign) *$/iu.test(tail)) return false;
          return true;
      };
      const counts = [...clause.matchAll(new RegExp("(?<![\\p{L}\\p{N}_])[*_~`]*([0-9]+(?:,[0-9]{3})*)[*_~`]* +(?:[\\p{L}-]+ +)*?" + noun, "giu"))];
      if (counts.some((match) => !/^0+$/.test(match[1].replaceAll(",", "")) && isAffirmative(match, true))) return true;
      const reporting = clause.replace(new RegExp("(?<![\\p{L}\\p{N}_])[*_~`]*0+(?:,000)*[*_~`]* +(?:[\\p{L}-]+ +)*?" + noun, "giu"), (match) => " ".repeat(match.length));
      const cardinalPattern = "\\b" + cardinal + " +(?:[\\p{L}-]+ +)*?" + noun;
      if ([...reporting.matchAll(new RegExp(cardinalPattern, "giu"))].some((match) => isAffirmative(match, true))) return true;
      const patterns = [
        "\\b(?:is|are) +vulnerable +to\\b",
        "\\bauthentication +(?:can|could|may|might) +be +bypassed\\b",
        "\\b(?:(?:no +(?:(?!(?:is|are|was|were|has|have|had|can|could|may|might)\\b)[\\p{L}-]+ +)*?)?[\\p{L}-]+ +)?(?:(?:can|could|may|might) +|(?:is|are) +able +to +)bypass +authentication\\b",
        "\\b(?:most|every|numerous) +(?:[\\p{L}-]+ +)*?" + noun + " +(?:(?:is|are|was|were|has|have|had|be|been|being|get|gets|got|gotten|getting|still) +)*(?:found|[\\p{L}]+ed|remains?|exists?)\\b",
          "(?<![\\p{L}\\p{N}_] )\\b(?:the +)?(?:(?:critical|security|authentication|code|blocking|high|medium|low|major|minor|unresolved|open|new) +)+" + noun + " +(?:(?:is|are|was|were|has|have|had|be|been|being|get|gets|got|gotten|getting|still) +)*(?:(?:is|are|was|were) +[\\p{L}]+|found|[\\p{L}]+ed|[\\p{L}]+s|remains?|exists?)\\b",
        "\\b(?:a|an) +(?:[\\p{L}-]+ +)*?" + noun + " +(?:(?:can|could|may|might|will|would|must|should) +[\\p{L}-]+|[\\p{L}]+s)\\b",
        "\\bthe +" + noun + " +(?:(?:is|are|was|were) +[\\p{L}-]+|(?:can|could|may|might|will|would|must|should) +[\\p{L}-]+|[\\p{L}]+s)\\b",
        "\\b(?:this|that|these|those) +(?:(?:code|security|blocking|critical|high|medium|low|major|minor|unresolved|open|new|resolved|fixed|addressed|cleared|removed|closed|eliminated) +)*" + noun + " +(?:(?:is|are|was|were) +[\\p{L}-]+|[\\p{L}]+s)\\b",
        "\\b(?:this|that|these|those) +(?:is|are|was|were) +(?:a|an) +(?:[\\p{L}-]+ +)*?" + noun,
        "(?<![\\p{L}\\p{N}_] )\\b(?:(?:a|an|one|some|several|multiple) +)?(?:(?!(?:the|this|that|these|those)\\b)[\\p{L}-]+ +)*?" + headingNoun + "(?= *(?::|[–—-]) *[^ \\t])",
        "\\b(?:found|introduces|creates|contains|has|[\\p{L}]+ed) +(?:[\\p{L}-]+ +)*?" + noun,
        "\\b[\\p{L}]+s +(?:a|an) +(?:[\\p{L}-]+ +)*?" + noun,
        "\\b(?:I|we) +[\\p{L}]+ +(?:a|an) +(?:[\\p{L}-]+ +)*?" + noun,
        "(?:\\b(?:a|an|one|some|several|multiple|[0-9]+) +(?:[\\p{L}-]+ +)*?" + noun + "|\\bthe +" + noun + "|(?<![\\p{L}\\p{N}_] )" + noun + ")" + " +(?:(?:is|are|was|were|has|have|had|be|been|being|get|gets|got|gotten|getting|still) +)*(?:found|[\\p{L}]+ed|remains?|exists?)\\b",
        "\\bthere +(?:still +)?(?:is|are) +(?:[\\p{L}-]+ +)*?" + noun,
        "\\b(?:a|an) +(?:[\\p{L}-]+ +)*?" + noun + " +(?:(?:is|are|was|were) +[\\p{L}-]+|(?!(?:is|was|has)\\b)[\\p{L}]+s)\\b",
        "\\b(?:this|that|these|those) +" + noun + " +(?:(?:is|are|was|were) +[\\p{L}-]+|(?!(?:is|was|has)\\b)[\\p{L}]+s)\\b",
        "(?:\\b(?:both|many|all) +|(?<![\\p{L}\\p{N}_] ))(?:issues|findings|problems|bugs|flaws|defects|regressions|vulnerabilities|security +risks)\\b +(?:(?:is|are|was|were) +[\\p{L}-]+|(?!(?:is|was|has)\\b)[\\p{L}]+)\\b"
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
  const cells = rows[0].split("|").map((cell) => cell.trim());
  if (cells.length !== 6 || cells[1] !== "📝 **Code Review**" || cells[5] !== "" || !["Manual request", "Automatic review"].includes(cells[4])) return null;
  const match = rows[0].match(/\| ✅ \*\*Completed\*\* <relative-time datetime="([^"]+)">([^<]+)<\/relative-time> \|/);
  const value = match && match[1] === match[2] ? Date.parse(match[1]) : NaN;
  const edited = Date.parse(comment?.updated_at || comment?.created_at || "");
  return Number.isFinite(value) && Number.isFinite(edited) && Math.floor(value / 1000) >= Math.floor(Date.parse(comment.created_at || "") / 1000) && value <= edited + 999 ? match[1] : null;
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
        !hasIndependentSecurityWarning(comment, headSha, config) && validFindingCompanions(withoutAttributedFindingProse(comment, headSha, config), validatedTypedState(comment), headSha, config, true) &&
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
function withoutAttributedFindingProse(comment, headSha, config = {}) {
  const state = leadingNegativeState(comment);
  return { ...comment, body: String(comment?.body || "").split(/\r?\n/).map((line) => {
    if (line.startsWith("|")) {
      for (const kind of ["code_review", "security_review"]) {
        const section = state?.[kind];
        const title = kind === "code_review" ? "📝 **Code Review**" : "**Security Review**";
        if (section?.commit_sha === headSha && (section.has_any_findings === true || section.has_unresolved_findings === true) &&
            line.includes(title) && negativeSectionStructure(comment, state, kind, config)) return "";
      }
    }
    if (/[<>|]/.test(line)) return line;
    const attributed = visibleReviewText(line).match(/^\s*(?:📝|🛡️|🔒)?\s*(Code|Security) Review:\s*/i);
    if (!attributed) return line;
    const section = state?.[attributed[1].toLowerCase() + "_review"];
    if (!section || section.commit_sha !== headSha ||
      !(section.has_any_findings === true || section.has_unresolved_findings === true)) return line;
    // Attribution owns only this sentence; later raw prose remains independent.
    const boundary = line.search(/[.!?](?=\s+\S)/);
    return boundary < 0 ? "" : line.slice(boundary + 1);
  }).join("\n") };
}

export function hasIndependentSecurityWarning(comment, headSha, config = {}) {
  return containsBlockingSeverity(withoutAttributedFindingProse(comment, headSha, config).body, "codex");
}

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
    Math.floor(value / 1000) >= Math.floor(Date.parse(comment.created_at || "") / 1000) && value <= updated + 999 ? Math.floor(value / 1000) : NaN;
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
  if (validateCompanion && (otherRows.length !== (state[other].status === null ? 0 : 1) ||
      (otherRows.length === 1 && !removableCompanionRow(comment, state[other], other, otherRows[0])))) return false;
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
  // Companion structure supplies no completion authority; only the owning clock is creation-bound.
  const structural = { ...comment, created_at: "1970-01-01T00:00:00Z", updated_at: comment.updated_at || comment.created_at, body: comment.body.replace(rows[0], cells.join("|")) };
  return Number.isFinite(sectionCompletionBucket(structural, kind, state[kind].commit_sha)) &&
    canonicalSectionClear(structural, { ...state, [kind]: { ...state[kind], has_any_findings: false, has_unresolved_findings: false } },
      kind, state[kind].commit_sha, config, false);
}

function negativeSectionTime(comment, state, kind, headSha, config) {
  if (state[kind].status !== "completed") return NaN;
  const other = kind === "code_review" ? "security_review" : "code_review";
  const otherTitle = other === "security_review" ? "**Security Review**" : "**Code Review**";
  const rows = String(comment.body || "").split(/\r?\n/).filter((line) => isReviewRowCandidate(line, otherTitle));
  if ((rows.length || state[other].status !== null) &&
      (state[other].status !== "completed" || !negativeSectionStructure(comment, state, other, config))) return NaN;
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
    Number.isFinite(sectionCompletionBucket({ ...comment, created_at: "1970-01-01T00:00:00Z", updated_at: comment.updated_at || comment.created_at }, kind, review.commit_sha));
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
