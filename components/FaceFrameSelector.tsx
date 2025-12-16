import React, { useMemo, useState } from 'react';
import { SpriteSheetAnalysis } from '../services/geminiService';
import { ExpressionFrameSelection } from '../types';

interface FaceFrameSelectorProps {
  frames: string[];
  analysis?: SpriteSheetAnalysis | null;
  selectedFrames: ExpressionFrameSelection;
  onFrameSelect: (type: keyof ExpressionFrameSelection, frameIndex: number) => void;
  language: 'ja' | 'en';
}

export const FaceFrameSelector: React.FC<FaceFrameSelectorProps> = ({
  frames,
  analysis,
  selectedFrames,
  onFrameSelect,
  language,
}) => {
  const frameTypes: Array<{
    key: keyof ExpressionFrameSelection;
    eye: 'open' | 'closed';
    mouth: 'open' | 'mid' | 'closed';
    labelJa: string;
    labelEn: string;
  }> = [
    { key: 'eyesOpenMouthOpen', eye: 'open', mouth: 'open', labelJa: '目:開 口:大', labelEn: 'Eyes Open / Mouth Open' },
    { key: 'eyesOpenMouthMid', eye: 'open', mouth: 'mid', labelJa: '目:開 口:中', labelEn: 'Eyes Open / Mouth Mid' },
    { key: 'eyesOpenMouthClosed', eye: 'open', mouth: 'closed', labelJa: '目:開 口:閉', labelEn: 'Eyes Open / Mouth Closed' },
    { key: 'eyesClosedMouthOpen', eye: 'closed', mouth: 'open', labelJa: '目:閉 口:大', labelEn: 'Eyes Closed / Mouth Open' },
    { key: 'eyesClosedMouthMid', eye: 'closed', mouth: 'mid', labelJa: '目:閉 口:中', labelEn: 'Eyes Closed / Mouth Mid' },
    { key: 'eyesClosedMouthClosed', eye: 'closed', mouth: 'closed', labelJa: '目:閉 口:閉', labelEn: 'Eyes Closed / Mouth Closed' },
  ];

  const [activeKey, setActiveKey] = useState<keyof ExpressionFrameSelection>('eyesOpenMouthOpen');

  const getRecommendedFrame = (eye: 'open' | 'closed', mouth: 'open' | 'mid' | 'closed'): number | undefined => {
    if (!analysis) return undefined;
    const eyeKey = eye === 'open' ? 'recommendedEyesOpenFrame' : 'recommendedEyesClosedFrame';
    const mouthKey = mouth === 'closed' ? 'recommendedMouthClosedFrame' : 'recommendedMouthOpenFrame';

    const matched = analysis.frames.find((f) => {
      const eyesMatch = eye === 'open' ? f.eyesState === 'open' : f.eyesState === 'closed';
      if (mouth === 'mid') {
        return eyesMatch;
      }
      const mouthMatch = mouth === 'open' ? f.mouthState === 'open' : f.mouthState === 'closed';
      return eyesMatch && mouthMatch;
    });

    if (matched) return matched.frameIndex;
    return (analysis as any)[mouthKey] ?? (analysis as any)[eyeKey];
  };

  const getEmotionLabel = (emotion?: string) => {
    if (!emotion) return '';
    const emotionMap: Record<string, { ja: string; en: string }> = {
      happy: { ja: '😊 嬉しい', en: '😊 Happy' },
      sad: { ja: '😢 悲しい', en: '😢 Sad' },
      surprised: { ja: '😲 驚き', en: '😲 Surprised' },
      neutral: { ja: '😐 無表情', en: '😐 Neutral' },
      angry: { ja: '😠 怒り', en: '😠 Angry' },
      excited: { ja: '🤩 興奮', en: '🤩 Excited' },
    };
    return emotionMap[emotion.toLowerCase()]?.[language] || emotion;
  };

  const selectedByFrame = useMemo(() => {
    const map: Record<number, Array<keyof ExpressionFrameSelection>> = {};
    frameTypes.forEach((t) => {
      const idx = selectedFrames[t.key];
      if (!map[idx]) map[idx] = [];
      map[idx].push(t.key);
    });
    return map;
  }, [frameTypes, selectedFrames]);

  const activeType = frameTypes.find((t) => t.key === activeKey)!;
  const recommendedFrame = getRecommendedFrame(activeType.eye, activeType.mouth);
  const currentFrame = selectedFrames[activeKey];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {frameTypes.map((type) => {
          const isActive = activeKey === type.key;
          return (
            <button
              key={type.key}
              onClick={() => setActiveKey(type.key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition ${
                isActive
                  ? 'bg-yellow-400 text-gray-900 border-yellow-500'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
              }`}
            >
              {language === 'ja' ? type.labelJa : type.labelEn} ({selectedFrames[type.key]})
            </button>
          );
        })}
      </div>

      <div className="text-xs text-gray-600">
        {language === 'ja'
          ? '下の16コマからクリックして選択中のパターンに割り当て'
          : 'Click a frame below to assign to the selected pattern'}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {frames.map((frame, idx) => {
          const isSelected = currentFrame === idx;
          const isRecommended = recommendedFrame === idx;
          const usedBy = selectedByFrame[idx] || [];

          return (
            <div
              key={idx}
              className={`relative border-2 rounded cursor-pointer transition-all ${
                isSelected
                  ? 'border-yellow-400 bg-yellow-50'
                  : isRecommended
                  ? 'border-green-400 bg-green-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => onFrameSelect(activeKey, idx)}
            >
              <img src={frame} alt={`Frame ${idx}`} className="w-full h-auto" />
              <div className="absolute top-0 left-0 bg-black bg-opacity-70 text-white text-xs px-1 rounded-br">
                {idx}
              </div>
              {analysis?.frames[idx]?.emotion && (
                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-[10px] px-1 text-center">
                  {getEmotionLabel(analysis.frames[idx].emotion)}
                </div>
              )}
              {usedBy.length > 0 && (
                <div className="absolute top-0 right-0 m-1 flex flex-wrap gap-1 justify-end">
                  {usedBy.map((k) => (
                    <span
                      key={k}
                      className="bg-gray-900 text-white text-[9px] px-1 py-[1px] rounded"
                    >
                      {k}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

