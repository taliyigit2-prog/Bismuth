// Uploading the photos of an issue one by one (each call stays small); the screens refresh once at the end.
import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTransport } from '@/lib/api/api-context'
import { ISSUE_QUERIES } from './issue-utils'
import { toUpload } from './photo-upload'

export interface UploadResult {
  added: number
  /** The first failure, if any (the rest were still tried). */
  error: unknown
}

export function useUploadIssuePhotos(): (issueId: string, files: readonly File[]) => Promise<UploadResult> {
  const transport = useTransport()
  const client = useQueryClient()
  return useCallback(
    async (issueId, files) => {
      let added = 0
      let error: unknown = null
      for (const file of files) {
        try {
          await transport.call('attachments.add', await toUpload(file, 'room_issue', issueId))
          added += 1
        } catch (e) {
          error ??= e
        }
      }
      if (files.length)
        await Promise.all(ISSUE_QUERIES.map((name) => client.invalidateQueries({ queryKey: [name] })))
      return { added, error }
    },
    [transport, client]
  )
}
