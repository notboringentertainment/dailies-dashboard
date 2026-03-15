import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { generateDemoFiles, generateDemoStats } from "@/lib/demo-data";
import type { FileMetadata, ScanStats, RenamePlanEntry } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import {
  Film, Image, Music, FileText, FolderOpen, Search, Download,
  LayoutGrid, List, ArrowUpDown, HardDrive, Clock, Video,
  X, ChevronRight, Sun, Moon, ScanLine, Tag, RefreshCw,
} from "lucide-react";

// Theme provider
function useTheme() {
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  const toggle = useCallback(() => {
    setDark(d => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      return next;
    });
  }, []);
  // Initialize dark class
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", dark);
  }
  return { dark, toggle };
}

const fileTypeIcon = (type: FileMetadata["fileType"], className = "w-4 h-4") => {
  switch (type) {
    case "video": return <Film className={className} />;
    case "image": return <Image className={className} />;
    case "audio": return <Music className={className} />;
    case "document": return <FileText className={className} />;
    default: return <FileText className={className} />;
  }
};

const fileTypeColor = (type: FileMetadata["fileType"]) => {
  switch (type) {
    case "video": return "text-cyan-500 dark:text-cyan-400";
    case "image": return "text-emerald-500 dark:text-emerald-400";
    case "audio": return "text-amber-500 dark:text-amber-400";
    case "document": return "text-violet-500 dark:text-violet-400";
    default: return "text-muted-foreground";
  }
};

type SortKey = "filename" | "project" | "fileType" | "sizeBytes" | "resolution" | "duration" | "modifiedAt";
type ViewMode = "grid" | "table";

