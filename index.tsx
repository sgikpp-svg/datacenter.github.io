
import React, { useState, useMemo, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  BarChart3, 
  MapPin, 
  Building2, 
  Calendar, 
  X, 
  Info, 
  LayoutDashboard,
  HardDrive,
  FileSpreadsheet,
  AlertCircle,
  Trophy,
  Database,
  List,
  SearchX,
  Table as TableIcon,
  Map as MapIcon,
  CheckCircle2,
  UploadCloud,
  ArrowRight,
  Loader2,
  MapPinned,
  ChevronRight,
  Zap,
  HelpCircle,
  FileSearch,
  Activity,
  Layers,
  Search,
  Palette,
  TrendingUp,
  Clock,
  MapPinOff,
  Filter,
  Hammer,
  ClipboardList
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import * as XLSX from 'xlsx';

// --- Types ---
interface ExcelRow {
  id: string;
  project_name: string;
  year: number;
  month: number;
  progress: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  designer: string;
  constructor: string;
  product_name: string;
  quantity: number;
  spec_amount: number;
  isGeocoded?: boolean;
}

interface GroupedProject {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  designer: string;
  constructor: string;
  progress: string;
  specs: { product: string; quantity: number; amount: number }[];
  totalAmount: number;
}

const defaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

// 지도 중심 이동 컴포넌트
const ChangeView = ({ center, zoom }: { center: [number, number], zoom?: number }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom || map.getZoom());
  }, [center, zoom, map]);
  return null;
};

// --- 유틸리티 함수 ---
const normalizeKey = (key: string) => key.toString().toLowerCase().replace(/[^a-z0-9가-힣]/g, '');

const getVal = (row: any, aliases: string[]) => {
  const rowKeys = Object.keys(row);
  const normalizedAliases = aliases.map(normalizeKey);
  
  const foundKey = rowKeys.find(k => {
    const nk = normalizeKey(k);
    return normalizedAliases.includes(nk);
  });
  
  return foundKey ? row[foundKey] : undefined;
};

const parseNum = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val).replace(/[^0-9.]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
};

