<template>
  <section ref="$el">
    <h3 v-text="i18n('labelEditor')"></h3>
    <div class="mb-1 mr-1c flex center-items">
      <span v-text="i18n('labelTheme')"/>
      <select v-model="theme" :disabled="busy" :title="themeCss">
        <option :value="DEFAULT" v-text="i18n('labelRunAtDefault')"/>
        <option value="" v-text="i18n('labelBadgeNone')"/>
        <option v-for="name in THEMES" :key="name" v-text="name"/>
      </select>
      <a :href="ghURL" target="_blank">&nearr;</a>
      <p v-text="error"/>
    </div>
    <div class="mb-1 mr-1c flex center-items">
      <span v-text="i18n('labelKeyMap')"/>
      <select v-model="keyMap" :disabled="busy" :title="keyMap">
        <option value="sublime" v-text="i18n('labelRunAtDefault')"/>
        <option value="vim" v-text="'vim'"/>
        <option value="emacs" v-text="'emacs'"/>
      </select>
    </div>
    <p class="my-1" v-html="i18n('descEditorOptions')"/>
    <setting-text name="editor" json has-reset @dblclick="toggleBoolean">
      <a class="ml-1" tabindex="0" @click="info = !info">
        <icon name="info"/>
      </a>
      <label class="btn-ghost" style="border:none">
        <input type="checkbox" v-model="hintShown">
        <span v-text="i18n('buttonShowEditorState')"/>
      </label>
    </setting-text>
    <template v-if="info">
      <p class="mt-1" v-html="i18n('descEditorOptionsGeneric')"/>
      <p class="mt-1" v-html="i18n('descEditorOptionsVM')"/>
    </template>
    <pre v-text="hint" class="monospace-font dim-hint" />
  </section>
</template>

<script>
const keyThemeCSS = 'editorTheme';
const keyThemeNAME = 'editorThemeName';
const keyEditorKeyMap = 'editorKeyMap';
const THEMES = process.env.CODEMIRROR_THEMES;
const gh = 'github.com';
const ghREPO = 'codemirror/CodeMirror';
const ghBRANCH = 'master';
const ghPATH = 'theme';
const ghURL = `https://${gh}/${ghREPO}/tree/${ghBRANCH}/${ghPATH}`;
const DEFAULT = 'default';
const previewLINES = 20;
const previewLENGTH = 100;
const makeTextPreview = css => (
  css
    ? css.split('\n', previewLINES + 1).map((s, i) => (
      i === previewLINES && (
        '...'
      ) || s.length > previewLENGTH && (
        `${s.slice(0, previewLENGTH)}...`
      ) || s
    )).join('\n')
    : null
);
</script>

<script setup>
import options from '@/common/options';
import hookSetting from '@/common/hook-setting';
import { getActiveElement } from '@/common/ui';
import SettingText from '@/common/ui/setting-text';
import { nextTick, onMounted, ref, watch } from 'vue';
import Icon from '@/common/ui/icon';
import { toggleBoolean } from "@/options/utils";
import cmDefaults from '@/common/ui/code-defaults';

const $el = ref();
const hint = ref();
const hintShown = ref(false);
const info = ref();
const busy = ref();
const error = ref();
const themeCss = ref();
const theme = ref();
const keyMap = ref();

onMounted(async () => {
  await options.ready; // Waiting for hookSetting to set the value before watching for changes
  let fromHook;
  watch(hintShown, toggleStateHint);
  watch(theme, async val => {
    if (fromHook) { // Do nothing if triggered by a duplicate Violentmonkey tab or sync
      fromHook = false;
      return;
    }
    const url = val && val !== DEFAULT
        && `https://raw.githubusercontent.com/${ghREPO}/${ghBRANCH}/${ghPATH}/${val}.css`;
    const css = url && await fetchUrl(url);
    options.set(keyThemeNAME, !url || css ? val : DEFAULT);
    options.set(keyThemeCSS, css || '');
  });
  hookSetting(keyThemeNAME, val => {
    if (theme.value != (val ??= DEFAULT)) {
      fromHook = true;
      theme.value = val;
    }
  });
  hookSetting(keyThemeCSS, val => {
    themeCss.value = makeTextPreview(val);
  });
  watch(keyMap, val => {
    options.set(keyEditorKeyMap, val);
  });
  hookSetting(keyEditorKeyMap, val => {
    keyMap.value = val;
  });
});

async function fetchUrl(url, method = 'text') {
  const el = getActiveElement();
  busy.value = true;
  try {
    const res = await (await fetch(url))[method]();
    error.value = null;
    return res;
  } catch (e) {
    error.value = e.message || e.code || `${e}`;
  } finally {
    busy.value = false;
    await nextTick();
    el?.focus();
  }
}
async function toggleStateHint(curValue) {
  let res;
  if (curValue) {
    const HIDE_OPTS = [
      // we activate only one mode: js
      'mode',
      // duh
      'value',
      // these accept only a function
      'configureMouse',
      'lineNumberFormatter',
      'specialCharPlaceholder',
    ];
    const opts = {};
    Object.entries({
      ...(await import('codemirror')).default.defaults,
      ...cmDefaults,
      ...options.get('editorKeyMap'),
      ...options.get('editor'),
    })
    // sort by keys alphabetically to make it more readable
    .sort(([a], [b]) => (a < b ? -1 : a > b))
    .filter(([key, val]) => !HIDE_OPTS.includes(key) && !isFunction(val))
    .forEach(([key, val]) => { opts[key] = val; });
    res = JSON.stringify(opts, null, '  ');
  }
  hint.value = res;
  if (res) {
    await nextTick();
    if ($el.value.getBoundingClientRect().bottom > innerHeight) {
      $el.value.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
</script>

<style>
  .dim-hint {
    font-size: .85rem;
    color: var(--fill-8);
  }
</style>
