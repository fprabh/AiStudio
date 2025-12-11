import React, { useState } from 'react';
import { compressImage } from '../utils';

interface PhotoGalleryModalProps {
  photos: string[];
  readOnly: boolean;
  title?: string;
  onClose: () => void;
  onUpdate?: (newPhotos: string[]) => void;
}

const PhotoGalleryModal: React.FC<PhotoGalleryModalProps> = ({ photos, readOnly, title = "Photo Gallery", onClose, onUpdate }) => {
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number>(0);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && onUpdate) {
      const files = Array.from(e.target.files);
      const remainingSlots = 5 - photos.length;
      const filesToProcess = files.slice(0, remainingSlots);

      const processed = await Promise.all(filesToProcess.map(f => compressImage(f as File)));
      onUpdate([...photos, ...processed]);
    }
  };

  const handleDelete = (index: number) => {
    if (onUpdate) {
        const newPhotos = photos.filter((_, i) => i !== index);
        onUpdate(newPhotos);
        if (selectedPhotoIndex >= newPhotos.length) {
            setSelectedPhotoIndex(Math.max(0, newPhotos.length - 1));
        }
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[60] p-4">
      <div className="relative w-full max-w-4xl h-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center text-white mb-4">
            <h3 className="text-xl font-bold">{title}</h3>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>

        {/* Main Display */}
        <div className="flex-1 bg-black flex items-center justify-center overflow-hidden rounded-lg relative border border-gray-800">
            {photos.length > 0 ? (
                <img 
                    src={photos[selectedPhotoIndex]} 
                    alt={`Proof ${selectedPhotoIndex + 1}`} 
                    className="max-w-full max-h-full object-contain"
                />
            ) : (
                <div className="text-gray-500">No photos attached</div>
            )}
            
            {/* Delete Button (Overlay) */}
            {!readOnly && photos.length > 0 && (
                <button 
                    onClick={() => handleDelete(selectedPhotoIndex)}
                    className="absolute top-4 right-4 bg-red-600 text-white p-2 rounded-full hover:bg-red-700 shadow-lg"
                    title="Delete this photo"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                </button>
            )}
        </div>

        {/* Thumbnails & Actions */}
        <div className="mt-4 flex gap-4 overflow-x-auto pb-2 items-center min-h-[80px]">
             {photos.map((photo, idx) => (
                 <button
                    key={idx}
                    onClick={() => setSelectedPhotoIndex(idx)}
                    className={`relative flex-shrink-0 w-20 h-20 rounded-md overflow-hidden border-2 transition-all ${selectedPhotoIndex === idx ? 'border-brand-red opacity-100' : 'border-transparent opacity-60 hover:opacity-100'}`}
                 >
                     <img src={photo} className="w-full h-full object-cover" alt="thumb" />
                 </button>
             ))}

             {/* Add Button */}
             {!readOnly && photos.length < 5 && (
                 <label className="flex-shrink-0 w-20 h-20 rounded-md border-2 border-dashed border-gray-600 flex flex-col items-center justify-center text-gray-400 hover:text-white hover:border-gray-400 cursor-pointer transition-colors">
                     <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                         <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                     </svg>
                     <span className="text-[10px]">Add Photo</span>
                     <input type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
                 </label>
             )}
        </div>
        <div className="text-center text-gray-400 text-xs mt-2">
            {photos.length} / 5 photos
        </div>
      </div>
    </div>
  );
};

export default PhotoGalleryModal;