import React, { useEffect, useRef, useState } from 'react';
import { geminiService, OCRResult, DetectedText } from '../services/geminiService';

interface BarcodeScannerProps {
  onScan: (code: string) => void;
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
  const [activeTab, setActiveTab] = useState<ScannerTab>('barcode');
  const [lensCapturedImage, setLensCapturedImage] = useState<string | null>(null);
  const [lensProcessing, setLensProcessing] = useState(false);
  const [lensResult, setLensResult] = useState<OCRResult | null>(null);
  const [lensError, setLensError] = useState<string | null>(null);
  const [useRawText, setUseRawText] = useState(false);

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
      setError('Seu navegador não suporta a detecção nativa de códigos de barras. Mas você ainda pode usar o modo Google Lens por upload!');
    }
  }, []);

  // Efeito para ligar a câmera caso não haja erro impeditivo
  useEffect(() => {
    const startCamera = async () => {
      try {
        // Para qualquer track ativa antes de iniciar uma nova
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'environment',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        // Se falhou somente BarcodeDetector, não joga erro se puder usar Google Lens por upload
        console.warn('Câmera indisponível:', err);
        if (!('BarcodeDetector' in window)) {
          setError('Câmera indisponível e leitor offline não suportado neste dispositivo.');
        }
      }
    };

    // Sempre tenta ligar se mudou de aba ou resetou
    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [activeTab]);

  // Efeito apenas para o loop de detecção (Apenas para o modo 'barcode')
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
            // Ignorar frames inválidos
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

  // Função para processar imagem no Google Lens
  const processLensImage = async (base64Image: string) => {
    setLensCapturedImage(base64Image);
    setLensProcessing(true);
    setLensError(null);
    setLensResult(null);
    try {
      const result = await geminiService.performOCR(base64Image);
      setLensResult(result);
    } catch (err: any) {
      console.error(err);
      setLensError(err.message || 'Erro ao extrair textos. Verifique sua chave API do Gemini nas configurações.');
    } finally {
      setLensProcessing(false);
    }
  };

  // Captura frame do feed de câmera ativa
  const handleCaptureCamera = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        const base64Data = canvas.toDataURL('image/jpeg', 0.85);
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
    setIsScanning(true);
  };

  // Estilos de animação customizados auto-injetados
  const customStyles = `
    @keyframes sweep {
      0% { top: 0%; opacity: 0.8; }
      50% { top: 100%; opacity: 1; }
      100% { top: 0%; opacity: 0.8; }
    }
    .animate-laser-sweep {
      animation: sweep 2.5s ease-in-out infinite;
    }
    @keyframes heartbeat {
      0%, 100% { transform: scale(1); opacity: 0.3; }
      50% { transform: scale(1.05); opacity: 0.6; }
    }
    .animate-pulse-light {
      animation: heartbeat 2s ease-in-out infinite;
    }
  `;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-md">
      <style>{customStyles}</style>
      
      <div className="relative w-full max-w-md bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
          <div className="flex flex-col">
            <h3 className="font-black text-slate-900 flex items-center gap-2">
              <i className="fa-solid fa-wand-magic-sparkles text-blue-600 animate-pulse"></i>
              Leitor com Inteligência Artificial
            </h3>
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Modo Integrado Google Lens</span>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="text-slate-500 hover:text-red-500 bg-slate-200/50 hover:bg-red-50 rounded-full w-10 h-10 flex items-center justify-center transition-all"
          >
            <i className="fa-solid fa-times text-xl"></i>
          </button>
        </div>

        {/* Escolha do Modo: Código de Barras Tradicional e Google Lens */}
        <div className="flex bg-slate-100 p-1 border-b">
          <button
            type="button"
            onClick={() => { setActiveTab('barcode'); handleResetLens(); }}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'barcode' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <i className="fa-solid fa-barcode"></i>
            Leitor de Código
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('lens')}
            className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase transition-all flex items-center justify-center gap-2 ${activeTab === 'lens' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <i className="fa-solid fa-camera-retro"></i>
            Google Lens IA
          </button>
        </div>
        
        {/* Visualização de Captura / Câmera */}
        <div className="relative aspect-square bg-slate-950 flex items-center justify-center overflow-hidden">
          {error && activeTab === 'barcode' ? (
            <div className="p-8 text-center text-white">
              <i className="fa-solid fa-triangle-exclamation text-amber-400 text-4xl mb-4 animate-bounce"></i>
              <p className="font-bold text-sm leading-relaxed">{error}</p>
              <button 
                type="button"
                onClick={() => setActiveTab('lens')} 
                className="mt-6 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-xs uppercase transition-all flex items-center gap-2 mx-auto"
              >
                <i className="fa-solid fa-camera"></i> Usar Google Lens por Foto
              </button>
            </div>
          ) : (
            <>
              {/* Câmera ativa em tempo real se não houver imagem capturada no modo Lens */}
              {!lensCapturedImage && (
                <>
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    className="absolute inset-0 w-full h-full object-cover" 
                  />
                  
                  {activeTab === 'barcode' ? (
                    <>
                      {/* Mira para código de barras tradicional */}
                      <div className="absolute inset-0 border-[60px] border-black/40"></div>
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-40 border-2 border-white/50 rounded-xl shadow-[0_0_0_999px_rgba(0,0,0,0.3)]">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-full h-0.5 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] animate-pulse"></div>
                        </div>
                        <div className="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-blue-500 rounded-tl-lg"></div>
                        <div className="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-blue-500 rounded-tr-lg"></div>
                        <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-blue-500 rounded-bl-lg"></div>
                        <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-blue-500 rounded-br-lg"></div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Grid sutil e guias inteligentes estilo Google Lens */}
                      <div className="absolute inset-0 border-2 border-dashed border-white/10 pointer-events-none"></div>
                      <div className="absolute inset-12 border-2 border-white/20 rounded-3xl pointer-events-none animate-pulse-light"></div>
                      <div className="absolute top-6 left-6 w-8 h-8 border-t-2 border-l-2 border-white rounded-tl-lg"></div>
                      <div className="absolute top-6 right-6 w-8 h-8 border-t-2 border-r-2 border-white rounded-tr-lg"></div>
                      <div className="absolute bottom-6 left-6 w-8 h-8 border-b-2 border-l-2 border-white rounded-bl-lg"></div>
                      <div className="absolute bottom-6 right-6 w-8 h-8 border-b-2 border-r-2 border-white rounded-br-lg"></div>
                      
                      {/* Indicador Google Lens */}
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-blue-600/90 text-white font-black text-[10px] px-3 py-1.5 rounded-full flex items-center gap-2 uppercase tracking-wider backdrop-blur-md shadow-lg border border-white/20">
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-ping"></span>
                        Câmera Google Lens Ativa
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Exibição de Imagem Congelada / Enviada no Google Lens */}
              {lensCapturedImage && (
                <div className="absolute inset-0 w-full h-full bg-slate-900 flex items-center justify-center">
                  <img src={lensCapturedImage} className="w-full h-full object-contain select-none" alt="Capturada" />
                  
                  {/* Linha laser de escaneamento Google Lens */}
                  {lensProcessing && (
                    <div className="absolute left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent shadow-[0_0_20px_rgba(59,130,246,0.8)] animate-laser-sweep"></div>
                  )}

                  {/* Detecções interativas do Google Lens sobre a imagem */}
                  {lensResult?.detectedTexts?.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => onScan(item.text)}
                      style={{
                        top: `${item.topPercent}%`,
                        left: `${item.leftPercent}%`,
                        width: `${Math.max(item.widthPercent, 12)}%`,
                        height: `${Math.max(item.heightPercent, 5)}%`,
                      }}
                      className="absolute border border-amber-400/80 bg-amber-400/20 hover:border-blue-400 hover:bg-blue-500/30 text-white text-[10px] font-black rounded shadow-[0_4px_12px_rgba(0,0,0,0.5)] flex items-center justify-center transition-all duration-150 transform hover:scale-105 active:scale-95 group select-none min-w-[35px]"
                      title={`Selecionar: "${item.text}"`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 animate-pulse flex-shrink-0 group-hover:bg-blue-400"></span>
                      <span className="truncate max-w-full px-0.5">{item.text}</span>
                      
                      {/* Tooltip */}
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2.5 py-1 bg-slate-950/95 border border-slate-700 text-amber-300 rounded shadow-2xl font-black text-[11px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-30">
                        {item.text}
                      </span>
                    </button>
                  ))}
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
        
        {/* Botões e controles inferiores */}
        <div className="p-4 bg-white space-y-4 overflow-y-auto max-h-[35vh]">
          
          {/* Módulo Tradicional de Código de Barras */}
          {activeTab === 'barcode' && (
            <>
              <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                <button 
                  type="button"
                  onClick={() => setLengthMode('last8')}
                  className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 ${lengthMode === 'last8' ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <i className="fa-solid fa-scissors"></i>
                  8 Últimos
                </button>
                <button 
                  type="button"
                  onClick={() => setLengthMode('full')}
                  className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all flex items-center justify-center gap-2 ${lengthMode === 'full' ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  <i className="fa-solid fa-expand"></i>
                  Completo
                </button>
              </div>
              <div className="text-center pt-1 border-t border-gray-50">
                <p className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center justify-center gap-1">
                  <i className="fa-solid fa-circle-notch animate-spin text-blue-500 text-[10px]"></i>
                  Ajuste o foco no código
                </p>
                <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Recomendável boa iluminação</p>
              </div>
            </>
          )}

          {/* Módulo Google Lens AI */}
          {activeTab === 'lens' && (
            <div className="space-y-3">
              
              {/* Estados do Google Lens - Antes de capturar */}
              {!lensCapturedImage && !lensProcessing && (
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleCaptureCamera}
                    className="w-full bg-blue-600 hover:bg-blue-700 active:transform active:scale-98 text-white py-3 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all border-b-4 border-blue-800"
                  >
                    <i className="fa-solid fa-camera text-sm"></i>
                    Tirar Foto e Analisar (Lens AI)
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 py-3 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 transition-all"
                  >
                    <i className="fa-solid fa-image text-sm"></i>
                    Carregar da Galeria (Upload)
                  </button>
                </div>
              )}

              {/* Processando Imagem */}
              {lensProcessing && (
                <div className="py-4 text-center space-y-3 bg-blue-500/5 rounded-2xl border border-blue-500/10 p-3">
                  <div className="relative inline-block">
                    <i className="fa-solid fa-wand-magic-sparkles text-blue-600 text-3xl animate-pulse"></i>
                    <i className="fa-solid fa-circle-notch animate-spin text-blue-500 text-xl absolute -right-2 -bottom-2"></i>
                  </div>
                  <div>
                    <h4 className="font-black text-xs text-blue-600 uppercase tracking-widest animate-pulse">Análise Google Lens Ativa</h4>
                    <p className="text-[10px] text-slate-500 font-bold uppercase mt-1 leading-relaxed">Gemini OCR extraindo textos, logotipos e códigos relevantes...</p>
                  </div>
                </div>
              )}

              {/* Erro no OCR */}
              {lensError && !lensProcessing && (
                <div className="space-y-3">
                  <div className="bg-red-50 border border-red-200 p-3 rounded-2xl">
                    <p className="text-red-600 text-[11px] font-bold leading-relaxed flex gap-1.5 items-start">
                      <i className="fa-solid fa-circle-exclamation text-xs mt-0.5 flex-shrink-0"></i>
                      {lensError}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleResetLens}
                      className="flex-1 bg-slate-200 hover:bg-slate-300 rounded-xl py-2.5 font-black text-[10px] uppercase transition-all"
                    >
                      Tentar Novamente
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl py-2.5 font-black text-[10px] uppercase transition-all"
                    >
                      Galeria
                    </button>
                  </div>
                </div>
              )}

              {/* Apresentação das detecções finalizadas */}
              {lensResult && !lensProcessing && (
                <div className="space-y-3 animate-fade-in">
                  <div className="p-3 bg-blue-500/5 rounded-2xl border border-blue-500/10 space-y-2">
                    <div className="flex justify-between items-center pb-2 border-b border-blue-500/10">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Como obter o código:</p>
                      <button 
                        type="button"
                        onClick={() => setUseRawText(!useRawText)}
                        className="text-[10px] text-blue-600 hover:text-blue-700 font-black uppercase flex items-center gap-1"
                      >
                        <i className={`fa-solid ${useRawText ? 'fa-list-check' : 'fa-file-lines'}`}></i>
                        {useRawText ? 'Ver Termos' : 'Ver Texto Completo'}
                      </button>
                    </div>

                    {useRawText ? (
                      /* Bloco de visualização de texto bruto */
                      <div className="space-y-2">
                        <textarea
                          readOnly
                          value={lensResult.fullText || "Nenhum texto bruto livre detectado."}
                          className="w-full text-[11px] font-mono p-2 bg-slate-900 text-emerald-400 border border-slate-800 rounded-xl focus:outline-none min-h-[90px] leading-relaxed resize-none"
                        />
                        <button
                          type="button"
                          onClick={() => onScan(lensResult.fullText.trim())}
                          className="w-full bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white py-2 rounded-xl font-black text-[10px] uppercase flex items-center justify-center gap-1 shadow-lg shadow-emerald-500/20"
                        >
                          <i className="fa-solid fa-circle-check"></i> Importar Texto Inteiro
                        </button>
                      </div>
                    ) : (
                      /* Termos individuais dinâmicos para clique rápido */
                      <div className="space-y-2">
                        <p className="text-[10px] text-slate-500 font-bold uppercase">Toque em qualquer termo para selecioná-lo:</p>
                        
                        {lensResult.detectedTexts.length === 0 ? (
                          <p className="text-[11px] py-1 text-slate-400 font-bold italic text-center">Nenhum termo isolado detectado.</p>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 max-h-[110px] overflow-y-auto pr-1">
                            {lensResult.detectedTexts.map((item, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => onScan(item.text)}
                                className="px-2.5 py-1.5 bg-slate-100 hover:bg-blue-600 hover:text-white rounded-lg text-[10px] font-extrabold transition-all duration-150 flex items-center gap-1 active:scale-95 text-slate-800 select-none border border-slate-200/60"
                              >
                                <span className={`w-1.5 h-1.5 rounded-full ${item.type === 'code' || item.type === 'serial' ? 'bg-amber-400' : 'bg-blue-500'}`}></span>
                                {item.text}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Redirecionar para novas capturas */}
                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleResetLens}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-2.5 font-black text-[10px] uppercase flex items-center justify-center gap-1"
                    >
                      <i className="fa-solid fa-redo"></i> Capturar Outra
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl py-2.5 font-black text-[10px] uppercase flex items-center justify-center gap-1"
                    >
                      <i className="fa-solid fa-folder-open"></i> Galeria
                    </button>
                  </div>
                </div>
              )}

              {/* Guia explicativo */}
              <div className="text-center pt-2 border-t border-gray-100">
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-wider flex items-center justify-center gap-1">
                  <i className="fa-solid fa-wand-magic-sparkles text-blue-500"></i>
                  Extraia números de patrimônio, marcas ou S/N direto de fotos
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BarcodeScanner;
