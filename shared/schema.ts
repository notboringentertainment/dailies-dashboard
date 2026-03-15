import { z } from "zod";

// File metadata extracted from scanned directories
export const fileMetadataSchema = z.object({
  id: z.string(),
  filename: z.string(),
  filepath: z.string(),
  directory: z.string(),
  project: z.string(), // inferred from top-level folder
  extension: z.string(),
  fileType: z.enum(["video", "image", "audio", "document", "other"]),
  sizeBytes: z.number(),
  sizeFormatted: z.string(),
  // Media metadata (optional, extracted via ffprobe/file info)
  width: z.number().optional(),
  height: z.number().optional(),
  resolution: z.string().optional(), // e.g. "1920x1080"
  duration: z.number().optional(), // seconds
  durationFormatted: z.string().optional(), // "0:04.2"
  codec: z.string().optional(),
  fps: z.number().optional(),
  // Timestamps
  createdAt: z.string(), // ISO string
  modifiedAt: z.string(),
  // Thumbnail (base64 data URI for images, generated for videos)
  thumbnailUrl: z.string().optional(),
});

export type FileMetadata = z.infer<typeof fileMetadataSchema>;

// Rename plan entry
export const renamePlanEntrySchema = z.object({
  id: z.string(),
  oldPath: z.string(),
  oldName: z.string(),
  newName: z.string(),
  project: z.string(),
  reason: z.string(),
});

export type RenamePlanEntry = z.infer<typeof renamePlanEntrySchema>;

// Stats summary
export const scanStatsSchema = z.object({
  totalFiles: z.number(),
  totalSize: z.string(),
  projectCount: z.number(),
  videoCount: z.number(),
  imageCount: z.number(),
  audioCount: z.number(),
  otherCount: z.number(),
  resolutions: z.record(z.string(), z.number()), // resolution -> count
  codecs: z.record(z.string(), z.number()),
});

export type ScanStats = z.infer<typeof scanStatsSchema>;

// API response shapes
export const scanResponseSchema = z.object({
  files: z.array(fileMetadataSchema),
  stats: scanStatsSchema,
});

export type ScanResponse = z.infer<typeof scanResponseSchema>;
