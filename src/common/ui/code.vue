<template>
  <div class="flex flex-col" @focus="cm?.focus()">
    <div class="editor-code flex-auto" ref="$cmWrapper"/>
    <div class="frame-block editor-search flex" v-show="search.show"
         @keydown.esc.exact.stop="clearSearch">
      <form @submit.prevent="goToLine()">
        <span v-text="i18n('labelLineNumber')"></span>
        <input type="text" class="w-1" v-model="jumpPos">
      </form>
      <form class="flex-1" @submit.prevent="findNext()">
        <span v-text="i18n('labelSearch')"></span>
        <tooltip :content="tooltips.find" class="flex-1">
          <!-- id is required for the built-in autocomplete using entered values -->
          <input
            :class="{ 'is-error': !search.hasResult }"
            :title="search.error"
            type="search"
            id="editor-search"
            ref="$search"
            v-model="search.query"
          />
        </tooltip>
        <tooltip :content="tooltips.findPrev" align="end">
          <button type="button" @click="findNext(1)">&lt;</button>
        </tooltip>
        <tooltip :content="tooltips.findNext" align="end">
          <button type="submit">&gt;</button>
        </tooltip>
      </form>
      <form class="flex-1" @submit.prevent="replace()" v-if="!readOnly">
        <span v-text="i18n('labelReplace')"></span>
        <!-- id is required for the built-in autocomplete using entered values -->
        <input class="flex-1" type="search" id="editor-replace" v-model="search.replace">
        <tooltip :content="tooltips.replace" align="end">
          <button type="submit" v-text="i18n('buttonReplace')"></button>
        </tooltip>
        <tooltip :content="tooltips.replaceAll" align="end">
          <button type="button" v-text="i18n('buttonReplaceAll')" @click="replace(1)"></button>
        </tooltip>
      </form>
      <div>
        <tooltip :content="i18n('searchUseRegex')" align="end">
          <toggle-button v-model="search.options.useRegex">.*</toggle-button>
        </tooltip>
        <tooltip :content="i18n('searchCaseSensitive')" align="end">
          <toggle-button v-model="search.options.caseSensitive">Aa</toggle-button>
        </tooltip>
      </div>
      <tooltip content="Esc" align="end">
        <button @click="clearSearch">&times;</button>
      </tooltip>
    </div>
  </div>
</template>

<script>
import 'codemirror/lib/codemirror.css';
import 'codemirror/addon/comment/continuecomment';
import 'codemirror/addon/comment/comment';
import 'codemirror/addon/edit/matchbrackets';
import 'codemirror/addon/edit/closebrackets';
import 'codemirror/addon/fold/foldcode';
import 'codemirror/addon/fold/foldgutter';
import 'codemirror/addon/fold/foldgutter.css';
import 'codemirror/addon/fold/brace-fold';
import 'codemirror/addon/fold/comment-fold';
import 'codemirror/addon/search/match-highlighter';
import 'codemirror/addon/search/searchcursor';
import 'codemirror/addon/selection/active-line';
import 'codemirror/keymap/sublime';
import 'codemirror/addon/hint/show-hint.css';
import 'codemirror/addon/hint/show-hint';
import 'codemirror/addon/hint/javascript-hint';
import 'codemirror/addon/hint/anyword-hint';
import CodeMirror from 'codemirror';
import { debounce, getUniqId, i18n, sendCmdDirectly } from '@/common';
import { deepEqual, forEachEntry, objectPick } from '@/common/object';
import hookSetting from '@/common/hook-setting';
import options from '@/common/options';
import './code-autocomplete';
import cmDefaults from './code-defaults';
import './code-js-mixed-mode';
import { killTrailingSpaces } from './code-trailing-spaces';

