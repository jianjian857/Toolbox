
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import JSZip from 'jszip';
import saveAs from 'file-saver';
import { Upload, X, FileImage, Settings, Play, Download, AlertCircle, CheckCircle, RefreshCcw, MessageSquare, Loader2, Image as ImageIcon, RotateCw, Ratio, PaintBucket, Languages, Eye, GripVertical, Layers, Palette } from 'lucide-react';
import { ImageFormat, ProcessingConfig, UploadedFile, ProcessSummary, Language, WatermarkPosition, WatermarkMode, WatermarkColorMode } from './types';
import { extractImagesFromZip, processImage, packageZip } from './services/imageProcessor';
import AssistantPanel from './components/AssistantPanel';
import { translations } from './translations';

const App: React.FC = () => {
  // State
  const [language, setLanguage] = useState<Language>('zh');
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [config, setConfig] = useState<ProcessingConfig>({
    keepOriginalSize: false,
    aspectRatio: 'custom',
    width: 800,
    height: 600,
    format: ImageFormat.JPG,
    quality: 0.85,
    fillBackground: false,
    watermarkEnabled: false,
    watermarkImageUrl: null,
    watermarkOpacity: 0.8,
    watermarkScale: 20, 
    watermarkRotation: 0,
    watermarkPosition: 'bottom-right',
    watermarkMode: 'single',
    watermarkColorMode: 'original',
    customX: 50,
    customY: 50
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [summary, setSummary] = useState<ProcessSummary | null>(null);
  const [isAssistantOpen, setIsAssistantOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [isPreviewDragging, setIsPreviewDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const t = translations[language];

  // Helper to get first available image for preview
  const firstImagePreview = useMemo(() => {
    return files.length > 0 ? files[0].previewUrl : null;
  }, [files]);

  // Aspect Ratio Definitions
  const aspectRatios = [
    { label: t.arCustom, value: 'custom', ratio: 0 },
    { label: t.arSquare, value: '1:1', ratio: 1 },
    { label: t.arStandard, value: '4:3', ratio: 4/3 },
    { label: t.arPortrait, value: '3:4', ratio: 3/4 },
    { label: t.arWidescreen, value: '16:9', ratio: 16/9 },
    { label: t.arStory, value: '9:16', ratio: 9/16 },
    { label: t.arSocial, value: '4:5', ratio: 4/5 },
    { label: t.arClassic, value: '2:3', ratio: 2/3 },
    { label: t.arLandscape, value: '3:2', ratio: 3/2 },
  ];

  const handleRatioChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRatioValue = e.target.value;
    const selectedRatio = aspectRatios.find(r => r.value === newRatioValue);
    if (selectedRatio && selectedRatio.value !== 'custom') {
      const newHeight = Math.round(config.width / selectedRatio.ratio);
      setConfig(prev => ({ ...prev, aspectRatio: newRatioValue, height: newHeight }));
    } else {
      setConfig(prev => ({ ...prev, aspectRatio: 'custom' }));
    }
  };

  const handleWidthChange = (val: number) => {
    const safeVal = Math.max(1, val);
    if (config.aspectRatio !== 'custom') {
      const selectedRatio = aspectRatios.find(r => r.value === config.aspectRatio);
      if (selectedRatio) {
        const newHeight = Math.round(safeVal / selectedRatio.ratio);
        setConfig(prev => ({ ...prev, width: safeVal, height: newHeight }));
        return;
      }
    }
    setConfig(prev => ({ ...prev, width: safeVal }));
  };

  const handleHeightChange = (val: number) => {
    const safeVal = Math.max(1, val);
    if (config.aspectRatio !== 'custom') {
      const selectedRatio = aspectRatios.find(r => r.value === config.aspectRatio);
      if (selectedRatio) {
        const newWidth = Math.round(safeVal * selectedRatio.ratio);
        setConfig(prev => ({ ...prev, height: safeVal, width: newWidth }));
        return;
      }
    }
    setConfig(prev => ({ ...prev, height: safeVal }));
  };

  const clearAll = useCallback(() => {
    files.forEach(f => {
      if (f.previewUrl) {
        URL.revokeObjectURL(f.previewUrl);
      }
    });
    setFiles([]);
    setSummary(null);
    setProgress(0);
  }, [files]);

  const processFiles = async (fileList: File[]) => {
    const newFiles: UploadedFile[] = [];
    for (const file of fileList) {
      if (file.type === 'application/zip' || file.type === 'application/x-zip-compressed' || file.name.endsWith('.zip')) {
        try {
          const extracted = await extractImagesFromZip(file);
          extracted.forEach(img => {
            newFiles.push({ id: Math.random().toString(36).substr(2, 9), file: img, originalName: img.name, previewUrl: URL.createObjectURL(img), status: 'pending' });
          });
        } catch (err) { alert(`Failed to parse ZIP: ${file.name}`); }
      } else if (file.type.startsWith('image/')) {
        newFiles.push({ id: Math.random().toString(36).substr(2, 9), file: file, originalName: file.name, previewUrl: URL.createObjectURL(file), status: 'pending' });
      }
    }
    setFiles(prev => [...prev, ...newFiles]);
    setSummary(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) processFiles(Array.from(e.dataTransfer.files));
  };

  const handleWatermarkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (ev) => { if (ev.target?.result) setConfig(prev => ({ ...prev, watermarkImageUrl: ev.target!.result as string })); };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const startProcessing = async () => {
    if (files.length === 0) return;
    setIsProcessing(true); setProgress(0); setSummary(null);
    const updatedFiles = [...files];
    let successCount = 0; let failCount = 0;
    for (let i = 0; i < updatedFiles.length; i++) {
      updatedFiles[i] = { ...updatedFiles[i], status: 'processing' }; setFiles([...updatedFiles]);
      try {
        const blob = await processImage(updatedFiles[i], config);
        updatedFiles[i] = { ...updatedFiles[i], status: 'success', processedBlob: blob };
        successCount++;
      } catch (error) { updatedFiles[i] = { ...updatedFiles[i], status: 'error', errorMessage: 'Conversion failed' }; failCount++; }
      setProgress(Math.round(((i + 1) / updatedFiles.length) * 100)); setFiles([...updatedFiles]);
    }
    if (successCount > 0) {
      try {
        const successfulFiles = updatedFiles.filter(f => f.status === 'success' && f.processedBlob);
        if (successfulFiles.length === 1) {
            const f = successfulFiles[0]; const ext = config.format.split('/')[1];
            const baseName = f.originalName.substring(0, f.originalName.lastIndexOf('.')) || f.originalName;
            let fileName = config.keepOriginalSize ? `${baseName}_converted.${ext}` : `${baseName}_${config.width}x${config.height}_converted.${ext}`;
            if (f.processedBlob) saveAs(f.processedBlob, fileName);
            setSummary({ total: updatedFiles.length, success: successCount, failed: failCount, outputZipName: fileName });
        } else {
            const zipBlob = await packageZip(updatedFiles, config);
            const zipName = `converted_images_${Date.now()}.zip`;
            saveAs(zipBlob, zipName);
            setSummary({ total: updatedFiles.length, success: successCount, failed: failCount, outputZipName: zipName });
        }
      } catch (e) { console.error(e); }
    } else { setSummary({ total: updatedFiles.length, success: 0, failed: failCount, outputZipName: '' }); }
    setIsProcessing(false);
  };

  const getWMStyle = (x?: number, y?: number): React.CSSProperties => {
    const style: React.CSSProperties = {
      position: 'absolute',
      opacity: config.watermarkOpacity,
      transform: `translate(-50%, -50%) rotate(${config.watermarkRotation}deg)`,
      width: `${config.watermarkScale}%`,
      transition: isPreviewDragging ? 'none' : 'all 0.2s ease-out',
      pointerEvents: 'none',
      zIndex: 10,
      filter: config.watermarkColorMode === 'grayscale' ? 'grayscale(1)' : 'none'
    };
    style.left = `${x ?? 50}%`;
    style.top = `${y ?? 50}%`;
    return style;
  };

  const renderPreviewWatermarks = () => {
    if (config.watermarkMode === 'tiled') {
      const items = [];
      const step = Math.max(5, config.watermarkScale * 1.5);
      for (let x = -step; x <= 100 + step; x += step) {
        for (let y = -step; y <= 100 + step; y += step) {
          const rowOffset = (Math.floor((y + step) / step) % 2 === 0) ? step / 2 : 0;
          items.push(
            <div key={`${x}-${y}`} style={getWMStyle(x + rowOffset, y)} className="pointer-events-none">
              {config.watermarkImageUrl ? (
                <img src={config.watermarkImageUrl} className="w-full" alt="" />
              ) : (
                <ImageIcon className="w-full h-auto text-indigo-500 bg-indigo-100/30 p-1 rounded border border-white" />
              )}
            </div>
          );
        }
      }
      return items;
    } else if (config.watermarkMode === 'dual') {
      return (
        <>
          <div style={getWMStyle(15, 15)}>{config.watermarkImageUrl ? <img src={config.watermarkImageUrl} className="w-full" alt="" /> : <ImageIcon className="w-full h-auto text-indigo-500" />}</div>
          <div style={getWMStyle(85, 85)}>{config.watermarkImageUrl ? <img src={config.watermarkImageUrl} className="w-full" alt="" /> : <ImageIcon className="w-full h-auto text-indigo-500" />}</div>
        </>
      );
    } else if (config.watermarkMode === 'triple') {
       return (
        <>
          <div style={getWMStyle(15, 15)}>{config.watermarkImageUrl ? <img src={config.watermarkImageUrl} className="w-full" alt="" /> : <ImageIcon className="w-full h-auto text-indigo-500" />}</div>
          <div style={getWMStyle(50, 50)}>{config.watermarkImageUrl ? <img src={config.watermarkImageUrl} className="w-full" alt="" /> : <ImageIcon className="w-full h-auto text-indigo-500" />}</div>
          <div style={getWMStyle(85, 85)}>{config.watermarkImageUrl ? <img src={config.watermarkImageUrl} className="w-full" alt="" /> : <ImageIcon className="w-full h-auto text-indigo-500" />}</div>
        </>
      );
    } else {
      let px = 50, py = 50;
      if (config.watermarkPosition === 'custom') {
        px = config.customX; py = config.customY;
      } else {
        switch (config.watermarkPosition) {
          case 'top-left': px = 15; py = 15; break;
          case 'top-right': px = 85; py = 15; break;
          case 'bottom-left': px = 15; py = 85; break;
          case 'bottom-right': px = 85; py = 85; break;
        }
      }
      return (
        <div style={getWMStyle(px, py)} className={`relative ${config.watermarkPosition === 'custom' ? 'pointer-events-auto cursor-grab active:cursor-grabbing' : 'pointer-events-none'}`}>
           {config.watermarkImageUrl ? <img src={config.watermarkImageUrl} className="w-full" alt="" /> : <ImageIcon className="w-full h-auto text-indigo-500 bg-white/50 p-1 rounded shadow-sm border border-white" />}
           {config.watermarkPosition === 'custom' && (
             <div className="absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap bg-black text-white text-[8px] px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                {Math.round(px)}%, {Math.round(py)}%
             </div>
           )}
        </div>
      );
    }
  };

  const handlePreviewDrag = (e: React.MouseEvent | React.TouchEvent) => {
    if (config.watermarkPosition !== 'custom' || config.watermarkMode !== 'single') return;
    const isTouch = 'touches' in e;
    const clientX = isTouch ? e.touches[0].clientX : e.clientX;
    const clientY = isTouch ? e.touches[0].clientY : e.clientY;
    if (!isPreviewDragging && !isTouch && e.type === 'mousedown') {
       setIsPreviewDragging(true);
    } else if (isPreviewDragging || isTouch) {
       const rect = previewContainerRef.current?.getBoundingClientRect();
       if (rect) {
          const x = ((clientX - rect.left) / rect.width) * 100;
          const y = ((clientY - rect.top) / rect.height) * 100;
          setConfig(prev => ({ ...prev, customX: Math.max(0, Math.min(100, x)), customY: Math.max(0, Math.min(100, y)) }));
       }
    }
  };

  useEffect(() => {
    const stopDrag = () => setIsPreviewDragging(false);
    window.addEventListener('mouseup', stopDrag);
    return () => window.removeEventListener('mouseup', stopDrag);
  }, []);

  const getHintMessage = () => {
    let msg = "";
    if (config.keepOriginalSize) {
      msg = t.infoOriginal;
    } else {
      msg = t.infoCustom.replace('{0}', config.width.toString()).replace('{1}', config.height.toString());
    }
    
    // Add fill background hint
    const isFillActive = config.format === ImageFormat.JPG || config.fillBackground;
    if (isFillActive) {
      msg += t.infoFillActive;
    } else {
      msg += t.infoFillInactive;
    }
    
    return msg;
  };

  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden bg-gray-50 text-slate-900">
      <header className="bg-white border-b px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xl">U</div>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 hidden sm:block">{t.appTitle}</h1>
          <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600 sm:hidden">UIC</h1>
        </div>
        <div className="flex items-center space-x-4">
          <button onClick={() => setLanguage(l => l === 'en' ? 'zh' : 'en')} className="flex items-center space-x-1 px-3 py-1.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium transition-colors">
             <Languages className="w-4 h-4" /><span>{language === 'en' ? '中文' : 'English'}</span>
          </button>
          <button onClick={() => setIsAssistantOpen(true)} className="flex items-center space-x-2 text-sm font-medium text-gray-600 hover:text-indigo-600 transition-colors">
            <MessageSquare className="w-4 h-4" /><span className="hidden sm:inline">{t.askAi}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 flex flex-col md:flex-row gap-8">
        <div className="w-full md:w-1/3 flex flex-col gap-6">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center space-x-2 mb-4 text-gray-800">
              <Settings className="w-5 h-5 text-indigo-600" /><h2 className="font-semibold text-lg">{t.targetSettings}</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-200">
                <span className="text-sm font-medium text-gray-700 ml-1">{t.keepOriginal}</span>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" className="sr-only peer" checked={config.keepOriginalSize} onChange={(e) => setConfig({ ...config, keepOriginalSize: e.target.checked })} />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>

              <div className={`space-y-4 transition-opacity duration-200 ${config.keepOriginalSize ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
                <div>
                   <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{t.aspectRatio}</label>
                   <div className="relative">
                      <select value={config.aspectRatio} onChange={handleRatioChange} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none">
                        {aspectRatios.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-500"><Ratio className="w-4 h-4" /></div>
                   </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{t.width}</label>
                    <input type="number" value={config.width} onChange={(e) => handleWidthChange(parseInt(e.target.value) || 0)} className="w-full border border-gray-200 bg-white text-gray-900 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{t.height}</label>
                    <input type="number" value={config.height} onChange={(e) => handleHeightChange(parseInt(e.target.value) || 0)} className="w-full border border-gray-200 bg-white text-gray-900 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">{t.format}</label>
                <select value={config.format} onChange={(e) => setConfig({ ...config, format: e.target.value as ImageFormat })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                  <option value={ImageFormat.JPG}>{t.fmtJpg}</option>
                  <option value={ImageFormat.PNG}>{t.fmtPng}</option>
                  <option value={ImageFormat.WEBP}>{t.fmtWebp}</option>
                </select>
              </div>

              {/* BACKGROUND FILL TOGGLE - Only meaningful for PNG/WEBP as JPEG is always non-transparent */}
              {(config.format === ImageFormat.PNG || config.format === ImageFormat.WEBP) && (
                <div className="flex items-center justify-between bg-white p-2 rounded-lg border border-gray-200">
                  <span className="text-sm font-medium text-gray-700 ml-1">{t.fillBg}</span>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" className="sr-only peer" checked={config.fillBackground} onChange={(e) => setConfig({ ...config, fillBackground: e.target.checked })} />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4 mt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center space-x-2 cursor-pointer group">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${config.watermarkEnabled ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'}`}>
                    {config.watermarkEnabled && <CheckCircle className="w-3 h-3 text-white" />}
                  </div>
                  <input type="checkbox" checked={config.watermarkEnabled} onChange={e => setConfig({...config, watermarkEnabled: e.target.checked})} className="hidden" />
                  <span className="font-semibold text-gray-700 flex items-center"><ImageIcon className="w-4 h-4 mr-2 text-indigo-500" />{t.watermark}</span>
                </label>
              </div>

              {config.watermarkEnabled && (
                <div className="space-y-4 animate-fade-in pl-1">
                  <div 
                    ref={previewContainerRef}
                    onMouseDown={handlePreviewDrag}
                    onMouseMove={handlePreviewDrag}
                    onTouchMove={handlePreviewDrag}
                    className="relative aspect-video bg-gray-900/5 rounded-xl overflow-hidden border-2 border-dashed border-gray-200 shadow-inner group"
                  >
                    <div className="absolute inset-0 opacity-10 pointer-events-none bg-[radial-gradient(#000_1px,transparent_1px)] [background-size:10px_10px]"></div>
                    {firstImagePreview ? <img src={firstImagePreview} className="w-full h-full object-contain" alt="" /> : <div className="w-full h-full flex flex-col items-center justify-center text-gray-400"><ImageIcon className="w-8 h-8 mb-1 opacity-20" /><span className="text-[10px]">Placeholder</span></div>}
                    {renderPreviewWatermarks()}
                    <div className="absolute top-2 left-2 bg-white/80 backdrop-blur-md px-2 py-0.5 rounded text-[10px] text-indigo-600 font-bold border border-indigo-100 flex items-center">
                      <Eye className="w-3 h-3 mr-1" /> {t.watermarkPreview}
                    </div>
                    {config.watermarkPosition === 'custom' && config.watermarkMode === 'single' && (
                       <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[9px] px-2 py-0.5 rounded-full shadow-lg animate-pulse">
                          {t.dragHint}
                       </div>
                    )}
                  </div>

                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                       <div>
                          <label className="block text-xs text-gray-500 mb-1 flex items-center"><Layers className="w-3 h-3 mr-1" /> {t.watermarkMode}</label>
                          <select 
                            value={config.watermarkMode} 
                            onChange={e => setConfig(prev => ({ ...prev, watermarkMode: e.target.value as WatermarkMode }))}
                            className="w-full h-[34px] border border-gray-200 rounded-lg text-xs bg-white outline-none px-2"
                          >
                             <option value="single">{t.modeSingle}</option>
                             <option value="dual">{t.modeDual}</option>
                             <option value="triple">{t.modeTriple}</option>
                             <option value="tiled">{t.modeTiled}</option>
                          </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">{t.uploadLogo}</label>
                        <button onClick={() => watermarkInputRef.current?.click()} className="w-full border border-dashed border-gray-300 rounded-lg p-2 text-xs text-gray-500 hover:bg-white hover:text-indigo-600 hover:border-indigo-400 transition-all flex items-center justify-center h-[34px]">
                          {config.watermarkImageUrl ? <span className="text-green-600 flex items-center overflow-hidden whitespace-nowrap"><CheckCircle className="w-3 h-3 mr-1 flex-shrink-0"/> {t.logoLoaded}</span> : t.selectImage}
                        </button>
                        <input ref={watermarkInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleWatermarkUpload} className="hidden" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">{t.position}</label>
                          <select 
                            disabled={config.watermarkMode !== 'single'}
                            value={config.watermarkPosition} 
                            onChange={e => setConfig({...config, watermarkPosition: e.target.value as WatermarkPosition})} 
                            className="w-full h-[32px] border border-gray-200 rounded-lg text-xs bg-white outline-none px-2 disabled:bg-gray-100 disabled:text-gray-400"
                          >
                            <option value="center">{t.posCenter}</option>
                            <option value="top-left">{t.posTl}</option>
                            <option value="top-right">{t.posTr}</option>
                            <option value="bottom-left">{t.posBl}</option>
                            <option value="bottom-right">{t.posBr}</option>
                            <option value="custom">{t.posCustom}</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1 flex items-center"><Palette className="w-3 h-3 mr-1" />{t.colorMode}</label>
                          <select 
                            value={config.watermarkColorMode} 
                            onChange={e => setConfig({...config, watermarkColorMode: e.target.value as WatermarkColorMode})} 
                            className="w-full h-[32px] border border-gray-200 rounded-lg text-xs bg-white outline-none px-2"
                          >
                            <option value="original">{t.colorOriginal}</option>
                            <option value="grayscale">{t.colorGrayscale}</option>
                          </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">{t.size} ({config.watermarkScale}%)</label>
                          <input type="range" min="5" max="100" step="5" value={config.watermarkScale} onChange={e => setConfig({...config, watermarkScale: parseInt(e.target.value)})} className="w-full h-4 accent-indigo-600 cursor-pointer" />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">{t.opacity} ({config.watermarkOpacity})</label>
                          <input type="range" min="0.1" max="1" step="0.1" value={config.watermarkOpacity} onChange={e => setConfig({...config, watermarkOpacity: parseFloat(e.target.value)})} className="w-full h-4 accent-indigo-600 cursor-pointer" />
                        </div>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1 flex items-center"><RotateCw className="w-3 h-3 mr-1" /> {t.rotation} ({config.watermarkRotation}°)</label>
                      <input type="range" min="-180" max="180" step="15" value={config.watermarkRotation} onChange={e => setConfig({...config, watermarkRotation: parseInt(e.target.value)})} className="w-full h-4 accent-indigo-600 cursor-pointer" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-3 bg-blue-50/50 rounded-lg text-[11px] text-blue-700 leading-relaxed border border-blue-100 mt-4">
                 <strong>{t.infoTitle}</strong> {getHintMessage()}
            </div>
          </div>

          <button onClick={startProcessing} disabled={files.length === 0 || isProcessing} className={`w-full py-4 rounded-xl font-bold text-lg shadow-lg transform transition-all flex items-center justify-center space-x-2 ${files.length === 0 || isProcessing ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-xl hover:-translate-y-1'}`}>
            {isProcessing ? <><Loader2 className="w-6 h-6 animate-spin" /><span>{t.processing} {progress}%</span></> : <><Play className="w-5 h-5 fill-current" /><span>{t.start}</span></>}
          </button>
          
          {summary && (
            <div className="bg-green-50 rounded-2xl border border-green-200 p-6 animate-fade-in">
              <div className="flex items-center space-x-2 text-green-800 mb-2 font-bold"><CheckCircle className="w-5 h-5" /><h3>{t.complete}</h3></div>
              <p className="text-sm text-green-700 mb-4">{t.successMsg.replace('{0}', summary.success.toString()).replace('{1}', summary.total.toString())}</p>
              <div className="text-xs text-green-600 bg-white/50 p-2 rounded">{t.downloadHint} <strong>{summary.outputZipName}</strong>.</div>
            </div>
          )}
        </div>

        <div className="w-full md:w-2/3 bg-white rounded-2xl shadow-sm border border-gray-100 flex flex-col min-h-[500px]">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="font-semibold text-gray-700 flex items-center"><FileImage className="w-5 h-5 mr-2 text-gray-400" />{t.uploadQueue} ({files.length})</h2>
            {files.length > 0 && <button onClick={clearAll} className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center"><RefreshCcw className="w-3 h-3 mr-1" />{t.clearQueue}</button>}
          </div>
          <div className={`flex-1 relative transition-colors ${dragActive ? 'bg-indigo-50/50' : 'bg-white'}`} onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onDragOver={(e) => e.preventDefault()} onDrop={handleDrop}>
            {files.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8">
                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-4 text-indigo-500"><Upload className="w-10 h-10" /></div>
                <h3 className="text-lg font-medium text-gray-900">{t.dragDrop}</h3>
                <p className="text-gray-500 text-sm mt-2 max-w-xs mx-auto">{t.supportHint}</p>
                <button onClick={() => fileInputRef.current?.click()} className="mt-6 px-6 py-2 bg-white border border-gray-300 rounded-full text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-all">{t.browse}</button>
                <input type="file" ref={fileInputRef} multiple accept="image/*,.zip" className="hidden" onChange={(e) => { if(e.target.files) processFiles(Array.from(e.target.files)) }} />
              </div>
            ) : (
              <div className="absolute inset-0 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-min content-start">
                {files.map((file) => (
                  <div key={file.id} className="group relative aspect-square bg-gray-100 rounded-xl overflow-hidden border border-gray-200 hover:shadow-md transition-shadow">
                    <img src={file.previewUrl} alt="preview" className={`w-full h-full object-cover transition-opacity ${file.status === 'processing' ? 'opacity-50' : 'opacity-100'}`} />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                       {file.status === 'processing' && <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />}
                       {file.status === 'success' && <div className="bg-green-500/90 text-white p-1 rounded-full"><CheckCircle className="w-6 h-6" /></div>}
                       {file.status === 'error' && <div className="bg-red-500/90 text-white p-1 rounded-full"><AlertCircle className="w-6 h-6" /></div>}
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm p-2"><p className="text-white text-xs truncate">{file.originalName}</p></div>
                    {file.status === 'pending' && <button onClick={() => setFiles(prev => prev.filter(f => f.id !== file.id))} className="absolute top-2 right-2 bg-white/90 hover:bg-red-500 hover:text-white text-gray-600 p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-sm"><X className="w-3 h-3" /></button>}
                  </div>
                ))}
                <button onClick={() => fileInputRef.current?.click()} className="aspect-square rounded-xl border-2 border-dashed border-gray-300 hover:border-indigo-400 hover:bg-indigo-50 flex flex-col items-center justify-center text-gray-400 hover:text-indigo-500 transition-colors">
                  <Upload className="w-6 h-6 mb-2" /><span className="text-xs font-medium">{t.addMore}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      <AssistantPanel config={config} isOpen={isAssistantOpen} onClose={() => setIsAssistantOpen(false)} language={language} />
    </div>
  );
};

export default App;
