import React, { useMemo, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from 'recharts';
import { HardDrive, PieChart as PieChartIcon, Layers, FileText, ArrowUpRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FileMetadata } from '@/src/lib/fileService';

interface StorageUsageChartProps {
  files: FileMetadata[];
}

interface CategoryData {
  category: string;
  rawSize: number;
  sizeMB: number;
  count: number;
  color: string;
  glowColor: string;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; glowColor: string }> = {
  images: { label: 'Images', color: '#38bdf8', glowColor: 'rgba(56, 189, 248, 0.4)' },
  documents: { label: 'Documents', color: '#818cf8', glowColor: 'rgba(129, 140, 248, 0.4)' },
  video: { label: 'Videos', color: '#ec4899', glowColor: 'rgba(236, 72, 153, 0.4)' },
  audio: { label: 'Audio', color: '#f59e0b', glowColor: 'rgba(245, 158, 11, 0.4)' },
  archives: { label: 'Archives', color: '#10b981', glowColor: 'rgba(16, 185, 129, 0.4)' },
  code: { label: 'Code', color: '#06b6d4', glowColor: 'rgba(6, 182, 212, 0.4)' },
  other: { label: 'Other', color: '#94a3b8', glowColor: 'rgba(148, 163, 184, 0.4)' },
};

function categorizeFile(type: string): string {
  const lower = (type || '').toLowerCase();
  if (lower.startsWith('image/')) return 'images';
  if (lower.startsWith('video/')) return 'video';
  if (lower.startsWith('audio/')) return 'audio';
  if (
    lower.includes('pdf') ||
    lower.includes('word') ||
    lower.includes('officedocument') ||
    lower.includes('text/') ||
    lower.includes('presentation')
  ) {
    return 'documents';
  }
  if (
    lower.includes('zip') ||
    lower.includes('tar') ||
    lower.includes('rar') ||
    lower.includes('compressed') ||
    lower.includes('7z')
  ) {
    return 'archives';
  }
  if (
    lower.includes('javascript') ||
    lower.includes('typescript') ||
    lower.includes('json') ||
    lower.includes('html') ||
    lower.includes('css') ||
    lower.includes('xml')
  ) {
    return 'code';
  }
  return 'other';
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    payload: {
      category?: string;
      name?: string;
      sizeMB: number;
      count?: number;
      rawSize: number;
      color?: string;
    };
  }>;
  totalStorageMB: number;
}

