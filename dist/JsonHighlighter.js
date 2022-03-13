"use strict";

require("core-js/modules/es.object.assign.js");

require("core-js/modules/web.dom-collections.iterator.js");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _react = _interopRequireWildcard(require("react"));

var _lodash = require("lodash");

var _reactHighlightWords = _interopRequireDefault(require("react-highlight-words"));

var _utils = require("./utils");

const _excluded = ["json", "space", "paths"];

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function _getRequireWildcardCache(nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }

function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

/*
 * Props:
 * json - a json object or string
 * space - the space parameter for JSON.stringify
 * paths - array of strings - each string represents a path inside the json. e.g: 'foo[0].bar'
 */
const JsonHighlighter = _ref => {
  let {
    json = {},
    space,
    paths = []
  } = _ref,
      restProps = _objectWithoutProperties(_ref, _excluded);

  // convert the json to object if it is provided as a string
  const parsedJSON = (0, _react.useMemo)(() => (0, _utils.parseJson)(json), [json]); // stringify the json with the provided amount of spaces

  const textToHighlight = (0, _react.useMemo)(() => typeof parsedJSON === 'object' ? JSON.stringify(parsedJSON, null, space) : parsedJSON, [parsedJSON, space]); // sort the paths to be in the same order they appear in the json object

  const sortedPaths = (0, _react.useMemo)(() => (0, _utils.getSortedPaths)(parsedJSON, paths), [paths, parsedJSON]); // replace the values in the provided paths with a marker placeholder

  const jsonObjWithMarkers = (0, _react.useMemo)(() => typeof parsedJSON === 'object' ? (0, _utils.replacePathsWithMarkers)(parsedJSON, sortedPaths) : {}, [parsedJSON, sortedPaths]); // extract the search words from the paths in the json object

  const searchWords = (0, _react.useMemo)(() => typeof parsedJSON === 'object' ? sortedPaths.map(path => {
    return JSON.stringify((0, _lodash.get)(parsedJSON, path));
  }) : [], [parsedJSON, sortedPaths]);
  return /*#__PURE__*/_react.default.createElement(_reactHighlightWords.default, _extends({
    textToHighlight: textToHighlight,
    searchWords: searchWords,
    findChunks: (0, _utils.findChunks)(space, jsonObjWithMarkers)
  }, restProps));
};

var _default = JsonHighlighter;
exports.default = _default;