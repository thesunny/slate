import { IS_ANDROID } from 'slate-dev-environment'
import AndroidPlugin from '../android'
import MutationPlugin from '../android/mutation'
import AfterPlugin from './after'
import BeforePlugin from './before'

/**
 * A plugin that adds the browser-specific logic to the editor.
 *
 * @param {Object} options
 * @return {Object}
 */

function DOMPlugin(options = {}) {
  const { plugins = [] } = options
  const beforePlugin = BeforePlugin()
  const afterPlugin = AfterPlugin()

  // COMPAT: Add Android specific handling separately before it gets to the
  // other plugins because it is specific (other browser don't need it) and
  // finicky (it has to come before other plugins to work).
  const beforeBeforePlugins = []
  beforeBeforePlugins.push(MutationPlugin(options))
  if (IS_ANDROID) {
    beforeBeforePlugins.push(AndroidPlugin())
  }

  return [...beforeBeforePlugins, beforePlugin, ...plugins, afterPlugin]
}

/**
 * Export.
 *
 * @type {Function}
 */

export default DOMPlugin
