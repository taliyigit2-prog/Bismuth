// The camera add-on (Faz 20, P20f): Python, its libraries, the Python files and the model files are ~1.5 GB, so they
// are NOT part of the main installer. The owner unpacks `Bismuth-Kamera-<platform>.zip` into `<userData>/camera-addon`
// (docs/kurulum.md); a packaged Bismuth looks only there (never in PATH, never in a variable, G-01/G-07).
//
//   camera-addon/
//     addon.json            { schema, platform, arch, bismuth, python }   (written by scripts/camera-bundle.mjs)
//     python/               Windows: python.org embeddable; macOS: python-build-standalone
//     site-packages/        pip --target (torch CPU, ultralytics, insightface, onnxruntime, opencv, ...)
//     app/                  the `otel-kamera` Python files and `static/`
//     models/               yolo11n.pt, insightface/..., SHA256SUMS (required when packaged; model_loader.py)
//     licenses/             licence texts of the shipped packages
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export const ADDON_DIR_NAME = 'camera-addon'

export interface CameraAddon {
  root: string
  python: string
  sitePackages: string
  /** The Python files (`web_app.py`, ...): the sidecar's working directory. */
  scriptDir: string
  modelsDir: string
}

export const addonRoot = (userData: string): string => join(userData, ADDON_DIR_NAME)

const pythonPath = (root: string, platform: NodeJS.Platform): string =>
  platform === 'win32' ? join(root, 'python', 'python.exe') : join(root, 'python', 'bin', 'python3')

/** The add-on if it is complete for this computer, else null ("camera add-on not installed"). */
export function findCameraAddon(
  userData: string,
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch
): CameraAddon | null {
  const root = addonRoot(userData)
  const python = pythonPath(root, platform)
  const addon: CameraAddon = {
    root,
    python,
    sitePackages: join(root, 'site-packages'),
    scriptDir: join(root, 'app'),
    modelsDir: join(root, 'models')
  }
  if (!existsSync(join(root, 'addon.json'))) return null
  try {
    const meta = JSON.parse(readFileSync(join(root, 'addon.json'), 'utf8')) as {
      platform?: unknown
      arch?: unknown
    }
    // An add-on built for another system (e.g. a Windows zip copied to a Mac) never starts.
    if (meta.platform !== platform || meta.arch !== arch) return null
  } catch {
    return null
  }
  const needed = [python, join(addon.scriptDir, 'web_app.py'), join(addon.modelsDir, 'SHA256SUMS')]
  return needed.every((p) => existsSync(p)) ? addon : null
}

/** Environment of the packaged sidecar: only the add-on's libraries, strict model checks, nothing written to the disk. */
export function addonEnv(
  addon: CameraAddon,
  platform: NodeJS.Platform = process.platform
): NodeJS.ProcessEnv {
  return {
    PYTHONPATH: [addon.sitePackages, addon.scriptDir].join(platform === 'win32' ? ';' : ':'),
    PYTHONNOUSERSITE: '1',
    PYTHONDONTWRITEBYTECODE: '1',
    BISMUTH_CAMERA_PACKAGED: '1'
  }
}
