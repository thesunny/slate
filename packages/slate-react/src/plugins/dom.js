import { IS_ANDROID, ANDROID_API_VERSION } from 'slate-dev-environment'
import AndroidPlugin from './android'
import Android7Plugin from './android-7'
import Android8Plugin from './android-8'
import Android9Plugin from './android-9'
import AfterPlugin from './after'
import BeforePlugin from './before'
import DebugPlugin from './debug'

const API_TO_PLUGIN = {
  28: Android9Plugin,
  27: Android8Plugin,
  26: Android8Plugin,
  25: Android7Plugin,
  24: Android7Plugin,
}

/**
 * A plugin that adds the browser-specific logic to the editor.
 *
 * @param {Object} options
 * @return {Object}
 */

function DOMPlugin(options = {}) {
  const { plugins = [] } = options
  const androidPlugins = []
  if (IS_ANDROID) {
    const AndroidPlugin = API_TO_PLUGIN[ANDROID_API_VERSION]
    if (AndroidPlugin) {
      androidPlugins.push(AndroidPlugin())
    }
  }
  const beforePlugin = BeforePlugin()
  const afterPlugin = AfterPlugin()
  return [
    DebugPlugin(),
    ...androidPlugins,
    beforePlugin,
    ...plugins,
    afterPlugin,
  ]
}

/**
 * Export.
 *
 * @type {Function}
 */

export default DOMPlugin
