import React, { useState } from 'react';
import { Asset } from '../types';

interface PhotoViewerModalProps {
  asset: Asset;
  onClose: () => void;
}

export const PhotoViewerModal: React.FC<PhotoViewerModalProps> = ({ asset, onClose }) => {
  const fotos = asset.fotos || [];
  const [currentIndex, setCurrentIndex] = useState(0);

  if (fotos.length === 0) return null;

  const currentPhoto = fotos[currentIndex] || fotos[0];

  const handleNext = () => {
    setCurrentIndex(prev => (prev + 1) % fotos.length);
  };

  const handlePrev = () => {
    setCurrentIndex(prev => (prev - 1 + fotos.length) % fotos.length);
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = currentPhoto;
    link.download = `evidencia_${asset.NumeroPatrimonio || 'ativo'}_${currentIndex + 1}.jpg`;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/95 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl bg-slate-900 border-2 border-slate-700 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[94vh]">
        
        {/* Header */}
        <div className="p-4 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-black">
              <i className="fa-solid fa-camera"></i>
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-white">
                  {asset.marca} {asset.modelo}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border uppercase ${
                  asset.EstadoEquipamento === 'DANIFICADO' 
                    ? 'bg-red-500/20 text-red-400 border-red-500/40' 
                    : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                }`}>
                  {asset.EstadoEquipamento}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-mono">
                Patrimônio: <strong className="text-white">{asset.NumeroPatrimonio}</strong> | S/N: <strong className="text-blue-400">{asset.serial}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="p-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition-colors text-xs font-bold flex items-center gap-1.5 border border-slate-700"
              title="Baixar Foto"
            >
              <i className="fa-solid fa-download"></i>
              <span className="hidden sm:inline">Baixar</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-10 h-10 rounded-xl bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-colors"
            >
              <i className="fa-solid fa-xmark text-lg"></i>
            </button>
          </div>
        </div>

        {/* Main Photo Display */}
        <div className="relative flex-1 bg-black flex items-center justify-center min-h-[300px] sm:min-h-[420px] overflow-hidden group">
          <img
            src={currentPhoto}
            alt={`Evidência fotográfica ${currentIndex + 1}`}
            className="max-h-[65vh] w-auto max-w-full object-contain select-none"
          />

          {/* Navigation Arrows for multi-photo */}
          {fotos.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 backdrop-blur-sm transition-all active:scale-90"
                title="Foto anterior"
              >
                <i className="fa-solid fa-chevron-left text-lg"></i>
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center border border-white/20 backdrop-blur-sm transition-all active:scale-90"
                title="Próxima foto"
              >
                <i className="fa-solid fa-chevron-right text-lg"></i>
              </button>
            </>
          )}

          {/* Counter pill */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/70 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 text-white text-xs font-bold">
            Foto {currentIndex + 1} de {fotos.length}
          </div>
        </div>

        {/* Observation / Details Footer */}
        <div className="p-4 bg-slate-800/95 border-t border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="space-y-1 flex-1">
            <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">Observação / Laudo das Avarias:</p>
            <p className="text-xs text-slate-200 font-medium leading-relaxed italic">
              {asset.observacao ? `"${asset.observacao}"` : 'Nenhuma observação textual preenchida.'}
            </p>
          </div>

          {/* Thumbnail list if multiple photos */}
          {fotos.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 sm:pb-0">
              {fotos.map((f, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setCurrentIndex(i)}
                  className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all flex-shrink-0 ${
                    i === currentIndex ? 'border-amber-400 scale-105 shadow-md shadow-amber-500/20' : 'border-slate-700 opacity-60 hover:opacity-100'
                  }`}
                >
                  <img src={f} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
