import type { FileMetadata, ScanStats } from "@shared/schema";

// Realistic demo data simulating Ben's AI production project folders
const projects = [
  "CyberNoir_ShortFilm",
  "ComfyUI_Outputs",
  "SD_Experiments_Jan",
  "Veo_Beach_Tests",
  "Midjourney_Stills",
  "Untitled_Project_3",
  "client_reel_2026",
  "wan_video_tests",
];

const videoCodecs = ["H264", "H265", "VP9", "AV1", "PRORES"];
const imageCodecMap: Record<string, string> = { ".png": "PNG", ".jpg": "JPEG", ".webp": "WEBP", ".exr": "EXR" };
const videoCodecMap: Record<string, string[]> = {
  ".mp4": ["H264", "H265", "AV1"],
  ".mov": ["PRORES", "H264", "H265"],
  ".webm": ["VP9", "AV1"],
  ".mkv": ["H265", "H264", "AV1"],
};
const resolutions = ["3840x2160", "1920x1080", "1280x720", "2560x1440", "1024x1024", "512x512", "768x1344"];
const videoExts = [".mp4", ".mov", ".webm", ".mkv"];
const imageExts = [".png", ".jpg", ".webp", ".exr"];

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return m > 0 ? `${m}:${s.padStart(4, "0")}` : `0:${s.padStart(4, "0")}`;
}

const messy_video_names = [
  "final_v2_FINAL.mp4", "output_00023.mp4", "test_render_3.mov", 
  "comp_v5_color.mp4", "scene01_take3.mov", "new_scene_edit.mp4",
  "untitled.mp4", "draft_cut_feb12.mov", "hero_shot_maybe.mp4",
  "rerender_001.webm", "comfyui_output.mp4", "wan_gen_4k.mp4",
  "beach_sunset_v2.mp4", "veo_cyberpunk_test.mkv", "sd_anim_loop.webm",
  "character_walk_01.mp4", "timelapse_city.mov", "product_shot_draft.mp4",
  "transition_test.mp4", "ai_generated_final.mp4", "clip_export_1080.mp4",
  "4k_upscale_test.mkv", "batch_render_047.mp4", "sequence_001.mov",
];

const messy_image_names = [
  "ComfyUI_00147.png", "ComfyUI_00148.png", "ComfyUI_00203.png",
  "midjourney_v6_neon.png", "img_20260115_001.jpg", "screenshot_1.png",
  "reference_mood.jpg", "color_grade_test.exr", "texture_v2.webp",
  "storyboard_page3.png", "concept_art_draft.jpg", "sd_output_512.png",
  "upscaled_hero.png", "background_plate.exr", "matte_painting_wip.png",
  "character_design_03.png", "logo_draft.webp", "thumbnail_idea.jpg",
  "overlay_particles.png", "gen_portrait_001.jpg", "test_img.png",
  "render_beauty_pass.exr", "hdri_studio_test.exr", "frame_0247.png",
];

export function generateDemoFiles(): FileMetadata[] {
  const files: FileMetadata[] = [];
  let id = 0;

  for (const project of projects) {
    const numVideos = randInt(2, 6);
    const numImages = randInt(3, 8);

    for (let i = 0; i < numVideos; i++) {
      const ext = rand(videoExts);
      const filename = rand(messy_video_names).replace(/\.\w+$/, ext);
      const res = rand(resolutions.slice(0, 4)); // video-appropriate resolutions
      const [w, h] = res.split("x").map(Number);
      const duration = randInt(2, 180);
      const sizeBytes = randInt(5_000_000, 2_000_000_000);
      const daysAgo = randInt(1, 90);
      const date = new Date(Date.now() - daysAgo * 86400000);

      files.push({
        id: String(++id),
        filename,
        filepath: `/projects/${project}/${filename}`,
        directory: project,
        project,
        extension: ext,
        fileType: "video",
        sizeBytes,
        sizeFormatted: formatBytes(sizeBytes),
        width: w,
        height: h,
        resolution: res,
        duration,
        durationFormatted: formatDuration(duration),
        codec: rand(videoCodecMap[ext] || ["H264"]),
        fps: rand([23.976, 24, 29.97, 30, 60]),
        createdAt: date.toISOString(),
        modifiedAt: new Date(date.getTime() + randInt(0, 3600000)).toISOString(),
      });
    }

    for (let i = 0; i < numImages; i++) {
      const ext = rand(imageExts);
      const filename = rand(messy_image_names).replace(/\.\w+$/, ext);
      const res = rand(resolutions);
      const [w, h] = res.split("x").map(Number);
      const sizeBytes = randInt(100_000, 80_000_000);
      const daysAgo = randInt(1, 90);
      const date = new Date(Date.now() - daysAgo * 86400000);

      files.push({
        id: String(++id),
        filename,
        filepath: `/projects/${project}/${filename}`,
        directory: project,
        project,
        extension: ext,
        fileType: "image",
        sizeBytes,
        sizeFormatted: formatBytes(sizeBytes),
        width: w,
        height: h,
        resolution: res,
        codec: imageCodecMap[ext] || "PNG",
        createdAt: date.toISOString(),
        modifiedAt: new Date(date.getTime() + randInt(0, 3600000)).toISOString(),
      });
    }
  }

  return files;
}

export function generateDemoStats(files: FileMetadata[]): ScanStats {
  const projects = new Set(files.map(f => f.project));
  const totalSize = files.reduce((sum, f) => sum + f.sizeBytes, 0);
  const resolutions: Record<string, number> = {};
  const codecs: Record<string, number> = {};

  for (const f of files) {
    if (f.resolution) resolutions[f.resolution] = (resolutions[f.resolution] || 0) + 1;
    if (f.codec) codecs[f.codec] = (codecs[f.codec] || 0) + 1;
  }

  return {
    totalFiles: files.length,
    totalSize: formatBytes(totalSize),
    projectCount: projects.size,
    videoCount: files.filter(f => f.fileType === "video").length,
    imageCount: files.filter(f => f.fileType === "image").length,
    audioCount: 0,
    otherCount: 0,
    resolutions,
    codecs,
  };
}
