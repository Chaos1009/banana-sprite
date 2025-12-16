import { GoogleGenAI } from "@google/genai";

const getSystemPrompt = (useGreenBackground: boolean, isExpression: boolean = false) => {
  const backgroundInstruction = useGreenBackground
    ? '2. 出力は必ず「1:1の正方形」で、「完全な緑背景（グリーンバック、クロマキー用）」にすること。背景色はRGB(0, 255, 0)または#00FF00の純粋な緑色を使用すること。'
    : '2. 出力は必ず「1:1の正方形」で、「完全な白背景」にすること。';

  if (isExpression) {
    // 表情差分用のプロンプト
    return `
あなたは「表情付きスプライトシート専用ジェネレーター」です。

以下のルールを必ず厳守してください：

1. 参照画像（reference image）のキャラクターを忠実に再現し、
   顔、体型、髪型、衣装、色の特徴、描画スタイルを一切変えない。
   参照画像がドット絵ならドット絵、イラストならイラスト、3Dなら3Dと、同じスタイルで描く。

${backgroundInstruction}

3. 出力は「4×4の16フレームのスプライトシート」であること。
   - グリッドは均等に区切る
   - フレーム番号は 左→右、上→下 の順
   - 16フレームをすべて埋める（空白なし）

4. キャラクターは「右向き（right-facing）」で統一する。

5. 【最重要】全フレームで、キャラクターの位置・大きさ・頭身・輪郭の太さ・体のポーズを完全に一致させる。
   コマごとの破綻や形崩れは厳禁。
   体の動きは一切なく、立ち姿勢のまま固定する。

7. 【表情の要件】
   - 各フレームでは、指定された表情を16フレームで表現する
   - 表情の変化は「目」と「口」のみで表現する
   - 目は「開いている」と「閉じている」の2パターンを使用
   - 口は「開いている」と「閉じている」の2パターンを使用
   - 各フレームで目と口の組み合わせを変えることで表情の変化を表現
   - 瞬き（目を閉じる）を自然に含める
   - 口パク（口を開閉する）を自然に含める
   - 眉毛の位置も表情に合わせて微調整する

8. 【顔パーツの位置統一】
   - 全16フレームで、目・口・眉毛の位置が完全に一致していること
   - 顔パーツの位置がずれないように、各フレームで同じ座標に描く
   - 顔パーツの大きさも全フレームで統一する

9. 不要な演出・背景・エフェクトは禁止
   - キャラ本体の表情のみ描く
   - 体の動きは一切なし

【表情アニメーション品質の要件】
- 全16フレームは自然な表情の変化として構成する。
- 瞬きと口パクを組み合わせて、生き生きとした表情を表現する。
- キャラの位置・大きさ・頭の高さ・輪郭の太さ・体のポーズを全フレームで完全一致させる。
- 顔パーツ（目・口・眉毛）の位置と大きさを全フレームで完全一致させる。
- 表情の変化は滑らかで自然なものにする。

以上を完全に守り、表情差分用に最適化された16フレームの1枚画像を生成してください。
`;
  }

  // 動き用のプロンプト（既存）
  return `
あなたは「ドット絵スプライトシート専用ジェネレーター」です。

以下のルールを必ず厳守してください：

1. 参照画像（reference image）のキャラクターを忠実に再現し、
   顔、体型、髪型、衣装、色の特徴を一切変えない。

${backgroundInstruction}

3. 出力は「4×4の16フレームのスプライトシート」であること。
   - グリッドは均等に区切る
   - フレーム番号は 左→右、上→下 の順
   - 16フレームをすべて埋める（空白なし）

4. キャラクターは「右向き（right-facing）」で統一する。

5. スタイルは必ず「ドット絵（pixel art）」。
   ぼかし・高解像度描画は禁止。
   くっきりしたドットで描く。

6. 全フレームで、キャラクターの位置・大きさ・頭身・輪郭の太さを一致させる。
   コマごとの破綻や形崩れは厳禁。

7. 各フレームでは、指定された動きを16分割したアニメーションを作る。
   - 不要な演出・背景・エフェクトは禁止
   - キャラ本体のアニメーションのみ描く

【アニメーション品質の要件】
- 全16フレームは自然で滑らかに連続するアニメーションとして構成する。
- 前後のフレームと滑らかにつながるように中間動作（in-between）を意識する。
- キャラの位置・大きさ・頭の高さ・輪郭の太さを全フレームで完全一致させる。
- ポーズは急激に変えず、動きの軌道（arc）を維持する。
- 動きは「準備 → ピーク → 戻り」の自然な流れを持たせる。
- 連続写真のような自然なモーションを16分割して描く。

以上を完全に守り、スプライト用途に最適化された16フレームの1枚画像を生成してください。
`;
};