// Make sure this is still the longest line in the doc
const CTRL_OPEN = getUniqId('\x02'.repeat(256));
const CTRL_CLOSE = '\x03'.repeat(256);
const CTRL_RE = new RegExp(`${CTRL_OPEN}(\\d+)${CTRL_CLOSE}`, 'g');
const PLACEHOLDER_CLS = 'too-long-placeholder';
// To identify our CodeMirror markers we're using a Symbol since it's always unique
const PLACEHOLDER_SYM = Symbol(PLACEHOLDER_CLS);
const cmCommands = CodeMirror.commands;
const cmOrigCommands = Object.assign({}, cmCommands);
const { insertTab, insertSoftTab } = cmCommands;
/** Using space prefix to show the command at the top of Help list */
const Esc = ' back / cancel / close / singleSelection';

Object.assign(CodeMirror.keyMap.sublime, {
  'Shift-Ctrl-/': 'commentSelection',
});
CodeMirror.registerHelper('hint', 'autoHintWithFallback', (cm, ...args) => {
  const result = cm.getHelper(cm.getCursor(), 'hint')?.(cm, ...args);
  // fallback to anyword if default returns nothing (or no default)
  return result?.list.length ? result : CodeMirror.hint.anyword(cm, ...args);
});
</script>

<script setup>
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch, watchEffect } from 'vue';
import Tooltip from 'vueleton/lib/tooltip';
import ToggleButton from '@/common/ui/toggle-button';

let cm;
let maxDisplayLength;
let placeholders = new Map();
let placeholderId = 0;

const props = defineProps({
  active: Boolean,
  readOnly: {
    type: Boolean,
    default: false,
  },
  value: {
    type: String,
    default: '',
  },
  mode: [String, Object],
  commands: {
    type: Object,
    default: null,
  },
  cmOptions: Object,
});
const emit = defineEmits(['code-dirty', 'ready']);

const $cmWrapper = ref();
const $search = ref();
const jumpPos = ref('');
const search = reactive({
  show: false,
  query: '',
  replace: '',
  hasResult: false,
  options: {
    useRegex: false,
    caseSensitive: false,
  },
});
const tooltips = reactive({
  find: '',
  findPrev: '',
  findNext: '',
  replace: '',
  replaceAll: '',
});
const customCommands = Object.assign({
  // call own methods explicitly to strip `cm` parameter passed by CodeMirror
  find: () => find(),
  findNext: () => findNext(),
  findPrev: () => findNext(1),
  replace: () => replace(),
  replaceAll: () => replace(1),
  autocomplete() {
    cm.showHint({ hint: CodeMirror.hint.autoHintWithFallback });
  },
  [Esc]: () => {
    if (search.show) {
      clearSearch();
    } else {
      cm.execCommand(cm.listSelections()[1] ? 'singleSelection' : 'close');
    }
  },
  commentSelection() {
    cm.blockComment(cm.getCursor('from'), cm.getCursor('to'), { fullLines: false });
  },
  insertTab() {
    // pressing Tab key inside a line with no selection will reuse indent type (tabs/spaces)
    (cm.options.indentWithTabs ? insertTab : insertSoftTab)(cm);
  },
}, props.commands);
const reroutedKeys = {};

defineExpose({
  get cm() {
    return cm;
  },
  getRealContent,
  expandKeyMap,
});

