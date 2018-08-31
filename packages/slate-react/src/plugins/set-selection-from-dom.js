import getWindow from 'get-window'
import findRange from '../utils/find-range'

// TODO:
// In Android API28, if in a composition, clicking to the end of the document
// results in the selection being placed in the position where the composition
// started.
export default function setSelectionFromDOM(
  window,
  change,
  editor,
  { from } = {}
) {
  console.warn('setSelectionFromDOM', from)
  // const window = getWindow(target)
  const { value } = change
  const { document } = value
  const native = window.getSelection()

  // If there are no ranges, the editor was blurred natively.
  if (!native.rangeCount) {
    change.blur()
    return
  }

  // Otherwise, determine the Slate selection from the native one.
  let range = findRange(native, value)
  if (!range) return

  const { anchor, focus } = range
  const anchorText = document.getNode(anchor.key)
  const focusText = document.getNode(focus.key)
  const anchorInline = document.getClosestInline(anchor.key)
  const focusInline = document.getClosestInline(focus.key)
  const focusBlock = document.getClosestBlock(focus.key)
  const anchorBlock = document.getClosestBlock(anchor.key)

  // COMPAT: If the anchor point is at the start of a non-void, and the
  // focus point is inside a void node with an offset that isn't `0`, set
  // the focus offset to `0`. This is due to void nodes <span>'s being
  // positioned off screen, resulting in the offset always being greater
  // than `0`. Since we can't know what it really should be, and since an
  // offset of `0` is less destructive because it creates a hanging
  // selection, go with `0`. (2017/09/07)
  if (
    anchorBlock &&
    !anchorBlock.isVoid &&
    anchor.offset == 0 &&
    focusBlock &&
    focusBlock.isVoid &&
    focus.offset != 0
  ) {
    range = range.setFocus(focus.setOffset(0))
  }

  // COMPAT: If the selection is at the end of a non-void inline node, and
  // there is a node after it, put it in the node after instead. This
  // standardizes the behavior, since it's indistinguishable to the user.
  if (
    anchorInline &&
    !anchorInline.isVoid &&
    anchor.offset == anchorText.text.length
  ) {
    const block = document.getClosestBlock(anchor.key)
    const next = block.getNextText(anchor.key)
    if (next) range = range.moveAnchorTo(next.key, 0)
  }

  if (
    focusInline &&
    !focusInline.isVoid &&
    focus.offset == focusText.text.length
  ) {
    const block = document.getClosestBlock(focus.key)
    const next = block.getNextText(focus.key)
    if (next) range = range.moveFocusTo(next.key, 0)
  }

  range = document.resolveRange(range)
  change.select(range)
}
