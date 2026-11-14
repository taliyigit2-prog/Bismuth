// Files between the window and the program (faz-14): in the program's own window the main process saves an export
// with its "Save as" dialog; a phone or browser gets the bytes and downloads them. A chosen CSV/XLSX file goes to the
// import as base64.
import { shell } from '@/lib/shell'
import type { ExportFile } from '@shared/contract/backup'

/** Hands an exported file to the person (the shell: browser download). */
export function saveExport(file: ExportFile): void {
  shell.saveFile({ fileName: file.fileName, mime: file.mime, base64: file.base64 })
}

/** A chosen file as base64 (the contract's import input). */
export async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** Largest file the import takes (the base64 body must fit the 8 MB request). */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024
