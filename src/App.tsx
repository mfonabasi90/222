import { useState, useEffect, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import FaceCanvas, { ImageAnalysisResult } from './components/FaceCanvas';
import AnalysisResults from './components/AnalysisResults';
import { DrawOptions } from './utils/drawing';

const MODEL_URLS = [
  'https://justadudewhohacks.github.io/face-api.js/models/',
  'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights/',
  'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/',
];

function App() {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);

  // Multi-image support: arrays of images per person
  const [images1, setImages1] = useState<string[]>([]);
  const [images2, setImages2] = useState<string[]>([]);
  const [results1, setResults1] = useState<ImageAnalysisResult[]>([]);
  const [results2, setResults2] = useState<ImageAnalysisResult[]>([]);
  const [loading1, setLoading1] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const [error1, setError1] = useState<string | null>(null);
  const [error2, setError2] = useState<string | null>(null);

  // Visualization options
  const [drawOptions, setDrawOptions] = useState<DrawOptions>({
    showLandmarks: true,
    showPoseAxes: true,
    showEyeAngles: true,
    showNoseLines: true,
    showMouthLines: true,
    showJawLine: true,
    showOcclusion: true,
    showMeasurements: true,
    showQualityIndicators: true,
  });

  // Analysis options
  const [ageNormalized, setAgeNormalized] = useState(false);
  const [showUncertainty, setShowUncertainty] = useState(true);

  // Load models
  useEffect(() => {
    const loadModels = async () => {
      setLoadingModels(true);
      setModelError(null);

      for (const url of MODEL_URLS) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          await Promise.race([
            (async () => {
              await faceapi.nets.tinyFaceDetector.loadFromUri(url);
              await faceapi.nets.faceLandmark68Net.loadFromUri(url);
            })(),
            new Promise((_, reject) => {
              controller.signal.addEventListener('abort', () => reject(new Error('Timeout')));
            })
          ]);

          clearTimeout(timeoutId);
          setModelsLoaded(true);
          setLoadingModels(false);
          return;
        } catch (err) {
          console.warn(`Failed to load models from ${url}:`, err);
          continue;
        }
      }

      setModelError(
        'Failed to load AI models. This usually means:\n' +
        '• No internet connection (models are downloaded from CDN)\n' +
        '• CDN is temporarily unavailable\n\n' +
        'Please check your internet connection and refresh.'
      );
      setLoadingModels(false);
    };
    loadModels();
  }, []);

  // Handle file upload (add to array)
  const handleFileUpload = useCallback((setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files) {
        Array.from(files).forEach(file => {
          const reader = new FileReader();
          reader.onload = (event) => {
            setter(prev => [...prev, event.target?.result as string]);
          };
          reader.readAsDataURL(file);
        });
      }
      e.target.value = ''; // Reset input
    };
  }, []);

  const handleDrop = useCallback((setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    return (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files) {
        Array.from(files).forEach(file => {
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (event) => {
              setter(prev => [...prev, event.target?.result as string]);
            };
            reader.readAsDataURL(file);
          }
        });
      }
    };
  }, []);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  // Handle analysis result from a single image (keyed by image URL so results stay
  // aligned with images even when earlier thumbnails are removed)
  const makeResultHandler = useCallback((setter: React.Dispatch<React.SetStateAction<ImageAnalysisResult[]>>) => {
    return (result: ImageAnalysisResult | null, imageUrl: string) => {
      setter(prev => {
        const idx = prev.findIndex(r => r && r.imageUrl === imageUrl);
        const next = [...prev];
        if (result) {
          if (idx >= 0) next[idx] = result;
          else next.push(result);
        } else if (idx >= 0) {
          next.splice(idx, 1);
        }
        return next.filter(Boolean);
      });
    };
  }, []);

  const handleResult1 = makeResultHandler(setResults1);
  const handleResult2 = makeResultHandler(setResults2);

  const removeImage = useCallback((
    imgSetter: React.Dispatch<React.SetStateAction<string[]>>,
    resSetter: React.Dispatch<React.SetStateAction<ImageAnalysisResult[]>>,
    index: number
  ) => {
    let removedUrl: string | undefined;
    imgSetter(prev => {
      removedUrl = prev[index];
      return prev.filter((_, i) => i !== index);
    });
    resSetter(prev => prev.filter(r => r.imageUrl !== removedUrl));
  }, []);

  const toggleDrawOption = (key: keyof DrawOptions) => {
    setDrawOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Loading screen
  if (loadingModels) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-blue-500/30 rounded-full animate-spin border-t-blue-500"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
          </div>
          <p className="text-white mt-6 text-lg font-medium">Loading AI Models...</p>
          <p className="text-gray-400 mt-2 text-sm">Initializing face detection engine</p>
        </div>
      </div>
    );
  }

  // Error screen
  if (modelError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center bg-gray-800 p-8 rounded-2xl border border-red-500/30 max-w-md">
          <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-bold text-white mb-2">Model Loading Error</h2>
          <p className="text-gray-400 mb-4 whitespace-pre-line">{modelError}</p>
          <button onClick={() => window.location.reload()} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <header className="border-b border-gray-700/50 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Face Similarity Analyzer</h1>
              <p className="text-xs text-gray-400">Pose-normalized • Uncertainty-aware • Age-fair</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-xs text-green-400">Models Ready</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* Upload Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-6">
          {/* Person 1 */}
          <PersonSection
            label="Person 1"
            images={images1}
            results={results1}
            loading={loading1}
            error={error1}
            onFileUpload={handleFileUpload(setImages1)}
            onDrop={handleDrop(setImages1)}
            onDragOver={handleDragOver}
            onRemoveImage={(i) => removeImage(setImages1, setResults1, i)}
            onResult={handleResult1}
            onLoadingChange={setLoading1}
            onError={setError1}
            drawOptions={drawOptions}
            modelsReady={modelsLoaded}
            accentColor="blue"
          />

          {/* Person 2 */}
          <PersonSection
            label="Person 2"
            images={images2}
            results={results2}
            loading={loading2}
            error={error2}
            onFileUpload={handleFileUpload(setImages2)}
            onDrop={handleDrop(setImages2)}
            onDragOver={handleDragOver}
            onRemoveImage={(i) => removeImage(setImages2, setResults2, i)}
            onResult={handleResult2}
            onLoadingChange={setLoading2}
            onError={setError2}
            drawOptions={drawOptions}
            modelsReady={modelsLoaded}
            accentColor="purple"
          />
        </div>

        {/* Options Panel */}
        <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Visualization Options */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Visualization</h3>
              <div className="space-y-2">
                {[
                  { key: 'showLandmarks' as keyof DrawOptions, label: 'Landmarks', color: 'bg-green-500' },
                  { key: 'showPoseAxes' as keyof DrawOptions, label: 'Pose Axes', color: 'bg-yellow-500' },
                  { key: 'showEyeAngles' as keyof DrawOptions, label: 'Eye Angles', color: 'bg-red-500' },
                  { key: 'showNoseLines' as keyof DrawOptions, label: 'Nose', color: 'bg-blue-400' },
                  { key: 'showMouthLines' as keyof DrawOptions, label: 'Mouth', color: 'bg-pink-400' },
                  { key: 'showJawLine' as keyof DrawOptions, label: 'Jaw', color: 'bg-purple-400' },
                  { key: 'showOcclusion' as keyof DrawOptions, label: 'Occlusion', color: 'bg-red-600' },
                  { key: 'showMeasurements' as keyof DrawOptions, label: 'Measurements', color: 'bg-gray-400' },
                  { key: 'showQualityIndicators' as keyof DrawOptions, label: 'Quality Dots', color: 'bg-green-400' },
                ].map(({ key, label, color }) => (
                  <label key={key} className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-all ${drawOptions[key] ? 'bg-gray-700' : 'bg-gray-900/50 opacity-50'}`}>
                    <input type="checkbox" checked={drawOptions[key]} onChange={() => toggleDrawOption(key)} className="sr-only" />
                    <span className={`w-2.5 h-2.5 rounded-full ${color}`}></span>
                    <span className="text-xs text-gray-300">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Analysis Options */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">Analysis</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={`w-10 h-5 rounded-full transition-colors ${ageNormalized ? 'bg-blue-600' : 'bg-gray-600'} relative`}>
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${ageNormalized ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
                  </div>
                  <input type="checkbox" checked={ageNormalized} onChange={() => setAgeNormalized(!ageNormalized)} className="sr-only" />
                  <div>
                    <span className="text-xs text-gray-300 block">Age-normalized view</span>
                    <span className="text-xs text-gray-500">Subtract expected developmental changes</span>
                  </div>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <div className={`w-10 h-5 rounded-full transition-colors ${showUncertainty ? 'bg-blue-600' : 'bg-gray-600'} relative`}>
                    <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${showUncertainty ? 'translate-x-5' : 'translate-x-0.5'}`}></div>
                  </div>
                  <input type="checkbox" checked={showUncertainty} onChange={() => setShowUncertainty(!showUncertainty)} className="sr-only" />
                  <div>
                    <span className="text-xs text-gray-300 block">Show uncertainty intervals</span>
                    <span className="text-xs text-gray-500">Display 95% CI on all values</span>
                  </div>
                </label>
              </div>
            </div>

            {/* Info */}
            <div>
              <h3 className="text-sm font-semibold text-white mb-3">What's Measured</h3>
              <div className="text-xs text-gray-400 space-y-1">
                <p>• Canthal tilt (identity-stable)</p>
                <p>• Eye aspect ratio (stable)</p>
                <p>• Nose proportions (age-varying)</p>
                <p>• Face H/W ratio (age-varying)</p>
                <p>• Jaw angle (moderately stable)</p>
                <p>• Cheek width ratio (age-varying)</p>
                <p>• Eyebrow angle (style-sensitive)</p>
                <p>• Philtrum ratio (stable)</p>
                <p className="text-gray-500 mt-2">All computed in pose-normalized frame.</p>
                <p className="text-gray-500">Head tilt is NOT scored (it's pose).</p>
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        {results1.length > 0 && results2.length > 0 && (
          <AnalysisResults
            results1={results1}
            results2={results2}
            ageNormalized={ageNormalized}
            showUncertainty={showUncertainty}
          />
        )}

        {/* Instructions when no results */}
        {results1.length === 0 && results2.length === 0 && (
          <div className="max-w-2xl mx-auto mt-6">
            <div className="bg-gray-800/30 rounded-2xl p-8 border border-gray-700/50">
              <h3 className="text-xl font-semibold text-white mb-4 text-center">How It Works</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {[
                  { icon: '📸', title: 'Upload Photos', desc: 'One or more per person. Front-facing works best.' },
                  { icon: '🔄', title: 'Pose Normalize', desc: 'Head pose estimated and removed from measurements.' },
                  { icon: '📊', title: 'Measure', desc: '13 metrics with uncertainty intervals and quality flags.' },
                  { icon: '⚖️', title: 'Compare', desc: 'Calibrated score accounting for age, pose, and occlusion.' },
                ].map(({ icon, title, desc }) => (
                  <div key={title} className="text-center">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center mx-auto mb-2">
                      <span className="text-xl">{icon}</span>
                    </div>
                    <h4 className="text-xs font-medium text-white mb-1">{title}</h4>
                    <p className="text-xs text-gray-400">{desc}</p>
                  </div>
                ))}
              </div>
              <div className="mt-6 pt-4 border-t border-gray-700/50 text-center">
                <p className="text-xs text-yellow-400/70">
                  ⚠️ Research tool only. Not for forensic identification. All processing is local — no images leave your browser.
                </p>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-gray-700/50 mt-8 py-4">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-xs">
          <p>Face Similarity Analyzer • Pose-normalized • Uncertainty-aware • Age-fair • All processing local</p>
        </div>
      </footer>
    </div>
  );
}

// ─── Person Section Component ────────────────────────────────────────────────

interface PersonSectionProps {
  label: string;
  images: string[];
  results: ImageAnalysisResult[];
  loading: boolean;
  error: string | null;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onRemoveImage: (index: number) => void;
  onResult: (result: ImageAnalysisResult | null, imageUrl: string) => void;
  onLoadingChange: (loading: boolean) => void;
  onError: (error: string | null) => void;
  drawOptions: DrawOptions;
  modelsReady: boolean;
  accentColor: string;
}

function PersonSection({
  label, images, loading, error, onFileUpload, onDrop, onDragOver,
  onRemoveImage, onResult, onLoadingChange, onError, drawOptions, modelsReady, accentColor
}: PersonSectionProps) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputId = `upload-${label.replace(' ', '')}`;

  // Ensure selectedIdx is valid
  const safeIdx = Math.min(selectedIdx, Math.max(0, images.length - 1));

  return (
    <div className="space-y-3">
      {/* Upload area */}
      <div
        className={`border-2 border-dashed border-gray-600 rounded-xl p-3 text-center hover:border-${accentColor}-500/50 transition-colors cursor-pointer`}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onClick={() => document.getElementById(inputId)?.click()}
      >
        <input
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={onFileUpload}
        />
        <div className="flex items-center justify-center gap-2 text-gray-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span className="text-xs">Drop image(s) here or click (multiple supported)</span>
        </div>
      </div>

      {error && <p className="text-red-400 text-xs text-center">{error}</p>}
      {loading && (
        <div className="flex items-center justify-center gap-2 text-blue-400">
          <div className="w-3 h-3 border-2 border-blue-400/30 rounded-full animate-spin border-t-blue-400"></div>
          <span className="text-xs">Analyzing...</span>
        </div>
      )}

      {/* Thumbnails */}
      {images.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              <img
                src={img}
                alt={`${label} ${i + 1}`}
                className={`w-14 h-14 object-cover rounded-lg cursor-pointer border-2 transition-all ${
                  i === safeIdx ? 'border-blue-500' : 'border-gray-700 hover:border-gray-500'
                }`}
                onClick={() => setSelectedIdx(i)}
              />
              <button
                onClick={(e) => { e.stopPropagation(); onRemoveImage(i); }}
                className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Canvas */}
      {images.length > 0 && (
        <FaceCanvas
          image={images[safeIdx]}
          label={`${label} (Image ${safeIdx + 1}/${images.length})`}
          onAnalysisComplete={(result, imageUrl) => onResult(result, imageUrl)}
          onLoadingChange={onLoadingChange}
          onError={onError}
          drawOptions={drawOptions}
          modelsReady={modelsReady}
        />
      )}
      {images.length === 0 && (
        <FaceCanvas
          image={null}
          label={label}
          onAnalysisComplete={() => {}}
          onLoadingChange={() => {}}
          onError={() => {}}
          drawOptions={drawOptions}
          modelsReady={modelsReady}
        />
      )}
    </div>
  );
}

export default App;
