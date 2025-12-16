import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useBlinkScheduler } from '../src/hooks/useBlinkScheduler';
import { analyzeAudioBuffer } from '../src/utils/audioAnalysis';
import { SpriteSheetAnalysis } from '../services/geminiService';
import { ExpressionFrameSelection, MouthState } from '../types';

export interface FaceAnimatorProps {
  frames: string[]; // Base64 data URLs
  width: number;
  height: number;
  audioSource?: AudioBuffer | MediaStream | null;
  debugGuides?: boolean;
  volumeThreshold?: number;
  mouthMidThreshold?: number;
  mouthOpenThreshold?: number;
  spriteAnalysis?: SpriteSheetAnalysis | null; // Gemini APIによる分析結果
  selectedFrames: ExpressionFrameSelection | null; // ユーザーが選択したフレーム
  regenerateKey?: number;
  onVideoGenerated?: (videoUrl: string) => void;
}

export const FaceAnimator: React.FC<FaceAnimatorProps> = ({
  frames,
  width,
  height,
  audioSource = null,
  debugGuides = false,
  volumeThreshold = 0.01,
  mouthMidThreshold,
  mouthOpenThreshold,
  spriteAnalysis = null,
  selectedFrames = null,
  regenerateKey = 0,
  onVideoGenerated,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const animationFrameRef = useRef<number | null>(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const videoGenerationRef = useRef<boolean>(false);
  const lastRegenerateKeyRef = useRef<number>(regenerateKey);
  const [currentMouthState, setCurrentMouthState] = useState<MouthState>('closed');
  const mouthStateRef = useRef<MouthState>('closed');

  const { eyeState } = useBlinkScheduler();

  const resolvedSelection = useMemo<ExpressionFrameSelection>(() => {
    if (selectedFrames) return selectedFrames;
    const eyesOpen = spriteAnalysis?.recommendedEyesOpenFrame ?? 0;
    const eyesClosed = spriteAnalysis?.recommendedEyesClosedFrame ?? 0;
    const mouthOpen = spriteAnalysis?.recommendedMouthOpenFrame ?? 0;
    const mouthClosed = spriteAnalysis?.recommendedMouthClosedFrame ?? 0;
    const mouthMid = mouthOpen;
    return {
      eyesOpenMouthOpen: eyesOpen,
      eyesOpenMouthMid: mouthMid,
      eyesOpenMouthClosed: eyesOpen,
      eyesClosedMouthOpen: eyesClosed,
      eyesClosedMouthMid: mouthMid,
      eyesClosedMouthClosed: eyesClosed || mouthClosed,
    };
  }, [selectedFrames, spriteAnalysis]);

  const resolveFrameIndex = useCallback(
    (eye: 'open' | 'closed', mouth: MouthState) => {
      const key =
        eye === 'open'
          ? mouth === 'open'
            ? 'eyesOpenMouthOpen'
            : mouth === 'mid'
            ? 'eyesOpenMouthMid'
            : 'eyesOpenMouthClosed'
          : mouth === 'open'
          ? 'eyesClosedMouthOpen'
          : mouth === 'mid'
          ? 'eyesClosedMouthMid'
          : 'eyesClosedMouthClosed';

      return resolvedSelection[key] ?? 0;
    },
    [resolvedSelection]
  );

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const frameIdx = resolveFrameIndex(eyeState, currentMouthState);
    const frameSrc = frames[frameIdx] || frames[0];

    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      if (debugGuides) {
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, 0, canvas.width, canvas.height);
      }
    };
    img.onerror = () => {
      console.error('[FaceAnimator] 画像読み込みエラー', { frameIdx });
    };
    img.src = frameSrc;
  }, [frames, resolveFrameIndex, eyeState, currentMouthState, debugGuides]);

  // Preview loop (10fps)
  useEffect(() => {
    if (frames.length === 0) return;
    const animate = () => {
      renderFrame();
      setCurrentFrameIndex((prev) => (prev + 1) % Math.max(frames.length, 1));
      animationFrameRef.current = window.setTimeout(animate, 100);
    };
    animate();
    return () => {
      if (animationFrameRef.current) {
        clearTimeout(animationFrameRef.current);
      }
    };
  }, [frames, renderFrame]);

  // 動画生成（AudioBuffer がある場合のみ自動で生成）
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !audioSource || !(audioSource instanceof AudioBuffer)) return;
    if (videoGenerationRef.current) return;
    // すでに生成済みで、トリガーが変わっていない場合はスキップ
    if (generatedVideoUrl && lastRegenerateKeyRef.current === regenerateKey) return;
    lastRegenerateKeyRef.current = regenerateKey;

    const classifyMouth = (volume: number): MouthState => {
      const midThreshold = mouthMidThreshold ?? Math.max(volumeThreshold * 1.5, volumeThreshold + 0.005);
      const openThreshold = mouthOpenThreshold ?? Math.max(volumeThreshold * 3, volumeThreshold + 0.01);
      if (volume >= openThreshold) return 'open';
      if (volume >= midThreshold) return 'mid';
      return 'closed';
    };

    const smoothTransition = (prev: MouthState, target: MouthState): MouthState => {
      if (prev === 'closed' && target === 'open') return 'mid';
      if (prev === 'open' && target === 'closed') return 'mid';
      if (prev === 'mid' && target === 'open') return 'open';
      if (prev === 'mid' && target === 'closed') return 'closed';
      return target;
    };

    const generateVideo = async () => {
      videoGenerationRef.current = true;
      console.log('[FaceAnimator] 動画生成開始（フレーム切替版）', {
        audioDuration: audioSource.duration.toFixed(2) + 's',
      });

      try {
        const fps = 10;
        const frameInterval = 1000 / fps;
        const volumeFrames = analyzeAudioBuffer(audioSource, fps, volumeThreshold, 0.1);

        // capture canvas
        const stream = canvas.captureStream(fps);
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = audioContext.createBufferSource();
        source.buffer = audioSource;
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

        const options: MediaRecorderOptions = {
          mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
            ? 'video/webm;codecs=vp9'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp8')
            ? 'video/webm;codecs=vp8'
            : 'video/webm',
          videoBitsPerSecond: 2500000,
        };

        const mediaRecorder = new MediaRecorder(stream, options);
        const recordedChunks: Blob[] = [];
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) recordedChunks.push(event.data);
        };

        const recordingPromise = new Promise<void>((resolve) => {
          mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            setGeneratedVideoUrl(url);
            videoGenerationRef.current = false;
            if (onVideoGenerated) onVideoGenerated(url);
            resolve();
          };
        });

        source.start(0);
        mediaRecorder.start();

        const startTime = Date.now();
        let frameIndex = 0;

        const updateFrame = () => {
          if (frameIndex >= volumeFrames.length) {
            setTimeout(() => {
              mediaRecorder.stop();
              source.stop();
              stream.getTracks().forEach((track) => track.stop());
              audioContext.close();
            }, 200);
            return;
          }

          const elapsed = (Date.now() - startTime) / 1000;
          const currentFrame = volumeFrames[frameIndex];
          if (elapsed >= currentFrame.time) {
            const target = classifyMouth(currentFrame.volume);
            const nextMouth = smoothTransition(mouthStateRef.current, target);
            mouthStateRef.current = nextMouth;
            setCurrentMouthState(nextMouth);
            renderFrame();
            frameIndex++;
          }

          if (frameIndex < volumeFrames.length) {
            const nextFrameTime = volumeFrames[frameIndex].time;
            const waitTime = Math.max(0, (nextFrameTime - elapsed) * 1000);
            setTimeout(updateFrame, Math.min(waitTime, frameInterval));
          } else {
            setTimeout(updateFrame, frameInterval);
          }
        };

        if (volumeFrames.length > 0) {
          const initial = classifyMouth(volumeFrames[0].volume);
          mouthStateRef.current = initial;
          setCurrentMouthState(initial);
          renderFrame();
        }

        setTimeout(updateFrame, 50);
        await recordingPromise;
      } catch (err) {
        console.error('[FaceAnimator] 動画生成エラー:', err);
        videoGenerationRef.current = false;
      }
    };

    const timer = setTimeout(() => generateVideo(), 500);
    return () => clearTimeout(timer);
  }, [audioSource, generatedVideoUrl, onVideoGenerated, volumeThreshold, mouthMidThreshold, mouthOpenThreshold, renderFrame, regenerateKey]);

  if (frames.length === 0) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-gray-500">No frames</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="border-2 border-gray-200 rounded-lg bg-white"
        style={{ maxWidth: '100%', height: 'auto' }}
      />
      <div className="mt-2 text-xs text-gray-500">
        Frame: {currentFrameIndex + 1}/{frames.length} | Eyes: {eyeState} | Mouth: {currentMouthState}
      </div>
    </div>
  );
};
