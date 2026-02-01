
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  BarChart3, 
  MapPin, 
  Building2, 
  X, 
  LayoutDashboard,
  HardDrive,
  FileSpreadsheet,
  Trophy,
  Activity,
  Palette,
  Clock,
  Cloud,
  ShieldCheck,
  User as UserIcon,
  FileText,
  Lock,
  AlertTriangle
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import L from 'leaflet';
import * as XLSX from 'xlsx';

// --- Global declarations for Google APIs ---
declare const google: any;
declare const gapi: any;

/**
 * ⚠️ 실제 구글 연동을 위한 설정값
 * 1. Google Cloud Console에서 발급받은 값을 입력하세요.
 * 2. '승인된 JavaScript 원본'에 현재 접속 중인 주소(Origin)가 등록되어 있어야 합니다.
 */
const CLIENT_ID = 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com';
const API_KEY = 'YOUR_API_KEY_HERE';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';

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

const INITIAL_MOCK_DATA: ExcelRow[] = [
  { id: '1', project_name: '서울 데이터센터 A', year: 2024, month: 5, progress: '납품중', address: '서울특별시 중구 세종대로 110', latitude: 37.5665, longitude: 126.9780, designer: 'A 설계사', constructor: '삼성물산', product_name: '항온항습기', quantity: 20, spec_amount: 500 },
  { id: '2', project_name: '판교 테크노벨리 DC', year: 2024, month: 6, progress: '납품완료', address: '경기도 성남시 분당구 판교역로 166', latitude: 37.3948, longitude: 127.1111, designer: 'B 설계사', constructor: '현대건설', product_name: '랙 시스템', quantity: 150, spec_amount: 1200 },
];

const ChangeView = ({ center, zoom }: { center: [number, number], zoom?: number }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom || map.getZoom());
  }, [center, zoom, map]);
  return null;
};

const normalizeKey = (key: string) => key.toString().toLowerCase().replace(/[^a-z0-9가-힣]/g, '');

const getVal = (row: any, aliases: string[]) => {
  const rowKeys = Object.keys(row);
  const normalizedAliases = aliases.map(normalizeKey);
  const foundKey = rowKeys.find(k => normalizedAliases.includes(normalizeKey(k)));
  return foundKey ? row[foundKey] : undefined;
};

const parseNum = (val: any): number => {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const parsed = parseFloat(String(val).replace(/[^0-9.]/g, ''));
  return isNaN(parsed) ? 0 : parsed;
};

