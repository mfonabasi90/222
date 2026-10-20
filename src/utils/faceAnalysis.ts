import * as faceapi from 'face-api.js';

export interface FacialMetrics {
  // Eye metrics
  leftEyeAngle: number;
  rightEyeAngle: number;
  eyeAspectRatio: number;
  eyeDistance: number;
  eyeWidthRatio: number;

  // Nose metrics
  noseWidth: number;
  noseLength: number;
  noseAngle: number;
  noseTipY: number;

  // Mouth metrics
  mouthWidth: number;
  mouthHeight: number;
  mouthAspectRatio: number;

  // Face structure
  faceWidth: number;
  faceHeight: number;
  faceRatio: number;
  headTilt: number;
  jawAngle: number;

  // Cheek metrics
  leftCheekHeight: number;
  rightCheekHeight: number;
  cheekWidth: number;

  // Eyebrow metrics
  leftBrowAngle: number;
  rightBrowAngle: number;
  browDistance: number;
}

export interface Point {
  x: number;
  y: number;
}

export function calculateAngle(p1: Point, p2: Point): number {
  return Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);
}

export function calculateDistance(p1: Point, p2: Point): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

export function extractFacialMetrics(landmarks: faceapi.FaceLandmarks68): FacialMetrics {
  const positions = landmarks.positions;

  // Eye landmarks (36-41 left eye, 42-47 right eye)
  const leftEyeInner = positions[39];
  const leftEyeOuter = positions[36];
  const leftEyeTop = positions[37];
  const leftEyeBottom = positions[40];

  const rightEyeInner = positions[42];
  const rightEyeOuter = positions[45];
  const rightEyeTop = positions[43];
  const rightEyeBottom = positions[46];

  // Nose landmarks (27-35)
  const noseTop = positions[27];
  const noseBottom = positions[30];
  const noseLeft = positions[31];
  const noseRight = positions[35];

  // Mouth landmarks (48-67)
  const mouthLeft = positions[48];
  const mouthRight = positions[54];
  const mouthTop = positions[51];
  const mouthBottom = positions[57];

  // Jaw landmarks (0-16)
  const jawLeft = positions[2];
  const jawRight = positions[14];
  const jawCenter = positions[8];
  const chin = positions[8];

  // Eyebrow landmarks (17-26)
  const leftBrowInner = positions[17];
  const leftBrowOuter = positions[21];
  const rightBrowInner = positions[22];
  const rightBrowOuter = positions[26];

  // Calculate face boundaries
  const faceTop = positions[27]; // Bridge of nose (approximate top)
  const faceBottom = chin;
  const faceLeft = jawLeft;
  const faceRight = jawRight;

  // Eye angles (inner to outer corner)
  const leftEyeAngle = calculateAngle(leftEyeInner, leftEyeOuter);
  const rightEyeAngle = calculateAngle(rightEyeInner, rightEyeOuter);

  // Eye aspect ratio (height / width)
  const leftEyeWidth = calculateDistance(leftEyeInner, leftEyeOuter);
  const leftEyeHeight = calculateDistance(leftEyeTop, leftEyeBottom);
  const eyeAspectRatio = leftEyeHeight / leftEyeWidth;

  // Eye distance (between inner corners)
  const eyeDistance = calculateDistance(leftEyeInner, rightEyeInner);

  // Eye width ratio relative to face
  const faceWidth = calculateDistance(faceLeft, faceRight);
  const eyeWidthRatio = leftEyeWidth / faceWidth;

  // Nose metrics
  const noseWidth = calculateDistance(noseLeft, noseRight);
  const noseLength = calculateDistance(noseTop, noseBottom);
  const noseAngle = calculateAngle(noseTop, noseBottom);
  const faceHeight = calculateDistance(faceTop, faceBottom);
  const noseTipY = noseBottom.y / faceHeight;

  // Mouth metrics
  const mouthWidth = calculateDistance(mouthLeft, mouthRight);
  const mouthHeight = calculateDistance(mouthTop, mouthBottom);
  const mouthAspectRatio = mouthHeight / mouthWidth;

  // Face ratio
  const faceRatio = faceHeight / faceWidth;

  // Head tilt (using eye line)
  const eyeCenterLeft = { x: (leftEyeInner.x + leftEyeOuter.x) / 2, y: (leftEyeInner.y + leftEyeOuter.y) / 2 };
  const eyeCenterRight = { x: (rightEyeInner.x + rightEyeOuter.x) / 2, y: (rightEyeInner.y + rightEyeOuter.y) / 2 };
  const headTilt = calculateAngle(eyeCenterLeft, eyeCenterRight);

  // Jaw angle
  const jawAngleLeft = calculateAngle(jawLeft, jawCenter);
  const jawAngleRight = calculateAngle(jawRight, jawCenter);
  const jawAngle = Math.abs(jawAngleLeft - jawAngleRight);

  // Cheek metrics
  const leftCheek = positions[1];
  const rightCheek = positions[15];
  const leftCheekHeight = calculateDistance(leftCheek, { x: leftCheek.x, y: jawCenter.y });
  const rightCheekHeight = calculateDistance(rightCheek, { x: rightCheek.x, y: jawCenter.y });
  const cheekWidth = calculateDistance(leftCheek, rightCheek);

  // Eyebrow angles
  const leftBrowAngle = calculateAngle(leftBrowInner, leftBrowOuter);
  const rightBrowAngle = calculateAngle(rightBrowInner, rightBrowOuter);
  const browDistance = calculateDistance(leftBrowOuter, rightBrowInner);

  return {
    leftEyeAngle,
    rightEyeAngle,
    eyeAspectRatio,
    eyeDistance,
    eyeWidthRatio,
    noseWidth,
    noseLength,
    noseAngle,
    noseTipY,
    mouthWidth,
    mouthHeight,
    mouthAspectRatio,
    faceWidth,
    faceHeight,
    faceRatio,
    headTilt,
    jawAngle,
    leftCheekHeight,
    rightCheekHeight,
    cheekWidth,
    leftBrowAngle,
    rightBrowAngle,
    browDistance,
  };
}

