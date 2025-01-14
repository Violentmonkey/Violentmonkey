import { BLACKLIST, BLACKLIST_NET, FILE_GLOB_ALL } from '@/common/consts';

export const kAutocompleteOnTyping = 'autocompleteOnTyping';
export const kFiltersPopup = 'filtersPopup';
export const kKillTrailingSpaceOnSave = 'killTrailingSpaceOnSave';
export const kPopupWidth = 'popupWidth';
export const kShowTrailingSpace = 'showTrailingSpace';
export const kScriptTemplate = 'scriptTemplate';
export const kUpdateEnabledScriptsOnly = 'updateEnabledScriptsOnly';
const defaultsValueEditor = {
  [kAutocompleteOnTyping]: 100,
  lineWrapping: false,
  indentWithTabs: false,
  indentUnit: 2,
  tabSize: 2,
  undoDepth: 500,
};
export const defaultsEditor = {
  [kKillTrailingSpaceOnSave]: true,
  [kShowTrailingSpace]: true,
  ...defaultsValueEditor,
};

export default {
  [IS_APPLIED]: true,
  [BLACKLIST]: FILE_GLOB_ALL,
  [BLACKLIST_NET]: FILE_GLOB_ALL,
  [kPopupWidth]: 320,
  [kUpdateEnabledScriptsOnly]: true,
  autoUpdate: 1, // days, 0 = disable
  // ignoreGrant: false,
  lastUpdate: 0,
  lastModified: 0,
  /** @type {VMBadgeMode} */
  showBadge: 'unique',
  badgeColor: '#880088',
  badgeColorBlocked: '#888888',
  exportValues: true,
  exportNameTemplate: '[violentmonkey]_YYYY-MM-DD_HH.mm.ss',
  [EXPOSE]: { // use percent-encoding for '.'
    'greasyfork%2Eorg': true,
    'sleazyfork%2Eorg': false,
  },
  closeAfterInstall: false,
  editAfterInstall: false,
  helpForLocalFile: true,
  trackLocalFile: false,
  autoReload: false,
  features: null,
  syncScriptStatus: true,
  sync: null,
  customCSS: '',
  importScriptData: true,
  importSettings: true,
  notifyUpdates: false,
  notifyUpdatesGlobal: false, // `true` ignores script.config.notifyUpdates
  version: null,
  /** @type {VMScriptInjectInto} */
  defaultInjectInto: AUTO,
  ffInject: true,
  xhrInject: false,
  filters: {
    /** @type {'name' | 'code' | 'all'} */
    searchScope: 'name',
    /** @type {boolean} */
    showOrder: false,
    /** @type {'exec' | 'alpha' | 'update'} */
    sort: 'exec',
    /** @type {boolean} */
    viewSingleColumn: false,
    /** @type {boolean} */
    viewTable: false,
  },
  [kFiltersPopup]: {
    /** @type {'exec' | 'alpha'} */
    sort: 'exec',
    enabledFirst: false,
    groupRunAt: true,
    /** @type {'' | 'hide' | 'group'} where '' = show */
    hideDisabled: '',
  },
  editor: defaultsEditor,
  editorKeyMap: 'sublime',
  editorTheme: '',
  editorThemeName: null,
  editorWindow: false, // whether popup opens editor in a new window
  editorWindowPos: {}, // { left, top, width, height }
  editorWindowSimple: true, // whether to open a simplified popup or a normal browser window
  [kScriptTemplate]: `\
// ==UserScript==
// @name        New script {{name}}
// @namespace   ${VIOLENTMONKEY} Scripts
// @match       {{url}}
// @grant       none
// @version     1.0
// @author      -
// @description {{date}}
// ==/UserScript==
`,
  showAdvanced: true,
  valueEditor: defaultsValueEditor,
  /** @type {'' | 'dark' | 'light'} */
  uiTheme: '',
};
