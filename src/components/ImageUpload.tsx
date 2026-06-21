import React, { useCallback } from 'react';
import { Upload, Image as ImageIcon } from 'lucide-react';

interface ImageUploadProps {
  onImagesSelected: (files: File[]) => void;
}

export const ImageUpload: React.FC<ImageUploadProps> = ({ onImagesSelected }) => {
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      onImagesSelected(filesArray);
    }
  }, [onImagesSelected]);

  return (
    <div className="flex flex-col items-center justify-center w-full max-w-2xl mx-auto p-8 border-2 border-dashed border-slate-300 rounded-2xl bg-white/50 backdrop-blur-sm hover:border-blue-400 transition-colors cursor-pointer group relative">
      <input
        type="file"
        multiple
        accept="image/*"
        onChange={handleFileChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
      />
      <div className="flex flex-col items-center gap-4 text-slate-600 group-hover:text-blue-500 transition-colors">
        <div className="p-4 bg-slate-100 rounded-full group-hover:bg-blue-50 transition-colors">
          <Upload className="w-8 h-8" />
        </div>
        <div className="text-center">
          <p className="text-lg font-semibold">동화책 이미지를 업로드하세요</p>
          <p className="text-sm text-slate-400 mt-1">여러 장의 이미지를 한꺼번에 선택할 수 있습니다.</p>
        </div>
      </div>
    </div>
  );
};
