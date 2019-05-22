import Debug from 'debug'

const debug = Debug('slate:mutations')

/**
 * Options for MutationObserver
 *
 * @type {Object}
 */

const observerOptions = {
  childList: true,
  characterData: true,
  attributes: true,
  subtree: true,
  characterDataOldValue: true,
}

/**
 * Properties on a MutationRecord
 *
 * @type {Object}
 */

const keys = [
  'type',
  'oldValue',
  'target',
  'addedNodes',
  'removedNodes',
  'attributeName',
  'attributeNamespace',
  'nextSibling',
  'previousSibling',
]

/**
 * Takes a mutation record and turns it into an Object that is easy to log to
 * the console. Notably, it removes `null` and `undefined` values as well as
 * values that are a `NodeList` that has no entries.
 *
 * @param {MutationRecord} mutationRecord
 */

function normalize(mutationRecord) {
  const object = {}

  keys.forEach(key => {
    const value = mutationRecord[key]
    if (value == null) return
    if (value instanceof window.NodeList && value.length === 0) return
    object[key] = value
  })
  return object
}

/**
 * A plugin that sends short easy to digest debug info about each dom mutation
 * to browser.
 *
 * More information about mutations here:
 *
 * <https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver>
 * <https://developer.mozilla.org/en-US/docs/Web/API/MutationRecord>
 *
 * @param {Object} options
 */

function DebugMutationsPlugin({ __editor__ }) {
  const observer = new window.MutationObserver(flush)

  function flush(mutations) {
    const array = Array.from(mutations).map(normalize)
    // Used `console` because `debug` was not easy to view succinctly
    debug(...array)
  }

  // `findDOMNode` does not exist until later so we use `setTimeout`
  setTimeout(() => {
    const rootEl = __editor__.findDOMNode([])
    observer.observe(rootEl, observerOptions)
  })
}

export default DebugMutationsPlugin
