import { type FileMetadata, type ScanStats, type RenamePlanEntry } from "@shared/schema";
import { randomUUID } from "crypto";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

const VIDEO_EXTS = new Set([".mp4", ".mov", ".avi", ".mkv", ".webm", ".wmv", ".flv", ".m4v", ".mpg", ".mpeg", ".ts", ".mts"]);
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".tif", ".webp", ".svg", ".raw", ".cr2", ".nef", ".arw", ".dng", ".exr", ".hdr"]);
const AUDIO_EXTS = new Set([".mp3", ".wav", ".flac", ".aac", ".ogg", ".m4a", ".wma", ".aiff"]);
const DOC_EXTS = new Set([".pdf", ".doc", ".docx", ".txt", ".md", ".rtf", ".psd", ".ai", ".blend", ".drp"]);

function getFileType(ext: string): FileMetadata["fileType"] {
  const lower = ext.toLowerCase();
  if (VIDEO_EXTS.has(lower)) return "video";
  if (IMAGE_EXTS.has(lower)) return "image";
  if (AUDIO_EXTS.has(lower)) return "audio";
  if (DOC_EXTS.has(lower)) return "document";
  return "other";
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return m > 0 ? `${m}:${s.padStart(4, "0")}` : `0:${s.padStart(4, "0")}`;
}

function getMediaInfo(filepath: string): Partial<FileMetadata> {
  try {
    const result = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filepath}"`,
      { timeout: 10000, encoding: "utf-8" }
    );
    const data = JSON.parse(result);
    const videoStream = data.streams?.find((s: any) => s.codec_type === "video");
    const audioStream = data.streams?.find((s: any) => s.codec_type === "audio");
    const format = data.format || {};
    
    const info: Partial<FileMetadata> = {};
    
    if (videoStream) {
      info.width = videoStream.width;
      info.height = videoStream.height;
      info.resolution = `${videoStream.width}x${videoStream.height}`;
      info.codec = videoStream.codec_name?.toUpperCase();
      if (videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split("/");
        if (den && Number(den) > 0) {
          info.fps = Math.round((Number(num) / Number(den)) * 100) / 100;
        }
      }
    } else if (audioStream) {
      info.codec = audioStream.codec_name?.toUpperCase();
    }
    
    if (format.duration) {
      info.duration = parseFloat(format.duration);
      info.durationFormatted = formatDuration(info.duration);
    }
    
    return info;
  } catch {
    return {};
  }
}

function getImageDimensions(filepath: string): Partial<FileMetadata> {
  try {
    const result = execSync(
      `ffprobe -v quiet -print_format json -show_streams "${filepath}"`,
      { timeout: 5000, encoding: "utf-8" }
    );
    const data = JSON.parse(result);
    const stream = data.streams?.[0];
    if (stream?.width && stream?.height) {
      return {
        width: stream.width,
        height: stream.height,
        resolution: `${stream.width}x${stream.height}`,
        codec: stream.codec_name?.toUpperCase(),
      };
    }
  } catch {}
  return {};
}

export interface IStorage {
  scanDirectory(dirPath: string): Promise<{ files: FileMetadata[]; stats: ScanStats }>;
  getFiles(): FileMetadata[];
  getStats(): ScanStats | null;
  generateRenamePlan(): RenamePlanEntry[];
  exportCSV(): string;
}

export class MemStorage implements IStorage {
  private files: FileMetadata[] = [];
  private stats: ScanStats | null = null;