const CustomChartTooltip: React.FC<CustomTooltipProps> = ({ active, payload, totalStorageMB }) => {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const percentage = totalStorageMB > 0 ? ((data.sizeMB / totalStorageMB) * 100).toFixed(1) : '0';

  return (
    <div className="glass rounded-xl p-3 border border-white/15 shadow-[0_0_20px_rgba(56,189,248,0.25)] text-xs text-slate-200 min-w-[160px] backdrop-blur-xl bg-slate-950/80">
      <div className="flex items-center gap-2 font-semibold text-white border-b border-white/10 pb-1.5 mb-1.5">
        <span
          className="w-2.5 h-2.5 rounded-full inline-block"
          style={{ backgroundColor: data.color || '#38bdf8' }}
        />
        <span className="truncate max-w-[180px]">{data.category || data.name}</span>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Storage:</span>
          <span className="font-mono text-primary font-bold text-sm">{data.sizeMB.toFixed(3)} MB</span>
        </div>
        {data.count !== undefined && (
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Files:</span>
            <span className="font-mono text-slate-200">{data.count}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-slate-400">Share:</span>
          <span className="font-mono text-cyan-300">{percentage}%</span>
        </div>
      </div>
    </div>
  );
};

export const StorageUsageChart: React.FC<StorageUsageChartProps> = ({ files }) => {
  const [viewMode, setViewMode] = useState<'category' | 'topFiles'>('category');

  // Compute total storage in bytes and MB
  const { totalBytes, totalStorageMB, categoryData, topFilesData, largestFile } = useMemo(() => {
    let bytesSum = 0;
    let maxFile: FileMetadata | null = null;
    const catMap: Record<string, { bytes: number; count: number }> = {
      images: { bytes: 0, count: 0 },
      documents: { bytes: 0, count: 0 },
      video: { bytes: 0, count: 0 },
      audio: { bytes: 0, count: 0 },
      archives: { bytes: 0, count: 0 },
      code: { bytes: 0, count: 0 },
      other: { bytes: 0, count: 0 },
    };

    files.forEach((f) => {
      const size = Number(f.size) || 0;
      bytesSum += size;
      const cat = categorizeFile(f.type);
      if (catMap[cat]) {
        catMap[cat].bytes += size;
        catMap[cat].count += 1;
      } else {
        catMap.other.bytes += size;
        catMap.other.count += 1;
      }

      if (!maxFile || size > (Number(maxFile.size) || 0)) {
        maxFile = f;
      }
    });

    const totalMB = bytesSum / (1024 * 1024);

    // Build category chart data (filter out empty categories for cleaner chart, or show all with minimums)
    const catList: CategoryData[] = Object.keys(catMap)
      .map((key) => {
        const conf = CATEGORY_CONFIG[key] || CATEGORY_CONFIG.other;
        const sizeBytes = catMap[key].bytes;
        return {
          category: conf.label,
          rawSize: sizeBytes,
          sizeMB: Number((sizeBytes / (1024 * 1024)).toFixed(3)),
          count: catMap[key].count,
          color: conf.color,
          glowColor: conf.glowColor,
        };
      })
      .filter((c) => c.rawSize > 0);

    // Top files chart data
    const sorted = [...files]
      .sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0))
      .slice(0, 6)
      .map((f, idx) => ({
        name: f.name.length > 14 ? f.name.substring(0, 11) + '...' : f.name,
        fullName: f.name,
        sizeMB: Number(((Number(f.size) || 0) / (1024 * 1024)).toFixed(3)),
        rawSize: Number(f.size) || 0,
        color: ['#38bdf8', '#818cf8', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'][idx % 6],
      }));

    return {
      totalBytes: bytesSum,
      totalStorageMB: totalMB,
      categoryData: catList,
      topFilesData: sorted,
      largestFile: maxFile,
    };
  }, [files]);

  return (
    <Card
      id="storage-usage-chart-card"
      className="glass border-white/10 shadow-[0_4px_30px_rgba(0,0,0,0.5)] bg-slate-900/40 overflow-hidden"
    >
      <CardHeader className="p-5 pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              id="storage-chart-icon-box"
              className="p-2.5 bg-primary/10 rounded-xl border border-primary/20 shadow-[0_0_15px_rgba(56,189,248,0.2)] shrink-0"
            >
              <HardDrive className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base sm:text-lg font-bold text-slate-100 flex items-center gap-2">
                Storage Usage Breakdown
                <Badge
                  id="storage-total-badge"
                  variant="secondary"
                  className="bg-primary/20 text-primary border border-primary/30 font-mono text-xs px-2 py-0.5"
                >
                  {totalStorageMB.toFixed(2)} MB Total
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Visualizing total space consumed across your personal files
              </CardDescription>
            </div>
          </div>

          {files.length > 0 && (
            <div className="flex items-center gap-1.5 bg-slate-950/40 p-1 rounded-lg border border-white/5 self-start sm:self-auto">
              <Button
                id="btn-chart-view-category"
                size="sm"
                variant={viewMode === 'category' ? 'default' : 'ghost'}
                onClick={() => setViewMode('category')}
                className={`h-7 px-2.5 text-xs rounded-md transition-all ${
                  viewMode === 'category'
                    ? 'bg-primary text-slate-950 font-medium shadow-[0_0_10px_rgba(56,189,248,0.4)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="h-3.5 w-3.5 mr-1" />
                By Category
              </Button>
              <Button
                id="btn-chart-view-top-files"
                size="sm"
                variant={viewMode === 'topFiles' ? 'default' : 'ghost'}
                onClick={() => setViewMode('topFiles')}
                className={`h-7 px-2.5 text-xs rounded-md transition-all ${
                  viewMode === 'topFiles'
                    ? 'bg-primary text-slate-950 font-medium shadow-[0_0_10px_rgba(56,189,248,0.4)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <PieChartIcon className="h-3.5 w-3.5 mr-1" />
                Largest Files
              </Button>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-5 pt-2">
        {files.length === 0 ? (
          <div
            id="storage-chart-empty-state"
            className="h-48 flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/10 rounded-2xl bg-slate-950/20"
          >
            <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400 mb-2 border border-white/5">
              <HardDrive className="h-6 w-6 text-slate-500" />
            </div>
            <p className="text-sm font-semibold text-slate-200">0.00 MB Storage Consumed</p>
            <p className="text-xs text-slate-400 max-w-xs mt-1">
              Upload files to see your storage allocation and file type breakdown.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Quick Summary Pill Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
              <div
                id="metric-total-storage"
                className="bg-slate-950/40 rounded-xl p-2.5 border border-white/5"
              >
                <span className="text-[11px] text-slate-400 block font-medium">Total Usage</span>
                <span className="text-base font-bold font-mono text-primary">
                  {totalStorageMB.toFixed(2)}{' '}
                  <span className="text-xs font-normal text-slate-300">MB</span>
                </span>
              </div>
              <div
                id="metric-total-files"
                className="bg-slate-950/40 rounded-xl p-2.5 border border-white/5"
              >
                <span className="text-[11px] text-slate-400 block font-medium">Files Tracked</span>
                <span className="text-base font-bold font-mono text-slate-100">
                  {files.length}{' '}
                  <span className="text-xs font-normal text-slate-400">items</span>
                </span>
              </div>
              <div
                id="metric-avg-size"
                className="bg-slate-950/40 rounded-xl p-2.5 border border-white/5"
              >
                <span className="text-[11px] text-slate-400 block font-medium">Avg File Size</span>
                <span className="text-base font-bold font-mono text-slate-100">
                  {files.length > 0 ? (totalStorageMB / files.length).toFixed(2) : '0.00'}{' '}
                  <span className="text-xs font-normal text-slate-400">MB</span>
                </span>
              </div>
              <div
                id="metric-largest-file"
                className="bg-slate-950/40 rounded-xl p-2.5 border border-white/5"
              >
                <span className="text-[11px] text-slate-400 block font-medium">Largest Item</span>
                <span
                  className="text-base font-bold font-mono text-cyan-300 truncate block"
                  title={(largestFile as FileMetadata | null)?.name || 'N/A'}
                >
                  {largestFile
                    ? `${(((largestFile as FileMetadata).size || 0) / (1024 * 1024)).toFixed(2)} MB`
                    : '0 MB'}
                </span>
              </div>
            </div>

            {/* Recharts Bar Chart Container */}
            <div
              id="recharts-bar-container"
              className="w-full h-56 pt-2 select-none"
            >
              <ResponsiveContainer width="100%" height="100%">
                {viewMode === 'category' ? (
                  <BarChart
                    data={categoryData}
                    margin={{ top: 12, right: 10, left: -18, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255, 255, 255, 0.07)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="category"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255, 255, 255, 0.1)' }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255, 255, 255, 0.1)' }}
                      tickFormatter={(val) => `${val}MB`}
                    />
                    <Tooltip
                      content={<CustomChartTooltip totalStorageMB={totalStorageMB} />}
                      cursor={{ fill: 'rgba(56, 189, 248, 0.06)' }}
                    />
                    <Bar
                      dataKey="sizeMB"
                      radius={[6, 6, 0, 0]}
                      animationDuration={800}
                    >
                      {categoryData.map((entry, index) => (
                        <Cell
                          key={`cat-cell-${index}`}
                          fill={entry.color}
                          stroke="rgba(255,255,255,0.15)"
                          strokeWidth={1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                ) : (
                  <BarChart
                    data={topFilesData}
                    margin={{ top: 12, right: 10, left: -18, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="rgba(255, 255, 255, 0.07)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255, 255, 255, 0.1)' }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255, 255, 255, 0.1)' }}
                      tickFormatter={(val) => `${val}MB`}
                    />
                    <Tooltip
                      content={<CustomChartTooltip totalStorageMB={totalStorageMB} />}
                      cursor={{ fill: 'rgba(56, 189, 248, 0.06)' }}
                    />
                    <Bar
                      dataKey="sizeMB"
                      radius={[6, 6, 0, 0]}
                      animationDuration={800}
                    >
                      {topFilesData.map((entry, index) => (
                        <Cell
                          key={`file-cell-${index}`}
                          fill={entry.color}
                          stroke="rgba(255,255,255,0.15)"
                          strokeWidth={1}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Category Color Legend */}
            {viewMode === 'category' && categoryData.length > 0 && (
              <div
                id="storage-category-legend"
                className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 pt-1 text-[11px] text-slate-400"
              >
                {categoryData.map((cat, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full inline-block"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="text-slate-300 font-medium">{cat.category}:</span>
                    <span className="font-mono text-slate-400">{cat.sizeMB.toFixed(2)} MB</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
