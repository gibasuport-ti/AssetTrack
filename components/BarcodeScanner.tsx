import React, { useEffect, useRef, useState } from 'react';
import { geminiService, OCRResult, DetectedText } from '../services/geminiService';
import { prepareImageForOCR } from '../services/imageUtils';

interface BarcodeScannerProps {
  onScan: (code: string, meta?: { serial?: string; patrimonio?: string; marca?: string; modelo?: string }) => void;
  onClose: () => void;
}

type ScanLengthMode = 'full' | 'last8';
type ScannerTab = 'barcode' | 'lens';

const BarcodeScanner: React.FC<BarcodeScannerProps> = ({ onScan, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(true);
  const [lengthMode, setLengthMode] = useState<ScanLengthMode>('last8');
  
  // Ref para o modo de leitura do código de barras
  const lengthModeRef = useRef<ScanLengthMode>('last8');
  const detectorRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Estados adicionais para o módulo Google Lens
  const [activeTab, setActiveTab] = useState<ScannerTab>('lens'); // Padrão no Lens IA
  const [lensCapturedImage, setLensCapturedImage] = useState<string | null>(null);
  const [lensProcessing, setLensProcessing] = useState(false);
  const [lensResult, setLensResult] = useState<OCRResult | null>(null);
  const [lensError, setLensError] = useState<string | null>(null);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [useRawText, setUseRawText] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // Controles de câmera profissional (Lanterna e Zoom)
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Sincroniza a ref com o estado
  useEffect(() => {
    lengthModeRef.current = lengthMode;
  }, [lengthMode]);

  // Detector nativo de código de barras
  useEffect(() => {
    if ('BarcodeDetector' in window) {
      try {
        // @ts-ignore
        detectorRef.current = new window.BarcodeDetector({
          formats: [
            'code_128', 'code_39', 'code_93', 'codabar', 
            'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e', 
            'itf', 'data_matrix', 'pdf417', 'aztec'
          ]
        });
      } catch (e) {
        console.warn("Erro ao inicializar BarcodeDetector:", e);
      }
    } else {
      setError('Seu navegador não suporta a detecção nativa de códigos de barras. Mas você pode usar o Google Lens IA!');
    }
  }, []);

  // Efeito para ligar a câmera com resolução alta e foco contínuo
  useEffect(() => {
    let isMounted = true;

    const startCamera = async () => {
      try {
        // Para qualquer track ativa antes de iniciar uma nova
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
            // @ts-ignore
            advanced: [{ focusMode: 'continuous' }]
          }
        });

        if (!isMounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Verifica suporte a Lanterna (Torch)
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = (track.getCapabilities ? track.getCapabilities() : {}) as any;
          if (capabilities && 'torch' in capabilities) {
            setHasTorch(true);
          }
        }
      } catch (err) {
        console.warn('Câmera indisponível ou permissão negada:', err);
        if (!('BarcodeDetector' in window)) {
          setError('Câmera indisponível neste navegador. Você pode carregar uma foto da etiqueta pela galeria.');
        }
      }
    };

    startCamera();

    return () => {
      isMounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [activeTab]);

  // Alternar Lanterna / Flash
  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const nextTorch = !torchOn;
        // @ts-ignore
        await track.applyConstraints({
          advanced: [{ torch: nextTorch } as any]
        });
        setTorchOn(nextTorch);
      } catch (e) {
        console.warn("Torch não suportado:", e);
      }
    }
  };

  // Efeito apenas para o loop de detecção tradicional de código de barras
  useEffect(() => {
    let animationFrame: number;

    const scan = async () => {
      if (!isScanning || activeTab !== 'barcode') return;

      if (videoRef.current && canvasRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        if (ctx && detectorRef.current) {
          if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
          if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
          
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          try {
            const barcodes = await detectorRef.current.detect(canvas);
            if (barcodes.length > 0) {
              let detectedCode = String(barcodes[0].rawValue).trim();
              
              if (lengthModeRef.current === 'last8' && detectedCode.length > 8) {
                detectedCode = detectedCode.slice(-8);
              }

              setIsScanning(false);
              onScan(detectedCode);
              return; 
            }
          } catch (e) {
            // Ignorar frames intermediários
          }
        }
      }
      
      if (isScanning && activeTab === 'barcode') {
        animationFrame = requestAnimationFrame(scan);
      }
    };

    if (!error && isScanning && activeTab === 'barcode') {
      animationFrame = requestAnimationFrame(scan);
    }

    return () => cancelAnimationFrame(animationFrame);
  }, [onScan, isScanning, error, activeTab]);

  // Função para processar imagem no Google Lens com alta velocidade e precisão
  const processLensImage = async (rawImage: string) => {
    setLensCapturedImage(rawImage);
    setLensProcessing(true);
    setLensError(null);
    setLensResult(null);
    const startTime = Date.now();

    try {
      // 1. Pré-processamento inteligente: redimensiona para 1600px e ajusta contraste
      const optimizedBase64 = await prepareImageForOCR(rawImage, 1600, 1600, 0.90, true);
      
      // 2. Chamada de OCR com modelo Gemini Flash Latest
      const result = await geminiService.performOCR(optimizedBase64);
      setLensResult(result);
      setProcessingTime(Date.now() - startTime);
    } catch (err: any) {
      console.error("Erro no OCR Google Lens:", err);
      setLensError(err.message || 'Erro ao extrair textos da imagem. Verifique a iluminação e tente novamente.');
    } finally {
      setLensProcessing(false);
    }
  };

  // Captura frame do feed de câmera ativa em altíssima resolução
  const handleCaptureCamera = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const vw = video.videoWidth || 1920;
        const vh = video.videoHeight || 1080;
        canvas.width = vw;
        canvas.height = vh;

        // Se houver zoom digital, faz o crop central
        if (zoomLevel > 1) {
          const cropW = vw / zoomLevel;
          const cropH = vh / zoomLevel;
          const startX = (vw - cropW) / 2;
          const startY = (vh - cropH) / 2;
          ctx.drawImage(video, startX, startY, cropW, cropH, 0, 0, vw, vh);
        } else {
          ctx.drawImage(video, 0, 0, vw, vh);
        }
        
        const base64Data = canvas.toDataURL('image/jpeg', 0.92);
        processLensImage(base64Data);
      }
    } else {
      setLensError("Câmera desligada ou indisponível. Por favor, carregue uma foto da galeria.");
    }
  };

  // Carrega imagem da galeria/arquivos
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      processLensImage(base64String);
    };
    reader.readAsDataURL(file);
  };

  const handleResetLens = () => {
    setLensCapturedImage(null);
    setLensResult(null);
    setLensError(null);
    setProcessingTime(null);
    setIsScanning(true);
  };

  const handleSelectCode = (text: string) => {
    const clean = text.trim();
    setCopiedText(clean);
    setTimeout(() => {
      onScan(clean, {
        serial: lensResult?.suggestedSerial,
        patrimonio: lensResult?.suggestedPatrimonio,
        marca: lensResult?.suggestedMarca,
        modelo: lensResult?.suggestedModelo
      });
    }, 150);
  };

  const handleUseAllDetected = () => {
    if (!lensResult) return;
    const primaryCode = lensResult.suggestedSerial || lensResult.suggestedPatrimonio || (lensResult.detectedTexts[0]?.text) || '';
    onScan(primaryCode, {
      serial: lensResult.suggestedSerial,
      patrimonio: lensResult.suggestedPatrimonio,
      marca: lensResult.suggestedMarca,
      modelo: lensResult.suggestedModelo
    });
  };

  // Retorna classe e estilo de cor por tipo de dado identificado
  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'serial':
        return { label: 'S/N', bg: 'bg-amber-500/20 text-amber-300 border-amber-400/50', dot: 'bg-amber-400' };
      case 'patrimonio':
        return { label: 'PATRIMÔNIO', bg: 'bg-blue-500/20 text-blue-300 border-blue-400/50', dot: 'bg-blue-400' };
      case 'model':
        return { label: 'MODELO', bg: 'bg-purple-500/20 text-purple-300 border-purple-400/50', dot: 'bg-purple-400' };
      case 'brand':
        return { label: 'MARCA', bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50', dot: 'bg-emerald-400' };
      default:
        return { label: 'TEXTO', bg: 'bg-slate-700/50 text-slate-300 border-slate-600/50', dot: 'bg-slate-400' };
    }
  };

  // Animações
  const customStyles = `
    @keyframes sweep {
      0% { top: 0%; opacity: 0.9; }
      50% { top: 100%; opacity: 1; }
      100% { top: 0%; opacity: 0.9; }
    }
    .animate-laser-sweep {
      animation: sweep 1.6s ease-in-out infinite;
    }
    @keyframes heartbeat {
      0%, 100% { transform: scale(1); opacity: 0.3; }
      50% { transform: scale(1.03); opacity: 0.7; }
    }
    .animate-pulse-light {
      animation: heartbeat 1.8s ease-in-out infinite;
    }
  `;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-2 sm:p-4 backdrop-blur-md animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <style>{customStyles}</style>
      
      <div className="relative w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[96vh] sm:max-h-[92vh] border border-slate-200">
        
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-slate-900 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <i className="fa-solid fa-wand-magic-sparkles text-white text-base"></i>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-white text-sm tracking-tight">Google Lens IA</h3>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Alta Precisão
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                Reconhecimento Óptico de Ativos Cirion
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-slate-400 hover:text-white bg-slate-800 hover:bg-red-600 rounded-full w-9 h-9 flex items-center justify-center transition-all"
            title="Fechar"
          >
            <i className="fa-solid fa-times text-base"></i>
          </button>
        </div>

        {/* Escolha do Modo */}
        <div className="flex bg-slate-100 p-1.5 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab('lens')}
            className={`flex-1 py-2 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'lens' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <i className="fa-solid fa-camera-retro"></i>
            Google Lens IA
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('barcode'); handleResetLens(); }}
            className={`flex-1 py-2 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'barcode' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <i className="fa-solid fa-barcode"></i>
            Código de Barras
          </button>
        </div>
        
        {/* Visualização de Captura / Câmera */}
        <div className="relative aspect-square sm:aspect-[4/3] bg-slate-950 flex items-center justify-center overflow-hidden">
          {error && activeTab === 'barcode' ? (
            <div className="p-8 text-center text-white">
              <i className="fa-solid fa-triangle-exclamation text-amber-400 text-4xl mb-3 animate-bounce"></i>
              <p className="font-bold text-sm leading-relaxed">{error}</p>
              <button 
                type="button"
                onClick={() => setActiveTab('lens')} 
                className="mt-5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase transition-all flex items-center gap-2 mx-auto"
              >
                <i className="fa-solid fa-camera"></i> Usar Google Lens IA
              </button>
            </div>
          ) : (
            <>
              {/* Câmera ao vivo */}
              {!lensCapturedImage && (
                <>
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    muted
                    style={{
                      transform: zoomLevel > 1 ? `scale(${zoomLevel})` : 'none',
                      transformOrigin: 'center center',
                      transition: 'transform 0.2s ease-out'
                    }}
                    className="absolute inset-0 w-full h-full object-cover" 
                  />
                  
                  {/* Controles de Câmera Sobrepostos (Lanterna e Zoom) */}
                  <div className="absolute top-3 right-3 flex flex-col gap-2 z-20">
                    {hasTorch && (
                      <button
                        type="button"
                        onClick={toggleTorch}
                        className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md transition-all shadow-lg ${torchOn ? 'bg-amber-400 text-slate-950 ring-4 ring-amber-400/40' : 'bg-slate-900/80 text-white hover:bg-slate-800'}`}
                        title={torchOn ? "Desligar Lanterna" : "Ligar Lanterna"}
                      >
                        <i className={`fa-solid ${torchOn ? 'fa-bolt' : 'fa-lightbulb'} text-sm`}></i>
                      </button>
                    )}
                    
                    {/* Botão de Zoom Digital */}
                    <div className="bg-slate-900/80 backdrop-blur-md rounded-full p-1 flex flex-col items-center gap-1 shadow-lg border border-white/10">
                      {[1, 2, 3].map((z) => (
                        <button
                          key={z}
                          type="button"
                          onClick={() => setZoomLevel(z)}
                          className={`w-8 h-8 rounded-full text-[10px] font-black transition-all flex items-center justify-center ${zoomLevel === z ? 'bg-blue-600 text-white shadow' : 'text-slate-300 hover:text-white'}`}
                        >
                          {z}x
                        </button>
                      ))}
                    </div>
                  </div>

                  {activeTab === 'barcode' ? (
                    <>
                      {/* Mira de código de barras */}
                      <div className="absolute inset-0 border-[30px] sm:border-[50px] border-black/50 pointer-events-none"></div>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[85vw] max-w-[280px] h-36 border-2 border-white/60 rounded-2xl shadow-[0_0_0_999px_rgba(0,0,0,0.3)] pointer-events-none">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-full h-0.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.9)] animate-pulse"></div>
                        </div>
                        <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-lg"></div>
                        <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-lg"></div>
                        <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-lg"></div>
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-lg"></div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Mira Inteligente Google Lens */}
                      <div className="absolute inset-8 sm:inset-12 border-2 border-white/20 rounded-3xl pointer-events-none animate-pulse-light"></div>
                      <div className="absolute top-8 left-8 w-8 h-8 border-t-3 border-l-3 border-cyan-400 rounded-tl-xl pointer-events-none"></div>
                      <div className="absolute top-8 right-8 w-8 h-8 border-t-3 border-r-3 border-cyan-400 rounded-tr-xl pointer-events-none"></div>
                      <div className="absolute bottom-8 left-8 w-8 h-8 border-b-3 border-l-3 border-cyan-400 rounded-bl-xl pointer-events-none"></div>
                      <div className="absolute bottom-8 right-8 w-8 h-8 border-b-3 border-r-3 border-cyan-400 rounded-br-xl pointer-events-none"></div>
                      
                      {/* Badge Central */}
                      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white font-bold text-[10px] px-3.5 py-1.5 rounded-full flex items-center gap-2 tracking-wider backdrop-blur-md shadow-xl border border-white/15">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                        Aproxime da etiqueta do equipamento
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Imagem Congelada Capturada no Google Lens */}
              {lensCapturedImage && (
                <div className="absolute inset-0 w-full h-full bg-slate-950 flex items-center justify-center">
                  <img src={lensCapturedImage} className="w-full h-full object-contain select-none" alt="Etiqueta Capturada" />
                  
                  {/* Linha laser de escaneamento */}
                  {lensProcessing && (
                    <div className="absolute left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_20px_rgba(34,211,238,0.9)] animate-laser-sweep"></div>
                  )}

                  {/* Caixas interativas de detecção sobrepostas */}
                  {lensResult?.detectedTexts?.map((item, idx) => {
                    const badge = getTypeBadge(item.type);
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectCode(item.text)}
                        style={{
                          top: `${Math.max(0, Math.min(92, item.topPercent))}%`,
                          left: `${Math.max(0, Math.min(88, item.leftPercent))}%`,
                          width: `${Math.max(item.widthPercent, 12)}%`,
                          height: `${Math.max(item.heightPercent, 5)}%`,
                        }}
                        className={`absolute border-2 ${badge.bg} rounded-lg shadow-lg flex items-center justify-center transition-all duration-150 transform hover:scale-105 active:scale-95 group z-10 px-1`}
                        title={`Clique para selecionar: "${item.text}"`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${badge.dot} mr-1 flex-shrink-0 animate-pulse`}></span>
                        <span className="truncate max-w-full text-[10px] font-black text-white drop-shadow-md">
                          {item.text}
                        </span>
                        
                        {/* Tooltip flutuante */}
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 bg-slate-950 border border-slate-700 text-white rounded text-[9px] font-bold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30 shadow-2xl">
                          {badge.label}: {item.text}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
        
        <canvas ref={canvasRef} className="hidden" />
        <input 
          ref={fileInputRef}
          type="file" 
          accept="image/*" 
          onChange={handleFileUpload} 
          className="hidden" 
        />
        
        {/* Painel Inferior de Ações e Resultados */}
        <div className="p-4 bg-white space-y-3 overflow-y-auto max-h-[42vh]">
          
          {/* MODO CÓDIGO DE BARRAS */}
          {activeTab === 'barcode' && (
            <>
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button 
                  type="button"
                  onClick={() => setLengthMode('last8')}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-black uppercase transition-all flex items-center justify-center gap-2 ${lengthMode === 'last8' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <i className="fa-solid fa-scissors"></i>
                  Últimos 8 Caracteres
                </button>
                <button 
                  type="button"
                  onClick={() => setLengthMode('full')}
                  className={`flex-1 py-2 rounded-lg text-[11px] font-black uppercase transition-all flex items-center justify-center gap-2 ${lengthMode === 'full' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  <i className="fa-solid fa-expand"></i>
                  Código Completo
                </button>
              </div>
              <div className="text-center pt-2 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-700 flex items-center justify-center gap-2">
                  <i className="fa-solid fa-circle-notch animate-spin text-blue-500 text-xs"></i>
                  Mantenha a etiqueta na linha vermelha para leitura automática
                </p>
              </div>
            </>
          )}

          {/* MODO GOOGLE LENS IA */}
          {activeTab === 'lens' && (
            <div className="space-y-3">
              
              {/* Botões de Ação Pré-Captura */}
              {!lensCapturedImage && !lensProcessing && (
                <div className="flex flex-col gap-2.5">
                  <button
                    type="button"
                    onClick={handleCaptureCamera}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-98 text-white py-3.5 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2.5 shadow-xl shadow-blue-500/25 transition-all"
                  >
                    <i className="fa-solid fa-camera text-base"></i>
                    Capturar e Ler Texto Instantâneo
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-2.5 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all border border-slate-200"
                  >
                    <i className="fa-solid fa-image text-sm text-slate-500"></i>
                    Carregar Foto da Galeria
                  </button>
                </div>
              )}

              {/* Animação de Processamento Otimizada */}
              {lensProcessing && (
                <div className="py-4 text-center space-y-2 bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-2xl border border-blue-200 p-4">
                  <div className="relative inline-block">
                    <i className="fa-solid fa-wand-magic-sparkles text-blue-600 text-3xl animate-bounce"></i>
                  </div>
                  <div>
                    <h4 className="font-black text-xs text-blue-900 uppercase tracking-wider">
                      Extraindo textos da etiqueta...
                    </h4>
                    <p className="text-[11px] text-blue-600 font-bold mt-0.5">
                      IA identificando Serial, Patrimônio, Marca e Modelo com precisão cirúrgica
                    </p>
                  </div>
                </div>
              )}

              {/* Mensagem de Erro */}
              {lensError && !lensProcessing && (
                <div className="space-y-2.5">
                  <div className="bg-red-50 border border-red-200 p-3 rounded-2xl flex items-start gap-2 text-red-700 text-xs font-bold">
                    <i className="fa-solid fa-circle-exclamation text-base text-red-500 mt-0.5 flex-shrink-0"></i>
                    <span>{lensError}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleResetLens}
                      className="flex-1 bg-slate-200 hover:bg-slate-300 rounded-xl py-2.5 font-black text-xs uppercase transition-all"
                    >
                      Tentar Novamente
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 font-black text-xs uppercase transition-all"
                    >
                      Escolher da Galeria
                    </button>
                  </div>
                </div>
              )}

              {/* RESULTADOS DA LEITURA DE ALTA PRECISÃO */}
              {lensResult && !lensProcessing && (
                <div className="space-y-3 animate-fade-in">
                  
                  {/* Status de tempo e precisão */}
                  <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-black uppercase text-emerald-600 flex items-center gap-1">
                      <i className="fa-solid fa-circle-check"></i>
                      Leitura Concluída {processingTime ? `(${processingTime}ms)` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => setUseRawText(!useRawText)}
                      className="text-[10px] font-black uppercase text-blue-600 hover:text-blue-800 flex items-center gap-1"
                    >
                      <i className={`fa-solid ${useRawText ? 'fa-list-check' : 'fa-align-left'}`}></i>
                      {useRawText ? 'Ver Destaques' : 'Ver Texto Bruto'}
                    </button>
                  </div>

                  {/* CARDS DE DESTAQUE INTELIGENTE (SERIAL / PATRIMÔNIO / MODELO) */}
                  {!useRawText ? (
                    <div className="space-y-2">
                      
                      {/* Número de Série Identificado */}
                      {lensResult.suggestedSerial && (
                        <div className="p-3 bg-amber-50 rounded-2xl border-2 border-amber-300 flex items-center justify-between gap-2 shadow-sm">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1 text-[10px] font-black uppercase text-amber-800">
                              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                              Número de Série (S/N)
                            </div>
                            <div className="text-sm font-black font-mono text-slate-900 truncate">
                              {lensResult.suggestedSerial}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSelectCode(lensResult.suggestedSerial!)}
                            className="px-3 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white font-black text-[11px] uppercase rounded-xl shadow transition-all flex items-center gap-1 flex-shrink-0"
                          >
                            <i className="fa-solid fa-check"></i> Usar Serial
                          </button>
                        </div>
                      )}

                      {/* Patrimônio Identificado */}
                      {lensResult.suggestedPatrimonio && (
                        <div className="p-3 bg-blue-50 rounded-2xl border-2 border-blue-300 flex items-center justify-between gap-2 shadow-sm">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1 text-[10px] font-black uppercase text-blue-800">
                              <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                              Patrimônio Corporativo
                            </div>
                            <div className="text-sm font-black font-mono text-slate-900 truncate">
                              {lensResult.suggestedPatrimonio}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleSelectCode(lensResult.suggestedPatrimonio!)}
                            className="px-3 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-black text-[11px] uppercase rounded-xl shadow transition-all flex items-center gap-1 flex-shrink-0"
                          >
                            <i className="fa-solid fa-check"></i> Usar Patrimônio
                          </button>
                        </div>
                      )}

                      {/* Modelo e Marca Identificados */}
                      {(lensResult.suggestedModelo || lensResult.suggestedMarca) && (
                        <div className="p-2.5 bg-purple-50 rounded-2xl border border-purple-200 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[9px] font-black uppercase text-purple-700 block">
                              Equipamento Identificado
                            </span>
                            <span className="text-xs font-black text-purple-950 truncate block">
                              {lensResult.suggestedMarca ? `${lensResult.suggestedMarca} ` : ''}
                              {lensResult.suggestedModelo || ''}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={handleUseAllDetected}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-black text-[10px] uppercase rounded-xl shadow transition-all flex-shrink-0"
                          >
                            Preencher no Ativo
                          </button>
                        </div>
                      )}

                      {/* Chips com todos os termos e códigos capturados para toque rápido */}
                      <div className="pt-2 border-t border-slate-100 space-y-1.5">
                        <p className="text-[10px] text-slate-500 font-black uppercase">
                          Toque em qualquer texto detectado para selecioná-lo:
                        </p>
                        
                        {lensResult.detectedTexts.length === 0 ? (
                          <p className="text-xs text-slate-400 font-bold italic text-center py-2">
                            Nenhum termo isolado detectado.
                          </p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto pr-1">
                            {lensResult.detectedTexts.map((item, idx) => {
                              const badge = getTypeBadge(item.type);
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => handleSelectCode(item.text)}
                                  className={`px-2.5 py-1.5 bg-slate-50 hover:bg-blue-600 hover:text-white rounded-xl text-[11px] font-bold transition-all duration-150 flex items-center gap-1.5 border border-slate-200 active:scale-95 ${copiedText === item.text ? 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-400' : 'text-slate-800'}`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span>
                                  <span className="font-mono">{item.text}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Visualização de Texto Bruto Completo */
                    <div className="space-y-2">
                      <textarea
                        readOnly
                        value={lensResult.fullText || "Nenhum texto contínuo identificado."}
                        className="w-full text-xs font-mono p-3 bg-slate-900 text-emerald-400 border border-slate-800 rounded-2xl focus:outline-none min-h-[100px] leading-relaxed resize-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleSelectCode(lensResult.fullText.trim())}
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-black text-xs uppercase flex items-center justify-center gap-1.5 shadow"
                      >
                        <i className="fa-solid fa-copy"></i> Importar Texto Completo
                      </button>
                    </div>
                  )}

                  {/* Botões de Rodapé para Nova Captura */}
                  <div className="flex gap-2 pt-2 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={handleResetLens}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl py-2.5 font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-all"
                    >
                      <i className="fa-solid fa-rotate-right"></i> Nova Captura
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl py-2.5 font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-all"
                    >
                      <i className="fa-solid fa-folder-open"></i> Galeria
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BarcodeScanner;
