import findPoint from './find-point'

/**
 * setTextFromDomNode lets us take a domNode and reconcile the text in the
 * editor's Document such that it reflects the text in the DOM. This is the
 * opposite of what the Editor usually does which takes the Editor's Document
 * and React modifies the DOM to match. The purpose of this method is for
 * composition changes where we don't know what changes the user made by
 * looking at events. Instead we wait until the DOM is in a safe state, we
 * read from it, and update the Editor's Document.
 *
 * @param {Window} window
 * @param {Editor} editor
 * @param {Node} domNode
 */

export default function setTextFromDomNode(window, editor, domNode) {
  if (!window.document.body.contains(domNode)) {
    /**
     * All this code finds the missing node and then removes the inner text
     * from it. The painful part right now is that the text after the missing
     * node is somehow
     */
    console.log('domNode', domNode)
    console.log('parent', domNode.parentElement)
    console.log('grandparent', domNode.parentElement.parentElement)
    console.log(
      'grandgrandparent',
      domNode.parentElement.parentElement.parentElement
    )
    const { value } = editor
    const { document, selection } = value
    const { parentElement } = domNode
    const dataOffsetNode = parentElement.closest('[data-offset-key]')
    const dataOffsetKey = dataOffsetNode.getAttribute('data-offset-key')
    const [key, posAsString] = dataOffsetKey.split(':')
    const pos = parseInt(posAsString)
    const node = document.getDescendant(key)
    console.log('node', { node: node.toJSON() })
    const leaves = node.getLeaves()
    // const leaf = leaves.get(pos)
    let start = 0
    let end = 0
    let leaf
    // console.log({ leaf, leaves })
    for (let i = 0; i <= pos; i++) {
      leaf = leaves.get(i)
      start = end
      end += leaf.text.length
    }
    console.log({ leaf, key, start, end })
    let entire = selection.moveAnchorTo(key, start).moveFocusTo(key, end)
    // entire = document.resolveRange(entire)
    console.log(entire.toJSON(), entire)
    editor.deleteAtRange(entire)
    console.log(editor.value.document.text, editor.value.document.toJSON())
    console.log('after delete at range')
    if (pos > 0) {
      const beforeDataOffsetKey = `${key}:${pos - 1}`
      const selector = `[data-offset-key="${beforeDataOffsetKey}"]`
      // const beforeNode = window.document.body.closest(selector)
      const beforeNode = window.document.querySelector(selector)
      console.log({ beforeNode, beforeDataOffsetKey, selector })
      setTextFromDomNode(window, editor, beforeNode)
    }

    return
  }
  const point = findPoint(domNode, 0, editor)
  if (!point) return

  // Get the text node and leaf in question.
  const { value } = editor
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

  // Get the text information.
  const { text } = leaf
  let { textContent } = domNode
  const isLastText = node === lastText
  const isLastLeaf = leaf === lastLeaf
  const lastChar = textContent.charAt(textContent.length - 1)

  // COMPAT: If this is the last leaf, and the DOM text ends in a new line,
  // we will have added another new line in <Leaf>'s render method to account
  // for browsers collapsing a single trailing new lines, so remove it.
  if (isLastText && isLastLeaf && lastChar === '\n') {
    textContent = textContent.slice(0, -1)
  }

  // If the text is no different, abort.
  if (textContent === text) return

  // Determine what the selection should be after changing the text.
  // const delta = textContent.length - text.length
  // const corrected = selection.moveToEnd().moveForward(delta)
  let entire = selection
    .moveAnchorTo(point.key, start)
    .moveFocusTo(point.key, end)

  entire = document.resolveRange(entire)

  // Change the current value to have the leaf's text replaced.
  editor.insertTextAtRange(entire, textContent, leaf.marks)

  console.log('set-text-from-dom-node', editor.value.document.text)
}
