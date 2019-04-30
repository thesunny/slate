import setSelectionFromDom from '../utils/set-selection-from-dom'
import setTextFromDomNode from '../utils/set-text-from-dom-node'

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

  function addNode(node) {
    nodes.add(node)
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

  function run(window, editor, selection = null) {
    if (selection == null) {
      const domSelection = window.getSelection()
    }

    // Reconcile each node
    nodes.forEach(node => setTextFromDomNode(window, editor, node))

    if (selection == null) {
      // Set Slate's selection to what was in the DOM
      setSelectionFromDom(window, editor, domSelection)
    } else {
      editor.select(selection)
    }

    // Reset the nodes Set
    clear()
  }

  return { clear, addNode, run }
}

export default Reconciler
