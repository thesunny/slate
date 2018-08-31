import setTextFromDomNode from './set-text-from-dom-node'

export default function setTextFromDOMSelection(window, change, editor, src) {
  
  // const window = getWindow(target)
  const { value } = change

  // find the dom Node from the native selection
  const domSelection = window.getSelection()
  const { anchorNode } = domSelection
  return setTextFromDomNode(window, anchorNode, change, editor, { from: src })
}
