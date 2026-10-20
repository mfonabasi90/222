import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import { extractFacialMetrics, FacialMetrics } from '../utils/faceAnalysis';
import { drawFaceAnalysis, DrawOptions } from '../utils/drawing';

interface FaceCanvasProps {
  image: string | null;
  label: string;
  onMetricsExtracted: (metrics: FacialMetrics | null) => void;
  onLoadingChange: (loading: boolean) => void;
  onError: (error: string | null) => void;
  drawOptions: DrawOptions;
}

export default function FaceCanvas({
  image,
  label,
  onMetricsExtracted,
  onLoadingChange,
  onError,
  drawOptions,
}: FaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [detection, setDetection] = useState<faceapi.FaceLandmarks68 | null>(null);
  const [noFace, setNoFace] = useState(false);

  useEffect(() => {
    if (!image || !canvasRef.current) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = image;
    imgRef.current = img;

    img.onload = async () => {
      onLoadingChange(true);
      onError(null);
      setNoFace(false);

      try {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;

        // Scale image to fit canvas max dimensions
        const maxW = 500;
        const maxH = 500;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        const scale = Math.min(maxW / w, maxH / h, 1);
        w = Math.floor(w * scale);
        h = Math.floor(h * scale);

        canvas.width = w;
        canvas.height = h;

        // Draw image
        ctx.drawImage(img, 0, 0, w, h);

        // Detect face landmarks
        const result = await faceapi.detectSingleFace(canvas).withFaceLandmarks();

        if (!result) {
          setNoFace(true);
          setDetection(null);
          onMetricsExtracted(null);
          onLoadingChange(false);
          return;
        }

        const landmarks = result.landmarks;
        setDetection(landmarks);

        // Extract metrics
        const metrics = extractFacialMetrics(landmarks);
        onMetricsExtracted(metrics);

        // Draw analysis
        drawFaceAnalysis(ctx, landmarks, drawOptions, w, h);
      } catch (err) {
        console.error('Face detection error:', err);
        onError('Failed to detect face. Please try another image.');
      }

      onLoadingChange(false);
    };

    img.onerror = () => {
      onError('Failed to load image.');
      onLoadingChange(false);
    };
  }, [image]);

  // Redraw when options change
  useEffect(() => {
    if (!detection || !canvasRef.current || !imgRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const img = imgRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    drawFaceAnalysis(ctx, detection, drawOptions, canvas.width, canvas.height);
  }, [drawOptions, detection]);

  return (
    <div className="flex flex-col items-center">
      <h3 className="text-lg font-semibold mb-3 text-white">{label}</h3>
      <div className="relative bg-gray-800 rounded-xl overflow-hidden border border-gray-700 shadow-lg">
        <canvas
          ref={canvasRef}
          className="block max-w-full"
          style={{ maxHeight: '500px' }}
        />
        {!image && (
          <div className="w-[400px] h-[300px] flex items-center justify-center text-gray-500">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p>Upload an image to begin</p>
            </div>
          </div>
        )}
        {noFace && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
            <div className="text-center text-red-400">
              <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <p className="font-medium">No face detected</p>
              <p className="text-sm text-gray-400 mt-1">Please upload a clear front-facing photo</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