function updateValue(val = props.value) {
  cm?.operation(() => {
    cm.setValue(val);
    cm.clearHistory();
    cm.markClean();
  });
}
function onBeforeChange(cm, change) {
  if (createPlaceholders(change)) {
    cm.on('change', onChange); // triggered before DOM is updated
    change.update?.(null, null, change.text);
  }
  // TODO: remove placeholders that belong to a change beyond `undoDepth`
}
function onChange(cm) {
  cm.off('change', onChange);
  renderPlaceholders();
}
function onChanges(cm, [{ origin }]) {
  // No need to report if changed externally via props.value
  if (origin !== 'setValue') {
    emit('code-dirty', !cm.isClean());
  }
}
function createPlaceholders(change) {
  const { line, ch } = change.from;
  let res = false;
  let len;
  let prefix;
  change.text.forEach((textLine, i) => {
    if (textLine.includes(CTRL_OPEN)) {
      textLine = getRealContent(textLine);
    }
    len = textLine.length - maxDisplayLength;
    prefix = len > 0 ? textLine.match(/^\s*/)[0] : '';
    len -= prefix.length;
    if (len > 0 && len - textLine.match(/\s*$/)[0].length > 0) {
      res = true;
      placeholderId += 1;
      const id = placeholderId;
      const body = textLine.slice(prefix.length);
      const replaced = `${CTRL_OPEN}${id}${CTRL_CLOSE}`;
      placeholders.set(id, {
        body,
        el: null,
        line: line + i,
        ch: ch + prefix.length,
        length: replaced.length,
      });
      change.text[i] = `${prefix}${replaced}`;
    }
  });
  return res;
}
function renderPlaceholders() {
  placeholders.forEach(p => {
    if (!p.el) {
      const { line, ch, body, length } = p;
      const el = document.createElement('span');
      const marker = cm.markText({ line, ch }, { line, ch: ch + length }, { replacedWith: el });
      marker[PLACEHOLDER_SYM] = true;
      el.className = PLACEHOLDER_CLS;
      el.title = i18n('editLongLineTooltip');
      el.textContent = `${body.slice(0, maxDisplayLength)}...[${i18n('editLongLine')}]`;
      el.onclick = () => {
        if (!`${window.getSelection()}`) {
          cm.setCursor(marker.find().from);
          cm.focus();
        }
      };
      p.el = el;
    }
  });
}
function initialize() {
  maxDisplayLength = cm.options.maxDisplayLength;
  watchEffect(() => cm.setOption('readOnly', props.readOnly));
  // these are active in all nav tabs
  cm.setOption('extraKeys', {
    Esc,
    F1: 'showHelp',
    'Ctrl-Space': 'autocomplete',
  });
  cm.on('keyHandled', (_cm, _name, e) => {
    e.stopPropagation();
  });
  cm.on('changes', onChanges);
  cm.on('beforeChange', onBeforeChange);
  if (props.value) updateValue();
  emit('ready', cm);
}
function onActive(state) {
  const onOff = state ? 'on' : 'off';
  cm[onOff]('blur', onKeyDownToggler);
  cm[onOff]('focus', onKeyDownToggler);
  if (state) {
    Object.assign(cmCommands, customCommands);
  } else {
    for (const id in customCommands) {
      // DANGER! Checking first as another code component may have activated already
      if (cmCommands[id] === customCommands[id]) {
        cmCommands[id] = cmOrigCommands[id];
      }
    }
  }
  onKeyDownToggler(cm, { type: state ? 'blur' : '' });
}
/* reroute hotkeys back to CM when it isn't focused,
   but ignore `window` blur (`evt` param is absent) */
function onKeyDownToggler(cm, evt) {
  if (evt) {
    /* DANGER! Using body to precede KeyboardService's target in the bubbling phase.
     * Mainly to prioritize our custom Esc handler. */
    document.body::(evt.type === 'blur' ? addEventListener : removeEventListener)(
      'keydown', onKeyDown);
  }
}
function onKeyDown(e) {
  const cmd = reroutedKeys[CodeMirror.keyName(e)];
  if (cmd && cmCommands[cmd]) {
    e.preventDefault();
    e.stopPropagation();
    cm.execCommand(cmd);
  }
}
function findFillQuery(force) {
  if (!search.query || force) {
    const sel = cm.listSelections();
    // use the currently selected text if it's within one line
    if (sel?.length === 1 && sel[0].anchor.line === sel[0].head.line && !sel[0].empty()) {
      const query = cm.getSelection();
      search.queryFilled = !!query;
      search.query = query;
    }
    search.show = true;
  }
}
/** @param {VMSearchOptions} opts */
function doSearch(opts) {
  search.hasResult = !search.query || !!doSearchInternal({ ...opts, wrapAround: true });
}
/**
 * @param {VMSearchOptions} opts
 * @returns {?true}
 */
