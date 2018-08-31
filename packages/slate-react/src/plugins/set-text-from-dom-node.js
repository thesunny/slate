import Plain from 'slate-plain-serializer'
import getWindow from 'get-window'
import findPoint from '../utils/find-point'
import findDomPoint from '../utils/find-dom-point'
import findDomNode from '../utils/find-dom-node'
import findDomRange from '../utils/find-dom-range'
import setSelectionFromDOM from './set-selection-from-dom'

export default function setTextFromDomNode(window, domNode, change, editor, { from } = {}) {
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

  const leaf =
    leaves.find(r => {
      start = end
      end += r.text.length
      if (end > point.offset) return true
    }) || lastLeaf

  // Get the text information from the leaf.
  const { text: prevText } = leaf

  // Get the text information from the dom node
  let { textContent: nextText } = domNode

  // COMPAT: If this is the last leaf, and the DOM text ends in a new line,
  // we will have added another new line in <Leaf>'s render method to account
  // for browsers collapsing a single trailing new lines, so remove it.
  const isLastText = node == lastText
  const isLastLeaf = leaf == lastLeaf
  const lastChar = nextText.charAt(nextText.length - 1)
  if (isLastText && isLastLeaf && lastChar == '\n') {
    nextText = nextText.slice(0, -1)
  }

  // If the text is no different, abort.
  if (nextText == prevText) {
    return
  }

  // Create a Slate range representing the entire area we are looking at.
  let entire = selection
    .moveAnchorTo(point.key, start)
    .moveFocusTo(point.key, end)
  entire = document.resolveRange(entire)

  // Change the current value to have the leaf's text replaced.
  change.insertTextAtRange(entire, nextText, leaf.marks, {
    updateRangeStartAfterDelete: false,
  })

  // Set the selection from the DOM because we don't want the cursor to move
  // when the browser renders
  setSelectionFromDOM(window, change, editor, { from: 'onTextChange' })

  return true
}

