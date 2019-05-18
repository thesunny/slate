import ElementSnapshot from './element-snapshot'
import SELECTORS from '../../constants/selectors'
import invariant from 'tiny-invariant'

/**
 * Returns the closest element that matches the selector.
 * Unlike the native `Element.closest` method, this doesn't require the
 * starting node to be an Element.
 *
 * @param  {Node} node to start at
 * @param  {String} css selector to match
 * @return {Element} the closest matching element
 */

function closest(node, selector, win = window) {
  if (node.nodeType === win.Node.TEXT_NODE) {
    node = node.parentNode
  }
  return node.closest(selector)
}

/**
 * A DomSnapshot remembers the state of elements at a given point in time
 * and also remembers the state of the Editor at that time as well.
 * The state can be applied to the DOM at a time in the future.
 */

export default class DomSnapshot {
  /**
   * Constructor.
   *
   * @param {Window} window
   * @param {Editor} editor
   * @param {Boolean} options.before - should we remember the element before the one passed in
   */

  constructor(window, editor, { before = false } = {}) {
    const domSelection = window.getSelection()
    const { anchorNode } = domSelection
    const subrootEl = closest(anchorNode, `${SELECTORS.EDITOR} > *`)
    const elements = [subrootEl]

    // The before option is for when we need to take a snapshot of the current
    // subroot and the element before when the user hits the backspace key.
    if (before) {
      const { previousElementSibling } = subrootEl

      if (previousElementSibling) {
        elements.unshift(previousElementSibling)
      }
    }

    this.snapshot = new ElementSnapshot(elements)
    // this.selection = getSelectionFromDom(window, editor, domSelection)
    this.selection = editor.findSelection(domSelection)
  }

  /**
   * Apply the snapshot to the DOM and set the selection in the Editor.
   *
   * @param {Editor} editor
   */

  applyAll(editor) {
    const { snapshot, selection } = this
    this.applySelectionToDOM()
    this.applySelectionToEditor(editor)
    // snapshot.apply()
    // editor.select(selection)
    // editor.moveTo(selection.anchor.path, selection.anchor.offset)
  }

  applyContentToDOM() {
    this.snapshot.apply()
  }

  applySelectionToDom() {
    const { domRange } = this
    const domSelection = window.getSelection()
    domSelection.removeAllRanges()
    if (domRange) {
      domSelection.addRange(domRange)
    }
  }

  applySelectionToEditor(editor) {
    invariant(editor != null)
    editor.select(this.selection)
  }
}

// import getSelectionFromDom from './get-selection-from-dom'
// import ElementSnapshot from './element-snapshot'

// /**
//  * Returns the closest element that matches the selector.
//  * Unlike the native `Element.closest` method, this doesn't require the
//  * starting node to be an Element.
//  *
//  * @param  {Node} node to start at
//  * @param  {String} css selector to match
//  * @return {Element} the closest matching element
//  */

// function closest(node, selector, win = window) {
//   if (node.nodeType === win.Node.TEXT_NODE) {
//     node = node.parentNode
//   }
//   return node.closest(selector)
// }

// /**
//  * A DomSnapshot remembers the state of elements at a given point in time
//  * and also remembers the state of the Editor at that time as well.
//  * The state can be applied to the DOM at a time in the future.
//  */

// export default class DomSnapshot {
//   /**
//    * Constructor.
//    *
//    * @param {Window} window
//    * @param {Editor} editor
//    * @param {Boolean} options.before - should we remember the element before the one passed in
//    */

//   constructor(window, editor, { before = false } = {}) {
//     const domSelection = window.getSelection()
//     const { anchorNode } = domSelection
//     const subrootEl = closest(anchorNode, '[data-slate-editor] > *')
//     const rootEl = closest(anchorNode, '[data-slate-editor]')

//     console.log({ subrootEl, rootEl })
//     const elements = Array.from(rootEl.childNodes)
//     console.log(elements.length)
//     // const elements = [subrootEl]

//     // // The before option is for when we need to take a snapshot of the current
//     // // subroot and the element before when the user hits the backspace key.
//     // if (before) {
//     //   const { previousElementSibling } = subrootEl

//     //   if (previousElementSibling) {
//     //     elements.unshift(previousElementSibling)
//     //   }
//     // }

//     this.domSelection = domSelection
//     this.anchorNode = anchorNode
//     this.snapshot = new ElementSnapshot(elements)
//     this.domRange = domSelection ? domSelection.getRangeAt(0) : null
//     this.selection = getSelectionFromDom(window, editor, domSelection)
//   }

//   /**
//    * Apply the snapshot to the DOM and set the selection in the Editor.
//    *
//    * @param {Editor} editor
//    */

//   apply(editor) {
//     const { snapshot, selection, domRange } = this
//     snapshot.apply()
//     if (domRange) {
//       console.log('restore dom range')
//       const domSelection = window.getSelection()
//       domSelection.removeAllRanges()
//       domSelection.addRange(domRange)
//     }
//     editor.select(selection)
//     // editor.moveTo(selection.anchor.key, selection.anchor.offset)
//     return selection
//   }

//   applyDOM() {
//     this.snapshot.apply()
//   }

//   applySelection() {
//     const { domRange } = this
//     const domSelection = window.getSelection()
//     domSelection.removeAllRanges()
//     if (domRange) {
//       domSelection.addRange(domRange)
//     }
//   }

//   applySelectionToEditor(editor) {
//     editor.select(this.selection)
//   }
// }