function doSearchInternal({ reversed, wrapAround, pos, reuseCursor } = {}) {
  const { caseSensitive, useRegex } = search.options;
  let retry = wrapAround ? 2 : 1;
  if (!pos || typeof pos === 'string') {
    pos = cm.getCursor(pos || (reversed ? 'from' : 'to'));
  }
  do {
    let cur;
    if (reuseCursor) {
      cur = search.cursor;
    } else {
      let { query } = search;
      if (useRegex) {
        try {
          query = new RegExp(query, caseSensitive ? '' : 'gi');
          search.error = null;
        } catch (err) {
          search.error = err;
          return;
        }
      }
      cur = cm.getSearchCursor(query, pos, { caseFold: !caseSensitive });
      search.cursor = cur;
    }
    while (cur.find(reversed)) {
      const from = cur.from();
      const to = cur.to();
      if (!cm.findMarks(from, to, m => m[PLACEHOLDER_SYM]).length) {
        reveal(from, to);
        cm.setSelection(from, to, { scroll: false });
        return true;
      }
    }
    retry -= 1;
    if (retry) {
      pos = {
        line: reversed ? cm.doc.size : 0,
        ch: 0,
      };
    }
  } while (retry);
}
async function find() {
  findFillQuery(true);
  doSearch({ pos: 'from' });
  await nextTick();
  const el = $search.value;
  el.select();
  el.focus();
}
function findNext(reversed) {
  const refocus = !search.query || !cm.hasFocus();
  findFillQuery();
  doSearch({ reversed });
  if (refocus) nextTick(() => $search.value.focus());
}
function clearSearch() {
  search.show = false;
  cm.focus();
}
function replace(all) {
  if (props.readOnly) return; // in case this was invoked via hotkey
  const { replace, query } = search;
  if (!query || !search.show) {
    search.show = true;
    find();
    return;
  }
  if (all) {
    cm.operation(() => {
      let opts = { pos: { line: 0, ch: 0 } };
      while (doSearchInternal(opts)) {
        search.cursor.replace(replace);
        opts = { reuseCursor: true };
      }
    });
  } else {
    const { sel } = cm.doc;
    doSearch({ pos: 'from' });
    if (sel.somethingSelected() && sel.equals(cm.doc.sel)) {
      cm.replaceSelection(replace);
      doSearch();
    }
  }
}
/** Centers the selection if it's outside of viewport so the surrounding context is visible */
function reveal(from, to) {
  const vpm = cm.options.viewportMargin;
  const { viewFrom, viewTo } = cm.display;
  const inView = from.line >= viewFrom + vpm
    && (to.line < viewTo - Math.min(cm.doc.size - viewTo, vpm));
  cm.scrollIntoView({ from, to },
    inView ? cm.defaultTextHeight() * 2 : cm.display.wrapper.clientHeight / 2);
}
function goToLine() {
  let [line, ch] = jumpPos.value.split(':').map(Number) || [];
  if (line) {
    line -= 1;
    ch = ch ? ch - 1 : 0;
    cm.operation(() => {
      reveal({ line, ch }, { line, ch });
      cm.setCursor(line, ch, { scroll: false });
    });
    search.show = false;
    cm.focus();
  }
}
function onCopy(e) {
  // CM already prepared the correct text in DOM selection, which is particularly
  // important when using its lineWiseCopyCut option (on by default)
  const sel = `${getSelection()}` || cm?.getSelection();
  if (!sel) return;
  const text = getRealContent(sel);
  e.clipboardData.setData('text', text);
  e.preventDefault();
  e.stopImmediatePropagation();
}
function getRealContent(text) {
  if (text == null) {
    text = killTrailingSpaces(cm, placeholders);
  }
  if (placeholders.size) {
    text = text.replace(CTRL_RE, (_, id) => placeholders.get(+id)?.body || '');
  }
  return text;
}
function expandKeyMap(res, ...maps) {
  if (!res) {
    const { keyMap, extraKeys } = cm.options;
    maps = [extraKeys, keyMap];
    res = {};
  }
  maps.forEach((map) => {
    if (typeof map === 'string') map = CodeMirror.keyMap[map];
    map::forEachEntry(([key, value]) => {
      if (!res[key] && CodeMirror.commands[value]) {
        res[key] = value;
      }
    });
    if (map.fallthrough) expandKeyMap(res, map.fallthrough);
  });
  delete res.fallthrough;
  return res;
}