export function calculateSimilarity(metrics1: FacialMetrics, metrics2: FacialMetrics): {
  overall: number;
  breakdown: { category: string; score: number; details: string }[];
} {
  const breakdown: { category: string; score: number; details: string }[] = [];

  // Normalize metrics by face proportions for comparison
  const normalize = (val: number, ref: number) => val / ref;

  // Eye similarity
  const eyeAngleDiff = Math.abs(metrics1.leftEyeAngle - metrics2.leftEyeAngle);
  const eyeAspectDiff = Math.abs(metrics1.eyeAspectRatio - metrics2.eyeAspectRatio);
  const eyeWidthDiff = Math.abs(metrics1.eyeWidthRatio - metrics2.eyeWidthRatio);
  const eyeScore = Math.max(0, 100 - (eyeAngleDiff * 2 + eyeAspectDiff * 200 + eyeWidthDiff * 200));
  breakdown.push({
    category: 'Eye Shape & Angle',
    score: Math.min(100, eyeScore),
    details: `Left eye angle: ${metrics1.leftEyeAngle.toFixed(1)}° vs ${metrics2.leftEyeAngle.toFixed(1)}°`
  });

  // Nose similarity
  const noseWidthNorm1 = normalize(metrics1.noseWidth, metrics1.faceWidth);
  const noseWidthNorm2 = normalize(metrics2.noseWidth, metrics2.faceWidth);
  const noseLenNorm1 = normalize(metrics1.noseLength, metrics1.faceHeight);
  const noseLenNorm2 = normalize(metrics2.noseLength, metrics2.faceHeight);
  const noseDiff = Math.abs(noseWidthNorm1 - noseWidthNorm2) + Math.abs(noseLenNorm1 - noseLenNorm2);
  const noseScore = Math.max(0, 100 - noseDiff * 300);
  breakdown.push({
    category: 'Nose Proportions',
    score: Math.min(100, noseScore),
    details: `Width ratio: ${(noseWidthNorm1 * 100).toFixed(1)}% vs ${(noseWidthNorm2 * 100).toFixed(1)}%`
  });

  // Mouth similarity
  const mouthAspectDiff = Math.abs(metrics1.mouthAspectRatio - metrics2.mouthAspectRatio);
  const mouthWidthNorm1 = normalize(metrics1.mouthWidth, metrics1.faceWidth);
  const mouthWidthNorm2 = normalize(metrics2.mouthWidth, metrics2.faceWidth);
  const mouthWidthDiff = Math.abs(mouthWidthNorm1 - mouthWidthNorm2);
  const mouthScore = Math.max(0, 100 - (mouthAspectDiff * 200 + mouthWidthDiff * 200));
  breakdown.push({
    category: 'Mouth Shape',
    score: Math.min(100, mouthScore),
    details: `Aspect ratio: ${metrics1.mouthAspectRatio.toFixed(3)} vs ${metrics2.mouthAspectRatio.toFixed(3)}`
  });

  // Face shape similarity
  const faceRatioDiff = Math.abs(metrics1.faceRatio - metrics2.faceRatio);
  const faceScore = Math.max(0, 100 - faceRatioDiff * 150);
  breakdown.push({
    category: 'Face Shape',
    score: Math.min(100, faceScore),
    details: `Width/Height ratio: ${metrics1.faceRatio.toFixed(3)} vs ${metrics2.faceRatio.toFixed(3)}`
  });

  // Head tilt similarity
  const tiltDiff = Math.abs(metrics1.headTilt - metrics2.headTilt);
  const tiltScore = Math.max(0, 100 - tiltDiff * 3);
  breakdown.push({
    category: 'Head Tilt',
    score: Math.min(100, tiltScore),
    details: `Tilt: ${metrics1.headTilt.toFixed(1)}° vs ${metrics2.headTilt.toFixed(1)}°`
  });

  // Cheek similarity
  const cheekNorm1 = normalize(metrics1.cheekWidth, metrics1.faceWidth);
  const cheekNorm2 = normalize(metrics2.cheekWidth, metrics2.faceWidth);
  const cheekDiff = Math.abs(cheekNorm1 - cheekNorm2);
  const cheekScore = Math.max(0, 100 - cheekDiff * 300);
  breakdown.push({
    category: 'Cheek Structure',
    score: Math.min(100, cheekScore),
    details: `Cheek width ratio: ${(cheekNorm1 * 100).toFixed(1)}% vs ${(cheekNorm2 * 100).toFixed(1)}%`
  });

  // Eyebrow similarity
  const browAngleDiff = Math.abs(metrics1.leftBrowAngle - metrics2.leftBrowAngle);
  const browScore = Math.max(0, 100 - browAngleDiff * 2);
  breakdown.push({
    category: 'Eyebrow Angle',
    score: Math.min(100, browScore),
    details: `Brow angle: ${metrics1.leftBrowAngle.toFixed(1)}° vs ${metrics2.leftBrowAngle.toFixed(1)}°`
  });

  // Jaw similarity
  const jawDiff = Math.abs(metrics1.jawAngle - metrics2.jawAngle);
  const jawScore = Math.max(0, 100 - jawDiff * 1.5);
  breakdown.push({
    category: 'Jaw Structure',
    score: Math.min(100, jawScore),
    details: `Jaw angle: ${metrics1.jawAngle.toFixed(1)}° vs ${metrics2.jawAngle.toFixed(1)}°`
  });

  // Overall score (weighted average)
  const weights = [1.2, 1.0, 1.0, 1.3, 0.8, 0.9, 0.8, 1.1];
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const overall = breakdown.reduce((sum, item, i) => sum + item.score * weights[i], 0) / totalWeight;

  return {
    overall: Math.round(overall),
    breakdown,
  };
}
