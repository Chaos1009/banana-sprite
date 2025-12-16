import { useState, useEffect, useRef } from 'react';
import { MouthState } from '../../types';

interface UseAudioMouthSyncOptions {
  threshold?: number; // Volume threshold (0-1)
  attack?: number; // Attack time in ms (how quickly mouth opens)
  release?: number; // Release time in ms (how quickly mouth closes)
  audioSource?: AudioBuffer | MediaStream | null;
}

export const useAudioMouthSync = (options: UseAudioMouthSyncOptions = {}) => {
  const {
    threshold = 0.01,
    attack = 50,
    release = 100,
    audioSource = null,
  } = options;

  const [mouthState, setMouthState] = useState<MouthState>('closed');
  const [hasMicrophonePermission, setHasMicrophonePermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<AudioNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastVolumeRef = useRef<number>(0);
  const smoothingRef = useRef<number>(0);
  const mouthStateRef = useRef<MouthState>('closed'); // 現在の口の状態を追跡（クロージャ内で使用）

  // mouthStateが変更されたときにrefも更新
  useEffect(() => {
    mouthStateRef.current = mouthState;
  }, [mouthState]);

  useEffect(() => {
    // ファイル（AudioBuffer）のみで動作するようにする
    if (!audioSource || !(audioSource instanceof AudioBuffer)) {
      mouthStateRef.current = 'closed';
      setMouthState('closed');
      if (audioSource && !(audioSource instanceof AudioBuffer)) {
        console.log('[useAudioMouthSync] MediaStreamは無効です。ファイル（AudioBuffer）のみサポートしています。');
      }
      return;
    }

    let isActive = true;

    const initAudio = async () => {
      try {
        console.log('[useAudioMouthSync] オーディオ初期化開始', {
          audioSourceType: audioSource instanceof AudioBuffer ? 'AudioBuffer' : audioSource instanceof MediaStream ? 'MediaStream' : 'null',
          threshold,
          attack,
          release,
        });

        // Create AudioContext
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) {
          throw new Error('AudioContext not supported');
        }

        const audioContext = new AudioContextClass();
        audioContextRef.current = audioContext;
        console.log('[useAudioMouthSync] AudioContext作成完了', {
          state: audioContext.state,
          sampleRate: audioContext.sampleRate,
        });

        // Create analyser
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;
        console.log('[useAudioMouthSync] Analyser作成完了', {
          fftSize: analyser.fftSize,
          frequencyBinCount: analyser.frequencyBinCount,
          smoothingTimeConstant: analyser.smoothingTimeConstant,
        });

        // Connect source (AudioBuffer only)
        // AudioBuffer (uploaded file) - loop playback
        console.log('[useAudioMouthSync] AudioBufferを処理', {
          duration: audioSource.duration.toFixed(2) + 's',
          sampleRate: audioSource.sampleRate,
          numberOfChannels: audioSource.numberOfChannels,
        });
        const bufferSource = audioContext.createBufferSource();
        bufferSource.buffer = audioSource;
        bufferSource.loop = true; // Loop the audio
        bufferSource.connect(analyser);
        const source = bufferSource;
        bufferSource.start(0);
        console.log('[useAudioMouthSync] AudioBuffer再生開始（ループ）');

        sourceNodeRef.current = source;
        analyser.connect(audioContext.destination);
        console.log('[useAudioMouthSync] オーディオパイプライン接続完了');

        // Start analysis loop
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const timeDataArray = new Uint8Array(analyser.fftSize);
        
        let logCounter = 0; // ログ出力を制限するためのカウンター
        
        const analyze = () => {
          if (!isActive || !analyserRef.current) return;

          // Use time domain data for better volume detection
          analyserRef.current.getByteTimeDomainData(timeDataArray);
          
          // Calculate RMS (Root Mean Square) volume from time domain
          let sum = 0;
          for (let i = 0; i < timeDataArray.length; i++) {
            const normalized = (timeDataArray[i] - 128) / 128;
            sum += normalized * normalized;
          }
          const rms = Math.sqrt(sum / timeDataArray.length);
          
          // Smooth volume changes
          smoothingRef.current = smoothingRef.current * 0.7 + rms * 0.3;
          const smoothedVolume = smoothingRef.current;

          // デバッグログ（10フレームごとに出力）
          logCounter++;
          if (logCounter % 10 === 0) {
            console.log('[useAudioMouthSync]', {
              rms: rms.toFixed(4),
              smoothedVolume: smoothedVolume.toFixed(4),
              threshold: threshold.toFixed(4),
              currentMouthState: mouthStateRef.current,
              isAboveThreshold: smoothedVolume > threshold,
            });
          }

          // Update mouth state based on threshold
          const previousMouthState = mouthStateRef.current;
          if (smoothedVolume > threshold) {
            lastVolumeRef.current = smoothedVolume;
            if (previousMouthState !== 'open') {
              console.log('[useAudioMouthSync] 口が開きました', {
                volume: smoothedVolume.toFixed(4),
                threshold: threshold.toFixed(4),
              });
              mouthStateRef.current = 'open';
              setMouthState('open');
            }
          } else {
            // Use release time for closing
            if (lastVolumeRef.current > threshold) {
              // Delay closing
              setTimeout(() => {
                if (isActive && smoothingRef.current <= threshold) {
                  if (mouthStateRef.current !== 'closed') {
                    console.log('[useAudioMouthSync] 口が閉じました（リリース後）', {
                      volume: smoothingRef.current.toFixed(4),
                      threshold: threshold.toFixed(4),
                    });
                    mouthStateRef.current = 'closed';
                    setMouthState('closed');
                  }
                }
              }, release);
            } else {
              if (previousMouthState !== 'closed') {
                console.log('[useAudioMouthSync] 口が閉じました', {
                  volume: smoothedVolume.toFixed(4),
                  threshold: threshold.toFixed(4),
                });
                mouthStateRef.current = 'closed';
                setMouthState('closed');
              }
            }
          }

          animationFrameRef.current = requestAnimationFrame(analyze);
        };

        analyze();
      } catch (err: any) {
        if (isActive) {
          setError(err.message || 'Failed to initialize audio');
          mouthStateRef.current = 'closed';
          setMouthState('closed');
          if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            setHasMicrophonePermission(false);
          }
        }
      }
    };

    initAudio();

    return () => {
      isActive = false;
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      // MediaStreamSourceNodeは自動的に切断されるため、明示的な停止は不要
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      console.log('[useAudioMouthSync] クリーンアップ完了');
    };
  }, [audioSource, threshold, attack, release]);

  return {
    mouthState,
    hasMicrophonePermission,
    error,
  };
};

