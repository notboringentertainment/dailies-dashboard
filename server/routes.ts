import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Scan a directory and return all file metadata + stats
  app.post("/api/scan", async (req, res) => {
    try {
      const { path: dirPath } = req.body;
      if (!dirPath || typeof dirPath !== "string") {
        return res.status(400).json({ error: "Please provide a directory path" });
      }
      const result = await storage.scanDirectory(dirPath);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Scan failed" });
    }
  });
  
  // Get currently loaded files
  app.get("/api/files", async (_req, res) => {
    const files = storage.getFiles();
    const stats = storage.getStats();
    res.json({ files, stats });
  });
  
  // Generate a rename plan
  app.get("/api/rename-plan", async (_req, res) => {
    const plan = storage.generateRenamePlan();
    res.json({ plan });
  });
  
  // Export CSV
  app.get("/api/export/csv", async (_req, res) => {
    const csv = storage.exportCSV();
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=dailies-export.csv");
    res.send(csv);
  });

  // Export rename plan as CSV
  app.get("/api/export/rename-csv", async (_req, res) => {
    const plan = storage.generateRenamePlan();
    const headers = ["Old Name", "New Name", "Project", "Old Path", "Reason"];
    const rows = plan.map(p => [
      p.oldName, p.newName, p.project, p.oldPath, p.reason
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=rename-plan.csv");
    res.send(csv);
  });

  return httpServer;
}
