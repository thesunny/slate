// import setSelectionFromDom from '../utils/set-selection-from-dom'
// import setTextFromDomNode from '../utils/set-text-from-dom-node'

/**
 * Collects a Set of DOM Nodes to reconcile against the Slate Document then
 * executes the necessary commands on the Editor to have the Slate Document
 * be the same as the DOM.
 *
 * Primarily used for compositions which can happen over multiple DOM Nodes.
 */

function Reconciler() {
  /**
   * The set of nodes to reconcile against Slate's Document
   */

  const nodes = new window.Set()

  /**
   * Reset reconciler nodes
   */

  function clear() {
    nodes.clear()
  }

  /**
   * Add a DOM node to the reconciler
   *
   * @param {Node} node
   */

  function addNode() {
    const { anchorNode } = window.getSelection()
    nodes.add(anchorNode)
  }

  /**
   * Reconcile the changes made to the DOM against Slate's Document.
   *
   * Takes an optional Slate selection object.
   *
   * @param {Window} window
   * @param {Editor} editor
   * @param {Selection} selection?
   */

  function apply(window, editor, { from, selection } = {}) {
    console.log('Reconciler.apply', { from })

    // Set the domSelection if there isn't a Slate selection
    // const domSelection = selection ? null : window.getSelection()
    // const selection = editor.findSelection(domSelection)

    if (selection == null) {
      const domSelection = selection ? null : window.getSelection()
      selection = editor.findSelection(domSelection)
    }

    // Reconcile each node
    nodes.forEach(node => editor.reconcileDOMNode(node))

    editor.select(selection)

    // Reset the nodes Set
    clear()
  }

  return { clear, addNode, apply }
}

export default Reconciler
