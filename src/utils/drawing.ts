/**
 * drawing.ts — Canvas overlays for pose-normalized analysis
 * 
 * Shows: landmarks, pose axes, occlusion regions, quality indicators,
 * measurement lines — all in the canonical (roll-corrected) frame.
 */

import { Point, Pose, distance, midpoint } from './geometry';
import { OcclusionMap } from './metrics';

export interface DrawOptions {
  showLandmarks: boolean;
  showPoseAxes: boolean;
  showEyeAngles: boolean;
  showNoseLines: boolean;
  showMouthLines: boolean;
  showJawLine: boolean;
  showOcclusion: boolean;
  showMeasurements: boolean;
  showQualityIndicators: boolean;
}

const COLORS = {
  landmarks: '#00ff88',
  landmarksDim: '#00ff8844',
  poseAxis: '#ffd93d',
  eyeAngle: '#ff6b6b',
  nose: '#6bcfff',
  mouth: '#ff9ff3',
  jaw: '#a29bfe',
  occlusion: '#ff000066',
  occlusionBorder: '#ff0000',
  measurement: '#dfe6e9',
  qualityGood: '#4ade80',
  qualityFair: '#fbbf24',
  qualityPoor: '#f87171',
  qualityOccluded: '#6b7280',
  text: '#ffffff',
};

export function drawFaceAnalysis(
  ctx: CanvasRenderingContext2D,
  landmarks: Point[],
  canonicalLandmarks: Point[],
  pose: Pose,
  occlusion: OcclusionMap,
  options: DrawOptions,
  imageWidth: number,
  imageHeight: number
) {
  if (options.showOcclusion) {
    drawOcclusionRegions(ctx, landmarks, occlusion);
  }

  // All feature overlays are drawn in the CANONICAL (pose-corrected) frame so
  // that displayed angles/lines reflect the upright, centered face.
  if (options.showLandmarks) {
    drawLandmarks(ctx, landmarks, canonicalLandmarks);
  }

  if (options.showPoseAxes) {
    drawPoseAxes(ctx, landmarks, pose);
  }

  if (options.showEyeAngles) {
    drawEyeAngles(ctx, canonicalLandmarks);
  }

  if (options.showNoseLines) {
    drawNoseAnalysis(ctx, canonicalLandmarks);
  }

  if (options.showMouthLines) {
    drawMouthAnalysis(ctx, canonicalLandmarks);
  }

  if (options.showJawLine) {
    drawJawLine(ctx, canonicalLandmarks);
  }

  if (options.showMeasurements) {
    drawMeasurements(ctx, canonicalLandmarks, imageWidth, imageHeight);
  }

  if (options.showQualityIndicators) {
    drawQualityIndicators(ctx, canonicalLandmarks, occlusion);
  }
}

function drawLandmarks(ctx: CanvasRenderingContext2D, original: Point[], canonical: Point[]) {
  // Draw original landmarks dimly
  ctx.fillStyle = COLORS.landmarksDim;
  original.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.5, 0, 2 * Math.PI);
    ctx.fill();
  });

  // Draw canonical landmarks brightly (these are what we measure from)
  ctx.fillStyle = COLORS.landmarks;
  canonical.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2.5, 0, 2 * Math.PI);
    ctx.fill();
  });
}

function drawPoseAxes(ctx: CanvasRenderingContext2D, landmarks: Point[], pose: Pose) {
  const eyeCenter = midpoint(landmarks[36], landmarks[45]);

  // Draw the measured (tilted) inter-ocular axis — this is what we correct away
  const tiltedAxisLen = Math.max(60, distance(landmarks[36], landmarks[45]) * 0.7);
  const rollRad = (pose.roll * Math.PI) / 180;
  ctx.strokeStyle = '#ffffff44';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(eyeCenter.x - tiltedAxisLen * Math.cos(rollRad), eyeCenter.y - tiltedAxisLen * Math.sin(rollRad));
  ctx.lineTo(eyeCenter.x + tiltedAxisLen * Math.cos(rollRad), eyeCenter.y + tiltedAxisLen * Math.sin(rollRad));
  ctx.stroke();

  // Draw corrected horizontal axis (level reference after de-rotation)
  ctx.strokeStyle = COLORS.poseAxis;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(eyeCenter.x - tiltedAxisLen, eyeCenter.y);
  ctx.lineTo(eyeCenter.x + tiltedAxisLen, eyeCenter.y);
  ctx.stroke();

  // Draw roll arc between the two axes
  ctx.strokeStyle = COLORS.poseAxis;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const arcRadius = 40;
  ctx.arc(eyeCenter.x, eyeCenter.y, arcRadius, 0, rollRad, rollRad > 0);
  ctx.stroke();

  // Vertical axis
  ctx.strokeStyle = COLORS.poseAxis + '88';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(eyeCenter.x, eyeCenter.y - 60);
  ctx.lineTo(eyeCenter.x, eyeCenter.y + 60);
  ctx.stroke();
  ctx.setLineDash([]);

  // Pose label
  ctx.fillStyle = COLORS.poseAxis;
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`Roll: ${pose.roll.toFixed(1)}°`, eyeCenter.x + 45, eyeCenter.y - 20);
  ctx.fillText(`Yaw: ${pose.yaw.toFixed(1)}°`, eyeCenter.x + 45, eyeCenter.y - 6);
  ctx.fillText(`Pitch: ${pose.pitch.toFixed(1)}°`, eyeCenter.x + 45, eyeCenter.y + 8);

  // Confidence indicator
  const confColor = pose.confidence > 0.7 ? COLORS.qualityGood : pose.confidence > 0.4 ? COLORS.qualityFair : COLORS.qualityPoor;
  ctx.fillStyle = confColor;
  ctx.fillText(`Pose conf: ${(pose.confidence * 100).toFixed(0)}%`, eyeCenter.x + 45, eyeCenter.y + 22);
}

