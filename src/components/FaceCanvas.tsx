import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';
import {
  Point, Pose, estimatePose, canonicalizeLandmarks,
  readLensInfo, undistortLandmarks, LensInfo
} from '../utils/geometry';
import { computeAllMetrics, detectOcclusion, MetricResult, OcclusionMap } from '../utils/metrics';
import { estimateAge, AgeEstimate } from '../utils/analysis';
import { drawFaceAnalysis, DrawOptions } from '../utils/drawing';

export interface ImageAnalysisResult {
  imageUrl: string;
  landmarks: Point[];
  canonicalLandmarks: Point[];
  pose: Pose;
  occlusion: OcclusionMap;
  metrics: MetricResult[];
  ageEstimate: AgeEstimate;
  lensInfo: LensInfo;
  quality: 'good' | 'fair' | 'poor';
}

interface FaceCanvasProps {
  image: string | null;
  label: string;
  onAnalysisComplete: (result: ImageAnalysisResult | null, imageUrl: string) => void;
  onLoadingChange: (loading: boolean) => void;
  onError: (error: string | null) => void;
  drawOptions: DrawOptions;
  modelsReady: boolean;
}

export default function FaceCanvas({
  image,
  label,
  onAnalysisComplete,
  onLoadingChange,
  onError,
  drawOptions,
  modelsReady,
}: FaceCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const lastReportedUrlRef = useRef<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<ImageAnalysisResult | null>(null);
  const [noFace, setNoFace] = useState(false);

  useEffect(() => {
    if (!image || !canvasRef.current || !modelsReady) return;

    let cancelled = false;
    lastReportedUrlRef.current = null;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = image;
    imgRef.current = img;

    img.onload = async () => {
      if (cancelled) return;

      onLoadingChange(true);
      onError(null);
      setNoFace(false);

      try {
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext('2d')!;

        // Scale image
        const maxW = 500;
        const maxH = 500;
        let w = img.naturalWidth;
        let h = img.naturalHeight;
        const scale = Math.min(maxW / w, maxH / h, 1);
        w = Math.floor(w * scale);
        h = Math.floor(h * scale);

        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(img, 0, 0, w, h);

        // Detect face
        const options = new faceapi.TinyFaceDetectorOptions({
          inputSize: 416,
          scoreThreshold: 0.3,
        });

        const result = await faceapi
          .detectSingleFace(canvas, options)
          .withFaceLandmarks();

        if (cancelled) return;

        if (!result) {
          setNoFace(true);
          setAnalysisResult(null);
          if (lastReportedUrlRef.current !== image) {
            lastReportedUrlRef.current = image;
            onAnalysisComplete(null, image);
          }
          onLoadingChange(false);
          return;
        }

        // Extract landmarks as simple points
        const rawLandmarks: Point[] = result.landmarks.positions.map(p => ({ x: p.x, y: p.y }));

        // Estimate face size ratio for lens estimation
        const box = result.detection.box;
        const faceSizeRatio = (box.width * box.height) / (w * h);

        // Read lens info
        const lensInfo = await readLensInfo(image, faceSizeRatio);

        // Apply lens undistortion if needed
        const undistorted = undistortLandmarks(rawLandmarks, lensInfo, { width: w, height: h });

        // Detect occlusion
        const occlusion = detectOcclusion(undistorted);

        // Estimate pose
        const pose = estimatePose(undistorted);

        // Canonicalize landmarks (pose-normalize)
        const canonicalLandmarks = canonicalizeLandmarks(undistorted, pose);

        // Compute metrics in canonical frame
        const metrics = computeAllMetrics(canonicalLandmarks, occlusion);

        // Estimate age
        const ageEstimate = estimateAge(metrics);

        // Determine quality
        const goodMetrics = metrics.filter(m => m.quality === 'good' && !m.isOccluded).length;
        const totalMetrics = metrics.filter(m => !m.isOccluded).length;
        const quality = goodMetrics / totalMetrics > 0.7 ? 'good' : goodMetrics / totalMetrics > 0.4 ? 'fair' : 'poor';

        const analysisResult: ImageAnalysisResult = {
          imageUrl: image,
          landmarks: undistorted,
          canonicalLandmarks,
          pose,
          occlusion,
          metrics,
          ageEstimate,
          lensInfo,
          quality,
        };

        setAnalysisResult(analysisResult);
        if (lastReportedUrlRef.current !== image) {
          lastReportedUrlRef.current = image;
          onAnalysisComplete(analysisResult, image);
        }

        // Draw analysis
        drawFaceAnalysis(ctx, undistorted, canonicalLandmarks, pose, occlusion, drawOptions, w, h);
      } catch (err) {
        if (cancelled) return;
        console.error('Face detection error:', err);
        const message = err instanceof Error ? err.message : 'Failed to detect face';
        onError(message + '. Please try another image.');
        onLoadingChange(false);
      }

      if (!cancelled) {
        onLoadingChange(false);
      }
    };

    img.onerror = () => {
      if (cancelled) return;
      onError('Failed to load image.');
      onLoadingChange(false);
    };

    return () => { cancelled = true; };
  }, [image, modelsReady]);

  // Redraw when options change or a new analysis completes
  useEffect(() => {
    if (!analysisResult || !canvasRef.current || !imgRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const img = imgRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    drawFaceAnalysis(
      ctx,
      analysisResult.landmarks,
      analysisResult.canonicalLandmarks,
      analysisResult.pose,
      analysisResult.occlusion,
      drawOptions,
      canvas.width,
      canvas.height
    );
  }, [drawOptions, analysisResult]);

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
      {analysisResult && (
        <div className="mt-3 text-xs text-gray-400 space-y-1 w-full max-w-[400px]">
          <div className="flex justify-between">
            <span>Pose: R={analysisResult.pose.roll.toFixed(1)}° P={analysisResult.pose.pitch.toFixed(1)}° Y={analysisResult.pose.yaw.toFixed(1)}°</span>
            <span className={analysisResult.quality === 'good' ? 'text-green-400' : analysisResult.quality === 'fair' ? 'text-yellow-400' : 'text-red-400'}>
              Quality: {analysisResult.quality}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Age est: {analysisResult.ageEstimate.estimatedAge}yr [{analysisResult.ageEstimate.confidenceInterval[0]}-{analysisResult.ageEstimate.confidenceInterval[1]}]</span>
            {analysisResult.lensInfo.distortionWarning && (
              <span className="text-yellow-400">⚠️ Wide-angle lens</span>
            )}
          </div>
          {analysisResult.occlusion.overallConfidence < 0.9 && (
            <div className="text-yellow-400">
              ⚠️ Possible occlusion detected (confidence: {(analysisResult.occlusion.overallConfidence * 100).toFixed(0)}%)
            </div>
          )}
        </div>
      )}
    </div>
  );
}
