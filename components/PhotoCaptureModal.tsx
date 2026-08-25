import React, { useEffect, useRef, useState } from 'react';
import { compressImage } from '../services/imageUtils';

interface PhotoCaptureModalProps {
  onPhotoCaptured: (base64Photo: string) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
}

export const PhotoCaptureModal: React.FC<PhotoCaptureModalProps> = ({
  onPhotoCaptured,
  onClose,
  title = 'Registro Fotográfico do Equipamento',
  subtitle = 'Tire uma foto nítida das avarias, defeitos ou estado físico do ativo'
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraFacing, setCameraFacing] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasCamera, setHasCamera] = useState(true);

  // Inicializa câmera
  const startCamera = async (facing: 'environment' | 'user') => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setHasCamera(true);
    } catch (err: any) {
      console.warn('Erro ao acessar câmera:', err);
      setCameraError('Câmera indisponível ou permissão negada. Você pode carregar uma foto da galeria.');
      setHasCamera(false);
    }
  };

  useEffect(() => {
    startCamera(cameraFacing);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraFacing]);

  // Capturar foto do stream
  const handleSnap = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    setIsCapturing(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawData = canvas.toDataURL('image/jpeg', 0.9);

    try {
      setIsProcessing(true);
      const compressed = await compressImage(rawData, 1000, 1000, 0.78);
      setPreviewPhoto(compressed);
    } catch (e) {
      setPreviewPhoto(rawData);
    } finally {
      setIsProcessing(false);
      setIsCapturing(false);
    }
  };

  // Carregar foto de arquivo local/galeria
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    try {
      const compressed = await compressImage(file, 1000, 1000, 0.78);
      setPreviewPhoto(compressed);
    } catch (err) {
      alert('Erro ao carregar e comprimir a imagem selecionada.');
    } finally {
      setIsProcessing(false);
      if (e.target) e.target.value = '';
    }
  };

  const handleConfirm = () => {
    if (previewPhoto) {
      onPhotoCaptured(previewPhoto);
      onClose();
    }
  };

  const handleRetake = () => {
    setPreviewPhoto(null);
  };

  const toggleCameraFacing = () => {
    setCameraFacing(prev => (prev === 'environment' ? 'user' : 'environment'));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border-2 border-slate-700 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-4 bg-slate-800/80 border-b border-slate-700/80 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <i className="fa-solid fa-camera text-base"></i>
            </div>
            <div>
              <h3 className="text-sm font-black text-white">{title}</h3>
              <p className="text-[10px] text-slate-400 font-bold line-clamp-1">{subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-colors"
          >
            <i className="fa-solid fa-xmark text-lg"></i>
          </button>
        </div>

        {/* Viewfinder / Preview Area */}
        <div className="relative aspect-square sm:aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
          {previewPhoto ? (
            <div className="relative w-full h-full flex items-center justify-center bg-slate-950">
              <img
                src={previewPhoto}
                alt="Foto Capturada"
                className="w-full h-full object-contain select-none"
              />
              <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/20 text-white text-[11px] font-bold flex items-center gap-1.5 shadow-lg">
                <i className="fa-solid fa-check-circle text-emerald-400"></i>
                Foto Pré-Visualizada
              </div>
            </div>
          ) : (
            <>
              {hasCamera && !cameraError ? (
                <>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {/* Grid de enquadramento fotográfico */}
                  <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-white/10">
                    <div className="border-r border-b border-white/10"></div>
                    <div className="border-r border-b border-white/10"></div>
                    <div className="border-b border-white/10"></div>
                    <div className="border-r border-b border-white/10"></div>
                    <div className="border-r border-b border-white/10"></div>
                    <div className="border-b border-white/10"></div>
                    <div className="border-r border-white/10"></div>
                    <div className="border-r border-white/10"></div>
                    <div></div>
                  </div>

                  {/* Mira de foco nos cantos */}
                  <div className="absolute inset-10 pointer-events-none border-2 border-white/30 rounded-2xl">
                    <div className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-amber-400 rounded-tl-lg"></div>
                    <div className="absolute -top-1 -right-1 w-5 h-5 border-t-2 border-r-2 border-amber-400 rounded-tr-lg"></div>
                    <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-2 border-l-2 border-amber-400 rounded-bl-lg"></div>
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-amber-400 rounded-br-lg"></div>
                  </div>

                  {/* Flash shutter feedback */}
                  {isCapturing && (
                    <div className="absolute inset-0 bg-white animate-out fade-out duration-300 pointer-events-none z-20"></div>
                  )}

                  {/* Alternar câmera frontal/traseira */}
                  <button
                    type="button"
                    onClick={toggleCameraFacing}
                    className="absolute top-3 right-3 bg-black/60 hover:bg-black/80 text-white w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-md border border-white/20 shadow-lg transition-all active:scale-95 z-10"
                    title="Alternar Câmera"
                  >
                    <i className="fa-solid fa-camera-rotate text-sm"></i>
                  </button>
                </>
              ) : (
                <div className="p-8 text-center text-slate-400 max-w-sm space-y-4">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto text-2xl">
                    <i className="fa-solid fa-triangle-exclamation"></i>
                  </div>
                  <p className="text-xs font-bold leading-relaxed">{cameraError || 'Câmera não disponível.'}</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg inline-flex items-center gap-2"
                  >
                    <i className="fa-solid fa-upload"></i> Carregar da Galeria
                  </button>
                </div>
              )}
            </>
          )}

          {isProcessing && (
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30">
              <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-xs font-bold text-white uppercase tracking-wider">Otimizando Foto...</p>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
        />

        {/* Footer Controls */}
        <div className="p-4 bg-slate-800/95 border-t border-slate-700 flex items-center justify-between gap-3">
          {previewPhoto ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                className="flex-1 py-3 px-4 rounded-xl border border-slate-600 text-slate-300 hover:bg-slate-700 font-bold text-xs uppercase flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                <i className="fa-solid fa-rotate-left"></i> Tirar Outra
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all active:scale-95"
              >
                <i className="fa-solid fa-check"></i> Usar Esta Foto
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-3 px-4 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs uppercase flex items-center gap-2 transition-all active:scale-95"
                title="Carregar foto salva"
              >
                <i className="fa-solid fa-images text-sm"></i>
                <span className="hidden sm:inline">Galeria</span>
              </button>

              {hasCamera && !cameraError && (
                <button
                  type="button"
                  onClick={handleSnap}
                  disabled={isCapturing}
                  className="flex-1 py-3 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all border-b-4 border-amber-600"
                >
                  <i className="fa-solid fa-camera text-base"></i>
                  <span>Capturar Foto</span>
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="py-3 px-4 rounded-xl border border-slate-700 text-slate-400 hover:text-white font-bold text-xs uppercase transition-all"
              >
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