function drawOcclusionRegions(ctx: CanvasRenderingContext2D, landmarks: Point[], occlusion: OcclusionMap) {
  ctx.fillStyle = COLORS.occlusion;
  ctx.strokeStyle = COLORS.occlusionBorder;
  ctx.lineWidth = 2;

  if (occlusion.leftEye) {
    drawRegionBox(ctx, landmarks.slice(36, 42), 'LEFT EYE OCCLUDED');
  }
  if (occlusion.rightEye) {
    drawRegionBox(ctx, landmarks.slice(42, 48), 'RIGHT EYE OCCLUDED');
  }
  if (occlusion.nose) {
    drawRegionBox(ctx, landmarks.slice(27, 36), 'NOSE OCCLUDED');
  }
  if (occlusion.mouth) {
    drawRegionBox(ctx, landmarks.slice(48, 68), 'MOUTH OCCLUDED');
  }
  if (occlusion.jaw) {
    drawRegionBox(ctx, landmarks.slice(0, 17), 'JAW OCCLUDED');
  }
}

function drawRegionBox(ctx: CanvasRenderingContext2D, points: Point[], label: string) {
  if (points.length === 0) return;

  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const padding = 12;
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  const maxX = Math.max(...xs) + padding;
  const maxY = Math.max(...ys) + padding;

  // Semi-transparent fill
  ctx.fillStyle = COLORS.occlusion;
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);

  // Border
  ctx.strokeStyle = COLORS.occlusionBorder;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);
  ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
  ctx.setLineDash([]);

  // Label
  ctx.fillStyle = COLORS.occlusionBorder;
  ctx.font = 'bold 10px monospace';
  ctx.fillText(label, minX, minY - 4);
}

function drawEyeAngles(ctx: CanvasRenderingContext2D, lm: Point[]) {
  // Draw eye outlines
  drawEyeOutline(ctx, lm.slice(36, 42));
  drawEyeOutline(ctx, lm.slice(42, 48));

  // Draw canthal tilt lines (inner to outer corner) — in canonical frame
  ctx.strokeStyle = COLORS.eyeAngle;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);

  // Left eye: inner (39) to outer (36)
  ctx.beginPath();
  ctx.moveTo(lm[39].x, lm[39].y);
  ctx.lineTo(lm[36].x, lm[36].y);
  ctx.stroke();

  // Right eye: inner (42) to outer (45)
  ctx.beginPath();
  ctx.moveTo(lm[42].x, lm[42].y);
  ctx.lineTo(lm[45].x, lm[45].y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Crosshairs at corners
  [36, 39, 42, 45].forEach(idx => {
    drawCrosshair(ctx, lm[idx], COLORS.eyeAngle);
  });
}

function drawEyeOutline(ctx: CanvasRenderingContext2D, points: Point[]) {
  ctx.strokeStyle = COLORS.eyeAngle;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawCrosshair(ctx: CanvasRenderingContext2D, point: Point, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  const size = 5;
  ctx.beginPath();
  ctx.moveTo(point.x - size, point.y);
  ctx.lineTo(point.x + size, point.y);
  ctx.moveTo(point.x, point.y - size);
  ctx.lineTo(point.x, point.y + size);
  ctx.stroke();
}

function drawNoseAnalysis(ctx: CanvasRenderingContext2D, lm: Point[]) {
  // Nose bridge
  ctx.strokeStyle = COLORS.nose;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lm[27].x, lm[27].y);
  ctx.lineTo(lm[30].x, lm[30].y);
  ctx.stroke();

  // Nose wings
  ctx.beginPath();
  ctx.moveTo(lm[31].x, lm[31].y);
  for (let i = 32; i <= 35; i++) {
    ctx.lineTo(lm[i].x, lm[i].y);
  }
  ctx.stroke();

  // Width indicator
  ctx.strokeStyle = COLORS.nose;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(lm[31].x, lm[31].y + 8);
  ctx.lineTo(lm[35].x, lm[35].y + 8);
  ctx.stroke();
  ctx.setLineDash([]);

  // Labels
  ctx.fillStyle = COLORS.nose;
  ctx.font = '10px monospace';
  ctx.fillText('W', (lm[31].x + lm[35].x) / 2 - 3, lm[31].y + 20);
}

