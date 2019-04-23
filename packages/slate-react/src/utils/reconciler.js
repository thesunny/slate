import setSelectionFromDom from '../utils/set-selection-from-dom'
import setTextFromDomNode from '../utils/set-text-from-dom-node'

/**
 * Collects a Set of DOM Nodes to reconcile against the Slate Document then
 * executes the necessary commands on the Editor to have the Slate Document
 * be the same as the DOM.
 *
 * Primarily used for compositions which can happen over multiple DOM Nodes.
 *
 * @param {Window} window
 * @param {Editor} editor
 */

function Reconciler(window, editor) {
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

  function add(node) {
    nodes.add(node)
  }

  /**
   * Reconcile the changes made to the DOM against Slate's Document.
   */

  function run() {
    const domSelection = window.getSelection()

    // Reconcile each node
    nodes.forEach(node => setTextFromDomNode(window, editor, node))

    // Set Slate's selection to what was in the DOM
    setSelectionFromDom(window, editor, domSelection)

    // Reset the nodes Set
    reset()
  }

  return { clear, add, run }
}

export default Reconciler
