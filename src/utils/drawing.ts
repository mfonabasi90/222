import * as faceapi from 'face-api.js';
import { Point, calculateAngle } from './faceAnalysis';

export interface DrawOptions {
  showLandmarks: boolean;
  showEyeAngles: boolean;
  showHeadTilt: boolean;
  showNoseLines: boolean;
  showMouthLines: boolean;
  showCheekPoints: boolean;
  showJawLine: boolean;
  showBrowAngles: boolean;
  showMeasurements: boolean;
}

const COLORS = {
  landmarks: '#00ff88',
  eyeAngle: '#ff6b6b',
  headTilt: '#ffd93d',
  nose: '#6bcfff',
  mouth: '#ff9ff3',
  cheek: '#feca57',
  jaw: '#a29bfe',
  brow: '#fd79a8',
  measurement: '#dfe6e9',
  text: '#ffffff',
  angle: '#ff6b6b',
};

export function drawFaceAnalysis(
  ctx: CanvasRenderingContext2D,
  landmarks: faceapi.FaceLandmarks68,
  options: DrawOptions,
  imageWidth: number,
  imageHeight: number
) {
  const positions = landmarks.positions;

  if (options.showLandmarks) {
    drawLandmarks(ctx, positions);
  }

  if (options.showEyeAngles) {
    drawEyeAngles(ctx, positions);
  }

  if (options.showHeadTilt) {
    drawHeadTilt(ctx, positions);
  }

  if (options.showNoseLines) {
    drawNoseAnalysis(ctx, positions);
  }

  if (options.showMouthLines) {
    drawMouthAnalysis(ctx, positions);
  }

  if (options.showCheekPoints) {
    drawCheekPoints(ctx, positions);
  }

  if (options.showJawLine) {
    drawJawLine(ctx, positions);
  }

  if (options.showBrowAngles) {
    drawBrowAngles(ctx, positions);
  }

  if (options.showMeasurements) {
    drawMeasurements(ctx, positions, imageWidth, imageHeight);
  }
}

function drawLandmarks(ctx: CanvasRenderingContext2D, positions: { x: number; y: number }[]) {
  ctx.fillStyle = COLORS.landmarks;
  positions.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
    ctx.fill();
  });
}