const geocodeAddress = async (address: string): Promise<{lat: number, lon: number} | null> => {
  try {
    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`, {
      headers: { 'Accept-Language': 'ko-KR' }
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (data && data.length > 0) return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
  } catch (e) { console.error("Geocoding error:", address, e); }
  return null;
};

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
              <div className={`w-full rounded-t-sm transition-all duration-500 hover:brightness-90 cursor-default shadow-sm`} style={{ height: `${barHeight}%`, backgroundColor: color }}></div>
              <span className="text-[8px] font-bold text-slate-400 mt-1.5 truncate w-full text-center leading-tight">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const App = () => {
  const [role, setRole] = useState<'user' | 'admin'>('admin');
  const [data, setData] = useState<ExcelRow[]>(INITIAL_MOCK_DATA);
  const [selectedYear, setSelectedYear] = useState<number>(0);
  const [selectedMonth, setSelectedMonth] = useState<number>(0);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<GroupedProject | null>(null);
  const [activeTab, setActiveTab] = useState<'progress' | 'info' | 'spec'>('progress');
  const [baselineDate, setBaselineDate] = useState<string>("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState("");
  const [progressValue, setProgressValue] = useState(0);

  // 구글 연동 상태
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isGapiLoaded, setIsGapiLoaded] = useState(false);
  const tokenClientRef = useRef<any>(null);

  useEffect(() => {
    const now = new Date();
    setBaselineDate(`${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  }, [data]);

  // 구글 SDK 초기화 로직 보강
  useEffect(() => {
    const loadScripts = () => {
      // @ts-ignore
      if (typeof google !== 'undefined' && typeof gapi !== 'undefined') {
        // GAPI 초기화
        gapi.load('client:picker', () => {
          setIsGapiLoaded(true);
          gapi.client.load('drive', 'v3');
        });

        // GIS 초기화
        tokenClientRef.current = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          callback: (resp: any) => {
            if (resp.error) {
              console.error("Auth error:", resp.error);
              setIsProcessing(false);
              return;
            }
            setAccessToken(resp.access_token);
            openPicker(resp.access_token);
          },
        });
      }
    };

    const interval = setInterval(() => {
      if (typeof google !== 'undefined' && typeof gapi !== 'undefined') {
        loadScripts();
        clearInterval(interval);
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  const openPicker = (token: string) => {
    try {
      // @ts-ignore
      const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
        .setMimeTypes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel')
        .setMode(google.picker.DocsViewMode.LIST);
      
      // @ts-ignore
      const picker = new google.picker.PickerBuilder()
        .enableFeature(google.picker.Feature.NAV_HIDDEN)
        .setDeveloperKey(API_KEY)
        .setAppId(CLIENT_ID)
        .setOAuthToken(token)
        .addView(view)
        .setCallback((data: any) => {
          // @ts-ignore
          if (data.action === google.picker.Action.PICKED) {
            const file = data.docs[0];
            downloadAndParseFile(file.id, file.name, token);
          } else if (data.action === google.picker.Action.CANCEL) {
            setIsProcessing(false);
          }
        })
        .build();
      picker.setVisible(true);
    } catch (e) {
      console.error("Picker error:", e);
      alert("Picker를 띄우는 중 오류가 발생했습니다. 구글 콘솔의 API Key 설정을 확인하세요.");
      setIsProcessing(false);
    }
  };

  const downloadAndParseFile = async (fileId: string, fileName: string, token: string) => {
    setIsProcessing(true);
    setLoadingStatus(`'${fileName}' 다운로드 중...`);
    setProgressValue(20);

    try {
      const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) throw new Error('파일 다운로드 실패. 권한을 확인하세요.');
      
      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      setProgressValue(50);
      
      const wb = XLSX.read(arrayBuffer, { type: 'array' });
      const json: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      
      const parsed: ExcelRow[] = json.map((row, idx) => ({
        id: `gd-${idx}-${Date.now()}`,
        project_name: String(getVal(row, ['project_name', '프로젝트명', '현장명']) || '').trim(),
        year: parseNum(getVal(row, ['year', '연도'])),
        month: parseNum(getVal(row, ['month', '월'])),
        progress: String(getVal(row, ['progress', '진행내용', '상태']) || '-').trim(),
        address: String(getVal(row, ['address', '주소', '상세주소']) || '-').trim(),
        latitude: parseFloat(String(getVal(row, ['latitude', '위도']) || '')) || null,
        longitude: parseFloat(String(getVal(row, ['longitude', '경도']) || '')) || null,
        designer: String(getVal(row, ['designer', '설계사']) || '-').trim(),
        constructor: String(getVal(row, ['constructor', '건설사']) || '-').trim(),
        product_name: String(getVal(row, ['product_name', '제품명']) || '-').trim(),
        quantity: parseNum(getVal(row, ['quantity', '물량'])),
        spec_amount: parseNum(getVal(row, ['spec_amount', '스펙량', '합계'])),
      })).filter(r => r.project_name);

      await processAndSaveData(parsed);
    } catch (err: any) {
      alert(`파일 로드 오류: ${err.message}`);
      setIsProcessing(false);
    }
  };

  const handleDriveConnect = useCallback(() => {
    if (CLIENT_ID === 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com') {
      alert("먼저 index.tsx 상단의 CLIENT_ID와 API_KEY를 실제 구글 클라우드 콘솔 발급값으로 수정해야 합니다.");
      return;
    }
    
    if (tokenClientRef.current) {
      setIsProcessing(true);
      setLoadingStatus("구글 로그인 팝업 확인 중...");
      // 팝업이 뜨지 않는다면 브라우저의 팝업 차단 설정이나 Origin 설정을 확인해야 합니다.
      tokenClientRef.current.requestAccessToken({ prompt: 'consent' });
    } else {
      alert('구글 API를 불러오지 못했습니다. 인터넷 연결 및 스크립트 로드 상태를 확인하세요.');
    }
  }, []);

  const processAndSaveData = async (rawData: ExcelRow[]) => {
    setIsProcessing(true);
    setLoadingStatus("위치 정보 보정 및 데이터 취합 중...");
    setProgressValue(60);
    const rowsToGeocode = rawData.filter(d => (!d.latitude || !d.longitude) && d.address && d.address.length > 5);
    
    if (rowsToGeocode.length === 0) {
      setData(rawData);
      setProgressValue(100);
      setTimeout(() => setIsProcessing(false), 500);
      return;
    }

    const uniqueAddresses = Array.from(new Set(rowsToGeocode.map(d => d.address)));
    const geoCache: Record<string, {lat: number, lon: number}> = {};
    for (let i = 0; i < uniqueAddresses.length; i++) {
      const addr = uniqueAddresses[i];
      setLoadingStatus(`좌표 변환 중 (${i + 1}/${uniqueAddresses.length})`);
      const coords = await geocodeAddress(addr);
      if (coords) geoCache[addr] = coords;
      await new Promise(r => setTimeout(r, 600)); 
    }

    const finalData = rawData.map(d => {
      if ((!d.latitude || !d.longitude) && geoCache[d.address]) {
        return { ...d, latitude: geoCache[d.address].lat, longitude: geoCache[d.address].lon };
      }
      return d;
    });
    setData(finalData);
    setLoadingStatus("데이터 동기화 완료");
    setProgressValue(100);
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
          id: `row-${idx}-${Date.now()}`,
          project_name: String(getVal(row, ['project_name', '프로젝트명', '현장명']) || '').trim(),
          year: parseNum(getVal(row, ['year', '연도'])),
          month: parseNum(getVal(row, ['month', '월'])),
          progress: String(getVal(row, ['progress', '진행내용', '상태']) || '-').trim(),
          address: String(getVal(row, ['address', '주소', '상세주소']) || '-').trim(),
          latitude: parseFloat(String(getVal(row, ['latitude', '위도']) || '')) || null,
          longitude: parseFloat(String(getVal(row, ['longitude', '경도']) || '')) || null,
          designer: String(getVal(row, ['designer', '설계사']) || '-').trim(),
          constructor: String(getVal(row, ['constructor', '건설사']) || '-').trim(),
          product_name: String(getVal(row, ['product_name', '제품명']) || '-').trim(),
          quantity: parseNum(getVal(row, ['quantity', '물량'])),
          spec_amount: parseNum(getVal(row, ['spec_amount', '스펙량', '합계'])),
        })).filter(r => r.project_name);
        processAndSaveData(parsed);
      } catch (err) {
        console.error(err);
        setIsProcessing(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const filteredData = useMemo(() => {
    return data.filter(d => {
      const matchYear = selectedYear === 0 || d.year === selectedYear;
      const matchMonth = selectedMonth === 0 || d.month === selectedMonth;
      return matchYear && matchMonth;
    });
  }, [data, selectedYear, selectedMonth]);

  const summary = useMemo(() => {
    const uniqueProjects = new Set(filteredData.map(d => d.project_name));
    const totalSpec = filteredData.reduce((sum, d) => sum + (d.spec_amount || 0), 0);
    const consMap: Record<string, number> = {};
    const desMap: Record<string, number> = {};

    filteredData.forEach(d => {
      const c = d.constructor || '기타';
      const ds = d.designer || '기타';
      consMap[c] = (consMap[c] || 0) + (d.spec_amount || 0);
      desMap[ds] = (desMap[ds] || 0) + (d.spec_amount || 0);
    });
    
    const top3Cons = Object.entries(consMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount }));
    const top3Des = Object.entries(desMap).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, amount]) => ({ name, amount }));

    return { siteCount: uniqueProjects.size, totalSpec, top3Cons, top3Des };
  }, [filteredData]);

  const trends = useMemo(() => {
    const years = Array.from(new Set(data.map(d => d.year))).sort((a, b) => a - b);
    const yearTrendMap: Record<number, number> = {};
    data.forEach(d => { yearTrendMap[d.year] = (yearTrendMap[d.year] || 0) + d.spec_amount; });
    const yearTrend = Object.entries(yearTrendMap).map(([l, v]) => ({ label: `${l}년`, value: v }));

    const monthTrendMap: Record<number, number> = {};
    const yr = selectedYear === 0 ? (years[years.length-1] || 0) : selectedYear;
    // Fix line 394: Explicitly cast arithmetic operands to number using Number() to handle potential TypeScript inference issues in complex expressions.
    data.filter(d => d.year === yr).forEach(d => { 
      const currentVal = Number(monthTrendMap[d.month] || 0);
      const newVal = Number(d.spec_amount);
      monthTrendMap[d.month] = currentVal + newVal; 
    });
    const monthTrend = Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1}월`, value: monthTrendMap[i + 1] || 0 }));

    return { yearTrend, monthTrend };
  }, [data, selectedYear]);

  const groupedProjects = useMemo(() => {
    const groups: Record<string, GroupedProject> = {};
    filteredData.forEach(d => {
      const name = d.project_name.trim();
      if (!groups[name]) {
        groups[name] = {
          name: name, address: d.address, latitude: d.latitude, longitude: d.longitude,
          designer: d.designer, constructor: d.constructor, progress: d.progress, specs: [], totalAmount: 0
        };
      }
      groups[name].specs.push({ product: d.product_name, quantity: d.quantity, amount: d.spec_amount });
      groups[name].totalAmount += d.spec_amount;
    });
    return Object.values(groups);
  }, [filteredData]);

  const getStatusClasses = (status: string) => {
    const text = status || '';
    if (text.includes('납품중')) return 'bg-emerald-500 text-white shadow-emerald-200';
    if (text.includes('납품완료')) return 'bg-slate-400 text-white shadow-slate-200';
    if (text.includes('납품확인')) return 'bg-red-500 text-white shadow-red-200';
    return 'bg-indigo-600 text-white shadow-indigo-200';
  };

  return (
    <div className="min-h-screen flex flex-col h-screen overflow-hidden bg-[#f0f4f8]">
      {isProcessing && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[5000] flex flex-col items-center justify-center p-8 animate-in fade-in">
          <div className="max-w-lg w-full">
            <div className="flex justify-center mb-8">
              <Activity className="w-12 h-12 text-indigo-400 animate-pulse" />
            </div>
            <h2 className="text-3xl font-black text-white text-center mb-4">{loadingStatus}</h2>
            <div className="overflow-hidden h-4 mb-4 flex rounded-full bg-slate-800">
              <div style={{ width: `${progressValue}%` }} className="bg-indigo-600 transition-all duration-300 rounded-full"></div>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between z-30 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 p-2.5 rounded-xl shadow-lg">
            <LayoutDashboard className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight">DC Spec Dashboard <span className="text-indigo-600 ml-1">v1.2</span></h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase ${role === 'admin' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                {role === 'admin' ? 'Administrator' : 'General User'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button onClick={() => setRole('user')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black transition-all ${role === 'user' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-400 hover:text-slate-600'}`}>
              <UserIcon className="w-3 h-3" /> 사용자
            </button>
            <button onClick={() => setRole('admin')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[9px] font-black transition-all ${role === 'admin' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <ShieldCheck className="w-3 h-3" /> 관리자
            </button>
          </div>

          {role === 'admin' && (
            <div className="flex items-center gap-2">
              <button 
                onClick={handleDriveConnect}
                className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all border shadow-sm ${accessToken ? 'bg-blue-50 text-blue-600 border-blue-200' : 'bg-blue-600 text-white border-blue-700 hover:bg-blue-700'}`}
              >
                <Cloud className="w-4 h-4" />
                {accessToken ? '파일 탐색기 열기' : '구글 드라이브 연결'}
              </button>
              <label className="cursor-pointer bg-slate-900 hover:bg-black text-white px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 transition-all shadow-lg active:scale-95 group">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> 로컬 엑셀 업로드
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
          )}
        </div>
      </header>

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

        {CLIENT_ID.startsWith('YOUR') && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 text-amber-800">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <p className="text-xs font-medium">현재 <strong>CLIENT_ID</strong>와 <strong>API_KEY</strong>가 설정되지 않았습니다. 구글 드라이브 기능을 사용하려면 index.tsx의 상수값을 본인의 구글 클라우드 콘솔 발급값으로 수정해야 합니다.</p>
          </div>
        )}

        <div className="flex-1 flex gap-6 min-h-0">
          <div className="flex-[3] bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden relative flex flex-col min-w-0">
            <MapContainer center={[36.5, 127.5]} zoom={7} className="w-full h-full" zoomControl={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {groupedProjects.filter(p => p.latitude && p.longitude).map((p, i) => (
                <Marker 
                  key={i} 
                  position={[p.latitude!, p.longitude!]} 
                  icon={defaultIcon} 
                  eventHandlers={{ click: () => { setSelectedProject(p); setIsPanelOpen(true); }}}
                />
              ))}
              {selectedProject?.latitude && <ChangeView center={[selectedProject.latitude, selectedProject.longitude]} zoom={11} />}
            </MapContainer>
          </div>

          <div className="flex-[1.5] flex flex-col gap-4 min-w-[280px]">
            <MiniBarChart title="연도별 설계물량 추이" data={trends.yearTrend} color="#6366f1" labelSuffix="T" />
            <MiniBarChart title="월별 설계물량 추이" data={trends.monthTrend} color="#10b981" labelSuffix="T" />
          </div>
        </div>
      </main>

      {isPanelOpen && selectedProject && (
        <>
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[2000] animate-in fade-in" onClick={() => setIsPanelOpen(false)} />
          <aside className="fixed right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl z-[2001] flex flex-col animate-slide-in">
            <style>{`@keyframes slide-in { from { transform: translateX(100%); } to { transform: translateX(0); } } .animate-slide-in { animation: slide-in 0.4s cubic-bezier(0.16, 1, 0.3, 1); }`}</style>
            <div className="p-10 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h2 className="text-2xl font-black text-slate-800 tracking-tighter">{selectedProject.name}</h2>
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
              {activeTab === 'progress' && <div className={`border-2 border-dashed rounded-3xl p-10 text-center shadow-inner text-xl font-black italic ${getStatusClasses(selectedProject.progress)}`}>" {selectedProject.progress || '정보 없음'} "</div>}
              {activeTab === 'info' && (
                <div className="space-y-8">
                  <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 flex gap-4 items-center">
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
                    <div key={idx} className="p-6 bg-white border border-slate-100 rounded-2xl flex items-center justify-between shadow-sm">
                      <div>
                        <p className="font-black text-slate-800">{s.product}</p>
                        <p className="text-[9px] font-bold text-slate-400 uppercase">{s.amount.toLocaleString()} Ton</p>
                      </div>
                      <div className="text-right bg-slate-50 px-4 py-2 rounded-xl font-black text-lg">{s.quantity} <span className="text-[9px] text-slate-400">UNIT</span></div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </aside>
        </>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
