import React, { useEffect, useRef, useState, useCallback } from 'react';
import { sliceSpriteSheet } from '../services/imageUtils';
import { Language, GenerationStatus, ExpressionFrameSelection } from '../types';
import { TRANSLATIONS, EXPRESSION_PRESETS } from '../constants';
import { FaceAnimator } from './FaceAnimator';
import { FaceFrameSelector } from './FaceFrameSelector';
import { generateSprite, analyzeSpriteSheet, SpriteSheetAnalysis } from '../services/geminiService';

interface FaceAnimationEditorProps {
  language: Language;
}

const FaceAnimationEditor: React.FC<FaceAnimationEditorProps> = ({ language }) => {
  const [spriteSheetBase64, setSpriteSheetBase64] = useState<string | null>(null);
  const [frames, setFrames] = useState<string[]>([]);
  const [frameWidth, setFrameWidth] = useState(256);
  const [frameHeight, setFrameHeight] = useState(256);
  const [audioSource, setAudioSource] = useState<AudioBuffer | MediaStream | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [volumeThreshold, setVolumeThreshold] = useState(0.01);
  const [mouthMidThreshold, setMouthMidThreshold] = useState(0.02);
  const [mouthOpenThreshold, setMouthOpenThreshold] = useState(0.05);
  const [debugGuides, setDebugGuides] = useState(false);
  const [spriteAnalysis, setSpriteAnalysis] = useState<SpriteSheetAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedFrames, setSelectedFrames] = useState<ExpressionFrameSelection | null>(null);
  const [expressionPrompt, setExpressionPrompt] = useState<string>('');
  const [selectedPresetId, setSelectedPresetId] = useState<string>('happy');
  const [referenceImage, setReferenceImage] = useState<string | null>(null);
  const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState<string>('');
  const [regenerateKey, setRegenerateKey] = useState<number>(0);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const spriteFileInputRef = useRef<HTMLInputElement>(null);
  const imageFileInputRef = useRef<HTMLInputElement>(null);
  const t = TRANSLATIONS[language];

  // Initialize API Key
  useEffect(() => {
    const storedKey = localStorage.getItem('banana_sprite_api_key');
    if (storedKey) {
      setApiKey(storedKey);
    } else if (process.env.API_KEY) {
      setApiKey(process.env.API_KEY);
    }
  }, []);

  // Update prompt when preset is selected
  useEffect(() => {
    const preset = EXPRESSION_PRESETS.find(p => p.id === selectedPresetId);
    if (preset && preset.id !== 'custom') {
      setExpressionPrompt(preset.prompt);
    }
  }, [selectedPresetId]);

  const createInitialSelection = (analysis?: SpriteSheetAnalysis | null): ExpressionFrameSelection => {
    const eyesOpen = analysis?.recommendedEyesOpenFrame ?? 0;
    const eyesClosed = analysis?.recommendedEyesClosedFrame ?? 0;
    const mouthOpen = analysis?.recommendedMouthOpenFrame ?? 0;
    const mouthClosed = analysis?.recommendedMouthClosedFrame ?? 0;
    const mouthMid = mouthOpen;

    return {
      eyesOpenMouthOpen: eyesOpen,
      eyesOpenMouthMid: mouthMid,
      eyesOpenMouthClosed: eyesOpen,
      eyesClosedMouthOpen: eyesClosed,
      eyesClosedMouthMid: mouthMid,
      eyesClosedMouthClosed: eyesClosed || mouthClosed,
    };
  };

  // Parse sprite sheet when it arrives
  useEffect(() => {
    if (!spriteSheetBase64) {
      setFrames([]);
      setSpriteAnalysis(null);
      setSelectedFrames(null);
      return;
    }

    const process = async () => {
      try {
        const sliced = await sliceSpriteSheet(spriteSheetBase64);
        setFrames(sliced);
        
        const img = new Image();
        img.onload = () => {
          const w = img.width / 4;
          const h = img.height / 4;
          setFrameWidth(w);
          setFrameHeight(h);
        };
        img.src = spriteSheetBase64;

        setSelectedFrames(createInitialSelection(null));
      } catch (err) {
        console.error("Error processing sprite sheet:", err);
      }
    };
    process();
  }, [spriteSheetBase64, apiKey]);

  // Handle reference image upload
  const handleReferenceImageUpload = useCallback(async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setReferenceImage(result);
    };
    reader.readAsDataURL(file);
  }, []);

  // Handle sprite sheet upload
  const handleSpriteSheetUpload = useCallback(async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setSpriteSheetBase64(result);
    };
    reader.readAsDataURL(file);
  }, []);

  // Handle audio file upload
  const handleAudioFileUpload = useCallback(async (file: File) => {
    try {
      console.log('[FaceAnimationEditor] 音声ファイルアップロード', {
        fileName: file.name,
        fileSize: file.size,
      });
      const arrayBuffer = await file.arrayBuffer();
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      setAudioSource(audioBuffer);
      setGeneratedVideoUrl(null); // 新しいファイルで動画をリセット
      console.log('[FaceAnimationEditor] 音声ファイル読み込み完了', {
        duration: audioBuffer.duration.toFixed(2) + 's',
      });
    } catch (err) {
      console.error('[FaceAnimationEditor] 音声ファイル読み込みエラー:', err);
    }
  }, []);

  // Handle video generation
  const handleVideoGenerated = useCallback((videoUrl: string) => {
    setGeneratedVideoUrl(videoUrl);
  }, []);

  const handleAnalyzeSpriteSheet = useCallback(async () => {
    if (!apiKey || !spriteSheetBase64) {
      setErrorMsg(language === 'ja' ? 'APIキーとスプライトを用意してください。' : 'Please set API key and upload a sprite sheet.');
      return;
    }
    setIsAnalyzing(true);
    setErrorMsg(null);
    try {
      const analysis = await analyzeSpriteSheet(apiKey, spriteSheetBase64);
      setSpriteAnalysis(analysis);
      setSelectedFrames(createInitialSelection(analysis));
      console.log('[FaceAnimationEditor] スプライトシート分析完了', analysis);
    } catch (err: any) {
      console.error('[FaceAnimationEditor] スプライトシート分析エラー:', err);
      setErrorMsg(err?.message || (language === 'ja' ? '分析に失敗しました。' : 'Failed to analyze sprite sheet.'));
    } finally {
      setIsAnalyzing(false);
    }
  }, [apiKey, spriteSheetBase64, language]);

  const handleFrameSelect = useCallback(
    (key: keyof ExpressionFrameSelection, frameIndex: number) => {
      setSelectedFrames((prev) => ({
        ...(prev || createInitialSelection(spriteAnalysis)),
        [key]: frameIndex,
      }));
    },
    [spriteAnalysis]
  );

  // Handle expression sprite generation
  const handleGenerateExpressionSprite = useCallback(async () => {
    if (!apiKey) {
      setErrorMsg(language === 'ja' ? "APIキーを設定してください。" : "Please set API key first.");
      return;
    }
    if (!referenceImage) {
      setErrorMsg(language === 'ja' ? "キャラクター画像をアップロードしてください。" : "Please upload a character reference image.");
      return;
    }
    if (!expressionPrompt.trim()) {
      setErrorMsg(language === 'ja' ? "表情のプロンプトを入力してください。" : "Please enter an expression prompt.");
      return;
    }

    setStatus(GenerationStatus.GENERATING_SPRITE);
    setErrorMsg(null);

    try {
      const currentKey = process.env.API_KEY || apiKey;
      const resultBase64 = await generateSprite(currentKey, referenceImage, expressionPrompt, false, true);
      setSpriteSheetBase64(resultBase64);
      setStatus(GenerationStatus.COMPLETED);
    } catch (err: any) {
      console.error(err);
      setStatus(GenerationStatus.ERROR);
      setErrorMsg(err.message || (language === 'ja' ? "生成に失敗しました。" : "Failed to generate sprite sheet."));
    }
  }, [apiKey, referenceImage, expressionPrompt, language]);

  return (
    <div className="bg-white rounded-xl shadow-lg border border-yellow-400 overflow-hidden mt-8">
      <div className="p-4 border-b border-yellow-200 bg-yellow-100">
        <h2 className="font-bold text-yellow-900 text-lg">{t.expressionEditor}</h2>
        <p className="text-sm text-yellow-800 mt-1">
          {t.expressionEditorDescription}
        </p>
      </div>

      <div className="p-6 space-y-6">
        {/* Expression Generation Section */}
        <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-800 mb-4">1. {t.selectExpression}</h3>
          
          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-800 mb-2">
              {t.selectExpression}
            </label>
            
            <div className="flex flex-wrap gap-2 mb-3">
              {EXPRESSION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => setSelectedPresetId(preset.id)}
                  disabled={status === GenerationStatus.GENERATING_SPRITE}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ${
                    selectedPresetId === preset.id
                      ? 'bg-yellow-400 text-gray-900 border-2 border-yellow-600'
                      : 'bg-white hover:bg-yellow-100 hover:text-yellow-900 text-gray-700 border border-gray-300 hover:border-yellow-400'
                  }`}
                >
                  {preset.label[language]}
                </button>
              ))}
            </div>

            <textarea
              value={expressionPrompt}
              onChange={(e) => {
                setExpressionPrompt(e.target.value);
                if (e.target.value !== EXPRESSION_PRESETS.find(p => p.id === selectedPresetId)?.prompt) {
                  setSelectedPresetId('custom');
                }
              }}
              disabled={status === GenerationStatus.GENERATING_SPRITE}
              placeholder={t.expressionPromptPlaceholder}
              className="w-full p-4 border border-gray-300 rounded-xl shadow-inner focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400 text-sm min-h-[160px] bg-yellow-50 text-gray-900 leading-relaxed font-mono"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-bold text-gray-800 mb-2">
              {language === 'ja' ? 'キャラクター画像（必須）' : 'Character Image (Required)'}
            </label>
            {referenceImage ? (
              <div className="space-y-2">
                <img
                  src={referenceImage}
                  alt="Reference"
                  className="max-w-xs h-auto border-2 border-gray-200 rounded-lg"
                />
                <button
                  onClick={() => {
                    setReferenceImage(null);
                    imageFileInputRef.current?.value && (imageFileInputRef.current.value = '');
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm font-semibold"
                >
                  {language === 'ja' ? '画像を削除' : 'Remove Image'}
                </button>
              </div>
            ) : (
              <input
                ref={imageFileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleReferenceImageUpload(file);
                  }
                }}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-yellow-400 file:text-gray-900 hover:file:bg-yellow-300"
              />
            )}
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium border border-red-100">
              {errorMsg}
            </div>
          )}

          <button
            onClick={handleGenerateExpressionSprite}
            disabled={status === GenerationStatus.GENERATING_SPRITE || !referenceImage || !expressionPrompt.trim()}
            className={`w-full px-6 py-3 rounded-xl font-bold text-lg shadow-lg transition-all transform hover:-translate-y-0.5 border-2 border-black ${
              (status === GenerationStatus.GENERATING_SPRITE || !referenceImage || !expressionPrompt.trim())
                ? 'bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed shadow-none'
                : 'bg-yellow-400 text-gray-900 hover:bg-yellow-300 hover:shadow-yellow-200'
            }`}
          >
            {status === GenerationStatus.GENERATING_SPRITE ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5 text-gray-900" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t.expressionGenerating}
              </span>
            ) : (
              t.generateExpressionSprite
            )}
          </button>
        </div>

        {/* Animation Section */}
        {spriteSheetBase64 && (
          <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4">2. {t.faceAnimation}</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
              {/* Left: Sprite Sheet Preview */}
              <div className="flex flex-col items-center">
                <h4 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-wider">
                  {language === 'ja' ? 'スプライトシート' : 'Sprite Sheet'}
                </h4>
                <div className="relative border-2 border-gray-100 bg-white shadow-sm p-1 rounded-lg w-full">
                  <img 
                    src={spriteSheetBase64} 
                    alt="Expression Sprite Sheet" 
                    className="max-w-full h-auto w-full" 
                  />
                </div>
                <a 
                  href={spriteSheetBase64}
                  download="expression_sprite_sheet.png"
                  className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors text-sm font-bold shadow-md hover:shadow-lg"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  {t.downloadPng}
                </a>
                <button
                  onClick={handleAnalyzeSpriteSheet}
                  disabled={isAnalyzing || !apiKey}
                  className={`mt-3 w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border ${
                    isAnalyzing || !apiKey
                      ? 'bg-gray-200 text-gray-500 border-gray-300 cursor-not-allowed'
                      : 'bg-blue-500 text-white border-blue-600 hover:bg-blue-600'
                  }`}
                >
                  {isAnalyzing
                    ? language === 'ja'
                      ? '分析中...'
                      : 'Analyzing...'
                    : language === 'ja'
                    ? 'Geminiで分析して自動割当'
                    : 'Analyze with Gemini & auto-allocate'}
                </button>
                {spriteAnalysis && (
                  <div className="mt-2 text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2 w-full">
                    {language === 'ja'
                      ? `✓ 分析結果を適用: 目開=${spriteAnalysis.recommendedEyesOpenFrame}, 目閉=${spriteAnalysis.recommendedEyesClosedFrame}, 口開=${spriteAnalysis.recommendedMouthOpenFrame}, 口閉=${spriteAnalysis.recommendedMouthClosedFrame}`
                      : `✓ Applied analysis: Eyes open=${spriteAnalysis.recommendedEyesOpenFrame}, Eyes closed=${spriteAnalysis.recommendedEyesClosedFrame}, Mouth open=${spriteAnalysis.recommendedMouthOpenFrame}, Mouth closed=${spriteAnalysis.recommendedMouthClosedFrame}`}
                  </div>
                )}
              </div>
              {/* Right: Face Animation Preview */}
              <div className="flex flex-col items-center">
                {frames.length > 0 ? (
                  <>
                    {isAnalyzing && (
                      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <p className="text-xs text-blue-700">
                          {language === 'ja' ? '🔍 Gemini APIでスプライトシートを分析中...' : '🔍 Analyzing sprite sheet with Gemini API...'}
                        </p>
                      </div>
                    )}
                    {spriteAnalysis && (
                      <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <p className="text-xs text-green-700">
                          {language === 'ja' 
                            ? `✓ 分析完了: 目開=${spriteAnalysis.recommendedEyesOpenFrame}, 目閉=${spriteAnalysis.recommendedEyesClosedFrame}, 口開=${spriteAnalysis.recommendedMouthOpenFrame}, 口閉=${spriteAnalysis.recommendedMouthClosedFrame}`
                            : `✓ Analysis complete: Eyes open=${spriteAnalysis.recommendedEyesOpenFrame}, Eyes closed=${spriteAnalysis.recommendedEyesClosedFrame}, Mouth open=${spriteAnalysis.recommendedMouthOpenFrame}, Mouth closed=${spriteAnalysis.recommendedMouthClosedFrame}`}
                        </p>
                      </div>
                    )}

                    {frames.length > 0 && (
                      <div className="mb-4">
                        <FaceFrameSelector
                          frames={frames}
                          analysis={spriteAnalysis}
                          selectedFrames={selectedFrames || createInitialSelection(spriteAnalysis)}
                          onFrameSelect={handleFrameSelect}
                          language={language}
                        />
                      </div>
                    )}
                    
                    <FaceAnimator
                      frames={frames}
                      width={frameWidth}
                      height={frameHeight}
                      audioSource={audioSource}
                      debugGuides={debugGuides}
                      volumeThreshold={volumeThreshold}
                      mouthMidThreshold={mouthMidThreshold}
                      mouthOpenThreshold={mouthOpenThreshold}
                      spriteAnalysis={spriteAnalysis}
                      selectedFrames={selectedFrames}
                      regenerateKey={regenerateKey}
                      onVideoGenerated={handleVideoGenerated}
                    />

                    {/* Video Download */}
                    {generatedVideoUrl && (
                      <div className="mt-4 w-full">
                        <a
                          href={generatedVideoUrl}
                          download="face_animation.webm"
                          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-yellow-400 text-gray-900 rounded-lg hover:bg-yellow-300 text-sm font-semibold shadow-md hover:shadow-lg transition-all"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                          {language === 'ja' ? '動画をダウンロード' : 'Download Video'}
                        </a>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-64 bg-gray-100 rounded-lg flex items-center justify-center">
                    <span className="text-gray-400">処理中...</span>
                  </div>
                )}
              </div>

              {/* Right: Controls */}
              <div className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t.uploadAudioFile}
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleAudioFileUpload(file);
                      }
                    }}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-yellow-400 file:text-gray-900 hover:file:bg-yellow-300"
                  />
                  {audioSource && (
                    <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                      <p className="text-xs text-green-700 mb-2">
                        {language === 'ja' ? '✓ 音声ファイルが読み込まれました。動画は自動的に生成されます。' : '✓ Audio file loaded. Video will be generated automatically.'}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t.volumeThreshold}: {volumeThreshold.toFixed(3)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="0.1"
                    step="0.001"
                    value={volumeThreshold}
                    onChange={(e) => setVolumeThreshold(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {language === 'ja' ? '口・中間しきい値' : 'Mouth Mid Threshold'}: {mouthMidThreshold.toFixed(3)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="0.2"
                    step="0.001"
                    value={mouthMidThreshold}
                    onChange={(e) => setMouthMidThreshold(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {language === 'ja' ? '口・大きく開くしきい値' : 'Mouth Open Threshold'}: {mouthOpenThreshold.toFixed(3)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="0.2"
                    step="0.001"
                    value={mouthOpenThreshold}
                    onChange={(e) => setMouthOpenThreshold(parseFloat(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="debugGuides"
                    checked={debugGuides}
                    onChange={(e) => setDebugGuides(e.target.checked)}
                    className="w-4 h-4 text-yellow-400 border-gray-300 rounded focus:ring-yellow-400"
                  />
                  <label htmlFor="debugGuides" className="text-sm font-semibold text-gray-700">
                    {t.debugGuides}
                  </label>
                </div>

                <div>
                  <button
                    onClick={() => {
                      setGeneratedVideoUrl(null);
                      setRegenerateKey((k) => k + 1);
                    }}
                    disabled={!audioSource}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border ${
                      !audioSource
                        ? 'bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed'
                        : 'bg-yellow-400 text-gray-900 border-yellow-500 hover:bg-yellow-300'
                    }`}
                  >
                    {language === 'ja' ? 'しきい値を反映して再生成' : 'Regenerate with current thresholds'}
                  </button>
                  {!audioSource && (
                    <p className="mt-1 text-xs text-gray-500">
                      {language === 'ja' ? '音声を読み込むと再生成できます' : 'Load audio to regenerate video.'}
                    </p>
                  )}
                </div>

                {!MediaRecorder.isTypeSupported('video/webm') && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-xs text-yellow-800">{t.webmNotSupported}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Manual Sprite Sheet Upload Option */}
        {!spriteSheetBase64 && (
          <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-800 mb-4">または、既存のスプライトシートを使用</h3>
            <div>
              <input
                ref={spriteFileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    handleSpriteSheetUpload(file);
                  }
                }}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-yellow-400 file:text-gray-900 hover:file:bg-yellow-300"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FaceAnimationEditor;