function drawEyeAngles(ctx: CanvasRenderingContext2D, positions: { x: number; y: number }[]) {
  // Left eye (36-41)
  const leftInner = positions[39];
  const leftOuter = positions[36];
  const leftTop = positions[37];
  const leftBottom = positions[40];

  // Right eye (42-47)
  const rightInner = positions[42];
  const rightOuter = positions[45];
  const rightTop = positions[43];
  const rightBottom = positions[46];

  ctx.strokeStyle = COLORS.eyeAngle;
  ctx.lineWidth = 2;

  // Left eye outline
  drawEyeOutline(ctx, [positions[36], positions[37], positions[38], positions[39], positions[40], positions[41]]);

  // Right eye outline
  drawEyeOutline(ctx, [positions[42], positions[43], positions[44], positions[45], positions[46], positions[47]]);

  // Left eye angle line
  ctx.beginPath();
  ctx.setLineDash([5, 3]);
  ctx.moveTo(leftInner.x, leftInner.y);
  ctx.lineTo(leftOuter.x, leftOuter.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Right eye angle line
  ctx.beginPath();
  ctx.setLineDash([5, 3]);
  ctx.moveTo(rightInner.x, rightInner.y);
  ctx.lineTo(rightOuter.x, rightOuter.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw angle arcs and labels
  const leftAngle = calculateAngle(leftInner, leftOuter);
  const rightAngle = calculateAngle(rightInner, rightOuter);

  drawAngleArc(ctx, leftInner, leftOuter, leftAngle, 'L');
  drawAngleArc(ctx, rightInner, rightOuter, rightAngle, 'R');

  // Draw crosshair at eye centers
  drawCrosshair(ctx, leftInner, COLORS.eyeAngle);
  drawCrosshair(ctx, leftOuter, COLORS.eyeAngle);
  drawCrosshair(ctx, rightInner, COLORS.eyeAngle);
  drawCrosshair(ctx, rightOuter, COLORS.eyeAngle);

  // Height indicators
  ctx.strokeStyle = COLORS.eyeAngle;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);

  // Left eye height
  ctx.beginPath();
  ctx.moveTo(leftTop.x, leftTop.y);
  ctx.lineTo(leftBottom.x, leftBottom.y);
  ctx.stroke();

  // Right eye height
  ctx.beginPath();
  ctx.moveTo(rightTop.x, rightTop.y);
  ctx.lineTo(rightBottom.x, rightBottom.y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawEyeOutline(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[]) {
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

function drawAngleArc(ctx: CanvasRenderingContext2D, p1: Point, p2: Point, angle: number, label: string) {
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;

  ctx.fillStyle = COLORS.angle;
  ctx.font = 'bold 11px monospace';
  ctx.fillText(`${angle.toFixed(1)}°`, midX + 5, midY - 8);
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

function drawHeadTilt(ctx: CanvasRenderingContext2D, positions: { x: number; y: number }[]) {
  // Eye centers
  const leftEyeCenter = {
    x: (positions[36].x + positions[39].x) / 2,
    y: (positions[36].y + positions[39].y) / 2,
  };
  const rightEyeCenter = {
    x: (positions[42].x + positions[45].x) / 2,
    y: (positions[42].y + positions[45].y) / 2,
  };

  const tiltAngle = calculateAngle(leftEyeCenter, rightEyeCenter);

  // Draw horizontal reference line
  ctx.strokeStyle = COLORS.headTilt;
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 4]);
  ctx.beginPath();
  ctx.moveTo(leftEyeCenter.x - 50, leftEyeCenter.y);
  ctx.lineTo(rightEyeCenter.x + 50, rightEyeCenter.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw eye line
  ctx.strokeStyle = COLORS.headTilt;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftEyeCenter.x, leftEyeCenter.y);
  ctx.lineTo(rightEyeCenter.x, rightEyeCenter.y);
  ctx.stroke();

  // Draw angle arc
  ctx.strokeStyle = COLORS.headTilt;
  ctx.lineWidth = 2;
  const centerX = (leftEyeCenter.x + rightEyeCenter.x) / 2;
  const centerY = (leftEyeCenter.y + rightEyeCenter.y) / 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, 30, 0, (tiltAngle * Math.PI) / 180, tiltAngle < 0);
  ctx.stroke();

  // Label
  ctx.fillStyle = COLORS.headTilt;
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`Tilt: ${tiltAngle.toFixed(1)}°`, centerX + 35, centerY - 15);
}

function drawNoseAnalysis(ctx: CanvasRenderingContext2D, positions: { x: number; y: number }[]) {
  // Nose bridge (27-30)
  const noseBridge = [positions[27], positions[28], positions[29], positions[30]];
  const noseWings = [positions[31], positions[32], positions[33], positions[34], positions[35]];

  // Draw nose bridge line
  ctx.strokeStyle = COLORS.nose;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(noseBridge[0].x, noseBridge[0].y);
  for (let i = 1; i < noseBridge.length; i++) {
    ctx.lineTo(noseBridge[i].x, noseBridge[i].y);
  }
  ctx.stroke();

  // Draw nose wing line
  ctx.beginPath();
  ctx.moveTo(noseWings[0].x, noseWings[0].y);
  for (let i = 1; i < noseWings.length; i++) {
    ctx.lineTo(noseWings[i].x, noseWings[i].y);
  }
  ctx.stroke();

  // Nose width indicator
  ctx.strokeStyle = COLORS.nose;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(positions[31].x, positions[31].y);
  ctx.lineTo(positions[35].x, positions[35].y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Nose length indicator
  ctx.beginPath();
  ctx.moveTo(positions[27].x + 15, positions[27].y);
  ctx.lineTo(positions[27].x + 15, positions[30].y);
  ctx.stroke();

  // Arrow heads
  drawArrowHead(ctx, positions[27].x + 15, positions[27].y, 'up', COLORS.nose);
  drawArrowHead(ctx, positions[27].x + 15, positions[30].y, 'down', COLORS.nose);

  // Label
  ctx.fillStyle = COLORS.nose;
  ctx.font = '10px monospace';
  ctx.fillText('W', positions[31].x - 15, positions[31].y + 4);
  ctx.fillText('W', positions[35].x + 5, positions[35].y + 4);
  ctx.fillText('L', positions[27].x + 20, (positions[27].y + positions[30].y) / 2);
}

function drawMouthAnalysis(ctx: CanvasRenderingContext2D, positions: { x: number; y: number }[]) {
  // Outer lip (48-59)
  const outerLip = positions.slice(48, 60);
  const innerLip = positions.slice(60, 68);

  // Draw outer lip
  ctx.strokeStyle = COLORS.mouth;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(outerLip[0].x, outerLip[0].y);
  for (let i = 1; i < outerLip.length; i++) {
    ctx.lineTo(outerLip[i].x, outerLip[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  // Draw inner lip
  ctx.beginPath();
  ctx.moveTo(innerLip[0].x, innerLip[0].y);
  for (let i = 1; i < innerLip.length; i++) {
    ctx.lineTo(innerLip[i].x, innerLip[i].y);
  }
  ctx.closePath();
  ctx.stroke();

  // Width indicator
  ctx.strokeStyle = COLORS.mouth;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(positions[48].x, positions[48].y + 15);
  ctx.lineTo(positions[54].x, positions[54].y + 15);
  ctx.stroke();
  ctx.setLineDash([]);

  // Height indicator
  ctx.beginPath();
  ctx.moveTo(positions[51].x - 15, positions[51].y);
  ctx.lineTo(positions[57].x - 15, positions[57].y);
  ctx.stroke();

  // Labels
  ctx.fillStyle = COLORS.mouth;
  ctx.font = '10px monospace';
  ctx.fillText('W', (positions[48].x + positions[54].x) / 2 - 3, positions[48].y + 25);
  ctx.fillText('H', positions[51].x - 28, (positions[51].y + positions[57].y) / 2);
}

function drawCheekPoints(ctx: CanvasRenderingContext2D, positions: { x: number; y: number }[]) {
  const leftCheek = positions[1];
  const rightCheek = positions[15];
  const chin = positions[8];

  // Draw cheek points with circles
  ctx.fillStyle = COLORS.cheek;
  ctx.strokeStyle = COLORS.cheek;
  ctx.lineWidth = 2;

  // Left cheek
  ctx.beginPath();
  ctx.arc(leftCheek.x, leftCheek.y, 8, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(leftCheek.x, leftCheek.y, 3, 0, 2 * Math.PI);
  ctx.fill();

  // Right cheek
  ctx.beginPath();
  ctx.arc(rightCheek.x, rightCheek.y, 8, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(rightCheek.x, rightCheek.y, 3, 0, 2 * Math.PI);
  ctx.fill();

  // Cheek width line
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(leftCheek.x, leftCheek.y);
  ctx.lineTo(rightCheek.x, rightCheek.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Height lines from cheeks to chin level
  ctx.strokeStyle = COLORS.cheek;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(leftCheek.x, leftCheek.y);
  ctx.lineTo(leftCheek.x, chin.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(rightCheek.x, rightCheek.y);
  ctx.lineTo(rightCheek.x, chin.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Labels
  ctx.fillStyle = COLORS.cheek;
  ctx.font = 'bold 10px monospace';
  ctx.fillText('LC', leftCheek.x - 15, leftCheek.y - 12);
  ctx.fillText('RC', rightCheek.x + 5, rightCheek.y - 12);
}

function drawJawLine(ctx: CanvasRenderingContext2D, positions: { x: number; y: number }[]) {
  const jawPoints = positions.slice(0, 17);

  ctx.strokeStyle = COLORS.jaw;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(jawPoints[0].x, jawPoints[0].y);
  for (let i = 1; i < jawPoints.length; i++) {
    ctx.lineTo(jawPoints[i].x, jawPoints[i].y);
  }
  ctx.stroke();

  // Draw jaw angle indicators
  const leftJaw = positions[2];
  const chin = positions[8];
  const rightJaw = positions[14];

  // Left jaw angle
  ctx.strokeStyle = COLORS.jaw;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(leftJaw.x, leftJaw.y);
  ctx.lineTo(chin.x, chin.y);
  ctx.stroke();

  // Right jaw angle
  ctx.beginPath();
  ctx.moveTo(rightJaw.x, rightJaw.y);
  ctx.lineTo(chin.x, chin.y);
  ctx.stroke();

  // Angle arc at chin
  const angle1 = Math.atan2(leftJaw.y - chin.y, leftJaw.x - chin.x);
  const angle2 = Math.atan2(rightJaw.y - chin.y, rightJaw.x - chin.x);
  ctx.beginPath();
  ctx.arc(chin.x, chin.y, 15, angle1, angle2);
  ctx.stroke();
}

function drawBrowAngles(ctx: CanvasRenderingContext2D, positions: { x: number; y: number }[]) {
  // Left brow (17-21)
  const leftBrow = positions.slice(17, 22);
  const rightBrow = positions.slice(22, 27);

  // Draw left brow
  ctx.strokeStyle = COLORS.brow;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftBrow[0].x, leftBrow[0].y);
  for (let i = 1; i < leftBrow.length; i++) {
    ctx.lineTo(leftBrow[i].x, leftBrow[i].y);
  }
  ctx.stroke();

  // Draw right brow
  ctx.beginPath();
  ctx.moveTo(rightBrow[0].x, rightBrow[0].y);
  for (let i = 1; i < rightBrow.length; i++) {
    ctx.lineTo(rightBrow[i].x, rightBrow[i].y);
  }
  ctx.stroke();

  // Angle line from inner to outer
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(leftBrow[0].x, leftBrow[0].y);
  ctx.lineTo(leftBrow[4].x, leftBrow[4].y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(rightBrow[0].x, rightBrow[0].y);
  ctx.lineTo(rightBrow[4].x, rightBrow[4].y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Labels
  const leftAngle = calculateAngle(leftBrow[0], leftBrow[4]);
  const rightAngle = calculateAngle(rightBrow[0], rightBrow[4]);

  ctx.fillStyle = COLORS.brow;
  ctx.font = '10px monospace';
  ctx.fillText(`${leftAngle.toFixed(1)}°`, leftBrow[4].x + 5, leftBrow[4].y - 5);
  ctx.fillText(`${rightAngle.toFixed(1)}°`, rightBrow[4].x + 5, rightBrow[4].y - 5);
}

function drawMeasurements(ctx: CanvasRenderingContext2D, positions: { x: number; y: number }[], _imgW: number, _imgH: number) {
  const faceTop = positions[27];
  const chin = positions[8];
  const jawLeft = positions[2];
  const jawRight = positions[14];

  // Face height measurement
  ctx.strokeStyle = COLORS.measurement;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);

  // Right side height line
  const rightOffset = 30;
  ctx.beginPath();
  ctx.moveTo(jawRight.x + rightOffset, faceTop.y);
  ctx.lineTo(jawRight.x + rightOffset, chin.y);
  ctx.stroke();

  // Bottom width line
  const bottomOffset = 25;
  ctx.beginPath();
  ctx.moveTo(jawLeft.x, chin.y + bottomOffset);
  ctx.lineTo(jawRight.x, chin.y + bottomOffset);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arrow heads
  drawArrowHead(ctx, jawRight.x + rightOffset, faceTop.y, 'up', COLORS.measurement);
  drawArrowHead(ctx, jawRight.x + rightOffset, chin.y, 'down', COLORS.measurement);
  drawArrowHead(ctx, jawLeft.x, chin.y + bottomOffset, 'left', COLORS.measurement);
  drawArrowHead(ctx, jawRight.x, chin.y + bottomOffset, 'right', COLORS.measurement);

  // Labels
  ctx.fillStyle = COLORS.text;
  ctx.font = '10px monospace';
  const faceHeight = Math.sqrt(Math.pow(chin.x - faceTop.x, 2) + Math.pow(chin.y - faceTop.y, 2));
  const faceWidth = Math.sqrt(Math.pow(jawRight.x - jawLeft.x, 2) + Math.pow(jawRight.y - jawLeft.y, 2));

  ctx.fillText(`H: ${faceHeight.toFixed(0)}px`, jawRight.x + rightOffset + 5, (faceTop.y + chin.y) / 2);
  ctx.fillText(`W: ${faceWidth.toFixed(0)}px`, (jawLeft.x + jawRight.x) / 2 - 20, chin.y + bottomOffset + 15);
}

function drawArrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, direction: string, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  const size = 5;
  switch (direction) {
    case 'up':
      ctx.moveTo(x, y);
      ctx.lineTo(x - size, y + size);
      ctx.lineTo(x + size, y + size);
      break;
    case 'down':
      ctx.moveTo(x, y);
      ctx.lineTo(x - size, y - size);
      ctx.lineTo(x + size, y - size);
      break;
    case 'left':
      ctx.moveTo(x, y);
      ctx.lineTo(x + size, y - size);
      ctx.lineTo(x + size, y + size);
      break;
    case 'right':
      ctx.moveTo(x, y);
      ctx.lineTo(x - size, y - size);
      ctx.lineTo(x - size, y + size);
      break;
  }
  ctx.closePath();
  ctx.fill();
}