export default function Dashboard() {
  const { dark, toggle } = useTheme();
  const { toast } = useToast();

  // State
  const [scanPath, setScanPath] = useState("");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterResolution, setFilterResolution] = useState<string>("all");
  const [filterCodec, setFilterCodec] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("modifiedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedFile, setSelectedFile] = useState<FileMetadata | null>(null);
  const [showRenamePlan, setShowRenamePlan] = useState(false);
  const [activeTab, setActiveTab] = useState("files");

  // Demo data as initial state
  const [demoFiles] = useState(() => generateDemoFiles());
  const [demoStats] = useState(() => generateDemoStats(demoFiles));

  // API data (overrides demo when scan is performed)
  const [apiData, setApiData] = useState<{ files: FileMetadata[]; stats: ScanStats } | null>(null);

  const files = apiData?.files || demoFiles;
  const stats = apiData?.stats || demoStats;

  // Scan mutation
  const scanMutation = useMutation({
    mutationFn: async (path: string) => {
      const res = await apiRequest("POST", "/api/scan", { path });
      return res.json();
    },
    onSuccess: (data) => {
      setApiData(data);
      toast({ title: "Scan complete", description: `Found ${data.files.length} files across ${data.stats.projectCount} projects` });
    },
    onError: (err: Error) => {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
    },
  });

  // Derived data
  const projectNames = useMemo(() => [...new Set(files.map(f => f.project))].sort(), [files]);
  const resolutionOptions = useMemo(() => [...new Set(files.map(f => f.resolution).filter(Boolean))].sort() as string[], [files]);
  const codecOptions = useMemo(() => [...new Set(files.map(f => f.codec).filter(Boolean))].sort() as string[], [files]);

  // Filtering + sorting
  const filteredFiles = useMemo(() => {
    let result = files;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(f =>
        f.filename.toLowerCase().includes(q) ||
        f.project.toLowerCase().includes(q) ||
        f.directory.toLowerCase().includes(q) ||
        (f.codec && f.codec.toLowerCase().includes(q))
      );
    }
    if (filterType !== "all") result = result.filter(f => f.fileType === filterType);
    if (filterProject !== "all") result = result.filter(f => f.project === filterProject);
    if (filterResolution !== "all") result = result.filter(f => f.resolution === filterResolution);
    if (filterCodec !== "all") result = result.filter(f => f.codec === filterCodec);

    result.sort((a, b) => {
      let aVal: any = a[sortKey];
      let bVal: any = b[sortKey];
      if (aVal == null) aVal = "";
      if (bVal == null) bVal = "";
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
      if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return result;
  }, [files, search, filterType, filterProject, filterResolution, filterCodec, sortKey, sortDir]);

  // Rename plan
  const renamePlan = useMemo(() => {
    const plan: RenamePlanEntry[] = [];
    for (const file of files) {
      const ext = file.extension;
      const project = file.project.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
      const date = new Date(file.modifiedAt);
      const dateStr = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
      const typePart = file.fileType;
      const resPart = file.resolution ? `_${file.resolution}` : "";
      const codecPart = file.codec ? `_${file.codec}` : "";
      const durationPart = file.duration ? `_${Math.round(file.duration)}s` : "";
      const newName = `${project}_${typePart}${resPart}${codecPart}${durationPart}_${dateStr}${ext}`;
      if (newName !== file.filename) {
        plan.push({
          id: file.id,
          oldPath: file.filepath,
          oldName: file.filename,
          newName,
          project: file.project,
          reason: "Standardize: project + type + metadata + date",
        });
      }
    }
    return plan;
  }, [files]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const exportCSV = () => {
    const headers = ["Filename", "Project", "Directory", "Type", "Extension", "Size", "Resolution", "Duration", "Codec", "FPS", "Created", "Modified", "Full Path"];
    const rows = filteredFiles.map(f => [
      f.filename, f.project, f.directory, f.fileType, f.extension,
      f.sizeFormatted, f.resolution || "", f.durationFormatted || "",
      f.codec || "", f.fps?.toString() || "", f.createdAt, f.modifiedAt, f.filepath,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "dailies-export.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const exportRenamePlan = () => {
    const headers = ["Old Name", "New Name", "Project", "Old Path", "Reason"];
    const rows = renamePlan.map(p => [
      p.oldName, p.newName, p.project, p.oldPath, p.reason,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "rename-plan.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setSearch("");
    setFilterType("all");
    setFilterProject("all");
    setFilterResolution("all");
    setFilterCodec("all");
  };

  const hasActiveFilters = search || filterType !== "all" || filterProject !== "all" || filterResolution !== "all" || filterCodec !== "all";

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <DailiesLogo />
          <div>
            <h1 className="text-base font-semibold tracking-tight" data-testid="text-app-title">Dailies</h1>
            <p className="text-xs text-muted-foreground">AI Project Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 mr-2">
            <Input
              type="text"
              placeholder="/path/to/projects"
              value={scanPath}
              onChange={e => setScanPath(e.target.value)}
              className="w-56 h-8 text-xs font-mono"
              data-testid="input-scan-path"
            />
            <Button
              size="sm"
              variant="default"
              className="h-8 text-xs gap-1.5"
              onClick={() => scanPath && scanMutation.mutate(scanPath)}
              disabled={scanMutation.isPending || !scanPath}
              data-testid="button-scan"
            >
              <ScanLine className="w-3.5 h-3.5" />
              {scanMutation.isPending ? "Scanning..." : "Scan"}
            </Button>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="w-8 h-8" onClick={toggle} data-testid="button-theme-toggle">
                {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{dark ? "Light mode" : "Dark mode"}</TooltipContent>
          </Tooltip>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="flex items-center gap-4 px-6 py-2.5 border-b border-border bg-card/30 shrink-0 overflow-x-auto">
        <StatChip icon={<FolderOpen className="w-3.5 h-3.5" />} label="Projects" value={String(stats.projectCount)} />
        <StatChip icon={<HardDrive className="w-3.5 h-3.5" />} label="Total" value={`${stats.totalFiles} files`} />
        <StatChip icon={<HardDrive className="w-3.5 h-3.5" />} label="Size" value={stats.totalSize} />
        <div className="w-px h-5 bg-border" />
        <StatChip icon={<Film className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400" />} label="Video" value={String(stats.videoCount)} />
        <StatChip icon={<Image className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />} label="Image" value={String(stats.imageCount)} />
        {stats.audioCount > 0 && <StatChip icon={<Music className="w-3.5 h-3.5 text-amber-500" />} label="Audio" value={String(stats.audioCount)} />}
        {stats.otherCount > 0 && <StatChip icon={<FileText className="w-3.5 h-3.5 text-violet-500" />} label="Other" value={String(stats.otherCount)} />}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 min-h-0">
        <div className="flex items-center justify-between px-6 py-2 border-b border-border shrink-0">
          <TabsList className="h-8">
            <TabsTrigger value="files" className="text-xs h-7 px-3" data-testid="tab-files">Files</TabsTrigger>
            <TabsTrigger value="rename" className="text-xs h-7 px-3" data-testid="tab-rename">
              Rename Plan
              {renamePlan.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-[10px] px-1.5 h-4">{renamePlan.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            {activeTab === "files" && (
              <>
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={exportCSV} data-testid="button-export-csv">
                  <Download className="w-3 h-3" /> Export CSV
                </Button>
                <div className="flex border border-border rounded-md">
                  <Button
                    variant={viewMode === "grid" ? "secondary" : "ghost"}
                    size="icon"
                    className="w-7 h-7 rounded-r-none"
                    onClick={() => setViewMode("grid")}
                    data-testid="button-view-grid"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant={viewMode === "table" ? "secondary" : "ghost"}
                    size="icon"
                    className="w-7 h-7 rounded-l-none"
                    onClick={() => setViewMode("table")}
                    data-testid="button-view-table"
                  >
                    <List className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </>
            )}
            {activeTab === "rename" && (
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={exportRenamePlan} data-testid="button-export-rename">
                <Download className="w-3 h-3" /> Export Plan
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="files" className="flex flex-col flex-1 min-h-0 mt-0">
          {/* Filters */}
          <div className="flex items-center gap-2 px-6 py-2 border-b border-border shrink-0 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search files, projects, codecs..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-8 pl-8 text-xs"
                data-testid="input-search"
              />
            </div>
            <FilterSelect
              value={filterType}
              onChange={setFilterType}
              placeholder="Type"
              options={[
                { value: "all", label: "All Types" },
                { value: "video", label: "Video" },
                { value: "image", label: "Image" },
                { value: "audio", label: "Audio" },
                { value: "document", label: "Document" },
              ]}
              testId="select-filter-type"
            />
            <FilterSelect
              value={filterProject}
              onChange={setFilterProject}
              placeholder="Project"
              options={[
                { value: "all", label: "All Projects" },
                ...projectNames.map(p => ({ value: p, label: p })),
              ]}
              testId="select-filter-project"
            />
            <FilterSelect
              value={filterResolution}
              onChange={setFilterResolution}
              placeholder="Resolution"
              options={[
                { value: "all", label: "All Resolutions" },
                ...resolutionOptions.map(r => ({ value: r, label: r })),
              ]}
              testId="select-filter-resolution"
            />
            <FilterSelect
              value={filterCodec}
              onChange={setFilterCodec}
              placeholder="Codec"
              options={[
                { value: "all", label: "All Codecs" },
                ...codecOptions.map(c => ({ value: c, label: c })),
              ]}
              testId="select-filter-codec"
            />
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground" onClick={clearFilters} data-testid="button-clear-filters">
                <X className="w-3 h-3" /> Clear
              </Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto tabular-nums">
              {filteredFiles.length} of {files.length} files
            </span>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            {viewMode === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 p-4">
                {filteredFiles.map(file => (
                  <FileCard key={file.id} file={file} onClick={() => setSelectedFile(file)} />
                ))}
                {filteredFiles.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Search className="w-8 h-8 mb-3 opacity-40" />
                    <p className="text-sm font-medium">No files match your filters</p>
                    <p className="text-xs mt-1">Try adjusting your search or filter criteria</p>
                  </div>
                )}
              </div>
            ) : (
              <FileTable
                files={filteredFiles}
                sortKey={sortKey}
                sortDir={sortDir}
                onSort={handleSort}
                onSelect={setSelectedFile}
              />
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="rename" className="flex-1 min-h-0 mt-0">
          <ScrollArea className="h-full">
            <div className="p-4">
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                  Proposed renames based on project + file type + metadata + date. Review before applying.
                  Export as CSV to use with a rename script.
                </p>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs font-medium w-[30%]">Current Name</TableHead>
                      <TableHead className="text-xs font-medium w-[30%]">Proposed Name</TableHead>
                      <TableHead className="text-xs font-medium w-[15%]">Project</TableHead>
                      <TableHead className="text-xs font-medium w-[25%]">Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {renamePlan.map(entry => (
                      <TableRow key={entry.id}>
                        <TableCell className="font-mono text-xs py-2 text-destructive/80">{entry.oldName}</TableCell>
                        <TableCell className="font-mono text-xs py-2 text-emerald-600 dark:text-emerald-400">{entry.newName}</TableCell>
                        <TableCell className="text-xs py-2">{entry.project}</TableCell>
                        <TableCell className="text-xs py-2 text-muted-foreground">{entry.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

      {/* File Detail Dialog */}
      <Dialog open={!!selectedFile} onOpenChange={open => !open && setSelectedFile(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <span className={fileTypeColor(selectedFile?.fileType || "other")}>
                {fileTypeIcon(selectedFile?.fileType || "other", "w-4 h-4")}
              </span>
              <span className="font-mono truncate">{selectedFile?.filename}</span>
            </DialogTitle>
          </DialogHeader>
          {selectedFile && <FileDetail file={selectedFile} />}
        </DialogContent>
      </Dialog>

      {/* Attribution */}
      <div className="shrink-0 px-6 py-1.5 border-t border-border bg-card/30 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {!apiData ? "Showing demo data. Enter a path above and click Scan to analyze your files." : "Live scan data"}
        </span>
        <PerplexityAttribution />
      </div>
    </div>
  );
}

// --- Sub-components ---

function DailiesLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-label="Dailies logo" className="shrink-0">
      <rect x="1" y="1" width="26" height="26" rx="5" stroke="currentColor" strokeWidth="1.5" className="text-primary" />
      <rect x="5" y="5" width="8" height="8" rx="1.5" fill="currentColor" className="text-primary opacity-80" />
      <rect x="15" y="5" width="8" height="8" rx="1.5" fill="currentColor" className="text-primary opacity-50" />
      <rect x="5" y="15" width="8" height="8" rx="1.5" fill="currentColor" className="text-primary opacity-30" />
      <rect x="15" y="15" width="8" height="8" rx="1.5" fill="currentColor" className="text-primary opacity-60" />
    </svg>
  );
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
      {icon}
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function FilterSelect({
  value, onChange, placeholder, options, testId,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  testId: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[120px] text-xs" data-testid={testId}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map(o => (
          <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FileCard({ file, onClick }: { file: FileMetadata; onClick: () => void }) {
  const hue = file.fileType === "video" ? "bg-cyan-500/10" : file.fileType === "image" ? "bg-emerald-500/10" : "bg-muted";
  return (
    <button
      onClick={onClick}
      className="group text-left rounded-lg border border-border bg-card hover:bg-accent/50 transition-colors overflow-hidden focus:outline-none focus:ring-2 focus:ring-ring"
      data-testid={`card-file-${file.id}`}
    >
      {/* Thumbnail area */}
      <div className={`aspect-video ${hue} flex items-center justify-center relative`}>
        <span className={`${fileTypeColor(file.fileType)}`}>
          {fileTypeIcon(file.fileType, "w-8 h-8 opacity-40")}
        </span>
        {file.duration != null && (
          <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded font-mono tabular-nums">
            {file.durationFormatted}
          </span>
        )}
        {file.resolution && (
          <span className="absolute top-1 left-1 bg-black/50 text-white text-[10px] px-1 rounded font-mono">
            {file.resolution}
          </span>
        )}
      </div>
      <div className="p-2">
        <p className="text-xs font-medium truncate leading-tight" title={file.filename}>
          {file.filename}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          <span className="text-[10px] text-muted-foreground font-mono tabular-nums">{file.sizeFormatted}</span>
          {file.codec && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 font-mono">{file.codec}</Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{file.project}</p>
      </div>
    </button>
  );
}

function FileTable({
  files, sortKey, sortDir, onSort, onSelect,
}: {
  files: FileMetadata[];
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
  onSelect: (file: FileMetadata) => void;
}) {
  const SortHeader = ({ k, children, className = "" }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead
      className={`text-xs font-medium cursor-pointer hover:text-foreground select-none ${className}`}
      onClick={() => onSort(k)}
    >
      <span className="flex items-center gap-1">
        {children}
        {sortKey === k && <ArrowUpDown className="w-3 h-3" />}
      </span>
    </TableHead>
  );

  return (
    <div className="px-4 py-2">
      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <SortHeader k="filename" className="min-w-[200px]">Name</SortHeader>
              <SortHeader k="project">Project</SortHeader>
              <SortHeader k="fileType">Type</SortHeader>
              <SortHeader k="resolution">Resolution</SortHeader>
              <SortHeader k="duration">Duration</SortHeader>
              <SortHeader k="sizeBytes">Size</SortHeader>
              <SortHeader k="modifiedAt">Modified</SortHeader>
            </TableRow>
          </TableHeader>
          <TableBody>
            {files.map(file => (
              <TableRow
                key={file.id}
                className="cursor-pointer hover:bg-accent/40"
                onClick={() => onSelect(file)}
                data-testid={`row-file-${file.id}`}
              >
                <TableCell className="py-1.5">
                  <div className="flex items-center gap-2">
                    <span className={fileTypeColor(file.fileType)}>{fileTypeIcon(file.fileType, "w-3.5 h-3.5")}</span>
                    <span className="font-mono text-xs truncate max-w-[240px]" title={file.filename}>{file.filename}</span>
                  </div>
                </TableCell>
                <TableCell className="text-xs py-1.5">{file.project}</TableCell>
                <TableCell className="py-1.5">
                  <Badge variant="outline" className="text-[10px] font-mono px-1.5 h-5">{file.fileType}</Badge>
                </TableCell>
                <TableCell className="font-mono text-xs py-1.5 tabular-nums">{file.resolution || "—"}</TableCell>
                <TableCell className="font-mono text-xs py-1.5 tabular-nums">{file.durationFormatted || "—"}</TableCell>
                <TableCell className="font-mono text-xs py-1.5 tabular-nums">{file.sizeFormatted}</TableCell>
                <TableCell className="text-xs py-1.5 text-muted-foreground tabular-nums">
                  {new Date(file.modifiedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </TableCell>
              </TableRow>
            ))}
            {files.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                  No files match your filters
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function FileDetail({ file }: { file: FileMetadata }) {
  const rows: [string, string | undefined][] = [
    ["Project", file.project],
    ["Directory", file.directory],
    ["Type", file.fileType],
    ["Extension", file.extension],
    ["Size", file.sizeFormatted],
    ["Resolution", file.resolution],
    ["Duration", file.durationFormatted],
    ["Codec", file.codec],
    ["FPS", file.fps?.toString()],
    ["Created", new Date(file.createdAt).toLocaleString()],
    ["Modified", new Date(file.modifiedAt).toLocaleString()],
    ["Full Path", file.filepath],
  ];

  return (
    <div className="space-y-3 pt-2">
      <div className="grid grid-cols-[100px_1fr] gap-y-1.5 gap-x-3 text-xs">
        {rows.filter(([, val]) => val).map(([label, value]) => (
          <div key={label} className="contents">
            <span className="text-muted-foreground font-medium">{label}</span>
            <span className={`font-mono ${label === "Full Path" ? "break-all" : ""} tabular-nums`}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
