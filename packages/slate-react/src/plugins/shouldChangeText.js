
// Appears to work on Chrome
const desktop = {
  onInput() {
    return true
  },
  onCompositionUpdate() {
    return false
  },
  onCompositionEnd() {
    return false
  },
}

let inputAfterCompositionEnd = false
const api28 = {
  onInput(event, change, editor) {
    inputAfterCompositionEnd = true
    return !editor.isStrictComposing
  },
  onCompositionUpdate() {
    return true
  },
  onCompositionEnd(target, change, editor, onTextChange) {
    inputAfterCompositionEnd = false
    setTimeout(() => {
      if (inputAfterCompositionEnd) return
      onTextChange(target, change, editor, 'setTimeout(onCompositionEnd)')
    }, 20)
    return false
  },
  onSelect() {
    return !editor.state.isComposing
  }
}

const api27 = {
  onInput(event, change, editor) {
    console.warn('input', 'isComposing', editor.state.isComposing)
    return !editor.state.isComposing
  },
  onCompositionUpdate() {
    console.warn('update')
    return false
  },
  onCompositionEnd() {
    console.warn('end')
    // there is always an input event after the onCompositionEnd
    return false
  },
  onSelect() {
    console.warn('select')
    return !editor.state.isComposing
  }
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
    nextEvents[key] = function (...args) {
      const result = events[key](...args)
      console.log(key, result)
      return result
    }
  }
  return nextEvents
}

export default wrapEvents(should)
