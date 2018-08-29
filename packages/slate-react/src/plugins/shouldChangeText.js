// Appears to work on Chrome
const desktop = {
  // should we resolve on this input
  onInput() {
    return true
  },
  // should we resolve before the onKeyDown event is handled?
  onKeyDown() {
    return false
  },
  // should we resolve on the compositionUpdate?
  onCompositionUpdate() {
    return false
  },
  // should we resolve on the compositionEnd?
  onCompositionEnd() {
    return false
  },
}

let changeAfterCompositionUpdate = false
let inputAfterCompositionEnd = false
const api28 = {
  onKeyDown(target, change, editor, onTextChange) {
    return !editor.isStrictComposing
  },
  onInput(target, change, editor) {
    inputAfterCompositionEnd = true
    return !editor.isStrictComposing
  },
  onCompositionUpdate(target, change, editor, onTextChange) {
    changeAfterCompositionUpdate = true
    return false
  },
  onCompositionEnd(target, change, editor, onTextChange) {
    inputAfterCompositionEnd = false
    setTimeout(() => {
      if (inputAfterCompositionEnd) return
      onTextChange(target, change, editor, 'setTimeout(onCompositionEnd)')
    }, 20)
    return false
  },
}

const api27 = {
  onInput(target, change, editor, onTextChange) {
    // return !editor.state.isStrictComposing
    return false
  },
  onCompositionUpdate(target, change, editor, onTextChange) {
    return true
  },
  onCompositionEnd(target, change, editor, onTextChange) {
    return true
  },
}

let should = desktop

console.warn('navigator.userAgent', navigator.userAgent)
const { userAgent } = navigator
if (/Android 9/.test(userAgent)) {
  console.warn(`returning should for API 28`)
  should = api28
} else if (/Android 8[.]1/.test(userAgent)) {
  console.warn(`returning should for API 27`)
  should = api27
}

function wrapEvents(events) {
  const nextEvents = {}
  for (const key of Object.keys(events)) {
    nextEvents[key] = function(...args) {
      const result = events[key](...args)
      console.log(key, result)
      return result
    }
  }
  return nextEvents
}

export default wrapEvents(should)
