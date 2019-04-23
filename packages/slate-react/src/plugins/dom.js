import { IS_ANDROID, ANDROID_API_VERSION } from 'slate-dev-environment'
import AndroidPlugin from './android'
import Android9Plugin from './android-9'
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
  // Add Android specific handling separately before it gets to the other
  // plugins because it is specific (other browser don't need it) and finicky
  // (it has to come before other plugins to work).
  const beforeBeforePlugins = IS_ANDROID
    ? ANDROID_API_VERSION === 28 ? [Android9Plugin()] : [AndroidPlugin()]
    : []
  const beforePlugin = BeforePlugin()
  const afterPlugin = AfterPlugin()
  return [...beforeBeforePlugins, beforePlugin, ...plugins, afterPlugin]
}

/**
 * Export.
 *
 * @type {Function}
 */

export default DOMPlugin