  async scanDirectory(dirPath: string): Promise<{ files: FileMetadata[]; stats: ScanStats }> {
    const allFiles: FileMetadata[] = [];
    const resolvedPath = path.resolve(dirPath);
    
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Directory not found: ${resolvedPath}`);
    }
    
    // Determine project names from top-level directories
    const topLevelEntries = fs.readdirSync(resolvedPath, { withFileTypes: true });
    
    const scanRecursive = (currentPath: string, project: string) => {
      try {
        const entries = fs.readdirSync(currentPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(currentPath, entry.name);
          if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "__pycache__") continue;
          
          if (entry.isDirectory()) {
            scanRecursive(fullPath, project);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            const fileType = getFileType(ext);
            
            // Skip non-media/non-project files at root 
            if (fileType === "other" && !DOC_EXTS.has(ext)) continue;
            
            try {
              const stat = fs.statSync(fullPath);
              let mediaInfo: Partial<FileMetadata> = {};
              
              if (fileType === "video" || fileType === "audio") {
                mediaInfo = getMediaInfo(fullPath);
              } else if (fileType === "image") {
                mediaInfo = getImageDimensions(fullPath);
              }
              
              const file: FileMetadata = {
                id: randomUUID(),
                filename: entry.name,
                filepath: fullPath,
                directory: path.relative(resolvedPath, currentPath) || ".",
                project,
                extension: ext,
                fileType,
                sizeBytes: stat.size,
                sizeFormatted: formatBytes(stat.size),
                createdAt: stat.birthtime.toISOString(),
                modifiedAt: stat.mtime.toISOString(),
                ...mediaInfo,
              };
              
              allFiles.push(file);
            } catch {}
          }
        }
      } catch {}
    };
    
    // Scan each top-level folder as a "project"
    for (const entry of topLevelEntries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(resolvedPath, entry.name);
      if (entry.isDirectory()) {
        scanRecursive(fullPath, entry.name);
      } else if (entry.isFile()) {
        // Files at root level
        const ext = path.extname(entry.name).toLowerCase();
        const fileType = getFileType(ext);
        if (fileType !== "other" || DOC_EXTS.has(ext)) {
          try {
            const stat = fs.statSync(fullPath);
            let mediaInfo: Partial<FileMetadata> = {};
            if (fileType === "video" || fileType === "audio") {
              mediaInfo = getMediaInfo(fullPath);
            } else if (fileType === "image") {
              mediaInfo = getImageDimensions(fullPath);
            }
            allFiles.push({
              id: randomUUID(),
              filename: entry.name,
              filepath: fullPath,
              directory: ".",
              project: "(root)",
              extension: ext,
              fileType,
              sizeBytes: stat.size,
              sizeFormatted: formatBytes(stat.size),
              createdAt: stat.birthtime.toISOString(),
              modifiedAt: stat.mtime.toISOString(),
              ...mediaInfo,
            });
          } catch {}
        }
      }
    }
    
    // Compute stats
    const resolutions: Record<string, number> = {};
    const codecs: Record<string, number> = {};
    const projects = new Set<string>();
    let totalSize = 0;
    
    for (const f of allFiles) {
      projects.add(f.project);
      totalSize += f.sizeBytes;
      if (f.resolution) resolutions[f.resolution] = (resolutions[f.resolution] || 0) + 1;
      if (f.codec) codecs[f.codec] = (codecs[f.codec] || 0) + 1;
    }
    
    const stats: ScanStats = {
      totalFiles: allFiles.length,
      totalSize: formatBytes(totalSize),
      projectCount: projects.size,
      videoCount: allFiles.filter(f => f.fileType === "video").length,
      imageCount: allFiles.filter(f => f.fileType === "image").length,
      audioCount: allFiles.filter(f => f.fileType === "audio").length,
      otherCount: allFiles.filter(f => f.fileType === "document" || f.fileType === "other").length,
      resolutions,
      codecs,
    };
    
    this.files = allFiles;
    this.stats = stats;
    
    return { files: allFiles, stats };
  }
  
  getFiles(): FileMetadata[] {
    return this.files;
  }
  
  getStats(): ScanStats | null {
    return this.stats;
  }
  
  generateRenamePlan(): RenamePlanEntry[] {
    const plan: RenamePlanEntry[] = [];
    
    for (const file of this.files) {
      const ext = file.extension;
      const project = file.project.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
      const date = new Date(file.modifiedAt);
      const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
      
      // Build descriptive name: project_type_resolution_date_index.ext
      const typePart = file.fileType;
      const resPart = file.resolution ? `_${file.resolution}` : "";
      const codecPart = file.codec ? `_${file.codec}` : "";
      const durationPart = file.duration ? `_${Math.round(file.duration)}s` : "";
      
      const newName = `${project}_${typePart}${resPart}${codecPart}${durationPart}_${dateStr}${ext}`;
      
      if (newName !== file.filename) {
        plan.push({
          id: randomUUID(),
          oldPath: file.filepath,
          oldName: file.filename,
          newName,
          project: file.project,
          reason: `Standardize naming: project + type + metadata + date`,
        });
      }
    }
    
    return plan;
  }
  
  exportCSV(): string {
    const headers = [
      "Filename", "Project", "Directory", "Type", "Extension",
      "Size", "Resolution", "Duration", "Codec", "FPS",
      "Created", "Modified", "Full Path"
    ];
    
    const rows = this.files.map(f => [
      f.filename,
      f.project,
      f.directory,
      f.fileType,
      f.extension,
      f.sizeFormatted,
      f.resolution || "",
      f.durationFormatted || "",
      f.codec || "",
      f.fps?.toString() || "",
      f.createdAt,
      f.modifiedAt,
      f.filepath,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    
    return [headers.join(","), ...rows].join("\n");
  }
}

export const storage = new MemStorage();