watch(() => props.active, onActive);
watch(() => props.mode, value => {
  cm.setOption('mode', value || cmDefaults.mode);
});
watch(() => props.value, updateValue);

onMounted(() => {
  let userOpts = options.get('editor');
  const theme = options.get('editorThemeName');
  const internalOpts = props.cmOptions || {};
  const opts = {
    ...cmDefaults,
    mode: props.mode || cmDefaults.mode,
    ...userOpts,
    ...theme && { theme },
    ...internalOpts, // internal options passed via `props` have the highest priority
  };
  const cmWrapper = $cmWrapper.value;
  cm = CodeMirror(cmWrapper, opts);
  initialize();
  onActive(true); // DANGER! Must precede expandKeyMap.
  expandKeyMap()::forEachEntry(([key, cmd]) => {
    if (cmd in tooltips) {
      tooltips[cmd] += `${tooltips[cmd] ? ', ' : ''}${key}`;
      reroutedKeys[key] = cmd;
    }
  });
  // pressing Tab key inside a line with no selection will reuse indent size
  if (!opts.tabSize) cm.options.tabSize = cm.options.indentUnit;
  cmWrapper::addEventListener('copy', onCopy);
  hookSetting('editor', (newUserOpts) => {
    // Use defaults for keys that were present in the old userOpts but got deleted in newUserOpts
    ({ ...cmDefaults, ...newUserOpts })::forEachEntry(([key, val]) => {
      if ((key in newUserOpts || key in userOpts)
      && !(key in internalOpts)
      && !deepEqual(cm.getOption(key), val)) {
        cm.setOption(key, val);
      }
    });
    userOpts = newUserOpts;
  });
  sendCmdDirectly('Storage', ['base', 'getOne', 'editorSearch']).then(prev => {
    const saveSearchLater = debounce(() => {
      sendCmdDirectly('Storage', ['base', 'setOne', 'editorSearch',
        objectPick(search, ['query', 'replace', 'options'])]);
    }, 500);
    const searchAgain = () => {
      saveSearchLater();
      doSearch({ pos: 'from' });
    };
    if (prev) Object.assign(search, prev);
    watch(() => search.query, () => {
      if (!search.queryFilled) searchAgain();
      else search.queryFilled = null;
    });
    watch(() => search.options, searchAgain, { deep: true });
    watch(() => search.replace, saveSearchLater);
  });
  hookSetting('editorThemeName', val => {
    if (val != null && val !== cm.options.theme) {
      cm.setOption('theme', val);
    }
  });
  updateValue();
});

onBeforeUnmount(() => {
  onActive(false);
});
</script>

<style>
$selectionBg: #d7d4f0; /* copied from codemirror.css */
$selectionDarkBg: rgba(80, 75, 65, .99);

/* compatible with old browsers, e.g. Maxthon 4.4, Chrome 50- */
.editor-code.flex-auto {
  position: relative;
  > div {
    position: absolute;
    width: 100%;
  }
}

.editor-search {
  white-space: pre;
  flex-wrap: wrap; // wrap fields in a narrow window
  > form,
  > div {
    display: flex;
    align-items: center;
    margin-right: .5rem;
  }
  @supports (field-sizing: content) {
    input {
      field-sizing: content;
      min-width: 3ch;
      width: auto;
    }
  }
  span > input { // a tooltip'ed input
    width: 100%;
  }
  .is-error, .is-error:focus {
    border-color: #e85600;
    background: #e8560010;
  }
}

.too-long-placeholder {
  font-style: italic;
}

