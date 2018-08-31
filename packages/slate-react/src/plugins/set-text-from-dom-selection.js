import Plain from 'slate-plain-serializer'
import getWindow from 'get-window'
import findPoint from '../utils/find-point'
import findDomPoint from '../utils/find-dom-point'
import findDomNode from '../utils/find-dom-node'
import findDomRange from '../utils/find-dom-range'
import setSelectionFromDOM from './set-selection-from-dom'

function setTextFromDomNode(window, domNode, change, editor, { from } = {}) {

  // find the text node and leaf in question.
  const { value } = change
  const point = findPoint(domNode, 0, value)

  //  if we can't find even the point, abort
  if (!point) return
  console.log('api:point!!!', point.toJS())

  // =========================

  
  // Get the text node and leaf in question.
  const { document, selection } = value
  const node = document.getDescendant(point.key)
  const block = document.getClosestBlock(node.key)
  const leaves = node.getLeaves()
  const lastText = block.getLastText()
  const lastLeaf = leaves.last()
  let start = 0
  let end = 0

  console.log(1)
  const leaf =
    leaves.find(r => {
      start = end
      end += r.text.length
      if (end > point.offset) return true
    }) || lastLeaf
  console.log(2)
  // console.log('key', point, node.key, leaf)

  // // /* NEW ZONE */
  // const slatePoint = findPoint(anchorNode, anchorOffset, value)
  // const slateDomPoint = findDomPoint(slatePoint, window)
  // const slateDomNode = slateDomPoint.node
  // setTextFromDomNode(window, slateDomNode, change, editor, { from: src })
  // console.log('api:dump', {
  //   slatePoint: slatePoint.toJS(),
  //   slateDomPoint,
  // })

  // // /* END NEW ZONE */

  // Get the text information.
  const { text: prevText } = leaf
  // console.log('anchorNode', anchorNode)
  let { textContent: nextText } = domNode
  console.log('api:text', { prevText, nextText })
  const isLastText = node == lastText
  const isLastLeaf = leaf == lastLeaf
  const lastChar = nextText.charAt(nextText.length - 1)

  // COMPAT: If this is the last leaf, and the DOM text ends in a new line,
  // we will have added another new line in <Leaf>'s render method to account
  // for browsers collapsing a single trailing new lines, so remove it.
  if (isLastText && isLastLeaf && lastChar == '\n') {
    nextText = nextText.slice(0, -1)
  }

  // debug('text', { textContent, text, isComposing: editor.state.isComposing })

  // If the text is no different, abort.
  if (nextText == prevText) {
    console.log('SAME TEXT')
    // return setSelectionFromDOM(target, change, editor)
    return
  }
  console.log('DIFFERENT TEXT... UPDATING STATE', prevText, nextText)
  let entire = selection
    .moveAnchorTo(point.key, start)
    .moveFocusTo(point.key, end)

  entire = document.resolveRange(entire)
  // console.log('change.insertTextAtRange', entire.toJSON(), nextText, leaf.marks)

  // Change the current value to have the leaf's text replaced.
  // editor.change(change => {
  console.log(
    'change.value.document before',
    Plain.serialize(change.value),
    change.value.selection.toJS(),
    change.value.document.toJS()
  )
  console.log('change.insertTextAtRange', entire.toJS(), nextText, leaf.marks)
  change.insertTextAtRange(entire, nextText, leaf.marks, {
    updateRangeStartAfterDelete: false,
  })
  // console.log('change.value.document after', Plain.serialize(change.value))
  setSelectionFromDOM(window, change, editor, { from: 'onTextChange' })
  console.log(
    'change.value.document after',
    Plain.serialize(change.value),
    change.value.selection.toJS(),
    change.value.document.toJS()
  )
  // .select(corrected)
  // })

  console.warn('/onTextChange')
  return true
}

export default function setTextFromDOMSelection(window, change, editor, src) {
  // debug('onTextChange', { event })
  console.warn('api:setTextFromDOMSelection', src)

  // const window = getWindow(target)
  const { value } = change

  // Get the selection point.
  const native = window.getSelection()
  const { anchorNode, anchorOffset } = native
  // NOTE: I added anchorOffset which used to be set at 0. Theoretically this
  // would have set the point to the beginning of the node that contained
  // the anchorNode. Instead the point should theoretically match up with the
  // current cursor position.
  const point = findPoint(anchorNode, 0, value)
  // const point = findPoint(anchorNode, anchorOffset, value)
  if (!point) return

  // Get the text node and leaf in question.
  const { document, selection } = value
  const node = document.getDescendant(point.key)
  const block = document.getClosestBlock(node.key)
  const leaves = node.getLeaves()
  const lastText = block.getLastText()
  const lastLeaf = leaves.last()
  let start = 0
  let end = 0

  const leaf =
    leaves.find(r => {
      start = end
      end += r.text.length
      if (end > point.offset) return true
    }) || lastLeaf
  // console.log('key', point, node.key, leaf)

  // /* NEW ZONE */
  const slatePoint = findPoint(anchorNode, anchorOffset, value)
  const slateDomPoint = findDomPoint(slatePoint, window)
  const slateDomNode = slateDomPoint.node
  setTextFromDomNode(window, slateDomNode, change, editor, { from: src })
  console.log('api:dump', {
    slatePoint: slatePoint.toJS(),
    slateDomPoint,
  })

  return true

  // ----------------------------------

  // Get the text information.
  const { text: prevText } = leaf
  // console.log('anchorNode', anchorNode)
  let { textContent: nextText } = slateDomPoint.node
  console.log('api:text', { prevText, nextText })
  const isLastText = node == lastText
  const isLastLeaf = leaf == lastLeaf
  const lastChar = nextText.charAt(nextText.length - 1)

  // COMPAT: If this is the last leaf, and the DOM text ends in a new line,
  // we will have added another new line in <Leaf>'s render method to account
  // for browsers collapsing a single trailing new lines, so remove it.
  if (isLastText && isLastLeaf && lastChar == '\n') {
    nextText = nextText.slice(0, -1)
  }

  // debug('text', { textContent, text, isComposing: editor.state.isComposing })

  // If the text is no different, abort.
  if (nextText == prevText) {
    console.log('SAME TEXT')
    // return setSelectionFromDOM(target, change, editor)
    return
  }
  console.log('DIFFERENT TEXT... UPDATING STATE', prevText, nextText)
  let entire = selection
    .moveAnchorTo(point.key, start)
    .moveFocusTo(point.key, end)

  entire = document.resolveRange(entire)
  // console.log('change.insertTextAtRange', entire.toJSON(), nextText, leaf.marks)

  // Change the current value to have the leaf's text replaced.
  // editor.change(change => {
  console.log(
    'change.value.document before',
    Plain.serialize(change.value),
    change.value.selection.toJS(),
    change.value.document.toJS()
  )
  console.log('change.insertTextAtRange', entire.toJS(), nextText, leaf.marks)
  change.insertTextAtRange(entire, nextText, leaf.marks, {
    updateRangeStartAfterDelete: false,
  })
  // console.log('change.value.document after', Plain.serialize(change.value))
  setSelectionFromDOM(window, change, editor, { from: 'onTextChange' })
  console.log(
    'change.value.document after',
    Plain.serialize(change.value),
    change.value.selection.toJS(),
    change.value.document.toJS()
  )
  // .select(corrected)
  // })

  console.warn('/onTextChange')
  return true
}