const geocodeAddress = async (address: string): Promise<{lat: number, lon: number} | null> => {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`, {
      headers: {
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.error("Geocoding error:", address, e);
  }
  return null;
};

// --- 트렌드 차트 컴포넌트 ---
const MiniBarChart = ({ data, color, title, labelSuffix = "" }: { data: { label: string, value: number }[], color: string, title: string, labelSuffix?: string }) => {
  const maxValue = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="bg-white rounded-2xl p-4 border border-slate-100 flex flex-col h-full min-h-[170px] shadow-sm overflow-visible">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</h4>
      </div>
      <div className="flex-1 flex items-end gap-1.5 pb-2 pt-10 relative">
        {data.map((d, i) => {
          const barHeight = (d.value / maxValue) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center group relative h-full justify-end">
              <div 
                className="absolute text-[9px] font-black text-slate-700 whitespace-nowrap px-1 rounded-md bg-white/90 transition-all duration-300 pointer-events-none z-10 border border-slate-100/50 shadow-sm"
                style={{ bottom: `calc(${barHeight}% + 6px)` }}
              >
                {d.value > 0 ? `${d.value.toLocaleString()}${labelSuffix}` : ""}
              </div>
              
              <div 
                className={`w-full rounded-t-sm transition-all duration-500 hover:brightness-90 cursor-default shadow-sm border-x border-t border-white/20`}
                style={{ height: `${barHeight}%`, backgroundColor: color }}
              >
              </div>
              <span className="text-[8px] font-bold text-slate-400 mt-1.5 truncate w-full text-center leading-tight">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const App = () => {
  const [data, setData] = useState<ExcelRow[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(0);
  const [selectedMonth, setSelectedMonth] = useState<number>(0);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<GroupedProject | null>(null);
  const [hoveredProject, setHoveredProject] = useState<GroupedProject | null>(null);
  const [activeTab, setActiveTab] = useState<'progress' | 'info' | 'spec'>('progress');
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [listStatusFilter, setListStatusFilter] = useState<'all' | 'mapped' | 'missing'>('all');
  const [baselineDate, setBaselineDate] = useState<string>("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const now = new Date();
    const formatted = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setBaselineDate(formatted);
  }, [data]);

  const stats = useMemo(() => {
    const years = Array.from(new Set(data.map(d => d.year))).sort((a: number, b: number) => a - b);
    return { years };
  }, [data]);

  const availableMonths = useMemo(() => {
    const relevantData = selectedYear === 0 ? data : data.filter(d => d.year === selectedYear);
    return Array.from(new Set(relevantData.map(d => d.month))).sort((a: number, b: number) => a - b);
  }, [data, selectedYear]);

  const filteredData = useMemo(() => {
    return data.filter(d => {
      const yearMatch = selectedYear === 0 || d.year === selectedYear;
      const monthMatch = selectedMonth === 0 || d.month === selectedMonth;
      return yearMatch && monthMatch;
    });
  }, [data, selectedYear, selectedMonth]);

  const listData = useMemo(() => {
    if (listStatusFilter === 'all') return filteredData;
    if (listStatusFilter === 'mapped') return filteredData.filter(d => d.latitude && d.longitude);
    if (listStatusFilter === 'missing') return filteredData.filter(d => !d.latitude || !d.longitude);
    return filteredData;
  }, [filteredData, listStatusFilter]);

  const summary = useMemo(() => {
    const uniqueProjects = new Set(filteredData.map(d => d.project_name));
    const totalSpec = filteredData.reduce((sum: number, d: ExcelRow) => sum + (Number(d.spec_amount) || 0), 0);
    const consMap: Record<string, number> = {};
    const desMap: Record<string, number> = {};

    filteredData.forEach(d => {
      const c = d.constructor && d.constructor !== '-' ? d.constructor : '기타';
      const ds = d.designer && d.designer !== '-' ? d.designer : '기타';
      consMap[c] = (consMap[c] || 0) + (Number(d.spec_amount) || 0);
      desMap[ds] = (desMap[ds] || 0) + (Number(d.spec_amount) || 0);
    });
    
    const top3Cons = Object.entries(consMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount }));
    const top3Des = Object.entries(desMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount }));

    return { siteCount: uniqueProjects.size, totalSpec, top3Cons, top3Des };
  }, [filteredData]);

  const trends = useMemo(() => {
    const yearTrendMap: Record<number, number> = {};
    data.forEach(d => { yearTrendMap[d.year] = (yearTrendMap[d.year] || 0) + d.spec_amount; });
    const yearTrend = Object.entries(yearTrendMap).sort((a, b) => Number(a[0]) - Number(b[0])).map(([l, v]) => ({ label: `${l}년`, value: v }));

    const monthTrendMap: Record<number, number> = {};
    const yr = selectedYear === 0 ? (stats.years[stats.years.length-1] || 0) : selectedYear;
    data.filter(d => d.year === yr).forEach(d => { monthTrendMap[d.month] = (monthTrendMap[d.month] || 0) + d.spec_amount; });
    const monthTrend = Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1}월`, value: monthTrendMap[i + 1] || 0 }));

    const dMap: Record<string, number> = {};
    filteredData.forEach(d => { 
      const name = d.designer && d.designer !== '-' ? d.designer : '기타';
      dMap[name] = (dMap[name] || 0) + d.spec_amount; 
    });
    const designerTrend = Object.entries(dMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([l, v]) => ({ label: l, value: v }));

    return { yearTrend, monthTrend, designerTrend };
  }, [data, filteredData, selectedYear, stats.years]);

  const groupedProjects = useMemo(() => {
    const groups: Record<string, GroupedProject> = {};
    filteredData.forEach(d => {
      if (!groups[d.project_name]) {
        groups[d.project_name] = {
          name: d.project_name, address: d.address, latitude: d.latitude, longitude: d.longitude,
          designer: d.designer, constructor: d.constructor, progress: d.progress, specs: [], totalAmount: 0
        };
      }
      groups[d.project_name].specs.push({ product: d.product_name, quantity: d.quantity, amount: d.spec_amount });
      groups[d.project_name].totalAmount += d.spec_amount;
    });
    return Object.values(groups);
  }, [filteredData]);

  const projectsWithNoCoords = useMemo(() => {
    return groupedProjects.filter(p => !p.latitude || !p.longitude);
  }, [groupedProjects]);

  const processAndSaveData = async (rawData: ExcelRow[]) => {
    setIsProcessing(true);
    setLoadingStatus("데이터 분석 중...");
    setProgress(5);
    const rowsToGeocode = rawData.filter(d => (!d.latitude || !d.longitude) && d.address && d.address !== '-' && d.address.length > 5);
    if (rowsToGeocode.length === 0) {
      setData(rawData);
      setProgress(100);
      setTimeout(() => setIsProcessing(false), 500);
      return;
    }
    const uniqueAddresses = Array.from(new Set(rowsToGeocode.map(d => d.address)));
    const geoCache: Record<string, {lat: number, lon: number}> = {};
    for (let i = 0; i < uniqueAddresses.length; i++) {
      const addr = uniqueAddresses[i];
      setLoadingStatus(`주소를 지도 좌표로 변환 중... (${i + 1}/${uniqueAddresses.length})`);
      setProgress(Math.round((i / uniqueAddresses.length) * 90) + 5);
      const coords = await geocodeAddress(addr);
      if (coords) geoCache[addr] = coords;
      await new Promise(r => setTimeout(r, 1100));
    }
    const finalData = rawData.map(d => {
      if ((!d.latitude || !d.longitude) && geoCache[d.address]) {
        return { ...d, latitude: geoCache[d.address].lat, longitude: geoCache[d.address].lon };
      }
      return d;
    });
    setData(finalData);
    setLoadingStatus("완료되었습니다.");
    setProgress(100);
    setTimeout(() => setIsProcessing(false), 800);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const b = evt.target?.result;
        const wb = XLSX.read(b, { type: 'array' });
        const json: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
        const parsed: ExcelRow[] = json.map((row, idx) => ({
          id: `row-${idx}`,
          project_name: String(getVal(row, ['project_name', '프로젝트명', '현장명', 'PJT', 'project']) || ''),
          year: parseNum(getVal(row, ['year', '연도', '년', '년도'])),
          month: parseNum(getVal(row, ['month', '월'])),
          progress: String(getVal(row, ['progress', '진행내용', '상태', 'status']) || '-'),
          address: String(getVal(row, ['address', '주소', '상세주소', 'addr']) || '-'),
          latitude: parseFloat(String(getVal(row, ['latitude', '위도', 'lat', 'y', 'latitude_val']) || '')) || null,
          longitude: parseFloat(String(getVal(row, ['longitude', '경도', 'lng', 'long', 'x', 'longitude_val']) || '')) || null,
          designer: String(getVal(row, ['designer', '설계사', '설계']) || '-'),
          constructor: String(getVal(row, ['constructor', '건설사', '시공사', '시공']) || '-'),
          product_name: String(getVal(row, ['product_name', '제품명', '품명']) || '-'),
          quantity: parseNum(getVal(row, ['quantity', '물량', '수량'])),
          spec_amount: parseNum(getVal(row, ['spec_amount', '스펙량', '스펙', '합계', 'amount'])),
        })).filter(r => r.project_name);
        processAndSaveData(parsed);
      } catch (err) {
        console.error("Excel processing error", err);
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="min-h-screen flex flex-col h-screen overflow-hidden bg-[#f0f4f8]">
      {isProcessing && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[5000] flex flex-col items-center justify-center p-8 animate-in fade-in duration-300">
          <div className="max-w-lg w-full">
            <div className="flex justify-center mb-8">
              <div className="bg-indigo-500/20 p-6 rounded-3xl border border-indigo-500/30">
                <Activity className="w-12 h-12 text-indigo-400 animate-pulse" />
              </div>
            </div>
            <h2 className="text-3xl font-black text-white text-center mb-4 tracking-tighter">데이터 처리 중</h2>
            <p className="text-slate-400 text-center mb-12 font-medium">{loadingStatus}</p>
            <div className="overflow-hidden h-4 mb-4 text-xs flex rounded-full bg-slate-800 border border-slate-700">
              <div style={{ width: `${progress}%` }} className="flex flex-col text-center whitespace-nowrap text-white justify-center bg-indigo-600 transition-all duration-500 rounded-full"></div>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between z-30 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 p-2.5 rounded-xl shadow-lg">
            <LayoutDashboard className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight">DC Spec Dashboard <span className="text-indigo-600 ml-1">v1.2</span></h1>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner">
            <select className="bg-transparent text-xs font-black focus:outline-none text-slate-700 cursor-pointer px-3 py-1.5" value={selectedYear} onChange={(e) => setSelectedYear(Number(e.target.value))}>
              <option value={0}>연도 전체</option>
              {stats.years.map(y => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select className="bg-transparent text-xs font-black focus:outline-none text-slate-700 cursor-pointer px-3 py-1.5 border-l border-slate-200" value={selectedMonth} onChange={(e) => setSelectedMonth(Number(e.target.value))}>
              <option value={0}>월 전체</option>
              {availableMonths.map(m => <option key={m} value={m}>{m}월</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 text-slate-400 font-bold text-[10px] bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm">
            <Clock className="w-3.5 h-3.5" />
            데이터 기준일: <span className="text-slate-600">{baselineDate || 'YYYY.MM.DD HH:mm'}</span>
          </div>
          <label className="cursor-pointer bg-slate-900 hover:bg-black text-white px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-lg active:scale-95 group">
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> 데이터 업로드
            <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
          </label>
        </div>
      </header>

      {/* MAIN BODY */}
      <main className="flex-1 p-8 flex flex-col gap-6 overflow-hidden min-h-0">
        <div className="grid grid-cols-4 gap-6 shrink-0">
          {[
            { label: "스펙 현장 수", val: summary.siteCount, unit: "개소", icon: Building2, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "총 스펙 집계", val: summary.totalSpec.toLocaleString(), unit: "Ton", icon: HardDrive, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "리딩 시공사", val: summary.top3Cons[0]?.name || "-", unit: `${(summary.top3Cons[0]?.amount || 0).toLocaleString()}T`, icon: Trophy, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "리딩 설계사", val: summary.top3Des[0]?.name || "-", unit: `${(summary.top3Des[0]?.amount || 0).toLocaleString()}T`, icon: Palette, color: "text-indigo-600", bg: "bg-indigo-50" }
          ].map((k, i) => (
            <div key={i} className="bg-white rounded-[1.5rem] p-6 flex items-center gap-5 shadow-sm border border-slate-100">
              <div className={`${k.bg} p-4 rounded-2xl ${k.color}`}><k.icon className="w-7 h-7" /></div>
              <div className="flex-1 overflow-hidden">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{k.label}</p>
                <div className="flex items-baseline gap-1.5 overflow-hidden">
                  <span className="text-2xl font-black text-slate-800 truncate">{k.val}</span>
                  <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{k.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex-1 flex gap-6 min-h-0">
          <div className="flex-[3] bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden relative flex flex-col min-w-0">
            <div className="absolute top-5 left-5 z-[1001] flex bg-white/90 backdrop-blur border border-slate-200 rounded-xl p-1 shadow-xl">
              <button onClick={() => setViewMode('map')} className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${viewMode === 'map' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>지도</button>
              <button onClick={() => setViewMode('list')} className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all ${viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>목록</button>
            </div>

            {viewMode === 'list' && (
              <div className="absolute top-5 right-5 z-[1001] flex bg-white/90 backdrop-blur border border-slate-200 rounded-xl p-1 shadow-xl">
                <button onClick={() => setListStatusFilter('all')} className={`px-3 py-1.5 rounded-lg text-[9px] font-black transition-all ${listStatusFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>전체</button>
                <button onClick={() => setListStatusFilter('mapped')} className={`px-3 py-1.5 rounded-lg text-[9px] font-black transition-all ${listStatusFilter === 'mapped' ? 'bg-emerald-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>지도표시</button>
                <button onClick={() => setListStatusFilter('missing')} className={`px-3 py-1.5 rounded-lg text-[9px] font-black transition-all ${listStatusFilter === 'missing' ? 'bg-amber-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}>좌표누락 ({projectsWithNoCoords.length})</button>
              </div>
            )}

            {viewMode === 'map' ? (
              <div className="relative w-full h-full">
                <MapContainer center={[36.5, 127.5]} zoom={7} className="w-full h-full" zoomControl={false}>
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  {groupedProjects.filter(p => p.latitude && p.longitude).map((p, i) => (
                    <Marker 
                      key={i} 
                      position={[p.latitude!, p.longitude!]} 
                      icon={defaultIcon} 
                      eventHandlers={{ 
                        click: () => { setSelectedProject(p); setIsPanelOpen(true); },
                        mouseover: () => setHoveredProject(p),
                        mouseout: () => setHoveredProject(null)
                      }}
                    >
                    </Marker>
                  ))}
                  {selectedProject?.latitude && selectedProject?.longitude && (
                    <ChangeView center={[selectedProject.latitude, selectedProject.longitude]} zoom={11} />
                  )}
                </MapContainer>

                {/* HOVER CARD - 진행상황 배지가 제목 옆으로 이동 */}
                {hoveredProject && (
                  <div className="absolute top-5 right-5 z-[1001] w-72 bg-white/95 backdrop-blur-xl border border-slate-200 rounded-[2rem] shadow-2xl p-6 animate-in fade-in zoom-in-95 duration-200 pointer-events-none">
                    <div className="flex items-start gap-3 mb-4">
                      <div className="bg-slate-900 p-2 rounded-xl shrink-0 mt-0.5"><Building2 className="w-4 h-4 text-white" /></div>
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-black text-slate-800 truncate max-w-[150px] leading-tight">{hoveredProject.name}</h3>
                          <span className="px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[8px] font-black border border-indigo-100 whitespace-nowrap">
                            {hoveredProject.progress}
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Palette className="w-3 h-3" /> 설계사</span>
                        <span className="text-[10px] font-bold text-slate-700">{hoveredProject.designer}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><Hammer className="w-3 h-3" /> 시공사</span>
                        <span className="text-[10px] font-bold text-slate-700">{hoveredProject.constructor}</span>
                      </div>
                      <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-1">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">총 스펙량</span>
                        <span className="text-sm font-black text-slate-900">{hoveredProject.totalAmount.toLocaleString()} <span className="text-[9px] text-slate-400">Ton</span></span>
                      </div>
                    </div>
                  </div>
                )}
                
                {projectsWithNoCoords.length > 0 && (
                  <div className="absolute bottom-5 left-5 z-[1001] bg-amber-50 border border-amber-200 rounded-2xl p-4 shadow-xl max-w-xs animate-in slide-in-from-bottom-2">
                    <div className="flex items-start gap-3">
                      <div className="bg-amber-100 p-2 rounded-xl text-amber-600"><MapPinOff className="w-4 h-4" /></div>
                      <div>
                        <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1">지도 미표시 알림</p>
                        <p className="text-[11px] font-medium text-amber-700 leading-relaxed">
                          주소가 정확하지 않아 <span className="font-black">{projectsWithNoCoords.length}개</span> 현장을 지도에 표시하지 못했습니다.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex-1 overflow-auto p-6 pt-20 custom-scrollbar">
                <table className="w-full text-left border-separate border-spacing-0">
                  <thead className="sticky top-0 bg-white z-20">
                    <tr>
                      <th className="py-4 px-4 text-[9px] font-black text-slate-400 uppercase border-b border-slate-100 bg-white">현장명</th>
                      <th className="py-4 px-4 text-[9px] font-black text-slate-400 uppercase border-b border-slate-100 bg-white">건설사</th>
                      <th className="py-4 px-4 text-[9px] font-black text-slate-400 uppercase border-b border-slate-100 bg-white">설계사</th>
                      <th className="py-4 px-4 text-[9px] font-black text-slate-400 uppercase text-center border-b border-slate-100 bg-white">스펙량</th>
                      <th className="py-4 px-4 text-[9px] font-black text-slate-400 uppercase text-center border-b border-slate-100 bg-white">좌표 상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listData.length > 0 ? listData.map((d, i) => {
                      const hasCoords = d.latitude && d.longitude;
                      return (
                        <tr key={i} className={`hover:bg-slate-50 group cursor-pointer ${!hasCoords ? 'bg-amber-50/20' : ''}`} onClick={() => { const p = groupedProjects.find(gp => gp.name === d.project_name); if(p) {setSelectedProject(p); setIsPanelOpen(true);} }}>
                          <td className="py-4 px-4 text-xs font-black text-slate-700">{d.project_name}</td>
                          <td className="py-4 px-4 text-xs text-slate-500">{d.constructor}</td>
                          <td className="py-4 px-4 text-xs text-slate-500">{d.designer}</td>
                          <td className="py-4 px-4 text-xs font-mono font-bold text-indigo-600 text-center">{d.spec_amount.toLocaleString()}</td>
                          <td className="py-4 px-4 text-center">
                            {hasCoords ? (
                              <span className="text-[8px] font-black text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 uppercase tracking-tighter">MAPPED</span>
                            ) : (
                              <span className="text-[8px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 uppercase tracking-tighter">MISSING COORDS</span>
                            )}
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan={5} className="py-20 text-center">
                          <div className="flex flex-col items-center gap-3">
                            <SearchX className="w-10 h-10 text-slate-200" />
                            <p className="text-sm font-bold text-slate-400">데이터가 없습니다.</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="flex-[1.5] flex flex-col gap-4 min-w-[280px]">
            <MiniBarChart title="연도별 설계물량 추이" data={trends.yearTrend} color="#6366f1" labelSuffix="T" />
            <MiniBarChart title="월별 설계물량 추이" data={trends.monthTrend} color="#10b981" labelSuffix="T" />
            <MiniBarChart title="설계사별 설계물량 추이" data={trends.designerTrend} color="#ec4899" labelSuffix="T" />
          </div>

          <div className="flex-[1] flex flex-col gap-4 min-w-[240px]">
            <div className="bg-white rounded-2xl p-5 border border-slate-100 flex-1 flex flex-col shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <BarChart3 className="w-3.5 h-3.5 text-amber-500" /> 시공사 순위
              </h3>
              <div className="flex-1 overflow-auto space-y-4 custom-scrollbar pr-1">
                {summary.top3Cons.length > 0 ? summary.top3Cons.map((c, i) => (
                  <div key={i} className="group">
                    <div className="flex justify-between text-[11px] mb-1.5 font-bold">
                      <span className="text-slate-700 truncate mr-2">{i+1}. {c.name}</span>
                      <span className="text-amber-600 shrink-0">{c.amount.toLocaleString()}T</span>
                    </div>
                    <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100 shadow-inner">
                      <div className="h-full bg-amber-500 rounded-full transition-all duration-700" style={{ width: `${(c.amount / (summary.top3Cons[0]?.amount || 1)) * 100}%` }} />
                    </div>
                  </div>
                )) : <div className="text-[10px] text-slate-400 text-center py-4">No Data Available</div>}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-slate-100 flex-1 flex flex-col shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Palette className="w-3.5 h-3.5 text-indigo-500" /> 설계사 순위
              </h3>
              <div className="flex-1 overflow-auto space-y-4 custom-scrollbar pr-1">
                {summary.top3Des.length > 0 ? summary.top3Des.map((d, i) => (
                  <div key={i} className="group">
                    <div className="flex justify-between text-[11px] mb-1.5 font-bold">
                      <span className="text-slate-700 truncate mr-2">{i+1}. {d.name}</span>
                      <span className="text-indigo-600 shrink-0">{d.amount.toLocaleString()}T</span>
                    </div>
                    <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100 shadow-inner">
                      <div className="h-full bg-indigo-500 rounded-full transition-all duration-700" style={{ width: `${(d.amount / (summary.top3Des[0]?.amount || 1)) * 100}%` }} />
                    </div>
                  </div>
                )) : <div className="text-[10px] text-slate-400 text-center py-4">No Data Available</div>}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* SIDE PANEL */}
      {isPanelOpen && selectedProject && (
        <>
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[2000] animate-in fade-in" onClick={() => setIsPanelOpen(false)} />
          <aside className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-[2001] flex flex-col animate-slide-in">
            <style>{`@keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } } .animate-slide-in { animation: slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1); } .custom-scrollbar::-webkit-scrollbar { width: 4px; } .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }`}</style>
            <div className="p-10 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tighter">{selectedProject.name}</h2>
              </div>
              <button onClick={() => setIsPanelOpen(false)} className="p-3 hover:bg-white rounded-xl text-slate-400 hover:text-slate-800 transition-all"><X className="w-6 h-6" /></button>
            </div>
            <div className="flex border-b border-slate-100 px-6">
              {['progress', 'info', 'spec'].map(t => (
                <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-6 text-[10px] font-black uppercase tracking-widest border-b-4 transition-all ${activeTab === t ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                  {t === 'progress' ? '진행현황' : t === 'info' ? '현장정보' : '상세스펙'}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
              {activeTab === 'progress' && <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl p-10 text-center shadow-inner text-xl font-black text-slate-700 italic">" {selectedProject.progress} "</div>}
              {activeTab === 'info' && (
                <div className="space-y-8">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex gap-4 items-center shadow-sm">
                    <MapPin className="w-6 h-6 text-red-500" />
                    <p className="font-black text-slate-800">{selectedProject.address}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-6">
                    <div className="p-6 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Designer</p>
                      <p className="text-md font-black text-slate-800">{selectedProject.designer}</p>
                    </div>
                    <div className="p-6 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Constructor</p>
                      <p className="text-md font-black text-slate-800">{selectedProject.constructor}</p>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'spec' && (
                <div className="space-y-4">
                  {selectedProject.specs.map((s, idx) => (
                    <div key={idx} className="p-6 bg-white border border-slate-100 rounded-2xl flex items-center justify-between shadow-sm hover:border-indigo-200 transition-all">
                      <div className="overflow-hidden">
                        <p className="font-black text-slate-800 truncate">{s.product}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{s.amount.toLocaleString()} Ton</p>
                      </div>
                      <div className="text-right bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 font-black text-lg">{s.quantity} <span className="text-[9px] text-slate-400">UNIT</span></div>
                    </div>
                  ))}
                  <div className="mt-8 p-10 bg-slate-900 rounded-[2.5rem] text-white flex justify-between items-center shadow-2xl">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">TOTAL AGGREGATED</p>
                      <span className="text-5xl font-black">{selectedProject.totalAmount.toLocaleString()}</span>
                      <span className="text-xl font-bold text-indigo-300 ml-2">Ton</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="p-8 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setIsPanelOpen(false)} className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl hover:bg-black transition-all shadow-xl text-xs uppercase tracking-widest">Close Panel</button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
