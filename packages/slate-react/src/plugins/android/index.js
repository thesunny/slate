import { ANDROID_API_VERSION } from 'slate-dev-environment'
import Android8Plugin from './android-8'
import Android9Plugin from './android-9'

const API_TO_PLUGIN = {
  28: Android9Plugin,
  27: Android8Plugin,
  26: Android8Plugin,
}

function AndroidPlugin() {
  const Plugin = API_TO_PLUGIN[ANDROID_API_VERSION]
  if (Plugin) {
    return Plugin()
  }
  return {}
}

/**
 * Export.
 *
 * @type {Function}
 */

export default AndroidPlugin