function drawMouthAnalysis(ctx: CanvasRenderingContext2D, lm: Point[]) {
  // Outer lip
  ctx.strokeStyle = COLORS.mouth;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(lm[48].x, lm[48].y);
  for (let i = 49; i <= 59; i++) {
    ctx.lineTo(lm[i].x, lm[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  // Inner lip
  ctx.beginPath();
  ctx.moveTo(lm[60].x, lm[60].y);
  for (let i = 61; i <= 67; i++) {
    ctx.lineTo(lm[i].x, lm[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  // Width indicator
  ctx.strokeStyle = COLORS.mouth;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(lm[48].x, lm[48].y + 12);
  ctx.lineTo(lm[54].x, lm[54].y + 12);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawJawLine(ctx: CanvasRenderingContext2D, lm: Point[]) {
  ctx.strokeStyle = COLORS.jaw;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lm[0].x, lm[0].y);
  for (let i = 1; i <= 16; i++) {
    ctx.lineTo(lm[i].x, lm[i].y);
  }
  ctx.stroke();

  // Jaw angle arc at chin
  const chin = lm[8];
  const left = lm[2];
  const right = lm[14];
  const a1 = Math.atan2(left.y - chin.y, left.x - chin.x);
  const a2 = Math.atan2(right.y - chin.y, right.x - chin.x);

  ctx.strokeStyle = COLORS.jaw;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(chin.x, chin.y, 20, a1, a2);
  ctx.stroke();
}

function drawMeasurements(ctx: CanvasRenderingContext2D, lm: Point[], _imgW: number, _imgH: number) {
  const faceTop = lm[27];
  const chin = lm[8];
  const jawLeft = lm[2];
  const jawRight = lm[14];

  // Height line (right side)
  ctx.strokeStyle = COLORS.measurement;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  const rightOffset = 35;
  ctx.beginPath();
  ctx.moveTo(jawRight.x + rightOffset, faceTop.y);
  ctx.lineTo(jawRight.x + rightOffset, chin.y);
  ctx.stroke();

  // Width line (bottom)
  const bottomOffset = 25;
  ctx.beginPath();
  ctx.moveTo(jawLeft.x, chin.y + bottomOffset);
  ctx.lineTo(jawRight.x, chin.y + bottomOffset);
  ctx.stroke();
  ctx.setLineDash([]);

  // Labels
  ctx.fillStyle = COLORS.text;
  ctx.font = '10px monospace';
  const faceHeight = distance(faceTop, chin);
  const faceWidth = distance(jawLeft, jawRight);
  ctx.fillText(`H:${faceHeight.toFixed(0)}px`, jawRight.x + rightOffset + 5, (faceTop.y + chin.y) / 2);
  ctx.fillText(`W:${faceWidth.toFixed(0)}px`, (jawLeft.x + jawRight.x) / 2 - 20, chin.y + bottomOffset + 15);
  ctx.fillText(`H/W:${(faceHeight / faceWidth).toFixed(2)}`, jawRight.x + rightOffset + 5, (faceTop.y + chin.y) / 2 + 14);
}

function drawQualityIndicators(ctx: CanvasRenderingContext2D, landmarks: Point[], occlusion: OcclusionMap) {
  const indicators: { pos: Point; quality: 'good' | 'fair' | 'poor' | 'occluded' }[] = [
    { pos: midpoint(landmarks[36], landmarks[41]), quality: occlusion.leftEye ? 'occluded' : 'good' },
    { pos: midpoint(landmarks[42], landmarks[47]), quality: occlusion.rightEye ? 'occluded' : 'good' },
    { pos: landmarks[30], quality: occlusion.nose ? 'occluded' : 'good' },
    { pos: midpoint(landmarks[48], landmarks[54]), quality: occlusion.mouth ? 'occluded' : 'good' },
    { pos: landmarks[8], quality: occlusion.jaw ? 'occluded' : 'good' },
  ];

  indicators.forEach(({ pos, quality }) => {
    const color = quality === 'good' ? COLORS.qualityGood
      : quality === 'fair' ? COLORS.qualityFair
      : quality === 'occluded' ? COLORS.qualityOccluded
      : COLORS.qualityPoor;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y - 12, 4, 0, 2 * Math.PI);
    ctx.fill();

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y - 12, 4, 0, 2 * Math.PI);
    ctx.stroke();
  });
}
