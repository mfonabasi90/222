import { useState, useEffect, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import FaceCanvas from './components/FaceCanvas';
import AnalysisResults from './components/AnalysisResults';
import { FacialMetrics } from './utils/faceAnalysis';
import { DrawOptions } from './utils/drawing';

const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';

function App() {
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [loadingModels, setLoadingModels] = useState(true);
  const [modelError, setModelError] = useState<string | null>(null);

  const [image1, setImage1] = useState<string | null>(null);
  const [image2, setImage2] = useState<string | null>(null);
  const [metrics1, setMetrics1] = useState<FacialMetrics | null>(null);
  const [metrics2, setMetrics2] = useState<FacialMetrics | null>(null);
  const [loading1, setLoading1] = useState(false);
  const [loading2, setLoading2] = useState(false);
  const [error1, setError1] = useState<string | null>(null);
  const [error2, setError2] = useState<string | null>(null);

  const [drawOptions, setDrawOptions] = useState<DrawOptions>({
    showLandmarks: true,
    showEyeAngles: true,
    showHeadTilt: true,
    showNoseLines: true,
    showMouthLines: true,
    showCheekPoints: true,
    showJawLine: true,
    showBrowAngles: true,
    showMeasurements: true,
  });

  // Load face-api.js models
  useEffect(() => {
    const loadModels = async () => {
      try {
        setLoadingModels(true);
        setModelError(null);
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
        setModelsLoaded(true);
      } catch (err) {
        console.error('Error loading models:', err);
        setModelError('Failed to load face detection models. Please check your internet connection and refresh.');
      }
      setLoadingModels(false);
    };
    loadModels();
  }, []);

  const handleFileUpload = useCallback((setter: (url: string) => void) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setter(event.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    };
  }, []);

  const handleDrop = useCallback((setter: (url: string) => void) => {
    return (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setter(event.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
    };
  }, []);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const toggleOption = (key: keyof DrawOptions) => {
    setDrawOptions(prev => ({ ...prev, [key]: !prev[key] }));
  };

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

  if (modelError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center">
        <div className="text-center bg-gray-800 p-8 rounded-2xl border border-red-500/30 max-w-md">
          <svg className="w-16 h-16 text-red-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="text-xl font-bold text-white mb-2">Model Loading Error</h2>
          <p className="text-gray-400 mb-4">{modelError}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
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
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Face Similarity Analyzer</h1>
              <p className="text-xs text-gray-400">AI-powered facial feature comparison</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-xs text-green-400">Models Ready</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Upload Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Person 1 */}
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-gray-600 rounded-xl p-4 text-center hover:border-blue-500/50 transition-colors cursor-pointer"
              onDrop={handleDrop(setImage1)}
              onDragOver={handleDragOver}
              onClick={() => document.getElementById('upload1')?.click()}
            >
              <input
                id="upload1"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload(setImage1)}
              />
              <div className="flex items-center justify-center gap-2 text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span className="text-sm">Drop image here or click to upload</span>
              </div>
            </div>
            {error1 && <p className="text-red-400 text-sm text-center">{error1}</p>}
            {loading1 && (
              <div className="flex items-center justify-center gap-2 text-blue-400">
                <div className="w-4 h-4 border-2 border-blue-400/30 rounded-full animate-spin border-t-blue-400"></div>
                <span className="text-sm">Analyzing face...</span>
              </div>
            )}
            <FaceCanvas
              image={image1}
              label="Person 1"
              onMetricsExtracted={setMetrics1}
              onLoadingChange={setLoading1}
              onError={setError1}
              drawOptions={drawOptions}
            />
          </div>

          {/* Person 2 */}
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-gray-600 rounded-xl p-4 text-center hover:border-purple-500/50 transition-colors cursor-pointer"
              onDrop={handleDrop(setImage2)}
              onDragOver={handleDragOver}
              onClick={() => document.getElementById('upload2')?.click()}
            >
              <input
                id="upload2"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload(setImage2)}
              />
              <div className="flex items-center justify-center gap-2 text-gray-400">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span className="text-sm">Drop image here or click to upload</span>
              </div>
            </div>
            {error2 && <p className="text-red-400 text-sm text-center">{error2}</p>}
            {loading2 && (
              <div className="flex items-center justify-center gap-2 text-purple-400">
                <div className="w-4 h-4 border-2 border-purple-400/30 rounded-full animate-spin border-t-purple-400"></div>
                <span className="text-sm">Analyzing face...</span>
              </div>
            )}
            <FaceCanvas
              image={image2}
              label="Person 2"
              onMetricsExtracted={setMetrics2}
              onLoadingChange={setLoading2}
              onError={setError2}
              drawOptions={drawOptions}
            />
          </div>
        </div>

        {/* Drawing Options */}
        <div className="bg-gray-800/50 rounded-2xl p-6 border border-gray-700 mb-8">
          <h3 className="text-lg font-semibold text-white mb-4">Visualization Options</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {[
              { key: 'showLandmarks' as keyof DrawOptions, label: 'Landmarks', color: 'bg-green-500' },
              { key: 'showEyeAngles' as keyof DrawOptions, label: 'Eye Angles', color: 'bg-red-500' },
              { key: 'showHeadTilt' as keyof DrawOptions, label: 'Head Tilt', color: 'bg-yellow-500' },
              { key: 'showNoseLines' as keyof DrawOptions, label: 'Nose', color: 'bg-blue-400' },
              { key: 'showMouthLines' as keyof DrawOptions, label: 'Mouth', color: 'bg-pink-400' },
              { key: 'showCheekPoints' as keyof DrawOptions, label: 'Cheeks', color: 'bg-yellow-400' },
              { key: 'showJawLine' as keyof DrawOptions, label: 'Jaw', color: 'bg-purple-400' },
              { key: 'showBrowAngles' as keyof DrawOptions, label: 'Eyebrows', color: 'bg-pink-500' },
              { key: 'showMeasurements' as keyof DrawOptions, label: 'Measurements', color: 'bg-gray-400' },
            ].map(({ key, label, color }) => (
              <label
                key={key}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-all ${
                  drawOptions[key]
                    ? 'bg-gray-700 border border-gray-600'
                    : 'bg-gray-900/50 border border-gray-800 opacity-60'
                }`}
              >
                <input
                  type="checkbox"
                  checked={drawOptions[key]}
                  onChange={() => toggleOption(key)}
                  className="sr-only"
                />
                <span className={`w-3 h-3 rounded-full ${color}`}></span>
                <span className="text-xs text-gray-300">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Results */}
        {metrics1 && metrics2 && (
          <AnalysisResults metrics1={metrics1} metrics2={metrics2} />
        )}

        {/* Instructions */}
        {!metrics1 && !metrics2 && (
          <div className="max-w-2xl mx-auto mt-8">
            <div className="bg-gray-800/30 rounded-2xl p-8 border border-gray-700/50">
              <h3 className="text-xl font-semibold text-white mb-4 text-center">How It Works</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="w-12 h-12 bg-blue-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <span className="text-2xl">📸</span>
                  </div>
                  <h4 className="text-sm font-medium text-white mb-1">Upload Photos</h4>
                  <p className="text-xs text-gray-400">Upload two clear, front-facing photos of different people</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <span className="text-2xl">🔍</span>
                  </div>
                  <h4 className="text-sm font-medium text-white mb-1">AI Analysis</h4>
                  <p className="text-xs text-gray-400">68 facial landmarks are detected and measured automatically</p>
                </div>
                <div className="text-center">
                  <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <span className="text-2xl">📊</span>
                  </div>
                  <h4 className="text-sm font-medium text-white mb-1">Compare Results</h4>
                  <p className="text-xs text-gray-400">View detailed angles, proportions, and similarity scores</p>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-gray-700/50">
                <h4 className="text-sm font-medium text-white mb-3">What gets measured:</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-400">
                  <span>• Eye corner angles</span>
                  <span>• Head tilt angle</span>
                  <span>• Nose proportions</span>
                  <span>• Mouth shape</span>
                  <span>• Face width/height</span>
                  <span>• Jaw structure</span>
                  <span>• Cheek positions</span>
                  <span>• Eyebrow angles</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-700/50 mt-12 py-6">
        <div className="max-w-7xl mx-auto px-4 text-center text-gray-500 text-sm">
          <p>Face Similarity Analyzer • Powered by face-api.js • All processing happens locally in your browser</p>
        </div>
      </footer>
    </div>
  );
}

export default App;
