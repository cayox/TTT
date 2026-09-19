// Classic script loaded before the app bundle: if startup fails (even a module
// load error), show the message instead of an empty window.
;(function () {
  function show(msg) {
    var root = document.getElementById('root')
    if (!root || root.childElementCount) return
    var pre = document.createElement('pre')
    pre.style.cssText = 'margin:0;padding:72px 32px;white-space:pre-wrap;font:12px/1.5 ui-monospace,Menlo,monospace;color:#de8672;user-select:text'
    pre.textContent = 'TTT failed to start.\n\n' + msg
    root.appendChild(pre)
  }
  window.__tttShowError = show
  window.addEventListener('error', function (e) {
    show((e.error && e.error.stack) || e.message || 'Unknown error (' + (e.target && (e.target.src || e.target.href)) + ')')
  }, true)
  window.addEventListener('unhandledrejection', function (e) {
    show((e.reason && e.reason.stack) || String(e.reason))
  })
})()