/* CodeMirror show-hints fix to work here */
.CodeMirror-hints {
  z-index: 9999;
}

/* fix contenteditable selection color bug */
.CodeMirror .CodeMirror-line {
  ::selection {
    background: $selectionBg;
  }
  /* must be used separately otherwise the entire rule is ignored in Chrome */
  ::-moz-selection {
    background: $selectionBg;
  }
}

.cm-matchhighlight {
  background-color: hsla(168, 100%, 50%, 0.15);
}
.cm-trailingspace {
  background: radial-gradient(cornflowerblue, transparent 1px) 0 50% / 1ch 1ch repeat-x;
}
div.CodeMirror span.CodeMirror-matchingbracket { /* the same selector used in codemirror.css */
  color: unset;
  background-color: hsla(102, 80%, 50%, 0.3);
}
.cm-s-default {
  .cm-comment {
    color: #918982;
  }
  .cm-string-2 { // template literal: `example`
    color: #870;
  }
  .cm-string-2.cm-regexp {
    color: #d60;
  }
}

@media (prefers-color-scheme: dark) {
  .cm-matchhighlight {
    background-color: hsla(40, 100%, 50%, 0.1);
    border-bottom-color: hsla(40, 100%, 50%, 0.25);
  }
  .CodeMirror-hints {
    background: var(--bg);
  }
  .CodeMirror-hint {
    color: var(--fg);
  }
  li.CodeMirror-hint-active {
    background: var(--fg);
    color: var(--bg);
  }
  .CodeMirror {
    color: var(--fg);
    background: var(--bg);
    & &-scrollbar-filler,
    & &-gutter-filler {
      background: none;
    }
    & &-gutters {
      border-color: var(--fill-2);
      background-color: var(--fill-0-5);
    }
    & &-selected {
      background: $selectionDarkBg;
    }
    & &-line {
      ::selection {
        background: $selectionDarkBg;
      }
      /* must be used separately otherwise the entire rule is ignored in Chrome */
      ::-moz-selection {
        background: $selectionDarkBg;
      }
    }
    & &-guttermarker {
      color: white;
      &-subtle {
        color: #d0d0d0;
      }
    }
    & &-linenumber {
      color: #666;
    }
    & &-cursor {
      border-color: #f8f8f0;
    }
    & &-activeline-background {
      background: #1a1a1a;
    }
    & &-matchingbracket {
      outline: none;
      background: #444;
      color: yellow !important;
    }
  }
  .cm-s-default {
    // mostly copied from Monokai theme
    .cm-comment {
      color: #75715e;
    }
    .cm-atom {
      color: #ae81ff;
    }
    .cm-number {
      color: #ae81ff;
    }
    .cm-comment.cm-attribute {
      color: #97b757;
    }
    .cm-comment.cm-def {
      color: #bc9262;
    }
    .cm-comment.cm-tag {
      color: #bc6283;
    }
    .cm-comment.cm-type {
      color: #5998a6;
    }
    .cm-property,
    .cm-attribute {
      color: #a6e22e;
    }
    .cm-keyword {
      color: #f92672;
    }
    .cm-builtin {
      color: #66d9ef;
    }
    .cm-string {
      color: #e6db74;
    }
    .cm-string-2 {
      color: #bcb149;
    }
    .cm-string-2.cm-regexp {
      color: #ff00f7;
    }
    .cm-variable {
      color: #f8f8f2;
    }
    .cm-variable-2 {
      color: #9effff;
    }
    .cm-variable-3,
    .cm-type {
      color: #66d9ef;
    }
    .cm-def {
      color: #fd971f;
    }
    .cm-bracket {
      color: #f8f8f2;
    }
    .cm-tag {
      color: #f92672;
    }
    .cm-header {
      color: #ae81ff;
    }
    .cm-link {
      color: #ae81ff;
    }
    .cm-error {
      color: #f8f8f0;
      background: #f92672;
    }
    .cm-operator {
      color: #999
    }
  }
}
</style>
