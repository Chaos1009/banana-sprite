/**
 * AudioBufferから音量データを分析する（再生せずに）
 */

export interface VolumeFrame {
  time: number; // 秒
  volume: number; // 0-1
  mouthState: 'open' | 'closed';
}

/**
 * AudioBufferから各フレームの音量を計算
 * @param audioBuffer 音声バッファ
 * @param fps フレームレート（デフォルト10fps）
 * @param threshold 音量のしきい値
 * @param releaseTime リリース時間（秒）- 口が閉じるまでの遅延
 * @returns 各フレームの音量と口の状態
 */
export const analyzeAudioBuffer = (
  audioBuffer: AudioBuffer,
  fps: number = 10,
  threshold: number = 0.01,
  releaseTime: number = 0.1 // 100msの遅延
): VolumeFrame[] => {
  const sampleRate = audioBuffer.sampleRate;
  const duration = audioBuffer.duration;
  const frameInterval = 1 / fps; // フレーム間隔（秒）
  const samplesPerFrame = Math.floor(sampleRate * frameInterval);
  const releaseFrames = Math.ceil(releaseTime * fps); // リリース時間をフレーム数に変換
  
  // 最初のチャンネルのデータを取得
  const channelData = audioBuffer.getChannelData(0);
  const frames: VolumeFrame[] = [];
  
  let smoothing = 0;
  let lastOpenTime = -1; // 最後に口が開いた時刻
  let isOpen = false;
  
  for (let frameIndex = 0; frameIndex < Math.ceil(duration * fps); frameIndex++) {
    const time = frameIndex * frameInterval;
    const startSample = Math.floor(frameIndex * samplesPerFrame);
    const endSample = Math.min(startSample + samplesPerFrame, channelData.length);
    
    // RMS（Root Mean Square）を計算
    let sum = 0;
    let count = 0;
    for (let i = startSample; i < endSample; i++) {
      const sample = channelData[i];
      sum += sample * sample;
      count++;
    }
    
    const rms = Math.sqrt(sum / count);
    
    // スムージング
    smoothing = smoothing * 0.7 + rms * 0.3;
    const smoothedVolume = smoothing;
    
    // 口の状態を決定（リリース時間を考慮）
    let mouthState: 'open' | 'closed' = 'closed';
    
    if (smoothedVolume > threshold) {
      // 音量がしきい値を超えたら口を開く
      mouthState = 'open';
      isOpen = true;
      lastOpenTime = frameIndex;
    } else {
      // 音量がしきい値以下になった場合
      if (isOpen && (frameIndex - lastOpenTime) < releaseFrames) {
        // リリース時間内は口を開いたまま
        mouthState = 'open';
      } else {
        // リリース時間を過ぎたら口を閉じる
        mouthState = 'closed';
        isOpen = false;
      }
    }
    
    frames.push({
      time,
      volume: smoothedVolume,
      mouthState,
    });
  }
  
  return frames;
};