export const generateSprite = async (
  apiKey: string,
  referenceImageBase64: string,
  userPrompt: string,
  useGreenBackground: boolean = false,
  isExpression: boolean = false
): Promise<string> => {
  const SYSTEM_PROMPT = getSystemPrompt(useGreenBackground, isExpression);
  const ai = new GoogleGenAI({ apiKey });
  
  // Strip prefix if present for API consumption
  const cleanBase64 = referenceImageBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

  try {
    // Using gemini-3-pro-image-preview as requested for high quality editing/generation
    // "Nano Banana Pro" maps to gemini-3-pro-image-preview in the context of this app's requirements.
    const requestLabel = isExpression ? 'Expression' : 'Movement';
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-image-preview',
      contents: {
        parts: [
          {
            text: `${SYSTEM_PROMPT}\n\nUser Request (${requestLabel}): ${userPrompt}`
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: cleanBase64
            }
          }
        ]
      },
      config: {
        imageConfig: {
            aspectRatio: "1:1",
            imageSize: "1K" // 1K is standard for sprites
        }
      }
    });

    // Extract image from response
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }

    throw new Error("No image generated in the response.");
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

/**
 * スプライトシートを分析して、各フレームの表情と顔パーツの座標を取得
 */
export interface FrameAnalysis {
  frameIndex: number; // 0-15
  eyesState: 'open' | 'closed';
  mouthState: 'open' | 'closed';
  emotion?: string; // 感情（happy, sad, surprised, neutral, etc.）
  faceRect?: {
    x: number; // 0-1 (normalized) - 顔全体の座標
    y: number;
    w: number;
    h: number;
  };
  eyesRect?: {
    x: number; // 0-1 (normalized)
    y: number;
    w: number;
    h: number;
  };
  mouthRect?: {
    x: number; // 0-1 (normalized)
    y: number;
    w: number;
    h: number;
  };
}

export interface SpriteSheetAnalysis {
  frames: FrameAnalysis[];
  recommendedEyesOpenFrame: number;
  recommendedEyesClosedFrame: number;
  recommendedMouthOpenFrame: number;
  recommendedMouthClosedFrame: number;
}

export const analyzeSpriteSheet = async (
  apiKey: string,
  spriteSheetBase64: string
): Promise<SpriteSheetAnalysis> => {
  const ai = new GoogleGenAI({ apiKey });
  
  // Strip prefix if present for API consumption
  const cleanBase64 = spriteSheetBase64.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, '');

  const analysisPrompt = `
この画像は4×4の16フレームのスプライトシートです。各フレームを分析して、以下の情報をJSON形式で返してください。

【分析要件】
1. 各フレーム（0-15、左→右、上→下の順）について：
   - 目の状態（open/closed）
   - 口の状態（open/closed）
   - 感情（happy, sad, surprised, neutral, angry, etc.）
   - 顔全体の位置とサイズ（正規化座標 0-1）- 顔の輪郭を含む領域
   - 目の位置とサイズ（正規化座標 0-1）
   - 口の位置とサイズ（正規化座標 0-1）

2. 推奨フレーム：
   - 最も目が開いているフレーム
   - 最も目が閉じているフレーム
   - 最も口が開いているフレーム
   - 最も口が閉じているフレーム

【出力形式】
以下のJSON形式で返してください：
{
  "frames": [
    {
      "frameIndex": 0,
      "eyesState": "open",
      "mouthState": "closed",
      "emotion": "happy",
      "faceRect": {"x": 0.2, "y": 0.1, "w": 0.6, "h": 0.5},
      "eyesRect": {"x": 0.25, "y": 0.2, "w": 0.5, "h": 0.15},
      "mouthRect": {"x": 0.3, "y": 0.55, "w": 0.4, "h": 0.05}
    },
    ...
  ],
  "recommendedEyesOpenFrame": 0,
  "recommendedEyesClosedFrame": 2,
  "recommendedMouthOpenFrame": 5,
  "recommendedMouthClosedFrame": 15
}

座標は正規化座標（0-1の範囲）で、画像の左上が(0,0)、右下が(1,1)です。
各フレームは正方形で、4×4のグリッドに分割されています。
faceRectは顔全体（輪郭を含む）の領域を指定してください。
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      contents: {
        parts: [
          {
            text: analysisPrompt
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: cleanBase64
            }
          }
        ]
      },
      config: {
        responseMimeType: 'application/json'
      }
    });

    // Extract JSON from response
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.text) {
          try {
            const analysis = JSON.parse(part.text) as SpriteSheetAnalysis;
            console.log('[analyzeSpriteSheet] 分析完了', analysis);
            return analysis;
          } catch (parseError) {
            console.error('[analyzeSpriteSheet] JSON解析エラー:', parseError, part.text);
            throw new Error('Failed to parse analysis response as JSON');
          }
        }
      }
    }

    throw new Error("No analysis data in the response.");
  } catch (error) {
    console.error("Gemini API Analysis Error:", error);
    throw error;
  }
};