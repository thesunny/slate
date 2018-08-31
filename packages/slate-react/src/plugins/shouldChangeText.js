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

// Scenarios to try
// 1. Update on every `input` that's not in a strictComposing.
//    Doesn't work because `onCompositionUpdate` does not fire an `onInput`
// 2. Update on ever `input` that's not strictComposing and
//    on every `onCompositionUpdate`.
//    Doesn't work because `onCompositionUpdate` is fired too early I think.
// 3. Update on `input` not strictComposing.
//    on every `onCompositionUpdate` with a `setTimeout`.
//    Doesn't work.
// 4. Update on `input` not strictComposing and also `input` immediately
//    after an `onCompositionUpdate`.
//    Fails. Fires too early.
// 5. Update on all `input`
//    Fails. Cursor moves to beginning of line.

// 6. Work on seeing if there are ways to render document without wrecking
//    the cursor position in the middle of a compositionUpdate
// 7. Update on every `input` that's not in a strictComposing.
//    Update on every `compositionUpdate` where the update happens in a
//    different node than the preceding `input`. The onTextChange needs to
//    happen at the location of the `input` and not the `compositionUpdate`.

let changeAfterCompositionUpdate = false
let inputAfterCompositionEnd = false
const api28 = {
  onKeyDown(window, change, editor, onTextChange) {
    // if (changeAfterCompositionUpdate) {
    //   changeAfterCompositionUpdate = false
    //   return true
    // }
    // return false
    return !editor.isStrictComposing
  },
  onInput(window, change, editor, onTextChange) {
    // inputAfterCompositionEnd = true
    return !editor.isStrictComposing
    // return true
  },
  onCompositionUpdate(window, change, editor, onTextChange) {
    changeAfterCompositionUpdate = true
    // setTimeout(() => {
      // editor.change(change =>
      //   onTextChange(target, change, editor, 'setTimeout(onInput)')
      // )
    // }, 20)
    return false
  },
  onCompositionEnd(window, change, editor, onTextChange) {
    // inputAfterCompositionEnd = false
    // setTimeout(() => {
    //   if (inputAfterCompositionEnd) return
    //   onTextChange(target, change, editor, 'setTimeout(onCompositionEnd)')
    // }, 20)
    return false
  },
}

const api27 = {
  onInput(window, change, editor, onTextChange) {
    // return !editor.state.isStrictComposing
    return false
  },
  onCompositionUpdate(window, change, editor, onTextChange) {
    return true
  },
  onCompositionEnd(window, change, editor, onTextChange) {
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
