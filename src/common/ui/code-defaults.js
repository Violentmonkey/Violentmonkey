export default {
  continueComments: true,
  styleActiveLine: true,
  foldGutter: true,
  gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
  theme: 'default',
  mode: 'javascript-mixed',
  lineNumbers: true,
  matchBrackets: true,
  autoCloseBrackets: true,
  highlightSelectionMatches: true,
  /* Limiting the max length to avoid delays while CodeMirror tries to make sense of a long line.
   * 100kB is fast enough for the main editor (moreover such long lines are rare in the main script),
   * and is big enough to include most of popular minified libraries for the `@resource/@require` viewer. */
  maxDisplayLength: 100_000,
};
