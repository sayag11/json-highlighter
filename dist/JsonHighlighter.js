"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _react = _interopRequireWildcard(require("react"));
var _get = _interopRequireDefault(require("lodash/get"));
var _reactHighlightWords = _interopRequireDefault(require("react-highlight-words"));
var _utils = require("./utils");
const _excluded = ["json", "space", "paths"];
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function _interopRequireWildcard(e, t) { if ("function" == typeof WeakMap) var r = new WeakMap(), n = new WeakMap(); return (_interopRequireWildcard = function _interopRequireWildcard(e, t) { if (!t && e && e.__esModule) return e; var o, i, f = { __proto__: null, default: e }; if (null === e || "object" != typeof e && "function" != typeof e) return f; if (o = t ? n : r) { if (o.has(e)) return o.get(e); o.set(e, f); } for (const t in e) "default" !== t && {}.hasOwnProperty.call(e, t) && ((i = (o = Object.defineProperty) && Object.getOwnPropertyDescriptor(e, t)) && (i.get || i.set) ? o(f, t, i) : f[t] = e[t]); return f; })(e, t); }
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
function _objectWithoutProperties(e, t) { if (null == e) return {}; var o, r, i = _objectWithoutPropertiesLoose(e, t); if (Object.getOwnPropertySymbols) { var n = Object.getOwnPropertySymbols(e); for (r = 0; r < n.length; r++) o = n[r], -1 === t.indexOf(o) && {}.propertyIsEnumerable.call(e, o) && (i[o] = e[o]); } return i; }
function _objectWithoutPropertiesLoose(r, e) { if (null == r) return {}; var t = {}; for (var n in r) if ({}.hasOwnProperty.call(r, n)) { if (-1 !== e.indexOf(n)) continue; t[n] = r[n]; } return t; }
/*
 * Props:
 * json - a json object or string
 * space - the space parameter for JSON.stringify
 * paths - array of strings - each string represents a path inside the json. e.g: 'foo[0].bar'
 */
const JsonHighlighter = _ref => {
  let _ref$json = _ref.json,
    json = _ref$json === void 0 ? {} : _ref$json,
    space = _ref.space,
    _ref$paths = _ref.paths,
    paths = _ref$paths === void 0 ? [] : _ref$paths,
    restProps = _objectWithoutProperties(_ref, _excluded);
  // convert the json to object if it is provided as a string
  const parsedJSON = (0, _react.useMemo)(() => (0, _utils.parseJson)(json), [json]);
  const isHighlightable = parsedJSON !== null && typeof parsedJSON === 'object';

  // stringify the json with the provided amount of spaces
  const textToHighlight = (0, _react.useMemo)(() => typeof parsedJSON === 'string' ? parsedJSON : String(JSON.stringify(parsedJSON, null, space)), [parsedJSON, space]);

  // sort the paths to be in the same order they appear in the json object
  const sortedPaths = (0, _react.useMemo)(() => (0, _utils.getSortedPaths)(parsedJSON, paths), [paths, parsedJSON]);

  // a sentinel that cannot collide with the user's own data
  const marker = (0, _react.useMemo)(() => (0, _utils.createMarker)(parsedJSON), [parsedJSON]);

  // replace the values in the provided paths with a marker placeholder
  const jsonObjWithMarkers = (0, _react.useMemo)(() => isHighlightable ? (0, _utils.replacePathsWithMarkers)(parsedJSON, sortedPaths, marker) : {}, [parsedJSON, sortedPaths, marker, isHighlightable]);

  // extract the search words from the paths in the json object, formatted exactly as they
  // appear in textToHighlight so a chunk's offsets delimit the value precisely
  const searchWords = (0, _react.useMemo)(() => isHighlightable ? sortedPaths.map(path => JSON.stringify((0, _get.default)(parsedJSON, path), null, space)) : [], [parsedJSON, sortedPaths, space, isHighlightable]);

  // restProps is spread first on purpose: textToHighlight, searchWords and findChunks are
  // computed together and must stay consistent, so a pass-through prop must not clobber them.
  return /*#__PURE__*/_react.default.createElement(_reactHighlightWords.default, _extends({}, restProps, {
    textToHighlight: textToHighlight,
    searchWords: searchWords,
    findChunks: (0, _utils.findChunks)(space, jsonObjWithMarkers, marker)
  }));
};
var _default = exports.default = JsonHighlighter;