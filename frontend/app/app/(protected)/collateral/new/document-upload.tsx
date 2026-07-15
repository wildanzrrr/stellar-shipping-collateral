"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  UploadSimple,
  FileText,
  DownloadSimple,
} from "@phosphor-icons/react/dist/ssr"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  collateralApi,
  type CollateralDocument,
  type DocumentTypeKey,
} from "@/lib/api"

import { DOCUMENT_TYPE_OPTIONS } from "./issue-collateral-schema"

interface DocumentUploadProps {
  accessToken: string
  collateralId: string
  documents: CollateralDocument[]
}

/**
 * Upload legal documents (invoices, bills of lading, etc.) to a collateral
 * record. Documents are stored in GCS via the backend; signed URLs are
 * generated on demand for download.
 */
export function DocumentUpload({
  accessToken,
  collateralId,
  documents,
}: DocumentUploadProps) {
  const queryClient = useQueryClient()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [docType, setDocType] = useState<DocumentTypeKey>("COMMERCIAL_INVOICE")

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!selectedFile) throw new Error("Select a file first")
      return collateralApi.uploadDocument(
        accessToken,
        collateralId,
        selectedFile,
        docType
      )
    },
    onSuccess: () => {
      toast.success("Document uploaded")
      setSelectedFile(null)
      queryClient.invalidateQueries({ queryKey: ["collateral", collateralId] })
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Upload failed")
    },
  })

  const downloadMutation = useMutation({
    mutationFn: (docId: string) =>
      collateralApi.getDocumentUrl(accessToken, collateralId, docId),
    onSuccess: (result) => {
      window.open(result.signedUrl, "_blank")
    },
    onError: (err) => {
      toast.error(
        err instanceof Error ? err.message : "Failed to get download URL"
      )
    },
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label className="text-xs font-medium text-muted-foreground">
          Upload supporting document
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Input
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                setSelectedFile(f)
              }}
              className="text-xs"
            />
          </div>
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocumentTypeKey)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {DOCUMENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <Button
            type="button"
            size="sm"
            disabled={!selectedFile || uploadMutation.isPending}
            onClick={() => uploadMutation.mutate()}
          >
            <UploadSimple size={16} />
            {uploadMutation.isPending ? "Uploading…" : "Upload"}
          </Button>
        </div>
      </div>

      {documents.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs font-medium text-muted-foreground">
            Uploaded documents ({documents.length})
          </Label>
          <div className="flex flex-col gap-1">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <FileText size={14} className="text-muted-foreground" />
                  <span className="font-medium">{doc.fileName}</span>
                  <span className="text-muted-foreground">
                    · {doc.documentType.replace(/_/g, " ").toLowerCase()}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={downloadMutation.isPending}
                  onClick={() => downloadMutation.mutate(doc.id)}
                >
                  <DownloadSimple size={14} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
